// ANGELS ZERO — 3D first-person F-22A Raptor all-glass cockpit.
// Geometry is authored in Blender by scripts/build_f22_cockpit.py and shipped as
// assets/f22_cockpit.glb: faceted stealth shroud with hood wings, ICP + 2 UFDs,
// 8x8 in PMFD flanked by two 6.25 in SMFDs with real OSB rows, a fourth SMFD on the
// centre pedestal, diamond-plate canopy sills, detailed side consoles, ACES II seat,
// right-hand side-stick, left-hand twin throttles and the striped gear handle.
// Static parts carry a baked ambient-occlusion atlas (baseColorTexture) tinted by
// material extras.ckp_rgb. This module paints the 6 live canvas displays onto the
// GLB's Screen_* quads, animates Stick_Gimbal / Throttle_L/R / Gear_Handle, and
// keeps the frameless gold canopy and the HUD combiner glass procedural (the HUD
// draws through glassOutlineWorld()).

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const COCKPIT_GLB = 'assets/f22_cockpit.glb?v=c1';

export function createCockpitF22(THREE, env) {
  const { scene, camera, sunLight, state: S, combat: C } = env;
  const D2R = Math.PI / 180;
  const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
  const FONT = "'Share Tech Mono', 'Consolas', monospace";
  const PITCH_BASE = -15 * D2R;
  const MFD_PAGES = ['TACTICAL SITUATION', 'AESA ATTACK', 'ALR-94 DEFENSE'];
  const F22_PLANFORM = [
    [0, -1], [0.06, -0.78], [0.13, -0.52], [0.17, -0.32],
    [0.92, 0.24], [0.92, 0.44], [0.54, 0.48], [0.35, 0.56],
    [0.64, 0.80], [0.64, 0.94], [0.22, 0.88], [0.16, 0.98], [0.05, 0.98]
  ];
  // Must match HUD_ANCHOR / HUD_TILT in scripts/build_f22_cockpit.py.
  const HUD_ANCHOR = new THREE.Vector3(0, -0.118, -0.785), HUD_TILT = 20 * D2R;

  let mfdPage = 0, mfdDirty = false;

  const rig = new THREE.Group();
  rig.visible = false;
  scene.add(rig);
  const add = (mesh, parent = rig) => { mesh.castShadow = false; mesh.receiveShadow = false; parent.add(mesh); return mesh; };

  /* =================================================================
     1. PROCEDURAL GLASS: FRAMELESS GOLD CANOPY + HUD COMBINER
     ================================================================= */
  const matGoldGlass = new THREE.MeshPhysicalMaterial({
    color: 0xc99c46, metalness: 0.12, roughness: 0.08, transparent: true, opacity: 0.10,
    side: THREE.DoubleSide, depthWrite: false
  });
  const matHudGlass = new THREE.MeshPhysicalMaterial({
    color: 0x76e8b8, emissive: 0x0b3324, emissiveIntensity: 0.35,
    metalness: 0.05, roughness: 0.05, transparent: true, opacity: 0.20,
    side: THREE.DoubleSide, depthWrite: false
  });

  const canopyArch = new THREE.CylinderGeometry(0.44, 0.44, 0.96, 32, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
  canopyArch.rotateX(Math.PI / 2);
  const archMesh = add(new THREE.Mesh(canopyArch, matGoldGlass));
  archMesh.position.set(0, -0.06, -0.14);
  archMesh.renderOrder = 6;

  const hudG = new THREE.Group();
  hudG.position.copy(HUD_ANCHOR);
  rig.add(hudG);
  const hudShape = new THREE.Shape();
  hudShape.moveTo(-0.115, -0.065);
  hudShape.lineTo(0.115, -0.065);
  hudShape.lineTo(0.108, 0.065);
  hudShape.quadraticCurveTo(0.0, 0.105, -0.108, 0.065);
  hudShape.closePath();
  const hudGlassGeo = new THREE.ExtrudeGeometry(hudShape, {
    depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 16
  });
  hudGlassGeo.center();
  const hudGlass = add(new THREE.Mesh(hudGlassGeo, matHudGlass), hudG);
  hudGlass.position.set(0, 0.075, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), HUD_TILT);
  hudGlass.rotation.x = HUD_TILT;
  hudGlass.renderOrder = 5;
  hudGlass.updateMatrix();

  // glassOutline (73 points, rig space) for glassOutlineWorld()
  const glassOutline = [];
  for (let i = 0; i < 73; i++) {
    const u = i / 72;
    let lx, ly;
    if (u < 0.3) {
      const t = u / 0.3; lx = -0.11; ly = THREE.MathUtils.lerp(-0.065, 0.065, t);
    } else if (u < 0.7) {
      const t = (u - 0.3) / 0.4;
      lx = THREE.MathUtils.lerp(-0.11, 0.11, t);
      ly = 0.065 + Math.sin(t * Math.PI) * 0.022;
    } else {
      const t = (u - 0.7) / 0.3; lx = 0.11; ly = THREE.MathUtils.lerp(0.065, -0.065, t);
    }
    const v = new THREE.Vector3(lx, ly, 0).applyMatrix4(hudGlass.matrix);
    glassOutline.push(v.add(hudG.position));
  }
  const glassOutlineW = glassOutline.map(p => p.clone());

  /* =================================================================
     2. LIVE CANVAS DISPLAYS (bound to the GLB's Screen_* quads)
     ================================================================= */
  function makeScreen(px, py) {
    const cv = document.createElement('canvas'); cv.width = px; cv.height = py;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.flipY = false;   // glTF UVs are top-left origin (the exporter flips V)
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.color.setScalar(1.4);   // HDR lift: white text / bright symbology crosses the 0.88 bloom knee, dark glass stays dark
    return { cv, ctx, tex, mat };
  }
  // UFDs are 84 x 66 mm landscape panes; the canvases keep that aspect.
  const ufdL = makeScreen(256, 200), ufdR = makeScreen(256, 200);
  const pmfd = makeScreen(512, 512);
  const smfdL = makeScreen(384, 384), smfdR = makeScreen(384, 384), smfdC = makeScreen(384, 384);
  const SCREENS = { Screen_PMFD: pmfd, Screen_SMFD_L: smfdL, Screen_SMFD_R: smfdR, Screen_SMFD_C: smfdC, Screen_UFD_L: ufdL, Screen_UFD_R: ufdR };

  /* =================================================================
     3. BLENDER COCKPIT GLB
     ================================================================= */
  // Diamond-plate tread normal map for the canopy sills (alternating 45 deg lugs).
  const diamondNormal = (() => {
    const N = 128, CELL = 32, H = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      const lx = x - cx * CELL - CELL / 2 + 0.5, ly = y - cy * CELL - CELL / 2 + 0.5;
      const sgn = (cx + cy) % 2 ? 1 : -1;
      const a = (lx + sgn * ly) / Math.SQRT2, b = (lx - sgn * ly) / Math.SQRT2;
      const ea = 1 - smooth(Math.abs(a), 9, 12), eb = 1 - smooth(Math.abs(b), 1.6, 3.2);
      H[y * N + x] = ea * eb;
    }
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x2 = c.getContext('2d', { willReadFrequently: true }), img = x2.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4;
      const nx = (H[y * N + ((x - 1 + N) % N)] - H[y * N + ((x + 1) % N)]) * 2.2;
      const ny = (H[((y - 1 + N) % N) * N + x] - H[((y + 1) % N) * N + x]) * 2.2;
      const inv = 1 / Math.hypot(nx, ny, 1);
      img.data[k] = (nx * inv * 0.5 + 0.5) * 255; img.data[k + 1] = (ny * inv * 0.5 + 0.5) * 255;
      img.data[k + 2] = (inv * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    x2.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
    return t;
  })();

  let matShroud = new THREE.MeshStandardMaterial();   // replaced by the GLB shroud material on load
  let gimbal = null, gearHandle = null, gearKnobMat = null, ready = false;
  const throttles = [];

  new GLTFLoader().load(COCKPIT_GLB, gltf => {
    const root = gltf.scene;
    let uvPerM = 1;
    root.traverse(o => { if (o.userData && o.userData.uv_per_m) uvPerM = o.userData.uv_per_m; });
    const tuned = new Set();
    root.traverse(o => {
      if (o.name === 'Stick_Gimbal') gimbal = o;
      else if (o.name === 'Gear_Handle') gearHandle = o;
      else if (o.name === 'Throttle_L') throttles[0] = { pivot: o, angle: 0 };
      else if (o.name === 'Throttle_R') throttles[1] = { pivot: o, angle: 0 };
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      // Screen quads are single primitives named after their node; the glTF mesh
      // may sit one level below the node, so check the parent name too.
      const scr = SCREENS[o.name] || (o.parent && SCREENS[o.parent.name]);
      if (scr) { o.material = scr.mat; return; }
      const m = o.material;
      if (!m || tuned.has(m)) return;
      tuned.add(m);
      if (m.userData && m.userData.ckp_rgb) m.color.set(m.userData.ckp_rgb);
      if (/^ckp_shroud/.test(m.name)) matShroud = m;
      if (/^ckp_sill/.test(m.name)) {
        m.normalMap = diamondNormal;
        m.normalScale.set(0.9, 0.9);
        const rep = 1 / (uvPerM * 0.064);   // one 128 px tile = 64 mm of tread
        diamondNormal.repeat.set(rep, rep);
      }
      if (m.name === 'ckp_gearknob') {
        gearKnobMat = m.clone();
        gearKnobMat.emissive.set(0xff3b2f); gearKnobMat.emissiveIntensity = 0;
        o.material = gearKnobMat;
      }
      m.needsUpdate = true;
    });
    rig.add(root);
    rig.updateMatrixWorld(true);
    ready = true;
    mfdDirty = true;
  }, undefined, err => console.error('[ANGELS_ZERO] F-22 cockpit GLB failed', err));

  /* =================================================================
     4. LIVE DISPLAY PAINTING (6 FULL-COLOR SCREENS)
     ================================================================= */
  const gaugeStats = { dials: 0, mfd: { page: 0, uploads: 0 } };
  let nvgMode = false;

  function paintUfdLeft() {
    const ctx = ufdL.ctx, W = 256, H = 200;
    ctx.fillStyle = '#030b14'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1b5e8a'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.font = `bold 17px ${FONT}`; ctx.textBaseline = 'top';
    ctx.fillStyle = '#5eead4'; ctx.fillText('ICAW // CNI', 14, 10);
    ctx.fillStyle = '#7dd3fc';
    const fuelPct = Math.round((S.fuel / 13455) * 100);
    ctx.fillText(`FUEL  ${fuelPct}%`, 14, 38);
    ctx.fillText(`MACH  ${(S.mach || 0).toFixed(2)}`, 14, 60);
    ctx.fillText(`UHF1  220.00`, 14, 82);
    const superC = !S.afterburner && (S.mach || 0) >= 1.0;
    ctx.fillStyle = superC ? '#4ade80' : S.afterburner > 0.2 ? '#fbbf24' : '#38bdf8';
    ctx.fillText(superC ? 'SUPERCRUISE' : S.afterburner > 0.2 ? 'AFTERBURNER' : 'MIL CRUISE', 14, 108);
    if (C.mcfg && C.mcfg.freeFlight) {
      ctx.fillStyle = '#5eead4'; ctx.fillText('FREE FLIGHT', 14, 136);
    } else if (C.incoming > 0 || C.missileWarning > 0.3) {
      ctx.fillStyle = '#ff4444'; ctx.fillText('! MISSILE !', 14, 136);
    } else if (S.gLoad > 8) {
      ctx.fillStyle = '#fbbf24'; ctx.fillText('OVER-G WARN', 14, 136);
    } else {
      ctx.fillStyle = '#4ade80'; ctx.fillText('SYS NORMAL', 14, 136);
    }
    ctx.fillStyle = '#94a3b8'; ctx.font = `14px ${FONT}`;
    ctx.fillText(`FLR ${C.flares || 0}  CHF ${C.chaff || 0}`, 14, 168);
    ufdL.tex.needsUpdate = true;
  }

  function paintUfdRight() {
    const ctx = ufdR.ctx, W = 256, H = 200, cx = W / 2, cy = H / 2;
    ctx.fillStyle = '#030b14'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(8, 8, W - 16, H - 16); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-S.bank);
    const py = clamp(S.pitch / (45 * D2R), -1.2, 1.2) * 70;
    ctx.fillStyle = '#0e4a7a'; ctx.fillRect(-240, -240 + py, 480, 240);
    ctx.fillStyle = '#4a3118'; ctx.fillRect(-240, py, 480, 240);
    ctx.strokeStyle = '#e2f1ff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-220, py); ctx.lineTo(220, py); ctx.stroke();
    ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 1.5;
    for (const deg of [-20, -10, 10, 20]) {
      const yy = py - (deg / 45) * 70;
      ctx.beginPath(); ctx.moveTo(-36, yy); ctx.lineTo(36, yy); ctx.stroke();
    }
    ctx.restore();
    // Fixed aircraft datum
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 26, cy); ctx.lineTo(cx - 8, cy); ctx.lineTo(cx, cy + 8);
    ctx.lineTo(cx + 8, cy); ctx.lineTo(cx + 26, cy); ctx.stroke();
    ctx.font = `bold 18px ${FONT}`; ctx.fillStyle = '#4ade80'; ctx.textBaseline = 'top';
    ctx.fillText(`${Math.round(S.speed * 1.94384)}`, 14, 14);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(S.position.y * 3.28084)}`, W - 14, 14);
    ctx.textAlign = 'left';
    ufdR.tex.needsUpdate = true;
  }

  function paintCenterTSD(now) {
    const ctx = pmfd.ctx, W = 512, H = 512, cx = W / 2, cy = H * 0.56;
    ctx.fillStyle = '#020810'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    for (const r of [68, 136, 204]) {
      ctx.strokeStyle = r === 136 ? '#38bdf8' : '#1e40af';
      ctx.lineWidth = r === 136 ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#7dd3fc'; ctx.textBaseline = 'top';
    const hdg = Math.round(((S.heading || 0) % 360 + 360) % 360);
    ctx.fillText(`TSD  HDG ${String(hdg).padStart(3, '0')}`, 18, 16);
    ctx.textAlign = 'right'; ctx.fillStyle = '#4ade80';
    ctx.fillText(MFD_PAGES[mfdPage], W - 18, 16);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx - 10, cy + 10); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx + 10, cy + 10); ctx.closePath(); ctx.stroke();

    const hRad = ((S.heading || 0) * D2R);
    const cosH = Math.cos(hRad), sinH = Math.sin(hRad);
    const scale = 204 / 25000;
    const enemies = env.getEnemies ? env.getEnemies() : [];
    for (const e of enemies) {
      if (!e || !e.alive) continue;
      const dx = e.pos.x - S.position.x, dz = e.pos.z - S.position.z;
      const rx = (dx * cosH + dz * sinH) * scale;
      const ry = (-dx * sinH + dz * cosH) * scale;
      const px = cx + rx, py = cy + ry;
      if (Math.hypot(rx, ry) > 215) continue;
      ctx.strokeStyle = e === C.designated ? '#fde047' : '#ef4444'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(px, py - 9); ctx.lineTo(px + 8, py + 7); ctx.lineTo(px - 8, py + 7); ctx.closePath(); ctx.stroke();
    }
    const wing = env.getWingmen ? env.getWingmen() : [];
    for (const w of wing) {
      if (!w || !w.alive) continue;
      const dx = w.pos.x - S.position.x, dz = w.pos.z - S.position.z;
      const px = cx + (dx * cosH + dz * sinH) * scale;
      const py = cy + (-dx * sinH + dz * cosH) * scale;
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
    }
    pmfd.tex.needsUpdate = true;
  }

  function paintLeftRadar(now) {
    const ctx = smfdL.ctx, W = 384, H = 384, cx = W / 2, cy = H * 0.56;
    ctx.fillStyle = '#020810'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    for (const r of [52, 104, 156]) {
      ctx.strokeStyle = r === 104 ? '#38bdf8' : '#1e40af';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    const ang = -Math.PI / 2 + Math.sin(now * 2.2) * 0.85;
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * 156, cy + Math.sin(ang) * 156); ctx.stroke();
    ctx.font = `bold 18px ${FONT}`; ctx.fillStyle = '#7dd3fc'; ctx.textBaseline = 'top';
    ctx.fillText('APG-77 AESA', 14, 14);
    ctx.fillStyle = C.lockState === 'LOCK' ? '#4ade80' : '#94a3b8';
    ctx.fillText(C.lockState || 'SEARCH', 14, 38);
    smfdL.tex.needsUpdate = true;
  }

  function paintRightDefense() {
    const ctx = smfdR.ctx, W = 384, H = 384, cx = W / 2, cy = H * 0.62;
    ctx.fillStyle = '#020810'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    for (const r of [46, 92, 134]) {
      ctx.strokeStyle = r === 92 ? '#38bdf8' : '#1e40af';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    for (const r of (C.rwr || [])) {
      const dist = r.kind === 'msl' ? 42 : r.kind === 'lock' ? 78 : 112;
      const px = cx + Math.sin(r.b) * dist, py = cy - Math.cos(r.b) * dist;
      ctx.strokeStyle = r.kind === 'msl' ? '#ff4444' : r.kind === 'lock' ? '#fbbf24' : '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px + 8, py); ctx.lineTo(px, py + 8); ctx.lineTo(px - 8, py); ctx.closePath(); ctx.stroke();
    }
    const chf = clamp((C.chaff || 0) / Math.max(1, C.chaffMax || 8), 0, 1);
    ctx.strokeStyle = '#38bdf8'; ctx.strokeRect(W - 34, 120, 14, 180);
    ctx.fillStyle = '#4ade80'; ctx.fillRect(W - 32, 122 + (1 - chf) * 176, 10, chf * 176);
    ctx.font = `bold 18px ${FONT}`; ctx.fillStyle = '#7dd3fc'; ctx.textBaseline = 'top';
    ctx.fillText('ALR-94 EW', 14, 14);
    ctx.fillStyle = C.ecmState === 'ACTIVE' ? '#4ade80' : '#94a3b8';
    ctx.fillText(`ECM: ${C.ecmState || 'RDY'}`, 14, 38);
    smfdR.tex.needsUpdate = true;
  }

  function paintBottomStores() {
    const ctx = smfdC.ctx, W = 384, H = 384, cx = W / 2, cy = H * 0.56;
    ctx.fillStyle = '#020810'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    const rpm = Math.round(28 + (S.throttle || 0) * 72 + (S.afterburner || 0) * 8);
    for (const [dx, lbl] of [[-78, 'L F119'], [78, 'R F119']]) {
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx + dx, 62, 32, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * clamp(rpm / 108, 0, 1))); ctx.stroke();
      ctx.font = `bold 16px ${FONT}`; ctx.fillStyle = '#e2f1ff'; ctx.textAlign = 'center';
      ctx.fillText(`${rpm}%`, cx + dx, 55);
      ctx.font = `12px ${FONT}`; ctx.fillStyle = '#7dd3fc'; ctx.fillText(lbl, cx + dx, 102);
    }
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < F22_PLANFORM.length; i++) {
      const [px, py] = F22_PLANFORM[i];
      if (i === 0) ctx.moveTo(cx + px * 95, cy + py * 95);
      else ctx.lineTo(cx + px * 95, cy + py * 95);
    }
    for (let i = F22_PLANFORM.length - 1; i >= 0; i--) {
      const [px, py] = F22_PLANFORM[i];
      ctx.lineTo(cx - px * 95, cy + py * 95);
    }
    ctx.closePath(); ctx.stroke();

    ctx.font = `bold 20px ${FONT}`; ctx.textAlign = 'center';
    if (C.mcfg && C.mcfg.freeFlight) {
      ctx.fillStyle = '#5eead4'; ctx.fillText('UNARMED', cx, H - 46);
    } else {
      ctx.fillStyle = '#4ade80';
      ctx.fillText(`GUN ${C.ammo || 0}  MSL ${C.missiles || 0}  SPW ${C.weapon === 'AAM4' ? (C.aam4 || 0) : C.weapon === 'QAAM' ? (C.qaam || 0) : (C.bombs || 0)}`, cx, H - 46);
    }
    ctx.textAlign = 'left';
    smfdC.tex.needsUpdate = true;
  }

  /* =================================================================
     5. CAMERA RIG + HOTAS ANIMATION
     ================================================================= */
  const head = { yaw: 0, roll: 0, pitch: 0, look: 0, lookYaw: 0, off: new THREE.Vector3() };
  const MAX_ROLL_LAG = 11 * D2R, LOOK_PITCH = 14 * D2R, LOOK_YAW = 12 * D2R;
  const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _offT = new THREE.Vector3(), _lean = new THREE.Vector3();
  const hotas = { pitch: 0, roll: 0, trig: 0, pickle: 0, thr: 0 };
  let active = false, frame = 0, freeLook = null, glareT = 0, glareK = 0;

  function setFreeLook(v) { freeLook = v; }
  function setNVG(on) { nvgMode = !!on; }
  function missionClock() { return '00:00'; }
  function setActive(on) {
    active = on; rig.visible = on; sunLight.castShadow = false;
    if (!on) { glareT = 0; glareK = 0; matShroud.emissiveIntensity = 0; }
  }

  function update(dt, now, eyeWorld, jetQuat) {
    if (glareT > 0) {
      glareT = Math.max(0, glareT - dt);
      matShroud.emissiveIntensity = glareK * 1.4 * (glareT / 0.08);
      if (glareT <= 0) matShroud.emissiveIntensity = 0;
    }
    if (!active) return;
    frame++;
    rig.position.copy(eyeWorld); rig.quaternion.copy(jetQuat); rig.updateMatrixWorld(true);
    const ex = k => Math.min(1, k * dt);

    const rollGain = S.barrelRoll ? 0.09 : 0.14;
    const tRoll = clamp(-S.rollRate * rollGain, -MAX_ROLL_LAG, MAX_ROLL_LAG);
    head.roll += (tRoll - head.roll) * ex(S.barrelRoll ? 5.5 : 8.5);

    const bankAbs = Math.abs(S.bank), pull = clamp(S.pitchRate / 1.2, 0, 1);
    const lookK = smooth(bankAbs, 15 * D2R, 60 * D2R) * pull;
    head.look += (lookK * LOOK_PITCH - head.look) * ex(3.5);
    head.lookYaw += (Math.sign(S.bank) * lookK * LOOK_YAW - head.lookYaw) * ex(3.5);
    head.pitch += (clamp(-(S.gLoad - 1) * 0.004 - S.pitchRate * 0.02, -0.05, 0.03) - head.pitch) * ex(9);
    head.yaw += (clamp(-S.yawRate * 0.05, -0.04, 0.04) - head.yaw) * ex(9);

    const airbrake = S.throttle < 0.12 && S.afterburner < 0.05 ? 1 : 0;
    _offT.set(
      clamp(S.rollRate * 0.026 + S.yawRate * 0.05, -0.09, 0.09),
      -0.07 * smooth(S.gLoad, 1.2, 9),
      0.05 * S.afterburner - 0.05 * airbrake
    );
    head.off.lerp(_offT, ex(6));

    const fy = freeLook ? freeLook.yaw : 0, fpch = freeLook ? freeLook.pitch : 0, lean = freeLook ? freeLook.lean : 0;
    _lean.set(-0.12 * lean, 0.02 * Math.abs(lean), -0.08 * Math.abs(lean));
    const vib = 0.0012 * (S.afterburner * 0.6 + smooth(S.gLoad, 5, 12) + smooth(S.mach, 0.92, 1.05) * 0.5);
    _e.set(PITCH_BASE + head.look + head.pitch + fpch + (Math.random() - 0.5) * vib,
      head.lookYaw + head.yaw + fy + (Math.random() - 0.5) * vib,
      head.roll);
    _q.setFromEuler(_e);
    camera.position.copy(head.off).add(_lean).applyQuaternion(jetQuat).add(eyeWorld);
    camera.quaternion.copy(jetQuat).multiply(_q);

    // Side-stick (x = pull aft, z = roll), throttles (forward = more thrust), gear lever
    const k = Math.min(1, 14 * dt);
    const tp = clamp((S.ctl && S.ctl.pitch) || 0, -1, 1) * 14 * D2R;
    const tr = clamp((S.ctl && S.ctl.roll) || 0, -1, 1) * 16 * D2R;
    hotas.pitch += (tp - hotas.pitch) * k; hotas.roll += (tr - hotas.roll) * k;
    const thrAng = THREE.MathUtils.lerp(18 * D2R, -26 * D2R, clamp(S.throttle + S.afterburner * 0.25, 0, 1.2) / 1.2);
    hotas.thr += (thrAng - hotas.thr) * k;
    if (ready) {
      if (gimbal) { gimbal.rotation.x = hotas.pitch; gimbal.rotation.z = -hotas.roll; }
      for (const t of throttles) if (t) { t.angle = hotas.thr; t.pivot.rotation.x = t.angle; }
      if (gearHandle) gearHandle.rotation.x += ((S.gearDown ? 0.55 : -0.45) - gearHandle.rotation.x) * 0.25;
      if (gearKnobMat) { const gp = S.gear || 0; gearKnobMat.emissiveIntensity = gp > 0.01 && gp < 0.99 ? 2.4 : 0; }
    }

    if (frame % 3 === 1 || mfdDirty) {
      mfdDirty = false;
      paintUfdLeft(); paintUfdRight(); paintCenterTSD(now);
      paintLeftRadar(now); paintRightDefense(); paintBottomStores();
      gaugeStats.dials += 6; gaugeStats.mfd.uploads += 4;
    }
  }

  return {
    rig, setActive, update, missionClock, setNVG, setFreeLook,
    flash(kind) {
      matShroud.emissive.setHex(kind === 'GUN' ? 0xffd9a0 : 0xfff4e0);
      glareT = 0.08; glareK = kind === 'GUN' ? 0.55 : 0.85;
    },
    setMfdPage(p) { mfdPage = ((p % 3) + 3) % 3; mfdDirty = true; gaugeStats.mfd.page = mfdPage; },
    get active() { return active; },
    get ready() { return ready; },
    get glare() { return { k: glareK, t: glareT, intensity: matShroud.emissiveIntensity }; },
    get gaugeStats() { return gaugeStats; },
    get hotas() {
      return { pitch: +(hotas.pitch / D2R).toFixed(1), roll: +(hotas.roll / D2R).toFixed(1), trig: +hotas.trig.toFixed(2), pickle: +hotas.pickle.toFixed(2),
        thrL: +(hotas.thr / D2R).toFixed(1), thrR: +(hotas.thr / D2R).toFixed(1) };
    },
    glassOutlineWorld() { for (let i = 0; i < glassOutline.length; i++) glassOutlineW[i].copy(glassOutline[i]).applyMatrix4(rig.matrixWorld); return glassOutlineW; },
    get head() {
      return { roll: +(head.roll / D2R).toFixed(1), lookPitch: +(head.look / D2R).toFixed(1), lookYaw: +(head.lookYaw / D2R).toFixed(1),
        off: head.off.toArray().map(v => +v.toFixed(3)) };
    }
  };
}
