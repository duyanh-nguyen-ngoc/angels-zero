// ANGELS ZERO — animated specular ocean (Gerstner/GGX), extracted from index.html.
// Zero per-frame allocations: all scratch and uniforms live in the factory closure.
export function createOcean(THREE, env) {
  const { scene, camera, createNoise2D, fbm, buildDepthTexture,
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
  return tex;
}

// Camera-following ocean: a 116 km plane re-centred on the camera
// in 1 km snaps; all shading is in world XZ, so nothing swims when it snaps. It
// dissolves radially into the shared fog / sky-horizon colour (exp2 fog + a hard
// 30-52 km fade), so no plane edge or seam is ever visible from 50 ft to 25,000 ft.
const OCEAN_SPAN = 116000, OCEAN_SNAP = 1000;
const oceanUniforms = {
  uTime: { value: 0 },
  uN1: { value: makeNormalMap(256, 1337, 6.0) },
  uN2: { value: makeNormalMap(256, 90210, 13.0) },
  uDepth: { value: buildDepthTexture(512) },
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
  uCloudShadowK: { value: 1.0 }
};
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
    varying vec3 vWorldPos;
    uniform float uTime; uniform sampler2D uN1; uniform sampler2D uN2; uniform sampler2D uDepth;
    uniform vec3 uTerr; uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uSky;
    uniform vec3 uFog; uniform float uFogD; uniform vec2 uFade; uniform vec3 uCam;
    uniform float uLevel; uniform float uGlitter; uniform float uChop;
    uniform float uSwell; uniform vec2 uScroll;
    uniform vec3 uDeep; uniform vec3 uShallow;
    uniform vec3 uMieCol; uniform float uMieK; uniform vec2 uCloudOff; uniform float uCloudShadowK;
    // One directional deep-water wave: accumulates its surface slope (Gerstner-style
    // dispersion w = sqrt(g k), so long swells travel faster than short chop).
    void wave(vec2 p, vec2 d, float lambda, float steep, float t, inout vec2 g) {
      float k = 6.2831853 / lambda;
      g += d * (steep * cos(k * dot(d, p) - sqrt(9.81 * k) * t));
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec2 p = vWorldPos.xz;
      float dist = length(uCam - vWorldPos);
      float tw = uTime * (1.0 + 0.9 * uChop);                       // wind drives the sea faster
      float sw = (1.0 + 0.8 * uChop) * uSwell;                      // ambient phase: calm -> storm swell
      // Broad swell: 4 analytic octaves crossing at different headings (no tiling).
      // Each octave fades out once its wavelength nears the pixel footprint, so the
      // short waves never alias into moire stripes in the middle distance.
      vec2 g = vec2(0.0);
      wave(p, normalize(vec2(0.83, 0.56)), 210.0, 0.050 * sw * (1.0 - smoothstep(9000.0, 26000.0, dist)), tw, g);
      wave(p, normalize(vec2(0.38, 0.92)), 118.0, 0.042 * sw * (1.0 - smoothstep(4000.0, 12000.0, dist)), tw, g);
      if (dist < 5000.0) wave(p, normalize(vec2(-0.62, 0.78)), 61.0, 0.034 * sw * (1.0 - smoothstep(1500.0, 5000.0, dist)), tw, g);
      if (dist < 2200.0) wave(p, normalize(vec2(0.95, -0.30)), 29.0, 0.026 * sw * (1.0 - smoothstep(600.0, 2200.0, dist)), tw, g);
      // Detail octaves fade with distance (no shimmer / moire far out); skip distant texture reads.
      float nearK = 1.0 - smoothstep(350.0, 4000.0, dist);
      float midK = 1.0 - smoothstep(2500.0, 22000.0, dist);
      vec3 nB = texture2D(uN1, p * 0.00031 + vec2(tw * 0.0011, -tw * 0.0008)).rgb * 2.0 - 1.0;
      vec3 n1 = vec3(0.0); vec3 n2 = vec3(0.0); vec3 n3 = vec3(0.0); vec3 n4 = vec3(0.0);
      if (midK > 0.001) {
        n1 = texture2D(uN1, p * 0.0016 + uScroll + vec2(tw * 0.006, tw * 0.008)).rgb * 2.0 - 1.0;
        n2 = texture2D(uN2, p * 0.0043 - uScroll * 0.65 + vec2(-tw * 0.011, tw * 0.007)).rgb * 2.0 - 1.0;
      }
      if (nearK > 0.001) {
        n3 = texture2D(uN2, p * 0.021 + vec2(tw * 0.03, -tw * 0.021)).rgb * 2.0 - 1.0;
        n4 = texture2D(uN1, p * 0.067 + vec2(-tw * 0.05, -tw * 0.04)).rgb * 2.0 - 1.0;   // micro ripples (100 ft skim)
      }
      float rough = 1.0 + 1.5 * uChop;
      vec2 slope = g + nB.xy * 0.2 + (n1.xy + n2.xy) * 0.21 * midK * rough
                 + n3.xy * 0.11 * (1.0 + uChop) * nearK + n4.xy * 0.055 * nearK;
      vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
      vec3 V = normalize(uCam - vWorldPos);
      vec3 L = normalize(uSun);
      vec3 H = normalize(L + V);
      float NdV = max(dot(N, V), 0.0), NdH = max(dot(N, H), 0.0), NdL = max(dot(N, L), 0.0);

      // Water depth + coastal coral/shoal mask under this fragment, from the active theatre height grid.
      vec2 tuv = (p - uTerr.xy) / uTerr.z + 0.5;
      float dm = 200.0;
      float shoalMask = 0.0;
      if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
        vec4 dTex = texture2D(uDepth, tuv);
        dm = dTex.r * 60.0;
        shoalMask = dTex.g;
      }

      // Body colour: abyssal sapphire-navy, emerald subsurface scattering through backlit
      // wave crests, luminous turquoise-emerald coastal shallows, visible sunlit sandy seabed
      // shelves, and multi-band animated surf foam (after ProceduralTerrains WaterMaterial).
      vec2 cUv = (p - uCloudOff) * 0.000244140625;
      float cRaw = texture2D(uN1, cUv).r * 0.62 + texture2D(uN2, cUv * 2.0 + vec2(0.37, 0.61)).r * 0.38;
      float cMask = smoothstep(0.36, 0.64, cRaw);
      float cShad = mix(1.0, mix(0.68, 1.02, cMask), uCloudShadowK * (1.0 - smoothstep(14000.0, 36000.0, dist)));
      vec3 deepC = uDeep * (0.84 + 0.34 * NdV) * cShad + vec3(0.0, 0.032, 0.042) * max(0.0, slope.x + slope.y) * NdL;
      float crestK = clamp(length(g) * 5.2 + max(0.0, slope.x * L.x + slope.y * L.z) * 1.9, 0.0, 1.0);
      float backLit = pow(max(dot(V, -normalize(vec3(L.x, L.y * 0.32, L.z))), 0.0), 3.2) * step(0.0, L.y);
      vec3 sss = vec3(0.035, 0.28, 0.27) * crestK * (0.30 + 0.92 * backLit) * (0.35 + 0.65 * midK);
      deepC += sss;
      // Exponential Beer-Lambert coastal bathymetry: deep sapphire -> emerald shelf -> luminous turquoise -> sandy seabed.
      float shelfK = exp(-dm * 0.058) * (1.0 - smoothstep(34.0, 56.0, dm));
      float shoalTurq = exp(-dm * 0.145) * clamp(0.45 + 0.75 * shoalMask, 0.0, 1.0);
      float seabedVis = exp(-dm * 0.34) * (1.0 - smoothstep(6.0, 12.0, dm));
      vec3 turquoiseC = mix(uShallow, vec3(0.08, 0.58, 0.56), clamp(shoalMask * 0.72 + n2.y * 0.14, 0.0, 1.0));
      float caustic = 0.88 + 0.24 * smoothstep(0.12, 0.86, n3.x * 0.55 + n2.y * 0.45 + 0.5) * nearK;
      vec3 sandyBed = vec3(0.50, 0.45, 0.31) * (0.90 + 0.18 * n2.x) * caustic;
      vec3 body = mix(deepC, turquoiseC * (0.86 + 0.18 * n2.x) * cShad, clamp(shelfK * 0.92, 0.0, 0.94));
      body = mix(body, vec3(0.10, 0.66, 0.62) * cShad * caustic, clamp(shoalTurq * 0.68, 0.0, 0.72));
      body = mix(body, sandyBed * cShad, clamp(seabedVis * 0.76, 0.0, 0.78));
      // Multi-band organic coastal surf + bright shoreline ribbon.
      float shore = 1.0 - smoothstep(0.0, 6.0, dm);
      float foamPatch = smoothstep(-0.35, 0.45, n1.y * 0.6 + n2.x * 0.5);
      float bands = 0.5 + 0.5 * sin(dm * 2.35 + uTime * 1.7 + n3.x * 3.1 + n1.y * 2.2);
      float surf = shore * smoothstep(0.42, 0.92, bands) * (0.45 + 0.55 * foamPatch) + (1.0 - smoothstep(0.0, 1.35, dm)) * 0.95;
      surf *= 0.74 + 0.26 * sin(uTime * 0.95 + (p.x + p.y) * 0.004);
      float caps = (0.12 + 0.88 * uChop) * smoothstep(0.80 - 0.06 * uChop, 1.06, n2.x * 0.5 + 0.5 + n1.x * 0.36) * (1.0 - shore) * 0.34 * midK;
      body = (body + vec3(0.76, 0.81, 0.84) * surf * 0.56 + vec3(0.74, 0.78, 0.82) * caps) * uLevel;

      // Fresnel sky reflection: navy looking straight down -> the sky / horizon at
      // grazing angles, gently relaxed over ultra-shallows so turquoise shelves & seabed stay readable.
      vec3 R = reflect(-V, N);
      vec3 refl = mix(uFog, uSky, smoothstep(0.02, 0.45, R.y));
      float fres = pow(1.0 - NdV, 4.0) * (1.0 - 0.34 * clamp(shoalTurq + seabedVis * 0.5, 0.0, 1.0));
      // (capped a touch below 1 near the jet so facet-scale glare never reads as snow)
      vec3 col = mix(body, refl * 0.92, clamp(0.02 + 0.98 * fres, 0.0, mix(0.82, 1.0, smoothstep(800.0, 6000.0, dist))));

      // Sun specular: GGX lobe, crisp near the jet and widening with distance into a
      // shimmering glitter lane stretching to the horizon; micro sparkle up close.
      float a = (mix(0.04, 0.17, smoothstep(400.0, 16000.0, dist)) + 0.06 * uChop) * (0.85 + 0.15 * min(uGlitter, 1.6));
      float a2 = a * a, dd = NdH * NdH * (a2 - 1.0) + 1.0;
      float D = a2 / (3.14159265 * dd * dd);
      float F = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
      float spec = min(D * F / (4.0 * max(NdV, 0.2)), 60.0) * step(0.0, L.y);
      float sparkle = pow(NdH, 2400.0) * 1.6 * nearK;
      float sunShadowK = mix(0.35, 1.0, mix(1.0, cMask, uCloudShadowK));
      col += uSunColor * (spec * 0.032 + sparkle) * sunShadowK * clamp(uGlitter, 0.0, 1.3) * NdL;

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
// Re-centre under the camera on a 1 km grid (shading is world-space: no swimming).
function followOcean() {
  ocean.position.set(Math.round(camera.position.x / OCEAN_SNAP) * OCEAN_SNAP, 0, Math.round(camera.position.z / OCEAN_SNAP) * OCEAN_SNAP);
}
  return { ocean, oceanUniforms, followOcean, OCEAN_SNAP };
}
