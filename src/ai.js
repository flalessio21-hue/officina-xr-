import * as THREE from 'three';
import { glowTexture } from './textures.js';

const SNOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const CORE_R = 0.22;

function coreMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uLevel;
      varying vec3 vN; varying vec3 vView; varying vec3 vPos; varying float vDisp;
      ${SNOISE}
      void main(){
        vec3 n = normalize(position);
        float a = snoise(n*1.7 + vec3(0.0, uTime*0.32, uTime*0.21));
        float b = snoise(n*4.2 - vec3(uTime*0.7, 0.0, uTime*0.5));
        float d = (a*0.75 + b*0.25) * (0.012 + uLevel*0.045);
        vDisp = d / ${CORE_R.toFixed(2)};
        vec3 p = position + n * d;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = normalize(-mv.xyz);
        vN = normalize(normalMatrix * n);
        vPos = n;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uLevel; uniform vec3 uColor; uniform vec3 uHot;
      varying vec3 vN; varying vec3 vView; varying vec3 vPos; varying float vDisp;
      ${SNOISE}
      void main(){
        float facing = clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0);
        float s1 = snoise(vPos*2.6 + vec3(0.0, uTime*0.45, uTime*0.25))*0.5+0.5;
        float s2 = snoise(vPos*7.0 - vec3(uTime*0.8, uTime*0.3, 0.0))*0.5+0.5;
        float plasma = smoothstep(0.3, 1.0, s1*0.65 + s2*0.35);
        float energy = 0.55 + uLevel*1.6;
        float core = pow(facing, 2.2);
        vec3 col = mix(uColor, uHot, core * (0.7 + 0.3*plasma));
        col += uHot * pow(facing, 6.0) * (0.4 + uLevel);
        col += uColor * pow(1.0 - facing, 2.0) * 0.6;
        col *= energy * (0.85 + 0.3*plasma + vDisp*2.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function shellMaterial(uniforms, power, gain) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vView;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz); vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uLevel; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vView;
      void main(){
        float f = pow(clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0), ${power.toFixed(1)});
        float a = f * (0.08 + uLevel * ${gain.toFixed(2)});
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

function motesMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uLevel;
      attribute float aSeed;
      varying float vAlpha;
      void main(){
        float t = uTime * (0.15 + aSeed*0.1);
        vec3 p = position + vec3(sin(t + aSeed*31.0), cos(t*0.8 + aSeed*17.0), sin(t*0.6 + aSeed*7.0)) * 0.25;
        p *= 1.0 + uLevel * 0.08 * sin(uTime*2.0 + aSeed*12.0);
        float r = length(p);
        vAlpha = (0.06 + uLevel*0.9) / (1.0 + r*r*1.4) * (0.4 + 0.6*fract(aSeed*13.7));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + aSeed*3.0) * 220.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vAlpha;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

// rumore 1D liscio per il "ritmo delle sillabe"
const h1 = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const vnoise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i) + (h1(i + 1) - h1(i)) * u; };

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const PALETTE = {
  idle: { color: new THREE.Color(0.08, 0.32, 1.0), hot: new THREE.Color(0.55, 0.8, 1.0) },
  speak: { color: new THREE.Color(0.2, 0.6, 1.0), hot: new THREE.Color(1.0, 1.0, 1.0) },
  listen: { color: new THREE.Color(1.0, 0.45, 0.08), hot: new THREE.Color(1.0, 0.92, 0.75) },
};

/**
 * L'AI: una sfera di energia sospesa nel buio. Quando parla si accende con un
 * inviluppo a molla (attacco/rilascio morbidi) guidato dal ritmo delle parole,
 * illumina il pavimento e smuove il pulviscolo intorno.
 */
export class AIOrb {
  constructor(scene) {
    this.group = new THREE.Group();
    this.base = new THREE.Vector3(0, 1.75, -9);
    this.group.position.copy(this.base);
    scene.add(this.group);

    this.uniforms = {
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uColor: { value: PALETTE.idle.color.clone() },
      uHot: { value: PALETTE.idle.hot.clone() },
    };
    this.core = new THREE.Mesh(new THREE.SphereGeometry(CORE_R, 96, 64), coreMaterial(this.uniforms));
    this.group.add(this.core);
    this.inner = new THREE.Mesh(new THREE.SphereGeometry(CORE_R * 1.45, 48, 32), shellMaterial(this.uniforms, 2.0, 0.55));
    this.outer = new THREE.Mesh(new THREE.SphereGeometry(CORE_R * 3.2, 48, 32), shellMaterial(this.uniforms, 3.0, 0.22));
    this.group.add(this.inner, this.outer);

    const tex = glowTexture();
    const sprite = (scale) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0x5fb8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false,
      }));
      s.scale.setScalar(scale);
      this.group.add(s);
      return s;
    };
    this.glow = sprite(2);
    this.halo = sprite(8);

    const N = 600;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 0.35 + Math.pow(Math.random(), 1.6) * 3.2;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.motes = new THREE.Points(geo, motesMaterial(this.uniforms));
    this.motes.frustumCulled = false;
    this.group.add(this.motes);

    // luce reale: illumina il pavimento sotto di sé
    this.light = new THREE.PointLight(0x5fb8ff, 0, 0, 2);
    this.group.add(this.light);

    // sottotitoli
    this.subCanvas = document.createElement('canvas');
    this.subCanvas.width = 2048; this.subCanvas.height = 320;
    this.subTex = new THREE.CanvasTexture(this.subCanvas);
    this.subTex.colorSpace = THREE.SRGBColorSpace;
    this.subTex.generateMipmaps = false;
    this.subTex.minFilter = THREE.LinearFilter;
    this.subtitle = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 0.75),
      new THREE.MeshBasicMaterial({ map: this.subTex, transparent: true, depthWrite: false, opacity: 0, toneMapped: false, fog: false })
    );
    this.subtitle.position.y = -0.95;
    this.group.add(this.subtitle);

    this.level = 0;
    this.vel = 0;
    this.impulse = 0;
    this.speaking = false;
    this.listening = false;
    this.speakUntil = 0;
    this.subTimer = 0;
    this.onHeard = null;
    this.onText = null;
    this.voice = null;
    this.canListen = !!Recognition;
    this.tmpColor = new THREE.Color();

    if ('speechSynthesis' in window) {
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        // voce maschile italiana se c'è (Luca, Cosimo, Diego, Giuseppe…), altrimenti una italiana qualsiasi
        const it = voices.filter((v) => v.lang?.toLowerCase().startsWith('it'));
        const male = /\b(male|uomo|maschile|luca|cosimo|diego|giuseppe|paolo|roberto|marco|giorgio|federico)\b/i;
        const female = /female|donna|alice|elsa|federica|paola|isabella|chiara|bianca|carla|lucia|google italiano/i;
        this.voice = it.find((v) => male.test(v.name) && !female.test(v.name)) || it[0] || null;
      };
      pick();
      speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }

  get pitch() {
    if (this._pitch == null) {
      let v = NaN;
      try { v = parseFloat(localStorage.getItem('officina-pitch')); } catch { /* niente */ }
      this._pitch = Number.isFinite(v) ? v : 1.3;
    }
    return this._pitch;
  }

  changePitch(delta) {
    this._pitch = Math.min(2, Math.max(0.6, this.pitch + delta));
    try { localStorage.setItem('officina-pitch', String(this._pitch)); } catch { /* niente */ }
    return this._pitch;
  }

  setSubtitle(text) {
    const g = this.subCanvas.getContext('2d');
    const W = this.subCanvas.width, H = this.subCanvas.height;
    g.clearRect(0, 0, W, H);
    g.font = '500 84px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = [];
    let line = '';
    for (const w of text.split(/\s+/)) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > W - 120 && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(-2);
    g.fillStyle = 'rgba(190, 225, 255, 0.95)';
    g.shadowColor = 'rgba(60, 140, 255, 0.8)';
    g.shadowBlur = 24;
    shown.forEach((l, i) => g.fillText(l, W / 2, H / 2 + (i - (shown.length - 1) / 2) * 110));
    this.subTex.needsUpdate = true;
    this.subTimer = 4;
  }

  /** Ciò che si dice a voce resta breve: la prima frase, al massimo ~110 caratteri. */
  static brief(text) {
    let t = String(text || '').replace(/\s+/g, ' ').trim();
    const first = t.match(/^.*?[.!?](\s|$)/);
    if (first && first[0].trim().length >= 6) t = first[0].trim();
    if (t.length > 110) {
      const cut = t.lastIndexOf(',', 110);
      t = (cut > 40 ? t.slice(0, cut) : t.slice(0, t.lastIndexOf(' ', 110))) + '.';
    }
    return t;
  }

  say(text, { full = false } = {}) {
    if (!full) text = AIOrb.brief(text);
    this.onText?.(text);
    this.setSubtitle(text);
    this.speakUntil = performance.now() / 1000 + 0.8 + text.length * 0.065;
    this.speaking = true;
    if (this.neural?.ready) {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      this.neuralSpeaking = true;
      this.speakUntil = performance.now() / 1000 + 60;
      const gen = (this.sayGen = (this.sayGen || 0) + 1);
      this.neural.speak(text, { pitch: this.neuralSpeed || 1 }).finally(() => {
        if (gen !== this.sayGen) return;
        this.neuralSpeaking = false;
        this.speaking = false;
        this.subTimer = 2.5;
      });
      return;
    }
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT';
    if (this.voice) u.voice = this.voice;
    u.rate = 1.03;
    u.pitch = this.pitch; // voce maschile acuta, regolabile
    let started = false;
    u.onstart = () => { started = true; this.speaking = true; };
    u.onend = () => {
      if (!started) { this.ttsFailed = true; return; } // finita senza mai partire: simula
      this.speaking = false;
      this.subTimer = 2.5;
    };
    // se la voce non è disponibile, la luce "parla" comunque per la durata stimata
    u.onerror = () => { this.ttsFailed = true; };
    this.ttsFailed = false;
    u.onboundary = () => { this.impulse = 1; };
    speechSynthesis.speak(u);
  }

  stopSpeaking() {
    this.sayGen = (this.sayGen || 0) + 1;
    this.neural?.cancel();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.neuralSpeaking = false;
    this.speaking = false;
  }

  listen() {
    if (!Recognition) {
      this.say('Il riconoscimento vocale non è disponibile in questo browser. Usa i pulsanti del pannello, oppure scrivimi dalla casella di testo.');
      return;
    }
    if (this.listening) { this.rec?.stop(); return; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.speaking = false;
    const rec = new Recognition();
    rec.lang = 'it-IT';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      this.setSubtitle(`“${r[0].transcript}”`);
      this.impulse = 0.6;
      if (r.isFinal) finalText = r[0].transcript;
    };
    rec.onerror = (e) => {
      this.listening = false;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.say('Non ho accesso al microfono.');
    };
    rec.onend = () => {
      this.listening = false;
      if (finalText) this.onHeard?.(finalText);
    };
    this.rec = rec;
    try {
      rec.start();
      this.listening = true;
      this.setSubtitle('Ti ascolto…');
    } catch {
      this.listening = false;
    }
  }

  update(dt, t, camera) {
    if (camera) {
      camera.getWorldPosition(this.tmpV ||= new THREE.Vector3());
      this.subtitle.lookAt(this.tmpV);
    }
    const now = performance.now() / 1000;
    if (this.speaking && !this.neuralSpeaking && now > this.speakUntil + 4) this.speaking = false;
    if (this.speaking && (this.ttsFailed || !('speechSynthesis' in window)) && now > this.speakUntil) {
      this.speaking = false;
      this.subTimer = 2.5;
    }

    // obiettivo dell'inviluppo
    let target;
    if (this.speaking) {
      const syll = 0.6 * vnoise1(t * 6.2) + 0.4 * vnoise1(t * 2.4 + 10);
      target = this.neuralSpeaking
        ? 0.2 + 0.9 * this.neural.level()
        : 0.38 + 0.62 * Math.pow(syll, 1.3) + this.impulse * 0.25;
    } else if (this.listening) {
      target = 0.3 + 0.08 * Math.sin(t * 3.2) + this.impulse * 0.2;
    } else {
      target = 0.06 + 0.035 * Math.sin(t * 1.1);
    }
    this.impulse = Math.max(0, this.impulse - dt * 3);

    // molla smorzata: movimento fluido, senza scatti
    const k = 110, c = 2 * Math.sqrt(k) * 0.85;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vel += (k * (target - this.level) - c * this.vel) * h;
      this.level += this.vel * h;
    }
    const L = THREE.MathUtils.clamp(this.level, 0, 1.2);

    // colori che sfumano tra gli stati
    const pal = this.listening ? PALETTE.listen : this.speaking ? PALETTE.speak : PALETTE.idle;
    const kc = 1 - Math.exp(-dt * 3);
    this.uniforms.uColor.value.lerp(pal.color, kc);
    this.uniforms.uHot.value.lerp(pal.hot, kc);
    this.uniforms.uTime.value = t;
    this.uniforms.uLevel.value = L;

    const col = this.uniforms.uColor.value;
    this.glow.material.color.copy(col).lerp(this.tmpColor.setRGB(1, 1, 1), 0.35);
    this.halo.material.color.copy(col);
    this.glow.scale.setScalar(1.2 + L * 2.4);
    this.glow.material.opacity = 0.18 + L * 0.7;
    this.halo.scale.setScalar(4 + L * 6);
    this.halo.material.opacity = 0.05 + L * 0.28;
    this.light.color.copy(col).lerp(this.tmpColor.setRGB(1, 1, 1), 0.3);
    this.light.intensity = 0.2 + L * 16;

    this.group.position.y = this.base.y + Math.sin(t * 0.55) * 0.035;
    this.core.rotation.y = t * 0.08;

    if (!this.speaking && !this.listening) this.subTimer = Math.max(0, this.subTimer - dt);
    const op = this.speaking || this.listening ? 1 : Math.min(1, this.subTimer);
    this.subtitle.material.opacity += (op - this.subtitle.material.opacity) * (1 - Math.exp(-dt * 6));
  }
}
