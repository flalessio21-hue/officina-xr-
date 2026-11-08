import * as THREE from 'three';
import { DESK } from './environment.js';

/**
 * «Il tavolo vero diventa la scrivania»: in realtà mista, appoggiando le mani aperte e ferme
 * su un piano (un tavolo, una scrivania vera), la scrivania virtuale si sposta lì, all'altezza giusta
 * e girata verso di te, e diventa invisibile: vedi il tuo tavolo, ma gli oggetti ci si appoggiano
 * sopra (e ci finiscono dietro) come su un tavolo reale.
 * Se il visore ha riconosciuto i piani della stanza (plane detection), usa l'altezza esatta del piano.
 */
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const FLAT_JOINTS = ['wrist', 'thumb-tip', ...FINGERS.flatMap((f) => [`${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-tip`])];

export class TableSnap {
  constructor({ xrInput, camera, deskGrab, env, ai, renderer, physics, isMixedReality, setRealTable }) {
    Object.assign(this, { xrInput, camera, deskGrab, env, ai, renderer, physics, isMixedReality, setRealTable });
    this.auto = true;
    this.hold = 0;
    this.cooldown = 0;
    this.hist = new Map();
    this.placing = false;
    this.hitSource = null;
    this.hit = null;
    this.reticle = null;
    this.planes = null;
  }

  /**
   * La mano è appoggiata piatta e ferma? Ritorna { palm, y } oppure null.
   * Tollerante: guardo solo nocche e dita (non polso e pollice, che stanno più in alto o più in basso),
   * il palmo deve guardare in giù e la mano deve restare ferma nell'ultimo mezzo secondo
   * (non tra un fotogramma e l'altro: il tracciamento trema sempre un po').
   */
  flatHand(c) {
    const J = c.userData.hand?.joints;
    if (!J?.wrist?.visible || c.userData.grabbed || this.deskGrab.holding(c)) { this.hist.delete(c); return null; }
    const P = (n) => (J[n]?.visible ? J[n].getWorldPosition(new THREE.Vector3()) : null);
    const pts = [];
    for (const f of FINGERS) for (const n of ['phalanx-proximal', 'phalanx-intermediate', 'tip']) { const p = P(`${f}-${n}`); if (p) pts.push(p); }
    if (pts.length < 8) return null;
    let ymin = Infinity, ymax = -Infinity;
    for (const p of pts) { ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
    if (ymax - ymin > 0.05) return null; // dita distese su un piano
    // palmo verso il basso
    const w = P('wrist'), m = P('middle-finger-phalanx-proximal'), a = P('index-finger-phalanx-proximal'), b = P('pinky-finger-phalanx-proximal');
    if (!w || !m || !a || !b) return null;
    const n = new THREE.Vector3().crossVectors(m.clone().sub(w), b.clone().sub(a)).normalize();
    if (Math.abs(n.y) < 0.75) return null; // il segno dipende dalla mano: basta che sia orizzontale
    if (ymin < 0.35 || ymin > 1.35) return null;
    // ferma nell'ultimo mezzo secondo
    const now = performance.now() / 1000;
    const h = this.hist.get(c) || [];
    h.push({ t: now, p: m.clone() });
    while (h.length && now - h[0].t > 0.6) h.shift();
    this.hist.set(c, h);
    if (now - h[0].t < 0.4) return null;
    let spread = 0;
    for (const e of h) spread = Math.max(spread, e.p.distanceTo(m));
    if (spread > 0.025) return null;
    return { palm: m, y: ymin };
  }

  /** Piano orizzontale riconosciuto dal visore vicino a questa altezza (se c'è). */
  planeHeight(frame, y) {
    const planes = frame?.detectedPlanes;
    if (!planes || !planes.size) return null;
    const ref = this.renderer.xr.getReferenceSpace();
    let best = null, bd = 0.06;
    for (const plane of planes) {
      if (plane.orientation && plane.orientation !== 'horizontal') continue;
      const pose = frame.getPose(plane.planeSpace, ref);
      if (!pose) continue;
      const py = pose.transform.position.y + (this.xrInput.rig?.position.y || 0);
      if (Math.abs(py - y) < bd) { bd = Math.abs(py - y); best = py; }
    }
    return best;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.placing) this.updateReticle();
    if (!this.auto || this.cooldown > 0 || !this.isMixedReality() || !this.renderer.xr.isPresenting) { this.hold = 0; return; }
    const flats = [];
    for (const c of this.xrInput.controllers) {
      if (!this.xrInput.isHand(c)) continue;
      const f = this.flatHand(c);
      if (f) flats.push(f);
    }
    // due mani appoggiate: 0,8 s; una sola: 1,5 s
    this.hold = flats.length ? this.hold + dt : 0;
    if (!flats.length || this.hold < (flats.length >= 2 ? 0.8 : 1.5)) return;
    this.hold = 0;
    this.cooldown = 8;
    this.snap(flats);
  }

  // ---- mirino: guardi il tavolo vero, il sensore trova la superficie, confermi con pizzico/grilletto o «qui» ----
  async startPlacing() {
    this.placing = true;
    this.auto = true;
    this.cooldown = 0;
    if (!this.reticle) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.075, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6ee6a0, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false, fog: false }));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 24).rotateX(-Math.PI / 2), ring.material);
      // sagoma della scrivania che comparirà
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(DESK.w, DESK.d).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0x6ee6a0, transparent: true, opacity: 0.6, depthTest: false }));
      g.add(ring, dot, outline);
      g.renderOrder = 10;
      g.visible = false;
      this.reticle = g;
    }
    const session = this.renderer.xr.getSession?.();
    if (session && !this.hitSource && session.requestHitTestSource) {
      try {
        const viewer = await session.requestReferenceSpace('viewer');
        this.hitSource = await session.requestHitTestSource({ space: viewer });
        session.addEventListener('end', () => { this.hitSource = null; this.placing = false; }, { once: true });
      } catch { this.hitSource = null; }
    }
    return !!this.hitSource;
  }

  updateReticle() {
    const frame = this.renderer.xr.getFrame?.();
    this.hit = null;
    if (frame && this.hitSource) {
      const res = frame.getHitTestResults(this.hitSource);
      const ref = this.renderer.xr.getReferenceSpace();
      for (const r of res) {
        const pose = r.getPose(ref);
        if (!pose) continue;
        const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
        if (this.xrInput.rig) m.premultiply(this.xrInput.rig.matrixWorld);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        const up = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(m));
        if (up.y < 0.85 || p.y < 0.35 || p.y > 1.35) continue; // solo piani orizzontali ad altezza da tavolo
        this.hit = p;
        break;
      }
    }
    if (!this.reticle) return;
    if (!this.reticle.parent) this.xrInput.scene?.add(this.reticle);
    this.reticle.visible = !!this.hit;
    if (this.hit) {
      const head = this.camera.getWorldPosition(new THREE.Vector3());
      const fwd = this.hit.clone().sub(head); fwd.y = 0; fwd.normalize();
      this.reticle.position.copy(this.hit).add(new THREE.Vector3(0, 0.003, 0));
      this.reticle.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
    }
  }

  /** Conferma dal mirino (pizzico, grilletto o «qui»). */
  confirm() {
    if (!this.placing) return false;
    if (!this.hit) { this.ai.say('Non vedo il tavolo: guardalo da vicino, oppure appoggiaci sopra le mani aperte.'); return true; }
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.hit.clone().sub(head); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    this.place(this.hit.clone(), this.hit.y, fwd);
    return true;
  }

  place(center, y, fwd) {
    this.deskGrab.apply({ x: center.x, z: center.z, y: y - DESK.h, rot: Math.atan2(-fwd.x, -fwd.z) });
    this.deskGrab.save();
    this.setRealTable(true);
    this.placing = false;
    if (this.reticle) this.reticle.visible = false;
    this.cooldown = 8;
    this.ai.say('Fatto: il tuo tavolo ora è il piano di lavoro.');
  }

  /** Sposta la scrivania sul piano dove sono appoggiate le mani. */
  snap(flats) {
    const mid = new THREE.Vector3();
    let y = Infinity;
    for (const f of flats) { mid.add(f.palm); y = Math.min(y, f.y); }
    mid.multiplyScalar(1 / flats.length);
    y -= 0.008; // le articolazioni sono dentro le dita: il piano è un po' più in basso
    const py = this.planeHeight(this.renderer.xr.getFrame?.(), y);
    if (py != null) y = py;
    // verso: da te alle mani; con due mani, perpendicolare alla linea tra le mani
    const head = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = mid.clone().sub(head); fwd.y = 0;
    if (flats.length >= 2) {
      const side = flats[1].palm.clone().sub(flats[0].palm); side.y = 0;
      if (side.lengthSq() > 0.01) {
        const perp = new THREE.Vector3(-side.z, 0, side.x).normalize();
        if (perp.dot(fwd) < 0) perp.negate();
        fwd.copy(perp);
      }
    }
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    // le mani stanno a ~12 cm dal bordo davanti della scrivania
    const center = mid.clone().addScaledVector(fwd, DESK.d / 2 - 0.12);
    this.place(center, y, fwd);
  }
}
