// ANGELS ZERO — ejection, parachute descent and rescue respawn.
// The camera leaves the jet, the abandoned F-15 spirals in burning and explodes
// on impact, the seat fires the pilot clear, an orange/white canopy deploys
// after 0.7 s with pendulum sway, mouse looks around and A/D steer the chute.

export function createEjection(THREE, env) {
  const { scene, camera, jet, state: S, mouse, keys, groundLevel, terrainHeight, fx, say } = env;
  const clamp = THREE.MathUtils.clamp, rand = Math.random;
  const RESPAWN_AFTER = 5.0, DEPLOY_AT = 0.7;

  /* --------------------------------------------------- chute + pilot */
  const rig = new THREE.Group();                      // at the harness point
  const sway = new THREE.Group();                     // pendulum pivots at the canopy
  rig.add(sway);
  rig.visible = false;
  scene.add(rig);

  const gores = 16;
  const canopyGeo = new THREE.SphereGeometry(4.6, gores * 2, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  canopyGeo.scale(1, 0.62, 1);
  {
    const p = canopyGeo.attributes.position, col = new Float32Array(p.count * 3);
    const orange = new THREE.Color(0xff6a10), white = new THREE.Color(0xf4f4f0);
    for (let i = 0; i < p.count; i++) {
      const a = (Math.atan2(p.getZ(i), p.getX(i)) + Math.PI) / (Math.PI * 2);
      const c = Math.floor(a * gores + 1e-4) % 2 ? orange : white;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    canopyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  canopy.position.y = 7.2;
  sway.add(canopy);
  // Suspension lines from the skirt to the risers.
  const linePts = [];
  for (let i = 0; i < gores; i++) {
    const a = (i / gores) * Math.PI * 2, r = 4.6 * Math.sin(Math.PI * 0.42);
    linePts.push(new THREE.Vector3(Math.cos(a) * r, 7.2 + 4.6 * Math.cos(Math.PI * 0.42) * 0.62, Math.sin(a) * r), new THREE.Vector3(0, 0.6, 0));
  }
  sway.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0xd8d8d0, transparent: true, opacity: 0.8 })));
  // Pilot: flight suit, harness, helmet.
  const suit = new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 4, 10), suit); body.position.y = -0.2; sway.add(body);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.4 })); helmet.position.y = 0.55; sway.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.172, 14, 10, -0.9, 1.8, 1.0, 0.9), new THREE.MeshStandardMaterial({ color: 0x1a1408, roughness: 0.1, metalness: 0.6 })); visor.position.y = 0.55; sway.add(visor);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 4, 8), suit); leg.position.set(sx * 0.13, -1.05, 0.05); sway.add(leg);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    riser.position.set(sx * 0.22, 0.65, 0); riser.rotation.z = sx * 0.2; sway.add(riser);
  }
  // Ejection seat that tumbles away after separation.
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.7 }));
  seat.visible = false; scene.add(seat);
  [canopy, body, helmet, seat].forEach(m => { m.castShadow = false; m.receiveShadow = false; });

  /* -------------------------------------------------------------- state */
  const st = {
    active: false, t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, chute: false, deploy: 0, landed: false,
    wreck: { alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3() },
    seat: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0 }, saidRescue: false, lookFrom: new THREE.Vector3()
  };

  function start({ eye, quat, vel, crashed }) {
    st.active = true; st.t = 0; st.chute = false; st.deploy = 0; st.landed = false; st.saidRescue = false;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    st.pos.copy(eye);
    const floor = groundLevel(eye.x, eye.z) + 3;
    if (st.pos.y < floor) st.pos.y = floor;
    st.vel.copy(vel).multiplyScalar(0.35).addScaledVector(up, crashed ? 30 : 42).add(new THREE.Vector3(0, crashed ? 25 : 8, 0));
    st.yaw = Math.atan2(-vel.x, -vel.z);
    st.seat.pos.copy(st.pos); st.seat.vel.copy(st.vel); st.seat.spin = (rand() - 0.5) * 6; seat.visible = false;
    // Abandoned jet: burning spiral into the sea (or immediate impact on a crash).
    st.wreck.alive = !crashed;
    // Pilot-less jet noses over into a steep burning spiral so it impacts before the respawn.
    st.wreck.pos.copy(S.position);
    const agl = Math.max(50, S.position.y - groundLevel(S.position.x, S.position.z));
    st.wreck.vel.copy(vel).multiplyScalar(0.45).setY(-Math.min(320, agl / 4.2 - 2.1 * 4.2));
    st.wreck.spin.set((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.4, (rand() < 0.5 ? -1 : 1) * (1.2 + rand()));
    if (crashed) { fx.explosion(S.position.clone(), 2.4); jet.visible = false; }
    st.lookFrom.copy(camera.position);
    rig.visible = true; canopy.scale.setScalar(0.01); canopy.visible = false;
    say('EJECT! EJECT!', 2.2, '#ff4d3d');
  }

  function stop() { st.active = false; rig.visible = false; seat.visible = false; }

  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _ejFwd = new THREE.Vector3(), _ejDes = new THREE.Vector3();
  function update(dt) {
    if (!st.active) return false;
    st.t += dt;

    // Burning jet spirals in and explodes on impact.
    if (st.wreck.alive) {
      const w = st.wreck;
      w.vel.y -= 9.81 * dt; w.vel.multiplyScalar(1 - 0.05 * dt);
      w.pos.addScaledVector(w.vel, dt);
      jet.position.copy(w.pos);
      jet.quaternion.multiply(_q.setFromEuler(_e.set(w.spin.x * dt, w.spin.y * dt, w.spin.z * dt)));
      jet.updateMatrixWorld();
      fx.emitFire({ x: w.pos.x, y: w.pos.y, z: w.pos.z, vx: (rand() - 0.5) * 5, vy: 3, vz: (rand() - 0.5) * 5, life: 0.5 + rand() * 0.4, s0: 5, s1: 12, r: 1, g: 0.5 + rand() * 0.3, b: 0.15, a: 0.9, drag: 1.5 });
      const g = 0.08 + rand() * 0.06;
      fx.emitSmoke({ x: w.pos.x, y: w.pos.y, z: w.pos.z, vx: 0, vy: 2, vz: 0, life: 4 + rand() * 2, s0: 6, s1: 32, r: g, g, b: g, a: 0.7, drag: 0.6, rise: 1.5 });
      const ground = terrainHeight(w.pos.x, w.pos.z);
      if (w.pos.y <= Math.max(0, ground) + 1) {
        if (ground < 0) fx.splash(w.pos, 1.6);
        fx.explosion(w.pos.clone().setY(Math.max(0, ground) + 2), 2.4);
        w.alive = false; jet.visible = false;
      }
    }

    // Seat separates at chute deploy and falls away.
    if (seat.visible) {
      st.seat.vel.y -= 9.81 * dt; st.seat.pos.addScaledVector(st.seat.vel, dt);
      seat.position.copy(st.seat.pos); seat.rotation.x += st.seat.spin * dt; seat.rotation.z += st.seat.spin * 0.6 * dt;
      if (st.seat.pos.y < groundLevel(st.seat.pos.x, st.seat.pos.z)) seat.visible = false;
    }

    // Pilot: seat rocket arc, then canopy.
    if (!st.chute && st.t >= DEPLOY_AT) {
      st.chute = true; canopy.visible = true; seat.visible = true; st.seat.pos.copy(st.pos); st.seat.vel.copy(st.vel).multiplyScalar(0.8);
      say('GOOD CHUTE — PILOT IS OUT', 1.6);
    }
    if (st.chute) {
      st.deploy = Math.min(1, st.deploy + dt / 0.6);
      const k = 1 - Math.pow(1 - st.deploy, 3);
      canopy.scale.set(0.2 + 0.8 * k, 0.35 + 0.65 * k, 0.2 + 0.8 * k);
      const steer = ((keys.a || keys.q) ? 1 : 0) - ((keys.d || keys.e) ? 1 : 0);
      st.yaw += steer * 0.7 * dt;
      _ejFwd.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw));
      _ejDes.copy(_ejFwd).multiplyScalar(4.5);
      _ejDes.x += 1.5; _ejDes.y += -5.5 - 2 * Math.abs(steer); _ejDes.z += 0.8;
      st.vel.lerp(_ejDes, Math.min(1, dt * (st.deploy < 1 ? 3.5 : 1.2)));
    } else {
      st.vel.y -= 9.81 * dt; st.vel.multiplyScalar(1 - 0.35 * dt);
    }
    if (!st.landed) st.pos.addScaledVector(st.vel, dt);
    const gl = groundLevel(st.pos.x, st.pos.z) + 1.3;
    if (st.pos.y <= gl) {
      if (!st.landed && terrainHeight(st.pos.x, st.pos.z) < 0) fx.splash(st.pos, 0.3);
      st.pos.y = gl; st.landed = true;
    }
    rig.position.copy(st.pos);
    rig.rotation.set(0, st.yaw, 0);
    sway.rotation.z = Math.sin(st.t * 2.5) * 0.14 * (st.chute ? 1 : 0.3);   // pendulum sway
    sway.rotation.x = Math.sin(st.t * 1.7 + 1) * 0.05;

    // Camera: watch the jet go for a moment, then free mouse-look orbit around the pilot.
    const target = st.pos.clone().add(new THREE.Vector3(0, st.chute ? 3.2 : 0.4, 0));
    const camYaw = st.yaw + Math.PI + mouse.nx * Math.PI;
    const camPitch = clamp(0.18 + mouse.ny * 0.9, -0.5, 1.2);
    const dist = st.chute ? 17 : 11;
    const orbit = target.clone().add(new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch) * dist, Math.sin(camPitch) * dist, Math.cos(camYaw) * Math.cos(camPitch) * dist));
    const blend = clamp(st.t / 0.9, 0, 1);
    camera.position.lerpVectors(st.lookFrom, orbit, blend * blend * (3 - 2 * blend));
    const minY = groundLevel(camera.position.x, camera.position.z) + 1.5;
    if (camera.position.y < minY) camera.position.y = minY;
    camera.up.set(0, 1, 0);
    camera.lookAt(st.t < 0.9 && st.wreck.alive ? target.clone().lerp(st.wreck.pos, 1 - blend) : target);
    camera.updateMatrixWorld();

    if (!st.saidRescue && st.t > 2.3) { st.saidRescue = true; say('RESCUE CHOPPER INBOUND — STAND BY FOR RE-ENTRY', 2.8); }
    return st.t >= RESPAWN_AFTER;
  }

  return {
    start, stop, update,
    get active() { return st.active; },
    get info() { return { t: st.t, chute: st.chute, deploy: st.deploy, pilotY: st.pos.y, jetAlive: st.wreck.alive, landed: st.landed }; }
  };
}
