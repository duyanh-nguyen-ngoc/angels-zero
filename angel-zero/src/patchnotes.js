// ANGELS ZERO — in-game patch notes. Newest first; every release prepends an
// entry here and bumps the patch version (see CLAUDE.md → Pre-push checklist).
// The UI reads PATCH_NOTES[0].version for the briefing + button version chips.

export const PATCH_NOTES = [
  { version: 'v1.1.11', title: 'MISSION SELECT + DUAL RTB + MISSION BGM', bullets: [
    'Five selectable missions with dedicated maps, spawns, targets and pooled actor resets on switch.',
    'BASE missions autobrake to a stop on AFB Runway; CARRIER missions offer an [L] cinematic autoland onto USS Enterprise.',
    'Scenario music now follows the mission registry and dynamic combat state, keeping canyon/naval/ace tracks clear of night and storm overrides.'
  ] },
  { version: 'v1.1.10', title: 'STREAMING SOUNDTRACK', bullets: [
    'Twelve normalized scenario pairs stream from cached Ogg Vorbis decks with a 1.5 s equal-power crossfade and alternating tracks on replays.',
    'Music ducks 5 dB under radio calls, follows combat intensity, and keeps the original synth score on browsers without Ogg Vorbis.'
  ] },
  { version: 'v1.1.9', title: 'WASD FLIGHT CONTROLS', bullets: [
    'W/S pitch and A/D roll on the keyboard, ramped and smoothly blended back to mouse aim on release.',
    'Throttle moves to Shift/Ctrl, arrow keys or the mouse wheel; Q/E take over rudder and Shift at full throttle lights the afterburner.',
    'Barrel roll is now V and eject is P. All key legends and release guards updated.'
  ] },
  { version: 'v1.1.8', title: 'FORGIVING RECOVERY', bullets: [
    'Forgiving runway and carrier touchdowns, automatic gear deployment and a gentle ILS heading/bank assist on final.',
    'Return Line resupply at the southern map edge, with a 25 s cooldown and a HUD rearm banner.',
    'Chaff SFX and radar/IR launch callouts; radar trackers beyond 2.5 km now break on chaff.'
  ] },
  { version: 'v1.1.7', title: 'SOUNDTRACK ROLLBACK', bullets: [
    'The sampled orchestra from v1.1.6 is withdrawn while a new score is produced.',
    'The original adaptive synth soundtrack is back: patrol, furball and ace layers, with the K toggle and music-volume slider unchanged.'
  ] },
  { version: 'v1.1.5', title: 'MEMORY OPTIMIZATION', bullets: [
    'Carrier GLB recompressed with meshopt + WebP at 1.9 MB: 56% less GPU texture memory, deck markings stay crisp.',
    'Renderer DPR and shadow maps stay capped, and sortie restarts reuse every texture, geometry and render target.',
    'Added a debug memory trace across three consecutive restarts.'
  ] },
  { version: 'v1.1.4', title: 'CVN CARRIER DECK', bullets: [
    'Allied carrier is now a detailed CVN model at 360 m, with a measured deck height and re-anchored catapult, wires and approach gates.',
    'Cleaner deck collision: only the island is solid, so centreline and angled-deck approaches pass cleanly and wires catch smoothly.',
    'Carrier textures compressed for a fast, lightweight deploy.'
  ] },
  { version: 'v1.1.3', title: 'CRT RADIO PORTRAITS', bullets: [
    'Live pilot portraits on radio calls: Wardens and AWACS in green phosphor, Crimson aces in a red threat frame.',
    'Scanlines, flicker and a sweep-in entrance give every transmission a proper CRT feel.',
    'Text-only fallback keeps captions readable if a portrait fails to load.'
  ] },
  { version: 'v1.1.2', title: 'POST-STALL MANEUVERING', bullets: [
    'Decoupled AoA and post-stall aero: Cobra, Kulbit and Hammerhead with full over-the-top control authority.',
    'Flat spins with rudder/opposite-roll entry and neutral-stick recovery; apex pivot keeps slow vertical noses flying.',
    'Maneuver callouts and style awards, denser high-AoA vapor, buffet camera shake and CRIMSON post-stall reversals.'
  ] },
  { version: 'v1.1.1', title: 'BORDERLESS STANDBY HANGAR', bullets: [
    'Ace-Combat-style STANDBY menu floats over the full-viewport 3D F-15: launch, mode, difficulty, SPW, livery, weather, controls and patch notes.',
    'FLIGHT roster, MISSION BENCHMARK bars and PC key hints frame the jet; arrow keys or mouse drive every row.',
    'Controls & Audio modal gathers the keybind matrix, master volume and a persisted music-volume slider.'
  ] },
  { version: 'v1.1.0', title: 'FULL RADIO VOICE CAST', bullets: [
    '45 radio-filtered lines across AWACS, Warden-2, Warden-3 and Crimson-1, cached on demand with clean CRT-text fallback.',
    'Priority dispatcher interrupts banter for critical calls, spaces tactical lines and drives tinted CRT portraits + subtitles.',
    'Squelch clicks and combat/music ducking make every transmission read clearly; trailer-hero lines are capture-ready.'
  ] },
  { version: 'v1.0.9', title: 'FOUR-PHASE MISSION + TACTICAL HUD', bullets: [
    'Missions now flow through four objectives: sweep, strike, ace intercept and carrier recovery.',
    'An objective card and off-screen chevron keep the next target in view, with a contextual prompt pill for threats and recovery.',
    'Press F1 for a compact in-flight keybind cheat-sheet.',
    'Carrier approach gates appear when damaged, winchester or on final approach. FURBALL remains endless.'
  ] },
  { version: 'v1.0.8', title: 'COCKPIT MFD SUB-PAGES', bullets: [
    'Cycle the VSD radar through TACTICAL RADAR, STORES & DMG and RWR THREAT SCOPE with the [ and ] keys.',
    'The tactical page plots wingmen, bandits, aces and strike bunkers heading-up over a 10 NM sweep.',
    'Stores shows the airframe wireframe, engine health, damage, ammunition and countermeasures on the same CRT.',
    'A page-click chirp and a brief HUD tag confirm each switch.'
  ] },
  { version: 'v1.0.7', title: 'FURBALL INSTANT-ACTION MODE', bullets: [
    'Switch to FURBALL in the briefing for an airborne 6,000 ft hot start above the cloud sea — no runway, no mission phases.',
    'Bandits recycle endlessly from the existing pool, with a CRIMSON ace pair arriving every five kills.',
    'Press TAB twice (or use the pause menu) to end the sortie and open the debrief.',
    'FURBALL debriefs rank on kills per minute and show kill rate and ace pairs downed.'
  ] },
  { version: 'v1.0.6', title: 'TACTICAL TRACE DEBRIEF & COMPOSITE RANK', bullets: [
    'Every sortie records a fixed-size flight trace and combat events, then replays them as an animated tactical map in the debrief.',
    'Kill, ace, strike, carrier-trap and near-miss icons pop along the trace with island, bridge and canyon landmarks underneath.',
    'Rank now combines clear time, damage taken, gun / missile accuracy and objectives into an S/A/B/C breakdown; failed sorties cap at B.',
    'R or the replay button restarts the trace animation without restarting the sortie.'
  ] },
  { version: 'v1.0.5', title: 'PATCH NOTES MODAL FIX', bullets: [
    'Patch Notes history backfilled and rebuilt as a structured, newest-first release log.',
    'Panel scroll and close behaviour fixed; the modal no longer traps input or focus.',
    'Latest build tag now shown on the briefing screen and the PATCH NOTES button.'
  ] },
  { version: 'v1.0.4', title: 'MISSION GUIDANCE OVERHAUL', bullets: [
    'Clearer objectives and next-step callouts through every mission phase.',
    'AWACS prompts now point at live targets instead of stale designations.',
    'Ground-map and strike objectives share one consistent guidance language.'
  ] },
  { version: 'v1.0.3', title: 'COCKPIT MFD', bullets: [
    'Live multifunction displays for radar, stores and engine status in first person.',
    'Gauge repaint is scheduled across frames to keep the cockpit at 60 FPS.',
    'MFD symbology follows the same emerald / crimson palette as the HUD.'
  ] },
  { version: 'v1.0.2', title: 'FURBALL MODE', bullets: [
    'Dense multi-ship merges with staggered bandit launches and defensive breaks.',
    'Adaptive soundtrack and radio chatter rise with the close-range fight.',
    'Scoring rewards guns kills and sustained close engagements.'
  ] },
  { version: 'v1.0.1', title: 'TACTICAL DEBRIEF REPLAY', bullets: [
    'Post-sortie debrief with rank, score, kills and mission flags.',
    'REPLAY restarts the same loadout instantly; EQUIP & FLY AGAIN re-arms in place.',
    'New livery unlocks are called out on the debrief with their swatches.'
  ] },
  { version: 'v1.0.0', title: 'HIGH-ALTITUDE CONTRAILS & CANOPY WEATHER', bullets: [
    'Twin engine contrails above 12,500 ft for the lead, wingmen and aces.',
    'Cloud passes streak the canopy glass, then clear in about 2.5 seconds.',
    'Cockpit mist patter rises with cloud density and airspeed.'
  ] },
  { version: 'v0.9.9', title: 'LOADOUT & SQUADRON HANGAR', bullets: [
    'Choose a special weapon: 4AAM, UGB with CCIP, or high-off-boresight QAAM.',
    'Four squadron liveries — GHOST, ARCTIC, GRIMDARK and ACE_GOLD — paint the lead and both wingmen.',
    'Loadout and livery persist between sessions; keys 1/2/3 select MSL and your special weapon.'
  ] },
  { version: 'v0.9.8', title: 'CANYON STRIKE CAMPAIGN', bullets: [
    'Four hidden jammer bunkers on the canyon floor and Bridge Strait pier footings.',
    'Above 500 ft inside a jammer sector, locks decay and the RWR fills with false paints.',
    'Amber ground diamonds mark the jammers; each kill triggers a slow-mo pulse.'
  ] },
  { version: 'v0.9.7', title: 'MISSILE CAM & SLOW-MO', bullets: [
    'Hold M or right mouse to fly alongside your most recent missile; release snaps straight back.',
    'An inbound missile within 380 m aborts the camera with a fresh-press requirement.',
    'Ace and close gun kills trigger a short slow-mo with a bass-drop cue.'
  ] },
  { version: 'v0.9.6', title: 'ALLIED CARRIER OPERATIONS', bullets: [
    'CVN-ALLY "OVERLORD" steams south of the airbase with a working arrestor deck.',
    'Trap the wires gear-down below 175 kt, then turnaround and steam catapult back into the air.',
    'Carrier banners, cable screech and deck-crew callouts guide the evolution.'
  ] },
  { version: 'v0.9.5', title: 'CRIMSON ACE ENCOUNTER', bullets: [
    'A two-ship CRIMSON ace flight joins the fight in the later phase.',
    'Crimson HUD diamonds, warning banner and a dedicated radio call mark their arrival.',
    'Ace kills pay a bonus and carry their own slow-mo pulse.'
  ] },
  { version: 'v0.9.4', title: 'WARDEN WINGMEN', bullets: [
    'WARDEN-2 and WARDEN-3 fly echelon, engage on G, and share your livery.',
    'Cyan HUD diamonds and CRT radio portraits make the flight easy to track.',
    'Wingmen call out contacts and confirm your kills over the radio.'
  ] },
  { version: 'v0.9.3', title: 'CHAFF & RADAR NOTCHING', bullets: [
    'Z dispenses chaff clouds that break radar locks and decoy incoming missiles.',
    'Notching a radar across your beam now drops its track.',
    'Z chaff, J ECM, L gear and G wing orders each have a dedicated key.'
  ] },
  { version: 'v0.9.2', title: 'MISSILE FLYBY FEEDBACK', bullets: [
    'Close missile passes add a camera rattle, pressure pulse and whoosh.',
    'A NEAR MISS callout rewards a successful evade.',
    'Flyby intensity scales with closeness and closing speed.'
  ] },
  { version: 'v0.9.1', title: 'RENDER PERFORMANCE PASS', bullets: [
    'Locked 60 FPS with a capped pixel ratio, tighter bloom and fewer shadow passes.',
    'Live frame-time readout for quick performance checks.',
    'Shaders are pre-compiled so view and NVG toggles no longer hitch.'
  ] },
  { version: 'v0.9.0', title: 'MACH 1 SHOCK CONE', bullets: [
    'A transonic vapor cone forms as you cross Mach 1.',
    'Sonic-boom audio and a short buffet shake sell the pressure wave.',
    'Mach readout and cone opacity track the aircraft in real time.'
  ] }
];

export function renderPatchNotes(container) {
  if (!container) return;
  container.replaceChildren();
  for (const entry of PATCH_NOTES) {
    const h = document.createElement('h3');
    h.textContent = `${entry.version} — ${entry.title}`;
    const ul = document.createElement('ul');
    for (const line of entry.bullets) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    container.appendChild(h);
    container.appendChild(ul);
  }
}
