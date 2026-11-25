// ANGELS ZERO — 6-DOF flight physics, extracted from index.html.
// Mutable scalars are read/written through E accessors so the host keeps exact state.
export function createFlightPhysics(THREE, env) {
  const E = env;
  const { state, combat, combatSys, cat, carrier, man, roll, waveoff, autoland, mouse, keys, kbAxis, gforce, weather, world, rq, tele, vfx, audio, AC, AX_X, AX_Y, AX_Z, _dq, _fwd, _up, _right, _vdir, _force, _lift, _side, _aero, _nose, _fw, _ilsRight, _ilsE, _ilsQ, _lp, _qInv, _carrierVel, updateAutoland, updateWingCat, catTick, updateCarrierOp, updateGround, updateStickAxes, rudderInput, rotateBody, airDensity, storeCounts, aircraftMass, liftCoefficient, onMach1, ilsVisible, toggleGear, sinkFactor, onTouchdown, radioEvent, onSfx, groundLevel, lowestWheelY, touchdownCheck, enterGround, triggerEject, awardManeuver, updateAirbrake, updateThrottle, configDrag, ceilThrustK, shaped, BASE_MASS, WING_AREA, GRAVITY, INERTIA, CL_ALPHA, CL0, CD0, K_INDUCED, CY_BETA, STALL_AOA, ALPHA_LIMIT, ALPHA_MIN, AOA_COUPLE, AOA_COUPLE_PSM, PSM_KT, PSM_PITCH_K, PSM_YAW_K, PSM_DRAG_K, APEX_FY, APEX_KT, APEX_AUTH_MIN, Q_REF, THRUST_DRY, THRUST_AB, ICE_CLOUD_T, ICE_FROST_T, ICE_WARN_T, ICE_BUILD_S, ICE_MELT_S, ICE_AB_MELT_K, ICE_CTRL_LOSS, ICE_DRAG_K, G_ONSET, G_RATE_A, G_RATE_P, G_HOLD_S, G_DRAIN, G_DRAIN_UNLOAD, GLOC_T, GLOC_WAKE_S, GNEG_ONSET, GNEG_RATE, GNEG_DRAIN, PILOTK_S0, PILOTK_MIN, D2R, TRAP_X, TRAP_DY, TRAP_KT, TRAP_PITCH, SUPER_M, WR_A0, WR_A1, WR_AMP_MIN, WR_AMP_MAX, WR_FREQ, WR_DAMP_STICK, ROLL_RATE, SINGLE_ENGINE_K, GEAR_TRAVEL, BASE_VS_MAX, BASE_LAT_TOL, CENTERLINE_K, AUTOBRAKE_DECEL, GEAR_H, aoaHoldDeg, aoaHoldDur, spdHold, simTime, flightMode, iceCloudUntil, DEBUG, Q, nogloc, kbActive } = env;

function updatePhysics(dt) {
  const clamp = THREE.MathUtils.clamp, sstep = THREE.MathUtils.smoothstep;
  const q = state.quaternion;
  if (autoland.on) { updateAutoland(dt); return; }
  if (combat.ally) {
    updateWingCat(dt, combat.ally);                        // wingmen finish their stroke after lead releases
    combatSys.updateJbd(combat.ally, cat.ph === 'HOLD' || cat.ph === 'LAUNCH', dt);
  }
  if (cat.ph === 'HOLD' || cat.ph === 'LAUNCH') { catTick(dt); return; }
  // Cloud ice: scalar state, no allocations. Clear air and afterburner melt it off.
  if (flightMode === 'FLY' && !autoland.on && !state.onGround) {
    const wet = E.iceForcedCloud ? 1 : (combat.playerCloud || 0);
    if (wet > ICE_CLOUD_T) {
      const k = (wet - ICE_CLOUD_T) / (1 - ICE_CLOUD_T) * 0.5 + 0.5;
      state.cloudIce = Math.min(1, state.cloudIce + dt / ICE_BUILD_S * k * (state.afterburner > 0.5 ? 0.5 : 1));
    } else {
      state.cloudIce = Math.max(0, state.cloudIce - dt / ICE_MELT_S * (state.afterburner > 0.5 ? ICE_AB_MELT_K : 1));
    }
    const warn = state.cloudIce > (E.iceCaution ? ICE_WARN_T - 0.05 : ICE_WARN_T + 0.05);
    if (warn !== E.iceCaution) {
      E.iceCaution = warn;
      if (warn) {
        E.iceCautionT = performance.now();
        combat.iceBannerT = E.iceCautionT;
        audio.masterCaution();
        if (performance.now() / 1000 - (window.__iceRadioT || -1e9) > 30) {
          window.__iceRadioT = performance.now() / 1000;
          rq.say({ id: 'ICE_WARN', text: "ANGEL, YOU'RE ICING UP — GET OUT OF THE SOUP OR LIGHT THE BURNERS", pri: 3, cat: 'MISSILE', ch: 'AWACS', duration: 4 }, { bypass: true });
        }
      }
    }
    combat.iceSlow = state.cloudIce > ICE_WARN_T;
  }
  const iceK = 1 - ICE_CTRL_LOSS * THREE.MathUtils.smoothstep(state.cloudIce, ICE_FROST_T, 1);
  // ---- PSM entry (air data from the last integrated velocity; one frame of lag is fine)
  const kts = Math.max(1, state.velocity.length()) * 1.94384;
  const stStick = updateStickAxes(dt);
  const pitchIn0 = stStick.pitch;
  const rollIn0 = stStick.roll;
  const highG0 = (keys.shift || (DEBUG && Q.has('highg'))) && Math.abs(pitchIn0) > 0.6;
  let psmActive = flightMode === 'FLY' && !state.onGround && kts < PSM_KT &&
    ((keys.b && keys.shift) || (highG0 && Math.abs(mouse.ny) > 0.8)) || (DEBUG && Q.has('psm'));
  state.psm = psmActive;
  _fw.set(0, 0, -1).applyQuaternion(q);
  const apex = Math.abs(_fw.y) > APEX_FY && kts < APEX_KT;
  // Once a hammerhead has been triggered, keep pivot authority through the whole turn.
  const pivot = apex || man.hammerT >= 0;
  if (DEBUG && Q.has('spintest') && simTime >= 1 && !man.spinTested) {
    man.spinTested = true; state.stalled = true; man.spinArm = 1;
    state.velocity.multiplyScalar(0.3);                       // enter at ~115 kt so the spin holds
  }
  // Landing gear travel: 1.6 s up <-> down; lock clunk at either end.
  {
    const g0 = state.gear, tgt = state.gearDown ? 1 : 0;
    state.gear = clamp(state.gear + Math.sign(tgt - state.gear) * dt / GEAR_TRAVEL, 0, 1);
    if (g0 !== state.gear && (state.gear === 0 || state.gear === 1)) audio.gearLock(state.gear === 1);
  }
  // ---- auto gear + ILS approach assist (all scratch objects are preallocated)
  if (flightMode === 'FLY') {
    const R = world.runway;
    E.gearCheckT += dt;
    if (E.gearCheckT >= 0.25) {
      E.gearCheckT = 0;
      let d = Math.min(Math.hypot(state.position.x - R.x, state.position.z - R.z0),
        Math.hypot(state.position.x - R.x, state.position.z - R.z1));
      if (combat.ally && combat.carrierVisible !== false) d = Math.min(d, state.position.distanceTo(combat.ally.pos));
      if (d < 1600 && state.radalt < 128 && kts < 250 && state.gear < 1 && !E.gearAutoLock) {
        toggleGear(); E.gearAutoLock = true; combatSys.say('GEAR DOWN — AUTO', 1.2);
      } else if (d > 3000 || kts > 300) E.gearAutoLock = false;
    }
    state.assist = 0;
    // Hands-off only: WASD input (which recentres the mouse) never counts as a neutral stick.
    const stickOK = !kbActive && Math.abs(mouse.nx) < 0.25 && Math.abs(mouse.ny) < 0.35;
    if (ilsVisible() && stickOK && kts < 260) {
      let lat = Infinity, alg = -1, targetYaw = 0, rx = 1, rz = 0, found = false;
      // RWY 36 final: threshold at R.z1, heading north (-Z), 3 degree slope.
      const rlat = state.position.x - R.x, ralg = state.position.z - R.z1;
      const rgy = R.elev + ralg * Math.tan(3 * D2R);
      if (ralg >= 0 && ralg <= 1300 && Math.abs(rlat) < 45 && Math.abs(state.position.y - rgy) < 70) {
        lat = rlat; alg = ralg; targetYaw = 0; rx = 1; rz = 0; found = true;
      }
      // Carrier centreline: stern is local +Z, bow -Z; slope from deck height.
      if (combat.ally && combat.carrierVisible !== false) {
        const a = combat.ally;
        _qInv.copy(a.root.quaternion).invert();
        _lp.copy(state.position).sub(a.pos).applyQuaternion(_qInv);
        const clat = _lp.x, calg = _lp.z - a.len / 2;
        const cgy = a.deckY + calg * Math.tan(3 * D2R);
        if (calg >= 0 && calg <= 1300 && Math.abs(clat) < Math.abs(lat) && Math.abs(clat) < 45 && Math.abs(state.position.y - cgy) < 70) {
          lat = clat; alg = calg; targetYaw = Math.atan2(-a.fwd.x, -a.fwd.z);
          _ilsRight.set(1, 0, 0).applyQuaternion(a.root.quaternion); rx = _ilsRight.x; rz = _ilsRight.z; found = true;
        }
      }
      if (found) {
        const k = 1 - Math.exp(-0.35 * dt);
        state.position.x -= rx * lat * k; state.position.z -= rz * lat * k;
        _ilsE.set(0, targetYaw, 0); _ilsQ.setFromEuler(_ilsE);
        q.slerp(_ilsQ, k);
        state.rollRate *= 1 - Math.min(1, 1.6 * dt);
        state.assist = 1;
      }
    }
  }
  // --- allied carrier trap detection (before any ground / flight integration)
  if (combat.ally && combat.carrierVisible !== false) {
    const ally = combat.ally;
    carrier.cool = Math.max(0, carrier.cool - dt);
    if (!carrier.phase && carrier.cool <= 0 && flightMode === 'FLY') {
      _qInv.copy(ally.root.quaternion).invert();
      _lp.copy(state.position).sub(ally.pos).applyQuaternion(_qInv);
      const half = ally.len / 2;
      const inZone = _lp.z >= half - 115 && _lp.z <= half - 50;
      const rel = _carrierVel.copy(state.velocity).sub(ally.vel).applyQuaternion(_qInv);
      const vAlong = -rel.z;
      if (inZone && Math.abs(_lp.x) < TRAP_X && Math.abs(state.position.y - ally.deckY) < TRAP_DY &&
          state.velocity.length() * 1.94384 < TRAP_KT && state.pitch > TRAP_PITCH && state.gear >= 1) {
        const wireZ = half - 64, wireZ2 = half - 78, wireZ3 = half - 92;
        let wire = 1, best = Math.abs(_lp.z - wireZ);
        if (Math.abs(_lp.z - wireZ2) < best) { wire = 2; best = Math.abs(_lp.z - wireZ2); }
        if (Math.abs(_lp.z - wireZ3) < best) { wire = 3; }
        carrier.phase = 'ARREST'; carrier.t = 0; carrier.v0 = Math.max(10, vAlong); carrier.wire = wire;
        carrier.pitDone = false;
        radioEvent('ON_CARRIER_TRAP');
        combat.trapT = performance.now(); combat.trapWire = wire;
        combat.traps = (combat.traps || 0) + 1;
        tele.event(EV.CARRIER_TRAP, state.position.x, state.position.z, simTime);
        combatSys.onCarrierTrap();
        E.blastShake = Math.max(E.blastShake, 0.45);
        onSfx('trap');
        onTouchdown(sinkFactor(E.vyPrev), 'CARRIER');
      }
    }
  }
  if (carrier.phase) { updateCarrierOp(dt); return; }
  if (state.onGround) { updateGround(dt); return; }
  _fwd.set(0, 0, -1).applyQuaternion(q); _up.set(0, 1, 0).applyQuaternion(q); _right.set(1, 0, 0).applyQuaternion(q);
  const bank = Math.atan2(_right.y, _up.y);
  state.bank = bank;
  if (state.assist) state.bank *= Math.exp(-0.4 * dt);          // ILS wings-level easing

  // --- air data
  let speed = Math.max(1, state.velocity.length());
  state.speed = speed;
  _vdir.copy(state.velocity).divideScalar(speed);
  // ?spdhold=m -- DEBUG-only airspeed clamp so headless Mach sweeps stay deterministic.
  if (DEBUG && spdHold > 0) { state.velocity.copy(_vdir).multiplyScalar(spdHold); speed = spdHold; state.speed = speed; }
  const rho = airDensity(state.position.y);
  const qBar = 0.5 * rho * speed * speed;
  const sos = 340.3 - 0.0041 * Math.min(state.position.y, 11000);
  const mach = speed / sos;
  state.mach = mach;
  if (E.prevMach < 1.0 && state.mach >= 1.0 && E.machArmed) { E.machArmed = false; onMach1(); }
  if (state.mach < 0.97) E.machArmed = true;
  // Supersonic vapour pulse: rising edge through Mach 1.05, once per 5 s crossing.
  if (E.superCD > 0) E.superCD = Math.max(0, E.superCD - dt);
  if (mach >= SUPER_M && E.superArmed && E.superCD <= 0) {
    E.superArmed = false; E.superCD = 5; vfx.machPulse(1);
    if (DEBUG) console.log('[ANGELS_ZERO] trans k=' + E.transK.toFixed(2) + ' super k=' + E.superK.toFixed(2) + ' pulse');
  }
  if (mach < SUPER_M - 0.02) E.superArmed = true;
  let alpha = Math.atan2(-_vdir.dot(_up), _vdir.dot(_fwd));
  const beta = Math.atan2(_vdir.dot(_right), _vdir.dot(_fwd));
  state.alpha = alpha; state.beta = beta;
  // ?aoahold=deg:s -- DEBUG-only AoA clamp (flight-second window) for headless wing-rock tests.
  if (aoaHoldDeg > 0 && E.aoaHoldT < aoaHoldDur && flightMode === 'FLY' && !state.onGround) {
    E.aoaHoldT += dt;
    alpha = aoaHoldDeg * D2R; state.alpha = alpha;
  }
  const mass = aircraftMass();
  state.mass = mass;
  const W = mass * GRAVITY;

  // --- pilot inputs
  const gforceActive = gforce.until > simTime && Math.abs(gforce.g) > 0.1 && flightMode === 'FLY';
  const pitchIn = gforceActive ? clamp((gforce.g - 1) / (gforce.g >= 1 ? 6.5 : 3), -1, 1) : pitchIn0;
  let rollIn = rollIn0;
  if (gforceActive) rollIn = 0;
  const rudderIn = rudderInput(dt);                                    // A / D, ramped 25 % -> 100 % over 0.22 s
  // High-G turn: hold W+S (throttle + brake) or Shift while pulling hard -> 9 G limit (7.5 G otherwise).
  state.highG = highG0;
  const pilotK = state.glocT > 0 ? 0 : (1 - (1 - PILOTK_MIN) * sstep(state.gStrain, PILOTK_S0, 0.99));
  state.pilotK = pilotK;

  // --- control authority from dynamic pressure, Mach stiffening, inertia
  const auth = sstep(qBar, 1500, Q_REF);                              // < ~230 kt / high altitude: mushy
  // At the apex the nose is vertical and q-bar is tiny; keep yaw/pitch authority
  // (Hammerhead / Ranversman pivot) while roll stays at its natural low-q value.
  const authQ = pivot ? Math.max(auth, APEX_AUTH_MIN) : auth;
  const machStiff = 1 - 0.38 * sstep(mach, 1.05, 1.5);               // supersonic pitch stiffening
  const st = storeCounts();
  const Ixx = INERTIA.xx + st.msl * 85 * 2.9 * 2.9 + st.bomb * 230 * 0.9 * 0.9;
  const Iyy = INERTIA.yy + st.bomb * 230 * 2.5 * 2.5;
  const Izz = INERTIA.zz + st.msl * 85 * 2.9 * 2.9 + st.bomb * 230 * 2.6 * 2.6;
  const kxx = INERTIA.xx / Ixx, kyy = INERTIA.yy / Iyy, kzz = INERTIA.zz / Izz;
  // Battle damage (src/combat.js): hydraulic leak stiffens the controls (-15 %);
  // a dead F100 caps thrust ~72 % and yaws the nose toward the dead side.
  const hydK = combat.hydraulic ? 0.85 : 1;
  const outSide = combat.engineOut === 'L' ? 1 : combat.engineOut === 'R' ? -1 : 0;   // +1 = nose-left pull

  // --- FCS: stick -> load-factor demand -> AoA demand. The CAS AoA limiter keeps
  // the demand below the 24 deg stall (max 23 deg) and smoothly tapers the
  // nose-up authority from 20 to 26 deg, so hard high-speed turns hold a steady,
  // planted high-alpha carve instead of crossing into a stall / recovery loop.
  const gMax = psmActive ? 12 : state.highG ? 9.0 : 7.5;                  // PSM: no G-limiter, keep G-strain model below
  let nCmd = pitchIn >= 0 ? 1 + pitchIn * (gMax - 1) : 1 + pitchIn * 3.0;    // push to -2 G
  if (roll.left > 0) nCmd = Math.max(nCmd, 2.2);                         // scripted barrel roll keeps a pull on
  nCmd *= pilotK;
  const clReq = nCmd * W / Math.max(qBar * WING_AREA, 1);
  // FBW AoA limiter is disabled in PSM — the nose is free to pass 90 degrees.
  let alphaCmd = clamp((clReq - CL0) / CL_ALPHA, ALPHA_MIN, psmActive ? 1.55 : ALPHA_LIMIT);
  // True low-speed stall with hysteresis: enter below 160 kt (or nose > +65 deg
  // below 190 kt), stay stalled until above 180 kt AND AoA < 16 deg.
  const pitchDeg = Math.asin(clamp(_fwd.y, -1, 1)) * 180 / Math.PI;
  // Landing configuration (gear down -> F-15 flaps follow the gear): the stall
  // moves down to 118 kt in / 132 kt out so the 145-175 kt approach is flyable.
  const ldg = state.gear > 0.9 || waveoff.st === 'ABORT', stallIn = ldg ? 118 : 160, stallOut = ldg ? 132 : 180;
  if (!state.stalled && (kts < stallIn || (pitchDeg > 65 && kts < 190))) state.stalled = true;
  else if (state.stalled && kts > stallOut && alpha < 16 * Math.PI / 180) state.stalled = false;
  // STALL warning, debounced in sim time: once triggered it holds >= 0.25 s.
  const stallCue = state.stalled || (alpha > 23.8 * Math.PI / 180 && kts < 260) || kts < (ldg ? 125 : 135);
  state.stallWarnT = stallCue ? 0.25 : Math.max(0, (state.stallWarnT || 0) - dt);
  // Flight-path turn rate produced by the current lift (body pitch must add it to hold AoA).
  // Post-stall aerodynamics: symmetric flat-plate lift/drag so inertia carries the
  // jet belly-first through a Cobra / Kulbit instead of snapping back to the airflow.
  const clNow = (psmActive || state.spin !== 0) && Math.abs(alpha) > STALL_AOA ? 1.1 * Math.sin(2 * alpha) : liftCoefficient(alpha);
  // Gravity component along the flight path from the *velocity* vector, never the
  // derived Euler pitch — so loops pass through vertical without feeding back.
  const gammaDot = (qBar * WING_AREA * clNow / mass - GRAVITY * Math.sqrt(Math.max(0, 1 - _vdir.y * _vdir.y))) / speed;
  let qCmd;
  if (psmActive) {
    // Free the nose: stick drives pitch directly through the vertical; no alpha
    // recovery spring. Full aft stick takes the jet through 90 deg and beyond.
    qCmd = clamp(pitchIn * 2.6 + gammaDot * 0.25, -3.6, 3.6) * PSM_PITCH_K;
  } else if (state.stalled) {
    // Critically damped gravity nose-drop: the nose eases onto the (descending)
    // velocity vector -- AoA driven smoothly to ~0, no snap, no oscillation.
    qCmd = clamp(gammaDot - alpha * 1.3, -0.6, 0.6);
  } else {
    // Lead-compensated AoA: alpha a moment ahead (body pitch rate minus flight-path
    // rate including decoupled AoA velocity coupling) so the limiter brakes cleanly
    // while tracking full nCmd load factor.
    const gammaDotEff = gammaDot + AOA_COUPLE * alpha;
    const alphaPred = alpha + 0.22 * (state.pitchRate - gammaDotEff);
    let aErr = (alphaCmd - alphaPred) * 6.0 * machStiff;
    if (aErr > 0) aErr *= 1 - sstep(alphaPred, (20 + AC.stallAoaAdd) * Math.PI / 180, (26 + AC.stallAoaAdd) * Math.PI / 180);   // CAS taper: F-22 TVC holds higher AoA
    qCmd = clamp(gammaDotEff + aErr, -1.4 * AC.pitchK, 1.4 * AC.pitchK);
  }
  if (waveoff.pitchBias > 0) {
    if (Math.abs(pitchIn0) > 0.15 || Math.abs(kbAxis.pitch) > 0.15 || Math.abs(rollIn0) > 0.15 || Math.abs(kbAxis.roll) > 0.15) waveoff.pitchBias = 0;  // pilot override
    else {
      const curPitch = Math.asin(clamp(_fwd.y, -1, 1));
      qCmd = clamp((waveoff.pitchBias - curPitch) * 2.0, -0.35, 0.45);
    }
  }
  // Pitch moment: control chases qCmd (inertia + q-scaled authority) with aero damping.
  const pitchGain = state.stalled ? 2.2 : (1.0 + 5.0 * authQ);             // stalled: heavy, critically damped
  let qDot = (qCmd - state.pitchRate) * pitchGain * kyy * machStiff * hydK * iceK * AC.pitchK;
  // Hammerhead pivot: with the nose vertical, neutral stick lets gravity tip it through.
  if (pivot) {
    // Hammerhead pivot: keep rotating nose-down through the vertical (no FCS
    // recovery spring fighting it), so the nose ends up pointing back at the ground.
    qCmd -= 1.2 + 0.6 * (1 - kts / APEX_KT);
    qDot = (qCmd - state.pitchRate) * pitchGain * kyy * machStiff * hydK * iceK * AC.pitchK;
    qDot += -0.6 * (1 - kts / APEX_KT);
  }
  state.pitchRate = clamp(state.pitchRate + qDot * dt, psmActive ? -3.6 : -1.4 * AC.pitchK, psmActive ? 3.6 : 1.4 * AC.pitchK);

  // Roll: up to ~240 deg/s at high q (higher on F-22A), degrading with AoA; dihedral rolls away from sideslip.
  const pMax = 4.2 * AC.rollK * (0.25 + 0.75 * auth) * (1 - 0.55 * sstep(alpha, 0.2, 0.45)) * hydK;
  let pCmd = (roll.left > 0 ? -roll.dir * ROLL_RATE : -rollIn * pMax * pilotK * (state.stalled ? 0.4 : 1)) * iceK;
  // Dihedral (roll due to sideslip): cut to 30 % for small / no rudder (|rudder| < 0.5,
  // i.e. taps) so flat nose nudges don't bank the wings; full with a held rudder.
  const smallYaw = Math.abs(rudderIn) < 0.5;
  if (!psmActive) pCmd += 0.5 * beta * auth * (smallYaw ? 0.3 : 1);   // no dihedral spring while post-stall
  // (high-AoA buffet is camera / airframe micro-vibration only -- see updateCameraAndVisuals)
  if (outSide) pCmd += outSide * 0.06;                                   // dead-engine roll-off (stick holds it)
  if (waveoff.pitchBias > 0) pCmd = clamp(-bank * 2.0, -0.5, 0.5);
  // Stop-damping: with no roll stick and no rudder key the rate converges 1.8x faster,
  // so the jet stops rotating when the input is released instead of coasting.
  const rollIdle = roll.left <= 0 && Math.abs(rollIn) < 0.04 && rudderIn === 0;
  state.rollRate += (pCmd - state.rollRate) * Math.min(1, (roll.left > 0 ? 12 : 1.5 + 6.5 * auth) * kxx * (rollIdle ? 1.8 : 1) * dt);
  if (E.wakeT > 0) { state.rollRate += E.wakeRoll * (E.wakeT / 0.25) * dt * 8; E.wakeT -= dt; }

  // --- High-AoA wing rock: bounded 20..24 deg roll oscillation, rate-only (no attitude snap).
  // Above 24 deg the existing PSM / stall / spin model owns roll. Active roll stick damps it out.
  const aoaDeg = alpha * 57.2958;
  E.wrAoa = aoaDeg;
  const wrAllowed = flightMode === 'FLY' && !autoland.on && !state.glocT &&
    cat.ph !== 'HOLD' && cat.ph !== 'LAUNCH' && cat.ph !== 'WAIT';
  if (wrAllowed) {
    E.wrK = sstep(aoaDeg, WR_A0, WR_A0 + 1) * (1 - sstep(aoaDeg, 23.5, WR_A1));
    const amp = WR_AMP_MIN + (WR_AMP_MAX - WR_AMP_MIN) * sstep(aoaDeg, WR_A0, WR_A1);
    const damp = clamp(1 - WR_DAMP_STICK * (Math.abs(rollIn) / 0.3), 0.3, 1);
    E.wrPhase += 2 * Math.PI * WR_FREQ * dt;
    const ampR = E.wrK * damp * amp * D2R;
    E.wrRoll = ampR * Math.sin(E.wrPhase);
    state.rollRate += ampR * (2 * Math.PI * WR_FREQ) * Math.cos(E.wrPhase) * 0.9 * dt;
    if (DEBUG && E.wrK > 0.3) {
      E.feelLogT += dt;
      if (E.feelLogT >= 1) {
        E.feelLogT = 0;
        console.log('[ANGELS_ZERO] wingrock aoa=' + aoaDeg.toFixed(1) + ' amp=' + amp.toFixed(1) + ' damp=' + damp.toFixed(2));
      }
    }
  } else { E.wrK = 0; E.wrRoll = 0; }

  // Yaw: rudder + weathercock stability (nose into the airflow) + adverse yaw from roll.
  // Post-stall: the vertical fin is blanketed by the broken airflow — no weathercock
  // once AoA is extreme, so a Cobra holds heading instead of yawing away.
  const wcK = pivot || (psmActive && Math.abs(alpha) > 45 * D2R) ? 0 : (psmActive ? 0.25 : 1);
  let rCmd = rudderIn * 0.32 * (0.3 + 0.7 * authQ) - beta * (0.6 + 2.6 * authQ) * wcK - 0.06 * state.rollRate
    + outSide * 0.085 * (0.3 + state.throttle + 0.6 * state.afterburner) * (0.4 + 0.6 * authQ);   // asymmetric thrust yaw
  if (psmActive) rCmd *= PSM_YAW_K;
  if (pivot) rCmd *= 8;                                           // Hammerhead / Ranversman pivot at the vertical
  // Rudder released: 2.5x yaw stop-damping (no coasting yaw overshoot after a tap).
  state.yawRate += (rCmd - state.yawRate) * Math.min(1, (1.2 + 3.0 * authQ) * kzz * (rudderIn === 0 ? 2.5 : 1) * dt);

  // ---- flat spin: entry (stalled + opposite rudder/roll held 0.8 s), sustained yaw,
  // pitch-rate damping, slow roll and airspeed bleed; recovery on neutral stick +
  // opposite rudder for 1.2 s, or above 180 kt.
  if (state.stalled && state.spin === 0 && Math.abs(rudderIn) > 0.6 && Math.abs(rollIn) > 0.3 && Math.sign(rollIn) === -Math.sign(rudderIn)) {
    man.entryT += dt;
    if (man.entryT >= 0.8) { state.spin = Math.sign(rudderIn); man.entryT = 0; man.spinT = 0; }
  } else man.entryT = 0;
  if (man.spinArm) { state.spin = state.spin || 1; man.spinArm = 0; man.spinT = 0; }
  if (state.spin !== 0) {
    state.yawRate += (state.spin * 2.1 - state.yawRate) * 1.5 * dt;
    state.pitchRate *= 0.3;
    state.rollRate += 0.4 * state.spin * dt;
    man.spinT += dt;
    const neutral = Math.abs(pitchIn) < 0.1 && Math.abs(rollIn) < 0.1;
    if (neutral && Math.abs(rudderIn) > 0.6 && Math.sign(rudderIn) === -state.spin) {
      man.recT += dt; if (man.recT >= 1.2) { state.spin = 0; man.recT = 0; }
    } else man.recT = 0;
    if (kts > 180 && man.spinT > 0.2) { state.spin = 0; man.recT = 0; }
  }

  // Storm gusts kick the body rates (src/weather.js).
  if (weather && weather.current.turb > 0.01) { state.rollRate += weather.gust.roll * 6 * dt; state.pitchRate += weather.gust.pitch * 6 * dt; }

  rotateBody(AX_X, state.pitchRate * dt);
  rotateBody(AX_Z, state.rollRate * dt);
  rotateBody(AX_Y, state.yawRate * dt);
  q.normalize();
  state.barrelRoll = roll.left > 0;
  if (roll.left > 0) { roll.left -= Math.abs(state.rollRate) * dt; if (roll.left <= 0) roll.left = 0; }

  // Normalised commands for the articulated control surfaces (src/surfaces.js).
  state.ctl.pitch = clamp(pitchIn * pilotK + (qCmd - state.pitchRate) * 0.6, -1, 1);
  state.ctl.roll = clamp(state.rollRate / 4.2 + (pCmd - state.rollRate) * 0.15, -1, 1);
  state.ctl.yaw = clamp(rudderIn * 0.8 + state.yawRate * 1.5, -1, 1);
  updateAirbrake(dt, mach);
  updateThrottle(dt);

  // --- forces (body axes after this step's rotation)
  _fwd.set(0, 0, -1).applyQuaternion(q); _up.set(0, 1, 0).applyQuaternion(q); _right.set(1, 0, 0).applyQuaternion(q);
  const a2 = Math.atan2(-_vdir.dot(_up), _vdir.dot(_fwd));
  const b2 = Math.atan2(_vdir.dot(_right), _vdir.dot(_fwd));
  const postStall = (psmActive || state.spin !== 0) && Math.abs(a2) > STALL_AOA;
  const CL = postStall ? 1.1 * Math.sin(2 * a2) : liftCoefficient(a2);
  // Lift perpendicular to the airflow in the plane of symmetry.
  _lift.crossVectors(_right, _vdir);
  if (_lift.lengthSq() < 1e-8) _lift.copy(_up);
  _lift.normalize().multiplyScalar(qBar * WING_AREA * CL);
  // Fuselage side force pulls the velocity vector back toward the nose.
  _side.copy(_right).addScaledVector(_vdir, -_vdir.dot(_right));
  if (_side.lengthSq() > 1e-8) _side.normalize().multiplyScalar(-qBar * WING_AREA * CY_BETA * b2);
  else _side.set(0, 0, 0);
  // Drag build-up.
  const wave = 0.034 * sstep(mach, 0.92, 1.04) - 0.012 * sstep(mach, 1.15, 1.7);   // transonic drag rise
  const form = 1.1 * Math.pow(Math.sin(Math.min(Math.abs(a2), 1.2)), 2) * sstep(Math.abs(a2), 0.3, 0.6);
  // Post-stall flat-plate drag, with PSM-induced drag multiplied for the energy bleed.
  const CD = (postStall ? CD0 + 1.8 * Math.sin(a2) ** 2 + (psmActive ? PSM_DRAG_K * 0.1 : 0)
    : CD0 + K_INDUCED * CL * CL * (psmActive ? PSM_DRAG_K : 1) + wave + form + configDrag()) * AC.dragK;
  state.cd = CD; state.cl = CL;
  const thrust = (THRUST_DRY * AC.thrustDryK * state.throttle + THRUST_AB * AC.thrustAbK * state.afterburner) * (0.55 + 0.45 * rho / 1.225) * ceilThrustK(state.position.y) * (1 + 0.12 * Math.min(mach, 1.6))
    * (outSide ? SINGLE_ENGINE_K : 1);                                 // one F100 down: 58 % max thrust
  _aero.copy(_lift).add(_side).addScaledVector(_vdir, -qBar * WING_AREA * CD * (1 + ICE_DRAG_K * state.cloudIce));
  _force.copy(_aero).addScaledVector(_fwd, thrust);
  _force.y -= W;
  // Storm gust: +/-0.4 G along the lift axis.
  if (weather && weather.current.turb > 0.01) _force.addScaledVector(_up, weather.gust.g * W);
  state.velocity.addScaledVector(_force, dt / mass);

  // ---- decoupled AoA: rate-limit the turn of the velocity vector toward the nose.
  // Normal coupling is fast (small AoA); PSM slows it to 0.32 /s so the jet keeps
  // flying belly-first on inertia and the nose can pass vertical.
  {
    const sp = state.velocity.length();
    if (sp > 1) {
      _nose.set(0, 0, -1).applyQuaternion(q);
      _vdir.copy(state.velocity).divideScalar(sp);
      const k = 1 - Math.exp(-(psmActive ? AOA_COUPLE_PSM : AOA_COUPLE) * dt);
      _vdir.lerp(_nose, k).normalize();
      state.velocity.copy(_vdir).multiplyScalar(sp);
    }
    // Flat spin: bleed to 70-110 kt.
    if (state.spin !== 0) {
      const s2 = state.velocity.length();
      if (s2 > 1) state.velocity.multiplyScalar(Math.max(70 / 1.94384, s2 * (1 - 0.5 * dt)) / s2);
    }
  }
  // Recompute AoA / sideslip from body-frame velocity, no clamp (full +/-180 deg).
  _up.set(0, 1, 0).applyQuaternion(q); _right.set(1, 0, 0).applyQuaternion(q);
  _vdir.copy(state.velocity).normalize();
  state.alpha = Math.atan2(-_vdir.dot(_up), _vdir.dot(_fwd));
  state.beta = Math.atan2(_vdir.dot(_right), _vdir.dot(_fwd));

  // Load factor felt by the pilot: non-gravitational force along the jet's up axis.
  const gFelt = (_force.dot(_up) + W * _up.y) / W;
  state.gLoad += (gFelt - state.gLoad) * Math.min(1, 14 * dt);

  // Pilot G physiology: low-passed load drives strain; hold then drain on unload.
  if (flightMode === 'FLY' && !autoland.on && cat.ph !== 'HOLD' && cat.ph !== 'LAUNCH' && !state.onGround) {
    if (gforceActive) state.gLoad = gforce.g;                 // debug: hold an exact load
    const gl = clamp(state.gLoad, -6, 11);
    state.gSmooth += (gl - state.gSmooth) * Math.min(1, dt / 0.08);
    const G = state.gSmooth;
    if (state.glocT > 0) {
      state.glocT = Math.max(0, state.glocT - dt);
      state.gStrain = Math.max(0, state.gStrain - G_DRAIN_UNLOAD * dt);
      if (state.glocT <= 0) {
        state.gStrain = Math.min(state.gStrain, GLOC_WAKE_S);
        state.glocWakeT = 1.2;
        if (typeof audio !== 'undefined' && audio.gasp) audio.gasp(true);
        if (DEBUG) console.log('[ANGELS_ZERO] gloc wake alt=' + Math.round(state.position.y));
      }
    } else {
      const gOnset = Math.max(3.5, G_ONSET - (state.gPushPull || 0));
      if (G > gOnset) {
        state.gStrain += G_RATE_A * Math.pow(G - gOnset, G_RATE_P) * dt;
        state.gHoldT = G_HOLD_S;
        state.gPeak = Math.max(state.gPeak, state.gStrain);
      } else if (state.gHoldT > 0) {
        state.gHoldT = Math.max(0, state.gHoldT - dt);
      } else {
        state.gStrain -= (G <= 1.5 ? G_DRAIN_UNLOAD : G_DRAIN) * dt;
      }
      state.gStrain = clamp(state.gStrain, 0, 1);
      if (state.gStrain >= 0.99 && !nogloc) {
        state.glocT = GLOC_T;
        if (DEBUG) console.log('[ANGELS_ZERO] gloc enter G=' + state.gLoad.toFixed(1) + ' alt=' + Math.round(state.position.y));
      }
    }
    if (G < 0.5) state.gPushPull = clamp((state.gPushPull || 0) + 0.35 * (0.5 - G) * dt, 0, 1.5);
    else state.gPushPull = Math.max(0, (state.gPushPull || 0) - 0.12 * dt);
    if (G < GNEG_ONSET) state.gNeg = clamp(state.gNeg + GNEG_RATE * (-G + GNEG_ONSET) * dt, 0, 1);
    else state.gNeg = Math.max(0, state.gNeg - GNEG_DRAIN * dt);
    state.negGStrain = state.gNeg;
    if (G < 2.5 && state.gPeak > 0.55 && !state.glocT) {
      state.gPeak = 0;
      if (typeof audio !== 'undefined' && audio.gasp) audio.gasp(false);
    }
  }
  state.position.addScaledVector(state.velocity, dt);

  const ground = groundLevel(state.position.x, state.position.z);
  state.radalt = state.position.y - ground;
  state.pitch = Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1));
  state.heading = (Math.atan2(_fwd.x, -_fwd.z) * 180 / Math.PI + 360) % 360;
  if (flightMode === 'FLY') {
    // Gear out: the lowest tyre is the first contact. A valid runway touchdown
    // goes ON_GROUND, anything else (off the strip, gear in transit, banked,
    // too fast, slammed in) is a crash. Gear up: belly contact = crash.
    if (state.gear > 0.05 && lowestWheelY() <= ground + 0.02) {
      const td = touchdownCheck(ground);
      if (td.ok) enterGround(td); else { if (DEBUG) console.log('[ANGELS_ZERO] touchdown rejected:', td.why); triggerEject('crash'); }
    } else if (cat.grace <= 0 && state.radalt <= 0.5) { if (DEBUG) console.log('[ANGELS_ZERO] crash radalt', state.position.toArray().map(v=>v.toFixed(1)).join(','), 'ground', groundLevel(state.position.x, state.position.z).toFixed(1), 'map', world.map && world.map.heightFn); triggerEject('crash'); }
    else if (cat.grace <= 0 && (combatSys.allyCollision() || world.collide(state.position, 3))) { if (DEBUG) console.log('[ANGELS_ZERO] crash collide', state.position.toArray().map(v=>v.toFixed(0)).join(',')); triggerEject('crash'); }   // carrier deck/hull + island, then static obstacles
  }
  // ---- post-stall maneuver detection: accumulators only, no per-frame allocation.
  man.t += dt;
  man.alphaPk = Math.max(man.alphaPk * Math.exp(-0.3 * dt), Math.abs(state.alpha));
  state.alphaPk = man.alphaPk;
  man.pitchAcc += state.pitchRate * dt;
  man.yawAcc += state.yawRate * dt;
  const manNow = performance.now();
  // COBRA: > 75 deg AoA in PSM, recovered below 25 deg within 3 s with < 30 deg heading change.
  if (psmActive && state.alpha > 75 * D2R && man.cobraT < 0) { man.cobraT = man.t; man.cobraHdg = man.yawAcc; }
  if (man.cobraT >= 0) {
    if (state.alpha < 25 * D2R) {
      // Euler heading flips through vertical; integrated yaw is the stable measure.
      if (Math.abs(man.yawAcc - man.cobraHdg) < 30 * D2R) awardManeuver('[ PSM // COBRA ]', manNow);
      man.cobraT = -1;
    } else if (man.t - man.cobraT > 3) man.cobraT = -1;
  }
  // KULBIT: full 360 deg pitch integrated while in PSM within 4.5 s. A just-flown
  // Cobra gets a short window so it isn't immediately overwritten by the loop.
  if (psmActive && man.kulbitT < 0 && Math.abs(state.pitchRate) > 0.4 && man.t - man.cobraAwardT > 1.0) { man.kulbitT = man.t; man.pitchAcc = 0; }
  if (man.kulbitT >= 0) {
    if (Math.abs(man.pitchAcc) >= 2 * Math.PI) { awardManeuver('[ PSM // KULBIT ]', manNow); man.kulbitT = -1; man.pitchAcc = 0; }
    else if (man.t - man.kulbitT > 4.5) { man.kulbitT = -1; man.pitchAcc = 0; }
  }
  // HAMMERHEAD: vertical nose, then >= 150 deg of yaw with the nose past vertical within 4 s.
  if (apex && man.hammerT < 0) { man.hammerT = man.t; man.hammerHdg = state.heading; man.yawAcc = 0; }
  if (man.hammerT >= 0) {
    _fw.set(0, 0, -1).applyQuaternion(q);
    if (Math.abs(man.yawAcc) >= 150 * D2R && _fw.y < -0.6) { awardManeuver('[ STALL TURN // HAMMERHEAD ]', manNow); man.hammerT = -1; man.yawAcc = 0; }
    else if (man.t - man.hammerT > 4) { man.hammerT = -1; man.yawAcc = 0; }
  }
  // FLAT SPIN: sustained for more than a second.
  if (state.spin !== 0 && man.spinT > 1 && man.spinT < 4) awardManeuver('[ FLAT SPIN ]', manNow);
  if (state.spin === 0) man.spinT = 0;

  E.prevMach = state.mach;
}

/* ---------------------------------------------------------------------------
   LANDING GEAR, SPEEDBRAKE, TOUCHDOWN, GROUND ROLL, RUNWAY PIT STOP
   - Drag: gear +0.35 and speedbrake +0.9 "drag factor", scaled to the F-15's
     ~0.05 cruise CD: gear dCD +0.0175 x progress, brake dCD +0.045 x deflection.
   - Touchdown on ARCHIPELAGO AFB (RWY 18/36) needs gear > 0.9, |bank| < 18 deg,
     < 205 kt, sink rate better than -9.5 m/s, pitch -4..+17 deg.
   - ON_GROUND: heading + pitch only, nose-wheel steering on A/D (0.42 rad/s
     taxiing -> 0.05 at 140 kt), rolling friction 0.025 N, wheel brakes 0.5 N
     on Ctrl or B, rotation above 120 kt (pitch up to 14 deg), lift-off above
     155 kt once lift reaches the weight. Leaving the paved airfield = crash.
   - Below 25 kt: 4 s REARMING & REPAIRING, then full stores / gun / flares /
     airframe / engines / fuel; rolling above 30 kt first aborts it.
   --------------------------------------------------------------------------- */

  return { updatePhysics, getFlightTelemetry: () => ({ aoaHoldT: E.aoaHoldT, wrK: E.wrK,
    wrPhase: E.wrPhase, superCD: E.superCD }) };
}
