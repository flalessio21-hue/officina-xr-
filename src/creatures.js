import * as THREE from 'three';

/**
 * Creature che si muovono da sole: un mostro-ragno con zampe vere (due segmenti, ginocchio piegato,
 * piedi che si appoggiano e fanno il passo a gruppi alterni) e, a richiesta, qualsiasi oggetto
 * della scrivania che "cammina" (persone, animali, robot…).
 */
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function bone(len, r, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, len, 10), mat);
  m.castShadow = true;
  return m;
}
function placeBone(m, from, to) {
  _a.subVectors(to, from);
  const len = _a.length();
  m.position.copy(from).addScaledVector(_a, 0.5);
  m.quaternion.setFromUnitVectors(UP, _a.normalize());
  m.scale.y = len / m.geometry.parameters.height;
}

class Spider {
  constructor(scene, { size = 1, color = 0x3d4a3e, name = 'mostro' } = {}) {
    this.name = name;
    this.k = size;
    this.root = new THREE.Group();
    this.root.name = name;
    scene.add(this.root);
    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.3 });
    const k = this.k;
    this.body = new THREE.Group();
    this.root.add(this.body);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.28 * k, 24, 16), skin);
    torso.scale.set(1, 0.7, 1.25);
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17 * k, 20, 14), skin);
    head.position.set(0, 0.04 * k, 0.33 * k);
    // bocca con denti (come nel video) e occhi
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.09 * k, 16, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.35), dark);
    mouth.position.set(0, -0.02 * k, 0.46 * k);
    mouth.rotation.x = Math.PI / 2;
    this.body.add(torso, head, mouth);
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.012 * k, 0.05 * k, 6), white);
      tooth.position.set((i - 2.5) * 0.026 * k, -0.005 * k, 0.48 * k);
      tooth.rotation.x = Math.PI;
      this.body.add(tooth);
    }
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035 * k, 12, 8), white);
      eye.position.set(sx * 0.07 * k, 0.12 * k, 0.44 * k);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.018 * k, 10, 6), dark);
      pupil.position.set(0, 0, 0.025 * k);
      eye.add(pupil);
      this.body.add(eye);
    }
    // zampe: anca sul corpo, ginocchio in alto e in fuori, piede a terra
    this.legs = [];
    const L1 = 0.75 * k, L2 = 0.95 * k;
    const angles = [40, 90, 140];
    angles.forEach((deg, i) => {
      for (const side of [-1, 1]) {
        const a = (deg * Math.PI) / 180;
        const hip = new THREE.Vector3(side * 0.2 * k, 0, Math.cos(a) * 0.22 * k);
        const reach = new THREE.Vector3(side * Math.sin(a) * 1.0 * k, 0, Math.cos(a) * 0.75 * k);
        const leg = {
          hip, reach, L1, L2, upper: bone(L1, 0.035 * k, skin), lower: bone(L2, 0.028 * k, skin),
          foot: null, from: null, to: null, t: 1, group: (i + (side > 0 ? 1 : 0)) % 2,
        };
        scene.add(leg.upper, leg.lower);
        this.legs.push(leg);
      }
    });
    this.height = 0.85 * k;
    this.speed = 0.55;
    this.heading = 0;
    this.target = null;
    this.time = Math.random() * 10;
  }

  place(pos) {
    this.root.position.set(pos.x, this.height, pos.z);
    this.root.updateMatrixWorld(true);
    for (const l of this.legs) { l.foot = this.home(l); l.t = 1; }
  }

  home(l) {
    const p = l.reach.clone().applyAxisAngle(UP, this.heading).add(this.root.position);
    p.y = this.ground ?? 0;
    return p;
  }

  update(dt, { bounds, avoid }) {
    this.time += dt;
    const pos = this.root.position;
    // nuova meta: un punto a caso nella stanza, lontano da te
    if (!this.target || _a.set(this.target.x - pos.x, 0, this.target.z - pos.z).length() < 0.4 || Math.random() < dt * 0.05) {
      for (let i = 0; i < 20; i++) {
        const t = new THREE.Vector3(bounds.x0 + Math.random() * (bounds.x1 - bounds.x0), 0, bounds.z0 + Math.random() * (bounds.z1 - bounds.z0));
        const okUser = !avoid || t.distanceTo(_b.set(avoid.x, 0, avoid.z)) > 1.6;
        const okDesk = !this.deskPos || t.distanceTo(_b.set(this.deskPos.x, 0, this.deskPos.z)) > 1.4;
        if (okUser && okDesk) { this.target = t; break; }
      }
    }
    // gira verso la meta e cammina (si ferma se sei troppo vicino davanti)
    const want = Math.atan2(this.target.x - pos.x, this.target.z - pos.z);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += Math.max(-1, Math.min(1, d)) * dt * 1.6;
    const close = avoid && _c.set(avoid.x - pos.x, 0, avoid.z - pos.z).length() < 1.2;
    const v = close ? 0 : this.speed * (Math.abs(d) > 1 ? 0.3 : 1);
    pos.x += Math.sin(this.heading) * v * dt;
    pos.z += Math.cos(this.heading) * v * dt;
    pos.y = (this.ground ?? 0) + this.height + Math.sin(this.time * 7) * 0.02 * this.k;
    this.root.rotation.y = this.heading;
    this.body.rotation.z = Math.sin(this.time * 3.5) * 0.04;
    this.root.updateMatrixWorld(true);
    // passi: un gruppo di zampe alla volta, quando il piede è rimasto troppo indietro
    const stepping = this.legs.some((l) => l.t < 1);
    for (const l of this.legs) {
      const home = this.home(l);
      if (l.t >= 1 && !stepping && l.group === this.nextGroup && l.foot.distanceTo(home) > 0.35 * this.k) {
        for (const m of this.legs) if (m.group === l.group) { m.from = m.foot.clone(); m.to = this.home(m).addScaledVector(_a.set(Math.sin(this.heading), 0, Math.cos(this.heading)), 0.18 * this.k); m.t = 0; }
        this.nextGroup = 1 - l.group;
        break;
      }
    }
    if (this.nextGroup == null) this.nextGroup = 0;
    if (!stepping && this.legs.every((l) => l.foot.distanceTo(this.home(l)) <= 0.35 * this.k)) this.nextGroup = 1 - this.nextGroup;
    for (const l of this.legs) {
      if (l.t < 1) {
        l.t = Math.min(1, l.t + dt / 0.22);
        l.foot.lerpVectors(l.from, l.to, l.t);
        l.foot.y = (this.ground ?? 0) + Math.sin(l.t * Math.PI) * 0.18 * this.k;
      }
      // cinematica inversa a due segmenti: ginocchio in alto e in fuori
      const hipW = l.hip.clone().applyMatrix4(this.root.matrixWorld);
      const dir = _a.subVectors(l.foot, hipW);
      const dist = Math.min(dir.length(), l.L1 + l.L2 - 1e-3);
      dir.normalize();
      const along = (l.L1 * l.L1 - l.L2 * l.L2 + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, l.L1 * l.L1 - along * along));
      const out = hipW.clone().sub(pos); out.y = 0; out.normalize();
      const bend = _b.copy(UP).multiplyScalar(1).addScaledVector(out, 0.6);
      bend.addScaledVector(dir, -bend.dot(dir)).normalize();
      const knee = hipW.clone().addScaledVector(dir, along).addScaledVector(bend, h);
      placeBone(l.upper, hipW, knee);
      placeBone(l.lower, knee, l.foot);
    }
  }

  dispose(scene) {
    scene.remove(this.root);
    for (const l of this.legs) scene.remove(l.upper, l.lower);
  }
}

export class Creatures {
  constructor(scene, { bounds, head, ground, desk }) {
    Object.assign(this, { scene, bounds, head, ground, desk });
    this.list = [];
    this.walkers = new Set();
  }

  spawn(kind = 'mostro', { size = 1, near } = {}) {
    const c = new Spider(this.scene, { size, name: kind, color: kind === 'ragno' ? 0x2a2420 : 0x3d4a3e });
    const b = this.bounds();
    const h = this.head();
    // compare davanti a te, a qualche metro
    const start = near || new THREE.Vector3(h.x + (Math.random() - 0.5) * 2, 0, Math.max(b.z0 + 0.5, h.z - 2.5));
    c.ground = this.ground?.(start) ?? 0;
    c.place(start);
    this.list.push(c);
    return c;
  }

  removeAll() {
    for (const c of this.list) c.dispose(this.scene);
    this.list = [];
    for (const n of this.walkers) delete n.userData.walking;
    this.walkers.clear();
  }

  /** Un oggetto della scrivania inizia (o smette) di camminare. */
  walk(node, on = true) {
    if (on) { node.userData.walking = { target: null, t: Math.random() * 10, base: node.position.y }; this.walkers.add(node); }
    else { delete node.userData.walking; this.walkers.delete(node); }
  }

  update(dt) {
    const bounds = this.bounds();
    const avoid = this.head();
    const desk = this.desk?.();
    for (const c of this.list) { c.ground = this.ground?.(c.root.position) ?? 0; c.deskPos = desk; c.update(dt, { bounds, avoid }); }
    for (const n of this.walkers) {
      const w = n.userData.walking;
      if (!w || !n.parent) { this.walkers.delete(n); continue; }
      w.t += dt;
      // cammina sul suo piano (scrivania o pavimento) in un'area di ~1 m attorno a dove era
      w.home ||= n.position.clone();
      if (!w.target || n.position.distanceTo(w.target) < 0.05) {
        const r = n.position.y > 0.3 ? 0.35 : 1.5;
        w.target = w.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * r * 2, 0, (Math.random() - 0.5) * r * 2));
        w.target.y = w.base;
      }
      const dir = _a.subVectors(w.target, n.position); dir.y = 0;
      const len = dir.length();
      if (len > 1e-4) {
        const sp = (n.position.y > 0.3 ? 0.08 : 0.4) * dt;
        n.position.addScaledVector(dir.normalize(), Math.min(sp, len));
        const want = Math.atan2(dir.x, dir.z);
        let d = want - n.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        n.rotation.y += d * Math.min(1, dt * 4);
      }
      n.position.y = w.base + Math.abs(Math.sin(w.t * 8)) * 0.012; // passo: piccoli saltelli
      // zampe e gambe (pezzi con nome "Zampa"/"Gamba"): oscillano
      let i = 0;
      n.traverse((p) => { if (/zampa|gamba|piede/i.test(p.name)) { p.userData.r0 ??= p.rotation.x; p.rotation.x = p.userData.r0 + Math.sin(w.t * 8 + (i++ % 2) * Math.PI) * 0.35; } });
    }
  }
}
