// ANGELS ZERO — pooled OSM-style agile drone swarm (extracted from combat.js).
// Zero per-frame allocations: typed-array pool, one shared material/geometry.
export function createDroneSwarm(THREE, env) {
  const { scene, S, C, groundLevel, clamp, D2R, rand, say, pushEvent, missionUpdate,
    explosion, awardStyle, gunsOnly, damagePlayer, outer,
    DRONE_N, DRONE_HIT_R, DRONE_V, DRONE_G, DRONE_COH, DRONE_SEP, DRONE_ALI, DRONE_ORBIT,
    DRONE_SEP_R, DRONE_ORBIT_R, DRONE_ORBIT_DY, DRONE_GUN_R, DRONE_GUN_COS, DRONE_BURST,
    DRONE_GUN_CD, DRONE_GUN_DMG, DRONE_GUN_RPS, DRONE_PTS, SWARM_BONUS, SWARM_MIN, SWARM_MAX,
    ACE_BULLET_V, ACE_HIT_R, LOG_V, LOG_F } = env;

/* ==================================================== agile drone swarm */
  // Separate pooled archetype: one InstancedMesh body + one additive engine-glow
  // Points cloud, fixed DRONE_N slots, typed-array state, zero per-frame objects.
  // Drones are virtual lock targets only -- never enemies entries, never RWR.
  const DR_POS = new Float32Array(DRONE_N * 3);
  const DR_VEL = new Float32Array(DRONE_N * 3);
  const DR_ALIVE = new Uint8Array(DRONE_N);
  const DR_GUNCD = new Float32Array(DRONE_N);
  const DR_BURST = new Float32Array(DRONE_N);
  const DR_SWARM = new Int8Array(DRONE_N);          // -1 none, 0 player anchor, 1 carrier anchor
  const DR_PHASE = new Float32Array(DRONE_N);       // orbit phase (radians)
  const DR_ATK = new Float32Array(DRONE_N);         // attack timer (negative = pursuing)
  const DR_BANK = new Float32Array(DRONE_N);
  const DRONES_N = new THREE.Vector3(0, 0, -1), DR_UP = new THREE.Vector3(0, 1, 0);
  const DRONE_TGT = Array.from({ length: DRONE_N }, (_, i) => ({
    kind: 'DRONE', idx: i, pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false,
    label: 'DRONE-' + String(i + 1).padStart(2, '0'), type: 'UAV', cloud: 0, heading: 0
  }));
  // 4-triangle delta wing (~3.5 m span) + one vertical fin; built once.
  const droneGeo = (() => {
    const v = [0, 0, -1.8, -1.75, 0, 0.9, 0, 0, 1.0, 1.75, 0, 0.9,
      -0.55, 0, 1.65, 0.55, 0, 1.65, 0, 0, 0.55, 0, 0, 1.45, 0, 0.62, 1.45];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 5, 3, 6, 7, 8]);
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  })();
  const droneMat = new THREE.MeshStandardMaterial({ color: 0x58616b, metalness: 0.45, roughness: 0.55,
    emissive: 0x142430, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  const droneMesh = new THREE.InstancedMesh(droneGeo, droneMat, DRONE_N);
  droneMesh.frustumCulled = true; droneMesh.count = DRONE_N; droneMesh.renderOrder = 5;
  scene.add(droneMesh);
  // Additive engine glow: same logdepth pattern as the SAM tracer glow in vfx.js.
  const DR_GLOW_V = LOG_V + `
    attribute float aSize; attribute float aAlpha;
    varying float vA;
    void main() {
      vA = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * 320.0 / max(1.0, -mv.z);
      #include <logdepthbuf_vertex>
    }`;
  const DR_GLOW_F = LOG_F + `
    varying float vA;
    void main() {
      #include <logdepthbuf_fragment>
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d) * 2.0;
      float a = pow(max(0.0, 1.0 - r), 2.0) * vA;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vec3(1.0, 0.56, 0.24) * a, a);
    }`;
  const drGlowGeo = new THREE.BufferGeometry();
  const DR_GLOW_POS = new Float32Array(DRONE_N * 3), DR_GLOW_SIZE = new Float32Array(DRONE_N), DR_GLOW_A = new Float32Array(DRONE_N);
  drGlowGeo.setAttribute('position', new THREE.BufferAttribute(DR_GLOW_POS, 3));
  drGlowGeo.setAttribute('aSize', new THREE.BufferAttribute(DR_GLOW_SIZE, 1));
  drGlowGeo.setAttribute('aAlpha', new THREE.BufferAttribute(DR_GLOW_A, 1));
  const drGlow = new THREE.Points(drGlowGeo, new THREE.ShaderMaterial({ vertexShader: DR_GLOW_V, fragmentShader: DR_GLOW_F,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  drGlow.frustumCulled = false; drGlow.renderOrder = 8; scene.add(drGlow);
  // Scratch (preallocated): steering, orientation, guns, glow, culling.
  const _drp = new THREE.Vector3(), _drv = new THREE.Vector3(), _dracc = new THREE.Vector3();
  const _drq = new THREE.Quaternion(), _drqr = new THREE.Quaternion(), _drm4 = new THREE.Matrix4(), _drup = new THREE.Vector3(1, 1, 1);
  const _drzero = new THREE.Vector3(0, 0, 0), _drPos = new THREE.Vector3(), _drGoal = new THREE.Vector3();
  const _drCent = new THREE.Vector3(), _drAli = new THREE.Vector3(), _drSep = new THREE.Vector3(), _drTmp = new THREE.Vector3();
  const _drFwd = new THREE.Vector3(), _drRight = new THREE.Vector3(), _drAnchor = new THREE.Vector3(), _drCarrier = new THREE.Vector3();
  const _drLead = new THREE.Vector3(), _drDir = new THREE.Vector3(), _drMuz = new THREE.Vector3(), _drBul = new THREE.Vector3(), _drToP = new THREE.Vector3();
  let droneSpawned = 0, droneKilled = 0, droneCleared = 0;
  let droneAtkT = 4, droneSalvoT = 0, droneSalvoKills = 0, droneSalvoPaid = false;

  function clearDronePool() {
    for (let i = 0; i < DRONE_N; i++) {
      DR_ALIVE[i] = 0; DRONE_TGT[i].alive = false; DR_BURST[i] = 0; DR_SWARM[i] = -1;
      _drm4.compose(_drPos.set(0, 0, 0), _drq.identity(), _drzero);
      droneMesh.setMatrixAt(i, _drm4);
      DR_GLOW_A[i] = 0;
    }
    droneMesh.instanceMatrix.needsUpdate = true;
    drGlowGeo.attributes.aAlpha.needsUpdate = true;
    C.swarm.on = false; C.swarm.n = 0; C.swarm.alive = 0; C.swarm.bonusPaid = true; C.swarm.t = 0;
  }
  clearDronePool();                                            // hide all slots from the first frame

  function spawnSwarm(n, anchorKind) {
    if (gunsOnly()) return 0;                                  // ACE_DUEL never fields missiles or drones
    const want = clamp(n | 0, SWARM_MIN, SWARM_MAX);
    let free = 0;
    for (let i = 0; i < DRONE_N; i++) if (!DR_ALIVE[i]) free++;
    if (!free) return 0;
    const cnt = Math.min(want, free);
    const useCarrier = anchorKind === 'CARRIER' && C.ally && (C.ally.root || C.ally.g);
    if (useCarrier) {
      const root = C.ally.root || C.ally.g;
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(_drCarrier);
    }
    const a0 = rand() * Math.PI * 2, dist = 4000 + rand() * 2000;
    const baseX = S.position.x + Math.cos(a0) * dist, baseZ = S.position.z + Math.sin(a0) * dist;
    const baseY = clamp(S.position.y + (rand() - 0.5) * 600, 140, 12000);
    let placed = 0;
    for (let i = 0; i < DRONE_N && placed < cnt; i++) {
      if (DR_ALIVE[i]) continue;
      const k = (i / cnt) * Math.PI * 2;
      DR_POS[i * 3] = baseX + Math.cos(k) * 20 + (rand() - 0.5) * 20;
      DR_POS[i * 3 + 1] = clamp(baseY + (rand() - 0.5) * 30, 120, 12000);
      DR_POS[i * 3 + 2] = baseZ + Math.sin(k) * 20 + (rand() - 0.5) * 20;
      _drPos.set(DR_POS[i * 3], DR_POS[i * 3 + 1], DR_POS[i * 3 + 2]);
      _drv.copy(S.position).sub(_drPos).normalize();
      DR_VEL[i * 3] = _drv.x * DRONE_V; DR_VEL[i * 3 + 1] = _drv.y * DRONE_V; DR_VEL[i * 3 + 2] = _drv.z * DRONE_V;
      DR_ALIVE[i] = 1; DR_SWARM[i] = useCarrier && placed >= cnt * 0.5 ? 1 : 0;
      DR_PHASE[i] = k; DR_ATK[i] = 4 + rand() * 3; DR_BANK[i] = 0;
      DR_GUNCD[i] = 1 + rand() * 2; DR_BURST[i] = 0;
      const t = DRONE_TGT[i];
      t.alive = true; t.pos.copy(_drPos); t.vel.set(DR_VEL[i * 3], DR_VEL[i * 3 + 1], DR_VEL[i * 3 + 2]);
      t.heading = (Math.atan2(_drv.x, -_drv.z) / D2R + 360) % 360;
      DR_GLOW_SIZE[i] = 4.5 + rand() * 2; DR_GLOW_A[i] = 0.9;
      drGlowGeo.attributes.aSize.needsUpdate = true; drGlowGeo.attributes.aAlpha.needsUpdate = true;
      droneSpawned++; placed++;
    }
    if (!placed) return 0;
    C.swarm.on = true; C.swarm.n = placed; C.swarm.alive = placed;
    C.swarm.anchor = useCarrier ? 'CARRIER' : 'PLAYER'; C.swarm.bonusPaid = false; C.swarm.t = 0;
    droneAtkT = 4;
    C.droneInboundT = performance.now();
    say('BANDITS — DRONE SWARM, LOW AND FAST!', 2.6, '#ffbf3f');
    if (env.onRadio) env.onRadio('DRONE_INBOUND');
    missionUpdate('ambush');
    if (env.debug) console.log('[ANGELS_ZERO] drone swarm spawned n=' + placed + ' anchor=' + C.swarm.anchor);
    return placed;
  }

  function killDrone(i, how) {
    if (i < 0 || i >= DRONE_N || !DR_ALIVE[i]) return false;
    DR_ALIVE[i] = 0; DRONE_TGT[i].alive = false; DR_BURST[i] = 0; DR_SWARM[i] = -1;
    const pos = DRONE_TGT[i].pos;
    _drm4.compose(pos, _drq.identity(), _drzero); droneMesh.setMatrixAt(i, _drm4);
    droneMesh.instanceMatrix.needsUpdate = true;
    DR_GLOW_A[i] = 0; drGlowGeo.attributes.aAlpha.needsUpdate = true;
    C.swarm.alive = Math.max(0, C.swarm.alive - 1);
    droneKilled++;
    explosion(pos, 0.35, { vel: DRONE_TGT[i].vel });
    if (env.samPuff) env.samPuff(_drTmp.copy(pos));
    if (env.onSfx) env.onSfx('explosion', pos, 0.35);
    C.score += DRONE_PTS;
    pushEvent('DRONE', 'SWARM KILL', DRONE_PTS);
    if (C.weapon === 'AAM4' && how === 'MSL' && droneSalvoT > 0 && performance.now() - droneSalvoT < 1500) {
      droneSalvoKills++;
      if (droneSalvoKills >= 4 && !droneSalvoPaid) { droneSalvoPaid = true; awardStyle('QUAD_SPLASH'); }
    }
    if (C.swarm.alive === 0 && !C.swarm.bonusPaid) {
      C.swarm.bonusPaid = true; C.swarm.on = false; droneCleared++;
      C.score += SWARM_BONUS;
      pushEvent('SWARM', 'SWARM CLEARED', SWARM_BONUS, '#ffd45a');
      C.droneClearedT = performance.now();
      say('SWARM CLEARED — NICE WORK', 2.4);
      if (env.onRadio) env.onRadio('SWARM_CLEARED');
    }
    return true;
  }

  function droneSplash(pos, hitIdx) {
    killDrone(hitIdx, 'MSL');
    for (let i = 0; i < DRONE_N; i++) {
      if (!DR_ALIVE[i] || i === hitIdx) continue;
      if (DRONE_TGT[i].pos.distanceToSquared(pos) < 12 * 12) killDrone(i, 'MSL');
    }
  }

  function updateDrones(dt, playerActive) {
    if (!C.swarm.on) {
      for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) { C.swarm.on = true; break; }
      if (!C.swarm.on) return;
    }
    C.swarm.t += dt;
    droneAtkT -= dt;
    if (droneAtkT <= 0) {                                      // one random drone peels off every 4 s
      for (let k = 0; k < DRONE_N; k++) if (DR_ALIVE[k]) { DR_ATK[k] = -3; break; }
      droneAtkT = 4;
    }
    const carrier = C.ally && (C.ally.root || C.ally.g);
    if (carrier) { carrier.updateWorldMatrix(true, false); carrier.getWorldPosition(_drCarrier); }
    // Neighbour pass: coherence + alignment per swarm, separation for any close pair.
    for (let i = 0; i < DRONE_N; i++) {
      if (!DR_ALIVE[i]) continue;
      _drCent.set(0, 0, 0); _drAli.set(0, 0, 0); _drSep.set(0, 0, 0);
      let n = 0;
      for (let j = 0; j < DRONE_N; j++) {
        if (j === i || !DR_ALIVE[j]) continue;
        const dx = DR_POS[j * 3] - DR_POS[i * 3], dy = DR_POS[j * 3 + 1] - DR_POS[i * 3 + 1], dz = DR_POS[j * 3 + 2] - DR_POS[i * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < DRONE_SEP_R * DRONE_SEP_R && d2 > 1e-6) {
          const inv = 1 / Math.sqrt(d2);
          _drSep.x -= dx * inv; _drSep.y -= dy * inv; _drSep.z -= dz * inv;
        }
        if (DR_SWARM[j] !== DR_SWARM[i]) continue;
        _drCent.x += DR_POS[j * 3]; _drCent.y += DR_POS[j * 3 + 1]; _drCent.z += DR_POS[j * 3 + 2];
        _drAli.x += DR_VEL[j * 3]; _drAli.y += DR_VEL[j * 3 + 1]; _drAli.z += DR_VEL[j * 3 + 2];
        n++;
      }
      if (n) {
        _drCent.divideScalar(n); _drAli.divideScalar(n);
        _drCent.x -= DR_POS[i * 3]; _drCent.y -= DR_POS[i * 3 + 1]; _drCent.z -= DR_POS[i * 3 + 2];
        _drAli.x -= DR_VEL[i * 3]; _drAli.y -= DR_VEL[i * 3 + 1]; _drAli.z -= DR_VEL[i * 3 + 2];
        if (_drCent.lengthSq() > 1) _drCent.normalize();
        if (_drAli.lengthSq() > 1) _drAli.normalize();
      }
      // Pursuit state: peel-off drone chases the player for 3 s then rejoins.
      if (DR_ATK[i] < 0) { DR_ATK[i] += dt; if (DR_ATK[i] >= 0) DR_ATK[i] = 4; }
      const pursuing = DR_ATK[i] < 0;
      _drAnchor.copy(DR_SWARM[i] === 1 && carrier ? _drCarrier : S.position);
      if (pursuing) {
        _drGoal.copy(S.position);
      } else {
        const th = C.swarm.t * 0.6 + DR_PHASE[i];
        _drGoal.set(_drAnchor.x + Math.cos(th) * DRONE_ORBIT_R,
          Math.max(groundLevel(_drAnchor.x, _drAnchor.z) + 260, _drAnchor.y + DRONE_ORBIT_DY),
          _drAnchor.z + Math.sin(th) * DRONE_ORBIT_R);
      }
      _drTmp.set(_drGoal.x - DR_POS[i * 3], _drGoal.y - DR_POS[i * 3 + 1], _drGoal.z - DR_POS[i * 3 + 2]);
      if (_drTmp.lengthSq() > 1) _drTmp.normalize().multiplyScalar(DRONE_V);
      else _drTmp.set(0, 0, 0);
      _drTmp.x -= DR_VEL[i * 3]; _drTmp.y -= DR_VEL[i * 3 + 1]; _drTmp.z -= DR_VEL[i * 3 + 2];
      if (_drTmp.lengthSq() > 1) _drTmp.normalize();
      _dracc.copy(_drTmp).multiplyScalar(DRONE_ORBIT)
        .addScaledVector(_drCent, DRONE_COH).addScaledVector(_drAli, DRONE_ALI)
        .addScaledVector(_drSep, DRONE_SEP);
      // Terrain floor with 80 m clearance.
      const floor = groundLevel(DR_POS[i * 3], DR_POS[i * 3 + 2]) + 80;
      if (DR_POS[i * 3 + 1] < floor + 40) _dracc.y += (floor + 40 - DR_POS[i * 3 + 1]) * 0.02;
      const gLim = DRONE_G * 9.81;
      if (_dracc.lengthSq() > gLim * gLim) _dracc.setLength(gLim);
      DR_VEL[i * 3] += _dracc.x * dt; DR_VEL[i * 3 + 1] += _dracc.y * dt; DR_VEL[i * 3 + 2] += _dracc.z * dt;
      _drFwd.set(DR_VEL[i * 3], DR_VEL[i * 3 + 1], DR_VEL[i * 3 + 2]);
      if (_drFwd.lengthSq() < 1) _drFwd.set(0, 0, -1);
      _drFwd.normalize().multiplyScalar(DRONE_V);
      DR_VEL[i * 3] = _drFwd.x; DR_VEL[i * 3 + 1] = _drFwd.y; DR_VEL[i * 3 + 2] = _drFwd.z;
      DR_POS[i * 3] += _drFwd.x * dt; DR_POS[i * 3 + 1] += _drFwd.y * dt; DR_POS[i * 3 + 2] += _drFwd.z * dt;
      // Bank from lateral acceleration (aLat = a . right, right = up x fwd).
      _drRight.crossVectors(DR_UP, _drFwd).normalize();
      DR_BANK[i] = clamp(Math.atan2(_dracc.dot(_drRight), gLim), -0.85, 0.85);
      _drPos.set(DR_POS[i * 3], DR_POS[i * 3 + 1], DR_POS[i * 3 + 2]);
      _drm4.lookAt(_drPos, _drTmp.copy(_drPos).add(_drFwd), DR_UP);
      _drq.setFromRotationMatrix(_drm4);
      _drqr.setFromAxisAngle(DRONES_N, DR_BANK[i]); _drq.multiply(_drqr);
      _drm4.compose(_drPos, _drq, _drup); droneMesh.setMatrixAt(i, _drm4);
      // Sync virtual lock target.
      const t = DRONE_TGT[i];
      t.pos.copy(_drPos); t.vel.copy(_drFwd); t.alive = true;
      t.heading = (Math.atan2(_drFwd.x, -_drFwd.z) / D2R + 360) % 360;
      // Engine glow sits 2 m behind along -vel.
      DR_GLOW_POS[i * 3] = _drPos.x - _drFwd.x * 2 / DRONE_V;
      DR_GLOW_POS[i * 3 + 1] = _drPos.y - _drFwd.y * 2 / DRONE_V;
      DR_GLOW_POS[i * 3 + 2] = _drPos.z - _drFwd.z * 2 / DRONE_V;
      // Gun burst: lead the player using the ace closest-approach test.
      if (DR_BURST[i] > 0) {
        DR_BURST[i] -= dt;
        const rounds = Math.min(3, Math.floor(DRONE_GUN_RPS * dt + 0.5));
        for (let r = 0; r < rounds; r++) {
          const d = _drTmp.copy(S.position).sub(_drPos).length();
          let tof = d / ACE_BULLET_V;
          _drLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
          tof = _drLead.distanceTo(_drPos) / ACE_BULLET_V;
          _drLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
          _drDir.subVectors(_drLead, _drPos).normalize();
          _drMuz.copy(_drPos).addScaledVector(_drFwd, 2.5 / DRONE_V);
          _drBul.copy(_drDir).multiplyScalar(ACE_BULLET_V);
          _drToP.copy(S.position).sub(_drMuz);
          const along = _drToP.dot(_drBul), v2 = ACE_BULLET_V * ACE_BULLET_V;
          if (playerActive && along > 0 && along < DRONE_GUN_R * ACE_BULLET_V) {
            _drToP.copy(_drBul).multiplyScalar(along / v2).sub(_drToP);
            if (_drToP.length() < ACE_HIT_R) {
              damagePlayer(DRONE_GUN_DMG);
              if (env.onSfx) env.onSfx('gunhit', S.position, 1);
            }
          }
          if (r === 0 && env.aaTracer) env.aaTracer(_drMuz, _drBul, 0.3, true);
        }
        if (DR_BURST[i] <= 0) DR_GUNCD[i] = DRONE_GUN_CD;
      } else {
        DR_GUNCD[i] -= dt;
        _drTmp.copy(S.position).sub(_drPos);
        const d = _drTmp.length();
        if (playerActive && DR_GUNCD[i] <= 0 && d < DRONE_GUN_R && d > 1) {
          _drTmp.divideScalar(d);
          _drFwd.set(DR_VEL[i * 3], DR_VEL[i * 3 + 1], DR_VEL[i * 3 + 2]).normalize();
          if (_drTmp.dot(_drFwd) >= DRONE_GUN_COS) {
            DR_BURST[i] = DRONE_BURST; DR_GUNCD[i] = DRONE_GUN_CD;
            if (env.onSfx) env.onSfx('egun', _drPos, 0.4);
          }
        }
      }
    }
    // Live centroid bound for frustum culling (written in place, never recomputed).
    let n = 0, cx = 0, cy = 0, cz = 0, maxR = 0;
    for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) {
      const x = DR_POS[i * 3], y = DR_POS[i * 3 + 1], z = DR_POS[i * 3 + 2];
      cx += x; cy += y; cz += z; n++;
    }
    if (n) {
      cx /= n; cy /= n; cz /= n;
      for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) {
        const dx = DR_POS[i * 3] - cx, dy = DR_POS[i * 3 + 1] - cy, dz = DR_POS[i * 3 + 2] - cz;
        const r = dx * dx + dy * dy + dz * dz; if (r > maxR) maxR = r;
      }
      droneGeo.boundingSphere.center.set(cx, cy, cz);
      droneGeo.boundingSphere.radius = Math.sqrt(maxR) + 10;
      droneMesh.instanceMatrix.needsUpdate = true;
      drGlowGeo.attributes.position.needsUpdate = true;
      drGlowGeo.attributes.aAlpha.needsUpdate = true;
    }
  }

  
  return {
    clearDronePool, spawnSwarm, killDrone, droneSplash, updateDrones,
    getDrones: () => DRONE_TGT,
    isAlive: i => !!DR_ALIVE[i],
    resetSalvo(t = 0) { droneSalvoT = t; droneSalvoKills = 0; droneSalvoPaid = false; },
    stats: () => ({ spawned: droneSpawned, killed: droneKilled, cleared: droneCleared,
      cull: droneGeo.boundingSphere ? Math.round(droneGeo.boundingSphere.radius) : 0 })
  };
}
