// ANGELS ZERO — fixed-size sortie telemetry recorder. All buffers are allocated
// once; flight-time recording is index writes only (no arrays, no THREE objects).

export const TELE_MAX = 600, TELE_DT = 1.5, EV_MAX = 64;
export const EV = { KILL: 1, ACE_KILL: 2, STRIKE_KILL: 3, CARRIER_TRAP: 4, NEAR_MISS: 5, WING_SAVED: 6 };

export function createTelemetry() {
  const samples = new Float32Array(TELE_MAX * 4);   // x, z, alt, t
  const events = new Float32Array(EV_MAX * 4);     // x, z, t, type
  let n = 0, ne = 0, acc = 0;
  function reset() { n = 0; ne = 0; acc = 0; }
  function tick(dt, s, t) {
    acc += dt;
    if (acc >= TELE_DT && n < TELE_MAX) {
      const o = n * 4;
      samples[o] = s.position.x; samples[o + 1] = s.position.z; samples[o + 2] = s.position.y; samples[o + 3] = t;
      n++; acc = 0;
    }
  }
  function event(type, x, z, t) {
    if (ne >= EV_MAX) return;
    const o = ne * 4;
    events[o] = x; events[o + 1] = z; events[o + 2] = t; events[o + 3] = type;
    ne++;
  }
  return {
    samples, events, reset, tick, event,
    get n() { return n; }, get ne() { return ne; }
  };
}
