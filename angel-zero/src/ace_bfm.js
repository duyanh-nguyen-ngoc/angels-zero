// ANGELS ZERO — shared bank-to-turn integrator + ace BFM state machine.
// Extracted from combat.js; zero per-frame allocations (module scratch only).
export function createAceBFM(THREE, env) {
  const { S, C, enemies, groundLevel, clamp, D2R, rand, banditFlares, fire, spo,
    G0, YOYO_PITCH, YOYO_T, YOYO_E_MARGIN, YOYO_AOFF, YOYO_CLOSE,
    SCIS_R, SCIS_PLAYER_COS, SCIS_FLIP_T, SCIS_G, SCIS_V, COBRA_V, PSM_CD,
    PAIR_SPLIT, PAIR_CONVERGE_R, wrapPi, pFwd } = env;

  /* ---------------------------------------------------------------------------
     Shared bank-to-turn jet integrator. Used by wingmen (enemies keep their
     tuned combat integrator in updateEnemy). All scratch is module-level:
     zero allocations per frame. `lim` is a preallocated constant object.
     --------------------------------------------------------------------------- */
  const _btDir = new THREE.Vector3(), _btPerp = new THREE.Vector3(), _btUp = new THREE.Vector3(),
    _btRight = new THREE.Vector3(), _btLift = new THREE.Vector3(), _btAcc = new THREE.Vector3(),
    _btAhead = new THREE.Vector3(), _btF = new THREE.Vector3(), _btOrg = new THREE.Vector3(),
    _btQ = new THREE.Quaternion(), _btM = new THREE.Matrix4(), _btZax = new THREE.Vector3(0, 0, 1);
  function flyBTT(a, desDir, desSpeed, dt, lim) {
    const G = 9.81, v0 = Math.max(a.speed || 100, 60);
    desSpeed = Math.max(desSpeed, lim.vMin || 100);
    _btDir.copy(desDir);
    // Terrain look-ahead: blend the demand upward before the predicted path hits the floor.
    const minAGL = lim.minAGL || 0;
    if (minAGL > 0) {
      _btAhead.copy(a.fwd).multiplyScalar(Math.min(v0 * 2, 700)).add(a.pos);
      const curFloor = groundLevel(a.pos.x, a.pos.z);
      const aheadFloor = groundLevel(_btAhead.x, _btAhead.z) + minAGL;
      if (a.pos.y < curFloor + minAGL * 0.5 && a.fwd.y < 0.25) _btDir.y = Math.max(_btDir.y, 0.35);
      else if (aheadFloor > a.pos.y && a.fwd.y < 0.15) _btDir.y += clamp((aheadFloor - a.pos.y) / 400, 0, 0.5);
    }
    _btDir.normalize();
    const cosA = clamp(a.fwd.dot(_btDir), -1, 1), ang = Math.acos(cosA);
    _btPerp.copy(_btDir).addScaledVector(a.fwd, -cosA);
    if (_btPerp.lengthSq() < 1e-8) _btPerp.copy(_btUp.set(0, 1, 0)); else _btPerp.normalize();
    _btUp.set(0, 1, 0);
    _btRight.crossVectors(a.fwd, _btUp);
    if (_btRight.lengthSq() < 1e-6) _btRight.set(1, 0, 0); else _btRight.normalize();
    const maxG = lim.maxG || 6, rollRate = lim.rollRate || 2.6;
    const omega = Math.min(ang * 1.4, (maxG * G) / v0);
    const bankT = clamp(Math.atan2(-_btPerp.dot(_btRight), _btPerp.dot(_btUp)), -1.4, 1.4);
    const err = wrapPi(bankT - (a.bank || 0)), dB = clamp(err, -rollRate * dt, rollRate * dt);
    a.bank = wrapPi((a.bank || 0) + dB);
    _btLift.copy(_btUp).multiplyScalar(Math.cos(a.bank)).addScaledVector(_btRight, -Math.sin(a.bank));
    const n = clamp(omega * v0, 0, maxG * G);
    a.gNow = n / G;
    _btAcc.copy(_btLift).multiplyScalar(n).addScaledVector(_btUp, -G);
    a.fwd.addScaledVector(_btAcc, dt / v0).normalize();
    // Throttle lag + induced drag; afterburner only when the demand is large.
    const dv = desSpeed - a.speed;
    const rate = dv > 0 ? (lim.accAB || lim.acc || 9) : (lim.dec || 14);
    const induced = 0.08 * Math.max(0, a.gNow * a.gNow - 1);
    a.speed += clamp(dv, -rate * dt, rate * dt) - induced * dt;
    a.speed = clamp(a.speed, 60, lim.vMax || 340);
    a.ab = dv > 25 ? 1 : Math.max(0, (a.ab || 0) - dt);
    _btM.lookAt(_btOrg, a.fwd, _btUp);
    a.quat.setFromRotationMatrix(_btM).multiply(_btQ.setFromAxisAngle(_btZax, a.bank));
    a.vel.copy(a.fwd).multiplyScalar(a.speed);
    a.pos.addScaledVector(a.vel, dt);
    if (minAGL > 0) {
      const floorY = groundLevel(a.pos.x, a.pos.z) + 10;
      if (a.pos.y < floorY) {
        a.pos.y = floorY;
        a.fwd.y = Math.max(a.fwd.y, 0.15); a.fwd.normalize();
      }
    }
    return Math.abs(a.gNow);
  }

  // ---- Ace BFM: preallocated output struct + scratch (no per-frame allocation).
  const _bfmOut = { maxG: 0, useAB: false, bankOverride: null, desSpeed: 0 };
  const _bfmDir = new THREE.Vector3(), _bfmUp = new THREE.Vector3(), _bfmRight = new THREE.Vector3(),
    _bfmLead = new THREE.Vector3(), _bfmLos = new THREE.Vector3(), _bfmMate = new THREE.Vector3(),
    _bfmAim = new THREE.Vector3(), _bfmRel = new THREE.Vector3();
  function aceEnergy(a) {
    const p = a.pos || a.position, v = a.vel || a.velocity;
    const sp = v ? v.lengthSq() : (a.speed || 0) * (a.speed || 0);
    return (p ? p.y : 0) + sp / (2 * G0);
  }
  function enemyCM(e, kind, seduce) {
    if (kind === 'FLARE') {
      if (e.decoys > 0) { banditFlares(e); e.decoys--; }
    } else if (e.decoys > 0 && e.chaffN > 0) {
      e.chaffN--;
      for (let i = 0; i < 36; i++) {
        fire.spawn(spo(e.pos.x + (rand() - 0.5) * 10, e.pos.y + (rand() - 0.5) * 8, e.pos.z + (rand() - 0.5) * 10, (rand() - 0.5) * 14, (rand() - 0.5) * 8, (rand() - 0.5) * 14, 0.7 + rand(), 0.7, 0.25, 0.76, 0.76, 0.78, 0.75, 2.8));
      }
    }
    if (env.debug) console.log('[ANGELS_ZERO] ace cm kind=' + kind + ' seduced=' + !!seduce);
  }
  // Returns true when a BFM state overrode the normal combat AI for this frame.
  function aceBFM(e, dt, toP, dist, playerActive, desired, out) {
    if (!(e.aceFlight || e.ace || e.isAce) || !playerActive) return false;
    if (!e.bfm) e.bfm = { st: 'ENGAGE', t: 0, phase: '', flip: 1, flipT: 0, pairT: 0, role: 'LEAD' };
    const B = e.bfm;
    B.t += dt; B.flipT -= dt;
    pFwd.set(0, 0, -1).applyQuaternion(S.quaternion);
    _bfmLos.copy(toP).normalize();
    _bfmAim.copy(_bfmLos).negate();                       // ace -> player unit vector
    const playerOn = pFwd.dot(_bfmAim) > SCIS_PLAYER_COS;  // player nose at the ace
    const behind = e.fwd.dot(_bfmLos) < 0;
    const aceOn = e.fwd.dot(_bfmLos) > Math.cos(60 * D2R);
    _bfmRel.copy(S.velocity).sub(e.vel);
    const closure = -_bfmRel.dot(_bfmLos);
    const Ea = aceEnergy(e), Ep = aceEnergy(S), dE = Ea - Ep;
    let changed = false;
    // State priority: scissors > Cobra > high yo-yo > normal engagement.
    if (B.st === 'BREAK_SCISSORS' && B.t > 5) { B.st = 'ENGAGE'; changed = true; }
    if (behind && dist < SCIS_R && playerOn && B.st !== 'BREAK_SCISSORS') { B.st = 'BREAK_SCISSORS'; B.t = 0; B.flip = rand() < 0.5 ? -1 : 1; B.flipT = SCIS_FLIP_T[0] + rand() * (SCIS_FLIP_T[1] - SCIS_FLIP_T[0]); changed = true; }
    if (B.st === 'BREAK_SCISSORS') {
      if (B.flipT <= 0) { B.flip = -B.flip; B.flipT = SCIS_FLIP_T[0] + rand() * (SCIS_FLIP_T[1] - SCIS_FLIP_T[0]); }
      _bfmUp.set(0, 1, 0);
      _bfmRight.crossVectors(e.fwd, _bfmUp).normalize();
      desired.copy(e.fwd).addScaledVector(_bfmRight, B.flip * 0.9).addScaledVector(_bfmUp, 0.35 * B.flip).normalize();
      out.maxG = SCIS_G; out.useAB = false; out.desSpeed = SCIS_V;
      out.bankOverride = B.flip * 135 * D2R;
      if (e.speed < COBRA_V && (e.psmCD || 0) <= 0 && closure > 40 && dist < 900) {
        e.psm = { kind: 'COBRA', t: 0, dur: 2.2 }; e.psmCD = PSM_CD; e.speed *= 0.55;
        B.st = 'COBRA'; B.t = 0; changed = true;
      }
      return true;
    }
    if (B.st === 'COBRA') { if (B.t > 2.4) { B.st = 'ENGAGE'; B.t = 0; } desired.copy(e.fwd); out.maxG = 4; out.desSpeed = SCIS_V; return true; }
    if (B.st === 'HIGH_YOYO') {
      if (B.phase === 'CLIMB' && B.t >= YOYO_T) { B.phase = 'ROLL'; B.t = 0; changed = true; }
      else if (B.phase === 'ROLL' && B.t >= 0.6) { B.phase = 'DIVE'; B.t = 0; changed = true; }
      else if (B.phase === 'DIVE' && B.t >= 2.0) { B.st = 'ENGAGE'; B.t = 0; changed = true; }
      if (changed && env.debug) console.log('[ANGELS_ZERO] ace yoyo ph=' + B.phase);
      _bfmUp.set(0, 1, 0);
      _bfmRight.crossVectors(e.fwd, _bfmUp).normalize();
      if (B.phase === 'CLIMB') desired.copy(e.fwd).addScaledVector(_bfmUp, YOYO_PITCH * 0.6).addScaledVector(_bfmRight, -0.25).normalize();
      else if (B.phase === 'ROLL') { desired.copy(e.fwd).addScaledVector(_bfmUp, YOYO_PITCH).normalize(); out.bankOverride = 160 * D2R; }
      else {
        const tof = dist / Math.max(e.speed + 300, 1);
        _bfmLead.copy(toP).addScaledVector(S.velocity, tof);
        desired.copy(_bfmLead).sub(e.pos).normalize().addScaledVector(_bfmUp, -0.3).normalize();
      }
      out.maxG = Math.min(8.5, e.gMax); out.useAB = B.phase !== 'DIVE';
      return true;
    }
    // Enter a high yo-yo when offensive and about to overshoot with an energy edge.
    const aoff = Math.acos(clamp(e.fwd.dot(_bfmLos), -1, 1));
    if (aceOn && dist < 1500 && (closure > YOYO_CLOSE || aoff > YOYO_AOFF) && dE >= YOYO_E_MARGIN && B.t > 2) {
      B.st = 'HIGH_YOYO'; B.phase = 'CLIMB'; B.t = 0; changed = true;
      if (env.debug) console.log('[ANGELS_ZERO] ace yoyo ph=CLIMB');
      return false;
    }
    // Pair bracket / drag-and-bag while two aces are alive.
    if (C.acePair && C.acePair.length === 2) {
      const mateIdx = C.acePair[0] === e.id ? C.acePair[1] : C.acePair[1] === e.id ? C.acePair[0] : -1;
      const mate = mateIdx >= 0 ? enemies[mateIdx] : null;
      if (mate && mate.alive) {
        _bfmMate.copy(mate.pos).sub(S.position);
        const mt = _bfmMate.length();
        if (dist > PAIR_CONVERGE_R) {
          const off = Math.tan(PAIR_SPLIT) * Math.min(dist, 3000) * 0.5;
          _bfmRight.crossVectors(_bfmLos, _bfmUp.set(0, 1, 0)).normalize();
          desired.addScaledVector(_bfmRight, (e.id === C.acePair[0] ? -1 : 1) * off).normalize();
        }
        if (playerOn && dist < 2500 && mt < 4000) {
          const role = e.id === C.acePair[0] ? 'DRAG' : 'BAG';
          if (B.role !== role) {
            B.role = role;
            if (role === 'DRAG' && env.onWing) env.onWing('CRIMSON-2: SHE\'S ON YOU — DRAGGING HIM TO ME', 'CRIMSON-2', '#ff3b5c');
          }
          if (role === 'DRAG') { desired.copy(e.pos).sub(S.position).normalize(); out.useAB = true; out.desSpeed = e.abSpeed; }
          else {
            const tof = dist / Math.max(e.speed + 300, 1);
            desired.copy(toP).addScaledVector(S.velocity, tof).sub(e.pos).normalize();
          }
          return true;
        }
      }
    }
    return false;
  }
  return {
    flyBTT, updateAceBFM: aceBFM, enemyCM,
    get bfmOut() { return _bfmOut; },
    get los() { return _bfmLos; }, get up() { return _bfmUp; }, get mate() { return _bfmMate; }
  };
}
