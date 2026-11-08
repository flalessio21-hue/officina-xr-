import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Input del Quest 3 — controller E mani.
 *
 * Mani (hand tracking):
 *   - pizzica vicino a un pezzo        → lo afferri direttamente
 *   - punta e pizzica da lontano       → afferri col raggio / premi pulsanti
 *   - tocca il pannello con l'indice   → premi il pulsante
 *   - due mani sullo stesso pezzo      → lo scali allargando/stringendo le mani
 * Controller:
 *   - grilletto                         → raggio: afferra / pulsanti
 *   - grip vicino a un pezzo            → presa diretta; grip col raggio su un pezzo → aggiungi alla selezione
 *   - stick sinistro                    → cammina;  stick destro → rotazione a scatti
 *   - stick mentre tieni un pezzo       → su/giù scala, sinistra/destra ruota
 */
export class XRInput {
  constructor(renderer, scene, rig, camera, { panel, workspace, actions, env }) {
    Object.assign(this, { renderer, scene, rig, camera, panel, workspace, actions, env });
    this.raycaster = new THREE.Raycaster();
    this.tmp = new THREE.Matrix4();
    this.controllers = [];
    this.twoHand = null;
    // tempi dei gesti (ms): tocco breve, doppio pizzico, pizzico lungo per estrarre
    this.flying = false;
    this.playerScale = 1;
    this.onTalk = null; // tasto A/X tenuto premuto = parla
    this.talkDown = false;
    this.tapMs = 450;
    this.doubleMs = 700;
    this.longMs = 900;
    this.snapReady = { left: true, right: true };

    const cmf = new XRControllerModelFactory();
    const hmf = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      const anchor = new THREE.Object3D();
      scene.add(anchor);
      c.userData = {
        index: i, source: null, grip, hand, anchor,
        grabbed: null, grabParent: null, grabButton: null,
        poking: false, pokeArmed: true,
      };
      c.addEventListener('connected', (e) => {
        c.userData.source = e.data;
        const isHand = !!e.data.hand;
        c.userData.line.material.opacity = isHand ? 0.3 : 0.55;
      });
      c.addEventListener('disconnected', () => {
        this.release(c);
        this.desk?.release(c);
        c.userData.deskButton = null;
        c.userData.source = null;
        c.userData.dot.visible = false;
      });
      c.addEventListener('selectstart', () => this.onSelectStart(c));
      c.addEventListener('selectend', () => this.onButtonEnd(c, 'select'));
      c.addEventListener('squeezestart', () => this.onSqueezeStart(c));
      c.addEventListener('squeezeend', () => this.onButtonEnd(c, 'squeeze'));

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.55, fog: false })
      );
      line.scale.z = 1.5;
      c.add(line);
      c.userData.line = line;

      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      dot.visible = false;
      scene.add(dot);
      c.userData.dot = dot;

      grip.add(cmf.createControllerModel(grip));
      hand.add(hmf.createHandModel(hand, 'mesh'));
      rig.add(c, grip, hand);
      this.controllers.push(c);
    }

    // segnaposto del teletrasporto
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.235, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.85, fog: false })
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.12, fog: false, depthWrite: false })
    );
    this.marker.add(ring, disc);
    this.marker.position.y = 0.004;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  // ---------- utilità ----------
  isHand(c) { return !!c.userData.source?.hand; }

  joint(c, name, out) {
    const j = c.userData.hand.joints?.[name];
    if (!j || !j.visible) return null;
    return j.getWorldPosition(out);
  }

  pinchPoint(c, out) {
    const t = this.joint(c, 'thumb-tip', _v1);
    const i = t && this.joint(c, 'index-finger-tip', _v2);
    if (!t || !i) return null;
    return out.copy(t).add(i).multiplyScalar(0.5);
  }

  /** Punto di presa: pizzico per le mani, impugnatura per i controller. */
  holdPoint(c, out) {
    if (this.isHand(c)) return this.pinchPoint(c, out);
    return c.userData.grip.getWorldPosition(out);
  }

  nearestNode(point, maxDist) {
    // prima i pezzi già tenuti dall'altra mano (per la presa a due mani)
    for (const o of this.controllers) {
      const held = o.userData.grabbed;
      if (held && _box.setFromObject(held).distanceToPoint(point) < maxDist) { this.nearMesh = null; return held; }
    }
    let best = null, bd = maxDist;
    for (const m of this.workspace.pickables()) {
      const d = _box.setFromObject(m).distanceToPoint(point);
      if (d < bd) { bd = d; best = m; }
    }
    this.nearMesh = best; // il pezzo esatto toccato (serve per estrarre un componente)
    return best ? this.workspace.resolvePick(best) : null;
  }

  intersect(c) {
    c.updateMatrixWorld(true);
    this.tmp.identity().extractRotation(c.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tmp);
    const parts = c.userData.grabbed ? [] : this.workspace.pickables();
    const targets = [this.panel.mesh, ...parts, ...this.env.blockers, this.env.floor];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    hit.kind = hit.object === this.panel.mesh ? 'panel'
      : hit.object === this.env.floor ? 'floor'
      : hit.object.userData.isPart ? 'part' : 'block';
    return hit;
  }

  haptic(c, strength = 0.3, ms = 25) {
    try { c.userData.source?.gamepad?.hapticActuators?.[0]?.pulse(strength, ms); } catch { /* opzionale */ }
  }

  // ---------- presa ----------
  updateAnchor(c) {
    const a = c.userData.anchor;
    if (!this.pinchPoint(c, a.position)) return false;
    const wrist = c.userData.hand.joints?.wrist;
    if (wrist) wrist.getWorldQuaternion(a.quaternion);
    a.updateMatrixWorld(true);
    return true;
  }

  grab(c, node, holder, button, mesh = null) {
    if (this.tryTwoHand(c, node, button)) return;
    // per i gesti: tocco breve, doppio pizzico, pizzico lungo
    c.userData.press = { t: performance.now(), node, mesh, start: this.holdPoint(c, new THREE.Vector3()) || c.getWorldPosition(new THREE.Vector3()), done: false };
    c.userData.holder = holder;
    this.workspace.select(node, this.actions.multi);
    this.workspace.beginGrab(node, node.parent);
    holder.updateMatrixWorld(true);
    c.userData.grabParent = node.parent;
    holder.attach(node);
    c.userData.grabbed = node;
    c.userData.grabButton = button;
    this.haptic(c);
  }

  tryTwoHand(c, node, button) {
    const other = this.controllers.find((o) => o !== c && o.userData.grabbed === node);
    if (!other) return false;
    const pa = this.holdPoint(other, new THREE.Vector3());
    const pb = this.holdPoint(c, new THREE.Vector3());
    if (!pa || !pb) return false;
    const explode = this.actions.twoHand === 'explode' && node.userData.isAssembly;
    this.twoHand = {
      a: other, b: c, node, button, d0: Math.max(0.05, pa.distanceTo(pb)), s0: node.scale.clone(),
      mode: explode ? 'explode' : 'scale', f0: node.userData.exploded ? 1 : 0,
    };
    if (other.userData.press) other.userData.press.done = true; // niente pizzico lungo durante il gesto
    this.haptic(c, 0.4, 30);
    this.haptic(other, 0.4, 30);
    return true;
  }

  endTwoHand() {
    const th = this.twoHand;
    this.twoHand = null;
    if (th?.mode === 'explode') this.workspace.endExplodeGesture(th.node);
  }

  release(c) {
    if (this.twoHand && (this.twoHand.a === c || this.twoHand.b === c)) this.endTwoHand();
    const node = c.userData.grabbed;
    if (!node) return;
    this.checkTap(c, node);
    c.userData.grabbed = null;
    c.userData.grabButton = null;
    if (node.userData.deleted) return;
    let parent = c.userData.grabParent;
    if (!parent || !this.workspace.contains(parent)) parent = this.workspace.root;
    parent.attach(node);
    this.workspace.endGrab(node);
  }

  // ---------- eventi ----------
  onSelectStart(c) {
    // scrivania reale: il pizzico o il grilletto confermano il punto del tavolo nel mirino
    if (this.tableSnap?.placing && this.tableSnap.hit) { this.tableSnap.confirm(); this.haptic(c, 0.5, 40); return; }
    if (this.isHand(c)) {
      if (c.userData.poking) return; // il dito sta usando il pannello
      if (this.pinchPoint(c, _v1)) {
        const node = this.nearestNode(_v1.clone(), 0.03);
        if (node) {
          this.updateAnchor(c);
          this.grab(c, node, c.userData.anchor, 'select', this.nearMesh);
          return;
        }
        if (this.desk?.tryGrab(c, _v1.clone(), 0.06)) { c.userData.deskButton = 'select'; this.haptic(c, 0.4, 30); return; }
      }
    } else if (this.desk?.tryGrab(c, c.userData.grip.getWorldPosition(new THREE.Vector3()), 0.09)) {
      c.userData.deskButton = 'select'; this.haptic(c, 0.4, 30); return;
    }
    const hit = this.intersect(c);
    if (!hit) return;
    if (hit.kind === 'panel') {
      const id = this.panel.hitTest(hit.uv);
      if (id) { this.actions.run(id); this.haptic(c, 0.5, 30); }
    } else if (hit.kind === 'part') {
      const node = this.workspace.resolvePick(hit.object);
      if (node) this.grab(c, node, c, 'select', hit.object);
    }
    // niente teletrasporto: puntando il pavimento per prendere un oggetto si finiva lontano
  }

  onSqueezeStart(c) {
    if (this.isHand(c)) return;
    const node = this.nearestNode(c.userData.grip.getWorldPosition(new THREE.Vector3()), 0.06);
    if (node) { this.grab(c, node, c.userData.grip, 'squeeze', this.nearMesh); return; }
    if (this.desk?.tryGrab(c, c.userData.grip.getWorldPosition(new THREE.Vector3()), 0.09)) { c.userData.deskButton = 'squeeze'; this.haptic(c, 0.4, 30); return; }
    const hit = this.intersect(c);
    if (hit?.kind === 'part') {
      const n = this.workspace.resolvePick(hit.object);
      if (n) { this.workspace.toggle(n); this.haptic(c, 0.2, 15); }
    } else if (!hit || hit.kind === 'floor' || hit.kind === 'block') {
      this.workspace.clearSelection();
    }
  }

  onButtonEnd(c, button) {
    if (c.userData.deskButton === button) { c.userData.deskButton = null; this.desk?.release(c); return; }
    if (this.twoHand?.b === c && this.twoHand.button === button) { this.endTwoHand(); return; }
    if (c.userData.grabButton === button) this.release(c);
  }

  // ---------- gesti per smontare ----------

  /** Tocco breve e fermo: due di fila sullo stesso oggetto lo aprono o lo richiudono. */
  checkTap(c, node) {
    const p = c.userData.press;
    c.userData.press = null;
    if (!p || p.done) return;
    const now = performance.now();
    const pos = this.holdPoint(c, new THREE.Vector3()) || c.getWorldPosition(new THREE.Vector3());
    if (now - p.t > this.tapMs || pos.distanceTo(p.start) > 0.03) return;
    const last = c.userData.lastTap;
    if (last && now - last.t < this.doubleMs && last.node === node) {
      c.userData.lastTap = null;
      // finito il rilascio, apri/chiudi
      setTimeout(() => this.toggleOpen(node), 0);
      this.haptic(c, 0.6, 40);
    } else {
      c.userData.lastTap = { t: now, node };
    }
  }

  toggleOpen(node) {
    const ws = this.workspace;
    if (node.userData.isAssembly) {
      if (node.userData.exploded) ws.collapse(node); else ws.explode(node);
      this.actions.announce?.(node.userData.exploded ? `${node.name} aperto.` : `${node.name} richiuso.`);
    } else if (node.parent?.userData.exploded) {
      ws.collapse(node.parent);
      this.actions.announce?.(`${node.parent.name} richiuso.`);
    }
    ws.markDirty();
  }

  /** Pizzico tenuto fermo: il componente toccato si stacca dall'assieme e resta in mano. */
  checkLongPress(c) {
    const p = c.userData.press;
    if (!p || p.done || !c.userData.grabbed || this.twoHand) return;
    const pos = this.holdPoint(c, new THREE.Vector3()) || c.getWorldPosition(new THREE.Vector3());
    if (pos.distanceTo(p.start) > 0.02) { p.done = true; return; } // si sta spostando: è una presa normale
    const node = c.userData.grabbed;
    if (!node.userData.isAssembly || !p.mesh) { p.done = true; return; }
    const held = performance.now() - p.t;
    // vibrazioni crescenti: "sta per staccarsi" (lascia prima se non vuoi estrarre)
    const step = Math.floor((held / this.longMs) * 4);
    if (held > this.longMs * 0.35 && step !== p.step) { p.step = step; this.haptic(c, 0.1 + step * 0.12, 15); }
    if (held < this.longMs) return;
    p.done = true;
    // il componente = il figlio diretto dell'assieme sul percorso verso il pezzo toccato
    let comp = p.mesh;
    while (comp && comp.parent !== node) comp = comp.parent;
    if (!comp || comp === node) return;
    const holder = c.userData.holder;
    const button = c.userData.grabButton || 'select';
    this.release(c);
    c.userData.lastTap = null;
    if (!this.workspace.extract(comp)) return;
    if (holder === c.userData.anchor) this.updateAnchor(c);
    this.workspace.beginGrab(comp, this.workspace.root);
    holder.updateMatrixWorld(true);
    c.userData.grabParent = this.workspace.root;
    holder.attach(comp);
    c.userData.grabbed = comp;
    c.userData.grabButton = button;
    c.userData.press = { t: performance.now(), node: comp, mesh: p.mesh, start: pos, done: true };
    this.haptic(c, 1, 60);
    this.actions.announce?.(`${comp.name} estratto da ${node.name}.`);
  }

  // ---------- movimento ----------
  teleport(point) {
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    this.rig.position.x += point.x - head.x;
    this.rig.position.z += point.z - head.z;
  }

  turn(angle) {
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    this.rig.position.sub(head).applyAxisAngle(UP, angle).add(head);
    this.rig.rotation.y += angle;
  }

  /** Posto attorno alla scrivania (nelle stanze condivise ognuno ha il suo). */
  setSeat(seat) {
    this.seat = seat;
  }

  home() {
    const s = this.seat || { x: 0, z: 0, rot: 0 };
    this.rig.position.set(s.x, 0, s.z);
    this.rig.rotation.set(0, s.rot, 0);
  }

  move(ax, ay, dt) {
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) return;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    const speed = 1.6 * (this.playerScale || 1);
    this.rig.position.addScaledVector(fwd, -ay * speed * dt).addScaledVector(right, ax * speed * dt);
  }

  // ---------- tocco col dito sul pannello ----------
  updatePoke(c) {
    c.userData.poking = false;
    if (!this.isHand(c)) return null;
    const tip = this.joint(c, 'index-finger-tip', new THREE.Vector3());
    if (!tip) return null;
    const local = this.panel.mesh.worldToLocal(tip);
    const { width, height } = this.panel.mesh.geometry.parameters;
    const inside = Math.abs(local.x) < width / 2 && Math.abs(local.y) < height / 2;
    if (!inside || local.z > 0.06 || local.z < -0.05) { c.userData.pokeArmed = true; return null; }
    c.userData.poking = true;
    const id = this.panel.hitTest({ x: local.x / width + 0.5, y: local.y / height + 0.5 });
    if (local.z < 0.006 && c.userData.pokeArmed) {
      c.userData.pokeArmed = false;
      if (id) { this.actions.run(id); this.haptic(c, 0.5, 30); }
    } else if (local.z > 0.018) {
      c.userData.pokeArmed = true;
    }
    return id;
  }

  update(dt) {
    if (!this.renderer.xr.isPresenting) return;
    let hoverNode = null;
    let markerAt = null;
    const deskPoints = new Map();

    for (const c of this.controllers) {
      const { line, dot, source } = c.userData;
      const key = 'xr' + c.userData.index;
      if (!source) { this.panel.setHover(key, null); continue; }
      const isHand = this.isHand(c);

      if (isHand && c.userData.grabbed && c.userData.grabButton === 'select' && c.userData.anchor === c.userData.grabbed.parent) {
        this.updateAnchor(c);
      }

      const pokeId = this.updatePoke(c);
      let panelId = pokeId;

      // presa diretta: evidenzia cosa stai per prendere
      let nearNode = null;
      if (!c.userData.grabbed) {
        const p = this.holdPoint(c, new THREE.Vector3());
        if (p) nearNode = this.nearestNode(p, isHand ? 0.03 : 0.06);
      }

      const hp = this.holdPoint(c, new THREE.Vector3());
      deskPoints.set(c, hp);
      const nearDesk = this.desk && hp && (this.desk.holding(c) || this.desk.nearest(hp).dist < 0.1);
      const hideRay = c.userData.poking || nearNode || nearDesk || (c.userData.grabbed && c.userData.grabbed.parent !== c);
      const hit = hideRay ? null : this.intersect(c);
      line.visible = !hideRay;
      if (hit) {
        line.scale.z = hit.distance;
        dot.visible = hit.kind !== 'floor';
        dot.position.copy(hit.point);
        if (hit.kind === 'panel' && !pokeId) panelId = this.panel.hitTest(hit.uv);
        else if (hit.kind === 'part' && !c.userData.grabbed) hoverNode = this.workspace.resolvePick(hit.object);

      } else {
        line.scale.z = 1.5;
        dot.visible = false;
      }
      if (nearNode) hoverNode = nearNode;
      this.panel.setHover(key, panelId);

      // tasto A (destro) o X (sinistro) tenuto premuto: parla con l'AI
      const btn = source.gamepad?.buttons?.[4];
      if (!isHand && btn) {
        if (btn.pressed && !c.userData.talk) { c.userData.talk = true; this.onTalk?.(true); }
        else if (!btn.pressed && c.userData.talk) { c.userData.talk = false; this.onTalk?.(false); }
      }

      // levette dei controller
      const axes = source.gamepad?.axes;
      if (!isHand && axes && axes.length >= 4) {
        const ax = axes[2], ay = axes[3];
        const node = c.userData.grabbed;
        if (node) {
          if (Math.abs(ay) > 0.15) {
            const s = Math.exp(-ay * dt * 1.2);
            const next = node.scale.x * s;
            if (next > 0.05 && next < 20) node.scale.multiplyScalar(s);
          }
          if (Math.abs(ax) > 0.15) node.rotateY(-ax * dt * 2.2);
        } else if (source.handedness === 'left') {
          if (Math.hypot(ax, ay) > 0.15) this.move(ax, ay, dt);
        } else {
          // in volo: stick destro su/giù per salire e scendere
          if (this.flying && Math.abs(ay) > 0.2) this.rig.position.y = Math.max(0, this.rig.position.y - ay * dt * 2 * (this.playerScale || 1));
          const ready = this.snapReady[source.handedness] ?? true;
          if (Math.abs(ax) > 0.7 && ready) {
            this.turn(-Math.sign(ax) * Math.PI / 6);
            this.snapReady[source.handedness] = false;
          } else if (Math.abs(ax) < 0.3) {
            this.snapReady[source.handedness] = true;
          }
        }
      }
    }

    this.desk?.update(deskPoints, dt);

    // scala a due mani
    for (const c of this.controllers) this.checkLongPress(c);

    const th = this.twoHand;
    if (th) {
      if (th.a.userData.grabbed !== th.node) this.twoHand = null;
      else {
        const pa = this.holdPoint(th.a, new THREE.Vector3());
        const pb = this.holdPoint(th.b, new THREE.Vector3());
        if (pa && pb && th.mode === 'explode') {
          // allargando le mani l'oggetto si apre (vista esplosa continua)
          const f = THREE.MathUtils.clamp(th.f0 + (pa.distanceTo(pb) - th.d0) / 0.25, 0, 1.8);
          this.workspace.setExplodeFactor(th.node, f);
        } else if (pa && pb) {
          const f = THREE.MathUtils.clamp(pa.distanceTo(pb) / th.d0, 0.05, 20);
          th.node.scale.copy(th.s0).multiplyScalar(f);
        }
      }
    }

    this.marker.visible = !!markerAt;
    if (markerAt) this.marker.position.set(markerAt.x, 0.004, markerAt.z);
    this.workspace.setHover(hoverNode);
  }
}
