# ANGELS ZERO — Core Systems Roadmap

Browser F-15C combat flight game (Three.js r160, ES modules, procedural Web
Audio), deployed from `angel-zero/` to https://angels-zero.pages.dev/.
Earlier step-by-step build notes live in the git history (`git log -- PLAN.md`).

Status legend: `[x]` implemented and verified Â· `[ ]` open — gaps listed.

**Verification / CI:** `node angel-zero/scripts/smoke_test.mjs` runs a self-contained headless Chromium smoke suite (12 scenarios: menu, 6 missions, F-22A camera cycle, wingman BTT, ace BFM, warp telemetry, debrief). It is wired into `.github/workflows/smoke.yml` on every push/PR to `main` beside the Cloudflare Pages deploy workflow. `?nowarm` is a debug-only hook that skips the software-GL shader warm-up so CI stays fast. The suite fulfills three.js r160 from repo-root `smoke_vendor/` (no unpkg dependency in CI) and blocks all third-party CDNs. Boot instrumentation: `setLoadProgress(pct, stage, detail)` drives a tactical HUD (`#statusTitle/#statusStage/#statusBarFill`) with real byte counts for AIRFRAME, COCKPIT, CARRIER, SFX and SHADERS; `window.__az.bootMs` records module-eval-to-ready time and the suite asserts a <15 s local budget and clean `#status` removal. `audio.preload(base, onProgress)` batches SFX in groups of six with the active airframe's core bank first.

**Guided training:** `src/training.js` implements a zero-allocation six-step qualification state machine (afterburner, 4G bank, camera cycle, missile lock/kill, flare defence, cannon pass) with benign non-shooting target drones from `combatSys.spawnTrainingDrone()`, an HUD objective card, beginner safety guards, and `?trainingstep=N` debug jump. Selectable as `TRAINING` from Standby.

**Step 4 — runway recovery (complete):** ILS/localizer + PAPI approach, forgiving touchdown envelope, nosewheel steering and wheel brakes on the ground, and a 4 s mid-sortie `state.pit` rearm/repair/refuel loop (`updateGround` / `updatePitStop`, HUD progress bar, `?pitstoptest=1` deterministic debug setup). Liftoff resets `state.pit.done` so the pilot can recover again later.

**Pilot portability:** `src/profile_sync.js` exports a compact `AZP1:` pilot code (or JSON file) of all persistence keys and restores them with a non-destructive merge (max stats, best rank, union of liveries). Optional Cloud Sync uses an anonymous `AZ-XXXX-XXXX` ID via `functions/api/profile.js` (KV `AZ_PROFILES`); offline/local runs fall back silently. The Controls & Audio modal exposes copy/import/export/sync controls; `__az.profileSync` is available in debug builds.

**Releases:** `angel-zero/scripts/extract_release_notes.mjs` renders `PATCH_NOTES[0]` as GitHub-flavored Release Markdown (with `--highlights` for milestone notes). To publish: bump `PATCH_NOTES[0].version`, commit/push to `main`, then `git tag -a vX.Y.Z -m "ANGELS ZERO vX.Y.Z" && git push origin vX.Y.Z`. The `GitHub Release` workflow (`.github/workflows/release.yml`) generates notes from the tag's `patchnotes.js` and publishes the release with the live play link. The smoke suite asserts the in-game `#buildChip` matches `PATCH_NOTES[0].version` so tags can never drift from the build.

**Social loop:** `src/replay_share.js` encodes/decodes a compact `?replay=<token>` sortie snapshot (trace + events + score/rank/aircraft) with no backend; `src/leaderboard.js` posts scores to `/api/leaderboard` (Cloudflare Pages Function at `functions/api/leaderboard.js`, KV `AZ_LEADERBOARD`) with a silent local `az_local_board` fallback for `server.py` and CI. The debrief screen exposes `[ SHARE REPLAY ]`, a callsign, `[ SUBMIT SCORE ]` and `[ LEADERBOARD ]`; shared links open the debrief trace in view-only mode with a `[ FLY THIS MISSION ]` CTA.

---

## Pillar 1 — Core Engine & Telemetry (`src/state.js`)
- [ ] **Single source of truth for 6-DOF state, inventory, lock state, fixed timestep.**
  - Implemented today (inline in `index.html`): `state` (position, quaternion,
    velocity, rates, throttle / afterburner, G, AoA, Mach, radalt, highG /
    barrelRoll) and `combat` (gun / missile / UGB / flare counts, reloads,
    `weapon`, `designated` / `lockState` / `lockProgress`, `mslPylons`,
    bandit lock, cloud densities) shared by reference with every module.
  - **Gap:** no `src/state.js` module — state and the `combat` object are
    created in `index.html`.
  - **Gap:** variable timestep clamped at 50 ms per frame (`animate()`), not a
    fixed-step accumulator; physics is rate-based, so it is stable but not
    frame-rate independent at the margins.

## Pillar 2 — 6-DOF Flight Physics & Camera Feel (`src/flight.js`, `src/camera.js`)
- [ ] **Responsive handling, energy, stall, chase camera, cockpit head.**
  - [x] **Rigid-body 6-DOF F-15C** *(build `s27a`)* — attitude and velocity are
    decoupled: live AoA / sideslip, lift perpendicular to the airflow (CLa 3.5,
    CLmax 1.55 at the 24 deg stall), fuselage side force, drag = CD0 + 0.24 CL^2
    + transonic wave rise (M0.92-1.04) + post-stall form drag + speed brake,
    thrust with density / ram, gravity; semi-implicit Euler. Mass 17,600 kg +
    85 kg per AIM-9 + 230 kg per Mk-82 (~20,700 kg full); inertias Ixx 38,900 /
    Iyy 223,800 / Izz 256,900 kg m^2 (+ stores). Rotation from moments: FCS turns
    stick into a load-factor / AoA demand (7.5 G, 9 G in High-G, -2 G push, 26 deg
    limit), control authority scales with dynamic pressure (mushy < 230 kt /
    high up) and stiffens past M1.1; aero rate damping, weathercock yaw,
    dihedral roll, adverse yaw; departure latch past 24 deg below 230 kt (nose
    drop + wing rock until it flies again). Chase camera tracks a nose /
    velocity blend; chase HUD adds the true flight-path marker; G readout is
    the real aerodynamic load factor (max ~9 G instead of 12-30 G). Verified
    headless (see the stall fix below for the current AoA behaviour): 430 kt High-G
    break 8.3 G bleeding 40-46 kt/s, roll winds up in ~0.3 s and settles in
    ~0.3 s, 80 deg climb bleeds ~13 kt/s, AB dive M0.99 -> 1.21, level AB
    creeps through the drag rise to M1.06, stall nose drop + recovery.
  - [x] **Stall / AoA fix (no maneuver bouncing)** *(build `s29b`)* — CAS AoA
    limiter: demand capped at 23 deg (below the 24 deg stall), nose-up authority
    tapered 20 -> 26 deg on a lead-compensated AoA (AoA + 0.22 s of AoA rate), so
    hard turns hold a planted ~22.7 deg carve with no overshoot. True stall only
    at low speed with hysteresis: in below 160 kt (or nose > +65 deg below 190
    kt), out above 180 kt with AoA < 16 deg; while stalled a critically damped
    nose-drop eases the nose onto the velocity vector (no snaps, no sinusoidal
    wing rock). STALL warning debounced in sim time (>= 0.25 s hold, cue above
    23.8 deg below 260 kt / stalled / < 135 kt); high-AoA buffet is camera
    micro-vibration only (<= 0.015 rad). Verified headless at 0.1-0.15 s
    sampling: 350 / 450 kt High-G pulls and 350 / 550 kt roll-and-pull are
    monotone with no warning; 205 kt pull settles at 23.4 deg without passing
    the stall; throttled stall in at 155 kt, smooth nose-drop, out at 184 kt.
  - Barrel roll (Q; the double-tap A/D trigger was removed in s37a), spring-damped chase camera that tightens
    FOV in High-G turns, 1st-person 3D cockpit (`src/cockpit3d.js`) with
    roll-lag / look-into-turn head inertia.
  - [x] **Articulated F-15C surfaces (`src/surfaces.js`):** `Ctrl_Stabilator_L/R`
    (all-moving, pitch + roll differential, +/-24 deg), `Ctrl_Aileron_L/R`
    (+/-20 deg), auto `Ctrl_Flap_L/R` (0 -> 26 deg below ~260 kt / high AoA),
    `Ctrl_Rudder_L/R` (+/-22 deg), dorsal `Ctrl_Speedbrake` (0 -> 46 deg on
    S / overspeed > M1.25, visual only), `Nozzle_L/R` F100 kinematics (1.06x
    idle -> 0.84x MIL -> 1.16x afterburner) with an inner glow ring; spring
    `dt * 12` from the live rate commands (`state.ctl`). Cut in
    `scripts/prep_f15.py`: region-limited bisect + face split, origins on the
    hinge lines, `hinge_axis` / `hinge_kind` glTF extras, dark hinge fairings
    and a speedbrake well so deflected surfaces show no see-through slits;
    GLB 11.6 MB. Verified headless (pitch / roll / yaw / brake / afterburner).
  - [x] **Variable intake ramps + supersonic aileron lockout:** `Intake_Ramp_L/R`
    cut from the upper intake cowls (hinged on their top-aft edge) schedule
    0 deg below M0.7 -> -11 deg by M2.0; across M0.95 -> M1.05 the ailerons fair
    flush and the stabilator roll differential grows +/-9 -> +/-20 deg (100 %
    supersonic roll authority). Verified headless: M1.30 -> ramps -4.9 deg,
    ailerons 0, stabilators +/-9.8; M0.63 -> ailerons +/-9.8, ramps 0.
  - [x] **Over-wing G-vapor + nav lighting:** condensation sheets stream aft over
    the wing roots / strakes above 5.2 G below 12,000 ft (opacity and drift scale
    with G and air density, tinted from the time-of-day cloud colour); steady
    red `#ff2233` / green `#22ff66` wingtips, white 1.2 Hz double-flash strobes
    (wingtips, fin tips, belly), pulsing red dorsal + belly beacons (faint by
    day, full at DAWN / DUSK / NIGHT and through NVG).
  - [x] **Pilot G-LOC physiology** *(build `s26a`)* — `state.gStrain` builds
    above 6.2 G (faster beyond 8 G) and drains below 4.5 G, `negGStrain` under
    < -2.2 G; greyout = desaturated / dimmed 3D view plus a radial tunnel
    vignette closing to 0.92 opacity, heartbeat-synced dimming and
    `[ G-LOC WARNING ]` + chime above 0.72, softened stick above 0.95, crimson
    redout vignette. Audio: recorded buffet / breathing-heartbeat / chime
    (`assets/sfx/`, CC0, see `CREDITS.md`) decoded via `decodeAudioData` with
    procedural fallback, turbine pitch-dip + low-end swell under G / AoA,
    master hearing-tunnel low-pass 12 kHz -> 550 Hz. Verified headless: samples
    decode, strain build / release curve, greyout + warning screenshots.
  - **Gap:** flight model and chase camera live in `index.html`
    (`updatePhysics`, `updateCameraAndVisuals`) — no `flight.js` / `camera.js`.
  - **Gap:** no chase-camera FOV *speed* kick (only the High-G tighten).

## Pillar 3 — Archipelago World & Dynamic Time-of-Day (`src/world.js`)
- [x] **5-island eroded heightfield** — airbase island + runway peninsula,
  Twin Canyon Ridge gorge, volcanic caldera (3,200 ft), east / west atolls,
  two fly-under suspension bridges (184 ft clearance); triangle-exact height
  grid shared by rendering and all collision / weapon queries; obstacle
  collision for bridges, towers, hangars, turbines. *(`src/world.js`)*
- [x] **Reef ocean** — depth-driven navy â†’ turquoise water, sandbars,
  shoreline surf foam. *(ocean shader in `index.html`)*
- [x] **Cloud decks + lock-breaking** — 112 drifting formations in three decks
  (3.5x): 36 low sea-mist / valley banks (900-2,200 ft, seeded on ridges and
  straits), 56 towering cumulus (2,600-5,800 ft, slate-indigo bellies under
  overcast), 20 high cirrus / stratus streaks (7,500-10,500 ft, stretched thin
  billboards); weather coverage shows 30 % (CLEAR) to 100 % (OVERCAST / STORM);
  every visible formation feeds `cloudDensity()` (two-way seeker / missile
  lock loss, white-out, canopy moisture). *(`src/vfx.js`, `src/canopy.js`,
  `src/combat.js`)*
- [x] **Randomized weather** *(build `s25a`, `src/weather.js`)* — `CLEAR` /
  `SCATTERED` / `OVERCAST_RAIN` / `THUNDERSTORM` rolled with the time of day on
  every sortie and restart, `[ CYCLE WEATHER ]` + `WX:` chip on the briefing,
  `[ WX: ... ]` HUD badge in rain. Overcast greys sky / fog / clouds / sea toward
  slate (#4a5568 day, #0d131f night) and dims sun, mie, stars and glitter;
  FogExp2 x2.3-2.9; wind-chopped sea + whitecaps; 1,800-drop aircraft-centred
  rain volume streaked along the drop velocity relative to the jet (tilts with
  airspeed / slip, fades at the canopy); storm gusts +/-0.4 G with roll / pitch
  kicks; sheet lightning lighting clouds, sky and ocean with thunder after the
  sound delay. 1st person: rain splats + airstream rivulets racing over the
  canopy, clearing above ~6,200 ft. Audio: filtered pink-noise rain patter
  (cockpit-muffled) and procedural thunder rolls. Verified headless: CLEAR /
  OVERCAST_RAIN / THUNDERSTORM in chase + cockpit, night storm, rain off above
  the deck, briefing chip / button, zero page console errors.
- [x] **Time of day + NVG** — randomized DAWN / DAYLIGHT / GOLDEN_HOUR / DUSK
  / NIGHT presets (sky, sun / moon, stars, lights, fog, ocean, clouds),
  briefing `[ CYCLE TIME ]`, `N` night vision with per-preset gain.
  *(`src/atmosphere.js`, `src/nvg.js`)*
- Note: time of day, clouds and NVG are separate modules rather than inside
  `world.js`; no functional gap.

## Pillar 4 — Combat Loop, Ballistics & VFX (`src/weapons.js`, `src/vfx.js`, `src/audio.js`)
- [x] **Two-stage targeting** *(build `s24a`)* — APG-63 auto-designates the
  best bandit in the 30 deg / 8 NM forward radar cone (green brackets, type,
  range; no lock, so an un-`C`'d launch is a dumb-fire); `C` arms the seeker
  (`combat.seekerArmed`) for the progressive IR lock NONE â†’ ACQ (amber diamond)
  â†’ LOCK (crimson square + range arc + `[ SHOOT ]` + lock tone); `C` while locked
  cycles to the next nearest forward bandit; a decayed lock / cloud cover drops
  back to passive radar tracking.
- [x] **>4AAM track-while-scan** — `R` cycles `>MSL` â†’ `>4AAM` â†’ `>UGB` (`3`
  selects it); 20-round pool, radar tracks up to 4 bandits (`TGT 1-4`), `C`
  locks them all (25 deg / 4.5 NM / 1.6 s, `LOCK 1-4`), RMB / M ripple-fires one
  missile per lock 0.09 s apart, each pylon round hidden for a 3.5 s re-rack,
  every missile guiding independently; 12 s pool reload.
- [x] **ALR-56C RWR** — amber spike chevrons on the radar's inner ring at the
  emitter's clock bearing (paint / acquiring), crimson spike on a full lock,
  pulsing crimson `M` + vector line for a missile tracking us; audio search
  chirps (painted), quick triple pips (locked), rapid 1.9 / 2.7 kHz warble only
  with a missile inbound.
- [x] **ALQ-135 ECM (`Z`)** — 6 s jamming (`[ ECM ACTIVE ]`, cyan, drain bar)
  then 14 s recharge (`[ ECM RECHARGE ]`); bandit lock build time x2.5 and a
  35 %/s chance per established track to break. Verified headless: passive
  track without C, MSL lock + FULL launch, 4AAM 4/4 locks + 4-round ripple
  (pylons hidden, re-racked), dumb-fire before C, RWR paint / lock / msl
  bearings, ECM slow-down (0.54 vs 1.0 lock at 2.5 s) and lock breaks, zero
  page console errors.
- [x] **Pylon stores** — real GLB AIM-9s / Mk-82 UGBs hidden and flown as
  clones; turn-rate-limited proportional navigation by lock quality.
- [x] **CCIP** — closed-form ballistic solve, fall line + impact pipper.
- [x] **M61A1 Vulcan** — 6,000 rpm, tracers, LCOS lead reticle, gun funnel.
- [x] **Localized enemy damage + wing severance** *(build `s29a`)*
  - Bandit airframes are split per material into body / left wing / right wing
    instanced parts (triangle centroid |x| > 1.8 m in the wing chord), so a
    wing can be hidden per jet and flown off as a real mesh.
  - 20 mm hits use the round's closest approach this frame, transformed into
    the bandit's local frame: wings (30 hits each, roll jolt toward the hit
    wing + altitude dip, persistent wobble), tailplanes (shake), engines /
    tail (`[ ENGINE HIT ]` fire + -40 % top speed), fuselage core (e.hp).
    Sparks + flash at the exact impact point.
  - Wing at 0 -> `[ WING SEVERED ]` (+300), tumbling smoking wing debris,
    fuel vapour + dark smoke + flame from the stub, CRIPPLED flight: 110-180
    deg/s fought roll toward the missing wing, spiral, 18-32 m/s sink, until
    sea (geyser) / island (fireball + shockwave) impact with full kill credit;
    finishing the core mid-air still kills it at once.
  - Verified headless (`wingtest` + `wingtrack` test pilot): left / right
    severance, crippled spiral sinking ~28 m/s to a sea impact with kill
    credit (1,800 pts), core burst -> clean kill, missile -> FULL:HIT kill,
    zero page console errors.
- [x] **Step 3: barrel heat, CCRP, battle damage** *(build `s28a`)*
  - Vulcan heat 0 -> 1 over ~3.2 s of fire, cools ~0.28/s (+0.12 at speed);
    thin thermal arcs (reticle / cockpit boresight / GUN row) emerald -> amber
    -> crimson; at 1.0 `[ GUN OVERHEAT ]`, `GUN HOT`, steam from the starboard
    gun port, firing locked out until < 0.45.
  - Surface strike targets: 3 SAM sites on flat island ground + a destroyer
    circling in deep water (bomb blast / sustained 20 mm kills, burning wrecks,
    sinking ship, respawn 40 s after the last); radar squares; ground-map
    auto-designation in `>UGB` (C cycles).
  - CCRP in `>UGB`: azimuth steering line through the target, release cue bar
    sliding down to the FPV, `REL 03.2s` / `OVERFLY`, steer cue; holding RMB /
    M arms auto-release at the along-track zero crossing (within 60 m of the
    line); moving ships led by the time of fall; CCIP unchanged otherwise.
  - Damage: >= 35 % hydraulic leak (-15 % control response, flickering HYD
    caution, `HYD LEAK`); >= 60 % random F100 flameout (that plume out, thrust
    x0.72, yaw / roll pull toward the dead side, oil-smoke ribbon, `L/R ENG
    OUT`); >= 85 % engine fire (flame licks, FIRE L/R tile, master caution +
    `ENGINE FIRE — EJECT [E]`).
  - Verified headless: overheat at ~3.3 s, lockout while held, resume after
    cooling; CCRP auto-release on a SAM (0.9 m along-track, destroyed) and the
    destroyer (1.6 m, destroyed); DMG 65 % left engine out with sideslip + roll
    toward it; DMG 90 % fire; zero page console errors.
- [x] **Flares / chaff (`X` / `G`)**, bandit AI with symmetric locks, missile
  break / decoy / cloud loss.
- [x] **Enemy AI & Collision Overhaul** *(current step, done — `src/combat.js`)*
  - Bank-to-turn bandits: roll the lift vector onto the turn demand (+/-82 deg,
    ~205 deg/s), then G-limited pull; gravity / climb / induced-drag energy
    bleed; throttle cruise 360-440 kt, afterburner 520-640 kt.
  - States `PATROL` / `ENGAGE` / `EVADE_BREAK` (85 deg, 7 G, burner) /
    `BARREL_ROLL` (helical roll or split-S toward the cloud deck) /
    `EXTEND_CLIMB`; our `LOCK` or a missile inside 1,800 m triggers a reaction
    after 0.35-0.75 s.
  - AI flares: 1-2 salvos per bandit, 10 s cooldown, 45 % spoof per tracking
    missile inside 1.2 NM (bandit flares never decoy bandit missiles).
  - Terrain / sea safety: 150 / 350 / 650 m look-ahead along the velocity
    vector, `minSafe = max(water + 35, terrain + 55)`, wings-level pull-up
    inside the 140 m band, hard floor 12 m; wrecks always burst on impact
    (water geyser / ground fireball).
  - Separation: merge break-away inside 95 m (or a predicted pass that close,
    roll 70-110 deg, >= 32 m slip clearance), 65 m wingman repulsion, 14 m swept
    airframe collision (shockwave, +45 % DMG, bandit destroyed).
  - Visuals: orange sheath / blue core afterburner cones, wingtip condensation
    streaks above ~4.8 G.
  - Verified headless: 70 s low patrol over the islands (min clearance 199 m,
    0 floor clamps), canyon chase, head-on merge (closest pass 81 m), ram
    (bandit destroyed, player HP 100 -> 55), lock + launch (break / split-S,
    flares, `FULL:FLARE` spoof), zero page console errors.
- [x] **VFX** — afterburner diamonds, contrails, vapor, Mach cone, smoke /
  fire particles, explosions, water geysers, shockwave rings.
- [x] **Procedural Web Audio** — engines, BRRRT gun, seeker tones, alerts,
  bomb / flare / NVG / cloud / designation DSP.
- [x] **Audio audit & fix: F100 strain, airframe buffet, pilot G-LOC breathing**
  *(build `s30e`, `src/audio.js`)*
  - Root cause of silence: `M` on the menu persisted `az_muted` in
    localStorage, which muted every later session; the context was unlocked
    only by the Launch click. Now mute always starts OFF, volume < 0.05 resets
    to default, and `pointerdown` / `mousedown` / `keydown` / `touchstart`
    (capture) all call `audio.init()` + `resume()`. Missing
    `jet_turbine_loop.mp3` (404) dropped from the SFX map.
  - Chain: cockpit LP -> master -> G-LOC tunnel LP -> compressor -> analyser
    -> destination; pilot body sounds + chime bypass the tunnel.
  - Deterministic DSP layers (no file dependency): F100 core 82 / 84.5 Hz
    saw+tri rising to ~165 Hz at MIL, 1.4-2.6 kHz compressor whine, pink
    exhaust LP 320 Hz -> 1.8 kHz in AB, 55 Hz sub; airframe groan resonators
    110 / 185 / 270 Hz with LFO warble (3.2-9 G); turbine lug 70-130 Hz at
    AoA > 10 deg; buffet 220-680 Hz band-pass with 14 Hz flutter (AoA > 9 deg,
    > 520 kt or high G); anti-G breathing cycle (inhale / strain hold / exhale)
    at gStrain > 0.15 or > 5 G; heartbeat 52 -> 38 Hz, 95 -> 155 BPM from
    gStrain > 0.35; tunnel muffling 14 kHz -> 480 Hz from gStrain > 0.45.
  - Debug: `window.__audioDebug()` (state, analyser RMS, mute, volume, layer
    gains, G), `__step(n)` / `__dbgInput(nx, ny, keys)` with `?debug`.
  - Verified (real Launch click): `running`, cruise RMS 0.09-0.15; 4 s High-G
    pull RMS 0.22-0.30 with groan 0.95 + lug + buffet + breathing; sustained
    9 G AB pull brings the heartbeat (0.93) and tunnel LP to ~2.6 kHz; all
    layers return to 0 on release; zero page console errors.
- [x] **Style combo multiplier, HUD callouts & push-forward refills**
  *(build `s31a`, `src/combat.js` style section, `src/hud.js`, `src/audio.js`)*
  - `C.comboMult` 1.0x -> 5.0x scales every point scored while the chain is
    alive (score delta x mult x DANGER bonus, tracked in `C.comboBonus`);
    `C.comboTimer` 12 s restarts on every kill / style trigger, chain drops to
    1.0x at 0. Reset on respawn.
  - Style triggers: WING RIP +300 / +0.5x / gunHeat x0.5 / +1 FLR (Vulcan wing
    severance; replaces the old flat +300), GUNS KILL +400 / +0.5x / +1 FLR
    (direct Vulcan kill), 4AAM SWEEP +500 / +0.75x (2+ ripple-salvo kills in
    2.5 s, once per salvo), CLOSE CALL +250 / +0.5x (bandit missile aimed at
    us passes inside 55 m and opens without fusing; missile whoosh), BRIDGE
    THREAD +600 / +1.0x (cross either strait span below the deck between the
    abutments above 380 kt; 10 s per-bridge cooldown), DANGER CLOSE x1.5
    passive (< 180 ft AGL, > 420 kt, over water or inside the NW canyon gorge).
  - HUD: `x2.5` readout + 2 px emerald -> gold decay bar under SCORE (hidden at
    1.0x), `DANGER x1.5` tag; right-center Style Feed (fade-up, pop, 3.2 s,
    gold for big plays, refill sub-line). Audio: `styleChime(tier)` bell
    arpeggio on the headset bus, `missileWhoosh()` Doppler sweep.
  - Verified in the browser pane with live sim (`__step`): real 20 mm wing
    severance -> heat 0.90 -> 0.45, FLR 2 -> 3, x1.5 -> x2.0, timer 12 s; guns
    kill 1900 x1.5 = 2850; bridge A pass at 437 kt / 30 m -> BRIDGE THREAD +
    DANGER CLOSE (600 x2.0 x1.5 = 1800); real bandit missile passing at 38 m
    -> CLOSE CALL; triple-lock 4AAM ripple, kills 0.15 s apart -> SWEEP x1.75;
    x2.0 decays to x1.0 at exactly 12 s; zero page console errors (headless
    wingtest + cockpit runs too). `combatSys.awardStyle(kind)` exposed for
    debugging.
- [x] **Style feedback polish: center-HUD callouts, punchy audio, refill flashes**
  *(build `s31b`)*
  - Callouts moved into center-peripheral vision: chase view at 64 % of the
    viewport, cockpit just under the combiner glass lower edge; bold 22 px
    text on a dark shadowed plate, 0.15 s pop (1.35x -> 1.0x), 1.6 s hold,
    0.6 s slide-up fade; older callouts stack above at 78 %; drops below
    PULL UP / STALL / OVERHEAT banners. Reward bracket beside each callout
    (`WING RIP +300 [HEAT -50% // +1 FLR // x2.0]`), cyan when it refilled.
  - Multiplier badge: 24 px readout with springy bounce on every climb, 4 px
    glowing decay bar; tiers emerald `#58ff9a` (<= x2.5), gold `#ffcc33`
    (x3.0-4.0), crimson-gold `#ff3b5c` (x4.5-5.0).
  - Refill flash: GUN / FLR rows go white -> cyan with a row glow for 0.4 s.
    Reticle kill-flash: double expanding diamond ring (0.25 s, tier colour)
    on every confirmed kill. `[ DANGER CLOSE x1.5 ]` amber pill at 75.5 %.
  - Every kill now awards: Vulcan kills GUNS KILL, all others (missile, bomb,
    crash, ram, ground targets) TARGET DESTROYED +0.5x with the 12 s timer.
    CLOSE CALL radius 95 m; DANGER CLOSE < 220 ft AGL above 380 kt.
  - Audio: confirmation ping 1,320 -> 1,760 Hz (sine + triangle + 2nd / 3rd
    partials above the F100 whine band), +1 semitone per combo step, on the
    headset bus with a -7.5 dB / 160 ms world-bus duck (`N.duck`); steam hiss
    (gun vent), double flare-reload clack, louder supersonic whoosh + thump.
    Measured under full afterburner (477 kt): ping +18.7 dB at 1,760 Hz and
    +18.1 dB at 3,520 Hz over the engine floor (`audio.bandDb(hz)` probe).
  - Verified in the pane (real 20 mm wing rip / guns kill under AB, missile
    kill, real 80 m missile pass -> CLOSE CALL, low pass over water -> pill),
    screenshots of x3.0 gold / x4.0 / x5.0 crimson tiers, refill flashes and
    kill ring in chase + cockpit; zero page console errors (headless wingtest,
    cockpit, menu).
- [x] **Adaptive 3-layer combat soundtrack + reactive AWACS / enemy comms**
  *(build `s32a`, `src/audio.js` music section, new `src/radio.js`, `src/hud.js`)*
  - 136 BPM D-minor step sequencer, lookahead-scheduled on `ctx.currentTime`
    (25 ms timer + every audio frame top up 0.3 s), 8-bar Dm | Dm | Bb | Bb |
    C | C | A | A loop (bass D2 -> Bb1 -> C2 -> A1).
    L1 PATROL (airborne): pulsing 8th sub-bass, dark detuned stereo saw pad
    through a sweeping low-pass, sonar ping. L2 FURBALL (bandit < 3 km, leaves
    > 3.4 km, or combo >= x1.5): kick + gated snare, 16th saw arp bass with
    filter pluck. L3 ACE (combo >= x3.0): detuned brass lead (saws + sub
    square, filter swell, per-note delayed vibrato, dotted-8th delay) + 16th
    closed hats. Layers crossfade `setTargetAtTime(0.6 s)`, 4 s hold before
    stepping down.
  - Bus: layers -> musicGain (K toggle) -> musicDuck (0.65 while a radio
    transmission is keyed) -> music bus 0.62 -> master -> G-LOC tunnel, so it
    follows volume / mute and muffles with blackout.
  - `K` and a `[ MUSIC: ON / OFF ] K` button on the shared briefing / pause
    panel (default ON every session; not persisted); K listed in the keybind
    matrix. `__audioDebug().music` reports layer, live layer gains, bar /
    step, notes scheduled, duck, lookahead.
  - Radio (`src/radio.js`): priority queue (4 deep, stale entries expire),
    one transmission at a time, 3.5 s between key-ups + 1 s open air after
    each, per-line cooldowns; VHF squelch (high-passed static + 1,850 Hz
    roger beep) on key-up and key-down. AWACS OVERLORD (emerald): launch
    picture call, new-wave call, "Good kill! Keep the pressure on!", "Watch
    that altitude, Eagle!" (< 250 ft descending), BRIDGE THREAD line. Enemy
    (crimson, only while bandits are alive): WING RIP Mayday / "ripped Lead's
    wing" lines, 3-kill chain or x2.5 panic lines (once per combo chain),
    4AAM SWEEP "scatter".
  - HUD: top-center subtitle box (center ~9 %), 1 px translucent frame, keyed
    mic bar, << CALLSIGN >> badge, typed text (42 cps) with caret, fade in /
    out; upper center banners are pushed below it.
  - Not wired (no backing system yet): bomber and base-under-attack alerts.
    (The Ace phase and its lines landed in `s32b`, below.)
  - Verified in the pane: launch -> L2 at 2.6 km with AWACS picture call
    (duck 0.65); bandits pushed to 15 km -> L1; bandit at 2 km -> L2; combo
    x3 -> L3 (gains 0.9 / 0.99 / 0.88); K toggles bus 1 -> 0 and the button
    label; priority ordering (WING RIP line ahead of an earlier BRIDGE line);
    3 kills -> "Good kill" then BANDIT LEAD panic; enemy box + center
    callouts on screen together without overlap; zero page console errors
    (headless wingtest, cockpit, menu).
- [x] **Mission phases + PHASE 3 Ace boss: SCARLET 1** *(build `s32b`)*
  - Three-phase cycle on the wave counter: PHASE 1 / PHASE 2 are six-bandit
    waves, PHASE 3 spawns SCARLET 1 (Su-35S) 10 km ahead with two escorts;
    after the Ace falls the cycle restarts at PHASE 1 (`combat.phase`,
    `combat.ace`, `combat.aceDowns`).
  - Ace: always engages from any range, +2 G (9 G) in every combat state,
    0.12-0.24 s reactions, bandit radar lock 40 % faster, missile re-attack
    8-12 s, 470 / 760 kt cruise / burner, 6 flare salvos with 4 s re-arm and
    70 % spoof, 360 HP core, 70-hit wings, engine fire only after 5 engine
    hits; AIM-9 / 4AAM / bomb hits deal 150 HP instead of a one-shot kill
    (three missiles to kill), wing severance still cripples it.
  - Look: per-instance crimson livery (InstancedMesh `setColorAt`, all 52
    fleet meshes), red wingtip vapour trail; HUD crimson rotating double
    diamond + `ACE // SCARLET 1` tag + HP bar on the target, `ACE` off-screen
    pointer, top-left `PHASE n  BANDITS m` (crimson in PHASE 3) + Ace HP bar.
  - Rewards: ACE KILL style (+5,000, +1.0x) on top of the kill; center
    callout, event, comms.
  - Music: layer 3 (ACE climax) while the Ace is alive, independent of combo.
  - Radio: AWACS phase-two / new-picture wave calls; PHASE 3 AWACS warning
    ("That's their ace. Watch yourself, Eagle.") then SCARLET 1: "All units
    clear the airspace. That Eagle is mine."; below 50 % HP taunt; on the
    kill AWACS "Scarlet 1 is down!" + escort "Everyone bug out!".
  - Debug: `?ace` (start in PHASE 3), `combatSys.spawnAce()`, `phase` block in
    the combat log.
  - Verified in the pane: natural cycle (cleared phase 1 and 2 -> PHASE 3
    with Ace + 2 escorts and both radio lines in order); fresh `?ace` run 40 s:
    Ace in ENGAGE 93 % of the time, max 9.0 G, 671 kt, gun pass to 39 m
    (player 100 -> 58 %); three real AIM-9 hits 360 -> 210 -> 60 -> kill;
    taunt from real gun hits at 176 HP; ACE KILL +5,000, kill radio lines,
    next wave PHASE 1 with normal labels and no tint; music layer 3 with combo
    at 1.0x; crimson instance colour on the Ace slot only; zero page console
    errors (headless `ace`, wingtest, cockpit, menu).
- [x] **Fair enemy AI aerodynamics: roll inertia, G caps, energy bleed** *(build `s32c`)*
  - Bank-to-turn kept, now with airframe limits rolled per bandit: roll rate
    110-140 deg/s (Ace 175), roll acceleration 520 deg/s^2 (Ace 700) so rolls
    build up and brake onto the target bank without overshoot (no snapping),
    barrel-roll helix just inside the roll limit.
  - G caps: 6.0-6.8 G per bandit (was 7-8 G, 10 G Ace), Ace 8.5 G; merge
    break-away, terrain pull-up and full-G breaks are clipped to the cap.
    Turn rate stays omega <= g*G/v. Below 240 kt available G scales with
    (v / 240 kt)^2 (floor 35 %) and roll rate with v / 240 kt (floor 50 %).
  - Energy model replaces the speed-target lerp: thrust 4.5 m/s^2 MIL +
    6.5 AB (T/W ~1.1) with a feed-forward throttle, parasitic drag ~ v^2
    (AB target = level top speed), induced drag 0.36 * (G^2 - 1.5), full
    g sin(gamma) on climbs / dives; speed floor 175 kt (was 272 kt, which
    made slow-speed fights impossible).
  - New RECOVER state: in ENGAGE / a defensive break below 260 kt the bandit
    unloads for 2.5-4 s: wings level, 7 deg dive (15 deg below 240 kt),
    burner, <= 2 G, allowed to push over (negative G) if nose-high; only a
    missile inside 900 m interrupts it. `ai.recovers`, `ai.maxRoll`,
    `ai.minKt` in the combat log; TAC code `V`.
  - Not applicable: there are no bombers in the game yet, so the 2 G / 30
    deg/s bomber limits have no airframe to apply to.
  - Verified in the pane (scripted dogfights): bandit on our six in a 50 s
    sustained AB turn: roll peak 113 deg/s = its cap, G 6.0 = its cap, zero
    frames turning faster than g*G/v, 5.6 G at 365 kt bleeding 10.8 m/s^2;
    radar-lock pressure fight 60 s: 5 RECOVER episodes at 260 kt, each wings
    level within 1 s and regaining 15-57 kt, min 258 kt, G 6.79 / roll 121
    = caps; nose-high slow entry pushes over at -1.1 G (40 -> 8 deg in 4 s)
    then rolls back in progressively; Ace 8.5 G / 175 deg/s, never needs to
    recover; wing-severed bandit spirals (22 m/s sink, continuous roll) to
    impact with kill credit after ~59 s. Headless: low patrol min clearance
    199 m / 0 clamps, head-on merge 43 m / no ram, fleet max 6.8 G, zero page
    console errors (lowpatrol, merge, ace, cockpit).
- [x] **Persistent pilot record + unlockable F-15C liveries + sortie debrief** *(build `s33b`,
  new `src/profile.js`, new `src/livery.js`)*
  - Sortie definition (new): one PHASE 1 -> 2 -> 3 cycle. CLEARED when the
    Ace falls (debrief 4.5 s later), FAILED when the pilot ejects / is shot
    down / crashes (debrief when the parachute sequence ends, replacing the
    old auto-respawn), ABANDONED via pause -> RESTART (lifetime counters bank,
    no rank). Rank from sortie score: S >= 80,000, A >= 50,000, B >= 25,000,
    else C; a failed sortie is capped at B.
  - Profile (`localStorage` `angels_zero_profile`, JSON): bestScore, bestRank,
    sortiesCleared, sortiesFlown, totalKills, wingsSevered, bridgesThreaded,
    unlockedLiveries (default `['EAGLE_GREY']`), selectedLivery. Every load
    is sanitised against defaults; corrupt JSON / blocked storage falls back
    to an in-memory record (verified: `{not json` -> clean defaults, no
    errors, valid record rewritten).
  - Liveries: EAGLE GREY (#828b94 / #5d6670, default), CIPHER BLUE (#d8e0e8 /
    #1e5ce6, A or S rank), MIDNIGHT STEALTH (#1c2026 / #323944, 1 BRIDGE
    THREAD or 3 GUNS KILLS in one sortie, also awarded on a failed run),
    CRIMSON VULTURE (#18181c / #cc2233, defeat the PHASE 3 Ace).
  - `applyF15Livery(id)` (also `window.applyF15Livery`): the 15 `body*`
    materials (fuselage, wings, tails and the articulated Ctrl_* /
    Intake_Ramp_* surfaces sharing them; 60 meshes) keep their camo atlas as
    neutral luminance detail via an `onBeforeCompile` map_fragment patch (ref
    = median painted-texel luminance), paint = vertex colours: body colour,
    trim on a model-space mask (outer wing panels, fin tops, stabilator tips,
    intake lips; 4.8 % of vertices). Paint is exposure-matched (x0.66) to the
    lighting tuned for the original atlas. Roughness per scheme, metalness
    kept; canopy glass, cockpit, nozzles, lights, pylon stores untouched; hinge
    fairings take shadowed trim. Applied after the bandit fleet clones its
    materials, so bandits keep their own paint.
  - Briefing: hangar row with PILOT RECORD (best rank, high score, total
    kills, wings severed, sorties cleared) and AIRFRAME LIVERY cards (two-tone
    swatch, `[ EQUIPPED ]`, lock icon + short unlock rule, full rule in the
    tooltip / aria-label). Compact layout for viewports <= 900 px tall so the
    whole briefing incl. LAUNCH fits 1280x720 without scrolling.
  - Debrief overlay: SORTIE CLEARED / FAILED (+ reason), diamond rank badge,
    NEW HIGH SCORE / NEW BEST RANK / rank-cap flags, score / kills / guns
    kills / wings / bridges / peak combo / ace / time, glowing
    `[ LIVERY UNLOCKED: NAME ]` banners, `[ BRIEFING ]` `[ REPLAY SORTIE ]`
    `[ EQUIP & FLY AGAIN ]` (Enter = primary, B = briefing).
  - Debug: `?debrief=CLEARED|FAILED[,score]`, `__az.profile`, `__az.livery`,
    `__az.endSortie`; `?nointro` now starts a tracked sortie.
  - Verified in the pane: briefing at 1280x720 / 1920x1080 / 375x812 with no
    horizontal overflow (desktop sizes fit without scrolling); all four
    liveries visibly repaint the jet in the menu orbit and chase view (and
    0.9 % of the cockpit frame: the intakes / wing roots at the lower
    corners); a CLEARED sortie through the real sortie watcher (92,000, 3 guns
    kills, bridge, Ace) -> S rank, NEW HIGH SCORE / NEW BEST RANK, three
    unlock banners -> EQUIP & FLY AGAIN restarts with CRIMSON VULTURE saved;
    a FAILED (ejected) 60,000 run -> rank capped at B, MIDNIGHT STEALTH
    unlocked, CIPHER BLUE still locked; selection + record survive a reload;
    zero page console errors (headless debrief, wingtest, cockpit, menu).
- [x] **Landing gear (G), dorsal speedbrake (B), ILS RWY 36, touchdown, ground roll, runway pit stop**
  *(build `s34a`, new `src/gear.js`; flight model in `index.html`)*
  - Gear: procedural tricycle gear (the asset's struts were stripped):
    nose + two mains with oleo, torque links, drag brace, tyres / hubs, bay
    doors + wells; all retract FORWARD over 1.6 s (doors first, hydraulic
    whine, lock clunk). Tyre contacts at y = -2.90 (`GEAR_H`), so the jet sits
    level. Drag factors scaled to the F-15's ~0.05 cruise CD: gear dCD
    +0.0175 (x0.35), speedbrake +0.045 (x0.9). `[ GEAR OVERSPEED ]` banner +
    master caution above 280 kt with gear out.
  - Keys: G = gear (flares moved to X only); B = speedbrake, tap toggles a
    latch, hold (> 0.35 s) is momentary; S still deploys it as before.
    Ctrl_Speedbrake now opens to 48 deg; speedbrake / gear wind and tyre roll
    feed the buffet rumble layer.
  - Landing configuration: with gear down the true stall moves from
    160 / 180 kt (in / out) to 118 / 132 kt and the stall cue to < 125 kt,
    so the 145-175 kt approach is flyable (before, the approach band stalled).
  - Cockpit: LDG GR lever follows the command (up / down), its red knob
    lights while any unit is in transit, NOSE / LEFT / RIGHT greens as each
    unit locks down. HUD stores list: GEAR DOWN / TRANSIT / WOW, S/BRK deg.
  - ILS: ARCHIPELAGO AFB's runway is 18/36 along world Z (x 900, z -1400 ..
    1600, elev 10 m, approach lights south of the 1600 end), so the ILS is
    `[ ILS LOCK // RWY 36 ]` (the brief said RWY 09). Active with gear down or
    inside 5.5 km / 2,500 ft AGL heading within 60 deg of 360: LOC (+/-2.5
    deg full scale) and 3 deg GS (+/-0.7 deg) needles, LOC / GS / NM readout,
    synthetic runway outline. AoA E-bracket beside the FPV with gear down:
    on-speed 13 deg +/-2.3 (~145-175 kt), SLOW / ON SPD / FAST. No PULL UP /
    "watch that altitude" nag with gear down.
  - Touchdown: lowest tyre contact on the strip with gear > 0.9, |bank| < 18,
    < 205 kt, sink better than -9.5 m/s, pitch -4..17 -> ON_GROUND (tyre
    screech + oleo thump, twin white smoke puffs, TOUCHDOWN call); otherwise
    (gear up / in transit, banked, slammed, off the strip) = crash.
  - ON_GROUND: nose-wheel steering on A/D, rolling friction, wheel brakes on
    S / B (speedbrake deploys with them), rotation above 120 kt, lift-off
    above 155 kt once lift reaches the weight; leaving the paved airfield or
    hitting a hangar = crash.
  - Pit stop: < 25 kt -> 4 s `[ REARMING & REPAIRING... ]` bar, loader
    clacks, AWACS "Welcome home, Eagle. Fresh missiles and fuel—get back up
    there!"; then DMG 0 %, engine fire out / both engines, MSL / 4AAM / UGB /
    GUN / FLR full, gun heat 0, fuel full (`combatSys.pitStop()`; combo and
    score untouched). Rolling above 30 kt first aborts it.
  - Fix: the `?debrief` hook (s33b) had split the `?nointro` if/else, so
    `?nointro` loads also showed the briefing over the flight. Restored.
  - Debug: `?onrwy[=z]` (stopped on RWY 36, gear down), `?gear`;
    `__az.toggleGear()`, `__az.placeOnRunway(z)`, `__az.landingGear`.
  - Verified in the pane: AB takeoff from rest -> rotate 141 kt, lift-off 180
    kt after 402 m, gear up in 1.62 s; level 250 kt idle decel clean 3.2 /
    gear 3.9 / brake 5.0 / both 5.7 kt/s; scripted ILS approach from 3.5 km
    held the 3 deg path at 165 kt / AoA 11.7 deg, flare, touchdown 152 kt at
    -0.35 m/s -> ON_GROUND; braked to a stop in 640 m / ~16 s, pit stop
    restored 40 % -> 100 % and all stores in 4 s, then took off again; hard
    sink (-12.7 m/s), gear-up, 30 deg bank and off-runway touchdowns crash
    with the right reason; cockpit lamps 3 greens / handle 0.55 down, red
    handle light + 0 greens in transit; ILS cross / tag / E-bracket rendered
    in chase and on the cockpit combiner; briefing still fits 1280x720; zero
    page console errors (headless onrwy pit stop, approach, lowpatrol,
    cockpit, menu).
- [x] **Architectural 3-tier cloud system** *(build `s35c`, `src/vfx.js` cloud section, `src/atmosphere.js`, `src/audio.js`)*
  - Replaces the 112 scattered formations. One instanced mesh (one draw call,
    ~7,100 puffs, back-to-front sorted 5x / s) from a 512 px 2x2 procedural
    atlas (multi-octave value-noise x feathered falloff: cauliflower, wind-
    streaked stratus, soft mist, dense base; no hard edges, no image files).
  - TIER 1 overcast ceiling 8,500-11,500 ft: three horizontal stratus sheets
    per cell on a 1.15 km grid over a 21 km disc, laid on a streaked noise
    field with natural breaks. Coverage sets the break threshold: CLEAR 28 %,
    SCATTERED 72 %, OVERCAST / STORM 91 % solid (measured). Above 11,500 ft
    the scene haze thins 55 % for a crisp sky over the cloud tops.
  - TIER 2 22 cumulonimbus pillars (Poisson-spaced, >= 1.1 km corridors,
    measured min 1.2 km; airbase approach kept clear): 900-1,770 m wide,
    1,300-2,460 m tall, bases 2,000-2,900 ft, built from 3-5 sub-columns
    (broad dark base skirt, stepped bulges, sunlit crown) with sheared anvils
    on the tallest; CLEAR shows ~60 %, SCATTERED ~85 %, overcast all.
  - TIER 3 42 sea-mist / valley-haze ribbons at 120-650 ft over the straits,
    shoreline cliffs and the canyon floor (visual only, never inCloud).
  - Shading: per-puff height in its tower mixes the time-of-day preset belly
    -> top colours, pushed to a storm palette on pillars (daylight #262e35
    slate bellies -> #cbc6b8 silver-beige crowns, scaled for every preset),
    thin edges lighter, backlit silver rim toward the sun; clouds take 45 % of
    the scene fog so distant towers still read.
  - Zero-pop proximity fade: every fragment fades 160 -> 35 m from the eye
    (billboards and sheets); the mist factor ramps the FogExp2 up to ~29x
    inside, plunges in ~0.2 s, clears over ~0.8 s on exit.
  - Fix found on the way: the horizontal sheets face down after the XY -> XZ
    mapping, so the material is DoubleSide (otherwise the deck vanished from
    above).
  - Gameplay: cloudDensity() = pillar sub-column ellipsoids + anvils + the
    ceiling slab x break field (wind-drifted) -> inCloud > 0.35 breaks bandit
    seeker locks; canopy moisture / white-out unchanged consumers; in-cloud
    wind rush now louder and brighter with airspeed.
  - API kept: cloudDensity, mist, setCloudCoverage, setCloudColors,
    setCloudGain, setCloudFlash, cloudLayers (low = mist ribbons, mid =
    pillars, high = ceiling cells), reseedClouds, placeDebugCloud; new
    `vfx.cloudTowers` debug layout.
  - Verified in the pane: 4,000 ft among the pillars (dark bellies, light
    crowns, corridors); straight fly-through of a pillar at 430 kt (inCloud at
    the edge, mist 1.0, fog x29, no frame-to-frame centre-luminance jump > 8
    during the pass, exit clears in ~0.8 s); 400 ft over the straits (white
    mist banks); 12,000 ft above OVERCAST (solid cloud-top sea, crowns poking
    through, crisp sky); bandit full-lock AIM shot at a player inside a pillar
    -> CLOUD COVER // MISSILE LOST, no damage; 69-80 fps in the pane; zero page
    console errors (headless 400 / 4,000 / 12,000 ft, cockpit, menu).
- [x] **AI disengage below 350 ft and during landing / rearming** *(build `s36a`, `src/combat.js`)*
  - `combat.playerSafe` (playerSafeFromAI) every frame: LOW-ALT below 350 ft
    AGL (re-armed only above 450 ft, no flicker), or BASE: gear down below
    1,000 ft AGL within 4.5 km of the runway centreline (z0..z1, so a 3 deg
    final from 4.2 km out qualifies), or ON_GROUND / rearming.
  - Onset: bandit locks + bursts zeroed, enemy tracers in flight cleared,
    missile warning cleared; while safe the RWR scope, banditLock and
    incoming count read 0, no bandit fires (no ENGAGE), and every bandit
    missile aimed at the player loses track in ground clutter and fuzes out
    1.0 s later (`GROUND CLUTTER // MISSILE LOST`). There are no SAM / flak
    shooters in the game (ground targets are passive), so nothing else to stop.
  - New DISENGAGE_ORBIT state (TAC code `O`): bandits climb above 2,200 ft
    (orbit 900 m / 2,950 ft, terrain + 450 m minimum), 4 G max, and circle
    3.2 km from the player; when the safe state ends they drop to PATROL and
    re-engage on the next frame. Defensive states still react to player shots.
  - HUD: emerald `[ LOW-ALT CLUTTER // NO LOCK ]` / `[ BASE SAFE ZONE //
    CLEAR TO LAND ]` tag under the radio box. AWACS once per gear-down
    approach (25 s cooldown): "Base air defenses covering your final, Eagle.
    Bandits are breaking off—cleared to land."
  - Verified in the pane: locked bandit + full-lock missile at 600 ft, descend
    -> safe at 348 ft: lock / incoming / RWR / warning 0 that frame, missile
    LOST 1.0 s later, no damage; all six bandits DISENGAGE_ORBIT at 2,953 ft,
    >= 2.5 km away; gear down 4.2 km out at 764 ft -> BASE immediately, AWACS
    call, landed with 0 damage, rearm done with the nearest bandit 2.9 km
    away; take-off, gear up, past 453 ft -> safe clears and bandits re-engage
    the same frame; headless: on-runway all `O` + pit stop, merge at altitude
    still engages, zero page console errors.
- [x] **A / D micro-adjustment fix: no double-tap roll, ramped rudder, stop-damping** *(build `s37a`, `index.html`)*
  - Removed the double-tap AA / DD barrel-roll trigger (`lastTap`, < 300 ms)
    from the keydown handler; Q is the only barrel-roll key (keybind matrix
    updated). Note: A / D are the rudder in this game; rolling is the mouse.
  - `rudderInput(dt)`: keyboard rudder ramps from 25 % on a tap to 100 % after
    0.22 s of hold (smoothstep), used in the air and for nose-wheel steering.
  - Stop-damping: with the rudder released the yaw rate converges 2.5x faster;
    with no roll stick and no rudder the roll rate converges 1.8x faster.
  - Dihedral (roll due to sideslip) cut to 30 % while |rudder| < 0.5, so
    flat nose nudges no longer bank the wings; full with a held rudder.
  - Verified with real keydown / keyup events in the pane: before, a 150 ms
    double-tap fired a full barrel roll (bank swing up to ~250 deg); after,
    double-tap A,A / D,D = no roll, 0.0 deg bank, 0.2 deg nose nudge, rotation
    stopped 50 ms after release; 80 ms tap = 0.09 deg nudge, stopped in 84 ms;
    1 s hold = 6.6 deg nose yaw, 1.6 deg bank, nose eases back toward the
    flight path after release (weathercock, no overshoot past centre); Q still
    rolls; taxi tap 0.7 deg vs 1 s hold 21.8 deg of nose-wheel steering; zero
    page console errors (headless flight, runway, cockpit, menu).
- [x] **Hybrid volumetric clouds: raymarched sky deck + volumetric-lit cumulus banks** *(build `s38a`, `src/vfx.js` cloud section, `src/atmosphere.js`, `index.html`)*
  - Replaces the s35c pillars / anvils / striped ceiling slab (no vertical
    columns or flat ceiling remain).
  - Noise: 256^2 tileable RGB DataTexture (value FBM, inverted 2-octave
    Worley, high-frequency FBM) with mips; pseudo-3-D noise = two hashed 2-D
    slices with a variance-preserving blend (a plain lerp drew contour bands).
  - Sky deck 9,000-13,000 ft: camera-centred BackSide dome raymarched in GLSL
    (32 geometric steps growing 12 % from ~25 m, interleaved-gradient dither,
    distance-based `textureLod`), cauliflower Perlin-Worley density with a
    height-rising threshold, Beer-Lambert extinction, jittered sun light-march,
    Henyey-Greenstein forward + back lobes (silver / golden rims), belly->top
    ambient, aerial-perspective fog blend and a 26-38 km far fade (no hard
    horizon), `gl_FragDepth` written for the log depth buffer. Coverage from
    the weather (CLEAR 0.48 / SCATTERED 0.31 / OVERCAST 0.20 threshold).
  - 16 cumulus banks at 1,800-7,500 ft, 1.8-3.6 km wide, 350-850 m tall,
    Poisson-spaced with >= 700 m corridors and the airbase approach kept
    clear; 25-45 puffs each (flat-based layer + cauliflower lumps). Puff
    ShaderMaterial: Worley-FBM atlas alpha, fake spherical normal, height-in-
    bank shading (blue-grey bellies), sky bounce, HG silver lining, partial
    fog, 40-180 m near fade.
  - Atmosphere drives both: `setCloudColors(top, belly, sunColour, k)` from
    the time-of-day preset (DAWN..NIGHT + overcast darkening); the live sun
    vector is shared.
  - Gameplay: `cloudDensity()` = rotated bank ellipsoids + a JS twin of the
    deck density, so lock-breaking, canopy moisture and in-cloud fog (x29 at
    full mist) work in both layers; API (`cloudLayers`, `setCloudGain/Flash`,
    `placeDebugCloud`, coverage) kept.
  - Verified in the pane: 4,000 ft toward / away from the sun (silver-edged
    banks, blue-grey undersides, seamless horizon), fly-through of a bank
    (inCloud 6.2-15.0 s, no luminance pops), above the overcast deck at
    14,000 ft (cauliflower tops, no stripes / contour bands), golden hour
    warm backlighting; 88-107 fps; zero shader / page console errors headless
    (day, dusk overcast, night cockpit, menu).
- [x] **Free Look: cockpit head-track + chase orbit (hold Alt / MMB)** *(build `s39a`, new `src/freelook.js`, `src/cockpit3d.js`, `src/hud.js`, `index.html`)*
  - Hold Alt or the middle mouse button (both `preventDefault`ed: no menu-bar
    focus, no middle-click autoscroll; Alt+letter browser shortcuts blocked,
    flight keys read by physical code while Alt is down) and move the mouse.
  - The mouse stick is frozen while looking; W / S / A / D / Shift / weapons /
    flares stay live. The pointer is locked while looking where the browser
    allows it, so the stick is exactly where it was on release; without the
    lock the stick eases to the cursor over 0.25 s instead of jumping.
  - Release springs the view home in ~0.25 s (exponential, 95 %), the short
    way round; re-grabbing mid-return continues from the current view.
  - Cockpit: head yaw +/-150 deg, pitch -45..+85 deg, layered on the existing
    head-motion springs (roll lag, look-into-turn, G slump). Past ~90 deg the
    eye leans 12 cm toward the look side and 8 cm forward (ramped 70-130 deg)
    to clear the headrest. The combiner HUD stays bolted to the nose (it is
    projected from the 3D glass); target brackets, labels and off-screen
    arrows already project through the live camera, so bandits stay tagged
    through the side and top canopy.
  - Chase: rigid orbit about the jet at the current chase radius (360 deg yaw,
    -70..+75 deg pitch) in the camera's own frame, ground-clamped; the chase
    spring state is restored each frame so the orbit never disturbs it. The
    boresight reticle / SPEED / ALT boxes fade out by 30 deg of look offset.
  - `[ FREE LOOK ]` tag bottom-centre while held; `ALT / MMB — Free Look` in
    the briefing / H controls list. Debug: `?look=yaw,pitch&lookoff=s`,
    `window.__az.freeLook`, `look {...}` in the warp log.
  - Verified in the pane with dispatched Alt / MMB / mousemove / D events:
    stick held at 0.100 while the cursor moved 640 px; D rudder yawed the jet
    (r -0.136 rad/s) with Alt held, Alt+D `preventDefault`ed; yaw clamped 150,
    pitch clamped -45 / +85 (consoles, gauges and stick visible looking down;
    open sky overhead); left / right check-six with no seat / headrest clip;
    a bandit placed 100 deg left / 40 deg up bracketed at (390,143) vs its
    true projection (396,145); release 150 -> 7.5 deg in 0.25 s; chase orbit
    radius 26.2 -> 26.4 m at 140 deg, 340 deg orbit returns via -20 deg;
    headless cockpit / chase / release / menu runs with zero page errors.
- [x] **Vertical terrain, NW canyon, sea stacks, megastructures** *(build `s40a`, `src/world.js`, `src/combat.js`, `index.html`)*
  - Height grid 480 -> 600 segments (33 m) so cliffs stay sheer; render mesh,
    `heightAt` and every gameplay query still share it triangle-exactly.
  - Main island: basalt escarpments on the north / east coasts, jagged ridged-
    noise NE massif (peak ~810 m) and NW ridge (~520 m) clear of the runway,
    port town and harbour. Volcano gains a sea escarpment + lava-ridge creases
    (rim held near ~1 km). Atoll outer cliffs steeper.
  - NW canyon massif: 330-500 m ridged plateau; gorge walls measured 410-515 m,
    water floor 280-390 m (wider at the open mouths), striated ledge, rim
    crests. `canyonX` unchanged, `canyonHalf(z)` exported.
  - Rock palette by elevation + slope: charcoal basalt waterline (#252a2e),
    slate cliff faces (#3c4349), olive-slate uplands (#464e44), pale weathered
    summits (#73787a); muted scrub on gentle lowland, narrow grey sand strips.
  - RWY 18/36 approach funnels (3.6 km off both thresholds, widening 12 %):
    terrain capped at elev + 3 % of distance; measured terrain never above a
    3 deg glide path; sea stacks excluded from the funnels.
  - 15 basalt sea stacks (128-366 m) placed procedurally in straits / off
    coasts (clear of approaches, bridge spans, canyon mouths, wind farm, rigs):
    one InstancedMesh, columnar-jointed jagged geometry, tapered-cylinder
    collision.
  - Bridges rebuilt: deck road 124 m, girder underside 116 m (380 ft), 34 m
    deck, 240 m twin-leg towers banded red / white, top + mid-height blinking
    red beacons, piers, thicker main cables + hangers. Per-member collision
    (deck, each leg, each portal beam, pier) so the under-deck strait and the
    portal gap are open. BRIDGE THREAD reads `bridges[i].under`.
  - 3 oil platforms in the sea lanes: 4-leg braced jacket, 90 m deck + upper
    deck + process modules, 64 m lattice derrick, cantilevered helipad (ring +
    H), pedestal crane, flare boom with a flickering additive gas-flare sprite
    and an orange flare light (mode 6); per-leg / deck / derrick collision.
  - Industrial port: 5 ship-to-shore container gantry cranes (62 m portal,
    105 m boom over the bay, A-frame + stays) and a 10-tank white fuel farm
    on the flat ground behind the quay (houses keep clear).
  - Airbase: 5 hardened aircraft shelters with taxi stubs, 2 geodesic radomes,
    tower-top sweeping radar bar, ALSF approach lights + sequenced strobes off
    BOTH thresholds, threshold bars at both ends; runway / approach lights use
    a new high-intensity mode (bright by day through overcast, 3.2 px minimum).
  - Draw calls: every repeated member (bridge bands, beams, rig lattice,
    cranes, tanks, shelters, piers) goes through 3 InstancedMeshes (box /
    cylinder / arch) + 1 for the stacks; collision gained tapered cylinders.
  - Verified headless: 105 ft / 515 kt under bridge A -> BRIDGE_THREAD awarded,
    no crash; canyon run at 390 ft between 400-500 m walls, no crash; sea-stack
    and oil-rig skims at ~145 ft, no crash; RWY 18 final view (open approach
    between the massifs); night overcast approach from ~10 km shows the
    approach strobe + bridge lights; zero page console errors. Pane render
    4-5 ms / frame, ~445 draw calls, ~1 M triangles; world build ~1.7-1.9 s.
  - Note: the runway is 18/36 (north-south); both of its finals are protected
    (the brief's "RWY 09" maps to it).
- [x] **Specular ocean, seamless horizon, colour discipline** *(build `s41a`, `index.html` ocean + nav lights, `src/atmosphere.js`)*
  - Ocean: 116 km plane re-centred under the camera on a 1 km grid every frame
    (`followOcean()`); all shading in world XZ, so snapping never swims.
  - Waves: 4 analytic directional deep-water octaves (210 / 118 / 61 / 29 m,
    dispersion w = sqrt(g k)) + a 3.2 km swell-pattern octave + 3 detail
    normal-map octaves and a micro-ripple octave for 100 ft skims. Each octave
    fades out with distance before it can alias (no moire at 4,000 ft).
  - Shading: deep slate-navy #13222e body, light through crests, Fresnel
    `pow(1 - N.V, 4)` blend into the sky reflection (reflected ray low =
    horizon haze, high = preset sky), GGX sun / moon specular whose roughness
    widens with distance into a glitter lane to the horizon + micro sparkle,
    subtle dark-teal (#24605c) shelves near coasts, muted sandbars, surf and
    whitecaps kept.
  - Horizon: sky lowest ~8 deg = the fog colour = the ocean's far colour (one
    THREE.Color); ocean dissolves via exp2 fog + a 30-52 km radial fade. No plane
    edge or seam from 150 ft to 25,000 ft (verified).
  - Aerial perspective: fog +15 % below 1,500 ft, thinning from ~8,500 ft to
    55 % by ~13,800 ft (replaces the deck-top-only thinning).
  - Colour discipline: horizon haze 22 %, mid sky 18 %, zenith 12 %, ocean sky
    reflection 20 % desaturated at runtime across all presets / weather
    (ACES tone mapping and per-preset exposure unchanged).
  - Tail strobes: fin-tip sprites 3.0 -> 1.05 size and 35 % additive gain
    (~65 % smaller / dimmer); wingtip / belly strobes unchanged.
  - Verified headless: 150 ft golden hour into the sun and daylight away from
    it, 4,000 ft day, 12,000 ft (inside the cloud-deck band), 25,000 ft,
    overcast 4,000 ft, night 1,000 ft (moon glitter path, small fin strobes);
    zero page / shader errors.
- [x] **Bubble canopy glass, sliding raindrops, canopy rain SFX** *(build `s42a`, new `src/canopyglass.js`, `src/weather.js`, `src/canopy.js`, `src/audio.js`, `index.html`)*
  - Rain clipping: in the cockpit any exterior rain streak whose segment passes
    within 2.8 m of the eye is culled (closest-approach test per streak); the
    canopy glass draws after the rain (renderOrder 5 vs 3), opaque cockpit
    parts depth-occlude it. Verified nearest visible streak 3.9 m at 500 kt.
  - 3D bubble canopy (cockpit rig frame): parametric superellipse shell from the
    nose coaming up over the bow and back past the seat, closing on the rails,
    with dark rubber / metal seals along rails, coaming and rear edge.
  - Glass ShaderMaterial (premultiplied alpha, depthWrite off): crisp + broad
    GGX sun glare arcs on the curved normals, milky forward scatter toward the
    sun, reflected horizon-haze band + sky zenith band sweeping over the arch,
    cool Fresnel sheen pow(1 - |N.V|, 3.2) hugging rails / coaming (forward
    sightline clear), procedural micro-scratches lit only inside the glare,
    faint emerald HUD bounce under the combiner; dimmed under NVG.
  - Water: glass coordinates run from the nose coaming up and back over the
    arch (arc length in metres). Two flow-scrolled droplet layers (impact pop,
    lensed sky, dark refraction rim, sun glint, wet trails) + cloud mist
    streaks. Slide speed integrates airspeed: slow beads below ~120 kt, 9 m/s
    streaks stretched up to 6.5x at dogfight speed; roll rate throws water
    sideways. Moisture ramps when inCloud > 0.3, evaporates in ~2.5 s.
  - 2D canopy overlay no longer paints drops in the cockpit (keeps the film);
    chase-view mist streaks unchanged.
  - Exterior canopy (chase): MeshPhysicalMaterial smoked acrylic, clearcoat,
    gold-tinted specular, light iridescence, env reflection, Fresnel rim that
    turns the glass bright / near-opaque at grazing angles.
  - Canopy rain audio bus (bypasses the cockpit low-pass): Poisson-scheduled
    4-12 ms resonant band-pass taps at 2.0-5.2 kHz (rate by moisture + speed)
    blending past 220 kt into a high-velocity wash (band-pass 1.5 -> 4.4 kHz);
    active with rain > 0 or cloud > 0.35; full in cockpit, -65 % in chase.
    `__audioDebug().canopyRain` = { bus, tapBus, hiss, hissHz, rate, taps }.
  - Debug: `?noglass` hides the glass (A/B); warp log `canopy {...}` adds glass
    stats, culled streaks, nearest visible streak and the audio bus.
  - Verified headless: clear golden hour / day cockpit (glare + reflections),
    free-look side view, chase exterior canopy, OVERCAST // RAIN cockpit at
    500 kt (stretched streaks) and 110 kt (round beads); pane: audio running,
    bus 0.84 cockpit / ramping to 0.35 chase, taps ~100/s, wash 3.4 kHz at
    500 kt; zero page / shader errors.
- [x] **Zero-freeze view / NVG toggles + cockpit texture throttling** *(build `s43a`, `index.html`, `src/cockpit3d.js`, `src/nvg.js`, `src/canopyglass.js`)*
  - Root cause measured (pane, real GPU): the first cockpit switch froze 8.6 s
    and the first NVG toggle 5.4 s -- shader programs compiled on demand (the
    cockpit turns on the sun shadow map + airframe clipping planes; the NVG
    half-float target uses separate tone-mapping variants).
  - GPU warm-up before flight: all view x NVG states, walked in both toggle
    orders through the real `setView` / `setNVG` (rain streaks and canopy glass
    forced visible): `renderer.compileAsync` per state while the briefing shows
    "PREPARING COCKPIT SYSTEMS..." (KHR_parallel_shader_compile), then one
    synchronous render of each state (shadow depth programs, clip variants,
    render-target / atlas allocation); LAUNCH unlocks after it (timer-driven,
    12 s safety cap; `?nointro` warms synchronously at load).
  - Cockpit textures: dial faces (bands, ticks, numerals, titles) cached once;
    a round-robin scheduler repaints at most 2 dials per frame and only when a
    quantised needle / window signature changed; the 3 CRTs repaint one per
    frame (~20 Hz each) at 384 px; every repaint is copied into its atlas cell
    with texSubImage2D (`renderer.copyTextureToTexture`) instead of re-uploading
    a 1024^2 atlas; nothing paints in chase view (rig inactive).
  - Renderer pixel ratio capped at 1.5; canopy glass skips all droplet math
    unless rain > 0.01 or moisture > 0.05; chase-camera / cockpit-eye / audio
    per-frame `new Vector3` / `clone()` replaced by scratch vectors.
  - NVG toggle audited: no traversals, material swaps, light or render-target
    creation (targets pre-allocated; the toggle flips flags, colours and light
    intensities only).
  - Draw calls: the cockpit adds only ~20 (already instanced / atlas-shared),
    so no geometry merge was needed.
  - Benchmark (`window.__frame()` = one GPU-finished frame; pane, 1280x720,
    OVERCAST // RAIN), after LAUNCH from the briefing: 6 view toggles 9-38 ms,
    12 NVG toggles (chase + cockpit) 9-22 ms, max toggle frame 37.5 ms, zero new
    shader programs after warm-up (258 -> 258); cockpit median 9.8 ms vs chase
    8.6 ms (was 14.4 ms with 29 ms spikes); briefing warm-up 1.6 s async + 1.6 s
    sync. Headless: live gauges / CRTs, NVG phosphor, zero page errors.
- [x] **4 tactical zones, carrier task force, terrain masking** *(build `s44a`, `src/world.js`, `src/combat.js`, `src/radio.js`, `src/hud.js`, `index.html`)*
  - Sectors (`world.sectorAt`): SEC-01 ARCHIPELAGO AFB (main island + base
    perimeter), SEC-02 BRIDGE STRAIT (strait band under both bridges), SEC-03
    NW BASALT CANYON (canyon massif + stacks), SEC-04 OPEN SEA FLEET (open
    ocean). Live `SEC-0n // NAME` badge above the radar (brightens 2.5 s on
    change) + AWACS line on entering each sector.
  - Naval task force (SEC-04, SW lane): 1 CVN (angled deck, markings,
    elevators, island + turning radar, parked jets, 4 CIWS, 2 SAM launchers)
    + 3 DDG escorts on a racetrack in formation at ~25 kt; hulls merged per
    material; per-ship wake shader (Kelvin arms, bow crest, hull foam,
    widening turbulent stern wake fixed to the water). Ships are surface
    targets (UGB / gun) AND radar / seeker targets (MSL / 4AAM TGT boxes):
    CVN 420 HP, DDG 170 HP, missile 90, Mk-82 up to 180; smoke < 66 %, deck
    fires < 33 %, secondary magazine explosions + listing / settling when
    sunk (CVN 6,000 pts, DDG 2,500). Defences: CIWS tracer streams < 2.4 km,
    AAA flak bursts < 4.8 km, shipborne SAMs < 7.5 km (<= 2 in the air), ship
    radars on the RWR; weapons-tight outside PHASE 2 unless attacked, locked
    or overflown < 3 km (the lane is near the player spawn).
  - SEC-02: SAM sites placed on strait ground (now launch at the player
    > 850 ft, 8 km, line of sight) + 4 coastal flak nests on the bridge
    headlands (40 HP targets). SEC-01: friendly base CIWS (2) + SAM engaging
    bandits / bombers over the field (base kills, no player credit).
  - Terrain masking (`world.isTerrainOccluded`, 10 height samples): bandit
    radar locks drop to 0 the instant a ridge / canyon wall blocks line of
    sight (sampled every 0.15 s); bandit / SAM missiles tracking us lose
    guidance and fly on ballistic into the wall; `[ TERRAIN MASKING // LOCK
    BROKEN ]` banner, event, lock-drop tone, AWACS call. Ship / site fire
    also needs line of sight.
  - Zone-anchored phases: PHASE 1 fighter sweep patrolling over the Bridge
    Strait; PHASE 2 four escorts on high CAP over the task force + two Su-34
    strike bombers (1.35x airframe, 2 missile hits, no dogfighting) running at
    the AFB -- a bomber reaching the field drops a 7-bomb stick (-800, AWACS)
    and egresses; PHASE 2 only ends once the task force is sunk; PHASE 3 Ace
    renamed SOL-1 "CRIMSON VULTURE", spawning with two escorts over the canyon.
  - AWACS: sector entry, fleet spotted / hit / ship sunk / fleet sunk / still
    afloat, bombers inbound, base hit, base SAMs, terrain masking.
  - Debug: `at=fleet`, `phase=1|2|3`, `sinkat=s[,i]`, `maskshot=s`, warp log
    `fleet [...]`, stats `zone {...}`, `combatSys.spawnPhase / hitShip / fleetStats`.
  - Verified (pane + headless): sector readout SEC-01 -> 02 -> 03 -> 04;
    fleet steaming with wakes, CIWS / flak / SAM on an attack run; carrier
    sunk -> fires, secondaries, listing, wake fading; deep-canyon bandit shot
    -> `B-FULL:TERRAIN`, missile into the wall at 1.2 s, banner + AWACS; the
    same shot over open sea hits; a full lock drops to 0 behind the wall;
    bomber run -> base hit; PHASE 2 held until the fleet sank, then SOL-1
    over SEC-03; fleet-area frame 7.4-7.8 ms median (pane); zero page errors
    (cockpit rain, night fleet, Ace canyon, menu).
- [x] **Single-engine fire, Halon extinguisher, slim-chance windmill relight** *(build `s45a`, `src/combat.js`, `index.html`, `src/hud.js`, `src/cockpit3d.js`, `src/audio.js`, `src/radio.js`)*
  - Per-engine state `C.engL / C.engR`: HEALTHY | ON_FIRE | EXTINGUISHED |
    RELIGHTING | SEIZED (replaces the old 60 % flameout / 85 % fire). Legacy
    `engineOut` / `engineFire` are derived, so thrust, dead plume, gauges and
    lamps follow the state.
  - Ignition: DMG crossing 45 % (re-arms below 40 %) or a 35 % chance on a
    direct missile hit with both engines healthy. ON_FIRE: thrust capped at
    58 %, roll-off 0.06 + asymmetric-thrust yaw toward the dead side (stick
    holds it), fire spreads +2.2 % DMG/s, airframe explodes at 16 s
    (`ENGINE FIRE — AIRFRAME EXPLODED` debrief reason).
  - F is context-sensitive: Vulcan normally; during an engine emergency F press
    = Halon bottle (white vapour burst, pneumatic discharge SFX, AWACS),
    ON_FIRE -> EXTINGUISHED, spread stops. Hold F 2.5 s (fresh press, one
    attempt) = windmill relight: starter whine + accelerating igniter clicks,
    white fuel vapour, N2 28 %; releasing early aborts without spending it.
    Odds 5 % < 220 kt, 20 % at 220 kt rising to 38 % at 350+ kt. Success ->
    HEALTHY, DMG -20 %, relight boom + flame tongue, AWACS; failure -> SEIZED
    (compressor-stall bangs), single-engine ops until the AFB pit stop
    (pit stop / respawn restore both engines). LMB always fires the gun.
  - VFX: ON_FIRE thick black smoke + jagged orange flame from the damaged
    nozzle only; EXTINGUISHED / SEIZED thin grey wisps; RELIGHTING white vapour.
  - Cockpit: L / R ENG FIRE lamp flashes + master caution; RPM spools toward
    0 % (28 % while cranking), TEMP spikes into the red then cools.
  - HUD (center-lower): `[ L/R ENGINE FIRE — PRESS F TO EXTINGUISH ]` + time
    to airframe loss; `[ ENGINE COLD — HOLD F FOR WINDMILL RELIGHT (SLIM
    ODDS) ]` with live ram-air odds and a 0-100 % spool bar; then `[ ENGINE
    RELIT! ]` / `[ RELIGHT FAILED — SINGLE ENGINE OPS ]` for 3.5 s; stores
    row `L ENG FIRE / COLD / CRANK / SEIZED`. Fire bell every 3.2 s on fire.
  - Debug: `engfire=s[,L|R]`, `extat=s`, `relightat=s` (holds 2.7 s),
    `relight=ok|fail`; stats `eng {...}`; `combatSys.debugEngineFire /
    setRelightForce / fireKey`.
  - Verified (pane): 2.2 %/s spread, roll drift 0.063 rad/s, F press ->
    EXTINGUISHED (holding through does not crank), spread stops, forced fail
    -> SEIZED, pit stop -> both HEALTHY, early release aborts (attempt kept),
    forced success -> HEALTHY with DMG 45 -> 25 %, keyboard F extinguishes
    without firing the gun (gun again once healthy), DMG crossing 45 %
    ignites, unattended fire -> airframe lost at exactly 16.0 s; odds 38 % at
    389 kt. Headless: chase fire trail, cockpit prompt + lamps, crank bar,
    SEIZED / relit runs, zero page errors.
- [x] **Visual Pass 1: selective HDR bloom, glowing cannon tracers, incandescent afterburner** *(build `s46a`, `src/nvg.js`, `src/combat.js`, `src/vfx.js`, `src/cockpit3d.js`, `index.html`)*
  - Bloom pipeline (`src/nvg.js`, normal vision): EffectComposer (three r160
    addons from the same import map) into a half-float MSAA x4 target ->
    RenderPass -> UnrealBloomPass at half resolution (threshold 0.92,
    strength 0.48, radius 0.32) -> OutputPass (ACES Filmic + sRGB, once).
    Materials render linear HDR (no per-material tone mapping), so only
    emissives > 1 bloom. NVG keeps its own tube composite. Resize updates the
    composer and the half-res bloom chain. HUD / overlays are 2D canvases above
    WebGL (never blurred). `?nobloom` A/B switch.
  - Side effect handled: transparent layers now blend in linear space; the
    gauge glass sheen (0.07 -> 0.022) was retuned so black dial faces stay
    black (measured dial-area luminance 32 vs 34 before).
  - Cannon tracers: luminous tapered bolts 14-22 m long (with closure speed,
    growing out of the muzzle) along the velocity, white-hot nose -> amber
    tail, additive, HDR colours player (2.6, 2.0, 1.15) / enemy + CIWS (2.4,
    0.95, 0.45) / base CIWS; one InstancedMesh per stream with a pre-allocated
    round pool (no per-shot / per-frame allocation); width >= ~3 px at range.
  - Muzzle flash: HDR (2.8, 2.1, 1.2) star sprite + a streak laid along the
    projected bore, re-rolled rotation / scale, 40 ms pulse per firing frame,
    starboard wing-root port.
  - Afterburner: incandescent radial core disc inside each nozzle: muted
    orange <= (0.75, 0.30, 0.08) scaled by throttle with the burner off (no
    glare), ramping with afterburner to HDR (2.5, 1.65, 1.05) with a 23 / 31 Hz
    +/-8 % shimmer; outer cone peach at the lip -> deep orange-red tip, HDR lip
    and shock diamonds only in AB (dry shock-diamond intensity reduced so 50 %
    throttle does not bloom). A damaged engine's whole plume group (cone, core,
    disc, light) stays dark.
  - Warm-up: every frame now renders into a half-float target, so the program
    set collapsed to ~100 and all of it is pre-built; warm-up also forces the
    muzzle flash + one bolt per tracer pool visible and paints all 16 dial
    faces.
  - Verified (pane, 1280x720): composer 1280x720 HalfFloat x4, bloom chain
    half-res; 24 view / NVG toggles while firing in AB: 4.4-15.6 ms, no new
    programs; frame ~6-8 ms; resize to 1000x640 -> composer 1000x640, bloom
    250x160, aspect updated. Headless: 50 % throttle no nozzle glare, sky /
    clouds unchanged; AB + gun: white-hot cores, glowing bolts converging
    ahead, muzzle starburst; night AB; NVG; menu; zero page / shader errors.
- [x] **Visual Pass 2: world-space wingtip / LEX vapor ribbons + airspeed / AoA wind-rush audio** *(build `s47a`, `src/vfx.js`, `src/audio.js`, `index.html`)*
  - Ribbons (`Ribbon` in `src/vfx.js`, replaces the old object-per-sample
    `Trail`): 4 continuous strips (2 wingtip vortex cores, 2 LEX / wing-root
    sheets), each a 96-sample ring buffer in Float32 / Float64 arrays with
    pre-allocated `position` / `uv` / `aAlpha` DynamicDraw attributes and a
    static index; zero per-frame allocation. The live head rides the emitter;
    a sample is committed every >= 3.5 m or 16 ms. Edges extruded each frame
    along `cross(tangent, toCamera)` so the strip faces every camera (chase,
    cockpit, free-look orbit, padlock). Jump > 120 m between frames resets the
    buffer (respawn / teleport / restart never streaks); `clearTrails()` too.
  - Condensation level `vaporTarget` (attack 6 /s, decay 2.5 /s): > 2 G, |AoA|
    > 7.5 deg or |roll| > 1.2 rad/s above 160 kt; +40 % in humid air (overcast
    coverage, rain, in-cloud > 0.25); tapers 18-26k ft (dry air). Each sample
    keeps its birth level, so on level-off the ribbon detaches and dissipates
    behind the jet (~2.1 s, `pow(1-age,1.5)`), soft root at the tip, soft tail.
    Width 0.14 m at the tip -> 0.65 m diffused; cross-width alpha
    `pow(sin(uv.x*PI),1.6)`; colour #e8eef4 day / #bfc7cf overcast x the
    time-of-day vapor tint, clamped to RGB <= 0.85 (never blooms), fades out
    1.5-4.2 km from the camera.
  - LEX / root sheets: > 4.8 G or AoA > 14 deg below 14-20k ft; broad (0.7 ->
    2.4 m), streaky animated wisps, 0.75 s life. The existing over-wing puff
    sprites now trigger at the same 4.8 G / 14 deg thresholds.
  - Wind bus (`src/audio.js`, pre-allocated nodes, params only per frame):
    two decorrelated pink-noise loops -> band-pass Q 0.85 (220 Hz @ 150 kt ->
    1,150 Hz @ 650 kt) panned -/+0.65, gain 0.2 x clamp((kt-110)/520)^1.6 x
    view (chase 1.15, cockpit 0.8); buffet rumble band-pass 140-360 Hz Q 1.4
    swelling with G > 3.2 / |AoA| > 11 deg; bus low-pass 16 kHz chase / 1.8 kHz
    cockpit straight into the master. All via `setTargetAtTime(.., 0.06)`. Bus
    0 below 80 kt, when muted, out of FLY; `suspend()` (pause / debrief) drops
    it to 0 instantly so resume ramps in. `__audioDebug().wind` (targets +
    live params) and `__audioDebug().ribbons`.
  - Verified (pane): 181 kt level slip 0.0095 @ 278 Hz, no buffet; 510 kt 5.6 G
    slip 0.151 @ 890 Hz + buffet 0.142 @ 272 Hz; cockpit LP 1.8 kHz; paused /
    muted / 74 kt -> bus 0, resume ramps back. Level-off: vapor 0.66 -> 0.01
    over 2 s with the trail fading out; +4 km teleport -> buffer reset. Frame
    ~6-7 ms. Headless: smooth unkinked arcs from both tips (side orbit and
    chase), day / night / overcast, zero page errors.
- [x] **Visual Pass 3: `DAYLIGHT // CLOUD SEA` theatre preset + cohesive cumulus cloud sea** *(build `s48a`, `src/atmosphere.js`, `src/weather.js`, `src/vfx.js`, `index.html`)*
  - Theatre = atmosphere preset `CLOUD_SEA` + weather `CLOUD_SEA`, selected
    together: first entry of both `[ CYCLE TIME ]` (`CLOUD SEA`) and
    `[ CYCLE WEATHER ]` (`DAYLIGHT // CLOUD SEA`) and the opening default.
    Picking another weather leaves the theatre (time -> RANDOM) and vice
    versa; random rolls never pick it. All other presets unchanged.
    `?tod=CLOUD_SEA` / `?wx=CLOUD_SEA` (a pinned `?wx=` keeps its weather).
  - Lighting: exact (un-desaturated, `exact: 1`) cobalt zenith #2f5b8f ->
    azure #5180b3 -> pale mist #95b1cc; that same horizon colour is the
    lower dome, `FogExp2` and the ocean far fade (one shared Color). Fixed
    sun 48 deg el / az 332 (forward-left of the opening north heading), key
    #fff6e6 x 2.85, cool fill hemi #6f94bc / #2a343b x 1.05, ambient 0.2.
    Switching is uniforms / light values only.
  - Cloud sea: 34 pre-built (hidden until the theatre) broad cumulus decks in
    6 elongated fields, W 1.41-3.18 km, H 380-680 m, aspect 3.1-5.0, bases /
    tops 3,504-5,799 ft, overlapping but never stacked, 22-46 puffs each
    (flat 45 % base sheet + billowing crowns; card bottoms kept above the
    base so the air below 2,800 ft stays open). Three sky windows: ARCHIPELAGO
    AFB (r 2.6 km), Bridge Strait (bridge A, r 2.0 km), NW Canyon (r 2.3 km).
  - The raymarched deck drops to the same 3,500-5,800 ft band (uniforms
    `uDeckY`, broken-cumulus threshold 0.36, ~34 % coverage at mid-height)
    and fills it to the horizon with feathered holes at the three windows
    (`uWin[3]`), so the sea is continuous out to the haze; its JS density
    twin matches (inCloud, fog ramp, canopy moisture, missile lock break).
  - Shading: tops #e6ebf0, bellies #64778c shading to ~#4a5d73 in the bank
    shadow, HG silver rim toward the sun, existing 180 -> 40 m proximity
    fade; both cloud shaders now cap luminance at 0.86 in this theatre
    (`uCap`, 8 = off elsewhere) so tops never reach the 0.92 bloom threshold.
  - Verified (pane, 1280x720): seaStats 34 banks / aspect 3.08-4.96 / 3,504-
    5,799 ft / windows clear; fog exactly #95b1cc; 6,800 ft: continuous
    sunlit sea with breaks; 2,000 ft: bellies + blue breaks overhead; flying
    into a bank at 4,500 ft: mist 0.41 -> 0.99 over ~1 s, fog x23, CLOUD
    COVER // MISSILE LOST; frames 3-5 ms; cycling all 6 weathers and 7 times
    -> 99 programs before and after, 2.6-5.5 ms per switch.
- [x] **Visual Pass 4: procedural patchwork farmland terrain shader + instanced forest groves** *(build `s49a`, `src/world.js`)*
  - Terrain material (`onBeforeCompile` on the existing MeshStandardMaterial, so
    sun / hemisphere / fog are unchanged; mesh, heights and collision untouched):
    shore #3b3a34 below 14 m; raw striated rock #3c4349 -> #282d32 where
    normal.y < 0.78 (cliffs, sea stacks, NW canyon walls); pale stone #6b706c
    above 340 m; patchwork on 14-310 m gentle ground (normal.y >= 0.78).
  - Patchwork (`farmField`): 2.4 km Voronoi macro-regions, each with one of 4
    road axes (0 / 22 / -17 / 38 deg) and its own origin; 520 m columns split
    0.3-0.7, staggered 460 m rows split 0.3-0.7 -> 140-380 m plots. Palette
    olive pasture / wheat / meadow / plowed earth / fallow sage (x2.2 albedo
    lift + per-plot 0.8-1.2 tone jitter: under the cloud-sea key light the raw
    sRGB palette went to one near-black olive mass after ACES). 7 m plow furrows along each plot's axis
    faded by `fwidth` (gone before they can alias); 6 m hedgerows #26331f on
    plot edges and 5 m roads #5d5c57 on region borders, anti-aliased with
    fractional coverage when thinner than a pixel; plot colours average out
    7-16 km away. Masked off ARCHIPELAGO AFB (+450 m) and the port town.
    Weather / night tone comes from the existing lights and fog.
  - Forest: ONE InstancedMesh (+1 draw call), 2,705 conifers of 22 triangles
    (4-sided trunk + two hand-built 7-tri cones; THREE.ConeGeometry emitted
    degenerate tris), 77 noise-seeded groves (1,850 trees) + 855 hedgerow
    tree-line trees placed by `FARM.edge`, a float32 JS twin of the shader's
    plot maths. Rejected: < 16 m, > 290 m, slope > 0.42 (4 samples), airfield
    + 450 m and both 3.2 km approach funnels, town, bridges (260 m), within
    40 m of any collision box / 30 m of any cylinder. Trunks sunk 1.5 m;
    scale 0.78-1.45 (14-26 m), colours #243620 / #2d4226 / #354829 / #1f2e1c
    +/-10 %; scene fog plus a 6-9 km shrink into the ground (no pop).
    `world.treeStats`, `world.farmEdge`.
  - Verified (pane): 0 trees in the sea, on the airfield or off the ground
    (all 2,705 instance bases = heightAt - 1.5); +59.5k triangles; programs
    102 (warm-up still covers them). Headless (cloud sea): 600 ft AGL over
    the main island -> rotated varied plots, hedges, groves + tree lines;
    4,500 ft over the AFB window -> clean tarmac, bare rock cliffs, farmland
    hazing out, no moire; zero page / shader errors.
- [x] **Visual Pass 5: HDR impact fireballs, shockwave rings, arcing debris, hanging smoke** *(build `s50a`, new `src/blastfx.js`, `src/combat.js`, `src/audio.js`, `src/vfx.js`, `index.html`)*
  - `createBlastFX` (fixed circular pools, oldest recycled, one instanced draw
    per pool hidden while empty, zero per-frame allocation): 240 hanging smoke,
    512 trail puffs, 160 spray, 80 fireball, 48 flash / ring, 200 sparks,
    40 debris, 8 foam rings. `combat.explosion(pos, scale, { kind, vel })`
    routes every missile / 4AAM / UGB / gun-kill / ship / crash explosion and
    `splash()` into it (kind classified from height above the surface when
    omitted); the old point-sprite explosion remains only as a fallback.
  - Air: L1 HDR flash core (3.2, 2.5, 1.4) full for 0.10 s, under the 0.92
    threshold by 0.14 s, gone at 0.32 s + additive pressure ring 12 -> 90 m
    in 0.28 s (peak 0.55 x 0.66, never blooms); L2 4-6 noise fireballs 8 ->
    ~38 m, blackbody HDR (2.2, 1.05, 0.25) -> #ff5a12 -> #7a1c08 -> charcoal
    with sooty thin edges and per-puff heat jitter; L3 18-26 additive spark
    streaks (2.8, 1.7, 0.7) at 90-220 m/s, drag + gravity, e^-4.5t; L4 4-6
    dark tumbling chunks inheriting 55 % of the airframe velocity, ballistic,
    trailing ember -> charcoal puffs every 60 ms, splash / dust where they land.
  - Hanging smoke: 6-9 soot puffs (#1c2024 -> #343b42) 12 -> 45 m in 1.4 s,
    then drift with the live cloud wind (`vfx.wind`) and billow for 10-15 s,
    fade in 0.25 s / out over the last 35 %; sun-shaded (warm-grey crown,
    soot core, forward-scatter fringe toward the sun), luminance-capped at
    0.42 (never blooms), 45 -> 12 m proximity fade, scene fog.
  - Water: geyser column filled base -> apex (50-85 m), mist skirt, flat
    broken foam ring 6 -> 70 m at y = 0.4, small flash; no black puff.
    Ground / ship: flash + ring at the surface, fireballs reflected off the
    terrain normal, spark spray about the normal, 4 clods, two-tone 12 s
    column (lit earth-dust skirt + dark soot venting at 18-26 m/s).
  - Shake: detonations within 950 m add a decaying rotational impulse
    (0.35 + 0.4 x scale) x (1 - d/950)^1.6, ~2.2 deg at 150 m, 55 % in the
    cockpit, decay e^-7t (applied like the gun vibration, re-set each frame).
  - Audio: `explosion(intensity, delay)` = immediate warhead crack (white
    noise, band-pass 3,000 -> 850 Hz, 2 ms attack) + sub thump (110 -> 36 Hz)
    and rolling body delayed clamp(d / 343, 0.02, 0.40) s.
    `__audioDebug().blast`, `.blastFx`, `.shake`; `__az.blast.stats / glow`.
  - Debug: `?blastat=s[,air|ground|water|ship[,dist]]` (warp), `?fxhold`
    (with `&freeze`) holds the blast layers after a warp for stills.
  - Verified (pane): glow timeline -> above the 0.92 threshold only until
    ~0.16 s, all layers < 0.6 by 0.2 s; real MSL kill -> `MIG-29A DESTROYED`;
    4 simultaneous kills: 7.6 ms average / 11.5 ms p95 / 16.8 ms worst
    frame, 109 programs before and after (warm-up compiles the pools); shake
    0.78 / 0.43 / 0.05 at 150 / 400 / 800 m, none beyond 950 m. Headless
    (cloud sea): 0.08 s flash + ring, 0.5 s orange fireball + debris trails,
    5 s charcoal cluster against the sky, geyser column over the sea, soot
    plume off a hillside; zero page / shader errors.
- Note: weapons live in `src/combat.js` (no separate `weapons.js`); no
  functional gap.
- [x] **Difficulty presets + global CombatDirector** *(build `s51a`, new `src/difficulty.js`,
  `src/combat.js`, `index.html`)*
  - Briefing selector `ROOKIE | NORMAL (default) | ACE`, persisted in
    `localStorage` key `angels_zero_difficulty` (plain string, try/catch).
    Debug flags `?difficulty=ROOKIE|NORMAL|ACE` (forced, not saved) and
    `?diffcycle=n` (n clicks at boot, MENU only).
  - Preset table (hostile missile cap / stagger, player seeker half-angle / lock,
    4AAM cone / lock, gun radius / zone scale, flare decoy P, CIWS damage / spread,
    flak damage / radius, engine-fire DMG ignition / re-arm, missile ignition P):

    | Preset | MSL | stagger | seeker | lock | 4AAM | 4AAM lock | gun R | zone | flare | CIWS dmg/spread | flak dmg/R | fire on/off | missile ignite |
    | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
    | ROOKIE | 1 | 5.5 s | 10 deg | 1.0 s | 30 deg | 1.3 s | 14 m | 1.30 | 0.95 | 1.0 / 0.12 | 2 / 24 m | 65 / 60 % | 0.20 |
    | NORMAL | 2 | 3.5 s | 8.5 deg | 1.15 s | 27 deg | 1.45 s | 12.5 m | 1.15 | 0.90 | 1.6 / 0.10 | 3 / 27 m | 55 / 50 % | 0.28 |
    | ACE | 3 | 1.8 s | 7 deg | 1.3 s | 25 deg | 1.6 s | 11 m | 1.00 | 0.85 | 2.2 / 0.08 | 4 / 30 m | 45 / 40 % | 0.35 |

  - Director formula: `canLaunch = cooldown <= 0 && count(active && enemy &&
    target.isPlayer && !lostTrack) < max`; on launch `cooldown = stagger`;
    each frame `cooldown = max(0, cooldown - dt)`. Applies to bandit full/soft,
    land SAM, ship SAM and debug banditShot; per-source cooldowns still apply.
    Denied SAM retries in 2-4 s. Reset on `resetPlayer()` / `pitStop()`.
  - Verified `peak <= max` (SEC-04 fleet, `at=fleet&phase=2&warp=40`, headless):
    ROOKIE max 1 / stagger 5.5 â†’ peak 1, launches 4, denied 145;
    NORMAL max 2 / stagger 3.5 â†’ peak 1, launches 1, denied 1;
    ACE max 3 / stagger 1.8 â†’ peak 1, launches 1, denied 0.
    ACE 3.5 s / 210-frame sample of hostile missiles tracking the player: max 0
    observed (â‰¤ 3). Engine fire: ROOKIE 60 % DMG stays HEALTHY, 66 % ignites;
    ACE 46 % ignites. `setDifficulty('ROOKIE')` returns ROOKIE.
  - Verified persistence: `?diffcycle=2` boots NORMAL â†’ ACE (saved) â†’ ROOKIE
    (saved); next boot ROOKIE (stored); `?difficulty=ace` boots ACE (forced) and
    does not save; in-sortie `diffBtn.click()` is inert. Storage-blocked boot
    falls back to NORMAL via try/catch (no page errors).
  - No new materials or shaders: program count 109 before/after. Pass 1-5
    visuals unchanged, 375 px briefing wraps cleanly, zero page / WebGL errors.
    No per-frame allocations added (director is a preallocated closure + loop).
- [x] **Mach-1 cone, boom & buffet** *(build `s52a`, `src/vfx.js`, `src/audio.js`,
  `src/hud.js`, `index.html`)*
  - `updateMachCone(dt, mach, isCockpit)` replaces the old burst cone: two
    pre-allocated open cones (inner r 4.2 / L 9, outer r 6 / L 12), apex at the
    nose, opening aft; `transparent`, `depthWrite:false`, `DoubleSide`,
    `toneMapped:true`, four logdepthbuf chunks, colour clamped to 0.85.
    Opacity `smoothstep(0.98,1.0,mach) * (1 - smoothstep(1.02,1.05,mach))`,
    inner peak 0.22 / outer 0.12, hidden in cockpit. Zero per-frame allocation.
  - Transonic trigger in `updatePhysics`: `prevMach < 1 && mach >= 1 && machArmed`
    â†’ `onMach1()` (shake `{t:0,T:0.25,k:1}`, `combat.mach1T`, `onSfx('sonicboom')`);
    re-arms below 0.97. Shake is rotation-only (0.9 deg at 38 Hz, half in cockpit).
  - `audio.sonicBoom()`: two white-noise band-pass cracks 1,800â†’600 Hz at t and
    t+0.11 (2 ms attack / 80 ms decay), sine 62â†’28 Hz sub peaking 1.0 at
    12 ms and decaying to 0.001 by t+1.2, through `cockpitLP`, then
    `duckWorld(0.55, 0.25)`; `audio.boom` = `{t, count}`.
  - HUD banner `[ MACH 1.0 // SUPERSONIC ]` for 1400 ms after `combat.mach1T`.
  - Verified headless: zero JS/WebGL errors, cone visible only outside Mach
    0.98â€“1.05, boom counter and banner fire on the crossing, no shader-count
    change. All `?v=` tags bumped to s52a.
- [x] **Render performance pass** *(build `s53a`, `index.html`, `src/nvg.js`,
  `src/vfx.js`, `src/blastfx.js`, `src/world.js`)*
  - Pixel ratio capped at 1.25; composer HDR target `HalfFloatType`, `samples: 0`;
    bloom chain at 0.35 res on init and in `setSize` (strength 0.48, radius
    0.32, threshold 0.92 unchanged).
  - Alpha discard raised 0.004 â†’ 0.04 in `vfx` cloud/deck shaders and all
    `blastfx` alpha shaders; shadows disabled on clouds, deck, forest and every
    blast pool mesh; hanging-smoke pool 240 â†’ 110 (stats matches).
  - `renderer.info.autoReset = false`; one preallocated `window.__perfDebug`
    object receives `calls`, `triangles`, `frameMs` each frame around
    `nvg.render` (no per-frame object allocation).
  - Verified headless during active SEC-04 combat (`?nointro&debug&phase=2&
    at=fleet`, 90 frames): `frameMs` max 4.2, avg 2.48, 0 frames over 16.6,
    232 calls / 1,034,131 triangles, 6 bandits and 27 enemy tracers live.
    Headless Edge log: 0 JS/WebGL errors. Passes 1â€“5, `gpuWarm` and blast
    shake maths untouched; all `?v=` tags bumped to s53a.
- [x] **Missile near-miss / flyby feedback** *(build `s54a`, `src/combat.js`,
  `src/audio.js`, `src/hud.js`, `index.html`)*
  - Missile pool objects carry `flybyTriggered:false`, `flyMinD:Infinity`,
    reset in `launch()`. In `updateMissiles`, after the fuse check (so hits
    never count), a hostile missile tracking the player records its closest
    approach; once it recedes past `minD + 2` with `minD < 140`, it fires
    `env.onFlyby({ dist, k, side })` once. `side` uses preallocated scratch
    vectors; no per-frame `new THREE.*`.
  - `onFlyby` drives a preallocated `flyShake` (rotation-only camera rattle),
    a 0.25 s wake roll bump into `state.rollRate`, a CSS inset `#flybyPulse`
    (220 ms opacity animation), `combat.nearMissT` for `dist < 75`, and
    `onSfx('flyby')`.
  - `audio.flybyWhoosh(k, cockpit)`: white-noise band-pass sweep 2,600â†’340 Hz
    (Q 2.4), sawtooth 240â†’68 Hz, cockpit low-pass 2,200 Hz / chase 9,000 Hz,
    to `N.body`; `audio.flyby = { k, count }`.
  - HUD banner `[ NEAR MISS // EVADED ]` for 1400 ms after `combat.nearMissT`.
  - Verified headless: `onFlyby({dist:60,k:0.8,side:1})` sets `flyShake.k=0.8`,
    `nearMissT`, pulse inset shadow `rgba(255,220,170,0.176)`, audio counter 1,
    `__perfDebug.frameMs` 3 ms, zero JS/WebGL errors (in-app browser and Edge).
    All 21 `?v=` tags bumped to s54a.
- [x] **Chaff, radar notch + Z/J key remap** *(build `s55a`, `src/difficulty.js`,
  `src/combat.js`, `src/hud.js`, `index.html`)*
  - Missile pool objects carry `guidance:'IR'`, `notchT:0`, `chaffSalvo:-1`;
    `launch()` takes an 8th `guidance` argument (`RADAR` for SAMs, bandits beyond
    2,500 m). Flares decoy only IR seekers; the nearby bandit lock break is
    limited to 2,500 m and the old foil bloom becomes 28 orange sparks.
  - `Z` dispenses chaff (per-preset 10/8/6, 0.5 s cooldown, +1/10 s, 4.5 s cloud
    drifting at 0.35Â·jetVel, 90 pooled silver sparks). RADAR missiles inside
    900 m roll once per cloud against the preset decoy chance (0.9/0.82/0.72);
    a chaff hit detonates harmlessly. `J` now runs the ALQ-135 ECM jammer;
    briefing keybinds updated to match (Free Look still ALT/MMB).
  - Notch: folded aspect >= 75 deg below 1,200 ft AGL for 1.4 s breaks a
    RADAR seeker (+300), via pure velocity dot products (zero allocation).
    HUD adds `[ NOTCHED // RADAR LOCK BROKEN ]`, RWR `RDR`/`IR` glyphs, and a
    CHF stores row.
  - Verified headless: zero JS/WebGL errors; `combatSys.dispenseChaff()`
    consumes a cartridge and spawns a cloud with 90 pooled sparks; notch break
    and chaff decoy paths exercised via the debug API; program count unchanged.
    All 21 `?v=` tags bumped to s55a.
- [x] **WARDEN wingmen + CRT radio portraits** *(build `s56a`, `index.html`,
  `src/combat.js`, `src/hud.js`)*
  - Two F-15C clones (`WARDEN-2/3`) share the loaded GLB geometry/materials;
    cockpit/canopy meshes hidden. Echelon offsets Â±55 m / âˆ’8 m / +45 m, smoothed
    with pooled scratch vectors (no per-frame `new THREE.*`).
  - `G` toggles FORM / ENGAGE (gear moved to `L`; briefing keybinds updated).
    ENGAGE steers to 600 m behind the nearest bandit within 3 NM / 35Â°, clamped
    to 1,500 m from the player, and fires at most one AIM-9 per wingman per
    7â€“11 s. Friendly shots bypass the hostile director; wingman kills give no
    player score and route through the BASE-style no-credit branch.
  - Cyan HUD diamonds with `[ WDN-2/3 ]` + range when beyond 1 NM; wing-order
    banner for 1.6 s. CRT portrait is a plain 2D canvas (no WebGL texture):
    180 ms static, 2.6 s helmet/visor/mask with 20 fps flicker, then off.
    Callouts (fox two / splash one / clear your six) capped at one per 4 s with
    `audio.radioSquelch()` on the existing bus.
  - Verified headless (`?nointro&debug&warp=5`): 2 wingman meshes visible at
    Â±55 m, `G` -> `ENGAGE`, CRT opens, `__perfDebug.frameMs` 3.2 ms, program
    count unchanged (106), zero JS/WebGL errors (in-app browser and Edge).
    All 21 `?v=` tags bumped to s56a.
- [x] **CRIMSON ace flight mini-encounter** *(build `s57a`, `src/combat.js`,
  `src/audio.js`, `src/hud.js`, `index.html`)*
  - Once per sortie outside Phase 3, when waveAlive() <= 3, two pooled bandit
    slots become `CRIMSON-1/2`: 9 km ahead at 2 / 10 o'clock, +300 ft, 160 HP
    (100 x 1.6), 2 flares + 2 chaff, 25% harder turns (break max 11 G). The
    Phase-3 SOL-1 boss keeps its exclusive `e.ace` flag and ACE_KILL scoring.
  - Crimson look is an `InstancedMesh` per-slot colour (0x9e1b2c) via the
    existing `tintFleet()`; no new geometry, materials or shader programs.
  - Decoys: one 8 s decision against a player missile inside 1,500 m (flare
    salvo for IR, 50% chaff break for 4AAM + 60 pooled silver sparks). Ace
    missile cooldown 9-13 s; hostile director cap still applies.
  - HUD: gold/crimson diamonds with `[ ACE // CRIMSON-n ]` + 44x4 HP bars;
    3 s inbound banner; `audio.aceWarning()` triple square chime on `N.body`;
    CRT taunt with crimson caption when `env.onWing` exists.
  - Kill reward: +2500, flares/chaff refilled, `e.aceFlight` cleared; slot
    reuse in `resetAI()` also clears it. `stats().aceFlight` reports
    `{done, alive, labels}`; `?acewingat=s` spawns on demand.
  - Verified headless (`?nointro&debug&acewingat=1&warp=6&logat=2,5`):
    `aceFlight.alive = 2`, labels `CRIMSON-1,CRIMSON-2`, 0 JS/WebGL errors,
    `__perfDebug.frameMs` 4.9 ms, no shader-count increase from the tint.
    All 21 `?v=` tags bumped to s57a.
- [x] **Allied CVN + arrest / catapult** *(build `s58a`, `src/world.js`,
  `src/combat.js`, `src/audio.js`, `src/hud.js`, `index.html`)*
  - `CVN-ALLY "OVERLORD"` reuses `buildCarrier()` / `mergeStatic()`, is friendly,
    never a target or emitter, steams 8 kt on a 6 km north-south racetrack south
    of AFB, exposes `C.ally = {g, fwd, pos, vel, deckY, len}` and adds hull +
    island AABB collision via `env.addBox` (exported from `world.js`).
  - Trap zone behind the stern (wires #1-3 at len/2-64/-78/-92): gear down,
    <175 kt, >-6 deg pitch, within 14 m / 3.5 m of the deck â†’ `ARREST` early
    return in `updatePhysics` with a 1.6 s exponential cable deceleration and
    `#wire` banner / `audio.cableScreech()` / blast impulse.
  - 3 s `DECK` turnaround calls `combatSys.pitStop()` once, restores
    health/flares/chaff/engines, WARDEN callout + CRT, slides to the bow
    shuttle. `CAT` holds until throttle >= 0.95, then `LAUNCH` strokes to 85 m/s
    relative over 1.4 s with 26 pooled steam puffs, `audio.catapult()` and a
    1 s re-trap cooldown.
  - Debug: `?at=carrier`, `?trapat=s`, `?catat=s`; `stats().carrier` reports
    `{phase, wire, t, localZ}`.
  - Verified headless: `?nointro&debug&trapat=1&warp=8&logat=1.2,2.8,6,8`
    shows ARREST -> DECK -> CAT, wire 2, `dmg.pct=0`, flares full, zero
    JS/WebGL errors (in-app + Edge); `&catat=1&thr=1` launches airborne with
    phase cleared; 120-frame sample max 13.6 ms / 0 frames over 16.6 ms.
    All 21 `?v=` tags bumped to s58a.
- [x] **Time scale + slow-mo + missile cam** *(build `s59a`, `index.html`,
  `src/combat.js`, `src/audio.js`, `src/hud.js`)*
  - `advanceTimeScale(realDt)` drives `timeScale` through a 0.24 s hold at 0.32,
    a 0.15 s smoothstep recovery, then 1.0. `animate()` passes real `dt` to
    `hud.draw` / `canopyFx` / menus / audio and scaled `sdt` to `stepSim` +
    `updateCameraAndVisuals`; UI and input never freeze. `triggerSlowMo()` calls
    `audio.slowMo()` and is wired as `env.onSlowMo`.
  - `destroyEnemy()` fires one pulse on a close (<450 m) gun kill or any ace
    (incl. CRIMSON-), excluding BASE kills; `launch()` records `C.lastPlayerMsl`
    exposed as `combatSys.lastPlayerMissile`.
  - Audio master chain is now `master -> slowLP -> slowShelf -> duck`; `slowMo()`
    drops to 650 Hz / +7 dB @ 90 Hz for the hold, sweeps open over recovery and
    adds a 55 -> 32 Hz sub thump. `N.lastSlowMo` feeds `__audioDebug().slowMo`.
  - Hold M / RMB >0.28 s on a live player missile (chase, FLY, no carrier phase)
    engages the missile cam: preallocated `_mc` / `_mt` scratch, 0.25 s eased
    blend from the preserved chase spring, look along missile velocity, instant
    snap-back. Incoming tracking missile <380 m aborts to a fresh press with a
    `[ CAM ABORT // INCOMING MISSILE ]` banner; HUD shows a telemetry-link tag
    and target range. Debug `?mcamat=s,dur`, `?slowmoat=s`; logs report
    `mcam {active,k}` / `slowmo {timeScale}`.
  - Verified headless: `?nointro&debug&msl&mcamat=0.3,2&warp=2&logat=0.5,1.5`
    â†’ `mcam.active=true, k=1` at 0.5 s; `?nointro&debug&slowmoat=1&warp=1.1`
    â†’ `timeScale=0.32` and `__audioDebug().slowMo.count=1`; threat injected
    next to the jet aborts the cam and requires a fresh press; zero JS/WebGL
    errors (in-app + Edge `BAD_LINES=0`); 120-frame steady sample avg 5.65 ms /
    max 12.9 ms / 0 frames over 16.6 ms. All 21 `?v=` tags bumped to s59a.
- [x] **Strike campaign: jammer bunkers + EW field** *(build `s60a`,
  `src/combat.js`, `src/hud.js`, `index.html`)*
  - Four `JAMMER-01..04` bunkers (110 HP each = 2.2 x SAM hp) share one pooled
    geometry set (bunker / slanted roof / mast / crossbar; grey barge fallback
    for the gorge). #1-2 sit on the first flat canyon bank at z = -6400 /
    -7600 within 260 m of `canyonX`; #3-4 sit 30 m inboard of the Bridge Strait
    pier footings at y = 6. One set per sortie: excluded from the 40 s SAM/AAA
    respawn, restored alive by `resetPlayer()`.
  - Bombs within 35 m deal 75 % max HP; gun rounds deal 3 (7.2 m radius). Each
    kill scores 1200, raises `JAMMER DOWN` + slow-mo, and the fourth announces
    `STRIKE COMPLETE`. Ground-map auto-designation prefers a live jammer.
  - EW field: `C.jamming` ramps in above 500 ft AGL inside the canyon or bridge
    sectors (2.8 km). While >0.5, locks only decay, the RWR flickers real tracks
    and shows three bogus paints per 300 ms. A low entry announces WARDEN-2 once
    per entry (20 s cooldown). HUD: scanline corruption + radar jitter, amber
    `JAMMING` banner / `JAM ON` stores row, and amber diamonds with range / HP
    and an off-screen chevron.
  - Debug: `?at=canyonlow`, `?strikekillat=s`; `stats().strike` reports
    `{alive, labels, jamming, sectorLow}`. `?alt=` now correctly overrides the
    named `?at=` spot altitude.
  - Verified headless: `?nointro&debug&at=canyon&alt=600&warp=3&logat=2` â†’
    `strike.jamming=1`, 4 alive; `?at=canyonlow&warp=3` â†’ `jamming=0`,
    `sectorLow=true` plus the WARDEN callout; `?strikekillat=1&warp=2` â†’
    0 alive, score +4800, 4 slow-mo pulses; zero JS/WebGL errors (in-app + Edge
    `BAD_LINES=0` on all three URLs); 90-frame jammed sample avg 4.05 ms /
    max 15 ms / 0 frames over 16.6 ms. All 21 `?v=` tags bumped to s60a.
- [x] **Hangar SPW loadout + squadron liveries** *(build `s61a`, new `src/loadout.js`,
  `src/livery.js`, `src/combat.js`, `src/hud.js`, `index.html`)*
  - Two validated localStorage keys (`angelsZero_spw`, `angelsZero_livery`) hold the
    SPW choice (4AAM / UGB / QAAM) and the squadron paint (GHOST / ARCTIC /
    GRIMDARK / ACE_GOLD). The briefing replaces the unlock-gated profile row with
    the four unlocked squadrons and mirrors the pick into `profile.selectedLivery`.
  - Livery painter mutates existing body materials only: paint colour / roughness
    plus permanent vertex colours (ARCTIC splinter hash with skewed cell edges,
    ACE_GOLD fin / wingtip crimson accent). One pooled 128 px dice decal texture
    and `MeshBasicMaterial` on each outer tail face (opacity 1 only for GRIMDARK),
    cloned to both wingmen; `gpuWarm` compiles it at startup (+1 program).
  - QAAM: 12 rounds / 10 s reload, 60 deg off-nose, 2.6 NM, 0.6 s lock; high-turn
    `MSL_QAAM` quality fired from alternating rails at 0.35 s. Weapon cycle is
    MSL + the selected SPW (keys 1 / 2 / 3, R); one HUD stores row shows the SPW
    and its ammo. `pitStop()` / `resetPlayer()` refill QAAM; `stats().loadout`
    reports `{spw, wpn, qaam, livery}`. Debug `?spw=QAAM&livery=ARCTIC` overrides
    at boot without saving (and flies the selected SPW).
  - Verified headless: `?debug&spw=UGB` selects UGB in the briefing and key 3 gives
    `loadout.wpn=BOMB`; two-run reload with one profile dir restores UGB / GRIMDARK
    from localStorage; `?nointro&debug&spw=QAAM&cat=0.5&warp=2&logat=1.2` gives
    `lock.state=LOCK` at 44.5 deg off-nose; GRIMDARK screenshot shows the matte
    airframe with 2 dice decals on the lead and 2 on each wingman (111 programs
    warm); zero JS/WebGL errors (in-app + Edge `BAD_LINES=0` on five URLs);
    120-frame sample avg 7.06 ms / max 14.7 ms / 0 frames over 16.6 ms.
    All 21 `?v=` tags bumped to s61a (+ the new `loadout.js?v=s61a` imports).
- [x] **High-altitude contrails + canopy droplets + cockpit mist** *(build `s62a`,
  `src/vfx.js`, `src/audio.js`, `index.html`)*
  - `Ribbon` now takes per-instance `step` / `minDt` / `far`; the haze fade is a
    `uFar` uniform (no new shader program). Wingtip / LEX ribbons keep defaults
    and the existing 0.85 colour clamp stays under the 0.92 bloom threshold.
  - Ten pooled contrail ribbons (2 nozzles x lead + WARDEN-2/3 + CRIMSON-1/2)
    sample every 22 m / 0.09 s (~9 s of trail), tinted `#eef2f6 x vaporTint`.
    `vfx.updateContrails(emitters, now)` fills a reused 5-entry descriptor array
    with no per-frame allocation; teleports / death decay through the existing
    RIB_JUMP guard and `clearTrails()` clears them too. `vfx.contrailStats`
    reports active emitters / live samples and is logged on the warp line.
  - Canopy wetness eases toward 0.75 in cloud above 500 ft in first person
    (0.25 s in, 0.83 s out) and feeds the existing `canopyGlass.update` rain
    input, so the airspeed-driven aft streaks appear without new uniforms or
    draw calls. The existing `uRain > 0.01 || uMoist > 0.05` fast path covers it.
  - Mist patter is a pre-allocated high-passed / band-passed white-noise loop
    with a 17 Hz square AM into `cockpitLP`; `update()` only ramps its params.
    `__audioDebug().mist` reports gain / band centre.
  - Verified headless: `?nointro&debug&alt=4000&spd=230&warp=6` â†’
    `contrailStats.active=3, liveâ‰ˆ440` (lead + 2 wingmen), visible ribbon meshes
    with alpha â‰ˆ0.52; `alt=3300` â†’ `active=0`; cockpit cloud run â†’
    `__audioDebug().mist.gain=0.028, hz=8861` and canopy `rain=0.75`; climbing
    out clears it to 0.05 in ~2.5 s; zero JS/WebGL errors (in-app + Edge
    `BAD_LINES=0` on four URLs); 120-frame sample avg 4.28 ms / max 5.9 ms /
    0 frames over 16.6 ms. Debug `?contrailalt` spawns at 4,000 m.
    Every `?v=` tag bumped to s62a.
- [x] **Structured in-game Patch Notes** *(build `s63a`, new `src/patchnotes.js`,
  `index.html`, `CLAUDE.md`, `CODEBASE_MAP.md`)*
  - `PATCH_NOTES` is a newest-first array of 16 releases (`v1.0.5` .. `v0.9.0`)
    with 2-4 user-facing bullets each, covering Mach cone, 60 FPS, flyby,
    chaff/notch, wingmen, Crimson aces, carrier ops, missile cam, strike,
    hangar, contrails, debrief replay, furball, cockpit MFD and mission guidance.
    `renderPatchNotes()` rebuilds the `[ PATCH NOTES ]` panel from the array.
  - `PATCH_NOTES[0].version` drives the briefing `buildChip` and the
    `[ PATCH NOTES v1.0.5 ]` button label automatically. Scroll, close and
    reopen verified in headless browser; zero JS/WebGL errors (in-app + Edge
    `BAD_LINES=0`).
  - `CLAUDE.md` now has a mandatory Pre-push checklist step: bump the patch
    version and prepend a 2-4 bullet PATCH_NOTES entry before every commit/push.
  - Follow-up: the cramped top-right dropdown was replaced with a briefing-footer
    `[ PATCH NOTES v1.0.5 ]` button and a centered frosted modal (680 px / 75 vh,
    z-index 100, 14 px / 1.5 type, `[ CLOSE / ESC ]`). `#patchBody` scrolls with
    `overscroll-behavior: contain` and wheel/touchmove propagation stopped;
    ESC handling was moved ahead of the MENU branch so it always dismisses.
    Desktop briefing CSS was tightened and widened so the whole screen fits at
    1280x720 and 1920x1080 without clipping; zero JS/WebGL errors at both sizes.
- [x] **Telemetry trace debrief + composite rank** *(build `s64a`, new
  `src/telemetry.js`, `index.html`, `src/combat.js`, `src/hud.js`,
  `src/profile.js`)*
  - One fixed `Float32Array` pair records 600 position/alt/time samples at
    1.5 s intervals and 64 combat events; flight-time cost is index writes only.
    Kill / ace-kill / strike-kill / carrier-trap / near-miss events are fed from
    combat hooks, and `stats().tele` reports `{n, ne}`.
  - Debrief adds a 360 px DOM 2D map: topo sheet underlay, AFB / bridge / canyon
    / carrier landmarks, an animated 4 s trace with altitude-brightness and
    vector event icons that pop over 0.2 s. R or `[ R ] REPLAY TRACE` restarts
    the animation; its single RAF is cancelled on replay / return to briefing.
  - Rank combines time (30), damage (25), gun+missile accuracy (25) and
    objectives (20), capped at B for failed sorties; `rankOverride` is transient
    and leaves the stored profile schema untouched.
  - Verified headless: `?nointro&debug&warp=40&killat=10&nearat=15&debriefat=40`
    â†’ debrief with `tele.n=26`, 15 breakdown cells, rendered topo + trace;
    different damage yields B vs C; the same 75-point total yields A when
    cleared and B when failed; zero JS/WebGL errors. Debug `?debriefat=s`,
    `?nearat=s`. Every `?v=` tag bumped to s64a.
- [x] **FURBALL instant-action mode** *(build `s65a`, `src/loadout.js`,
  `src/combat.js`, `src/hud.js`, `index.html`)*
  - New `MODE_KEY` / `MODES` persistence with a briefing `[ MODE: â€¦ ]` toggle;
    `?mode=FURBALL` overrides without saving. FURBALL hot-starts airborne at
    6,000 ft / 420 kt over the cloud sea with gear up, cleared trails, a snapped
    chase camera and wingmen in formation.
  - `furballTick()` recycles dead bandits from the existing six-slot pool every
    3.5 s at 6â€“9 km / 1,400â€“2,600 m, keeping two slots free for the CRIMSON pair;
    a fresh ace pair spawns every five player kills. Mission waves, phases and
    the ace-kill end trigger are untouched when `C.mode === 'MISSION'`.
  - Double-Tab (or the pause-menu button) ends the sortie; a TAB-again HUD
    banner confirms the armed state. FURBALL debriefs rank on kills/minute,
    show mode, kill rate and ace pairs, and `[ SORTIE AGAIN ]` keeps the mode.
  - Verified headless: briefing toggle persists across two runs; FURBALL warp
    holds 1,829 m / 216 m/s with `furball.alive = 6`; five kills spawn
    CRIMSON-1/2; double-Tab opens `FURBALL COMPLETE` with a rank and 18 cells;
    MISSION-mode regression still shows Phase 1 with six bandits; zero
    JS/WebGL errors across three Edge CLI URLs. Debug `?mode=FURBALL`.
    Every `?v=` tag bumped to s65a.
- [x] **VSD MFD sub-pages** *(build `s66a`, `src/cockpit3d.js`, `src/audio.js`,
  `src/combat.js`, `src/hud.js`, `index.html`)*
  - `[` / `]` cycle the existing 3D cockpit VSD CRT through TACTICAL RADAR,
    STORES & DMG and RWR THREAT SCOPE, in first person only and never during
    hit-stop slow-mo. Same canvas, `CanvasTexture`, material and partial upload
    path; the round-robin CRT cadence is unchanged, with an immediate repaint on
    page change. Each page has a `MFD n/3` header and a short HUD confirmation
    banner plus a procedural click chirp.
  - Radar plots wingmen, bandits, aces and live strike bunkers heading-up over
    a 10 NM / 2 s sweep. Stores shows the mirrored F-15 wireframe, engine state
    (including 2 Hz fire flash), damage bar, missiles, SPW ammo and countermeasures.
    Threat scope draws RWR missiles / locks / paints with an ACE flag and SHP tags.
  - Verified headless: `?nointro&debug&cockpit&warp=3` + `]` â†’ page 1 with label
    `STORES & DMG`; `[` from page 0 wraps to page 2; chase view ignores the keys;
    `renderer.info.programs` (99) and `__perfDebug.calls` (29) unchanged across
    page switches; zero JS/WebGL errors across three Edge CLI URLs.
    Debug `?mfdpage=0..2`. Every `?v=` tag bumped to s66a.
- [x] **Four-phase mission flow + tactical HUD** *(build `s67a`, `src/combat.js`,
  `src/hud.js`, `index.html`)*
  - MISSION now runs SWEEP â†’ STRIKE â†’ CRIMSON INTERCEPT â†’ CARRIER RTB; the old
    CLEARED-on-Ace trigger is gone and completion is the #3 arrest trap.
    `primaryTargets()` reuses an 8-slot array; `stats().mission` reports the
    phase, label, objective counts and primary count. FURBALL stays endless.
  - HUD adds a top-right objective card with nearest-target range, an off-screen
    chevron / on-screen bracket, a five-rule contextual prompt pill (radar /
    IR / RTB / missile cam / wingmen) and an F1 keybind cheat-sheet.
  - One instanced approach-gate mesh (three frames) always in scene, opacity
    driven by damage / winchester / phase 4, so its program is compiled at warm-up.
  - Verified headless: phase 1 card reads `OBJ: SWEEP BANDITS [0/6] — 8.1 KM`;
    `?mphaseat=1,2` gives four strike primaries, `=1,4` gives the carrier with
    gates visible (opacity 0.26); `?radarshot` produces a RADAR `msl` RWR entry;
    F1 toggles the sheet; zero JS/WebGL errors across four Edge CLI URLs.
    Debug `?mphaseat=s,n`, `?radarshot=s`. Every `?v=` tag bumped to s67a.
- [x] **Voiced radio cast** *(build `s68a`, `src/radioScript.js`, `src/audio.js`,
  `src/combat.js`, `index.html`)*
  - 45 radio-filtered MP3 lines (0.92 MB) for AWACS, WARDEN-2/3 and CRIMSON-1,
    lazily decoded into a fixed clip cache (four concurrent fetches); missing
    clips fall back to CRT text. Squelch clicks (45 ms / 1800 Hz) bracket each
    transmission; music ducks to 0.35 and combat SFX to 0.63 while a line plays.
  - One-channel dispatcher: CRITICAL interrupts, TACTICAL queues (max 2), BANTER
    needs 3 s channel idle + a 5 s cooldown (else dropped); per-event cooldowns
    (8 s, 20 s for near-miss / canyon-low) and once-per-sortie mission events.
    Captions drive speaker-tinted CRT
    portraits and subtitles. `window.__playTrailerLine()` exposes the 6 hero
    lines for Trailer Director capture.
  - All 12 events wired from combat / sortie flow; duplicate text callouts
    (trap, canyon-low, wingman fox two / clear-six, CRIMSON entry taunt) removed.
    Debug `?radioat=s,EVENT`, `?radiohero`.
  - Verified headless: `?radioat=1,ON_TAKEOFF&warp=4` fires the hook and shows the
    tinted CRT caption (caption-only fallback while the synchronous warp beats
    async decode); `?radiohero` plays all 6 hero lines, restores the duck buses
    and holds the speaker-tinted caption for the clip. BANTER rules exercised
    directly: the 5 s cooldown and busy / <3 s-idle gates drop, a >3 s idle
    channel plays. MP3 requests 200 with 0.92 MB total; deployable build 13.1 MB
    (< 25 MB); render cost 3.4-7.2 ms/frame (3.5-7.0 ms with radio active), well
    inside the 16.7 ms 60 FPS budget; zero JS/WebGL errors across three Edge CLI
    URLs. Every `?v=` tag bumped to s68a.
- [x] **Borderless STANDBY hangar** *(build `s69a`, `index.html`, `src/audio.js`)*
  - The legacy `#menu` stays in the DOM with every id and listener; its chrome is
    transparent and all panel children are hidden. A new `| STANDBY |` nav
    (top-left), `[ FLIGHT ]` roster (top-right), `[ MISSION BENCHMARK ]`
    (bottom-right) and description + PC key hints + camera toggle (bottom-left)
    sit directly over the full-viewport 3D F-15C.
  - Arrow keys / mouse drive one active row; LAUNCH, MODE, DIFFICULTY, SPW,
    LIVERY, WEATHER/TIME, CONTROLS & AUDIO and PATCH NOTES all route through the
    legacy buttons or their functions. PAUSED swaps in RESUME SORTIE + RESTART.
    SPW changes recolour the roster badge and the benchmark bars.
  - `[ CONTROLS & AUDIO ]` modal receives the existing 26 bind rows and audio
    widgets via `appendChild`; adds a persisted MUSIC slider
    (`angelsZero_musicVol`) alongside MASTER, mute and the K toggle.
  - Verified headless at 1280x720 and 1920x1080 (and a true 320 px CSS viewport):
    no green panels, 0 JS/WebGL errors; ArrowDown x3 + ArrowRight cycles SPW
    4AAM -> UGB (cyan -> amber badge, bars 85/35 -> 55/90); Enter on LAUNCH starts
    the sortie; PAUSED rows, modal, slider persistence and Escape close all pass.
    Render cost 2.2-4.6 ms/frame (median 2.7 ms), well inside 16.7 ms. Note:
    headless Edge clamps a 375 px window to a 496 px CSS viewport, so the 375 px
    screenshot is cropped by the harness, not by page overflow. Every `?v=` tag
    bumped to s69a.
- [x] **Post-stall maneuvering** *(build `s70a`, `index.html`, `src/combat.js`,
  `src/hud.js`, `src/vfx.js`)*
  - Velocity direction is now rate-limited toward the nose (`AOA_COUPLE` 3.4,
    `AOA_COUPLE_PSM` 0.32) instead of being force-integrated onto it; AoA is
    recomputed from body-frame velocity with no clamp. Attitude stays a pure
    quaternion — Euler angles feed the HUD only, so loops pass vertical cleanly.
  - PSM (`B+SHIFT` under 290 kt, or high-G + full pull, or `?psm`) frees the nose:
    no AoA/G limiter, pitch authority x1.85 (cap 3.6 rad/s), yaw x1.7 with weak
    weathercock, induced drag x2.4 and post-stall flat-plate aero. Cobra, Kulbit
    and Hammerhead are detected with allocation-free accumulators, call out on the
    HUD and award 400 style points.
  - Apex authority keeps yaw/pitch alive with the nose vertical (Hammerhead /
    Ranversman); sustained stall + opposite rudder/roll enters a flat spin that
    holds ~120 deg/s yaw and recovers on neutral stick + opposite rudder or 180 kt.
    `?spintest` forces entry at t = 1. CRIMSON ace flights can fly visual PSM
    reversals (COBRA / KULBIT) that bleed speed without changing their intercept.
  - High-AoA vapor is dense, camera buffet is rotation-only, and `stats()` /
    warp log report `psm: { active, alphaPk, spin, lastMan }`. Debug `?psm`,
    `?spintest`, `?rudder=a|d`. No per-frame `new THREE.*` in the new code.
- [x] **CRT radio portraits** *(build `s71a`, `index.html`,
  `scripts/make_portraits.py`, `assets/portraits/`)*
  - `make_portraits.py` (Voicebox venv Pillow) crops the single source photo in
    `art_src/portraits/` into six 128x160 webp phosphor portraits: Warden-1/2/3,
    procedural AWACS operator, and Crimson-1/2 in `#FF2233` red with a threat
    frame and corner brackets. All six total 19.9 KB (each < 4 KB).
  - The old 96 px canvas silhouette loop is gone. `#crtBox` shows a preloaded
    `<img>` with CSS scanlines, flicker and a sweep-in `crtIn` entrance; the
    radio dispatcher picks the portrait from the speaker callsign, tints the
    border/CRT caption green `#20FF70` or red `#FF2A3B`, and adds the
    `â–² THREAT //` tag for Crimson. Idle state reads `STANDBY / NO SIGNAL`.
  - Updates happen only in `onWing()` (class toggles + one timer) — zero
    per-frame JS. A failed image hides the `<img>` and keeps the text caption.
    Verified: 6/6 webp requests 200, greenâ†”red swap, scanlines + idle state,
    text-only fallback with portraits removed, zero JS/WebGL errors, frame cost
    7.4 ms. Every `?v=` tag bumped to s71a.
- [x] **CVN carrier deck** *(build `s72a`, `src/combat.js`, `index.html`,
  `assets/models/uss_enterprise.glb`)*
  - The untracked 15.2 MB carrier GLB moved to `assets/models/uss_enterprise.glb`
    and its opaque PNG textures were re-encoded to JPEG: 7.98 MB total, textures
    already <= 1024 px. Deployable build is 21.19 MB (< 25 MB).
  - `loadCarrier()` reuses the jet's GLTFLoader and `renderer.compileAsync`, then
    scales the model to 360 m, orients the island to +X / bow to -Z, re-centres it,
    measures the deck with five downward ray hits and rebuilds the pooled edge
    lights. The procedural ship stays as the default and as the error fallback.
  - The whole-ship collision box is gone: a local deck/hull box only bites more
    than 2 m below the deck (and not while gear-down / in a carrier state), and a
    measured island box is the only solid volume above the deck. Catapult, wires,
    trap zone, approach gates and debug spawns all derive from `ally.len/deckY`.
  - Verified: `warp=20&logat=18` reports `glb true`, `len 360`, `deckY 18`, island
    on +X; catapult reaches ~187 kt and clears; `trapat=1` catches (traps=1) and
    advances ARREST -> DECK -> CAT; centreline +15 m and below-deck gear-down pass,
    while x=30 at the island collides; missing GLB falls back procedurally with no
    JS exception. Zero JS/WebGL errors across six scenarios, frame cost ~7.2 ms
    median. Every `?v=` tag bumped to s72a.
- [x] **Memory optimization** *(build `s73a`, `assets/models/uss_enterprise.glb`,
  `scripts/optimize_carrier.py`, `index.html`)*
  - Carrier GLB: normal/specular maps downscaled to 512 px (base-colour maps kept
    at 768 px so deck markings stay crisp), geometry meshopt-compressed, textures
    WebP, plus `dedup`/`prune`. 7.98 MB -> **1.89 MB**; estimated carrier texture
    GPU budget 43.2 MB -> 19.2 MB (56% less). `GLTFLoader` now installs
    `MeshoptDecoder`.
  - Renderer DPR stays capped at 1.25 (stricter than the 1.5 ceiling requested),
    so 125-150% Windows scaling cannot over-allocate the half-float composer /
    bloom targets. Directional shadow map remains 1024x1024.
  - `?memtest` logs `renderer.info.memory` and JS heap at startup, in-flight and
    after three `SORTIE AGAIN` cycles. Measured: geometries 607 and textures 88
    on every sample; heap 64 -> 77 -> 79 -> 74 -> 76 MB (no growth), programs
    plateau at 175. Zero JS/WebGL errors; frame cost 3.6-5.4 ms (median 4.5 ms).
    Every `?v=` tag bumped to s73a.
- [x] **Soundtrack rollback** *(build `s75a`)*: v1.1.6 (`ae0fa0d`, a sampled VSCO 2 CE orchestra) was reverted; a new score is being produced in Google Flow Music. The s32a adaptive synth soundtrack is restored unchanged. Every `?v=` tag bumped to s75a so no cached s74a module pairs with the restored page.
- [x] **Forgiving recovery** *(build `s76a`, `index.html`, `src/combat.js`, `src/audio.js`, `src/hud.js`)*
  - Trap/touchdown limits now 220 kt / -12 deg pitch / 20 deg bank / 9 m/s sink / 22 m lateral; firm legal touchdowns clamp the sink and seat the jet on the surface with no impact damage. `TRAP BONUS` (+1000, full health) fires on carrier traps and runway pit stops.
  - Auto-gear every 0.25 s inside 1600 m / 128 m AGL / 250 kt, re-armed past 3000 m or 300 kt; a manual `L` press locks it out. A light-stick ILS corridor (45 m lateral, 1300 m along, 70 m vertical) eases heading, cancels bank and sets `state.assist` for the `ILS ASSIST` HUD row. Runway 36 joins the carrier in six approach-gate instances.
  - Return Line at z = 8000 with 21 pulsing cyan pylons; crossing resets stores/health on a 25 s cooldown, shows the rearm banner and an edge chevron to the nearest Return Line / carrier / AFB when winchester or badly damaged.
  - Chaff now breaks radar locks beyond 2.5 km and plays its own SFX; bandit launch callouts distinguish `RADAR MISSILE — CHAFF / NOTCH!` from `IR MISSILE — FLARES! BREAK!`, RWR task-force paints carry `g: 'RADAR'`. Keybind list refreshed. Every `?v=` tag bumped to s76a.

- [x] **WASD flight controls** *(build `s77a`, `index.html`, `src/hud.js`, `src/patchnotes.js`)*
  - `W/S` pitch (W nose-down, optional `angelsZero_invertPitch`) and `A/D` roll ramp at 4/s into the existing G-limited/PSM command path. Mouse aim is suppressed while keys are held and blends back over 0.35 s, with no snap-back. All input state is preallocated; no per-frame allocations.
  - Throttle moved off W/S to Shift, Ctrl, arrow keys and a non-passive canvas wheel handler; AB engages only at full throttle with Shift. Rudder moved to Q/E, barrel roll to V and eject to P; blur, visibilitychange, pause, eject and menu transitions clear all held keys and axes. A `beforeunload` guard warns during PLAY (Ctrl+W can still close the tab).
  - F1 sheet, Controls & Audio matrix, STANDBY hints and pause legend updated; `?kb=` / `?rudder=` debug hooks and `__kbDebug` added. Verified headless: W/S pitch to -0.999 elevator, A/D roll to -0.999 aileron, Q/E yaw, throttle keys/wheel/AB, key-release + blur reset, mouse aim restored after release, zero JS/WebGL errors. Every `?v=` tag bumped to s77a.

- [x] **Streaming soundtrack** *(build `s78a`, `scripts/build_bgm.py`, `assets/audio/bgm/`, `src/audio.js`, `index.html`)*
  - 24 raw M4A beds converted with loudnorm to Ogg Vorbis and grouped into 12 scenarios with `manifest.json`. Sources stay in gitignored `raw_bgm/`; `angel-zero/assets/audio/bgm/` holds the deployable clips under a 12 MB folder / 25 MiB per-file cap, escalating 64k -> 48k -> 150 s -> 80 s.
  - Two reusable `Audio()` decks stream the clips through `src -> g -> musicBus -> duckG -> musicVolG -> master`, with 1.5 s equal-power crossfades, alternating tracks per scenario, 4 s dwell (0 for debrief/hangar) and a one-shot autoplay unlock. Only the manifest is fetched; no per-frame allocations.
  - The 12-scenario resolver covers debrief, RTB, Crimson duel, last stand, canyon, furball, storm, night, strike, air superiority, catapult and hangar. Radio calls ramp the music bed -5 dB over 0.25 s; PAUSED holds it ducked. Ogg-incompatible browsers keep the old synth score. `?debug&bgm=<scenario>` forces one; `__audioDebug().bgm` reports state.

- [x] **Mission select + dual RTB + mission BGM** *(build `s80a`, `src/missions.js`, `src/maps.js`, `src/world.js`, `src/combat.js`, `src/audio.js`, `index.html`, `src/hud.js`)*
  - `MISSIONS` registry (AIR_SUPERIORITY, NAVAL_BATTLE, CANYON_RUN, ACE_DUEL, FURBALL) with spawn, waves, targets, map tag, RTB type and soundtrack scenario. One block plus one `MISSION_ORDER` entry extends the game. The `| STANDBY |` mission row cycles the registry, persists via `angelsZero_mission`, and drives the derived MODE chip; `?debug&mission=<id>` selects one for headless runs.
  - `MAPS` supplies per-mission terrain, runway, carrier, fleet and cloud-sea layout. `world.rebuild(mapDef)` regenerates the height grid and terrain `BufferGeometry` in place (disposing the old geometry), resets collision sets and toggles runway props; pooled actors return via `combat.resetMission()` so mission switches allocate nothing and `?memtest` holds geometry/textures at delta 0.
  - Phase flow is now PRIMARY â†’ RTB â†’ DONE. BASE missions touch down on RWY 36 and autobrake to a stop; CARRIER missions re-anchor six glide-slope gates in the moving carrier frame and complete with a cinematic `[L]` ILS autoland (CAPTURE â†’ GLIDE â†’ FLARE â†’ TRAP â†’ ROLLOUT) onto USS Enterprise. `[L]` engages autoland only while the `[L] ENGAGE AUTOLAND` prompt is visible, otherwise it still toggles gear. `?debug&rtbat=s` and `?debug&autolandat=s` force each ending.
  - `resolveScenario()` now resolves from the mission registry plus dynamic state priority in one preallocated context: debrief/landed â†’ RTB â†’ hangar â†’ catapult â†’ last stand â†’ storm/night (only for `wxOverride` missions) â†’ `bgmScenario`. MIN_DWELL is 4 s except debrief/hangar/RTB. CANYON_RUN, NAVAL_BATTLE and ACE_DUEL keep their own score under `tod=NIGHT`. Every `?v=` tag bumped to s80a.

- [x] **Catapult launch opening** *(build `s81a`, `src/combat.js`, `src/vfx.js`, `src/audio.js`, `src/hud.js`, `src/radioScript.js`, `index.html`)*
  - Carrier sorties open in `CATAPULT_HOLD` on the bow track at 0 kt with the JBD raised and deck steam rolling; the existing `cat_awacs_01` clip fires as `CAT_ARMED` (CRT-text fallback). The HUD shows `[HOLD FULL AFTERBURNER / SHIFT] LAUNCH` with an arm bar while the objective card stays hidden.
  - Full throttle + afterburner held for 0.35 s fires `CATAPULT_LAUNCH`: a 108 m / 2.4 s stroke to 90 m/s (175 kt) with a 4 deg nose-up rotation, camera rattle, pooled steam eruption and no deck collision snags. `catRelease` returns control after a 0.5 s grace, lowers the JBD and bumps the BGM dwell so `02_catapult` crossfades to the mission score on that frame.
  - WARDEN-2 (bow) and WARDEN-3 (waist) hold on their own tracks, launch 0.6 s and 1.3 s behind lead with their own steam and a 0.7-gain catapult call, then climb out and blend into echelon over 4 s. Old v0.9.6 `carrier.phase` cat path is gone; `?catat` routes through `cat`, with `?debug&catlaunchat=s` forcing the launch input. Every `?v=` tag bumped to s81a.

- [x] **Carrier deck fix + music player** *(build `s82a`, `src/combat.js`, `src/audio.js`, `src/hud.js`, `scripts/build_bgm.py`, `assets/audio/bgm/manifest.json`, `index.html`)*
  - `startSortie()` now awaits the CVN GLB and calls `placeCarrier(def)` before `catEnter()`, showing the loading hint while it waits. A persistent unscaled `allyRoot` is mounted once, never disposed by `resetMission()` / `world.rebuild()`, and is force-visible in carrier missions; `updateAlly(dt)` runs before `catTick` so the jet never lags the moving ship.
  - The deck surface is raycast once per catapult / JBD / trap point (island hits rejected), and `JET_GEAR_DY` is measured from the extended GLB gear. Cat poses use `allyRoot.localToWorld()` with the measured deck height; `?debug&mission=NAVAL_BATTLE&warp=1` logs a deck gap under 0.3 m.
  - `build_bgm.py --manifest-only` rewrites the v2 manifest with per-track titles without re-encoding. `audio.js` shuffles each scenario with a Fisherâ€“Yates bag and crossfades to the next track on `timeupdate` / `ended`; `selectTrack`, `skip`, `setAuto` and `onBgmChange` drive the clickable `#bgmWidget` (`,` / `.` / `/` hotkeys) with a 1.2 s HUD toast. Every `?v=` tag bumped to s82a.

- [x] **Comms overhaul** *(build `s84a`, `src/radioQueue.js`, `src/radioScript.js`, `src/audio.js`, `index.html`)*
  - Voiced lines run through one pre-allocated headset chain: highpass â†’ lowpass â†’ soft-clip WaveShaper â†’ compressor â†’ ring split â†’ pan â†’ analyser â†’ `radioBus`, plus a forever-running gated static bed. `RADIO_CH` presets give AWACS cyan, WARDEN-2/3 green with Â±0.25 pan, and CRIMSON heavy drive with ring; PTT open/tail one-shots and the static gate are rendered once at init.
  - `radioQueue.js` owns all voice timing: eight reused slots, priority/category cooldowns, per-line TTL, a 0.35 s inter-line gap, and CRITICAL pre-emption of combat/ambient lines while STORY is never cut off. The single `-5 dB` music duck ramps over 0.2 s at open and 0.4 s at tail; the old 0.25 s duck is gone.
  - `#crtBox` is now a reactive Voice Box driven by `onTx`/`onIdle`: faction-coloured callsign, portrait, `#crtSub` subtitles, CSS static-flash transitions, and 24 analyser bars plus a time-domain polyline at 30 Hz. `?radiospam=1`, `?radiocrit=s` and `__audioDebug().radio` expose queue state. Every `?v=` tag bumped to s84a.

- [x] **Carrier deck spawn fix** *(build `s85a`, `src/combat.js`, `index.html`, `src/hud.js`)*
  - `carrierReady` resolves only after the GLB is mounted under `allyRoot`, scale-verified to 360 m, waterlined with the deck at `CARRIER_DECK_ASL = 19` m, ray-cast per track, and matrix-updated. `onCarrierMounted` re-snaps any live `HOLD`/`WAIT` launch; the load now kicks off at boot.
  - One visibility writer in `stepAlly` owns `C.carrierVisible` and `a.root.visible`, walks ancestors, and pins root Y to 0; the procedural hull stays hidden after mount. `enterCarrierLaunch()` is the only caller of `catEnter()`, used by start, `?catat`, trap turnaround and every replay/menu route; `cat.ph` is `WAIT` with a `DECK PREP` hint and frozen sim until ready.
  - `catSnapAll()` re-poses player, wingmen, JBD and steam from `catTrackWorld()`, with a 0.5 m per-frame re-snap guard. `?debug` logs `CARRIER_OK` / `CARRIER_FAIL` at mount, `catEnter` and `catEnter+1 s`, including a downward ray hit check against the carrier vs ocean. Every `?v=` tag bumped to s85a.

- [x] **Mission overhauls** *(build `s86a`, `src/missions.js`, `src/maps.js`, `src/world.js`, `src/combat.js`, `src/vfx.js`, `src/hud.js`, `src/cockpit3d.js`, `index.html`)*
  - Optional mission schema fields (`stages`, `weapons`, `enemyMsl`, `wingmen`, `ceiling`, `gatesPath`) with defaults; `AIR_SUPERIORITY` keeps its legacy flow untouched. `C.stage` + `spawnStage()` drive pooled ship/bandit stages with `SHIP_HP` / `SHIP_SCALE`, ship SAMs from CG/CV_FLAG only and pooled `vfx.aaTracer` deck AAA.
  - `GORGE` is now a winding 366 m-rim trench with a crater, exact analytic `heightAt`, `RIM_SITES`, `CEIL_*` warnings/SAM launches with terrain masking, 10 pooled canyon gates and a bunker kill that triggers `C.climb`, three weak chase SAMs and BASE RTB.
  - `ACE_DUEL` spawns exactly one `CRIMSON-1` with doubled HP, locks player missiles/SPW (`C.weaponsLock`), hides WARDEN flight and blocks bandit missile launches in favour of a pooled gun. `?stageat`, `?fortkillat` and `at=canyonlow` hooks expose the new flows. Every `?v=` tag bumped to s86a.

- [x] **Open-ocean ops + trench run fix** *(build `s87a`, `src/maps.js`, `src/world.js`, `src/missions.js`, `src/combat.js`, `src/hud.js`, `index.html`)*
  - `props` flags and `applyMapProps()` / `envProps` hide every AFB mesh, runway, building, radar and instanced tree on `STRAIT` / `CLOUD_ARENA` with visibility-only toggles; `ILS` displays, gates, assist and recovery chevron are gated by `ilsVisible()` (`ilsOnRtbOnly`).
  - `NAVAL_BATTLE` restores WARDEN flight with staged bandit ranges and damaged-escort targeting; `ACE_DUEL` adds per-second `DUEL_OK` asserts with all other spawn/refill paths disabled.
  - `CANYON_RUN` uses one metres source (`FT`/`CEIL_FT`/`CEIL_M`), an airborne centred spawn with a wall-clearance assert, an 8 s ceiling arm delay, a 3 s `RADAR LOCK — DESCEND!` countdown with hysteresis and the `SAM LAUNCH — CEILING BREAK!` banner. `RUNWAY_BBOX` keeps the AFB clear of the plateau. Every `?v=` tag bumped to s87a.

- [x] **Mission fix pass: carrier autoland, 25 km trench, rival duel** *(build `s88a`, v1.1.19, `src/maps.js`, `src/world.js`, `src/missions.js`, `src/combat.js`, `src/hud.js`, `index.html`)*
  - Open-ocean maps hide `envProps.lights`, the single Points object that carries every runway edge, threshold, ALSF/approach strobe, taxiway, tower, bridge and rig light. They also hide the AFB CIWS/SAM site meshes (`setBaseDefencesVisible`). On `GORGE`, a `uMask` light-shader bbox and `applyMapProps` hide island props inside the trench.
  - `CARRIER_AUTOLAND` is rewritten in the carrier ROOT frame:
    - **Phases:** CAPTURE (glideslope offset decays over T = |off|/60 s), GLIDE (3.5Â°), FLARE (last 90 m), TRAP (wire 2, smoothstep to 0 kt over 1.6 s), ROLLOUT, then `onCarrierTrap()` and `missionComplete('CARRIER')`, which opens `12_debrief`.
    - **Engagement:** pressing L while the prompt is up, or flying through the 400 m final gate (`autolandGateCheck`).
    - **Root causes fixed:** the old code used the GLB child's local quaternion as the deck frame and referenced an undefined `s` in FLARE. Staged RTB also never set `missionPhase = 4`, so a trap looped back to the catapult. `combat.allyHold` now stops the carrier turning 180Â° mid-approach.
  - `CANYON_RUN`:
    - **Steering:** the leftover "spawn grace" rail-steering block in `updatePhysics` is removed, so the player has full manual control.
    - **Spawn heading:** the old formula pointed the nose the wrong way laterally. The new `gorgeHeading(z)` fixes it.
    - **Trench:** it moved west, clear of the AFB, with a 1.5 km straight lead-in and sweeps whose minimum radius is about 790 m. Width is measured perpendicular to the curve (`gorgeDist`). The centreline is 24.8 km (2.6Ã— the old one).
    - **Gates and sites:** 15 gates are spaced by arc length (`GORGE_GATE_Z`) and face down the trench, with 15 matching rim SAM sites. The spawn (`GORGE_SPAWN_Z`) is at the mouth, before gate 1.
    - **Stage hygiene:** staged missions hide legacy jammers, skip JAM sectors, and never respawn the 40 s surface/task force.
  - `ACE_DUEL`:
    - **Ships:** `noShips` clears every surface ship and stops `updateFleet`. The legacy respawn that used to resurrect ships is gated by `stagedMission()`.
    - **CRIMSON-1:** 100 HP with no boss bar. It now uses gun-line threat reactions (max-G `EVADE_BREAK` or vertical `DUEL_LOOP`), gun-solution lead pursuit, and lead-aimed bursts with scratch vectors only.
    - **Guns only:** `gunsOnly` hard-blocks `launch()`, `fireSelected()`, `fireMissile()`, `fireAAM4()`, `fireQAAM()` and `dropBomb()`. It also zeroes ammo, keeps the pylons empty (`enforceStoreLock`, reload timers off), and stops the `10_last_stand` BGM override.
  - **Verification:** headless Edge with zero JS/WebGL errors.
    - **NAVAL:** `lights=0`, and both L and the final gate complete into the debrief at 0 kt.
    - **CANYON:** the spawn is OK, `kb=a` gives bank âˆ’104 and `kb=d` gives +84 with no auto-steer, and gate 1/15 registers.
    - **ACE_DUEL:** `DUEL_OK ships=0 aceHp=100/100`, 0 missiles after M/1/2, and an `EVADE_BREAK` when the player's nose is on the ace.
    - **Frame cost** (browser pane `__frame`): median 2.7â€“3.7 ms and p95 under 6 ms.

- [x] **Sea-skim rooster tail** *(build `s89a`, v1.1.20, `src/vfx.js`, `src/audio.js`, `index.html`)*
  - A 180-point pooled `vfx.spray` emits a V-shaped white-grey rooster tail at `y = 0.5` with size/alpha ramp and gravity/drag, plus a 48-instance additive `vfx.wake` foam trail. Both are preallocated and only upload while alive.
  - Skim intensity comes from altitude/speed with a dense boost below 15 m, hard-suppressed over land, above 40 m, on deck, during carrier phase/autoland and outside PLAY/FLY. Wingmen and the ace get a capped lighter wake.
  - `setSpray()` stores only scalars; the existing continuous mix ramps a filtered spray rush and low rumble. Subtle rotation-only camera micro-rumble scales with skimÂ². Every `?v=` tag bumped to s89a.

- [x] **CRIMSON guns-only duel fix** *(build `s90a`, v1.1.21, `src/combat.js`, `src/audio.js`, `index.html`)*
  - `launch()` now takes a `who` tag so guns-only blocks `MSL` only. CRIMSON-1 aims at a one-pass lead point with `ACE_BULLET_V`, fires 0.8â€“1.4 s bursts inside 1,200 m / 18Â°, and keeps firing through `DUEL_LOOP` / `EVADE_BREAK`.
  - Rounds are hitscan closest-approach tests against a 9 m player sphere with a 0.35Â° spread; every fourth round draws an `aaTracer`. Hits run `damagePlayer(4)`, `gunhit` audio and a small camera bump. Counters `C.aceRounds` / `C.aceHits` feed `DUEL_OK`.
  - `enemyGun()` / `gunhit()` reuse persistent nodes. `?duelbehind=s` places the ace on the player's six. Every `?v=` tag bumped to s90a.

- [x] **Heavy SAM barrage** *(build `s91a`, v1.1.22, `src/combat.js`, `src/vfx.js`, `src/hud.js`, `index.html`)*
  - Diagnosed the silent ceiling: `lastSam` (seconds) was compared to `CEIL_SAM_CD * 1000`, `CEIL_SAM_MIN_D = 1800` rejected every rim battery, and `surfaceSAM` capped all SAMs at 2. The new state machine uses a 38-site preallocated battery pool, a nearest-3 partial sort, 1.5 s WARN and rolling 4â€“6 salvos every 1.8 s with 0.12 s rail stagger.
  - 24 pooled SAMs fly with `SAM_V/SAM_G/SAM_LIFE`, PN guidance, flare/chaff decoys, terrain collision and a 0.6 s mask break. `vfx.samFx` draws 24 smoke ribbons and 24 additive motor glows; launch puffs reuse the steam pool.
  - Fort destruction starts a 12 s climb-out wall of 6â€“8 SAMs every 2 s from the crater ring plus the last four rim sites, then hands off to RTB. `?ceilat` / `?flareauto` and once-per-second `ceil` logs make the barrage observable. Every `?v=` tag bumped to s91a.

- [x] **Living battlefields** *(build `s92a`, v1.1.23, `src/ambient.js`, `src/atmosphere.js`, `src/vfx.js`, `src/combat.js`, `index.html`)*
  - New `createAmbient(THREE, env)` factory with `configure/update/reset/stats`: one prebuilt pool per effect, module scratch only and no `new` in `update`. Every mission switch calls `reset()` then `configure(id)` and only toggles flags / visibility, so AFB, canyon and ocean props never leak across maps.
  - Clouds drift on a wrapped wind offset (`vfx.setWind`), CLOUD_ARENA deck punch-through feeds `vfx.mist`, canopy rain and audio mist. `atmosphere.blendTo(name, secs)` adds STORM / SUNBREAK and phase/RTB-driven sky changes (golden hour on `11_rtb`, explicit `?tod=` suppresses blends). The ocean lerps `uSwell` calmâ†’storm and scrolls two normal octaves.
  - 96 instanced ship-wake quads from the ally carrier and all live fleet vessels, a 40-point flak pool with orange-coreâ†’grey-puff shader, and 6 persistent oil-fire columns (32 points each) claimed from `env.onSmoke` on ship damage/sinking and fort kills. CANYON gets 12 sweeping searchlight cones plus 10 gorge mist sprites; AIR SUPERIORITY gets spinning radar dishes, 16 blinking beacons and 4 racetrack jets with pooled ribbon contrails and distant tracers.
  - `?ambient=0` kill switch, once-per-second `ambient` log and ambient data in the warp dump. Headless checks confirm sky/flak/wakes/search/beacons/traffic counts, full reset on mission switch, zero errors and ~8 ms p95. Every `?v=` tag bumped to s92a.

- [x] **Reliable scenario score** *(build `s93d`, v1.1.24, `src/audio.js`, `index.html`)*
  - Fixed the AudioContext unlock / manifest race: `switchTo()` now defers into `pendingScn` before `init()` has built the decks, the manifest fetch flushes that pending scenario, and `armUnlock()` retries on every gesture until a real `playing` event confirms playback. `playDeck()` handles `NotAllowedError` with a gesture re-arm and other errors with a capped 1.5 s retry; the same-scenario guard no longer skips a paused deck.
  - One-time key audit checks the 12 `BGM_KEYS` against the manifest, the resolver and `MISSIONS`; unknown keys log and fall back to `03_air_superiority`. `setAuto(true)` is re-applied at mission start and on returning to STANDBY (`?bgmtrack=` keeps MANUAL), and `lastMusicKey` force-switches on every app/flight/cat/autoland/RTB/phase/mission transition.
  - Deck state is committed only on the `playing` event, so the `#bgmWidget` title always equals `audio.bgm.title`. Headless checks confirm a fresh load + first gesture starts `01_hangar` un-paused, each mission's exact scenario (including catapultâ†’`06_strike`/`08_crimson_duel`, `11_rtb` and `12_debrief`), `bgm keys ok=12`, zero JS errors and ~5â€“8 ms p95.

- [x] **WARDEN three-state orders + wounded wingman save** *(build `s95c`, v1.1.25, `src/combat.js`, `src/hud.js`, `src/telemetry.js`, `index.html`)*
  - `G` now cycles `C.wingOrder` through FORM / COVER / FOCUS with a 2 s order badge and `onWing` + `ON_WINGMAN_ENGAGE` feedback; `1`/`2`/`3` remain weapon keys. COVER scores rear-hemisphere lockers at 0.35Ã— range, FOCUS shares `C.designated` with a 400 m bracket for WARDEN-3 and drops to COVER on `NO DESIGNATION`. Targets are re-picked every 0.5 s into `w.tgt`.
  - WARDEN-2 can enter LIMPING in AIR_SUPERIORITY / NAVAL_BATTLE (low HP or mid-stage): 220 kt low-G RTB to the carrier stern or RWY 36, grey pooled smoke ribbon, two assigned pursuers (revived from the bandit pool if needed) that steer toward her. Clearing them fires `WINGMAN SAVED +1500` as a STYLE entry, event banner, `WING_SAVED` telemetry and a thank-you call; losing her is a plain loss.
  - `?wingorderat=s:n` / `?limpat=s` and `__az.setWingOrder` / `__az.triggerWoundedWingman` make both deterministic. Headless checks confirm G cycling, COVER/FOCUS target sharing, smoke + 2 pursuers, SAVE reward and no limp in ACE_DUEL / CANYON_RUN, with zero JS errors and unchanged frame cost.

- [x] **Solar IR blind + Vulcan missile intercepts** *(build `s96e`, v1.1.26, `src/combat.js`, `src/hud.js`, `index.html`)*
  - `env.getSunDir` follows the live atmosphere sun; with the nose within 12Â° of it, clear skies and no cloud deck, `C.sunT` charges over 0.5 s. An IR seeker whose LOS to the player is within 18Â° of the sun then drops lock (`m.lostTrack`, `m.target=null`) for +350 with a radio call, event, `lockdrop` SFX and 3 s cooldown. RADAR/SAM and already-lost missiles are skipped; NIGHT disables it.
  - Player gun rounds now test a swept segmentâ€“segment closest approach against each active enemy missile's `prevPos â†’ pos` path (7 m). A hit detonates the missile safely, clears the warning/RWR, awards +800, fires slow-motion (with its own cooldown), a banner and a callout. All scratch vectors are preallocated.
  - `?sunat=s` / `?irmslat=s` / `?mslshootat=s` plus `__az.launchIR` / `__az.spawnHeadOn` / `__az.aimAtSun` make both deterministic; warp logs and `stats().sun` / `stats().intercepts` expose the state.

- [x] **Linked weak points + flagship VLS telegraph** *(build `s97d`, v1.1.27, `src/combat.js`, `src/vfx.js`, `src/audio.js`, `src/hud.js`, `src/ambient.js`, `index.html`)*
  - CG and CV_FLAG ships carry a destructible RADAR / AA mast (pooled virtual ground target, `â—‡ AA` HUD box). Gun, missile and bomb hits route to `hitSub()`; at zero HP the ship's flak, CIWS and SAM timers stop, an explosion/smoke column and `AA DISABLED +600` fire, and ambient flak density drops via `combat.activeAAShips`.
  - Canyon rim sites have their own HP pool and virtual targets; destroyed sites flip `SITE_ON`, stop searchlights and are skipped by the barrage picker. Once both sites in a sector die, that sector fires nothing and neighbours fire half-size volleys. State is fully restored on mission switch.
  - The flagship telegraphs a salvo with a 3 s red charge beam and rising tone, then fires six spread VLS missiles that fly straight for 1.2 s before homing. Destroying the mast cancels it. `?subkillat=s` / `?sitekillat=s:i` / `?flagsalvoat=s` and matching `__az` helpers make all three deterministic.

- [x] **Carrier wave-off ambush + supersonic tower buzz** *(build `s98b`, v1.1.28, `index.html`, `src/combat.js`, `src/hud.js`, `src/audio.js`, `src/vfx.js`)*
  - A once-per-sortie 25 % roll during autoland GLIDE aborts cleanly (pose and velocity preserved, `allyHold` released, gear up, burner + pitch assist), switches BGM to `10_last_stand` via the `ambush` music-key component, and spawns 2â€“3 pooled ambush bandits ahead of the bow with a CRITICAL radio call and red banner. Clearing them restores `11_rtb`, scores +800 and re-enables the autoland prompt.
  - Mach â‰¥ 1 sweeps the jet's frame against the carrier island, AFB tower and live bandits with pooled `Float32Array` anchors + per-enemy cooldowns. Hits fire a `TOWER BUZZ +500` / `SONIC PASS +250` banner, camera impulse, mach-cone pulse, persistent sonic-boom nodes and a callout. A 10 s cooldown prevents farming. `?waveoffat=s` / `?buzzat=s:kind` make both deterministic.

- [x] **Instanced agile drone swarm** *(build `s99a`, v1.1.29, `index.html`, `src/combat.js`, `src/hud.js`, `src/audio.js`)*
  - Separate pooled archetype: one `InstancedMesh` delta-wing body + additive engine-glow `Points`, typed-array flight state, in-place bounding-sphere culling, zero per-frame allocations. 6â€“8 drones spawn on mid/late AIR SUPERIORITY waves, NAVAL stages 2/3 (half carrier-anchored) and every 75 s in FURBALL; never ACE_DUEL or CANYON_RUN. They stay out of `enemies`, the debrief map and RWR.
  - Boids/orbit steering with periodic peel-off pursuit and short cannon bursts. Virtual `DRONE_TGT` lock objects feed the normal seeker and 4AAM (0.6Ã— lock time); a single Vulcan round or missile kills one, with 12 m splash, `SWARM KILL +200`, `QUAD SPLASH` and a `SWARM CLEARED +1000` finish. HUD draws compact `â—‡` markers, an amber `SWARM n/8` bracket, radar diamonds and inbound/cleared banners; a persistent sawtooth hum tracks the nearest drone.
  - `?drones=1` / `?droneat=s`, `__az.spawnDroneSwarm()` / `__az.killDrone(i)`, once-per-second warp logs and `stats().drones` make headless verification deterministic.

- [x] **Wingman roles + canyon trench shortcut** *(build `s99b`, v1.1.30, `src/loadout.js`, `src/combat.js`, `src/maps.js`, `src/world.js`, `src/hud.js`, `index.html`)*
  - Persistent `angelsZero_wingRoles` ({w2:'CAP', w3:'STRIKE'}), STANDBY role row with sub-cursor pills and roster tags, `?roles=CAP,STRIKE`. STRIKE wings prioritise subsystem masts, ships and (in CANYON) rim SAM sites, with a 6 s rear-hemisphere self-defence override and CAP fallback; FORM/FOCUS orders still override the role. SEAD shots use the trench centreline, a 15Â°/2.5 km firing gate and a 12 s cadence.
  - `GORGE_SC_*` constants define a 2.2 km straight ravine across the first S-bend: analytic carve in `gorgeHeight()` (one height grid, no extra draw calls), one three-instance jittered rock arch with three AABB blockers, rim sites inside the ravine suppressed. Swept z-plane state machine (`IDLEâ†’INâ†’ARCH_OKâ†’DONE`) awards `TRENCH SHORTCUT +1200`, skips gates 5..5 and calls WARDEN-2; flying high or wide fails cleanly.
  - `?at=scmouth` / `?alt=200` headless poses, `sc` logs and `stats().shortcut` / `stats().style.wingRoles`. Cached GORGE rebuild stays under 15 ms because the carve costs only a few scalar ops per grid cell.

- [x] **Hot scramble, broken-wing recovery, CRIMSON-1 intrusion** *(build `s9ba`, v1.1.31, `index.html`, `src/combat.js`, `src/audio.js`, `src/profile.js`, `src/hud.js`)*
  - NAVAL catapult launches roll a 30 % hot scramble (`?scramble=1/0`): two inert pooled raiders sweep the bow on carrier-local paths, CIWS tracers and water splashes fill the hold, and `catRelease()` hands them over to normal ENGAGE AI with weapons live. No player damage or collision while `cat.ph` is HOLD/LAUNCH.
  - Sticky `C.bw.eligible` from `syncEngineFlags()`; `?engoutat=s:L` forces it. A manual carrier trap or smooth runway touchdown awards BROKEN WING +2000, sets a permanent profile badge, and puts a â˜… cell on the debrief.
  - `C.intr` CUT/DUEL/DONE state holds stage advance + RTB, plays `audio.bgmCut(1.5)` with radio static, spawns a single diving CRIMSON-1 with combo â‰¥ 4 (or `?intrusion=1`), forces `08_crimson_duel` through `musicCtx.intrusion`, holds the wingmen in FORM, and unlocks RTB on kill or long-range disengage. `?intrusionat=s` forces it deterministically.

- [x] **Friendly ESM zones + cloud icing** *(build `s9bc`, v1.1.33, `src/combat.js`, `src/hud.js`, `src/canopyglass.js`, `src/cockpit3d.js`, `index.html`)*
  - Carrier (NAVAL) and orbiting AWACS (AIR_SUPERIORITY) broadcast a 4.5 km friendly ESM umbrella with hysteresis. Inside: 1.6Ã— lock build, 1.3Ã— missile reload and 1.25Ã— turn on missiles latched at launch. Cyan radar ring, ESM ACTIVE badge and VSD circle show coverage; ACE_DUEL / CANYON never get it.
  - `state.cloudIce` builds in thick cloud (0.45 threshold), melts in clear air and twice as fast on burner. At high ice, pitch/roll authority fades 20 % and drag rises 12 %; `[ ICING ]` banner, master caution, radio call, canopy frost shader and a cached HUD frost vignette make the risk legible. `?esm=0`, `?awacsat=s`, `?icecloud=s`, `?ice=v` provide deterministic tests.

- [x] **Ace Combat feel pass** *(build `s9be`, v1.1.34, `index.html`, `src/combat.js`, `src/hud.js`, `src/audio.js`, `src/vfx.js`, `src/cockpit3d.js`, `src/canopyglass.js`)*
  - Hold-T padlock springs the chase / cockpit camera onto `C.designated` with neck limits, releasing cleanly without disturbing freelook or the missile cam. Y cycles radar zoom 4/10/25 km with persistence; both views and the F1 sheet show the new keys.
  - Pooled in-world `HIT` / `DESTROYED` stamps (0.8 s, 8 slots) fire from `env.onHitStamp`; `C.shootCue` lights `[ SHOOT ]` on rear/head-on aspects with a 0.25 s hold.
  - `env.onMissionUpdate` + `audio.bgmDip(1.2)` + `hud.radarPulse()` + `[ MISSION UPDATE ]` banner fire on stage escalation, flagship spawn, ambush and intrusion CUT with a 4 s cooldown. Cloud-deck punch flashes the canopy and boosts mist; contrails ease in above 12,000 ft on the existing pooled ribbons (no new draw calls).

- [x] **Pilot G-physiology overhaul** *(build `s9bf`, v1.1.36, `index.html`, `src/audio.js`, `src/hud.js`, `src/nvg.js`)*
  - Replaced the strain model with 0.08 s low-passed G input, 4.8 G onset, power-law build, 0.4 s hold and faster unload drain; continuous `pilotK` heaviness (0.65 onset) and explicit 1.8 s G-LOC with auto-unload, wake strain cap and recovery timer. `?gforce=G:s` / `?nogloc` drive deterministic tests.
  - Cockpit head is a critically damped spring sinking under positive G, floating under negative G, leaning with roll rate and trembling above 6 G; chase FOV tightens with strain.
  - Procedural AGSM breathing, G-suit hiss, 110–165 BPM lub-dub heartbeat, tinnitus and wake gasp are built once and look-ahead scheduled on a body bus that bypasses the hearing tunnel; tunnel LP and a separate BGM gain duck under strain and blackout.
  - Final `gPass` in the nvg composer: desaturation, heartbeat-pulsing tunnel, blackout, red negative-G tint and a staged grey-then-colour wake; HUD dims and jitters with strain. Pass is disabled at rest.

- [x] **DLZ / TTI / JHMCS** *(build `s9c0`, v1.1.37, `src/combat.js`, `src/hud.js`, `src/cockpit3d.js`, `index.html`)*
  - `C.dlz` computes Rmin / Rne / Rmax / Vc from aspect and closing speed each lock frame; the HUD draws a vertical DLZ bar with no-escape bracket, range caret and VC in knots. Active player missiles carry `m.tti`; `C.tti` / `C.pitbull` drive the countdown and PITBULL call (2 s cooldown). `stats().dlz` / `.tti` exposed.
  - Free look lives in the `freeLook` global in `index.html` (there is no `src/freelook.js`); its yaw/pitch are converted to a scratch world look vector and passed to combat via `env.getLook`. QAAM can acquire inside a 12° helmet cone out to 65° off-boresight with a 1.2× lock penalty; other weapons stay boresight-only. `drawJHMCS()` renders the 90 px helmet ring, KCAS/ALT flanks, look heading, nose reference, OB readout and target diamonds.
  - `?freelookat=s:yaw,pitch` and `?dlz=1` provide deterministic verification; cockpit MFD signature includes DLZ/TTI buckets.

- [x] **Cockpit battle damage + VWS** *(build `s9c2`, v1.1.38, `src/canopyglass.js`, `src/hud.js`, `src/audio.js`, `src/combat.js`, `index.html`)*
  - Damage raises `C.crackLevel` monotonically; `canopyglass.js` repaints a 512² seeded spiderweb crack CanvasTexture only when level/seed change, with `uCrack/uCrackK` and oil streak. `env.onPlayerHit` calls `hud.glitch(0.55)` for jitter, alpha flicker and tear bands; low HP adds timed flickers from a fixed interval table. Hydraulic damage drives a 380 Hz whine gated by stick load.
  - `audio.js` adds a dedicated VWS bus and priority/cooldown router with buffer → speech → dual-tone chime fallbacks. Triggers in `stepSim` cover PULL UP, OVER G, BINGO FUEL, CHAFF_FLARE, ALTITUDE and ENGINE_FIRE (from combat), each syncing `hud.setAlertState`. `?dmgat`, `?hydat`, `?vwsat`, `?vws`, `?fuel` provide deterministic tests. Pit stop / mission reset clear cracks, glitch and alert overrides.

- [x] **Burner thump, weapon glare & supersonic quiet** *(build `s9c4`, v1.1.39, `src/audio.js`, `src/cockpit3d.js`, `src/vfx.js`, `index.html`)*
   - `AB_EDGE` rising edge in `updateThrottle()` fires `onBurnerLight()` once per engagement with a 1.2 s cooldown: `audio.burnerThump()` retriggers persistent 55→28 Hz sub + 350→1200 Hz whoosh envelopes, `blastShake` plus a 0.15 s forward `abKickT` camera jolt, and `vfx.burnerFlash(1)` scales the nozzle plume 1.35x for 0.2 s. Suppressed during catapult HOLD/LAUNCH. `?abat=s` steps across the detent (on / off / on) to exercise the thump and the cooldown skip.
   - Cockpit weapon glare is emissive-only on `shieldMat`/`bowMat` (`cockpit.flash(kind)`, 0.08 s decay, amber for the gun every 3rd round, white for player missiles) — no new PointLight, so light count and shader programs never change. `vfx.launchPuff` is one pooled 24-particle `Points` with typed arrays and 4 logdepth chunks, spawned at the player's rail with a spiral drift that falls behind the jet. `?gunat=s:dur` / `?mslat=s` drive deterministic tests.
   - `transK = smoothstep(M,0.96,0.995)*(1-smoothstep(M,1.01,1.03))` drives an 18+9 Hz shudder (plus cockpit roll micro-jitter) and transonic shear / 90 Hz buffet audio. `superK = smoothstep(M,1.03,1.05)` folds a 35 % cockpit wind cut into the computed gain targets (never re-multiplying live AudioParams) and triggers `vfx.machPulse(1)` on the rising crossing with a 5 s cooldown. High-AoA wing rock (20–24 deg, 2–4 deg amplitude, 0.55 Hz) is a rate-only perturbation in `updatePhysics()`, bounded, damped to 30 % by opposing roll stick and excluded in autoland / catapult / G-LOC. `?spdhold=m`, `?aoahold=deg:s` and `__az.ab/trans/wr/glare` expose headless checks.
   - Verified headless: one thump + one `cd skip` with `audio.burnerCount===1`; Mach 0.99 → `transK=0.90` / `quiet=1`, Mach 1.08 → `superK=1` / `windQuiet=0.65`; 22 deg AoA → ±3 deg rock at 0.55 Hz dropping to ±0.9 deg with roll input and no stall; gun/missile glare spikes then returns to 0; 11 lights / 98 programs / 1101 draw calls unchanged across flashes; 0 JS/WebGL errors.

- [x] **Crippled bandit tells + tactile touchdown / catapult squat** *(build `s9c6`, v1.1.40, `src/combat.js`, `src/vfx.js`, `src/audio.js`, `src/gear.js`, `index.html`)*
   - `DMG_SMOKE_FRAC=0.5` gates a fixed 8-ribbon `vfx.dmgTrails` pool (dark `#2a2622`/`#5a5550`, repaint-on-emit) plus duty-cycled hot-orange sparks reused from `aaTracer` (`SPARK_RATE=6`, `SPARK_LIFE=0.35`, `SPARK_V=40`, `SPARK_DUTY=0.35`). `e.dmgTrail` ownership is released on kill, heal, pool reuse, `resetAI`, `destroyEnemy`, `clearTrails()` and mission reset; `stats().dmgTrails` reports active / peak. `?dmgenemyat=s:frac` sets the nearest bandit's HP fraction.
   - Touchdown: `vyPrev` is captured before `updatePhysics` zeroes it; `onTouchdown(sink, surface)` kicks an underdamped oleo spring (`STRUT_K=90`), scales `blastShake`, fires `audio.tyreChirp` (two main-gear bursts + carrier deck ring) and arms the nose slap. Pitch falling under 2 deg triggers `audio.noseThump`. `strut.y` offsets the camera and `landingGear.compress()` lifts the wheels into their struts. `?tdat=s:vy` forces a contact; plain `at=` teleports (vyPrev 0) stay silent.
   - Catapult: `catEnter()` fires `onCatHold()` (persistent-node `shuttleClank()` + `squat.target=0.12 m`); `catFire()` rebounds in 0.08 s, zeroes `vibK` and lifts the camera. `catTrackWorld/Quat` apply `-squat.y*0.5` drop and a `atan(squat.y/5.6)` nose-down lean; the armed hold ramps a 23 Hz cockpit vibration. `enterCarrierLaunch()` clears both springs.
   - Verified headless: bandit tell claims/releases cleanly with sparks active; 15 mission resets keep textures flat at 74 and per-mission geometry/programs stable; `?tdat=3:4.5` chirps + dips + slaps while `at=airbase` alone is silent; `?catat&catlaunchat=6` in NAVAL_BATTLE holds `squat.y=0.120`, clanks, rebounds and reports `CARRIER_OK`; 0 JS/WebGL errors.

- [x] **F100 twin-engine DSP overhaul** *(build `s9d0`, v1.1.41, `src/audio.js`, `index.html`)*
   - Replaced the flat turbine/whine/AB layers with one persistent graph built entirely in `init()` (112 nodes logged once): asymmetric spool `rpmL/rpmR` (`RPM_IDLE=0.28`, `TAU_UP=1.8 s`, `TAU_DN=2.4 s`, right engine +7 cents / +1.5 % lag), a 3-harmonic triangle + Q18 noise-band choir per engine/view, and 30 Hz-throttled `setTargetAtTime` frequency updates gated at 0.4 % change. Afterburner `abK` has its own 0.35 / 0.6 s smoothing and never drives rpm past 1.
   - Waveshaped exhaust (`CURVE_EXH` tanh 2.4 / 3.2, `oversample=2x`) with an audio-rate two-sine combustion flutter (0.7 Hz wobble), a +9 dB duct formant at 240+280·rpm, threshold-shaper AB crackle (`CURVE_CRACK`) and a shared 41 / 43.5 Hz twin-beat + resonant 36-85 Hz sub. A dead engine drops its target to `RPM_WINDMILL=0.08` and kills the beat. Light-off uses the new `CURVE_BURST` pressure transient plus a 58→24 Hz sub punch through the body bus.
   - Fixed cockpit/chase crossfade (`ckMixG`/`chMixG`, 0.25 s): 650 Hz muffled aft roar + 70 Hz body peak / 120 Hz shelf + close intake whine + ECS hiss in the cockpit; highpassed/shelved open roar, full crackle and ±0.3 stereo pans outside. `engComp` (-18, 3:1) and fixed trims hold ~-18 dBFS chase / ~-22 dBFS cockpit at full AB; `engOut` mutes with 0.3 s when not flying. `?engsweep=s` logs rpm/f0/abK/RMS once a second; `?engoutat=s:L`, `?ab` and view toggles verified with no non-finite AudioParam warnings.
   - Headless: rpm lags the throttle (0.32 after 1 s, 0.93 near the AB peak), f0 stays 684-2881 Hz inside 650-3400, exactly one thump per AB entry (`burnerCount=1`), full-AB RMS -19.6 dBFS chase / -22.4 dBFS cockpit, 0 JS/WebGL errors and ~58 FPS. All AudioParams are automation-only; no node is created in `update()`.

- [x] **Transonic / audio / G-physiology regression sweep** *(build `s9d5`, v1.1.42, `src/audio.js`, `index.html`)*
   - Transonic shake `TRANS_SHAKE 0.035 -> 0.0035` with an explicit `TRANS_SHAKE_CP=0.0012` and cockpit roll jitter `0.3 -> 0.05 deg`; 18+9 Hz and the Mach 0.96-1.03 window are unchanged. Worst-case amplitude at `transK=1` is 0.0035 rad. Debug `trans k=... shake=...` log added.
   - Replaced the threshold `CURVE_CRACK` with `CURVE_SIZZLE` (`0.55+0.45*tanh(1.6x)`, never zero), added `crackModLP` 45 Hz smoothing and a soft `CURVE_EXH`-shaped 2.2-9 kHz audio path; `crackG` now peaks at `0.12*abK^1.4` with the 0.3x cockpit trim. No on/off pops.
   - Built a persistent 28-entry `N.silenceParams` list at init; `audio.silenceFlight(tc)` cancels + ramps all of them (engine out, choir, crack, sub, lock/growl/alert/tinnitus/flag/drone, breath/hiss/gasp/heart/hyd/wind/buffet/groan/lug) and sets `N.flightSilent`. `E.out` and every choir bus/harmonic start at `gain(0)`; `update(p)` returns on `!p.flightActive` before any flight write, while BGM/radio/UI keep running. index.html calls `silenceFlight()` on PAUSED / DEBRIEF / MENU transitions and on the gesture unlock when not PLAY.
   - Fixed the silent body bus: white/pink/brown buffers are now created before `pNoise` (`N.whiteBuf` no longer undefined), and `pNoise -> breathEnv -> breathG`, `hissEnv -> hissG`, `gaspEnv -> gaspG` split retriggered envelopes from per-frame level gains. `set()` now caches targets on `param._t` and skips writes under 1e-3. `gmix` exposes `breathEnv`, `breathNext`, `tNow`, `whiteOK`; AGSM starts at 4 G, hiss re-arms at 3.7 G, heartbeat from S 0.25.
   - `G_ONSET 4.8 -> 4.0`, `G_RATE_A 0.106 -> 0.112`, `G_RATE_P 0.69 -> 0.62`, visual onsets moved to desat 0.12-0.55 / tunnel 0.20-0.98 / contrast 0.25-0.9. Headless: 6 G gives S 0.105 at 0.7 s and 0.415 at 2.5 s with no blackout, breathEnv pulses to 0.43 and whiteOK is true, crackG 0.12 at full AB, menu E.out/choir/crack all 0 with rms 0, 0 JS/WebGL errors.

- [x] **Mid-sortie carrier autoland restore** *(build `s9d9`, v1.1.43, `index.html`, `src/hud.js`, `src/combat.js`, `src/audio.js`)*
   - `autolandPrompt()` no longer requires `combat.rtb.on` or a mission-phase; it checks a live carrier (`combat.ally.root`, `carrierVisible !== false`), `sortie.active`, PLAY/FLY, no carrier phase / ambush / active autoland, a free catapult (`'NONE'` **or `'AIRBORNE'`** — the latter persists after a cat shot), XZ distance to the stern `< AUTOLAND_R=3500` and being aft of the bow. `ilsVisible()` derives from the prompt / active autoland / carrier RTB with a 1 s latch and the `AUTOLAND_R+500` hysteresis; `?alprompt=1` logs each state change.
   - `engageAutoland()` only stores `rtbAtEngage` for logging and never writes `missionPhase` or `rtb`. New shared `finishCarrierTrap(src)` handles both paths: RTB (`rtbOn() && missionPhase===4`) awards the trap and completes the sortie; mid-sortie calls `onCarrierTrap({midSortie:true})`, `pitStop()`, tops fuel to 13455, clears allyHold / autoland / vyPrev, sets `pitstopCat`, then reuses `enterCarrierLaunch(mission())` for WAIT → DECK PREP → HOLD with the turnaround radio call and `REARMED · REPAIRED · REFUELED` banner. Manual deck turnarounds call the same helper. `getMusicCtx().pitstop` drives `02_catapult` and clears on cat release.
   - HUD prompt pill now uses `A.autolandPrompt()` directly (no separate RTB / distance / phase logic); the KeyL handler already used the same predicate. `hud.promptText` exposes the drawn pill for headless assertions.
   - Headless: NAVAL_BATTLE mid-sortie autoland logs `trap finish src=AUTO mid=true`, `pitstop rearm=ok hp=100 fuel=13455`, `pitstop cat → hold`, leaving `app=PLAY / phase=1 / rtb=null / cat=HOLD`; RTB logs `mid=false` then `sortie CLEARED` / DEBRIEF; CANYON_RUN never prompts; HUD pill equals `autolandPrompt()`; 0 JS/WebGL errors.

- [x] **Wingman flight physics + Ace BFM** *(build `s9dd`, v1.1.44, `index.html`, `src/combat.js`)*
   - Added shared `combatSys.flyBTT(a, desDir, desSpeed, dt, lim)` in combat.js: bank slews at `rollRate`, lift rotates fwd toward the demand (max G), first-order throttle with `acc`/`accAB`/`dec` and induced drag, 2 s terrain look-ahead with `minAGL`, attitude rebuilt from fwd + bank in scratch `Matrix4`, then vel/pos integration. No node or vector allocations.
   - Removed `w.pos.lerp` / `w.quat.slerp` / `w.vel.copy(state.velocity)` from index.html. Each wingman now carries `fwd/speed/bank/gNow/ab/mode/breakT` and calls flyBTT every frame with `WING_LIM` (7.5 G, 150 deg/s, 160-330 m/s, 120 m AGL) or `WING_LIMP_LIM`. Modes: FORM slot convergence with speed-matching and bank match inside 40 m, BREAK (1.2 s, 60 deg off-plane at 6 G), FOCUS/COVER lead pursuit with a 300 m overshoot lag inside 250 m, REJOIN until 400 m. Catapult release seeds fwd/speed/bank from the track; limp-home keeps its own gentle low-G profile. `?wingphys=1` logs mode/v/g/bank/slotErr/jump once a second.
   - Ace BFM (CRIMSON-1/2, SOL-1): `HIGH_YOYO` CLIMB(2.4 s, 30 deg) -> ROLL(0.6 s, 160 deg) -> DIVE lead pursuit on overshoot with an energy check; `BREAK_SCISSORS` on a rear-hemisphere threat (alternating +/-135 deg banks every 1.2-1.6 s at 8.5 G, 230 m/s) with a Cobra drag trap below 270 kt; TTI-windowed (0.6-2.2 s) IR flares / radar chaff with a true-beam notch bonus; two-ace bracket offsets (+/-35 deg) beyond 1500 m and DRAG/BAG role swaps. `C.acePair` set by `spawnAceFlight`. Debug hooks `?aceonsix`, `?acemslat`, `?yoyoat`, `?pairat`, `?wingphys`.
   - Headless: wingman jumps 0.000 m/frame, speeds inside limits, banking and BREAK -> FOCUS -> REJOIN transitions logged, 0 JS/WebGL errors. Ace yoyo CLIMB and defensive states exercised without errors.

- [x] **Playtest stability, audio & wingman fixes (`v1.1.45` spec sweep)** *(build `s9de`, v1.1.45, `index.html`, `src/combat.js`, `src/audio.js`, `src/radioScript.js`, `src/radioQueue.js`, `src/patchnotes.js`)*
   - **C1 (`ACE_DUEL` 1v1 isolation):** `combatSys.init()` skips fleet/wave/surface spawns when `noShips` or staged missions are active (`stageClear()` requires `aceFlightDone` + `hadAce`; `updateMissionPhase()` guards `stage >= stages.length`). Verified `DUEL_OK ships=0 aceHp=100/100`.
   - **H1–H4:** Replaced `audio.suspend()` with `silenceFlight()` + `resume()` in `endSortie`/`debriefToBriefing`/`pauseSim` (BGM plays through pause); initialized `N.flightSilent = true`, moved `N.buffFGain` before `N.silenceParams`, split `N.transBufVCA` upstream of the 9 Hz LFO so cold-menu RMS drops below `0.0001` (`rmsNoMusic=0`); removed FOCUS->COVER reset in `pickWingTarget` (`1 -> 2 -> 0`); synced `w.pos`/`w.vel`/`w.quat`/`w.mesh` on every catapult frame and replaced the 60 m hard snap in `flyBTT` with smooth deck climb-out (`<= 3.2 m`/frame).
   - **M1–M4:** Scheduled `o.g.gain.setValueAtTime(0, now + XFADE + 0.01)` on the audio clock (removing the `setTimeout` `.value = 0` assignment that threw `NotSupportedError`); lowered `G_ONSET = 3.2`, saturated `pitchIn0`, and added `AOA_COUPLE * alpha` CAS feedforward (`gammaDotEff`) so a full 300 m/s / 3,500 m pull reaches `> 7 G` with breathing and greyout; gated wave-off rolls to `GLIDE` in `[600, 1200] m` astern; hoisted `gforce=G:s` and `carrierfinalat=s` into `stepSim` so both work with or without `warp`.
   - **L1–L4:** Re-applied `?alt`/`?spd` after runway spawn/`placeOnRunway`; hoisted cockpit head-roll `AX_Z`; marked 7 missing radio clips `file: null` with text fallback (`0` 404s); bound `Escape` in `DEBRIEF` to `debriefToBriefing()`.

- [x] **Playtest follow-ups: ACE_DUEL kill completion, runway rotation, wave-off climb & pause on hide (`v1.1.46`)** *(build `s9df`, v1.1.46, `index.html`, `src/combat.js`, `src/patchnotes.js`, `PLAN.md`)*
   - **B1 (`ACE_DUEL` kill completion):** `stageClear('ACE')` checks `aceFlightDone && C.acePair?.length && C.acePair.every(id => !enemies[id] || !enemies[id].alive)` independent of `destroyEnemy()`'s `e.aceFlight = false` reset, and resets `C.acePair = []` alongside every `aceFlightDone = false`.
   - **B2 (`updateGround()` keyboard rotation):** Extracted shared `updateStickAxes(dt)` for air and ground paths so `W`/`S`/Arrow pitch rotates cleanly past `120 kt` without engaging `wheelBrake` (Ctrl/B only) and blends seamlessly across lift-off.
   - **B3 (wave-off full-AB climb):** Removed the `waveoff.st = 'AMBUSH'` overwrite in `triggerWaveOff()`, kept `gearAutoLock = true` + go-around stall protection during `ABORT`, forced AB in `updateThrottle()` + combat music context during abort, and replaced open-loop `rotateBody` with closed-loop pitch-attitude hold (`12 deg` in `ABORT`, `4 deg` in `AMBUSH` until pilot stick/roll override or ambush clear).
   - **B4 (`visibilitychange` auto-pause):** Added `if (appMode === 'PLAY') pauseSim()` when `document.hidden` and gated `simTime += dt` on `appMode !== 'PAUSED'` so backgrounded sorties freeze cleanly.
   - **L1–L2:** Added `ceilThrustK(alt)` tapering thrust 92 % across `14,000..20,000 m`, and added a debounced `ROTATE — PULL UP (S / MOUSE)` callout above `145 kt` on takeoff roll.

- [x] **Replay wave reset & debrief radio fixes (`v1.1.47`)** *(build `s9dg`, v1.1.47, `src/combat.js`, `src/audio.js`, `src/radioQueue.js`, `index.html`, `src/patchnotes.js`, `PLAN.md`)*
   - **R1 (`resetWaves()` on replay/relaunch):** Added `resetWaves()` and `wavesFresh` guard in `src/combat.js` (clearing `e.aceFlight` in `clearAce(e)`, resetting `C.wave`/`C.phase`/`C.ace`/`aceFlightDone`/`C.acePair`, calling `spawnWave()` + `spawnSurface()` for non-FURBALL, updating `waveKill0` after respawn), called from `init()`, `configureMission()` else-branch, and `resetPlayer()`, and cleared `wavesFresh` in `resetMission()`. Verified across fresh boot, `replaySortie()`, `debriefToBriefing()` -> `launchSortie()`, x3 replays, `FURBALL`, and staged relaunches.
   - **Follow-up leak fix (`v1.1.48`, build `s9dh`):** `spawnSurface()` now calls `disposeGroup()` on every retired SAM / AAA site (geometry + per-site materials) before rebuilding, so `resetWaves()` on each replay / mission switch no longer leaks ~91 geometries (6 replays: 458 → 458 geometries, was 522 → 1095). Also covers the 40 s ground-target respawn.
   - **R2 (debrief radio cut & pump):** Updated `audio.stopRadio(fade)` to fade voice + static gain and restore ducking; added `gap` support to `rq.clear(gap)` and `radioReset(gap)`; cut live flight radio before queuing `ON_MISSION_CLEAR` in `endSortie()` (silent on `FAILED`), added defensive `radioReset()` in `debriefToBriefing()`, and pumped `radioPump()` when `appMode === 'DEBRIEF'`.

- [x] **Storm Realism Pass — step 2: wet deck & cockpit emissive contrast (`v1.1.76`)** *(builds `s9em` combat/cockpit3d, `s9en` wetdeck/patchnotes; `src/wetdeck.js` new)*
   - **Wet deck:** `createWetDeck(THREE, { camera, debug })`, bound from `combatSys.onCarrierMounted`. Deck materials found once (flat meshes, top at deck height, > 150 m long): roughness → 0.3, albedo −18 %, normal maps +40 % with wetness (index.html: NAVAL 0.55, rain ×1.4, overcast, STORM/STORM_OPS = 1). 48-instance additive reflection streaks (flat quads at each light's foot, stretched toward the camera, grazing- and distance-weighted, bind-time raycast deck height clamped ≥ deck+0.35) for 22 amber edge lights, 3 new orange island beacons (one pulsing) and the player's two nozzles (AB/throttle, ≤ 25 m above deck). Sprites/streaks `raycast` no-op so carrier deck probes ignore them.
   - **Bug fix:** `placeAllyLights` placed the GLB carrier's edge lights in GLB-local space although the GLB is rotated 90° at mount → lights ran across the beam over the sea; now placed in root space (`placeAllyLights(root, 1, CARRIER_DECK_ASL)`).
   - **F-15C cockpit:** `EMISSIVE_LIFT` 1.35 on gauge / display (×1.1) / UFC / caution materials (NVG dim unchanged), atlas anisotropy 8, ADI emissive 0.45 → 0.6, combiner tint 0.14 → 0.11 + `HUD_GLASS_GLOW` 0.22 green self-glow (0 under NVG), Fresnel rim 0.10 → 0.16.
   - **Verified (headless Edge):** NAVAL catapult hold (idle + AB) and RTB approach in STORM OPS, daylight NAVAL (damp 0.52) and AIR_SUPERIORITY clear (dry), deck-level vantage renders wet vs dry, all 5 missions twice (geo flat), freeze suite; 0 console errors.
- [x] **Storm Realism Pass — step 1: post-processing & STORM OPS atmosphere (`v1.1.75`)** *(builds `s9ek` atmosphere/nvg/weather/ambient/cockpit_f22, `s9el` stormfx/patchnotes; `src/stormfx.js` new)*
   - **Post:** ACES Filmic kept, global `EXPOSURE_TRIM` 1.05 on every preset; `UnrealBloomPass` threshold `BLOOM_THRESHOLD` 0.88 (was 0.78), strength 0.40, radius 0.6 at 1/4 res — sky / cloud crowns stay under the knee, HDR emissives bloom; F-22 display materials lifted ×1.4 so bright symbology blooms.
   - **STORM OPS:** `atmosphere.js` `STORM_OPS` preset (charcoal-indigo dome, 20° silver moon key for rim light, weak cold fill, near-black sea with narrow glint, `shafts: 1`) + `weather.js` `STORM_OPS` (coverage 1, overcast 0.5, light rain, lightning, chop 0.85; never rolled). `src/stormfx.js`: 3 additive axis-locked god-ray quads, foot on the sea 2.2–4.6 km toward the light, climbing along `SUN_DIR` to the 2,300 m deck, zero-alloc update, built once. Theatre pairing (`THEATRES`) so STANDBY Weather/Time selects weather + lighting together; NAVAL_BATTLE phase 3 auto (`ambient` `PHASE_SKY` + `stormOpsAuto` weather swap, restored on RTB / restart).
   - **Verified (headless Edge):** forced STORM OPS chase/cockpit/shaft stills, phase-3 auto switch, STANDBY cycle in/out of the theatre, all 5 missions twice (geo/tex flat on the second pass), freeze suite; 0 console errors. Shaft cost ≈ 0 ms on the CPU rasteriser after the anchor fix.
   - **Note:** the YouTube reference was not downloaded (no ripping); built from the written visual spec.
- [x] **F-22A cockpit rebuilt in Blender (`v1.1.65`)** *(build `s9dx` cockpit_f22/patchnotes; `scripts/build_f22_cockpit.py`, `assets/f22_cockpit.glb` 3.7 MB, `assets/f22_cockpit_report.json`, `src/cockpit_f22.js`, `AGENTS.md`)*
   - **Asset:** `build_f22_cockpit.py` models the pit from scratch in rig space (eye origin, −Z fwd, `export_yup=False`) after the real F-22A layout: faceted shroud + hood wings, ICP + 2 UFDs, 8" PMFD + two 6.25" SMFDs with OSB rows/corner rockers, pedestal SMFD, diamond-plate sills with latches, ribbed walls with panels, console knob/toggle/button panels, throttle quadrant, stick housing + armrest, striped gear panel, ACES II seat, pedals, HUD body/posts. ~470 static parts merged by bmesh into `Cockpit_Static` (no `object.join`), smart-UV atlas, Cycles AO bake (2048², 0.22 m) as `baseColorTexture` on `<mat>_ao` materials with `extras.ckp_rgb` tints; `uv_per_m` node extra for detail tiling. Animated `Stick_Gimbal` / `Throttle_L/R` / `Gear_Handle` pivots (identity rotation), `Screen_*` unit-UV quads, `HUD_Anchor`. `-- --preview out.png` renders the pilot-eye view in Cycles; `-- --nobake` skips the bake.
   - **Runtime:** `cockpit_f22.js` loads the GLB, tints `_ao` materials, adds a procedural diamond-plate normal map to the sills (64 mm tile via `uv_per_m`), binds the six live canvas displays to `Screen_*`, animates the HOTAS/gear pivots (throttles now lean forward with thrust) and keeps the gold canopy + HUD combiner (moved onto the new glare shield; `glassOutlineWorld()` follows it). `cockpit.ready` getter.
   - **Verified (headless Edge):** GLB loads, all nodes bound, stick/throttle deflect, forward/left/down free-look shots, ~58k tris in cockpit, median frame 5.4 ms; F-22 suite + missions; 0 console errors.
- [x] **F-22A Raptor — second player aircraft (`v1.1.59`)** *(builds `s9ds` combat/patchnotes, `s9dl` gear; `scripts/prep_f22.py`, `assets/angels_zero_f22.glb` 2.3 MB, `assets/f22_prep_report.json`, `assets/CREDITS.md`, `src/gear.js`, `src/combat.js`, `index.html`, `AGENTS.md`, `.gitignore`)*
   - **Asset:** Sketchfab "F22 Raptor FREE" (NLM-Group, CC BY 4.0) → `prep_f22.py`: bake anim frame 1 (gear up, doors shut), nose −Y/up +Z/right −X → contract axes (Rz180 then Rx−90), 18.92 m, mains moved to z +0.7 (F-15 ground-pivot parity), 30 gear/junk meshes removed (33k tris), already-separate surfaces renamed to `Ctrl_Stabilator/Aileron/Flap/Rudder_L/R` with origins on computed hinge lines (forward-swept TE axes, canted rudder axes) + `Nozzle_L/R`, `Pylon_MSL_1..4` as empties with part children (no `bpy.ops.object.join`: hangs headless), `Gear_*` + `Canopy_Pilot_Eye` empties, JPEG textures.
   - **Runtime:** `AIRCRAFT` registry (`F15C`, `F22A`), selection in localStorage `angelsZero_aircraft` / `?debug&aircraft=`; STANDBY **AIRCRAFT** row (MENU only) saves and reloads; roster labels + loading hint follow it; livery row hidden for F-22 (own paint). Per-aircraft `EYE` (clip box translated by the eye offset), `INTERIOR_MAT`, belly-hide height, wingtip y band, nav-light points, `thrustDryK/AbK` (F-22 1.35 / 1.15 → Mach 1.09 at MIL, 9 km). `src/gear.js`: `GEAR_UNITS` table (F-15 values unchanged) + `setGearPoints()` mutating the shared `GEAR_PTS`; wheel spin uses each unit's radius. `combatSys.init(model, nozzles, fleetModel, fleetNozzles)`: player stores from the selected jet, bandit fleet from a separately loaded F-15 GLB. `__az.surfaces/aircraft/gearPts`.
   - **Verified (headless Edge):** F-22 in AIR_SUPERIORITY runway start, airborne surface deflection, cockpit view, NAVAL catapult (deck gap 0.05 m) + launch, all missions / freeze suite, F-15 regression; 0 console errors.
- [x] **Compiled F-15C sound bank & cockpit warning integration (`v1.1.52`)** *(build `s9dl`, v1.1.52, `assets/sfx/f15/*`, `assets/sfx/CREDITS.md`, `src/audio.js`, `src/patchnotes.js`, `index.html`, `PLAN.md`)*
   - Compiled 19 FlightGear F-15C `.wav` assets (`Zaretto/fg-aircraft/aircraft/F-15/Sounds`, GPL-2.0) to 22.05 kHz mono 16-bit normalized PCM (`1,852.5 KB` total) in `assets/sfx/f15/` and updated `assets/sfx/CREDITS.md`.
   - Wired `f15Whine`, `f15Exh`, `f15AbIn`/`f15AbOut`, `f15Brake`, `f15StallB`, and `f15Gun` loops in `src/audio.js` (with all continuous loop gain params registered in `N.silenceParams`), plus `f15BettyOverG`/`f15BettyBingo`/`f15BettyWarn` VMS, progressive `f15Ows85`/`f15Ows96`, `f15HighAoa`, `f15WarnTone`, `f15AimLaunch`, `f15Flare`, `f15GearTransit`, `f15GearLock`, and `f15TyreSqueal` with procedural fallback.

- [x] **Complete 58-file F-15C audio suite (`v1.1.53`)** *(build `s9dm`, v1.1.53, `assets/sfx/f15/*`, `assets/sfx/CREDITS.md`, `src/audio.js`, `index.html`, `src/patchnotes.js`, `PLAN.md`)*
   - Compiled all remaining 39 FlightGear F-15C `.wav` files (58/58 total, `6,965.6 KB` in `assets/sfx/f15/`) and wired all 61 `SFX` samples: efflux, intake air, slipstream wind, ground rattle, JFS/GPU startup/run/shutdown, canopy close, 3-stage OWS, 900 Hz departure/spin, chopped/continuous stall, gear-AoA, Betty low-fuel, flaps transit, tyre sideslip, 115 Hz square, 1–12 o'clock incoming missile callouts, AIM/aircraft explosions, fuselage strike, and flare-out.

- [x] **Realistic F-15C G-LOC & push-pull physiology (`v1.1.54`)** *(build `s9dn`, v1.1.54, `index.html`, `src/patchnotes.js`, `PLAN.md`)*
   - Updated pilot G physiology in `index.html` to NASA/USAF F-15C ATAGS + AGSM timings (`G_ONSET = 5.0`, `G_RATE_A = 0.022`, `G_RATE_P = 1.15`, `G_DRAIN = 0.09`, `G_DRAIN_UNLOAD = 0.16`, `GLOC_T = 6.0`, `GNEG_ONSET = -2.0`, `GNEG_RATE = 0.14`) and added `state.gPushPull` onset penalty after negative-G exposure.

- [x] **Text-only radio & voice-free cockpit (`v1.1.51`)** *(build `s9dk`, `index.html`, `src/audio.js`, `src/patchnotes.js`)* — user decision: no voice audio anywhere. `radioPlay()` shows every queued line (scripted RADIO_LINES and reactive callouts) on the CRT subtitle for `audio.textLineSecs()` and plays nothing; `preloadRadioOnce()` is a no-op (voice clips in `assets/voicelines/radio/` are no longer fetched; files kept on disk); `?radiohero` queues text only. VWS `vwsPlay()` is chime-only (no `VWS_BUF` clips, no speechSynthesis; `preloadVWS()` / `setVWS()` are no-ops), warning text stays on the HUD via `hud.setAlertState`. `audio.playRadio` / `preloadRadio` remain defined but unused.
- [x] **Reactive Tactical Radio — text callouts (`v1.1.50`)** *(build `s9dj`, `src/audio.js`, `src/radioQueue.js`, `src/combat.js`, `index.html`, `src/patchnotes.js`)*
   - **Text only (user decision):** the speechSynthesis voice layer was built, then removed at the user's request; generated lines are shown on the CRT radio subtitle box only (no audio, no PTT/static for them). `audio.textLineSecs(line)` = on-screen reading time that drives the queue. Recorded radio clips are unchanged.
   - **Grammar (`audio.generateReactiveLine(kind, t)`):** `RX` fragment tables per kind (callers / observations / live-telemetry builders / actions, `cls` ROUTINE|URGENT) stitched as `[addr] + [obs] + [telemetry] + [action]`; FNV-1a hash ring of the last 8 lines re-rolls repeats; brevity altitude (`feet` below 1,000 ft, `angels N` above), 3-digit bearings. Kinds: CAT_LAUNCH, GEAR_UP, SEA_SKIM, LOCK, FOX2, GUN_HITS, SPLASH, SHIP_SUNK, MISSILE, SAM, HULL_LOW, FLARES_OUT, NAVAL_WAVE, BUNKER_DOWN, ACE_MERGE, ACE_LOW, RTB_5K, RTB_2K, AUTOLAND, WIRE, WAVE_OFF, AMBUSH_CLEAR.
   - **Watcher (`index.html` `updateReactiveRadio`, 0.5 s):** scalar edge detection on `cat.ph`, gear, radalt over open ocean away from the carrier, lock state, `combat.playerLaunches`, `gunHitsP`, kills, task-force count, NAVAL stage, CANYON `ceil.st` / `climb.on`, ACE merge range + ace HP, hull < 35 % (re-arms > 50 %), flares 0, carrier / runway distance with AGL gates, autoland, traps; per-kind `RX_CD`; urgent kinds queue as pri 3 + `MISSILE`/`DMG` category. `rxFire(kind)` / `sayText(caller, text)` (text-only) are also used by wave-off, ambush clear, turnaround, scramble, ESM and CRIMSON-down, which previously passed free text as a line id and never played.
   - **Queue fixes:** urgent (pri 3) lines rank as CRITICAL; a full queue evicts its lowest-priority oldest line (old search never matched, dropping even urgent lines); MISSILE-class calls cut STORY lines; `TTL.REACT/MISSILE/DMG`.
   - **Combat:** `onPlayerLaunch` + new `C.playerLaunches` only for launches with the player's quaternion (wingman / base-defence shots no longer flash the cockpit or puff).
   - Debug: `?rxradio` console log, `__az.reactive` (stats + last 30 lines), `__az.rxFire(kind, force)`, `__az.sayText`.
- [x] **Mission isolation & zero per-frame allocation pass (`v1.1.49`)** *(build `s9di`, `src/combat.js`, `src/hud.js`, `src/cockpit3d.js`, `index.html`, `src/patchnotes.js`)*
   - **Staged-ship leak:** `spawnFleet()` keeps `t.staged` ships (no more `scene.remove` of the stage-0 DDGs when `init()` runs after `configureMission()`), skips the legacy CVN+3 DDG task force in staged missions, and disposes retired legacy ships via `disposeShip()` (wake geometry is shared through `wakeGeoCache`, so only its material is freed). The legacy fleet is now spawned only from `resetWaves()` (non-staged, non-FURBALL), so fresh boot / replay / switch match.
   - **Guns-only stores:** `resetPlayer()` re-arms only unlocked stores and zeroes `missiles/aam4/qaam/bombs` under `weaponsLock`, as `pitStop()` already did; `collectStores()` (runs when the GLB finishes loading, possibly after `configureMission()`) honours the lock too. `eject.js` camera orbit and `updateWreck()` tumble use scratch vectors/quaternions. Verified: 0.0-0.4 THREE objects/frame in every mission + NVG/padlock/missile-cam/autoland (remainder is three.js-internal or per-launch).
   - **Allocations (measured by a constructor-tracing harness; was 21-145 THREE objects/frame):** `hud.js` pooled `toScreen()` ring (256) + per-site scratch vectors; `combat.js` pooled `radarCandidates()` records/output, scratch `fwdOf()`, loop-based `autoDesignate()` / NEXT cue / 4AAM dead-track check, `updateFlares()` scratch centres, `update()` segment scratch, shared `spo()` record for all 44 `Particles.spawn` sites; `cockpit3d.js` reused `glassOutlineWorld()` array; `index.html` vapour-tint scratch Color.
   - **Robustness:** lock / 4AAM off-boresight divide guarded with `max(d, 1e-3)`; `<link rel="icon" href="data:,">` removes the favicon 404.

- [x] **YouTube / YouTube Music playlist player** *(build `s9ei`, v1.1.73, `src/ytmusic.js`, `src/audio.js`, `index.html`)*
   - Removed the 24 bundled `.ogg` beds, `manifest.json` and the whole local streamed/synth BGM engine (~10 MB). `audio.js` keeps every jet / weapon / RWR / VWS / radio SFX path intact; all legacy `bgm*` methods are now thin delegates to an injected `ytMusic` controller, and `resolveScenario()` survives as a pure scenario-name resolver for debug compatibility.
   - New `createYouTubeMusic()` wraps the IFrame Player API: parses playlist/watch/short URL forms and raw IDs, persists the user URL in `angelsZero_ytPlaylist`, mounts a 2×2 off-screen player, starts on the first gesture, supports play/pause/next/prev/shuffle/volume, ducks ~40 % during radio, skips embed-blocked videos up to 3 times, and emits live track titles.
   - `#bgmWidget` now shows the real YouTube title + `[YT PLAY/PAUSED/OFF]` status with ‹ ▶ ›, SHUF and ▾; the picker is a URL input + LOAD + presets + RESET DEFAULT. `K` toggles play/pause, `,` / `.` change track, `/` toggles shuffle; URL-input typing is shielded from the flight key handlers. `?nobgm` skips the external API load for offline headless runs.
   - No per-frame audio nodes from music, no new draw calls; 0 JS/WebGL errors and ~60 FPS in headless verification with `?nobgm`.

## Pillar 5 — Ace Combat 8 HUD & Briefing UI (`src/hud.js`)
- [x] **3rd person** — `-o-` reticle with velocity parallax, pointed SPEED /
  ALT boxes, no ladders or tapes.
- [x] **1st person** — conformal ladder + tapes clipped to the combiner glass.
- [x] **Sleek chamfered HUD polish** *(build `s23a`)* — tapered F-15 combiner
  (narrowing top, chamfered upper corners) on thin dark anodized posts, green-
  cyan tint at 0.14 opacity with no glowing border; open 1 px pointed readouts
  `[ 455 >` / `< 4256 ]` in both views, `â–¼ 347` heading without a box, 1 px
  ladders with shorter micro-ticks, open-corner `A/B` / `ARM` tags, rounded
  1 px radar frame, translucent glass-pill `PATCH NOTES` / `CONTROLS` buttons.
- [x] **F-15C cockpit interior replication** *(build `s30a`, `src/cockpit3d.js`)*
  — reference-matched analog panel: light military-grey structure (#8f99a1
  crinkle coat), dark charcoal glare shield and sub-plates, white silkscreen,
  hazard-striped EMERG LG / EMERG JETT / EMERG BK, one static 2048 px painted
  faceplate + real 3D bezels, knobs, toggles, lamps. Live: VSD B-scope radar
  (sweep, blips, designation / lock), round TEWS (RWR bearings), 3D ADI ball
  (rolls + pitches with attitude), HSI (rotating rose, target bearing bug,
  miles), ASI / Mach, AoA, G (with peak), ALT, VVI, clock, twin RPM / TEMP /
  FUEL FLOW / NOZ POS, FUEL QTY, HYD — 16 dials in one atlas at 15 Hz, CRTs at
  30 Hz. UFC / HUD SET with MASTER CAUTION + AI/SAM lamps, A/G-ADI-VI, gear
  NOSE/LEFT/RIGHT + FLAP lamps, L/R ENG FIRE, red gear handle + SELECT JETT.
  Amber 3x13 caution matrix lit by low fuel, over-G / G-strain, gun overheat,
  engine out / fire, hydraulic leak, low altitude, stall. Side consoles
  (painted switch panels + toggles), red IDLE / MIL / MAX throttle track,
  right-wall canopy lever + white ball handle + coiled hose, tan ACES II seat
  with yellow handles. Eye line -15 deg to frame the panel. NVG-compatible
  instrument lighting (dimmed dials / CRTs / lamps, no glass glints).
  Minimal fuel model added to back the gauges (13,455 lb internal; burn
  700 + 4,300 x throttle + 17,000 x AB pph per engine; refills on respawn).
  Verified headless: straight ahead, pull + roll + AB, NVG, dusk, DMG 90 %
  cautions, chase / menu regressions, zero page console errors.
- [x] **Animated 3D HOTAS** *(`src/cockpit3d.js`)* — center stick (ribbed boot,
  charcoal shaft, contoured grip, thumb rest, 4-way trim hat, red pickle,
  two-stage trigger) tilting +/-16 deg pitch / +/-18 deg roll from `state.ctl`,
  trigger squeezes while the Vulcan fires, pickle depresses on every missile /
  bomb release; left quadrant with split `Throttle_L` / `Throttle_R` levers
  sweeping -22 deg idle -> +16 deg MIL -> +28 deg afterburner. Eye line lowered
  to -12 deg so the grips frame below the MFD screens. Verified headless
  (neutral, pull + roll, push + roll, idle, fire, pickle, NVG, chase).
- [x] **Radar** — bottom-left 4 NM square radar with coastline / contour
  overlay, runway + bridge marks, bandit / missile blips.
- [x] **Stores** — bottom-right GUN / MSL / UGB / FLR / DMG list, F-15C
  wireframe with per-pylon AIM-9 reload icons.
- [x] **Menus** — AC7/AC8 glass briefing + tactical pause menu (volume,
  restart, camera preview, time-of-day selector, patch notes).

---

## Controls (verified)

| Input | Action |
| --- | --- |
| Mouse | Pitch / roll |
| W / S | Throttle up / down (airbrake) |
| A / D | Rudder yaw (tap = 25 % nudge, hold 0.22 s = full) |
| Q | Barrel roll |
| Shift | Afterburner; High-G turn while pulling (also W+S) |
| LMB / F | M61 Vulcan cannon |
| RMB / M | Fire selected: AIM-9, 4AAM ripple, or drop UGB |
| R Â· 1 / 2 / 3 | Cycle MSL / 4AAM / UGB Â· select MSL / UGB / 4AAM |
| (auto) | APG-63 auto-radar designation of the forward bandit(s) |
| C | Lock missile seeker / cycle target when locked |
| Z | ALQ-135 ECM jammer (6 s on, 14 s recharge) |
| X / G | Flares + chaff |
| N | Night vision (NVG) |
| Space | Cockpit / chase view |
| E | Eject |
| H / Esc | Tactical (pause) menu |
| Backspace | Reset aircraft |
| M (in menus) | Mute |

## Baseline verification (2026-11-18, build `s19b`; re-run on `s21a`; Free Flight added in `v1.1.55`, build `s9do`)
Headless Edge (SwiftShader) runs with zero page console errors / warnings:
briefing menu, chase daylight, cockpit dusk, High-G pull, guns + C-lock +
missile, UGB + CCIP impact, flares + bandit shot + cloud cover, night NVG
toggle, ejection, bridge fly-under. User-facing weapon labels unified to
MSL / UGB (briefing, radio call, CCIP reload cue, stores list).

## Debug URL flags (require `?debug`)
`subkillat=s` (cripple nearest AA mast) Â· `sitekillat=s:i` (destroy rim site i) Â· `flagsalvoat=s` (force flagship telegraph) Â· `sunat=s` (hold nose on sun 1 s) Â· `irmslat=s` (IR missile from 3 km behind) Â· `mslshootat=s` (head-on missile in gun line) Â· `wingorderat=s:n` (force wing order 0/1/2) Â· `limpat=s` (force wounded WARDEN-2) Â· `ambient=0` (kill all living-world effects) Â· `hold=s,a,...` (hold keys) Â· `keyat=s:key,...` (real keydown/keyup) Â· `carrierfinalat=s` (carrier final at missionT >= s, 450 m behind the stern; works with or without `warp`) Â· `gforce=G:s` (hold G load for s seconds from missionT >= 0.5 s; works with or without `warp`) Â· `duelahead=s` (CRIMSON 800 m ahead) Â· `nointro` Â· `cockpit` Â· `freeze` Â· `warp=s` Â· `pose=bank,pitch` Â· `mouse=x,y`
Â· `ab` Â· `highg` Â· `alt=m` Â· `spd=m/s` Â· `at=x,y,z,hdg|airbase|canyon|bridgeA|
bridgeB|volcano|wind|harbor` Â· `overview[=h]` Â· `tod=NAME&az=deg` Â·
`todto=NAME:t` Â· `rolls=n` Â· `nvg` / `nvgat=s` Â· `camat=x,y,z` Â·
`bogey=m` Â· `six=m` Â· `place=i:az:el:dist,...` Â· `cat=s` Â· `catat=s` Â· `catlaunchat=s` Â· `killat=s` Â·
`mslat=s` Â· `bshot=soft|full` Â· `wpn=bomb` Â· `bomb=n` Â· `bombat=s` Â·
`flare` / `flareat=s` Â· `breakat=m` Â· `cloudpos=az:el:dist` Â· `cloudon=t:i` Â·
`look=yaw,pitch` (hold free look, degrees) Â· `lookoff=s` (release at s) Â·
`at=final18|rig|stack` (3.6 km RWY 18 final / oil rig run / sea-stack run) Â·
`at=fleet` Â· `phase=1|2|3` Â· `sinkat=s[,i]` (sink task-force ship i) Â· `maskshot=s` (aimed bandit shot)
Â· `wingtest=L|R|C,dist` (passive bandit on the gun line) Â· `wingtrack=L|R` (keep the nose on its wing while firing) Â· `dmg=pct` Â· `ccrp=i,dist,alt[,spd]` (level run-in at surface target i) Â· `fireon=t` / `fireoff=t` (trigger)
Â· `wx=CLEAR|SCATTERED|OVERCAST_RAIN|THUNDERSTORM` Â· `difficulty=ROOKIE|NORMAL|ACE` (forced, not saved) Â· `diffcycle=n` (n briefing clicks; no `nointro`) Â· `logat=t,...` Â· `fireat=t` (RMB) Â· `ecmat=t` (Z) Â· `wpn=aam4` Â· `fire` Â· `msl` Â· `eject` Â· `alert` Â· `force=cone,vapor,mist`
Â· `merge=m` (head-on bandit) Â· `ram=m` (head-on, no break) Â· `lowpatrol=m` Â· `ace` (start in PHASE 3: SCARLET 1 + 2 escorts) Â· `debrief=CLEARED|FAILED[,score]` (end the sortie 3 s after load) Â· `onrwy[=z]` (stopped on RWY 36, gear down) Â· `gear` (start gear down)
(wave patrols low over the islands, no engaging) Â· `bandcam=i,dist` (chase
camera on bandit i).

## Next
0. **Step 4 (final): landing gear + runway ops** — gear / flaps / hook,
   touchdown physics, taxi, takeoff roll, rearm on the runway.
1. Pillar 1: extract `state` / `combat` into `src/state.js`; fixed-step
   simulation accumulator.
2. Pillar 2: extract `updatePhysics` â†’ `src/flight.js` and the chase camera â†’
   `src/camera.js`; add FOV speed kick and an explicit stall / departure
   recovery model.
