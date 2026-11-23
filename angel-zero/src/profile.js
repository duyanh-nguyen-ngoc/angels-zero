// ANGELS ZERO — persistent pilot service record + F-15C livery catalogue.
// One JSON blob in localStorage under `angels_zero_profile`. Every read is
// validated against defaults, so a corrupt / foreign value or a storage
// exception (private mode, blocked site data) falls back to an in-memory
// record and the game keeps working.

export const PROFILE_KEY = 'angels_zero_profile';
export const BW_KEY = 'BROKEN_WING';
export const RANKS = ['C', 'B', 'A', 'S'];                   // ascending
// Sortie score thresholds (score includes the combo multiplier). A failed
// sortie (ejected / shot down) is capped at B.
export const RANK_SCORE = { S: 80000, A: 50000, B: 25000 };

export const LIVERIES = [
  { id: 'EAGLE_GREY', name: 'EAGLE GREY', body: '#828b94', trim: '#5d6670', rough: 0.6,
    desc: 'USAF compass ghost grey', unlock: 'STANDARD ISSUE', short: 'STANDARD ISSUE' },
  { id: 'CIPHER_BLUE', name: 'CIPHER BLUE', body: '#d8e0e8', trim: '#1e5ce6', rough: 0.45,
    desc: 'Silver-white, cobalt accents', unlock: 'EARN A OR S RANK IN A SORTIE', short: 'A / S RANK' },
  { id: 'MIDNIGHT_STEALTH', name: 'MIDNIGHT STEALTH', body: '#1c2026', trim: '#323944', rough: 0.82,
    desc: 'Matte obsidian, gunmetal trim', unlock: '1 BRIDGE THREAD OR 3 GUNS KILLS IN ONE SORTIE', short: 'BRIDGE THREAD / 3 GUNS KILLS' },
  { id: 'CRIMSON_VULTURE', name: 'CRIMSON VULTURE', body: '#18181c', trim: '#cc2233', rough: 0.74,
    desc: 'Aggressor black, crimson trim', unlock: 'DEFEAT THE PHASE 3 ACE', short: 'DEFEAT THE ACE' }
];
export const liveryById = id => LIVERIES.find(l => l.id === id) || LIVERIES[0];

const DEFAULTS = () => ({
  version: 1, bestScore: 0, bestRank: null, sortiesCleared: 0, sortiesFlown: 0, totalKills: 0,
  wingsSevered: 0, bridgesThreaded: 0, badges: [], unlockedLiveries: ['EAGLE_GREY'], selectedLivery: 'EAGLE_GREY'
});

export function createProfile(storage = (() => { try { return window.localStorage; } catch (e) { return null; } })()) {
  let persistent = !!storage;
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  function sanitize(raw) {
    const d = DEFAULTS();
    if (!raw || typeof raw !== 'object') return d;
    const ids = LIVERIES.map(l => l.id);
    const unlocked = Array.isArray(raw.unlockedLiveries) ? raw.unlockedLiveries.filter(id => ids.includes(id)) : [];
    if (!unlocked.includes('EAGLE_GREY')) unlocked.unshift('EAGLE_GREY');
    const p = {
      version: 1,
      bestScore: num(raw.bestScore), sortiesCleared: num(raw.sortiesCleared), sortiesFlown: num(raw.sortiesFlown),
      totalKills: num(raw.totalKills), wingsSevered: num(raw.wingsSevered), bridgesThreaded: num(raw.bridgesThreaded),
      bestRank: RANKS.includes(raw.bestRank) ? raw.bestRank : null,
      badges: Array.isArray(raw.badges) ? [...new Set(raw.badges.filter(b => b === BW_KEY))] : [],
      unlockedLiveries: [...new Set(unlocked)],
      selectedLivery: ids.includes(raw.selectedLivery) && unlocked.includes(raw.selectedLivery) ? raw.selectedLivery : 'EAGLE_GREY'
    };
    return p;
  }
  function load() {
    if (!storage) return DEFAULTS();
    try { const s = storage.getItem(PROFILE_KEY); return sanitize(s ? JSON.parse(s) : null); }
    catch (e) { persistent = false; return DEFAULTS(); }
  }
  let data = load();
  function save() {
    if (!storage) return false;
    try { storage.setItem(PROFILE_KEY, JSON.stringify(data)); persistent = true; return true; }
    catch (e) { persistent = false; return false; }
  }

  const rankAtLeast = (r, min) => RANKS.indexOf(r) >= RANKS.indexOf(min);
  function rankFor(score, cleared) {
    let r = score >= RANK_SCORE.S ? 'S' : score >= RANK_SCORE.A ? 'A' : score >= RANK_SCORE.B ? 'B' : 'C';
    if (!cleared && rankAtLeast(r, 'A')) r = 'B';
    return r;
  }
  function unlock(id) {
    if (data.unlockedLiveries.includes(id)) return false;
    data.unlockedLiveries.push(id);
    return true;
  }
  function addBadge(id) {
    if (data.badges.includes(id)) return false;
    data.badges.push(id);
    return true;
  }

  // Bank a sortie: s = { outcome: 'CLEARED' | 'FAILED' | 'ABANDONED', score, kills,
  // gunsKills, wingsSevered, bridges, aceDown }. Lifetime counters always bank;
  // rank / best score / unlocks only for a debriefed (CLEARED or FAILED) sortie.
  function recordSortie(s) {
    const cleared = s.outcome === 'CLEARED', debriefed = s.outcome !== 'ABANDONED';
    data.totalKills += num(s.kills); data.wingsSevered += num(s.wingsSevered); data.bridgesThreaded += num(s.bridges);
    const res = { outcome: s.outcome, rank: null, newBest: false, newBestRank: false, unlocked: [], badges: [] };
    if (s.brokenWing && addBadge(BW_KEY)) res.badges.push(BW_KEY);
    if (debriefed) {
      data.sortiesFlown++;
      if (cleared) data.sortiesCleared++;
      res.rank = RANKS.includes(s.rankOverride) ? s.rankOverride : rankFor(num(s.score), cleared);
      if (num(s.score) > data.bestScore) { data.bestScore = num(s.score); res.newBest = true; }
      if (!data.bestRank || RANKS.indexOf(res.rank) > RANKS.indexOf(data.bestRank)) { data.bestRank = res.rank; res.newBestRank = true; }
      // Unlocks. MIDNIGHT STEALTH counts skill feats even on a failed / ejected run.
      if (rankAtLeast(res.rank, 'A') && unlock('CIPHER_BLUE')) res.unlocked.push('CIPHER_BLUE');
      if ((num(s.bridges) >= 1 || num(s.gunsKills) >= 3) && unlock('MIDNIGHT_STEALTH')) res.unlocked.push('MIDNIGHT_STEALTH');
      if (s.aceDown && unlock('CRIMSON_VULTURE')) res.unlocked.push('CRIMSON_VULTURE');
    }
    save();
    return res;
  }
  function select(id) {
    if (!data.unlockedLiveries.includes(id)) return false;
    data.selectedLivery = id; save(); return true;
  }
  function reset() { data = DEFAULTS(); save(); }

  save();                                                   // normalise whatever was stored
  return {
    get data() { return data; }, get persistent() { return persistent; },
    rankFor, recordSortie, select, unlock: id => { const n = unlock(id); save(); return n; },
    addBadge: id => { const n = addBadge(id); save(); return n; }, get badges() { return new Set(data.badges); }, reset,
    isUnlocked: id => data.unlockedLiveries.includes(id)
  };
}
