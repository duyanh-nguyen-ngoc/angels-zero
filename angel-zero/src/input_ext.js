// ANGELS ZERO — Gamepad API + mobile touch controls.
// Zero per-frame allocations: one reused state object, scalar timers only.
// Desktop mouse/keyboard behaviour is untouched unless a stick is deflected or touch is active.

const DZ = 0.12, TOUCH_DZ = 0.08, INVERT_KEY = 'az_gp_invert', GYRO_KEY = 'az_touch_gyro';

function curve(v, dz = DZ) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const k = (a - dz) / (1 - dz);
  return (v < 0 ? -1 : 1) * k * k * Math.sqrt(k);   // cubic-ish response, smooth near centre
}

export function createInputExt(THREE, env) {
  const _st = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, ab: false, brake: false, fire: false, active: false };
  const prev = new Uint8Array(32);
  let padIndex = -1, hasGamepad = false, touchTest = false;
  let lookYaw = 0, lookPitch = 0, thrLevel = 0.5, stickPointer = -1, thrPointer = -1, lookPointer = -1;
  let stickCx = 0, stickCy = 0, lookLastX = 0, lookLastY = 0;
  let touchPitch = 0, touchRoll = 0, yawHeld = 0, abHeld = false, brkHeld = false, psmHeld = false;
  let gyroOn = false, gyroBaseBeta = null, gyroBaseGamma = null, gyroPitch = 0, gyroRoll = 0;
  let sysOpen = false, invert = true;
  try { invert = localStorage.getItem(INVERT_KEY) !== '0'; } catch (e) { /* storage unavailable */ }
  try { gyroOn = localStorage.getItem(GYRO_KEY) === '1'; } catch (e) { /* storage unavailable */ }

  function setInvert(on) {
    invert = !!on;
    try { localStorage.setItem(INVERT_KEY, on ? '1' : '0'); } catch (e) {}
    syncSysLabels();
  }
  function toast(text) { if (env.onToast) env.onToast(text); }
  function tapBuzz(ms = 14) {
    if (env.isTouchDevice && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { /* optional */ }
    }
  }
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
  let root = null, stickZone = null, stickRing = null, knob = null;
  let thrEl = null, thrFill = null, thrThumb = null, thrLabel = null;
  let sysDrawer = null, sysBtn = null, gyroBtn = null, invBtn = null, orientHint = null;
  const touchBtns = [];

  function setBtnGlow(b, on) {
    if (!b) return;
    b.style.boxShadow = on ? '0 0 14px rgba(104,247,204,.85), inset 0 0 10px rgba(104,247,204,.35)' : 'none';
    b.style.transform = on ? 'scale(0.94)' : 'scale(1)';
  }
  function syncSysLabels() {
    if (gyroBtn) gyroBtn.textContent = gyroOn ? 'GYRO: ON' : 'GYRO: OFF';
    if (invBtn) invBtn.textContent = invert ? 'INV: ON' : 'INV: OFF';
  }
  function syncThrVisual() {
    if (!thrFill || !thrThumb) return;
    const pct = Math.round(thrLevel * 100);
    thrFill.style.height = pct + '%';
    thrFill.style.background = thrLevel > 0.85 ? 'rgba(255,176,48,.65)' : thrLevel < 0.15 ? 'rgba(255,90,90,.55)' : 'rgba(104,247,204,.48)';
    thrThumb.style.bottom = 'calc(' + pct + '% - 6px)';
    if (thrLabel) thrLabel.textContent = thrLevel > 0.85 ? 'AB' : thrLevel < 0.15 ? 'BRK' : pct + '%';
  }
  function resetStickVisual() {
    if (!stickRing || !knob) return;
    stickRing.style.left = 'calc(20px + env(safe-area-inset-left, 0px))';
    stickRing.style.bottom = 'calc(22px + env(safe-area-inset-bottom, 0px))';
    stickRing.style.top = 'auto';
    stickRing.style.opacity = '0.68';
    knob.style.left = '52px';
    knob.style.top = '52px';
  }

  function releaseButton(b) {
    if (!b || !b._active) return;
    b._active = false; b._pid = -1;
    setBtnGlow(b, false);
    const act = b.dataset.act;
    if (act === 'Fire') { _st.fire = false; press('FireUp'); }
    else if (act === 'Missile') press('MissileUp');
    else if (act === 'AB') abHeld = false;
    else if (act === 'Brake') { brkHeld = false; press('BrakeUp'); }
    else if (act === 'PSM') { psmHeld = false; press('PSMUp'); }
    else if (act === 'YawL' || act === 'YawR') yawHeld = 0;
  }
  function releaseAllTouch() {
    for (let i = 0; i < touchBtns.length; i++) releaseButton(touchBtns[i]);
    stickPointer = -1; thrPointer = -1;
    if (lookPointer >= 0) {
      lookPointer = -1; lookYaw = 0; lookPitch = 0;
      if (env.freeLook && env.freeLook.debugHold) env.freeLook.debugHold(false, 0, 0);
    }
    touchPitch = 0; touchRoll = 0; _st.pitch = 0; _st.roll = 0; _st.yaw = 0;
    abHeld = false; brkHeld = false; psmHeld = false; yawHeld = 0;
    resetStickVisual();
  }
  function el(tag, css, parent) {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }
  function makeBtn(label, act, css, parent, onTap) {
    const b = el('button', css + ';pointer-events:auto;touch-action:none;transition:transform 60ms ease,box-shadow 60ms ease', parent);
    b.type = 'button';
    b.textContent = label;
    b.dataset.act = act;
    b._active = false; b._pid = -1;
    touchBtns.push(b);
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (_) { /* optional */ }
      b._active = true; b._pid = e.pointerId;
      setBtnGlow(b, true);
      tapBuzz(act === 'Fire' || act === 'Missile' ? 18 : 12);
      if (act === 'Fire') { _st.fire = true; press('FireDown'); }
      else if (act === 'Missile') press('MissileDown');
      else if (act === 'Lock') press('Lock');
      else if (act === 'Weapon') press('Weapon');
      else if (act === 'Flare') { press('Flare'); press('Chaff'); }
      else if (act === 'Camera') press('Camera');
      else if (act === 'NVG') press('NVG');
      else if (act === 'Gear') press('Gear');
      else if (act === 'ECM') press('ECM');
      else if (act === 'Wing') press('Wing');
      else if (act === 'Roll') press('Roll');
      else if (act === 'AB') abHeld = true;
      else if (act === 'Brake') { brkHeld = true; press('BrakeDown'); }
      else if (act === 'PSM') { psmHeld = true; press('PSMDown'); }
      else if (act === 'YawL') yawHeld = -1;
      else if (act === 'YawR') yawHeld = 1;
      else if (act === 'Pause') press('Pause');
      else if (onTap) onTap();
    });
    b.addEventListener('pointerup', e => { e.preventDefault(); e.stopPropagation(); releaseButton(b); });
    b.addEventListener('pointercancel', e => { e.preventDefault(); e.stopPropagation(); releaseButton(b); });
    b.addEventListener('lostpointercapture', () => releaseButton(b));
    return b;
  }

  function toggleGyro() {
    if (!gyroOn && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(res => {
        if (res === 'granted') { gyroOn = true; gyroBaseBeta = null; gyroBaseGamma = null; try { localStorage.setItem(GYRO_KEY, '1'); } catch (_) {} syncSysLabels(); toast('GYRO STEERING ON'); }
        else toast('GYRO PERMISSION DENIED');
      }).catch(() => toast('GYRO UNAVAILABLE'));
      return;
    }
    gyroOn = !gyroOn;
    gyroBaseBeta = null; gyroBaseGamma = null;
    try { localStorage.setItem(GYRO_KEY, gyroOn ? '1' : '0'); } catch (_) {}
    syncSysLabels();
    toast(gyroOn ? 'GYRO STEERING ON' : 'GYRO STEERING OFF');
  }

  function initTouchControls() {
    if (root) return;
    root = el('div', 'position:fixed;inset:0;z-index:30;pointer-events:none;display:none;touch-action:none;user-select:none;-webkit-user-select:none', document.body);
    root.id = 'touchHUD';

    // Left-half floating stick touch zone
    stickZone = el('div', 'position:absolute;left:0;top:54px;width:44%;bottom:0;pointer-events:auto;touch-action:none', root);
    stickRing = el('div', 'position:absolute;left:calc(20px + env(safe-area-inset-left, 0px));bottom:calc(22px + env(safe-area-inset-bottom, 0px));width:144px;height:144px;border:2px solid rgba(104,247,204,.65);border-radius:50%;pointer-events:none;background:radial-gradient(circle, rgba(104,247,204,.06) 0%, rgba(0,20,14,.34) 70%);opacity:.68', root);
    el('div', 'position:absolute;left:71px;top:16px;width:2px;height:112px;background:rgba(104,247,204,.16)', stickRing);
    el('div', 'position:absolute;left:16px;top:71px;width:112px;height:2px;background:rgba(104,247,204,.16)', stickRing);
    knob = el('div', 'position:absolute;left:52px;top:52px;width:40px;height:40px;border-radius:50%;border:2px solid rgba(180,255,232,.9);background:rgba(104,247,204,.5);box-shadow:0 0 10px rgba(104,247,204,.45)', stickRing);

    // Empty-sky drag-to-freelook zone (upper center)
    const lookZone = el('div', 'position:absolute;left:44%;right:34%;top:54px;bottom:34%;pointer-events:auto;touch-action:none', root);
    lookZone.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      lookPointer = e.pointerId; lookLastX = e.clientX; lookLastY = e.clientY;
      try { lookZone.setPointerCapture(e.pointerId); } catch (_) {}
    });
    lookZone.addEventListener('pointermove', e => {
      if (e.pointerId !== lookPointer) return;
      e.preventDefault();
      lookYaw += (e.clientX - lookLastX) * 0.25;
      lookPitch += (e.clientY - lookLastY) * 0.25;
      lookLastX = e.clientX; lookLastY = e.clientY;
      if (env.freeLook && env.freeLook.debugHold) env.freeLook.debugHold(true, lookYaw, lookPitch);
    });
    const endLook = e => {
      if (e.pointerId !== lookPointer) return;
      lookPointer = -1; lookYaw = 0; lookPitch = 0;
      if (env.freeLook && env.freeLook.debugHold) env.freeLook.debugHold(false, 0, 0);
    };
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);
    lookZone.addEventListener('lostpointercapture', () => {
      lookPointer = -1; lookYaw = 0; lookPitch = 0;
      if (env.freeLook && env.freeLook.debugHold) env.freeLook.debugHold(false, 0, 0);
    });

    // Visual throttle slider (left edge above resting stick)
    thrEl = el('div', 'position:absolute;left:calc(16px + env(safe-area-inset-left, 0px));bottom:calc(184px + env(safe-area-inset-bottom, 0px));width:40px;height:164px;border:1px solid rgba(104,247,204,.75);border-radius:6px;pointer-events:auto;touch-action:none;background:rgba(0,20,14,.42);overflow:visible', root);
    el('div', 'position:absolute;left:0;top:0;width:100%;height:15%;border-bottom:1px dashed rgba(255,176,48,.55);background:rgba(255,176,48,.16)', thrEl);
    el('div', 'position:absolute;left:0;bottom:0;width:100%;height:15%;border-top:1px dashed rgba(255,90,90,.55);background:rgba(255,90,90,.16)', thrEl);
    thrFill = el('div', 'position:absolute;left:0;bottom:0;width:100%;height:50%;border-radius:0 0 5px 5px;pointer-events:none', thrEl);
    thrThumb = el('div', 'position:absolute;left:-4px;width:48px;height:12px;border-radius:3px;border:1px solid #d4fff0;background:rgba(104,247,204,.88);box-shadow:0 0 8px rgba(104,247,204,.6);pointer-events:none', thrEl);
    thrLabel = el('div', 'position:absolute;left:0;top:-18px;width:100%;text-align:center;color:#9dffe0;font:700 10px monospace;text-shadow:0 1px 3px #000', thrEl);
    syncThrVisual();

    // Compact Yaw rudder buttons (bottom-left-center)
    const yawCss = 'width:50px;height:38px;border-radius:6px;border:1px solid rgba(104,247,204,.75);background:rgba(0,20,14,.55);color:#9dffe0;font:700 11px monospace';
    makeBtn('◄ YAW', 'YawL', 'position:absolute;left:calc(174px + env(safe-area-inset-left, 0px));bottom:calc(20px + env(safe-area-inset-bottom, 0px));' + yawCss, root);
    makeBtn('YAW ►', 'YawR', 'position:absolute;left:calc(230px + env(safe-area-inset-left, 0px));bottom:calc(20px + env(safe-area-inset-bottom, 0px));' + yawCss, root);

    // Bottom-right Combat Thumb-Arc
    const R = 'env(safe-area-inset-right, 0px)', B = 'env(safe-area-inset-bottom, 0px)';
    const cBtn = 'border-radius:50%;border:1.5px solid rgba(104,247,204,.85);background:rgba(0,22,15,.62);color:#b8ffea;font:700 12px monospace';
    makeBtn('GUN', 'Fire', `position:absolute;right:calc(16px + ${R});bottom:calc(20px + ${B});width:66px;height:66px;${cBtn};border-color:rgba(120,255,214,.95)`, root);
    makeBtn('MSL', 'Missile', `position:absolute;right:calc(92px + ${R});bottom:calc(32px + ${B});width:60px;height:60px;${cBtn};border-color:rgba(255,192,72,.9);color:#ffe4a8`, root);
    makeBtn('LOCK', 'Lock', `position:absolute;right:calc(162px + ${R});bottom:calc(22px + ${B});width:52px;height:52px;${cBtn};font-size:11px`, root);
    makeBtn('WPN', 'Weapon', `position:absolute;right:calc(88px + ${R});bottom:calc(102px + ${B});width:52px;height:52px;${cBtn};font-size:11px`, root);
    makeBtn('FLR', 'Flare', `position:absolute;right:calc(20px + ${R});bottom:calc(96px + ${B});width:54px;height:54px;${cBtn};font-size:11px`, root);
    makeBtn('AB', 'AB', `position:absolute;right:calc(150px + ${R});bottom:calc(86px + ${B});width:48px;height:42px;border-radius:8px;border:1.5px solid rgba(255,176,48,.85);background:rgba(36,20,0,.62);color:#ffd58a;font:700 11px monospace`, root);
    makeBtn('BRK', 'Brake', `position:absolute;right:calc(206px + ${R});bottom:calc(86px + ${B});width:48px;height:42px;border-radius:8px;border:1.5px solid rgba(255,100,100,.85);background:rgba(36,6,6,.62);color:#ffb3b3;font:700 11px monospace`, root);

    // Top-right Utility Rail + Collapsible [SYS v] Drawer
    const T = 'calc(12px + env(safe-area-inset-top, 0px))';
    const topCss = 'padding:7px 11px;border-radius:6px;border:1px solid rgba(104,247,204,.8);background:rgba(0,20,14,.62);color:#9dffe0;font:700 11px monospace';
    makeBtn('PAUSE', 'Pause', `position:absolute;right:calc(14px + ${R});top:${T};${topCss}`, root);
    sysBtn = makeBtn('SYS ▾', 'SysToggle', `position:absolute;right:calc(80px + ${R});top:${T};${topCss}`, root, () => {
      sysOpen = !sysOpen;
      if (sysDrawer) sysDrawer.style.display = sysOpen ? 'grid' : 'none';
      sysBtn.textContent = sysOpen ? 'SYS ▴' : 'SYS ▾';
    });
    makeBtn('NVG', 'NVG', `position:absolute;right:calc(142px + ${R});top:${T};${topCss}`, root);
    makeBtn('CAM', 'Camera', `position:absolute;right:calc(194px + ${R});top:${T};${topCss}`, root);

    sysDrawer = el('div', `position:absolute;right:calc(14px + ${R});top:calc(48px + env(safe-area-inset-top, 0px));display:none;grid-template-columns:repeat(2,74px);gap:6px;padding:8px;border-radius:8px;border:1px solid rgba(104,247,204,.75);background:rgba(0,18,12,.84);pointer-events:auto`, root);
    const dBtn = 'height:34px;border-radius:5px;border:1px solid rgba(104,247,204,.7);background:rgba(0,28,20,.65);color:#b8ffea;font:700 10px monospace';
    makeBtn('GEAR', 'Gear', dBtn, sysDrawer);
    makeBtn('ECM', 'ECM', dBtn, sysDrawer);
    makeBtn('WING', 'Wing', dBtn, sysDrawer);
    makeBtn('ROLL', 'Roll', dBtn, sysDrawer);
    makeBtn('PSM', 'PSM', dBtn, sysDrawer);
    gyroBtn = makeBtn('GYRO: OFF', 'GyroToggle', dBtn, sysDrawer, toggleGyro);
    invBtn = makeBtn('INV: ON', 'InvToggle', dBtn + ';grid-column:span 2', sysDrawer, () => setInvert(!invert));
    syncSysLabels();

    // Subtle portrait orientation hint
    orientHint = el('div', 'position:absolute;left:50%;top:12px;transform:translateX(-50%);padding:4px 10px;border-radius:999px;border:1px solid rgba(255,192,72,.75);background:rgba(24,16,0,.78);color:#ffd58a;font:700 10px monospace;display:none;pointer-events:auto', root);
    orientHint.textContent = 'ROTATE TO LANDSCAPE FOR BEST FLIGHT ✕';
    orientHint.addEventListener('pointerdown', e => { e.stopPropagation(); orientHint.style.display = 'none'; orientHint._dismissed = true; });

    function releaseByPointer(e) {
      for (let i = 0; i < touchBtns.length; i++) {
        const b = touchBtns[i];
        if (b._active && b._pid === e.pointerId) releaseButton(b);
      }
    }
    window.addEventListener('pointerup', releaseByPointer, true);
    window.addEventListener('pointercancel', releaseByPointer, true);
    window.addEventListener('blur', releaseAllTouch);

    // Floating stick handlers
    stickZone.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      stickPointer = e.pointerId;
      try { stickZone.setPointerCapture && stickZone.setPointerCapture(e.pointerId); } catch (_) {}
      const pad = 76;
      stickCx = Math.max(pad, Math.min(window.innerWidth * 0.44 - 20, e.clientX));
      stickCy = Math.max(110, Math.min(window.innerHeight - pad, e.clientY));
      stickRing.style.bottom = 'auto';
      stickRing.style.left = (stickCx - 72) + 'px';
      stickRing.style.top = (stickCy - 72) + 'px';
      stickRing.style.opacity = '0.96';
      moveStick(e);
    });
    stickZone.addEventListener('pointermove', e => { if (e.pointerId === stickPointer) { e.preventDefault(); moveStick(e); } });
    const endStick = e => {
      if (e.pointerId !== stickPointer) return;
      stickPointer = -1;
      resetStickVisual();
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);
    stickZone.addEventListener('lostpointercapture', () => { stickPointer = -1; resetStickVisual(); });

    thrEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); thrPointer = e.pointerId; try { thrEl.setPointerCapture && thrEl.setPointerCapture(e.pointerId); } catch (_) {} moveThr(e); });
    thrEl.addEventListener('pointermove', e => { if (e.pointerId === thrPointer) { e.preventDefault(); moveThr(e); } });
    const endThr = e => { if (e.pointerId === thrPointer) thrPointer = -1; };
    thrEl.addEventListener('pointerup', endThr);
    thrEl.addEventListener('pointercancel', endThr);
    thrEl.addEventListener('lostpointercapture', () => { thrPointer = -1; });
  }

  function moveStick(e) {
    let x = (e.clientX - stickCx) / 56;
    let y = (e.clientY - stickCy) / 56;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    touchRoll = curve(x, TOUCH_DZ);
    touchPitch = (invert ? -1 : 1) * curve(y, TOUCH_DZ);
    knob.style.left = (52 + x * 44) + 'px';
    knob.style.top = (52 + y * 44) + 'px';
  }
  function moveThr(e) {
    const r = thrEl.getBoundingClientRect();
    thrLevel = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    _st.throttleDelta = thrLevel - 0.5;
    _st.ab = thrLevel > 0.85; _st.brake = thrLevel < 0.15;
    syncThrVisual();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('deviceorientation', e => {
      if (!gyroOn || e.beta === null || e.gamma === null) return;
      const land = window.innerWidth >= window.innerHeight;
      const b = land ? e.gamma : e.beta;
      const g = land ? e.beta : e.gamma;
      if (gyroBaseBeta === null) { gyroBaseBeta = b; gyroBaseGamma = g; }
      const dp = Math.max(-1, Math.min(1, (b - gyroBaseBeta) / 28));
      const dr = Math.max(-1, Math.min(1, (g - gyroBaseGamma) / 32));
      gyroPitch = (invert ? -1 : 1) * curve(dp, 0.10);
      gyroRoll = curve(dr, 0.10);
    });
    window.addEventListener('gamepadconnected', e => { hasGamepad = true; padIndex = e.gamepad && e.gamepad.index || 0; toast('GAMEPAD CONNECTED: ' + String((e.gamepad && e.gamepad.id) || 'CONTROLLER').slice(0, 32)); });
    window.addEventListener('gamepaddisconnected', () => { hasGamepad = false; padIndex = -1; toast('GAMEPAD DISCONNECTED'); });
  }

  let wasShown = false;
  function update(dt) {
    pollGamepad(dt);
    const playing = env.getAppMode && env.getAppMode() === 'PLAY';
    const show = !!root && playing && (env.isTouchDevice || touchTest);
    if (root) root.style.display = show ? 'block' : 'none';
    if (!show && wasShown) { releaseAllTouch(); _st.fire = false; if (env.keys) env.keys.fire = false; }
    wasShown = show;
    if (!show && !hasGamepad) { _st.active = false; return; }
    if (show) {
      if (orientHint && !orientHint._dismissed) {
        orientHint.style.display = window.innerHeight > window.innerWidth * 1.15 ? 'block' : 'none';
      }
      if (stickPointer < 0) {
        const k = Math.max(0, 1 - dt * 10);
        touchPitch *= k; touchRoll *= k;
        if (Math.abs(touchPitch) < 0.004) touchPitch = 0;
        if (Math.abs(touchRoll) < 0.004) touchRoll = 0;
      }
      if (!hasGamepad) {
        _st.pitch = (stickPointer < 0 && gyroOn) ? gyroPitch : touchPitch;
        _st.roll = (stickPointer < 0 && gyroOn) ? gyroRoll : touchRoll;
        _st.yaw = yawHeld;
        _st.ab = abHeld || psmHeld || thrLevel > 0.85;
        _st.brake = brkHeld || psmHeld || thrLevel < 0.15;
      }
      if (env.keys) {
        env.keys.shift = _st.ab;
        env.keys.ctrl = _st.brake;
        env.keys.q = _st.yaw < -0.2; env.keys.e = _st.yaw > 0.2;
      }
    }
    _st.active = !!hasGamepad || show;
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
