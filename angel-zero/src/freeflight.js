// ─── FREE FLIGHT: REAL-WORLD STREAMING TERRAIN + 3D OSM BUILDINGS ─────────────
// Streams AWS Terrarium elevation, ESRI World Imagery satellite tiles, and
// OpenFreeMap MVT vector buildings at zoom 13 in a pooled 5x5 tile ring.

export const FREE_FLIGHT_PRESETS = {
  TORONTO: { id: 'TORONTO', name: 'TORONTO', lat: 43.6426, lon: -79.3871, alt: 1200, hdg: 0.15, spd: 210, desc: 'CN Tower & Lake Ontario waterfront' },
  TOKYO:   { id: 'TOKYO',   name: 'TOKYO',   lat: 35.6762, lon: 139.6503, alt: 1300, hdg: 0.85, spd: 215, desc: 'Shinjuku, Imperial Palace & Skytree' },
  SF:      { id: 'SF',      name: 'SAN FRANCISCO', lat: 37.7955, lon: -122.3937, alt: 1200, hdg: 5.5, spd: 210, desc: 'Financial District & Golden Gate' },
  NYC:     { id: 'NYC',     name: 'NEW YORK', lat: 40.7128, lon: -74.0060, alt: 1400, hdg: 0.35, spd: 215, desc: 'Lower Manhattan & Hudson River' },
  ALPS:    { id: 'ALPS',    name: 'SWISS ALPS', lat: 46.5472, lon: 7.9821, alt: 3200, hdg: 2.1, spd: 225, desc: 'Lauterbrunnen Valley & Jungfrau' },
};

const FF_CITY_KEY = 'az_ff_city';
export function loadFreeFlightCity() {
  try {
    const k = localStorage.getItem(FF_CITY_KEY);
    if (k && FREE_FLIGHT_PRESETS[k]) return k;
  } catch (_) {}
  return 'TORONTO';
}
export function saveFreeFlightCity(id) {
  try { if (FREE_FLIGHT_PRESETS[id]) localStorage.setItem(FF_CITY_KEY, id); } catch (_) {}
}

const ZOOM = 13;
const GRID_N = 33;          // 33x33 elevation samples per z=13 tile
const RING_RADIUS = 2;      // 5x5 tile ring around player
const REBASE_DIST = 25000;  // rebase local tangent origin when > 25km from (0,0)
const MAX_BLDG_TRIS = 60000;
const MAX_CONCURRENT_TILES = 6;
const DEFAULT_MVT_TEMPLATE = 'https://tiles.openfreemap.org/planet/20261122_124456_pt/{z}/{x}/{y}.pbf';

const TERRARIUM_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const ESRI_URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

function latLonToTileF(lat, lon, z) {
  const n = Math.pow(2, z);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const rad = clampedLat * Math.PI / 180;
  const tx = (lon + 180) / 360 * n;
  const ty = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
  return { tx, ty };
}

function tileToLatLon(tx, ty, z) {
  const n = Math.pow(2, z);
  const lon = tx / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

// ─── MINIMAL MVT PROTOBUF DECODER (BUILDING LAYER ONLY) ─────────────────────
class PbfReader {
  constructor(buf) {
    this.buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.pos = 0;
    this.len = this.buf.length;
  }
  readVarint() {
    let val = 0, shift = 0, b;
    while (this.pos < this.len) {
      b = this.buf[this.pos++];
      if (shift < 28) val |= (b & 0x7f) << shift;
      else val += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) return val >>> 0;
      shift += 7;
    }
    return val >>> 0;
  }
  readSVarint() {
    const n = this.readVarint();
    return (n >>> 1) ^ -(n & 1);
  }
  readString(end) {
    if (typeof TextDecoder !== 'undefined') {
      const s = new TextDecoder('utf-8').decode(this.buf.subarray(this.pos, end));
      this.pos = end;
      return s;
    }
    let s = '';
    while (this.pos < end) s += String.fromCharCode(this.buf[this.pos++]);
    return s;
  }
  readFloat() {
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4);
    this.pos += 4;
    return dv.getFloat32(0, true);
  }
  readDouble() {
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 8);
    this.pos += 8;
    return dv.getFloat64(0, true);
  }
  skip(wireType) {
    if (wireType === 0) { while (this.pos < this.len && (this.buf[this.pos++] & 0x80)) {} }
    else if (wireType === 1) this.pos += 8;
    else if (wireType === 2) { const l = this.readVarint(); this.pos += l; }
    else if (wireType === 5) this.pos += 4;
    else this.pos = this.len;
  }
}

function decodeMvtValue(pbf, end) {
  let val = null;
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >>> 3, wt = tag & 7;
    if (field === 1 && wt === 2) { const l = pbf.readVarint(); val = pbf.readString(pbf.pos + l); }
    else if (field === 2 && wt === 5) val = pbf.readFloat();
    else if (field === 3 && wt === 1) val = pbf.readDouble();
    else if (field === 4 && wt === 0) val = pbf.readVarint();
    else if (field === 5 && wt === 0) val = pbf.readVarint();
    else if (field === 6 && wt === 0) val = pbf.readSVarint();
    else if (field === 7 && wt === 0) val = !!pbf.readVarint();
    else pbf.skip(wt);
  }
  return val;
}

function decodeMvtFeature(pbf, end) {
  let type = 0;
  let tags = null;
  let geom = null;
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >>> 3, wt = tag & 7;
    if (field === 2 && wt === 2) {
      const l = pbf.readVarint(), e = pbf.pos + l;
      tags = [];
      while (pbf.pos < e) tags.push(pbf.readVarint());
    } else if (field === 3 && wt === 0) {
      type = pbf.readVarint();
    } else if (field === 4 && wt === 2) {
      const l = pbf.readVarint(), e = pbf.pos + l;
      geom = [];
      while (pbf.pos < e) geom.push(pbf.readVarint());
    } else {
      pbf.skip(wt);
    }
  }
  return { type, tags, geom };
}

function decodeMvtPolygonRings(geom) {
  if (!geom || geom.length === 0) return [];
  const rings = [];
  let ring = null;
  let x = 0, y = 0, i = 0;
  while (i < geom.length) {
    const cmdInt = geom[i++];
    const cmd = cmdInt & 0x7;
    const count = cmdInt >>> 3;
    if (cmd === 1) { // MoveTo
      for (let k = 0; k < count && i + 1 < geom.length; k++) {
        const dx = geom[i++], dy = geom[i++];
        x += (dx >>> 1) ^ -(dx & 1);
        y += (dy >>> 1) ^ -(dy & 1);
        if (k === 0) {
          if (ring && ring.length >= 6) rings.push(ring);
          ring = [x, y];
        } else {
          ring.push(x, y);
        }
      }
    } else if (cmd === 2) { // LineTo
      if (!ring) ring = [x, y];
      for (let k = 0; k < count && i + 1 < geom.length; k++) {
        const dx = geom[i++], dy = geom[i++];
        x += (dx >>> 1) ^ -(dx & 1);
        y += (dy >>> 1) ^ -(dy & 1);
        ring.push(x, y);
      }
    } else if (cmd === 7) { // ClosePath
      if (ring && ring.length >= 6) {
        rings.push(ring);
        ring = null;
      }
    } else {
      break;
    }
  }
  if (ring && ring.length >= 6) rings.push(ring);
  return rings;
}

function decodeBuildingLayer(arrayBuffer) {
  const pbf = new PbfReader(arrayBuffer);
  const buildings = [];
  while (pbf.pos < pbf.len) {
    const tag = pbf.readVarint();
    const field = tag >>> 3, wt = tag & 7;
    if (field === 3 && wt === 2) {
      const layerLen = pbf.readVarint();
      const layerEnd = pbf.pos + layerLen;
      let name = '';
      let extent = 4096;
      const keys = [];
      const values = [];
      const rawFeatures = [];
      let abortedNonBuilding = false;
      while (pbf.pos < layerEnd) {
        const lt = pbf.readVarint();
        const lf = lt >>> 3, lwt = lt & 7;
        if (lf === 1 && lwt === 2) {
          const l = pbf.readVarint();
          name = pbf.readString(pbf.pos + l);
          if (name !== 'building') {
            pbf.pos = layerEnd;
            abortedNonBuilding = true;
            break;
          }
        } else if (lf === 2 && lwt === 2) {
          const l = pbf.readVarint();
          rawFeatures.push(decodeMvtFeature(pbf, pbf.pos + l));
        } else if (lf === 3 && lwt === 2) {
          const l = pbf.readVarint();
          keys.push(pbf.readString(pbf.pos + l));
        } else if (lf === 4 && lwt === 2) {
          const l = pbf.readVarint();
          values.push(decodeMvtValue(pbf, pbf.pos + l));
        } else if (lf === 5 && lwt === 0) {
          extent = pbf.readVarint() || 4096;
        } else {
          pbf.skip(lwt);
        }
      }
      if (!abortedNonBuilding && name === 'building') {
        for (let i = 0; i < rawFeatures.length; i++) {
          const rf = rawFeatures[i];
          if (rf.type !== 3 || !rf.geom) continue;
          let hide3d = false;
          let height = 12;
          let minHeight = 0;
          let colour = null;
          if (rf.tags) {
            for (let t = 0; t + 1 < rf.tags.length; t += 2) {
              const k = keys[rf.tags[t]];
              const v = values[rf.tags[t + 1]];
              if (k === 'hide_3d' && v) hide3d = true;
              else if (k === 'render_height' && typeof v === 'number') height = v;
              else if (k === 'render_min_height' && typeof v === 'number') minHeight = v;
              else if (k === 'colour' && typeof v === 'string') colour = v;
            }
          }
          if (hide3d) continue;
          const rings = decodeMvtPolygonRings(rf.geom);
          if (rings.length === 0) continue;
          buildings.push({ rings, extent, height: Math.max(3, Math.min(680, height)), minHeight: Math.max(0, minHeight), colour });
        }
        return buildings;
      }
    } else {
      pbf.skip(wt);
    }
  }
  return buildings;
}

// ─── FAST 2D EAR-CLIPPING POLYGON TRIANGULATOR ──────────────────────────────
function ringSignedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += (pts[i] * pts[j + 1] - pts[j] * pts[i + 1]);
  }
  return a * 0.5;
}

function pointInTri(px, pz, ax, az, bx, bz, cx, cz) {
  const v0x = cx - ax, v0z = cz - az;
  const v1x = bx - ax, v1z = bz - az;
  const v2x = px - ax, v2z = pz - az;
  const d00 = v0x * v0x + v0z * v0z;
  const d01 = v0x * v1x + v0z * v1z;
  const d02 = v0x * v2x + v0z * v2z;
  const d11 = v1x * v1x + v1z * v1z;
  const d12 = v1x * v2x + v1z * v2z;
  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 1e-10) return false;
  const inv = 1 / denom;
  const u = (d11 * d02 - d01 * d12) * inv;
  const v = (d00 * d12 - d01 * d02) * inv;
  return u >= 0 && v >= 0 && (u + v) <= 1;
}

function triangulate2D(flatXZ) {
  const n = flatXZ.length >> 1;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];

  // Ensure CCW in (x, z)
  const idx = [];
  if (ringSignedArea(flatXZ) > 0) {
    for (let i = 0; i < n; i++) idx.push(i);
  } else {
    for (let i = n - 1; i >= 0; i--) idx.push(i);
  }

  const tris = [];
  let guard = n * 4;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    const m = idx.length;
    for (let i = 0; i < m; i++) {
      const i0 = idx[(i + m - 1) % m];
      const i1 = idx[i];
      const i2 = idx[(i + 1) % m];
      const ax = flatXZ[i0 * 2], az = flatXZ[i0 * 2 + 1];
      const bx = flatXZ[i1 * 2], bz = flatXZ[i1 * 2 + 1];
      const cx = flatXZ[i2 * 2], cz = flatXZ[i2 * 2 + 1];
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (cross <= 1e-8) continue;

      let inside = false;
      for (let k = 0; k < m; k++) {
        const ik = idx[k];
        if (ik === i0 || ik === i1 || ik === i2) continue;
        if (pointInTri(flatXZ[ik * 2], flatXZ[ik * 2 + 1], ax, az, bx, bz, cx, cz)) {
          inside = true;
          break;
        }
      }
      if (!inside) {
        tris.push(i0, i1, i2);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

// ─── COLOR & FACADE TEXTURE HELPERS ─────────────────────────────────────────
const PALETTE = [
  [0.72, 0.74, 0.78],
  [0.62, 0.68, 0.76],
  [0.78, 0.75, 0.70],
  [0.54, 0.60, 0.68],
  [0.82, 0.80, 0.76],
  [0.58, 0.62, 0.66],
];

function parseColorRGB(hex, seed) {
  if (hex && hex[0] === '#' && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r / 255, g / 255, b / 255];
    }
  }
  return PALETTE[Math.abs(Math.floor(seed)) % PALETTE.length];
}

function createFacadeTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  // Base wall grey
  ctx.fillStyle = '#c8cdd4';
  ctx.fillRect(0, 0, 256, 224);
  // Window grid (top 7/8 of texture)
  const cols = 8, rows = 7;
  const cw = 256 / cols, rh = 224 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = ((r * 7 + col * 13) % 11) < 3;
      ctx.fillStyle = lit ? '#e9d8a6' : '#435060';
      ctx.fillRect(col * cw + 5, r * rh + 5, cw - 10, rh - 10);
    }
  }
  // Solid roof band (bottom 1/8 of texture, v = 0.0..0.125 in Three.js bottom-up)
  ctx.fillStyle = '#aeb4bc';
  ctx.fillRect(0, 224, 256, 32);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ─── MAIN FREE FLIGHT SYSTEM ────────────────────────────────────────────────
export function createFreeFlight(THREE, scene) {
  const root = new THREE.Group();
  root.name = 'freeFlightRoot';
  root.visible = false;
  scene.add(root);

  const facadeTex = createFacadeTexture(THREE);
  const bldgMat = new THREE.MeshLambertMaterial({
    map: facadeTex,
    vertexColors: true,
    side: THREE.FrontSide,
  });
  const placeholderGroundMat = new THREE.MeshLambertMaterial({ color: 0x3b4840 });

  let active = false;
  let cityId = 'TORONTO';
  let originLat = FREE_FLIGHT_PRESETS.TORONTO.lat;
  let originLon = FREE_FLIGHT_PRESETS.TORONTO.lon;
  let mPerDegLat = 111320;
  let mPerDegLon = 111320 * Math.cos(originLat * Math.PI / 180);

  let mvtTemplate = DEFAULT_MVT_TEMPLATE;
  let mvtTemplateResolved = false;

  const tiles = new Map(); // key "tx,ty" -> tile record
  const landmarksGroup = new THREE.Group();
  root.add(landmarksGroup);

  let buildingsTotal = 0;
  let inFlightCount = 0;

  async function ensureMvtTemplate() {
    if (mvtTemplateResolved) return mvtTemplate;
    mvtTemplateResolved = true;
    try {
      const res = await fetch('https://tiles.openfreemap.org/planet');
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.tiles) && json.tiles[0]) {
          mvtTemplate = json.tiles[0];
        }
      }
    } catch (_) {}
    return mvtTemplate;
  }

  function latLonToXZ(lat, lon) {
    return {
      x: (lon - originLon) * mPerDegLon,
      z: -(lat - originLat) * mPerDegLat,
    };
  }

  function xzToLatLon(x, z) {
    return {
      lon: originLon + x / mPerDegLon,
      lat: originLat - z / mPerDegLat,
    };
  }

  function sampleTileHeight(tile, x, z) {
    if (!tile.elevGrid) return 0;
    const u = Math.max(0, Math.min(1, (x - tile.x0) / tile.w));
    const v = Math.max(0, Math.min(1, (z - tile.z0) / tile.d));
    const fx = u * (GRID_N - 1);
    const fz = v * (GRID_N - 1);
    const ix = Math.min(GRID_N - 2, Math.floor(fx));
    const iz = Math.min(GRID_N - 2, Math.floor(fz));
    const tx = fx - ix, tz = fz - iz;
    const g = tile.elevGrid;
    const h00 = g[iz * GRID_N + ix];
    const h10 = g[iz * GRID_N + ix + 1];
    const h01 = g[(iz + 1) * GRID_N + ix];
    const h11 = g[(iz + 1) * GRID_N + ix + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  function heightAt(x, z) {
    if (!active) return 0;
    const { lat, lon } = xzToLatLon(x, z);
    const { tx, ty } = latLonToTileF(lat, lon, ZOOM);
    const key = `${Math.floor(tx)},${Math.floor(ty)}`;
    const tile = tiles.get(key);
    if (!tile) return 0;
    // Transform world (x, z) into tile's local frame (accounting for group offset)
    const lx = x - tile.group.position.x;
    const lz = z - tile.group.position.z;
    return sampleTileHeight(tile, lx, lz);
  }

  function buildTerrainMesh(tile) {
    const geom = new THREE.BufferGeometry();
    const verts = new Float32Array(GRID_N * GRID_N * 3);
    const uvs = new Float32Array(GRID_N * GRID_N * 2);
    const indices = [];

    for (let iz = 0; iz < GRID_N; iz++) {
      const vz = iz / (GRID_N - 1);
      const z = tile.z0 + vz * tile.d;
      for (let ix = 0; ix < GRID_N; ix++) {
        const ux = ix / (GRID_N - 1);
        const x = tile.x0 + ux * tile.w;
        const idx = iz * GRID_N + ix;
        const y = tile.elevGrid ? tile.elevGrid[idx] : 0;
        verts[idx * 3] = x;
        verts[idx * 3 + 1] = y;
        verts[idx * 3 + 2] = z;
        uvs[idx * 2] = ux;
        uvs[idx * 2 + 1] = 1 - vz;
      }
    }
    for (let iz = 0; iz < GRID_N - 1; iz++) {
      for (let ix = 0; ix < GRID_N - 1; ix++) {
        const a = iz * GRID_N + ix;
        const b = a + 1;
        const c = a + GRID_N;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    if (tile.groundMesh) {
      tile.groundMesh.geometry.dispose();
      tile.groundMesh.geometry = geom;
    } else {
      tile.groundMesh = new THREE.Mesh(geom, tile.satMat || placeholderGroundMat);
      tile.groundMesh.receiveShadow = false;
      tile.group.add(tile.groundMesh);
    }
  }

  function buildBuildingsMesh(tile, features) {
    if (!features || features.length === 0 || tile.disposed) return;

    const pos = [];
    const norm = [];
    const uv = [];
    const col = [];
    let triCount = 0;
    let builtCount = 0;

    for (let f = 0; f < features.length; f++) {
      if (triCount >= MAX_BLDG_TRIS) break;
      const feat = features[f];
      const ext = feat.extent || 4096;
      const qx = feat.qx || 0;
      const qy = feat.qy || 0;
      const qs = feat.qs || 1;

      for (let r = 0; r < feat.rings.length; r++) {
        if (triCount >= MAX_BLDG_TRIS) break;
        const outer = feat.rings[r];
        if (!outer || outer.length < 6) continue;

        // Remove duplicate closing vertex if present
        let len = outer.length;
        if (len >= 8 && outer[0] === outer[len - 2] && outer[1] === outer[len - 1]) len -= 2;
        if (len < 6) continue;

        const flatXZ = new Array(len);
        let cx = 0, cz = 0;
        for (let i = 0; i < len; i += 2) {
          const wx = tile.x0 + (qx + (outer[i] / ext) * qs) * tile.w;
          const wz = tile.z0 + (qy + (outer[i + 1] / ext) * qs) * tile.d;
          flatXZ[i] = wx;
          flatXZ[i + 1] = wz;
          cx += wx;
          cz += wz;
        }
        const nPts = len >> 1;
        cx /= nPts;
        cz /= nPts;

        // Determine winding in (x, z); skip interior holes (negative signed area) when r > 0
        const area = ringSignedArea(flatXZ);
        if (r > 0 && area <= 0) continue;
        const flip = area < 0;

        const baseY = sampleTileHeight(tile, cx, cz);
        const yBot = baseY + feat.minHeight;
        const yTop = baseY + feat.height;
        const wallH = yTop - yBot;
        if (wallH < 1) continue;

        const [cr, cg, cb] = parseColorRGB(feat.colour, cx * 0.13 + cz * 0.07);
        const roofTris = triangulate2D(flatXZ);
        const wallTrisNeeded = nPts * 2;
        const roofTrisNeeded = (roofTris.length / 3) | 0;
        if (triCount + wallTrisNeeded + roofTrisNeeded > MAX_BLDG_TRIS) continue;

      // Walls
      for (let i = 0; i < nPts; i++) {
        const j = (i + 1) % nPts;
        const ax = flatXZ[i * 2], az = flatXZ[i * 2 + 1];
        const bx = flatXZ[j * 2], bz = flatXZ[j * 2 + 1];
        const ex = bx - ax, ez = bz - az;
        const edgeLen = Math.hypot(ex, ez);
        if (edgeLen < 0.2) continue;

        // Outward normal in (x, z)
        let nx = flip ? ez : -ez;
        let nz = flip ? -ex : ex;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl; nz /= nl;

        const u1 = edgeLen / 18;
        const vTop = 0.14 + Math.max(0.125, Math.min(3.5, wallH / 16)) * 0.85;
        const vBot = 0.14;

        // Two triangles (CCW outward)
        if (!flip) {
          pos.push(ax, yBot, az, bx, yBot, bz, bx, yTop, bz);
          pos.push(ax, yBot, az, bx, yTop, bz, ax, yTop, az);
          uv.push(0, vBot, u1, vBot, u1, vTop, 0, vBot, u1, vTop, 0, vTop);
        } else {
          pos.push(bx, yBot, bz, ax, yBot, az, ax, yTop, az);
          pos.push(bx, yBot, bz, ax, yTop, az, bx, yTop, bz);
          uv.push(0, vBot, u1, vBot, u1, vTop, 0, vBot, u1, vTop, 0, vTop);
        }
        for (let k = 0; k < 6; k++) {
          norm.push(nx, 0, nz);
          col.push(cr, cg, cb);
        }
        triCount += 2;
      }

      // Roof (triangulate2D returns CCW in (x, z); in Three.js +Y up, (a, c, b) faces +Y)
      const rShade = 0.92;
      for (let t = 0; t + 2 < roofTris.length; t += 3) {
        const i0 = roofTris[t], i1 = roofTris[t + 1], i2 = roofTris[t + 2];
        pos.push(
          flatXZ[i0 * 2], yTop, flatXZ[i0 * 2 + 1],
          flatXZ[i2 * 2], yTop, flatXZ[i2 * 2 + 1],
          flatXZ[i1 * 2], yTop, flatXZ[i1 * 2 + 1]
        );
        for (let k = 0; k < 3; k++) {
          norm.push(0, 1, 0);
          uv.push(0.05, 0.05); // solid roof band at bottom of texture
          col.push(cr * rShade, cg * rShade, cb * rShade);
        }
        triCount += 1;
      }
      builtCount++;
      }
    }

    if (pos.length === 0) return;

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geom.computeBoundingSphere();

    const mesh = new THREE.Mesh(geom, bldgMat);
    mesh.name = `bldg_${tile.key}`;
    tile.bldgMesh = mesh;
    tile.bldgCount = builtCount;
    buildingsTotal += builtCount;
    tile.group.add(mesh);
  }

  function decodeTerrariumImage(img) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 256, 256);
    const data = ctx.getImageData(0, 0, 256, 256).data;
    const grid = new Float32Array(GRID_N * GRID_N);
    for (let iz = 0; iz < GRID_N; iz++) {
      const py = Math.min(255, Math.round((iz / (GRID_N - 1)) * 255));
      for (let ix = 0; ix < GRID_N; ix++) {
        const px = Math.min(255, Math.round((ix / (GRID_N - 1)) * 255));
        const off = (py * 256 + px) * 4;
        const h = (data[off] * 256 + data[off + 1] + data[off + 2] / 256) - 32768;
        grid[iz * GRID_N + ix] = Math.max(0, h);
      }
    }
    return grid;
  }

  function loadImageCORS(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  }

  async function loadTileData(tile) {
    inFlightCount++;
    try {
      const ctrl = new AbortController();
      tile.abortCtrl = ctrl;

      // 1. ESRI satellite imagery
      const satPromise = loadImageCORS(ESRI_URL(ZOOM, tile.tx, tile.ty))
        .then((img) => {
          if (tile.disposed) return;
          const tex = new THREE.Texture(img);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.needsUpdate = true;
          tile.satTex = tex;
          tile.satMat = new THREE.MeshLambertMaterial({ map: tex });
          if (tile.groundMesh) tile.groundMesh.material = tile.satMat;
        })
        .catch(() => {});

      // 2. AWS Terrarium elevation
      const terrPromise = loadImageCORS(TERRARIUM_URL(ZOOM, tile.tx, tile.ty))
        .then((img) => {
          if (tile.disposed) return;
          try {
            tile.elevGrid = decodeTerrariumImage(img);
            buildTerrainMesh(tile);
          } catch (_) {}
        })
        .catch(() => {});

      // 3. OpenFreeMap MVT buildings (z=14 sub-tiles for inner 3x3 for per-building heights, z=13 for outer ring)
      const tpl = await ensureMvtTemplate();
      if (tile.disposed) return;
      const fetchMvtSub = (mz, mx, my, qx, qy, qs) => {
        const url = tpl.replace('{z}', mz).replace('{x}', mx).replace('{y}', my);
        return fetch(url, { signal: ctrl.signal })
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((buf) => {
            if (!buf || tile.disposed) return [];
            const feats = decodeBuildingLayer(buf);
            for (let i = 0; i < feats.length; i++) {
              feats[i].qx = qx; feats[i].qy = qy; feats[i].qs = qs;
            }
            return feats;
          })
          .catch(() => []);
      };

      const mvtPromise = tile.isInner
        ? Promise.all([
            fetchMvtSub(ZOOM + 1, tile.tx * 2,     tile.ty * 2,     0,   0,   0.5),
            fetchMvtSub(ZOOM + 1, tile.tx * 2 + 1, tile.ty * 2,     0.5, 0,   0.5),
            fetchMvtSub(ZOOM + 1, tile.tx * 2,     tile.ty * 2 + 1, 0,   0.5, 0.5),
            fetchMvtSub(ZOOM + 1, tile.tx * 2 + 1, tile.ty * 2 + 1, 0.5, 0.5, 0.5),
          ]).then((parts) => parts.flat())
        : fetchMvtSub(ZOOM, tile.tx, tile.ty, 0, 0, 1);

      const [, , features] = await Promise.all([satPromise, terrPromise, mvtPromise]);
      if (tile.disposed) return;
      if (features && features.length > 0) {
        buildBuildingsMesh(tile, features);
      }
      tile.loaded = true;
    } finally {
      inFlightCount = Math.max(0, inFlightCount - 1);
      tile.abortCtrl = null;
    }
  }

  function spawnTile(tx, ty, isInner = false) {
    const key = `${tx},${ty}`;
    if (tiles.has(key)) return;
    const nw = tileToLatLon(tx, ty, ZOOM);
    const se = tileToLatLon(tx + 1, ty + 1, ZOOM);
    const p0 = latLonToXZ(nw.lat, nw.lon);
    const p1 = latLonToXZ(se.lat, se.lon);

    const tile = {
      key, tx, ty, isInner,
      x0: p0.x, z0: p0.z,
      w: p1.x - p0.x, d: p1.z - p0.z,
      group: new THREE.Group(),
      elevGrid: null,
      groundMesh: null,
      bldgMesh: null,
      bldgCount: 0,
      satTex: null,
      satMat: null,
      loaded: false,
      disposed: false,
      abortCtrl: null,
    };
    root.add(tile.group);
    buildTerrainMesh(tile); // flat placeholder mesh immediately
    tiles.set(key, tile);
    loadTileData(tile);
  }

  function disposeTile(tile) {
    tile.disposed = true;
    if (tile.abortCtrl) {
      try { tile.abortCtrl.abort(); } catch (_) {}
    }
    if (tile.groundMesh) {
      tile.groundMesh.geometry.dispose();
      tile.groundMesh = null;
    }
    if (tile.bldgMesh) {
      tile.bldgMesh.geometry.dispose();
      buildingsTotal = Math.max(0, buildingsTotal - tile.bldgCount);
      tile.bldgMesh = null;
    }
    if (tile.satTex) { tile.satTex.dispose(); tile.satTex = null; }
    if (tile.satMat) { tile.satMat.dispose(); tile.satMat = null; }
    root.remove(tile.group);
    tiles.delete(tile.key);
  }

  // ─── PARAMETRIC 3D LANDMARKS ──────────────────────────────────────────────
  function clearLandmarks() {
    while (landmarksGroup.children.length > 0) {
      const ch = landmarksGroup.children[0];
      ch.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      landmarksGroup.remove(ch);
    }
  }

  function buildLandmarks() {
    clearLandmarks();
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0xd0d4dc });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x7da4c4 });
    const spireMat = new THREE.MeshLambertMaterial({ color: 0xe8ecf0 });

    const placeLandmark = (lat, lon, builder) => {
      const { x, z } = latLonToXZ(lat, lon);
      if (Math.hypot(x, z) > 35000) return;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      builder(g);
      landmarksGroup.add(g);
    };

    // CN Tower (Toronto) — 553m
    placeLandmark(43.642566, -79.387057, (g) => {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(7, 22, 345, 9), concreteMat);
      shaft.position.y = 172.5;
      g.add(shaft);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(24, 20, 26, 16), glassMat);
      pod.position.y = 352;
      g.add(pod);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 8, 90, 8), concreteMat);
      upper.position.y = 410;
      g.add(upper);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.5, 102, 6), spireMat);
      spire.position.y = 502;
      g.add(spire);
    });

    // Tokyo Skytree — 634m
    placeLandmark(35.710063, 139.810700, (g) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(11, 34, 350, 6), spireMat);
      base.position.y = 175;
      g.add(base);
      const deck1 = new THREE.Mesh(new THREE.CylinderGeometry(20, 18, 18, 12), glassMat);
      deck1.position.y = 350;
      g.add(deck1);
      const mid = new THREE.Mesh(new THREE.CylinderGeometry(6, 11, 130, 8), spireMat);
      mid.position.y = 420;
      g.add(mid);
      const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(13, 12, 12, 12), glassMat);
      deck2.position.y = 450;
      g.add(deck2);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 4.5, 145, 6), spireMat);
      mast.position.y = 561;
      g.add(mast);
    });

    // One World Trade Center (NYC) — 541m
    placeLandmark(40.712743, -74.013379, (g) => {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(24, 34, 417, 8), glassMat);
      tower.position.y = 208.5;
      g.add(tower);
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 3, 124, 6), spireMat);
      spire.position.y = 479;
      g.add(spire);
    });

    // Transamerica Pyramid (San Francisco) — 260m
    placeLandmark(37.795182, -122.402778, (g) => {
      const pyr = new THREE.Mesh(new THREE.ConeGeometry(28, 260, 4), concreteMat);
      pyr.rotation.y = Math.PI / 4;
      pyr.position.y = 130;
      g.add(pyr);
    });
  }

  function start(presetId, customLatLon) {
    clearAll();
    active = true;
    root.visible = true;
    const p = FREE_FLIGHT_PRESETS[presetId] || FREE_FLIGHT_PRESETS.TORONTO;
    cityId = p.id;
    originLat = customLatLon && Number.isFinite(customLatLon.lat) ? customLatLon.lat : p.lat;
    originLon = customLatLon && Number.isFinite(customLatLon.lon) ? customLatLon.lon : p.lon;
    mPerDegLon = 111320 * Math.cos(originLat * Math.PI / 180);
    buildLandmarks();
    update(0, 0);
    return p;
  }

  function clearAll() {
    for (const tile of Array.from(tiles.values())) disposeTile(tile);
    tiles.clear();
    clearLandmarks();
    buildingsTotal = 0;
    active = false;
    root.visible = false;
  }

  function update(playerX, playerZ) {
    if (!active) return null;

    let rebaseDelta = null;
    if (Math.hypot(playerX, playerZ) > REBASE_DIST) {
      const { lat, lon } = xzToLatLon(playerX, playerZ);
      originLat = lat;
      originLon = lon;
      mPerDegLon = 111320 * Math.cos(originLat * Math.PI / 180);
      for (const tile of tiles.values()) {
        tile.group.position.x -= playerX;
        tile.group.position.z -= playerZ;
      }
      landmarksGroup.position.x -= playerX;
      landmarksGroup.position.z -= playerZ;
      rebaseDelta = { dx: -playerX, dz: -playerZ };
      playerX = 0;
      playerZ = 0;
    }

    const { lat, lon } = xzToLatLon(playerX, playerZ);
    const { tx, ty } = latLonToTileF(lat, lon, ZOOM);
    const ctx = Math.floor(tx);
    const cty = Math.floor(ty);

    // Dispose out-of-range tiles
    for (const tile of Array.from(tiles.values())) {
      if (Math.abs(tile.tx - ctx) > RING_RADIUS + 1 || Math.abs(tile.ty - cty) > RING_RADIUS + 1) {
        disposeTile(tile);
      }
    }

    // Queue missing tiles within ring, closest first
    const wanted = [];
    for (let dy = -RING_RADIUS; dy <= RING_RADIUS; dy++) {
      for (let dx = -RING_RADIUS; dx <= RING_RADIUS; dx++) {
        const ntx = ctx + dx, nty = cty + dy;
        const key = `${ntx},${nty}`;
        if (!tiles.has(key)) {
          wanted.push({ tx: ntx, ty: nty, dist: dx * dx + dy * dy, isInner: Math.abs(dx) <= 1 && Math.abs(dy) <= 1 });
        }
      }
    }
    wanted.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < wanted.length && inFlightCount < MAX_CONCURRENT_TILES; i++) {
      spawnTile(wanted[i].tx, wanted[i].ty, wanted[i].isInner);
    }

    return rebaseDelta;
  }

  function getStats() {
    let tilesLoaded = 0;
    let buildingMeshes = 0;
    for (const t of tiles.values()) {
      if (t.loaded) tilesLoaded++;
      if (t.bldgMesh) buildingMeshes++;
    }
    return {
      active,
      city: cityId,
      tilesActive: tiles.size,
      tilesLoaded,
      inFlight: inFlightCount,
      buildingsTotal,
      buildingMeshes,
      landmarksCount: landmarksGroup.children.length,
      originLat,
      originLon,
    };
  }

  return {
    start,
    clearAll,
    update,
    heightAt,
    getStats,
    get active() { return active; },
  };
}
