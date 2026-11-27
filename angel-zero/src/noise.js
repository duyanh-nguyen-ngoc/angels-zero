// ANGELS ZERO — seeded noise shared by the browser runtime and the offline terrain
// baker (scripts/bake_terrain.mjs). Pure JS, no DOM / THREE: the baked heightfields
// and every runtime analytic query (prop placement, horizon) use identical numbers.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D simplex noise with a mulberry32-shuffled permutation (range about -1..1).
export function createNoise2D(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const r = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[r]; p[r] = t; }
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
  const grad = new Float32Array([1,1, -1,1, 1,-1, -1,-1, 1,0, -1,0, 1,0, -1,0, 0,1, 0,-1, 0,1, 0,-1]);
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const g0 = pm12[ii + perm[jj]] * 2, g1 = pm12[ii + i1 + perm[jj + j1]] * 2, g2 = pm12[ii + 1 + perm[jj + 1]] * 2;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * (grad[g0] * x0 + grad[g0 + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * (grad[g1] * x1 + grad[g1 + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * (grad[g2] * x2 + grad[g2 + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}

export function fbm(noise, x, y, octaves, lac = 2.0, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * noise(x * freq, y * freq); norm += amp; amp *= gain; freq *= lac; }
  return sum / norm;
}
