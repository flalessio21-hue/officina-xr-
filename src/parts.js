import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applyPhotos } from './photo-texture.js';
import { geometryFromVoxels } from './voxel-fusion.js';

export const PALETTE = [0xd0d4da, 0x4f8cff, 0xff6b4a, 0x45d483, 0xffc845, 0xb57bff, 0x2b2f36, 0xb87333];

export const KIND_NAMES = {
  box: 'Cubo', cylinder: 'Cilindro', sphere: 'Sfera', cone: 'Cono',
  torus: 'Toro', tube: 'Tubo', gear: 'Ingranaggio', rbox: 'Blocco', lathe: 'Corpo tornito', extrude: 'Sagoma', voxel: 'Scansione 3D',
};

export const DEFAULTS = {
  box: { w: 0.08, h: 0.08, d: 0.08 },
  cylinder: { r: 0.04, h: 0.08 },
  sphere: { r: 0.045 },
  cone: { r: 0.045, h: 0.09 },
  torus: { R: 0.045, r: 0.014 },
  tube: { R: 0.04, r: 0.028, h: 0.08 },
  gear: { R: 0.05, teeth: 16, h: 0.018, hole: 0.012 },
};

function outline(R, seg) {
  const s = new THREE.Shape();
  if (seg) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      i ? s.lineTo(R * Math.cos(a), R * Math.sin(a)) : s.moveTo(R, 0);
    }
    s.closePath();
  } else {
    s.absarc(0, 0, R, 0, Math.PI * 2, false);
  }
  return s;
}

function addHole(shape, r) {
  if (!(r > 0)) return;
  const p = new THREE.Path();
  p.absarc(0, 0, r, 0, Math.PI * 2, true);
  shape.holes.push(p);
}

function extrudeFlat(shape, h) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 32 });
  g.rotateX(-Math.PI / 2); // estrusione lungo +Y
  g.translate(0, -h / 2, 0);
  return g;
}

const builders = {
  box: (p) => new THREE.BoxGeometry(p.w, p.h, p.d),
  // forma ricostruita dal sensore di profondità (griglia 3D → superficie)
  voxel: (p) => geometryFromVoxels(p),
  // blocco con spigoli arrotondati (telefoni, telecomandi, scatole…)
  rbox: (p) => new RoundedBoxGeometry(p.w, p.h, p.d, 4, Math.min(p.radius || 0.002, p.w / 2, p.h / 2, p.d / 2) * 0.999),
  // solido di rotazione da un profilo [raggio, altezza] (tazze, bottiglie, vasi, lampadine…)
  lathe: (p) => {
    const pts = (p.profile || []).map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
    if (pts.length < 2) return new THREE.CylinderGeometry(0.03, 0.03, 0.06, 32);
    const h0 = Math.min(...pts.map((v) => v.y)), h1 = Math.max(...pts.map((v) => v.y));
    const g = new THREE.LatheGeometry(pts, 64);
    g.translate(0, -(h0 + h1) / 2, 0);
    return g;
  },
  // sagoma vista di fronte (contorno X-Y) con spessore lungo Z e bordi smussati
  extrude: (p) => {
    const pts = p.outline || [];
    if (pts.length < 3) return new THREE.BoxGeometry(0.05, 0.05, p.d || 0.01);
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const bev = Math.min(p.bevel ?? 0.0015, p.d / 3);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, p.d - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 24 });
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    return g;
  },
  cylinder: (p) => new THREE.CylinderGeometry(p.r2 ?? p.r, p.r, p.h, p.seg ?? 40),
  sphere: (p) => new THREE.SphereGeometry(p.r, 32, 20),
  cone: (p) => new THREE.ConeGeometry(p.r, p.h, p.seg ?? 40),
  torus: (p) => new THREE.TorusGeometry(p.R, p.r, 16, 48).rotateX(Math.PI / 2),
  tube: (p) => {
    const s = outline(p.R, p.seg);
    addHole(s, p.r);
    return extrudeFlat(s, p.h);
  },
  gear: (p) => {
    const s = new THREE.Shape();
    const N = p.teeth, step = (Math.PI * 2) / N, rRoot = p.R * 0.84;
    for (let i = 0; i < N; i++) {
      const a = i * step;
      const pts = [[rRoot, a], [p.R, a + step * 0.22], [p.R, a + step * 0.5], [rRoot, a + step * 0.72]];
      pts.forEach(([r, b], j) => {
        const x = r * Math.cos(b), y = r * Math.sin(b);
        i === 0 && j === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
      });
    }
    s.closePath();
    addHole(s, p.hole);
    return extrudeFlat(s, p.h);
  },
};

// colori "metallici": acciaio, ottone, rame…
const METALS = new Set([0xc9ced6, 0x9aa0a8, 0xffc845, 0xb87333, 0xd4af37, 0xd0d4da]);

export function createPart(kind, params = DEFAULTS[kind], color = PALETTE[0], name) {
  const geo = builders[kind](params);
  const metal = METALS.has(color);
  const m = params.mat || {};
  const opacity = m.opacity ?? 1;
  const opts = {
    color,
    roughness: m.roughness ?? (metal ? 0.3 : 0.5),
    metalness: m.metalness ?? (metal ? 0.9 : 0.05),
    transparent: opacity < 0.99, opacity,
  };
  // la vernice lucida (clearcoat) costa di più al visore: solo se serve
  const mat = m.clearcoat > 0
    ? new THREE.MeshPhysicalMaterial({ ...opts, clearcoat: m.clearcoat, clearcoatRoughness: 0.2 })
    : new THREE.MeshStandardMaterial(opts);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name || KIND_NAMES[kind] || kind;
  mesh.userData = { isPart: true, kind, params: { ...params }, color };
  return mesh;
}

export function createAssembly(name = 'Assieme', children = []) {
  const g = new THREE.Group();
  g.name = name;
  g.userData = { isAssembly: true };
  for (const c of children) g.add(c);
  return g;
}

export const isNode = (o) => !!(o && (o.userData.isPart || o.userData.isAssembly));

// --- helper per costruire i modelli demo ---------------------------------
export function part(kind, params, color, name, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = createPart(kind, params, color, name);
  m.position.fromArray(pos);
  m.rotation.fromArray(rot);
  return m;
}
export function at(node, pos, rot) {
  node.position.fromArray(pos);
  if (rot) node.rotation.fromArray(rot);
  return node;
}

export const C = {
  carbon: 0x1d1f24, metal: 0xc9ced6, steel: 0x9aa0a8, copper: 0xb87333, pcb: 0x1f8a4c,
  chip: 0x15171b, gold: 0xffc845, bell: 0xd94a3a, prop: 0xe8ecf2, battery: 0x4f8cff, red: 0xff4a3d,
};

/** Vite completa: testa esagonale, gambo e singole spire del filetto. */
export function buildScrew(len = 0.05, r = 0.006, name = 'Vite', threads = 5) {
  const kids = [
    part('cylinder', { r: r * 1.8, h: r * 1.3, seg: 6 }, C.steel, 'Testa esagonale', [0, len + r * 0.65, 0]),
    part('cylinder', { r, h: len, seg: 24 }, C.metal, 'Gambo', [0, len / 2, 0]),
  ];
  for (let i = 0; i < threads; i++) {
    const y = len * (0.1 + (i * 0.6) / Math.max(1, threads - 1));
    kids.push(part('torus', { R: r, r: r * 0.2 }, C.metal, `Spira filetto ${i + 1}`, [0, y, 0]));
  }
  return createAssembly(name, kids);
}

export function buildScrewAndNut() {
  const screw = buildScrew(0.06, 0.007, 'Vite M14', 6);
  const nut = part('tube', { R: 0.013, r: 0.007, h: 0.011, seg: 6 }, C.steel, 'Dado', [0, 0.012, 0]);
  const washer = part('tube', { R: 0.014, r: 0.0075, h: 0.002 }, C.metal, 'Rondella', [0, 0.02, 0]);
  return createAssembly('Vite e dado', [screw, washer, nut]);
}

function buildMotor() {
  const kids = [
    part('cylinder', { r: 0.014, h: 0.003 }, C.carbon, 'Base motore', [0, 0.0015, 0]),
    part('gear', { R: 0.0105, teeth: 12, h: 0.01, hole: 0.003 }, C.copper, 'Statore (avvolgimenti)', [0, 0.009, 0]),
    part('tube', { R: 0.0125, r: 0.0115, h: 0.01 }, C.chip, 'Anello magneti', [0, 0.0095, 0]),
    part('tube', { R: 0.0145, r: 0.0127, h: 0.013 }, C.bell, 'Campana rotore', [0, 0.0105, 0]),
    part('cylinder', { r: 0.0145, h: 0.002 }, C.bell, 'Coperchio campana', [0, 0.018, 0]),
    part('torus', { R: 0.003, r: 0.0011 }, C.metal, 'Cuscinetto', [0, 0.0198, 0]),
    part('cylinder', { r: 0.0015, h: 0.03, seg: 16 }, C.metal, 'Albero', [0, 0.017, 0]),
    part('tube', { R: 0.004, r: 0.0015, h: 0.003, seg: 6 }, C.steel, 'Dado elica', [0, 0.03, 0]),
  ];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const s = buildScrew(0.008, 0.0012, `Vite M2 #${i + 1}`, 3);
    at(s, [Math.cos(a) * 0.0085, -0.006, Math.sin(a) * 0.0085]);
    kids.push(s);
  }
  return createAssembly('Motore brushless', kids);
}

function buildProp() {
  return createAssembly('Elica', [
    part('cylinder', { r: 0.0045, h: 0.006 }, C.prop, 'Mozzo', [0, 0, 0]),
    part('box', { w: 0.055, h: 0.0015, d: 0.01 }, C.prop, 'Pala A', [0.029, 0, 0], [0.3, 0, 0]),
    part('box', { w: 0.055, h: 0.0015, d: 0.01 }, C.prop, 'Pala B', [-0.029, 0, 0], [-0.3, 0, 0]),
    part('cone', { r: 0.0045, h: 0.006 }, C.red, 'Ogiva', [0, 0.006, 0]),
  ]);
}

/** Drone multi-livello: drone → sotto-assiemi → motori → viti → spire. */
export function buildDrone() {
  const frameKids = [
    part('box', { w: 0.13, h: 0.004, d: 0.13 }, C.carbon, 'Piastra inferiore', [0, 0.002, 0]),
    part('box', { w: 0.13, h: 0.004, d: 0.13 }, C.carbon, 'Piastra superiore', [0, 0.034, 0]),
  ];
  let n = 1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    frameKids.push(part('cylinder', { r: 0.004, h: 0.028, seg: 6 }, C.gold, `Distanziale ${n++}`, [sx * 0.05, 0.018, sz * 0.05]));
  }
  const frame = createAssembly('Telaio', frameKids);

  const fcKids = [
    part('box', { w: 0.036, h: 0.002, d: 0.036 }, C.pcb, 'Scheda (PCB)', [0, 0, 0]),
    part('box', { w: 0.012, h: 0.002, d: 0.012 }, C.chip, 'Microcontrollore', [0, 0.002, 0]),
    part('box', { w: 0.006, h: 0.0015, d: 0.006 }, C.chip, 'Giroscopio (IMU)', [0.011, 0.0018, -0.011]),
    part('box', { w: 0.008, h: 0.004, d: 0.004 }, C.gold, 'Connettore USB', [0, 0.003, 0.016]),
  ];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const s = buildScrew(0.006, 0.001, `Vite scheda #${i + 1}`, 2);
    at(s, [Math.cos(a) * 0.022, -0.003, Math.sin(a) * 0.022]);
    fcKids.push(s);
  }
  const fc = at(createAssembly('Controllore di volo', fcKids), [0, 0.016, 0]);

  const battery = at(createAssembly('Batteria', [
    part('box', { w: 0.09, h: 0.022, d: 0.035 }, C.battery, 'Cella LiPo', [0, 0, 0]),
    part('box', { w: 0.006, h: 0.025, d: 0.038 }, C.carbon, 'Fascetta', [0, 0, 0]),
    part('cylinder', { r: 0.0018, h: 0.03 }, C.red, 'Cavo +', [0.058, 0, 0.006], [0, 0, Math.PI / 2]),
    part('cylinder', { r: 0.0018, h: 0.03 }, C.chip, 'Cavo −', [0.058, 0, -0.006], [0, 0, Math.PI / 2]),
    part('box', { w: 0.008, h: 0.008, d: 0.018 }, C.gold, 'Connettore XT60', [0.076, 0, 0]),
  ]), [0, 0.047, 0]);

  const arms = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const arm = createAssembly(`Braccio ${k + 1}`, [
      part('box', { w: 0.12, h: 0.008, d: 0.016 }, C.carbon, 'Braccio in carbonio', [0.09, 0.008, 0]),
      at(buildMotor(), [0.15, 0.012, 0]),
      at(buildProp(), [0.15, 0.046, 0]),
    ]);
    arm.rotation.y = -a;
    arms.push(arm);
  }
  return createAssembly('Drone', [frame, fc, battery, ...arms]);
}

// --- serializzazione -------------------------------------------------------
const r5 = (a) => a.map((v) => Math.round(v * 1e5) / 1e5);

export function serializeNode(node) {
  const exploded = node.parent?.userData.exploded && node.userData.homePos;
  const pos = exploded ? node.userData.homePos : node.position;
  const base = { name: node.name, p: r5(pos.toArray()), q: r5(node.quaternion.toArray()), s: r5(node.scale.toArray()) };
  if (node.userData.isAssembly) {
    const out = { ...base, type: 'asm', children: node.children.filter(isNode).map(serializeNode) };
    if (node.userData.photos) out.photos = node.userData.photos;
    return out;
  }
  return { ...base, type: 'part', kind: node.userData.kind, params: node.userData.params, color: node.userData.color };
}

export function deserializeNode(d) {
  const node = d.type === 'asm'
    ? createAssembly(d.name, (d.children || []).map(deserializeNode))
    : createPart(d.kind, d.params, d.color, d.name);
  node.position.fromArray(d.p);
  node.quaternion.fromArray(d.q);
  node.scale.fromArray(d.s);
  if (d.type === 'asm' && d.photos) applyPhotos(node, d.photos);
  return node;
}
