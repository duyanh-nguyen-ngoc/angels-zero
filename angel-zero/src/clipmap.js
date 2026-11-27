// ANGELS ZERO — Terrain v2 nested GPU clipmap.
//
// 8 levels of one shared 128 x 128-cell grid (L0 spacing 8 m -> L7 1,024 m, 131 km across).
// Each level's origin snaps to 2 x its spacing, so a level's outer boundary always lies on
// the next coarser level's grid lines. The grid is NON-indexed and every vertex carries its
// triangle's centroid (aCen): a coarser level collapses exactly the triangles that the finer
// level covers (centroid test against the finer level's square), so there are no overlaps,
// no gaps and no L-shaped trim strips. Odd vertices geomorph onto their even neighbours over
// the outer 28 % of each level (CDLOD-style), so boundary edges match the coarser level and
// LOD changes never pop or crack.
//
// Heights: manual 16-bit bilinear decode of an RG8 (hi, lo) texture with texelFetch (no
// float-texture filtering needed), + crag displacement, + horizonHeight() outside the core:
// the exact twin of terrainpack.js createSampler().heightAt (CPU).
// 8 draw calls; ~200k visible triangles; zero allocations in update().

import { CRAG_AMP } from './geography.js?v=s10ter7';
import { CRAG_FADE } from './terrainpack.js?v=s10ter7';

export const CM_LEVELS = 8, CM_M = 128, CM_SPACING0 = 8;

// GLSL twins of geography.js horizonHeight / cragNoise and terrainpack.js heightAt.
export const TERRAIN_HEIGHT_GLSL = `
  uniform sampler2D uHeight; uniform sampler2D uNormalTex; uniform sampler2D uSplat;
  uniform sampler2D uHorizon; uniform vec4 uHCore;
  uniform vec4 uCore;                 // x0, z0, step, n
  uniform vec2 uHRange;               // minH, metres per uint16 step
  uniform float uMapId;               // 0 archipelago, 1 gorge, 2 strait
  uniform vec3 uViewer;               // crag fade centre (camera)
  float hzSS(float x, float a, float b) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  float hzSmax(float a, float b, float k) { return 0.5 * (a + b + sqrt((a - b) * (a - b) + k * k)); }
  float horizonRidge(vec2 p) { return 0.5 + 0.5 * sin(p.x * 0.00041 + sin(p.y * 0.00023) * 2.1) * cos(p.y * 0.00037 - sin(p.x * 0.00019) * 1.7); }
  float alpineProfile(float inland, float r) {
    float sea = -180.0 + 177.5 * hzSS(inland, -1400.0, 0.0);
    float land = 3.0 + 38.0 * hzSS(inland, 30.0, 1200.0) + 170.0 * hzSS(inland, 900.0, 3200.0)
      + 1300.0 * pow(hzSS(inland, 2200.0, 5600.0), 1.1) * (0.55 + 0.45 * r);
    return inland < 0.0 ? sea : land;
  }
  // Twin of geography.horizonDetail: ridged relief beyond the baked core (0 at its edge).
  float horizonDetail(vec2 p, float inland) {
    float hs = 0.5 * (uCore.w - 1.0) * uCore.z;
    vec2 c = uCore.xy + hs;
    float e = max(abs(p.x - c.x), abs(p.y - c.y)) - hs;
    float k = hzSS(e, 0.0, 3000.0) * hzSS(inland, 1800.0, 5200.0);
    float r1 = 1.0 - abs(sin(p.x * 0.0021 + sin(p.y * 0.0013) * 1.9) * sin(p.y * 0.0019 + sin(p.x * 0.0011) * 2.3));
    float r2 = 1.0 - abs(sin(p.x * 0.0053 + sin(p.y * 0.0037) * 1.4) * sin(p.y * 0.0047 - sin(p.x * 0.0029) * 1.7));
    return k * (260.0 * r1 * r1 + 90.0 * r2 * r2 - 150.0);
  }
  float horizonHeight(vec2 p) {
    float r = horizonRidge(p);
    float inland = uMapId > 1.5 ? abs(p.x) - 5600.0 : hzSmax(-12900.0 - p.y, p.x - 11900.0, 1500.0);
    return alpineProfile(inland, r) + horizonDetail(p, inland);
  }
  float cragNoise(vec2 p) {
    float r1 = 1.0 - abs(sin(p.x * 0.145 + p.y * 0.085) * sin(p.y * 0.145 - p.x * 0.085));
    float r2 = 1.0 - abs(sin(p.x * 0.27 - p.y * 0.19) * sin(p.y * 0.27 + p.x * 0.19));
    return (r1 * r1 * 0.65 + r2 * r2 * 0.35) * 2.0 - 1.0;
  }
  float decodeQ(ivec2 t) { vec2 rg = texelFetch(uHeight, t, 0).rg; return floor(rg.r * 255.0 + 0.5) * 256.0 + floor(rg.g * 255.0 + 0.5); }
  float decodeHzQ(ivec2 t) { vec2 rg = texelFetch(uHorizon, t, 0).rg; return floor(rg.r * 255.0 + 0.5) * 256.0 + floor(rg.g * 255.0 + 0.5); }
  bool inCoreF(vec2 f) { return f.x >= 0.0 && f.y >= 0.0 && f.x <= uCore.w - 1.0 && f.y <= uCore.w - 1.0; }
  float horizonSample(vec2 p) {
    if (uHCore.w < 2.0) return horizonHeight(p);
    vec2 f = (p - uHCore.xy) / uHCore.z;
    if (f.x < 0.0 || f.y < 0.0 || f.x > uHCore.w - 1.0 || f.y > uHCore.w - 1.0) return horizonHeight(p);
    vec2 i0 = floor(f), t = f - i0;
    int nm = int(uHCore.w) - 1;
    ivec2 a = clamp(ivec2(i0), ivec2(0), ivec2(nm)), b = clamp(ivec2(i0) + 1, ivec2(0), ivec2(nm));
    float q00 = decodeHzQ(a), q10 = decodeHzQ(ivec2(b.x, a.y)), q01 = decodeHzQ(ivec2(a.x, b.y)), q11 = decodeHzQ(b);
    return uHRange.x + ((q00 + (q10 - q00) * t.x) * (1.0 - t.y) + (q01 + (q11 - q01) * t.x) * t.y) * uHRange.y;
  }
  float coreBaseHeight(vec2 f) {
    vec2 i0 = floor(f), t = f - i0;
    int nm = int(uCore.w) - 1;
    ivec2 a = clamp(ivec2(i0), ivec2(0), ivec2(nm)), b = clamp(ivec2(i0) + 1, ivec2(0), ivec2(nm));
    float q00 = decodeQ(a), q10 = decodeQ(ivec2(b.x, a.y)), q01 = decodeQ(ivec2(a.x, b.y)), q11 = decodeQ(b);
    return uHRange.x + ((q00 + (q10 - q00) * t.x) * (1.0 - t.y) + (q01 + (q11 - q01) * t.x) * t.y) * uHRange.y;
  }
  vec3 coreNormal(vec2 f) {
    vec2 n = textureLod(uNormalTex, (f + 0.5) / uCore.w, 0.0).rg * 2.0 - 1.0;
    return vec3(n.x, sqrt(max(0.0, 1.0 - dot(n, n))), n.y);
  }
  float coreLandUse(vec2 f) { return textureLod(uSplat, (f * 0.5 + 0.5) / (uCore.w * 0.5), 0.0).a; }
  // Full twin of the CPU heightAt (crag faded ${CRAG_FADE[0]}-${CRAG_FADE[1]} m from uViewer).
  float terrainHeight(vec2 p) {
    vec2 f = (p - uCore.xy) / uCore.z;
    float h = 0.0;
    if (!inCoreF(f)) { h = horizonSample(p); }
    else {
    h = coreBaseHeight(f);
    float fade = 1.0 - hzSS(length(p - uViewer.xz), ${CRAG_FADE[0].toFixed(1)}, ${CRAG_FADE[1].toFixed(1)});
    if (fade > 0.0) {
      float slope = 1.0 - coreNormal(f).y;
      float g = hzSS(slope, 0.35, 0.6) * (1.0 - hzSS(coreLandUse(f), 0.88, 0.98));
      h += ${CRAG_AMP.toFixed(2)} * cragNoise(p) * g * fade;
    }
    }
    return h;
  }`;

// Vertex-stage replacement for MeshStandardMaterial (beginnormal / begin_vertex).
export const CM_VERTEX_PARS = `
  ${TERRAIN_HEIGHT_GLSL}
  uniform float uSpacing; uniform vec2 uOrigin; uniform vec2 uFine; uniform float uFineHalf;
  attribute vec2 aCen;
  varying vec3 vWPos; varying vec3 vHN;`;
export const CM_VERTEX_BODY = `
  vec2 cmG = position.xz;
  vec2 cmXZ = uOrigin + cmG * uSpacing;
  vec2 cmC = uOrigin + aCen * uSpacing;
  bool cmCovered = uFineHalf > 0.0 && abs(cmC.x - uFine.x) < uFineHalf && abs(cmC.y - uFine.y) < uFineHalf;
  float cmMorph = smoothstep(0.72, 0.96, max(abs(cmXZ.x - uViewer.x), abs(cmXZ.y - uViewer.z)) / (${(CM_M / 2).toFixed(1)} * uSpacing));
  cmXZ -= fract(cmG * 0.5) * 2.0 * uSpacing * cmMorph;
  float cmH = terrainHeight(cmXZ);
  // Horizon normal (only used outside the baked core; inside, the fragment stage reads uNormalTex).
  float cmE = max(uSpacing, 60.0);
  vHN = normalize(vec3(horizonSample(cmXZ - vec2(cmE, 0.0)) - horizonSample(cmXZ + vec2(cmE, 0.0)), 2.0 * cmE,
                       horizonSample(cmXZ - vec2(0.0, cmE)) - horizonSample(cmXZ + vec2(0.0, cmE))));
  vec3 cmPos = cmCovered ? vec3(0.0, -99999.0, 0.0) : vec3(cmXZ.x, cmH, cmXZ.y);
  vWPos = cmPos;
  vec3 objectNormal = vec3(0.0, 1.0, 0.0);`;

// One shared non-indexed grid: position.xz = integer grid coords (-64..64), aCen = centroid.
export function buildClipmapGeometry(THREE) {
  const M = CM_M, H = M / 2, tris = M * M * 2;
  const pos = new Float32Array(tris * 9), cen = new Float32Array(tris * 6);
  let p = 0, c = 0;
  const push = (ax, az, bx, bz, cx, cz) => {
    const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3;
    pos[p++] = ax; pos[p++] = 0; pos[p++] = az; pos[p++] = bx; pos[p++] = 0; pos[p++] = bz; pos[p++] = cx; pos[p++] = 0; pos[p++] = cz;
    for (let k = 0; k < 3; k++) { cen[c++] = mx; cen[c++] = mz; }
  };
  for (let j = -H; j < H; j++) for (let i = -H; i < H; i++) {
    // Alternate the cell diagonal per quadrant (symmetric tessellation around the centre).
    if ((i < 0) === (j < 0)) { push(i, j, i, j + 1, i + 1, j + 1); push(i, j, i + 1, j + 1, i + 1, j); }
    else { push(i, j, i, j + 1, i + 1, j); push(i + 1, j, i, j + 1, i + 1, j + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCen', new THREE.BufferAttribute(cen, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  return g;
}

// Builds the 8 level meshes. makeMaterial(levelUniforms) must return a material whose
// onBeforeCompile merges levelUniforms + the shared terrain uniforms into the shader.
export function createClipmap(THREE, { scene, makeMaterial }) {
  const geo = buildClipmapGeometry(THREE);
  const levels = [];
  for (let L = 0; L < CM_LEVELS; L++) {
    const s = CM_SPACING0 * Math.pow(2, L);
    const u = {
      uSpacing: { value: s }, uOrigin: { value: new THREE.Vector2() },
      uFine: { value: new THREE.Vector2() }, uFineHalf: { value: L === 0 ? 0 : (CM_M / 2) * (s / 2) }
    };
    const mesh = new THREE.Mesh(geo, makeMaterial(u, L));
    mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.receiveShadow = false; mesh.castShadow = false;
    mesh.name = 'clipmapL' + L; mesh.renderOrder = -10 + L;
    scene.add(mesh);
    levels.push({ L, s, u, mesh });
  }
  const group = { visible: true };
  function setVisible(v) { group.visible = v; for (const l of levels) l.mesh.visible = v; }
  // Snap every level around the camera (zero allocations).
  function update(camX, camZ) {
    for (let L = 0; L < CM_LEVELS; L++) {
      const lv = levels[L], s2 = lv.s * 2;
      lv.u.uOrigin.value.set(Math.round(camX / s2) * s2, Math.round(camZ / s2) * s2);
      if (L > 0) lv.u.uFine.value.copy(levels[L - 1].u.uOrigin.value);
    }
  }
  const stats = () => ({ levels: CM_LEVELS, trisPerLevel: CM_M * CM_M * 2, drawCalls: CM_LEVELS, spacing0: CM_SPACING0, extentKm: +(CM_M * CM_SPACING0 * Math.pow(2, CM_LEVELS - 1) / 1000).toFixed(1) });
  return { levels, geometry: geo, update, setVisible, get visible() { return group.visible; }, stats };
}
