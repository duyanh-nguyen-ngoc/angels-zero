// ANGELS ZERO — guided 6-step flight & weapons qualification.
// Zero allocations per frame: one preallocated state object, scalar timers only.

const STEPS = [
  { id: 'THROTTLE', title: 'LIGHT AFTERBURNER', hint: 'HOLD SHIFT / WHEEL UP' },
  { id: 'BANK', title: 'ROLL & PULL A 4G TURN', hint: 'MOUSE / A-D + S' },
  { id: 'CAMERA', title: 'CYCLE VIEWS: CHASE / COCKPIT / NOSE', hint: 'SPACE' },
  { id: 'LOCK_FIRE', title: 'LOCK DRONE & SPLASH WITH MISSILE', hint: 'C  THEN  RMB / M' },
  { id: 'FLARE', title: 'INCOMING MISSILE — DEPLOY FLARES', hint: 'X' },
  { id: 'GUN_PASS', title: 'SPLASH DRONE WITH VULCAN CANNON', hint: 'LMB / F' }
];

export function createTraining(THREE, env) {
  const S = env.state, C = env.combat, CS = env.combatSys;
  const _st = { active: false, step: 1, total: 6, id: STEPS[0].id, title: STEPS[0].title,
    hint: STEPS[0].hint, progress: 0, done: false };
  let t = 0, camStart = '', kills0 = 0, flares0 = 0, spawnAt = 0, doneT = 0, announced = false;

  function setStep(n) {
    _st.step = n;
    const s = STEPS[n - 1];
    _st.id = s.id; _st.title = s.title; _st.hint = s.hint; _st.progress = 0;
    t = 0; announced = false;
    if (n === 3) camStart = env.getCamMode ? env.getCamMode() : 'CHASE';
    if (n === 4 || n === 6) { kills0 = C.kills || 0; spawnAt = 0; }
    if (n === 5) { flares0 = C.flares || 0; C.missileWarning = 3.0; }
  }
  function say(text, secs = 3) {
    if (!env.rq) return;
    env.rq.say({ id: 'TRAIN_STEP', text, pri: 3, cat: 'STORY', ch: 'AWACS', duration: secs }, { bypass: true });
  }
  function reset() {
    _st.active = true; _st.done = false; doneT = 0;
    setStep(1);
    say('OVERLORD: WARDEN-1, TRAINING SORTIE. STEP ONE — LIGHT THE BURNER.', 4);
  }
  // Debug jump: ?trainingstep=N (1..6).
  function jump(n) {
    if (!_st.active) { _st.active = true; _st.done = false; }
    setStep(Math.max(1, Math.min(6, n | 0)));
  }
  function advance() {
    if (_st.step >= 6) {
      _st.done = true; _st.active = false; doneT = 0;
      if (env.audio && env.audio.styleChime) env.audio.styleChime(3);
      say('OVERLORD: QUALIFICATION COMPLETE — CLEARED FOR COMBAT SORTIES', 4);
      try { localStorage.setItem('angelsZero_trained', '1'); } catch (e) { /* storage unavailable */ }
      return;
    }
    if (env.audio && env.audio.styleChime) env.audio.styleChime(1);
    setStep(_st.step + 1);
    say('OVERLORD: STEP ' + _st.step + '/6 — ' + _st.title + '. ' + _st.hint, 4);
  }
  function spawnTarget(dist) {
    if (!CS || !CS.spawnTrainingDrone || spawnAt) return;
    spawnAt = 1;
    const fwd = _fwd.set(0, 0, -1).applyQuaternion(S.quaternion);
    _pos.copy(S.position).addScaledVector(fwd, dist);
    CS.spawnTrainingDrone(_pos, 115, _st.step === 6 ? 25 : 100);
  }

  const _fwd = new THREE.Vector3(), _pos = new THREE.Vector3();

  function update(dt) {
    if (!_st.active) {
      if (_st.done) { doneT += dt; if (doneT >= 3 && env.onComplete) { env.onComplete(); doneT = -1e9; } }
      return;
    }
    // Beginner safety net: no crash loops during qualification.
    if (C.health < 50) C.health = 50;
    if (S.position.y < 180 && S.velocity.y < 0) { S.position.y = 180; S.velocity.y = Math.max(0, S.velocity.y); S.pitchRate += 0.4 * dt; }

    switch (_st.step) {
      case 1:
        if (S.afterburner > 0.6) { t += dt; _st.progress = Math.min(1, t / 0.8); if (t >= 0.8) advance(); }
        else { t = Math.max(0, t - dt * 2); _st.progress = t / 0.8; }
        break;
      case 2:
        if (Math.abs(S.bank) > 0.7 && S.gLoad > 3.2) { t += dt; _st.progress = Math.min(1, t / 0.6); if (t >= 0.6) advance(); }
        else { t = Math.max(0, t - dt); _st.progress = t / 0.6; }
        break;
      case 3: {
        const m = env.getCamMode ? env.getCamMode() : 'CHASE';
        _st.progress = m !== camStart ? 1 : 0;
        if (m !== camStart) advance();
        break;
      }
      case 4:
        spawnTarget(2200);
        _st.progress = Math.min(1, Math.max(0, (C.kills || 0) - kills0));
        if ((C.kills || 0) > kills0) advance();
        break;
      case 5:
        if (!announced) { announced = true; say('OVERLORD: MISSILE LAUNCH — FLARES, FLARES!', 3); }
        C.missileWarning = Math.max(C.missileWarning || 0, 3.0 - t * 0.5);
        _st.progress = Math.min(1, (flares0 - (C.flares || 0)) / Math.max(1, flares0));
        if ((C.flares || 0) < flares0) advance();
        break;
      case 6:
        spawnTarget(1200);
        _st.progress = Math.min(1, Math.max(0, (C.kills || 0) - kills0));
        if ((C.kills || 0) > kills0) advance();
        break;
    }
  }

  return { reset, update, jump, get state() { return _st; } };
}
