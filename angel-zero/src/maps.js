// ANGELS ZERO — map layouts referenced by MISSIONS[].mapTag.
// `heightFn` is a tag resolved by world.rebuild(); all collision still flows
// through world.heightAt / world.collide.

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
    heightFn: 'gorge', islands: [], canyonAmp: 1.6, runway: true,
    carrier: null, fleet: [], cloudSea: null, fogFar: 42000, radarCeilM: 366
  },
  CLOUD_ARENA: {
    heightFn: 'sea', islands: [], canyonAmp: 1, runway: false,
    carrier: { pos: [0, 0, 9000], hdg: 0, spd: 4.1 }, fleet: [],
    cloudSea: { base: 3000, top: 3600 }, fogFar: 52000
  }
};
