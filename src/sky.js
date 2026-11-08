import * as THREE from 'three';

/**
 * Cieli procedurali: uno shader disegna il cielo una sola volta in una cubemap ad alta
 * risoluzione (nitido e leggero da mostrare), che fa anche da riflesso per gli oggetti.
 */
const NOISE = /* glsl */`
float hash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + 0.17; a *= 0.5; } return s; }
// stelle: un punto per cella di una griglia sulla sfera
float stars(vec3 d, float scale, float density, float seed){
  vec3 p = d * scale; vec3 c = floor(p);
  float h = hash(c + seed);
  if (h < 1.0 - density) return 0.0;
  vec3 j = vec3(hash(c + seed + 1.3), hash(c + seed + 2.7), hash(c + seed + 5.1));
  vec3 sp = normalize((c + 0.2 + 0.6 * j) / scale);
  float dd = length(sp - d) * scale;
  float b = pow(hash(c + seed + 9.1), 3.0);
  return smoothstep(0.32, 0.0, dd) * (0.25 + 2.5 * b);
}
vec3 starColor(vec3 d, float scale, float seed){
  float t = hash(floor(d * scale) + seed + 4.4);
  return mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.65), t);
}
`;

const FRAG = /* glsl */`
uniform int uKind;
varying vec3 vDir;
${NOISE}

vec3 space(vec3 d){
  vec3 col = vec3(0.0);
  // Via Lattea: banda inclinata con polveri scure
  vec3 n = normalize(vec3(0.25, 0.9, 0.35));
  float b = dot(d, n);
  float band = exp(-pow(b / 0.22, 2.0));
  float dust = fbm(d * 7.0);
  float lanes = smoothstep(0.45, 0.75, fbm(d * 12.0 + 3.0));
  col += band * (0.06 + 0.18 * dust) * vec3(0.85, 0.8, 1.0) * (1.0 - 0.7 * lanes * band);
  col += exp(-pow(b / 0.06, 2.0)) * 0.12 * vec3(1.0, 0.92, 0.8) * (0.5 + dust);
  // nebulose colorate
  float n1 = smoothstep(0.52, 0.9, fbm(d * 2.2 + 11.0));
  float n2 = smoothstep(0.55, 0.92, fbm(d * 2.8 - 7.0));
  float detail = fbm(d * 9.0 + 2.0);
  col += n1 * (0.25 + 0.5 * detail) * vec3(0.55, 0.12, 0.75);
  col += n2 * (0.25 + 0.5 * detail) * vec3(0.05, 0.45, 0.7);
  col += n1 * n2 * vec3(1.0, 0.35, 0.6) * 0.6;
  // stelle su tre scale
  col += stars(d, 140.0, 0.012, 1.0) * starColor(d, 140.0, 1.0) * 1.6;
  col += stars(d, 320.0, 0.018, 7.0) * starColor(d, 320.0, 7.0) * 0.8;
  col += stars(d, 700.0, 0.02 + 0.12 * band, 13.0) * 0.45 * starColor(d, 700.0, 13.0);
  // sole lontano
  vec3 s = normalize(vec3(-0.75, 0.22, -0.62));
  float sd = max(dot(d, s), 0.0);
  col += pow(sd, 3000.0) * vec3(6.0, 5.6, 5.0) + pow(sd, 60.0) * vec3(0.6, 0.45, 0.3) + pow(sd, 8.0) * vec3(0.06, 0.04, 0.03);
  return col;
}

vec3 underwater(vec3 d){
  float y = d.y;
  vec3 deep = vec3(0.0, 0.025, 0.06), mid = vec3(0.01, 0.17, 0.27), top = vec3(0.12, 0.55, 0.62);
  vec3 col = mix(deep, mid, smoothstep(-0.5, 0.25, y));
  col = mix(col, top, smoothstep(0.2, 0.95, y));
  // superficie increspata vista da sotto
  if (y > 0.05) {
    vec2 uv = d.xz / (y + 0.08);
    float r = fbm(vec3(uv * 3.0, 1.0));
    float cells = pow(abs(sin(uv.x * 9.0 + r * 6.0) * sin(uv.y * 9.0 - r * 5.0)), 6.0);
    col += smoothstep(0.05, 0.6, y) * (0.25 * r + 0.6 * cells) * vec3(0.6, 0.95, 1.0);
    // finestra di Snell: il sole che entra
    col += pow(max(y, 0.0), 24.0) * vec3(1.6, 1.8, 1.6);
  }
  // raggi di luce
  float a = atan(d.z, d.x);
  float rays = pow(noise(vec3(a * 9.0, 0.5, 0.0)), 5.0) + 0.6 * pow(noise(vec3(a * 23.0, 2.0, 0.0)), 6.0);
  col += rays * smoothstep(-0.15, 0.7, y) * vec3(0.25, 0.45, 0.45);
  // particelle sospese
  col += stars(d, 260.0, 0.04, 3.0) * 0.08 * vec3(0.7, 0.9, 1.0);
  return col;
}

vec3 sunset(vec3 d){
  float y = d.y;
  vec3 s = normalize(vec3(-0.92, 0.045, 0.32));
  float sd = max(dot(d, s), 0.0);
  float h = clamp(y, 0.0, 1.0);
  vec3 zenith = vec3(0.07, 0.09, 0.28), mid = vec3(0.55, 0.26, 0.42), horizon = vec3(1.25, 0.55, 0.18);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
  col = mix(col, zenith, smoothstep(0.12, 0.75, h));
  // alone del sole (più forte verso l'orizzonte)
  col += pow(sd, 6.0) * vec3(1.0, 0.45, 0.12) * 0.8 + pow(sd, 60.0) * vec3(1.4, 0.8, 0.4) + pow(sd, 1800.0) * vec3(8.0, 6.5, 4.5);
  // nuvole sottili illuminate di lato
  if (y > 0.015) {
    vec2 uv = d.xz / (y + 0.12);
    float c = fbm(vec3(uv * vec2(0.9, 2.2), 3.0));
    float cloud = smoothstep(0.52, 0.78, c) * smoothstep(0.015, 0.08, y) * (1.0 - smoothstep(0.35, 0.6, y));
    vec3 lit = mix(vec3(0.35, 0.16, 0.28), vec3(1.4, 0.65, 0.35), pow(sd, 2.0));
    col = mix(col, lit, cloud * 0.85);
  }
  // prime stelle in alto
  col += stars(d, 300.0, 0.03, 5.0) * 0.5 * smoothstep(0.45, 0.9, y);
  // sotto l'orizzonte: terra scura (le dune la coprono)
  col = mix(col, vec3(0.16, 0.07, 0.05), smoothstep(0.0, -0.04, y));
  return col;
}

vec3 aurora(vec3 d){
  float y = d.y;
  vec3 col = mix(vec3(0.012, 0.03, 0.05), vec3(0.002, 0.006, 0.02), smoothstep(0.0, 0.7, y));
  col += stars(d, 160.0, 0.015, 2.0) * starColor(d, 160.0, 2.0) * 1.3;
  col += stars(d, 420.0, 0.025, 8.0) * 0.45;
  // luna con crateri
  vec3 m = normalize(vec3(0.55, 0.42, -0.72));
  float md = dot(d, m);
  float disc = smoothstep(0.99955, 0.99965, md);
  float craters = 0.75 + 0.25 * fbm(d * 400.0);
  col = mix(col, vec3(1.6, 1.6, 1.5) * craters, disc);
  col += pow(max(md, 0.0), 400.0) * vec3(0.25, 0.3, 0.35) + pow(max(md, 0.0), 30.0) * vec3(0.03, 0.04, 0.05);
  // bagliore verde basso (l'aurora animata è un oggetto a parte)
  col += exp(-pow((y - 0.12) / 0.12, 2.0)) * vec3(0.02, 0.12, 0.08) * (0.5 + fbm(d * 3.0));
  col = mix(col, vec3(0.03, 0.05, 0.08), smoothstep(0.0, -0.05, y));
  return col;
}

void main(){
  vec3 d = normalize(vDir);
  vec3 c = uKind == 1 ? space(d) : uKind == 2 ? underwater(d) : uKind == 3 ? sunset(d) : aurora(d);
  gl_FragColor = vec4(c, 1.0);
}
`;

const KINDS = { spazio: 1, acqua: 2, tramonto: 3, aurora: 4 };

export class SkyBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene = new THREE.Scene();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uKind: { value: 1 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), this.material));
  }

  /** Cielo e mappa dei riflessi per un ambiente (calcolati una volta e tenuti in memoria). */
  get(id, size = 1536) {
    if (!KINDS[id]) return null;
    if (this.cache.has(id)) return this.cache.get(id);
    this.material.uniforms.uKind.value = KINDS[id];
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cam = new THREE.CubeCamera(0.1, 100, rt);
    cam.update(this.renderer, this.scene);
    const env = this.pmrem.fromCubemap(rt.texture).texture;
    const out = { background: rt.texture, environment: env };
    this.cache.set(id, out);
    return out;
  }
}
