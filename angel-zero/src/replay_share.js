// ANGELS ZERO — compact, backend-free sortie replay sharing.
// Encodes a debrief snapshot into a short URL-safe token that any pilot can paste
// into ?replay=<token>. Raw payload is a fixed, strictly validated binary layout;
// CompressionStream('deflate-raw') is used when available, with a raw fallback.

const VERSION = 1;
const CALLSIGN_LEN = 14, MISSION_LEN = 16;
const MAX_TRACE = 180, MAX_EVENTS = 32;
const GRID_M = 10;                       // trace/event coordinates quantised to 10 m

const OUTCOMES = ['CLEARED', 'FAILED', 'ABORTED', 'FURBALL'];
const EVENT_KINDS = ['KILL', 'ACE', 'STRIKE', 'TRAP', 'MISS'];

function cleanText(s, max) {
  const v = String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9\-_]/g, '').slice(0, max);
  return v || '';
}
function writeAscii(view, off, text, len) {
  for (let i = 0; i < len; i++) view.setUint8(off + i, i < text.length ? text.charCodeAt(i) : 0);
}
function readAscii(view, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = view.getUint8(off + i);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s;
}
function clampI16(v) { const n = Math.round(v / GRID_M); return Math.max(-32768, Math.min(32767, n)); }
function clampU16(v) { return Math.max(0, Math.min(65535, Math.round(v || 0))); }
function compressible() {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}
function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9\-_]+$/.test(str)) throw new Error('bad token');
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function deflate(bytes) {
  if (!compressible()) return { flag: 0, bytes };
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return { flag: 1, bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
  } catch (e) { return { flag: 0, bytes }; }
}
async function inflate(bytes, flag) {
  if (flag === 0) return bytes;
  if (!compressible()) throw new Error('unsupported compression');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Download/sample at most MAX_TRACE evenly spaced (x,z) pairs. */
function sampleTrace(points) {
  const src = Array.isArray(points) ? points : [];
  const n = Math.min(src.length, MAX_TRACE);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = src[Math.floor(i * src.length / Math.max(1, n))];
    if (!p) continue;
    const x = p.x !== undefined ? p.x : p[0], z = p.z !== undefined ? p.z : p[1];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    out.push([clampI16(x), clampI16(z)]);
  }
  return out;
}
function sampleEvents(events) {
  const src = Array.isArray(events) ? events : [];
  const n = Math.min(src.length, MAX_EVENTS);
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = src[i];
    if (!e) continue;
    const kind = Math.max(0, EVENT_KINDS.indexOf(String(e.kind || 'KILL').toUpperCase()));
    const x = e.x !== undefined ? e.x : e[0], z = e.z !== undefined ? e.z : e[1];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    out.push([kind, clampI16(x), clampI16(z), clampU16(e.t || 0)]);
  }
  return out;
}

/**
 * Pack a debrief snapshot. Returns a URL-safe base64 token (Promise).
 * meta = { callsign, mission, aircraft, rank, score, kills, timeS, outcome }
 */
export async function encodeReplay(meta, tracePoints, events) {
  const m = meta || {};
  const trace = sampleTrace(tracePoints);
  const evs = sampleEvents(events);
  const len = 2 + CALLSIGN_LEN + MISSION_LEN + 1 + 1 + 1 + 4 + 2 + 2 + 1 + trace.length * 4 + 1 + evs.length * 7;
  const buf = new ArrayBuffer(len);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, VERSION);
  v.setUint8(o++, 0);                                  // compression flag, filled after deflate
  writeAscii(v, o, cleanText(m.callsign || 'WARDEN-1', CALLSIGN_LEN), CALLSIGN_LEN); o += CALLSIGN_LEN;
  writeAscii(v, o, cleanText(m.mission || 'AIR_SUPERIORITY', MISSION_LEN), MISSION_LEN); o += MISSION_LEN;
  v.setUint8(o++, m.aircraft === 'F22A' ? 1 : 0);
  v.setUint8(o++, String(m.rank || '—').charCodeAt(0) & 0xff);
  v.setUint8(o++, Math.max(0, OUTCOMES.indexOf(String(m.outcome || 'CLEARED').toUpperCase())));
  const score = Math.max(0, Math.min(4294967295, Math.round(Number(m.score) || 0)));
  v.setUint32(o, score, true); o += 4;
  v.setUint16(o, clampU16(m.kills), true); o += 2;
  v.setUint16(o, clampU16(m.timeS), true); o += 2;
  v.setUint8(o++, trace.length);
  for (const [x, z] of trace) { v.setInt16(o, x, true); o += 2; v.setInt16(o, z, true); o += 2; }
  v.setUint8(o++, evs.length);
  for (const [kind, x, z, t] of evs) {
    v.setUint8(o++, kind);
    v.setInt16(o, x, true); o += 2;
    v.setInt16(o, z, true); o += 2;
    v.setUint16(o, t, true); o += 2;
  }
  const raw = new Uint8Array(buf);
  const packed = await deflate(raw);
  const out = new Uint8Array(packed.bytes.length + 1);
  out[0] = packed.flag;
  out.set(packed.bytes, 1);
  return toBase64Url(out);
}

/** Decode strictly; never throws, never hangs. Returns null for malformed tokens. */
export async function decodeReplay(token) {
  try {
    const wire = fromBase64Url(token);
    if (wire.length < 2) return null;
    const flag = wire[0];
    if (flag !== 0 && flag !== 1) return null;
    const bytes = await inflate(wire.subarray(1), flag);
    const min = 2 + CALLSIGN_LEN + MISSION_LEN + 10 + 2;
    if (bytes.length < min) return null;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    if (v.getUint8(o++) !== VERSION) return null;
    o++;                                               // compression flag
    const callsign = readAscii(v, o, CALLSIGN_LEN) || 'WARDEN-1'; o += CALLSIGN_LEN;
    const mission = readAscii(v, o, MISSION_LEN); o += MISSION_LEN;
    if (!mission) return null;
    const aircraft = v.getUint8(o++) === 1 ? 'F22A' : 'F15C';
    const rank = String.fromCharCode(v.getUint8(o++) || 45);
    const outcome = OUTCOMES[v.getUint8(o++)] || 'CLEARED';
    const score = v.getUint32(o, true); o += 4;
    const kills = v.getUint16(o, true); o += 2;
    const timeS = v.getUint16(o, true); o += 2;
    const nt = v.getUint8(o++);
    if (nt > MAX_TRACE || bytes.length < o + nt * 4 + 1) return null;
    const trace = [];
    for (let i = 0; i < nt; i++) {
      trace.push({ x: v.getInt16(o, true) * GRID_M, z: v.getInt16(o + 2, true) * GRID_M });
      o += 4;
    }
    const ne = v.getUint8(o++);
    if (ne > MAX_EVENTS || bytes.length < o + ne * 7) return null;
    const events = [];
    for (let i = 0; i < ne; i++) {
      const kind = EVENT_KINDS[v.getUint8(o++)] || 'KILL';
      const x = v.getInt16(o, true) * GRID_M; o += 2;
      const z = v.getInt16(o, true) * GRID_M; o += 2;
      const t = v.getUint16(o, true); o += 2;
      events.push({ kind, x, z, t });
    }
    if (o !== bytes.length) return null;               // reject trailing garbage
    return { meta: { v: VERSION, callsign, mission, aircraft, rank, score, kills, timeS, outcome }, trace, events };
  } catch (e) { return null; }
}

export function buildReplayUrl(encoded) {
  return `${location.origin}${location.pathname}?replay=${encoded}`;
}
