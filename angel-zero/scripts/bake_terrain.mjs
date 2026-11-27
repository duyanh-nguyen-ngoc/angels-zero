// ANGELS ZERO — offline Terrain v3 baker (Real-World AWS Terrarium DEM + Node ESM).
//
//   node angel-zero/scripts/bake_terrain.mjs [archipelago|gorge|strait|all] [--preview <dir>]
//
// Stitches open AWS Mapzen Terrarium elevation tiles (1.0x true Earth scale, cached in
// scratch/dem_cache/) for 3 Nordic/Alpine theatres:
//   * archipelago : Lofoten Islands & Vestfjorden, Norway (68.22N, 14.55E)
//   * gorge       : Lysefjord / Aurlandsfjord, Norway (59.03N, 6.42E)
//   * strait      : Alaska Kenai Fjords / Inside Passage (59.85N, 149.65W)
//
// Writes assets/terrain/<map>/:
//   height16.bin   gzip( row-delta Uint16 2048^2, 40 x 40 km core )
//   horizon16.bin  gzip( row-delta Uint16 512^2, 160 x 160 km outer DEM ring )
//   splat.bin      gzip( planar 1024^2 R cavity AO | G sediment | B flow | A landUse )
//   meta.json      core + horizon frame, encoding, anchors, landmarks, checksums, stats

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createNoise2D, fbm } from '../src/noise.js';
import { createGeography, CORE, RWY, MAP_IDS, ss } from '../src/geography.js';
import {
  gorgeCentreX, gorgeDist, GORGE_FLOOR_Y, GORGE_RIM_Y, GORGE_CRATER_Z, GORGE_CRATER_R,
  GORGE_CRATER_WALL_Y, GORGE_RAMP_W, GORGE_HALF_W, GORGE_BBOX,
  GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_ZB, GORGE_SC_HALF_W, GORGE_SC_RAMP_W, GORGE_SC_FLOOR_Y
} from '../src/maps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(ROOT, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'terrain');
const CACHE_DIR = path.join(REPO_ROOT, 'scratch', 'dem_cache');
const args = process.argv.slice(2);
const which = (args.find(a => !a.startsWith('--')) || 'all').toLowerCase();
const pi = args.indexOf('--preview');
const PREVIEW_DIR = pi >= 0 ? args[pi + 1] : path.join(os.tmpdir(), 'az_terrain_preview');
const N = CORE.N, STEP = CORE.STEP, X0 = CORE.X0, Z0 = CORE.Z0;
const HN = 512, HSIZE = 160000, HSTEP = HSIZE / (HN - 1), HX0 = CORE.CX - HSIZE / 2, HZ0 = CORE.CZ - HSIZE / 2;
const geo = createGeography({ createNoise2D, fbm });

const DEM_THEATRES = {
  archipelago: { name: 'Lofoten Islands & Vestfjorden, Norway', lat: 68.22, lon: 14.55, rotDeg: 25, coreZ: 11, hzZ: 8 },
  gorge:       { name: 'Lysefjord & Aurlandsfjord, Norway',     lat: 59.03, lon: 6.42,  rotDeg: -22, coreZ: 11, hzZ: 8 },
  strait:      { name: 'Kenai Fjords & Inside Passage, Alaska', lat: 59.88, lon: -149.48, rotDeg: 8, coreZ: 11, hzZ: 8 }
};

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rectDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

/* ----------------------------------------------------- PNG decoder + Terrarium */
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function decodePng(buf) {
  let off = 8, w = 0, h = 0, ct = 2, idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[dst - stride + i] : 0;
      const c = (i >= bpp && y > 0) ? out[dst - stride + i - bpp] : 0;
      let v = x;
      if (f === 1) v = (x + a) & 255;
      else if (f === 2) v = (x + b) & 255;
      else if (f === 3) v = (x + ((a + b) >> 1)) & 255;
      else if (f === 4) v = (x + paeth(a, b, c)) & 255;
      out[dst + i] = v;
    }
  }
  return { w, h, bpp, data: out };
}

const tileCache = new Map();
async function getTerrariumTile(z, tx, ty) {
  const n = 1 << z;
  const wx = ((tx % n) + n) % n;
  const wy = Math.max(0, Math.min(n - 1, ty));
  const key = `${z}_${wx}_${wy}`;
  if (tileCache.has(key)) return tileCache.get(key);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const fp = path.join(CACHE_DIR, `${key}.png`);
  let buf;
  if (fs.existsSync(fp)) {
    buf = fs.readFileSync(fp);
  } else {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${wx}/${wy}.png`;
    let lastErr;
    for (let att = 0; att < 4; att++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Terrarium ${key}: HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
        break;
      } catch (e) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 250 * (att + 1)));
      }
    }
    if (!buf) throw lastErr;
    fs.writeFileSync(fp, buf);
  }
  const pngImg = decodePng(buf);
  const elev = new Float32Array(pngImg.w * pngImg.h);
  const d = pngImg.data, bpp = pngImg.bpp;
  for (let i = 0, k = 0; i < elev.length; i++, k += bpp) {
    elev[i] = (d[k] * 256 + d[k + 1] + d[k + 2] / 256) - 32768;
  }
  const out = { w: pngImg.w, h: pngImg.h, elev };
  tileCache.set(key, out);
  return out;
}

const EARTH_R = 6378137;
function latLonToMercM(lat, lon) {
  const x = EARTH_R * lon * Math.PI / 180;
  const sin = Math.sin(lat * Math.PI / 180);
  const y = EARTH_R * 0.5 * Math.log((1 + sin) / (1 - sin));
  return [x, y];
}

async function buildDemSampler(cfg, zLevel, halfSpanM) {
  const [mx0, my0] = latLonToMercM(cfg.lat, cfg.lon);
  const rad = cfg.rotDeg * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
  const mercScale = 1 / Math.cos(cfg.lat * Math.PI / 180);   // Mercator metres per true ground metre
  const worldSpanMerc = 2 * Math.PI * EARTH_R;
  const nTiles = 1 << zLevel;
  const toTileFrac = (wx, wz) => {
    const dx = wx - CORE.CX, dz = wz - CORE.CZ;
    const rx = (dx * cs - dz * sn) * mercScale;
    const rz = (dx * sn + dz * cs) * mercScale;
    const mx = mx0 + rx, my = my0 - rz;
    const u = (mx + worldSpanMerc * 0.5) / worldSpanMerc * nTiles;
    const v = (worldSpanMerc * 0.5 - my) / worldSpanMerc * nTiles;
    return [u, v];
  };
  let minTx = 1e9, maxTx = -1e9, minTy = 1e9, maxTy = -1e9;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [u, v] = toTileFrac(CORE.CX + sx * halfSpanM, CORE.CZ + sz * halfSpanM);
    minTx = Math.min(minTx, Math.floor(u)); maxTx = Math.max(maxTx, Math.floor(u));
    minTy = Math.min(minTy, Math.floor(v)); maxTy = Math.max(maxTy, Math.floor(v));
  }
  const coords = [];
  for (let ty = minTy; ty <= maxTy; ty++) for (let tx = minTx; tx <= maxTx; tx++) coords.push([tx, ty]);
  for (let i = 0; i < coords.length; i += 6) {
    await Promise.all(coords.slice(i, i + 6).map(([tx, ty]) => getTerrariumTile(zLevel, tx, ty)));
  }
  return function sampleDem(wx, wz) {
    const [u, v] = toTileFrac(wx, wz);
    const tx = Math.floor(u), ty = Math.floor(v);
    const tile = tileCache.get(`${zLevel}_${((tx % nTiles) + nTiles) % nTiles}_${Math.max(0, Math.min(nTiles - 1, ty))}`);
    if (!tile) return -120;
    const fx = (u - tx) * (tile.w - 1), fy = (v - ty) * (tile.h - 1);
    const ix = Math.max(0, Math.min(tile.w - 2, fx | 0)), iy = Math.max(0, Math.min(tile.h - 2, fy | 0));
    const sx = fx - ix, sy = fy - iy, i = iy * tile.w + ix;
    const a = tile.elev[i], b = tile.elev[i + 1], c = tile.elev[i + tile.w], d = tile.elev[i + tile.w + 1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/* ----------------------------------------------------- gameplay clearance */
function applyClearance(map, x, z, hDem) {
  let h = hDem, protect = 1, urban = 0;
  if (map !== 'strait') {
    // Runway pad (RWY 18/36 at elev = 10 m) feathered smoothly into coastal terrain
    const pad = rectDist(x, z, RWY.x - 300, RWY.x + 470, RWY.z0 - 140, RWY.z1 + 160);
    const kPad = ss(pad, 260, 0);
    h = h * (1 - kPad) + RWY.elev * kPad;
    if (pad < 1) urban = 1;
    protect = Math.min(protect, ss(pad, 250, 650));

    // Approach funnels (600 m to 5 km north & south of thresholds stay under 3 deg glide path)
    for (const [zt, dir] of [[RWY.z0, -1], [RWY.z1, 1]]) {
      const along = (z - zt) * dir;
      if (along >= 300 && along <= 5600) {
        const half = 310 + 0.12 * along;
        const k = ss(Math.abs(x - RWY.x), half + 350, half) * ss(along, 300, 600) * ss(along, 5600, 5050);
        const ceil = RWY.elev + Math.tan(2.6 * Math.PI / 180) * along - 12;
        if (k > 0 && h > ceil) h = h * (1 - k) + ceil * k;
      }
    }
    protect = Math.min(protect, ss(rectDist(x, z, RWY.x - 700, RWY.x + 700, RWY.z0 - 3800, RWY.z1 + 3800), 0, 400));

    // Port City flat pad
    const town = rectDist(x, z, -2050, -450, -1850, 350);
    const kTown = ss(town, 280, 0);
    h = h * (1 - kTown) + 14 * kTown;
    if (town < 1) urban = 1;
    protect = Math.min(protect, ss(town, 150, 500));
  }
  if (map === 'gorge' && geo.inGorgeBox(x, z)) {
    // Blend CANYON_RUN floor, crater, and shortcut smoothly into the real Norwegian granite massif
    const crDX = x - gorgeCentreX(GORGE_CRATER_Z), crDZ = z - GORGE_CRATER_Z, cr = Math.hypot(crDX, crDZ);
    const d = gorgeDist(x, z);
    const corridor = 1 - ss(d, GORGE_HALF_W, GORGE_RAMP_W);
    if (corridor > 0.001) {
      h = h * (1 - corridor) + GORGE_FLOOR_Y * corridor;
    } else if (h < GORGE_RIM_Y * 0.75) {
      // Ensure canyon walls rise cleanly into the surrounding massif
      const wallLift = ss(d, GORGE_HALF_W, GORGE_RAMP_W + 250) * (1 - ss(d, GORGE_RAMP_W + 400, GORGE_RAMP_W + 1400));
      h = Math.max(h, GORGE_RIM_Y * wallLift);
    }
    if (cr < GORGE_CRATER_R * 1.35) {
      const cut = d < GORGE_HALF_W && z > GORGE_CRATER_Z + GORGE_CRATER_R * 0.4;
      const bowl = cut ? 20 : (20 + GORGE_CRATER_WALL_Y * Math.exp(-Math.pow((cr - GORGE_CRATER_R * 0.72) / 190, 2)));
      const ck = ss(cr, GORGE_CRATER_R * 1.35, GORGE_CRATER_R * 0.9);
      h = h * (1 - ck) + bowl * ck;
    }
    if (z < GORGE_SC_ZA + 300 && z > GORGE_SC_ZB - 300) {
      const dS = Math.abs(x - GORGE_SC_X);
      const carved = GORGE_SC_FLOOR_Y + (h - GORGE_SC_FLOOR_Y) * ss(dS, GORGE_SC_HALF_W, GORGE_SC_RAMP_W);
      const fade = ss(z, GORGE_SC_ZB - 300, GORGE_SC_ZB) * ss(z, GORGE_SC_ZA + 300, GORGE_SC_ZA);
      h += (Math.min(h, carved) - h) * fade;
    }
    protect = 0;
  }
  if (map === 'strait') {
    const ax = Math.abs(x);
    if (ax < 5400) {
      const chK = ss(ax, 5400, 4450);
      h = h * (1 - chK) + Math.min(h, -45) * chK;
    }
    for (const s of [...geo.STRAIT_SITES.lighthouses, ...geo.STRAIT_SITES.radars]) {
      protect = Math.min(protect, ss(Math.hypot(x - s[0], z - s[1]), 260, 560));
    }
  }
  return { h, protect, urban };
}

/* ------------------------------------------------ light drainage & analysis */
function traceFlow(H, mask, seed) {
  const NN = N * N, map = new Float32Array(NN), flow = new Float32Array(NN), dep = new Float32Array(NN);
  for (let i = 0; i < NN; i++) map[i] = H[i] / STEP;
  const rand = mulberry32(seed), landMin = 3 / STEP;
  for (let iter = 0; iter < 50000; iter++) {
    let posX = 2 + rand() * (N - 5), posY = 2 + rand() * (N - 5);
    const k0 = (posY | 0) * N + (posX | 0);
    if (map[k0] <= landMin) continue;
    let dirX = 0, dirY = 0, water = 1;
    for (let life = 0; life < 44; life++) {
      const nx = posX | 0, ny = posY | 0, ci = ny * N + nx;
      const gx = map[ci + 1] - map[ci], gy = map[ci + N] - map[ci];
      dirX = dirX * 0.12 - gx * 0.88; dirY = dirY * 0.12 - gy * 0.88;
      const len = Math.hypot(dirX, dirY); if (len < 1e-5) break;
      dirX /= len; dirY /= len; posX += dirX; posY += dirY;
      flow[ci] += water;
      if (posX < 2 || posX >= N - 3 || posY < 2 || posY >= N - 3) break;
      const h1 = map[(posY | 0) * N + (posX | 0)];
      if (h1 < 0) { dep[ci] += 0.4; break; }
      if (len < 0.08) dep[ci] += 0.15;
      water *= 0.97;
    }
  }
  return { flow, dep, stats: { droplets: 50000, changed: 0, meanAbs: 0, maxAbs: 0 } };
}

const nForest = createNoise2D(5151);
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
    const l1 = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) * 0.25 - at(x, y);
    const l4 = (at(x - 4, y) + at(x + 4, y) + at(x, y - 4) + at(x, y + 4)) * 0.25 - at(x, y);
    const l12 = (at(x - 12, y) + at(x + 12, y) + at(x, y - 12) + at(x, y + 12)) * 0.25 - at(x, y);
    const cav = h < -1 ? 0.5 : Math.max(0, Math.min(1, 0.5 - (l1 * 0.6 + l4 * 0.18 + l12 * 0.05) / STEP * 1.6));
    const gx = (at(x + 1, y) - at(x - 1, y)) / (2 * STEP), gz = (at(x, y + 1) - at(x, y - 1)) / (2 * STEP);
    const slope = 1 - 1 / Math.sqrt(1 + gx * gx + gz * gz);
    const f = Math.max(flow[i], flow[i + 1], flow[i + N], flow[i + N + 1]);
    const d = dep[i] + dep[i + 1] + dep[i + N] + dep[i + N + 1];
    const flowN = Math.log(1 + f) / lf, sedN = Math.min(1, Math.sqrt(d / dMax) * 1.5);
    const wx = X0 + x * STEP, wz = Z0 + y * STEP;
    const nz = fbm(nForest, wx * 0.0011, wz * 0.0011, 3);
    let lu;
    if (urbanMask[i]) { lu = 255; counts.urban++; }
    else if (h < 0.6) { lu = 0; counts.water++; }
    else if (slope > 0.38 || h > 950 + 120 * nz) { lu = 192; counts.rock++; }
    else if (h > 4 && h < 160 && slope < 0.08 && flowN < 0.6 && nz < 0.25) { lu = 64; counts.farm++; }
    else if (h > 12 && h < 720 && slope < 0.34 && nz > -0.35) { lu = 128; counts.forest++; }
    else { lu = 32; counts.scrub++; }
    const k = (sy * SN + sx) * 4;
    const q6 = v => Math.min(248, Math.round(v * 31) * 8);
    splat[k] = Math.min(240, Math.round(cav * 15) * 16);
    splat[k + 1] = q6(sedN); splat[k + 2] = q6(flowN); splat[k + 3] = lu;
  }
  const tot = SN * SN; for (const c in counts) counts[c] = +(100 * counts[c] / tot).toFixed(1);
  return { splat, landUse: counts };
}

/* ----------------------------------------------------------------- encoding */
function encodeGrid(H, dim, mask, minH, maxH) {
  const R = maxH - minH, NN = dim * dim, q = new Uint16Array(NN);
  for (let i = 0; i < NN; i++) {
    let v = Math.max(0, Math.min(65535, Math.round((H[i] - minH) / R * 65535)));
    const free = !mask || mask[i] > 0.999 || H[i] < -8;
    if (free && H[i] > 750) v = Math.min(65504, Math.round(v / 32) * 32);
    else if (free && H[i] > 600) v = Math.min(65520, Math.round(v / 16) * 16);
    else if (free && (H[i] > 200 || H[i] < -40)) v = Math.min(65528, Math.round(v / 8) * 8);
    else if (free && H[i] > 30) v = Math.min(65532, Math.round(v / 4) * 4);
    q[i] = v;
    H[i] = minH + v / 65535 * R;
  }
  const hi = new Uint8Array(NN), lo = new Uint8Array(NN);
  for (let y = 0; y < dim; y++) for (let x = 0; x < dim; x++) {
    const i = y * dim + x;
    const l = x > 0 ? q[i - 1] : (y > 0 ? q[i - dim] : 0), u = y > 0 ? q[i - dim] : l, ul = x > 0 && y > 0 ? q[i - dim - 1] : u;
    let r = (q[i] - (l + u - ul)) & 0xffff;
    if (r >= 32768) r -= 65536;
    const dv = ((r << 1) ^ (r >> 31)) & 0xffff;
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
  for (let y = 0; y < h; y++) { rows[y * (w * 3 + 1)] = 0; rows.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
function previews(map, H, splat) {
  const P = 1024, s = N / P, hs = new Uint8Array(P * P * 3);
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
  }
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(PREVIEW_DIR, `dem_preview_${map}.png`), png(P, P, Buffer.from(hs.buffer)));
}

/* ---------------------------------------------------------------------- bake */
async function bake(map) {
  const t0 = Date.now(), cfg = DEM_THEATRES[map], mapId = MAP_IDS[map], NN = N * N;
  const [sampleCore, sampleHz] = await Promise.all([
    buildDemSampler(cfg, cfg.coreZ, CORE.SIZE * 0.52),
    buildDemSampler(cfg, cfg.hzZ, HSIZE * 0.52)
  ]);

  // 1. Sample 160x160 km outer DEM horizon (512^2)
  const HZ = new Float32Array(HN * HN);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const x = HX0 + i * HSTEP, z = HZ0 + j * HSTEP;
    let h = sampleHz(x, z);
    if (h <= 0.4) h = -85 - 55 * (fbm(nForest, x * 0.00015, z * 0.00015, 2) * 0.5 + 0.5);
    if (map === 'strait' && Math.abs(x) < 5200) {
      const chK = ss(Math.abs(x), 5200, 4450);
      h = h * (1 - chK) + Math.min(h, -65) * chK;
    }
    HZ[j * HN + i] = h;
  }
  const { q: hzQ, gz: hzGz } = encodeGrid(HZ, HN, null, CORE.MIN_H, CORE.MAX_H);
  const hzBilin = (wx, wz) => {
    const fx = Math.max(0, Math.min(HN - 1.001, (wx - HX0) / HSTEP));
    const fz = Math.max(0, Math.min(HN - 1.001, (wz - HZ0) / HSTEP));
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * HN + ix;
    return (HZ[i] * (1 - tx) + HZ[i + 1] * tx) * (1 - tz) + (HZ[i + HN] * (1 - tx) + HZ[i + HN + 1] * tx) * tz;
  };

  // 2. Sample 40x40 km core DEM (2048^2) + feathered clearances + horizon apron blend
  const H = new Float32Array(NN), mask = new Float32Array(NN), urban = new Uint8Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X0 + i * STEP, z = Z0 + j * STEP, k = j * N + i;
    const edge = Math.max(Math.abs(x - CORE.CX), Math.abs(z - CORE.CZ));
    const ak = ss(edge, CORE.APRON0, CORE.APRON1);
    let hRaw = sampleCore(x, z);
    if (hRaw <= 0.4) hRaw = -32 - 85 * (fbm(nForest, x * 0.00035, z * 0.00035, 2) * 0.5 + 0.5);
    const cl = applyClearance(map, x, z, hRaw);
    H[k] = cl.h * (1 - ak) + hzBilin(x, z) * ak;
    mask[k] = cl.protect * (1 - ak);
    urban[k] = cl.urban;
  }
  const tSample = Date.now();
  const ero = traceFlow(H, mask, 0x5eed + mapId * 977);
  const tErode = Date.now();
  const { q, gz } = encodeGrid(H, N, mask, CORE.MIN_H, CORE.MAX_H);
  const { splat, landUse } = analyse(H, ero.flow, ero.dep, urban);
  const SN2 = CORE.SPLAT_N * CORE.SPLAT_N, planar = new Uint8Array(SN2 * 4);
  for (let i = 0; i < SN2; i++) for (let c = 0; c < 4; c++) planar[c * SN2 + i] = splat[i * 4 + c];
  const splatGz = zlib.gzipSync(Buffer.from(planar.buffer), { level: 9 });

  let minH = 1e9, maxH = -1e9, land = 0;
  for (let i = 0; i < NN; i++) { if (H[i] < minH) minH = H[i]; if (H[i] > maxH) maxH = H[i]; if (H[i] > 0) land++; }
  const dir = path.join(OUT_DIR, map);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'height16.bin'), gz);
  fs.writeFileSync(path.join(dir, 'horizon16.bin'), hzGz);
  fs.writeFileSync(path.join(dir, 'splat.bin'), splatGz);
  const sha = b => crypto.createHash('sha1').update(b).digest('hex').slice(0, 16);
  const meta = {
    version: 3, map, mapId, dem: cfg,
    core: { size: CORE.SIZE, cx: CORE.CX, cz: CORE.CZ, n: N, step: STEP, minH: CORE.MIN_H, maxH: CORE.MAX_H, splatN: CORE.SPLAT_N, apron: [CORE.APRON0, CORE.APRON1] },
    horizon: { size: HSIZE, cx: CORE.CX, cz: CORE.CZ, n: HN, step: HSTEP, minH: CORE.MIN_H, maxH: CORE.MAX_H },
    encoding: { height: 'gzip(zigzag(signed gradient residual q - (left+up-upleft)) uint16 -> hi plane, lo plane)', splat: 'gzip(planar uint8: cavity plane, sediment plane, flow plane, landUse plane) -> RGBA8 1024^2', landUse: { water: 0, scrub: 32, farm: 64, forest: 128, rock: 192, urban: 255 } },
    rwy: map === 'strait' ? null : RWY,
    bridges: map === 'strait' ? [] : geo.BRIDGES,
    dam: map === 'gorge' ? geo.DAM : null,
    straitSites: map === 'strait' ? geo.STRAIT_SITES : null,
    checksums: { height16: sha(Buffer.from(q.buffer)), horizon16: sha(Buffer.from(hzQ.buffer)), splat: sha(Buffer.from(splat.buffer)) },
    stats: {
      minH: +minH.toFixed(1), maxH: +maxH.toFixed(1), landPct: +(100 * land / NN).toFixed(1), landUse,
      erosion: ero.stats, bakeMs: { sample: tSample - t0, erode: tErode - tSample, total: Date.now() - t0 },
      bytes: { height16: gz.length, horizon16: hzGz.length, splat: splatGz.length, total: gz.length + hzGz.length + splatGz.length }
    }
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  previews(map, H, splat);
  console.log(`[bake v3] ${map} (${cfg.name}): h ${meta.stats.minH}..${meta.stats.maxH} m, land ${meta.stats.landPct}%, ` +
    `${(meta.stats.bytes.total / 1048576).toFixed(2)} MB (core ${(gz.length / 1048576).toFixed(2)} + hz ${(hzGz.length / 1048576).toFixed(2)} + splat ${(splatGz.length / 1048576).toFixed(2)}), ${meta.stats.bakeMs.total} ms`);
  return meta;
}

const list = which === 'all' ? ['archipelago', 'gorge', 'strait'] : [which];
for (const m of list) {
  if (!DEM_THEATRES[m]) { console.error('[bake] unknown map ' + m); process.exit(1); }
  await bake(m);
}
console.log('[bake] previews in ' + PREVIEW_DIR);
