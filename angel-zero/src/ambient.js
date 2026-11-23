// ANGELS ZERO — mission-scoped living-world layer.
//
// One factory-built pool per effect: drifting cloud decks, phase-reactive sky,
// storm swell, moving ship wakes, AA flak puffs, persistent oil-fire columns,
// canyon searchlights + gorge mist, and AFB radar / beacons / distant traffic.
//
// update() touches module scratch only: no `new`, no array/object literals, no
// closures. Systems whose flag is off are skipped completely. Pools are never
// disposed — configure()/reset() only toggle flags and visibility, so switching
// missions can never leak one theatre's props into another.

import { GORGE_FLOOR_Y, GORGE_GATE_Z, GORGE_GATE_N, gorgeCentreX } from './maps.js?v=s99b';

const WIND_X = 6.0, WIND_Z = -2.5;
const SKY_BLEND_S = 18, RTB_BLEND_S = 25;
const SWELL_CALM = 1.0, SWELL_STORM = 2.2;
const SHIP_WAKE_N = 96, SHIP_WAKE_STEP = 25, SHIP_WAKE_LIFE = 6;
const FLAK_N = 40, FLAK_RATE = 3, FLAK_ALT = [600, 2500], FLAK_R = 1500, FLAK_MIN_PLAYER_D = 300;
const SMOKE_COL_N = 6, SMOKE_PER_COL = 32, SMOKE_LIFE = 9;
const SEARCH_N = 12, GORGE_MIST_N = 10;
const BEACON_N = 16, AMB_JET_N = 4, AMB_TRACER_RATE = 0.4;
const WAKE_OWNER_N = 24;

// NAVAL phase 3 darkens the sky; the duel opens in hard sunlight. RTB is golden
// everywhere except AIR_SUPERIORITY (handled in maybeBlend).
const PHASE_SKY = { NAVAL_BATTLE: { 3: 'STORM' }, ACE_DUEL: { 0: 'SUNBREAK' } };
const MISSION_PRESET = { NAVAL_BATTLE: 'DAYLIGHT', ACE_DUEL: 'CLOUD_SEA', CANYON_RUN: 'DAYLIGHT', AIR_SUPERIORITY: 'DAYLIGHT' };

const LOG_V = '#include <common>\n#include <logdepthbuf_pars_vertex>';
const LOG_F = '#include <logdepthbuf_pars_fragment>';
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createAmbient(THREE, env) {
  const { scene, camera, renderer, state: S, combat: C, world, vfx, maps, atmo } = env;
  const cs = env.combatSys || null;
  const DEBUG = !!env.debug;
  const KILL = !!env.ambientOff;
  const oceanU = env.ocean || null;
  const explicitTod = !!env.explicitTod;

  // --- module scratch (never allocated in update) ---
  const _a0 = new THREE.Vector3(), _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3();
  const _aq = new THREE.Quaternion(), _am = new THREE.Matrix4(), _ac = new THREE.Color();
  const _down = new THREE.Vector3(0, -1, 0), _up = new THREE.Vector3(0, 1, 0);
  const _scale = new THREE.Vector2();

  let missionId = '', anyOn = false, oceanOn = false, flakOn = false, smokeOn = false, canyonOn = false, afbOn = false;
  let cloudX = 0, cloudZ = 0, mistK = 0, swell = SWELL_CALM, swellT = SWELL_CALM;
  let lastPhase = -1, lastRtb = false, lastLog = -1, fogMix = 0;
  let camScale = 400;

  // ------------------------------------------------------------------ wakes
  const wakeGeo = new THREE.PlaneGeometry(1, 1); wakeGeo.rotateX(-Math.PI / 2);
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const wakeMesh = new THREE.InstancedMesh(wakeGeo, wakeMat, SHIP_WAKE_N);
  wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wakeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHIP_WAKE_N * 3), 3);
  wakeMesh.frustumCulled = false; wakeMesh.visible = false; scene.add(wakeMesh);
  const wakePos = new Float32Array(SHIP_WAKE_N * 3), wakeAng = new Float32Array(SHIP_WAKE_N);
  const wakeAge = new Float32Array(SHIP_WAKE_N).fill(SHIP_WAKE_LIFE);
  const wakeOwner = new Array(WAKE_OWNER_N).fill(null), wakeLast = new Float32Array(WAKE_OWNER_N * 3), wakeValid = new Uint8Array(WAKE_OWNER_N);
  let wakeHead = 0, wakeLive = 0;
  function wakeDrop(x, z, dx, dz) {
    const i = wakeHead; wakeHead = (wakeHead + 1) % SHIP_WAKE_N;
    wakePos[i * 3] = x; wakePos[i * 3 + 1] = 0.18; wakePos[i * 3 + 2] = z;
    wakeAng[i] = Math.atan2(dx, dz); wakeAge[i] = 0;
  }
  function wakeEmit(owner, pos, vel) {
    const sp = Math.hypot(vel.x, vel.y, vel.z);
    if (sp < 0.5) return;
    let slot = -1;
    for (let i = 0; i < WAKE_OWNER_N; i++) if (wakeOwner[i] === owner) { slot = i; break; }
    if (slot < 0) for (let i = 0; i < WAKE_OWNER_N; i++) if (!wakeOwner[i]) { slot = i; wakeOwner[i] = owner; wakeValid[i] = 0; break; }
    if (slot < 0) return;
    const x = pos.x, z = pos.z;
    if (!wakeValid[slot]) { wakeValid[slot] = 1; wakeLast[slot * 3] = x; wakeLast[slot * 3 + 2] = z; return; }
    const d = Math.hypot(x - wakeLast[slot * 3], z - wakeLast[slot * 3 + 2]);
    if (d < SHIP_WAKE_STEP) return;
    wakeLast[slot * 3] = x; wakeLast[slot * 3 + 2] = z;
    const fx = vel.x / sp, fz = vel.z / sp, c = 0.9426, s = 0.3338;   // ±19.5 deg
    const sx = x - fx * 30, sz = z - fz * 30;
    wakeDrop(sx, sz, fx * c - fz * s, fx * s + fz * c);
    wakeDrop(sx, sz, fx * c + fz * s, -fx * s + fz * c);
  }
  function updateWakes(dt) {
    if (!cs) return;
    const ships = cs.taskForce;
    for (let i = 0; i < ships.length; i++) {
      const t = ships[i];
      if (!t.alive || !t.ship || !t.g || !t.g.visible || !t.vel) continue;
      wakeEmit(t, t.pos, t.vel);
    }
    const a = C.ally;
    if (a && a.root && a.root.visible && a.vel && a.pos) wakeEmit(a, a.pos, a.vel);
    let live = 0;
    const col = wakeMesh.instanceColor.array;
    for (let i = 0; i < SHIP_WAKE_N; i++) {
      if (wakeAge[i] >= SHIP_WAKE_LIFE) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      wakeAge[i] += dt;
      const t = Math.min(1, wakeAge[i] / SHIP_WAKE_LIFE);
      _a0.set(wakePos[i * 3], 0.18, wakePos[i * 3 + 2]);
      _aq.setFromAxisAngle(_up, wakeAng[i]);
      _a3.set(8 + 32 * t, 1, 14 + 26 * t);
      _am.compose(_a0, _aq, _a3); wakeMesh.setMatrixAt(i, _am);
      const b = 0.5 * (1 - t);
      col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b;
      live++;
    }
    wakeLive = live; wakeMesh.count = SHIP_WAKE_N; wakeMesh.visible = live > 0;
    if (live) { wakeMesh.instanceMatrix.needsUpdate = true; wakeMesh.instanceColor.needsUpdate = true; }
  }

  // ------------------------------------------------------------------- flak
  const flakGeo = new THREE.BufferGeometry();
  const flakPos = new Float32Array(FLAK_N * 3), flakAge = new Float32Array(FLAK_N).fill(99), flakSeed = new Float32Array(FLAK_N);
  flakGeo.setAttribute('position', new THREE.BufferAttribute(flakPos, 3).setUsage(THREE.DynamicDrawUsage));
  flakGeo.setAttribute('aAge', new THREE.BufferAttribute(flakAge, 1).setUsage(THREE.DynamicDrawUsage));
  flakGeo.setAttribute('aSeed', new THREE.BufferAttribute(flakSeed, 1).setUsage(THREE.DynamicDrawUsage));
  flakGeo.setDrawRange(0, 0);
  const flakMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aAge; attribute float aSeed; uniform float uScale;
      varying float vAge; varying float vSeed;
      void main() {
        vAge = aAge; vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float sz = aAge < 0.12 ? 9.0 : 6.0 + 22.0 * clamp((aAge - 0.12) / 3.88, 0.0, 1.0);
        gl_PointSize = sz * uScale / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      varying float vAge; varying float vSeed;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.35, 1.0, d)) * (1.0 - clamp(vAge / 4.0, 0.0, 1.0));
        vec3 c = vAge < 0.12 ? vec3(1.0, 0.55, 0.18) : vec3(0.22 + vSeed * 0.08, 0.23, 0.24);
        if (a < 0.004) discard;
        gl_FragColor = vec4(c, a * 0.7);
      }`,
    transparent: true, depthWrite: false
  });
  const flakPoints = new THREE.Points(flakGeo, flakMat);
  flakPoints.frustumCulled = false; flakPoints.visible = false; scene.add(flakPoints);
  let flakHead = 0, flakAcc = 0, flakLive = 0;
  function spawnFlak() {
    if (!cs) return;
    const aa = cs.activeAAShips;
    let cx = 0, cz = 0, n = 0;
    if (aa && aa.n > 0) {
      for (let i = 0; i < aa.n; i++) { cx += aa.positions[i * 2]; cz += aa.positions[i * 2 + 1]; }
      n = aa.n;
    } else {
      const ships = cs.taskForce;
      for (let i = 0; i < ships.length; i++) { const t = ships[i]; if (t.alive && t.g && t.g.visible) { cx += t.pos.x; cz += t.pos.z; n++; } }
    }
    if (!n) return;
    cx /= n; cz /= n;
    const P = S.position, minD2 = FLAK_MIN_PLAYER_D * FLAK_MIN_PLAYER_D;
    for (let k = 0; k < 8; k++) {
      const ang = Math.random() * 6.2831853, r = Math.sqrt(Math.random()) * FLAK_R;
      const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      const y = FLAK_ALT[0] + Math.random() * (FLAK_ALT[1] - FLAK_ALT[0]);
      const dx = x - P.x, dz = z - P.z, dy = y - P.y;
      if (dx * dx + dz * dz + dy * dy < minD2) continue;
      const i = flakHead; flakHead = (flakHead + 1) % FLAK_N;
      flakPos[i * 3] = x; flakPos[i * 3 + 1] = y; flakPos[i * 3 + 2] = z;
      flakAge[i] = 0; flakSeed[i] = Math.random();
      return;
    }
  }
  function updateFlak(dt, phase) {
    if (phase >= 1) {
      flakAcc = Math.min(4, flakAcc + FLAK_RATE * dt);
      while (flakAcc >= 1) { flakAcc -= 1; spawnFlak(); }
    } else {
      flakAcc = 0;
    }
    let live = 0;
    for (let i = 0; i < FLAK_N; i++) {
      if (flakAge[i] >= 4) continue;
      flakAge[i] += dt; live++;
    }
    flakLive = live; flakPoints.visible = live > 0;
    if (live) {
      flakMat.uniforms.uScale.value = camScale;
      markRange(flakGeo.attributes.position, FLAK_N * 3);
      markRange(flakGeo.attributes.aAge, FLAK_N);
      markRange(flakGeo.attributes.aSeed, FLAK_N);
      flakGeo.setDrawRange(0, FLAK_N);
    }
  }
  function markRange(attr, n) {
    if (attr.clearUpdateRanges) attr.clearUpdateRanges();
    if (attr.addUpdateRange) attr.addUpdateRange(0, n);
    attr.needsUpdate = true;
  }

  // ------------------------------------------------------- oil-fire columns
  const SMOKE_N = SMOKE_COL_N * SMOKE_PER_COL;
  const smokeGeo = new THREE.BufferGeometry();
  const smokePos = new Float32Array(SMOKE_N * 3), smokeAge = new Float32Array(SMOKE_N).fill(99);
  const smokeSeed = new Float32Array(SMOKE_N), smokeFire = new Float32Array(SMOKE_N);
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute('aAge', new THREE.BufferAttribute(smokeAge, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute('aFire', new THREE.BufferAttribute(smokeFire, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute('aSeed', new THREE.BufferAttribute(smokeSeed, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setDrawRange(0, 0);
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aAge; attribute float aFire; attribute float aSeed;
      uniform float uScale; varying float vAge; varying float vFire; varying float vSeed;
      void main() {
        vAge = aAge; vFire = aFire; vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float sz = 12.0 + 46.0 * clamp(aAge / 9.0, 0.0, 1.0);
        gl_PointSize = sz * uScale / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      varying float vAge; varying float vFire; varying float vSeed;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.25, 1.0, d)) * (1.0 - clamp(vAge / 9.0, 0.0, 1.0)) * 0.6;
        float g = 0.10 + vSeed * 0.06;
        vec3 c = mix(vec3(g, g, g), vec3(1.0, 0.46, 0.12), vFire * (1.0 - smoothstep(0.0, 1.5, vAge)));
        if (a < 0.004) discard;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false
  });
  const smokePoints = new THREE.Points(smokeGeo, smokeMat);
  smokePoints.frustumCulled = false; smokePoints.visible = false; scene.add(smokePoints);
  const colClaim = new Uint8Array(SMOKE_COL_N), colX = new Float32Array(SMOKE_COL_N), colZ = new Float32Array(SMOKE_COL_N);
  const colAge = new Float32Array(SMOKE_COL_N), colHead = new Int32Array(SMOKE_COL_N);
  let smokeCols = 0;
  function claimColumn(x, z) {
    if (KILL || !smokeOn) return;
    let c = -1;
    for (let i = 0; i < SMOKE_COL_N; i++) if (!colClaim[i]) { c = i; break; }
    if (c < 0) for (let i = 0; i < SMOKE_COL_N; i++) if (colAge[i] > colAge[(c < 0 ? 0 : c)]) c = i;
    if (c < 0) c = 0;
    if (!colClaim[c]) smokeCols++;
    colClaim[c] = 1; colX[c] = x; colZ[c] = z; colAge[c] = 0; colHead[c] = 0;
  }
  function updateSmoke(dt) {
    if (!smokeCols) { smokePoints.visible = false; return; }
    let spawned = false, fireDirty = false;
    for (let c = 0; c < SMOKE_COL_N; c++) {
      if (!colClaim[c]) continue;
      colAge[c] += dt;
      for (let j = 0; j < SMOKE_PER_COL; j++) {
        const i = c * SMOKE_PER_COL + j;
        if (smokeAge[i] >= SMOKE_LIFE) {
          const a = Math.random() * 6.2831853, r = Math.random() * 14;
          smokePos[i * 3] = colX[c] + Math.cos(a) * r;
          smokePos[i * 3 + 1] = 8;
          smokePos[i * 3 + 2] = colZ[c] + Math.sin(a) * r;
          smokeAge[i] = 0; smokeSeed[i] = Math.random(); smokeFire[i] = 1;
          spawned = true; fireDirty = true;
        } else {
          smokeAge[i] += dt;
          smokePos[i * 3 + 1] += 8 * dt;
          smokePos[i * 3] += WIND_X * dt * 0.32;
          smokePos[i * 3 + 2] += WIND_Z * dt * 0.32;
          const nf = smokeAge[i] < 1.5 ? 1 : 0;
          if (nf !== smokeFire[i]) { smokeFire[i] = nf; fireDirty = true; }
        }
      }
    }
    smokePoints.visible = true;
    smokeMat.uniforms.uScale.value = camScale;
    markRange(smokeGeo.attributes.position, SMOKE_N * 3);
    markRange(smokeGeo.attributes.aAge, SMOKE_N);
    if (fireDirty) markRange(smokeGeo.attributes.aFire, SMOKE_N);
    if (spawned) markRange(smokeGeo.attributes.aSeed, SMOKE_N);
    smokeGeo.setDrawRange(0, SMOKE_N);
  }

  // ------------------------------------------------------------ searchlights
  const searchGeo = new THREE.ConeGeometry(60, 900, 16, 1, true);
  searchGeo.translate(0, -450, 0);                       // apex at the local origin, body along -Y
  const searchMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: LOG_V + `
      varying float vAx;
      void main() { vAx = clamp(-position.y / 900.0, 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      uniform float uTime; varying float vAx;
      void main() {
        #include <logdepthbuf_fragment>
        float a = pow(1.0 - vAx, 1.5) * 0.16 * (0.8 + 0.2 * sin(uTime * 7.0 + vAx * 9.0));
        if (a < 0.004) discard;
        gl_FragColor = vec4(1.0, 0.92, 0.70, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  const searchMesh = new THREE.InstancedMesh(searchGeo, searchMat, SEARCH_N);
  searchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  searchMesh.frustumCulled = false; searchMesh.visible = false; scene.add(searchMesh);
  const searchBase = new Float32Array(SEARCH_N * 3), searchDir = new Float32Array(SEARCH_N * 3), searchSite = new Int16Array(SEARCH_N).fill(-1);
  {
    const sites = cs && cs.rimSites;
    for (let i = 0; i < SEARCH_N; i++) {
      searchSite[i] = (i * 2) % Math.max(1, sites ? sites.length : 1);
      const s = sites && sites[searchSite[i]];
      if (s) { searchBase[i * 3] = s.x; searchBase[i * 3 + 1] = s.y + 10; searchBase[i * 3 + 2] = s.z; }
      else { const z = GORGE_GATE_Z[i % GORGE_GATE_N]; searchBase[i * 3] = gorgeCentreX(z) + 300; searchBase[i * 3 + 1] = GORGE_FLOOR_Y + 300; searchBase[i * 3 + 2] = z; }
    }
  }
  function updateSearch(dt, now) {
    const st = C.ceil && C.ceil.st;
    const lock = st === 'WARN' || st === 'BARRAGE';
    searchMat.uniforms.uTime.value = now;
    for (let i = 0; i < SEARCH_N; i++) {
      const b = i * 3, ph = now * 0.35 + i * 1.7;
      const yaw = Math.sin(ph) * 1.1, pitch = (25 + 30 * (0.5 + 0.5 * Math.sin(ph * 0.7))) * 0.017453293;
      let dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
      if (lock) {
        _a1.set(S.position.x - searchBase[b], S.position.y - searchBase[b + 1], S.position.z - searchBase[b + 2]).normalize();
        const k = 1 - Math.exp(-1.5 * dt);
        dx += (_a1.x - dx) * k; dy += (_a1.y - dy) * k; dz += (_a1.z - dz) * k;
      }
      const inv = 1 / (Math.hypot(dx, dy, dz) || 1);
      dx *= inv; dy *= inv; dz *= inv;
      searchDir[b] = dx; searchDir[b + 1] = dy; searchDir[b + 2] = dz;
      _a0.set(searchBase[b], searchBase[b + 1], searchBase[b + 2]);
      _aq.setFromUnitVectors(_down, _a2.set(dx, dy, dz));
      const dead = cs && cs.siteOn && searchSite[i] >= 0 && cs.siteOn[searchSite[i]] === 0;
      _a3.set(dead ? 0 : 1, dead ? 0 : 1, dead ? 0 : 1);
      _am.compose(_a0, _aq, _a3);
      searchMesh.setMatrixAt(i, _am);
    }
    searchMesh.count = SEARCH_N; searchMesh.visible = true;
    searchMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------- gorge mist
  function softSprite() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  }
  const softTex = softSprite();
  const mistGroup = new THREE.Group(); mistGroup.visible = false; scene.add(mistGroup);
  const mistSprites = [];
  const mistBase = new Float32Array(GORGE_MIST_N * 2);
  for (let i = 0; i < GORGE_MIST_N; i++) {
    const z = GORGE_GATE_Z[(i * 3) % GORGE_GATE_N], x = gorgeCentreX(z);
    mistBase[i * 2] = x; mistBase[i * 2 + 1] = z;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xc9d3da, transparent: true, opacity: 0.22, depthWrite: false, fog: true }));
    sp.position.set(x, GORGE_FLOOR_Y + 15, z); sp.scale.set(420, 150, 1);
    mistGroup.add(sp); mistSprites.push(sp);
  }
  function updateMistSprites(now) {
    for (let i = 0; i < GORGE_MIST_N; i++) {
      const sp = mistSprites[i];
      sp.position.x = mistBase[i * 2] + Math.sin(now * 0.12 + i * 2.1) * 40;
      sp.position.z = mistBase[i * 2 + 1] + Math.cos(now * 0.09 + i * 1.7) * 40;
    }
    mistGroup.visible = true;
  }

  // ------------------------------------------------------- AFB radar/beacons
  const radars = (world.envProps && world.envProps.radar) || [];
  const beaconGeo = new THREE.BufferGeometry();
  const beaconPos = new Float32Array(BEACON_N * 3), beaconSeed = new Float32Array(BEACON_N);
  {
    const props = (world.envProps && world.envProps.baseBldg) || [];
    let k = 0;
    for (let i = 0; i < BEACON_N; i++) {
      const o = props[i % Math.max(1, props.length)] || radars[i % Math.max(1, radars.length)];
      if (o) { beaconPos[i * 3] = o.position.x; beaconPos[i * 3 + 1] = o.position.y + 42; beaconPos[i * 3 + 2] = o.position.z; }
      beaconSeed[i] = i * 0.37; k++;
    }
  }
  beaconGeo.setAttribute('position', new THREE.BufferAttribute(beaconPos, 3));
  beaconGeo.setAttribute('aSeed', new THREE.BufferAttribute(beaconSeed, 1));
  const beaconMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aSeed; uniform float uScale; varying float vSeed;
      void main() { vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 7.0 * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      uniform float uTime; varying float vSeed;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float blink = 0.5 + 0.5 * sin(uTime * 6.2831853 + vSeed);
        float a = (1.0 - smoothstep(0.3, 1.0, d)) * (0.12 + 0.88 * blink);
        if (a < 0.01) discard;
        gl_FragColor = vec4(1.0, 0.12, 0.10, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const beacons = new THREE.Points(beaconGeo, beaconMat);
  beacons.frustumCulled = false; beacons.visible = false; scene.add(beacons);

  // --------------------------------------------------------- ambient traffic
  const jets = [], jetRibbons = [];
  for (let i = 0; i < AMB_JET_N; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xdde8f4, transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
    sp.scale.set(90, 90, 1); sp.visible = false; scene.add(sp); jets.push(sp);
    const r = vfx.makeRibbon({ w0: 0.7, w1: 3.4, life: 5, alpha: 0.32, step: 8, far: [2000, 14000] });
    r.mesh.visible = false; jetRibbons.push(r);
  }
  let tracerAcc = 0;
  const jetPos = new Float32Array(AMB_JET_N * 3);
  function updateTraffic(dt, now) {
    const cp = camera.position;
    for (let i = 0; i < AMB_JET_N; i++) {
      const a = now * 0.045 + i * 6.2831853 / AMB_JET_N, r = 8000 + 2000 * (i % 2);
      const x = Math.cos(a) * r, z = -3000 + Math.sin(a) * r, y = 6000 + 1500 * (i % 3);
      jetPos[i * 3] = x; jetPos[i * 3 + 1] = y; jetPos[i * 3 + 2] = z;
      jets[i].position.set(x, y, z); jets[i].visible = true;
      _a0.set(x, y, z); jetRibbons[i].emit(_a0, 1, now); jetRibbons[i].update(cp, now);
    }
    tracerAcc += dt * AMB_TRACER_RATE;
    while (tracerAcc >= 1) {
      tracerAcc -= 1;
      const i = (Math.random() * AMB_JET_N) | 0, b = i * 3;
      _a0.set(jetPos[b], jetPos[b + 1], jetPos[b + 2]);
      const a = Math.random() * 6.2831853;
      _a1.set(Math.cos(a) * 240, (Math.random() - 0.5) * 90, Math.sin(a) * 240);
      vfx.aaTracer.add(_a0, _a1, 0.34, true);
    }
  }

  // --------------------------------------------------------------- sky/swell
  function maybeBlend() {
    if (explicitTod || !atmo) return;
    const phase = C.missionPhase | 0, rtb = !!C.rtb;
    if (rtb && !lastRtb) {
      lastRtb = true; lastPhase = phase;
      if (missionId !== 'AIR_SUPERIORITY') atmo.blendTo('GOLDEN_HOUR', RTB_BLEND_S);
      return;
    }
    if (!rtb) lastRtb = false;
    const table = PHASE_SKY[missionId];
    if (lastPhase === -2) {                    // first frame after configure(): treat as phase 0
      lastPhase = phase;
      const opening = table && table[0];
      if (opening) atmo.blendTo(opening, SKY_BLEND_S);
      return;
    }
    if (phase !== lastPhase) {
      lastPhase = phase;
      const name = table && table[phase];
      if (name) atmo.blendTo(name, SKY_BLEND_S);
    }
  }
  const stormNow = () => missionId === 'NAVAL_BATTLE' && (C.missionPhase | 0) >= 3 && !C.rtb;

  // ----------------------------------------------------------------- public
  function configure(id) {
    missionId = id || '';
    if (KILL) oceanOn = flakOn = smokeOn = canyonOn = afbOn = false;
    else {
      oceanOn = missionId === 'NAVAL_BATTLE' || missionId === 'ACE_DUEL';
      flakOn = missionId === 'NAVAL_BATTLE';
      smokeOn = true;
      canyonOn = missionId === 'CANYON_RUN';
      afbOn = missionId === 'AIR_SUPERIORITY';
    }
    anyOn = oceanOn || flakOn || smokeOn || canyonOn || afbOn;
    lastPhase = -2; lastRtb = !!(C && C.rtb); swellT = SWELL_CALM;
    searchMesh.visible = canyonOn; mistGroup.visible = canyonOn;
    for (let i = 0; i < GORGE_MIST_N; i++) mistSprites[i].visible = canyonOn;
    beacons.visible = false;
    for (let i = 0; i < AMB_JET_N; i++) { jets[i].visible = false; jetRibbons[i].mesh.visible = false; }
  }
  function reset() {
    cloudX = cloudZ = mistK = 0; swell = swellT = SWELL_CALM; fogMix = 0;
    flakAge.fill(99); flakAcc = 0; flakLive = 0; flakGeo.setDrawRange(0, 0); flakPoints.visible = false;
    colClaim.fill(0); smokeAge.fill(99); smokeCols = 0; smokeGeo.setDrawRange(0, 0); smokePoints.visible = false;
    wakeAge.fill(SHIP_WAKE_LIFE); wakeOwner.fill(null); wakeValid.fill(0); wakeHead = 0; wakeLive = 0;
    wakeMesh.count = 0; wakeMesh.visible = false;
    searchMesh.count = 0; searchMesh.visible = false; mistGroup.visible = false;
    beacons.visible = false;
    for (let i = 0; i < AMB_JET_N; i++) { jets[i].visible = false; jetRibbons[i].clear(); jetRibbons[i].mesh.visible = false; }
    vfx.setWind(0, 0); vfx.setMistBoost(0);
    if (oceanU) { oceanU.uSwell.value = SWELL_CALM; oceanU.uScroll.value.set(0, 0); }
    if (atmo && MISSION_PRESET[missionId]) atmo.blendTo(MISSION_PRESET[missionId], 0);
    lastPhase = -1; lastRtb = false;
  }
  function update(dt, now) {
    if (KILL) return;
    if (renderer && renderer.domElement) camScale = renderer.domElement.height / (2 * Math.tan((camera.fov || 60) * 0.5 * 0.017453293));
    // Clouds drift on every map; the deck punch-through is strongest in CLOUD_ARENA.
    cloudX = (cloudX + WIND_X * dt) % 4096; cloudZ = (cloudZ + WIND_Z * dt) % 4096;
    if (cloudX < 0) cloudX += 4096; if (cloudZ < 0) cloudZ += 4096;
    vfx.setWind(cloudX, cloudZ);
    const cs2 = world.map && world.map.cloudSea;
    mistK = cs2 ? smooth(cs2.base - 60, cs2.base + 40, S.position.y) * (1 - smooth(cs2.top - 40, cs2.top + 60, S.position.y)) : 0;
    vfx.setMistBoost(mistK);
    maybeBlend();
    if (oceanOn) {
      swellT = stormNow() ? SWELL_STORM : SWELL_CALM;
      swell += (swellT - swell) * Math.min(1, dt * 0.12);
      if (oceanU) {
        oceanU.uSwell.value = swell;
        oceanU.uScroll.value.set(cloudX * 0.02, cloudZ * 0.02);
      }
      fogMix += ((stormNow() ? 0.7 : 0) - fogMix) * Math.min(1, dt * 0.15);
      updateWakes(dt);
    }
    if (flakOn && C.missionPhase >= 1) updateFlak(dt, C.missionPhase);
    if (smokeOn) updateSmoke(dt);
    if (canyonOn) { updateSearch(dt, now); updateMistSprites(now); }
    if (afbOn) {
      for (let i = 0; i < radars.length; i++) if (radars[i]) radars[i].rotation.y += 0.9 * dt;
      const lights = world.envProps && world.envProps.lights;
      beacons.visible = !!(lights && lights.length && lights[0].visible);
      if (beacons.visible) { beaconMat.uniforms.uTime.value = now; beaconMat.uniforms.uScale.value = camScale; }
      updateTraffic(dt, now);
    }
    if (DEBUG) {
      const t = Math.floor(now);
      if (t !== lastLog) {
        lastLog = t;
        console.log('[ANGELS_ZERO] ambient m=' + missionId + ' sky=' + (atmo && atmo.active ? atmo.active.name : '-') +
          ' swell=' + swell.toFixed(2) + ' flak=' + flakLive + ' smoke=' + smokeCols + ' wakes=' + wakeLive +
          ' search=' + (canyonOn ? SEARCH_N : 0) + ' beacons=' + (afbOn && beacons.visible ? BEACON_N : 0) +
          ' traffic=' + (afbOn ? AMB_JET_N : 0));
      }
    }
  }
  function stats() {
    let jetsOn = 0; for (let i = 0; i < AMB_JET_N; i++) if (jets[i].visible) jetsOn++;
    return { mission: missionId, sky: atmo && atmo.active ? atmo.active.name : '', swell: +swell.toFixed(3),
      flak: flakLive, smoke: smokeCols, wakes: wakeLive, search: canyonOn ? SEARCH_N : 0,
      beacons: afbOn && beacons.visible ? BEACON_N : 0, traffic: afbOn ? AMB_JET_N : 0, mist: +mistK.toFixed(3),
      render: { flak: flakPoints.visible, smoke: smokePoints.visible, wakes: wakeMesh.visible,
        search: searchMesh.visible, gorgeMist: mistGroup.visible, beacons: beacons.visible, traffic: jetsOn } };
  }
  return { configure, update, reset, stats, claimColumn, get rain() { return fogMix; }, get mistGain() { return fogMix; }, get enabled() { return anyOn && !KILL; } };
}
