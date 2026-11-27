// Terrain v2 parity + clearance test (Node, no browser).
//   node angel-zero/scripts/terrain_parity.mjs
// 1. heightAt() equals the baked Uint16 grid at texel centres and its bilinear in between
//    (crag disabled by a far viewer), and the crag stays within +/-CRAG_AMP near the viewer.
// 2. Gameplay ground stays clear: RWY 18/36 pad at 10 m, approach funnels under the 3 deg
//    glide path, the GORGE floor matches the authored trench, the STRAIT channel stays open.
// Exit code 1 on any failure.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assemblePack, createSampler } from '../src/terrainpack.js';
import { createGeography, RWY, CORE, CRAG_AMP } from '../src/geography.js';
import { createNoise2D, fbm } from '../src/noise.js';
import { GORGE_Z0, GORGE_CRATER_Z, GORGE_HALF_W, gorgeCentreX, gorgeDist } from '../src/maps.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'terrain');
const geo = createGeography({ createNoise2D, fbm });
const gz = b => (b[0] === 0x1f && b[1] === 0x8b ? new Uint8Array(gunzipSync(b)) : new Uint8Array(b));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

for (const map of ['archipelago', 'gorge', 'strait']) {
  const dir = join(ROOT, map);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const pack = assemblePack(meta, gz(readFileSync(join(dir, 'height16.bin'))), gz(readFileSync(join(dir, 'splat.bin'))));
  const S = createSampler(pack), c = { ...meta.core, x0: meta.core.cx - meta.core.size / 2, z0: meta.core.cz - meta.core.size / 2 }, n = c.n, scale = (c.maxH - c.minH) / 65535;
  S.setViewer(1e9, 1e9);
  const Q = (ix, iz) => c.minH + pack.q[iz * n + ix] * scale;
  // --- 1a. texel centres
  let maxE = 0;
  for (let k = 0; k < 20000; k++) {
    const ix = Math.floor(rnd() * n), iz = Math.floor(rnd() * n);
    maxE = Math.max(maxE, Math.abs(S.heightAt(c.x0 + ix * c.step, c.z0 + iz * c.step) - Q(ix, iz)));
  }
  check(maxE < 1e-3, `${map}: heightAt == baked texel (max err ${maxE.toExponential(2)} m)`);
  // --- 1b. independent bilinear between texels
  maxE = 0;
  for (let k = 0; k < 20000; k++) {
    const fx = rnd() * (n - 1.001), fz = rnd() * (n - 1.001), ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const ref = (Q(ix, iz) * (1 - tx) + Q(ix + 1, iz) * tx) * (1 - tz) + (Q(ix, iz + 1) * (1 - tx) + Q(ix + 1, iz + 1) * tx) * tz;
    maxE = Math.max(maxE, Math.abs(S.heightAt(c.x0 + fx * c.step, c.z0 + fz * c.step) - ref));
  }
  check(maxE < 1e-3, `${map}: heightAt == bilinear(baked) (max err ${maxE.toExponential(2)} m)`);
  // --- 1c. crag bounded near the viewer, zero beyond the fade
  let maxC = 0, farC = 0;
  for (let k = 0; k < 4000; k++) {
    const x = (rnd() - 0.5) * 30000, z = CORE.CZ + (rnd() - 0.5) * 30000;
    S.setViewer(x + 200, z); const near = S.heightAt(x, z) - S.baseHeight(x, z);
    S.setViewer(x + 3000, z); const far = S.heightAt(x, z) - S.baseHeight(x, z);
    maxC = Math.max(maxC, Math.abs(near)); farC = Math.max(farC, Math.abs(far));
  }
  S.setViewer(1e9, 1e9);
  check(maxC <= CRAG_AMP + 1e-6 && farC < 1e-9, `${map}: crag |near| ${maxC.toFixed(2)} <= ${CRAG_AMP}, far ${farC}`);
  // --- 1d. seamless core edge -> horizonHeight
  let seam = 0;
  for (let k = 0; k < 400; k++) {
    const t = rnd() * CORE.SIZE + c.x0, e = 0.5;
    seam = Math.max(seam, Math.abs(S.heightAt(t, c.z0 + e) - S.heightAt(t, c.z0 - e)), Math.abs(S.heightAt(c.x0 + e, t - c.x0 + c.z0) - S.heightAt(c.x0 - e, t - c.x0 + c.z0)));
  }
  check(seam < 3, `${map}: core edge seam max step ${seam.toFixed(2)} m`);

  // --- 2. gameplay clearances
  if (map !== 'strait') {
    let lo = 1e9, hi = -1e9;
    for (let z = RWY.z0; z <= RWY.z1; z += 25) for (let x = RWY.x - RWY.width / 2; x <= RWY.x + RWY.width / 2; x += 5) { const h = S.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    check(Math.abs(lo - RWY.elev) < 0.1 && Math.abs(hi - RWY.elev) < 0.1, `${map}: RWY 18/36 pad ${lo.toFixed(2)}..${hi.toFixed(2)} m (want ${RWY.elev})`);
    // (the authored 22 m overrun shelf 400 m past the north threshold is inside the first 600 m)
    let worst = -1e9, raise = -1e9;
    for (const [z0, dir] of [[RWY.z1, 1], [RWY.z0, -1]]) for (let d = 0; d <= 5000; d += 50) for (let dx = -300; dx <= 300; dx += 50) {
      const x = RWY.x + dx, z = z0 + dir * d, h = S.heightAt(x, z);
      if (d >= 600) worst = Math.max(worst, h - (RWY.elev + Math.tan(3 * Math.PI / 180) * d - 10));
      raise = Math.max(raise, h - geo.heightFns[map](x, z));
    }
    check(worst <= 0, `${map}: approach funnels >= 10 m under 3 deg glide path beyond 600 m (worst ${worst.toFixed(1)} m)`);
    check(raise < 5, `${map}: approach funnels within erosion tolerance of the authored ground (max +${raise.toFixed(2)} m)`);
  }
  if (map === 'gorge') {
    let maxD = 0, rough = 0, at = '', rat = '';
    for (let z = GORGE_Z0 - 200; z > GORGE_CRATER_Z + 900; z -= 20) {
      const x = gorgeCentreX(z);
      for (const off of [-GORGE_HALF_W * 0.6, 0, GORGE_HALF_W * 0.6]) {
        const h = S.heightAt(x + off, z), a = geo.gorgeHeight(x + off, z);
        // authored cliffs (crater bowl lip) are sampled at 19.5 m: skip cells beside a > 5 m step
        let cliff = 0;
        for (const [dx, dz] of [[c.step, 0], [-c.step, 0], [0, c.step], [0, -c.step]]) cliff = Math.max(cliff, Math.abs(geo.gorgeHeight(x + off + dx, z + dz) - a));
        if (cliff > 5) continue;
        if (Math.abs(h - a) > maxD) { maxD = Math.abs(h - a); at = `z=${z} off=${off.toFixed(0)} baked ${h.toFixed(1)} authored ${a.toFixed(1)}`; }
      }
      if (Math.abs(geo.gorgeHeight(x, z) - geo.gorgeHeight(gorgeCentreX(z - 40), z - 40)) > 5 || Math.abs(geo.gorgeHeight(x, z) - geo.gorgeHeight(gorgeCentreX(z + 20), z + 20)) > 5) continue;
      const r = Math.abs(S.heightAt(x, z) - S.heightAt(gorgeCentreX(z - 20), z - 20)) - Math.abs(geo.gorgeHeight(x, z) - geo.gorgeHeight(gorgeCentreX(z - 20), z - 20));
      if (r > rough) { rough = r; rat = `z=${z}`; }
    }
    check(maxD < 6, `GORGE: corridor floor within ${maxD.toFixed(2)} m of the authored trench (${at})`);
    check(rough < 4, `GORGE: centreline adds <= ${rough.toFixed(2)} m step per 20 m over the authored floor (${rat})`);
    let wallOk = true;
    for (let z = GORGE_Z0 - 400; z > GORGE_CRATER_Z + 900; z -= 100) for (let x = -9000; x <= -1400; x += 40) {
      if (gorgeDist(x, z) < GORGE_HALF_W * 0.9 && S.heightAt(x, z) > 80) wallOk = false;
    }
    check(wallOk, 'GORGE: no terrain above 80 m inside the floor half-width');
  }
  if (map === 'strait') {
    let worst = -1e9;
    for (let z = c.z0 + 2000; z < c.z0 + CORE.SIZE - 2000; z += 100) for (let x = -3000; x <= 3000; x += 100) worst = Math.max(worst, S.heightAt(x, z));
    check(worst < -5, `STRAIT: channel |x|<3000 open water (highest ${worst.toFixed(1)} m)`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
