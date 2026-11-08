import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const STORE = 'officina-gravity';
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();
const _b = new THREE.Box3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/**
 * Gravità per gli oggetti: cadono, si appoggiano su scrivania e pavimento, si urtano
 * e si possono lanciare. Ogni oggetto sulla scrivania è un corpo rigido con la sua
 * scatola d'ingombro; mentre lo tieni in mano (o è aperto in vista esplosa) segue te.
 */
export class Physics {
  constructor(workspace, env) {
    this.ws = workspace;
    this.env = env;
    this.enabled = false;
    this.bodies = new Map(); // nodo -> { body, key, last: Vector3 }
    let saved = null;
    try { saved = localStorage.getItem(STORE); } catch { /* niente */ }
    if (saved === '1') this.setEnabled(true);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(STORE, on ? '1' : '0'); } catch { /* niente */ }
    if (!on) {
      this.world = null;
      this.bodies.clear();
      return;
    }
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    w.allowSleep = true;
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.defaultContactMaterial.friction = 0.5;
    w.defaultContactMaterial.restitution = 0.15;
    this.world = w;
    this.bodies.clear();
    this.buildStatic();
  }

  /** Pavimento, piano della scrivania, tappetino e cestino. */
  buildStatic() {
    const w = this.world;
    this.statics?.forEach((b) => w.removeBody(b));
    this.statics = [];
    const add = (shape, pos, quat) => {
      const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
      b.addShape(shape);
      b.position.set(pos.x, pos.y, pos.z);
      if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      w.addBody(b);
      this.statics.push(b);
    };
    const floor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(floor);
    this.statics.push(floor);
    for (const mesh of [this.env.deskTop, this.env.mat]) {
      if (!mesh.visible) continue; // scrivania nascosta (realtà mista)
      mesh.updateWorldMatrix(true, false);
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const gb = mesh.geometry.boundingBox;
      mesh.matrixWorld.decompose(_v, _q, _s);
      const size = gb.getSize(new THREE.Vector3()).multiply(_s);
      const center = gb.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      add(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)), center, _q.clone());
    }
    // pareti del cestino (otto lastre attorno al bordo)
    const { center, radius, height } = this.env.bin;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      add(new CANNON.Box(new CANNON.Vec3(0.005, height / 2, radius * 0.42)),
        new THREE.Vector3(center.x + Math.cos(a) * radius, height / 2, center.z + Math.sin(a) * radius), q);
    }
    this.deskY = this.deskKey();
  }

  deskKey() {
    const r = this.env.deskRig;
    return `${r.position.x.toFixed(4)},${r.position.y.toFixed(4)},${r.position.z.toFixed(4)},${r.rotation.y.toFixed(4)}`;
  }

  /** Scatola d'ingombro dell'oggetto nel suo sistema locale (già scalata). */
  shapeFor(node) {
    node.updateWorldMatrix(true, true);
    _m.copy(node.matrixWorld).invert();
    _box.makeEmpty();
    node.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _b.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m, o.matrixWorld));
      _box.union(_b);
    });
    node.matrixWorld.decompose(_v, _q, _s);
    const size = _box.getSize(new THREE.Vector3()).multiply(_s);
    const center = _box.getCenter(new THREE.Vector3()).multiply(_s);
    const half = new CANNON.Vec3(Math.max(size.x / 2, 0.003), Math.max(size.y / 2, 0.003), Math.max(size.z / 2, 0.003));
    const k = node.userData.kind;
    const shape = k === 'sphere' && node.userData.isPart
      ? new CANNON.Sphere(node.userData.params.r * _s.x)
      : new CANNON.Box(half);
    const volume = size.x * size.y * size.z;
    return { shape, offset: new CANNON.Vec3(center.x, center.y, center.z), mass: Math.min(5, Math.max(0.02, volume * 700)) };
  }

  keyOf(node) {
    let n = 0;
    node.traverse(() => n++);
    return `${node.scale.x.toFixed(3)},${node.scale.y.toFixed(3)},${node.scale.z.toFixed(3)},${n},${node.userData.exploded ? 1 : 0}`;
  }

  /** Il nodo deve seguire chi lo muove (mano, animazione, vista esplosa)? */
  isDriven(node) {
    if (node.userData.grabbed || node.userData.appearing || this.ws.anims.has(node) || this.ws.remoteTargets.has(node)) return true;
    let open = false;
    node.traverse((o) => { if (o.userData.exploded || this.ws.anims.has(o)) open = true; });
    return open;
  }

  update(dt) {
    if (!this.enabled || !this.world) return;
    if (this.deskKey() !== this.deskY) this.buildStatic();

    const nodes = new Set(this.ws.topLevel());
    for (const [n, parent] of this.ws.grabbing) if (parent === this.ws.root && !n.userData.deleted) nodes.add(n);

    // corpi da togliere
    for (const [n, e] of this.bodies) {
      if (!nodes.has(n) || n.userData.deleted) { this.world.removeBody(e.body); this.bodies.delete(n); }
    }
    // corpi da creare o aggiornare
    for (const n of nodes) {
      const key = this.keyOf(n);
      let e = this.bodies.get(n);
      if (e && e.key !== key && !n.userData.grabbed) { this.world.removeBody(e.body); e = null; }
      if (!e) {
        const { shape, offset, mass } = this.shapeFor(n);
        const body = new CANNON.Body({ mass });
        body.addShape(shape, offset);
        body.sleepSpeedLimit = 0.05;
        body.sleepTimeLimit = 0.6;
        body.linearDamping = 0.05;
        body.angularDamping = 0.2;
        n.getWorldPosition(_v); n.getWorldQuaternion(_q);
        body.position.set(_v.x, _v.y, _v.z);
        body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
        body.addEventListener('sleep', () => this.ws.markDirty());
        this.world.addBody(body);
        e = { body, key, mass, last: _v.clone() };
        this.bodies.set(n, e);
      }
      const b = e.body;
      n.getWorldPosition(_v);
      if (this.isDriven(n)) {
        // segue la mano: la sua velocità serve per urtare gli altri e per il lancio
        if (b.type !== CANNON.Body.KINEMATIC) { b.type = CANNON.Body.KINEMATIC; b.mass = 0; b.updateMassProperties(); }
        n.getWorldQuaternion(_q);
        if (dt > 0) b.velocity.set((_v.x - e.last.x) / dt, (_v.y - e.last.y) / dt, (_v.z - e.last.z) / dt);
        b.position.set(_v.x, _v.y, _v.z);
        b.quaternion.set(_q.x, _q.y, _q.z, _q.w);
        b.wakeUp();
        e.driven = true;
      } else if (e.driven || b.type !== CANNON.Body.DYNAMIC) {
        // appena lasciato: torna libero e conserva la velocità (lancio)
        const vel = b.velocity.clone();
        b.type = CANNON.Body.DYNAMIC;
        b.mass = e.mass;
        b.updateMassProperties();
        b.velocity.copy(vel);
        b.wakeUp();
        e.driven = false;
      }
      e.last.copy(_v);
    }

    this.world.step(1 / 72, dt, 3);

    // gli oggetti liberi seguono il loro corpo
    for (const [n, e] of this.bodies) {
      if (e.driven || e.body.sleepState === CANNON.Body.SLEEPING) continue;
      const p = e.body.position, q = e.body.quaternion;
      const parent = n.parent;
      if (!parent) continue;
      _v.set(p.x, p.y, p.z);
      n.position.copy(parent.worldToLocal(_v));
      parent.getWorldQuaternion(_q).invert();
      n.quaternion.copy(_q.multiply(new THREE.Quaternion(q.x, q.y, q.z, q.w)));
      e.last.set(p.x, p.y, p.z);
    }
  }
}
