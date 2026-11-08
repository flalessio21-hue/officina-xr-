import * as THREE from 'three';

/**
 * L'assistente come bolla liquida sospesa sulla scrivania.
 * Da ferma ondeggia piano come una goccia d'acqua; quando parla la superficie si increspa
 * a ritmo della voce (onde che partono verso di te), quando ascolta diventa ambra.
 * Vetro con riflessi iridescenti e un cuore di luce che pulsa.
 */
const NOISE = /* glsl */`
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

const VERT = /* glsl */`
uniform float uTime, uLevel, uSpeak, uR;
uniform vec3 uFace;   // direzione verso chi guarda (spazio della bolla)
varying vec3 vN, vView, vP;
varying float vH;
${NOISE}
// spostamento della superficie lungo la normale
float disp(vec3 n){
  float t = uTime;
  float slow = snoise(n * 1.3 + vec3(0.0, t * 0.35, t * 0.22)) * 0.6
             + snoise(n * 2.6 - vec3(t * 0.4, 0.0, t * 0.3)) * 0.25;          // goccia che ondeggia
  float wave = snoise(n * 2.2 + vec3(t * 1.3, -t * 0.9, t * 0.7));            // onde morbide quando parla
  float ripple = sin(acos(clamp(dot(n, uFace), -1.0, 1.0)) * 4.5 - t * 9.0);   // anelli che partono verso di te
  return uR * (0.04 * slow
             + uSpeak * (0.035 * wave + 0.02 * ripple * smoothstep(0.0, 1.0, dot(n, uFace)))
             + uLevel * 0.06 * wave);
}
void main(){
  vec3 n = normalize(position);
  // tangenti per ricalcolare la normale della superficie deformata
  vec3 t1 = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n, t1);
  float e = 0.012;
  float d0 = disp(n);
  vec3 p0 = n * (uR + d0);
  vec3 pa = normalize(n + t1 * e); pa *= uR + disp(pa);
  vec3 pb = normalize(n + t2 * e); pb *= uR + disp(pb);
  vec3 nn = normalize(cross(pa - p0, pb - p0));
  if (dot(nn, n) < 0.0) nn = -nn;
  vH = d0 / uR;
  vP = n;
  vec4 mv = modelViewMatrix * vec4(p0, 1.0);
  vView = normalize(-mv.xyz);
  vN = normalize(normalMatrix * nn);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform float uTime, uLevel, uSpeak, uListen;
uniform vec3 uTint;
varying vec3 vN, vView, vP;
varying float vH;
${NOISE}
vec3 spectrum(float x){ return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67))); }
void main(){
  vec3 N = normalize(vN), V = normalize(vView);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  // film sottile iridescente, come una bolla di sapone
  float film = ndv * 1.6 + vH * 4.0 + snoise(vP * 2.0 + uTime * 0.15) * 0.25 + uTime * 0.03;
  vec3 irid = spectrum(film);
  // riflessi di due luci morbide (sembra vetro bagnato)
  vec3 L1 = normalize(vec3(-0.4, 0.8, 0.6)), L2 = normalize(vec3(0.7, 0.2, 0.5));
  float s1 = pow(max(dot(reflect(-L1, N), V), 0.0), 60.0);
  float s2 = pow(max(dot(reflect(-L2, N), V), 0.0), 25.0) * 0.35;
  // cuore di luce che si vede attraverso la superficie e pulsa con la voce
  float swirl = snoise(vP * 3.0 + vec3(uTime * 0.5, -uTime * 0.4, uTime * 0.3)) * 0.5 + 0.5;
  float core = pow(ndv, 2.0) * (0.38 + 0.9 * uLevel + 0.35 * swirl * (0.4 + uSpeak));
  vec3 tint = mix(uTint, vec3(1.0, 0.6, 0.2), uListen);
  vec3 col = tint * core
           + irid * fres * (0.55 + 0.6 * uLevel)
           + tint * fres * 0.35
           + vec3(1.0) * (s1 + s2);
  float alpha = clamp(0.18 + fres * 0.75 + core * 0.5 + s1, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`;

export class Bubble {
  constructor(parent, { radius = 0.075, y = 0.24 } = {}) {
    this.root = new THREE.Group();
    this.root.position.y = y;
    this.baseY = y;
    parent.add(this.root);
    this.R = radius;
    this.uniforms = {
      uTime: { value: 0 }, uLevel: { value: 0 }, uSpeak: { value: 0 }, uListen: { value: 0 }, uR: { value: radius },
      uFace: { value: new THREE.Vector3(0, 0, 1) }, uTint: { value: new THREE.Color(0.25, 0.65, 1.0) },
    };
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 40),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false }),
    );
    this.mesh.renderOrder = 2;
    this.root.add(this.mesh);
    // riflesso sul piano della scrivania e luce che illumina gli oggetti vicini
    this.light = new THREE.PointLight(0x5fb8ff, 0.2, 1.0, 2);
    this.root.add(this.light);
    this.time = 0;
    this.speak = 0;
    this.listen = 0;
    this._v = new THREE.Vector3();
  }

  /** level: voce 0..1; state: 'idle' | 'speaking' | 'listening'; camera: per guardarti. */
  update(dt, { level = 0, state = 'idle', camera } = {}) {
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    const k = 1 - Math.exp(-dt * 8);
    this.speak += ((state === 'speaking' ? 1 : 0) - this.speak) * k;
    this.listen += ((state === 'listening' ? 1 : 0) - this.listen) * (1 - Math.exp(-dt * 4));
    u.uSpeak.value = this.speak;
    u.uListen.value = this.listen;
    u.uLevel.value = THREE.MathUtils.clamp(level, 0, 1.2);
    // galleggia e "respira"; parlando pulsa leggermente
    const breathe = 1 + Math.sin(this.time * 1.4) * 0.015 + this.speak * level * 0.06;
    this.mesh.scale.setScalar(breathe);
    this.root.position.y = this.baseY + Math.sin(this.time * 0.9) * 0.008;
    this.light.intensity = 0.15 + level * 0.6;
    this.light.color.setRGB(0.37 + this.listen * 0.6, 0.72 - this.listen * 0.2, 1.0 - this.listen * 0.75);
    if (camera) {
      camera.getWorldPosition(this._v);
      this.mesh.worldToLocal(this._v);
      u.uFace.value.copy(this._v).normalize();
    }
  }
}
