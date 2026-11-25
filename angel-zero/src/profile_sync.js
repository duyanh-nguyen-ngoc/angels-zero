// ANGELS ZERO — offline pilot codes + optional cloud sync (zero dependencies).
// Every localStorage access is guarded: private mode / blocked storage never throws.

const PROFILE_KEY = 'angels_zero_profile';
const SYNC_ID_KEY = 'az_sync_id';
const SYNC_ON_KEY = 'az_sync_enabled';
const PREFIX = 'AZP1:';
const MAX_BYTES = 32 * 1024;
const RANKS = ['C', 'B', 'A', 'S'];
const NUM_STATS = ['bestScore', 'totalKills', 'wingsSevered', 'sortiesCleared', 'sortiesFlown', 'bridgesThreaded'];
const KEYS = [
  PROFILE_KEY, 'angelsZero_aircraft', 'angelsZero_livery', 'angelsZero_spw', 'angelsZero_mission',
  'angelsZero_difficulty', 'angelsZero_trained', 'az_callsign', 'az_ff_city', 'az_ff_custom',
  'angelsZero_ytPlaylist', 'az_gp_invert'
];

let refresh = () => {};
export function setRefreshCallback(fn) { if (typeof fn === 'function') refresh = fn; }

function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

export function collectPilotSnapshot() {
  const keys = {};
  for (const k of KEYS) {
    const v = get(k);
    if (v !== null) keys[k] = v;
  }
  return { v: 1, updatedAt: Date.now(), keys };
}

function readProfile(snap) {
  try { const p = JSON.parse(snap.keys[PROFILE_KEY] || '{}'); return p && typeof p === 'object' ? p : {}; }
  catch (e) { return {}; }
}
function betterRank(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return RANKS.indexOf(b) > RANKS.indexOf(a) ? b : a;
}

/** Strict validation + non-destructive merge. Never lowers progress. */
export function applyPilotSnapshot(snap, opts = {}) {
  try {
    if (!snap || typeof snap !== 'object' || snap.v !== 1) return { ok: false, reason: 'bad version' };
    if (!snap.keys || typeof snap.keys !== 'object' || Array.isArray(snap.keys)) return { ok: false, reason: 'bad keys' };
    const text = JSON.stringify(snap);
    if (text.length > MAX_BYTES) return { ok: false, reason: 'too large' };
    for (const k of Object.keys(snap.keys)) if (!KEYS.includes(k)) return { ok: false, reason: 'unknown key ' + k };
    for (const k of Object.keys(snap.keys)) if (typeof snap.keys[k] !== 'string' || snap.keys[k].length > MAX_BYTES) return { ok: false, reason: 'bad value' };

    const merged = { ...snap.keys };
    if (opts.merge !== false) {
      const incoming = readProfile(snap);
      const current = readProfile({ keys: { [PROFILE_KEY]: get(PROFILE_KEY) || '{}' } });
      const out = { ...current };
      for (const n of NUM_STATS) out[n] = Math.max(Number(current[n]) || 0, Number(incoming[n]) || 0);
      out.bestRank = betterRank(current.bestRank, incoming.bestRank);
      out.badges = [...new Set((Array.isArray(current.badges) ? current.badges : []).concat(Array.isArray(incoming.badges) ? incoming.badges : []))];
      out.unlockedLiveries = [...new Set((Array.isArray(current.unlockedLiveries) ? current.unlockedLiveries : [])
        .concat(Array.isArray(incoming.unlockedLiveries) ? incoming.unlockedLiveries : []))];
      if (!out.unlockedLiveries.includes('EAGLE_GREY')) out.unlockedLiveries.unshift('EAGLE_GREY');
      out.version = 1;
      merged[PROFILE_KEY] = JSON.stringify(out);
    }
    for (const k of Object.keys(merged)) set(k, merged[k]);
    refresh();
    return { ok: true, keys: Object.keys(merged).length };
  } catch (e) { return { ok: false, reason: 'invalid snapshot' }; }
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function pack(json) {
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return 'u' + b64url(bytes);
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return 'z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
  } catch (e) { return 'u' + b64url(bytes); }
}
async function unpack(code) {
  const mode = code[0], body = String(code.slice(1)).replace(/-/g, '+').replace(/_/g, '/');
  let bytes;
  const bin = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  if (mode === 'u') bytes = raw;
  else if (mode === 'z') {
    if (typeof DecompressionStream === 'undefined') throw new Error('unsupported');
    const ds = new DecompressionStream('deflate-raw');
    bytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  } else throw new Error('bad mode');
  return new TextDecoder().decode(bytes);
}

export async function exportPilotCode() {
  return PREFIX + await pack(JSON.stringify(collectPilotSnapshot()));
}
export async function importPilotCode(code) {
  try {
    const s = String(code || '').trim();
    if (!s.startsWith(PREFIX)) return { ok: false, reason: 'not a pilot code' };
    const json = await unpack(s.slice(PREFIX.length));
    if (json.length > MAX_BYTES) return { ok: false, reason: 'too large' };
    return applyPilotSnapshot(JSON.parse(json));
  } catch (e) { return { ok: false, reason: 'corrupt pilot code' }; }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export function generateSyncId() {
  let s = '';
  const bytes = new Uint8Array(8);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `AZ-${s.slice(0, 4)}-${s.slice(4)}`;
}
export function getSyncId() {
  let id = get(SYNC_ID_KEY);
  if (!/^AZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id || '')) { id = generateSyncId(); set(SYNC_ID_KEY, id); }
  return id;
}
export function setSyncId(id) {
  if (!/^AZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(id || '').toUpperCase())) return false;
  return set(SYNC_ID_KEY, String(id).toUpperCase());
}
export function isSyncEnabled() { return get(SYNC_ON_KEY) === '1'; }
export function setSyncEnabled(on) { return set(SYNC_ON_KEY, on ? '1' : '0'); }

async function request(path, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(path, { ...opts, signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) return null;                              // 503 offline: silent fallback
    return await res.json();
  } catch (e) { return null; }
  finally { clearTimeout(timer); }
}
export async function pullCloudProfile(id) {
  const data = await request(`/api/profile?id=${encodeURIComponent(id || getSyncId())}`);
  if (!data || !data.snapshot) return { ok: false, offline: true };
  const res = applyPilotSnapshot(data.snapshot, { merge: true });
  return { ok: res.ok, merged: res.ok, offline: false };
}
export async function pushCloudProfile(id) {
  const snapshot = collectPilotSnapshot();
  const res = await request('/api/profile', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id || getSyncId(), snapshot })
  });
  return { ok: !!(res && res.ok), offline: !res };
}
export async function syncNow() {
  const id = getSyncId();
  const pulled = await pullCloudProfile(id);
  const pushed = await pushCloudProfile(id);
  return { ok: pushed.ok, pulled: pulled.ok, offline: pulled.offline && pushed.offline };
}
