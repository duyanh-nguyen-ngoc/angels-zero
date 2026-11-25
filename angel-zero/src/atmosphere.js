// ANGELS ZERO — atmosphere + time-of-day engine.
//
// Sky: full-sphere BackSide ShaderMaterial — Rayleigh-style altitude gradient
// (horizon haze -> mid sky -> zenith), Mie forward-scatter lobe around the
// sun (or moon), solar / lunar disc, and a procedural twinkling starfield.
// The sky's horizon colour IS `scene.fog.color` (same THREE.Color), so the sea
// and islands always fade into exactly the colour the sky meets them with.
//
// Time of day: five random presets (DAWN, DAYLIGHT, GOLDEN_HOUR, DUSK, NIGHT) plus the
// theatre / phase presets (CLOUD_SEA, STORM, STORM_OPS, SUNBREAK) drive
// the sky, the sun / moon direction (randomised azimuth), the directional,
// hemisphere and ambient lights, exposure, fog, ocean glint + water level,
// cloud top / belly colours, airframe env-map strength and NVG tube gain.
// applyTimeOfDay() blends there smoothly (or instantly); randomize() rolls a
// preset + azimuth for every sortie. NVG multiplies the active preset's fill
// light each frame, so switching it off restores that preset exactly.

const CLOUD_WHITE = 0xe9eef3;
const D2R = Math.PI / 180;

// Colours are sRGB hex; scalars are linear multipliers.
export const PRESETS = {
  // Flagship theatre: high-contrast midday over a cumulus cloud sea. Fixed sun ~48 deg,
  // forward-left of the opening heading; exact (un-desaturated) cobalt -> azure -> pale
  // mist gradient, the same #95b1cc in the lower dome, the fog and the ocean far fade.
  // Warm-white key below the bloom threshold, cool low fill so undersides stay shadowed.
  CLOUD_SEA: {
    label: 'DAYLIGHT // CLOUD SEA', sunEl: 48, lightEl: 48, az: 332, moon: false, window: [10 * 60 + 30, 13 * 60 + 30],
    horizon: 0x9ec2e2, mid: 0x3b72b5, zenith: 0x1a4480, mie: 0xffe6c2, mieK: 0.55, disc: 0xfff6e6, discK: 1.0, discSize: 0.99990,
    light: 0xfff6e6, lightI: 2.85, hemiSky: 0x6f94bc, hemiGround: 0x2a343b, hemiI: 1.05, amb: 0x7f95ad, ambI: 0.2,
    exposure: 1.0, fogK: 0.72, stars: 0, corona: 1.0,
    oceanSun: 0xffe8c4, oceanSunK: 1.0, oceanSky: 0x4f74a0, oceanLevel: 1.0, glitter: 1.0,
    cloudTop: 0xf7faff, cloudBelly: 0x4b6482, env: 1.0, nvgGain: 2.1, nav: 0.0, exact: 1
  },
  DAWN: {
    label: 'DAWN BREAK', sunEl: 6, lightEl: 6, moon: false, window: [5 * 60 + 35, 6 * 60 + 25],
    horizon: 0xf5b895, mid: 0x7d86b8, zenith: 0x1f3f73, mie: 0xff9f78, mieK: 1.25, disc: 0xffd2a8, discK: 1.0, discSize: 0.99990,
    light: 0xffb88e, lightI: 2.0, hemiSky: 0xc8b4d6, hemiGround: 0x3a3442, hemiI: 0.95, amb: 0xb7a6cc, ambI: 0.24,
    exposure: 0.95, fogK: 1.15, stars: 0.12, corona: 0.85,
    oceanSun: 0xffb08a, oceanSunK: 1.0, oceanSky: 0x6f7aa6, oceanLevel: 0.8, glitter: 1.4,
    cloudTop: 0xffcdbd, cloudBelly: 0x8a83aa, env: 0.75, nvgGain: 3.2, nav: 0.45
  },
  DAYLIGHT: {
    label: 'CLEAR DAYLIGHT', sunEl: 58, lightEl: 58, moon: false, window: [11 * 60 + 20, 14 * 60 + 10],
    horizon: 0xa8d4ff, mid: 0x2c7be5, zenith: 0x0f3b7a, mie: 0xffc98a, mieK: 0.8, disc: 0xfff1d8, discK: 1.0, discSize: 0.99990,
    light: 0xfff0d6, lightI: 3.4, hemiSky: 0xbdd6ee, hemiGround: 0x3b4a40, hemiI: 1.5, amb: 0xa8bdd0, ambI: 0.35,
    exposure: 1.0, fogK: 1.0, stars: 0, corona: 1.0,
    oceanSun: 0xffe0b3, oceanSunK: 1.0, oceanSky: 0x4d70a0, oceanLevel: 1.0, glitter: 1.0,
    cloudTop: 0xffffff, cloudBelly: 0x567396, env: 1.1, nvgGain: 2.1, nav: 0.0
  },
  GOLDEN_HOUR: {
    label: 'GOLDEN HOUR', sunEl: 9, lightEl: 9, moon: false, window: [17 * 60, 17 * 60 + 55],
    horizon: 0xf4d5a6, mid: 0x8ea5c4, zenith: 0x4a6e99, mie: 0xffb35c, mieK: 1.6, disc: 0xffd79a, discK: 1.0, discSize: 0.99989,
    light: 0xffbe6b, lightI: 2.9, hemiSky: 0xf0d2a8, hemiGround: 0x4a3a2a, hemiI: 1.1, amb: 0xdec08e, ambI: 0.3,
    exposure: 1.0, fogK: 1.05, stars: 0, corona: 1.0,
    oceanSun: 0xffbe6b, oceanSunK: 1.25, oceanSky: 0x8a8ea8, oceanLevel: 0.9, glitter: 2.6,
    cloudTop: 0xfff0cf, cloudBelly: 0x7d7a92, env: 0.95, nvgGain: 2.4, nav: 0.2
  },
  DUSK: {
    label: 'CIVIL TWILIGHT', sunEl: -4, lightEl: 4, moon: false, window: [18 * 60 + 50, 19 * 60 + 30],
    horizon: 0xd95b43, mid: 0x3b2d54, zenith: 0x0d152b, mie: 0xff6a3a, mieK: 1.4, disc: 0xff8a5a, discK: 0.0, discSize: 0.99990,
    light: 0xff8a5c, lightI: 0.6, hemiSky: 0x5d4f80, hemiGround: 0x17131f, hemiI: 0.5, amb: 0x453f68, ambI: 0.12,
    exposure: 0.85, fogK: 1.2, stars: 0.35, corona: 0.0,
    oceanSun: 0xff7a4a, oceanSunK: 0.7, oceanSky: 0x3a2a48, oceanLevel: 0.35, glitter: 1.6,
    cloudTop: 0x4a3a52, cloudBelly: 0x1b1828, env: 0.35, nvgGain: 6.5, nav: 0.9
  },
  NIGHT: {
    label: 'MOONLIT NIGHT', sunEl: 38, lightEl: 38, moon: true, window: [22 * 60 + 30, 26 * 60 + 30],
    horizon: 0x0c172b, mid: 0x081022, zenith: 0x040812, mie: 0x34507a, mieK: 0.55, disc: 0xdfe9f8, discK: 0.55, discSize: 0.99984,
    light: 0xbcd4f0, lightI: 0.45, hemiSky: 0x23324e, hemiGround: 0x040609, hemiI: 0.2, amb: 0x18223a, ambI: 0.05,
    exposure: 0.8, fogK: 1.3, stars: 1.0, corona: 0.28,
    oceanSun: 0x9fb8d8, oceanSunK: 0.42, oceanSky: 0x0a1222, oceanLevel: 0.12, glitter: 0.9,
    cloudTop: 0x2a3447, cloudBelly: 0x111927, env: 0.12, nvgGain: 15, nav: 1.0
  },
  // Phase-reactive presets: never randomised, only driven by ambient.blendTo().
  // STORM: visibility down to 0.55x the map's fogFar (density / 0.55), a weak
  // 0.35x sun, slate #4a525a cloud bodies and 40 % less ambient fill.
  STORM: {
    label: 'STORM FRONT', sunEl: 32, lightEl: 32, moon: false, window: [12 * 60, 15 * 60],
    horizon: 0x4a525a, mid: 0x3f4a55, zenith: 0x252d36, mie: 0x8b959f, mieK: 1.1, disc: 0xb9c2c9, discK: 0.25, discSize: 0.99992,
    light: 0xb6c0c8, lightI: 1.2, hemiSky: 0x515d69, hemiGround: 0x232930, hemiI: 0.72, amb: 0x606a74, ambI: 0.21,
    exposure: 0.9, fogK: 1.82, stars: 0, corona: 0.15,
    oceanSun: 0x9aa6b0, oceanSunK: 0.55, oceanSky: 0x3b454f, oceanLevel: 0.55, glitter: 0.5,
    cloudTop: 0x4a525a, cloudBelly: 0x2c333a, env: 0.55, nvgGain: 4.2, nav: 0.35, exact: 1
  },
  // STORM OPS (Storm Realism Pass, step 1): dark carrier-ops storm under a cool silver
  // moon. Charcoal-indigo dome, a low (20 deg) moon key so airframe edges catch a silver
  // rim while the faces stay dark, weak cold fill, a near-black sea whose specular is a
  // narrow silver glint (low level / glitter, darker sky reflection) and shafts: 1 =
  // full-strength additive god-ray shafts (src/stormfx.js). Paired with the STORM_OPS
  // weather (slate deck, light rain, lightning, heavy chop). Auto in NAVAL phase 3.
  STORM_OPS: {
    label: 'STORM OPS', sunEl: 20, lightEl: 20, moon: true, window: [1 * 60 + 30, 3 * 60 + 30],
    horizon: 0x2b333d, mid: 0x1c232d, zenith: 0x0b1017, mie: 0x8fa3ba, mieK: 0.9, disc: 0xdfe8f4, discK: 0.7, discSize: 0.99984,
    light: 0xc9d7ea, lightI: 1.9, hemiSky: 0x2e3a4a, hemiGround: 0x07090c, hemiI: 0.42, amb: 0x1d2633, ambI: 0.08,
    exposure: 1.0, fogK: 1.45, stars: 0, corona: 0.35,
    oceanSun: 0xc4d4ea, oceanSunK: 0.95, oceanSky: 0x0d141c, oceanLevel: 0.22, glitter: 0.55,
    cloudTop: 0x3a4452, cloudBelly: 0x12171e, env: 0.35, nvgGain: 6.0, nav: 0.85, exact: 1, shafts: 1
  },
  // SUNBREAK: a hard low sun punching through thin high cloud (ACE_DUEL opening).
  SUNBREAK: {
    label: 'SUNBREAK', sunEl: 14, lightEl: 14, moon: false, window: [9 * 60, 11 * 60],
    horizon: 0xffd9b0, mid: 0x7fb0e0, zenith: 0x2f5791, mie: 0xffc477, mieK: 1.85, disc: 0xfff2d2, discK: 1.0, discSize: 0.99988,
    light: 0xffe0ac, lightI: 4.76, hemiSky: 0xcfe1f2, hemiGround: 0x4a4636, hemiI: 1.25, amb: 0xc8d8e8, ambI: 0.3,
    exposure: 1.05, fogK: 0.87, stars: 0, corona: 1.15,
    oceanSun: 0xffd79a, oceanSunK: 1.5, oceanSky: 0x6288b4, oceanLevel: 1.15, glitter: 2.1,
    cloudTop: 0xfff3dc, cloudBelly: 0x8090a4, env: 1.2, nvgGain: 2.2, nav: 0.1
  }
};
// Random sortie rolls (CLOUD_SEA is picked explicitly as a theatre, with its weather).
export const PRESET_ORDER = ['DAWN', 'DAYLIGHT', 'GOLDEN_HOUR', 'DUSK', 'NIGHT'];
const COLOR_KEYS = ['horizon', 'mid', 'zenith', 'mie', 'disc', 'light', 'hemiSky', 'hemiGround', 'amb', 'oceanSun', 'oceanSky', 'cloudTop', 'cloudBelly'];
// exact: 1 = use the preset sky / horizon colours as authored (no colour-discipline desaturation).
const NUM_KEYS = ['mieK', 'discK', 'discSize', 'lightI', 'hemiI', 'ambI', 'exposure', 'fogK', 'stars', 'corona', 'oceanSunK', 'oceanLevel', 'glitter', 'env', 'nvgGain', 'nav', 'exact', 'shafts'];
// Global ACES exposure trim on top of every preset (Storm Realism Pass: ~1.05 with the
// high-threshold bloom, so only HDR emissives bloom and the sky never washes out).
const EXPOSURE_TRIM = 1.05;

export function createAtmosphere(THREE, env) {
  const { scene, camera, sunDir, terrainHeight } = env;    // sunDir: shared light direction (sun or moon)
  const cloudWhite = new THREE.Color(CLOUD_WHITE);
  const BASE_DENSITY = env.fogDensity;
  scene.fog = new THREE.FogExp2(new THREE.Color(PRESETS.DAYLIGHT.horizon), BASE_DENSITY);
  const fogColor = scene.fog.color;                      // shared by sky + ocean shaders
  const skyDir = sunDir.clone();                         // true sun / moon direction (can sit below the horizon)

  // Current (blended) and target values.
  const mkState = () => {
    const o = {};
    for (const k of COLOR_KEYS) o[k] = new THREE.Color();
    for (const k of NUM_KEYS) o[k] = 0;
    o.skyDir = new THREE.Vector3(0, 1, 0); o.lightDir = new THREE.Vector3(0, 1, 0);
    return o;
  };
  const cur = mkState(), tgt = mkState();
  let blend = 1;                                         // 1 = settled
  let blendDur = 1.5;                                    // seconds; blendTo() can override
  let active = { name: 'DAYLIGHT', az: 0, clock: '12:00', mode: 'RANDOM' };
  // Reused colour scratch — applyToScene/update run every frame, so no .clone() here.
  const _sa = new THREE.Color(), _sb = new THREE.Color(), _sc = new THREE.Color(), _white = new THREE.Color(1, 1, 1);

  /* ------------------------------------------------------------ sky dome */
  const skyUniforms = {
    uSun: { value: skyDir },
    uHorizon: { value: fogColor },
    uMid: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() },
    uSunColor: { value: cur.disc }, uMie: { value: cur.mie },
    uMieK: { value: 1 }, uDiscK: { value: 1 }, uDiscSize: { value: 0.9999 },
    uStars: { value: 0 }, uTime: { value: 0 }, uMoon: { value: 0 },
    uWhite: { value: 0 }                                 // in-cloud white-out 0..1
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(45000, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vDir;
      uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uMid; uniform vec3 uZenith;
      uniform vec3 uSunColor; uniform vec3 uMie; uniform float uMieK; uniform float uDiscK; uniform float uDiscSize;
      uniform float uStars; uniform float uTime; uniform float uMoon; uniform float uWhite;
      float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float cNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x),
                   mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float cirrusFbm(vec2 p) {
        return 0.55 * cNoise(p) + 0.30 * cNoise(p * 2.13 + vec2(3.1, 1.7)) + 0.15 * cNoise(p * 4.47 + vec2(7.3, 5.2));
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir);
        vec3 L = normalize(uSun);
        float h = clamp(d.y, 0.0, 1.0);
        // Rayleigh-style optical depth: thick haze at the horizon, thinning upward.
        // The lowest ~8 deg hold the exact horizon haze (= fog colour = ocean far colour),
        // easing into the mid sky: one continuous horizon curve with no seam.
        float tMid = (1.0 - exp(-max(h - 0.008, 0.0) * 7.0)) * smoothstep(0.0, 0.14, h + 0.02);
        float tZen = smoothstep(0.18, 1.0, h);
        vec3 col = mix(uHorizon, uMid, tMid);
        col = mix(col, uZenith, tZen * tZen * (3.0 - 2.0 * tZen));
        float mu = dot(d, L);
        float mup = max(mu, 0.0);
        // Mie forward scatter around the sun azimuth; strongest near the horizon
        // (also lights the twilight band when the sun is just below it).
        float horizonBias = 1.0 - smoothstep(0.0, 0.45, h);
        vec3 az = normalize(vec3(L.x, 0.0, L.z) + 1e-5);
        float azGlow = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), az), 0.0);
        col += uMie * uMieK * (pow(mup, 6.0) * 0.30 * (0.35 + 0.65 * horizonBias) + pow(mup, 48.0) * 0.55
                               + pow(azGlow, 4.0) * horizonBias * 0.22);
        // Sun or moon disc + aureole.
        float disc = smoothstep(uDiscSize, uDiscSize + 0.00006, mu);
        col += uSunColor * uDiscK * (pow(mup, 600.0) * (uMoon > 0.5 ? 0.6 : 3.0) + disc * (uMoon > 0.5 ? 2.2 : 26.0));
        // Procedural starfield (twinkling), fading toward the horizon haze.
        if (uStars > 0.001) {
          vec3 sp = d * 260.0, cell = floor(sp);
          float hs = hash3(cell);
          if (hs > 0.9962) {
            vec3 f = fract(sp) - 0.5;
            float core = smoothstep(0.34, 0.0, length(f));
            float tw = 0.6 + 0.4 * sin(uTime * (1.5 + hs * 7.0) + hs * 91.0);
            float mag = 0.45 + 2.6 * (hs - 0.9962) / 0.0038;
            col += vec3(0.82, 0.88, 1.0) * core * tw * mag * uStars * smoothstep(0.02, 0.28, d.y) * (1.0 - disc);
          }
        }
        // High-altitude wispy cirrus streaks across the upper troposphere.
        if (d.y > 0.025) {
          vec2 cp = d.xz / (d.y + 0.14) * 1.45 + vec2(uTime * 0.0022, -uTime * 0.0010);
          vec2 wq = vec2(cirrusFbm(cp * 0.9), cirrusFbm(cp * 0.9 + vec2(4.2, 1.7)));
          float c1 = cirrusFbm((cp + wq * 0.45) * vec2(0.55, 1.85));
          float cirrus = smoothstep(0.45, 0.85, c1) * smoothstep(0.03, 0.24, d.y) * smoothstep(0.95, 0.40, d.y)
            * (1.0 - uStars * 0.85) * 0.28;
          vec3 cirCol = mix(uHorizon * 1.08, uSunColor * 1.15, 0.35 + 0.45 * pow(mup, 4.0));
          col = mix(col, cirCol, cirrus);
        }
        // Luminous horizon atmospheric band where the cloud sea meets the sky.
        float hGlow = exp(-abs(d.y) * 14.0) * (0.14 + 0.14 * pow(mup, 3.0)) * (1.0 - uStars * 0.85);
        col += mix(uHorizon, uSunColor, 0.35) * hGlow;
        // Below the horizon: pure horizon haze (the ocean fog fades into it).
        col = mix(col, uHorizon, smoothstep(0.015, -0.06, d.y));
        col = mix(col, uHorizon, uWhite);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);

  /* ----------------------------------------------- sun corona + ghosts */
  function coronaTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), c = S / 2;
    const g = x.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,248,1)'); g.addColorStop(0.035, 'rgba(255,250,232,0.95)');
    g.addColorStop(0.09, 'rgba(255,226,170,0.45)'); g.addColorStop(0.3, 'rgba(255,196,120,0.12)');
    g.addColorStop(1, 'rgba(255,180,100,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    for (const [r, a, col] of [[0.20, 0.10, '255,214,150'], [0.34, 0.06, '180,220,255'], [0.47, 0.04, '255,200,170']]) {
      x.strokeStyle = `rgba(${col},${a})`; x.lineWidth = S * 0.012;
      x.beginPath(); x.arc(c, c, c * r, 0, Math.PI * 2); x.stroke();
    }
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 + 0.13, len = c * (i % 3 ? 0.55 : 0.95);
      const sg = x.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
      sg.addColorStop(0, 'rgba(255,240,210,0.35)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
      x.strokeStyle = sg; x.lineWidth = i % 3 ? 1.5 : 3;
      x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len); x.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function ghostTexture(hex, ring) {
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), c = S / 2;
    const g = x.createRadialGradient(c, c, ring ? c * 0.55 : 0, c, c, c);
    g.addColorStop(0, `rgba(${hex},${ring ? 0 : 0.5})`);
    g.addColorStop(ring ? 0.35 : 0.7, `rgba(${hex},0.32)`);
    g.addColorStop(1, `rgba(${hex},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const additive = map => new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, transparent: true,
    depthWrite: false, fog: false, toneMapped: false });
  const corona = new THREE.Sprite(additive(coronaTexture()));
  corona.renderOrder = -900; corona.frustumCulled = false;
  scene.add(corona);
  const SUN_DIST = 30000;
  const ghosts = [
    { k: 0.45, size: 0.4, tex: ghostTexture('255,190,120', true) },
    { k: 0.85, size: 0.28, tex: ghostTexture('140,220,255', true) },
    { k: 1.25, size: 0.85, tex: ghostTexture('200,255,210', true) },
    { k: 1.7, size: 0.38, tex: ghostTexture('255,170,120', false) }
  ].map(o => {
    const sp = new THREE.Sprite(additive(o.tex));
    sp.material.depthTest = false; sp.renderOrder = 50; sp.frustumCulled = false;
    camera.add(sp);
    return { sp, ...o };
  });
  if (!camera.parent) scene.add(camera);

  /* ------------------------------------------------- time-of-day engine */
  const bound = {};                                      // lights, ocean uniforms, clouds, callbacks
  // Weather overlay (src/weather.js): overcast 0..1 greys the sky toward slate
  // (#4a5568 day / #0d131f night), dims sun / moon, mie glow, stars and glitter;
  // fogMul tightens the haze; flash 0..1 is a lightning pulse.
  const wx = { overcast: 0, fogMul: 1, flash: 0 };
  const SLATE_DAY = new THREE.Color(0x4a5568), SLATE_NIGHT = new THREE.Color(0x0d131f);
  const slate = new THREE.Color(), _ct = new THREE.Color(), _cb = new THREE.Color(), FLASH = new THREE.Color(0.82, 0.86, 1.0);
  function setWeather(o) { Object.assign(wx, o); }
  // Pull a colour toward its own luminance by k (0..1).
  function desat(c, k) { const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; c.r += (l - c.r) * k; c.g += (l - c.g) * k; c.b += (l - c.b) * k; return c; }
  function bind(o) { Object.assign(bound, o); }
  const dirFrom = (el, az, out) => out.set(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R)).normalize();
  function fillTarget(name, az) {
    const p = PRESETS[name];
    for (const k of COLOR_KEYS) tgt[k].setHex(p[k]);
    for (const k of NUM_KEYS) tgt[k] = p[k] ?? 0;
    dirFrom(p.sunEl, az, tgt.skyDir);
    dirFrom(p.lightEl, az, tgt.lightDir);
  }
  function clockFor(name) {
    const [a, b] = PRESETS[name].window;
    const m = Math.floor(a + Math.random() * (b - a)) % (24 * 60);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60 / 5) * 5).padStart(2, '0');
  }
  // Configure a preset. instant: snap (load / restart) instead of the ~1.5 s blend.
  function applyTimeOfDay(name, opts = {}) {
    if (!PRESETS[name]) name = 'DAYLIGHT';
    const az = opts.az ?? PRESETS[name].az ?? Math.random() * 360;
    active = { name, az, clock: opts.clock || clockFor(name), mode: opts.mode || active.mode, label: PRESETS[name].label };
    fillTarget(name, az);
    skyUniforms.uMoon.value = PRESETS[name].moon ? 1 : 0;
    if (opts.instant) {
      for (const k of COLOR_KEYS) cur[k].copy(tgt[k]);
      for (const k of NUM_KEYS) cur[k] = tgt[k];
      cur.skyDir.copy(tgt.skyDir); cur.lightDir.copy(tgt.lightDir);
      blendDur = opts.blendSecs || 1.5; blend = 1; applyToScene();
    } else { blendDur = opts.blendSecs || 1.5; blend = 0; }
    if (bound.onChange) bound.onChange(active);
    return active;
  }
  // Phase / RTB driven sky change. One preallocated target state; the existing
  // update() interpolation pushes it through all of the bound callbacks.
  function blendTo(name, secs = 1.5) {
    if (!PRESETS[name] || name === active.name) return active;
    return applyTimeOfDay(name, secs <= 0 ? { instant: true } : { blendSecs: secs, mode: active.mode });
  }
  function randomize(opts = {}) {
    const name = PRESET_ORDER[Math.floor(Math.random() * PRESET_ORDER.length)];
    return applyTimeOfDay(name, { ...opts, mode: 'RANDOM' });
  }

  let nvgOn = false;
  function applyToScene() {
    skyDir.copy(cur.skyDir);
    sunDir.copy(cur.lightDir);
    const oc = wx.overcast, fl = wx.flash;
    slate.copy(SLATE_DAY).lerp(SLATE_NIGHT, Math.min(1, cur.nav));
    const grey = Math.min(1, oc * 1.12);
    const dk = 1 - cur.exact;                            // colour-discipline desaturation (off for exact presets)
    skyUniforms.uMid.value.copy(cur.mid); desat(skyUniforms.uMid.value, 0.18 * dk).lerp(_sa.copy(slate).multiplyScalar(1.15), grey).lerp(FLASH, fl * 0.35);
    skyUniforms.uZenith.value.copy(cur.zenith); desat(skyUniforms.uZenith.value, 0.12 * dk).lerp(_sb.copy(slate).multiplyScalar(0.85), grey).lerp(FLASH, fl * 0.25);
    skyUniforms.uMieK.value = cur.mieK * (1 - 0.85 * oc); skyUniforms.uDiscK.value = cur.discK * (1 - 0.95 * oc);
    skyUniforms.uDiscSize.value = cur.discSize; skyUniforms.uStars.value = cur.stars * (1 - oc);
    const L = bound;
    if (L.sunLight) {
      L.sunLight.color.copy(cur.light); L.sunLight.intensity = cur.lightI * (1 - 0.72 * oc) + fl * 2.2;
      if (!L.sunLight.castShadow) { L.sunLight.position.copy(sunDir).multiplyScalar(1000); L.sunLight.target.position.set(0, 0, 0); L.sunLight.target.updateMatrixWorld(); }
    }
    const fill = nvgOn ? 2.4 : 1;                        // NVG light intensification on top of the preset
    if (L.hemiLight) { L.hemiLight.color.copy(cur.hemiSky).lerp(slate, oc * 0.4); L.hemiLight.groundColor.copy(cur.hemiGround); L.hemiLight.intensity = cur.hemiI * fill * (1 - 0.3 * oc) + fl * 3.0; }
    if (L.ambLight) { L.ambLight.color.copy(cur.amb); L.ambLight.intensity = cur.ambI * fill; }
    if (L.renderer) L.renderer.toneMappingExposure = cur.exposure * EXPOSURE_TRIM;
    if (L.setShafts) L.setShafts(cur.shafts, oc);
    if (L.ocean) {
      const u = L.ocean;
      u.uSunColor.value.set(cur.oceanSun.r, cur.oceanSun.g, cur.oceanSun.b).multiplyScalar(cur.oceanSunK * (1 - 0.85 * oc) + fl * 0.8);
      _ct.copy(cur.oceanSky); desat(_ct, 0.2).lerp(slate, oc * 0.7).lerp(FLASH, fl * 0.5);
      u.uSky.value.set(_ct.r, _ct.g, _ct.b);
      if (u.uLevel) u.uLevel.value = cur.oceanLevel * (1 - 0.3 * oc) + fl * 0.6;
      if (u.uGlitter) u.uGlitter.value = cur.glitter * (1 - 0.9 * oc) + 0.05;
    }
    if (L.setCloudColors) {
      // Overcast: slate cloud bodies, darker indigo bellies; lightning floods them.
      _ct.copy(cur.cloudTop).lerp(_sa.copy(slate).multiplyScalar(1.6), Math.min(1, oc * 0.95));
      _cb.copy(cur.cloudBelly).lerp(_sb.copy(slate).multiplyScalar(0.5), Math.min(1, oc * 1.0));
      // + the preset sun colour and its strength (3.4 = full daylight; overcast dims it).
      L.setCloudColors(_ct, _cb, cur.light, (cur.lightI * (1 - 0.72 * oc)) / 3.4);
    }
    if (L.setEnv) L.setEnv(cur.env);
    if (L.setNavLights) L.setNavLights(cur.nav);
    if (L.setNvgGain) L.setNvgGain(cur.nvgGain);
  }

  const _p = new THREE.Vector3(), _n = new THREE.Vector3();
  let sunVis = 1, time = 0;
  function sunOccluded() {
    const o = camera.position;
    for (let d = 60; d < 12000; d *= 1.55) {
      _p.copy(skyDir).multiplyScalar(d).add(o);
      if (terrainHeight(_p.x, _p.z) > _p.y) return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- frame */
  // mist: camera-in-cloud factor 0..1 (white-out); nvg: night-vision active.
  function update(dt, mist, nvg) {
    time += dt;
    nvgOn = !!nvg;
    if (blend < 1) {
      blend = Math.min(1, blend + dt / blendDur);
      const k = blend >= 1 ? 1 : 1 - Math.exp(-dt * 3.2);
      for (const key of COLOR_KEYS) cur[key].lerp(tgt[key], k);
      for (const key of NUM_KEYS) cur[key] += (tgt[key] - cur[key]) * k;
      cur.skyDir.lerp(tgt.skyDir, k).normalize(); cur.lightDir.lerp(tgt.lightDir, k).normalize();
    }
    applyToScene();
    skyUniforms.uTime.value = time;
    sky.position.copy(camera.position);
    // Colour discipline: the horizon haze (fog = sky horizon band = ocean far colour) is
    // held ~22 % desaturated so HUD green, afterburners, trails and explosions pop.
    fogColor.copy(cur.horizon);
    desat(fogColor, 0.22 * (1 - cur.exact));
    fogColor.lerp(_sa.copy(slate).multiplyScalar(1.3), Math.min(1, wx.overcast * 1.05))
      .lerp(_sb.copy(cloudWhite).multiplyScalar(Math.max(0.12, cur.exposure * cur.oceanLevel * (1 - 0.5 * wx.overcast))), Math.min(1, mist * 1.15))
      .lerp(FLASH, wx.flash * 0.3);
    skyUniforms.uWhite.value = Math.min(1, mist * 1.1);
    // Altitude-aware aerial perspective: +15 % haze near the sea (< 1,500 ft) for
    // high-speed depth cues, thinning from ~8,500 ft to 55 % by ~13,800 ft (deck tops)
    // so distant coastlines stay readable silhouettes from altitude.
    const y = camera.position.y;
    const altK = (1 + 0.15 * (1 - THREE.MathUtils.smoothstep(y, 150, 460))) * (1 - 0.55 * THREE.MathUtils.smoothstep(y, 2600, 4200));
    scene.fog.density = BASE_DENSITY * cur.fogK * wx.fogMul * altK * (1 + mist * 28);

    corona.position.copy(skyDir).multiplyScalar(SUN_DIST).add(camera.position);
    const moon = skyUniforms.uMoon.value > 0.5;
    corona.scale.setScalar(SUN_DIST * (moon ? 0.16 : 0.34));
    corona.material.color.copy(moon ? cur.disc : _sc.copy(cur.light).lerp(_white, 0.5));
    const target = (sunOccluded() || skyDir.y < -0.01 ? 0 : 1 - Math.min(1, mist * 1.4)) * cur.corona * (1 - wx.overcast);
    sunVis += (target - sunVis) * Math.min(1, dt * 6);
    corona.material.opacity = 0.95 * sunVis;
    corona.visible = sunVis > 0.01;

    _n.copy(corona.position).project(camera);
    const inFront = _n.z < 1 && skyDir.dot(camera.getWorldDirection(_p)) > 0;
    const edge = Math.max(Math.abs(_n.x), Math.abs(_n.y));
    const gv = inFront && !moon ? sunVis * (1 - THREE.MathUtils.smoothstep(edge, 0.85, 1.25)) : 0;
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), D = 10;
    for (const g of ghosts) {
      const gx = _n.x * (1 - 2 * g.k), gy = _n.y * (1 - 2 * g.k);
      g.sp.position.set(gx * tanY * camera.aspect * D, gy * tanY * D, -D);
      g.sp.scale.setScalar(g.size * D * tanY * 0.35);
      g.sp.material.opacity = gv * 0.32 * (nvg ? 0.4 : 1);
      g.sp.visible = g.sp.material.opacity > 0.005;
    }
    return sunVis;
  }

  return {
    sky, corona, fogColor, update, bind, applyTimeOfDay, blendTo, randomize, setWeather,
    get active() { return active; },
    get current() { return cur; },
    get settled() { return blend >= 1; },
    get sunVisible() { return sunVis; }
  };
}
