// ANGELS ZERO — wingman bank-to-turn flight (extracted from index.html).
// Zero per-frame allocations: one reused state object and module scratch.
export function createWingmenFlight(THREE, env) {
  const { wingmen, state, combat, combatSys, wingphys } = env;
const WING_LIM = { maxG: 7.5, rollRate: 2.62, vMin: 160, vMax: 330, acc: 9, accAB: 18, dec: 14, minAGL: 120 };
const WING_LIMP_LIM = { maxG: 2, rollRate: 0.9, vMin: 100, vMax: 150, acc: 4, accAB: 4, dec: 6, minAGL: 150 };
const FORM_KP = 0.28, FORM_CLOSE_MAX = 60, FORM_BANKMATCH_R = 40;
const WING_SEP_R = 70, WING_OVERSHOOT_R = 250, WING_FIRE_COS = Math.cos(25 * Math.PI / 180), REJOIN_R = 400;
const _ws = new THREE.Vector3();                   // wingman formation scratch
const _wfSlot = new THREE.Vector3(), _wfDes = new THREE.Vector3(), _wfSep = new THREE.Vector3(),
  _wfLead = new THREE.Vector3(), _wfRight = new THREE.Vector3(), _wfUp = new THREE.Vector3(0, 1, 0);
let wingPhysLogT = 0;

function updateWingmanFlight(dt, flags) {
  const flying = flags.flying;
  for (let i = 0; i < wingmen.length; i++) {
    const w = wingmen[i];
    if (!w.mesh) continue;
    if (w.cat && w.cat.ph !== 'AIRBORNE' && w.cat.ph !== 'NONE') {
      w.mesh.position.copy(w.catPos); w.mesh.quaternion.copy(w.catQ);
      w.mesh.visible = flags.flyVisible && w.alive;
      continue;
    }
    if (!w.pos.lengthSq()) {
      w.pos.copy(_ws.copy(w.off).applyQuaternion(state.quaternion).add(state.position));
      w.quat.copy(state.quaternion);
      w.speed = Math.max(180, state.speed);
    }
    if (!w.fwd || w.fwd.lengthSq() < 0.5) w.fwd.set(0, 0, -1).applyQuaternion(w.quat);
    if (w.vel.lengthSq() < 1) w.vel.copy(w.fwd).multiplyScalar(w.speed);
    if (!flying) {
      w.mesh.position.copy(w.pos); w.mesh.quaternion.copy(w.quat);
      w.mesh.visible = flags.flyVisible && w.alive;
      continue;
    }
    const beforeX = w.pos.x, beforeY = w.pos.y, beforeZ = w.pos.z;
    if (w.limping) {
      _wfDes.copy(w.limpDest).sub(w.pos);
      if (_wfDes.lengthSq() < 1) _wfDes.copy(w.fwd);
      _wfDes.normalize();
      combatSys.flyBTT(w, _wfDes, 113, dt, WING_LIMP_LIM);
    } else {
      _wfSlot.copy(w.off).applyQuaternion(state.quaternion).add(state.position);
      const slotErr = _wfSlot.distanceTo(w.pos);
      const wantForm = combat.wingOrder === 0 || combat.wingHold || !w.tgt;
      if (wantForm) {
        if (w.mode === 'BREAK' || w.mode === 'FOCUS' || w.mode === 'COVER') w.mode = 'REJOIN';
      } else if (w.mode === 'FORM' || w.mode === 'REJOIN') {
        if (w.mode === 'FORM') { w.mode = 'BREAK'; w.breakT = 1.2; w.flip = i ? -1 : 1; }
      }
      if (w.mode === 'BREAK') {
        w.breakT -= dt;
        _wfRight.crossVectors(w.fwd, _wfUp).normalize();
        _wfDes.copy(w.fwd).addScaledVector(_wfRight, w.flip * 1.05).addScaledVector(_wfUp, 0.18 * w.flip).normalize();
        if (w.breakT <= 0) w.mode = w.tgt ? 'FOCUS' : 'COVER';
        combatSys.flyBTT(w, _wfDes, 250, dt, WING_LIM);
      } else if (w.mode === 'FOCUS' || w.mode === 'COVER') {
        const d = w.tgt.pos.distanceTo(w.pos);
        const tof = d / Math.max(w.speed + 300, 1);
        _wfLead.copy(w.tgt.pos).addScaledVector(w.tgt.vel || _wfSep.set(0, 0, 0), tof);
        if (d < WING_OVERSHOOT_R) {
          _wfSep.copy(w.tgt.vel || _wfDes.set(0, 0, 0));
          if (_wfSep.lengthSq() > 1) _wfLead.addScaledVector(_wfSep.normalize(), -300);
        }
        _wfDes.copy(_wfLead).sub(w.pos);
        if (_wfDes.lengthSq() < 1) _wfDes.copy(w.fwd);
        _wfDes.normalize();
        combatSys.flyBTT(w, _wfDes, Math.min(WING_LIM.vMax, w.speed + 40), dt, WING_LIM);
        // Existing missile envelope check stays in combat.updateWingmen; only the
        // geometry gate is mirrored here for the new lead-pursuit break.
      } else {
        // FORM / REJOIN: fly the slot directly, closing speed rises with position error.
        _wfDes.copy(_wfSlot).sub(w.pos);
        if (_wfDes.lengthSq() > 1) _wfDes.normalize(); else _wfDes.copy(w.fwd);
        let wSpd = THREE.MathUtils.clamp(state.speed + slotErr * FORM_KP * (w.mode === 'REJOIN' ? 1.5 : 1),
          WING_LIM.vMin, WING_LIM.vMax);
        if (slotErr < FORM_BANKMATCH_R) wSpd = THREE.MathUtils.clamp(state.speed, WING_LIM.vMin, WING_LIM.vMax);
        if (slotErr < REJOIN_R) w.mode = 'FORM';
        // Separation from the player and the other wingman.
        _wfSep.copy(w.pos).sub(state.position);
        const dp = _wfSep.length();
        if (dp < WING_SEP_R && dp > 0.01) _wfDes.addScaledVector(_wfSep.divideScalar(dp), (WING_SEP_R - dp) * 0.6);
        for (let j = 0; j < wingmen.length; j++) {
          if (j === i) continue;
          const o = wingmen[j];
          _wfSep.copy(w.pos).sub(o.pos);
          const doo = _wfSep.length();
          if (doo < WING_SEP_R && doo > 0.01) _wfDes.addScaledVector(_wfSep.divideScalar(doo), (WING_SEP_R - doo) * 0.6);
        }
        if (_wfDes.lengthSq() < 1) _wfDes.copy(w.fwd);
        _wfDes.normalize();
        combatSys.flyBTT(w, _wfDes, wSpd, dt, WING_LIM);
        if (slotErr < FORM_BANKMATCH_R) w.bank += (state.bank - w.bank) * Math.min(0.5, dt * 2);
      }
    }
    const jump = Math.hypot(w.pos.x - beforeX - w.vel.x * dt, w.pos.y - beforeY - w.vel.y * dt, w.pos.z - beforeZ - w.vel.z * dt);
    if (wingphys) {
      wingPhysLogT += dt;
      if (wingPhysLogT >= 1) {
        wingPhysLogT = 0;
        console.log('[ANGELS_ZERO] wing i=' + i + ' mode=' + w.mode + ' v=' + w.speed.toFixed(0) +
          ' g=' + w.gNow.toFixed(1) + ' bank=' + (w.bank * 57.2958).toFixed(0) +
          ' slotErr=' + (w.off ? _wfSlot.distanceTo(w.pos).toFixed(0) : '-') + ' jump=' + jump.toFixed(3));
      }
    }
    w.mesh.position.copy(w.pos); w.mesh.quaternion.copy(w.quat);
    w.mesh.visible = flags.flyVisible && w.alive;
  }
}

  return { updateWingmanFlight, update: updateWingmanFlight };
}
