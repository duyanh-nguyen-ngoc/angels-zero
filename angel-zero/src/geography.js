// ANGELS ZERO — Terrain v2 geography: the single analytic source of every theatre.
//
// Shared by the offline baker (scripts/bake_terrain.mjs, Node) and the browser runtime
// (prop placement, horizon, crag). Pure JS — no THREE / DOM. The baker samples these
// functions over the 40 x 40 km core (2048^2), erodes the result and writes
// assets/terrain/<map>/; the runtime reads the baked heightfield for heightAt() and the
// clipmap, and only falls back to these analytic functions for:
//   * horizonHeight()  — outside the 40 km core (out to the 131 km clipmap horizon),
//                        mirrored 1:1 in GLSL (clipmap.js HORIZON_GLSL);
//   * cragOffset()     — the close-range +/-2.5 m rock displacement (GLSL twin too);
//   * prop placement   — strait / gorge props sit on erosion-protected sites, so the
//                        analytic and baked heights agree there.
//
// Gameplay anchors are deliberately unchanged from v1.x: RWY 18/36, the AFB pad and
// approach funnels, the four bridge spits, Port City, the CANYON_RUN centreline / rim /
// crater / shortcut (maps.js), the strait's open channel (|x| < 4,450 m) and the carrier
// lanes. The new land is built around them:
//   ARCHIPELAGO  + a northern / eastern MAINLAND: coastal plain and farmland, forested
//                foothills, fjord inlets and a 1,400-1,800 m snow-capped alpine range that
//                continues into the horizon.
//   GORGE        + an alpine massif rising from ~1.5 km off the canyon centreline to
//                ~1,600 m (the canyon becomes a deep glacial cut) and a dammed side valley
//                feeding the crater basin (the hydroelectric dam landmark).
//   STRAIT       fjord walls raised to ~1,100-1,550 m, continuous out to the horizon.

import {
  gorgeCentreX, gorgeDist, GORGE_FLOOR_Y, GORGE_RIM_Y, GORGE_CRATER_R, GORGE_CRATER_WALL_Y, GORGE_CRATER_Z,
  GORGE_BBOX, GORGE_HALF_W, GORGE_RAMP_W, RUNWAY_BBOX,
  GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_ZB, GORGE_SC_HALF_W, GORGE_SC_RAMP_W, GORGE_SC_FLOOR_Y
} from './maps.js?v=s9dz';

// Legacy 20 km gameplay box (HUD topo, ocean depth texture, sectors) and the new baked core.
export const WORLD = { SIZE: 20000, CX: 0, CZ: -2500, SEG: 440 };
export const CORE = { SIZE: 40000, CX: 0, CZ: -2500, N: 2048, MIN_H: -260, MAX_H: 1950, SPLAT_N: 1024 };
CORE.X0 = CORE.CX - CORE.SIZE / 2; CORE.Z0 = CORE.CZ - CORE.SIZE / 2;
CORE.STEP = CORE.SIZE / (CORE.N - 1);                    // 19.5408 m between height samples (corner-aligned)
CORE.APRON0 = 17000; CORE.APRON1 = 19800;                // baked core cross-fades into horizonHeight
export const RWY = { x: 900, z0: -1400, z1: 1600, width: 50, elev: 10 };       // runway 18/36, 3,000 m
export const MAP_IDS = { archipelago: 0, gorge: 1, strait: 2 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Smoothstep that also works with reversed edges (a > b): 1 at a .. 0 at b.
export const ss = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));

/* ------------------------------------------------------------------ horizon */
// Smooth, sine-built continental relief: cheap, exactly mirrored in GLSL, used outside
// the baked core and blended into the core's outer apron by the baker.
export function horizonRidge(x, z) {
  return 0.5 + 0.5 * Math.sin(x * 0.00041 + Math.sin(z * 0.00023) * 2.1) * Math.cos(z * 0.00037 - Math.sin(x * 0.00019) * 1.7);
}
// Same macro profile as the baked mainland (coastal plain -> foothills -> alpine range).
function alpineProfile(inland, ridge) {
  if (inland < 0) return -180 + 177.5 * ss(inland, -1400, 0);
  return 3 + 38 * ss(inland, 30, 1200) + 170 * ss(inland, 900, 3200)
    + 1300 * Math.pow(ss(inland, 2200, 5600), 1.1) * (0.55 + 0.45 * ridge);
}
// Ridged sine relief for the ring beyond the baked core only: exactly 0 at the core edge, so
// the baked seam and the baker's apron blend (always inside the core) are unchanged.
// GLSL twin: horizonDetail() in clipmap.js.
export function horizonDetail(x, z, inland) {
  const e = Math.max(Math.abs(x - CORE.CX), Math.abs(z - CORE.CZ)) - CORE.SIZE / 2;
  const k = ss(e, 0, 3000) * ss(inland, 1800, 5200);
  if (k <= 0) return 0;
  const r1 = 1 - Math.abs(Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 1.9) * Math.sin(z * 0.0019 + Math.sin(x * 0.0011) * 2.3));
  const r2 = 1 - Math.abs(Math.sin(x * 0.0053 + Math.sin(z * 0.0037) * 1.4) * Math.sin(z * 0.0047 - Math.sin(x * 0.0029) * 1.7));
  return k * (260 * r1 * r1 + 90 * r2 * r2 - 150);
}
export function horizonHeight(x, z, mapId) {
  const r = horizonRidge(x, z);
  const inland = mapId === 2 ? Math.abs(x) - 5600 : smax(-12900 - z, x - 11900, 1500);
  return alpineProfile(inland, r) + horizonDetail(x, z, inland);
}
// Close-range rock displacement (m, before the slope / protect gate): +/-1.
export function cragNoise(x, z) {
  return Math.sin(x * 0.173 + Math.sin(z * 0.061) * 2.3) * Math.sin(z * 0.157 + Math.sin(x * 0.047) * 1.9);
}
export const CRAG_AMP = 2.5;
// slope = 1 - normal.y; protect 0..1 (landUse protected class).
export const cragGate = (slope, protect) => ss(slope, 0.35, 0.6) * (1 - protect);

/* --------------------------------------------------------------- geography */
export function createGeography({ createNoise2D, fbm }) {
  const nCoast = createNoise2D(4242), nHill = createNoise2D(991), nDet = createNoise2D(7);
  const nRidge = createNoise2D(1337), nSea = createNoise2D(2718);

  // Shelf just outside a coast (d = 1): turquoise sandbar falling to deep water.
  const shelf = d => -2.5 - 20 * ss(d, 1.0, 1.2) - 150 * ss(d, 1.2, 1.65);
  const warpX = (x, z, seed) => 520 * fbm(nCoast, x * 0.00021 + seed, z * 0.00021, 3);
  const warpZ = (x, z, seed) => 520 * fbm(nCoast, x * 0.00021 - 17.3, z * 0.00021 + seed, 3);
  function ellipseD(x, z, cx, cz, rx, rz, rot, wob, seed) {
    const qx = x + warpX(x, z, seed), qz = z + warpZ(x, z, seed);
    const dx = qx - cx, dz = qz - cz, c = Math.cos(rot), s = Math.sin(rot);
    const u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
    const d = Math.sqrt(u * u + v * v);
    if (d > 1.9) return d;
    return d * (1 + wob * fbm(nCoast, x * 0.0009 + seed, z * 0.0009 - seed, 3));
  }
  const capsule = (x, z, ax, az, bx, bz) => {
    const px = x - ax, pz = z - az, ex = bx - ax, ez = bz - az;
    const t = clamp((px * ex + pz * ez) / (ex * ex + ez * ez), 0, 1);
    return Math.hypot(px - ex * t, pz - ez * t);
  };
  const ridged = (x, z, f, oct) => { const n = 1 - Math.abs(fbm(nRidge, x * f, z * f, oct)); return n * n; };
  function spine(x, z, ax, az, bx, bz, r, top, seed) {
    const dd = capsule(x, z, ax, az, bx, bz);
    if (dd >= r) return 0;
    const core = Math.pow(ss(dd, r, 0), 1.25);
    const cr = ridged(x + seed, z - seed, 0.0016, 4), fine = ridged(x - seed, z + seed, 0.0042, 3);
    return core * top * (0.5 + 0.5 * cr) + 70 * fine * core;
  }

  // Carved mountain river on Main Island (north of the AFB).
  const RIVER_A = [2020, -1960], RIVER_B = [1160, -2460], RIVER_C = [360, -3180];
  function riverDist(x, z) {
    const wx = x + 42 * fbm(nDet, x * 0.0035, z * 0.0035, 2);
    const wz = z + 42 * fbm(nDet, z * 0.0035 + 9.1, x * 0.0035, 2);
    return Math.min(capsule(wx, wz, RIVER_A[0], RIVER_A[1], RIVER_B[0], RIVER_B[1]),
      capsule(wx, wz, RIVER_B[0], RIVER_B[1], RIVER_C[0], RIVER_C[1]));
  }
  function mainIsland(x, z) {
    const d = ellipseD(x, z, 0, -1200, 3400, 2300, 0.08, 0.16, 3.1);
    if (d >= 1) return shelf(d);
    const t = 1 - d;
    const bay = ss(Math.hypot(x + 2600 + 220 * fbm(nHill, x * 0.002, z * 0.002, 2), z + 900 + 220 * fbm(nHill, z * 0.002, x * 0.002, 2)), 950, 600);
    const cliffK = Math.max(ss(z, -1500, -2700), ss(x, 1500, 2500)) * (1 - bay);
    let h = 2.5 + 38 * ss(t, 0.015, 0.16) + 85 * cliffK * ss(t, 0.006, 0.045);
    h += 95 * (fbm(nHill, x * 0.0006, z * 0.0006, 4) * 0.5 + 0.5) * ss(t, 0.08, 0.45);
    h += spine(x, z, 2150, -3050, 2950, -750, 700, 620, 3.3) * ss(t, 0.02, 0.2);
    h += spine(x, z, -2950, -2350, -950, -3150, 620, 430, 8.1) * ss(t, 0.02, 0.2);
    if (x > 100 && x < 2350 && z < -1820 && z > -3450 && h > 1.5) {
      const rd = riverDist(x, z);
      if (rd < 165) {
        const cut = ss(rd, 165, 22);
        const bed = Math.max(1.2, h * 0.22 - 8);
        h = h * (1 - cut * 0.86) + bed * (cut * 0.86);
      }
    }
    return h * (1 - bay) + (-16) * bay;
  }
  const canyonX = z => -5600 + 380 * Math.sin((z + 8200) * 0.0011) + 120 * Math.sin(z * 0.0031);
  const canyonHalf = z => 160 + 30 * Math.sin(z * 0.0019 + 1.3);
  function canyonIsland(x, z) {
    const d = ellipseD(x, z, -5600, -8200, 2700, 2400, -0.2, 0.14, 7.7);
    if (d >= 1) return shelf(d);
    const t = 1 - d;
    let h = 6 + 320 * ss(t, 0.012, 0.11);
    h += 115 * ridged(x, z, 0.0011, 4) * ss(t, 0.05, 0.28);
    const dx = Math.abs(x - canyonX(z)), half = canyonHalf(z);
    h += 80 * Math.exp(-(((dx - half - 150) / 160) ** 2)) * ss(t, 0.03, 0.18);
    const wall = ss(dx, half, half + 95);
    const ledge = 0.1 * ss(dx, half + 40, half + 52) * (1 - ss(dx, half + 60, half + 72));
    return h * Math.min(1, wall + ledge) + (-16) * (1 - wall);
  }
  function volcano(x, z) {
    const d = ellipseD(x, z, 5600, -8300, 2700, 2600, 0.3, 0.12, 11.3);
    if (d >= 1) return shelf(d);
    const t = 1 - d, rr = d;
    let h = 4 + 70 * ss(t, 0.006, 0.05) + 800 * Math.pow(ss(rr, 1.0, 0.1), 1.45);
    h += 60 * ridged(x, z, 0.0021, 3) * ss(t, 0.05, 0.3);
    const ang = Math.atan2(z + 8300, x - 5600);
    const ridges = 1 - Math.abs(fbm(nRidge, Math.cos(ang) * 2.2 + 40, Math.sin(ang) * 2.2 + rr * 3.0, 4));
    h += 150 * Math.pow(ridges, 2.2) * ss(t, 0.15, 0.7) * (1 - ss(rr, 0.25, 0.1));
    h -= 280 * ss(rr, 0.15, 0.05);
    const q = h / 55, f = q - Math.floor(q);
    const terr = (Math.floor(q) + ss(f, 0.32, 0.68)) * 55;
    const band = ss(h, 120, 200) * (1 - ss(h, 700, 780));
    return h * (1 - 0.6 * band) + terr * 0.6 * band;
  }
  function atoll(x, z, cx, cz, R, openAng, seed) {
    const dx = x - cx, dz = z - cz;
    if (Math.hypot(dx, dz) > R * 1.9) return -200;
    const dist = Math.hypot(dx, dz) + 160 * fbm(nCoast, x * 0.0011 + seed, z * 0.0011 - seed, 3);
    const a = Math.atan2(dz, dx);
    const crescent = ss(Math.cos(a - openAng), 0.55, 0.05);
    const w = 270 * (0.75 + 0.5 * (fbm(nCoast, x * 0.001 + seed, z * 0.001, 2) * 0.5 + 0.5));
    const rr = Math.abs(dist - R) / w;
    if (dist < R && rr > 1) return -3.5 - 2 * fbm(nSea, x * 0.003, z * 0.003, 2);
    const d = rr / Math.max(crescent, 0.001);
    if (d >= 1) return dist < R ? -4 : shelf(1 + (d - 1) * 0.6);
    const t = 1 - d;
    const outer = dist > R ? 1 : 0.4;
    let h = 3 + 58 * ss(t, 0.02, 0.1 / outer) * crescent;
    const hillA = openAng + Math.PI, da = Math.atan2(Math.sin(a - hillA), Math.cos(a - hillA));
    h += 70 * Math.exp(-((da * R / 320) ** 2) - ((dist - R) / 160) ** 2);
    return h;
  }
  function spit(x, z, ax, az, bx, bz, top) {
    const d = capsule(x, z, ax, az, bx, bz) / (260 * (0.8 + 0.45 * (fbm(nCoast, x * 0.0016, z * 0.0016, 3) * 0.5 + 0.5)));
    if (d >= 1) return shelf(d);
    return top * ss(1 - d, 0.0, 0.35) + 2;
  }
  const BRIDGES = [
    { a: [-3400, -3200], b: [-3700, -4550], fromA: [-2300, -2150], fromB: [-4300, -6300] },
    { a: [3300, -3250], b: [3850, -4600], fromA: [2250, -2300], fromB: [4700, -6250] }
  ];
  const DECK_TOP = 124, DECK_UNDER = 116, TOWER_TOP = 240;
  const REEF = { a: [3900, 2700], b: [7500, 450] };
  function approachCap(x, z, h) {
    for (const [zt, dir] of [[RWY.z0, -1], [RWY.z1, 1]]) {
      const along = (z - zt) * dir;
      if (along < -250 || along > 3600) continue;
      const half = 260 + 0.12 * Math.max(0, along);
      const k = ss(Math.abs(x - RWY.x), half + 350, half) * ss(along, 3600, 3200);
      if (k > 0) h = h * (1 - k) + Math.min(h, RWY.elev + 0.03 * Math.max(0, along)) * k;
    }
    return h;
  }
  const inApproach = (x, z, m = 0) => Math.abs(x - RWY.x) < 700 + m && z > RWY.z0 - 3800 - m && z < RWY.z1 + 3800 + m;

  // ---- NEW: the northern / eastern mainland ---------------------------------
  // Coast lines (inland distance > 0 north of zN / east of xE), smooth-unioned at the NE.
  // Domain-warped, multi-frequency coasts: capes, bays and headlands instead of straight lines.
  const zN = x => -12900 + 900 * Math.sin(x * 0.00021 + 0.6) + 1300 * fbm(nCoast, x * 0.00016, 4.7, 4);
  const xE = z => 11900 + 800 * Math.sin(z * 0.00024 + 1.9) + 1200 * fbm(nCoast, 2.3, z * 0.00016, 4);
  function mainlandInland(x, z) {
    const wx = x + 650 * fbm(nCoast, x * 0.00042 + 31.1, z * 0.00042, 3);
    const wz = z + 650 * fbm(nCoast, x * 0.00042, z * 0.00042 - 12.9, 3);
    return smax(zN(wx) - wz, wx - xE(wz), 1500);
  }
  // Wide glacial troughs radiating from the range; their seaward ends drown into fjords.
  function valleyCut(x, z, inland) {
    const a = (x * 0.55 + z * 0.12) * 0.00032 + 0.8 * fbm(nDet, x * 0.00014, z * 0.00014, 2);
    const v = Math.abs(Math.sin(a * Math.PI));              // 0 on a valley line
    return (1 - ss(v, 0.0, 0.17)) * ss(inland, 250, 1400) * (1 - ss(inland, 7000, 9500));
  }
  function mainland(x, z) {
    const inland = mainlandInland(x, z);
    if (inland < -1400) return -205;
    if (inland < 0) return -2.5 - 22 * ss(-inland, 0, 260) - 175 * ss(-inland, 260, 1400);
    const hills = fbm(nHill, x * 0.00045 + 11.7, z * 0.00045, 4) * 0.5 + 0.5;
    let h = 3 + 38 * ss(inland, 30, 1200);                                   // beach -> coastal plain (farmland)
    h += 260 * ss(inland, 900, 3200) * (0.35 + 0.65 * hills);                // forested foothills
    const range = Math.pow(ss(inland, 2200, 5600), 1.1);
    h += 1150 * range * (0.5 + 0.5 * ridged(x + 911, z - 377, 0.00062, 5)); // alpine massif, 1,400-1,800 m
    h += 320 * range * ridged(x - 512, z + 233, 0.0019, 3);                  // aretes & cirques
    const vc = valleyCut(x, z, inland);
    if (vc > 0) {
      const floor = inland < 2600 ? -35 + 70 * ss(inland, 600, 2600) : 35 + 0.07 * (inland - 2600);
      h = h * (1 - vc * 0.82) + floor * vc * 0.82;
    }
    return h;
  }

  // ---- ARCHIPELAGO ------------------------------------------------------------
  function analyticHeight(x, z) {
    let h = -150 - 55 * (fbm(nSea, x * 0.00025, z * 0.00025, 2) * 0.5 + 0.5);
    h = Math.max(h, mainIsland(x, z), canyonIsland(x, z), volcano(x, z), mainland(x, z),
      atoll(x, z, 8300, -1900, 1250, Math.PI, 5.5), atoll(x, z, -8300, -2600, 1150, 0, 9.1));
    for (const b of BRIDGES) h = Math.max(h, spit(x, z, b.fromA[0], b.fromA[1], b.a[0], b.a[1], DECK_TOP), spit(x, z, b.fromB[0], b.fromB[1], b.b[0], b.b[1], DECK_TOP));
    const reef = capsule(x, z, REEF.a[0], REEF.a[1], REEF.b[0], REEF.b[1]);
    const reefW = 1 + 0.6 * fbm(nSea, x * 0.0012, z * 0.0012, 3);
    h = Math.max(h, -6.5 - 40 * ss(reef / reefW, 230, 650));
    if (h > 3) h += 5 * fbm(nDet, x * 0.004, z * 0.004, 3) * ss(h, 3, 20);
    const px0 = RWY.x - 300, px1 = RWY.x + 470, pz0 = RWY.z0 - 140, pz1 = RWY.z1 + 160;
    const dxp = Math.max(px0 - x, 0, x - px1), dzp = Math.max(pz0 - z, 0, z - pz1);
    const pad = ss(Math.hypot(dxp, dzp), 160, 0);
    if (pad > 0) h = h * (1 - pad) + RWY.elev * pad;
    return approachCap(x, z, h);
  }

  // ---- GORGE --------------------------------------------------------------------
  // Hydroelectric side valley: from the crater rim westward; the dam spans it 35 % along.
  const DAM_A = [gorgeCentreX(GORGE_CRATER_Z) - GORGE_CRATER_R * 1.45, GORGE_CRATER_Z + 120];
  const DAM_B = [DAM_A[0] - 3600, DAM_A[1] + 1100];
  const DAM_T = 0.35;
  const DAM = { x: DAM_A[0] + (DAM_B[0] - DAM_A[0]) * DAM_T, z: DAM_A[1] + (DAM_B[1] - DAM_A[1]) * DAM_T,
    yaw: Math.atan2(DAM_B[0] - DAM_A[0], DAM_B[1] - DAM_A[1]), halfW: 230, crestY: 255, lakeY: 238, toeY: 60, floorUp: 150 };
  function damValley(x, z, h) {
    const ex = DAM_B[0] - DAM_A[0], ez = DAM_B[1] - DAM_A[1], L2 = ex * ex + ez * ez;
    const t = clamp(((x - DAM_A[0]) * ex + (z - DAM_A[1]) * ez) / L2, 0, 1);
    const d = Math.hypot(x - DAM_A[0] - ex * t, z - DAM_A[1] - ez * t);
    if (d > 900) return h;
    const floor = t < DAM_T ? DAM.toeY + 60 * (t / DAM_T) : DAM.floorUp + 90 * ss(t, DAM_T, 1);
    const k = 1 - ss(d, 150, 620);
    return h * (1 - k) + Math.min(h, floor) * k;
  }
  const inGorgeBox = (x, z) => !(x >= RUNWAY_BBOX.x[0] && x <= RUNWAY_BBOX.x[1] && z >= RUNWAY_BBOX.z[0] && z <= RUNWAY_BBOX.z[1]) &&
    x >= GORGE_BBOX.x[0] && x <= GORGE_BBOX.x[1] && z <= GORGE_BBOX.z[0] && z >= GORGE_BBOX.z[1];
  // Organic landmass around the canyon (instead of the old rectangular plateau): land within
  // ~2.6-3.6 km of the centreline, around the crater basin and along the dam valley, falling
  // in sea cliffs to the archipelago sea elsewhere; zero at the trench bbox edge.
  function gorgeLandK(x, z, d, cr) {
    const wob = 700 * fbm(nCoast, x * 0.00055 + 3.3, z * 0.00055, 3);
    let k = 1 - ss(d + wob, 2600, 3600);
    k = Math.max(k, 1 - ss(cr + wob * 0.6, GORGE_CRATER_R * 2.6, GORGE_CRATER_R * 4.0));
    const ex = DAM_B[0] - DAM_A[0], ez = DAM_B[1] - DAM_A[1];
    const t = clamp(((x - DAM_A[0]) * ex + (z - DAM_A[1]) * ez) / (ex * ex + ez * ez), 0, 1);
    k = Math.max(k, 1 - ss(Math.hypot(x - DAM_A[0] - ex * t, z - DAM_A[1] - ez * t) + wob * 0.6, 1700, 2700));
    const edge = Math.min(x - GORGE_BBOX.x[0], GORGE_BBOX.x[1] - x, GORGE_BBOX.z[0] - z, z - GORGE_BBOX.z[1]);
    return k * ss(edge, 0, 650);
  }
  function gorgeHeight(x, z) {
    if (!inGorgeBox(x, z)) return analyticHeight(x, z);
    const crDX = x - gorgeCentreX(GORGE_CRATER_Z), crDZ = z - GORGE_CRATER_Z;
    const cr = Math.hypot(crDX, crDZ);
    const landK = gorgeLandK(x, z, gorgeDist(x, z), cr);
    if (landK <= 0) return analyticHeight(x, z);
    const g = gorgeTerrain(x, z, cr);
    return landK >= 1 ? g : analyticHeight(x, z) * (1 - landK) + g * landK;
  }
  function gorgeTerrain(x, z, cr) {
    if (cr < GORGE_CRATER_R * 1.5) {
      const wall = GORGE_CRATER_WALL_Y * Math.exp(-Math.pow((cr - GORGE_CRATER_R * 0.72) / 190, 2));
      const cut = gorgeDist(x, z) < GORGE_HALF_W && z > GORGE_CRATER_Z + GORGE_CRATER_R * 0.4;
      if (cut) return 20 + Math.min(40, wall * 0.06);
      return 20 + wall;
    }
    const d = gorgeDist(x, z);
    const floor = GORGE_FLOOR_Y + (fbm(nDet, x * 0.012, z * 0.012, 2) * 0.5 + 0.5) * 6;
    let plateau = GORGE_RIM_Y + 34 * (fbm(nHill, x * 0.0014, z * 0.0014, 3) * 0.5 + 0.5) + 18 * ridged(x, z, 0.0018, 3);
    // Alpine massif: nothing within ~1.5 km of the centreline (rim, ceiling sites and gates
    // unchanged), rising to ~1,600 m; faded out toward the bbox edge and the crater ring.
    const edge = Math.min(x - GORGE_BBOX.x[0], GORGE_BBOX.x[1] - x, GORGE_BBOX.z[0] - z, z - GORGE_BBOX.z[1]);
    const mk = Math.pow(ss(d, GORGE_RAMP_W + 900, GORGE_RAMP_W + 2700), 1.15) * ss(edge, 0, 1600) * ss(cr, GORGE_CRATER_R * 1.6, GORGE_CRATER_R * 3.2);
    if (mk > 0) plateau += mk * (980 * (0.5 + 0.5 * ridged(x + 77, z - 31, 0.0009, 5)) + 260 * ridged(x - 140, z + 61, 0.0021, 3));
    const corridor = 1 - ss(d, GORGE_HALF_W, GORGE_RAMP_W);
    let h = floor + (plateau - floor) * (1 - corridor);
    if (z < GORGE_SC_ZA + 300 && z > GORGE_SC_ZB - 300) {
      const dS = Math.abs(x - GORGE_SC_X);
      const carved = GORGE_SC_FLOOR_Y + (h - GORGE_SC_FLOOR_Y) * ss(dS, GORGE_SC_HALF_W, GORGE_SC_RAMP_W);
      const fade = ss(z, GORGE_SC_ZB - 300, GORGE_SC_ZB) * ss(z, GORGE_SC_ZA + 300, GORGE_SC_ZA);
      h += (Math.min(h, carved) - h) * fade;
    }
    return damValley(x, z, h);
  }

  // ---- STRAIT -------------------------------------------------------------------
  function straitHeight(x, z) {
    const ax = Math.abs(x);
    let h = -155 - 45 * (fbm(nSea, x * 0.00025, z * 0.00025, 2) * 0.5 + 0.5);
    if (ax < 4450) return h;
    const sgn = x < 0 ? -1 : 1;
    const coastX = 5250 + 520 * Math.sin(z * 0.00062 + sgn * 1.1) + 340 * fbm(nCoast, z * 0.00045, sgn * 7.3, 3);
    const inland = ax - coastX;
    if (inland > -750) {
      if (inland < 0) {
        h = Math.max(h, -150 * (1 - ss(inland, -650, 0)));
      } else {
        const ridge = 0.42 + 0.58 * ridged(x + sgn * 410, z * 1.05, 0.00135, 4);
        const fjordCut = 1 - 0.55 * ss(Math.sin(z * 0.00135 + sgn * 0.8), 0.72, 0.98) * (1 - ss(inland, 400, 2400));
        // Terrain v2: 1,100-1,550 m snow-dusted walls (was ~850 m).
        let fh = (18 + 380 * ss(inland, 0, 340) + 1080 * Math.pow(ss(inland, 220, 3200), 1.15) * ridge) * fjordCut;
        fh += 70 * (fbm(nHill, x * 0.0011 + sgn * 3.1, z * 0.0011, 3) * 0.5 + 0.5) * ss(inland, 60, 700);
        h = Math.max(h, fh);
      }
    }
    if (h > 3) h += 5 * fbm(nDet, x * 0.004, z * 0.004, 3) * ss(h, 3, 20);
    const chan = ss(ax, 4550, 5050);
    return -165 * (1 - chan) + h * chan;
  }
  // Cape lighthouses / headland radar stations (also protected from erosion by the baker).
  function findStraitBluff(xSeed, zSeed, minH, maxH) {
    let bx = xSeed, bz = zSeed, best = -1e9;
    const dir = xSeed < 0 ? -1 : 1;
    for (let i = 0; i <= 24; i++) {
      const tx = xSeed + dir * i * 90;
      const h = straitHeight(tx, zSeed);
      if (h >= minH && h <= maxH) return [tx, zSeed];
      if (h > best && h <= maxH) { best = h; bx = tx; }
    }
    return [bx, bz];
  }
  const STRAIT_SITES = {
    lighthouses: [findStraitBluff(-4900, 3600, 45, 150), findStraitBluff(4900, 3400, 45, 150), findStraitBluff(-4900, -4800, 45, 150), findStraitBluff(4900, -4500, 45, 150)],
    radars: [findStraitBluff(-5800, -1200, 140, 340), findStraitBluff(5800, -1600, 140, 340)]
  };

  const heightFns = { archipelago: analyticHeight, gorge: gorgeHeight, strait: straitHeight };
  return {
    analyticHeight, gorgeHeight, straitHeight, heightFns, inGorgeBox, mainlandInland,
    capsule, inApproach, ridged, riverDist,
    BRIDGES, DECK_TOP, DECK_UNDER, TOWER_TOP, REEF, RIVER: [RIVER_A, RIVER_B, RIVER_C],
    canyonX, canyonHalf, DAM, DAM_A, DAM_B, STRAIT_SITES
  };
}
