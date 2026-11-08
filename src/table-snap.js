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
    this.prev = new Map();
    this.planes = null;
  }

  /** La mano è appoggiata piatta e ferma? Ritorna { palm, y } oppure null. */
  flatHand(c, dt) {
    const J = c.userData.hand?.joints;
    if (!J?.wrist?.visible || c.userData.grabbed || this.deskGrab.holding(c)) return null;
    const pts = [];
    for (const n of FLAT_JOINTS) {
      const j = J[n];
      if (!j?.visible) return null;
      pts.push(j.getWorldPosition(new THREE.Vector3()));
    }
    // tutte le articolazioni quasi alla stessa altezza (mano distesa su un piano)
    let ymin = Infinity, ymax = -Infinity;
    for (const p of pts) { ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
    if (ymax - ymin > 0.035) return null;
    // dita distese, non chiuse a pugno
    const tip = J['middle-finger-tip'].getWorldPosition(new THREE.Vector3());
    const knuckle = J['middle-finger-phalanx-proximal'].getWorldPosition(new THREE.Vector3());
    if (tip.distanceTo(knuckle) < 0.06) return null;
    // ferma (meno di ~2 cm/s)
    const palm = J['middle-finger-metacarpal'].getWorldPosition(new THREE.Vector3());
    const last = this.prev.get(c);
    this.prev.set(c, palm.clone());
    if (!last || last.distanceTo(palm) / Math.max(dt, 1e-3) > 0.02) return null;
    // a un'altezza da tavolo
    if (ymin < 0.4 || ymin > 1.3) return null;
    return { palm, y: ymin };
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
    if (!this.auto || this.cooldown > 0 || !this.isMixedReality() || !this.renderer.xr.isPresenting) { this.hold = 0; return; }
    const flats = [];
    for (const c of this.xrInput.controllers) {
      if (!this.xrInput.isHand(c)) continue;
      const f = this.flatHand(c, dt);
      if (f) flats.push(f);
    }
    // due mani appoggiate: 0,8 s; una sola: 1,5 s
    this.hold = flats.length ? this.hold + dt : 0;
    if (!flats.length || this.hold < (flats.length >= 2 ? 0.8 : 1.5)) return;
    this.hold = 0;
    this.cooldown = 8;
    this.snap(flats);
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
    this.deskGrab.apply({ x: center.x, z: center.z, y: y - DESK.h, rot: Math.atan2(-fwd.x, -fwd.z) });
    this.deskGrab.save();
    this.setRealTable(true);
    this.ai.say('Fatto: il tuo tavolo ora è la scrivania.');
  }
}
