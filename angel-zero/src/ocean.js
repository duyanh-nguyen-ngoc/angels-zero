// ANGELS ZERO — ultra-realistic open ocean (v1.2.9, after the Pirate Ship Sunset water).
//
// A flat 116 km camera-following plane (ships, carrier and decks stay at y = 0) shaded
// entirely per pixel:
//   * 8-wave deep-water Gerstner spectrum (L 78 -> 3.1 m, x0.63 per step, headings
//     0,+23,-17,+38,-31,+12,-49,+64 deg off the wind, sum Q <= 0.95) with analytic dP/dx,
//     dP/dz normals and a per-wave pixel-footprint fade
//     (fade = 1 - smoothstep(0.18 L, 0.5 L, 2 (fwidth(x) + fwidth(z)))) so the far sea never
//     boils. Phases are wrapped to [0, 2pi) on the CPU in float64, relative to the 1 km
//     snap origin, so the float32 sin() argument stays small for hours.
//   * Baked 512^2 detail tile (RG micro-normal 19 m + 7.3 m rotated, B Worley foam lattice,
//     A fbm); far field keeps the broad swells + mid normal octaves.
//   * Clamped reflection vector (R.y = |R.y| + 0.002), half-res planar reflection of the
//     coast, islands, ships and carrier (layer REFLECT_LAYER, clipped at y > -0.05, reusing
//     the frame's shadow map), Fresnel over the existing sky gradient.
//   * Sunlit subsurface crest glow, multi-lobe HDR sun glitter for the bloom pass,
//     Jacobian-thresholded lacy Worley foam (gone by 1.6 km), analytic 19.3 deg Kelvin wakes
//     behind the carrier and escorts (diverging arms, stern wash, calm slick, wave height).
//   * Kept contracts: Beer-Lambert coastal depth tint + surf from uDepth, uCloudOff cloud
//     shadows, directional Mie aerial perspective, time-of-day uLevel / uGlitter, weather
//     uChop / ambient uSwell + uScroll.
// Zero per-frame allocations: every scratch object and uniform lives in this closure.

export const REFLECT_LAYER = 3;

const TAU = Math.PI * 2;
// [wavelength m, amplitude m, heading deg off the wind, steepness Q]   (sum Q = 0.77)
const WAVE_SPECTRUM = [
  [78, 0.8, 0, 0.17], [47, 0.52, 23, 0.15], [31, 0.3, -17, 0.13], [19, 0.18, 38, 0.11],
  [12.3, 0.105, -31, 0.08], [7.7, 0.06, 12, 0.06], [4.9, 0.034, -49, 0.04], [3.1, 0.02, 64, 0.03]
];
const SUM_Q = WAVE_SPECTRUM.reduce((s, w) => s + w[3], 0);
const MAX_SHIPS = 8;

export function createOcean(THREE, env) {
  const { scene, camera, renderer, createNoise2D, fbm, buildDepthTexture,
    terrainCenter, terrainSize, sunDir, fogColor, fogDensity } = env;
  function makeNormalMap(size, seed, scale) {
    const noise = createNoise2D(seed);
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(noise, (x / size) * scale, (y / size) * scale, 4);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
      const nx = (l - r) * 2.2, ny = (d - u) * 2.2, inv = 1 / Math.hypot(nx, ny, 1);
      const k = (y * size + x) * 4;
      img.data[k] = (nx * inv * 0.5 + 0.5) * 255; img.data[k + 1] = (ny * inv * 0.5 + 0.5) * 255;
      img.data[k + 2] = (inv * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;                    // data (normals), not colour
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    return tex;
  }

  // ---- baked detail tile: RG micro-normal, B foam lattice, A fbm (tileable, mipmapped) ----
  function bakeDetail(size) {
    const target = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.NoColorSpace
    });
    target.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        varying vec2 vUv;
        float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
        float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
        float vnoiseP(vec2 p, vec2 per){
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
          return mix(mix(hash21(i0), hash21(vec2(i1.x, i0.y)), u.x), mix(hash21(vec2(i0.x, i1.y)), hash21(i1), u.x), u.y);
        }
        float fbmP(vec2 p, vec2 per){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoiseP(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s / 0.97; }
        float worley(vec2 p, float per){
          vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
            vec2 g = vec2(x, y); vec2 o = hash22(mod(i + g, per)); vec2 r = g + o - f; float d = dot(r, r);
            if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
          return sqrt(d2) - sqrt(d1);
        }
        void main(){
          vec2 uv = vUv; vec2 g = vec2(0.0);
          for (int i = 0; i < 48; i++){
            float fi = float(i); vec2 h = hash22(vec2(fi * 1.37, 7.1));
            float ang = h.x * 6.2831; float kmag = floor(3.0 + pow(h.y, 1.6) * 44.0);
            vec2 k = floor(vec2(cos(ang), sin(ang)) * kmag + 0.5);
            if (dot(k, k) < 1.0) k = vec2(3.0, 1.0);
            float amp = 1.0 / pow(length(k), 1.35); float ph = hash11(fi * 9.7) * 6.2831;
            g += k * amp * cos(dot(k, uv) * 6.2831 + ph);
          }
          g *= 0.9; vec3 n = normalize(vec3(-g * 0.22, 1.0));
          vec2 warp = vec2(fbmP(uv * 4.0, vec2(4.0)), fbmP(uv * 4.0 + 0.37, vec2(4.0))) - 0.5;
          vec2 wu = uv + warp * 0.09;
          float w1 = worley(wu * 9.0, 9.0), w2 = worley(wu * 21.0 + 3.0, 21.0), w3 = worley(uv * 47.0 + 7.0, 47.0);
          float lace = (1.0 - smoothstep(0.0, 0.2, w1)) * (0.6 + 0.4 * vnoiseP(uv * 36.0, vec2(36.0)));
          lace = max(lace, (1.0 - smoothstep(0.0, 0.24, w2)) * 0.7);
          float bubbles = smoothstep(0.35, 0.5, w3) * 0.35;
          float body = fbmP(wu * 7.0, vec2(7.0));
          float foam = clamp(lace * 0.75 + body * 0.75 - 0.12 + bubbles * (1.0 - lace), 0.0, 1.0);
          gl_FragColor = vec4(n.xy * 0.5 + 0.5, foam, fbmP(uv * 5.0 + 11.0, vec2(5.0)));
        }`,
      depthTest: false, depthWrite: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    const sc = new THREE.Scene(); sc.add(quad);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    renderer.setRenderTarget(prev);
    mat.dispose(); quad.geometry.dispose();
    return target.texture;
  }

  // ---- wave spectrum (CPU side: float64 wrapped phases) ----
  const WIND = 1.05;                                         // wind heading (rad), roughly along the swell
  const waves = WAVE_SPECTRUM.map(([L, A, deg, Q], i) => {
    const k = TAU / L, hd = WIND + deg * Math.PI / 180;
    return { L, A, Q, k, omega: Math.sqrt(9.81 * k), dx: Math.sin(hd), dz: Math.cos(hd), QA: Q / k, seed: (i * 2.39) % TAU };
  });
  const waveDir = waves.map(w => new THREE.Vector4(w.dx, w.dz, w.k, w.A));
  const waveQ = waves.map(w => new THREE.Vector4(w.QA, w.L, 0, 0));
  const wavePhase = new Float32Array(waves.length);
  const shipA = [], shipB = [];
  for (let i = 0; i < MAX_SHIPS; i++) { shipA.push(new THREE.Vector4()); shipB.push(new THREE.Vector4()); }

  // Camera-following ocean: a 116 km plane re-centred on the camera in 1 km snaps; all
  // shading is in world XZ (waves relative to the snap origin with CPU phase offsets), so
  // nothing swims when it snaps. It dissolves radially into the shared fog / sky horizon.
  const OCEAN_SPAN = 116000, OCEAN_SNAP = 1000;
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  const oceanUniforms = {
    uTime: { value: 0 },
    uN1: { value: makeNormalMap(256, 1337, 6.0) },
    uN2: { value: makeNormalMap(256, 90210, 13.0) },
    uDetail: { value: renderer ? bakeDetail(512) : null },
    uDepth: { value: buildDepthTexture() },          // size owned by index.html (DEPTH_N over the 40 km core)
    uDeep: { value: new THREE.Color(0x0d2133) },       // abyssal sapphire-navy
    uShallow: { value: new THREE.Color(0x168a84) },    // luminous turquoise-emerald over coastal shelves
    uTerr: { value: new THREE.Vector3(terrainCenter.x, terrainCenter.y, terrainSize) },
    uSun: { value: sunDir },
    uSunColor: { value: new THREE.Vector3(1.0, 0.88, 0.70) },
    uSky: { value: new THREE.Vector3(0.30, 0.44, 0.62) },
    uFog: { value: fogColor },                 // same Color object as the fog and sky horizon
    uFogD: { value: fogDensity },
    uFade: { value: new THREE.Vector2(30000, 52000) },  // radial dissolve into the horizon colour
    uCam: { value: new THREE.Vector3() },
    uLevel: { value: 1 },                              // time-of-day water / foam brightness
    uGlitter: { value: 1 },                            // sun / moon glitter-path width & strength
    uChop: { value: 0 },                               // weather: wind-chopped sea + whitecaps 0..1
    uSwell: { value: 1 },                              // ambient: calm -> storm swell amplitude
    uScroll: { value: new THREE.Vector2() },           // ambient: wind-driven normal-octave scroll
    uMieCol: { value: new THREE.Vector3(1.0, 0.84, 0.62) },
    uMieK: { value: 0.95 },
    uCloudOff: { value: new THREE.Vector2() },
    uCloudShadowK: { value: 1.0 },
    // v1.2.9 ultra water
    uWaveDir: { value: waveDir }, uWaveQ: { value: waveQ }, uWavePhase: { value: wavePhase },
    uAmp: { value: 1 }, uSteep: { value: 1 },
    uOrigin: { value: new THREE.Vector2() },
    uDetOffA: { value: new THREE.Vector2() }, uDetOffB: { value: new THREE.Vector2() },
    uFoamOff: { value: new THREE.Vector2() }, uFoamOff2: { value: new THREE.Vector2() },
    uRefl: { value: null }, uReflMat: { value: new THREE.Matrix4() }, uReflOn: { value: 0 },
    uShipA: { value: shipA }, uShipB: { value: shipB }, uShipN: { value: 0 },
    uJetPos: { value: new THREE.Vector4(0, 0, 0, 0) },
    uJetDir: { value: new THREE.Vector4(0, -1, 0, 0) }
  };
  void aniso;
  const NW = waves.length;
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(OCEAN_SPAN, OCEAN_SPAN, 1, 1), new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldPos;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPos = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      #define NW ${NW}
      #define MAXS ${MAX_SHIPS}
      varying vec3 vWorldPos;
      uniform float uTime; uniform sampler2D uN1; uniform sampler2D uN2; uniform sampler2D uDepth; uniform sampler2D uDetail;
      uniform vec3 uTerr; uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uSky;
      uniform vec3 uFog; uniform float uFogD; uniform vec2 uFade; uniform vec3 uCam;
      uniform float uLevel; uniform float uGlitter; uniform float uChop;
      uniform float uSwell; uniform vec2 uScroll;
      uniform vec3 uDeep; uniform vec3 uShallow;
      uniform vec3 uMieCol; uniform float uMieK; uniform vec2 uCloudOff; uniform float uCloudShadowK;
      uniform vec4 uWaveDir[NW]; uniform vec4 uWaveQ[NW]; uniform float uWavePhase[NW];
      uniform float uAmp, uSteep; uniform vec2 uOrigin;
      uniform vec2 uDetOffA, uDetOffB, uFoamOff, uFoamOff2;
      uniform sampler2D uRefl; uniform mat4 uReflMat; uniform float uReflOn;
      uniform vec4 uShipA[MAXS]; uniform vec4 uShipB[MAXS]; uniform int uShipN;
      uniform vec4 uJetPos; uniform vec4 uJetDir;

      // Gerstner sum with analytic partial derivatives; each wave fades at its own footprint.
      void gerstner(vec2 q, float foot, out vec3 dPdx, out vec3 dPdz, out float hgt) {
        dPdx = vec3(1.0, 0.0, 0.0); dPdz = vec3(0.0, 0.0, 1.0); hgt = 0.0;
        for (int i = 0; i < NW; i++) {
          vec4 w = uWaveDir[i]; float L = uWaveQ[i].y;
          float fade = 1.0 - smoothstep(L * 0.18, L * 0.5, foot);
          if (fade <= 0.0) continue;
          float A = w.w * fade * uAmp, QA = uWaveQ[i].x * fade * uSteep;
          float th = w.z * dot(w.xy, q) + uWavePhase[i];
          float s = sin(th), c = cos(th);
          hgt += A * s;
          float kA = w.z * A, kQA = w.z * QA;
          dPdx.x -= kQA * w.x * w.x * s; dPdx.y += kA * w.x * c; dPdx.z -= kQA * w.x * w.y * s;
          dPdz.x -= kQA * w.x * w.y * s; dPdz.y += kA * w.y * c; dPdz.z -= kQA * w.y * w.y * s;
        }
      }
      // Long swell (height-only, absolute world coords: continuous across snaps) folded into the derivatives.
      void swell(vec2 q, vec2 d, float lambda, float amp, float t, float foot, inout vec3 dPdx, inout vec3 dPdz, inout float hgt) {
        float k = 6.2831853 / lambda;
        float a = amp * (1.0 - smoothstep(lambda * 0.18, lambda * 0.5, foot));
        float th = k * dot(d, q) - sqrt(9.81 * k) * t;
        hgt += a * sin(th);
        float kc = k * a * cos(th);
        dPdx.y += kc * d.x; dPdz.y += kc * d.y;
      }
      // Analytic Kelvin wake (ship-length-normalised units; 34 m reference hull):
      // R diverging arms (19.3 deg), G stern wash, B calm slick, A Kelvin wave height.
      vec4 kelvin(vec2 p, vec4 A, vec4 B) {
        vec2 rel = p - A.xy;
        float sc = max(1.0, B.x / 34.0);
        float a = (B.x * 0.5 - dot(rel, A.zw)) / sc;
        float d = abs(rel.x * A.w - rel.y * A.z) / sc;
        if (a < -8.0 || a > 380.0 || d > a * 0.42 + 14.0) return vec4(0.0);
        float as_ = a - 34.0;
        float armX = 1.2 + a * 0.35, w = 1.1 + a * 0.03;
        float q1 = (d - armX) / w;
        float arm = exp(-q1 * q1) * exp(-a / 115.0) * smoothstep(0.0, 5.0, a);
        float q2 = (d - (3.0 + max(as_, 0.0) * 0.3)) / (1.0 + max(as_, 0.0) * 0.03);
        float armS = exp(-q2 * q2) * exp(-max(as_, 0.0) / 80.0) * smoothstep(-2.0, 6.0, as_) * 0.6;
        float ww = 2.6 + max(as_, 0.0) * 0.055;
        float wash = exp(-(d / ww) * (d / ww)) * exp(-max(as_, 0.0) / 170.0) * smoothstep(-7.0, -1.0, as_);
        wash *= 0.88 + 0.12 * sin(as_ * 0.23);
        float q3 = d / (ww * 1.6 + 2.0);
        float slick = exp(-q3 * q3) * exp(-max(as_, 0.0) / 260.0) * smoothstep(-6.0, 1.0, as_);
        float inWedge = smoothstep(armX + w * 2.0, armX - w, d) * smoothstep(0.0, 10.0, a);
        float kh = sin((a * 0.5 - d * 0.9) * 1.1) * inWedge * exp(-a / 90.0) * 0.35;
        kh += sin((a - d * 1.6) * 0.9) * arm * 0.4;
        return vec4(max(arm, armS), wash, slick, kh) * smoothstep(0.8, 6.0, B.y);
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = vWorldPos.xz;
        vec2 q = p - uOrigin;                                          // small coordinates for sin()
        float dist = length(uCam - vWorldPos);
        float tw = uTime * (1.0 + 0.9 * uChop);
        vec2 fw2 = fwidth(p);
        float foot = 2.0 * max(fw2.x + fw2.y, 1e-3);                   // pixel footprint (m)
        vec3 dPdx, dPdz; float hgt;
        gerstner(q, foot, dPdx, dPdz, hgt);
        float sw = (1.0 + 0.8 * uChop) * uSwell;
        swell(p, normalize(vec2(0.83, 0.56)), 210.0, 0.55 * sw * (1.0 - smoothstep(9000.0, 26000.0, dist)), tw, foot, dPdx, dPdz, hgt);
        swell(p, normalize(vec2(0.38, 0.92)), 118.0, 0.32 * sw * (1.0 - smoothstep(4000.0, 12000.0, dist)), tw, foot, dPdx, dPdz, hgt);
        vec3 Ng = normalize(cross(dPdz, dPdx));
        float J = dPdx.x * dPdz.z - dPdx.z * dPdz.x;                    // Jacobian: < 1 where crests bunch

        // Kelvin wakes (carrier + escorts): mask + wave-height gradient for the normal.
        vec4 wk = vec4(0.0); vec2 kg = vec2(0.0);
        if (dist < 7000.0) {
          for (int i = 0; i < MAXS; i++) {
            if (i >= uShipN) break;
            vec4 w0 = kelvin(p, uShipA[i], uShipB[i]);
            if (w0.r + w0.g + w0.b + abs(w0.a) <= 0.0) continue;
            float e = max(1.0, uShipB[i].x / 34.0) * 0.6;
            kg += vec2(kelvin(p + vec2(e, 0.0), uShipA[i], uShipB[i]).a - w0.a, kelvin(p + vec2(0.0, e), uShipA[i], uShipB[i]).a - w0.a) / 0.6;
            wk = max(wk, vec4(w0.rgb, 0.0)); wk.a += w0.a;
          }
          float wf = 1.0 - smoothstep(3500.0, 7000.0, dist);
          wk *= wf; kg *= wf;
        }
        // Low-altitude jet-wash disturbance: V-wake, exhaust foam trench & surface shock ripples.
        if (uJetPos.z > 0.01 && dist < 1800.0) {
          vec2 jr = p - uJetPos.xy;
          float ja = -dot(jr, uJetDir.xy);
          float jd = abs(jr.x * uJetDir.y - jr.y * uJetDir.x);
          if (ja > -12.0 && ja < 280.0 && jd < 24.0 + max(0.0, ja) * 0.42) {
            float jk = uJetPos.z * (1.0 + 0.35 * uJetPos.w) * exp(-max(0.0, ja) / 115.0) * smoothstep(-10.0, 6.0, ja);
            float armX = 5.0 + max(0.0, ja) * 0.24, armW = 3.0 + max(0.0, ja) * 0.045;
            float jArm = exp(-pow((jd - armX) / armW, 2.0));
            float jWash = exp(-pow(jd / (4.8 + max(0.0, ja) * 0.065), 2.0));
            float jRip = sin(ja * 0.48 - jd * 0.95 - uTime * 15.0) * (jArm * 0.7 + jWash * 0.5) * jk;
            wk.r = max(wk.r, jArm * jk * 0.9);
            wk.g = max(wk.g, jWash * jk * 0.95);
            kg += uJetDir.xy * (jRip * 0.35);
          }
        }

        // Normal detail: mid / far octaves (unchanged look from altitude) + baked micro tile.
        float nearK = 1.0 - smoothstep(350.0, 4000.0, dist);
        float midK = 1.0 - smoothstep(2500.0, 22000.0, dist);
        vec3 nB = texture2D(uN1, p * 0.00031 + vec2(tw * 0.0011, -tw * 0.0008)).rgb * 2.0 - 1.0;
        vec3 n1 = vec3(0.0); vec3 n2 = vec3(0.0);
        if (midK > 0.001) {
          n1 = texture2D(uN1, p * 0.0016 + uScroll + vec2(tw * 0.006, tw * 0.008)).rgb * 2.0 - 1.0;
          n2 = texture2D(uN2, p * 0.0043 - uScroll * 0.65 + vec2(-tw * 0.011, tw * 0.007)).rgb * 2.0 - 1.0;
        }
        vec2 dA = texture2D(uDetail, q / 19.0 + uDetOffA).xy * 2.0 - 1.0;
        vec2 dB = texture2D(uDetail, vec2(q.y, -q.x) / 7.3 + uDetOffB).xy * 2.0 - 1.0;
        float dStr = (0.4 * exp(-dist / 500.0) + 0.08) * (1.0 + 0.8 * uChop) * (1.0 - 0.6 * wk.b);
        vec2 dn = (dA * 0.65 + vec2(-dB.y, dB.x) * 0.45) * dStr;
        float rough = 1.0 + 1.5 * uChop;
        vec2 slope = nB.xy * 0.055 + (n1.xy + n2.xy) * 0.085 * midK * rough * (0.55 + 0.45 * (1.0 - nearK));
        vec3 N = normalize(Ng + vec3(-slope.x + dn.x - kg.x * 0.9, 0.0, -slope.y + dn.y - kg.y * 0.9));
        vec3 V = normalize(uCam - vWorldPos);
        vec3 L = normalize(uSun);
        float NdV = max(dot(N, V), 0.0), NdL = max(dot(N, L), 0.0);

        // Water depth + coastal coral/shoal mask under this fragment, from the active theatre height grid.
        vec2 tuv = (p - uTerr.xy) / uTerr.z + 0.5;
        float dm = 200.0;
        float shoalMask = 0.0;
        if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
          vec4 dTex = texture2D(uDepth, tuv);
          dm = dTex.r * 60.0;
          shoalMask = dTex.g;
        }

        // Body colour: deep sapphire + sunlit subsurface glow through the thin wave crests,
        // Beer-Lambert coastal shelves, sandy seabed and surf (unchanged contracts).
        vec2 cUv = (p - uCloudOff) * 0.000244140625;
        float cRaw = texture2D(uN1, cUv).r * 0.62 + texture2D(uN2, cUv * 2.0 + vec2(0.37, 0.61)).r * 0.38;
        float cMask = smoothstep(0.22, 0.78, cRaw);
        float cShad = mix(1.0, mix(0.84, 1.0, cMask), uCloudShadowK * (1.0 - smoothstep(14000.0, 36000.0, dist)));
        vec3 deepC = uDeep * (0.84 + 0.34 * NdV) * cShad;
        vec2 lh = normalize(L.xz + vec2(1e-5));
        float toward = pow(max(dot(-V.xz / max(length(V.xz), 1e-4), lh), 0.0), 2.0);
        float hk = smoothstep(-0.6, 1.0, hgt);
        float face = clamp(1.0 - Ng.y, 0.0, 1.0);
        float sssK = (0.25 + 0.75 * toward) * hk * (0.35 + face * 4.0) * step(0.0, L.y);
        deepC += vec3(0.035, 0.30, 0.27) * sssK * (0.4 + 0.6 * NdL + toward * 0.6) * 0.32 * cShad;
        deepC += vec3(0.035, 0.30, 0.27) * 0.06 * wk.g;                 // aerated wake water is lighter
        float shelfK = exp(-dm * 0.058) * (1.0 - smoothstep(34.0, 56.0, dm));
        float shoalTurq = exp(-dm * 0.145) * clamp(0.45 + 0.75 * shoalMask, 0.0, 1.0);
        float seabedVis = exp(-dm * 0.34) * (1.0 - smoothstep(6.0, 12.0, dm));
        vec3 turquoiseC = mix(uShallow, vec3(0.08, 0.58, 0.56), clamp(shoalMask * 0.72 + n2.y * 0.14, 0.0, 1.0));
        float caustic = 0.88 + 0.24 * smoothstep(0.12, 0.86, dA.x * 0.55 + n2.y * 0.45 + 0.5) * nearK;
        vec3 sandyBed = vec3(0.50, 0.45, 0.31) * (0.90 + 0.18 * n2.x) * caustic;
        vec3 body = mix(deepC, turquoiseC * (0.86 + 0.18 * n2.x) * cShad, clamp(shelfK * 0.92, 0.0, 0.94));
        body = mix(body, vec3(0.10, 0.66, 0.62) * cShad * caustic, clamp(shoalTurq * 0.68, 0.0, 0.72));
        body = mix(body, sandyBed * cShad, clamp(seabedVis * 0.76, 0.0, 0.78));
        float shore = 1.0 - smoothstep(0.0, 6.0, dm);
        float foamPatch = smoothstep(-0.35, 0.45, n1.y * 0.6 + n2.x * 0.5);
        float bands = 0.5 + 0.5 * sin(dm * 2.35 + uTime * 1.7 + dA.x * 3.1 + n1.y * 2.2);
        float surf = shore * smoothstep(0.42, 0.92, bands) * (0.45 + 0.55 * foamPatch) + (1.0 - smoothstep(0.0, 1.35, dm)) * 0.95;
        surf *= 0.74 + 0.26 * sin(uTime * 0.95 + (p.x + p.y) * 0.004);
        float caps = (0.12 + 0.88 * uChop) * smoothstep(0.80 - 0.06 * uChop, 1.06, n2.x * 0.5 + 0.5 + n1.x * 0.36) * (1.0 - shore) * 0.34 * midK * (1.0 - nearK * 0.6);
        body = (body + vec3(0.76, 0.81, 0.84) * surf * 0.56 + vec3(0.74, 0.78, 0.82) * caps) * uLevel;

        // Reflection: clamped above the horizon (no grey smears on wave backs), sky gradient
        // plus the half-res planar reflection of coast, islands, ships and the carrier.
        vec3 R = reflect(-V, N);
        R.y = abs(R.y) + 0.002;
        vec3 refl = mix(uFog, uSky, smoothstep(-0.08, 0.58, R.y));
        float reflAlpha = 0.0;
        if (uReflOn > 0.5) {
          vec4 rc = uReflMat * vec4(p.x, 0.0, p.y, 1.0);
          if (rc.w > 0.0) {
            vec2 ruv = rc.xy / rc.w + N.xz * vec2(0.06, 0.03) * clamp(30.0 / dist, 0.2, 1.0);
            if (ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) {
              vec4 rt = texture2D(uRefl, ruv);
              reflAlpha = clamp(rt.a, 0.0, 1.0);
              refl = mix(refl, rt.rgb, reflAlpha * 0.92);
            }
          }
        }
        float fres = (0.06 + 0.94 * pow(1.0 - NdV, 4.2)) * (1.0 - 0.34 * clamp(shoalTurq + seabedVis * 0.5, 0.0, 1.0));
        float nearObjRefl = reflAlpha * smoothstep(140.0, 25.0, dist) * 0.26;
        float reflMix = clamp(fres + nearObjRefl, 0.0, mix(0.68, 0.92, smoothstep(1500.0, 12000.0, dist)));
        vec3 col = mix(body, refl * 0.96, reflMix);

        // HDR sun glitter: broad sheen + multi-scale twinkling diamond sparkles for the bloom pass.
        float rl = max(dot(R, L), 0.0);
        float widen = smoothstep(800.0, 16000.0, dist);
        float sheen = pow(rl, mix(90.0, 30.0, widen)) * 1.2 + pow(rl, 12.0) * 0.06;
        float sp = pow(rl, 1400.0) * 22.0 * (1.0 - widen);
        vec2 spA = texture2D(uDetail, q / 4.1 + uDetOffB * 2.3).xy * 2.0 - 1.0;
        vec2 spB = texture2D(uDetail, vec2(q.y, -q.x) / 2.4 - uDetOffA * 3.1).xy * 2.0 - 1.0;
        vec3 Ns = normalize(N + vec3((spA.x - spB.y) * 0.28, 0.0, (spA.y + spB.x) * 0.28) * (1.0 - widen));
        float rls = max(dot(reflect(-V, Ns), L), 0.0);
        float diamond = (pow(rls, 380.0) * 6.5 + smoothstep(0.982, 0.998, rls) * 26.0) * (1.0 - smoothstep(450.0, 9500.0, dist)) * (0.65 + 0.55 * hk);
        float sunShadowK = mix(0.35, 1.0, mix(1.0, cMask, uCloudShadowK));
        vec3 spec = uSunColor * (sheen * 0.55 + sp + diamond) * sunShadowK * clamp(uGlitter, 0.0, 1.3) * step(0.0, L.y) * mix(1.0, 0.45, wk.g);

        // Foam: Jacobian crest mask thresholding the Worley lattice so it stays lacy.
        float crestFoam = smoothstep(0.62, 0.30, J) * smoothstep(0.15, 0.7, hgt + 0.3);
        vec4 ft = texture2D(uDetail, q / 9.0 + uFoamOff);
        vec4 ft2 = texture2D(uDetail, q / 3.3 + uFoamOff2);
        float pattern = ft.b * 0.72 + ft2.b * 0.28;
        float mask = clamp(max(crestFoam * 0.7, max(wk.r * 0.75, wk.g * 0.92)), 0.0, 1.0);
        float foam = smoothstep(1.0 - mask, 1.2 - mask, pattern * 0.88 + mask * 0.22) * smoothstep(1600.0, 250.0, dist);
        float aer = clamp(wk.g * 0.9 + wk.r * 0.35 + crestFoam * 0.2, 0.0, 1.0) * smoothstep(0.0, 0.7, ft.a + 0.25);
        col = mix(col, vec3(0.035, 0.30, 0.27) * 0.9 * uLevel + refl * 0.06, aer * 0.35);
        vec3 foamLit = vec3(0.88, 0.9, 0.92) * uLevel * (0.55 + 0.45 * NdL) * (0.78 + 0.22 * pattern) * cShad;
        col = mix(col, foamLit, foam);
        col += spec * (1.0 - foam);

        // Dissolve into directional Mie aerial perspective: cool horizon haze away from sun, warm luminous veil toward sun.
        float sunAlign = max(dot(-V, L), 0.0);
        vec3 oceanFog = uFog + uMieCol * (pow(sunAlign, 4.0) * 0.36 + pow(sunAlign, 20.0) * 0.48) * uMieK * smoothstep(1000.0, 10000.0, dist);
        float fogK = 1.0 - exp(-uFogD * uFogD * dist * dist);
        col = mix(col, oceanFog, max(fogK, smoothstep(uFade.x, uFade.y, dist)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.frustumCulled = false;
  scene.add(ocean);

  // ---- per-frame: snap, wrapped phases, scroll offsets (zero allocation) ----
  const fract = v => v - Math.floor(v);
  let waveT = 0, lastT = -1;
  const _cw = new THREE.Vector3();
  function followOcean() {
    camera.getWorldPosition(_cw);
    const ox = Math.round(_cw.x / OCEAN_SNAP) * OCEAN_SNAP, oz = Math.round(_cw.z / OCEAN_SNAP) * OCEAN_SNAP;
    ocean.position.set(ox, 0, oz);
    const U = oceanUniforms, t = U.uTime.value, chop = U.uChop.value;
    let dt = lastT < 0 ? 0 : t - lastT; lastT = t;
    if (!(dt >= 0 && dt < 0.25)) dt = 0;
    waveT += dt * (1 + 0.9 * chop);                           // wind speeds the sea up without phase jumps
    U.uOrigin.value.set(ox, oz);
    for (let i = 0; i < NW; i++) {
      const w = waves[i];
      let ph = w.k * (w.dx * ox + w.dz * oz) - w.omega * waveT + w.seed;   // float64
      ph %= TAU; if (ph < 0) ph += TAU;
      wavePhase[i] = ph;
    }
    const amp = U.uSwell.value * (1 + 0.8 * chop) * 0.85;
    U.uAmp.value = amp;
    U.uSteep.value = Math.min(amp, 0.95 / SUM_Q);
    const wx = Math.sin(WIND), wz = Math.cos(WIND);
    U.uDetOffA.value.set(fract(ox / 19 + waveT * 0.021 * wx), fract(oz / 19 + waveT * 0.021 * wz));
    U.uDetOffB.value.set(fract(oz / 7.3 + waveT * 0.043), fract(-ox / 7.3 - waveT * 0.017));
    U.uFoamOff.value.set(fract(ox / 9 + waveT * 0.004), fract(oz / 9 + waveT * 0.003));
    U.uFoamOff2.value.set(fract(ox / 3.3 - waveT * 0.009), fract(oz / 3.3 + waveT * 0.006));
  }

  // ---- half-res planar reflection (layer REFLECT_LAYER, clipped at y > -0.05) ----
  const reflRT = renderer ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true }) : null;
  const reflCam = new THREE.PerspectiveCamera(60, 1, 1, 100000);
  reflCam.layers.set(REFLECT_LAYER);
  const reflPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05);
  const clipOn = [reflPlane], clipOff = [];
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const _rq = new THREE.Quaternion(), _rf = new THREE.Vector3(), _ru = new THREE.Vector3(), _rl = new THREE.Vector3(), _rp = new THREE.Vector3();
  const _bufSize = new THREE.Vector2(), _prevClear = new THREE.Color();
  let reflEnabled = true, reflScale = 0.5;
  if (reflRT) oceanUniforms.uRefl.value = reflRT.texture;
  // Mark a subtree as reflected (iterative, reusable stack: no per-call closures).
  const _stack = [];
  function markReflect(root) {
    if (!root) return;
    _stack.length = 0; _stack.push(root);
    while (_stack.length) {
      const o = _stack.pop();
      o.layers.enable(REFLECT_LAYER);
      const ch = o.children;
      for (let i = 0; i < ch.length; i++) _stack.push(ch[i]);
    }
  }
  function renderReflection(viewCam) {
    if (!reflRT || !reflEnabled) { oceanUniforms.uReflOn.value = 0; return false; }
    viewCam.getWorldPosition(_rp);
    if (_rp.y > 6000 || _rp.y < 0.5) { oceanUniforms.uReflOn.value = 0; return false; }
    renderer.getDrawingBufferSize(_bufSize);
    const w = Math.max(1, Math.round(_bufSize.x * reflScale)), h = Math.max(1, Math.round(_bufSize.y * reflScale));
    if (reflRT.width !== w || reflRT.height !== h) reflRT.setSize(w, h);
    viewCam.getWorldQuaternion(_rq);
    reflCam.position.set(_rp.x, -_rp.y, _rp.z);
    _rf.set(0, 0, -1).applyQuaternion(_rq); _rf.y = -_rf.y;
    _ru.set(0, 1, 0).applyQuaternion(_rq); _ru.y = -_ru.y;
    reflCam.up.copy(_ru);
    reflCam.lookAt(_rl.copy(reflCam.position).add(_rf));
    reflCam.fov = viewCam.fov; reflCam.aspect = viewCam.aspect; reflCam.near = viewCam.near; reflCam.far = viewCam.far;
    reflCam.updateProjectionMatrix(); reflCam.updateMatrixWorld();
    oceanUniforms.uReflMat.value.copy(bias).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
    const prev = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha(), autoShadow = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(_prevClear);
    renderer.clippingPlanes = clipOn;
    renderer.setRenderTarget(reflRT);
    renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
    renderer.shadowMap.autoUpdate = false;                   // reuse this frame's shadow map
    ocean.visible = false;
    renderer.render(scene, reflCam);
    ocean.visible = true;
    renderer.shadowMap.autoUpdate = autoShadow;
    renderer.clippingPlanes = clipOff;
    renderer.setClearColor(_prevClear, prevAlpha);
    renderer.setRenderTarget(prev);
    oceanUniforms.uReflOn.value = 1;
    return true;
  }

  return {
    ocean, oceanUniforms, followOcean, OCEAN_SNAP, REFLECT_LAYER,
    markReflect, renderReflection,
    setJetWash(x, z, fx, fz, k, spd, ab) {
      oceanUniforms.uJetPos.value.set(x, z, k, ab);
      oceanUniforms.uJetDir.value.set(fx, fz, spd, 0);
    },
    setReflection(on, scale) { reflEnabled = !!on; if (scale) reflScale = scale; if (!reflEnabled) oceanUniforms.uReflOn.value = 0; },
    get reflectionOn() { return reflEnabled && oceanUniforms.uReflOn.value > 0.5; },
    reflectionCamera: reflCam, reflectionTarget: reflRT,
    // CPU twin of the rendered spectrum (heave for floating props / debug).
    waveHeight(x, z) {
      const ox = ocean.position.x, oz = ocean.position.z, a = oceanUniforms.uAmp.value;
      let h = 0;
      for (let i = 0; i < NW; i++) { const w = waves[i]; h += w.A * a * Math.sin(w.k * (w.dx * (x - ox) + w.dz * (z - oz)) + wavePhase[i]); }
      return h;
    },
    shipSlots: MAX_SHIPS
  };
}
