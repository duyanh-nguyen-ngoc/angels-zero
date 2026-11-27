// ANGELS ZERO — CANYON_RUN prop sites (v3.1), shared by the offline baker and world.js.
// The baker stores the baked gorge ground height at every probe point (meta.landmarks.
// gorgeProbe, same order as gorgeProbePoints), so the citadel, truss-bridge piers and rim
// casemates sit flush on the real canyon rims without loading the gorge pack at boot.
import { GORGE_FORT, GORGE_GATE_Z, GORGE_GATE_N, GORGE_RAMP_W, GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_ZB,
  gorgeCentreX, gorgeSlope, gorgeHeading } from './maps.js?v=s10can8';

export function gorgePropSites() {
  const fx = GORGE_FORT[0], fz = GORGE_FORT[2];
  const bastions = [], towers = [], tanks = [], bridges = [], casemates = [];
  // Octagonal perimeter bastion ring (r = 255 m), open on the south canyon-mouth sector.
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2, dz = Math.sin(a);
    if (dz > 0.55) continue;
    bastions.push({ x: fx + Math.cos(a) * 255, z: fz + dz * 255, yaw: -a + Math.PI / 2, s });
  }
  for (const [ox, oz, h] of [[-175, -130, 48], [175, -130, 48], [0, -210, 62]]) towers.push({ x: fx + ox, z: fz + oz, h, ox });
  for (let t = 0; t < 4; t++) tanks.push({ x: fx - 150 + (t % 2) * 34, z: fz + 45 + Math.floor(t / 2) * 34 });
  // 3 high truss bridges above the radar ceiling; piers stand on the rims either side.
  for (const gi of [2, 7, 11]) {
    const bz = GORGE_GATE_Z[gi], bcx = gorgeCentreX(bz), sl = gorgeSlope(bz);
    const nx = 1 / Math.sqrt(1 + sl * sl), nz = -sl * nx;
    bridges.push({ gi, bz, bcx, nx, nz, yaw: gorgeHeading(bz) + Math.PI / 2,
      piers: [-1, 1].map(sg => ({ x: bcx + nx * sg * (GORGE_RAMP_W + 32), z: bz + nz * sg * (GORGE_RAMP_W + 32), sg })) });
  }
  // Rim observation casemates.
  for (let i = 0; i < GORGE_GATE_N; i += 2) {
    const rz = GORGE_GATE_Z[i], sl = gorgeSlope(rz), inv = 1 / Math.sqrt(1 + sl * sl), side = (i & 2) ? 1 : -1;
    const rx = gorgeCentreX(rz) + side * (GORGE_RAMP_W + 48) * inv, rzz = rz - side * (GORGE_RAMP_W + 48) * sl * inv;
    if (Math.abs(rx - GORGE_SC_X) < 170 && rzz < GORGE_SC_ZA + 170 && rzz > GORGE_SC_ZB - 170) continue;
    casemates.push({ x: rx, z: rzz, i });
  }
  return { bastions, towers, tanks, bridges, casemates };
}

// Flat probe list (order is the contract with meta.landmarks.gorgeProbe).
export function gorgeProbePoints(sites = gorgePropSites()) {
  return [...sites.bastions, ...sites.towers, ...sites.tanks, ...sites.bridges.flatMap(b => b.piers), ...sites.casemates].map(p => [p.x, p.z]);
}
