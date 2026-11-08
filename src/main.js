import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
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
import { Avatars } from './net/avatars.js';
import { firebaseConfig } from './net/config.js';

const AUTOSAVE_KEY = 'officina-xr-autosave';

const renderer = new THREE.WebGLRenderer({ antialias: true });
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
const actions = createActions({ workspace, ai, panel, env, themes, physics, get net() { return net; } });
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
ai.onHeard = (text) => actions.voice(text);

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

document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));

renderer.xr.addEventListener('sessionstart', () => {
  controls.enabled = false;
  xrInput.home();
  document.getElementById('intro')?.remove();
  setTimeout(() => ai.say('Ciao. Sono qui, in fondo. Puoi usare le mani o i controller, e camminare dove vuoi. La scrivania è tua.'), 700);
});
renderer.xr.addEventListener('sessionend', () => {
  controls.enabled = true;
  xrInput.home();
});

document.getElementById('chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text) actions.voice(text);
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

window.officina = { scene, camera, controls, rig, workspace, actions, ai, env, xrInput, themes, avatars, physics, panel };
