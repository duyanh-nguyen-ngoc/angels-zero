// ANGELS ZERO — in-game patch notes. Newest first; every release prepends an
// entry here and bumps the patch version (see CLAUDE.md → Pre-push checklist).
// The UI reads PATCH_NOTES[0].version for the briefing + button version chips.

export const PATCH_NOTES = [
  { version: 'v1.1.24', title: 'RELIABLE SCORE', bullets: [
    'The soundtrack now unlocks on the first click without a refresh: a pending scenario survives the manifest fetch and a retrying gesture listener keeps trying until a deck really reports playing.',
    'Every mission and state transition force-resolves its exact track — catapult hold, each mission score, golden-hour RTB and the debrief — and the Now Playing widget repaints from the real playing event.',
    'A one-time key audit checks all 12 scenario keys against the manifest, resolver and missions, with a clear fallback for unknown keys.'
  ] },
  { version: 'v1.1.23', title: 'LIVING BATTLEFIELDS', bullets: [
    'All four theatres now breathe: wind-drifted cloud decks and densest-deck mist, phase-reactive skies (STORM in NAVAL phase 3, SUNBREAK for the duel) and golden-hour RTB.',
    'The sea rolls with a storm swell and every warship leaves a widening wake; AA fire blooms into pooled flak puffs and sinking ships keep burning with persistent smoke columns.',
    'CANYON RUN sweeps rim searchlights and drifts gorge mist; AIR SUPERIORITY spins its radar dishes, blinks tower beacons and runs distant racetrack traffic with tracer fire.'
  ] },
  { version: 'v1.1.22', title: 'HEAVY SAM BARRAGE', bullets: [
    'Breaching the canyon radar ceiling now calls a 1.5 s warning followed by rolling 4–6 SAM salvos from both rims every 1.8 s.',
    'Destroying the crater bunker triggers a 6–8 missile climb-out wall with smoke trails, motor glow and RWR alerts.',
    'Dive back below the rim to break their lock, or beat the missiles with flares and high-G; the 8 s spawn grace is unchanged.'
  ] },
  { version: 'v1.1.21', title: 'CRIMSON GUNS-ONLY DUEL FIX', bullets: [
    'CRIMSON-1 now actively hunts with lead-point cannon fire: 50 rps bursts with visible tracers that can damage the player.',
    'A wider 18 degree firing cone inside 1,200 m and a burst state machine that keeps firing through defensive breaks.',
    'Guns-only now blocks missiles only; the rival ace never launches a missile and the HUD duel assert reports shot and hit counts.'
  ] },
  { version: 'v1.1.20', title: 'SEA-SKIM ROOSTER TAIL', bullets: [
    'Low passes over open water now throw a dense white-grey rooster-tail spray and a widening foam wake behind the jet, scaling with speed and proximity to the surface.',
    'Wingmen and enemy aircraft skim the water with you, with a filtered spray rush, low rumble and subtle airframe micro-rumble in the cockpit.',
    'The effect is suppressed over land, above 40 m and throughout carrier operations, so deck launches stay clean.'
  ] },
  { version: 'v1.1.19', title: 'CARRIER AUTOLAND · 25 KM TRENCH · RIVAL DUEL', bullets: [
    'NAVAL BATTLE and ACE DUEL: every AFB runway, approach and island light is gone from the open ocean, and carrier AUTOLAND (press L or fly the final gate) now flies the glideslope, catches the wire, stops at 0 kt and goes to the debrief.',
    'CANYON RUN: no more auto-steering. You start at the canyon mouth before gate 1 with full WASD/mouse control, in a 25 km sweeping S-curve trench with 15 gates leading to the crater fortress.',
    'ACE DUEL: no ships, and CRIMSON-1 is now a skilled rival pilot with normal fighter HP and no boss bar. It breaks hard, loops and tracks you with its guns. Missiles are blocked at the fire handler for both sides.'
  ] },
  { version: 'v1.1.18', title: 'OPEN-OCEAN OPS + TRENCH RUN FIX', bullets: [
    'NAVAL BATTLE and ACE DUEL now launch over open ocean with no AFB, islands, trees or ILS clutter until recovery.',
    'NAVAL BATTLE restores WARDEN-2/3 as active wingmen across three escalating fleet stages; ACE DUEL stays a strict guns-only 1v1.',
    'CANYON RUN starts airborne centred in the trench with a grace period, a 3-second radar-lock countdown and corrected SAM ceiling banners.'
  ] },
  { version: 'v1.1.17', title: 'NAVAL ESCALATION · TRENCH RUN · GUNS-ONLY DUEL', bullets: [
    'NAVAL BATTLE now escalates across three pooled fleet stages, from destroyer contact to a flagship battle group, with shipborne SAMs and deck AAA.',
    'CANYON_RUN is a winding low-altitude trench with a lethal radar ceiling, sequential gates, a fortified valley bunker and a dramatic climb-out escape.',
    'ACE_DUEL is a true 1v1 against CRIMSON-1 with guns only — no missiles, no SPW, no wingmen and no enemy missile fire.'
  ] },
  { version: 'v1.1.16', title: 'CARRIER DECK SPAWN FIX', bullets: [
    'USS Enterprise now mounts under one persistent root before launch, with verified 360 m scale, a deck set 19 m above the water and per-track ray heights.',
    'Player and both wingmen snap to the real deck on mount and re-snap if the hull drifts, so CATAPULT_HOLD starts on the physical bow instead of over open ocean.',
    'All launch paths share one async entry and a single visibility writer; a debug CARRIER_OK line proves the carrier is mounted, visible and under the jet.'
  ] },
  { version: 'v1.1.15', title: 'COMMS OVERHAUL', bullets: [
    'Radio voices now run through a military headset DSP chain with per-character band shaping, soft clipping, compression, procedural PTT clicks and a live static bed.',
    'A priority queue keeps transmissions from overlapping, enforces a 0.35 s inter-line gap and cooldowns, and lets critical calls cut in ahead of combat chatter.',
    'The top-left Voice Box shows faction colour, callsign and a live waveform with synced subtitles, returning to STANDBY when the line ends.'
  ] },
  { version: 'v1.1.14', title: 'PERFORMANCE & STABILITY PASS', bullets: [
    'Cut cockpit procedural crinkle VRAM ~16x (512 px atlas) and removed 175 per-frame HUD shadowBlur passes for smoother laptop/high-DPI frame times.',
    'Trimmed volumetric cloud-deck raymarcher & NVG shader taps, dropped NVG MSAA target overhead, and collapsed 42 wing-vapor sprites into one GPU Points draw call.',
    'Eliminated per-frame Vector3/Matrix4 heap churn across fleet rendering, missiles, Vulcan fire, gun sight, and ejection while fixing Alt-Tab stuck triggers and Q/E parachute steering.'
  ] },
  { version: 'v1.1.13', title: 'CARRIER DECK FIX + MUSIC PLAYER', bullets: [
    'The bow catapult now waits for USS Enterprise to load, anchors the jet and both wingmen to its real deck ray height, and keeps the carrier mounted and visible in every carrier sortie.',
    'Scenario music now shuffles through every track and auto-advances with a crossfade at the end of each clip instead of repeating the first one.',
    'A top-right Now Playing widget shows the active title with clickable skip, selector and AUTO controls; , . and / do the same from the keyboard.'
  ] },
  { version: 'v1.1.12', title: 'CATAPULT LAUNCH OPENING', bullets: [
    'Carrier missions now open locked on the bow catapult at 0 kt with the jet blast deflector raised, rolling deck steam and the Overlord arming call.',
    'Hold full afterburner to slingshot from 0 to 175 kt off the bow with camera rattle and a steam eruption, then climb out with Warden-2 and Warden-3.',
    'The soundtrack holds the catapult cue through the stroke and crossfades to the mission score the instant the wheels leave the deck.'
  ] },
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
