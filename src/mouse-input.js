import * as THREE from 'three';

/** Modalità desktop (per provare senza visore): clic, trascina, Shift per selezione multipla. */
export class MouseInput {
  constructor(renderer, camera, controls, { panel, workspace, actions }) {
    Object.assign(this, { renderer, camera, controls, panel, workspace, actions });
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.drag = null;
    this.down = null;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    el.addEventListener('dblclick', (e) => this.onDouble(e));
  }

  setRay(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  pick() {
    return this.raycaster.intersectObjects([this.panel.mesh, ...this.workspace.pickables()], false)[0] || null;
  }

  onDown(e) {
    if (this.renderer.xr.isPresenting || e.button !== 0) return;
    this.setRay(e);
    this.down = { x: e.clientX, y: e.clientY };
    const hit = this.pick();
    if (!hit) return;
    this.controls.enabled = false;
    if (hit.object === this.panel.mesh) {
      const id = this.panel.hitTest(hit.uv);
      if (id) this.actions.run(id);
      return;
    }
    const node = this.workspace.resolvePick(hit.object);
    if (!node) return;
    this.workspace.select(node, e.shiftKey || this.actions.multi);
    this.workspace.beginGrab(node);
    // di default scivola sul piano orizzontale; con Alt si muove in verticale (piano verso la camera)
    const normal = e.altKey
      ? this.camera.getWorldDirection(new THREE.Vector3()).negate()
      : new THREE.Vector3(0, 1, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);
    const offset = node.getWorldPosition(new THREE.Vector3()).sub(hit.point);
    this.drag = { node, plane, offset, moved: false, mesh: hit.object, x: e.clientX, y: e.clientY };
    // clic tenuto fermo su un componente: lo estrae dall'assieme
    clearTimeout(this.longTimer);
    this.longTimer = setTimeout(() => this.longPress(), 550);
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }

  onMove(e) {
    if (this.renderer.xr.isPresenting) return;
    this.setRay(e);
    if (this.drag) {
      const p = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.drag.plane, p)) {
        const { node } = this.drag;
        node.position.copy(node.parent.worldToLocal(p.add(this.drag.offset)));
        if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 6) {
          this.drag.moved = true;
          clearTimeout(this.longTimer);
        }
      }
      return;
    }
    const hit = this.pick();
    const panelId = hit?.object === this.panel.mesh ? this.panel.hitTest(hit.uv) : null;
    this.panel.setHover('mouse', panelId);
    this.workspace.setHover(hit && hit.object !== this.panel.mesh ? this.workspace.resolvePick(hit.object) : null);
    this.renderer.domElement.style.cursor = panelId || (hit && hit.object !== this.panel.mesh) ? 'pointer' : 'default';
  }

  longPress() {
    const d = this.drag;
    if (!d || d.moved || !d.node.userData.isAssembly) return;
    let comp = d.mesh;
    while (comp && comp.parent !== d.node) comp = comp.parent;
    if (!comp) return;
    // punto preso col mouse = posizione dell'oggetto meno lo scarto iniziale
    const hitPoint = d.node.getWorldPosition(new THREE.Vector3()).sub(d.offset);
    this.workspace.endGrab(d.node);
    if (!this.workspace.extract(comp)) return;
    this.workspace.beginGrab(comp);
    d.offset = comp.getWorldPosition(new THREE.Vector3()).sub(hitPoint);
    d.node = comp;
    d.moved = true;
    this.actions.announce?.(`${comp.name} estratto: trascinalo dove vuoi.`);
  }

  onDouble(e) {
    if (this.renderer.xr.isPresenting) return;
    this.setRay(e);
    const hit = this.pick();
    if (!hit || hit.object === this.panel.mesh) return;
    const node = this.workspace.resolvePick(hit.object);
    if (!node) return;
    const ws = this.workspace;
    if (node.userData.isAssembly) {
      if (node.userData.exploded) ws.collapse(node); else ws.explode(node);
    } else if (node.parent?.userData.exploded) {
      ws.collapse(node.parent);
    }
    ws.markDirty();
  }

  onUp(e) {
    clearTimeout(this.longTimer);
    if (this.drag) {
      this.workspace.endGrab(this.drag.node);
      this.drag = null;
    } else if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 4 && e.button === 0) {
      this.setRay(e);
      if (!this.pick()) this.workspace.clearSelection();
    }
    this.down = null;
    this.controls.enabled = true;
  }

  onKey(e) {
    if (e.target instanceof HTMLInputElement) return;
    const map = { Delete: 'delete', Backspace: 'delete', e: 'explode', E: 'explodeAll', r: 'collapse', g: 'group', u: 'ungroup', d: 'duplicate', c: 'color', Escape: 'deselect', '+': 's+', '-': 's-' };
    const id = map[e.key];
    if (id) { e.preventDefault(); this.actions.run(id); }
  }
}
