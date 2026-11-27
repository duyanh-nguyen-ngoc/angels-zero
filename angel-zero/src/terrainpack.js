// ANGELS ZERO — Terrain v2 baked-pack decoding + exact CPU height sampler.
//
// Pure JS (browser + Node). A pack is what scripts/bake_terrain.mjs writes to
// assets/terrain/<map>/: meta.json, height16.bin, splat.bin (both gzip). The browser
// loader gunzips with DecompressionStream (only when the gzip magic is present, so a CDN
// that already decoded Content-Encoding is fine) and memoises one pack per map.
//
// createSampler(pack) returns the CPU twin of the clipmap vertex shader (clipmap.js):
//   inside the 40 km core  : manual bilinear over the Uint16 heightfield (same 4 texels,
//                            same weights as the GLSL texelFetch path) + crag displacement
//                            (bilinear normal / landUse, faded 1.5-2.5 km from the viewer);
//   outside the core       : horizonHeight(x, z, mapId) (GLSL twin in clipmap.js).
// Zero allocations per query.

import { CORE, horizonHeight, cragNoise, cragGate, CRAG_AMP, MAP_IDS, ss } from './geography.js?v=s10ter6';

export const CRAG_FADE = [1500, 2500];                     // m from the viewer (CPU == GPU)

const isGzip = b => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
async function gunzipMaybe(buf) {
  const u8 = new Uint8Array(buf);
  if (!isGzip(u8)) return u8;
  const ds = new DecompressionStream('gzip');
  const out = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(out);
}

// zigzag(signed gradient residual) hi / lo planes -> Uint16 heights.
export function decodeHeight(bytes, n) {
  const N2 = n * n, q = new Uint16Array(N2);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, z = (bytes[i] << 8) | bytes[N2 + i];
    const r = (z >>> 1) ^ -(z & 1);
    const l = x > 0 ? q[i - 1] : (y > 0 ? q[i - n] : 0), u = y > 0 ? q[i - n] : l, ul = x > 0 && y > 0 ? q[i - n - 1] : u;
    q[i] = (l + u - ul + r) & 0xffff;
  }
  return q;
}
// Planar R | G | B | A -> interleaved RGBA8.
export function decodeSplat(bytes, sn) {
  const S2 = sn * sn, out = new Uint8Array(S2 * 4);
  for (let i = 0; i < S2; i++) { out[i * 4] = bytes[i]; out[i * 4 + 1] = bytes[S2 + i]; out[i * 4 + 2] = bytes[2 * S2 + i]; out[i * 4 + 3] = bytes[3 * S2 + i]; }
  return out;
}
// RG8 normals (nx, nz in 0..255) from central differences of the decoded heights.
export function buildNormals(q, n, step, minH, rangeH) {
  const out = new Uint8Array(n * n * 2), k = rangeH / 65535 / (2 * step);
  for (let y = 0; y < n; y++) {
    const ym = y > 0 ? y - 1 : 0, yp = y < n - 1 ? y + 1 : n - 1;
    for (let x = 0; x < n; x++) {
      const xm = x > 0 ? x - 1 : 0, xp = x < n - 1 ? x + 1 : n - 1;
      const gx = (q[y * n + xp] - q[y * n + xm]) * k, gz = (q[yp * n + x] - q[ym * n + x]) * k;
      const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz), i = (y * n + x) * 2;
      out[i] = Math.round((-gx * inv * 0.5 + 0.5) * 255); out[i + 1] = Math.round((-gz * inv * 0.5 + 0.5) * 255);
    }
  }
  return out;
}
export function assemblePack(meta, heightBytes, splatBytes) {
  const c = meta.core, q = decodeHeight(heightBytes, c.n);
  return { meta, map: meta.map, mapId: meta.mapId, q, splat: decodeSplat(splatBytes, c.splatN), normal: buildNormals(q, c.n, c.step, c.minH, c.maxH - c.minH) };
}

const _packCache = new Map();
export function loadTerrainPack(map, base = 'assets/terrain', tag = '') {
  if (_packCache.has(map)) return _packCache.get(map);
  const q = tag ? '?v=' + tag : '';
  const p = (async () => {
    const t0 = performance.now();
    const [meta, hb, sb] = await Promise.all([
      fetch(`${base}/${map}/meta.json${q}`).then(r => { if (!r.ok) throw new Error('meta ' + r.status); return r.json(); }),
      fetch(`${base}/${map}/height16.bin${q}`).then(r => { if (!r.ok) throw new Error('height ' + r.status); return r.arrayBuffer(); }).then(gunzipMaybe),
      fetch(`${base}/${map}/splat.bin${q}`).then(r => { if (!r.ok) throw new Error('splat ' + r.status); return r.arrayBuffer(); }).then(gunzipMaybe)
    ]);
    const pack = assemblePack(meta, hb, sb);
    pack.loadMs = +(performance.now() - t0).toFixed(1);
    return pack;
  })();
  _packCache.set(map, p);
  p.catch(() => _packCache.delete(map));
  return p;
}
export const packLoaded = map => _packCache.has(map);

/* ------------------------------------------------------------- CPU sampler */
export function createSampler(pack) {
  const c = pack.meta.core, n = c.n, step = c.step, x0 = c.cx - c.size / 2, z0 = c.cz - c.size / 2;
  const minH = c.minH, scale = (c.maxH - c.minH) / 65535, sn = c.splatN;
  const q = pack.q, nrm = pack.normal, sp = pack.splat, mapId = pack.mapId;
  let vx = 0, vz = 0;
  // GPU LINEAR filtering of an n x n texture at uv = (f + 0.5) / n  ==  bilinear at texel coord f.
  function bilin2(arr, stride, off, size, fx, fz) {
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const x0i = ix < 0 ? 0 : ix > size - 1 ? size - 1 : ix, x1i = ix + 1 < 0 ? 0 : ix + 1 > size - 1 ? size - 1 : ix + 1;
    const z0i = iz < 0 ? 0 : iz > size - 1 ? size - 1 : iz, z1i = iz + 1 < 0 ? 0 : iz + 1 > size - 1 ? size - 1 : iz + 1;
    const a = arr[(z0i * size + x0i) * stride + off], b = arr[(z0i * size + x1i) * stride + off];
    const d = arr[(z1i * size + x0i) * stride + off], e = arr[(z1i * size + x1i) * stride + off];
    return (a + (b - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
  }
  function baseHeight(x, z) {
    const fx = (x - x0) / step, fz = (z - z0) / step;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return horizonHeight(x, z, mapId);
    return minH + bilin2(q, 1, 0, n, fx, fz) * scale;
  }
  function heightAt(x, z) {
    const fx = (x - x0) / step, fz = (z - z0) / step;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return horizonHeight(x, z, mapId);
    let h = minH + bilin2(q, 1, 0, n, fx, fz) * scale;
    const fade = 1 - ss(Math.hypot(x - vx, z - vz), CRAG_FADE[0], CRAG_FADE[1]);
    if (fade > 0) {
      const nx = bilin2(nrm, 2, 0, n, fx, fz) / 255 * 2 - 1, nz = bilin2(nrm, 2, 1, n, fx, fz) / 255 * 2 - 1;
      const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
      const lu = bilin2(sp, 4, 3, sn, fx * 0.5, fz * 0.5) / 255;
      const g = cragGate(1 - ny, ss(lu, 0.88, 0.98));
      if (g > 0) h += CRAG_AMP * cragNoise(x, z) * g * fade;
    }
    return h;
  }
  // Erosion / landUse lookup (cavity, sediment, flow, landUse; 0..1) for clutter placement.
  function splatAt(x, z, ch) {
    const fx = (x - x0) / step, fz = (z - z0) / step;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return ch === 3 ? (horizonHeight(x, z, mapId) > 0 ? 32 / 255 : 0) : 0.5;
    return bilin2(sp, 4, ch, sn, fx * 0.5, fz * 0.5) / 255;
  }
  function slopeAt(x, z) {
    const fx = (x - x0) / step, fz = (z - z0) / step;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) return 0;
    const nx = bilin2(nrm, 2, 0, n, fx, fz) / 255 * 2 - 1, nz = bilin2(nrm, 2, 1, n, fx, fz) / 255 * 2 - 1;
    return 1 - Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
  }
  return { heightAt, baseHeight, splatAt, slopeAt, setViewer(x, z) { vx = x; vz = z; }, pack, mapId, get viewer() { return [vx, vz]; } };
}
export { MAP_IDS, CORE };
