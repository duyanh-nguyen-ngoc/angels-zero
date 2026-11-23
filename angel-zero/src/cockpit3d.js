// ANGELS ZERO — 3D first-person F-15C-style cockpit.
// Enclosed forward tub, beveled canopy bow (gasket, 16 hex bolts, lock hooks,
// grab handles), ribbed glare shield, side consoles with switches, knobs, vents
// and an annunciator block, an up-front controller with keypad, three recessed
// reference-matched F-15C analog panel (VSD radar, ARMAMENT, ASI / AoA / G,
// 3D ADI ball, HSI, round TEWS, ALT / VVI / clock, twin RPM / TEMP / FUEL FLOW
// / NOZ POS, FUEL QTY, HYD, amber caution matrix), light-grey structure, tan
// ACES II seat, a tapered chamfered combiner on thin anodized posts, and an
// animated HOTAS (center stick + red-track twin throttles).
// Surfaces use procedural 2048^2 crinkle-coat map / normalMap / roughnessMap.
// The camera rides inside the rig with spring-loaded head inertia (<= 14 px).

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createCockpit3D(THREE, env) {
  const { scene, camera, renderer, sunLight, sunDir, envTex, state: S, combat: C } = env;
  const D2R = Math.PI / 180;
  const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
  const FONT = "'Share Tech Mono', 'Consolas', monospace";
  const STENCIL = "'Arial Narrow', 'Arial', sans-serif";
  const PITCH_BASE = -15 * D2R;                      // eye line over the nose; frames the main panel and the HOTAS grips
  const MFD_PAGES = ['TACTICAL RADAR', 'STORES & DMG', 'RWR THREAT SCOPE'];
  const MFD_PLANFORM = [
    [0, -1], [0.05, -0.86], [0.09, -0.62], [0.11, -0.42], [0.20, -0.30], [0.21, -0.08],
    [0.93, 0.30], [0.93, 0.40], [0.30, 0.42], [0.27, 0.56], [0.60, 0.78], [0.60, 0.90],
    [0.20, 0.88], [0.17, 1.0], [0.04, 1.0]
  ];                                                  // mirrored from src/hud.js PLANFORM
  let mfdPage = 0, mfdDirty = false, mfdSig = '', mfdFlash = -1;
  let _mrx = 0, _mry = 0;                             // projection scratch (numbers only)

  const rig = new THREE.Group();
  rig.visible = false;
  scene.add(rig);
  const add = (mesh, parent = rig) => { mesh.castShadow = false; mesh.receiveShadow = false; parent.add(mesh); return mesh; };

  function rng(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* =================================================================
     1. PROCEDURAL CRINKLE-COAT TEXTURE SET (2048 x 2048)
     ================================================================= */
  const crinkle = (() => {
    const N = 512, SEAM = 128;
    const r = rng(1984);
    const grid = (cell) => { const G = Math.ceil(N / cell) + 2, a = new Float32Array(G * G); for (let i = 0; i < a.length; i++) a[i] = r(); return { a, G, cell }; };
    const g1 = grid(1), g2 = grid(3), g3 = grid(24);
    const sample = (g, x, y) => {
      const m = g.G - 1, fx = x / g.cell, fy = y / g.cell, ix = (fx | 0) % m, iy = (fy | 0) % m, tx = fx - (fx | 0), ty = fy - (fy | 0);
      const i = iy * g.G + ix;
      const a = g.a[i], b = g.a[i + 1], c = g.a[i + g.G], d = g.a[i + g.G + 1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
    const H = new Float32Array(N * N), WEAR = new Uint8Array(N * N), RIV = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let v = sample(g1, x, y) * 0.55 + sample(g2, x, y) * 0.35 + r() * 0.12;      // stipple / crinkle grain
        const sx = x % SEAM, sy = y % SEAM;
        const ds = Math.min(sx, SEAM - sx, sy, SEAM - sy);
        if (ds < 1) v -= 2.2;                                                        // panel seam groove
        else if (ds < 4 && sample(g3, x, y) * sample(g2, x * 3, y * 0.3) > 0.42) WEAR[i] = 1; // edge wear
        H[i] = v;
      }
    }
    // Countersunk rivets beside every seam.
    for (let s = 0; s <= N; s += SEAM) for (let t = 6; t < N; t += 12) {
      for (const [cx, cy] of [[s + 4, t], [t, s + 4]]) {
        if (cx >= N || cy >= N) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const d = Math.hypot(dx, dy), i = y * N + x;
          if (d < 1.2) { H[i] = 0.55 + (1.2 - d) * 0.18; RIV[i] = 1; }
          else if (d < 2.0) { H[i] -= 0.6 * (1 - Math.abs(d - 1.6)); RIV[i] = 0.5; }
        }
      }
    }
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); return { c, x, img: x.createImageData(N, N) }; };
    const col = mk(), nor = mk(), rou = mk();
    const strength = 2.2;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x, k = i * 4;
        const v = H[i];
        // base #8f99a1 light military grey with grain variation
        let rC = 143, gC = 153, bC = 161;
        const tone = 0.86 + 0.22 * clamp(v, 0, 1);
        rC *= tone; gC *= tone; bC *= tone;
        let rough = 0.84 + 0.1 * (v - 0.5);
        if (v < 0) { rC *= 0.55; gC *= 0.55; bC *= 0.55; rough = 0.95; }
        if (WEAR[i]) { rC = 168 + 20 * v; gC = 175 + 20 * v; bC = 182 + 20 * v; rough = 0.42; }    // scuffed paint edge
        if (RIV[i] === 1) { rC = 196; gC = 202; bC = 207; rough = 0.32; } else if (RIV[i] === 0.5) { rC *= 0.6; gC *= 0.6; bC *= 0.6; }
        col.img.data[k] = rC; col.img.data[k + 1] = gC; col.img.data[k + 2] = bC; col.img.data[k + 3] = 255;
        const l = H[y * N + ((x - 1 + N) % N)], rr = H[y * N + ((x + 1) % N)], u = H[((y - 1 + N) % N) * N + x], d = H[((y + 1) % N) * N + x];
        let nx = (l - rr) * strength, ny = (u - d) * strength, nz = 1;
        const inv = 1 / Math.hypot(nx, ny, nz);
        nor.img.data[k] = (nx * inv * 0.5 + 0.5) * 255; nor.img.data[k + 1] = (ny * inv * 0.5 + 0.5) * 255; nor.img.data[k + 2] = (nz * inv * 0.5 + 0.5) * 255; nor.img.data[k + 3] = 255;
        const rv = clamp(rough, 0, 1) * 255;
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

  const paintTexCache = new Map();
  function paint(repeatX, repeatY, opts = {}) {
    const rx = repeatX >= 4 ? 8 : 1.4, ry = repeatX >= 4 ? 1 : 1;
    const key = rx + ',' + ry;
    let t = paintTexCache.get(key);
    if (!t) {
      t = {};
      for (const k of ['map', 'normalMap', 'roughnessMap']) { t[k] = crinkle[k].clone(); t[k].repeat.set(rx, ry); t[k].needsUpdate = true; }
      paintTexCache.set(key, t);
    }
    return new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff, map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
      normalScale: new THREE.Vector2(opts.bump ?? 0.9, opts.bump ?? 0.9), roughness: 1, metalness: opts.metalness ?? 0.35,
      envMap: envTex, envMapIntensity: opts.env ?? 0.5, side: opts.side ?? THREE.FrontSide
    });
  }
  const bowMat = paint(10, 1.2, { color: 0xc4cbd0, metalness: 0.25 });
  const shieldMat = paint(1.6, 1.6, { color: 0x3a4046, metalness: 0.15, env: 0.25, bump: 1.2 });   // dark charcoal glare shield
  const panelMat = paint(1.4, 0.8, { color: 0xeeeeee, metalness: 0.3 });
  const consoleMat = paint(0.6, 0.6, { metalness: 0.3 });
  const tubMat = paint(2, 2, { color: 0x9aa0a8, metalness: 0.2, env: 0.15, side: THREE.DoubleSide });
  const railMat = paint(6, 0.5, { metalness: 0.55 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.95, metalness: 0.0 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9, metalness: 0.05 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x8a9097, roughness: 0.35, metalness: 0.9, envMap: envTex });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xa9b0b8, roughness: 0.3, metalness: 0.95, envMap: envTex });
  const castMat = new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.55, metalness: 0.75, envMap: envTex, envMapIntensity: 0.7 });
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x2b3137, roughness: 0.6, metalness: 0.25 });
  const bezelMat = paint(0.5, 0.5, { color: 0xbcc2c8, metalness: 0.5 });

  /* ---------------------------------------------- small texture helpers */
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    draw(x, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
    return { c, x, t };
  }
  function placard(text, w, h, parent, pos, rot = [0, 0, 0], size = 0.8) {
    const px = 512, py = Math.round(512 * h / w);
    const { t } = canvasTex(px, py, (x) => {
      x.clearRect(0, 0, px, py);
      x.fillStyle = 'rgba(236,240,244,0.92)';
      x.font = `bold ${Math.round(py * size)}px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, px / 2, py / 2 + 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: t, transparent: true, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false
    }));
    m.position.set(...pos); m.rotation.set(...rot);
    parent.add(m);
    return m;
  }
  const hazard = canvasTex(128, 64, (x, w, h) => {
    x.fillStyle = '#f2c200'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#111'; for (let i = -h; i < w; i += 28) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + 14, h); x.lineTo(i + 14 + h, 0); x.lineTo(i + h, 0); x.closePath(); x.fill(); }
  }).t;
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6, metalness: 0.2 });

  /* =================================================================
     2. ENCLOSED FORWARD TUB (no sky / fuselage leaks at the corners)
     ================================================================= */
  {
    const g = new THREE.BoxGeometry(1.56, 0.78, 1.25);
    const tub = new THREE.Mesh(g, [tubMat, tubMat, null, tubMat, null, tubMat]);   // open top and rear
    tub.position.set(0, -0.70, -0.40);
    // three.js skips null materials per group; render the remaining faces double-sided.
    tub.material = tub.material.map(m => m || new THREE.MeshBasicMaterial({ visible: false }));
    add(tub);
  }

  /* =================================================================
     3. CANOPY BOW, GASKET, BOLTS, LOCK HOOKS, GRAB HANDLES, RAILS
     ================================================================= */
  const archPts = [[-0.68, -0.42, -0.52], [-0.66, -0.12, -0.68], [-0.55, 0.18, -0.80], [-0.32, 0.40, -0.89], [0, 0.47, -0.93]];
  const archCurve = new THREE.CatmullRomCurve3([
    ...archPts.map(p => new THREE.Vector3(...p)),
    ...archPts.slice(0, -1).reverse().map(([x, y, z]) => new THREE.Vector3(-x, y, z))
  ]);
  {
    // Beveled multi-segment bow: chamfered rectangular section swept along the arch.
    const w = 0.052, h = 0.034, c = 0.012, sec = new THREE.Shape();
    sec.moveTo(-w + c, -h); sec.lineTo(w - c, -h); sec.lineTo(w, -h + c); sec.lineTo(w, h - c); sec.lineTo(w - c, h);
    sec.lineTo(-w + c, h); sec.lineTo(-w, h - c); sec.lineTo(-w, -h + c); sec.closePath();
    add(new THREE.Mesh(new THREE.ExtrudeGeometry(sec, { steps: 140, extrudePath: archCurve, bevelEnabled: false }), bowMat));
  }
  const inward = (p, d) => p.clone().addScaledVector(p.clone().negate().normalize(), d);
  {
    const seal = new THREE.CatmullRomCurve3(archCurve.getSpacedPoints(80).map(p => inward(p, 0.052)));
    add(new THREE.Mesh(new THREE.TubeGeometry(seal, 160, 0.011, 8), rubberMat));          // weatherseal gasket
  }
  {
    const n = 16, hex = new THREE.CylinderGeometry(0.0095, 0.0095, 0.007, 6).rotateX(Math.PI / 2);
    const washer = new THREE.CylinderGeometry(0.0135, 0.0135, 0.003, 18).rotateX(Math.PI / 2);
    const bolts = new THREE.InstancedMesh(hex, boltMat, n), washers = new THREE.InstancedMesh(washer, castMat, n);
    const m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const p = archCurve.getPointAt(0.04 + 0.92 * i / (n - 1));
      const pos = inward(p, 0.036);
      m.lookAt(pos, new THREE.Vector3(), up); q.setFromRotationMatrix(m);
      washers.setMatrixAt(i, new THREE.Matrix4().compose(inward(p, 0.034), q, one));
      bolts.setMatrixAt(i, new THREE.Matrix4().compose(pos, q, one));
    }
    for (const im of [bolts, washers]) { im.castShadow = im.receiveShadow = false; rig.add(im); }
  }
  for (const t of [0.42, 0.58]) {                                    // twin yellow/black canopy lock hooks
    const p = archCurve.getPointAt(t), pos = inward(p, 0.05);
    const g = new THREE.Group(); g.position.copy(pos); g.lookAt(0, 0, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.026), hazardMat), g);
    const hook = add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.012), castMat), g);
    hook.position.set(0, -0.022, 0.006);
    rig.add(g);
  }
  for (const t of [0.2, 0.8]) {                                      // pilot grab handles
    const pts = [t - 0.045, t - 0.038, t + 0.038, t + 0.045].map((tt, i) => inward(archCurve.getPointAt(tt), i === 0 || i === 3 ? 0.045 : 0.085));
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0085, 8), castMat));
  }
  placard('CANOPY LOCK', 0.09, 0.016, rig, inward(archCurve.getPointAt(0.5), 0.042).add(new THREE.Vector3(0, -0.035, 0)), [0.35, 0, 0], 0.75);
  for (const sx of [-1, 1]) {                                        // canopy rails with brushed edge wear
    const rail = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.68, -0.42, -0.52), new THREE.Vector3(sx * 0.66, -0.41, -0.1), new THREE.Vector3(sx * 0.62, -0.40, 0.4)]);
    add(new THREE.Mesh(new THREE.TubeGeometry(rail, 32, 0.042, 10), railMat));
    const wear = new THREE.CatmullRomCurve3(rail.getPoints(8).map(p => p.clone().add(new THREE.Vector3(-sx * 0.012, 0.038, 0))));
    add(new THREE.Mesh(new THREE.TubeGeometry(wear, 32, 0.006, 6), silverMat), rig, false);
  }

  /* =================================================================
     4. GLARE SHIELD WITH RIBBED PADDING
     ================================================================= */
  {
    const s = new THREE.Shape();
    const o = [[-0.62, -0.70], [-0.56, -0.81], [-0.33, -0.89], [0, -0.915], [0.33, -0.89], [0.56, -0.81], [0.62, -0.70]];
    s.moveTo(o[0][0], o[0][1]); for (let i = 1; i < o.length; i++) s.lineTo(o[i][0], o[i][1]); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.055, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 4, curveSegments: 12 });
    g.rotateX(Math.PI / 2); g.translate(0, -0.236, 0);
    add(new THREE.Mesh(g, shieldMat));
    const rib = new THREE.CapsuleGeometry(0.0085, 1.04, 4, 10).rotateZ(Math.PI / 2);
    const ribs = mergeGeometries([0, 1, 2, 3].map(i => rib.clone().translate(0, -0.236 + 0.006, -0.706 - i * 0.017)));
    add(new THREE.Mesh(ribs, padMat));
  }

  /* =================================================================
     5. F-15C MAIN INSTRUMENT PANEL (reference layout)
     -----------------------------------------------------------------
     One static 2048 x 1064 painted faceplate (light military grey, dark
     sub-plates, white silkscreen, screw heads, hazard stripes) carries the
     layout; real 3D bezels, knobs, toggles, lights and the ADI ball sit on
     top. Live dials share one 1024^2 gauge atlas (15 Hz) and the CRTs share
     one 1024^2 display atlas (VSD radar, round TEWS scope, HSI).
       left : VSD radar, ARMAMENT / SELECT JETT, ASI-Mach, AoA, G meter,
              EMERG LG, gear handle + NOSE/LEFT/RIGHT + FLAP lights
       centre: UFC / HUD SET, 3D ADI ball, HSI, EMERG JETT / EMERG BK,
              A/G - ADI - VI lights
       right: round TEWS, ALT, VVI, clock, twin RPM / TEMP / FUEL FLOW /
              NOZ POS columns, FUEL QTY, HYD / OIL
     ================================================================= */
  function screenTex(pxW, pxH) {
    const c = document.createElement('canvas'); c.width = pxW; c.height = pxH;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { c, ctx: c.getContext('2d', { willReadFrequently: true }), t, w: pxW, h: pxH };
  }
  const PW = 1.04, PH = 0.56, PTOP = 0.22;                  // panel face (m), top edge local y
  const panel = new THREE.Group();
  panel.position.set(0, -0.50, -0.58);
  panel.rotation.x = -0.55;                          // face tilted up toward the pilot's eye line
  rig.add(panel);
  const darkPlate = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.72, metalness: 0.25 });
  const bezelMat2 = new THREE.MeshStandardMaterial({ color: 0x1d2125, roughness: 0.5, metalness: 0.5 });
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xa9bccb, roughness: 0.42, metalness: 0.25 });
  const toggleMat = new THREE.MeshStandardMaterial({ color: 0xd6dadf, roughness: 0.25, metalness: 0.9, envMap: envTex });
  const redKnobMat = new THREE.MeshStandardMaterial({ color: 0xb3121b, roughness: 0.38, metalness: 0.1, emissive: 0x200000 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, metalness: 0.1 });
  // (opacity tuned for linear-space blending in the HDR composer target: 0.07 under the
  // old sRGB framebuffer blend lifted the black dial faces to grey once blending went linear)
  const glassSheen = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.022, roughness: 0.08, metalness: 0, envMap: envTex, envMapIntensity: 0.9, depthWrite: false });
  // panel (x, y) in metres -> faceplate pixels
  const FW = 2048, FH = Math.round(2048 * PH / PW);
  const fx = x => (x + PW / 2) / PW * FW, fy = y => (PTOP - y) / PH * FH, fs = m => m / PW * FW;
  const FACE_Z = 0.026;
  const onFace = (mesh, x, y, z = 0) => { mesh.position.set(x, y, FACE_Z + z); panel.add(mesh); return mesh; };

  // --- instrument positions (panel metres)
  const G = {
    asi: [-0.155, 0.045, 0.043], aoa: [-0.155, -0.055, 0.04], acc: [-0.155, -0.15, 0.04],
    alt: [0.155, 0.05, 0.043], vvi: [0.155, -0.05, 0.04], clk: [0.155, -0.145, 0.037],
    rpmL: [0.262, 0.063, 0.031], rpmR: [0.338, 0.063, 0.031], tmpL: [0.262, -0.01, 0.031], tmpR: [0.338, -0.01, 0.031],
    ffL: [0.262, -0.083, 0.031], ffR: [0.338, -0.083, 0.031], nozL: [0.262, -0.156, 0.031], nozR: [0.338, -0.156, 0.031],
    fuel: [0.44, -0.07, 0.042], hyd: [0.44, 0.05, 0.03]
  };
  const ADI = [0, 0.035, 0.058], HSI = [0, -0.125, 0.058], VSD = [-0.315, 0.145, 0.15], TEWS = [0.31, 0.158, 0.06];
  const GAUGE_KEYS = Object.keys(G);                 // 16 cells of the gauge atlas

  /* --- static faceplate ------------------------------------------- */
  const face = canvasTex(FW, FH, (x, w, h) => {
    const r = rng(77);
    x.fillStyle = '#8f99a1'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 128 + Math.floor(r() * 40); x.fillStyle = `rgba(${v},${v + 8},${v + 14},0.18)`; x.fillRect(r() * w, r() * h, 2, 2); }   // crinkle speckle
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0.10)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.14)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const seam = (x0, y0, x1, y1) => { x.strokeStyle = 'rgba(40,46,52,0.55)'; x.lineWidth = 3; x.strokeRect(fx(x0), fy(y1), fx(x1) - fx(x0), fy(y0) - fy(y1)); };
    const screw = (px, py) => { x.fillStyle = '#c3cbd1'; x.beginPath(); x.arc(px, py, 7, 0, 7); x.fill(); x.strokeStyle = '#5c656c'; x.lineWidth = 2; x.stroke(); x.beginPath(); x.moveTo(px - 5, py); x.lineTo(px + 5, py); x.stroke(); };
    const plate = (x0, y0, x1, y1, col = '#2b3036') => {
      x.fillStyle = col; x.fillRect(fx(x0), fy(y1), fx(x1) - fx(x0), fy(y0) - fy(y1));
      x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 3; x.strokeRect(fx(x0), fy(y1), fx(x1) - fx(x0), fy(y0) - fy(y1));
      for (const [sx, sy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) screw(fx(sx) + (sx === x0 ? 12 : -12), fy(sy) + (sy === y1 ? 12 : -12));
    };
    const text = (t, xm, ym, px = 22, col = '#eef2f4', align = 'center', bold = true) => { x.fillStyle = col; x.font = `${bold ? 'bold ' : ''}${px}px ${STENCIL}`; x.textAlign = align; x.textBaseline = 'middle'; x.fillText(t, fx(xm), fy(ym)); };
    const hazard = (x0, y0, x1, y1) => {
      x.save(); x.beginPath(); x.rect(fx(x0), fy(y1), fx(x1) - fx(x0), fy(y0) - fy(y1)); x.clip();
      x.fillStyle = '#f2c200'; x.fillRect(fx(x0), fy(y1), fx(x1) - fx(x0), fy(y0) - fy(y1));
      x.fillStyle = '#121212'; for (let k = -40; k < 40; k++) { const bx = fx(x0) + k * 26; x.beginPath(); x.moveTo(bx, fy(y0)); x.lineTo(bx + 13, fy(y0)); x.lineTo(bx + 13 + 60, fy(y1)); x.lineTo(bx + 60, fy(y1)); x.closePath(); x.fill(); }
      x.restore();
    };
    // section seams
    seam(-0.52, -0.34, -0.215, 0.22); seam(-0.215, -0.34, -0.085, 0.22); seam(0.085, -0.34, 0.215, 0.22); seam(0.215, -0.34, 0.52, 0.22);
    // UFC / HUD SET plate (dark) under the glare shield
    plate(-0.165, 0.098, 0.165, 0.218);
    text('I/P', -0.085, 0.207, 20); text('MODE 3/A', 0.03, 0.207, 20);
    text('CHAN', -0.115, 0.163, 18); text('UHF 1', 0, 0.143, 18); text('HUD   SET', 0, 0.126, 20);
    text('BRT', -0.12, 0.112, 15); text('SYM', -0.06, 0.112, 15); text('RTCL', 0, 0.112, 15); text('CAMERA', 0.06, 0.112, 15);
    x.fillStyle = '#16191c';
    for (let k = 0; k < 4; k++) x.fillRect(fx(-0.015 + k * 0.026) - 18, fy(0.199), 36, 34);      // mode-3/A code drums
    x.fillRect(fx(-0.05) - 90, fy(0.172), 180, 30);                                              // freq window
    x.fillRect(fx(-0.12) - 34, fy(0.158), 68, 28);                                               // channel window
    x.font = `bold 26px ${STENCIL}`; x.fillStyle = '#e6e9ec'; x.textAlign = 'center';
    for (let k = 0; k < 4; k++) x.fillText('7', fx(-0.015 + k * 0.026), fy(0.188));
    x.fillText('2  2  0  .  0  0', fx(-0.05), fy(0.164)); x.fillText('0 2', fx(-0.12), fy(0.151));
    // VSD + TEWS surrounds
    plate(VSD[0] - 0.098, VSD[1] - 0.088, VSD[0] + 0.098, VSD[1] + 0.078, '#4a5158');
    text('CONTR', VSD[0] - 0.035, VSD[1] + 0.068, 15); text('BRT', VSD[0] + 0.05, VSD[1] + 0.068, 15);
    plate(TEWS[0] - 0.088, TEWS[1] - 0.075, TEWS[0] + 0.088, TEWS[1] + 0.065, '#4a5158');
    text('VIDEO RECORD', -0.215 + 0.0, 0.205, 14, '#eef2f4');
    // ARMAMENT panel
    plate(-0.465, -0.115, -0.21, 0.068);
    text('ARMAMENT', -0.30, 0.055, 22); text('MASTER', -0.245, 0.034, 15); text('ARM', -0.245, 0.022, 15); text('SAFE', -0.245, -0.005, 13);
    text('GUN', -0.42, 0.048, 16); text('ROUNDS', -0.43, 0.03, 13); text('HIGH', -0.385, 0.04, 12); text('LOW', -0.385, 0.0, 12);
    x.fillStyle = '#121518'; x.fillRect(fx(-0.455), fy(0.02), fs(0.05), fs(0.02));
    const boxes = [['MRM', -0.36, 0.035], ['MRM', -0.29, 0.035], ['SW', -0.44, -0.02], ['SW', -0.22, -0.022], ['3 MK 82', -0.37, 0.0], ['1 FUEL', -0.32, 0.0], ['3 MK 82', -0.27, 0.0], ['MRM', -0.355, -0.04], ['MRM', -0.3, -0.04]];
    for (const [t, bx, by] of boxes) { x.fillStyle = '#0b1a24'; x.fillRect(fx(bx) - 44, fy(by) - 15, 88, 30); x.strokeStyle = '#6b7780'; x.lineWidth = 2; x.strokeRect(fx(bx) - 44, fy(by) - 15, 88, 30); text(t, bx, by, 15, t.includes('MK') || t.includes('FUEL') ? '#5fb0ff' : '#e8ecee'); }
    text('A/G SELECT', -0.43, -0.058, 12); text('INTERVAL', -0.345, -0.058, 12); text('QUANTITY', -0.28, -0.058, 12);
    text('SELECT JETT', -0.42, -0.083, 13); text('MONITOR', -0.3, -0.083, 13); text('OPTIONS', -0.3, -0.103, 12);
    x.strokeStyle = '#d23a3a'; x.lineWidth = 4; x.beginPath(); x.arc(fx(-0.42), fy(-0.1), fs(0.017), 0, 7); x.stroke();
    // centre column placards
    hazard(-0.085, 0.01, -0.06, 0.06); text('EMERG JETT', -0.072, 0.0, 12); text('STEER MODE', -0.072, -0.012, 11);
    hazard(-0.085, -0.088, -0.06, -0.072); text('EMERG BK', -0.072, -0.095, 11);
    for (const [t, ly] of [['A/G', 0.06], ['ADI', 0.033], ['VI', 0.006]]) { x.fillStyle = '#0c2414'; x.fillRect(fx(0.068), fy(ly) - 16, fs(0.03), 32); text(t, 0.083, ly, 17, '#3d6b4c'); }
    text('BEACON', 0.083, -0.022, 12); text('RUD PED ADJ', 0.083, -0.04, 11); text('PULL', 0.083, -0.07, 12);
    // left lower: EMERG LG + gear handle + flap lights
    hazard(-0.505, -0.2, -0.43, -0.17); text('EMERG LG', -0.47, -0.21, 12); text('HOOK  UP/DN', -0.47, -0.16, 11);
    for (const [t, lx, ly] of [['FLAP', -0.42, -0.24], ['FLAP', -0.42, -0.265], ['NOSE', -0.33, -0.235], ['LEFT', -0.36, -0.26], ['RIGHT', -0.30, -0.26]]) { x.fillStyle = '#0b2112'; x.fillRect(fx(lx) - 30, fy(ly) - 13, 60, 26); text(t, lx, ly, 14, '#2f6b45'); }
    text('LDG GR', -0.33, -0.31, 13); text('ROUND OVER: GEAR LOCKED', -0.36, -0.205, 10, '#d23a3a');
    // right side: fuel / jett placards
    text('FUEL QTY', 0.44, -0.012, 13); text('INTERNAL', 0.44, -0.03, 10); text('JETT FUEL STARTER', 0.44, -0.135, 11); text('PULL', 0.44, -0.155, 12);
    text('HYD', 0.44, 0.095, 12); text('L OIL PRESS  R', 0.44, 0.005, 10);
    text('CANOPY UNLOCKED', 0.44, 0.205, 12, '#2f6b45');
    // gauge rims: thin dark wells under each 3D bezel
    for (const k of GAUGE_KEYS) { const [gx, gy, gr] = G[k]; x.fillStyle = '#151719'; x.beginPath(); x.arc(fx(gx), fy(gy), fs(gr * 1.12), 0, 7); x.fill(); }
    for (const [gx, gy, gr] of [ADI, HSI]) { x.fillStyle = '#151719'; x.beginPath(); x.arc(fx(gx), fy(gy), fs(gr * 1.14), 0, 7); x.fill(); }
    x.fillStyle = '#151719'; x.beginPath(); x.arc(fx(TEWS[0]), fy(TEWS[1]), fs(TEWS[2] * 1.1), 0, 7); x.fill();
    x.fillRect(fx(VSD[0] - VSD[2] / 2) - 8, fy(VSD[1] + VSD[2] / 2) - 8, fs(VSD[2]) + 16, fs(VSD[2]) + 16);
  });
  face.t.anisotropy = 8;
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({ map: face.t, roughness: 0.82, metalness: 0.12 })), 0, PTOP - PH / 2, -0.0005);
  add(new THREE.Mesh(new THREE.BoxGeometry(PW + 0.02, PH, 0.05), consoleMat), panel).position.set(0, PTOP - PH / 2, 0);

  /* --- live texture atlases --------------------------------------- */
  // The atlases are uploaded once; afterwards each dial (256 px) / CRT (384 px) is
  // painted into its own small canvas and copied into its atlas cell on the GPU
  // (texSubImage2D via renderer.copyTextureToTexture) -- no full-atlas re-uploads.
  const GCELL = 256, DCELL = 384;
  const gaugeAtlas = canvasTex(GCELL * 4, GCELL * 4, (x, w, h) => { x.fillStyle = '#0c0e10'; x.fillRect(0, 0, w, h); });
  const dispAtlas = canvasTex(DCELL * 2, DCELL * 2, (x, w, h) => { x.fillStyle = '#020a05'; x.fillRect(0, 0, w, h); });
  const cellCanvas = n => { const c = canvasTex(n, n, () => {}); c.t.generateMipmaps = false; c.t.minFilter = THREE.LinearFilter; return c; };
  const gCell = cellCanvas(GCELL), dCell = cellCanvas(DCELL);
  const _cellPos = new THREE.Vector2();
  // Copy a painted cell canvas into atlas cell (col, row) (rows counted from the top).
  function uploadCell(src, atlas, col, row, n) {
    const H = atlas.c.height;
    if (renderer && renderer.copyTextureToTexture) {
      _cellPos.set(col * n, H - (row + 1) * n);                 // GL origin is bottom-left (flipY)
      renderer.copyTextureToTexture(_cellPos, src.t, atlas.t);
    } else {                                                     // fallback: blit + full upload
      atlas.x.drawImage(src.c, col * n, row * n); atlas.t.needsUpdate = true;
    }
  }
  const cellUV = (geo, col, row, n) => {               // map a geometry's 0..1 UVs onto atlas cell (col,row) of an n x n grid
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / n, 1 - (row + 1 - uv.getY(i)) / n);
    return geo;
  };
  const gaugeMat = new THREE.MeshBasicMaterial({ map: gaugeAtlas.t, toneMapped: false });
  const dispMat = new THREE.MeshBasicMaterial({ map: dispAtlas.t, toneMapped: false });
  const bezelRing = (x, y, r, depth = 0.012) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.08 + 0.002, 8, 40), bezelMat2); onFace(ring, x, y, 0.004);
    const sheen = new THREE.Mesh(new THREE.CircleGeometry(r, 32), glassSheen); onFace(sheen, x, y, 0.006);
    return ring;
  };
  GAUGE_KEYS.forEach((k, i) => {
    const [gx, gy, gr] = G[k];
    onFace(new THREE.Mesh(cellUV(new THREE.CircleGeometry(gr, 40), i % 4, Math.floor(i / 4), 4), gaugeMat), gx, gy, 0.0015);
    bezelRing(gx, gy, gr);
    // bezel set knob at the lower right of the big flight instruments
    if (['asi', 'alt', 'fuel'].includes(k)) onFace(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.012, 14).rotateX(Math.PI / 2), knobMat), gx + gr * 0.85, gy - gr * 0.85, 0.006);
  });
  // VSD (square CRT), TEWS (round CRT), HSI (round) from the display atlas (2 x 2 cells).
  onFace(new THREE.Mesh(cellUV(new THREE.PlaneGeometry(VSD[2], VSD[2]), 0, 0, 2), dispMat), VSD[0], VSD[1], 0.001);
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(VSD[2], VSD[2]), glassSheen), VSD[0], VSD[1], 0.004);
  for (const [w, h, ox, oy] of [[VSD[2] + 0.024, 0.012, 0, VSD[2] / 2 + 0.006], [VSD[2] + 0.024, 0.012, 0, -VSD[2] / 2 - 0.006], [0.012, VSD[2], -VSD[2] / 2 - 0.006, 0], [0.012, VSD[2], VSD[2] / 2 + 0.006, 0]])
    onFace(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.016), bezelMat2), VSD[0] + ox, VSD[1] + oy, 0.006);
  for (const sx of [-0.035, 0.05]) onFace(new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.012, 14).rotateX(Math.PI / 2), knobMat), VSD[0] + sx, VSD[1] + VSD[2] / 2 + 0.02, 0.006);
  onFace(new THREE.Mesh(cellUV(new THREE.CircleGeometry(TEWS[2], 48), 1, 0, 2), dispMat), TEWS[0], TEWS[1], 0.001);
  bezelRing(TEWS[0], TEWS[1], TEWS[2]);
  onFace(new THREE.Mesh(cellUV(new THREE.CircleGeometry(HSI[2], 48), 1, 1, 2), dispMat), HSI[0], HSI[1], 0.0015);
  bezelRing(HSI[0], HSI[1], HSI[2]);
  for (const sx of [-1, 1]) onFace(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 14).rotateX(Math.PI / 2), knobMat), HSI[0] + sx * HSI[2] * 0.9, HSI[1] - HSI[2] * 0.9, 0.006);

  // 3D ADI ball: an equirectangular sky/ground sphere rolled about the view axis and pitched inside it.
  const adiTex = canvasTex(1024, 512, (x, w, h) => {
    x.fillStyle = '#d9dcdf'; x.fillRect(0, 0, w, h / 2);                     // sky (light grey / white)
    x.fillStyle = '#4b4f54'; x.fillRect(0, h / 2, w, h / 2);                 // ground (dark grey)
    x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
    x.font = `bold 20px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let lon = 0; lon < 4; lon++) {
      const cx = (0.25 + lon * 0.25) % 1 * w;
      for (let p = -80; p <= 80; p += 10) {
        if (!p) continue;
        const py = h / 2 - p / 180 * h, l = p % 30 === 0 ? 90 : 50;
        x.strokeStyle = x.fillStyle = p > 0 ? '#2b3036' : '#e8ecef'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(cx - l / 2, py); x.lineTo(cx + l / 2, py); x.stroke();
        if (p % 30 === 0) { x.fillText(String(Math.abs(p) / 10), cx - l / 2 - 16, py); x.fillText(String(Math.abs(p) / 10), cx + l / 2 + 16, py); }
      }
    }
    x.font = `bold 34px ${STENCIL}`; x.fillStyle = '#2b3036'; x.fillText('CLI', 0.25 * w, h * 0.28); x.fillStyle = '#e8ecef'; x.fillText('DIVE', 0.25 * w, h * 0.72);
  });
  const adiOuter = new THREE.Group(), adiInner = new THREE.Group();
  adiOuter.position.set(ADI[0], ADI[1], FACE_Z - 0.026); panel.add(adiOuter); adiOuter.add(adiInner);
  const adiMat = new THREE.MeshStandardMaterial({ map: adiTex.t, roughness: 0.35, metalness: 0.05, emissive: 0xffffff, emissiveMap: adiTex.t, emissiveIntensity: 0.45 });   // internally lit ball
  adiInner.add(new THREE.Mesh(new THREE.SphereGeometry(ADI[2] * 1.12, 48, 24), adiMat));
  bezelRing(ADI[0], ADI[1], ADI[2]);
  { // fixed orange aircraft symbol + bank pointer over the ball
    const sym = new THREE.Mesh(new THREE.BoxGeometry(ADI[2] * 1.1, 0.0035, 0.002), new THREE.MeshBasicMaterial({ color: 0xff9a1a, toneMapped: false }));
    onFace(sym, ADI[0], ADI[1], 0.012);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0035, 12), sym.material); onFace(dot, ADI[0], ADI[1], 0.0125);
  }

  /* --- 3D switchgear on the face ------------------------------------ */
  const knobs = [], toggles = [];
  const knob = (x, y, r = 0.0085) => knobs.push(new THREE.CylinderGeometry(r, r * 1.12, 0.013, 16).rotateX(Math.PI / 2).translate(x, y, FACE_Z + 0.0065));
  const toggle = (x, y) => {
    toggles.push(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12).rotateX(Math.PI / 2).translate(x, y, FACE_Z + 0.002));
    toggles.push(new THREE.CylinderGeometry(0.0016, 0.0024, 0.018, 8).rotateX(Math.PI / 2 - 0.45).translate(x, y + 0.004, FACE_Z + 0.01));
    toggles.push(new THREE.SphereGeometry(0.0032, 8, 6).translate(x, y + 0.008, FACE_Z + 0.018));
  };
  for (const kx of [-0.13, -0.065, 0, 0.065]) knob(kx, 0.183, 0.009);                     // UFC channel / volume knobs
  knob(0.135, 0.17, 0.012); for (const kx of [-0.12, -0.06, 0, 0.06]) toggle(kx, 0.112);
  knob(-0.10, 0.104, 0.01); knob(0.0, 0.104, 0.01); knob(0.08, 0.104, 0.012);
  toggle(-0.385, 0.02); toggle(-0.245, 0.01);                                            // GUN HIGH/LOW, MASTER ARM
  for (const kx of [-0.375, -0.325, -0.275]) knob(kx, 0.017, 0.006);
  knob(-0.43, -0.07, 0.012); toggle(-0.345, -0.072); toggle(-0.28, -0.072);
  for (let k = 0; k < 4; k++) knob(-0.355 + k * 0.03, -0.095, 0.006);
  knob(0.083, -0.007, 0.007);                                                             // beacon / rudder ped knobs
  knob(0.44, -0.11, 0.012);                                                               // fuel qty selector
  add(new THREE.Mesh(mergeGeometries(knobs), knobMat), panel);
  add(new THREE.Mesh(mergeGeometries(toggles), toggleMat), panel);
  // Red SELECT JETT knob, red gear handle, yellow PUSH TO JETT / EMERG BK / PULL handles.
  onFace(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.016, 20).rotateX(Math.PI / 2), redKnobMat), -0.42, -0.1, 0.008);
  // LDG GR handle: a lever pivoting on the panel face, stem tilted UP (gear up) or
  // DOWN (gear down), driven live by S.gearDown; its red wheel-shaped knob lights
  // while the gear is in transit (F-15 handle warning light).
  const gearKnobMat = new THREE.MeshStandardMaterial({ color: 0xb01818, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.45 });
  const gearHandle = new THREE.Group(); onFace(gearHandle, -0.33, -0.285, 0);
  { add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 10).rotateX(Math.PI / 2), toggleMat), gearHandle).position.z = 0.025;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.022, 24).rotateX(Math.PI / 2), gearKnobMat), gearHandle).position.z = 0.055; }
  gearHandle.rotation.x = -0.45;
  onFace(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 20).rotateX(Math.PI / 2), yellowMat), -0.072, 0.036, 0.006);
  onFace(new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.022, 4, 10), yellowMat), -0.072, -0.116, 0.008);
  onFace(new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.022, 4, 10), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 })), 0.083, -0.09, 0.008);
  onFace(new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.026, 4, 10), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 })), 0.44, -0.18, 0.008);
  onFace(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.04, 0.012), yellowMat), -0.46, -0.185, 0.008);      // EMERG LG handle

  // Lit lamps (emissive) driven every frame: MASTER CAUTION, AI/SAM, A/G-ADI-VI,
  // gear NOSE/LEFT/RIGHT, FLAP x2, L/R engine FIRE push buttons.
  const lamp = (x, y, w, h, col) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 0, roughness: 0.4 });
    onFace(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), m), x, y, 0.003); return m;
  };
  const lamps = {
    caution: lamp(-0.143, 0.19, 0.034, 0.024, 0xff3020), aisam: lamp(0.143, 0.19, 0.034, 0.024, 0xff3020),
    ag: lamp(0.083, 0.06, 0.028, 0.014, 0x3dff7a), adi: lamp(0.083, 0.033, 0.028, 0.014, 0x3dff7a), vi: lamp(0.083, 0.006, 0.028, 0.014, 0x3dff7a),
    nose: lamp(-0.33, -0.235, 0.028, 0.012, 0x3dff7a), left: lamp(-0.36, -0.26, 0.028, 0.012, 0x3dff7a), right: lamp(-0.30, -0.26, 0.028, 0.012, 0x3dff7a),
    flap1: lamp(-0.42, -0.24, 0.028, 0.012, 0x3dff7a), flap2: lamp(-0.42, -0.265, 0.028, 0.012, 0x3dff7a),
    fireL: lamp(-0.46, 0.17, 0.03, 0.03, 0xff2a14), fireR: lamp(-0.42, 0.17, 0.03, 0.03, 0xff2a14)
  };
  placard('L ENG FIRE', 0.05, 0.01, panel, [-0.46, 0.15, FACE_Z + 0.004], [0, 0, 0], 0.7);
  placard('R ENG FIRE', 0.05, 0.01, panel, [-0.42, 0.15, FACE_Z + 0.004], [0, 0, 0], 0.7);
  // UFC live digits (channel / mission clock) on a small LED strip.
  const ufcLED = screenTex(512, 64);
  const ufcMat = new THREE.MeshBasicMaterial({ map: ufcLED.t, toneMapped: false });
  onFace(new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.015), ufcMat), 0.07, 0.164, 0.001);

  /* =================================================================
     6. CAUTION MATRIX, CONSOLES, CANOPY LEVER, SEAT
     ================================================================= */
  // Angled lower-right caution / warning panel: 3 x 13 amber tiles lit by game state.
  const CAUTIONS = ['SEAT NOT\nARMED', 'RADAR\nALT', 'AVIONICS\nFAULT', 'PROBE\nHEAT', 'ELEC SYS', 'SEC', 'EQUIP\nHOT', 'NWS\nFAIL', 'C ADC', 'IFF', 'R GEN', 'L GEN',
    'CANOPY', 'UT HYD', 'ANTI\nSKID', 'FL HYD', 'EXT TANKS\nEMPTY', 'INLET\nICING', 'OXYGEN', 'L FUEL\nLOW', 'ENGINE\nANTI-ICE', 'R FUEL\nLOW', 'L FUEL\nPRESS', 'AIR DATA\nCOMPUTER',
    'R FUEL\nPRESS', 'STORES\nCONFIG', 'DC\nOVERLOAD', 'HOOK', 'OVERHEAT', 'NUCLEAR', 'OXY\nLOW', 'EEC', 'FWD\nFUEL LOW', 'CABIN\nPRESS', 'BUC', 'AFT\nFUEL LOW', 'ATF NOT\nENGAGED', 'OVER G', 'LOW\nALT'];
  const caution = screenTex(384, 1024);
  const cautionMat2 = new THREE.MeshBasicMaterial({ map: caution.t, toneMapped: false });
  { const g = new THREE.Group(); g.position.set(0.535, -0.5, -0.47); g.rotation.set(0.25, -0.62, 0); rig.add(g);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.03), consoleMat), g);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.30), cautionMat2); m.position.z = 0.0155; g.add(m);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.07), new THREE.MeshStandardMaterial({ map: hazard, roughness: 0.6 })); hz.position.set(0.069, -0.06, 0.016); g.add(hz); }

  // Side consoles alongside the seat: painted switch panels + 3D toggles/knobs.
  function consoleTex(seed, titles) {
    return canvasTex(512, 1024, (x, w, h) => {
      const r = rng(seed);
      x.fillStyle = '#8f99a1'; x.fillRect(0, 0, w, h);
      const rows = titles.length;
      titles.forEach((t, i) => {
        const y0 = 12 + i * (h - 24) / rows, ph = (h - 24) / rows - 10;
        x.fillStyle = '#2b3036'; x.fillRect(10, y0, w - 20, ph);
        x.strokeStyle = '#111'; x.lineWidth = 3; x.strokeRect(10, y0, w - 20, ph);
        x.fillStyle = '#eef2f4'; x.font = `bold 22px ${STENCIL}`; x.textAlign = 'center'; x.fillText(t, w / 2, y0 + ph - 10);
        x.font = `14px ${STENCIL}`;
        for (let k = 0; k < 6; k++) {
          const cx = 50 + (k % 3) * 150 + r() * 20, cy = y0 + 30 + Math.floor(k / 3) * (ph - 60) / 2 + r() * 10;
          if (r() < 0.55) { x.fillStyle = '#c9cfd4'; x.beginPath(); x.arc(cx, cy, 9, 0, 7); x.fill(); x.fillStyle = '#eef2f4'; x.fillText(r() < 0.5 ? 'ON' : 'AUTO', cx, cy - 16); x.fillText('OFF', cx, cy + 22); }
          else { x.fillStyle = '#a9bccb'; x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.fill(); x.strokeStyle = '#2b3036'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 12 * Math.cos(r() * 6), cy + 12 * Math.sin(r() * 6)); x.stroke(); }
        }
      });
    });
  }
  const consoles = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.46, -0.6, -0.12); g.rotation.set(-Math.PI / 2 + 0.12, 0, sx * -0.18); rig.add(g);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.06), consoleMat), g).position.z = -0.03;
    const tex = consoleTex(sx < 0 ? 11 : 23, sx < 0 ? ['GND PWR', 'BIT / AVIONICS', 'IFF', 'TEWS / RAD 2', 'EXT LT', 'CAS', 'TCN'] : ['ECS', 'OXYGEN REGULATOR', 'ENGINE', 'NAV CONTROL', 'TEWS', 'COMPASS', 'CMD  DISP SEL']);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.6), new THREE.MeshStandardMaterial({ map: tex.t, roughness: 0.8, metalness: 0.1 })); top.position.z = 0.0005; g.add(top);
    const tg = [];
    for (let i = 0; i < 18; i++) { const px = -0.09 + (i % 3) * 0.075, py = -0.27 + Math.floor(i / 3) * 0.088;
      tg.push(new THREE.CylinderGeometry(0.0015, 0.0022, 0.016, 6).rotateX(Math.PI / 2 - 0.4).translate(px, py, 0.008)); }
    add(new THREE.Mesh(mergeGeometries(tg), toggleMat), g);
    consoles.push(g);
  }
  // Right sidewall: black canopy control lever, white-ball emergency handle, coiled hose.
  { const g = new THREE.Group(); g.position.set(0.62, -0.36, -0.08); rig.add(g);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.26), new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.55, metalness: 0.3 })), g).position.set(0, 0, -0.04);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20).rotateZ(Math.PI / 2), bezelMat2), g).position.set(0, 0, 0.1);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.034, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb08a6a, metalness: 0.6, roughness: 0.4 })), g).position.set(-0.002, 0, 0.1);
    placard('CANOPY CONTROL', 0.12, 0.012, g, [-0.016, -0.04, -0.02], [0, -Math.PI / 2, 0], 0.8);
    const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.25 })), g); ball.position.set(-0.04, -0.1, 0.0);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8).rotateZ(0.6), toggleMat), g).position.set(-0.025, -0.075, 0.0);
    const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * Math.PI * 16; pts.push(new THREE.Vector3(-0.05 + 0.012 * Math.cos(a), -0.12 - t * 0.2, 0.12 + 0.012 * Math.sin(a) + t * 0.05)); }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0045, 6), new THREE.MeshStandardMaterial({ color: 0x8b8f86, roughness: 0.7 })), g); }
  // ACES II seat: tan cushion with yellow arming handles each side.
  { const seat = new THREE.Group(); seat.position.set(0, -0.82, 0.12); rig.add(seat);
    const cushion = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 12).rotateZ(Math.PI / 2).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ color: 0xb89b72, roughness: 0.95 }));
    cushion.scale.set(1, 1, 3.4); seat.add(cushion);
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), yellowMat); h.rotation.set(0, Math.PI / 2, 0); h.position.set(sx * 0.25, 0.02, -0.12); seat.add(h);
    }
    placard('EMERGENCY MANUAL CHUTE', 0.12, 0.02, seat, [0.2, 0.06, 0.05], [-Math.PI / 2, 0, 0], 0.7); }
  /* =================================================================
     7. COMBINER ASSEMBLY: cast arms, bolts, collimator housing, glass
     ================================================================= */
  // Tapered F-15 combiner: wide at the collimator, narrowing upward, with
  // chamfered (angled) upper corners. Thin dark anodized posts, faint
  // green-cyan optical tint (opacity 0.14) and no glowing border box.
  const GW = 0.64, GTW = 0.54, GCH = 0.065, GY0 = -0.19, GY1 = 0.19, GZ = -0.775, BEND = 0.32;
  const bendZ = x => GZ + BEND * x * x;
  const gShape = new THREE.Shape();
  gShape.moveTo(-GW / 2, GY0); gShape.lineTo(GW / 2, GY0);
  gShape.lineTo(GTW / 2, GY1 - GCH); gShape.lineTo(GTW / 2 - GCH, GY1);
  gShape.lineTo(-GTW / 2 + GCH, GY1); gShape.lineTo(-GTW / 2, GY1 - GCH);
  gShape.closePath();
  const glassGeo = new THREE.ShapeGeometry(gShape, 16);
  {
    const p = glassGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, bendZ(p.getX(i))); glassGeo.computeVertexNormals();
  }
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshPhysicalMaterial({
    color: 0x9fffe4, transparent: true, opacity: 0.14, roughness: 0.04, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.04,
    envMap: envTex, envMapIntensity: 0.18, side: THREE.DoubleSide, depthWrite: false
  }));
  glass.renderOrder = 6; rig.add(glass);
  // Faint view-angle Fresnel sheen only (no edge glow).
  const rim = new THREE.Mesh(glassGeo, new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0x5affd0) } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uCol; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <logdepthbuf_fragment>
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.0);
        gl_FragColor = vec4(uCol, clamp(fres * 0.10, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  }));
  rim.renderOrder = 7; rig.add(rim);
  const glassOutline = gShape.getSpacedPoints(72).map(p => new THREE.Vector3(p.x, p.y, bendZ(p.x)));
  const anodizedMat = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.32, metalness: 0.7, envMap: envTex, envMapIntensity: 0.6 });
  {
    // Thin anodized posts hugging each tapered side edge, from the housing to the chamfer.
    const postBolts = [];
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * (GW / 2 + 0.008), -0.232, bendZ(GW / 2) + 0.004);
      const b = new THREE.Vector3(sx * (GTW / 2 + 0.008), GY1 - GCH, bendZ(GTW / 2) + 0.004);
      const len = a.distanceTo(b);
      const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.009, len, 0.011), anodizedMat));
      post.position.copy(a).add(b).multiplyScalar(0.5);
      post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      // short angled cap following the chamfer
      const c0 = b, c1 = new THREE.Vector3(sx * (GTW / 2 - GCH + 0.004), GY1 + 0.006, bendZ(GTW / 2 - GCH) + 0.004);
      const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.007, c0.distanceTo(c1), 0.009), anodizedMat));
      cap.position.copy(c0).add(c1).multiplyScalar(0.5);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c1.clone().sub(c0).normalize());
      postBolts.push(new THREE.CylinderGeometry(0.005, 0.005, 0.005, 6).rotateZ(Math.PI / 2).translate(sx * (GW / 2 + 0.015), -0.205, bendZ(GW / 2) + 0.004));
    }
    add(new THREE.Mesh(mergeGeometries(postBolts), boltMat));
    // Collimator lens housing at the base of the combiner.
    const zB = bendZ(GW / 2);
    const hs = new THREE.Shape(); hs.moveTo(-0.15, -0.05); hs.lineTo(0.15, -0.05); hs.lineTo(0.12, 0.05); hs.lineTo(-0.12, 0.05); hs.closePath();
    const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
    hg.rotateX(Math.PI / 2); hg.translate(0, -0.19, zB - 0.02);
    add(new THREE.Mesh(hg, castMat));
    const lens = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.006, 40), new THREE.MeshPhysicalMaterial({ color: 0x0a1a14, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMap: envTex, envMapIntensity: 1.0 })));
    lens.scale.set(1, 1, 0.45); lens.position.set(0, -0.184, zB - 0.02);
  }

  /* =================================================================
     7b. HOTAS: center control stick + left twin-engine throttle quadrant
     -----------------------------------------------------------------
     Stick: ribbed rubber dust boot, charcoal shaft, contoured grip with thumb
     rest, 4-way trim hat, red pickle button, two-stage gun trigger. The gimbal
     tilts +/-16 deg in pitch and +/-18 deg in roll from the live stick commands;
     the trigger squeezes while the Vulcan fires and the pickle depresses on
     every missile / bomb release. Throttles: split levers Throttle_L / _R that
     sweep -22 deg (idle) -> +16 deg (MIL) -> +28 deg (full afterburner).
     ================================================================= */
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.78, metalness: 0.08 });
  const pickleMat = new THREE.MeshStandardMaterial({ color: 0xc8141c, roughness: 0.4, metalness: 0.1, emissive: 0x300000 });
  const stick = new THREE.Group(); stick.name = 'HOTAS_Stick';
  stick.position.set(0, -0.73, -0.31);                 // floor gimbal between the knees, below the HSI                    // floor gimbal between the pilot's knees
  rig.add(stick);
  const gimbal = new THREE.Group(); stick.add(gimbal);
  {
    // Ribbed dust boot (lathe zig-zag profile).
    const pts = [];
    for (let i = 0; i <= 12; i++) { const y = i * 0.0075; pts.push(new THREE.Vector2(0.055 - i * 0.0026 + (i % 2 ? 0.006 : 0), y)); }
    pts.push(new THREE.Vector2(0.014, 0.095));
    add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), rubberMat), stick);
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.006, 8, 28).rotateX(Math.PI / 2), castMat), stick); ring.position.y = 0.002;
  }
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.17, 14).translate(0, 0.085 + 0.02, 0), gripMat), gimbal);   // shaft
  const grip = new THREE.Group(); grip.position.set(0, 0.215, 0); grip.rotation.x = -0.12; gimbal.add(grip);
  {
    const g = new THREE.CapsuleGeometry(0.021, 0.085, 6, 16); g.scale(1, 1, 1.22);
    add(new THREE.Mesh(g, gripMat), grip);
    // finger grooves on the front of the grip
    for (let i = 0; i < 3; i++) { const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.0205, 0.0028, 6, 18, Math.PI).rotateY(Math.PI / 2), gripMat), grip); r.position.set(0, -0.035 + i * 0.02, -0.004); r.rotation.z = Math.PI / 2; }
    // thumb rest: angled shelf on the left side near the top
    const tr = add(new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.007, 0.03), gripMat), grip); tr.position.set(-0.024, 0.045, 0.002); tr.rotation.z = -0.35;
    // grip head cap
    const head = add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.022, 18), gripMat), grip); head.position.y = 0.064; head.scale.z = 1.2;
  }
  // 4-way trim hat (castle switch) on the top-left, red pickle button on top.
  const hat = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0065, 0.008, 4), silverMat), grip); hat.position.set(-0.009, 0.079, -0.006); hat.rotation.y = Math.PI / 4;
  { const nub = add(new THREE.Mesh(new THREE.SphereGeometry(0.0032, 8, 6), silverMat), hat); nub.position.y = 0.005; }
  const pickle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.007, 16), pickleMat), grip); pickle.position.set(0.008, 0.078, 0.008);
  const pickleY = pickle.position.y;
  { const g = add(new THREE.Mesh(new THREE.TorusGeometry(0.0078, 0.0016, 6, 16).rotateX(Math.PI / 2), castMat), grip); g.position.set(0.008, 0.0755, 0.008); }
  // Two-stage gun trigger: curved blade in front of the grip, pivoting at its top.
  const trigger = new THREE.Group(); trigger.position.set(0, 0.035, -0.026); grip.add(trigger);
  { const blade = add(new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0035, 6, 14, Math.PI * 0.55), castMat), trigger); blade.rotation.set(0, Math.PI / 2, Math.PI * 1.05); blade.position.set(0, -0.016, 0.004); }

  // Left console throttle quadrant.
  const quad = new THREE.Group(); quad.name = 'HOTAS_Throttle';
  quad.position.set(-0.43, -0.55, -0.27); quad.rotation.set(0.12, 0.18, 0);      // on the left console, beside the seat
  rig.add(quad);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.05, 0.19), consoleMat), quad);                        // housing
  { const track = canvasTex(256, 512, (x, w, h) => {
      x.fillStyle = '#23272b'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#9b1a1f'; x.fillRect(40, 30, w - 80, h - 60);
      x.strokeStyle = '#e8d8d8'; x.lineWidth = 3;
      for (const [t, yy] of [['MAX', 70], ['MIL', 230], ['IDLE', 430]]) { x.beginPath(); x.moveTo(40, yy + 22); x.lineTo(w - 40, yy + 22); x.stroke(); x.save(); x.translate(w / 2, yy); x.rotate(-Math.PI / 2); x.fillStyle = '#f2e6e6'; x.font = `bold 34px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 0, 0); x.restore(); }
      x.fillStyle = '#0d0f11'; x.fillRect(w / 2 - 10, 40, 20, h - 80);
    });
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.17), new THREE.MeshStandardMaterial({ map: track.t, roughness: 0.6 }));
    slot.rotation.x = -Math.PI / 2; slot.position.y = 0.0256; quad.add(slot);
    placard('FRICTION LEVER', 0.07, 0.01, quad, [0.0, 0.0262, 0.092], [-Math.PI / 2, 0, 0], 0.8); }
  placard('IDLE', 0.03, 0.008, quad, [0.045, 0.0262, 0.07], [-Math.PI / 2, 0, 0], 0.9);
  placard('AB', 0.02, 0.008, quad, [0.045, 0.0262, -0.075], [-Math.PI / 2, 0, 0], 0.9);
  const throttles = [];
  for (const [name, x] of [['Throttle_L', -0.019], ['Throttle_R', 0.019]]) {
    const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(x, 0.0, 0.0); quad.add(pivot);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.014).translate(0, 0.055, 0), castMat), pivot);   // lever arm
    const g = new THREE.Group(); g.position.set(0, 0.12, 0); pivot.add(g);
    const gg = new THREE.BoxGeometry(0.032, 0.046, 0.05, 2, 2, 2);
    { const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) * (1 - 0.25 * (y + 0.023) / 0.046)); } gg.computeVertexNormals(); }
    add(new THREE.Mesh(gg, gripMat), g);                                                                          // textured grip
    for (let k = 0; k < 4; k++) { const r = add(new THREE.Mesh(new THREE.BoxGeometry(0.0335, 0.0025, 0.004), rubberMat), g); r.position.set(0, -0.016 + k * 0.009, 0.0245); }
    const lift = add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.014), silverMat), g); lift.position.set(0, -0.026, -0.024);   // finger-lift
    const sw = add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 10).rotateZ(Math.PI / 2), keyMat), g); sw.position.set(x < 0 ? -0.017 : 0.017, 0.008, 0);
    throttles.push({ pivot, angle: -22 * D2R, lag: x < 0 ? 1 : 0.9 });
  }
  const hotas = { pitch: 0, roll: 0, trig: 0, pickle: 0, pickleT: 0, msl: null, bombs: null };
  function updateHOTAS(dt) {
    const ctl = S.ctl || { pitch: 0, roll: 0 };
    const k = Math.min(1, dt * 14);
    hotas.pitch += (clamp(ctl.pitch, -1, 1) * 16 * D2R - hotas.pitch) * k;      // pull -> grip comes back toward the pilot
    hotas.roll += (clamp(ctl.roll, -1, 1) * 18 * D2R - hotas.roll) * k;         // roll left -> grip to the left
    gimbal.rotation.set(hotas.pitch, 0, hotas.roll);
    hotas.trig += ((C.gunFiring ? 1 : 0) - hotas.trig) * Math.min(1, dt * 25);
    trigger.rotation.x = -0.32 * hotas.trig;
    // Pickle: any missile / bomb release depresses the red button for 0.25 s.
    if (hotas.msl !== null && (C.missiles < hotas.msl || C.bombs < hotas.bombs)) hotas.pickleT = 0.25;
    hotas.msl = C.missiles; hotas.bombs = C.bombs;
    hotas.pickleT = Math.max(0, hotas.pickleT - dt);
    hotas.pickle += ((hotas.pickleT > 0 ? 1 : 0) - hotas.pickle) * Math.min(1, dt * 30);
    pickle.position.y = pickleY - 0.0035 * hotas.pickle;
    const tgt = (-22 + 38 * clamp(S.throttle, 0, 1) + 12 * clamp(S.afterburner, 0, 1)) * D2R;
    for (const t of throttles) { t.angle += (tgt - t.angle) * Math.min(1, dt * 8 * t.lag); t.pivot.rotation.x = -t.angle; }   // forward = -Z
  }

  /* =================================================================
     8. SUN SHADOWS (disabled for GPU frame budget)
     ================================================================= */
  renderer.shadowMap.enabled = false;
  sunLight.castShadow = false;

  /* =================================================================
     9. LIVE INSTRUMENTS (atlas repaint: dials 15 Hz, CRTs 30 Hz, ADI ball
        and lamps every frame, caution matrix on change)
     ================================================================= */
  const eng = { nlL: 68, nlR: 68, egtL: 420, egtR: 420, noz: 80 };
  function updateEngines(dt) {
    const k = Math.min(1, dt * 1.5), t = S.throttle, ab = S.afterburner;
    const nl = 62 + 32 * t + 6 * ab, egt = 400 + 430 * t + 180 * ab;
    // Damaged F100 (combat engine state): ON_FIRE spools down toward 0 % with TEMP
    // spiking into the red; EXTINGUISHED / SEIZED cools and winds down to ~3 %;
    // RELIGHTING windmills at 28 % N2 with TEMP climbing as the igniters fire.
    const dmgT = st => st === 'ON_FIRE' ? [2, 1150, 0.5] : st === 'RELIGHTING' ? [28, 380, 1.4] : st === 'EXTINGUISHED' || st === 'SEIZED' ? [3, 140, 0.35] : null;
    const tL = dmgT(C.engL), tR = dmgT(C.engR);
    eng.nlL += ((tL ? tL[0] : nl) - eng.nlL) * k * (tL ? tL[2] : 1); eng.nlR += ((tR ? tR[0] : nl * 0.996) - eng.nlR) * k * 0.92 * (tR ? tR[2] : 1);
    eng.egtL += ((tL ? tL[1] : egt) - eng.egtL) * k * 0.8; eng.egtR += ((tR ? tR[1] : egt + 7) - eng.egtR) * k * 0.76;
    const base = 80 - 70 * smooth(t, 0.15, 0.75);                    // F100 nozzle: open at idle, tight at MIL, wide in AB
    eng.noz += ((base + (100 - base) * ab) - eng.noz) * Math.min(1, dt * 3);
  }
  function missionClock(now) {
    const t = Math.floor(now);
    return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(v => String(v).padStart(2, '0')).join(':');
  }
  const painted = {};
  const changed = (id, key) => (painted[id] === key ? false : (painted[id] = key, true));

  function paintUFC(now) {
    const clock = missionClock(now);
    if (!changed('ufc', clock)) return;
    const { ctx: x, w, h } = ufcLED;
    x.fillStyle = '#0a0c0d'; x.fillRect(0, 0, w, h);
    x.font = `bold 44px ${FONT}`; x.textBaseline = 'middle'; x.fillStyle = '#e8ecef'; x.textAlign = 'center';
    x.fillText('T ' + clock, w / 2, h / 2 + 2);
    ufcLED.t.needsUpdate = true;
  }

  // Generic analog dial painted into a 256 px cell. The static face (bands, ticks,
  // numerals, title) is rendered once per dial and cached; each refresh only blits
  // it and draws the window readout + needles.
  const faceCache = {};
  function dialFace(key, o) {
    if (faceCache[key]) return faceCache[key];
    const c = document.createElement('canvas'); c.width = c.height = GCELL;
    const x = c.getContext('2d'), cx = GCELL / 2, cy = GCELL / 2, R = GCELL * 0.46;
    x.fillStyle = '#0c0e10'; x.fillRect(0, 0, GCELL, GCELL);
    x.beginPath(); x.arc(cx, cy, R + 4, 0, Math.PI * 2); x.fillStyle = '#0c0e10'; x.fill();
    const ang = v => ((o.a0 + (o.a1 - o.a0) * clamp((v - o.min) / (o.max - o.min), 0, 1)) - 90) * D2R;
    for (const [lo, hi, col] of o.bands || []) { x.strokeStyle = col; x.lineWidth = 7; x.beginPath(); x.arc(cx, cy, R - 6, ang(lo), ang(hi)); x.stroke(); }
    x.strokeStyle = '#eef2f4'; x.fillStyle = '#eef2f4';
    for (let v = o.min; v <= o.max + 1e-6; v += o.minor) {
      const a = ang(v), major = Math.abs((v - o.min) / o.major - Math.round((v - o.min) / o.major)) < 1e-3, l = major ? 16 : 8;
      x.lineWidth = major ? 3 : 1.6;
      x.beginPath(); x.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l)); x.stroke();
      if (major && o.label) { x.font = `bold 24px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(o.label(v), cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32)); }
    }
    x.font = `bold 17px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    (o.title || '').split('\n').forEach((t, i) => x.fillText(t, cx, cy + (o.titleY ?? 34) + i * 18));
    return (faceCache[key] = c);
  }
  function dial(x, key, o) {
    const cx = GCELL / 2, cy = GCELL / 2, R = GCELL * 0.46;
    x.save();
    x.drawImage(dialFace(key, o), 0, 0);
    const ang = v => ((o.a0 + (o.a1 - o.a0) * clamp((v - o.min) / (o.max - o.min), 0, 1)) - 90) * D2R;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (o.window) { x.fillStyle = '#1b1f22'; x.fillRect(cx - 46, cy - 52, 92, 26); x.fillStyle = '#eef2f4'; x.font = `bold 20px ${FONT}`; x.fillText(o.window, cx, cy - 38); }
    for (const n of o.needles || []) {
      const a = ang(n.v), L = R * (n.len ?? 0.82);
      x.strokeStyle = x.fillStyle = n.col || '#ffffff'; x.lineWidth = n.w || 6; x.lineCap = 'round';
      x.beginPath(); x.moveTo(cx - Math.cos(a) * 14, cy - Math.sin(a) * 14); x.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); x.stroke();
    }
    x.fillStyle = '#2b3036'; x.beginPath(); x.arc(cx, cy, 9, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  // Round-robin dial scheduler: every frame each dial's needle / window values are
  // quantised into a signature (cheap numbers only); at most MAX_DIALS dials whose
  // signature changed are repainted + uploaded, starting after the last one served.
  // Fast dials (ASI, ALT, VVI, clock) get ~15-30 Hz, idle dials cost nothing.
  let gMaxSeen = 1, gaugeRR = 0;
  const MAX_DIALS = 2;
  const gaugeSig = new Float64Array(16).fill(NaN);
  const gaugeStats = { painted: 0, uploads: 0, mfd: { page: 0, paints: 0 } };
  function mfdSignature() {
    const spw = C.spw || '4AAM';
    const ammo = spw === '4AAM' ? C.aam4 : spw === 'UGB' ? C.bombs : C.qaam;
    const rld = spw === '4AAM' ? C.aam4Reload : spw === 'UGB' ? C.bombReload : C.qaamReload;
    const code = st => st === 'HEALTHY' ? 1 : st === 'ON_FIRE' ? 2 : st === 'EXTINGUISHED' ? 3 : st === 'SEIZED' ? 4 : st === 'RELIGHTING' ? 5 : 0;
    const pulse = env.getRadarPulse ? Math.floor(env.getRadarPulse() * 10) : 99;
    return [C.missiles || 0, ammo || 0, Math.round((rld || 0) * 10), C.flares || 0,
      C.chaff === undefined ? -1 : C.chaff, Math.round(100 - (C.health ?? 100)), code(C.engL), code(C.engR),
      C.esmOn ? 1 : 0, C.inESM ? 1 : 0, env.getRadarZoom ? env.getRadarZoom() : 1, pulse,
      C.dlz && C.dlz.on ? Math.round(C.dlz.r / 100) : -1, C.tti === undefined ? -1 : Math.round(C.tti * 10)].join('');
  }
  function gaugeSignature(k, kts, altFt, vs, ffL, ffR, fuel, hydP) {
    switch (k) {
      case 'asi': return Math.round(kts * 0.5) * 1000 + Math.round(S.mach * 100);
      case 'aoa': return Math.round(Math.max(0, S.alpha / D2R) * 2);
      case 'acc': return Math.round(S.gLoad * 20) * 1000 + Math.round(gMaxSeen * 10);
      case 'alt': return Math.round(altFt / 10);
      case 'vvi': return Math.round(clamp(vs, -6000, 6000) / 50);
      case 'clk': return Math.floor(Date.now() / 1000);
      case 'rpmL': return Math.round(eng.nlL * 2); case 'rpmR': return Math.round(eng.nlR * 2);
      case 'tmpL': return Math.round(eng.egtL / 4); case 'tmpR': return Math.round(eng.egtR / 4);
      case 'ffL': return Math.round(ffL / 100); case 'ffR': return Math.round(ffR / 100);
      case 'nozL': return Math.round(C.engineOut === 'L' ? 100 : eng.noz); case 'nozR': return Math.round(C.engineOut === 'R' ? 100 : eng.noz);
      case 'fuel': return Math.round(fuel / 10);
      default: return Math.round(hydP * 20);                          // hyd
    }
  }
  function paintGauges(frame) {
    const kts = S.speed * 1.94384, altFt = S.position.y * 3.28084, vs = S.velocity.y * 196.85;
    gMaxSeen = Math.max(gMaxSeen, S.gLoad);
    const pph = out => out ? 0 : 700 + 4300 * S.throttle + 17000 * S.afterburner;
    const ffL = pph(C.engineOut === 'L'), ffR = pph(C.engineOut === 'R');
    const fuel = S.fuel ?? 0, hydP = C.hydraulic ? 1.2 + 0.25 * Math.sin(frame * 0.07) : 3.0;
    let todo = 0, first = -1, second = -1;
    for (let n = 0; n < 16 && todo < MAX_DIALS; n++) {
      const i = (gaugeRR + n) % 16;
      if (gaugeSignature(GAUGE_KEYS[i], kts, altFt, vs, ffL, ffR, fuel, hydP) !== gaugeSig[i]) { if (todo) second = i; else first = i; todo++; }
    }
    if (!todo) return;
    gaugeRR = ((todo === 2 ? second : first) + 1) % 16;
    const d = new Date();
    const cells = {
      asi: { min: 0, max: 1000, a0: -150, a1: 150, major: 100, minor: 50, label: v => String(v / 100), title: 'KNOTS\nx100', titleY: -4, window: 'M ' + S.mach.toFixed(2), needles: [{ v: kts }] },
      aoa: { min: 0, max: 45, a0: -135, a1: 135, major: 10, minor: 5, label: v => String(v), title: 'ANGLE OF\nATTACK', bands: [[25, 32, '#ffb020'], [32, 45, '#e0302a']], needles: [{ v: Math.max(0, S.alpha / D2R) }] },
      acc: { min: -4, max: 10, a0: -150, a1: 150, major: 2, minor: 1, label: v => String(v), title: 'ACCEL\ng UNITS', bands: [[7.5, 10, '#e0302a']], needles: [{ v: gMaxSeen, col: '#ff4a3a', w: 3, len: 0.9 }, { v: S.gLoad }] },
      alt: { min: 0, max: 1000, a0: 0, a1: 360, major: 100, minor: 20, label: v => (v < 1000 ? String(v / 100) : ''), title: 'ALT', titleY: 30, window: String(Math.max(0, Math.round(altFt / 10) * 10)).padStart(5, '0'), needles: [{ v: ((altFt % 1000) + 1000) % 1000 }] },
      vvi: { min: -6000, max: 6000, a0: -170, a1: 10, major: 2000, minor: 1000, label: v => String(Math.abs(v / 1000)), title: 'CLIMB\nx1000 FPM', titleY: 20, needles: [{ v: clamp(vs, -6000, 6000) }] },
      clk: { min: 0, max: 12, a0: 0, a1: 360, major: 1, minor: 0.5, label: v => (v > 0 && v < 12 ? String(v) : v === 0 ? '12' : ''), title: '', needles: [{ v: (d.getHours() % 12) + d.getMinutes() / 60, len: 0.5, w: 7 }, { v: d.getMinutes() / 5, len: 0.78, w: 5 }, { v: d.getSeconds() / 5, len: 0.85, w: 2, col: '#ff4a3a' }] },
      rpmL: { min: 0, max: 110, a0: -135, a1: 135, major: 10, minor: 5, label: v => (v % 20 === 0 ? String(v) : ''), title: 'PERCENT\nRPM  L', bands: [[96, 110, '#e0302a']], needles: [{ v: eng.nlL }] },
      rpmR: { min: 0, max: 110, a0: -135, a1: 135, major: 10, minor: 5, label: v => (v % 20 === 0 ? String(v) : ''), title: 'PERCENT\nRPM  R', bands: [[96, 110, '#e0302a']], needles: [{ v: eng.nlR }] },
      tmpL: { min: 200, max: 1200, a0: -135, a1: 135, major: 200, minor: 100, label: v => String(v / 100), title: 'TEMP\n°C x100  L', bands: [[980, 1200, '#e0302a']], needles: [{ v: eng.egtL }] },
      tmpR: { min: 200, max: 1200, a0: -135, a1: 135, major: 200, minor: 100, label: v => String(v / 100), title: 'TEMP\n°C x100  R', bands: [[980, 1200, '#e0302a']], needles: [{ v: eng.egtR }] },
      ffL: { min: 0, max: 20000, a0: -135, a1: 135, major: 5000, minor: 2500, label: v => String(v / 1000), title: 'FUEL FLOW\nPPH  L', window: String(Math.round(ffL / 100) * 100), needles: [{ v: ffL }] },
      ffR: { min: 0, max: 20000, a0: -135, a1: 135, major: 5000, minor: 2500, label: v => String(v / 1000), title: 'FUEL FLOW\nPPH  R', window: String(Math.round(ffR / 100) * 100), needles: [{ v: ffR }] },
      nozL: { min: 0, max: 100, a0: -135, a1: 135, major: 20, minor: 10, label: v => String(v), title: 'NOZ POS\n% OPEN  L', needles: [{ v: C.engineOut === 'L' ? 100 : eng.noz }] },
      nozR: { min: 0, max: 100, a0: -135, a1: 135, major: 20, minor: 10, label: v => String(v), title: 'NOZ POS\n% OPEN  R', needles: [{ v: C.engineOut === 'R' ? 100 : eng.noz }] },
      fuel: { min: 0, max: 14000, a0: -135, a1: 135, major: 2000, minor: 1000, label: v => String(v / 1000), title: 'INTERNAL\nLBS x1000', bands: [[0, 2000, '#e0302a']], window: String(Math.round(fuel / 10) * 10), needles: [{ v: fuel }] },
      hyd: { min: 0, max: 4, a0: -135, a1: 135, major: 1, minor: 0.5, label: v => String(v), title: 'HYD\nx1000 PSI', bands: [[0, 1.5, '#e0302a']], needles: [{ v: hydP }] }
    };
    for (const i of todo === 2 ? [first, second] : [first]) {
      const k = GAUGE_KEYS[i];
      gaugeSig[i] = gaugeSignature(k, kts, altFt, vs, ffL, ffR, fuel, hydP);
      dial(gCell.x, k, cells[k]);
      uploadCell(gCell, gaugeAtlas, i % 4, Math.floor(i / 4), GCELL);
      gaugeStats.painted++; gaugeStats.uploads++;
    }
  }

  // ---- VSD sub-pages: all three paint into the same 512-unit dCell canvas ----
  function paintTacRadar(x, hRad, now) {
    const rangeM = env.getRadarZoom ? env.getRadarZoom() : 10000;
    const cx = 256, cy = 300, R = 190, scale = R / rangeM;
    x.strokeStyle = 'rgba(0,255,102,0.32)'; x.lineWidth = 1.5;
    for (const fr of [0.25, 0.5, 1]) { x.beginPath(); x.arc(cx, cy, R * fr, 0, Math.PI * 2); x.stroke(); }
    for (let a = 0; a < 360; a += 30) {
      const r = a * D2R;
      x.beginPath(); x.moveTo(cx + Math.sin(r) * R * 0.94, cy - Math.cos(r) * R * 0.94);
      x.lineTo(cx + Math.sin(r) * R, cy - Math.cos(r) * R); x.stroke();
    }
    const a = now * Math.PI;                              // one revolution every 2 s
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a - 20 * D2R, a); x.closePath();
    x.fillStyle = 'rgba(0,255,102,0.18)'; x.fill();
    x.strokeStyle = '#00ff66'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); x.stroke();
    const cs = Math.cos(hRad), sn = Math.sin(hRad);
    // Friendly ESM umbrella on the tactical display.
    if (C.esmOn && C.esmPos) {
      const dx = C.esmPos.x - S.position.x, dz = C.esmPos.z - S.position.z;
      _mrx = dx * cs + dz * sn; _mry = -dx * sn + dz * cs;
      const px = cx + _mrx * scale, py = cy + _mry * scale;
      x.strokeStyle = 'rgba(0,200,255,0.55)'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(px, py, 4500 * scale, 0, Math.PI * 2); x.stroke();
      x.fillStyle = 'rgba(0,200,255,0.06)'; x.fill();
    }
    const project = p => {
      const rx = p.x - S.position.x, rz = p.z - S.position.z;
      _mrx = rx * cs + rz * sn; _mry = -rx * sn + rz * cs;
      return _mrx * _mrx + _mry * _mry < R * R;
    };
    const ws = env.getWingmen ? env.getWingmen() : null;
    if (ws) for (let i = 1; i < ws.length; i++) {
      const w = ws[i]; if (!w || w.alive === false || !project(w.pos)) continue;
      const px = cx + _mrx * scale, py = cy + _mry * scale;
      x.fillStyle = '#5fe8ff'; x.beginPath(); x.moveTo(px, py - 8); x.lineTo(px + 7, py + 6); x.lineTo(px - 7, py + 6); x.closePath(); x.fill();
      x.font = `11px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('W' + (i + 1), px + 9, py);
    }
    for (const e of env.getEnemies ? env.getEnemies() : []) {
      if (!e.alive || !project(e.pos)) continue;
      const px = cx + _mrx * scale, py = cy + _mry * scale, ace = e.aceFlight || e.ace;
      x.strokeStyle = x.fillStyle = ace ? '#ffd45a' : '#ff4d3d'; x.lineWidth = 2;
      x.beginPath(); x.rect(px - 6, py - 6, 12, 12); ace ? x.fill() : x.stroke();
      if (ace) { x.font = `11px ${FONT}`; x.textAlign = 'left'; x.fillText('ACE', px + 9, py); }
    }
    for (const t of env.getStrikeTargets ? env.getStrikeTargets() : []) {
      if (!t.alive || !project(t.pos)) continue;
      const px = cx + _mrx * scale, py = cy + _mry * scale;
      x.strokeStyle = '#ffbf3f'; x.lineWidth = 2; x.beginPath();
      x.moveTo(px, py - 7); x.lineTo(px + 7, py); x.lineTo(px, py + 7); x.lineTo(px - 7, py); x.closePath(); x.stroke();
    }
    x.fillStyle = '#00ff66'; x.beginPath(); x.moveTo(cx, cy - 13); x.lineTo(cx + 9, cy + 9); x.lineTo(cx - 9, cy + 9); x.closePath(); x.fill();
    x.font = `13px ${FONT}`; x.textAlign = 'right'; x.textBaseline = 'top'; x.fillText(Math.round(rangeM / 1852) + ' NM', 500, 484);
    if (env.getRadarPulse && env.getRadarPulse() < 0.9) {
      const p = env.getRadarPulse();
      x.save(); x.globalAlpha = 1 - p / 0.9; x.strokeStyle = '#00ff66'; x.lineWidth = 3;
      x.beginPath(); x.arc(cx, cy, (p / 0.9) * R, 0, Math.PI * 2); x.stroke(); x.restore();
    }
  }
  function paintStores(x, now) {
    const sc = 512 * 0.6 / 2, cx = 256, cy = 232;
    x.strokeStyle = '#00ff66'; x.lineWidth = 2;
    for (const side of [-1, 1]) {
      x.beginPath();
      for (let i = 0; i < MFD_PLANFORM.length; i++) {
        const p = MFD_PLANFORM[i], px = cx + side * p[0] * sc, py = cy + p[1] * sc;
        if (i) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.closePath(); x.stroke();
    }
    const flash = Math.floor(now * 2) % 2 === 0;
    const engCol = st => st === 'HEALTHY' ? '#00ff66' : st === 'ON_FIRE' ? (flash ? '#ff2e43' : '#551015')
      : st === 'RELIGHTING' ? '#ffbf3f' : '#5a6a60';
    x.font = `15px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = engCol(C.engL); x.fillRect(170, 400, 76, 28);
    x.fillStyle = engCol(C.engR); x.fillRect(266, 400, 76, 28);
    x.fillStyle = '#010a05'; x.font = `12px ${FONT}`;
    x.fillText('L ENG', 208, 414); x.fillText('R ENG', 304, 414);
    x.fillStyle = '#8fffbd'; x.font = `11px ${FONT}`;
    x.fillText(String(C.engL || '-'), 208, 436); x.fillText(String(C.engR || '-'), 304, 436);
    const dmg = Math.round(100 - (C.health ?? 100));
    x.fillStyle = '#00ff66'; x.textAlign = 'left'; x.font = `16px ${FONT}`; x.fillText('DMG ' + dmg + '%', 16, 460);
    x.fillStyle = dmg >= 55 ? '#ff2e43' : dmg >= 25 ? '#ffbf3f' : '#00ff66';
    x.fillRect(16, 476, 480 * Math.min(1, dmg / 100), 10);
    x.strokeStyle = 'rgba(0,255,102,0.4)'; x.lineWidth = 1; x.strokeRect(16, 476, 480, 10);
    const spw = C.spw || '4AAM';
    const ammo = spw === '4AAM' ? C.aam4 : spw === 'UGB' ? C.bombs : C.qaam;
    const rld = spw === '4AAM' ? C.aam4Reload : spw === 'UGB' ? C.bombReload : C.qaamReload;
    x.fillStyle = '#00ff66'; x.font = `16px ${FONT}`;
    if (C.weaponsLock && C.weaponsLock.msl && C.weaponsLock.spw) {
      x.fillText('GUN ONLY', 16, 36);
    } else {
      x.fillText('MSL ' + (C.missiles || 0), 16, 36);
      x.fillText(spw + ' ' + (ammo || 0), 16, 58);
    }
    if (rld > 0) x.fillText('RLD ' + rld.toFixed(1), 150, 58);
    x.fillText('FLR ' + (C.flares ?? 0), 320, 36);
    x.fillText('CHF ' + (C.chaff === undefined ? '--' : C.chaff), 320, 58);
  }
  function paintThreatScope(x, now) {
    const cx = 256, cy = 270, R = 215;
    x.strokeStyle = 'rgba(0,255,102,0.38)'; x.lineWidth = 1.5;
    for (const f of [0.25, 0.5, 0.75, 1]) { x.beginPath(); x.arc(cx, cy, R * f, 0, Math.PI * 2); x.stroke(); }
    for (let a = 0; a < 360; a += 30) {
      const r = a * D2R; x.beginPath(); x.moveTo(cx + Math.sin(r) * R * 0.9, cy - Math.cos(r) * R * 0.9);
      x.lineTo(cx + Math.sin(r) * R, cy - Math.cos(r) * R); x.stroke();
    }
    x.fillStyle = '#00ff66'; x.beginPath(); x.moveTo(cx, cy - 11); x.lineTo(cx + 8, cy + 9); x.lineTo(cx - 8, cy + 9); x.closePath(); x.fill();
    let msl = 0, locks = 0;
    x.font = `15px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const r of C.rwr || []) {
      const sx = Math.sin(r.b), sy = -Math.cos(r.b);
      if (r.kind === 'msl') {
        msl++;
        const on = Math.floor(now * 4) % 2 === 0; if (!on) continue;
        x.strokeStyle = x.fillStyle = r.g === 'RADAR' ? '#ffbf3f' : '#ff4d3d'; x.lineWidth = 3;
        x.beginPath(); x.moveTo(cx + sx * 16, cy + sy * 16); x.lineTo(cx + sx * R, cy + sy * R); x.stroke();
        x.fillText(r.g === 'RADAR' ? 'RDR' : 'IR', cx + sx * (R - 24), cy + sy * (R - 24));
      } else if (typeof r.id === 'string') {
        x.fillStyle = '#ffbf3f'; x.fillText('SHP', cx + sx * R * 0.82, cy + sy * R * 0.82);
      } else {
        if (r.kind === 'lock') locks++;
        const rr = r.kind === 'lock' ? R * 0.55 : R * 0.82;
        x.strokeStyle = x.fillStyle = r.ace ? '#ffd45a' : '#ffbf3f'; x.lineWidth = 3;
        const px = cx + sx * rr, py = cy + sy * rr;
        x.beginPath(); x.moveTo(px - sx * 10 - sy * 6, py - sy * 10 + sx * 6);
        x.lineTo(px + sx * 10, py + sy * 10);
        x.lineTo(px - sx * 10 + sy * 6, py - sy * 10 - sx * 6); x.stroke();
        if (r.ace) x.fillText('ACE', px + sx * 24, py + sy * 24);
      }
    }
    x.fillStyle = '#00ff66'; x.textAlign = 'center'; x.font = `14px ${FONT}`;
    x.fillText(`MSL ${msl} // LOCKS ${locks}`, cx, 500);
  }

  // CRT displays: VSD radar (0,0), round TEWS (1,0), HSI (1,1) of a 2 x 2 atlas of
  // 384 px cells. One display is repainted per frame (each ~20 Hz at 60 fps) in a
  // 512-unit drawing space scaled to the 384 px cell, then copied into its cell.
  function paintDisplays(frame, now) {
    const which = mfdDirty ? 0 : frame % 3, x = dCell.x, hRad = S.heading * D2R;
    x.setTransform(DCELL / 512, 0, 0, DCELL / 512, 0, 0);
    paintDisplay(which, x, hRad, now);
    x.setTransform(1, 0, 0, 1, 0, 0);
    uploadCell(dCell, dispAtlas, which === 0 ? 0 : 1, which === 2 ? 1 : 0, DCELL);
    gaugeStats.uploads++;
    if (which === 0) { mfdDirty = false; gaugeStats.mfd.paints++; }
  }
  function paintDisplay(which, x, hRad, now) {
    // --- VSD: three selectable pages on the same canvas and CanvasTexture
    if (which === 0) {
      x.save(); x.beginPath(); x.rect(0, 0, 512, 512); x.clip();
      x.fillStyle = '#010a05'; x.fillRect(0, 0, 512, 512);
      x.fillStyle = '#00ff66'; x.font = `16px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'top';
      x.fillText(`MFD ${mfdPage + 1}/3 // ${MFD_PAGES[mfdPage]}`, 10, 8);
      if (mfdPage === 0) paintTacRadar(x, hRad, now);
      else if (mfdPage === 1) paintStores(x, now);
      else paintThreatScope(x, now);
      x.restore();
      return;
    }
    // --- TEWS round scope: threat bearings from the RWR picture
    if (which === 1) {
    x.save();
    x.fillStyle = '#04100a'; x.fillRect(0, 0, 512, 512);
    const cx = 256, cy = 256, R = 230;
    x.strokeStyle = 'rgba(70,255,140,0.4)'; x.lineWidth = 2;
    for (const f of [0.33, 0.66, 1]) { x.beginPath(); x.arc(cx, cy, R * f, 0, Math.PI * 2); x.stroke(); }
    for (let a = 0; a < 360; a += 30) { const r = a * D2R; x.beginPath(); x.moveTo(cx + Math.sin(r) * R * 0.92, cy - Math.cos(r) * R * 0.92); x.lineTo(cx + Math.sin(r) * R, cy - Math.cos(r) * R); x.stroke(); }
    x.fillStyle = '#46ff8c'; x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 9, cy + 10); x.lineTo(cx - 9, cy + 10); x.closePath(); x.fill();
    x.font = `bold 34px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const r of C.rwr || []) {
      const rr = r.kind === 'msl' ? R * 0.3 : r.kind === 'lock' ? R * 0.55 : R * 0.82;
      const px = cx + Math.sin(r.b) * rr, py = cy - Math.cos(r.b) * rr;
      const flash = r.kind === 'msl' || r.kind === 'lock' ? Math.floor(now * 6) % 2 : 1;
      x.fillStyle = r.kind === 'msl' ? '#ff4a3a' : r.kind === 'lock' ? '#ffb020' : '#46ff8c';
      if (flash) x.fillText(r.kind === 'msl' ? 'M' : '29', px, py);
      if (r.kind !== 'paint') { x.strokeStyle = x.fillStyle; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 26, 0, Math.PI * 2); x.stroke(); }
    }
    x.restore();
    return;
    }
    // --- HSI: rotating compass rose, lubber line, bearing bug to the target
    x.save();
    x.fillStyle = '#16191c'; x.fillRect(0, 0, 512, 512);
    x.save(); x.translate(256, 256); x.rotate(-hRad);
    x.strokeStyle = x.fillStyle = '#eef2f4'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let a = 0; a < 360; a += 5) {
      const r = a * D2R, l = a % 30 === 0 ? 26 : a % 10 === 0 ? 16 : 9;
      x.lineWidth = a % 30 === 0 ? 4 : 2;
      x.beginPath(); x.moveTo(Math.sin(r) * 230, -Math.cos(r) * 230); x.lineTo(Math.sin(r) * (230 - l), -Math.cos(r) * (230 - l)); x.stroke();
      if (a % 30 === 0) {
        x.save(); x.translate(Math.sin(r) * 186, -Math.cos(r) * 186); x.rotate(r);
        x.font = `bold ${a % 90 === 0 ? 40 : 30}px ${STENCIL}`;
        x.fillText(a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), 0, 0); x.restore();
      }
    }
    // bearing bug: designated air target, else the designated / nearest surface target
    const tgt = (C.designated && C.designated.alive && C.designated.pos) || (C.groundTgt && C.groundTgt.pos) || null;
    if (tgt) {
      const b = Math.atan2(tgt.x - S.position.x, -(tgt.z - S.position.z));
      x.fillStyle = '#ff4a3a'; x.save(); x.rotate(b); x.fillRect(-10, -232, 20, 26); x.restore();
    }
    x.restore();
    x.fillStyle = '#ff9a1a'; x.beginPath(); x.moveTo(256, 30); x.lineTo(246, 52); x.lineTo(266, 52); x.closePath(); x.fill();   // lubber line
    x.strokeStyle = '#eef2f4'; x.lineWidth = 4; x.beginPath(); x.moveTo(256, 200); x.lineTo(256, 312); x.moveTo(216, 256); x.lineTo(296, 256); x.stroke();
    x.font = `bold 26px ${FONT}`; x.fillStyle = '#eef2f4'; x.textAlign = 'left'; x.textBaseline = 'top';
    const miles = tgt ? Math.hypot(tgt.x - S.position.x, tgt.z - S.position.z) / 1852 : 0;
    x.fillText(String(Math.round(miles)).padStart(4, '0'), 14, 10); x.font = `16px ${FONT}`; x.fillText('MILES', 14, 40);
    x.textAlign = 'right'; x.font = `bold 26px ${FONT}`; x.fillText(String(Math.round(S.heading)).padStart(3, '0'), 498, 10); x.font = `16px ${FONT}`; x.fillText('COURSE', 498, 40);
    x.restore();
  }

  // Caution / warning matrix: lit by fuel, G, battle damage and system state.
  function cautionState(now) {
    const dmg = 100 - C.health, low = (S.fuel ?? 99999) < 2000, flash = Math.floor(now * 3) % 2 === 0;
    return {
      'AVIONICS\nFAULT': dmg >= 60, 'ELEC SYS': dmg >= 85, 'EQUIP\nHOT': !!C.gunOverheat, 'L GEN': C.engineOut === 'L', 'R GEN': C.engineOut === 'R',
      'UT HYD': !!C.hydraulic, 'FL HYD': !!C.hydraulic && dmg >= 50, 'OXYGEN': (S.gStrain || 0) > 0.72, 'L FUEL\nLOW': low, 'R FUEL\nLOW': low,
      'FWD\nFUEL LOW': low, 'AFT\nFUEL LOW': low, 'OVERHEAT': !!C.engineFire && flash, 'OVER G': S.gLoad > 8.6 || (S.gStrain || 0) > 0.85,
      'LOW\nALT': (S.radalt ?? 999) < 150 && !C.dead, 'STORES\nCONFIG': C.weapon === 'BOMB' && C.bombReload > 0, 'IFF': C.dead,
      'AIR DATA\nCOMPUTER': !!S.stalled, 'L FUEL\nPRESS': C.engineOut === 'L', 'R FUEL\nPRESS': C.engineOut === 'R'
    };
  }
  let cautionLit = 0;
  function paintCaution(now) {
    const st = cautionState(now);
    const key = CAUTIONS.map(c => (st[c] ? 1 : 0)).join('');
    cautionLit = key.split('1').length - 1;
    if (!changed('caution', key)) return;
    const { ctx: x, w, h } = caution;
    x.fillStyle = '#121416'; x.fillRect(0, 0, w, h);
    const cols = 3, rows = Math.ceil(CAUTIONS.length / cols), cw = w / cols, ch = h / rows;
    CAUTIONS.forEach((lab, i) => {
      const tx = (i % cols) * cw + 4, ty = Math.floor(i / cols) * ch + 4, tw = cw - 8, th = ch - 8, on = !!st[lab];
      x.fillStyle = on ? '#ffa31a' : '#2a1a0c'; x.fillRect(tx, ty, tw, th);
      if (on) { const g = x.createRadialGradient(tx + tw / 2, ty + th / 2, 3, tx + tw / 2, ty + th / 2, tw * 0.7); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(tx, ty, tw, th); }
      x.fillStyle = on ? '#1a0e00' : 'rgba(255,170,80,0.42)';
      x.font = `bold 15px ${STENCIL}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      const lines = lab.split('\n');
      lines.forEach((l, k) => x.fillText(l, tx + tw / 2, ty + th / 2 + (k - (lines.length - 1) / 2) * 16));
    });
    caution.t.needsUpdate = true;
  }
  // NVG-compatible lighting: unlit instrument faces, CRTs and lamps are dimmed
  // while the goggles are on so the tube gain does not bloom them to white.
  let nvgDim = 1;
  function setNVG(on) {
    nvgDim = on ? 0.16 : 1;
    for (const m of [gaugeMat, dispMat, ufcMat, cautionMat2, adiMat]) m.color.setScalar(on ? 0.16 : 1);
    knobMat.color.set(on ? 0x39424a : 0xa9bccb); toggleMat.color.set(on ? 0x555a5f : 0xd6dadf);
    glassSheen.visible = !on;                         // env-map glints would bloom under the tube gain
    adiMat.emissiveIntensity = on ? 0.06 : 0.45;
  }
  function updateLamps(now) {
    const flash = Math.floor(now * 2.5) % 2 === 0, set = (m, on, k = 2.4) => { m.emissiveIntensity = on ? k * nvgDim : 0; };
    const masterCaution = !C.dead && (cautionLit > 0 || C.health < 100 || C.missileWarning > 0);
    set(lamps.caution, masterCaution && flash); set(lamps.aisam, (C.rwrLevel || 0) >= 2 && flash);
    set(lamps.ag, C.weapon === 'BOMB', 1.6); set(lamps.adi, !C.dead, 1.6); set(lamps.vi, false);
    const droop = Math.max(smooth(-S.speed * 1.94384, -260, -170), smooth(S.alpha, 0.12, 0.24));
    set(lamps.flap1, droop > 0.3, 1.6); set(lamps.flap2, droop > 0.3, 1.6);
    // Gear: three greens as each unit locks down (nose first), handle follows the command,
    // red handle light while any unit is in transit.
    const gp = S.gear || 0;
    set(lamps.nose, gp >= 0.96, 2.2); set(lamps.left, gp >= 0.985, 2.2); set(lamps.right, gp >= 0.995, 2.2);
    gearHandle.rotation.x += ((S.gearDown ? 0.55 : -0.45) - gearHandle.rotation.x) * 0.25;
    gearKnobMat.emissiveIntensity = gp > 0.01 && gp < 0.99 ? 2.6 * nvgDim : 0;
    set(lamps.fireL, !!C.engineFire && C.engineOut === 'L' && flash, 3); set(lamps.fireR, !!C.engineFire && C.engineOut === 'R' && flash, 3);
    adiOuter.rotation.z = -S.bank;                       // ball rolls about the view axis ...
    adiInner.rotation.x = S.pitch;                       // ... and pitches inside the roll
  }

  /* =================================================================
     10. CAMERA RIG: pilot head decoupled from the airframe
     -----------------------------------------------------------------
     The cockpit group is rigidly bolted to the jet; the camera (pilot's head)
     has its own spring-damped orientation and position relative to it:
       - roll inertia: the canopy bow / combiner roll up to 11 deg ahead of the head
       - look-into-turn: up to +14 deg pitch and 12 deg yaw toward the low wing
       - eye shifts: +/-0.09 m sway, -0.07 m G compression, +/-0.05 m fore/aft
     HUD symbology is projected from world directions through this camera, so it
     stays on the real horizon whatever the head does.
     ================================================================= */
  const head = { yaw: 0, roll: 0, pitch: 0, look: 0, lookYaw: 0, off: new THREE.Vector3() };
  const MAX_ROLL_LAG = 11 * D2R, LOOK_PITCH = 14 * D2R, LOOK_YAW = 12 * D2R;
  const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _q = new THREE.Quaternion(), _offT = new THREE.Vector3();
  let active = false, frame = 0, freeLook = null;
  const _lean = new THREE.Vector3();
  function setFreeLook(v) { freeLook = v; }               // { yaw, pitch, lean } shared by reference
  function setActive(on) {
    active = on; rig.visible = on; sunLight.castShadow = false;
  }
  function update(dt, now, eyeWorld, jetQuat) {
    if (!active) return;
    frame++;
    rig.position.copy(eyeWorld); rig.quaternion.copy(jetQuat); rig.updateMatrixWorld(true);
    const ex = k => Math.min(1, k * dt);                 // exponential spring factor

    // Roll inertia: the head resists the airframe's roll, so the canopy bow and
    // combiner visibly swing up to 11 deg ahead of it (spring 8.5/s). A scripted
    // barrel roll uses a softer gain so the 360 stays controlled, not jarring.
    const rollGain = S.barrelRoll ? 0.09 : 0.14;
    const tRoll = clamp(-S.rollRate * rollGain, -MAX_ROLL_LAG, MAX_ROLL_LAG);
    head.roll += (tRoll - head.roll) * ex(S.barrelRoll ? 5.5 : 8.5);

    // Look-into-turn: banked (> 15 deg) and pulling -> eyes lift toward the turn apex
    // through the upper canopy and swing toward the low wing.
    const bankAbs = Math.abs(S.bank);
    const pull = clamp(S.pitchRate / 1.2, 0, 1);
    const lookK = smooth(bankAbs, 15 * D2R, 60 * D2R) * pull;
    head.look += (lookK * LOOK_PITCH - head.look) * ex(3.5);
    head.lookYaw += (Math.sign(S.bank) * lookK * LOOK_YAW - head.lookYaw) * ex(3.5);
    // Small G slump on the pitch axis, quick yaw/pitch twitch from rate changes.
    const tPitch = clamp(-(S.gLoad - 1) * 0.004 - S.pitchRate * 0.02, -0.05, 0.03);
    head.pitch += (tPitch - head.pitch) * ex(9);
    const tYaw = clamp(-S.yawRate * 0.05, -0.04, 0.04);
    head.yaw += (tYaw - head.yaw) * ex(9);

    // Eye position shifts inside the canopy (jet frame, metres).
    const airbrake = S.throttle < 0.12 && S.afterburner < 0.05 ? 1 : 0;
    _offT.set(
      clamp(S.rollRate * 0.026 + S.yawRate * 0.05, -0.09, 0.09),                  // lateral sway
      -0.07 * smooth(S.gLoad, 1.2, 9),                                              // G compression
      0.05 * S.afterburner - 0.05 * airbrake                                        // pushed back by AB, forward on airbrake
    );
    head.off.lerp(_offT, ex(6));

    // Free look (Alt / MMB, src/freelook.js): head turn on top of the motion springs,
    // plus a shoulder lean past 90 deg -- toward the look side and 8 cm forward --
    // so the eye clears the ACES II headrest instead of turning inside it.
    const fy = freeLook ? freeLook.yaw : 0, fpch = freeLook ? freeLook.pitch : 0, lean = freeLook ? freeLook.lean : 0;
    _lean.set(-0.12 * lean, 0.02 * Math.abs(lean), -0.08 * Math.abs(lean));

    const vib = 0.0015 * (S.afterburner * 0.6 + smooth(S.gLoad, 5, 12) + smooth(S.mach, 0.92, 1.05) * 0.5);
    _e.set(PITCH_BASE + head.look + head.pitch + fpch + (Math.random() - 0.5) * vib,
      head.lookYaw + head.yaw + fy + (Math.random() - 0.5) * vib,
      head.roll);
    _q.setFromEuler(_e);
    camera.position.copy(head.off).add(_lean).applyQuaternion(jetQuat).add(eyeWorld);
    camera.quaternion.copy(jetQuat).multiply(_q);

    updateEngines(dt);
    updateHOTAS(dt);
    {
      const sig = mfdSignature();
      if (sig !== mfdSig) { mfdSig = sig; mfdDirty = true; }
      const fl = Math.floor(now * 2) % 2;
      if (fl !== mfdFlash) {
        if (C.engL === 'ON_FIRE' || C.engR === 'ON_FIRE') mfdDirty = true;
        mfdFlash = fl;
      }
    }
    paintUFC(now); paintGauges(frame); paintDisplays(frame, now); paintCaution(now); updateLamps(now);
  }

  // Merge static cockpit meshes by material + renderOrder, leaving animated HOTAS/ADI/gear subtrees intact.
  {
    const dynamicRoots = new Set([adiOuter, gearHandle, gimbal, ...throttles.map(t => t.pivot)]);
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

  const _w = new THREE.Vector3();
  return {
    rig, setActive, update, missionClock, setNVG, setFreeLook,
    setMfdPage(p) { mfdPage = ((p % 3) + 3) % 3; mfdDirty = true; gaugeStats.mfd.page = mfdPage; },
    get active() { return active; },
    get gaugeStats() { return gaugeStats; },          // dials repainted / cell uploads since start
    get hotas() {
      return { pitch: +(hotas.pitch / D2R).toFixed(1), roll: +(hotas.roll / D2R).toFixed(1), trig: +hotas.trig.toFixed(2), pickle: +hotas.pickle.toFixed(2),
        thrL: +(throttles[0].angle / D2R).toFixed(1), thrR: +(throttles[1].angle / D2R).toFixed(1) };
    },
    glassOutlineWorld() { return glassOutline.map(p => _w.copy(p).applyMatrix4(rig.matrixWorld).clone()); },
    get head() {
      return { roll: +(head.roll / D2R).toFixed(1), lookPitch: +(head.look / D2R).toFixed(1), lookYaw: +(head.lookYaw / D2R).toFixed(1),
        off: head.off.toArray().map(v => +v.toFixed(3)) };
    }
  };
}
