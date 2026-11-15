import * as THREE from 'three';

/**
 * La stanza intorno a te, decisa a voce: pavimento, muri, soffitto con luci, piscina,
 * stanza allagata, colonne, piattaforme che galleggiano. Materiali procedurali (niente download).
 * Lo stato è un semplice oggetto: ogni comando ne cambia un pezzo e la stanza si ricostruisce.
 */
export const MATERIALS = {
  piastrelle: { label: 'piastrelle', tile: 0.12, color: '#d9c8a0', grout: '#b7a37a' },
  'piastrelle bianche': { label: 'piastrelle bianche', tile: 0.1, color: '#e9eef0', grout: '#c4ccd0' },
  'piastrelle azzurre': { label: 'piastrelle azzurre', tile: 0.1, color: '#9fd3e6', grout: '#7fb4c8' },
  legno: { label: 'legno', kind: 'wood', color: '#8a5a34' },
  parquet: { label: 'parquet', kind: 'wood', color: '#b07a45' },
  marmo: { label: 'marmo', kind: 'marble', color: '#ece8e2' },
  cemento: { label: 'cemento', kind: 'noise', color: '#8d8d8a' },
  mattoni: { label: 'mattoni', kind: 'brick', color: '#9b4a35', grout: '#c9bfae' },
  erba: { label: 'erba', kind: 'grass', color: '#4f8a3a' },
  sabbia: { label: 'sabbia', kind: 'noise', color: '#d8c08e' },
  moquette: { label: 'moquette', kind: 'noise', color: '#5b5f78' },
  metallo: { label: 'metallo', kind: 'metal', color: '#9aa0a8' },
  nero: { label: 'nero', kind: 'plain', color: '#1b1c1f' },
  bianco: { label: 'bianco', kind: 'plain', color: '#e8e8e4' },
};

export const DEFAULT_ROOM = {
  on: false, size: [8, 8], height: 3.2,
  floor: null, walls: null, ceiling: false, lights: 'pannelli', light: 1, warm: 0.5,
  pool: false, flood: 0, columns: 0, platforms: 0, colMat: null,
};

const texCache = new Map();
function texture(matId, repeatX, repeatY) {
  const m = MATERIALS[matId] || MATERIALS.piastrelle;
  const key = matId;
  let base = texCache.get(key);
  if (!base) {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const rnd = mulberry(matId.length * 97 + 13);
    g.fillStyle = m.color; g.fillRect(0, 0, S, S);
    const kind = m.kind || 'tiles';
    if (kind === 'tiles') {
      const n = 8, step = S / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        g.fillStyle = shade(m.color, (rnd() - 0.5) * 0.06);
        g.fillRect(x * step + 3, y * step + 3, step - 6, step - 6);
      }
      g.strokeStyle = m.grout; g.lineWidth = 6;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, S); g.stroke(); g.beginPath(); g.moveTo(0, i * step); g.lineTo(S, i * step); g.stroke(); }
    } else if (kind === 'brick') {
      const rows = 8, h = S / rows, w = S / 4;
      g.fillStyle = m.grout; g.fillRect(0, 0, S, S);
      for (let r = 0; r < rows; r++) for (let k = -1; k < 5; k++) {
        g.fillStyle = shade(m.color, (rnd() - 0.5) * 0.15);
        g.fillRect(k * w + (r % 2) * w / 2 + 3, r * h + 3, w - 6, h - 6);
      }
    } else if (kind === 'wood') {
      const planks = 6, pw = S / planks;
      for (let p = 0; p < planks; p++) {
        g.fillStyle = shade(m.color, (rnd() - 0.5) * 0.18);
        g.fillRect(p * pw, 0, pw - 2, S);
        for (let k = 0; k < 40; k++) {
          g.strokeStyle = shade(m.color, -0.15 - rnd() * 0.1); g.globalAlpha = 0.25; g.lineWidth = 1 + rnd() * 2;
          const x = p * pw + rnd() * pw; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, S * 0.3, x - 6, S * 0.6, x + 3, S); g.stroke();
        }
        g.globalAlpha = 1;
      }
    } else if (kind === 'marble') {
      for (let k = 0; k < 60; k++) {
        g.strokeStyle = shade(m.color, -0.25 - rnd() * 0.2); g.globalAlpha = 0.18; g.lineWidth = 1 + rnd() * 3;
        g.beginPath(); let x = rnd() * S, y = 0; g.moveTo(x, y);
        while (y < S) { x += (rnd() - 0.5) * 60; y += 20 + rnd() * 30; g.lineTo(x, y); }
        g.stroke();
      }
      g.globalAlpha = 1;
    } else if (kind === 'grass') {
      for (let k = 0; k < 6000; k++) { g.fillStyle = shade(m.color, (rnd() - 0.5) * 0.5); g.fillRect(rnd() * S, rnd() * S, 2, 4 + rnd() * 5); }
    } else if (kind === 'noise' || kind === 'metal') {
      for (let k = 0; k < 9000; k++) { g.fillStyle = shade(m.color, (rnd() - 0.5) * (kind === 'metal' ? 0.08 : 0.2)); g.fillRect(rnd() * S, rnd() * S, 3, 3); }
    }
    base = new THREE.CanvasTexture(c);
    base.colorSpace = THREE.SRGBColorSpace;
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.anisotropy = 8;
    texCache.set(key, base);
  }
  const t = base.clone();
  const scale = (m.kind ? 1.6 : (m.tile || 0.12) * 8); // metri coperti da una ripetizione
  t.repeat.set(repeatX / scale, repeatY / scale);
  t.needsUpdate = true;
  return t;
}

function material(matId, w, h) {
  const m = MATERIALS[matId] || MATERIALS.piastrelle;
  return new THREE.MeshStandardMaterial({
    map: texture(matId, w, h),
    roughness: m.kind === 'metal' ? 0.35 : m.kind === 'marble' ? 0.25 : m.kind ? 0.8 : 0.35,
    metalness: m.kind === 'metal' ? 0.8 : 0,
  });
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color(1, 1, 1), k); else c.lerp(new THREE.Color(0, 0, 0), -k);
  return '#' + c.getHexString();
}

// acqua: superficie animata, trasparente, con riflessi e un leggero motivo di caustiche
const WATER_VERT = `varying vec3 vW; varying vec2 vUv; uniform float uTime;
void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x*3.0+uTime*1.3)*0.008 + cos(p.y*2.6+uTime*1.1)*0.008;
vec4 w = modelMatrix * vec4(p,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = `varying vec3 vW; varying vec2 vUv; uniform float uTime; uniform vec3 uColor;
float c(vec2 p){ return abs(sin(p.x)+sin(p.y*1.3+p.x*0.4)+sin(p.y*0.7-p.x*1.1)); }
void main(){ vec3 V = normalize(cameraPosition - vW);
vec2 q = vW.xz*6.0; float ca = c(q + uTime*0.7) * c(q*1.7 - uTime*0.5);
float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
vec3 col = uColor * (0.75 + 0.25*smoothstep(0.0, 3.0, ca)) + vec3(0.85,0.95,1.0) * (fres*0.55 + smoothstep(4.5, 6.0, ca)*0.25);
gl_FragColor = vec4(col, 0.55 + fres*0.35); }`;

export class Room {
  constructor(scene, { center = () => new THREE.Vector3(0, 0, -0.3), keepClear = () => [], onChange } = {}) {
    this.keepClear = keepClear;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'stanza';
    scene.add(this.group);
    this.state = { ...DEFAULT_ROOM };
    this.center = center;
    this.onChange = onChange;
    this.time = 0;
    this.waters = [];
    this.floaters = [];
    try { const saved = JSON.parse(localStorage.getItem('officina-room') || 'null'); if (saved) this.state = { ...DEFAULT_ROOM, ...saved }; } catch { /* niente */ }
  }

  /** Cambia una parte della stanza e la ricostruisce. */
  set(patch) {
    this.state = { ...this.state, ...patch, on: true };
    this.rebuild();
    try { localStorage.setItem('officina-room', JSON.stringify(this.state)); } catch { /* niente */ }
  }

  reset() {
    this.state = { ...DEFAULT_ROOM };
    this.rebuild();
    try { localStorage.removeItem('officina-room'); } catch { /* niente */ }
  }

  /** In realtà mista si vede la stanza vera: restano solo acqua, colonne e piattaforme. */
  setMixed(on) { this.mixed = on; this.rebuild(); }

  get active() { return this.state.on && !!(this.state.floor || this.state.walls || this.state.pool || this.state.flood || this.state.columns || this.state.platforms || this.state.ceiling); }

  rebuild() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const ms = [].concat(o.material); ms.forEach((m) => { m.map?.dispose?.(); m.dispose(); }); } });
    }
    this.waters = [];
    this.floaters = [];
    const s = this.state;
    this.onChange?.(this.active);
    if (!this.active) return;
    const c = this.center();
    this.group.position.set(c.x, 0, c.z);
    const [W, D] = s.size, H = s.height;
    const showShell = !this.mixed;
    const pool = s.pool ? { w: Math.min(W - 2, 4), d: Math.min(D - 3, 3.2), z: -0.9, depth: 0.8 } : null;

    // pavimento (con il buco della piscina)
    if (s.floor && showShell) {
      const add = (x0, x1, z0, z1) => {
        if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), material(s.floor, x1 - x0, z1 - z0));
        m.position.set((x0 + x1) / 2, 0.001, (z0 + z1) / 2);
        m.receiveShadow = true;
        this.group.add(m);
      };
      if (pool) {
        const px0 = -pool.w / 2, px1 = pool.w / 2, pz0 = pool.z - pool.d / 2, pz1 = pool.z + pool.d / 2;
        add(-W / 2, W / 2, -D / 2, pz0); add(-W / 2, W / 2, pz1, D / 2); add(-W / 2, px0, pz0, pz1); add(px1, W / 2, pz0, pz1);
      } else add(-W / 2, W / 2, -D / 2, D / 2);
    }
    // piscina: vasca piastrellata incassata nel pavimento, piena d'acqua
    if (pool) {
      const mat = material('piastrelle azzurre', pool.w, pool.depth);
      const basin = new THREE.Group();
      const bottom = new THREE.Mesh(new THREE.PlaneGeometry(pool.w, pool.d).rotateX(-Math.PI / 2), material('piastrelle azzurre', pool.w, pool.d));
      bottom.position.y = -pool.depth;
      basin.add(bottom);
      for (const [w, rotY, x, z] of [[pool.w, 0, 0, -pool.d / 2], [pool.w, Math.PI, 0, pool.d / 2], [pool.d, Math.PI / 2, -pool.w / 2, 0], [pool.d, -Math.PI / 2, pool.w / 2, 0]]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, pool.depth), mat.clone());
        wall.position.set(x, -pool.depth / 2, z);
        wall.rotation.y = rotY;
        basin.add(wall);
      }
      // bordo
      const rimMat = material(s.floor || 'piastrelle bianche', 1, 1);
      for (const [w, d, x, z] of [[pool.w + 0.3, 0.15, 0, -pool.d / 2 - 0.075], [pool.w + 0.3, 0.15, 0, pool.d / 2 + 0.075], [0.15, pool.d, -pool.w / 2 - 0.075, 0], [0.15, pool.d, pool.w / 2 + 0.075, 0]]) {
        const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), rimMat);
        rim.position.set(x, 0.02, z);
        basin.add(rim);
      }
      basin.position.z = pool.z;
      this.group.add(basin);
      this.addWater(pool.w, pool.d, -0.08, pool.z);
    }
    // stanza allagata
    if (s.flood > 0) this.addWater(W, D, s.flood, 0);
    // muri
    if (s.walls && showShell) {
      for (const [w, rotY, x, z] of [[W, 0, 0, -D / 2], [W, Math.PI, 0, D / 2], [D, Math.PI / 2, -W / 2, 0], [D, -Math.PI / 2, W / 2, 0]]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, H), material(s.walls, w, H));
        wall.position.set(x, H / 2, z);
        wall.rotation.y = rotY;
        this.group.add(wall);
      }
    }
    // soffitto con pannelli luminosi
    if (s.ceiling && showShell) {
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), material(s.walls || 'piastrelle bianche', W, D));
      ceil.position.y = H;
      this.group.add(ceil);
      if (s.lights !== 'spente') {
        const col = new THREE.Color().setHSL(0.1 - s.warm * 0.06, 0.2 + s.warm * 0.3, 0.85);
        const pm = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4 * s.light), toneMapped: false, fog: false });
        for (let x = -W / 2 + 1; x <= W / 2 - 1; x += 1.6) for (let z = -D / 2 + 1; z <= D / 2 - 1; z += 1.6) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(Math.PI / 2), pm);
          p.position.set(x, H - 0.005, z);
          this.group.add(p);
        }
      }
    }
    // luce della stanza (diffusa, senza ombre: leggera per il visore)
    if (showShell && (s.walls || s.ceiling || s.floor)) {
      const warm = new THREE.Color().setHSL(0.1 - s.warm * 0.06, 0.3 + s.warm * 0.4, 0.75);
      const hemi = new THREE.HemisphereLight(warm, new THREE.Color(0x404850), (s.lights === 'spente' ? 0.15 : 1.1) * s.light);
      hemi.position.y = H;
      this.group.add(hemi);
      const dir = new THREE.DirectionalLight(warm, (s.lights === 'spente' ? 0.05 : 0.6) * s.light);
      dir.position.set(1, H, 2);
      this.group.add(dir);
    }
    // colonne (lontano dalla scrivania e dal centro)
    if (s.columns > 0) {
      const n = Math.min(24, s.columns);
      const cm = material(s.colMat || s.walls || 'piastrelle bianche', 1.2, H);
      const pts = [];
      for (let i = 0; pts.length < n && i < 400; i++) {
        const a = (i / n) * Math.PI * 2 + (i >= n ? i * 0.37 : 0);
        const r = Math.min(W, D) / 2 - 0.8 - (i >= n ? (i % 3) * 0.9 : 0);
        const p = new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
        const clear = this.keepClear().map((w) => new THREE.Vector2(w.x - c.x, w.z - c.z));
        if (clear.some((q) => q.distanceTo(p) < 1.4) || pts.some((q) => q.distanceTo(p) < 1.2)) continue;
        pts.push(p);
      }
      for (const p of pts) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, H, 24), cm);
        col.position.set(p.x, H / 2, p.y);
        this.group.add(col);
      }
    }
    // piattaforme che galleggiano (sull'acqua se c'è, altrimenti sospese basse)
    if (s.platforms > 0) {
      const pm = material(s.floor || 'piastrelle', 1.2, 0.8);
      const lvl = s.flood > 0 ? s.flood : pool ? -0.06 : 0.25;
      for (let i = 0; i < Math.min(12, s.platforms); i++) {
        const a = i * 2.39996, r = 1.6 + (i % 4) * 0.7;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.7), pm);
        const x = pool ? (i % 3 - 1) * 1.2 : Math.cos(a) * r, z = pool ? pool.z + (Math.floor(i / 3) % 2 ? 0.7 : -0.7) : Math.sin(a) * r;
        slab.position.set(x, lvl + 0.06, z);
        slab.rotation.y = a;
        slab.userData.base = lvl + 0.06;
        slab.userData.phase = i;
        this.group.add(slab);
        this.floaters.push(slab);
      }
    }
  }

  addWater(w, d, y, z) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 48, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x3aa7b8) } },
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, fog: false,
    }));
    // PlaneGeometry ruotata: lo spostamento verticale va lungo y del mondo
    m.material.vertexShader = m.material.vertexShader.replace('p.z +=', 'p.y +=');
    m.position.set(0, y, z);
    m.renderOrder = 3;
    this.group.add(m);
    this.waters.push(m);
  }

  update(dt) {
    this.time += dt;
    for (const w of this.waters) w.material.uniforms.uTime.value = this.time;
    for (const f of this.floaters) {
      f.position.y = f.userData.base + Math.sin(this.time * 1.2 + f.userData.phase) * 0.02;
      f.rotation.z = Math.sin(this.time * 0.9 + f.userData.phase) * 0.02;
    }
  }
}
