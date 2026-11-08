import * as THREE from 'three';

/**
 * Meteo "divino": pioggia (ovunque o solo sopra di te), temporale con fulmini e tuoni,
 * neve, nebbia, arcobaleno. Le particelle seguono chi guarda, quindi costano poco.
 */
export class Weather {
  constructor(scene, getHead) {
    this.scene = scene;
    this.getHead = getHead; // () => Vector3 (posizione della testa nel mondo)
    this.mode = 'clear';
    this.local = false; // true = solo sopra di te
    this.time = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    // pioggia: segmenti che cadono
    const N = 2200;
    this.N = N;
    const pos = new Float32Array(N * 6);
    this.drops = new Float32Array(N * 3); // posizioni relative alla testa
    this.speed = new Float32Array(N);
    for (let i = 0; i < N; i++) this.resetDrop(i, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaecbe8, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);

    // neve: punti
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.group.add(this.snow);

    // nuvola sopra di te (pioggia locale) e nuvoloni alti (pioggia ovunque)
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 1, transparent: true, opacity: 0.92 });
    this.cloud = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.35 + Math.random() * 0.25, 16, 12), cloudMat);
      puff.position.set((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 1.0);
      puff.scale.y = 0.6;
      this.cloud.add(puff);
    }
    this.cloud.visible = false;
    this.group.add(this.cloud);
    this.sky = new THREE.Group();
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a515c, roughness: 1, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 30;
      const c = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 3, 16, 10), darkMat);
      c.position.set(Math.cos(a) * r, 14 + Math.random() * 6, Math.sin(a) * r);
      c.scale.y = 0.4;
      this.sky.add(c);
    }
    this.sky.visible = false;
    this.group.add(this.sky);

    // fulmine: linea a zig-zag + lampo di luce
    this.bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 14 }, () => new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 1, toneMapped: false }));
    this.bolt.visible = false;
    this.group.add(this.bolt);
    this.flash = new THREE.HemisphereLight(0xcfe0ff, 0x222233, 0);
    scene.add(this.flash);
    this.nextBolt = 3;

    // arcobaleno
    const bands = [0xff0000, 0xff8000, 0xffff00, 0x00ff00, 0x0080ff, 0x4b0082, 0x9400d3];
    this.rainbow = new THREE.Group();
    bands.forEach((c, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(40 - i * 1.1, 0.55, 8, 96, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, fog: false }));
      this.rainbow.add(m);
    });
    this.rainbow.position.set(0, -2, -70);
    this.rainbow.visible = false;
    scene.add(this.rainbow);
    this.fogBefore = null;
  }

  resetDrop(i, anyHeight) {
    const r = this.local ? 0.75 : 12;
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
    this.drops[i * 3] = Math.cos(a) * d;
    this.drops[i * 3 + 1] = anyHeight ? Math.random() * (this.local ? 1.6 : 9) - (this.local ? 1.6 : 2) : (this.local ? 0.0 : 7);
    this.drops[i * 3 + 2] = Math.sin(a) * d;
    this.speed[i] = 7 + Math.random() * 3;
  }

  /** mode: clear | rain | storm | snow | fog | rainbow. local: solo sopra di te. */
  set(mode, { local = false } = {}) {
    this.mode = mode;
    this.local = local && (mode === 'rain' || mode === 'storm' || mode === 'snow');
    for (let i = 0; i < this.N; i++) this.resetDrop(i, true);
    this.rain.visible = mode === 'rain' || mode === 'storm';
    this.snow.visible = mode === 'snow';
    this.cloud.visible = this.local;
    this.sky.visible = !this.local && (mode === 'rain' || mode === 'storm' || mode === 'snow');
    this.rainbow.visible = mode === 'rainbow';
    this.rain.material.opacity = mode === 'storm' ? 0.7 : 0.5;
    if (mode === 'fog') {
      if (!this.fogBefore) this.fogBefore = this.scene.fog;
      this.scene.fog = new THREE.FogExp2(0x9aa3ad, 0.12);
    } else if (this.fogBefore !== null) {
      this.scene.fog = this.fogBefore;
      this.fogBefore = null;
    }
    this.sound(mode === 'rain' || mode === 'storm' ? (mode === 'storm' ? 0.35 : 0.22) : 0);
    return mode;
  }

  /** Un fulmine (anche a comando). */
  strike() {
    const head = this.getHead();
    const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 20;
    const x = head.x + Math.cos(a) * r, z = head.z + Math.sin(a) * r;
    const pts = [];
    for (let i = 0; i < 14; i++) pts.push(new THREE.Vector3(x + (Math.random() - 0.5) * 2 * (i ? 1 : 0), 18 - i * (18 / 13), z + (Math.random() - 0.5) * 2 * (i ? 1 : 0)));
    this.bolt.geometry.setFromPoints(pts);
    this.bolt.visible = true;
    this.boltT = 0.18;
    this.flash.intensity = 6;
    this.thunder(r);
  }

  // ---------------------------------------------------------------- suoni sintetizzati
  audio() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  noiseBuffer(ctx, seconds) {
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  /** Scroscio continuo di pioggia (rumore filtrato). */
  sound(volume) {
    const ctx = this.audio();
    if (!ctx) return;
    if (!this.rainGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx, 2);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 2400;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(f).connect(this.rainGain).connect(ctx.destination);
      src.start();
    }
    this.rainGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.8);
  }

  thunder(distance) {
    const ctx = this.audio();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx, 3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 180;
    const g = ctx.createGain();
    const t = ctx.currentTime + distance / 40;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  }

  update(dt) {
    this.time += dt;
    const head = this.getHead();
    this.group.position.set(head.x, 0, head.z);
    if (this.local) this.cloud.position.set(0, head.y + 0.65, 0);

    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position.array;
      const top = this.local ? head.y + 0.45 : 0;
      for (let i = 0; i < this.N; i++) {
        this.drops[i * 3 + 1] -= this.speed[i] * dt;
        let y = this.drops[i * 3 + 1];
        const base = this.local ? top + y : y + 7;
        if (base < 0) { this.resetDrop(i, false); y = this.drops[i * 3 + 1]; }
        const x = this.drops[i * 3], z = this.drops[i * 3 + 2];
        const yy = this.local ? top + y : y + 7;
        p.set([x, yy, z, x + 0.01, yy - 0.12, z], i * 6);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.snow.visible) {
      const p = this.snow.geometry.attributes.position.array;
      const top = this.local ? head.y + 0.45 : 7;
      for (let i = 0; i < this.N; i++) {
        this.drops[i * 3 + 1] -= dt * 0.6;
        if (top + this.drops[i * 3 + 1] < 0) this.resetDrop(i, false);
        p.set([this.drops[i * 3] + Math.sin(this.time + i) * 0.15, top + this.drops[i * 3 + 1], this.drops[i * 3 + 2]], i * 3);
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    if (this.mode === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt < 0) { this.strike(); this.nextBolt = 2.5 + Math.random() * 6; }
    }
    if (this.boltT > 0) {
      this.boltT -= dt;
      this.bolt.visible = this.boltT > 0;
      this.bolt.position.set(-head.x, 0, -head.z); // il fulmine è in coordinate del mondo
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 30);
  }
}
