angel-zero/index.html -> kbAxis/kbHeld/KB_RATE/KB_BLEND_OUT/kbActive/kbHold, invertPitch, throttleDelta(), ?kb= + __kbDebug(), WASD key handlers, Shift/Ctrl/arrow/wheel throttle, Q/E yaw, V roll, P eject, clearFlightInput() blur/visibility guards; angel-zero/src/hud.js -> WASD rows in F1 sheet; angel-zero/src/combat.js -> RETURN_Z=8000 / RETURN_CD=25, return beacons + crossing refill, 6 approach gates (carrier + RWY 36), TRAP BONUS, chaff radar-lock break, RADAR/IR callouts, stats().assist/returnT; angel-zero/index.html -> gearAutoLock + state.assist ILS assist in updatePhysics(), ?returnat / ?approachat / ?chaffat hooks; angel-zero/src/audio.js -> chaff(); angel-zero/src/hud.js -> RETURN banner + recovery chevron + ILS ASSIST row
angel-zero/assets/models/uss_enterprise.glb -> allied CVN model (1.89 MB meshopt + WebP); angel-zero/scripts/optimize_carrier.py -> 512px detail-map downscale; index.html -> MeshoptDecoder, ?memtest restart memory trace, DPR cap; angel-zero/src/combat.js -> CARRIER_* constants, buildAlliedCarrier(), loadCarrier()/env.loadCarrier, placeAllyLights(), allyCollision(), stats().ally; angel-zero/index.html -> ?at=carrier|carrierdeck, trapat/catat anchors, carrierLoadPromise, TRAP_X/TRAP_DY
angel-zero/scripts/make_portraits.py -> six 128x160 webp portraits from art_src/portraits/warden_source.webp; angel-zero/assets/portraits/*.webp -> deployed images; angel-zero/index.html -> #crtBox/#activePortrait/#crtTag CSS (crtIn/crtRoll/crtFlick), PORTRAIT/CRT_COL/portraitImg maps, onWing() portrait+tint dispatch, syncCrtVisible()
angel-zero/index.html -> post-stall flight: AOA_COUPLE/PSM_KT/APEX_* constants, _nose/_fw scratch, man{} + awardManeuver(); updatePhysics() PSM/apex/spin/decoupled AoA; src/combat.js -> STYLE.PSM, ace e.psm visual pitch in orient(), stats().psm; src/hud.js -> maneuver banner + F1 rows; src/vfx.js -> high-AoA vapor
angel-zero/index.html -> borderless STANDBY UI: #sbMenu / .sbRow (sbMove/sbCycle/sbConfirm/sbAction/syncSBMenu/SB_DESC), #flightRoster + syncSBRoster(), #missionBenchmark + syncSBBenchmark(), #sbHints, #ctrlOverlay + setCtrlOpen()/syncCtrlUI(); legacy #menu kept in DOM with all ids/listeners; src/audio.js -> setMusicVolume() + angelsZero_musicVol
angel-zero/src/patchnotes.js:5 -> PATCH_NOTES (newest-first releases); :88 -> renderPatchNotes(container)
angel-zero/index.html:428 -> patchnotes.js import; :274 -> buildChip; :282 -> #patchOverlay modal CSS; :292 -> #patchBody scroll CSS; :432 -> briefing PATCH NOTES button; :1399 -> ESC dismiss; :1484 -> BUILD_VERSION / setPatchOpen / wheel+touchmove guards
angel-zero/src/telemetry.js:4 -> TELE_MAX / EV constants; :8 -> fixed Float32Array buffers, tick()/event()/reset()
angel-zero/index.html:2552 -> tele = createTelemetry(); :2560 -> onTele / getTeleStats env hooks; :3100 -> tele.tick() in stepSim
angel-zero/index.html:1254 -> computeRank(); :1272 -> dbMap canvas; :1312 -> drawDebriefMap(); :1353 -> startDebriefMap() / RAF cleanup; :458 -> #dbTrace button
angel-zero/src/hud.js:1999 -> topoCanvas getter; angel-zero/src/profile.js:83 -> rankOverride
angel-zero/src/loadout.js:5 -> MODE_KEY / MODES; :31 -> loadMode / saveMode
angel-zero/src/combat.js:26 -> FURBALL constants; :682 -> furballTick(dt); :3710 -> setMode(id); :3819 -> stats().furball
angel-zero/index.html:2768 -> mode chip / button + syncModeUI(); :1214 -> FURBALL hot start in startSortie(); :1603 -> double-Tab end-sortie; :1275 -> furball rank; :1419 -> furball debrief cells
angel-zero/src/hud.js:1361 -> TAB-again banner
angel-zero/index.html:896 -> MFD_PAGES / mfdPage / slowActive(); :1637 -> [ / ] keys; :2801 -> ?mfdpage screenshot hook
angel-zero/src/cockpit3d.js:898 -> paintTacRadar(); :941 -> paintStores(); :976 -> paintThreatScope(); :832 -> mfdSignature(); :1237 -> setMfdPage()
angel-zero/src/audio.js:654 -> mfdClick(); angel-zero/src/hud.js:1363 -> MFD banner
angel-zero/src/combat.js:26 -> MP phase labels; :1909 -> primaryTargets(); :1932 -> updateMissionPhase(); :3010 -> instanced approach gates; :3796 -> onCarrierTrap()
angel-zero/index.html:1585 -> F1 cheat key; :1841 -> trap → mission complete; :3025 -> ?mphaseat debug; :2827 -> HUD getPrimary
angel-zero/src/hud.js:1576 -> objective card + chevron; :1630 -> prompt pill; :1669 -> F1 sheet
angel-zero/src/audio.js:92 -> radioBus; :1026 -> preloadRadio(); :1044 -> playRadio() / stopRadio(); :1013 -> radioClick()
angel-zero/index.html:2497 -> radioPlay(); :2504 -> radioEvent() ; :2548 -> window.__playTrailerLine; :2573 -> __audioDebug().radio; :3097 -> ?radioat / ?radiohero
angel-zero/index.html:2914 -> animate(); :841 -> advanceTimeScale(realDt); :847 -> triggerSlowMo(); :1962 -> updateMissileCamState(realDt); :1984 -> updateCameraAndVisuals(dt, now)
angel-zero/src/vfx.js:24 -> createVFX(THREE, env)
angel-zero/src/vfx.js:209 -> class Ribbon({w0,w1,life,alpha,wisp,step,minDt,far}); :186 -> RIB_V uFar uniform
angel-zero/src/vfx.js:300 -> CONTRAIL_N / NOZ / contrails pool; :308 -> updateContrails(emitters, now); :1161 -> vfx.mist
angel-zero/src/vfx.js:410 -> updateMachCone(dt, mach, isCockpit)
angel-zero/index.html:2120 -> nvg (global composer wrapper)
angel-zero/src/nvg.js:15 -> createNVG(THREE, renderer, post)
angel-zero/src/nvg.js:121 -> setSize(); :25 -> composer / renderPass / bloom (globals)
angel-zero/src/nvg.js:30 -> UnrealBloomPass(size, 0.48, 0.32, 0.92)
angel-zero/src/nvg.js:134 -> render(scene, camera, t, cockpit)

angel-zero/index.html:792 -> state (global: position, velocity, quaternion, speed, mach, throttle, afterburner)
angel-zero/index.html:1562 -> updatePhysics(dt); :1490 -> updateCarrierOp(dt)
angel-zero/index.html:1400 -> state.mach = speed / sos
angel-zero/index.html:1469 -> state.pitchRate += qDot * dt
angel-zero/index.html:1527 -> state.rollRate += (pCmd - state.rollRate) * dt; :1528 -> wakeRoll bump
angel-zero/index.html:1599 -> engineThrust(mach)
angel-zero/index.html:1605 -> SINGLE_ENGINE_K (global)
angel-zero/src/combat.js:2943 -> syncEngineFlags()
angel-zero/src/combat.js:2961 -> igniteEngine(reason, side)
angel-zero/src/combat.js:3044 -> updateDamage(dt, playerActive)

angel-zero/src/combat.js:477 -> enemies (global pool)
angel-zero/src/combat.js:815 -> updateEnemy(e, dt, playerActive)
angel-zero/src/combat.js:287 -> missiles (global pool)
angel-zero/src/combat.js:304 -> director (global)
angel-zero/src/combat.js:332 -> launch(fromPos, fromQuat, fromVel, target, enemy, quality, visual, guidance); :1231 -> destroyEnemy(e, byMissile, how)
angel-zero/src/combat.js:2774 -> buildAlliedCarrier(); :2793 -> updateAlly(dt); :671 -> spawnAceFlight(); :666 -> waveAlive(); :1826 -> updateWingmen(dt); :1820 -> setWingOrder(); :1811 -> updateMissiles(dt, playerActive)
angel-zero/src/combat.js:1884 -> fuse = m.enemy ? 22 : 18; :1899 -> flyby trigger (dist, k, side)
angel-zero/src/combat.js:2250 -> dispenseChaff(); :2268 -> updateChaff(dt)
angel-zero/src/combat.js:15 -> strike / EW constants; :2592 -> STRIKE_GEO (pooled); :2598 -> buildStrikeTgt(i); :2611 -> strikeAlive(); :2612 -> JAM_C; :2641 -> spawnSurface(); :2770 -> groundCandidates()
angel-zero/src/combat.js:2334 -> detonateBomb(); :2693 -> destroySurface(); :1734 -> updateLock(dt); :1868 -> updateRWR(); :3552 -> update(dt,now,opts) jamming block
angel-zero/src/combat.js:41 -> MSL_QAAM quality; :1620 -> QAAM constants; :1834 -> fireQAAM(); :2192 -> setWeapon(); :2207 -> toggleWeapon(); :2209 -> setSPW(id)
angel-zero/src/combat.js:2743 -> surfaceSAM(from, label)
angel-zero/src/combat.js:2682 -> updateFleet(dt)

angel-zero/index.html:832 -> blastShake / flyShake / wakeRoll (globals); :838 -> timeScale / slowMo / mcam (globals)
angel-zero/index.html:988 -> setView(fp)
angel-zero/index.html:1394 -> Space -> setView(!firstPerson); :1407 / :1447 -> M / RMB -> mcam.held
angel-zero/index.html:1984 -> updateCameraAndVisuals(dt, now); :816 -> wingmen (global pool)
angel-zero/index.html:836 -> contrailEm (reused emitters); :837 -> cloudWet; :2156 -> vfx.updateContrails(); :2172 -> canopyGlass.update(rain = max(rainHere, cloudWet))
angel-zero/index.html:871 -> prevPlanePos (global)
angel-zero/index.html:1352 -> freeLook (global)
angel-zero/index.html:945 -> ?at=canyonlow spot; :935 -> ?contrailalt hook; :2746 -> ?strikekillat hook; :2549 -> getStrikeTargets HUD env
angel-zero/src/loadout.js:5 -> SPW_KEY / LIVERY_KEY; :7 -> SPW; :13 -> SQUADRON; :26..29 -> load / save helpers
angel-zero/src/livery.js:12 -> createLivery(THREE, model, LIVERIES, wingMeshes); :128 -> paint(L); :157 -> applySquadron(id); :94 -> dice decal + mesh clones
angel-zero/index.html:273 -> loadoutChip; :348 -> spwRow; :1271 -> syncLoadoutUI(); :1278 -> renderHangar(); :2623 -> createLivery(..., wingmen.map(w=>w.mesh))
angel-zero/src/hud.js:1146 -> SPW stores row (drawBottomRight)

angel-zero/src/audio.js:12 -> createAudio()
angel-zero/src/audio.js:13 -> ctx / master / cockpitLP / N (globals)
angel-zero/src/audio.js:266 -> explosion(intensity, delay)
angel-zero/src/audio.js:309 -> flybyWhoosh(k, cockpit)
angel-zero/src/audio.js:170 -> mist patter nodes (mist / mistHP / mistBP / mistG / mistLFO / mistAM); :1225 -> update(p) mist ramps; :1287 -> get mist()
angel-zero/src/audio.js:586 -> masterCaution(); :643 -> cableScreech(); :660 -> catapult(); :673 -> aceWarning(); :677 -> slowMo()
angel-zero/index.html:495 -> PERF_DEBUG / renderer.info.autoReset (globals); :842 -> onFlyby({ dist, k, side }); :1412 -> Z chaff / J ECM / L gear / G orders; :2231 -> onWing(text, caption, tint); :2309 -> onSfx(type, pos, scale); :2260 -> __audioDebug mist; :2852 -> warp contrailStats log
angel-zero/src/hud.js:102 -> alertState / alertOverride (globals)
angel-zero/src/hud.js:1222 -> drawBanner(ctx, cx, y, text, col, w, alpha)
angel-zero/src/hud.js:1278 -> drawJam(ctx); :1294 -> drawStrikeTargets(ctx); :1326 -> drawCenterBanners(ctx, g)
angel-zero/src/hud.js:1557 -> draw(); :1483 -> drawWingmen(ctx); :1743 -> drawAceFlightMark(ctx, e, p)
angel-zero/src/hud.js:1858 -> hudAlertState / setAlertState(s)
