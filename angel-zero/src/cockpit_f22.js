// ANGELS ZERO — 3D first-person F-22A Raptor all-glass cockpit.
// Frameless gold-tinted bubble canopy (no front bow), swept beveled stealth
// instrument shroud, wide-angle curved HUD combiner, ICP + 2 UFDs (ICAW/CNI &
// synthetic backup ADI) + 4 live color MFDs (8"x8" center TSD, left AESA radar,
// right ALR-94 RWR/EW, lower tilted F-22A stores & F119 engine display), right-hand
// side-stick with ribbed LatheGeometry boot, and left-hand twin throttles.

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createCockpitF22(THREE, env) {
  const { scene, camera, sunLight, state: S, combat: C } = env;
  const D2R = Math.PI / 180;
  const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
  const FONT = "'Share Tech Mono', 'Consolas', monospace";
  const STENCIL = "'Arial Narrow', 'Arial', sans-serif";
  const PITCH_BASE = -15 * D2R;
  const MFD_PAGES = ['TACTICAL SITUATION', 'AESA ATTACK', 'ALR-94 DEFENSE'];
  const F22_PLANFORM = [
    [0, -1], [0.06, -0.78], [0.13, -0.52], [0.17, -0.32],
    [0.92, 0.24], [0.92, 0.44], [0.54, 0.48], [0.35, 0.56],
    [0.64, 0.80], [0.64, 0.94], [0.22, 0.88], [0.16, 0.98], [0.05, 0.98]
  ];

  let mfdPage = 0, mfdDirty = false, mfdSig = '', mfdFlash = -1;

  const rig = new THREE.Group();
  rig.visible = false;
  scene.add(rig);
  const add = (mesh, parent = rig) => { mesh.castShadow = false; mesh.receiveShadow = false; parent.add(mesh); return mesh; };

  function rng(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* =================================================================
     1. FINE MATTE STEALTH-COMPOSITE TEXTURE SET (512 x 512)
     ================================================================= */
  const compositeTex = (() => {
    const N = 512, r = rng(2202);
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); return { c, x, img: x.createImageData(N, N) }; };
    const col = mk(), nor = mk(), rou = mk();
    const H = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) H[i] = r() * 0.4 + 0.3;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x, k = i * 4, v = H[i];
        const tone = 0.92 + 0.14 * v;
        col.img.data[k] = 52 * tone; col.img.data[k + 1] = 56 * tone; col.img.data[k + 2] = 63 * tone; col.img.data[k + 3] = 255;
        const l = H[y * N + ((x - 1 + N) % N)], rr = H[y * N + ((x + 1) % N)];
        const u = H[((y - 1 + N) % N) * N + x], d = H[((y + 1) % N) * N + x];
        let nx = (l - rr) * 0.9, ny = (u - d) * 0.9, nz = 1;
        const inv = 1 / Math.hypot(nx, ny, nz);
        nor.img.data[k] = (nx * inv * 0.5 + 0.5) * 255; nor.img.data[k + 1] = (ny * inv * 0.5 + 0.5) * 255; nor.img.data[k + 2] = (nz * inv * 0.5 + 0.5) * 255; nor.img.data[k + 3] = 255;
        const rv = clamp(0.76 + 0.12 * (v - 0.5), 0, 1) * 255;
        rou.img.data[k] = rou.img.data[k + 1] = rou.img.data[k + 2] = rv; rou.img.data[k + 3] = 255;
      }
    }
    col.x.putImageData(col.img, 0, 0); nor.x.putImageData(nor.img, 0, 0); rou.x.putImageData(rou.img, 0, 0);
    const tex = (cv, srgb) => {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    return { map: tex(col.c, true), normalMap: tex(nor.c, false), roughnessMap: tex(rou.c, false) };
  })();

  const matStealth = new THREE.MeshStandardMaterial({
    color: 0x353b44, map: compositeTex.map, normalMap: compositeTex.normalMap, roughnessMap: compositeTex.roughnessMap,
    normalScale: new THREE.Vector2(0.35, 0.35), metalness: 0.22, roughness: 0.84
  });
  const matShroud = new THREE.MeshStandardMaterial({
    color: 0x24282f, normalMap: compositeTex.normalMap, normalScale: new THREE.Vector2(0.25, 0.25),
    metalness: 0.18, roughness: 0.88, emissive: 0x000000, emissiveIntensity: 0
  });
  const matBezel = new THREE.MeshStandardMaterial({ color: 0x272c35, metalness: 0.42, roughness: 0.52 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x16191e, metalness: 0.35, roughness: 0.65 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.82, roughness: 0.32 });
  const matButton = new THREE.MeshStandardMaterial({ color: 0x1e2229, metalness: 0.25, roughness: 0.48 });
  const matWhiteKey = new THREE.MeshStandardMaterial({ color: 0xcbd2da, metalness: 0.15, roughness: 0.45 });
  const matRedBtn = new THREE.MeshStandardMaterial({ color: 0xc6362c, metalness: 0.2, roughness: 0.45 });
  const matYellow = new THREE.MeshStandardMaterial({ color: 0xd9a826, metalness: 0.25, roughness: 0.5 });
  const matSeat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.05, roughness: 0.92 });
  const matGoldGlass = new THREE.MeshPhysicalMaterial({
    color: 0xc99c46, metalness: 0.12, roughness: 0.08, transparent: true, opacity: 0.10,
    side: THREE.DoubleSide, depthWrite: false
  });
  const matHudGlass = new THREE.MeshPhysicalMaterial({
    color: 0x76e8b8, emissive: 0x0b3324, emissiveIntensity: 0.35,
    metalness: 0.05, roughness: 0.05, transparent: true, opacity: 0.22,
    side: THREE.DoubleSide, depthWrite: false
  });

  function roundedRectShape(w, h, r) {
    const s = new THREE.Shape(), hw = w * 0.5, hh = h * 0.5, cr = Math.min(r, hw, hh);
    s.moveTo(-hw + cr, -hh);
    s.lineTo(hw - cr, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
    s.lineTo(hw, hh - cr); s.quadraticCurveTo(hw, hh, hw - cr, hh);
    s.lineTo(-hw + cr, hh); s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
    s.lineTo(-hw, -hh + cr); s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
    return s;
  }

  function beveledBox(w, h, d, r, bevel = 0.004, segs = 3) {
    const g = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
      depth: Math.max(0.002, d - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: segs,
      curveSegments: 8
    });
    g.center();
    return g;
  }

  /* =================================================================
     2. SCULPTED TUB, SWEPT CANOPY SILLS & FRAMELESS GOLD CANOPY
     ================================================================= */
  // Rounded floor & tub walls
  add(new THREE.Mesh(beveledBox(0.84, 0.06, 1.35, 0.12, 0.015, 3), matDark)).position.set(0, -0.58, -0.15);
  for (const sgn of [-1, 1]) {
    // Swept side console coamings
    const coam = add(new THREE.Mesh(beveledBox(0.24, 0.26, 1.15, 0.04, 0.012, 3), matStealth));
    coam.position.set(sgn * 0.36, -0.42, -0.12);

    // Sculpted canopy sill rails sitting low along the cockpit edges (unobstructed bubble canopy view)
    const sillCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sgn * 0.25, -0.17, -0.62),
      new THREE.Vector3(sgn * 0.37, -0.21, -0.44),
      new THREE.Vector3(sgn * 0.44, -0.23, -0.15),
      new THREE.Vector3(sgn * 0.44, -0.23, 0.24),
    ]);
    add(new THREE.Mesh(new THREE.TubeGeometry(sillCurve, 24, 0.020, 12, false), matShroud));

    // Canopy lock latch triangles on left & right sills
    const latch = add(new THREE.Mesh(beveledBox(0.026, 0.022, 0.030, 0.004, 0.002, 2), matBezel));
    latch.position.set(sgn * 0.38, -0.20, -0.44);
  }

  // Subtle frameless gold-tinted canopy arch far overhead (clear forward sightline)
  const canopyArch = new THREE.CylinderGeometry(0.44, 0.44, 0.96, 32, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
  canopyArch.rotateX(Math.PI / 2);
  const archMesh = add(new THREE.Mesh(canopyArch, matGoldGlass));
  archMesh.position.set(0, -0.06, -0.14);
  archMesh.renderOrder = 6;

  // ACES II seat & sculpted headrest bolsters behind the pilot
  add(new THREE.Mesh(beveledBox(0.42, 0.10, 0.44, 0.06, 0.018, 3), matSeat)).position.set(0, -0.48, 0.08);
  const seatBack = add(new THREE.Mesh(beveledBox(0.40, 0.62, 0.12, 0.06, 0.02, 3), matSeat));
  seatBack.position.set(0, -0.18, 0.27); seatBack.rotation.x = -0.16;
  const headRest = add(new THREE.Mesh(beveledBox(0.24, 0.20, 0.10, 0.05, 0.018, 3), matSeat));
  headRest.position.set(0, 0.16, 0.31); headRest.rotation.x = -0.12;

  /* =================================================================
     3. SWEPT TRAPEZOIDAL SHROUD + GLARE SHIELD + WIDE-ANGLE HUD
     ================================================================= */
  const panelG = new THREE.Group();
  panelG.position.set(0, -0.22, -0.58);
  panelG.rotation.x = -14 * D2R;
  rig.add(panelG);

  // Swept trapezoidal main instrument shroud (narrower at top around ICP/UFDs, flaring ~20 deg down)
  const shroudShape = new THREE.Shape();
  shroudShape.moveTo(-0.33, -0.175);
  shroudShape.lineTo(0.33, -0.175);
  shroudShape.quadraticCurveTo(0.35, -0.175, 0.34, -0.14);
  shroudShape.lineTo(0.245, 0.175);
  shroudShape.quadraticCurveTo(0.235, 0.205, 0.205, 0.205);
  shroudShape.lineTo(-0.205, 0.205);
  shroudShape.quadraticCurveTo(-0.235, 0.205, -0.245, 0.175);
  shroudShape.lineTo(-0.34, -0.14);
  shroudShape.quadraticCurveTo(-0.35, -0.175, -0.33, -0.175);
  const shroudGeo = new THREE.ExtrudeGeometry(shroudShape, {
    depth: 0.09, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 4, curveSegments: 10
  });
  shroudGeo.center();
  const shroudMesh = add(new THREE.Mesh(shroudGeo, matShroud), panelG);
  shroudMesh.position.set(0, 0.015, -0.045);

  // Curved anti-glare hood over top of the shroud
  const hoodCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.22, 0.195, -0.01),
    new THREE.Vector3(-0.12, 0.225, 0.015),
    new THREE.Vector3(0.0, 0.232, 0.02),
    new THREE.Vector3(0.12, 0.225, 0.015),
    new THREE.Vector3(0.22, 0.195, -0.01),
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(hoodCurve, 24, 0.018, 10, false), matShroud), panelG);

  // Wide-angle holographic HUD combiner on top of the glare shield
  const hudG = new THREE.Group();
  hudG.position.set(0, -0.01, -0.52);
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
  hudGlass.position.set(0, 0.068, 0);
  hudGlass.rotation.x = -34 * D2R;
  hudGlass.renderOrder = 5;

  // Slim chamfered side combiner brackets + recessed circular collimator lens
  for (const sgn of [-1, 1]) {
    const brk = add(new THREE.Mesh(beveledBox(0.012, 0.145, 0.022, 0.003, 0.002, 2), matDark), hudG);
    brk.position.set(sgn * 0.115, 0.065, 0); brk.rotation.x = -34 * D2R; brk.rotation.z = sgn * 0.04;
  }
  const colLens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.016, 24), matDark), hudG);
  colLens.position.set(0, -0.005, 0.01);

  // glassOutline (73 points) for glassOutlineWorld()
  const glassOutline = [];
  hudG.updateMatrixWorld(true);
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
     4. ICP + LIVE 6-SCREEN ALL-GLASS DISPLAYS
     ================================================================= */
  function makeLiveScreen(w, h, pxW, pxH, parent, x, y, z, tiltX = 0, withOSBs = true) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.x = tiltX;
    parent.add(g);

    const frameW = w + 0.028, frameH = h + 0.028;
    add(new THREE.Mesh(beveledBox(frameW, frameH, 0.016, 0.008, 0.003, 3), matBezel), g);
    add(new THREE.Mesh(beveledBox(w + 0.006, h + 0.006, 0.006, 0.004, 0.001, 2), matDark), g).position.z = 0.007;

    if (withOSBs) {
      const nBtn = 5;
      for (let i = 0; i < nBtn; i++) {
        const off = ((i - 2) / 5) * (w * 0.88);
        const offY = ((i - 2) / 5) * (h * 0.88);
        for (const sy of [-1, 1]) {
          const b = add(new THREE.Mesh(beveledBox(0.011, 0.007, 0.006, 0.002, 0.001, 1), matButton), g);
          b.position.set(off, sy * (h * 0.5 + 0.0085), 0.008);
        }
        for (const sx of [-1, 1]) {
          const b = add(new THREE.Mesh(beveledBox(0.007, 0.011, 0.006, 0.002, 0.001, 1), matButton), g);
          b.position.set(sx * (w * 0.5 + 0.0085), offY, 0.008);
        }
      }
    }

    const cv = document.createElement('canvas'); cv.width = pxW; cv.height = pxH;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const mesh = add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), g);
    mesh.position.z = 0.0105;
    return { g, cv, ctx, tex, mat };
  }

  // Top Center ICP (Integrated Control Panel — keypad + louver slots + thumbwheels)
  const icpG = new THREE.Group();
  icpG.position.set(0, 0.132, 0.012);
  panelG.add(icpG);
  add(new THREE.Mesh(beveledBox(0.146, 0.098, 0.022, 0.008, 0.004, 3), matBezel), icpG);
  // 4x3 keypad buttons on left/center
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const k = add(new THREE.Mesh(beveledBox(0.015, 0.013, 0.007, 0.002, 0.001, 2), matButton), icpG);
      k.position.set(-0.048 + c * 0.020, 0.026 - r * 0.017, 0.012);
    }
  }
  // 4 horizontal status/rocker bars on right side of ICP
  for (let r = 0; r < 4; r++) {
    const bar = add(new THREE.Mesh(beveledBox(0.044, 0.009, 0.006, 0.002, 0.001, 1), matDark), icpG);
    bar.position.set(0.028, 0.025 - r * 0.017, 0.012);
  }
  // Twin side thumbwheels on ICP
  for (const sgn of [-1, 1]) {
    const wh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 12), matMetal), icpG);
    wh.rotation.z = Math.PI / 2; wh.position.set(sgn * 0.068, 0.01, 0.010);
  }

  // 2 Up-Front Displays (UFDs) flanking the ICP
  const ufdL = makeLiveScreen(0.088, 0.072, 256, 256, panelG, -0.145, 0.125, 0.008, 0, false);
  const ufdR = makeLiveScreen(0.088, 0.072, 256, 256, panelG, 0.145, 0.125, 0.008, 0, false);

  // 3 Main Row MFDs: Large 8"x8" Center PMFD + Left & Right 6.25"x6.25" SMFDs
  const pmfd = makeLiveScreen(0.172, 0.172, 512, 512, panelG, 0, -0.045, 0.012, 0, true);
  const smfdL = makeLiveScreen(0.132, 0.132, 384, 384, panelG, -0.202, -0.052, 0.012, 0, true);
  const smfdR = makeLiveScreen(0.132, 0.132, 384, 384, panelG, 0.202, -0.052, 0.012, 0, true);

  // Lower Center Pedestal + Tilted 4th MFD (Stores / F119 Engine)
  const ped = add(new THREE.Mesh(beveledBox(0.195, 0.22, 0.11, 0.016, 0.01, 3), matShroud));
  ped.position.set(0, -0.45, -0.52); ped.rotation.x = -30 * D2R;
  const smfdC = makeLiveScreen(0.132, 0.132, 384, 384, rig, 0, -0.445, -0.465, -30 * D2R, true);

  /* =================================================================
     5. ERGONOMIC RIGHT-HAND SIDE-STICK & LEFT-HAND TWIN THROTTLES
     ================================================================= */
  // Right-hand side-stick console + ribbed LatheGeometry rubber boot
  const gimbal = new THREE.Group();
  gimbal.position.set(0.30, -0.37, -0.33);
  rig.add(gimbal);

  const bootPts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const r = 0.044 - 0.022 * t + 0.004 * Math.sin(t * Math.PI * 8);
    bootPts.push(new THREE.Vector2(r, t * 0.055));
  }
  add(new THREE.Mesh(new THREE.LatheGeometry(bootPts, 20), matDark), gimbal);

  // Contoured F-22 side-stick shaft + ergonomic head + castle hats
  const stickCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.045, 0),
    new THREE.Vector3(0, 0.095, -0.006),
    new THREE.Vector3(-0.004, 0.145, -0.015),
    new THREE.Vector3(-0.006, 0.175, -0.010),
  ]);
  add(new THREE.Mesh(new THREE.TubeGeometry(stickCurve, 14, 0.016, 12, false), matDark), gimbal);
  const stickHead = add(new THREE.Mesh(beveledBox(0.036, 0.042, 0.038, 0.010, 0.006, 3), matBezel), gimbal);
  stickHead.position.set(-0.006, 0.172, -0.008); stickHead.rotation.x = 0.25;
  // White/silver 4-way trim/TMS castle hats (distinctive in reference photo)
  const hat1 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.008, 0.007, 10), matWhiteKey), stickHead);
  hat1.rotation.x = Math.PI / 2; hat1.position.set(-0.006, 0.008, 0.020);
  const hat2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.007, 0.006, 10), matWhiteKey), stickHead);
  hat2.rotation.x = Math.PI / 2; hat2.position.set(0.008, -0.004, 0.019);
  const pickleBtn = add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.007, 10), matRedBtn), stickHead);
  pickleBtn.rotation.x = Math.PI / 2; pickleBtn.position.set(-0.010, -0.008, 0.019);

  // Left-hand twin F119 throttles on sloped quadrant
  add(new THREE.Mesh(beveledBox(0.11, 0.06, 0.20, 0.012, 0.006, 3), matDark)).position.set(-0.30, -0.38, -0.34);
  const throttles = [];
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.325 + i * 0.048, -0.36, -0.34);
    rig.add(pivot);
    const arm = add(new THREE.Mesh(beveledBox(0.014, 0.095, 0.022, 0.004, 0.002, 2), matMetal), pivot);
    arm.position.set(0, 0.045, 0);
    const grip = add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.020, 0.046, 14), matDark), pivot);
    grip.rotation.z = Math.PI / 2; grip.position.set(0, 0.095, -0.008);
    if (i === 1) {
      const thBtn = add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 8), matWhiteKey), grip);
      thBtn.position.set(0, 0.022, 0.005);
    }
    throttles.push({ pivot, angle: 0 });
  }

  // Left console gear panel (dark bezel with thin yellow hazard trim around slot)
  add(new THREE.Mesh(beveledBox(0.092, 0.078, 0.072, 0.008, 0.004, 2), matBezel)).position.set(-0.29, -0.255, -0.48);
  add(new THREE.Mesh(beveledBox(0.036, 0.056, 0.006, 0.004, 0.001, 2), matYellow)).position.set(-0.29, -0.25, -0.443);
  add(new THREE.Mesh(beveledBox(0.022, 0.046, 0.007, 0.003, 0.001, 2), matDark)).position.set(-0.29, -0.25, -0.441);
  const gearHandle = new THREE.Group();
  gearHandle.position.set(-0.29, -0.25, -0.44);
  rig.add(gearHandle);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.055, 8), matMetal), gearHandle).position.set(0, 0, 0.025);
  const gearKnobMat = new THREE.MeshStandardMaterial({ color: 0xe6ecf2, metalness: 0.2, roughness: 0.3, emissive: 0xff3b2f, emissiveIntensity: 0 });
  add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 10), gearKnobMat), gearHandle).position.set(0, 0, 0.052);

  // Side console rotary knobs & switches for non-blocky tactile detail
  for (const [kx, ky, kz] of [
    [0.34, -0.32, -0.46], [0.38, -0.32, -0.42], [0.35, -0.32, -0.38], [0.39, -0.32, -0.20], [0.35, -0.32, -0.16],
    [-0.35, -0.32, -0.46], [-0.39, -0.32, -0.42], [-0.36, -0.32, -0.20], [-0.39, -0.32, -0.15]
  ]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.014, 12), matMetal)).position.set(kx, ky, kz);
  }

  /* =================================================================
     6. LIVE DISPLAY PAINTING (6 FULL-COLOR SCREENS)
     ================================================================= */
  const gaugeStats = { dials: 0, mfd: { page: 0, uploads: 0 } };
  let nvgMode = false;

  function paintUfdLeft() {
    const ctx = ufdL.ctx, W = 256, H = 256;
    ctx.fillStyle = '#030b14'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1b5e8a'; ctx.lineWidth = 2; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.font = `bold 18px ${FONT}`; ctx.textBaseline = 'top';
    ctx.fillStyle = '#5eead4'; ctx.fillText('ICAW // CNI', 14, 12);
    ctx.fillStyle = '#7dd3fc';
    const fuelPct = Math.round((S.fuel / 13455) * 100);
    ctx.fillText(`FUEL  ${fuelPct}%`, 14, 48);
    ctx.fillText(`MACH  ${(S.mach || 0).toFixed(2)}`, 14, 76);
    ctx.fillText(`UHF1  220.00`, 14, 104);
    const superC = !S.afterburner && (S.mach || 0) >= 1.0;
    ctx.fillStyle = superC ? '#4ade80' : S.afterburner > 0.2 ? '#fbbf24' : '#38bdf8';
    ctx.fillText(superC ? 'SUPERCRUISE' : S.afterburner > 0.2 ? 'AFTERBURNER' : 'MIL CRUISE', 14, 138);
    if (C.mcfg && C.mcfg.freeFlight) {
      ctx.fillStyle = '#5eead4'; ctx.fillText('FREE FLIGHT', 14, 174);
    } else if (C.incoming > 0 || C.missileWarning > 0.3) {
      ctx.fillStyle = '#ff4444'; ctx.fillText('! MISSILE !', 14, 174);
    } else if (S.gLoad > 8) {
      ctx.fillStyle = '#fbbf24'; ctx.fillText('OVER-G WARN', 14, 174);
    } else {
      ctx.fillStyle = '#4ade80'; ctx.fillText('SYS NORMAL', 14, 174);
    }
    ctx.fillStyle = '#94a3b8'; ctx.font = `14px ${FONT}`;
    ctx.fillText(`FLR ${C.flares || 0}  CHF ${C.chaff || 0}`, 14, 214);
    ufdL.tex.needsUpdate = true;
  }

  function paintUfdRight() {
    const ctx = ufdR.ctx, W = 256, H = 256, cx = W / 2, cy = H / 2;
    ctx.fillStyle = '#030b14'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(8, 8, W - 16, H - 16); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-S.bank);
    const py = clamp(S.pitch / (45 * D2R), -1.2, 1.2) * 80;
    ctx.fillStyle = '#0e4a7a'; ctx.fillRect(-240, -240 + py, 480, 240);
    ctx.fillStyle = '#4a3118'; ctx.fillRect(-240, py, 480, 240);
    ctx.strokeStyle = '#e2f1ff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-220, py); ctx.lineTo(220, py); ctx.stroke();
    ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 1.5;
    for (const deg of [-20, -10, 10, 20]) {
      const yy = py - (deg / 45) * 80;
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
    // Concentric blue/cyan TSD range rings (matching reference photo)
    for (const r of [68, 136, 204]) {
      ctx.strokeStyle = r === 136 ? '#38bdf8' : '#1e40af';
      ctx.lineWidth = r === 136 ? 2.5 : 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    // Heading & range labels
    ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#7dd3fc'; ctx.textBaseline = 'top';
    const hdg = Math.round(((S.heading || 0) % 360 + 360) % 360);
    ctx.fillText(`TSD  HDG ${String(hdg).padStart(3, '0')}`, 18, 16);
    ctx.textAlign = 'right'; ctx.fillStyle = '#4ade80';
    ctx.fillText(MFD_PAGES[mfdPage], W - 18, 16);
    ctx.textAlign = 'left';

    // Ownship symbol
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx - 10, cy + 10); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx + 10, cy + 10); ctx.closePath(); ctx.stroke();

    // Fused bandits + wingmen in heading-up space
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
    // Sweeping AESA beam
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
    // Vertical CM gauge on right (matching reference photo)
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
    // Twin F119 RPM dials at top (matching reference photo)
    const rpm = Math.round(28 + (S.throttle || 0) * 72 + (S.afterburner || 0) * 8);
    for (const [dx, lbl] of [[-78, 'L F119'], [78, 'R F119']]) {
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx + dx, 62, 32, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * clamp(rpm / 108, 0, 1))); ctx.stroke();
      ctx.font = `bold 16px ${FONT}`; ctx.fillStyle = '#e2f1ff'; ctx.textAlign = 'center';
      ctx.fillText(`${rpm}%`, cx + dx, 55);
      ctx.font = `12px ${FONT}`; ctx.fillStyle = '#7dd3fc'; ctx.fillText(lbl, cx + dx, 102);
    }
    ctx.textAlign = 'left';
    // Green F-22A planform silhouette
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
     7. CAMERA RIG + HOTAS ANIMATION + MERGED STATIC GEOMETRY
     ================================================================= */
  const head = { yaw: 0, roll: 0, pitch: 0, look: 0, lookYaw: 0, off: new THREE.Vector3() };
  const MAX_ROLL_LAG = 11 * D2R, LOOK_PITCH = 14 * D2R, LOOK_YAW = 12 * D2R;
  const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _offT = new THREE.Vector3(), _lean = new THREE.Vector3();
  const hotas = { pitch: 0, roll: 0, trig: 0, pickle: 0 };
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

    // Animate right-hand side-stick, twin throttles & gear handle
    const k = Math.min(1, 14 * dt);
    const tp = clamp((S.ctl && S.ctl.pitch) || 0, -1, 1) * 14 * D2R;
    const tr = clamp((S.ctl && S.ctl.roll) || 0, -1, 1) * 16 * D2R;
    hotas.pitch += (tp - hotas.pitch) * k; hotas.roll += (tr - hotas.roll) * k;
    gimbal.rotation.x = hotas.pitch; gimbal.rotation.z = -hotas.roll;
    for (let i = 0; i < 2; i++) {
      const ang = THREE.MathUtils.lerp(-22 * D2R, 34 * D2R, clamp(S.throttle + S.afterburner * 0.25, 0, 1.2) / 1.2);
      throttles[i].angle += (ang - throttles[i].angle) * k;
      throttles[i].pivot.rotation.x = throttles[i].angle;
    }
    const gp = S.gear || 0;
    gearHandle.rotation.x += ((S.gearDown ? 0.55 : -0.45) - gearHandle.rotation.x) * 0.25;
    gearKnobMat.emissiveIntensity = gp > 0.01 && gp < 0.99 ? 2.4 : 0;

    if (frame % 3 === 1 || mfdDirty) {
      mfdDirty = false;
      paintUfdLeft(); paintUfdRight(); paintCenterTSD(now);
      paintLeftRadar(now); paintRightDefense(); paintBottomStores();
      gaugeStats.dials += 6; gaugeStats.mfd.uploads += 4;
    }
  }

  // Merge static cockpit meshes by material + renderOrder, keeping animated HOTAS/gear intact
  {
    const dynamicRoots = new Set([gearHandle, gimbal, ...throttles.map(t => t.pivot)]);
    rig.updateMatrixWorld(true);
    const invRig = rig.matrixWorld.clone().invert(), m4 = new THREE.Matrix4();
    const groups = new Map();
    const isDynamic = o => {
      for (let p = o; p && p !== rig; p = p.parent) if (dynamicRoots.has(p)) return true;
      return false;
    };
    rig.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || isDynamic(o)) return;
      if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      let byOrder = groups.get(o.material);
      if (!byOrder) { byOrder = new Map(); groups.set(o.material, byOrder); }
      let list = byOrder.get(o.renderOrder);
      if (!list) { list = []; byOrder.set(o.renderOrder, list); }
      list.push(o);
    });
    for (const [mat, byOrder] of groups) {
      for (const [order, list] of byOrder) {
        if (list.length < 2) continue;
        const geos = [];
        for (const o of list) {
          const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
          if (!g.attributes.normal) g.computeVertexNormals();
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          g.applyMatrix4(m4.multiplyMatrices(invRig, o.matrixWorld));
          g.clearGroups();
          geos.push(g);
        }
        const merged = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
        if (!merged) continue;
        for (const o of list) o.parent && o.parent.remove(o);
        const mm = new THREE.Mesh(merged, mat);
        mm.castShadow = false; mm.receiveShadow = false; mm.renderOrder = order;
        rig.add(mm);
      }
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
    get glare() { return { k: glareK, t: glareT, intensity: matShroud.emissiveIntensity }; },
    get gaugeStats() { return gaugeStats; },
    get hotas() {
      return { pitch: +(hotas.pitch / D2R).toFixed(1), roll: +(hotas.roll / D2R).toFixed(1), trig: +hotas.trig.toFixed(2), pickle: +hotas.pickle.toFixed(2),
        thrL: +(throttles[0].angle / D2R).toFixed(1), thrR: +(throttles[1].angle / D2R).toFixed(1) };
    },
    glassOutlineWorld() { for (let i = 0; i < glassOutline.length; i++) glassOutlineW[i].copy(glassOutline[i]).applyMatrix4(rig.matrixWorld); return glassOutlineW; },
    get head() {
      return { roll: +(head.roll / D2R).toFixed(1), lookPitch: +(head.look / D2R).toFixed(1), lookYaw: +(head.lookYaw / D2R).toFixed(1),
        off: head.off.toArray().map(v => +v.toFixed(3)) };
    }
  };
}
