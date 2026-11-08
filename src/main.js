import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment, DESK } from './environment.js';
import { Hologram } from './hologram.js';
import { Weather } from './weather.js';
import { VoiceInput } from './voice-input.js';
import { NeuralVoice } from './tts.js';
import { DeskGrab } from './desk-grab.js';
import { Scanner } from './scanner.js';
import { AIOrb } from './ai.js';
import { Workspace } from './workspace.js';
import { Panel } from './panel.js';
import { createActions, PANEL_TABS } from './actions.js';
import { XRInput } from './xr-input.js';
import { MouseInput } from './mouse-input.js';
import { ThemeManager } from './themes.js';
import { Physics } from './physics.js';
import { Brain } from './brain.js';
import { FEATURES } from './features.js';
import { HeadsetCamera } from './camera.js';
import { createPart, createAssembly } from './parts.js';
import { Avatars } from './net/avatars.js';
import { firebaseConfig } from './net/config.js';

const AUTOSAVE_KEY = 'officina-xr-autosave';

// alpha: serve per la realtà mista (passthrough): dove non c'è niente si vede la stanza vera
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();

// il "giocatore": camera, controller e mani stanno qui dentro; muovendo il rig ti sposti nella stanza
const rig = new THREE.Group();
rig.name = 'rig';
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(-0.15, 1.45, 0.75);
rig.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-0.15, 0.85, -0.6);
controls.enableDamping = true;
controls.maxDistance = 14;
controls.update();

const env = createEnvironment(scene, renderer);
const workspace = new Workspace(env.workspaceRoot);
const ai = new AIOrb(scene);

const panel = new Panel(PANEL_TABS, { width: 0.5 });
panel.mesh.position.set(-0.98, 1.1, 0.12); // a sinistra della scrivania, inclinato verso di te
env.deskRig.add(panel.mesh);
env.deskRig.updateMatrixWorld(true);
panel.mesh.lookAt(0, 1.25, 0);

const themes = new ThemeManager(scene, env, renderer);

// l'AI è un ologramma sulla scrivania (angolo in fondo a sinistra): la vecchia luce lontana sparisce
const hologram = new Hologram(env.deskRig, new THREE.Vector3(-0.5, DESK.h, -0.25), renderer);
hologram.load(new URL('../assets/models/facecap.glb', import.meta.url).href).catch((e) => console.error('ologramma', e));
for (const o of [ai.core, ai.inner, ai.outer, ai.glow, ai.halo, ai.motes]) if (o) o.visible = false;
if (ai.light) ai.light.visible = false;
ai.group.scale.setScalar(0.09); // sottotitoli piccoli, sopra la testa
const _hv = new THREE.Vector3();
const avatars = new Avatars(scene);
let net = null; // stanze condivise: attive solo con Firebase configurato

const physics = new Physics(workspace, env);
const ctx = { workspace, ai, panel, env, themes, physics, get net() { return net; } };
const actions = createActions(ctx);
if (physics.enabled) { panel.setLabel('gravity', 'Gravità: SÌ'); panel.setActive('gravity', true); }

/** Gli oggetti lasciati cadere nel cestino spariscono. */
const _bp = new THREE.Vector3();
function checkBin() {
  const { center, radius, height } = env.bin;
  for (const n of workspace.topLevel()) {
    if (n.userData.grabbed) continue;
    n.getWorldPosition(_bp);
    if (_bp.y < height && Math.hypot(_bp.x - center.x, _bp.z - center.z) < radius) {
      const name = n.name;
      workspace.selected = new Set([n]);
      workspace.remove();
      actions.announce(`${name} buttato nel cestino. Puoi recuperarlo con Annulla.`);
    }
  }
}
// ---------------------------------------------------------------- AI: Claude se c'è la chiave, altrimenti comandi locali
const camera3 = new HeadsetCamera();
let mixedReality = false;

/** Costruisce un oggetto (assieme smontabile) dalla descrizione di Claude. Misure in millimetri. */
function buildFromSpec(spec) {
  const mm = (v, min = 1, max = 3000) => Math.min(max, Math.max(min, Number(v) || 0)) / 1000;
  const color = (c) => (/^#?[0-9a-f]{6}$/i.test(c || '') ? parseInt(c.replace('#', ''), 16) : 0xd0d4da);
  const makePart = (p) => {
    const [sx, sy, sz] = (p.size_mm || [50, 50, 50]).map((v) => mm(v));
    let part, scale = [1, 1, 1];
    switch (p.kind) {
      case 'sphere': part = createPart('sphere', { r: sx / 2 }, color(p.color), p.name); scale = [1, sy / sx, sz / sx]; break;
      case 'cylinder': part = createPart('cylinder', { r: sx / 2, h: sy }, color(p.color), p.name); scale = [1, 1, sz / sx]; break;
      case 'cone': part = createPart('cone', { r: sx / 2, h: sy }, color(p.color), p.name); scale = [1, 1, sz / sx]; break;
      case 'torus': { const r = Math.min(sy / 2, sx / 4); part = createPart('torus', { R: sx / 2 - r, r }, color(p.color), p.name); break; }
      case 'tube': part = createPart('tube', { R: sx / 2, r: sx * 0.36, h: sy }, color(p.color), p.name); break;
      case 'gear': part = createPart('gear', { R: sx / 2, teeth: Math.round(Math.min(32, Math.max(8, sx * 300))), h: sy, hole: sx * 0.12 }, color(p.color), p.name); break;
      default: part = createPart('box', { w: sx, h: sy, d: sz }, color(p.color), p.name);
    }
    const [px, py, pz] = (p.position_mm || [0, 0, 0]).map((v) => (Number(v) || 0) / 1000);
    const [rx, ry, rz] = (p.rotation_deg || [0, 0, 0]).map((v) => ((Number(v) || 0) * Math.PI) / 180);
    part.position.set(px, py, pz);
    part.rotation.set(rx, ry, rz);
    part.scale.set(...scale.map((v) => (Number.isFinite(v) && v > 0 ? v : 1)));
    return part;
  };
  const groups = (spec.groups || []).filter((g) => g.parts?.length);
  if (!groups.length) return null;
  const children = groups.length === 1
    ? groups[0].parts.slice(0, 80).map(makePart)
    : groups.map((g) => createAssembly(g.name || 'Componente', g.parts.slice(0, 60).map(makePart)));
  const node = createAssembly(spec.name || 'Oggetto', children);
  workspace.placeOnDesk(node);
  workspace.select(node);
  return node;
}

/** Porta una misura degli oggetti selezionati a un valore in millimetri. */
function setSizeMm(axis, value) {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  for (const n of workspace.selected) {
    box.setFromObject(n).getSize(size);
    const cur = axis === 'all' ? Math.max(size.x, size.y, size.z) : size[axis];
    if (cur <= 0) continue;
    const f = Math.min(50, Math.max(0.02, value / 1000 / cur));
    if (axis === 'all') n.scale.multiplyScalar(f); else n.scale[axis] *= f;
  }
  workspace.markDirty();
}

let deskVisible = true;
function setDeskVisible(v) {
  deskVisible = v;
  for (const c of env.deskRig.children) {
    if (c === env.workspaceRoot || c === panel.mesh || c.isLight || c.type === 'Object3D') continue;
    c.visible = v;
  }
  if (physics.enabled) physics.buildStatic();
  panel.setLabel('deskToggle', v ? 'Scrivania: SÌ' : 'Scrivania: NO');
  return v ? 'Scrivania visibile.' : 'Scrivania nascosta: gli oggetti restano dove sono.';
}
ctx.toggleDesk = () => setDeskVisible(!deskVisible);

/** Aspetto del mondo in realtà mista: niente cielo, pavimento, nebbia e particelle. */
function applyMixedLook(on) {
  mixedReality = on;
  if (on) {
    scene.background = null;
    scene.fog = null;
    env.floor.visible = false;
    themes.points.visible = false;
    themes.setDressingVisible(false);
    renderer.setClearColor(0x000000, 0);
  } else {
    themes.apply(themes.current);
  }
}

async function startSession(mode) {
  if (!navigator.xr) throw new Error('WebXR non disponibile');
  const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] });
  session.addEventListener('end', () => setTimeout(updateXRButtons, 0));
  await renderer.xr.setSession(session);
}

ctx.mixedReality = () => {
  const session = renderer.xr.getSession();
  if (mixedReality) return 'Sei già in realtà mista.';
  if (!session) {
    startSession('immersive-ar').catch(() => ai.say('Premi «Realtà mista» nella pagina per vedere la tua stanza.'));
    return null;
  }
  // dalla VR alla realtà mista: si chiude la sessione e se ne apre una nuova
  session.end().then(() => startSession('immersive-ar')).catch(() => {
    ai.say('Per la realtà mista premi il pulsante «Realtà mista» nella pagina.');
  });
  return 'Passo alla realtà mista…';
};

const brain = new Brain({
  workspace, actions, ai, themes, physics, env, panel,
  extra: {
    buildFromSpec, setSizeMm, setDeskVisible,
    spawnItem: (item, opts) => spawnItem(item, opts),
    scan: () => ctx.scan?.(),
    buildRealistic: (input) => {
      const node = scanner.buildFromScan({ name: input.name, parts: input.parts }, []);
      if (!node) return null;
      spawnItem({ label: node.name, build: () => node }, { size: input.scale === 'desk' ? 'mini' : 'real' });
      return node;
    }, enterMixedReality: () => ctx.mixedReality() || 'Fatto.', isMixedReality: () => mixedReality },
});

/** Ogni comando (voce, testo, pannello «Parla con AI») passa da qui. */
function command(text) {
  // scansione e diagnostica partono subito, senza passare da Claude
  const quick = /scansion|scanneriz|diagnostic|cosa non (va|funziona)/i.test(text);
  // i comandi del menu (gravità, schede, pulsanti) partono subito, senza aspettare Claude
  if (brain.enabled && !quick && actions.menu(text) !== undefined) return;
  if (brain.enabled && !quick) brain.handle(text);
  else actions.voice(text);
}
ai.onHeard = command;


const xrInput = new XRInput(renderer, scene, rig, camera, { panel, workspace, actions, env });
const deskGrab = new DeskGrab(env);
xrInput.desk = deskGrab;
ctx.deskGrab = deskGrab;
const scanner = new Scanner({
  scene, camera, xrInput, headsetCamera: camera3, brain, ai, actions, workspace,
  isMixedReality: () => mixedReality,
});
scanner.appear = (n) => appear(n);
ctx.scan = () => scanner.start(scanner.bestHand());
ctx.diag = () => scanner.diagnose();
ctx.scanCancel = () => scanner.cancel();
env.turn = (a) => xrInput.turn(a);
env.home = () => xrInput.home();
new MouseInput(renderer, camera, controls, { panel, workspace, actions });

try {
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (saved) workspace.load(JSON.parse(saved));
} catch { /* niente autosalvataggio */ }

// ---------------------------------------------------------------- account e stanze condivise
const params = new URLSearchParams(location.search);
const emulator = params.has('emu');
const fbConfig = emulator
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-officina', databaseURL: 'http://127.0.0.1:9000?ns=demo-officina-default-rtdb' }
  : firebaseConfig;
const accountEl = document.getElementById('account');
if (fbConfig && accountEl) {
  Promise.all([import('./net/net.js'), import('./net/account-ui.js')]).then(async ([{ Net }, { AccountUI }]) => {
    const n = new Net(workspace);
    await n.init(fbConfig, { emulator });
    n.on('room', (room) => {
      if (!room) return;
      xrInput.setSeat(room.seat);
      if (renderer.xr.isPresenting) xrInput.home();
    });
    n.on('theme', (id) => { if (id !== themes.current) themes.apply(id); });
    n.on('people', (p) => avatars.update(p));
    n.on('join', (p) => ai.say(`${p.name} è entrato nella stanza.`));
    n.on('leave', (p) => ai.say(`${p.name} è uscito.`));
    net = n;
    window.officina.net = n;
    new AccountUI(accountEl, n);
  }).catch((e) => {
    console.error('Firebase non disponibile', e);
    accountEl.hidden = true;
  });
} else if (accountEl) {
  accountEl.hidden = true;
}

const _hm = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
/** Testa e mani in coordinate del mondo, da mandare agli altri nella stanza. */
function myPose() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  cam.updateMatrixWorld();
  _hm.copy(cam.matrixWorld).decompose(_p, _q, _s);
  const pose = { head: [..._p.toArray(), ..._q.toArray()] };
  if (renderer.xr.isPresenting) {
    for (const c of xrInput.controllers) {
      if (!c.userData.source) continue;
      const side = c.userData.source.handedness === 'left' ? 'left' : 'right';
      pose[side] = c.userData.grip.getWorldPosition(new THREE.Vector3()).toArray();
    }
  }
  return pose;
}

// ---------------------------------------------------------------- creare qualsiasi cosa, poteri, voce
const _head = new THREE.Vector3();
function headPose() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  cam.updateMatrixWorld();
  const pos = cam.getWorldPosition(new THREE.Vector3());
  const fwd = cam.getWorldDirection(new THREE.Vector3());
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  return { pos, fwd, right: new THREE.Vector3(-fwd.z, 0, fwd.x) };
}

const weather = new Weather(scene, () => (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(_head));

/** Ingombri a terra già occupati (scrivania, cestino, oggetti grandi): rettangoli [minX, minZ, maxX, maxZ]. */
function occupiedFootprints(exclude) {
  const out = [];
  const b = new THREE.Box3();
  const push = (box, pad = 0.15) => out.push([box.min.x - pad, box.min.z - pad, box.max.x + pad, box.max.z + pad]);
  push(b.setFromObject(env.deskTop), 0.35);
  push(b.setFromObject(panel.mesh), 0.1);
  const bc = env.bin.center;
  out.push([bc.x - 0.3, bc.z - 0.3, bc.x + 0.3, bc.z + 0.3]);
  for (const n of workspace.topLevel()) {
    if (exclude.has(n)) continue;
    b.setFromObject(n);
    if (b.max.y - b.min.y > 0.05 && b.min.y < 0.6) push(b, 0.1); // solo cose appoggiate a terra
  }
  return out;
}

/** Cerca un posto libero davanti a te (poi ai lati, poi più lontano) per un oggetto di raggio r. */
function freeSpot(pos, fwd, r, startDist, occupied) {
  const hits = (x, z) => occupied.some(([x0, z0, x1, z1]) => x + r > x0 && x - r < x1 && z + r > z0 && z - r < z1);
  for (const extra of [0, 0.8, 1.8, 3.5, 6]) {
    for (const deg of [0, 30, -30, 55, -55, 80, -80, 110, -110, 145, -145, 180]) {
      const a = (deg * Math.PI) / 180;
      const dir = new THREE.Vector3(fwd.x * Math.cos(a) - fwd.z * Math.sin(a), 0, fwd.x * Math.sin(a) + fwd.z * Math.cos(a));
      const p = pos.clone().addScaledVector(dir, startDist + extra);
      if (!hits(p.x, p.z)) return p;
    }
  }
  return pos.clone().addScaledVector(fwd, startDist + 8);
}

// ---------------------------------------------------------------- comparsa morbida degli oggetti
// prima si prepara la grafica (senza bloccare il visore), poi l'oggetto "cresce" in 0,3 secondi
const appearing = new Map();
function appear(node) {
  const target = node.scale.clone();
  node.scale.multiplyScalar(0.001);
  node.userData.appearing = true;
  const go = () => appearing.set(node, { t: 0, target });
  renderer.compileAsync(node, camera, scene).then(go, go);
}
function updateAppear(dt) {
  for (const [node, a] of appearing) {
    a.t = Math.min(1, a.t + dt / 0.3);
    const k = 1 + 2.2 * Math.pow(a.t - 1, 3) + 1.2 * Math.pow(a.t - 1, 2); // leggero rimbalzo finale
    node.scale.copy(a.target).multiplyScalar(Math.max(0.001, k));
    if (a.t >= 1) { node.scale.copy(a.target); delete node.userData.appearing; appearing.delete(node); workspace.markDirty(); }
  }
}
ctx.appear = appear;

// ---------------------------------------------------------------- comandi vocali su oggetti precisi
ctx.heldNode = () => {
  for (const c of xrInput.controllers) if (c.userData.grabbed) return c.userData.grabbed;
  return [...workspace.grabbing.keys()][0] || null;
};
ctx.releaseHeld = (node) => {
  for (const c of xrInput.controllers) {
    if (c.userData.grabbed !== node) continue;
    c.userData.press = null; // niente gesti di tocco al rilascio
    xrInput.release(c);
  }
};
ctx.bringToMe = (node) => {
  const { pos, fwd } = headPose();
  const target = pos.clone().addScaledVector(fwd, 0.45);
  target.y = pos.y - 0.25;
  const box = new THREE.Box3().setFromObject(node);
  const center = box.getCenter(new THREE.Vector3());
  const world = node.getWorldPosition(new THREE.Vector3()).add(target.sub(center));
  node.position.copy(node.parent.worldToLocal(world));
  workspace.markDirty();
};
ctx.moveNodes = (nodes, dir, meters) => {
  const { fwd, right } = headPose();
  const d = { right, left: right.clone().negate(), forward: fwd, back: fwd.clone().negate(), up: new THREE.Vector3(0, 1, 0), down: new THREE.Vector3(0, -1, 0) }[dir];
  for (const n of nodes) {
    const w = n.getWorldPosition(new THREE.Vector3()).addScaledVector(d, meters);
    n.position.copy(n.parent.worldToLocal(w));
  }
  workspace.markDirty();
};
ctx.setSizeMm = (axis, mm) => setSizeMm(axis, mm);
ctx.scanThenExplode = () => { scanner.explodeAfter = true; ctx.scan(); };

/** Crea un oggetto del catalogo (o della libreria): sulla scrivania, davanti a te o dal cielo. */
function spawnItem(item, { count = 1, size = 'auto', where = null, color = null } = {}) {
  count = Math.max(1, Math.min(30, count));
  const made = [];
  const box = new THREE.Box3();
  const dims = new THREE.Vector3();
  const { pos, fwd, right } = headPose();
  let usedMode = size;
  for (let i = 0; i < count; i++) {
    const node = item.build();
    node.updateWorldMatrix(true, true);
    box.setFromObject(node).getSize(dims);
    const maxDim = Math.max(dims.x, dims.y, dims.z) || 0.1;
    let mode = size;
    if (item.fromLibrary) mode = size === 'giant' ? 'giant' : size === 'real' ? 'real' : 'desk';
    // automatico: vero se ci sta sulla scrivania (o se lo vuoi accanto a te), altrimenti in miniatura
    const fitsDesk = dims.x <= 1.0 && dims.z <= 0.62 && dims.y <= 0.75;
    if (mode === 'auto') mode = where === 'front' || where === 'above' ? (maxDim <= 0.6 ? 'desk' : 'real') : fitsDesk ? 'desk' : 'mini';
    usedMode = mode;
    let scale = 1;
    let place = where;
    if (mode === 'mini') { scale = 0.28 / maxDim; place = place || 'desk'; }
    else if (mode === 'desk') { place = place || 'desk'; }
    else if (mode === 'real') { place = place || (fitsDesk ? 'desk' : 'front'); }
    else if (mode === 'giant') { scale = Math.max(4, 2.5 / maxDim); place = place || 'front'; }
    node.scale.multiplyScalar(scale);
    if (color != null) node.traverse((o) => { if (o.userData.isPart) { [].concat(o.material)[0].color.setHex(color); o.userData.color = color; } });
    if (place === 'desk') {
      workspace.placeOnDesk(node);
    } else {
      // davanti a te (sul pavimento) o dal cielo, girato verso di te
      const size3 = dims.clone().multiplyScalar(scale);
      let target;
      if (place === 'above') {
        target = pos.clone().addScaledVector(fwd, 0.5 + Math.random() * 0.8).addScaledVector(right, (Math.random() - 0.5) * 1.6);
      } else {
        const r = Math.max(size3.x, size3.z) / 2;
        target = freeSpot(new THREE.Vector3(pos.x, 0, pos.z), fwd, r, Math.max(1.0, r + 0.6), occupiedFootprints(new Set([node])));
      }
      workspace.root.add(node);
      node.position.copy(workspace.root.worldToLocal(target.clone()));
      node.rotation.y = Math.atan2(pos.x - target.x, pos.z - target.z);
      node.updateWorldMatrix(true, true);
      box.setFromObject(node);
      const floorY = place === 'above' ? pos.y + 1.2 + i * 0.35 : 0.002;
      node.position.y += floorY - box.min.y;
      workspace.markDirty();
    }
    appear(node);
    made.push(node);
  }
  workspace.selected = new Set(made);
  workspace.highlightDirty = true;
  workspace.markDirty();
  const name = item.label.toLowerCase();
  const how = { mini: ' in miniatura', giant: ' gigante', real: ' a grandezza reale', desk: '' }[usedMode] || '';
  return count > 1 ? `Ecco ${count} × ${name}${how}.` : `Ecco: ${name}${how}.`;
}
ctx.spawn = spawnItem;

/** Pioggia di oggetti: cadono dal cielo intorno a te (con la gravità). */
ctx.rainObjects = (item, n = 8) => {
  if (!physics.enabled) actions.run('gravity', { speak: false });
  spawnItem(item, { count: n, size: 'auto', where: 'above' });
  return `Pioggia di ${item.label.toLowerCase()} dal cielo!`;
};

let playerScale = 1;
function setPlayerScale(s) {
  playerScale = s;
  rig.scale.setScalar(s);
  xrInput.playerScale = s;
}
ctx.power = (id) => {
  switch (id) {
    case 'w:rain': weather.set('rain'); return 'Pioggia su tutto il mondo.';
    case 'w:rain-local': weather.set('rain', { local: true }); return 'Ecco una nuvola tutta per te: piove sopra di te.';
    case 'w:storm': weather.set('storm'); return 'Temporale!';
    case 'w:storm-local': weather.set('storm', { local: true }); return 'Un temporale solo sopra di te.';
    case 'w:bolt': weather.strike(); return 'Fulmine!';
    case 'w:snow': weather.set('snow'); return 'Nevica.';
    case 'w:snow-local': weather.set('snow', { local: true }); return 'Nevica solo su di te.';
    case 'w:fog': weather.set('fog'); return 'Arriva la nebbia.';
    case 'w:rainbow': weather.set('rainbow'); return 'Ecco un arcobaleno.';
    case 'w:clear': weather.set('clear'); return 'Tempo sereno.';
    case 'p:giant': setPlayerScale(6); return 'Ora sei un gigante: la scrivania è un giocattolo.';
    case 'p:tiny': setPlayerScale(0.1); return 'Ora sei minuscolo come una formica.';
    case 'p:normal': setPlayerScale(1); return 'Sei tornato alla tua misura.';
    case 'p:fly': case 'p:fly-on': case 'p:fly-off': {
      const on = id === 'p:fly' ? !xrInput.flying : id === 'p:fly-on';
      xrInput.flying = on;
      if (!on) rig.position.y = 0;
      panel.setLabel('p:fly', on ? 'Volo: SÌ' : 'Volo: NO');
      panel.setActive('p:fly', on);
      return on ? 'Puoi volare: stick destro su e giù per salire e scendere.' : 'Atterrato.';
    }
    default: return null;
  }
};

// comandi vocali con Whisper nel visore
ctx.isMixedReality = () => mixedReality;
const neural = new NeuralVoice();
ai.neural = neural;
neural.onState = (st, p) => {
  const el = document.getElementById('voice-status');
  if (!el) return;
  if (st === 'loading') el.textContent = `Scarico la voce dell'assistente: ${Math.round((p || 0) * 100)}%`;
  if (st === 'error') el.textContent = 'Voce dell\'assistente non disponibile: userò i sottotitoli.';
};
const voiceIn = new VoiceInput({
  onText: (text) => { actions.announce(`Ho sentito: “${text}”`); ai.setSubtitle(`Ho sentito: “${text}”`); command(text); },
  onState: (st, info) => {
    ai.listening = st === 'listening' || st === 'thinking';
    if (st === 'listening') { ai.stopSpeaking?.(); ai.setSubtitle('🎤 Ti ascolto…'); }
    if (st === 'thinking') ai.setSubtitle('Sto capendo…');
    if (st === 'nothing') ai.setSubtitle(info === 'silent' ? 'Il microfono non manda audio. Controlla i permessi del browser.' : 'Non ho sentito niente: tieni premuto A e parla più vicino.');
    if (st === 'error') ai.say('Ho perso il microfono. Tocca «Attiva voce» nella pagina iniziale.');
    const el = document.getElementById('voice-status');
    if (el && st !== 'loading') el.textContent = { ready: 'Comandi vocali pronti ✓', continuous: 'In ascolto continuo ✓', listening: 'Ti ascolto…', thinking: 'Sto capendo…', off: '' }[st] ?? el.textContent;
  },
  isBusy: () => ai.speaking,
});
ctx.voiceIn = voiceIn;
async function initVoice() {
  const el = document.getElementById('voice-status');
  try {
    await voiceIn.init((p) => {
      const pct = Math.round(p * 100);
      if (el) el.textContent = `Scarico il riconoscimento vocale: ${pct}%`;
      actions.announce(`Scarico il riconoscimento vocale: ${pct}% (solo la prima volta)`);
    });
    return true;
  } catch (e) {
    console.error(e);
    if (el) el.textContent = 'Microfono non disponibile';
    ai.say('Non riesco a usare il microfono. Attiva i comandi vocali dalla pagina iniziale.');
    return false;
  }
}
ctx.voiceTalk = () => {
  if (!voiceIn.ready) { initVoice().then((ok) => ok && ai.say('Comandi vocali pronti: premi di nuovo e parla.')); return 'Preparo il riconoscimento vocale…'; }
  voiceIn.start();
  return null;
};
ctx.voiceContinuous = (on) => {
  const apply = () => {
    voiceIn.setContinuous(on);
    panel.setLabel('listenAlways', on ? 'Ascolto: SÌ' : 'Ascolto: NO');
    panel.setActive('listenAlways', on);
  };
  if (!voiceIn.ready) { initVoice().then((ok) => ok && apply()); return 'Attivo il microfono…'; }
  apply();
  return on ? 'Ti ascolto sempre: parla quando vuoi.' : 'Ascolto continuo spento.';
};
xrInput.onTalk = (down) => { if (down) ctx.voiceTalk(); else voiceIn.stop(); };
async function enableVoice() {
  neural.unlock(); // sblocca l'audio con il tocco e scarica la voce in parallelo
  const ok = await initVoice();
  await neural.load();
  const el = document.getElementById('voice-status');
  if (ok && el) el.textContent = neural.state === 'ready' ? 'Voce e microfono pronti ✓ In VR tieni premuto A (o X) e parla.' : 'Microfono pronto ✓ (voce dell\'assistente non disponibile)';
  if (ok) ai.say('Eccomi. Ti sento.');
  return ok;
}
document.getElementById('voice-btn')?.addEventListener('click', () => enableVoice());
const voiceChoice = document.getElementById('voice-choice');
if (voiceChoice) {
  voiceChoice.value = neural.voice;
  voiceChoice.addEventListener('change', async () => {
    neural.unlock();
    await neural.setVoice(voiceChoice.value);
    ai.say('Ciao, questa è la mia nuova voce.');
  });
}
// entrando in VR il tocco sblocca l'audio; se il microfono era già permesso, si prepara tutto da solo
async function prepareVoiceOnEnter() {
  neural.unlock();
  let granted = false;
  try { granted = (await navigator.permissions?.query({ name: 'microphone' }))?.state === 'granted'; } catch { /* non supportato */ }
  if (granted && !voiceIn.ready) initVoice();
  try {
    if ((await navigator.permissions?.query({ name: 'camera' }))?.state === 'granted' && !camera3.ready) camera3.start().catch(() => {});
  } catch { /* non supportato */ }
}
document.getElementById('voice-quality')?.addEventListener('change', (e) => { voiceIn.setQuality(e.target.value); initVoice(); });

// ---------------------------------------------------------------- pulsanti VR / realtà mista e impostazioni
const vrBtn = document.getElementById('enter-vr');
const mrBtn = document.getElementById('enter-mr');
async function updateXRButtons() {
  const vr = await navigator.xr?.isSessionSupported('immersive-vr').catch(() => false);
  const ar = await navigator.xr?.isSessionSupported('immersive-ar').catch(() => false);
  vrBtn.disabled = !vr;
  vrBtn.textContent = vr ? 'ENTRA IN VR' : 'VR NON DISPONIBILE';
  mrBtn.hidden = !ar;
}
updateXRButtons();
vrBtn.addEventListener('click', () => prepareVoiceOnEnter() && startSession('immersive-vr').catch((e) => alert('Non riesco a entrare in VR: ' + e.message)));
mrBtn.addEventListener('click', () => prepareVoiceOnEnter() && startSession('immersive-ar').catch((e) => alert('Realtà mista non disponibile: ' + e.message)));

// AI con Claude e scansione (vedi src/features.js)
document.getElementById('ai-settings').hidden = !FEATURES.claudeAI;
const keyInput = document.getElementById('ai-key');
const keyStatus = document.getElementById('ai-status');
const showKey = () => { keyStatus.textContent = brain.enabled ? 'AI collegata ✓' : 'AI di base (senza chiave)'; };
showKey();
document.getElementById('ai-form').addEventListener('submit', (e) => {
  e.preventDefault();
  brain.setKey(keyInput.value.trim());
  keyInput.value = '';
  showKey();
});
document.getElementById('ai-forget').addEventListener('click', () => { brain.setKey(''); showKey(); });
document.getElementById('cam-btn').addEventListener('click', async (e) => {
  try {
    await camera3.start();
    e.target.textContent = 'Fotocamera pronta ✓';
  } catch (err) {
    e.target.textContent = 'Fotocamera non disponibile';
  }
});

renderer.xr.addEventListener('sessionstart', () => {
  controls.enabled = false;
  xrInput.home();
  const session = renderer.xr.getSession();
  applyMixedLook(session?.environmentBlendMode && session.environmentBlendMode !== 'opaque');
  setTimeout(async () => {
    if (!mixedReality) { ai.say('Ciao, sono qui sulla scrivania. Tieni premuto A e chiedimi quello che vuoi.'); return; }
    // in realtà mista controllo subito se la scansione può funzionare e dico cosa manca
    const r = await scanner.readiness();
    ai.say(r.ok ? 'Vedo la tua stanza. Prendi un oggetto in mano e dimmi «scansiona».' : r.msg, { full: true });
  }, 900);
});
renderer.xr.addEventListener('sessionend', () => {
  controls.enabled = true;
  xrInput.home();
  applyMixedLook(false);
});

document.getElementById('chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text) command(text);
  input.value = '';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
let statusTimer = 0;
let saveTimer = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  xrInput.update(dt);
  scanner.update(dt);
  workspace.update(dt);
  const viewCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  hologram.root.getWorldPosition(_hv);
  ai.base.set(_hv.x, _hv.y + hologram.headY + 0.2, _hv.z);
  ai.update(dt, t, viewCam);
  hologram.update(dt, { level: ai.level, state: ai.listening ? 'listening' : ai.speaking ? 'speaking' : 'idle', camera: viewCam });

  statusTimer -= dt;
  if (statusTimer <= 0) { panel.setStatus(actions.status()); statusTimer = 0.2; }
  panel.update(dt);

  physics.update(dt);
  weather.update(dt);
  checkBin();
  actions.tickHistory(dt);
  themes.update(dt);
  updateAppear(dt);
  avatars.tick(dt);
  net?.tick(dt, myPose(), workspace.grabbing.size > 0);

  saveTimer -= dt;
  // nelle stanze condivise lo stato vive nel database: niente autosalvataggio locale
  if (saveTimer <= 0 && workspace.dirty && !net?.room) {
    saveTimer = 3;
    workspace.dirty = false;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(workspace.serialize())); } catch { /* quota */ }
  }

  if (!renderer.xr.isPresenting) controls.update();
  renderer.render(scene, camera);
});

setTimeout(() => themes.prewarm(renderer, camera), 1500);
window.officina = { renderer, scanner, deskGrab, neural, weather, voiceIn, spawnItem, hologram, brain, headsetCamera: camera3, buildFromSpec, command, applyMixedLook, setDeskVisible, scene, camera, controls, rig, workspace, actions, ai, env, xrInput, themes, avatars, physics, panel };
