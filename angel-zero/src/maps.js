// ANGELS ZERO — map layouts referenced by MISSIONS[].mapTag.
// `heightFn` is a tag resolved by world.rebuild(); all collision still flows
// through world.heightAt / world.collide.
export const FT = 0.3048, CEIL_FT = 1200, CEIL_M = CEIL_FT * FT;   // 365.76 m, one source
export const SEA_FLOOR_Y = -40;                                    // open-ocean heightfield
// CANYON_RUN: winding low-altitude trench. Shared height/corridor maths so
// terrain, gates, ceiling sites and mission logic all agree on the centreline.
export const GORGE_FLOOR_Y = 40, GORGE_RIM_Y = CEIL_M, GORGE_CRATER_R = 700,
  GORGE_CRATER_WALL_Y = 820, GORGE_CRATER_Z = -9800;
export const gorgeCentreX = z => 520 * Math.sin(z / 1400) + 260 * Math.sin(z / 610 + 1.1);
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
    bbox: { x: [-1400, 1400], z: [600, -10800] },
    crater: { z: GORGE_CRATER_Z, r: GORGE_CRATER_R, wallY: GORGE_CRATER_WALL_Y, floorY: 20 },
    props: { terrain: true, islands: true, runway: true, baseBldg: true, radar: true, foliage: true }
  },
  CLOUD_ARENA: {
    heightFn: 'ocean', islands: [], canyonAmp: 1, runway: false,
    carrier: { pos: [0, 0, 9000], hdg: 0, spd: 4.1 }, fleet: [],
    cloudSea: { base: 3000, top: 3600 }, fogFar: 52000,
    props: { terrain: false, islands: false, runway: false, baseBldg: false, radar: false, foliage: false }
  }
};
