// ANGELS ZERO — deterministic headless Chromium smoke suite.
// Zero repo dependencies: Playwright is imported dynamically (CI installs it with
// `npm i --no-save playwright`), and the static server uses only Node built-ins.
// Run from anywhere:   node angel-zero/scripts/smoke_test.mjs
// Optional:            SMOKE_PORT=8791 node angel-zero/scripts/smoke_test.mjs
//
// three.js r160 is fulfilled from repo-root `smoke_vendor/` so CI never depends on
// unpkg (a hung CDN request otherwise blocks module evaluation and __az never
// appears). Software-GL shader warm-up is skipped via the debug-only ?nowarm hook;
// the suite uses two full page loads and drives the rest through live __az helpers.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // angel-zero/
const VENDOR = path.resolve(ROOT, '..', 'smoke_vendor');                          // repo root
const PORT = Number(process.env.SMOKE_PORT) || 8791;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webp': 'image/webp', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (err) {
  console.error('[SMOKE] Playwright is required. Install it with: npm i --no-save playwright && npx playwright install chromium');
  console.error('[SMOKE] ' + (err && err.message ? err.message : err));
  process.exit(1);
}
if (!fs.existsSync(path.join(VENDOR, 'build', 'three.module.js'))) {
  console.error('[SMOKE] Vendored three.js missing at ' + VENDOR);
  process.exit(1);
}

/* ------------------------------------------------------------------ static server */
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, BASE).pathname); }
  catch { res.writeHead(400); res.end('bad url'); return; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});
const listen = () => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(PORT, '127.0.0.1', resolve);
});
async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(BASE)).status === 200) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('static server did not become ready');
}

/* ---------------------------------------------------------------------- assertions */
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const finite = v => typeof v === 'number' && Number.isFinite(v);

let browser = null, page = null;
let consoleMessages = [], pageErrors = [], badResponses = [], badRequests = [];
let warpLogLine = '';
const failures = [];

function resetCollectors() { consoleMessages = []; pageErrors = []; badResponses = []; badRequests = []; }

function attachCollectors(p) {
  p.on('pageerror', e => pageErrors.push(String(e && e.stack || e)));
  p.on('console', m => {
    const text = m.text();
    consoleMessages.push(text);
    if (text.startsWith('[ANGELS_ZERO] warp')) warpLogLine = text;
    if (m.type() !== 'error') return;
    if (/ERR_ABORTED|ERR_FAILED|net::/.test(text)) return;   // navigation/CDN aborts are expected
    const loc = m.location() || {};
    const fromLocal = /127\.0\.0\.1|localhost/.test(loc.url || '') || /127\.0\.0\.1|localhost/.test(text);
    const thirdParty = /youtube|ytimg|googlevideo/i.test(text);
    if (fromLocal && !thirdParty) badResponses.push('console: ' + text.slice(0, 240));
  });
  p.on('response', r => {
    const u = r.url();
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return;
    if (r.status() >= 400 && !/favicon\.ico/.test(u)) badResponses.push(r.status() + ' ' + u);
  });
  p.on('requestfailed', r => {
    const u = r.url();
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return;
    const err = r.failure()?.errorText || '';
    if (/ERR_ABORTED/.test(err)) return;                      // intentional navigation
    badRequests.push(u + ' ' + err);
  });
}

async function navigate(query) {
  resetCollectors();
  try { await page.evaluate(() => { window.onbeforeunload = null; }); } catch { /* fresh page */ }
  const qs = query.includes('nowarm') ? query : `${query}&nowarm`;
  const t0 = Date.now();
  await page.goto(`${BASE}?${qs}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log(`    [nav] domcontentloaded in ${Date.now() - t0} ms`);
  try {
    await page.waitForFunction(() => window.__az && window.__az.ready === true, null, { timeout: 90000 });
    console.log(`    [nav] __az.ready in ${Date.now() - t0} ms`);
  } catch (e) {
    let st = {}, tail = [], errs = [];
    try { st = await page.evaluate(() => ({ az: typeof window.__az, ready: window.__az?.ready,
      chip: document.getElementById('buildChip')?.textContent })); } catch { /* gone */ }
    tail = consoleMessages.slice(-12); errs = pageErrors.slice(-4);
    console.log('    [nav] DIAG ' + JSON.stringify(st).slice(0, 600));
    console.log('    [nav] console tail ' + JSON.stringify(tail).slice(0, 1200));
    console.log('    [nav] pageErrors ' + JSON.stringify(errs).slice(0, 900));
    throw e;
  }
}
async function missionReady(id) {
  await page.waitForFunction(mid => {
    const a = window.__az;
    return a && a.ready && a.sortie && a.sortie.active && a.perf && a.perf.frames >= 5 && a.missionId === mid;
  }, id, { timeout: 60000 });
}
async function switchMission(id) {
  // Fire-and-forget: startSortie() is async and may legitimately take seconds.
  // Awaiting it directly could hang forever; missionReady() has a hard timeout.
  await page.evaluate(mid => { window.__az.setMission(mid); }, id);
  await missionReady(id);
}
async function glError() {
  return page.evaluate(() => { const gl = window.__az?.renderer?.getContext?.(); return gl ? gl.getError() : -1; });
}
async function fps() { return page.evaluate(() => Math.round(window.__az?.perf?.fps || 0)); }
function checkCollectors() {
  assert(pageErrors.length === 0, 'uncaught page exceptions: ' + pageErrors.join(' | ').slice(0, 500));
  assert(badResponses.length === 0, 'failed/4xx local responses: ' + badResponses.join(' | ').slice(0, 500));
  assert(badRequests.length === 0, 'failed local requests: ' + badRequests.join(' | ').slice(0, 500));
}
async function run(name, fn) {
  const t0 = Date.now();
  try {
    await fn(); checkCollectors();
    console.log(`  PASS  ${name.padEnd(44)} ${String(Date.now() - t0).padStart(6)} ms  fps=${await fps()}`);
  } catch (e) {
    const detail = String(e && e.message || e);
    failures.push(`${name}: ${detail}`);
    console.log(`  FAIL  ${name.padEnd(44)} ${String(Date.now() - t0).padStart(6)} ms  ${detail.slice(0, 220)}`);
  }
}
async function assertMission(id) {
  const s = await page.evaluate(() => {
    const a = window.__az;
    return { gl: a.renderer.getContext().getError(), mode: a.mode, app: a.appMode,
      y: a.state.position.y, speed: a.state.speed, alive: a.enemies.filter(e => e.alive).length };
  });
  assert(s.gl === 0, 'WebGL error');
  assert(s.mode === 'FLY', `flightMode ${s.mode}`);
  assert(s.app === 'PLAY', `appMode ${s.app}`);
  assert(finite(s.y) && finite(s.speed), `non-finite physics y=${s.y} speed=${s.speed}`);
  if (id === 'ACE_DUEL') assert(s.alive === 1, `ACE_DUEL alive=${s.alive}`);
  if (id === 'FREE_FLIGHT') assert(s.alive === 0, `FREE_FLIGHT alive=${s.alive}`);
}

/* ------------------------------------------------------------------------- scenarios */
const SCENARIOS = [
  ['Menu / hangar boot', async () => {
    await navigate('debug&nobgm');
    const s = await page.evaluate(() => ({ mode: window.__az.appMode,
      chip: document.getElementById('buildChip')?.textContent || '' }));
    assert(s.mode === 'MENU', `appMode ${s.mode} !== MENU`);
    assert(/^v\d+\.\d+\.\d+$/.test(s.chip), `buildChip "${s.chip}" is not a version`);
    assert(await glError() === 0, 'WebGL error on menu boot');
  }],

  ['Mission AIR_SUPERIORITY', async () => {
    // Second + last full page load: F-22A airframe + deterministic warp line + first mission.
    await navigate('debug&nointro&nobgm&warp=3&aircraft=F22A&mission=AIR_SUPERIORITY');
    await missionReady('AIR_SUPERIORITY');
    await assertMission('AIR_SUPERIORITY');
  }],
  ['Mission NAVAL_BATTLE', async () => { await switchMission('NAVAL_BATTLE'); await assertMission('NAVAL_BATTLE'); }],
  ['Mission CANYON_RUN', async () => { await switchMission('CANYON_RUN'); await assertMission('CANYON_RUN'); }],
  ['Mission ACE_DUEL', async () => { await switchMission('ACE_DUEL'); await assertMission('ACE_DUEL'); }],
  ['Mission FURBALL', async () => { await switchMission('FURBALL'); await assertMission('FURBALL'); }],
  ['Mission FREE_FLIGHT', async () => { await switchMission('FREE_FLIGHT'); await assertMission('FREE_FLIGHT'); }],

  ['F-22A + cockpit + nose camera cycle', async () => {
    // No reload: the live page is already the F-22A build. Normalise view to CHASE.
    await page.evaluate(() => window.__az.setView(false));
    let s = await page.evaluate(() => ({ ac: window.__az.aircraft, cam: window.__az.camMode }));
    assert(s.ac === 'F22A', `aircraft ${s.ac}`);
    assert(s.cam === 'CHASE', `initial camera ${s.cam}`);
    for (const expected of ['COCKPIT', 'NOSE', 'CHASE']) {
      await page.keyboard.press('Space');
      await page.waitForFunction(m => window.__az?.camMode === m, expected, { timeout: 15000 });
      assert(await glError() === 0, `WebGL error after switching to ${expected}`);
    }
  }],

  ['Wingman BTT + order break', async () => {
    await switchMission('AIR_SUPERIORITY');
    await page.evaluate(() => window.__az.setWingOrder(2));
    await page.waitForFunction(() => window.__az.wingState.some(w => w.mode !== 'FORM'), null, { timeout: 15000 });
    const s = await page.evaluate(() => ({ wing: window.__az.wingState,
      ok: window.__az.wingmen.every(w => w.pos.toArray().every(Number.isFinite) && Number.isFinite(w.speed)),
      gl: window.__az.renderer.getContext().getError() }));
    assert(s.ok, 'non-finite wingman state');
    assert(s.gl === 0, 'WebGL error');
    assert(s.wing.some(w => w.mode === 'BREAK' || w.mode === 'FOCUS'), 'no BREAK/FOCUS wingman mode');
  }],

  ['Ace BFM + countermeasure states', async () => {
    await switchMission('ACE_DUEL');
    await page.evaluate(() => {
      const a = window.__az, e = a.enemies.find(x => x.alive && (x.aceFlight || x.ace));
      if (e) { a.state.position.copy(e.pos).addScaledVector(e.fwd, -800); a.state.velocity.copy(e.vel); a.state.quaternion.copy(e.quat); }
    });
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => ({ ok: window.__az.enemies.every(e => e.pos.toArray().every(Number.isFinite) && e.vel.toArray().every(Number.isFinite)),
      gl: window.__az.renderer.getContext().getError() }));
    assert(s.ok, 'non-finite enemy state');
    assert(s.gl === 0, 'WebGL error');
  }],

  ['Deterministic warp telemetry audit', async () => {
    assert(warpLogLine.startsWith('[ANGELS_ZERO] warp'), 'no [ANGELS_ZERO] warp log line');
    assert(!/NaN|undefined/i.test(warpLogLine), `warp line has NaN/undefined: ${warpLogLine.slice(0, 240)}`);
  }],

  ['Debrief screen', async () => {
    await page.evaluate(() => window.__az.endSortie('CLEARED'));
    await page.waitForFunction(() => window.__az?.debrief === true, null, { timeout: 20000 });
    const s = await page.evaluate(() => ({ rank: document.getElementById('dbRank')?.textContent?.trim() || '',
      stats: document.getElementById('dbStats')?.innerHTML?.trim() || '',
      gl: window.__az.renderer.getContext().getError() }));
    assert(s.rank.length > 0, 'dbRank empty');
    assert(s.stats.length > 0, 'dbStats empty');
    assert(s.gl === 0, 'WebGL error');
  }]
];

/* ------------------------------------------------------------------------------ main */
try {
  await listen(); await waitForServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required', '--no-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.route('**/*', route => {
    const u = route.request().url();
    // Vendored three.js r160 — never hit unpkg from CI.
    const prefix = 'https://unpkg.com/three@0.160.0/';
    if (u.startsWith(prefix)) {
      const file = path.join(VENDOR, u.slice(prefix.length));
      if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(file) });
      return route.abort();
    }
    // Third-party stuff must never hang CI: fonts, YouTube, free-flight tiles.
    if (/fonts\.googleapis|fonts\.gstatic|youtube|ytimg|googlevideo|tiles\.openfreemap|elevation-tiles|arcgisonline/i.test(u)) return route.abort();
    // Any other external request is aborted immediately (no 86 s CDN stalls).
    if (!u.startsWith(`http://127.0.0.1:${PORT}/`) && !u.startsWith('data:')) return route.abort();
    return route.continue();
  });
  await context.addInitScript(() => { window.onbeforeunload = null; });
  page = await context.newPage();
  attachCollectors(page);

  console.log(`[SMOKE] ${SCENARIOS.length} scenarios @ ${BASE}`);
  const started = Date.now();
  for (const [name, fn] of SCENARIOS) await run(name, fn);
  console.log(`[SMOKE] ${SCENARIOS.length - failures.length}/${SCENARIOS.length} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (failures.length) { console.error('[SMOKE] FAILURES:\n - ' + failures.join('\n - ')); process.exitCode = 1; }
} catch (err) {
  console.error('[SMOKE] fatal: ' + (err && err.stack || err)); process.exitCode = 1;
} finally {
  try { if (browser) await browser.close(); } catch { /* ignore */ }
  try { await new Promise(r => server.close(r)); } catch { /* ignore */ }
  server.closeAllConnections?.();
  process.exit(process.exitCode || 0);
}
