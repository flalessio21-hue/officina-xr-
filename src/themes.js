import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { SkyBaker } from './sky.js';
import { buildWorld } from './worlds.js';

/**
 * Ambienti: cielo a 360°, pavimento, nebbia, luci e particelle.
 * Le immagini sono le stesse dell'app per il Quest (generate al computer).
 */
export const THEMES = {
  buio: {
    label: 'buio', sky: null, floor: null, fog: [0x000000, 0.055], env: 0.18,
    hemi: [0x9fb4d0, 0.08], sun: null, particles: null,
    say: 'Torniamo al buio.',
  },
  spazio: {
    label: 'spazio profondo', sky: 'sky_space.jpg', floor: 'none', fog: null, env: 0.6,
    hemi: [0x8090c0, 0.35], sun: [0xfff2e0, 2.2, [-0.75, 0.22, -0.62]], particles: 'dust',
    say: 'Benvenuto nello spazio profondo.',
  },
  acqua: {
    label: "sott'acqua", sky: 'sky_underwater.jpg', floor: 'floor_sand.jpg', fog: [0x06384f, 0.045], env: 0.6,
    hemi: [0x7fd0ff, 0.8], sun: [0x9fe6ff, 1.4, [0.1, 1, 0.2]], particles: 'bubbles',
    say: "Siamo sott'acqua. Guarda le bolle.",
  },
  tramonto: {
    label: 'tramonto nel deserto', sky: 'sky_sunset.jpg', floor: 'floor_sand.jpg', fog: [0x9a6050, 0.005], env: 0.7,
    hemi: [0xffb080, 0.5], sun: [0xffa060, 2.6, [-0.92, 0.12, 0.32]], particles: 'dust',
    say: 'Tramonto nel deserto.',
  },
  aurora: {
    label: 'aurora boreale', sky: 'sky_aurora.jpg', floor: 'floor_snow.jpg', fog: [0x0a1620, 0.008], env: 0.5,
    hemi: [0x60ffc0, 0.35], sun: [0x9fc8ff, 0.7, [0.55, 0.42, -0.72]], particles: 'snow',
    say: "Ecco l'aurora boreale. Sta nevicando.",
  },
};

export const THEME_ORDER = ['buio', 'spazio', 'acqua', 'tramonto', 'aurora'];

const ASSETS = './assets/';

export class ThemeManager {
  constructor(scene, env, renderer) {
    this.scene = scene;
    this.env = env;
    this.baker = renderer ? new SkyBaker(renderer) : null;
    this.roomEnv = scene.environment;
    this.worlds = new Map();
    this.current = 'buio';
    this.loader = new THREE.TextureLoader();
    this.cache = new Map();

    const fm = env.floor.material;
    this.floorDefault = { color: fm.color.clone(), map: fm.map, roughness: fm.roughness, roughnessMap: fm.roughnessMap };

    this.sun = new THREE.DirectionalLight(0xffffff, 0);
    this.sun.position.set(0, 10, 0);
    scene.add(this.sun, this.sun.target);

    // particelle: bolle, neve o pulviscolo intorno a te
    const N = 400;
    const pos = new Float32Array(N * 3);
    this.seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.resetParticle(pos, i, true);
      this.seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: glowTexture(), size: 0.03, transparent: true, depthWrite: false, opacity: 0.8,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.time = 0;
  }

  resetParticle(arr, i, anyHeight) {
    arr[i * 3] = Math.random() * 12 - 6;
    arr[i * 3 + 1] = anyHeight ? Math.random() * 5 : 0;
    arr[i * 3 + 2] = Math.random() * 14 - 10;
  }

  texture(name, repeat) {
    const key = name + (repeat || '') + (repeat === 1 ? Math.random() : '');
    if (!this.cache.has(key)) {
      const t = this.loader.load(ASSETS + name);
      t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        t.anisotropy = 8;
      } else {
        t.mapping = THREE.EquirectangularReflectionMapping;
      }
      this.cache.set(key, t);
    }
    return this.cache.get(key);
  }

  /** Riconosce un ambiente in una frase ("portami nello spazio", "sott'acqua"…). */
  static fromText(t) {
    const rules = [
      ['acqua', /sott'? ?acqua|subacque|oceano|fondale|abissi|\bmare\b/],
      ['spazio', /spazio|stelle|galassi|universo|cosmo/],
      ['tramonto', /tramonto|desert|dune/],
      ['aurora', /aurora|polo nord|artic|nevica|\bneve\b/],
      ['buio', /\bbuio\b|tutto nero|\bnero\b|vuoto|ambiente iniziale|come prima/],
    ];
    return rules.find(([, re]) => re.test(t))?.[0] || null;
  }

  apply(id) {
    const th = THEMES[id];
    if (!th) return false;
    this.current = id;
    const { scene, env } = this;

    // cielo procedurale ad alta risoluzione (anche come riflesso sugli oggetti)
    const sky = this.baker?.get(id);
    scene.background = sky ? sky.background : (th.sky ? this.texture(th.sky) : new THREE.Color(0x000000));
    scene.environment = sky ? sky.environment : this.roomEnv;
    scene.fog = th.fog ? new THREE.FogExp2(th.fog[0], th.fog[1]) : null;
    scene.environmentIntensity = th.env;

    // scenografia dell'ambiente (costruita la prima volta che serve)
    if (id !== 'buio' && !this.worlds.has(id)) {
      const w = buildWorld(id, (name) => this.texture(name, 1));
      if (w) { this.worlds.set(id, w); scene.add(w.group); }
    }
    for (const [wid, w] of this.worlds) w.group.visible = wid === id;
    this.world = this.worlds.get(id) || null;
    env.hemi.color.setHex(th.hemi[0]);
    env.hemi.intensity = th.hemi[1];

    if (th.sun) {
      this.sun.color.setHex(th.sun[0]);
      this.sun.intensity = th.sun[1];
      this.sun.position.set(...th.sun[2]).normalize().multiplyScalar(10);
    } else {
      this.sun.intensity = 0;
    }

    const fm = env.floor.material;
    // il pavimento piatto resta solo nel buio (negli altri ambienti c'è il terreno);
    // anche nascosto serve per il teletrasporto
    env.floor.visible = id === 'buio';
    if (th.floor && th.floor !== 'none') {
      fm.map = this.texture(th.floor, 40);
      fm.color.setHex(0x8a8070);
      fm.roughness = 1;
      fm.roughnessMap = null;
    } else {
      fm.map = this.floorDefault.map;
      fm.color.copy(this.floorDefault.color);
      fm.roughness = this.floorDefault.roughness;
      fm.roughnessMap = this.floorDefault.roughnessMap;
    }
    fm.needsUpdate = true;

    const pm = this.points.material;
    this.points.visible = !!th.particles;
    this.mode = th.particles;
    if (th.particles === 'bubbles') { pm.color.setHex(0xbfefff); pm.size = 0.035; pm.opacity = 0.55; }
    if (th.particles === 'snow') { pm.color.setHex(0xffffff); pm.size = 0.03; pm.opacity = 0.9; }
    if (th.particles === 'dust') { pm.color.setHex(0xffe8c8); pm.size = 0.015; pm.opacity = 0.6; }
    return true;
  }

  /**
   * Prepara in anticipo cieli e scenografie (mentre sei nella pagina iniziale),
   * così cambiare ambiente in VR non blocca l'immagine.
   */
  async prewarm(renderer, camera) {
    for (const id of THEME_ORDER) {
      if (id === 'buio' || renderer.xr.isPresenting) continue;
      await new Promise((r) => setTimeout(r, 120));
      this.baker?.get(id);
      if (!this.worlds.has(id)) {
        const w = buildWorld(id, (name) => this.texture(name, 1));
        if (!w) continue;
        this.worlds.set(id, w);
        this.scene.add(w.group);
        w.group.visible = true; // la compilazione considera solo ciò che è visibile
        try { await renderer.compileAsync(w.group, camera, this.scene); } catch { /* facoltativo */ }
        w.group.visible = id === this.current;
      }
    }
  }

  /** Nasconde/mostra la scenografia (in realtà mista si vede la stanza vera). */
  setDressingVisible(v) {
    for (const [wid, w] of this.worlds) w.group.visible = v && wid === this.current;
  }

  update(dt) {
    this.time += dt;
    if (this.world?.group.visible) for (const f of this.world.tick) f(dt, this.time);
    if (!this.mode) return;
    const attr = this.points.geometry.attributes.position;
    const a = attr.array;
    for (let i = 0; i < this.seed.length; i++) {
      const s = this.seed[i];
      const w = this.time * (0.6 + s) + s * 30;
      if (this.mode === 'bubbles') {
        a[i * 3 + 1] += dt * (0.25 + s * 0.35);
        a[i * 3] += Math.sin(w * 2) * dt * 0.08;
        if (a[i * 3 + 1] > 5) this.resetParticle(a, i, false);
      } else if (this.mode === 'snow') {
        a[i * 3 + 1] -= dt * (0.15 + s * 0.2);
        a[i * 3] += Math.sin(w) * dt * 0.12;
        if (a[i * 3 + 1] < 0) { this.resetParticle(a, i, true); a[i * 3 + 1] = 5; }
      } else {
        a[i * 3] += Math.sin(w * 0.3) * dt * 0.03;
        a[i * 3 + 1] += Math.cos(w * 0.25) * dt * 0.02;
      }
    }
    attr.needsUpdate = true;
  }
}
