// ANGELS ZERO — adaptive dogfight orchestra (recorded samples, no synthesis).
//
// 164 BPM, D minor. 224 short clips from Versilian VSCO 2 Community Edition (CC0), built by
// scripts/build_orch.py into assets/music/orch/ (manifest.json + <section>/*.mp3, ~3.2 MB).
// Clips are decoded at 32 kHz mono (~33 MB RAM) the first time music is needed.
//
// Four 4-bar phases, switched on the next bar (horizontal re-sequencing):
//   1 AIR SUPERIORITY  galloping spiccato strings, trumpets + violins on the theme, brass hits, snare
//   2 CANYON RUN       low cello ostinato with a half-step menace, violin tremolo, timpani heartbeat
//   3 CRIMSON ACE      trumpets in octaves, six brass hits a bar, violin runs, snare + timpani barrage
//   4 CARRIER RTB      cello melody, violins an octave up, glockenspiel, horn chords, roll into D major
// Intensity layers (vertical): level 1 PATROL thins brass and percussion; level 2+ is the full orchestra.
//
// Chain: sections -> section buses (strings / brass / perc) + concert-hall convolution ->
// phase gain -> 7 kHz air shelf -> glue compressor -> limiter -> trim -> out.
// Mastered with the bitwize-music 7-point QC (video-game-music preset, -14 LUFS / -1 dBTP) before
// the game's music bus, so phases sit at about -13 (boss) to -15 (RTB) LUFS.

const BPM = 164, S16 = 60 / BPM / 4, LOOK = 0.25;
const CH = {
  Dm: { r: 38, t: 3, l: 'Dm', timp: 'D' }, Bb: { r: 34, t: 4, l: 'Bb', timp: 'D' }, C: { r: 36, t: 4, l: 'C', timp: 'A' },
  A:  { r: 33, t: 4, l: 'A', timp: 'A' },  A7: { r: 33, t: 4, l: 'A7b9', timp: 'A', b9: true }, Eb: { r: 39, t: 4, l: 'Eb', timp: 'D' },
  F:  { r: 41, t: 4, l: 'F', timp: 'A' },  Gm: { r: 43, t: 3, l: 'Gm', timp: 'D' }, D: { r: 38, t: 4, l: 'D', timp: 'D' }
};
const TIMP = { D: 38, A: 45 };
const tone = (c, i) => [0, 7, 12, 12 + c.t, 19][i];
const ACCENT = [1, .55, .62, 1, .55, .62, 1, .55, .62, 1, .55, .62, 1, .6, 1, .66];   // 3-3-3-3-2-2 gallop
const OST    = [0, 0, 2, 0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 1, 2, 1];
const OST_LO = [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 5, 0, 0, 1, 5];                         // 5 = half-step neighbour
const THEME = {                                                                          // [midi, 16ths]
  0: [[69, 2], [74, 3], [74, 1], [76, 2], [77, 4], [76, 2], [74, 2]],
  1: [[77, 3], [74, 1], [70, 4], [74, 2], [77, 2], [79, 4]],
  2: [[79, 3], [77, 1], [76, 4], [72, 2], [76, 2], [79, 4]],
  3: [[81, 4], [82, 2], [81, 2], [79, 2], [77, 2], [76, 2], [73, 2]]                    // Phrygian-dominant run home
};
const RTB_MEL = { 0: [[65, 6], [70, 10]], 1: [[69, 12], [67, 4]], 2: [[70, 6], [74, 10]], 3: [[73, 8], [74, 8]] };
const RUN_MIN = [74, 76, 77, 79, 81, 82, 84, 86], RUN_PD = [74, 75, 78, 79, 81, 82, 84, 86];
const PH = {
  1: { name: 'AIR SUPERIORITY', prog: ['Dm', 'Bb', 'C', 'A'], gain: 1 },
  2: { name: 'CANYON RUN', prog: ['Dm', 'Dm', 'Eb', 'A7'], gain: 1.12 },
  3: { name: 'CRIMSON ACE', prog: ['Dm', 'Eb', 'C', 'A7'], gain: 0.95 },
  4: { name: 'CARRIER RTB', prog: ['Bb', 'F', 'Gm', ['A', 'D']], gain: 1.3 }
};
const SEAT = {   // section -> bus, pan, gain, hall send
  vln_spic: ['str', -0.42, 0.55, 0.30], vln_sus: ['str', -0.38, 0.55, 0.42], vln_trem: ['str', -0.4, 0.38, 0.42],
  vla_spic: ['str', -0.08, 0.5, 0.28],  vc_spic: ['str', 0.26, 0.85, 0.24],  vc_sus: ['str', 0.24, 0.6, 0.36],
  cb_spic:  ['str', 0.45, 0.7, 0.2],
  hn_stac:  ['brass', -0.2, 0.6, 0.4],  hn_sus: ['brass', -0.2, 0.62, 0.42],
  tpt_stac: ['brass', 0.12, 0.5, 0.34], tpt_sus: ['brass', 0.12, 0.5, 0.36],
  tbn_stac: ['brass', 0.3, 0.6, 0.32],  tbn_sus: ['brass', 0.3, 0.5, 0.36],  tuba_stac: ['brass', 0.4, 0.62, 0.26],
  timp_hit: ['perc', 0, 0.75, 0.3],     timp_roll: ['perc', 0, 0.55, 0.32],  bdrum: ['perc', 0.08, 0.75, 0.3],
  snare:    ['perc', -0.06, 0.32, 0.26], cym: ['perc', 0.18, 0.3, 0.42],     glock: ['perc', -0.15, 0.22, 0.5]
};
const LAYERS = { 1: { str: 0.85, brass: 0.5, perc: 0.3 }, 2: { str: 1, brass: 1, perc: 1 } };
const TRIM = 0.716, HALL = 0.3;

export function createOrchestra(ctx, out, { base = 'assets/music/orch/', rate = 32000 } = {}) {
  const BANK = {}, rrc = {};
  let loadState = 'idle', loadP = null, loaded = 0, total = 0, notes = 0;
  let step = 0, bar = 0, phase = 1, pending = null, nextT = 0, level = 0, crr = 0;

  // ---------------------------------------------------------------- graph
  const g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const sum = g(1), pg = g(PH[1].gain), air = ctx.createBiquadFilter(), glue = ctx.createDynamicsCompressor(), lim = ctx.createDynamicsCompressor(), trim = g(TRIM);
  air.type = 'highshelf'; air.frequency.value = 7000; air.gain.value = 3;
  glue.threshold.value = -16; glue.knee.value = 8; glue.ratio.value = 2.2; glue.attack.value = 0.012; glue.release.value = 0.2;
  lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
  sum.connect(pg).connect(air).connect(glue).connect(lim).connect(trim).connect(out);
  const hall = ctx.createConvolver(); hall.buffer = hallIR(2.6); hall.connect(g(HALL)).connect(sum);
  const bus = { str: g(0), brass: g(0), perc: g(0) }; for (const k in bus) bus[k].connect(sum);
  const outs = {};
  for (const [k, [b, p, gain, snd]] of Object.entries(SEAT)) {
    const ga = g(gain), s = g(snd);
    let node = ga;
    if (ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = p; ga.connect(pn); node = pn; }
    node.connect(bus[b]); node.connect(s).connect(hall); outs[k] = ga;
  }
  function hallIR(seconds) {
    const sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr), pre = Math.floor(sr * 0.02);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = pre; i < n; i++) { const t = (i - pre) / sr, w = Math.random() * 2 - 1; lp += (w - lp) * (0.12 + 0.6 * Math.exp(-t * 2)); d[i] = lp * Math.exp(-t * 2.7) * Math.min(1, t / 0.02); }
      for (const [ms, a] of [[15, 0.5], [23, 0.4], [33, 0.32], [47, 0.24], [64, 0.16]]) { const i = Math.floor(sr * (ms + (ch ? 3 : 0)) / 1000); if (i < n) d[i] += a * (ch ? -1 : 1); }
    }
    return buf;
  }

  // ---------------------------------------------------------------- samples
  function load() {
    if (loadP) return loadP;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) { loadState = 'no-decoder'; return (loadP = Promise.resolve(loadState)); }
    loadState = 'loading';
    const dec = new OAC(1, 1, rate);
    loadP = fetch(base + 'manifest.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(man => {
        total = Object.values(man).reduce((a, v) => a + v.length, 0);
        return Promise.all(Object.entries(man).flatMap(([k, list]) => { BANK[k] = []; return list.map((c, i) =>
          fetch(base + c.f).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
            .then(ab => new Promise((res, rej) => { const pr = dec.decodeAudioData(ab, res, rej); if (pr && pr.catch) pr.catch(() => {}); }))
            .then(buf => {
              const d = buf.getChannelData(0); let mx = 0; for (let j = 0; j < d.length; j++) { const a = Math.abs(d[j]); if (a > mx) mx = a; }
              let on = 0; while (on < d.length && Math.abs(d[on]) < mx * 0.02) on++;       // start on the attack (skips codec padding)
              BANK[k].push({ buf, m: c.m, i, off: Math.max(0, on / buf.sampleRate - 0.003) }); loaded++;
            })); }));
      })
      .then(() => { for (const k in BANK) BANK[k].sort((a, b) => a.i - b.i); loadState = 'ok'; return loadState; })
      .catch(e => { loadState = 'failed (' + (e && e.message ? e.message : 'error') + ')'; console.warn('[orchestra] sample load', loadState); return loadState; });
    return loadP;
  }
  function pick(key, m) {
    const L = BANK[key]; if (!L || !L.length) return null;
    rrc[key] = (rrc[key] || 0) + 1;
    if (m == null || L[0].m == null) return L[rrc[key] % L.length];
    let best = Infinity; for (const s of L) best = Math.min(best, Math.abs(s.m - m));
    const c = L.filter(s => Math.abs(s.m - m) - best < 0.01);
    return c[rrc[key] % c.length];
  }

  // ---------------------------------------------------------------- performance
  const hum = () => (Math.random() - 0.5) * 0.008;
  const vr = () => 0.93 + Math.random() * 0.14;
  function play(key, m, t, o = {}) {
    const s = o.idx != null ? (BANK[key] || [])[o.idx] : pick(key, m); if (!s) return;
    t = Math.max(t + (o.dt || 0), ctx.currentTime);
    const src = ctx.createBufferSource(); src.buffer = s.buf;
    const r = (m == null || s.m == null) ? 1 : Math.pow(2, (m - s.m) / 12); src.playbackRate.value = r;
    const ga = ctx.createGain(), v = o.vel == null ? 1 : o.vel;
    if (o.atk) { ga.gain.setValueAtTime(0.0001, t); ga.gain.linearRampToValueAtTime(v, t + o.atk); } else ga.gain.setValueAtTime(v, t);
    src.connect(ga).connect(outs[key]);
    const len = (s.buf.duration - s.off) / r;
    src.start(t, s.off); notes++;
    if (o.dur != null && o.dur < len) { const rel = o.rel || 0.1; ga.gain.setTargetAtTime(0, t + o.dur, rel / 3); src.stop(t + o.dur + rel * 2.5); }
    else src.stop(t + len + 0.01);
  }
  const chord3 = (c, b) => [b, b + 7, b + 12];
  function line(sus, stac, mel, t, vel, { oct = 0, dbl = false } = {}) {     // legato: sustain sample for 3+ sixteenths
    let at = t;
    for (const [m0, len] of mel) {
      const m = m0 + oct, d = len * S16, k = vel * vr();
      if (len >= 3) play(sus, m, at, { vel: k, dur: d + 0.035, rel: 0.12, dt: hum() }); else play(stac, m, at, { vel: k * 0.95, dt: hum() });
      if (dbl) { if (len >= 3) play(sus, m, at, { vel: k * 0.7, dur: d + 0.035, rel: 0.12, dt: 0.011 }); else play(stac, m, at, { vel: k * 0.65, dt: 0.011 }); }
      at += d;
    }
  }
  function brassHit(t, c, k) {
    chord3(c, c.r + 12).forEach((m, i) => play('tbn_stac', m, t, { vel: k * (i === 2 ? 0.8 : 1) * vr(), dt: hum() }));
    play('tuba_stac', c.r, t, { vel: k * vr(), dt: hum() });
    [c.r + 12, c.r + 19].forEach(m => play('hn_stac', m, t, { vel: k * 0.85 * vr(), dt: hum() }));
  }
  const timp = (t, drum, k) => play('timp_hit', TIMP[drum], t, { vel: k * vr(), dt: hum() });
  const snare = (t, k) => play('snare', null, t, { vel: k * vr(), dt: hum() * 0.5 });
  const crash = (t, k = 1) => play('cym', null, t, { vel: k, idx: crr++ % 2 });   // cym[0..1] crashes, cym[2] suspended roll
  const swell = (t, k = 1) => play('cym', null, t, { vel: k, idx: 2 });
  function ostinato(t, c, st, k, pat = OST) {
    const acc = ACCENT[st], idx = pat[st], m = idx === 5 ? c.r + 13 : c.r + 12 + tone(c, idx);
    play('vc_spic', m, t, { vel: k * acc * vr(), dt: hum() });
    play('vla_spic', m + 12, t, { vel: k * 0.75 * acc * vr(), dt: hum() });
  }
  const chordAt = (p, b4, st) => { const e = PH[p].prog[b4]; return CH[Array.isArray(e) ? e[st < 8 ? 0 : 1] : e]; };

  const SCORE = {
    1(t, st, b4, c, n) {
      ostinato(t, c, st, 1);
      if (ACCENT[st] === 1) play('cb_spic', c.r, t, { vel: 0.9 * vr(), dt: hum() });
      if (st === 0) { line('tpt_sus', 'tpt_stac', THEME[b4], t, 0.85, { oct: -12, dbl: true }); line('vln_sus', 'vln_spic', THEME[b4], t, 0.6); }
      if (st === 0 || st === 10) brassHit(t, c, st === 0 ? 0.95 : 0.75);
      if (b4 === 3 && st === 12) [69, 73, 76].forEach(m => play('tpt_stac', m, t, { vel: 0.7 * vr(), dt: hum() }));
      const sn = [0, .25, 0, .3, 1, 0, .25, 0, 0, .3, 0, .25, 1, .3, 0, .35][st]; if (sn) snare(t, sn);
      if (b4 === 3 && st >= 8) [0, 0.5].forEach(h => snare(t + h * S16, 0.35 + 0.65 * (st - 8 + h) / 8));
      if (st === 0 || st === 6 || st === 12) timp(t, c.timp, st === 0 ? 1 : 0.75);
      if (st === 0 || st === 10) play('bdrum', null, t, { vel: st === 0 ? 0.9 : 0.6 });
      if (st === 0 && b4 === 0 && n > 0) crash(t, 0.85);
    },
    2(t, st, b4, c) {
      ostinato(t, c, st, 0.85, OST_LO);
      if (st % 4 === 0) play('cb_spic', c.r, t, { vel: 0.75 * vr(), dt: hum() });
      if (st === 0) {
        [c.r + 43, c.r + 36 + c.t].forEach(m => play('vln_trem', m, t, { vel: b4 === 3 ? 0.85 : 0.65, atk: 0.18, dur: 16 * S16 + 0.04, rel: 0.2 }));
        if (b4 >= 2) [c.r + 12, c.r + 19].forEach(m => play('hn_sus', m, t, { vel: 0.7, atk: 0.5, dur: 16 * S16, rel: 0.3 }));
        if (b4 === 3) { play('tbn_sus', c.r + 12, t, { vel: 0.6, atk: 0.4, dur: 16 * S16, rel: 0.3 }); swell(t, 0.5); }
        if (b4 === 0) play('bdrum', null, t, { vel: 0.6 });
      }
      if (st === 0 || st === 8) timp(t, c.timp, 0.85);
      if (st === 3 || st === 11) timp(t, c.timp, 0.45);
    },
    3(t, st, b4, c, n) {
      ostinato(t, c, st, 1.05);
      if (st % 2 === 0) play('cb_spic', c.r, t, { vel: 0.95 * vr(), dt: hum() });
      if (st === 0) {
        line('tpt_sus', 'tpt_stac', THEME[b4], t, 1, { dbl: true });
        line('tpt_sus', 'tpt_stac', THEME[b4], t, 0.75, { oct: -12 });
        if (b4 === 0 || b4 === 2) line('vln_sus', 'vln_spic', THEME[b4], t, 0.7);
      }
      if ((b4 === 1 || b4 === 3) && st >= 8) play('vln_spic', (c.b9 || c === CH.Eb ? RUN_PD : RUN_MIN)[st - 8], t, { vel: (0.6 + (st - 8) * 0.05) * vr(), dt: hum() });
      if ([0, 3, 6, 8, 11, 14].includes(st)) brassHit(t, c, st % 8 === 0 ? 1 : 0.8);
      snare(t, [.8, .3, .5, .3, 1, .3, .5, .35, .8, .3, .5, .3, 1, .4, .6, .4][st]);
      if (b4 === 3 && st >= 8) snare(t + S16 / 2, 0.4 + 0.6 * (st - 8) / 8);
      if ([0, 3, 6, 9, 12, 14].includes(st)) timp(t, [0, 6, 12].includes(st) ? c.timp : (c.timp === 'D' ? 'A' : 'D'), st % 6 === 0 ? 1 : 0.8);
      if ([0, 6, 8, 14].includes(st)) play('bdrum', null, t, { vel: st === 0 ? 1 : 0.7 });
      if (st === 0 && (b4 === 2 || (b4 === 0 && n > 0))) crash(t, b4 === 0 ? 1 : 0.7);
    },
    4(t, st, b4, c) {
      const half = Array.isArray(PH[4].prog[b4]);
      if (st === 0 || (half && st === 8)) {
        const d = (half ? 8 : 16) * S16 + 0.05;
        [c.r + 24 + c.t, c.r + 31].forEach(m => play('vln_sus', m, t, { vel: 0.45, atk: 0.15, dur: d, rel: 0.3 }));
        play('vc_sus', c.r, t, { vel: 0.6, atk: 0.1, dur: d, rel: 0.3 });
        [c.r + 12, c.r + 19].forEach(m => play('hn_sus', m, t, { vel: 0.55, atk: 0.2, dur: d, rel: 0.35 }));
        play('tbn_sus', c.r + 12, t, { vel: 0.3, atk: 0.3, dur: d, rel: 0.4 });
      }
      if (st === 0) {
        line('vc_sus', 'vc_spic', RTB_MEL[b4], t, 0.85, { dbl: true });
        line('vln_sus', 'vln_spic', RTB_MEL[b4], t, 0.55, { oct: 12 });
        let at = t; for (const [m, l] of RTB_MEL[b4]) { play('glock', m + 12, at, { vel: 0.7 }); at += l * S16; }
        play('bdrum', null, t, { vel: b4 === 0 ? 0.8 : 0.6 });
        if (b4 === 0) timp(t, 'D', 0.6);
        if (b4 === 3) { play('timp_roll', TIMP.A, t, { vel: 0.7, atk: 0.6, dur: 16 * S16, rel: 0.3 }); swell(t, 0.55); }
      }
    }
  };

  // ---------------------------------------------------------------- conductor
  function applyLayers(t) {
    const L = (level >= 2 || phase >= 2) ? LAYERS[2] : LAYERS[1];
    for (const k in bus) bus[k].gain.setTargetAtTime(level > 0 ? L[k] : 0, t, 0.6);
  }
  function scheduleStep(t) {
    if (step === 0 && pending) {
      phase = pending; pending = null; bar = 0;
      pg.gain.setTargetAtTime(PH[phase].gain, t, 0.06); applyLayers(t);
      crash(t, 0.9); play('bdrum', null, t, { vel: 1 });
    }
    const b4 = bar % 4;
    SCORE[phase](t, step, b4, chordAt(phase, b4, step), bar);
  }
  // Called from audio.js every 25 ms and every frame; live = music on and some level requested (or fading out).
  function tick(live) {
    if (loadState !== 'ok' || ctx.state !== 'running') return;
    if (!live) { nextT = 0; return; }
    const now = ctx.currentTime;
    if (nextT === 0 || nextT < now - 0.2) {                 // (re)start on a downbeat, or recover after a stall
      nextT = now + 0.08; step = 0; bar = 0; pending = null;
      pg.gain.setValueAtTime(PH[phase].gain, now); applyLayers(now);
    }
    while (nextT < now + LOOK) { scheduleStep(nextT); nextT += S16; if (++step === 16) { step = 0; bar++; } }
  }
  // Target phase (1-4) and intensity level (0 off, 1 patrol, 2 furball, 3 climax). Phase changes land on the next bar.
  function setState(p, lvl) {
    p = Math.min(4, Math.max(1, p | 0));
    if (lvl !== level) { level = lvl; applyLayers(ctx.currentTime); }
    if (nextT === 0) { phase = p; pending = null; }
    else if (p !== phase && p !== pending) pending = p;
    else if (p === phase) pending = null;
  }
  return {
    load, tick, setState,
    get ready() { return loadState === 'ok'; },
    get debug() {
      return { load: loadState, samples: loaded + '/' + total, phase, phaseName: PH[phase].name, pending, level,
        bar: (bar % 4) + 1, step, notes, bus: Object.fromEntries(Object.entries(bus).map(([k, n]) => [k, +n.gain.value.toFixed(2)])),
        ahead: nextT ? +(nextT - ctx.currentTime).toFixed(3) : 0 };
    }
  };
}
