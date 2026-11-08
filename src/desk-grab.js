import * as THREE from 'three';
import { DESK } from './environment.js';

const KEY = 'officina-desk-pose';
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Scrivania da afferrare: due maniglie luminose sul bordo davanti.
 * Una mano (pizzico o grip) sposta e alza/abbassa; due mani ruotano anche.
 * La posizione resta salvata per la volta dopo.
 */
export class DeskGrab {
  constructor(env) {
    this.env = env;
    this.rig = env.deskRig;
    this.handles = [];
    this.holds = new Map(); // controller -> { start punto, pose iniziale }
    const mat = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.15, depthWrite: false, fog: false, toneMapped: false });
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.16, 4, 12).rotateZ(Math.PI / 2), mat.clone());
      h.position.set(sx * (DESK.w / 2 - 0.2), DESK.h - DESK.t / 2, DESK.d / 2 + 0.006);
      h.name = 'maniglia-scrivania';
      this.rig.add(h);
      this.handles.push(h);
    }
    this.load();
  }

  pose() {
    return { x: this.rig.position.x, y: this.rig.position.y, z: this.rig.position.z, rot: this.rig.rotation.y };
  }

  apply(p) {
    const y = THREE.MathUtils.clamp(p.y, -0.3, 0.45);
    this.rig.position.x = p.x;
    this.rig.position.z = p.z;
    this.rig.rotation.y = p.rot;
    this.env.setDeskHeight(y); // allunga le gambe
  }

  load() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && [p.x, p.y, p.z, p.rot].every(Number.isFinite)) this.apply(p);
    } catch { /* niente */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.pose())); } catch { /* niente */ }
  }

  reset() {
    this.apply({ x: 0, y: 0, z: -0.62, rot: 0 });
    this.save();
  }

  /** Distanza del punto dalla maniglia più vicina (in metri). */
  nearest(point) {
    let best = null, bd = Infinity;
    for (const h of this.handles) {
      h.getWorldPosition(_a);
      const d = _a.distanceTo(point);
      if (d < bd) { bd = d; best = h; }
    }
    return { handle: best, dist: bd };
  }

  /** Prova ad afferrare: true se il punto è su una maniglia. */
  tryGrab(c, point, reach = 0.07) {
    if (!point || !this.rig.visible) return false;
    const { dist } = this.nearest(point);
    if (dist > reach) return false;
    this.holds.set(c, { start: point.clone() });
    this.restart(); // ogni volta che cambia il numero di mani si riparte dalla posa attuale
    return true;
  }

  holding(c) { return this.holds.has(c); }

  release(c) {
    if (!this.holds.delete(c)) return;
    this.restart();
    if (!this.holds.size) this.save();
  }

  restart() {
    this.p0 = this.pose();
    this.points0 = new Map();
    for (const [c, h] of this.holds) this.points0.set(c, h.last ? h.last.clone() : h.start.clone());
  }

  /** points: Map controller -> punto attuale della presa. */
  update(points, dt) {
    // maniglie: si accendono quando una mano si avvicina
    for (const h of this.handles) {
      h.getWorldPosition(_a);
      let near = 1;
      for (const p of points.values()) if (p) near = Math.min(near, p.distanceTo(_a));
      const target = this.holds.size ? 0.95 : near < 0.25 ? 0.25 + (0.25 - near) * 2.8 : 0.12;
      h.material.opacity += (target - h.material.opacity) * Math.min(1, dt * 10);
    }
    if (!this.holds.size) return;
    const cur = [];
    const start = [];
    for (const [c, h] of this.holds) {
      const p = points.get(c);
      if (!p) continue;
      h.last = p.clone();
      cur.push(p);
      start.push(this.points0.get(c));
    }
    if (!cur.length) return;
    const p0 = this.p0;
    const next = { ...p0 };
    if (cur.length === 1) {
      next.x = p0.x + cur[0].x - start[0].x;
      next.z = p0.z + cur[0].z - start[0].z;
      next.y = p0.y + cur[0].y - start[0].y;
    } else {
      // due mani: il centro segue il punto medio, la rotazione segue la linea tra le mani
      _a.copy(start[0]).add(start[1]).multiplyScalar(0.5);
      _b.copy(cur[0]).add(cur[1]).multiplyScalar(0.5);
      const a0 = Math.atan2(start[1].z - start[0].z, start[1].x - start[0].x);
      const a1 = Math.atan2(cur[1].z - cur[0].z, cur[1].x - cur[0].x);
      const dRot = -(a1 - a0);
      // ruota la scrivania attorno al punto medio iniziale delle mani
      const ox = p0.x - _a.x, oz = p0.z - _a.z;
      const cs = Math.cos(dRot), sn = Math.sin(dRot);
      next.x = _b.x + ox * cs + oz * sn;
      next.z = _b.z - ox * sn + oz * cs;
      next.rot = p0.rot + dRot;
      next.y = p0.y + _b.y - _a.y;
    }
    this.apply(next);
  }
}
