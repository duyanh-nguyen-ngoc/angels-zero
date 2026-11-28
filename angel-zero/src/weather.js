// ANGELS ZERO — randomized dynamic weather.
// Four states rolled with the time of day on every sortie / restart (or picked
// with the briefing's [ CYCLE WEATHER ] button):
//   CLEAR          crisp visibility, a few cumulus decks, high cirrus
//   SCATTERED      scattered-to-heavy cumulus, light haze
//   OVERCAST_RAIN  slate overcast (#4a5568 day / #0d131f night), tight haze,
//                  wind-chopped sea, steady rain
//   THUNDERSTORM   dense storm cover, heavy slanting rain, +/-0.4 G gust
//                  buffeting, sheet lightning (flash -> delayed thunder roll)
// Owns: the weather parameters every other module reads (coverage, overcast,
// fog multiplier, rain, chop, turbulence, lightning flash), the aircraft-
// centred rain volume (velocity-streaked line segments, alpha-faded per drop)
// and the lightning / gust timers. Rain falls below the cloud deck only and
// clears above ~6,200 ft.

export const WEATHER = {
  // Theatre weather paired with the CLOUD_SEA lighting preset: a cohesive cumulus sea at
  // 3,500-5,800 ft (sea: 1 switches vfx to the cloud-sea layout), crisp air, light chop.
  CLOUD_SEA:     { label: 'DAYLIGHT // CLOUD SEA', chip: 'CLOUD SEA // 3,500-5,800 FT', coverage: 0.48, overcast: 0.0, fogMul: 0.95, rain: 0, chop: 0.16, turb: 0.04, storm: 0, sea: 1 },
  CLEAR:        { label: 'CLEAR',             chip: 'CLEAR',             coverage: 0.3,  overcast: 0.0,  fogMul: 0.9, rain: 0,    chop: 0.05, turb: 0,    storm: 0 },
  SCATTERED:     { label: 'SCATTERED',         chip: 'SCATTERED CLOUD',   coverage: 0.72, overcast: 0.12, fogMul: 1.05, rain: 0,   chop: 0.2,  turb: 0.05, storm: 0 },
  OVERCAST_RAIN: { label: 'OVERCAST // RAIN',  chip: 'OVERCAST // RAIN',  coverage: 1.0,  overcast: 0.86, fogMul: 2.3, rain: 0.62, chop: 0.62, turb: 0.15, storm: 0 },
  THUNDERSTORM:  { label: 'THUNDERSTORM',      chip: 'THUNDERSTORM // HEAVY RAIN', coverage: 1.0, overcast: 0.9, fogMul: 2.9, rain: 1.0, chop: 1.0, turb: 1.0, storm: 1 },
  // Theatre weather paired with the STORM_OPS lighting preset (selected together, like
  // CLOUD_SEA): full storm deck, moderate overcast so the moon key and god rays survive,
  // light rain, sheet lightning, heavy chop, mild gusts. Never rolled at random.
  STORM_OPS:     { label: 'STORM OPS',         chip: 'STORM OPS // CARRIER WX', coverage: 1.0, overcast: 0.5, fogMul: 1.7, rain: 0.68, chop: 0.85, turb: 0.25, storm: 1 }
};
export const WEATHER_ORDER = ['CLOUD_SEA', 'CLEAR', 'SCATTERED', 'OVERCAST_RAIN', 'THUNDERSTORM', 'STORM_OPS'];
const NUM = ['coverage', 'overcast', 'fogMul', 'rain', 'chop', 'turb', 'storm'];
const FT = 0.3048;
const RAIN_TOP = 6200 * FT, RAIN_FADE = 600 * FT;

export function createWeather(THREE, env) {
  const { scene, camera } = env;
  const smooth = THREE.MathUtils.smoothstep;
  const cur = {}, tgt = {};
  for (const k of NUM) cur[k] = tgt[k] = WEATHER.CLEAR[k];
  let active = { name: 'CLEAR', ...WEATHER.CLEAR };
  let blend = 1;

  function set(name, opts = {}) {
    if (!WEATHER[name]) name = 'CLEAR';
    active = { name, ...WEATHER[name] };
    for (const k of NUM) tgt[k] = WEATHER[name][k];
    if (opts.instant) { for (const k of NUM) cur[k] = tgt[k]; blend = 1; } else blend = 0;
    lightning.next = 4 + Math.random() * 6;
    if (env.onChange) env.onChange(active);
    return active;
  }
  // Random roll: clear / scattered most often, rain and storms common enough to matter.
  function roll(opts = {}) {
    const r = Math.random();
    const name = r < 0.24 ? 'CLEAR' : r < 0.56 ? 'SCATTERED' : r < 0.82 ? 'OVERCAST_RAIN' : 'THUNDERSTORM';
    return set(name, opts);
  }

  /* ------------------------------------------------------------ rain volume */
  // N drops in a 140 x 90 x 140 m box that wraps around the camera. Each drop
  // is a 2-vertex segment drawn along its velocity relative to the jet, so the
  // streaks tilt with airspeed and slip; the tail vertex is fully transparent.
  const N = 2800, BX = 140, BY = 90, BZ = 140;
  const pos = new Float32Array(N * 6), col = new Float32Array(N * 8);
  const drops = new Float32Array(N * 3), dropVar = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    drops[i * 3] = (Math.random() - 0.5) * BX; drops[i * 3 + 1] = (Math.random() - 0.5) * BY; drops[i * 3 + 2] = (Math.random() - 0.5) * BZ;
    dropVar[i] = 0.55 + Math.random() * 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const rainMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true, toneMapped: true });
  const rainMesh = new THREE.LineSegments(geo, rainMat);
  rainMesh.frustumCulled = false; rainMesh.renderOrder = 3;
  scene.add(rainMesh);
  const wind = new THREE.Vector3(), rel = new THREE.Vector3(), base = new THREE.Vector3(), _dir = new THREE.Vector3();
  let fallOff = 0;                                   // world-space drop drift, kept bounded

  // Distant volumetric rain curtains under the storm deck (6 pre-allocated sheets).
  const CURTAINS = [
    { az: 0.15, d: 1550, w: 850, h: 2400, seed: 1.3 },
    { az: 1.25, d: 2400, w: 1150, h: 2400, seed: 2.7 },
    { az: 2.25, d: 1900, w: 920, h: 2400, seed: 4.1 },
    { az: -2.6, d: 3100, w: 1300, h: 2400, seed: 5.5 },
    { az: -1.45, d: 2150, w: 1000, h: 2400, seed: 7.2 },
    { az: -0.55, d: 3500, w: 1250, h: 2400, seed: 8.9 }
  ];
  const curtainGeo = new THREE.PlaneGeometry(1, 1);
  const curtainMeshes = CURTAINS.map(c => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uFlash: { value: 0 }, uSeed: { value: c.seed } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform float uTime; uniform float uAlpha; uniform float uFlash; uniform float uSeed;
        varying vec2 vUv;
        void main() {
          #include <logdepthbuf_fragment>
          float x = abs(vUv.x * 2.0 - 1.0);
          float hFade = pow(max(1.0 - x, 0.0), 1.7);
          float vFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
          float slant = vUv.x + vUv.y * 0.14;
          float s1 = 0.6 + 0.4 * sin(slant * 48.0 + uSeed + uTime * 2.1);
          float s2 = 0.65 + 0.35 * sin(slant * 115.0 - uSeed * 1.7 + uTime * 3.8);
          float sheet = 0.55 + 0.45 * sin(vUv.x * 9.0 + uSeed);
          float a = uAlpha * hFade * vFade * s1 * s2 * sheet;
          if (a < 0.004) discard;
          vec3 col = mix(vec3(0.46, 0.54, 0.64), vec3(0.86, 0.92, 1.0), min(1.0, uFlash));
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    const m = new THREE.Mesh(curtainGeo, mat);
    m.frustumCulled = false; m.renderOrder = 2; m.visible = false;
    scene.add(m);
    return { mesh: m, mat, cfg: c };
  });

  /* ------------------------------------------------- lightning / gusts */
  const lightning = { next: 8, flash: 0, t: -1, pulses: [], thunder: [], count: 0, lastDist: 0 };
  const gust = { g: 0, roll: 0, pitch: 0, a: 0, b: 0, c: 0 };
  let time = 0, rainHere = 0, rainLevelSmooth = 0;

  // dt, playerVel (world m/s), alt (m) of the camera; nightK 0..1 (darker drops).
  // fp: cockpit view -- any streak passing within EYE_CLEAR of the eye is culled so
  // exterior rain never crosses the panel, combiner or canopy bow (the glass shader
  // draws the water that actually lands on the canopy).
  const EYE_CLEAR = 2.8;
  let culled = 0;
  function update(dt, playerVel, nightK = 0, fp = false) {
    time += dt;
    if (blend < 1) {
      blend = Math.min(1, blend + dt / 2);
      const k = blend >= 1 ? 1 : 1 - Math.exp(-dt * 2.5);
      for (const key of NUM) cur[key] += (tgt[key] - cur[key]) * k;
    }
    const cam = camera.position;
    // Rain only under the deck: full below ~5,600 ft, gone above 6,200 ft.
    rainHere = cur.rain * (1 - smooth(cam.y, RAIN_TOP - RAIN_FADE, RAIN_TOP));
    rainLevelSmooth += (rainHere - rainLevelSmooth) * Math.min(1, dt * 3);

    // Storm wind slant + gentle swirl.
    wind.set(5 + 9 * cur.storm, 0, 2.5 + 4 * cur.storm).multiplyScalar(0.4 + 0.6 * cur.rain);
    const fall = 9 + 2 * cur.storm;
    rainMesh.visible = rainLevelSmooth > 0.01;
    if (rainMesh.visible) {
      const nDraw = Math.floor(N * Math.min(1, 0.25 + 0.75 * rainLevelSmooth));
      rel.set(wind.x - playerVel.x, -fall - playerVel.y, wind.z - playerVel.z);   // drop velocity seen from the jet
      const relLen = rel.length();
      const L = Math.min(11, Math.max(0.7, relLen * 0.014));                        // ~1/70 s exposure streak
      const dir = _dir.copy(rel).divideScalar(Math.max(relLen, 1e-3));
      const bright = Math.min(1.0, (0.62 - 0.4 * nightK) + lightning.flash * 0.55);
      const cr = bright * 0.92, cg = bright * 0.96, cb = bright;
      const aMax = Math.min(0.85, (0.24 + 0.36 * rainLevelSmooth) * (1 - 0.3 * nightK) + lightning.flash * 0.25);
      base.copy(cam);
      culled = 0;
      for (let i = 0; i < N; i++) {
        let x = drops[i * 3] + wind.x * dt, y = drops[i * 3 + 1] - fall * dt, z = drops[i * 3 + 2] + wind.z * dt;
        // World-fixed drops, wrapped into the box around the moving camera.
        x = ((x - base.x) % BX + BX * 1.5) % BX - BX / 2 + base.x;
        y = ((y - base.y) % BY + BY * 1.5) % BY - BY / 2 + base.y;
        z = ((z - base.z) % BZ + BZ * 1.5) % BZ - BZ / 2 + base.z;
        drops[i * 3] = x; drops[i * 3 + 1] = y; drops[i * 3 + 2] = z;
        const o = i * 6, c = i * 8, v = dropVar[i], lDrop = L * v;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x - dir.x * lDrop; pos[o + 4] = y - dir.y * lDrop; pos[o + 5] = z - dir.z * lDrop;
        // Fade drops right at the eye (canopy) and toward the box edge.
        const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let a = i < nDraw ? aMax * v * smooth(d, 3.5, 9) * (1 - smooth(d, 48, 66)) : 0;
        if (fp && a > 0) {
          // Closest approach of the streak (head -> head - dir * lDrop) to the eye.
          const t = Math.min(lDrop, Math.max(0, dx * dir.x + dy * dir.y + dz * dir.z));
          const qx = dx - dir.x * t, qy = dy - dir.y * t, qz = dz - dir.z * t;
          if (qx * qx + qy * qy + qz * qz < EYE_CLEAR * EYE_CLEAR) { a = 0; culled++; }
        }
        col[c] = cr; col[c + 1] = cg; col[c + 2] = cb; col[c + 3] = a;
        col[c + 4] = cr; col[c + 5] = cg; col[c + 6] = cb; col[c + 7] = 0;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    }

    // Update distant volumetric rain curtains under the storm deck.
    const showCurtains = rainLevelSmooth > 0.04;
    for (let i = 0; i < curtainMeshes.length; i++) {
      const ct = curtainMeshes[i], m = ct.mesh, cfg = ct.cfg;
      m.visible = showCurtains;
      if (!showCurtains) continue;
      const az = cfg.az + time * 0.008;
      const cx = cam.x + Math.sin(az) * cfg.d, cz = cam.z + Math.cos(az) * cfg.d;
      m.position.set(cx, cfg.h * 0.45, cz);
      m.scale.set(cfg.w, cfg.h, 1);
      m.rotation.set(0, az, 0);
      ct.mat.uniforms.uTime.value = time;
      ct.mat.uniforms.uAlpha.value = Math.min(0.28, 0.22 * rainLevelSmooth * (1 - 0.35 * nightK) + lightning.flash * 0.14);
      ct.mat.uniforms.uFlash.value = lightning.flash;
    }

    // Sheet lightning: a double / triple flicker, thunder after the sound delay.
    lightning.flash = 0;
    if (cur.storm > 0.5) {
      lightning.next -= dt;
      if (lightning.next <= 0) {
        lightning.next = 6 + Math.random() * 11;
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        lightning.pulses = Array.from({ length: n }, (_, k) => ({ t: k * (0.07 + Math.random() * 0.09), k: k ? 0.55 + Math.random() * 0.4 : 1 }));
        lightning.t = 0; lightning.count++;
        const dist = 2500 + Math.random() * 9000;
        lightning.lastDist = dist;
        lightning.thunder.push({ t: Math.min(9, dist / 343), k: Math.max(0.25, 1.2 - dist / 11000) });
        if (env.onLightning) env.onLightning(dist);
      }
    }
    if (lightning.t >= 0) {
      lightning.t += dt;
      for (const p of lightning.pulses) {
        const u = lightning.t - p.t;
        if (u >= 0 && u < 0.16) lightning.flash = Math.max(lightning.flash, p.k * (u < 0.02 ? u / 0.02 : Math.exp(-(u - 0.02) * 22)));
      }
      if (lightning.t > 0.7) lightning.t = -1;
    }
    for (let i = lightning.thunder.length - 1; i >= 0; i--) {
      const th = lightning.thunder[i]; th.t -= dt;
      if (th.t <= 0) { lightning.thunder.splice(i, 1); if (env.onThunder) env.onThunder(th.k); }
    }

    // Gust buffeting: smooth band-limited noise, +/-0.4 G at full storm.
    const tb = cur.turb;
    gust.g = tb * 0.4 * (0.55 * Math.sin(time * 2.3 + 1.1) * Math.sin(time * 0.71) + 0.3 * Math.sin(time * 5.7 + Math.sin(time * 1.3) * 2) + 0.15 * Math.sin(time * 11.3));
    gust.roll = tb * 0.05 * (Math.sin(time * 1.9 + 0.4) + 0.5 * Math.sin(time * 4.4));
    gust.pitch = tb * 0.02 * Math.sin(time * 3.1 + 2.0);
  }

  return {
    set, roll, update,
    get active() { return active; },
    get current() { return cur; },
    get rainHere() { return rainHere; },
    get flash() { return lightning.flash; },
    get gust() { return gust; },
    get lightningCount() { return lightning.count; },
    get rainVisible() { return rainMesh.visible; },
    get rainMesh() { return rainMesh; },
    get rainCulled() { return culled; },              // streaks culled around the cockpit eye last frame
    // Debug / verification: closest visible streak to the camera (metres).
    nearestVisible() {
      let best = Infinity;
      const c = camera.position;
      for (let i = 0; i < N; i++) {
        if (col[i * 8 + 3] <= 0) continue;
        const o = i * 6, hx = pos[o] - c.x, hy = pos[o + 1] - c.y, hz = pos[o + 2] - c.z;
        const ex = pos[o + 3] - pos[o], ey = pos[o + 4] - pos[o + 1], ez = pos[o + 5] - pos[o + 2];
        const l2 = ex * ex + ey * ey + ez * ez || 1;
        const t = Math.min(1, Math.max(0, -(hx * ex + hy * ey + hz * ez) / l2));
        best = Math.min(best, Math.hypot(hx + ex * t, hy + ey * t, hz + ez * t));
      }
      return best;
    }
  };
}
