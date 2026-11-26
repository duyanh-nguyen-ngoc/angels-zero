// ANGELS ZERO — deterministic CPU geological sculpting + hydraulic/thermal erosion
// for the combat-theatre height grids (ARCHIPELAGO, STRAIT, GORGE).
//
// Adapted (MIT) from ZyFou/ProceduralTerrains:
//   * `src/engine/terrain/noise/cpuNoise.js` (quintic value noise, rotated-domain
//     heterogeneous ridged multifractal with carry weighting, domain warping)
//   * `src/engine/terrain/dryCanyon.js` (incised valley/tributary carving & strata)
//   * `src/engine/terrain/erosion/erosionSim.js` & `ErosionPresets.js` (droplet
//     hydraulic erosion + isotropic thermal talus relaxation).
// See assets/CREDITS.md.
//
// Design guarantees for ANGELS ZERO:
//   * operates in place on the shared (n x n) world grid in metres; heights are
//     scaled to cell units internally so presets are resolution independent;
//   * EVERY height modification (sculpting + hydraulic + thermal) is gated by
//     the caller's per-cell protect `mask` (0 = strictly untouched: AFB runway,
//     apron, approach funnels, Port City, bridge spits, CANYON_RUN floor/gates/
//     Crater Citadel, Strait prop sites, carrier sea lanes & coastline);
//   * analysis (multi-scale cavity/ridge AO, sediment/talus, flow) is recorded
//     everywhere -- masked cells included -- so the shader shades canyon walls,
//     gullies and alluvial fans even where the mesh never moves (GORGE mode);
//   * all buffers are allocated once per build call; inner loops allocate nothing
//     and runtime has zero per-frame allocations.
// Returns { erosion: Float32Array(n*n*3) = (cavityAO 0..1, sediment 0..1, flow 0..1),
//           stats } -- interleaved per grid cell.

export const EROSION_DEFAULTS = {
  seed: 1, droplets: 24000, maxLifetime: 38, inertia: 0.055, sedimentCapacity: 3.8,
  minSlope: 0.01, depositionRate: 0.24, erosionRate: 0.24, radius: 2, evaporation: 0.02,
  gravity: 4.5, initialSpeed: 1.0, initialWater: 1.0,
  thermalIterations: 7, thermalStrength: 0.42, talus: 1.05,  // cell units (~46 deg): sheer cliffs survive, scree forms
  landMin: 3, maxDelta: 48, cellScale: 1,                    // cellScale = metres per height unit (STEP)
  sculptStrength: 1.0, smoothing: 0.07
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fast scalar smoothstep (works for both a < b and a > b).
function ss(x, a, b) {
  const t = (x - a) / (b - a);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

// Bit-deterministic integer lattice hash -> [0, 1) (zero allocations).
function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 1597334677) ^ Math.imul(iz, 3812015801) ^ seed) | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 2D quintic value noise -> [0, 1].
function vnoise2(px, pz, seed) {
  const ix = Math.floor(px), iz = Math.floor(pz);
  const fx = px - ix, fz = pz - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uz;
}

// Rotated-domain FBM (ROT2 = [0.80, 0.60; -0.60, 0.80], lacunarity 2.04) -> [0, 1].
function fbm2(px, pz, octaves, seed) {
  let amp = 0.5, sum = 0, norm = 0, x = px, z = pz;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise2(x, z, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    const rx = (0.80 * x + 0.60 * z) * 2.04;
    const rz = (-0.60 * x + 0.80 * z) * 2.04;
    x = rx; z = rz;
  }
  return sum / norm;
}

// Heterogeneous ridged multifractal with carry weighting (after cpuNoise.js ridged2):
// secondary ridges cluster sharply along primary crests -> jagged alpine spires & arêtes.
function ridgedMF(px, pz, octaves, sharp, seed) {
  let amp = 0.5, sum = 0, norm = 0, carry = 1, x = px, z = pz;
  for (let i = 0; i < octaves; i++) {
    let v = 1 - Math.abs(vnoise2(x, z, seed + i * 1619) * 2 - 1);
    v = sharp === 2 ? v * v : Math.pow(v, sharp);
    sum += amp * v * carry;
    carry = v * 1.4;
    if (carry > 1) carry = 1;
    norm += amp;
    amp *= 0.52;
    const rx = (0.80 * x + 0.60 * z) * 2.06;
    const rz = (-0.60 * x + 0.80 * z) * 2.06;
    x = rx; z = rz;
  }
  return sum / norm;
}

/**
 * @param {Float32Array} grid  n*n heights (metres), row-major, mutated in place
 * @param {number} n           grid side (vertices)
 * @param {Float32Array} mask  n*n protect mask 0..1 (1 = free to sculpt/erode, 0 = locked)
 * @param {object} params      see EROSION_DEFAULTS
 */
export function erodeGrid(grid, n, mask, params) {
  const p = Object.assign({}, EROSION_DEFAULTS, params);
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const N = n * n, S = p.cellScale;
  const seed = (p.seed | 0) || 1;
  const isStrait = seed === 9137;
  const sculpted = new Float32Array(grid);

  // --------------------------------------------------- 1. geological sculpt pass
  // Strictly gated by mask[i] > 0: protected masks (AFB runway/apron/approaches,
  // Port City, bridge spits, Strait prop sites, sea lanes, GORGE trench) stay
  // 100% untouched. Produces:
  //   (a) coastal bays/coves & craggy headland promontories
  //   (b) jagged alpine spires & knife-edge arêtes via ridged multifractal
  //   (c) deeply incised winding valleys & tributary ravines
  //   (d) weathered geological strata terraces on mid-to-upper escarpments
  if (p.sculptStrength > 0) {
    const sA = seed * 17 + 101, sB = seed * 31 + 211, sC = seed * 43 + 307;
    const sD = seed * 59 + 409, sE = seed * 71 + 503;
    const sG = seed * 97 + 709, sH = seed * 107 + 809;
    const spireAmp = isStrait ? 215 : 195;
    const valleyAmp = isStrait ? 88 : 78;
    const terraceBlend = isStrait ? 0.36 : 0.40;
    const stepH = isStrait ? 48 : 42;
    const kSculpt = p.sculptStrength;

    for (let y = 0; y < n; y++) {
      const wz = y * S;
      const row = y * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        const m = mask[i];
        if (m <= 0) continue;
        const h = grid[i];
        if (h <= 0.8) continue;

        const wx = x * S;
        // Domain warp (~1.8 km wavelength) bends ridges, valleys and coves organically.
        const w1 = fbm2(wx * 0.00055, wz * 0.00055, 2, sA) - 0.5;
        const w2 = fbm2(wx * 0.00055 + 19.3, wz * 0.00055 - 11.7, 2, sB) - 0.5;
        const qx = wx + w1 * 680;
        const qz = wz + w2 * 680;
        const cluster = ss(w1 + 0.5, 0.26, 0.72);

        let dH = 0;

        // (a) Coastal bays, pocket coves & rugged sea-cliff headlands (2..135 m).
        if (h < 140) {
          const coastBand = ss(h, 2, 16) * (1 - ss(h, 65, 138));
          if (coastBand > 0.001) {
            const coveN = fbm2(qx * 0.00145, qz * 0.00145, 2, sC) * 2 - 1;
            if (coveN < -0.10) {
              const cut = ss(-coveN, 0.10, 0.70);
              dH -= coastBand * cut * Math.min(h * 0.56, 48);
            } else if (coveN > 0.16) {
              const lift = ss(coveN, 0.16, 0.76);
              const crag = ridgedMF(wx * 0.0036, wz * 0.0036, 2, 2, sE);
              dH += coastBand * lift * (20 + 28 * crag);
            }
          }
        }

        // (b) Jagged alpine spires, knife-edge arêtes & cirque saddles (h > 70 m).
        if (h > 70) {
          const alpineBand = ss(h, 70, 240);
          const spire = ridgedMF(qx * 0.00135, qz * 0.00135, 3, 2.35, sD);
          const arete = ridgedMF(wx * 0.0031, wz * 0.0031, 2, 2, sE);
          dH += alpineBand * ((spire * (0.62 + 0.38 * cluster) - 0.18) * spireAmp + (arete - 0.24) * 62);
        }

        // (c) Deeply incised winding valleys & tributary ravines (h > 18 m).
        if (h > 18) {
          const valleyBand = ss(h, 18, 88);
          const vMain = Math.abs(fbm2(qx * 0.00095, qz * 0.00095, 2, sG) * 2 - 1);
          const vCut = ss(vMain, 0.20, 0.0);
          let carve = (vCut * vCut) * Math.min(valleyAmp, h * 0.30);
          if (h > 55) {
            const vTrib = Math.abs(fbm2(qx * 0.0024 + 31.1, qz * 0.0024 - 17.4, 2, sH) * 2 - 1);
            const tCut = ss(vTrib, 0.16, 0.0);
            carve += (tCut * tCut) * ss(h, 55, 170) * Math.min(40, h * 0.15);
          }
          dH -= valleyBand * carve;
        }

        let hTmp = h + dH * kSculpt;
        if (hTmp < 0.8) hTmp = 0.8;

        // (d) Weathered geological strata terraces on mid-to-upper escarpments (45..560 m).
        if (hTmp > 45 && hTmp < 560) {
          const terrBand = ss(hTmp, 45, 115) * (1 - ss(hTmp, 420, 560));
          const warpH = w2 * 38;
          const q = (hTmp + warpH) / stepH;
          const f = q - Math.floor(q);
          const hTerr = (Math.floor(q) + ss(f, 0.28, 0.72)) * stepH - warpH;
          const tb = terraceBlend * terrBand * (0.55 + 0.45 * cluster) * kSculpt;
          hTmp += (hTerr - hTmp) * tb;
        }

        let dSculpt = (hTmp - h) * m;
        if (dSculpt > 195) dSculpt = 195;
        else if (dSculpt < -95) dSculpt = -95;
        const outH = h + dSculpt;
        sculpted[i] = outH < 0.8 ? 0.8 : outH;
      }
    }
  }
  const tSculpt = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  const map = new Float32Array(N);
  const invS = 1 / S;
  for (let i = 0; i < N; i++) map[i] = sculpted[i] * invS;      // cell units
  const flow = new Float32Array(N), dep = new Float32Array(N), eroAcc = new Float32Array(N);

  // Pre-collect land and upland spawn cells so 100% of droplets land on terrain
  // (zero wasted ocean spawns) and mountains/rims receive dense gully carving.
  const landMin = p.landMin * invS;
  const highMin = 55 * invS;
  const landCells = new Int32Array(N);
  const highCells = new Int32Array(N);
  let nLand = 0, nHigh = 0;
  for (let y = 1; y < n - 1; y++) {
    const row = y * n;
    for (let x = 1; x < n - 1; x++) {
      const i = row + x, h = map[i];
      if (h > landMin) {
        landCells[nLand++] = i;
        if (h > highMin) highCells[nHigh++] = i;
      }
    }
  }

  // Smooth circular erosion brush (offsets + normalised linear-cone weights).
  const rf = Math.max(1, p.radius);
  const ri = Math.ceil(rf);
  const r2 = rf * rf;
  let bn = 0;
  for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) if (dx * dx + dy * dy < r2) bn++;
  const bOff = new Int32Array(bn * 2), bW = new Float32Array(bn);
  {
    let k = 0, ws = 0;
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      const sq = dx * dx + dy * dy;
      if (sq >= r2) continue;
      bOff[k * 2] = dx; bOff[k * 2 + 1] = dy;
      bW[k] = 1 - Math.sqrt(sq) / rf;
      ws += bW[k]; k++;
    }
    const invWs = 1 / (ws || 1);
    for (let k2 = 0; k2 < bn; k2++) bW[k2] *= invWs;
  }

  const rand = mulberry32(seed);
  let spawned = 0;
  const inertia = p.inertia, oneMinusInertia = 1 - inertia;
  const sedCap = p.sedimentCapacity, minSlope = p.minSlope;
  const depRate = p.depositionRate, eroRate = p.erosionRate;
  const evapKeep = 1 - p.evaporation, gravity = p.gravity;
  const maxLife = p.maxLifetime, nMax = n - 2;

  // ------------------------------------------------------- 2. hydraulic pass
  if (nLand > 0) {
    for (let iter = 0; iter < p.droplets; iter++) {
      const useHigh = nHigh > 0 && rand() < 0.55;
      const cell = useHigh ? highCells[(rand() * nHigh) | 0] : landCells[(rand() * nLand) | 0];
      let posY = (cell / n) | 0;
      let posX = cell - posY * n;
      posX += rand(); posY += rand();
      if (posX >= nMax) posX = nMax - 0.01;
      if (posY >= nMax) posY = nMax - 0.01;
      spawned++;

      let dirX = 0, dirY = 0, speed = p.initialSpeed, water = p.initialWater, sediment = 0;
      for (let life = 0; life < maxLife; life++) {
        const nodeX = posX | 0, nodeY = posY | 0, ci = nodeY * n + nodeX;
        const offX = posX - nodeX, offY = posY - nodeY;
        const omx = 1 - offX, omy = 1 - offY;
        const hNW = map[ci], hNE = map[ci + 1], hSW = map[ci + n], hSE = map[ci + n + 1];
        const gx = (hNE - hNW) * omy + (hSE - hSW) * offY;
        const gy = (hSW - hNW) * omx + (hSE - hNE) * offX;
        const h0 = hNW * omx * omy + hNE * offX * omy + hSW * omx * offY + hSE * offX * offY;

        dirX = dirX * inertia - gx * oneMinusInertia;
        dirY = dirY * inertia - gy * oneMinusInertia;
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (len < 1e-7) break;
        const invL = 1 / len;
        dirX *= invL; dirY *= invL;
        posX += dirX; posY += dirY;
        flow[ci] += water;
        if (posX < 1 || posX >= nMax || posY < 1 || posY >= nMax) break;

        const nx = posX | 0, ny = posY | 0, nci = ny * n + nx;
        const fx = posX - nx, fy = posY - ny;
        const h1 = map[nci] * (1 - fx) * (1 - fy) + map[nci + 1] * fx * (1 - fy)
          + map[nci + n] * (1 - fx) * fy + map[nci + n + 1] * fx * fy;
        const dh = h1 - h0;

        if (h1 < 0) {                                           // reached sea: drop alluvial fan at shore
          const d = sediment * 0.55;
          map[ci] += d; dep[ci] += d;
          break;
        }
        const cap = (dh < -minSlope ? -dh : minSlope) * speed * water * sedCap;
        if (sediment > cap || dh > 0) {
          const d = dh > 0 ? (dh < sediment ? dh : sediment) : (sediment - cap) * depRate;
          sediment -= d;
          map[ci] += d * omx * omy;
          map[ci + 1] += d * offX * omy;
          map[ci + n] += d * omx * offY;
          map[ci + n + 1] += d * offX * offY;
          dep[ci] += d;
        } else {
          const rawAmt = (cap - sediment) * eroRate;
          const amt = rawAmt < -dh ? rawAmt : -dh;
          for (let b = 0; b < bn; b++) {
            const ex = nodeX + bOff[b * 2], ey = nodeY + bOff[b * 2 + 1];
            if (ex < 0 || ex >= n || ey < 0 || ey >= n) continue;
            const ei = ey * n + ex, w = amt * bW[b];
            const rem = map[ei] - w < 0 ? (map[ei] > 0 ? map[ei] : 0) : w;
            map[ei] -= rem; sediment += rem; eroAcc[ei] += rem;
          }
        }
        const sp2 = speed * speed - dh * gravity;
        speed = sp2 > 0 ? Math.sqrt(sp2) : 0;
        water *= evapKeep;
        if (water < 0.02) break;
      }
    }
  }
  const tHyd = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // --------------------------------------------------------- 3. thermal pass
  // Alternating cardinal (4-conn) and diagonal (4-conn, talus * sqrt(2)) sweeps
  // eliminate grid-axis diamond artifacts and deposit realistic scree aprons.
  // For GORGE (thermalIterations === 0, all-zero mask), run 3 analysis-only
  // sweeps to populate talus scree in `dep` without altering the locked grid.
  const thermalIters = p.thermalIterations > 0 ? p.thermalIterations : 3;
  const thermalStr = p.thermalIterations > 0 ? p.thermalStrength : 0.28;
  if (thermalIters > 0 && thermalStr > 0) {
    const delta = new Float32Array(N);
    const talusCard = p.talus;
    const talusDiag = p.talus * 1.41421356;
    const halfStr = 0.5 * thermalStr;
    for (let it = 0; it < thermalIters; it++) {
      delta.fill(0);
      const diag = (it & 1) === 1;
      const tal = diag ? talusDiag : talusCard;
      const o0 = diag ? -n - 1 : -1;
      const o1 = diag ? -n + 1 : 1;
      const o2 = diag ? n - 1 : -n;
      const o3 = diag ? n + 1 : n;
      for (let y = 1; y < n - 1; y++) {
        const row = y * n;
        for (let x = 1; x < n - 1; x++) {
          const i = row + x, h = map[i];
          if (h <= landMin) continue;
          let md = 0, tg = -1, d;
          d = h - map[i + o0]; if (d > md) { md = d; tg = i + o0; }
          d = h - map[i + o1]; if (d > md) { md = d; tg = i + o1; }
          d = h - map[i + o2]; if (d > md) { md = d; tg = i + o2; }
          d = h - map[i + o3]; if (d > md) { md = d; tg = i + o3; }
          if (tg >= 0 && md > tal) {
            const mv = (md - tal) * halfStr;
            delta[i] -= mv;
            delta[tg] += mv;
            dep[tg] += mv * 0.45;
          }
        }
      }
      for (let i = 0; i < N; i++) map[i] += delta[i];
    }
  }
  const tTherm = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ----------------------------------------- 4. masked blend back into grid
  let changed = 0, sumAbs = 0, maxAbs = 0;
  const md = p.maxDelta;
  for (let i = 0; i < N; i++) {
    const m = mask[i];
    if (m <= 0) continue;
    let eroD = map[i] * S - sculpted[i];
    if (eroD > md) eroD = md; else if (eroD < -md) eroD = -md;
    let finalH = sculpted[i] + eroD * m;
    if (grid[i] > 0 && finalH < 0.5) finalH = 0.5;                 // erosion never turns land into sea
    const dlt = finalH - grid[i];
    grid[i] = finalH;
    if (dlt !== 0) {
      changed++;
      const a = dlt < 0 ? -dlt : dlt;
      sumAbs += a;
      if (a > maxAbs) maxAbs = a;
    }
  }

  // Light spike-control smoothing on unmasked interior cells (preserves crisp ridges).
  if (changed > 0 && p.smoothing > 0) {
    const sm = p.smoothing;
    const tmp = new Float32Array(grid);
    for (let y = 1; y < n - 1; y++) {
      const row = y * n;
      for (let x = 1; x < n - 1; x++) {
        const i = row + x;
        const m = mask[i];
        if (m <= 0.15 || tmp[i] <= 2) continue;
        const avg = (tmp[i - 1] + tmp[i + 1] + tmp[i - n] + tmp[i + n]) * 0.25;
        const nh = tmp[i] + (avg - tmp[i]) * sm * m;
        grid[i] = nh < 0.5 ? 0.5 : nh;
      }
    }
  }

  // ------------------------------------------------ 5. analysis -> vertex data
  // Multi-scale cavity/ridge AO (1-cell + 2-cell + 4-cell Laplacian + carved gully
  // darkening), softly diffused sediment/talus fans, and log-curved drainage flow.
  const out = new Float32Array(N * 3);
  const depSmooth = new Float32Array(N);
  for (let y = 1; y < n - 1; y++) {
    const row = y * n;
    for (let x = 1; x < n - 1; x++) {
      const i = row + x;
      depSmooth[i] = dep[i] * 0.52 + (dep[i - 1] + dep[i + 1] + dep[i - n] + dep[i + n]) * 0.12;
    }
  }
  let fMax = 1e-6, dMax = 1e-6, eMax = 1e-6;
  for (let i = 0; i < N; i++) {
    if (flow[i] > fMax) fMax = flow[i];
    if (depSmooth[i] > dMax) dMax = depSmooth[i];
    if (eroAcc[i] > eMax) eMax = eroAcc[i];
  }
  const lf = Math.log(1 + fMax * 2.5);
  const invDMax = 1 / dMax, invEMax = 1 / eMax;
  const n2 = n * 2, n4 = n * 4;

  for (let y = 0; y < n; y++) {
    const row = y * n;
    const in1 = y > 0 && y < n - 1;
    const in2 = y > 1 && y < n - 2;
    const in4 = y > 3 && y < n - 4;
    for (let x = 0; x < n; x++) {
      const i = row + x;
      const g = grid[i];
      let cav = 0.5;
      if (in1 && x > 0 && x < n - 1 && g > -1) {
        const l1 = (grid[i - 1] + grid[i + 1] + grid[i - n] + grid[i + n]) * 0.25 - g;
        let lap = l1 * 0.52;
        if (in2 && x > 1 && x < n - 2) {
          const l2 = (grid[i - 2] + grid[i + 2] + grid[i - n2] + grid[i + n2]) * 0.25 - g;
          lap += l2 * 0.30 * 0.65;
        }
        if (in4 && x > 3 && x < n - 4) {
          const l4 = (grid[i - 4] + grid[i + 4] + grid[i - n4] + grid[i + n4]) * 0.25 - g;
          lap += l4 * 0.18 * 0.42;
        }
        const eroDark = Math.sqrt(eroAcc[i] * invEMax) * 0.22;
        const delta = lap * invS * 2.15 + eroDark;
        cav = 0.5 - (delta < -0.5 ? -0.5 : delta > 0.5 ? 0.5 : delta);
      }
      const sed = Math.sqrt(depSmooth[i] * invDMax) * 1.65;
      const flw = Math.log(1 + flow[i] * 2.5) / lf;
      const eBoost = Math.sqrt(eroAcc[i] * invEMax) * 0.28;
      const k = i * 3;
      out[k] = cav;
      out[k + 1] = sed > 1 ? 1 : sed;
      out[k + 2] = flw + eBoost > 1 ? 1 : flw + eBoost;
    }
  }
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    erosion: out,
    stats: {
      ms: +(t1 - t0).toFixed(1),
      sculptMs: +(tSculpt - t0).toFixed(1),
      hydraulicMs: +(tHyd - tSculpt).toFixed(1),
      thermalMs: +(tTherm - tHyd).toFixed(1),
      droplets: spawned,
      changed,
      meanAbs: changed ? +(sumAbs / changed).toFixed(2) : 0,
      maxAbs: +maxAbs.toFixed(2)
    }
  };
}
