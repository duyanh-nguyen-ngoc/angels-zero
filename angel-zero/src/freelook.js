/* ANGELS ZERO — Free Look (hold Alt or the middle mouse button).
   ----------------------------------------------------------------------------
   While held, mouse motion turns the VIEW instead of the stick:
     - cockpit: the pilot's head turns about the eye point, yaw +/-150 deg,
       pitch -45..+85 deg, with a shoulder lean past 90 deg (cockpit3d.js reads
       `view` and applies it on top of its own head-motion springs);
     - chase:  the camera orbits the jet at the current chase radius,
       360 deg yaw, -70..+75 deg pitch (applyChase()).
   The flight stick (mouse.nx / ny) is frozen while looking; keyboard flight
   controls are untouched. The pointer is locked while looking (when the browser
   allows it), so on release the cursor -- and therefore the stick -- is exactly
   where it was. Without pointer lock, the stick eases from its frozen position
   to the cursor over 0.25 s instead of jumping.
   Release springs the view back to centre (~0.25 s, exponential, shortest way).

   createFreeLook(THREE, { mouse, canvas, isEnabled, isFirstPerson })
     .update(dt)              per frame (spring + stick blend)
     .applyChase(camera, pivot)  rotate the already-posed chase camera about pivot
     .view                    { yaw, pitch, lean } (radians; lean 0..1) for the cockpit
     .active / .amount        held? / how far off-centre (0..1) for the HUD
*/
export function createFreeLook(THREE, env) {
  const { mouse, canvas } = env;
  const D2R = Math.PI / 180;
  const LIM = {
    cockpit: { yaw: 150 * D2R, pitchDn: -45 * D2R, pitchUp: 85 * D2R },
    chase: { yaw: Infinity, pitchDn: -70 * D2R, pitchUp: 75 * D2R }
  };
  const SENS = 0.0042;            // rad per pixel of mouse travel (~360 px for 90 deg)
  const FOLLOW = 22;              // 1/s: view chases the mouse target (smooths raw deltas)
  const RETURN = 12;              // 1/s: spring-back, ~95 % home in 0.25 s
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

  const src = { alt: false, mmb: false };
  const tgt = { yaw: 0, pitch: 0 };
  const view = { yaw: 0, pitch: 0, lean: 0 };
  let held = false, locked = false, waitMove = false;
  const raw = { x: 0, y: 0 };     // last real cursor position (normalised, like mouse.nx / ny)
  let frozen = null;              // stick value captured at activation
  let blend = 0, blendFrom = { x: 0, y: 0 };

  const limits = () => (env.isFirstPerson() ? LIM.cockpit : LIM.chase);
  function clampTarget() {
    const L = limits();
    if (Number.isFinite(L.yaw)) tgt.yaw = clamp(tgt.yaw, -L.yaw, L.yaw);
    tgt.pitch = clamp(tgt.pitch, L.pitchDn, L.pitchUp);
  }

  function setHeld(on, lock = true) {
    if (on === held) return;
    held = on;
    if (on) {
      frozen = (env.isCruise && env.isCruise()) ? { x: 0, y: 0 } : { x: mouse.nx, y: mouse.ny };
      waitMove = false;
      // Start from where the view currently is (re-grab during a spring-back is seamless).
      tgt.yaw = view.yaw; tgt.pitch = view.pitch;
      blend = 0;
      try {
        if (lock && canvas && canvas.requestPointerLock && document.pointerLockElement !== canvas) {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        }
      } catch (e) { /* lock refused: fall back to raw deltas */ }
    } else {
      // Spring home the short way round (a 340 deg chase orbit returns via 20 deg).
      view.yaw = wrapPi(view.yaw); tgt.yaw = 0; tgt.pitch = 0;
      if (document.pointerLockElement === canvas) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
      if (frozen) {
        mouse.nx = frozen.x; mouse.ny = frozen.y;
        waitMove = !locked;
      }
      frozen = null; blend = 0;
    }
  }
  function refresh() { setHeld(env.isEnabled() && (src.alt || src.mmb)); }

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    // Browser dropped the lock (Esc, focus loss) while looking: end the look.
    if (!locked && held) { src.alt = false; src.mmb = false; refresh(); }
  });

  // Returns true when the event was consumed (the caller must not steer with it).
  function onMouseMove(e) {
    if (!locked) {
      raw.x = (e.clientX / innerWidth) * 2 - 1;
      raw.y = -((e.clientY / innerHeight) * 2 - 1);
    }
    if (!held) {
      if (waitMove) { waitMove = false; return true; }
      if (blend > 0) return true;          // stick is easing toward raw; update() writes it
      return false;
    }
    tgt.yaw -= (e.movementX || 0) * SENS;  // mouse right -> look right
    tgt.pitch -= (e.movementY || 0) * SENS; // mouse up -> look up
    clampTarget();
    return true;
  }
  function onKey(e, down) {
    if (e.key !== 'Alt') return false;
    e.preventDefault();                    // no browser menu-bar focus on Alt release
    src.alt = down; refresh();
    return true;
  }
  function onMouseButton(e, down) {
    if (e.button !== 1) return false;
    e.preventDefault();                    // no middle-click autoscroll / paste
    src.mmb = down; refresh();
    return true;
  }
  function release() { src.alt = false; src.mmb = false; refresh(); }

  function update(dt) {
    if (held && !env.isEnabled()) release();
    if (held) clampTarget();               // e.g. Space switched chase -> cockpit mid-look
    const k = 1 - Math.exp(-(held ? FOLLOW : RETURN) * dt);
    view.yaw += (tgt.yaw - view.yaw) * k;
    view.pitch += (tgt.pitch - view.pitch) * k;
    if (!held && Math.abs(view.yaw) < 1e-4 && Math.abs(view.pitch) < 1e-4) { view.yaw = 0; view.pitch = 0; }
    // Shoulder lean ramps in from 70 to 130 deg of head yaw (cockpit only).
    const s = clamp((Math.abs(view.yaw) - 70 * D2R) / (60 * D2R), 0, 1);
    view.lean = s * s * (3 - 2 * s) * Math.sign(view.yaw);
    if (frozen) { mouse.nx = frozen.x; mouse.ny = frozen.y; }
    if (blend > 0) {
      blend = Math.max(0, blend - dt);
      const t = 1 - blend / 0.25, e = t * t * (3 - 2 * t);
      mouse.nx = blendFrom.x + (raw.x - blendFrom.x) * e;
      mouse.ny = blendFrom.y + (raw.y - blendFrom.y) * e;
    }
  }

  // Orbit the already-posed chase camera about `pivot` (the jet) by the view
  // offset, in the camera's own frame: yaw about its up axis, pitch about its
  // right axis. The radius is preserved; the jet stays at the same screen spot.
  const _qBase = new THREE.Quaternion(), _qOff = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  const _off = new THREE.Vector3(), _qInv = new THREE.Quaternion();
  function applyChase(camera, pivot) {
    if (Math.abs(view.yaw) < 1e-4 && Math.abs(view.pitch) < 1e-4) return false;
    _qBase.copy(camera.quaternion);
    _off.copy(camera.position).sub(pivot).applyQuaternion(_qInv.copy(_qBase).invert());   // camera-local offset
    _qOff.setFromEuler(_e.set(view.pitch, view.yaw, 0));
    camera.quaternion.copy(_qBase).multiply(_qOff);
    _off.applyQuaternion(_qOff).applyQuaternion(_qBase);
    camera.position.copy(pivot).add(_off);
    return true;
  }

  // Debug hook (?debug&look=yaw,pitch / window.__az.freeLook): hold the look at a target in degrees.
  function debugHold(on, yawDeg = 0, pitchDeg = 0) {
    src.alt = !!on; setHeld(env.isEnabled() && (src.alt || src.mmb), false);
    if (held) { tgt.yaw = yawDeg * D2R; tgt.pitch = pitchDeg * D2R; clampTarget(); }
  }

  return {
    update, applyChase, onMouseMove, onKey, onMouseButton, release, view, debugHold,
    get active() { return held; },
    get amount() { return Math.min(1, Math.hypot(view.yaw, view.pitch) / (30 * D2R)); },
    get stats() {
      return { held, locked, yaw: +(view.yaw / D2R).toFixed(1), pitch: +(view.pitch / D2R).toFixed(1), lean: +view.lean.toFixed(2),
        src: (src.alt ? 'ALT' : '') + (src.mmb ? 'MMB' : '') };
    }
  };
}
