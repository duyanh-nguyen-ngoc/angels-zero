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

export function createNVG(THREE, renderer, post) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);

  // Normal (non-NVG) frames: selective HDR bloom pipeline (Visual Pass 1).
  //   RenderPass -> half-float target, no MSAA (linear HDR, no tone mapping in the
  //   materials), UnrealBloomPass at 0.35 resolution (threshold 0.92, strength
  //   0.48, radius 0.32: only HDR emissives > 1 -- tracers, muzzle flash,
  //   afterburner cores, the sun -- cross it), OutputPass applies ACES Filmic +
  //   sRGB exactly once. The 2D HUD canvas sits above WebGL, so it never blurs.
  let composer = null, renderPass = null, bloom = null, gPass = null;
  if (post) {
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    composer = new post.EffectComposer(renderer, rt);
    renderPass = new post.RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    bloom = new post.UnrealBloomPass(new THREE.Vector2(Math.max(1, Math.floor(size.x * 0.25)), Math.max(1, Math.floor(size.y * 0.25))), 0.42, 0.68, 0.78);
    composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new post.OutputPass());
    if (post.ShaderPass) {
      const gradePass = new post.ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: gVert(),
        fragmentShader: `
          uniform sampler2D tDiffuse;
          varying vec2 vUv;
          void main() {
            vec4 s = texture2D(tDiffuse, vUv);
            vec3 c = s.rgb;
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            c = mix(vec3(l), c, 1.08);
            vec3 tint = mix(vec3(0.95, 0.98, 1.05), vec3(1.03, 1.01, 0.97), smoothstep(0.15, 0.85, l));
            c *= tint;
            float v = 1.0 - smoothstep(0.58, 1.42, length((vUv - 0.5) * vec2(1.15, 1.0))) * 0.16;
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
    bloomRT.setSize(Math.max(1, size.x >> 2), Math.max(1, size.y >> 2));
    brightMat.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    compMat.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    compMat.uniforms.uAspect.value = size.x / size.y;
    if (composer) {
      composer.setSize(size.x, size.y);                                       // target pixel ratio is 1: drawing-buffer px
      bloom.setSize(Math.max(1, Math.floor(size.x * 0.25)), Math.max(1, Math.floor(size.y * 0.25)));    // 0.25-res bloom chain
    }
    gRT.setSize(size.x, size.y);
  }
  // Renders the frame: through the HDR bloom composer in normal vision, through the tubes with NVG.
  function render(scene, camera, t, cockpit) {
    if (!active) {
      if (!composer) { renderer.render(scene, camera); return; }
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
    get bloom() { return bloom; }, get composer() { return composer; },
    setG, get gPass() { return gPass; }, get gActive() { return gState.active; },
    setGain(k) { compMat.uniforms.uGain.value = k; },
    get gain() { return compMat.uniforms.uGain.value; },
    get active() { return active; },
    set active(v) { active = !!v; }
  };
}
