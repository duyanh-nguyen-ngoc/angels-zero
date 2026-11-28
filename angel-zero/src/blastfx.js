// ANGELS ZERO — impact detonations (Visual Pass 5).
//
// Every missile / 4AAM / UGB / cannon-kill explosion is a choreographed, fully
// pooled detonation tied into the Pass 1 selective bloom (threshold 0.92):
//   L1  0.00-0.14 s  HDR flash core (3.2, 2.5, 1.4) -> cools below the threshold by
//                    0.14 s, gone by 0.32 s; translucent additive pressure ring
//                    12 -> 90 m over 0.28 s (never above ~0.5, never blooms).
//   L2  0.03-0.95 s  4-6 churning noise fireball billboards 8 -> 38 m cooling along a
//                    blackbody ramp: HDR (2.2, 1.05, 0.25) -> #ff5a12 (22 %) -> #7a1c08 (50 %)
//                    -> charcoal (80 %); thin billow edges cool to soot in the shader.
//   L3  0.00-0.85 s  18-26 additive spark streaks (2.8, 1.7, 0.7) ejected at 90-220 m/s
//                    with drag + gravity; intensity decays e^-4.5t (under the bloom by ~0.3 s).
//   L4  0.00-3.50 s  4-6 dark tumbling chunks on ballistic arcs, each trailing a thin
//                    ember -> charcoal smoke ribbon (puffs every 45 ms).
//   Hanging smoke   6-9 soot puffs (#1c2024 -> #343b42) 12 -> 45 m, drifting with the
//                    cloud wind and billowing for 10-15 s, sun-shaded (warm-grey crown,
//                    soot core), luminance-capped (never blooms), 45 -> 12 m proximity fade.
// Impact signatures: WATER (geyser column 50-85 m + flat foam ring at y = 0.4, no
// black puff), GROUND / SHIP (ground-hugging flash, upward soot plume lingering 12 s,
// spark spray reflected about the surface normal).
// Fixed circular pools (oldest recycled): 110 hanging smoke, 512 trail puffs, 160 spray,
// 80 fireball, 48 flash / ring, 200 sparks, 40 debris, 8 foam rings. One instanced draw
// per pool, hidden while empty; no allocation per detonation or per frame.

const LOG_V = '#include <common>\n#include <logdepthbuf_pars_vertex>\n#include <fog_pars_vertex>\n';
const LOG_F = '#include <common>\n#include <logdepthbuf_pars_fragment>\n#include <fog_pars_fragment>\n';

export function createBlastFX(THREE, env) {
  const { scene, camera, terrainHeight } = env;
  const distortScene = env.distortScene || null;
  let cinematic = true;
  const SUN = env.sunDir;                                   // live shared light direction
  const WIND = env.wind || new THREE.Vector3(5.2, 0, -4.6);
  const rand = Math.random;
  const C = hex => new THREE.Color(hex);                    // sRGB hex -> linear

  /* ------------------------------------------------- procedural 4x4 normal+density smoke atlas */
  // 4x4 tiles (16 unique billows), 128 px each (512x512): RG = tangent normal, B = optical thickness, A = alpha.
  const smokeTex = (() => {
    const N = 512, T = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(N, N), d = img.data;
    const hBuf = new Float32Array(T * T), aBuf = new Float32Array(T * T);
    const hs = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 91.3) * 43758.5453; return v - Math.floor(v); };
    const vn = (x, y, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = hs(xi, yi, s), b = hs(xi + 1, yi, s), c = hs(xi, yi + 1, s), e = hs(xi + 1, yi + 1, s);
      return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
    };
    for (let tile = 0; tile < 16; tile++) {
      const ox = (tile % 4) * T, oy = (tile >> 2) * T;
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const u = i / T * 2 - 1, v = j / T * 2 - 1;
        let n = 0, amp = 0.5, f = 2.1 + (tile % 3) * 0.18, tot = 0;
        for (let o = 0; o < 5; o++) { n += amp * vn(u * f + tile * 5.7, v * f - tile * 3.1, tile * 7 + o); tot += amp; amp *= 0.5; f *= 2.05; }
        n /= tot;
        const r = Math.hypot(u, v) + (0.5 - n) * 0.58;
        let a = Math.max(0, Math.min(1, (1 - r) / 0.56));
        a = a * a * (3 - 2 * a) * (0.52 + 0.65 * n);
        a *= Math.max(0, Math.min(1, (1 - Math.max(Math.abs(u), Math.abs(v))) / 0.12));
        hBuf[j * T + i] = Math.min(1, a * (0.6 + 0.55 * n));
        aBuf[j * T + i] = Math.min(1, a);
      }
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(T - 1, i + 1);
        const j0 = Math.max(0, j - 1), j1 = Math.min(T - 1, j + 1);
        const dx = (hBuf[j * T + i1] - hBuf[j * T + i0]) * 3.2;
        const dy = (hBuf[j1 * T + i] - hBuf[j0 * T + i]) * 3.2;
        const inv = 1 / Math.hypot(dx, dy, 1);
        const nx = -dx * inv, ny = dy * inv;
        const k = ((oy + j) * N + ox + i) * 4;
        d[k] = Math.round((nx * 0.5 + 0.5) * 255);
        d[k + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        d[k + 2] = Math.round(hBuf[j * T + i] * 255);
        d[k + 3] = Math.round(aBuf[j * T + i] * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  })();

  /* ---------------------------------------------------------- shared uniforms */
  const U = {
    uTex: { value: smokeTex }, uSunV: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.35, 0.38, 0.42) }
  };
  const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

  /* ------------------------------------------------- billboard pool (instanced) */
  const BB_V = LOG_V + `
    attribute vec4 iA;   // world xyz, quad width (m)
    attribute vec4 iC;   // rgb (linear / HDR), alpha
    attribute vec2 iP;   // rotation, variant (atlas tile | 0 flash / 1 ring)
    varying vec2 vUv; varying vec2 vQ; varying vec4 vC; varying float vVar; varying float vDepth;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(iA.xyz, 1.0);
      float c = cos(iP.x), s = sin(iP.x);
      vQ = position.xy * 2.0;
      mvPosition.xy += mat2(c, s, -s, c) * (position.xy * iA.w);
      float tile = iP.y;
      vUv = (uv * 0.96 + 0.02) * 0.25 + vec2(mod(tile, 4.0), floor(mod(tile, 16.0) / 4.0)) * 0.25;
      vC = iC; vVar = iP.y; vDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
    }`;
  // Sun-shaded smoke / spray: fake spherical normal, warm rim on the sun side, soot core,
  // luminance cap (never reaches the bloom threshold), proximity fade, scene fog.
  const SMOKE_F = LOG_F + `
    uniform sampler2D uTex; uniform vec3 uSunV; uniform vec3 uSunCol; uniform vec3 uAmb;
    uniform vec2 uNear; uniform float uCap; uniform vec3 uRim; uniform float uLift; uniform float uDesat;
    varying vec2 vUv; varying vec2 vQ; varying vec4 vC; varying float vVar; varying float vDepth;
    void main() {
      #include <logdepthbuf_fragment>
      vec4 tex = texture2D(uTex, vUv);
      float a = tex.a * vC.a * smoothstep(uNear.x, uNear.y, vDepth);
      if (a < 0.04) discard;
      float r2 = min(dot(vQ, vQ), 1.0);
      vec2 tn = (tex.rg * 2.0 - 1.0) * 1.35;
      vec3 n = normalize(vec3(vQ * 0.65 + tn, sqrt(1.0 - r2) + 0.45));
      float wrap = clamp((dot(n, uSunV) + 0.35) / 1.35, 0.0, 1.0);
      // vC is the authored display tone (e.g. #1c2024 core -> #343b42): lift it to an albedo
      // that lands on those tones under the scene light, soot-dark in the shadowed core.
      float dens = tex.b;
      vec3 base = vC.rgb * uLift * mix(1.18, 0.76, dens);
      vec3 col = base * (uAmb * 2.2 + uSunCol * wrap * 1.3) + uRim * uSunCol * pow(wrap, 2.5) * (0.20 + 0.28 * (1.0 - dens));
      // Looking toward the sun: forward-scattered silver-grey fringe on the thin edges.
      col += uRim * uSunCol * pow(max(0.0, -uSunV.z), 2.0) * pow(1.0 - dens, 2.0) * 0.58;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(lum), uDesat);                  // spray: neutral white, not sky-blue
      if (lum > uCap) col *= uCap / lum;
      gl_FragColor = vec4(col, a);
      #include <fog_fragment>
    }`;
  // Fireball: emissive blackbody colour carried in iC (HDR early), normal blending so it
  // turns into opaque charcoal as it cools.
  const FIRE_F = LOG_F + `
    uniform sampler2D uTex;
    varying vec2 vUv; varying vec2 vQ; varying vec4 vC; varying float vVar; varying float vDepth;
    void main() {
      #include <logdepthbuf_fragment>
      vec4 tex = texture2D(uTex, vUv);
      float t = tex.b;
      float a = pow(tex.a, 1.2) * vC.a * smoothstep(4.0, 16.0, vDepth);
      if (a < 0.04) discard;
      // Dense billow cores glow hotter, thin edges cool toward soot (no flat discs).
      vec3 col = mix(vec3(0.018, 0.018, 0.02), vC.rgb * 1.4, smoothstep(0.10, 0.78, t));
      gl_FragColor = vec4(col, a);
      #include <fog_fragment>
    }`;
  // Additive flash core (variant 0) and pressure ring (variant 1).
  const ADD_F = LOG_F + `
    varying vec2 vUv; varying vec2 vQ; varying vec4 vC; varying float vVar; varying float vDepth;
    void main() {
      #include <logdepthbuf_fragment>
      float r = length(vQ);
      float rs = (r - 0.86) / 0.07;
      float k = vVar < 0.5 ? exp(-r * r * 5.0) * (1.0 - smoothstep(0.8, 1.0, r))
                           : exp(-rs * rs) * (0.75 + 0.25 * sin(atan(vQ.y, vQ.x) * 9.0 + r * 20.0));
      gl_FragColor = vec4(vC.rgb * vC.a * k, 1.0);
    }`;
  class Pool {
    constructor(max, frag, { blending = THREE.NormalBlending, order = 8, uniforms = {}, fog = true } = {}) {
      this.max = max; this.next = 0; this.live = 0;
      this.it = Array.from({ length: max }, () => ({ on: false, t: 0, life: 1, delay: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        s0: 1, s1: 1, rot: 0, spin: 0, v: 0, drag: 0, grav: 0, rise: 0, kind: 0, a: 1, r: 1, g: 1, b: 1, seed: 0 }));
      const q = new THREE.PlaneGeometry(1, 1);
      const g = new THREE.InstancedBufferGeometry();
      g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
      this.A = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
      this.Cc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
      this.P = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iA', this.A); g.setAttribute('iC', this.Cc); g.setAttribute('iP', this.P);
      g.instanceCount = max;
      this.mat = new THREE.ShaderMaterial({ uniforms: Object.assign(fogU(), uniforms), vertexShader: BB_V, fragmentShader: frag,
        transparent: true, depthWrite: false, blending, fog, toneMapped: blending !== THREE.AdditiveBlending });
      this.mesh = new THREE.Mesh(g, this.mat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = order; this.mesh.visible = false;
      this.mesh.castShadow = false; this.mesh.receiveShadow = false;
      scene.add(this.mesh);
    }
    take() { const o = this.it[this.next]; this.next = (this.next + 1) % this.max; o.on = true; o.t = 0; o.delay = 0; o.drag = 0; o.grav = 0; o.rise = 0; o.spin = 0; o.vx = o.vy = o.vz = 0; return o; }
    clear() { for (const o of this.it) o.on = false; }
  }
  const NEAR_SMOKE = new THREE.Vector2(12, 45);
  const smokeU = (cap, rim, lift, near = NEAR_SMOKE, desat = 0) => ({ uTex: U.uTex, uSunV: U.uSunV, uSunCol: U.uSunCol, uAmb: U.uAmb, uNear: { value: near },
    uCap: { value: cap }, uRim: { value: rim }, uLift: { value: lift }, uDesat: { value: desat } });
  const hang = new Pool(110, SMOKE_F, { order: 7, uniforms: smokeU(0.42, C(0x8a8378), 2.4, NEAR_SMOKE, 0.45) });
  const trail = new Pool(512, SMOKE_F, { order: 7, uniforms: smokeU(0.45, C(0x7a746c), 2.0, new THREE.Vector2(3, 12), 0.45) });
  const spray = new Pool(160, SMOKE_F, { order: 7, uniforms: smokeU(0.86, C(0xffffff), 2.3, new THREE.Vector2(8, 30), 0.6) });
  const fireP = new Pool(80, FIRE_F, { order: 8, uniforms: { uTex: U.uTex } });
  const add = new Pool(48, ADD_F, { blending: THREE.AdditiveBlending, order: 9, fog: false });

  /* ------------------------------------------------------------ spark streaks */
  const SPARK_V = '#include <common>\n#include <logdepthbuf_pars_vertex>\n' + `
    attribute vec4 iS; attribute vec4 iE;            // tail xyz + width, head xyz + intensity
    varying float vT; varying float vX; varying float vI;
    void main() {
      float t = position.y + 0.5;
      vec3 p = mix(iS.xyz, iE.xyz, t);
      vec3 dir = iE.xyz - iS.xyz;
      vec3 side = normalize(cross(dir + vec3(1e-4, 0.0, 0.0), cameraPosition - p));
      p += side * position.x * iS.w;
      vT = t; vX = position.x * 2.0; vI = iE.w;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      #include <logdepthbuf_vertex>
    }`;
  const SPARK_F = '#include <logdepthbuf_pars_fragment>\n' + `
    uniform vec3 uCol; varying float vT; varying float vX; varying float vI;
    void main() {
      #include <logdepthbuf_fragment>
      float k = (1.0 - vX * vX) * (0.25 + 0.75 * vT);
      gl_FragColor = vec4(uCol * vI * k, 1.0);
    }`;
  const SPARK_N = 200;
  const sparks = (() => {
    const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    const S = new THREE.InstancedBufferAttribute(new Float32Array(SPARK_N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const E = new THREE.InstancedBufferAttribute(new Float32Array(SPARK_N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iS', S); g.setAttribute('iE', E); g.instanceCount = SPARK_N;
    const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Vector3(2.8, 1.7, 0.7) } }, vertexShader: SPARK_V, fragmentShader: SPARK_F,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.visible = false; scene.add(mesh);
    const it = Array.from({ length: SPARK_N }, () => ({ on: false, t: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, k: 1 }));
    return { mesh, S, E, it, next: 0, live: 0 };
  })();

  /* ------------------------------------------------------------- foam rings */
  const FOAM_N = 8;
  const foam = (() => {
    const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = q.index; g.setAttribute('position', q.attributes.position);
    const A = new THREE.InstancedBufferAttribute(new Float32Array(FOAM_N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const Al = new THREE.InstancedBufferAttribute(new Float32Array(FOAM_N), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', A); g.setAttribute('iAl', Al); g.instanceCount = FOAM_N;
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), { uSunCol: U.uSunCol, uAmb: U.uAmb }),
      vertexShader: LOG_V + `
        attribute vec4 iA; attribute float iAl; varying vec2 vQ; varying float vAl;
        void main() {
          vQ = position.xy * 2.0; vAl = iAl;
          vec4 mvPosition = viewMatrix * vec4(iA.xyz + vec3(position.x, 0.0, position.y) * iA.w * 2.0, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: LOG_F + `
        uniform vec3 uSunCol; uniform vec3 uAmb; varying vec2 vQ; varying float vAl;
        void main() {
          #include <logdepthbuf_fragment>
          float r = length(vQ), ang = atan(vQ.y, vQ.x);
          float ring = smoothstep(0.62, 0.86, r) * (1.0 - smoothstep(0.9, 1.0, r));
          float inner = (1.0 - smoothstep(0.0, 0.75, r)) * 0.35;
          float brk = 0.6 + 0.4 * sin(ang * 23.0 + r * 31.0) * sin(ang * 7.0 - r * 13.0);
          float a = (ring * brk + inner) * vAl;
          if (a < 0.04) discard;
          gl_FragColor = vec4(vec3(0.82, 0.87, 0.9) * (uAmb + uSunCol * 0.75), a);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; scene.add(mesh);
    const it = Array.from({ length: FOAM_N }, () => ({ on: false, t: 0, life: 3.5, x: 0, z: 0, r0: 6, r1: 70 }));
    return { mesh, A, Al, it, next: 0, live: 0 };
  })();

  /* ------------------------------------------------------------- debris chunks */
  const DEB_N = 40;
  const debris = (() => {
    const g = new THREE.DodecahedronGeometry(1, 0); g.scale(1.3, 0.55, 0.9);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.75, metalness: 0.35, flatShading: true }), DEB_N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    const it = Array.from({ length: DEB_N }, () => ({ on: false, t: 0, life: 3.5, p: new THREE.Vector3(), v: new THREE.Vector3(),
      q: new THREE.Quaternion(), w: new THREE.Vector3(), s: 1, emit: 0 }));
    return { mesh, it, next: 0, live: 0, wasLive: false, anyOn: false };
  })();

  /* ------------------------------------ refracting blast shockwaves & flash lights */
  const SW_N = 8;
  const swGeo = new THREE.SphereGeometry(1, 24, 16);
  const shockwaves = Array.from({ length: SW_N }, () => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uOp: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uOp; varying vec3 vN; varying vec3 vV;
        void main() {
          float f = abs(dot(normalize(vN), normalize(vV)));
          float rim = smoothstep(0.12, 0.55, 1.0 - f) * (1.0 - smoothstep(0.75, 1.0, 1.0 - f));
          vec2 dir = normalize(vN.xy + vec2(1e-4)) * 0.45;
          gl_FragColor = vec4(0.5 + dir.x, 0.5 + dir.y, 0.0, clamp(uOp * rim, 0.0, 0.85));
        }`,
      transparent: true, depthWrite: false, side: THREE.FrontSide
    });
    const mesh = new THREE.Mesh(swGeo, mat);
    mesh.frustumCulled = false; mesh.visible = false;
    if (distortScene) distortScene.add(mesh);
    return { on: false, t: 0, life: 0.32, r0: 8, r1: 115, mesh, mat };
  });
  let swNext = 0;
  function spawnShockwave(x, y, z, k) {
    if (!distortScene || !cinematic) return;
    const sw = shockwaves[swNext]; swNext = (swNext + 1) % SW_N;
    sw.on = true; sw.t = 0; sw.life = 0.32; sw.r0 = 8 * k; sw.r1 = 115 * k;
    sw.mesh.position.set(x, y, z);
    sw.mesh.scale.setScalar(sw.r0);
    sw.mat.uniforms.uOp.value = 0.85;
    sw.mesh.visible = true;
  }

  const FLASH_N = 4;
  const flashLights = Array.from({ length: FLASH_N }, () => {
    const light = new THREE.PointLight(0xffaa55, 0, 220, 1.6);
    scene.add(light);
    return { on: false, t: 0, life: 0.35, i0: 0, light };
  });
  function pulseLight(x, y, z, r, g, b, intensity = 14, range = 240, life = 0.35) {
    let slot = flashLights[0];
    for (let i = 0; i < FLASH_N; i++) {
      if (!flashLights[i].on) { slot = flashLights[i]; break; }
      if (flashLights[i].light.intensity < slot.light.intensity) slot = flashLights[i];
    }
    slot.on = true; slot.t = 0; slot.life = life; slot.i0 = intensity;
    slot.light.position.set(x, y, z);
    slot.light.color.setRGB(r, g, b);
    slot.light.distance = range;
    slot.light.intensity = intensity;
  }

  const SHAKE_N = 6;
  const shakes = Array.from({ length: SHAKE_N }, () => ({ on: false, t: 0, life: 0.45, x: 0, y: 0, z: 0, mag: 0 }));
  let shakeNext = 0;
  function addShake(x, y, z, mag) {
    const sh = shakes[shakeNext]; shakeNext = (shakeNext + 1) % SHAKE_N;
    sh.on = true; sh.t = 0; sh.life = 0.45; sh.x = x; sh.y = y; sh.z = z; sh.mag = mag;
  }
  function shakeAt(camPos) {
    if (!cinematic) return 0;
    let sum = 0;
    for (let i = 0; i < SHAKE_N; i++) {
      const sh = shakes[i];
      if (!sh.on) continue;
      const d = Math.hypot(sh.x - camPos.x, sh.y - camPos.y, sh.z - camPos.z);
      if (d > 1400) continue;
      const fall = 1 - Math.min(1, d / 1400);
      const env = Math.max(0, 1 - sh.t / sh.life);
      sum += sh.mag * fall * fall * env * env;
    }
    return Math.min(1, sum);
  }

  /* ------------------------------------------------------------ colour ramps */
  const HOT = new THREE.Color(2.2, 1.05, 0.25), ORANGE = C(0xff5a12), EMBER = C(0x7a1c08), CHAR = C(0x1e2023);
  const SOOT0 = C(0x1c2024), SOOT1 = C(0x343b42), EARTH = C(0x6e604e), SPRAY = C(0xdce4ea);
  const FLASH = new THREE.Color(3.2, 2.5, 1.4), RINGC = new THREE.Color(0.62, 0.66, 0.72);
  const _c = new THREE.Color(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _nrm = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler();
  const ZERO_V = new THREE.Vector3();
  const stats = { detonations: 0, byKind: { air: 0, ground: 0, ship: 0, water: 0, small: 0 }, last: null };

  function surfaceNormal(x, z, out) {
    const e = 6;
    const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z), hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  function rndDir(out, upBias = 0) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    return out.set(Math.cos(a) * r, u + upBias, Math.sin(a) * r).normalize();
  }

  /* ------------------------------------------------------------- layer spawns */
  function flash(x, y, z, k, warm = 1) {
    const o = add.take(); o.kind = 0; o.life = 0.32; o.x = x; o.y = y; o.z = z; o.s0 = 10 * k; o.s1 = 26 * k; o.v = 0; o.rot = rand() * 6.28;
    o.r = FLASH.r; o.g = FLASH.g * (0.9 + 0.1 * warm); o.b = FLASH.b * warm;
  }
  function ring(x, y, z, k) {
    const o = add.take(); o.kind = 1; o.life = 0.28; o.x = x; o.y = y; o.z = z; o.s0 = 12 * k; o.s1 = 90 * k; o.v = 1; o.rot = rand() * 6.28;
  }
  function fireballs(x, y, z, k, n, vel, spreadUp = 0, normal = null) {
    for (let i = 0; i < n; i++) {
      const o = fireP.take();
      rndDir(_v, spreadUp);
      if (normal && _v.dot(normal) < 0) _v.addScaledVector(normal, -2 * _v.dot(normal));   // vent away from the surface
      const sp = (10 + rand() * 18) * k, off = (4 + rand() * 7) * k;
      o.x = x + _v.x * off; o.y = y + _v.y * off; o.z = z + _v.z * off;
      o.vx = _v.x * sp + vel.x * 0.12; o.vy = _v.y * sp + vel.y * 0.12; o.vz = _v.z * sp + vel.z * 0.12;
      o.drag = 2.4; o.rise = 4; o.delay = 0.03 + rand() * 0.1; o.life = 0.75 + rand() * 0.3;
      o.s0 = 8 * k; o.s1 = (26 + rand() * 12) * k; o.rot = rand() * 6.28; o.spin = (rand() - 0.5) * 1.6; o.v = Math.floor(rand() * 16);
      o.a = 0.85 + rand() * 0.3;                                  // per-puff heat jitter
    }
  }
  function sparkBurst(x, y, z, n, vel, normal = null, cone = 0) {
    for (let i = 0; i < n; i++) {
      const s = sparks.it[sparks.next]; sparks.next = (sparks.next + 1) % SPARK_N;
      rndDir(_v);
      if (normal) { _v.multiplyScalar(cone).add(normal).normalize(); }        // directional spray about the normal
      const sp = 90 + rand() * 130;
      s.on = true; s.t = 0; s.life = 0.45 + rand() * 0.4; s.x = x; s.y = y; s.z = z;
      s.vx = _v.x * sp + vel.x * 0.3; s.vy = _v.y * sp + vel.y * 0.3; s.vz = _v.z * sp + vel.z * 0.3; s.k = 0.75 + rand() * 0.25;
    }
  }
  function chunks(x, y, z, n, vel, k, normal = null) {
    debris.anyOn = true;
    for (let i = 0; i < n; i++) {
      const d = debris.it[debris.next]; debris.next = (debris.next + 1) % DEB_N;
      rndDir(_v, normal ? 0 : 0.35);
      if (normal) _v.add(_w.copy(normal).multiplyScalar(1.4)).normalize();
      const sp = (normal ? 25 + rand() * 45 : 40 + rand() * 70);
      d.on = true; d.t = 0; d.life = 3.5; d.emit = 0;
      d.p.set(x, y, z); d.v.copy(_v).multiplyScalar(sp).addScaledVector(vel, 0.55);
      d.q.setFromEuler(_e.set(rand() * 6, rand() * 6, rand() * 6));
      d.w.set((rand() - 0.5) * 9, (rand() - 0.5) * 9, (rand() - 0.5) * 9);
      d.s = (0.9 + rand() * 1.5) * Math.min(1.4, k);
    }
  }
  function soot(x, y, z, n, k, base, life, rise, delay = 0.15, spread = 13) {
    for (let i = 0; i < n; i++) {
      const o = hang.take();
      rndDir(_v, 0.2);
      o.x = x + _v.x * spread * k; o.y = y + _v.y * spread * 0.6 * k; o.z = z + _v.z * spread * k;
      o.vx = _v.x * 7 * k; o.vy = _v.y * 4 * k + rise; o.vz = _v.z * 7 * k;
      o.drag = 0.9; o.rise = 0; o.delay = delay + rand() * 0.25; o.life = life[0] + rand() * (life[1] - life[0]);
      o.s0 = 12 * k; o.s1 = (38 + rand() * 7) * k; o.rot = rand() * 6.28; o.spin = (rand() - 0.5) * 0.12; o.v = Math.floor(rand() * 16);
      _c.copy(base === 'earth' ? EARTH : SOOT0).lerp(SOOT1, rand() * (base === 'earth' ? 0.4 : 1));
      o.r = _c.r; o.g = _c.g; o.b = _c.b; o.a = 0.66 + rand() * 0.14; o.seed = rand() * 6.28; o.kind = rise;
    }
  }
  function geyser(x, z, k) {
    const top = 50 + rand() * 35;                                 // this geyser's apex (m)
    for (let i = 0; i < 24; i++) {                                // vertical white-slate column, filled base -> apex
      const o = spray.take();
      const a = rand() * 6.28, r = rand() * 3.5 * k, h = top * (0.25 + 0.75 * (i / 23));
      o.x = x + Math.cos(a) * r; o.y = 1; o.z = z + Math.sin(a) * r;
      o.vx = Math.cos(a) * (1 + rand() * 3); o.vz = Math.sin(a) * (1 + rand() * 3); o.vy = Math.sqrt(2 * 9.81 * 0.95 * h) * 1.04;
      o.grav = 9.81 * 0.95; o.drag = 0.12; o.delay = rand() * 0.15; o.life = 3.4 + rand() * 1.2;
      o.s0 = (8 + rand() * 4) * k; o.s1 = (26 + rand() * 12) * k; o.rot = rand() * 6.28; o.spin = (rand() - 0.5) * 0.4; o.v = Math.floor(rand() * 16);
      o.r = SPRAY.r; o.g = SPRAY.g; o.b = SPRAY.b; o.a = 0.82;
    }
    for (let i = 0; i < 8; i++) {                                 // low radial mist skirt
      const o = spray.take(), a = rand() * 6.28;
      o.x = x; o.y = 3; o.z = z; o.vx = Math.cos(a) * (18 + rand() * 18) * k; o.vz = Math.sin(a) * (18 + rand() * 18) * k; o.vy = 2 + rand() * 3;
      o.drag = 0.9; o.delay = 0.1; o.life = 3 + rand() * 1.5; o.s0 = 10 * k; o.s1 = 34 * k; o.rot = rand() * 6.28; o.v = Math.floor(rand() * 16);
      o.r = SPRAY.r * 0.92; o.g = SPRAY.g * 0.94; o.b = SPRAY.b * 0.96; o.a = 0.5;
    }
    const f = foam.it[foam.next]; foam.next = (foam.next + 1) % FOAM_N;
    f.on = true; f.t = 0; f.life = 3.6; f.x = x; f.z = z; f.r0 = 6 * k; f.r1 = 70 * k;
  }

  /* ---------------------------------------------------------------- detonate */
  // kind: 'air' | 'ground' | 'ship' | 'water' | undefined (classified from height above
  // the surface: < 14 m over sea -> water, over land -> ground). scale ~ legacy explosion
  // scale (0.45 relight puff .. 3.2 ship kill); vel = the dying airframe's velocity.
  function detonate(pos, scale = 1, opts = {}) {
    const x = pos.x, y = pos.y, z = pos.z;
    const h = terrainHeight(x, z), surf = Math.max(h, 0);
    let kind = opts.kind;
    if (!kind) kind = y - surf < 14 ? (h < 0 ? 'water' : 'ground') : 'air';
    if (kind === 'ground' && h < 0 && y < 3) kind = 'water';
    const small = scale < 0.65 && kind === 'air';
    const vel = opts.vel || ZERO_V;
    const k = Math.min(1.6, Math.max(0.55, Math.sqrt(scale / 1.2)));
    stats.detonations++; stats.byKind[small ? 'small' : kind]++; stats.last = { kind: small ? 'small' : kind, scale: +scale.toFixed(2), t: performance.now() };
    if (kind === 'water') {
      flash(x, 2, z, k * 0.55, 0.8);
      ring(x, 2, z, k * 0.7);
      spawnShockwave(x, 2, z, k * 0.75);
      pulseLight(x, 4, z, 1.0, 0.78, 0.45, 9 * k, 180 * k, 0.25);
      addShake(x, 2, z, 0.65 * k);
      geyser(x, z, Math.min(1.3, k));
      sparkBurst(x, 2, z, 8, ZERO_V, _n.set(0, 1, 0), 0.6);
      return kind;
    }
    if (kind === 'ground' || kind === 'ship') {
      const nrm = kind === 'ship' ? _nrm.set(0, 1, 0) : surfaceNormal(x, z, _nrm);
      const gy = kind === 'ship' ? y : Math.max(y, surf + 1.5);
      const nx = nrm.x, ny = nrm.y, nz = nrm.z;
      flash(x + nx * 2, gy + ny * 2, z + nz * 2, k * 0.9);
      ring(x, gy + 2, z, k * 0.85);
      spawnShockwave(x, gy + 2, z, k * 0.95);
      pulseLight(x + nx * 3, gy + ny * 3 + 2, z + nz * 3, 1.0, 0.62, 0.24, 16 * k, 260 * k, 0.36);
      addShake(x, gy, z, k);
      fireballs(x + nx * 4, gy + ny * 4, z + nz * 4, k * 0.9, 4, ZERO_V, 0, nrm);
      sparkBurst(x + nx, gy + ny, z + nz, 18 + Math.floor(rand() * 6), ZERO_V, nrm, 0.55);
      chunks(x, gy + 1, z, 4, ZERO_V, k, nrm);
      // Upward-venting earth / soot plume lingering ~12 s.
      // Two-tone column: lit earth-dust skirt low, dark soot venting high (reads on dark fields).
      soot(x, gy + 6, z, 4, k * 0.9, kind === 'ship' ? 'soot' : 'earth', [11, 13], 7 + rand() * 4, 0.05, 5);
      soot(x, gy + 10, z, 4, k, 'soot', [11, 13], 18 + rand() * 8, 0.15, 4);
      return kind;
    }
    // Mid-air detonation.
    flash(x, y, z, small ? k * 0.6 : k);
    if (!small) {
      ring(x, y, z, k);
      spawnShockwave(x, y, z, k);
    }
    pulseLight(x, y, z, 1.0, 0.64, 0.26, (small ? 8 : 16) * k, (small ? 140 : 250) * k, small ? 0.22 : 0.35);
    addShake(x, y, z, small ? 0.4 * k : k);
    fireballs(x, y, z, k, small ? 2 : 4 + Math.floor(rand() * 3), vel);
    sparkBurst(x, y, z, small ? 8 : 18 + Math.floor(rand() * 9), vel);
    if (!small) chunks(x, y, z, 4 + Math.floor(rand() * 3), vel, k);
    soot(x, y, z, small ? 3 : 6 + Math.floor(rand() * 4), small ? k * 0.6 : k, 'soot', small ? [6, 8] : [10, 15], 0.6 + rand() * 0.6);
    return kind;
  }

  /* ------------------------------------------------------------------ update */
  const easeOut = f => 1 - (1 - f) * (1 - f) * (1 - f);
  function writeDead(p, i) { p.A.array[i * 4 + 3] = 0; p.Cc.array[i * 4 + 3] = 0; }
  function stepPool(p, dt, shade) {
    let live = 0;
    const A = p.A.array, Cc = p.Cc.array, P = p.P.array;
    for (let i = 0; i < p.max; i++) {
      const o = p.it[i];
      if (!o.on) { writeDead(p, i); continue; }
      if (o.delay > 0) { o.delay -= dt; writeDead(p, i); live++; continue; }
      o.t += dt;
      if (o.t >= o.life) { o.on = false; writeDead(p, i); continue; }
      live++;
      const dr = Math.max(0, 1 - o.drag * dt);
      o.vx *= dr; o.vz *= dr; o.vy = o.vy * dr + (o.rise - o.grav) * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      o.rot += o.spin * dt;
      const f = o.t / o.life;
      shade(o, f, dt);
      A[i * 4] = o.x; A[i * 4 + 1] = o.y; A[i * 4 + 2] = o.z; A[i * 4 + 3] = o.size;
      Cc[i * 4] = o.cr; Cc[i * 4 + 1] = o.cg; Cc[i * 4 + 2] = o.cb; Cc[i * 4 + 3] = o.ca;
      P[i * 2] = o.rot; P[i * 2 + 1] = o.v;
    }
    p.live = live;
    p.mesh.visible = live > 0;
    if (live > 0 || p.wasLive) { p.A.needsUpdate = true; p.Cc.needsUpdate = true; p.P.needsUpdate = true; }
    p.wasLive = live > 0;
  }
  // Hanging soot: brisk 12 -> 45 m expansion (1.4 s ease-out) then a slow billow; drifts with
  // the wind, rises gently; fades in over 0.25 s and out over the last 35 %.
  const shadeHang = (o, f) => {
    const g = easeOut(Math.min(1, o.t / 1.4));
    o.size = (o.s0 + (o.s1 - o.s0) * g) * (1 + 0.22 * f) * (1 + 0.04 * Math.sin(o.t * 0.9 + o.seed));
    // After the burst: relax toward the wind; venting ground plumes keep climbing (3.5 m/s), air smoke billows up gently.
    if (o.t > 1.2) { o.vx += (WIND.x - o.vx) * 0.004; o.vz += (WIND.z - o.vz) * 0.004; o.vy += ((o.kind > 12 ? 3.5 : o.kind > 3 ? 1.6 : 0.8) - o.vy) * 0.01; }
    o.cr = o.r; o.cg = o.g; o.cb = o.b;
    o.ca = o.a * Math.min(1, o.t / 0.25) * (1 - Math.max(0, (f - 0.65) / 0.35));
  };
  const shadeTrail = (o, f) => {
    o.size = o.s0 + (o.s1 - o.s0) * Math.sqrt(f);
    const e = Math.min(1, o.t / 0.22);                          // ember -> charcoal
    o.cr = 1.25 * (1 - e) + CHAR.r * e; o.cg = 0.42 * (1 - e) + CHAR.g * e; o.cb = 0.1 * (1 - e) + CHAR.b * e;
    o.ca = o.a * (1 - f) * (1 - f);
  };
  const shadeSpray = (o, f) => {
    o.size = o.s0 + (o.s1 - o.s0) * Math.sqrt(f);
    o.cr = o.r; o.cg = o.g; o.cb = o.b;
    o.ca = o.a * Math.min(1, o.t / 0.12) * (1 - Math.max(0, (f - 0.55) / 0.45));
    if (o.y < 0.5) { o.y = 0.5; o.vy = Math.max(0, o.vy); }
  };
  const shadeFire = (o, f) => {
    o.size = o.s0 + (o.s1 - o.s0) * easeOut(f);
    // HDR -> #ff5a12 by 22 %, -> #7a1c08 by 50 %, -> charcoal by 80 % (edges sooty in the shader).
    if (f < 0.22) _c.copy(HOT).lerp(ORANGE, f / 0.22);
    else if (f < 0.5) _c.copy(ORANGE).lerp(EMBER, (f - 0.22) / 0.28);
    else _c.copy(EMBER).lerp(CHAR, Math.min(1, (f - 0.5) / 0.3));
    const heat = f < 0.5 ? o.a : 1;
    o.cr = _c.r * heat; o.cg = _c.g * heat; o.cb = _c.b * heat;
    o.ca = 0.95 * Math.min(1, o.t / 0.04) * (1 - Math.max(0, (f - 0.6) / 0.4));
  };
  // Flash: full HDR for 0.10 s, below the bloom threshold by 0.14 s, gone at 0.32 s.
  // Ring: 12 -> 90 m over 0.28 s (ease-out), alpha (1 - f)^1.5 x 0.55.
  const shadeAdd = (o, f) => {
    if (o.v === 0) {
      o.size = o.s0 + (o.s1 - o.s0) * easeOut(Math.min(1, o.t / 0.14));
      const k = o.t < 0.1 ? 1 : o.t < 0.14 ? 1 - 0.67 * (o.t - 0.1) / 0.04 : 0.33 * (1 - (o.t - 0.14) / 0.18);
      o.cr = o.r; o.cg = o.g; o.cb = o.b; o.ca = Math.max(0, k);
    } else {
      o.size = (o.s0 + (o.s1 - o.s0) * easeOut(f)) * 2 / 0.93;
      o.cr = RINGC.r; o.cg = RINGC.g; o.cb = RINGC.b; o.ca = Math.pow(1 - f, 1.5) * 0.55;
    }
  };

  function stepSparks(dt) {
    const S = sparks.S.array, E = sparks.E.array, cam = camera.position;
    let live = 0;
    for (let i = 0; i < SPARK_N; i++) {
      const s = sparks.it[i];
      if (!s.on) { E[i * 4 + 3] = 0; S[i * 4 + 3] = 0; continue; }
      s.t += dt;
      if (s.t >= s.life) { s.on = false; E[i * 4 + 3] = 0; S[i * 4 + 3] = 0; continue; }
      live++;
      const dr = Math.max(0, 1 - 1.3 * dt);
      s.vx *= dr; s.vz *= dr; s.vy = s.vy * dr - 9.81 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      const dist = Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z);
      const L = 0.06;
      S[i * 4] = s.x - s.vx * L; S[i * 4 + 1] = s.y - s.vy * L; S[i * 4 + 2] = s.z - s.vz * L; S[i * 4 + 3] = Math.max(0.35, dist * 0.0022);
      E[i * 4] = s.x; E[i * 4 + 1] = s.y; E[i * 4 + 2] = s.z;
      E[i * 4 + 3] = s.k * Math.exp(-s.t * 4.5) * (1 - s.t / s.life);
    }
    sparks.live = live; sparks.mesh.visible = live > 0;
    if (live > 0 || sparks.wasLive) { sparks.S.needsUpdate = true; sparks.E.needsUpdate = true; }
    sparks.wasLive = live > 0;
  }
  function stepFoam(dt) {
    const A = foam.A.array, Al = foam.Al.array;
    let live = 0;
    for (let i = 0; i < FOAM_N; i++) {
      const f = foam.it[i];
      if (!f.on) { Al[i] = 0; A[i * 4 + 3] = 0; continue; }
      f.t += dt;
      if (f.t >= f.life) { f.on = false; Al[i] = 0; A[i * 4 + 3] = 0; continue; }
      live++;
      const u = f.t / f.life;
      A[i * 4] = f.x; A[i * 4 + 1] = 0.4; A[i * 4 + 2] = f.z; A[i * 4 + 3] = f.r0 + (f.r1 - f.r0) * easeOut(u);
      Al[i] = Math.min(1, f.t / 0.2) * (1 - u) * 0.85;
    }
    foam.live = live; foam.mesh.visible = live > 0;
    if (live > 0 || foam.wasLive) { foam.A.needsUpdate = true; foam.Al.needsUpdate = true; }
    foam.wasLive = live > 0;
  }
  function stepDebris(dt) {
    if (!debris.anyOn && !debris.wasLive) return;
    let live = 0;
    for (let i = 0; i < DEB_N; i++) {
      const d = debris.it[i];
      if (!d.on) { _m.makeScale(0, 0, 0); debris.mesh.setMatrixAt(i, _m); continue; }
      d.t += dt;
      const ground = Math.max(terrainHeight(d.p.x, d.p.z), 0);
      if (d.t >= d.life || d.p.y <= ground + 0.5) {
        if (d.t < d.life && d.p.y <= ground + 0.5) {          // impact: a puff of spray or dust where it lands
          const o = (ground <= 0 ? spray : trail).take();
          o.x = d.p.x; o.y = ground + 2; o.z = d.p.z; o.vy = ground <= 0 ? 12 : 4; o.grav = ground <= 0 ? 9 : 0; o.drag = 0.8;
          o.life = 1.6; o.s0 = 4; o.s1 = 14; o.rot = rand() * 6.28; o.v = Math.floor(rand() * 16); o.a = 0.6;
          o.r = SPRAY.r; o.g = SPRAY.g; o.b = SPRAY.b;
        }
        d.on = false; _m.makeScale(0, 0, 0); debris.mesh.setMatrixAt(i, _m); continue;
      }
      live++;
      d.v.multiplyScalar(Math.max(0, 1 - 0.22 * dt)); d.v.y -= 9.81 * dt;
      d.p.addScaledVector(d.v, dt);
      _q.setFromAxisAngle(_v.copy(d.w).normalize(), d.w.length() * dt); d.q.premultiply(_q);
      _m.compose(d.p, d.q, _s.setScalar(d.s)); debris.mesh.setMatrixAt(i, _m);
      // Burning trail: a thin ember -> charcoal ribbon of small puffs every 60 ms.
      d.emit -= dt;
      if (d.emit <= 0 && d.t < 3.1) {
        d.emit = 0.06;
        const o = trail.take();
        o.x = d.p.x; o.y = d.p.y; o.z = d.p.z; o.vx = d.v.x * 0.05; o.vy = d.v.y * 0.05 + 1; o.vz = d.v.z * 0.05; o.drag = 1.2;
        o.life = 1.2 + rand() * 0.4; o.s0 = 1.6 * d.s; o.s1 = (5 + rand() * 2) * d.s; o.rot = rand() * 6.28; o.v = Math.floor(rand() * 16);
        o.a = 0.7 * (1 - d.t / 3.5);
      }
    }
    debris.live = live; debris.anyOn = live > 0; debris.mesh.visible = live > 0;
    if (live > 0 || debris.wasLive) debris.mesh.instanceMatrix.needsUpdate = true;
    debris.wasLive = live > 0;
  }

  function update(dt) {
    // Light from the scene: view-space sun, key colour x intensity, hemisphere ambient.
    U.uSunV.value.copy(SUN).transformDirection(camera.matrixWorldInverse);
    if (env.sunLight) U.uSunCol.value.copy(env.sunLight.color).multiplyScalar(env.sunLight.intensity / 3.4);
    if (env.hemiLight) U.uAmb.value.copy(env.hemiLight.color).multiplyScalar(env.hemiLight.intensity * 0.33);
    stepPool(hang, dt, shadeHang);
    stepPool(trail, dt, shadeTrail);
    stepPool(spray, dt, shadeSpray);
    stepPool(fireP, dt, shadeFire);
    stepPool(add, dt, shadeAdd);
    stepSparks(dt);
    stepFoam(dt);
    stepDebris(dt);
    for (let i = 0; i < SW_N; i++) {
      const sw = shockwaves[i];
      if (!sw.on) continue;
      sw.t += dt;
      if (sw.t >= sw.life || !cinematic) { sw.on = false; sw.mesh.visible = false; continue; }
      const f = sw.t / sw.life;
      sw.mesh.scale.setScalar(sw.r0 + (sw.r1 - sw.r0) * easeOut(f));
      sw.mat.uniforms.uOp.value = 0.85 * Math.pow(1 - f, 1.7);
    }
    for (let i = 0; i < FLASH_N; i++) {
      const fl = flashLights[i];
      if (!fl.on) continue;
      fl.t += dt;
      if (fl.t >= fl.life) { fl.on = false; fl.light.intensity = 0; continue; }
      fl.light.intensity = fl.i0 * Math.exp(-fl.t / (fl.life * 0.28)) * (1 - fl.t / fl.life);
    }
    for (let i = 0; i < SHAKE_N; i++) {
      const sh = shakes[i];
      if (!sh.on) continue;
      sh.t += dt;
      if (sh.t >= sh.life) sh.on = false;
    }
  }
  function clear() {
    for (const p of [hang, trail, spray, fireP, add]) p.clear();
    for (const s of sparks.it) s.on = false;
    for (const f of foam.it) f.on = false;
    for (const d of debris.it) d.on = false;
    for (const sw of shockwaves) { sw.on = false; sw.mesh.visible = false; }
    for (const fl of flashLights) { fl.on = false; fl.light.intensity = 0; }
    for (const sh of shakes) sh.on = false;
    debris.anyOn = false; debris.live = 0;
  }
  // Warm-up: make every pool visible once so its program compiles with the rest.
  function warm(on) { for (const m of [hang.mesh, trail.mesh, spray.mesh, fireP.mesh, add.mesh, sparks.mesh, foam.mesh, debris.mesh]) m.visible = !!on; }

  return {
    detonate, update, clear, warm, pulseLight, shakeAt,
    setCinematic(on) { cinematic = !!on; if (!cinematic) for (const sw of shockwaves) { sw.on = false; sw.mesh.visible = false; } },
    get cinematic() { return cinematic; },
    get stats() {
      return { ...stats, byKind: { ...stats.byKind }, live: { smoke: hang.live, trail: trail.live, spray: spray.live, fire: fireP.live, flash: add.live,
        sparks: sparks.live, debris: debris.live, foam: foam.live },
        pools: { smoke: 110, trail: 512, spray: 160, fire: 80, flash: 48, sparks: SPARK_N, debris: DEB_N, foam: FOAM_N } };
    },
    // Peak HDR luminance currently emitted by the blast layers (bloom check).
    get glow() {
      let flash = 0, fire = 0, spark = 0;
      for (const o of add.it) if (o.on && o.delay <= 0 && o.v === 0) flash = Math.max(flash, o.ca * (0.2126 * o.r + 0.7152 * o.g + 0.0722 * o.b));
      for (const o of fireP.it) if (o.on && o.delay <= 0 && o.cr !== undefined) fire = Math.max(fire, 0.2126 * o.cr + 0.7152 * o.cg + 0.0722 * o.cb);
      for (const s of sparks.it) if (s.on) spark = Math.max(spark, s.k * Math.exp(-s.t * 4.5) * (1 - s.t / s.life) * 1.86);
      return { flash: +flash.toFixed(3), fire: +fire.toFixed(3), spark: +spark.toFixed(3) };
    }
  };
}
