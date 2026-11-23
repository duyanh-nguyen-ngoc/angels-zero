// ANGELS ZERO — physical 3D bubble canopy glass (1st-person cockpit).
//
// A curved acrylic shell around the pilot, built in the cockpit-rig frame (eye at
// the origin, nose -Z, metres): forward windscreen from the nose coaming up to the
// canopy bow, then the bubble over the head and back past the seat, closing on the
// side rails. A thin dark rubber / metal seal follows the rails, coaming and rear
// edge. One ShaderMaterial does everything (premultiplied alpha, depthWrite off,
// drawn after the exterior rain and before the HUD combiner):
//   - sun / sky glare arcs: two GGX lobes on the curved normals (crisp arc + broad
//     haze) sweeping over the arch as the jet banks and pitches; milky forward
//     scatter when looking toward the sun through the acrylic;
//   - cool polycarbonate Fresnel sheen pow(1 - |N.V|, 3.2) hugging the rails and
//     coaming while the forward sightline stays clear;
//   - faint procedural micro-scratches that only light up inside the sun glare;
//   - a subtle emerald HUD bounce low on the windscreen under the combiner;
//   - procedural water: two layers of droplets (pop on impact, lens / refract the
//     sky, dark rim, glint, short wet trails) on glass coordinates that run from
//     the nose up and back over the arch. Airspeed drives the slide: slow beads
//     trickle back below ~120 kt, sleek streaks whip back over the curve in a
//     dogfight, hard rolls deflect them sideways. Cloud moisture adds fine mist
//     streaks that evaporate ~2.5 s after breaking out.

export function createCanopyGlass(THREE, env) {
  const { parent, sunDir, fogColor } = env;
  const ss = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Profile tables along z (rig frame): glass top height, rail / sill height, half-width.
  const Z0 = -1.42, Z1 = 0.62;
  const lerpTable = (tab, z) => {
    if (z <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) if (z <= tab[i][0]) {
      const [za, a] = tab[i - 1], [zb, b] = tab[i], t = (z - za) / (zb - za);
      return a + (b - a) * t * t * (3 - 2 * t);
    }
    return tab[tab.length - 1][1];
  };
  const TOP = [[-1.42, -0.17], [-1.18, 0.15], [-0.93, 0.47], [-0.5, 0.57], [0.0, 0.59], [0.35, 0.5], [0.62, 0.24]];
  const BASE = [[-1.42, -0.25], [-0.93, -0.38], [-0.52, -0.42], [0.62, -0.40]];
  const HALF = [[-1.42, 0.3], [-1.15, 0.52], [-0.93, 0.69], [0.62, 0.63]];
  const NU = 72, NV = 56;
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3), uvs = new Float32Array((NU + 1) * (NV + 1) * 2), met = new Float32Array((NU + 1) * (NV + 1) * 2);
  const idx = [];
  const point = (u, v, out) => {
    const z = Z0 + (Z1 - Z0) * u, top = lerpTable(TOP, z), base = lerpTable(BASE, z), w = lerpTable(HALF, z);
    const th = v * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    // Superellipse cross-section: full-width sides, rounded crown.
    const x = w * Math.sign(s) * Math.pow(Math.abs(s), 0.82), y = base + (top - base) * Math.pow(Math.max(c, 0), 0.72);
    out[0] = x; out[1] = y; out[2] = z;
    return out;
  };
  const p = [0, 0, 0], pPrev = [0, 0, 0];
  // Metric glass coordinates: x = arc length across (from the centre line), y = arc
  // length along the slipstream (from the nose coaming, up and back over the arch).
  const along = new Float32Array(NU + 1);
  for (let i = 1; i <= NU; i++) {
    point(i / NU, 0, p); point((i - 1) / NU, 0, pPrev);
    along[i] = along[i - 1] + Math.hypot(p[0] - pPrev[0], p[1] - pPrev[1], p[2] - pPrev[2]);
  }
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    let acc = 0; point(u, 0, pPrev);
    const across = [0];
    for (let j = 1; j <= NV / 2; j++) { point(u, j / (NV / 2), p); acc += Math.hypot(p[0] - pPrev[0], p[1] - pPrev[1], p[2] - pPrev[2]); across.push(acc); pPrev[0] = p[0]; pPrev[1] = p[1]; pPrev[2] = p[2]; }
    for (let j = 0; j <= NV; j++) {
      const v = j / NV * 2 - 1, k = (i * (NV + 1) + j);
      point(u, v, p);
      pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
      uvs[k * 2] = u; uvs[k * 2 + 1] = v;
      met[k * 2] = Math.sign(v) * across[Math.round(Math.abs(v) * NV / 2)]; met[k * 2 + 1] = along[i];
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aMet', new THREE.BufferAttribute(met, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const U = {
    uSun: { value: sunDir }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    uSky: { value: new THREE.Color(0.35, 0.5, 0.75) }, uHor: { value: fogColor },
    uGain: { value: 1 }, uGlare: { value: 1 }, uHud: { value: 1 },
    uTime: { value: 0 }, uRain: { value: 0 }, uMoist: { value: 0 }, uFrost: { value: 0 }, uPunch: { value: 0 },
    uFlow: { value: new THREE.Vector2() }, uStretch: { value: 1 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide,
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec2 aMet;
      varying vec3 vWPos; varying vec3 vWN; varying vec2 vUv; varying vec2 vMet;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz; vWN = normalize(mat3(modelMatrix) * normal); vUv = uv; vMet = aMet;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uHor;
      uniform float uGain; uniform float uGlare; uniform float uHud;
      uniform float uTime; uniform float uRain; uniform float uMoist; uniform float uFrost; uniform float uPunch; uniform vec2 uFlow; uniform float uStretch;
      varying vec3 vWPos; varying vec3 vWN; varying vec2 vUv; varying vec2 vMet;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float ggx(float ndh, float a) { float a2 = a * a, d = ndh * ndh * (a2 - 1.0) + 1.0; return a2 / (3.14159265 * d * d); }
      // One droplet layer in flow-scrolled glass space (metres). Returns (mask, rim, trail).
      vec3 drops(vec2 P, float cell, float density, float stretch, float seed, float rate) {
        vec2 q = (P - uFlow) / cell;
        vec2 id = floor(q), f = fract(q) - 0.5;
        float h = h21(id + seed), h2 = h21(id + seed + 7.13), h3 = h21(id + seed + 3.71);
        float life = fract(uTime * rate * (0.6 + 0.8 * h2) + h3);
        float live = step(h, density) * smoothstep(0.0, 0.05, life) * (1.0 - smoothstep(0.7, 1.0, life));
        vec2 c = (vec2(h2, h3) - 0.5) * 0.56;                   // wide jitter: no visible lattice
        float r = mix(0.12, 0.24, h21(id + seed + 5.9));
        float st = min(stretch, (0.48 - abs(c.y)) / r);         // stays inside its cell
        vec2 d = f - c; d.y /= st;
        float dist = length(d) / r;
        float m = (1.0 - smoothstep(0.78, 1.0, dist)) * live;
        // Thin wet trail left upstream (toward the nose) of the moving drop.
        float back = (c.y - f.y) / 0.45;
        float trail = live * step(0.0, back) * (1.0 - smoothstep(0.0, 1.0, back)) * (1.0 - smoothstep(0.0, r * 0.35, abs(f.x - c.x)));
        return vec3(m, dist, trail * (1.0 - m));
      }
      float scratches(vec2 p) {
        float s = 0.0;
        for (int i = 0; i < 3; i++) {
          float ang = float(i) * 2.13 + 0.4;
          vec2 dir = vec2(cos(ang), sin(ang));
          vec2 q = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x))) * vec2(7.0, 260.0);
          vec2 cid = floor(q);
          float line = 1.0 - smoothstep(0.0, 0.12, abs(fract(q.y) - 0.5));
          s += line * step(0.94, h21(cid + float(i) * 17.0));
        }
        return s;
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 V = normalize(cameraPosition - vWPos);
        vec3 N = normalize(vWN); if (dot(N, V) < 0.0) N = -N;
        vec3 L = normalize(uSun);
        float ndv = abs(dot(N, V));
        float sunUp = smoothstep(-0.06, 0.04, L.y) * uGlare;
        // Edges: side rails, nose coaming, rear seal.
        float edge = smoothstep(0.7, 1.0, abs(vUv.y)) + 0.6 * smoothstep(0.1, 0.0, vUv.x) + 0.5 * smoothstep(0.9, 1.0, vUv.x);
        // Cool polycarbonate Fresnel sheen (sky / horizon tinted), strongest at the rails.
        float fres = pow(1.0 - ndv, 3.2);
        vec3 sheenC = mix(uHor, uSky, 0.55) * vec3(0.86, 0.95, 1.08) * uGain;
        float sheenA = clamp(0.008 + fres * 0.36 + edge * 0.07, 0.0, 0.5);
        vec3 col = sheenC * sheenA;
        float alpha = sheenA;
        // Sun glare arcs on the curved acrylic: crisp + broad GGX lobes (both faces).
        vec3 H = normalize(L + V);
        float ndh = abs(dot(N, H));
        float glareCrisp = min(ggx(ndh, 0.06), 80.0) * 0.02;
        float glareBroad = ggx(ndh, 0.32) * 0.06;
        // Forward scatter: milky wash when looking toward the sun through the glass.
        float scatter = pow(max(dot(-V, L), 0.0), 18.0) * 0.32 + pow(max(dot(-V, L), 0.0), 3.0) * 0.05;
        // Reflections in the curved acrylic: the bright horizon haze band and the sky
        // zenith mirrored by the dome -> soft sweeping arcs that slide over the arch
        // as the jet banks and pitches (visible even with the sun behind).
        vec3 R = reflect(-V, N);
        float horizonBand = exp(-pow(R.y / 0.09, 2.0)) * (0.25 + 0.75 * fres) * 0.16;
        float skyBand = pow(max(R.y, 0.0), 3.0) * fres * 0.3;
        // Micro-scratches: only visible where the broad glare catches them.
        float scr = scratches(vMet) * glareBroad * 2.4;
        vec3 add = uSunCol * (glareCrisp + glareBroad + scatter + scr) * sunUp + (uHor * horizonBand + uSky * skyBand) * uGain;
        // HUD bounce: faint emerald glow low on the windscreen beneath the combiner.
        float hudZone = exp(-pow(vMet.x / 0.2, 2.0) - pow((vMet.y - 0.16) / 0.11, 2.0));
        add += vec3(0.05, 1.0, 0.42) * hudZone * 0.045 * uHud;

        // ---- water on the glass ----
        float wetK = clamp(uRain + uMoist * 0.6, 0.0, 1.0);
        // Fast path: dry glass skips all droplet / streak math (Fresnel + glare only).
        if (uRain > 0.01 || uMoist > 0.05) {
          vec2 P = vMet;
          float fadeEdge = smoothstep(0.02, 0.12, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x)) * (1.0 - smoothstep(0.9, 1.0, abs(vUv.y)));
          vec3 A = drops(P, 0.05, uRain * 0.42, uStretch, 1.7, 0.45);
          vec3 B = drops(P, 0.026, uRain * 0.55 + uMoist * 0.35, uStretch * 1.4, 9.3, 0.8);
          float m = max(A.x, B.x) * fadeEdge;
          float dist = A.x > B.x ? A.y : B.y;
          float trail = max(A.z, B.z) * 0.5 * fadeEdge;
          // Cloud mist: very fine streaks raked along the slipstream.
          vec2 mq = (P - uFlow * 1.3) * vec2(110.0, 7.0);
          vec2 mid = floor(mq);
          float mist = uMoist * step(0.72, h21(mid + 4.1)) * (1.0 - smoothstep(0.0, 0.18, abs(fract(mq.x) - 0.5))) * fadeEdge;
          // Drop body: a lens -> inverted, brightened sky; dark refraction rim; glint.
          vec3 lens = mix(uHor, uSky, 0.3) * (0.95 + 0.3 * (1.0 - dist)) * uGain;
          lens += vec3(0.05, 1.0, 0.42) * hudZone * 0.12 * uHud;
          float rim = smoothstep(0.55, 0.95, dist);
          vec3 dropC = mix(lens, lens * 0.4, rim);
          float spark = pow(max(dot(reflect(-V, N), L), 0.0), 30.0) * sunUp;
          dropC += uSunCol * (0.25 * smoothstep(0.45, 0.15, dist) + 1.2 * spark * (1.0 - rim));
          float dA = m * (0.36 + 0.26 * rim);
          col = col * (1.0 - dA) + dropC * dA;
          alpha = alpha + dA * (1.0 - alpha);
          vec3 wetC = mix(uHor, uSky, 0.5) * uGain * 0.9;
          float wA = (trail * 0.35 + mist * 0.28) * (1.0 - dA);
          col += wetC * wA; alpha += wA * (1.0 - alpha);
          // A water film slightly hazes the whole pane while it is wet.
          float film = wetK * 0.05;
          col += wetC * film; alpha += film * (1.0 - alpha);
        }
        // Ice: procedural crystals creep inward from the canopy edge. Hash based,
        // no texture; the centre sightline stays clear until frost is severe.
        if (uFrost > 0.01) {
          float frEdge = smoothstep(0.35, 0.95, length((vUv - 0.5) * vec2(1.0, 1.2)) * 1.6);
          float crystals = step(0.62, h21(floor(vMet * 55.0) + 2.9)) * 0.55
            + step(0.86, h21(floor(vMet * 115.0) + 8.1)) * 0.45;
          float fmask = clamp(frEdge * (0.5 + 0.6 * crystals) * uFrost, 0.0, 1.0);
          vec3 fcol = vec3(0.68, 0.84, 1.0) * (0.62 + 0.42 * crystals);
          col = mix(col, fcol, fmask * 0.9);
          alpha = clamp(alpha + fmask * 0.5, 0.0, 0.97);
        }
        if (uPunch > 0.01) {
          float wash = uPunch * (0.45 + 0.55 * smoothstep(0.2, 0.95, length(vUv - 0.5) * 1.6));
          col = mix(col, vec3(0.88, 0.94, 1.0), wash * 0.8);
          alpha = clamp(alpha + wash * 0.6, 0.0, 0.98);
        }
        gl_FragColor = vec4(col + add, clamp(alpha, 0.0, 0.98));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const glass = new THREE.Mesh(geo, mat);
  glass.renderOrder = 5;                              // after exterior rain (3), before the HUD combiner (6)
  glass.frustumCulled = false;
  parent.add(glass);

  // Canopy frame seal: dark rubberised / metallic strip where the glass meets the
  // rails, the nose coaming and the rear bulkhead.
  const sealMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55, metalness: 0.45 });
  const edgeCurve = pts => new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(q[0], q[1], q[2])));
  const sample = (fixed, isU, n) => Array.from({ length: n + 1 }, (_, k) => point(isU ? fixed : k / n, isU ? k / n * 2 - 1 : fixed, [0, 0, 0]));
  const seals = [
    edgeCurve(sample(-1, false, 40)), edgeCurve(sample(1, false, 40)),            // rails (v = -1 / +1 along u)
    edgeCurve(sample(0, true, 40)), edgeCurve(sample(1, true, 40))                // nose coaming / rear edge
  ];
  for (const c of seals) parent.add(new THREE.Mesh(new THREE.TubeGeometry(c, 96, 0.013, 6, false), sealMat));

  // ---- per-frame drive ----
  const flow = U.uFlow.value;
  let moist = 0;
  // o: { dt, time, rain 0..1, cloud 0..1, kts, rollRate, sunCol, sunK, sky, gain, nvg, visible }
  function update(o) {
    U.uTime.value = o.time;
    // Cloud moisture: ramps in while inCloud > 0.3, evaporates ~2.5 s after breaking out.
    const target = o.cloud > 0.3 ? Math.min(1, o.cloud * 1.2) : 0;
    moist = target > moist ? moist + (target - moist) * Math.min(1, o.dt * 3) : Math.max(target, moist - o.dt / 2.5);
    U.uMoist.value = o.visible ? moist : 0;
    U.uRain.value = o.visible ? o.rain : 0;
    U.uFrost.value = o.visible ? (o.frost || 0) : 0;
    U.uPunch.value = o.visible ? (o.punch || 0) : 0;
    // Slipstream slide speed over the glass (m/s): slow beads trickle back below
    // ~120 kt, a fast wash above ~200 kt (whips back at dogfight speeds).
    const k = o.kts;
    const slide = 0.03 + 0.25 * ss(k, 20, 120) + 9.0 * ss(k, 140, 600);
    flow.y += slide * o.dt;
    flow.x += -o.rollRate * 0.55 * o.dt;               // hard rolls throw the water sideways
    if (flow.y > 1000) flow.y -= 1000;
    flow.x = ((flow.x % 1000) + 1000) % 1000;
    U.uStretch.value = 1 + 5.5 * ss(k, 150, 600);
    U.uSunCol.value.copy(o.sunCol).multiplyScalar(o.sunK);
    U.uSky.value.copy(o.sky);
    U.uGain.value = o.gain;
    U.uGlare.value = o.nvg ? 0.15 : 1;
    U.uHud.value = o.nvg ? 0.4 : 1;
  }
  return {
    glass, update,
    get moisture() { return moist; },
    get stats() { return { rain: +U.uRain.value.toFixed(2), moist: +moist.toFixed(2), frost: +U.uFrost.value.toFixed(2), flow: +flow.y.toFixed(1), stretch: +U.uStretch.value.toFixed(2) }; }
  };
}
