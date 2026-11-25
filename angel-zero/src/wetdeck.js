// ANGELS ZERO â€” wet flight deck for CVN-ALLY "OVERLORD" (Storm Realism Pass, step 2).
//
// Wetness 0..1 (index.html: NAVAL ops ~0.55, rain / STORM OPS up to 1) drives:
//   * the deck material(s): roughness drops toward 0.3 (damp specular sheen that
//     catches the moon / sun key), albedo darkens ~18 %, any normal map gains +40 %
//     micro-bump response;
//   * wet-light reflections: one instanced additive streak per light source, lying
//     on the deck at the light's foot and stretched toward the camera (how a wet
//     surface smears a point light). Sources: the amber deck-edge lights, three
//     orange island beacons added here, and the player's two afterburner nozzles
//     (only while the jet is low over the deck, scaled by throttle / afterburner).
// Deck meshes are found once at mount (long, flat, top at deck height); everything
// is built once and parented to the carrier root, so it moves with the ship and
// mission switches never allocate. update() uses module scratch only.

const MAX = 48;
const WET_ROUGH = 0.3, WET_DARKEN = 0.18, WET_BUMP = 0.4;
const EDGE_COLOR = 0xffb25e, BEACON_COLOR = 0xff7a1e, AB_COLOR = 0xff8a3a;
const FADE_FAR = 950, FADE_NEAR = 350;
const noRaycast = () => {};

export function createWetDeck(THREE, env) {
  const { camera } = env;
  const debug = !!env.debug;

  // --------------------------------------------------------- reflection streaks
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);   // z in [-1, 0], uv.y 0 at the light
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv; varying vec3 vCol;
      void main() {
        vUv = uv; vCol = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #endif
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      uniform float uTime;
      varying vec2 vUv; varying vec3 vCol;
      void main() {
        #include <logdepthbuf_fragment>
        float x = vUv.x * 2.0 - 1.0, y = vUv.y;
        float across = exp(-x * x * 4.0);
        float along = exp(-y * 2.4) * smoothstep(0.0, 0.03, y);
        float pool = exp(-(x * x * 1.4 + y * y * 90.0)) * 0.7;          // bright puddle right under the light
        float ripple = 0.78 + 0.22 * sin(y * 46.0 - uTime * 2.3 + x * 2.0) * sin(y * 17.0 + uTime * 0.9);
        gl_FragColor = vec4(vCol * (across * along * ripple + pool), 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false
  });
  const streaks = new THREE.InstancedMesh(geo, mat, MAX);
  streaks.frustumCulled = false; streaks.renderOrder = 3; streaks.count = 0; streaks.visible = false;
  streaks.name = 'WetDeckStreaks';
  streaks.raycast = noRaycast;                            // never a deck-height hit
  const _col = new THREE.Color(0, 0, 0);
  for (let i = 0; i < MAX; i++) streaks.setColorAt(i, _col);

  // ------------------------------------------------------------ island beacons
  const beaconTex = (() => {
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,220,170,0.9)');
    g.addColorStop(0.45, 'rgba(255,140,60,0.25)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const beacons = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.SpriteMaterial({ map: beaconTex, color: new THREE.Color(BEACON_COLOR).multiplyScalar(2.6),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(i === 0 ? 3.2 : 2.2); sp.renderOrder = 6; sp.visible = false;
    sp.raycast = noRaycast;                               // carrier deck / collision rays recurse into the root
    beacons.push(sp);
  }

  // ------------------------------------------------------------------ sources
  // Static sources (deck-edge lights + island-base beacons) in carrier-root local
  // space; the two nozzle slots are filled per frame.
  const srcPos = new Float32Array(MAX * 3), srcCol = new Float32Array(MAX * 3), srcPow = new Float32Array(MAX), srcW = new Float32Array(MAX);
  let nStatic = 0;
  let root = null, deckY = 0, surfaceY = 0, bound = false;
  const deckMats = [];                                    // { m, r0, c0, n0 }
  let wet = 0, time = 0, lastApplied = -1;

  // One-off (bind time) deck height under a root-local point: the GLB deck is not one
  // plane (sponsons, catapult troughs, angled deck), and log-depth ignores polygonOffset.
  const _ray = new THREE.Raycaster(), _down = new THREE.Vector3(0, -1, 0), _o = new THREE.Vector3();
  function surfaceAt(x, z, fallback) {
    _o.set(x, fallback + 25, z); root.localToWorld(_o);
    _ray.set(_o, _down); _ray.far = 40;
    const hits = _ray.intersectObject(root, true);
    for (const h of hits) {
      if (h.object.isInstancedMesh || h.object.isSprite) continue;
      return root.worldToLocal(h.point).y;
    }
    return fallback;
  }
  function addSource(x, y, z, hex, pow, w) {
    if (nStatic >= MAX - 2) return;
    // Never below the flight-deck plane: edge catwalks probe ~1 m low, while the deck near
    // the edges sits ~0.3 m above the centreline median (the edge-light domes are half sunk).
    y = Math.max(surfaceAt(x, z, y), deckY + 0.35) + 0.1;
    srcPos[nStatic * 3] = x; srcPos[nStatic * 3 + 1] = y; srcPos[nStatic * 3 + 2] = z;
    _col.setHex(hex);
    srcCol[nStatic * 3] = _col.r; srcCol[nStatic * 3 + 1] = _col.g; srcCol[nStatic * 3 + 2] = _col.b;
    srcPow[nStatic] = pow; srcW[nStatic] = w;
    nStatic++;
  }

  // Called once from combatSys.onCarrierMounted (GLB or procedural ally).
  function bind(ally) {
    if (!ally || !(ally.root || ally.g)) return;
    root = ally.root || ally.g;
    deckY = (ally.deckY || 19) - root.position.y;          // root sits at sea level
    surfaceY = (ally.deckYLocal && Number.isFinite(ally.deckYLocal.bow0)) ? ally.deckYLocal.bow0 : deckY;   // catapult track (nozzle streaks)
    root.updateMatrixWorld(true);
    if (!streaks.parent || streaks.parent !== root) { if (streaks.parent) streaks.parent.remove(streaks); root.add(streaks); }
    for (const b of beacons) { if (b.parent) b.parent.remove(b); root.add(b); }
    nStatic = 0; deckMats.length = 0; lastApplied = -1;

    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const box = new THREE.Box3(), size = new THREE.Vector3(), m4 = new THREE.Matrix4(), p = new THREE.Vector3();
    const deckWorldY = ally.deckWorldY || ally.deckY || 19;
    const seen = new Set();
    root.traverse(o => {
      if (!o.isMesh || o === streaks) return;
      // Deck-edge lights: the instanced spheres combatSys places along both deck edges.
      if (o.isInstancedMesh && o.material && o.material.color && o.material.color.getHex() === 0xfff0b0) {
        o.material.color.setHex(EDGE_COLOR);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          addSource(p.x, deckY, p.z, EDGE_COLOR, 0.95, 2.6);
        }
        return;
      }
      if (o.isInstancedMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.getSize(size);
      const flat = Math.abs(box.max.y - deckWorldY) < 2.5 && Math.max(size.x, size.z) > 150;
      if (!flat) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        if (!m || !m.isMeshStandardMaterial || seen.has(m)) continue;
        seen.add(m);
        deckMats.push({ m, r0: m.roughness, c0: m.color.clone(), n0: m.normalMap ? m.normalScale.clone() : null });
      }
    });

    // Island beacons: one pulsing on the island top, two steady at its inboard base.
    const isl = ally.island;
    if (isl && Number.isFinite(isl.x0)) {
      const cx = (isl.x0 + isl.x1) / 2, cz = (isl.z0 + isl.z1) / 2;
      p.set(cx, isl.y1 - 2, cz).applyMatrix4(inv); beacons[0].position.copy(p);
      p.set(isl.x0 + 1, deckWorldY + 2.2, isl.z0 + 2).applyMatrix4(inv); beacons[1].position.copy(p);
      addSource(p.x, deckY, p.z, BEACON_COLOR, 1.6, 3.2);
      p.set(isl.x0 + 1, deckWorldY + 2.2, isl.z1 - 2).applyMatrix4(inv); beacons[2].position.copy(p);
      addSource(p.x, deckY, p.z, BEACON_COLOR, 1.6, 3.2);
      for (const b of beacons) b.visible = true;
    } else for (const b of beacons) b.visible = false;
    bound = true;
    if (debug) console.log('[ANGELS_ZERO] wetdeck bind', JSON.stringify({ deckMats: deckMats.length, sources: nStatic, deckY: +deckY.toFixed(2),
      island: !!isl, beacon0: beacons[0].position.toArray().map(v => +v.toFixed(1)) }));
  }

  function applyMaterials(k) {
    for (let i = 0; i < deckMats.length; i++) {
      const d = deckMats[i], m = d.m;
      m.roughness = d.r0 + (Math.min(d.r0, WET_ROUGH) - d.r0) * k;
      m.color.copy(d.c0).multiplyScalar(1 - WET_DARKEN * k);
      if (d.n0) m.normalScale.copy(d.n0).multiplyScalar(1 + WET_BUMP * k);
    }
  }

  const _cam = new THREE.Vector3(), _src = new THREE.Vector3(), _dir = new THREE.Vector3(), _side = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _noz = new THREE.Vector3();
  let n = 0;

  let srcY = 0;
  function writeStreak(x, z, r, g, b, pow, w) {
    if (n >= MAX) return;
    const dx = _cam.x - x, dz = _cam.z - z, dist = Math.hypot(dx, dz);
    if (dist > FADE_FAR || dist < 0.5) return;
    const hgt = Math.max(0, _cam.y - deckY);
    // grazing views reflect strongly, top-down views hardly at all
    const graze = Math.pow(Math.min(1, Math.max(0.12, 1 - hgt / (dist + 6))), 0.8);
    const fade = 1 - THREE.MathUtils.smoothstep(dist, FADE_NEAR, FADE_FAR);
    const k = wet * pow * graze * fade;
    if (k < 0.004) return;
    _dir.set(dx / dist, 0, dz / dist);
    _side.set(-_dir.z, 0, _dir.x).multiplyScalar(w);
    const L = Math.min(48, Math.max(6, dist * 0.14)) * (0.6 + 0.4 * graze);
    _dir.multiplyScalar(-L);                                // quad's local -Z end points at the camera
    _m.makeBasis(_side, _up, _dir);
    _m.setPosition(x, srcY, z);
    streaks.setMatrixAt(n, _m);
    _col.setRGB(r * k, g * k, b * k);
    streaks.setColorAt(n, _col);
    n++;
  }

  // wetTarget 0..1; ab 0..1 player afterburner, thr 0..1 throttle; nozL / nozR world
  // positions (Vector3) of the player's nozzles, or null.
  function update(dt, wetTarget, ab, thr, nozL, nozR) {
    time += dt;
    wet += (wetTarget - wet) * Math.min(1, dt * 0.5);
    if (Math.abs(wet - lastApplied) > 0.002) { applyMaterials(wet); lastApplied = wet; }
    const pulse = 0.55 + 0.45 * Math.max(0, Math.sin(time * 3.4));
    beacons[0].material.opacity = pulse;
    if (!bound || wet < 0.02 || !root) { streaks.visible = false; return; }
    _cam.copy(camera.position); root.worldToLocal(_cam);
    n = 0;
    for (let i = 0; i < nStatic; i++) {
      srcY = srcPos[i * 3 + 1];
      writeStreak(srcPos[i * 3], srcPos[i * 3 + 2], srcCol[i * 3], srcCol[i * 3 + 1], srcCol[i * 3 + 2], srcPow[i], srcW[i]);
    }
    const heat = Math.max(0, ab * 2.4 + Math.max(0, thr - 0.6) * 0.8);
    if (heat > 0.02) {
      _col.setHex(AB_COLOR);
      const r = _col.r, g = _col.g, b = _col.b;
      for (let s = 0; s < 2; s++) {
        const nz = s === 0 ? nozL : nozR;
        if (!nz) continue;
        _noz.copy(nz); root.worldToLocal(_noz);
        const above = _noz.y - deckY;
        if (above < -1 || above > 25) continue;
        const near = 1 - THREE.MathUtils.smoothstep(above, 3, 25);
        srcY = surfaceY + 0.12;
        writeStreak(_noz.x, _noz.z, r, g, b, heat * near, 3.2);
      }
    }
    streaks.count = n;
    streaks.visible = n > 0;
    if (n) { streaks.instanceMatrix.needsUpdate = true; streaks.instanceColor.needsUpdate = true; }
    mat.uniforms.uTime.value = time;
  }

  return {
    bind, update, streaks, beacons,
    get wet() { return wet; },
    get stats() { return { bound, deckMats: deckMats.length, sources: nStatic, streaks: n, wet: +wet.toFixed(2),
      rough: deckMats.length ? +deckMats[0].m.roughness.toFixed(2) : null }; }
  };
}
