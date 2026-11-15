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
  'carta da parati': { label: 'carta da parati', kind: 'wallpaper', color: '#d8c7a6', grout: '#b89a6e' },
  'carta rovinata': { label: 'carta da parati rovinata', kind: 'wallpaper', color: '#8f846c', grout: '#6b5f49', dirty: true },
  'legno vecchio': { label: 'legno vecchio', kind: 'wood', color: '#4a3726', dirty: true },
  intonaco: { label: 'intonaco', kind: 'noise', color: '#e7e1d6' },
  pietra: { label: 'pietra', kind: 'brick', color: '#7b766d', grout: '#4f4b45', big: true },
  roccia: { label: 'roccia', kind: 'rock', color: '#5d554b' },
  nero: { label: 'nero', kind: 'plain', color: '#1b1c1f' },
  bianco: { label: 'bianco', kind: 'plain', color: '#e8e8e4' },
};

export const DEFAULT_ROOM = {
  on: false, size: [8, 8], height: 3.2, decor: {}, fog: null, flicker: 0, preset: null,
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
    } else if (kind === 'wallpaper') {
      // carta da parati a righe con piccoli motivi
      for (let x = 0; x < S; x += 32) { g.fillStyle = shade(m.color, x % 64 ? -0.05 : 0.04); g.fillRect(x, 0, 16, S); }
      g.fillStyle = m.grout;
      for (let y = 16; y < S; y += 48) for (let x = 24; x < S; x += 64) { g.beginPath(); g.arc(x, y + ((x / 64) % 2) * 24, 5, 0, Math.PI * 2); g.fill(); }
    } else if (kind === 'rock') {
      for (let k = 0; k < 400; k++) { g.fillStyle = shade(m.color, (rnd() - 0.5) * 0.45); const r = 6 + rnd() * 30; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2); g.fill(); }
    } else if (kind === 'noise' || kind === 'metal') {
      for (let k = 0; k < 9000; k++) { g.fillStyle = shade(m.color, (rnd() - 0.5) * (kind === 'metal' ? 0.08 : 0.2)); g.fillRect(rnd() * S, rnd() * S, 3, 3); }
    }
    if (m.dirty) {
      // macchie di umidità, strappi e sporco
      for (let k = 0; k < 18; k++) {
        const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 90;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(40,30,15,0.45)'); gr.addColorStop(1, 'rgba(40,30,15,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(200,190,170,0.5)'; g.beginPath(); const x = rnd() * S, y = rnd() * S; g.moveTo(x, y); for (let j = 0; j < 6; j++) g.lineTo(x + (rnd() - 0.5) * 60, y + rnd() * 50); g.fill(); }
    }
    base = new THREE.CanvasTexture(c);
    base.colorSpace = THREE.SRGBColorSpace;
    base.wrapS = base.wrapT = THREE.RepeatWrapping;
    base.anisotropy = 8;
    texCache.set(key, base);
  }
  const t = base.clone();
  const scale = m.big ? 3 : m.kind ? 1.6 : (m.tile || 0.12) * 8; // metri coperti da una ripetizione
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

  get active() { const s = this.state; return s.on && !!(s.floor || s.walls || s.pool || s.flood || s.columns || s.platforms || s.ceiling || s.preset); }

  rebuild() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); const ms = [].concat(o.material); ms.forEach((m) => { m.map?.dispose?.(); m.dispose(); }); } });
    }
    this.waters = [];
    this.floaters = [];
    this.roomLights = [];
    this.lightsFx = [];
    this.dust = null;
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
      hemi.userData.base = hemi.intensity; dir.userData.base = dir.intensity;
      this.roomLights = [hemi, dir];
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
    this.buildDecor(W, D, H, showShell);
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

  /** Dettagli dei luoghi: finestre, porta, quadri, tappeto, ragnatele, macerie, polvere, torce… */
  buildDecor(W, D, H, showShell) {
    const d = this.state.decor || {};
    const g = this.group;
    const rnd = mulberry(7 + (this.state.preset || '').length);
    const basic = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false, ...opts });
    const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
    this.lightsFx = [];
    // finestre sulla parete di fondo
    if (d.windows && showShell) {
      const n = Math.max(1, Math.floor(W / 3.5));
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (i + 0.5) * (W / n), w = Math.min(1.6, W / n - 0.6), h = Math.min(1.6, H - 1.2);
        const vetrata = d.windows === 'vetrate';
        const glassCol = d.windows === 'notte' ? 0x1a2a4a : d.windows === 'sbarrate' ? 0x2c3238 : vetrata ? 0xffffff : 0xcfe8ff;
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, vetrata ? h * 1.6 : h), vetrata ? new THREE.MeshBasicMaterial({ map: stainedGlass(), toneMapped: false }) : basic(new THREE.Color(glassCol).multiplyScalar(d.windows === 'giorno' ? 1.25 : 1)));
        glass.position.set(x, H * 0.55, -D / 2 + 0.01);
        g.add(glass);
        const frame = std(0xece6da);
        for (const [fw, fh, fx, fy] of [[w + 0.1, 0.06, 0, h / 2], [w + 0.1, 0.06, 0, -h / 2], [0.06, h, -w / 2, 0], [0.06, h, w / 2, 0], [w, 0.04, 0, 0], [0.04, h, 0, 0]]) {
          if (vetrata) break;
          const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), frame);
          f.position.set(x + fx, H * 0.55 + fy, -D / 2 + 0.03);
          g.add(f);
        }
        if (d.windows === 'sbarrate') { // assi inchiodate di traverso
          for (let k = 0; k < 3; k++) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.13, 0.03), std(0x5a4430));
            b.position.set(x, H * 0.55 + (k - 1) * h * 0.32, -D / 2 + 0.07);
            b.rotation.z = (rnd() - 0.5) * 0.5;
            g.add(b);
          }
        }
        if (d.windows === 'giorno') { // luce che entra dalla finestra
          const sun = new THREE.SpotLight(0xfff1d8, 2.2, 9, 0.6, 0.8, 1.5);
          sun.position.set(x, H * 0.6, -D / 2 + 0.3);
          sun.target.position.set(x * 0.6, 0, -D / 2 + 3);
          g.add(sun, sun.target);
        }
      }
    }
    // porta sulla parete di sinistra
    if (d.door && showShell) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.95), std(this.state.flicker > 0.5 ? 0x3a2b1e : 0x7a5638));
      door.position.set(-W / 2 + 0.03, 1.05, -D / 4);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), std(0xc9a64a, { metalness: 0.8, roughness: 0.3 }));
      knob.position.set(-W / 2 + 0.07, 1.0, -D / 4 + 0.35);
      g.add(door, knob);
    }
    // quadri
    for (let i = 0; i < (showShell ? d.paintings || 0 : 0); i++) {
      const side = i % 2 ? 1 : -1;
      const z = -D / 2 + 1.5 + Math.floor(i / 2) * 2.2;
      if (z > D / 2 - 2) break;
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshStandardMaterial({ map: paintingTex(rnd), roughness: 0.6 }));
      pic.position.set(side * (W / 2 - 0.02), 1.65, z);
      pic.rotation.y = -side * Math.PI / 2;
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 1.0), std(0x6a4a22, { metalness: 0.3 }));
      fr.position.set(side * (W / 2 - 0.005), 1.65, z);
      g.add(fr, pic);
    }
    // tappeto
    if (d.rug) {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3.2, W * 0.4), Math.min(2.2, D * 0.3)).rotateX(-Math.PI / 2), std(d.rug, { roughness: 1 }));
      rug.position.set(0, 0.004, -D / 2 + 2.6);
      g.add(rug);
    }
    // bancone della cucina e vasca del bagno, lavagna, sbarre, mare
    if (d.counter) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.9, 0.6), std(0xf2f0ea));
      c.position.set(-W * 0.1, 0.45, -D / 2 + 0.3);
      const top = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6 + 0.04, 0.04, 0.64), std(0x2b2b2e, { roughness: 0.3 }));
      top.position.set(-W * 0.1, 0.92, -D / 2 + 0.3);
      g.add(c, top);
    }
    if (d.tub) {
      const tub = new THREE.Group();
      const m = std(0xffffff, { roughness: 0.25 });
      for (const [w, h, dd, x, z] of [[1.7, 0.55, 0.06, 0, -0.37], [1.7, 0.55, 0.06, 0, 0.37], [0.06, 0.55, 0.8, -0.82, 0], [0.06, 0.55, 0.8, 0.82, 0], [1.7, 0.05, 0.8, 0, 0]]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); p.position.set(x, h === 0.05 ? 0.03 : h / 2, z); tub.add(p);
      }
      tub.position.set(-W / 2 + 1, 0, -D / 2 + 0.5);
      g.add(tub);
      this.addWater(1.58, 0.68, 0.42, 0);
      this.waters.at(-1).position.set(-W / 2 + 1, 0.42, -D / 2 + 0.5);
    }
    if (d.board && showShell) {
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), std(0x23402f, { roughness: 0.9 }));
      bd.position.set(0, 1.5, -D / 2 + 0.02);
      g.add(bd);
    }
    if (d.bars) {
      for (let x = -W / 2 + 0.3; x < W / 2; x += 0.18) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, H, 8), std(0x3a3b3d, { metalness: 0.8, roughness: 0.4 }));
        bar.position.set(x, H / 2, D / 2 - 0.4);
        g.add(bar);
      }
    }
    if (d.sea) this.addWater(60, 30, -0.02, -D / 2 - 14);
    // ragnatele negli angoli in alto
    if (d.cobwebs && showShell) {
      const web = new THREE.MeshBasicMaterial({ map: webTex(), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false });
      for (const [x, z, ry] of [[-W / 2, -D / 2, Math.PI / 4], [W / 2, -D / 2, -Math.PI / 4], [-W / 2, D / 2, Math.PI * 0.75], [W / 2, D / 2, -Math.PI * 0.75]]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), web);
        w.position.set(x * 0.92, H - 0.32, z * 0.92);
        w.rotation.y = ry;
        g.add(w);
      }
    }
    // macerie: assi rotte e calcinacci
    if (d.debris) {
      for (let i = 0; i < 26; i++) {
        const plank = rnd() < 0.5;
        const m = new THREE.Mesh(plank ? new THREE.BoxGeometry(0.6 + rnd() * 0.8, 0.03, 0.1) : new THREE.DodecahedronGeometry(0.04 + rnd() * 0.08), std(plank ? 0x4d3a28 : 0x8a8478));
        const x = (rnd() - 0.5) * (W - 1), z = -D / 2 + 0.5 + rnd() * (D - 3.5);
        m.position.set(x, plank ? 0.02 + rnd() * 0.05 : 0.04, z);
        m.rotation.set(plank ? (rnd() - 0.5) * 0.3 : rnd() * 3, rnd() * 3, plank ? (rnd() - 0.5) * 0.3 : rnd() * 3);
        g.add(m);
      }
    }
    // polvere che fluttua nella luce
    if (d.dust) {
      const N = 500, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - 0.5) * W; pos[i * 3 + 1] = rnd() * H; pos[i * 3 + 2] = (rnd() - 0.5) * D; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd8cbb0, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false }));
      g.add(this.dust);
    } else this.dust = null;
    // torce alle pareti (fiamma che tremola)
    for (let i = 0; i < (d.torches || 0); i++) {
      const side = i % 2 ? 1 : -1, z = -D / 2 + 1.5 + Math.floor(i / 2) * ((D - 3) / Math.max(1, Math.ceil((d.torches) / 2)));
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.4, 8), std(0x3a2a1a));
      stick.position.set(side * (W / 2 - 0.12), 1.9, z); stick.rotation.z = side * 0.4;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), basic(0xffa040, { transparent: true, opacity: 0.9 }));
      flame.position.set(side * (W / 2 - 0.2), 2.15, z);
      const l = new THREE.PointLight(0xff9a40, 1.6, 6, 2);
      l.position.copy(flame.position);
      g.add(stick, flame, l);
      this.lightsFx.push({ light: l, flame, base: 1.6, kind: 'torch' });
    }
    // discoteca: luci colorate che girano e una sfera a specchi
    if (d.disco) {
      const cols = [0xff2a6d, 0x05d9e8, 0xfff700, 0x7b2ff7];
      cols.forEach((c, i) => {
        const l = new THREE.SpotLight(c, 6, 14, 0.45, 0.5, 1);
        l.position.set((i - 1.5) * 2, H - 0.1, -D / 4);
        g.add(l, l.target);
        this.lightsFx.push({ light: l, kind: 'disco', phase: i * 1.7, base: 6 });
      });
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1, flatShading: true }));
      ball.position.set(0, H - 0.6, -D / 4);
      g.add(ball);
      this.lightsFx.push({ obj: ball, kind: 'spin' });
    }
  }

  update(dt) {
    this.time += dt;
    // luci che sfarfallano (casa abbandonata), torce, discoteca
    const s = this.state;
    if (s.flicker && this.roomLights) {
      const on = Math.random() > s.flicker * 0.08 ? 1 : 0.15;
      for (const l of this.roomLights) l.intensity = l.userData.base * (0.75 + 0.25 * Math.sin(this.time * 23) * Math.sin(this.time * 7.3)) * on;
    }
    for (const fx of this.lightsFx || []) {
      if (fx.kind === 'torch') { const k = 0.8 + 0.2 * Math.sin(this.time * 17 + fx.base) * Math.sin(this.time * 5.3); fx.light.intensity = fx.base * k; fx.flame.scale.set(1, k, 1); }
      if (fx.kind === 'disco') { const a = this.time * 1.5 + fx.phase; fx.light.target.position.set(Math.sin(a) * 4, 0, -2 + Math.cos(a * 0.7) * 3); fx.light.intensity = fx.base * (0.5 + 0.5 * Math.max(0, Math.sin(this.time * 6 + fx.phase))); }
      if (fx.kind === 'spin') fx.obj.rotation.y += dt * 0.8;
    }
    if (this.dust) { this.dust.rotation.y += dt * 0.01; this.dust.position.y = Math.sin(this.time * 0.2) * 0.05; }
    for (const w of this.waters) w.material.uniforms.uTime.value = this.time;
    for (const f of this.floaters) {
      f.position.y = f.userData.base + Math.sin(this.time * 1.2 + f.userData.phase) * 0.02;
      f.rotation.z = Math.sin(this.time * 0.9 + f.userData.phase) * 0.02;
    }
  }
}

function paintingTex(rnd) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 200;
  const g = c.getContext('2d');
  const hue = Math.floor(rnd() * 360);
  const gr = g.createLinearGradient(0, 0, 0, 200);
  gr.addColorStop(0, `hsl(${hue},45%,70%)`); gr.addColorStop(1, `hsl(${(hue + 40) % 360},40%,35%)`);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 200);
  for (let k = 0; k < 7; k++) { g.fillStyle = `hsla(${(hue + k * 50) % 360},55%,${30 + rnd() * 40}%,0.8)`; g.beginPath(); g.ellipse(rnd() * 256, 80 + rnd() * 120, 20 + rnd() * 60, 10 + rnd() * 40, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _web = null;
function webTex() {
  if (_web) return _web;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.strokeStyle = 'rgba(235,235,235,0.9)'; g.lineWidth = 1.2;
  for (let a = 0; a < 8; a++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a / 8 * Math.PI / 2) * 256, Math.sin(a / 8 * Math.PI / 2) * 256); g.stroke(); }
  for (let r = 30; r < 256; r += 26) { g.beginPath(); for (let a = 0; a <= 8; a++) { const ang = (a / 8) * Math.PI / 2; const rr = r + Math.sin(a * 3) * 4; a ? g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : g.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); } g.stroke(); }
  _web = new THREE.CanvasTexture(c); return _web;
}
let _glass = null;
function stainedGlass() {
  if (_glass) return _glass;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d'); const cols = ['#c0392b', '#2e86de', '#f1c40f', '#27ae60', '#8e44ad'];
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 128; x += 32) { g.fillStyle = cols[(x / 32 + y / 32) % cols.length]; g.fillRect(x + 2, y + 2, 28, 28); }
  g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.moveTo(0, 256); g.lineTo(0, 64); g.arc(64, 64, 64, Math.PI, 0); g.lineTo(128, 256); g.fill();
  _glass = new THREE.CanvasTexture(c); _glass.colorSpace = THREE.SRGBColorSpace; return _glass;
}
