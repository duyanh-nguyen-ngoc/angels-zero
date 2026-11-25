// Cloudflare Pages Function — optional anonymous pilot-record sync.
// Without the AZ_PROFILES KV binding it answers 503 { offline:true } and the
// client falls back to offline pilot codes with no console errors.

const ID_RE = /^AZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const MAX_BYTES = 16 * 1024, TTL_SECONDS = 365 * 24 * 60 * 60;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
});

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env && env.AZ_PROFILES;
  if (!kv) return json({ offline: true }, 503);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    } });
  }

  if (request.method === 'GET') {
    const id = String(new URL(request.url).searchParams.get('id') || '').toUpperCase();
    if (!ID_RE.test(id)) return json({ error: 'bad id' }, 400);
    const raw = await kv.get(`pilot:${id}`);
    if (!raw) return json({ error: 'not found' }, 404);
    try {
      const snapshot = JSON.parse(raw);
      if (!snapshot || snapshot.v !== 1 || !snapshot.keys) return json({ error: 'corrupt record' }, 500);
      return json({ id, snapshot });
    } catch (e) { return json({ error: 'corrupt record' }, 500); }
  }

  if (request.method === 'PUT') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    const id = String(body.id || '').toUpperCase();
    if (!ID_RE.test(id)) return json({ error: 'bad id' }, 400);
    const snap = body.snapshot;
    if (!snap || typeof snap !== 'object' || snap.v !== 1 || !snap.keys || typeof snap.keys !== 'object' || Array.isArray(snap.keys)) {
      return json({ error: 'bad snapshot' }, 400);
    }
    const text = JSON.stringify(snap);
    if (new TextEncoder().encode(text).length > MAX_BYTES) return json({ error: 'payload too large' }, 413);
    try {
      await kv.put(`pilot:${id}`, text, { expirationTtl: TTL_SECONDS });
      return json({ ok: true, id });
    } catch (e) { return json({ error: 'storage error' }, 500); }
  }

  return json({ error: 'method not allowed' }, 405);
}
