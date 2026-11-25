// ANGELS ZERO — lightweight leaderboard client with a clean local fallback.
// The Pages Function API is optional: on python server.py / headless CI the
// network call simply fails quietly and the personal top-10 board is used.

const KEY = 'az_local_board';
const TIMEOUT_MS = 4000;
const airframes = ['F15C', 'F22A'];

function localBoard() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, 10) : [];
  } catch (e) { return []; }
}
function saveBoard(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10))); } catch (e) { /* storage unavailable */ }
}
function sortBoard(list) {
  return list.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
}
async function request(path, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...opts, signal: ctrl.signal });
    if (!res.ok) return null;                          // 404 / 503 / offline: silent fallback
    return await res.json();
  } catch (e) { return null; }                         // never log a console error here
  finally { clearTimeout(timer); }
}
function validEntry(e) {
  return e && typeof e === 'object' && typeof e.callsign === 'string' &&
    airframes.includes(e.aircraft) && Number.isFinite(e.score) && Number.isFinite(e.kills);
}

/** Returns top entries for a mission; merges the remote board with the local one. */
export async function fetchLeaderboard(missionId) {
  const local = localBoard().filter(e => !missionId || e.mission === missionId);
  const remote = await request(`/api/leaderboard?mission=${encodeURIComponent(missionId || '')}`);
  const list = Array.isArray(remote && remote.entries) ? remote.entries.filter(validEntry) : [];
  if (!list.length) return local;
  const merged = sortBoard(list.concat(local));
  saveBoard(merged);
  return merged;
}

/** Submits a cleared sortie; the personal board is always updated locally. */
export async function submitScore(entry) {
  if (!validEntry(entry)) return { ok: false, reason: 'invalid' };
  const row = {
    callsign: String(entry.callsign).slice(0, 14),
    mission: String(entry.mission || 'AIR_SUPERIORITY'),
    aircraft: entry.aircraft,
    rank: String(entry.rank || '—'),
    score: Math.round(entry.score),
    kills: Math.round(entry.kills),
    timeS: Math.round(entry.timeS || 0),
    date: new Date().toISOString().slice(0, 10),
    replay: String(entry.replay || '').slice(0, 2000)
  };
  saveBoard(sortBoard(localBoard().concat([row])));
  const res = await request('/api/leaderboard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row)
  });
  return { ok: !!(res && res.ok), local: true };
}
