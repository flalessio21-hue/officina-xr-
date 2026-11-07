import * as THREE from 'three';

// --- rumore procedurale -----------------------------------------------------
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise2(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
}

function canvasTex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Legno di noce: colore, rugosità e rilievo delle venature. */
export function walnutTextures(W = 1024, H = 512) {
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const cc = mk(), rc = mk(), bc = mk();
  const ci = cc.getContext('2d').createImageData(W, H);
  const ri = rc.getContext('2d').createImageData(W, H);
  const bi = bc.getContext('2d').createImageData(W, H);
  const light = [104, 66, 40], dark = [46, 27, 16];
  for (let y = 0; y < H; y++) {
    const ny = y / H;
    for (let x = 0; x < W; x++) {
      const nx = x / W;
      const warp = fbm(nx * 2.2, ny * 5.0, 3);
      const g = ny * 6 + warp * 1.8 + Math.sin(nx * 6.28 + warp * 3) * 0.2;
      const ring = Math.pow(0.5 + 0.5 * Math.sin(g * Math.PI * 2), 3.0);
      const streak = vnoise2(nx * 7, ny * 260) * 0.6 + vnoise2(nx * 18, ny * 520) * 0.4;
      const pore = vnoise2(nx * 90, ny * 700) > 0.82 ? 1 : 0;
      let t = ring * 0.35 + streak * 0.5 + fbm(nx * 3, ny * 3, 2) * 0.25;
      t = Math.min(1, t + pore * 0.25);
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) ci.data[i + k] = light[k] + (dark[k] - light[k]) * t;
      ci.data[i + 3] = 255;
      const rough = 70 + streak * 40 + pore * 90;
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = rough; ri.data[i + 3] = 255;
      const bump = 255 - (t * 160 + pore * 80);
      bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = bump; bi.data[i + 3] = 255;
    }
  }
  cc.getContext('2d').putImageData(ci, 0, 0);
  rc.getContext('2d').putImageData(ri, 0, 0);
  bc.getContext('2d').putImageData(bi, 0, 0);
  return { map: canvasTex(cc, true), roughnessMap: canvasTex(rc), bumpMap: canvasTex(bc) };
}

/** Tappetino da taglio "self-healing" con griglia in cm, righelli e diagonali. */
export function cuttingMatTexture(cmW = 90, cmH = 45, pxPerCm = 22) {
  const c = document.createElement('canvas');
  c.width = cmW * pxPerCm; c.height = cmH * pxPerCm;
  const g = c.getContext('2d');
  g.fillStyle = '#1b2622';
  g.fillRect(0, 0, c.width, c.height);
  // grana del materiale
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const m = 2 * pxPerCm; // margine
  g.save();
  g.strokeStyle = 'rgba(210, 225, 215, 0.12)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(m, m); g.lineTo(m + (cmH - 4) * pxPerCm, c.height - m);
  g.moveTo(c.width - m, m); g.lineTo(c.width - m - (cmH - 4) * pxPerCm, c.height - m);
  g.stroke();
  g.restore();
  for (let cx = 0; cx <= cmW - 4; cx++) {
    const x = m + cx * pxPerCm;
    const major = cx % 10 === 0, mid = cx % 5 === 0;
    g.strokeStyle = major ? 'rgba(220,235,225,0.42)' : mid ? 'rgba(220,235,225,0.26)' : 'rgba(220,235,225,0.12)';
    g.lineWidth = major ? 2 : 1;
    g.beginPath(); g.moveTo(x + 0.5, m); g.lineTo(x + 0.5, c.height - m); g.stroke();
    if (major) {
      g.fillStyle = 'rgba(225,235,228,0.75)';
      g.font = `600 ${pxPerCm * 0.8}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(String(cx), x, m - pxPerCm * 0.6);
    }
  }
  for (let cy = 0; cy <= cmH - 4; cy++) {
    const y = m + cy * pxPerCm;
    const major = cy % 10 === 0, mid = cy % 5 === 0;
    g.strokeStyle = major ? 'rgba(220,235,225,0.42)' : mid ? 'rgba(220,235,225,0.26)' : 'rgba(220,235,225,0.12)';
    g.lineWidth = major ? 2 : 1;
    g.beginPath(); g.moveTo(m, y + 0.5); g.lineTo(c.width - m, y + 0.5); g.stroke();
    if (major) {
      g.fillStyle = 'rgba(225,235,228,0.75)';
      g.font = `600 ${pxPerCm * 0.8}px system-ui, sans-serif`;
      g.textAlign = 'right';
      g.fillText(String(cy), m - pxPerCm * 0.4, y + pxPerCm * 0.3);
    }
  }
  g.fillStyle = 'rgba(225,235,228,0.55)';
  g.font = `700 ${pxPerCm * 0.9}px system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText('OFFICINA · SELF-HEALING MAT · cm', c.width - m, c.height - pxPerCm * 0.6);
  const t = canvasTex(c, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Cemento lucido scuro: variazione di rugosità per i riflessi. */
export function concreteRoughness(S = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // rumore periodico (tileable) mescolando i quattro angoli
    const fx = x / S, fy = y / S;
    const n = (a, b) => fbm(a * 8, b * 8, 4);
    const v = n(fx, fy) * (1 - fx) * (1 - fy) + n(fx - 1, fy) * fx * (1 - fy)
      + n(fx, fy - 1) * (1 - fx) * fy + n(fx - 1, fy - 1) * fx * fy;
    const r = 120 + v * 40 + (Math.random() - 0.5) * 18;
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = r; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return canvasTex(c);
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.12, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.15)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.03)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
