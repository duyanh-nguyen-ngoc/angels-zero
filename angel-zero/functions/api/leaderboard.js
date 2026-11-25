// Cloudflare Pages Function — optional global leaderboard.
// Without the AZ_LEADERBOARD KV binding the endpoint answers 503 { offline:true }
// and the client falls back to its local personal board with no console noise.

const ORDER = ['AIR_SUPERIORITY', 'NAVAL_BATTLE', 'CANYON_RUN', 'ACE_DUEL', 'FURBALL', 'FREE_FLIGHT', 'TRAINING'];
const MAX_ENTRIES = 50, TOP_N = 25, RATE_SECONDS = 15;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
});

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env && env.AZ_LEADERBOARD;
  if (!kv) return json({ offline: true, entries: [] }, 503);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    } });
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const mission = (url.searchParams.get('mission') || 'AIR_SUPERIORITY').toUpperCase();
    if (!ORDER.includes(mission)) return json({ error: 'unknown mission' }, 400);
    let list = [];
    try { list = JSON.parse((await kv.get(`mission:${mission}`)) || '[]'); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    list.sort((a, b) => (b.score || 0) - (a.score || 0));
    return json({ mission, entries: list.slice(0, TOP_N) });
  }

  if (request.method === 'POST') {
    let row;
    try { row = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    const mission = String(row.mission || '').toUpperCase();
    if (!ORDER.includes(mission)) return json({ error: 'unknown mission' }, 400);
    if (!['F15C', 'F22A'].includes(row.aircraft)) return json({ error: 'bad aircraft' }, 400);
    if (!/^[A-Za-z0-9_-]{2,14}$/.test(String(row.callsign || ''))) return json({ error: 'bad callsign' }, 400);
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > 500000) return json({ error: 'bad score' }, 400);
    if (!Number.isFinite(row.kills) || row.kills < 0 || row.kills > 200) return json({ error: 'bad kills' }, 400);
    if (String(row.replay || '').length > 2000) return json({ error: 'replay too long' }, 400);

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
    const key = `rate:${ip}`;
    try {
      if (await kv.get(key)) return json({ error: 'rate limited' }, 429);
      await kv.put(key, '1', { expirationTtl: RATE_SECONDS });
      let list = [];
      try { list = JSON.parse((await kv.get(`mission:${mission}`)) || '[]'); } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      list.push({
        callsign: row.callsign, aircraft: row.aircraft, rank: String(row.rank || '—').slice(0, 2),
        score: Math.round(row.score), kills: Math.round(row.kills), timeS: Math.round(row.timeS || 0),
        date: String(row.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
        replay: String(row.replay || '')
      });
      list.sort((a, b) => (b.score || 0) - (a.score || 0));
      await kv.put(`mission:${mission}`, JSON.stringify(list.slice(0, MAX_ENTRIES)));
      return json({ ok: true });
    } catch (e) { return json({ error: 'storage error' }, 500); }
  }

  return json({ error: 'method not allowed' }, 405);
}
