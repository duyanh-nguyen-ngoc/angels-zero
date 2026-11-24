// ANGELS ZERO — radio voice script (data only; wired into the game in a later step).
//
// Four speakers:
//   AWACS      "OVERLORD" — calm, clipped tactical command
//   WARDEN-2   energetic young wingman
//   WARDEN-3   seasoned veteran wingman, dry humour
//   CRIMSON-1  rival ace leading the CRIMSON flight — theatrical, cold
//
// Every entry: { id, speaker, text, event, priority, file, trailerHero }
//   priority     1 = CRITICAL (interrupts), 2 = TACTICAL, 3 = BANTER (drops if the channel is busy)
//   file         clip path relative to angel-zero/ (mono MP3, 48 kbps, radio band-pass baked in)
//   trailerHero  six flagship lines for trailers / the briefing reel
//
// Lines are original writing for ANGELS ZERO.

export const RADIO_SPEAKERS = {
  'AWACS':     { callsign: 'OVERLORD',  tint: '#5fe8ff', role: 'airborne command' },
  'WARDEN-2':  { callsign: 'WARDEN-2',  tint: '#00ff66', role: 'wingman' },
  'WARDEN-3':  { callsign: 'WARDEN-3',  tint: '#00ff66', role: 'wingman' },
  'CRIMSON-1': { callsign: 'CRIMSON-1', tint: '#ff3b5c', role: 'enemy ace' }
};

export const RADIO_EVENTS = [
  'ON_TAKEOFF', 'CAT_ARMED', 'ON_CATAPULT', 'ON_MACH_1', 'ON_NEAR_MISS', 'ON_PHASE_2_CANYON', 'ON_CANYON_LOW',
  'ON_ACE_INBOUND', 'ON_ACE_KILL', 'ON_CARRIER_TRAP', 'ON_WINGMAN_ENGAGE', 'ON_LOW_HP', 'ON_MISSION_CLEAR',
  'STAGE_1', 'STAGE_2', 'STAGE_3', 'SAM_LOCK', 'CLIMB_OUT', 'GATE', 'ACE_HURT'
];

const DIR = 'assets/voicelines/radio/';
// New queue priority scale: 3 CRITICAL, 2 STORY, 1 COMBAT, 0 AMBIENT.
// Legacy script priority: 1 = critical, 2 = tactical, 3 = banter.
const PRI_OF = { 1: 3, 2: 2, 3: 1 };
const AMBIENT_EVENTS = new Set(['ON_MACH_1', 'ON_CATAPULT', 'ON_CARRIER_TRAP', 'ON_MISSION_CLEAR', 'ON_WINGMAN_ENGAGE']);
const CH_OF = { 'AWACS': 'AWACS', 'WARDEN-2': 'WARDEN2', 'WARDEN-3': 'WARDEN3', 'CRIMSON-1': 'CRIMSON' };
const CAT_OVERRIDE = {
  CAT_ARMED: { pri: 3, cat: 'CAT' },
  ON_LOW_HP: { pri: 3, cat: 'DMG' },
  ON_NEAR_MISS: { pri: 3, cat: 'MISSILE' },
  ON_CANYON_LOW: { pri: 3, cat: 'PULLUP' }
};
const TEXT_ONLY = new Set(['stage_1_awacs', 'stage_2_awacs', 'stage_3_awacs', 'ceil_awacs_01', 'climb_awacs_01', 'gate_w2_01', 'hurt_c1_01']);
const L = (id, speaker, event, priority, text, trailerHero = false) => {
  const ambient = priority === 3 && AMBIENT_EVENTS.has(event);
  const o = CAT_OVERRIDE[event] || {};
  return { id, speaker, text, event, priority, file: TEXT_ONLY.has(id) ? null : DIR + id + '.mp3', trailerHero,
    pri: o.pri !== undefined ? o.pri : (ambient ? 0 : PRI_OF[priority]),
    cat: o.cat || (priority === 1 ? 'CRITICAL' : priority === 2 ? 'STORY' : ambient ? 'AMBIENT' : 'COMBAT'),
    ch: CH_OF[speaker] || 'AWACS' };
};

export const RADIO_LINES = [
  // ON_TAKEOFF
  L('takeoff_awacs_01',   'AWACS',     'ON_TAKEOFF', 2, 'Overlord to Warden flight. Skies over the archipelago are contested. You are cleared hot.', true),
  L('takeoff_w2_01',      'WARDEN-2',  'ON_TAKEOFF', 3, 'Warden Two, wheels up! Right on your wing, Lead.'),
  L('takeoff_w3_01',      'WARDEN-3',  'ON_TAKEOFF', 3, 'Warden Three airborne. Let\'s keep this one boring, shall we?'),
  L('takeoff_awacs_02',   'AWACS',     'ON_TAKEOFF', 2, 'Bandits massing over the strait. Climb to angels twenty and hold formation.'),

  // CAT_ARMED (bow catapult hold) — existing AWACS clip, no new file.
  L('cat_awacs_01',       'AWACS',     'CAT_ARMED', 2, 'Deck is clear. Catapult armed. Go when ready, Lead.'),
  // ON_CATAPULT

  L('cat_w2_01',          'WARDEN-2',  'ON_CATAPULT', 3, 'Whoa, what a shot! Off the deck and climbing!'),
  L('cat_w3_01',          'WARDEN-3',  'ON_CATAPULT', 3, 'Nice clean stroke. The deck crew earned their coffee.'),

  // ON_MACH_1
  L('mach_w2_01',         'WARDEN-2',  'ON_MACH_1', 3, 'Supersonic! Lead, you just rattled every window on the island!'),
  L('mach_w3_01',         'WARDEN-3',  'ON_MACH_1', 3, 'Mach one. Easy on the fuel, hotshot.'),
  L('mach_awacs_01',      'AWACS',     'ON_MACH_1', 3, 'Overlord copies, Warden One is supersonic.'),

  // ON_NEAR_MISS
  L('nearmiss_w2_01',     'WARDEN-2',  'ON_NEAR_MISS', 2, 'That was too close! You okay, Lead?'),
  L('nearmiss_w3_01',     'WARDEN-3',  'ON_NEAR_MISS', 2, 'Missile wide! I saw paint come off that one.'),
  L('nearmiss_awacs_01',  'AWACS',     'ON_NEAR_MISS', 2, 'Warden One, missile defeated. Stay defensive.'),
  L('nearmiss_c1_01',     'CRIMSON-1', 'ON_NEAR_MISS', 3, 'You dance well, ghost. The next one will not miss.'),

  // ON_PHASE_2_CANYON
  L('canyon_awacs_01',    'AWACS',     'ON_PHASE_2_CANYON', 1, 'New tasking. Enemy jammers are dug into the canyon and under the bridge. Take them out.', true),
  L('canyon_w3_01',       'WARDEN-3',  'ON_PHASE_2_CANYON', 2, 'Those jammers are blinding our radar. We go in low, or not at all.'),
  L('canyon_w2_01',       'WARDEN-2',  'ON_PHASE_2_CANYON', 3, 'Into the canyon? Okay. Okay! Right behind you, Lead.'),
  L('canyon_awacs_02',    'AWACS',     'ON_PHASE_2_CANYON', 2, 'Strike package, stay below five hundred feet or the jamming will eat your lock.'),

  // ON_CANYON_LOW
  L('low_w2_01',          'WARDEN-2',  'ON_CANYON_LOW', 2, 'Watch your altitude, Lead. Threading the canyon!'),
  L('low_w3_01',          'WARDEN-3',  'ON_CANYON_LOW', 2, 'Walls on both sides. Keep it smooth and keep it low.'),
  L('low_awacs_01',       'AWACS',     'ON_CANYON_LOW', 3, 'Overlord has you under the jamming. Good flying.'),

  // ON_ACE_INBOUND
  L('ace_awacs_01',       'AWACS',     'ON_ACE_INBOUND', 1, 'Warning. Crimson flight inbound, high and fast. That is their ace squadron.'),
  L('ace_c1_01',          'CRIMSON-1', 'ON_ACE_INBOUND', 1, 'So this is the ghost of the archipelago. Let us see if the stories are true.', true),
  L('ace_w3_01',          'WARDEN-3',  'ON_ACE_INBOUND', 2, 'Crimson markings. Those aren\'t rookies, Lead. Fly sharp.'),
  L('ace_w2_01',          'WARDEN-2',  'ON_ACE_INBOUND', 2, 'Two bogeys, red tails! They\'re coming right for us!'),
  L('ace_c1_02',          'CRIMSON-1', 'ON_ACE_INBOUND', 3, 'Crimson Two, take the wingmen. The lead is mine.'),

  // ON_ACE_KILL
  L('acekill_c1_01',      'CRIMSON-1', 'ON_ACE_KILL', 1, 'Impossible. Crimson One, ejecting!', true),
  L('acekill_w2_01',      'WARDEN-2',  'ON_ACE_KILL', 2, 'Splash the ace! Lead, you did it!'),
  L('acekill_w3_01',      'WARDEN-3',  'ON_ACE_KILL', 2, 'Red tail going down. That one will be talked about.'),
  L('acekill_awacs_01',   'AWACS',     'ON_ACE_KILL', 2, 'Overlord confirms. Enemy ace destroyed.'),

  // ON_CARRIER_TRAP
  L('trap_w2_01',         'WARDEN-2',  'ON_CARRIER_TRAP', 2, 'Good trap, Lead! Deck crew is turning your bird.'),
  L('trap_w3_01',         'WARDEN-3',  'ON_CARRIER_TRAP', 3, 'Caught the three wire. Textbook.'),
  L('trap_awacs_01',      'AWACS',     'ON_CARRIER_TRAP', 2, 'Warden One is on deck. Rearm and refuel in progress.'),

  // ON_WINGMAN_ENGAGE
  L('engage_w2_01',       'WARDEN-2',  'ON_WINGMAN_ENGAGE', 2, 'Engaging! Warden Two, fox two!'),
  L('engage_w3_01',       'WARDEN-3',  'ON_WINGMAN_ENGAGE', 2, 'Copy, weapons free. Warden Three, fox two.'),
  L('engage_w2_02',       'WARDEN-2',  'ON_WINGMAN_ENGAGE', 2, 'Clear your six, Lead! I\'ve got him!'),
  L('reform_w3_01',       'WARDEN-3',  'ON_WINGMAN_ENGAGE', 3, 'Reforming on your wing, Lead.'),

  // ON_LOW_HP
  L('lowhp_awacs_01',     'AWACS',     'ON_LOW_HP', 1, 'Warden One, you are trailing smoke. Return to the carrier.'),
  L('lowhp_w2_01',        'WARDEN-2',  'ON_LOW_HP', 1, 'Lead, you\'re hit bad! Get out of there!'),
  L('lowhp_w3_01',        'WARDEN-3',  'ON_LOW_HP', 2, 'You\'re leaking, Lead. I\'ll cover you back to the boat.'),
  L('lowhp_c1_01',        'CRIMSON-1', 'ON_LOW_HP', 3, 'Wounded already? Disappointing.'),

  // ON_MISSION_CLEAR
  L('clear_awacs_01',     'AWACS',     'ON_MISSION_CLEAR', 1, 'All objectives complete. Warden flight, the archipelago is ours. Bring them home.', true),
  L('clear_w2_01',        'WARDEN-2',  'ON_MISSION_CLEAR', 2, 'We did it! Lead, you were incredible out there!'),
  L('clear_w3_01',        'WARDEN-3',  'ON_MISSION_CLEAR', 2, 'Nobody lost today. That\'s the only score I care about.', true),
  L('clear_awacs_02',     'AWACS',     'ON_MISSION_CLEAR', 3, 'Overlord out. Good hunting, Warden.'),

  // Staged mission / canyon / duel callouts.
  L('stage_1_awacs',      'AWACS',     'STAGE_1',         2, 'Fleet contact. Take out the destroyers, Lead.'),
  L('stage_2_awacs',      'AWACS',     'STAGE_2',         2, 'Surface action group inbound. Press the attack.'),
  L('stage_3_awacs',      'AWACS',     'STAGE_3',         2, 'Flagship located. Finish the task force.'),
  L('ceil_awacs_01',      'AWACS',     'SAM_LOCK',        1, 'MAYDAY — you are above the radar ceiling. DESCEND!'),
  L('climb_awacs_01',     'AWACS',     'CLIMB_OUT',       1, 'Bunker down. PULL UP and clear the wall!'),
  L('gate_w2_01',         'WARDEN-2',  'GATE',            3, 'Gate checkpoint. Nice flying, Lead.'),
  L('hurt_c1_01',         'CRIMSON-1', 'ACE_HURT',        2, 'You have my attention, ghost.')
];

// Lookup helpers (pure; safe to import anywhere).
export const RADIO_BY_EVENT = RADIO_EVENTS.reduce((m, ev) => (m[ev] = RADIO_LINES.filter(l => l.event === ev), m), {});
export const RADIO_HERO = RADIO_LINES.filter(l => l.trailerHero);
