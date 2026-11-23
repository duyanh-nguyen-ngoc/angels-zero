// ANGELS ZERO — in-game patch notes. Newest first; every release prepends an
// entry here and bumps the patch version (see CLAUDE.md → Pre-push checklist).
// The UI reads PATCH_NOTES[0].version for the briefing + button version chips.

export const PATCH_NOTES = [
  { version: 'v1.1.44', title: 'REAL WINGMAN FLIGHT & ACE BFM', bullets: [
    'WARDEN-2 and WARDEN-3 now fly as real bank-to-turn jets instead of rubber-banding onto formation slots. They visibly bank into turns, break out of formation on COVER / FOCUS orders, pursue with lead and rejoin at realistic jet speeds.',
    'CRIMSON and SOL aces read the fight: high yo-yo energy attacks, rear-hemisphere scissors and cobra overshoot traps, plus missile-aware flares, chaff and beam notches. Two-ace flights bracket and swap drag / bag roles.',
    'A shared allocation-free bank-to-turn integrator now drives the wingmen, with terrain clearance and seamless catapult / limp-home handoffs.'
  ] },
  { version: 'v1.1.43', title: 'MID-SORTIE CARRIER AUTOLAND', bullets: [
    'The USS ENTERPRISE is recoverable any time you are flying near the boat, not only on RTB. Fly within 3.5 km astern and the [L] ENGAGE AUTOLAND prompt appears with the glideslope cues.',
    'A mid-sortie trap no longer ends the sortie or rewrites your objective: you rearm, repair, refuel on deck and cycle straight back onto the catapult. RTB traps still complete the mission as before.',
    'The HUD prompt now reads the same engagement check as the L key, so the pill and the key can never disagree.'
  ] },
  { version: 'v1.1.42', title: 'COCKPIT AUDIO & G-FEEL FIXES', bullets: [
    'Mach 0.96-1.03 now gives a subtle tactile rumble instead of violent camera thrashing, and the afterburner sizzle is a continuous smooth bed with no clacking at full power.',
    'Menus, pause and debrief are silent: every continuous flight voice is muted at its gain and only ramps back when you return to the flight. The 700 Hz choir, stuck lock tones and tinnitus no longer follow you into the briefing.',
    'AGSM breathing, the G-suit hiss and recovery gasps are audible again with separate rhythm and level gains, and a hard loop now builds real greyout and breathing at 4-6 G without an instant blackout.'
  ] },
  { version: 'v1.1.41', title: 'F100 ENGINE OVERHAUL', bullets: [
    'Both F100s now spool with real inertia: roughly 1.8 s up and 2.4 s down, with the right engine detuned and lagging slightly so the pair beats naturally. The compressor whine is a six-oscillator, six-band harmonic choir instead of a single flat tone.',
    'Exhaust is waveshaped and torn by an audio-rate combustion flutter, with a resonant duct formant and deep 36-85 Hz sub-bass thrust. Afterburner adds sparse crackle and a harder sub punch on light-off.',
    'Cockpit and chase now have distinct engine mixes - muffled aft roar, body-conducted bass and close intake whine up front; open roaring tailpipes and wide stereo outside. A dedicated compressor and fixed trims keep the bus peak-safe so BGM, radio, RWR and guns stay crisp.'
  ] },
  { version: 'v1.1.40', title: 'CRIPPLED BANDITS & SOLID DECKS', bullets: [
    'Bandits below half health now trail dark oil smoke and throw intermittent hot-orange sparks from the tail. The ribbons and sparks come from fixed pools, so kills and mission resets clean up without leaking geometry or textures.',
    'Touchdowns have weight again: sink rate drives a two-beat tyre chirp, a metal ring on carrier decks, an oleo camera dip and a nose-wheel slap as the nose comes down. The gear struts visibly compress.',
    'Sitting on the catapult now clanks the shuttle into place and kneels the nose strut under tension; the jet springs up as the shuttle releases. Verified CARRIER_OK with no deck clipping.'
  ] },
  { version: 'v1.1.39', title: 'BURNER THUMP & SUPERSONIC QUIET', bullets: [
    'Pushing the throttle into afterburner now lands a sub-bass ignition thump with a manifold whoosh and a short forward camera kick, once per engagement. The nozzles flare as the burner lights, and the catapult keeps its own launch audio.',
    'Gun bursts stutter a warm glare across the canopy bow and glare shield in the cockpit, and missile shots add a white rail flash plus a spiralling launch-motor smoke puff. All of it is emissive or pooled; light count and draw calls stay constant.',
    'Mach 0.96-1.03 brings a transonic airframe buffet and 9 Hz rumble; past Mach 1.05 the cockpit wind quietens by 35 % while engine and music stay put. Hold 20-24 deg AoA and the jet develops a subtle bounded wing rock that an opposing roll input damps out.'
  ] },
  { version: 'v1.1.38', title: 'BATTLE DAMAGE & BITCHING BETTY', bullets: [
    'Heavy hits now crack the canopy, glitch the HUD combiner and make damaged hydraulics whine when you haul the stick. Cracks clear at the pit stop or a new sortie.',
    'A prioritized voice warning system calls PULL UP, ENGINE FIRE, CHAFF/FLARE, OVER G, ALTITUDE and BINGO FUEL with per-alert cooldowns, on its own audio bus so it never waits behind AWACS radio.',
    'Voice lines use supplied recordings when present, then Web Speech (optional), then a dual-tone chime with no speech assets required.'
  ] },
  { version: 'v1.1.37', title: 'DLZ, TTI & JHMCS', bullets: [
    'A live dynamic launch zone bar now sits beside the altitude tape, with Rmax / Rne / Rmin marks, a range caret and closing velocity; fired missiles report a counting TTI that flips to PITBULL inside 1.5 s.',
    'In the cockpit, holding Free Look brings up a JHMCS helmet sight with airspeed, altitude, heading, boresight reference and target diamonds. QAAM seekers can acquire targets up to 65 degrees off the nose inside the helmet circle.',
    'Both the DLZ and TTI feed the cockpit MFD repaint signature, so the extra symbology costs no draw calls at rest.'
  ] },
  { version: 'v1.1.36', title: 'G-LOC PHYSIOLOGY', bullets: [
    'G-strain now builds faster from 4.8 G with a hold-then-drain recovery, gradually heavy controls, and a true 1.8 s blackout that unloads the jet and wakes you with blurred vision before control returns.',
    'AGSM breathing, a 4.5 G suit-inflation hiss, a pounding heartbeat, high-G tinnitus and a recovery gasp share a dedicated body-sound bus; the world and music muffles as you grey out.',
    'A final fullscreen pass drives desaturation, a heartbeat-pulsing tunnel, blackout and a grey bloom-back recovery in both normal and night-vision views.'
  ] },
  { version: 'v1.1.35', title: 'ZERO-FREEZE COMBAT LIGHTS', bullets: [
    'Eliminated the multi-second freeze when taking missile hits, igniting an engine, or ejecting: nozzle plume lights and gun muzzle light now stay anchored in the scene so hiding a dead engine or aircraft never changes Three.js point-light shader counts.',
    'Verified 0 mid-flight shader recompiles across engine fire, crash ejection, cockpit cannon fire, and sortie respawn.'
  ] },
  { version: 'v1.1.34', title: 'ACE COMBAT FEEL', bullets: [
    'Hold T to padlock the designated bandit: the camera smoothly swings onto the target in chase or cockpit view and springs back on release. Y cycles the square radar between 4/10/25 km ranges.',
    'Hits and kills now stamp HIT / DESTROYED in the world, and a green SHOOT cue lights up when you pull into a rear or head-on firing aspect. Mission escalations hit with a short music dip, radar pulse and [ MISSION UPDATE ] banner.',
    'Punching through a cloud deck flashes the canopy and kicks up mist, and high-altitude contrails now ease in above 12,000 ft using the existing pooled ribbons.'
  ] },
  { version: 'v1.1.33', title: 'ESM UMBRELLA & AIRFRAME ICING', bullets: [
    'Fly into the carrier or AWACS ESM umbrella for faster lock-on, quicker missile reloading and sharper turns on shots launched inside the Zone. A cyan radar ring and ESM ACTIVE badge show the coverage.',
    'Thick cloud now ices the airframe: controls get sluggish, drag rises and a white-blue frost creeps in from the canopy edges. Break into clear air or light the afterburner to melt it off before the ICING caution takes over.',
    'Cloud cover still breaks inbound missile seekers, but a heavily iced jet can no longer rely on it for free.'
  ] },
  { version: 'v1.1.32', title: 'CLEAN FLIGHT INPUTS', bullets: [
    'Multi-key flight combos no longer trigger browser shortcuts in flight: Ctrl, Alt, and Shift chords (including Ctrl+F/S/R/G/J/L/P, Slash, F3/F5, Alt release, and Ctrl+Wheel page zoom) are now intercepted cleanly while keeping F12 free.',
    'Weapon and combat keys now resolve by physical key code when Shift, Ctrl, or Alt are held, so switching weapons with Shift+1/2/3 under afterburner works reliably.',
    'Launching or resuming a sortie now clears stray button focus, and entering fullscreen (F11) engages browser Keyboard Lock on supported browsers.'
  ] },
  { version: 'v1.1.31', title: 'HOT SCRAMBLE & CRIMSON INTRUSION', bullets: [
    'Carrier launches can now go hot: bandits sweep overhead while you sit on the catapult, the ship\'s CIWS chatters and splashes dot the wake. Clear the bow and they turn on you for real.',
    'Bring the jet home on one engine and a manual trap or runway landing earns BROKEN WING +2000, a WARDEN-3 callout and a permanent badge in your service record.',
    'Push a high combo (or force it in testing) and CRIMSON-1 cuts in mid-mission: the music tears out for a moment, the 08_crimson_duel track takes over, and RTB stays locked until he is down.'
  ] },
  { version: 'v1.1.30', title: 'FLIGHT ROLES & TRENCH SHORTCUT', bullets: [
    'WARDEN-2 and WARDEN-3 now carry persistent CAP / STRIKE roles from the STANDBY menu. STRIKE wings hunt ships and radar masts first, switch to canyon SAM sites when nothing afloat remains, and still break off for a six-second self-defence intercept.',
    'A narrow rock arch cuts across the first S-bend of CANYON_RUN. Fly the centreline under the span to skip the gates and bank TRENCH SHORTCUT +1200; clip the piers and you will find the normal crash path. WARDEN-2 has opinions either way.',
    'A faint ◁ SHORTCUT marker shows the ravine mouth until you have used it.'
  ] },
  { version: 'v1.1.29', title: 'AGILE DRONE SWARM', bullets: [
    'Instanced UAV swarms now ride in on mid/late AIR SUPERIORITY waves, NAVAL stage 2/3 and periodic FURBALLs. Compact radar diamonds and a SWARM n/8 bracket keep them distinct from full fighters.',
    'Agile drones orbit and peel off in pursuit, return fire in short cannon bursts, and fall to a single Vulcan round or 4AAM missile. Clear the whole swarm for a SWARM CLEARED +1000 bonus.',
    'A dedicated drone hum rises as the nearest UAV closes in; RWR and the mission map stay clean because swarms are a separate pooled archetype.'
  ] },
  { version: 'v1.1.28', title: 'WAVE-OFF & TOWER BUZZ', bullets: [
    'Carrier recoveries can now spring a wave-off ambush: a clean go-around with full burner, a priority bandit call, and a Last Stand score until the bow is clear and you are cleared to land again.',
    'Buzz the carrier island or the AFB tower supersonically — or thunder past a bandit — for a shockwave jolt, a sonic crack, bonus points and a radio call.',
    'Autoland always releases its carrier hold on an abort, so the jet cannot stick to the deck or leave the ship frozen.'
  ] },
  { version: 'v1.1.27', title: 'LINKED WEAK POINTS', bullets: [
    'CG cruisers and the flagship now have a destructible RADAR / AA mast. Knock it out to silence their flak and SAMs, claim an AA DISABLED reward and cancel the flagship salvo.',
    'Canyon rim batteries can be destroyed individually. A dead sector stops local barrages while neighbouring batteries fire reduced volleys; searchlights over dead sites go dark.',
    'The flagship now paints the sky with a three-second charge beam before launching a spread of six VLS missiles. Break hard to defeat them.'
  ] },
  { version: 'v1.1.26', title: 'SUN BLIND & MISSILE INTERCEPTS', bullets: [
    'Put the sun behind an inbound IR missile and hold your nose on it: after half a second the seeker loses the lock and breaks, worth +350. Radar missiles are unaffected.',
    'Your 20 mm Vulcan can now shoot an incoming missile out of the air for +800, with a mid-air detonation, a slow-motion beat and a clear warning reset.',
    'Flares, chaff, cloud cover, radar notching and ECM all still work as before.'
  ] },
  { version: 'v1.1.25', title: 'WARDEN FLIGHT ORDERS', bullets: [
    'Press G to cycle your wingmen through FORM, COVER and FOCUS. COVER hunts the bandit locking you from behind; FOCUS sends both WARDENs after your designated target.',
    'A badly damaged WARDEN-2 can now limp home on smoke with bandits on her tail. Clear the pursuers to earn WINGMAN SAVED +1500, or lose the wingman if she goes down first.',
    'The wing order badge and a limping roster entry keep you informed, and new debug hooks make both states reproducible.'
  ] },
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
