// ANGELS ZERO — offline Terrain v2 baker (Node ESM, zero dependencies).
//
//   node angel-zero/scripts/bake_terrain.mjs [archipelago|gorge|strait|all] [--preview <dir>]
//
// For each map: samples src/geography.js over the 40 x 40 km core at 2048^2 (cross-faded
// into horizonHeight() over the outer apron), runs 250k-droplet multi-pass hydraulic
// erosion (brush radius 4 -> 2 -> 1) and 12 thermal talus passes (~48 deg) through a
// per-cell protect mask (runway pad, approach funnels, Port City, bridge spits, canyon
// corridor / crater / shortcut / dam, strait prop sites, coastline, horizon apron), then
// bakes a 1024^2 analysis splat. Writes assets/terrain/<map>/:
//   height16.bin  gzip( row-delta-coded Uint16 2048^2, split into hi / lo byte planes )
//   splat.bin     gzip( planar 1024^2 R cavity AO | G sediment | B flow | A landUse class )
//   meta.json     core frame, encoding, anchors, landmarks, checksums, stats
// Deterministic: same inputs -> identical bytes (checksums printed and stored).

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createNoise2D, fbm } from '../src/noise.js';
import { createGeography, CORE, RWY, MAP_IDS, horizonHeight, ss } from '../src/geography.js';
import {
  gorgeCentreX, gorgeDist, GORGE_CRATER_Z, GORGE_CRATER_R, GORGE_RAMP_W, GORGE_BBOX,
  GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_ZB, GORGE_SC_RAMP_W
} from '../src/maps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'terrain');
const args = process.argv.slice(2);
const which = (args.find(a => !a.startsWith('--')) || 'all').toLowerCase();
const pi = args.indexOf('--preview');
const PREVIEW_DIR = pi >= 0 ? args[pi + 1] : path.join(os.tmpdir(), 'az_terrain_preview');
const N = CORE.N, STEP = CORE.STEP, X0 = CORE.X0, Z0 = CORE.Z0;
const geo = createGeography({ createNoise2D, fbm });

const EROSION = {
  passes: [{ droplets: 100000, radius: 4 }, { droplets: 90000, radius: 2 }, { droplets: 60000, radius: 1 }],
  maxLifetime: 48, inertia: 0.06, sedimentCapacity: 3.4, minSlope: 0.01, depositionRate: 0.26, erosionRate: 0.16,
  evaporation: 0.02, gravity: 4.2, thermalIterations: 12, thermalStrength: 0.4,
  talus: Math.tan(48 * Math.PI / 180),                     // cell units (height step / STEP)
  landMin: 3, maxDelta: 70
};

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rectDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

/* ------------------------------------------------------------- protect masks */
// 1 = free to erode, 0 = never moves. `urban` marks flat authored pads (landUse 255).
function protectAt(map, x, z) {
  let m = 1, urban = 0;
  const pad = rectDist(x, z, RWY.x - 300, RWY.x + 470, RWY.z0 - 140, RWY.z1 + 160);
  const town = rectDist(x, z, -2050, -450, -1850, 350);
  if (map !== 'strait') {
    m = Math.min(m, ss(pad, 250, 650));
    m = Math.min(m, ss(rectDist(x, z, RWY.x - 700, RWY.x + 700, RWY.z0 - 3800, RWY.z1 + 3800), 0, 400));
    m = Math.min(m, ss(town, 150, 500));
    for (const b of geo.BRIDGES) {
      m = Math.min(m, ss(geo.capsule(x, z, b.fromA[0], b.fromA[1], b.a[0], b.a[1]), 380, 700));
      m = Math.min(m, ss(geo.capsule(x, z, b.fromB[0], b.fromB[1], b.b[0], b.b[1]), 380, 700));
    }
    if (pad < 1) urban = 1;
    else if (town < 1) urban = 1;
  }
  if (map === 'gorge' && geo.inGorgeBox(x, z)) {
    const d = gorgeDist(x, z), cr = Math.hypot(x - gorgeCentreX(GORGE_CRATER_Z), z - GORGE_CRATER_Z);
    m = Math.min(m, ss(d, GORGE_RAMP_W + 260, GORGE_RAMP_W + 900));
    m = Math.min(m, ss(cr, GORGE_CRATER_R * 1.7, GORGE_CRATER_R * 2.4));
    if (z < GORGE_SC_ZA + 400 && z > GORGE_SC_ZB - 400) m = Math.min(m, ss(Math.abs(x - GORGE_SC_X), GORGE_SC_RAMP_W + 200, GORGE_SC_RAMP_W + 600));
    m = Math.min(m, ss(Math.hypot(x - geo.DAM.x, z - geo.DAM.z), 450, 900));
    // keep the trench bbox edge stable (gorge <-> archipelago seam)
    const edge = Math.min(Math.abs(x - GORGE_BBOX.x[0]), Math.abs(x - GORGE_BBOX.x[1]), Math.abs(z - GORGE_BBOX.z[0]), Math.abs(z - GORGE_BBOX.z[1]));
    m = Math.min(m, ss(edge, 0, 300));
  }
  if (map === 'strait') for (const s of [...geo.STRAIT_SITES.lighthouses, ...geo.STRAIT_SITES.radars]) m = Math.min(m, ss(Math.hypot(x - s[0], z - s[1]), 260, 560));
  return { m, urban };
}

/* ------------------------------------------------------------------ erosion */
// The strait is ~44 % bare rock wall: weight its 250k droplets toward the broad passes
// (big carved couloirs, less per-texel speckle) so the pack stays inside 5 MB.
const EROSION_BY_MAP = {
  strait: { passes: [{ droplets: 130000, radius: 4 }, { droplets: 95000, radius: 2 }, { droplets: 25000, radius: 1 }], erosionRate: 0.13 }
};
function erode(H, mask, seed, mapName) {
  const p = Object.assign({}, EROSION, EROSION_BY_MAP[mapName] || {}), S = STEP, NN = N * N;
  const map = new Float32Array(NN);
  for (let i = 0; i < NN; i++) map[i] = H[i] / S;
  const flow = new Float32Array(NN), dep = new Float32Array(NN);
  const rand = mulberry32(seed);
  const landMin = p.landMin / S;
  let spawned = 0;
  for (const pass of p.passes) {
    const r = pass.radius;
    const off = [], wt = [];
    let ws = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const sq = dx * dx + dy * dy; if (r > 1 && sq >= r * r) continue; if (r === 1 && sq > 1) continue;
      off.push(dx, dy); const w = r === 1 ? (sq === 0 ? 2 : 1) : 1 - Math.sqrt(sq) / r; wt.push(w); ws += w;
    }
    const bOff = Int32Array.from(off), bW = Float32Array.from(wt.map(w => w / ws)), bn = bW.length;
    for (let iter = 0; iter < pass.droplets; iter++) {
      let posX = 0, posY = 0, ok = false;
      for (let tries = 0; tries < 8 && !ok; tries++) {
        posX = 2 + rand() * (N - 5); posY = 2 + rand() * (N - 5);
        const k = (posY | 0) * N + (posX | 0);
        ok = map[k] > landMin && mask[k] > 0.02;
      }
      if (!ok) continue;
      spawned++;
      let dirX = 0, dirY = 0, speed = 1, water = 1, sediment = 0;
      for (let life = 0; life < p.maxLifetime; life++) {
        const nodeX = posX | 0, nodeY = posY | 0, ci = nodeY * N + nodeX;
        const ox = posX - nodeX, oy = posY - nodeY;
        const hNW = map[ci], hNE = map[ci + 1], hSW = map[ci + N], hSE = map[ci + N + 1];
        const gx = (hNE - hNW) * (1 - oy) + (hSE - hSW) * oy;
        const gy = (hSW - hNW) * (1 - ox) + (hSE - hNE) * ox;
        const h0 = hNW * (1 - ox) * (1 - oy) + hNE * ox * (1 - oy) + hSW * (1 - ox) * oy + hSE * ox * oy;
        dirX = dirX * p.inertia - gx * (1 - p.inertia);
        dirY = dirY * p.inertia - gy * (1 - p.inertia);
        const len = Math.hypot(dirX, dirY);
        if (len === 0) break;
        dirX /= len; dirY /= len; posX += dirX; posY += dirY;
        flow[ci] += water;
        if (posX < 2 || posX >= N - 3 || posY < 2 || posY >= N - 3) break;
        const nx = posX | 0, ny = posY | 0, nci = ny * N + nx, fx = posX - nx, fy = posY - ny;
        const h1 = map[nci] * (1 - fx) * (1 - fy) + map[nci + 1] * fx * (1 - fy) + map[nci + N] * (1 - fx) * fy + map[nci + N + 1] * fx * fy;
        const dh = h1 - h0;
        if (h1 < 0) { const d = sediment * 0.5; map[ci] += d; dep[ci] += d; break; }
        const cap = Math.max(-dh, p.minSlope) * speed * water * p.sedimentCapacity;
        if (sediment > cap || dh > 0) {
          const d = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * p.depositionRate;
          sediment -= d;
          map[ci] += d * (1 - ox) * (1 - oy); map[ci + 1] += d * ox * (1 - oy);
          map[ci + N] += d * (1 - ox) * oy; map[ci + N + 1] += d * ox * oy;
          dep[ci] += d;
        } else {
          const amt = Math.min((cap - sediment) * p.erosionRate, -dh);
          for (let b = 0; b < bn; b++) {
            const ex = nodeX + bOff[b * 2], ey = nodeY + bOff[b * 2 + 1];
            if (ex < 0 || ex >= N || ey < 0 || ey >= N) continue;
            const ei = ey * N + ex, w = amt * bW[b];
            const rem = map[ei] - w < 0 ? Math.max(0, map[ei]) : w;
            map[ei] -= rem; sediment += rem;
          }
        }
        speed = Math.sqrt(Math.max(0, speed * speed - dh * p.gravity));
        water *= 1 - p.evaporation;
      }
    }
  }
  // Thermal talus relaxation.
  const delta = new Float32Array(NN);
  for (let it = 0; it < p.thermalIterations; it++) {
    delta.fill(0);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x, h = map[i];
      if (h <= landMin) continue;
      let md = 0, tg = -1, d;
      d = h - map[i - 1]; if (d > md) { md = d; tg = i - 1; }
      d = h - map[i + 1]; if (d > md) { md = d; tg = i + 1; }
      d = h - map[i - N]; if (d > md) { md = d; tg = i - N; }
      d = h - map[i + N]; if (d > md) { md = d; tg = i + N; }
      if (tg >= 0 && md > p.talus) { const mv = (md - p.talus) * 0.5 * p.thermalStrength; delta[i] -= mv; delta[tg] += mv; dep[tg] += mv * 0.5; }
    }
    for (let i = 0; i < NN; i++) map[i] += delta[i];
  }
  // Masked blend back (clamped), never turning land into sea.
  let changed = 0, sumAbs = 0, maxAbs = 0;
  for (let i = 0; i < NN; i++) {
    const m = mask[i]; if (m <= 0) continue;
    let dlt = map[i] * S - H[i];
    if (dlt > p.maxDelta) dlt = p.maxDelta; else if (dlt < -p.maxDelta) dlt = -p.maxDelta;
    dlt *= m;
    if (H[i] > 0 && H[i] + dlt < 0.5) dlt = 0.5 - H[i];
    H[i] += dlt;
    if (dlt) { changed++; const a = Math.abs(dlt); sumAbs += a; if (a > maxAbs) maxAbs = a; }
  }
  return { flow, dep, stats: { droplets: spawned, changed, meanAbs: +(sumAbs / Math.max(1, changed)).toFixed(2), maxAbs: +maxAbs.toFixed(1) } };
}

/* ----------------------------------------------------------------- analysis */
function analyse(H, flow, dep, urbanMask) {
  const SN = CORE.SPLAT_N, splat = new Uint8Array(SN * SN * 4);
  let fMax = 1e-6, dMax = 1e-6;
  for (let i = 0; i < N * N; i++) { if (flow[i] > fMax) fMax = flow[i]; if (dep[i] > dMax) dMax = dep[i]; }
  const lf = Math.log(1 + fMax);
  const at = (x, y) => H[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
  const counts = { water: 0, farm: 0, forest: 0, rock: 0, urban: 0, scrub: 0 };
  for (let sy = 0; sy < SN; sy++) for (let sx = 0; sx < SN; sx++) {
    const x = sx * 2, y = sy * 2, i = y * N + x;
    const h = (at(x, y) + at(x + 1, y) + at(x, y + 1) + at(x + 1, y + 1)) * 0.25;
    // multi-scale Laplacian cavity (concave < 0.5 < convex)
    const l1 = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) * 0.25 - at(x, y);
    const l4 = (at(x - 4, y) + at(x + 4, y) + at(x, y - 4) + at(x, y + 4)) * 0.25 - at(x, y);
    const l12 = (at(x - 12, y) + at(x + 12, y) + at(x, y - 12) + at(x, y + 12)) * 0.25 - at(x, y);
    const cav = h < -1 ? 0.5 : Math.max(0, Math.min(1, 0.5 - (l1 * 0.6 + l4 * 0.18 + l12 * 0.05) / STEP * 1.6));
    const gx = (at(x + 1, y) - at(x - 1, y)) / (2 * STEP), gz = (at(x, y + 1) - at(x, y - 1)) / (2 * STEP);
    const slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
    const f = Math.max(flow[i], flow[i + 1], flow[i + N], flow[i + N + 1]);
    const d = dep[i] + dep[i + 1] + dep[i + N] + dep[i + N + 1];
    const flowN = Math.log(1 + f) / lf, sedN = Math.min(1, Math.sqrt(d / dMax) * 1.7);
    // landUse class: 0 water, 32 scrub/grass, 64 farmland, 128 forest, 192 rock/alpine, 255 urban/protected pad
    const wx = X0 + x * STEP, wz = Z0 + y * STEP;
    const nz = fbm(nForest, wx * 0.0011, wz * 0.0011, 3);
    let lu;
    if (urbanMask[i]) { lu = 255; counts.urban++; }
    else if (h < 0.6) { lu = 0; counts.water++; }
    else if (slope > 0.42 || h > 1350 + 120 * nz) { lu = 192; counts.rock++; }
    else if (h > 4 && h < 190 && slope < 0.07 && flowN < 0.6 && nz < 0.25) { lu = 64; counts.farm++; }
    else if (h > 15 && h < 880 && slope < 0.34 && nz > -0.35) { lu = 128; counts.forest++; }
    else { lu = 32; counts.scrub++; }
    const k = (sy * SN + sx) * 4;
    const q6 = v => Math.min(248, Math.round(v * 31) * 8);   // 5-bit shading channels (smooth, compressible)
    splat[k] = Math.min(240, Math.round(cav * 15) * 16);   // 4-bit cavity AO (16 levels is plenty for AO)
    splat[k + 1] = q6(sedN); splat[k + 2] = q6(flowN); splat[k + 3] = lu;
  }
  const tot = SN * SN; for (const c in counts) counts[c] = +(100 * counts[c] / tot).toFixed(1);
  return { splat, landUse: counts };
}
const nForest = createNoise2D(5151);

/* ----------------------------------------------------------------- encoding */
// Precision: full 3.4 cm steps on coasts, the runway / towns and every protected cell;
// 13.5 cm on open ground above 30 m and 27 cm above 200 m (invisible at 19.5 m spacing,
// and those low bits are pure noise to the compressor). CPU and GPU decode the same q.
function encodeHeight(H, mask) {
  const R = CORE.MAX_H - CORE.MIN_H, q = new Uint16Array(N * N);
  // Far field (> 12 km from the core centre, only ever seen through haze): ease a 5x5 box
  // filter in over 12 -> 16 km on free terrain. Gameplay areas keep every gully.
  {
    const src = Float32Array.from(H);
    for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
      const i = y * N + x;
      const e = Math.max(Math.abs(x * STEP + X0 - CORE.CX), Math.abs(y * STEP + Z0 - CORE.CZ));
      const w = ss(e, 12000, 16000) * (mask[i] > 0.999 || src[i] < -8 ? 1 : 0);
      if (w <= 0) continue;
      let s = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += src[i + dy * N + dx];
      H[i] = src[i] + (s / 25 - src[i]) * w;
    }
  }
  for (let i = 0; i < N * N; i++) {
    let v = Math.max(0, Math.min(65535, Math.round((H[i] - CORE.MIN_H) / R * 65535)));
    const free = mask[i] > 0.999 || H[i] < -8;
    if (free && H[i] > 750) v = Math.min(65504, Math.round(v / 32) * 32);   // 1.08 m on high walls / peaks
    else if (free && H[i] > 600) v = Math.min(65520, Math.round(v / 16) * 16);   // 54 cm on high rock (crag +/-2.5 m dominates)
    else if (free && (H[i] > 200 || H[i] < -40)) v = Math.min(65528, Math.round(v / 8) * 8);
    else if (free && H[i] > 30) v = Math.min(65532, Math.round(v / 4) * 4);
    q[i] = v;
    H[i] = CORE.MIN_H + v / 65535 * R;                     // H now equals exactly what ships
  }
  // 2-D gradient predictor (left + up - up-left, mod 2^16), residual split into byte planes.
  const hi = new Uint8Array(N * N), lo = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const l = x > 0 ? q[i - 1] : (y > 0 ? q[i - N] : 0), u = y > 0 ? q[i - N] : l, ul = x > 0 && y > 0 ? q[i - N - 1] : u;
    let r = (q[i] - (l + u - ul)) & 0xffff;               // residual mod 2^16 ...
    if (r >= 32768) r -= 65536;                            // ... as a signed value
    const dv = ((r << 1) ^ (r >> 31)) & 0xffff;            // zigzag: small |r| -> small code, hi plane ~0
    hi[i] = dv >> 8; lo[i] = dv & 255;
  }
  const raw = Buffer.concat([Buffer.from(hi.buffer), Buffer.from(lo.buffer)]);
  return { q, gz: zlib.gzipSync(raw, { level: 9 }) };
}

/* ---------------------------------------------------------------- PNG writer */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function png(w, h, rgb) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { rows[y * (w * 3 + 1)] = 0; rgb.copy ? rgb.copy(rows, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3) : rows.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function previews(map, H, splat) {
  const P = 1024, s = N / P, hs = new Uint8Array(P * P * 3), bio = new Uint8Array(P * P * 3);
  const at = (x, y) => H[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
  const L = [-0.55, 0.62, -0.56];
  for (let py = 0; py < P; py++) for (let px = 0; px < P; px++) {
    const x = Math.floor(px * s), y = Math.floor(py * s), h = at(x, y);
    const gx = (at(x + 1, y) - at(x - 1, y)) / (2 * STEP), gz = (at(x, y + 1) - at(x, y - 1)) / (2 * STEP);
    const inv = 1 / Math.sqrt(1 + gx * gx + gz * gz), nl = Math.max(0, (-gx * L[0] + 1 * L[1] - gz * L[2]) * inv);
    let c;
    if (h < 0) { const d = Math.min(1, -h / 200); c = [30 + 60 * (1 - d), 70 + 90 * (1 - d), 110 + 80 * (1 - d)]; }
    else if (h < 8) c = [196, 184, 140];
    else if (h < 250) c = [70, 120, 60];
    else if (h < 700) c = [62, 94, 52];
    else if (h < 1150) c = [110, 108, 100];
    else c = [235, 240, 245];
    const k = (py * P + px) * 3, sh = h < 0 ? 1 : 0.35 + 0.9 * nl;
    for (let ch = 0; ch < 3; ch++) hs[k + ch] = Math.max(0, Math.min(255, c[ch] * sh));
    const sk = ((py >> 0) * CORE.SPLAT_N + (px >> 0)) * 4, lu = splat[sk + 3];
    const lc = lu === 0 ? [40, 80, 140] : lu === 64 ? [200, 180, 90] : lu === 128 ? [30, 100, 40] : lu === 192 ? [140, 140, 140] : lu === 255 ? [230, 40, 40] : [120, 160, 90];
    const fl = splat[sk + 2] / 255;
    for (let ch = 0; ch < 3; ch++) bio[k + ch] = Math.max(0, Math.min(255, lc[ch] * (0.55 + 0.45 * nl) * (1 - 0.5 * fl) + (ch === 2 ? 120 * fl * fl : 0)));
  }
  // Runway rectangle outline on the hillshade (clearance check at a glance).
  const toP = (wx, wz) => [Math.round((wx - X0) / CORE.SIZE * P), Math.round((wz - Z0) / CORE.SIZE * P)];
  if (map !== 'strait') {
    const [ax, az] = toP(RWY.x - 25, RWY.z0), [bx, bz] = toP(RWY.x + 25, RWY.z1);
    for (let y = az; y <= bz; y++) for (let x = ax; x <= bx; x++) { const k = (y * P + x) * 3; hs[k] = 255; hs[k + 1] = 0; hs[k + 2] = 255; }
  }
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(PREVIEW_DIR, `preview_${map}.png`), png(P, P, Buffer.from(hs.buffer)));
  fs.writeFileSync(path.join(PREVIEW_DIR, `biome_${map}.png`), png(P, P, Buffer.from(bio.buffer)));
}

/* ---------------------------------------------------------------------- bake */
function bake(map) {
  const t0 = Date.now(), fn = geo.heightFns[map], mapId = MAP_IDS[map], NN = N * N;
  const H = new Float32Array(NN), mask = new Float32Array(NN), urban = new Uint8Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X0 + i * STEP, z = Z0 + j * STEP, k = j * N + i;
    const edge = Math.max(Math.abs(x - CORE.CX), Math.abs(z - CORE.CZ));
    const ak = ss(edge, CORE.APRON0, CORE.APRON1);
    const a = ak < 1 ? fn(x, z) : 0;
    H[k] = a * (1 - ak) + horizonHeight(x, z, mapId) * ak;
    const pr = protectAt(map, x, z);
    mask[k] = pr.m * ss(H[k], 0.8, 7) * (1 - ss(edge, CORE.APRON0 - 1500, CORE.APRON0));
    urban[k] = pr.urban;
  }
  const tSample = Date.now();
  const ero = erode(H, mask, 0x5eed + mapId * 977, map);
  const tErode = Date.now();
  const { q, gz } = encodeHeight(H, mask);                 // quantises H in place first
  const { splat, landUse } = analyse(H, ero.flow, ero.dep, urban);
  // Planar R,G,B,A (each channel's smooth runs stay contiguous for the compressor).
  const SN2 = CORE.SPLAT_N * CORE.SPLAT_N, planar = new Uint8Array(SN2 * 4);
  for (let i = 0; i < SN2; i++) for (let c = 0; c < 4; c++) planar[c * SN2 + i] = splat[i * 4 + c];
  const splatGz = zlib.gzipSync(Buffer.from(planar.buffer), { level: 9 });
  let minH = 1e9, maxH = -1e9, land = 0;
  for (let i = 0; i < NN; i++) { if (H[i] < minH) minH = H[i]; if (H[i] > maxH) maxH = H[i]; if (H[i] > 0) land++; }
  const dir = path.join(OUT_DIR, map);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'height16.bin'), gz);
  fs.writeFileSync(path.join(dir, 'splat.bin'), splatGz);
  const sha = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 16);
  const meta = {
    version: 2, map, mapId,
    core: { size: CORE.SIZE, cx: CORE.CX, cz: CORE.CZ, n: N, step: STEP, minH: CORE.MIN_H, maxH: CORE.MAX_H, splatN: CORE.SPLAT_N, apron: [CORE.APRON0, CORE.APRON1] },
    encoding: { height: 'gzip(zigzag(signed gradient residual q - (left+up-upleft)) uint16 -> hi plane, lo plane)', splat: 'gzip(planar uint8: cavity plane, sediment plane, flow plane, landUse plane) -> RGBA8 1024^2', landUse: { water: 0, scrub: 32, farm: 64, forest: 128, rock: 192, urban: 255 } },
    rwy: map === 'strait' ? null : RWY,
    bridges: map === 'strait' ? [] : geo.BRIDGES,
    dam: map === 'gorge' ? geo.DAM : null,
    straitSites: map === 'strait' ? geo.STRAIT_SITES : null,
    checksums: { height16: sha(Buffer.from(q.buffer)), splat: sha(Buffer.from(splat.buffer)) },
    stats: {
      minH: +minH.toFixed(1), maxH: +maxH.toFixed(1), landPct: +(100 * land / NN).toFixed(1), landUse,
      erosion: ero.stats, bakeMs: { sample: tSample - t0, erode: tErode - tSample, total: Date.now() - t0 },
      bytes: { height16: gz.length, splat: splatGz.length, total: gz.length + splatGz.length }
    }
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  previews(map, H, splat);
  console.log(`[bake] ${map}: h ${meta.stats.minH}..${meta.stats.maxH} m, land ${meta.stats.landPct}%, erosion ${JSON.stringify(ero.stats)}, ` +
    `${(meta.stats.bytes.total / 1048576).toFixed(2)} MB (height ${(gz.length / 1048576).toFixed(2)} + splat ${(splatGz.length / 1048576).toFixed(2)}), ` +
    `${meta.stats.bakeMs.total} ms, sha ${meta.checksums.height16}/${meta.checksums.splat}`);
  console.log(`[bake] ${map}: landUse ${JSON.stringify(landUse)}`);
  return meta;
}

const list = which === 'all' ? ['archipelago', 'gorge', 'strait'] : [which];
for (const m of list) {
  if (!geo.heightFns[m]) { console.error('[bake] unknown map ' + m); process.exit(1); }
  bake(m);
}
console.log('[bake] previews in ' + PREVIEW_DIR);
