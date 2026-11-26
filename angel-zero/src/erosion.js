// ANGELS ZERO — deterministic CPU terrain erosion for the theatre height grids.
//
// Adapted (MIT) from ZyFou/ProceduralTerrains `src/engine/terrain/erosion/erosionSim.js`
// (droplet hydraulic erosion after Hans Beyer / Sebastian Lague + thermal talus
// relaxation). See assets/CREDITS.md. Changes for ANGELS ZERO:
//   * operates in place on the shared (n x n) world grid in metres; heights are
//     scaled to cell units internally so presets are resolution independent;
//   * droplets only spawn on land (h > landMin) and the final height delta is
//     blended through a per-cell protect `mask` (0 = untouched: runway, approach
//     funnels, town, bridges, canyon trench), and clamped to +/- maxDelta metres;
//   * analysis (flow, deposition) is recorded everywhere -- masked cells included --
//     so the shader can shade gullies and fans even where the ground never moves;
//   * the brush, scratch and output buffers are allocated once per build call; the
//     droplet / thermal loops allocate nothing.
// Returns { erosion: Float32Array(n*n*3) = (cavityAO 0..1, sediment 0..1, flow 0..1),
//           stats } -- interleaved per grid cell.

export const EROSION_DEFAULTS = {
  seed: 1, droplets: 21000, maxLifetime: 34, inertia: 0.08, sedimentCapacity: 2.2,
  minSlope: 0.01, depositionRate: 0.25, erosionRate: 0.11, radius: 2, evaporation: 0.025,
  gravity: 4.0, initialSpeed: 1.0, initialWater: 1.0,
  thermalIterations: 5, thermalStrength: 0.35, talus: 1.4,   // talus in cell units (1.4 = ~54 deg): cliffs survive
  landMin: 3, maxDelta: 38, cellScale: 1                       // cellScale = metres per height unit (set to STEP)
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

/**
 * @param {Float32Array} grid  n*n heights (metres), row-major, mutated in place
 * @param {number} n           grid side (vertices)
 * @param {Float32Array} mask  n*n protect mask 0..1 (1 = free to erode)
 * @param {object} params      see EROSION_DEFAULTS
 */
export function erodeGrid(grid, n, mask, params) {
  const p = Object.assign({}, EROSION_DEFAULTS, params);
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const N = n * n, S = p.cellScale;
  const map = new Float32Array(N);
  for (let i = 0; i < N; i++) map[i] = grid[i] / S;          // cell units
  const flow = new Float32Array(N), dep = new Float32Array(N);

  // Erosion brush (offsets + normalised weights).
  const r = Math.max(1, Math.round(p.radius));
  let bn = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy < r * r) bn++;
  const bOff = new Int32Array(bn * 2), bW = new Float32Array(bn);
  { let k = 0, ws = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const sq = dx * dx + dy * dy; if (sq >= r * r) continue;
      bOff[k * 2] = dx; bOff[k * 2 + 1] = dy; bW[k] = 1 - Math.sqrt(sq) / r; ws += bW[k]; k++;
    }
    for (let k2 = 0; k2 < bn; k2++) bW[k2] /= ws || 1;
  }

  const rand = mulberry32((p.seed | 0) || 1);
  const landMin = p.landMin / S;
  let spawned = 0;
  // ------------------------------------------------------------ hydraulic pass
  for (let iter = 0; iter < p.droplets; iter++) {
    let posX = 0, posY = 0, ok = false;
    for (let tries = 0; tries < 6 && !ok; tries++) {
      posX = 1 + rand() * (n - 3); posY = 1 + rand() * (n - 3);
      ok = map[(posY | 0) * n + (posX | 0)] > landMin;
    }
    if (!ok) continue;
    spawned++;
    let dirX = 0, dirY = 0, speed = p.initialSpeed, water = p.initialWater, sediment = 0;
    for (let life = 0; life < p.maxLifetime; life++) {
      const nodeX = posX | 0, nodeY = posY | 0, ci = nodeY * n + nodeX;
      const offX = posX - nodeX, offY = posY - nodeY;
      const hNW = map[ci], hNE = map[ci + 1], hSW = map[ci + n], hSE = map[ci + n + 1];
      const gx = (hNE - hNW) * (1 - offY) + (hSE - hSW) * offY;
      const gy = (hSW - hNW) * (1 - offX) + (hSE - hNE) * offX;
      const h0 = hNW * (1 - offX) * (1 - offY) + hNE * offX * (1 - offY) + hSW * (1 - offX) * offY + hSE * offX * offY;
      dirX = dirX * p.inertia - gx * (1 - p.inertia);
      dirY = dirY * p.inertia - gy * (1 - p.inertia);
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len === 0) break;
      dirX /= len; dirY /= len;
      posX += dirX; posY += dirY;
      flow[ci] += water;
      if (posX < 1 || posX >= n - 2 || posY < 1 || posY >= n - 2) break;
      const nx = posX | 0, ny = posY | 0, nci = ny * n + nx, fx = posX - nx, fy = posY - ny;
      const h1 = map[nci] * (1 - fx) * (1 - fy) + map[nci + 1] * fx * (1 - fy) + map[nci + n] * (1 - fx) * fy + map[nci + n + 1] * fx * fy;
      const dh = h1 - h0;
      if (h1 < 0) {                                        // reached the sea: drop the load at the shore and die
        const d = sediment * 0.5;
        map[ci] += d; dep[ci] += d; break;
      }
      const cap = Math.max(-dh, p.minSlope) * speed * water * p.sedimentCapacity;
      if (sediment > cap || dh > 0) {
        const d = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * p.depositionRate;
        sediment -= d;
        map[ci] += d * (1 - offX) * (1 - offY); map[ci + 1] += d * offX * (1 - offY);
        map[ci + n] += d * (1 - offX) * offY; map[ci + n + 1] += d * offX * offY;
        dep[ci] += d;
      } else {
        const amt = Math.min((cap - sediment) * p.erosionRate, -dh);
        for (let b = 0; b < bn; b++) {
          const ex = nodeX + bOff[b * 2], ey = nodeY + bOff[b * 2 + 1];
          if (ex < 0 || ex >= n || ey < 0 || ey >= n) continue;
          const ei = ey * n + ex, w = amt * bW[b];
          const rem = map[ei] - w < 0 ? Math.max(0, map[ei]) : w;   // never dig land below sea level
          map[ei] -= rem; sediment += rem;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * p.gravity));
      water *= 1 - p.evaporation;
    }
  }
  const tHyd = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // -------------------------------------------------------------- thermal pass
  if (p.thermalIterations > 0 && p.thermalStrength > 0) {
    const delta = new Float32Array(N);
    for (let it = 0; it < p.thermalIterations; it++) {
      delta.fill(0);
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const i = y * n + x, h = map[i];
        if (h <= landMin) continue;
        let md = 0, tg = -1, d;
        d = h - map[i - 1]; if (d > md) { md = d; tg = i - 1; }
        d = h - map[i + 1]; if (d > md) { md = d; tg = i + 1; }
        d = h - map[i - n]; if (d > md) { md = d; tg = i - n; }
        d = h - map[i + n]; if (d > md) { md = d; tg = i + n; }
        if (tg >= 0 && md > p.talus) {
          const mv = (md - p.talus) * 0.5 * p.thermalStrength;
          delta[i] -= mv; delta[tg] += mv;
        }
      }
      for (let i = 0; i < N; i++) map[i] += delta[i];
    }
  }

  // ----------------------------------------- masked blend back into the grid
  let changed = 0, sumAbs = 0, maxAbs = 0;
  const md = p.maxDelta;
  for (let i = 0; i < N; i++) {
    const m = mask[i];
    if (m <= 0) continue;
    let dlt = map[i] * S - grid[i];
    if (dlt > md) dlt = md; else if (dlt < -md) dlt = -md;
    dlt *= m;
    if (grid[i] > 0 && grid[i] + dlt < 0.5) dlt = 0.5 - grid[i];   // erosion never turns land into sea
    grid[i] += dlt;
    if (dlt !== 0) { changed++; const a = dlt < 0 ? -dlt : dlt; sumAbs += a; if (a > maxAbs) maxAbs = a; }
  }

  // ------------------------------------------------ analysis -> vertex data
  // cavity AO from the final grid's Laplacian (concave = darker, convex = >0.5),
  // sediment and flow normalised with a soft (sqrt / log) curve.
  const out = new Float32Array(N * 3);
  let fMax = 1e-6, dMax = 1e-6;
  for (let i = 0; i < N; i++) { if (flow[i] > fMax) fMax = flow[i]; if (dep[i] > dMax) dMax = dep[i]; }
  const lf = Math.log(1 + fMax), invS = 1 / S;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    let cav = 0.5;
    if (x > 0 && y > 0 && x < n - 1 && y < n - 1 && grid[i] > -1) {
      const lap = (grid[i - 1] + grid[i + 1] + grid[i - n] + grid[i + n]) * 0.25 - grid[i];   // >0 concave
      cav = 0.5 - Math.max(-0.5, Math.min(0.5, lap * invS * 1.8));
    }
    out[i * 3] = cav;
    out[i * 3 + 1] = Math.min(1, Math.sqrt(dep[i] / dMax) * 1.6);
    out[i * 3 + 2] = Math.log(1 + flow[i]) / lf;
  }
  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return { erosion: out, stats: { ms: +(t1 - t0).toFixed(1), hydraulicMs: +(tHyd - t0).toFixed(1), droplets: spawned,
    changed, meanAbs: changed ? +(sumAbs / changed).toFixed(2) : 0, maxAbs: +maxAbs.toFixed(2) } };
}
