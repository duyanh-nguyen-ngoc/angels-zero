# AGENTS.md — ANGELS ZERO

## Project
Browser-based modern military flight simulator. This folder is the self-contained
ANGELS ZERO subproject inside the repository. Run all build commands from
`angel-zero/`; the Cloudflare Pages workflow deploys this folder as the site root.
`index.html` is the playable game: the normalized Sketchfab F-15 flown over a
procedural ocean archipelago with a 2D HUD, cockpit MFDs and combat.

## Toolchain (verified 2026-11-18)
- Blender 5.3.0: `C:\Program Files (x86)\Steam\steamapps\common\Blender\blender.exe`
  (NOT on PATH). Use the helper script or set `$env:BLENDER_EXE` before running.
- Headless runner:
  `python C:\Users\<user>\.config\opencode\skills\blender-core\scripts\run_in_blender.py --expr "..."`
- Renderer: Three.js via CDN import map in `index.html`; `GLTFLoader` from the
  same version's `examples/jsm/loaders/GLTFLoader.js`.

## Layout
- `scripts/prep_f15.py` — headless Blender script; **source of truth** for
  `assets/angels_zero_jet.glb` (normalizes the Sketchfab F-15, strips gear,
  seals the skin, writes `assets/f15_prep_report.json`).
- `assets/mcdonnell_douglas_f-15_eagle_fighter_jet.glb` — Sketchfab source model,
  supplied separately and not committed (>50 MB). `prep_f15.py` needs it in place.
- `scripts/prep_f22.py` — headless Blender script; **source of truth** for
  `assets/angels_zero_f22.glb` + `assets/f22_prep_report.json` (second player
  aircraft). Input `assets/f22_raptor_free.glb` (Sketchfab "F22 Raptor FREE",
  NLM-Group, CC BY 4.0) is supplied separately and git-ignored. Bakes animation
  frame 1 (gear up, doors shut), strips gear / display plane, re-pivots the
  already-separate surfaces to the same `Ctrl_*` / `Nozzle_*` contract, groups
  `Pylon_MSL_1..4`, writes `Gear_Nose` / `Gear_Main_L/R` and `Canopy_Pilot_Eye`
  empties. Credits: `assets/CREDITS.md`.
- Aircraft selection: `AIRCRAFT` registry in `index.html` (`F15C` / `F22A`,
  `angelsZero_aircraft` localStorage, `?debug&aircraft=F22A`); switching reloads.
  Per-aircraft eye / clip box, interior material, belly-hide height, wingtip band,
  nav lights, thrust factors; gear units in `src/gear.js` `GEAR_UNITS`. The bandit
  fleet always uses the F-15 GLB (`combatSys.init(model, nozzles, fleetModel, fleetNozzles)`).
- `scripts/build_jet.py` — retired Step 1A procedural stealth-jet generator
  (kept for reference; running it would overwrite the F-15 GLB).
- `index.html` — the game shell: scene, terrain/ocean, flight model, combat,
  GLB loading (Three.js via CDN import map).
- `src/vfx.js` — `createVFX`: afterburners, contrails, wing vapor, speed lines,
  Mach cone, sea spray, instanced cloud layer + canopy mist factor.
- `src/hud.js` — `createHUD`: chase HUD; in cockpit view the combiner-clipped
  HUD, corner clusters and `hudAlertState` / `setAlertState()`.
- `src/cockpit3d.js` — `createCockpit3D`: 3D cockpit rig (owns the cockpit
  camera pose), reference-matched F-15C analog panel (static painted
  faceplate + 3D bezels; live gauge atlas, display atlas for VSD / TEWS / HSI,
  3D ADI ball, caution matrix), tapered combiner glass outline, animated HOTAS
  stick / `Throttle_L` / `Throttle_R`, `setNVG()` instrument dimming, sun
  shadows in cockpit view.
- `src/combat.js` — `createCombat`: bogey wave AI (bank-to-turn flight,
  PATROL / ENGAGE / EVADE_BREAK / BARREL_ROLL / EXTEND_CLIMB, terrain look-ahead,
  merge break-away, AI flares, airframe collision), APG-63 auto-designation +
  C seeker lock, >4AAM ripple, RWR picture (`combat.rwr`), ALQ-135 ECM, cannon, AIM-9 PN guidance,
  explosions / wrecks / smoke, lock-on, scoring, radio comms (`combat.comms`).
- `src/eject.js` — `createEjection`: seat, parachute, burning jet, rescue respawn.
- `src/atmosphere.js` — `createAtmosphere`: Rayleigh/Mie sky dome + starfield,
  sun / moon corona + lens ghosts, owns `scene.fog` (FogExp2, colour = sky
  horizon) and the time-of-day engine (`PRESETS`, `applyTimeOfDay`,
  `randomize`) that drives lights, exposure, ocean, clouds and NVG gain.
- `src/canopy.js` — `createCanopyFX`: canopy droplets / mist-streak / rain
  rivulet 2D overlay.
- `src/weather.js` — `createWeather`: CLEAR / SCATTERED / OVERCAST_RAIN /
  THUNDERSTORM state (coverage, overcast, fog multiplier, rain, chop, gusts),
  the camera-centred rain line volume, lightning + thunder timing; index.html
  feeds it into `atmosphere.setWeather`, `vfx.setCloudCoverage / setCloudFlash`,
  the ocean `uChop`, physics gusts, canopy and audio.
- `src/world.js` — `createWorld`: archipelago heightfield + terrain mesh, the
  shared height grid (`heightAt`, triangle-exact), airbase, bridges, port,
  lighthouses, wind farm, light points and obstacle collision (`collide`).
- `src/surfaces.js` — `createSurfaces`: hinge-driven `Ctrl_*` deflections and
  F100 nozzle dilation from `state.ctl` / throttle / afterburner, Mach-scheduled
  intake ramps and the supersonic aileron lockout.
- `src/nvg.js` — `createNVG`: N-key night vision; owns the frame render
  (`nvg.render`), HDR target + bloom + green-phosphor composite when active.
- `src/audio.js` — `createAudio`: procedural Web Audio (engines, gun, seeker,
  alert, explosions); the AudioContext starts only inside the LAUNCH click.
- `prototype_flight_index.html` — preserved v1.1 prototype (do not delete).

## Conventions
- Axes: aircraft nose = **-Z**, up = **+Y**, right wing = **+X** (metres).
- F-15 landmarks: `Airframe` (root empty), `Canopy_Glass`, `Canopy_Pilot_Eye`
  (empty); `Nozzle_L` / `Nozzle_R` are the nozzle meshes (origin at the nozzle
  centre). Movable surfaces are `Ctrl_*` meshes with origins on their hinge
  lines and glTF extras `hinge_axis` / `hinge_kind` (`Intake_Ramp_L/R` use the
  same scheme, kind `intake`); stores are `Pylon_MSL_*` /
  `Pylon_BOMB_*`; everything else is `F15_Object_*` (+ `F15_ControlFairings`).
- `index.html` keys cockpit handling off Sketchfab material names: placeholders
  (`hud_disp`, `screens`, `GC_LOD`, `GF_LOD`, `poly_31`, `cock2.9`, `cock2.10`)
  are removed; `cock*`, `seats`, `poly_27` and canopy glass hide in cockpit view.
- HUD green `#00ff66`, font `'Share Tech Mono', 'Consolas', monospace`, 1.5 px
  strokes, backing `rgba(0,20,10,0.25)`, overlay canvas scaled by devicePixelRatio.
- Custom ShaderMaterials must include the logdepthbuf chunks (the renderer uses
  `logarithmicDepthBuffer`). Prefer instancing over many Sprites (draw calls).
- Canvases used as live textures: `getContext('2d', { willReadFrequently: true })`,
  no `shadowBlur`, and repaint only on change (GPU canvas upload is ~10 ms).
- Combat-dependent HUD lines read optional fields (`combat.special`,
  `combat.flares`, `combat.chaff`, `combat.decoys`); leave them undefined until
  the system exists rather than showing fake numbers.

## Workflow
1. Edit `scripts/prep_f15.py` (never hand-edit the generated GLB).
2. Rebuild from `angel-zero/`: `blender -b -P scripts/prep_f15.py`; check the
   printed `Removed gear objects` / `STRUT` lines and the report JSON.
3. Serve the folder locally and load `index.html?debug`; zero console errors.
4. Headless check: Edge `--headless=new --use-angle=swiftshader` screenshots of
   `?nointro&debug`, `&cockpit`, and a `&pose=75,0&mouse=0,0.8&ab&warp=3` pull.
5. Bump the `?v=` build tag on the `src/*.js` imports in `index.html` whenever a
   module changes (Cloudflare edges can otherwise serve a stale module next to
   a fresh `index.html`).
6. Commit and push to `main` (deploys `angel-zero/` to Cloudflare Pages).

## Rules
- Never rewrite source files with PowerShell `Get-Content`/`Set-Content` (ANSI
  default mangles UTF-8 such as em dashes); use the editor tools or Python with
  explicit `encoding='utf-8'`.
- Do not overwrite `assets/angels_zero_jet.glb` without regenerating from `prep_f15.py`.
- Verify file existence and non-zero size after every export.
- Keep the GLB under 20 MB (Cloudflare Pages per-file limit is 25 MB).
