// ANGELS ZERO — storm god-ray light shafts (Storm Realism Pass, step 1).
//
// Three additive, slanted light shafts falling from the cloud base toward the sea
// along the moon / sun direction, as if the key light breaks through gaps in the
// storm deck. Each shaft is one quad, axis-locked billboard (its long axis is the
// light direction, it turns about that axis to face the camera), kept at 2.4-5.2 km
// from the camera on the light's side of the sky so it never comes within reach.
// Strength comes from the atmosphere preset (`shafts`, STORM_OPS = 1) and is
// trimmed by heavier overcast and lightning-free darkness; at 0 the meshes are hidden.
//
// Built once and never disposed (no per-mission allocations); update() uses module
// scratch only: no `new`, no array/object literals, no closures.

const SHAFTS = [
  // azimuth offset from the light (rad), distance (m), width (m), length (m), phase
  { off: -0.42, d: 2400, w: 520, l: 3600, ph: 0.0 },
  { off: 0.10, d: 3900, w: 820, l: 4400, ph: 2.1 },
  { off: 0.55, d: 5200, w: 640, l: 4000, ph: 4.3 }
];
const CLOUD_BASE = 2300;
const SHAFT_COLOR = 0xaabdd6;
const PEAK = 0.11;                 // additive peak (linear): stays far below the bloom knee

export function createStormFX(THREE, env) {
  const { scene, camera } = env;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, -0.5, 0);       // origin at the top edge (cloud base), extends down -Y
  const meshes = [];
  for (let i = 0; i < SHAFTS.length; i++) {
    const s = SHAFTS[i];
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(SHAFT_COLOR) }, uK: { value: 0 }, uTime: { value: 0 }, uPh: { value: s.ph } },
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
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor; uniform float uK; uniform float uTime; uniform float uPh;
        varying vec2 vUv;
        void main() {
          #include <logdepthbuf_fragment>
          float x = abs(vUv.x * 2.0 - 1.0);
          float across = pow(max(1.0 - x, 0.0), 1.6);
          // brightest just under the deck, fading toward the sea
          float along = smoothstep(1.0, 0.86, vUv.y) * smoothstep(0.0, 0.55, vUv.y);
          // slow drifting striations inside the beam (no texture fetch)
          float st = 0.72 + 0.28 * sin(vUv.x * 19.0 + uPh + uTime * 0.11) * sin(vUv.x * 7.0 - uTime * 0.07 + uPh * 1.7);
          float breathe = 0.82 + 0.18 * sin(uTime * 0.23 + uPh);
          float a = across * along * st * breathe * uK;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: false, toneMapped: true
    });
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 2; m.visible = false;
    scene.add(m);
    meshes.push(m);
  }

  const _axis = new THREE.Vector3(), _h = new THREE.Vector3(), _top = new THREE.Vector3();
  const _toCam = new THREE.Vector3(), _x = new THREE.Vector3(), _z = new THREE.Vector3();
  let k = 0, kTarget = 0, time = 0, visible = 0;

  // shafts 0..1 from the preset, overcast 0..1 from the weather overlay.
  function setStrength(shafts, overcast) { kTarget = shafts * (1 - 0.35 * Math.max(0, overcast - 0.5)); }

  // lightDir: unit vector toward the sun / moon (atmosphere's shared SUN_DIR).
  function update(dt, lightDir) {
    time += dt;
    k += (kTarget - k) * Math.min(1, dt * 0.8);
    const on = k > 0.01 && lightDir.y > 0.05;
    visible = on ? meshes.length : 0;
    for (let i = 0; i < meshes.length; i++) meshes[i].visible = on;
    if (!on) return;
    _axis.copy(lightDir).negate();                         // shafts fall away from the light
    const ha = Math.atan2(lightDir.x, lightDir.z);         // light azimuth
    const cam = camera.position;
    for (let i = 0; i < meshes.length; i++) {
      const s = SHAFTS[i], m = meshes[i];
      const a = ha + s.off;
      _h.set(Math.sin(a), 0, Math.cos(a));
      _top.set(cam.x + _h.x * s.d, CLOUD_BASE, cam.z + _h.z * s.d);
      // shaft length clipped to the sea: the beam ends at y ~ 0
      const len = Math.min(s.l, CLOUD_BASE / Math.max(0.2, -_axis.y));
      // axis-locked billboard: X = axis x toCam, Z = X x axis
      _toCam.copy(cam).sub(_top);
      _x.crossVectors(_axis, _toCam);
      if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
      _x.normalize();
      _z.crossVectors(_x, _axis).normalize();
      _x.multiplyScalar(s.w);
      // local Y column = -len * axis: the quad spans local y in [-1, 0], so its far end
      // lands len metres down the light axis from the cloud-base anchor.
      m.matrix.makeBasis(_x, _h.copy(_axis).multiplyScalar(-len), _z);
      m.matrix.setPosition(_top);
      m.matrixWorld.copy(m.matrix);
      m.material.uniforms.uK.value = k * PEAK;
      m.material.uniforms.uTime.value = time;
    }
  }

  return {
    update, setStrength, meshes,
    get strength() { return k; },
    get visibleCount() { return visible; }
  };
}
