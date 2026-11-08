import * as THREE from 'three';

/**
 * Legge il sensore di profondità del Quest 3 (WebXR Depth Sensing, modalità "gpu-optimized")
 * e lo trasforma in punti 3D nel mondo. Il Quest dà la profondità solo come texture sulla GPU:
 * la copiamo in un piccolo bersaglio di rendering (impacchettata in RGBA8) e la leggiamo in modo
 * asincrono, così il visore non si ferma.
 */
const SIZE = 160; // risoluzione di lettura (più che sufficiente per il sensore del Quest)

const VERT = `out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray depthArr;
uniform sampler2D depth2D;
uniform int useArray;
uniform int mode;            // 0 = profondità tipo depth-buffer [0..1]; 1 = luminance-alpha (uint16); 2 = metri (float32)
uniform float rawToMeters;
uniform mat3 uvFromView;     // normDepthBufferFromNormView
in vec2 vUv;
out vec4 outColor;
vec4 pack(float v){ // v in [0,1)
  vec4 enc = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * v);
  enc -= enc.yzww * vec4(1.0/255.0, 1.0/255.0, 1.0/255.0, 0.0);
  return enc;
}
void main(){
  vec2 uv = (uvFromView * vec3(vUv, 1.0)).xy;
  vec4 s = useArray == 1 ? texture(depthArr, vec3(uv, 0.0)) : texture(depth2D, uv);
  float v;
  if (mode == 0) v = s.r;                                   // valore del depth buffer
  else if (mode == 1) v = (s.r * 255.0 + s.a * 255.0 * 256.0) * rawToMeters / 8.0;   // metri / 8
  else v = s.r * rawToMeters / 8.0;
  outColor = (v <= 0.0 || v >= 1.0) ? vec4(0.0) : pack(v);
}`;

export class DepthCapture {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.tex = new THREE.Texture();
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        depthArr: { value: null }, depth2D: { value: null }, useArray: { value: 1 }, mode: { value: 0 },
        rawToMeters: { value: 0.001 }, uvFromView: { value: new THREE.Matrix3() },
      },
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.pixels = new Uint8Array(SIZE * SIZE * 4);
    this.busy = false;
    this.binding = null;
  }

  /** Il visore ci dà la profondità in questa sessione? */
  supported() {
    const s = this.renderer.xr.getSession?.();
    const feats = s?.officinaFeatures || s?.enabledFeatures || [];
    return !!(s && feats.includes?.('depth-sensing'));
  }

  /**
   * Una lettura: ritorna { points: Float32Array (x,y,z mondo), count } oppure null.
   * Va chiamata nel ciclo di rendering, mentre il visore è in sessione.
   */
  async sample(rigMatrixWorld) {
    if (this.busy) return null;
    const r = this.renderer;
    const session = r.xr.getSession?.();
    const frame = r.xr.getFrame?.();
    if (!session || !frame) return null;
    const ref = r.xr.getReferenceSpace();
    const pose = frame.getViewerPose(ref);
    if (!pose) return null;
    const view = pose.views[0];
    if (session.depthUsage === 'cpu-optimized') return this.sampleCPU(frame, view, rigMatrixWorld);
    let info;
    try {
      this.binding ||= new XRWebGLBinding(session, r.getContext());
      info = this.binding.getDepthInformation(view);
    } catch { return null; }
    if (!info || info.isValid === false || !info.texture) return null;

    // la texture del visore, avvolta in una Texture di three
    r.properties.get(this.tex).__webglTexture = info.texture;
    this.tex.isRenderTargetTexture = true; // nessun caricamento da parte di three
    const isArray = info.textureType !== 'texture';
    const fmt = session.depthDataFormat;
    const m = this.material.uniforms;
    m.useArray.value = isArray ? 1 : 0;
    m.depthArr.value = isArray ? this.tex : null;
    m.depth2D.value = isArray ? null : this.tex;
    // Quest: profondità tipo depth-buffer con depthNear/depthFar; altrimenti valori grezzi
    m.mode.value = fmt === 'luminance-alpha' ? 1 : (info.depthNear != null || !info.rawValueToMeters) ? 0 : 2;
    m.rawToMeters.value = info.rawValueToMeters || 0.001;
    const nd = info.normDepthBufferFromNormView?.matrix;
    if (nd) m.uvFromView.value.set(nd[0], nd[4], nd[12], nd[1], nd[5], nd[13], 0, 0, 1);
    else m.uvFromView.value.identity();

    // geometria della vista nel mondo di three (la "rig" sposta il giocatore)
    const proj = new THREE.Matrix4().fromArray(info.projectionMatrix || view.projectionMatrix);
    const viewWorld = new THREE.Matrix4().fromArray((info.transform || view.transform).matrix);
    if (rigMatrixWorld) viewWorld.premultiply(rigMatrixWorld);
    const near = info.depthNear ?? 0.1, far = info.depthFar ?? Infinity;

    const prevRT = r.getRenderTarget();
    const prevXR = r.xr.enabled;
    r.xr.enabled = false;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prevRT);
    r.xr.enabled = prevXR;

    this.busy = true;
    try {
      await r.readRenderTargetPixelsAsync(this.rt, 0, 0, SIZE, SIZE, this.pixels);
    } catch {
      r.readRenderTargetPixels(this.rt, 0, 0, SIZE, SIZE, this.pixels);
    } finally {
      this.busy = false;
    }
    return backProject(this.pixels, SIZE, m.mode.value, proj, viewWorld, near, far);
  }
}

/** Variante per i visori che danno la profondità in memoria (cpu-optimized). */
DepthCapture.prototype.sampleCPU = function (frame, view, rigMatrixWorld) {
  let info;
  try { info = frame.getDepthInformation(view); } catch { return null; }
  if (!info) return null;
  const inv = new THREE.Matrix4().fromArray(view.projectionMatrix).invert();
  const viewWorld = new THREE.Matrix4().fromArray(view.transform.matrix);
  if (rigMatrixWorld) viewWorld.premultiply(rigMatrixWorld);
  const out = new Float32Array(SIZE * SIZE * 3);
  const dir = new THREE.Vector3();
  let n = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5) / SIZE, v = (y + 0.5) / SIZE; // origine in alto a sinistra
      let m;
      try { m = info.getDepthInMeters(u, v); } catch { continue; }
      if (!(m > 0.05 && m < 3)) continue;
      dir.set(u * 2 - 1, 1 - v * 2, 0.5).applyMatrix4(inv);
      dir.multiplyScalar(m / -dir.z).applyMatrix4(viewWorld);
      out[n * 3] = dir.x; out[n * 3 + 1] = dir.y; out[n * 3 + 2] = dir.z;
      n++;
    }
  }
  return { points: out, count: n };
};

/** Pixel impacchettati → punti 3D nel mondo. Esportata per i test. */
export function backProject(px, size, mode, proj, viewWorld, near, far) {
  const inv = proj.clone().invert();
  const out = new Float32Array(size * size * 3);
  const v = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let n = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = px[i], b = px[i + 1], c = px[i + 2], d = px[i + 3];
      if (!(a | b | c | d)) continue;
      const val = a / 255 + b / 65025 + c / 16581375 + d / 4228250625;
      const nx = ((x + 0.5) / size) * 2 - 1, ny = ((y + 0.5) / size) * 2 - 1;
      if (mode === 0) {
        // valore del depth buffer → distanza lineare lungo l'asse della vista
        const zn = val * 2 - 1;
        const lin = Number.isFinite(far) ? (2 * near * far) / (far + near - zn * (far - near)) : near / (1 - val);
        if (!(lin > 0.05 && lin < 3)) continue;
        dir.set(nx, ny, 0.5).applyMatrix4(inv); // un punto qualsiasi del raggio
        v.copy(dir).multiplyScalar(lin / -dir.z);
      } else {
        const meters = val * 8;
        if (!(meters > 0.05 && meters < 3)) continue;
        dir.set(nx, ny, 0.5).applyMatrix4(inv);
        v.copy(dir).multiplyScalar(meters / -dir.z);
      }
      v.applyMatrix4(viewWorld);
      out[n * 3] = v.x; out[n * 3 + 1] = v.y; out[n * 3 + 2] = v.z;
      n++;
    }
  }
  return { points: out, count: n };
}
