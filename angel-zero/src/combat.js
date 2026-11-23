// ANGELS ZERO — dogfight systems.
// Six-ship bogey squadron (instanced F-15 airframes with an aggressor tint) flying
// bank-to-turn PATROL / ENGAGE / EVADE_BREAK / BARREL_ROLL / EXTEND_CLIMB AI
// with terrain look-ahead, merge break-aways, wingman separation, AI flares and
// airframe collision; APG-63 auto-designation + C-key seeker lock, >4AAM
// track-while-scan ripple fire, ALR-56C RWR picture, ALQ-135 ECM (Z); M61 cannon with instanced tracers, AIM-9 missiles
// with proportional navigation and smoke trails, layered explosions, tumbling
// burning wrecks that splash, scoring, waves, lock-on and threat warnings.

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIFFICULTY_PRESETS } from './difficulty.js?v=s9ba';
import { SPW } from './loadout.js?v=s9ba';
import { missionConfig } from './missions.js?v=s9ba';
import { gorgeCentreX, gorgeSlope, gorgeHeading, gorgeDist, GORGE_GATE_Z, GORGE_GATE_N, GORGE_FLOOR_Y, GORGE_RIM_Y,
  GORGE_CRATER_Z, GORGE_CRATER_R, GORGE_CRATER_WALL_Y, GORGE_FORT, GORGE_ARC_M, GORGE_SPAWN_Z, CEIL_M,
  GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_ZB, GORGE_SC_HALF_W, GORGE_SC_ARCH_Z, GORGE_SC_ARCH_Y0,
  GORGE_SC_ARCH_W, GORGE_SC_SKIP, GORGE_SC_SAVE_M } from './maps.js?v=s9ba';

const NM = 1852, FT = 0.3048, G0 = 9.81;
// Allied CVN model: same 360 m deck as the procedural ship, re-anchored to the GLB.
const CARRIER_GLB = 'assets/models/uss_enterprise.glb', CARRIER_RAW_LEN = 476.85, CARRIER_LEN = 360,
  CARRIER_SCALE = CARRIER_LEN / CARRIER_RAW_LEN, CARRIER_DECK_Y = 18, DECK_HALF_W = 26, DECK_HALF_L = 175;
const CARRIER_DECK_ASL = 19, CARRIER_LEN_M = 360, CARRIER_MIN_FREEBOARD = 15;
// Resolves only after the GLB is mounted, scaled, waterlined, ray-cast and matrix-updated.
let resolveCarrierReady = null;
export const carrierReady = new Promise(resolve => { resolveCarrierReady = resolve; });
// Bow catapult opening: 0 -> 175 kt (90 m/s) in 2.4 s along a 108 m stroke.
// CAT_ACC * CAT_T = CAT_VEND and 0.5 * CAT_ACC * CAT_T^2 = CAT_LEN.
export const CAT_VEND = 90, CAT_T = 2.4, CAT_ACC = 37.5, CAT_LEN = 108;
export const CAT_ARM_T = 0.35, CAT_ROT_DEG = 4, CAT_JBD_DZ = 14;
const CAT_Z0 = -CARRIER_LEN / 2 + CAT_LEN;             // -72 m: stroke ends at the bow edge (-180 m)
export const CAT_BOW = [{ x: -6, z: CAT_Z0, yaw: 0, key: 'bow0' }, { x: 6, z: CAT_Z0, yaw: 0, key: 'bow1' }];
export const CAT_WAIST = [{ x: -22, z: CAT_Z0, yaw: -9, key: 'waist0' }];
export const WING_CAT_DT = [0.6, 1.3];
const CAT_JBD_UP = -55 * Math.PI / 180;
const CAT_TRAP_X = 22;
const CARRIER_TRAP_DY = 5.5;                             // ray fallback when a deck hit misses
// Strike campaign: four jammer bunkers, one-shot-per-sortie, altitude-gated EW field.
const STRIKE_N = 4, STRIKE_HP_K = 2.2, STRIKE_SPLASH = 35, STRIKE_PTS = 1200, JAM_ALT = 500 * FT, JAM_R = 2800;
// Staged naval escalation / trench run / guns-only duel.
const SHIP_HP = { DDG: 3, CG: 5, CV_FLAG: 10 }, SHIP_SCALE = { DDG: 1, CG: 1.25, CV_FLAG: 1.9 };
const SHIP_SAM_CD = 9;
const AMB_SPAWN_D = 6000, AMB_SPAWN_ALT = 2500, AMB_MAX = 3;
// Linked weak points + flagship VLS telegraph.
const SUB_HP = 2, SUB_HIT_R = 14, SUB_PTS = 600;
const SUB_OFF = { CG: [0, 24, -8], CV_FLAG: [0, 34, -20] };
const SITE_HP = 1, SITE_HIT_R = 12, SITE_SECTOR_M = 1800, SITE_PTS = 300;
const FLAG_SALVO_MIN = 18, FLAG_SALVO_MAX = 22, FLAG_TELE_S = 3.0;
const FLAG_SALVO_N = 6, FLAG_SPREAD_DEG = 14, FLAG_VLS_STAGGER = 0.15;
const AA_RANGE = 3200, AA_ALT = 3000, AA_CD = 1.4, AA_DMG = 0.015;
const CANYON_SAM_MAX = 24, CEIL_ARM_DELAY = 8.0, CEIL_HYST_M = 10;
const CEIL_WARN_S = 1.5, CEIL_SALVO_MIN = 4, CEIL_SALVO_MAX = 6, CEIL_SALVO_CD = 1.8, CEIL_STAGGER = 0.12;
const CEIL_SAM_MIN_D = 250, CEIL_MASK_M = CEIL_M - 30;
const CANYON_GATE_N = GORGE_GATE_N;
const CLIMB_WALL_T = 12, CLIMB_SALVO_MIN = 6, CLIMB_SALVO_MAX = 8, CLIMB_SALVO_CD = 2.0;
const SAM_V = 620, SAM_G = 22, SAM_LIFE = 14;
const SAM_SITE_PER_GATE = 2, CRATER_SITE_N = 8;
// One-engine recovery + mid-mission ace intrusion.
const BW_PTS = 2000, BW_KEY = 'BROKEN_WING';
const INTR_COMBO = 4, INTR_CUT_S = 1.5, INTR_HP = 160, INTR_DROP_DY = 1800, INTR_BONUS = 1500;
const ENEMY_GUN = { range: 900, cone: 0.99813, burst: 0.6, cd: 1.4, rps: 50, dmg: 0.006, spread: 0.6 * 0.01745 };
const ACE_DUEL_HP = 100;                       // same airframe HP as any fighter (no boss pool)
// Duel AI: gun-defence trigger (player nose within 14 deg inside 1.5 km) and loop entry speed.
const DUEL_THREAT_R = 1500, DUEL_THREAT_COS = Math.cos(14 * Math.PI / 180), DUEL_LOOP_V = 215;
// CRIMSON-1 cannon: lead-point envelope, 50 rps bursts with visible every-4th tracer.
const ACE_GUN_R = 1200, ACE_GUN_COS = Math.cos(18 * Math.PI / 180);
const ACE_BULLET_V = 1050, ACE_GUN_RPS = 50, ACE_GUN_DMG = 4, ACE_HIT_R = 9;
const ACE_BURST_MIN = 0.8, ACE_BURST_MAX = 1.4, ACE_GUN_CD = 1.2;
// Instanced agile drone swarm (separate pool; no enemies entries, no RWR).
const DRONE_N = 16, SWARM_MIN = 6, SWARM_MAX = 8;
const DRONE_HIT_R = 5, DRONE_V = 190, DRONE_G = 10;
const DRONE_COH = 0.6, DRONE_SEP = 1.4, DRONE_ALI = 0.5, DRONE_ORBIT = 1.0;
const DRONE_SEP_R = 40, DRONE_ORBIT_R = 900, DRONE_ORBIT_DY = 150;
const DRONE_GUN_R = 700, DRONE_GUN_COS = Math.cos(10 * Math.PI / 180), DRONE_BURST = 0.4;
const DRONE_GUN_CD = 2.5, DRONE_GUN_DMG = 1, DRONE_GUN_RPS = 30;
const DRONE_PTS = 200, SWARM_BONUS = 1000;
const LOG_V = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOG_F = '#include <logdepthbuf_pars_fragment>\n';

export function createCombat(THREE, env) {
  const { scene, camera, renderer, state: S, combat: C, jet, groundLevel, terrainHeight } = env;
  const clamp = THREE.MathUtils.clamp, D2R = Math.PI / 180;
  const rand = Math.random;

  const WAVE_SIZE = 6;
  const MP = [null, { id: 1, label: 'SWEEP BANDITS' }, { id: 2, label: 'CANYON/BRIDGE STRIKE' },
    { id: 3, label: 'CRIMSON ACE INTERCEPT' }, { id: 4, label: 'CARRIER RTB' }];
  const FURBALL_TICK = 3.5, FURBALL_MIN = 6, FURBALL_ACE_EVERY = 5;
  let FURBALL_MAX = 8;                                      // set once the bandit pool exists
  const GUN_MAX = 940, GUN_RATE = 100, BULLET_SPEED = 1050;   // M61A1: 6,000 rpm, 1,050 m/s
  let MSL_MAX = 6;                                            // becomes the pylon-missile count once the GLB loads
  const MSL_INTERVAL = 0.6, MSL_RELOAD = 6;
  const BOMB_INTERVAL = 0.22, BOMB_RELOAD = 10, BOMB_EJECT = 2.5, BOMB_RADIUS = 70;
  const FLR_MAX = 4, FLR_RECHARGE = 8, FLR_PER_SALVO = 6, FLR_DECOY_RANGE = 1.2 * NM;
  const LOCK_RANGE = 3.5 * NM, PURSUE_RANGE = 4.0 * NM;
  const LOCK_DECAY = 0.8;   // seeker half-angle / lock time: DIFF.seekerHalf / DIFF.lockTime
  // WARDEN orders + wounded-wingman save. All scalars / preallocated state.
  const WING_ORDERS = ['FORM', 'COVER', 'FOCUS'];
  const WING_ROLES = ['CAP', 'STRIKE'];
  const SHORTCUT_PTS = 1200, SEAD_CD = 12;
  const ORDER_TEXT = ['WARDEN, FORM ON ME', 'WARDEN, COVER MY SIX', 'WARDEN, FOCUS MY TARGET'];
  const COVER_R = 2500, COVER_REAR_COS = Math.cos(110 * Math.PI / 180), ORDER_BADGE_S = 2.0;
  const LIMP_HP_FRAC = 0.35, LIMP_SPD = 113, LIMP_PURSUERS = 2, LIMP_SAVE_PTS = 1500, LIMP_MIN_T = 60;
  // Solar IR seeker blind + gun shootdown. All scratch is module-level.
  const SUN_BLIND_COS = Math.cos(12 * Math.PI / 180), SUN_SEEKER_COS = Math.cos(18 * Math.PI / 180);
  const SUN_BLIND_HOLD = 0.5, SUN_MIN_Y = 0.05, SUN_CLOUD_MAX = 0.2;
  const SUN_BLIND_PTS = 350, SUN_BLIND_CD = 3.0;
  const MSL_SHOOT_R = 7, MSL_SHOOT_PTS = 800;
  // Bandit seekers: within 3.2 NM, player inside a 22 deg cone off the bandit's nose
  // while the bandit sits in the player's rear hemisphere; ~2.2 s to a full lock.
  const B_LOCK_RANGE = 3.2 * NM, B_CONE = 22 * D2R, B_LOCK_TIME = 2.2, B_SOFT = 0.45;
  // Missile guidance quality by lock state at launch.
  const MSL_FULL = { turn: 34 * D2R, fov: 45 * D2R, N: 4.2, noise: 0, tag: 'FULL' };
  const MSL_SOFT = { turn: 14 * D2R, fov: 18 * D2R, N: 3.0, noise: 0.35, err: 5 * D2R, tag: 'SOFT' };
  const BANDIT_FULL = { turn: 30 * D2R, fov: 45 * D2R, N: 3.6, noise: 0.05, tag: 'B-FULL' };
  const BANDIT_SOFT = { turn: 13 * D2R, fov: 14 * D2R, N: 2.6, noise: 0.6, err: 9 * D2R, tag: 'B-SOFT' };
  const MSL_QAAM = { turn: 52 * D2R, fov: 120 * D2R, N: 4.8, noise: 0, tag: 'QAAM' };

  // Active difficulty (src/difficulty.js). Angles are pre-converted to radians.
  const DIFF = {};
  function applyDifficulty(id) {
    const p = DIFFICULTY_PRESETS[id] || DIFFICULTY_PRESETS.NORMAL;
    Object.assign(DIFF, p, { seekerHalf: p.seekerHalfDeg * D2R, aam4Half: p.aam4HalfDeg * D2R });
    director.max = p.maxEnemyMissiles; director.stagger = p.launchStagger;
    C.chaffMax = p.chaffMax; C.chaff = p.chaffMax;
    C.difficulty = p.id;
  }

  Object.assign(C, { designated: null, nextTarget: null, lockProgress: 0, lockState: 'NONE', rwrTrack: false, banditLock: 0 });
  Object.assign(C, { gunMax: GUN_MAX, mslMax: MSL_MAX, missileReloadMax: MSL_RELOAD, bombReloadMax: BOMB_RELOAD,
    bulletSpeed: BULLET_SPEED, score: C.score || 0, comms: [], events: [], wave: 0, gunFiring: false, hitMarker: 0 });
  // Stores: weapon select (>MSL / >BOMB), bombs, CCIP solution, flares.
  Object.assign(C, { weapon: 'MSL', bombs: 0, bombMax: 0, bombReload: 0, ccip: null, ccipTof: 0, flares: FLR_MAX, flareMax: FLR_MAX, chaff: 0, chaffMax: 0, notchT: 0,
    wingOrder: 0, wingOrderT: 0, orderBadgeT: 0, gunRounds: 0, gunHitsP: 0, mslFiredP: 0, mslHitsP: 0, maxDmg: 0, traps: 0 });
  Object.assign(C, { limp: { st: 'IDLE', w: null, pursuers: new Int16Array(LIMP_PURSUERS).fill(-1), n: 0, used: false, graceT: 0 },
    wingSavedBannerT: 0, wingNoDesignationT: 0,
    sunT: 0, sunCD: 0, sunBlinds: 0, sunBannerT: 0, mslIntercepts: 0, interceptBannerT: 0, interceptSlowCD: 0,
    subKills: 0, siteKills: 0, flagBannerT: 0, salvoKills: 0,
    ambushActive: false, buzzTower: 0, buzzJet: 0,
    droneInboundT: 0, droneClearedT: 0, scrambleT: 0, bwBannerT: 0, intrBannerT: 0,
    wingRoles: { w2: 'CAP', w3: 'STRIKE' },
    bw: { eligible: false, landed: false, logged: false },
    intr: { st: 'IDLE', t: 0, ace: -1, used: false, farT: 0 },
    wingHold: false,
    sc: { st: 'IDLE', used: false, pz: 0, px: 0, py: 0, logT: 0, bannerT: 0 },
    swarm: { on: false, n: 0, alive: 0, anchor: 'PLAYER', bonusPaid: true, t: 0 } });
  Object.assign(C, { mcfg: missionConfig({}), stage: 0, stageT: 0,
    ceil: { st: 'CLEAR', phase: 'CLEAR', armed: false, t: 0, warnT: 0, salvoT: 0, rail: 0, railT: 0, fired: 0, lastSam: 0, live: true, belowT: 0 },
    climb: { on: false, t: 0, sams: 0, salvoT: 0, rail: 0, railT: 0 }, gateIdx: 0, weaponsLock: { msl: false, spw: false },
    samSitesOn: false, samLive: 0, samLaunched: 0, samFlared: 0, samMasked: 0, samHit: 0 });

  const say = (text, secs = 2.5, color = '#4dff91') => {
    C.comms = C.comms.filter(c => c.text !== text);
    C.comms.push({ text, until: performance.now() + secs * 1000, color });
    if (C.comms.length > 3) C.comms.shift();
  };
  const pushEvent = (kind, text, points = 0, color = '#52ff9c') => {
    const now = performance.now();
    C.events = (C.events || []).filter(ev => ev.until > now);
    C.events.push({ kind, text, points, color, born: now, until: now + 2600 });
    if (C.events.length > 5) C.events.shift();
  };

  /* ============================================================ particles */
  class Particles {
    constructor(max, additive) {
      this.max = max; this.next = 0;
      this.p = Array.from({ length: max }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, a: 1, r: 1, g: 1, b: 1, drag: 0, rise: 0 }));
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
      this.geo = geo;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } },
        vertexShader: LOG_V + `
          attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale;
          varying vec3 vC; varying float vA;
          void main() { vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = min(aSize * uScale / max(1.0, -mv.z), 900.0);
            gl_Position = projectionMatrix * mv;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: LOG_F + `
          varying vec3 vC; varying float vA;
          void main() {
            #include <logdepthbuf_fragment>
            vec2 d = gl_PointCoord - 0.5;
            float r = length(d) * 2.0;
            float a = vA * pow(clamp(1.0 - r, 0.0, 1.0), 1.4);
            if (a < 0.004) discard;
            gl_FragColor = vec4(vC, a);
          }`,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      this.points = new THREE.Points(geo, this.mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = additive ? 9 : 8;
      scene.add(this.points);
    }
    spawn(o) {
      const q = this.p[this.next]; this.next = (this.next + 1) % this.max;
      q.on = true; q.age = 0;
      q.x = o.x; q.y = o.y; q.z = o.z; q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
      q.life = o.life; q.s0 = o.s0; q.s1 = o.s1; q.a = o.a ?? 1; q.r = o.r; q.g = o.g; q.b = o.b;
      q.drag = o.drag ?? 0.5; q.rise = o.rise ?? 0;
    }
    clear() { for (const q of this.p) q.on = false; }
    update(dt) {
      for (let i = 0; i < this.max; i++) {
        const q = this.p[i];
        if (!q.on) { this.alpha[i] = 0; continue; }
        q.age += dt;
        if (q.age >= q.life) { q.on = false; this.alpha[i] = 0; continue; }
        const dr = Math.max(0, 1 - q.drag * dt);
        q.vx *= dr; q.vy = q.vy * dr + q.rise * dt; q.vz *= dr;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        const f = q.age / q.life;
        this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
        this.col[i * 3] = q.r; this.col[i * 3 + 1] = q.g; this.col[i * 3 + 2] = q.b;
        this.alpha[i] = q.a * Math.pow(1 - f, 1.3) * Math.min(1, q.age * 14);
        this.size[i] = q.s0 + (q.s1 - q.s0) * Math.sqrt(f);
      }
      for (const k of ['position', 'aColor', 'aAlpha', 'aSize']) this.geo.attributes[k].needsUpdate = true;
      this.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov / 2 * D2R));
    }
  }
  const fire = new Particles(900, true);
  const smoke = new Particles(2000, false);

  const flashes = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffa040, 0, 900, 1.6); scene.add(l); return { l, t: 0 }; });
  let flashNext = 0;
  // opts: { kind: 'air' | 'ground' | 'ship' | 'water', vel } -> src/blastfx.js pooled
  // detonation (Visual Pass 5); kind is classified from the height above the surface if omitted.
  function explosion(pos, scale = 1, opts) {
    if (env.onSfx) env.onSfx('explosion', pos, scale);
    const f = flashes[flashNext]; flashNext = (flashNext + 1) % flashes.length;
    f.l.position.copy(pos); f.t = 0.45 * scale; f.l.intensity = 0;
    if (env.blast) { env.blast.detonate(pos, scale, opts); return; }
    const n = Math.round(46 * scale);
    for (let i = 0; i < n; i++) {                                    // expanding fireball
      const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar((20 + rand() * 55) * scale);
      const hot = rand();
      fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, life: 0.5 + rand() * 0.8, s0: 5 * scale, s1: (18 + rand() * 16) * scale,
        r: 1.0, g: 0.45 + 0.4 * hot, b: 0.12 + 0.25 * hot * hot, a: 0.95, drag: 2.2 });
    }
    for (let i = 0; i < n * 0.6; i++) {                             // sparks / debris
      const v = new THREE.Vector3(rand() - 0.5, rand() - 0.3, rand() - 0.5).normalize().multiplyScalar((90 + rand() * 120) * scale);
      fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, life: 0.6 + rand() * 0.9, s0: 1.6, s1: 0.6, r: 1, g: 0.75, b: 0.35, a: 1, drag: 0.6 });
    }
    for (let i = 0; i < n * 0.7; i++) {                             // dark smoke shell
      const v = new THREE.Vector3(rand() - 0.5, rand() * 0.6 - 0.2, rand() - 0.5).normalize().multiplyScalar((8 + rand() * 22) * scale);
      const g = 0.10 + rand() * 0.08;
      smoke.spawn({ x: pos.x + v.x * 0.2, y: pos.y + v.y * 0.2, z: pos.z + v.z * 0.2, vx: v.x, vy: v.y, vz: v.z, life: 3 + rand() * 3, s0: 8 * scale, s1: (30 + rand() * 25) * scale,
        r: g, g: g, b: g * 1.05, a: 0.75, drag: 0.8, rise: 2.5 });
    }
  }
  function splash(pos, scale = 1) {
    if (env.blast) {                                                 // water geyser + foam ring (no mid-air puff)
      env.blast.detonate(pos, Math.max(0.6, scale * 1.6), { kind: 'water' });
      if (env.onSfx) env.onSfx('explosion', pos, scale * 0.6);
      return;
    }
    for (let i = 0; i < 60 * scale; i++) {
      const a = rand() * Math.PI * 2, s = (6 + rand() * 18) * scale;
      smoke.spawn({ x: pos.x, y: 0.5, z: pos.z, vx: Math.cos(a) * s, vy: (18 + rand() * 40) * scale, vz: Math.sin(a) * s, life: 1.6 + rand() * 1.6, s0: 4 * scale, s1: (16 + rand() * 14) * scale,
        r: 0.94, g: 0.96, b: 1.0, a: 0.8, drag: 0.4, rise: -16 });
    }
  }

  /* ============================================================== tracers */
  // Luminous HDR cannon bolts (Visual Pass 1). Each round is a tapered tube
  // stretched 14-22 m along its velocity (growing out of the muzzle, longer with
  // closure speed), white-hot nose -> warm amber tail, additive, colour > 1 so
  // only the bolts cross the bloom threshold. One InstancedMesh per stream with a
  // pre-allocated round pool: zero allocations per shot or per frame. The tube
  // widens with range so a bolt never drops below ~1.2 px at the 62 deg chase FOV.
  const boltGeo = new THREE.CylinderGeometry(1, 0.3, 1, 6, 1, true); boltGeo.translate(0, 0.5, 0);   // y 0 = tail .. 1 = nose
  const BOLT_V = LOG_V + `
    varying float vT; varying float vF;
    void main() {
      vT = position.y; vF = instanceColor.r;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`;
  const BOLT_F = LOG_F + `
    uniform vec3 uHead; uniform vec3 uTail;
    varying float vT; varying float vF;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 c = mix(uTail, uHead, smoothstep(0.2, 0.92, vT)) * (0.35 + 0.65 * vT) * vF;
      gl_FragColor = vec4(c, 1.0);
    }`;
  const _trbq = new THREE.Quaternion(), _trbm = new THREE.Matrix4(), _trbs = new THREE.Vector3(), _trbd = new THREE.Vector3(), _trbp = new THREE.Vector3(), _trbc = new THREE.Color(), _trBY = new THREE.Vector3(0, 1, 0);
  class Tracers {
    constructor(max, head, tail, lenMin = 14, lenMax = 22) {
      this.max = max; this.lenMin = lenMin; this.lenMax = lenMax;
      this.pool = Array.from({ length: max }, () => ({ p: new THREE.Vector3(), prev: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, age: 0 }));
      this.free = this.pool.slice();                       // recycled round objects
      this.list = [];                                      // live rounds (oldest first)
      const mat = new THREE.ShaderMaterial({ uniforms: { uHead: { value: head }, uTail: { value: tail } }, vertexShader: BOLT_V, fragmentShader: BOLT_F,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, fog: false });
      this.mesh = new THREE.InstancedMesh(boltGeo, mat, max);
      for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _trbc.setRGB(0, 0, 0));   // creates instanceColor (per-bolt fade)
      this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
      scene.add(this.mesh);
    }
    add(p, v, life, dmg = 2.5) {
      const b = this.free.length ? this.free.pop() : this.list.shift();         // pool full: recycle the oldest round
      b.p.copy(p); b.prev.copy(p); b.v.copy(v); b.life = life; b.age = 0; b.dmg = dmg;
      this.list.push(b);
    }
    clear() { for (const b of this.list) this.free.push(b); this.list.length = 0; this.mesh.count = 0; }
    step(dt, hitTest) {
      let w = 0;
      for (let r = 0; r < this.list.length; r++) {
        const b = this.list[r];
        b.prev.copy(b.p); b.p.addScaledVector(b.v, dt); b.v.y -= G0 * dt; b.life -= dt; b.age += dt;
        if (b.life <= 0 || b.p.y < groundLevel(b.p.x, b.p.z) || (hitTest && hitTest(b))) { this.free.push(b); continue; }
        this.list[w++] = b;
      }
      this.list.length = w;
      const cam = camera.position;
      for (let i = 0; i < w; i++) {
        const b = this.list[i];
        const sp = b.v.length();
        _trbd.copy(b.v).divideScalar(Math.max(sp, 1e-3));
        const rel = _trbp.copy(b.v).sub(S.velocity).length();
        const L = (this.lenMin + (this.lenMax - this.lenMin) * Math.min(1, rel / 1100)) * Math.min(1, b.age * 30);
        const r = Math.max(0.22, b.p.distanceTo(cam) * 0.0024);            // >= ~3 px wide at the 62 deg FOV
        _trbq.setFromUnitVectors(_trBY, _trbd);
        _trbm.compose(_trbp.copy(b.p).addScaledVector(_trbd, -L), _trbq, _trbs.set(r, Math.max(L, 0.5), r));
        this.mesh.setMatrixAt(i, _trbm);
        this.mesh.setColorAt(i, _trbc.setRGB(Math.min(1, b.life * 2), 0, 0));
      }
      this.mesh.count = w;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
  // HDR bolt colours: player white-gold (2.6, 2.0, 1.15) -> amber; enemy / AAA red-orange.
  const playerTracers = new Tracers(320, new THREE.Color(2.6, 2.0, 1.15), new THREE.Color(1.0, 0.42, 0.1));
  const enemyTracers = new Tracers(220, new THREE.Color(2.4, 0.95, 0.45), new THREE.Color(0.85, 0.16, 0.04));

  /* ==================================================== agile drone swarm */
  // Separate pooled archetype: one InstancedMesh body + one additive engine-glow
  // Points cloud, fixed DRONE_N slots, typed-array state, zero per-frame objects.
  // Drones are virtual lock targets only -- never enemies entries, never RWR.
  const DR_POS = new Float32Array(DRONE_N * 3);
  const DR_VEL = new Float32Array(DRONE_N * 3);
  const DR_ALIVE = new Uint8Array(DRONE_N);
  const DR_GUNCD = new Float32Array(DRONE_N);
  const DR_BURST = new Float32Array(DRONE_N);
  const DR_SWARM = new Int8Array(DRONE_N);          // -1 none, 0 player anchor, 1 carrier anchor
  const DR_PHASE = new Float32Array(DRONE_N);       // orbit phase (radians)
  const DR_ATK = new Float32Array(DRONE_N);         // attack timer (negative = pursuing)
  const DR_BANK = new Float32Array(DRONE_N);
  const DRONES_N = new THREE.Vector3(0, 0, -1), DR_UP = new THREE.Vector3(0, 1, 0);
  const DRONE_TGT = Array.from({ length: DRONE_N }, (_, i) => ({
    kind: 'DRONE', idx: i, pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false,
    label: 'DRONE-' + String(i + 1).padStart(2, '0'), type: 'UAV', cloud: 0, heading: 0
  }));
  // 4-triangle delta wing (~3.5 m span) + one vertical fin; built once.
  const droneGeo = (() => {
    const v = [0, 0, -1.8, -1.75, 0, 0.9, 0, 0, 1.0, 1.75, 0, 0.9,
      -0.55, 0, 1.65, 0.55, 0, 1.65, 0, 0, 0.55, 0, 0, 1.45, 0, 0.62, 1.45];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 5, 3, 6, 7, 8]);
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  })();
  const droneMat = new THREE.MeshStandardMaterial({ color: 0x58616b, metalness: 0.45, roughness: 0.55,
    emissive: 0x142430, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  const droneMesh = new THREE.InstancedMesh(droneGeo, droneMat, DRONE_N);
  droneMesh.frustumCulled = true; droneMesh.count = DRONE_N; droneMesh.renderOrder = 5;
  scene.add(droneMesh);
  // Additive engine glow: same logdepth pattern as the SAM tracer glow in vfx.js.
  const DR_GLOW_V = LOG_V + `
    attribute float aSize; attribute float aAlpha;
    varying float vA;
    void main() {
      vA = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * 320.0 / max(1.0, -mv.z);
      #include <logdepthbuf_vertex>
    }`;
  const DR_GLOW_F = LOG_F + `
    varying float vA;
    void main() {
      #include <logdepthbuf_fragment>
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d) * 2.0;
      float a = pow(max(0.0, 1.0 - r), 2.0) * vA;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vec3(1.0, 0.56, 0.24) * a, a);
    }`;
  const drGlowGeo = new THREE.BufferGeometry();
  const DR_GLOW_POS = new Float32Array(DRONE_N * 3), DR_GLOW_SIZE = new Float32Array(DRONE_N), DR_GLOW_A = new Float32Array(DRONE_N);
  drGlowGeo.setAttribute('position', new THREE.BufferAttribute(DR_GLOW_POS, 3));
  drGlowGeo.setAttribute('aSize', new THREE.BufferAttribute(DR_GLOW_SIZE, 1));
  drGlowGeo.setAttribute('aAlpha', new THREE.BufferAttribute(DR_GLOW_A, 1));
  const drGlow = new THREE.Points(drGlowGeo, new THREE.ShaderMaterial({ vertexShader: DR_GLOW_V, fragmentShader: DR_GLOW_F,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  drGlow.frustumCulled = false; drGlow.renderOrder = 8; scene.add(drGlow);
  // Scratch (preallocated): steering, orientation, guns, glow, culling.
  const _drp = new THREE.Vector3(), _drv = new THREE.Vector3(), _dracc = new THREE.Vector3();
  const _drq = new THREE.Quaternion(), _drqr = new THREE.Quaternion(), _drm4 = new THREE.Matrix4(), _drup = new THREE.Vector3(1, 1, 1);
  const _drzero = new THREE.Vector3(0, 0, 0), _drPos = new THREE.Vector3(), _drGoal = new THREE.Vector3();
  const _drCent = new THREE.Vector3(), _drAli = new THREE.Vector3(), _drSep = new THREE.Vector3(), _drTmp = new THREE.Vector3();
  const _drFwd = new THREE.Vector3(), _drRight = new THREE.Vector3(), _drAnchor = new THREE.Vector3(), _drCarrier = new THREE.Vector3();
  const _drLead = new THREE.Vector3(), _drDir = new THREE.Vector3(), _drMuz = new THREE.Vector3(), _drBul = new THREE.Vector3(), _drToP = new THREE.Vector3();
  let droneSpawned = 0, droneKilled = 0, droneCleared = 0;
  let droneAtkT = 4, droneSalvoT = 0, droneSalvoKills = 0, droneSalvoPaid = false;

  function clearDronePool() {
    for (let i = 0; i < DRONE_N; i++) {
      DR_ALIVE[i] = 0; DRONE_TGT[i].alive = false; DR_BURST[i] = 0; DR_SWARM[i] = -1;
      _drm4.compose(_drPos.set(0, 0, 0), _drq.identity(), _drzero);
      droneMesh.setMatrixAt(i, _drm4);
      DR_GLOW_A[i] = 0;
    }
    droneMesh.instanceMatrix.needsUpdate = true;
    drGlowGeo.attributes.aAlpha.needsUpdate = true;
    C.swarm.on = false; C.swarm.n = 0; C.swarm.alive = 0; C.swarm.bonusPaid = true; C.swarm.t = 0;
  }
  clearDronePool();                                            // hide all slots from the first frame

  function spawnSwarm(n, anchorKind) {
    if (gunsOnly()) return 0;                                  // ACE_DUEL never fields missiles or drones
    const want = clamp(n | 0, SWARM_MIN, SWARM_MAX);
    let free = 0;
    for (let i = 0; i < DRONE_N; i++) if (!DR_ALIVE[i]) free++;
    if (!free) return 0;
    const cnt = Math.min(want, free);
    const useCarrier = anchorKind === 'CARRIER' && C.ally && (C.ally.root || C.ally.g);
    if (useCarrier) {
      const root = C.ally.root || C.ally.g;
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(_drCarrier);
    }
    const a0 = rand() * Math.PI * 2, dist = 4000 + rand() * 2000;
    const baseX = S.position.x + Math.cos(a0) * dist, baseZ = S.position.z + Math.sin(a0) * dist;
    const baseY = clamp(S.position.y + (rand() - 0.5) * 600, 140, 12000);
    let placed = 0;
    for (let i = 0; i < DRONE_N && placed < cnt; i++) {
      if (DR_ALIVE[i]) continue;
      const k = (i / cnt) * Math.PI * 2;
      DR_POS[i * 3] = baseX + Math.cos(k) * 20 + (rand() - 0.5) * 20;
      DR_POS[i * 3 + 1] = clamp(baseY + (rand() - 0.5) * 30, 120, 12000);
      DR_POS[i * 3 + 2] = baseZ + Math.sin(k) * 20 + (rand() - 0.5) * 20;
      _drPos.set(DR_POS[i * 3], DR_POS[i * 3 + 1], DR_POS[i * 3 + 2]);
      _drv.copy(S.position).sub(_drPos).normalize();
      DR_VEL[i * 3] = _drv.x * DRONE_V; DR_VEL[i * 3 + 1] = _drv.y * DRONE_V; DR_VEL[i * 3 + 2] = _drv.z * DRONE_V;
      DR_ALIVE[i] = 1; DR_SWARM[i] = useCarrier && placed >= cnt * 0.5 ? 1 : 0;
      DR_PHASE[i] = k; DR_ATK[i] = 4 + rand() * 3; DR_BANK[i] = 0;
      DR_GUNCD[i] = 1 + rand() * 2; DR_BURST[i] = 0;
      const t = DRONE_TGT[i];
      t.alive = true; t.pos.copy(_drPos); t.vel.set(DR_VEL[i * 3], DR_VEL[i * 3 + 1], DR_VEL[i * 3 + 2]);
      t.heading = (Math.atan2(_drv.x, -_drv.z) / D2R + 360) % 360;
      DR_GLOW_SIZE[i] = 4.5 + rand() * 2; DR_GLOW_A[i] = 0.9;
      drGlowGeo.attributes.aSize.needsUpdate = true; drGlowGeo.attributes.aAlpha.needsUpdate = true;
      droneSpawned++; placed++;
    }
    if (!placed) return 0;
    C.swarm.on = true; C.swarm.n = placed; C.swarm.alive = placed;
    C.swarm.anchor = useCarrier ? 'CARRIER' : 'PLAYER'; C.swarm.bonusPaid = false; C.swarm.t = 0;
    droneAtkT = 4;
    C.droneInboundT = performance.now();
    say('BANDITS — DRONE SWARM, LOW AND FAST!', 2.6, '#ffbf3f');
    if (env.onRadio) env.onRadio('DRONE_INBOUND');
    if (env.debug) console.log('[ANGELS_ZERO] drone swarm spawned n=' + placed + ' anchor=' + C.swarm.anchor);
    return placed;
  }

  function killDrone(i, how) {
    if (i < 0 || i >= DRONE_N || !DR_ALIVE[i]) return false;
    DR_ALIVE[i] = 0; DRONE_TGT[i].alive = false; DR_BURST[i] = 0; DR_SWARM[i] = -1;
    const pos = DRONE_TGT[i].pos;
    _drm4.compose(pos, _drq.identity(), _drzero); droneMesh.setMatrixAt(i, _drm4);
    droneMesh.instanceMatrix.needsUpdate = true;
    DR_GLOW_A[i] = 0; drGlowGeo.attributes.aAlpha.needsUpdate = true;
    C.swarm.alive = Math.max(0, C.swarm.alive - 1);
    droneKilled++;
    explosion(pos, 0.35, { vel: DRONE_TGT[i].vel });
    if (env.samPuff) env.samPuff(_drTmp.copy(pos));
    if (env.onSfx) env.onSfx('explosion', pos, 0.35);
    C.score += DRONE_PTS;
    pushEvent('DRONE', 'SWARM KILL', DRONE_PTS);
    if (C.weapon === 'AAM4' && how === 'MSL' && droneSalvoT > 0 && performance.now() - droneSalvoT < 1500) {
      droneSalvoKills++;
      if (droneSalvoKills >= 4 && !droneSalvoPaid) { droneSalvoPaid = true; awardStyle('QUAD_SPLASH'); }
    }
    if (C.swarm.alive === 0 && !C.swarm.bonusPaid) {
      C.swarm.bonusPaid = true; C.swarm.on = false; droneCleared++;
      C.score += SWARM_BONUS;
      pushEvent('SWARM', 'SWARM CLEARED', SWARM_BONUS, '#ffd45a');
      C.droneClearedT = performance.now();
      say('SWARM CLEARED — NICE WORK', 2.4);
      if (env.onRadio) env.onRadio('SWARM_CLEARED');
    }
    return true;
  }

  function droneSplash(pos, hitIdx) {
    killDrone(hitIdx, 'MSL');
    for (let i = 0; i < DRONE_N; i++) {
      if (!DR_ALIVE[i] || i === hitIdx) continue;
      if (DRONE_TGT[i].pos.distanceToSquared(pos) < 12 * 12) killDrone(i, 'MSL');
    }
  }

  function updateDrones(dt, playerActive) {
    if (!C.swarm.on) {
      for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) { C.swarm.on = true; break; }
      if (!C.swarm.on) return;
    }
    C.swarm.t += dt;
    droneAtkT -= dt;
    if (droneAtkT <= 0) {                                      // one random drone peels off every 4 s
      for (let k = 0; k < DRONE_N; k++) if (DR_ALIVE[k]) { DR_ATK[k] = -3; break; }
      droneAtkT = 4;
    }
    const carrier = C.ally && (C.ally.root || C.ally.g);
    if (carrier) { carrier.updateWorldMatrix(true, false); carrier.getWorldPosition(_drCarrier); }
    // Neighbour pass: coherence + alignment per swarm, separation for any close pair.
    for (let i = 0; i < DRONE_N; i++) {
      if (!DR_ALIVE[i]) continue;
      _drCent.set(0, 0, 0); _drAli.set(0, 0, 0); _drSep.set(0, 0, 0);
      let n = 0;
      for (let j = 0; j < DRONE_N; j++) {
        if (j === i || !DR_ALIVE[j]) continue;
        const dx = DR_POS[j * 3] - DR_POS[i * 3], dy = DR_POS[j * 3 + 1] - DR_POS[i * 3 + 1], dz = DR_POS[j * 3 + 2] - DR_POS[i * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < DRONE_SEP_R * DRONE_SEP_R && d2 > 1e-6) {
          const inv = 1 / Math.sqrt(d2);
          _drSep.x -= dx * inv; _drSep.y -= dy * inv; _drSep.z -= dz * inv;
        }
        if (DR_SWARM[j] !== DR_SWARM[i]) continue;
        _drCent.x += DR_POS[j * 3]; _drCent.y += DR_POS[j * 3 + 1]; _drCent.z += DR_POS[j * 3 + 2];
        _drAli.x += DR_VEL[j * 3]; _drAli.y += DR_VEL[j * 3 + 1]; _drAli.z += DR_VEL[j * 3 + 2];
        n++;
      }
      if (n) {
        _drCent.divideScalar(n); _drAli.divideScalar(n);
        _drCent.x -= DR_POS[i * 3]; _drCent.y -= DR_POS[i * 3 + 1]; _drCent.z -= DR_POS[i * 3 + 2];
        _drAli.x -= DR_VEL[i * 3]; _drAli.y -= DR_VEL[i * 3 + 1]; _drAli.z -= DR_VEL[i * 3 + 2];
        if (_drCent.lengthSq() > 1) _drCent.normalize();
        if (_drAli.lengthSq() > 1) _drAli.normalize();
      }
      // Pursuit state: peel-off drone chases the player for 3 s then rejoins.
      if (DR_ATK[i] < 0) { DR_ATK[i] += dt; if (DR_ATK[i] >= 0) DR_ATK[i] = 4; }
      const pursuing = DR_ATK[i] < 0;
      _drAnchor.copy(DR_SWARM[i] === 1 && carrier ? _drCarrier : S.position);
      if (pursuing) {
        _drGoal.copy(S.position);
      } else {
        const th = C.swarm.t * 0.6 + DR_PHASE[i];
        _drGoal.set(_drAnchor.x + Math.cos(th) * DRONE_ORBIT_R,
          Math.max(groundLevel(_drAnchor.x, _drAnchor.z) + 260, _drAnchor.y + DRONE_ORBIT_DY),
          _drAnchor.z + Math.sin(th) * DRONE_ORBIT_R);
      }
      _drTmp.set(_drGoal.x - DR_POS[i * 3], _drGoal.y - DR_POS[i * 3 + 1], _drGoal.z - DR_POS[i * 3 + 2]);
      if (_drTmp.lengthSq() > 1) _drTmp.normalize().multiplyScalar(DRONE_V);
      else _drTmp.set(0, 0, 0);
      _drTmp.x -= DR_VEL[i * 3]; _drTmp.y -= DR_VEL[i * 3 + 1]; _drTmp.z -= DR_VEL[i * 3 + 2];
      if (_drTmp.lengthSq() > 1) _drTmp.normalize();
      _dracc.copy(_drTmp).multiplyScalar(DRONE_ORBIT)
        .addScaledVector(_drCent, DRONE_COH).addScaledVector(_drAli, DRONE_ALI)
        .addScaledVector(_drSep, DRONE_SEP);
      // Terrain floor with 80 m clearance.
      const floor = groundLevel(DR_POS[i * 3], DR_POS[i * 3 + 2]) + 80;
      if (DR_POS[i * 3 + 1] < floor + 40) _dracc.y += (floor + 40 - DR_POS[i * 3 + 1]) * 0.02;
      const gLim = DRONE_G * 9.81;
      if (_dracc.lengthSq() > gLim * gLim) _dracc.setLength(gLim);
      DR_VEL[i * 3] += _dracc.x * dt; DR_VEL[i * 3 + 1] += _dracc.y * dt; DR_VEL[i * 3 + 2] += _dracc.z * dt;
      _drFwd.set(DR_VEL[i * 3], DR_VEL[i * 3 + 1], DR_VEL[i * 3 + 2]);
      if (_drFwd.lengthSq() < 1) _drFwd.set(0, 0, -1);
      _drFwd.normalize().multiplyScalar(DRONE_V);
      DR_VEL[i * 3] = _drFwd.x; DR_VEL[i * 3 + 1] = _drFwd.y; DR_VEL[i * 3 + 2] = _drFwd.z;
      DR_POS[i * 3] += _drFwd.x * dt; DR_POS[i * 3 + 1] += _drFwd.y * dt; DR_POS[i * 3 + 2] += _drFwd.z * dt;
      // Bank from lateral acceleration (aLat = a . right, right = up x fwd).
      _drRight.crossVectors(DR_UP, _drFwd).normalize();
      DR_BANK[i] = clamp(Math.atan2(_dracc.dot(_drRight), gLim), -0.85, 0.85);
      _drPos.set(DR_POS[i * 3], DR_POS[i * 3 + 1], DR_POS[i * 3 + 2]);
      _drm4.lookAt(_drPos, _drTmp.copy(_drPos).add(_drFwd), DR_UP);
      _drq.setFromRotationMatrix(_drm4);
      _drqr.setFromAxisAngle(DRONES_N, DR_BANK[i]); _drq.multiply(_drqr);
      _drm4.compose(_drPos, _drq, _drup); droneMesh.setMatrixAt(i, _drm4);
      // Sync virtual lock target.
      const t = DRONE_TGT[i];
      t.pos.copy(_drPos); t.vel.copy(_drFwd); t.alive = true;
      t.heading = (Math.atan2(_drFwd.x, -_drFwd.z) / D2R + 360) % 360;
      // Engine glow sits 2 m behind along -vel.
      DR_GLOW_POS[i * 3] = _drPos.x - _drFwd.x * 2 / DRONE_V;
      DR_GLOW_POS[i * 3 + 1] = _drPos.y - _drFwd.y * 2 / DRONE_V;
      DR_GLOW_POS[i * 3 + 2] = _drPos.z - _drFwd.z * 2 / DRONE_V;
      // Gun burst: lead the player using the ace closest-approach test.
      if (DR_BURST[i] > 0) {
        DR_BURST[i] -= dt;
        const rounds = Math.min(3, Math.floor(DRONE_GUN_RPS * dt + 0.5));
        for (let r = 0; r < rounds; r++) {
          const d = _drTmp.copy(S.position).sub(_drPos).length();
          let tof = d / ACE_BULLET_V;
          _drLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
          tof = _drLead.distanceTo(_drPos) / ACE_BULLET_V;
          _drLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
          _drDir.subVectors(_drLead, _drPos).normalize();
          _drMuz.copy(_drPos).addScaledVector(_drFwd, 2.5 / DRONE_V);
          _drBul.copy(_drDir).multiplyScalar(ACE_BULLET_V);
          _drToP.copy(S.position).sub(_drMuz);
          const along = _drToP.dot(_drBul), v2 = ACE_BULLET_V * ACE_BULLET_V;
          if (playerActive && along > 0 && along < DRONE_GUN_R * ACE_BULLET_V) {
            _drToP.copy(_drBul).multiplyScalar(along / v2).sub(_drToP);
            if (_drToP.length() < ACE_HIT_R) {
              damagePlayer(DRONE_GUN_DMG);
              if (env.onSfx) env.onSfx('gunhit', S.position, 1);
            }
          }
          if (r === 0 && env.aaTracer) env.aaTracer(_drMuz, _drBul, 0.3, true);
        }
        if (DR_BURST[i] <= 0) DR_GUNCD[i] = DRONE_GUN_CD;
      } else {
        DR_GUNCD[i] -= dt;
        _drTmp.copy(S.position).sub(_drPos);
        const d = _drTmp.length();
        if (playerActive && DR_GUNCD[i] <= 0 && d < DRONE_GUN_R && d > 1) {
          _drTmp.divideScalar(d);
          _drFwd.set(DR_VEL[i * 3], DR_VEL[i * 3 + 1], DR_VEL[i * 3 + 2]).normalize();
          if (_drTmp.dot(_drFwd) >= DRONE_GUN_COS) {
            DR_BURST[i] = DRONE_BURST; DR_GUNCD[i] = DRONE_GUN_CD;
            if (env.onSfx) env.onSfx('egun', _drPos, 0.4);
          }
        }
      }
    }
    // Live centroid bound for frustum culling (written in place, never recomputed).
    let n = 0, cx = 0, cy = 0, cz = 0, maxR = 0;
    for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) {
      const x = DR_POS[i * 3], y = DR_POS[i * 3 + 1], z = DR_POS[i * 3 + 2];
      cx += x; cy += y; cz += z; n++;
    }
    if (n) {
      cx /= n; cy /= n; cz /= n;
      for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) {
        const dx = DR_POS[i * 3] - cx, dy = DR_POS[i * 3 + 1] - cy, dz = DR_POS[i * 3 + 2] - cz;
        const r = dx * dx + dy * dy + dz * dz; if (r > maxR) maxR = r;
      }
      droneGeo.boundingSphere.center.set(cx, cy, cz);
      droneGeo.boundingSphere.radius = Math.sqrt(maxR) + 10;
      droneMesh.instanceMatrix.needsUpdate = true;
      drGlowGeo.attributes.position.needsUpdate = true;
      drGlowGeo.attributes.aAlpha.needsUpdate = true;
    }
  }

  // M61A1 in the starboard wing-root fairing; rounds converge on the boresight at 1,500 ft.
  const GUN_PORT = new THREE.Vector3(1.45, 0.35, -1.8);
  const CONVERGE_M = 1500 * FT;
  const DISPERSION = 0.008;                                   // 8 mrad cone (diameter)
  C.gunPort = GUN_PORT; C.convergeM = CONVERGE_M;
  const flashTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 60); g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,190,80,0.8)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,230,160,0.8)'; x.lineWidth = 6;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(64 - Math.cos(a) * 60, 64 - Math.sin(a) * 60); x.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // Starboard wing-root muzzle flash: HDR star sprite + forward streak (colour
  // (2.8, 2.1, 1.2) > 1 -> crisp bloom), re-rolled rotation / scale and a fresh
  // 40 ms pulse on every frame that fires rounds.
  const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(2.8, 2.1, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  muzzle.position.copy(GUN_PORT).add(new THREE.Vector3(0, 0, -0.9));
  muzzle.visible = false;
  jet.add(muzzle);
  const muzzleStreak = new THREE.Sprite(muzzle.material.clone());
  muzzleStreak.position.copy(GUN_PORT).add(new THREE.Vector3(0, 0, -2.4));
  muzzleStreak.visible = false;
  jet.add(muzzleStreak);
  let muzzleT = 0;
  const muzzleLight = new THREE.PointLight(0xffb050, 0, 32, 1.6);   // lights the starboard wing / canopy frame
  muzzleLight.position.copy(muzzle.position);
  jet.add(muzzleLight);

  /* ============================================================ missiles */
  const mslBody = new THREE.CylinderGeometry(0.064, 0.064, 2.9, 10); mslBody.rotateX(Math.PI / 2);
  const mslNose = new THREE.ConeGeometry(0.064, 0.25, 10); mslNose.rotateX(-Math.PI / 2); mslNose.translate(0, 0, -1.57);
  const finGeo = mergeGeometries([0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.42, 0.012, 0.22).translate(0.2, 0, 1.25).rotateZ(i * Math.PI / 2 + Math.PI / 4)));
  const canardGeo = mergeGeometries([0, 1, 2, 3].map(i => new THREE.BoxGeometry(0.26, 0.01, 0.12).translate(0.12, 0, -1.1).rotateZ(i * Math.PI / 2 + Math.PI / 4)));
  const mslMat = new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.45, metalness: 0.3 });
  const mslDark = new THREE.MeshStandardMaterial({ color: 0x40464d, roughness: 0.5, metalness: 0.4 });
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const plumeGeo = new THREE.ConeGeometry(0.12, 1.6, 10, 1, true); plumeGeo.rotateX(-Math.PI / 2); plumeGeo.translate(0, 0, 2.25);
  const missiles = [];
  const _flyRel = new THREE.Vector3(), _flyRight = new THREE.Vector3();   // flyby side test (no per-frame allocation)
  const _wmTarget = new THREE.Vector3(), _wmFwd = new THREE.Vector3(), _wmRel = new THREE.Vector3(), _wmInv = new THREE.Quaternion();
  const _afF = new THREE.Vector3(), _afR = new THREE.Vector3(), _afTo = new THREE.Vector3();
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mslBody, mslMat), new THREE.Mesh(mslNose, mslDark), new THREE.Mesh(finGeo, mslDark), new THREE.Mesh(canardGeo, mslDark));
    const parts = g.children.slice();
    const plume = new THREE.Mesh(plumeGeo, plumeMat); g.add(plume);
    g.visible = false; scene.add(g);
    missiles.push({ idx: i, mesh: g, parts, visual: null, plume, active: false, enemy: false, target: null, vel: new THREE.Vector3(), age: 0, life: 12, motor: false, losPrev: new THREE.Vector3(), smokeAcc: 0,
      flybyTriggered: false, flyMinD: Infinity, prevPos: new THREE.Vector3(),
      guidance: 'IR', notchT: 0, chaffSalvo: -1 });
  }
  const MSL_NOSE = new THREE.Vector3(0, 0, -1);
  const RAILS = [new THREE.Vector3(-2.7, -0.95, 0.9), new THREE.Vector3(2.7, -0.95, 0.9)];
  let railNext = 0, mslCooldown = 0;

  // CombatDirector: one shared budget for every hostile missile aimed at the player
  // (bandit full / soft shots, land SAM sites, shipborne SAMs, debug banditShot).
  //   max      concurrent hostile missiles still tracking the player (decoyed / lost ones free their slot)
  //   stagger  minimum seconds between any two hostile launches
  const director = { max: 2, stagger: 3.5, cooldown: 0, inFlight: 0, peak: 0, launches: 0, denied: 0 };
  function hostileTracking() {
    let n = 0;
    for (const m of missiles) if (m.active && m.enemy && m.target && m.target.isPlayer && !m.lostTrack) n++;
    return n;
  }
  director.canLaunch = () => director.cooldown <= 0 && hostileTracking() < director.max;
  director.noteLaunch = () => {
    director.launches++; director.cooldown = director.stagger;
    director.inFlight = hostileTracking(); director.peak = Math.max(director.peak, director.inFlight);
  };
  director.tick = dt => {
    director.cooldown = Math.max(0, director.cooldown - dt);
    director.inFlight = hostileTracking();
    director.peak = Math.max(director.peak, director.inFlight);
  };
  director.reset = () => { director.cooldown = 0; director.inFlight = 0; director.peak = 0; director.launches = 0; director.denied = 0; };
  applyDifficulty(env.difficulty || 'NORMAL');

  // `visual` (optional): a store node from the F-15 GLB. Its exact mesh is cloned
  // into the missile body in place of the procedural AIM-9 parts.
  function launch(fromPos, fromQuat, fromVel, target, enemy, quality, visual, guidance, who = 'MSL') {
    // GUNS ONLY (ACE_DUEL): block missiles / rockets only, never the cannon.
    if (gunsOnly() && who === 'MSL') { C.blockedLaunches = (C.blockedLaunches || 0) + 1; return null; }
    if (enemy && quality && /^B-/.test(quality.tag || '')) {
      if (C.mcfg.enemyMsl === false) return null;         // guns-only duel
      if (env.debug) console.log('[ANGELS_ZERO] bandit launch', quality.tag);
    }
    const hostileAtPlayer = enemy && target && target.isPlayer;
    const isSam = who === 'SAM';
    // CANYON SAM batteries own their own salvo scheduler + CANYON_SAM_MAX pool cap;
    // they must bypass the one-at-a-time fighter-missile director budget.
    if (hostileAtPlayer && !isSam && !director.canLaunch()) { director.denied++; return null; }
    const m = missiles.find(x => !x.active); if (!m) return null;
    m.active = true; m.enemy = enemy; m.target = target; m.age = 0; m.motor = false; m.life = enemy ? 10 : 12; m.smokeAcc = 0;
    m.q = quality || MSL_FULL; m.lostTrack = false; m.breakChecked = false; m.flareSalvo = -1;
    m.aam = false; m.minD = Infinity; m.closeCall = false; m.hitPlayer = false;
    m.flybyTriggered = false; m.flyMinD = Infinity;
    m.guidance = guidance || (quality === SAM_Q ? 'RADAR' : 'IR'); m.notchT = 0; m.chaffSalvo = -1;
    m.cloudLost = false; m.cloudT = 0; m.cloud = 0; m.reacquired = false;
    m.terrainLost = false; m.maskT = 0; m.sam = false; m.friendly = false;
    m.mesh.position.copy(fromPos); m.mesh.quaternion.copy(fromQuat); m.mesh.visible = true; m.plume.visible = false;
    if (m.visual) { m.mesh.remove(m.visual); m.visual = null; }
    for (const p of m.parts) p.visible = !visual;
    m.plume.position.z = 0; m.motorDelay = 0.18;
    if (visual) {
      const v = cloneStore(visual.node);
      v.position.set(0, 0, 0);
      v.quaternion.copy(fromQuat).invert().multiply(visual.node.getWorldQuaternion(new THREE.Quaternion()));
      m.mesh.add(v); m.visual = v;
      m.plume.position.z = visual.halfLen - 1.45;           // flame at the real missile's tail
      m.motorDelay = 0.06;                                     // 0.06 s rail drop, then ignition
    }
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(fromQuat);
    m.vel.copy(fromVel).addScaledVector(down, visual ? 4 : 9);
    m.jit = null;
    if (m.q.err) {                                     // soft lock: seeker not settled, launch with a heading error
      const ax = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(m.vel).normalize();
      if (ax.lengthSq() > 0.5) m.vel.applyAxisAngle(ax, m.q.err * (0.7 + 0.5 * rand()));
    }
    if (target) m.losPrev.copy(target.pos).sub(fromPos).normalize();
    if (!enemy) C.lastPlayerMsl = m;                    // missile cam tracks the most recent player shot
    if (hostileAtPlayer && !isSam) director.noteLaunch();
    if (env.onSfx) env.onSfx('launch', fromPos, 1);
    return m;
  }
  function fireMissile() {
    if (gunsOnly() || C.weaponsLock.msl) return false;
    if (!env.isReady() || C.dead || C.missiles <= 0 || C.missileReload > 0 || mslCooldown > 0) return false;
    // Next missile still hanging on its pylon: hide it on the wing and fly its clone.
    const store = stores.msl.find(st => st.node.visible);
    let pos;
    if (store) {
      jet.updateMatrixWorld(true);
      pos = store.node.getWorldPosition(new THREE.Vector3());
    } else {
      const rail = RAILS[railNext]; railNext = 1 - railNext;
      pos = rail.clone().applyQuaternion(S.quaternion).add(S.position);
    }
    // Guidance quality follows the lock state at the moment of launch.
    const st = C.lockState, tgt = st === 'NONE' ? null : C.designated;
    const m = launch(pos, S.quaternion, S.velocity, tgt, false, st === 'LOCK' ? MSL_FULL : MSL_SOFT, store);
    if (!m) return false;
    if (store) { store.node.visible = false; store.mslSpent = true; }
    C.missiles--; mslCooldown = MSL_INTERVAL;
    if (C.missiles <= 0) C.missileReload = MSL_RELOAD;
    C.lastLaunch = st;
    say(st === 'LOCK' ? 'FOX TWO!' : st === 'ACQ' ? 'FOX TWO — SOFT LOCK' : 'FOX TWO — NO LOCK, DUMB FIRE', 1.4, st === 'LOCK' ? '#4dff91' : '#ffbf3f');
    return true;
  }

  let gunAcc = 0, smokeAcc = 0, steamAcc = 0;
  // M61A1 barrel heat: 0 -> 1 over ~3.2 s of continuous fire, cools ~0.28/s (faster
  // with airspeed); at 1.0 the gun locks out ([ GUN OVERHEAT ]) until below 0.45.
  const GUN_HEAT_T = 3.2, GUN_COOL = 0.28, GUN_RESUME = 0.45;
  Object.assign(C, { gunHeat: 0, gunOverheat: false });
  const _ms0 = new THREE.Vector3(), _ms1 = new THREE.Vector3();
  const _gPort = new THREE.Vector3(), _gUp = new THREE.Vector3(), _gFwd = new THREE.Vector3(), _gRight = new THREE.Vector3();
  const _gBore = new THREE.Vector3(), _gDir = new THREE.Vector3(), _gVel = new THREE.Vector3(), _gSpawn = new THREE.Vector3();
  function gunIdle() { muzzle.visible = muzzleStreak.visible = false; muzzleT = 0; muzzleLight.intensity = 0; C.gunFiring = false; }
  function updateGunHeat(dt, triggerHeld) {
    if (C.gunFiring) C.gunHeat = Math.min(1, C.gunHeat + dt / GUN_HEAT_T);
    else C.gunHeat = Math.max(0, C.gunHeat - (GUN_COOL + 0.12 * clamp((S.speed - 150) / 200, 0, 1)) * dt);
    if (!C.gunOverheat && C.gunHeat >= 1) {
      C.gunOverheat = true; C.overheats = (C.overheats || 0) + 1;
      say('[ GUN OVERHEAT ] — BARRELS VENTING', 2.2, '#ff4d3d');
      if (env.onSfx) env.onSfx('overheat', null, 1);
    }
    if (C.gunOverheat && C.gunHeat < GUN_RESUME) { C.gunOverheat = false; say('GUN COOLED — READY', 1.2); }
    // Cooling steam venting from the starboard wing-root gun port.
    if (C.gunOverheat || (C.gunHeat > 0.8 && !C.gunFiring)) {
      steamAcc += dt * (C.gunOverheat ? 60 : 20);
      _gPort.copy(GUN_PORT).applyQuaternion(S.quaternion).add(S.position);
      _gUp.set(0, 1, 0).applyQuaternion(S.quaternion);
      while (steamAcc >= 1) {
        steamAcc -= 1;
        smoke.spawn({ x: _gPort.x, y: _gPort.y, z: _gPort.z, vx: S.velocity.x * 0.9 + _gUp.x * 4 + (rand() - 0.5) * 2, vy: S.velocity.y * 0.9 + _gUp.y * 4 + rand() * 2, vz: S.velocity.z * 0.9 + _gUp.z * 4 + (rand() - 0.5) * 2,
          life: 0.8 + rand() * 0.6, s0: 0.6, s1: 3.5 + rand() * 2, r: 0.97, g: 0.98, b: 1.0, a: 0.55, drag: 2.2, rise: 1.2 });
      }
    }
  }
  function fireGun(dt) {
    if (!env.isReady() || C.dead || C.ammo <= 0 || C.reload > 0 || C.gunOverheat) { gunIdle(); return; }
    gunAcc += GUN_RATE * dt;
    _gFwd.set(0, 0, -1).applyQuaternion(S.quaternion);
    _gRight.set(1, 0, 0).applyQuaternion(S.quaternion); _gUp.set(0, 1, 0).applyQuaternion(S.quaternion);
    _gPort.copy(GUN_PORT).applyQuaternion(S.quaternion).add(S.position);
    // Harmonised bore line: from the port to the boresight cross 1,500 ft ahead.
    _gBore.copy(S.position).addScaledVector(_gFwd, CONVERGE_M).sub(_gPort).normalize();
    let n = 0;
    while (gunAcc >= 1 && C.ammo > 0) {
      gunAcc -= 1; C.ammo--; n++; C.gunRounds++;
      const r = DISPERSION * 0.5 * Math.sqrt(rand()), th = rand() * Math.PI * 2;  // uniform in the 8 mrad cone
      _gDir.copy(_gBore).addScaledVector(_gRight, Math.cos(th) * r).addScaledVector(_gUp, Math.sin(th) * r).normalize();
      _gVel.copy(_gDir).multiplyScalar(BULLET_SPEED).add(S.velocity);           // muzzle velocity + aircraft velocity
      _gSpawn.copy(_gPort).addScaledVector(_gVel, rand() * dt);
      playerTracers.add(_gSpawn, _gVel, 3.0);                                   // spread rounds through the frame
    }
    if (C.ammo <= 0) { C.reload = 5; say('WINCHESTER GUN — RELOADING', 2); }
    C.gunFiring = n > 0;
    if (n > 0) {                                                  // fresh 40 ms flash pulse, new star rotation / size
      muzzleT = 0.04;
      muzzle.material.rotation = rand() * Math.PI;
      muzzle.scale.setScalar(1.3 + rand() * 1.5);
      // Streak laid along the bore as seen on screen (camera-facing sprite rotated to the projected muzzle line).
      _ms0.copy(_gPort).project(camera); _ms1.copy(_gPort).addScaledVector(_gBore, 12).project(camera);
      muzzleStreak.material.rotation = Math.atan2(_ms1.y - _ms0.y, (_ms1.x - _ms0.x) * camera.aspect) - Math.PI / 2 + (rand() - 0.5) * 0.12;
      muzzleStreak.scale.set(0.8 + rand() * 0.5, 3.0 + rand() * 2.2, 1);
    }
    muzzleT = Math.max(0, muzzleT - dt);
    muzzle.visible = muzzleStreak.visible = muzzleT > 0;
    muzzleLight.intensity = muzzleT > 0 ? 18 + rand() * 14 : 0;
    // Cordite gun gas streaming back over the starboard wing.
    smokeAcc += dt * 45;
    while (smokeAcc >= 1) {
      smokeAcc -= 1;
      const g = 0.55 + rand() * 0.12;
      smoke.spawn({ x: _gPort.x + _gRight.x * 0.15, y: _gPort.y + _gRight.y * 0.15, z: _gPort.z + _gRight.z * 0.15,
        vx: S.velocity.x * 0.82 + _gRight.x * 3 + (rand() - 0.5) * 2, vy: S.velocity.y * 0.82 + _gRight.y * 3 + (rand() - 0.5) * 2, vz: S.velocity.z * 0.82 + _gRight.z * 3 + (rand() - 0.5) * 2,
        life: 1.0 + rand() * 0.8, s0: 0.7, s1: 4.5 + rand() * 2, r: g, g, b: g * 1.02, a: 0.42, drag: 1.6, rise: 0.4 });
    }
  }

  // 20 mm strike: metallic sparks, debris smoke, HUD hit tick, impact rattle.
  function hitSparks(p, v) {
    const back = v.clone().normalize().multiplyScalar(-1);
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().addScaledVector(back, 0.6).normalize().multiplyScalar(40 + rand() * 90);
      const w = rand();
      fire.spawn({ x: p.x, y: p.y, z: p.z, vx: s.x, vy: s.y, vz: s.z, life: 0.22 + rand() * 0.3, s0: 1.4 + w, s1: 0.4, r: 1, g: 0.75 + 0.25 * w, b: 0.45 + 0.5 * w, a: 1, drag: 1.2 });
    }
    fire.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.12, s0: 6, s1: 9, r: 1, g: 0.95, b: 0.8, a: 1 });
    for (let i = 0; i < 2; i++) {
      const g = 0.12 + rand() * 0.06;
      smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: (rand() - 0.5) * 8, vy: rand() * 4, vz: (rand() - 0.5) * 8, life: 1.2 + rand(), s0: 2, s1: 8, r: g, g, b: g, a: 0.6, drag: 1.0, rise: 1 });
    }
    C.hitMarker = performance.now();
    if (env.onSfx) env.onSfx('hit', p, 1);
  }

  /* ========================================================= enemy fleet */
  const TINT = new THREE.Color(0.62, 0.30, 0.30);           // dark aggressor crimson / charcoal
  const fleet = [];                                         // InstancedMesh per material
  const glowGeo = new THREE.ConeGeometry(0.5, 3.2, 10, 1, true); glowGeo.rotateX(-Math.PI / 2);
  let glowMesh = null, nozzles = [], flameOuter = null, flameCore = null;
  // Afterburner flames: tip-aft cones (orange sheath, blue-white core), scaled by e.ab.
  const flameGeoO = new THREE.ConeGeometry(0.55, 4.6, 12, 1, true); flameGeoO.rotateX(Math.PI / 2);
  const flameGeoC = new THREE.ConeGeometry(0.32, 2.6, 12, 1, true); flameGeoC.rotateX(Math.PI / 2);
  const WINGTIPS = [new THREE.Vector3(-6.6, -0.7, 4.4), new THREE.Vector3(6.6, -0.7, 4.4)];
  const enemies = [];

  function buildFleet(model, nozzleLocal) {
    model.updateMatrixWorld(true);
    const inv = model.matrixWorld.clone().invert();
    const byMat = new Map();
    model.traverse(o => {
      if (!o.isMesh || !o.parent) return;
      const name = (o.material && o.material.name) || '';
      if (/^(cock|seats|poly_27)/i.test(name) || o.material.transparent) return;   // interior + glass not needed outside
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const ng = g.index ? g.toNonIndexed() : g;
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(ng);
    });
    // Split every material's merged airframe into body / left wing / right wing
    // (triangle centroid |x| > 1.8 m inside the wing chord), so a severed wing
    // can be hidden per bandit and flown off as a real mesh.
    const partOf = (x, z) => (Math.abs(x) > 1.8 && z > -2.5 && z < 5.8) ? (x < 0 ? 'L' : 'R') : 'body';
    const wingBox = { L: new THREE.Box3(), R: new THREE.Box3() };
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const m = mat.clone();
      if (m.color) m.color.multiply(TINT);
      m.clippingPlanes = null; m.side = THREE.FrontSide;
      const pos = merged.attributes.position, tri = pos.count / 3;
      const lists = { body: [], L: [], R: [] };
      for (let t = 0; t < tri; t++) {
        const cx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
        const cz = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3;
        lists[partOf(cx, cz)].push(t);
      }
      for (const part of ['body', 'L', 'R']) {
        const ids = lists[part]; if (!ids.length) continue;
        const g = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
          const src = merged.attributes[name], sz = src.itemSize, arr = new Float32Array(ids.length * 3 * sz);
          ids.forEach((t, k) => { for (let v = 0; v < 3; v++) for (let c = 0; c < sz; c++) arr[(k * 3 + v) * sz + c] = src.array[(t * 3 + v) * sz + c]; });
          g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
        }
        const inst = new THREE.InstancedMesh(g, m, WAVE_SIZE);
        inst.frustumCulled = false; inst.count = WAVE_SIZE;
        scene.add(inst);
        fleet.push({ inst, part });
        if (part !== 'body') { g.computeBoundingBox(); wingBox[part].union(g.boundingBox); wingParts[part].push({ geo: g, mat: m }); }
      }
    }
    // Debris copies centred on each wing's own centre so they tumble about it.
    for (const side of ['L', 'R']) {
      const c = wingBox[side].isEmpty() ? new THREE.Vector3() : wingBox[side].getCenter(new THREE.Vector3());
      wingParts[side] = wingParts[side].map(pt => ({ geo: pt.geo.clone().translate(-c.x, -c.y, -c.z), mat: pt.mat }));
      wingParts[side].center = c;
    }
    nozzles = nozzleLocal.map(n => n.clone());
    tintFleet();                                                // per-instance colour: crimson Ace livery
    glowMesh = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1e, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), WAVE_SIZE * 2);
    glowMesh.frustumCulled = false;
    scene.add(glowMesh);
    const fm = color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    flameOuter = new THREE.InstancedMesh(flameGeoO, fm(0xff7a26), WAVE_SIZE * 2);
    flameCore = new THREE.InstancedMesh(flameGeoC, fm(0x8fc4ff), WAVE_SIZE * 2);
    for (const fl of [flameOuter, flameCore]) { fl.frustumCulled = false; fl.renderOrder = 7; scene.add(fl); }
  }

  /* ---------------------------------------------------- bandit flight AI */
  // Tactical states: PATROL -> ENGAGE (lead pursuit, guns, seeker, missiles),
  // EVADE_BREAK (85 deg break across the threat line at the G limit, afterburner),
  // BARREL_ROLL (helical defensive roll / split-S toward the cloud deck),
  // EXTEND_CLIMB (unload, burner, climb away after an overshoot or a break) and
  // RECOVER (below 260 kt: wings level, shallow dive, burner, <= 2 G, 2.5-4 s).
  // Flight is bank-to-turn: each bandit rolls its lift vector onto the turn
  // demand (+/-82 deg, rate- and acceleration-limited) and only then pulls,
  // G-capped (6.0-6.8 G, Ace 8.5, less when slow), turn rate omega <= g*G/v,
  // with thrust, v^2 parasitic and G^2 induced drag and gravity setting the
  // airspeed. Safety layers on top of every state:
  // a 150 / 350 / 650 m terrain + sea look-ahead (wings-level pull-up), a hard
  // floor 12 m above ground / water, 65 m wingman separation, a merge
  // break-away inside 95 m of the player (or a predicted pass that close), and
  // a 14 m swept airframe-collision check (ram = shockwave, +45 % DMG, kill).
  const KT = 0.514444;
  const BANK_MAX = 82 * D2R, BREAK_BANK = 85 * D2R;
  // Airframe limits (per bandit, rolled at spawn): roll rate 110-140 deg/s (Ace 175),
  // roll acceleration 520 deg/s^2 (Ace 700) so rolls build and stop with weight,
  // G cap 6.0-6.8 (Ace 8.5). Below 240 kt available G falls with dynamic
  // pressure ((v / 240 kt)^2, floor 35 %) and roll rate with v / 240 kt (floor 50 %).
  const ROLL_ACC = 520 * D2R, ACE_ROLL_ACC = 700 * D2R, SLOW_V = 240 * 0.514444;
  // Energy: thrust 4.5 m/s^2 MIL + 6.5 m/s^2 AB (T/W ~1.1 in burner), parasitic drag ~ v^2 (top speed = AB
  // target), induced drag 0.36 * (G^2 - 1.5) m/s^2, full gravity along the flight
  // path. Below 260 kt in a fight the bandit RECOVERs: wings level, shallow dive,
  // burner, max 2 G, for 2.5-4 s.
  const T_MIL = 4.5, T_AB = 6.5, K_IND = 0.36, RECOVER_V = 260 * 0.514444, V_FLOOR = 90;
  const LOOK = [150, 350, 650], SAFE_WATER = 35, SAFE_TERRAIN = 55, AVOID_BAND = 140, HARD_FLOOR = 12;
  const MERGE_R = 95, MERGE_CLEAR = 32, SEP_R = 65, RAM_R = 14, REACT_RANGE = 1800;
  const AI_FLR_CD = 10, AI_FLR_P = 0.45;
  const TAC_CODE = { PATROL: 'P', ENGAGE: 'E', EVADE_BREAK: 'B', BARREL_ROLL: 'R', EXTEND_CLIMB: 'X', RECOVER: 'V', DISENGAGE_ORBIT: 'O', CRIPPLED: 'C' };
  const ai = { minClear: Infinity, clamps: 0, avoid: 0, merges: 0, minSep: Infinity, minWing: Infinity, breaks: 0, rolls: 0, splitS: 0,
    extends: 0, flares: 0, spoofs: 0, rams: 0, impacts: 0, maxBank: 0, maxG: 0, abT: 0, trails: 0 };
  let aiFlareSalvo = 0, aiPassive = false;                     // aiPassive: debug terrain test (no engaging)

  const TYPES = ['SU-30SM', 'MIG-29A', 'SU-35S', 'F-15J', 'SU-33', 'TYPHOON'];
  function makeEnemy(i) {
    return {
      id: i, alive: false, mode: 'PATROL', tac: 'PATROL', tacT: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1),
      quat: new THREE.Quaternion(), speed: 210, bank: 0, hp: 100, heading: 0, center: new THREE.Vector3(), radius: 2500, dir: 1, alt: 1000,
      burst: 0, burstCD: 2 + rand() * 2, tracerAcc: 0, bLock: 0, mslCD: 10 + rand() * 10, evadeDir: 1,
      wreck: null, label: 'BANDIT ' + String(i + 1).padStart(2, '0'),
      type: TYPES[i % 6], ace: false, hpMax: 100,
      acc: new THREE.Vector3(), prev: new THREE.Vector3(),
      cruise: 210, abSpeed: 300, ab: 0, gNow: 1, reactT: null, threatTm: null,
      rollPhase: 0, rollDir: 1, splitS: false, merge: 0, mergeDir: new THREE.Vector3(0, 1, 0), mergeRoll: 0,
      flaresLeft: 2, flareCD: 0, trailAcc: 0, avoiding: false, noBreak: false,
      rollRate: 125 * D2R, rollRateNow: 0, gMax: 6.4,
      wingL: 30, wingR: 30, wingOffL: false, wingOffR: false, engHits: 0, engineFire: false, speedCap: 1,
      crippled: null, crippleT: 0, crRoll: 0, sinkTarget: 25, rollVel: 0, dipV: 0,
      ambush: false, ambushT: 0, buzzCD: 0
    };
  }
  for (let i = 0; i < WAVE_SIZE; i++) enemies.push(makeEnemy(i));
  FURBALL_MAX = Math.min(8, enemies.length - 2);             // two pool slots reserved for the CRIMSON pair
  const _fur = new THREE.Vector3();                          // recycler scratch (allocated once)

  function resetAI(e) {
    e.cruise = (360 + rand() * 80) * KT;                     // 360-440 kt cruise
    e.abSpeed = (520 + rand() * 120) * KT;                   // 520-640 kt in afterburner
    e.speed = e.cruise; e.ab = 0; e.gNow = 1; e.bank = 0; e.rollRateNow = 0;
    e.rollRate = (110 + rand() * 30) * D2R; e.gMax = 6.0 + rand() * 0.8;   // airframe limits (makeAce overrides)
    e.tac = e.mode = 'PATROL'; e.tacT = 0; e.reactT = null; e.threatTm = null; e.merge = 0; e.noBreak = false;
    e.flaresLeft = rand() < 0.5 ? 1 : 2; e.flareCD = 0; e.trailAcc = 0; e.rollPhase = 0; e.avoiding = false;
    Object.assign(e, { wingL: WING_HP, wingR: WING_HP, wingOffL: false, wingOffR: false, engHits: 0, engineFire: false, speedCap: 1,
      crippled: null, crippleT: 0, rollVel: 0, dipV: 0, zoneLog: null,
      aceFlight: false, decoys: 0, chaffN: 0, decoyCD: 0, ambush: false, ambushT: 0 });
  }

  /* ------------------------------------------------ mission phases + Ace */
  // Three-phase cycle: PHASE 1 and PHASE 2 are six-bandit waves; PHASE 3 is the
  // Ace sortie: SOL-1 "CRIMSON VULTURE" (crimson-tinted Su-35S, red wingtip vapour) plus two
  // escorts. The Ace always engages, pulls 8.5 G / rolls 175 deg/s, reacts in ~0.2 s, locks 40 %
  // faster, carries 6 flare salvos (4 s re-arm, 70 % spoof), has 360 HP and
  // 70-hit wings, takes missile hits as 150 HP damage instead of dying, and
  // catches fire only after 5 engine hits. Killing it pays ACE KILL; then the
  // cycle restarts at PHASE 1.
  const ACE = { label: 'SOL-1', name: 'CRIMSON VULTURE', type: 'SU-35S', hp: 360, wing: 70, cruise: 470, ab: 760, flares: 6, msl: 150 };
  // Strike bombers (PHASE 2): Su-34s on a straight run at ARCHIPELAGO AFB. They do not
  // dogfight, soak two missile hits, and are drawn 1.35x the fighter airframe.
  const BOMBER = { type: 'SU-34', hp: 260, msl: 130, cruise: 250, ab: 300, alt: 2100, scale: 1.35 };
  const ACE_TINT = new THREE.Color(1.0, 0.22, 0.26), BASE_TINT = new THREE.Color(1, 1, 1);
  const CRIMSON_TINT = new THREE.Color(0x9e1b2c);
  const ACE_FLIGHT_HP = 1.6, ACE_FLIGHT_TURN = 1.25, ACE_DECOY_CD = 8, ACE_DECOY_N = 2, ACE_FLIGHT_BONUS = 2500;
  let aceFlightDone = false;
  Object.assign(C, { phase: 0, ace: null, aceDowns: 0, mode: 'MISSION', furballKills: 0,
    missionPhase: 1, mpT: 0, obj: { done: 0, total: WAVE_SIZE } });
  let furT = 0, waveKill0 = 0;
  const _primary = new Array(8);
  function makeAce(e) {
    e.ace = true; e.label = ACE.label; e.type = ACE.type;
    e.hp = e.hpMax = ACE.hp; e.wingL = e.wingR = ACE.wing; e.flaresLeft = ACE.flares;
    e.cruise = ACE.cruise * KT; e.abSpeed = ACE.ab * KT; e.speed = e.cruise;
    e.mslCD = 5 + rand() * 3; e.burstCD = 1.5; e.aceTaunt = false;
    e.rollRate = 175 * D2R; e.gMax = 8.5;                         // skilled human F-15 pilot, never superhuman
    C.ace = { label: ACE.label, name: ACE.name, type: ACE.type, hp: e.hp, hpMax: e.hpMax, alive: true };
    tintFleet();
  }
  function clearAce(e) {
    if (e.bomber) { e.bomber = false; e.bombed = false; e.label = 'BANDIT ' + String(e.id + 1).padStart(2, '0'); e.type = TYPES[e.id % 6]; e.hpMax = 100; e.scale = 1; }
    if (!e.ace) return; e.ace = false; e.label = 'BANDIT ' + String(e.id + 1).padStart(2, '0'); e.type = TYPES[e.id % 6]; e.hpMax = 100; tintFleet();
  }
  function makeBomber(e, n) {
    e.bomber = true; e.bombed = false; e.type = BOMBER.type; e.label = 'STRIKE ' + n; e.scale = BOMBER.scale;
    e.hp = e.hpMax = BOMBER.hp; e.cruise = BOMBER.cruise * KT; e.abSpeed = BOMBER.ab * KT; e.speed = e.cruise;
    e.flaresLeft = 2; e.mslCD = 999; e.burstCD = 999;
  }
  function tintFleet() {
    if (!fleet.length) return;
    enemies.forEach((e, i) => {
      const tint = e.aceFlight ? CRIMSON_TINT : e.ace ? ACE_TINT : BASE_TINT;
      for (const f of fleet) f.inst.setColorAt(i, tint);
    });
    for (const f of fleet) if (f.inst.instanceColor) f.inst.instanceColor.needsUpdate = true;
  }
  // CRIMSON flight: a single mid-sortie two-ship mini-encounter, distinct from
  // the Phase-3 SOL-1 boss (which keeps the e.ace flag / ACE_KILL scoring).
  function waveAlive() {
    let n = 0;
    for (const e of enemies) if (e.alive && !e.scripted && !e.bomber && !e.ace && !e.aceFlight) n++;
    for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) n++;       // a wave isn't clear until its swarm is gone
    return n;
  }
  let furSwarmT = 75;
  // FURBALL: keep the pool topped up with recycled slots; no new objects or vectors.
  function furballTick(dt) {
    if (C.mode === 'FURBALL') {
      furSwarmT -= dt;
      if (furSwarmT <= 0) {
        furSwarmT = 75;
        if (!C.swarm.on) spawnSwarm(SWARM_MIN + (rand() < 0.5 ? 0 : 2), 'PLAYER');
      }
    }
    furT -= dt;
    if (furT > 0) return;
    furT = FURBALL_TICK;
    let alive = 0;
    for (const e of enemies) if (e.alive && !e.bomber && !e.aceFlight) alive++;
    const target = Math.max(FURBALL_MIN, Math.min(FURBALL_MAX, FURBALL_MIN + (rand() < 0.5 ? 0 : 2)));
    if (alive >= target) return;
    for (const e of enemies) {
      if (e.alive || e.aceFlight || e.bomber) continue;
      const a = rand() * Math.PI * 2, d = 6000 + rand() * 3000;
      e.pos.set(S.position.x + Math.cos(a) * d, 1400 + rand() * 1200, S.position.z + Math.sin(a) * d);
      e.alt = e.pos.y;
      e.fwd.copy(_fur.copy(S.position).sub(e.pos).setY(0).normalize());
      e.hp = e.hpMax = 100; e.alive = true; e.wreck = null; e.aceFlight = false;
      clearAce(e);
      e.speed = e.cruise; e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      resetAI(e); e.tac = e.mode = 'ENGAGE'; e.mslCD = 0; e.bLock = 0; orient(e);
      writeFleet();
      return;
    }
  }
  // ---- BROKEN WING: sticky one-engine eligibility, awarded on a safe recovery.
  function awardBrokenWing(kind) {
    if (!C.bw.eligible || C.bw.landed) return false;
    C.bw.landed = true;
    C.score += BW_PTS;
    pushEvent(BW_KEY, 'BROKEN WING', BW_PTS, '#ffd45a');
    say('BROKEN WING +' + BW_PTS, 3, '#ffd45a');
    C.bwBannerT = performance.now();
    if (env.onWing) env.onWing("WARDEN-3: ONE ENGINE AND YOU STILL STUCK IT. HELL OF A LANDING.", 'WARDEN-3', '#00ff66');
    if (env.debug) console.log('[ANGELS_ZERO] bw award kind=' + kind + ' +' + BW_PTS);
    return true;
  }

  // ---- Hot scramble: two inert raiders fly a carrier-local path during the
  // catapult hold. No AI, no weapons, no collision until handoff at release.
  const SCR_N = 2, SCR_PATH = new Float32Array(SCR_N * 4 * 3);
  const _scrP = new THREE.Vector3(), _scrQ = new THREE.Quaternion(), _scrD = new THREE.Vector3();
  function spawnRaiders(n, out) {
    const want = Math.min(n | 0, SCR_N);
    let placed = 0;
    for (const e of enemies) {
      if (placed >= want) break;
      if (e.alive || e.ace || e.bomber || e.aceFlight) continue;
      resetAI(e); clearAce(e);
      e.scripted = true; e.noMsl = true; e.noBreak = true; e.burstCD = 999; e.burstT = 0; e.bLock = 0;
      e.hp = e.hpMax = 100; e.alive = true; e.wreck = null;
      e.scriptT = -placed * 0.8; e.scriptSlot = placed;
      e.tac = e.mode = 'PATROL';
      if (out) out[placed] = e.id;
      placed++;
    }
    if (env.debug) console.log('[ANGELS_ZERO] scramble raiders n=' + placed);
    return placed;
  }
  function updateScriptedRaider(e, dt) {
    e.scriptT += dt;
    const a = C.ally;
    if (!a || !a.root) return;
    const base = e.scriptSlot * 12;
    const root = a.root;
    root.updateWorldMatrix(true, false);
    // Four carrier-local corners: off the bow quarter, island pass, astern, loop.
    const pts = SCR_PATH;
    const deckY = (a.deckYLocal && a.deckYLocal.bow0) || a.deckY || 19;
    const local = (i, x, y, z) => { const k = (base + i) * 3; pts[k] = x; pts[k + 1] = y; pts[k + 2] = z; };
    local(0, (e.scriptSlot ? 1 : -1) * 260, 180, -5000);
    local(1, (e.scriptSlot ? 1 : -1) * 220, 180, -220);
    local(2, (e.scriptSlot ? 1 : -1) * 240, 180, 2400);
    local(3, (e.scriptSlot ? 1 : -1) * 900, 260, 5200);
    const t = e.scriptT;
    let seg = Math.max(0, Math.min(2, Math.floor(t / 2))), u = Math.max(0, Math.min(1, (t - seg * 2) / 2));
    if (t > 6) { seg = 3; u = (t * 0.16) % 1; }              // racetrack until release
    const k0 = (base + seg) * 3, k1 = (base + seg + 1) * 3;
    _scrP.set(pts[k0] + (pts[k1] - pts[k0]) * u, pts[k0 + 1] + (pts[k1 + 1] - pts[k0 + 1]) * u, pts[k0 + 2] + (pts[k1 + 2] - pts[k0 + 2]) * u);
    root.localToWorld(_scrP);
    _scrD.copy(_scrP).sub(e.pos);
    if (_scrD.lengthSq() > 1) {
      e.fwd.copy(_scrD).normalize();
      e.speed = 260; e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      e.pos.copy(_scrP); orient(e);
    }
  }
  function handoffRaiders(out) {
    let n = 0;
    for (const e of enemies) if (e.scripted) {
      e.scripted = false; e.noMsl = false; e.noBreak = false; e.burstCD = 1.5;
      e.tac = e.mode = 'ENGAGE'; e.mslCD = 6 + n; e.bLock = 0;
      if (out && n < out.length) out[n] = e.id;
      n++;
    }
    if (env.debug && n) console.log('[ANGELS_ZERO] scramble handoff n=' + n);
    return n;
  }

  // ---- Mid-mission CRIMSON-1 intrusion -------------------------------------
  let intrForce = false;
  function intrBgm(scn) { if (env.onIntrusion) env.onIntrusion(scn); }
  function spawnIntruder() {
    const slots = enemies.filter(e => !e.alive && !e.ace && !e.bomber && !e.scripted);
    if (!slots.length) return false;
    const e = slots[0];
    resetAI(e); clearAce(e);
    _afF.set(0, 0, -1).applyQuaternion(S.quaternion);
    e.pos.copy(S.position).addScaledVector(_afF, 1200);
    let floorY = S.position.y + INTR_DROP_DY;
    const deck = env.getCloudDeck && env.getCloudDeck();
    if (deck && deck.top !== undefined) floorY = Math.max(floorY, deck.top + 200);
    e.pos.y = floorY;
    e.alive = true; e.wreck = null;
    _scrD.copy(S.position).sub(e.pos).normalize();
    _scrD.y -= 0.7; _scrD.normalize();                 // 35 deg dive toward the player
    e.fwd.copy(_scrD); e.speed = e.cruise; e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
    e.tac = e.mode = 'ENGAGE'; e.mslCD = 5; e.bLock = 0;
    e.aceFlight = true; e.intrAce = true; e.label = 'CRIMSON-1'; e.type = 'ACE';
    e.hpMax = e.hp = INTR_HP; e.duel = false; e.duelCD = 0;
    e.decoys = 2; e.chaffN = 2; e.decoyCD = 0;
    C.intr.ace = enemies.indexOf(e);
    orient(e); tintFleet(); writeFleet();
    C.wingHold = true;
    if (env.onSfx) env.onSfx('aceWarn');
    if (env.debug) console.log('[ANGELS_ZERO] intr spawn alt=' + Math.round(e.pos.y) + ' idx=' + C.intr.ace);
    intrBgm('SPAWN');
    return true;
  }
  function startIntrusion() {
    if (C.intr.used || C.intr.st !== 'IDLE') return false;
    C.intr.st = 'CUT'; C.intr.t = INTR_CUT_S; C.intr.farT = 0;
    C.intrBannerT = performance.now();
    say('SIGNAL INTRUSION — CRIMSON-1 INBOUND', 2, '#ff3b5c');
    if (env.debug) console.log('[ANGELS_ZERO] intr trigger combo=' + C.comboMult.toFixed(2));
    intrBgm('CUT');
    return true;
  }
  function finishIntrusion(killed) {
    if (C.intr.st === 'DONE' || C.intr.st === 'IDLE') return;
    C.intr.st = 'DONE'; C.intr.used = true; C.wingHold = false;
    if (killed) {
      C.score += INTR_BONUS;
      pushEvent('INTRUSION', 'CRIMSON DOWN', INTR_BONUS, '#ff3b5c');
      say('CRIMSON-1 IS DOWN. NET IS CLEAR.', 2.6, '#00ff66');
      if (env.debug) console.log('[ANGELS_ZERO] intr done kill=1 +' + INTR_BONUS);
    } else if (env.debug) console.log('[ANGELS_ZERO] intr done kill=0');
    intrBgm('DONE');
  }
  function updateIntrusion(dt) {
    const I = C.intr;
    if (I.st === 'IDLE' || I.st === 'DONE') return;
    if (I.st === 'CUT') {
      I.t -= dt;
      if (I.t <= 0) {
        I.st = 'DUEL';
        if (env.onWing) env.onWing("CRIMSON-1: THIS IS MY SKY NOW, ANGEL. JUST YOU AND ME.", 'CRIMON-1'.replace('CRIMON', 'CRIMSON'), '#ff3b5c', true);
        spawnIntruder();
      }
      return;
    }
    const ace = I.ace >= 0 ? enemies[I.ace] : null;
    if (!ace || !ace.alive) { finishIntrusion(true); return; }
    if (ace.pos.distanceTo(S.position) > 12000) {
      I.farT += dt; if (I.farT > 20) finishIntrusion(false);
    } else I.farT = 0;
  }

  function spawnAceFlight(names) {
    if (aceFlightDone) return false;
    const calls = names && names.length ? names : ['CRIMSON-1', 'CRIMSON-2'];
    const count = calls.length;
    const slots = enemies.filter(e => !e.alive && !e.ace && !e.bomber).slice(0, count);
    if (slots.length < count) {
      for (const e of enemies) {
        if (slots.length >= count) break;
        if (!e.alive || e.ace || e.bomber || slots.includes(e)) continue;
        e.alive = false; e.wreck = null;                       // retire a bandit to free the pool slot
        slots.push(e);
      }
    }
    if (slots.length < count) return false;
    _afF.set(0, 0, -1).applyQuaternion(S.quaternion);
    _afR.set(1, 0, 0).applyQuaternion(S.quaternion);
    const sides = [1, -1];                                                  // 2 and 10 o'clock
    slots.forEach((e, i) => {
      resetAI(e);
      e.pos.copy(S.position).addScaledVector(_afF, 9000).addScaledVector(_afR, sides[i] * 3200);
      e.pos.y = S.position.y + 300;
      e.alive = true; e.wreck = null;
      e.fwd.copy(_afTo.copy(S.position).sub(e.pos).normalize());
      e.speed = e.cruise; e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      e.tac = e.mode = 'ENGAGE'; e.mslCD = 4 + rand() * 3; e.bLock = 0;
      e.aceFlight = true; e.label = calls[i]; e.type = 'ACE';
      // ACE_DUEL: a skilled rival, not a damage sponge -- ordinary fighter airframe HP.
      e.hpMax = e.hp = gunsOnly() ? ACE_DUEL_HP : Math.round(100 * ACE_FLIGHT_HP);
      e.duel = gunsOnly(); e.duelCD = 0;
      e.burstT = 0; e.gunCD = 1.0; e.gunAcc = 0;
      e.decoys = ACE_DECOY_N; e.chaffN = ACE_DECOY_N; e.decoyCD = 0;
      e.psmCD = 0; e.psm = null; e.psmPitch = 0;                     // CRIMSON post-stall reversal state
      orient(e);
    });
    aceFlightDone = true;
    C.aceFlightT = performance.now();
    tintFleet(); writeFleet();
    if (env.onSfx) env.onSfx('aceWarn');
    if (env.onRadio) env.onRadio('ON_ACE_INBOUND');          // voice: replaces the old CRIMSON entry text
    return true;
  }
  // Missiles / bombs: one-shot kills on ordinary bandits; the Ace soaks 150 HP per hit.
  function heavyHit(e, how) {
    if (e && e.scripted) return false;                            // scramble raiders are inert on deck
    if (e.bomber) {                                               // heavy airframe: two missile hits
      e.hp -= BOMBER.msl; e.rollVel += (rand() - 0.5) * 0.6;
      if (e.hp <= 0) { destroyEnemy(e, true, how); return; }
      C.hitFlash = 0.15; pushEvent('DAMAGED', `[ HIT ] ${e.type} ${e.label} — ${Math.round(100 * e.hp / e.hpMax)}%`, 0, '#ffbf3f');
      if (how !== 'BASE') say(`${e.label} HIT — BOMBER STILL INBOUND!`, 1.6, '#ffbf3f');
      return;
    }
    if (!e.ace) { destroyEnemy(e, true, how); return; }
    e.hp -= ACE.msl; e.rollVel += (rand() - 0.5) * 1.2; e.dipV -= 6;
    if (e.hp <= 0) { destroyEnemy(e, true, how); return; }
    C.hitFlash = 0.2;
    pushEvent('DAMAGED', `[ ACE HIT ] ${e.label} — ${Math.round(100 * e.hp / e.hpMax)}%`, 0, '#ff5566');
    say(`DIRECT HIT — ${e.label} STILL FLYING!`, 1.8, '#ff5566');
    aceHurt(e);
  }
  function aceHurt(e) {
    if (C.ace) C.ace.hp = Math.max(0, e.hp);
    if (!e.aceTaunt && e.hp < e.hpMax * 0.5 && env.onRadio) { e.aceTaunt = true; env.onRadio('ACE_HURT', { label: e.label }); }
  }
  // Red wingtip vapour: the Ace's signature trail.
  function aceTrail(e, dt) {
    e.aceAcc = (e.aceAcc || 0) + dt * 36;
    while (e.aceAcc >= 1) {
      e.aceAcc -= 1;
      for (const sx of [-6.4, 6.4]) {
        const p = _s.set(sx, 0.1, 2.2).applyQuaternion(e.quat).add(e.pos);
        smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: e.vel.x * 0.6, vy: e.vel.y * 0.6, vz: e.vel.z * 0.6, life: 1.1 + 0.6 * e.ab, s0: 0.7, s1: 2.6, r: 0.95, g: 0.16, b: 0.22, a: 0.42, drag: 1.4 });
      }
    }
  }

  function spawnWave() {
    C.wave++;
    C.phase = ((C.wave - 1) % 3) + 1;
    // AIR_SUPERIORITY mid/late wave: a drone swarm rides in with the bandits.
    if (C.missionId === 'AIR_SUPERIORITY' && C.wave >= 2 && C.wave <= 3 && !C.swarm.on) spawnSwarm(SWARM_MIN + (rand() < 0.5 ? 0 : 2), 'PLAYER');
    if (C.phase === 3) { spawnAceWave(); return; }
    for (const e of enemies) clearAce(e);
    C.ace = null;
    // Zone-anchored waves:
    //   PHASE 1  SEC-02 BRIDGE STRAIT  six fighters sweeping low over the twin bridges
    //   PHASE 2  SEC-04 -> SEC-01      four escorts high over the carrier task force +
    //                                  two Su-34 strike bombers running at ARCHIPELAGO AFB
    const lane = env.fleetLane, fc = fleetCenter(_fc);
    for (const e of enemies) {
      const a = (e.id / WAVE_SIZE) * Math.PI * 2 + rand() * 0.6;
      e.hp = 100; e.alive = true; e.wreck = null; resetAI(e);
      e.radius = 1800 + rand() * 2200; e.dir = rand() < 0.5 ? -1 : 1;
      if (C.phase === 2 && e.id >= 4) {
        // Bombers: from beyond the fleet lane, straight at the base.
        makeBomber(e, e.id - 3);
        const sx = (lane ? lane.a.x : -9000) - 1200 + (e.id - 4) * 900, sz = (lane ? lane.a.z : 2000) + 2600 + (e.id - 4) * 700;
        e.pos.set(sx, BOMBER.alt, sz); e.alt = BOMBER.alt;
        e.center.set(env.runway ? env.runway.x : 900, 0, env.runway ? (env.runway.z0 + env.runway.z1) / 2 : 100); e.radius = 500;
        e.fwd.set(e.center.x - sx, 0, e.center.z - sz).normalize();
      } else {
        if (C.phase === 2) {
          // Escorts: high-altitude BVR CAP over the task force.
          e.center.set(fc.x + Math.sin(a) * 1800, 0, fc.z + Math.cos(a) * 1800);
          e.alt = (9000 + rand() * 6000) * FT; e.radius = 2400 + rand() * 1600;
        } else {
          // Fighter sweep: low over the strait, patrol circles strung along both bridges.
          e.center.set(-4800 + (e.id / (WAVE_SIZE - 1)) * 9600 + (rand() - 0.5) * 800, 0, -3900 + (rand() - 0.5) * 1200);
          e.alt = (1500 + rand() * 3000) * FT; e.radius = 1400 + rand() * 1200;
        }
        e.pos.set(e.center.x + Math.sin(a) * e.radius, e.alt, e.center.z + Math.cos(a) * e.radius);
        e.fwd.set(Math.cos(a), 0, Math.sin(a)).normalize();
      }
      // Never spawn on top of the player.
      const dx = e.pos.x - S.position.x, dz = e.pos.z - S.position.z, dd = Math.hypot(dx, dz);
      if (dd < 4500) { const k = 4500 / Math.max(dd, 1); e.pos.x = S.position.x + dx * k; e.pos.z = S.position.z + dz * k; }
      e.pos.y = Math.max(e.pos.y, groundLevel(e.pos.x, e.pos.z) + 300);
      e.burst = 0; e.burstCD = e.bomber ? 999 : 2 + rand() * 3; e.bLock = 0; e.mslCD = e.bomber ? 999 : 6 + rand() * 6;
      e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
    }
    if (C.phase === 2 && !fleetAlive()) spawnFleet();
    writeFleet();
    if (C.phase === 2) {
      say(`PHASE 2 // WAVE ${C.wave} — SINK THE TASK FORCE (SEC-04) • STOP THE BOMBERS`, 3.4, '#ffbf3f');
      pushEvent('DAMAGED', '[ PHASE 2 ] CARRIER TASK FORCE + 2 STRIKE BOMBERS', 0, '#ffbf3f');
    } else say(C.wave === 1 ? 'SIX BANDITS OVER THE BRIDGE STRAIT — WEAPONS FREE' : `PHASE 1 // WAVE ${C.wave} — FIGHTER SWEEP, SEC-02 BRIDGE STRAIT`, 3);
    if (env.onRadio) env.onRadio('WAVE', { wave: C.wave, phase: C.phase });
    if (C.phase === 2 && env.onRadio) env.onRadio('BOMBERS');
  }
  const _fc = new THREE.Vector3();
  // PHASE 3: SOL-1 "CRIMSON VULTURE" + two escorts, holding over the SEC-03 NW Basalt
  // Canyon (the Ace hunts the player from any range; the escorts patrol the gorge).
  function spawnAceWave() {
    const cc = env.canyonCenter || { x: S.position.x, z: S.position.z - 10000 };
    enemies.forEach((e, i) => {
      clearAce(e);
      if (i > 2) { e.alive = false; e.wreck = null; return; }
      resetAI(e);
      const a = i * 2.1 + rand() * 0.4;
      e.pos.set(cc.x + Math.sin(a) * (i ? 1400 : 600), 0, cc.z + Math.cos(a) * (i ? 1400 : 600));
      e.alt = (i ? 850 : 1100) + rand() * 200;
      e.pos.y = Math.max(e.alt, groundLevel(e.pos.x, e.pos.z) + 250);
      e.center.set(cc.x, 0, cc.z); e.radius = 1600 + i * 300; e.dir = i === 2 ? -1 : 1;
      e.fwd.set(S.position.x - e.pos.x, 0, S.position.z - e.pos.z).normalize();
      e.hp = e.hpMax = 100; e.alive = true; e.wreck = null;
      e.burst = 0; e.burstCD = 3 + rand() * 2; e.bLock = 0; e.mslCD = 8 + rand() * 6;
      if (i === 0) makeAce(e);
      e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
    });
    writeFleet();
    say(`PHASE 3 — ACE ${ACE.label} "${ACE.name}" OVER SEC-03 NW BASALT CANYON`, 3.4, '#ff5566');
    pushEvent('DAMAGED', `[ PHASE 3 ] ACE ${ACE.label} // ${ACE.name} — SEC-03`, 0, '#ff5566');
    if (env.onRadio) env.onRadio('ACE_INBOUND', { wave: C.wave, phase: 3, label: ACE.label, name: ACE.name });
  }

  const _t = new THREE.Vector3(), _a = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const _rt = new THREE.Vector3(), _u0 = new THREE.Vector3(), _p = new THREE.Vector3(), _lr = new THREE.Vector3(), _L = new THREE.Vector3();
  const _fh = new THREE.Vector3(), _s = new THREE.Vector3(), _w = new THREE.Vector3(), _mv = new THREE.Vector3(), _d = new THREE.Vector3();
  const Z_AXIS = new THREE.Vector3(0, 0, 1), X_AXIS = new THREE.Vector3(1, 0, 0), ORIGIN = new THREE.Vector3();
  // Reusable scratch for the per-frame AI vectors (no `new THREE.*` inside updateEnemy).
  const _toPn = new THREE.Vector3(), _pFwd = new THREE.Vector3(), _wn = new THREE.Vector3(), _md = new THREE.Vector3(), _psmQ = new THREE.Quaternion();
  const _eLead = new THREE.Vector3(), _eDir = new THREE.Vector3(), _eMuz = new THREE.Vector3(), _eVel = new THREE.Vector3();   // enemy gun scratch
  function orient(e) {
    _m4.lookAt(ORIGIN, e.fwd, UP);
    e.quat.setFromRotationMatrix(_m4).multiply(_q.setFromAxisAngle(Z_AXIS, e.bank));
    // Ace PSM reversal is a *visual* pitch offset on top of the flight quaternion;
    // e.vel direction (and therefore the intercept) is deliberately unchanged.
    if (e.psmPitch) e.quat.multiply(_psmQ.setFromAxisAngle(X_AXIS, e.psmPitch));
    e.heading = (Math.atan2(e.fwd.x, -e.fwd.z) / D2R + 360) % 360;
  }
  const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

  // Closest player missile still tracking this bandit.
  function threatMissile(e) {
    let best = null, bd = 4500;
    for (const m of missiles) if (m.active && !m.enemy && !m.lostTrack && m.target === e) { const d = m.mesh.position.distanceTo(e.pos); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  // Defensive reaction once the human reaction delay has elapsed.
  function startDefence(e, tm, tmD) {
    const safe = e.pos.y - (groundLevel(e.pos.x, e.pos.z) + SAFE_TERRAIN);
    e.evadeDir = rand() < 0.5 ? -1 : 1;
    if (tm && rand() < 0.45 && safe > 350) {
      e.tac = 'BARREL_ROLL'; e.tacT = 3.0 + rand() * 0.8; e.rollDir = e.evadeDir; e.rollPhase = e.bank;
      e.splitS = safe > 900 && rand() < 0.5; ai.rolls++; if (e.splitS) ai.splitS++;
    } else {
      e.tac = 'EVADE_BREAK'; e.tacT = 3.2 + rand() * 0.8; ai.breaks++;
    }
    if (tm && e.flaresLeft > 0 && e.flareCD <= 0 && tmD < 1.2 * NM) banditFlares(e);
  }

  // Bandit countermeasures: a 6-flare salvo from the tail; each player missile
  // tracking this bandit inside 1.2 NM rolls once: 45 % it chases a flare.
  function banditFlares(e) {
    e.flaresLeft--; e.flareCD = e.ace ? 4 : AI_FLR_CD; ai.flares++;
    const salvo = 'e' + (++aiFlareSalvo);
    const right = _s.set(1, 0, 0).applyQuaternion(e.quat).clone(), up = new THREE.Vector3(0, 1, 0).applyQuaternion(e.quat);
    const out = [];
    for (let i = 0; i < FLR_PER_SALVO; i++) {
      const side = i % 2 ? 1 : -1;
      const pos = DISPENSERS[i % 2].clone().applyQuaternion(e.quat).add(e.pos).addScaledVector(e.fwd, -i * 4);
      const kick = new THREE.Vector3().addScaledVector(right, side * (10 + rand() * 14)).addScaledVector(up, -(6 + rand() * 10)).addScaledVector(e.fwd, -(2 + rand() * 4));
      const f = { pos, vel: e.vel.clone().multiplyScalar(0.9).add(kick), kick, side: i % 2, age: 0, life: 3.4 + rand() * 0.8, alive: true, isFlare: true, salvo, emit: 0, owner: e };
      flares.push(f); out.push(f);
    }
    let spoofed = 0;
    for (const m of missiles) {
      if (!m.active || m.enemy || m.target !== e || m.lostTrack || m.mesh.position.distanceTo(e.pos) > 1.2 * NM) continue;
      if (rand() < (e.ace ? 0.7 : AI_FLR_P)) {
        const f = out[(rand() * out.length) | 0];
        m.target = f; m.losPrev.copy(f.pos).sub(m.mesh.position).normalize(); spoofed++; ai.spoofs++;
      }
    }
    say(spoofed ? `${e.type} FLARES — MISSILE DECOYED` : `${e.type} DISPENSING FLARES`, 1.8, spoofed ? '#ffbf3f' : '#ffe0a0');
    if (env.onSfx) env.onSfx('flare', e.pos, 0.6);
  }

  function updateEnemy(e, dt, playerActive) {
    if (e.ambush) { e.ambushT -= dt; if (e.ambushT <= 0 || e.pos.distanceTo(S.position) < 2000) e.ambush = false; }
    if (e.buzzCD > 0) e.buzzCD -= dt;
    e.prev.copy(e.pos);
    // Limp-home pursuers fly to the wounded wingman instead of the player.
    const tp = (e.wingTarget && e.wingTarget.alive) ? e.wingTarget.pos : S.position;
    const tv = (e.wingTarget && e.wingTarget.alive && e.wingTarget.vel) ? e.wingTarget.vel : S.velocity;
    const toP = _t.copy(tp).sub(e.pos);
    const dist = toP.length();
    if (playerActive) ai.minSep = Math.min(ai.minSep, dist);
    e.flareCD = Math.max(0, e.flareCD - dt);
    // CRIMSON countermeasures: one flare / chaff decision per 8 s against a player missile inside 1,500 m.
    if (e.aceFlight) {
      e.decoyCD -= dt;
      if (e.decoyCD <= 0) {
        let pm = null;
        for (const m of missiles) {
          if (m.active && !m.enemy && m.target === e && m.mesh.position.distanceTo(e.pos) < 1500) { pm = m; break; }
        }
        if (pm) {
          if (!pm.aam && e.decoys > 0) { banditFlares(e); e.decoys--; e.decoyCD = ACE_DECOY_CD; }
          else if (pm.aam && e.chaffN > 0) {
            e.chaffN--; e.decoyCD = ACE_DECOY_CD;
            if (rand() < 0.5) pm.lostTrack = true;
            for (let i = 0; i < 60; i++) {
              fire.spawn({ x: e.pos.x + (rand() - 0.5) * 8, y: e.pos.y + (rand() - 0.5) * 6, z: e.pos.z + (rand() - 0.5) * 8,
                vx: (rand() - 0.5) * 12, vy: (rand() - 0.5) * 8, vz: (rand() - 0.5) * 12,
                life: 0.6 + rand(), s0: 0.6, s1: 0.2, r: 0.75, g: 0.75, b: 0.75, a: 0.8, drag: 3 });
            }
          }
        }
      }
    }

    // ---- threat picture: our IR lock on this bandit, or a missile tracking it inside 1,800 m
    const tm = threatMissile(e);
    const tmD = tm ? tm.mesh.position.distanceTo(e.pos) : Infinity;
    const locked = playerActive && lockedOn(e);
    const threat = (tm && tmD < REACT_RANGE) || locked;
    const defending = e.tac === 'EVADE_BREAK' || e.tac === 'BARREL_ROLL';
    if (e.tacT > 0) e.tacT -= dt;
    // Energy recovery: too slow to fight -> unload, shallow dive, burner (a missile inside 900 m still forces a break).
    if (e.tac === 'RECOVER' && e.tacT <= 0) { e.tac = 'PATROL'; e.reactT = null; }
    const recovering = e.tac === 'RECOVER';
    if (!recovering && (e.tac === 'ENGAGE' || defending) && e.speed < RECOVER_V && e.merge <= 0) {
      e.tac = 'RECOVER'; e.tacT = 2.5 + rand() * 1.5; e.reactT = null; ai.recovers = (ai.recovers || 0) + 1;
    }
    if (e.tac === 'RECOVER' && !(tm && tmD < 900)) {
      if (tm && e.flaresLeft > 0 && e.flareCD <= 0 && tmD < 1200) banditFlares(e);
    } else if (threat) {
      if (e.reactT === null) e.reactT = e.ace ? 0.12 + rand() * 0.12 : 0.35 + rand() * 0.4;   // human reaction delay (Ace ~0.2 s)
      else if (e.reactT > 0) { e.reactT -= dt; if (e.reactT <= 0) startDefence(e, tm, tmD); }
      else if (!defending || e.tacT <= 0) startDefence(e, tm, tmD);      // keep defending while the threat lasts
      else if (tm && e.flaresLeft > 0 && e.flareCD <= 0 && tmD < 1200) banditFlares(e);
    } else if (e.reactT !== null && e.reactT <= 0 && !defending) e.reactT = null;
    if (defending && e.tacT <= 0 && !threat) {
      if (e.speed < e.cruise * 1.05) { e.tac = 'EXTEND_CLIMB'; e.tacT = 2.5 + rand() * 1.5; ai.extends++; }
      else e.tac = 'PATROL';
      e.reactT = null;
    }
    if (e.tac === 'EXTEND_CLIMB' && e.tacT <= 0) e.tac = 'PATROL';
    // ACE_DUEL rival: reads the player's gun line (no lock / missile to react to) and
    // answers with a max-G break or a vertical loop, then comes straight back in.
    if (e.duel) {
      e.duelCD = Math.max(0, e.duelCD - dt);
      if (e.tac === 'DUEL_LOOP' && e.tacT <= 0) e.tac = 'ENGAGE';
      if (playerActive && e.duelCD <= 0 && e.tac !== 'RECOVER' && e.tac !== 'DUEL_LOOP' && e.tac !== 'EVADE_BREAK') {
        _pFwd.set(0, 0, -1).applyQuaternion(S.quaternion);
        const nose = -_pFwd.dot(toP) / Math.max(dist, 1);          // player's nose on the bandit (1 = dead centre)
        if (dist < DUEL_THREAT_R && nose > DUEL_THREAT_COS) {
          if (e.speed > DUEL_LOOP_V && rand() < 0.5) { e.tac = 'DUEL_LOOP'; e.tacT = 3.0 + rand() * 0.9; }
          else {
            e.tac = 'EVADE_BREAK'; e.tacT = 1.6 + rand() * 0.8; e.evadeDir = rand() < 0.5 ? -1 : 1;
            if (e.threatPos) e.threatPos.copy(S.position);
          }
          e.duelCD = e.tacT + 0.5 + rand() * 0.9; e.reactT = null; ai.duelDefences = (ai.duelDefences || 0) + 1;
          if (env.debug) console.log('[ANGELS_ZERO] duel defence ' + e.tac + ' d=' + dist.toFixed(0) + ' kt=' + (e.speed / KT).toFixed(0));
        }
      }
    }
    // AI disengage: player in the low-altitude clutter / base safe zone -> break off and orbit high.
    if (C.playerSafe && (e.tac === 'PATROL' || e.tac === 'ENGAGE' || e.tac === 'EXTEND_CLIMB')) {
      e.tac = 'DISENGAGE_ORBIT'; e.bLock = 0; e.burst = 0; e.reactT = null; ai.disengages = (ai.disengages || 0) + 1;
    } else if (e.tac === 'DISENGAGE_ORBIT' && !C.playerSafe) e.tac = 'PATROL';   // player back up: re-engage via PATROL -> ENGAGE
    if (e.tac === 'PATROL' || e.tac === 'ENGAGE') {
      e.tac = playerActive && (dist < PURSUE_RANGE || e.ace) && !aiPassive ? 'ENGAGE' : 'PATROL';   // the Ace hunts from any range
      // Overshoot: the bandit has flown past the player inside 250 m -> extend and come back.
      if (e.tac === 'ENGAGE' && dist < 250 && e.fwd.dot(toP) < 0) { e.tac = 'EXTEND_CLIMB'; e.tacT = 2.5 + rand(); ai.extends++; }
    }
    // Strike bombers never dogfight or orbit off: they hold the run (defensive breaks only).
    if (e.bomber && (e.tac === 'ENGAGE' || e.tac === 'DISENGAGE_ORBIT' || e.tac === 'EXTEND_CLIMB')) e.tac = 'PATROL';
    e.mode = e.tac;

    // ---- lift-plane frame (bank-to-turn)
    const right = _rt.crossVectors(e.fwd, UP);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const up0 = _u0.crossVectors(right, e.fwd).normalize();
    const cosPitch = Math.sqrt(Math.max(0, 1 - e.fwd.y * e.fwd.y));

    // ---- terrain / sea look-ahead along the velocity vector (150 / 350 / 650 m)
    let maxH = groundLevel(e.pos.x, e.pos.z), wall = false;
    for (const L of LOOK) {
      const px = e.pos.x + e.fwd.x * L, py = e.pos.y + e.fwd.y * L, pz = e.pos.z + e.fwd.z * L;
      const h = groundLevel(px, pz);
      maxH = Math.max(maxH, h);
      if (py < h + SAFE_TERRAIN) wall = true;
    }
    const minSafe = Math.max(SAFE_WATER, maxH + SAFE_TERRAIN);  // water + 35 m / terrain + 55 m
    const margin = e.pos.y - minSafe;
    const cruiseFloor = minSafe + AVOID_BAND * 1.4;             // valley-hugging cruise height

    // ---- desired flight direction per tactical state
    const desired = _d.set(0, 0, 0);
    let maxG = 6, useAB = false, bankOverride = null;
    if (e.tac === 'PATROL') {
      const r = _s.set(e.pos.x - e.center.x, 0, e.pos.z - e.center.z);
      const rl = Math.max(r.length(), 1); r.divideScalar(rl);
      desired.set(-r.z * e.dir, 0, r.x * e.dir).addScaledVector(r, -(rl - e.radius) / e.radius * 0.8);
      desired.y = clamp((Math.max(e.alt, cruiseFloor) - e.pos.y) * 0.003, -0.25, 0.25);
      maxG = 4;
    } else if (e.tac === 'ENGAGE') {
      if (e.duel) {
        // Gun-solution lead pursuit: aim where 20 mm rounds meet the player.
        const tof = clamp(dist / (980 + e.speed * 0.5), 0, 1.6);
        _eLead.copy(tp).addScaledVector(tv, tof);
        desired.copy(_eLead).sub(e.pos);
        maxG = dist < 2000 ? 9 : 7; useAB = dist > 700 || e.speed < e.cruise;
      } else {
        const lead = _s.copy(tp).addScaledVector(tv, clamp(dist / 900, 0, 2.5));
        desired.copy(lead).sub(e.pos);
        maxG = 7; useAB = dist > 1500 || desired.y > 0.25 * desired.length();
      }
    } else if (e.tac === 'DUEL_LOOP') {
      // Vertical loop: wings level, pull through the vertical on the lift vector.
      desired.copy(up0).addScaledVector(e.fwd, 0.15);
      maxG = 8.5; useAB = true; bankOverride = 0;
    } else if (e.tac === 'EVADE_BREAK') {
      // Break perpendicular to the threat line, slightly nose-low, lift vector at 85 deg.
      const los = _s.copy(e.threatPos ? e.threatPos : S.position);
      if (tm) los.copy(tm.mesh.position);
      los.sub(e.pos).normalize();
      desired.crossVectors(los, UP);
      if (desired.lengthSq() < 1e-4) desired.copy(right);
      desired.normalize().multiplyScalar(e.evadeDir).addScaledVector(los, -0.3).addScaledVector(UP, -0.05);
      maxG = 7; useAB = true; bankOverride = BREAK_BANK * e.evadeDir;
    } else if (e.tac === 'BARREL_ROLL') {
      // Helical defensive roll; split-S variant dives toward the cloud deck.
      e.rollPhase = wrapPi(e.rollPhase + e.rollDir * e.rollRate * 0.92 * dt);   // helix just inside the roll-rate limit
      bankOverride = e.rollPhase;
      const L = _L.copy(up0).multiplyScalar(Math.cos(e.rollPhase)).addScaledVector(right, -Math.sin(e.rollPhase));
      const deck = 1250;                                          // mid cloud deck (~4,100 ft)
      const vBias = e.splitS ? -0.55 : clamp((deck - e.pos.y) * 0.0015, -0.45, 0.3);
      desired.copy(e.fwd).addScaledVector(L, 0.65).addScaledVector(UP, vBias);
      maxG = 7; useAB = !e.splitS;
    } else if (e.tac === 'DISENGAGE_ORBIT') {
      disengageDesired(e, desired);
      maxG = 4; useAB = e.pos.y < ORBIT_ALT - 80 || Math.hypot(e.pos.x - S.position.x, e.pos.z - S.position.z) < ORBIT_R * 0.75;
    } else if (e.tac === 'RECOVER') {
      // Unload: wings level along the current heading, 7 deg shallow dive (15 deg
      // below 240 kt; held above the cruise floor), full afterburner, <= 2 G,
      // pushing over (negative G) if it entered nose-high.
      const fh = _fh.set(e.fwd.x, 0, e.fwd.z);
      if (fh.lengthSq() < 1e-6) fh.set(0, 0, -1);
      const dive = e.speed < SLOW_V ? -0.27 : -0.12;               // very slow: steeper 15 deg dive to trade height for speed
      desired.copy(fh.normalize()).addScaledVector(UP, e.pos.y > cruiseFloor + 120 ? dive : 0.02);
      maxG = 2; useAB = true; bankOverride = 0;
    } else {                                                      // EXTEND_CLIMB
      desired.set(-toP.x, 0, -toP.z);
      if (desired.lengthSq() < 1) desired.copy(e.fwd).setY(0);
      desired.normalize().addScaledVector(UP, 0.4);
      maxG = 5; useAB = true;
    }
    if (e.ace && e.tac !== 'PATROL' && e.tac !== 'RECOVER') { maxG = e.gMax; if (e.tac === 'ENGAGE') useAB = useAB || dist > 900; }   // Ace flies at its 8.5 G limit
    if (desired.lengthSq() < 1e-6) desired.copy(e.fwd);
    desired.normalize();

    // ---- wingman separation: soft spread at 350 m, firm repulsion inside 65 m
    for (const o of enemies) {
      if (o === e || !o.alive) continue;
      const d = e.pos.distanceTo(o.pos);
      ai.minWing = Math.min(ai.minWing, d);
      if (d < 350) {
        const away = _w.copy(e.pos).sub(o.pos).normalize();
        desired.addScaledVector(away, d < SEP_R ? 2.5 * (SEP_R - d) / SEP_R + 0.4 : 0.35 * (350 - d) / 350);
        if (d < SEP_R * 0.6) e.pos.addScaledVector(away, Math.min(SEP_R * 0.6 - d, 40 * dt));
      }
    }

    // ---- merge break-away: roll 70-110 deg and pull off-axis so the pass clears the canopy
    if (playerActive && !e.noBreak) {
      const rel = _s.copy(e.pos).sub(S.position), w = _w.copy(e.vel).sub(S.velocity);
      const w2 = w.lengthSq();
      const tca = w2 > 1 ? clamp(-rel.dot(w) / w2, 0, 2) : 0;
      const miss = _mv.copy(rel).addScaledVector(w, tca), missD = miss.length();
      if (e.merge <= 0 && (dist < MERGE_R || (tca < 1.6 && missD < MERGE_R && dist < 1100))) {
        const wn = w2 > 1 ? _wn.copy(w).normalize() : _wn.copy(e.fwd);
        const dir = _md.copy(miss).addScaledVector(wn, -miss.dot(wn));
        if (dir.lengthSq() < 4) dir.crossVectors(wn, UP).multiplyScalar(rand() < 0.5 ? -1 : 1).addScaledVector(UP, 0.6);
        if (dir.lengthSq() < 1e-4) dir.copy(UP);
        e.mergeDir.copy(dir.normalize());
        const side = Math.sign(-e.mergeDir.dot(right)) || 1;      // roll toward the escape side
        e.mergeRoll = side * (70 + rand() * 40) * D2R;
        e.merge = 1.5; ai.merges++;
      }
      if (e.merge > 0) {
        e.merge -= dt;
        desired.multiplyScalar(0.3).addScaledVector(e.mergeDir, 1.6);
        maxG = Math.max(maxG, e.gMax);                            // break-away at the airframe limit
        if (bankOverride === null) bankOverride = e.mergeRoll;
        // Keep a 32 m (+wingspan) gap through the pass: lateral slip along the break direction.
        if (missD < MERGE_CLEAR && tca < 1.4) e.pos.addScaledVector(e.mergeDir, Math.min(MERGE_CLEAR - missD, 85 * dt));
      }
    }

    // ---- terrain / sea safety: hold the cruise floor, emergency pull-up inside the band
    const wasAvoiding = e.avoiding;
    e.avoiding = margin < AVOID_BAND * 0.7 || wall;
    if (e.avoiding) {
      if (!wasAvoiding) ai.avoid++;
      const urgency = clamp(1 - margin / AVOID_BAND, 0, 1.6) + (wall ? 0.6 : 0);
      const fh = _fh.set(e.fwd.x, 0, e.fwd.z);
      if (fh.lengthSq() < 1e-6) fh.set(0, 0, -1);
      desired.copy(fh.normalize()).addScaledVector(UP, 0.25 + 1.5 * urgency).normalize();
      maxG = Math.max(maxG, 7.5); bankOverride = 0;              // wings level, pull
    } else {
      if (margin < AVOID_BAND * 1.3) desired.y = Math.max(desired.y, 0.04 + 0.25 * (1 - margin / (AVOID_BAND * 1.3)));
      if (e.pos.y > 2600) desired.y = Math.min(desired.y, -0.2);
      desired.normalize();
    }

    // ---- airframe limits: G cap (dynamic-pressure limited below 240 kt) and roll rate
    const v = Math.max(e.speed, 80);
    const qK = clamp((v / SLOW_V) ** 2, 0.35, 1), rollK = clamp(v / SLOW_V, 0.5, 1);
    const aceTurn = e.aceFlight ? ACE_FLIGHT_TURN : 1;
    maxG = Math.min(maxG, e.gMax * aceTurn * qK);
    if (e.aceFlight && e.tac === 'EVADE_BREAK') maxG = Math.min(11, maxG * 1.25);  // hard break, still under 11 G
    const rollMax = e.rollRate * aceTurn * rollK, rollAcc = (e.ace ? ACE_ROLL_ACC : ROLL_ACC) * aceTurn * rollK;

    // ---- bank-to-turn dynamics
    const cosA = clamp(e.fwd.dot(desired), -1, 1), ang = Math.acos(cosA);
    const perp = _p.copy(desired).addScaledVector(e.fwd, -cosA);
    if (perp.lengthSq() > 1e-8) perp.normalize(); else perp.copy(up0);
    const omega = Math.min(ang * 2.4, (maxG * G0) / v);
    const liftReq = _lr.copy(perp).multiplyScalar(omega * v).addScaledVector(up0, G0 * cosPitch);
    let bankT = Math.atan2(-liftReq.dot(right), liftReq.dot(up0)), push = false;
    if (bankOverride !== null) bankT = bankOverride;
    else if (Math.abs(bankT) > BANK_MAX) {
      if (liftReq.dot(up0) < 0) { bankT = wrapPi(bankT - Math.PI); push = true; }    // unload / push over instead of rolling inverted
      bankT = clamp(bankT, -BANK_MAX, BANK_MAX);
    }
    // Roll with inertia: the roll rate accelerates / brakes at rollAcc toward the
    // rate that arrives on bankT without overshoot, capped at rollMax.
    const bankErr = wrapPi(bankT - e.bank);
    const rateCmd = Math.sign(bankErr) * Math.min(rollMax, Math.sqrt(2 * rollAcc * Math.abs(bankErr)));
    e.rollRateNow += clamp(rateCmd - e.rollRateNow, -rollAcc * dt, rollAcc * dt);
    const dBank = e.rollRateNow * dt;
    e.bank = Math.abs(dBank) > Math.abs(bankErr) && Math.sign(dBank) === Math.sign(bankErr) ? bankT : wrapPi(e.bank + dBank);
    ai.maxRoll = Math.max(ai.maxRoll || 0, Math.abs(e.rollRateNow) / D2R);
    // Ballistic jolts from wing hits + a persistent wobble from a shot-up wing.
    const wingBias = ((WING_HP - e.wingL) - (WING_HP - e.wingR)) / WING_HP;
    e.bank = wrapPi(e.bank + (e.rollVel + wingBias * 0.35 * Math.sin(e.prev.x * 0.01 + e.id)) * dt);
    e.rollVel *= Math.exp(-2.5 * dt);
    const L = _L.copy(up0).multiplyScalar(Math.cos(e.bank)).addScaledVector(right, -Math.sin(e.bank));
    let n = liftReq.dot(L);                                       // lift actually available in the current lift plane
    if (e.tac === 'EVADE_BREAK' && !e.avoiding) n = Math.max(n, maxG * G0 * 0.95);   // full-G break
    if (e.tac === 'RECOVER' && !e.avoiding) push = true;          // unload: allowed to push the nose over (down to -2.5 G)
    n = push ? clamp(n, -2.5 * G0, maxG * G0) : clamp(n, 0, maxG * G0);
    e.gNow = n / G0;
    ai.maxG = Math.max(ai.maxG, e.gNow); ai.maxBank = Math.max(ai.maxBank, Math.abs(e.bank) / D2R);
    const accP = _s.copy(L).multiplyScalar(n).addScaledVector(up0, -G0 * cosPitch);   // perpendicular accel incl. gravity
    e.fwd.addScaledVector(accP, dt / v).normalize();

    // Throttle: cruise 360-440 kt, afterburner 520-640 kt; energy trades with climb and G.
    e.ab += ((useAB ? 1 : 0) - e.ab) * Math.min(1, dt * 3);
    if (e.ab > 0.5) ai.abT += dt;
    const targetSpeed = (e.cruise + (e.abSpeed - e.cruise) * e.ab) * e.speedCap;      // engine hit: -40 % top speed
    // Energy: throttle holds the target speed; thrust MIL + AB; parasitic drag
    // scales so the AB target is the level top speed; induced drag ~ G^2;
    // climbing bleeds and diving builds speed (full g sin(gamma)).
    const tMax = (T_MIL + T_AB * e.ab) * e.speedCap;
    const vTop = (e.cruise * 1.15 + (e.abSpeed - e.cruise * 1.15) * e.ab) * e.speedCap;   // full-throttle level top speed
    const thr = clamp((targetSpeed / vTop) ** 2 + (targetSpeed - e.speed) * 0.05, 0, 1);   // feed-forward + trim
    const parasitic = tMax * (e.speed / vTop) ** 2;
    const induced = K_IND * Math.max(0, e.gNow * e.gNow - 1.5);
    e.energyBleed = induced;
    e.speed += (tMax * thr - parasitic - induced - G0 * e.fwd.y) * dt;
    e.speed = clamp(e.speed, V_FLOOR, Math.max(345, e.abSpeed * 1.05) * e.speedCap);
    ai.minKt = Math.min(ai.minKt || Infinity, e.speed / KT);

    // ---- CRIMSON post-stall reversal: with the player on the six and slow, the ace
    // yanks the nose through vertical (visual only — e.vel stays on its intercept)
    // and bleeds speed so the pursuer overshoots.
    e.psmCD = Math.max(0, (e.psmCD || 0) - dt);
    if (e.aceFlight && playerActive && !e.psm && dist < 900 && e.speed < 210 && e.psmCD <= 0) {
      const toPdir0 = _toPn.copy(toP).normalize();
      if (e.fwd.dot(toPdir0) < -0.85) {
        const kind = rand() < 0.6 ? 'COBRA' : 'KULBIT';
        e.psm = { kind, t: 0, dur: kind === 'COBRA' ? 2.2 : 3.0 };
        e.psmCD = 12;
        if (env.onWing) env.onWing('CRIMSON-1: post-stall reversal — come on, ghost!', 'CRIMSON-1', '#ff3b5c');
      }
    }
    if (e.psm) {
      e.psm.t += dt;
      const f = Math.min(1, e.psm.t / e.psm.dur);
      e.psmPitch = e.psm.kind === 'COBRA' ? 1.45 * Math.sin(Math.PI * f) : 2 * Math.PI * f;
      e.speed *= 1 - 0.28 * dt; e.vel.multiplyScalar(1 - 0.28 * dt);
      if (e.psm.t >= e.psm.dur) { e.psm = null; e.psmPitch = 0; }
    } else e.psmPitch = 0;

    // Smoothed turn acceleration feeds the HUD's LCOS lead computation.
    const nv = _mv.copy(e.fwd).multiplyScalar(e.speed);
    if (dt > 0) e.acc.lerp(_w.copy(nv).sub(e.vel).divideScalar(dt), Math.min(1, dt * 5));
    e.vel.copy(nv);
    e.pos.addScaledVector(e.vel, dt);
    e.pos.y += e.dipV * dt; e.dipV *= Math.exp(-2.2 * dt);                         // hit-induced altitude dip
    engineFireFx(e, dt);

    // ---- hard floor: never below 12 m over ground or water
    const g0 = groundLevel(e.pos.x, e.pos.z);
    if (e.pos.y < g0 + HARD_FLOOR) {
      e.pos.y = g0 + HARD_FLOOR; ai.clamps++;
      if (e.fwd.y < 0.12) { e.fwd.y = 0.12; e.fwd.normalize(); e.vel.copy(e.fwd).multiplyScalar(e.speed); }
    }
    ai.minClear = Math.min(ai.minClear, e.pos.y - g0);
    orient(e);

    // Wingtip condensation streaks in hard pulls (static world points -> streaks).
    if (e.gNow > 4.8) {
      e.trailAcc += dt * 170 * clamp((e.gNow - 4.8) / 2, 0.4, 1);
      while (e.trailAcc >= 1) {
        e.trailAcc -= 1;
        for (const tip of WINGTIPS) {
          const p = _w.copy(tip).applyQuaternion(e.quat).add(e.pos);
          smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.4 + rand() * 0.15, s0: 0.55, s1: 1.5, r: 0.95, g: 0.96, b: 0.98, a: 0.5, drag: 0 });
          ai.trails++;
        }
      }
    }

    // Guns, progressive seeker lock and missiles while engaging (same model as the player's).
    e.burstCD -= dt; e.mslCD -= dt;
    const toPdir = _toPn.copy(toP).normalize();
    const aligned = e.fwd.dot(toPdir);
    const pFwd = _pFwd.set(0, 0, -1).applyQuaternion(S.quaternion);
    const onSix = pFwd.dot(toPdir) > 0;                              // bandit is behind the player
    const engaging = e.tac === 'ENGAGE' && playerActive;
    const inCone = engaging && dist < B_LOCK_RANGE && Math.acos(clamp(aligned, -1, 1)) < B_CONE && onSix;
    // Player inside thick cloud: the bandit's seeker loses the picture (-1.5/s).
    const hidden = C.playerCloud > CLOUD_T;
    // ALQ-135 jamming: bandit radar locks take 2.5x longer to build.
    const lockTime = B_LOCK_TIME * (C.ecmState === 'ACTIVE' ? ECM_SLOW : 1) * (e.ace ? 0.6 : 1);
    if (e.ace) aceTrail(e, dt);
    // Terrain masking: a ridge / canyon wall above the line of sight blocks the radar
    // (sampled every 0.15 s) -- an established lock breaks at once.
    e.maskT = (e.maskT || 0) - dt;
    if (e.maskT <= 0) { e.maskT = 0.15; e.masked = playerActive && dist < B_LOCK_RANGE * 1.6 && occluded(e.pos, S.position); }
    if (e.masked && e.bLock >= B_SOFT) terrainMaskBreak(e.type || e.label);
    e.bLock = e.masked ? 0 : clamp(e.bLock + (hidden ? -1.5 * dt : inCone ? dt / lockTime : -LOCK_DECAY * dt), 0, 1);
    const gunsOnly = C.mcfg.enemyMsl === false || e.noMsl;
    // Duel: fire on the gun solution (nose on the lead point), not on the raw line of sight.
    let gunAligned = aligned;
    if (e.duel) {
      let tof = dist / ACE_BULLET_V;
      _eLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
      tof = _eLead.distanceTo(e.pos) / ACE_BULLET_V;           // one refinement pass
      _eLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
      _eDir.subVectors(_eLead, e.pos).normalize();
      gunAligned = e.fwd.dot(_eDir);
    }
    if (gunsOnly && !e.duel && engaging && !e.masked && e.burst <= 0 && e.burstCD <= 0 && dist < ENEMY_GUN.range && gunAligned > ENEMY_GUN.cone) {
      e.burst = ENEMY_GUN.burst; e.burstCD = ENEMY_GUN.cd;
      if (env.onSfx) env.onSfx('egun', e.pos, 0.6);
    }
    if (engaging && !e.masked && !gunsOnly) {
      if (e.burst <= 0 && e.burstCD <= 0 && aligned > Math.cos(4 * D2R) && dist < 1300 && dist > 150) { e.burst = 0.7; e.burstCD = 2.2 + rand() * 1.5; }
      const target = { pos: S.position, vel: S.velocity, alive: true, isPlayer: true };
      if (e.bLock >= 1 && e.mslCD <= 0 && dist > 700) {
        // Full lock: aggressive, accurate shot.
        if (launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, target, true, BANDIT_FULL, undefined, dist > 2500 ? 'RADAR' : 'IR')) {
          e.mslCD = e.aceFlight ? 9 + rand() * 4 : e.ace ? 8 + rand() * 4 : 14 + rand() * 8;
          say(e.ace ? `${e.label} — FOX ${dist > 2500 ? 'THREE' : 'TWO'}! BREAK! BREAK!`
            : dist > 2500 ? 'RADAR MISSILE — CHAFF / NOTCH!' : 'IR MISSILE — FLARES! BREAK!', 2.2, '#ff4d3d');
        }
      } else if (e.bLock >= B_SOFT && e.bLock < 1 && e.mslCD <= 0 && dist > 900 && rand() < 0.12 * dt) {
        // Impatient bandit fires early on a soft lock: weak, easily defeated shot.
        if (launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, target, true, BANDIT_SOFT, undefined, dist > 2500 ? 'RADAR' : 'IR')) {
          e.mslCD = 12 + rand() * 6; say(`${dist > 2500 ? 'RADAR' : 'IR'} MISSILE — LOW-QUALITY TRACK`, 1.8, '#ffbf3f');
        }
      }
    }
    if (e.burst > 0) {
      e.burst -= dt; e.tracerAcc += 28 * dt;
      while (e.tracerAcc >= 1) {
        e.tracerAcc -= 1;
        // Scratch vectors only (no per-round allocation). Duel rounds follow the lead
        // point with a tight 0.6 deg spread; others aim between nose and target.
        const dir = _eDir;
        if (e.duel) {
          const tof = clamp(dist / (980 + e.speed * 0.5), 0, 1.6);
          dir.copy(S.position).addScaledVector(S.velocity, tof).sub(e.pos).normalize().lerp(e.fwd, 0.35).normalize();
          const sp = ENEMY_GUN.spread;
          dir.x += (rand() - 0.5) * sp; dir.y += (rand() - 0.5) * sp; dir.z += (rand() - 0.5) * sp;
        } else {
          dir.copy(toP).normalize().lerp(e.fwd, 0.5).normalize();
          dir.x += (rand() - 0.5) * 0.02; dir.y += (rand() - 0.5) * 0.02; dir.z += (rand() - 0.5) * 0.02;
        }
        dir.normalize();
        _eMuz.copy(e.pos).addScaledVector(e.fwd, 8);
        _eVel.copy(dir).multiplyScalar(980).add(e.vel);
        enemyTracers.add(_eMuz, _eVel, 2.0);
        if (gunsOnly && env.aaTracer) env.aaTracer(e.pos, dir, 0.25, true);
      }
      C.missileWarning = Math.max(C.missileWarning, 0.5);
    }
    // ---- CRIMSON-1 duel cannon: lead-point bursts in EVERY AI state (no early return).
    if (e.duel && playerActive) {
      e.gunCD -= dt;
      if (e.burstT <= 0 && e.gunCD <= 0 && dist <= ACE_GUN_R && gunAligned >= ACE_GUN_COS) {
        e.burstT = ACE_BURST_MIN + rand() * (ACE_BURST_MAX - ACE_BURST_MIN);
        e.gunAcc = 0; e.duelCD = Math.max(e.duelCD, ACE_BURST_MIN);
        if (env.debug) console.log('[ANGELS_ZERO] ace gun burst d=' + dist.toFixed(0) + ' cos=' + gunAligned.toFixed(3) + ' t=' + e.burstT.toFixed(2));
        if (env.onSfx) env.onSfx('egun', e.pos, clamp(1 - dist / 1500, 0.15, 1));
      }
      if (e.burstT > 0) {
        e.burstT -= dt;
        e.gunAcc += ACE_GUN_RPS * dt;
        const rounds = Math.floor(e.gunAcc);
        e.gunAcc -= rounds;
        C.aceRounds = (C.aceRounds || 0) + rounds;
        for (let n = 0; n < rounds; n++) {
          let tof = dist / ACE_BULLET_V;
          _eLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
          tof = _eLead.distanceTo(e.pos) / ACE_BULLET_V;
          _eLead.copy(S.velocity).multiplyScalar(tof).add(S.position);
          _eDir.subVectors(_eLead, e.pos).normalize();
          const sp = 0.35 * D2R;
          _eDir.x += (rand() - 0.5) * sp; _eDir.y += (rand() - 0.5) * sp; _eDir.z += (rand() - 0.5) * sp;
          _eDir.normalize();
          _eMuz.copy(e.pos).addScaledVector(e.fwd, 6);
          _eVel.copy(_eDir).multiplyScalar(ACE_BULLET_V);
          // Closest approach of this round's ray to the player sphere (no projectile allocation).
          _t.copy(S.position).sub(_eMuz);
          const along = _t.dot(_eVel), v2 = ACE_BULLET_V * ACE_BULLET_V;
          if (along > 0 && along < ACE_GUN_R * ACE_BULLET_V) {
            _toPn.copy(_eVel).multiplyScalar(along / v2).sub(_t);
            const perp = _toPn.length();
            if (perp < 40 && env.onSfx) env.onSfx('gunNear', e.pos, clamp(1 - perp / 40, 0, 1));
            if (perp < ACE_HIT_R) {
              damagePlayer(ACE_GUN_DMG);
              C.aceHits = (C.aceHits || 0) + 1;
              if (env.onSfx) env.onSfx('gunhit', S.position, 1);
              if (env.debug) console.log('[ANGELS_ZERO] ace gun hit dmg=' + ACE_GUN_DMG);
            }
          }
          if (n % 4 === 0 && env.aaTracer) env.aaTracer(_eMuz, _eVel, 0.3, true);
        }
        if (e.burstT <= 0) e.gunCD = ACE_GUN_CD;
      }
    }
  }

  // Physical airframe collision (swept, relative motion over this frame): 14 m.
  const lastPlayerPos = new THREE.Vector3(); let lastPlayerValid = false;
  function checkRams(playerActive) {
    if (!playerActive || !lastPlayerValid) return;
    for (const e of enemies) {
      if (!e.alive || e.scripted) continue;
      const a = _s.copy(e.prev).sub(lastPlayerPos), b = _w.copy(e.pos).sub(S.position);
      const seg = _mv.copy(b).sub(a), l2 = seg.lengthSq();
      const t = l2 > 0 ? clamp(-a.dot(seg) / l2, 0, 1) : 0;
      const closest = a.addScaledVector(seg, t).length();
      if (closest < RAM_R) {
        const mid = e.pos.clone().add(S.position).multiplyScalar(0.5);
        ai.rams++;
        shockRing(mid, 0xcfe6ff, true);
        hitSparks(mid, S.velocity);
        explosion(mid, 1.3, { vel: e.vel, kind: 'air' });
        destroyEnemy(e, false, 'RAM');
        damagePlayer(45);
        C.hitFlash = 0.6;
        say('MID-AIR COLLISION — AIRFRAME DAMAGE', 2.4, '#ff4d3d');
        if (env.onSfx) env.onSfx('explosion', mid, 1.4);
      }
    }
  }

  function destroyEnemy(e, byMissile, how) {
    if (!e.alive) return;
    e.alive = false;
    // A limping WARDEN-2 is saved once every assigned pursuer is destroyed.
    if (C.limp && C.limp.st === 'LIMPING') {
      const idx = enemies.indexOf(e);
      for (let i = 0; i < C.limp.n; i++) if (C.limp.pursuers[i] === idx) { C.limp.pursuers[i] = -1; break; }
      let live = false;
      for (let i = 0; i < C.limp.n; i++) {
        const pi = C.limp.pursuers[i];
        if (pi >= 0 && enemies[pi] && enemies[pi].alive) { live = true; break; }
      }
      if (!live && C.limp.w && C.limp.w.hp > 0) saveWingman();
    }
    // One slow-mo pulse per kill: close gun kill or any ace. A new kill restarts it.
    const close = !byMissile && !how && e.pos.distanceTo(S.position) < 450;
    const aceK = e.aceFlight || /^CRIMSON-/.test(e.label || '') || e.ace;
    if ((close || aceK) && how !== 'BASE' && env.onSlowMo) env.onSlowMo();
    explosion(e.pos, 1.7, { vel: e.vel, kind: 'air' });
    e.wreck = { vel: e.vel.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, -15, 0)), spin: new THREE.Vector3((rand() - 0.5) * 3, (rand() - 0.5) * 2, (rand() - 0.5) * 5), t: 0 };
    if (how === 'BASE' || how === 'WINGMAN') {                     // no player credit
      if (C.lockTarget === e) C.lockTarget = null;
      if (C.designated === e) { C.designated = null; C.lockProgress = 0; C.lockState = 'NONE'; }
      C.baseKills = (C.baseKills || 0) + 1;
      if (e.ace && C.ace) { C.ace.alive = false; C.ace.hp = 0; }
      const src = how === 'WINGMAN' ? 'WARDEN FLIGHT' : 'BASE AIR DEFENCE';
      pushEvent('DESTROYED', `${src} — ${e.type || e.label} DOWN`, 0, '#5fe8ff');
      say(`${src} — SPLASH ${e.label}!`, 2.0, '#5fe8ff');
      return;
    }
    if (env.onTele) env.onTele(e.aceFlight || e.ace ? 'ACE_KILL' : 'KILL', e.pos);
    C.kills++; C.score += 1500; C.hitFlash = 0.3;
    if ((e.aceFlight || e.ace) && env.onRadio) env.onRadio('ON_ACE_KILL');
    if (C.mode === 'FURBALL') {
      C.furballKills++;
      if (C.furballKills % FURBALL_ACE_EVERY === 0 && !enemies.some(x => x.aceFlight && x.alive)) {
        aceFlightDone = false; spawnAceFlight();
      }
    }
    if (e.intrAce) finishIntrusion(true);
    if (e.aceFlight) {
      C.score += ACE_FLIGHT_BONUS;
      pushEvent('DESTROYED', 'ACE DOWN // ' + e.label, 2500, '#ffd45a');
      C.flares = FLR_MAX; if (C.chaff !== undefined) C.chaff = C.chaffMax;
      say('[ ACE DOWN ] — FLARES' + (C.chaff !== undefined ? ' / CHAFF' : '') + ' REFILLED', 2.2, '#ffd45a');
      e.aceFlight = false; tintFleet();
    }
    if (env.onWing) env.onWing('Splash one, Lead!', 'WARDEN');
    pushEvent('DESTROYED', `${e.type || e.label} DESTROYED`, 1500, '#52ff9c');
    if (C.lockTarget === e) C.lockTarget = null;
    if (C.designated === e) { C.designated = null; C.lockProgress = 0; C.lockState = 'NONE'; }
    if (how === 'CRASH') say('CRIPPLED BANDIT IMPACT — SPLASH ONE!', 2.2);
    else if (how !== 'RAM') say(byMissile ? 'SPLASH ONE — GOOD KILL!' : 'GUNS KILL — SPLASH ONE!', 2.2);
    // Every kill bumps the chain: Vulcan kills are GUNS KILL, everything else
    // TARGET DESTROYED (+0.5x, 12 s timer); ripple kills can add 4AAM SWEEP.
    awardStyle(!byMissile && !how ? 'GUNS_KILL' : 'KILL');
    if (how === 'AAM4') noteSweepKill();
    if (e.ace) {
      C.aceDowns++; if (C.ace) { C.ace.alive = false; C.ace.hp = 0; }
      awardStyle('ACE_KILL', e.label);
      pushEvent('DESTROYED', `ACE ${e.label} DESTROYED`, 5000, '#ff3b5c');
      say(`${e.label} IS DOWN — ACE DESTROYED!`, 3.2, '#ff3b5c');
    }
    C.killFlash = { t: performance.now(), mult: C.comboMult };
    if (env.onRadio) env.onRadio('KILL', { how });
  }

  /* ================================== style combo multiplier + style feed */
  // comboMult 1.0x -> 5.0x scales every point scored while the chain lives;
  // comboTimer (12 s) restarts on every kill or style trigger and the chain
  // drops back to 1.0x when it runs out. Style plays add points, multiplier
  // and push-forward refills (gun vent, flares). DANGER CLOSE (< 180 ft AGL,
  // > 420 kt over water or in the NW canyon) multiplies scoring x1.5 while held.
  const COMBO_MAX = 5, COMBO_T = 12, SWEEP_WIN = 2.5, CLOSE_R = 95, THREAD_CD = 10;
  const DANGER_AGL = 220 * 0.3048, DANGER_SPD = 380 / 1.94384, THREAD_SPD = 380 / 1.94384;
  const STYLE = {
    KILL:          { text: 'TARGET DESTROYED', pts: 0, mult: 0.5, color: '#58ff9a' },
    ACE_KILL:      { text: 'ACE KILL',      pts: 5000, mult: 1.0, color: '#ff3b5c' },
    WING_RIP:      { text: 'WING RIP',      pts: 300, mult: 0.5,  color: '#ffd45a' },
    WING_SAVED:    { text: 'WINGMAN SAVED', pts: LIMP_SAVE_PTS, mult: 0, color: '#5fe8ff' },
    GUNS_KILL:     { text: 'GUNS KILL',     pts: 400, mult: 0.5,  color: '#58ff9a' },
    SWEEP:         { text: '4AAM SWEEP',    pts: 500, mult: 0.75, color: '#ffd45a' },
    CLOSE_CALL:    { text: 'CLOSE CALL',    pts: 250, mult: 0.5,  color: '#58ff9a' },
    BRIDGE_THREAD: { text: 'BRIDGE THREAD', pts: 600, mult: 1.0,  color: '#ffd45a' },
    DANGER_CLOSE:  { text: 'DANGER CLOSE',  pts: 0,   mult: 0,    color: '#ffb838' },
    PSM:           { text: 'POST-STALL',    pts: 400, mult: 0.5,  color: '#00ff66' },
    QUAD_SPLASH:   { text: 'QUAD SPLASH',   pts: 0,   mult: 0,    color: '#ffd45a' },  // drone salvo: display only
    BROKEN_WING:   { text: 'BROKEN WING',    pts: BW_PTS, mult: 1.0, color: '#ffd45a' },
    INTRUSION:     { text: 'CRIMSON DOWN',   pts: INTR_BONUS, mult: 0.5, color: '#ff3b5c' }
  };
  Object.assign(C, { comboMult: 1, comboTimer: 0, comboMax: COMBO_MAX, comboWindow: COMBO_T, comboBonus: 0,
    styleFeed: [], styleCounts: {}, dangerClose: false, dangerMult: 1 });
  let scoreSeen = C.score || 0, styleClock = 0, sweepKills = [], sweepAwardT = -99, dangerFeedT = -99;
  const threadCD = [], threadSide = [];
  function refreshCombo() { if (C.comboMult > 1) C.comboTimer = COMBO_T; }
  function awardStyle(kind, sub) {
    const s = STYLE[kind];
    C.styleCounts[kind] = (C.styleCounts[kind] || 0) + 1;
    if (s.mult) { C.comboMult = Math.min(COMBO_MAX, +(C.comboMult + s.mult).toFixed(2)); C.comboTimer = COMBO_T; }
    if (s.pts) C.score += s.pts;
    if (env.onRadio && kind !== 'KILL' && kind !== 'GUNS_KILL') env.onRadio(kind, { sub });
    const nowMs = performance.now();
    if (!C.refillFlash) C.refillFlash = { gun: 0, flr: 0 };
    let refill = '', vent = false, flr = false;
    if (kind === 'WING_RIP') {
      C.gunHeat *= 0.5;                                                   // vent half the barrel heat
      if (C.gunOverheat && C.gunHeat < GUN_RESUME) C.gunOverheat = false;
      vent = true; C.refillFlash.gun = nowMs;
    }
    if (kind === 'WING_RIP' || kind === 'GUNS_KILL') {
      const had = C.flares;
      C.flares = Math.min(C.flareMax, C.flares + 1);
      if (C.flares >= C.flareMax) flareRecharge = 0;
      flr = C.flares > had;
      if (flr) C.refillFlash.flr = nowMs;
      refill = vent ? (flr ? 'HEAT -50% // +1 FLR' : 'HEAT -50% // FLR FULL') : flr ? '+1 FLR' : 'FLR FULL';
    }
    if (kind === 'DANGER_CLOSE') refill = 'SCORE x1.5';
    if (s.mult) refill = refill ? `${refill} // x${C.comboMult.toFixed(2).replace(/0$/, '')}` : `x${C.comboMult.toFixed(2).replace(/0$/, '')}`;
    C.styleFeed.push({ text: s.text, pts: s.pts, sub: sub ? `${sub} // ${refill}` : refill, refill: vent || flr, color: s.color, born: nowMs, mult: C.comboMult });
    if (C.styleFeed.length > 6) C.styleFeed.shift();
    if (env.onSfx) {
      if (kind === 'CLOSE_CALL') env.onSfx('whoosh');
      // Confirmation ping pitched up with each combo step (0 = DANGER CLOSE soft tone).
      env.onSfx('style', null, s.mult ? Math.round((C.comboMult - 1) / 0.5) : 0);
      if (vent) env.onSfx('steam');
      if (flr) env.onSfx('clack');
    }
  }
  // 4AAM SWEEP: two or more ripple-salvo kills inside 2.5 s (one award per salvo).
  function noteSweepKill() {
    sweepKills.push(styleClock);
    sweepKills = sweepKills.filter(t => styleClock - t <= SWEEP_WIN);
    if (sweepKills.length >= 2 && sweepKills[0] > sweepAwardT) { sweepAwardT = styleClock; awardStyle('SWEEP', sweepKills.length + ' KILLS'); }
    else refreshCombo();
  }
  // CLOSE CALL: a bandit missile aimed at us passes inside 55 m and opens again without detonating.
  function checkCloseCall(m, pos) {
    if (m.closeCall || m.hitPlayer || !m.target || !m.target.isPlayer) return;
    const d = pos.distanceTo(S.position);
    if (d < m.minD) { m.minD = d; return; }
    if (m.minD < CLOSE_R && d > m.minD + 15) { m.closeCall = true; awardStyle('CLOSE_CALL', Math.round(m.minD) + ' M'); }
  }
  function updateStyle(dt, playerActive) {
    styleClock += dt;
    C.comboPeak = Math.max(C.comboPeak || 1, C.comboMult);         // sortie debrief: peak multiplier
    if (C.comboTimer > 0) { C.comboTimer = Math.max(0, C.comboTimer - dt); if (C.comboTimer <= 0) C.comboMult = 1; }
    if (C.comboMult <= 1) C.comboTimer = 0;
    // DANGER CLOSE
    let danger = false;
    if (playerActive && !C.dead) {
      const p = S.position, th = terrainHeight(p.x, p.z), agl = p.y - Math.max(0, th);
      const inCanyon = env.canyonX && p.z > -10600 && p.z < -5800 && Math.abs(p.x - env.canyonX(p.z)) < 260;
      danger = agl < DANGER_AGL && agl > 0 && S.speed > DANGER_SPD && (th < 0 || inCanyon);
    }
    if (danger && !C.dangerClose && styleClock - dangerFeedT > 6) { dangerFeedT = styleClock; awardStyle('DANGER_CLOSE'); }
    C.dangerClose = danger; C.dangerMult = danger ? 1.5 : 1;
    // BRIDGE THREAD: cross the span's vertical plane under the deck, between the abutments.
    const bridges = env.bridges || [];
    for (let i = 0; i < bridges.length; i++) {
      const b = bridges[i]; threadCD[i] = Math.max(0, (threadCD[i] || 0) - dt);
      if (!playerActive) { threadSide[i] = undefined; continue; }
      const p = S.position, ax = b.b.x - b.a.x, az = b.b.z - b.a.z, L2 = ax * ax + az * az;
      const side = Math.sign(ax * (p.z - b.a.z) - az * (p.x - b.a.x));
      const along = ((p.x - b.a.x) * ax + (p.z - b.a.z) * az) / L2;
      if (threadSide[i] !== undefined && side !== threadSide[i] && side !== 0 && along > 0.04 && along < 0.96 &&
          p.y > 0 && p.y < (b.under != null ? b.under - 3 : b.a.y - 4) && S.speed > THREAD_SPD && threadCD[i] <= 0) {
        threadCD[i] = THREAD_CD;
        awardStyle('BRIDGE_THREAD', Math.round(S.speed * 1.94384) + ' KT');
      }
      if (side !== 0) threadSide[i] = side;
    }
    // Multiplier on every point scored this frame.
    const d = (C.score || 0) - scoreSeen;
    if (d > 0) {
      const k = C.comboMult * C.dangerMult;
      if (k > 1) { const bonus = Math.round(d * (k - 1)); C.score += bonus; C.comboBonus += bonus; }
    }
    scoreSeen = C.score || 0;
    const nowMs = performance.now();
    C.styleFeed = C.styleFeed.filter(s => nowMs - s.born < 3200);
  }

  function updateWreck(e, dt) {
    const w = e.wreck;
    w.t += dt;
    w.vel.y -= G0 * dt; w.vel.multiplyScalar(1 - 0.08 * dt);
    e.pos.addScaledVector(w.vel, dt);
    const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(w.spin.x * dt, w.spin.y * dt, w.spin.z * dt));
    e.quat.multiply(sq);
    if (rand() < 0.9) fire.spawn({ x: e.pos.x + (rand() - 0.5) * 4, y: e.pos.y, z: e.pos.z + (rand() - 0.5) * 4, vx: (rand() - 0.5) * 6, vy: 4, vz: (rand() - 0.5) * 6,
      life: 0.5 + rand() * 0.4, s0: 5, s1: 11, r: 1, g: 0.5 + rand() * 0.3, b: 0.15, a: 0.9, drag: 1.5 });
    const g = 0.08 + rand() * 0.06;
    smoke.spawn({ x: e.pos.x, y: e.pos.y, z: e.pos.z, vx: (rand() - 0.5) * 4, vy: 2, vz: (rand() - 0.5) * 4, life: 4 + rand() * 2, s0: 6, s1: 30, r: g, g, b: g, a: 0.7, drag: 0.6, rise: 1.5 });
    const ground = terrainHeight(e.pos.x, e.pos.z);
    if (e.pos.y <= Math.max(0, ground) + 1) {
      // Impact: never let a wreck pass under the map — water geyser or ground fireball.
      e.pos.y = Math.max(0, ground);
      impactFx(e.pos, ground < 0, 0.75);
      ai.impacts++;
      e.wreck = null;
    }
  }

  /* ============================================ localized airframe damage */
  // Every 20 mm hit is transformed into the bandit's local frame (x right, y up,
  // z aft) and routed to a structural zone:
  //   |x| > 1.8 inside the wing chord        -> left / right wing (30 hits each)
  //   |x| <= 1.8, z > 2.2 (and tailplanes)   -> engines / tail: fire, -40 % speed
  //   |x| <= 1.8, z <= 2.2                   -> fuselage core (e.hp)
  // Wing hits jolt the jet (roll impulse + altitude dip). A wing at 0 HP is
  // severed: its instanced part is hidden, a tumbling smoking wing mesh flies
  // off, the stub sprays fuel vapour + smoke, and the bandit enters CRIPPLED
  // flight: violent roll toward the missing wing, 18-32 m/s sink, a smoking
  // spiral until it hits the sea (geyser) or an island (fireball + shockwave).
  // Kill credit on impact, or immediately if the core is shot out mid-air.
  const WING_HP = 30, HIT_IMPULSE = 0.45;
  const DBG_HITS = [];                                          // debug: first hits on bandit 0 (zone@local x/y/z)
  const _hl = new THREE.Vector3(), _qi = new THREE.Quaternion();
  function hitZone(e, l) {
    const k = DIFF.gunZoneScale;                                           // >1 = more forgiving envelope
    if (Math.abs(l.y) > 2.6 * k || l.z < -10.5 * k || l.z > 10.5 * k) return null;
    const ax = Math.abs(l.x);
    if (ax > 6.9 * k) return null;
    if (ax > 1.8) {
      if (l.z >= -1.5 * k && l.z <= 6.2) {
        const side = l.x < 0 ? 'L' : 'R';
        return (side === 'L' ? e.wingOffL : e.wingOffR) ? null : side;   // a severed wing is just air
      }
      return l.z > 6.2 && ax < 4.8 * k ? 'TAIL' : null;                   // all-moving tailplanes
    }
    return l.z > 2.2 ? 'ENG' : 'CORE';
  }
  function hitEnemy(e, zone, p, v) {
    hitSparks(p, v);
    C.gunHitsP++;
    C.hitFlash = 0.12; ai.hits = (ai.hits || 0) + 1;
    if (zone === 'L' || zone === 'R') {
      ai.wingHits = (ai.wingHits || 0) + 1;
      e.rollVel += (zone === 'L' ? 1 : -1) * HIT_IMPULSE;                 // the hit wing drops
      e.dipV -= 2.5;
      e.hp -= 0.5;                                                         // outer-wing hits barely touch the core
      if (zone === 'L') { e.wingL -= 1; if (e.wingL <= 0 && !e.wingOffL) severWing(e, 'L'); }
      else { e.wingR -= 1; if (e.wingR <= 0 && !e.wingOffR) severWing(e, 'R'); }
    } else if (zone === 'TAIL') {
      e.hp -= 3; e.rollVel += (Math.random() - 0.5) * 0.3;               // stabilator hits: shake, minor structure
    } else if (zone === 'ENG') {
      e.hp -= 6; e.engHits++;
      if (!e.engineFire && e.engHits >= (e.ace ? 5 : 2)) {
        e.engineFire = true; e.speedCap = 0.6; ai.engineHits = (ai.engineHits || 0) + 1;
        pushEvent('DAMAGED', `[ ENGINE HIT ] ${e.type}`, 200, '#ffbf3f'); C.score += 200;
        say('[ ENGINE HIT ] — ' + e.type + ' ON FIRE', 1.6, '#ffbf3f');
      }
    } else {
      e.hp -= 10;
    }
    e.zoneLog = zone;
    if (e.ace && e.hp > 0) aceHurt(e);
    if (e.hp <= 0) destroyEnemy(e, false);
  }
  function severWing(e, side) {
    if (side === 'L') e.wingOffL = true; else e.wingOffR = true;
    ai.severs = (ai.severs || 0) + 1;
    spawnWingDebris(e, side);
    if (!e.crippled) {
      e.crippled = side; e.tac = e.mode = 'CRIPPLED'; e.crippleT = 0;
      e.crRoll = (110 + rand() * 70) * D2R;                                // 110-180 deg/s struggled roll
      e.sinkTarget = 18 + rand() * 14;                                     // 18-32 m/s sink
      e.burst = 0; e.bLock = 0; e.reactT = null; e.merge = 0;
    }
    C.wingSeveredT = performance.now();
    awardStyle('WING_RIP');
    pushEvent('DAMAGED', '[ WING SEVERED ]', 300, '#ffbf3f');
    say(`[ WING SEVERED ] — ${e.type} GOING DOWN`, 2.0, '#ffbf3f');
    explosion(e.pos.clone().add(new THREE.Vector3(side === 'L' ? -2.5 : 2.5, 0, 1.5).applyQuaternion(e.quat)), 0.7);
  }

  // Severed wing: a real mesh copy of that side's wing parts, tumbling away.
  const wingParts = { L: [], R: [] }, debris = [];
  function spawnWingDebris(e, side) {
    const parts = wingParts[side]; if (!parts.length) return;
    const g = new THREE.Group();
    for (const pt of parts) { const m = new THREE.Mesh(pt.geo, pt.mat); m.castShadow = false; g.add(m); }
    g.position.copy(parts.center).applyQuaternion(e.quat).add(e.pos);
    g.quaternion.copy(e.quat);
    scene.add(g);
    const out = new THREE.Vector3(side === 'L' ? -1 : 1, 0.25, 0).applyQuaternion(e.quat);
    debris.push({ g, vel: e.vel.clone().multiplyScalar(0.82).addScaledVector(out, 15),
      spin: new THREE.Vector3((rand() - 0.5) * 7, (rand() - 0.5) * 5, (rand() - 0.5) * 9), t: 0, acc: 0 });
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.t += dt;
      d.vel.y -= G0 * dt; d.vel.multiplyScalar(Math.exp(-0.35 * dt));      // flat plate: heavy drag
      d.g.position.addScaledVector(d.vel, dt);
      d.g.quaternion.multiply(_q.setFromEuler(new THREE.Euler(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt)));
      d.acc += dt * 40;
      while (d.acc >= 1) {
        d.acc -= 1;
        const gg = 0.12 + rand() * 0.08, p = d.g.position;
        smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: (rand() - 0.5) * 3, vy: rand() * 2, vz: (rand() - 0.5) * 3, life: 2.5 + rand() * 1.5, s0: 2, s1: 11, r: gg, g: gg, b: gg, a: 0.65, drag: 0.8, rise: 0.8 });
        if (d.t < 3 && rand() < 0.4) fire.spawn({ x: p.x, y: p.y, z: p.z, vx: d.vel.x * 0.3, vy: d.vel.y * 0.3, vz: d.vel.z * 0.3, life: 0.25, s0: 3, s1: 1, r: 1, g: 0.6, b: 0.2, a: 0.9, drag: 1 });
      }
      const gl = groundLevel(d.g.position.x, d.g.position.z);
      if (d.g.position.y <= gl + 0.5 || d.t > 30) {
        if (d.t <= 30) { if (terrainHeight(d.g.position.x, d.g.position.z) < 0) splash(d.g.position, 0.9); else explosion(d.g.position, 0.6); }
        scene.remove(d.g); debris.splice(i, 1);
      }
    }
  }

  // CRIPPLED flight: one wing gone -> rolling, sinking spiral; the pilot fights it.
  function updateCrippled(e, dt) {
    e.prev.copy(e.pos);
    e.crippleT += dt;
    const t = e.crippleT, sgn = e.crippled === 'L' ? 1 : -1;               // +bank = left wing down
    const fight = 0.7 + 0.3 * Math.sin(t * 2.3 + e.id * 1.7);              // stick fighting the roll
    e.bank = wrapPi(e.bank + sgn * e.crRoll * fight * dt);
    const hv = _w.set(e.vel.x, 0, e.vel.z);
    let hs = hv.length(); if (hs < 1) { hv.copy(e.fwd).setY(0); hs = 1; }
    hs += (150 - hs) * Math.min(1, dt * 0.3);
    hv.normalize().applyAxisAngle(UP, sgn * 0.42 * dt).multiplyScalar(hs);  // spiral toward the missing wing
    const vy = e.vel.y + (-e.sinkTarget - e.vel.y) * Math.min(1, dt * 0.7);
    const nv = _mv.set(hv.x, vy, hv.z);
    if (dt > 0) e.acc.lerp(_s.copy(nv).sub(e.vel).divideScalar(dt), Math.min(1, dt * 5));
    e.vel.copy(nv); e.speed = nv.length();
    e.pos.addScaledVector(e.vel, dt);
    e.fwd.copy(nv).normalize();
    e.ab = 0; e.gNow = 1;
    orient(e);
    // Sheared wing root: fuel vapour (white) + thick dark smoke ribbon.
    const stub = _s.set(sgn > 0 ? -1.9 : 1.9, -0.3, 2.0).applyQuaternion(e.quat).add(e.pos);
    e.trailAcc += dt * 70;
    while (e.trailAcc >= 1) {
      e.trailAcc -= 1;
      if (rand() < 0.45) smoke.spawn({ x: stub.x, y: stub.y, z: stub.z, vx: e.vel.x * 0.3, vy: e.vel.y * 0.3, vz: e.vel.z * 0.3, life: 1.4 + rand(), s0: 1.2, s1: 7, r: 0.92, g: 0.94, b: 0.96, a: 0.5, drag: 1.2 });
      const gg = 0.05 + rand() * 0.06;
      smoke.spawn({ x: stub.x, y: stub.y, z: stub.z, vx: e.vel.x * 0.3 + (rand() - 0.5) * 3, vy: e.vel.y * 0.3, vz: e.vel.z * 0.3 + (rand() - 0.5) * 3,
        life: 5 + rand() * 3, s0: 2.5, s1: 18 + rand() * 8, r: gg, g: gg, b: gg, a: 0.75, drag: 0.6, rise: 0.8 });
      if (rand() < 0.25) fire.spawn({ x: stub.x, y: stub.y, z: stub.z, vx: e.vel.x * 0.5, vy: e.vel.y * 0.5, vz: e.vel.z * 0.5, life: 0.2 + rand() * 0.2, s0: 2.5, s1: 0.8, r: 1, g: 0.55, b: 0.15, a: 1, drag: 1 });
    }
    engineFireFx(e, dt);
    // Impact: sea -> massive geyser, island -> fireball + shockwave; full kill credit.
    const g0 = groundLevel(e.pos.x, e.pos.z);
    if (e.pos.y <= g0 + 2) {
      e.pos.y = g0;
      const water = terrainHeight(e.pos.x, e.pos.z) < 0;
      ai.crippledImpacts = (ai.crippledImpacts || 0) + 1;
      destroyEnemy(e, false, 'CRASH');
      e.wreck = null;
      impactFx(e.pos.clone(), water, 1.3);
      explosion(e.pos, 2.2);
    }
  }
  function engineFireFx(e, dt) {
    if (!e.engineFire || !nozzles.length) return;
    e.fireAcc = (e.fireAcc || 0) + dt * 30;
    while (e.fireAcc >= 1) {
      e.fireAcc -= 1;
      const nz = nozzles[(rand() * nozzles.length) | 0];
      const p = _a.copy(nz).add(new THREE.Vector3(0, 0, 1.4)).applyQuaternion(e.quat).add(e.pos);
      fire.spawn({ x: p.x, y: p.y, z: p.z, vx: e.vel.x * 0.55 + (rand() - 0.5) * 6, vy: e.vel.y * 0.55 + (rand() - 0.5) * 6, vz: e.vel.z * 0.55 + (rand() - 0.5) * 6,
        life: 0.25 + rand() * 0.25, s0: 2.6, s1: 0.8, r: 1, g: 0.5 + rand() * 0.3, b: 0.12, a: 1, drag: 1.4 });
      const gg = 0.08 + rand() * 0.06;
      smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: e.vel.x * 0.35, vy: e.vel.y * 0.35, vz: e.vel.z * 0.35, life: 3.5 + rand() * 2, s0: 2, s1: 12, r: gg, g: gg, b: gg, a: 0.65, drag: 0.7, rise: 0.6 });
    }
  }

  const _wfOne = new THREE.Vector3(1, 1, 1), _wfZero = new THREE.Vector3(0, 0, 0), _wfScale = new THREE.Vector3();
  const _wfFull = new THREE.Matrix4(), _wfNone = new THREE.Matrix4(), _wfM = new THREE.Matrix4();
  const _wfNz = new THREE.Vector3(), _wfP = new THREE.Vector3(), _wfPo = new THREE.Vector3(), _wfPc = new THREE.Vector3();
  const _wfS1 = new THREE.Vector3(), _wfS2 = new THREE.Vector3();
  const _flFrustum = new THREE.Frustum(), _flProj = new THREE.Matrix4(), _flSphere = new THREE.Sphere();
  let fleetActiveCount = 0;
  function cullFleet() {
    if (!fleet.length) return;
    if (!fleetActiveCount) {
      for (const f of fleet) f.inst.visible = false;
      if (glowMesh) glowMesh.visible = false;
      if (flameOuter) flameOuter.visible = false;
      if (flameCore) flameCore.visible = false;
      return;
    }
    let anyVisible = !camera;
    if (camera) {
      _flProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _flFrustum.setFromProjectionMatrix(_flProj);
      for (let i = 0; i < fleetActiveCount; i++) {
        const e = enemies[i];
        if (!e || (!e.alive && !e.wreck)) continue;
        _flSphere.set(e.pos, 28);
        if (_flFrustum.intersectsSphere(_flSphere) || e.pos.distanceToSquared(camera.position) < 900) { anyVisible = true; break; }
      }
    }
    for (const f of fleet) f.inst.visible = anyVisible;
    if (glowMesh) glowMesh.visible = anyVisible;
    if (flameOuter) flameOuter.visible = anyVisible;
    if (flameCore) flameCore.visible = anyVisible;
  }
  function writeFleet() {
    if (!fleet.length) return;
    let maxIdx = -1;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const vis = e.alive || !!e.wreck, sk = e.scale || 1;                 // strike bombers: 1.35x airframe
      if (vis) maxIdx = i;
      _wfFull.compose(e.pos, e.quat, vis ? _wfScale.set(sk, sk, sk) : _wfZero);
      _wfNone.compose(e.pos, e.quat, _wfZero);
      for (const f of fleet) f.inst.setMatrixAt(i, (f.part === 'L' && e.wingOffL) || (f.part === 'R' && e.wingOffR) ? _wfNone : _wfFull);
      const ab = e.alive ? e.ab : 0, on = ab > 0.05;
      for (let k = 0; k < nozzles.length; k++) {
        _wfNz.copy(nozzles[k]);
        if (sk !== 1) _wfNz.multiplyScalar(sk);
        _wfP.set(_wfNz.x, _wfNz.y, _wfNz.z + 1.9).applyQuaternion(e.quat).add(e.pos);
        glowMesh.setMatrixAt(i * 2 + k, _wfM.compose(_wfP, e.quat, e.alive ? _wfOne : _wfZero));
        // Burner plume: base at the nozzle exit, length grows with afterburner.
        const flick = 0.9 + 0.2 * rand();
        const lo = (0.45 + 0.75 * ab) * flick, lc = (0.5 + 0.6 * ab) * flick;
        _wfPo.set(_wfNz.x, _wfNz.y, _wfNz.z + 1.0 + 2.3 * lo).applyQuaternion(e.quat).add(e.pos);
        _wfPc.set(_wfNz.x, _wfNz.y, _wfNz.z + 1.0 + 1.3 * lc).applyQuaternion(e.quat).add(e.pos);
        flameOuter.setMatrixAt(i * 2 + k, _wfM.compose(_wfPo, e.quat, on ? _wfS1.set(0.8 + 0.3 * ab, 0.8 + 0.3 * ab, lo) : _wfZero));
        flameCore.setMatrixAt(i * 2 + k, _wfM.compose(_wfPc, e.quat, on ? _wfS2.set(1, 1, lc) : _wfZero));
      }
    }
    fleetActiveCount = maxIdx + 1;
    for (const f of fleet) {
      f.inst.count = fleetActiveCount;
      if (fleetActiveCount > 0) f.inst.instanceMatrix.needsUpdate = true;
    }
    glowMesh.count = fleetActiveCount * 2;
    flameOuter.count = fleetActiveCount * 2;
    flameCore.count = fleetActiveCount * 2;
    if (fleetActiveCount > 0) {
      glowMesh.instanceMatrix.needsUpdate = true;
      flameOuter.instanceMatrix.needsUpdate = true; flameCore.instanceMatrix.needsUpdate = true;
    }
    cullFleet();
  }

  /* =========================================================== lock-on */
  // Two-stage targeting.
  // Stage 1 - APG-63 auto-designation (passive): every frame the radar picks the
  // highest-priority live bandit inside the 30 deg forward radar cone and 8 NM
  // (smallest off-boresight angle, range tie-break, hysteresis for the current
  // track). With >4AAM selected it tracks up to four (TGT 1-4). No missile lock
  // builds in this stage: a launch before C is a dumb-fire.
  // Stage 2 - C arms the seeker (C.seekerArmed) on the designated target(s):
  // MSL builds the progressive IR lock (NONE -> ACQ -> LOCK; 14 deg / 3.5 NM /
  // 1.3 s), 4AAM locks every tracked target at once (25 deg / 4.5 NM / 1.6 s).
  // C while locked cycles to the next nearest forward bandit and re-arms on it.
  // Losing the seeker (lock decayed to nothing, or 5 s without acquiring) drops
  // back to passive designation until C is pressed again.
  const SIGHT_HALF = 11 * D2R;
  const RADAR_HALF = 30 * D2R, RADAR_RANGE = 8 * NM;
  const AAM4_RANGE = 4.5 * NM, AAM4_MAX = 20, AAM4_RELOAD = 12, AAM4_RACK = 3.5, AAM4_STAGGER = 0.09;
  const QAAM_MAX = 12, QAAM_RELOAD = 10, QAAM_HALF = 60 * D2R, QAAM_LOCK = 0.6, QAAM_RANGE = 2.6 * NM, QAAM_INTERVAL = 0.35;
  const SEEKER_GIVEUP = 5;
  // Cloud cover: IR seekers and radar lose their picture through thick cloud.
  const CLOUD_T = 0.35;                                      // cloudDensity above this = "in cloud"
  const cloudAt = p => (env.cloudDensity ? env.cloudDensity(p) : 0);
  let cloudClear = 0;                                        // s: suppress the RWR alert after a cloud break
  Object.assign(C, { seekerArmed: false, multi: [], multiProg: [], multiState: [], multiLocked: 0,
    aam4: AAM4_MAX, aam4Max: AAM4_MAX, aam4Reload: 0, aam4ReloadMax: AAM4_RELOAD,
    spw: '4AAM', qaam: QAAM_MAX, qaamMax: QAAM_MAX, qaamReload: 0, qaamReloadMax: QAAM_RELOAD, lowHpSaid: false });
  let seekerT = 0, seekerHadLock = false;
  const fwdOf = () => new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);

  // Forward radar picture, best first (off-boresight angle + small range weight).
  function radarCandidates(half = RADAR_HALF, range = RADAR_RANGE) {
    const fwd = fwdOf(), out = [];
    for (const e of lockables()) {                           // bandits + live task-force ships
      if (!e.alive) continue;
      const to = e.pos.clone().sub(S.position), d = to.length();
      if (d < 1 || d > range) continue;
      const err = Math.acos(clamp(to.divideScalar(d).dot(fwd), -1, 1));
      if (err > half) continue;
      out.push({ e, err, d, score: err + (d / NM) * 0.02 });
    }
    return out.sort((a, b) => a.score - b.score);
  }
  // Kept for the old debug hooks: best bandit inside the 22 deg sight cone.
  function boresightTarget(exclude) {
    const c = radarCandidates(SIGHT_HALF).filter(x => x.e !== exclude);
    return c.length ? c[0].e : null;
  }
  function designate(e) {
    if (e === C.designated) return;
    C.designated = e; C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null;
  }
  function setMulti(list) {                                  // keeps seeker progress for retained tracks
    const prog = list.map(e => { const i = C.multi.indexOf(e); return i >= 0 ? C.multiProg[i] : 0; });
    C.multi = list; C.multiProg = prog; C.multiState = prog.map(p => (p >= 1 ? 'LOCK' : p > 0 ? 'ACQ' : 'NONE'));
  }
  // Is our seeker locked on this bandit (single MSL lock or any 4AAM lock)?
  function lockedOn(e) {
    if (C.weapon === 'AAM4') { const i = C.multi.indexOf(e); return i >= 0 && C.multiState[i] === 'LOCK'; }
    return C.designated === e && C.lockState === 'LOCK';
  }
  function disarmSeeker(msg) {
    if (!C.seekerArmed) return;
    C.seekerArmed = false; seekerT = 0; seekerHadLock = false;
    C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null;
    C.multiProg = C.multiProg.map(() => 0); C.multiState = C.multiState.map(() => 'NONE');
    if (msg) { say(msg, 1.4, '#ffbf3f'); if (env.onSfx) env.onSfx('lockdrop', null, 1); }
  }
  // Passive radar track(s): keep the current track unless it left the cone or a
  // bandit is clearly better placed (15 % score hysteresis).
  function autoDesignate() {
    const cands = radarCandidates(C.weapon === 'QAAM' ? QAAM_HALF : RADAR_HALF, C.weapon === 'QAAM' ? QAAM_RANGE : RADAR_RANGE);
    if (C.weapon === 'AAM4') {
      const keep = C.multi.filter(e => cands.some(c => c.e === e));
      for (const c of cands) { if (keep.length >= 4) break; if (!keep.includes(c.e)) keep.push(c.e); }
      keep.sort((a, b) => cands.findIndex(c => c.e === a) - cands.findIndex(c => c.e === b));
      setMulti(keep);
      designate(keep[0] || null);
      return;
    }
    if (C.multi.length) setMulti([]);
    const cur = cands.find(c => c.e === C.designated), best = cands[0];
    if (!best) designate(null);
    else if (!cur || best.score < cur.score * 0.85) designate(best.e);
  }

  // C: stage 2. Arms the seeker on the auto-designated target(s); when already
  // locked, cycles to the next nearest forward bandit and re-arms on it.
  function designateInSight() {
    C.designateT = performance.now();
    if (C.weapon === 'BOMB') { const t = cycleGroundTarget(); C.designateOk = !!t; if (env.onSfx) env.onSfx('designate', null, t ? 1 : 0); return t; }
    const ammoOk = C.weapon === 'AAM4' ? C.aam4 > 0 && C.aam4Reload <= 0
      : C.weapon === 'QAAM' ? C.qaam > 0 && C.qaamReload <= 0 : C.missiles > 0 && C.missileReload <= 0;
    if (!C.seekerArmed) {
      if (!C.designated) autoDesignate();
      const n = C.weapon === 'AAM4' ? C.multi.length : C.designated ? 1 : 0;
      C.designateOk = n > 0;
      if (n) {
        C.seekerArmed = true; seekerT = 0; seekerHadLock = false;
        say(C.weapon === 'AAM4' ? `4AAM SEEKERS ARMED — ${n} TGT` : 'SEEKER ARMED — ' + (C.designated.type ? C.designated.type + ' ' : '') + C.designated.label, 1.1);
        if (!ammoOk) say('SEEKER ARMED — RELOADING', 1.1, '#ffbf3f');
      } else say('NO TARGET IN RADAR CONE', 1.0, '#ffbf3f');
      if (env.onSfx) env.onSfx('designate', null, n ? 1 : 0);
      return C.designated;
    }
    const anyLock = C.weapon === 'AAM4' ? C.multiState.includes('LOCK') : C.lockState === 'LOCK';
    if (!anyLock) {                                          // still acquiring: keep the seeker on it
      say('SEEKER ACQUIRING — ' + (C.designated ? C.designated.label : '-'), 0.9, '#ffbf3f');
      if (env.onSfx) env.onSfx('designate', null, 1);
      return C.designated;
    }
    const cands = radarCandidates(C.weapon === 'QAAM' ? QAAM_HALF : RADAR_HALF, C.weapon === 'QAAM' ? QAAM_RANGE : RADAR_RANGE);
    C.designateOk = true;
    if (C.weapon === 'AAM4') {
      // Re-scan from the bandit after the current primary: a fresh set of up to 4.
      const order = cands.map(c => c.e);
      const k = order.indexOf(C.multi[0]);
      const rot = k >= 0 ? order.slice(k + 1).concat(order.slice(0, k + 1)) : order;
      setMulti(rot.slice(0, 4));
      C.multiProg = C.multiProg.map(() => 0); C.multiState = C.multiState.map(() => 'NONE');
      designate(C.multi[0] || null);
      say(`4AAM RE-TARGET — ${C.multi.length} TGT`, 1.0);
    } else {
      const next = cands.filter(c => c.e !== C.designated).sort((a, b) => a.d - b.d)[0];
      if (next) { designate(next.e); say('TARGET — ' + (next.e.type ? next.e.type + ' ' : '') + next.e.label, 1.0); }
      else say('NO OTHER TARGET — HOLDING LOCK', 1.0, '#ffbf3f');
    }
    seekerT = 0; seekerHadLock = false;
    if (env.onSfx) env.onSfx('designate', null, 1);
    return C.designated;
  }

  function updateLock(dt) {
    if (C.weaponsLock.msl) { C.lockState = 'NONE'; C.lockProgress = 0; disarmSeeker(null); return; }
    if (C.designated && !C.designated.alive) designate(null);
    if (C.weapon === 'AAM4') { updateMultiLock(dt); return; }
    if (!C.seekerArmed) autoDesignate();
    else if (!C.designated) disarmSeeker('TARGET LOST — RADAR AUTO-TRACK');
    // NEXT cue: the bandit C would cycle to once locked.
    const nx = C.seekerArmed ? radarCandidates().filter(c => c.e !== C.designated).sort((a, b) => a.d - b.d)[0] : null;
    C.nextTarget = nx ? nx.e : null;
    const t = C.designated;
    if (!t) { C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null; C.seekerOff = 0; C.targetRange = 0; C.targetObscured = false; return; }
    const to = t.pos.clone().sub(S.position), d = to.length();
    const off = Math.acos(clamp(to.divideScalar(d).dot(fwdOf()), -1, 1));
    const obscured = (t.cloud || 0) > CLOUD_T;
    const wasObscured = C.targetObscured;
    C.targetObscured = obscured; C.seekerOff = off; C.targetRange = d;
    if (!C.seekerArmed) { C.lockProgress = 0; C.lockState = 'NONE'; C.lockTarget = null; return; }
    // Progressive IR seeker: build while inside the 14 deg circle and 3.5 NM, decay when it leaves.
    const qaam = C.weapon === 'QAAM';
    const inSeeker = C.jamming <= 0.5 && d < (qaam ? QAAM_RANGE : LOCK_RANGE) && off < (qaam ? QAAM_HALF : DIFF.seekerHalf) &&
      (qaam ? C.qaam > 0 && C.qaamReload <= 0 : C.missiles > 0 && C.missileReload <= 0);
    const lockT = (qaam ? QAAM_LOCK : DIFF.lockTime) * (t.kind === 'DRONE' ? 0.6 : 1);
    C.lockProgress = clamp(C.lockProgress + (obscured ? -1.0 * dt : inSeeker ? dt / lockT : -LOCK_DECAY * dt), 0, 1);
    const prev = C.lockState;
    if (obscured && !wasObscured) {
      say('CLOUD OBSCURED — ' + t.label, 1.4, '#ffbf3f');
      if (prev === 'LOCK' && env.onSfx) env.onSfx('lockdrop', null, 1);
    }
    C.lockState = C.lockProgress >= 1 ? 'LOCK' : C.lockProgress > 0 ? 'ACQ' : 'NONE';
    if (C.lockState === 'LOCK' && prev !== 'LOCK') say('LOCK — ' + t.label + ' — SHOOT', 1.2);
    C.lockTarget = C.lockState === 'LOCK' ? t : null;
    if (C.lockProgress > 0.05) seekerHadLock = true;
    seekerT += dt;
    if ((seekerHadLock && C.lockProgress <= 0) || (!seekerHadLock && seekerT > SEEKER_GIVEUP))
      disarmSeeker(obscured ? 'CLOUD COVER — SEEKER LOST' : 'SEEKER LOST — RADAR AUTO-TRACK');
  }

  // 4AAM track-while-scan: up to four tracks, seekers lock all of them together.
  function updateMultiLock(dt) {
    if (!C.seekerArmed) autoDesignate();
    else {
      const alive = C.multi.filter(e => e.alive);
      if (alive.length !== C.multi.length) setMulti(alive);
      if (!C.multi.length) disarmSeeker('TARGETS LOST — RADAR AUTO-TRACK');
    }
    C.nextTarget = null;
    const fwd = fwdOf();
    let maxP = 0, locked = 0, acq = 0;
    C.multi.forEach((e, i) => {
      const to = e.pos.clone().sub(S.position), d = to.length();
      const off = Math.acos(clamp(to.divideScalar(d).dot(fwd), -1, 1));
      const obsc = (e.cloud || 0) > CLOUD_T;
      const inCone = d < AAM4_RANGE && off < DIFF.aam4Half && C.aam4 > 0 && C.aam4Reload <= 0;
      const prev = C.multiState[i];
      const lockT = DIFF.aam4Lock * (e.kind === 'DRONE' ? 0.6 : 1);
      let p = C.seekerArmed ? clamp(C.multiProg[i] + (obsc ? -1.0 * dt : inCone ? dt / lockT : -LOCK_DECAY * dt), 0, 1) : 0;
      C.multiProg[i] = p;
      const st = p >= 1 ? 'LOCK' : p > 0 ? 'ACQ' : 'NONE';
      C.multiState[i] = st;
      if (st === 'LOCK' && prev !== 'LOCK') say(`LOCK ${i + 1} — ${e.label}`, 0.9);
      if (st === 'LOCK') locked++; else if (st === 'ACQ') acq++;
      maxP = Math.max(maxP, p);
      if (i === 0) { C.seekerOff = off; C.targetRange = d; C.targetObscured = obsc; }
    });
    C.multiLocked = locked;
    designate(C.multi[0] || null);
    C.lockProgress = maxP;
    C.lockState = locked ? 'LOCK' : acq ? 'ACQ' : 'NONE';
    C.lockTarget = locked ? C.multi.find((e, i) => C.multiState[i] === 'LOCK') : null;
    if (!C.seekerArmed) return;
    if (maxP > 0.05) seekerHadLock = true;
    seekerT += dt;
    if ((seekerHadLock && maxP <= 0) || (!seekerHadLock && seekerT > SEEKER_GIVEUP)) disarmSeeker('SEEKERS LOST — RADAR AUTO-TRACK');
  }

  // >4AAM ripple: one missile per locked track, 0.09 s apart; each hides the next
  // pylon round for a 3.5 s re-rack and guides independently to its own target.
  const ripple = [];
  let aamRack = 0;
  function fireAAM4() {
    if (gunsOnly() || C.weaponsLock.spw) return false;
    if (!env.isReady() || C.dead || C.aam4 <= 0 || C.aam4Reload > 0 || mslCooldown > 0 || ripple.length) return false;
    const locked = C.multi.filter((e, i) => C.multiState[i] === 'LOCK' && e.alive);
    const targets = locked.length ? locked : [null];
    const n = Math.min(targets.length, C.aam4);
    for (let i = 0; i < n; i++) ripple.push({ t: i * AAM4_STAGGER, target: targets[i] });
    if (locked.some(e => e.kind === 'DRONE')) { droneSalvoT = performance.now(); droneSalvoKills = 0; droneSalvoPaid = false; }
    mslCooldown = MSL_INTERVAL;
    C.lastLaunch = locked.length ? 'LOCK' : 'NONE';
    say(locked.length ? `FOX THREE ×${n} — RIPPLE` : 'FOX THREE — NO LOCK, DUMB FIRE', 1.4, locked.length ? '#4dff91' : '#ffbf3f');
    return true;
  }
  function launchAAM(target) {
    if (C.aam4 <= 0) return;
    const store = stores.msl.find(st => !st.mslSpent && !st.aamHidden);
    let pos;
    if (store) { jet.updateMatrixWorld(true); store.node.visible = true; pos = store.node.getWorldPosition(new THREE.Vector3()); }
    else { const rail = RAILS[railNext]; railNext = 1 - railNext; pos = rail.clone().applyQuaternion(S.quaternion).add(S.position); }
    const m = launch(pos, S.quaternion, S.velocity, target, false, MSL_FULL, store);
    if (!m) return;
    m.aam = true;
    if (store) { store.aamHidden = true; store.node.visible = false; aamRack = AAM4_RACK; }
    C.aam4--; C.aamFired = (C.aamFired || 0) + 1;
    if (C.aam4 <= 0) C.aam4Reload = AAM4_RELOAD;
  }
  function fireQAAM() {
    if (gunsOnly() || C.weaponsLock.spw) return false;
    if (!env.isReady() || C.dead || C.qaam <= 0 || C.qaamReload > 0 || mslCooldown > 0) return false;
    const tgt = C.lockState === 'LOCK' ? C.designated : null;
    const rail = RAILS[railNext]; railNext = 1 - railNext;
    const pos = rail.clone().applyQuaternion(S.quaternion).add(S.position);
    const m = launch(pos, S.quaternion, S.velocity, tgt, false, MSL_QAAM, null, 'IR');
    if (!m) return false;
    C.qaam--; mslCooldown = QAAM_INTERVAL; C.lastLaunch = C.lockState;
    if (C.qaam <= 0) C.qaamReload = QAAM_RELOAD;
    say(tgt ? 'FOX TWO — QAAM' : 'QAAM — NO LOCK, DUMB FIRE', 1.2, tgt ? '#4dff91' : '#ffbf3f');
    return true;
  }
  function updateRipple(dt) {
    if (C.weaponsLock.msl) {                                 // guns only: no reloads, empty pylons
      C.qaamReload = 0; C.aam4Reload = 0; ripple.length = 0;
      for (const st of stores.msl) st.node.visible = false;
      return;
    }
    if (C.qaamReload > 0) { C.qaamReload -= dt; if (C.qaamReload <= 0) { C.qaam = QAAM_MAX; say('QAAM RELOADED', 1.0); } }
    for (let i = ripple.length - 1; i >= 0; i--) {
      const r = ripple[i]; r.t -= dt;
      if (r.t <= 0) { ripple.splice(i, 1); launchAAM(r.target && r.target.alive ? r.target : null); }
    }
    if (aamRack > 0) { aamRack -= dt; if (aamRack <= 0) for (const st of stores.msl) st.aamHidden = false; }
    if (C.aam4Reload > 0) { C.aam4Reload -= dt; if (C.aam4Reload <= 0) { C.aam4 = AAM4_MAX; say('4AAM RELOADED', 1.0); } }
    for (const st of stores.msl) st.node.visible = !st.mslSpent && !st.aamHidden;
  }

  /* ================================================ RWR (ALR-56C) + ECM */
  // RWR picture: every hostile emitter at its clock bearing relative to our nose.
  // paint = engaging fighter's radar on us, acq = its seeker building, lock =
  // full lock, msl = missile actively tracking us.
  const ECM_ON = 6, ECM_RECHARGE = 14, ECM_SLOW = 2.5, ECM_BREAK = 0.35;
  Object.assign(C, { rwr: [], rwrLevel: 0, ecmState: 'READY', ecmT: 0, ecmBreaks: 0, jamming: 0, sectorLow: false });
  const jamBearings = []; let jamGhostT = 0, sectorLowPrev = false, sectorLowT = -1e9;
  function relBearing(p) {
    const a = Math.atan2(p.x - S.position.x, -(p.z - S.position.z)) - S.heading * D2R;
    return Math.atan2(Math.sin(a), Math.cos(a));
  }
  // --- staged missions (NAVAL_BATTLE / CANYON_RUN / ACE_DUEL) ---
  const stagedShips = [];                                  // reusable surface actors, created once
  function stagedShip(kind, idx) {
    while (stagedShips.length <= idx) {
      const t = destroyerShip();
      Object.assign(t, { staged: true, fleet: true, alive: false, stagePos: new THREE.Vector3(),
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1),
        quat: t.g.quaternion, ciwsT: 0, ciwsAcc: 0, flakCD: 0, samCD: 0, secondaries: null, secT: 0,
        sub: { on: false, hp: SUB_HP, off: new THREE.Vector3(), lastGunT: 0 }, aaOff: false,
        salvo: { st: 'IDLE', t: FLAG_SALVO_MIN + rand() * (FLAG_SALVO_MAX - FLAG_SALVO_MIN), fire: 0, fireT: 0 } });
      t.wake = makeWake(t); t.g.add(t.wake); t.g.visible = false;
      scene.add(t.g); surface.push(t); taskForce.push(t); stagedShips.push(t);
      if (SUB_TGT[stagedShips.length - 1]) SUB_TGT[stagedShips.length - 1].ship = t;
    }
    const t = stagedShips[idx];
    t.kind = kind; t.label = kind + ' ' + (idx + 1); t.id = 'S' + idx;
    t.hpMax = t.hp = SHIP_HP[kind] || 3;
    t.g.scale.setScalar(SHIP_SCALE[kind] || 1);
    t.samMount = kind === 'CG' || kind === 'CV_FLAG';
    const o = SUB_OFF[kind];
    t.sub.on = !!o; t.sub.hp = SUB_HP; t.aaOff = false;
    if (o) t.sub.off.set(o[0], o[1], o[2]);
    t.salvo.st = 'IDLE'; t.salvo.t = FLAG_SALVO_MIN + rand() * (FLAG_SALVO_MAX - FLAG_SALVO_MIN);
    t.salvo.fire = 0; t.salvo.fireT = 0;
    return t;
  }
  const stagedMission = () => !!(C.mcfg && C.mcfg.stages && C.mcfg.stages.length && C.mode !== 'FURBALL');
  const gunsOnly = () => !!(C.mcfg && C.mcfg.gunsOnly);
  function clearStagedShips() {
    for (const t of stagedShips) { t.alive = false; t.g.visible = false; }
  }
  function spawnStage(i) {
    const st = C.mcfg.stages && C.mcfg.stages[i];
    if (!st) return;
    clearStagedShips();
    let shipN = 0, banditN = 0;
    if (st.ships) {
      st.ships.forEach((sp, k) => {
        if (sp.chance !== undefined && rand() > sp.chance) return;
        const t = stagedShip(sp.kind, k);
        if (surface.indexOf(t) < 0) surface.push(t);
        if (taskForce.indexOf(t) < 0) taskForce.push(t);
        if (!t.g.parent) scene.add(t.g);
        t.alive = true; t.g.visible = true;
        t.stagePos.set(sp.pos[0], 0, sp.pos[2]);
        t.hpMax = t.hp = sp.hp || SHIP_HP[sp.kind] || 3;
        t.samCD = 4 + k; t.flakCD = 1; t.ciwsT = 0;
        shipN++;
      });
    }
    // Pooled bandits: revive dead slots as a CAP flight for this stage.
    const banditWant = Array.isArray(st.bandits)
      ? st.bandits[0] + Math.floor(rand() * (st.bandits[1] - st.bandits[0] + 1)) : (st.bandits || 0);
    if (banditWant > 0) {
      for (const e of enemies) if (!e.ace && !e.bomber) { e.alive = false; e.wreck = null; }
      let n = 0;
      for (const e of enemies) {
        if (n >= banditWant) break;
        if (e.alive || e.ace || e.bomber) continue;
        resetAI(e);
        const ang = (n / Math.max(1, banditWant)) * Math.PI * 2;
        e.pos.set(S.position.x + Math.sin(ang) * 5200, Math.max(900, S.position.y + 250), S.position.z + Math.cos(ang) * 5200);
        e.fwd.copy(S.position).sub(e.pos).normalize(); e.vel.copy(e.fwd).multiplyScalar(e.speed);
        e.alive = true; e.wreck = null; e.tac = e.mode = 'ENGAGE'; e.mslCD = 5 + n; e.bLock = 0;
        clearAce(e); e.hp = 100; n++; banditN++;
      }
    }
    if (st.ace && st.ace.length) { spawnAceFlight(st.ace); banditN = st.ace.length; }
    // Staged missions use strike slot 0 only (CANYON_RUN fortress); the legacy
    // jammers revived by resetPlayer() must not gate the stage or draw on the map.
    for (let k = 0; k < strikeTargets.length; k++) {
      const t = strikeTargets[k];
      if (t && (k > 0 || st.clear !== 'TARGETS')) { t.alive = false; t.g.visible = false; }
    }
    if (st.clear === 'TARGETS' && st.targets && st.targets.length) {
      const def = st.targets[0], t = strikeTargets[0];
      if (t) {
        const y = Math.max(0, terrainHeight(def.pos[0], def.pos[2]));
        t.g.position.set(def.pos[0], y, def.pos[2]);
        t.pos.set(def.pos[0], y + 2, def.pos[2]);
        t.alive = true; t.g.visible = true; t.kind = def.kind; t.label = def.kind;
        t.hpMax = t.hp = def.hp || 4;
      }
    }
    // NAVAL stage 2 (index 1) anchors half the swarm on the carrier; stage 3 on the player.
    if (C.missionId === 'NAVAL_BATTLE' && i >= 1 && !C.swarm.on) {
      spawnSwarm(SWARM_MIN + (rand() < 0.5 ? 0 : 2), i === 1 ? 'CARRIER' : 'PLAYER');
    }
    writeFleet();
    const wingAlive = env.getWingmen ? env.getWingmen().filter(w => w && w.alive).length : 0;
    if (env.debug) console.log('[ANGELS_ZERO] stage', i, st.label, 'ships=' + shipN, 'bandits=' + banditN, 'wing=' + wingAlive);
  }
  // Wave-off ambush: revive pooled bandits ahead of the carrier bow. Indices are
  // written into a caller-owned Int16Array so the mission can watch for a clear.
  function spawnAmbush(n, anchorPos, bowDir, ids) {
    const want = clamp(n | 0, 1, AMB_MAX);
    let placed = 0;
    let free = 0;
    for (const e of enemies) if (!e.alive && !e.aceFlight && !e.bomber) free++;
    if (free < want) {
      for (const e of enemies) {
        if (free >= want) break;
        if (!e.alive || e.aceFlight || e.bomber || e.ace) continue;
        e.alive = false; e.wreck = null; free++;      // retire a stage bandit to free a slot
      }
    }
    _afTo.set(0, 0, -1).applyQuaternion(S.quaternion);
    _afR.set(1, 0, 0).applyQuaternion(S.quaternion);
    for (const e of enemies) {
      if (placed >= want) break;
      if (e.alive || e.aceFlight || e.bomber || e.ace) continue;
      resetAI(e); clearAce(e);
      e.pos.copy(anchorPos).addScaledVector(bowDir, AMB_SPAWN_D);
      e.pos.y = AMB_SPAWN_ALT + placed * 220;
      e.fwd.copy(anchorPos).sub(e.pos).normalize();
      e.speed = e.cruise; e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      e.hp = e.hpMax = 100; e.alive = true; e.wreck = null;
      e.tac = e.mode = 'ENGAGE'; e.mslCD = 6 + placed; e.bLock = 0;
      e.ambush = true; e.ambushT = 6; e.buzzCD = 0;
      orient(e);
      if (ids) ids[placed] = e.id;
      placed++;
    }
    if (placed) writeFleet();
    if (env.debug) console.log('[ANGELS_ZERO] ambush spawn n=' + placed);
    return placed;
  }
  function stageClear(i) {
    const st = C.mcfg.stages && C.mcfg.stages[i];
    if (!st) return false;
    if (st.clear === 'SHIPS') {
      for (const t of stagedShips) if (t.alive) return false;
      return true;
    }
    if (st.clear === 'TARGETS') return !strikeAlive() && !C.climb.on;
    if (st.clear === 'ACE') {
      if (!aceFlightDone) return false;
      for (const e of enemies) if (e.alive && e.aceFlight) return false;
      return true;
    }
    return false;
  }
  // --- CANYON_RUN: radar ceiling, sequential gates, fortified target, climb-out ---
  // Pre-allocated SAM battery pool: 2 rims per gate + a crater ring. Positions are
  // shared between the Float32Array (debug / instancing) and the Vector3s (fire logic).
  const SAM_SITE_N = CANYON_GATE_N * SAM_SITE_PER_GATE + CRATER_SITE_N;
  const SITE_POS = new Float32Array(SAM_SITE_N * 3), SITE_ON = new Int8Array(SAM_SITE_N);
  const RIM_SITES = Array.from({ length: SAM_SITE_N }, () => new THREE.Vector3());
  const _rimSrc = new THREE.Vector3(), _siteIdx = new Int16Array(3);
  function buildSamSites() {
    let k = 0;
    for (let i = 0; i < CANYON_GATE_N; i++) {
      const z = GORGE_GATE_Z[i], s = gorgeSlope(z), n = Math.sqrt(1 + s * s), cx = gorgeCentreX(z);
      for (let sideI = 0; sideI < SAM_SITE_PER_GATE; sideI++) {
        const side = sideI ? 1 : -1;
        const x = cx + side * 300 / n, zz = z - side * 300 * s / n, y = Math.max(terrainHeight(x, zz), GORGE_RIM_Y - 20);
        // The shortcut ravine has no rim to mount a battery on.
        if (Math.abs(x - GORGE_SC_X) < 150 && zz < GORGE_SC_ZA + 150 && zz > GORGE_SC_ZB - 150) {
          if (env.debug) console.log('[ANGELS_ZERO] site skip sc', i, sideI);
          continue;
        }
        SITE_POS[k * 3] = x; SITE_POS[k * 3 + 1] = y; SITE_POS[k * 3 + 2] = zz; SITE_ON[k] = 1;
        RIM_SITES[k].set(x, y, zz); k++;
      }
    }
    for (let i = 0; i < CRATER_SITE_N; i++) {
      const a = i / CRATER_SITE_N * Math.PI * 2;
      const x = GORGE_FORT[0] + Math.cos(a) * GORGE_CRATER_R * 0.95;
      const z = GORGE_FORT[2] + Math.sin(a) * GORGE_CRATER_R * 0.95;
      SITE_POS[k * 3] = x; SITE_POS[k * 3 + 1] = GORGE_CRATER_WALL_Y; SITE_POS[k * 3 + 2] = z; SITE_ON[k] = 1;
      RIM_SITES[k].set(x, GORGE_CRATER_WALL_Y, z); k++;
    }
  }
  buildSamSites();
  // Linked weak points: pooled virtual targets, scratch vectors, sector map.
  const _subW = new THREE.Vector3(), _lane = new THREE.Vector3(), _bq = new THREE.Vector3();
  const _aaPos = new Float32Array(32), _weakOut = [];
  let AA_SHIPS_N = 0;
  const AA_SHIPS_OBJ = { get n() { return AA_SHIPS_N; }, positions: _aaPos };
  const SITE_HPV = new Int8Array(SAM_SITE_N).fill(SITE_HP), SITE_SECTOR = new Float32Array(SAM_SITE_N);
  const SECTOR_N = Math.max(1, Math.ceil(GORGE_ARC_M / (2 * SITE_SECTOR_M)));
  const sectorDead = new Uint8Array(SECTOR_N);
  function siteArc(z) {
    let a = 0;
    for (let zz = GORGE_SPAWN_Z; zz > z; zz -= 20) a += 20 * Math.sqrt(1 + gorgeSlope(zz) ** 2);
    return a;
  }
  for (let i = 0; i < SAM_SITE_N; i++) SITE_SECTOR[i] = siteArc(SITE_POS[i * 3 + 2]);
  function siteSector(i) {
    if (i >= SAM_SITE_N - CRATER_SITE_N) return -1;
    return Math.min(SECTOR_N - 1, Math.floor(SITE_SECTOR[i] / (2 * SITE_SECTOR_M)));
  }
  function siteSectorOfPlayer() {
    const arc = siteArc(S.position.z), sec = Math.floor(arc / (2 * SITE_SECTOR_M));
    return sec < 0 || sec >= SECTOR_N ? -1 : sec;
  }
  function refreshSectors() {
    sectorDead.fill(0);
    for (let sec = 0; sec < SECTOR_N; sec++) {
      let live = 0;
      for (let i = 0; i < SAM_SITE_N - CRATER_SITE_N; i++) if (SITE_ON[i] && siteSector(i) === sec) live++;
      if (!live) sectorDead[sec] = 1;
    }
  }
  const SUB_TGT = Array.from({ length: 16 }, () => ({ kind: 'SUB', label: 'RADAR / AA', r: SUB_HIT_R, hp: SUB_HP, hpMax: SUB_HP,
    pos: new THREE.Vector3(), alive: false, ship: null, isSub: true }));
  const SITE_TGT = Array.from({ length: SAM_SITE_N }, (_, i) => ({ kind: 'SITE', label: 'SAM SITE ' + (i + 1), r: SITE_HIT_R,
    pos: RIM_SITES[i], vel: new THREE.Vector3(), alive: false, idx: i, isSite: true }));
  function subWorld(s, out) { return out.copy(s.sub.off).applyQuaternion(s.g.quaternion).add(s.g.position); }
  function hitSub(s, dmg) {
    if (!s || !s.sub || !s.sub.on) return false;
    s.sub.hp -= dmg;
    if (env.debug) console.log('[ANGELS_ZERO] sub hit ship=' + s.label + ' hp=' + s.sub.hp);
    if (s.sub.hp > 0) return false;
    s.sub.on = false; s.aaOff = true; s.samMount = false;
    subWorld(s, _subW);
    if (env.onSfx) env.onSfx('explosion', _subW, 0.8);
    explosion(_subW, 0.6, { delay: 0.35 });
    if (env.onSmoke) env.onSmoke(_subW);
    if (s.spin) s.spin.visible = false;
    if (s.kind === 'CV_FLAG') cancelFlagSalvo(s, 'mast down');
    C.subKills++; C.score += SUB_PTS;
    pushEvent('SUBSYS', 'AA DISABLED', SUB_PTS, '#5fe8ff');
    say('AA DISABLED — HE\'S DEFENSELESS', 2.4, '#5fe8ff');
    if (env.debug) console.log('[ANGELS_ZERO] sub DOWN kind=' + s.kind + ' pts=' + SUB_PTS);
    return true;
  }
  function hitSite(i, dmg) {
    if (i < 0 || i >= SAM_SITE_N || !SITE_ON[i]) return false;
    SITE_HPV[i] -= dmg;
    if (SITE_HPV[i] > 0) return false;
    SITE_ON[i] = 0; C.siteKills++; C.score += SITE_PTS;
    const pos = RIM_SITES[i], sec = siteSector(i);
    if (env.onSfx) env.onSfx('explosion', pos, 0.6);
    if (env.samPuff) env.samPuff(_bq.copy(pos));
    if (env.onSmoke) env.onSmoke(pos);
    refreshSectors();
    pushEvent('SITE', 'SAM SITE DOWN', SITE_PTS, '#5fe8ff');
    if (env.debug) console.log('[ANGELS_ZERO] site DOWN i=' + i + ' sector=' + sec + ' dead=' + sectorDead[Math.max(0, sec)]);
    return true;
  }
  function cancelFlagSalvo(s, why) {
    const v = s.salvo;
    if (v.st === 'IDLE' || v.st === 'DEAD') return;
    v.st = 'DEAD'; v.fire = 0;
    if (env.flagBeam) env.flagBeam.hide();
    if (env.onSfx) env.onSfx('flagCharge', null, 0);
    say('FLAGSHIP VLS DOWN!', 2.4, '#5fe8ff');
    if (env.debug) console.log('[ANGELS_ZERO] flag cancelled ' + why);
  }
  function updateFlagSalvo(dt) {
    for (const s of stagedShips) {
      if (!s.alive || s.kind !== 'CV_FLAG' || !s.sub.on) continue;
      const v = s.salvo;
      if (v.st === 'DEAD') continue;
      if (v.st === 'IDLE') {
        v.t -= dt;
        if (v.t <= 0) {
          v.st = 'TELEGRAPH'; v.t = FLAG_TELE_S; C.flagBannerT = performance.now();
          if (env.debug) console.log('[ANGELS_ZERO] flag tele t=' + v.t.toFixed(2));
        }
        continue;
      }
      if (v.st === 'TELEGRAPH') {
        v.t -= dt;
        const charge = clamp(1 - v.t / FLAG_TELE_S, 0, 1);
        subWorld(s, _subW);
        _lane.copy(S.position).addScaledVector(S.velocity, FLAG_TELE_S + 2.5);
        _bq.lerpVectors(_subW, _lane, charge < 0.67 ? charge / 0.67 : 1);
        if (env.flagBeam) env.flagBeam.set(_subW, _bq, charge);
        if (env.onSfx) env.onSfx('flagCharge', null, charge);
        C.flagSalvoT = v.t; C.flagSalvoActive = 1;
        if (v.t <= 0) {
          v.st = 'FIRE'; v.fire = FLAG_SALVO_N; v.fireT = 0;
          C.flagSalvoActive = 0; C.flagBannerT = 0;
          if (env.debug) console.log('[ANGELS_ZERO] flag fire n=' + FLAG_SALVO_N);
        }
        continue;
      }
      if (v.st === 'FIRE') {
        v.fireT -= dt;
        if (v.fire > 0 && v.fireT <= 0) {
          subWorld(s, _subW);
          _lane.copy(S.position).addScaledVector(S.velocity, FLAG_TELE_S + 2.5);
          const ang = ((v.fire - 1) / Math.max(1, FLAG_SALVO_N - 1) - 0.5) * FLAG_SPREAD_DEG * D2R;
          _bq.copy(_lane).sub(_subW).applyAxisAngle(UP, ang).add(_subW);
          if (surfaceSAM(_subW, 'VLS', _bq, 1.2)) v.fire--;
          v.fireT = FLAG_VLS_STAGGER;
          if (v.fire <= 0) {
            v.st = 'IDLE'; v.t = FLAG_SALVO_MIN + rand() * (FLAG_SALVO_MAX - FLAG_SALVO_MIN);
            if (env.flagBeam) env.flagBeam.hide();
            if (env.onSfx) env.onSfx('flagCharge', null, 0);
          }
        }
      }
    }
  }
  // High-risk trench shortcut: swept z-plane crossings, no per-frame allocation.
  let _scLoggedSecond = -1;
  function updateCanyonShortcut(dt) {
    const sc = C.sc;
    if (!sc || C.mcfg.gatesPath !== 'CANYON' || C.rtb || C.climb.on) return;
    const pz = sc.pz, x = S.position.x, y = S.position.y, z = S.position.z;
    const xOff = Math.abs(x - GORGE_SC_X);
    if (sc.st === 'IDLE' && pz > GORGE_SC_ZA && z <= GORGE_SC_ZA && xOff < GORGE_SC_HALF_W + 15 && y < CEIL_M) {
      sc.st = 'IN';
      if (env.onWing) env.onWing('ARE YOU CRAZY, LEAD?!', 'WARDEN-2', 'warn');
      say('TRENCH SHORTCUT — KEEP IT CENTERED', 2.4, '#ffb838');
      if (env.debug) console.log('[ANGELS_ZERO] sc IN z=' + z.toFixed(0) + ' y=' + y.toFixed(0) + ' x-off=' + xOff.toFixed(0));
    } else if (sc.st === 'IN') {
      if (pz > GORGE_SC_ARCH_Z && z <= GORGE_SC_ARCH_Z) {
        sc.st = y < GORGE_SC_ARCH_Y0 ? 'ARCH_OK' : 'FAIL';
        if (env.debug) console.log('[ANGELS_ZERO] sc arch ' + sc.st + ' y=' + y.toFixed(0));
      } else if (xOff > GORGE_SC_HALF_W + 15) sc.st = 'FAIL';
    }
    if (sc.st === 'ARCH_OK' && xOff > GORGE_SC_HALF_W + 15) sc.st = 'FAIL';
    if (sc.st === 'ARCH_OK' && pz > GORGE_SC_ZB && z <= GORGE_SC_ZB) {
      sc.st = 'DONE'; sc.used = true; sc.bannerT = performance.now();
      C.gateIdx = Math.max(C.gateIdx, Math.max(GORGE_SC_SKIP[0], GORGE_SC_SKIP[1]) + 1);
      C.score += SHORTCUT_PTS;
      pushEvent('SHORTCUT', 'TRENCH SHORTCUT', SHORTCUT_PTS, '#ffd45a');
      say('TRENCH SHORTCUT +' + SHORTCUT_PTS, 2.6, '#ffd45a');
      if (env.onWing) env.onWing('…REMIND ME NEVER TO FOLLOW YOU AGAIN.', 'WARDEN-2', '#00ff66');
      if (env.debug) console.log('[ANGELS_ZERO] sc DONE skip=' + GORGE_SC_SKIP[0] + '..' + GORGE_SC_SKIP[1] +
        ' save=' + GORGE_SC_SAVE_M + ' pts=' + SHORTCUT_PTS);
    }
    if ((sc.st === 'FAIL') && pz > GORGE_SC_ZB && z <= GORGE_SC_ZB) sc.st = 'DONE';
    sc.px = x; sc.py = y; sc.pz = z;
    const sec = Math.floor(performance.now() / 1000);
    if (sec !== _scLoggedSecond && sc.st !== 'IDLE' && sc.st !== 'DONE') {
      _scLoggedSecond = sec;
      if (env.debug) console.log('[ANGELS_ZERO] sc st=' + sc.st + ' z=' + z.toFixed(0) + ' y=' + y.toFixed(0) + ' x-off=' + xOff.toFixed(0));
    }
  }

  // Gate frames face down the trench; matrices are static, so they are written once.
  const _cgM = new THREE.Matrix4(), _cgP = new THREE.Vector3(), _cgQ = new THREE.Quaternion(), _cgS = new THREE.Vector3(55 / 30, 3, 55 / 30);
  let canyonGatesBuilt = false;
  function updateCanyonGates(dt, now) {
    const active = !!(C.mcfg.gatesPath === 'CANYON' && C.mcfg.ceiling);
    canyonGates.visible = active;
    if (!active) return;
    if (!canyonGatesBuilt) {
      for (let i = 0; i < CANYON_GATE_N; i++) {
        const z = GORGE_GATE_Z[i];
        _cgP.set(gorgeCentreX(z), GORGE_FLOOR_Y + 90, z);
        _cgQ.setFromAxisAngle(UP, gorgeHeading(z)); _cgM.compose(_cgP, _cgQ, _cgS);
        canyonGates.setMatrixAt(i, _cgM);
      }
      canyonGates.instanceMatrix.needsUpdate = true;
      canyonGatesBuilt = true;
    }
    // Passing the current gate (guidance only; missing one does not fail). The trench
    // is monotonic in z, so crossing the gate's z line inside the walls counts.
    const gz = C.gateIdx < CANYON_GATE_N ? GORGE_GATE_Z[C.gateIdx] : -1e9;
    if (C.gateIdx < CANYON_GATE_N && S.position.z < gz && gorgeDist(S.position.x, gz) < 160) {
      C.gateIdx++;
      C.gateBanner = performance.now();
      if (env.debug) console.log('[ANGELS_ZERO] canyon gate', C.gateIdx, '/', CANYON_GATE_N);
      if (env.onRadio && C.gateIdx % 3 === 0) env.onRadio('GATE', { n: C.gateIdx });
    }
  }
  const _siteDist = new Float32Array(SAM_SITE_N), SALVO_Q = new Int16Array(CANYON_SAM_MAX);
  let ceilDiagT = 0;
  function ceilLog(from, to) {
    if (env.debug) console.log('[ANGELS_ZERO] ceil ' + from + '->' + to + ' y=' + S.position.y.toFixed(1) +
      ' t=' + (env.getMissionT ? env.getMissionT() : 0).toFixed(2));
  }
  // Fill the reused Int16Array with the nearest active (optionally unmasked) sites.
  function pickSamSites(out, want, checkMask) {
    let n = 0;
    for (let i = 0; i < SAM_SITE_N; i++) {
      if (!SITE_ON[i]) continue;
      _siteDist[i] = RIM_SITES[i].distanceTo(S.position);
      if (checkMask && occluded(RIM_SITES[i], S.position)) continue;
      let at = n;
      while (at > 0 && _siteDist[out[at - 1]] > _siteDist[i]) { out[at] = out[at - 1]; at--; }
      out[at] = i; if (n < want) n++;
    }
    return n;
  }
  function updateCeiling(dt, now) {
    const cfg = C.mcfg.ceiling;
    if (!cfg || !C.ceil.live || !C.samSitesOn || C.rtb || C.climb.on) return;
    const missionT = env.getMissionT ? env.getMissionT() : 0;
    const allowed = missionT >= CEIL_ARM_DELAY && !(env.inCutscene && env.inCutscene());
    ceilDiagT -= dt;
    if (!allowed) {
      C.ceil.armed = false;
      if (C.ceil.st !== 'CLEAR') { ceilLog(C.ceil.st, 'CLEAR'); C.ceil.st = C.ceil.phase = 'CLEAR'; C.ceil.warnT = 0; C.ceil.rail = 0; }
      return;
    }
    C.ceil.armed = true;
    const y = S.position.y;                                  // metres above sea level, one source
    const st = C.ceil.st;
    if (st === 'CLEAR' && y > cfg.m + CEIL_HYST_M) {
      C.ceil.st = C.ceil.phase = 'WARN'; C.ceil.t = CEIL_WARN_S; C.ceil.warnT = CEIL_WARN_S;
      C.ceil.belowT = 0;
      if (env.onSfx) env.onSfx('caution');
      if (env.onRadio) env.onRadio('SAM_LOCK');
      ceilLog('CLEAR', 'WARN');
    } else if ((st === 'WARN' || st === 'BARRAGE') && y < cfg.m - CEIL_HYST_M) {
      C.ceil.belowT += dt;
      if (C.ceil.belowT >= 1.0 || st === 'WARN') {
        C.ceil.st = C.ceil.phase = 'CLEAR'; C.ceil.warnT = 0; C.ceil.rail = 0;
        ceilLog(st, 'CLEAR');
      }
    } else C.ceil.belowT = 0;
    if (C.ceil.st === 'WARN') {
      C.ceil.t = Math.max(0, C.ceil.t - dt);
      C.ceil.warnT = C.ceil.t;
      if (C.ceil.t <= 0) {
        C.ceil.st = C.ceil.phase = 'BARRAGE'; C.ceil.salvoT = 0; C.ceil.rail = 0; C.ceil.fired = 0;
        ceilLog('WARN', 'BARRAGE');
      }
    }
    if (C.ceil.st === 'BARRAGE') {
      C.ceil.salvoT -= dt;
      if (C.ceil.rail > 0) {
        C.ceil.railT -= dt;
        if (C.ceil.railT <= 0 && C.ceil.fired < C.ceil.rail) {
          const idx = SALVO_Q[C.ceil.fired++];
          if (SITE_ON[idx] && surfaceSAM(RIM_SITES[idx], 'CEIL')) {
            if (env.debug) console.log('[ANGELS_ZERO] ceil barrage rail ' + idx + '/' + C.ceil.rail);
          }
          C.ceil.railT = CEIL_STAGGER;
        }
        if (C.ceil.fired >= C.ceil.rail) C.ceil.rail = 0;
      }
      if (C.ceil.salvoT <= 0 && C.samLive < CANYON_SAM_MAX) {
        let sites = pickSamSites(_siteIdx, 6, true);
        const pse = siteSectorOfPlayer();
        const suppressed = pse >= 0 && sectorDead[pse] === 1;
        if (suppressed) {
          let k = 0;
          for (let j = 0; j < sites; j++) {
            const sec = siteSector(_siteIdx[j]);
            if (sec >= 0 && sectorDead[sec]) continue;
            _siteIdx[k++] = _siteIdx[j];
          }
          sites = k;
        }
        if (sites > 0) {
          let n = Math.min(CANYON_SAM_MAX - C.samLive, CEIL_SALVO_MIN + (rand() * (CEIL_SALVO_MAX - CEIL_SALVO_MIN + 1) | 0));
          if (suppressed) n = Math.max(1, n >> 1);
          for (let i = 0; i < n; i++) SALVO_Q[i] = _siteIdx[i % sites];
          C.ceil.rail = n; C.ceil.fired = 0; C.ceil.railT = 0; C.ceil.salvoT = CEIL_SALVO_CD;
          C.ceilLaunchBanner = performance.now();
          if (env.debug) console.log('[ANGELS_ZERO] ceil barrage salvo n=' + n + ' sites=' + sites);
          if (env.onSfx) env.onSfx('sam', null, C.samLive);
        } else C.ceil.salvoT = 0.4;
      }
    }
    if (env.debug && ceilDiagT <= 0) {
      ceilDiagT = 1;
      const near = pickSamSites(_siteIdx, 1, false) ? +_siteDist[_siteIdx[0]].toFixed(0) : -1;
      let masked = 0;
      for (let i = 0; i < SAM_SITE_N; i++) if (SITE_ON[i] && occluded(RIM_SITES[i], S.position)) masked++;
      console.log('[ANGELS_ZERO] ceil st=' + C.ceil.st + ' alt=' + y.toFixed(1) + ' sites=' +
        SITE_ON.reduce((a, b) => a + b, 0) + ' nearest=' + near + ' masked=' + masked +
        ' launched=' + C.samLaunched + ' blocked=' + (C.samLive >= CANYON_SAM_MAX ? 1 : 0));
    }
  }
  function updateClimb(dt, now) {
    if (!C.climb.on) return;
    C.climb.t -= dt;
    C.climb.salvoT -= dt;
    if (C.climb.rail > 0) {
      C.climb.railT -= dt;
      if (C.climb.railT <= 0 && C.climb.fired < C.climb.rail) {
        const idx = SALVO_Q[C.climb.fired++];
        if (SITE_ON[idx] && surfaceSAM(RIM_SITES[idx], 'CLIMB')) {
          if (env.debug) console.log('[ANGELS_ZERO] climb wall rail ' + idx + '/' + C.climb.rail);
        }
        C.climb.railT = 0.15;
      }
      if (C.climb.fired >= C.climb.rail) C.climb.rail = 0;
    }
    if (C.climb.salvoT <= 0 && C.samLive < CANYON_SAM_MAX) {
      // 8 crater batteries + the last 4 rim batteries.
      let avail = 0;
      for (let i = SAM_SITE_N - CRATER_SITE_N; i < SAM_SITE_N; i++) if (SITE_ON[i]) SALVO_Q[avail++] = i;
      const rimEnd = SAM_SITE_N - CRATER_SITE_N;
      for (let i = Math.max(0, rimEnd - 4); i < rimEnd && avail < CANYON_SAM_MAX; i++) if (SITE_ON[i]) SALVO_Q[avail++] = i;
      if (avail) {
        const n = Math.min(avail, CANYON_SAM_MAX - C.samLive, CLIMB_SALVO_MIN + (rand() * (CLIMB_SALVO_MAX - CLIMB_SALVO_MIN + 1) | 0));
        C.climb.rail = n; C.climb.fired = 0; C.climb.railT = 0; C.climb.salvoT = CLIMB_SALVO_CD;
        if (env.debug) console.log('[ANGELS_ZERO] climb wall salvo n=' + n + ' t=' + C.climb.t.toFixed(1) + ' live=' + C.samLive);
      }
    }
    if (env.debug && ceilDiagT <= 0) console.log('[ANGELS_ZERO] climb wall t=' + C.climb.t.toFixed(1) + ' live=' + C.samLive);
    const d = Math.hypot(S.position.x - GORGE_FORT[0], S.position.z - GORGE_FORT[2]);
    if (C.climb.t <= 0 || (d > 4000 && S.position.y > CEIL_M + 600)) {
      C.climb.on = false;
      C.rtb = { on: true, type: C.rtbType || 'BASE', t0: performance.now() };
      C.missionPhase = 4;
      if (env.debug) console.log('[ANGELS_ZERO] rtb on (climb wall)');
      if (env.onRadio) env.onRadio('RTB');
    }
  }
  // MISSION objective flow (FURBALL keeps its endless wave loop untouched).
  function primaryTargets() {
    let n = 0;
    if (C.mcfg && C.mcfg.stages && C.mode !== 'FURBALL') {
      const st = C.mcfg.stages[C.stage];
      if (st) {
        if (st.clear === 'SHIPS') {
          for (const t of stagedShips) if (n < 8 && t.alive) _primary[n++] = t;
        } else if (st.clear === 'TARGETS') {
          for (const t of strikeTargets) if (n < 8 && t.alive) _primary[n++] = t;
        } else if (st.clear === 'ACE') {
          for (const e of enemies) if (n < 8 && e.alive && e.aceFlight) _primary[n++] = e;
        }
      }
    } else if (C.mode !== 'FURBALL') {
      const p = C.missionPhase;
      if (p === 1) {
        for (const e of enemies) if (n < 8 && e.alive && !e.aceFlight && !e.ace && !e.bomber) _primary[n++] = e;
      } else if (p === 2) {
        for (const t of strikeTargets) if (n < 8 && t.alive) _primary[n++] = t;
      } else if (p === 3) {
        for (const e of enemies) if (n < 8 && e.alive && e.aceFlight) _primary[n++] = e;
      } else if (p === 4 && C.ally && n < 8) _primary[n++] = C.ally;
    }
    _primary.length = n;
    return _primary;
  }
  function setMissionPhase(p) {
    if (p < 1 || p > 4 || p === C.missionPhase) return;
    C.missionPhase = p; C.mpT = performance.now();
    const label = MP[p].label;
    say('[ OBJECTIVE ] ' + label, 3, '#00ff66');
    if (env.onWing) env.onWing(label + ', Lead. WARDEN-2 copies.', 'WARDEN-2');
    if (p === 2 && env.onRadio) env.onRadio('ON_PHASE_2_CANYON');
    if (p === 3) { aceFlightDone = false; spawnAceFlight(); }
  }
  function updateMissionPhase() {
    if (C.mode === 'FURBALL' || C.ambushActive) return;
    if (C.intr.st === 'CUT' || C.intr.st === 'DUEL') return;
    if (C.intr.st === 'IDLE' && !C.intr.used && (C.missionId === 'AIR_SUPERIORITY' || C.missionId === 'NAVAL_BATTLE')) {
      const staged = C.mcfg.stages && C.mcfg.stages.length;
      const readyStage = staged ? C.stage >= 1 : C.missionPhase >= 2;
      if (readyStage && (intrForce || C.comboMult >= INTR_COMBO)) startIntrusion();
    }
    const stages = C.mcfg.stages;
    if (stages && stages.length) {
      if (C.rtb) { C.obj = { done: 0, total: 1 }; return; }
      const st = stages[C.stage];
      if (!st) return;
      if (stageClear(C.stage)) {
        const from = C.stage;
        C.stage++; C.stageT = performance.now() / 1000;
        if (env.debug) console.log('[ANGELS_ZERO] stage', from, '->', C.stage);
        if (env.onRadio) env.onRadio('STAGE_' + (C.stage));
        const next = stages[C.stage];
        if (next) {
          spawnStage(C.stage);
          C.obj = { done: 0, total: 1 };
        } else {
          C.rtb = { on: true, type: C.rtbType || 'BASE', t0: performance.now() };
          C.missionPhase = 4; C.mpT = performance.now();     // RTB: a trap / rollout now completes the sortie
          if (env.debug) console.log('[ANGELS_ZERO] rtb on', C.rtb.type);
          if (env.onRadio) env.onRadio('RTB');
        }
      } else C.obj = { done: 0, total: 1 };
      return;
    }
    const p = C.missionPhase;
    if (p === 1) {
      if (waveAlive() === 0) {
        C.obj = { done: Math.max(0, C.kills - waveKill0), total: WAVE_SIZE };
        setMissionPhase(2);
      }
    } else if (p === 2) {
      let n = 0; for (const t of strikeTargets) if (t.alive) n++;
      C.obj = { done: (strikeTargets.length || 4) - n, total: strikeTargets.length || 4 };
      if (n === 0) setMissionPhase(3);
    } else if (p === 3) {
      let aces = 0; for (const e of enemies) if (e.alive && e.aceFlight) aces++;
      C.obj = { done: 2 - aces, total: 2 };
      if (aces === 0 && aceFlightDone) {
        setMissionPhase(4);
        C.rtb = { on: true, type: C.rtbType || 'BASE', t0: performance.now() };
        if (env.onRadio) env.onRadio('RTB');
      }
    } else if (p === 4) C.obj = { done: 0, total: 1 };
  }

  function updateRWR(playerActive) {
    const list = [];
    let level = 0;
    if (playerActive) {
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = e.pos.distanceTo(S.position);
        const kind = e.bLock >= 1 ? 'lock' : e.bLock > 0.05 ? 'acq' : e.tac === 'ENGAGE' && d < B_LOCK_RANGE * 1.5 ? 'paint' : null;
        if (!kind) continue;
        list.push({ b: relBearing(e.pos), kind, d, id: e.id, g: d > 2500 ? 'RADAR' : 'IR', ace: !!(e.aceFlight || e.ace) });
        level = Math.max(level, kind === 'lock' ? 2 : 1);
      }
      for (const m of missiles) {
        if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.lostTrack) continue;
        list.push({ b: relBearing(m.mesh.position), kind: 'msl', g: m.guidance || 'IR', d: m.mesh.position.distanceTo(S.position) });
        level = 3;
      }
      // Task-force search radars painting us (line of sight, 9 km).
      for (const t of taskForce) {
        if (!t.alive) continue;
        const d = t.pos.distanceTo(S.position);
        if (d > 9000 || occluded(t.pos, S.position)) continue;
        list.push({ b: relBearing(t.pos), kind: 'paint', d, id: t.id, g: 'RADAR' });
        level = Math.max(level, 1);
      }
    }
    // Under friendly jamming the scope is corrupted: real tracks flicker 50 %,
    // three bogus 'paint' bearings are refreshed every 300 ms.
    if (C.jamming > 0.5) {
      const out = [];
      for (const r of list) if (Math.random() < 0.5) out.push(r);
      const nowMs = performance.now();
      if (nowMs - jamGhostT > 300) {
        jamGhostT = nowMs; jamBearings.length = 0;
        for (let i = 0; i < 3; i++) jamBearings.push((rand() * 2 - 1) * Math.PI);
      }
      for (const b of jamBearings) { out.push({ b, kind: 'paint', d: 800 + rand() * 4000, id: 'JAM' }); level = Math.max(level, 1); }
      C.rwr = out;
    } else C.rwr = list;
    C.rwrLevel = level;
  }
  // Z: ALQ-135 internal jammer, 6 s on then a 14 s capacitor recharge.
  function activateECM() {
    if (!env.isReady() || C.dead || C.ecmState !== 'READY') {
      if (C.ecmState === 'RECHARGE') say(`ECM RECHARGING — ${C.ecmT.toFixed(1)} S`, 0.9, '#ffbf3f');
      return false;
    }
    C.ecmState = 'ACTIVE'; C.ecmT = ECM_ON;
    say('ALQ-135 ECM ACTIVE — JAMMING', 1.6, '#5fe8ff');
    if (env.onSfx) env.onSfx('ecm', null, 1);
    return true;
  }
  function updateECM(dt) {
    if (C.ecmState === 'ACTIVE') {
      C.ecmT -= dt;
      // Jamming: each established bandit track has a ~35 %/s chance to break.
      for (const e of enemies) {
        if (e.alive && e.bLock >= B_SOFT && rand() < ECM_BREAK * dt) {
          e.bLock = 0; C.ecmBreaks++;
          say('ECM — ' + (e.type || e.label) + ' LOCK BROKEN', 1.3, '#5fe8ff');
        }
      }
      if (C.ecmT <= 0) { C.ecmState = 'RECHARGE'; C.ecmT = ECM_RECHARGE; say('ECM OFF — RECHARGING', 1.0, '#ffbf3f'); }
    } else if (C.ecmState === 'RECHARGE') {
      C.ecmT -= dt;
      if (C.ecmT <= 0) { C.ecmState = 'READY'; C.ecmT = 0; say('ECM READY', 1.0, '#5fe8ff'); }
    }
  }

  /* ======================================================= missile flight */
  // WARDEN flight: G cycles FORM -> COVER -> FOCUS. Friendly shots never touch the
  // hostile director budget, and wingman kills award no player score.
  function setWingOrder(next) {
    const i = Number.isInteger(next) && next >= 0 && next < WING_ORDERS.length
      ? next : (C.wingOrder + 1) % WING_ORDERS.length;
    C.wingOrder = i; C.wingOrderT = performance.now(); C.orderBadgeT = ORDER_BADGE_S;
    const ws = env.getWingmen ? env.getWingmen() : null;
    if (ws) for (let k = 0; k < ws.length; k++) if (ws[k]) {
      ws[k].tgt = null; ws[k].pickT = 0;
      if (i === 0 && ws[k].homeOff) ws[k].off.copy(ws[k].homeOff);
    }
    if (env.onWing) env.onWing(ORDER_TEXT[i], 'WARDEN-2', '#00ff66');
    if (i !== 0 && env.onRadio) env.onRadio('ON_WINGMAN_ENGAGE');
    if (env.debug) console.log('[ANGELS_ZERO] wing order=' + WING_ORDERS[i]);
    return WING_ORDERS[i];
  }
  // Persistent CAP / STRIKE roles (src/loadout.js). COVER is the combat order that
  // these drive; FORM and FOCUS keep their existing hard override.
  function setWingRoles(r) {
    if (r) {
      C.wingRoles.w2 = r.w2 === 'STRIKE' ? 'STRIKE' : 'CAP';
      C.wingRoles.w3 = r.w3 === 'CAP' ? 'CAP' : 'STRIKE';
    }
    const ws = env.getWingmen ? env.getWingmen() : null;
    if (ws) for (let k = 0; k < ws.length; k++) if (ws[k]) {
      ws[k].role = C.wingRoles['w' + (k + 2)] || 'CAP';
      ws[k].tgt = null; ws[k].pickT = 0; ws[k].defT = 0; ws[k].seadT = 0;
    }
    if (env.debug) console.log('[ANGELS_ZERO] wing role w2=' + C.wingRoles.w2 + ' w3=' + C.wingRoles.w3 + ' tgt=ROLE');
    return C.wingRoles;
  }
  // STRIKE priorities: subsystem mast -> surface ship -> canyon rim site ahead.
  function pickStrikeTarget(w) {
    const from = w.pos || S.position;
    let best = null, bestScore = Infinity;
    for (const v of SUB_TGT) {
      if (!v.alive) continue;
      const d = v.pos.distanceTo(from);
      if (d > 8000 || d * 0.7 >= bestScore) continue;
      bestScore = d * 0.7; best = v;
    }
    if (best) return best;
    for (const t of taskForce) {
      if (!t.alive || !t.pos) continue;
      const d = t.pos.distanceTo(from);
      if (d > 10000 || d >= bestScore) continue;
      bestScore = d; best = t;
    }
    for (const t of strikeTargets) {
      if (!t.alive || !t.pos) continue;
      const d = t.pos.distanceTo(from);
      if (d > 10000 || d >= bestScore) continue;
      bestScore = d; best = t;
    }
    if (best) return best;
    if (C.mcfg.gatesPath === 'CANYON') {
      for (let i = 0; i < SAM_SITE_N; i++) {
        if (!SITE_ON[i] || SITE_TGT[i].pos.z > S.position.z) continue;   // nearest site ahead
        const d = SITE_TGT[i].pos.distanceTo(from);
        if (d > 8000 || d * 1.2 >= bestScore) continue;
        bestScore = d * 1.2; best = SITE_TGT[i];
      }
    }
    return best;
  }
  // Pick a target every 0.5 s per wingman. COVER scores rear-hemisphere lockers
  // at 0.35x range; FOCUS shares C.designated with a 400 m bracket for WARDEN-3.
  function pickWingTarget(w, wi, dt) {
    w.pickT -= dt;
    if (w.pickT > 0) return w.tgt;
    w.pickT = 0.5;
    if (C.wingHold) { w.tgt = null; if (w.homeOff) w.off.copy(w.homeOff); return null; }
    if (C.wingOrder === 0) { w.tgt = null; if (w.homeOff) w.off.copy(w.homeOff); return null; }
    if (C.wingOrder === 2) {
      const d = C.designated;
      if (!d || !d.alive) {
        if (performance.now() - C.wingNoDesignationT > 3000) {
          C.wingNoDesignationT = performance.now();
          if (env.onWing) env.onWing('NO DESIGNATION — COVERING', 'WARDEN-2', '#ffb838');
        }
        setWingOrder(1);                                  // drop to COVER, no target this tick
        return null;
      }
      w.tgt = d; return d;
    }
    let best = null, bestScore = Infinity;
    _wmFwd.set(0, 0, -1).applyQuaternion(S.quaternion);
    for (const e of enemies) {
      if (!e.alive || e.wingTarget) continue;
      const d = e.pos.distanceTo(S.position);
      if (d > 3 * NM) continue;
      _wmRel.copy(e.pos).sub(S.position).normalize();
      const threat = e.bLock > 0 || (d < COVER_R && _wmFwd.dot(_wmRel) < COVER_REAR_COS);
      const score = d * (threat ? 0.35 : 1);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    // Self-defence takes over for 6 s: a bandit in the rear hemisphere, inside
    // 800 m, or one with a lock on us. Works for either role.
    w.defT = (w.defT || 0) - 0.5;
    if (w.defT > 0 && w.defTgt && w.defTgt.alive) { w.tgt = w.defTgt; return w.defTgt; }
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(w.pos || S.position);
      if (d > 800 || !(e.bLock > 0)) continue;
      _wmRel.copy(e.pos).sub(w.pos || S.position).normalize();
      if (_wmFwd.dot(_wmRel) < COVER_REAR_COS) { w.defTgt = e; w.defT = 6; w.tgt = e; return e; }
    }
    if ((w.role || 'CAP') === 'STRIKE') {
      const st = pickStrikeTarget(w);
      if (st) { w.tgt = st; return st; }                 // fallback to CAP when no surface target remains
      if (env.debug && !w.seadLogged) { w.seadLogged = true; console.log('[ANGELS_ZERO] wing role fallback w=' + w.id + ' CAP'); }
    } else w.seadLogged = false;
    if (!best && C.mcfg.stages) {                        // no bandits: finish damaged escorts only
      for (const t of stagedShips) {
        if (!t.alive || t.kind === 'CV_FLAG' || t.hp > 2) continue;
        const d = t.pos.distanceTo(S.position);
        if (d > 1500 || d >= bestScore) continue;
        bestScore = d; best = t;
      }
    }
    if (!best) { w.tgt = null; if (w.homeOff) w.off.copy(w.homeOff); }
    else w.tgt = best;
    return best;
  }
  function wingSlot(w, wi, best) {
    _wmTarget.copy(best.pos);
    if (C.wingOrder === 2 && wi === 1) _wmTarget.x += 400;   // WARDEN-3 bracket
    else if (C.wingOrder === 1) _wmTarget.addScaledVector(best.fwd || _wmFwd.set(0, 0, -1), -600);
    _wmRel.copy(_wmTarget).sub(S.position);
    if (_wmRel.length() > 1500) _wmTarget.copy(S.position).add(_wmRel.setLength(1500));
    w.off.copy(_wmTarget).sub(S.position).applyQuaternion(_wmInv.copy(S.quaternion).invert());
  }
  // --- wounded wingman (LIMPING) ------------------------------------------------
  function limpDestination(out) {
    const a = C.ally;
    if (a && a.root && a.root.visible && C.carrierVisible) {
      out.copy(a.root.position);
      _wmRel.set(0, 0, (a.len || 360) * 0.5).applyQuaternion(a.root.quaternion);
      out.add(_wmRel); out.y = 1500;
    } else {
      const rw = env.runway || {};
      out.set(rw.x || 900, 1500, ((rw.z0 || -1800) + (rw.z1 || 2000)) * 0.5);
    }
    return out;
  }
  function assignLimpPursuers(w) {
    const L = C.limp;
    L.n = 0;
    let i0 = -1, i1 = -1, d0 = Infinity, d1 = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.alive || e.ace || e.aceFlight || e.bomber || e.wingTarget) continue;
      const d = e.pos.distanceToSquared(w.pos);
      if (d < d0) { d1 = d0; i1 = i0; d0 = d; i0 = i; }
      else if (d < d1) { d1 = d; i1 = i; }
    }
    for (let k = 0; k < 2; k++) {
      const idx = k ? i1 : i0;
      if (idx < 0) continue;
      const e = enemies[idx];
      e.wingTarget = w; e.tac = e.mode = 'ENGAGE'; e.mslCD = 999; e.bLock = 0;
      L.pursuers[L.n++] = idx;
    }
    for (let k = L.n; k < LIMP_PURSUERS; k++) {
      let idx = -1;
      for (let i = 0; i < enemies.length; i++) if (!enemies[i].alive && !enemies[i].aceFlight && !enemies[i].bomber) { idx = i; break; }
      if (idx < 0) break;
      const e = enemies[idx];
      resetAI(e); clearAce(e);
      _wmRel.set(0, 0, -1).applyQuaternion(w.quat);
      e.pos.copy(w.pos).addScaledVector(_wmRel, -3000); e.pos.y = Math.max(900, w.pos.y);
      e.prev.copy(e.pos); e.fwd.copy(w.pos).sub(e.pos).normalize();
      e.vel.copy(e.fwd).multiplyScalar(e.speed);
      e.alive = true; e.wreck = null; e.tac = e.mode = 'ENGAGE';
      e.mslCD = 999; e.bLock = 0; e.hp = e.hpMax = 100; e.wingTarget = w;
      L.pursuers[L.n++] = idx;
    }
    writeFleet();
  }
  function triggerWoundedWingman(force = false) {
    const L = C.limp;
    if (C.missionId !== 'AIR_SUPERIORITY' && C.missionId !== 'NAVAL_BATTLE') return false;
    if (L.st !== 'IDLE' || L.used) return false;
    const ws = env.getWingmen ? env.getWingmen() : null;
    const w = ws && ws[0];
    if (!w || !w.alive) return false;
    if (w.hp === undefined) { w.hp = 100; w.hpMax = 100; }
    L.st = 'LIMPING'; L.used = true; L.w = w; L.graceT = 1; L.force = !!force;
    w.hp = Math.max(1, w.hp);
    w.limping = true; w.tgt = null; w.cd = 999;
    if (!w.limpDest) w.limpDest = new THREE.Vector3();
    limpDestination(w.limpDest);
    assignLimpPursuers(w);
    if (env.onWing) env.onWing("WARDEN-2: I'M HIT — BINGO, LIMPING HOME!", 'WARDEN-2', 'warn');
    if (env.debug) console.log('[ANGELS_ZERO] limp st=LIMPING pursuers=' + L.n + ' w2hp=' + Math.round(w.hp));
    return true;
  }
  function saveWingman() {
    const L = C.limp, w = L.w;
    L.st = 'SAVED';
    if (w) { w.limping = false; if (env.limpTrail) env.limpTrail.mesh.visible = false; }
    C.wingSavedBannerT = performance.now();
    awardStyle('WING_SAVED', w ? w.call : '');
    pushEvent('WINGMAN SAVED', 'WINGMAN SAVED +1500', LIMP_SAVE_PTS, '#5fe8ff');
    if (env.onTele && w) env.onTele('WING_SAVED', w.pos);
    if (env.onWing) env.onWing('WARDEN-2: THANKS ONE, OWE YOU A BEER', 'WARDEN-2', '#00ff66');
    if (env.debug) console.log('[ANGELS_ZERO] limp SAVED pts=1500');
  }
  function loseWingman() {
    const L = C.limp;
    L.st = 'LOST';
    if (L.w) { L.w.limping = false; L.w.alive = false; }
    if (env.limpTrail) env.limpTrail.mesh.visible = false;
    if (env.onWing) env.onWing('WARDEN-2 DOWN — NO JOY', 'WARDEN-2', 'warn');
    if (env.debug) console.log('[ANGELS_ZERO] limp st=LOST');
  }
  function resetLimp() {
    const L = C.limp;
    for (let i = 0; i < L.n; i++) {
      const idx = L.pursuers[i];
      if (idx >= 0 && enemies[idx]) enemies[idx].wingTarget = null;
    }
    if (L.w) { L.w.limping = false; if (L.w.hpMax) L.w.hp = L.w.hpMax; }
    if (env.limpTrail) { env.limpTrail.clear(); env.limpTrail.mesh.visible = false; }
    L.st = 'IDLE'; L.w = null; L.n = 0; L.used = false; L.graceT = 0;
    L.pursuers.fill(-1);
  }
  function updateLimp(dt, ws) {
    const L = C.limp;
    if (L.st === 'IDLE') {
      const w = ws[0];
      if (!L.used && w && w.alive && (C.missionId === 'AIR_SUPERIORITY' || C.missionId === 'NAVAL_BATTLE')) {
        const mt = env.getMissionT ? env.getMissionT() : 0;
        const hpFrac = w.hp === undefined ? 1 : w.hp / (w.hpMax || 100);
        const stages = C.mcfg.stages;
        const midStage = !!(stages && stages.length > 1 && C.stage === Math.floor(stages.length / 2) &&
          C.stageT && performance.now() / 1000 - C.stageT > 5);
        if (mt > LIMP_MIN_T && (hpFrac < LIMP_HP_FRAC || midStage)) triggerWoundedWingman();
      }
      return;
    }
    if (L.st !== 'LIMPING') return;
    const w = L.w;
    if (!w || !w.alive || w.hp <= 0) { loseWingman(); return; }
    L.graceT -= dt;
    if (L.graceT > 0) w.hp = Math.max(1, w.hp);
    if (env.limpTrail) {
      const t = performance.now() / 1000;
      _wmTarget.copy(w.pos); _wmTarget.y -= 2;
      env.limpTrail.emit(_wmTarget, 1, t);
      env.limpTrail.update(camera.position, t);
      env.limpTrail.mesh.visible = true;
    }
    let any = false;
    for (let i = 0; i < L.n; i++) {
      const idx = L.pursuers[i];
      if (idx >= 0 && enemies[idx] && enemies[idx].alive) { any = true; break; }
    }
    if (!any && L.n > 0) saveWingman();
  }
  function updateWingmen(dt) {
    if (C.mcfg.wingmen === 'NONE') return;
    const ws = env.getWingmen ? env.getWingmen() : null;
    if (!ws || !ws.length) return;
    updateLimp(dt, ws);
    const scActive = C.sc && (C.sc.st === 'IN' || C.sc.st === 'ARCH_OK');
    if (scActive) {
      _wmInv.copy(S.quaternion).invert();
      for (let k = 0; k < ws.length; k++) {
        const wk = ws[k]; if (!wk || !wk.alive) continue;
        const zz = S.position.z + 150 * (k + 1), cx = gorgeCentreX(zz);
        _wmTarget.set(cx - S.position.x, Math.min(S.position.y - 40, GORGE_FLOOR_Y + 100 - S.position.y), zz - S.position.z);
        wk.off.copy(_wmTarget).applyQuaternion(_wmInv);
      }
      return;                                            // hold the centreline, no attacks during the run
    }
    for (let wi = 0; wi < ws.length; wi++) {
      const w = ws[wi];
      if (!w || !w.alive) continue;
      if (w.cat && w.cat.ph !== 'AIRBORNE' && w.cat.ph !== 'NONE') continue;
      if (w.limping) continue;                            // limping wingman ignores orders
      w.cd -= dt;
      if (!env.isReady()) continue;
      const best = pickWingTarget(w, wi, dt);
      if (!best) continue;
      wingSlot(w, wi, best);
      if (best.isSite) {
        // SEAD: fly the trench centreline and fire only inside a 15 deg cone at 2.5 km.
        w.seadT = Math.max(0, (w.seadT || 0) - dt);
        _wmRel.copy(best.pos).sub(w.pos || S.position);
        const d = _wmRel.length();
        _wmFwd.set(0, 0, -1).applyQuaternion(w.quat);
        if (d > 2500 || d < 1 || _wmRel.divideScalar(d).dot(_wmFwd) < Math.cos(15 * Math.PI / 180)) continue;
      }
      if (w.cd > 0 || C.wingOrder === 0) continue;
      let inFlight = 0;
      for (const m of missiles) if (m.active && m.wingman === w.id) inFlight++;
      if (inFlight) continue;
      const m = launch(w.pos, w.quat, w.vel, best, false, MSL_FULL, null);
      if (!m) continue;
      m.friendly = true; m.wingman = w.id;
      w.cd = best.isSite ? SEAD_CD + rand() * 2 : 7 + 4 * rand();
      if (best.isSite) { w.seadT = SEAD_CD; if (env.debug) console.log('[ANGELS_ZERO] wing sead site=' + best.idx + ' w=' + w.id); }
      if (env.onRadio) env.onRadio('ON_WINGMAN_ENGAGE');
    }
  }
  const _mFwd = new THREE.Vector3(), _mL2 = new THREE.Vector3(), _mLos = new THREE.Vector3();
  const _mLosRate = new THREE.Vector3(), _mRelVel = new THREE.Vector3(), _mAcc = new THREE.Vector3();
  const _mJit = new THREE.Vector3(), _mTail = new THREE.Vector3(), _mDir = new THREE.Vector3();
  // Solar-blind + shootdown scratch. Preallocated; no vector is created in update().
  const _sunDir = new THREE.Vector3(), _pf = new THREE.Vector3(), _ml = new THREE.Vector3();
  const _iu = new THREE.Vector3(), _iv = new THREE.Vector3(), _iw = new THREE.Vector3(), _segHit = new THREE.Vector3();
  // Closest approach of two segments; returns squared distance, writes the point on p1->q1 into out.
  function segSeg(p1, q1, p2, q2, out) {
    _iu.subVectors(q1, p1); _iv.subVectors(q2, p2); _iw.subVectors(p1, p2);
    const a = _iu.dot(_iu), b = _iu.dot(_iv), c = _iv.dot(_iv);
    const d = _iu.dot(_iw), e = _iv.dot(_iw), det = a * c - b * b;
    let s, t;
    if (det < 1e-8) { s = 0; t = Math.abs(b) > Math.abs(c) ? d / b : e / c; }
    else { s = (b * e - c * d) / det; t = (a * e - b * d) / det; }
    s = clamp(s, 0, 1); t = clamp(t, 0, 1);
    out.copy(p1).addScaledVector(_iu, s);
    _iw.copy(out).sub(p2).addScaledVector(_iv, -t);
    return _iw.lengthSq();
  }
  function interceptMissile(m, d, point) {
    if (!m.active) return;
    explosion(point, 0.7);
    hitSparks(point, m.vel);
    m.active = false; m.mesh.visible = false;
    if (env.onSfx) env.onSfx('explosion', point, 0.7);
    let warn = false;
    for (const o of missiles) if (o !== m && o.active && o.enemy && o.target && o.target.isPlayer) { warn = true; break; }
    if (!warn) { C.missileWarning = 0; C.incoming = 0; }
    C.mslIntercepts++; C.interceptBannerT = performance.now(); C.score += MSL_SHOOT_PTS;
    pushEvent('INTERCEPT', 'MISSILE INTERCEPT', MSL_SHOOT_PTS, '#5fe8ff');
    say('SPLASH THE MISSILE — NICE SHOOTING', 2.2, '#5fe8ff');
    if (!warn && env.onSlowMo && C.interceptSlowCD <= 0) {
      env.onSlowMo(); C.interceptSlowCD = 1.2;
      if (env.debug) console.log('[ANGELS_ZERO] msl intercept slowmo fired');
    }
    if (env.debug) console.log('[ANGELS_ZERO] msl intercept d=' + d.toFixed(2) + ' pts=' + MSL_SHOOT_PTS + ' warnClear=' + !warn);
  }
  function updateMissiles(dt, playerActive) {
    if (env.samFx) env.samFx(missiles, camera.position, performance.now() / 1000);
    // Solar IR blind: one gate per frame, then a per-seeker geometry test.
    if (env.getSunDir) env.getSunDir(_sunDir);
    let sunOk = false;
    const cw = env.getCloudWet ? env.getCloudWet() : 0;
    if (_sunDir.y > SUN_MIN_Y && cw < SUN_CLOUD_MAX) {
      const deck = env.getCloudDeck ? env.getCloudDeck() : null;
      if (!(deck && S.position.y < deck.base)) {
        _pf.set(0, 0, -1).applyQuaternion(S.quaternion);
        sunOk = _pf.dot(_sunDir) >= SUN_BLIND_COS;
      }
    }
    if (sunOk) C.sunT += dt; else C.sunT = Math.max(0, C.sunT - 2 * dt);
    C.sunCD = Math.max(0, C.sunCD - dt);
    C.interceptSlowCD = Math.max(0, C.interceptSlowCD - dt);
    for (const m of missiles) {
      if (!m.active) continue;
      m.age += dt;
      const pos = m.mesh.position;
      m.prevPos.copy(pos);
      if (C.sunT >= SUN_BLIND_HOLD && m.enemy && m.guidance === 'IR' && m.target && m.target.isPlayer && !m.lostTrack) {
        _ml.copy(S.position).sub(pos).normalize();
        if (_ml.dot(_sunDir) >= SUN_SEEKER_COS) {
          m.lostTrack = true; m.target = null;
          if (C.sunCD <= 0) {
            C.sunCD = SUN_BLIND_CD; C.sunBlinds++; C.sunBannerT = performance.now(); C.score += SUN_BLIND_PTS;
            say('SUN BLIND // IR LOCK BROKEN', 2.2, '#5fe8ff');
            pushEvent('EVADED', 'SUN BLIND // IR LOCK BROKEN', SUN_BLIND_PTS, '#5fe8ff');
            C.missileWarning = 0;
            if (env.onSfx) env.onSfx('lockdrop', S.position, 1);
            if (env.debug) console.log('[ANGELS_ZERO] sun blind m=' + m.idx + ' cos=' + _ml.dot(_sunDir).toFixed(3) + ' sunT=' + C.sunT.toFixed(2));
          }
        }
      }
      if (!m.motor && m.age > (m.motorDelay || 0.18)) { m.motor = true; m.plume.visible = true; }
      const speed = m.vel.length();
      if (m.motor) {
        if (m.homingDelay > 0) m.homingDelay = Math.max(0, m.homingDelay - dt);
        const burning = m.age < 3.2;
        const fwd = _mFwd.copy(m.vel).normalize();
        m.vel.addScaledVector(fwd, (burning ? 320 : -40) * dt);
        if (m.vel.length() > 940) m.vel.setLength(940);
        m.plume.visible = burning;
        // Proportional navigation: a = N * Vc * LOS-rate, limited by the missile's
        // turn authority (accel <= v * maxTurnRate) and its seeker field of view.
        const tgt = m.target, q = m.q || MSL_FULL;
        m.cloud = cloudAt(pos);
        // Terrain masking: a ridge / canyon wall between this missile and the jet strips
        // its guidance -- it flies on ballistic (usually into the wall).
        if (tgt && m.enemy && tgt.isPlayer && !m.lostTrack && playerActive) {
          m.maskT = (m.maskT || 0) - dt;
          if (m.maskT <= 0) {
            m.maskT = m.sam ? 0.1 : 0.1;
            if (occluded(pos, S.position)) {
              m.maskHold = (m.maskHold || 0) + 0.1;
              if (!m.sam || m.maskHold >= 0.6) { m.lostTrack = true; m.terrainLost = true; C.missileWarning = 0; terrainMaskBreak('MISSILE'); if (m.sam) C.samMasked++; }
            } else m.maskHold = 0;
          }
        }
        // SAMs detonate on any terrain contact (a hard dive into the trench kills them).
        if (m.sam && pos.y <= terrainHeight(pos.x, pos.z) + 1) {
          explosion(pos, 0.8, { kind: 'ground' }); m.active = false; m.mesh.visible = false; C.samLive = Math.max(0, C.samLive - 1);
          continue;
        }
        if (tgt && m.enemy && tgt.isPlayer && !m.lostTrack && playerActive && (C.playerCloud > CLOUD_T || m.cloud > CLOUD_T)) {
          // The F-15 (or the missile) is in thick cloud: seeker loses lock, flies its
          // last velocity vector and self-destructs harmlessly 1.5 s later.
          m.lostTrack = true; m.cloudLost = true; m.life = Math.min(m.life, m.age + 1.5);
          C.missileWarning = 0; cloudClear = 1.2;
          C.cloudBreaks = (C.cloudBreaks || 0) + 1;
          say('CLOUD COVER // MISSILE LOST', 2.2, '#52ff9c');
          pushEvent('EVADED', 'CLOUD COVER // MISSILE LOST', 0, '#52ff9c');
          if (env.onSfx) env.onSfx('lockdrop', null, 1);
        }
        if (tgt && !m.enemy && !tgt.isPlayer && !tgt.isFlare && tgt.alive) {
          const tc = (tgt.cloud || 0) > CLOUD_T;
          if (!m.lostTrack) {
            // Target hidden in cloud for ~0.4 s: proportional-navigation lock is lost.
            m.cloudT = tc ? (m.cloudT || 0) + dt : 0;
            if (m.cloudT >= 0.4) { m.lostTrack = true; m.cloudLost = true; }
          } else if (m.cloudLost && !tc) {
            // Target back in clear air and still inside the seeker cone: reacquire.
            _mL2.copy(tgt.pos).sub(pos).normalize();
            if (Math.acos(clamp(fwd.dot(_mL2), -1, 1)) < q.fov * 0.5) { m.lostTrack = false; m.cloudLost = false; m.cloudT = 0; m.losPrev.copy(_mL2); m.reacquired = true; }
          }
        }
        // Notch: a beam-on aspect (>= 75 deg folded) below 1200 ft AGL breaks a
        // RADAR seeker after 1.4 s. No allocations: pure vector dot products.
        if (m.enemy && m.guidance === 'RADAR' && tgt && tgt.isPlayer && !m.lostTrack && playerActive) {
          const denom = S.velocity.length() * m.vel.length();
          const ang = denom > 1 ? Math.acos(clamp(Math.abs(S.velocity.dot(m.vel)) / denom, -1, 1)) : 0;
          const inNotch = ang >= 75 * D2R && S.radalt < 1200 * FT;
          m.notchT = inNotch ? m.notchT + dt : 0;
          if (m.notchT > 1.4) {
            m.lostTrack = true; C.notchT = performance.now(); C.score += 300;
            pushEvent('NOTCHED', 'NOTCHED // RADAR LOCK BROKEN', 300, '#00ff66');
            say('NOTCHED — RADAR LOCK BROKEN', 2.0, '#00ff66');
          }
        }
        const tAlive = tgt && !m.lostTrack && (tgt.isPlayer ? playerActive : tgt.alive);
        if (tAlive) {
          const range = _mLos.copy(tgt.pos).sub(pos).length(); _mLos.divideScalar(range);
          // Seeker gimbal: if the target slips outside the FOV the missile goes ballistic.
          if (Math.acos(clamp(fwd.dot(_mLos), -1, 1)) > q.fov * 0.5) { m.lostTrack = true; }
          // Defensive break: a high-G turn or barrel roll inside 900 m can spoof a bandit seeker.
          if (tgt.isPlayer && !m.breakChecked && range < 900 && (S.highG || S.barrelRoll || S.gLoad > 12)) {
            m.breakChecked = true;
            if (rand() < (q === BANDIT_FULL ? 0.75 : 0.95)) {
              m.lostTrack = true; C.score += 250;
              pushEvent('EVADED', 'MISSILE EVADED', 250, '#52ff9c');
              say('MISSILE DEFEATED!', 1.6);
            }
          }
          if (!m.lostTrack && !(m.homingDelay > 0)) {
            _mLosRate.copy(_mLos).sub(m.losPrev).divideScalar(Math.max(dt, 1e-4));
            m.losPrev.copy(_mLos);
            const vc = -_mRelVel.copy(tgt.vel).sub(m.vel).dot(_mLos);
            _mAcc.copy(_mLosRate).multiplyScalar(q.N * Math.max(vc, 200));
            if (q.noise) {                                          // low-passed seeker wander (soft locks)
              if (!m.jit) m.jit = new THREE.Vector3();
              _mJit.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2);
              m.jit.lerp(_mJit, 1 - Math.exp(-dt * 3));
              _mAcc.addScaledVector(m.jit, q.noise * 25 * G0);
            }
            _mAcc.y += G0;                                          // gravity compensation
            const lim = m.vel.length() * q.turn;
            if (_mAcc.length() > lim) _mAcc.setLength(lim);
            m.vel.addScaledVector(_mAcc, dt);
            const fuse = (tgt && tgt.kind === 'DRONE') ? DRONE_HIT_R + 4 : m.enemy ? 22 : 18;
            if (range < fuse) {
              if (tgt.isPlayer) {
                explosion(pos, 0.9); damagePlayer(q === BANDIT_FULL ? 40 : 26); m.hitPlayer = true;
                // Critical hit on two healthy engines: 35 % chance one of them catches fire.
                if (!C.engSide && C.fireArmed && !C.dead && rand() < DIFF.missileIgniteP) igniteEngine('MISSILE HIT');
              }
              else if (tgt.isChaff) { explosion(pos, 0.5); }
              else if (tgt.isFlare) { explosion(pos, 0.6); tgt.alive = false; }
              else if (tgt.fleet) {
                explosion(pos, 1.3, { kind: 'ship' });
                if (tgt.sub && tgt.sub.on && pos.distanceTo(subWorld(tgt, _subW)) < SUB_HIT_R) { hitSub(tgt, 2); damageSurface(tgt, 22); }
                else damageSurface(tgt, 90);
              }
              else if (tgt.isSub && tgt.ship) { explosion(pos, 0.8); hitSub(tgt.ship, 2); }
              else if (tgt.isSite) { explosion(pos, 0.8); hitSite(tgt.idx, 2); }
              else if (tgt.kind === 'DRONE') { explosion(pos, 0.7, { vel: tgt.vel }); droneSplash(pos, tgt.idx); }
              else { explosion(pos, 0.8, { vel: tgt.vel }); heavyHit(tgt, m.wingman ? 'WINGMAN' : m.aam ? 'AAM4' : m.friendly ? 'BASE' : undefined); }
              logShot(m, tgt.isChaff ? 'CHAFF' : tgt.isFlare ? 'FLARE' : 'HIT');
              if (m.sam) { C.samLive = Math.max(0, C.samLive - 1); if (m.target && m.target.isPlayer) C.samHit++; }
              m.active = false; m.mesh.visible = false; continue;
            }
            // Near-miss: closest approach already passed and the missile is receding.
            // Hits `continue` above, so they can never raise a flyby.
            if (m.enemy && !m.flybyTriggered && !m.hitPlayer) {
              const d = pos.distanceTo(S.position);
              if (d < m.flyMinD) m.flyMinD = d;
              else if (m.flyMinD < 140 && d > m.flyMinD + 2) {
                m.flybyTriggered = true;
                const k = Math.max(0.15, 1 - m.flyMinD / 140);
                const side = Math.sign(_flyRel.copy(pos).sub(S.position).dot(_flyRight.set(1, 0, 0).applyQuaternion(S.quaternion))) || 1;
                if (env.onFlyby) env.onFlyby({ dist: m.flyMinD, k, side });
                if (m.flyMinD < 75 && env.onTele) env.onTele('NEAR_MISS', S.position);
              }
            }
          }
        }
        m.smokeAcc += dt * 70;
        while (m.smokeAcc >= 1 && burning) {
          m.smokeAcc -= 1;
          _mTail.copy(pos).addScaledVector(fwd, 1.8);
          // Bandit missiles leave distinct red-tinged smoke.
          const [r, g, b] = m.enemy ? [0.78, 0.36, 0.30] : [0.88, 0.88, 0.88];
          smoke.spawn({ x: _mTail.x, y: _mTail.y, z: _mTail.z, vx: (rand() - 0.5) * 2, vy: (rand() - 0.5) * 2, vz: (rand() - 0.5) * 2,
            life: 2.8 + rand(), s0: 2.6, s1: 13 + rand() * 5, r, g, b, a: 0.62, drag: 0.9, rise: 0.6 });
        }
      } else {
        m.vel.y -= G0 * dt;
      }
      pos.addScaledVector(m.vel, dt);
      if (m.enemy && playerActive) checkCloseCall(m, pos);
      if (speed > 1) m.mesh.quaternion.setFromUnitVectors(MSL_NOSE, _mDir.copy(m.vel).normalize());
      if (m.age > m.life || pos.y < groundLevel(pos.x, pos.z)) {
        if (pos.y < groundLevel(pos.x, pos.z) && terrainHeight(pos.x, pos.z) < 0) splash(pos, 0.5); else explosion(pos, 0.5);
        logShot(m, m.cloudLost ? 'CLOUD' : m.terrainLost ? 'TERRAIN' : m.lostTrack ? 'LOST' : m.target ? 'MISS' : 'DUMB');
        if (m.sam) C.samLive = Math.max(0, C.samLive - 1);
        m.active = false; m.mesh.visible = false;
      }
    }
  }

  // Missile outcome log (debug stats + tuning): tag = FULL / SOFT / B-FULL / B-SOFT.
  C.mslLog = [];
  function logShot(m, result) {
    if (!m.enemy) { C.mslFiredP++; if (result === 'HIT') C.mslHitsP++; }
    C.mslLog.push({ tag: (m.q || MSL_FULL).tag, result, t: +m.age.toFixed(1) });
    if (C.mslLog.length > 16) C.mslLog.shift();
  }

  // Debug: does a falling bomb render the very geometry of its pylon node?
  function sameGeo(b) {
    const st = stores.bomb.find(s => s.node.name === b.name); if (!st) return false;
    const g = o => { let r = null; o.traverse(q => { if (q.isMesh && !r) r = q.geometry; }); return r; };
    return g(st.node) === g(b.obj);
  }

  function damagePlayer(n) {
    if (C.dead) return;
    C.health = Math.max(0, C.health - n);
    C.maxDmg = Math.max(C.maxDmg || 0, 100 - C.health);
    if (C.health <= 45 && !C.lowHpSaid) { C.lowHpSaid = true; if (env.onRadio) env.onRadio('ON_LOW_HP'); }
    else if (C.health > 70) C.lowHpSaid = false;
    C.hitFlash = 0.3;
    if (C.health <= 0) env.onPlayerDown('damage');
  }


  /* ================================================ pylon stores (GLB) */
  // assets/angels_zero_jet.glb carries the F-15's real ordnance as separate nodes:
  // Pylon_MSL_1..4 (wing-pylon missiles) and Pylon_BOMB_1..12 (conformal-tank
  // bombs), each with its origin at its bounds centre. Firing hides the node on
  // the jet and flies a clone of that exact mesh; reloading shows them again.
  const stores = { msl: [], bomb: [] };
  const freeMats = new Map();            // store material -> copy without the cockpit clip planes
  function collectStores(model) {
    model.updateMatrixWorld(true);
    model.traverse(o => {
      const m = /^Pylon_(MSL|BOMB)_(\d+)$/.exec(o.name || '');
      if (!m || /^Pylon_/.test(o.parent?.name || '')) return;
      const box = new THREE.Box3().setFromObject(o);
      const size = box.getSize(new THREE.Vector3());
      stores[m[1] === 'MSL' ? 'msl' : 'bomb'].push({ node: o, n: +m[2], halfLen: size.z / 2 });
      o.traverse(q => {
        if (!q.isMesh) return;
        for (const mat of Array.isArray(q.material) ? q.material : [q.material]) {
          if (mat && !freeMats.has(mat)) { const c = mat.clone(); c.clippingPlanes = null; freeMats.set(mat, c); }
        }
      });
    });
    stores.msl.sort((a, b) => a.n - b.n); stores.bomb.sort((a, b) => a.n - b.n);
    if (stores.msl.length) MSL_MAX = stores.msl.length;
    Object.assign(C, { mslMax: MSL_MAX, missiles: MSL_MAX, bombMax: stores.bomb.length, bombs: stores.bomb.length });
    if (!stores.bomb.length) C.weapon = 'MSL';
  }
  // Exact clone of a store node (shared geometry) at the node's world scale.
  function cloneStore(node) {
    const c = node.clone();
    c.traverse(q => {
      if (!q.isMesh) return;
      q.material = Array.isArray(q.material) ? q.material.map(m => freeMats.get(m) || m) : (freeMats.get(q.material) || q.material);
      q.castShadow = false;
    });
    node.getWorldScale(c.scale);
    return c;
  }
  function rearm(kind) {
    const locked = kind === 'msl' ? C.weaponsLock.msl : C.weaponsLock.spw;
    for (const st of stores[kind]) { st.node.visible = !locked && !st.aamHidden; st.mslSpent = false; }
  }
  // Locked stores stay off the pylons whatever re-shows them (GLB load, pit stop, restart).
  function enforceStoreLock() {
    if (C.weaponsLock.msl) for (const st of stores.msl) if (st.node.visible) st.node.visible = false;
    if (C.weaponsLock.spw) for (const st of stores.bomb) if (st.node.visible) st.node.visible = false;
  }

  /* ================================================================ bombs */
  // Free-fall store: released with the jet's velocity plus a 2.5 m/s ejector
  // push along the jet's -Y, then pure gravity (no drag) — the same closed-form
  // arc the CCIP pipper solves, so the pipper is exact.
  const liveBombs = [];
  let bombCooldown = 0, lastImpact = null;
  // R cycles >MSL -> >4AAM -> >UGB. Switching drops the seeker back to passive radar tracking.
  function setWeapon(w) {
    w = String(w).toUpperCase();
    if (w === '4AAM') w = 'AAM4';
    if (C.weaponsLock.msl && w === 'MSL') { if (env.onSfx) env.onSfx('mfd'); say('GUNS ONLY', 1.0, '#ffbf3f'); return C.weapon; }
    if (C.weaponsLock.spw && w !== 'MSL') { if (env.onSfx) env.onSfx('mfd'); say('GUNS ONLY', 1.0, '#ffbf3f'); return C.weapon; }
    const spwWpn = (SPW[C.spw] || SPW['4AAM']).wpn;
    if (!['MSL', spwWpn].includes(w)) w = 'MSL';                  // only AIM-9 + the selected special weapon
    if (w === 'BOMB' && !stores.bomb.length) w = 'MSL';
    if (C.weapon !== w) {
      disarmSeeker(null);
      C.weapon = w;
      if (w !== 'AAM4') setMulti([]);
      say(w === 'BOMB' ? 'UGB SELECTED — CCIP' : w === 'AAM4' ? '4AAM SELECTED — TRACK-WHILE-SCAN'
        : w === 'QAAM' ? 'QAAM SELECTED — HIGH OFF-BORESIGHT' : 'AIM-9 SELECTED', 1.0);
    }
    return C.weapon;
  }
  function toggleWeapon() { return setWeapon(C.weapon === 'MSL' ? (SPW[C.spw] || SPW['4AAM']).wpn : 'MSL'); }
  // Hangar selection: AIM-9 + one special weapon only; an obsolete selection is dropped.
  function setSPW(id) {
    C.spw = SPW[id] ? id : '4AAM';
    if (C.weapon !== 'MSL' && C.weapon !== SPW[C.spw].wpn) setWeapon('MSL');
    return C.spw;
  }
  // >UGB with a CCRP solution: holding the pickle arms the automatic release;
  // otherwise it is a CCIP drop now.
  function fireSelected() {
    if (gunsOnly()) {                                        // weapon-fire handler hard block
      if (env.onSfx) env.onSfx('mfd');
      say('GUNS ONLY — NO MISSILES', 1.0, '#ffbf3f');
      return false;
    }
    if (C.weapon === 'BOMB') {
      if (C.ccrp && C.ccrp.along > 0 && C.bombs > 0 && C.bombReload <= 0) {
        if (!C.ccrpArmed) { C.ccrpArmed = true; say('CCRP ARMED — HOLD PICKLE, FLY THE STEERING LINE', 1.6, '#ffbf3f'); }
        return true;
      }
      return dropBomb();
    }
    if (C.weapon === 'AAM4') return fireAAM4();
    if (C.weapon === 'QAAM') return fireQAAM();
    return fireMissile();
  }
  function pickleUp() { if (C.ccrpArmed) { C.ccrpArmed = false; say('CCRP SAFE', 0.9, '#ffbf3f'); } }
  function dropBomb() {
    if (gunsOnly() || C.weaponsLock.spw) return false;
    if (!env.isReady() || C.dead || C.bombs <= 0 || C.bombReload > 0 || bombCooldown > 0) return false;
    const st = stores.bomb.find(b => b.node.visible); if (!st) return false;
    jet.updateMatrixWorld(true);
    const obj = cloneStore(st.node);
    st.node.getWorldPosition(obj.position); st.node.getWorldQuaternion(obj.quaternion);
    st.node.visible = false;
    scene.add(obj);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(S.quaternion);
    const v0 = S.velocity.clone().addScaledVector(down, BOMB_EJECT);
    const hit = solveImpact(obj.position, v0);
    liveBombs.push({ obj, p0: obj.position.clone(), v0, vel: v0.clone(), t: 0, tof: hit ? hit.t : 20, name: st.node.name });
    C.bombs--; bombCooldown = BOMB_INTERVAL;
    if (C.bombs <= 0) C.bombReload = BOMB_RELOAD;
    C.lastDrop = { name: st.node.name, ccip: C.ccip ? C.ccip.clone() : null };
    if (env.onSfx) env.onSfx('release', obj.position, 1);
    say('BOMB AWAY — ' + (stores.bomb.length - C.bombs) + '/' + stores.bomb.length, 1.0, '#ffbf3f');
    return true;
  }
  // Closed-form fall: p(t) = p0 + v0 t - 1/2 g t^2. Returns the ground hit or null.
  const _bp = new THREE.Vector3();
  function bombAt(p0, v0, t, out) { return out.copy(p0).addScaledVector(v0, t).setY(p0.y + v0.y * t - 0.5 * G0 * t * t); }
  function solveImpact(p0, v0, tMax = 60) {
    let tPrev = 0;
    for (let t = 0.25; t <= tMax; t += 0.25) {
      bombAt(p0, v0, t, _bp);
      if (_bp.y <= groundLevel(_bp.x, _bp.z)) {
        let lo = tPrev, hi = t;
        for (let i = 0; i < 14; i++) {                   // bisect to ~1.5 cm along the arc
          const mid = (lo + hi) / 2; bombAt(p0, v0, mid, _bp);
          if (_bp.y <= groundLevel(_bp.x, _bp.z)) hi = mid; else lo = mid;
        }
        return { t: hi, p: bombAt(p0, v0, hi, new THREE.Vector3()) };
      }
      tPrev = t;
    }
    return null;
  }
  // CCIP: impact point of the next bomb if released this instant.
  function updateCCIP() {
    if (C.weapon !== 'BOMB' || C.bombs <= 0 || C.bombReload > 0) { C.ccip = null; return; }
    const st = stores.bomb.find(b => b.node.visible);
    const p0 = st ? st.node.getWorldPosition(new THREE.Vector3()) : S.position.clone();
    const v0 = S.velocity.clone().addScaledVector(new THREE.Vector3(0, -1, 0).applyQuaternion(S.quaternion), BOMB_EJECT);
    const hit = solveImpact(p0, v0);
    C.ccip = hit ? hit.p : null; C.ccipTof = hit ? hit.t : 0;
    // CCRP: with a surface target designated, steer the impact point onto it along
    // track; release when the along-track miss crosses zero (cue bar meets the FPV).
    autoGroundTarget();
    const g = C.groundTgt;
    const vh = new THREE.Vector2(S.velocity.x, S.velocity.z), gs = vh.length();
    if (!g || !hit || gs < 40) { C.ccrp = null; C.ccrpArmed = false; ccrpPrev = null; return; }
    vh.divideScalar(gs);
    // Moving targets (the destroyer) are led by the bomb's time of fall.
    const lead = g.vel ? hit.t : 0;
    const dx = g.pos.x + (g.vel ? g.vel.x * lead : 0) - hit.p.x, dz = g.pos.z + (g.vel ? g.vel.z * lead : 0) - hit.p.z;
    const along = dx * vh.x + dz * vh.y, cross = dx * -vh.y + dz * vh.x;
    C.ccrp = { along, cross, ttr: along / gs, tgt: g, tof: hit.t, range: Math.hypot(g.pos.x - S.position.x, g.pos.z - S.position.z) };
    if (C.ccrpArmed && ccrpPrev !== null && ccrpPrev > 0 && along <= 0) {
      if (Math.abs(cross) < 60) {
        if (dropBomb()) { C.ccrpRelease = { along: +along.toFixed(1), cross: +cross.toFixed(1), tgt: g.label }; say('CCRP RELEASE — ' + g.label, 1.4); }
      } else say('CCRP — OFF STEERING LINE, NO RELEASE', 1.4, '#ffbf3f');
      C.ccrpArmed = false;
    }
    ccrpPrev = along;
  }
  let ccrpPrev = null;
  const _nose = new THREE.Vector3(), _dq = new THREE.Quaternion(), _id = new THREE.Quaternion();
  function updateBombs(dt) {
    for (let i = liveBombs.length - 1; i >= 0; i--) {
      const b = liveBombs[i];
      b.t += dt;
      bombAt(b.p0, b.v0, b.t, b.obj.position);
      b.vel.copy(b.v0).setY(b.v0.y - G0 * b.t);
      // Weathervane: the nose follows the velocity vector down the arc.
      _nose.set(0, 0, -1).applyQuaternion(b.obj.quaternion);
      _dq.setFromUnitVectors(_nose, b.vel.clone().normalize());
      b.obj.quaternion.premultiply(_id.identity().slerp(_dq, Math.min(1, dt * 1.6)));
      const pos = b.obj.position, g = groundLevel(pos.x, pos.z);
      if (pos.y <= g) {
        pos.y = g;
        detonateBomb(pos.clone(), terrainHeight(pos.x, pos.z) < 0);
        lastImpact = { name: b.name, p: pos.clone(), t: +b.t.toFixed(2) };
        scene.remove(b.obj);
        liveBombs.splice(i, 1);
      }
    }
  }
  // Shockwave rings (fixed pool, plain additive material).
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 4 }, () => {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    r.visible = false; r.frustumCulled = false; scene.add(r); return { r, t: 0, water: false };
  });
  let ringNext = 0;
  // Expanding shockwave ring (flat, or camera-facing for mid-air impacts).
  function shockRing(pos, color, air) {
    const ring = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
    ring.r.position.copy(pos).setY(pos.y + (air ? 0 : 1.5)); ring.t = 0; ring.water = !air && color === 0xdff4ff; ring.r.visible = true;
    ring.r.material.color.set(color);
    ring.air = !!air;
    if (air) ring.r.quaternion.copy(camera.quaternion).multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    else ring.r.quaternion.identity();
    return ring;
  }
  function detonateBomb(pos, water) {
    impactFx(pos, water, 1);
    // Blast: bandits caught low over the impact are destroyed.
    for (const e of enemies) if (e.alive && e.pos.distanceTo(pos) < BOMB_RADIUS) heavyHit(e);
    for (const t of surface) {                                   // Mk-82: lethal at the target, graded out to the blast radius
      if (!t.alive) continue;
      const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z);
      if (t.strike && d < STRIKE_SPLASH) { damageSurface(t, t.hpMax * 0.75); continue; }
      if (d < BOMB_RADIUS + t.r * 0.5) damageSurface(t, 160 * (1 - d / (BOMB_RADIUS + t.r * 0.5)) + 20);
    }
    // Weak points take blast damage without changing the ship's hull HP.
    for (let i = 0; i < SUB_TGT.length; i++) {
      const v = SUB_TGT[i];
      if (v.alive && v.ship && pos.distanceTo(subWorld(v.ship, _subW)) < SUB_HIT_R * 1.5) hitSub(v.ship, 2);
    }
    for (let i = 0; i < SITE_TGT.length; i++) if (SITE_ON[i] && RIM_SITES[i].distanceTo(pos) < SITE_HIT_R * 1.5) hitSite(i, 2);
    if (playerActiveNow && S.position.distanceTo(pos) < BOMB_RADIUS * 0.8) damagePlayer(30);
  }
  // Water geyser or ground fireball (bombs and crashing wrecks).
  function impactFx(pos, water, k) {
    shockRing(pos, water ? 0xdff4ff : 0xffd8a0, false);
    if (env.blast) {                                                 // pooled geyser / ground burst (Visual Pass 5)
      if (water) { env.blast.detonate(pos, 2.4 * k, { kind: 'water' }); if (env.onSfx) env.onSfx('bomb', pos, 0.8 * k); }
      else { explosion(pos, 2.4, { kind: 'ground' }); if (env.onSfx) env.onSfx('bomb', pos, k); }
      return;
    }
    if (water) {
      // Water geyser: tall white column, falling spray curtain, low mist.
      splash(pos, 2.4);
      for (let i = 0; i < 110; i++) {
        const a = rand() * Math.PI * 2, r = rand() * 6;
        smoke.spawn({ x: pos.x + Math.cos(a) * r, y: 1, z: pos.z + Math.sin(a) * r, vx: Math.cos(a) * (2 + rand() * 6), vy: 55 + rand() * 75, vz: Math.sin(a) * (2 + rand() * 6),
          life: 2.6 + rand() * 1.8, s0: 6, s1: 26 + rand() * 18, r: 0.95, g: 0.97, b: 1.0, a: 0.85, drag: 0.35, rise: -22 });
      }
      for (let i = 0; i < 40; i++) {
        const a = rand() * Math.PI * 2;
        smoke.spawn({ x: pos.x, y: 2, z: pos.z, vx: Math.cos(a) * (25 + rand() * 25), vy: 2 + rand() * 4, vz: Math.sin(a) * (25 + rand() * 25),
          life: 3 + rand() * 2, s0: 8, s1: 34, r: 0.88, g: 0.92, b: 0.96, a: 0.55, drag: 0.9, rise: 0.4 });
      }
      if (env.onSfx) env.onSfx('bomb', pos, 0.8 * k);
    } else {
      // Ground burst: big fireball, dust skirt, rising smoke column.
      explosion(pos, 2.4);
      for (let i = 0; i < 60; i++) {
        const a = rand() * Math.PI * 2, sp = 30 + rand() * 45;
        smoke.spawn({ x: pos.x, y: pos.y + 2, z: pos.z, vx: Math.cos(a) * sp, vy: 3 + rand() * 6, vz: Math.sin(a) * sp,
          life: 3.5 + rand() * 2, s0: 10, s1: 40 + rand() * 20, r: 0.42, g: 0.36, b: 0.3, a: 0.7, drag: 1.0, rise: 1.2 });
      }
      for (let i = 0; i < 40; i++) {
        const g = 0.08 + rand() * 0.06;
        smoke.spawn({ x: pos.x + (rand() - 0.5) * 10, y: pos.y + 5, z: pos.z + (rand() - 0.5) * 10, vx: (rand() - 0.5) * 6, vy: 18 + rand() * 22, vz: (rand() - 0.5) * 6,
          life: 6 + rand() * 4, s0: 14, s1: 60 + rand() * 30, r: g, g, b: g, a: 0.8, drag: 0.5, rise: 3 });
      }
      if (env.onSfx) env.onSfx('bomb', pos, k);
    }
  }
  function updateRings(dt) {
    for (const g of rings) {
      if (!g.r.visible) continue;
      g.t += dt;
      const k = g.t / 1.4;
      if (k >= 1) { g.r.visible = false; continue; }
      g.r.scale.setScalar(8 + 260 * Math.pow(k, 0.6));
      g.r.material.opacity = (1 - k) * (g.water ? 0.55 : 0.8);
    }
  }

  /* ================================================== flares and chaff */
  // X / G: six magnesium flares + chaff from the tail dispensers. FLR 4 -> 0,
  // +1 every 8 s. Bandit missiles within 1.2 NM of a burning flare roll once per
  // salvo: 85 % divert onto a flare ("MISSILE EVADED"). Dispensing also breaks
  // every bandit's seeker lock (bLock -> 0).
  const flares = [];
  const DISPENSERS = [new THREE.Vector3(-0.9, -0.55, 6.4), new THREE.Vector3(0.9, -0.55, 6.4)];
  const flareLights = Array.from({ length: 2 }, () => { const l = new THREE.PointLight(0xffe0a0, 0, 260, 1.8); scene.add(l); return l; });
  let flareCD = 0, flareRecharge = 0, flareSalvo = 0, playerActiveNow = false;
  const chaff = [];
  let chaffCD = 0, chaffRecharge = 0, chaffSalvo = 0;
  const CHAFF_CD = 0.5, CHAFF_RECHARGE = 10, CHAFF_LIFE = 4.5, CHAFF_DECOY_RANGE = 900;
  function dispenseFlares() {
    if (!env.isReady() || C.dead || C.flares <= 0 || flareCD > 0) return false;
    C.flares--; flareCD = 0.45; flareSalvo++;
    if (C.flares < FLR_MAX && flareRecharge <= 0) flareRecharge = FLR_RECHARGE;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(S.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(S.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
    for (let i = 0; i < FLR_PER_SALVO; i++) {
      const side = i % 2 ? 1 : -1;
      const pos = DISPENSERS[i % 2].clone().applyQuaternion(S.quaternion).add(S.position);
      const kick = new THREE.Vector3().addScaledVector(right, side * (10 + rand() * 14)).addScaledVector(up, -(6 + rand() * 10)).addScaledVector(fwd, -(2 + rand() * 4));
      const vel = S.velocity.clone().multiplyScalar(0.92).add(kick);
      flares.push({ pos, vel, kick, side: i % 2, age: -i * 0.07, life: 3.4 + rand() * 0.8, alive: true, isFlare: true, salvo: flareSalvo, emit: 0 });
    }
    for (let i = 0; i < 28; i++) {                      // hot orange flare sparks
      const p = DISPENSERS[i % 2].clone().applyQuaternion(S.quaternion).add(S.position);
      const v = S.velocity.clone().multiplyScalar(0.85).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(40));
      fire.spawn({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.35 + rand() * 0.45, s0: 0.9, s1: 0.5, r: 0.95, g: 0.5, b: 0.12, a: 0.8, drag: 2.6 });
    }
    for (const e of enemies) if (e.alive && e.pos.distanceTo(S.position) < 2500) e.bLock = 0;   // nearby seekers break lock
    say('FLARES — ' + C.flares + ' LEFT', 1.0, '#ffe0a0');
    if (env.onSfx) env.onSfx('flare', S.position, 1);
    return true;
  }
  // Z: chaff cartridge. One cartridge -> a slow foil cloud that decoys RADAR
  // seekers inside 900 m (one roll per cloud per missile).
  function dispenseChaff() {
    if (!env.isReady() || C.dead || C.chaff <= 0 || chaffCD > 0) return false;
    C.chaff--; chaffCD = CHAFF_CD;
    if (C.chaff < C.chaffMax && chaffRecharge <= 0) chaffRecharge = CHAFF_RECHARGE;
    const p = DISPENSERS[0].clone().applyQuaternion(S.quaternion).add(S.position);
    p.add(DISPENSERS[1].clone().applyQuaternion(S.quaternion).add(S.position)).multiplyScalar(0.5);
    const cloud = { pos: p, vel: S.velocity.clone().multiplyScalar(0.35), life: CHAFF_LIFE,
      isChaff: true, id: ++chaffSalvo };
    chaff.push(cloud);
    for (let i = 0; i < 90; i++) {
      fire.spawn({ x: p.x + (rand() - 0.5) * 6, y: p.y + (rand() - 0.5) * 4, z: p.z + (rand() - 0.5) * 6,
        vx: cloud.vel.x + (rand() - 0.5) * 14, vy: cloud.vel.y + (rand() - 0.5) * 8, vz: cloud.vel.z + (rand() - 0.5) * 14,
        life: 0.45 + rand() * 0.75, s0: 0.7, s1: 0.25, r: 0.7, g: 0.7, b: 0.7, a: 0.7, drag: 3 });
    }
    // Radar trackers beyond 2.5 km lose the picture (mirrors the flare rule close in).
    for (const e of enemies) if (e.alive && e.pos.distanceTo(S.position) > 2500) e.bLock = 0;
    say('CHAFF — ' + C.chaff + ' LEFT', 1.0, '#d8e4ee');
    if (env.onSfx) env.onSfx('chaff', S.position, 1);
    return true;
  }
  function updateChaff(dt) {
    chaffCD = Math.max(0, chaffCD - dt);
    if (C.chaff < C.chaffMax) {
      chaffRecharge -= dt;
      if (chaffRecharge <= 0) { C.chaff++; chaffRecharge = C.chaff < C.chaffMax ? CHAFF_RECHARGE : 0; }
    }
    for (let i = chaff.length - 1; i >= 0; i--) {
      const c = chaff[i];
      c.pos.addScaledVector(c.vel, dt); c.life -= dt;
      if (c.life <= 0) { chaff.splice(i, 1); continue; }
      for (const m of missiles) {
        if (!m.active || m.guidance !== 'RADAR' || !m.enemy || !m.target || !m.target.isPlayer || m.lostTrack) continue;
        if (m.chaffSalvo === c.id || m.mesh.position.distanceTo(c.pos) > CHAFF_DECOY_RANGE) continue;
        m.chaffSalvo = c.id;
        if (rand() < DIFF.chaffDecoyP) {
          m.target = c; m.lostTrack = false; m.losPrev.copy(c.pos).sub(m.mesh.position).normalize();
          C.decoyed = (C.decoyed || 0) + 1; C.score += 250;
          pushEvent('EVADED', 'CHAFF // RADAR DECOYED', 250, '#d8e4ee');
          say('CHAFF // RADAR DECOYED', 1.6, '#d8e4ee');
        }
      }
    }
  }
  function updateFlares(dt) {
    flareCD = Math.max(0, flareCD - dt);
    if (C.flares < FLR_MAX) {
      flareRecharge -= dt;
      if (flareRecharge <= 0) { C.flares++; flareRecharge = C.flares < FLR_MAX ? FLR_RECHARGE : 0; }
    }
    let lit = 0; const centre = [new THREE.Vector3(), new THREE.Vector3()], cnt = [0, 0];
    for (let i = flares.length - 1; i >= 0; i--) {
      const f = flares[i];
      f.age += dt;
      if (f.age < 0) {                                   // staggered ejection: ride the dispenser until fired
        f.pos.copy(DISPENSERS[f.side]).applyQuaternion(S.quaternion).add(S.position);
        f.vel.copy(S.velocity).multiplyScalar(0.92).add(f.kick);
        continue;
      }
      f.vel.multiplyScalar(Math.exp(-dt * 0.6)); f.vel.y -= G0 * 0.55 * dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.age > f.life || f.pos.y < groundLevel(f.pos.x, f.pos.z) || !f.alive) { f.alive = false; flares.splice(i, 1); continue; }
      const k = 1 - f.age / f.life;
      // Blinding magnesium core: one big short-lived additive point per frame, flickering.
      fire.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: f.vel.x, vy: f.vel.y, vz: f.vel.z, life: 0.05,
        s0: (16 + rand() * 10) * (0.55 + 0.45 * k), s1: 12, r: 1, g: 0.97, b: 0.85, a: 1, drag: 0 });
      f.emit += dt * 40;
      while (f.emit >= 1) {
        f.emit -= 1;
        const hot = rand();
        fire.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: f.vel.x * 0.3 + (rand() - 0.5) * 4, vy: f.vel.y * 0.3 + (rand() - 0.5) * 4, vz: f.vel.z * 0.3 + (rand() - 0.5) * 4,
          life: 0.18 + rand() * 0.16, s0: (5 + hot * 4) * (0.5 + 0.5 * k), s1: 1.5, r: 1, g: 0.9 + 0.1 * hot, b: 0.55 + 0.4 * hot, a: 1, drag: 1.5 });
        if (rand() < 0.45) smoke.spawn({ x: f.pos.x, y: f.pos.y, z: f.pos.z, vx: (rand() - 0.5) * 2, vy: (rand() - 0.5) * 2, vz: (rand() - 0.5) * 2,
          life: 4 + rand() * 2.5, s0: 2.5, s1: 16 + rand() * 8, r: 0.93, g: 0.93, b: 0.92, a: 0.55, drag: 0.9, rise: 0.8 });
      }
      const j = lit++ % 2; centre[j].add(f.pos); cnt[j]++;
    }
    flareLights.forEach((l, j) => {
      if (cnt[j]) { l.position.copy(centre[j].divideScalar(cnt[j])); l.intensity = 220 * (0.7 + 0.3 * rand()); } else l.intensity = 0;
    });
    // Decoy roll for bandit missiles near any burning flare (once per missile per salvo).
    for (const m of missiles) {
      if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.lostTrack) continue;
      const samDecoy = !!m.sam && !!m.samFlared;
      if (!samDecoy && m.guidance !== 'IR') continue;
      const near = flares.find(f => f.alive && !f.owner && f.age >= 0 && f.salvo !== m.flareSalvo && f.pos.distanceTo(m.mesh.position) < FLR_DECOY_RANGE);
      if (!near) continue;
      m.flareSalvo = near.salvo;
      if (rand() < DIFF.flareDecoyP) {
        m.target = near; m.losPrev.copy(near.pos).sub(m.mesh.position).normalize();
        C.decoyed = (C.decoyed || 0) + 1; C.score += 250;
        if (samDecoy) C.samFlared++;
        pushEvent('EVADED', 'MISSILE EVADED', 250, '#52ff9c');
        say('MISSILE EVADED', 1.8, '#4dff91');
      }
    }
  }

  /* ===================================================== surface targets */
  // Strike targets for >UGB: three SA-type SAM sites on flat island ground and
  // a destroyer cruising a wide circle in deep water. Destroyed by a bomb blast
  // (or sustained 20 mm), they burn and smoke, then the set respawns 40 s after
  // the last one dies. The APG-63 ground-map auto-designates the nearest one
  // ahead in >UGB; C cycles.
  const surface = [];
  const SURF_RESPAWN = 40;
  let surfRespawn = 0;
  function surfMat(hex, rough = 0.75, metal = 0.25) { return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }); }
  function buildSAM() {
    const g = new THREE.Group();
    const conc = surfMat(0x8d8a82, 0.95, 0), olive = surfMat(0x4b5233, 0.8, 0.2), dark = surfMat(0x2a2d2a, 0.6, 0.4), white = surfMat(0xd9dcd6, 0.5, 0.1);
    const mats = [conc, olive, dark, white];
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(16, 17, 0.8, 28), conc); pad.position.y = 0.4; g.add(pad);
    // Twin quad-tube launchers raised at 40 deg on turntables.
    for (const sx of [-6, 6]) {
      const tt = new THREE.Group(); tt.position.set(sx, 0.8, 2); g.add(tt);
      tt.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 6.2), olive).translateY(0.7));
      const rack = new THREE.Group(); rack.position.y = 1.8; rack.rotation.x = 0.7; tt.add(rack);
      for (const [x, y] of [[-0.6, 0], [0.6, 0], [-0.6, 1.0], [0.6, 1.0]]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 6.8, 12), olive); tube.rotation.x = Math.PI / 2; tube.position.set(x, y, 0); rack.add(tube);
        const cap = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), white); cap.position.set(x, y, -3.41); cap.rotation.y = Math.PI; rack.add(cap);
      }
    }
    // Search radar truck with a rotating dish.
    const truck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 7.5), olive); truck.position.set(0, 2.0, -8); g.add(truck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 5.5, 8), dark); mast.position.set(0, 5.9, -8); g.add(mast);
    const dish = new THREE.Group(); dish.position.set(0, 8.8, -8); g.add(dish);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.25, 20, 1, true), dark); d.rotation.x = Math.PI / 2 - 0.3; dish.add(d);
    dish.add(new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 0.3), dark));
    for (const [x, z] of [[-11, -2], [11, -4]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 5.2), olive); s.position.set(x, 1.8, z); g.add(s); }
    return { g, spin: dish, mats, r: 18, kind: 'SAM SITE', hp: 50 };
  }
  function buildDestroyer() {
    const g = new THREE.Group();
    const hullM = surfMat(0x5d666e, 0.7, 0.35), deckM = surfMat(0x3e4449, 0.85, 0.2), supM = surfMat(0x7b848b, 0.65, 0.3), darkM = surfMat(0x24282b, 0.6, 0.5);
    const mats = [hullM, deckM, supM, darkM];
    const L = 142, B = 16;
    const sh = new THREE.Shape();
    // Top-view outline, pointed bow at shape +y (-> world -Z after the -90 deg X rotation).
    sh.moveTo(0, L / 2); sh.quadraticCurveTo(B * 0.55, L * 0.18, B / 2, -L * 0.1); sh.lineTo(B / 2 - 0.6, -L / 2); sh.lineTo(-B / 2 + 0.6, -L / 2);
    sh.lineTo(-B / 2, -L * 0.1); sh.quadraticCurveTo(-B * 0.55, L * 0.18, 0, L / 2);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 9, bevelEnabled: false }), hullM);
    hull.rotation.x = -Math.PI / 2; hull.position.y = -5; g.add(hull);                     // shape y -> world -z, extrusion -> up
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(sh), deckM); deck.rotation.x = -Math.PI / 2; deck.position.y = 4.05; g.add(deck);
    const box = (w, h, d, x, y, z, m = supM) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
    box(11, 7, 22, 0, 7.5, -12); box(8, 5, 12, 0, 13.5, -14); box(9, 6, 26, 0, 7, 22);               // bridge + aft superstructure
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 8, 12), darkM); funnel.position.set(0, 12, 6); g.add(funnel);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 18, 8), darkM); mast.position.set(0, 24, -12); g.add(mast);
    const spin = new THREE.Group(); spin.position.set(0, 31, -12); g.add(spin);
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 0.5), darkM));
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 2.6, 14), supM); turret.position.set(0, 5.6, -44); g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 7, 8), darkM); barrel.rotation.x = Math.PI / 2 - 0.15; barrel.position.set(0, 6.2, -48); g.add(barrel);
    box(5, 1.6, 7, 0, 4.9, -30, darkM);                                                                // VLS cells
    return { g, spin, mats, r: 46, kind: 'DESTROYER', hp: 100, ship: true };
  }
  // Jammer bunker geometry is built ONCE and shared by all four sites. Materials are
  // per-site (destroySurface darkens t.mats on death), so one kill cannot black out the rest.
  const STRIKE_GEO = {
    bunker: new THREE.BoxGeometry(14, 5, 10), roof: new THREE.BoxGeometry(15, 1.2, 11),
    mast: new THREE.CylinderGeometry(0.4, 0.6, 18, 6), cross: new THREE.BoxGeometry(6, 0.3, 0.3),
    barge: new THREE.BoxGeometry(30, 8, 30)
  };
  const strikeTargets = [];
  function buildStrikeTgt(i) {
    const g = new THREE.Group();
    const conc = surfMat(0x5a5e57, 0.92, 0.08), steel = surfMat(0x8d918f, 0.7, 0.3);
    const bunker = new THREE.Mesh(STRIKE_GEO.bunker, conc); bunker.position.y = 2.5; g.add(bunker);
    const roof = new THREE.Mesh(STRIKE_GEO.roof, conc); roof.position.y = 5.4; roof.rotation.x = -0.14; g.add(roof);
    const mast = new THREE.Mesh(STRIKE_GEO.mast, steel); mast.position.set(0, 14, 0); g.add(mast);
    const cross = new THREE.Mesh(STRIKE_GEO.cross, steel); cross.position.set(0, 20.5, 0); g.add(cross);
    const hp = Math.round(STRIKE_HP_K * 50);                 // SAM SITE hp (buildSAM)
    const t = { g, mats: [conc, steel], matHex: [0x5a5e57, 0x8d918f], r: 12, kind: 'STRIKE_TGT',
      label: 'JAMMER-0' + (i + 1), hp, hpMax: hp, strike: true };
    strikeTargets.push(t);
    return t;
  }
  function strikeAlive() { for (let i = 0; i < strikeTargets.length; i++) if (strikeTargets[i].alive) return true; return false; }
  const JAM_C = (() => {
    const cc = env.canyonCenter || { x: -5600, z: -8200 }, b = env.bridges && env.bridges[0];
    const mid = b ? b.a.clone().lerp(b.b, 0.5) : { x: 0, z: 0 };
    return [{ x: cc.x, z: cc.z }, { x: mid.x, z: mid.z }];
  })();
  function siteSpots() {
    const r = (() => { let a = 90731; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const cx = env.terrainCenter.x, cz = env.terrainCenter.z, land = [];
    let sea = null;
    // Island SAM sites: on SEC-02 Bridge Strait ground first (headlands / coasts), else anywhere.
    const inStrait = (x, z) => !env.sectorAt || env.sectorAt(x, z).id === 2;
    for (let i = 0; i < 8000 && (land.length < 3 || !sea); i++) {
      const a = r() * Math.PI * 2, d = 1500 + r() * 9000, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const h = terrainHeight(x, z);
      if (land.length < 3 && h > 12 && h < 260 && (i > 6000 || inStrait(x, z))) {
        let flat = true;
        for (const [ox, oz] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) if (Math.abs(terrainHeight(x + ox, z + oz) - h) > 6) flat = false;
        if (flat && land.every(p => Math.hypot(p.x - x, p.z - z) > 2600)) land.push({ x, z, h });
      }
      if (!sea && d > 5000) {
        let deep = true;
        for (const [ox, oz] of [[0, 0], [600, 0], [-600, 0], [0, 600], [0, -600]]) if (terrainHeight(x + ox, z + oz) > -25) deep = false;
        if (deep) sea = { x, z };
      }
    }
    return { land, sea };
  }
  // Land targets (SAM sites + SEC-02 coastal flak nests); the naval task force is
  // managed separately (spawnFleet) and kept in the same `surface` list.
  function spawnSurface() {
    if (C.mcfg.enemyMsl === false && C.mcfg.wingmen === 'NONE') return;
    for (let i = surface.length - 1; i >= 0; i--) if (!surface[i].fleet && !surface[i].strike) { scene.remove(surface[i].g); surface.splice(i, 1); }
    const { land } = siteSpots();
    land.forEach((p, i) => {
      const t = buildSAM();
      t.g.position.set(p.x, p.h, p.z); t.g.rotation.y = i * 1.7;
      Object.assign(t, { pos: new THREE.Vector3(p.x, p.h + 2, p.z), alive: true, burn: 0, label: 'SAM ' + (i + 1), id: 'S' + (i + 1) });
      scene.add(t.g); surface.push(t);
    });
    // Coastal flak nests on the bridge headlands, 260 m inland from each abutment.
    let n = 0;
    for (const b of env.bridges || []) {
      for (const [a, o] of [[b.a, b.b], [b.b, b.a]]) {
        const dx = a.x - o.x, dz = a.z - o.z, l = Math.hypot(dx, dz) || 1, x = a.x + dx / l * 260, z = a.z + dz / l * 260, h = terrainHeight(x, z);
        if (h < 4) continue;
        const t = buildFlak();
        t.g.position.set(x, h, z);
        Object.assign(t, { pos: new THREE.Vector3(x, h + 2, z), alive: true, burn: 0, label: 'AAA ' + (++n), id: 'F' + n, flakCD: rand() * 2 });
        scene.add(t.g); surface.push(t);
      }
    }
    // Strike jammers spawn once per sortie: never re-created by the 40 s surface respawn.
    if (!surface.some(t => t.strike)) {
      for (let i = 0; i < STRIKE_N; i++) {
        const t = buildStrikeTgt(i);
        let x, y, z;
        if (i < 2) {                                          // canyon floor: flat bank inside 260 m of the gorge centreline
          z = i === 0 ? -6400 : -7600;
          const cx = env.canyonX ? env.canyonX(z) : -5600;
          let found = false;
          for (let d = 0; d <= 260 && !found; d += 10) {
            const sides = d === 0 ? [1] : [1, -1];
            for (const s of sides) {
              const px = cx + s * d, h = terrainHeight(px, z);
              if (h < 1 || h > 25) continue;
              const slope = Math.hypot(terrainHeight(px + 12, z) - terrainHeight(px - 12, z),
                terrainHeight(px, z + 12) - terrainHeight(px, z - 12)) / 24;
              if (slope >= 0.35) continue;
              x = px; y = h; found = true; break;
            }
          }
          if (!found) {                                       // gorge water: pooled 30x8x30 grey barge
            x = cx; y = 8;
            const barge = new THREE.Mesh(STRIKE_GEO.barge, surfMat(0x808080, 0.85, 0.1));
            barge.position.y = -4; t.g.add(barge); t.mats.push(barge.material); t.matHex.push(0x808080);
          }
        } else {                                              // Bridge Strait main span: pier footings, 30 m inboard
          const b = env.bridges && env.bridges[0], tw = b && b.towers[i - 2];
          if (tw) {
            const mid = b.a.clone().lerp(b.b, 0.5), dx = mid.x - tw.x, dz = mid.z - tw.z, l = Math.hypot(dx, dz) || 1;
            x = tw.x + dx / l * 30; z = tw.z + dz / l * 30;
          } else { x = -2700; z = -3900; }
          y = 6;                                              // pier top
        }
        t.g.position.set(x, y, z);
        Object.assign(t, { pos: new THREE.Vector3(x, y + 2, z), alive: true, burn: 0, id: 'J' + (i + 1) });
        scene.add(t.g); surface.push(t);
      }
    }
    if (C.groundTgt && !surface.includes(C.groundTgt)) C.groundTgt = null;
  }
  function destroySurface(t) {
    if (!t.alive) return;
    t.alive = false; t.burn = t.fleet ? 70 : 45;
    for (const m of t.mats) m.color.multiplyScalar(0.28);
    explosion(t.pos, t.ship ? 3.2 : 2.4, { kind: t.ship ? 'ship' : 'ground' });
    // Persistent oil-fire column (ambient.js). FORT claims two and gets a fire burst.
    if (env.onSmoke) env.onSmoke(t.pos, t.kind === 'FORT' ? 2 : 1);
    const pts = t.strike ? STRIKE_PTS : t.kind === 'CARRIER' ? 6000 : t.ship ? 2500 : t.kind === 'FLAK' ? 800 : 1200;
    C.score += pts; C.kills++;
    pushEvent('DESTROYED', `${t.kind} ${t.label} ${t.ship ? 'SUNK' : 'DESTROYED'}`, pts, '#52ff9c');
    say(t.kind === 'CARRIER' ? 'CARRIER IS GOING DOWN — MASSIVE SECONDARIES!' : t.ship ? 'SHACK! DESTROYER IS GOING DOWN'
      : t.kind === 'FLAK' ? 'SHACK! FLAK NEST SILENCED' : 'SHACK! SAM SITE DESTROYED', 2.4);
    if (t.fleet) {
      t.secondaries = t.kind === 'CARRIER' ? [0.5, 1.1, 1.8, 2.6, 3.5, 4.6, 6.0, 7.6] : [0.6, 1.4, 2.5, 3.9];
      if (C.designated === t) designate(null);
      if (env.onRadio) env.onRadio(fleetAlive() ? 'SHIP_SUNK' : 'FLEET_SUNK', { kind: t.kind });
    }
    if (t.strike) {
      if (env.onTele) env.onTele('STRIKE_KILL', t.pos);
      pushEvent('DESTROYED', (t.kind === 'FORT' ? 'BUNKER DOWN // ' : 'JAMMER DOWN // ') + t.label, STRIKE_PTS, '#ffbf3f');
      if (t.kind === 'FORT') {
        C.ceil.live = false; C.climb.on = true; C.climb.t = CLIMB_WALL_T; C.climb.sams = 0;
        C.climb.salvoT = 0; C.climb.rail = 0; C.climb.railT = 0;
        if (env.onWing) env.onWing('SAM WALL — FLARES, FLARES!', 'WARDEN-2');
        C.climbBanner = performance.now();
        if (env.onSlowMo) env.onSlowMo();
        if (env.onRadio) env.onRadio('CLIMB_OUT');
        if (env.debug) console.log('[ANGELS_ZERO] fort destroyed // climb out');
      }
      if (env.onSlowMo) env.onSlowMo();
      if (!strikeAlive()) { C.strikeDoneT = performance.now(); say('[ STRIKE COMPLETE // JAMMERS DOWN ]', 3, '#ffd45a'); }
    }
    if (C.groundTgt === t) { C.groundTgt = null; C.ccrpArmed = false; }
    awardStyle('KILL');
    C.killFlash = { t: performance.now(), mult: C.comboMult };
  }
  function damageSurface(t, n) {
    if (!t.alive) return;
    if (t.ship && t.hpMax === undefined) t.hpMax = t.hp;
    t.hp -= n;
    if (t.ship && !t.smokeClaimed && t.hpMax && t.hp > 0 && t.hp < t.hpMax * 0.5) {
      t.smokeClaimed = true;
      if (env.onSmoke) env.onSmoke(t.pos, 1);
    }
    if (t.fleet) fleetProvoked = true;
    if (t.fleet && !fleetHitSaid && n >= 20) { fleetHitSaid = true; if (env.onRadio) env.onRadio('FLEET_HIT'); }
    if (t.hp <= 0) destroySurface(t);
  }
  function updateSurface(dt) {
    // Keep pooled weak-point targets in sync before any hit test this frame.
    for (let i = 0; i < SUB_TGT.length; i++) {
      const v = SUB_TGT[i];
      if (v.ship && v.ship.alive && v.ship.sub.on) { subWorld(v.ship, v.pos); v.alive = true; }
      else { v.alive = false; v.ship = null; }
    }
    for (let i = 0; i < SITE_TGT.length; i++) SITE_TGT[i].alive = SITE_ON[i] === 1;
    let anyAlive = false;
    for (const t of surface) {
      if (t.spin) t.spin.rotation.y += dt * (t.alive ? 1.6 : 0);
      if (t.ship) {
        if (t.alive && t.fleet) { /* formation steaming: updateFleet() */ }
        else if (t.alive) {
          t.ang += dt * t.speed / t.orbitR;
          t.pos.set(t.center.x + Math.cos(t.ang) * t.orbitR, 0, t.center.z + Math.sin(t.ang) * t.orbitR);
          t.vel.set(-Math.sin(t.ang) * t.speed, 0, Math.cos(t.ang) * t.speed);
          t.g.position.copy(t.pos); t.g.rotation.y = Math.PI - t.ang;              // bow (-Z local) along the direction of travel
          if (rand() < dt * 6) {                                                    // bow wave / stern wake foam
            const back = new THREE.Vector3(0, 0, 71).applyQuaternion(t.g.quaternion).add(t.pos);
            smoke.spawn({ x: back.x + (rand() - 0.5) * 10, y: 1, z: back.z + (rand() - 0.5) * 10, vx: 0, vy: 0.3, vz: 0, life: 6, s0: 8, s1: 26, r: 0.92, g: 0.95, b: 0.97, a: 0.45, drag: 0.2 });
          }
        } else {                                                                    // listing and settling
          t.sink = Math.min(t.sink + dt * 0.5, t.sinkMax || 14); t.vel.set(0, 0, 0);
          t.g.position.y = -t.sink; t.g.rotation.z = Math.min(0.32, t.sink * 0.03);
          if (t.wake) t.wake.position.y = 0.6 + t.sink;                       // wake stays on the surface
        }
      }
      if (t.alive && !t.strike) anyAlive = true;                // jammers don't gate the 40 s SAM / AAA respawn
      else if (t.burn > 0) {
        t.burn -= dt;
        if (rand() < dt * 14) fire.spawn({ x: t.pos.x + (rand() - 0.5) * t.r, y: t.pos.y + 3, z: t.pos.z + (rand() - 0.5) * t.r, vx: 0, vy: 6, vz: 0,
          life: 0.7 + rand() * 0.5, s0: 6, s1: 14, r: 1, g: 0.5 + rand() * 0.3, b: 0.12, a: 0.85, drag: 1.2 });
        if (rand() < dt * 10) { const gg = 0.07 + rand() * 0.05; smoke.spawn({ x: t.pos.x + (rand() - 0.5) * t.r * 0.6, y: t.pos.y + 5, z: t.pos.z + (rand() - 0.5) * t.r * 0.6,
          vx: (rand() - 0.5) * 3, vy: 10 + rand() * 6, vz: (rand() - 0.5) * 3, life: 8 + rand() * 4, s0: 12, s1: 70, r: gg, g: gg, b: gg, a: 0.75, drag: 0.4, rise: 2 }); }
      }
    }
    // Staged missions (NAVAL / CANYON / ACE) own every surface target: no legacy
    // 40 s jammer / task-force respawn, which used to resurrect ships in ACE_DUEL.
    if (surface.length && !anyAlive && !stagedMission()) {
      surfRespawn += dt;
      if (surfRespawn > SURF_RESPAWN) { surfRespawn = 0; spawnSurface(); spawnFleet(); say('NEW STRIKE TARGETS ON THE GROUND MAP', 2.5); }
    } else surfRespawn = 0;
  }
  // Ground-map designation for >UGB: nearest live target within 45 deg of the
  // flight path and 25 km. cycle=true picks the next one by range.
  const _gcPool = Array.from({ length: 64 }, () => ({ t: null, d: 0, ang: 0 })), _gcOut = [];
  const _gcV = { x: 0, z: 0 };
  function groundCandidates() {
    _gcOut.length = 0;
    const mp = env.getMapProps && env.getMapProps();
    if (mp && !mp.islands && !mp.terrain) return _gcOut;
    _gcV.x = S.velocity.x; _gcV.z = S.velocity.z;
    let vl = Math.hypot(_gcV.x, _gcV.z);
    if (vl < 1) { _gcV.x = 0; _gcV.z = -1; vl = 1; }
    _gcV.x /= vl; _gcV.z /= vl;
    let n = 0;
    const add = t => {
      if (!t || !t.alive || n >= _gcPool.length) return;
      const dx = t.pos.x - S.position.x, dz = t.pos.z - S.position.z, d = Math.hypot(dx, dz);
      if (d > 25000) return;
      const ang = Math.acos(clamp((dx * _gcV.x + dz * _gcV.z) / Math.max(d, 1), -1, 1));
      if (ang > 45 * D2R) return;
      const c = _gcPool[n++]; c.t = t; c.d = d; c.ang = ang;
    };
    for (const t of surface) add(t);
    // Linked weak points become ground-designatable virtual targets.
    for (let i = 0; i < SUB_TGT.length; i++) {
      const v = SUB_TGT[i];
      if (v.ship && v.ship.alive && v.ship.sub.on) { subWorld(v.ship, v.pos); v.alive = true; }
      else { v.alive = false; v.ship = null; }
      add(v);
    }
    const canyon = !!(C.mcfg && C.mcfg.ceiling);
    for (let i = 0; i < SITE_TGT.length; i++) {
      const v = SITE_TGT[i];
      v.alive = canyon && SITE_ON[i] === 1;
      if (v.alive) add(v);
    }
    // Insertion sort, strike targets first then by range (no array allocations).
    for (let i = 1; i < n; i++) {
      const c = _gcPool[i]; let j = i - 1;
      while (j >= 0 && ((_gcPool[j].t.strike ? 1 : 0) < (c.t.strike ? 1 : 0) ||
        ((_gcPool[j].t.strike ? 1 : 0) === (c.t.strike ? 1 : 0) && _gcPool[j].d > c.d))) { _gcPool[j + 1] = _gcPool[j]; j--; }
      _gcPool[j + 1] = c;
    }
    for (let i = 0; i < n; i++) _gcOut.push(_gcPool[i]);
    return _gcOut;
  }
  function autoGroundTarget() {
    const g = C.groundTgt;
    if (g && g.alive) {
      // Keep it while it is still ahead of the 3-9 line; once overflown, re-pick.
      const dx = g.pos.x - S.position.x, dz = g.pos.z - S.position.z;
      if (dx * S.velocity.x + dz * S.velocity.z > 0 || C.ccrpArmed) return;
    }
    const c = groundCandidates();
    C.groundTgt = c.length ? c[0].t : null;
  }
  function cycleGroundTarget() {
    const c = groundCandidates();
    if (!c.length) { C.groundTgt = null; say('NO SURFACE TARGET AHEAD', 1.0, '#ffbf3f'); return null; }
    const i = c.findIndex(x => x.t === C.groundTgt);
    C.groundTgt = c[(i + 1) % c.length].t; C.ccrpArmed = false;
    say('GROUND TGT — ' + C.groundTgt.kind + ' ' + C.groundTgt.label, 1.1);
    return C.groundTgt;
  }

  /* ========================================= naval task force (SEC-04) */
  // Enemy carrier strike group: 1 CVN (angled flight deck, island with a turning
  // radar, parked jets, 4 CIWS mounts, 2 SAM launchers) + 3 DDG escorts steaming a
  // racetrack along the SW patrol lane in formation at ~25 kt. Each hull is merged
  // per material (a few draw calls per ship); animated Kelvin bow waves, hull-side
  // foam and turbulent stern wakes come from one wake shader per ship on the sea.
  // Ships are surface targets (UGB / gun) AND lockable targets (MSL / 4AAM): multi-
  // hit HP, smoke below 66 %, deck fires below 33 %, secondary magazine explosions
  // and a list / settle when sunk. Defences (no fire while the player is in the
  // low-alt / base safe zone, or terrain-masked): CIWS tracer streams < 2.4 km, AAA
  // flak bursts < 4.8 km, shipborne SAMs < 7.5 km (max 2 in the air).
  const taskForce = [];
  const lockList = [];
  const FLEET_SPEED = 13, FLEET_A = 3500, FLEET_B = 1000, WAKE_L = 760;
  const SLOTS = [{ kind: 'CVN', along: 0, lat: 0 }, { kind: 'DDG', along: 950, lat: 0 }, { kind: 'DDG', along: -700, lat: -760 }, { kind: 'DDG', along: -700, lat: 760 }];
  const SAM_Q = { turn: SAM_G * D2R, fov: 60 * D2R, N: 3.5, noise: 0.12, tag: 'SAM' };
  let fleetTh = 0, fleetClock = 0, fleetSpotted = false, fleetHitSaid = false;
  const _fu = new THREE.Vector3(), _fn = new THREE.Vector3(), _fp = new THREE.Vector3(), _ft = new THREE.Vector3(), _flat = new THREE.Vector3();
  const _da = new THREE.Vector3(), _db = new THREE.Vector3(), _dv = new THREE.Vector3();
  const occluded = (a, b) => !!(env.isTerrainOccluded && env.isTerrainOccluded(a, b));

  function fleetCenter(out) {
    const L = env.fleetLane;
    return L ? out.copy(L.a).add(L.b).multiplyScalar(0.5) : out.set(-6000, 0, 3000);
  }
  function fleetAlive() { return taskForce.some(t => t.alive); }
  // Every enemy the radar / seekers may track: bandits + live task-force ships + drones.
  function lockables() {
    lockList.length = 0;
    for (const e of enemies) lockList.push(e);
    for (const t of taskForce) if (t.alive) lockList.push(t);
    for (let i = 0; i < DRONE_N; i++) if (DR_ALIVE[i]) lockList.push(DRONE_TGT[i]);
    return lockList;
  }

  // Merge every static mesh of a ship group into one mesh per material (keeps `keep` subtrees live).
  function mergeStatic(g, keep = []) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), byMat = new Map(), drop = [], m4 = new THREE.Matrix4();
    g.traverse(o => {
      if (!o.isMesh) return;
      for (let p = o; p && p !== g; p = p.parent) if (keep.includes(p)) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      geo.clearGroups();
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(geo);
      drop.push(o);
    });
    for (const o of drop) o.parent.remove(o);
    for (const [m, list] of byMat) g.add(new THREE.Mesh(mergeGeometries(list), m));
  }

  function buildCarrier() {
    const g = new THREE.Group();
    const hullM = surfMat(0x59626a, 0.72, 0.3), deckM = surfMat(0x2c3034, 0.92, 0.08), supM = surfMat(0x737c84, 0.65, 0.3),
      darkM = surfMat(0x1d2124, 0.6, 0.5), lineM = surfMat(0xe6e4da, 0.8, 0.05), yelM = surfMat(0xd2ac36, 0.7, 0.1), jetM = surfMat(0x6a7178, 0.55, 0.45);
    const mats = [hullM, deckM, supM, darkM, lineM, yelM, jetM];
    const L = 300, B = 40, DECK = 16;
    const sh = new THREE.Shape();                               // top outline: flared bow (+y -> world -Z), square transom
    sh.moveTo(0, L / 2); sh.quadraticCurveTo(B * 0.5, L * 0.32, B / 2, L * 0.05); sh.lineTo(B / 2, -L / 2); sh.lineTo(-B / 2, -L / 2);
    sh.lineTo(-B / 2, L * 0.05); sh.quadraticCurveTo(-B * 0.5, L * 0.32, 0, L / 2);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: DECK + 8, bevelEnabled: false }), hullM);
    hull.rotation.x = -Math.PI / 2; hull.position.y = -8; g.add(hull);
    const box = (w, h, d, x, y, z, m, ry = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.y = ry; g.add(b); return b; };
    // Flight deck: main deck + 9 deg angled landing deck sponson to port.
    box(64, 1.4, 318, 3, DECK + 0.7, -4, deckM);
    box(34, 1.4, 205, -27, DECK + 0.7, 30, deckM, 0.157);
    // Deck markings: angled-deck centreline + edge lines, bow catapult tracks, foul lines.
    for (let k = 0; k < 14; k++) box(1.2, 0.2, 7, -27 + Math.sin(0.157) * (-80 + k * 14), DECK + 1.5, 30 + Math.cos(0.157) * (-80 + k * 14), lineM, 0.157);
    for (const s of [-1, 1]) box(0.8, 0.2, 200, -27 + s * 16 * Math.cos(0.157), DECK + 1.5, 30 - s * 16 * Math.sin(0.157), lineM, 0.157);
    for (const x of [-8, 8]) box(0.7, 0.2, 90, x, DECK + 1.5, -110, darkM);
    box(60, 0.2, 0.8, 3, DECK + 1.5, -60, yelM); box(0.8, 0.2, 260, 18, DECK + 1.5, 0, yelM);
    // Deck-edge elevators.
    box(18, 1.0, 22, 32, DECK + 0.4, -20, darkM); box(18, 1.0, 22, 32, DECK + 0.4, 50, darkM); box(18, 1.0, 22, -36, DECK + 0.4, 95, darkM);
    // Island superstructure (starboard) + mast; the radar stays live (turns).
    box(11, 20, 40, 27, DECK + 10, 40, supM); box(9, 9, 26, 27, DECK + 24.5, 42, supM); box(9.2, 2.2, 10, 27, DECK + 21, 26, darkM);
    for (const z of [32, 52]) box(0.6, 6, 8, 21.5, DECK + 24, z, darkM);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 16, 8), darkM); mast.position.set(27, DECK + 37, 44); g.add(mast);
    const spin = new THREE.Group(); spin.position.set(27, DECK + 46, 44); g.add(spin);
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(9, 1.4, 0.6), darkM));
    // Parked strike fighters (fuselage + wing + fins).
    for (let k = 0; k < 7; k++) {
      const x = 22 - (k % 2) * 9, z = 95 + k * 13;
      box(2.6, 2.0, 16, x, DECK + 2.4, z, jetM, -0.5); box(11, 0.4, 5, x, DECK + 2.2, z + 1.5, jetM, -0.5); box(0.4, 2.6, 3.4, x, DECK + 4.2, z + 6, jetM, -0.5);
    }
    // CIWS domes on sponsons at the four corners + Sea Sparrow launcher boxes.
    const ciws = [], sams = [];
    for (const [x, z] of [[-31, -128], [31, -128], [-31, 132], [31, 132]]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.4, 3, 12), supM); base.position.set(x, DECK + 1.5, z); g.add(base);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lineM); dome.position.set(x, DECK + 3, z); g.add(dome);
      ciws.push(new THREE.Vector3(x, DECK + 4, z));
    }
    for (const [x, z] of [[-30, -100], [30, 118]]) { box(4, 3, 6, x, DECK + 2, z, supM); sams.push(new THREE.Vector3(x, DECK + 5, z)); }
    mergeStatic(g, [spin]);
    return { g, spin, mats, r: 150, kind: 'CARRIER', type: 'CVN', hp: 420, ship: true, fleet: true, len: L, beam: B, aimH: DECK, sinkMax: 26,
      ciws, sams, smokeAt: new THREE.Vector3(27, DECK + 30, 42) };
  }
  function destroyerShip() {
    const t = buildDestroyer();
    mergeStatic(t.g, [t.spin]);
    return Object.assign(t, { type: 'DDG', hp: 170, fleet: true, len: 142, beam: 16, aimH: 6, sinkMax: 14,
      ciws: [new THREE.Vector3(0, 14, 30)], sams: [new THREE.Vector3(0, 7, -30)], smokeAt: new THREE.Vector3(0, 16, 6) });
  }
  // Friendly CVN: same carrier geometry, but never a surface target / emitter.
  // Procedural ship is the default; the detailed GLB swaps in asynchronously later.
  const RETURN_Z = 8000, RETURN_CD = 25;
  let lastReturn = -1e9, prevReturnZ = S.position.z;
  const _allyScratch = new THREE.Vector3(), _lpLocal = new THREE.Vector3(), _allyInvQ = new THREE.Quaternion();
  const _allyBox = new THREE.Box3(), _allySize = new THREE.Vector3(), _allyCenter = new THREE.Vector3();
  const _ray = new THREE.Raycaster(), _rayDown = new THREE.Vector3(0, -1, 0), _rayOrigin = new THREE.Vector3();
  const _fbBox = new THREE.Box3();
  function fastBounds(obj, out) {
    out.makeEmpty();
    obj.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.boundingBox) return;
      _fbBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      out.union(_fbBox);
    });
    return out;
  }
  const _deckLightGeo = new THREE.SphereGeometry(0.65, 6, 4);
  const _deckLightMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, toneMapped: false, fog: false });
  const deckLightMesh = new THREE.InstancedMesh(_deckLightGeo, _deckLightMat, 32);
  deckLightMesh.renderOrder = 6; deckLightMesh.frustumCulled = false;
  const _dlM = new THREE.Matrix4(), _dlP = new THREE.Vector3(), _dlQ = new THREE.Quaternion(), _dlS = new THREE.Vector3(1, 1, 1);
  function placeAllyLights(g, scale, localDeckY) {
    const n = Math.min(16, Math.floor((CARRIER_LEN - 20) / 30));
    for (let i = 0; i < n * 2; i++) {
      const sp = i % 2 ? 1 : -1, zi = (Math.floor(i / 2) - (n - 1) / 2) * 30;
      _dlP.set(sp * (DECK_HALF_W - 1) / scale, localDeckY + 0.3 / scale, zi / scale);
      deckLightMesh.setMatrixAt(i, _dlM.compose(_dlP, _dlQ, _dlS));
    }
    deckLightMesh.count = n * 2;
    deckLightMesh.instanceMatrix.needsUpdate = true;
    g.add(deckLightMesh);
  }
  function buildAlliedCarrier() {
    const t = buildCarrier();
    mergeStatic(t.g, [t.spin]);
    t.g.name = 'CVN-ALLY';
    const R = env.runway || { x: 900, z1: 1600 };
    const startZ = R.z1 + 3000;
    t.g.position.set(R.x, 0, startZ);
    t.g.rotation.y = 0;                                   // bow / forward = local -Z = north
    scene.add(t.g);
    const pos = t.g.position, fwd = new THREE.Vector3(0, 0, -1), vel = new THREE.Vector3(0, 0, -4.1);
    placeAllyLights(t.g, 1, t.aimH);
    C.ally = { g: t.g, root: t.g, fwd, pos, vel, deckY: t.aimH, len: t.len, beam: t.beam,
      spin: t.spin, startZ, ciws: t.ciws, sams: t.sams, glb: false, island: null, yaw0: 0, deckLocalY: t.aimH,
      deckYLocal: { bow0: t.aimH, bow1: t.aimH, waist0: t.aimH, jbd: t.aimH, trap: t.aimH } };
    C.ally.glbMounted = false;                             // visibility has a single writer: stepAlly
    const cp = C.missionCarrier;
    if (cp) { pos.set(cp.pos[0], cp.pos[1], cp.pos[2]); C.ally.startZ = cp.pos[2]; }
    // Jet blast deflectors: one hinged plate per bow track, built once and never disposed.
    const jbdGeo = new THREE.BoxGeometry(11, 0.25, 4.5);
    jbdGeo.translate(0, 0, 2.25);                       // pivot on the deck-hinge edge
    const jbdMat = new THREE.MeshStandardMaterial({ color: 0x4a4d51, roughness: 0.9, metalness: 0.15 });
    C.ally.jbd = [];
    for (const trk of [CAT_BOW[0], CAT_BOW[1], CAT_WAIST[0]]) {
      const j = new THREE.Mesh(jbdGeo, jbdMat);
      j.position.set(trk.x, C.ally.deckY - pos.y, trk.z + CAT_JBD_DZ);
      j.rotation.x = 0;
      t.g.add(j); C.ally.jbd.push(j);
    }
    mountJbd(C.ally);
    return C.ally;
  }
  // The GLB swap replaces the carrier group; re-parent the shared JBD plates to it.
  function mountJbd(a) {
    if (!a || !a.jbd) return;
    const sc = a.g.scale.x || 1, inv = 1 / sc;
    const trks = [CAT_BOW[0], CAT_BOW[1], CAT_WAIST[0]];
    const deck = (a.deckYLocal && a.deckYLocal.jbd) || (a.deckY - a.pos.y);
    for (let i = 0; i < a.jbd.length; i++) {
      const j = a.jbd[i], trk = trks[i];
      j.visible = true; j.scale.setScalar(inv);
      j.position.set(trk.x * inv, deck * inv, (trk.z + CAT_JBD_DZ) * inv);
      a.g.add(j);
    }
  }
  // Damped JBD fold. `up` raises the plate during the catapult hold / stroke.
  function updateJbd(a, up, dt) {
    if (!a || !a.jbd) return;
    const target = up ? CAT_JBD_UP : 0;
    for (const j of a.jbd) j.rotation.x += (target - j.rotation.x) * Math.min(1, dt * 4);
  }
  // Return Line: twenty-one cyan pylons every kilometre across the southern edge.
  // Always in the scene so gpuWarm compiles the material, opacity pulses in update().
  const returnGeo = new THREE.CylinderGeometry(3, 3, 650, 8, 1, true);
  const returnMat = new THREE.MeshBasicMaterial({ color: 0x2fd8ff, transparent: true, opacity: 0.3, depthWrite: false, fog: true });
  const beacons = new THREE.InstancedMesh(returnGeo, returnMat, 21);
  beacons.frustumCulled = false; beacons.visible = true; scene.add(beacons);
  {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 21; i++) { p.set(-10000 + i * 1000, 325, RETURN_Z); m.compose(p, q, s); beacons.setMatrixAt(i, m); }
    beacons.instanceMatrix.needsUpdate = true;
  }
  // Async GLB swap: env.loadCarrier() fetches + precompiles the scene; everything
  // below (measurement, orientation, light placement) runs once, never per frame.
  async function loadCarrier(url) {
    const a = C.ally;
    if (!a || !env.loadCarrier) return false;              // keep carrierReady pending until init() builds the ally
    if (a.glb) { if (resolveCarrierReady) resolveCarrierReady(true); return true; }
    try {
      const glb = await env.loadCarrier(url);
      const old = a.g;
      const oldPos = a.pos.clone(), oldRotY = a.g.rotation.y;
      // (a) Mount the GLB under the persistent root immediately, before any measurement.
      const root = new THREE.Group();
      root.name = 'CVN-ALLY-ROOT';
      a.root = root;
      glb.position.set(0, 0, 0);
      root.add(glb); scene.add(root);
      console.assert(glb.parent === root && root === a.root, 'carrier GLB must be mounted under allyRoot');
      // One-time bounding/culling setup; stepAlly owns runtime visibility.
      glb.traverse(o => {
        if (!o.isMesh) return;
        if (o.geometry) {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        }
        o.frustumCulled = true; o.visible = true;
      });
      glb.scale.setScalar(CARRIER_SCALE);
      glb.updateMatrixWorld(true);
      // Align the hull's long axis to local Z (bow toward -Z) regardless of source axes.
      const hull = fastBounds(glb, new THREE.Box3());
      let size = hull.getSize(_allySize);
      if (size.x > size.z) { glb.rotation.y += Math.PI / 2; glb.updateMatrixWorld(true); }
      fastBounds(glb, hull); hull.getSize(_allySize);
      // The island sits near the stern: put it toward +Z so the bow faces -Z.
      let islZ = 0, islN = 0;
      glb.updateMatrixWorld(true);
      glb.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const pos = o.geometry.attributes.position, step = Math.max(1, pos.count >> 10);
        for (let i = 0; i < pos.count; i += step) {
          _allyScratch.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (_allyScratch.y > hull.max.y - 40) { islZ += _allyScratch.z; islN++; }
        }
      });
      if (islN && islZ / islN < 0) { glb.rotation.y += Math.PI; glb.updateMatrixWorld(true); }
      fastBounds(glb, hull); hull.getCenter(_allyCenter);
      glb.position.x -= _allyCenter.x; glb.position.z -= _allyCenter.z;
      glb.updateMatrixWorld(true);
      // Scale verification in root-local metres.
      fastBounds(glb, hull); hull.getSize(_allySize);
      const len = Math.max(_allySize.x, _allySize.z);
      if (len < 340 || len > 380) { glb.scale.multiplyScalar(CARRIER_LEN_M / len); glb.updateMatrixWorld(true); }
      // Root at sea level; the GLB keeps its natural draft as a local offset.
      root.position.copy(oldPos); root.position.y = 0;
      root.rotation.y = oldRotY;
      root.updateMatrixWorld(true);
      const rayAt = (x, z, label, quiet = false) => {
        _rayOrigin.set(x, 400, z); root.localToWorld(_rayOrigin);
        _ray.set(_rayOrigin, _rayDown);
        const cands = [];
        glb.traverse(o => {
          if (!o.isMesh || !o.geometry || !o.geometry.boundingBox) return;
          _fbBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
          if (_rayOrigin.x >= _fbBox.min.x - 1 && _rayOrigin.x <= _fbBox.max.x + 1 &&
              _rayOrigin.z >= _fbBox.min.z - 1 && _rayOrigin.z <= _fbBox.max.z + 1) cands.push(o);
        });
        const hs = cands.length ? _ray.intersectObjects(cands, false) : [];
        let y = -Infinity;
        for (const h of hs) {
          if (h.point.y > 400) continue;
          _allyScratch.copy(h.point); root.worldToLocal(_allyScratch);
          if (_allyScratch.y > y) y = _allyScratch.y;
        }
        if (!Number.isFinite(y)) { if (!quiet) console.log('[ANGELS_ZERO] deckRayMiss=' + label); return NaN; }
        return y;
      };
      const centre = [rayAt(0, -120, 'centre0'), rayAt(0, -60, 'centre1'), rayAt(0, 0, 'centre2'),
        rayAt(0, 60, 'centre3'), rayAt(0, 120, 'centre4')].filter(Number.isFinite).sort((x, y) => x - y);
      const medianY = centre.length ? centre[centre.length >> 1] : CARRIER_DECK_ASL;
      // Waterline: the deck sits 19 m above the sea, not the keel on the surface.
      glb.position.y += CARRIER_DECK_ASL - medianY;
      glb.updateMatrixWorld(true);
      const deckYLocal = Object.create(null);
      const tracks = [['bow0', CAT_BOW[0].x, CAT_BOW[0].z], ['bow1', CAT_BOW[1].x, CAT_BOW[1].z],
        ['waist0', CAT_WAIST[0].x, CAT_WAIST[0].z], ['jbd', CAT_BOW[0].x, CAT_BOW[0].z + CAT_JBD_DZ],
        ['trap', CAT_TRAP_X, CARRIER_LEN / 2 - 78]];
      for (const tr of tracks) {
        let y = tr[0] === 'waist0' ? rayAt(tr[1], tr[2], tr[0], true) : rayAt(tr[1], tr[2], tr[0]);
        if (!Number.isFinite(y) && tr[0] === 'waist0') y = rayAt(-14, tr[2], 'waist0');
        deckYLocal[tr[0]] = Number.isFinite(y) ? y : CARRIER_DECK_ASL;
      }
      a.deckYLocal = deckYLocal;
      a.deckY = CARRIER_DECK_ASL;
      a.deckLocalY = medianY / (glb.scale.y || 1);
      a.deckWorldY = CARRIER_DECK_ASL;
      fastBounds(glb, hull);
      if (hull.min.y > 0.5 || a.deckY < CARRIER_MIN_FREEBOARD) {
        console.log('[ANGELS_ZERO] carrier waterline FAIL', +hull.min.y.toFixed(2), +a.deckY.toFixed(2));
      }
      // Island hitbox from the starboard vertex bounds.
      let ix0 = Infinity, ix1 = -Infinity, iz0 = Infinity, iz1 = -Infinity, top = -Infinity;
      glb.updateMatrixWorld(true);
      glb.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const pos = o.geometry.attributes.position, step = Math.max(1, pos.count >> 11);
        for (let i = 0; i < pos.count; i += step) {
          _allyScratch.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (_allyScratch.x > 15) {
            ix0 = Math.min(ix0, _allyScratch.x); ix1 = Math.max(ix1, _allyScratch.x);
            iz0 = Math.min(iz0, _allyScratch.z); iz1 = Math.max(iz1, _allyScratch.z);
            if (_allyScratch.y > CARRIER_DECK_ASL) top = _allyScratch.y;
          }
        }
      });
      a.island = Number.isFinite(ix0) ? { x0: ix0 - 2, x1: ix1 + 2, z0: iz0 - 2, z1: iz1 + 2, y1: top + 2 } : null;
      a.yaw0 = oldRotY; a.g = glb; a.pos = root.position;
      a.len = CARRIER_LEN; a.glb = true; a.glbMounted = true; a.spin = null;
      root.updateMatrixWorld(true);                         // final ready condition
      mountJbd(a);
      placeAllyLights(glb, glb.scale.y, a.deckLocalY);
      if (old) {
        old.traverse(o => { if (o.isMesh) o.visible = false; });  // procedural hull hidden forever
        scene.remove(old);
      }
      for (let i = 0; i < mountCbs.length; i++) mountCbs[i](a);
      if (env.debug) console.log('[ANGELS_ZERO] carrier GLB mounted', JSON.stringify({ len: CARRIER_LEN, deckY: a.deckY, kids: glb.children.length }));
      if (resolveCarrierReady) resolveCarrierReady(true);
      return true;
    } catch (e) {
      console.warn('[ANGELS_ZERO] carrier GLB missing — procedural fallback', e && e.message);
      if (resolveCarrierReady) resolveCarrierReady(false);
      return false;
    }
  }
  // Two local-space hitboxes. No volume above the deck except the island, so the
  // landing lane over the angled deck and centreline stays clear.
  function allyCollision() {
    const a = C.ally;
    if (!a || C.carrierVisible === false) return false;
    _lpLocal.copy(S.position).sub(a.pos).applyQuaternion(_allyInvQ.copy(a.root.quaternion).invert());
    const y = _lpLocal.y;
    // Gear down / a live carrier state machine means this is a deck surface, not a wall.
    const onDeck = carrierActive() || S.gear >= 0.9 ||
      (Math.abs(_lpLocal.x) < 22 && Math.abs(y - CARRIER_DECK_Y) < 5.5 && S.velocity.length() * 1.94384 < 175);
    if (Math.abs(_lpLocal.x) <= DECK_HALF_W && Math.abs(_lpLocal.z) <= DECK_HALF_L && y < CARRIER_DECK_Y - 2 && !onDeck) return true;
    const i = a.island;
    if (i && y >= CARRIER_DECK_Y && y <= i.y1 && _lpLocal.x >= i.x0 && _lpLocal.x <= i.x1 && _lpLocal.z >= i.z0 && _lpLocal.z <= i.z1) return true;
    return false;
  }
  const carrierActive = () => !!(env.isCarrierActive && env.isCarrierActive());
  // Approach gates: one instanced frame mesh, always in scene so gpuWarm compiles it.
  const gateGeo = mergeGeometries([
    new THREE.BoxGeometry(60, 1.5, 1.5).translate(0, 15, 0),
    new THREE.BoxGeometry(60, 1.5, 1.5).translate(0, -15, 0),
    new THREE.BoxGeometry(1.5, 30, 1.5).translate(-30, 0, 0),
    new THREE.BoxGeometry(1.5, 30, 1.5).translate(30, 0, 0)
  ]);
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x00cc55, transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
  const gates = new THREE.InstancedMesh(gateGeo, gateMat, 6);
  gates.frustumCulled = false; gates.visible = true; scene.add(gates);
  const canyonGateMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: true });
  const canyonGates = new THREE.InstancedMesh(gateGeo, canyonGateMat, CANYON_GATE_N);
  canyonGates.frustumCulled = false; canyonGates.visible = false; scene.add(canyonGates);
  const _gateM = new THREE.Matrix4(), _gateP = new THREE.Vector3(), _gateQ = new THREE.Quaternion(),
    _gateE = new THREE.Euler(), _gateS = new THREE.Vector3(1, 1, 1);
  function updateGates(dt, now) {
    const a = C.ally;
    const spw = C.spw || '4AAM';
    const ammo = spw === '4AAM' ? C.aam4 : spw === 'UGB' ? C.bombs : C.qaam;
    const winchester = C.missiles === 0 && ammo === 0;
    const show = !!a && (env.ilsVisible ? env.ilsVisible() : true) && (100 - C.health > 45 || winchester || C.missionPhase === 4);
    if (a) {
      for (let i = 0; i < 3; i++) {
        const d = 400 * (i + 1);
        _gateP.copy(a.pos).addScaledVector(a.fwd, -a.len / 2 - d);
        _gateP.y = a.deckY + d * Math.tan(3.5 * D2R);
        _gateE.set(0, a.root.rotation.y, 0); _gateQ.setFromEuler(_gateE);
        _gateM.compose(_gateP, _gateQ, _gateS);
        gates.setMatrixAt(i, _gateM);
      }
    }
    // RWY 36 final: north-bound gates 400/800/1200 m beyond R.z1, 3 degree slope.
    const R = env.runway;
    if (R) {
      for (let i = 0; i < 3; i++) {
        const d = 400 * (i + 1);
        _gateP.set(R.x, R.elev + d * Math.tan(3 * D2R), R.z1 + d);
        _gateE.set(0, 0, 0); _gateQ.setFromEuler(_gateE);
        _gateM.compose(_gateP, _gateQ, _gateS);
        gates.setMatrixAt(3 + i, _gateM);
      }
    }
    gates.instanceMatrix.needsUpdate = true;
    const target = show ? 0.32 + 0.08 * Math.sin(now * 3) : 0;
    gateMat.opacity += (target - gateMat.opacity) * Math.min(1, dt * 3);
  }
  // Anchor the persistent carrier root to a mission's map definition before CATAPULT_HOLD.
  function placeCarrier(def) {
    const a = C.ally;
    if (!a || !def) return null;
    const root = a.root || a.g;
    const hdg = def.hdg || 0;
    root.position.set(def.pos[0], 0, def.pos[2]);          // root pinned to sea level; ignore def.pos[1]
    root.rotation.y = hdg;                                  // GLB keeps its own fitting orientation
    if (!a.cullDone) { root.traverse(o => { o.frustumCulled = false; }); a.cullDone = true; } // one-time, GLB root only
    a.startZ = def.pos[2];
    a.fwd.set(-Math.sin(hdg), 0, -Math.cos(hdg));
    a.vel.copy(a.fwd).multiplyScalar(def.spd || 4.1);
    root.updateMatrixWorld(true);
    return root;
  }
  function updateAlly(dt) {
    const a = C.ally;
    if (!a) return;
    const step = 4.1 * dt;
    a.pos.addScaledVector(a.fwd, step);
    const yaw0 = a.yaw0 || 0;
    // Never flip the ship 180 deg under a jet on the catapult, the wire or an autoland approach.
    if (C.allyHold) { a.vel.copy(a.fwd).multiplyScalar(4.1); if (a.spin) a.spin.rotation.z += dt * 0.6; return; }
    if (a.fwd.z < 0 && a.pos.z < a.startZ - 3000) {
      a.fwd.set(0, 0, 1); a.root.rotation.y = yaw0 + Math.PI;
    } else if (a.fwd.z > 0 && a.pos.z > a.startZ) {
      a.fwd.set(0, 0, -1); a.root.rotation.y = yaw0;
    }
    a.vel.copy(a.fwd).multiplyScalar(4.1);
    if (a.spin) a.spin.rotation.z += dt * 0.6;
  }

  // Wake: Kelvin arms (19.5 deg), bow crest, hull-side foam and a widening turbulent
  // stern wake whose foam texture is fixed to the water (scrolls with ship speed).
  const wakeGeoCache = new Map();
  function makeWake(t) {
    const W = 2 * (t.beam * 0.6 + 0.354 * WAKE_L + 12), key = t.len + 'x' + t.beam;
    if (!wakeGeoCache.has(key)) {
      const geo = new THREE.PlaneGeometry(W, WAKE_L, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -t.len / 2 + WAKE_L / 2);
      wakeGeoCache.set(key, geo);
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uSpeed: { value: FLEET_SPEED }, uLen: { value: t.len },
        uBeam: { value: t.beam }, uWL: { value: WAKE_L }, uW: { value: W }, uFade: { value: 1 }, uLight: { value: 1 } },
      vertexShader: `${LOG_V}#include <fog_pars_vertex>
        varying vec2 vUv;
        void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: `${LOG_F}#include <fog_pars_fragment>
        uniform float uTime, uSpeed, uLen, uBeam, uWL, uW, uFade, uLight;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main() {
          #include <logdepthbuf_fragment>
          float d = (1.0 - vUv.y) * uWL, x = (vUv.x - 0.5) * uW, ax = abs(x);
          vec2 q = vec2(x * 0.09, (d - uTime * uSpeed) * 0.05);
          float n = vn(q * 3.0) * 0.6 + vn(q * 7.3 + 4.1) * 0.4;
          float arm = uBeam * 0.45 + d * 0.354, armW = 1.5 + d * 0.03;
          float kelvin = exp(-pow((ax - arm) / armW, 2.0)) * exp(-d / 380.0) * smoothstep(0.0, 8.0, d);
          float bow = exp(-pow(ax / (uBeam * 0.7), 2.0)) * exp(-d / 18.0);
          float sd = d - uLen, sternW = uBeam * 0.55 + max(sd, 0.0) * 0.045;
          float stern = smoothstep(-10.0, 15.0, sd) * exp(-pow(ax / sternW, 2.0)) * exp(-max(sd, 0.0) / 520.0);
          float side = (1.0 - smoothstep(0.0, uLen, d)) * exp(-pow((ax - uBeam * 0.55) / 3.0, 2.0)) * 0.6;
          float foam = (kelvin * (0.55 + 0.6 * n) + bow * 0.9 + stern * (0.45 + 0.75 * n) + side * n) * uFade;
          float a = clamp(foam, 0.0, 0.92) * (1.0 - smoothstep(uWL * 0.8, uWL, d));
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.9, 0.94, 0.96) * uLight, a);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true
    });
    const m = new THREE.Mesh(wakeGeoCache.get(key), mat);
    m.position.y = 0.6; m.renderOrder = 2; m.frustumCulled = false;
    return m;
  }

  function spawnFleet() {
    for (const t of taskForce) { scene.remove(t.g); const i = surface.indexOf(t); if (i >= 0) surface.splice(i, 1); }
    taskForce.length = 0;
    let d = 0;
    SLOTS.forEach((sl, i) => {
      const t = sl.kind === 'CVN' ? buildCarrier() : destroyerShip();
      Object.assign(t, { slot: sl, alive: true, burn: 0, sink: 0, label: sl.kind === 'CVN' ? 'CVN 1' : 'DDG ' + (++d), id: sl.kind === 'CVN' ? 'CV1' : 'D' + d,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1), quat: t.g.quaternion, cloud: 0, hpMax: t.hp,
        ciwsT: rand() * 2, ciwsAcc: 0, flakCD: 1 + rand() * 2, samCD: 10 + rand() * 8, secondaries: null, secT: 0 });
      t.wake = makeWake(t); t.g.add(t.wake);
      scene.add(t.g); taskForce.push(t); surface.push(t);
    });
    fleetSpotted = false; fleetHitSaid = false; fleetProvoked = false;
    placeFleet(0);
  }
  // Racetrack (ellipse) along the patrol lane; ships hold their formation slot
  // relative to the guide's heading.
  function placeFleet(dt) {
    const L = env.fleetLane; if (!L) return;
    fleetCenter(_fp);
    _fu.copy(L.b).sub(L.a).setY(0).normalize(); _fn.set(-_fu.z, 0, _fu.x);
    const sp = Math.hypot(FLEET_A * Math.sin(fleetTh), FLEET_B * Math.cos(fleetTh));
    fleetTh += FLEET_SPEED * dt / Math.max(sp, 1);
    const c = Math.cos(fleetTh), s = Math.sin(fleetTh);
    _ft.copy(_fu).multiplyScalar(-FLEET_A * s).addScaledVector(_fn, FLEET_B * c).normalize();       // heading
    _flat.set(-_ft.z, 0, _ft.x);
    for (const t of taskForce) {
      if (!t.alive) continue;
      if (t.staged && t.stagePos) {
        t.g.position.copy(t.stagePos); t.g.rotation.set(0, Math.PI, 0);
        t.pos.set(t.stagePos.x, t.aimH, t.stagePos.z);
        t.vel.set(0, 0, 8); t.fwd.set(0, 0, 1);
        continue;
      }
      const x = _fp.x + _fu.x * FLEET_A * c + _fn.x * FLEET_B * s + _ft.x * t.slot.along + _flat.x * t.slot.lat;
      const z = _fp.z + _fu.z * FLEET_A * c + _fn.z * FLEET_B * s + _ft.z * t.slot.along + _flat.z * t.slot.lat;
      t.g.position.set(x, 0, z);
      t.g.rotation.set(0, Math.atan2(-_ft.x, -_ft.z), 0);
      t.pos.set(x, t.aimH, z); t.vel.copy(_ft).multiplyScalar(FLEET_SPEED); t.fwd.copy(_ft);
    }
  }
  const mountWorld = (t, local, out) => out.copy(local).applyQuaternion(t.g.quaternion).add(t.g.position);

  // Flak burst: black smoke puff + flash; lethal inside ~30 m.
  function flakBurst(p) {
    for (let k = 0; k < 2; k++) {
      const gg = 0.06 + rand() * 0.04;
      smoke.spawn({ x: p.x + (rand() - 0.5) * 6, y: p.y + (rand() - 0.5) * 6, z: p.z + (rand() - 0.5) * 6, vx: (rand() - 0.5) * 3, vy: (rand() - 0.5) * 3, vz: (rand() - 0.5) * 3,
        life: 3.2 + rand(), s0: 5, s1: 26 + rand() * 10, r: gg, g: gg, b: gg, a: 0.85, drag: 1.1 });
    }
    fire.spawn({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.14, s0: 9, s1: 20, r: 1, g: 0.7, b: 0.3, a: 0.95, drag: 0 });
    if (env.onSfx) env.onSfx('explosion', p, 0.3);
    if (playerActiveNow && !C.dead && S.position.distanceTo(p) < DIFF.flakRadius) { damagePlayer(DIFF.flakDmg); C.hitFlash = 0.12; }
  }
  const PLAYER_TGT = { pos: S.position, vel: S.velocity, alive: true, isPlayer: true };
  function samsInAir() { let n = 0; for (const m of missiles) if (m.active && m.sam) n++; return n; }
  // Surface-to-air launch from a mount: boost up and toward the player.
  function surfaceSAM(from, label, aim, lockDelay) {
    if (C.samLive >= CANYON_SAM_MAX) return false;
    if (aim) _dv.copy(aim).sub(from).normalize();
    else _dv.copy(S.position).sub(from).normalize().lerp(UP, 0.45).normalize();
    _q.setFromUnitVectors(MSL_NOSE, _dv);
    const m = launch(_da.copy(from), _q, _db.copy(_dv).multiplyScalar(SAM_V), PLAYER_TGT, true, SAM_Q, undefined, 'PN', 'SAM');
    if (!m) return false;
    m.sam = true; m.kind = 'SAM'; m.life = SAM_LIFE; m.samLabel = label;
    m.samFlared = rand() < 0.55;                          // one decoy decision per missile
    m.maskT = 0; m.homingDelay = lockDelay || 0;
    C.samLive++; C.samLaunched++;
    if (env.samPuff) env.samPuff(_da.copy(from));
    if (env.onSfx) env.onSfx('sam', null, C.samLive);
    say(`SAM LAUNCH — ${label}! BREAK!`, 2.0, '#ff4d3d');
    return true;
  }
  const hostileFireOk = () => playerActiveNow && !C.dead && !C.playerSafe;
  // Weapons-tight outside PHASE 2: the task force only opens fire once it is the
  // mission target, once attacked / locked by the player, or when overflown < 3 km.
  let fleetProvoked = false;
  const fleetWeaponsFree = dist => C.phase === 2 || fleetProvoked || dist < 3000;

  function updateFleet(dt) {
    if (C.mcfg && C.mcfg.noShips) return;                   // ACE_DUEL: no surface ships exist at all
    fleetClock += dt;
    placeFleet(dt);
    const fc = scene.fog ? scene.fog.color : null;
    const light = fc ? clamp(0.35 + 1.4 * (0.2126 * fc.r + 0.7152 * fc.g + 0.0722 * fc.b), 0.18, 1) : 1;
    const fire_ok = hostileFireOk();
    for (const t of taskForce) {
      const u = t.wake.material.uniforms;
      u.uTime.value = fleetClock; u.uLight.value = light;
      u.uFade.value += ((t.alive ? 1 : 0) - u.uFade.value) * Math.min(1, dt * 0.4);
      if (t.spin) t.spin.rotation.y += dt * (t.alive ? 1.2 : 0);
      if (!t.alive) {
        // Secondary magazine explosions rippling along the hull after the kill.
        if (t.secondaries && t.secondaries.length) {
          t.secT += dt;
          while (t.secondaries.length && t.secT >= t.secondaries[0]) {
            t.secondaries.shift();
            _da.set((rand() - 0.5) * t.beam, t.aimH * 0.6, (rand() - 0.5) * t.len * 0.8).applyQuaternion(t.g.quaternion).add(t.g.position);
            explosion(_da, 1.6 + rand() * 1.6, { kind: 'ship' }); shockRing(_da, 0xffd8a0, false);
          }
        }
        continue;
      }
      // Damage states: smoke column below 66 %, deck fires below 33 %.
      const k = t.hp / t.hpMax;
      if (k < 0.66 && rand() < dt * 7) {
        mountWorld(t, t.smokeAt, _da); const gg = 0.08 + rand() * 0.05;
        smoke.spawn({ x: _da.x, y: _da.y, z: _da.z, vx: (rand() - 0.5) * 2, vy: 8 + rand() * 5, vz: (rand() - 0.5) * 2, life: 7 + rand() * 3, s0: 8, s1: 46, r: gg, g: gg, b: gg, a: 0.7, drag: 0.4, rise: 1.5 });
      }
      if (k < 0.33 && rand() < dt * 14) {
        _da.set((rand() - 0.5) * t.beam * 0.8, t.aimH + 1, (rand() - 0.5) * t.len * 0.7).applyQuaternion(t.g.quaternion).add(t.g.position);
        fire.spawn({ x: _da.x, y: _da.y, z: _da.z, vx: 0, vy: 5, vz: 0, life: 0.6 + rand() * 0.4, s0: 5, s1: 12, r: 1, g: 0.5 + rand() * 0.3, b: 0.1, a: 0.85, drag: 1.2 });
      }
      if (!fire_ok) continue;
      const dist = t.pos.distanceTo(S.position);
      if (dist > 7600 || !fleetWeaponsFree(dist)) continue;
      // CIWS: 1.1 s bursts from the mount nearest the player, 1.6 s pauses.
      t.ciwsT -= dt;
      if (t.ciwsT <= -1.6) t.ciwsT = 1.1;
      if (dist < 2400 && t.ciwsT > 0) {
        let best = null, bd = Infinity;
        for (const c of t.ciws) { mountWorld(t, c, _db); const dd = _db.distanceToSquared(S.position); if (dd < bd) { bd = dd; best = c; } }
        mountWorld(t, best, _db);
        if (!occluded(_db, S.position)) {
          t.ciwsAcc += dt * 16;
          while (t.ciwsAcc >= 1) {
            t.ciwsAcc -= 1;
            const tof = Math.sqrt(bd) / 1100;
            _dv.copy(S.position).addScaledVector(S.velocity, tof).sub(_db).normalize();
            const sp = DIFF.ciwsSpread;
            _dv.x += (rand() - 0.5) * sp; _dv.y += (rand() - 0.5) * sp; _dv.z += (rand() - 0.5) * sp;
            enemyTracers.add(_db, _dv.normalize().multiplyScalar(1100), 2.4, DIFF.ciwsDmg);
          }
          if (rand() < dt * 20) fire.spawn({ x: _db.x, y: _db.y, z: _db.z, vx: 0, vy: 0, vz: 0, life: 0.06, s0: 3, s1: 5, r: 1, g: 0.8, b: 0.4, a: 0.9, drag: 0 });
          C.missileWarning = Math.max(C.missileWarning, 0.3);
        }
      }
      // AAA flak bursts around the predicted position.
      if (t.aaOff) { t.flakCD = 1; t.aaCD = AA_CD; t.aaLeft = 0; }
      else t.flakCD -= dt;
      if (!t.aaOff && dist < 4800 && S.position.y > 120 && t.flakCD <= 0) {
        t.flakCD = 0.55 + rand() * 0.6;
        if (!occluded(_da.copy(t.pos).setY(t.aimH + 6), S.position)) {
          _dv.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(35 + rand() * 150);
          flakBurst(_da.copy(S.position).addScaledVector(S.velocity, 0.6).add(_dv));
        }
      }
      // Deck AAA: 8-round bursts, 900 m/s, 0.6 lead with a 1.8 deg cone.
      if (!t.aaOff && dist < AA_RANGE && S.position.y < AA_ALT) {
        t.aaCD = (t.aaCD || 0) - dt;
        if (t.aaCD <= 0) { t.aaCD = AA_CD; t.aaLeft = 8; }
        if (t.aaLeft > 0) {
          t.aaLeft--;
          mountWorld(t, t.ciws[0] || t.pos, _db);
          const tof = dist / 900;
          _dv.copy(S.position).addScaledVector(S.velocity, tof * 0.6).sub(_db).normalize();
          const sp = Math.tan(1.8 * D2R);
          _dv.x += (rand() - 0.5) * sp; _dv.y += (rand() - 0.5) * sp; _dv.z += (rand() - 0.5) * sp;
          _dv.normalize().multiplyScalar(900);
          if (env.aaTracer) env.aaTracer(_db, _dv, 0.25, false);
          // Closest-approach damage (no hitscan): distance from player to the round's path.
          _ft.copy(S.position).sub(_db);
          const along = clamp(_ft.dot(_dv) / (900 * 900), 0, 0.8);
          _db.addScaledVector(_dv, along);
          if (_db.distanceTo(S.position) < 12) damagePlayer(AA_DMG);
          if (rand() < 0.12 && env.onSfx) env.onSfx('aaa', _db, 0.4);
        }
      }
      // Shipborne SAM (silenced once the radar/AA mast is destroyed).
      if (t.aaOff) t.samCD = 1; else t.samCD -= dt;
      if (!t.aaOff && t.samMount !== false && t.samCD <= 0 && dist < 7500 && S.position.y > 260) {
        t.samCD = t.staged ? SHIP_SAM_CD : 16 + rand() * 8;
        mountWorld(t, t.sams[Math.floor(rand() * t.sams.length)], _fp);
        if (!occluded(_fp, S.position) && !surfaceSAM(_fp.clone(), t.kind)) t.samCD = 2 + rand() * 2;   // director said wait
      }
    }
    // Locking a ship with the seeker provokes the whole group.
    if (C.seekerArmed && C.designated && C.designated.fleet) fleetProvoked = true;
    // First contact with the strike group.
    if (playerActiveNow && !fleetSpotted && fleetAlive()) {
      for (const t of taskForce) if (t.alive && t.pos.distanceTo(S.position) < 12000) { fleetSpotted = true; if (env.onRadio) env.onRadio('FLEET_SPOTTED'); break; }
    }
  }

  /* ---------------- SEC-02 coastal AAA + SEC-01 base air defence (friendly) */
  // Coastal flak nests on the bridge headlands (surface targets, 40 HP) burst flak
  // at a player inside 3.6 km with line of sight. SAM sites (placed on SEC-02
  // islands when possible) launch at a player inside 8 km, above 850 ft.
  // ARCHIPELAGO AFB: two friendly CIWS mounts (white-gold tracer streams, 1.8 km)
  // and a SAM launcher (5 km) engaging bandits / bombers over the base; their kills
  // are credited to the base, not the player.
  function buildFlak() {
    const g = new THREE.Group();
    const sand = surfMat(0x8a7f62, 0.95, 0), olive = surfMat(0x4b5233, 0.8, 0.2), dark = surfMat(0x2a2d2a, 0.6, 0.4);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 1.2, 6, 18), sand); ring.rotation.x = Math.PI / 2; ring.position.y = 0.9; g.add(ring);
    const spin = new THREE.Group(); spin.position.y = 1.6; g.add(spin);
    spin.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 1.4, 10), olive));
    for (const sx of [-0.5, 0.5]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.2, 6), dark); b.rotation.x = Math.PI / 2 - 0.7; b.position.set(sx, 1.6, -1.5); spin.add(b); }
    return { g, spin, mats: [sand, olive, dark], r: 10, kind: 'FLAK', hp: 40, aimSpin: true };
  }
  const BASE = { ciws: [], sams: [], samCD: 4, ciwsT: 0, acc: 0 };
  const baseTracers = new Tracers(200, new THREE.Color(2.5, 2.2, 1.5), new THREE.Color(1.0, 0.5, 0.15));
  function buildBaseDefences() {
    const R = env.runway; if (!R) return;
    const white = surfMat(0xe6e8e4, 0.5, 0.2), grey = surfMat(0x8d918f, 0.7, 0.3), olive = surfMat(0x4b5233, 0.8, 0.2);
    for (const [x, z] of [[R.x + 120, R.z0 - 70], [R.x + 120, R.z1 + 70]]) {
      const y = Math.max(terrainHeight(x, z), 2), g = new THREE.Group(); g.position.set(x, y, z);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(5, 2, 5), grey).translateY(1));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 3, 12), white).translateY(3.5));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), white).translateY(5));
      scene.add(g); baseDefG.push(g); BASE.ciws.push(new THREE.Vector3(x, y + 5.5, z));
    }
    { const x = R.x + 470, z = -100, y = Math.max(terrainHeight(x, z), 2), g = new THREE.Group(); g.position.set(x, y, z);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 6.4), olive).translateY(0.8));
      const rack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 6.8), olive); rack.position.set(0, 2.6, 0); rack.rotation.x = 0.7; g.add(rack);
      scene.add(g); baseDefG.push(g); BASE.sams.push(new THREE.Vector3(x, y + 4, z)); }
  }
  const baseDefG = [];                                      // AFB CIWS / SAM site meshes (visibility follows map props)
  function nearestBandit(p, range) {
    let best = null, bd = range * range;
    for (const e of enemies) { if (!e.alive) continue; const d = e.pos.distanceToSquared(p); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function updateDefences(dt) {
    const mp = env.getMapProps && env.getMapProps();
    if (mp && !mp.islands && !mp.terrain) return;        // open ocean: only ships fire
    const fire_ok = hostileFireOk();
    for (const t of surface) {
      if (t.fleet || !t.alive) continue;
      const dist = t.pos.distanceTo(S.position);
      if (t.kind === 'FLAK') {
        if (t.spin) t.spin.rotation.y = Math.atan2(-(S.position.x - t.pos.x), -(S.position.z - t.pos.z)) - t.g.rotation.y;
        t.flakCD = (t.flakCD || 0) - dt;
        if (fire_ok && dist < 3600 && S.position.y > 60 && t.flakCD <= 0) {
          t.flakCD = 0.7 + rand() * 0.7;
          if (!occluded(_da.copy(t.pos).setY(t.pos.y + 4), S.position)) {
            _dv.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(30 + rand() * 130);
            flakBurst(_da.copy(S.position).addScaledVector(S.velocity, 0.5).add(_dv));
          }
        }
      } else if (t.kind === 'SAM SITE') {
        t.samCD = (t.samCD ?? 8 + rand() * 8) - dt;
        if (fire_ok && t.samCD <= 0 && dist < 8000 && S.position.y > 260) {
          t.samCD = 18 + rand() * 8;
          if (!occluded(_fp.copy(t.pos).setY(t.pos.y + 6), S.position) && !surfaceSAM(_fp.clone(), t.label)) t.samCD = 2 + rand() * 2;
        }
      }
    }
    // Friendly base air defence.
    BASE.samCD -= dt; BASE.ciwsT -= dt;
    for (const s of BASE.sams) {
      if (BASE.samCD > 0) break;
      const e = nearestBandit(s, 5000);
      if (e && !occluded(s, e.pos)) {
        BASE.samCD = 8;
        _dv.copy(e.pos).sub(s).normalize().lerp(UP, 0.4).normalize(); _q.setFromUnitVectors(MSL_NOSE, _dv);
        const m = launch(_da.copy(s), _q, _db.copy(_dv).multiplyScalar(70), e, false, MSL_FULL);
        if (m) { m.friendly = true; if (env.onRadio) env.onRadio('BASE_SAM'); }
      }
    }
    if (BASE.ciwsT <= -1.4) BASE.ciwsT = 1.2;
    if (BASE.ciwsT > 0) {
      for (const c of BASE.ciws) {
        const e = nearestBandit(c, 1800);
        if (!e || occluded(c, e.pos)) continue;
        BASE.acc += dt * 24;
        while (BASE.acc >= 1) {
          BASE.acc -= 1;
          const tof = e.pos.distanceTo(c) / 1100;
          _dv.copy(e.pos).addScaledVector(e.vel, tof).sub(c).normalize();
          _dv.x += (rand() - 0.5) * 0.02; _dv.y += (rand() - 0.5) * 0.02; _dv.z += (rand() - 0.5) * 0.02;
          baseTracers.add(c, _dv.normalize().multiplyScalar(1100), 2.2);
        }
      }
    }
    baseTracers.step(dt, b => {
      for (const e of enemies) {
        if (!e.alive) continue;
        _dv.subVectors(b.p, b.prev); const l2 = _dv.lengthSq();
        const tt = l2 > 0 ? clamp(_db.subVectors(e.pos, b.prev).dot(_dv) / l2, 0, 1) : 0;
        if (_db.copy(b.prev).addScaledVector(_dv, tt).distanceToSquared(e.pos) < 121) {
          e.hp -= 3; hitSparks(b.p, b.v);
          if (e.hp <= 0) destroyEnemy(e, false, 'BASE');
          return true;
        }
      }
      return false;
    });
  }

  // Strike bombers reaching the base: a 7-bomb stick across the runway / hangars.
  const baseStrikes = [];
  function bomberRun(e) {
    const R = env.runway; if (!R) return;
    e.bombed = true;
    for (let k = 0; k < 7; k++) baseStrikes.push({ t: 0.6 + k * 0.2, x: R.x + (rand() - 0.3) * 520, z: R.z0 + rand() * (R.z1 - R.z0) });
    C.baseHits = (C.baseHits || 0) + 1;
    C.score = Math.max(0, (C.score || 0) - 800);
    say(`ARCHIPELAGO AFB HIT — ${e.label} BOMBS ON TARGET!`, 2.8, '#ff4d3d');
    pushEvent('DAMAGED', `[ BASE HIT ] ${e.type} ${e.label} — -800`, 0, '#ff4d3d');
    if (env.onRadio) env.onRadio('BASE_HIT');
    fleetCenter(e.center); e.radius = 2800;                     // egress toward the fleet
  }
  function updateBombers(dt) {
    const R = env.runway;
    if (R) {
      const cz = (R.z0 + R.z1) / 2;
      for (const e of enemies) if (e.alive && e.bomber && !e.bombed && Math.hypot(e.pos.x - R.x, e.pos.z - cz) < 1000) bomberRun(e);
    }
    for (let i = baseStrikes.length - 1; i >= 0; i--) {
      const b = baseStrikes[i]; b.t -= dt;
      if (b.t > 0) continue;
      baseStrikes.splice(i, 1);
      _da.set(b.x, Math.max(terrainHeight(b.x, b.z), 0) + 2, b.z);
      explosion(_da, 2.2); shockRing(_da, 0xffd8a0, false);
    }
  }

  // Terrain masking: a ridge / canyon wall rising above the line of sight breaks
  // bandit radar locks at once and strips guidance from missiles tracking us.
  let maskSayT = -99;
  function terrainMaskBreak(what) {
    C.terrainBreaks = (C.terrainBreaks || 0) + 1;
    C.terrainMaskT = performance.now();
    const now = performance.now() / 1000;
    if (now - maskSayT < 2) return;
    maskSayT = now;
    say('[ TERRAIN MASKING // LOCK BROKEN ]', 2.2, '#52ff9c');
    pushEvent('EVADED', `TERRAIN MASKING // ${what} LOCK BROKEN`, 0, '#52ff9c');
    if (env.onSfx) env.onSfx('lockdrop', null, 1);
    if (env.onRadio) env.onRadio('TERRAIN_MASK');
  }

  // Live sector readout + AWACS call on entry.
  let sectorT = 0;
  function updateSector(dt, playerActive) {
    sectorT -= dt;
    if (sectorT > 0 || !env.sectorAt) return;
    sectorT = 0.4;
    const sc = env.sectorAt(S.position.x, S.position.z);
    if (C.sector && C.sector.id === sc.id) return;
    const had = !!C.sector;
    C.sector = sc; C.sectorT = performance.now();
    if (had && playerActive && env.onRadio) env.onRadio('SECTOR', { id: sc.id, code: sc.code, name: sc.name });
  }

  /* ==================================================== damage model */
  // DMG >= 35 %: hydraulic leak (stiffer, -15 % control response, HYD caution).
  //
  // Single-engine fire, Halon bottle, slim-chance windmill relight. Each F100 has a
  // state: HEALTHY | ON_FIRE | EXTINGUISHED | RELIGHTING | SEIZED (C.engL / C.engR).
  //   Ignition: DMG crossing the preset threshold (65 / 55 / 45 %), or a direct missile hit on
  //     two healthy engines (preset chance). One engine (random side) goes ON_FIRE: thrust
  //     capped at 58 %, dead plume, yaw / roll drift toward it, fire spreads +2.2 %
  //     DMG/s and the airframe explodes after 16 s.
  //   F (press) while ON_FIRE: Halon discharge -> EXTINGUISHED (spread stops).
  //   F (hold 2.5 s) while EXTINGUISHED, one attempt: RELIGHTING (windmill crank).
  //     Success p = 5 % below 220 kt, 20 % at 220 kt rising to 38 % at 350+ kt:
  //     -> HEALTHY (DMG -20 %), else -> SEIZED (single-engine ops until AFB repair).
  // Legacy flags derived for the flight model / VFX / gauges: C.engineOut = the
  // affected side unless HEALTHY, C.engineFire = ON_FIRE.
  const FIRE_DMG_RATE = 2.2, FIRE_FATAL_T = 16, RELIGHT_HOLD = 2.5;
  Object.assign(C, { engL: 'HEALTHY', engR: 'HEALTHY', engSide: null, engState: 'HEALTHY', fireT: 0, fireArmed: true,
    relightT: 0, relightUsed: false, relightResult: null, relightResultT: 0, relightP: 0, relightForce: null, fNeedRelease: false });
  let dmgSmokeAcc = 0, cautionT = 0;
  const engState = side => (side === 'L' ? C.engL : C.engR);
  function syncEngineFlags() {
    const st = C.engSide ? engState(C.engSide) : 'HEALTHY';
    C.engState = st;
    C.engineOut = st === 'HEALTHY' ? null : C.engSide;
    C.engineFire = st === 'ON_FIRE';
    // Eligibility is sticky for the sortie: losing an engine airborne earns the
    // badge even after a Halon discharge or a later relight.
    if (C.engineOut && !S.onGround && C.bw) {
      C.bw.eligible = true;
      if (env.debug && !C.bw.logged) { C.bw.logged = true; console.log('[ANGELS_ZERO] bw eligible side=' + C.engineOut); }
    }
  }
  function setEng(side, st) { if (side === 'L') C.engL = st; else C.engR = st; syncEngineFlags(); }
  function resetEngines() {
    Object.assign(C, { engL: 'HEALTHY', engR: 'HEALTHY', engSide: null, fireT: 0, fireArmed: true, relightT: 0, relightUsed: false,
      relightResult: null, relightResultT: 0, fNeedRelease: false });
    syncEngineFlags();
    if (env.onSfx) env.onSfx('crankStop', null, 1);
  }
  const _nzp = new THREE.Vector3();
  function nozzleWorld(side, out, back = 1.2) {
    const nz = nozzles[side === 'L' ? 0 : 1] || nozzles[0];
    return nz ? out.copy(nz).setZ(nz.z + back).applyQuaternion(S.quaternion).add(S.position) : out.copy(S.position);
  }
  function igniteEngine(reason, side) {
    if (C.engSide || C.dead) return false;
    side = side || (rand() < 0.5 ? 'L' : 'R');
    Object.assign(C, { engSide: side, fireT: 0, relightUsed: false, relightT: 0, relightResult: null, fireArmed: false });
    setEng(side, 'ON_FIRE');
    cautionT = 3.2;
    say(`${side === 'L' ? 'LEFT' : 'RIGHT'} ENGINE FIRE — PRESS F TO EXTINGUISH`, 2.8, '#ff4d3d');
    pushEvent('DAMAGED', `[ ${side} ENG FIRE ] ${reason}`, 0, '#ff4d3d');
    if (env.onSfx) { env.onSfx('flameout', null, 1); env.onSfx('firebell', null, 1); }
    if (env.onRadio) env.onRadio('ENG_FIRE', { side });
    return true;
  }
  // Emergency procedure input pending? (F is the fire-bottle / relight switch then.)
  function engineEmergency() {
    const st = C.engState;
    return !C.dead && (st === 'ON_FIRE' || st === 'RELIGHTING' || (st === 'EXTINGUISHED' && !C.relightUsed));
  }
  function extinguish() {
    const side = C.engSide;
    setEng(side, 'EXTINGUISHED');
    C.fNeedRelease = true;                                   // relight needs a fresh press-and-hold
    // White Halon vapour burst from the nacelle.
    nozzleWorld(side, _nzp, -0.8);
    for (let k = 0; k < 26; k++) smoke.spawn({ x: _nzp.x, y: _nzp.y, z: _nzp.z, vx: S.velocity.x * 0.5 + (rand() - 0.5) * 14, vy: S.velocity.y * 0.5 + (rand() - 0.2) * 10,
      vz: S.velocity.z * 0.5 + (rand() - 0.5) * 14, life: 1.6 + rand() * 1.2, s0: 1.5, s1: 9 + rand() * 6, r: 0.93, g: 0.95, b: 0.97, a: 0.8, drag: 1.6 });
    say(`${side} ENGINE FIRE OUT — HALON DISCHARGED`, 2.4, '#52ff9c');
    pushEvent('EVADED', `[ ${side} ENG ] FIRE EXTINGUISHED`, 0, '#52ff9c');
    if (env.onSfx) env.onSfx('extinguish', null, 1);
    if (env.onRadio) env.onRadio('ENG_EXTINGUISHED');
  }
  // F key (index.html routes it here while engineEmergency()).
  function fireKey(down) {
    const st = C.engState;
    if (down) {
      if (st === 'ON_FIRE') { extinguish(); return; }
      if (st === 'EXTINGUISHED' && !C.relightUsed && !C.fNeedRelease) {
        setEng(C.engSide, 'RELIGHTING'); C.relightT = 0;
        say('WINDMILL RELIGHT — CRANKING…', 1.4, '#ffbf3f');
        if (env.onSfx) env.onSfx('crankStart', null, 1);
      }
    } else {
      C.fNeedRelease = false;
      if (st === 'RELIGHTING' && C.relightT < RELIGHT_HOLD) {      // let go early: abort, attempt not spent
        setEng(C.engSide, 'EXTINGUISHED'); C.relightT = 0;
        say('RELIGHT ABORTED — HOLD F 2.5 S', 1.4, '#ffbf3f');
        if (env.onSfx) env.onSfx('crankStop', null, 1);
      }
    }
  }
  function relightOdds() {
    const kts = S.speed * 1.94384;
    return kts < 220 ? 0.05 : kts >= 350 ? 0.38 : 0.20 + 0.18 * (kts - 220) / 130;
  }
  function resolveRelight() {
    const side = C.engSide, p = relightOdds();
    const ok = C.relightForce === 'ok' ? true : C.relightForce === 'fail' ? false : rand() < p;
    C.relightUsed = true; C.relightP = p; C.relightResult = ok ? 'OK' : 'FAIL'; C.relightResultT = performance.now();
    if (env.onSfx) env.onSfx('crankStop', null, 1);
    nozzleWorld(side, _nzp, 1.0);
    if (ok) {
      setEng(side, 'HEALTHY'); C.engSide = null; syncEngineFlags();
      C.health = Math.min(100, C.health + 20);
      // Relight boom + orange burner flare streaming from the exhaust.
      explosion(_nzp, 0.45);
      for (let k = 0; k < 40; k++) {                       // flame tongue streaming aft (slower than the jet)
        const lag = 0.55 + rand() * 0.3;
        fire.spawn({ x: _nzp.x, y: _nzp.y, z: _nzp.z, vx: S.velocity.x * lag + (rand() - 0.5) * 6, vy: S.velocity.y * lag + (rand() - 0.5) * 6,
          vz: S.velocity.z * lag + (rand() - 0.5) * 6, life: 0.25 + rand() * 0.35, s0: 2.6 + rand() * 2, s1: 0.6, r: 1, g: 0.55 + rand() * 0.3, b: 0.15, a: 1, drag: 1.2 });
      }
      say('[ ENGINE RELIT! ] — FULL TWIN-ENGINE POWER', 2.8, '#52ff9c');
      pushEvent('EVADED', `[ ${side} ENG ] RELIGHT SUCCESS (${Math.round(p * 100)}%)`, 0, '#52ff9c');
      if (env.onSfx) env.onSfx('relight', null, 1);
      if (env.onRadio) env.onRadio('RELIGHT_OK');
    } else {
      setEng(side, 'SEIZED');
      for (let k = 0; k < 10; k++) smoke.spawn({ x: _nzp.x, y: _nzp.y, z: _nzp.z, vx: S.velocity.x * 0.45 + (rand() - 0.5) * 6, vy: S.velocity.y * 0.45 + rand() * 3,
        vz: S.velocity.z * 0.45 + (rand() - 0.5) * 6, life: 2 + rand(), s0: 2, s1: 10, r: 0.25, g: 0.25, b: 0.25, a: 0.7, drag: 1 });
      say('RELIGHT FAILED — ENGINE SEIZED', 2.8, '#ff4d3d');
      pushEvent('DAMAGED', `[ ${side} ENG ] SEIZED — SINGLE ENGINE OPS`, 0, '#ff4d3d');
      if (env.onSfx) env.onSfx('stall', null, 1);
      if (env.onRadio) env.onRadio('RELIGHT_FAIL');
    }
  }
  function updateDamage(dt, playerActive) {
    const dmg = 100 - C.health;
    C.hydraulic = playerActive && dmg >= 35;
    if (!playerActive) return;
    if (dmg < DIFF.engineFireRearm) C.fireArmed = true;
    if (dmg >= DIFF.engineFireDmg && C.fireArmed && !C.engSide) igniteEngine(`DMG ${Math.round(dmg)}%`);
    const st = C.engState;
    if (st === 'ON_FIRE') {
      C.fireT += dt;
      C.health = Math.max(0, C.health - FIRE_DMG_RATE * dt);           // fire spreads (no hit flash)
      cautionT -= dt;
      if (cautionT <= 0) { cautionT = 3.2; if (env.onSfx) env.onSfx('firebell', null, 1); }
      if (C.fireT >= FIRE_FATAL_T || C.health <= 0) {
        nozzleWorld(C.engSide, _nzp, 0); explosion(_nzp, 2.4);
        C.health = 0; say('ENGINE FIRE — AIRFRAME EXPLODED', 3, '#ff4d3d');
        env.onPlayerDown('fire');
        return;
      }
    } else if (st === 'RELIGHTING') {
      C.relightT += dt;
      if (C.relightT >= RELIGHT_HOLD) resolveRelight();
    }
    if (!C.engSide || !nozzles.length || C.engState === 'HEALTHY') return;
    // Exhaust trail from the damaged nozzle: ON_FIRE -> thick black smoke + jagged
    // orange flame; RELIGHTING -> thin white unburned-fuel vapour; EXTINGUISHED /
    // SEIZED -> thin grey wisps.
    const p = nozzleWorld(C.engSide, _nzp, 1.2), fireOn = C.engState === 'ON_FIRE', crank = C.engState === 'RELIGHTING';
    dmgSmokeAcc += dt * (fireOn ? 70 : crank ? 40 : 16);
    while (dmgSmokeAcc >= 1) {
      dmgSmokeAcc -= 1;
      const g = fireOn ? 0.04 + rand() * 0.05 : crank ? 0.86 + rand() * 0.08 : 0.42 + rand() * 0.12;
      // Carries ~40 % of the jet's velocity at first (drag 0.9/s) so the ribbon trails visibly behind the nacelle.
      smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: S.velocity.x * 0.42 + (rand() - 0.5) * 2, vy: S.velocity.y * 0.42 + rand(), vz: S.velocity.z * 0.42 + (rand() - 0.5) * 2,
        life: fireOn ? 4.5 + rand() * 2.5 : 2 + rand() * 1.5, s0: fireOn ? 2.6 : 1.2, s1: fireOn ? 16 + rand() * 7 : 6 + rand() * 3,
        r: g, g: g * 0.97, b: g * 0.94, a: fireOn ? 0.82 : crank ? 0.42 : 0.35, drag: 0.9, rise: 0.6 });
      if (fireOn && rand() < 0.8) fire.spawn({ x: p.x, y: p.y, z: p.z, vx: S.velocity.x * 0.6 + (rand() - 0.5) * 10, vy: S.velocity.y * 0.6 + (rand() - 0.5) * 10, vz: S.velocity.z * 0.6 + (rand() - 0.5) * 10,
        life: 0.2 + rand() * 0.3, s0: 2.4 + rand() * 3, s1: 0.6, r: 1, g: 0.45 + rand() * 0.35, b: 0.1, a: 1, drag: 1.4 });
    }
  }

  /* ================================================================ API */
  let ready = false, waveTimer = 0, allyStepped = false;
  const mountCbs = [];
  const onCarrierMounted = cb => { if (typeof cb === 'function') mountCbs.push(cb); };
  function init(model, nozzleLocal) {
    collectStores(model);
    buildFleet(model, nozzleLocal);
    buildBaseDefences();
    buildAlliedCarrier();
    spawnFleet();
    spawnWave();
    spawnSurface();
    ready = true;
  }

  // Runway pit stop (index.html, after the 4 s rearm / repair): stores, gun, flares,
  // airframe and engines restored; the combo chain, locks and score are left alone.
  function pitStop() {
    if (!C.weaponsLock.msl) rearm('msl');
    if (!C.weaponsLock.spw) rearm('bomb');
    for (const st of stores.msl) st.aamHidden = false;
    ripple.length = 0; aamRack = 0; flareRecharge = 0;
    chaff.length = 0; chaffCD = 0; chaffRecharge = 0; C.chaff = C.chaffMax; C.notchT = 0;
    Object.assign(C, { bombs: stores.bomb.length, bombReload: 0, flares: FLR_MAX, aam4: AAM4_MAX, aam4Reload: 0, qaam: QAAM_MAX, qaamReload: 0, ammo: GUN_MAX, missiles: MSL_MAX,
      reload: 0, missileReload: 0, gunHeat: 0, gunOverheat: false, engineOut: null, engineFire: false, hydraulic: false, health: 100, hitFlash: 0 });
    if (C.weaponsLock.msl) { C.missiles = 0; C.aam4 = 0; C.qaam = 0; }
    if (C.weaponsLock.spw) C.bombs = 0;
    resetEngines();                                         // both F100s back to HEALTHY
    director.reset();
    C.score += 1000;
    pushEvent('BONUS', 'TRAP BONUS', 1000, '#ffd45a');
  }
  function resetPlayer() {
    aceFlightDone = false;
    rearm('msl'); rearm('bomb');
    Object.assign(C, { comboMult: 1, comboTimer: 0, dangerClose: false, dangerMult: 1, styleFeed: [] });
    Object.assign(C, { bombs: stores.bomb.length, bombReload: 0, flares: FLR_MAX, ccip: null, aam4: AAM4_MAX, aam4Reload: 0, qaam: QAAM_MAX, qaamReload: 0, ecmState: 'READY', ecmT: 0 });
    for (const st of stores.msl) st.aamHidden = false;
    ripple.length = 0; aamRack = 0; disarmSeeker(null); setMulti([]);
    Object.assign(C, { gunHeat: 0, gunOverheat: false, engineOut: null, engineFire: false, hydraulic: false, ccrpArmed: false });
    resetEngines();
    director.reset();
    flareRecharge = 0;
    chaff.length = 0; chaffCD = 0; chaffRecharge = 0; C.chaff = C.chaffMax; C.notchT = 0;
    Object.assign(C, { ammo: GUN_MAX, missiles: MSL_MAX, reload: 0, missileReload: 0, lockTarget: null, nextTarget: null, designated: null, health: 100, dead: false, hitFlash: 0, missileWarning: 0,
      lockProgress: 0, lockState: 'NONE', rwrTrack: false, banditLock: 0, events: [],
      gunRounds: 0, gunHitsP: 0, mslFiredP: 0, mslHitsP: 0, maxDmg: 0, traps: 0, furballKills: 0, lowHpSaid: false });
    furT = 0; furSwarmT = 75;
    Object.assign(C.bw, { eligible: false, landed: false, logged: false });
    Object.assign(C.intr, { st: 'IDLE', t: 0, ace: -1, used: false, farT: 0 }); C.wingHold = false;
    Object.assign(C.sc, { st: 'IDLE', used: false, pz: S.position.z, px: S.position.x, py: S.position.y, logT: 0, bannerT: 0 });
    clearDronePool(); droneSalvoT = 0; droneSalvoKills = 0; droneSalvoPaid = false;
    for (const e of enemies) e.bLock = 0;
    playerTracers.clear(); enemyTracers.clear();
    for (const m of missiles) if (!m.enemy || m.target?.isPlayer) { m.active = false; m.mesh.visible = false; }
    for (const t of strikeTargets) {                    // one sortie = one fresh set of jammers
      t.alive = true; t.hp = t.hpMax; t.burn = 0; t.g.visible = true;
      for (let i = 0; i < t.mats.length; i++) t.mats[i].color.setHex(t.matHex[i]);
    }
    Object.assign(C, { jamming: 0, sectorLow: false, strikeDoneT: 0,
      missionPhase: 1, mpT: 0, obj: { done: 0, total: WAVE_SIZE } });
    waveKill0 = C.kills || 0;
    sectorLowPrev = false; sectorLowT = -1e9;
    mslCooldown = 0; gunAcc = 0;
  }

  /* ---------------------- AI disengage: low-altitude clutter / base safe zone */
  // C.playerSafe (playerSafeFromAI) is true while the player is
  //   LOW-ALT  below 350 ft AGL (hysteresis: armed again only above 450 ft), or
  //   BASE     gear down below 1,000 ft AGL within 4.5 km of ARCHIPELAGO AFB's runway,
  //            or on the runway (ON_GROUND / rearming).
  // While safe: bandit locks / bursts / launches stop, RWR + warnings clear,
  // enemy tracers in flight are removed, every bandit missile aimed at the
  // player loses track into ground clutter and self-destructs 1.0 s later, and
  // bandits fly DISENGAGE_ORBIT: climb above 2,200 ft, orbit 3.2 km from the
  // player until the safe state ends (then PATROL -> ENGAGE as usual).
  const SAFE_IN_FT = 350, SAFE_OUT_FT = 450, BASE_FT = 1000, BASE_R = 4500, ORBIT_R = 3200, ORBIT_ALT = 900;
  let lowSafe = false, baseWas = false;
  Object.assign(C, { playerSafe: false, safeKind: null });
  function updateSafe(playerActive) {
    const aglFt = S.radalt * 3.28084, R = env.runway;
    if (!lowSafe && aglFt < SAFE_IN_FT) lowSafe = true; else if (lowSafe && aglFt > SAFE_OUT_FT) lowSafe = false;
    // Distance to the nearest point of the runway centreline (z0..z1), so a 3 deg final
    // that starts 4.5 km out from either threshold counts as "at the base".
    const base = R ? Math.hypot(S.position.x - R.x, S.position.z - clamp(S.position.z, R.z0, R.z1)) : Infinity;
    const approach = !!S.gearDown && aglFt < BASE_FT && base < BASE_R;
    const ground = !!S.onGround || !!(S.pit && S.pit.active);
    const safe = playerActive && !C.dead && (lowSafe || approach || ground);
    if (safe && !C.playerSafe) {                                          // onset: break everything off at once
      enemyTracers.clear();
      for (const e of enemies) { e.bLock = 0; e.burst = 0; }
      C.missileWarning = 0;
    }
    if (approach && !baseWas && env.onRadio) env.onRadio('SAFE_APPROACH');
    baseWas = approach;
    C.playerSafe = safe;
    C.safeKind = !safe ? null : approach || ground ? 'BASE' : 'LOWALT';
    if (!safe) return;
    // Missiles already in the air lose the player in ground clutter and fuze out 1.0 s later.
    for (const m of missiles) {
      if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.clutterLost) continue;
      m.lostTrack = true; m.clutterLost = true; m.life = Math.min(m.life, m.age + 1.0);
      ai.clutterBreaks = (ai.clutterBreaks || 0) + 1;
      pushEvent('EVADED', 'GROUND CLUTTER // MISSILE LOST', 0, '#52ff9c');
    }
  }
  // DISENGAGE_ORBIT steering: climb above 2,200 ft, hold a 3.2 km orbit around the player.
  function disengageDesired(e, desired) {
    const rx = e.pos.x - S.position.x, rz = e.pos.z - S.position.z, rl = Math.max(1, Math.hypot(rx, rz));
    const ux = rx / rl, uz = rz / rl;
    desired.set(-uz * e.dir, 0, ux * e.dir).addScaledVector(_s.set(ux, 0, uz), clamp((ORBIT_R - rl) / ORBIT_R, -0.8, 1.2));
    const alt = Math.max(ORBIT_ALT, groundLevel(e.pos.x, e.pos.z) + 450);
    desired.y = clamp((alt - e.pos.y) * 0.004, -0.25, 0.45);
  }

  function update(dt, now, opts) {
    const playerActive = opts.playerActive;
    if (!allyStepped) updateAlly(dt);
    allyStepped = false;
    updateGates(dt, now);
    updateCanyonGates(dt, now);
    updateCanyonShortcut(dt);
    updateCeiling(dt, now);
    updateClimb(dt, now);
    // Return Line: crossing south-to-north resupplies the jet; 25 s re-arm cooldown.
    returnMat.opacity = 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(now * 2.2));
    if (!S.onGround && prevReturnZ < RETURN_Z && S.position.z >= RETURN_Z && styleClock - lastReturn > RETURN_CD) {
      lastReturn = styleClock;
      if (!C.weaponsLock.msl) { rearm('msl'); C.aam4 = AAM4_MAX; C.qaam = QAAM_MAX; }
      if (!C.weaponsLock.spw) rearm('bomb');
      C.flares = FLR_MAX; C.chaff = C.chaffMax;
      C.health += 0.5 * (100 - C.health);
      C.returnT = performance.now();
      if (env.debug) console.log('[ANGELS_ZERO] RETURN REARM');
      if (env.onWing) env.onWing('Overlord: Warden One, rearmed and patched. Get back in the fight.', 'AWACS');
    }
    prevReturnZ = S.position.z;
    updateSafe(playerActive);
    C.hitFlash = Math.max(0, C.hitFlash - dt);
    C.missileWarning = Math.max(0, C.missileWarning - dt);
    C.orderBadgeT = Math.max(0, (C.orderBadgeT || 0) - dt);
    mslCooldown = Math.max(0, mslCooldown - dt);
    if (C.reload > 0) { C.reload -= dt; if (C.reload <= 0) C.ammo = GUN_MAX; }
    if (C.missileReload > 0) { C.missileReload -= dt; if (C.missileReload <= 0) { C.missiles = MSL_MAX; rearm('msl'); } }
    if (C.bombReload > 0) { C.bombReload -= dt; if (C.bombReload <= 0) { C.bombs = stores.bomb.length; rearm('bomb'); } }
    bombCooldown = Math.max(0, bombCooldown - dt);
    playerActiveNow = opts.playerActive;
    const nowMs = performance.now();
    C.comms = C.comms.filter(c => c.until > nowMs);
    C.events = (C.events || []).filter(ev => ev.until > nowMs);

    enforceStoreLock();
    C.mslPylons = stores.msl.map(st => st.node.visible);      // HUD per-pylon AIM-9 icons
    // Cloud densities for the player and every bandit (missiles sample their own).
    C.playerCloud = playerActive ? cloudAt(S.position) : 0;
    C.playerInCloud = C.playerCloud > CLOUD_T;
    for (const e of enemies) e.cloud = e.alive ? cloudAt(e.pos) : 0;
    cloudClear = Math.max(0, cloudClear - dt);

    if (ready) {
      if (C.mode !== 'FURBALL' && !stagedMission() && C.missionPhase === 3 && !aceFlightDone && C.phase !== 3 && waveAlive() <= WAVE_SIZE * 0.5) spawnAceFlight();
      for (const e of enemies) {
        if (e.scripted && e.alive) { updateScriptedRaider(e, dt); continue; }
        if (e.alive) { if (e.crippled) updateCrippled(e, dt); else updateEnemy(e, dt, playerActive); }
        else if (e.wreck) updateWreck(e, dt);
      }
      updateIntrusion(dt);
      updateDrones(dt, playerActive);
      checkRams(playerActive);
      updateDebris(dt);
      updateBombers(dt);
      // Next phase once the air wave is gone -- PHASE 2 also needs the task force sunk.
      if (C.mode !== 'FURBALL') {
        if (!enemies.some(e => e.alive || e.wreck)) {
          if (C.phase === 2 && fleetAlive()) {
            waveTimer = 0;
            if (playerActive && env.onRadio) env.onRadio('FLEET_REMAIN');
          } else {
            waveTimer += dt;
            if (waveTimer > 4) { waveTimer = 0; if (!(C.mcfg.stages && C.mcfg.stages.length)) spawnWave(); }
          }
        } else waveTimer = 0;
      }
      if (C.mode === 'FURBALL') furballTick(dt);
      writeFleet();
      updateFleet(dt);
      updateDefences(dt);
    }
    updateSector(dt, playerActive);
    // Bandit seeker state, aggregated for the RWR / alert systems.
    let bl = 0;
    for (const e of enemies) if (e.alive) bl = Math.max(bl, e.bLock || 0);
    C.banditLock = playerActive && !C.playerSafe ? bl : 0;
    C.rwrTrack = C.banditLock >= B_SOFT && C.banditLock < 1;
    C.incoming = playerActive && !C.playerSafe ? missiles.filter(m => m.active && m.enemy && m.target?.isPlayer && !m.lostTrack).length : 0;
    if ((C.banditLock >= 1 && cloudClear <= 0) || C.incoming) C.missileWarning = Math.max(C.missileWarning, 0.4);
    // Friendly jamming field: live jammers + inside a sector + above 500 ft AGL.
    let inSector = false;
    for (let i = 0; i < JAM_C.length && !stagedMission(); i++) {
      const c = JAM_C[i];
      if (Math.hypot(S.position.x - c.x, S.position.z - c.z) < JAM_R) { inSector = true; break; }
    }
    C.jamming = C.mode === 'FURBALL' || stagedMission() ? 0 : strikeAlive() && inSector && S.radalt > JAM_ALT ? Math.min(1, (S.radalt - JAM_ALT) / 60) : 0;
    C.sectorLow = !!inSector && S.radalt <= JAM_ALT;
    if (C.sectorLow && !sectorLowPrev && nowMs - sectorLowT > 20000) {
      sectorLowT = nowMs;
      if (env.onRadio) env.onRadio('ON_CANYON_LOW');          // voice: replaces the old text callout
    }
    sectorLowPrev = C.sectorLow;
    if (playerActive) {
      updateLock(dt);
      if (opts.firing) fireGun(dt); else gunIdle();
    } else { C.lockTarget = null; C.lockState = 'NONE'; C.lockProgress = 0; gunIdle(); }
    updateGunHeat(dt, opts.firing);
    updateDamage(dt, playerActive);
    updateSurface(dt);
    updateFlagSalvo(dt);

    // Projectiles and hits.
    const seg = new THREE.Vector3(), cp = new THREE.Vector3();
    let segT = 0;
    const segHit = (b, center, r) => {                              // swept-sphere test along this frame's travel
      seg.subVectors(b.p, b.prev); const len2 = seg.lengthSq();
      const t = len2 > 0 ? clamp(cp.subVectors(center, b.prev).dot(seg) / len2, 0, 1) : 0;
      segT = t;
      return cp.copy(b.prev).addScaledVector(seg, t).distanceToSquared(center) < r * r;
    };
    playerTracers.step(dt, b => {
      // Vulcan rounds can detonate an inbound missile in mid-air (always safe).
      for (const m of missiles) {
        if (!m.active || !m.enemy) continue;
        if (m.mesh.position.distanceToSquared(S.position) > 1500 * 1500) continue;
        const d2 = segSeg(b.prev, b.p, m.prevPos, m.mesh.position, _segHit);
        if (d2 >= MSL_SHOOT_R * MSL_SHOOT_R) continue;
        interceptMissile(m, Math.sqrt(d2), _segHit);
        return true;
      }
      // Linked weak points: gun rounds can cripple a mast or a rim battery.
      let weakHit = false;
      for (let i = 0; i < SUB_TGT.length && !weakHit; i++) {
        const v = SUB_TGT[i];
        if (!v.alive || !v.ship) continue;
        if (performance.now() / 1000 - v.ship.sub.lastGunT < 0.1) continue;
        if (segHit(b, v.pos, SUB_HIT_R)) { v.ship.sub.lastGunT = performance.now() / 1000; hitSub(v.ship, 1); weakHit = true; }
      }
      for (let i = 0; i < SITE_TGT.length && !weakHit; i++) {
        const v = SITE_TGT[i];
        if (!v.alive) continue;
        if (segHit(b, v.pos, SITE_HIT_R)) { hitSite(v.idx, 1); weakHit = true; }
      }
      if (weakHit) { hitSparks(b.p, b.v); return true; }
      for (const t of surface) {
        if (t.alive && segHit(b, t.pos, t.r * 0.6)) { C.gunHitsP++; damageSurface(t, t.strike ? 3 : t.ship ? 0.8 : 2); hitSparks(b.p, b.v); return true; }
      }
      for (let i = 0; i < DRONE_N; i++) {
        if (DR_ALIVE[i] && segHit(b, DRONE_TGT[i].pos, DRONE_HIT_R)) {
          C.gunHitsP++; killDrone(i, 'GUN'); hitSparks(b.p, b.v); return true;
        }
      }
      for (const e of enemies) {
        if (e.scripted) continue;
        if (e.alive && segHit(b, e.pos, DIFF.gunHitRadius) && segT < 0.999) {        // not yet abeam: it passes through next frame
          // Closest approach of this frame's round path, in the bandit's local frame.
          const zone = hitZone(e, _hl.copy(cp).sub(e.pos).applyQuaternion(_qi.copy(e.quat).invert()));
          if (DBG_HITS && e.id === 0 && DBG_HITS.length < 12) DBG_HITS.push((zone || '-') + '@' + _hl.toArray().map(v => v.toFixed(1)).join('/'));
          if (!zone) continue;                                      // through the empty part of the envelope
          hitEnemy(e, zone, cp.clone(), b.v);
          return true;
        }
      }
      return false;
    });
    enemyTracers.step(dt, b => {
      if (playerActive && segHit(b, S.position, 9)) { damagePlayer(b.dmg); return true; }
      return false;
    });
    director.tick(dt);
    updateMissionPhase();
    updateWingmen(dt);
    updateMissiles(dt, playerActive);
    updateBombs(dt); updateRings(dt); updateChaff(dt); updateFlares(dt);
    updateRipple(dt); updateECM(dt); updateRWR(playerActive && !C.playerSafe);   // safe: RWR scope clears
    if (playerActive) updateCCIP(); else C.ccip = null;
    updateStyle(dt, playerActive);

    for (const f of flashes) { if (f.t > 0) { f.t -= dt; f.l.intensity = Math.max(0, f.t) * 900; } else f.l.intensity = 0; }
    fire.update(dt); smoke.update(dt);
    lastPlayerPos.copy(S.position); lastPlayerValid = playerActive;
  }

  return {
    init, update, resetPlayer, pitStop, fireMissile, designateInSight, designate, explosion, splash, say,
    setDifficulty(id) { applyDifficulty(id); director.reset(); return C.difficulty; },
    setSPW,
    setMode(id) { C.mode = id === 'FURBALL' ? 'FURBALL' : 'MISSION'; C.furballKills = 0; furT = 0; return C.mode; },
    setMissionPhase(p) { setMissionPhase(p); return C.missionPhase; },
    forceStage(n) { C.stage = clamp(n | 0, 0, (C.mcfg.stages ? C.mcfg.stages.length : 1) - 1); spawnStage(C.stage); return C.stage; },
    configureMission(m, mapDef) {
      C.missionTitle = m.title; C.missionId = m.id; C.rtbType = m.rtbType; C.missionBgm = m.bgmScenario;
      C.wingOrder = 0; C.orderBadgeT = 0; resetLimp();
      intrForce = false;
      Object.assign(C.bw, { eligible: false, landed: false, logged: false });
      Object.assign(C.intr, { st: 'IDLE', t: 0, ace: -1, used: false, farT: 0 }); C.wingHold = false;
      if (env.onIntrusion) env.onIntrusion('RESET');
      Object.assign(C.sc, { st: 'IDLE', used: false, pz: S.position.z, px: S.position.x, py: S.position.y, logT: 0, bannerT: 0 });
      C.subKills = 0; C.siteKills = 0; C.flagBannerT = 0;
      clearDronePool(); furSwarmT = 75; droneSalvoT = 0; droneSalvoKills = 0; droneSalvoPaid = false;
      SITE_HPV.fill(SITE_HP); SITE_ON.fill(1); sectorDead.fill(0);
      // Rim batteries carved away by the shortcut stay disabled on every reset.
      for (let i = 0; i < SAM_SITE_N; i++) {
        if (Math.abs(SITE_POS[i * 3] - GORGE_SC_X) < 150 && SITE_POS[i * 3 + 2] < GORGE_SC_ZA + 150 && SITE_POS[i * 3 + 2] > GORGE_SC_ZB - 150) SITE_ON[i] = 0;
      }
      for (const t of stagedShips) {
        t.aaOff = false; t.sub.on = !!SUB_OFF[t.kind]; t.sub.hp = SUB_HP;
        if (t.spin) t.spin.visible = true;
        t.salvo.st = 'IDLE'; t.salvo.fire = 0; t.salvo.t = FLAG_SALVO_MIN + rand() * (FLAG_SALVO_MAX - FLAG_SALVO_MIN);
      }
      if (env.flagBeam) env.flagBeam.hide();
      C.mcfg = missionConfig(m);
      C.stage = 0; C.stageT = 0; C.gateIdx = 0;
      C.samSitesOn = C.mcfg.gatesPath === 'CANYON';
      C.samLive = 0; C.samLaunched = 0; C.samFlared = 0; C.samMasked = 0; C.samHit = 0;
      C.ceil.st = C.ceil.phase = 'CLEAR'; C.ceil.armed = false; C.ceil.t = 0;
      C.ceil.warnT = 0; C.ceil.salvoT = 0; C.ceil.rail = 0; C.ceil.railT = 0; C.ceil.fired = 0;
      C.ceil.lastSam = 0; C.ceil.live = !!C.mcfg.ceiling; C.ceil.belowT = 0;
      C.climb.on = false; C.climb.t = 0; C.climb.sams = 0; C.climb.salvoT = 0; C.climb.rail = 0; C.climb.railT = 0; C.climb.fired = 0;
      C.weaponsLock.msl = !C.mcfg.weapons.msl || C.mcfg.gunsOnly; C.weaponsLock.spw = !C.mcfg.weapons.spw || C.mcfg.gunsOnly;
      if (C.weaponsLock.msl && C.weapon === 'MSL') C.weapon = 'GUN';
      if (C.weaponsLock.spw && C.weapon === 'BOMB') C.weapon = 'GUN';
      // Locked stores: zero ammo and empty pylons, so the HUD / MFD never show a round.
      if (C.weaponsLock.msl) { C.missiles = 0; C.aam4 = 0; C.qaam = 0; for (const st of stores.msl) st.node.visible = false; }
      if (C.weaponsLock.spw) { C.bombs = 0; for (const st of stores.bomb) st.node.visible = false; }
      if (!C.weaponsLock.msl) rearm('msl');                 // a previous guns-only sortie must not leave empty pylons
      if (!C.weaponsLock.spw) rearm('bomb');
      if (C.mcfg.gunsOnly) { C.lockTarget = null; C.lockState = 'NONE'; C.lockProgress = 0; disarmSeeker(null); setMulti([]); }
      C.blockedLaunches = 0; C.aceRounds = 0; C.aceHits = 0;
      C.sunT = 0; C.sunCD = 0; C.sunBlinds = 0; C.sunBannerT = 0;
      C.mslIntercepts = 0; C.interceptBannerT = 0; C.interceptSlowCD = 0;
      const stages = C.mcfg.stages;
      if (stages && stages.length) {
        for (const e of enemies) if (!e.ace && !e.bomber) { e.alive = false; e.wreck = null; if (e.g) e.g.visible = false; }
        aceFlightDone = false;
        spawnStage(0);
      }
      if (C.mcfg.noShips || (C.mcfg.enemyMsl === false && C.mcfg.wingmen === 'NONE')) {
        for (const t of surface) { t.alive = false; if (t.g) t.g.visible = false; }
        for (const t of taskForce) { t.alive = false; if (t.g) t.g.visible = false; }
        clearStagedShips();
      }
      MP[1].label = stages && stages[0] ? stages[0].label : m.title;
      MP[2].label = stages && stages[1] ? stages[1].label : (m.rtbType === 'CARRIER' ? 'NAVAL STRIKE' : 'SECTOR STRIKE');
      MP[3].label = stages && stages[2] ? stages[2].label : (m.id === 'ACE_DUEL' ? 'CRIMSON DUEL' : 'ACE INTERCEPT');
      MP[4].label = m.rtbType === 'CARRIER' ? 'CARRIER RTB' : 'AFB RTB';
      // The carrier is loaded once and cached; a mission switch only toggles it.
      C.missionCarrier = mapDef && mapDef.carrier ? mapDef.carrier : null;
      if (C.ally && C.missionCarrier) placeCarrier(C.missionCarrier);
      return C;
    },
    // Mission switch: return every pooled actor to its pool without allocating.
    resetMission() {
      intrForce = false;
      Object.assign(C.bw, { eligible: false, landed: false, logged: false });
      Object.assign(C.intr, { st: 'IDLE', t: 0, ace: -1, used: false, farT: 0 }); C.wingHold = false;
      for (const e of enemies) { e.alive = false; e.wreck = null; if (e.g) e.g.visible = false; }
      for (const m of missiles) { m.active = false; if (m.mesh) m.mesh.visible = false; }
      for (const t of surface) { t.alive = false; if (t.g) t.g.visible = false; }
      for (const t of taskForce) { t.alive = false; if (t.g) t.g.visible = false; }
      clearDronePool(); ripple.length = 0; aamRack = 0;
      return { enemies, missiles, surface, taskForce };
    },
    primaryTargets,
    onCarrierTrap() {
      awardBrokenWing('TRAP');
      C.health = 100; C.score += 1000;
      pushEvent('BONUS', 'TRAP BONUS', 1000, '#ffd45a');
      if (C.mode === 'FURBALL' || C.missionPhase !== 4) return;
      C.missionPhase = 5; C.obj = { done: 1, total: 1 }; C.mpT = performance.now();
      if (env.onMissionComplete) env.onMissionComplete();
    },
    get difficulty() { return C.difficulty; },
    fireSelected, pickleUp, dropBomb, setWeapon, toggleWeapon, dispenseFlares, dispenseChaff, fireAAM4, activateECM, setWingOrder, triggerWoundedWingman, spawnAceFlight, spawnAmbush,
    setWingRoles,
    awardBrokenWing, spawnRaiders, handoffRaiders,
    setIntrusionForce(on) { intrForce = !!on; return intrForce; }, forceIntrusion() { return startIntrusion(); },
    get intrusion() { return C.intr; },
    get sc() { return C.sc; },
    spawnDroneSwarm(n = SWARM_MAX, anchor = 'PLAYER') { return spawnSwarm(n, anchor); },
    killDrone(i, how = 'GUN') { return killDrone(i, how); },
    get drones() { return DRONE_TGT; },
    repairEngines() { resetEngines(); return C.engState; },
    get surface() { return surface; }, awardStyle, loadCarrier, placeCarrier, allyCollision, updateJbd, mountJbd, onCarrierMounted, CARRIER_GLB, RETURN_Z, cullFleet,
    // Single visibility writer for the carrier root (and the one shared for heading).
    stepAlly(dt) {
      updateAlly(dt);
      allyStepped = true;
      const a = C.ally;
      if (!a || !a.root) return;
      a.root.position.y = 0;                               // never let the hull drift off sea level
      C.carrierVisible = !!C.missionCarrier || !!(C.rtb && C.rtb.type === 'CARRIER');
      a.root.visible = C.carrierVisible;
      if (C.carrierVisible) for (let p = a.root.parent; p; p = p.parent) p.visible = true;
    },
    get allyRoot() { return C.ally ? (C.ally.root || C.ally.g) : null; },
    get rimSites() { return RIM_SITES; },               // ambient.js searchlights (read-only)
    // Ambient flak density follows live AA masts; positions are a reused Float32Array.
    get activeAAShips() {
      let n = 0;
      for (const t of stagedShips) if (t.alive && !t.aaOff && n < 16) { _aaPos[n++] = t.pos.x; _aaPos[n++] = t.pos.z; }
      AA_SHIPS_N = n >> 1;
      return AA_SHIPS_OBJ;
    },
    setBaseDefencesVisible(v) { for (const g of baseDefG) g.visible = !!v; },
    get strikeTargets() { return strikeTargets; },
    get siteOn() { return SITE_ON; },
    get weakTargets() {
      _weakOut.length = 0;
      for (let i = 0; i < SUB_TGT.length; i++) if (SUB_TGT[i].alive) _weakOut.push(SUB_TGT[i]);
      for (let i = 0; i < SITE_TGT.length; i++) if (SITE_TGT[i].alive) _weakOut.push(SITE_TGT[i]);
      return _weakOut;
    },
    killSite(i) { return hitSite(i | 0, SITE_HP); },
    killSub(i) { const t = stagedShips[i | 0]; return t ? hitSub(t, SUB_HP) : false; },
    forceSalvo() { const t = stagedShips.find(s => s.alive && s.kind === 'CV_FLAG'); if (!t) return false; t.salvo.st = 'TELEGRAPH'; t.salvo.t = FLAG_TELE_S; C.flagBannerT = performance.now(); return true; },
    killStrikes() { for (const t of strikeTargets) if (t.alive) destroySurface(t); return strikeTargets.filter(t => t.alive).length; },
    killStrike(id) { const t = strikeTargets.find(x => x && x.id === id) || strikeTargets[0]; if (t && t.alive) damageSurface(t, 999); return t ? t.id : null; },
    get lockables() { return lockables(); },               // bandits + live task-force ships (HUD target boxes)
    // GPU warm-up: force the normally-hidden HDR muzzle flash and one bolt per tracer
    // pool on screen so their shader programs are built before flight.
    warmVisuals(on) {
      muzzle.visible = muzzleStreak.visible = !!on;
      for (const t of [playerTracers, enemyTracers, baseTracers]) t.mesh.count = on ? Math.max(1, t.list.length) : t.list.length;
      if (on) {
        for (const f of fleet) { f.inst.visible = true; f.inst.count = Math.max(1, f.inst.count); }
        if (glowMesh) { glowMesh.visible = true; glowMesh.count = Math.max(2, glowMesh.count); }
        if (flameOuter) { flameOuter.visible = true; flameOuter.count = Math.max(2, flameOuter.count); }
        if (flameCore) { flameCore.visible = true; flameCore.count = Math.max(2, flameCore.count); }
      } else {
        writeFleet();
      }
    },
    // Engine emergency: F routes here while a fire / relight is pending.
    engineEmergency, fireKey, relightOdds,
    get relightHold() { return RELIGHT_HOLD; },
    // Debug: ignite an engine now (side 'L' / 'R' optional); force the relight outcome ('ok' | 'fail' | null).
    debugEngineFire(side) { C.fireArmed = true; return igniteEngine('DEBUG', side); },
    setRelightForce(v) { C.relightForce = v || null; },
    get taskForce() { return taskForce; },
    get stagedShips() { return stagedShips; },
    get sector() { return C.sector || null; },
    // Debug: jump straight to a phase (1 strait sweep, 2 fleet + bombers, 3 canyon Ace).
    spawnPhase(p) { C.wave = Math.floor(C.wave / 3) * 3 + (p - 1); spawnWave(); },
    // Debug: inflict n HP on task-force ship i (sinks it when HP runs out).
    hitShip(i, n) { const t = taskForce[i]; if (t) damageSurface(t, n); },
    fleetStats() {
      return taskForce.map(t => ({ id: t.id, kind: t.kind, alive: t.alive, hp: Math.round(t.hp), x: Math.round(t.pos.x), z: Math.round(t.pos.z), sink: +(t.sink || 0).toFixed(1),
        wake: +t.wake.material.uniforms.uFade.value.toFixed(2) }));
    },
    // Debug: jump the phase cycle straight to PHASE 3 (Ace + escorts).
    spawnAce() { C.wave = Math.ceil(C.wave / 3) * 3 + 2; spawnWave(); },
    designateGround(t) { C.groundTgt = t || null; C.ccrpArmed = false; },
    get liveBombs() { return liveBombs; }, get flaresLive() { return flares; }, stores,
    emitFire: o => fire.spawn(o), emitSmoke: o => smoke.spawn(o),
    get enemies() { return enemies; }, missiles,
    get ready() { return ready; },
    get lastPlayerMissile() { return C.lastPlayerMsl || null; },
    // Debug: put bogey i straight ahead of the player at `dist` metres, flying away.
    placeAhead(i, dist) {
      const e = enemies[i]; if (!e) return;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(fwd, dist); e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100;
      e.center.copy(e.pos).addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 4000); e.radius = 4000; e.alt = e.pos.y;
      e.speed = 170; orient(e); writeFleet();
    },
    // Debug: bogey i launches a soft- or full-lock missile at the player now.
    banditShot(i, soft, aim, guidance) {
      const e = enemies[i]; if (!e || !e.alive) return;
      if (aim) { e.fwd.copy(S.position).sub(e.pos).normalize(); e.vel.copy(e.fwd).multiplyScalar(e.speed); orient(e); }   // nose on the player first
      launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, { pos: S.position, vel: S.velocity, alive: true, isPlayer: true }, true, soft ? BANDIT_SOFT : BANDIT_FULL, null, guidance || 'IR');
      e.mslCD = 99;
    },
    // Debug: put bogey i at azimuth az (deg, + right) / elevation el (deg, + up) off the nose at `dist` m, flying our heading.
    placeAt(i, az, el, dist) {
      const e = enemies[i]; if (!e) return;
      const dir = new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R)).applyQuaternion(S.quaternion);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(dir, dist); e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100;
      resetAI(e); e.speed = S.velocity.length(); e.vel.copy(fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      e.center.copy(e.pos).addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 40000); e.radius = 40000; e.alt = e.pos.y;
      orient(e); writeFleet();
    },
    // Debug: bogey i head-on at `dist` m, nose-to-nose with the player. noBreak = deliberate ram test.
    placeHeadOn(i, dist, noBreak) {
      const e = enemies[i]; if (!e) return;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(fwd, dist); e.fwd.copy(fwd).negate(); e.alive = true; e.wreck = null; e.hp = 100;
      resetAI(e); e.noBreak = !!noBreak; e.vel.copy(e.fwd).multiplyScalar(e.speed); e.prev.copy(e.pos); e.mslCD = 99; e.burstCD = 99;
      orient(e); writeFleet();
    },
    // Debug: whole wave patrolling ~120 m over the islands (terrain-avoidance stress test).
    lowPatrol(alt = 120) {
      aiPassive = true;
      enemies.forEach((e, k) => {
        if (!e.alive) return;
        const a = k / WAVE_SIZE * Math.PI * 2;
        e.center.set(env.terrainCenter.x, 0, env.terrainCenter.z); e.radius = 2500 + k * 900; e.alt = alt;
        e.pos.set(env.terrainCenter.x + Math.sin(a) * e.radius, 0, env.terrainCenter.z + Math.cos(a) * e.radius);
        e.pos.y = groundLevel(e.pos.x, e.pos.z) + 200; e.prev.copy(e.pos); e.mslCD = 999; e.burstCD = 999;
      });
    },
    // Debug: bandit i flying our heading `dist` m ahead, offset so the gun line
    // crosses its left wing ('L'), right wing ('R') or core ('C'); passive.
    wingTest(i, side, dist) {
      const e = enemies[i]; if (!e) return;
      aiPassive = true;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(S.quaternion);
      const off = side === 'L' ? 5.0 : side === 'R' ? -5.0 : 0;               // 8 mrad spread stays on the outer wing
      e.pos.copy(S.position).addScaledVector(fwd, dist).addScaledVector(right, off);
      e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100; resetAI(e); e.noBreak = true;
      e.speed = S.velocity.length(); e.cruise = e.abSpeed = e.speed; e.vel.copy(fwd).multiplyScalar(e.speed); e.prev.copy(e.pos);
      e.center.copy(e.pos).addScaledVector(new THREE.Vector3(fwd.z, 0, -fwd.x), 60000); e.radius = 60000; e.alt = e.pos.y;
      { const r = e.pos.clone().sub(e.center).setY(0).normalize(); e.dir = (-r.z * fwd.x + r.x * fwd.z) >= 0 ? 1 : -1; }   // patrol circle runs along our heading
      e.mslCD = 999; e.burstCD = 999; e.flaresLeft = 0;
      orient(e); writeFleet();
    },
    killEnemy(i) { const e = enemies[i]; if (e && e.alive) destroyEnemy(e, true); },
    // Debug: put bogey i on the player's six at `dist` metres, nose on, pursuing.
    placeBehind(i, dist) {
      const e = enemies[i]; if (!e) return;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(S.quaternion);
      e.pos.copy(S.position).addScaledVector(fwd, -dist); e.fwd.copy(fwd); e.alive = true; e.wreck = null; e.hp = 100;
      resetAI(e); e.tac = e.mode = 'ENGAGE'; e.speed = S.velocity.length(); e.vel.copy(fwd).multiplyScalar(e.speed); e.prev.copy(e.pos); e.mslCD = 0; e.bLock = 0; orient(e); writeFleet();
    },
    stats() {
      return { difficulty: C.difficulty,
        carrier: env.getCarrierStats ? env.getCarrierStats() : null,
        ally: C.ally ? { glb: !!C.ally.glb, len: +C.ally.len.toFixed(1), deckY: +C.ally.deckY.toFixed(1), island: C.ally.island || null } : null,
        tele: env.getTeleStats ? env.getTeleStats() : null,
        mission: { phase: C.missionPhase, label: MP[C.missionPhase] ? MP[C.missionPhase].label : 'COMPLETE',
          done: C.obj.done, total: C.obj.total, primary: primaryTargets().length },
        furball: { mode: C.mode, alive: waveAlive() + enemies.filter(e => e.alive && e.aceFlight).length,
          kills: C.furballKills || 0, nextAce: FURBALL_ACE_EVERY - (C.furballKills || 0) % FURBALL_ACE_EVERY },
        drones: { on: !!C.swarm.on, alive: C.swarm.alive, n: C.swarm.n, anchor: C.swarm.anchor,
          spawned: droneSpawned, killed: droneKilled, cleared: droneCleared,
          cull: droneGeo.boundingSphere ? Math.round(droneGeo.boundingSphere.radius) : 0,
          pos: DRONE_TGT.filter(d => d.alive).map(d => d.pos.toArray().map(v => Math.round(v))).slice(0, 8) },
        loadout: { spw: C.spw, wpn: C.weapon, qaam: C.qaam, livery: env.getLivery ? env.getLivery() : null },
        psm: { active: !!S.psm, alphaPk: +(S.alphaPk * D2R).toFixed(1), spin: S.spin || 0, lastMan: C.manLabel || '—' },
        assist: S.assist || 0, returnT: C.returnT || 0,
        strike: { alive: strikeAlive() ? strikeTargets.filter(t => t.alive).length : 0,
          labels: strikeTargets.filter(t => t.alive).map(t => t.label).join(','),
          jamming: +(C.jamming || 0).toFixed(2), sectorLow: !!C.sectorLow },
        aceFlight: { done: aceFlightDone, alive: enemies.filter(e => e.aceFlight && e.alive).length,
          labels: enemies.filter(e => e.aceFlight && e.alive).map(e => e.label).join(',') },
        director: { max: director.max, stagger: director.stagger, inFlight: director.inFlight, peak: director.peak,
          launches: director.launches, denied: director.denied, cooldown: +director.cooldown.toFixed(2) },
        alive: enemies.filter(e => e.alive).length, wrecks: enemies.filter(e => e.wreck).length, modes: enemies.map(e => e.alive ? TAC_CODE[e.tac] || '?' : '-').join(''),
        ai: Object.fromEntries(Object.entries(ai).map(([k, v]) => [k, Number.isFinite(v) ? +v.toFixed(1) : null])),
        e0: enemies[0] ? { tac: enemies[0].tac, bank: Math.round(enemies[0].bank / D2R), g: +enemies[0].gNow.toFixed(1), kt: Math.round(enemies[0].speed / KT), ab: +enemies[0].ab.toFixed(2),
          alt: Math.round(enemies[0].pos.y), flr: enemies[0].flaresLeft, alive: enemies[0].alive,
          hp: enemies[0].hp, wingL: enemies[0].wingL, wingR: enemies[0].wingR, off: (enemies[0].wingOffL ? 'L' : '') + (enemies[0].wingOffR ? 'R' : ''),
          hits: DBG_HITS.join(' '), crip: enemies[0].crippled, vy: Math.round(enemies[0].vel.y), eng: enemies[0].engineFire, zone: enemies[0].zoneLog, debris: debris.length } : null,
        tracers: playerTracers.list.length, enemyTracers: enemyTracers.list.length, missiles: missiles.filter(m => m.active).length, wave: C.wave,
        aceRounds: C.aceRounds || 0, aceHits: C.aceHits || 0, blockedLaunches: C.blockedLaunches || 0,
        samLaunched: C.samLaunched || 0, samFlared: C.samFlared || 0, samMasked: C.samMasked || 0, samHit: C.samHit || 0, samLive: C.samLive || 0,
        subKills: C.subKills || 0, siteKills: C.siteKills || 0,
        bw: { eligible: !!C.bw.eligible, landed: !!C.bw.landed, out: C.engineOut || null },
        intr: { st: C.intr.st, used: C.intr.used, ace: C.intr.ace, hold: !!C.wingHold },
        ambush: { active: !!C.ambushActive, n: enemies.filter(e => e.alive && e.ambush).length },
        shortcut: { st: C.sc.st, used: C.sc.used, gateIdx: C.gateIdx, save: GORGE_SC_SAVE_M, bannerT: C.sc.bannerT },
        buzz: { tower: C.buzzTower || 0, jet: C.buzzJet || 0 },
        weak: { sites: Array.from(SITE_ON).reduce((a, b) => a + b, 0), sectors: Array.from(sectorDead).reduce((a, b) => a + b, 0),
          salvos: stagedShips.filter(t => t.kind === 'CV_FLAG').map(t => t.salvo.st + ':' + t.salvo.fire).join(',') },
        tgt: { armed: C.seekerArmed, wpn: C.weapon, multi: C.multi.map((e, i) => e.label.slice(-2) + ':' + C.multiState[i][0]).join(' '), locked: C.multiLocked,
          aam4: C.aam4, aamRld: +C.aam4Reload.toFixed(1), aamFired: C.aamFired || 0, ripple: ripple.length,
          aamLive: missiles.filter(m => m.active && m.aam).map(m => (m.target && m.target.label ? m.target.label.slice(-2) : 'dumb') + '@' + (m.target && m.target.pos ? Math.round(m.target.pos.distanceTo(m.mesh.position)) : '-')).join(' ') },
        rwr: { level: C.rwrLevel, list: C.rwr.map(r => r.kind + '@' + Math.round(r.b / D2R)).join(' ') },
        ecm: { st: C.ecmState, t: +C.ecmT.toFixed(1), breaks: C.ecmBreaks },
        gun: { heat: +C.gunHeat.toFixed(2), over: C.gunOverheat, overheats: C.overheats || 0, ammo: C.ammo },
        style: { mult: C.comboMult, timer: +C.comboTimer.toFixed(1), bonus: C.comboBonus, danger: C.dangerClose, counts: C.styleCounts,
          feed: C.styleFeed.map(s => s.text).join('|'), score: C.score, flr: C.flares,
          chf: C.chaff, chfMax: C.chaffMax, chaffClouds: chaff.length,
          notch: C.notchT > 0 ? +(performance.now() - C.notchT).toFixed(0) : null,
          wingRoles: { w2: C.wingRoles.w2, w3: C.wingRoles.w3 },
          wingOrder: C.wingOrder, wingOrderName: WING_ORDERS[C.wingOrder],
          wingOrderAge: C.wingOrderT ? +(performance.now() - C.wingOrderT).toFixed(0) : null,
          limp: { st: C.limp.st, n: C.limp.n, w2hp: C.limp.w && C.limp.w.hp !== undefined ? Math.round(C.limp.w.hp) : null },
          aceFlight: { done: aceFlightDone, alive: enemies.filter(e => e.aceFlight && e.alive).length,
            labels: enemies.filter(e => e.aceFlight && e.alive).map(e => e.label).join(',') } },
        phase: { phase: C.phase, wave: C.wave, ace: C.ace, aceDowns: C.aceDowns,
          aceE: (() => { const a = enemies.find(x => x.ace); return a ? { tac: a.tac, hp: Math.round(a.hp), wingL: a.wingL, wingR: a.wingR, kt: Math.round(a.speed / KT), g: +a.gNow.toFixed(1), flr: a.flaresLeft, alive: a.alive } : null; })() },
        ground: { tgts: surface.map(t => t.id + (t.alive ? '' : 'x')).join(' '), tgt: C.groundTgt ? C.groundTgt.label : null,
          ccrp: C.ccrp ? { along: Math.round(C.ccrp.along), cross: Math.round(C.ccrp.cross), ttr: +C.ccrp.ttr.toFixed(1), rng: Math.round(C.ccrp.range) } : null,
          armed: !!C.ccrpArmed, rel: C.ccrpRelease || null },
        dmg: { pct: Math.round(100 - C.health), hyd: !!C.hydraulic, out: C.engineOut || null, fire: !!C.engineFire },
        eng: { L: C.engL, R: C.engR, side: C.engSide, fireT: +C.fireT.toFixed(1), relightT: +C.relightT.toFixed(2), used: C.relightUsed, result: C.relightResult, p: +(C.relightP || 0).toFixed(2), armed: C.fireArmed },
        zone: { sector: C.sector ? C.sector.code : null, terrainBreaks: C.terrainBreaks || 0, baseHits: C.baseHits || 0, baseKills: C.baseKills || 0,
          shots: C.mslLog.slice(-4).map(x => x.tag + ':' + x.result).join(' '), sams: missiles.filter(m => m.active && m.sam).length, provoked: fleetProvoked,
          fleet: taskForce.map(t => t.id + (t.alive ? ':' + Math.round(100 * t.hp / t.hpMax) : 'x')).join(' '), bombers: enemies.filter(e => e.bomber).map(e => e.label.slice(-1) + (e.alive ? (e.bombed ? 'B' : 'I') : 'x')).join('') },
        lock: { next: C.nextTarget?.label || null, tgt: C.designated?.label || null, state: C.lockState, prog: +C.lockProgress.toFixed(2), off: +((C.seekerOff || 0) / D2R).toFixed(1), nm: +((C.targetRange || 0) / NM).toFixed(2) },
        cloud: { player: +(C.playerCloud || 0).toFixed(2), tgt: +((C.designated && C.designated.cloud) || 0).toFixed(2), obscured: !!C.targetObscured, breaks: C.cloudBreaks || 0,
          msl: missiles.filter(m => m.active).map(m => (m.q || MSL_FULL).tag + (m.cloudLost ? '/cloudLost' : m.lostTrack ? '/lost' : '') + (m.reacquired ? '/reacq' : '') + ' c' + (m.cloud || 0).toFixed(2)).join(' ') },
        bandit: { lock: +C.banditLock.toFixed(2), rwr: C.rwrTrack, incoming: C.incoming || 0, warn: +C.missileWarning.toFixed(2) },
        sun: { t: +(C.sunT || 0).toFixed(2), blinds: C.sunBlinds || 0, cd: +(C.sunCD || 0).toFixed(2) },
        intercepts: C.mslIntercepts || 0,
        shots: C.mslLog.map(l => l.tag + ':' + l.result + '@' + l.t).join(' '),
        stores: { wpn: C.weapon, msl: C.missiles, mslOnPylons: stores.msl.filter(s => s.node.visible).map(s => s.n).join(','),
          bombs: C.bombs, bombsOnPylons: stores.bomb.filter(s => s.node.visible).length,
          falling: liveBombs.map(b => b.name + '@' + b.obj.position.y.toFixed(0) + 'm/sameGeo=' + sameGeo(b)).join(' '),
          ccip: C.ccip ? C.ccip.toArray().map(x => Math.round(x)) : null, tof: +C.ccipTof.toFixed(2),
          lastDrop: C.lastDrop ? { name: C.lastDrop.name, ccip: C.lastDrop.ccip && C.lastDrop.ccip.toArray().map(x => Math.round(x)) } : null,
          lastImpact: lastImpact ? { name: lastImpact.name, p: lastImpact.p.toArray().map(x => Math.round(x)), t: lastImpact.t } : null,
          flr: C.flares, flaresLive: flares.length, decoyed: C.decoyed || 0,
          flareRel: flares.slice(0, 2).map(f => f.pos.clone().sub(S.position).applyQuaternion(S.quaternion.clone().invert()).toArray().map(x => Math.round(x)).join('/') + ' age' + f.age.toFixed(2)).join(' '),
          fireOn: fire.p.filter(q => q.on).length, smokeOn: smoke.p.filter(q => q.on).length,
          pylonMissile: missiles.filter(m => m.active && m.visual).length },
        live: missiles.filter(m => m.active).map(m => (m.q || MSL_FULL).tag + (m.lostTrack ? '/lost' : '') + (m.target && !m.lostTrack ? '@' + Math.round(m.target.pos.distanceTo(m.mesh.position)) : '')).join(' ') };
    }
  };
}
