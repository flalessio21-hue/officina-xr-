import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createEnvironment } from './environment.js';
import { AIOrb } from './ai.js';
import { Workspace } from './workspace.js';
import { Panel } from './panel.js';
import { createActions, PANEL_TABS } from './actions.js';
import { XRInput } from './xr-input.js';
import { MouseInput } from './mouse-input.js';
import { ThemeManager } from './themes.js';
import { Physics } from './physics.js';
import { Brain } from './brain.js';
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

const themes = new ThemeManager(scene, env);
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
  extra: { buildFromSpec, setSizeMm, setDeskVisible, enterMixedReality: () => ctx.mixedReality() || 'Fatto.', isMixedReality: () => mixedReality },
});

/** Ogni comando (voce, testo, pannello «Parla con AI») passa da qui. */
function command(text) {
  if (brain.enabled) brain.handle(text);
  else actions.voice(text);
}
ai.onHeard = command;

ctx.scan = async () => {
  if (!brain.enabled) {
    ai.say('Per la scansione serve l\'intelligenza artificiale: inserisci la chiave nella pagina iniziale.');
    return;
  }
  try {
    if (!camera3.ready) await camera3.start();
  } catch {
    ai.say('Non vedo dalla fotocamera. Nella pagina iniziale tocca «Abilita fotocamera», poi riprova.');
    return;
  }
  ai.say('Tieni l\'oggetto davanti agli occhi e giralo piano.');
  await new Promise((r) => setTimeout(r, 2500));
  const shots = await camera3.burst(4, 900, (i, n) => actions.announce(`Scansione: foto ${i} di ${n}…`));
  ai.say('Fatto. Lo sto ricostruendo.');
  await brain.scan(shots);
};

const xrInput = new XRInput(renderer, scene, rig, camera, { panel, workspace, actions, env });
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
vrBtn.addEventListener('click', () => startSession('immersive-vr').catch((e) => alert('Non riesco a entrare in VR: ' + e.message)));
mrBtn.addEventListener('click', () => startSession('immersive-ar').catch((e) => alert('Realtà mista non disponibile: ' + e.message)));

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
  setTimeout(() => ai.say(mixedReality
    ? 'Ora vedi la tua stanza. La scrivania e gli oggetti sono qui con te.'
    : 'Ciao. Sono qui, in fondo. Usa le mani o i controller, e chiedimi quello che vuoi.'), 700);
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
  workspace.update(dt);
  ai.update(dt, t, renderer.xr.isPresenting ? renderer.xr.getCamera() : camera);

  statusTimer -= dt;
  if (statusTimer <= 0) { panel.setStatus(actions.status()); statusTimer = 0.2; }
  panel.update(dt);

  physics.update(dt);
  checkBin();
  actions.tickHistory(dt);
  themes.update(dt);
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

window.officina = { brain, headsetCamera: camera3, buildFromSpec, command, applyMixedLook, setDeskVisible, scene, camera, controls, rig, workspace, actions, ai, env, xrInput, themes, avatars, physics, panel };
