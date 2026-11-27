// ANGELS ZERO — Terrain v2 living-world clutter, placed on the baked terrain packs.
//
// createClutter(THREE, env) -> { group, setMap(mode, sampler), update(dt, t, night, camPos),
//                                collision(mode), audit(mode), stats() }
//   env: { G (geography), coniferGeo, foliageMat, gorgeDist, inGorgeBox, portCity [x, z] }
//
// Draw calls (all maps share these objects; 9 max):
//   conifer / broadleaf / boulder   3 InstancedMesh, chunk-streamed around the camera
//                                   (<= 30k trees within 8 km, <= 6k boulders within 4 km)
//   houses                          1 InstancedMesh (village clusters in flat farm valleys)
//   roads / landmarks / lake        1 Mesh each per map (merged, vertex coloured)
//   cars + lights                   1 InstancedMesh + 1 Points (village windows + headlights)
//
// Placement contract: every prop sits on sampler.baseHeight() and only on ground with slope
// < 0.33, where the clipmap crag gate is exactly 0 — so baseHeight == heightAt == the GPU
// surface (no floating / buried props; audit() measures it). Candidate tables and static
// meshes are built once per map (memoised); update() streams instances with zero allocation.

const CH = 1000;                       // streaming chunk (m)
const TAU = Math.PI * 2;

export function createClutter(THREE, env) {
  const { G } = env;
  const group = new THREE.Group(); group.name = 'clutter';
  env.scene.add(group);
  const ss = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------------ geometry helpers */
  // Merge (geometry, matrix, rgb) parts into one non-indexed BufferGeometry with vertex colours.
  function mergeParts(parts) {
    const P = [], N = [], C = [], m3 = new THREE.Matrix3(), v = new THREE.Vector3();
    for (const [g0, mtx, rgb] of parts) {
      const g = g0.index ? g0.toNonIndexed() : g0.clone();
      if (mtx) g.applyMatrix4(mtx);
      g.computeVertexNormals();
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(rgb[0], rgb[1], rgb[2]);
      }
      g.dispose();
    }
    void m3; void v;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    out.computeBoundingSphere();
    return out;
  }
  const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), E3 = new THREE.Euler();
  const mtx = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
    new THREE.Matrix4().compose(V3.set(x, y, z), Q4.setFromEuler(E3.set(rx, ry, rz)), S3.set(sx, sy, sz));
  const hex = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

  const broadleafGeo = mergeParts([
    [new THREE.CylinderGeometry(0.4, 0.6, 5, 5, 1, true), mtx(0, 2.5, 0), [0.40, 0.31, 0.22]],
    [new THREE.IcosahedronGeometry(4.2, 0), mtx(0, 7.4, 0, 0.4, 1, 0.82, 1), [0.9, 0.95, 0.8]],
    [new THREE.IcosahedronGeometry(3.0, 0), mtx(1.6, 9.6, -0.8, 1.1, 1, 0.85, 1), [1.0, 1.04, 0.86]]
  ]);
  const boulderGeo = (() => {
    const g = new THREE.DodecahedronGeometry(1, 0).toNonIndexed(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.22 * Math.sin(x * 4.1 + z * 2.3) * Math.cos(y * 3.7);
      p.setXYZ(i, x * k * 1.25, y * k * 0.62, z * k);
    }
    return mergeParts([[g, null, [0.56, 0.54, 0.51]]]);
  })();
  const houseGeo = (() => {
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.55, 1, -0.55, 0.55, 1, -0.55, 0, 1.42, -0.55,   0.55, 1, 0.55, -0.55, 1, 0.55, 0, 1.42, 0.55,
      -0.55, 1, 0.55, -0.55, 1, -0.55, 0, 1.42, -0.55,   -0.55, 1, 0.55, 0, 1.42, -0.55, 0, 1.42, 0.55,
      0.55, 1, -0.55, 0.55, 1, 0.55, 0, 1.42, 0.55,      0.55, 1, -0.55, 0, 1.42, 0.55, 0, 1.42, -0.55], 3));
    return mergeParts([
      [new THREE.BoxGeometry(1, 1, 1), mtx(0, 0.5, 0), [0.93, 0.9, 0.84]],
      [roof, null, [0.62, 0.26, 0.19]]
    ]);
  })();
  const carGeo = mergeParts([
    [new THREE.BoxGeometry(1.9, 1.0, 4.4), mtx(0, 0.75, 0), [1, 1, 1]],
    [new THREE.BoxGeometry(1.7, 0.7, 2.2), mtx(0, 1.55, -0.2), [0.75, 0.8, 0.86]]
  ]);

  /* ------------------------------------------------------------ materials */
  const foliageMat = env.foliageMat;                          // world tree material (aerial fog + 6-8 km fade)
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.06, flatShading: true, side: THREE.DoubleSide });
  const landmarkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0.08 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x343537, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const lakeMat = new THREE.MeshStandardMaterial({ color: 0x1b4752, roughness: 0.1, metalness: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const dotTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const lightMat = new THREE.PointsMaterial({ size: 13, map: dotTex, vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });

  /* ------------------------------------------------------------ streamed instance layers */
  function makeLayer(name, geo, mat, max, radius, tint) {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0; mesh.frustumCulled = false; mesh.name = name;
    mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
    const nr = Math.ceil(radius / CH) + 1, ring = [];
    for (let j = -nr; j <= nr; j++) for (let i = -nr; i <= nr; i++) {
      const d = Math.max(0, Math.hypot(Math.abs(i) - 0.5, Math.abs(j) - 0.5)) * CH;
      if (d <= radius + CH) ring.push([i, j, d]);
    }
    ring.sort((a, b) => a[2] - b[2]);
    const ringOff = new Int16Array(ring.length * 2); ring.forEach(([i, j], k) => { ringOff[k * 2] = i; ringOff[k * 2 + 1] = j; });
    return { name, mesh, max, radius, tint, ringOff, cand: null, lx: 1e9, lz: 1e9, n: 0 };
  }
  const layers = {
    conifer: makeLayer('conifer', env.coniferGeo, foliageMat, 18000, 8000, [[0.141, 0.212, 0.125], [0.176, 0.259, 0.149], [0.122, 0.180, 0.110], [0.20, 0.27, 0.15]]),
    broadleaf: makeLayer('broadleaf', broadleafGeo, foliageMat, 12000, 8000, [[0.15, 0.23, 0.10], [0.19, 0.26, 0.11], [0.13, 0.20, 0.09], [0.22, 0.25, 0.12]]),
    boulder: makeLayer('boulder', boulderGeo, solidMat, 6000, 4000, [[1, 1, 1], [0.88, 0.86, 0.82], [0.78, 0.76, 0.74], [1.05, 1.0, 0.92]])
  };

  // Fill one layer around (cx, cz): nearest chunks first, zero allocation.
  function fillLayer(L, cx, cz) {
    const C = L.cand; if (!C) { L.mesh.count = 0; return; }
    const arr = L.mesh.instanceMatrix.array, col = L.mesh.instanceColor.array, data = C.data, start = C.start;
    const R2 = L.radius * L.radius, ci = Math.floor((cx - C.x0) / CH), cj = Math.floor((cz - C.z0) / CH);
    const ro = L.ringOff, nc = C.nc, tint = L.tint, sink = C.sink;
    let k = 0;
    outer: for (let r = 0; r < ro.length; r += 2) {
      const i = ci + ro[r], j = cj + ro[r + 1];
      if (i < 0 || j < 0 || i >= nc || j >= nc) continue;
      const c = j * nc + i;
      for (let p = start[c]; p < start[c + 1]; p++) {
        const o = p * 4, x = data[o], z = data[o + 2], dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > R2) continue;
        const seed = data[o + 3], yaw = seed * TAU, s = C.s0 + C.s1 * ((seed * 7.137) % 1), sy = s * (0.85 + 0.3 * ((seed * 13.71) % 1));
        const cs = Math.cos(yaw) * s, sn = Math.sin(yaw) * s, m = k * 16;
        arr[m] = cs; arr[m + 1] = 0; arr[m + 2] = -sn; arr[m + 3] = 0;
        arr[m + 4] = 0; arr[m + 5] = sy; arr[m + 6] = 0; arr[m + 7] = 0;
        arr[m + 8] = sn; arr[m + 9] = 0; arr[m + 10] = cs; arr[m + 11] = 0;
        arr[m + 12] = x; arr[m + 13] = data[o + 1] - sink * sy; arr[m + 14] = z; arr[m + 15] = 1;
        const tc = tint[((seed * 31.3) | 0) & 3], b = 0.88 + 0.24 * ((seed * 53.9) % 1);
        col[k * 3] = tc[0] * b; col[k * 3 + 1] = tc[1] * b; col[k * 3 + 2] = tc[2] * b;
        if (++k >= L.max) break outer;
      }
    }
    L.mesh.count = k; L.n = k;
    L.mesh.instanceMatrix.needsUpdate = true; L.mesh.instanceColor.needsUpdate = true;
    L.lx = cx; L.lz = cz;
  }

  // Bucket candidate arrays (x, y, z, seed) into CH chunks over the 40 km core.
  function bucket(list, c, s0, s1, sink) {
    const x0 = c.cx - c.size / 2, z0 = c.cz - c.size / 2, nc = Math.ceil(c.size / CH), n = list.length / 4;
    const cell = new Int32Array(n), count = new Int32Array(nc * nc + 1);
    for (let p = 0; p < n; p++) {
      const i = Math.min(nc - 1, Math.max(0, Math.floor((list[p * 4] - x0) / CH))), j = Math.min(nc - 1, Math.max(0, Math.floor((list[p * 4 + 2] - z0) / CH)));
      cell[p] = j * nc + i; count[cell[p] + 1]++;
    }
    for (let k = 0; k < nc * nc; k++) count[k + 1] += count[k];
    const start = Int32Array.from(count), fill = Int32Array.from(count), data = new Float32Array(n * 4);
    for (let p = 0; p < n; p++) { const d = fill[cell[p]]++ * 4; data[d] = list[p * 4]; data[d + 1] = list[p * 4 + 1]; data[d + 2] = list[p * 4 + 2]; data[d + 3] = list[p * 4 + 3]; }
    return { data, start, nc, x0, z0, s0, s1, sink, count: n };
  }

  /* ------------------------------------------------------------ per-map build */
  const maps = {};
  let active = null, activeMode = '';
  const hash = (a, b, k) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(k, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  function keepOut(mode, x, z) {
    if (G.inApproach(x, z, 250)) return true;
    if (mode === 'gorge' && env.inGorgeBox(x, z) && env.gorgeDist(x, z) < 420) return true;   // trench corridor + rims
    if (mode === 'gorge' && Math.hypot(x - G.DAM.x, z - G.DAM.z) < 700) return true;
    const L = env.landmarks && env.landmarks[mode];                 // v3.1: the theatre's DEM bridges + harbour
    if (L) {
      for (const b of L.bridges || []) if (G.capsule(x, z, b.a[0], b.a[1], b.b[0], b.b[1]) < 260) return true;
      if (L.harbour && G.capsule(x, z, L.harbour.a[0], L.harbour.a[1], L.harbour.b[0], L.harbour.b[1]) < 260) return true;
    }
    return false;
  }
  // Road links may cross the AFB itself; only the approach funnels beyond the thresholds are off limits.
  const R0 = env.rwy || { x: 900, z0: -1400, z1: 1600 };
  const inFunnel = (x, z) => Math.abs(x - R0.x) < 700 && (z < R0.z0 - 250 || z > R0.z1 + 250) && G.inApproach(x, z, 0);

  function buildVegetation(mode, S) {
    const pk = S.pack, c = pk.meta.core, sn = c.splatN, sp = pk.splat, st2 = c.step * 2;
    const x0 = c.cx - c.size / 2, z0 = c.cz - c.size / 2;
    const con = [], brd = [], bld = [];
    for (let j = 1; j < sn - 1; j++) for (let i = 1; i < sn - 1; i++) {
      const lu = sp[(j * sn + i) * 4 + 3];
      const forest = lu > 100 && lu < 160, rock = lu > 170 && lu < 215, scrub = lu > 16 && lu < 48;
      if (!forest && !rock && !scrub) continue;
      const tries = forest ? 3 : rock ? 1 : 1;
      for (let k = 0; k < tries; k++) {
        const r0 = hash(i, j, k * 3 + 1);
        if (scrub && r0 > 0.07) continue;
        if (rock && r0 > 0.33) continue;
        const x = x0 + (i + hash(i, j, k * 3 + 2) - 0.5) * st2, z = z0 + (j + hash(i, j, k * 3 + 3) - 0.5) * st2;
        const slope = S.slopeAt(x, z);
        if (slope > (rock ? 0.3 : 0.2) || (rock && slope < 0.04)) continue;
        const y = S.baseHeight(x, z);
        if (y < 3.5) continue;
        if (forest && S.splatAt(x, z, 3) * 255 < 96) continue;
        if (keepOut(mode, x, z)) continue;
        const seed = hash(i, j, k + 97);
        if (rock) bld.push(x, y, z, seed);
        else if (y > 420 || seed < 0.45) con.push(x, y, z, seed);
        else brd.push(x, y, z, seed);
      }
    }
    return {
      conifer: bucket(con, c, 0.78, 0.6, 1.5), broadleaf: bucket(brd, c, 0.8, 0.5, 0.8), boulder: bucket(bld, c, 1.4, 3.4, 0.35)
    };
  }

  // Flat-site finder: best-scoring grid cells (low relief over radius r) with spacing.
  function findSites(S, mode, { n, spacing, r, hMin, hMax, maxRelief, ok, grid = 500, prefer }) {
    const c = S.pack.meta.core, x0 = c.cx - c.size / 2 + 2000, z0 = c.cz - c.size / 2 + 2000, span = c.size - 4000;
    const cand = [];
    for (let z = z0; z < z0 + span; z += grid) for (let x = x0; x < x0 + span; x += grid) {
      const h = S.baseHeight(x, z);
      if (h < hMin || h > hMax || keepOut(mode, x, z) || (ok && !ok(x, z, h))) continue;
      let lo = h, hi = h;
      for (let a = 0; a < 8; a++) for (const rr of [r * 0.5, r]) { const y = S.baseHeight(x + Math.cos(a * 0.785) * rr, z + Math.sin(a * 0.785) * rr); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (hi - lo > maxRelief || lo < hMin) continue;
      cand.push([x, z, h, (hi - lo) / maxRelief - (prefer ? prefer(x, z, h) : 0)]);
    }
    cand.sort((a, b) => a[3] - b[3]);
    const out = [];
    for (const s of cand) { if (out.length >= n) break; if (out.every(o => Math.hypot(o[0] - s[0], o[1] - s[1]) > spacing)) out.push(s); }
    return out;
  }

  function buildMap(mode, S) {
    const t0 = performance.now();
    const veg = buildVegetation(mode, S);
    const coll = { boxes: [], cyls: [] }, auditPts = [];
    const lm = [];                                            // landmark parts (geometry, matrix, rgb)
    const grounded = (x, z, r) => {                           // min / max ground over a footprint
      let lo = 1e9, hi = -1e9;
      for (let a = 0; a < 8; a++) { const y = S.baseHeight(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      const y = S.baseHeight(x, z); return [Math.min(lo, y), Math.max(hi, y)];
    };
    const coreC = S.pack.meta.core, inCore = (x, z) => Math.abs(x - coreC.cx) < coreC.size / 2 - 1500 && Math.abs(z - coreC.cz) < coreC.size / 2 - 1500;

    // ---- villages + houses + window lights
    const villages = findSites(S, mode, { n: mode === 'strait' ? 6 : 11, spacing: 2600, r: 260, hMin: 6, hMax: 520, maxRelief: 26,
      ok: (x, z) => { const lu = S.splatAt(x, z, 3) * 255; return lu > 20 && lu < 110 && Math.hypot(x - env.portCity[0], z - env.portCity[1]) > 2500 && Math.hypot(x - 900, z) > 3000; } });
    const houses = [], winLights = [];
    villages.forEach(([vx, vz], vi) => {
      const nH = 22 + Math.floor(hash(vi, 7, 1) * 40);
      for (let k = 0, tries = 0; k < nH && tries < nH * 6; tries++) {
        const a = hash(vi, tries, 2) * TAU, rr = 30 + Math.sqrt(hash(vi, tries, 3)) * 240;
        const x = vx + Math.cos(a) * rr, z = vz + Math.sin(a) * rr;
        if (S.slopeAt(x, z) > 0.12 || keepOut(mode, x, z)) continue;
        if (houses.some(h => Math.abs(h[0] - x) < 16 && Math.abs(h[2] - z) < 16)) continue;
        const w = 8 + hash(vi, tries, 4) * 7, d = 10 + hash(vi, tries, 5) * 9, hgt = 5 + hash(vi, tries, 6) * 4.5;
        const [lo, hi] = grounded(x, z, Math.max(w, d) * 0.6);
        if (lo < 2.5) continue;
        const yaw = Math.round(hash(vi, tries, 8) * 4) * (Math.PI / 2) + (hash(vi, 3, 9) - 0.5) * 0.4;
        const base = lo - 0.4, h = hi - base + hgt;
        houses.push([x, base, z, yaw, w, h, d, hash(vi, tries, 10)]);
        auditPts.push([x, z, base, hi + hgt, 'house']);
        // window glow just outside the front facade (local +Z), at ground-floor window height
        if (hash(vi, tries, 11) < 0.75) winLights.push(x + Math.sin(yaw) * (d / 2 + 0.5), hi + 2.2, z + Math.cos(yaw) * (d / 2 + 0.5), 1.0, 0.78, 0.45);
        k++;
      }
    });

    // ---- roads (v3.1): MST over the AFB gate + Port City anchors + villages; each link drapes
    // straight or detours through one terrain-following waypoint (up to 2 km aside), so the
    // base, the port and the valley villages visibly connect. Streetlights every ~180 m.
    const roads = [];
    {
      const anchors = [];
      if (mode !== 'strait') anchors.push([R0.x + 380, -900]);
      const L = env.landmarks && env.landmarks[mode];
      if (mode === 'archipelago' && L && L.harbour && env.portCity) anchors.push([env.portCity[0], env.portCity[1]]);
      const nodes = anchors.concat(villages.map(v => [v[0], v[1]]));
      const linkOk = (a, b) => {
        const Ln = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Ln > 9000 || Ln < 1) return null;
        const n = Math.ceil(Ln / 12), pts = [];
        let prev = null;
        for (let i = 0; i <= n; i++) {
          const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n, y = S.baseHeight(x, z);
          if (y < 2.5 || S.slopeAt(x, z) > 0.16) return null;
          if (prev !== null && Math.abs(y - prev) > 2.2) return null;
          if (mode === 'gorge' && env.inGorgeBox(x, z) && env.gorgeDist(x, z) < 400) return null;
          if (inFunnel(x, z)) return null;
          pts.push(x, y, z); prev = y;
        }
        return pts;
      };
      const route = (a, b) => {
        const direct = linkOk(a, b); if (direct) return direct;
        const dx = b[0] - a[0], dz = b[1] - a[1], Ln = Math.hypot(dx, dz) || 1, px = -dz / Ln, pz = dx / Ln;
        for (const t of [0.5, 0.35, 0.65]) for (const o of [400, -400, 800, -800, 1300, -1300, 2000, -2000]) {
          const w = [a[0] + dx * t + px * o, a[1] + dz * t + pz * o];
          const p1 = linkOk(a, w); if (!p1) continue;
          const p2 = linkOk(w, b); if (!p2) continue;
          return p1.concat(p2.slice(3));
        }
        return null;
      };
      const inT = new Set([0]), edges = [];
      if (nodes.length) {
        while (inT.size < nodes.length) {
          let best = null;
          for (const i of inT) for (let j = 0; j < nodes.length; j++) if (!inT.has(j)) {
            const d = Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]);
            if (!best || d < best[2]) best = [i, j, d];
          }
          inT.add(best[1]); edges.push(best);
        }
      }
      for (const [i, j] of edges) { const p = route(nodes[i], nodes[j]); if (p) roads.push(p); }
      let nl = 0;
      for (const p of roads) for (let k = 0, acc = 0; k + 3 < p.length && nl < 220; k += 3) {
        acc += Math.hypot(p[k + 3] - p[k], p[k + 5] - p[k + 2]);
        if (acc > 180) { acc = 0; winLights.push(p[k] + 6, p[k + 1] + 8, p[k + 2] + 6, 1.0, 0.86, 0.6); nl++; }
      }
    }
    let roadMesh = null;
    if (roads.length) {
      const P = [];
      for (const p of roads) {
        for (let k = 0; k + 3 < p.length; k += 3) {
          const ax = p[k], ay = p[k + 1] + 0.7, az = p[k + 2], bx = p[k + 3], by = p[k + 4] + 0.7, bz = p[k + 5];
          const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, ox = -dz / L * 3.6, oz = dx / L * 3.6;
          P.push(ax - ox, ay, az - oz, bx - ox, by, bz - oz, bx + ox, by, bz + oz, ax - ox, ay, az - oz, bx + ox, by, bz + oz, ax + ox, ay, az + oz);
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
      // make every road face point up (winding per segment depends on direction)
      const nn = g.attributes.normal; for (let i = 0; i < nn.count; i++) if (nn.getY(i) < 0) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
      roadMat.side = THREE.DoubleSide;
      roadMesh = new THREE.Mesh(g, roadMat); roadMesh.name = 'roads-' + mode; roadMesh.visible = false; group.add(roadMesh);
    }

    // ---- traffic on the roads
    const lanes = roads.map(p => { const n = p.length / 3, cum = new Float32Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 2] - p[i * 3 - 1]); return { p: new Float32Array(p), cum, L: cum[n - 1] }; });
    const cars = [];
    lanes.forEach((ln, li) => { const nC = Math.max(1, Math.floor(ln.L / 650)); for (let k = 0; k < nC; k++) cars.push({ li, s: hash(li, k, 21) * ln.L, dir: hash(li, k, 22) < 0.5 ? 1 : -1, v: 16 + hash(li, k, 23) * 10, seg: 0, col: k % 5 }); });

    // ---- landmarks
    const addTank = (x, z, r, h, rgb) => { const [lo, hi] = grounded(x, z, r); lm.push([new THREE.CylinderGeometry(r, r, hi - lo + h + 1, 20), mtx(x, (lo - 1 + hi + h) / 2, z), rgb]); auditPts.push([x, z, lo - 1, hi + h, 'tank']); return [lo, hi]; };
    const addBox = (x, z, w, h, d, yaw, rgb, collide) => {
      const [lo, hi] = grounded(x, z, Math.max(w, d) * 0.55); const H = hi - lo + h + 1;
      lm.push([new THREE.BoxGeometry(w, H, d), mtx(x, lo - 1 + H / 2, z, yaw), rgb]); auditPts.push([x, z, lo - 1, hi + h, 'box']);
      if (collide) coll.boxes.push({ c: new THREE.Vector3(x, lo - 1 + H / 2, z), hx: w / 2, hy: H / 2, hz: d / 2, yaw });
      return [lo, hi];
    };
    const sites = { refinery: null, radomes: [], sams: [], dam: null };

    // Refinery (archipelago + gorge share the Port City coast)
    if (mode !== 'strait') {
      const [rs] = findSites(S, mode, { n: 1, spacing: 0, r: 200, hMin: 3, hMax: 90, maxRelief: 16, grid: 200,
        ok: (x, z) => { const d = Math.hypot(x - env.portCity[0], z - env.portCity[1]); return d > 1100 && d < 9000 && S.splatAt(x, z, 3) * 255 < 230; },
        prefer: (x, z) => 0.6 - Math.hypot(x - env.portCity[0], z - env.portCity[1]) / 9000 * 0.6 });
      if (rs) {
        const [rx, rz] = rs; sites.refinery = [rx, rz];
        const TANK = hex(0xd9dbd6), RUST = hex(0x9a6a48), STEEL = hex(0x7d848c), RED = hex(0xb3261e), CONC = hex(0x9a9a94);
        for (let k = 0; k < 8; k++) addTank(rx - 150 + (k % 4) * 62, rz - 70 + Math.floor(k / 4) * 70, 22 + (k % 3) * 3, 14 + (k % 2) * 5, k % 3 ? TANK : RUST);
        addBox(rx + 120, rz, 150, 8, 70, 0, CONC);
        for (let k = 0; k < 3; k++) {
          const cx = rx + 70 + k * 45, cz = rz - 10, h = 48 + k * 9;
          const [lo] = addTank(cx, cz, 4.5, h, STEEL);
          lm.push([new THREE.CylinderGeometry(5.5, 5.5, 3, 12), mtx(cx, lo + h * 0.6, cz), RED]);
          coll.cyls.push({ x: cx, z: cz, y0: lo - 2, y1: lo + h, r0: 6, r1: 6 });
        }
        const [flo] = addTank(rx + 210, rz + 90, 2.2, 82, STEEL);
        lm.push([new THREE.CylinderGeometry(2.6, 2.6, 6, 8), mtx(rx + 210, flo + 80, rz + 90), RED]);
        coll.cyls.push({ x: rx + 210, z: rz + 90, y0: flo - 2, y1: flo + 84, r0: 4, r1: 4 });
        sites.flare = [rx + 210, flo + 86, rz + 90];
        for (let k = 0; k < 4; k++) addBox(rx - 40 + k * 70, rz + 60, 60, 6, 6, 0, STEEL);   // pipe racks
      }
    }
    // Radomes on high summits (early-warning)
    {
      const tops = findSites(S, mode, { n: 3, spacing: 6000, r: 60, hMin: 520, hMax: 2000, maxRelief: 40, grid: 400,
        ok: (x, z) => inCore(x, z), prefer: (x, z, h) => h / 900 });
      for (const [x, z] of tops) {
        const [lo, hi] = grounded(x, z, 20);
        lm.push([new THREE.CylinderGeometry(9, 11, hi - lo + 14, 14), mtx(x, (lo - 1 + hi + 14) / 2, z), hex(0x8f9499)]);
        lm.push([new THREE.SphereGeometry(13, 18, 12, 0, TAU, 0, Math.PI * 0.62), mtx(x, hi + 13, z), hex(0xf2f2ee)]);
        coll.cyls.push({ x, z, y0: lo - 1, y1: hi + 27, r0: 13, r1: 13 });
        auditPts.push([x, z, lo - 1, hi + 27, 'radome']); sites.radomes.push([x, z, hi + 27]);
      }
    }
    // SAM sites (4 launchers + radar truck + berm) on flat high ground
    {
      const sams = findSites(S, mode, { n: 4, spacing: 5000, r: 70, hMin: 40, hMax: 900, maxRelief: 6, grid: 450, ok: (x, z) => inCore(x, z) && S.splatAt(x, z, 3) * 255 < 200 });
      const OLIVE = hex(0x4f5a3c), DARK = hex(0x353b2c), SAND = hex(0x8a7d5c);
      for (const [x, z] of sams) {
        sites.sams.push([x, z]);
        const [lo] = grounded(x, z, 55);
        lm.push([new THREE.TorusGeometry(46, 3.2, 5, 28), mtx(x, lo + 0.6, z, 0, 1, 1, 1, Math.PI / 2), SAND]);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + 0.4, lx = x + Math.cos(a) * 26, lz = z + Math.sin(a) * 26, [l0] = grounded(lx, lz, 4);
          lm.push([new THREE.BoxGeometry(4, 2.4, 8), mtx(lx, l0 + 1.0, lz, a), OLIVE]);
          lm.push([new THREE.BoxGeometry(3.4, 1.6, 7.5), mtx(lx, l0 + 3.6, lz, a, 1, 1, 1, 0.6), DARK]);
          auditPts.push([lx, lz, l0 - 0.2, l0 + 6, 'sam']);
        }
        const [r0] = grounded(x, z, 5);
        lm.push([new THREE.BoxGeometry(3, 2.6, 9), mtx(x, r0 + 1.1, z), OLIVE]);
        lm.push([new THREE.BoxGeometry(5.5, 4, 0.6), mtx(x, r0 + 5, z - 1, 0.3), DARK]);
      }
    }
    // Hydroelectric dam + reservoir (gorge)
    let lakeMesh = null;
    if (mode === 'gorge') {
      const D = G.DAM, ux = Math.sin(D.yaw), uz = Math.cos(D.yaw), px = uz, pz = -ux;   // u: up-valley, p: across
      const CON = hex(0xb4b2aa), DK = hex(0x6f6e69);
      const span = D.halfW + 260, segs = 24, arch = 60;
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs * 2 - 1, t1 = (k + 1) / segs * 2 - 1, tm = (t0 + t1) / 2;
        const off = arch * (1 - tm * tm);                       // convex upstream
        const cx = D.x + px * tm * span + ux * off, cz = D.z + pz * tm * span + uz * off;
        const segL = Math.hypot(span * (t1 - t0), arch * (t1 * t1 - t0 * t0)) + 1;
        const yaw = Math.atan2(px * span * (t1 - t0) + ux * arch * (t0 * t0 - t1 * t1), pz * span * (t1 - t0) + uz * arch * (t0 * t0 - t1 * t1));
        const g0 = Math.min(S.baseHeight(cx, cz), S.baseHeight(cx + ux * 20, cz + uz * 20), S.baseHeight(cx - ux * 20, cz - uz * 20));
        const y0 = Math.min(g0, D.toeY) - 12, H = D.crestY - y0;
        if (H <= 2) continue;
        lm.push([new THREE.BoxGeometry(segL, H, 14 + 26 * Math.min(1, H / 200)), mtx(cx, y0 + H / 2, cz, yaw + Math.PI / 2), CON]);
        lm.push([new THREE.BoxGeometry(segL, 2.5, 18), mtx(cx, D.crestY + 1.2, cz, yaw + Math.PI / 2), DK]);
        coll.boxes.push({ c: new THREE.Vector3(cx, y0 + H / 2, cz), hx: segL / 2, hy: H / 2, hz: 12, yaw: yaw + Math.PI / 2 });
      }
      // powerhouse + penstock at the toe
      const phx = D.x - ux * 120, phz = D.z - uz * 120;
      addBox(phx, phz, 90, 22, 34, D.yaw, hex(0x8c8a82), true);
      sites.dam = [D.x, D.z, D.crestY];
      // reservoir: grid over the up-valley, triangles kept where the ground is below the lake
      const P = [], N = 120, L0 = 60, L1 = 3400, W = 1300;
      const pt = (a, b) => [D.x + ux * (L0 + a * (L1 - L0)) + px * (b - 0.5) * 2 * W, D.z + uz * (L0 + a * (L1 - L0)) + pz * (b - 0.5) * 2 * W];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const q = [pt(j / N, i / N), pt((j + 1) / N, i / N), pt((j + 1) / N, (i + 1) / N), pt(j / N, (i + 1) / N)];
        if (q.every(([x, z]) => S.baseHeight(x, z) > D.lakeY + 1)) continue;
        for (const [a, b, c2] of [[0, 1, 2], [0, 2, 3]]) P.push(q[a][0], D.lakeY, q[a][1], q[b][0], D.lakeY, q[b][1], q[c2][0], D.lakeY, q[c2][1]);
      }
      if (P.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        const nrm = new Float32Array(P.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        lakeMat.side = THREE.DoubleSide;
        lakeMesh = new THREE.Mesh(g, lakeMat); lakeMesh.name = 'reservoir'; lakeMesh.visible = false; group.add(lakeMesh);
      }
    }
    let landmarkMesh = null;
    if (lm.length) { landmarkMesh = new THREE.Mesh(mergeParts(lm), landmarkMat); landmarkMesh.name = 'landmarks-' + mode; landmarkMesh.visible = false; group.add(landmarkMesh); }

    return { mode, sampler: S, veg, houses, winLights, roads: lanes, cars, roadMesh, landmarkMesh, lakeMesh, coll, auditPts, sites, villages: villages.map(v => [v[0], v[1]]), buildMs: performance.now() - t0 };
  }

  /* ------------------------------------------------------------ shared dynamic meshes */
  const MAX_HOUSES = 800, MAX_CARS = 160, MAX_WIN = 600;
  const houseMesh = new THREE.InstancedMesh(houseGeo, solidMat, MAX_HOUSES);
  houseMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_HOUSES * 3), 3);
  houseMesh.count = 0; houseMesh.frustumCulled = false; houseMesh.name = 'houses'; group.add(houseMesh);
  const carMesh = new THREE.InstancedMesh(carGeo, solidMat, MAX_CARS);
  carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  carMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS * 3), 3);
  carMesh.count = 0; carMesh.frustumCulled = false; carMesh.name = 'cars'; group.add(carMesh);
  const CAR_COL = [[0.75, 0.1, 0.08], [0.9, 0.9, 0.88], [0.12, 0.2, 0.42], [0.2, 0.2, 0.22], [0.75, 0.62, 0.2]];
  const NL = MAX_WIN + MAX_CARS * 2;
  const lightPos = new Float32Array(NL * 3), lightCol = new Float32Array(NL * 3);
  const lightGeo = new THREE.BufferGeometry();
  lightGeo.setAttribute('position', new THREE.BufferAttribute(lightPos, 3).setUsage(THREE.DynamicDrawUsage));
  lightGeo.setAttribute('color', new THREE.BufferAttribute(lightCol, 3));
  lightGeo.setDrawRange(0, 0);
  lightGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -2500), 60000);
  const lights = new THREE.Points(lightGeo, lightMat); lights.frustumCulled = false; lights.name = 'clutter-lights'; group.add(lights);
  let nWin = 0;

  function setMap(mode, S) {
    if (active) { for (const k of ['roadMesh', 'landmarkMesh', 'lakeMesh']) if (active[k]) active[k].visible = false; }
    activeMode = mode;
    if (mode === 'ocean' || !S) {
      active = null;
      for (const k in layers) { layers[k].cand = null; layers[k].mesh.count = 0; }
      houseMesh.count = 0; carMesh.count = 0; lightGeo.setDrawRange(0, 0);
      return;
    }
    if (!maps[mode] || maps[mode].sampler !== S) maps[mode] = buildMap(mode, S);
    active = maps[mode];
    for (const k in layers) { layers[k].cand = active.veg[k]; layers[k].lx = 1e9; }
    for (const k of ['roadMesh', 'landmarkMesh', 'lakeMesh']) if (active[k]) active[k].visible = true;
    // houses (static per map)
    const hs = active.houses, hn = Math.min(hs.length, MAX_HOUSES), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < hn; i++) {
      const [x, y, z, yaw, w, h, d, r] = hs[i];
      m.compose(V3.set(x, y, z), q.setFromAxisAngle(up, yaw), S3.set(w, h / 1.0, d));
      houseMesh.setMatrixAt(i, m);
      const tone = 0.82 + 0.25 * r; houseMesh.instanceColor.setXYZ(i, tone, tone * (0.96 + 0.06 * r), tone * (0.9 + 0.1 * r));
    }
    houseMesh.count = hn; houseMesh.instanceMatrix.needsUpdate = true; houseMesh.instanceColor.needsUpdate = true;
    // window lights (static part of the light buffer)
    nWin = Math.min(active.winLights.length / 6, MAX_WIN);
    for (let i = 0; i < nWin; i++) { const o = i * 6; lightPos.set([active.winLights[o], active.winLights[o + 1], active.winLights[o + 2]], i * 3); lightCol.set([active.winLights[o + 3], active.winLights[o + 4], active.winLights[o + 5]], i * 3); }
    const nc = Math.min(active.cars.length, MAX_CARS);
    for (let i = 0; i < nc; i++) {
      const cc = CAR_COL[active.cars[i].col]; carMesh.instanceColor.setXYZ(i, cc[0], cc[1], cc[2]);
      const a = (nWin + i * 2) * 3; lightCol[a] = 1; lightCol[a + 1] = 0.95; lightCol[a + 2] = 0.82; lightCol[a + 3] = 1; lightCol[a + 4] = 0.1; lightCol[a + 5] = 0.06;
    }
    carMesh.count = nc; carMesh.instanceColor.needsUpdate = true;
    lightGeo.attributes.color.needsUpdate = true; lightGeo.attributes.position.needsUpdate = true;
    lightGeo.setDrawRange(0, nWin + nc * 2);
  }

  /* ------------------------------------------------------------ per-frame (zero allocation) */
  function update(dt, t, night, cx, cz) {
    if (!active) return;
    for (const k in layers) {
      const L = layers[k], dx = cx - L.lx, dz = cz - L.lz;
      if (dx * dx + dz * dz > 160 * 160) fillLayer(L, cx, cz);
    }
    const cars = active.cars, nc = carMesh.count, arr = carMesh.instanceMatrix.array, lanes = active.roads;
    for (let i = 0; i < nc; i++) {
      const c = cars[i], ln = lanes[c.li], p = ln.p, cum = ln.cum, last = cum.length - 1;
      c.s += c.v * c.dir * dt;
      if (c.s > ln.L) { c.s = ln.L; c.dir = -1; } else if (c.s < 0) { c.s = 0; c.dir = 1; }
      while (c.seg < last - 1 && c.s > cum[c.seg + 1]) c.seg++;
      while (c.seg > 0 && c.s < cum[c.seg]) c.seg--;
      const a = c.seg * 3, f = (c.s - cum[c.seg]) / Math.max(1e-3, cum[c.seg + 1] - cum[c.seg]);
      const dx = p[a + 3] - p[a], dz = p[a + 5] - p[a + 2], L = Math.hypot(dx, dz) || 1, fx = dx / L * c.dir, fz = dz / L * c.dir;
      const x = p[a] + dx * f - fz * 1.9, z = p[a + 2] + dz * f + fx * 1.9, y = p[a + 1] + (p[a + 4] - p[a + 1]) * f + 0.75;
      const m = i * 16;                                       // rotation: local -Z (nose) along (fx, fz)
      arr[m] = -fz; arr[m + 1] = 0; arr[m + 2] = fx; arr[m + 3] = 0;
      arr[m + 4] = 0; arr[m + 5] = 1; arr[m + 6] = 0; arr[m + 7] = 0;
      arr[m + 8] = -fx; arr[m + 9] = 0; arr[m + 10] = -fz; arr[m + 11] = 0;
      arr[m + 12] = x; arr[m + 13] = y - 0.75; arr[m + 14] = z; arr[m + 15] = 1;
      const l = (nWin + i * 2) * 3;
      lightPos[l] = x + fx * 2.6; lightPos[l + 1] = y + 0.2; lightPos[l + 2] = z + fz * 2.6;
      lightPos[l + 3] = x - fx * 2.4; lightPos[l + 4] = y + 0.3; lightPos[l + 5] = z - fz * 2.4;
    }
    if (nc) { carMesh.instanceMatrix.needsUpdate = true; lightGeo.attributes.position.needsUpdate = true; }
    lightMat.opacity = ss(night, 0.1, 0.4);                  // town + traffic lights come on through dusk
    lights.visible = lightMat.opacity > 0.01;
  }

  /* ------------------------------------------------------------ verification hooks */
  // Max float / bury of every placed prop against heightAt(): trees & boulders are sampled
  // from the candidate tables (their base = baseHeight, slope gate keeps crag at 0).
  function audit(mode) {
    const m = maps[mode || activeMode]; if (!m) return null;
    const S = m.sampler, out = { trees: 0, maxTreeErr: 0, props: m.auditPts.length, floating: 0, buried: 0, worstFloat: 0, worstBury: 0 };
    const [vx0, vz0] = S.viewer;
    for (const k of ['conifer', 'broadleaf', 'boulder']) {
      const C = m.veg[k], n = C.count;
      for (let p = 0; p < n; p += Math.max(1, Math.floor(n / 4000))) {
        const o = p * 4, x = C.data[o], z = C.data[o + 2];
        S.setViewer(x + 100, z);                               // crag fully on (worst case)
        out.maxTreeErr = Math.max(out.maxTreeErr, Math.abs(S.heightAt(x, z) - C.data[o + 1])); out.trees++;
      }
    }
    for (const [x, z, base, top] of m.auditPts) {
      S.setViewer(x + 100, z);
      const g = S.heightAt(x, z);
      if (base > g + 0.05) { out.floating++; out.worstFloat = Math.max(out.worstFloat, base - g); }
      if (top < g + 1) { out.buried++; out.worstBury = Math.max(out.worstBury, g - top); }
    }
    S.setViewer(vx0, vz0);
    out.maxTreeErr = +out.maxTreeErr.toFixed(4);
    return out;
  }
  function stats() {
    const m = active;
    return {
      mode: activeMode, buildMs: m ? +m.buildMs.toFixed(0) : 0,
      candidates: m ? { conifer: m.veg.conifer.count, broadleaf: m.veg.broadleaf.count, boulder: m.veg.boulder.count } : null,
      instances: { conifer: layers.conifer.n, broadleaf: layers.broadleaf.n, boulder: layers.boulder.n, houses: houseMesh.count, cars: carMesh.count },
      villages: m ? m.villages.length : 0, roads: m ? m.roads.length : 0, sites: m ? m.sites : null,
      drawCalls: group.children.filter(o => o.visible && (o.isPoints ? lights.visible && lightGeo.drawRange.count > 0 : (o.count === undefined || o.count > 0))).length
    };
  }
  const collision = mode => (maps[mode] ? maps[mode].coll : { boxes: [], cyls: [] });

  return { group, setMap, update, audit, stats, collision, get active() { return active; } };
}
