// ANGELS ZERO — in-game patch notes. Newest first; every release prepends an
// entry here and bumps the patch version (see CLAUDE.md → Pre-push checklist).
// The UI reads PATCH_NOTES[0].version for the briefing + button version chips.

export const PATCH_NOTES = [
  { version: 'v1.2.12', title: 'TERRAIN V3.1 — DEM-ALIGNED AIRFIELD, ORGANIC COASTS & REAL-WORLD LANDMARKS', bullets: [
    'Each theatre is re-framed on its real fjord landscape so the airbase sits on a natural coastal lowland with open-water approaches, and Port City now lines a real bay with a quay shelf and seawall.',
    'No more square ground: the airfield blends into the coast with a crisp rock revetment and noise-broken grading, and terrain colours no longer show rectangular patches.',
    'Bridges now span real water narrows land to land, while ships, oil rigs and the wind farm sit in open water and lighthouses and radar stations crown actual headlands and summits on every map.',
    'Port City, the airbase and nearby villages are connected by draped roads with traffic and streetlights, and floating leftovers from the old islands are gone.'
  ] },
  { version: 'v1.2.11', title: 'GRAPHICS SELECTOR, ADAPTIVE QUALITY, SHARPER TEXTURES & TOPOGRAPHIC MAPS', bullets: [
    'New [ GRAPHICS: AUTO / HIGH / LOW ] button in Controls & Audio. AUTO watches your frame rate and smoothly trades resolution, sky-ray samples and water reflections to hold it, then steps back up when there is headroom.',
    'Runway markings, carrier deck lines, terrain detail and airframe decals stay crisp at grazing angles (capped 8x anisotropic filtering), with colour and data textures handled correctly.',
    'The radar and debrief maps now show raised-relief hillshading with fine 50 m and bold 250 m elevation contours, drawn once per theatre so they cost nothing in flight.'
  ] },
  { version: 'v1.2.10', title: 'ULTRA-REALISTIC OCEAN, MIRROR REFLECTIONS & CREPUSCULAR SKY RAYS', bullets: [
    'The sea is rebuilt around an 8-wave deep-water swell shaded per pixel: crisp wave faces up close that melt smoothly into the horizon with no shimmer, a turquoise glow through sunlit crests and a sparkling HDR sun path.',
    'Breaking crests now throw lacy, cellular whitecap foam, and the carrier and escorts leave real Kelvin wakes: 19° diverging wave arms, a churned white stern wash and a calm slick behind them.',
    'Coastlines, islands, ships and the carrier island are mirrored in the water, rippling with the waves.',
    'Low sun now casts true crepuscular rays that stream through gaps in clouds and around mountain ridges, while the cockpit, terrain and ships keep full contrast.'
  ] },
  { version: 'v1.2.9', title: 'TERRAIN V3 — REAL-WORLD NORDIC & ALPINE DEM LANDFORMS', bullets: [
    'Replaced procedural oval islands and straight mainland walls with true 1.0x real-world Earth elevation stitched offline from open AWS Terrarium DEM tiles: Lofoten Islands & Vestfjorden (Archipelago), Lysefjord & Aurlandsfjord (Gorge), and Alaska Kenai Fjords (Strait).',
    'Added a 160 x 160 km real-world outer DEM horizon ring (horizon16.bin) so surrounding Norway and Alaska mountain ranges continue seamlessly to the 131 km clipmap horizon.',
    'Added heightmap raymarched mountain self-shadows so spires and fjord walls cast long shadows across valleys and water, plus dual-ridged close-range rock relief.'
  ] },
  { version: 'v1.2.8', title: 'CONTROLLER FIX & GAMEPAD KEYBIND CHEAT-SHEET', bullets: [
    'Fixed desktop Xbox / PlayStation / Pro controller flight controls: A/Cross now fires guns cleanly, RT/LT triggers drive throttle, afterburner, airbrake and LT+RT post-stall (PSM), LB/RB control rudder yaw (LB+RB = barrel roll) and D-Pad maps NVG, Gear, Wingmen and ECM.',
    'Added full controller menu, pause and debrief navigation (D-Pad/Stick + A confirm / B back).',
    'Added auto-detected Xbox & PlayStation controller keybind cheat-sheets to both the in-flight F1 / Hold-View overlay and the Controls & Audio panel.'
  ] },
  { version: 'v1.2.7', title: 'MOBILE TOUCH CONTROLS OVERHAUL', bullets: [
    'Replaced the small fixed mobile pad with a floating left-half virtual stick using a smooth precision curve, stick-release damping and optional tilt gyro steering.',
    'Added a live-fill vertical throttle slider with AB/BRK zones, quick-hold AB & BRK combat buttons, and ◄ YAW / YAW ► rudder buttons.',
    'Added a bottom-right combat thumb-arc (GUN, MSL, LOCK, WPN, FLR, AB, BRK), top utility rail (CAM, NVG, SYS ▾, PAUSE), collapsible [SYS ▾] drawer (GEAR, ECM, WING, ROLL, PSM, GYRO, INV) and empty-sky drag free-look.'
  ] },
  { version: 'v1.2.6', title: 'DISTANT RANGES WITH REAL RELIEF', bullets: [
    'The far mountain ranges beyond the 40 km battle area now rise in ridged spurs and valleys instead of one smooth snowfield, so high-altitude and clear-sky views read as real mountains all the way to the horizon.',
    'Crash, missile and CCIP heights still match the rendered ground exactly out there.'
  ] },
  { version: 'v1.2.5', title: 'AERODYNAMIC VAPOR, WIND & THERMAL VFX', bullets: [
    'Replaced dotty over-wing vapor sprites with conformal 3D wing/LERX condensation shells and spiral LEX vortex tubes with scrolling turbulence and sun shading.',
    'Added depth-occluded exhaust heat shimmer (tail/wings never warp behind plumes), buoyant-to-supersonic plume drift, nozzle thermal heat-soak glow and hot-runway asphalt mirage.',
    'Added < 45 m AGL directional jet-blast dust/mist/spray kick-up, ambient ridge & ocean wind spindrift, speedbrake/post-stall dorsal wake and multi-ring Prandtl-Glauert Mach shock condensation.'
  ] },
  { version: 'v1.2.4', title: 'LIVING WORLD — STREAMED FORESTS, VILLAGES, TRAFFIC & HERO LANDMARKS', bullets: [
    'Up to 30,000 conifers and broadleaf trees now grow where the baked terrain says forest, streamed in around you out to 8 km, with boulder scree on rocky slopes.',
    'Villages sit in the flat farm valleys, linked by roads with live traffic; at dusk and night their windows, headlights and taillights glow.',
    'New landmarks: an oil refinery near Port City, early-warning radomes on the high summits, SAM batteries on the hills, and a hydroelectric arch dam and reservoir in the Gorge (all solid to fly into).',
    'Every prop is anchored to the exact rendered ground, so nothing floats or sinks, and gentle coastal plains now have narrow beaches instead of wide sand.'
  ] },
  { version: 'v1.2.3', title: 'TERRAIN V2 — BAKED EROSION WORLDS & 131 KM GPU CLIPMAP', bullets: [
    'Every theatre is now a hand-authored 40 x 40 km world, pre-baked offline with hydraulic and thermal erosion at 2048 x 2048: carved gullies, scree fans, braided drainage and razor ridgelines.',
    'A northern and eastern snow-capped alpine mainland (peaks to ~1,700 m) frames the Archipelago, the Gorge rises into a granite massif, and the Strait walls tower 1,100–1,550 m.',
    'A seamless 8-level GPU clipmap draws terrain out to 131 km with no popping or tile seams, and crash, missile, bomb and CCIP heights match the rendered ground to the centimetre.',
    'Runway 18/36, both approach funnels, the canyon trench and gates, and the Strait channel are kept exactly as before.'
  ] },
  { version: 'v1.2.2', title: 'CINEMATIC VFX OVERHAUL & YOUTUBE MUSIC FIX', bullets: [
    'Added a half-res screen-space distortion pass for animated jet nozzle heat shimmer, Mach shockwave collars and expanding blast pressure waves.',
    'Upgraded afterburner Mach diamonds to warm plasma cores, upgraded explosion & missile smoke to a 4x4 normal-lit thickness atlas, and added pooled dynamic flash lights illuminating the jet, cockpit and ground on detonations and flares.',
    'Added IMAX lens cues (edge-weighted radial speed blur keeping the HUD reticle crisp, horizontal anamorphic sun/flare streaks, crepuscular sun shafts, subtle 35mm film grain) and transonic/explosion camera shake, with a [ CINEMATIC: ON ] toggle in Controls & Audio.',
    'Replaced dead YouTube Music presets with verified working playlists and fixed clipboard pasting and early-load queuing.'
  ] },
  { version: 'v1.2.1', title: 'FLYOUT VISUAL REBUILD — CLEAN VOLUMETRIC CLOUDS, SLEEK OCEAN & CRISP TERRAIN', bullets: [
    'Clouds are clean and silky: the grainy stipple and hatching in the volumetric deck are gone, cloud bellies are brighter and airier, low cumulus is softer, and the Cloud Sea now leaves most of the sky open blue.',
    'The ocean reads as deep, sleek sapphire water: no more white-and-navy blotches, gentler swell, softer cloud shadows, a realistic horizon reflection and a crisp glittering sun lane.',
    'Terrain gets a new seamless rock-and-grain detail texture, so cliffs show sharp fractures, and runways, beaches and hills have fine surface texture with organic shorelines instead of smooth plastic.',
    'Cloud Sea now flies under a blazing low sun ahead and to the left with a cobalt-to-cyan sky, Daylight has raking light on the mountains, and looking into the sun gives a soft creamy glare.'
  ] },
  { version: 'v1.2.0', title: 'FLYOUT-GRADE ATMOSPHERE, CLOUD BLOOM & SOLAR GLARE', bullets: [
    'Rebuilt daylight, dawn, golden-hour and cloud-sea lighting with ~5:1 sun-to-shadow mountain contrast, stratospheric zenith darkening above 15,000 ft, smooth camera auto-exposure and outdoor sky-ground airframe reflections.',
    'Replaced flat distance fog on terrain, forests and ocean with directional two-tone Mie aerial perspective and height-exponential valley mist pooling in canyons and coves.',
    'Deepened hydraulic erosion gully striations and synchronized wrap-free cloud shadows across mountains and ocean specular glitter.',
    'Added sun-through-cloud HDR silver linings on both the upper volumetric deck and 3D cumulus banks, all-cloud solar occlusion, and a display-space photographic solar glare veil with filmic split-tone grading.'
  ] },
  { version: 'v1.1.90', title: 'CONTINUOUS M1 CANNON FIRE FIX', bullets: [
    'Fixed desktop M1 / F continuous Vulcan cannon fire being cleared every frame when the mobile touch HUD was hidden.'
  ] },
  { version: 'v1.1.89', title: 'ALPINE PEAKS, MULTI-BIOME TERRAIN & TURQUOISE SHOALS', bullets: [
    'Combat-theatre mountains across the Archipelago and Naval Strait now rise into sharper jagged spires, incised tributary valleys, indented coastal coves and deeper hydraulic/thermal erosion channels.',
    'Upgraded multi-biome terrain shading pairs lush emerald valleys with warm arid golden-ochre highlands, crisp slope-gated granite and basalt cliffs, stronger ridge/cavity ambient occlusion, sharper triplanar rock relief and snowcaps that cling to high flat ledges.',
    'Coastlines now blend into golden-sand beaches and luminous turquoise-emerald shallows with Beer-Lambert depth tinting, visible sunlit seabed shelves and organic shoreline surf foam.',
    'Every protected landmark — Archipelago AFB runway and approaches, Port City, strait bridges, carrier sea lanes and the CANYON_RUN trench and gates — remains strictly preserved.'
  ] },
  { version: 'v1.1.88', title: 'ERODED TERRAIN & SHARPER ROCK', bullets: [
    'Mountains across the Archipelago and the Naval Strait fjords are now carved by simulated rain and rockfall: real gullies, sharper ridgelines, scree fans and alluvial deposits below the peaks.',
    'Cliffs, ridges and canyon walls catch the sun with fine rock detail, rock shows through on steep ground, and snow now clings to the flatter ledges of the high peaks instead of the sheer faces.',
    'CANYON_RUN walls show layered sandstone and basalt strata with scree at their base; gullies and valleys get deeper shadows, and riverbeds, wet sand and snow have a subtle sheen.',
    'The runway, approach paths, Port City, the bridges and the canyon route are untouched, so landing, flying the canyon and every crash check behave exactly as before.'
  ] },
  { version: 'v1.1.87', title: 'MOBILE CONTROL RELEASE FIX', bullets: [
    'Touch action buttons now release correctly when you lift your finger, even if the browser moves the pointer off the button or cancels the gesture. Guns, missiles and the virtual stick no longer stay stuck down.'
  ] },
  { version: 'v1.1.86', title: 'MODULAR ENGINE REFACTOR — OCEAN, WINGMEN, FLIGHT, DRONES & ACE BFM', bullets: [
    'The two largest source files were split into focused single-responsibility ES modules with factory-wired dependencies. Flight physics, wingman BTT, the animated ocean, the drone swarm and the ace BFM state machine are now independent modules with the same zero-allocation behaviour.',
    'No gameplay changes: every debug hook, telemetry field and HUD readout still reports the same values.'
  ] },
  { version: 'v1.1.85', title: 'GAMEPAD API & MOBILE TOUCH CONTROLS', bullets: [
    'Standard Xbox / PlayStation / Switch Pro controllers now fly the jet: dual-stick pitch and roll with a smooth response curve, trigger throttle and afterburner, shoulder yaw, and face buttons for guns, missiles, lock, weapons, flares, camera and pause.',
    'Touch devices get an on-screen virtual stick, throttle slider and action cluster. Mouse and keyboard behaviour is unchanged when no controller or touch input is active.'
  ] },
  { version: 'v1.1.84', title: 'FREE FLIGHT ANY-CITY SEARCH, OSM RUNWAYS & ATTRIBUTION', bullets: [
    'Search any city, airport code or raw lat,lon from the Free Flight Standby row and fly there instantly, with the required OpenStreetMap, Esri and AWS Terrarium attribution shown while in Free Flight.',
    'OpenFreeMap vector tiles now render real airport runways and taxiways alongside buildings.'
  ] },
  { version: 'v1.1.83', title: 'GUIDED TRAINING SORTIE', bullets: [
    'A new TRAINING mission in Standby walks new pilots through afterburner, banking, the three-way camera cycle, missile lock and kill, flare defence and a cannon pass in a safe, step-by-step live flight.',
    'Each step is announced by Overlord with an on-screen objective card; completing all six qualifies you for combat sorties.'
  ] },
  { version: 'v1.1.82', title: 'RUNWAY LANDING, TAXI & MID-SORTIE REARM/REPAIR', bullets: [
    'Complete the Archipelago AFB recovery loop: fly the ILS 3-degree glideslope, touch down, brake and taxi into the rearm apron, then get a full 4-second rearm, repair and refuel without ending the sortie.',
    'The pit-stop now smoothly restores airframe and fuel during servicing, announces over the radio, and leaves you cleared for a fresh takeoff.'
  ] },
  { version: 'v1.1.81', title: 'PILOT PROFILE CLOUD SYNC & SAVE EXPORT/IMPORT', bullets: [
    'Your rank, kills, unlocked liveries and loadout preferences can now be copied as a compact AZP1 pilot code or exported as a JSON file — no account needed.',
    'Optional Cloud Sync links that record to an anonymous AZ-XXXX-XXXX Pilot Sync ID, with automatic non-destructive merging so progress is never lost when moving between browsers or devices.'
  ] },
  { version: 'v1.1.80', title: 'SHAREABLE DEBRIEF REPLAYS & GLOBAL LEADERBOARD', bullets: [
    'Copy a compact replay link from the debrief screen and let friends watch your exact flight trace, kills, rank, aircraft and score — no account or backend required.',
    'Submit your score to the global mission leaderboard, or fall back to a clean local personal board when the API is unavailable. Watch any leaderboard entry\'s trace directly from the board.'
  ] },
  { version: 'v1.1.77', title: 'BOOT PROGRESS HUD & ASSET LOADING OPTIMIZATION', bullets: [
    'A tactical boot HUD now shows live percentage, downloaded MB and the current stage (AIRFRAME / COCKPIT / CARRIER / SFX / SHADERS) instead of a bare LOADING F-15... label, with the correct aircraft name for the F-22A Raptor.',
    'Sound effects now preload in small batches with the active airframe\'s engine, weapon and RWR clips first, so the GLB downloads keep their HTTP connections. Boot time is measured and exposed as __az.bootMs.'
  ] },
  { version: 'v1.1.76', title: 'STORM REALISM PASS 2 // WET DECK & COCKPIT GLOW', bullets: [
    'OVERLORD\'s flight deck now gets wet in naval ops and storms: a damp sheen that catches the moon, with amber deck-edge lights, new orange island beacons and your afterburner glow smearing across it during the catapult hold and the RTB approach.',
    'Fixed the carrier\'s deck-edge lights, which were floating over the sea beside the ship; they now run along both edges of the flight deck.',
    'F-15C cockpit instruments, displays, the UFC and the caution panel are brighter and crisper, with a soft glow against a dark storm cockpit, and the HUD glass reads as a lit optic.'
  ] },
  { version: 'v1.1.75', title: 'STORM OPS // STORM REALISM PASS 1', bullets: [
    'New STORM OPS conditions: a dark, moody storm deck under a cool silver moon that rim-lights the jets, a near-black sea with a narrow moonlit glint, light rain, lightning and heavy chop.',
    'Moonlight now breaks through the storm in soft god-ray shafts falling to the sea.',
    'STORM OPS rolls in automatically for NAVAL BATTLE phase 3, and you can pick it any time from STANDBY → Weather / Time.',
    'Bloom is now reserved for real light sources (afterburners, explosions, deck and nav lights, tracers, cockpit displays), so bright skies and cloud tops no longer wash out; exposure was retuned to match.'
  ] },
  { version: 'v1.1.74', title: 'HEADLESS CI SMOKE TESTS', bullets: [
    'A zero-dependency Playwright smoke suite now boots the real game in headless Chromium and checks menu boot, every mission, the F-22A camera cycle, wingman physics, ace BFM, warp telemetry and the debrief screen before each deploy.',
    'Every push and pull request to main runs the suite as a GitHub Action, catching JS exceptions, failed asset requests, WebGL errors and NaN flight state automatically.'
  ] },
  { version: 'v1.1.73', title: 'YOUTUBE MUSIC PLAYER', bullets: [
    'The bundled scenario soundtrack is gone. Music now streams from a YouTube / YouTube Music playlist you pick, so the game ships ~10 MB smaller and the score is always yours to choose.',
    'Paste any playlist or video URL into the new [▾] playlist panel, or use the quick presets and RESET DEFAULT. Your choice is remembered between sessions.',
    'Music controls moved to the top-right bar: ‹ / ▶ / › for tracks, SHUF for shuffle, K for play/pause, and , / . for previous / next. Radio calls duck the music automatically, and embed-blocked videos are skipped.'
  ] },
  { version: 'v1.1.72', title: 'BROWSER SHORTCUT LOCK & AUTO-FULLSCREEN', bullets: [
    'Launching or resuming a sortie now automatically engages DOM Fullscreen + full navigator.keyboard.lock() so Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+R, Alt+Left/Right, and Tab no longer trigger browser shortcuts while flying.',
    'Added capture-phase shortcut blocking, F11 DOM-fullscreen shortcut-lock intercept, and a [ KEY LOCK: LOCKED / OFF ] toggle in Standby.'
  ] },
  { version: 'v1.1.71', title: 'DREAMY ATMOSPHERE, BLOOM & HOLOGRAPHIC HUD', bullets: [
    'Tuned HDR UnrealBloomPass for wide velvety halation on sunlit cloud crowns and solar glare, and added a filmic split-tone grade + soft lens vignette pass.',
    'Refined the volumetric cloud sea with 24-step silky raymarching, lower cloud-sea threshold for a continuous horizon-to-horizon cloud ocean, backlit sun-glow scattering, and softer cirrus + luminous horizon haze.',
    'Added GPU-composited phosphor bloom to the HUD canvas and translucent holographic glass boxes on the Nose Camera readout.'
  ] },
  { version: 'v1.1.70', title: 'VOLUMETRIC CUMULUS CLOUDS & CIRRUS SKY', bullets: [
    'Upgraded the volumetric cloud deck with a 20-step Beer-Powder light marcher, two-tier cumulus congestus turrets rising up to 7,500 ft, and crisper sunlit tops vs deep slate-blue shadowed bellies.',
    'Added procedural 3D cauliflower lobe normals and crevice ambient occlusion to the 3D cumulus puff atlas and shader, plus towering congestus turret banks.',
    'Added high-altitude wispy cirrus streaks and deeper cobalt-azure sky gradients to the sky dome, and switched Free Flight default lighting to DAYLIGHT // CLOUD SEA.'
  ] },
  { version: 'v1.1.69', title: 'HUD-ONLY NOSE CAMERA', bullets: [
    'Redesigned the Nose Camera HUD as a dedicated HUD-only nose view: cyan-mint vertical bracket rails with inward end caps, fine scrolling speed and altitude tick marks, boxed SPEED and ALT readouts, an inner-left vertical throttle/AB bar, and a top-left [A/B] indicator.',
    'Added the centered dotted compass heading strip with cardinal markers and downward caret, plus a gull-wing boresight symbol and conformal pitch ladder.'
  ] },
  { version: 'v1.1.68', title: 'NOSE CAMERA (HUD-ONLY VIEW)', bullets: [
    'Added a dedicated HUD-only Nose Camera view: press Space to cycle Chase -> Cockpit -> Nose -> Chase (or boot directly with ?debug&nose).',
    'Renders an unobstructed forward nose-mounted camera with centered pitch ladder, heading strip, and vertical speed/altitude tapes.'
  ] },
  { version: 'v1.1.67', title: 'WORLD & THEATRE MAP OVERHAUL', bullets: [
    'Archipelago & Airbase overhaul: higher-resolution terrain mesh, alpine summit snow, Main Island river & island highway network with live traffic lights, glowing volcano caldera magma & rising steam plume, USAF/ICAO runway markings with PAPI lights & static aircraft, Port City skyline, container terminal, merchant shipping, canyon stone arch, and ridge observatory.',
    'Dedicated Naval Strait & Canyon Run theatres: Naval Battle now takes place inside a deep-water volcanic fjord strait with flanking cliffs, sea stacks, cape lighthouses, and coastal radar stations; Canyon Run adds a fortified Crater Citadel, high-span steel canyon bridges, braided riverbed streams, and clean canyon rock strata.',
    'Upgraded Ocean, Radar & Free Flight cities: backlit wave-crest subsurface scattering, turquoise coral lagoons, dynamic per-theatre ocean depth & HUD/debrief topography maps, PBR skyscraper facades with lit golden-hour windows, specular bay/lake water, and new 3D landmarks including the Golden Gate Bridge, Empire State Building, Salesforce Tower, Tokyo Tower, and Rogers Centre.'
  ] },
  { version: 'v1.1.66', title: 'F-22A DISPLAY ORIENTATION FIX', bullets: [
    'Fixed the F-22A cockpit displays drawing upside-down; all six screens now read the right way up.'
  ] },
  { version: 'v1.1.65', title: 'F-22A COCKPIT REBUILT IN BLENDER', bullets: [
    'The F-22A cockpit is now a modelled 3D pit built in Blender to match the real jet: faceted glare shield with hood wings, ICP keypad, two UFDs, the 8x8 in centre display flanked by two side displays, and a fourth display on the centre pedestal.',
    'Every display now has its real ring of push-buttons, and the side consoles carry knobs, toggles, guarded switches and the yellow-and-black striped gear handle.',
    'Baked ambient-occlusion shading gives the panels real depth, and the canopy sills now have diamond-plate tread with canopy latches.',
    'The side-stick, twin throttles and gear handle are re-sculpted and still move with your inputs; the live displays and HUD combiner are unchanged.'
  ] },
  { version: 'v1.1.64', title: 'F-22A RAPTOR 5TH-GEN PERFORMANCE & STEALTH', bullets: [
    'Wired F-22A F119 dry/AB thrust (1.35x dry supercruise, 1.18x AB) and 0.90x aerodynamic drag directly into airborne flight physics.',
    'Added 2D thrust-vectoring agility (+22% pitch authority, +15% roll rate, +5 deg higher AoA CAS margin), reduced RCS stealth (-38% bandit lock range & slower enemy lock-on), and +35% faster APG-77 AESA target lock.'
  ] },
  { version: 'v1.1.63', title: 'F-22A RAPTOR ALL-GLASS 3D COCKPIT', bullets: [
    'Built a dedicated sculpted F-22A Raptor all-glass cockpit (src/cockpit_f22.js): frameless gold-tinted bubble canopy with no front bow, swept beveled trapezoidal shroud, and curved wide-angle HUD combiner.',
    'Added the 6-screen glass avionics suite: top ICP keypad with left ICAW/CNI and right synthetic backup ADI UFDs, large 8x8" center Tactical Situation Display, left APG-77 AESA radar, right ALR-94 defense/EW scope, and tilted lower F-22A stores & twin F119 engine display.',
    'Added an animated right-hand side-stick with ribbed boot and castle hats alongside animated left-hand twin throttles.'
  ] },
  { version: 'v1.1.62', title: 'F-22A MISSILE ALERT VWS FIX', bullets: [
    'Fixed the F-22A missile alert voice warning (CHAFF_FLARE) so it plays the F-22 "Chaff, Flare!" warning instead of "Pull Up!".'
  ] },
  { version: 'v1.1.61', title: 'F-22A RAPTOR ENGINE & AERODYNAMIC VFX', bullets: [
    'Shaped the F-22A F119 afterburner plumes to match its 2D rectangular thrust-vectoring nozzles with live pitch-deflecting exhaust vectors, tighter shock diamonds, hotter core tint, and lower dry-MIL IR glow.',
    'Re-aligned over-wing condensation vapor, chine/LERX ribbons, contrail emitters, and the Prandtl-Glauert Mach cone to the Raptor\'s low-set diamond wing and nose geometry.'
  ] },
  { version: 'v1.1.60', title: 'F-22A RAPTOR F119 SOUNDPACK', bullets: [
    'Added a dedicated 29-file FlightGear F-22A Raptor sound bank (assets/sfx/f22/) that loads automatically whenever the F-22A is selected.',
    'Includes F119 turbine whine, exhaust, intake rush, afterburner/reheat, efflux, APU start/run/stop, canopy close, flaps, gear/tyre cues, M61A2 cannon, AIM-120 launch/impact, RWR contact/spike/launch tones, and Betty over-G/fuel/pull-up/stall alerts.'
  ] },
  { version: 'v1.1.59', title: 'F-22A RAPTOR', bullets: [
    'New aircraft: the F-22A Raptor. Pick it from the AIRCRAFT row in the hangar; WARDEN-2 and WARDEN-3 fly Raptors with you.',
    'The Raptor supercruises (about Mach 1.1 on military power, no afterburner), has its own articulated flaperons, ailerons, all-moving tails, canted rudders and twin nozzles, procedural landing gear sized to the airframe, and carries four internal AIM-9s.',
    'Carrier catapult, autoland, cockpit view and every mission work in either jet; enemy bandits keep their own airframe.',
    'F-22 model: "F22 Raptor FREE" by NLM-Group (CC BY 4.0), credited in assets/CREDITS.md.'
  ] },
  { version: 'v1.1.58', title: 'FREE FLIGHT — CLEAN MISSION SWITCHING & COCKPIT UNARMED POLISH', bullets: [
    'Fixed switching from Free Flight back to combat missions in the same session so cannon ammo, missiles, special weapons, flares, chaff, selected weapon, weather, and time-of-day restore cleanly.',
    'Silenced the Standby launch combat callout ("CLEARED HOT — SPLASH THE BANDITS") and AWACS launch radio when launching Free Flight, and gated wingman/target-designate keys (G / C) while in Free Flight.',
    'Updated the 3D cockpit STORES MFD to read UNARMED instead of GUN ONLY, updated the Standby roster badge to UNARMED, and tightened the Free Flight F1 controls overlay.'
  ] },
  { version: 'v1.1.57', title: 'FREE FLIGHT — HIGH ABOVE THE CLOUDS, SCENIC & UNARMED', bullets: [
    'Raised Free Flight cruise altitudes way above the cloud sea (18,000–22,300 ft) with Golden Hour lighting, an endless 3,500–5,800 ft cumulus cloud sea below, expanded 60 km horizon visibility, and high-altitude twin contrails.',
    'Added a wider, silky-smooth cinematic chase camera, calm cruise speed, and ambient hangar soundtrack for a relaxed, scenic flight feel.',
    'Completely disarmed Free Flight (no cannon, no missiles, no bombs, no flares/chaff/ECM, clean unarmed pylons) and stripped combat HUD clutter (no gun reticle, tactical radar, or weapon/stores panel).'
  ] },
  { version: 'v1.1.56', title: 'FREE FLIGHT POLISH — CLEAR SKY, ZERO OVERLAYS & AUDIO FIX', bullets: [
    'Cleared Canyon Run SITE markers, BRIDGE STRAIT sector badge, and RWR tracks during Free Flight.',
    'Disabled the ocean shader plane and cloud-sea whiteout in Free Flight, raised camera near plane to eliminate skyline Z-fighting, and anchored building bases into sloped terrain.',
    'Gated the 900 Hz departure/spin warning tone strictly to actual stall/spin departures and smoothed F100 turbine whine gain in normal flight.'
  ] },
  { version: 'v1.1.55', title: 'FREE FLIGHT — REAL-WORLD 3D CITIES & TERRAIN', bullets: [
    'Added FREE FLIGHT mission with infinite streaming zoom-13 AWS Terrarium elevation, ESRI World Imagery satellite ground tiles, and 3D extruded OpenFreeMap OSM buildings.',
    'Added 5 scenic location presets (Toronto, Tokyo, San Francisco, New York, Swiss Alps) with parametric 3D landmarks (CN Tower, Tokyo Skytree, One WTC, Transamerica Pyramid) and automatic origin rebasing.'
  ] },
  { version: 'v1.1.54', title: 'REALISTIC F-15C G-LOC & PUSH-PULL PHYSIOLOGY', bullets: [
    'Tuned pilot G physiology to the NASA/USAF F-15C ATAGS + AGSM Stoll curve (matching FlightGear blackout.nas): 5.0 G strain onset, ~10 s to G-LOC at 9 G, and realistic 6 s incapacitation / 7-15 s recovery.',
    'Added the physiological push-pull effect: negative-G pushes prior to a positive-G pull temporarily lower G-LOC onset down toward 3.5 G, while negative-G redout builds from -2 G to -4 G.'
  ] },
  { version: 'v1.1.53', title: 'COMPLETE 58-FILE F-15C AUDIO SUITE', bullets: [
    'Compiled and integrated all 58 FlightGear F-15C sound files into src/audio.js (61 total SFX samples): added aft efflux, intake rush, slipstream wind, ground rattle, JFS/GPU ground power, and canopy close.',
    'Added full 3-stage OWS overload tones (85/92/96%), 900 Hz departure/spin tones, chopped/continuous stall warnings, gear-AoA, Betty low-fuel, flaps transit, tyre sideslip, and 1-12 o\'clock incoming missile callouts.',
    'Wired real AIM-9 explosion, aircraft explosion, fuselage strike, and flare-out samples into combat events with procedural fallback.'
  ] },
  { version: 'v1.1.52', title: 'F-15C SOUND BANK & COCKPIT WARNING AUDIO', bullets: [
    'Compiled and integrated 19 FlightGear F-15C sound assets into src/audio.js, layering real F100 compressor whine, jet exhaust, internal/external afterburner, airbrake, and stall buffet over the procedural engine.',
    'Added real F-15C cockpit warning audio: Bitching Betty VMS alerts (Over-G, Bingo Fuel, Warning), progressive 900 Hz OWS overload tones, High-AoA warning, and Master Caution tone.',
    'Wired real M61A1 Vulcan loop, AIM-9 missile launch, flare salvo, landing gear transit/door lock, and touchdown tyre squeal samples with seamless procedural fallback.'
  ] },
  { version: 'v1.1.51', title: 'TEXT-ONLY RADIO', bullets: [
    'All radio chatter is now text only: AWACS, OVERLORD, WARDEN and CRIMSON lines appear on the cockpit radio display with no voice audio.',
    'Cockpit warnings (PULL UP, OVER G, BINGO FUEL ...) are now a chime plus the HUD warning text, with no spoken voice.',
    'Radio voice clips are no longer downloaded, so sorties load lighter.'
  ] },
  { version: 'v1.1.50', title: 'REACTIVE TACTICAL RADIO', bullets: [
    'AWACS, the carrier OVERLORD, WARDEN-2/3 and CRIMSON-1 now react in real time on the cockpit radio display: fresh, never-repeating text callouts built from live telemetry (bearing, altitude, speed, hull, bandit and ship counts).',
    'Calls cover catapult shots, gear up, wave-skimming, locks, Fox two, gun hits, splashes, sunk ships, incoming missiles, canyon SAM breaches, low hull, empty flares, fleet waves, the bunker kill, the CRIMSON merge and taunts, and every carrier approach milestone.',
    'Urgent threat calls now cut in over routine chatter, and the wave-off, scramble, turnaround and ESM calls that never appeared before now show on the radio display.',
    'Fixed the cockpit glare and launch puff firing when wingmen or base defences launched missiles.'
  ] },
  { version: 'v1.1.49', title: 'MISSION ISOLATION & SMOOTHER FRAMES', bullets: [
    'Fixed NAVAL BATTLE first launches where the stage-1 destroyers could be invisible but still targetable, and stopped the old enemy carrier group from appearing in NAVAL BATTLE and CANYON RUN.',
    'AIR SUPERIORITY now has the same enemy task force whether you launch fresh, replay or switch missions, and ACE DUEL no longer counts missiles or bombs you cannot fire.',
    'Removed per-frame garbage from the HUD, radar lock, flares, particles and cockpit combiner (up to ~145 objects per frame before), for steadier frame times in long sorties.',
    'Hardened radar lock math against a zero-range target and silenced the missing favicon console error.'
  ] },
  { version: 'v1.1.48', title: 'GROUND SITE MEMORY LEAK FIX', bullets: [
    'Fixed a memory leak where every replay or mission switch rebuilt the island SAM and AAA sites without freeing the old ones, so long sessions no longer slowly grow GPU memory.',
    'Retired ground sites now release their meshes and materials, which also applies to the timed ground-target respawn mid-sortie.'
  ] },
  { version: 'v1.1.47', title: 'REPLAY WAVE RESET & DEBRIEF RADIO FIXES', bullets: [
    'Fixed non-staged sorties (AIR SUPERIORITY and FURBALL) after replay or debrief return so BANDIT 01-06 and strike targets respawn cleanly at phase 1 instead of skipping straight to CRIMSON-1.',
    'Cut active flight radio transmissions immediately on sortie end so lines no longer bleed into the debrief, and pumped the radio queue in debrief so ON_MISSION_CLEAR plays cleanly on victory.'
  ] },
  { version: 'v1.1.46', title: 'DUEL COMPLETION, RUNWAY ROTATION & WAVE-OFF CLIMB', bullets: [
    'Fixed ACE DUEL mission completion so downing CRIMSON-1 advances cleanly to carrier RTB and debrief.',
    'Enabled W/S and arrow-key pitch rotation during runway takeoff rolls without engaging wheel brakes, and added a ROTATE prompt past 145 kt.',
    'Fixed carrier autoland wave-off go-arounds to hold full afterburner, retract gear without re-dropping, and fly a controlled climb until pilot override.',
    'Auto-pauses active sorties when switching away from the tab and tapers jet thrust between 14 km and 20 km for a realistic service ceiling.'
  ] },
  { version: 'v1.1.45', title: 'PLAYTEST STABILITY, AUDIO & WINGMAN FIXES', bullets: [
    'Fixed ACE DUEL mission isolation so only CRIMSON-1 spawns with no fleet ships or extra waves, and fixed the G wingman order key cycle so FOCUS returns cleanly to FORM on the third press.',
    'Silenced cold menus and debrief audio completely by gating the transonic rumble modulator and keeping pause/debrief BGM running smoothly without crossfade errors.',
    'Smoothed catapult release climbs so wingmen no longer jump vertically leaving the deck, tuned G onset (3.2 G) with saturated mouse pitch pull and CAS AoA tracking, and constrained autoland wave-off ambushes to the 600-1,200 m glideslope window.',
    'Restored ?alt/?spd runway overrides, eliminated a per-frame cockpit vector allocation and 7 missing radio 404s, enabled Escape to return to briefing from debrief, and un-gated debug test hooks from warp.'
  ] },
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
  { version: 'v1.1.34', title: 'ARCADE COMBAT FEEL', bullets: [
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
