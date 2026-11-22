// ANGELS ZERO — live F-15C livery paint (applyF15Livery / applySquadron).
// The exterior `body*` materials keep their texture atlas as *detail only*: a
// shader patch turns the sampled camo atlas into a neutral luminance factor and
// the paint comes from the material colour multiplied by per-vertex multipliers
// (1 = body, trim/accent/splinter ratios on their model-space masks). Canopy
// glass, cockpit interior, nozzles, lights and pylon stores are untouched.
// `vertexColors` is enabled permanently at init so switching schemes never
// recompiles a shader; its only new program is the one-time dice decal material.
// Model axes: nose -Z, up +Y, right +X, metres.
import { SQUADRON } from './loadout.js?v=s90a';

export function createLivery(THREE, model, LIVERIES, wingMeshes = []) {
  const liveryById = id => LIVERIES.find(l => l.id === id) || LIVERIES[0];
  const PAINT = /^body/i, GAP = /^Ctrl_Gap$/;
  const sm = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  // Trim mask: 0 = body colour, 1 = trim colour.
  function trimMask(x, y, z) {
    const ax = Math.abs(x);
    const wing = y > -1.2 && y < 0.4 ? sm(5.0, 5.35, ax) : 0;
    const fin = ax > 1.2 && ax < 2.6 && z > 4.0 ? sm(1.62, 1.92, y) : 0;
    const stab = z > 6.0 && y < -0.5 ? sm(3.55, 3.85, ax) : 0;
    const lip = z > -5.0 && z < -4.25 && ax > 0.55 && ax < 2.6 && y > -2.0 && y < -0.15 ? 1 : 0;
    return Math.max(wing, fin, stab, lip);
  }
  // Fin / outer-wing trim gets the crimson ACE_GOLD accent.
  const accentMask = (x, y, z) => {
    const ax = Math.abs(x);
    return (ax > 1.2 && ax < 2.6 && z > 4 && y > 1.3) || (y > -1.2 && y < 0.4 && ax > 5.0) ? 1 : 0;
  };

  model.updateMatrixWorld(true);
  const inv = model.matrixWorld.clone().invert();
  const meshes = [], bodyMats = new Set(), gapMats = new Set();
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  model.traverse(o => {
    if (!o.isMesh) return;
    const mat = o.material;
    if (Array.isArray(mat)) return;
    if (GAP.test(mat.name)) { gapMats.add(mat); return; }
    if (!PAINT.test(mat.name)) return;
    const g = o.geometry, p = g.attributes.position;
    if (!g.userData.trimMask) {
      m4.multiplyMatrices(inv, o.matrixWorld);
      const mask = new Float32Array(p.count), modelPos = new Float32Array(p.count * 3), accent = new Uint8Array(p.count);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m4);
        mask[i] = trimMask(v.x, v.y, v.z);
        accent[i] = accentMask(v.x, v.y, v.z);
        modelPos[i * 3] = v.x; modelPos[i * 3 + 1] = v.y; modelPos[i * 3 + 2] = v.z;
      }
      g.userData.trimMask = mask; g.userData.modelPos = modelPos; g.userData.accentMask = accent;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3), 3));
    }
    meshes.push(o); bodyMats.add(mat);
  });

  const PAINT_GAIN = 0.66;
  function lumRef(tex) {
    try {
      const img = tex && tex.image; if (!img) return 0.5;
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      const lin = u => { const s = u / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      const L = [];
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (l > 0.02) L.push(l); }
      if (!L.length) return 0.5;
      L.sort((a, b) => a - b);
      return Math.max(0.03, L[L.length >> 1]);
    } catch (e) { return 0.5; }
  }
  for (const mat of bodyMats) {
    const ref = lumRef(mat.map);
    mat.userData.lumRef = ref;
    mat.vertexColors = true;                                  // permanent: no program swap on livery change
    mat.onBeforeCompile = shader => {
      shader.uniforms.uLumRef = { value: ref };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform float uLumRef;\nvoid main() {')
        .replace('#include <map_fragment>', [
          '#ifdef USE_MAP',
          '  vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
          '  float lvLum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );',
          '  diffuseColor.rgb *= clamp( lvLum / uLumRef, 0.45, 1.35 );   // atlas as neutral detail; paint = material colour',
          '  diffuseColor.a *= sampledDiffuseColor.a;',
          '#endif'
        ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'az-livery';
    mat.needsUpdate = true;
  }

  // GRIMDARK "32 dice" decal: one 128 px canvas texture + one MeshBasicMaterial,
  // created once. Opacity toggles; the meshes stay visible so gpuWarm compiles it.
  const diceCanvas = document.createElement('canvas'); diceCanvas.width = diceCanvas.height = 128;
  const dc = diceCanvas.getContext('2d', { willReadFrequently: true });
  dc.clearRect(0, 0, 128, 128);
  dc.fillStyle = '#d9d9d0'; dc.strokeStyle = '#d9d9d0'; dc.lineWidth = 2.5;
  const die = (x, y, s, pips) => {
    dc.strokeRect(x, y, s, s);
    for (const [px, py] of pips) { dc.beginPath(); dc.arc(x + px * s, y + py * s, s * 0.078, 0, Math.PI * 2); dc.fill(); }
  };
  die(12, 20, 40, [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]]);      // 3
  die(74, 62, 40, [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5]]);      // 2
  dc.font = '700 21px sans-serif'; dc.textAlign = 'center'; dc.fillText('32', 64, 124);
  const decalTex = new THREE.CanvasTexture(diceCanvas);
  const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, opacity: 0, side: THREE.DoubleSide });
  const decalGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const decals = [];
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R', name = 'Ctrl_Rudder_' + suffix;
    const rudder = model.getObjectByName(name), parent = rudder ? rudder.parent : model;
    const d = new THREE.Mesh(decalGeo, decalMat);
    if (rudder) d.position.copy(rudder.position).add(new THREE.Vector3(side * 0.02, 0.18, 0.34));
    else d.position.set(side * 1.78, 0.62, 7.84);
    d.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    d.renderOrder = 3;
    parent.add(d); decals.push(d);
    for (const wm of wingMeshes) {                            // wingmen were cloned before the decals existed
      const wr = wm && wm.getObjectByName(name), wp = wr ? wr.parent : wm;
      if (wp) wp.add(d.clone());                               // clone shares geometry and material, never clones either
    }
  }

  const cBody = new THREE.Color(), cTrim = new THREE.Color(), cMix = new THREE.Color(), cAccent = new THREE.Color();
  function paint(L) {
    cBody.set(L.body).multiplyScalar(PAINT_GAIN);
    cTrim.set(L.trim).multiplyScalar(PAINT_GAIN);
    cAccent.set(L.accent || L.trim).multiplyScalar(PAINT_GAIN);
    const spl = L.splinter ? L.splinter.map(h => new THREE.Color(h).multiplyScalar(PAINT_GAIN)) : null;
    for (const o of meshes) {
      const g = o.geometry, mask = g.userData.trimMask, pos = g.userData.modelPos, acc = g.userData.accentMask, col = g.attributes.color;
      for (let i = 0; i < mask.length; i++) {
        cMix.copy(cBody).lerp(cTrim, mask[i]);
        if (L.accent && acc && acc[i]) cMix.copy(cAccent);
        if (spl && mask[i] < 0.5 && pos) {
          // Angular cell skew breaks up the splinter edges; hash of integer cells picks the colour.
          const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          const ix = Math.floor((x + 0.36 * z) / 1.6), iz = Math.floor(z / 1.6), iy = Math.floor(y / 1.2);
          const h = Math.sin(ix * 127.1 + iz * 311.7 + iy * 74.7) * 43758.5453;
          const k = Math.floor((h - Math.floor(h)) * 3) % 3;
          cMix.copy(spl[k]);
        }
        col.setXYZ(i, cMix.r / cBody.r, cMix.g / cBody.g, cMix.b / cBody.b);
      }
      col.needsUpdate = true;
    }
    for (const mat of bodyMats) { mat.color.copy(cBody); mat.roughness = L.rough; }
    for (const mat of gapMats) mat.color.copy(cTrim).multiplyScalar(0.7);
    decalMat.opacity = L.emblem === 'DICE32' ? 1 : 0;
  }

  let current = null;
  function applyF15Livery(id) { const L = liveryById(id); paint(L); current = L.id; return L; }
  function applySquadron(id) { const S = SQUADRON[id] || SQUADRON.GHOST; paint(S); current = id; return S; }
  return {
    applyF15Livery, applySquadron, get current() { return current; }, liveries: LIVERIES,
    // Debug: painted mesh / material counts and the share of trim-masked vertices.
    stats() {
      let n = 0, t = 0;
      for (const o of meshes) { const m = o.geometry.userData.trimMask; n += m.length; for (let i = 0; i < m.length; i++) t += m[i] > 0.5; }
      return { meshes: meshes.length, materials: bodyMats.size, verts: n, trimShare: +(t / Math.max(1, n)).toFixed(3), decals: decals.length, current };
    }
  };
}
