import * as THREE from 'three';

const ACCENT = { crea: '#3fa9ff', modifica: '#45d483', esplodi: '#ff6b4a', misura: '#ffc845', sistema: '#b57bff', muovi: '#7fe3ff', ambiente: '#ff6fb0' };

/** Pannello 3D con pulsanti disegnati su canvas: funziona con raggi dei controller, mani e mouse. */
export class Panel {
  constructor(layout, { width = 0.5, cols = 4 } = {}) {
    this.layout = layout;
    this.cols = cols;
    this.W = 1024;
    this.pad = 14;
    this.header = 96;
    this.btnH = 78;
    this.statusH = 150;
    const rows = Math.ceil(layout.length / cols);
    this.H = this.header + rows * (this.btnH + this.pad) + this.pad + this.statusH;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * this.H) / this.W),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, fog: false })
    );
    this.mesh.name = 'panel';

    const bw = (this.W - this.pad * (cols + 1)) / cols;
    this.rects = layout.map((b, i) => ({
      ...b,
      x: this.pad + (i % cols) * (bw + this.pad),
      y: this.header + Math.floor(i / cols) * (this.btnH + this.pad),
      w: bw,
      h: this.btnH,
    }));

    this.hovers = new Map();
    this.flash = new Map();
    this.active = new Set();
    this.labels = new Map();
    this.status = ['', ''];
    this.onPress = null;
    this.dirty = true;
  }

  hitTest(uv) {
    if (!uv) return null;
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    const r = this.rects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    return r ? r.id : null;
  }

  setHover(source, id) {
    if (this.hovers.get(source) !== id) { this.hovers.set(source, id); this.dirty = true; }
  }

  press(id) { this.flash.set(id, 0.25); this.dirty = true; }

  setActive(id, on) {
    if (on !== this.active.has(id)) { on ? this.active.add(id) : this.active.delete(id); this.dirty = true; }
  }

  setLabel(id, label) {
    if (this.labels.get(id) !== label) { this.labels.set(id, label); this.dirty = true; }
  }

  setStatus(lines) {
    if (lines.join('\n') !== this.status.join('\n')) { this.status = lines; this.dirty = true; }
  }

  update(dt) {
    for (const [id, t] of this.flash) {
      const n = t - dt;
      if (n <= 0) this.flash.delete(id); else this.flash.set(id, n);
      this.dirty = true;
    }
    if (this.dirty) this.draw();
  }

  draw() {
    const g = this.ctx, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    roundRect(g, 2, 2, W - 4, H - 4, 28);
    g.fillStyle = 'rgba(12, 14, 18, 0.93)';
    g.fill();
    g.strokeStyle = '#2b3440';
    g.lineWidth = 3;
    g.stroke();

    g.fillStyle = '#e6edf5';
    g.font = '700 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText('OFFICINA', 28, 52);
    g.fillStyle = '#7f8b99';
    g.font = '500 26px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('crea · assembla · esplodi', 270, 54);

    const hovered = new Set(this.hovers.values());
    g.textAlign = 'center';
    for (const r of this.rects) {
      const fl = this.flash.get(r.id) || 0;
      const on = this.active.has(r.id);
      roundRect(g, r.x, r.y, r.w, r.h, 14);
      g.fillStyle = fl > 0 ? '#3fa9ff' : on ? '#1f4f8a' : hovered.has(r.id) ? '#2a3442' : '#1a2029';
      g.fill();
      g.fillStyle = ACCENT[r.group] || '#555';
      g.fillRect(r.x, r.y + 14, 5, r.h - 28);
      g.fillStyle = fl > 0 ? '#06121f' : '#e6edf5';
      g.font = '600 29px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText(this.labels.get(r.id) ?? r.label, r.x + r.w / 2 + 3, r.y + r.h / 2 + 1);
    }

    const sy = H - this.statusH;
    g.strokeStyle = '#232b36';
    g.beginPath(); g.moveTo(24, sy); g.lineTo(W - 24, sy); g.stroke();
    g.textAlign = 'left';
    g.font = '600 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillStyle = '#e6edf5';
    g.fillText(clip(g, this.status[0] || '', W - 56), 28, sy + 42);
    g.font = '400 25px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillStyle = '#8fc6ff';
    const lines = wrap(g, this.status[1] || '', W - 56).slice(0, 2);
    lines.forEach((l, i) => g.fillText(l, 28, sy + 88 + i * 34));

    this.texture.needsUpdate = true;
    this.dirty = false;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function clip(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  while (text.length && g.measureText(text + '…').width > max) text = text.slice(0, -1);
  return text + '…';
}

function wrap(g, text, max) {
  const out = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
