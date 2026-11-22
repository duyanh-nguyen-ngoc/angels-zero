// ANGELS ZERO — flight & atmospheric VFX.
// Afterburner mach diamonds, wingtip contrails, over-wing vapor, supersonic
// speed streaks, Prandtl-Glauert vapor cone, low-level sea spray and hybrid
// clouds: a raymarched volumetric sky deck (9,000-13,000 ft) plus 16 lit 3-D
// cumulus banks (1,800-7,500 ft), with wind drift, weather-driven coverage,
// live sun / preset colouring, zero-pop proximity fade, lightning, a
// cloudDensity() query for gameplay, and a camera mist factor for the
// white-out / fog ramp / canopy fx.

const LOG_V = '#include <common>\n#include <logdepthbuf_pars_vertex>\n';
const LOG_F = '#include <logdepthbuf_pars_fragment>\n';
const FT = 0.3048;

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createVFX(THREE, env) {
  const { scene, camera, jet, renderer, terrainHeight } = env;
  // Debug-only overrides (e.g. ?debug&force=cone,vapor,mist) so stills can show transient effects.
  const force = {};
  for (const k of (env.force || [])) force[k] = true;
  const smooth = THREE.MathUtils.smoothstep;
  const rand = Math.random;

  /* ------------------------------------------------------------ textures */
  function puffTexture(seed, lobes, size = 256) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const r = rng(seed);
    for (let i = 0; i < lobes; i++) {
      const a = r() * Math.PI * 2, d = r() * size * 0.18;
      const x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d, rad = size * (0.16 + r() * 0.2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.42)'); g.addColorStop(0.55, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const vaporTex = puffTexture(91, 9, 128);

  /* ------------------------------------------- afterburner mach diamonds */
  const plumeGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 64, true);
  plumeGeo.rotateX(Math.PI / 2);
  plumeGeo.translate(0, 0, 0.5);                    // z: 0 at the nozzle .. 1 at the tail
  const PLUME_V = LOG_V + `
    uniform float uLen; uniform float uRad; uniform float uDiam; uniform float uTime;
    varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng; varying float vSide;
    void main() {
      float t = position.z;
      vT = t;
      #ifdef CORE
        float r = uRad * mix(1.0, 0.16, t) * (1.0 + 0.30 * (1.0 - t) * cos(t * uDiam * 6.2831853));
      #else
        float r = uRad * (1.0 + 0.75 * t) * (1.0 - 0.45 * smoothstep(0.7, 1.0, t)) * (1.0 + 0.05 * sin(uTime * 37.0 + t * 19.0));
      #endif
      vec4 mv = modelViewMatrix * vec4(position.xy * r, t * uLen, 1.0);
      vN = normalize(normalMatrix * vec3(normal.xy, 0.0));
      vV = -mv.xyz;
      vAng = atan(position.y, position.x);
      // How side-on the plume axis is to the eye (1 = broadside, 0 = looking down the axis).
      vec3 axis = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
      vSide = length(cross(axis, normalize(-mv.xyz)));
      gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`;
  const PLUME_F = LOG_F + `
    uniform float uTime; uniform float uInt; uniform float uDiam; uniform float uAB;
    varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng; varying float vSide;
    void main() {
      #include <logdepthbuf_fragment>
      // Soft limb falloff broadside, uniform glow when viewed down the axis (chase camera).
      float facing = mix(0.62, abs(dot(normalize(vN), normalize(vV))), smoothstep(0.15, 0.6, vSide));
      float t = vT;
      #ifdef CORE
        float shock = pow(0.5 + 0.5 * cos(t * uDiam * 6.2831853), 4.0);
        float osc = 0.78 + 0.22 * sin(uTime * 45.0);
        vec3 col = mix(vec3(0.88, 0.98, 1.0), vec3(0.22, 0.82, 1.0), smoothstep(0.0, 0.7, t));
        float a = pow(facing, 1.6) * pow(1.0 - t, 1.25) * (0.28 + 1.15 * shock * osc) * smoothstep(0.0, 0.04, t);
      #else
        float flick = 0.74 + 0.26 * sin(t * 21.0 - uTime * 33.0 + vAng * 3.0) * sin(uTime * 9.0 + t * 7.0);
        // Bright peach at the nozzle lip -> translucent deep orange-red at the tip;
        // in afterburner the lip goes HDR (> 1) so it carries a little bloom.
        vec3 col = mix(vec3(1.0, 0.74, 0.40), vec3(0.9, 0.24, 0.05), smoothstep(0.0, 0.8, t)) * (1.0 + 0.9 * uAB * (1.0 - smoothstep(0.0, 0.35, t)));
        float a = pow(facing, 2.4) * pow(1.0 - t, 1.7) * smoothstep(0.0, 0.10, t) * flick * 0.55;
      #endif
      #ifdef CORE
        col *= 1.0 + 1.2 * uAB;                                    // shock diamonds go HDR only in afterburner
      #endif
      gl_FragColor = vec4(col, clamp(a * uInt, 0.0, 1.0));
    }`;
  function plumeMaterial(core) {
    return new THREE.ShaderMaterial({
      defines: core ? { CORE: '' } : {},
      uniforms: { uLen: { value: 4 }, uRad: { value: 0.3 }, uDiam: { value: 4 }, uTime: { value: 0 }, uInt: { value: 1 }, uAB: { value: 0 } },
      vertexShader: PLUME_V, fragmentShader: PLUME_F,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
    });
  }
  const coreMat = plumeMaterial(true), outerMat = plumeMaterial(false);
  // Incandescent turbine core (Visual Pass 1): a radial-gradient disc deep inside
  // each nozzle ring. Muted warm orange (<= 0.75 / 0.30 / 0.08, no glare) at
  // idle-MIL; ramps with afterburner to HDR white-peach (2.5 / 1.65 / 1.05) with a
  // 23 / 31 Hz +/-8 % thrust shimmer. toneMapped: false, additive.
  const glowCoreMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0.5, 0.2, 0.05) } },
    vertexShader: LOG_V + `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
    fragmentShader: LOG_F + `uniform vec3 uCol; varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(vUv - 0.5) * 2.0;
        float k = pow(1.0 - smoothstep(0.0, 1.0, r), 1.6);
        gl_FragColor = vec4(uCol * k * (0.75 + 0.25 * (1.0 - r)), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false
  });
  const glowCoreGeo = new THREE.CircleGeometry(0.46, 32);
  const plumes = [];
  function attachPlume(localPos) {
    const g = new THREE.Group();
    g.position.copy(localPos).add(new THREE.Vector3(0, 0, 0.45));
    const outer = new THREE.Mesh(plumeGeo, outerMat);
    const core = new THREE.Mesh(plumeGeo, coreMat);
    const glow = new THREE.Mesh(glowCoreGeo, glowCoreMat);
    glow.position.z = -0.55;                         // inside the nozzle ring, facing aft (+Z)
    outer.frustumCulled = core.frustumCulled = glow.frustumCulled = false;
    outer.renderOrder = 2; core.renderOrder = 3; glow.renderOrder = 2;
    const light = new THREE.PointLight(0xff8a30, 2.5, 26, 2);
    light.position.z = 1.4;
    g.add(outer, core, glow, light);
    jet.add(g);
    plumes.push({ g, light });
  }
  const CORE_COOL = new THREE.Color(0.75, 0.30, 0.08), CORE_HOT = new THREE.Color(2.5, 1.65, 1.05);
  let engineOut = -1;
  function setEngineOut(i) {                         // battle damage: the dead F100's plume + glow go out
    if (i === engineOut) return;
    engineOut = i;
    plumes.forEach((p, k) => { p.g.visible = k !== i; });
  }
  function updatePlumes(s, now) {
    const t = s.throttle, ab = s.afterburner;
    const pulse = 1 + ab * 0.24 * Math.sin(now * 17.0) + ab * 0.08 * Math.sin(now * 41.0);
    const coreLen = 1.5 + 3.2 * t + 4.6 * ab;
    coreMat.uniforms.uLen.value = coreLen;
    coreMat.uniforms.uDiam.value = coreLen / 1.05;
    coreMat.uniforms.uRad.value = 0.30 * (0.85 + 0.15 * t + 0.12 * ab);
    // Dry thrust stays below the 0.92 bloom threshold; burner level drives the HDR glare.
    coreMat.uniforms.uInt.value = ((0.2 + 0.32 * t) * (1 - ab) + 1.25 * ab) * pulse;
    outerMat.uniforms.uLen.value = (2.0 + 4.6 * t + 6.8 * ab) * (1 + 0.04 * Math.sin(now * 23));
    outerMat.uniforms.uRad.value = 0.48 * (0.9 + 0.22 * ab);
    outerMat.uniforms.uInt.value = (0.12 + 0.3 * t + 1.15 * ab) * pulse;
    coreMat.uniforms.uTime.value = outerMat.uniforms.uTime.value = now;
    coreMat.uniforms.uAB.value = outerMat.uniforms.uAB.value = ab;
    // Incandescent core: warm orange scaled by throttle below the burner, HDR white-peach in AB.
    const shimmer = 1 + ab * 0.08 * (0.6 * Math.sin(now * 2 * Math.PI * 23) + 0.4 * Math.sin(now * 2 * Math.PI * 31));
    glowCoreMat.uniforms.uCol.value.copy(CORE_COOL).multiplyScalar(0.4 + 0.6 * t).lerp(CORE_HOT, smooth(ab, 0, 1)).multiplyScalar(shimmer);
    for (const p of plumes) {
      p.light.intensity = (0.8 + t * 2.0 + ab * 6.5) * pulse;
      p.light.color.setRGB(1.0, 0.55 + 0.15 * (1 - ab), 0.25 + 0.35 * (1 - ab));
    }
  }

  /* ------------------------------- continuous world-space vapor ribbons */
  // Each ribbon is a ring buffer of world-space samples (Float32/Float64 arrays,
  // mutated in place -- no per-frame allocation). Sample 0 is "live": it rides
  // the emitter every frame; a new sample is committed once the emitter has
  // moved >= 3.5 m or 16 ms have passed. Every sample keeps the condensation
  // level it was born with, so when the pull eases the existing ribbon detaches
  // and fades out behind the jet instead of vanishing at once. Edges are
  // extruded each frame along cross(tangent, toCamera), so the strip always
  // faces the viewer (chase, cockpit, padlock, free look) and never goes edge-on.
  const RIB_MAX = 96, RIB_STEP = 3.5, RIB_DT = 0.016, RIB_JUMP = 120;
  const RIB_V = LOG_V + `
    attribute float aAlpha;
    uniform vec2 uFar;
    varying float vA; varying vec2 vUv;
    void main() {
      vA = aAlpha; vUv = uv;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vA *= 1.0 - smoothstep(uFar.x, uFar.y, -mv.z);          // thin out into the haze, never pop
      gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`;
  const RIB_F = LOG_F + `
    uniform vec3 uCol; uniform float uWisp; uniform float uTime;
    varying float vA; varying vec2 vUv;
    void main() {
      #include <logdepthbuf_fragment>
      float across = pow(max(sin(vUv.x * 3.14159265), 0.0), 1.6); // soft gaussian-like cross-width falloff
      float a = vA * across;
      // LEX sheets: streaky, broken-up wisps along the flow.
      if (uWisp > 0.0) {
        float w = 0.55 + 0.45 * sin(vUv.x * 19.0 + vUv.y * 7.0 - uTime * 9.0) * sin(vUv.x * 7.0 - vUv.y * 13.0 + uTime * 5.0);
        a *= mix(1.0, w, uWisp);
      }
      gl_FragColor = vec4(min(uCol, vec3(0.85)), a);       // stays under the bloom threshold
    }`;
  class Ribbon {
    constructor({ w0, w1, life, alpha, wisp = 0, step = RIB_STEP, minDt = RIB_DT, far = [1500, 4200] }) {
      this.w0 = w0; this.w1 = w1; this.life = life; this.alphaK = alpha;
      this.step = step; this.minDt = minDt;
      this.live = 0;
      this.px = new Float32Array(RIB_MAX * 3); this.born = new Float64Array(RIB_MAX); this.ba = new Float32Array(RIB_MAX);
      this.head = 0; this.count = 0; this.lastCommit = -1e9;
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(RIB_MAX * 6), 3).setUsage(THREE.DynamicDrawUsage);
      const uv = new THREE.BufferAttribute(new Float32Array(RIB_MAX * 4), 2).setUsage(THREE.DynamicDrawUsage);
      const al = new THREE.BufferAttribute(new Float32Array(RIB_MAX * 2), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pos); geo.setAttribute('uv', uv); geo.setAttribute('aAlpha', al);
      const idx = new Uint16Array((RIB_MAX - 1) * 6);
      for (let i = 0; i < RIB_MAX - 1; i++) { const a = i * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.setDrawRange(0, 0);
      this.geo = geo;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(0xe8eef4) }, uWisp: { value: wisp }, uTime: { value: 0 },
          uFar: { value: new THREE.Vector2(far[0], far[1]) } },
        vertexShader: RIB_V, fragmentShader: RIB_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true
      });
      this.mesh = new THREE.Mesh(geo, this.mat);
      this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
      scene.add(this.mesh);
      this._t = new THREE.Vector3(); this._c = new THREE.Vector3(); this._s = new THREE.Vector3(); this._ps = new THREE.Vector3(0, 1, 0);
    }
    clear() { this.count = 0; this.head = 0; this.lastCommit = -1e9; this.geo.setDrawRange(0, 0); }
    slot(i) { return (this.head - i + RIB_MAX) % RIB_MAX; }   // i = 0 newest
    setSample(k, p, now, a) { const o = k * 3; this.px[o] = p.x; this.px[o + 1] = p.y; this.px[o + 2] = p.z; this.born[k] = now; this.ba[k] = a; }
    push(p, now, a) { this.head = (this.head + 1) % RIB_MAX; this.setSample(this.head, p, now, a); this.count = Math.min(RIB_MAX, this.count + 1); }
    // Feed the emitter's world position and current condensation level once per frame.
    emit(p, a, now) {
      if (this.count === 0) { this.push(p, now, a); this.push(p, now, a); this.lastCommit = now; return; }
      const h = this.head * 3, px = this.px;
      const dx = p.x - px[h], dy = p.y - px[h + 1], dz = p.z - px[h + 2];
      if (dx * dx + dy * dy + dz * dz > RIB_JUMP * RIB_JUMP) { this.clear(); this.push(p, now, a); this.push(p, now, a); this.lastCommit = now; return; }
      // Distance from the last committed sample (slot 1) decides whether the live head is frozen.
      const k1 = this.slot(1) * 3;
      const ex = p.x - px[k1], ey = p.y - px[k1 + 1], ez = p.z - px[k1 + 2];
      if (ex * ex + ey * ey + ez * ez >= this.step * this.step || now - this.lastCommit >= this.minDt) { this.push(p, now, a); this.lastCommit = now; }
      else this.setSample(this.head, p, now, a);          // live head rides the emitter
    }
    update(camPos, now) {
      const n = this.count, px = this.px;
      const pos = this.geo.attributes.position.array, uv = this.geo.attributes.uv.array, al = this.geo.attributes.aAlpha.array;
      this.mat.uniforms.uTime.value = now;
      let live = 0;
      for (let i = 0; i < n; i++) {
        const k = this.slot(i), o = k * 3;
        const age = Math.min(1, Math.max(0, (now - this.born[k]) / this.life));
        // Tangent from the neighbouring samples (central difference, one-sided at the ends).
        const ka = this.slot(Math.max(0, i - 1)) * 3, kb = this.slot(Math.min(n - 1, i + 1)) * 3;
        const t = this._t.set(px[ka] - px[kb], px[ka + 1] - px[kb + 1], px[ka + 2] - px[kb + 2]);
        const c = this._c.set(camPos.x - px[o], camPos.y - px[o + 1], camPos.z - px[o + 2]);
        const s = this._s.crossVectors(t, c);
        if (s.lengthSq() < 1e-8) s.copy(this._ps); else { s.normalize(); this._ps.copy(s); }
        const hw = 0.5 * (this.w0 + (this.w1 - this.w0) * Math.sqrt(age));
        const v = i * 6, w = i * 4, q = i * 2;
        pos[v] = px[o] + s.x * hw; pos[v + 1] = px[o + 1] + s.y * hw; pos[v + 2] = px[o + 2] + s.z * hw;
        pos[v + 3] = px[o] - s.x * hw; pos[v + 4] = px[o + 1] - s.y * hw; pos[v + 5] = px[o + 2] - s.z * hw;
        const along = n > 1 ? i / (n - 1) : 0;
        uv[w] = 0; uv[w + 1] = along; uv[w + 2] = 1; uv[w + 3] = along;
        // Birth level x lengthwise dissipation x soft root (emerges from the tip) x soft tail (never truncated).
        const root = Math.min(1, i / 2.5), tail = Math.min(1, (n - 1 - i) / 10);
        const a = this.ba[k] * Math.pow(1 - age, 1.5) * root * tail * this.alphaK;
        al[q] = al[q + 1] = a;
        if (a > 0.002) live++;
      }
      this.live = live;
      this.geo.setDrawRange(0, n > 1 ? (n - 1) * 6 : 0);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.uv.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.mesh.visible = live > 0;
    }
  }
  // Wingtip vortex cores: 0.14 m at the tip -> 0.65 m diffused, ~2.1 s dissipation.
  const trailL = new Ribbon({ w0: 0.14, w1: 0.65, life: 2.1, alpha: 0.78 });
  const trailR = new Ribbon({ w0: 0.14, w1: 0.65, life: 2.1, alpha: 0.78 });
  // LEX / wing-root overwing sheets: broad, streaky, short-lived (hard pulls & PSMs only).
  const lexL = new Ribbon({ w0: 0.7, w1: 2.4, life: 0.75, alpha: 0.34, wisp: 0.85 });
  const lexR = new Ribbon({ w0: 0.7, w1: 2.4, life: 0.75, alpha: 0.34, wisp: 0.85 });
  const ribbons = [trailL, trailR, lexL, lexR];
  const tipL = new THREE.Vector3(-6.6, -0.6, 4.0), tipR = new THREE.Vector3(6.6, -0.6, 4.0);
  const lexPL = new THREE.Vector3(-2.05, 0.05, -0.9), lexPR = new THREE.Vector3(2.05, 0.05, -0.9);
  const RIB_DAY = new THREE.Color(0xe8eef4), RIB_OVC = new THREE.Color(0xbfc7cf), _ribCol = new THREE.Color();
  let vaporTarget = 0, lexTarget = 0;

  // High-altitude engine contrails: 2 nozzles x (lead + WARDEN-2/3 + CRIMSON-1/2).
  // 22 m / 0.09 s sampling => the 96-sample ring covers ~9 s of trail.
  const CONTRAIL_N = 10;
  // Low-altitude sea-skim rooster tail + foam wake (all buffers allocated once).
  const SPRAY_N = 180, SPRAY_ALT = 35, SPRAY_DENSE = 15, SPRAY_KT = 120;
  const SPRAY_LIFE_MIN = 1.2, SPRAY_LIFE_MAX = 1.8, SPRAY_RATE_MAX = 140, SPRAY_Y = 0.5;
  const WAKE_N = 48, WAKE_Y = 0.15, WAKE_STEP_M = 12, WAKE_LIFE = 3.0;
  const NOZ = [new THREE.Vector3(-0.62, -0.05, 9.0), new THREE.Vector3(0.62, -0.05, 9.0)];
  const _noz = [NOZ[0], NOZ[1]];
  const _cw = new THREE.Vector3();
  const CONTRAIL_COL = new THREE.Color(0xeef2f6), _ctCol = new THREE.Color();
  const contrails = Array.from({ length: CONTRAIL_N }, () => new Ribbon({ w0: 0.6, w1: 6.5, life: 9, alpha: 0.6,
    step: 22, minDt: 0.09, far: [5000, 16000] }));
  const contrailStats = { active: 0, live: 0 };
  function updateContrails(emitters, now) {
    if (plumes.length >= 2) { _noz[0] = plumes[0].g.position; _noz[1] = plumes[1].g.position; }
    _ctCol.copy(CONTRAIL_COL).multiply(vaporTint);
    let active = 0, live = 0;
    const n = Math.min(5, emitters.length);
    for (let j = 0; j < n; j++) {
      const e = emitters[j], a = e.on ? smooth(e.pos.y, 3505, 3810) : 0;
      if (a > 0) active++;
      for (let k = 0; k < 2; k++) {
        const r = contrails[j * 2 + k];
        r.mat.uniforms.uCol.value.copy(_ctCol);
        r.emit(_cw.copy(_noz[k]).applyQuaternion(e.quat).add(e.pos), a * 0.9, now);
        r.update(camera.position, now);
        live += r.live;
      }
    }
    for (let j = n; j < 5; j++) for (let k = 0; k < 2; k++) contrails[j * 2 + k].clear();
    contrailStats.active = active; contrailStats.live = live;
  }

  /* ------------------------------------------------ over-wing vapor clouds */
  // High-AoA condensation: wispy sheets over the inner wing roots and the
  // fuselage strakes (LERX-like blend ahead of the root). Each puff streams aft
  // along its lane (turbulent drift) and recycles at the lane's front, so the
  // sheet appears anchored to the airframe while flowing backward.
  const VP = 42;
  const vapor = [];
  const vaporTint = new THREE.Color(1, 1, 1);
  const vpPos = new Float32Array(VP * 3), vpAlpha = new Float32Array(VP), vpSize = new Float32Array(VP), vpRot = new Float32Array(VP);
  const vpGeo = new THREE.BufferGeometry();
  vpGeo.setAttribute('position', new THREE.BufferAttribute(vpPos, 3).setUsage(THREE.DynamicDrawUsage));
  vpGeo.setAttribute('aAlpha', new THREE.BufferAttribute(vpAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  vpGeo.setAttribute('aSize', new THREE.BufferAttribute(vpSize, 1).setUsage(THREE.DynamicDrawUsage));
  vpGeo.setAttribute('aRot', new THREE.BufferAttribute(vpRot, 1));
  const vpMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTex: { value: vaporTex }, uCol: { value: new THREE.Color(1, 1, 1) }, uScale: { value: 400 }
    }]),
    vertexShader: LOG_V + `#include <fog_pars_vertex>
      attribute float aAlpha; attribute float aSize; attribute float aRot;
      uniform float uScale; varying float vA; varying float vRot;
      void main() {
        vA = aAlpha; vRot = aRot;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(1.0, -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: LOG_F + `#include <fog_pars_fragment>
      uniform sampler2D uTex; uniform vec3 uCol; varying float vA; varying float vRot;
      void main() {
        #include <logdepthbuf_fragment>
        if (vA < 0.003) discard;
        vec2 p = gl_PointCoord - 0.5;
        float r2 = dot(p, p);
        if (r2 > 0.25) discard;
        float c = cos(vRot), s = sin(vRot);
        vec2 uv = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + 0.5;
        vec4 t = texture2D(uTex, vec2(uv.x, 1.0 - uv.y));
        float edge = 1.0 - smoothstep(0.16, 0.25, r2);
        gl_FragColor = vec4(uCol * t.rgb, t.a * vA * edge);
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true
  });
  const vaporPoints = new THREE.Points(vpGeo, vpMat);
  vaporPoints.frustumCulled = false;
  vaporPoints.renderOrder = 4;
  vaporPoints.visible = false;
  jet.add(vaporPoints);
  function buildVapor() {
    vapor.length = 0;
    const rv = rng(4711);
    let idx = 0;
    for (const sgn of [-1, 1]) {
      const lanes = [
        // [x0, x1, zFront, zAft, yTop]   — strake / wing-root lanes (model metres)
        [1.35, 1.75, -2.6, 0.8, -0.18],
        [1.8, 2.6, -0.6, 3.6, -0.24],
        [2.6, 3.6, 0.6, 4.2, -0.34]
      ];
      for (const [x0, x1, zf, za, yt] of lanes) {
        for (let i = 0; i < 7; i++) {
          vpRot[idx++] = rv() * 6.28;
          vapor.push({ x: sgn * THREE.MathUtils.lerp(x0, x1, rv()), y: yt + 0.12 + rv() * 0.18, zf, za,
            u: rv(), speed: 0.5 + rv() * 0.6, base: 1.6 + rv() * 1.6, phase: rv() * 6.28, wob: rv() * 6.28 });
        }
      }
    }
    vpGeo.attributes.aRot.needsUpdate = true;
  }
  buildVapor();
  let vaporLevel = 0;

  /* -------------------------------------------- supersonic speed streaks */
  scene.add(camera);
  const SL = 110;
  const slGeo = new THREE.BufferGeometry();
  slGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SL * 6), 3));
  slGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SL * 8), 4));
  const speedLines = new THREE.LineSegments(slGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  speedLines.frustumCulled = false;
  speedLines.renderOrder = 10;
  camera.add(speedLines);
  const streaks = [];
  function respawnStreak(st, fresh, fp) {
    st.a = rand() * Math.PI * 2;
    st.r = (fp ? 2.6 : 3.2) + Math.pow(rand(), 0.7) * 13;
    st.z = fresh ? -10 - rand() * 110 : -95 - rand() * 35;
    st.k = 0.6 + rand() * 0.4;
  }
  for (let i = 0; i < SL; i++) { const st = {}; respawnStreak(st, true, false); streaks.push(st); }
  function updateSpeedLines(s, dt, fp) {
    // Supersonic streaks; also peripheral motion streaks during a cockpit-view barrel roll.
    const k = Math.max(smooth(s.mach, 0.95, 1.25), fp && s.barrelRoll ? 0.65 : 0);
    speedLines.visible = k > 0.01;
    if (!speedLines.visible) return;
    const pos = slGeo.attributes.position.array, col = slGeo.attributes.color.array;
    const flow = s.speed * 0.85, len = 3 + s.speed * 0.024;
    for (let i = 0; i < SL; i++) {
      const st = streaks[i];
      st.z += flow * st.k * dt;
      if (st.z > 2) respawnStreak(st, false, fp);
      const x = Math.cos(st.a) * st.r, y = Math.sin(st.a) * st.r;
      const o = i * 6, c = i * 8;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = st.z;
      pos[o + 3] = x; pos[o + 4] = y; pos[o + 5] = st.z - len * st.k;
      const a = k * 0.42 * smooth(st.z, -120, -40) * (1 - smooth(st.z, -4, 2));
      col[c] = 0.86; col[c + 1] = 0.93; col[c + 2] = 1.0; col[c + 3] = a;
      col[c + 4] = 0.86; col[c + 5] = 0.93; col[c + 6] = 1.0; col[c + 7] = 0;
    }
    slGeo.attributes.position.needsUpdate = true;
    slGeo.attributes.color.needsUpdate = true;
  }

  /* --------------------------------------- Prandtl-Glauert vapor cone */
  // Two nested open cones, apex at the nose, opening aft. All geometry and
  // materials are created once here; updateMachCone allocates nothing per frame.
  function coneMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uOp: { value: 0 }, uTime: { value: 0 } },
      vertexShader: LOG_V + `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: LOG_F + `
        uniform float uOp; uniform float uTime;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          #include <logdepthbuf_fragment>
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float along = smoothstep(0.0, 0.45, vUv.y) * (1.0 - smoothstep(0.80, 1.0, vUv.y));
          float streak = 0.78 + 0.22 * sin(vUv.x * 92.0 + uTime * 2.5) * sin(vUv.x * 31.0 - uTime * 1.3);
          float a = uOp * along * (0.75 + 0.25 * pow(1.0 - facing, 1.3)) * streak;
          vec3 c = min(vec3(0.97, 0.98, 1.0), vec3(0.85));
          gl_FragColor = vec4(c, clamp(a, 0.0, 0.85));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true
    });
  }
  function coneGeometry(radius, length) {
    const g = new THREE.ConeGeometry(radius, length, 48, 1, true);
    g.rotateX(-Math.PI / 2);                          // cone apex +Y -> -Z (nose), base -> +Z (aft)
    g.translate(0, 0, length / 2);                    // apex at z = 0
    return g;
  }
  const machConeInner = new THREE.Mesh(coneGeometry(4.2, 9.0), coneMaterial());
  const machConeOuter = new THREE.Mesh(coneGeometry(6.0, 12.0), coneMaterial());
  machConeInner.position.copy(machConeOuter.position).set(0, -0.1, -9.45);
  machConeInner.renderOrder = 5; machConeOuter.renderOrder = 4;
  machConeInner.visible = false; machConeOuter.visible = false;
  jet.add(machConeInner, machConeOuter);
  let coneClock = 0;
  function updateMachCone(dt, mach, isCockpit) {
    coneClock += dt;
    const win = force.cone ? 1 : smooth(mach, 0.98, 1.0) * (1 - smooth(mach, 1.02, 1.05));
    const show = !isCockpit && win > 0.005;
    machConeInner.visible = machConeOuter.visible = show;
    machConeInner.material.uniforms.uOp.value = win * 0.22;
    machConeOuter.material.uniforms.uOp.value = win * 0.12;
    machConeInner.material.uniforms.uTime.value = coneClock;
    machConeOuter.material.uniforms.uTime.value = coneClock;
  }

  /* -------------------------------------------------- low-level sea spray */
  const SP = 360;
  const spGeo = new THREE.BufferGeometry();
  const spPos = new Float32Array(SP * 3), spAlpha = new Float32Array(SP), spSize = new Float32Array(SP);
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aAlpha', new THREE.BufferAttribute(spAlpha, 1));
  spGeo.setAttribute('aSize', new THREE.BufferAttribute(spSize, 1));
  const spMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
      void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = vA * pow(clamp(1.0 - d, 0.0, 1.0), 1.5);
        if (a < 0.003) discard;
        gl_FragColor = vec4(0.94, 0.97, 1.0, a);
      }`,
    transparent: true, depthWrite: false
  });
  const spray = new THREE.Points(spGeo, spMat);
  spray.frustumCulled = false;
  scene.add(spray);
  const sprayP = Array.from({ length: SP }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 6 }));
  const _spDir = new THREE.Vector3();
  let sprayAcc = 0, sprayNext = 0;
  function updateSpray(s, dt, visible) {
    const p = s.position;
    const overWater = terrainHeight(p.x, p.z) < -1;
    const agl = p.y;                                       // height above the sea surface
    const k = (visible && overWater && agl < 150 * FT) ? Math.pow(1 - agl / (150 * FT), 1.4) * smooth(s.speed, 50, 170) : 0;
    sprayAcc += 320 * k * dt;
    const vdir = _spDir.copy(s.velocity).setY(0).normalize();
    while (sprayAcc >= 1) {
      sprayAcc -= 1;
      const q = sprayP[sprayNext]; sprayNext = (sprayNext + 1) % SP;
      const back = rand() * 10, lat = (rand() - 0.5) * 11;
      q.on = true;
      q.x = p.x - vdir.x * back + vdir.z * lat; q.z = p.z - vdir.z * back - vdir.x * lat; q.y = 0.3;
      const out = Math.sign(lat) * (3 + rand() * 6);
      q.vx = s.velocity.x * 0.10 + vdir.z * out + (rand() - 0.5) * 3;
      q.vz = s.velocity.z * 0.10 - vdir.x * out + (rand() - 0.5) * 3;
      q.vy = 6 + rand() * 16 * (0.4 + 0.6 * k);
      q.age = 0; q.life = 0.9 + rand() * 1.4; q.s0 = 1.5 + rand() * 2.0; q.s1 = 6 + rand() * 9;
    }
    for (let i = 0; i < SP; i++) {
      const q = sprayP[i];
      if (!q.on) { spAlpha[i] = 0; continue; }
      q.age += dt;
      if (q.age >= q.life) { q.on = false; spAlpha[i] = 0; continue; }
      q.vy -= 9.81 * dt;
      const drag = 1 - 0.9 * dt; q.vx *= drag; q.vz *= drag;
      q.x += q.vx * dt; q.y = Math.max(0.2, q.y + q.vy * dt); q.z += q.vz * dt;
      const f = q.age / q.life;
      spPos[i * 3] = q.x; spPos[i * 3 + 1] = q.y; spPos[i * 3 + 2] = q.z;
      spAlpha[i] = Math.pow(1 - f, 1.3) * Math.min(1, q.age * 10) * 0.65;
      spSize[i] = q.s0 + (q.s1 - q.s0) * f;
    }
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.aAlpha.needsUpdate = true;
    spGeo.attributes.aSize.needsUpdate = true;
    spMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  /* ------------------------------- sea-skim rooster tail + foam wake (pooled) */
  const rzGeo = new THREE.BufferGeometry();
  const rzPos = new Float32Array(SPRAY_N * 3), rzSize = new Float32Array(SPRAY_N), rzAlpha = new Float32Array(SPRAY_N);
  rzGeo.setAttribute('position', new THREE.BufferAttribute(rzPos, 3).setUsage(THREE.DynamicDrawUsage));
  rzGeo.setAttribute('aSize', new THREE.BufferAttribute(rzSize, 1).setUsage(THREE.DynamicDrawUsage));
  rzGeo.setAttribute('aAlpha', new THREE.BufferAttribute(rzAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const rzMat = new THREE.ShaderMaterial({
    uniforms: { uFar: { value: new THREE.Vector2(1500, 4200) }, uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aAlpha; attribute float aSize; uniform vec2 uFar; uniform float uScale; varying float vA;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vA = aAlpha * (1.0 - smoothstep(uFar.x, uFar.y, -mv.z));
        gl_PointSize = aSize * uScale / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = vA * pow(clamp(1.0 - d, 0.0, 1.0), 1.5);
        if (a < 0.004) discard;
        gl_FragColor = vec4(0.93, 0.95, 0.97, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending
  });
  const rzPoints = new THREE.Points(rzGeo, rzMat);
  rzPoints.frustumCulled = false; rzPoints.visible = false; scene.add(rzPoints);
  const rzVel = new Float32Array(SPRAY_N * 3), rzAge = new Float32Array(SPRAY_N), rzLife = new Float32Array(SPRAY_N), rzK = new Float32Array(SPRAY_N);
  let rzHead = 0, rzAcc = 0, rzAlive = 0;
  const rooster = {
    emit(x, z, fwdX, fwdZ, speed, k, dt) {
      rzAcc += SPRAY_RATE_MAX * k * dt;
      let n = rzAcc | 0;
      rzAcc -= n;
      const latX = -fwdZ, latZ = fwdX;
      while (n-- > 0) {
        const i = rzHead; rzHead = (rzHead + 1) % SPRAY_N;
        const side = (rzHead & 1) ? 1 : -1, lat = (3 + 3 * k) * side;
        const px = x - fwdX * 9 + latX * lat, pz = z - fwdZ * 9 + latZ * lat;
        rzPos[i * 3] = px; rzPos[i * 3 + 1] = SPRAY_Y; rzPos[i * 3 + 2] = pz;
        const out = side * (3 + 6 * k), back = speed * 0.22;
        rzVel[i * 3] = -fwdX * back + latX * out;
        rzVel[i * 3 + 1] = 6 + 28 * k;
        rzVel[i * 3 + 2] = -fwdZ * back + latZ * out;
        rzAge[i] = 0; rzLife[i] = SPRAY_LIFE_MIN + rand() * (SPRAY_LIFE_MAX - SPRAY_LIFE_MIN); rzK[i] = k;
        rzAlpha[i] = 0; rzSize[i] = 3;
        rzAlive++;
      }
    },
    update(dt) {
      if (!rzAlive) { rzPoints.visible = false; return; }
      for (let i = 0; i < SPRAY_N; i++) {
        if (rzAge[i] >= rzLife[i]) { rzAlpha[i] = 0; continue; }
        rzAge[i] += dt;
        const j = i * 3;
        rzVel[j + 1] -= 9.8 * dt;
        const drag = 1 - 1.4 * dt;
        rzVel[j] *= drag; rzVel[j + 2] *= drag;
        rzPos[j] += rzVel[j] * dt; rzPos[j + 1] = Math.max(SPRAY_Y, rzPos[j + 1] + rzVel[j + 1] * dt); rzPos[j + 2] += rzVel[j + 2] * dt;
        const t = Math.min(1, rzAge[i] / rzLife[i]), k = rzK[i];
        rzSize[i] = 3 + (8 + 12 * k - 3) * t;
        rzAlpha[i] = k * 0.75 * smooth(0, 0.08, rzAge[i]) * Math.pow(1 - t, 1.5);
        if (rzAge[i] >= rzLife[i]) { rzAlpha[i] = 0; rzAlive--; }
      }
      rzPoints.visible = rzAlive > 0;
      if (!rzAlive) return;
      rzGeo.attributes.position.needsUpdate = true;
      rzGeo.attributes.aSize.needsUpdate = true;
      rzGeo.attributes.aAlpha.needsUpdate = true;
      rzMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },
    reset() { for (let i = 0; i < SPRAY_N; i++) { rzAlpha[i] = 0; rzAge[i] = rzLife[i] = 0; } rzAlive = 0; rzAcc = 0; rzPoints.visible = false; },
    get stats() { return { k: rzK[rzHead] || 0, alive: rzAlive }; }
  };
  // Foam wake: one additive instanced quad every 12 m travelled while skimming.
  const wakeGeo = new THREE.PlaneGeometry(1, 1); wakeGeo.rotateX(-Math.PI / 2);
  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const wakeMesh = new THREE.InstancedMesh(wakeGeo, wakeMat, WAKE_N);
  wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wakeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(WAKE_N * 3), 3);
  wakeMesh.frustumCulled = false; wakeMesh.visible = false; scene.add(wakeMesh);
  const wakePos = new Float32Array(WAKE_N * 3), wakeAge = new Float32Array(WAKE_N), wakeK = new Float32Array(WAKE_N);
  const _rzM4 = new THREE.Matrix4(), _rzQ = new THREE.Quaternion(), _rzV = new THREE.Vector3(), _rzS = new THREE.Vector3();
  const _rzYaw = new THREE.Vector3(0, 1, 0), _rzLast = new THREE.Vector3();
  let wakeHead = 0, wakeAcc = 0, wakeLastValid = false, wakeAlive = 0;
  const wake = {
    drop(x, z, yaw, k, dt) {
      if (k <= 0.15) { wakeLastValid = false; wakeAcc = 0; return; }
      _rzV.set(x, WAKE_Y, z);
      if (wakeLastValid) wakeAcc += _rzV.distanceTo(_rzLast);
      _rzLast.copy(_rzV); wakeLastValid = true;
      if (wakeAcc < WAKE_STEP_M) return;
      wakeAcc -= WAKE_STEP_M;
      const i = wakeHead; wakeHead = (wakeHead + 1) % WAKE_N;
      wakePos[i * 3] = x; wakePos[i * 3 + 1] = WAKE_Y; wakePos[i * 3 + 2] = z;
      wakeAge[i] = 0; wakeK[i] = k; wakeAlive++;
    },
    update(dt) {
      if (!wakeAlive) { wakeMesh.visible = false; return; }
      const col = wakeMesh.instanceColor.array;
      for (let i = 0; i < WAKE_N; i++) {
        if (wakeAge[i] >= WAKE_LIFE) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        wakeAge[i] += dt;
        const t = Math.min(1, wakeAge[i] / WAKE_LIFE), k = wakeK[i];
        const w = 6 + 18 * t;
        _rzQ.setFromAxisAngle(_rzYaw, 0);
        _rzS.set(w, 1, 10 + 10 * t);
        _rzM4.compose(_rzV.set(wakePos[i * 3], WAKE_Y, wakePos[i * 3 + 2]), _rzQ, _rzS);
        wakeMesh.setMatrixAt(i, _rzM4);
        const b = k * 0.35 * (1 - t);
        col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b;
        if (wakeAge[i] >= WAKE_LIFE) wakeAlive--;
      }
      wakeMesh.visible = wakeAlive > 0;
      if (!wakeAlive) return;
      wakeMesh.instanceMatrix.needsUpdate = true;
      wakeMesh.instanceColor.needsUpdate = true;
    },
    reset() { for (let i = 0; i < WAKE_N; i++) wakeAge[i] = WAKE_LIFE; wakeAlive = 0; wakeLastValid = false; wakeAcc = 0; wakeMesh.visible = false; },
    get stats() { return { alive: wakeAlive }; }
  };

  /* ------------------------------------------- bow catapult steam (pooled) */
  // 48 deck-roll puffs (HOLD) + 64 stroke plumes (LAUNCH) share one Points draw.
  const STEAM_LOW_N = 48, STEAM_PLUME_N = 64, STEAM_N = STEAM_LOW_N + STEAM_PLUME_N;
  const csGeo = new THREE.BufferGeometry();
  const csPos = new Float32Array(STEAM_N * 3), csAlpha = new Float32Array(STEAM_N), csSize = new Float32Array(STEAM_N);
  csGeo.setAttribute('position', new THREE.BufferAttribute(csPos, 3).setUsage(THREE.DynamicDrawUsage));
  csGeo.setAttribute('aAlpha', new THREE.BufferAttribute(csAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  csGeo.setAttribute('aSize', new THREE.BufferAttribute(csSize, 1).setUsage(THREE.DynamicDrawUsage));
  const csMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
      void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = vA * pow(clamp(1.0 - d, 0.0, 1.0), 1.6);
        if (a < 0.004) discard;
        gl_FragColor = vec4(0.90, 0.95, 1.0, a);
      }`,
    transparent: true, depthWrite: false
  });
  const catSteamPoints = new THREE.Points(csGeo, csMat);
  catSteamPoints.frustumCulled = false; catSteamPoints.visible = false;
  scene.add(catSteamPoints);
  const steamP = Array.from({ length: STEAM_N }, () => ({ on: false, age: 0, life: 1, s0: 1, s1: 8,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  let steamLowNext = 0, steamPlumeNext = STEAM_LOW_N, steamLowAcc = 0;
  const catSteam = {
    hold(start, fwd, dt) {
      steamLowAcc += 24 * dt;
      const lx = -fwd.z, lz = fwd.x;
      while (steamLowAcc >= 1) {
        steamLowAcc -= 1;
        const q = steamP[steamLowNext]; steamLowNext = (steamLowNext + 1) % STEAM_LOW_N;
        const side = steamLowNext & 1 ? 1 : -1, lat = (2 + rand() * 7) * side;
        q.on = true; q.age = 0; q.life = 2.5; q.s0 = 1.6 + rand(); q.s1 = 7 + rand() * 4;
        q.x = start.x + lx * lat; q.z = start.z + lz * lat; q.y = start.y + 0.3;
        q.vx = lx * 1.5 * side + (rand() - 0.5); q.vz = lz * 1.5 * side + (rand() - 0.5); q.vy = 1.2 + rand();
      }
    },
    stroke(pos, fwd, k, dt) {
      for (let i = 0; i < 6; i++) {
        const q = steamP[steamPlumeNext]; steamPlumeNext = steamPlumeNext + 1 >= STEAM_N ? STEAM_LOW_N : steamPlumeNext + 1;
        const lat = (rand() - 0.5) * 9;
        q.on = true; q.age = 0; q.life = 1.2; q.s0 = 2 + 2 * k; q.s1 = 9 + 7 * k;
        q.x = pos.x - fwd.z * lat; q.z = pos.z + fwd.x * lat; q.y = pos.y + 0.4 + rand() * 1.2;
        q.vx = -fwd.x * 25 + (rand() - 0.5) * 4; q.vz = -fwd.z * 25 + (rand() - 0.5) * 4; q.vy = 4 + rand() * 3;
      }
    },
    update(dt) {
      let live = 0;
      for (let i = 0; i < STEAM_N; i++) {
        const q = steamP[i];
        if (!q.on) { csAlpha[i] = 0; continue; }
        q.age += dt;
        if (q.age >= q.life) { q.on = false; csAlpha[i] = 0; continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        const drag = 1 - 1.1 * dt; q.vx *= drag; q.vz *= drag; q.vy *= 1 - 0.5 * dt;
        const f = q.age / q.life;
        csPos[i * 3] = q.x; csPos[i * 3 + 1] = q.y; csPos[i * 3 + 2] = q.z;
        csAlpha[i] = Math.pow(1 - f, 1.25) * Math.min(1, q.age * 8) * 0.7;
        csSize[i] = q.s0 + (q.s1 - q.s0) * f;
        live++;
      }
      catSteamPoints.visible = live > 0;
      if (!live) return;
      csGeo.attributes.position.needsUpdate = true;
      csGeo.attributes.aAlpha.needsUpdate = true;
      csGeo.attributes.aSize.needsUpdate = true;
      csMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },
    reset() { for (let i = 0; i < STEAM_N; i++) steamP[i].on = false; steamLowAcc = 0; catSteamPoints.visible = false; },
    get count() { let n = 0; for (let i = 0; i < STEAM_N; i++) if (steamP[i].on) n++; return n; }
  };

  /* ----------------------------------- ship AAA / enemy gun tracers (pooled) */
  const AA_TRACER_N = 128;
  const aaGeo = new THREE.BufferGeometry();
  const aaPos = new Float32Array(AA_TRACER_N * 3), aaAlpha = new Float32Array(AA_TRACER_N), aaTint = new Float32Array(AA_TRACER_N);
  aaGeo.setAttribute('position', new THREE.BufferAttribute(aaPos, 3).setUsage(THREE.DynamicDrawUsage));
  aaGeo.setAttribute('aAlpha', new THREE.BufferAttribute(aaAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  aaGeo.setAttribute('aTint', new THREE.BufferAttribute(aaTint, 1).setUsage(THREE.DynamicDrawUsage));
  const aaMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: LOG_V + `
      attribute float aAlpha; attribute float aTint; uniform float uScale; varying float vA; varying float vT;
      void main() { vA = aAlpha; vT = aTint; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (2.0 + 2.0 * aAlpha) * uScale / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: LOG_F + `
      varying float vA; varying float vT;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = vA * pow(clamp(1.0 - d, 0.0, 1.0), 1.4);
        if (a < 0.004) discard;
        vec3 col = mix(vec3(1.0, 0.70, 0.28), vec3(1.0, 0.18, 0.22), vT);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const aaPoints = new THREE.Points(aaGeo, aaMat);
  aaPoints.frustumCulled = false; aaPoints.visible = false; scene.add(aaPoints);
  const aaP = Array.from({ length: AA_TRACER_N }, () => ({ on: false, age: 0, life: 0.3, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  let aaNext = 0;
  const aaTracer = {
    add(pos, vel, life = 0.32, red = false) {
      const q = aaP[aaNext]; aaNext = (aaNext + 1) % AA_TRACER_N;
      q.on = true; q.age = 0; q.life = life;
      q.x = pos.x; q.y = pos.y; q.z = pos.z; q.vx = vel.x; q.vy = vel.y; q.vz = vel.z;
      q.red = red ? 1 : 0;
    },
    update(dt) {
      let live = 0;
      for (let i = 0; i < AA_TRACER_N; i++) {
        const q = aaP[i];
        if (!q.on) { aaAlpha[i] = 0; continue; }
        q.age += dt;
        if (q.age >= q.life) { q.on = false; aaAlpha[i] = 0; continue; }
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        aaPos[i * 3] = q.x; aaPos[i * 3 + 1] = q.y; aaPos[i * 3 + 2] = q.z;
        aaAlpha[i] = 1 - q.age / q.life; aaTint[i] = q.red || 0;
        live++;
      }
      aaPoints.visible = live > 0;
      if (!live) return;
      aaGeo.attributes.position.needsUpdate = true;
      aaGeo.attributes.aAlpha.needsUpdate = true;
      aaGeo.attributes.aTint.needsUpdate = true;
      aaMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    },
    reset() { for (let i = 0; i < AA_TRACER_N; i++) aaP[i].on = false; aaPoints.visible = false; },
    get count() { let n = 0; for (let i = 0; i < AA_TRACER_N; i++) if (aaP[i].on) n++; return n; }
  };

  /* ------------- hybrid clouds: raymarched sky deck + lit 3-D cumulus banks */
  // (1) SKY DECK 9,000-13,000 ft: a camera-centred back-faced dome whose
  //     fragment shader raymarches a 2.5-D volumetric cumulus layer (20 steps,
  //     per-pixel hash dither): shape = tileable Perlin-FBM x Worley-billow
  //     coverage field, rounded cauliflower tops from a second Worley octave,
  //     high-frequency erosion. Lighting per sample: Beer-Lambert extinction,
  //     a 2-tap light march toward the sun (self-shadowed slate cores),
  //     Henyey-Greenstein forward + back lobes (silver / golden rims toward the
  //     sun), height-graded ambient from the preset belly / top colours, and
  //     aerial perspective into the scene fog colour with a soft far fade.
  //     It writes a log-depth at the first dense sample so the jet, terrain and
  //     the banks sort correctly against it.
  // (2) CUMULUS BANKS 1,800-7,500 ft: 16 broad horizontal banks (1.8-3.6 km
  //     wide, 350-850 m tall, flat soft bases, cauliflower ridges; Poisson-
  //     spaced with corridors), each 25-45 rotated soft puffs drawn by one
  //     instanced volumetric-puff shader: Worley-FBM cauliflower alpha, a fake
  //     spherical view-space normal per puff, wrap-lit sun + sky bounce graded
  //     by height in the bank, HG silver lining on thin edges, partial fog,
  //     and a 180 -> 40 m proximity fade (no card popping when flying through).
  // Both follow the live sun direction (shared SUN_DIR the atmosphere drives),
  // the preset sun colour / intensity, cloud top / belly colours and the fog
  // colour, so every time-of-day / weather preset matches. cloudDensity(p)
  // samples the bank ellipsoids and the deck's exact JS twin of the shader
  // density -> inCloud (> 0.35 breaks bandit locks), fog ramp, canopy moisture.
  const SUN = env.sunDir || new THREE.Vector3(0, 1, 0);   // live reference (atmosphere updates it)
  const WIND = new THREE.Vector3(5.2, 0, -4.6);          // m/s
  const windOff = new THREE.Vector3();
  const runway = env.runway || null;
  const cr = rng(31337);
  const ARENA = { x: 0, z: -3000, r: 12500 };
  // Deck slab: 9,000-13,000 ft normally; in DAYLIGHT // CLOUD SEA it drops to the
  // 3,500-5,800 ft cloud-sea band and opens a soft hole over the arena (where the
  // instanced cloud-sea banks take over), so the sea runs on to the horizon haze.
  const DECK_HI = [9000 * FT, 4000 * FT], DECK_SEA = [3500 * FT, 2300 * FT];
  let deckBase = DECK_HI[0], deckThick = DECK_HI[1];
  const DECK_SCALE = 9000;
  // Sea mode: the deck fills the whole band, with feathered sky windows (list set below).
  const deckWin = { k: 0, list: [] };
  let cloudSea = false;
  const NEAR0 = 40, NEAR1 = 180;
  const sunCol = new THREE.Color(1, 1, 1);
  let sunK = 1;

  // --- tileable noise texture (256^2): R Perlin-style value FBM, G inverted
  // Worley billows (2 octaves), B high-frequency FBM. CPU copies stay for the
  // deck's JS density twin.
  const NZ = 256;
  const nR = new Float32Array(NZ * NZ), nG = new Float32Array(NZ * NZ), nB = new Float32Array(NZ * NZ);
  {
    const hsh = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    const vper = (x, y, P, s) => {                      // periodic value noise, period P lattice cells
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const w = (a, b) => hsh(((a % P) + P) % P, ((b % P) + P) % P, s);
      const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const worley = (x, y, P, s) => {                    // periodic F1, P cells
      const xi = Math.floor(x), yi = Math.floor(y); let f = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = xi + i, cy = yi + j, wx = ((cx % P) + P) % P, wy = ((cy % P) + P) % P;
        const px = cx + hsh(wx, wy, s), py = cy + hsh(wx, wy, s + 9.1);
        f = Math.min(f, Math.hypot(px - x, py - y));
      }
      return f;
    };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NZ; i++) {
      const u = i / NZ, v = j / NZ, k = j * NZ + i;
      let r = 0, a = 0.5, n = 0;
      for (const P of [4, 8, 16, 32, 64]) { r += a * vper(u * P, v * P, P, 1 + P); n += a; a *= 0.5; }
      nR[k] = r / n;
      nG[k] = Math.min(1, Math.max(0, 0.62 * (1 - worley(u * 6, v * 6, 6, 3) * 1.15) + 0.38 * (1 - worley(u * 14, v * 14, 14, 5) * 1.2)));
      let b = 0; a = 0.5; n = 0;
      for (const P of [16, 32, 64, 128]) { b += a * vper(u * P, v * P, P, 7 + P); n += a; a *= 0.5; }
      nB[k] = b / n;
    }
    // Stretch R to 0..1 so the coverage thresholds are meaningful.
    let lo = 1, hi = 0; for (const x of nR) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    for (let k = 0; k < nR.length; k++) nR[k] = (nR[k] - lo) / (hi - lo);
  }
  const noiseTex = (() => {
    const d = new Uint8Array(NZ * NZ * 4);
    for (let k = 0; k < NZ * NZ; k++) { d[k * 4] = nR[k] * 255; d[k * 4 + 1] = nG[k] * 255; d[k * 4 + 2] = nB[k] * 255; d[k * 4 + 3] = 255; }
    const t = new THREE.DataTexture(d, NZ, NZ, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return t;
  })();
  const samp = (arr, u, v) => {                          // bilinear, wrapping (matches the GPU sampler)
    const x = (u - Math.floor(u)) * NZ - 0.5, y = (v - Math.floor(v)) * NZ - 0.5;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const at = (i, j) => arr[(((j % NZ) + NZ) % NZ) * NZ + (((i % NZ) + NZ) % NZ)];
    return (at(xi, yi) * (1 - fx) + at(xi + 1, yi) * fx) * (1 - fy) + (at(xi, yi + 1) * (1 - fx) + at(xi + 1, yi + 1) * fx) * fy;
  };

  // --- deck density (GLSL + exact JS twin) ------------------------------
  let deckThr = 0.4;                                     // coverage threshold (weather)
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function deckDensity(x, y, z) {
    const h = (y - deckBase) / deckThick;
    if (h <= 0 || h >= 1) return 0;
    let hole = 1;
    if (deckWin.k > 0) for (const w of deckWin.list) hole = Math.min(hole, ss(w.r - 700, w.r + 1400, Math.hypot(x - w.x, z - w.z)));
    if (hole <= 0) return 0;
    const u = (x + windOff.x) / DECK_SCALE, v = (z + windOff.z) / DECK_SCALE;
    // Coverage field + pseudo-3-D billows / erosion (2-D slices blended by height:
    // features change with altitude in no fixed direction -> no extruded columns,
    // no radial streaks), and a threshold that rises with height -> rounded tops.
    const s = 0.55 * samp(nR, u, v) + 0.3 * slice3(nG, u * 2.7 + 0.37, v * 2.7 + 0.61, h * 3.6)
      + 0.15 * (slice3(nG, u * 6.1, v * 6.1, h * 6.5) - 0.5);
    const lift = deckThr + 0.2 * h * h;
    const cov = ss(lift, lift + 0.16, s);
    if (cov <= 0) return 0;
    let d = cov * ss(0, 0.2, h);
    d -= slice3(nB, u * 13, v * 13, h * 9.0) * 0.3 * (1 - 0.4 * h);
    return Math.min(1, Math.max(0, d * 1.6)) * hole;
  }
  // Pseudo-3-D noise: blend two 2-D slices (hashed offsets) by the fractional depth z.
  function slice3(arr, u, v, z) {
    const k = Math.floor(z), f = z - k, w = f * f * (3 - 2 * f);
    const o = q => [((q * 0.618034) % 1 + 1) % 1 * 7.13, ((q * 0.381966) % 1 + 1) % 1 * 5.71];
    const [ax, ay] = o(k), [bx, by] = o(k + 1);
    const m = samp(arr, u + ax, v + ay) * (1 - w) + samp(arr, u + bx, v + by) * w;
    // Variance-preserving blend: a plain lerp of two independent slices loses contrast
    // mid-way, which drew contour bands across the cloud tops at every slice boundary.
    return Math.min(1, Math.max(0, 0.5 + (m - 0.5) / Math.sqrt(1 - 2 * w + 2 * w * w)));
  }
  const DECK_GLSL = `
    uniform sampler2D uNoise; uniform float uThr; uniform vec3 uWind;
    uniform vec2 uDeckY;                                   // base, thickness (m)
    uniform vec3 uWin[3];                                  // sky windows: centre xz, radius (sea mode)
    uniform float uHoleK;
    // Explicit mip level (set per ray step from distance): implicit derivatives are
    // meaningless inside a dithered raymarch loop and picked streaky, blurry mips.
    float gLod = 0.0;
    #define NOISE(uv) textureLod(uNoise, (uv), gLod)
    float ssf(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
    vec2 sliceOff(float q) { return vec2(fract(q * 0.618034) * 7.13, fract(q * 0.381966) * 5.71); }
    vec4 slice3(vec2 uv, float z) {                        // pseudo-3-D: two hashed 2-D slices blended by depth
      float k = floor(z), f = z - k, w = f * f * (3.0 - 2.0 * f);
      vec4 m = mix(NOISE(uv + sliceOff(k)), NOISE(uv + sliceOff(k + 1.0)), w);
      // variance-preserving blend (plain lerp loses contrast mid-slice -> contour bands)
      return clamp(0.5 + (m - 0.5) * inversesqrt(1.0 - 2.0 * w + 2.0 * w * w), 0.0, 1.0);
    }
    float deckDensity(vec3 p) {
      float h = (p.y - uDeckY.x) / uDeckY.y;
      if (h <= 0.0 || h >= 1.0) return 0.0;
      float hole = 1.0;
      if (uHoleK > 0.0) for (int i = 0; i < 3; i++) hole = min(hole, ssf(uWin[i].z - 700.0, uWin[i].z + 1400.0, length(p.xz - uWin[i].xy)));
      if (hole <= 0.0) return 0.0;
      vec2 uv = (p.xz + uWind.xz) / ${DECK_SCALE.toFixed(1)};
      float s = 0.55 * NOISE(uv).r + 0.3 * slice3(uv * 2.7 + vec2(0.37, 0.61), h * 3.6).g
        + 0.15 * (slice3(uv * 6.1, h * 6.5).g - 0.5);
      float lift = uThr + 0.2 * h * h;
      float cov = ssf(lift, lift + 0.16, s);
      if (cov <= 0.0) return 0.0;
      float d = cov * ssf(0.0, 0.2, h);
      d -= slice3(uv * 13.0, h * 9.0).b * 0.3 * (1.0 - 0.4 * h);
      return clamp(d * 1.6, 0.0, 1.0) * hole;
    }`;

  // --- (1) raymarched sky deck -------------------------------------------
  const deckMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uNoise: { value: null }, uThr: { value: deckThr }, uWind: { value: new THREE.Vector3() },
      uDeckY: { value: new THREE.Vector2(DECK_HI[0], DECK_HI[1]) }, uWin: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }, uHoleK: { value: 0 },
      uCap: { value: 8 },
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uTop: { value: new THREE.Color(0xffffff) }, uBelly: { value: new THREE.Color(0x6e89a8) }, uGain: { value: 1 }, uFlash: { value: 0 },
      uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uFrame: { value: 0 }
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      ${DECK_GLSL}
      uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uTop; uniform vec3 uBelly; uniform float uGain; uniform float uFlash;
      uniform vec3 uCamFwd; uniform float uFrame; uniform float uCap;
      varying vec3 vWorld;
      float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
      void main() {
        vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
        float y0 = uDeckY.x, y1 = uDeckY.x + uDeckY.y;
        float t0, t1;
        if (abs(rd.y) < 1e-4) {
          if (ro.y < y0 || ro.y > y1) discard;
          t0 = 0.0; t1 = 30000.0;
        } else {
          float ta = (y0 - ro.y) / rd.y, tb = (y1 - ro.y) / rd.y;
          t0 = max(min(ta, tb), 0.0); t1 = min(max(ta, tb), 40000.0);
        }
        if (t1 <= t0) discard;
        float len = min(t1 - t0, 8000.0);
        const int STEPS = 18;
        // Geometric steps: fine where the ray enters the cloud skin, growing
        // 18 % per step to cover the whole span cleanly at lower fragment cost.
        const float GROW = 1.18;
        float stepL = len * (GROW - 1.0) / (pow(GROW, float(STEPS)) - 1.0);
        // Interleaved gradient noise ray-offset dither (no row-correlated streaks), rotated per frame.
        vec2 fc = gl_FragCoord.xy + vec2(5.588238, 5.588238) * uFrame;
        float jit = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
        // jitter by a fractional step index so the offset scales with the growing steps
        float t = t0 + stepL * (pow(GROW, jit) - 1.0) / (GROW - 1.0);
        stepL *= pow(GROW, jit);
        float T = 1.0, tHit = -1.0;
        vec3 col = vec3(0.0);
        float cosT = dot(rd, uSun);
        float phase = mix(hg(cosT, 0.62), hg(cosT, -0.25), 0.3) * 4.0;     // forward silver rim + soft back lobe
        vec3 sunL = uSun.y > -0.05 ? uSun : vec3(0.0, 1.0, 0.0);
        for (int i = 0; i < STEPS; i++) {
          vec3 p = ro + rd * t;
          gLod = clamp(log2(max(t, 1.0) / 2500.0), 0.0, 3.0);           // coarser noise mips with distance (no aliasing)
          float near = smoothstep(${NEAR0.toFixed(1)}, ${NEAR1.toFixed(1)}, t);
          float d = deckDensity(p) * near;
          if (d > 0.01) {
            if (tHit < 0.0) tHit = t;
            // Single jittered light march tap on coarse mip for smooth self-shadowing.
            float lodV = gLod;
            gLod = lodV + 2.5;
            float od = deckDensity(p + sunL * (180.0 + 120.0 * jit)) * 420.0;
            gLod = lodV;
            float Tl = exp(-od * 0.0055);                                  // Beer-Lambert toward the sun
            float h = clamp((p.y - y0) / (y1 - y0), 0.0, 1.0);
            vec3 amb = mix(uBelly * 0.75, uTop * 0.9, smoothstep(0.0, 0.85, h));
            vec3 S = amb * 0.62 + uSunCol * Tl * (0.38 + phase) * 0.9 + vec3(0.75, 0.8, 1.0) * uFlash * 0.6;
            float a = 1.0 - exp(-d * 0.0055 * stepL);                      // Beer-Lambert extinction
            col += T * a * S;
            T *= 1.0 - a;
            if (T < 0.02) break;
          }
          t += stepL;
          stepL *= GROW;
        }
        float alpha = 1.0 - T;
        if (alpha < 0.04) discard;
        col = col / alpha * uGain;
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        if (lum > uCap) col *= uCap / lum;                               // tops never reach the bloom threshold
        float dist = tHit > 0.0 ? tHit : t0;
        #ifdef USE_FOG
          float af = 1.0 - exp(-fogDensity * fogDensity * dist * dist * 0.55);   // aerial perspective
          col = mix(col, fogColor, af);
        #endif
        alpha *= 1.0 - smoothstep(26000.0, 38000.0, dist);                  // soft far edge, no hard cutoff
        // Above the deck, grazing rays (< ~1-3 deg below the horizon) skim the dome
        // tops and alias into horizontal bands: fade them into the haze instead.
        if (ro.y > y1) alpha *= smoothstep(0.012, 0.05, -rd.y);
        gl_FragColor = vec4(col, alpha);
        #ifdef USE_LOGDEPTHBUF
          gl_FragDepth = log2(1.0 + max(dist * dot(rd, uCamFwd), 1.0)) * logDepthBufFC * 0.5;
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: true, fog: true
  });
  deckMat.uniforms.uNoise.value = noiseTex;
  const deck = new THREE.Mesh(new THREE.SphereGeometry(38000, 48, 24), deckMat);
  deck.frustumCulled = false; deck.renderOrder = 1;
  deck.castShadow = false; deck.receiveShadow = false;
  scene.add(deck);

  // --- (2) cumulus banks -------------------------------------------------
  const banks = [], puffs = [];
  for (let guard = 0; banks.length < 16 && guard < 8000; guard++) {
    const a = cr() * Math.PI * 2, rr = ARENA.r * Math.sqrt(cr());
    const x = ARENA.x + Math.cos(a) * rr, z = ARENA.z + Math.sin(a) * rr;
    const W = 1800 + cr() * 1800, D = W * (0.45 + cr() * 0.35), H = 350 + cr() * 500;
    if (runway && Math.abs(x - runway.x) < 1500 + W / 2 && z > runway.z0 - 2500 && z < runway.z1 + 7000) continue;   // airbase approach open
    if (banks.some(b => Math.hypot(b.x - x, b.z - z) < (b.W + W) / 2 + 700)) continue;                             // >= 700 m corridors
    const base = 1800 * FT + cr() * Math.max(0, 7500 * FT - 1800 * FT - H);
    const yaw = cr() * Math.PI;
    banks.push({ x, z, W, D, H, base, yaw, c: Math.cos(yaw), s: Math.sin(yaw), rank: cr(), on: true });
  }
  for (const [bi, b] of banks.entries()) {
    const n = 25 + Math.floor(cr() * 21);
    for (let i = 0; i < n; i++) {
      // Lower 40 %: wide flat-ish base layer; the rest: cauliflower ridge lumps
      // pulled inward as they rise (rounded tops, never a stalk).
      const low = i < n * 0.4;
      const h = low ? 0.12 + cr() * 0.22 : 0.35 + Math.pow(cr(), 0.8) * 0.5;
      const shrink = low ? 0.92 : 1 - 0.55 * (h - 0.3);
      const ang = cr() * Math.PI * 2, rad = Math.sqrt(cr()) * shrink;
      const lx = Math.cos(ang) * rad * b.W * 0.42, lz = Math.sin(ang) * rad * b.D * 0.42;
      const px = b.x + lx * b.c - lz * b.s, pz = b.z + lx * b.s + lz * b.c;
      const size = b.H * (low ? 1.05 + cr() * 0.4 : 0.75 + cr() * 0.45) + 160;
      puffs.push({ x: px, y: b.base + h * b.H, z: pz, s: size, h, rot: cr() * Math.PI * 2, tile: Math.floor(cr() * 4),
        str: low ? 1.35 + cr() * 0.35 : 1.0 + cr() * 0.2, al: 1, bi });
    }
  }
  // --- (2b) DAYLIGHT // CLOUD SEA: 34 broad overlapping cumulus decks, 3,500-5,800 ft.
  // Clustered into sweeping fields around 6 field centres; every deck is 3-5x wider
  // than tall; three sky "windows" stay open over ARCHIPELAGO AFB, the Bridge Strait
  // and the NW Canyon. Pre-built at load (hidden) so switching presets only flips flags.
  const SEA_LO = 3500 * FT, SEA_HI = 5800 * FT;
  const SEA_WINDOWS = [
    { x: runway ? runway.x : 900, z: runway ? (runway.z0 + runway.z1) / 2 : 100, r: 2600 },   // ARCHIPELAGO AFB
    { x: -4350, z: -3880, r: 2000 },                                                         // Bridge Strait (bridge A)
    { x: -5500, z: -7200, r: 2300 }                                                          // NW Canyon
  ];
  deckWin.list = SEA_WINDOWS;
  const seaStart = banks.length;
  {
    const sr = rng(90210);
    const fields = [];
    for (let g = 0; fields.length < 6 && g < 4000; g++) {
      const a = sr() * Math.PI * 2, rr = ARENA.r * 0.85 * Math.sqrt(sr());
      const fx = ARENA.x + Math.cos(a) * rr, fz = ARENA.z + Math.sin(a) * rr;
      if (SEA_WINDOWS.some(w => Math.hypot(fx - w.x, fz - w.z) < w.r + 1800)) continue;
      if (fields.some(f => Math.hypot(f.x - fx, f.z - fz) < 6500)) continue;
      fields.push({ x: fx, z: fz, yaw: sr() * Math.PI });
    }
    const sea = [];
    for (let g = 0; sea.length < 34 && g < 20000; g++) {
      const f = fields[Math.floor(sr() * fields.length)];
      // Elongated field: banks spread along the field's sweep direction.
      const u = (sr() + sr() + sr() - 1.5) * 5200, v = (sr() + sr() - 1) * 2600;
      const x = f.x + u * Math.cos(f.yaw) - v * Math.sin(f.yaw), z = f.z + u * Math.sin(f.yaw) + v * Math.cos(f.yaw);
      if (Math.hypot(x - ARENA.x, z - ARENA.z) > ARENA.r) continue;
      const W = 1400 + sr() * 1800;
      const H = Math.min(680, Math.max(380, W / (3 + sr() * 2)));              // 3-5x wider than tall
      const D = W * (0.5 + sr() * 0.35);
      if (SEA_WINDOWS.some(w => Math.hypot(x - w.x, z - w.z) < w.r + W * 0.5)) continue;
      if (sea.some(b => Math.hypot(b.x - x, b.z - z) < (b.W + W) * 0.28)) continue;   // overlap, but no stacking
      const base = SEA_LO + sr() * Math.max(0, SEA_HI - SEA_LO - H);
      const yaw = f.yaw + (sr() - 0.5) * 0.9;
      sea.push({ x, z, W, D, H, base, yaw, c: Math.cos(yaw), s: Math.sin(yaw), rank: sr(), on: false, sea: true });
    }
    for (const b of sea) {
      banks.push(b);
      const bi = banks.length - 1;
      const n = Math.max(22, Math.min(46, Math.round(b.W * b.D / 150000)));
      for (let i = 0; i < n; i++) {
        // 45 % flat base sheet, the rest billowing crowns pulled inward as they rise.
        const low = i < n * 0.45;
        const h = low ? 0.1 + sr() * 0.25 : 0.38 + Math.pow(sr(), 0.85) * 0.5;
        const shrink = low ? 0.95 : 1 - 0.5 * (h - 0.3);
        const ang = sr() * Math.PI * 2, rad = Math.sqrt(sr()) * shrink;
        const lx = Math.cos(ang) * rad * b.W * 0.44, lz = Math.sin(ang) * rad * b.D * 0.44;
        const size = b.H * (low ? 0.95 + sr() * 0.35 : 0.7 + sr() * 0.4) + 140;
        // Keep the visible card (~0.36 x size below centre) above the deck base: flat bellies, open air below.
        const y = Math.max(b.base + h * b.H, b.base + size * 0.36);
        puffs.push({ x: b.x + lx * b.c - lz * b.s, y: Math.min(y, SEA_HI + 120), z: b.z + lx * b.s + lz * b.c, s: size, h,
          rot: sr() * Math.PI * 2, tile: Math.floor(sr() * 4), str: low ? 1.5 + sr() * 0.4 : 1.1 + sr() * 0.25, al: 1, bi });
      }
    }
  }
  const seaCount = banks.length - seaStart;
  // Debug slot: a reserved bank (hidden until placed) for deterministic tests.
  const DBG_N = 36, dbgStart = puffs.length, dbgBank = { x: 0, z: 0, W: 1, D: 1, H: 1, base: -1e5, yaw: 0, c: 1, s: 0, rank: 0, on: false, dbg: true };
  banks.push(dbgBank);
  for (let i = 0; i < DBG_N; i++) puffs.push({ x: 0, y: -1e5, z: 0, s: 0, h: 0.5, rot: 0, tile: 0, str: 1, al: 1, bi: banks.length - 1 });
  function placeDebugCloud(center, rx = 1100, ry = 260, rz = 700) {
    const r = rng(4242);
    Object.assign(dbgBank, { x: center.x - windOff.x, z: center.z - windOff.z, W: rx * 2, D: rz * 2, H: ry * 2, base: center.y - ry, on: true });
    for (let i = 0; i < DBG_N; i++) {
      const low = i < DBG_N * 0.4, h = low ? 0.12 + r() * 0.22 : 0.35 + r() * 0.5, ang = r() * 6.283, rad = Math.sqrt(r()) * (low ? 0.92 : 0.8);
      Object.assign(puffs[dbgStart + i], { x: dbgBank.x + Math.cos(ang) * rad * rx * 0.85, y: dbgBank.base + h * ry * 2, z: dbgBank.z + Math.sin(ang) * rad * rz * 0.85,
        s: ry * 2 * (low ? 1.1 : 0.85) + 160, h, rot: r() * 6.283, tile: i % 4, str: low ? 1.4 : 1.05 });
    }
    sortClouds(0, true);
  }

  // Cauliflower Worley-FBM puff atlas (2x2 tiles, 512 px), alpha only, feathered.
  const atlasTex = (() => {
    const N = 512, T = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(N, N), d = img.data;
    for (let tile = 0; tile < 4; tile++) {
      const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T, so = tile * 0.23 + 0.07;
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
        const u = i / T * 2 - 1, v = j / T * 2 - 1;
        const r = Math.hypot(u, v * (v > 0 ? 1.15 : 0.95));
        const bil = samp(nG, u * 0.33 + so, v * 0.33 + so * 1.7), fb = samp(nR, u * 0.5 + so, v * 0.5 - so), hi = samp(nB, u * 0.9 + so, v * 0.9);
        const edge = r + (0.5 - bil) * 0.62 + (0.5 - fb) * 0.25 + (0.5 - hi) * 0.12;
        let a = ss(1.0, 0.42, edge) * (0.78 + 0.35 * bil);
        a *= ss(1.0, 0.88, Math.max(Math.abs(u), Math.abs(v)));                 // feather before the tile edge
        const k = ((oy + j) * N + ox + i) * 4;
        d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  })();

  const NP = puffs.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  const cloudGeo = new THREE.InstancedBufferGeometry();
  cloudGeo.index = quad.index;
  cloudGeo.setAttribute('position', quad.attributes.position);
  cloudGeo.setAttribute('uv', quad.attributes.uv);
  const aOff = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3);
  const aData = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4);   // size, height-in-bank, rot, tile
  const aExt = new THREE.InstancedBufferAttribute(new Float32Array(NP * 2), 2);    // x-stretch, alpha
  cloudGeo.setAttribute('aOff', aOff); cloudGeo.setAttribute('aData', aData); cloudGeo.setAttribute('aExt', aExt);
  cloudGeo.instanceCount = NP;
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uAtlas: { value: null }, uWind: { value: new THREE.Vector3() }, uOpacity: { value: 0.96 },
      uTop: { value: new THREE.Color(0xffffff) }, uBelly: { value: new THREE.Color(0x6e89a8) }, uGain: { value: 1 }, uFlash: { value: 0 },
      uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uNear: { value: new THREE.Vector2(NEAR0, NEAR1) },
      uCap: { value: 8 }
    }]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aOff; attribute vec4 aData; attribute vec2 aExt;
      uniform vec3 uWind;
      varying vec2 vUv; varying vec2 vQ; varying float vH; varying float vAlpha; varying vec3 vView;
      void main() {
        float tile = aData.w;
        vUv = (uv * 0.98 + 0.01) * 0.5 + vec2(mod(tile, 2.0), floor(tile / 2.0)) * 0.5;
        vH = aData.y; vAlpha = aExt.y;
        float c = cos(aData.z), s = sin(aData.z);
        vec2 corner = position.xy * 2.0;                                   // -1..1 across the puff
        vQ = mat2(c, s, -s, c) * corner;                                   // same rotation as the card
        vec4 mvPosition = modelViewMatrix * vec4(aOff + uWind, 1.0);
        mvPosition.xy += mat2(c, s, -s, c) * (position.xy * vec2(aData.x * aExt.x, aData.x));
        vView = mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uAtlas; uniform float uOpacity;
      uniform vec3 uTop; uniform vec3 uBelly; uniform float uGain; uniform float uFlash;
      uniform vec3 uSunV; uniform vec3 uSunCol; uniform vec2 uNear; uniform float uCap;
      varying vec2 vUv; varying vec2 vQ; varying float vH; varying float vAlpha; varying vec3 vView;
      float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(uAtlas, vUv).a;
        if (a < 0.04) discard;
        float d = length(vView);
        float near = smoothstep(uNear.x, uNear.y, d);                    // 180 -> 40 m: fade into the vapour
        if (near < 0.002) discard;
        // Fake spherical normal (view space) across the puff: the card shades like a ball.
        float r2 = min(dot(vQ, vQ), 1.0);
        vec3 n = normalize(vec3(vQ * 0.85, sqrt(1.0 - r2) + 0.25));
        float wrap = clamp((dot(n, uSunV) + 0.55) / 1.55, 0.0, 1.0);    // wrap-lit sun term
        float bankShade = mix(0.55, 1.0, smoothstep(0.05, 0.85, vH));     // bellies sit in the bank's own shadow
        vec3 amb = mix(uBelly * 0.85, uTop * 0.82, smoothstep(0.0, 0.9, vH));
        vec3 sun = uSunCol * wrap * bankShade;
        // Henyey-Greenstein silver lining on thin edges when looking toward the sun.
        float cosT = dot(normalize(vView), uSunV);
        float rim = hg(cosT, 0.6) * 4.0 * (1.0 - smoothstep(0.12, 0.6, a)) * (0.5 + 0.5 * vH);
        vec3 col = (amb * 0.6 + sun * 0.62 + uSunCol * rim * 0.9) * mix(1.06, 0.92, smoothstep(0.3, 0.95, a));
        col = col * uGain + vec3(0.75, 0.8, 1.0) * uFlash * (0.45 + 0.55 * (1.0 - vH));
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        if (lum > uCap) col *= uCap / lum;                               // crisp white, never blooms
        gl_FragColor = vec4(col, a * uOpacity * vAlpha * near);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          float cfog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.5);   // banks keep ~half the haze
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cfog);
        #endif
      }`,
    transparent: true, depthWrite: false, fog: true
  });
  cloudMat.uniforms.uAtlas.value = atlasTex;
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.frustumCulled = false; clouds.renderOrder = 2;
  clouds.castShadow = false; clouds.receiveShadow = false;
  scene.add(clouds);
  const order = new Uint32Array(NP).map((_, i) => i), dist = new Float32Array(NP);
  let sortTimer = 0;
  function sortClouds(dt, force) {
    sortTimer -= dt;
    if (sortTimer > 0 && !force) return;
    sortTimer = 0.2;
    const p = camera.position, wx = windOff.x, wz = windOff.z;
    for (let i = 0; i < NP; i++) { const q = puffs[i]; dist[i] = (q.x + wx - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z + wz - p.z) ** 2; }
    order.sort((a, b) => dist[b] - dist[a]);
    for (let k = 0; k < NP; k++) {
      const q = puffs[order[k]];
      aOff.array[k * 3] = q.x; aOff.array[k * 3 + 1] = q.y; aOff.array[k * 3 + 2] = q.z;
      aData.array[k * 4] = banks[q.bi].on ? q.s : 0; aData.array[k * 4 + 1] = q.h; aData.array[k * 4 + 2] = q.rot; aData.array[k * 4 + 3] = q.tile;
      aExt.array[k * 2] = q.str; aExt.array[k * 2 + 1] = q.al;
    }
    aOff.needsUpdate = true; aData.needsUpdate = true; aExt.needsUpdate = true;
  }
  sortClouds(0, true);

  let coverage = 1;
  function setCoverage(k) {
    coverage = k;
    applyCloudLayout();
  }
  // Cloud layout for the current coverage + mode. Flags / uniforms only: no geometry or
  // shader rebuilds, so cycling presets never stalls.
  function applyCloudLayout() {
    const k = coverage;
    for (const b of banks) {
      if (b.dbg) continue;
      b.on = cloudSea ? !!b.sea : !b.sea && b.rank < 0.5 + 0.5 * k;    // CLEAR ~65 %, SCATTERED ~86 %, overcast all
    }
    // Sea mode: the deck drops to 3,500-5,800 ft beyond the arena with a broken-cumulus threshold.
    deckThr = cloudSea ? 0.36 : 0.6 - 0.4 * k;                          // CLEAR 0.48 / SCATTERED 0.31 / OVERCAST 0.20
    [deckBase, deckThick] = cloudSea ? DECK_SEA : DECK_HI;
    deckWin.k = cloudSea ? 1 : 0;
    const u = deckMat.uniforms;
    u.uThr.value = deckThr; u.uDeckY.value.set(deckBase, deckThick); u.uHoleK.value = deckWin.k;
    deckWin.list.forEach((w, i) => u.uWin.value[i].set(w.x, w.z, w.r));
    u.uCap.value = cloudMat.uniforms.uCap.value = cloudSea ? 0.86 : 8;
    sortClouds(0, true);
  }
  function setCloudSea(on) {
    if (cloudSea === !!on) return;
    cloudSea = !!on;
    applyCloudLayout();
  }
  // 0 outside .. 1 deep inside a bank or the deck (wind-drifted).
  function cloudDensity(p) {
    let best = 0;
    const px = p.x - windOff.x, pz = p.z - windOff.z;
    for (const b of banks) {
      if (!b.on) continue;
      const dx = px - b.x, dz = pz - b.z;
      const lx = (dx * b.c + dz * b.s) / (b.W * 0.47), lz = (-dx * b.s + dz * b.c) / (b.D * 0.47);
      const ly = (p.y - (b.base + b.H * 0.5)) / (b.H * 0.62);
      const d2 = lx * lx + ly * ly + lz * lz;
      if (d2 < 1) best = Math.max(best, smooth(1 - Math.sqrt(d2), 0, 0.45));
    }
    if (p.y > deckBase && p.y < deckBase + deckThick) best = Math.max(best, Math.min(1, deckDensity(p.x, p.y, p.z) * 1.4));
    return best;
  }
  let mist = 0, cloudTime = 0, frame = 0;
  function updateMist(dt) {
    let target = cloudDensity(camera.position);
    if (force.mist) target = 1;
    mist += (target - mist) * Math.min(1, dt * (target > mist ? 5.0 : 2.9));   // plunge ~0.2 s, clear ~0.8 s
  }
  const _sv = new THREE.Vector3(), _cf = new THREE.Vector3();
  function updateWind(dt) {
    cloudTime += dt;
    windOff.copy(WIND).multiplyScalar(cloudTime);
    cloudMat.uniforms.uWind.value.copy(windOff);
    deckMat.uniforms.uWind.value.copy(windOff);
    deck.position.copy(camera.position);
    deckMat.uniforms.uSun.value.copy(SUN).normalize();
    deckMat.uniforms.uCamFwd.value.copy(camera.getWorldDirection(_cf));
    deckMat.uniforms.uFrame.value = (frame++ % 64);
    cloudMat.uniforms.uSunV.value.copy(_sv.copy(SUN).normalize().transformDirection(camera.matrixWorldInverse));
    // Draw order: below the deck it is behind the banks; above it, the banks are under it.
    const above = camera.position.y > deckBase + deckThick * 0.5;
    deck.renderOrder = above ? 3 : 1; clouds.renderOrder = 2;
  }

  /* ------------------------------------------------------------- update */
  const _w = new THREE.Vector3();
  function update(dt, now, s, opts) {
    const q = s.quaternion;
    updatePlumes(s, now);

    // Wingtip condensation: brisk pulls / banks (> 2 G, |AoA| > 7.5 deg, |roll| > 1.2 rad/s)
    // above 160 kt; +40 % in humid / overcast / rain air or inside cloud; dries out above 22,000 ft.
    const kts = s.speed * 1.94384, altFt = s.position.y / FT;
    const aoaDeg = Math.abs(s.alpha || 0) * 57.2958;
    const pull = Math.max(smooth(s.gLoad, 2.0, 5.5), smooth(aoaDeg, 7.5, 15), 0.6 * smooth(Math.abs(s.rollRate), 1.2, 2.6));
    const inCloud = opts.cloud || 0;
    const humid = Math.max(smooth(coverage, 0.6, 1.0), Math.min(1, opts.rain || 0), inCloud > 0.25 ? 1 : 0);
    const dry = 1 - smooth(altFt, 18000, 26000);
    let vT = opts.visible ? Math.min(1, pull * (0.72 + 0.28 * (s.highG ? 1 : 0))) * smooth(kts, 160, 200) * (1 + 0.4 * humid) * (0.25 + 0.75 * dry) : 0;
    if (force.vapor && opts.visible) vT = 1;
    if (aoaDeg > 35 && opts.visible) vT = 1;                 // post-stall: dense wingtip vapor
    vT = Math.min(1, vT);
    vaporTarget += (vT - vaporTarget) * Math.min(1, dt * (vT > vaporTarget ? 6.0 : 2.5));
    // LEX / root sheet: > 4.8 G or AoA > 14 deg, thick air only.
    let lT = opts.visible ? Math.max(smooth(s.gLoad, 4.8, 7.5), smooth(aoaDeg, 14, 24)) * smooth(kts, 140, 190) * (1 + 0.4 * humid) * (1 - smooth(altFt, 14000, 20000)) : 0;
    if (force.vapor && opts.visible) lT = 1;
    if (aoaDeg > 35 && opts.visible) lT = 1;                 // post-stall: dense LEX sheet
    lT = Math.min(1, lT);
    lexTarget += (lT - lexTarget) * Math.min(1, dt * (lT > lexTarget ? 6.0 : 2.5));
    _ribCol.copy(RIB_DAY).lerp(RIB_OVC, humid).multiply(vaporTint);
    for (const r of ribbons) r.mat.uniforms.uCol.value.copy(_ribCol);
    trailL.emit(_w.copy(tipL).applyQuaternion(q).add(s.position), vaporTarget, now);
    trailR.emit(_w.copy(tipR).applyQuaternion(q).add(s.position), vaporTarget, now);
    lexL.emit(_w.copy(lexPL).applyQuaternion(q).add(s.position), lexTarget, now);
    lexR.emit(_w.copy(lexPR).applyQuaternion(q).add(s.position), lexTarget, now);
    for (const r of ribbons) r.update(camera.position, now);

    // Over-wing condensation puffs: above 4.8 G / 14 deg AoA, below 12,000 ft, denser in thick air.
    const rhoRatio = Math.exp(-s.position.y / 8500);
    const gTrig = Math.max(smooth(s.gLoad, 4.8, 8.0), smooth(aoaDeg, 14, 26)) + (s.highG && s.gLoad > 4.8 ? 0.25 : 0);
    const vTarget = force.vapor ? 1 : opts.visible
      ? Math.min(1, gTrig) * (1 - smooth(altFt, 10000, 12000)) * (0.55 + 0.45 * rhoRatio) * smooth(s.speed, 110, 190) : 0;
    vaporLevel += (vTarget - vaporLevel) * Math.min(1, dt * (vTarget > vaporLevel ? 6 : 2.2));
    if (vaporLevel < 0.004) {
      vaporPoints.visible = false;
    } else {
      vaporPoints.visible = true;
      const drift = 0.9 + 1.6 * vaporLevel;                       // stronger pull -> faster aft streaming
      const turb = 0.06 + 0.12 * vaporLevel;
      for (let i = 0; i < vapor.length; i++) {
        const v = vapor[i];
        v.u += dt * v.speed * drift * 0.55;
        if (v.u > 1) v.u -= 1;
        const z = THREE.MathUtils.lerp(v.zf, v.za, v.u);
        vpPos[i * 3] = v.x + Math.sin(now * 7 + v.wob) * turb;
        vpPos[i * 3 + 1] = v.y + Math.sin(now * 11 + v.phase) * turb * 0.6 + v.u * 0.25;
        vpPos[i * 3 + 2] = z;
        const life = Math.sin(Math.PI * v.u);                     // fade in at the lane front, out aft
        const flick = 0.75 + 0.25 * Math.sin(now * 13 + v.phase) * Math.sin(now * 5.3 + v.phase * 2);
        vpAlpha[i] = vaporLevel * flick * life * 0.75;
        vpSize[i] = v.base * (0.7 + 0.5 * v.u) * (0.85 + 0.35 * vaporLevel);
      }
      vpGeo.attributes.position.needsUpdate = true;
      vpGeo.attributes.aAlpha.needsUpdate = true;
      vpGeo.attributes.aSize.needsUpdate = true;
      vpMat.uniforms.uCol.value.copy(vaporTint);
      vpMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }

    updateSpeedLines(s, dt, opts.firstPerson);
    updateMachCone(dt, s.mach, opts.firstPerson);
    updateSpray(s, dt, opts.visible);
    catSteam.update(dt);
    aaTracer.update(dt);
    rooster.update(dt);
    wake.update(dt);
    updateWind(dt);
    updateMist(dt);
    sortClouds(dt, false);
  }

  return {
    attachPlume,
    setWingtips(l, r) { tipL.copy(l); tipR.copy(r); buildVapor(); },
    clearTrails() { for (const r of ribbons) r.clear(); for (const r of contrails) r.clear(); contrailStats.active = contrailStats.live = 0; vaporTarget = lexTarget = 0; for (const q of sprayP) q.on = false; vaporLevel = 0; vaporPoints.visible = false; catSteam.reset(); rooster.reset(); wake.reset(); },
    catSteam, aaTracer, spray: rooster, wake,
    updateContrails,
    get contrailStats() { return contrailStats; },
    update,
    get mist() { return mist; },
    cloudDensity, placeDebugCloud,
    get cloudCount() { return banks.filter(b => b.on && !b.dbg).length; },
    setCloudSea, get cloudSea() { return cloudSea; },
    get wind() { return WIND; },                          // live cloud wind (m/s), reseeded per sortie
    // Cloud-sea layout stats: bank count, size ranges (m), base / top ft, min clearance from the windows.
    get seaStats() {
      const s = banks.filter(b => b.sea);
      const win = SEA_WINDOWS.map(w => Math.round(Math.min(...s.map(b => Math.hypot(b.x - w.x, b.z - w.z) - b.W * 0.5)) - w.r));
      return { banks: seaCount, on: s.filter(b => b.on).length, W: [Math.round(Math.min(...s.map(b => b.W))), Math.round(Math.max(...s.map(b => b.W)))],
        H: [Math.round(Math.min(...s.map(b => b.H))), Math.round(Math.max(...s.map(b => b.H)))],
        aspect: [+Math.min(...s.map(b => b.W / b.H)).toFixed(2), +Math.max(...s.map(b => b.W / b.H)).toFixed(2)],
        baseFt: Math.round(Math.min(...s.map(b => b.base)) / FT), topFt: Math.round(Math.max(...s.map(b => b.base + b.H)) / FT),
        puffLowFt: Math.round(Math.min(...puffs.filter(q => banks[q.bi].sea).map(q => q.y - q.s * 0.36)) / FT), windowClear: win,
        deck: { base: Math.round(deckBase / FT), top: Math.round((deckBase + deckThick) / FT), windows: deckWin.k, thr: deckThr } };
    },
    // Debug: bank layout (centre, width x depth x height, base, yaw) and the deck threshold.
    get cloudBanks() { return banks.filter(b => !b.dbg).map(b => ({ x: Math.round(b.x), z: Math.round(b.z), W: Math.round(b.W), D: Math.round(b.D), H: Math.round(b.H), base: Math.round(b.base), on: b.on })); },
    get deckThreshold() { return deckThr; },
    get puffCount() { return NP; },
    setCloudGain(k) { cloudMat.uniforms.uGain.value = k; deckMat.uniforms.uGain.value = k; },
    setEngineOut,
    setCloudCoverage: setCoverage,
    setCloudFlash(k) { cloudMat.uniforms.uFlash.value = k; deckMat.uniforms.uFlash.value = k; },
    get cloudCoverage() { return coverage; },
    // low = (unused), mid = cumulus banks shown, high = deck coverage % (sampled).
    get cloudLayers() {
      let n = 0, hit = 0;
      for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) { n++; if (deckDensity(ARENA.x + (i - 12) * 1500, deckBase + deckThick * 0.3, ARENA.z + (j - 12) * 1500) > 0.2) hit++; }
      return { low: 0, mid: banks.filter(b => b.on && !b.dbg).length, high: Math.round(100 * hit / n) };
    },
    // Preset colours from src/atmosphere.js: cloud top / belly + sun colour and strength.
    setCloudColors(top, belly, sun, k = 1) {
      for (const m of [cloudMat, deckMat]) { m.uniforms.uTop.value.copy(top); m.uniforms.uBelly.value.copy(belly); }
      if (sun) { sunCol.copy(sun); sunK = k; }
      const sc = sunCol.clone().multiplyScalar(Math.min(1.25, sunK));
      cloudMat.uniforms.uSunCol.value.copy(sc); deckMat.uniforms.uSunCol.value.copy(sc);
    },
    // New sortie: random wind heading (5-9 m/s) and drift phase so the decks never repeat.
    reseedClouds() {
      const a = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 4;
      WIND.set(Math.cos(a) * sp, 0, Math.sin(a) * sp);
      cloudTime = Math.random() * 900;
      updateWind(0); sortClouds(0, true);
    },
    get trailPoints() { return trailL.live || 0; },
    // Ribbon state for debugging: condensation levels, samples, live (visible) samples, colour.
    get ribbons() {
      return { vapor: +vaporTarget.toFixed(3), lex: +lexTarget.toFixed(3),
        tipL: { n: trailL.count, live: trailL.live || 0 }, tipR: { n: trailR.count, live: trailR.live || 0 },
        lexL: { n: lexL.count, live: lexL.live || 0 }, lexR: { n: lexR.count, live: lexR.live || 0 },
        col: '#' + _ribCol.getHexString() };
    },
    get vaporLevel() { return vaporLevel; },
    // Time-of-day tint for condensation (white at noon, rose at dawn, dim blue-grey at night).
    setVaporTint(c) { vaporTint.copy(c); },
    get coneOpacity() { return machConeInner.material.uniforms.uOp.value; },
    get sprayCount() { return sprayP.filter(q => q.on).length; },
    clouds
  };
}
