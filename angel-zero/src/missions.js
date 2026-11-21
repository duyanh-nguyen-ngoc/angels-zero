// ANGELS ZERO — mission registry. One block + one MISSION_ORDER entry adds a mission.
// Each mission supplies its spawn, waves, targets, map tag and soundtrack scenario.

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
      { kind: 'CG', pos: [0, 0, 6400], hp: 260 }], ceilingFt: null
  },
  CANYON_RUN: {
    id: 'CANYON_RUN', title: 'CANYON RUN',
    brief: 'Thread the gorge under the 1,200 ft radar ceiling and destroy the fortress at the far end.',
    mapTag: 'GORGE', launch: 'RUNWAY', rtbType: 'BASE', bgmScenario: '07_canyon', wxOverride: false,
    spawn: { pos: [900, 140, 4300], hdg: 0, spd: 180, onDeck: false },
    waves: [{ t: 0, kind: 'CAP', n: 4, alt: 900 }],
    targets: [{ kind: 'FORT', pos: [0, 0, -5400], hp: 420 }], ceilingFt: 1200
  },
  ACE_DUEL: {
    id: 'ACE_DUEL', title: 'ACE DUEL',
    brief: 'Launch from the carrier and defeat the two-ship CRIMSON ace flight in the cloud arena.',
    mapTag: 'CLOUD_ARENA', launch: 'CATAPULT', rtbType: 'CARRIER', bgmScenario: '08_crimson_duel', wxOverride: false,
    spawn: { pos: [0, 18, 9000], hdg: 0, spd: 160, onDeck: true },
    waves: [{ t: 0, kind: 'ACE', n: 2, alt: 2400, ace: ['CRIMSON-1', 'CRIMSON-2'] }],
    targets: [], ceilingFt: null
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

const read = () => {
  try { const v = localStorage.getItem(MISSION_KEY); return MISSIONS[v] ? v : MISSION_ORDER[0]; }
  catch (e) { return MISSION_ORDER[0]; }
};
export const loadMission = read;
export function saveMission(id) {
  if (!MISSIONS[id]) return false;
  try { localStorage.setItem(MISSION_KEY, id); return true; } catch (e) { return false; }
}
