// ANGELS ZERO — coastal archipelago, winding canyon fortress & naval fjord strait.
//
// Terrain v2: each theatre is an offline-baked 2048^2 heightfield + splat over a 40 x 40 km
// core centred on (0, -2500) (scripts/bake_terrain.mjs -> assets/terrain/<map>/, ~19.5 m
// texels, droplet + thermal erosion, authored gameplay ground protected), surrounded by the
// analytic horizonHeight ring and drawn by an 8-level GPU clipmap (src/clipmap.js, 131 km).
// Authored geography (shared with the baker) lives in src/geography.js:
//   ARCHIPELAGO
//     MAIN     central-south airbase island: basalt escarpments on the north / east
//              coasts, jagged NE alpine massif (~720 m) with a carved mountain river,
//              NW ridge (~520 m) + summit observatory, west harbour + coastal city
//              skyline + container port, runway peninsula reaching south; both RWY 18/36
//              approach funnels are capped low and kept clear of rock; island highways
//              link AFB, Port City and both strait bridges.
//     CANYON   north-west canyon massif: 330-500 m plateau of ridged crests split by a
//              winding sea-level gorge (350-550 m sheer walls, natural stone arch).
//     VOLCANO  north-east caldera + peak (~975 m rim), glowing magma fissures, radial
//              obsidian lava channels, terraced flanks, rising fumarole steam plume.
//     ATOLLS   east & west crescent reef islands: turquoise coral lagoons, sea cliffs,
//              lighthouses + hilltop radar stations.
//     Monumental suspension bridges (240 m towers, 380 ft clearance) with live night
//     traffic, offshore wind farm, 3 oil platforms, merchant shipping, ~15 sea stacks.
//   GORGE      25 km winding trench + shortcut ravine + fortified octagonal crater
//              citadel + 3 high-altitude steel canyon truss bridges.
//   STRAIT     9.5 km wide deep-water naval battle channel framed by towering east/west
//              basalt fjord cliffs, volcanic headlands, sea stacks and cape lighthouses.
//
//   Northern / eastern mainland alpine range (to ~1.7 km) frames every theatre.
//
// The clipmap vertex shader and every gameplay height query share one height function:
// heightAt() (terrainpack.createSampler) is the exact CPU twin of terrainHeight() in GLSL
// (same Uint16 bilinear + crag + horizon), so crashes, missiles, bombs and props agree with
// what is on screen (scripts/terrain_parity.mjs checks it).

export { WORLD, RWY, CORE } from './geography.js?v=s10ter2';
const FT = 0.3048;
import { WORLD, RWY, CORE, createGeography } from './geography.js?v=s10ter2';

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadTerrainPack, createSampler } from './terrainpack.js?v=s10ter2';
import { createClipmap, CM_VERTEX_PARS, CM_VERTEX_BODY, TERRAIN_HEIGHT_GLSL } from './clipmap.js?v=s10ter2';
import { gorgeCentreX, gorgeSlope, gorgeHeading, gorgeDist, GORGE_FLOOR_Y, GORGE_RIM_Y, GORGE_CRATER_R,
  GORGE_CRATER_WALL_Y, GORGE_CRATER_Z, GORGE_GATE_Z, GORGE_GATE_N, GORGE_FORT, CEIL_M,
  GORGE_BBOX, GORGE_HALF_W, GORGE_RAMP_W, SEA_FLOOR_Y, RUNWAY_BBOX,
  GORGE_SC_X, GORGE_SC_ZA, GORGE_SC_ZB, GORGE_SC_HALF_W, GORGE_SC_RAMP_W, GORGE_SC_FLOOR_Y,
  GORGE_SC_ARCH_Z, GORGE_SC_ARCH_Y0, GORGE_SC_ARCH_Y1, GORGE_SC_ARCH_W, GORGE_SC_ARCH_D } from './maps.js?v=s9dz';

export function createWorld(THREE, env) {
  const { scene, createNoise2D, fbm } = env;
  const clamp = THREE.MathUtils.clamp;
  // Smoothstep that also works with reversed edges (a > b): 1 at a .. 0 at b.
  const ss = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const nCoast = createNoise2D(4242), nHill = createNoise2D(991), nDet = createNoise2D(7);
  const nRidge = createNoise2D(1337), nSea = createNoise2D(2718), nVeg = createNoise2D(31);

  /* ---------------------------------------------- geography (Terrain v2) */
  // Every theatre's analytic relief lives in src/geography.js (shared with the offline
  // baker). The runtime renders and collides against the BAKED packs; the analytic
  // functions remain only for strait / gorge prop placement on erosion-protected sites.
  const G = createGeography({ createNoise2D, fbm });
  const { analyticHeight, gorgeHeight, straitHeight, BRIDGES, DECK_TOP, DECK_UNDER, TOWER_TOP, REEF,
    canyonX, canyonHalf, capsule, ridged, inApproach } = G;

  /* ------------------------------------------- baked terrain packs + heightAt */
  // packs[mode] = decoded baked pack; samplers[mode] = exact CPU twin of the clipmap VS.
  const PACK_BASE = env.packBase || 'assets/terrain', PACK_TAG = env.packTag || '';
  const packs = { archipelago: env.pack };
  const samplers = { archipelago: createSampler(env.pack) };
  let sampler = samplers.archipelago, oceanMode = false;
  sampler.setViewer(1e9, 1e9);                             // no crag while boot props are placed
  // heightAt(x, z): baked 2048^2 bilinear + crag (near the viewer) + horizon outside the core;
  // identical to what the clipmap draws. Ocean-only maps answer the open-ocean floor.
  function heightAt(x, z) { return oceanMode ? SEA_FLOOR_Y : sampler.heightAt(x, z); }
  const OCEAN_HEIGHT = () => SEA_FLOOR_Y;

  /* -------------------------------------------------- terrain mesh */
  // v1.2.1 seamless RGB detail atlas (built once at boot):
  //   R  periodic 5-octave value FBM (macro soil / grass / cloud-shadow noise), rescaled to the
  //      old 0.15..0.85 range so every existing .r consumer keeps its thresholds;
  //   G  sharp ridged multifractal (1 - |2 fbm - 1|)^2: rock fractures, scree streaks, striations;
  //   B  high-frequency micro-grain (lattice periods 16 / 32 / 64): no smooth "Play-Doh" ground.
  // Periodic lattice value noise (like vfx.js vper) on per-period hash tables: the tile wraps
  // with zero seams and the whole build stays a few tens of ms.
  function detailTexture(size, seed) {
    let st = (seed * 2654435761) >>> 0;
    const rnd = () => { st = (st + 0x6d2b79f5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const N2 = size * size, R = new Float32Array(N2), G = new Float32Array(N2), B = new Float32Array(N2);
    // Accumulate one periodic octave (P lattice cells across the tile) into dst, weight amp.
    // Lattice coordinates are integer-aligned per texel row/column, so the smoothstep weights
    // and wrapped indices are computed once per column / row (fast boot, zero seams).
    const sxW = new Float32Array(size), x0I = new Int32Array(size), x1I = new Int32Array(size);
    function octave(dst, P, amp) {
      const tb = new Float32Array(P * P); for (let i = 0; i < tb.length; i++) tb[i] = rnd();
      const off = rnd();                                  // decorrelate octaves (sub-cell phase)
      for (let x = 0; x < size; x++) {
        const f = (x / size) * P + off, xi = Math.floor(f), xf = f - xi;
        sxW[x] = xf * xf * (3 - 2 * xf); x0I[x] = xi % P; x1I[x] = (xi + 1) % P;
      }
      for (let y = 0; y < size; y++) {
        const f = (y / size) * P + off, yi = Math.floor(f), yf = f - yi, sy = yf * yf * (3 - 2 * yf);
        const r0 = (yi % P) * P, r1 = ((yi + 1) % P) * P, row = y * size;
        for (let x = 0; x < size; x++) {
          const a = tb[r0 + x0I[x]], b = tb[r0 + x1I[x]], c = tb[r1 + x0I[x]], d = tb[r1 + x1I[x]], sx = sxW[x];
          dst[row + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        }
      }
    }
    const fbmInto = (dst, periods) => { let amp = 0.5; for (const P of periods) { octave(dst, P, amp); amp *= 0.5; } };
    fbmInto(R, [4, 8, 16, 32, 64]);
    fbmInto(G, [6, 12, 24, 48]);
    fbmInto(B, [16, 32, 64]);
    { let lo = 1e9, hi = -1e9; for (let i = 0; i < N2; i++) { if (G[i] < lo) lo = G[i]; if (G[i] > hi) hi = G[i]; }
      for (let i = 0; i < N2; i++) { const r = 1 - Math.abs(2 * (G[i] - lo) / Math.max(1e-6, hi - lo) - 1); G[i] = r * r; } }
    const stretch = (A, lo2, hi2) => { let lo = 1, hi = 0; for (let i = 0; i < N2; i++) { if (A[i] < lo) lo = A[i]; if (A[i] > hi) hi = A[i]; } const s = (hi2 - lo2) / Math.max(1e-6, hi - lo); for (let i = 0; i < N2; i++) A[i] = lo2 + (A[i] - lo) * s; };
    stretch(R, 0.15, 0.85); stretch(G, 0.0, 1.0); stretch(B, 0.0, 1.0);
    const d = new Uint8Array(N2 * 4);
    for (let i = 0; i < N2; i++) { d[i * 4] = R[i] * 255; d[i * 4 + 1] = G[i] * 255; d[i * 4 + 2] = B[i] * 255; d[i * 4 + 3] = 255; }
    const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  }
  const COL = {
    deep: new THREE.Color(0x162d3d), seabed: new THREE.Color(0x9b967c), coral: new THREE.Color(0x2a8f88),
    basalt: new THREE.Color(0x252b31), sand: new THREE.Color(0xcbb98c),
    grass: new THREE.Color(0x3f6e34), forest: new THREE.Color(0x244a28),
    dryGrass: new THREE.Color(0x8c7f4a), tundra: new THREE.Color(0x7c7864),
    ridge: new THREE.Color(0x595e4c), cliff: new THREE.Color(0x464a4f), peak: new THREE.Color(0x8c8a85),
    snow: new THREE.Color(0xeef3f8), cinder: new THREE.Color(0x252126), lava: new THREE.Color(0xa83a14),
    pad: new THREE.Color(0x6f7660),
    canyonFloor: new THREE.Color(0x685a49), canyonWall: new THREE.Color(0x784e38),
    canyonRim: new THREE.Color(0x8f744c), crater: new THREE.Color(0x363a40)
  };
  const glslCol = c => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  // GLSL port of the v1.x per-vertex palette (computeTerrainColors): coast / seabed, humid
  // emerald valleys vs arid ochre highlands, cliffs, weathered peaks, caldera cinder and the
  // canyon trench, evaluated per pixel from the baked height + normal. Relief scale is set
  // for the v2 mountains (h01 over 1,400 m).
  const TERRAIN_BASE_GLSL = `
    vec3 terrainBase(float h, float slope, vec2 xz) {
      float v = clamp((texture2D(uDetail, xz * 0.00011 + vec2(0.13, 0.57)).r - 0.15) / 0.7, 0.0, 1.0);
      float moistRaw = clamp((texture2D(uDetail, xz * 0.000021 + vec2(0.31, 0.17)).r - 0.15) / 0.7, 0.0, 1.0);
      float tempRaw = clamp((texture2D(uDetail, xz * 0.000017 + vec2(0.61, 0.23)).r - 0.15) / 0.7, 0.0, 1.0);
      float h01 = clamp(h / 1400.0, 0.0, 1.0);
      float valleyMoist = clamp(moistRaw * 1.15 - h01 * 0.42 + (1.0 - hzSS(slope, 0.08, 0.34)) * 0.18, 0.0, 1.0);
      float tempEff = clamp(tempRaw * 0.85 + 0.15 - h01 * 0.55, 0.0, 1.0);
      bool trench = uMapMode > 0.5 && uMapMode < 1.5
        && !(xz.x >= ${RUNWAY_BBOX.x[0].toFixed(1)} && xz.x <= ${RUNWAY_BBOX.x[1].toFixed(1)} && xz.y >= ${RUNWAY_BBOX.z[0].toFixed(1)} && xz.y <= ${RUNWAY_BBOX.z[1].toFixed(1)})
        && xz.x >= ${GORGE_BBOX.x[0].toFixed(1)} && xz.x <= ${GORGE_BBOX.x[1].toFixed(1)} && xz.y <= ${GORGE_BBOX.z[0].toFixed(1)} && xz.y >= ${GORGE_BBOX.z[1].toFixed(1)};
      vec3 c;
      if (h < 0.0) {
        c = mix(${glslCol(COL.seabed)}, ${glslCol(COL.coral)}, hzSS(-h, 1.2, 8.5) * (1.0 - hzSS(-h, 14.0, 30.0)));
        c = mix(c, ${glslCol(COL.basalt)}, hzSS(slope, 0.28, 0.48));
        c = mix(c, ${glslCol(COL.deep)}, hzSS(-h, 6.0, 58.0));
      } else if (trench && h < 900.0) {
        float cr = length(xz - vec2(${gorgeCentreX(GORGE_CRATER_Z).toFixed(1)}, ${GORGE_CRATER_Z.toFixed(1)}));
        c = mix(${glslCol(COL.canyonFloor)}, ${glslCol(COL.canyonRim)}, hzSS(h, ${(GORGE_FLOOR_Y + 25).toFixed(1)}, ${(GORGE_RIM_Y - 15).toFixed(1)}));
        c = mix(c, ${glslCol(COL.canyonWall)}, hzSS(slope, 0.17, 0.38));
        c = mix(c, ${glslCol(COL.basalt)}, hzSS(slope, 0.44, 0.70) * 0.45);
        if (cr < ${(GORGE_CRATER_R * 1.1).toFixed(1)}) c = mix(c, ${glslCol(COL.crater)}, hzSS(cr, ${(GORGE_CRATER_R * 1.1).toFixed(1)}, ${(GORGE_CRATER_R * 0.55).toFixed(1)}) * (1.0 - hzSS(h, 90.0, 240.0)));
        if (h > 480.0) c = mix(c, ${glslCol(COL.peak)}, hzSS(h, 500.0, 740.0) * (1.0 - 0.5 * hzSS(slope, 0.40, 0.70)));
      } else {
        c = mix(${glslCol(COL.basalt)}, ${glslCol(COL.sand)}, (1.0 - hzSS(slope, 0.09, 0.24)) * hzSS(h, 0.3, 2.2) * (1.0 - hzSS(h, 8.5, 14.0)));
        vec3 humid = mix(${glslCol(COL.grass)}, ${glslCol(COL.forest)}, clamp(v * 0.85 + (1.0 - tempEff) * 0.3, 0.0, 1.0));
        vec3 arid = mix(${glslCol(COL.dryGrass)}, ${glslCol(COL.tundra)}, hzSS(h, 260.0, 700.0) * 0.72);
        float aridMix = clamp((1.0 - hzSS(valleyMoist, 0.28, 0.66)) * 0.78 + hzSS(h, 220.0, 620.0) * 0.52, 0.0, 1.0);
        humid = mix(humid, arid, aridMix);
        c = mix(c, humid, hzSS(h, 4.0, 13.0) * (1.0 - hzSS(slope, 0.16, 0.30)));
        c = mix(c, ${glslCol(COL.ridge)}, hzSS(h, 280.0, 640.0) * 0.35 * (1.0 - aridMix * 0.5));
        c = mix(c, ${glslCol(COL.cliff)}, hzSS(slope, 0.17, 0.32) * hzSS(h, 2.0, 10.0));
        c = mix(c, ${glslCol(COL.basalt)}, hzSS(slope, 0.28, 0.48) * (1.0 - hzSS(h, 28.0, 85.0)));
        float weather = hzSS(texture2D(uDetail, xz * 0.0008).g * 1.4 - 0.7 + (h - 720.0) / 260.0, -0.22, 0.35);
        c = mix(c, ${glslCol(COL.peak)}, hzSS(h, 560.0, 860.0) * (1.0 - 0.45 * hzSS(slope, 0.38, 0.68)) * weather);
        float vd = uMapMode < 0.5 ? length(xz - vec2(5600.0, -8300.0)) : 99999.0;
        if (vd < 950.0) {
          c = mix(c, ${glslCol(COL.cinder)}, hzSS(vd, 900.0, 320.0) * hzSS(h, 460.0, 680.0));
          if (vd < 380.0 && h < 760.0) c = mix(c, ${glslCol(COL.lava)}, hzSS(vd, 360.0, 110.0) * (1.0 - hzSS(slope, 0.25, 0.55)) * 0.55);
        }
        if (uMapMode < 1.5 && abs(h - ${RWY.elev.toFixed(1)}) < 0.6 && abs(xz.x - ${(RWY.x + 85).toFixed(1)}) < 360.0 && xz.y > ${(RWY.z0 - 140).toFixed(1)} && xz.y < ${(RWY.z1 + 160).toFixed(1)}) c = mix(c, ${glslCol(COL.pad)}, 0.6);
      }
      return c;
    }`;


  const _dt0 = performance.now();
  const detail = detailTexture(512, 777);
  const detailMs = +(performance.now() - _dt0).toFixed(1);
  // Shared terrain uniforms (pack textures + core frame), referenced by all 8 level materials.
  const TERRAIN_U = {
    uHeight: { value: null }, uNormalTex: { value: null }, uSplat: { value: null },
    uCore: { value: new THREE.Vector4() }, uHRange: { value: new THREE.Vector2() },
    uMapId: { value: 0 }, uViewer: { value: new THREE.Vector3(1e9, 0, 1e9) }
  };
  const lin = hex => new THREE.Color(hex);
  const FARM_U = {
    uPal: { value: [0x4a5935, 0x7e6c47, 0x3a4c2d, 0x42382c, 0x64684a].map(lin) },
    uHedge: { value: lin(0x26331f) }, uRoad: { value: lin(0x5d5c57) }, uHwy: { value: lin(0x35383d) },
    uShore: { value: lin(0x8e7c58) }, uSand: { value: lin(0xc8b482) },
    uRockA: { value: lin(0x54575c) }, uRockB: { value: lin(0x282d33) }, uRockHi: { value: lin(0x8b877f) },
    uPeak: { value: lin(0x88857d) }, uSnow: { value: lin(0xe8eff7) }, uRiver: { value: lin(0x185258) },
    uAfb: { value: new THREE.Vector4(RWY.x - 300, RWY.x + 560, RWY.z0 - 450, RWY.z1 + 450) },
    uTown: { value: new THREE.Vector4(-2050, -450, -1850, 350) },
    uGorgeBox: { value: new THREE.Vector4(GORGE_BBOX.x[0] - 450, GORGE_BBOX.x[1] + 450, GORGE_BBOX.z[1] - 450, GORGE_BBOX.z[0] + 450) },
    uMapMode: { value: 0 },                             // 0 archipelago, 1 gorge, 2 strait
    uCloudOff: { value: new THREE.Vector2(0, 0) },
    // Crisp slope gates + strong ridge accent (after ZyFou/ProceduralTerrains terrainColor.glsl, MIT):
    // rock cuts in sharply from slope 0.16 to 0.29 (1 - normal.y); snow holds on flat ledges
    // below 0.20 and sheds cleanly off steep walls above 0.44; uAORidge brightens alpine crests.
    uRockSlopeLo: { value: 0.16 }, uRockSlopeHi: { value: 0.29 },
    uSnowSlopeMin: { value: 0.20 }, uSnowSlopeMax: { value: 0.44 },
    uAORidge: { value: 0.72 }, uGorgeFloor: { value: GORGE_FLOOR_Y },
    // Directional Mie aerial perspective + valley mist (driven by atmosphere.setTerrainFog).
    uSun: { value: new THREE.Vector3(0.4, 0.7, -0.5).normalize() },
    uMieCol: { value: lin(0xffd69e) },
    uMieK: { value: 0.95 },
    uMistH: { value: 190.0 },
    uMistK: { value: 1.0 },
    uCloudShadowK: { value: 1.0 }
  };
  const FARM_GLSL = `
    uniform vec3 uPal[5]; uniform vec3 uHedge; uniform vec3 uRoad; uniform vec3 uHwy; uniform vec3 uShore; uniform vec3 uSand;
    uniform vec3 uRockA; uniform vec3 uRockB; uniform vec3 uRockHi; uniform vec3 uPeak; uniform vec3 uSnow; uniform vec3 uRiver;
    uniform vec4 uAfb; uniform vec4 uTown; uniform vec4 uGorgeBox;
    uniform float uMapMode; uniform vec2 uCloudOff;
    uniform float uRockSlopeLo, uRockSlopeHi, uSnowSlopeMin, uSnowSlopeMax, uAORidge, uGorgeFloor;
    uniform vec3 uSun; uniform vec3 uMieCol; uniform float uMieK;
    uniform float uMistH; uniform float uMistK; uniform float uCloudShadowK;
    // vEro / vWNrm / vLand / vCore are set per pixel from the baked splat + normal textures (map_fragment).
    // Screen-space micro-normal perturbation (same maths as three.js perturbNormalArb):
    // dHdxy is the screen derivative of a procedural micro-height, no extra texture taps.
    vec3 azPerturbNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
      vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
      vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
      float fDet = dot(sx, r1) * faceDir;
      vec3 grad = sign(fDet) * (dHdxy.x * r1 + dHdxy.y * r2);
      return normalize(abs(fDet) * surfNorm - grad);
    }
    float fh12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float rectMask(vec2 p, vec4 r, float f) {
      vec2 d = max(vec2(r.x - p.x, r.z - p.y), vec2(p.x - r.y, p.y - r.w));
      return 1.0 - smoothstep(0.0, f, max(d.x, d.y));
    }
    float segDist(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.0), 0.0, 1.0);
      return length(pa - ba * h);
    }
    float hwyNetwork(vec2 xz) {
      float d = segDist(xz, vec2(-3400.0, -3200.0), vec2(-2300.0, -2150.0));
      d = min(d, segDist(xz, vec2(-2300.0, -2150.0), vec2(-1320.0, -1080.0)));
      d = min(d, segDist(xz, vec2(-1320.0, -1080.0), vec2(-320.0, -620.0)));
      d = min(d, segDist(xz, vec2(-320.0, -620.0), vec2(580.0, -450.0)));
      d = min(d, segDist(xz, vec2(3300.0, -3250.0), vec2(2250.0, -2300.0)));
      d = min(d, segDist(xz, vec2(2250.0, -2300.0), vec2(1560.0, -1420.0)));
      d = min(d, segDist(xz, vec2(1560.0, -1420.0), vec2(1380.0, -520.0)));
      d = min(d, segDist(xz, vec2(-3700.0, -4550.0), vec2(-4300.0, -6300.0)));
      d = min(d, segDist(xz, vec2(-4300.0, -6300.0), vec2(-4820.0, -7350.0)));
      d = min(d, segDist(xz, vec2(3850.0, -4600.0), vec2(4700.0, -6250.0)));
      d = min(d, segDist(xz, vec2(4700.0, -6250.0), vec2(4200.0, -7550.0)));
      return d;
    }
    vec3 farmField(vec2 xz, out vec3 e) {
      vec2 q = xz / 2400.0, ci = floor(q);
      float f1 = 9.0, f2 = 9.0; vec2 rid = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = ci + vec2(float(i), float(j));
        vec2 pt = g + 0.15 + 0.7 * vec2(fh12(g), fh12(g + 17.3));
        float d = length(q - pt);
        if (d < f1) { f2 = f1; f1 = d; rid = g; } else if (d < f2) f2 = d;
      }
      float k = floor(fh12(rid + 5.1) * 4.0);
      float ang = k < 1.0 ? 0.0 : k < 2.0 ? 0.383972 : k < 3.0 ? -0.296706 : 0.663225;
      float ca = cos(ang), sa = sin(ang);
      vec2 uv = vec2(ca * xz.x + sa * xz.y, -sa * xz.x + ca * xz.y) + vec2(fh12(rid + 3.7), fh12(rid + 9.2)) * 1000.0;
      float rk = rid.x * 31.0 + rid.y;
      float cI = floor(uv.x / 520.0), lx = uv.x - cI * 520.0;
      float s1 = (0.3 + 0.4 * fh12(vec2(cI, rk))) * 520.0;
      float col = cI * 2.0 + (lx < s1 ? 0.0 : 1.0);
      float dU = min(min(lx, 520.0 - lx), abs(lx - s1));
      float vv = uv.y + fh12(vec2(col, rk + 1.0)) * 460.0;
      float rJ = floor(vv / 460.0), ly = vv - rJ * 460.0;
      float s2 = (0.3 + 0.4 * fh12(vec2(rJ, col + rk))) * 460.0;
      float row = rJ * 2.0 + (ly < s2 ? 0.0 : 1.0);
      float dV = min(min(ly, 460.0 - ly), abs(ly - s2));
      vec2 fid = vec2(col, row) + rid * 97.0;
      float pk = fh12(fid);
      int pi = int(min(4.0, floor(pk * 5.0)));
      vec3 c = uPal[0];
      for (int n = 1; n < 5; n++) if (n == pi) c = uPal[n];
      c *= 2.2 * (0.8 + 0.4 * fh12(fid + 4.4));
      e = vec3(min(dU, dV), (f2 - f1) * 1200.0, fh12(fid + 2.0) > 0.5 ? uv.x : uv.y);
      return c;
    }`;
  function patchTerrainShader(sh, levelU) {
    sh.uniforms.uDetail = { value: detail };
    Object.assign(sh.uniforms, FARM_U, TERRAIN_U, levelU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + CM_VERTEX_PARS)
      .replace('#include <beginnormal_vertex>', CM_VERTEX_BODY)
      .replace('#include <begin_vertex>', 'vec3 transformed = cmPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; varying vec3 vWPos; varying vec3 vHN;\nvec3 vWNrm; vec3 vEro; float vLand; float vCore;\n' + TERRAIN_HEIGHT_GLSL + FARM_GLSL + TERRAIN_BASE_GLSL)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // Terrain v2: per-pixel baked normal + erosion / landUse splat inside the 40 km core,
        // analytic horizon normal outside it; base palette replaces the old vertex colours.
        vec2 tcF = (vWPos.xz - uCore.xy) / uCore.z;
        vCore = inCoreF(tcF) ? 1.0 : 0.0;
        if (vCore > 0.5) {
          vec2 nrg = texture2D(uNormalTex, (tcF + 0.5) / uCore.w).rg * 2.0 - 1.0;
          vWNrm = vec3(nrg.x, sqrt(max(0.0, 1.0 - dot(nrg, nrg))), nrg.y);
          vec4 spl = texture2D(uSplat, (tcF * 0.5 + 0.5) / (uCore.w * 0.5));
          vEro = spl.rgb; vLand = spl.a;
        } else {
          vWNrm = normalize(vHN); vEro = vec3(0.5, 0.0, 0.0); vLand = vWPos.y > 0.5 ? 0.125 : 0.0;
        }
        diffuseColor.rgb = terrainBase(vWPos.y, 1.0 - clamp(vWNrm.y, 0.0, 1.0), vWPos.xz);
        float camD = length(vWPos - cameraPosition);
        // RGB detail atlas: r macro FBM, g ridged rock fractures, b micro-grain (v1.2.1).
        float det = 0.5, d1v = 0.5, d3v = 0.5, rockG = 0.5, microB = 0.5, closeB = 0.5;
        float closeK = 1.0 - smoothstep(1800.0, 3200.0, camD);
        if (camD < 13500.0) {
          vec3 tw = pow(abs(vWNrm), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          vec3 t1 = texture2D(uDetail, vWPos.zy * 0.013).rgb * tw.x + texture2D(uDetail, vWPos.xz * 0.013).rgb * tw.y + texture2D(uDetail, vWPos.xy * 0.013).rgb * tw.z;
          float d2 = texture2D(uDetail, vWPos.zy * 0.0022).r * tw.x + texture2D(uDetail, vWPos.xz * 0.0022).r * tw.y + texture2D(uDetail, vWPos.xy * 0.0022).r * tw.z;
          det = t1.r * 0.6 + d2 * 0.4; d1v = t1.r; rockG = t1.g; microB = t1.b;
          if (camD < 4800.0) {
            vec3 t3 = texture2D(uDetail, vWPos.zy * 0.038).rgb * tw.x + texture2D(uDetail, vWPos.xz * 0.038).rgb * tw.y + texture2D(uDetail, vWPos.xy * 0.038).rgb * tw.z;
            d3v = t3.r; rockG = mix(rockG, t3.g, 0.5); microB = mix(microB, t3.b, 0.5);
          }
          // Close-range tactile grain (11.8 m tile): flat pads, hills and valley floors stay textured.
          if (camD < 3200.0) closeB = texture2D(uDetail, vWPos.xz * 0.085).b * tw.y + texture2D(uDetail, vWPos.zy * 0.085).b * tw.x + texture2D(uDetail, vWPos.xy * 0.085).b * tw.z;
        }
        float inGorgeMask = (uMapMode > 0.5 && uMapMode < 1.5) ? rectMask(vWPos.xz, uGorgeBox, 350.0) * (1.0 - rectMask(vWPos.xz, uAfb, 120.0)) : 0.0;
        // Erosion shading stays off the AFB pad and Port City (flat, authored ground).
        float eroK = (uMapMode > 1.5) ? 1.0 : (1.0 - rectMask(vWPos.xz, uAfb, 220.0)) * (1.0 - rectMask(vWPos.xz, uTown, 180.0));
        float tWet = 0.0, tRock = 0.0, tSnow = 0.0;      // feed the roughness + micro-normal passes
        if (vWPos.y > 0.0) {
          float ny = clamp(vWNrm.y, 0.0, 1.0);
          float slope = 1.0 - ny, jit = det - 0.5;
          // Crisp slope-gated rock exposure with triplanar noise jitter; eroded flow lines expose rock earlier.
          float cliffK = smoothstep(uRockSlopeLo, uRockSlopeHi, slope + jit * 0.065 + sqrt(vEro.z) * 0.06 * eroK);
          tRock = cliffK;
          float allowFarm = (uMapMode > 1.5) ? 0.0 : (1.0 - inGorgeMask);
          float farmK = allowFarm * smoothstep(13.0, 18.0, vWPos.y) * (1.0 - smoothstep(295.0, 315.0, vWPos.y)) * smoothstep(0.78, 0.86, ny)
            * (1.0 - rectMask(vWPos.xz, uAfb, 160.0)) * (1.0 - rectMask(vWPos.xz, uTown, 140.0));
          // Baked landUse classes (splat A): farmland 64, forest 128. Outside the core: no gating.
          float luFarm = 1.0 - smoothstep(0.07, 0.16, abs(vLand - 0.251));
          float luForest = 1.0 - smoothstep(0.07, 0.16, abs(vLand - 0.502));
          farmK *= mix(1.0, luFarm, vCore);
          vec3 land = diffuseColor.rgb;
          // Forest canopy: dark conifer / broadleaf mottling where the baker grew woodland.
          land = mix(land, mix(vec3(0.045, 0.085, 0.040), vec3(0.085, 0.130, 0.055), d1v) * (0.85 + 0.3 * det), luForest * vCore * (1.0 - cliffK) * eroK * 0.62);
          if (farmK > 0.001) {
            vec3 fc;
            if (camD >= 16000.0) {
              fc = (uPal[0] + uPal[1] + uPal[2] + uPal[3] + uPal[4]) * 0.44;
            } else {
              vec3 fe;
              fc = farmField(vWPos.xz, fe);
              fc = mix(fc, (uPal[0] + uPal[1] + uPal[2] + uPal[3] + uPal[4]) * 0.44, smoothstep(7000.0, 16000.0, camD));
              float ff = fwidth(fe.z) / 7.0;
              fc *= 1.0 + 0.08 * sin(fe.z * 0.8975979) * (1.0 - smoothstep(0.12, 0.45, ff));
              float fwH = max(fwidth(fe.x), 0.01), fwR = max(fwidth(fe.y), 0.01);
              float hedge = clamp((3.0 - fe.x) / fwH + 0.5, 0.0, 1.0);
              hedge = mix(hedge, min(1.0, 6.0 / fwH) * 0.5, smoothstep(1.5, 6.0, fwH));
              float road = clamp((2.5 - fe.y) / fwR + 0.5, 0.0, 1.0);
              road = mix(road, min(1.0, 5.0 / fwR) * 0.5, smoothstep(1.5, 6.0, fwR));
              fc = mix(fc, uHedge, hedge * 0.9);
              fc = mix(fc, uRoad, road * 0.85);
            }
            land = mix(land, fc, farmK);
          }
          // Canyon trench floor braided riverbed & gravel bars (CANYON_RUN).
          if (inGorgeMask > 0.01 && vWPos.y < 68.0 && ny > 0.82) {
            float braid = sin(vWPos.x * 0.045 + sin(vWPos.z * 0.0042) * 3.5 + det * 3.0);
            float stream = smoothstep(0.76, 0.95, braid) * (1.0 - smoothstep(47.0, 56.0, vWPos.y));
            land = mix(land, uRiver * 1.15, stream * inGorgeMask * 0.78);
            tWet = max(tWet, stream * inGorgeMask);
          }
          // Layered granite / basalt cliff albedo with altitude weathering & bedding bands.
          // Bands fade to their mean once a band shrinks below ~1.5 px (no contour moire on big walls).
          float bandAA = 1.0 - smoothstep(0.35, 1.0, fwidth(vWPos.y) * 0.22);
          float rockBand = 0.5 + 0.5 * sin(vWPos.y * 0.22 + vWPos.x * 0.004 + vWPos.z * 0.003 + det * 2.2) * bandAA;
          vec3 rock = mix(uRockB, uRockA, clamp(rockBand * 0.72 + d1v * 0.35, 0.0, 1.0));
          rock = mix(rock, uRockHi, smoothstep(420.0, 1000.0, vWPos.y) * (0.45 + 0.35 * det));
          if (inGorgeMask > 0.01) {
            // Multi-band sedimentary strata (after dryCanyon.js canyonBeddedRock): rich red-rock
            // sandstone / ochre bands warped by detail noise and dark basalt caprock layers.
            float bedding = mix(0.5, sin(vWPos.y * 0.42 + det * 2.6) * 0.5 + 0.5, 1.0 - smoothstep(0.5, 1.4, fwidth(vWPos.y) * 0.42));
            float cycle = sin(vWPos.y * 0.093 + 1.7 + det * 0.8) * 0.5 + 0.5;
            vec3 sandstone = mix(vec3(0.24, 0.135, 0.082), vec3(0.42, 0.285, 0.175), bedding * 0.45 + det * 0.55);
            vec3 strata = mix(sandstone, vec3(0.085, 0.082, 0.084), smoothstep(0.74, 0.88, cycle));
            // Bedded sandstone belongs to the trench walls; the massif above the rim is alpine granite.
            rock = mix(rock, strata, inGorgeMask * 0.86 * (1.0 - smoothstep(uGorgeFloor + 330.0, uGorgeFloor + 520.0, vWPos.y)));
            // Talus scree aprons at the wall base: moderate slopes just above the floor.
            float talus = smoothstep(0.10, 0.24, slope) * (1.0 - smoothstep(0.42, 0.62, slope))
              * (1.0 - smoothstep(uGorgeFloor + 50.0, uGorgeFloor + 150.0, vWPos.y));
            vec3 scree = mix(vec3(0.22, 0.18, 0.13), vec3(0.35, 0.29, 0.21), d1v);
            land = mix(land, scree, talus * inGorgeMask * 0.85);
          }
          land = mix(land, rock, cliffK * smoothstep(2.0, 7.5, vWPos.y));
          // Erosion fans: sediment settles as pale scree / alluvium on the gentle ground below
          // gullies; strong flow lines on flats read as darker, damp drainage channels.
          float sed = vEro.y * eroK * (1.0 - smoothstep(0.12, 0.35, slope)) * smoothstep(3.0, 9.0, vWPos.y);
          vec3 alluvium = mix(vec3(0.26, 0.23, 0.17), vec3(0.38, 0.34, 0.25), d1v);
          land = mix(land, mix(alluvium, mix(vec3(0.22, 0.18, 0.13), vec3(0.35, 0.29, 0.21), d1v), inGorgeMask), sed * 0.38);
          float chan = smoothstep(0.54, 0.86, vEro.z) * (1.0 - smoothstep(0.18, 0.44, slope)) * eroK * smoothstep(3.0, 8.0, vWPos.y);
          land *= 1.0 - 0.32 * chan;
          tWet = max(tWet, chan);
          // Preserve alpine snow & caldera cinder above 540 m; weathered granite on mid-peaks.
          float midPeak = smoothstep(560.0, 700.0, vWPos.y) * (1.0 - smoothstep(980.0, 1120.0, vWPos.y)) * (1.0 - cliffK) * (1.0 - inGorgeMask);
          land = mix(land, uPeak, midPeak * 0.72);
          // Per-pixel alpine snowcaps: cling to high flat ledges, shed crisply off steep rock walls,
          // never on the volcano caldera or inside the canyon trench.
          float calderaD = length(vWPos.xz - vec2(5600.0, -8300.0));
          // Alpine snowline 950-1250 m (jittered); the gorge massif keeps its high snow.
          float snowLine = 1100.0 + jit * 300.0;
          float snow = smoothstep(snowLine, snowLine + 110.0, vWPos.y)
            * (1.0 - smoothstep(uSnowSlopeMin, uSnowSlopeMax, slope + jit * 0.07))
            * ((uMapMode < 0.5) ? smoothstep(900.0, 1050.0, calderaD) : 1.0) * (1.0 - inGorgeMask * (1.0 - smoothstep(760.0, 900.0, vWPos.y)));
          land = mix(land, uSnow * (0.94 + 0.12 * d1v), snow);
          tSnow = snow;
          // Main Island carved mountain stream & island highways (ARCHIPELAGO).
          if (uMapMode < 0.5) {
            if (vWPos.x > 80.0 && vWPos.x < 2360.0 && vWPos.z < -1820.0 && vWPos.z > -3450.0 && ny > 0.72) {
              float rd = min(segDist(vWPos.xz, vec2(2020.0, -1960.0), vec2(1160.0, -2460.0)),
                             segDist(vWPos.xz, vec2(1160.0, -2460.0), vec2(360.0, -3180.0)));
              float wMask = (1.0 - smoothstep(9.0, 22.0, rd + (det - 0.5) * 14.0)) * (1.0 - smoothstep(140.0, 220.0, vWPos.y));
              land = mix(land, uRiver * (0.9 + 0.35 * det), wMask * 0.9);
              tWet = max(tWet, wMask);
            }
            if (camD < 14000.0 && vWPos.y > 2.5 && ny > 0.65) {
              float hd = hwyNetwork(vWPos.xz);
              if (hd < 12.0) {
                float fw = max(fwidth(hd), 0.05);
                float roadM = clamp((6.2 - hd) / fw + 0.5, 0.0, 1.0);
                vec3 hCol = uHwy;
                if (camD < 2600.0) {
                  float ctr = (1.0 - smoothstep(0.25, 0.65, hd)) * step(0.45, fract((vWPos.x + vWPos.z) * 0.04));
                  hCol = mix(hCol, vec3(0.55, 0.48, 0.22), ctr * 0.65);
                }
                land = mix(land, hCol, roadM * (1.0 - smoothstep(9000.0, 14000.0, camD)));
              }
            }
          }
          // Golden-sand beaches on gentle coasts + narrow wave-wet sand rim at the waterline.
          float gentleCoast = (1.0 - smoothstep(0.08, 0.24, slope)) * (1.0 - inGorgeMask) * eroK;
          // Waterline bands jittered by micro-grain + macro noise: organic shores, not vertex sawteeth.
          float shoreY = vWPos.y + (mix(microB, closeB, closeK) - 0.5) * 2.2 + (det - 0.5) * 1.6;
          float dryBeach = smoothstep(1.2, 3.2, shoreY) * (1.0 - smoothstep(7.5, 13.0, shoreY)) * gentleCoast;
          land = mix(land, uSand * (0.92 + 0.16 * d1v), dryBeach * 0.72);
          float wetBand = (1.0 - smoothstep(1.2, 4.6, shoreY)) * (1.0 - inGorgeMask);
          land = mix(land, mix(uRockB, uShore, gentleCoast), wetBand * 0.75);
          tWet = max(tWet, (1.0 - smoothstep(1.2, 4.2, vWPos.y)) * (1.0 - inGorgeMask));   // wave-wet sand
          // Stronger erosion cavity / ridge AO: carved gullies & valleys deepen (to 0.38),
          // convex crests get the uAORidge highlight so jagged ridgelines pop in sunlight.
          float cav = vEro.x;
          float ao = mix(0.38, 1.0, smoothstep(0.05, 0.52, cav));
          ao = min(ao * (1.0 + uAORidge * clamp((cav - 0.5) * 2.0, 0.0, 1.0) * 0.62), 1.35);
          // Raking-light vertical gully darkening along steep hydraulic flow channels (Flyout canyon look).
          float gully = smoothstep(0.28, 0.78, vEro.z) * smoothstep(0.14, 0.42, slope) * eroK;
          land *= mix(1.0, ao * (1.0 - 0.34 * gully), eroK * smoothstep(1.0, 7.5, vWPos.y));
          diffuseColor.rgb = land;
        }
        float steep = smoothstep(0.24, 0.54, 1.0 - clamp(vWNrm.y, 0.0, 1.0));
        float strata = 0.86 + 0.14 * sin(vWPos.y * 0.62 + det * 7.0) * (1.0 - smoothstep(0.35, 1.0, fwidth(vWPos.y) * 0.62));
        // Wind-synced 2D FBM cloud shadows (1/4096 frequency matches ambient.js 4096 m wrap with zero pop).
        vec2 cUv = (vWPos.xz - uCloudOff) * 0.000244140625;
        float cShad = texture2D(uDetail, cUv).r * 0.62 + texture2D(uDetail, cUv * 2.0 + vec2(0.37, 0.61)).r * 0.38;
        float cMask = smoothstep(0.34, 0.66, cShad);
        float cloudMul = mix(1.0, mix(0.64, 1.04, cMask), uCloudShadowK * smoothstep(0.0, 8.0, vWPos.y) * (1.0 - smoothstep(16000.0, 26000.0, camD)));
        // Rock gets the ridged fracture channel; everything gets close-range micro-grain.
        float grainMul = mix(0.76 + 0.48 * det, 0.60 + 0.34 * det + 0.22 * d3v + 0.30 * rockG, tRock * 0.8);
        grainMul *= mix(1.0, 0.86 + 0.28 * closeB, closeK * (vWPos.y > 0.0 ? 1.0 : 0.0));
        grainMul *= 0.94 + 0.12 * microB;
        diffuseColor.rgb *= grainMul * mix(1.0, strata, steep) * cloudMul;
        // Micro-height for the normal pass: sharp 3-octave triplanar rock grain + horizontal
        // strata ledges on steep faces so cliffs catch crisp raking light.
        // Ledges fade out once a band shrinks below ~1.5 px (no aliasing stripes).
        float ledgeAA = 1.0 - smoothstep(0.35, 1.0, fwidth(vWPos.y) * 0.34);
        float microH = d3v * 0.85 + d1v * 1.25 + det * 0.55 + steep * sin(vWPos.y * 0.34 + det * 5.2) * 0.26 * ledgeAA
          + rockG * 0.9 * tRock + closeB * 0.55 * closeK + microB * 0.25;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // Matte 0.95 on dry rock / soil, glossier 0.58 on wet riverbeds, drainage, shore and snow.
        roughnessFactor = mix(0.95, 0.58, clamp(max(tWet, tSnow * 0.82), 0.0, 1.0));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(vWNrm, 0.0)).xyz);   // baked per-pixel normal
        {
          // Sharp triplanar micro-normals, faded out cleanly by 10.5 km; strongest on exposed cliffs.
          vec2 dH = vec2(dFdx(microH), dFdy(microH));
          float bumpK = (1.0 - smoothstep(4200.0, 10500.0, camD)) * mix(0.60, 2.35, tRock) * (1.0 - 0.65 * tSnow) * step(0.0, vWPos.y);
          normal = azPerturbNormal(-vViewPosition, normal, dH * bumpK, faceDirection);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uMapMode < 0.5 && vWPos.y > 580.0 && vWPos.y < 765.0) {
          float vd = length(vWPos.xz - vec2(5600.0, -8300.0));
          if (vd < 360.0) {
            float crk = texture2D(uDetail, vWPos.xz * 0.0075).r;
            float crk2 = texture2D(uDetail, vWPos.xz * 0.019 + 0.41).r;
            float magma = smoothstep(0.64, 0.82, crk * 0.65 + crk2 * 0.45) * (1.0 - smoothstep(140.0, 340.0, vd)) * smoothstep(0.65, 0.9, vWNrm.y);
            totalEmissiveRadiance += vec3(2.1, 0.44, 0.07) * magma;
          }
        }`)
      .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          vec3 vToP = vWPos - cameraPosition;
          float vDist = length(vToP);
          vec3 vDir = vToP / max(vDist, 1e-4);
          float sunAlign = max(dot(vDir, normalize(uSun + vec3(0.0, 1e-5, 0.0))), 0.0);
          // Two-tone Flyout aerial perspective: cool Rayleigh fog away from sun, warm luminous Mie veil toward sun.
          vec3 mieTint = uMieCol * (pow(sunAlign, 4.0) * 0.42 + pow(sunAlign, 20.0) * 0.58) * uMieK;
          vec3 aerialCol = fogColor + mieTint * smoothstep(600.0, 7500.0, vDist);
          #ifdef FOG_EXP2
            float distFog = 1.0 - exp(-fogDensity * fogDensity * vDist * vDist);
          #else
            float distFog = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          // Height-exponential valley mist pooling in gorge floors & coastal coves.
          float mistBase = (uMapMode > 0.5 && uMapMode < 1.5) ? uGorgeFloor : 0.0;
          float valleyBand = exp(-max(vWPos.y - mistBase, 0.0) / uMistH);
          float valleyMist = (1.0 - exp(-vDist * 0.00018 * valleyBand)) * 0.42 * uMistK * smoothstep(300.0, 2200.0, vDist);
          float fogFactor = clamp(max(distFog, valleyMist), 0.0, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, aerialCol, fogFactor);
        #endif`);
  }
  // Terrain v2: 8-level nested GPU clipmap; one material per level (same program, own uniforms).
  const clipmap = createClipmap(THREE, {
    scene,
    makeMaterial: levelU => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
      m.onBeforeCompile = sh => patchTerrainShader(sh, levelU);
      return m;
    }
  });
  // Snap the rings + crag viewer right before the first level draws (every render, any mode).
  clipmap.levels[0].mesh.onBeforeRender = (r, s, cam) => {
    clipmap.update(cam.position.x, cam.position.z);
    TERRAIN_U.uViewer.value.copy(cam.position);
    sampler.setViewer(cam.position.x, cam.position.z);
  };
  const terrain = {                                         // envProps.terrain proxy (applyMapProps toggles .visible)
    get visible() { return clipmap.visible; }, set visible(v) { clipmap.setVisible(!!v); }
  };
  // GPU textures per pack (built once, cached): RG8 hi/lo height (nearest, texelFetch),
  // RG8 normals and RGBA8 splat (linear + mips).
  function packTextures(pk) {
    if (pk.tex) return pk.tex;
    const c = pk.meta.core, n = c.n, sn = c.splatN, rg = new Uint8Array(n * n * 2), q = pk.q;
    for (let k = 0; k < n * n; k++) { rg[k * 2] = q[k] >> 8; rg[k * 2 + 1] = q[k] & 255; }
    const th = new THREE.DataTexture(rg, n, n, THREE.RGFormat, THREE.UnsignedByteType);
    th.magFilter = th.minFilter = THREE.NearestFilter; th.generateMipmaps = false; th.needsUpdate = true;
    const tn = new THREE.DataTexture(pk.normal, n, n, THREE.RGFormat, THREE.UnsignedByteType);
    tn.magFilter = THREE.LinearFilter; tn.minFilter = THREE.LinearMipmapLinearFilter; tn.generateMipmaps = true; tn.needsUpdate = true;
    const ts = new THREE.DataTexture(pk.splat, sn, sn, THREE.RGBAFormat, THREE.UnsignedByteType);
    ts.magFilter = THREE.LinearFilter; ts.minFilter = THREE.LinearMipmapLinearFilter; ts.generateMipmaps = true; ts.needsUpdate = true;
    pk.tex = { th, tn, ts };
    return pk.tex;
  }
  let onPackReady = null, wantMode = 'archipelago';
  function applyPack(mode) {
    let pk = packs[mode];
    if (!pk) {                                              // not fetched yet: show the archipelago, re-apply on arrival
      pk = packs.archipelago;
      prepare({ heightFn: mode }).then(() => {
        if (wantMode === mode) { applyPack(mode); if (onPackReady) onPackReady(mode); }
      }).catch(e => console.error('[ANGELS_ZERO] terrain pack', mode, e));
    }
    sampler = samplers[pk.map] || (samplers[pk.map] = createSampler(pk));
    const tx = packTextures(pk), c = pk.meta.core;
    TERRAIN_U.uHeight.value = tx.th; TERRAIN_U.uNormalTex.value = tx.tn; TERRAIN_U.uSplat.value = tx.ts;
    TERRAIN_U.uCore.value.set(c.cx - c.size / 2, c.cz - c.size / 2, c.step, c.n);
    TERRAIN_U.uHRange.value.set(c.minH, (c.maxH - c.minH) / 65535);
    TERRAIN_U.uMapId.value = pk.mapId;
    return pk;
  }
  // Lazy per-mission pack fetch (memoised); call before rebuild() for a seamless switch.
  async function prepare(def) {
    const mode = def ? def.heightFn : 'archipelago';
    if (mode === 'ocean' || packs[mode] || !G.heightFns[mode]) return;
    packs[mode] = await loadTerrainPack(mode, PACK_BASE, PACK_TAG);
  }
  applyPack('archipelago');

  /* ---------------------------------------------------- props + lights */
  const props = new THREE.Group(); props.name = 'worldProps'; scene.add(props);
  const boxes = [], gorgeBoxes = [], straitBoxes = [];        // collision: { c, hx, hy, hz, yaw }
  function addBox(cx, cy, cz, hx, hy, hz, yaw = 0, mapKind = 'arch') {
    const b = { c: new THREE.Vector3(cx, cy, cz), hx, hy, hz, yaw };
    if (mapKind === 'gorge') gorgeBoxes.push(b);
    else if (mapKind === 'strait') straitBoxes.push(b);
    else boxes.push(b);
  }
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...extra });
  const mat = {
    concrete: M(0x9a9a94), steel: M(0x6f7780, { metalness: 0.5, roughness: 0.5 }), hangar: M(0x6d7768, { metalness: 0.35, roughness: 0.6 }),
    door: M(0x2a2f2c), white: M(0xe8e8e2), red: M(0xb3261e), glass: M(0x1c2a33, { metalness: 0.6, roughness: 0.2 }),
    tank: M(0xd8dad6, { metalness: 0.4, roughness: 0.45 }), yellow: M(0xd8a21c, { metalness: 0.3 }), bridge: M(0xb8432e, { metalness: 0.4, roughness: 0.55 }),
    deck: M(0x55585c), turbine: M(0xeef0f2, { roughness: 0.5 }), warehouse: M(0x8a8f96, { metalness: 0.3 }), dome: M(0xf2f2ee, { roughness: 0.4 }),
    basalt: M(0x495158, { roughness: 0.95, metalness: 0.02, flatShading: true }),
    fort: M(0x50555a, { roughness: 0.88, metalness: 0.15 })
  };
  const mesh = (g, m, x, y, z, ry = 0, bucket = '') => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry;
    if (bucket) o.userData.propBucket = bucket;
    props.add(o); return o;
  };
  const cyls = [], gorgeCyls = [], straitCyls = [];           // { x, z, y0, y1, r0, r1 }
  function addCyl(x, z, y0, y1, r0, r1 = r0, mapKind = 'arch') {
    const c = { x, z, y0, y1, r0, r1 };
    if (mapKind === 'gorge') gorgeCyls.push(c);
    else if (mapKind === 'strait') straitCyls.push(c);
    else cyls.push(c);
  }

  const inGorgeBBox = (x, z) => x > GORGE_BBOX.x[0] - 600 && x < GORGE_BBOX.x[1] + 600 && z < GORGE_BBOX.z[0] + 600 && z > GORGE_BBOX.z[1] - 600;
  const ANC_IN = new THREE.Vector3((GORGE_BBOX.x[0] + GORGE_BBOX.x[1]) * 0.5, 0, (GORGE_BBOX.z[0] + GORGE_BBOX.z[1]) * 0.5);

  // Instanced prop batches partitioned by map visibility bucket (out of gorge, inside gorge bbox, gorge-only, strait-only).
  const BATCHES = {
    out: { box: [], cyl: [], arch: [] },
    in: { box: [], cyl: [], arch: [] },
    gorge: { box: [], cyl: [], arch: [] },
    strait: { box: [], cyl: [], arch: [] }
  };
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(0, 0, 0, 'YXZ');
  const _bp = new THREE.Vector3(), _bs = new THREE.Vector3(), _bc = new THREE.Color();
  const _ba = new THREE.Vector3(), _bb = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  function pickBatch(x, z, mapKind) {
    if (mapKind === 'gorge') return BATCHES.gorge;
    if (mapKind === 'strait') return BATCHES.strait;
    return inGorgeBBox(x, z) ? BATCHES.in : BATCHES.out;
  }
  function inst(kind, x, y, z, sx, sy, sz, hex, ry = 0, rx = 0, rz = 0, mapKind = 'arch') {
    pickBatch(x, z, mapKind)[kind].push([x, y, z, sx, sy, sz, hex, ry, rx, rz]);
  }
  function beam(ax, ay, az, bx, by, bz, w, hex, mapKind = 'arch') {
    _ba.set(ax, ay, az); _bb.set(bx, by, bz);
    const len = _ba.distanceTo(_bb);
    pickBatch((ax + bx) * 0.5, (az + bz) * 0.5, mapKind).box.push({ a: _ba.clone(), b: _bb.clone(), len, w, hex });
  }
  function flushBatches() {
    const geos = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
      arch: (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, false, -Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); return g; })()
    };
    for (const [bKey, grp] of Object.entries(BATCHES)) {
      const off = bKey === 'in' ? ANC_IN : _ba.set(0, 0, 0);
      for (const kind of Object.keys(grp)) {
        const list = grp[kind];
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(geos[kind], M(0xffffff, { metalness: kind === 'arch' ? 0.05 : 0.3, roughness: kind === 'arch' ? 0.9 : 0.62 }), list.length);
        im.position.copy(off);
        if (bKey === 'gorge') im.userData.propBucket = 'gorge';
        else if (bKey === 'strait') im.userData.propBucket = 'strait';
        else if (bKey === 'in') im.userData.propBucket = 'islandsIn';
        else im.userData.propBucket = 'islandsOut';
        list.forEach((it, k) => {
          if (Array.isArray(it)) {
            const [x, y, z, sx, sy, sz, hex, ry, rx, rz] = it;
            _bq.setFromEuler(_be.set(rx, ry, rz));
            _bm.compose(_bp.set(x - off.x, y - off.y, z - off.z), _bq, _bs.set(sx, sy, sz));
            im.setColorAt(k, _bc.set(hex));
          } else {
            _bp.copy(it.a).add(it.b).multiplyScalar(0.5).sub(off);
            _bq.setFromUnitVectors(_up, _bs.copy(it.b).sub(it.a).normalize());
            _bm.compose(_bp, _bq, _bs.set(it.w, it.len, it.w));
            im.setColorAt(k, _bc.set(it.hex));
          }
          im.setMatrixAt(k, _bm);
        });
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        props.add(im);
      }
    }
  }

  // Light points: one instanced draw; mode 0 steady, 1 approach strobe, 2 slow blink,
  // 3 rotating beacon, 4 window flicker, 5 high-intensity day/night, 6 gas/magma flare,
  // 7 drifting road/bridge traffic (aSpan = travel vector).
  // mapId: 0 = archipelago (and outside gorge mask), 1 = gorge-only, 2 = strait-only.
  const LP = { pos: [], col: [], size: [], mode: [], phase: [], map: [], span: [] };
  function light(x, y, z, hex, size, mode = 0, phase = 0, mapId = 0, dx = 0, dy = 0, dz = 0) {
    const cc = new THREE.Color(hex);
    LP.pos.push(x, y, z); LP.col.push(cc.r, cc.g, cc.b); LP.size.push(size);
    LP.mode.push(mode); LP.phase.push(phase); LP.map.push(mapId); LP.span.push(dx, dy, dz);
  }
  function addTrafficSegment(ax, ay, az, bx, by, bz, cars = 6, mapId = 0) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1, rx = -dz / len * 2.2, rz = dx / len * 2.2;
    for (let i = 0; i < cars; i++) {
      const ph = i / cars + (i * 0.137) % 0.12;
      // Forward lane: warm-white headlights; opposite lane: ruby taillights.
      light(ax + rx, ay + 1.1, az + rz, 0xfff0c8, 3.0, 7, ph, mapId, dx, dy, dz);
      light(bx - rx, by + 1.1, bz - rz, 0xff2c22, 2.6, 7, (ph + 0.5) % 1, mapId, -dx, -dy, -dz);
    }
  }

  const beams = [], radars = [];                       // rotating lighthouse beams / radar antennas ({ g, w })
  // ---- ARCHIPELAGO AFB ----------------------------------------------------
  const RL = RWY.z1 - RWY.z0, rwyMidZ = (RWY.z0 + RWY.z1) / 2, E = RWY.elev;
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 4096;
    const x = cv.getContext('2d'), sx = 256 / RWY.width, sz = 4096 / RL;   // px per metre
    x.fillStyle = '#383b3f'; x.fillRect(0, 0, 256, 4096);
    // Subtle concrete joint grid + asphalt grain + touchdown rubber skid marks.
    x.strokeStyle = 'rgba(0,0,0,0.14)'; x.lineWidth = 1;
    for (let y = 0; y < 4096; y += 32) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
    for (let i = 0; i < 3600; i++) {
      x.fillStyle = `rgba(${(i & 1) ? '255,255,255' : '0,0,0'},0.045)`;
      x.fillRect(((i * 73) % 256), ((i * 197) % 4096), 2, 7);
    }
    for (const zTd of [340 * sz, (RL - 340) * sz]) {
      const g = x.createRadialGradient(128, zTd, 8, 128, zTd, 260 * sz);
      g.addColorStop(0, 'rgba(14,15,17,0.52)'); g.addColorStop(1, 'rgba(14,15,17,0)');
      x.fillStyle = g; x.fillRect(36, zTd - 260 * sz, 184, 520 * sz);
    }
    // Yellow overrun blast-pad chevrons at both thresholds.
    x.strokeStyle = '#e0b128'; x.lineWidth = Math.max(2, 1.1 * sx);
    for (let c = 0; c < 3; c++) {
      const yN = (14 + c * 18) * sz, yS = (RL - 14 - c * 18) * sz;
      x.beginPath(); x.moveTo(18, yN + 14 * sz); x.lineTo(128, yN); x.lineTo(238, yN + 14 * sz); x.stroke();
      x.beginPath(); x.moveTo(18, yS - 14 * sz); x.lineTo(128, yS); x.lineTo(238, yS - 14 * sz); x.stroke();
    }
    x.fillStyle = '#ebebe4';
    x.fillRect(2 * sx, 0, 0.95 * sx, 4096); x.fillRect(256 - 2.95 * sx, 0, 0.95 * sx, 4096);   // edge stripes
    for (let zz = 155; zz < RL - 155; zz += 60) x.fillRect(128 - 0.48 * sx, zz * sz, 0.96 * sx, 32 * sz);   // centreline dashes
    for (const [z0, flip] of [[68, false], [RL - 68, true]]) {
      const dir = flip ? -1 : 1;
      for (let k = 0; k < 8; k++) {                                        // threshold piano keys
        const kx = 5.5 * sx + k * 4.7 * sx + (k >= 4 ? 6.2 * sx : 0);
        x.fillRect(kx, (flip ? z0 - 32 : z0) * sz, 1.9 * sx, 32 * sz);
      }
      x.save(); x.translate(128, (z0 + dir * 64) * sz); if (!flip) x.rotate(Math.PI);
      x.font = `bold ${Math.round(27 * sz)}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.scale(1.15, 1.7); x.fillText(flip ? '36' : '18', 0, 0); x.restore();
      // Aiming point blocks (300 m) + ICAO touchdown zone pairs (150, 450, 600, 750 m).
      x.fillRect(9 * sx, (z0 + dir * (flip ? 310 : 265)) * sz, 7.5 * sx, 45 * sz);
      x.fillRect(256 - 16.5 * sx, (z0 + dir * (flip ? 310 : 265)) * sz, 7.5 * sx, 45 * sz);
      for (const td of [150, 450, 600, 750]) {
        const yy = (z0 + dir * (flip ? td + 22 : td)) * sz;
        x.fillRect(11 * sx, yy, 4.2 * sx, 22 * sz); x.fillRect(256 - 15.2 * sx, yy, 4.2 * sx, 22 * sz);
      }
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(RWY.width, RL), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    rw.rotation.x = -Math.PI / 2; rw.position.set(RWY.x, E + 0.12, rwyMidZ); rw.userData.propBucket = 'runway'; props.add(rw);
    const asph = new THREE.MeshStandardMaterial({ color: 0x43464a, roughness: 0.94, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const twyLine = new THREE.MeshStandardMaterial({ color: 0xd9a828, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const twy = new THREE.Mesh(new THREE.PlaneGeometry(23, RL - 180), asph); twy.rotation.x = -Math.PI / 2; twy.position.set(RWY.x + 150, E + 0.1, rwyMidZ); twy.userData.propBucket = 'runway'; props.add(twy);
    const twyCtr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, RL - 200), twyLine); twyCtr.rotation.x = -Math.PI / 2; twyCtr.position.set(RWY.x + 150, E + 0.13, rwyMidZ); twyCtr.userData.propBucket = 'runway'; props.add(twyCtr);
    for (const zc of [RWY.z0 + 140, RWY.z0 + 900, rwyMidZ, RWY.z1 - 900, RWY.z1 - 140]) {
      const cn = new THREE.Mesh(new THREE.PlaneGeometry(150, 22), asph); cn.rotation.x = -Math.PI / 2; cn.position.set(RWY.x + 75, E + 0.1, zc); cn.userData.propBucket = 'runway'; props.add(cn);
      const hs = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 20), twyLine); hs.rotation.x = -Math.PI / 2; hs.position.set(RWY.x + 42, E + 0.13, zc); hs.userData.propBucket = 'runway'; props.add(hs);
    }
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(250, 880), new THREE.MeshStandardMaterial({ color: 0x868883, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(RWY.x + 290, E + 0.09, -420); apron.userData.propBucket = 'runway'; props.add(apron);

    // Arched hangars.
    const hG = new THREE.CylinderGeometry(20, 20, 50, 24, 1, true, 0, Math.PI); hG.rotateZ(Math.PI / 2); hG.rotateY(Math.PI / 2);
    const capG = new THREE.CircleGeometry(20, 24, 0, Math.PI);
    for (let k = 0; k < 4; k++) {
      const hz = -730 + k * 130, hx = RWY.x + 330;
      const hg = mesh(hG, mat.hangar, hx, E, hz, 0, 'baseBldg'); hg.rotation.y = Math.PI / 2;
      const back = mesh(capG, mat.hangar, hx + 25, E, hz, Math.PI / 2, 'baseBldg'); back.material = mat.hangar;
      mesh(capG, mat.door, hx - 24.9, E, hz, -Math.PI / 2, 'baseBldg');
      addBox(hx, E + 10, hz, 26, 11, 21);
    }
    // Control tower with rotating beacon (cab marked noMerge so setupBuzzAnchors always finds its exact world pose).
    const tx = RWY.x + 270, tz = -980;
    mesh(new THREE.BoxGeometry(18, 10, 18), mat.concrete, tx, E + 5, tz, 0, 'baseBldg');
    mesh(new THREE.CylinderGeometry(3.4, 4.4, 34, 12), mat.concrete, tx, E + 27, tz, 0, 'baseBldg');
    const towerCab = mesh(new THREE.CylinderGeometry(7.8, 6.2, 6, 8), mat.glass, tx, E + 47, tz, 0, 'baseBldg');
    towerCab.userData.noMerge = true;
    mesh(new THREE.CylinderGeometry(8.2, 8.2, 1.2, 8), mat.white, tx, E + 50.6, tz, 0, 'baseBldg');
    addBox(tx, E + 26, tz, 9, 26, 9);
    light(tx, E + 53, tz, 0x52ff7a, 7, 3, 0); light(tx, E + 53, tz, 0xffffff, 7, 3, 0.5);
    mesh(new THREE.CylinderGeometry(0.5, 0.6, 4, 8), mat.steel, tx, E + 53.2, tz, 0, 'baseBldg');
    const bar = new THREE.Group(); bar.position.set(tx, E + 55.6, tz); props.add(bar);
    bar.add(new THREE.Mesh(new THREE.BoxGeometry(15, 1.3, 1.1), mat.white));
    radars.push({ g: bar, w: 0.55 });

    // Wing Operations HQ + Fire/Crash Rescue Station + parked static flight-line aircraft (outside taxiway x=1050).
    inst('box', RWY.x + 355, E + 7, -900, 44, 14, 24, 0x8f928c);
    inst('box', RWY.x + 355, E + 15.5, -900, 36, 3, 20, 0x5d666e);
    addBox(RWY.x + 355, E + 8, -900, 23, 8, 13);
    inst('box', RWY.x + 230, E + 4.5, -80, 26, 9, 38, 0xa83228);            // ARFF Crash/Fire station
    for (let r = -1; r <= 1; r++) inst('box', RWY.x + 216.8, E + 3.2, -80 + r * 11, 0.6, 5.5, 8, 0xe8e8e2);
    addBox(RWY.x + 230, E + 4.5, -80, 14, 5, 20);
    // Static parked fighter & airlifter silhouettes on the ramp (x >= RWY.x + 235).
    for (let k = 0; k < 4; k++) {
      const px = RWY.x + 242, pz = -690 + k * 95;
      inst('box', px, E + 2.1, pz, 18, 1.8, 3.0, 0x6b747d);                 // fuselage
      inst('box', px + 1.5, E + 2.0, pz, 5.5, 0.4, 13.0, 0x636c75);         // swept wing
      inst('box', px + 6.5, E + 3.8, pz - 1.8, 3.2, 2.8, 0.35, 0x576069);   // twin tails
      inst('box', px + 6.5, E + 3.8, pz + 1.8, 3.2, 2.8, 0.35, 0x576069);
      inst('box', px + 18, E + 2.2, pz, 1.2, 4.2, 14, 0x4f5357, 0, 0, -0.35); // blast fence
    }
    for (let k = 0; k < 2; k++) {                                           // heavy grey airlifters
      const px = RWY.x + 335, pz = -190 + k * 78;
      inst('cyl', px, E + 4.2, pz, 4.8, 32, 4.8, 0x767e86, 0, 0, Math.PI / 2);
      inst('box', px - 1, E + 5.8, pz, 4.6, 0.6, 38, 0x6f7780);
      inst('box', px + 14, E + 9.2, pz, 5.2, 7.5, 0.6, 0x5e666e);
      inst('box', px + 14, E + 12.6, pz, 4.0, 0.5, 13, 0x6f7780);
    }
    // Munitions Storage Area: earth-bermed concrete igloos east of the apron.
    for (let k = 0; k < 4; k++) {
      const ix = RWY.x + 435, iz = -260 + k * 95;
      inst('arch', ix, E, iz, 18, 8.5, 26, 0x5a684c, Math.PI / 2);
      inst('box', ix - 13.1, E + 3.6, iz, 0.6, 6.8, 12, 0x3b4042);
    }

    // Hardened aircraft shelters (concrete arches, dark blast doors facing the taxiway).
    for (let k = 0; k < 5; k++) {
      const sz = 560 + k * 140, sx = RWY.x + 410;
      inst('arch', sx, E, sz, 26, 13, 34, 0x8d8e86, Math.PI / 2);
      inst('box', sx - 17.2, E + 5.2, sz, 0.8, 10.4, 22, 0x34383a);
      inst('box', sx + 17, E + 6.5, sz, 1.5, 13, 26, 0x7f807a);
      addBox(sx, E + 6.5, sz, 18, 7, 13.5);
      const stub = new THREE.Mesh(new THREE.PlaneGeometry(250, 26), asph); stub.rotation.x = -Math.PI / 2; stub.position.set(RWY.x + 270, E + 0.1, sz); stub.userData.propBucket = 'runway'; props.add(stub);
    }
    // Two white geodesic radomes on drums at the north end of the field.
    const domeG = new THREE.IcosahedronGeometry(14, 2), domeM = M(0xf2f3ef, { roughness: 0.45, flatShading: true });
    for (const [dx, dz] of [[RWY.x + 420, -1180], [RWY.x + 420, -1290]]) {
      const gy = Math.max(E, heightAt(dx, dz));
      inst('cyl', dx, gy + 3, dz, 26, 6, 26, 0x9a9a94);
      mesh(domeG, domeM, dx, gy + 12, dz, 0, 'baseBldg');
      addCyl(dx, dz, gy - 2, gy + 26, 14.5, 8);
      light(dx, gy + 26.5, dz, 0xff2020, 4, 2, dz * 0.001);
    }
    // Spherical fuel tanks.
    const sph = new THREE.SphereGeometry(9, 18, 12), leg = new THREE.CylinderGeometry(0.6, 0.6, 9, 6);
    for (let k = 0; k < 4; k++) {
      const fx = RWY.x + 330 + (k % 2) * 30, fz = 250 + Math.floor(k / 2) * 30;
      mesh(sph, mat.tank, fx, E + 12, fz, 0, 'baseBldg');
      for (const [ox, oz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) mesh(leg, mat.steel, fx + ox, E + 4.5, fz + oz, 0, 'baseBldg');
      addBox(fx, E + 10, fz, 9.5, 10.5, 9.5);
    }
    // Runway edge lights, threshold green / end red, PAPI 4-light slope bars, ALSF approach strobes.
    for (let zz = RWY.z0; zz <= RWY.z1 + 0.1; zz += 60) for (const sx2 of [-1, 1]) light(RWY.x + sx2 * (RWY.width / 2 + 2), E + 0.8, zz, 0xfff4dc, 3.6, 5);
    for (let zz = RWY.z0 + 90; zz < RWY.z1 - 90; zz += 60) light(RWY.x, E + 0.35, zz, 0xfff8ea, 2.2, 5);   // flush centreline lights
    for (let k = -4; k <= 4; k++) for (const [zt, dz] of [[RWY.z1, 1], [RWY.z0, -1]]) {
      light(RWY.x + k * 5.5, E + 0.8, zt + dz * 3, 0x30ff60, 4, 5);
      light(RWY.x + k * 5.5, E + 0.9, zt + dz * 1, 0xff2a2a, 2.6, 0);
    }
    // PAPI 4-box bars (2 white, 2 red) beside both touchdown zones (frangible, well clear of runway).
    for (const [pz, sideSgn] of [[RWY.z1 - 310, -1], [RWY.z0 + 310, 1]]) {
      for (let p = 0; p < 4; p++) {
        light(RWY.x + sideSgn * (RWY.width / 2 + 16 + p * 6), E + 1.1, pz, p < 2 ? 0xffffff : 0xff2420, 4.4, 5);
      }
    }
    for (const [zt, dz] of [[RWY.z1, 1], [RWY.z0, -1]]) {
      for (let k = 1; k <= 30; k++) {
        const zz = zt + dz * (20 + k * 30), gy = Math.max(E, heightAt(RWY.x, zz), 0);
        light(RWY.x, gy + 1.5 + k * 0.15, zz, 0xffffff, 5.5, 1, 1 - k / 30);
        for (const sx2 of [-1, 1]) light(RWY.x + sx2 * 8, gy + 1.2, zz, 0xfff1c8, 2.8, 5);
        if (k % 5 === 0) for (let b = -3; b <= 3; b++) if (b) light(RWY.x + b * 6, gy + 1.2, zz, 0xfff1c8, 3, 5);
      }
    }
    for (let zz = RWY.z0 + 140; zz < RWY.z1 - 140; zz += 45) light(RWY.x + 150 + 12, E + 0.6, zz, 0x3a7dff, 2.2, 0);
    for (let k = 0; k < 6; k++) light(RWY.x + 210, E + 18, -760 + k * 140, 0xffe6b8, 6.5, 0);               // warm apron floodlights
  }

  // ---- SUSPENSION BRIDGES + LIVE TRAFFIC -----------------------------------
  const bridgeInfo = [];
  for (const b of BRIDGES) {
    const A = new THREE.Vector3(b.a[0], DECK_TOP, b.a[1]), B = new THREE.Vector3(b.b[0], DECK_TOP, b.b[1]);
    const span = A.distanceTo(B), dir = B.clone().sub(A).normalize(), yaw = Math.atan2(dir.x, dir.z);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const bBucket = inGorgeBBox(mid.x, mid.z) ? 'islandsIn' : 'islandsOut';
    const DH = DECK_TOP - DECK_UNDER, deckY = (DECK_TOP + DECK_UNDER) / 2;
    mesh(new THREE.BoxGeometry(34, DH, span + 160), mat.deck, mid.x, deckY, mid.z, yaw, bBucket);
    addBox(mid.x, deckY, mid.z, 17, DH / 2, span / 2 + 80, yaw);
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    for (const s of [-1, 1]) {
      const e = mid.clone().addScaledVector(side, s * 16.5);
      inst('box', e.x, DECK_TOP + 1.2, e.z, 1.2, 2.4, span + 160, 0xb8432e, yaw);
    }
    const towers = [0.2, 0.8].map(f => A.clone().lerp(B, f));
    const LEG = 19, BANDS = 8, bandH = TOWER_TOP / BANDS;
    for (const T of towers) {
      for (const s of [-1, 1]) {
        const p = T.clone().addScaledVector(side, s * LEG);
        for (let k = 0; k < BANDS; k++) inst('box', p.x, (k + 0.5) * bandH, p.z, 8, bandH + 0.05, 8, (BANDS - 1 - k) % 2 ? 0xf1efe8 : 0xc0281f, yaw);
        addBox(p.x, TOWER_TOP / 2, p.z, 4.6, TOWER_TOP / 2, 4.6, yaw);
        light(p.x, TOWER_TOP + 1.5, p.z, 0xff2020, 10, 2, s > 0 ? 0 : 0.5);
        light(p.x + side.x * s * 4.5, TOWER_TOP * 0.55, p.z + side.z * s * 4.5, 0xff2020, 6, 2, s > 0 ? 0.25 : 0.75);
      }
      for (const yy of [DECK_UNDER - 5, 190, TOWER_TOP - 6]) {
        inst('box', T.x, yy, T.z, LEG * 2 + 8, 8, 8, 0xc0281f, yaw);
        addBox(T.x, yy, T.z, LEG + 4, 4.2, 4.2, yaw);
      }
      inst('box', T.x, -6, T.z, LEG * 2 + 26, 24, 22, 0x8f908a, yaw);
      addBox(T.x, -6, T.z, LEG + 13, 12, 11, yaw);
    }
    const susp = [];
    for (const s of [-1, 1]) {
      const pts = [];
      const T0 = towers[0].clone().addScaledVector(side, s * LEG), T1 = towers[1].clone().addScaledVector(side, s * LEG);
      const A0 = A.clone().addScaledVector(side, s * LEG).setY(DECK_TOP + 2), B0 = B.clone().addScaledVector(side, s * LEG).setY(DECK_TOP + 2);
      for (let k = 0; k <= 8; k++) pts.push(A0.clone().lerp(T0, k / 8).setY(DECK_TOP + 2 + (TOWER_TOP - DECK_TOP - 2) * Math.pow(k / 8, 1.4)));
      for (let k = 1; k <= 40; k++) { const f = k / 40, p = T0.clone().lerp(T1, f); p.y = TOWER_TOP - (TOWER_TOP - DECK_TOP - 14) * (1 - (2 * f - 1) ** 2); pts.push(p); }
      for (let k = 1; k <= 8; k++) pts.push(T1.clone().lerp(B0, k / 8).setY(TOWER_TOP - (TOWER_TOP - DECK_TOP - 2) * (1 - Math.pow(1 - k / 8, 1.4))));
      const curve = new THREE.CatmullRomCurve3(pts);
      const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 1.3, 6, false), mat.bridge);
      cableMesh.userData.propBucket = bBucket;
      if (bBucket === 'islandsIn') { cableMesh.geometry.translate(-ANC_IN.x, -ANC_IN.y, -ANC_IN.z); cableMesh.position.copy(ANC_IN); }
      props.add(cableMesh);
      for (let k = 1; k < 120; k++) { const p = curve.getPointAt(k / 120); if (p.y > DECK_TOP + 4) susp.push(p.x, p.y, p.z, p.x, DECK_TOP, p.z); }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(susp, 3));
    const suspLine = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x6a2a20 }));
    if (bBucket === 'islandsIn') { sg.translate(-ANC_IN.x, -ANC_IN.y, -ANC_IN.z); suspLine.position.copy(ANC_IN); }
    suspLine.userData.propBucket = bBucket;
    props.add(suspLine);
    for (let k = 0; k <= 16; k++) { const p = A.clone().lerp(B, k / 16); for (const s of [-1, 1]) light(p.x + side.x * s * 15, DECK_TOP + 1.4, p.z + side.z * s * 15, 0xffd08a, 2.6, 0); }
    addTrafficSegment(A.x, DECK_TOP, A.z, B.x, DECK_TOP, B.z, 8, 0);
    bridgeInfo.push({ a: A, b: B, towers, under: DECK_UNDER, top: TOWER_TOP });
  }
  // Coastal highway night traffic linking AFB, Port City and East Bridge.
  addTrafficSegment(-1320, Math.max(8, heightAt(-1320, -1080)), -1080, -320, Math.max(8, heightAt(-320, -620)), -620, 6, 0);
  addTrafficSegment(2250, Math.max(12, heightAt(2250, -2300)), -2300, 1560, Math.max(12, heightAt(1560, -1420)), -1420, 5, 0);

  // ---- MERCHANT CARGO SHIPS (QUAY + OUTER SEA LANES) ------------------------
  function placeCargoShip(sx, sz, yaw, kind = 'container') {
    const c = Math.cos(yaw), s = Math.sin(yaw), P = (ox, oz) => [sx + ox * c + oz * s, sz - ox * s + oz * c];
    const hullCol = kind === 'tanker' ? 0x6e2622 : 0x263544;
    inst('box', sx, 4.5, sz, 28, 12, 176, hullCol, yaw);
    const [bx, bz] = P(0, 62);
    inst('box', bx, 18, bz, 24, 16, 18, 0xeaece8, yaw);                // aft bridge block
    inst('box', bx, 28, bz + 2 * c, 18, 5, 10, 0xd8dce0, yaw);
    const [fx, fz] = P(0, 72);
    inst('cyl', fx, 28, fz, 4.5, 10, 4.5, 0xc84628);                   // funnel
    if (kind === 'container') {
      const cols = [0x1f4e78, 0xb83b28, 0x2a6f54, 0xd49424, 0xd8dce0];
      for (let row = -3; row <= 1; row++) for (let col = -1; col <= 1; col++) {
        const [cx2, cz2] = P(col * 7.6, row * 26 - 10);
        const stackH = 7 + ((Math.abs(row * 3 + col * 5) % 3) * 3.2);
        inst('box', cx2, 10.5 + stackH * 0.5, cz2, 6.8, stackH, 22, cols[Math.abs(row * 7 + col * 3) % 5], yaw);
      }
    } else {
      inst('box', sx, 11.2, sz, 25, 1.8, 120, 0x3b4248, yaw);
      for (let k = -2; k <= 1; k++) { const [px, pz] = P(0, k * 28 - 8); inst('cyl', px, 13.5, pz, 5, 3, 5, 0xb8bfc4); }
    }
    addBox(sx, 12, sz, 15, 16, 90, yaw);
    const [bowX, bowZ] = P(0, -86);
    light(bowX, 14, bowZ, 0xffffff, 4.2, 0);
    light(bx, 33, bz, 0xff2020, 5.0, 2, (sx * 0.001) % 1);
  }

  // ---- HARBOUR, CONTAINER PORT, SKYLINE & WATERFRONT TOWN -------------------
  {
    const qx = -1755;
    mesh(new THREE.BoxGeometry(68, 6, 1180), mat.concrete, qx, 0, -900, 0, 'islandsIn');     // quay
    addBox(qx, 0, -900, 34, 3, 590);
    for (let k = 0; k < 6; k++) {
      const wz = -1350 + k * 170, wx = -1650 + (k % 2) * 30, wy = Math.max(3, heightAt(wx, wz));
      mesh(new THREE.BoxGeometry(48, 16, 110), mat.warehouse, wx, wy + 8, wz, 0, 'islandsIn');
      addBox(wx, wy + 8, wz, 24, 8, 55);
    }
    // Stacked intermodal shipping containers along the container apron.
    {
      const cCols = [0x1f4e78, 0xb83b28, 0x2a6f54, 0xd49424, 0xcfd4d8, 0x2c4257];
      const crnd = env.mulberry32(8088);
      for (let b = 0; b < 14; b++) {
        const bz = -1390 + b * 74;
        for (let lane = 0; lane < 3; lane++) {
          const bx = qx + 8 + lane * 8.5, tiers = 1 + Math.floor(crnd() * 3);
          for (let t = 0; t < tiers; t++) {
            inst('box', bx, 3 + 1.4 + t * 2.8, bz, 2.6, 2.7, 12.2, cCols[Math.floor(crnd() * cCols.length)]);
          }
        }
      }
    }
    // Two berthed cargo vessels along the deep-water quay + 3 outer sea-lane ships.
    placeCargoShip(qx - 52, -1140, 0, 'container');
    placeCargoShip(qx - 50, -640, Math.PI, 'tanker');
    placeCargoShip(4900, 4900, -0.65, 'container');
    placeCargoShip(8500, -5400, 0.32, 'tanker');
    placeCargoShip(-8650, -5900, -0.18, 'container');

    // Ship-to-shore container gantry cranes.
    for (let k = 0; k < 5; k++) {
      const cz = -1350 + k * 220, cx = qx - 2, Y = 3, PH = 62, col = k % 2 ? 0xd8a21c : 0xc94a1e;
      for (const [ox, oz] of [[-13, -11], [13, -11], [-13, 11], [13, 11]]) inst('box', cx + ox, Y + PH / 2, cz + oz, 2.6, PH, 2.6, col);
      for (const oz of [-11, 11]) { inst('box', cx, Y + 14, cz + oz, 28, 2.2, 2.2, col); beam(cx - 13, Y + 2, cz + oz, cx + 13, Y + PH - 4, cz + oz, 1.4, col); }
      for (const ox of [-13, 13]) inst('box', cx + ox, Y + PH, cz, 3, 3, 24, col);
      for (const oz of [-9, 9]) inst('box', cx - 32, Y + PH + 2, cz + oz, 105, 3.2, 2.4, col);
      inst('box', cx + 8, Y + PH + 7, cz, 14, 8, 16, 0xe8e8e2);
      for (const oz of [-9, 9]) {
        beam(cx, Y + PH + 3, cz + oz, cx + 4, Y + PH + 30, cz + oz, 1.8, col);
        beam(cx + 4, Y + PH + 30, cz + oz, cx - 80, Y + PH + 3, cz + oz, 0.7, 0x55585c);
        beam(cx + 4, Y + PH + 30, cz + oz, cx + 20, Y + PH + 3, cz + oz, 0.7, 0x55585c);
      }
      addBox(cx, Y + PH / 2, cz, 15, PH / 2 + 2, 13);
      addBox(cx - 32, Y + PH + 12, cz, 54, 14, 11);
      light(cx - 84, Y + PH + 3, cz, 0xff2020, 5, 2, k * 0.3); light(cx + 4, Y + PH + 31, cz, 0xff2020, 6, 2, k * 0.3 + 0.5);
    }
    // White cylindrical fuel-storage tank farm behind the quay.
    const tanks = [];
    {
      const trnd = env.mulberry32(733);
      for (let k = 0; k < 400 && tanks.length < 10; k++) {
        const x = -1700 + trnd() * 700, z = -250 + trnd() * 520, r = 13 + trnd() * 7, y = heightAt(x, z);
        if (y < 3 || y > 60 || tanks.some(t => Math.hypot(t[0] - x, t[1] - z) < t[2] + r + 10)) continue;
        let flat = true;
        for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(heightAt(x + ox, z + oz) - y) > 3) flat = false;
        if (!flat) continue;
        const h = 16 + trnd() * 9;
        tanks.push([x, z, r]);
        inst('cyl', x, y + h / 2 - 1, z, r * 2, h + 2, r * 2, 0xe9ebe7);
        inst('cyl', x, y + h + 0.6, z, r * 1.9, 1.2, r * 1.9, 0xb9bdbb);
        inst('box', x + r * 0.7, y + h / 2, z + r * 0.7, 0.8, h, 0.8, 0x6f7780, Math.PI / 4);
        addCyl(x, z, y - 2, y + h + 1.5, r + 0.5);
      }
    }
    // Breakwaters across the bay mouth (west).
    mesh(new THREE.BoxGeometry(24, 8, 620), mat.concrete, -3420, 0, -1350, 0.5, 'islandsIn');
    mesh(new THREE.BoxGeometry(24, 8, 560), mat.concrete, -3380, 0, -420, -0.55, 'islandsIn');
    addBox(-3420, 0, -1350, 12, 4, 310, 0.5); addBox(-3380, 0, -420, 12, 4, 280, -0.55);
    light(-3270, 8, -1080, 0x30ff60, 5, 2, 0.2); light(-3250, 8, -650, 0xff2a2a, 5, 2, 0.7);

    // Port City downtown mid-rise skyline cluster (26 stepped towers behind the harbour).
    const towersPlaced = [];
    {
      const srnd = env.mulberry32(4049);
      const tPal = [0x9aa6b2, 0xb8b5aa, 0x7a8b99, 0xc7c2b6, 0x687887, 0xa8aeb5];
      for (let k = 0; k < 500 && towersPlaced.length < 26; k++) {
        const tx2 = -1520 + srnd() * 540, tz2 = -1260 + srnd() * 880, ty2 = heightAt(tx2, tz2);
        if (ty2 < 5 || ty2 > 52) continue;
        if (Math.abs(heightAt(tx2 + 16, tz2) - ty2) > 4.5 || Math.abs(heightAt(tx2, tz2 + 16) - ty2) > 4.5) continue;
        if (tanks.some(t => Math.hypot(t[0] - tx2, t[1] - tz2) < t[2] + 28)) continue;
        if (towersPlaced.some(t => Math.hypot(t[0] - tx2, t[1] - tz2) < 46)) continue;
        const w = 18 + srnd() * 14, d = 18 + srnd() * 14, h = 28 + Math.pow(srnd(), 1.3) * 52, yaw = (Math.floor(srnd() * 4) * 0.5 + 0.08) * Math.PI;
        const col = tPal[Math.floor(srnd() * tPal.length)];
        towersPlaced.push([tx2, tz2, Math.max(w, d)]);
        inst('box', tx2, ty2 + h * 0.5 - 2, tz2, w, h + 4, d, col, yaw);
        inst('box', tx2, ty2 + h + 2.2, tz2, w * 0.62, 4.5, d * 0.62, 0x5c646c, yaw);
        addBox(tx2, ty2 + h * 0.5, tz2, w * 0.5, h * 0.5 + 2, d * 0.5, yaw);
        if (h > 46) light(tx2, ty2 + h + 5.2, tz2, 0xff2020, 4.5, 2, srnd());
        for (let lv = 0; lv < 3; lv++) {
          light(tx2 + (srnd() - 0.5) * w * 0.8, ty2 + 8 + srnd() * (h - 12), tz2 + (srnd() - 0.5) * d * 0.8, 0xffd28a, 2.8, 4, srnd());
        }
      }
    }

    // Waterfront town: instanced houses on gentle slopes above the quay (anchored inside GORGE_BBOX so GORGE masks cleanly).
    const rnd = env.mulberry32(5150), houses = [];
    for (let k = 0; k < 1050 && houses.length < 185; k++) {
      const hx = -1650 + (rnd() - 0.2) * 1300, hz = -900 + (rnd() - 0.5) * 1700, hy = heightAt(hx, hz);
      if (hy < 4 || hy > 80 || Math.abs(heightAt(hx + 12, hz) - hy) > 5 || Math.abs(heightAt(hx, hz + 12) - hy) > 5) continue;
      if (hx > RWY.x - 400) continue;
      if (tanks.some(t => Math.hypot(t[0] - hx, t[1] - hz) < t[2] + 22)) continue;
      if (towersPlaced.some(t => Math.hypot(t[0] - hx, t[1] - hz) < t[2] + 16)) continue;
      houses.push([hx, hy, hz, 8 + rnd() * 10, 6 + rnd() * 9, 8 + rnd() * 10, rnd() * Math.PI]);
    }
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M(0xffffff, { roughness: 0.85 }), houses.length);
    const roofG = new THREE.ConeGeometry(0.75, 1, 4); roofG.rotateY(Math.PI / 4);
    const roof = new THREE.InstancedMesh(roofG, M(0xffffff, { roughness: 0.8 }), houses.length);
    body.position.copy(ANC_IN); roof.position.copy(ANC_IN);
    body.userData.propBucket = 'islandsIn'; roof.userData.propBucket = 'islandsIn';
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), wall = new THREE.Color(), rc = new THREE.Color();
    houses.forEach(([hx, hy, hz, w, h, d, r], k) => {
      q4.setFromAxisAngle(_up, r);
      m4.compose(_bp.set(hx - ANC_IN.x, hy + h / 2, hz - ANC_IN.z), q4, _bs.set(w, h, d)); body.setMatrixAt(k, m4);
      m4.compose(_bp.set(hx - ANC_IN.x, hy + h + 2.5, hz - ANC_IN.z), q4, _bs.set(w * 1.05, 5, d * 1.05)); roof.setMatrixAt(k, m4);
      body.setColorAt(k, wall.setHSL(0.08 + rnd() * 0.08, 0.15 + rnd() * 0.2, 0.72 + rnd() * 0.18));
      roof.setColorAt(k, rc.setHSL(rnd() < 0.6 ? 0.02 : 0.58, 0.45, 0.32 + rnd() * 0.12));
      if (rnd() < 0.55) light(hx + (rnd() - 0.5) * w, hy + 2 + rnd() * h * 0.6, hz + (rnd() - 0.5) * d, 0xffc46a, 2.4 + rnd() * 1.5, 4, rnd());
    });
    body.computeBoundingSphere(); roof.computeBoundingSphere();
    props.add(body, roof);
  }

  // ---- NW BASALT CANYON NATURAL ARCH, SUMMIT OBSERVATORY & VOLCANO PLUME ----
  {
    // Natural sculpted basalt arch spanning high across the NW Canyon gorge at z = -7000
    // (195 m vertical water clearance below, well clear of strike jammers at -6400 / -7600).
    const az = -7000, acx = canyonX(az), hw = canyonHalf(az) + 42;
    const archSpan = hw * 2 + 50;
    inst('box', acx, 212, az, archSpan, 28, 44, 0x454d54);
    inst('box', acx - hw - 18, 112, az, 48, 224, 52, 0x3e464d);
    inst('box', acx + hw + 18, 112, az, 48, 224, 52, 0x3e464d);
    addBox(acx, 212, az, archSpan * 0.5, 15, 23);
    addBox(acx - hw - 18, 112, az, 25, 112, 26);
    addBox(acx + hw + 18, 112, az, 25, 112, 26);

    // High Ridge Space-Track / Weather Observatory atop Main Island NW ridge.
    const ox = -1550, oz = -2950, oy = Math.max(40, heightAt(ox, oz));
    inst('cyl', ox, oy + 2, oz, 56, 8, 56, 0x8f928c);
    inst('box', ox, oy + 9, oz + 8, 28, 8, 16, 0xd8dad6);
    const obsDome = new THREE.SphereGeometry(10, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    mesh(obsDome, mat.dome, ox - 13, oy + 6, oz - 6, 0, 'islandsIn');
    mesh(obsDome, mat.dome, ox + 13, oy + 6, oz - 6, 0, 'islandsIn');
    beam(ox, oy + 6, oz + 16, ox, oy + 44, oz + 16, 1.6, 0xb8362a);
    light(ox, oy + 45.5, oz + 16, 0xff2020, 7, 2, 0.35);
    addBox(ox, oy + 14, oz, 26, 16, 26);
  }

  // Rising volcanic fumarole steam plume from NE Volcano caldera (5600, ~740, -8300).
  const steamPuffs = [];
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(235,238,242,0.52)'); gr.addColorStop(0.55, 'rgba(210,216,224,0.22)'); gr.addColorStop(1, 'rgba(200,208,218,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const stTex = new THREE.CanvasTexture(cv); stTex.colorSpace = THREE.SRGBColorSpace;
    const volcGroup = new THREE.Group();
    volcGroup.position.set(5600, 710, -8300);
    volcGroup.userData.propBucket = 'islandsOut';
    props.add(volcGroup);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stTex, color: 0xd8dde4, transparent: true, opacity: 0.28, depthWrite: false, fog: true }));
      volcGroup.add(sp);
      steamPuffs.push({ sp, ph: i / 6 });
    }
    // Subtle magma glow points deep in the caldera bowl for dusk/night flyovers.
    for (let i = 0; i < 5; i++) {
      const a = i * 1.256, r = 70 + (i % 2) * 85;
      const vx = 5600 + Math.cos(a) * r, vz = -8300 + Math.sin(a) * r;
      light(vx, heightAt(vx, vz) + 6, vz, 0xff5a18, 18, 6, i * 0.21);
    }
  }

  // ---- LIGHTHOUSES (rotating beams) + RADAR STATIONS ------------------------
  const beamG = new THREE.CylinderGeometry(1.5, 34, 1100, 16, 1, true); beamG.translate(0, 550, 0); beamG.rotateZ(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  // Strait props are placed from the analytic straitHeight before that grid exists, so
  // their sites are recorded and kept out of the strait erosion (protectStrait).
  const straitSites = [];
  const protectStrait = (x, z) => {
    let m = 1;
    for (let k = 0; k < straitSites.length; k++) m = Math.min(m, ss(Math.hypot(x - straitSites[k][0], z - straitSites[k][1]), 260, 560));
    return m;
  };
  function lighthouse(x, z, mapKind = 'arch', hFn = heightAt) {
    if (mapKind === 'strait') straitSites.push([x, z]);
    const y = Math.max(2, hFn(x, z));
    const bucket = mapKind === 'strait' ? 'strait' : (inGorgeBBox(x, z) ? 'islandsIn' : 'islandsOut');
    const mapId = mapKind === 'strait' ? 2 : 0;
    for (let k = 0; k < 5; k++) mesh(new THREE.CylinderGeometry(3.6 - k * 0.25, 3.8 - k * 0.25, 6, 14), k % 2 ? mat.red : mat.white, x, y + 3 + k * 6, z, 0, bucket);
    mesh(new THREE.CylinderGeometry(3.4, 3.4, 4, 10), mat.glass, x, y + 33, z, 0, bucket);
    mesh(new THREE.ConeGeometry(3.8, 4, 10), mat.red, x, y + 37, z, 0, bucket);
    addBox(x, y + 18, z, 4, 20, 4, 0, mapKind);
    const pivot = new THREE.Group(); pivot.position.set(x, y + 33, z); pivot.userData.propBucket = bucket; props.add(pivot);
    for (const r of [0, Math.PI]) { const bm = new THREE.Mesh(beamG, beamMat); bm.rotation.y = r; pivot.add(bm); }
    beams.push(pivot);
    light(x, y + 33, z, 0xfff6d0, 10, 0, 0, mapId);
  }
  function radarStation(x, z, mapKind = 'arch', hFn = heightAt) {
    if (mapKind === 'strait') straitSites.push([x, z]);
    const y = Math.max(2, hFn(x, z));
    const bucket = mapKind === 'strait' ? 'strait' : (inGorgeBBox(x, z) ? 'islandsIn' : 'islandsOut');
    const mapId = mapKind === 'strait' ? 2 : 0;
    mesh(new THREE.BoxGeometry(16, 8, 12), mat.concrete, x, y + 4, z, 0, bucket);
    mesh(new THREE.SphereGeometry(9, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.dome, x - 14, y + 2, z, 0, bucket);
    mesh(new THREE.CylinderGeometry(0.8, 1.1, 14, 8), mat.steel, x + 8, y + 15, z, 0, bucket);
    const ant = new THREE.Group(); ant.position.set(x + 8, y + 23, z);
    if (mapKind === 'strait') ant.userData.propBucket = 'strait';
    props.add(ant);
    const dish = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 1), mat.steel); ant.add(dish);
    radars.push({ g: ant, w: 1.6, strait: mapKind === 'strait' });
    addBox(x - 3, y + 10, z, 20, 12, 10, 0, mapKind);
    light(x + 8, y + 25, z, 0xff2020, 5, 2, 0.4, mapId);
  }
  const atollTip = (cx, cz, R, openAng, side) => [cx + Math.cos(openAng + side * 1.05) * R, cz + Math.sin(openAng + side * 1.05) * R];
  const atollHill = (cx, cz, R, openAng) => [cx + Math.cos(openAng + Math.PI) * R, cz + Math.sin(openAng + Math.PI) * R];
  lighthouse(...atollTip(8300, -1900, 1250, Math.PI, 1));
  lighthouse(...atollTip(-8300, -2600, 1150, 0, -1));
  lighthouse(-1150, 880);
  radarStation(...atollHill(8300, -1900, 1250, Math.PI));
  radarStation(...atollHill(-8300, -2600, 1150, 0));

  // ---- STRAIT FJORD CAPE LIGHTHOUSES & HEADLAND STATIONS (NAVAL_BATTLE) -----
  function findStraitBluff(xSeed, zSeed, minH, maxH) {
    let bx = xSeed, bz = zSeed, best = -1e9;
    const dir = xSeed < 0 ? -1 : 1;
    for (let i = 0; i <= 24; i++) {
      const tx = xSeed + dir * i * 90;
      const h = straitHeight(tx, zSeed);
      if (h >= minH && h <= maxH) return [tx, zSeed];
      if (h > best && h <= maxH) { best = h; bx = tx; }
    }
    return [bx, bz];
  }
  lighthouse(...findStraitBluff(-4900, 3600, 45, 150), 'strait', straitHeight);
  lighthouse(...findStraitBluff(4900, 3400, 45, 150), 'strait', straitHeight);
  lighthouse(...findStraitBluff(-4900, -4800, 45, 150), 'strait', straitHeight);
  lighthouse(...findStraitBluff(4900, -4500, 45, 150), 'strait', straitHeight);
  radarStation(...findStraitBluff(-5800, -1200, 140, 340), 'strait', straitHeight);
  radarStation(...findStraitBluff(5800, -1600, 140, 340), 'strait', straitHeight);

  // ---- CANYON_RUN FORTRESS CITADEL & HIGH TRUSS BRIDGES (GORGE) -------------
  {
    const fx = GORGE_FORT[0], fz = GORGE_FORT[2], fy = 20;
    // Octagonal perimeter bastion ring around GORGE_FORT (r = 250 m), open on the south
    // canyon mouth sector so approach & weapons line-of-sight to FORT at (fx, fy, fz) are clear.
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      const dz = Math.sin(a);
      if (dz > 0.55) continue;                                                // open south gate facing canyon exit
      const wx = fx + Math.cos(a) * 255, wz = fz + dz * 255, wy = gorgeHeight(wx, wz);
      const yaw = -a + Math.PI / 2;
      inst('box', wx, wy + 9, wz, 12, 18, 92, 0x4b5056, yaw, 0, 0, 'gorge');
      inst('cyl', wx, wy + 13, wz, 22, 26, 22, 0x5c6268, 0, 0, 0, 'gorge');
      light(wx, wy + 27.5, wz, 0xff2620, 5.5, 2, s * 0.14, 1);
      addBox(wx, wy + 13, wz, 12, 13, 46, yaw, 'gorge');
    }
    // Flanking citadel command towers, radar dome & fuel depot inside the crater perimeter.
    for (const [ox, oz, h] of [[-175, -130, 48], [175, -130, 48], [0, -210, 62]]) {
      const bx = fx + ox, bz = fz + oz, by = gorgeHeight(bx, bz);
      inst('box', bx, by + h * 0.5, bz, 26, h, 26, 0x565c63, 0, 0, 0, 'gorge');
      inst('box', bx, by + h + 3, bz, 18, 6, 18, 0x3b4046, 0, 0, 0, 'gorge');
      beam(bx, by + h + 6, bz, bx, by + h + 24, bz, 1.4, 0xc03226, 'gorge');
      light(bx, by + h + 25, bz, 0xff2020, 7, 2, (ox + 200) * 0.002, 1);
      addBox(bx, by + h * 0.5, bz, 14, h * 0.5 + 3, 14, 0, 'gorge');
    }
    for (let t = 0; t < 4; t++) {
      const tx2 = fx - 150 + (t % 2) * 34, tz2 = fz + 45 + Math.floor(t / 2) * 34, ty2 = gorgeHeight(tx2, tz2);
      inst('cyl', tx2, ty2 + 8, tz2, 20, 16, 20, 0xd4d8d6, 0, 0, 0, 'gorge');
      addCyl(tx2, tz2, ty2, ty2 + 17, 10.5, 10.5, 'gorge');
    }
    // 3 monumental high-altitude steel canyon truss bridges ABOVE the 1,200 ft radar ceiling (y = CEIL_M + 38 m),
    // framing the trench sky without obstructing low-altitude canyon flight.
    for (const gi of [2, 7, 11]) {
      const bz = GORGE_GATE_Z[gi], bcx = gorgeCentreX(bz), sl = gorgeSlope(bz);
      const perpYaw = gorgeHeading(bz) + Math.PI / 2;
      const span = (GORGE_RAMP_W + 75) * 2, deckY = CEIL_M + 38;
      inst('box', bcx, deckY, bz, 16, 5, span, 0x525860, perpYaw, 0, 0, 'gorge');
      inst('box', bcx, deckY + 11, bz, 14, 2.2, span - 20, 0xb23a29, perpYaw, 0, 0, 'gorge');
      const nx = 1 / Math.sqrt(1 + sl * sl), nz = -sl * nx;
      for (let k = -4; k <= 4; k++) {
        const d = k * 42, px = bcx + nx * d, pz = bz + nz * d;
        beam(px, deckY + 2, pz, px + nx * 21, deckY + 11, pz + nz * 21, 1.3, 0xb23a29, 'gorge');
        beam(px, deckY + 11, pz, px + nx * 21, deckY + 2, pz + nz * 21, 1.3, 0xb23a29, 'gorge');
      }
      for (const sgn of [-1, 1]) {
        const px = bcx + nx * sgn * (GORGE_RAMP_W + 32), pz = bz + nz * sgn * (GORGE_RAMP_W + 32);
        const py = gorgeHeight(px, pz);
        inst('box', px, (py + deckY) * 0.5, pz, 14, Math.max(12, deckY - py + 8), 14, 0x7e827d, perpYaw, 0, 0, 'gorge');
        light(bcx + nx * sgn * 80, deckY + 13.5, bz + nz * sgn * 80, 0xff2020, 6.5, 2, gi * 0.17 + (sgn > 0 ? 0.5 : 0), 1);
      }
      addBox(bcx, deckY + 5, bz, 8, 8, span * 0.5, perpYaw, 'gorge');
    }
    // Rim concrete observation casemates along the canyon edge.
    for (let i = 0; i < GORGE_GATE_N; i += 2) {
      const rz = GORGE_GATE_Z[i], sl = gorgeSlope(rz), inv = 1 / Math.sqrt(1 + sl * sl), side = (i & 2) ? 1 : -1;
      const rx = gorgeCentreX(rz) + side * (GORGE_RAMP_W + 48) * inv, rzz = rz - side * (GORGE_RAMP_W + 48) * sl * inv;
      if (Math.abs(rx - GORGE_SC_X) < 170 && rzz < GORGE_SC_ZA + 170 && rzz > GORGE_SC_ZB - 170) continue;
      const ry = gorgeHeight(rx, rzz);
      inst('box', rx, ry + 4, rzz, 16, 8, 16, 0x5c605c, 0, 0, 0, 'gorge');
      light(rx, ry + 10, rzz, 0xff3020, 4.5, 2, i * 0.11, 1);
    }
  }

  // ---- OFFSHORE WIND FARM (reef bank) ----------------------------------------
  const rotors = [];
  {
    const towerG = new THREE.CylinderGeometry(1.8, 2.8, 88, 12), nacG = new THREE.BoxGeometry(4, 4, 11), hubG = new THREE.SphereGeometry(2.2, 10, 8);
    const bladeG = new THREE.BoxGeometry(2.4, 42, 0.5); bladeG.translate(0, 21, 0);
    const normTurb = g => { const ng = g.index ? g.toNonIndexed() : g.clone(); for (const a of Object.keys(ng.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') ng.deleteAttribute(a); if (!ng.attributes.normal) ng.computeVertexNormals(); return ng; };
    const rotorParts = [normTurb(hubG)];
    for (let b = 0; b < 3; b++) rotorParts.push(normTurb(bladeG).rotateZ(b * Math.PI * 2 / 3));
    const rotorG = mergeGeometries(rotorParts, false);
    for (const rp of rotorParts) rp.dispose();
    const n = 9;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n, x = REEF.a[0] + (REEF.b[0] - REEF.a[0]) * f, z = REEF.a[1] + (REEF.b[1] - REEF.a[1]) * f;
      mesh(new THREE.CylinderGeometry(4, 4.5, 14, 12), mat.yellow, x, 0, z, 0, 'islandsOut');
      mesh(towerG, mat.turbine, x, 44, z, 0, 'islandsOut');
      mesh(nacG, mat.turbine, x, 90, z - 2, 0, 'islandsOut');
      const rotor = new THREE.Mesh(rotorG, mat.turbine); rotor.position.set(x, 90, z - 8.6); rotor.userData.propBucket = 'islandsOut'; props.add(rotor);
      rotor.rotation.z = k * 0.7;
      rotors.push({ g: rotor, w: 0.55 + (k % 3) * 0.06 });
      addBox(x, 45, z, 3, 46, 3);
      addBox(x, 90, z - 8.6, 44, 44, 3);
      light(x, 93, z - 2, 0xff2020, 6, 2, (k % 2) * 0.5);
    }
  }

  // ---- OFFSHORE OIL PLATFORMS ------------------------------------------------
  const RIGS = [[-6300, 4300, 0.4], [7700, 5600, -0.7], [-300, -11300, 1.2]];
  const flames = [];
  {
    const flameTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 96, 2, 32, 80, 60);
      gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.25, 'rgba(255,190,70,0.95)');
      gr.addColorStop(0.6, 'rgba(255,90,20,0.45)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(32, 72, 26, 56, 0, 0, Math.PI * 2); g.fill();
      return new THREE.CanvasTexture(cv);
    })();
    const flameMat = new THREE.SpriteMaterial({ map: flameTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false });
    const rot = (ox, oz, c, s) => [ox * c - oz * s, ox * s + oz * c];
    for (const [rx, rz, ry] of RIGS) {
      const c = Math.cos(ry), s = Math.sin(ry), P = (ox, oz) => { const [a, b] = rot(ox, oz, c, s); return [rx + a, rz + b]; };
      const DECK = 38, L = 30, GREY = 0x7a8088, YEL = 0xd9a520;
      const legs = [[-L, -L], [L, -L], [L, L], [-L, L]].map(([ox, oz]) => P(ox, oz));
      for (const [lx, lz] of legs) { inst('cyl', lx, (DECK - 34) / 2, lz, 5, DECK + 34, 5, YEL); addCyl(lx, lz, -40, DECK, 3.4); }
      for (let i = 0; i < 4; i++) {
        const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
        for (const yy of [2, 18, 32]) beam(ax, yy, az, bx, yy, bz, 1.3, GREY);
        beam(ax, 2, az, bx, 18, bz, 1.1, GREY); beam(bx, 2, bz, ax, 18, az, 1.1, GREY);
        beam(ax, 18, az, bx, 32, bz, 1.1, GREY); beam(bx, 18, bz, ax, 32, az, 1.1, GREY);
      }
      inst('box', rx, DECK, rz, 90, 4, 90, 0x5c6168, -ry);
      inst('box', rx, DECK + 14, rz, 74, 3, 66, 0x5c6168, -ry);
      for (const [ox, oz, w, h, d, col] of [[-22, -20, 30, 12, 26, 0xe2e2dc], [16, -24, 26, 12, 20, 0xc9542a], [-24, 18, 26, 10, 30, 0x8c939a],
        [20, 22, 22, 9, 24, 0xe2e2dc], [0, 0, 18, 22, 18, 0x9aa1a8]]) { const [mx, mz] = P(ox, oz); inst('box', mx, DECK + 2 + h / 2, mz, w, h, d, col, -ry); }
      addBox(rx, DECK + 12, rz, 46, 14, 46, -ry);
      const [dx0, dz0] = P(-20, 14), DB = DECK + 16, DT = DB + 64;
      const corners = [[-6, -6], [6, -6], [6, 6], [-6, 6]];
      for (let i = 0; i < 4; i++) {
        const [ox, oz] = corners[i], [px2, pz2] = corners[(i + 1) % 4];
        beam(dx0 + ox, DB, dz0 + oz, dx0 + ox * 0.25, DT, dz0 + oz * 0.25, 1.1, 0xd8d8d0);
        for (let k = 0; k < 6; k++) {
          const f0 = k / 6, f1 = (k + 1) / 6, w0 = 1 - 0.75 * f0, w1 = 1 - 0.75 * f1;
          beam(dx0 + ox * w0, DB + 64 * f0, dz0 + oz * w0, dx0 + px2 * w1, DB + 64 * f1, dz0 + pz2 * w1, 0.5, 0xd8d8d0);
          beam(dx0 + ox * w1, DB + 64 * f1, dz0 + oz * w1, dx0 + px2 * w1, DB + 64 * f1, dz0 + pz2 * w1, 0.5, 0xd8d8d0);
        }
      }
      addBox(dx0, (DB + DT) / 2, dz0, 7, 32, 7, -ry);
      light(dx0, DT + 1, dz0, 0xff2020, 7, 2, rx * 0.001);
      const [hx, hz] = P(48, 34);
      inst('cyl', hx, DECK + 20, hz, 30, 1.4, 30, 0xf0f0ea);
      inst('cyl', hx, DECK + 20.5, hz, 27, 1.4, 27, 0x2f4a36);
      for (const [ox, oz, w, d] of [[-4, 0, 1.6, 11], [4, 0, 1.6, 11], [0, 0, 8, 1.6]]) { const [a, b] = rot(ox, oz, c, s); inst('box', hx + a, DECK + 21.3, hz + b, w, 0.3, d, 0xf0f0ea, -ry); }
      beam(...P(30, 30).flatMap((v, i) => (i ? [DECK + 14, v] : [v])), hx, DECK + 19, hz, 2, GREY);
      addCyl(hx, hz, DECK + 18, DECK + 22, 15);
      const [cx2, cz2] = P(28, -10);
      inst('cyl', cx2, DECK + 22, cz2, 3, 16, 3, YEL);
      beam(cx2, DECK + 30, cz2, ...((v) => [v[0], DECK + 52, v[1]])(P(70, -30)), 1.4, YEL);
      const [fbx, fbz] = P(-45, -45), [ftx, ftz] = P(-105, -105), FT = DECK + 62;
      beam(fbx, DECK + 4, fbz, ftx, FT, ftz, 2.2, 0xb0b4b8);
      beam(fbx + 3, DECK + 4, fbz - 3, ftx, FT, ftz, 1.0, 0xb0b4b8);
      addCyl(ftx, ftz, FT - 6, FT + 30, 6);
      const fl = new THREE.Sprite(flameMat); fl.position.set(ftx, FT + 10, ftz); fl.scale.set(10, 22, 1);
      fl.userData.propBucket = inGorgeBBox(ftx, ftz) ? 'islandsIn' : 'islandsOut';
      props.add(fl);
      flames.push({ s: fl, base: FT, ph: rx * 0.01 });
      light(ftx, FT + 6, ftz, 0xff8a2a, 16, 6, rz * 0.001);
      for (const [lx, lz] of legs) light(lx, DECK + 3, lz, 0xff2020, 4, 2, (lx + lz) * 0.001);
    }
  }

  // ---- BASALT SEA STACKS -----------------------------------------------------
  const stacks = [];
  {
    const g = new THREE.CylinderGeometry(0.5, 1, 1, 9, 10, false);
    g.translate(0, 0.5, 0);
    const gp = g.attributes.position, nz = createNoise2D(4711);
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.16 * nz(Math.cos(a) * 1.7, y * 2.3) + 0.08 * Math.sign(Math.sin(a * 9));
      gp.setX(i, x * k); gp.setZ(i, z * k);
      if (y > 0.95) gp.setY(i, y + 0.12 * nz(x * 4, z * 4));
    }
    g.computeVertexNormals();
    const srnd = env.mulberry32(9157);
    const bridgeD = (x, z) => Math.min(...BRIDGES.map(b => capsule(x, z, b.a[0], b.a[1], b.b[0], b.b[1])));
    for (let k = 0; k < 6000 && stacks.length < 15; k++) {
      const x = WORLD.CX - WORLD.SIZE / 2 + 900 + srnd() * (WORLD.SIZE - 1800), z = WORLD.CZ - WORLD.SIZE / 2 + 900 + srnd() * (WORLD.SIZE - 1800);
      if (heightAt(x, z) > -12) continue;
      let nearLand = false;
      for (let a = 0; a < 8 && !nearLand; a++) for (const r of [350, 700, 1100]) if (heightAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r) > 8) nearLand = true;
      if (!nearLand) continue;
      if (inApproach(x, z, 300) || bridgeD(x, z) < 750) continue;
      if (z > -11400 && z < -5000 && Math.abs(x - canyonX(z)) < 900) continue;
      if (capsule(x, z, REEF.a[0], REEF.a[1], REEF.b[0], REEF.b[1]) < 700) continue;
      if (RIGS.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < 1200)) continue;
      if (stacks.some(st => Math.hypot(st.x - x, st.z - z) < 650)) continue;
      const h = 120 + srnd() * 260, r = 28 + h * 0.1 + srnd() * 18;
      stacks.push({ x, z, h, r, ry: srnd() * Math.PI * 2 });
    }
    const stackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, flatShading: true });
    const stacksIn = stacks.filter(st => inGorgeBBox(st.x, st.z)), stacksOut = stacks.filter(st => !inGorgeBBox(st.x, st.z));
    for (const [list, inB] of [[stacksOut, false], [stacksIn, true]]) {
      if (!list.length) continue;
      const sm = new THREE.InstancedMesh(g, stackMat, list.length);
      const off = inB ? ANC_IN : _ba.set(0, 0, 0);
      sm.position.copy(off);
      sm.userData.propBucket = inB ? 'islandsIn' : 'islandsOut';
      const sq = new THREE.Quaternion(), sc = new THREE.Color();
      list.forEach((st, k) => {
        sq.setFromAxisAngle(_up, st.ry);
        _bm.compose(_bp.set(st.x - off.x, -30 - off.y, st.z - off.z), sq, _bs.set(st.r, st.h + 30, st.r)); sm.setMatrixAt(k, _bm);
        sm.setColorAt(k, sc.set(0x4a5258).lerp(new THREE.Color(0x5e666c), srnd() * 0.7));
        addCyl(st.x, st.z, -30, st.h + 4, st.r * 1.2, st.r * 0.6);
      });
      sm.computeBoundingSphere();
      props.add(sm);
    }
    // Strait Fjord sea stacks (outside |x| < 4800 m naval battle lane).
    const straitStacks = [
      [-5150, -5600, 210, 44, 0.8], [-5050, -1400, 175, 38, 2.1], [-5250, 2600, 195, 42, 4.0],
      [5150, -4900, 225, 46, 1.4], [5080, -900, 165, 36, 3.5], [5220, 2850, 185, 40, 5.1]
    ];
    const ssm = new THREE.InstancedMesh(g, stackMat, straitStacks.length);
    ssm.userData.propBucket = 'strait';
    const sq = new THREE.Quaternion(), sc = new THREE.Color();
    straitStacks.forEach(([sx, sz, sh, sr, sry], k) => {
      sq.setFromAxisAngle(_up, sry);
      _bm.compose(_bp.set(sx, -30, sz), sq, _bs.set(sr, sh + 30, sr)); ssm.setMatrixAt(k, _bm);
      ssm.setColorAt(k, sc.set(0x464e55));
      addCyl(sx, sz, -30, sh + 4, sr * 1.2, sr * 0.6, 'strait');
    });
    ssm.computeBoundingSphere();
    props.add(ssm);
  }

  flushBatches();

  // ---- INSTANCED FOREST GROVES ---------------------------------------------------
  const FARM = (() => {
    const f = Math.fround;
    const fract = x => f(x - Math.floor(x));
    function h12(px, py) {
      let x = fract(f(px * f(0.1031))), y = fract(f(py * f(0.1031))), z = x;
      const d = f(f(x * f(y + f(33.33))) + f(f(y * f(z + f(33.33))) + f(z * f(x + f(33.33)))));
      x = f(x + d); y = f(y + d); z = f(z + d);
      return fract(f(f(x + y) * z));
    }
    function edge(x, z) {
      const qx = x / 2400, qz = z / 2400, cx = Math.floor(qx), cz = Math.floor(qz);
      let f1 = 9, f2 = 9, rx = 0, rz = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gz = cz + j;
        const px = gx + 0.15 + 0.7 * h12(gx, gz), pz = gz + 0.15 + 0.7 * h12(gx + 17.3, gz + 17.3);
        const d = Math.hypot(qx - px, qz - pz);
        if (d < f1) { f2 = f1; f1 = d; rx = gx; rz = gz; } else if (d < f2) f2 = d;
      }
      const k = Math.floor(h12(rx + 5.1, rz + 5.1) * 4);
      const ang = [0, 0.383972, -0.296706, 0.663225][k];
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const u = ca * x + sa * z + h12(rx + 3.7, rz + 3.7) * 1000, v = -sa * x + ca * z + h12(rx + 9.2, rz + 9.2) * 1000;
      const rk = rx * 31 + rz;
      const cI = Math.floor(u / 520), lx = u - cI * 520, s1 = (0.3 + 0.4 * h12(cI, rk)) * 520;
      const col = cI * 2 + (lx < s1 ? 0 : 1), dU = Math.min(lx, 520 - lx, Math.abs(lx - s1));
      const vv = v + h12(col, rk + 1) * 460, rJ = Math.floor(vv / 460), ly = vv - rJ * 460, s2 = (0.3 + 0.4 * h12(rJ, col + rk)) * 460;
      const row = rJ * 2 + (ly < s2 ? 0 : 1), dV = Math.min(ly, 460 - ly, Math.abs(ly - s2));
      return { hedge: Math.min(dU, dV), road: (f2 - f1) * 1200, plot: h12(col + rx * 97, row + rz * 97) };
    }
    return { edge };
  })();
  const trees = (() => {
    const rnd = env.mulberry32(60617);
    const inRect = (x, z, r, pad = 0) => x > r.x - pad && x < r.y + pad && z > r.z - pad && z < r.w + pad;
    const AFB = FARM_U.uAfb.value, TOWN = FARM_U.uTown.value;
    const bSeg = bridgeInfo.map(b => [b.a.x, b.a.z, b.b.x, b.b.z]);
    const segD = (x, z, [ax, az, bx, bz]) => {
      const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      return Math.hypot(x - ax - dx * t, z - az - dz * t);
    };
    const reject = { low: 0, high: 0, slope: 0, afb: 0, built: 0 };
    function ok(x, z) {
      const y = heightAt(x, z);
      if (y < 16) { reject.low++; return null; }
      if (y > 290) { reject.high++; return null; }
      const sx = (heightAt(x + 6, z) - heightAt(x - 6, z)) / 12, sz = (heightAt(x, z + 6) - heightAt(x, z - 6)) / 12;
      if (Math.max(Math.abs(sx), Math.abs(sz)) > 0.42) { reject.slope++; return null; }
      if (inRect(x, z, AFB, 450) || (Math.abs(x - RWY.x) < 450 && z > RWY.z0 - 3200 && z < RWY.z1 + 3200)) { reject.afb++; return null; }
      if (inRect(x, z, TOWN, 60) || bSeg.some(s => segD(x, z, s) < 260)) { reject.built++; return null; }
      for (const b of boxes) if (Math.abs(x - b.c.x) < Math.max(b.hx, b.hz) + 40 && Math.abs(z - b.c.z) < Math.max(b.hx, b.hz) + 40) { reject.built++; return null; }
      for (const c of cyls) if (Math.hypot(x - c.x, z - c.z) < c.r0 + 30) { reject.built++; return null; }
      return y;
    }
    const list = [];
    const MAX = 3000;
    let groves = 0;
    for (let g = 0; g < 12000 && groves < 160 && list.length < 1850; g++) {
      const cx = WORLD.CX + (rnd() - 0.5) * WORLD.SIZE * 0.92, cz = WORLD.CZ + (rnd() - 0.5) * WORLD.SIZE * 0.92;
      if (fbm(nVeg, cx * 0.0011, cz * 0.0011, 3) < 0.08 || ok(cx, cz) === null) continue;
      groves++;
      const R = 70 + rnd() * 200, n = Math.round(4 + R * 0.05 + rnd() * 8);
      for (let i = 0; i < n * 2 && list.length < 1850; i++) {
        const a = rnd() * Math.PI * 2, r = R * Math.sqrt(-2 * Math.log(1 - rnd() * 0.95)) * 0.5;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (list.some(t => Math.abs(t[0] - x) < 7 && Math.abs(t[2] - z) < 7)) continue;
        const y = ok(x, z);
        if (y !== null) list.push([x, y, z, 0]);
      }
    }
    const groveTrees = list.length;
    for (let g = 0; g < 80000 && list.length < MAX; g++) {
      const x = WORLD.CX + (rnd() - 0.5) * WORLD.SIZE * 0.92, z = WORLD.CZ + (rnd() - 0.5) * WORLD.SIZE * 0.92;
      const h0 = heightAt(x, z);
      if (h0 < 16 || h0 > 280) continue;
      const e = FARM.edge(x, z);
      if (e.hedge > 5 || e.road < 10 || e.plot > 0.5) continue;
      const y = ok(x, z);
      if (y === null || y > 280) continue;
      list.push([x, y, z, 1]);
    }
    const cone = (r, h, y0, seg) => {
      const g = new THREE.BufferGeometry(), a = [];
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
        a.push(0, y0 + h, 0, Math.sin(a0) * r, y0, Math.cos(a0) * r, Math.sin(a1) * r, y0, Math.cos(a1) * r);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
      return g;
    };
    const parts = [
      [new THREE.CylinderGeometry(0.45, 0.6, 4.5, 4, 1, true).translate(0, 2.25, 0), [0.42, 0.33, 0.24]],
      [cone(4.3, 10, 3, 7), [1, 1, 1]],
      [cone(3.0, 9, 9, 7), [1.08, 1.1, 1.05]]
    ];
    const P = [], Nn = [], C = [];
    for (const [g0, rgb] of parts) {
      const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals();
      P.push(...g.attributes.position.array); Nn.push(...g.attributes.normal.array);
      for (let i = 0; i < g.attributes.position.count; i++) C.push(...rgb);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    tg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    tg.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true, fog: true });
    tm.onBeforeCompile = sh => {
      sh.uniforms.uSun = FARM_U.uSun;
      sh.uniforms.uMieCol = FARM_U.uMieCol;
      sh.uniforms.uMieK = FARM_U.uMieK;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTWPos;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 tOrg = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          transformed *= 1.0 - smoothstep(6000.0, 9000.0, distance(tOrg, cameraPosition));
          vTWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vTWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSun; uniform vec3 uMieCol; uniform float uMieK; varying vec3 vTWPos;')
        .replace('#include <fog_fragment>', `
        #ifdef USE_FOG
          vec3 tToP = vTWPos - cameraPosition;
          float tDist = length(tToP);
          vec3 tDir = tToP / max(tDist, 1e-4);
          float tSun = max(dot(tDir, normalize(uSun + vec3(0.0, 1e-5, 0.0))), 0.0);
          vec3 tMie = uMieCol * (pow(tSun, 4.0) * 0.42 + pow(tSun, 20.0) * 0.58) * uMieK;
          vec3 tAerial = fogColor + tMie * smoothstep(600.0, 7500.0, tDist);
          #ifdef FOG_EXP2
            float tFog = 1.0 - exp(-fogDensity * fogDensity * tDist * tDist);
          #else
            float tFog = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor.rgb = mix(gl_FragColor.rgb, tAerial, clamp(tFog, 0.0, 1.0));
        #endif`);
    };
    const im = new THREE.InstancedMesh(tg, tm, list.length);
    const PAL = [0x243620, 0x2d4226, 0x354829, 0x1f2e1c].map(h => new THREE.Color(h));
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3(), tc = new THREE.Color();
    list.forEach(([x, y, z], k) => {
      const s = 0.78 + rnd() * 0.67, w = s * (0.85 + rnd() * 0.4);
      q4.setFromEuler(e4.set((rnd() - 0.5) * 0.06, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.06));
      m4.compose(p4.set(x, y - 1.5, z), q4, s4.set(w, s, w));
      im.setMatrixAt(k, m4);
      im.setColorAt(k, tc.copy(PAL[Math.floor(rnd() * 4)]).multiplyScalar(0.9 + rnd() * 0.2));
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.frustumCulled = true; im.matrixAutoUpdate = false; im.updateMatrix();
    im.castShadow = false; im.receiveShadow = false;
    im.name = 'forest';
    scene.add(im);
    return { mesh: im, count: list.length, groves, groveTrees, lineTrees: list.length - groveTrees, tris: tg.attributes.position.count / 3, reject };
  })();

  // ---- light-point renderer (archipelago + gorge + strait + drifting traffic) ----
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(LP.pos, 3));
  lg.setAttribute('aColor', new THREE.Float32BufferAttribute(LP.col, 3));
  lg.setAttribute('aSize', new THREE.Float32BufferAttribute(LP.size, 1));
  lg.setAttribute('aMode', new THREE.Float32BufferAttribute(LP.mode, 1));
  lg.setAttribute('aPhase', new THREE.Float32BufferAttribute(LP.phase, 1));
  lg.setAttribute('aMap', new THREE.Float32BufferAttribute(LP.map, 1));
  lg.setAttribute('aSpan', new THREE.Float32BufferAttribute(LP.span, 3));
  const lightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 600 },
      uMapId: { value: 0 }, uMask: { value: new THREE.Vector4(1, -1, 1, -1) } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aColor; attribute float aSize; attribute float aMode; attribute float aPhase;
      attribute float aMap; attribute vec3 aSpan;
      uniform float uTime; uniform float uNight; uniform float uScale; uniform float uMapId; uniform vec4 uMask;
      varying vec3 vC; varying float vA;
      void main() {
        float on = 1.0;
        vec3 wpos = position;
        if (aMode > 6.5) wpos += aSpan * fract(uTime * 0.028 + aPhase);
        // Map filter: archipelago (0) shows aMap==0; gorge (1) shows aMap==1 plus aMap==0 outside uMask; strait (2) shows aMap==2.
        if (uMapId < 0.5) {
          if (aMap > 0.5) on = 0.0;
        } else if (uMapId < 1.5) {
          if (aMap > 1.5) on = 0.0;
          else if (aMap < 0.5 && wpos.x > uMask.x && wpos.x < uMask.y && wpos.z > uMask.z && wpos.z < uMask.w) on = 0.0;
        } else {
          if (abs(aMap - 2.0) > 0.5) on = 0.0;
        }
        if (aMode > 0.5 && aMode < 1.5) on *= step(fract(uTime * 0.5 - aPhase), 0.06);
        else if (aMode > 1.5 && aMode < 2.5) on *= step(fract(uTime * 0.65 + aPhase), 0.35);
        else if (aMode > 2.5 && aMode < 3.5) on *= pow(max(0.0, cos((uTime * 0.8 + aPhase) * 6.2831853)), 6.0);
        else if (aMode > 3.5 && aMode < 4.5) on *= 0.75 + 0.25 * sin(uTime * (1.0 + aPhase * 3.0) + aPhase * 50.0);
        else if (aMode > 5.5 && aMode < 6.5) on *= 0.8 + 0.2 * sin(uTime * 23.0 + aPhase * 40.0) * sin(uTime * 9.0 + aPhase * 11.0);
        bool hi = (aMode > 0.5 && aMode < 1.5) || (aMode > 4.5 && aMode < 6.5);
        float vis = (aMode > 3.5 && aMode < 4.5) ? smoothstep(0.35, 0.8, uNight)
          : (aMode > 6.5) ? smoothstep(0.18, 0.65, uNight)
          : mix(hi ? 0.7 : 0.18, 1.0, uNight);
        vC = aColor; vA = on * vis;
        vec4 mv = modelViewMatrix * vec4(wpos, 1.0);
        float minPx = hi ? 3.2 + 2.0 * uNight : 2.2 + 2.6 * uNight;
        gl_PointSize = (on > 0.001 ? clamp(aSize * uScale / max(1.0, -mv.z), minPx, 56.0) * (hi ? 0.85 + 0.15 * uNight : 0.65 + 0.35 * uNight) : 0.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vC; varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = vA * (smoothstep(1.0, 0.0, r) * 0.55 + smoothstep(0.35, 0.0, r));
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC * (1.0 + 2.0 * smoothstep(0.3, 0.0, r)), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const lightPts = new THREE.Points(lg, lightMat);
  lightPts.frustumCulled = false; lightPts.renderOrder = 7;
  scene.add(lightPts);

  /* --------------------------------------------------------------- frame */
  let night = 0;
  function update(dt, t, nightLevel, renderer, camera) {
    night = nightLevel;
    lightMat.uniforms.uTime.value = t;
    lightMat.uniforms.uNight.value = nightLevel;
    if (renderer && camera) lightMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    beamMat.opacity = 0.03 + 0.2 * nightLevel;
    for (const b of beams) b.rotation.y = t * 1.1;
    for (const r of radars) r.g.rotation.y = t * r.w;
    for (const r of rotors) r.g.rotation.z += r.w * dt;
    for (const f of flames) {
      const k = 0.85 + 0.15 * Math.sin(t * 17 + f.ph) * Math.sin(t * 6.3 + f.ph * 3) + 0.06 * Math.sin(t * 41 + f.ph);
      f.s.scale.set(16 * (0.9 + 0.1 * Math.sin(t * 13 + f.ph)), 36 * k, 1);
      f.s.position.y = f.base + 16 * k;
    }
    for (let i = 0; i < steamPuffs.length; i++) {
      const p = steamPuffs[i], u = (t * 0.045 + p.ph) % 1;
      p.sp.position.set(Math.sin(u * 5.0 + i) * 65 + u * 160, 25 + u * 290, -u * 90 + Math.cos(u * 4.0 + i) * 55);
      const sc = 130 + u * 280;
      p.sp.scale.set(sc, sc * 0.72, 1);
      p.sp.material.opacity = Math.sin(u * Math.PI) * 0.24;
    }
  }

  /* ------------------------------------------------- tactical sectors */
  const SECTORS = [
    { id: 1, code: 'SEC-01', name: 'ARCHIPELAGO AFB' },
    { id: 2, code: 'SEC-02', name: 'BRIDGE STRAIT' },
    { id: 3, code: 'SEC-03', name: 'NW BASALT CANYON' },
    { id: 4, code: 'SEC-04', name: 'OPEN SEA FLEET' }
  ];
  const CANYON_C = { x: -5600, z: -8200 };
  function sectorAt(x, z) {
    if (Math.hypot(x - CANYON_C.x, z - CANYON_C.z) < 3400) return SECTORS[2];
    if (z < -2600 && z > -6400 && Math.abs(x) < 6800) return SECTORS[1];
    if (Math.hypot(x - 300, z + 600) < 4300) return SECTORS[0];
    return SECTORS[3];
  }
  const FLEET_LANE = { a: new THREE.Vector3(-8200, 0, 800), b: new THREE.Vector3(-2600, 0, 5000) };
  function isTerrainOccluded(a, b, steps = 10, margin = 4) {
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (heightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > a.y + (b.y - a.y) * t + margin) return true;
    }
    return false;
  }

  const _l = new THREE.Vector3();
  function collide(p, pad = 0) {
    for (const b of boxes) {
      _l.copy(p).sub(b.c);
      const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw);
      const lx = _l.x * c + _l.z * s, lz = -_l.x * s + _l.z * c;
      if (Math.abs(lx) < b.hx + pad && Math.abs(_l.y) < b.hy + pad && Math.abs(lz) < b.hz + pad) return b;
    }
    for (const q of cyls) {
      if (p.y < q.y0 - pad || p.y > q.y1 + pad) continue;
      const f = clamp((p.y - q.y0) / (q.y1 - q.y0), 0, 1), r = q.r0 + (q.r1 - q.r0) * f + pad;
      const dx = p.x - q.x, dz = p.z - q.z;
      if (dx * dx + dz * dz < r * r) return q;
    }
    return null;
  }

  // Shortcut rock arch: one jittered slab mesh, three instances (deck + 2 piers).
  const scSlab = new THREE.BoxGeometry(1, 1, 1);
  {
    const pa = scSlab.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const j = (a, b, c) => Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 0.045;
      pa.setXYZ(i, x + j(x + 0.5, y, z), y + j(y, z, x + 0.5), z + j(z, x, y + 0.5));
    }
    scSlab.computeVertexNormals();
  }
  const scArch = new THREE.InstancedMesh(scSlab, new THREE.MeshStandardMaterial({ color: 0x4c5359, roughness: 0.96, metalness: 0, flatShading: true }), 3);
  scArch.name = 'trenchArch'; scArch.visible = false; scArch.frustumCulled = true;
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos2 = new THREE.Vector3();
    const put = (i, x, y, z, hx, hy, hz) => { pos2.set(x, y, z); sc.set(hx * 2, hy * 2, hz * 2); m.compose(pos2, q, sc); scArch.setMatrixAt(i, m); };
    const deckY = (GORGE_SC_ARCH_Y0 + GORGE_SC_ARCH_Y1) / 2, pierY = (GORGE_SC_FLOOR_Y + GORGE_SC_ARCH_Y1) / 2;
    put(0, GORGE_SC_X, deckY, GORGE_SC_ARCH_Z, GORGE_SC_ARCH_W / 2, (GORGE_SC_ARCH_Y1 - GORGE_SC_ARCH_Y0) / 2, GORGE_SC_ARCH_D / 2);
    put(1, GORGE_SC_X - (GORGE_SC_HALF_W + 20), pierY, GORGE_SC_ARCH_Z, 20, (GORGE_SC_ARCH_Y1 - GORGE_SC_FLOOR_Y) / 2, GORGE_SC_ARCH_D / 2);
    put(2, GORGE_SC_X + (GORGE_SC_HALF_W + 20), pierY, GORGE_SC_ARCH_Z, 20, (GORGE_SC_ARCH_Y1 - GORGE_SC_FLOOR_Y) / 2, GORGE_SC_ARCH_D / 2);
    scArch.instanceMatrix.needsUpdate = true; scArch.computeBoundingSphere();
  }
  scene.add(scArch);
  const scBoxes = [
    { c: new THREE.Vector3(GORGE_SC_X, (GORGE_SC_ARCH_Y0 + GORGE_SC_ARCH_Y1) / 2, GORGE_SC_ARCH_Z), hx: GORGE_SC_ARCH_W / 2, hy: (GORGE_SC_ARCH_Y1 - GORGE_SC_ARCH_Y0) / 2, hz: GORGE_SC_ARCH_D / 2, yaw: 0 },
    { c: new THREE.Vector3(GORGE_SC_X - (GORGE_SC_HALF_W + 20), (GORGE_SC_FLOOR_Y + GORGE_SC_ARCH_Y1) / 2, GORGE_SC_ARCH_Z), hx: 20, hy: (GORGE_SC_ARCH_Y1 - GORGE_SC_FLOOR_Y) / 2, hz: GORGE_SC_ARCH_D / 2, yaw: 0 },
    { c: new THREE.Vector3(GORGE_SC_X + (GORGE_SC_HALF_W + 20), (GORGE_SC_FLOOR_Y + GORGE_SC_ARCH_Y1) / 2, GORGE_SC_ARCH_Z), hx: 20, hy: (GORGE_SC_ARCH_Y1 - GORGE_SC_FLOOR_Y) / 2, hz: GORGE_SC_ARCH_D / 2, yaw: 0 }
  ];

  // --- map switching: reuse terrain geometry and materials, update vertex colors & collision sets.
  const baseBoxes = boxes.slice(), baseCyls = cyls.slice();
  let activeMap = null, currentMode = 'archipelago';
  function rebuild(def) {
    activeMap = def || null;
    const mode = def ? def.heightFn : 'archipelago';
    currentMode = mode;
    FARM_U.uMapMode.value = mode === 'gorge' ? 1 : mode === 'strait' ? 2 : 0;
    oceanMode = mode === 'ocean';
    wantMode = mode;
    if (!oceanMode) applyPack(mode);
    boxes.length = 0; cyls.length = 0;
    if (mode === 'archipelago') {
      for (const b of baseBoxes) boxes.push(b);
      for (const q of baseCyls) cyls.push(q);
    } else if (mode === 'gorge' && def.bbox) {
      const bb = def.bbox, inBB = (x, z) => x > bb.x[0] - 600 && x < bb.x[1] + 600 && z < bb.z[0] + 600 && z > bb.z[1] - 600;
      for (const b of baseBoxes) if (!inBB(b.c.x, b.c.z)) boxes.push(b);
      for (const q of baseCyls) if (!inBB(q.x, q.z)) cyls.push(q);
      for (const b of scBoxes) boxes.push(b);
      for (const b of gorgeBoxes) boxes.push(b);
      for (const q of gorgeCyls) cyls.push(q);
    } else if (mode === 'strait') {
      for (const b of straitBoxes) boxes.push(b);
      for (const q of straitCyls) cyls.push(q);
    }
    scArch.visible = mode === 'gorge';
    lightMat.uniforms.uMapId.value = mode === 'gorge' ? 1 : mode === 'strait' ? 2 : 0;
    const mk = lightMat.uniforms.uMask.value;
    if (mode === 'gorge' && def.bbox) mk.set(def.bbox.x[0] - 600, def.bbox.x[1] + 600, def.bbox.z[1] - 600, def.bbox.z[0] + 600);
    else mk.set(1, -1, 1, -1);
    for (const [ix, iz, r] of (def && def.islands) || []) addCyl(ix, iz, -200, 130, r * 0.85);
    for (const child of props.children) child.visible = !!(def && def.runway);
    return def;
  }

  // Merge static worldProps meshes by (visibility bucket, material) to cut draw calls while preserving map toggling.
  {
    props.updateMatrixWorld(true);
    const dynamic = new Set([...beams, ...radars.map(r => r.g), ...rotors.map(r => r.g), ...flames.map(f => f.s)]);
    const anchors = {
      runway: new THREE.Vector3(RWY.x, E, rwyMidZ),
      baseBldg: new THREE.Vector3(RWY.x, E, 0),
      islandsIn: ANC_IN.clone(),
      islandsOut: new THREE.Vector3(RWY.x + 2000, 0, 0),
      gorge: new THREE.Vector3(GORGE_FORT[0], 20, GORGE_FORT[2]),
      strait: new THREE.Vector3(0, 0, 0)
    };
    const groups = new Map(), m4 = new THREE.Matrix4();
    for (const o of props.children) {
      if (!o.isMesh || o.isInstancedMesh || o.userData.noMerge || dynamic.has(o) || Array.isArray(o.material)) continue;
      if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) continue;
      const bucket = o.userData.propBucket ||
        ((o.geometry.type === 'PlaneGeometry' && Math.abs(o.position.x - RWY.x) < 500 && o.position.y < 40) ? 'runway'
          : (Math.abs(o.position.x - RWY.x) < 600 && o.position.z > RWY.z0 - 600 && o.position.z < RWY.z1 + 600) ? 'baseBldg'
          : inGorgeBBox(o.position.x, o.position.z) ? 'islandsIn' : 'islandsOut');
      let byMat = groups.get(bucket);
      if (!byMat) { byMat = new Map(); groups.set(bucket, byMat); }
      let list = byMat.get(o.material);
      if (!list) { list = []; byMat.set(o.material, list); }
      list.push(o);
    }
    for (const [bucket, byMat] of groups) {
      const anc = anchors[bucket] || anchors.islandsOut;
      for (const [mat2, list] of byMat) {
        if (list.length < 2) continue;
        const geos = [];
        for (const o of list) {
          const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
          if (!g.attributes.normal) g.computeVertexNormals();
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          o.updateMatrix();
          g.applyMatrix4(m4.copy(o.matrix));
          g.translate(-anc.x, -anc.y, -anc.z);
          g.clearGroups();
          geos.push(g);
        }
        const merged = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
        if (!merged) continue;
        merged.computeBoundingSphere();
        for (const o of list) props.remove(o);
        const mm = new THREE.Mesh(merged, mat2);
        mm.position.copy(anc);
        mm.userData.propBucket = bucket;
        props.add(mm);
      }
    }
  }

  // Registry of switchable map props, built once at boot.
  const envProps = { terrain, islands: [], runway: [], baseBldg: [], radar: [], foliage: [trees.mesh], lights: [lightPts], gorge: [], strait: [] };
  for (const o of props.children) {
    if (o.userData.propBucket === 'gorge') envProps.gorge.push(o);
    else if (o.userData.propBucket === 'strait') envProps.strait.push(o);
    else if (radars.some(r => r.g === o && !r.strait)) envProps.radar.push(o);
    else if (o === trees.mesh || o.name === 'forest') envProps.foliage.push(o);
    else if (o.userData.propBucket === 'runway' || (o.geometry && o.geometry.type === 'PlaneGeometry' && Math.abs(o.position.x - RWY.x) < 500 && o.position.y < 40)) envProps.runway.push(o);
    else if (o.userData.propBucket === 'baseBldg' || (Math.abs(o.position.x - RWY.x) < 600 && o.position.z > RWY.z0 - 600 && o.position.z < RWY.z1 + 600)) envProps.baseBldg.push(o);
    else envProps.islands.push(o);
  }

  function setCloudOffset(x, z) { FARM_U.uCloudOff.value.set(x, z); }
  function setAtmosphereFog(sunDir, mieCol, mieK, mistK, cloudK) {
    FARM_U.uSun.value.copy(sunDir);
    FARM_U.uMieCol.value.copy(mieCol);
    FARM_U.uMieK.value = mieK;
    FARM_U.uMistK.value = mistK;
    FARM_U.uCloudShadowK.value = cloudK;
  }

  return {
    terrain, props, heightAt, analyticHeight, straitHeight, gorgeHeight, detailMs, collide, addBox, update, rebuild, envProps,
    prepare, set onPackReady(fn) { onPackReady = fn; }, clipmap, geography: G, terrainUniforms: TERRAIN_U,
    get sampler() { return sampler; }, get packs() { return packs; },
    get terrainStats() {
      const o = { clipmap: clipmap.stats(), active: sampler.pack.map, packs: {} };
      for (const k in packs) if (packs[k]) o.packs[k] = { loadMs: packs[k].loadMs || 0, bytes: packs[k].meta.stats.bytes.total, maxH: packs[k].meta.stats.maxH };
      return o;
    },
    setAtmosphereFog, setCloudOffset,
    get map() { return activeMap; },
    get mode() { return currentMode; },
    forest: trees.mesh, farmEdge: FARM.edge,
    get treeStats() { const { mesh: _m, ...s } = trees; return s; },
    runway: RWY, bridges: bridgeInfo, obstacleCount: () => boxes.length + cyls.length,
    stacks, rigs: RIGS.map(([x, z]) => ({ x, z })), canyonHalf,
    sectors: SECTORS, sectorAt, isTerrainOccluded, fleetLane: FLEET_LANE, canyonCenter: CANYON_C,
    marks: [
      { kind: 'runway', pts: [[RWY.x, RWY.z0], [RWY.x, RWY.z1]] },
      ...bridgeInfo.map(b => ({ kind: 'bridge', pts: [[b.a.x, b.a.z], [b.b.x, b.b.z]] }))
    ],
    landmarks: {
      airbase: new THREE.Vector3(RWY.x, RWY.elev, rwyMidZ),
      canyonEntry: new THREE.Vector3(canyonX(-5600), 0, -5600),
      volcano: new THREE.Vector3(5600, 975, -8300),
      bridgeA: bridgeInfo[0].a.clone().lerp(bridgeInfo[0].b, 0.5),
      bridgeB: bridgeInfo[1].a.clone().lerp(bridgeInfo[1].b, 0.5),
      windFarm: new THREE.Vector3((REEF.a[0] + REEF.b[0]) / 2, 0, (REEF.a[1] + REEF.b[1]) / 2)
    },
    canyonX
  };
}
