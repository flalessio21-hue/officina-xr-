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
    // mappa della mano: quante volte ogni cella è stata dentro la mano (nel sistema dell'oggetto)
    this.hand = new Uint16Array(res ** 3);
    this.handFrames = 0;
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

  /**
   * Segna le celle occupate dalla mano in questa lettura (capsule in coordinate mondo).
   * La mano è ferma rispetto all'oggetto mentre lo giri: l'unione di tutte le letture copre la mano
   * anche se il tracciamento è in ritardo o tremola, e alla fine quella zona viene tolta dalla forma.
   */
  markHand(caps, toLocal) {
    const { res, half, hand } = this;
    const cell = (2 * half) / res;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    const seen = new Uint8Array(res ** 3);
    for (const [wa, wb, r] of caps) {
      a.copy(wa).applyMatrix4(toLocal); b.copy(wb).applyMatrix4(toLocal);
      const lo = (v1, v2) => Math.max(0, Math.floor((Math.min(v1, v2) - r + half) / cell));
      const hi = (v1, v2) => Math.min(res - 1, Math.floor((Math.max(v1, v2) + r + half) / cell));
      const x0 = lo(a.x, b.x), x1 = hi(a.x, b.x), y0 = lo(a.y, b.y), y1 = hi(a.y, b.y), z0 = lo(a.z, b.z), z1 = hi(a.z, b.z);
      if (x0 > x1 || y0 > y1 || z0 > z1) continue;
      const ab = b.clone().sub(a), l2 = ab.lengthSq() || 1;
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const j = x + y * res + z * res * res;
        if (seen[j]) continue;
        q.set(-half + (x + 0.5) * cell, -half + (y + 0.5) * cell, -half + (z + 0.5) * cell);
        const t = Math.max(0, Math.min(1, q.clone().sub(a).dot(ab) / l2));
        if (q.distanceToSquared(a.clone().addScaledVector(ab, t)) < r * r) { seen[j] = 1; hand[j]++; }
      }
    }
    this.handFrames++;
  }

  /** Distanza con segno (metri) nel punto locale p, interpolata; null se la zona non è ancora conosciuta. */
  sample(x, y, z) {
    const { res, half, sdf, w } = this;
    const cell = (2 * half) / res;
    const fx = (x + half) / cell - 0.5, fy = (y + half) / cell - 0.5, fz = (z + half) / cell - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    if (x0 < 0 || y0 < 0 || z0 < 0 || x0 >= res - 1 || y0 >= res - 1 || z0 >= res - 1) return null;
    const ax = fx - x0, ay = fy - y0, az = fz - z0;
    let v = 0;
    for (let k = 0; k < 8; k++) {
      const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
      const j = (x0 + dx) + (y0 + dy) * res + (z0 + dz) * res * res;
      if (w[j] < 1) return null;
      v += sdf[j] * (dx ? ax : 1 - ax) * (dy ? ay : 1 - ay) * (dz ? az : 1 - az);
    }
    return v * Math.max(cell * 3, 0.012); // in metri
  }

  /**
   * Allinea una nuova lettura alla forma già costruita (ICP punto-superficie sulla TSDF):
   * corregge la posizione/rotazione stimata dal polso, che tenendo un oggetto è imprecisa e in ritardo.
   * Ritorna la matrice mondo→oggetto corretta (o quella iniziale se non si fida).
   */
  align(points, count, toLocalInit, keep, iters = 8) {
    if (this.frames < 6) return toLocalInit; // all'inizio non c'è ancora una forma su cui allinearsi
    const src = [];
    const v = new THREE.Vector3();
    const step = Math.max(1, Math.floor(count / 2500));
    for (let i = 0; i < count; i += step) {
      v.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      if (keep && !keep(v)) continue;
      v.applyMatrix4(toLocalInit);
      if (Math.abs(v.x) < this.half && Math.abs(v.y) < this.half && Math.abs(v.z) < this.half) src.push(v.x, v.y, v.z);
    }
    if (src.length < 300) return null;
    const T = new THREE.Matrix4(); // correzione nel sistema dell'oggetto
    const R = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const h = (2 * this.half) / this.res * 0.5;
    const trunc = Math.max((2 * this.half) / this.res * 3, 0.012);
    let used = 0;
    for (let it = 0; it < iters; it++) {
      const A = new Float64Array(36), b = new Float64Array(6);
      used = 0;
      for (let i = 0; i < src.length; i += 3) {
        p.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(T);
        const d = this.sample(p.x, p.y, p.z);
        if (d == null || Math.abs(d) > trunc * 0.9) continue;
        const gx = (this.sample(p.x + h, p.y, p.z) ?? d) - (this.sample(p.x - h, p.y, p.z) ?? d);
        const gy = (this.sample(p.x, p.y + h, p.z) ?? d) - (this.sample(p.x, p.y - h, p.z) ?? d);
        const gz = (this.sample(p.x, p.y, p.z + h) ?? d) - (this.sample(p.x, p.y, p.z - h) ?? d);
        const gl = Math.hypot(gx, gy, gz);
        if (gl < 1e-6) continue;
        const nx = gx / gl, ny = gy / gl, nz = gz / gl;
        // derivata del residuo rispetto a (rotazione piccola, traslazione)
        const J = [p.y * nz - p.z * ny, p.z * nx - p.x * nz, p.x * ny - p.y * nx, nx, ny, nz];
        const wgt = Math.abs(d) < 0.004 ? 1 : 0.004 / Math.abs(d); // robusto ai punti sbagliati
        for (let r = 0; r < 6; r++) {
          b[r] -= wgt * J[r] * d;
          for (let c = 0; c < 6; c++) A[r * 6 + c] += wgt * J[r] * J[c];
        }
        used++;
      }
      if (used < 150) return null;
      for (let r = 0; r < 6; r++) A[r * 6 + r] += 1e-6 + A[r * 6 + r] * 0.01;
      const x = solve6(A, b);
      if (!x) return null;
      const ang = Math.hypot(x[0], x[1], x[2]);
      R.makeRotationAxis(new THREE.Vector3(x[0], x[1], x[2]).normalize(), ang || 0);
      if (!ang) R.identity();
      R.setPosition(x[3], x[4], x[5]);
      T.premultiply(R);
      if (ang < 0.0005 && Math.hypot(x[3], x[4], x[5]) < 0.0003) break;
    }
    // correzioni troppo grandi = non mi fido (meglio la stima del polso)
    const pos = new THREE.Vector3().setFromMatrixPosition(T);
    const q = new THREE.Quaternion().setFromRotationMatrix(T);
    if (pos.length() > 0.04 || 2 * Math.acos(Math.min(1, Math.abs(q.w))) > 0.35) return null;
    this.lastAligned = used;
    return T.multiply(toLocalInit);
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
      const handThr = Math.max(2, this.handFrames * 0.12);
      const isHand = (i) => this.hand[i] >= handThr;
      for (let i = 0; i < n3; i++) solid[i] = w[i] >= 2 && sdf[i] < 0 && !isHand(i) ? 1 : 0;
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
      for (let i = 0; i < n3; i++) occ[i] = outside[i] || isHand(i) ? 0 : 1;
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

/** Risolve il sistema lineare 6×6 A x = b (eliminazione di Gauss con pivot). */
function solve6(A, b) {
  const M = [];
  for (let r = 0; r < 6; r++) M.push([...A.slice(r * 6, r * 6 + 6), b[r]]);
  for (let c = 0; c < 6; c++) {
    let piv = c;
    for (let r = c + 1; r < 6; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 6; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 7; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[6] / row[i]);
}
