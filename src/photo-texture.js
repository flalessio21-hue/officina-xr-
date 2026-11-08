import * as THREE from 'three';

/**
 * Le foto vere dell'oggetto scansionato vengono "proiettate" sulla sua forma ricostruita,
 * come un proiettore per ogni lato: davanti, dietro, sinistra, destra, sopra, sotto.
 * Ogni triangolo prende la foto del lato verso cui guarda, così l'etichetta di una bottiglia
 * o lo schermo di un telefono compaiono dove sono davvero.
 *
 * photos: { front?: dataURL, back?, left?, right?, top?, bottom? } già ritagliate sull'oggetto
 * (l'oggetto riempie la foto, in piedi). Sistema dell'oggetto: x destra, y su, z verso chi guarda.
 */
const DIRS = ['right', 'left', 'top', 'bottom', 'front', 'back']; // +x -x +y -y +z -z
const loader = new THREE.TextureLoader();
const cache = new Map();

function texture(src) {
  if (!cache.has(src)) {
    const t = loader.load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(src, t);
  }
  return cache.get(src);
}

function dirOf(n) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return n.x > 0 ? 0 : 1;
  if (ay >= az) return n.y > 0 ? 2 : 3;
  return n.z > 0 ? 4 : 5;
}

// coordinate di texture del punto p (spazio oggetto) visto dal lato d, con b = ingombro dell'oggetto
function uvOf(d, p, b) {
  const nx = (p.x - b.min.x) / Math.max(1e-6, b.max.x - b.min.x);
  const ny = (p.y - b.min.y) / Math.max(1e-6, b.max.y - b.min.y);
  const nz = (p.z - b.min.z) / Math.max(1e-6, b.max.z - b.min.z);
  switch (d) {
    case 0: return [1 - nz, ny]; // da destra: la destra dell'immagine è -z
    case 1: return [nz, ny];
    case 2: return [nx, 1 - nz]; // dall'alto: in alto nell'immagine c'è il retro
    case 3: return [nx, nz];
    case 4: return [nx, ny];
    default: return [1 - nx, ny];
  }
}

export function applyPhotos(asm, photos) {
  if (!photos || !Object.keys(photos).length) return;
  asm.userData.photos = photos;
  asm.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(asm.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const meshes = [];
  asm.traverse((o) => { if (o.isMesh && o.userData.isPart) meshes.push(o); });

  // ingombro dell'intero oggetto nel suo sistema
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const m of meshes) {
    rel.multiplyMatrices(inv, m.matrixWorld);
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(rel));
  }

  const center = box.getCenter(new THREE.Vector3());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  for (const m of meshes) {
    const base = [].concat(m.material)[0];
    if (base.transparent || m.userData.params?.photo === false) continue; // vetro, trasparenze e pezzi interni restano lisci
    rel.multiplyMatrices(inv, m.matrixWorld);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const pos = g.attributes.position, nor = g.attributes.normal;
    const tris = pos.count / 3;
    const buckets = Array.from({ length: 7 }, () => []);
    for (let t = 0; t < tris; t++) {
      a.fromBufferAttribute(pos, t * 3).applyMatrix4(rel);
      b.fromBufferAttribute(pos, t * 3 + 1).applyMatrix4(rel);
      c.fromBufferAttribute(pos, t * 3 + 2).applyMatrix4(rel);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      if (n.lengthSq() < 1e-14) { buckets[0].push(t); continue; }
      const d = dirOf(n);
      // solo la superficie esterna: le pareti interne (dentro una tazza) restano del loro colore
      e1.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(center);
      const outward = n.dot(e1) > 0;
      buckets[outward && photos[DIRS[d]] ? d + 1 : 0].push(t);
    }
    if (buckets.slice(1).every((x) => !x.length)) { g.dispose(); continue; }
    // ricostruisce la geometria raggruppando i triangoli per foto
    const P = [], N = [], U = [];
    const ng = new THREE.BufferGeometry();
    let start = 0;
    buckets.forEach((list, k) => {
      for (const t of list) {
        for (let j = 0; j < 3; j++) {
          const i = t * 3 + j;
          P.push(pos.getX(i), pos.getY(i), pos.getZ(i));
          N.push(nor.getX(i), nor.getY(i), nor.getZ(i));
          if (k === 0) U.push(0, 0);
          else U.push(...uvOf(k - 1, v.fromBufferAttribute(pos, i).applyMatrix4(rel), box));
        }
      }
      if (list.length) ng.addGroup(start, list.length * 3, k);
      start += list.length * 3;
    });
    ng.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    ng.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.dispose();
    const mats = [base];
    for (const dir of DIRS) {
      const src = photos[dir];
      if (!src) { mats.push(base); continue; }
      const mm = base.clone();
      mm.color = new THREE.Color(0xffffff);
      mm.map = texture(src);
      mats.push(mm);
    }
    m.geometry.dispose();
    m.geometry = ng;
    m.material = mats;
  }
}
