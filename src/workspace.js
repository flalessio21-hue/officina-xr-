import * as THREE from 'three';
import {
  createPart, createAssembly, isNode, serializeNode, deserializeNode,
  DEFAULTS, PALETTE, buildScrewAndNut, buildDrone,
} from './parts.js';

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const FALLBACK_DIRS = [
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0),
];

export class Workspace {
  constructor(root) {
    this.root = root;
    this.selected = new Set();
    this.hover = null;
    this.anims = new Map(); // nodo -> posizione locale di destinazione
    this.highlightDirty = true;
    this.dirty = false;
    this.spawnIndex = 0;
    this.asmCounter = 1;
    this.grabbing = new Map(); // nodo -> genitore da cui è stato preso
    this.remoteTargets = new Map(); // nodo -> trasformazione arrivata da un altro utente
  }

  // ---------- interrogazioni ----------
  topLevel() { return this.root.children.filter(isNode); }

  pickables() {
    const out = [];
    this.root.traverse((o) => { if (o.userData.isPart) out.push(o); });
    return out;
  }

  contains(obj) {
    for (let a = obj; a; a = a.parent) if (a === this.root) return true;
    return false;
  }

  /** Dalla mesh colpita risale al nodo selezionabile: un assieme esploso lascia selezionare i suoi figli. */
  resolvePick(mesh) {
    const chain = [];
    for (let a = mesh; a && a !== this.root; a = a.parent) chain.unshift(a);
    if (!chain.length || chain[0].parent !== this.root) return null;
    let i = 0;
    while (chain[i].userData.isAssembly && chain[i].userData.exploded && i + 1 < chain.length) i++;
    return chain[i];
  }

  countParts(node) {
    let n = 0;
    node.traverse((o) => { if (o.userData.isPart) n++; });
    return n;
  }

  info() {
    const sel = [...this.selected];
    if (!sel.length) {
      const n = this.topLevel().length;
      return n ? `Nessuna selezione · ${n} oggett${n === 1 ? 'o' : 'i'} sulla scrivania` : 'Scrivania vuota · crea un pezzo dal pannello';
    }
    _box.makeEmpty();
    for (const s of sel) _box.expandByObject(s);
    const size = _box.getSize(_v).multiplyScalar(1000);
    const dims = `${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(0)} mm`;
    if (sel.length > 1) return `${sel.length} elementi selezionati · ${dims}`;
    const s = sel[0];
    const extra = s.userData.isAssembly
      ? ` · assieme di ${this.countParts(s)} parti${s.userData.exploded ? ' (esploso)' : ''}`
      : '';
    return `${s.name} · ${dims}${extra}`;
  }

  // ---------- selezione ----------
  select(node, additive = false) {
    if (!additive) this.selected.clear();
    if (additive && this.selected.has(node)) this.selected.delete(node);
    else if (node) {
      // niente antenati/discendenti contemporaneamente selezionati
      for (const s of [...this.selected]) if (isAncestor(s, node) || isAncestor(node, s)) this.selected.delete(s);
      this.selected.add(node);
    }
    this.highlightDirty = true;
  }

  toggle(node) { this.select(node, true); }

  clearSelection() { this.selected.clear(); this.highlightDirty = true; }

  setHover(node) {
    if (node !== this.hover) { this.hover = node; this.highlightDirty = true; }
  }

  refreshHighlight() {
    this.root.traverse((o) => {
      if (!o.userData.isPart) return;
      let sel = false, hov = false;
      for (let a = o; a && a !== this.root; a = a.parent) {
        if (this.selected.has(a)) sel = true;
        if (a === this.hover) hov = true;
      }
      for (const m of [].concat(o.material)) m.emissive?.setHex(sel ? 0x143f78 : hov ? 0x2c2c2c : 0x000000);
    });
    this.highlightDirty = false;
  }

  // targets per i comandi: selezione, oppure tutto ciò che c'è sulla scrivania
  targets() {
    const sel = [...this.selected].filter((n) => this.contains(n) || n.userData.grabbed);
    return sel.length ? sel : this.topLevel();
  }

  // ---------- creazione ----------
  placeOnDesk(node) {
    node.position.set(0, 0, 0);
    this.root.add(node);
    node.updateWorldMatrix(true, true);
    _box.setFromObject(node);
    const local = this.root.worldToLocal(_box.min.clone());
    const i = this.spawnIndex++ % 7;
    node.position.set(-0.3 + i * 0.1, -local.y + 0.0005, 0.05 - (Math.floor(this.spawnIndex / 7) % 3) * 0.1);
    this.markDirty();
    return node;
  }

  /** Mette sulla scrivania un oggetto della libreria (assieme già montato). */
  loadLibrary(build) {
    const node = build();
    this.placeOnDesk(node);
    this.select(node);
    return node;
  }

  createPrimitive(kind) {
    let node;
    if (kind === 'screw') node = buildScrewAndNut();
    else if (kind === 'pyramid') node = createPart('cone', { r: 0.055, h: 0.09, seg: 4 }, PALETTE[this.spawnIndex % PALETTE.length], 'Piramide');
    else node = createPart(kind, DEFAULTS[kind], PALETTE[this.spawnIndex % PALETTE.length]);
    this.placeOnDesk(node);
    this.select(node);
    return node;
  }

  loadDemo() {
    const d = buildDrone();
    this.root.add(d);
    d.updateWorldMatrix(true, true);
    _box.setFromObject(d);
    const min = this.root.worldToLocal(_box.min.clone());
    d.position.set(0, -min.y + 0.0005, 0);
    this.select(d);
    this.markDirty();
    return d;
  }

  duplicate() {
    const out = [];
    for (const n of [...this.selected]) {
      if (!this.contains(n)) continue;
      const copy = deserializeNode(serializeNode(n));
      n.parent.add(copy);
      _box.setFromObject(n);
      const w = _box.max.x - _box.min.x;
      const world = n.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(w * 1.15 + 0.01, 0, 0));
      copy.position.copy(n.parent.worldToLocal(world));
      copy.quaternion.copy(n.quaternion);
      out.push(copy);
    }
    if (out.length) {
      this.selected = new Set(out);
      this.highlightDirty = true;
      this.markDirty();
    }
    return out.length;
  }

  remove() {
    const sel = [...this.selected];
    for (const n of sel) {
      n.userData.deleted = true;
      this.anims.delete(n);
      n.removeFromParent();
      n.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) { m.map?.dispose(); m.dispose(); } } });
    }
    this.selected.clear();
    this.pruneEmpty();
    this.highlightDirty = true;
    this.markDirty();
    return sel.length;
  }

  clear() {
    this.selected = new Set(this.topLevel());
    this.remove();
    this.spawnIndex = 0;
  }

  pruneEmpty() {
    let again = true;
    while (again) {
      again = false;
      this.root.traverse((o) => {
        if (!again && o !== this.root && o.userData.isAssembly && !o.children.some(isNode)) {
          o.removeFromParent();
          this.selected.delete(o);
          again = true;
        }
      });
    }
  }

  // ---------- assiemi ----------
  group() {
    const nodes = [...this.selected].filter((n) => this.contains(n));
    if (!nodes.length) return null;
    const parent = nodes[0].parent;
    const centroid = new THREE.Vector3();
    for (const n of nodes) centroid.add(_box.setFromObject(n).getCenter(_v));
    centroid.divideScalar(nodes.length);
    const g = createAssembly(`Assieme ${this.asmCounter++}`);
    parent.add(g);
    parent.updateWorldMatrix(true, false);
    g.position.copy(parent.worldToLocal(centroid));
    g.updateWorldMatrix(true, false);
    for (const n of nodes) {
      this.anims.delete(n);
      delete n.userData.homePos;
      delete n.userData.explodeOffset;
      g.attach(n);
    }
    this.pruneEmpty();
    this.select(g);
    this.markDirty();
    return g;
  }

  ungroup() {
    const asms = [...this.selected].filter((n) => n.userData.isAssembly && this.contains(n));
    const freed = [];
    for (const g of asms) {
      this.collapse(g, true);
      const parent = g.parent;
      for (const c of g.children.filter(isNode)) {
        delete c.userData.homePos;
        delete c.userData.explodeOffset;
        parent.attach(c);
        freed.push(c);
      }
      g.removeFromParent();
    }
    if (asms.length) {
      this.selected = new Set(freed);
      this.highlightDirty = true;
      this.markDirty();
    }
    return asms.length;
  }

  // ---------- smontaggio a mano ----------

  /**
   * Stacca un componente dal suo assieme e lo rende un oggetto libero (resta dov'è nel mondo).
   * Si ricorda da dove viene, così «Rimonta estratti» lo rimette al suo posto.
   */
  extract(node) {
    const parent = node.parent;
    if (!parent || parent === this.root || !parent.userData.isAssembly) return false;
    this.anims.delete(node);
    const home = node.userData.homePos ? node.userData.homePos.clone() : node.position.clone();
    node.userData.origin = { parent, pos: home, quat: node.quaternion.clone(), scale: node.scale.clone() };
    delete node.userData.homePos;
    delete node.userData.explodeOffset;
    this.root.attach(node);
    this.select(node);
    this.markDirty();
    return true;
  }

  /** Rimette al loro posto i pezzi estratti (se l'assieme di origine esiste ancora). */
  reassemble() {
    let n = 0;
    for (const node of this.topLevel()) {
      const o = node.userData.origin;
      if (!o || !this.contains(o.parent)) continue;
      o.parent.add(node);
      node.position.copy(o.pos);
      node.quaternion.copy(o.quat);
      node.scale.copy(o.scale);
      if (o.parent.userData.exploded) {
        node.userData.homePos = o.pos.clone();
        node.userData.explodeOffset = new THREE.Vector3();
      }
      delete node.userData.origin;
      n++;
    }
    if (n) { this.highlightDirty = true; this.markDirty(); }
    return n;
  }

  selectAll() {
    this.selected = new Set(this.topLevel());
    this.highlightDirty = true;
    return this.selected.size;
  }

  /**
   * Vista esplosa continua (gesto a due mani): f = 0 chiuso, 1 esploso normale, fino a 1.8.
   */
  setExplodeFactor(g, f) {
    if (!g.userData.isAssembly) return;
    const kids = g.children.filter(isNode);
    if (!g.userData.exploded) {
      for (const k of kids) k.userData.homePos = (this.anims.get(k) || k.position).clone();
      this.computeExplode(g);
      g.userData.exploded = true;
    }
    for (const k of kids) {
      this.anims.delete(k);
      if (!k.userData.homePos) k.userData.homePos = k.position.clone();
      const off = k.userData.explodeOffset || new THREE.Vector3();
      k.position.copy(k.userData.homePos).addScaledVector(off, f);
    }
    g.userData.explodeF = f;
    this.highlightDirty = true;
  }

  /** Fine del gesto: se è quasi chiuso si richiude, altrimenti resta aperto così. */
  endExplodeGesture(g) {
    if ((g.userData.explodeF ?? 1) < 0.15) this.collapse(g);
    else {
      // la posizione raggiunta diventa il nuovo "esploso"
      for (const k of g.children.filter(isNode)) {
        const f = g.userData.explodeF ?? 1;
        if (k.userData.explodeOffset) k.userData.explodeOffset.multiplyScalar(f);
      }
    }
    delete g.userData.explodeF;
    this.markDirty();
  }

  // ---------- vista esplosa ----------
  computeExplode(g) {
    const kids = g.children.filter(isNode);
    if (!kids.length) return;
    g.updateWorldMatrix(true, true);
    const inv = g.matrixWorld.clone().invert();
    const boxes = kids.map((k) => new THREE.Box3().setFromObject(k).applyMatrix4(inv));
    const all = new THREE.Box3();
    boxes.forEach((b) => all.union(b));
    const C = all.getCenter(new THREE.Vector3());
    const R = all.getSize(new THREE.Vector3()).length() / 2;
    let f = 0;
    kids.forEach((k, i) => {
      const c = boxes[i].getCenter(new THREE.Vector3());
      const ri = boxes[i].getSize(new THREE.Vector3()).length() / 2;
      const d = c.sub(C);
      let len = d.length();
      let dir;
      if (len < R * 0.08) { dir = FALLBACK_DIRS[f++ % FALLBACK_DIRS.length].clone(); len = 0; }
      else dir = d.divideScalar(len);
      const dist = R * 0.3 + len * 0.55 + ri * 0.4;
      k.userData.explodeOffset = dir.multiplyScalar(dist);
    });
  }

  explode(g) {
    if (!g.userData.isAssembly || g.userData.exploded) return false;
    const kids = g.children.filter(isNode);
    for (const k of kids) {
      // se il figlio sta ancora tornando a casa, la "casa" è la destinazione dell'animazione
      k.userData.homePos = (this.anims.get(k) || k.position).clone();
      k.position.copy(k.userData.homePos);
    }
    this.computeExplode(g);
    for (const k of kids) {
      this.anims.set(k, k.userData.homePos.clone().add(k.userData.explodeOffset));
    }
    g.userData.exploded = true;
    this.highlightDirty = true;
    return true;
  }

  /** Un livello di dettaglio in più a ogni chiamata. */
  explodeStep(node) {
    if (!node.userData.isAssembly) return false;
    if (!node.userData.exploded) return this.explode(node);
    let any = false;
    for (const k of node.children.filter(isNode)) any = this.explodeStep(k) || any;
    return any;
  }

  explodeAll(node) {
    if (!node.userData.isAssembly) return false;
    let any = this.explode(node);
    for (const k of node.children.filter(isNode)) any = this.explodeAll(k) || any;
    return any;
  }

  collapse(node, immediate = false) {
    if (!node.userData.isAssembly) return false;
    let any = false;
    for (const k of node.children.filter(isNode)) any = this.collapse(k, immediate) || any;
    if (node.userData.exploded) {
      for (const k of node.children.filter(isNode)) {
        const home = k.userData.homePos || k.position;
        if (immediate) { k.position.copy(home); this.anims.delete(k); }
        else this.anims.set(k, home.clone());
      }
      node.userData.exploded = false;
      any = true;
    }
    // le parti dentro un assieme chiuso non sono più selezionabili singolarmente
    for (const s of [...this.selected]) if (s !== node && isAncestor(node, s)) { this.selected.delete(s); this.selected.add(node); }
    this.highlightDirty = true;
    return any;
  }

  // ---------- trasformazioni ----------
  beginGrab(node, parent = node.parent) {
    this.anims.delete(node);
    this.remoteTargets.delete(node);
    node.userData.grabbed = true;
    this.grabbing.set(node, parent);
  }

  endGrab(node) {
    node.userData.grabbed = false;
    this.grabbing.delete(node);
    const p = node.parent;
    if (p?.userData.exploded) {
      const off = node.userData.explodeOffset || new THREE.Vector3();
      node.userData.homePos = node.position.clone().sub(off);
    }
    this.markDirty();
  }

  scaleSelected(axis, factor) {
    const sel = [...this.selected];
    for (const n of sel) {
      if (axis === 'all') n.scale.multiplyScalar(factor);
      else n.scale[axis] *= factor;
    }
    if (sel.length) this.markDirty();
    return sel.length;
  }

  rotateSelected(angle) {
    const sel = [...this.selected];
    for (const n of sel) n.rotateY(angle);
    if (sel.length) this.markDirty();
    return sel.length;
  }

  colorSelected(hex) {
    const sel = [...this.selected];
    if (!sel.length) return false;
    let next = hex;
    if (next == null) {
      let current = null;
      sel[0].traverse((o) => { if (current == null && o.userData.isPart) current = o.userData.color; });
      next = PALETTE[(PALETTE.indexOf(current) + 1) % PALETTE.length];
    }
    for (const n of sel) n.traverse((o) => {
      if (o.userData.isPart) { [].concat(o.material)[0].color.setHex(next); o.userData.color = next; }
    });
    this.markDirty();
    return true;
  }

  // ---------- salvataggio ----------
  markDirty() {
    this.dirty = true;
    this.version = (this.version || 0) + 1;
  }

  serialize() {
    // i pezzi in movimento vengono salvati nella loro posizione di arrivo
    const swapped = [];
    for (const [n, t] of this.anims) { swapped.push([n, n.position.clone()]); n.position.copy(t); }
    const data = { v: 1, nodes: this.topLevel().map(serializeNode) };
    for (const [n, p] of swapped) n.position.copy(p);
    return data;
  }

  load(data) {
    if (!data || !Array.isArray(data.nodes)) return false;
    this.clear();
    for (const d of data.nodes) this.root.add(deserializeNode(d));
    this.spawnIndex = this.root.children.length;
    this.dirty = false;
    return true;
  }

  // ---------- condivisione (stanze con altre persone) ----------

  /** Oggetti da condividere: quelli sulla scrivania e quelli in mano presi dalla scrivania. */
  syncNodes() {
    const nodes = this.topLevel();
    const frozen = new Set();
    for (const [n, parent] of this.grabbing) {
      if (n.userData.deleted) continue;
      if (parent === this.root) {
        if (!nodes.includes(n)) nodes.push(n);
      } else {
        // un pezzo interno è in mano: l'assieme si condivide quando viene rilasciato
        let top = parent;
        while (top && top.parent && top.parent !== this.root) top = top.parent;
        if (top?.userData.netId) frozen.add(top.userData.netId);
      }
    }
    return { nodes: nodes.filter((n) => !frozen.has(n.userData.netId)), frozen };
  }

  /** Stato di un oggetto di primo livello, con la posizione relativa alla scrivania. */
  serializeTop(node) {
    const data = serializeNode(node);
    if (node.parent !== this.root) {
      this.root.updateWorldMatrix(true, false);
      node.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4().copy(this.root.matrixWorld).invert().multiply(node.matrixWorld);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      m.decompose(p, q, sc);
      const r = (a) => a.map((v) => Math.round(v * 1e5) / 1e5);
      data.p = r(p.toArray()); data.q = r(q.toArray()); data.s = r(sc.toArray());
    }
    const tgt = this.remoteTargets.get(node);
    if (tgt) Object.assign(data, tgt);
    return data;
  }

  static structureOf(data) {
    return JSON.stringify({ ...data, p: 0, q: 0, s: 0 });
  }

  byNetId(id) {
    for (const n of this.topLevel()) if (n.userData.netId === id) return n;
    for (const n of this.grabbing.keys()) if (n.userData.netId === id) return n;
    return null;
  }

  /** Applica lo stato arrivato da un altro utente. */
  applyRemote(id, data) {
    let node = this.byNetId(id);
    if (node?.userData.grabbed) return; // lo sto tenendo io: vale la mia versione
    const struct = Workspace.structureOf(data);
    if (node && node.userData.netStruct === struct) {
      this.remoteTargets.set(node, { p: data.p, q: data.q, s: data.s });
      return;
    }
    const wasSelected = node && this.selected.has(node);
    if (node) this.disposeNode(node);
    node = deserializeNode(data);
    node.userData.netId = id;
    node.userData.netStruct = struct;
    this.root.add(node);
    if (wasSelected) this.selected.add(node);
    this.highlightDirty = true;
  }

  removeRemote(id) {
    const node = this.byNetId(id);
    if (node && !node.userData.grabbed) this.disposeNode(node);
  }

  disposeNode(node) {
    this.selected.delete(node);
    this.remoteTargets.delete(node);
    this.anims.delete(node);
    node.userData.deleted = true;
    node.removeFromParent();
    node.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) { m.map?.dispose(); m.dispose(); } } });
    this.highlightDirty = true;
  }

  update(dt) {
    // gli oggetti spostati da altri scivolano verso la nuova posizione
    const kr = 1 - Math.exp(-dt * 12);
    for (const [n, t] of this.remoteTargets) {
      if (!n.parent || n.userData.grabbed) { this.remoteTargets.delete(n); continue; }
      const p = new THREE.Vector3().fromArray(t.p), q = new THREE.Quaternion().fromArray(t.q), sc = new THREE.Vector3().fromArray(t.s);
      n.position.lerp(p, kr); n.quaternion.slerp(q, kr); n.scale.lerp(sc, kr);
      if (n.position.distanceToSquared(p) < 1e-10 && n.scale.distanceToSquared(sc) < 1e-10) {
        n.position.copy(p); n.quaternion.copy(q); n.scale.copy(sc);
        this.remoteTargets.delete(n);
      }
    }
    const k = 1 - Math.exp(-dt * 7);
    for (const [n, t] of this.anims) {
      if (n.userData.grabbed || !n.parent) { this.anims.delete(n); continue; }
      n.position.lerp(t, k);
      if (n.position.distanceToSquared(t) < 1e-10) { n.position.copy(t); this.anims.delete(n); }
    }
    if (this.highlightDirty) this.refreshHighlight();
  }
}

function isAncestor(a, b) {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
}
