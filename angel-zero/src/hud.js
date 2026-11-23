// ANGELS ZERO — clean Ace Combat 8 style Hi-DPI 2D tactical HUD.
// Luminous emerald phosphor (#58ff9a, 1.35 px strokes, 6 px bloom), Rajdhani
// condensed type, crimson (#ff2e43) on MISSILE ALERT / PULL UP / STALL.
// 3rd person: uncluttered -o- reticle with velocity parallax flanked by pointed
// SPEED / ALT boxes (no ladders or tapes). 1st person: conformal ladder + tapes
// clipped to the 3D combiner glass. Square tactical radar (bottom-left), stores
// list + F-15C silhouette with per-pylon AIM-9 reload icons (bottom-right),
// open-corner target brackets, edge pointers, minimal top-left telemetry.
import { SPW } from './loadout.js?v=s9c0';
import { GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_FLOOR_Y } from './maps.js?v=s9c0';

export function createHUD(THREE, A) {
  const canvas = A.canvas;
  const hctx = canvas.getContext('2d');
  const S = A.state, C = A.combat, cam = A.camera;
  const smooth = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  const G = '#58ff9a';
  const GD = 'rgba(88, 255, 154, 0.42)';
  const GB = '#c4ffdc';
  const WARN = '#ff2e43';
  const AMBER = '#ffb838';
  const CYAN = '#38b6ff';
  const FONT = "'Rajdhani', 'Share Tech Mono', sans-serif";
  const WING_ORDER_NAMES = ['FORM', 'COVER', 'FOCUS'];
  const SUN_METERS = ['SUN ▯▯▯', 'SUN ▮▯▯', 'SUN ▮▮▯', 'SUN ▮▮▮'];
  const LW = 1.35;
  const f = (px, bold = false) => `${bold ? '700' : '600'} ${px}px ${FONT}`;

  let HW = 0, HH = 0, DPR = 1;
  let maxG = 1;
  let lockSnapT = 0, prevLockState = 'NONE';
  const inertia = { x: 0, y: 0, vx: 0, vy: 0 };
  const fpvDir = new THREE.Vector3(0, 0, -1);
  const _wv = new THREE.Vector3();
  const _ov = new THREE.Vector3(), _rl = new THREE.Vector3();
  const MP_LABELS = ['', 'SWEEP BANDITS', 'CANYON/BRIDGE STRIKE', 'CRIMSON ACE INTERCEPT', 'CARRIER RTB'];
  const RADAR_ZOOMS = [4000, 10000, 25000], RADAR_ZOOM_TAG = ['CLOSE 4', 'TAC 10', 'THTR 25'];
  const STAMP_N = 8, STAMP_LIFE = 0.8;
  const P_RDR = '[ Z ] CHAFF / NOTCH 90°', P_IR = '[ X ] FLARES', P_RTB = '[ CARRIER RTB ]',
    P_MCAM = '[ HOLD FIRE ] MISSILE CAM', P_WING = '[ G ] WINGMEN ENGAGE';
  const CHEAT_ROWS = [
    ['MOUSE', 'Pitch/roll'], ['WASD', 'Pitch / roll'], ['LMB/F', 'Gun'],
    ['RMB/M', 'Missile / SPW'], ['1-3/R', 'Weapon'], ['C', 'Lock'],
    ['X', 'Flares'], ['Z', 'Chaff'], ['J', 'ECM'], ['G', 'Wingmen'],
    ['L', 'Gear'], ['B', 'Brake'], ['V', 'Roll'], ['Q/E', 'Yaw'],
    ['SHIFT/CTRL/UP/DN/WHEEL', 'Throttle'],
    ['SPACE', 'View'], ['[ ]', 'MFD'], ['ALT', 'Free look'],
    ['TABx2', 'Debrief'], ['F1', 'This sheet'],
    ['T (hold)', 'Padlock'], ['Y', 'Radar zoom'],
    [', . /', 'Music prev / next / AUTO'],
    ['B+SHIFT <290KT', 'PSM: Cobra / Kulbit'],
    ['RUDDER+OPP ROLL @STALL', 'Flat spin (neutral+opp rudder recovers)']
  ];
  let promptKey = '', promptT = 0;
  let radarZoom = 1, radarPulseT = 99;
  try { const rz = Number(localStorage.getItem('angelsZero_radarZoom')); if (Number.isInteger(rz) && rz >= 0 && rz < 3) radarZoom = rz; } catch (e) { /* storage unavailable */ }
  // Pooled in-world hit stamps.
  const STAMP_POS = new Float32Array(STAMP_N * 3), STAMP_T = new Float32Array(STAMP_N), STAMP_K = new Uint8Array(STAMP_N);
  STAMP_T.fill(99);
  const G_JITTER = new Float32Array(32);
  for (let i = 0; i < 32; i++) G_JITTER[i] = Math.sin(i * 1.7) * 1.5;
  let stampNext = 0;

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 3);
    HW = innerWidth; HH = innerHeight;
    canvas.width = Math.round(HW * DPR);
    canvas.height = Math.round(HH * DPR);
  }

  // Combo tiers: x1.5-2.5 emerald, x3.0-4.0 gold, x4.5-5.0 blazing crimson-gold.
  const GOLD = '#ffcc33', BLAZE = '#ff3b5c', REFILL = '#7ff3ff';
  const comboColor = m => m >= 4.5 ? BLAZE : m >= 3.0 ? GOLD : G;
  let comboSeen = 1, comboPulseT = -1e9;
  function glowColor(color) {
    if (color === GOLD) return 'rgba(255, 204, 51, 0.7)';
    if (color === BLAZE) return 'rgba(255, 150, 60, 0.8)';
    if (color === REFILL || color === '#ffffff') return 'rgba(127, 243, 255, 0.85)';
    if (color === WARN) return 'rgba(255, 46, 67, 0.65)';
    if (color === AMBER) return 'rgba(255, 184, 56, 0.55)';
    if (color === CYAN) return 'rgba(56, 182, 255, 0.55)';
    return 'rgba(50, 255, 120, 0.55)';
  }
  function glow(ctx, color = G, blur = 6) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    // Skip canvas shadowBlur Gaussian passes per draw call; labelText handles contrast via 1 px backing.
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
  function noGlow(ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
  // Barrel heat colour: emerald #58ff9a -> amber #ffaa22 -> crimson #ff2e43.
  function heatColor(h) {
    const k1 = Math.min(1, h / 0.6), k2 = Math.max(0, (h - 0.6) / 0.4);
    const a = [88, 255, 154], b = [255, 170, 34], c = [255, 46, 67];
    const m = h < 0.6 ? a.map((v, i) => v + (b[i] - v) * k1) : b.map((v, i) => v + (c[i] - v) * k2);
    return `rgb(${m.map(Math.round).join(',')})`;
  }
  // Thin curved thermal arc (270 deg sweep from lower-left), filled to `h`.
  function heatArc(ctx, x, y, r, h, alpha = 1) {
    if (h < 0.01 && !C.gunOverheat) return;
    const a0 = Math.PI * 0.75, span = Math.PI * 1.5;
    ctx.save(); ctx.globalAlpha = alpha;
    noGlow(ctx); ctx.strokeStyle = 'rgba(88,255,154,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + span); ctx.stroke();
    const col = heatColor(h);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    if (C.gunOverheat && Math.floor(performance.now() / 180) % 2) ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + span * Math.min(1, h)); ctx.stroke();
    ctx.restore();
  }
  function numBack(ctx, x, y, w, h, fill = 'rgba(0, 14, 8, 0.42)') {
    ctx.save(); noGlow(ctx); ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.restore();
  }
  // Crisp dark text shadow pass behind floating labels over bright clouds/ocean glare.
  function labelText(ctx, text, x, y, col = G, blur = 4) {
    ctx.save();
    noGlow(ctx);
    ctx.fillStyle = 'rgba(0, 10, 6, 0.72)';
    ctx.fillText(text, x + 1, y + 1);
    ctx.restore();
    glow(ctx, col, blur);
    ctx.fillText(text, x, y);
  }

  const _sp = new THREE.Vector3();
  function toScreen(v) {
    _sp.copy(v).project(cam);
    return { x: (_sp.x * 0.5 + 0.5) * HW, y: (-_sp.y * 0.5 + 0.5) * HH, ok: _sp.z > -1 && _sp.z < 1 };
  }
  // Drone marker scratch: reused projection object, zero per-frame allocations.
  const _drScr = new THREE.Vector3(), _drPr = { x: 0, y: 0, ok: false }, _drCentroid = new THREE.Vector3();
  const LOOKV = { active: false, offBore: 0, yaw: 0, pitch: 0, x: 0, y: 0, z: 0 };
  // Frost vignette gradient, rasterised once; only globalAlpha changes per frame.
  const frostCv = document.createElement('canvas'); frostCv.width = frostCv.height = 256;
  {
    const fc = frostCv.getContext('2d');
    const fg = fc.createRadialGradient(128, 128, 86, 128, 128, 128);
    fg.addColorStop(0, 'rgba(190,225,255,0)'); fg.addColorStop(0.7, 'rgba(190,225,255,0.35)'); fg.addColorStop(1, 'rgba(210,235,255,0.95)');
    fc.fillStyle = fg; fc.fillRect(0, 0, 256, 256);
  }
  function droneScreen(v) {
    _drScr.copy(v).project(cam);
    _drPr.x = (_drScr.x * 0.5 + 0.5) * HW; _drPr.y = (-_drScr.y * 0.5 + 0.5) * HH;
    _drPr.ok = _drScr.z > -1 && _drScr.z < 1;
    return _drPr;
  }
  function focal() { return (HH / 2) / Math.tan(cam.fov / 2 * D2R); }
  const wrap180 = a => ((a % 360) + 540) % 360 - 180;

  let alertState = 'NORMAL', alertOverride = null;
  const alertOn = () => alertState === 'MISSILE_ALERT';
  // (gear down = landing configuration: no PULL UP nag on a deliberate approach / on the runway)
  const pullUpOn = () => !C.dead && !(S.gear > 0.9) && !S.onGround && S.radalt * 3.28084 < 250 && S.velocity.y < -1.5;
  // Near the 24 deg critical AoA below ~260 kt, an actual departure, or very slow flight.
  // Debounced in the flight loop (state.stallWarnT holds >= 0.25 s of sim time): no flicker at the boundary.
  const stallOn = () => !C.dead && (S.stallWarnT || 0) > 0;
  const flashRed = () => alertOn() && Math.floor(performance.now() / 160) % 2 === 0;
  const pulseAlpha = (periodMs = 160) => (Math.floor(performance.now() / periodMs) % 2 === 0 ? 1.0 : 0.45);
  const mslFlash = () => Math.floor(performance.now() / 140) % 2 === 0;

  // 3rd-person layout: everything keys off the boresight point (screen centre-ish).
  const BOX_OFF = 165;                                   // SPEED / ALT box centres, px either side of the reticle
  function chaseLayout() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const b = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    const cx = b.ok ? clamp(b.x, HW * 0.3, HW * 0.7) : HW / 2, cy = b.ok ? clamp(b.y, HH * 0.3, HH * 0.7) : HH / 2;
    return {
      cx, cy,
      minX: cx - BOX_OFF - 60, maxX: cx + BOX_OFF + 60,
      minY: HH * 0.16, maxY: HH * 0.76,
      boxW: (BOX_OFF + 60) * 2, boxH: HH * 0.54,
      // Zones occupied by the SPEED / ALT boxes (used to keep secondary target cues clear of them).
      tapeL: cx - BOX_OFF + 33, tapeR: cx + BOX_OFF - 33,
      tapeTop: cy - 34, tapeBot: cy + 22
    };
  }

  /* ----------------------------------------------- springs / telemetry */
  function updateDynamics(dt) {
    // Subtle +/-8 px G-force parallax shift in chase view during hard turns.
    const tx = clamp(-S.rollRate * 2.8 - S.yawRate * 7, -8, 8);
    const ty = clamp((S.gLoad - 1) * 1.1 + S.pitchRate * 2.2, -8, 8);
    const k = 120, c = 15;
    inertia.vx += ((tx - inertia.x) * k - inertia.vx * c) * dt;
    inertia.vy += ((ty - inertia.y) * k - inertia.vy * c) * dt;
    inertia.x = clamp(inertia.x + inertia.vx * dt, -8, 8);
    inertia.y = clamp(inertia.y + inertia.vy * dt, -8, 8);
    if (!C.dead) maxG = Math.max(maxG, S.gLoad);
  }

  function camBank() {
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    return Math.atan2(r.y, u.y);
  }

  /* ------------------------------------------- collimated flight symbology */
  const LADDER_ANGLES = [0, 5, -5, 10, -10, 15, -15, 20, -20, 30, -30, 45, -45, 60, -60, 75, -75];
  function drawConformalLadder(ctx, g, col, compact) {
    const h = S.heading * D2R, eye = cam.position, bank = camBank(), fl = focal();
    const dir = new THREE.Vector3();
    const rungW = compact ? 54 : 74, gap = compact ? 22 : 28;
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.cx - g.boxW * 0.56, g.minY + (compact ? 38 : 6), g.boxW * 1.12, g.boxH + (compact ? 10 : 40));
    ctx.clip();
    glow(ctx, col, 4);
    ctx.lineWidth = LW;
    ctx.font = f(compact ? 12 : 13, true);
    ctx.textBaseline = 'middle';

    for (const m of LADDER_ANGLES) {
      const e = m * D2R;
      dir.set(Math.sin(h) * Math.cos(e), Math.sin(e), -Math.cos(h) * Math.cos(e));
      const p = toScreen(eye.clone().addScaledVector(dir, 5000));
      if (!p.ok || p.y < g.minY - 80 || p.y > g.maxY + 80) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(bank);
      if (m === 0) {
        const hw = compact ? g.boxW * 0.44 : Math.min(g.boxW * 0.48, 250);
        glow(ctx, col === WARN ? WARN : GB, 4);
        ctx.beginPath();
        ctx.moveTo(-hw, 0); ctx.lineTo(-26, 0);
        ctx.moveTo(26, 0); ctx.lineTo(hw, 0);
        ctx.stroke();
        // 10-degree horizon compass ticks + cardinals.
        ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const H_MARKS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
        for (let deg = 0; deg < 360; deg += 10) {
          const az = wrap180(deg - S.heading);
          if (Math.abs(az) > 55) continue;
          const x = Math.tan(az * D2R) * fl;
          if (Math.abs(x) < 30 || Math.abs(x) > hw) continue;
          const major = deg % 30 === 0;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -(major ? 8 : 4)); ctx.stroke();
          if (H_MARKS[deg]) labelText(ctx, H_MARKS[deg], x, -10, col === WARN ? WARN : GB, 3);
        }
        ctx.restore();
        continue;
      }
      glow(ctx, col, 4);
      const major = Math.abs(m) % 10 === 0 || Math.abs(m) === 5;
      const len = Math.abs(m) % 10 === 0 ? rungW : rungW * 0.68;
      const tipY = m > 0 ? 7 : -7;             // outer tips point toward the horizon
      const tipX = m > 0 ? 4 : 4;
      ctx.setLineDash(m < 0 ? [7, 4] : []);
      ctx.beginPath();
      ctx.moveTo(-gap - len + tipX, tipY); ctx.lineTo(-gap - len, 0); ctx.lineTo(-gap, 0);
      ctx.moveTo(gap, 0); ctx.lineTo(gap + len, 0); ctx.lineTo(gap + len - tipX, tipY);
      ctx.stroke();
      ctx.setLineDash([]);
      if (major) {
        const txt = String(m);
        ctx.textAlign = 'right'; labelText(ctx, txt, -gap - len - 5, tipY * 0.4, col, 3);
        ctx.textAlign = 'left'; labelText(ctx, txt, gap + len + 5, tipY * 0.4, col, 3);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWaterline(ctx, p, col) {
    ctx.save();
    glow(ctx, col === WARN ? WARN : GB, 5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 22, p.y); ctx.lineTo(p.x - 10, p.y);
    ctx.lineTo(p.x - 5, p.y + 6); ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x + 5, p.y + 6); ctx.lineTo(p.x + 10, p.y);
    ctx.lineTo(p.x + 22, p.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawFPV(ctx, box, dt, col) {
    const v = S.velocity.clone().normalize();
    fpvDir.lerp(v, 1 - Math.exp(-dt / 0.055)).normalize();
    const p = toScreen(cam.position.clone().addScaledVector(fpvDir, 4500));
    if (!p.ok) return;
    const x0 = box.cx - box.boxW / 2 + 16, x1 = box.cx + box.boxW / 2 - 16;
    const y0 = box.minY + 18, y1 = box.maxY - 18;
    const x = clamp(p.x, x0, x1), y = clamp(p.y, y0, y1);
    const caged = x !== p.x || y !== p.y;
    ctx.save();
    glow(ctx, col, 4);
    ctx.lineWidth = 1.4;
    if (caged) ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 18, y); ctx.lineTo(x - 6.5, y);
    ctx.moveTo(x + 6.5, y); ctx.lineTo(x + 18, y);
    ctx.moveTo(x, y - 6.5); ctx.lineTo(x, y - 14);
    ctx.stroke();
    ctx.restore();
  }

  /* ------------------------------------------------- tapes & heading strip */
  // Open-ended pointed bracket readout: `[ 455 >` (point right) or `< 4256 ]` (point left).
  // 1 px vector strokes, no closed box and no opaque backing, so the sky stays clear.
  function drawOpenChevron(ctx, cx, cy, w, h, point, col, blur = 3) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, tip = Math.min(9, h * 0.42), serif = 5;
    ctx.save();
    glow(ctx, col, blur); ctx.lineWidth = 1; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.beginPath();
    if (point === 'right') {
      ctx.moveTo(x0 + serif, y0 + 0.5); ctx.lineTo(x0 + 0.5, y0 + 0.5); ctx.lineTo(x0 + 0.5, y1 - 0.5); ctx.lineTo(x0 + serif, y1 - 0.5);   // [
      ctx.moveTo(x1 - tip, y0 + 2); ctx.lineTo(x1, cy); ctx.lineTo(x1 - tip, y1 - 2);                                                     // >
    } else {
      ctx.moveTo(x1 - serif, y0 + 0.5); ctx.lineTo(x1 - 0.5, y0 + 0.5); ctx.lineTo(x1 - 0.5, y1 - 0.5); ctx.lineTo(x1 - serif, y1 - 0.5);   // ]
      ctx.moveTo(x0 + tip, y0 + 2); ctx.lineTo(x0, cy); ctx.lineTo(x0 + tip, y1 - 2);                                                     // <
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSlimTape(ctx, o, col) {
    const { x, top, bot, value, pxPerUnit, step, side, label, sub, subCol, next, vsi, compact } = o;
    const cy = (top + bot) / 2, half = (bot - top) / 2, dir = side === 'left' ? 1 : -1;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 58, top, 116, bot - top); ctx.clip();
    glow(ctx, col, 2);
    ctx.lineWidth = 1;
    ctx.font = f(compact ? 10 : 11);
    ctx.textBaseline = 'middle';
    // Hairline vertical ruler spine.
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x + dir * 10.5, top); ctx.lineTo(x + dir * 10.5, bot); ctx.stroke();
    const first = Math.floor((value - half / pxPerUnit) / step) * step - step;
    for (let v = first; v <= value + half / pxPerUnit + step; v += step) {
      const y = cy - (v - value) * pxPerUnit;
      const major = Math.round(v / step) % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(x + dir * 10, y);
      ctx.lineTo(x + dir * (10 + (major ? 7 : 3)), y);
      ctx.stroke();
      if (major && v >= 0 && Math.abs(y - cy) > 15) {
        ctx.textAlign = side === 'left' ? 'right' : 'left';
        labelText(ctx, String(v), x + dir * 5, y, col, 1);
      }
    }
    ctx.globalAlpha = 1;
    // 5 s speed trend caret on SPEED tape.
    if (next !== undefined) {
      const yn = clamp(cy - (next - value) * pxPerUnit, top + 6, bot - 6);
      glow(ctx, col, 3);
      ctx.beginPath(); ctx.moveTo(x + dir * 23, yn); ctx.lineTo(x + dir * 30, yn - 4.5); ctx.lineTo(x + dir * 30, yn + 4.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // VSI caret along inner edge of ALT tape.
    if (vsi !== undefined) {
      const k = clamp(vsi / 6000, -1, 1);
      const yc = cy - k * half * 0.88, xc = x - 34;
      ctx.save();
      glow(ctx, col, 3); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(xc + 4, cy); ctx.lineTo(xc + 4, yc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xc + 10, yc); ctx.lineTo(xc + 2, yc - 4.5); ctx.lineTo(xc + 2, yc + 4.5); ctx.closePath(); ctx.fill();
      ctx.font = f(11); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      labelText(ctx, (vsi >= 0 ? '+' : '') + Math.round(vsi / 10) * 10, xc - 1, yc, col, 2);
      ctx.restore();
    }

    // Open pointed bracket readout `[ 455 >` / `< 4256 ]` (no closed box, no backing).
    const boxW = compact ? 54 : 62, boxH = compact ? 20 : 24;
    const bx = side === 'left' ? x - boxW + 2 : x - 2;
    ctx.save();
    drawOpenChevron(ctx, bx + boxW / 2, cy, boxW, boxH, side === 'left' ? 'right' : 'left', col, 3);
    // Fine inner ruler pointer caret.
    glow(ctx, col, 2);
    ctx.beginPath();
    ctx.moveTo(x + dir * 10.5, cy); ctx.lineTo(x + dir * 15, cy - 3); ctx.lineTo(x + dir * 15, cy + 3); ctx.closePath(); ctx.fill();

    ctx.font = f(compact ? 16 : 18, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    labelText(ctx, String(Math.round(value)), bx + boxW / 2 + (side === 'left' ? -3 : 3), cy + 1, col, 3);

    ctx.font = f(compact ? 10 : 11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    labelText(ctx, label, bx + boxW / 2, top - 4, col, 3);

    if (sub) {
      const sc = subCol || col;
      ctx.font = f(compact ? 11 : 12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      labelText(ctx, sub, bx + boxW / 2, bot + 7, sc, 4);
    }
    ctx.restore();
  }

  function drawHeadingStrip(ctx, cx, y, w, col, compact) {
    const ppd = w / 72;
    const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    ctx.save();
    glow(ctx, col, 2); ctx.lineWidth = 1; ctx.font = f(compact ? 10 : 11);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - w / 2, y - 20, w, 28); ctx.clip();
    for (let hd = Math.floor((S.heading - 38) / 5) * 5; hd <= S.heading + 38; hd += 5) {
      const x = cx + (hd - S.heading) * ppd;
      const n = ((hd % 360) + 360) % 360;
      const major = n % 15 === 0;
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + (major ? 0 : 3)); ctx.stroke();
      if (NAMES[n]) labelText(ctx, NAMES[n], x, y - 3, col, 3);
      else if (n % 30 === 0) labelText(ctx, String(n / 10).padStart(2, '0'), x, y - 3, col, 3);
    }
    ctx.restore();
    // Fixed center caret + open digital heading `▼ 347` (no box).
    glow(ctx, col, 3);
    ctx.beginPath(); ctx.moveTo(cx, y + 7); ctx.lineTo(cx - 4, y + 1.5); ctx.lineTo(cx + 4, y + 1.5); ctx.closePath(); ctx.fill();
    const hdgTxt = String(Math.round(S.heading) % 360).padStart(3, '0');
    ctx.font = f(14, true); ctx.textBaseline = 'middle';
    labelText(ctx, hdgTxt, cx, y + 18, col, 3);
    ctx.lineWidth = 1; ctx.globalAlpha = 0.7;                 // hairline underscore ticks either side
    ctx.beginPath(); ctx.moveTo(cx - 24, y + 18); ctx.lineTo(cx - 17, y + 18); ctx.moveTo(cx + 17, y + 18); ctx.lineTo(cx + 24, y + 18); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawModeTag(ctx, x, y, txt, col, lit = true) {
    ctx.save();
    glow(ctx, col, lit ? 3 : 0);
    ctx.lineWidth = 1;                                       // open corner ticks instead of a closed box
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 0.5); ctx.lineTo(x + 0.5, y + 0.5); ctx.lineTo(x + 0.5, y + 16.5); ctx.lineTo(x + 5, y + 16.5);
    ctx.moveTo(x + 31, y + 0.5); ctx.lineTo(x + 35.5, y + 0.5); ctx.lineTo(x + 35.5, y + 16.5); ctx.lineTo(x + 31, y + 16.5);
    ctx.stroke();
    ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + 18, y + 9);
    ctx.restore();
  }

  /* ---------------------------------------------- target brackets & chevrons */
  function drawCornerBracket(ctx, x, y, s, arm) {
    ctx.beginPath();
    // Top-left, top-right, bottom-right, bottom-left open L-corners.
    ctx.moveTo(x - s, y - s + arm); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + arm, y - s);
    ctx.moveTo(x + s - arm, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + arm);
    ctx.moveTo(x + s, y + s - arm); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - arm, y + s);
    ctx.moveTo(x - s + arm, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - arm);
    ctx.stroke();
  }

  function diamond(ctx, x, y, s, rot = 0) {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = rot + k * Math.PI / 2;
      const px = x + Math.sin(a) * s, py = y - Math.cos(a) * s;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }

  // Radar / seeker track for a bandit: { st: NONE|ACQ|LOCK, prog, n } (n = 4AAM slot 1-4, 0 for MSL).
  function trackInfo(e) {
    if (C.weapon === 'AAM4') { const i = (C.multi || []).indexOf(e); return i < 0 ? null : { st: C.multiState[i], prog: C.multiProg[i], n: i + 1 }; }
    return C.designated === e ? { st: C.lockState, prog: C.lockProgress, n: 0 } : null;
  }
  const blipKind = e => { const t = trackInfo(e); return !t ? 'bogey' : t.st === 'LOCK' ? 'lock' : t.st === 'ACQ' ? 'acq' : 'desig'; };
  function lockColor() { return C.lockState === 'LOCK' ? WARN : C.lockState === 'ACQ' ? AMBER : G; }

  function drawSeekerCircle(ctx) {
    // Seeker circle only once C has armed the seeker (passive radar tracking shows none).
    const aam = C.weapon === 'AAM4';
    if (!C.seekerArmed || !C.designated || C.dead || C.weapon === 'BOMB') return;
    if (aam ? C.aam4 <= 0 || C.aam4Reload > 0 : C.missiles <= 0 || C.missileReload > 0) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const c = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    const e = toScreen(cam.position.clone().addScaledVector(fwd, 5000).addScaledVector(up, 5000 * Math.tan((aam ? 25 : 7) * D2R)));
    if (!c.ok || !e.ok) return;
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    ctx.save();
    glow(ctx, lockColor(), aam ? 0 : 4);
    ctx.lineWidth = aam ? 1 : LW;
    if (aam) { ctx.globalAlpha = 0.4; ctx.setLineDash([2, 7]); }   // wide 4AAM TWS field: faint hairline
    else if (C.lockState === 'NONE') ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    if (C.lockState === 'ACQ' && !aam) {
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * C.lockProgress); ctx.stroke();
    }
    ctx.restore();
  }

  // Boresight Acquisition Ring: the 22 deg C-key designation zone around the W.
  // Faint dotted ring normally; pulses bright emerald when C snaps onto a target
  // (amber flash when C finds nothing in the cone).
  function drawAcquisitionRing(ctx) {
    if (C.dead) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const c = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    const e = toScreen(cam.position.clone().addScaledVector(fwd, 5000).addScaledVector(up, 5000 * Math.tan((C.weapon === 'AAM4' ? 25 : 7) * D2R)));
    if (!c.ok || !e.ok) return;
    const r = Math.hypot(e.x - c.x, e.y - c.y);
    const age = (performance.now() - (C.designateT || -1e9)) / 1000;
    const pulse = age < 0.6 ? 1 - age / 0.6 : 0;
    if (pulse <= 0) return;                                   // C-press flash only; radar tracking needs no ring
    ctx.save();
    if (pulse > 0) {
      const col = C.designateOk ? G : AMBER;
      glow(ctx, col, 10 * pulse);
      ctx.globalAlpha = 0.35 + 0.65 * pulse;
      ctx.lineWidth = 1.2 + 1.8 * pulse;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * (1 + 0.06 * pulse), 0, Math.PI * 2); ctx.stroke();
    } else {
      glow(ctx, 'rgba(88, 255, 154, 0.5)', 0);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function formatDist(m) {
    return m < 0.5 * 1852 ? Math.round(m) + ' M' : (m / 1852).toFixed(1) + ' NM';
  }

  function drawTargets(ctx) {
    const now = performance.now();
    if (C.lockState === 'LOCK' && prevLockState !== 'LOCK') lockSnapT = now;
    prevLockState = C.lockState;

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const ch = A.isFirstPerson() ? null : chaseLayout();
    const inTape = (px, py) => ch && py > ch.tapeTop - 22 && py < ch.tapeBot + 28 &&
      ((px > ch.tapeL - 66 && px < ch.tapeL + 24) || (px > ch.tapeR - 24 && px < ch.tapeR + 66));
    const inCorner = (px, py) => (px < 268 && py < 195) || (px < 252 && py > HH - 248) || (px > HW - 200 && py > HH - 300);
    const onScreenOf = (pos, isPrim = false) => {
      const p = toScreen(pos);
      return { p, on: pos.clone().sub(cam.position).dot(fwd) > 0 && p.ok && p.x > 36 && p.x < HW - 36 && p.y > 42 && p.y < HH - 42 && !inCorner(p.x, p.y) && (isPrim || !inTape(p.x, p.y)) };
    };
    drawAcquisitionRing(ctx);
    drawSeekerCircle(ctx);
    if (A.getPad && A.getPad().k > 0.2) {
      ctx.save(); glow(ctx, '#00c8ff', 4); ctx.fillStyle = '#00c8ff';
      ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('◁ PADLOCK', HW / 2, HH * 0.16); ctx.restore();
    }

    const prim = C.designated && C.designated.alive ? C.designated : null;
    const nextTgt = C.nextTarget && C.nextTarget.alive ? C.nextTarget : null;
    const offRing = [];

    for (const e of (A.getTargets ? A.getTargets() : A.getEnemies())) {     // bandits + task-force ships + drones
      if (!e.alive) continue;
      if (e.kind === 'DRONE' && !trackInfo(e)) {                            // compact UAV diamond, no range text
        const p = droneScreen(e.pos);
        if (p.ok && p.x > 36 && p.x < HW - 36 && p.y > 42 && p.y < HH - 42) {
          ctx.save(); glow(ctx, '#ffb838', 3); ctx.lineWidth = 1.1;
          diamond(ctx, p.x, p.y, 7);
          ctx.restore();
        }
        continue;                                                           // locked drones fall through to the normal lock box
      }
      const range = e.pos.distanceTo(S.position);
      const { p, on } = onScreenOf(e.pos, e === prim);
      if (!on) {
        offRing.push({ pos: e.pos, isPrim: e === prim, isThreat: e.ace || (e.bLock || 0) >= 0.45, range, label: e.ace ? 'ACE ' + e.label : e.type || e.label });
        continue;
      }

      if (e.aceFlight) { drawAceFlightMark(ctx, e, p); continue; }
      if (e.ace) drawAceMark(ctx, e, p, now);
      const info = trackInfo(e);
      if (!info) {
        const isNext = e === nextTgt;
        const s = isNext ? 15 : 11;
        const col = isNext ? 'rgba(88, 255, 154, 0.85)' : 'rgba(88, 255, 154, 0.6)';
        ctx.save();
        glow(ctx, col, isNext ? 3 : 2);
        ctx.lineWidth = isNext ? 1.25 : 1;
        drawCornerBracket(ctx, p.x, p.y, s, isNext ? 5 : 4);
        ctx.font = f(10, true);
        if (isNext) {
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          labelText(ctx, 'NEXT', p.x + s + 5, p.y - 5, col, 2);
          labelText(ctx, formatDist(range), p.x + s + 5, p.y + 6, col, 2);
        } else {
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          labelText(ctx, (range / 1852).toFixed(1), p.x, p.y + s + 3, col, 2);
        }
        ctx.restore();
        continue;
      }

      // Tracked target: green radar brackets (passive), amber ACQ diamond, crimson LOCK square.
      const st = info.st, tag = info.n ? ' ' + info.n : '';
      const shootRange = C.weapon === 'AAM4' ? 4.5 * 1852 : 3.5 * 1852;
      const baseS = clamp(15000 / Math.max(range, 350), 17, 30);
      const col = st === 'LOCK' ? WARN : G;
      ctx.save();
      if (st === 'LOCK') {
        const snap = clamp(1 - (now - lockSnapT) / 180, 0, 1);
        const s = baseS * (1 + 0.45 * snap);
        glow(ctx, WARN, 6);
        ctx.lineWidth = 1.6;
        drawCornerBracket(ctx, p.x, p.y, s, Math.round(s * 0.4));
        ctx.lineWidth = 1.25;
        const q = s * 0.46; ctx.strokeRect(p.x - q, p.y - q, q * 2, q * 2);            // crimson lock square
        // Circular range arc: full ring at point blank, shrinking to nothing at max range.
        const rk = clamp(1 - range / (shootRange * 1.6), 0.04, 1);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, s + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rk); ctx.stroke();
        ctx.font = f(13, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const cue = C.shootCue && Math.floor(now / 125) % 2 ? '[ SHOOT ]' : 'LOCK' + tag;
        labelText(ctx, cue, p.x, p.y - s - 10, C.shootCue ? '#00ff66' : WARN, 5);
      } else if (st === 'ACQ') {
        // Rotating outer diamond shrinking cleanly onto the bracket as lock builds.
        const k = 1 + 1.15 * (1 - info.prog);
        const acqCol = info.prog > 0.72 ? WARN : AMBER;
        glow(ctx, G, 4); ctx.lineWidth = 1.4;
        drawCornerBracket(ctx, p.x, p.y, baseS, Math.round(baseS * 0.38));
        glow(ctx, acqCol, 5); ctx.lineWidth = 1.5;
        diamond(ctx, p.x, p.y, baseS * k, now / 220);
        ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        labelText(ctx, 'ACQ' + tag, p.x, p.y - baseS - 6, acqCol, 4);
      } else {
        glow(ctx, G, 4); ctx.lineWidth = 1.4;
        drawCornerBracket(ctx, p.x, p.y, baseS, Math.round(baseS * 0.38));
      }

      // Stacked micro-labels beside the target bracket: TGT/TYPE, CALLSIGN, DISTANCE.
      const flipLeft = p.x + baseS + 108 > HW;
      const lx = flipLeft ? p.x - baseS - 7 : p.x + baseS + 7;
      ctx.textAlign = flipLeft ? 'right' : 'left'; ctx.textBaseline = 'middle';
      ctx.font = f(11, true);
      labelText(ctx, `${info.n ? 'TGT ' + info.n : 'TGT'}  ${e.type || 'BANDIT'}`, lx, p.y - 11, col, 3);
      ctx.font = f(10);
      labelText(ctx, e.label, lx, p.y + 1, col, 2);
      labelText(ctx, formatDist(range), lx, p.y + 12, col, 2);
      if (info.n <= 1 && C.targetObscured && Math.floor(now / 160) % 3) {
        // Bandit hiding in cloud: flickering amber obscured bracket + tag.
        glow(ctx, AMBER, 5); ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
        drawCornerBracket(ctx, p.x, p.y, baseS + 7, Math.round(baseS * 0.45));
        ctx.setLineDash([]);
        ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        labelText(ctx, 'CLOUD OBSCURED', p.x, p.y + baseS + 10, AMBER, 4);
      }
      ctx.restore();
    }

    // Swarm group bracket: one amber `SWARM n/8` badge at the live centroid.
    const drones = A.getDrones ? A.getDrones() : null;
    if (drones) {
      let n = 0, cx = 0, cy = 0, cz = 0;
      for (const d of drones) if (d.alive) { cx += d.pos.x; cy += d.pos.y; cz += d.pos.z; n++; }
      if (n) {
        const p = droneScreen(_drCentroid.set(cx / n, cy / n, cz / n));
        if (p.ok && p.x > 90 && p.x < HW - 90 && p.y > 70 && p.y < HH - 70) {
          ctx.save(); glow(ctx, '#ffb838', 4); ctx.lineWidth = 1.2;
          drawCornerBracket(ctx, p.x, p.y, 22, 8);
          ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          labelText(ctx, 'SWARM ' + n + '/8', p.x, p.y - 26, '#ffb838', 4);
          ctx.restore();
        }
      }
    }

    // Inbound enemy missiles: flashing crimson diamond on screen, chevron on 26% ring off-screen.
    for (const m of A.missiles) {
      if (!m.active || !m.enemy) continue;
      const { p, on } = onScreenOf(m.mesh.position);
      if (on) {
        if (mslFlash()) {
          ctx.save(); glow(ctx, WARN, 6); ctx.lineWidth = 1.6;
          diamond(ctx, p.x, p.y, 9);
          ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          labelText(ctx, 'MSL', p.x, p.y - 11, WARN, 4);
          ctx.restore();
        }
      } else {
        offRing.push({ pos: m.mesh.position, isMsl: true, range: m.mesh.position.distanceTo(S.position) });
      }
    }

    // Off-screen pointers: hollow edge triangles (filled crimson for missiles) with
    // stacked micro-labels, sliding along the screen border clear of the corner clusters.
    const EDGE = 40, placed = [];
    offRing.sort((a, b) => (b.isMsl - a.isMsl) || (b.isPrim - a.isPrim) || a.range - b.range);
    for (const item of offRing) {
      const v = item.pos.clone().applyMatrix4(cam.matrixWorldInverse);
      let ang = Math.atan2(-v.y, v.x);
      if (v.z > 0 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) ang = Math.PI / 2;
      const mx = HW / 2 - EDGE, my = HH / 2 - EDGE;
      const k = Math.min(mx / Math.max(Math.abs(Math.cos(ang)), 1e-3), my / Math.max(Math.abs(Math.sin(ang)), 1e-3));
      let px = HW / 2 + Math.cos(ang) * k, py = HH / 2 + Math.sin(ang) * k;
      // Keep clear of the top-left telemetry, radar (bottom-left) and stores (bottom-right).
      if (px < 250 && py < 150) { if (Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang))) py = 150; else px = 250; }
      if (px < 270 && py > HH - 270) { if (Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang))) py = HH - 270; else px = 270; }
      if (px > HW - 210 && py > HH - 310) { if (Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang))) py = HH - 310; else px = HW - 210; }
      // De-overlap: slide along the edge away from pointers already placed.
      const sideEdge = Math.abs(Math.cos(ang)) * my > Math.abs(Math.sin(ang)) * mx;
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find(q => Math.abs(q.x - px) < (sideEdge ? 40 : 70) && Math.abs(q.y - py) < (sideEdge ? 36 : 34));
        if (!hit) break;
        if (sideEdge) py = hit.y + (py >= hit.y ? 38 : -38); else px = hit.x + (px >= hit.x ? 72 : -72);
      }
      placed.push({ x: px, y: py });
      const col = item.isMsl || item.isThreat || (item.isPrim && C.lockState === 'LOCK') ? WARN
        : item.isPrim ? (C.lockState === 'ACQ' ? AMBER : G) : GD;
      const sz = item.isMsl || item.isPrim ? 1 : 0.75;
      if (item.isMsl && !mslFlash()) continue;
      ctx.save();
      ctx.translate(px, py); ctx.rotate(ang);
      glow(ctx, col, item.isMsl || item.isPrim ? 6 : 3);
      ctx.lineWidth = LW;
      ctx.beginPath();
      ctx.moveTo(12 * sz, 0); ctx.lineTo(-7 * sz, -8 * sz); ctx.lineTo(-7 * sz, 8 * sz); ctx.closePath();
      if (item.isMsl) ctx.fill(); else ctx.stroke();
      ctx.restore();
      // Stacked labels on the inboard side of the pointer.
      ctx.save();
      ctx.font = f(11, true); ctx.textBaseline = 'middle';
      const lx = px - Math.cos(ang) * 30, ly = py - Math.sin(ang) * 22;
      ctx.textAlign = Math.cos(ang) > 0.35 ? 'right' : Math.cos(ang) < -0.35 ? 'left' : 'center';
      const name = item.isMsl ? 'MSL' : item.isPrim ? 'TGT' : (item.label || 'BANDIT');
      labelText(ctx, name, lx, ly - 6, col, 3);
      labelText(ctx, formatDist(item.range), lx, ly + 6, col, 3);
      ctx.restore();
    }

    drawLeadReticle(ctx);
    drawCCIP(ctx);
  }

  /* --------------------------------------------------- CCIP & M61 gun sight */
  function drawCCIP(ctx) {
    if (C.weapon !== 'BOMB' || C.dead) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const w = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    if (!w.ok) return;
    const now = performance.now();
    ctx.save(); ctx.textAlign = 'center';
    if (C.bombs <= 0 || C.bombReload > 0) {
      ctx.font = f(13, true); ctx.textBaseline = 'top';
      labelText(ctx, 'UGB RLD ' + Math.max(0, C.bombReload).toFixed(1), w.x, w.y + 34, AMBER, 4);
      ctx.restore(); return;
    }
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    drawSurfaceTargets(ctx, camFwd);
    if (C.ccrp) { drawCCRP(ctx, camFwd, now); ctx.restore(); return; }
    const c = C.ccip;
    const inFront = c && c.clone().sub(cam.position).dot(camFwd) > 0;
    const p = c && inFront ? toScreen(c) : null;
    const onScreen = p && p.ok && p.x > 20 && p.x < HW - 20 && p.y > 20 && p.y < HH - 20;
    glow(ctx, G, 5); ctx.lineWidth = 1.4;
    if (onScreen) {
      ctx.beginPath(); ctx.moveTo(w.x, w.y + 10); ctx.lineTo(p.x, p.y - 14); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, C.ccipTof / 20)); ctx.stroke();
      const rng = Math.hypot(c.x - S.position.x, c.z - S.position.z) / 1852;
      ctx.font = f(11, true); ctx.textBaseline = 'top';
      labelText(ctx, 'T ' + C.ccipTof.toFixed(1) + 'S  ' + rng.toFixed(1) + 'NM', p.x, p.y + 21, G, 3);
    } else {
      const dir = p ? new THREE.Vector2(p.x - w.x, p.y - w.y) : new THREE.Vector2(0, 1);
      if (dir.y < 0.2 * Math.abs(dir.x) || dir.lengthSq() < 1) dir.set(dir.x, Math.abs(dir.x) * 0.2 + 1);
      dir.normalize();
      const k = Math.min((HH - 34 - w.y) / Math.max(dir.y, 1e-3), dir.x ? (dir.x > 0 ? HW - 34 - w.x : w.x - 34) / Math.abs(dir.x) : 1e9);
      const ex = w.x + dir.x * k, ey = w.y + dir.y * k;
      ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(w.x, w.y + 10); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      if (Math.floor(now / 300) % 2) {
        ctx.font = f(12, true); ctx.textBaseline = 'bottom';
        labelText(ctx, c ? 'CCIP DIVE' : 'CCIP NO SOLN', ex, ey - 6, AMBER, 4);
      }
    }
    ctx.restore();
  }

  // Surface strike targets (>UGB): small squares, the designated one boxed and labelled.
  function drawSurfaceTargets(ctx, camFwd) {
    for (const t of A.getSurface ? A.getSurface() : []) {
      if (!t.alive || t.pos.clone().sub(cam.position).dot(camFwd) <= 0) continue;
      const p = toScreen(t.pos); if (!p.ok) continue;
      const prim = t === C.groundTgt, s = prim ? 13 : 6;
      ctx.save(); glow(ctx, prim ? GB : 'rgba(88,255,154,0.6)', prim ? 4 : 0); ctx.lineWidth = prim ? 1.4 : 1;
      ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
      if (prim) {
        ctx.beginPath(); ctx.moveTo(p.x - s - 6, p.y); ctx.lineTo(p.x - s, p.y); ctx.moveTo(p.x + s, p.y); ctx.lineTo(p.x + s + 6, p.y); ctx.stroke();
        ctx.font = f(11, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        labelText(ctx, `TGT ${t.kind}`, p.x + s + 9, p.y - 6, GB, 3);
        labelText(ctx, (Math.hypot(t.pos.x - S.position.x, t.pos.z - S.position.z) / 1852).toFixed(1) + ' NM', p.x + s + 9, p.y + 7, G, 2);
      }
      ctx.restore();
    }
  }
  // CCRP: azimuth steering line through the target, release cue bar sliding down
  // toward the flight-path vector, time-to-release readout; auto-release fires
  // when the bar crosses the FPV with the pickle held (C.ccrpArmed).
  function drawCCRP(ctx, camFwd, now) {
    const r = C.ccrp, t = r.tgt;
    const vdir = S.velocity.clone().normalize();
    const fp = toScreen(cam.position.clone().addScaledVector(vdir, 4500));
    if (!fp.ok) return;
    const tp = toScreen(t.pos), inFront = t.pos.clone().sub(cam.position).dot(camFwd) > 0;
    const sx = inFront && tp.ok ? clamp(tp.x, 40, HW - 40) : (r.cross > 0 ? HW - 40 : 40);
    const col = C.ccrpArmed ? AMBER : G;
    ctx.save();
    glow(ctx, col, 4); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(sx, 70); ctx.lineTo(sx, HH - 90); ctx.stroke();                 // steering line
    ctx.beginPath(); ctx.arc(fp.x, fp.y, 7, 0, Math.PI * 2);                                      // FPV
    ctx.moveTo(fp.x - 18, fp.y); ctx.lineTo(fp.x - 7, fp.y); ctx.moveTo(fp.x + 7, fp.y); ctx.lineTo(fp.x + 18, fp.y); ctx.stroke();
    const yb = fp.y - clamp(r.ttr * 24, -30, HH * 0.42);                                         // release cue bar
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(sx - 26, yb); ctx.lineTo(sx + 26, yb); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx - 26, yb); ctx.lineTo(sx - 26, yb + 6); ctx.moveTo(sx + 26, yb); ctx.lineTo(sx + 26, yb + 6); ctx.stroke();
    ctx.font = f(13, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ttrTxt = r.ttr >= 0 ? `REL ${r.ttr.toFixed(1).padStart(4, '0')}s` : 'OVERFLY';
    labelText(ctx, ttrTxt, sx + 32, yb, r.ttr >= 0 ? col : AMBER, 4);
    ctx.font = f(11, true);
    labelText(ctx, `CCRP  ${t.label}  ${(r.range / 1852).toFixed(1)}NM  TOF ${r.tof.toFixed(1)}s`, sx + 32, yb + 15, G, 2);
    if (Math.abs(r.cross) > 60) labelText(ctx, r.cross > 0 ? 'STEER R >' : '< STEER L', sx + 32, yb + 29, AMBER, 3);
    if (C.ccrpArmed && Math.floor(now / 250) % 2) {
      ctx.font = f(14, true); ctx.textAlign = 'center';
      labelText(ctx, 'CCRP ARMED — HOLD', fp.x, fp.y + 34, AMBER, 5);
    }
    ctx.restore();
  }

  const GUN_RANGE = 1852, SHOOT_RANGE = 0.6 * 1852, FUNNEL_RANGE = 1.2 * 1852, WINGSPAN = 13.0;
  const _gq = new THREE.Quaternion(), _inv = new THREE.Quaternion(), _w = new THREE.Vector3();
  const _gDefPort = new THREE.Vector3(1.45, 0.35, -1.8), _gPort = new THREE.Vector3(), _gBoreL = new THREE.Vector3(), _gFwd = new THREE.Vector3();
  const _gGeom = { port: _gPort, boreL: _gBoreL, fwd: _gFwd, vb: 1050 };
  const _gDrop = new THREE.Vector3(), _gLocal = new THREE.Vector3(), _gunW = new THREE.Vector3();
  const _lsZero = new THREE.Vector3(), _lsPort = new THREE.Vector3(), _lsNeed = new THREE.Vector3(), _lsPred = new THREE.Vector3();
  const _lsBoreW = new THREE.Vector3(), _lsOff = new THREE.Quaternion(), _drVec = new THREE.Vector3();
  function gunGeom() {
    _gPort.copy(C.gunPort || _gDefPort);
    _gBoreL.set(0, 0, -(C.convergeM || 457)).sub(_gPort).normalize();
    _gFwd.set(0, 0, -1).applyQuaternion(S.quaternion);
    _gGeom.vb = C.bulletSpeed || 1050;
    return _gGeom;
  }
  function roundRel(g, R, lateral) {
    const t = R / g.vb;
    _inv.copy(S.quaternion).invert();
    _gDrop.set(0, -0.5 * 9.81 * t * t, 0).applyQuaternion(_inv);
    _gLocal.copy(g.port).addScaledVector(g.boreL, R).add(_gDrop);
    _gLocal.x += lateral;
    _gunW.set(S.pitchRate, S.yawRate, S.rollRate);
    const ang = _gunW.length() * t;
    if (ang > 1e-5) _gLocal.applyQuaternion(_gq.setFromAxisAngle(_gunW.normalize(), -ang));
    return _gLocal.applyQuaternion(S.quaternion).add(S.position);
  }
  function gunSightActive() {
    const t = C.designated;
    return C.gunFiring || (t && t.alive && t.pos.distanceTo(S.position) < FUNNEL_RANGE);
  }
  function drawGunFunnel(ctx, col) {
    if (!gunSightActive() || C.dead) return;
    const g = gunGeom();
    const L = [], Rr = [], ticks = [];
    for (let R = 120; R <= 1650; R += 55) {
      const a = toScreen(roundRel(g, R, -WINGSPAN / 2)), b = toScreen(roundRel(g, R, WINGSPAN / 2));
      if (!a.ok || !b.ok) break;
      L.push(a); Rr.push(b);
      if (Math.abs(R - 450) < 28 || Math.abs(R - 900) < 28) ticks.push([a, b]);
    }
    if (L.length < 2) return;
    ctx.save();
    glow(ctx, col, 3); ctx.globalAlpha = 0.72; ctx.lineWidth = 1.25;
    for (const line of [L, Rr]) {
      ctx.beginPath(); line.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (const [a, b] of ticks) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x - a.x) * 0.2, a.y + (b.y - a.y) * 0.2);
      ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - (b.x - a.x) * 0.2, b.y - (b.y - a.y) * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function leadSolution(t) {
    const g = gunGeom();
    _lsPort.copy(g.port).applyQuaternion(S.quaternion).add(S.position);
    const acc = t.acc || _lsZero;
    let tof = t.pos.distanceTo(_lsPort) / g.vb;
    for (let i = 0; i < 4; i++) {
      _lsPred.copy(t.pos).addScaledVector(t.vel, tof).addScaledVector(acc, 0.5 * tof * tof);
      _lsNeed.copy(_lsPred).sub(_lsPort).addScaledVector(S.velocity, -tof).add(_w.set(0, 0.5 * 9.81 * tof * tof, 0));
      tof = _lsNeed.length() / g.vb;
    }
    const dirAim = _lsNeed.normalize();
    _lsBoreW.copy(g.boreL).applyQuaternion(S.quaternion);
    _lsOff.setFromUnitVectors(_lsBoreW, g.fwd);
    return { reticleDir: dirAim.applyQuaternion(_lsOff), tof };
  }
  function drawLeadReticle(ctx) {
    const t = C.designated, now = performance.now();
    const hitTick = now - (C.hitMarker || 0) < 170;
    if (!t || !t.alive || C.dead) return;
    const range = t.pos.distanceTo(S.position);
    if (range > GUN_RANGE) return;
    const sol = leadSolution(t);
    const p = toScreen(_drVec.copy(cam.position).addScaledVector(sol.reticleDir, 3000));
    const tp = toScreen(t.pos);
    if (!p.ok) return;
    _drVec.set(0, 0, -1).applyQuaternion(S.quaternion);
    const bore = toScreen(_drVec.multiplyScalar(5000).add(cam.position));
    const r = 21, frac = clamp(range / GUN_RANGE, 0, 1);
    const col = C.lockState === 'LOCK' ? WARN : G;
    ctx.save();
    if (tp.ok) {
      glow(ctx, col, 2); ctx.globalAlpha = 0.65; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x, tp.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    glow(ctx, col, 4); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    ctx.lineWidth = 1.25;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * (r + 1), p.y + Math.sin(a) * (r + 1)); ctx.lineTo(p.x + Math.cos(a) * (r + 7), p.y + Math.sin(a) * (r + 7)); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    if (hitTick) {
      glow(ctx, '#ffffff', 6); ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.moveTo(p.x + sx * (r + 8), p.y + sy * (r + 8)); ctx.lineTo(p.x + sx * (r + 17), p.y + sy * (r + 17));
      }
      ctx.stroke();
    }
    const onTarget = bore.ok && Math.hypot(bore.x - p.x, bore.y - p.y) < r;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    if (onTarget && range < SHOOT_RANGE) {
      ctx.font = f(14, true); labelText(ctx, 'SHOOT', p.x, p.y + r + 9, col, 6);
    } else {
      ctx.font = f(11, true); labelText(ctx, (range / 1852).toFixed(2) + ' NM', p.x, p.y + r + 9, col, 3);
    }
    ctx.restore();
  }

  /* --------------------------------------------------- 4-corner AC7 clusters */
  function drawTopLeft(ctx) {
    // Minimal AC8 telemetry: no opaque box, dark text shadows only.
    const x = 22, y = 18;
    ctx.save();
    glow(ctx, G, 4); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 6, y + 10); ctx.lineTo(x - 6, y - 4); ctx.lineTo(x + 18, y - 4); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = f(13, true);
    labelText(ctx, 'TIME', x, y, GD, 3);
    labelText(ctx, 'SCORE', x, y + 19, GD, 3);
    ctx.font = f(16, true);
    labelText(ctx, A.missionClock(), x + 52, y - 1, GB, 5);
    const score = C.score ?? C.kills * 1500;
    labelText(ctx, String(score).padStart(6, '0'), x + 52, y + 18, GB, 5);
    // Combo multiplier badge: big x2.5 readout + 4 px glowing decay bar under
    // SCORE; bounces on every climb; colour tier emerald -> gold -> crimson.
    let comboH = 0;
    const cm = C.comboMult;
    if (cm !== undefined) {
      if (cm > comboSeen + 1e-6) comboPulseT = performance.now();
      comboSeen = cm;
    }
    if (cm !== undefined && cm > 1.0) {
      const col = comboColor(cm);
      const frac = clamp(C.comboTimer / (C.comboWindow || 12), 0, 1);
      const pt = (performance.now() - comboPulseT) / 1000;
      const pop = 1 + 0.45 * Math.exp(-pt * 9) * Math.cos(pt * 26);          // springy bounce
      const yy = y + 40;
      ctx.save();
      ctx.translate(x, yy + 12); ctx.scale(pop, pop);
      ctx.font = f(24, true); ctx.textBaseline = 'middle';
      labelText(ctx, 'x' + cm.toFixed(2).replace(/0$/, ''), 0, 0, col, 10);
      ctx.restore();
      const bx = x + 64, bw = 90, by0 = yy + 10;
      noGlow(ctx);
      ctx.fillStyle = 'rgba(0,10,6,0.55)'; ctx.fillRect(bx - 1, by0 - 1, bw + 2, 6);
      ctx.fillStyle = 'rgba(88,255,154,0.18)'; ctx.fillRect(bx, by0, bw, 4);
      glow(ctx, col, 8); ctx.fillStyle = col; ctx.fillRect(bx, by0, bw * frac, 4);
      comboH = 30;
    }
    const alive = A.getEnemies().filter(e => e.alive).length;
    ctx.font = f(12, true);
    const ph = C.phase ? `PHASE ${C.phase}  ` : '';
    labelText(ctx, ph + 'BANDITS ' + alive, x, y + 40 + comboH, C.phase === 3 ? BLAZE : G, 3);
    // PHASE 3: Ace structural integrity bar.
    if (C.ace && C.ace.alive) {
      const yy = y + 58 + comboH, frac = clamp(C.ace.hp / (C.ace.hpMax || 1), 0, 1);
      ctx.font = f(11, true); labelText(ctx, 'ACE ' + C.ace.label, x, yy, BLAZE, 4);
      const bx = x + 78, bw = 84;
      noGlow(ctx); ctx.fillStyle = 'rgba(30, 0, 6, 0.6)'; ctx.fillRect(bx - 1, yy + 3, bw + 2, 6);
      glow(ctx, BLAZE, 6); ctx.fillStyle = BLAZE; ctx.fillRect(bx, yy + 4, bw * frac, 4);
      comboH += 18;
    }
    let ey = y + 62 + comboH;
    let by = y + 58 + comboH;
    if (A.isNVG && A.isNVG()) { drawNVGBadge(ctx, x, by); ey += 26; by += 26; }
    const wx = A.getWeather && A.getWeather();
    if (wx && wx.rain > 0.02) { drawBadge(ctx, x, by, `[ WX: ${wx.label} ]`, wx.storm ? AMBER : CYAN); ey += 26; }

    // Floating kill / evade event popups.
    const now = performance.now();
    const evs = (C.events || []).filter(ev => ev.until > now);
    evs.slice(-3).forEach((ev, i) => {
      const age = (now - ev.born) / 1000, left = (ev.until - now) / 1000;
      ctx.globalAlpha = clamp(Math.min(age * 6, left * 1.8), 0, 1);
      const yy = ey + i * 20;
      glow(ctx, ev.color || G, 4); ctx.fillRect(x - 6, yy + 1, 2, 14);
      ctx.font = f(12, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      labelText(ctx, (ev.points ? `+${ev.points}  ` : '') + ev.text, x + 2, yy, ev.color || G, 4);
    });
    ctx.restore();
  }

  // Island topography contour sheet, world-aligned, built once.
  const topo = (() => {
    const N = 384, T = A.terrain, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const h = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      h[j * N + i] = T.height(T.cx + ((i + 0.5) / N - 0.5) * T.size, T.cz + ((j + 0.5) / N - 0.5) * T.size);
    }
    const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
    // Crisp coastline (0 m) + faint contours at 100 / 250 / 500 / 750 m.
    const levels = [[0, 255], [100, 80], [250, 100], [500, 120], [750, 140]];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i];
      let alpha = 0;
      for (const [lv, al] of levels) if ((a >= lv) !== (b >= lv) || (a >= lv) !== (c >= lv)) alpha = Math.max(alpha, al);
      if (a > 0 && alpha < 26) alpha = 26;                // subtle land fill so straits / canyons read clearly
      const k = (j * N + i) * 4;
      img.data[k] = 82; img.data[k + 1] = 255; img.data[k + 2] = 156; img.data[k + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    // Runway + bridge spans as bright strokes (navigation references at night / in cloud).
    const toPx = ([wx, wz]) => [((wx - (T.cx - T.size / 2)) / T.size) * N, ((wz - (T.cz - T.size / 2)) / T.size) * N];
    for (const m of T.marks || []) {
      ctx.strokeStyle = m.kind === 'runway' ? 'rgba(220,255,235,1)' : 'rgba(88,255,154,0.95)';
      ctx.lineWidth = m.kind === 'runway' ? 2.2 : 1.6;
      ctx.beginPath(); m.pts.map(toPx).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    return { cv, x0: T.cx - T.size / 2, z0: T.cz - T.size / 2, size: T.size };
  })();

  function drawSquareRadar(ctx) {
    const s = Math.round(Math.min(216, HH * 0.30, HW * 0.22)), x0 = 20, y0 = HH - s - 20;
    const cx = x0 + s / 2, cy = y0 + s * 0.54, half = s / 2;
    // 4 NM scale: islands, straits and the canyon gorge are readable for instrument
    // navigation at night / in cloud; bandits beyond range ride the rim.
    const MAX_M = RADAR_ZOOMS[radarZoom], k = (half * 0.90) / MAX_M, hRad = S.heading * D2R;
    const border = flashRed() || C.banditLock >= 1 ? WARN : C.rwrTrack ? AMBER : G;

    ctx.save();
    const RR = 5;                                             // rounded micro-corners
    const frame = new Path2D(); frame.roundRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1, RR);
    noGlow(ctx); ctx.fillStyle = 'rgba(6, 26, 14, 0.30)'; ctx.fill(frame);
    ctx.save();
    ctx.clip(frame);

    // Island contours (heading-up).
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-hRad); ctx.scale(k, k); ctx.translate(-S.position.x, -S.position.z);
    ctx.globalAlpha = 0.6; ctx.drawImage(topo.cv, topo.x0, topo.z0, topo.size, topo.size);
    ctx.restore();

    // Three concentric range rings.
    ctx.strokeStyle = 'rgba(88, 255, 154, 0.34)'; ctx.lineWidth = 1;
    for (const fr of [0.33, 0.66, 0.97]) { ctx.beginPath(); ctx.arc(cx, cy, half * 0.90 * fr, 0, Math.PI * 2); ctx.stroke(); }

    // Friendly ESM umbrella: a translucent cyan circle in the same heading-up
    // world transform as the contour sheet; clipped by the radar frame already.
    const esm = A.getESM ? A.getESM() : null;
    if (esm && esm.on) {
      const a = 0.25 + 0.15 * Math.sin(performance.now() * 0.003);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(-hRad); ctx.scale(k, k); ctx.translate(-S.position.x, -S.position.z);
      ctx.beginPath(); ctx.arc(esm.x, esm.z, esm.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,200,255,' + (a * 0.25).toFixed(3) + ')'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,200,255,' + a.toFixed(3) + ')'; ctx.lineWidth = 1 / k;
      ctx.stroke(); ctx.restore();
    }

    // Forward FOV wedge: diagonals from the ownship arrow to the two top corners.
    ctx.strokeStyle = 'rgba(88, 255, 154, 0.62)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(x0, y0);
    ctx.moveTo(cx, cy); ctx.lineTo(x0 + s, y0);
    ctx.stroke();

    // Rotated N / E / S / W letters tucked just inside the outer ring.
    glow(ctx, G, 4); ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [deg, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
      const a = (deg - S.heading) * D2R, r = half * 0.76;
      ctx.save(); ctx.translate(cx + Math.sin(a) * r, cy - Math.cos(a) * r); ctx.rotate(a);
      ctx.fillText(lab, 0, 0); ctx.restore();
    }

    // Oriented triangle enemy blips.
    for (const e of A.getEnemies()) {
      if (!e.alive) continue;
      const rx = e.pos.x - S.position.x, rz = e.pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      const rr = Math.hypot(sx, sy), beyond = rr > MAX_M * 0.97, f2 = beyond ? (MAX_M * 0.97) / rr : 1;
      const bx = cx + sx * k * f2, by = cy + sy * k * f2;
      const kind = blipKind(e);
      if (beyond) {                                                                 // out of range: hollow rim marker
        glow(ctx, kind === 'lock' ? WARN : kind === 'bogey' ? AMBER : G, 3); ctx.lineWidth = 1.2;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.atan2(sx, -sy));
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 3); ctx.lineTo(-4, 3); ctx.closePath(); ctx.stroke();
        ctx.restore();
        continue;
      }
      const bCol = kind === 'lock' ? WARN : kind === 'acq' ? AMBER : kind === 'desig' ? G : AMBER;
      glow(ctx, bCol, 4);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(((e.heading || 0) - S.heading) * D2R);
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 4.5); ctx.lineTo(0, 2); ctx.lineTo(-4.5, 4.5); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (kind !== 'bogey') { ctx.lineWidth = 1.1; drawCornerBracket(ctx, bx, by, 8, 3); }
    }
    // Drone swarm: small amber diamonds on the radar, distinct from fighter triangles.
    const drList = A.getDrones ? A.getDrones() : null;
    if (drList) for (const d of drList) {
      if (!d.alive) continue;
      const rx = d.pos.x - S.position.x, rz = d.pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      const rr = Math.hypot(sx, sy), beyond = rr > MAX_M * 0.97, f2 = beyond ? (MAX_M * 0.97) / rr : 1;
      const bx = cx + sx * k * f2, by = cy + sy * k * f2;
      const isLock = trackInfo(d) && trackInfo(d).st === 'LOCK';
      ctx.save();
      glow(ctx, isLock ? WARN : AMBER, beyond ? 2 : 4); ctx.lineWidth = 1.2;
      diamond(ctx, bx, by, beyond ? 3.5 : 5);
      ctx.restore();
    }

    // Pulsing red missile lines for incoming missiles.
    for (const m of A.missiles) {
      if (!m.active || !m.enemy) continue;
      const rx = m.mesh.position.x - S.position.x, rz = m.mesh.position.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      if (Math.hypot(sx, sy) > MAX_M * 1.1) continue;
      const bx = cx + sx * k, by = cy + sy * k;
      const vx = m.vel.x * Math.cos(hRad) + m.vel.z * Math.sin(hRad);
      const vz = -m.vel.x * Math.sin(hRad) + m.vel.z * Math.cos(hRad);
      const vl = Math.hypot(vx, vz) || 1;
      const tx = bx - (vx / vl) * 14, ty = by - (vz / vl) * 14;
      const pulse = mslFlash();
      glow(ctx, WARN, pulse ? 6 : 2);
      ctx.globalAlpha = pulse ? 1 : 0.45;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke();
      diamond(ctx, bx, by, 4);
      ctx.globalAlpha = 1;
    }

    // Surface strike targets: hollow squares (designated one filled).
    for (const t of A.getSurface ? A.getSurface() : []) {
      if (!t.alive) continue;
      const rx = t.pos.x - S.position.x, rz = t.pos.z - S.position.z;
      const sx = rx * Math.cos(hRad) + rz * Math.sin(hRad), sy = -rx * Math.sin(hRad) + rz * Math.cos(hRad);
      if (Math.hypot(sx, sy) > MAX_M * 0.97) continue;
      const bx = cx + sx * k, by = cy + sy * k;
      glow(ctx, t === C.groundTgt ? GB : 'rgba(88,255,154,0.75)', 0); ctx.lineWidth = 1.1;
      if (t === C.groundTgt) ctx.fillRect(bx - 3.5, by - 3.5, 7, 7); else ctx.strokeRect(bx - 3.5, by - 3.5, 7, 7);
    }

    // ALR-56C RWR: emitters on the inner ring at their clock bearing (heading-up).
    // Amber spike = fighter radar painting / acquiring, crimson spike = full lock,
    // pulsing crimson M + vector line = missile tracking us.
    {
      const rr = half * 0.5;
      ctx.save();
      noGlow(ctx); ctx.strokeStyle = 'rgba(88, 255, 154, 0.22)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (const r of C.rwr || []) {
        const sx = Math.sin(r.b), sy = -Math.cos(r.b), px = cx + sx * rr, py = cy + sy * rr;
        if (r.kind === 'msl') {
          const on = mslFlash(), radar = r.g === 'RADAR';
          const col = radar ? '#ffbf3f' : '#ff4d3d';
          glow(ctx, col, on ? 8 : 2); ctx.globalAlpha = on ? 1 : 0.5; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx + sx * 9, cy + sy * 9); ctx.lineTo(px + sx * 6, py + sy * 6); ctx.stroke();
          ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(radar ? 'RDR' : 'IR', px + sx * 15, py + sy * 15);
          ctx.globalAlpha = 1;
        } else {
          const col = r.kind === 'lock' ? WARN : AMBER;
          glow(ctx, col, r.kind === 'paint' ? 2 : 5); ctx.lineWidth = r.kind === 'paint' ? 1.1 : 1.6;
          ctx.globalAlpha = r.kind === 'paint' ? 0.75 : 1;
          ctx.save(); ctx.translate(px, py); ctx.rotate(r.b);
          ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(0, 3); ctx.lineTo(5, -4);      // inward-pointing spike chevron
          if (r.kind !== 'paint') { ctx.moveTo(-5, -9); ctx.lineTo(0, -2); ctx.lineTo(5, -9); }
          ctx.stroke(); ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }

    // Mission-update sweep pulse: one expanding ring inside the radar frame.
    if (radarPulseT < 0.9) {
      const pr = (radarPulseT / 0.9) * half * 0.95;
      ctx.save(); ctx.globalAlpha = 1 - radarPulseT / 0.9;
      ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // Ownship triangle.
    glow(ctx, GB, 5);
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 5.5, cy + 6); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 5.5, cy + 6); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Subtle 1px emerald border with rounded corners + corner range/RWR labels.
    glow(ctx, border === G ? 'rgba(88, 255, 154, 0.55)' : border, alertOn() ? 7 : 0);
    if (border === G) ctx.strokeStyle = 'rgba(88, 255, 154, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke(frame);
    ctx.font = f(11, true); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    labelText(ctx, RADAR_ZOOM_TAG[radarZoom], x0 + 6, y0 + 5, G, 2);
    if (C.ecmState && C.ecmState !== 'READY') {
      const act = C.ecmState === 'ACTIVE';
      const txt = act ? `[ ECM ACTIVE ]  ${C.ecmT.toFixed(1)}` : `[ ECM RECHARGE ]  ${C.ecmT.toFixed(1)}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = f(12, true);
      labelText(ctx, txt, x0 + 2, y0 - 6, act ? CYAN : AMBER, act ? 6 : 3);
      if (act) {                                             // jammer bar drains over 6 s
        glow(ctx, CYAN, 3); ctx.fillRect(x0 + 2, y0 - 4, (s - 4) * Math.max(0, C.ecmT / 6), 2);
      }
    }
    if (esm && esm.in) {
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = f(12, true);
      labelText(ctx, '[ ESM ACTIVE ]', x0 + 2, y0 - 20, '#00c8ff', 6);
    }
    if (C.rwrTrack || C.banditLock >= 1) {
      const rCol = C.banditLock >= 1 ? WARN : AMBER;
      ctx.textAlign = 'right';
      if (C.banditLock < 1 || mslFlash()) labelText(ctx, C.banditLock >= 1 ? 'RWR LOCK' : 'RWR TRACK', x0 + s - 6, y0 + 5, rCol, 4);
    }
    ctx.restore();
  }

  const PLANFORM = [
    [0, -1], [0.05, -0.86], [0.09, -0.62], [0.11, -0.42], [0.20, -0.30], [0.21, -0.08],
    [0.93, 0.30], [0.93, 0.40], [0.30, 0.42], [0.27, 0.56], [0.60, 0.78], [0.60, 0.90],
    [0.20, 0.88], [0.17, 1.0], [0.04, 1.0]
  ];

  // AIM-9 icon: vertical body, nose cone, tail fins; the body fills bottom-up as
  // that pylon's round reloads (bright when loaded, amber while refilling).
  function drawMissileIcon(ctx, x, y, h, fill, loaded) {
    const w = h > 36 ? 6 : 5, top = y - h / 2, bot = y + h / 2;
    ctx.save();
    const col = loaded ? G : fill > 0 ? AMBER : GD;
    glow(ctx, col, loaded ? 5 : 2); ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, bot - 5); ctx.lineTo(x - w / 2, top + 6); ctx.lineTo(x, top); ctx.lineTo(x + w / 2, top + 6); ctx.lineTo(x + w / 2, bot - 5);
    ctx.moveTo(x - w / 2, bot - 5); ctx.lineTo(x - w / 2 - 4, bot); ctx.lineTo(x + w / 2 + 4, bot); ctx.lineTo(x + w / 2, bot - 5);
    ctx.moveTo(x - w / 2, top + 11); ctx.lineTo(x - w / 2 - 2.5, top + 15); ctx.moveTo(x + w / 2, top + 11); ctx.lineTo(x + w / 2 + 2.5, top + 15);
    ctx.stroke();
    if (fill > 0.01) {
      const bodyTop = top + 6, bodyH = bot - 5 - bodyTop, fh = bodyH * clamp(fill, 0, 1);
      ctx.globalAlpha = loaded ? 0.85 : 0.6;
      ctx.fillRect(x - w / 2 + 1.2, bot - 5 - fh, w - 2.4, fh);
    }
    ctx.restore();
  }

  function drawBottomRight(ctx) {
    // Right-aligned stores list, F-15C silhouette and pylon icons; no heavy box.
    const xr = HW - 26, xl = xr - 150, rowH = 20;
    const y0 = HH - 306;
    ctx.save();
    ctx.font = f(15, true); ctx.textBaseline = 'top';
    const reloadMsl = C.missileReload > 0, reloadBomb = C.bombReload > 0;
    const gunsOnly = !!(C.weaponsLock && C.weaponsLock.msl && C.weaponsLock.spw);
    const rows = [
      ['  GUN', C.gunOverheat ? 'HOT' : C.reload > 0 ? 'RLD ' + C.reload.toFixed(1) : String(C.ammo), C.gunOverheat ? WARN : G]
    ];
    if (!gunsOnly) {
      rows.push([(C.weapon === 'MSL' ? '> ' : '  ') + 'MSL', reloadMsl ? 'RLD ' + C.missileReload.toFixed(1) : String(C.missiles), C.weapon === 'MSL' ? GB : G]);
      const spw = SPW[C.spw] || SPW['4AAM'];
      const spwAmmo = spw.wpn === 'AAM4' ? { n: C.aam4, r: C.aam4Reload } : spw.wpn === 'BOMB' ? { n: C.bombs, r: C.bombReload } : { n: C.qaam, r: C.qaamReload };
      rows.push([(C.weapon !== 'MSL' ? '> ' : '  ') + spw.hud, spwAmmo.r > 0 ? 'RLD ' + spwAmmo.r.toFixed(1) : String(spwAmmo.n), C.weapon === spw.wpn ? GB : G]);
    }
    rows.push(null);                                        // dashed separator
    if (C.flares !== undefined) rows.push(['  FLR', String(C.flares), C.flares > 0 ? G : AMBER]);
    if (C.chaff !== undefined) rows.push(['  CHF', String(C.chaff), C.chaff > 0 ? G : AMBER]);
    if (C.jamming > 0) rows.push(['  JAM', 'ON', AMBER]);
    if (S.assist && (!A.ilsVisible || A.ilsVisible())) rows.push(['  ILS ASSIST', 'ON', '#5fe8ff']);
    rows.push(['  DMG', Math.round(100 - C.health) + '%', C.health < 45 ? WARN : C.health < 75 ? AMBER : G]);
    if (S.gear > 0 || S.gearDown) rows.push(['  GEAR', S.gear >= 1 ? (S.onGround ? 'WOW' : 'DOWN') : 'TRANSIT', S.gear >= 1 ? G : AMBER]);
    if (S.ctl && S.ctl.airbrake > 0.05) rows.push(['  S/BRK', `${Math.round(48 * S.ctl.airbrake)}°`, S.brakeLatch ? GB : G]);
    if (C.engineOut) rows.push([`  ${C.engineOut} ENG`, { ON_FIRE: 'FIRE', EXTINGUISHED: 'COLD', RELIGHTING: 'CRANK', SEIZED: 'SEIZED' }[C.engState] || 'OUT',
      C.engState === 'ON_FIRE' || C.engState === 'SEIZED' ? WARN : AMBER]);
    if (C.hydraulic) rows.push(['  HYD', 'LEAK', AMBER]);
    let y = y0;
    for (const r of rows) {
      if (!r) {
        glow(ctx, GD, 0); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(xl + 4, y + 6); ctx.lineTo(xr, y + 6); ctx.stroke();
        ctx.setLineDash([]); y += 12; continue;
      }
      let [k, v, col] = r;
      if (k === '  GUN') heatArc(ctx, xl + 2, y + 8, 7, C.gunHeat || 0, 1);    // barrel heat beside the GUN readout
      // Push-forward refill: GUN / FLR counters flash white -> cyan for 0.4 s.
      const rf = C.refillFlash && (k === '  GUN' ? C.refillFlash.gun : k === '  FLR' ? C.refillFlash.flr : 0);
      const ra = rf ? (performance.now() - rf) / 400 : 2;
      let blur = 5;
      if (ra >= 0 && ra < 1) {
        col = ra < 0.45 ? '#ffffff' : REFILL; blur = 14 - 8 * ra;
        noGlow(ctx); ctx.globalAlpha = 0.35 * (1 - ra); ctx.fillStyle = REFILL;
        ctx.fillRect(xl - 8, y - 2, xr - xl + 12, rowH - 1); ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left'; labelText(ctx, k, xl, y, col, Math.min(blur, 4 + (blur > 5 ? 6 : 0)));
      ctx.textAlign = 'right'; labelText(ctx, v, xr, y, col, blur);
      y += rowH;
    }

    // Top-down F-15C Eagle silhouette (hull colour = damage).
    const sx = xr - 72, sy = y + 50, sc = 40;
    const hull = C.health, hCol = hull > 60 ? G : hull > 30 ? AMBER : WARN;
    glow(ctx, hCol, 6); ctx.lineWidth = LW;
    ctx.beginPath();
    PLANFORM.forEach(([px, py], i) => i ? ctx.lineTo(sx + px * sc * 0.62, sy + py * sc) : ctx.moveTo(sx + px * sc * 0.62, sy + py * sc));
    for (let i = PLANFORM.length - 1; i >= 0; i--) ctx.lineTo(sx - PLANFORM[i][0] * sc * 0.62, sy + PLANFORM[i][1] * sc);
    ctx.closePath();
    ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();

    // Pylon icons: big AIM-9s left / right (inboard rails 1, 2), smaller under-wing
    // stores below (outboard rails 3, 4). Each fills as its own pylon reloads.
    const pyl = C.mslPylons && C.mslPylons.length ? C.mslPylons : Array.from({ length: C.mslMax || 4 }, (_, i) => i < C.missiles);
    const frac = reloadMsl ? clamp(1 - C.missileReload / (C.missileReloadMax || 6), 0, 1) : 0;
    const icon = (i, x, yy, h) => { if (i < pyl.length) drawMissileIcon(ctx, x, yy, h, pyl[i] ? 1 : frac, !!pyl[i]); };
    icon(0, sx - 56, sy - 6, 44);
    icon(1, sx + 56, sy - 6, 44);
    icon(2, sx - 56, sy + 38, 28);
    icon(3, sx + 56, sy + 38, 28);

    // UGB reload strip along the fuselage while bombs reload.
    if (C.bombMax && reloadBomb) {
      const bf = clamp(1 - C.bombReload / (C.bombReloadMax || 10), 0, 1);
      noGlow(ctx); ctx.strokeStyle = GD; ctx.strokeRect(sx - 22, sy + 50, 44, 5);
      glow(ctx, AMBER, 3); ctx.fillRect(sx - 21, sy + 51, 42 * bf, 3);
    }

    // G / AOA micro-readout.
    ctx.font = f(12, true); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    labelText(ctx, `${S.gLoad.toFixed(1)}G   AOA ${(S.alpha * R2D).toFixed(1)}°`, xr, sy + 60,
      S.gLoad > 7.5 || S.alpha > A.STALL_AOA * 0.85 ? WARN : G, 3);
    ctx.restore();
  }

  function drawDLZ(ctx) {
    const D = C.dlz;
    if (!D || !D.on || C.dead) return;
    const x = HW - 92, top = HH * 0.30, h = 120;
    const scale = h / Math.max(1, D.rmax * 1.1);
    const yy = r => top + h - THREE.MathUtils.clamp(r, 0, D.rmax * 1.1) * scale;
    ctx.save();
    ctx.font = f(11, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#00ff66'; ctx.fillStyle = '#00ff66'; ctx.lineWidth = 1;
    noGlow(ctx);
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + h); ctx.stroke();
    // No-escape bracket.
    const y1 = yy(D.rne), y0 = yy(D.rmin);
    ctx.fillStyle = D.inNez ? 'rgba(0,255,102,0.45)' : 'rgba(0,255,102,0.18)';
    ctx.fillRect(x - 7, y1, 6, Math.max(1, y0 - y1));
    // Rmax / Rmin ticks.
    for (const [r, lab] of [[D.rmax, 'MAX'], [D.rmin, 'MIN']]) {
      const y = yy(r);
      ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 6, y); ctx.stroke();
      ctx.fillText(lab + ' ' + Math.round(r / 100) * 100, x + 9, y);
    }
    // Range caret + closing velocity.
    const yr = yy(D.r);
    ctx.fillStyle = '#00ff66'; ctx.fillText('◄', x - 17, yr);
    const vcKt = Math.round(D.vc * 1.94384 / 10) * 10;
    ctx.fillText('VC ' + vcKt, x + 9, yr - 12);
    // TTI readout under the bar.
    if (C.tti !== undefined && Number.isFinite(C.tti)) {
      const pit = C.pitbull, flash = !pit || Math.floor(performance.now() / 125) % 2 === 0;
      ctx.font = f(12, true);
      if (flash) ctx.fillText((pit ? 'PITBULL' : 'TTI ' + C.tti.toFixed(1) + 's') + ((C.multiLive || 0) > 1 ? ' ×' + C.multiLive : ''), x - 12, top + h + 18);
    }
    ctx.restore();
  }
  function drawJHMCS(ctx) {
    if (!A.getLook || !A.isFirstPerson || !A.isFirstPerson()) return;
    A.getLook(LOOKV);
    if (!LOOKV.active) return;
    const cx = HW / 2, cy = HH / 2, R = 45;
    ctx.save();
    ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#00ff66'; ctx.fillStyle = '#00ff66'; ctx.lineWidth = 1; noGlow(ctx);
    // Helmet reticle: 90 px ring + centre pip.
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
    // Flanks: KCAS left, altitude right.
    ctx.textAlign = 'left'; ctx.fillText('KCAS ' + Math.round(S.speed * 1.94384), cx - R - 92, cy);
    ctx.textAlign = 'right'; ctx.fillText('ALT ' + Math.round(S.position.y * 3.28084), cx + R + 92, cy);
    // Heading caret from look direction.
    const hd = ((Math.atan2(LOOKV.x, -LOOKV.z) / (Math.PI / 180)) + 360) % 360;
    ctx.textAlign = 'center';
    ctx.fillText('▴ ' + Math.round(hd).toString().padStart(3, '0') + '°', cx, cy - R - 18);
    // Nose reference.
    _drScr.set(0, 0, -1).applyQuaternion(S.quaternion).multiplyScalar(1000).add(S.position);
    const np = droneScreen(_drScr);
    if (np.ok) {
      ctx.beginPath(); ctx.moveTo(np.x - 5, np.y - 5); ctx.lineTo(np.x + 5, np.y + 5);
      ctx.moveTo(np.x + 5, np.y - 5); ctx.lineTo(np.x - 5, np.y + 5); ctx.stroke();
    }
    const ob = LOOKV.offBore * 180 / Math.PI;
    ctx.fillText('OB ' + Math.round(ob) + '°', cx, cy + R + 18);
    // Targets inside the helmet circle.
    const list = A.getTargets ? A.getTargets() : A.getEnemies();
    for (const e of list) {
      if (!e || !e.alive || !e.pos) continue;
      const p = droneScreen(e.pos);
      if (!p.ok || Math.hypot(p.x - cx, p.y - cy) > R) continue;
      const locked = C.designated === e && C.lockState === 'LOCK';
      const tracking = C.designated === e;
      const sz = tracking && !locked ? 8 - 5 * (C.lockProgress || 0) : 6;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2, px = p.x + Math.sin(a) * sz, py = p.y - Math.cos(a) * sz;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      if (locked) ctx.fill(); else ctx.stroke();
      if (locked) ctx.fillText('QAAM', p.x, p.y - sz - 9);
    }
    if (ob > 65 && Math.floor(performance.now() / 200) % 2 === 0) ctx.fillText('OB LIMIT', cx, cy + R + 36);
    ctx.restore();
  }
  function addStamp(pos, kind) {
    const i = stampNext; stampNext = (stampNext + 1) % STAMP_N;
    STAMP_POS[i * 3] = pos.x; STAMP_POS[i * 3 + 1] = pos.y; STAMP_POS[i * 3 + 2] = pos.z;
    STAMP_T[i] = 0; STAMP_K[i] = kind ? 1 : 0;
  }
  function drawStamps(ctx, dt) {
    for (let i = 0; i < STAMP_N; i++) {
      if (STAMP_T[i] === 99) continue;
      STAMP_T[i] += dt;
      const t = STAMP_T[i];
      if (t >= STAMP_LIFE) { STAMP_T[i] = 99; continue; }
      _drScr.set(STAMP_POS[i * 3], STAMP_POS[i * 3 + 1], STAMP_POS[i * 3 + 2]);
      const p = droneScreen(_drScr);
      if (!p.ok) continue;
      const rise = 40 * t / STAMP_LIFE, a = 1 - (t / STAMP_LIFE) * (t / STAMP_LIFE);
      const dead = STAMP_K[i] === 1;
      ctx.save(); ctx.globalAlpha = a; glow(ctx, dead ? '#ff3344' : '#ffb000', 4);
      ctx.font = dead ? f(18, true) : f(16, true);
      ctx.fillStyle = dead ? '#ff3344' : '#ffb000';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(dead ? 'DESTROYED' : 'HIT', p.x, p.y - 14 - rise);
      ctx.restore();
    }
  }
  /* ------------------------------------------- center AC7 warning banners */
  function drawBanner(ctx, cx, y, text, col, w = 220, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    numBack(ctx, cx - w / 2, y - 15, w, 30, col === WARN ? 'rgba(55, 4, 10, 0.58)' : 'rgba(0, 20, 10, 0.56)');
    glow(ctx, col, 6); ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y - 15); ctx.lineTo(cx + w / 2, y - 15);
    ctx.moveTo(cx - w / 2, y + 15); ctx.lineTo(cx + w / 2, y + 15);
    // Corner endcaps.
    ctx.moveTo(cx - w / 2, y - 15); ctx.lineTo(cx - w / 2, y - 8);
    ctx.moveTo(cx + w / 2, y - 15); ctx.lineTo(cx + w / 2, y - 8);
    ctx.moveTo(cx - w / 2, y + 15); ctx.lineTo(cx - w / 2, y + 8);
    ctx.moveTo(cx + w / 2, y + 15); ctx.lineTo(cx + w / 2, y + 8);
    ctx.stroke();
    ctx.font = f(18, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    labelText(ctx, text, cx, y + 1, col, 6);
    ctx.restore();
  }

  // Engine emergency prompt (center-lower): fire -> PRESS F, cold -> HOLD F with a
  // live 0-100 % windmill-spool bar, then ENGINE RELIT! / RELIGHT FAILED for 3.5 s.
  function drawEngineEmergency(ctx, now) {
    if (C.dead) return;
    const fp = A.isFirstPerson(), y = HH * (fp ? 0.80 : 0.70), cx = HW / 2, side = C.engSide || '';
    const st = C.engState;
    if (st === 'ON_FIRE') {
      const flash = Math.floor(now / 260) % 2;
      const left = Math.max(0, 16 - (C.fireT || 0));
      drawBanner(ctx, cx, y, `[ ${side} ENGINE FIRE — PRESS F TO EXTINGUISH ]`, flash ? WARN : AMBER, 420, 1);
      ctx.save(); ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      labelText(ctx, `FIRE SPREADING — ${left.toFixed(0)} S TO AIRFRAME LOSS`, cx, y + 16, WARN, 4);
      ctx.restore();
    } else if ((st === 'EXTINGUISHED' && !C.relightUsed) || st === 'RELIGHTING') {
      drawBanner(ctx, cx, y, '[ ENGINE COLD — HOLD F FOR WINDMILL RELIGHT (SLIM ODDS) ]', AMBER, 470, 1);
      const p = st === 'RELIGHTING' ? clamp((C.relightT || 0) / (A.relightHold || 2.5), 0, 1) : 0;
      const w = 260, h = 9, x0 = cx - w / 2, yb = y + 18;
      ctx.save();
      noGlow(ctx); ctx.fillStyle = 'rgba(0, 12, 6, 0.6)'; ctx.fillRect(x0, yb, w, h);
      glow(ctx, AMBER, 4); ctx.fillStyle = p > 0 ? AMBER : 'rgba(255,191,63,0.25)'; ctx.fillRect(x0 + 1, yb + 1, (w - 2) * p, h - 2);
      ctx.strokeStyle = AMBER; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, yb + 0.5, w - 1, h - 1);
      ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const odds = A.relightOdds ? Math.round(A.relightOdds() * 100) : null;
      labelText(ctx, st === 'RELIGHTING' ? `SPOOL ${Math.round(p * 100)}%  —  N2 WINDMILL 28%` : `RAM-AIR ODDS ${odds}% — DIVE > 350 KT FOR BEST CHANCE`, cx, yb + h + 4, AMBER, 3);
      ctx.restore();
    }
    if (C.relightResult && now - (C.relightResultT || 0) < 3500) {
      const ok = C.relightResult === 'OK';
      drawBanner(ctx, cx, y + (st === 'ON_FIRE' ? 46 : 0), ok ? '[ ENGINE RELIT! ]' : '[ RELIGHT FAILED — SINGLE ENGINE OPS ]', ok ? G : WARN, ok ? 220 : 380, ok ? 1 : pulseAlpha(220));
    }
  }
  // EW corruption: thin green scanlines over the whole HUD, brighter over the radar
  // frame. Cheap 2D fillRect only; no shadowBlur, no per-frame THREE allocation.
  const _st = new THREE.Vector3();
  function drawJam(ctx) {
    const k = C.jamming || 0;
    if (k <= 0) return;
    noGlow(ctx);
    const n = Math.round(70 * k);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(0, 255, 102, ${(0.10 + Math.random() * 0.12).toFixed(3)})`;
      ctx.fillRect(Math.random() * HW, Math.random() * HH, 24 + Math.random() * 170, 1);
    }
    const rs = Math.round(Math.min(216, HH * 0.30, HW * 0.22)), rx = 20, ry = HH - rs - 20;
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(120, 255, 170, ${(0.26 + Math.random() * 0.22).toFixed(3)})`;
      ctx.fillRect(rx + Math.random() * rs, ry + Math.random() * rs, 18 + Math.random() * 90, 1);
    }
  }
  // Amber ground diamonds for the four jammer bunkers (chase + first person).
  function drawStrikeTargets(ctx) {
    if (A.getMode && A.getMode() === 'EJECT') return;
    const list = A.getStrikeTargets ? A.getStrikeTargets() : null;
    if (!list || !list.length) return;
    let best = null, bd = Infinity;
    ctx.save();
    for (const t of list) {
      if (!t.alive) continue;
      _st.copy(t.pos); _st.y += 6;
      const p = toScreen(_st), d = Math.hypot(t.pos.x - S.position.x, t.pos.z - S.position.z);
      if (d < bd) { bd = d; best = { x: p.x, y: p.y, ok: p.ok && p.x > 16 && p.x < HW - 16 && p.y > 16 && p.y < HH - 16 }; }
      if (!p.ok || p.x < 16 || p.x > HW - 16 || p.y < 16 || p.y > HH - 16) continue;
      glow(ctx, '#ffbf3f', 4); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x + 8, p.y); ctx.lineTo(p.x, p.y + 8); ctx.lineTo(p.x - 8, p.y); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y); ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 3); ctx.stroke();
      let label = '[ TGT // ' + t.label + ' ]';
      if (d > 1852) label += '  ' + (d / 1852).toFixed(1) + ' NM';
      if (t.hp < t.hpMax) label += '  ' + Math.round(100 * t.hp / t.hpMax) + '%';
      ctx.font = f(11, true); ctx.textAlign = 'center';
      labelText(ctx, label, p.x, p.y - 13, '#ffbf3f', 4);
    }
    if (best && !best.ok) {                                    // amber edge chevron toward the nearest live jammer
      const cx = HW / 2, cy = HH / 2, dx = best.x - cx, dy = best.y - cy;
      const m = Math.max(Math.abs(dx) / (HW / 2 - 34), Math.abs(dy) / (HH / 2 - 34), 1e-3);
      ctx.save(); ctx.translate(cx + dx / m, cy + dy / m); ctx.rotate(Math.atan2(dy, dx));
      glow(ctx, '#ffbf3f', 6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // Linked weak points: small cyan ◇ AA / ◇ SITE boxes beside the ship or rim battery.
  function drawWeakTargets(ctx) {
    const list = A.getWeakTargets ? A.getWeakTargets() : null;
    if (!list || !list.length) return;
    ctx.save();
    for (const t of list) {
      _st.copy(t.pos); _st.y += (t.isSub ? 24 : 10);
      const p = toScreen(_st);
      if (!p.ok || p.x < 12 || p.x > HW - 12 || p.y < 12 || p.y > HH - 12) continue;
      glow(ctx, '#5fe8ff', 4); ctx.strokeStyle = '#5fe8ff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + 6, p.y); ctx.lineTo(p.x, p.y + 6); ctx.lineTo(p.x - 6, p.y); ctx.closePath(); ctx.stroke();
      ctx.font = f(10, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      labelText(ctx, t.isSub ? '◇ AA' : '◇ SITE', p.x, p.y + 8, '#5fe8ff', 3);
    }
    ctx.restore();
  }
  const musicToast = { t: 0, text: '' };
  function drawCenterBanners(ctx, g) {
    const now = performance.now();
    if (C.ceil && C.ceil.phase === 'WARN' && C.ceil.warnT !== undefined) {
      drawBanner(ctx, HW / 2, HH * 0.30, 'RADAR LOCK — DESCEND! ' + C.ceil.warnT.toFixed(1), '#ff3b4d', 420, 1);
    }
    if (C.ceilLaunchBanner && now - C.ceilLaunchBanner < 2600) {
      drawBanner(ctx, HW / 2, HH * 0.35, 'SAM LAUNCH — CEILING BREAK!', '#ff3b4d', 420, 1 - (now - C.ceilLaunchBanner) / 2600);
    }
    if (C.climbBanner && now - C.climbBanner < 3000) {
      drawBanner(ctx, HW / 2, HH * 0.34, 'PULL UP — CLEAR THE WALL', '#ffbf3f', 420, 1 - (now - C.climbBanner) / 3000);
    }
    if (C.gateBanner && now - C.gateBanner < 900) {
      drawBanner(ctx, HW / 2, HH * 0.38, 'GATE ' + (C.gateIdx || 0) + ' CLEARED', '#00ff66', 280, 1 - (now - C.gateBanner) / 900);
    }
    const cx = g ? g.cx : HW / 2;
    const upperY = Math.max(g ? Math.max(30, g.minY - 24) : HH * 0.21, radioBottom ? radioBottom + 20 : 0);
    const lowerY = g ? g.cy + g.boxH * 0.27 : HH * 0.75;
    if (musicToast.t && now - musicToast.t < 1200) {
      drawBanner(ctx, cx, upperY + 108, musicToast.text, '#00ff66', 340, 1 - (now - musicToast.t) / 1200);
    }

    if (C.mach1T && now - C.mach1T < 1400) {
      const age = now - C.mach1T;
      drawBanner(ctx, cx, upperY, '[ MACH 1.0 // SUPERSONIC ]', '#00ff66', 300, 1 - age / 1400);
    }
    if (C.nearMissT && now - C.nearMissT < 1400) {
      const age = now - C.nearMissT;
      drawBanner(ctx, cx, upperY, '[ NEAR MISS // EVADED ]', '#00ff66', 300, 1 - age / 1400);
    }
    if (C.notchT && now - C.notchT < 1600) {
      const age = now - C.notchT;
      drawBanner(ctx, cx, upperY + (alertOn() ? 36 : 0), '[ NOTCHED // RADAR LOCK BROKEN ]', '#00ff66', 360, 1 - age / 1600);
    }
    if (C.wingOrderT && now - C.wingOrderT < 1600) {
      const age = now - C.wingOrderT;
      const label = '[ WINGMEN // ' + (WING_ORDER_NAMES[C.wingOrder] || 'FORM') + ' ]';
      drawBanner(ctx, cx, upperY + 72, label, '#5fe8ff', 340, 1 - age / 1600);
    }
    if (C.flagSalvoActive) {
      const secs = Math.max(1, Math.ceil(C.flagSalvoT || 0));
      const a = 0.55 + 0.45 * (Math.floor(now / 125) % 2);
      drawBanner(ctx, cx, upperY + 180, '[ FLAGSHIP SALVO — BREAK! ] ' + secs, '#ff3b4d', 430, a);
    }
    if (C.waveoffBannerT && now - C.waveoffBannerT < 3000) {
      const age = now - C.waveoffBannerT;
      drawBanner(ctx, cx, upperY + 216, 'WAVE OFF — BANDITS ON THE BOW', WARN, 440, 1 - age / 3000);
    }
    if (C.ambushClearT && now - C.ambushClearT < 2500) {
      const age = now - C.ambushClearT;
      drawBanner(ctx, cx, upperY + 252, 'AMBUSH CLEARED +800', G, 360, 1 - age / 2500);
    }
    if (C.buzzBannerT && now - C.buzzBannerT < 1800) {
      const age = now - C.buzzBannerT;
      drawBanner(ctx, cx, upperY + 288, C.buzzLabel || 'SONIC PASS', '#5fe8ff', 330, 1 - age / 1800);
    }
    if ((S.cloudIce || 0) > 0.65 || (C.iceBannerT && now - C.iceBannerT < 1600)) {
      drawBanner(ctx, cx, upperY + 144, '[ ICING ]', '#ffb000', 260, 0.55 + 0.45 * (Math.floor(now / 250) % 2));
    }
    if (C.scrambleT && now - C.scrambleT < 3000) {
      const age = now - C.scrambleT;
      drawBanner(ctx, cx, upperY + 252, 'SCRAMBLE! BANDITS OVERHEAD', WARN, 440, pulseAlpha(160) * (1 - age / 3000));
    }
    if (C.bwBannerT && now - C.bwBannerT < 3200) {
      const age = now - C.bwBannerT;
      drawBanner(ctx, cx, upperY + 36, 'BROKEN WING +2000', '#ffd45a', 360, 1 - age / 3200);
    }
    if (C.intr && C.intr.st === 'CUT') {
      const glitch = (Math.floor(now / 85) % 3) ? 'SIGNAL INTRUSION' : '▒▒▒ SIGNAL LOST ▒▒▒';
      drawBanner(ctx, cx, upperY, glitch, WARN, 460, 0.55 + 0.45 * (Math.floor(now / 70) % 2));
    }
    if (C.mupdateT && now - C.mupdateT < 2200) {
      const age = now - C.mupdateT, flash = age > 600 ? 1 : (Math.floor(now / 125) % 2 ? 1 : 0.35);
      drawBanner(ctx, cx, upperY + 180, '[ MISSION UPDATE ]', '#00ff66', 400, flash);
    }
    if (C.interceptBannerT && now - C.interceptBannerT < 2500) {
      const age = now - C.interceptBannerT;
      drawBanner(ctx, cx, upperY + 144, 'MISSILE INTERCEPT +800', '#5fe8ff', 340, 1 - age / 2500);
    }
    if (C.wingSavedBannerT && now - C.wingSavedBannerT < 3000) {
      const age = now - C.wingSavedBannerT;
      drawBanner(ctx, cx, upperY + 108, 'WINGMAN SAVED +1500', '#5fe8ff', 360, 1 - age / 3000);
    }
    if (C.aceFlightT && now - C.aceFlightT < 3000) {
      const age = now - C.aceFlightT;
      drawBanner(ctx, cx, upperY + 36, '[ WARNING // ACE SQUADRON INBOUND ]', WARN, 380, pulseAlpha(200) * (1 - age / 3000));
    }
    if (C.droneInboundT && now - C.droneInboundT < 3200) {
      const age = now - C.droneInboundT;
      drawBanner(ctx, cx, upperY + 72, 'DRONE SWARM INBOUND', AMBER, 360, pulseAlpha(180) * (1 - age / 3200));
    }
    if (C.droneClearedT && now - C.droneClearedT < 2600) {
      const age = now - C.droneClearedT;
      drawBanner(ctx, cx, upperY + 36, 'SWARM CLEARED +1000', G, 340, 1 - age / 2600);
    }
    if (C.returnT && now - C.returnT < 2200) {
      drawBanner(ctx, cx, upperY, '[ RETURN LINE // REARMED & PATCHED ]', '#5fe8ff', 380, 1 - (now - C.returnT) / 2200);
    }
    if (C.manT && now - C.manT < 1800) {
      const age = now - C.manT;
      drawBanner(ctx, cx, upperY + 108, C.manLabel, '#00ff66', 340, 1 - age / 1800);
    }
    if (C.trapT && now - C.trapT < 2600)
      drawBanner(ctx, cx, upperY, '[ WIRE #' + C.trapWire + ' // CARRIER TRAP ]', G, 340, 1);
    if (C.carrierPhase === 'CAT')
      drawBanner(ctx, cx, lowerY, '[ CATAPULT ARMED // FULL THROTTLE TO LAUNCH ]', AMBER, 420, pulseAlpha(400));
    if (C.mcamAbortT && now - C.mcamAbortT < 1400)
      drawBanner(ctx, cx, upperY + 36, '[ CAM ABORT // INCOMING MISSILE ]', WARN, 360, pulseAlpha(160));
    if (C.jamming > 0)
      drawBanner(ctx, cx, lowerY - 40, 'JAMMING // DESCEND BELOW 500 FT', AMBER, 340, 0.55 + 0.45 * pulseAlpha(300));
    if (C.endConfirmT && now - C.endConfirmT < 2000)
      drawBanner(ctx, cx, lowerY - 80, '[ TAB AGAIN // END SORTIE & DEBRIEF ]', AMBER, 380, pulseAlpha(250));
    if (A.isFirstPerson() && C.mfdT && now - C.mfdT < 1200) {
      const age = now - C.mfdT;
      drawBanner(ctx, cx, lowerY + 34, '[ MFD // ' + C.mfdLabel + ' ]', G, 300, 1 - age / 1200);
    }

    if (alertOn()) {
      drawBanner(ctx, cx, upperY, 'MISSILE ALERT', WARN, 210, pulseAlpha(160));
      // Sun-arc meter: fills while the nose is lined up with the sun and an IR seeker is inbound.
      if (C.sunT > 0 && A.missiles) {
        let ir = false;
        for (let i = 0; i < A.missiles.length; i++) {
          const m = A.missiles[i];
          if (m.active && m.enemy && !m.lostTrack && (!m.guidance || m.guidance === 'IR')) { ir = true; break; }
        }
        if (ir) {
          const lit = Math.min(3, Math.floor(C.sunT / 0.5 * 3 + 0.001));
          drawBanner(ctx, cx, upperY + 36, SUN_METERS[lit], AMBER, 180, pulseAlpha(220));
        }
      }
    } else {
      const latest = (C.events || []).slice().reverse().find(ev => now - ev.born < 1500 && ev.kind !== 'NOTCHED');
      if (latest) {
        const label = latest.kind === 'DESTROYED' ? `DESTROYED  +${latest.points}` : latest.text;
        drawBanner(ctx, cx, upperY, label, latest.color || G, 230, 1);
      }
    }

    if (!C.dead && S.gear > 0.05 && !S.onGround && S.speed * 1.94384 > 280)
      drawBanner(ctx, cx, lowerY + 68, '[ GEAR OVERSPEED ]', AMBER, 230, pulseAlpha(220));
    if (C.gunOverheat && !C.dead) drawBanner(ctx, cx, lowerY + (pullUpOn() || stallOn() ? 34 : 0), '[ GUN OVERHEAT ]', WARN, 220, pulseAlpha(200));
    drawEngineEmergency(ctx, now);
    if (pullUpOn()) {
      const a = pulseAlpha(125);
      drawBanner(ctx, cx, lowerY, 'PULL UP', WARN, 176, a);
      ctx.save(); ctx.globalAlpha = a; glow(ctx, WARN, 6); ctx.lineWidth = 1.6;
      for (const dy of [0, 8]) {
        ctx.beginPath(); ctx.moveTo(cx - 14, lowerY - 22 - dy); ctx.lineTo(cx, lowerY - 31 - dy); ctx.lineTo(cx + 14, lowerY - 22 - dy); ctx.stroke();
      }
      ctx.restore();
    } else if (stallOn()) {
      drawBanner(ctx, cx, lowerY, 'STALL WARNING', S.alpha > A.STALL_AOA ? WARN : AMBER, 200, pulseAlpha(180));
    }

    if (C.dead) {
      drawBanner(ctx, HW / 2, HH * 0.39, 'AIRCRAFT DESTROYED', WARN, 270, 1);
      ctx.save(); ctx.font = f(14, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      labelText(ctx, 'RESPAWNING...', HW / 2, HH * 0.39 + 24, WARN, 4);
      ctx.restore();
    }
  }

  function drawComms(ctx, y) {
    const list = (C.comms || []).filter(c => c.until > performance.now());
    if (!list.length) return;
    ctx.save(); ctx.font = f(15, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    list.slice(-2).forEach((c, i, arr) => {
      const yy = y - (arr.length - 1 - i) * 26;
      const w = ctx.measureText(c.text).width + 32;
      numBack(ctx, HW / 2 - w / 2, yy - 12, w, 24, 'rgba(0, 14, 8, 0.56)');
      const col = c.color === '#ff4d3d' ? WARN : c.color === '#ffbf3f' ? AMBER : G;
      labelText(ctx, c.text, HW / 2, yy + 1, col, 4);
    });
    ctx.restore();
  }

  function drawStickCue(ctx) {
    const x = (A.mouse.nx * 0.5 + 0.5) * HW, y = (-A.mouse.ny * 0.5 + 0.5) * HH;
    ctx.save(); glow(ctx, GD, 0); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.moveTo(x - 12, y); ctx.lineTo(x - 4.5, y); ctx.moveTo(x + 4.5, y); ctx.lineTo(x + 12, y);
    ctx.stroke(); ctx.restore();
  }

  /* ----------------------------------- combiner glass + 1st/3rd person draw */
  function combinerPath() {
    const pts = A.getCombinerOutline && A.getCombinerOutline();
    if (!pts || !pts.length) return null;
    const path = new Path2D();
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let i = 0; i < pts.length; i++) {
      const s = toScreen(pts[i]);
      if (!s.ok) return null;
      if (i) path.lineTo(s.x, s.y); else path.moveTo(s.x, s.y);
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    path.closePath();
    return { path, minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, boxW: maxX - minX, boxH: maxY - minY };
  }

  // AC8 centre reticle: circle + wing ticks + tail fin, at the boresight, nudged
  // (max 22 px) toward the flight-path vector for a subtle velocity parallax.
  function drawReticle(ctx, g, dt, col) {
    const v = S.velocity.clone().normalize();
    fpvDir.lerp(v, 1 - Math.exp(-dt / 0.08)).normalize();
    const p = toScreen(cam.position.clone().addScaledVector(fpvDir, 4500));
    let dx = 0, dy = 0;
    if (p.ok) { dx = clamp((p.x - g.cx) * 0.35, -22, 22); dy = clamp((p.y - g.cy) * 0.35, -22, 22); }
    const x = g.cx + dx, y = g.cy + dy;
    ctx.save();
    glow(ctx, col === WARN ? WARN : GB, 6); ctx.lineWidth = LW + 0.2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 24, y); ctx.lineTo(x - 7, y);
    ctx.moveTo(x + 7, y); ctx.lineTo(x + 24, y);
    ctx.moveTo(x, y - 7); ctx.lineTo(x, y - 15);
    ctx.stroke();
    ctx.restore();
    heatArc(ctx, x, y, 33, C.gunHeat || 0, 0.9);
  }
  // Chase view: the true flight-path vector (where the jet is actually going),
  // shown once AoA / sideslip push it clear of the nose reticle.
  const fpvTrue = new THREE.Vector3(0, 0, -1);
  function drawTrueFPV(ctx, col) {
    fpvTrue.lerp(S.velocity.clone().normalize(), 0.35).normalize();
    const p = toScreen(cam.position.clone().addScaledVector(fpvTrue, 4500));
    const b = toScreen(cam.position.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion), 4500));
    if (!p.ok || !b.ok || Math.hypot(p.x - b.x, p.y - b.y) < 7) return;
    ctx.save();
    glow(ctx, col, 3); ctx.lineWidth = 1.1; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 13, p.y); ctx.lineTo(p.x - 5, p.y); ctx.moveTo(p.x + 5, p.y); ctx.lineTo(p.x + 13, p.y);
    ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x, p.y - 10); ctx.stroke();
    ctx.restore();
  }
  // Pointed readout: SPEED  [  420 >   (points right)   /   ALT  < 3200  ]  (points left).
  function drawChevronBox(ctx, cx, cy, value, label, point, col, sub, subCol) {
    const w = 78, h = 26, tip = 10;
    const y0 = cy - h / 2, y1 = cy + h / 2;
    ctx.save();
    drawOpenChevron(ctx, cx, cy, w, h, point, col, 5);
    ctx.font = f(19, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    labelText(ctx, String(value), cx + (point === 'right' ? -tip / 2 : tip / 2), cy + 1, col === WARN ? WARN : GB, 6);
    ctx.font = f(11, true); ctx.textBaseline = 'bottom';
    labelText(ctx, label, cx, y0 - 4, col, 4);
    if (sub) {
      ctx.font = f(12, true); ctx.textBaseline = 'top';
      labelText(ctx, sub, cx, y1 + 5, subCol || col, 5);
    }
    ctx.restore();
  }

  let spdPrev = null, spdAcc = 0;
  function drawCentralHUD(ctx, g, dt, compact) {
    if (spdPrev !== null && dt > 0) spdAcc += (((S.speed - spdPrev) / dt) - spdAcc) * Math.min(1, dt * 2.5);
    spdPrev = S.speed;

    const hudCol = (alertOn() || pullUpOn() || stallOn()) ? WARN : G;
    const spdCol = stallOn() ? WARN : hudCol;
    const altCol = pullUpOn() ? WARN : hudCol;
    const kts = S.speed * 1.94384;
    const altFt = S.position.y * 3.28084;
    const raltFt = Math.max(0, Math.round(S.radalt * 3.28084));
    const raltText = raltFt < 1000 ? `RALT ${raltFt}` : `RALT ${raltFt}`;
    const raltCol = raltFt < 1000 && !C.dead ? (pullUpOn() ? WARN : AMBER) : GD;

    if (!compact) {
      // 3rd person (AC8): no ladders / tapes — reticle + pointed SPEED / ALT boxes only.
      drawReticle(ctx, g, dt, hudCol);
      drawTrueFPV(ctx, hudCol);
      drawGunFunnel(ctx, hudCol);
      drawChevronBox(ctx, g.cx - BOX_OFF, g.cy, Math.round(kts), 'SPEED', 'right', spdCol,
        S.afterburner > 0.3 ? '[A/B]' : '', AMBER);
      drawChevronBox(ctx, g.cx + BOX_OFF, g.cy, Math.round(altFt), 'ALT', 'left', altCol,
        raltFt < 1000 && !C.dead ? 'RALT ' + raltFt : '', raltCol);
      return;
    }

    ctx.save();
    if (g.path) ctx.clip(g.path);

    drawConformalLadder(ctx, g, hudCol, compact);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    const bore = toScreen(cam.position.clone().addScaledVector(fwd, 5000));
    if (bore.ok) { drawWaterline(ctx, bore, hudCol); heatArc(ctx, bore.x, bore.y, 30, C.gunHeat || 0, 0.85); }
    drawFPV(ctx, { cx: g.cx, minY: g.minY + (compact ? 40 : 12), maxY: g.maxY - 12, boxW: g.boxW - (compact ? 84 : 120) }, dt, hudCol);
    drawGunFunnel(ctx, hudCol);

    if (compact) {
      drawHeadingStrip(ctx, g.cx, g.minY + 18, g.boxW * 0.56, hudCol, true);
      drawSlimTape(ctx, { x: g.minX + 68, top: g.minY + 72, bot: g.maxY - 30, value: kts, pxPerUnit: 1.3, step: 10, side: 'left',
        label: 'SPEED', sub: 'MACH ' + S.mach.toFixed(2), next: kts + spdAcc * 1.94384 * 5, compact: true }, spdCol);
      drawSlimTape(ctx, { x: g.maxX - 68, top: g.minY + 72, bot: g.maxY - 30, value: altFt, pxPerUnit: 0.13, step: 100, side: 'right',
        label: 'ALT', sub: raltFt < 1000 ? raltText : '', subCol: raltCol, compact: true }, altCol);
      if (S.afterburner > 0.3) drawModeTag(ctx, g.minX + 18, g.minY + 14, 'A/B', AMBER, true);
      if (!C.dead && (C.missiles > 0 || C.ammo > 0)) drawModeTag(ctx, g.minX + 18, g.minY + 35, 'ARM', hudCol, true);
    }

    ctx.restore();
  }

  let lastT = performance.now();
  let hudOrderName = '', hudOrderTag = '';
  function drawWingmen(ctx) {
    const ws = A.getWingmen ? A.getWingmen() : null;
    if (ws && ws.length) {
      const nm = WING_ORDER_NAMES[C.wingOrder] || 'FORM';
      if (nm !== hudOrderName) { hudOrderName = nm; hudOrderTag = 'ORD: ' + nm; }
      for (const w of ws) {
        if (!w || !w.alive) continue;
        const limp = !!w.limping, col = limp ? AMBER : '#5fe8ff';
        _wv.copy(w.pos).project(cam);
        if (_wv.z > 1 || _wv.z < -1 || Math.abs(_wv.x) > 1 || Math.abs(_wv.y) > 1) continue;
        const x = (_wv.x * 0.5 + 0.5) * HW, y = (-_wv.y * 0.5 + 0.5) * HH;
        const range = w.pos.distanceTo(S.position);
        ctx.save();
        glow(ctx, col, 4); ctx.strokeStyle = col; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.closePath();
        ctx.stroke();
        ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const label = `[ ${w.id} ]` + (range > 1852 ? `  ${(range / 1852).toFixed(1)}NM` : '')
          + (limp ? `  LIMPING x${(C.limp && C.limp.n) || 0}` : `  ${hudOrderTag}`);
        labelText(ctx, label, x, y + 12, col, 3);
        ctx.restore();
      }
      // Persistent order tag beside the flight roster.
      ctx.save();
      ctx.font = f(11, true); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      labelText(ctx, hudOrderTag, HW - 24, 128, G, 3);
      if (C.orderBadgeT > 0) {
        ctx.globalAlpha = Math.min(1, C.orderBadgeT / 0.4);
        labelText(ctx, hudOrderTag, HW - 24, 146, G, 3);
      }
      ctx.restore();
    }
    // Pulsing chevrons mark the bandits chasing WARDEN-2.
    if (C.limp && C.limp.st === 'LIMPING') {
      const foes = A.getEnemies ? A.getEnemies() : null;
      if (foes) for (let i = 0; i < foes.length; i++) {
        const e = foes[i];
        if (!e || !e.alive || !e.wingTarget) continue;
        _wv.copy(e.pos).project(cam);
        if (_wv.z > 1 || _wv.z < -1 || Math.abs(_wv.x) > 1 || Math.abs(_wv.y) > 1) continue;
        const x = (_wv.x * 0.5 + 0.5) * HW, y = (-_wv.y * 0.5 + 0.5) * HH;
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() * 0.008));
        ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.lineTo(x, y + 8); ctx.lineTo(x + 8, y - 6); ctx.stroke();
        ctx.restore();
      }
    }
  }
  function drawObjective(ctx) {
    const cat = A.getCat && A.getCat();
    if (cat && (cat.ph === 'HOLD' || cat.ph === 'LAUNCH')) return;
    ctx.save();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    if (C.mode === 'FURBALL') {
      const txt = 'FURBALL // KILLS ' + (C.kills || 0);
      ctx.font = f(14, true);
      const w = ctx.measureText(txt).width + 26;
      numBack(ctx, HW - 24 - w, 80, w, 28);
      labelText(ctx, txt, HW - 24, 94, G, 4);
      ctx.restore();
      return;
    }
    // Optional faint shortcut chevron at the ravine mouth (CANYON_RUN, once per sortie).
    const sc = A.getShortcut ? A.getShortcut() : null;
    if (sc && !sc.used && C.mcfg && C.mcfg.gatesPath === 'CANYON') {
      _ov.set(GORGE_SC_X, GORGE_SC_FLOOR_Y + 90, GORGE_SC_ZA).project(cam);
      if (_ov.z > -1 && _ov.z < 1 && Math.abs(_ov.x) < 0.9 && Math.abs(_ov.y) < 0.9) {
        const sx = (_ov.x * 0.5 + 0.5) * HW, sy = (-_ov.y * 0.5 + 0.5) * HH;
        ctx.save(); ctx.globalAlpha = 0.55; glow(ctx, AMBER, 3); ctx.fillStyle = AMBER;
        ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('◁ SHORTCUT', sx, sy); ctx.restore();
      }
    }
    const p = C.missionPhase || 1, label = MP_LABELS[p] || 'COMPLETE';
    const targets = A.getPrimary ? A.getPrimary() : null;
    let nearest = null, nd = Infinity;
    if (targets) for (let i = 0; i < targets.length; i++) {
      const t = targets[i]; if (!t || !t.pos) continue;
      const d = Math.hypot(t.pos.x - S.position.x, t.pos.z - S.position.z);
      if (d < nd) { nd = d; nearest = t; }
    }
    const done = C.obj ? C.obj.done : 0, total = C.obj ? C.obj.total : 0;
    const line = 'OBJ: ' + label + ' [' + done + '/' + total + '] — ' + (nd / 1000).toFixed(1) + ' KM';
    ctx.font = f(14, true);
    const w = ctx.measureText(line).width + 28;
    numBack(ctx, HW - 24 - w, 92 - 15, w, 30);
    labelText(ctx, line, HW - 24, 92, G, 4);
    ctx.font = f(11);
    labelText(ctx, 'PHASE ' + Math.min(4, p) + '/4', HW - 24, 70, GD, 2);
    if (nearest) {
      _ov.copy(nearest.pos).project(cam);
      let x = _ov.x, y = _ov.y, z = _ov.z;
      if (z > 1) { x = -x; y = -y; }
      const col = p === 2 ? AMBER : p === 3 ? '#ffd45a' : p === 4 ? '#5fe8ff' : G;
      const px = (x * 0.5 + 0.5) * HW, py = (-y * 0.5 + 0.5) * HH;
      if (Math.abs(x) > 0.92 || Math.abs(y) > 0.88 || z > 1) {
        const a = Math.atan2(y, x), ex = HW / 2 + Math.cos(a) * HW * 0.42, ey = HH / 2 - Math.sin(a) * HH * 0.38;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(-a);
        glow(ctx, col, 5); ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(-7, -7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = f(11, true); ctx.textAlign = 'center';
        labelText(ctx, (nd / 1000).toFixed(1) + ' KM', ex - Math.cos(a) * 18, ey + Math.sin(a) * 18, col, 3);
      } else if (px > 16 && px < HW - 16 && py > 16 && py < HH - 16) {
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(px - 10, py - 5); ctx.lineTo(px - 10, py); ctx.lineTo(px - 5, py);
        ctx.moveTo(px + 5, py); ctx.lineTo(px + 10, py); ctx.lineTo(px + 10, py + 5);
        ctx.moveTo(px + 5, py + 10); ctx.lineTo(px, py + 10); ctx.lineTo(px, py + 5);
        ctx.moveTo(px - 5, py - 10); ctx.lineTo(px, py - 10); ctx.lineTo(px, py - 5);
        ctx.stroke(); ctx.restore();
      }
    }
    // Recovery chevron: nearest of Return Line / carrier / AFB when winchester or damaged.
    const dmg = 100 - C.health;
    const spw0 = SPW[C.spw] || SPW['4AAM'];
    const ammo0 = spw0.wpn === 'AAM4' ? C.aam4 : spw0.wpn === 'BOMB' ? C.bombs : C.qaam;
    if (((C.missiles === 0 && ammo0 === 0) || dmg > 50) && (!A.ilsVisible || A.ilsVisible())) {
      const col = dmg > 50 ? AMBER : '#5fe8ff';
      let best = null, bd = Infinity;
      const consider = (p, name) => {
        const d = Math.hypot(p.x - S.position.x, p.y - S.position.y, p.z - S.position.z);
        if (d < bd) { bd = d; _rl.copy(p); best = name; }
      };
      const rz = A.returnZ || 8000;
      _ov.set(Math.max(-10000, Math.min(10000, Math.round(S.position.x / 1000) * 1000)), 325, rz); consider(_ov, 'RETURN LINE');
      if (C.ally && C.ally.pos) consider(C.ally.pos, 'CARRIER');
      if (A.runway) { _ov.set(A.runway.x, A.runway.elev, A.runway.z1); consider(_ov, 'AFB'); }
      if (best) {
        _ov.copy(_rl).project(cam);
        const ox = _ov.x, oy = _ov.y, oz = _ov.z;
        let x = ox, y = oy, z = oz;
        if (z > 1) { x = -x; y = -y; }
        const a = Math.atan2(y, x), ex = HW / 2 + Math.cos(a) * HW * 0.42, ey = HH / 2 - Math.sin(a) * HH * 0.38;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(-a);
        glow(ctx, col, 5); ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(-7, -7); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.font = f(11, true); ctx.textAlign = 'center';
        labelText(ctx, `${best} ▼ ${(bd / 1000).toFixed(1)} KM`, ex - Math.cos(a) * 20, ey + Math.sin(a) * 20, col, 3);
      }
    }
    ctx.restore();
  }

  function drawPrompt(ctx) {
    if (C.dead) return;
    const cat = A.getCat && A.getCat();
    if (cat && cat.ph === 'HOLD' && (!A.getCatMounted || A.getCatMounted())) {
      const txt = '[HOLD FULL AFTERBURNER / SHIFT] LAUNCH';
      const cx = HW / 2, cy = HH - 96, w = 430, h = 44, armT = A.getCatArmT ? A.getCatArmT() : 0.35;
      ctx.save();
      ctx.font = f(14, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      noGlow(ctx); ctx.fillStyle = 'rgba(0, 14, 8, 0.72)';
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      glow(ctx, AMBER, 6); ctx.lineWidth = 1.5; ctx.strokeStyle = AMBER; ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
      labelText(ctx, txt, cx, cy - 8, AMBER, 5);
      const k = Math.min(1, (cat.arm || 0) / armT);
      noGlow(ctx); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cx - 170, cy + 8, 340, 5);
      ctx.fillStyle = k >= 1 ? G : AMBER; ctx.fillRect(cx - 170, cy + 8, 340 * k, 5);
      ctx.restore();
      return;
    }
    if (cat && cat.ph === 'LAUNCH') { promptKey = ''; promptT = 0; return; }
    let txt = '', prio = 0;
    if (C.rtb && C.rtb.on && C.rtb.type === 'CARRIER' && C.ally && C.ally.pos && !(A.isAutoland && A.isAutoland())) {
      const sternX = C.ally.pos.x - C.ally.fwd.x * C.ally.len / 2;
      const sternZ = C.ally.pos.z - C.ally.fwd.z * C.ally.len / 2;
      if (Math.hypot(sternX - S.position.x, sternZ - S.position.z) < 3500) { txt = '[L] ENGAGE AUTOLAND'; prio = 0; }
    }
    const rwr = C.rwr || [];
    for (let i = 0; i < rwr.length; i++) if (rwr[i].kind === 'msl' && rwr[i].g === 'RADAR') { txt = P_RDR; prio = 1; break; }
    if (!txt) for (let i = 0; i < rwr.length; i++) if (rwr[i].kind === 'msl') { txt = P_IR; prio = 2; break; }
    if (!txt) {
      const spw = C.spw || '4AAM';
      const ammo = spw === '4AAM' ? C.aam4 : spw === 'UGB' ? C.bombs : C.qaam;
      const winchester = C.missiles === 0 && ammo === 0;
      if ((100 - C.health > 45 || winchester) && C.ally) { txt = P_RTB; prio = 3; }
    }
    if (!txt && C.lockState === 'LOCK') { txt = P_MCAM; prio = 4; }
    if (!txt && C.wingOrder === 0) {
      const foes = A.getEnemies ? A.getEnemies() : null;
      if (foes) for (let i = 0; i < foes.length; i++) {
        const e = foes[i];
        if (e && e.alive && e.pos.distanceTo(S.position) < 6000) { txt = P_WING; prio = 5; break; }
      }
    }
    if (!txt) { promptKey = ''; promptT = 0; return; }
    const now = performance.now();
    if (txt !== promptKey) { promptKey = txt; promptT = now; }
    const a = Math.min(1, (now - promptT) / 150), cx = HW / 2, cy = HH - 96;
    ctx.save();
    ctx.font = f(15, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 36, h = 30, r = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + r, cy - r); ctx.lineTo(cx + w / 2 - r, cy - r);
    ctx.arc(cx + w / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx - w / 2 + r, cy + r); ctx.arc(cx - w / 2 + r, cy, r, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    noGlow(ctx); ctx.fillStyle = 'rgba(0, 14, 8, 0.6)'; ctx.fill();
    const col = prio <= 2 ? WARN : prio === 3 ? AMBER : G;
    glow(ctx, col, 6); ctx.lineWidth = 1.5; ctx.globalAlpha = a; ctx.stroke();
    labelText(ctx, txt, cx, cy + 1, col, 6);
    ctx.restore();
  }

  function drawCheat(ctx) {
    if (!C.cheat) return;
    const w = 320, h = 260, x = 20, y = HH / 2 - h / 2;
    ctx.save();
    noGlow(ctx); ctx.fillStyle = 'rgba(0, 20, 10, 0.62)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.font = f(12); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const colW = (w - 24) / 3;
    for (let i = 0; i < CHEAT_ROWS.length; i++) {
      const row = CHEAT_ROWS[i], rx = x + 12 + (i % 3) * colW, ry = y + 28 + Math.floor(i / 3) * 34;
      labelText(ctx, row[0], rx, ry - 7, G, 2);
      labelText(ctx, row[1], rx, ry + 8, GB, 2);
    }
    labelText(ctx, 'F1 — CLOSE', x + 12, y + h - 16, AMBER, 3);
    ctx.restore();
  }

  function draw() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    hctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    hctx.clearRect(0, 0, HW, HH);
    const gs = S.gStrain || 0;
    const gDim = S.glocT > 0 ? 0.05 : (gs > 0.85 ? 1 - 0.5 * smooth(gs, 0.85, 0.99) : 1);
    hctx.save(); hctx.globalAlpha = gDim;
    if (gs > 0.85 && S.glocT <= 0) {
      const ji = Math.floor(now / 40) & 31;
      hctx.translate(G_JITTER[ji], G_JITTER[(ji + 11) & 31]);
    }
    if (!A.isReady() || (A.isHidden && A.isHidden())) return;
    if (C.gunFiring) hctx.translate((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5);

    updateDynamics(dt);
    alertState = alertOverride || (C.missileWarning > 0 && !C.dead ? 'MISSILE_ALERT' : 'NORMAL');

    const fp = A.isFirstPerson();
    const mist = A.getMist();
    const nvgOn = A.isNVG && A.isNVG();
    if (mist > 0.01) {
      // Through NVG tubes the cloud wash is phosphor green and thinner (the tubes already render it).
      hctx.fillStyle = nvgOn ? `rgba(70,190,120,${(fp ? 0.16 : 0.2) * mist})` : `rgba(228,235,242,${(fp ? 0.40 : 0.48) * mist})`;
      hctx.fillRect(0, 0, HW, HH);
      if (fp) {
        const r = hctx.createRadialGradient(HW / 2, HH * 0.42, HH * 0.15, HW / 2, HH * 0.42, HW * 0.65);
        r.addColorStop(0, 'rgba(255,255,255,0)');
        r.addColorStop(1, nvgOn ? `rgba(60,170,105,${0.2 * mist})` : `rgba(245,248,252,${0.48 * mist})`);
        hctx.fillStyle = r; hctx.fillRect(0, 0, HW, HH);
      }
    }

    if (!fp && (S.cloudIce || 0) > 0.15) {
      const f = Math.min(1, (S.cloudIce - 0.15) / 0.85);
      hctx.save(); hctx.globalAlpha = f * 0.5;
      hctx.drawImage(frostCv, 0, 0, HW, HH); hctx.restore();
    }

    if (A.getPunch && A.getPunch() > 0.01) {
      hctx.save(); hctx.fillStyle = 'rgba(235,242,255,' + (A.getPunch() * 0.75).toFixed(3) + ')';
      hctx.fillRect(0, 0, HW, HH);
      hctx.globalAlpha = A.getPunch() * 0.7; hctx.drawImage(frostCv, 0, 0, HW, HH); hctx.restore();
    }

    if (A.getMode && A.getMode() === 'EJECT') {
      drawRadio(hctx);
      drawTopLeft(hctx);
      drawComms(hctx, HH * 0.80);
      return;
    }

    let g = null;
    if (fp) {
      g = combinerPath();
      if (g && !C.dead) drawCentralHUD(hctx, g, dt, true);
    } else {
      g = chaseLayout();
      // Chase free-look orbit: the boresight reticle / SPEED / ALT boxes no longer sit
      // on the nose, so they fade out with the look offset (gone past ~30 deg).
      const fl = A.getFreeLook && A.getFreeLook();
      const hudA = fl ? 1 - fl.amount : 1;
      if (!C.dead && hudA > 0.02) {
        hctx.save();
        hctx.globalAlpha = hudA;
        hctx.translate(inertia.x, inertia.y);
        drawCentralHUD(hctx, g, dt, false);
        hctx.restore();
      }
    }

    if (!C.dead) { drawTargets(hctx); drawWingmen(hctx); }
    drawStrikeTargets(hctx); drawWeakTargets(hctx);
    drawRadio(hctx);
    drawTopLeft(hctx);
    if (!C.dead) drawKillFlash(hctx, g);
    drawStamps(hctx, dt); radarPulseT += dt;
    if (C.jamming > 0) {
      // EW jitter: radar is painted directly on this canvas, so translate the
      // draw by +/-2 px instead of a drawImage source-offset.
      hctx.save();
      hctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      drawSquareRadar(hctx);
      hctx.restore();
    } else drawSquareRadar(hctx);
    drawDLZ(hctx); drawJHMCS(hctx);
    drawSectorBadge(hctx);
    drawBottomRight(hctx);
    drawObjective(hctx);
    drawCenterBanners(hctx, fp ? g : null);
    if (!C.dead) drawApproach(hctx, g);
    drawStyleFeed(hctx, g);
    drawDangerPill(hctx);
    drawPrompt(hctx);
    drawCheat(hctx);
    drawComms(hctx, fp ? HH * 0.71 : HH * 0.84);
    if (!A.isModal()) drawStickCue(hctx);
    drawFreeLookTag(hctx);
    drawGLoc(hctx);
    drawJam(hctx);
    const mc = !C.dead && A.getMissileCam ? A.getMissileCam() : null;
    if (mc) {
      hctx.save();
      hctx.textAlign = 'center';
      hctx.font = f(14, true);
      labelText(hctx, '[ MISSILE CAM // TELEMETRY LINK ]', HW / 2, 64, '#5fe8ff', 6);
      hctx.font = f(12, true);
      labelText(hctx, 'TGT ' + Math.round(mc.dist) + ' M', HW / 2, 82, '#5fe8ff', 4);
      hctx.restore();
    }
    hctx.restore();
  }

  // Style feed in center-peripheral vision, just below the reticle / combiner
  // lower edge (y ~ 64 %): bold callout + reward bracket, 0.15 s pop-in
  // (1.35x -> 1.0x), 1.6 s hold, then a 0.6 s slide-up fade. Newer callouts
  // push older ones upward. Drops below PULL UP / STALL / OVERHEAT banners.
  const FEED_POP = 0.15, FEED_HOLD = 1.6, FEED_OUT = 0.6;
  function drawStyleFeed(ctx, g) {
    const feed = C.styleFeed;
    if (!feed || !feed.length || C.dead) return;
    const now = performance.now(), cx = g && A.isFirstPerson() ? g.cx : HW / 2;
    const warnBusy = pullUpOn() || stallOn() || C.gunOverheat;
    // Chase: ~64 % of the viewport; cockpit: just under the combiner glass lower edge.
    const anchor = g && A.isFirstPerson() ? clamp(g.maxY + 24, HH * 0.4, HH * 0.7) : HH * 0.64;
    const base = anchor + (warnBusy ? 46 : 0);
    const live = feed.filter(s => (now - s.born) / 1000 < FEED_POP + FEED_HOLD + FEED_OUT).slice(-3);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    live.forEach((s, i) => {
      const age = (now - s.born) / 1000, rank = live.length - 1 - i;
      const out = clamp((age - FEED_POP - FEED_HOLD) / FEED_OUT, 0, 1);
      const pop = age < FEED_POP ? 1.35 - 0.35 * smooth(age, 0, FEED_POP) : 1;
      const a = clamp(age / 0.06, 0, 1) * (1 - out) * (rank ? 0.78 : 1);
      const yy = base - rank * 30 - 28 * smooth(out, 0, 1);
      const main = s.text + (s.pts ? `  +${s.pts}` : '');
      const rew = s.sub ? `  [${s.sub}]` : '';
      const sz = rank ? 17 : 22;
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(cx, yy); ctx.scale(pop, pop);
      ctx.font = f(sz, true);
      const wMain = ctx.measureText(main).width;
      ctx.font = f(Math.round(sz * 0.68), true);
      const wRew = ctx.measureText(rew).width;
      const x0 = -(wMain + wRew) / 2;
      ctx.save(); noGlow(ctx);
      ctx.fillStyle = 'rgba(0,12,8,0.44)'; ctx.fillRect(x0 - 14, -sz * 0.62, wMain + wRew + 28, sz * 1.24); ctx.restore();
      ctx.textAlign = 'left';
      ctx.font = f(sz, true); labelText(ctx, main, x0, 1, s.color, 9);
      if (rew) { ctx.font = f(Math.round(sz * 0.68), true); labelText(ctx, rew, x0 + wMain, 2, s.refill ? REFILL : GB, 6); }
      ctx.restore();
    });
    ctx.restore();
  }

  /* ------------------------------ approach: ILS RWY 36, E-bracket, pit stop */
  // ARCHIPELAGO AFB runway runs 18/36 along world Z (x = 900); the ILS serves
  // RWY 36 (approach from the south, threshold at z1, approach lights south of
  // it). Active with the gear commanded down, or automatically inside 5,500 m of
  // the threshold below 2,500 ft AGL heading within 60 deg of 360.
  //   LOC: angle off the centreline (full scale +/-2.5 deg); GS: angle off the
  //   3 deg glide path from the touchdown point (full scale +/-0.7 deg).
  //   Needles show where the path is: fly toward them.
  function ilsState() {
    if (A.ilsVisible && !A.ilsVisible()) return null;
    const R = A.runway; if (!R || C.dead || S.onGround) return null;
    const along = S.position.z - R.z1, dx = S.position.x - R.x;
    const dist = Math.hypot(dx, along), aglFt = S.radalt * 3.28084;
    const hdgErr = Math.abs((((S.heading || 0) - 360 + 540) % 360) - 180);
    const auto = dist < 5500 && aglFt < 2500 && hdgErr < 60 && along > -200;
    if (!(S.gearDown || auto) || along < -(R.z1 - R.z0)) return null;
    const a = Math.max(along, 60);
    const hAbove = S.position.y - (A.gearH || 2.9) - R.elev;
    return { loc: Math.atan2(dx, a) * R2D, gs: Math.atan2(hAbove, a) * R2D - 3, dist, along, hAbove, auto };
  }
  function drawApproach(ctx, g) {
    const ils = ilsState();
    const fp = A.isFirstPerson();
    const cx = g ? g.cx + (fp ? 0 : inertia.x) : HW / 2, cy = g ? g.cy + (fp ? 0 : inertia.y) : HH / 2;
    if (ils) {
      ctx.save();
      // Synthetic runway outline (world corners projected), so the strip reads through haze.
      const R = A.runway, E = R.elev + 0.3, hw = R.width / 2;
      const cs = [[R.x - hw, R.z1], [R.x + hw, R.z1], [R.x + hw, R.z0], [R.x - hw, R.z0]].map(([x, z]) => toScreen(new THREE.Vector3(x, E, z)));
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const ahead = new THREE.Vector3(R.x, E, R.z1).sub(cam.position).dot(fwd) > 0;
      if (ahead && cs.every(p => p.ok)) {
        glow(ctx, G, 4); ctx.lineWidth = 1.2; ctx.setLineDash([6, 5]);
        ctx.beginPath(); cs.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
      }
      // Localizer / glide-slope alignment cross.
      const Rr = 78, locK = clamp(ils.loc / 2.5, -1, 1), gsK = clamp(ils.gs / 0.7, -1, 1);
      const onLoc = Math.abs(ils.loc) < 0.5, onGs = Math.abs(ils.gs) < 0.25;
      glow(ctx, GD, 0); ctx.fillStyle = GD;
      for (const k of [-1, -0.5, 0.5, 1]) { ctx.beginPath(); ctx.arc(cx + k * Rr, cy, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy + k * Rr, 2.2, 0, Math.PI * 2); ctx.fill(); }
      glow(ctx, G, 3); ctx.lineWidth = 1.2; ctx.strokeRect(cx - 5, cy - 5, 10, 10);
      const lx = cx - locK * Rr, gy = cy + gsK * Rr;
      glow(ctx, onLoc ? G : AMBER, 6); ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(lx, cy - Rr); ctx.lineTo(lx, cy + Rr); ctx.stroke();
      glow(ctx, onGs ? G : AMBER, 6);
      ctx.beginPath(); ctx.moveTo(cx - Rr, gy); ctx.lineTo(cx + Rr, gy); ctx.stroke();
      ctx.font = f(14, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      labelText(ctx, '[ ILS LOCK // RWY 36 ]', cx, cy - Rr - 22, onLoc && onGs ? G : GB, 6);
      ctx.font = f(11, true);
      const locTxt = `LOC ${Math.abs(ils.loc).toFixed(1)}°${ils.loc > 0.05 ? 'R' : ils.loc < -0.05 ? 'L' : ''}`;
      const gsTxt = `GS ${Math.abs(ils.gs).toFixed(1)}°${ils.gs > 0.05 ? ' HI' : ils.gs < -0.05 ? ' LO' : ''}`;
      labelText(ctx, `${locTxt}   ${gsTxt}   ${(Math.max(0, ils.along) / 1852).toFixed(1)} NM`, cx, cy - Rr - 6, GD, 3);
      ctx.restore();
    }
    // AoA E-bracket beside the flight-path vector (gear down, airborne): on-speed
    // alpha 13 deg (= ~160 kt at landing weight), band +/-2.3 deg (~145-175 kt).
    // FPV centred in the bracket = on speed; FPV below the bracket centre = slow.
    if (S.gear > 0.9 && !S.onGround && !C.dead) {
      const p = toScreen(cam.position.clone().addScaledVector(S.velocity.clone().normalize(), 4500));
      if (p.ok) {
        const aDeg = S.alpha * R2D, k = 9, ON = 13, BAND = 2.3;
        const by = p.y - (aDeg - ON) * k, bh = BAND * k, bx = p.x - 26;
        const kts = S.speed * 1.94384, on = Math.abs(aDeg - ON) <= BAND;
        const col = on ? G : AMBER;
        ctx.save(); glow(ctx, col, 5); ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(bx + 8, by - bh); ctx.lineTo(bx, by - bh); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + 8, by + bh);
        ctx.moveTo(bx, by); ctx.lineTo(bx + 6, by);
        ctx.stroke();
        ctx.font = f(11, true); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        labelText(ctx, `${Math.round(kts)}`, bx - 5, by - bh + 2, col, 3);
        labelText(ctx, on ? 'ON SPD' : aDeg > ON ? 'SLOW' : 'FAST', bx - 5, by + bh - 2, col, 3);
        ctx.restore();
      }
    }
    // AI disengage status (combat.playerSafe): subtle emerald tag under the radio box.
    if (C.playerSafe) {
      const txt = C.safeKind === 'BASE' ? '[ BASE SAFE ZONE // CLEAR TO LAND ]' : '[ LOW-ALT CLUTTER // NO LOCK ]';
      const ty = Math.max(HH * 0.165, radioBottom ? radioBottom + 16 : 0);
      ctx.save(); ctx.font = f(13, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width + 24;
      noGlow(ctx); ctx.fillStyle = 'rgba(0,16,9,0.42)'; ctx.fillRect(HW / 2 - w / 2, ty - 11, w, 22);
      glow(ctx, G, 0); ctx.lineWidth = 1; ctx.globalAlpha = 0.55; ctx.strokeRect(HW / 2 - w / 2 + 0.5, ty - 10.5, w - 1, 21); ctx.globalAlpha = 1;
      labelText(ctx, txt, HW / 2, ty + 1, G, 5);
      ctx.restore();
    }
    // Runway pit stop progress.
    if (S.pit && S.pit.active) {
      const k = clamp(S.pit.t / 4, 0, 1), w = 300, x0 = HW / 2 - w / 2, y0 = HH * 0.3;
      ctx.save(); ctx.font = f(16, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      labelText(ctx, '[ REARMING & REPAIRING... ]', HW / 2, y0 - 6, G, 8);
      noGlow(ctx); ctx.fillStyle = 'rgba(0,14,8,0.6)'; ctx.fillRect(x0 - 2, y0 - 2, w + 4, 12);
      glow(ctx, G, 8); ctx.fillStyle = G; ctx.fillRect(x0, y0, w * k, 8);
      ctx.font = f(11, true); ctx.textBaseline = 'top';
      labelText(ctx, `MSL · 4AAM · UGB · GUN · FLR · FUEL · AIRFRAME   ${Math.round(k * 100)}%`, HW / 2, y0 + 14, GD, 3);
      ctx.restore();
    }
  }

  // PHASE 3 Ace marker: slow-rotating crimson double diamond around the jet,
  // "ACE // SOL-1" tag above and a structural HP bar below.
  function drawAceMark(ctx, e, p, now) {
    const range = e.pos.distanceTo(S.position);
    const s = clamp(16000 / Math.max(range, 350), 20, 34) + 8;
    const frac = clamp(e.hp / (e.hpMax || 1), 0, 1);
    ctx.save();
    glow(ctx, BLAZE, 8); ctx.lineWidth = 1.5;
    diamond(ctx, p.x, p.y, s, now / 900);
    ctx.globalAlpha = 0.55; diamond(ctx, p.x, p.y, s + 6, -now / 1300); ctx.globalAlpha = 1;
    ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    labelText(ctx, `ACE // ${e.label}`, p.x, p.y - s - 18, BLAZE, 6);
    const bw = 64, bx = p.x - bw / 2, by = p.y + s + 8;
    noGlow(ctx); ctx.fillStyle = 'rgba(30, 0, 6, 0.6)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    glow(ctx, BLAZE, 6); ctx.fillStyle = BLAZE; ctx.fillRect(bx, by, bw * frac, 4);
    ctx.restore();
  }

  // CRIMSON flight: gold diamond + crimson outer stroke, always drawn while on screen.
  function drawAceFlightMark(ctx, e, p) {
    const frac = clamp(e.hp / (e.hpMax || 1), 0, 1);
    ctx.save();
    glow(ctx, '#ffd45a', 4); ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffd45a';
    diamond(ctx, p.x, p.y, 10, 0); ctx.stroke();
    ctx.strokeStyle = '#ff3b5c'; diamond(ctx, p.x, p.y, 14, 0); ctx.stroke();
    ctx.font = f(11, true); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    labelText(ctx, `[ ACE // ${e.label} ]`, p.x, p.y - 14, '#ffd45a', 4);
    // ACE_DUEL: a rival pilot, not a boss -- no structural HP bar.
    if (C.mcfg && C.mcfg.gunsOnly) { ctx.restore(); return; }
    const bw = 44, bx = p.x - bw / 2, by = p.y + 18;
    noGlow(ctx); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = '#ff3b5c'; ctx.fillRect(bx, by, bw * frac, 4);
    ctx.strokeStyle = '#ffd45a'; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, 4);
    ctx.restore();
  }

  // Radio subtitle box (top-center, centre at ~9 % of the viewport): 1 px
  // translucent frame, << CALLSIGN >> badge (AWACS emerald / hostile crimson),
  // typed text with a caret, 0.2 s fade-in / 0.35 s fade-out. Upper center
  // banners are pushed below it while it is up.
  let radioBottom = 0;
  const RADIO_ALLY = '#58ff9a', RADIO_HOSTILE = '#ff5566';
  function wrapLines(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawRadio(ctx) {
    radioBottom = 0;
    const r = C.radio;
    if (!r) return;
    const col = r.side === 'enemy' ? RADIO_HOSTILE : RADIO_ALLY;
    const a = clamp(r.age / 0.2, 0, 1) * (1 - (r.fade || 0));
    if (a <= 0.01) return;
    const badge = `<< ${r.call} >>`;
    const boxW = Math.max(Math.min(360, HW - 32), Math.min(640, HW - 480)), padX = 14;   // clear of the top-left / top-right clusters
    ctx.save();
    ctx.font = f(12, true);
    const bw = ctx.measureText(badge).width;
    ctx.font = f(16, false);
    const lines = wrapLines(ctx, r.text, boxW - padX * 2 - bw - 14);
    const boxH = 16 + lines.length * 20;
    const cx = HW / 2, cy = Math.max(HH * 0.09, boxH / 2 + 10), x0 = cx - boxW / 2, y0 = cy - boxH / 2;
    radioBottom = y0 + boxH;
    ctx.globalAlpha = a;
    noGlow(ctx);
    ctx.fillStyle = 'rgba(0, 10, 8, 0.52)'; ctx.fillRect(x0, y0, boxW, boxH);
    ctx.strokeStyle = r.side === 'enemy' ? 'rgba(255, 85, 102, 0.45)' : 'rgba(88, 255, 154, 0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, boxW - 1, boxH - 1);
    glow(ctx, col, 4); ctx.fillRect(x0, y0, 3, boxH);                    // keyed-mic bar
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.font = f(12, true); labelText(ctx, badge, x0 + padX, y0 + 10, col, 5);
    // Typed reveal at the transmission's characters-per-second.
    let shown = Math.floor(r.text.length * clamp(r.age / Math.max(0.01, r.typeT), 0, 1));
    ctx.font = f(16, false);
    const tx = x0 + padX + bw + 14;
    lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, shown)); shown -= ln.length + 1;
      if (part) labelText(ctx, part, tx, y0 + 7 + i * 20, '#e6fff0', 3);
      if (shown < 0 && shown > -ln.length - 2 && Math.floor(performance.now() / 260) % 2) {   // caret while typing
        const cw = ctx.measureText(part).width; glow(ctx, col, 3); ctx.fillRect(tx + cw + 2, y0 + 9 + i * 20, 7, 14);
      }
    });
    ctx.restore();
  }

  // Reticle kill-flash: an expanding diamond ring around the center sight for
  // 0.25 s on every confirmed kill (emerald; crimson-gold at x4.5+).
  function drawKillFlash(ctx, g) {
    const kf = C.killFlash;
    if (!kf || !g) return;
    const t = (performance.now() - kf.t) / 250;
    if (t < 0 || t >= 1) return;
    const cx = g.cx + (A.isFirstPerson() ? 0 : inertia.x), cy = g.cy + (A.isFirstPerson() ? 0 : inertia.y);
    const col = kf.mult >= 4.5 ? BLAZE : kf.mult >= 3 ? GOLD : G;
    ctx.save();
    for (const [k, w] of [[0, 2.6], [0.35, 1.4]]) {
      const tt = clamp(t - k * 0.4, 0, 1); if (tt <= 0) continue;
      const r = 26 + 74 * smooth(tt, 0, 1);
      ctx.globalAlpha = (1 - tt) * (k ? 0.6 : 1);
      glow(ctx, col, 12); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  // DANGER CLOSE pill: steady glowing amber pill near the bottom of the center HUD.
  function drawDangerPill(ctx) {
    if (!C.dangerClose || C.dead) return;
    const txt = '[ DANGER CLOSE x1.5 ]', cx = HW / 2, cy = HH * 0.755;
    ctx.save();
    ctx.font = f(15, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 30, h = 24, r = h / 2;
    const breathe = 0.8 + 0.2 * Math.sin(performance.now() / 380);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + r, cy - r); ctx.lineTo(cx + w / 2 - r, cy - r); ctx.arc(cx + w / 2 - r, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx - w / 2 + r, cy + r); ctx.arc(cx - w / 2 + r, cy, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    noGlow(ctx); ctx.fillStyle = 'rgba(40,22,0,0.55)'; ctx.fill();
    glow(ctx, AMBER, 10 * breathe); ctx.lineWidth = 1.6; ctx.stroke();
    labelText(ctx, txt, cx, cy + 1, AMBER, 8 * breathe);
    ctx.restore();
  }

  // G-LOC greyout / blackout tunnel: a radial vignette closing from the edges
  // toward the reticle (inner radius + opacity up to 0.92 at strain 1.0), a grey
  // peripheral haze, heartbeat-synced dimming above 0.72, crimson redout tint
  // under sustained negative G.
  function drawGLoc(ctx) {
    const st = S.gStrain || 0, ng = S.negGStrain || 0;
    const k = smooth(st, 0.25, 1.0), r = smooth(ng, 0.3, 1.0);
    if (k < 0.002 && r < 0.002) return;
    const t = performance.now() / 1000;
    const beat = st > 0.72 ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 2.3)), 6) : 0;
    const cx = HW / 2, cy = HH / 2, R = Math.hypot(HW, HH) / 2;
    ctx.save();
    if (k > 0.002) {
      const inner = R * Math.max(0.06, 0.92 - 0.8 * k - 0.05 * beat);
      const op = Math.min(0.92, 0.92 * k + 0.08 * beat * k);
      const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, R);
      g.addColorStop(0, 'rgba(20,22,24,0)');
      g.addColorStop(0.35, `rgba(62,64,68,${(0.45 * k).toFixed(3)})`);        // desaturated grey haze
      g.addColorStop(1, `rgba(0,0,0,${op.toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, HW, HH);
      if (st > 0.85) { ctx.fillStyle = `rgba(0,0,0,${(0.5 * smooth(st, 0.85, 1.0) * (0.6 + 0.4 * beat)).toFixed(3)})`; ctx.fillRect(0, 0, HW, HH); }
    }
    if (r > 0.002) {
      const g = ctx.createRadialGradient(cx, cy, R * (0.85 - 0.55 * r), cx, cy, R);
      g.addColorStop(0, 'rgba(140,0,12,0)');
      g.addColorStop(1, `rgba(150,8,20,${(0.62 * r).toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, HW, HH);
    }
    ctx.restore();
    if (st > 0.72 && !C.dead) {
      const a = 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 2.3));
      drawBanner(ctx, HW / 2, HH * 0.32, S.glocT > 0 ? '[ G-LOC ]' : '[ G-LOC WARNING ]', WARN, 240, a);
    }
    if ((S.gLoad || 0) > 8 && !C.dead) {
      ctx.save(); ctx.font = f(13, true); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      labelText(ctx, (S.gLoad).toFixed(1) + ' G', HW / 2, HH * 0.36, WARN, 4); ctx.restore();
    }
  }

  // Generic bracketed status badge (weather etc.).
  // Live sector badge tucked above the radar: `SEC-02 // BRIDGE STRAIT`; brightens
  // for 2.5 s after a sector change.
  function drawSectorBadge(ctx) {
    const sc = C.sector; if (!sc) return;
    const s = Math.round(Math.min(216, HH * 0.30, HW * 0.22)), x0 = 20, y0 = HH - s - 20;
    const fresh = clamp(1 - (performance.now() - (C.sectorT || 0)) / 2500, 0, 1);
    const txt = `${sc.code} // ${sc.name}`;
    ctx.save();
    ctx.font = f(11, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = Math.min(s, ctx.measureText(txt).width + 14);
    noGlow(ctx); ctx.fillStyle = `rgba(6, 26, 14, ${0.42 + 0.25 * fresh})`; ctx.fillRect(x0, y0 - 22, w, 17);
    glow(ctx, G, 2 + 4 * fresh); ctx.lineWidth = 1; ctx.strokeStyle = fresh > 0 ? GB : GD; ctx.strokeRect(x0 + 0.5, y0 - 21.5, w - 1, 16);
    labelText(ctx, txt, x0 + 7, y0 - 13, fresh > 0.05 ? GB : G, 2 + 3 * fresh);
    ctx.restore();
  }
  // [ FREE LOOK ] tag, bottom centre, while Alt / MMB is held (src/freelook.js).
  function drawFreeLookTag(ctx) {
    const fl = A.getFreeLook && A.getFreeLook();
    if (!fl || !fl.active) return;
    const txt = '[ FREE LOOK ]', cx = HW / 2, cy = HH - 34;
    ctx.save();
    ctx.font = f(12, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(txt).width + 18;
    noGlow(ctx); ctx.fillStyle = 'rgba(0, 12, 5, 0.45)'; ctx.fillRect(cx - w / 2, cy - 10, w, 20);
    ctx.globalAlpha = 0.9;
    labelText(ctx, txt, cx, cy + 1, G, 3);
    ctx.restore();
  }
  function drawBadge(ctx, x, y, txt, col) {
    ctx.save();
    ctx.font = f(12, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    labelText(ctx, txt, x, y + 10.5, col, 3);
    ctx.restore();
  }
  // [ NVG ] status badge (top-left telemetry block).
  function drawNVGBadge(ctx, x, y) {
    ctx.save();
    ctx.font = f(13, true); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = ctx.measureText('[ NVG ]').width + 12;
    noGlow(ctx); ctx.fillStyle = 'rgba(0, 12, 5, 0.55)'; ctx.fillRect(x - 6, y, w, 20);
    glow(ctx, G, 4); ctx.lineWidth = 1; ctx.strokeRect(x - 5.5, y + 0.5, w - 1, 19);
    labelText(ctx, '[ NVG ]', x, y + 10.5, G, 4);
    ctx.restore();
  }

  return {
    draw,
    resize,
    resetMaxG() { maxG = 1; },
    get maxG() { return maxG; },
    get topoCanvas() { return topo; },
    get inertia() { return { x: inertia.x, y: inertia.y }; },
    get stallWarn() { return stallOn(); },
    get hudAlertState() { return alertState; },
    setAlertState(s) { alertOverride = s; },
    setMusicToast(text) { musicToast.text = text || ''; musicToast.t = musicToast.text ? performance.now() : 0; },
    addStamp, radarPulse() { radarPulseT = 0; },
    setRadarZoom(i) { radarZoom = ((i | 0) % 3 + 3) % 3; try { localStorage.setItem('angelsZero_radarZoom', String(radarZoom)); } catch (e) { /* storage unavailable */ } return RADAR_ZOOM_TAG[radarZoom]; },
    get radarZoom() { return radarZoom; },
    get radarPulseT() { return radarPulseT; }
  };
}
