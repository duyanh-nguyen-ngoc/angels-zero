// ANGELS ZERO — priority radio queue. Pre-allocated slots, no per-line allocations.
import { RADIO_BY_EVENT, RADIO_LINES } from './radioScript.js?v=s9de';

export const PRI = { CRITICAL: 3, STORY: 2, COMBAT: 1, AMBIENT: 0 };
export const GAP_S = 0.35;
export const CD = { CRITICAL: 1.0, STORY: 0, COMBAT: 6.0, AMBIENT: 20.0 };
export const LINE_CD = 30;                               // seconds per line id, except CRITICAL
export const TTL = { CRITICAL: 3, STORY: 30, COMBAT: 4, AMBIENT: 8 };
export const Q_N = 8;
const CRIT_CATS = new Set(['MISSILE', 'STALL', 'CAT', 'PULLUP', 'BINGO', 'DMG']);

export function createRadioQueue(THREE, env) {
  const { audio, onTx, onIdle, debug } = env;
  const slots = Array.from({ length: Q_N }, () => ({
    id: '', pri: 0, cat: '', ch: '', text: '', t: 0, exp: 0, dur: 0, live: false, line: null
  }));
  const lastCatT = Object.create(null);
  const lastLineT = new Map();
  let cur = null, curEnd = 0, gapUntil = 0;

  const lineById = id => {
    for (let i = 0; i < RADIO_LINES.length; i++) if (RADIO_LINES[i].id === id) return RADIO_LINES[i];
    return null;
  };
  const resetSlot = s => { s.id = ''; s.pri = 0; s.cat = ''; s.ch = ''; s.text = ''; s.t = 0; s.exp = 0; s.dur = 0; s.live = false; s.line = null; };

  function say(id, opts) {
    const now = performance.now() / 1000;
    let line = null;
    if (typeof id === 'object' && id) line = id;
    else if (Array.isArray(RADIO_BY_EVENT[id])) {
      const pool = RADIO_BY_EVENT[id];
      let pick = null;
      for (let tries = 0; tries < 8; tries++) {
        const c = pool[(Math.random() * pool.length) | 0];
        if (c.id !== lastByEvent[id]) { pick = c; break; }
      }
      line = pick || pool[0];
      lastByEvent[id] = line.id;
    } else line = lineById(id);
    if (!line) return false;
    const bypass = !!(opts && opts.bypass);
    const pri = opts && opts.pri !== undefined ? opts.pri : (line.pri || PRI.COMBAT);
    const cat = opts && opts.cat ? opts.cat : (line.cat || 'COMBAT');
    const critical = pri === PRI.CRITICAL;
    if (!bypass) {
      if (cat !== 'CRITICAL' && now - (lastCatT[cat] || -1e9) < CD[cat]) return false;
      if (!critical && now - (lastLineT.get(line.id) || -1e9) < LINE_CD) return false;
    }
    // CRITICAL of the same category replaces a queued one instead of stacking.
    if (critical) {
      for (let i = 0; i < Q_N; i++) {
        const s = slots[i];
        if (s.live && s.cat === cat) {
          resetSlot(s);                                   // reuse in place, keep queue order
          break;
        }
      }
    }
    let slot = null, low = -1, oldest = 0;
    for (let i = 0; i < Q_N; i++) {
      const s = slots[i];
      if (!s.live) { slot = s; break; }
      if (s.cat === cat && s.line && s.line.id === line.id) return false;
      if (priorityScore(s) < low || (priorityScore(s) === low && s.t < oldest)) { low = priorityScore(s); oldest = s.t; slot = s; }
    }
    if (!slot) return false;
    slot.live = true; slot.line = line; slot.id = line.id; slot.pri = pri; slot.cat = cat;
    slot.ch = opts && opts.ch ? opts.ch : (line.ch || 'AWACS');
    slot.text = line.text || ''; slot.t = now; slot.exp = now + (TTL[cat] || 4); slot.dur = 0;
    // CRITICAL pre-empts a live COMBAT / AMBIENT line; STORY is never cut off.
    if (critical && cur && cur.pri <= PRI.COMBAT && CRIT_CATS.has(cat)) {
      if (audio.stopRadio) audio.stopRadio(0.04);
      if (audio.txTail) audio.txTail();
      if (onIdle) onIdle();
      cur = null; gapUntil = now + 0.04;
    }
    return true;
  }

  function priorityScore(s) {
    const cat = s.cat;
    if (cat === 'CRITICAL') return PRI.CRITICAL;
    if (cat === 'STORY') return PRI.STORY;
    return cat === 'AMBIENT' ? PRI.AMBIENT : PRI.COMBAT;
  }

  function update(now) {
    if (cur && now >= curEnd) {
      cur.live = false; resetSlot(cur);
      cur = null; lastTxEnd = now; gapUntil = now + GAP_S;
      if (onIdle) onIdle();
    }
    if (cur || now < gapUntil) return null;
    let best = null, bestPri = -1, bestT = Infinity;
    for (let i = 0; i < Q_N; i++) {
      const s = slots[i];
      if (!s.live || now > s.exp) { if (!s.live) continue; resetSlot(s); continue; }
      const p = priorityScore(s);
      if (p > bestPri || (p === bestPri && s.t < bestT)) { best = s; bestPri = p; bestT = s.t; }
    }
    if (!best) return null;
    cur = best;
    const dur = onTx ? onTx(best) : 0;
    best.dur = dur || 2.2;
    if (debug && console.debug) console.debug('[RADIO] tx', best.id, 'pri', priorityScore(best), 'cat', best.cat, 'ch', best.ch);
    curEnd = now + 0.06 + best.dur + 0.09;
    gapUntil = curEnd + GAP_S;
    lastCatT[best.cat] = now;
    lastLineT.set(best.id, now);
    return best;
  }

  function clear(gap = 0) {
    for (let i = 0; i < Q_N; i++) resetSlot(slots[i]);
    cur = null; curEnd = 0; gapUntil = gap > 0 ? performance.now() / 1000 + gap : 0;
    for (const k in lastCatT) delete lastCatT[k];
    lastLineT.clear();
  }

  const lastByEvent = Object.create(null);
  let lastTxEnd = 0;
  return {
    say, update, clear,
    get cur() { return cur; },
    get state() {
      const q = [];
      for (let i = 0; i < Q_N; i++) if (slots[i].live && slots[i] !== cur) q.push({ id: slots[i].id, pri: priorityScore(slots[i]), cat: slots[i].cat, ch: slots[i].ch });
      return { q, cur: cur ? { id: cur.id, pri: priorityScore(cur), cat: cur.cat, ch: cur.ch, text: cur.text } : null,
        lastCatT: { ...lastCatT }, gap: Math.max(0, gapUntil - performance.now() / 1000) };
    }
  };
}
