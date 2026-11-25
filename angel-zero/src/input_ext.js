// ANGELS ZERO — Gamepad API + mobile touch controls.
// Zero per-frame allocations: one reused state object, scalar timers only.
// Desktop mouse/keyboard behaviour is untouched unless a stick is deflected or touch is active.

const DZ = 0.12, INVERT_KEY = 'az_gp_invert';

function curve(v) {
  const a = Math.abs(v);
  if (a <= DZ) return 0;
  const k = (a - DZ) / (1 - DZ);
  return (v < 0 ? -1 : 1) * k * k * Math.sqrt(k);   // cubic-ish response, smooth near centre
}

export function createInputExt(THREE, env) {
  const _st = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, ab: false, brake: false, fire: false, active: false };
  const prev = new Uint8Array(32);
  let padIndex = -1, hasGamepad = false, touchTest = false, touchOn = false;
  let lookYaw = 0, lookPitch = 0, thrLevel = 0.5, stickPointer = -1, thrPointer = -1;
  let invert = true;
  try { invert = localStorage.getItem(INVERT_KEY) !== '0'; } catch (e) { /* storage unavailable */ }

  function setInvert(on) { invert = !!on; try { localStorage.setItem(INVERT_KEY, on ? '1' : '0'); } catch (e) {} }
  function toast(text) { if (env.onToast) env.onToast(text); }
  function pulseHaptic(strong = 0.5, weak = 0.3, ms = 70) {
    if (!hasGamepad || padIndex < 0) return;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = pads[padIndex];
      const act = p && p.vibrationActuator;
      if (act && act.playEffect) act.playEffect('dual-rumble',
        { duration: ms, strongMagnitude: strong, weakMagnitude: weak, startDelay: 0 });
    } catch (e) { /* haptics optional */ }
  }
  function edge(i, on) { const now = !!on, was = !!prev[i]; prev[i] = now ? 1 : 0; return now && !was; }
  function press(name) { const fn = env['on' + name]; if (fn) fn(); }

  function pollGamepad(dt) {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let p = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].mapping === 'standard') { p = pads[i]; padIndex = i; break; }
    if (!p) { hasGamepad = false; _st.active = false; return; }
    if (!hasGamepad) { hasGamepad = true; toast('GAMEPAD CONNECTED: ' + String(p.id || 'CONTROLLER').slice(0, 32)); }
    const ax = p.axes, btn = p.buttons;
    _st.roll = curve(ax[0] || 0);
    _st.pitch = (invert ? -1 : 1) * curve(ax[1] || 0);
    _st.yaw = ((btn[5] && btn[5].value > 0.5 ? 1 : 0) - (btn[4] && btn[4].value > 0.5 ? 1 : 0));
    const rt = btn[7] ? (btn[7].value || 0) : 0, lt = btn[6] ? (btn[6].value || 0) : 0;
    _st.ab = rt > 0.85; _st.brake = lt > 0.75;
    _st.throttleDelta = rt - lt;
    _st.fire = !!(btn[0] && btn[0].pressed);
    if (edge(1, btn[1] && btn[1].pressed)) press('MissileDown');
    if (prev[1] && !(btn[1] && btn[1].pressed)) { press('MissileUp'); prev[1] = 0; }
    if (edge(3, btn[3] && btn[3].pressed)) press('Lock');
    if (edge(2, btn[2] && btn[2].pressed)) press('Weapon');
    if (edge(10, btn[10] && btn[10].pressed)) press('Flare');
    if (edge(11, btn[11] && btn[11].pressed)) press('Chaff');
    if (edge(8, btn[8] && btn[8].pressed)) press('Camera');
    if (edge(9, btn[9] && btn[9].pressed)) press('Pause');
    const rx = curve(ax[2] || 0), ry = curve(ax[3] || 0);
    if (Math.abs(rx) > 0.18 || Math.abs(ry) > 0.18) {
      lookYaw += rx * 60 * dt; lookPitch += ry * 60 * dt;
      if (env.freeLook && env.freeLook.debugHold) env.freeLook.debugHold(true, lookYaw, lookPitch);
    } else if (lookYaw || lookPitch) {
      lookYaw = 0; lookPitch = 0;
      if (env.freeLook && env.freeLook.debugHold) env.freeLook.debugHold(false, 0, 0);
    }
    _st.active = Math.abs(_st.roll) > DZ || Math.abs(_st.pitch) > DZ;
  }

  /* ---------------- mobile touch HUD ---------------- */
  let root = null, stickEl = null, knob = null, thrEl = null;
  const touchBtns = [];                                   // preallocated: one record per action button
  function releaseButton(b) {
    if (!b || !b._active) return;
    b._active = false; b._pid = -1;
    const act = b.dataset.act;
    if (act === 'Fire') { _st.fire = false; press('FireUp'); }
    else if (act === 'Missile') press('MissileUp');
  }
  function releaseAllTouch() {
    for (let i = 0; i < touchBtns.length; i++) releaseButton(touchBtns[i]);
    stickPointer = -1; thrPointer = -1;
    _st.pitch = 0; _st.roll = 0;
    if (knob) { knob.style.left = '46px'; knob.style.top = '46px'; }
  }
  function el(tag, css, parent) {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }
  function initTouchControls() {
    if (root) return;
    root = el('div', 'position:fixed;inset:0;z-index:30;pointer-events:none;display:none;touch-action:none;user-select:none;-webkit-user-select:none', document.body);
    root.id = 'touchHUD';
    stickEl = el('div', 'position:absolute;left:18px;bottom:18px;width:128px;height:128px;border:2px solid rgba(104,247,204,.75);border-radius:50%;pointer-events:auto;touch-action:none;background:rgba(0,20,14,.28)', root);
    knob = el('div', 'position:absolute;left:46px;top:46px;width:36px;height:36px;border-radius:50%;background:rgba(104,247,204,.55)', stickEl);
    thrEl = el('div', 'position:absolute;left:18px;bottom:170px;width:34px;height:170px;border:1px solid rgba(104,247,204,.7);pointer-events:auto;touch-action:none;background:rgba(0,20,14,.35)', root);
    el('div', 'position:absolute;left:0;bottom:0;width:100%;height:15%;background:rgba(255,184,56,.35)', thrEl);
    const actions = [['GUN', 'Fire'], ['MSL', 'Missile'], ['LOCK', 'Lock'], ['WPN', 'Weapon'], ['FLR', 'Flare'], ['CAM', 'Camera']];
    for (let i = 0; i < actions.length; i++) {
      const b = el('button', 'position:absolute;right:' + (16 + (i % 3) * 60) + 'px;bottom:' + (18 + Math.floor(i / 3) * 60) + 'px;width:52px;height:52px;border:1px solid rgba(104,247,204,.8);background:rgba(0,20,14,.6);color:#9dffe0;font:600 11px monospace;pointer-events:auto;touch-action:none', root);
      b.textContent = actions[i][0]; b.dataset.act = actions[i][1];
      b._active = false; b._pid = -1;
      touchBtns.push(b);
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* capture optional */ }
        b._active = true; b._pid = e.pointerId;
        if (b.dataset.act === 'Fire') { _st.fire = true; press('FireDown'); }
        else if (b.dataset.act === 'Missile') press('MissileDown');
        else if (b.dataset.act === 'Lock') press('Lock');
        else if (b.dataset.act === 'Weapon') press('Weapon');
        else if (b.dataset.act === 'Flare') { press('Flare'); press('Chaff'); }
        else if (b.dataset.act === 'Camera') press('Camera');
      });
      b.addEventListener('pointerup', e => { e.preventDefault(); e.stopPropagation(); releaseButton(b); });
      b.addEventListener('pointercancel', e => { e.preventDefault(); e.stopPropagation(); releaseButton(b); });
      b.addEventListener('lostpointercapture', () => releaseButton(b));
    }
    // Safety net: if capture is lost or the finger leaves the button, still release.
    function releaseByPointer(e) {
      for (let i = 0; i < touchBtns.length; i++) {
        const b = touchBtns[i];
        if (b._active && b._pid === e.pointerId) releaseButton(b);
      }
    }
    window.addEventListener('pointerup', releaseByPointer, true);
    window.addEventListener('pointercancel', releaseByPointer, true);
    window.addEventListener('blur', releaseAllTouch);
    const pause = el('button', 'position:absolute;right:18px;top:18px;padding:6px 12px;border:1px solid rgba(104,247,204,.8);background:rgba(0,20,14,.6);color:#9dffe0;font:600 11px monospace;pointer-events:auto;touch-action:none', root);
    pause.textContent = 'PAUSE';
    pause.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press('Pause'); });

    stickEl.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); stickPointer = e.pointerId;
      stickEl.setPointerCapture && stickEl.setPointerCapture(e.pointerId); moveStick(e);
    });
    stickEl.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) { e.preventDefault(); moveStick(e); } });
    const endStick = e => { if (e.pointerId !== stickPointer) return; stickPointer = -1; _st.pitch = 0; _st.roll = 0; knob.style.left = '46px'; knob.style.top = '46px'; };
    stickEl.addEventListener('pointerup', endStick);
    stickEl.addEventListener('pointercancel', endStick);
    stickEl.addEventListener('lostpointercapture', () => { stickPointer = -1; _st.pitch = 0; _st.roll = 0; knob.style.left = '46px'; knob.style.top = '46px'; });
    thrEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); thrPointer = e.pointerId; thrEl.setPointerCapture && thrEl.setPointerCapture(e.pointerId); moveThr(e); });
    thrEl.addEventListener('pointermove', e => { if (e.pointerId === thrPointer) { e.preventDefault(); moveThr(e); } });
    const endThr = e => { if (e.pointerId === thrPointer) thrPointer = -1; };
    thrEl.addEventListener('pointerup', endThr);
    thrEl.addEventListener('pointercancel', endThr);
    thrEl.addEventListener('lostpointercapture', () => { thrPointer = -1; });
  }
  function moveStick(e) {
    const r = stickEl.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    let y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    _st.roll = x; _st.pitch = -y;
    knob.style.left = (46 + x * 40) + 'px'; knob.style.top = (46 + y * 40) + 'px';
  }
  function moveThr(e) {
    const r = thrEl.getBoundingClientRect();
    thrLevel = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    _st.throttleDelta = thrLevel - 0.5;
    _st.ab = thrLevel > 0.85; _st.brake = thrLevel < 0.12;
  }

  function update(dt) {
    pollGamepad(dt);
    const playing = env.getAppMode && env.getAppMode() === 'PLAY';
    const show = !!root && playing && (env.isTouchDevice || touchTest);
    if (root) root.style.display = show ? 'block' : 'none';
    if (!show) { releaseAllTouch(); _st.fire = false; if (env.keys) env.keys.fire = false; }
    if (!show && !hasGamepad) { _st.active = false; return; }
    if (show) {
      if (env.keys) {
        env.keys.shift = _st.ab || thrLevel > 0.85;
        env.keys.ctrl = _st.brake || thrLevel < 0.12;
        env.keys.q = _st.yaw < -0.2; env.keys.e = _st.yaw > 0.2;
      }
    }
    _st.active = !!hasGamepad || show;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('gamepadconnected', e => { hasGamepad = true; padIndex = e.gamepad && e.gamepad.index || 0; toast('GAMEPAD CONNECTED: ' + String((e.gamepad && e.gamepad.id) || 'CONTROLLER').slice(0, 32)); });
    window.addEventListener('gamepaddisconnected', () => { hasGamepad = false; padIndex = -1; toast('GAMEPAD DISCONNECTED'); });
  }
  initTouchControls();

  return {
    update, pulseHaptic, setInvert,
    setTouchTest(on) { touchTest = !!on; },
    get invert() { return invert; },
    get hasGamepad() { return hasGamepad; },
    get state() { return _st; },
    get active() { return _st.active; },
    get touchVisible() { return !!(root && root.style.display === 'block'); }
  };
}
