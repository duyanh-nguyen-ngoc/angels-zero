// ANGELS ZERO — deterministic headless Chromium smoke suite.
// Zero repo dependencies: Playwright is imported dynamically (CI installs it with
// `npm i --no-save playwright`), and the static server uses only Node built-ins.
// Run from anywhere:   node angel-zero/scripts/smoke_test.mjs
// Optional:            SMOKE_PORT=8791 node angel-zero/scripts/smoke_test.mjs
//
// Software-GL shader compilation on CI can block the page's main thread for over
// a minute on a cold load, so the suite does ONE full page load and drives every
// scenario from there via debug helpers (__az.setMission / toMenu / launchSortie).
// three.js r160 is fulfilled from repo-root smoke_vendor/ so CI never hits unpkg.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // angel-zero/
const VENDOR = path.resolve(ROOT, '..', 'smoke_vendor');                          // repo root
const PORT = Number(process.env.SMOKE_PORT) || 8791;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
// Release consistency: the chip shown in-game must match PATCH_NOTES[0].version.
const patchSrc = fs.readFileSync(path.join(ROOT, 'src', 'patchnotes.js'), 'utf8');
const versionMatch = patchSrc.match(/version:\s*'(v\d+\.\d+\.\d+)'/);
const RELEASE_VERSION = versionMatch ? versionMatch[1] : '';

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

async function navigate(query, waitReady = true) {
  resetCollectors();
  const qs = query.includes('nowarm') ? query : `${query}&nowarm`;
  const t0 = Date.now();
  await page.goto(`${BASE}?${qs}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  console.log(`    [nav] domcontentloaded in ${Date.now() - t0} ms`);
  // Menu-boot checks only need the debug object (set during module evaluation),
  // not the full GLB/WebGL boot — navigating away immediately saves a cold boot.
  if (!waitReady) {
    await page.waitForFunction(() => typeof window.__az === 'object', null, { polling: 100, timeout: 30000 });
    return;
  }
  try {
    // Interval polling survives rAF starvation during first-frame shader compilation on CI.
    await page.waitForFunction(() => window.__az && window.__az.ready === true, null, { polling: 250, timeout: 360000 });
    console.log(`    [nav] __az.ready in ${Date.now() - t0} ms`);
    // The boot HUD fades and removes itself once the model is ready.
    await page.waitForFunction(() => !document.getElementById('status'), null, { polling: 100, timeout: 180000 });
    const boot = await page.evaluate(() => ({ ms: window.__az.bootMs, ac: window.__az.aircraft }));
    console.log(`    [boot] bootMs=${boot.ms} ms aircraft=${boot.ac}`);
    // On a warm local server boot should be well under 15 s; CI's software GL is much slower.
    if (!process.env.CI) assert(boot.ms > 0 && boot.ms < 30000, `bootMs ${boot.ms} ms exceeds 30000 ms locally`);

  } catch (e) {
    let st = {};
    try { st = await page.evaluate(() => ({ az: typeof window.__az, ready: window.__az?.ready,
      chip: document.getElementById('buildChip')?.textContent })); } catch { /* gone */ }
    console.log('    [nav] DIAG ' + JSON.stringify(st).slice(0, 600));
    console.log('    [nav] console tail ' + JSON.stringify(consoleMessages.slice(-10)).slice(0, 900));
    console.log('    [nav] pageErrors ' + JSON.stringify(pageErrors.slice(-4)).slice(0, 900));
    throw e;
  }
}
async function missionReady(id) {
  await page.waitForFunction(mid => {
    const a = window.__az;
    return a && a.ready && a.sortie && a.sortie.active && a.missionId === mid;
  }, id, { polling: 250, timeout: 120000 });
}
async function switchMission(id) {
  // Fire-and-forget: startSortie() is async; missionReady() has a hard timeout.
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
    // ONE full page load for the whole suite: F-22A airframe + warp line + first mission.
    await navigate('debug&nointro&nobgm&warp=3&aircraft=F22A&mission=AIR_SUPERIORITY');
    await missionReady('AIR_SUPERIORITY');
    // Return to the hangar through the real menu path, then relaunch for combat.
    await page.evaluate(() => window.__az.toMenu());
    const s = await page.evaluate(() => ({ mode: window.__az.appMode,
      chip: document.getElementById('buildChip')?.textContent || '' }));
    assert(s.mode === 'MENU', `appMode ${s.mode} !== MENU`);
    assert(/^v\d+\.\d+\.\d+$/.test(s.chip), `buildChip "${s.chip}" is not a version`);
    assert(/^v\d+\.\d+\.\d+$/.test(RELEASE_VERSION), `PATCH_NOTES[0].version "${RELEASE_VERSION}" is not semver`);
    assert(s.chip === RELEASE_VERSION, `buildChip "${s.chip}" != PATCH_NOTES[0].version "${RELEASE_VERSION}"`);
    assert(await glError() === 0, 'WebGL error on menu boot');
    await page.evaluate(() => window.__az.launchSortie());
    await missionReady('AIR_SUPERIORITY');
  }],

  ['Mission AIR_SUPERIORITY', async () => { await assertMission('AIR_SUPERIORITY'); }],

  // Keep the F-22A / AIR_SUPERIORITY page alive for the camera + wingman checks —
  // switching away and back costs ~65 s on the GPU-less CI runner.
  ['F-22A + cockpit + nose camera cycle', async () => {
    await page.evaluate(() => window.__az.setView(false));   // normalise to CHASE
    let s = await page.evaluate(() => ({ ac: window.__az.aircraft, cam: window.__az.camMode }));
    assert(s.ac === 'F22A', `aircraft ${s.ac}`);
    assert(s.cam === 'CHASE', `initial camera ${s.cam}`);
    for (const expected of ['COCKPIT', 'NOSE', 'CHASE']) {
      await page.keyboard.press('Space');
      await page.waitForFunction(m => window.__az?.camMode === m, expected, { polling: 250, timeout: 90000 });
      assert(await glError() === 0, `WebGL error after switching to ${expected}`);
    }
  }],

  ['Wingman BTT + order break', async () => {
    await page.evaluate(() => window.__az.setWingOrder(2));
    // Let the BTT integrator run a few frames; the actual assertion is on finite physics state
    // and the persisted order (a non-FORM mode depends on an AI target that may not exist).
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => ({ order: window.__az.combat.wingOrder,
      ok: window.__az.wingmen.every(w => w.pos.toArray().every(Number.isFinite) && Number.isFinite(w.speed)),
      gl: window.__az.renderer.getContext().getError() }));
    assert(s.ok, 'non-finite wingman state');
    assert(s.gl === 0, 'WebGL error');
    assert(s.order === 2, `wing order ${s.order} !== 2`);
  }],

  ['Mission NAVAL_BATTLE', async () => { await switchMission('NAVAL_BATTLE'); await assertMission('NAVAL_BATTLE'); }],
  ['Mission CANYON_RUN', async () => { await switchMission('CANYON_RUN'); await assertMission('CANYON_RUN'); }],
  ['Mission ACE_DUEL', async () => { await switchMission('ACE_DUEL'); await assertMission('ACE_DUEL'); }],

  ['Ace BFM + countermeasure states', async () => {
    // Already on ACE_DUEL — no switch needed.
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

  ['Mission FURBALL', async () => { await switchMission('FURBALL'); await assertMission('FURBALL'); }],
  ['Mission FREE_FLIGHT', async () => { await switchMission('FREE_FLIGHT'); await assertMission('FREE_FLIGHT'); }],

  ['Free Flight attribution', async () => {
    await page.waitForFunction(() => { const e = document.getElementById('ffAttrib'); return e && !e.hidden; }, null, { polling: 250, timeout: 60000 });
    const on = await page.evaluate(() => ({ text: document.getElementById('ffAttrib').textContent, gl: window.__az.renderer.getContext().getError() }));
    assert(/OpenStreetMap/.test(on.text) && /Esri/.test(on.text), `attribution text: ${on.text}`);
    assert(on.gl === 0, 'WebGL error with attribution badge');
    await switchMission('AIR_SUPERIORITY');
    await page.waitForFunction(() => document.getElementById('ffAttrib').hidden, null, { polling: 250, timeout: 60000 });
  }],

  ['Training sortie boot', async () => {
    await switchMission('TRAINING');
    const s = await page.evaluate(() => ({ active: window.__az.training.active, step: window.__az.training.step,
      total: window.__az.training.total, mcfg: !!window.__az.combatSys, gl: window.__az.renderer.getContext().getError() }));
    assert(s.active === true && s.step === 1 && s.total === 6, `training boot: ${JSON.stringify(s)}`);
    assert(s.gl === 0, 'WebGL error on training boot');
    await page.evaluate(() => window.__az.jumpTraining(3));
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__az.training.step >= 4, null, { polling: 250, timeout: 60000 });
    const t = await page.evaluate(() => ({ step: window.__az.training.step, gl: window.__az.renderer.getContext().getError() }));
    assert(t.step === 4, `camera step did not advance: ${t.step}`);
    assert(t.gl === 0, 'WebGL error during training camera step');
  }],

  ['Gamepad / touch controls', async () => {
    await page.evaluate(() => window.__az.inputExt.setTouchTest(true));
    await page.waitForFunction(() => { const e = document.getElementById('touchHUD'); return e && e.style.display === 'block'; }, null, { polling: 250, timeout: 30000 });
    const s = await page.evaluate(() => ({ vis: document.getElementById('touchHUD').style.display,
      active: window.__az.inputExt.active, gl: window.__az.renderer.getContext().getError() }));
    assert(s.vis === 'block', `touch HUD hidden: ${s.vis}`);
    assert(s.active === true, 'inputExt not active with touch enabled');
    assert(s.gl === 0, 'WebGL error with touch HUD');
    const press = await page.evaluate(() => {
      const b = document.querySelector('#touchHUD button[data-act="Fire"]');
      b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, bubbles: true, cancelable: true }));
      return window.__az.keys.fire;
    });
    const release = await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 77, bubbles: true, cancelable: true }));
      return window.__az.keys.fire;
    });
    assert(press === true, 'touch GUN button did not press');
    assert(release === false, 'touch GUN button stuck after release');
    await page.evaluate(() => window.__az.inputExt.setTouchTest(false));
  }],

  ['Deterministic warp telemetry audit', async () => {
    assert(warpLogLine.startsWith('[ANGELS_ZERO] warp'), 'no [ANGELS_ZERO] warp log line');
    assert(!/NaN|undefined/i.test(warpLogLine), `warp line has NaN/undefined: ${warpLogLine.slice(0, 240)}`);
  }],

  ['Pit stop rearm / repair', async () => {
    await switchMission('AIR_SUPERIORITY');
    await page.evaluate(() => {
      const a = window.__az;
      a.placeOnRunway(1400);
      a.state.groundSpeed = 8 / 1.94384; a.state.speed = a.state.groundSpeed;
      a.state.velocity.set(0, 0, 0); a.state.throttle = 0;
      a.combat.health = 45; a.combat.missiles = 0; a.state.fuel = 4000;
    });
    await page.evaluate(() => { for (let i = 0; i < 320; i++) window.__az.stepSim(1 / 60); });
    const s = await page.evaluate(() => ({ done: window.__az.state.pit.done, active: window.__az.state.pit.active,
      health: window.__az.combat.health, msl: window.__az.combat.missiles, fuel: window.__az.state.fuel,
      gl: window.__az.renderer.getContext().getError() }));
    assert(s.done === true && s.active === false, `pit not completed: ${JSON.stringify(s)}`);
    assert(s.health === 100, `health ${s.health} !== 100`);
    assert(s.msl > 0, `missiles ${s.msl} not rearmed`);
    assert(s.fuel > 13000, `fuel ${s.fuel} not refilled`);
    assert(s.gl === 0, 'WebGL error during pit stop');
  }],

  ['Debrief screen', async () => {
    await page.evaluate(() => window.__az.endSortie('CLEARED'));
    await page.waitForFunction(() => window.__az?.debrief === true, null, { polling: 250, timeout: 60000 });
    const s = await page.evaluate(() => ({ rank: document.getElementById('dbRank')?.textContent?.trim() || '',
      stats: document.getElementById('dbStats')?.innerHTML?.trim() || '',
      gl: window.__az.renderer.getContext().getError() }));
    assert(s.rank.length > 0, 'dbRank empty');
    assert(s.stats.length > 0, 'dbStats empty');
    assert(s.gl === 0, 'WebGL error');
    assert(await page.evaluate(() => !!document.getElementById('dbShareBtn')), 'dbShareBtn missing');
    await page.evaluate(() => document.getElementById('dbShareBtn').click());
  }],

  ['Pilot profile code round-trip', async () => {
    const r = await page.evaluate(async () => {
      const code = await window.__az.profileSync.exportPilotCode();
      const before = window.__az.profileSync.collectPilotSnapshot();
      const res = await window.__az.profileSync.importPilotCode(code);
      const after = window.__az.profileSync.collectPilotSnapshot();
      return { prefix: code.slice(0, 5), len: code.length, ok: res.ok, reason: res.reason || '',
        beforeKeys: Object.keys(before.keys).length, afterKeys: Object.keys(after.keys).length,
        id: window.__az.profileSync.getSyncId(), gl: window.__az.renderer.getContext().getError() };
    });
    assert(r.prefix === 'AZP1:', `bad pilot code prefix ${r.prefix}`);
    assert(r.ok === true, `pilot code import failed: ${r.reason} (len=${r.len})`);
    assert(/^AZ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(r.id), `bad sync id ${r.id}`);
    assert(r.afterKeys >= r.beforeKeys, `keys lost: ${r.beforeKeys} -> ${r.afterKeys}`);
    assert(r.gl === 0, 'WebGL error during pilot restore');
  }],

  ['Shared replay link', async () => {
    const token = await page.evaluate(async () => window.__az.encodeReplay({
      callsign: 'WARDEN-1', mission: 'AIR_SUPERIORITY', aircraft: 'F22A', rank: 'A',
      score: 12345, kills: 3, timeS: 420, outcome: 'CLEARED'
    }, [{ x: 0, z: 0 }, { x: 120, z: -80 }, { x: 240, z: -160 }],
       [{ kind: 'KILL', x: 120, z: -80, t: 30 }]));
    assert(typeof token === 'string' && token.length > 20 && token.length < 2000, `bad replay token: ${token}`);
    // Reuse the live page: decoding + opening the shared debrief is the same path
    // the ?replay boot hook takes, without paying for a second cold WebGL boot in CI.
    await page.evaluate(async t => {
      const r = await window.__az.decodeReplay(t);
      if (r) window.__az.openSharedReplay(r);
    }, token);
    await page.waitForFunction(() => window.__az?.debrief === true, null, { polling: 250, timeout: 60000 });
    const s = await page.evaluate(() => ({
      title: document.getElementById('dbTitle')?.textContent || '',
      rank: document.getElementById('dbRank')?.textContent || '',
      gl: window.__az.renderer.getContext().getError()
    }));
    assert(/SHARED REPLAY/.test(s.title), `shared replay title: ${s.title}`);
    assert(s.rank.length > 0, 'shared replay rank empty');
    assert(s.gl === 0, 'WebGL error on shared replay');
  }]
];

/* ------------------------------------------------------------------------------ main */
try {
  await listen(); await waitForServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-sandbox']
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
    // Any other external request is aborted immediately (no long CDN stalls).
    if (!u.startsWith(`http://127.0.0.1:${PORT}/`) && !u.startsWith('data:')) return route.abort();
    return route.continue();
  });
  await context.addInitScript(() => { window.onbeforeunload = null; });
  page = await context.newPage();
  attachCollectors(page);

  console.log(`[SMOKE] ${SCENARIOS.length} scenarios @ ${BASE}`);
  const started = Date.now();
  for (const [name, fn] of SCENARIOS) await run(name, fn);
  // Local-only airframe comparison: CI already spends minutes on one cold boot.
  if (!process.env.CI) {
    try {
      await page.close();                       // free the software-GL context before a second cold boot
      const p2 = await context.newPage();
      await p2.goto(`${BASE}?debug&nointro&nobgm&nowarm&mission=AIR_SUPERIORITY`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await p2.waitForFunction(() => window.__az?.ready === true, null, { polling: 250, timeout: 120000 });
      await p2.waitForFunction(() => !document.getElementById('status'), null, { polling: 100, timeout: 60000 });
      const b = await p2.evaluate(() => ({ ms: window.__az.bootMs, ac: window.__az.aircraft, status: !!document.getElementById('status') }));
      console.log(`    [boot] F15C bootMs=${b.ms} ms  statusRemoved=${!b.status}`);
      if (b.ac !== 'F15C') failures.push(`F15C boot sample: aircraft ${b.ac}`);
      if (b.ms >= 30000) failures.push(`F15C bootMs ${b.ms} ms exceeds 30000 ms locally`);
      await p2.close();
    } catch (e) { failures.push('F15C boot sample: ' + String(e && e.message || e).slice(0, 200)); }
  }
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
