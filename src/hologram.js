import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * L'AI come ologramma sulla scrivania: volto di ragazza (modello "Face Cap" dagli esempi
 * di three.js, con le 52 espressioni ARKit), collo, spalle e capelli, tutto in luce azzurra.
 * Parla muovendo le labbra, sbatte le palpebre e ti guarda.
 */
const HOLO_VERT = /* glsl */`
#include <common>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
varying vec3 vView;
varying vec3 vWorld;
varying vec2 vUv2;
void main() {
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <defaultnormal_vertex>
  #include <normal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <project_vertex>
  vView = -mvPosition.xyz;
  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vUv2 = uv;
}`;

const HOLO_FRAG = /* glsl */`
#include <normal_pars_fragment>
uniform float uTime;
uniform float uLevel;
uniform float uBaseY;
uniform float uGlitch;
uniform vec3 uColor;
uniform float uStrands;
uniform float uBody;
uniform float uGain;
uniform sampler2D uMap;
uniform float uUseMap;
varying vec3 vView;
varying vec3 vWorld;
varying vec2 vUv2;
float h(float n){ return fract(sin(n) * 43758.5453); }
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  float facing = abs(dot(N, V));
  float rim = pow(1.0 - facing, 2.2);
  // luce morbida da davanti in alto: dà volume al viso
  float key = max(dot(N, normalize(vec3(-0.35, 0.55, 0.75))), 0.0);
  float fill = max(dot(N, normalize(vec3(0.6, 0.1, 0.8))), 0.0);
  float shade = 0.35 + 0.75 * key + 0.25 * fill;
  // dettagli veri del volto (occhi, sopracciglia, labbra) dalla sua texture, in luce azzurra
  vec3 tex = texture2D(uMap, vUv2).rgb;
  float lum = dot(tex, vec3(0.299, 0.587, 0.114));
  float detail = mix(1.0, 0.3 + 1.1 * smoothstep(0.05, 0.85, lum), uUseMap);
  // linee di scansione sottili che scorrono verso l'alto
  float scan = 0.86 + 0.14 * sin(vWorld.y * 1500.0 - uTime * 6.0);
  float band = smoothstep(0.0, 0.015, abs(fract(vWorld.y * 3.0 - uTime * 0.35) - 0.5) - 0.47);
  float flick = 0.92 + 0.08 * sin(uTime * 37.0) * sin(uTime * 13.0);
  float strands = mix(1.0, 0.55 + 0.45 * sin(vUv2.x * 260.0 + sin(vUv2.y * 9.0) * 2.0), uStrands);
  // il corpo svanisce verso il basso
  float fade = mix(1.0, smoothstep(uBaseY, uBaseY + 0.09, vWorld.y), uBody);
  float energy = (0.55 + 0.9 * uLevel) * uGain;
  vec3 col = uColor * (mix(0.18 * facing, 0.42 * shade * detail, uUseMap) + 1.1 * rim * mix(1.0, smoothstep(0.15, 0.6, lum), uUseMap)) * scan * flick * strands * energy;
  col += vec3(0.85, 0.95, 1.0) * pow(key, 12.0) * 0.25 * uUseMap * energy; // riflesso morbido
  col += uColor * band * 0.6;
  col += vec3(1.0, 0.3, 0.6) * uGlitch * 0.35 * h(floor(vWorld.y * 200.0) + uTime);
  gl_FragColor = vec4(col * fade, 1.0);
}`;

function holoMaterial(shared, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime, uLevel: shared.uLevel, uBaseY: shared.uBaseY, uGlitch: shared.uGlitch, uColor: shared.uColor,
      uStrands: { value: extra.strands ? 1 : 0 },
      uBody: { value: extra.body ? 1 : 0 },
      uGain: { value: extra.gain ?? 1 },
      uMap: { value: extra.map || null },
      uUseMap: { value: extra.map ? 1 : 0 },
    },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: extra.side ?? THREE.FrontSide,
    fog: false,
  });
}

export class Hologram {
  /**
   * @param parent gruppo della scrivania (l'ologramma si muove con lei)
   * @param position punto sul piano della scrivania dove sta il proiettore (coordinate di parent)
   */
  constructor(parent, position, renderer) {
    this.root = new THREE.Group();
    this.root.name = 'ologramma';
    this.root.position.copy(position);
    parent.add(this.root);
    this.renderer = renderer;
    this.shared = {
      uTime: { value: 0 }, uLevel: { value: 0 }, uBaseY: { value: 0 }, uGlitch: { value: 0 },
      uColor: { value: new THREE.Color(0.35, 0.8, 1.0) },
    };
    this.headHeight = 0.17; // altezza del volto (m)
    this.headY = 0.33; // centro del volto sopra il piano della scrivania
    this.time = 0;
    this.blink = { next: 2.5, t: -1 };
    this.glitch = { next: 4, t: 0 };
    this.look = new THREE.Euler();
    this.buildProjector();
  }

  buildProjector() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.3, metalness: 0.85 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.022, 48), metal);
    base.position.y = 0.011;
    base.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.004, 10, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fd0ff, toneMapped: false }));
    ring.position.y = 0.023;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.045, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false, transparent: true, opacity: 0.85 }));
    lens.position.y = 0.0225;
    // cono di luce dal proiettore al volto
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.shared.uTime, uLevel: this.shared.uLevel, uColor: this.shared.uColor },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uTime; uniform float uLevel; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float up = pow(1.0 - vUv.y, 1.3);
          float rays = 0.6 + 0.4 * sin(vUv.x * 60.0 + uTime * 2.0) * sin(vUv.x * 23.0 - uTime);
          gl_FragColor = vec4(uColor * edge * up * rays * (0.12 + 0.12 * uLevel), 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const beamH = 0.13; // il fascio sale fino alla bolla
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.045, beamH, 48, 1, true), this.beamMat);
    beam.position.y = 0.023 + beamH / 2;
    // particelle di luce che salgono
    const N = 60;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.06;
      pos.set([Math.cos(a) * r, Math.random() * beamH, Math.sin(a) * r], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9fe8ff, size: 0.004, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.motes.position.y = 0.023;
    this.beamH = beamH;
    this.light = new THREE.PointLight(0x5fd0ff, 0.15, 1.2, 2);
    this.light.position.y = 0.15;
    this.root.add(base, ring, lens, beam, this.motes, this.light);
  }

  async load(url) {
    const ktx2 = new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/').detectSupport(this.renderer);
    const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    const model = gltf.scene;
    this.figure = new THREE.Group();
    this.root.add(this.figure);

    // proporzioni: il volto alto ~17 cm, centrato sopra il proiettore
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const k = this.headHeight / size.y;
    model.scale.setScalar(k);
    model.position.set(-center.x * k, -center.y * k, -center.z * k);
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = this.headY;
    this.headPivot.add(model);
    this.figure.add(this.headPivot);

    model.traverse((o) => {
      if (!o.isMesh) return;
      const map = o.material.map || null;
      if (map) { map.colorSpace = THREE.NoColorSpace; map.anisotropy = 4; }
      // occhi e denti più tenui: altrimenti sembrano occhiali e un sorriso troppo acceso
      const small = o.geometry.attributes.position.count < 1000;
      // denti e lingua: nell'ologramma fanno un rettangolo luminoso sulla bocca
      if (o.name === 'mesh_3') { o.visible = false; return; }
      o.material = holoMaterial(this.shared, { gain: small ? 0.35 : 1.25, map });
      o.frustumCulled = false;
      if (o.morphTargetDictionary && o.morphTargetDictionary.jawOpen !== undefined) this.face = o;
    });
    this.dict = this.face?.morphTargetDictionary || {};

    // collo e spalle
    const w = size.x * k, d = size.z * k;
    const profile = [
      [0.0, -0.17], [0.07, -0.17], [0.115, -0.155], [0.125, -0.13], [0.11, -0.105], [0.06, -0.09], [0.034, -0.075], [0.03, -0.02], [0.028, 0.0],
    ].map(([r, y]) => new THREE.Vector2(r * (w / 0.13), y));
    const bust = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), holoMaterial(this.shared, { body: true, gain: 0.8 }));
    bust.scale.set(0.95, 1, 0.5 * (d / w) * 1.6);
    bust.position.y = this.headY - this.headHeight * 0.42;
    this.figure.add(bust);

    // capelli lunghi: calotta aderente alla testa vera + tante ciocche sottili che scendono morbide
    const hairMat = holoMaterial(this.shared, { strands: true, side: THREE.FrontSide, gain: 0.3 });
    const strandMat = holoMaterial(this.shared, { gain: 0.5 });
    this.headPivot.updateMatrixWorld(true);
    const fb = new THREE.Box3();
    if (this.face) {
      const inv = new THREE.Matrix4().copy(this.headPivot.matrixWorld).invert();
      const g = this.face.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      fb.copy(g.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, this.face.matrixWorld));
    } else fb.set(new THREE.Vector3(-w / 2, -this.headHeight / 2, -d / 2), new THREE.Vector3(w / 2, this.headHeight / 2, d / 2));
    const fc = fb.getCenter(new THREE.Vector3()), fs = fb.getSize(new THREE.Vector3());
    const rx = fs.x * 0.5 * 1.1, rz = fs.z * 0.5 * 1.15, hh = fs.y;
    const capY = fc.y - hh * 0.02; // centro della calotta, la sommità sfiora la fronte
    const capH = fb.max.y - capY - hh * 0.06;
    const capZ = fc.z - fs.z * 0.04;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
    cap.scale.set(rx, capH, rz);
    cap.position.set(fc.x, capY, capZ);
    this.hair = new THREE.Group();
    this.hair.add(cap);
    const curves = [];
    const N = 150;
    for (let i = 0; i < N; i++) {
      // ciocche distribuite dietro e ai lati (0 = dietro la nuca)
      const a = (i / (N - 1) - 0.5) * 3.2 + (Math.random() - 0.5) * 0.05; // ±92°: dietro e fino alle orecchie
      const side = Math.abs(a) > 1.2; // ai lati del viso
      const polar = 0.28 + Math.random() * 0.12;
      const sx = Math.sin(a), sz = -Math.cos(a);
      const top = new THREE.Vector3(fc.x + sx * Math.sin(polar * Math.PI) * rx, capY + Math.cos(polar * Math.PI) * capH, capZ + sz * Math.sin(polar * Math.PI) * rz);
      const len = side ? hh * (0.9 + Math.random() * 0.3) : hh * (1.15 + Math.random() * 0.35);
      const pts = [top];
      const steps = 5;
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        const out = 1.0 + 0.1 * Math.sin(f * Math.PI * 0.7) + f * f * 0.25; // aderenti alla testa, più larghi sulle spalle
        const wave = Math.sin(f * 6 + i * 0.7) * 0.003;
        pts.push(new THREE.Vector3(
          fc.x + sx * rx * out + wave,
          top.y - len * f,
          capZ + Math.min(sz * rz * out, -rz * 0.1) - f * 0.015,
        ));
      }
      curves.push(new THREE.CatmullRomCurve3(pts));
    }
    const strandGeo = curves.map((c, i) => new THREE.TubeGeometry(c, 24, 0.0011 + (i % 3) * 0.0004, 5, false));
    for (const g of strandGeo) this.hair.add(new THREE.Mesh(g, strandMat));
    this.headPivot.add(this.hair);

    this.shared.uBaseY.value = 0;
    return this;
  }

  setMorph(name, v) {
    const i = this.dict[name];
    if (i !== undefined) this.face.morphTargetInfluences[i] = v;
  }

  /** level: luminosità/voce dell'AI (0..1), state: 'idle' | 'speaking' | 'listening'. */
  update(dt, { level = 0, state = 'idle', camera } = {}) {
    this.time += dt;
    const t = this.time;
    this.shared.uTime.value = t;
    this.shared.uLevel.value = THREE.MathUtils.clamp(level, 0, 1.2);
    this.root.updateWorldMatrix(true, false);
    this.shared.uBaseY.value = this.root.getWorldPosition(new THREE.Vector3()).y + this.headY - this.headHeight * 0.42 - 0.17;
    this.shared.uColor.value.setRGB(state === 'listening' ? 0.55 : 0.35, state === 'listening' ? 0.85 : 0.8, 1.0);
    this.light.intensity = 0.12 + level * 0.35;

    // particelle che salgono
    const p = this.motes.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * (0.04 + (i % 7) * 0.008);
      if (y > this.beamH) y = 0;
      p.setY(i, y);
    }
    p.needsUpdate = true;

    // piccoli disturbi ogni tanto
    this.glitch.next -= dt;
    if (this.glitch.next < 0) { this.glitch.t = 0.12; this.glitch.next = 3 + Math.random() * 6; }
    this.glitch.t = Math.max(0, this.glitch.t - dt);
    this.shared.uGlitch.value = this.glitch.t > 0 ? 1 : 0;
    if (this.figure) this.figure.position.x = this.glitch.t > 0 ? (Math.random() - 0.5) * 0.004 : 0;

    if (!this.face) return;
    // bocca: segue la voce
    const speak = state === 'speaking';
    const jaw = speak ? THREE.MathUtils.clamp((level - 0.3) * 0.9 + Math.sin(t * 17) * 0.05, 0, 0.55) : 0;
    this.jaw = THREE.MathUtils.lerp(this.jaw || 0, jaw, 1 - Math.exp(-dt * 25));
    this.setMorph('jawOpen', this.jaw);
    this.setMorph('mouthFunnel', speak ? 0.15 + 0.15 * Math.sin(t * 5.3) : 0);
    this.setMorph('mouthClose', speak ? 0 : 0.05);
    this.setMorph('mouthSmile_L', 0.12);
    this.setMorph('mouthSmile_R', 0.12);
    this.setMorph('browInnerUp', state === 'listening' ? 0.5 : 0.1 + (speak ? 0.15 * Math.max(0, Math.sin(t * 2.1)) : 0));
    this.setMorph('cheekSquint_L', 0.15);
    this.setMorph('cheekSquint_R', 0.15);

    // battito di ciglia
    this.blink.next -= dt;
    if (this.blink.next < 0 && this.blink.t < 0) { this.blink.t = 0; this.blink.next = 2.5 + Math.random() * 3.5; }
    let b = 0;
    if (this.blink.t >= 0) {
      this.blink.t += dt;
      b = Math.sin(Math.min(1, this.blink.t / 0.16) * Math.PI);
      if (this.blink.t > 0.16) this.blink.t = -1;
    }
    this.setMorph('eyeBlink_L', b);
    this.setMorph('eyeBlink_R', b);

    // guarda verso di te (con calma) e respira
    if (camera) {
      const cam = camera.getWorldPosition(new THREE.Vector3());
      const head = this.headPivot.getWorldPosition(new THREE.Vector3());
      const local = this.root.worldToLocal(cam.clone()).sub(this.headPivot.position);
      const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.7, 0.7);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.35, 0.35);
      void head;
      const k = 1 - Math.exp(-dt * 3);
      this.look.y += (yaw + Math.sin(t * 0.4) * 0.05 - this.look.y) * k;
      this.look.x += (pitch + Math.sin(t * 0.7) * 0.02 - this.look.x) * k;
      this.headPivot.rotation.set(this.look.x, this.look.y, Math.sin(t * 0.5) * 0.03);
    }
    this.headPivot.position.y = this.headY + Math.sin(t * 1.3) * 0.003;
  }
}
