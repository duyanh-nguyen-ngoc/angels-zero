// ANGELS ZERO — map layouts referenced by MISSIONS[].mapTag.
// `heightFn` is a tag resolved by world.rebuild(); all collision still flows
// through world.heightAt / world.collide.

// CANYON_RUN: winding low-altitude trench. Shared height/corridor maths so
// terrain, gates, ceiling sites and mission logic all agree on the centreline.
export const GORGE_FLOOR_Y = 40, GORGE_RIM_Y = 366, GORGE_CRATER_R = 700,
  GORGE_CRATER_WALL_Y = 820, GORGE_CRATER_Z = -9800;
export const gorgeCentreX = z => 520 * Math.sin(z / 1400) + 260 * Math.sin(z / 610 + 1.1);

export const MAPS = {
  ARCHIPELAGO: {
    heightFn: 'archipelago', islands: [], canyonAmp: 1, runway: true,
    carrier: null, fleet: [], cloudSea: null, fogFar: 62000
  },
  STRAIT: {
    heightFn: 'strait', islands: [[-1400, 6200, 900], [2100, 7300, 700]], canyonAmp: 1, runway: false,
    carrier: { pos: [0, 0, 9000], hdg: 0, spd: 4.1 },
    fleet: [{ kind: 'DDG', pos: [-1200, 0, 5200] }, { kind: 'DDG', pos: [1300, 0, 5600] }, { kind: 'CG', pos: [0, 0, 6400] }],
    cloudSea: null, fogFar: 58000
  },
  GORGE: {
    heightFn: 'gorge', islands: [], canyonAmp: 1, runway: true,
    carrier: null, fleet: [], cloudSea: null, fogFar: 42000, radarCeilM: 366,
    ceiling: { m: 366, lethal: true }, cell: 16,
    bbox: { x: [-1400, 1400], z: [600, -10800] },
    crater: { z: GORGE_CRATER_Z, r: GORGE_CRATER_R, wallY: GORGE_CRATER_WALL_Y, floorY: 20 }
  },
  CLOUD_ARENA: {
    heightFn: 'sea', islands: [], canyonAmp: 1, runway: false,
    carrier: { pos: [0, 0, 9000], hdg: 0, spd: 4.1 }, fleet: [],
    cloudSea: { base: 3000, top: 3600 }, fogFar: 52000
  }
};
