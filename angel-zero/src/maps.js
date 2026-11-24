// ANGELS ZERO — map layouts referenced by MISSIONS[].mapTag.
// `heightFn` is a tag resolved by world.rebuild(); all collision still flows
// through world.heightAt / world.collide.
export const FT = 0.3048, CEIL_FT = 1200, CEIL_M = CEIL_FT * FT;   // 365.76 m, one source
export const SEA_FLOOR_Y = -40;                                    // open-ocean heightfield
// CANYON_RUN: winding low-altitude trench. Shared height/corridor maths so
// terrain, gates, ceiling sites and mission logic all agree on the centreline.
// The trench runs south -> north (z decreasing) through the western half of the
// map, well clear of the AFB, in sweeping S-curves about 25 km long (centreline arc).
export const GORGE_FLOOR_Y = 40, GORGE_RIM_Y = CEIL_M, GORGE_CRATER_R = 700,
  GORGE_CRATER_WALL_Y = 820, GORGE_CRATER_Z = -11000;
export const GORGE_Z0 = 6500;                                       // canyon mouth (entrance)
// Sweeps: tightest radius ~790 m (about 4.7 G at 370 kt), after a 1.5 km straight
// lead-in from the mouth so the pilot settles in before the first curve.
export const GORGE_X0 = -8000, GORGE_A1 = 2600, GORGE_L1 = 1700, GORGE_A2 = 300, GORGE_L2 = 900, GORGE_LEAD = 1500;
export const GORGE_HALF_W = 110, GORGE_RAMP_W = 175;                // floor half-width / rim, perpendicular metres
// x(z) centreline. Both harmonics start with zero slope, so the mouth faces due north.
export const gorgeCentreX = z => {
  const s = Math.max(0, GORGE_Z0 - z - GORGE_LEAD);
  return GORGE_X0 + GORGE_A1 * (1 - Math.cos(s / GORGE_L1)) + GORGE_A2 * (1 - Math.cos(s / GORGE_L2));
};
// dx/dz of the centreline.
export const gorgeSlope = z => {
  const s = GORGE_Z0 - z - GORGE_LEAD;
  if (s <= 0) return 0;
  return -(GORGE_A1 / GORGE_L1) * Math.sin(s / GORGE_L1) - (GORGE_A2 / GORGE_L2) * Math.sin(s / GORGE_L2);
};
// Yaw (rotation about +Y) that points the nose (local -Z) down the trench toward the crater.
export const gorgeHeading = z => Math.atan2(gorgeSlope(z), 1);
// Perpendicular distance from the centreline (first order in the slope).
export const gorgeDist = (x, z) => Math.abs(x - gorgeCentreX(z)) / Math.sqrt(1 + gorgeSlope(z) ** 2);
export const GORGE_BBOX = { x: [-9000, -1400], z: [7000, -12300] };   // z: [south, north]
export const GORGE_FORT = [gorgeCentreX(GORGE_CRATER_Z), 0, GORGE_CRATER_Z];
export const GORGE_SPAWN_Z = GORGE_Z0 - 150;                         // inside the mouth, before gate 1
// Sequential gates spaced evenly by centreline arc length (computed once at load).
export const GORGE_GATE_N = 15;
export const GORGE_GATE_Z = (() => {
  const zA = GORGE_SPAWN_Z, zB = GORGE_CRATER_Z + GORGE_CRATER_R * 1.6, dz = 10;
  let len = 0;
  for (let z = zA; z > zB; z -= dz) len += dz * Math.sqrt(1 + gorgeSlope(z) ** 2);
  const out = new Float32Array(GORGE_GATE_N), first = 900, step = (len - first) / (GORGE_GATE_N - 1);
  let acc = 0, k = 0;
  for (let z = zA; z > zB && k < GORGE_GATE_N; z -= dz) {
    acc += dz * Math.sqrt(1 + gorgeSlope(z) ** 2);
    if (acc >= first + k * step) out[k++] = z;
  }
  while (k < GORGE_GATE_N) out[k++] = zB;
  return out;
})();
export const GORGE_ARC_M = (() => {
  let len = 0;
  for (let z = GORGE_SPAWN_Z; z > GORGE_CRATER_Z; z -= 10) len += 10 * Math.sqrt(1 + gorgeSlope(z) ** 2);
  return len;
})();
// High-risk shortcut: a straight rock-lined ravine cuts across the first big S
// bend (~5.3 km of trench arc reduced to 2.2 km). The carve is analytic so the
// single height grid, CCIP, impacts and crash checks all see it for free.
export const GORGE_SC_SAPEX = Math.PI * GORGE_L1;
export const GORGE_SC_ZAPEX = GORGE_Z0 - GORGE_LEAD - GORGE_SC_SAPEX;
export const GORGE_SC_ZA = GORGE_SC_ZAPEX + 1100, GORGE_SC_ZB = GORGE_SC_ZAPEX - 1100;
export const GORGE_SC_X = (gorgeCentreX(GORGE_SC_ZA) + gorgeCentreX(GORGE_SC_ZB)) / 2;
export const GORGE_SC_HALF_W = 45, GORGE_SC_RAMP_W = 90, GORGE_SC_FLOOR_Y = GORGE_FLOOR_Y + 25;
export const GORGE_SC_ARCH_Z = GORGE_SC_ZAPEX;
export const GORGE_SC_ARCH_Y0 = 170, GORGE_SC_ARCH_Y1 = 230;
export const GORGE_SC_ARCH_W = 140, GORGE_SC_ARCH_D = 60;
export const GORGE_SC_SAVE_M = (() => {
  let len = 0;
  for (let z = GORGE_SC_ZA; z > GORGE_SC_ZB; z -= 10) len += 10 * Math.sqrt(1 + gorgeSlope(z) ** 2);
  return Math.round(len - 2200);
})();
export const GORGE_SC_SKIP = (() => {
  const a = [], n = GORGE_GATE_Z.length;
  for (let i = 0; i < n; i++) if (GORGE_GATE_Z[i] < GORGE_SC_ZA && GORGE_GATE_Z[i] > GORGE_SC_ZB) a.push(i);
  return a.length ? [a[0], a[a.length - 1]] : [0, 0];
})();
// RWY 36 strip + 400 m margin: the canyon plateau must never cover the AFB.
export const RUNWAY_BBOX = { x: [500, 1300], z: [-1800, 2000] };

export const MAPS = {
  ARCHIPELAGO: {
    heightFn: 'archipelago', islands: [], canyonAmp: 1, runway: true,
    carrier: null, fleet: [], cloudSea: null, fogFar: 62000,
    props: { terrain: true, islands: true, runway: true, baseBldg: true, radar: true, foliage: true }
  },
  STRAIT: {
    heightFn: 'ocean', islands: [], canyonAmp: 1, runway: false,
    carrier: { pos: [0, 0, 9000], hdg: 0, spd: 4.1 },
    fleet: [{ kind: 'DDG', pos: [-1200, 0, 5200] }, { kind: 'DDG', pos: [1300, 0, 5600] }, { kind: 'CG', pos: [0, 0, 6400] }],
    cloudSea: null, fogFar: 58000,
    props: { terrain: false, islands: false, runway: false, baseBldg: false, radar: false, foliage: false }
  },
  GORGE: {
    heightFn: 'gorge', islands: [], canyonAmp: 1, runway: true,
    carrier: null, fleet: [], cloudSea: null, fogFar: 42000,
    ceiling: { m: CEIL_M }, cell: 16,
    bbox: GORGE_BBOX,
    crater: { z: GORGE_CRATER_Z, r: GORGE_CRATER_R, wallY: GORGE_CRATER_WALL_Y, floorY: 20 },
    // Trees are one InstancedMesh over the whole island, so they are hidden here;
    // island props / lights inside the trench bbox are masked by applyMapProps.
    props: { terrain: true, islands: true, runway: true, baseBldg: true, radar: true, foliage: false }
  },
  CLOUD_ARENA: {
    heightFn: 'ocean', islands: [], canyonAmp: 1, runway: false,
    carrier: { pos: [0, 0, 9000], hdg: 0, spd: 4.1 }, fleet: [],
    cloudSea: { base: 3000, top: 3600 }, fogFar: 52000,
    props: { terrain: false, islands: false, runway: false, baseBldg: false, radar: false, foliage: false }
  },
  REAL_WORLD: {
    heightFn: 'ocean', islands: [], canyonAmp: 1, runway: false,
    carrier: null, fleet: [],
    cloudSea: { base: 1067, top: 1768 }, fogFar: 60000,
    props: { terrain: false, islands: false, runway: false, baseBldg: false, radar: false, foliage: false }
  }
};
