import * as THREE from 'three';
import { glowTexture } from './textures.js';

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
    label: 'spazio profondo', sky: 'sky_space.jpg', floor: 'none', fog: null, env: 0.2,
    hemi: [0x8090c0, 0.12], sun: [0xfff2e0, 1.4, [-0.8, 0.25, -0.5]], particles: 'dust',
    say: 'Benvenuto nello spazio profondo.',
  },
  acqua: {
    label: "sott'acqua", sky: 'sky_underwater.jpg', floor: 'floor_sand.jpg', fog: [0x0b4a68, 0.07], env: 0.35,
    hemi: [0x7fd0ff, 0.7], sun: [0x9fe6ff, 1.1, [0.1, 1, 0.2]], particles: 'bubbles',
    say: "Siamo sott'acqua. Guarda le bolle.",
  },
  tramonto: {
    label: 'tramonto nel deserto', sky: 'sky_sunset.jpg', floor: 'floor_sand.jpg', fog: [0x3a1e2a, 0.025], env: 0.4,
    hemi: [0xffb080, 0.45], sun: [0xffa060, 2.2, [-0.9, 0.25, 0.3]], particles: 'dust',
    say: 'Tramonto nel deserto.',
  },
  aurora: {
    label: 'aurora boreale', sky: 'sky_aurora.jpg', floor: 'floor_snow.jpg', fog: [0x0a1620, 0.035], env: 0.25,
    hemi: [0x60ffc0, 0.3], sun: [0x80c0ff, 0.5, [0.2, 1, -0.6]], particles: 'snow',
    say: "Ecco l'aurora boreale. Sta nevicando.",
  },
};

export const THEME_ORDER = ['buio', 'spazio', 'acqua', 'tramonto', 'aurora'];

const ASSETS = './assets/';

export class ThemeManager {
  constructor(scene, env) {
    this.scene = scene;
    this.env = env;
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
    const key = name + (repeat || '');
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

    scene.background = th.sky ? this.texture(th.sky) : new THREE.Color(0x000000);
    scene.fog = th.fog ? new THREE.FogExp2(th.fog[0], th.fog[1]) : null;
    scene.environmentIntensity = th.env;
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
    env.floor.visible = th.floor !== 'none';
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

  update(dt) {
    if (!this.mode) return;
    this.time += dt;
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
