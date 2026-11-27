// ANGELS ZERO — AN/AVS-9 night-vision goggles (N key).
// When active the scene renders into a half-float HDR target (linear light,
// values > 1 kept), then:
//   1. bright pass (1/4 res): everything hotter than the tube's bloom knee —
//      afterburner plumes, magnesium flares, tracers, explosions, the sun —
//      blurred into a halo buffer;
//   2. composite: luminance with high gain and a soft automatic-brightness
//      shoulder, edge enhancement (terrain contours, wave crests, cloud edges
//      and aircraft silhouettes pop), Gen-3 green phosphor ramp
//      (#021208 -> #1aff66 -> #39ff88 -> white-green), wide halos around bright
//      sources, animated grain + scintillation, and a round tube vignette
//      (dual-tube binocular mask in the cockpit view).
// The 2D HUD canvas sits above the WebGL canvas, so symbology stays razor-sharp.

export const BLOOM_THRESHOLD = 0.88;

export function createNVG(THREE, renderer, post) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);

  // Normal (non-NVG) frames: selective HDR bloom pipeline (Visual Pass 1).
  //   RenderPass -> half-float target, no MSAA (linear HDR, no tone mapping in the
  //   materials), UnrealBloomPass at 0.25 resolution (threshold BLOOM_THRESHOLD,
  //   strength 0.40, radius 0.6: only HDR emissives -- tracers, muzzle flash,
  //   afterburner cores, the sun -- cross it), OutputPass applies ACES Filmic +
  //   sRGB exactly once. The 2D HUD canvas sits above WebGL, so it never blurs.
  let composer = null, renderPass = null, distortPass = null, bloom = null, gradePass = null, gPass = null;
  let cinematic = true;
  const distortScene = new THREE.Scene();
  const distortRT = new THREE.WebGLRenderTarget(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1), {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true
  });
  const distortClearCol = new THREE.Color(0.5, 0.5, 0.0);
  const _prevClearCol = new THREE.Color();
  if (post) {
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    composer = new post.EffectComposer(renderer, rt);
    renderPass = new post.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    if (post.ShaderPass) {
      distortPass = new post.ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          tDistort: { value: distortRT.texture },
          uScale: { value: 0.045 }
        },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform sampler2D tDistort;
          uniform float uScale;
          varying vec2 vUv;
          void main() {
            vec4 d = texture2D(tDistort, vUv);
            vec2 off = (d.rg - 0.5) * 2.0 * d.a * uScale;
            vec2 uv2 = clamp(vUv + off, vec2(0.001), vec2(0.999));
            gl_FragColor = texture2D(tDiffuse, uv2);
          }`
      });
      distortPass.enabled = false;
    }
    // Storm Realism Pass: threshold 0.88 (>= 0.85) so sunlit cloud crowns and the sky
    // stay below the knee; afterburners, explosions, deck beacons, tracers and cockpit
    // emissives (all HDR > 1 after the 1.05 exposure trim) are what bloom.
    bloom = new post.UnrealBloomPass(new THREE.Vector2(Math.max(1, Math.floor(size.x * 0.25)), Math.max(1, Math.floor(size.y * 0.25))), 0.40, 0.6, BLOOM_THRESHOLD);
    composer.addPass(renderPass);
    if (distortPass) composer.addPass(distortPass);
    composer.addPass(bloom); composer.addPass(new post.OutputPass());
    if (post.ShaderPass) {
      gradePass = new post.ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
          uSunGlare: { value: 0 },
          uSunCol: { value: new THREE.Vector3(1.0, 0.88, 0.72) },
          uAspect: { value: size.x / Math.max(1, size.y) },
          uTime: { value: 0 },
          uSpeedBlur: { value: 0 },
          uGodRay: { value: 0 },
          uCinematic: { value: 1 }
        },
        vertexShader: gVert(),
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uSunPos; uniform float uSunGlare; uniform vec3 uSunCol; uniform float uAspect;
          uniform float uTime; uniform float uSpeedBlur; uniform float uGodRay; uniform float uCinematic;
          varying vec2 vUv;
          float imaxHash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
          }
          void main() {
            vec2 centerD = vUv - 0.5;
            float centerR = length(centerD * vec2(uAspect, 1.0));
            vec4 s = texture2D(tDiffuse, vUv);
            vec3 c = clamp(s.rgb, 0.0, 1.0);
            // Edge-weighted radial motion blur at high Mach / afterburner (zero blur in center HUD reticle).
            if (uCinematic > 0.5 && uSpeedBlur > 0.005) {
              float edgeK = smoothstep(0.24, 0.92, centerR * 1.45) * uSpeedBlur * 0.032;
              if (edgeK > 0.0005) {
                vec2 dir = centerD * edgeK;
                vec3 acc = c * 0.34;
                acc += texture2D(tDiffuse, clamp(vUv - dir * 0.35, 0.001, 0.999)).rgb * 0.24;
                acc += texture2D(tDiffuse, clamp(vUv - dir * 0.70, 0.001, 0.999)).rgb * 0.20;
                acc += texture2D(tDiffuse, clamp(vUv - dir * 1.05, 0.001, 0.999)).rgb * 0.14;
                acc += texture2D(tDiffuse, clamp(vUv - dir * 1.40, 0.001, 0.999)).rgb * 0.08;
                c = clamp(acc, 0.0, 1.0);
              }
            }
            // Broad atmospheric solar glare veil + subtle anamorphic streak + crepuscular sun shafts.
            if (uSunGlare > 0.002) {
              vec2 d = (vUv - uSunPos) * vec2(uAspect, 1.0);
              float r = length(d);
              float veil = exp(-r * 1.55) * 0.44 + exp(-r * 5.2) * 0.34;
              float anamK = mix(0.14, 0.38, step(0.5, uCinematic));
              float anam = exp(-abs(d.y) * 14.0) * exp(-abs(d.x) * 2.2) * anamK;
              float ang = atan(d.y, d.x);
              float shafts = (0.55 + 0.45 * sin(ang * 13.0 + uTime * 0.08) * cos(ang * 7.0 - uTime * 0.05))
                * exp(-r * 2.1) * uGodRay * uCinematic * 0.36;
              vec3 sunDisp = pow(clamp(uSunCol, 0.0, 1.0), vec3(1.0 / 2.2));
              vec3 glareGlow = clamp(sunDisp * uSunGlare * (veil + anam + shafts), 0.0, 0.65);
              c = 1.0 - (1.0 - c) * (1.0 - glareGlow);
            }
            // Filmic shadow-cool / highlight-warm split-tone + subtle contrast knee.
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = clamp(mix(vec3(l), c, 1.09), 0.0, 1.0);
            c = mix(c, c * c * (3.0 - 2.0 * c), 0.08);
            vec3 tint = mix(vec3(0.93, 0.97, 1.07), vec3(1.04, 1.01, 0.95), smoothstep(0.14, 0.84, l));
            c *= tint;
            // Subtle 35mm / IMAX organic film grain (midtone-weighted, faded near center reticle).
            if (uCinematic > 0.5) {
              float gMask = smoothstep(0.18, 0.48, centerR * 1.4) * (4.0 * l * (1.0 - l));
              float grain = (imaxHash(floor(vUv * 1280.0) + fract(uTime * 17.3) * 100.0) - 0.5) * 0.026 * gMask;
              c = clamp(c + grain, 0.0, 1.0);
            }
            float v = 1.0 - smoothstep(0.58, 1.44, length((vUv - 0.5) * vec2(1.15, 1.0))) * 0.17;
            gl_FragColor = vec4(max(c * v, 0.0), s.a);
          }`
      });
      composer.addPass(gradePass);
      gPass = new post.ShaderPass({ uniforms: gUniforms(), vertexShader: gVert(), fragmentShader: gFrag() });
      gPass.enabled = false; composer.addPass(gPass);
    }
    bloom.setSize(Math.max(1, Math.floor(size.x * 0.25)), Math.max(1, Math.floor(size.y * 0.25)));    // composer.addPass set it full-res
  }
  const mk = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
  const sceneRT = mk(size.x, size.y);
  const bloomRT = new THREE.WebGLRenderTarget(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2), { type: THREE.HalfFloatType, depthBuffer: false });

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const LUM = `float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }`;

  function gUniforms() { return {
    tDiffuse: { value: null }, uDesat: { value: 0 }, uContrast: { value: 1 },
    uTunnel: { value: 1.25 }, uPulse: { value: 0 }, uBlack: { value: 0 }, uRed: { value: 0 }
  }; }
  function gVert() { return `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`; }
  function gFrag() { return `
    uniform sampler2D tDiffuse; uniform float uDesat, uContrast, uTunnel, uPulse, uBlack, uRed;
    varying vec2 vUv;
    void main() {
      vec4 s = texture2D(tDiffuse, vUv);
      vec3 c = s.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, vec3(l), clamp(uDesat, 0.0, 1.0));
      c = (c - 0.5) * uContrast + 0.5;
      float d = length((vUv - 0.5) * vec2(1.0, 1.0)) * 2.0;
      float vig = 1.0 - smoothstep(uTunnel - 0.25, uTunnel + 0.05, d);
      c *= mix(1.0, vig, clamp(uPulse + uBlack, 0.0, 1.0));
      c = mix(c, c * vec3(1.25, 0.42, 0.45), clamp(uRed, 0.0, 1.0));
      c *= (1.0 - uBlack);
      gl_FragColor = vec4(max(c, 0.0), s.a);
    }`; }
  const gMat = new THREE.ShaderMaterial({ uniforms: gUniforms(), vertexShader: gVert(), fragmentShader: gFrag(), depthTest: false, depthWrite: false });
  const gRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const gState = { active: false };
  function setG(o) {
    const u = gMat.uniforms;
    u.uDesat.value = o.desat || 0; u.uContrast.value = o.contrast === undefined ? 1 : o.contrast;
    u.uTunnel.value = o.tunnel === undefined ? 1.25 : o.tunnel; u.uPulse.value = o.pulse || 0;
    u.uBlack.value = o.black || 0; u.uRed.value = o.red || 0;
    gState.active = u.uDesat.value > 0.001 || u.uContrast.value < 0.999 || u.uTunnel.value < 1.249 || u.uPulse.value > 0.001 || u.uBlack.value > 0.001 || u.uRed.value > 0.001;
    if (gPass) { gPass.enabled = gState.active; Object.keys(u).forEach(k => { if (gPass.uniforms[k]) gPass.uniforms[k].value = u[k].value; }); }
  }
  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: sceneRT.texture }, uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, uKnee: { value: 1.25 } },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tScene; uniform vec2 uTexel; uniform float uKnee; varying vec2 vUv;
      ${LUM}
      void main() {
        vec3 acc = vec3(0.0); float w = 0.0;
        for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
          vec2 o = vec2(float(x), float(y)) * uTexel * 5.0;
          float k = exp(-float(x * x + y * y) / 2.5);
          float l = lum(texture2D(tScene, vUv + o).rgb);
          acc += vec3(max(l - uKnee, 0.0)) * k; w += k;
        }
        gl_FragColor = vec4(acc / w, 1.0);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false
  });

  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: sceneRT.texture }, tBloom: { value: bloomRT.texture },
      uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, uAspect: { value: size.x / size.y },
      uTime: { value: 0 }, uGain: { value: 2.1 }, uCockpit: { value: 0 }
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uTexel; uniform float uAspect;
      uniform float uTime; uniform float uGain; uniform float uCockpit;
      varying vec2 vUv;
      ${LUM}
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        float l = lum(c);
        // Edge enhancement on luminance (contours / silhouettes / wave crests).
        float lx = lum(texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb) - lum(texture2D(tScene, vUv - vec2(uTexel.x, 0.0)).rgb);
        float ly = lum(texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb) - lum(texture2D(tScene, vUv - vec2(0.0, uTexel.y)).rgb);
        float edge = clamp(length(vec2(lx, ly)) * 2.2, 0.0, 0.6);
        // High-gain intensification with an automatic-brightness shoulder.
        float v = 1.0 - exp(-(l * uGain + edge * 0.9));
        // Tube halos: multi-tap blur of the bright pass.
        vec3 halo = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.0472;
          for (int r = 1; r <= 2; r++) {
            vec2 o = vec2(cos(a), sin(a) * uAspect) * float(r) * 0.016;
            halo += texture2D(tBloom, vUv + o).rgb / float(r);
          }
        }
        float bloom = lum(texture2D(tBloom, vUv).rgb) * 1.6 + lum(halo) * 0.25;
        v = clamp(v + bloom, 0.0, 1.6);
        // Gen-3 green phosphor ramp.
        vec3 g = mix(vec3(0.008, 0.07, 0.03), vec3(0.10, 1.0, 0.40), smoothstep(0.0, 0.62, v));
        g = mix(g, vec3(0.22, 1.0, 0.53), smoothstep(0.55, 0.95, v));
        g = mix(g, vec3(0.86, 1.0, 0.90), smoothstep(1.0, 1.5, v));
        // Analog intensifier grain + scintillation sparkles.
        vec2 px = vUv / uTexel;
        float n = hash(floor(px * 0.75) + floor(uTime * 48.0)) - 0.5;
        g *= 1.0 + n * 0.16;
        float sp = step(0.9993, hash(floor(px * 0.5) + floor(uTime * 30.0) * 1.7));
        g += vec3(0.4, 1.0, 0.6) * sp * 0.5;
        // Tube vignette: one round tube, or two overlapping tubes in the cockpit.
        vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
        float single = 1.0 - smoothstep(0.62, 0.92, length(q));
        float tL = 1.0 - smoothstep(0.50, 0.62, length(q - vec2(-0.21, 0.0)));
        float tR = 1.0 - smoothstep(0.50, 0.62, length(q - vec2(0.21, 0.0)));
        float bino = max(tL, tR) * 0.94 + 0.06;
        g *= mix(single * 0.75 + 0.25, bino, uCockpit);
        gl_FragColor = vec4(pow(max(g, 0.0), vec3(1.0 / 2.2)), 1.0);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false
  });

  let active = false;
  function setSize() {
    renderer.getDrawingBufferSize(size);
    sceneRT.setSize(size.x, size.y);
    distortRT.setSize(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1));
    bloomRT.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2));
    brightMat.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    compMat.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    compMat.uniforms.uAspect.value = size.x / size.y;
    if (composer) {
      composer.setSize(size.x, size.y);                                       // target pixel ratio is 1: drawing-buffer px
      bloom.setSize(Math.max(1, Math.floor(size.x * 0.25)), Math.max(1, Math.floor(size.y * 0.25)));    // 0.25-res bloom chain
      if (gradePass) gradePass.uniforms.uAspect.value = size.x / Math.max(1, size.y);
    }
    gRT.setSize(size.x, size.y);
  }
  // Renders the frame: through the HDR bloom composer in normal vision, through the tubes with NVG.
  function render(scene, camera, t, cockpit) {
    if (!active) {
      if (!composer) { renderer.render(scene, camera); return; }
      let hasDistort = false;
      if (cinematic && distortPass && distortScene.children.length > 0) {
        for (let i = 0; i < distortScene.children.length; i++) {
          if (distortScene.children[i].visible) { hasDistort = true; break; }
        }
      }
      if (distortPass) distortPass.enabled = hasDistort;
      if (hasDistort) {
        const prevRT = renderer.getRenderTarget();
        renderer.getClearColor(_prevClearCol);
        const prevAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(distortRT);
        renderer.setClearColor(distortClearCol, 0.0);
        renderer.clear(true, true, false);
        renderer.render(distortScene, camera);
        renderer.setClearColor(_prevClearCol, prevAlpha);
        renderer.setRenderTarget(prevRT);
      }
      if (gradePass) gradePass.uniforms.uTime.value = t || 0;
      renderPass.scene = scene; renderPass.camera = camera;
      composer.render();
      return;
    }
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    quad.material = brightMat;
    renderer.setRenderTarget(bloomRT);
    renderer.render(quadScene, quadCam);
    compMat.uniforms.uTime.value = t;
    compMat.uniforms.uCockpit.value = cockpit ? 1 : 0;
    quad.material = compMat;
    if (gState.active) {
      renderer.setRenderTarget(gRT);
      renderer.render(quadScene, quadCam);
      gMat.uniforms.tDiffuse.value = gRT.texture;
      quad.material = gMat;
      renderer.setRenderTarget(prev);
      renderer.render(quadScene, quadCam);
    } else {
      renderer.setRenderTarget(prev);
      renderer.render(quadScene, quadCam);
    }
  }
  return {
    render, setSize,
    target: sceneRT,                                   // pre-allocated HDR target (shader warm-up compiles against it)
    distortScene,
    get bloom() { return bloom; }, get composer() { return composer; },
    setG, get gPass() { return gPass; }, get gActive() { return gState.active; },
    setCinematic(on) {
      cinematic = !!on;
      if (gradePass) gradePass.uniforms.uCinematic.value = cinematic ? 1 : 0;
      if (!cinematic && distortPass) distortPass.enabled = false;
    },
    get cinematic() { return cinematic; },
    setMotion(speedBlur, godRay) {
      if (!gradePass) return;
      gradePass.uniforms.uSpeedBlur.value = speedBlur;
      gradePass.uniforms.uGodRay.value = godRay;
    },
    setSunGlare(nx, ny, g, r, gr, b) {
      if (!gradePass) return;
      const u = gradePass.uniforms;
      u.uSunPos.value.set(nx, ny);
      u.uSunGlare.value = g;
      u.uSunCol.value.set(r, gr, b);
    },
    setGain(k) { compMat.uniforms.uGain.value = k; },
    get gain() { return compMat.uniforms.uGain.value; },
    get active() { return active; },
    set active(v) { active = !!v; }
  };
}
