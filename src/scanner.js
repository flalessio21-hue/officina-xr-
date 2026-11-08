import * as THREE from 'three';
import { createPart, createAssembly } from './parts.js';
import { applyPhotos } from './photo-texture.js';
import { DepthCapture } from './depth-capture.js';
import { VoxelFusion } from './voxel-fusion.js';

/**
 * Scansione di un oggetto vero tenuto in mano (realtà mista).
 *
 * 1. Con il tracciamento delle mani capisce quando stai stringendo qualcosa davanti agli occhi
 *    (dita piegate attorno a un oggetto, non un pizzico, non un pugno vuoto): parte da sola.
 * 2. Mentre lo giri scatta una foto ogni volta che l'oggetto mostra un lato nuovo.
 * 3. Claude riconosce l'oggetto, ne ricostruisce la forma con misure vere e dice quale foto
 *    mostra quale lato; le foto vengono proiettate sulla forma (aspetto reale).
 */
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const SIDES = ['front', 'back', 'left', 'right', 'top', 'bottom'];
const MAX_SHOTS = 6;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _f = new THREE.Vector3();

export class Scanner {
  constructor({ scene, camera, xrInput, headsetCamera, brain, ai, actions, workspace, isMixedReality }) {
    Object.assign(this, { scene, camera, xrInput, cam: headsetCamera, brain, ai, actions, workspace, isMixedReality });
    this.auto = false; // parte solo quando lo chiedi (voce o pulsante)
    this.state = 'idle'; // idle | capturing | building
    this.holdTime = new Map();
    this.cooldown = 0;
    this.depth = new DepthCapture(xrInput.renderer);
    this.buildUI();
  }

  buildUI() {
    // anello di 6 segmenti attorno all'oggetto: uno si accende per ogni lato fotografato
    this.ring = new THREE.Group();
    this.segs = [];
    for (let i = 0; i < MAX_SHOTS; i++) {
      const a0 = (i / MAX_SHOTS) * Math.PI * 2 + 0.06, a1 = ((i + 1) / MAX_SHOTS) * Math.PI * 2 - 0.06;
      const seg = new THREE.Mesh(
        new THREE.RingGeometry(0.105, 0.118, 16, 1, a0, a1 - a0),
        new THREE.MeshBasicMaterial({ color: 0x6ee6a0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })
      );
      this.ring.add(seg);
      this.segs.push(seg);
    }
    this.frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 0.16, 0.16)),
      new THREE.LineBasicMaterial({ color: 0x6ee6a0, transparent: true, opacity: 0.8, fog: false, toneMapped: false })
    );
    this.ring.add(this.frame);
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  // ---------- riconoscimento della presa ----------
  joint(c, name, out) {
    const j = c.userData.hand.joints?.[name];
    if (!j || !j.visible) return null;
    return j.getWorldPosition(out);
  }

  /** La mano sta stringendo un oggetto vero davanti agli occhi? Ritorna il centro presunto. */
  holdingReal(c) {
    const x = this.xrInput;
    if (!x.isHand(c) || c.userData.grabbed || x.desk?.holding(c) || c.userData.poking) return null;
    const wrist = this.joint(c, 'wrist', new THREE.Vector3());
    const thumb = this.joint(c, 'thumb-tip', new THREE.Vector3());
    if (!wrist || !thumb) return null;
    let curled = 0;
    const tips = [];
    for (const f of FINGERS) {
      const tip = this.joint(c, `${f}-tip`, new THREE.Vector3());
      const mcp = this.joint(c, `${f}-phalanx-proximal`, new THREE.Vector3());
      if (!tip || !mcp) return null;
      tips.push(tip);
      const r = tip.distanceTo(mcp);
      // dita piegate attorno a qualcosa: né distese (≈9 cm) né chiuse a pugno vuoto (≈3 cm)
      if (r > 0.028 && r < 0.078) curled++;
    }
    const indexTip = tips[0];
    if (curled < 2 || thumb.distanceTo(indexTip) < 0.025) return null; // pizzico: è un gesto, non una presa
    // davanti agli occhi, a portata di sguardo
    this.camera.getWorldPosition(_h);
    this.camera.getWorldDirection(_f);
    _v.subVectors(wrist, _h);
    if (_v.length() > 0.7 || _v.normalize().dot(_f) < 0.4) return null;
    // centro dell'oggetto: tra il pollice e le punte delle dita
    const center = new THREE.Vector3().add(thumb);
    for (const t of tips) center.add(t);
    return center.multiplyScalar(1 / (tips.length + 1));
  }

  // ---------- ciclo ----------
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.state === 'capturing') return this.updateCapture(dt);
    if (this.state === 'building') { this.ring.rotation.z += dt * 2; return; }
    if (!this.auto || this.cooldown > 0 || !this.isMixedReality() || !this.xrInput.renderer.xr.isPresenting) return;
    for (const c of this.xrInput.controllers) {
      const p = this.holdingReal(c);
      const t = p ? (this.holdTime.get(c) || 0) + dt : 0;
      this.holdTime.set(c, t);
      if (t > 0.7) { this.start(c); return; }
    }
  }

  /** Avvio: automatico (mano) o a voce (hand = null: foto a intervalli). */
  async start(hand = null) {
    if (this.state !== 'idle') return 'Sto già scansionando.';
    // prima scelta: il sensore di profondità del visore (niente chiavi, tutto in locale)
    if (this.depth.supported()) return this.startDepth(hand);
    if (!this.brain.enabled) {
      this.cooldown = 30;
      this.ai.say(this.isMixedReality()
        ? 'Il browser del visore non mi dà il sensore di profondità. Aggiorna il browser del Quest e rientra in realtà mista.'
        : 'Per scansionare entra in realtà mista.');
      return null;
    }
    try {
      if (!this.cam.ready) await this.cam.start();
    } catch {
      this.cooldown = 30;
      this.ai.say('Non riesco a vedere dalle telecamere del visore. Nella pagina iniziale tocca «Abilita fotocamera» e consenti l\'accesso.');
      return null;
    }
    this.state = 'capturing';
    this.mode = 'photo';
    this.hand = hand;
    this.shots = [];
    this.elapsed = 0;
    this.lost = 0;
    this.nextTimed = 0.6;
    this.segs.forEach((s) => { s.material.opacity = 0.25; });
    this.ring.visible = true;
    this.ai.setSubtitle(hand ? 'Scansione: giralo piano tra le mani.' : 'Scansione: tieni l\'oggetto davanti agli occhi e giralo piano.');
    this.ai.say(hand ? 'Lo vedo. Giralo piano, così lo guardo da tutti i lati.' : 'Tienilo davanti agli occhi e giralo piano.');
    return null;
  }

  cancel(msg) {
    this.state = 'idle';
    this.ring.visible = false;
    if (this.preview) this.preview.visible = false;
    this.cooldown = 4;
    if (msg) this.ai.say(msg);
  }

  // ---------- scansione 3D con il sensore di profondità ----------
  startDepth(hand) {
    this.state = 'capturing';
    this.mode = 'depth';
    this.hand = hand || this.nearestHand();
    this.elapsed = 0;
    this.lost = 0;
    this.views = [];
    this.nextSample = 0;
    this.fusion = new VoxelFusion({ half: 0.14 });
    this.startQuat = null;
    this.centerLocal = null;
    this.worldCenter = null;
    this.saidDone = false;
    this.segs.forEach((s) => { s.material.opacity = 0.25; });
    this.ring.visible = true;
    this.preview ||= this.buildPreview();
    this.preview.visible = true;
    this.preview.geometry.setDrawRange(0, 0);
    this.nextPreview = 0;
    this.ai.setSubtitle('Scansione 3D: giralo piano. Quando hai finito di\' «fatto».');
    this.ai.say(this.hand ? 'Giralo piano tra le mani. I puntini verdi sono quello che vedo. Quando hai finito dimmi «fatto».' : 'Non vedo le tue mani: posa i controller e tieni l\'oggetto davanti agli occhi.');
    if (!this.hand) { this.state = 'idle'; this.ring.visible = false; this.preview.visible = false; }
    return null;
  }

  /** La mano più vicina al centro dello sguardo (anche se non riconosco la presa). */
  nearestHand() {
    this.camera.getWorldPosition(_h);
    this.camera.getWorldDirection(_f);
    let best = null, bd = Infinity;
    for (const c of this.xrInput.controllers) {
      if (!this.xrInput.isHand(c)) continue;
      const w = this.joint(c, 'wrist', new THREE.Vector3());
      if (!w) continue;
      const v = w.sub(_h);
      const off = v.clone().sub(_f.clone().multiplyScalar(v.dot(_f))).length(); // distanza dall'asse dello sguardo
      if (off < bd) { bd = off; best = c; }
    }
    return best;
  }

  /** Nuvola di puntini verdi: quello che il sensore ha già visto dell'oggetto. */
  buildPreview() {
    const max = 8000;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x6ee6a0, size: 0.004, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false }));
    p.frustumCulled = false;
    p.matrixAutoUpdate = false;
    p.visible = false;
    p.userData.max = max;
    this.scene.add(p);
    return p;
  }

  updatePreview() {
    const f = this.fusion, p = this.preview;
    const { res, half, hits } = f;
    let max = 0;
    for (let i = 0; i < hits.length; i++) if (hits[i] > max) max = hits[i];
    const thr = Math.max(1, Math.min(4, max * 0.03));
    const arr = p.geometry.attributes.position.array;
    const cell = (2 * half) / res;
    let n = 0;
    for (let z = 0; z < res && n < p.userData.max; z++) for (let y = 0; y < res && n < p.userData.max; y++) for (let x = 0; x < res && n < p.userData.max; x++) {
      if (hits[x + y * res + z * res * res] < thr) continue;
      arr[n * 3] = -half + (x + 0.5) * cell; arr[n * 3 + 1] = -half + (y + 0.5) * cell; arr[n * 3 + 2] = -half + (z + 0.5) * cell;
      n++;
    }
    p.geometry.attributes.position.needsUpdate = true;
    p.geometry.setDrawRange(0, n);
    return n;
  }

  /** Punti delle mani (da escludere: non fanno parte dell'oggetto). */
  handPoints() {
    const pts = [];
    for (const c of this.xrInput.controllers) {
      const joints = c.userData.hand?.joints;
      if (!joints) continue;
      for (const j of Object.values(joints)) if (j.visible) pts.push(j.getWorldPosition(new THREE.Vector3()));
      // avambraccio: qualche punto dietro il polso
      const w = joints.wrist, m = joints['middle-finger-metacarpal'];
      if (w?.visible && m?.visible) {
        const a = w.getWorldPosition(new THREE.Vector3()), b = m.getWorldPosition(new THREE.Vector3());
        const back = a.clone().sub(b).normalize();
        for (let k = 1; k <= 5; k++) pts.push(a.clone().addScaledVector(back, k * 0.035));
      }
    }
    return pts;
  }

  /** Centro presunto dell'oggetto: davanti al palmo, tra pollice e dita. */
  palmPoint() {
    const c = this.hand;
    const pts = ['wrist', 'middle-finger-phalanx-proximal', 'thumb-tip', 'index-finger-tip', 'middle-finger-tip']
      .map((n) => this.joint(c, n, new THREE.Vector3())).filter(Boolean);
    if (pts.length < 3) return null;
    const p = new THREE.Vector3();
    for (const q of pts) p.add(q);
    return p.multiplyScalar(1 / pts.length);
  }

  updateDepth(dt) {
    const wrist = this.hand.userData.hand.joints?.wrist;
    const tracked = !!wrist?.visible;
    let wristM = null, quat = null;
    if (tracked) {
      wrist.updateMatrixWorld();
      wristM = wrist.matrixWorld.clone();
      quat = wrist.getWorldQuaternion(new THREE.Quaternion());
      this.lost = 0;
    } else this.lost += dt;

    this.camera.getWorldPosition(_h);
    if (tracked && this.centerLocal) {
      // anello e puntini seguono l'oggetto mentre lo giri
      const m = wristM.clone().multiply(new THREE.Matrix4().makeTranslation(this.centerLocal.x, this.centerLocal.y, this.centerLocal.z));
      this.preview.matrix.copy(m);
      this.preview.matrixWorldNeedsUpdate = true;
      this.ring.position.lerp(new THREE.Vector3().setFromMatrixPosition(m), Math.min(1, dt * 12));
    } else if (tracked) {
      const pp = this.palmPoint();
      if (pp) this.ring.position.lerp(pp, Math.min(1, dt * 12));
    }
    this.ring.lookAt(_h);
    if (!tracked) this.ai.setSubtitle('Non vedo la mano: tienila davanti agli occhi.');

    // lati visti: un segmento per ogni orientamento nuovo
    if (quat && this.centerLocal && this.views.every((q) => q.angleTo(quat) > 0.6) && this.views.length < MAX_SHOTS) {
      this.views.push(quat.clone());
      this.segs[this.views.length - 1].material.opacity = 0.95;
      this.ai.setSubtitle(`Scansione 3D: ${this.views.length} ${this.views.length === 1 ? 'lato' : 'lati'}… di' «fatto» quando hai finito`);
      if (this.views.length === 5 && !this.saidDone) { this.saidDone = true; this.ai.say('Lo vedo bene. Dimmi «fatto» quando vuoi.'); }
    }

    // una lettura di profondità ogni ~0,12 s (asincrona: non blocca il visore)
    this.nextSample -= dt;
    if (tracked && this.nextSample <= 0 && !this.depth.busy) {
      this.nextSample = 0.12;
      const hands = this.handPoints();
      const keep = (p) => hands.every((h) => h.distanceToSquared(p) > 0.02 * 0.02);
      const inv = wristM.clone().invert();
      const palm = this.palmPoint();
      const rig = this.xrInput.rig?.matrixWorld;
      this.depth.sample(rig).then((res) => {
        if (!res || this.state !== 'capturing' || this.mode !== 'depth') return;
        if (!this.centerLocal) {
          // primo sguardo: il centro dell'oggetto è il centro dei punti vicino al palmo (mano esclusa)
          if (!palm) return;
          const c = new THREE.Vector3(); let n = 0;
          const v = new THREE.Vector3();
          for (let i = 0; i < res.count; i++) {
            v.set(res.points[i * 3], res.points[i * 3 + 1], res.points[i * 3 + 2]);
            if (v.distanceToSquared(palm) > 0.14 * 0.14 || !keep(v)) continue;
            c.add(v); n++;
          }
          if (n < 25) return;
          c.multiplyScalar(1 / n);
          this.centerLocal = c.applyMatrix4(inv);
          this.startQuat = quat.clone();
          return;
        }
        const toLocal = new THREE.Matrix4().makeTranslation(-this.centerLocal.x, -this.centerLocal.y, -this.centerLocal.z).multiply(inv);
        this.fusion.add(res.points, res.count, toLocal, keep);
      }).catch(() => {});
    }

    this.nextPreview -= dt;
    if (this.centerLocal && this.nextPreview <= 0) { this.nextPreview = 0.35; this.updatePreview(); }
    if (this.elapsed > 40) this.finish(); // dopo 40 secondi chiudo comunque
  }

  /** «Fatto»: costruisce l'oggetto con quello che ha visto. */
  finish() {
    if (this.state !== 'capturing') return false;
    if (this.mode === 'depth') {
      if (this.fusion.frames < 5) { this.cancel('Non ho visto abbastanza: tienilo davanti agli occhi e riprova.'); return true; }
      this.buildDepth();
    } else this.build();
    return true;
  }

  buildDepth() {
    this.state = 'building';
    const params = this.fusion.toParams();
    if (params.cells < 25) return this.cancel('Non sono riuscita a vederlo bene: avvicinalo un po\' agli occhi e riproviamo.');
    // colore medio dalla telecamera, se è disponibile (facoltativo)
    let color = 0xc9c2b8;
    if (this.cam.ready) {
      try {
        const c = document.createElement('canvas');
        c.width = 16; c.height = 12;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(this.cam.video, this.cam.video.videoWidth * 0.35, this.cam.video.videoHeight * 0.35, this.cam.video.videoWidth * 0.3, this.cam.video.videoHeight * 0.3, 0, 0, 16, 12);
        const d = g.getImageData(0, 0, 16, 12).data;
        let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const k = d.length / 4;
        if (r + gg + b > k * 30) color = (Math.round(r / k) << 16) | (Math.round(gg / k) << 8) | Math.round(b / k);
      } catch { /* niente colore */ }
    }
    const part = createPart('voxel', { ...params, mat: { roughness: 0.6, metalness: 0 } }, color, 'Forma scansionata');
    if (this.startQuat) part.quaternion.copy(this.startQuat); // com'era in mano all'inizio
    const node = createAssembly('Oggetto scansionato', [part]);
    node.userData.scanned = true;
    const box = new THREE.Box3().setFromObject(node);
    const size = box.getSize(new THREE.Vector3());
    this.workspace.placeOnDesk(node);
    this.appear?.(node);
    this.workspace.select(node);
    this.workspace.markDirty?.();
    this.state = 'idle';
    this.ring.visible = false;
    this.preview.visible = false;
    this.cooldown = 6;
    this.explodeAfter = false;
    const cm = (v) => Math.round(v * 100);
    this.ai.say(`Fatto: circa ${cm(size.x)} per ${cm(size.y)} per ${cm(size.z)} centimetri, sulla scrivania.`);
  }

  updateCapture(dt) {
    this.elapsed += dt;
    if (this.mode === 'depth') return this.updateDepth(dt);
    let center = null, quat = null;
    if (this.hand) {
      center = this.holdingReal(this.hand);
      if (center) {
        this.lost = 0;
        this.hand.userData.hand.joints.wrist.getWorldQuaternion(quat = new THREE.Quaternion());
      } else this.lost += dt;
    }
    // anello: attorno all'oggetto (o davanti agli occhi), rivolto verso di te
    this.camera.getWorldPosition(_h);
    this.camera.getWorldDirection(_f);
    const target = center || _w.copy(_h).addScaledVector(_f, 0.38);
    this.ring.position.lerp(target, Math.min(1, dt * 12));
    this.ring.lookAt(_h);
    if (quat) this.frame.quaternion.copy(this.ring.quaternion).invert().multiply(quat);

    // nuova foto quando l'oggetto mostra un lato nuovo (rotazione > 35° da tutte le precedenti)
    let shoot = false;
    if (quat) shoot = this.shots.every((s) => !s.q || s.q.angleTo(quat) > 0.6) && this.elapsed > 0.3;
    else if (!this.hand && this.elapsed > this.nextTimed) { shoot = true; this.nextTimed += 1.2; }
    if (shoot && this.cam.ready && this.shots.length === 0 && (this.brightness() ?? 255) < 6) {
      return this.cancel('Le telecamere mi danno solo immagini nere: il browser del tuo visore non mi fa vedere la stanza.');
    }
    if (shoot && this.cam.ready) {
      this.shots.push({ canvas: this.cam.canvas(), q: quat?.clone() });
      const n = this.shots.length;
      this.segs[n - 1].material.opacity = 0.95;
      this.ai.setSubtitle(`Scansione: ${n} ${n === 1 ? 'lato visto' : 'lati visti'}… continua a girarlo`);
    }
    const n = this.shots.length;
    const enough = n >= MAX_SHOTS || (n >= 4 && this.elapsed > 9) || this.elapsed > 16 || (this.hand && this.lost > 1.5);
    if (!enough) return;
    if (n < 2) return this.cancel(this.hand ? 'L\'ho perso di vista. Riprendilo in mano davanti agli occhi e riproviamo.' : 'Non sono riuscita a fare abbastanza foto.');
    this.build();
  }

  /** La mano che sembra tenere qualcosa (per la scansione avviata a voce), altrimenti null. */
  bestHand() {
    for (const c of this.xrInput.controllers) if (this.xrInput.isHand(c) && this.holdingReal(c)) return c;
    return null;
  }

  /** Cosa manca perché la scansione funzioni? (detto a voce all'ingresso in realtà mista) */
  async readiness() {
    if (this.depth.supported()) return { ok: true, depth: true };
    if (this.isMixedReality() && !this.brain.enabled) return { ok: false, msg: 'Il browser del visore non mi dà il sensore di profondità: aggiorna il browser del Quest e rientra in realtà mista.' };
    if (!this.brain.enabled) return { ok: false, msg: 'Per scansionare mi serve la chiave di Claude: inseriscila nella pagina iniziale, al punto 2.' };
    try {
      if (!this.cam.ready) await this.cam.start();
    } catch (e) {
      return { ok: false, msg: `Non riesco ad aprire le telecamere del visore (${e.name || 'errore'}). Esci, tocca «Abilita fotocamera» nella pagina iniziale e consenti l'accesso.` };
    }
    await new Promise((r) => setTimeout(r, 400));
    const lum = this.brightness();
    if (lum != null && lum < 6) return { ok: false, msg: 'Le telecamere mi danno solo immagini nere: il browser del tuo visore non mi fa vedere la stanza.' };
    return { ok: true };
  }

  brightness() {
    try {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 24;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(this.cam.video, 0, 0, 32, 24);
      const d = g.getImageData(0, 0, 32, 24).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return s / (d.length / 4) / 3;
    } catch { return null; }
  }

  /** Riassunto per capire cosa non va (comando «diagnostica»). */
  async diagnose() {
    const hands = this.xrInput.controllers.filter((c) => this.xrInput.isHand(c)).length;
    const r = await this.readiness();
    const v = this.cam.video;
    const parts = [
      this.depth.supported() ? 'sensore di profondità attivo' : 'sensore di profondità non disponibile',
      this.cam.ready ? `telecamera attiva ${v.videoWidth}×${v.videoHeight}` : 'telecamera spenta',
      this.isMixedReality() ? 'realtà mista attiva' : 'non sei in realtà mista',
      hands ? `${hands === 2 ? 'due mani tracciate' : 'una mano tracciata'}` : 'mani non tracciate, posa i controller',
    ];
    return `${parts.join(', ')}. ${r.ok ? 'La scansione è pronta.' : r.msg}`;
  }

  // ---------- ricostruzione ----------
  async build() {
    this.state = 'building';
    this.ai.say('Ho visto abbastanza. Lo sto ricostruendo.');
    const shots = this.shots;
    try {
      const spec = await this.brain.reconstruct(shots.map((s) => toJpeg(s.canvas, 1024)));
      if (!spec) return this.cancel('Non ho visto bene l\'oggetto: tienilo un po\' più vicino e riproviamo.');
      const node = this.buildFromScan(spec, shots);
      if (!node) return this.cancel('Non sono riuscita a ricostruirlo, riproviamo.');
      this.workspace.placeOnDesk(node);
      this.appear?.(node);
      this.workspace.select(node);
      this.workspace.markDirty?.();
      this.state = 'idle';
      this.ring.visible = false;
      this.cooldown = 6; // non ripartire subito con lo stesso oggetto in mano
      if (this.explodeAfter) {
        this.explodeAfter = false;
        this.workspace.explodeAll?.(node);
        this.workspace.markDirty?.();
        this.ai.say('Eccolo smontato: prendi i pezzi uno alla volta.');
      } else this.ai.say(spec.description || `Ecco ${spec.name}, sulla scrivania.`);
    } catch (e) {
      console.error(e);
      this.cancel(this.brain.explainError?.(e) || 'Qualcosa è andato storto con la ricostruzione.');
    }
  }

  buildFromScan(spec, shots) {
    const mm = (v) => (Number(v) || 0) / 1000;
    const col = (c) => (/^#?[0-9a-f]{6}$/i.test(c || '') ? parseInt(c.replace('#', ''), 16) : 0xc8ccd2);
    const groups = new Map();
    for (const p of (spec.parts || []).slice(0, 80)) {
      const [sx, sy, sz] = (p.size_mm || []).map((v) => Math.max(0.5, Number(v) || 0) / 1000);
      if (!(sx > 0 && sy > 0 && sz > 0)) continue;
      const mat = { roughness: clamp01(p.roughness, 0.5), metalness: clamp01(p.metalness, 0), opacity: Math.max(0.15, clamp01(p.opacity, 1)) };
      let part, scale = [1, 1, 1];
      const name = p.name || 'Pezzo';
      switch (p.kind) {
        case 'lathe': {
          const prof = (p.profile_mm || []).map(([r, y]) => [mm(r), mm(y)]);
          part = createPart('lathe', { profile: prof, mat, photo: p.photo }, col(p.color), name);
          break;
        }
        case 'extrude': {
          const out = (p.outline_mm || []).map(([x, y]) => [mm(x), mm(y)]);
          part = createPart('extrude', { outline: out, d: sz, bevel: Math.min(mm(p.radius_mm), sz / 3), mat, photo: p.photo }, col(p.color), name);
          break;
        }
        case 'sphere': part = createPart('sphere', { r: sx / 2, mat, photo: p.photo }, col(p.color), name); scale = [1, sy / sx, sz / sx]; break;
        case 'cylinder': part = createPart('cylinder', { r: sx / 2, h: sy, mat, photo: p.photo }, col(p.color), name); scale = [1, 1, sz / sx]; break;
        case 'cone': part = createPart('cone', { r: sx / 2, h: sy, mat, photo: p.photo }, col(p.color), name); scale = [1, 1, sz / sx]; break;
        case 'torus': { const r = Math.min(sy / 2, sx / 4); part = createPart('torus', { R: sx / 2 - r, r, mat, photo: p.photo }, col(p.color), name); break; }
        case 'tube': part = createPart('tube', { R: sx / 2, r: Math.max(0.0005, sx / 2 - Math.max(mm(p.radius_mm), 0.001)), h: sy, mat, photo: p.photo }, col(p.color), name); break;
        case 'box': part = createPart('box', { w: sx, h: sy, d: sz, mat, photo: p.photo }, col(p.color), name); break;
        default: part = createPart('rbox', { w: sx, h: sy, d: sz, radius: mm(p.radius_mm), mat, photo: p.photo }, col(p.color), name);
      }
      const [px, py, pz] = (p.position_mm || [0, 0, 0]).map(mm);
      const [rx, ry, rz] = (p.rotation_deg || [0, 0, 0]).map((v) => ((Number(v) || 0) * Math.PI) / 180);
      part.position.set(px, py, pz);
      part.rotation.set(rx, ry, rz);
      part.scale.set(...scale.map((v) => (Number.isFinite(v) && v > 0 ? v : 1)));
      const g = p.group || 'Corpo';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(part);
    }
    if (!groups.size) return null;
    const children = groups.size === 1 ? [...groups.values()][0] : [...groups].map(([g, parts]) => createAssembly(g, parts));
    const node = createAssembly(spec.name || 'Oggetto scansionato', children);
    // l'oggetto poggia sulla sua base (y = 0)
    const box = new THREE.Box3().setFromObject(node);
    for (const c of node.children) c.position.y -= box.min.y;

    // foto ritagliate sull'oggetto e raddrizzate, una per lato
    const photos = {};
    for (const ph of spec.photos || []) {
      const s = shots[ph.index];
      if (!s || !SIDES.includes(ph.side) || photos[ph.side]) continue;
      const url = cropPhoto(s.canvas, ph.box, ph.rotate);
      if (url) photos[ph.side] = url;
    }
    applyPhotos(node, photos);
    node.userData.scanned = true;
    return node;
  }
}

function clamp01(v, d) { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d; }

function toJpeg(canvas, maxSide) {
  const k = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k);
  c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}

/** Ritaglia [x0,y0,x1,y1] (0..1) e ruota di 0/90/180/270° così che l'oggetto sia in piedi. */
export function cropPhoto(src, box, rotate = 0) {
  if (!Array.isArray(box) || box.length !== 4) return null;
  const [x0, y0, x1, y1] = box.map((v) => Math.min(1, Math.max(0, Number(v) || 0)));
  const w = (x1 - x0) * src.width, h = (y1 - y0) * src.height;
  if (w < 8 || h < 8) return null;
  const k = Math.min(1, 512 / Math.max(w, h));
  const rot = ((Math.round((Number(rotate) || 0) / 90) % 4) + 4) % 4;
  const cw = Math.round(w * k), ch = Math.round(h * k);
  const c = document.createElement('canvas');
  c.width = rot % 2 ? ch : cw;
  c.height = rot % 2 ? cw : ch;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate((rot * Math.PI) / 2);
  g.drawImage(src, x0 * src.width, y0 * src.height, w, h, -cw / 2, -ch / 2, cw, ch);
  return c.toDataURL('image/jpeg', 0.85);
}
