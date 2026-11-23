// ANGELS ZERO — procedural Web Audio synthesis (no audio files).
// Twin F100 turbine + afterburner roar, M61 "brrrt", AIM-9 seeker growl / lock
// tone, missile launch whoosh, ALR-56C RWR chirps + launch warble, ALQ-135 ECM
// buzz, sub-bass explosions,
// bomb-rack clunk, falling-bomb whistle, detonation rumble, flare pop / sizzle.
// Engines, buffet, G-strain breathing / heartbeat and the over-G chime also use
// real recorded samples from assets/sfx/ (see CREDITS.md), decoded with
// decodeAudioData and modulated live; any file that fails to load falls back
// to the procedural layers below. A master "hearing tunnel" low-pass sweeps
// 12 kHz -> 550 Hz as the pilot approaches G-LOC.

import { MISSIONS } from './missions.js?v=s9bf';

export function createAudio() {
  let ctx = null, master = null, cockpitLP = null, ready = false;
  let volume = 0.7, muted = false, musicVol = 1;
  // Volume persists; MUTE does not -- a mute pressed in an earlier session (M on the
  // briefing) used to silence every later sortie. Every session starts unmuted, and
  // a stored volume of ~0 falls back to the default.
  try { const v = parseFloat(localStorage.getItem('az_volume')); if (!Number.isNaN(v) && v >= 0.05) volume = Math.min(1, v); localStorage.removeItem('az_muted'); } catch (e) { /* storage unavailable */ }
  // Independent music-bed level (Controls & Audio slider). New key; all legacy keys stay intact.
  try { const mv = parseFloat(localStorage.getItem('angelsZero_musicVol')); if (!Number.isNaN(mv) && mv >= 0 && mv <= 1) musicVol = mv; } catch (e) { /* storage unavailable */ }

  const N = {};                                            // live nodes
  let sprayK = 0, sprayKt = 0;                             // sea-skim DSP targets (scalars only)
  // --- streamed scenario soundtrack -------------------------------------------------
  const BGM_DIR = 'assets/audio/bgm/', XFADE = 1.5, DUCK_DB = -5, DUCK_GAIN = 0.5623, DUCK_T = 0.25, MIN_DWELL = 4.0;
  const BGM_OK = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
  const decks = [];                                        // two reusable MediaElementAudioSourceNodes
  const sinCurve = new Float32Array(64), cosCurve = new Float32Array(64);
  for (let i = 0; i < 64; i++) { const t = i / 63 * Math.PI / 2; sinCurve[i] = Math.sin(t); cosCurve[i] = Math.cos(t); }
  const lastIdx = Object.create(null);                     // scenario -> last track index
  const bag = Object.create(null), bagPos = Object.create(null);  // per-scenario shuffle bags
  let manifest = null, active = 0, curScn = '01_hangar', pendScn = '', dwell = 0, bgmUnlocked = false, lastTickT = 0, switchSeq = 0;
  let bgmForce = '', bgmCtx = null, currentIdx = 0;
  let auto = true, manualId = -1, advancing = false, advTimer = null, changeCb = null, changeKey = '';
  // Streamed-BGM startup state. All scalars: no allocation on any frame.
  let manifestReady = false, manifestRetries = 0, pendingScn = null, pendingForce = false;
  let unlocked = false, playConfirmed = false, retryT = 0, bgmRetries = 0;
  let bgmPausedByUser = false, gestureArmed = false;
  let cScn = '', cIdx = 0, cIdle = 0, cSeq = 0, loading = false; // pending crossfade commit (applied on 'playing')
  const BGM_RETRY_S = 1.5, BGM_RETRY_MAX = 6;
  const GESTURES = ['pointerdown', 'keydown', 'click', 'touchend'];
  const BGM_KEYS = ['01_hangar', '02_catapult', '03_air_superiority', '04_storm', '05_night',
    '06_strike', '07_canyon', '08_crimson_duel', '09_furball', '10_last_stand', '11_rtb', '12_debrief'];
  const RESOLVER_KEYS = BGM_KEYS;                          // resolver literals + c.bgmScenario values
  const radioBufs = Object.create(null);                   // decoded voice clips, cached by line id
  const radioState = { plays: 0, lastId: '', loaded: 0, playing: false };
  const tc = 0.06;                                         // param smoothing time-constant
  // --- military radio comms chain (built once, reused for every transmission) ---
  const PTT_OPEN_S = 0.06, PTT_TAIL_S = 0.09, DUCK_ATK = 0.2, DUCK_REL = 0.4, FADE_S = 0.4;
  const STATIC_DB = 0.01, RADIO_DUCK = 0.5623;            // -40 dB static bed, -5 dB music duck
  const makeCurve = k => { const c = new Float32Array(1024), d = Math.tanh(k); for (let i = 0; i < 1024; i++) { const x = i / 1023 * 2 - 1; c[i] = Math.tanh(k * x) / d; } return c; };
  const CURVE_SOFT = makeCurve(2), CURVE_HEAVY = makeCurve(8);
  const RADIO_CH = {
    AWACS:   { hp: 300, lp: 3200, curve: CURVE_SOFT, drive: 0.9, pan: 0, ring: 0, col: '#3fd8ff', tag: 'AWACS // OVERLORD' },
    WARDEN2: { hp: 380, lp: 2700, curve: CURVE_SOFT, drive: 1.1, pan: -0.25, ring: 0, col: '#00ff66', tag: 'WARDEN-2' },
    WARDEN3: { hp: 380, lp: 2700, curve: CURVE_SOFT, drive: 1.1, pan: 0.25, ring: 0, col: '#00ff66', tag: 'WARDEN-3' },
    CRIMSON: { hp: 360, lp: 2900, curve: CURVE_HEAVY, drive: 1.6, pan: 0, ring: 0.22, col: '#ff2a3a', tag: 'CRIMSON-1 // INTERCEPT' },
    DEFAULT: { hp: 340, lp: 2900, curve: CURVE_SOFT, drive: 1, pan: 0, ring: 0, col: '#00ff66', tag: 'COMMS' }
  };
  let rxState = 'IDLE', rxT = 0, rxCur = null;

  function noiseBuffer(kind, seconds = 4) {
    const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {                         // Paul Kellet's pink filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }   // brown
    }
    return buf;
  }
  function loopNoise(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 2); return s; }
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  const set = (p, v, t = tc) => p.setTargetAtTime(v, ctx.currentTime, t);
  const sm = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------- recorded samples */
  // Fetched + decoded at page load (OfflineAudioContext), so they are ready the
  // moment the LAUNCH click creates the live AudioContext.
  // (the F100 engine is fully synthesized -- no turbine file is requested)
  const SFX = { buffet: 'airframe_buffet.mp3', breath: 'gloc_breathing_heartbeat.mp3', chime: 'gloc_warning_chime.mp3' };
  const samples = {}, sfxState = {};
  function preload(base = 'assets/sfx/') {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) { for (const k in SFX) sfxState[k] = 'no-decoder'; return Promise.resolve(sfxState); }
    const dec = new OAC(1, 1, 44100);
    return Promise.all(Object.entries(SFX).map(([k, file]) => {
      sfxState[k] = 'loading';
      return fetch(base + file).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        // Static hosts may answer a missing file with the HTML index page (200): treat it as missing.
        if (/text\/html/i.test(r.headers.get('content-type') || '')) throw new Error('missing (html)');
        return r.arrayBuffer();
      })
        .then(ab => new Promise((res, rej) => { const pr = dec.decodeAudioData(ab, res, rej); if (pr && pr.catch) pr.catch(() => {}); }))
        .then(buf => { samples[k] = buf; sfxState[k] = 'ok ' + buf.duration.toFixed(1) + 's'; })
        .catch(e => { sfxState[k] = 'fallback (' + (e && e.message ? e.message : 'decode error') + ')'; });
    })).then(() => sfxState);
  }

  // Procedural PTT one-shots rendered once into AudioBuffers (no per-event DSP allocation).
  function pttBuffer(kind) {
    const dur = kind === 'open' ? PTT_OPEN_S : PTT_TAIL_S;
    const len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let lp = 0, phase = 0, seed = 12345;
    const a = 1 - Math.exp(-2 * Math.PI * (kind === 'open' ? 2200 : 1800) / ctx.sampleRate);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const n = seed / 2147483648 - 1;
      lp += a * (n - lp);
      const bp = n - lp;
      if (kind === 'open') {
        const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.016);
        phase += 2 * Math.PI * (1800 + 800 * Math.min(1, t / 0.018)) / ctx.sampleRate;
        d[i] = 0.19 * bp * env + 0.12 * Math.sin(phase) * env;
      } else {
        const env = Math.exp(-t / 0.028);
        const blip = t > dur - 0.01 ? Math.min(1, (t - dur + 0.01) / 0.002) : 0;
        phase += 2 * Math.PI * 1000 / ctx.sampleRate;
        d[i] = 0.16 * bp * env + 0.08 * Math.sin(phase) * blip;
      }
    }
    return buf;
  }

  function init() {
    if (ready) { resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    // A suspended context (tab hidden / OS audio change) must re-arm the gesture
    // retry, otherwise a later click cannot restart a paused deck.
    ctx.onstatechange = () => {
      if (ctx.state === 'suspended') armUnlock();
      else if (pendingScn) switchTo(pendingScn, true);     // deferred scenario finally can play
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) armUnlock(); });
    master = gain(muted ? 0 : volume);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    cockpitLP = filt('lowpass', 18000, 0.5);                // canopy muffles the outside world in first person
    // G-LOC hearing tunnel: master low-pass, 12 kHz open -> 550 Hz near blackout.
    N.tunnel = filt('lowpass', 12000, 0.5);
    // Slow-mo bass drop: whole-world low-pass + 90 Hz shelf, swept open again on recovery.
    N.slowLP = filt('lowpass', 20000, 0.7);
    N.slowShelf = ctx.createBiquadFilter(); N.slowShelf.type = 'lowshelf'; N.slowShelf.frequency.value = 90; N.slowShelf.gain.value = 0;
    // master -> hearing tunnel -> compressor -> analyser -> speakers (one clean bus).
    N.analyser = ctx.createAnalyser(); N.analyser.fftSize = 2048; N.anaBuf = new Float32Array(N.analyser.fftSize);
    // N.duck: brief -7.5 dB dip of the whole world bus so confirmation pings cut through afterburner.
    N.duck = gain(1);
    cockpitLP.connect(master); master.connect(N.slowLP).connect(N.slowShelf).connect(N.duck); N.duck.connect(N.tunnel); N.tunnel.connect(comp); comp.connect(N.analyser); N.analyser.connect(ctx.destination);
    // Body bus: the pilot's own breathing / heartbeat and the headset chime skip the tunnel.
    N.body = gain(muted ? 0 : volume); N.body.connect(comp);
    // Pilot physiology: all nodes built once. Body sounds bypass the hearing tunnel.
    const pNoise = loopNoise(N.white);
    N.breathBP1 = filt('bandpass', 550, 1.1); N.breathBP2 = filt('bandpass', 1500, 1.4);
    N.breathG = gain(0); pNoise.connect(N.breathBP1).connect(N.breathG).connect(N.body);
    pNoise.connect(N.breathBP2).connect(N.breathG);
    N.hissHP = filt('highpass', 2500, 0.7); N.hissG = gain(0); pNoise.connect(N.hissHP).connect(N.hissG).connect(N.body);
    N.gaspBP = filt('bandpass', 800, 1.2); N.gaspG = gain(0); pNoise.connect(N.gaspBP).connect(N.gaspG).connect(N.body);
    N.heartA = osc('sine', 55); N.heartB = osc('sine', 42); N.heartG = gain(0);
    N.heartAGain = gain(0); N.heartBGain = gain(0);
    N.heartA.connect(N.heartAGain).connect(N.heartG); N.heartB.connect(N.heartBGain).connect(N.heartG); N.heartG.connect(N.body);
    N.tinA = osc('sine', 7800); N.tinB = osc('sine', 8100); N.tinG = gain(0);
    N.tinA.connect(N.tinG); N.tinB.connect(N.tinG); N.tinG.connect(N.body);
    N.nextGBeat = 0; N.nextGBreath = 0; N.gSuitArm = true; N.gPeakMix = 0;
    // Hydraulic damage whine: sawtooth through band-pass, LFO wobble on pitch.
    N.hydOsc = osc('sawtooth', 380); N.hydBP = filt('bandpass', 900, 6); N.hydG = gain(0);
    N.hydOsc.connect(N.hydBP).connect(N.hydG).connect(cockpitLP);
    N.hydLFO = osc('sine', 7); N.hydLFOAmt = gain(25);
    N.hydLFO.connect(N.hydLFOAmt).connect(N.hydOsc.frequency);
    // Voiced radio: headset bus (skips cockpit LP + G-LOC tunnel).
    N.radioBus = gain(0.95); N.vwsDuckG = gain(1);
    N.radioBus.connect(N.vwsDuckG).connect(N.body);
    // Voice warning system: dedicated bus, never queued behind comms radio.
    N.vwsHP = filt('highpass', 300, 0.7);
    N.vwsComp = ctx.createDynamicsCompressor();
    N.vwsComp.threshold.value = -18; N.vwsComp.ratio.value = 3; N.vwsComp.attack.value = 0.004; N.vwsComp.release.value = 0.18;
    N.vwsBus = gain(0.9); N.vwsHP.connect(N.vwsComp).connect(N.vwsBus).connect(master);
    // Comms DSP: HP -> LP -> soft clip -> compressor -> ring-mod split -> pan -> analyser.
    N.rHP = filt('highpass', 340, 0.7); N.rLP = filt('lowpass', 2900, 0.7);
    N.rShaper = ctx.createWaveShaper(); N.rShaper.curve = CURVE_SOFT; N.rShaper.oversample = '2x';
    N.rComp = ctx.createDynamicsCompressor();
    N.rComp.threshold.value = -24; N.rComp.knee.value = 12; N.rComp.ratio.value = 6;
    N.rComp.attack.value = 0.003; N.rComp.release.value = 0.12;
    N.rRingSplit = gain(1); N.rDry = gain(1);
    N.rRingDelay = ctx.createDelay(0.02); N.rRingDelay.delayTime.value = 0.004;
    N.rRingFb = gain(0.35); N.rRingWet = gain(0);
    N.rPan = ctx.createStereoPanner();
    N.rAnalyser = ctx.createAnalyser(); N.rAnalyser.fftSize = 256; N.rAnalyser.smoothingTimeConstant = 0.6;
    N.rGain = gain(1);
    N.rHP.connect(N.rLP).connect(N.rShaper).connect(N.rComp).connect(N.rRingSplit);
    N.rRingSplit.connect(N.rDry).connect(N.rPan);
    N.rRingSplit.connect(N.rRingDelay); N.rRingDelay.connect(N.rRingFb).connect(N.rRingDelay);
    N.rRingDelay.connect(N.rRingWet).connect(N.rPan);
    N.rPan.connect(N.rAnalyser).connect(N.rGain).connect(N.radioBus);
    // Pre-allocated one-shot PTT clips and a forever-running static bed.
    N.pttOpen = pttBuffer('open'); N.pttTail = pttBuffer('tail');
    N.rFreq = new Uint8Array(128); N.rTime = new Uint8Array(128);
    N.rVoiceG = [gain(1), gain(1)]; N.voiceIdx = 0;
    N.rVoiceG[0].connect(N.rHP); N.rVoiceG[1].connect(N.rHP);
    const white = noiseBuffer('white'), pink = noiseBuffer('pink'), brown = noiseBuffer('brown');
    N.whiteBuf = white;
    N.rStatic = loopNoise(pink);
    N.rStaticBP = filt('bandpass', 1500, 0.6);
    N.rStaticG = gain(0);
    N.rStatic.connect(N.rStaticBP).connect(N.rStaticG).connect(N.rPan);
    initMusic();

    // F100 turbines: filtered pink/brown body + sawtooth whine + afterburner rumble.
    N.engBody = loopNoise(pink); N.engLP = filt('lowpass', 500, 0.9); N.engGain = gain(0);
    N.engBody.connect(N.engLP).connect(N.engGain).connect(cockpitLP);
    N.engLow = loopNoise(brown); N.engLowLP = filt('lowpass', 140, 0.7); N.engLowGain = gain(0);
    N.engLow.connect(N.engLowLP).connect(N.engLowGain).connect(cockpitLP);
    N.whineA = osc('sawtooth', 220); N.whineB = osc('sawtooth', 223);
    N.whineBP = filt('bandpass', 1400, 9); N.whineGain = gain(0);
    N.whineA.connect(N.whineBP); N.whineB.connect(N.whineBP); N.whineBP.connect(N.whineGain).connect(cockpitLP);
    N.abNoise = loopNoise(brown); N.abBP = filt('lowpass', 380, 1.2); N.abGain = gain(0);
    N.abNoise.connect(N.abBP).connect(N.abGain).connect(cockpitLP);
    N.abCrackle = loopNoise(white); N.abCrackleBP = filt('bandpass', 900, 0.8); N.abCrackleGain = gain(0);
    N.abCrackle.connect(N.abCrackleBP).connect(N.abCrackleGain).connect(cockpitLP);

    // M61A1 "BRRRT" — no pitched oscillator in the audio path, only chopped noise.
    // A 2 s white/pink noise loop is amplitude-chopped at 100 Hz (6,000 rounds/min)
    // by an inverted-sawtooth LFO (sharp attack, linear decay = one punch per
    // round) swinging the gain between 0.15 and 1.0, with +/-3 Hz flutter.
    const gunBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2.0), ctx.sampleRate);
    { const d = gunBuf.getChannelData(0), w = white.getChannelData(0), p = pink.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = 0.6 * w[i % w.length] + 0.8 * p[i % p.length]; }
    N.gunNoise = ctx.createBufferSource(); N.gunNoise.buffer = gunBuf; N.gunNoise.loop = true; N.gunNoise.start();
    N.gunChop = gain(0.575);                                   // centre of the 0.15 .. 1.0 swing
    N.gunLFO = osc('sawtooth', 100);
    N.gunLFOamp = gain(-0.425);                                // inverted saw: jump up, decay down
    N.gunLFO.connect(N.gunLFOamp).connect(N.gunChop.gain);
    N.gunFlutter = osc('sine', 0.7); N.gunFlutterAmt = gain(3); // +/-3 Hz organic rate flutter
    N.gunFlutter.connect(N.gunFlutterAmt).connect(N.gunLFO.frequency);
    N.gunNoise.connect(N.gunChop);
    // Layer 1: the raw 6,000 rpm mechanical tear.
    N.gunTearHP = filt('highpass', 260, 0.7); N.gunTearGain = gain(0.35);
    N.gunChop.connect(N.gunTearHP).connect(N.gunTearGain);
    // Layer 2: gunpowder crack — bandpass 1.1 kHz into a hard-clipping waveshaper.
    N.gunCrackBP = filt('bandpass', 1100, 0.9);
    N.gunShaper = ctx.createWaveShaper(); N.gunShaper.curve = distortionCurve(35); N.gunShaper.oversample = '4x';
    N.gunCrackLP = filt('lowpass', 5500, 0.7);                 // 2.8 kHz in the cockpit, 5.5 kHz outside
    N.gunCrackGain = gain(0.55);
    N.gunChop.connect(N.gunCrackBP).connect(N.gunShaper).connect(N.gunCrackLP).connect(N.gunCrackGain);
    // Layer 3: airframe bass thump — steep 140 Hz lowpass, +8 dB, extra 120 Hz in the cockpit.
    N.gunThumpLP = filt('lowpass', 140, 2.5);
    N.gunThumpPeak = ctx.createBiquadFilter(); N.gunThumpPeak.type = 'peaking'; N.gunThumpPeak.frequency.value = 120; N.gunThumpPeak.Q.value = 1.2; N.gunThumpPeak.gain.value = 0;
    N.gunThumpGain = gain(Math.pow(10, 8 / 20));
    N.gunChop.connect(N.gunThumpLP).connect(N.gunThumpPeak).connect(N.gunThumpGain);
    // Trigger bus (gated on press/release) + short air-echo send for the release tail.
    N.gunBus = gain(0);
    N.gunTearGain.connect(N.gunBus); N.gunCrackGain.connect(N.gunBus); N.gunThumpGain.connect(N.gunBus);
    N.gunBus.connect(master);
    N.gunVerb = ctx.createConvolver(); N.gunVerb.buffer = airEcho(0.55);
    N.gunVerbSend = gain(0.22);
    N.gunBus.connect(N.gunVerbSend).connect(N.gunVerb).connect(master);
    N.wasFiring = false;

    // AIM-9 seeker: low growl (FM-wobbled square) while searching, 950 Hz tone when locked.
    N.growl = osc('square', 260); N.growlLFO = osc('sine', 9); N.growlDepth = gain(60);
    N.growlLFO.connect(N.growlDepth).connect(N.growl.frequency);
    N.growlLP = filt('lowpass', 900, 2); N.growlGain = gain(0);
    N.growl.connect(N.growlLP).connect(N.growlGain).connect(master);
    N.lockTone = osc('sine', 950); N.lockGain = gain(0);
    N.lockTone.connect(N.lockGain).connect(master);

    // Missile alert: alternating 1200 / 800 Hz square beeps.
    N.alert = osc('square', 1200); N.alertLP = filt('lowpass', 3500, 0.7); N.alertGain = gain(0);
    N.alert.connect(N.alertLP).connect(N.alertGain).connect(master);

    // Falling-bomb whistle: sine sliding down in pitch + a band of wind noise.
    N.whistle = osc('sine', 1600); N.whistleGain = gain(0);
    N.whistle.connect(N.whistleGain).connect(cockpitLP);
    N.wind = loopNoise(pink); N.windBP = filt('bandpass', 1200, 3); N.windGain = gain(0);
    N.wind.connect(N.windBP).connect(N.windGain).connect(cockpitLP);

    // Cloud penetration: low-passed wind / moisture rush (p.cloud 0..1).
    N.cloudRush = loopNoise(pink); N.cloudLP = filt('lowpass', 420, 0.8); N.cloudGain = gain(0);
    N.cloudHiss = loopNoise(white); N.cloudBP = filt('bandpass', 2600, 0.6); N.cloudHissGain = gain(0);
    N.cloudRush.connect(N.cloudLP).connect(N.cloudGain).connect(master);
    N.cloudHiss.connect(N.cloudBP).connect(N.cloudHissGain).connect(cockpitLP);

    // Cockpit mist patter: bright band-passed hiss with a slow square-wave AM.
    // All nodes are allocated once here; update() only ramps their params.
    N.mist = loopNoise(N.whiteBuf); N.mistHP = filt('highpass', 5200, 0.7);
    N.mistBP = filt('bandpass', 8200, 0.9); N.mistG = gain(0);
    N.mist.connect(N.mistHP).connect(N.mistBP).connect(N.mistG).connect(cockpitLP);
    N.mistLFO = osc('square', 17); N.mistAM = gain(0);
    N.mistLFO.connect(N.mistAM).connect(N.mistG.gain);
    // Flagship VLS charge: one persistent square tone with a pulse AM.
    N.flagOsc = osc('square', 880); N.flagBP = filt('bandpass', 1100, 1.2);
    N.flagG = gain(0); N.flagLFO = osc('square', 2); N.flagAM = gain(0);
    N.flagOsc.connect(N.flagBP).connect(N.flagG).connect(master);
    N.flagLFO.connect(N.flagAM).connect(N.flagG.gain);
    // Drone swarm: one persistent buzzing sawtooth through a band-pass; gain is
    // driven by the nearest live drone's distance (setDroneHum), silent otherwise.
    N.droneOsc = osc('sawtooth', 140); N.droneBP = filt('bandpass', 620, 3.5); N.droneG = gain(0);
    N.droneOsc.connect(N.droneBP).connect(N.droneG).connect(cockpitLP);
    // Sonic boom: one persistent noise crack + one 45 Hz thump, retriggered by envelopes.
    N.boomN = loopNoise(N.whiteBuf); N.boomLP = filt('lowpass', 180, 0.8); N.boomNG = gain(0);
    N.boomN.connect(N.boomLP).connect(N.boomNG).connect(cockpitLP);
    N.boomSub = osc('sine', 45); N.boomSubG = gain(0); N.boomSub.connect(N.boomSubG).connect(cockpitLP);

    // Sea-skim rooster-tail rush + low hull rumble, both gated by setSpray().
    N.sprayNoise = loopNoise(N.whiteBuf); N.sprayHP = filt('highpass', 300, 0.7);
    N.sprayBP = filt('bandpass', 900, 0.7); N.sprayG = gain(0);
    N.sprayNoise.connect(N.sprayHP).connect(N.sprayBP).connect(N.sprayG).connect(cockpitLP);
    N.rumbleNoise = loopNoise(N.whiteBuf); N.rumbleLP = filt('lowpass', 70, 0.7); N.rumbleG = gain(0);
    N.rumbleNoise.connect(N.rumbleLP).connect(N.rumbleG).connect(cockpitLP);

    // CRIMSON-1 cannon: one persistent headset burst chain + retriggerable hit click.
    N.egunNoise = loopNoise(N.whiteBuf); N.egunBP = filt('bandpass', 1600, 2);
    N.egunAMG = gain(0.5); N.egunG = gain(0);
    N.egunNoise.connect(N.egunBP).connect(N.egunAMG).connect(N.egunG).connect(N.body);
    N.egunLFO = osc('square', 50); N.egunAMD = gain(0.5);
    N.egunLFO.connect(N.egunAMD).connect(N.egunAMG.gain);
    N.gunHitOsc = osc('triangle', 1800); N.gunHitG = gain(0);   // osc() already started it
    N.gunHitOsc.connect(N.gunHitG).connect(N.body);

    // Rain patter: band-passed pink noise (cockpit-muffled) + bright droplet ticks.
    N.rain = loopNoise(pink); N.rainBP = filt('bandpass', 2400, 0.55); N.rainGain = gain(0);
    N.rain.connect(N.rainBP).connect(N.rainGain).connect(cockpitLP);
    N.rainLow = loopNoise(brown); N.rainLowLP = filt('lowpass', 380, 0.7); N.rainLowGain = gain(0);
    N.rainLow.connect(N.rainLowLP).connect(N.rainLowGain).connect(master);
    // Canopy rain layer (inside the canopy, so it skips the cockpit low-pass): a bus of
    // acrylic droplet taps (scheduled micro-bursts, see canopyRain()) + a speed-driven
    // high-velocity rain wash. Full in the cockpit, -65 % in chase view.
    N.canopyBus = gain(0); N.canopyBus.connect(master);
    N.canopyTapBus = gain(1); N.canopyTapBus.connect(N.canopyBus);
    N.canopyHiss = loopNoise(white); N.canopyHissBP = filt('bandpass', 2200, 1.1); N.canopyHissGain = gain(0);
    N.canopyHiss.connect(N.canopyHissBP).connect(N.canopyHissGain).connect(N.canopyBus);
    N.canopyNext = 0; N.canopyTaps = 0;

    // Twin F100-PW-220 core: detuned saw + triangle (82 / 84.5 Hz idle -> ~165 Hz MIL),
    // compressor whine (1.4-2.6 kHz sine), sub-bass 55 Hz afterburner rumble.
    N.coreA = osc('sawtooth', 82); N.coreB = osc('triangle', 84.5); N.coreLP = filt('lowpass', 520, 1.1); N.coreGain = gain(0);
    N.coreA.connect(N.coreLP); N.coreB.connect(N.coreLP); N.coreLP.connect(N.coreGain).connect(cockpitLP);
    N.comp = osc('sine', 1400); N.compGain = gain(0); N.comp.connect(N.compGain).connect(cockpitLP);
    N.sub = osc('sine', 55); N.subGain = gain(0); N.sub.connect(N.subGain).connect(master);
    // Airframe groan: band-passed brown noise + three metallic resonators (110 / 185 / 270 Hz)
    // with a slow LFO warble, swelling from 3.2 G to 9 G.
    N.groanNoise = loopNoise(brown); N.groanBP = filt('bandpass', 200, 2.2); N.groanGain = gain(0);
    N.groanNoise.connect(N.groanBP).connect(N.groanGain).connect(cockpitLP);
    N.groanLFO = osc('sine', 0.45); N.groanLFOd = gain(5);
    N.groanLFO.connect(N.groanLFOd);
    N.res = [110, 185, 270].map((f, i) => {
      const o = osc(i === 1 ? 'sawtooth' : 'triangle', f); N.groanLFOd.connect(o.frequency);
      const bp = filt('bandpass', f, 12), g = gain(0); o.connect(bp).connect(g).connect(cockpitLP); return { o, g, f };
    });
    N.creakLFO = osc('sine', 0.7); N.creakAmt = gain(0); N.creakLFO.connect(N.creakAmt);
    // Turbine airflow lug: deep 70-130 Hz compressor rumble in high-AoA turns.
    N.lug = osc('sine', 120); N.lugNoise = loopNoise(brown); N.lugLP = filt('lowpass', 130, 1.4); N.lugGain = gain(0);
    N.lug.connect(N.lugGain); N.lugNoise.connect(N.lugLP).connect(N.lugGain); N.lugGain.connect(cockpitLP);
    // Wing buffet / wind rush: swept band-pass noise (220-680 Hz) with 14 Hz flutter.
    N.buffN = loopNoise(pink); N.buffSweep = filt('bandpass', 300, 1.6); N.buffVCA = gain(0); N.buffGain2 = gain(0);
    N.buffN.connect(N.buffSweep).connect(N.buffVCA).connect(N.buffGain2).connect(cockpitLP);
    N.flutter = osc('sine', 14); N.flutterAmt = gain(0.45); N.flutter.connect(N.flutterAmt).connect(N.buffVCA.gain);
    N.buffVCA.gain.value = 0.55;
    N.nextBreath = 0;

    // Slipstream wind & AoA buffeting bus (pre-allocated; only AudioParams move per frame).
    // Two decorrelated pink-noise loops (independent random loop offsets) -> band-pass
    // (Q 0.85, 220 Hz @ 150 kt -> 1,150 Hz @ 650 kt) panned L/R; a low-mid resonant
    // buffet rumble (140-360 Hz, Q 1.4) swells under G / AoA. The bus then passes a
    // view-aware low-pass (sealed canopy ~1.8 kHz) straight into the master.
    N.windLP = filt('lowpass', 16000, 0.6); N.windBus = gain(0);
    N.windBus.connect(N.windLP).connect(master);
    N.slipGain = gain(0); N.slipGain.connect(N.windBus);
    N.slip = [-0.65, 0.65].map(pan => {
      const src = loopNoise(pink), bp = filt('bandpass', 220, 0.85), pn = ctx.createStereoPanner();
      pn.pan.value = pan; src.connect(bp).connect(pn).connect(N.slipGain);
      return { src, bp };
    });
    N.windBuffN = loopNoise(pink); N.windBuffBP = filt('bandpass', 140, 1.4); N.windBuffGain = gain(0);
    N.windBuffN.connect(N.windBuffBP).connect(N.windBuffGain).connect(N.windBus);
    N.windDbg = { kts: 0, slipGain: 0, slipHz: 220, buffGain: 0, buffHz: 140, lp: 16000, bus: 0 };

    // Procedural fallbacks for the sampled layers.
    N.buffNoise = loopNoise(brown); N.buffBP = filt('bandpass', 75, 1.1); N.buffFGain = gain(0);
    N.buffNoise.connect(N.buffBP).connect(N.buffFGain).connect(cockpitLP);
    N.nextBeat = 0;

    N.white = white; N.brown = brown;
    ready = true;
    resume();
    return true;
  }

  function resume() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }
  function suspend() {
    // Wind bus to silence first, so resuming ramps it back in instead of clicking.
    if (N.windBus) { N.windBus.gain.cancelScheduledValues(ctx.currentTime); N.windBus.gain.setValueAtTime(0, ctx.currentTime); N.windDbg.bus = 0; }
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
  }
  // Slipstream / buffet mix (once per frame from update()).
  function updateWind(p, kts, live) {
    const WT = 0.06, ak = Math.abs(p.aoa || 0), gl = p.gLoad || 1;
    const cl = (x) => Math.min(1, Math.max(0, x));
    const run = live && !muted && kts >= 80 ? 1 : 0;            // runway idle / taxi / dead stick -> silent
    const q = Math.pow(cl((kts - 110) / 520), 1.6);              // dynamic pressure feel
    const slipHz = 220 + 930 * cl((kts - 150) / 500);
    const view = p.cockpit ? 0.8 : 1.15;                         // brighter exterior rush in chase view
    const slipGain = run * 0.2 * q * view;
    const buffK = run * Math.max(sm(gl, 3.2, 7.5), sm(ak, 11, 24)) * sm(kts, 100, 220);
    const buffHz = 140 + 220 * buffK, buffGain = 0.26 * buffK * (0.85 + 0.25 * q) * (p.cockpit ? 1.1 : 0.9);
    const lp = p.cockpit ? 1800 : 16000;
    for (const s of N.slip) set(s.bp.frequency, slipHz, WT);
    set(N.slipGain.gain, slipGain, WT);
    set(N.windBuffBP.frequency, buffHz, WT); set(N.windBuffGain.gain, buffGain, WT);
    set(N.windLP.frequency, lp, WT);
    set(N.windBus.gain, run, WT);
    N.windDbg = { kts: Math.round(kts), slipGain: +slipGain.toFixed(4), slipHz: Math.round(slipHz), buffGain: +buffGain.toFixed(4),
      buffHz: Math.round(buffHz), lp, bus: run, live: { slip: +N.slipGain.gain.value.toFixed(4), bp: Math.round(N.slip[0].bp.frequency.value), buff: +N.windBuffGain.gain.value.toFixed(4) } };
  }

  /* ------------------------------------------------------- one-shot events */
  // Two-stage detonation: an immediate metallic warhead crack (white noise through a
  // band-pass sweeping 3,000 -> 850 Hz, 2 ms attack, ~0.12 s), then -- `delay` s later
  // (sound travel, 0.02-0.40 s) -- the sub-bass shockwave thump (sine 110 -> 36 Hz) and
  // the rolling brown-noise body.
  function explosion(intensity = 1, delay = 0.02) {
    if (!ready) return;
    if (!Number.isFinite(intensity)) intensity = 1;          // corrupt scale must never poison an AudioParam
    if (!Number.isFinite(delay)) delay = 0.02;
    const t = ctx.currentTime, k = Math.min(1.4, Math.max(0.05, intensity)), tb = t + Math.max(0, delay);
    const cn = ctx.createBufferSource(); cn.buffer = N.white;
    const cbp = filt('bandpass', 3000, 1.6); cbp.frequency.setValueAtTime(3000, t); cbp.frequency.exponentialRampToValueAtTime(850, t + 0.11);
    const cg = gain(0); cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(0.75 * k, t + 0.002); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    cn.connect(cbp).connect(cg).connect(cockpitLP); cn.start(t, Math.random()); cn.stop(t + 0.15);
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(110, tb); sub.frequency.exponentialRampToValueAtTime(36, tb + 0.9);
    const sg = gain(0); sg.gain.setValueAtTime(0, tb); sg.gain.linearRampToValueAtTime(1.0 * k, tb + 0.012); sg.gain.exponentialRampToValueAtTime(0.001, tb + 1.5);
    sub.connect(sg).connect(cockpitLP); sub.start(tb); sub.stop(tb + 1.6);
    const n = ctx.createBufferSource(); n.buffer = N.brown;
    const lp = filt('lowpass', 900, 0.8); lp.frequency.setValueAtTime(1400, tb); lp.frequency.exponentialRampToValueAtTime(120, tb + 1.8);
    const ng = gain(0); ng.gain.setValueAtTime(0, tb); ng.gain.linearRampToValueAtTime(1.0 * k, tb + 0.02); ng.gain.exponentialRampToValueAtTime(0.001, tb + 2.2);
    n.connect(lp).connect(ng).connect(cockpitLP); n.start(tb, Math.random()); n.stop(tb + 2.3);
    N.blastCount = (N.blastCount || 0) + 1;
    N.lastBlast = { k: +k.toFixed(2), crackHz: [3000, 850], crackAt: +t.toFixed(3), subHz: [110, 36], boomAt: +tb.toFixed(3), delay: +(tb - t).toFixed(3), count: N.blastCount };
  }
  // Mach-1 sonic boom: two short band-pass cracks 110 ms apart + a long 62->28 Hz sub.
  function sonicBoom(cockpit) {
    if (!ready || !N.boomNG) return;
    const t = ctx.currentTime, k = cockpit ? 0.6 : 1;
    const ng = N.boomNG.gain, sg = N.boomSubG.gain;
    ng.cancelScheduledValues(t); ng.setValueAtTime(0.0001, t);
    ng.linearRampToValueAtTime(0.9 * k, t + 0.005);
    ng.exponentialRampToValueAtTime(0.0001, t + 0.5);
    sg.cancelScheduledValues(t); sg.setValueAtTime(0.0001, t);
    sg.linearRampToValueAtTime(0.8 * k, t + 0.012);
    sg.exponentialRampToValueAtTime(0.0001, t + 0.25);
    N.boomSub.frequency.setValueAtTime(45, t);
    N.boomSub.frequency.exponentialRampToValueAtTime(28, t + 0.25);
    duckWorld(0.55, 0.25);
    N.boomCount = (N.boomCount || 0) + 1;
    N.lastBoom = { t: +t.toFixed(3), count: N.boomCount };
  }
  // Missile near-miss: band-passed whoosh + falling saw sub, low-passed for cockpit.
  function flybyWhoosh(k, cockpit) {
    if (!ready) return;
    const t = ctx.currentTime, kk = Math.min(1, Math.max(0.1, k));
    const lp = filt('lowpass', cockpit ? 2200 : 9000, 0.7); lp.connect(N.body);
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 2600, 2.4);
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(340, t + 0.38);
    const ng = gain(0); ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.9 * kk, t + 0.09);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    n.connect(bp).connect(ng).connect(lp); n.start(t, Math.random()); n.stop(t + 0.4);
    const sub = ctx.createOscillator(); sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(240, t); sub.frequency.exponentialRampToValueAtTime(68, t + 0.38);
    const sg = gain(0); sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(0.2 * kk, t + 0.09);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    sub.connect(sg).connect(lp); sub.start(t); sub.stop(t + 0.4);
    N.flybyCount = (N.flybyCount || 0) + 1;
    N.lastFlyby = { k: +kk.toFixed(2), count: N.flybyCount };
  }
  // Enemy cannon burst: retrigger the persistent AM chain, no nodes per round.
  function enemyGun(dist, burstT = 1) {
    if (!ready || !N.egunG) return;
    const t = ctx.currentTime, vol = Math.min(1, Math.max(0.1, 1 - (dist || 0) / 1500));
    const g = N.egunG.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.18 * vol, t + 0.02);
    g.setValueAtTime(0.18 * vol, t + Math.max(0.1, burstT));
    g.linearRampToValueAtTime(0, t + Math.max(0.1, burstT) + 0.06);
    N.egunCount = (N.egunCount || 0) + 1;
  }
  function gunhit() {
    if (!ready || !N.gunHitG) return;
    const t = ctx.currentTime, g = N.gunHitG.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0.16, t);
    g.exponentialRampToValueAtTime(0.001, t + 0.09);
  }
  function missileLaunch() {
    if (!ready) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 3200, 0.9); bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(500, t + 1.4);
    const g = gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    n.connect(bp).connect(g).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 1.7);
    const thump = ctx.createOscillator(); thump.type = 'sine'; thump.frequency.setValueAtTime(140, t); thump.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    const tg = gain(0); tg.gain.setValueAtTime(0.5, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    thump.connect(tg).connect(cockpitLP); thump.start(t); thump.stop(t + 0.32);
  }

  // Bomb rack release: ejector-cartridge crack + heavy metallic clunk of the hooks.
  function bombRelease(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1, Math.max(0.1, intensity));
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 1800, 1.5);
    const ng = gain(0); ng.gain.setValueAtTime(0.5 * k, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(bp).connect(ng).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 0.06);
    for (const [f0, f1, dur, a] of [[180, 70, 0.22, 0.7], [420, 260, 0.12, 0.25], [760, 690, 0.18, 0.12]]) {
      const o = ctx.createOscillator(); o.type = f0 > 400 ? 'square' : 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const lp = filt('lowpass', 1600, 2);
      const g = gain(0); g.gain.setValueAtTime(a * k, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(lp).connect(g).connect(cockpitLP); o.start(t); o.stop(t + dur + 0.02);
    }
  }
  // Bomb detonation: long sub-bass rumble, crack and rolling brown-noise thunder.
  function bombDetonation(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1.4, Math.max(0.05, intensity));
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(48, t); sub.frequency.exponentialRampToValueAtTime(16, t + 3.2);
    const sg = gain(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(1.0 * k, t + 0.03); sg.gain.exponentialRampToValueAtTime(0.001, t + 3.6);
    sub.connect(sg).connect(cockpitLP); sub.start(t); sub.stop(t + 3.7);
    const crack = ctx.createBufferSource(); crack.buffer = N.white;
    const cg = gain(0); cg.gain.setValueAtTime(0.7 * k, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    crack.connect(filt('highpass', 900, 0.7)).connect(cg).connect(cockpitLP); crack.start(t, Math.random()); crack.stop(t + 0.14);
    const n = ctx.createBufferSource(); n.buffer = N.brown;
    const lp = filt('lowpass', 700, 0.9); lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(70, t + 4.0);
    const ng = gain(0); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(1.3 * k, t + 0.05);
    ng.gain.setTargetAtTime(0.5 * k, t + 0.4, 0.5); ng.gain.exponentialRampToValueAtTime(0.001, t + 4.4);
    n.connect(lp).connect(ng).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 4.5);
  }
  // Flare salvo: six staggered cartridge pops + magnesium sizzle.
  function flare(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1, Math.max(0.1, intensity));
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.07;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(320, at); o.frequency.exponentialRampToValueAtTime(70, at + 0.09);
      const g = gain(0); g.gain.setValueAtTime(0.45 * k, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
      o.connect(g).connect(cockpitLP); o.start(at); o.stop(at + 0.11);
      const n = ctx.createBufferSource(); n.buffer = N.white;
      const ng = gain(0); ng.gain.setValueAtTime(0.35 * k, at); ng.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      n.connect(filt('bandpass', 2500, 1.2)).connect(ng).connect(cockpitLP); n.start(at, Math.random()); n.stop(at + 0.04);
    }
    const s = ctx.createBufferSource(); s.buffer = N.white;
    const hp = filt('highpass', 4200, 0.8);
    const sg = gain(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.16 * k, t + 0.15); sg.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    // crackle: chop the sizzle with a fast random-ish square LFO
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(23, t); lfo.frequency.linearRampToValueAtTime(41, t + 2.2);
    const depth = gain(0.06 * k); lfo.connect(depth).connect(sg.gain);
    s.connect(hp).connect(sg).connect(cockpitLP); s.start(t, Math.random()); s.stop(t + 2.3); lfo.start(t); lfo.stop(t + 2.3);
  }

  // Chaff cartridge: two low pops plus a long, chopped foil hiss in the VHF band.
  function chaff(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1, Math.max(0.1, intensity));
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.06;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(190, at); o.frequency.exponentialRampToValueAtTime(58, at + 0.09);
      const g = gain(0); g.gain.setValueAtTime(0.4 * k, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      o.connect(g).connect(cockpitLP); o.start(at); o.stop(at + 0.1);
    }
    const s = ctx.createBufferSource(); s.buffer = N.white;
    const sg = gain(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.14 * k, t + 0.02);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    const lfo = ctx.createOscillator(); lfo.type = 'square';
    lfo.frequency.setValueAtTime(31, t); lfo.frequency.linearRampToValueAtTime(17, t + 1.4);
    const depth = gain(0.07 * k); lfo.connect(depth).connect(sg.gain);
    s.connect(filt('bandpass', 6500, 0.7)).connect(sg).connect(cockpitLP);
    s.start(t, Math.random()); s.stop(t + 1.45); lfo.start(t); lfo.stop(t + 1.45);
  }

  // Lock-drop chirp: a short descending two-tone when cloud cover breaks a lock.
  function lockDrop() {
    if (!ready) return;
    const t = ctx.currentTime;
    for (const [f0, f1, dt] of [[1500, 1100, 0], [1000, 640, 0.08]]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t + dt); o.frequency.exponentialRampToValueAtTime(f1, t + dt + 0.07);
      const g = gain(0); g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.07, t + dt + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.08);
      o.connect(g).connect(master); o.start(t + dt); o.stop(t + dt + 0.09);
    }
  }

  // NVG flip-down: mechanical click + capacitor charge whine (1.8 -> 6.5 kHz, 0.35 s).
  // Flip-up: a single crisp click.
  function nvg(on) {
    if (!ready) return;
    const t = ctx.currentTime;
    const click = (at, f, a) => {
      const n = ctx.createBufferSource(); n.buffer = N.white;
      const bp = filt('bandpass', f, 2.5);
      const g = gain(0); g.gain.setValueAtTime(a, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.025);
      n.connect(bp).connect(g).connect(master); n.start(at, Math.random()); n.stop(at + 0.03);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(220, at); o.frequency.exponentialRampToValueAtTime(90, at + 0.04);
      const og = gain(0); og.gain.setValueAtTime(a * 0.6, at); og.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      o.connect(og).connect(master); o.start(at); o.stop(at + 0.06);
    };
    if (on) {
      click(t, 3200, 0.22); click(t + 0.045, 2400, 0.14);              // mount detent + tube flip-down
      const w = ctx.createOscillator(); w.type = 'sine';
      w.frequency.setValueAtTime(1800, t + 0.05); w.frequency.exponentialRampToValueAtTime(6500, t + 0.40);
      const wg = gain(0); wg.gain.setValueAtTime(0, t + 0.05); wg.gain.linearRampToValueAtTime(0.022, t + 0.12);
      wg.gain.setValueAtTime(0.022, t + 0.34); wg.gain.exponentialRampToValueAtTime(0.0008, t + 0.52);
      w.connect(wg).connect(master); w.start(t + 0.05); w.stop(t + 0.55);
    } else {
      click(t, 3800, 0.2);
    }
  }

  // C-key designation chirp: two quick rising sine blips (target in sight), or a
  // single low blip when nothing is in the sight cone.
  function designate(ok = true) {
    if (!ready) return;
    const t = ctx.currentTime;
    const notes = ok ? [[1320, 0], [1980, 0.055]] : [[520, 0]];
    for (const [f0, dt] of notes) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t + dt); o.frequency.exponentialRampToValueAtTime(f0 * 1.08, t + dt + 0.045);
      const g = gain(0); g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(ok ? 0.07 : 0.05, t + dt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.05);
      o.connect(g).connect(master); o.start(t + dt); o.stop(t + dt + 0.06);
    }
  }

  // ALR-56C RWR search chirp: a short descending sine pip pair (soft when painted,
  // brighter and quicker when a bandit holds a lock).
  function rwrChirp(level) {
    if (!ready) return;
    const t = ctx.currentTime, hi = level >= 2;
    for (const [f0, dt] of hi ? [[2600, 0], [2600, 0.07], [2600, 0.14]] : [[1900, 0], [1500, 0.06]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t + dt); o.frequency.exponentialRampToValueAtTime(f0 * 0.82, t + dt + 0.05);
      const g = gain(0); g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(hi ? 0.045 : 0.03, t + dt + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.055);
      o.connect(g).connect(master); o.start(t + dt); o.stop(t + dt + 0.06);
    }
  }
  // SAM salvo alert: a short rising RWR launch warble. Pitch climbs with the
  // number of live SAMs on the nose; the voice count is capped at four.
  function samLaunch(count = 1) {
    if (!ready) return;
    const t = ctx.currentTime;
    const voices = Math.min(4, Math.max(1, count | 0));
    const base = 1150 + Math.min(4, count) * 210;
    for (let i = 0; i < voices; i++) {
      const at = t + i * 0.02, f0 = base + i * 180;
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(f0, at); o.frequency.linearRampToValueAtTime(f0 * 1.18, at + 0.09);
      const lp = filt('lowpass', 3200, 0.7);
      const g = gain(0);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.04, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
      o.connect(lp).connect(g).connect(master); o.start(at); o.stop(at + 0.14);
    }
  }
  // ALQ-135 jammer engage: a buzzing noise sweep plus a rising square whine.
  function ecm(on = true) {
    if (!ready) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 600, 5);
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(4200, t + 0.5);
    const ng = gain(0); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.1, t + 0.03); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    n.connect(bp).connect(ng).connect(master); n.start(t, Math.random()); n.stop(t + 0.7);
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(on ? 220 : 660, t); o.frequency.exponentialRampToValueAtTime(on ? 660 : 220, t + 0.4);
    const lp = filt('lowpass', 1800, 0.7);
    const og = gain(0); og.gain.setValueAtTime(0.035, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(lp).connect(og).connect(master); o.start(t); o.stop(t + 0.5);
  }

  // Sample voices are built lazily once both the context and the decoded buffer exist.
  function loopVoice(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * Math.max(0.01, buf.duration - 0.05)); return s; }
  function ensureSampleVoices() {
    if (samples.turbine && !N.turb) {
      N.turb = loopVoice(samples.turbine);
      N.turbPeak = ctx.createBiquadFilter(); N.turbPeak.type = 'peaking'; N.turbPeak.frequency.value = 90; N.turbPeak.Q.value = 0.9; N.turbPeak.gain.value = 0;
      N.turbLP = filt('lowpass', 4000, 0.7); N.turbGain = gain(0);
      N.turb.connect(N.turbPeak).connect(N.turbLP).connect(N.turbGain).connect(cockpitLP);
    }
    if (samples.buffet && !N.buff) { N.buff = loopVoice(samples.buffet); N.buffGain = gain(0); N.buff.connect(N.buffGain).connect(cockpitLP); }
    if (samples.breath && !N.breath) { N.breath = loopVoice(samples.breath); N.breathGain = gain(0); N.breath.connect(N.breathGain).connect(N.body); }
  }
  // ---- cockpit voice warning system -------------------------------------------
  const VWS_IDS = ['PULL_UP', 'ENGINE_FIRE', 'CHAFF_FLARE', 'OVER_G', 'ALTITUDE', 'BINGO_FUEL'];
  const VWS_PRI = { PULL_UP: 5, ENGINE_FIRE: 4, CHAFF_FLARE: 3, OVER_G: 2, ALTITUDE: 2, BINGO_FUEL: 1 };
  const VWS_CD = { PULL_UP: 1.6, ENGINE_FIRE: 6, CHAFF_FLARE: 4, OVER_G: 3, ALTITUDE: 5, BINGO_FUEL: 30 };
  const VWS_PHRASE = { PULL_UP: 'PULL UP', ENGINE_FIRE: 'ENGINE FIRE', CHAFF_FLARE: 'CHAFF, FLARE',
    OVER_G: 'OVER G', ALTITUDE: 'ALTITUDE', BINGO_FUEL: 'BINGO FUEL' };
  const VWS_BUF = Object.create(null);
  const vwsQ = new Int8Array(VWS_IDS.length), vwsCd = new Float32Array(VWS_IDS.length);
  let vwsPlaying = -1, vwsUntil = 0, vwsSpeech = false, vwsMuted = true, vwsDebug = false;
  const vwsLast = { id: '', src: '', t: 0 };
  try { vwsMuted = localStorage.getItem('angelsZero_vws') !== '0'; } catch (e) { /* storage unavailable */ }
  const vwsUtt = typeof SpeechSynthesisUtterance !== 'undefined' ? VWS_IDS.reduce((o, id) => {
    const u = new SpeechSynthesisUtterance(VWS_PHRASE[id]); u.rate = 1.15; u.pitch = 1.1; u.volume = 0.9;
    o[id] = u; return o;
  }, Object.create(null)) : null;
  function vwsSay(id) {
    const i = VWS_IDS.indexOf(id);
    if (i < 0) return false;
    if (vwsCd[i] > 0) { if (vwsDebug) console.log('[ANGELS_ZERO] vws cd skip id=' + id); return false; }
    vwsQ[i] = 1; vwsCd[i] = VWS_CD[id];
    return true;
  }
  function vwsPlay(id) {
    vwsLast.id = id; vwsLast.t = ctx ? ctx.currentTime : 0;
    let src = 'chime';
    if (VWS_BUF[id]) {
      const s = ctx.createBufferSource(); s.buffer = VWS_BUF[id];
      const g = gain(1); s.connect(g).connect(N.vwsHP); s.start(); s.onended = () => { try { g.disconnect(); } catch (e) {} };
      src = 'buf'; vwsUntil = performance.now() / 1000 + Math.min(2, VWS_BUF[id].duration);
    } else if (vwsSpeech && vwsUtt && typeof speechSynthesis !== 'undefined') {
      try { speechSynthesis.speak(vwsUtt[id]); src = 'speech'; } catch (e) { src = 'chime'; }
      vwsUntil = performance.now() / 1000 + 1.1;
    } else {
      const t = ctx.currentTime;
      for (let rep = 0; rep < 2; rep++) for (const [f, off] of [[1000, 0], [800, 0.12]]) {
        const o = ctx.createOscillator(), g = gain(0); o.type = 'sine'; o.frequency.value = f;
        const a = t + rep * 0.3 + off;
        g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.08, a + 0.01);
        g.gain.linearRampToValueAtTime(0, a + 0.11);
        o.connect(g).connect(N.vwsHP); o.start(a); o.stop(a + 0.13);
      }
      vwsUntil = performance.now() / 1000 + 0.75;
    }
    vwsLast.src = src;
    if (N.vwsDuckG) N.vwsDuckG.gain.setTargetAtTime(0.63, ctx.currentTime, 0.03);
    if (vwsDebug) console.log('[ANGELS_ZERO] vws play id=' + id + ' src=' + src + ' pre=' + VWS_PRI[id]);
  }
  function vwsUpdate(dt) {
    if (!ready) return;
    for (let i = 0; i < vwsCd.length; i++) vwsCd[i] = Math.max(0, vwsCd[i] - dt);
    if (vwsPlaying >= 0) {
      if (performance.now() / 1000 >= vwsUntil) {
        vwsPlaying = -1;
        if (N.vwsDuckG) N.vwsDuckG.gain.setTargetAtTime(1, ctx.currentTime, 0.08);
      }
      return;
    }
    let best = -1, bp = -1;
    for (let i = 0; i < vwsQ.length; i++) if (vwsQ[i] && VWS_PRI[VWS_IDS[i]] > bp) { bp = VWS_PRI[VWS_IDS[i]]; best = i; }
    if (best < 0) return;
    vwsQ[best] = 0; vwsPlaying = best; vwsPlay(VWS_IDS[best]);
  }
  // Recovery gasp: two ragged inhales through a sweeping band-pass on the body bus.
  function gasp(strong = false) {
    if (!ready || !N.gaspBP) return;
    const t = ctx.currentTime, amp = strong ? 0.5 : 0.32;
    N.gaspBP.frequency.cancelScheduledValues(t);
    N.gaspBP.frequency.setValueAtTime(800, t);
    N.gaspBP.frequency.linearRampToValueAtTime(2200, t + 0.35);
    N.gaspBP.frequency.setValueAtTime(900, t + 0.5);
    N.gaspBP.frequency.linearRampToValueAtTime(2000, t + 0.85);
    const gp = N.gaspG.gain;
    gp.cancelScheduledValues(t); gp.setValueAtTime(0, t);
    for (const [a, dur] of [[0, 0.45], [0.52, 0.45]]) {
      gp.linearRampToValueAtTime(amp, t + a + 0.08);
      gp.setValueAtTime(amp * 0.85, t + a + dur * 0.6);
      gp.linearRampToValueAtTime(0, t + a + dur);
    }
  }
  // Over-G / G-LOC warning chime (sample, or a two-tone avionics fallback).
  function glocChime() {
    if (!ready) return;
    const t = ctx.currentTime;
    if (samples.chime) {
      const s = ctx.createBufferSource(); s.buffer = samples.chime; const g = gain(0.5);
      s.connect(g).connect(N.body); s.start(t); s.stop(t + Math.min(2, samples.chime.duration));
      return;
    }
    for (const [f0, dt] of [[1250, 0], [940, 0.16]]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f0;
      const lp = filt('lowpass', 3000, 0.7), g = gain(0);
      g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.06, t + dt + 0.01); g.gain.setValueAtTime(0.06, t + dt + 0.12); g.gain.linearRampToValueAtTime(0, t + dt + 0.15);
      o.connect(lp).connect(g).connect(N.body); o.start(t + dt); o.stop(t + dt + 0.16);
    }
  }
  // Anti-G straining breath (hook maneuver): sharp inhale, pressurised hold with a
  // faint strain grunt, forceful exhale -- shaped band-passed noise on the body bus.
  function breathCycle(k, period) {
    const t = ctx.currentTime;
    const burst = (at, dur, f0, f1, amp, q = 1.6) => {
      const n = ctx.createBufferSource(); n.buffer = N.white;
      const bp = filt('bandpass', f0, q); bp.frequency.setValueAtTime(f0, at); bp.frequency.linearRampToValueAtTime(f1, at + dur);
      const g = gain(0); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp, at + dur * 0.25); g.gain.linearRampToValueAtTime(amp * 0.8, at + dur * 0.7); g.gain.linearRampToValueAtTime(0, at + dur);
      n.connect(bp).connect(g).connect(N.body); n.start(at, Math.random() * 2); n.stop(at + dur + 0.05);
    };
    const inh = 0.22 + 0.1 * (1 - k), hold = period * 0.35, exh = 0.32 + 0.12 * k;
    burst(t, inh, 700, 1100, 0.16 * k);                                   // sharp "hik" inhale
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 95 + 30 * k;   // strain grunt under the hold
    const lp = filt('lowpass', 420, 0.8), g = gain(0);
    g.gain.setValueAtTime(0, t + inh); g.gain.linearRampToValueAtTime(0.03 * k, t + inh + 0.08); g.gain.linearRampToValueAtTime(0, t + inh + hold);
    o.connect(lp).connect(g).connect(N.body); o.start(t + inh); o.stop(t + inh + hold + 0.05);
    burst(t + inh + hold, exh, 620, 450, 0.22 * k, 1.2);                 // forceful exhale
  }
  // Procedural heartbeat fallback: a muffled lub-dub pair.
  function heartbeat(k) {
    const t = ctx.currentTime;
    for (const [dt, a] of [[0, 1], [0.16, 0.7]]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(52, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.12);
      const g = gain(0); g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.4 * a * k, t + dt + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.16);
      o.connect(g).connect(N.body); o.start(t + dt); o.stop(t + dt + 0.18);
    }
  }

  // Gun overheat: a hot hissing vent (high-passed noise burst) with a metallic tick.
  function overheat() {
    if (!ready) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const hp = filt('highpass', 2600, 0.7), g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    n.connect(hp).connect(g).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 1.7);
    glocChime();
  }
  // Engine flameout: a deep compressor-stall thump and spool-down moan.
  function flameout() {
    if (!ready) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(40, t + 2.2);
    const lp = filt('lowpass', 900, 0.9), g = gain(0);
    g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    o.connect(lp).connect(g).connect(cockpitLP); o.start(t); o.stop(t + 2.5);
    explosion(0.35);
  }
  /* ------------- engine fire / Halon bottle / windmill relight (cockpit cues) */
  // Fire-warning bell: three bright struck-bell rings (inharmonic partials 1 : 2.76 : 5.4).
  function fireBell() {
    if (!ready) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const at = t0 + i * 0.32;
      for (const [mul, amp] of [[1, 0.07], [2.76, 0.035], [5.4, 0.018]]) {
        const o = osc('sine', 1180 * mul), g = gain(0);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, at + 0.42);
        o.connect(g).connect(N.body); o.stop(at + 0.45);
      }
    }
  }
  // Halon discharge: sharp pneumatic burst (bright noise blast falling in pitch) + squib thump.
  function extinguisher() {
    if (!ready || !N.whiteBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = N.whiteBuf;
    const bp = filt('bandpass', 4200, 0.8), g = gain(0);
    bp.frequency.setValueAtTime(5200, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.9);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.42, t + 0.012); g.gain.exponentialRampToValueAtTime(0.002, t + 1.0);
    src.connect(bp).connect(g).connect(N.body); src.start(t, Math.random() * 2); src.stop(t + 1.05);
    const th = osc('sine', 140), tg = gain(0);
    th.frequency.setValueAtTime(140, t); th.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    tg.gain.setValueAtTime(0.3, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    th.connect(tg).connect(N.body); th.stop(t + 0.25);
  }
  // Windmill relight crank: starter whine rising over 2.5 s + igniter clicks
  // accelerating 4 -> 14 Hz. crank(false) cuts it (abort / resolved).
  function relightCrank(on) {
    if (!ready) return;
    const t = ctx.currentTime;
    if (N.crank) { try { N.crank.g.gain.cancelScheduledValues(t); N.crank.g.gain.setTargetAtTime(0, t, 0.04); N.crank.o.stop(t + 0.2); for (const c of N.crank.clicks) c.stop(t + 0.01); } catch (e) { /* stopped */ } N.crank = null; }
    if (!on) return;
    const o = osc('sawtooth', 90), lp = filt('lowpass', 900, 1.2), g = gain(0);
    o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(420, t + 2.5);
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2200, t + 2.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.3); g.gain.linearRampToValueAtTime(0.09, t + 2.5);
    o.connect(lp).connect(g).connect(N.body);
    const clicks = [];
    for (let c = 0.05; c < 2.5;) {
      const at = t + c, s = ctx.createBufferSource(); s.buffer = N.whiteBuf;
      const hp = filt('highpass', 3000, 0.7), cg = gain(0);
      cg.gain.setValueAtTime(0, at); cg.gain.linearRampToValueAtTime(0.16, at + 0.001); cg.gain.exponentialRampToValueAtTime(0.0005, at + 0.012);
      s.connect(hp).connect(cg).connect(N.body); s.start(at, Math.random() * 3, 0.02); clicks.push(s);
      c += 1 / (4 + 10 * (c / 2.5));
    }
    N.crank = { o, g, clicks };
  }
  // Relight: deep turbine boom + whoosh of the burner lighting.
  function relightBoom() {
    if (!ready) return;
    explosion(0.55);
    const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = N.whiteBuf;
    const lp = filt('lowpass', 300, 0.8), g = gain(0);
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.15); g.gain.exponentialRampToValueAtTime(0.002, t + 1.4);
    src.connect(lp).connect(g).connect(cockpitLP); src.start(t, Math.random() * 2); src.stop(t + 1.5);
  }
  // Relight failure: two sharp compressor-stall bangs and a sputter.
  function compressorStall() {
    if (!ready) return;
    const t0 = ctx.currentTime;
    [0, 0.21, 0.5, 0.62, 0.71].forEach((d, i) => {
      const at = t0 + d, s = ctx.createBufferSource(); s.buffer = N.whiteBuf;
      const lp = filt('lowpass', i < 2 ? 1600 : 700, 0.9), g = gain(0);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(i < 2 ? 0.5 : 0.18, at + 0.004); g.gain.exponentialRampToValueAtTime(0.001, at + (i < 2 ? 0.16 : 0.07));
      s.connect(lp).connect(g).connect(cockpitLP); s.start(at, Math.random() * 3, 0.2);
    });
  }

  // Master caution: three quick high / low avionics tones on the headset bus.
  function masterCaution() {
    if (!ready) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) for (const [f0, dt] of [[1450, 0], [1050, 0.11]]) {
      const at = t + i * 0.26 + dt, o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f0;
      const lp = filt('lowpass', 3200, 0.7), g = gain(0);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.055, at + 0.008); g.gain.setValueAtTime(0.055, at + 0.09); g.gain.linearRampToValueAtTime(0, at + 0.1);
      o.connect(lp).connect(g).connect(N.body); o.start(at); o.stop(at + 0.11);
    }
  }

  // Cockpit MFD page click: a 3 ms noise tick plus a short 1.65 kHz beep.
  function mfdClick() {
    if (!ready) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = N.whiteBuf;
    const bp = filt('bandpass', 3200, 2), g = gain(0);
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    s.connect(bp).connect(g).connect(cockpitLP); s.start(t, Math.random() * 2, 0.003); s.stop(t + 0.026);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1650;
    const og = gain(0);
    og.gain.setValueAtTime(0.12, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    o.connect(og).connect(cockpitLP); o.start(t); o.stop(t + 0.021);
  }

  // Arrestor cable: band-passed tearing noise + falling square whine + hull thump.
  function cableScreech() {
    if (!ready) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 1800, 4); bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(900, t + 1.6);
    const ng = gain(0); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.35, t + 0.01); ng.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    n.connect(bp).connect(ng).connect(N.body); n.start(t, Math.random()); n.stop(t + 1.65);
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(140, t + 1.6);
    const lp = filt('lowpass', 1200, 0.7), og = gain(0);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.35, t + 0.01); og.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(lp).connect(og).connect(N.body); o.start(t); o.stop(t + 1.65);
    const th = ctx.createOscillator(); th.type = 'sine'; th.frequency.value = 70;
    const tg = gain(0); tg.gain.setValueAtTime(0.35, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    th.connect(tg).connect(N.body); th.start(t); th.stop(t + 0.34);
  }
  // Steam catapult: low-pass noise sweep + 55 Hz bed.
  function catapult(k = 1) {
    if (!ready) return;
    const t = ctx.currentTime, vol = Math.min(1, Math.max(0, k));
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const lp = filt('lowpass', 900, 0.8); lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.4);
    const g = gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    n.connect(lp).connect(g).connect(N.body); n.start(t, Math.random()); n.stop(t + 1.45);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
    const og = gain(0); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.22 * vol, t + 0.1); og.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    o.connect(og).connect(N.body); o.start(t); o.stop(t + 1.45);
  }

  // Slow-mo bass drop: duck the world to 650 Hz / +7 dB sub shelf for the hold,
  // then sweep open over the recovery, plus a one-shot 55 -> 32 Hz sub sine.
  function slowMo() {
    const t = ready && ctx ? ctx.currentTime : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    N.lastSlowMo = { t: +t.toFixed(3), count: (N.lastSlowMo ? N.lastSlowMo.count : 0) + 1 };
    if (!ready || !N.slowLP) return;
    N.slowLP.frequency.setTargetAtTime(650, t, 0.02);
    N.slowShelf.gain.setTargetAtTime(7, t, 0.02);
    N.slowLP.frequency.setTargetAtTime(20000, t + 0.24, 0.06);
    N.slowShelf.gain.setTargetAtTime(0, t + 0.24, 0.06);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.4);
    const g = gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g).connect(N.body); o.start(t); o.stop(t + 0.42);
  }

  // Priority ACE inbound: square 1320 -> 990 -> 1320 Hz, 120 ms each, 40 ms gaps.
  function aceWarning() {
    if (!ready) return;
    const t = ctx.currentTime;
    const notes = [1320, 990, 1320];
    for (let i = 0; i < notes.length; i++) {
      const at = t + i * 0.16, o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = notes[i];
      const g = gain(0);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.32, at + 0.004);
      g.gain.setValueAtTime(0.32, at + 0.11); g.gain.linearRampToValueAtTime(0, at + 0.12);
      o.connect(g).connect(N.body); o.start(at); o.stop(at + 0.125);
    }
  }

  // Style confirmation ping: crisp two-tone harmonic stab 1,320 -> 1,760 Hz
  // (sine + triangle + octave sparkle) on the headset bus, which bypasses the
  // cockpit low-pass and G-LOC tunnel; the world bus ducks ~-7.5 dB for 160 ms so
  // it cuts through afterburner. `step` = combo step (pitch +1 semitone each,
  // capped at +8); step 0 = single soft tone (DANGER CLOSE).
  function duckWorld(depth = 0.56, hold = 0.12) {
    if (!N.duck) return;
    const t = ctx.currentTime, gp = N.duck.gain;
    gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t);
    gp.linearRampToValueAtTime(depth, t + 0.015); gp.setValueAtTime(depth, t + hold); gp.linearRampToValueAtTime(1, t + hold + 0.18);
  }
  function styleChime(step = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.pow(2, Math.min(8, Math.max(0, step - 1)) / 12);
    const notes = step > 0 ? [1320 * k, 1760 * k] : [1320];
    duckWorld(step > 0 ? 0.42 : 0.75, 0.16);
    notes.forEach((f0, i) => {
      const at = t + i * 0.085, len = i ? 0.34 : 0.13;
      // Octave + 3rd partials sit above the 1.4-2.6 kHz F100 compressor whine band.
      for (const [type, mul, amp] of [['sine', 1, 0.26], ['triangle', 1, 0.1], ['sine', 2, 0.12], ['sine', 3, 0.045]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f0 * mul;
        const g = gain(0);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp, at + 0.003);
        g.gain.setValueAtTime(amp, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, at + len);
        o.connect(g).connect(N.body); o.start(at); o.stop(at + len + 0.02);
      }
    });
  }
  // Vulcan vent: pressurized steam hiss — white noise high-passed 2.4 kHz with a
  // resonant 5.5 -> 3.2 kHz band sweep, sharp attack, 0.55 s release.
  function steamHiss() {
    if (!ready || !N.whiteBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = N.whiteBuf;
    const hp = filt('highpass', 2400, 0.7), bp = filt('bandpass', 5500, 1.4), g = gain(0);
    bp.frequency.setValueAtTime(5500, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32, t + 0.02); g.gain.setValueAtTime(0.3, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.66);
    src.connect(hp).connect(bp).connect(g).connect(N.body); src.start(t, Math.random() * 2); src.stop(t + 0.7);
  }
  // Landing gear hydraulics: 1.6 s actuator whine (pump saw 210 -> 150 Hz down /
  // 150 -> 210 Hz up, low-passed) over pressurised-fluid hiss, through the cockpit filter.
  function gearMotor(down = true) {
    if (!ready || !N.whiteBuf) return;
    const t = ctx.currentTime, T = 1.6;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(down ? 210 : 150, t); o.frequency.linearRampToValueAtTime(down ? 150 : 210, t + T);
    const lp = filt('lowpass', 900, 1.2), g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.12); g.gain.setValueAtTime(0.08, t + T - 0.15); g.gain.linearRampToValueAtTime(0, t + T);
    o.connect(lp).connect(g).connect(cockpitLP); o.start(t); o.stop(t + T + 0.05);
    const s = ctx.createBufferSource(); s.buffer = N.whiteBuf;
    const bp = filt('bandpass', 2400, 0.9), sg = gain(0);
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.05, t + 0.1); sg.gain.linearRampToValueAtTime(0, t + T);
    s.connect(bp).connect(sg).connect(cockpitLP); s.start(t, Math.random() * 2); s.stop(t + T + 0.05);
  }
  // Up-and-locked / down-and-locked: a heavy mechanical clunk felt through the airframe.
  function gearLock(down = true) {
    if (!ready) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(down ? 120 : 140, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    const g = gain(0); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(cockpitLP); o.start(t); o.stop(t + 0.22);
    flareClack();
  }
  // Touchdown: two rubber screeches (main tyres spinning up), band-passed noise
  // swept 2.6 -> 1.4 kHz with a tonal squeal, k 0..1.2 by sink rate.
  function tireScreech(k = 1) {
    if (!ready || !N.whiteBuf) return;
    const t0 = ctx.currentTime;
    [0, 0.07].forEach((dt, i) => {
      const t = t0 + dt, s = ctx.createBufferSource(); s.buffer = N.whiteBuf;
      const bp = filt('bandpass', 2600, 6), g = gain(0);
      bp.frequency.setValueAtTime(2600 - i * 200, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.45);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      s.connect(bp).connect(g).connect(master); s.start(t, Math.random() * 2); s.stop(t + 0.55);
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(1900 - i * 150, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.35);
      const og = gain(0); og.gain.setValueAtTime(0.08 * k, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(og).connect(master); o.start(t); o.stop(t + 0.4);
    });
    const th = ctx.createOscillator(); th.type = 'sine'; th.frequency.setValueAtTime(70, t0); th.frequency.exponentialRampToValueAtTime(35, t0 + 0.2);
    const tg = gain(0); tg.gain.setValueAtTime(0.4 * k, t0); tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    th.connect(tg).connect(master); th.start(t0); th.stop(t0 + 0.27);           // oleo thump
  }
  // Flare-reload clack: two crisp mechanical transients (noise click + damped
  // 420 / 260 Hz body knock) 55 ms apart — the dispenser magazine seating.
  function flareClack() {
    if (!ready || !N.whiteBuf) return;
    const t0 = ctx.currentTime + 0.05;
    [[0, 420, 0.3], [0.055, 260, 0.36]].forEach(([dt, fb, amp]) => {
      const at = t0 + dt;
      const src = ctx.createBufferSource(); src.buffer = N.whiteBuf;
      const bp = filt('bandpass', 3800, 1.8), g = gain(0);
      g.gain.setValueAtTime(amp, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.035);
      src.connect(bp).connect(g).connect(N.body); src.start(at, Math.random() * 2); src.stop(at + 0.05);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(fb, at); o.frequency.exponentialRampToValueAtTime(fb * 0.6, at + 0.08);
      const og = gain(0); og.gain.setValueAtTime(amp * 0.6, at); og.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      o.connect(og).connect(N.body); o.start(at); o.stop(at + 0.1);
    });
  }
  // CLOSE CALL: a bandit missile tearing past the canopy — band-passed noise
  // sweeping 3.2 kHz -> 380 Hz with a Doppler-dropping motor buzz.
  function missileWhoosh() {
    if (!ready || !N.whiteBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = N.whiteBuf;
    const bp = filt('bandpass', 3200, 2.2), g = gain(0);
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(380, t + 0.7);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.85, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    src.connect(bp).connect(g).connect(N.body); src.start(t, Math.random() * 2); src.stop(t + 0.9);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(340, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.6);
    const lp = filt('lowpass', 1400, 0.8), og = gain(0);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.16, t + 0.08); og.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    o.connect(lp).connect(og).connect(N.body);
    // Supersonic crack ahead of the whoosh: a short low thump as the shock passes.
    const th = ctx.createOscillator(); th.type = 'sine'; th.frequency.setValueAtTime(95, t); th.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const tg = gain(0); tg.gain.setValueAtTime(0.5, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    th.connect(tg).connect(N.body); th.start(t); th.stop(t + 0.25);
    duckWorld(0.5, 0.3); o.start(t); o.stop(t + 0.7);
  }

  /* ------------------------------------------- adaptive 3-layer soundtrack */
  // 136 BPM D-minor synth-rock step sequencer, lookahead-scheduled on
  // ctx.currentTime (a 25 ms timer + every audio frame top up 0.3 s of notes),
  // so frame-rate dips never move a note. 8-bar loop Dm | Dm | Bb | Bb | C | C | A | A
  // (bass D2 -> Bb1 -> C2 -> A1).
  //   L1 PATROL  pulsing sub-bass, dark filtered stereo pad, sonar ping (airborne)
  //   L2 FURBALL kick + gated snare, driving 16th saw arp bass (bandit < 3 km or x1.5)
  //   L3 ACE     detuned brass lead w/ vibrato + dotted-8th delay, 16th hats (x3.0 or Ace alive)
  // Layers crossfade with setTargetAtTime(0.6 s). Bus: layers -> musicGain (K
  // toggle) -> musicDuck (radio -35 %) -> master -> G-LOC tunnel, so the music
  // muffles with blackout and follows master volume / mute.
  const BPM = 136, STEP = 60 / BPM / 4, LOOK = 0.3, LOOP = 128;
  const ROOTS = [38, 34, 36, 33];                                        // D2 Bb1 C2 A1 (per 2 bars)
  const CHORDS = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]]; // Dm Bb C A (pad voicings)
  const ARP = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 10, 7];
  const MELODY = [                                                       // [step, midi, len] per bar
    [[0, 69, 4], [4, 74, 4], [8, 76, 2], [10, 77, 2], [12, 76, 2], [14, 74, 2]],
    [[0, 81, 8], [8, 79, 4], [12, 77, 4]],
    [[0, 74, 4], [4, 77, 4], [8, 82, 6], [14, 81, 2]],
    [[0, 79, 8], [8, 77, 4], [12, 74, 4]],
    [[0, 76, 4], [4, 79, 4], [8, 84, 6], [14, 82, 2]],
    [[0, 81, 8], [8, 79, 4], [12, 76, 4]],
    [[0, 73, 4], [4, 76, 4], [8, 81, 4], [12, 85, 4]],
    [[0, 86, 12], [12, 85, 4]]
  ];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  let musicOn = true, mStep = 0, mNext = 0, mLvl = 0, mLvlT = 0, mNear = false, mIdleT = 0, mNotes = 0, mTimer = null;
  // Manifest + unlock helpers. Declared as functions so initMusic can call them
  // before their textual definition; no per-frame work or allocation here.
  function setPending(scn) { pendingScn = scn || null; pendScn = scn || ''; }
  function auditBgmKeys() {
    const man = (manifest && manifest.scenarios) || {};
    let missing = 0;
    for (let i = 0; i < BGM_KEYS.length; i++) {
      const k = BGM_KEYS[i];
      if (!man[k]) { console.log('[ANGELS_ZERO] bgm key MISSING ' + k + ' (from manifest)'); missing++; }
      if (RESOLVER_KEYS.indexOf(k) < 0) { console.log('[ANGELS_ZERO] bgm key MISSING ' + k + ' (from resolver)'); missing++; }
    }
    for (const id in MISSIONS) {
      const k = MISSIONS[id].bgmScenario;
      if (k && !man[k]) { console.log('[ANGELS_ZERO] bgm key MISSING ' + k + ' (from missions)'); missing++; }
    }
    if (!missing) console.log('[ANGELS_ZERO] bgm keys ok=' + BGM_KEYS.length);
  }
  function fetchManifest() {
    fetch(BGM_DIR + 'manifest.json').then(r => {
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    }).then(m => {
      if (m && m.scenarios) {
        for (const k in m.scenarios) {
          if (!Array.isArray(m.scenarios[k])) continue;
          m.scenarios[k] = m.scenarios[k].map(e => typeof e === 'string'
            ? { file: e, title: e.replace(/_0\d\.ogg$/, '').toUpperCase() } : e);
        }
        manifest = m;
      }
      manifestReady = true;
      auditBgmKeys();
      if (pendingScn) switchTo(pendingScn, true);           // manifest landed after the gesture
    }).catch(e => {
      console.log('[ANGELS_ZERO] bgm manifest FAIL ' + (e && e.message ? e.message : e));
      if (manifestRetries++ < 1) setTimeout(fetchManifest, 2000);   // one retry; synth fallback untouched
    });
  }
  function initMusic() {
    if (BGM_OK) {
      // src -> g -> musicBus -> duckG -> musicVolG -> master (all created once).
      N.musicBus = gain(0.62); N.duckG = gain(1); N.musicVolG = gain(musicOn ? musicVol : 0);
      N.musicBus.connect(N.duckG).connect(N.musicVolG);
    N.gBgmG = gain(1); N.musicVolG.connect(N.gBgmG).connect(master);
      for (let i = 0; i < 2; i++) {
        const el = new Audio();
        el.loop = true; el.preload = 'none'; el.crossOrigin = 'anonymous';
        // The real 'playing' event is the single source of truth for playback state.
        el.addEventListener('playing', onDeckPlaying);
        decks.push({ el, src: ctx.createMediaElementSource(el), g: gain(0) });
        decks[i].src.connect(decks[i].g).connect(N.musicBus);
        // Attached once per deck; auto-advance never re-registers listeners.
        el.addEventListener('timeupdate', () => {
          const d = decks[i];
          if (d !== decks[active] || advancing || !musicOn) return;
          if (isFinite(el.duration) && el.duration - el.currentTime <= XFADE) advance();
        });
        el.addEventListener('ended', () => { if (decks[i] === decks[active]) advance(); });
      }
      // The manifest is the ONLY network request; the .ogg files stream through Audio().
      fetchManifest();
      armUnlock();
      return;
    }
    // --- legacy synth fallback (older Safari without Ogg Vorbis) ---
    N.music = gain(musicOn ? musicVol : 0);
    N.musicDuck = gain(1);
    N.musicBus = gain(0.62);
    N.music.connect(N.musicDuck).connect(N.musicBus).connect(master);
    N.mDelay = ctx.createDelay(1); N.mDelay.delayTime.value = STEP * 3;
    N.mFb = gain(0.34); N.mWet = gain(0.3); N.mDelayLP = filt('lowpass', 3200, 0.5);
    N.mDelay.connect(N.mDelayLP).connect(N.mFb).connect(N.mDelay); N.mDelayLP.connect(N.mWet).connect(N.music);
    N.mL = [gain(0), gain(0), gain(0)];
    for (const g of N.mL) g.connect(N.music);
    N.mSend = [gain(0.22), gain(0), gain(0.45)];
    N.mL.forEach((g, i) => g.connect(N.mSend[i]).connect(N.mDelay));
    N.padLP = filt('lowpass', 750, 1.1); N.padLP.connect(N.mL[0]);
    N.padLFO = osc('sine', 0.07); N.padLFOAmt = gain(380); N.padLFO.connect(N.padLFOAmt).connect(N.padLP.frequency);
    if (!mTimer) mTimer = setInterval(musicTick, 25);
  }
  // Autoplay unlock: every gesture retries until a deck reports a real 'playing'
  // event. Listeners are bound once and removed as soon as that event arrives.
  function onGesture() {
    unlocked = true;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (pendingScn) switchTo(pendingScn, true);
    else {
      const d = decks[active];
      if (d && d.el && d.el.paused && !bgmPausedByUser) playDeck(d);
    }
  }
  function armUnlock() {
    if (!BGM_OK || playConfirmed || gestureArmed) return;
    gestureArmed = true;
    for (let i = 0; i < GESTURES.length; i++) window.addEventListener(GESTURES[i], onGesture, { capture: true, passive: true });
  }
  function disarmUnlock() {
    if (!gestureArmed) return;
    gestureArmed = false;
    for (let i = 0; i < GESTURES.length; i++) window.removeEventListener(GESTURES[i], onGesture, { capture: true });
  }
  // --- track catalogue + shuffle bag ----------------------------------------
  function tracksOf(scn) {
    const list = manifest && manifest.scenarios && manifest.scenarios[scn];
    return list && list.length ? list : null;
  }
  function allTracks() { return manifest && manifest.tracks && manifest.tracks.length ? manifest.tracks : null; }
  function nextIdx(scn) {
    const list = tracksOf(scn);
    if (!list) return 0;
    const n = list.length;
    if (!bag[scn] || (bagPos[scn] || 0) >= n) {
      const b = new Int8Array(n);
      for (let i = 0; i < n; i++) b[i] = i;
      for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0, t = b[i]; b[i] = b[j]; b[j] = t; }
      if (n > 1 && b[0] === (lastIdx[scn] ?? -1)) { const t = b[0]; b[0] = b[1]; b[1] = t; }
      bag[scn] = b; bagPos[scn] = 0;
    }
    return bag[scn][bagPos[scn]++];
  }
  function emitChange() {
    if (!changeCb) return;
    const t = tracksOf(curScn), title = t && t[currentIdx] ? t[currentIdx].title : '';
    const key = `${curScn}/${currentIdx}/${auto ? 1 : 0}`;
    if (key === changeKey) return;
    changeKey = key;
    changeCb({ title, scn: curScn, idx: currentIdx, auto });
  }
  // Handlers bound once; no closure is created per play() call or per frame.
  const onPlayOK = () => { retryT = 0; bgmRetries = 0; };
  const onPlayFail = e => {
    const name = e && e.name ? e.name : 'Error';
    if (name === 'AbortError') return;
    loading = false;
    console.log('[ANGELS_ZERO] bgm play blocked ' + name);
    if (name === 'NotAllowedError') { setPending(pendingScn || cScn || curScn); armUnlock(); }
    else if (bgmRetries < BGM_RETRY_MAX) { bgmRetries++; retryT = BGM_RETRY_S; }
  };
  function playDeck(deck) {
    if (!deck || !deck.el || !deck.el.src || bgmPausedByUser) return;
    deck.el.play().then(onPlayOK).catch(onPlayFail);
  }
  function onDeckPlaying(e) {
    loading = false;
    let played = -1;
    for (let i = 0; i < decks.length; i++) if (decks[i].el === e.target) { played = i; break; }
    // Only the deck we intended to start commits the logical scenario, so the
    // bgm getter and the widget always describe what is actually playing.
    if (played >= 0 && played === cIdle) { active = played; curScn = cScn; currentIdx = cIdx; dwell = 0; }
    playConfirmed = true; unlocked = true;
    setPending(null); pendingForce = false;
    disarmUnlock(); retryT = 0; bgmRetries = 0;
    emitChange();                                  // the widget repaints here, not before play resolves
  }
  // Equal-power crossfade between the two decks. An explicit idx pins a track.
  function crossfadeTo(scn, idx, force = false, userAction = false) {
    if (!BGM_OK || !decks.length) return;
    if (!manifestReady || (ctx && ctx.state === 'suspended')) {
      setPending(scn); pendingForce = pendingForce || force; armUnlock(); return;
    }
    const list = tracksOf(scn);
    if (!list || !list.length) { setPending(scn); pendingForce = pendingForce || force; armUnlock(); return; }
    const i = Number.isInteger(idx) && idx >= 0 && idx < list.length ? idx : nextIdx(scn);
    const cur = decks[active];
    // Never abort an already in-flight load for the same scenario unless triggered by user skip/select.
    if (loading && scn === cScn && !userAction) return;
    if (!force && !pendingScn && scn === curScn && cur.el.src && !cur.el.paused && cur.el.currentTime > 0) return;
    lastIdx[scn] = i;
    const idle = 1 - active, out = active, seq = ++switchSeq;
    const d = decks[idle], o = decks[out];
    d.el.src = BGM_DIR + list[i].file; d.el.currentTime = 0;
    d.el.loop = list.length === 1;
    d.g.gain.cancelScheduledValues(ctx.currentTime); d.g.gain.setValueAtTime(0, ctx.currentTime);
    const now = ctx.currentTime;
    d.g.gain.setValueCurveAtTime(sinCurve, now, XFADE);
    o.g.gain.cancelScheduledValues(now); o.g.gain.setValueAtTime(o.g.gain.value, now);
    o.g.gain.setValueCurveAtTime(cosCurve, now, XFADE);
    cScn = scn; cIdx = i; cIdle = idle; cSeq = seq;
    loading = true; dwell = 0; setPending(null); pendingForce = false;
    playDeck(d);
    setTimeout(() => {
      if (seq !== switchSeq || active !== idle) return;
      try { o.el.pause(); o.el.removeAttribute('src'); o.el.load(); } catch (e) { /* already released */ }
      o.g.gain.value = 0;
    }, (XFADE + 0.1) * 1000);
  }
  function switchTo(scn, force = false) {
    if (!BGM_OK) return;
    if (BGM_KEYS.indexOf(scn) < 0) {
      console.log('[ANGELS_ZERO] bgm key UNKNOWN ' + scn + ' -> 03_air_superiority');
      scn = '03_air_superiority';
    }
    // Defer BEFORE the decks check: the first scenario usually arrives before
    // init() has built the two deck elements.
    if (!manifestReady || !decks.length || (ctx && ctx.state === 'suspended')) {
      setPending(scn); pendingForce = pendingForce || force; armUnlock(); return;
    }
    crossfadeTo(scn, auto ? nextIdx(scn) : null, force);
  }
  function manualNext() {
    const list = allTracks();
    if (!list || !list.length) return null;
    const id = (manualId + 1 + list.length * 2) % list.length;
    const t = list[id], own = tracksOf(t.scn);
    return { scn: t.scn, idx: own ? own.findIndex(e => e.file === t.file) : 0, id };
  }
  function advance() {
    if (advancing || !BGM_OK) return;
    advancing = true;
    if (auto) crossfadeTo(curScn, nextIdx(curScn), true, true);
    else {
      const nx = manualNext();
      if (nx) { manualId = nx.id; crossfadeTo(nx.scn, nx.idx < 0 ? 0 : nx.idx, true, true); }
    }
    clearTimeout(advTimer);
    advTimer = setTimeout(() => { advancing = false; }, (XFADE + 0.1) * 1000);
  }
  function selectTrack(id) {
    const list = allTracks(), t = list && list[id];
    if (!t) return;
    auto = false; manualId = id;
    const own = tracksOf(t.scn), idx = own ? own.findIndex(e => e.file === t.file) : 0;
    crossfadeTo(t.scn, idx < 0 ? 0 : idx, true, true);     // widget repaints on 'playing'
  }
  function skip(dir) {
    if (!auto) {
      const all = allTracks(), n = all ? all.length : 24;
      selectTrack((manualId + (dir > 0 ? 1 : -1) + 2 * n) % n);
      return;
    }
    const list = tracksOf(curScn);
    if (!list) return;
    let target;
    if (dir > 0) target = nextIdx(curScn);
    else {
      const b = bag[curScn];
      if (!b || b.length < 2) target = nextIdx(curScn);
      else { const p = ((bagPos[curScn] || 0) - 2 + b.length * 2) % b.length; target = b[p]; bagPos[curScn] = p + 1; }
    }
    crossfadeTo(curScn, target, true, true);
  }
  function setAuto(on) {
    auto = !!on;
    if (auto) { manualId = -1; dwell = MIN_DWELL; }
    else {
      const own = tracksOf(curScn), file = own && own[currentIdx] ? own[currentIdx].file : '';
      const all = allTracks();
      manualId = all ? all.findIndex(t => t.scn === curScn && t.file === file) : 0;
      if (manualId < 0) manualId = 0;
    }
    emitChange();
  }
  function onBgmChange(cb) { changeCb = cb || null; if (changeCb) emitChange(); }
  // Priority-ordered resolver: first matching scenario wins.
  // Mission-aware priority: dynamic overrides first, then the mission's own track.
  // wxOverride gates night/storm so CANYON_RUN / NAVAL_BATTLE / ACE_DUEL keep their score.
  function resolveScenario(c) {
    if (bgmForce) return bgmForce;
    if (!c) return '01_hangar';
    if (c.debrief || c.landed) return '12_debrief';
    if (c.ambush) return '10_last_stand';
    if (c.intrusion) return '08_crimson_duel';
    if (c.rtb) return '11_rtb';
    if (c.app === 'MENU') return '01_hangar';
    if (c.onGround && !c.launched) return '02_catapult';
    if (c.inCombat && (c.dmg >= 0.75 || c.msl === 0)) return '10_last_stand';
    if (c.wxOverride && (c.storm || c.rain > 0.3)) return '04_storm';
    if (c.wxOverride && (c.night || c.nvg)) return '05_night';
    return c.bgmScenario || '03_air_superiority';
  }
  function env(g, at, peak, a, d, sus = 0.0008) {
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0008), at + a + d);
  }
  function voice(type, f, at, len, peak, out, a = 0.005, detune = 0, pan = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = gain(0); env(g, at, peak, a, len);
    let node = o.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(out); o.start(at); o.stop(at + a + len + 0.05); mNotes++;
    return o;
  }
  function noiseHit(at, len, peak, out, type, f, q = 0.8) {
    const s = ctx.createBufferSource(); s.buffer = N.whiteBuf;
    const b = filt(type, f, q), g = gain(0); env(g, at, peak, 0.002, len);
    s.connect(b).connect(g).connect(out); s.start(at, Math.random() * 3); s.stop(at + len + 0.05); mNotes++;
  }
  function scheduleStep(s, t) {
    const bar = (s >> 4) & 7, st = s & 15, ci = bar >> 1, root = ROOTS[ci];
    const on = N.mL.map(g => g.gain.value > 0.003 || N.mTgt[N.mL.indexOf(g)] > 0);
    if (on[0]) {
      if (!(st & 1)) {                                                   // pulsing 8th-note sub-bass
        voice('sine', mtof(root), t, STEP * 1.7, st % 4 === 0 ? 0.36 : 0.24, N.mL[0], 0.004);
        voice('triangle', mtof(root + 12), t, STEP * 0.9, 0.05, N.mL[0], 0.004);
      }
      if (st === 0 && !(bar & 1)) {                                      // dark stereo pad, one chord per 2 bars
        const len = STEP * 32;
        for (const m of CHORDS[ci]) for (const [dt, pn] of [[-8, -0.6], [8, 0.6]]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
          const g = gain(0), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.028, t + 0.9);
          g.gain.setValueAtTime(0.028, t + len - 0.5); g.gain.linearRampToValueAtTime(0, t + len + 0.6);
          if (p) { p.pan.value = pn; o.connect(g).connect(p).connect(N.padLP); } else o.connect(g).connect(N.padLP);
          o.start(t); o.stop(t + len + 0.7); mNotes++;
        }
      }
      if (st === 0 || st === 10) voice('sine', mtof(root + 48 + (st ? 7 : 0)), t, 1.1, st ? 0.022 : 0.04, N.mL[0], 0.003);   // sonar ping
    }
    if (on[1]) {
      if (st % 4 === 0 || st === 14) {                                   // kick
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        const g = gain(0); env(g, t, st === 14 ? 0.5 : 0.85, 0.002, 0.26);
        o.connect(g).connect(N.mL[1]); o.start(t); o.stop(t + 0.32); mNotes++;
        noiseHit(t, 0.012, 0.18, N.mL[1], 'highpass', 3000);            // beater click
      }
      if (st === 4 || st === 12) {                                       // gated snare
        const s2 = ctx.createBufferSource(); s2.buffer = N.whiteBuf;
        const b = filt('bandpass', 1900, 0.7), g = gain(0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.42, t + 0.002); g.gain.setValueAtTime(0.34, t + 0.09); g.gain.linearRampToValueAtTime(0, t + 0.11);
        s2.connect(b).connect(g).connect(N.mL[1]); s2.start(t, Math.random() * 3); s2.stop(t + 0.14);
        voice('triangle', 196, t, 0.08, 0.22, N.mL[1], 0.002); mNotes++;
      }
      {                                                                  // 16th saw arp bass with filter pluck
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(root + 12 + ARP[st]);
        const lp = filt('lowpass', 2400, 4), g = gain(0);
        lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(420, t + STEP * 0.9);
        env(g, t, st % 4 === 0 ? 0.11 : 0.08, 0.003, STEP * 0.95);
        o.connect(lp).connect(g).connect(N.mL[1]); o.start(t); o.stop(t + STEP + 0.05); mNotes++;
      }
    }
    if (on[2]) {
      noiseHit(t, st & 1 ? 0.022 : 0.035, st & 1 ? 0.05 : 0.085, N.mL[2], 'highpass', 8200, 1.2);   // double-time closed hats
      for (const [ns, m, ln] of MELODY[bar]) if (ns === st) {            // brass lead
        const len = ln * STEP;
        const lp = filt('lowpass', 700, 1.6), g = gain(0);
        lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(3600, t + 0.07); lp.frequency.setTargetAtTime(2100, t + 0.07, 0.15);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.075, t + 0.05);
        g.gain.setValueAtTime(0.068, t + Math.max(0.06, len - 0.06)); g.gain.linearRampToValueAtTime(0, t + len + 0.08);
        lp.connect(g).connect(N.mL[2]);
        let vib = null;
        if (len > 0.3) {                                                 // delayed 5.6 Hz vibrato on held notes (own LFO, stops with the note)
          const v = ctx.createOscillator(); v.frequency.value = 5.6; vib = gain(0);
          vib.gain.setValueAtTime(0, t); vib.gain.linearRampToValueAtTime(9, t + 0.3);
          v.connect(vib); v.start(t); v.stop(t + len + 0.12);
        }
        for (const [type, dt] of [['sawtooth', -9], ['sawtooth', 9], ['square', 0]]) {
          const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m) * (type === 'square' ? 0.5 : 1); o.detune.value = dt;
          if (vib) vib.connect(o.detune);
          const og = gain(type === 'square' ? 0.35 : 1);
          o.connect(og).connect(lp); o.start(t); o.stop(t + len + 0.12); mNotes++;
        }
      }
    }
  }
  function musicTick(dtOverride) {
    if (!ready || ctx.state !== 'running') return;
    if (BGM_OK) {
      // Once per frame: resolve the scenario, enforce dwell, start crossfades.
      // Debug stepping may pass its own dt; production uses the wall clock.
      let dt = dtOverride;
      if (dt === undefined) {
        const nowMs = performance.now();
        dt = lastTickT ? Math.min(0.1, (nowMs - lastTickT) / 1000) : 0;
        lastTickT = nowMs;
      }
      dwell += dt;
      // Retry a failed play() once its timer expires (capped, no per-frame allocation).
      if (retryT > 0) {
        retryT -= dt;
        if (retryT <= 0) {
          retryT = 0;
          if (pendingScn) switchTo(pendingScn, true);
          else playDeck(decks[active]);
        }
      }
      const scn = resolveScenario(bgmCtx);
      const wait = (scn === '12_debrief' || scn === '01_hangar' || scn === '11_rtb') ? 0 : MIN_DWELL;
      if (auto && (scn !== curScn || pendingScn || pendScn) && !(loading && scn === cScn && !pendingForce && !pendingScn) && dwell >= wait) {
        switchTo(scn, pendingForce);
        pendingForce = false;
      }
      return;
    }
    if (!N.mL) return;
    const live = musicOn && (N.mTgt.some(v => v > 0) || ctx.currentTime < mIdleT);
    if (!live) { mNext = 0; return; }
    const now = ctx.currentTime;
    if (mNext < now - 0.2 || mNext === 0) mNext = now + 0.06;          // (re)start or recover after a stall
    while (mNext < now + LOOK) { scheduleStep(mStep, mNext); mNext += STEP; mStep = (mStep + 1) % LOOP; }
  }
  // Intensity: 0 off / 1 patrol (airborne) / 2 furball (bandit < 3 km, leaves
  // > 3.4 km, or combo >= x1.5) / 3 ace (combo >= x3.0 or the PHASE 3 Ace alive); 4 s hold before dropping.
  N.mTgt = [0, 0, 0];
  function updateMusic(p, dtOverride) {
    bgmCtx = p;
    if (BGM_OK) { musicTick(dtOverride); return; }
    if (!N.mL) return;
    const d = p.banditDist ?? Infinity, combo = p.combo || 1;
    mNear = mNear ? d < 3400 : d < 3000;
    let lvl = 0;
    if (p.airborne) { lvl = 1; if (mNear || combo >= 1.5) lvl = 2; if (combo >= 3 || p.ace) lvl = 3; }   // Ace phase = climax
    const now = ctx.currentTime;
    if (lvl >= mLvl || now - mLvlT > 4) { if (lvl !== mLvl) mLvlT = now; mLvl = lvl; }
    const tg = [mLvl >= 1 ? 0.9 : 0, mLvl >= 2 ? 1 : 0, mLvl >= 3 ? 1 : 0];
    tg.forEach((v, i) => { if (v !== N.mTgt[i]) { N.mTgt[i] = v; set(N.mL[i].gain, v, 0.6); } });
    if (mLvl > 0) mIdleT = now + 4;                                      // keep scheduling through the fade-out
    musicTick();
  }
  function setMusic(on) {
    musicOn = !!on;
    if (BGM_OK) {
      if (N.musicVolG) N.musicVolG.gain.setTargetAtTime(musicOn ? musicVol : 0, ctx.currentTime, 0.25);
      if (!musicOn) setTimeout(() => { if (!musicOn) for (const d of decks) { try { d.el.pause(); } catch (e) { /* noop */ } } }, 300);
      else if (unlocked || playConfirmed) {
        const d = decks[active];
        if (d && d.el.src) playDeck(d);
        else switchTo(pendingScn || pendScn || curScn, true);
      }
      return;
    }
    if (N.music) set(N.music.gain, musicOn ? musicVol : 0, 0.25);
    if (musicOn) mNext = 0;
  }
  // Music-bed level: 0..1, persisted separately from the master volume and the K toggle.
  function setMusicVolume(v) {
    musicVol = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('angelsZero_musicVol', String(musicVol)); } catch (e) { /* ignore */ }
    if (BGM_OK) { if (N.musicVolG) N.musicVolG.gain.setTargetAtTime(musicOn ? musicVol : 0, ctx.currentTime, 0.05); return; }
    if (N.music) set(N.music.gain, musicOn ? musicVol : 0, 0.08);
  }
  // Music ducking is owned solely by the radio transmission envelope (txOpen/txClose).
  // This legacy hook now only touches the short SFX dip; it never writes duckG.
  function setRadio(active) {
    if (N.duck) set(N.duck.gain, active ? 0.63 : 1, 0.08);
  }
  // PAUSED keeps the stream alive but ducks it; the world SFX bus stays untouched.
  function setBgmPause(on) {
    bgmPausedByUser = !!on;
    if (!BGM_OK || !N.duckG) return;
    const gp = N.duckG.gain, t = ctx.currentTime, cur = gp.value;
    gp.cancelScheduledValues(t); gp.setValueAtTime(cur, t);
    gp.linearRampToValueAtTime(on ? DUCK_GAIN : 1, t + DUCK_T);
    if (!bgmPausedByUser) playDeck(decks[active]);        // resume does not fight the pause
  }
  // ---- PTT transmission envelope --------------------------------------------
  function playPtt(buf) {
    if (!ready || !buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    s.connect(N.rPan); s.start();                          // one-shot source is the only per-event node
  }
  function rampDuck(to, secs) {
    if (!N.duckG) return;
    const gp = N.duckG.gain, t = ctx.currentTime;
    gp.cancelScheduledValues(t); gp.setValueAtTime(gp.value, t);
    gp.linearRampToValueAtTime(to, t + secs);
  }
  function txOpen(slot) {
    if (!ready || !N.rHP) return;
    const now = ctx.currentTime, cfg = RADIO_CH[slot && slot.ch] || RADIO_CH.DEFAULT;
    rxState = 'OPEN'; rxT = now; rxCur = slot || null;
    N.rHP.frequency.setValueAtTime(cfg.hp, now);
    N.rLP.frequency.setValueAtTime(cfg.lp, now);
    N.rShaper.curve = cfg.curve;
    N.rRingWet.gain.setValueAtTime(cfg.ring, now);
    N.rPan.pan.setValueAtTime(cfg.pan, now);
    playPtt(N.pttOpen);
    const sg = N.rStaticG.gain;
    sg.cancelScheduledValues(now); sg.setValueAtTime(sg.value, now);
    sg.linearRampToValueAtTime(STATIC_DB, now + 0.03);
    rampDuck(RADIO_DUCK, DUCK_ATK);
  }
  function txTail() {
    if (!ready || !N.rStaticG) return;
    const now = ctx.currentTime;
    rxState = 'TAIL'; rxT = now;
    playPtt(N.pttTail);
    const sg = N.rStaticG.gain;
    sg.cancelScheduledValues(now); sg.setValueAtTime(sg.value, now);
    sg.linearRampToValueAtTime(0, now + PTT_TAIL_S);
    rampDuck(1, PTT_TAIL_S + DUCK_REL);
    rxState = 'FADE';
    setTimeout(() => { if (rxState === 'FADE') { rxState = 'IDLE'; rxCur = null; } }, FADE_S * 1000);
  }
  function txClose() { txTail(); }
  // Mid-mission signal intrusion: mute the music bed and blast radio static for a
  // fixed window, then restore. Decks keep running, so autoplay is never disturbed.
  function bgmCut(secs = 1.5) {
    if (!ready || !N.duckG || !N.rStaticG) return;
    const t = ctx.currentTime, dur = Math.max(0.2, secs);
    rampDuck(0, 0.08);
    const sg = N.rStaticG.gain;
    sg.cancelScheduledValues(t); sg.setValueAtTime(sg.value, t);
    sg.linearRampToValueAtTime(0.6, t + 0.05);
    sg.setValueAtTime(0.6, t + Math.max(0.06, dur - 0.08));
    sg.linearRampToValueAtTime(0, t + dur);
    if (N.rStaticBP) N.rStaticBP.frequency.setValueAtTime(1400, t);
    setTimeout(() => { rampDuck(bgmPausedByUser ? DUCK_GAIN : 1, 0.25); }, dur * 1000);
  }
  // Mission-update sting: a short, clean music dip with no radio static. The
  // decks keep playing; index.html schedules the scenario snap at the low point.
  function bgmDip(secs = 1.2) {
    if (!ready || !N.duckG) return;
    const dur = Math.max(0.4, secs);
    rampDuck(0.03, 0.1);
    setTimeout(() => { rampDuck(bgmPausedByUser ? DUCK_GAIN : 1, 0.1); }, Math.max(0.2, dur - 0.1) * 1000);
  }
  function bgmStaticEnd() {
    if (!ready || !N.rStaticG) return;
    const t = ctx.currentTime, sg = N.rStaticG.gain;
    sg.cancelScheduledValues(t); sg.setValueAtTime(sg.value, t); sg.linearRampToValueAtTime(0, t + 0.12);
    rampDuck(bgmPausedByUser ? DUCK_GAIN : 1, 0.2);
  }
  // Lazy clip cache: single throttled background worker prevents fetch/decode hitches at launch.
  function preloadRadio(lines) {
    if (!ready || !ctx || !Array.isArray(lines)) return Promise.resolve(0);
    let next = 0;
    const worker = async () => {
      while (next < lines.length) {
        const line = lines[next++];
        if (!line || radioBufs[line.id]) continue;
        try {
          const res = await fetch(line.file);
          if (!res.ok) continue;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          if (buf) { radioBufs[line.id] = buf; radioState.loaded++; }
        } catch (e) { console.warn('[ANGELS_ZERO] radio decode failed', line.id, e && e.name, e && e.message); }
        await new Promise(r => setTimeout(r, 25));
      }
    };
    return worker().then(() => radioState.loaded);
  }
  // One-shot source per clip; returns duration in seconds (0 when uncached / unavailable).
  function playRadio(id, ch) {
    if (!ready || !ctx) return 0;
    const buf = radioBufs[id];
    if (!buf) return 0;
    const now = ctx.currentTime, cfg = RADIO_CH[ch] || RADIO_CH.DEFAULT;
    if (N.radioSrc) { try { N.radioSrc.onended = null; N.radioSrc.stop(now + 0.04); } catch (e) { /* already ended */ } }
    if (N.radioVg) {
      const og = N.radioVg.gain;
      og.cancelScheduledValues(now); og.setValueAtTime(og.value, now); og.linearRampToValueAtTime(0, now + 0.04);
    }
    txOpen({ ch: ch || 'AWACS' });
    const src = ctx.createBufferSource(); src.buffer = buf;
    const vg = N.rVoiceG[N.voiceIdx]; N.voiceIdx ^= 1;
    vg.gain.cancelScheduledValues(now); vg.gain.setValueAtTime(cfg.drive * 0.55, now);
    src.connect(vg);
    N.radioSrc = src; N.radioVg = vg;
    radioState.playing = true; radioState.plays++; radioState.lastId = id;
    src.onended = () => {
      if (N.radioSrc === src) { N.radioSrc = null; N.radioVg = null; }
      txClose(); radioState.playing = false; src.disconnect();
    };
    src.start(now + PTT_OPEN_S);
    rxState = 'TALK'; rxT = now + PTT_OPEN_S;
    return buf.duration + PTT_OPEN_S;
  }
  function stopRadio(fade = 0.04) {
    if (!N.radioSrc) return;
    const now = ctx.currentTime, src = N.radioSrc;
    try { src.onended = null; src.stop(now + fade); } catch (e) { /* already ended */ }
    if (N.radioVg) {
      const g = N.radioVg.gain;
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade);
    }
    N.radioSrc = null; N.radioVg = null; radioState.playing = false;
  }
  // Legacy hook: PTT open click only (the box is now driven by the queue).
  function radioSquelch() { playPtt(N.pttOpen); }

  // Thunder: a sharp crack (nearby) into a long rolling low rumble of brown noise
  // with random amplitude swells, k 0..1.2 by distance.
  function thunder(k = 1) {
    if (!ready) return;
    const t = ctx.currentTime, dur = 3.5 + 3 * Math.random();
    const n = ctx.createBufferSource(); n.buffer = N.brown; n.loop = true;
    const lp = filt('lowpass', 160 + 260 * Math.min(1, k), 0.8);
    lp.frequency.setValueAtTime(260 + 520 * Math.min(1, k), t); lp.frequency.exponentialRampToValueAtTime(90, t + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    let tt = t;
    for (let i = 0; i < 6; i++) {                          // rolling swells
      tt += 0.25 + Math.random() * (dur / 6);
      g.gain.linearRampToValueAtTime((0.25 + Math.random() * 0.45) * k, Math.min(tt, t + dur - 0.3));
    }
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(g).connect(master); n.start(t, Math.random() * 2); n.stop(t + dur + 0.1);
    if (k > 0.75) {                                        // close strike: initial crack
      const c = ctx.createBufferSource(); c.buffer = N.white;
      const bp = filt('bandpass', 900, 0.8);
      const cg = gain(0); cg.gain.setValueAtTime(0.35 * k, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      c.connect(bp).connect(cg).connect(master); c.start(t, Math.random()); c.stop(t + 0.4);
    }
  }

  // Overdrive curve (classic k-shaped soft/hard clip), amount = 35.
  function distortionCurve(amount) {
    const n = 2048, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
  // Short decaying-noise impulse response: the air echo after the gun stops.
  function airEcho(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 40 ? i / 40 : 1);
    }
    return ir;
  }
  // Trigger press: gain-only fade-in (~0.08 s as the barrels come up to speed — no pitch sweep).
  function gunTriggerOn() {
    const g = N.gunBus.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.85, t + 0.08);
  }
  // Trigger release: smooth 0.12 s decay; the convolver send rings on as the air tail.
  function gunTriggerOff() {
    const g = N.gunBus.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.12);
  }
  // Metallic 20 mm impact rattle: bright resonant pings plus a short noise tick.
  let lastHit = 0;
  function hit(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime;
    if (t - lastHit < 0.03) return;                  // cap the rate at ~33 Hz
    lastHit = t;
    const k = Math.min(1, Math.max(0.05, intensity));
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.018 + Math.random() * 0.01;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2100 + Math.random() * 2400;
      const bp = filt('bandpass', o.frequency.value, 9);
      const g = gain(0); g.gain.setValueAtTime(0.22 * k, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
      o.connect(bp).connect(g).connect(cockpitLP); o.start(at); o.stop(at + 0.08);
    }
    const n = ctx.createBufferSource(); n.buffer = N.white;
    const bp = filt('bandpass', 3200, 4);
    const ng = gain(0); ng.gain.setValueAtTime(0.3 * k, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.connect(bp).connect(ng).connect(cockpitLP); n.start(t, Math.random()); n.stop(t + 0.07);
  }

  /* ------------------------------------------- canopy rain-impact layer */
  // Active while rain > 0 or in cloud > 0.35. Droplet patter: randomised 4-12 ms
  // resonant band-pass bursts (2.0-5.2 kHz) like rain tapping hard polycarbonate,
  // scheduled ~60 ms ahead at a rate set by moisture and airspeed. Past ~220 kt the
  // taps blend into a taut high-velocity rain wash (band-pass 1.5 -> 4.4 kHz with
  // speed). View-aware: full in the cockpit, attenuated 65 % in chase view.
  function canopyRain(p, rn, kts) {
    const cl = Math.min(1, Math.max(0, p.cloud || 0));
    const wet = Math.max(rn, cl > 0.35 ? (cl - 0.35) / 0.65 * 0.7 : 0);
    const active = wet > 0.01 && p.engineOn;
    const spdK = sm(kts, 220, 520);
    set(N.canopyBus.gain, active ? (p.cockpit ? 1 : 0.35) : 0, 0.25);
    set(N.canopyTapBus.gain, 1 - 0.75 * spdK, 0.3);                  // taps smear into the wash at speed
    set(N.canopyHissBP.frequency, 1500 + 2900 * sm(kts, 150, 650), 0.3);
    set(N.canopyHissBP.Q, 0.9 + 0.8 * spdK, 0.3);
    set(N.canopyHissGain.gain, active ? wet * (0.012 + 0.11 * spdK) : 0, 0.3);
    const now = ctx.currentTime;
    if (!active) { N.canopyNext = now; N.canopyRate = 0; return; }
    const rate = wet * (35 + 130 * sm(kts, 0, 300));                  // taps per second
    N.canopyRate = rate;
    if (N.canopyNext < now) N.canopyNext = now;
    let n = 0;
    while (N.canopyNext < now + 0.06 && n < 24) {
      const t = N.canopyNext;
      const len = 0.004 + Math.random() * 0.008;                     // 4-12 ms
      const src = ctx.createBufferSource(); src.buffer = N.whiteBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = 2000 + Math.random() * 3200; bp.Q.value = 6 + Math.random() * 10;   // resonant acrylic tick
      const g = ctx.createGain(); g.gain.value = 0;
      const peak = (0.05 + Math.random() * 0.11) * (0.55 + 0.45 * wet);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.0008); g.gain.exponentialRampToValueAtTime(0.0005, t + len);
      src.connect(bp).connect(g).connect(N.canopyTapBus);
      src.start(t, Math.random() * 3, len + 0.01); src.stop(t + len + 0.02);
      N.canopyTaps++; n++;
      N.canopyNext += -Math.log(1 - Math.random()) / Math.max(rate, 1);    // Poisson arrivals
    }
  }

  // Sea-skim audio: stores scalars only; the continuous mix ramps the nodes.
  function setSpray(k, kt) { sprayK = k || 0; sprayKt = kt || 0; }
  // charge 0..1: pitch 880 -> 1760 Hz, pulse 2 -> 10 Hz, gain ramps with charge.
  function setFlagCharge(charge) {
    const k = Math.max(0, Math.min(1, charge || 0));
    if (!ready || !N.flagOsc) return;
    set(N.flagOsc.frequency, 880 + 880 * k, 0.08);
    set(N.flagLFO.frequency, 2 + 8 * k, 0.08);
    set(N.flagAM.gain, 0.02 + 0.05 * k, 0.08);
    set(N.flagG.gain, k > 0 ? 0.035 + 0.04 * k : 0, 0.06);
  }
  // Drone swarm proximity 0..1 (1 = closest). Pitch rises slightly as they close in.
  function setDroneHum(k) {
    const v = Math.max(0, Math.min(1, k || 0));
    if (!ready || !N.droneOsc) return;
    set(N.droneG.gain, 0.075 * v * v, 0.12);
    set(N.droneOsc.frequency, 140 + 26 * v, 0.12);
    set(N.droneBP.frequency, 620 + 300 * v, 0.12);
  }

  /* ------------------------------------------------------ continuous mix */
  function update(p) {
    if (!ready) return;
    const th = p.throttle, ab = p.afterburner, live = p.engineOn ? 1 : 0;
    const t = 0.30 + 0.70 * th;                           // 30 % idle hum -> 100 % military
    set(N.engLP.frequency, 260 + 1500 * t + 1400 * ab);
    // (engine body gain is set below, scaled when the recorded turbine is playing)
    set(N.engLowGain.gain, live * (0.18 + 0.20 * t + 0.45 * ab));
    const whine = 160 + 640 * t + 80 * ab;
    set(N.whineA.frequency, whine); set(N.whineB.frequency, whine * 1.013);
    set(N.whineBP.frequency, whine * 3.1);
    set(N.whineGain.gain, live * (0.012 + 0.03 * t) * (1 - 0.4 * ab));
    set(N.abBP.frequency, 180 + 260 * ab);
    set(N.abGain.gain, live * 0.75 * ab, 0.12);
    set(N.abCrackleGain.gain, live * 0.09 * ab * (0.7 + 0.3 * Math.random()), 0.03);
    set(cockpitLP.frequency, p.cockpit ? 2600 : 18000, 0.15);

    // Recorded turbine: pitch rides throttle / burner; under sustained G (> 4.8 G)
    // or high AoA (> 14 deg) it dips and the low compressor rumble swells.
    ensureSampleVoices();
    const gl = p.gLoad || 1, aoa = p.aoa || 0, gs = p.gStrain || 0;
    const strainK = Math.max(sm(gl, 4.8, 8.5), sm(aoa, 14, 24));
    if (N.turb) {
      set(N.turb.playbackRate, (0.78 + 0.32 * th + 0.12 * ab) * (1 - 0.07 * strainK), 0.15);
      set(N.turbPeak.gain, 8 * strainK, 0.2);
      set(N.turbLP.frequency, 1500 + 5000 * th + 3500 * ab, 0.12);
      set(N.turbGain.gain, live * (0.22 + 0.32 * th + 0.22 * ab), 0.1);
    }
    const sampleK = N.turb ? 0.5 : 1;                     // procedural body thins out under the real recording
    set(N.engGain.gain, live * (0.10 + 0.22 * t + 0.20 * ab) * sampleK);
    // F100 core: 82 / 84.5 Hz at idle -> ~165 Hz MIL; pitch sags ~8 % while lugging.
    const kts = p.kts || 0;
    const lugK = live * Math.max(sm(aoa, 10, 22), 0.6 * sm(gl, 3.2, 9));
    const coreF = (82 + 83 * th + 12 * ab) * (1 - 0.08 * lugK);
    set(N.coreA.frequency, coreF, 0.12); set(N.coreB.frequency, coreF * 1.03, 0.12);
    set(N.coreLP.frequency, 420 + 900 * th + 600 * ab, 0.12); set(N.coreGain.gain, live * (0.05 + 0.07 * th + 0.04 * ab), 0.1);
    set(N.comp.frequency, 1400 + 1200 * th, 0.15); set(N.compGain.gain, live * (0.004 + 0.012 * th) * (1 - 0.5 * ab), 0.12);
    set(N.subGain.gain, live * 0.22 * ab, 0.15);
    set(N.engLP.frequency, 320 + 900 * t + 1500 * ab);                    // exhaust roar LP 320 Hz -> 1.8 kHz in AB
    // Airframe metal groan + creak: 3.2 G -> 9 G.
    const groanK = live * sm(gl, 3.2, 9.0);
    set(N.groanGain.gain, 0.32 * groanK, 0.12); set(N.groanBP.frequency, 160 + 120 * groanK, 0.2);
    set(N.groanLFO.frequency, 0.35 + 0.6 * groanK, 0.3);
    N.res.forEach((r, i) => set(r.g.gain, groanK * (0.05 - i * 0.012) * (0.75 + 0.25 * Math.sin(ctx.currentTime * (1.3 + i) + i)), 0.08));
    // Turbine lug: 70-130 Hz rumble that deepens as the intakes fight the airflow.
    set(N.lug.frequency, 130 - 60 * lugK, 0.15); set(N.lugGain.gain, 0.22 * lugK, 0.12);
    // Wing buffet / wind rush: AoA > 9 deg or very high speed.
    // + dorsal speedbrake wind buffet, gear-out wind roar and runway tyre rumble.
    const buffK = live * Math.max(sm(aoa, 9, 20), 0.45 * sm(kts, 520, 680), 0.5 * sm(gl, 3.2, 8),
      0.55 * (p.airbrake || 0) * sm(kts, 140, 420), 0.28 * (p.gear || 0) * sm(kts, 120, 300), 0.32 * sm((p.rolling || 0) * 1.944, 4, 90));
    set(N.buffSweep.frequency, 220 + 460 * buffK, 0.1); set(N.buffGain2.gain, 0.42 * buffK, 0.1);
    if (N.buff) { set(N.buffGain.gain, 0.25 * buffK, 0.12); set(N.buff.playbackRate, 0.9 + 0.3 * buffK, 0.2); }
    set(N.buffFGain.gain, 0.25 * buffK * (0.7 + 0.3 * Math.random()), 0.05);
    updateWind(p, kts, live);
    // ---- pilot G physiology mix -------------------------------------------------
    const gStrain = p.gStrain || 0, gloc = !!p.gloc, gNeg = p.gNeg || 0;
    const S = sm(gStrain, 0.30, 0.95);
    const tunnelHz = gloc ? 200 : 14000 * Math.pow(320 / 14000, S);
    set(N.tunnel.frequency, tunnelHz, 0.15);
    if (N.gBgmG) set(N.gBgmG.gain, gloc ? 0.1 : 1 - 0.7 * S, 0.15);
    const tNow = ctx.currentTime;
    // AGSM: 3 s cycle from 4.5 G. Strain phase = 2.5 s of 4 Hz grunts, then a
    // 0.5 s exhale / inhale burst. Gain envelope only; the noise source is persistent.
    const breathK = (gloc ? 0.85 : 0.65 * sm(gl, 4.5, 8.5)) * live;
    set(N.breathG.gain, breathK, 0.1);
    if (breathK > 0.02 && tNow + 0.1 >= N.nextGBreath) {
      const at = Math.max(tNow, N.nextGBreath);
      const bg = N.breathG.gain;
      bg.setValueAtTime(0.15 * breathK, at);
      for (let i = 0; i < 10; i++) {
        const p0 = at + i * 0.25;
        bg.setValueAtTime(0.15 * breathK, p0);
        bg.linearRampToValueAtTime(0.55 * breathK, p0 + 0.07);
        bg.linearRampToValueAtTime(0.15 * breathK, p0 + 0.2);
      }
      bg.setValueAtTime(0.9 * breathK, at + 2.6); bg.linearRampToValueAtTime(0.1 * breathK, at + 3);
      N.nextGBreath = at + 3;
    }
    // G-suit inflation hiss at 4.5 G, re-armed below 4.2; soft deflation on unloading.
    if (gl >= 4.5 && N.gSuitArm && live) {
      N.gSuitArm = false;
      N.hissG.gain.cancelScheduledValues(tNow); N.hissG.gain.setValueAtTime(0, tNow);
      N.hissG.gain.linearRampToValueAtTime(0.28, tNow + 0.03);
      N.hissG.gain.setTargetAtTime(0, tNow + 0.03, 0.2);
    } else if (gl < 4.2) {
      if (!N.gSuitArm) {
        N.hissG.gain.cancelScheduledValues(tNow);
        N.hissG.gain.setValueAtTime(N.hissG.gain.value, tNow);
        N.hissG.gain.linearRampToValueAtTime(0.06, tNow + 0.05);
        N.hissG.gain.setTargetAtTime(0, tNow + 0.05, 0.25);
      }
      N.gSuitArm = true;
    }
    // Heartbeat: lub-dub pair 0.12 s apart, BPM 110 -> 165 with strain.
    const bpm = 110 + 55 * sm(gStrain, 0.30, 1.0);
    const heartK = (gloc ? 1 : 0.62 * sm(gStrain, 0.30, 0.6)) * live;
    set(N.heartG.gain, heartK, 0.08);
    if (heartK > 0.02 && tNow + 0.1 >= N.nextGBeat) {
      const at = Math.max(tNow, N.nextGBeat), period = 60 / bpm;
      for (const [off, amp, f] of [[0, 1, 55], [0.12, 0.72, 42]]) {
        const o = off ? N.heartB : N.heartA, g = off ? N.heartBGain : N.heartAGain;
        o.frequency.setValueAtTime(f, at + off);
        if (g) { g.gain.cancelScheduledValues(at + off); g.gain.setValueAtTime(0, at + off);
          g.gain.linearRampToValueAtTime(amp * heartK, at + off + 0.012);
          g.gain.exponentialRampToValueAtTime(0.001, at + off + 0.16); }
      }
      N.nextGBeat = at + period;
      N.beatPhase = at;
    }
    // Tinnitus: 7.8 / 8.1 kHz ring at high strain, 0.08 in G-LOC, 2 s fade on waking.
    let tin = 0.04 * sm(gStrain, 0.65, 0.99);
    if (gloc) { tin = 0.08; N.tinFade = tNow + 2; }
    if (N.tinFade && tNow < N.tinFade) tin = Math.max(tin, 0.08 * (N.tinFade - tNow) / 2);
    set(N.tinG.gain, live ? tin : 0, 0.12);
    // Hydraulic whine: rises with stick load while the system is damaged.
    const hd = Math.max(0, Math.min(1, p.hydDamage || 0)), stick = Math.max(0, Math.min(1, p.stick || 0));
    set(N.hydG.gain, 0.12 * hd * sm(stick, 0.08, 0.6), hd > 0 && stick > 0.08 ? 0.05 : 0.25);
    set(N.hydOsc.frequency, 380 + 220 * stick, 0.1);
    vwsUpdate(p.dt || 0.016);
    N.gmix = { lp: N.tunnel.frequency.value, bpm: bpm, breath: breathK, tin: tin, beatPhase: N.beatPhase || 0, neg: gNeg, hyd: N.hydG.gain.value };
    N.dbg = { groanK: +groanK.toFixed(2), lugK: +lugK.toFixed(2), buffK: +buffK.toFixed(2), breathK: +breathK.toFixed(2), heartK: +heartK.toFixed(2), tunnel: Math.round(N.tunnel.frequency.value), bpm: Math.round(bpm), neg: +gNeg.toFixed(2) };
    if (p.glocWarn && (!N.chimeT || ctx.currentTime - N.chimeT > 2.4)) { glocChime(); N.chimeT = ctx.currentTime; }
    if (!p.glocWarn) N.chimeT = 0;

    const firing = !!p.firing;
    if (firing && !N.wasFiring) gunTriggerOn();
    if (!firing && N.wasFiring) gunTriggerOff();
    N.wasFiring = firing;
    // Cockpit: crack muffled to 2.8 kHz, fuselage thump boosted at 120 Hz. Chase: open 5.5 kHz air crackle.
    set(N.gunCrackLP.frequency, p.cockpit ? 2800 : 5500, 0.08);
    set(N.gunThumpPeak.gain, p.cockpit ? 6 : 0, 0.08);
    set(N.gunCrackGain.gain, p.cockpit ? 0.45 : 0.6, 0.08);

    // SCAN: steady low growl. ACQ: brighter growl pulsed at ~8 Hz. LOCK: continuous 950 Hz tone.
    const acqOn = p.seeker === 'ACQ' && (ctx.currentTime * 8) % 1 < 0.55;
    set(N.growlGain.gain, p.seeker === 'SCAN' ? 0.045 : acqOn ? 0.07 : 0, 0.012);
    set(N.growl.frequency, p.seeker === 'ACQ' ? 420 : 260, 0.05);
    set(N.lockGain.gain, p.seeker === 'LOCK' ? 0.05 : 0, 0.02);

    // Falling bomb: pitch slides from 1.6 kHz to 450 Hz across the fall (p.whistle = {level, fall}).
    const wl = p.whistle ? p.whistle.level : 0, wf = p.whistle ? p.whistle.fall : 0;
    set(N.whistle.frequency, 1600 - 1150 * Math.min(1, wf), 0.05);
    set(N.whistleGain.gain, 0.05 * wl, 0.08);
    set(N.windBP.frequency, 1500 - 900 * Math.min(1, wf), 0.08);
    set(N.windGain.gain, 0.08 * wl, 0.08);

    const rn = Math.min(1, Math.max(0, p.rain || 0));
    set(N.rainGain.gain, 0.11 * rn * (p.cockpit ? 1 : 0.6), 0.4);
    set(N.rainBP.frequency, p.cockpit ? 1700 : 3200, 0.3);
    set(N.rainLowGain.gain, 0.07 * rn * (p.cockpit ? 1.2 : 0.5), 0.4);
    canopyRain(p, rn, kts);
    // Damp in-cloud wind rush: louder and brighter with airspeed (fast cloud pass = roar).
    const cl = Math.min(1, Math.max(0, p.cloud || 0)), spdK = sm(kts, 180, 560);
    set(N.cloudGain.gain, 0.32 * cl * (0.45 + 0.35 * spdK + 0.2 * Math.min(1, th + ab)), 0.25);
    set(N.cloudLP.frequency, 300 + 380 * cl + 520 * cl * spdK, 0.3);
    set(N.cloudHissGain.gain, (0.02 + 0.03 * spdK) * cl, 0.3);
    const mk = p.cockpit ? sm(p.cloud || 0, 0.25, 0.8) : 0, spdK2 = sm(kts, 150, 550);
    set(N.mistG.gain, 0.055 * mk * (0.55 + 0.45 * spdK2), 0.25);
    set(N.mistAM.gain, 0.02 * mk, 0.25);
    set(N.mistBP.frequency, 7000 + 3000 * spdK2, 0.3);
    const sGain = sprayK * 0.45 * (0.6 + 0.4 * Math.min(1, sprayKt / 500));
    set(N.sprayG.gain, sGain, sGain > N.sprayG.gain.value ? 0.12 : 0.04);
    set(N.sprayBP.frequency, 700 + 1400 * sprayK, 0.12);
    set(N.rumbleG.gain, sprayK * sprayK * 0.3, sprayK > 0 ? 0.12 : 0.04);

    // RWR: soft search chirps when painted, quicker bright triple pips on a full
    // lock, and the rapid high-pitched launch warble only while a missile is inbound.
    const lvl = p.rwr || 0, now = ctx.currentTime;
    if (lvl >= 1 && lvl < 3 && !p.alert) {
      if (!N.nextChirp || now >= N.nextChirp) { rwrChirp(lvl); N.nextChirp = now + (lvl >= 2 ? 0.42 : 1.35); }
    } else N.nextChirp = 0;
    if (p.alert) {
      const phase = Math.floor(now / 0.065) % 2;
      N.alert.frequency.setValueAtTime(phase ? 1900 : 2700, now);
      set(N.alertGain.gain, 0.055, 0.008);
    } else set(N.alertGain.gain, 0, 0.02);
  }

  function setVolume(v) {
    volume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('az_volume', String(volume)); } catch (e) { /* ignore */ }
    if (master) set(master.gain, muted ? 0 : volume, 0.05);
    if (N.body) set(N.body.gain, muted ? 0 : volume, 0.05);
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('az_muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) set(master.gain, muted ? 0 : volume, 0.05);
    if (N.body) set(N.body.gain, muted ? 0 : volume, 0.05);
  }

  return {
    init, resume, suspend, update, updateMusic, bgmCut, bgmDip, bgmStaticEnd, setSpray, setFlagCharge, setDroneHum, enemyGun, gunhit, explosion, sonicBoom, flybyWhoosh, fireBell, extinguisher, relightCrank, relightBoom, compressorStall, missileLaunch, samLaunch, hit, bombRelease, bombDetonation, flare, chaff, designate, lockDrop, nvg, rwrChirp, ecm, thunder, glocChime, overheat, flameout, masterCaution, mfdClick, aceWarning, cableScreech, catapult, slowMo, styleChime, missileWhoosh, steamHiss, flareClack, gearMotor, gearLock, tireScreech, setMusic, setRadio, setBgmPause, bumpBgmDwell() { dwell = MIN_DWELL; }, setBgmForce: v => { bgmForce = v || ''; }, switchTo, selectTrack, skip, setAuto, onBgmChange, get bgmTracks() { return allTracks() || []; }, radioSquelch, preloadRadio, playRadio, stopRadio, txOpen, txTail, txClose, preload,
    get radioAnalyser() { return N.rAnalyser || null; }, get radioFreq() { return N.rFreq || null; }, get radioTime() { return N.rTime || null; },
    get radioCh() { return RADIO_CH; },
    get radioDsp() { return { pttOpen: !!N.pttOpen, pttTail: !!N.pttTail, static: !!N.rStatic, hp: N.rHP ? N.rHP.frequency.value : 0,
      lp: N.rLP ? N.rLP.frequency.value : 0, pan: N.rPan ? N.rPan.pan.value : 0, ring: N.rRingWet ? N.rRingWet.gain.value : 0,
      shaper: !!(N.rShaper && N.rShaper.curve), analyser: !!N.rAnalyser }; },
    toggleMusic() { setMusic(!musicOn); return musicOn; },
    get musicOn() { return musicOn; }, setMusicVolume,
    get musicVolume() { return musicVol; },
    // Music state for __audioDebug: streamed decks when available, legacy sequencer otherwise.
    get music() {
      if (BGM_OK) return { on: musicOn, layer: 0, gains: decks.map(d => +d.g.gain.value.toFixed(2)),
        bar: 0, step: 0, notes: 0, duck: N.duckG ? +N.duckG.gain.value.toFixed(3) : 1,
        bus: N.musicVolG ? +N.musicVolG.gain.value.toFixed(2) : 0, ahead: 0, scn: curScn };
      return { on: musicOn, layer: mLvl, gains: N.mL ? N.mL.map(g => +g.gain.value.toFixed(2)) : [0, 0, 0],
        bar: (mStep >> 4) + 1, step: mStep, notes: mNotes, duck: N.musicDuck ? +N.musicDuck.gain.value.toFixed(2) : 1,
        bus: N.music ? +N.music.gain.value.toFixed(2) : 0, ahead: mNext && ctx ? +(mNext - ctx.currentTime).toFixed(3) : 0 };
    },
    get bgm() {
      if (!BGM_OK) return { ok: false, scn: '', idx: 0, dwell: 0, auto, manualId, file: '', title: '', bag: [], bagPos: 0 };
      const list = tracksOf(curScn), t = list && list[currentIdx], b = bag[curScn];
      return { scn: curScn, curScn, idx: currentIdx, dwell: +dwell.toFixed(2), auto, manualId,
        file: t ? t.file : '', title: t ? t.title : '', bag: b ? Array.from(b) : [], bagPos: bagPos[curScn] || 0,
        deckT: +decks[active]?.el.currentTime.toFixed(2) || 0, duck: N.duckG ? +N.duckG.gain.value.toFixed(3) : 1,
        unlocked: unlocked || playConfirmed, ok: BGM_OK, pending: pendingScn || pendScn || '',
        manifestReady, ctxState: ctx ? ctx.state : 'uninitialised', paused: !!decks[active]?.el.paused,
        pendingScn: pendingScn || pendScn || '', playConfirmed, retries: bgmRetries, force: pendingForce };
    },
    get bgmAuto() { return auto; }, get bgmDecks() { return decks; },
    resolveScenario,
    get radio() { return { ...radioState, rxState, rxT: +rxT.toFixed(2), cur: rxCur ? { ch: rxCur.ch, id: rxCur.id } : null,
      duck: N.duckG ? +N.duckG.gain.value.toFixed(3) : (N.duck ? +N.duck.gain.value.toFixed(2) : 1) }; }, setVolume, setMuted,
    get sfxStatus() { return { ...sfxState }; },
    toggleMute() { setMuted(!muted); return muted; },
    get volume() { return volume; }, get muted() { return muted; },
    get state() { return ctx ? ctx.state : 'uninitialised'; }, get ready() { return ready; },
    // Output level after the compressor (for the headless audio check / debugging).
    get rms() {
      if (!N.analyser) return 0;
      N.analyser.getFloatTimeDomainData(N.anaBuf);
      let s = 0; for (let i = 0; i < N.anaBuf.length; i++) s += N.anaBuf[i] * N.anaBuf[i];
      return Math.sqrt(s / N.anaBuf.length);
    },
    get layers() { return N.dbg || null; },
    get gmix() { return N.gmix || null; }, get dbg() { return N.dbg || null; }, gasp,
    vws: { say: vwsSay }, get vwsLast() { return { ...vwsLast }; },
    get vwsState() { return { q: Array.from(vwsQ), cd: Array.from(vwsCd), playing: vwsPlaying, until: vwsUntil }; }, get hydWhine() { return N.hydG ? +N.hydG.gain.value.toFixed(4) : 0; },
    preloadVWS(files) {
      return Promise.all(Object.entries(files || {}).map(([id, url]) => fetch(url).then(r => r.arrayBuffer())
        .then(ab => new Promise(res => { const pr = ctx.decodeAudioData(ab, res); if (pr && pr.catch) pr.catch(() => {}); }))
        .then(buf => { VWS_BUF[id] = buf; }).catch(() => {})));
    },
    setVWS(on) { vwsSpeech = !!on; }, setVWSMuted(on) { vwsMuted = !!on; }, setVWSLog(on) { vwsDebug = !!on; },
    // Slipstream / buffet bus targets + live AudioParam values (for __audioDebug).
    get wind() { return N.windDbg || null; },
    // Last two-stage detonation (crack band, sub sweep, crack / boom times, travel delay).
    get blast() { return N.lastBlast || null; },
    get boom() { return N.lastBoom || null; },
    get flyby() { return N.lastFlyby || null; },
    // Last slow-mo pulse (time + count) for __audioDebug.
    get slowMoDebug() { return N.lastSlowMo || null; },
    // Cockpit mist patter level + band centre for __audioDebug.
    get mist() { return N.mistG ? { gain: +N.mistG.gain.value.toFixed(4), hz: Math.round(N.mistBP.frequency.value) } : null; },
    get droneHum() { return N.droneG ? { gain: +N.droneG.gain.value.toFixed(4), hz: Math.round(N.droneOsc.frequency.value) } : null; },
    get spray() { return { k: +sprayK.toFixed(3), kt: Math.round(sprayKt), gain: N.sprayG ? +N.sprayG.gain.value.toFixed(4) : 0,
      hz: N.sprayBP ? Math.round(N.sprayBP.frequency.value) : 0, rumble: N.rumbleG ? +N.rumbleG.gain.value.toFixed(4) : 0 }; },
    // Canopy rain layer state (for __audioDebug): bus gain, hiss gain / band, tap rate and count.
    get canopyRain() {
      if (!N.canopyBus) return null;
      return { bus: +N.canopyBus.gain.value.toFixed(3), tapBus: +N.canopyTapBus.gain.value.toFixed(2), hiss: +N.canopyHissGain.gain.value.toFixed(4),
        hissHz: Math.round(N.canopyHissBP.frequency.value), rate: Math.round(N.canopyRate || 0), taps: N.canopyTaps };
    },
    // Output spectrum level (dB) at a frequency, for checking a cue against the engine floor.
    bandDb(hz) {
      if (!N.analyser) return -Infinity;
      const fd = new Float32Array(N.analyser.frequencyBinCount); N.analyser.getFloatFrequencyData(fd);
      const i = Math.round(hz / (ctx.sampleRate / 2) * fd.length);
      return Math.max(fd[i - 1] ?? -200, fd[i], fd[i + 1] ?? -200);
    },
    get duck() { return N.duck ? N.duck.gain.value : 1; }
  };
}
