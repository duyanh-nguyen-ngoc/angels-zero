// ANGELS ZERO — mission registry. One block + one MISSION_ORDER entry adds a mission.
// Each mission supplies its spawn, waves, targets, map tag and soundtrack scenario.

import { CEIL_M, GORGE_FORT, GORGE_SPAWN_Z, gorgeCentreX } from './maps.js?v=s88a';

export const MISSION_KEY = 'angelsZero_mission';

export const MISSIONS = {
  AIR_SUPERIORITY: {
    id: 'AIR_SUPERIORITY', title: 'AIR SUPERIORITY',
    brief: 'Sweep the archipelago, break the enemy CAP, then recover at ARCHIPELAGO AFB.',
    mapTag: 'ARCHIPELAGO', launch: 'RUNWAY', rtbType: 'BASE', bgmScenario: '03_air_superiority', wxOverride: true,
    spawn: { pos: [900, 140, 4300], hdg: 0, spd: 180, onDeck: false },
    waves: [{ t: 0, kind: 'CAP', n: 6, alt: 1800 }, { t: 90, kind: 'CAP', n: 4, alt: 2200 }],
    targets: [], ceilingFt: null
  },
  NAVAL_BATTLE: {
    id: 'NAVAL_BATTLE', title: 'NAVAL BATTLE',
    brief: 'Launch from USS ENTERPRISE, clear the CAP and sink the strait task force.',
    mapTag: 'STRAIT', launch: 'CATAPULT', rtbType: 'CARRIER', bgmScenario: '06_strike', wxOverride: false,
    spawn: { pos: [0, 18, 9000], hdg: 0, spd: 160, onDeck: true },
    waves: [{ t: 0, kind: 'CAP', n: 4, alt: 2000 }, { t: 80, kind: 'CAP', n: 4, alt: 2400 }],
    targets: [{ kind: 'DDG', pos: [-1200, 0, 5200], hp: 170 }, { kind: 'DDG', pos: [1300, 0, 5600], hp: 170 },
      { kind: 'CG', pos: [0, 0, 6400], hp: 260 }], ceilingFt: null,
    weapons: { gun: true, msl: true, spw: true }, enemyMsl: true, wingmen: 'FLIGHT', ceiling: null, gatesPath: null,
    ilsOnRtbOnly: true,
    stages: [
      { label: 'FLEET CONTACT', ships: [{ kind: 'DDG', pos: [-900, 0, -5000], hp: 3 }, { kind: 'DDG', pos: [900, 0, -5000], hp: 3 }], bandits: [1, 2], clear: 'SHIPS' },
      { label: 'SURFACE ACTION GROUP', ships: [{ kind: 'DDG', pos: [-1400, 0, -7000], hp: 3 }, { kind: 'DDG', pos: [1400, 0, -7000], hp: 3 },
        { kind: 'CG', pos: [-500, 0, -7300], hp: 5 }, { kind: 'CG', pos: [500, 0, -7300], hp: 5, chance: 0.5 }], bandits: 3, clear: 'SHIPS' },
      { label: 'FLAGSHIP', ships: [{ kind: 'CV_FLAG', pos: [0, 0, -9000], hp: 10 }, { kind: 'DDG', pos: [-1200, 0, -9100], hp: 3 },
        { kind: 'DDG', pos: [1200, 0, -9100], hp: 3 }], bandits: 4, clear: 'SHIPS' }
    ]
  },
  CANYON_RUN: {
    id: 'CANYON_RUN', title: 'CANYON RUN',
    brief: 'Fly 25 km of winding trench under the 1,200 ft radar ceiling, hit the crater fortress, then climb out over the wall.',
    mapTag: 'GORGE', launch: 'AIRSTART', rtbType: 'BASE', bgmScenario: '07_canyon', wxOverride: false,
    spawn: { pos: [gorgeCentreX(GORGE_SPAWN_Z), 0, GORGE_SPAWN_Z], hdg: 0, spd: 180, onDeck: false },
    waves: [],
    targets: [{ kind: 'FORT', pos: GORGE_FORT, hp: 4 }],
    weapons: { gun: true, msl: true, spw: true }, enemyMsl: true, wingmen: 'FLIGHT',
    ceiling: { m: CEIL_M }, gatesPath: 'CANYON', ilsOnRtbOnly: false,
    stages: [
      { label: 'TRENCH RUN', targets: [{ kind: 'FORT', pos: GORGE_FORT, hp: 4 }], bandits: 0, clear: 'TARGETS' }
    ]
  },
  ACE_DUEL: {
    id: 'ACE_DUEL', title: 'ACE DUEL',
    brief: 'Guns only. Launch from the carrier and beat CRIMSON-1, a rival pilot, one on one over open ocean.',
    mapTag: 'CLOUD_ARENA', launch: 'CATAPULT', rtbType: 'CARRIER', bgmScenario: '08_crimson_duel', wxOverride: false,
    spawn: { pos: [0, 18, 9000], hdg: 0, spd: 160, onDeck: true },
    waves: [],
    targets: [],
    weapons: { gun: true, msl: false, spw: false }, enemyMsl: false, wingmen: 'NONE', ceiling: null, gatesPath: null,
    ilsOnRtbOnly: true, gunsOnly: true, noShips: true,
    stages: [{ label: 'CRIMSON-1', ace: ['CRIMSON-1'], bandits: 0, clear: 'ACE' }]
  },
  FURBALL: {
    id: 'FURBALL', title: 'FURBALL',
    brief: 'Endless instant-action dogfight. No RTB — fly until you eject or end the sortie.',
    mapTag: 'ARCHIPELAGO', launch: 'AIRBORNE', rtbType: null, bgmScenario: '09_furball', wxOverride: true,
    spawn: { pos: [0, 1829, -3000], hdg: 0, spd: 216, onDeck: false },
    waves: [{ t: 0, kind: 'CAP', n: 6, alt: 6000 }], targets: [], ceilingFt: null
  }
};

export const MISSION_ORDER = ['AIR_SUPERIORITY', 'NAVAL_BATTLE', 'CANYON_RUN', 'ACE_DUEL', 'FURBALL'];

// Normalised per-sortie configuration. Missions without the new fields (AIR_SUPERIORITY
// and FURBALL) get defaults that reproduce their existing behaviour exactly.
export function missionConfig(m) {
  return {
    weapons: m.weapons || { gun: true, msl: true, spw: true },
    enemyMsl: m.enemyMsl !== undefined ? m.enemyMsl : true,
    wingmen: m.wingmen || 'FLIGHT',
    ceiling: m.ceiling || null,
    gatesPath: m.gatesPath || null,
    ilsOnRtbOnly: !!m.ilsOnRtbOnly,
    gunsOnly: !!m.gunsOnly,                                // hard block on every missile / rocket (ACE_DUEL)
    noShips: !!m.noShips,                                  // no surface ships may exist (ACE_DUEL)
    stages: m.stages || null                               // null = legacy PHASE 1..4 flow
  };
}

const read = () => {
  try { const v = localStorage.getItem(MISSION_KEY); return MISSIONS[v] ? v : MISSION_ORDER[0]; }
  catch (e) { return MISSION_ORDER[0]; }
};
export const loadMission = read;
export function saveMission(id) {
  if (!MISSIONS[id]) return false;
  try { localStorage.setItem(MISSION_KEY, id); return true; } catch (e) { return false; }
}
