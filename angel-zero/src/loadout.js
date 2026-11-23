// ANGELS ZERO — persistent special-weapon choice + squadron paint catalogue.
// Two small localStorage keys, validated on read: a corrupt / foreign value or a
// storage exception (private mode, blocked site data) falls back to the defaults.

export const SPW_KEY = 'angelsZero_spw', LIVERY_KEY = 'angelsZero_livery', MODE_KEY = 'angelsZero_mode';
export const ROLE_KEY = 'angelsZero_wingRoles', ROLES = ['CAP', 'STRIKE'];
export const ROLE_LABELS = { CAP: 'CAP / INTERCEPT', STRIKE: 'STRIKE / SEAD' };
export const MODES = ['MISSION', 'FURBALL'];

export const SPW = {
  '4AAM': { wpn: 'AAM4', label: '4AAM', hud: '4AAM' },
  UGB: { wpn: 'BOMB', label: 'UGB', hud: 'UGB' },
  QAAM: { wpn: 'QAAM', label: 'QAAM', hud: 'QAAM' }
};

export const SQUADRON = {
  GHOST: { body: '#7e8792', trim: '#5b636d', rough: 0.6 },
  ARCTIC: { body: '#e3e8ec', trim: '#8c96a0', splinter: ['#e3e8ec', '#b9c2ca', '#8c96a0'], rough: 0.55 },
  GRIMDARK: { body: '#15181d', trim: '#2b3038', rough: 0.85, emblem: 'DICE32' },
  ACE_GOLD: { body: '#1a1a1e', trim: '#c9a227', accent: '#b3192d', rough: 0.5 }
};

const read = (key, fallback, valid) => {
  try { const v = localStorage.getItem(key); return valid(v) ? v : fallback; }
  catch (e) { return fallback; }
};
const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } };

export const loadSPW = () => read(SPW_KEY, '4AAM', v => Object.prototype.hasOwnProperty.call(SPW, v));
export const saveSPW = id => write(SPW_KEY, Object.prototype.hasOwnProperty.call(SPW, id) ? id : '4AAM');
export const loadLivery = () => read(LIVERY_KEY, 'GHOST', v => Object.prototype.hasOwnProperty.call(SQUADRON, v));
export const saveLivery = id => write(LIVERY_KEY, Object.prototype.hasOwnProperty.call(SQUADRON, id) ? id : 'GHOST');
export const loadMode = () => read(MODE_KEY, 'MISSION', v => MODES.includes(v));
export const saveMode = id => write(MODE_KEY, MODES.includes(id) ? id : 'MISSION');
// Per-wingman combat role: { w2, w3 }. Defaults: lead's usual CAP wing plus one SEAD wing.
export const loadRoles = () => {
  const d = { w2: 'CAP', w3: 'STRIKE' };
  try {
    const v = JSON.parse(localStorage.getItem(ROLE_KEY));
    if (v && typeof v === 'object') {
      if (ROLES.includes(v.w2)) d.w2 = v.w2;
      if (ROLES.includes(v.w3)) d.w3 = v.w3;
    }
    return d;
  } catch (e) { return d; }
};
export const saveRoles = r => write(ROLE_KEY, JSON.stringify({
  w2: r && ROLES.includes(r.w2) ? r.w2 : 'CAP', w3: r && ROLES.includes(r.w3) ? r.w3 : 'STRIKE'
}));
