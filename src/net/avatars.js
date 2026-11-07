import * as THREE from 'three';

function label(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 56px system-ui, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 48);
  g.fillStyle = 'rgba(10,12,16,0.75)';
  g.beginPath();
  g.roundRect((512 - w) / 2, 24, w, 80, 40);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(0.5, 0.125, 1);
  return s;
}

/** Gli altri utenti nella stanza: testa con visore, corpo, mani e nome. */
export class Avatars {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
  }

  build(p) {
    const color = new THREE.Color(p.color || '#3fa9ff');
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.35), roughness: 0.6 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 32, 20), skin);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.075, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.15, metalness: 0.6 }),
    );
    visor.position.set(0, 0.01, -0.08);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.072), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    strip.position.set(0, -0.022, -0.08);
    const headG = new THREE.Group();
    headG.add(head, visor, strip);
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.15, 0.32, 8, 16),
      new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55), roughness: 0.7 }),
    );
    const name = label(p.name || 'Ospite', p.color || '#3fa9ff');
    const handMat = new THREE.MeshStandardMaterial({ color: skin.color, roughness: 0.5 });
    const left = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), handMat);
    const right = left.clone();
    g.add(headG, body, name, left, right);
    this.scene.add(g);
    return { g, headG, body, name, left, right, target: null };
  }

  update(people) {
    for (const [uid, a] of this.map) {
      if (!people[uid]) {
        a.g.removeFromParent();
        this.map.delete(uid);
      }
    }
    for (const [uid, p] of Object.entries(people)) {
      if (!p.h) continue;
      let a = this.map.get(uid);
      if (!a) {
        a = this.build(p);
        this.map.set(uid, a);
        a.headG.position.fromArray(p.h);
        a.headG.quaternion.fromArray(p.h, 3);
      }
      a.target = p;
    }
  }

  tick(dt) {
    const k = 1 - Math.exp(-dt * 14);
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    for (const a of this.map.values()) {
      const p = a.target;
      if (!p?.h) continue;
      a.headG.position.lerp(v.fromArray(p.h), k);
      a.headG.quaternion.slerp(q.fromArray(p.h, 3), k);
      // il corpo segue la testa ma resta dritto
      const e = new THREE.Euler().setFromQuaternion(a.headG.quaternion, 'YXZ');
      a.body.position.set(a.headG.position.x, a.headG.position.y - 0.42, a.headG.position.z);
      a.body.rotation.set(0, e.y, 0);
      a.name.position.set(a.headG.position.x, a.headG.position.y + 0.22, a.headG.position.z);
      for (const [mesh, data] of [[a.left, p.l], [a.right, p.r]]) {
        mesh.visible = !!data;
        if (data) mesh.position.lerp(v.fromArray(data), k);
      }
    }
  }
}
