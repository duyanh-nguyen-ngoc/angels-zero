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
  gorgeCentreX, gorgeSlope, gorgeDist, GORGE_X0, GORGE_Z0, GORGE_FLOOR_Y, GORGE_RIM_Y, GORGE_CRATER_Z, GORGE_CRATER_R,
  GORGE_CRATER_WALL_Y, GORGE_RAMP_W, GORGE_HALF_W, GORGE_BBOX,
  GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_ZB, GORGE_SC_HALF_W, GORGE_SC_RAMP_W, GORGE_SC_FLOOR_Y
} from '../src/maps.js';
import { gorgeProbePoints } from '../src/gorgesites.js';

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
  // v3.1 framing (--find-frame): RWY 18/36 on a natural coastal lowland with water approaches,
  // Port City on a N-S shore (deep water west), fjord peaks to the east.
  archipelago: { name: 'Lofoten Islands & Vestfjorden, Norway', lat: 68.34, lon: 14.175, rotDeg: 45, coreZ: 11, hzZ: 8 },
  gorge:       { name: 'Lysefjord & Aurlandsfjord, Norway',     lat: 59.155, lon: 6.16, rotDeg: -45, coreZ: 11, hzZ: 8 },
  strait:      { name: 'Kenai Fjords & Inside Passage, Alaska', lat: 59.7, lon: -149.41, rotDeg: -20, coreZ: 11, hzZ: 8 }
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
// v3.1: no square pads. A tight 10 m plateau sits only under the runway, parallel taxiway,
// apron and hangars; outside it a domain-warped distance grades the DEM organically: over
// water a crisp 35-65 m rock-revetment drop to -8 m, on land a 220-380 m noise-broken feather.
// Port City gets only a ~120 m quay shelf (3.5 m) along the detected bay shoreline with a
// seawall into a dredged -12 m basin; the town steps up the natural slope behind it.
const nAfb = createNoise2D(31337);
const AFB_CORE = [RWY.x - 90, RWY.x + 410, RWY.z0 - 110, RWY.z1 + 130];
const nGorge1 = createNoise2D(7129), nGorge2 = createNoise2D(7151);

function applyClearance(map, x, z, hDem, harbour) {
  let h = hDem, protect = 1, urban = 0;
  if (map !== 'strait') {
    const core = rectDist(x, z, AFB_CORE[0], AFB_CORE[1], AFB_CORE[2], AFB_CORE[3]);
    const dWarp = core + fbm(nAfb, x * 0.004, z * 0.004, 3) * 140 * ss(core, 0, 140);
    if (core < 1) { h = RWY.elev; urban = 1; }
    else if (hDem < 0) {
      const t = ss(dWarp, 35, 65), sea = Math.min(-8, hDem);
      const hs = RWY.elev * (1 - t) + sea * t, k2 = ss(dWarp, 65, 260);
      h = hs * (1 - k2) + hDem * k2;
      if (dWarp < 22) urban = 1;
    } else {
      const feather = 220 + 160 * (fbm(nAfb, x * 0.0021 + 7.3, z * 0.0021, 2) * 0.5 + 0.5);
      const k = 1 - ss(dWarp, 0, feather);
      h = hDem * (1 - k) + RWY.elev * k;
      if (dWarp < 22) urban = 1;
    }
    protect = Math.min(protect, ss(dWarp, 250, 650));

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

    // Port City quay shelf along the real (possibly oblique) bay shoreline, water seaward.
    if (harbour) {
      const t = (x - harbour.a[0]) * (harbour.b[0] - harbour.a[0]) / harbour.len + (z - harbour.a[1]) * (harbour.b[1] - harbour.a[1]) / harbour.len;
      const kz = ss(t, -90, 0) * ss(t, harbour.len + 90, harbour.len);
      if (kz > 0) {
        const sl = (x - harbour.a[0]) * harbour.n[0] + (z - harbour.a[1]) * harbour.n[1];   // + landward of the quay face
        let hq;
        if (sl >= 0 && sl <= 120) hq = 3.5;
        else if (sl > 120) { const k = ss(sl, 120, 240); hq = 3.5 * (1 - k) + h * k; }
        else if (sl > -28) hq = 3.5 + (-12 - 3.5) * ss(sl, 0, -26);
        else { const k = ss(sl, -28, -260); hq = Math.min(h, -12) * (1 - k) + h * k; }
        h = h * (1 - kz) + hq * kz;
        if (sl >= 0 && sl <= 120 && kz > 0.5) urban = 1;
        protect = Math.min(protect, 1 - kz * (1 - ss(Math.abs(sl - 40), 160, 360)));
      }
    }
  }
  if (map === 'gorge') {
    // Open-sea carrier basin south of the canyon mouth (z > GORGE_Z0 + 300 around GORGE_X0)
    if (z > GORGE_Z0 + 300 && z < GORGE_Z0 + 10000 && Math.abs(x - GORGE_X0) < 4200) {
      const seaK = ss(z, GORGE_Z0 + 300, GORGE_Z0 + 1400) * ss(Math.abs(x - GORGE_X0), 4200, 2600);
      h = h * (1 - seaK) + Math.min(h, -48) * seaK;
    }
    if (geo.inGorgeBox(x, z)) {
      // Organic glacial gorge carving: varying width, asymmetric river-bend banks, stepped cliff strata & undulating riverbed
      const gN1 = fbm(nGorge1, x * 0.00055, z * 0.00055, 3);
      const gN2 = fbm(nGorge2, x * 0.0022, z * 0.0022, 2);
      const sl = gorgeSlope(z), sOff = x - gorgeCentreX(z);
      const outerBend = Math.abs(sl) > 0.05 ? Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sign(sl) * Math.sign(sOff))) : 0.5;
      const effHalf = GORGE_HALF_W * Math.max(0.94, 1 + 0.24 * gN1);
      const effRamp = GORGE_RAMP_W * Math.max(0.94, 1 + 0.22 * gN1) * (1 + (1 - outerBend) * 0.28 + 0.10 * gN2);
      const crDX = x - gorgeCentreX(GORGE_CRATER_Z), crDZ = z - GORGE_CRATER_Z, cr = Math.hypot(crDX, crDZ);
      const d = gorgeDist(x, z);
      const corridor = 1 - ss(d, effHalf, effRamp);
      const floorH = 22 + 10 * (0.5 + 0.5 * gN1) + 5 * gN2;
      if (corridor > 0.001) {
        const wallWarp = corridor < 0.95 ? (14 * Math.sin(h * 0.045 + gN1 * 2.0) + 28 * gN2) * (1 - corridor) : 0;
        h = (h + wallWarp) * (1 - corridor) + floorH * corridor;
      } else if (h < GORGE_RIM_Y * 0.78) {
        const wallLift = ss(d, effHalf, effRamp + 260) * (1 - ss(d, effRamp + 420, effRamp + 1500));
        h = Math.max(h, (GORGE_RIM_Y + 24 * gN1 + 18 * gN2) * wallLift);
      }
      if (cr < GORGE_CRATER_R * 1.45) {
        const crWarp = cr * (1 + 0.14 * gN1 + 0.05 * gN2);
        const cut = d < effHalf && z > GORGE_CRATER_Z + GORGE_CRATER_R * 0.38;
        const bowl = cut ? 22 : (22 + GORGE_CRATER_WALL_Y * Math.exp(-Math.pow((crWarp - GORGE_CRATER_R * 0.78) / 240, 2)) + 26 * gN2);
        const ck = ss(cr, GORGE_CRATER_R * 1.45, GORGE_CRATER_R * 0.92);
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
  }
  if (map === 'strait') {
    const ax = Math.abs(x);
    if (ax < 5400) {
      const chK = ss(ax, 5400, 4450);
      h = h * (1 - chK) + Math.min(h, -45) * chK;
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
    const nzHi = fbm(nForest, wx * 0.019 + 3.1, wz * 0.019, 2);      // v3.1: breaks texel-aligned class edges
    let lu;
    if (urbanMask[i]) { lu = 255; counts.urban++; }
    else if (h < 0.6) { lu = 0; counts.water++; }
    else if (slope > 0.38 + 0.03 * nzHi || h > 950 + 120 * nz) { lu = 192; counts.rock++; }
    else if (h > 4 + 2 * nzHi && h < 160 + 40 * nzHi && slope < 0.08 + 0.025 * nzHi && flowN < 0.6 && nz < 0.25 + 0.15 * nzHi) { lu = 64; counts.farm++; }
    else if (h > 12 + 6 * nzHi && h < 720 && slope < 0.34 && nz > -0.35 + 0.2 * nzHi) { lu = 128; counts.forest++; }
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
function previews(map, H, splat, lm) {
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
  // v3.1 landmark markers: runway white, harbour yellow, bridges red, lighthouses white dots,
  // radars magenta, ships orange, rigs black, wind farm cyan, observatory purple.
  if (lm) {
    const px = x => Math.round((x - X0) / STEP / s), pz = z => Math.round((z - Z0) / STEP / s);
    const dot = (x, z, c, r = 4) => { const cx = px(x), cz = pz(z); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r) continue; const X = cx + dx, Y = cz + dy; if (X < 0 || Y < 0 || X >= P || Y >= P) continue; const k = (Y * P + X) * 3; hs[k] = c[0]; hs[k + 1] = c[1]; hs[k + 2] = c[2]; } };
    const line = (a, b, c, r = 2) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t <= L; t += STEP * s * 0.5) dot(a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L, c, r); };
    if (map !== 'strait') line([RWY.x, RWY.z0], [RWY.x, RWY.z1], [255, 255, 255], 2);
    if (lm.harbour) line(lm.harbour.a, lm.harbour.b, [255, 220, 0], 2);
    for (const b of lm.bridges) line(b.a, b.b, [230, 30, 30], 2);
    if (lm.windFarm) line(lm.windFarm.a, lm.windFarm.b, [0, 230, 255], 2);
    for (const p of lm.lighthouses) dot(p[0], p[1], [255, 255, 255], 5);
    for (const p of lm.radars) dot(p[0], p[1], [255, 0, 220], 5);
    for (const p of lm.ships) dot(p[0], p[1], [255, 140, 0], 5);
    for (const p of lm.oilRigs) dot(p[0], p[1], [0, 0, 0], 5);
    if (lm.observatory) dot(lm.observatory[0], lm.observatory[1], [150, 60, 255], 6);
  }
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(PREVIEW_DIR, `dem_preview_${map}.png`), png(P, P, Buffer.from(hs.buffer)));
}

/* --------------------------------------------- DEM landmark detection (v3.1) */
// Harbour shoreline from the raw DEM (before grading): rows z in [-1800, 600], scanning
// x in [-3600, -900] for deep water (< -10 m) meeting land (> 2 m) within 200 m. The quay
// runs N-S along the median shoreline over the longest contiguous run of agreeing rows.
function detectHarbourRaw(map, dem) {
  if (map === 'strait') return null;
  const rows = [];
  for (let z = -1800; z <= 600; z += 50) {
    let lastDeep = -1e9, xs = null;
    for (let x = -3600; x <= -900; x += 20) {
      const h = dem(x, z);
      if (h < -10) lastDeep = x;
      else if (h > 2 && x - lastDeep <= 200) { xs = x; break; }
    }
    rows.push([z, xs]);
  }
  if (process.env.AZ_DEBUG) console.log('[harbour]', map, JSON.stringify(rows.map(r => r[1])));
  // Longest run of consecutive rows (>= 500 m) whose linear fit x = A + B z stays within 60 m.
  let best = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1] === null) continue;
    for (let j = i + 10; j < rows.length && rows[j][1] !== null; j++) {
      const seg = rows.slice(i, j + 1);
      if (seg.some(r => r[1] === null)) break;
      const n = seg.length, mz = seg.reduce((a, r) => a + r[0], 0) / n, mx = seg.reduce((a, r) => a + r[1], 0) / n;
      let sxz = 0, szz = 0; for (const [z, x] of seg) { sxz += (z - mz) * (x - mx); szz += (z - mz) ** 2; }
      const B = sxz / szz, A = mx - B * mz;
      if (Math.abs(B) > 1.2 || seg.some(([z, x]) => Math.abs(A + B * z - x) > 60)) break;
      if (!best || n > best.n) best = { n, A, B, z0: seg[0][0], z1: seg[n - 1][0] };
    }
  }
  if (!best) return null;
  const a = [best.A + best.B * best.z0, best.z0], b = [best.A + best.B * best.z1, best.z1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
  const n = [dz, -dx];                                      // landward normal (water lies to the west)
  if (map === 'gorge' && (geo.inGorgeBox(a[0], a[1]) || geo.inGorgeBox(b[0], b[1]))) return null;   // canyon owns that ground
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], yaw = Math.atan2(dx, dz);
  const bw = (p, s) => [Math.round(p[0] - n[0] * 210 + dx * 60 * s), Math.round(p[1] - n[1] * 210 + dz * 60 * s), +(yaw + Math.PI / 2).toFixed(3), 380];
  return { a: a.map(Math.round), b: b.map(Math.round), n: [+n[0].toFixed(4), +n[1].toFixed(4)], len: Math.round(L), yaw: +yaw.toFixed(4),
    quayX: Math.round(mid[0]), quayZ0: Math.round(a[1]), quayZ1: Math.round(b[1]), waterSide: -1,
    breakwaters: [bw(a, -1), bw(b, 1)] };
}

// Landmarks from the final baked grid, written to meta.json (world.js / clutter.js consume them).
function detectLandmarks(map, H, harbour) {
  const hAt = (x, z) => {
    const fx = Math.max(0, Math.min(N - 1.001, (x - X0) / STEP)), fz = Math.max(0, Math.min(N - 1.001, (z - Z0) / STEP));
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, i = iz * N + ix;
    return (H[i] * (1 - tx) + H[i + 1] * tx) * (1 - tz) + (H[i + N] * (1 - tx) + H[i + N + 1] * tx) * tz;
  };
  const inCore = (x, z, m = 1500) => Math.abs(x - CORE.CX) < CORE.SIZE / 2 - m && Math.abs(z - CORE.CZ) < CORE.SIZE / 2 - m;
  const appr = (x, z, m = 0) => map !== 'strait' && Math.abs(x - RWY.x) < 700 + m && z > RWY.z0 - 5600 - m && z < RWY.z1 + 5600 + m;
  const gorgeBox = (x, z, m = 600) => map === 'gorge' && x > GORGE_BBOX.x[0] - m && x < GORGE_BBOX.x[1] + m && z < GORGE_BBOX.z[0] + m && z > GORGE_BBOX.z[1] - m;
  const nearBase = (x, z, r) => map !== 'strait' && (Math.hypot(x - (RWY.x + 160), z - (RWY.z0 + RWY.z1) / 2) < r || (harbour && Math.hypot(x - (harbour.a[0] + harbour.b[0]) / 2, z - (harbour.a[1] + harbour.b[1]) / 2) < r * 0.8));
  const clear = (x, z, m) => inCore(x, z) && !appr(x, z, m) && !gorgeBox(x, z);
  const landWithin = (x, z, R, step = 200, dirs = 12) => {
    for (let r = step; r <= R; r += step) for (let a = 0; a < dirs; a++) { const t = a / dirs * Math.PI * 2; if (hAt(x + Math.cos(t) * r, z + Math.sin(t) * r) > 0) return true; }
    return false;
  };
  const spaced = (list, x, z, d) => list.every(p => Math.hypot(p[0] - x, p[1] - z) >= d);
  const out = { bridges: [], harbour: null, ships: [], windFarm: null, oilRigs: [], lighthouses: [], radars: [], observatory: null };

  // bridges: real water narrows 600-2200 m, middle 70 % deep water, both abutments on land 15-110 m
  if (map !== 'strait') {
    const cand = [];
    for (let ax = -16000; ax <= 16000; ax += 400) for (let az = CORE.CZ - 16000; az <= CORE.CZ + 16000; az += 400) {
      const ha = hAt(ax, az);
      if (ha < 15 || ha > 110 || !clear(ax, az, 400) || nearBase(ax, az, 2500)) continue;
      for (let d = 0; d < 16; d++) {
        const t = d / 16 * Math.PI, dx = Math.cos(t), dz = Math.sin(t);
        for (let L = 600; L <= 2200; L += 100) {
          const bx = ax + dx * L, bz = az + dz * L, hb = hAt(bx, bz);
          if (hb < 15 || hb > 110 || !clear(bx, bz, 400) || nearBase(bx, bz, 2500)) continue;
          let ok = true;
          for (let k = 0.15; k <= 0.851 && ok; k += 40 / L) if (hAt(ax + dx * L * k, az + dz * L * k) >= -10) ok = false;
          if (!ok) continue;
          let m = true;                                                 // the deck line must not clip appr / gorge
          for (let k = 0; k <= 1 && m; k += 0.1) if (!clear(ax + dx * L * k, az + dz * L * k, 300)) m = false;
          if (m) cand.push({ a: [ax, az], b: [bx, bz], L, sc: -Math.abs(L - 1250) });
          break;                                                        // shortest valid span per direction
        }
      }
    }
    cand.sort((p, q) => q.sc - p.sc);
    for (const c of cand) {
      if (out.bridges.length >= 2) break;
      const mx = (c.a[0] + c.b[0]) / 2, mz = (c.a[1] + c.b[1]) / 2;
      if (out.bridges.every(b => Math.hypot((b.a[0] + b.b[0]) / 2 - mx, (b.a[1] + b.b[1]) / 2 - mz) > 4000)) out.bridges.push({ a: c.a.map(Math.round), b: c.b.map(Math.round) });
    }
  }
  // harbour: keep only if the graded quay still separates land from deep water
  if (harbour) {
    const mx = (harbour.a[0] + harbour.b[0]) / 2, mz = (harbour.a[1] + harbour.b[1]) / 2;
    if (hAt(mx - harbour.n[0] * 60, mz - harbour.n[1] * 60) < -6 && hAt(mx + harbour.n[0] * 60, mz + harbour.n[1] * 60) > 2) out.harbour = harbour;
  }
  // ships: open deep water, >= 800 m from shore, aligned with the longest open fetch
  {
    const c = [];
    for (let x = -16500; x <= 16500; x += 600) for (let z = CORE.CZ - 16500; z <= CORE.CZ + 16500; z += 600) {
      if (hAt(x, z) > -25 || !clear(x, z, 600)) continue;
      let deep = true; for (let a = 0; a < 8 && deep; a++) { const t = a * Math.PI / 4; if (hAt(x + Math.cos(t) * 400, z + Math.sin(t) * 400) > -25) deep = false; }
      if (!deep || landWithin(x, z, 800)) continue;
      let bestT = 0, bestR = 0;
      for (let a = 0; a < 8; a++) { const t = a * Math.PI / 8; let r = 0; while (r < 3000 && hAt(x + Math.cos(t) * r, z + Math.sin(t) * r) < -5 && hAt(x - Math.cos(t) * r, z - Math.sin(t) * r) < -5) r += 150; if (r > bestR) { bestR = r; bestT = t; } }
      const dAct = map === 'strait' ? Math.abs(x) * 2 : Math.hypot(x - RWY.x, z);   // stay near the action
      c.push([x, z, Math.atan2(Math.cos(bestT), Math.sin(bestT)), Math.min(bestR, 3000) / 3000 - dAct / 14000]);
    }
    c.sort((p, q) => q[3] - p[3]);
    for (const p of c) { if (out.ships.length >= 4) break; if (spaced(out.ships, p[0], p[1], 3000)) out.ships.push([p[0], p[1], +p[2].toFixed(3), out.ships.length % 2 ? 'tanker' : 'cargo']); }
  }
  // wind farm (archipelago): 9 turbines 260 m apart on a shallow-to-mid bank, >= 500 m from land
  if (map === 'archipelago') {
    let best = null;
    for (let x = -15000; x <= 15000; x += 500) for (let z = CORE.CZ - 15000; z <= CORE.CZ + 15000; z += 500) {
      if (!clear(x, z, 800)) continue;
      for (let d = 0; d < 8; d++) {
        const t = d * Math.PI / 8, dx = Math.cos(t) * 260, dz = Math.sin(t) * 260;
        let ok = true, shallow = 0;
        for (let k = 0; k < 9 && ok; k++) {
          const px = x + dx * k, pz = z + dz * k, h = hAt(px, pz);
          if (h > -8 || !clear(px, pz, 800) || landWithin(px, pz, 500, 250, 8)) ok = false;
          else if (h > -45) shallow++;
        }
        if (ok && (!best || shallow > best.sc)) best = { a: [x, z], b: [Math.round(x + dx * 8), Math.round(z + dz * 8)], n: 9, sc: shallow };
      }
    }
    if (best) out.windFarm = { a: best.a, b: best.b, n: 9 };
  }
  // oil rigs (archipelago / strait): deep open water, >= 1200 m from any land
  if (map !== 'gorge') {
    const wf = out.windFarm;
    const rc = [];
    for (let x = -16000; x <= 16000; x += 700) for (let z = CORE.CZ - 16000; z <= CORE.CZ + 16000; z += 700) {
      if (hAt(x, z) > -35 || !clear(x, z, 900) || (map === 'strait' && Math.abs(x) < 4800)) continue;
      rc.push([x, z, map === 'strait' ? Math.abs(Math.abs(x) - 6000) : Math.abs(Math.hypot(x - RWY.x, z) - 9000)]);
    }
    rc.sort((p, q) => p[2] - q[2]);
    for (const [x, z] of rc) {
      if (out.oilRigs.length >= 3) break;
      let deep = true; for (let a = 0; a < 8 && deep; a++) { const t = a * Math.PI / 4; if (hAt(x + Math.cos(t) * 500, z + Math.sin(t) * 500) > -35) deep = false; }
      if (!deep || landWithin(x, z, 1200, 300, 12)) continue;
      if (!spaced(out.oilRigs, x, z, 4000) || !spaced(out.ships, x, z, 1500)) continue;
      if (wf && Math.hypot((wf.a[0] + wf.b[0]) / 2 - x, (wf.a[1] + wf.b[1]) / 2 - z) < 2500) continue;
      out.oilRigs.push([x, z, +(((x * 0.0013 + z * 0.0007) % 6.283)).toFixed(3)]);
    }
  }
  // lighthouses: real headlands (12-95 m, gentle top, >= 3 of 8 probes at 250 m in water)
  {
    const c = [];
    for (let x = -17000; x <= 17000; x += 150) for (let z = CORE.CZ - 17000; z <= CORE.CZ + 17000; z += 150) {
      const h = hAt(x, z);
      if (h < 12 || h > 95 || !clear(x, z, 300) || nearBase(x, z, 1500)) continue;
      const gx = (hAt(x + 20, z) - hAt(x - 20, z)) / 40, gz = (hAt(x, z + 20) - hAt(x, z - 20)) / 40;
      if (1 - 1 / Math.sqrt(1 + gx * gx + gz * gz) > 0.35) continue;
      let w = 0; for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; if (hAt(x + Math.cos(t) * 250, z + Math.sin(t) * 250) < -5) w++; }
      if (w >= 3) c.push([x, z, w * 100 - h]);
    }
    c.sort((p, q) => q[2] - p[2]);
    for (const p of c) { if (out.lighthouses.length >= 5) break; if (spaced(out.lighthouses, p[0], p[1], 3500)) out.lighthouses.push([p[0], p[1]]); }
  }
  // radars: prominent flat-topped summits 220-950 m, >= 5 km apart
  {
    const c = [];
    for (let x = -17000; x <= 17000; x += 300) for (let z = CORE.CZ - 17000; z <= CORE.CZ + 17000; z += 300) {
      const h = hAt(x, z);
      if (h < 220 || h > (map === 'strait' ? 1500 : 950) || !clear(x, z, 500) || nearBase(x, z, 2000)) continue;
      let top = true, lo = h, hi = h;
      for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; if (hAt(x + Math.cos(t) * 300, z + Math.sin(t) * 300) > h) top = false; const y = hAt(x + Math.cos(t) * 40, z + Math.sin(t) * 40); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (top && hi - lo < (map === 'strait' ? 22 : 14)) c.push([x, z, h]);
    }
    c.sort((p, q) => q[2] - p[2]);
    for (const p of c) { if (out.radars.length >= 3) break; if (spaced(out.radars, p[0], p[1], 5000)) out.radars.push([p[0], p[1]]); }
  }
  // observatory (archipelago): a dramatic ridge peak 350-850 m within 3-8 km of the AFB / Port City
  if (map === 'archipelago') {
    let best = null;
    for (let x = -9000; x <= 11000; x += 200) for (let z = -9000; z <= 8000; z += 200) {
      const h = hAt(x, z), d = Math.hypot(x - RWY.x, z);
      if (h < 350 || h > 850 || d < 3000 || d > 8000 || !clear(x, z, 300)) continue;
      if (out.radars.some(r => Math.hypot(r[0] - x, r[1] - z) < 1500)) continue;
      let top = true; for (let a = 0; a < 8 && top; a++) { const t = a * Math.PI / 4; if (hAt(x + Math.cos(t) * 200, z + Math.sin(t) * 200) > h) top = false; }
      if (top && (!best || h > best[2])) best = [x, z, h];
    }
    if (best) out.observatory = [best[0], best[1]];
  }
  // Ground stats under each built footprint ([x, z, yMin, yMax]) so world.js can place every
  // theatre's landmarks at boot (only the archipelago pack is loaded then) with zero float.
  const fp = (x, z, r) => { let lo = hAt(x, z), hi = lo; for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4, y = hAt(x + Math.cos(t) * r, z + Math.sin(t) * r); lo = Math.min(lo, y); hi = Math.max(hi, y); } return [+lo.toFixed(2), +hi.toFixed(2)]; };
  out.lighthouses = out.lighthouses.map(([x, z]) => [x, z, ...fp(x, z, 10)]);
  out.radars = out.radars.map(([x, z]) => [x, z, ...fp(x, z, 22)]);
  if (out.observatory) out.observatory = [...out.observatory, ...fp(out.observatory[0], out.observatory[1], 34)];
  out.bridges = out.bridges.map(b => ({ ...b, ha: +hAt(b.a[0], b.a[1]).toFixed(2), hb: +hAt(b.b[0], b.b[1]).toFixed(2) }));
  if (map === 'gorge') out.gorgeProbe = gorgeProbePoints().map(([x, z]) => +hAt(x, z).toFixed(2));
  return out;
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

  // 2. Sample 40x40 km core DEM (2048^2) + organic clearances + horizon apron blend
  const demAt = (x, z) => { const h = sampleCore(x, z); return h <= 0.4 ? -32 - 85 * (fbm(nForest, x * 0.00035, z * 0.00035, 2) * 0.5 + 0.5) : h; };
  const harbourRaw = detectHarbourRaw(map, demAt);
  const H = new Float32Array(NN), mask = new Float32Array(NN), urban = new Uint8Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = X0 + i * STEP, z = Z0 + j * STEP, k = j * N + i;
    const edge = Math.max(Math.abs(x - CORE.CX), Math.abs(z - CORE.CZ));
    const ak = ss(edge, CORE.APRON0, CORE.APRON1);
    const hRaw = demAt(x, z);
    const cl = applyClearance(map, x, z, hRaw, harbourRaw);
    H[k] = cl.h * (1 - ak) + hzBilin(x, z) * ak;
    mask[k] = cl.protect * (1 - ak);
    urban[k] = cl.urban;
  }
  const tSample = Date.now();
  const ero = traceFlow(H, mask, 0x5eed + mapId * 977);
  const tErode = Date.now();
  const { q, gz } = encodeGrid(H, N, mask, CORE.MIN_H, CORE.MAX_H);
  const { splat, landUse } = analyse(H, ero.flow, ero.dep, urban);
  const landmarks = detectLandmarks(map, H, harbourRaw);
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
    landmarks,
    bridges: landmarks.bridges,
    dam: map === 'gorge' ? geo.DAM : null,
    checksums: { height16: sha(Buffer.from(q.buffer)), horizon16: sha(Buffer.from(hzQ.buffer)), splat: sha(Buffer.from(splat.buffer)) },
    stats: {
      minH: +minH.toFixed(1), maxH: +maxH.toFixed(1), landPct: +(100 * land / NN).toFixed(1), landUse,
      erosion: ero.stats, bakeMs: { sample: tSample - t0, erode: tErode - tSample, total: Date.now() - t0 },
      bytes: { height16: gz.length, horizon16: hzGz.length, splat: splatGz.length, total: gz.length + hzGz.length + splatGz.length }
    }
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  previews(map, H, splat, landmarks);
  console.log(`[bake v3] ${map} (${cfg.name}): h ${meta.stats.minH}..${meta.stats.maxH} m, land ${meta.stats.landPct}%, ` +
    `${(meta.stats.bytes.total / 1048576).toFixed(2)} MB (core ${(gz.length / 1048576).toFixed(2)} + hz ${(hzGz.length / 1048576).toFixed(2)} + splat ${(splatGz.length / 1048576).toFixed(2)}), ${meta.stats.bakeMs.total} ms`);
  return meta;
}

/* ------------------------------------------------- DEM framing search (v3.1) */
// node angel-zero/scripts/bake_terrain.mjs <map|all> --find-frame
// Scores (lat, lon, rotDeg) candidates at z10 so the fixed RWY 18/36 strip lands on a natural
// coastal lowland with water approaches, Port City sits on a N-S shore with deep water to the
// west, mountains rise to the east, and the land / water mix fits the theatre.
const FRAME_SEARCH = {
  archipelago: { lat: [68.0, 68.4, 0.02], lon: [14.0, 15.0, 0.035], rot: [-45, 45, 15] },
  gorge:       { lat: [58.9, 59.2, 0.015], lon: [6.1, 6.7, 0.03], rot: [-45, 45, 15] },
  strait:      { lat: [59.7, 60.1, 0.02], lon: [-149.8, -149.2, 0.03], rot: [-30, 30, 10] }
};
function scoreFrame(map, S) {
  const frac = (pts, f) => { let k = 0; for (const [x, z] of pts) if (f(S(x, z))) k++; return k / pts.length; };
  const grid = (xs, zs) => { const o = []; for (const x of xs) for (const z of zs) o.push([x, z]); return o; };
  const rng = (a, b, st) => { const o = []; for (let v = a; v <= b + 1e-6; v += st) o.push(v); return o; };
  let land = 0, peak = -1e9, n = 0;
  for (let x = -19000; x <= 19000; x += 2400) for (let z = -21500; z <= 16500; z += 2400) { const h = S(x, z); if (h > 0) land++; if (h > peak) peak = h; n++; }
  const landFrac = land / n;
  if (map === 'strait') {
    const chan = frac(grid(rng(-3500, 3500, 700), rng(-20000, 15000, 2500)), h => h < 0);
    let cl = 0, cn = 0; for (const x of [-8000, -6500, -5000, 5000, 6500, 8000]) for (const z of rng(-18000, 14000, 2000)) { cl += Math.max(0, Math.min(S(x, z), 1200)); cn++; }
    return chan * 4 + Math.min(cl / cn / 350, 2) + Math.min(peak / 1000, 1.2);
  }
  const rw = grid([800, 900, 1000, 1200], rng(-1800, 1800, 300)).map(([x, z]) => S(x, z));
  const mean = rw.reduce((a, b) => a + b, 0) / rw.length, sd = Math.sqrt(rw.reduce((a, b) => a + (b - mean) ** 2, 0) / rw.length);
  const rwLand = rw.filter(h => h > 1).length / rw.length;
  const appr = frac(grid([600, 900, 1200], [...rng(-5000, -1900, 400), ...rng(1900, 5000, 400)]), h => h < 40);
  let east = 0, en = 0; for (const x of rng(2500, 7000, 900)) for (const z of rng(-4000, 4000, 1600)) { east += Math.max(0, S(x, z)); en++; }
  let sc = rwLand * 3 - Math.max(0, mean - 45, 2 - mean) / 20 - sd / 15 + appr * 2 + Math.min(east / en / 400, 1.5) + Math.min(peak / 1000, 1.2);
  if (map === 'archipelago') {
    const portW = frac(grid([-2500, -2200, -1950], rng(-1600, 200, 300)), h => h < -15);
    const portE = frac(grid([-1550, -1200, -850, -550], rng(-1600, 200, 300)), h => h >= 4 && h <= 80);
    sc += portW * 2 + portE * 2 - Math.max(0, 0.25 - landFrac, landFrac - 0.55) * 8;
  } else {
    sc -= Math.max(0, 0.35 - landFrac, landFrac - 0.8) * 6;
  }
  return sc;
}
async function findFrame(map) {
  const R = FRAME_SEARCH[map], Z = 10, cfg0 = DEM_THEATRES[map];
  const cands = [];
  for (let lat = R.lat[0]; lat <= R.lat[1] + 1e-9; lat += R.lat[2])
    for (let lon = R.lon[0]; lon <= R.lon[1] + 1e-9; lon += R.lon[2])
      for (let rot = R.rot[0]; rot <= R.rot[1]; rot += R.rot[2]) cands.push({ ...cfg0, lat: +lat.toFixed(4), lon: +lon.toFixed(4), rotDeg: rot });
  const t0 = Date.now(); let best = [];
  for (let i = 0; i < cands.length; i++) {
    const S = await buildDemSampler(cands[i], Z, 22000);
    const sc = scoreFrame(map, (x, z) => S(x, z));
    best.push([sc, cands[i]]);
    if (i % 500 === 0) process.stdout.write(`\r[frame] ${map} ${i}/${cands.length} tiles=${tileCache.size}   `);
  }
  best.sort((a, b) => b[0] - a[0]);
  console.log(`\n[frame] ${map}: ${cands.length} candidates in ${Date.now() - t0} ms; top 5:`);
  for (const [sc, c] of best.slice(0, 5)) console.log(`   score ${sc.toFixed(3)}  lat ${c.lat}  lon ${c.lon}  rot ${c.rotDeg}`);
  return best[0];
}
if (args.includes('--find-frame')) {
  for (const m of which === 'all' ? ['archipelago', 'gorge', 'strait'] : [which]) await findFrame(m);
  process.exit(0);
}

const list = which === 'all' ? ['archipelago', 'gorge', 'strait'] : [which];
for (const m of list) {
  if (!DEM_THEATRES[m]) { console.error('[bake] unknown map ' + m); process.exit(1); }
  await bake(m);
}
console.log('[bake] previews in ' + PREVIEW_DIR);
