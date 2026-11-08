import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

/**
 * Fusione dei punti di profondità in una griglia 3D (voxel) e ricostruzione della superficie.
 * I punti si accumulano nel sistema della mano (l'oggetto ruota con lei), così girandolo
 * si riempiono tutti i lati. Le celle viste più volte diventano "pieno"; il rumore resta fuori.
 */
export const GRID = 64;
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class VoxelFusion {
  constructor({ half = 0.14, res = GRID } = {}) {
    this.half = half;
    this.res = res;
    this.hits = new Float32Array(res ** 3);
    // TSDF: distanza con segno dalla superficie (media pesata) e peso di ogni cella
    this.sdf = new Float32Array(res ** 3).fill(1);
    this.w = new Float32Array(res ** 3);
    this.frames = 0;
    this.total = 0;
    this._v = new THREE.Vector3();
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  /**
   * Fusione "seria" (TSDF): per ogni punto misurato aggiorno le celle lungo il raggio dall'occhio:
   * davanti alla superficie = vuoto, appena dietro = pieno. Il rumore del sensore si annulla nella media
   * e lo spazio libero cancella i punti sbagliati.
   */
  integrate(points, count, toLocal, eyeWorld, keep) {
    const { res, half, sdf, w, hits } = this;
    const cell = (2 * half) / res;
    const k = 1 / cell;
    const trunc = Math.max(cell * 3, 0.012); // spessore della fascia attorno alla superficie
    const carve = 0.05; // spazio libero davanti alla superficie
    const step = cell * 0.7;
    const v = this._v, o = this._o.copy(eyeWorld).applyMatrix4(toLocal), dir = this._d;
    let added = 0;
    for (let i = 0; i < count; i++) {
      v.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      if (keep && !keep(v)) continue;
      v.applyMatrix4(toLocal);
      if (Math.abs(v.x) > half + trunc || Math.abs(v.y) > half + trunc || Math.abs(v.z) > half + trunc) continue;
      dir.subVectors(v, o).normalize();
      added++;
      for (let s = -carve; s <= trunc; s += step) {
        const x = Math.floor((v.x + dir.x * s + half) * k), y = Math.floor((v.y + dir.y * s + half) * k), z = Math.floor((v.z + dir.z * s + half) * k);
        if (x < 0 || y < 0 || z < 0 || x >= res || y >= res || z >= res) continue;
        const j = x + y * res + z * res * res;
        const d = s < -trunc ? 1 : -s / trunc; // >0 davanti (vuoto), <0 dietro (pieno)
        const wt = s < -trunc ? 0.5 : 1;
        const W = w[j];
        sdf[j] = (sdf[j] * W + d * wt) / (W + wt);
        w[j] = Math.min(60, W + wt);
        if (Math.abs(s) < step) hits[j] += 1; // per l'anteprima
      }
    }
    this.frames++;
    this.total += added;
    return added;
  }

  /**
   * points: Float32Array mondo; toLocal: Matrix4 mondo → sistema dell'oggetto (centro = 0);
   * keep(worldPoint): false per scartare (es. punti della mano).
   */
  add(points, count, toLocal, keep) {
    const { res, half, hits } = this;
    const v = this._v;
    const k = res / (2 * half);
    let added = 0;
    for (let i = 0; i < count; i++) {
      v.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      if (keep && !keep(v)) continue;
      v.applyMatrix4(toLocal);
      const x = Math.floor((v.x + half) * k), y = Math.floor((v.y + half) * k), z = Math.floor((v.z + half) * k);
      if (x < 0 || y < 0 || z < 0 || x >= res || y >= res || z >= res) continue;
      hits[x + y * res + z * res * res] += 1;
      added++;
    }
    this.frames++;
    this.total += added;
    return added;
  }

  /** Celle piene: viste abbastanza volte, solo il blocco connesso più grande (niente rumore). */
  occupancy() {
    const { res, hits, sdf, w } = this;
    const n3 = res ** 3;
    const occ = new Uint8Array(n3);
    let tsdf = false;
    for (let i = 0; i < n3; i++) if (w[i] > 0) { tsdf = true; break; }
    if (tsdf) {
      // pieno osservato = dietro la superficie, visto almeno due volte
      const solid = new Uint8Array(n3);
      for (let i = 0; i < n3; i++) solid[i] = w[i] >= 2 && sdf[i] < 0 ? 1 : 0;
      // "fuori" = raggiungibile dal bordo senza attraversare il pieno; tutto il resto è l'oggetto
      // (così l'interno mai visto, chiuso dalla superficie, diventa pieno)
      const outside = new Uint8Array(n3);
      const stack = [];
      for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
        if (x && y && z && x < res - 1 && y < res - 1 && z < res - 1) continue;
        const i = x + y * res + z * res * res;
        if (!solid[i]) { outside[i] = 1; stack.push(i); }
      }
      while (stack.length) {
        const j = stack.pop();
        const x = j % res, y = Math.floor(j / res) % res, z = Math.floor(j / (res * res));
        for (const [dx, dy, dz] of N6) {
          const X = x + dx, Y = y + dy, Z = z + dz;
          if (X < 0 || Y < 0 || Z < 0 || X >= res || Y >= res || Z >= res) continue;
          const q = X + Y * res + Z * res * res;
          if (!outside[q] && !solid[q]) { outside[q] = 1; stack.push(q); }
        }
      }
      for (let i = 0; i < n3; i++) occ[i] = outside[i] ? 0 : 1;
    } else {
      let max = 0;
      for (let i = 0; i < n3; i++) max = Math.max(max, hits[i]);
      const thr = Math.max(2, Math.min(6, max * 0.04));
      for (let i = 0; i < n3; i++) occ[i] = hits[i] >= thr ? 1 : 0;
    }
    // componente connessa più grande (26 vicini)
    const label = new Int32Array(n3);
    let best = 0, bestSize = 0, cur = 0;
    const stack = [];
    for (let i = 0; i < n3; i++) {
      if (!occ[i] || label[i]) continue;
      cur++;
      let size = 0;
      stack.push(i);
      label[i] = cur;
      while (stack.length) {
        const j = stack.pop();
        size++;
        const x = j % res, y = Math.floor(j / res) % res, z = Math.floor(j / (res * res));
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy, Z = z + dz;
          if (X < 0 || Y < 0 || Z < 0 || X >= res || Y >= res || Z >= res) continue;
          const q = X + Y * res + Z * res * res;
          if (occ[q] && !label[q]) { label[q] = cur; stack.push(q); }
        }
      }
      if (size > bestSize) { bestSize = size; best = cur; }
    }
    for (let i = 0; i < n3; i++) occ[i] = label[i] === best ? 1 : 0;
    return { occ, cells: bestSize };
  }

  /** Parametri salvabili della forma (bit compressi in base64). */
  toParams() {
    const { occ, cells } = this.occupancy();
    return { cells, res: this.res, half: this.half, bits: packBits(occ) };
  }
}

function packBits(occ) {
  const bytes = new Uint8Array(Math.ceil(occ.length / 8));
  for (let i = 0; i < occ.length; i++) if (occ[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unpackBits(b64, n) {
  const s = atob(b64);
  const occ = new Uint8Array(n);
  for (let i = 0; i < n; i++) occ[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return occ;
}

function dilate(occ, res) {
  const out = occ.slice();
  for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    if (!occ[x + y * res + z * res * res]) continue;
    for (const [dx, dy, dz] of N6) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X >= 0 && Y >= 0 && Z >= 0 && X < res && Y < res && Z < res) out[X + Y * res + Z * res * res] = 1;
    }
  }
  return out;
}
function erode(occ, res) {
  const out = occ.slice();
  for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const i = x + y * res + z * res * res;
    if (!occ[i]) continue;
    for (const [dx, dy, dz] of N6) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= res || Y >= res || Z >= res || !occ[X + Y * res + Z * res * res]) { out[i] = 0; break; }
    }
  }
  return out;
}
/** Il sensore vede solo la "pelle" dell'oggetto: chiudo i piccoli buchi e riempio l'interno. */
function solidify(occ, res) {
  const closed = dilate(occ, res);
  const outside = new Uint8Array(occ.length);
  const stack = [];
  for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    if (x && y && z && x < res - 1 && y < res - 1 && z < res - 1) continue;
    const i = x + y * res + z * res * res;
    if (!closed[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const j = stack.pop();
    const x = j % res, y = Math.floor(j / res) % res, z = Math.floor(j / (res * res));
    for (const [dx, dy, dz] of N6) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= res || Y >= res || Z >= res) continue;
      const q = X + Y * res + Z * res * res;
      if (!closed[q] && !outside[q]) { outside[q] = 1; stack.push(q); }
    }
  }
  const solid = new Uint8Array(occ.length);
  for (let i = 0; i < occ.length; i++) solid[i] = outside[i] ? 0 : 1;
  return erode(solid, res);
}

/**
 * Superficie liscia dalle celle piene (marching cubes), centrata e con la base a y = 0
 * se `ground` è vero. Misure reali in metri.
 */
export function geometryFromVoxels({ res, half, bits }, { ground = false } = {}) {
  const n = res + 2; // un bordo vuoto: superficie sempre chiusa
  const occ = solidify(unpackBits(bits, res ** 3), res);
  const mc = new MarchingCubes(n, new THREE.MeshBasicMaterial(), false, false, 60000);
  mc.isolation = 0.5; // a metà tra pieno e vuoto: il bordo vero, non gonfiato
  mc.reset();
  for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    if (occ[x + y * res + z * res * res]) mc.field[(x + 1) + (y + 1) * n + (z + 1) * n * n] = 1;
  }
  mc.blur(1); // bordi morbidi invece che a cubetti
  mc.update();
  const cnt = mc.count;
  const src = mc.geometry;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(src.attributes.position.array.slice(0, cnt * 3), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(src.attributes.normal.array.slice(0, cnt * 3), 3));
  mc.geometry.dispose();
  // da [-1,1] della griglia allargata ai metri veri
  const k = half * (n / res);
  g.scale(k, k, k);
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, ground ? -g.boundingBox.min.y : -c.y, -c.z);
  g.computeBoundingSphere();
  return g;
}
