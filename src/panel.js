import * as THREE from 'three';

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/**
 * Pannello 3D a schede (stile app CAD): una riga di schede in alto, la griglia di
 * pulsanti della scheda attiva, una riga di stato in basso. Funziona con raggi,
 * tocco del dito e mouse.
 */
export class Panel {
  constructor(tabs, { width = 0.5, cols = 4, rows = 5 } = {}) {
    this.tabs = tabs;
    this.tab = tabs[0].id;
    this.cols = cols;
    this.rows = rows;
    this.W = 1024;
    this.pad = 14;
    this.header = 84;
    this.tabH = 62;
    this.hintH = 44;
    this.btnH = 84;
    this.statusH = 128;
    const gridTop = this.header + this.tabH + this.pad + this.hintH;
    this.gridTop = gridTop;
    this.H = gridTop + rows * (this.btnH + this.pad) + this.statusH;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * this.H) / this.W),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false, fog: false }),
    );
    this.mesh.name = 'panel';

    this.hovers = new Map();
    this.flash = new Map();
    this.active = new Set();
    this.labels = new Map();
    this.status = ['', ''];
    this.dirty = true;
  }

  get current() { return this.tabs.find((t) => t.id === this.tab); }

  setTab(id) {
    if (this.tabs.some((t) => t.id === id) && id !== this.tab) { this.tab = id; this.dirty = true; }
  }

  tabRects() {
    const n = this.tabs.length;
    const w = (this.W - this.pad * (n + 1)) / n;
    return this.tabs.map((t, i) => ({ id: 'tab:' + t.id, tab: t, x: this.pad + i * (w + this.pad), y: this.header, w, h: this.tabH }));
  }

  buttonRects() {
    const bw = (this.W - this.pad * (this.cols + 1)) / this.cols;
    return this.current.buttons.map((b, i) => (b ? {
      ...b,
      x: this.pad + (i % this.cols) * (bw + this.pad),
      y: this.gridTop + Math.floor(i / this.cols) * (this.btnH + this.pad),
      w: bw,
      h: this.btnH,
    } : null)).filter(Boolean);
  }

  hitTest(uv) {
    if (!uv) return null;
    const x = uv.x * this.W, y = (1 - uv.y) * this.H;
    const r = [...this.tabRects(), ...this.buttonRects()].find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
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
    const tab = this.current;
    g.clearRect(0, 0, W, H);
    roundRect(g, 2, 2, W - 4, H - 4, 28);
    g.fillStyle = 'rgba(12, 14, 18, 0.94)';
    g.fill();
    g.strokeStyle = '#2b3440';
    g.lineWidth = 3;
    g.stroke();

    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#e6edf5';
    g.font = `700 40px ${FONT}`;
    g.fillText('OFFICINA', 28, 46);
    g.fillStyle = '#7f8b99';
    g.font = `500 24px ${FONT}`;
    g.fillText('il tuo mondo privato', 248, 48);

    const hovered = new Set(this.hovers.values());
    g.textAlign = 'center';

    // schede
    for (const r of this.tabRects()) {
      const on = r.tab.id === this.tab;
      roundRect(g, r.x, r.y, r.w, r.h, 14);
      g.fillStyle = on ? r.tab.color : hovered.has(r.id) ? '#2a3442' : '#161b22';
      g.fill();
      g.fillStyle = on ? '#06121f' : '#c9d3df';
      g.font = `${on ? 700 : 600} ${this.tabs.length > 7 ? 19 : 23}px ${FONT}`;
      g.fillText(r.tab.label, r.x + r.w / 2, r.y + r.h / 2 + 1);
    }

    // suggerimento della scheda
    g.textAlign = 'left';
    g.fillStyle = tab.color;
    g.font = `500 22px ${FONT}`;
    g.fillText(clip(g, tab.hint || '', W - 56), 28, this.header + this.tabH + this.pad + this.hintH / 2 - 2);

    // pulsanti
    g.textAlign = 'center';
    for (const r of this.buttonRects()) {
      const fl = this.flash.get(r.id) || 0;
      const on = this.active.has(r.id);
      roundRect(g, r.x, r.y, r.w, r.h, 16);
      g.fillStyle = fl > 0 ? tab.color : on ? '#1f4f8a' : hovered.has(r.id) ? '#2a3442' : '#1a2029';
      g.fill();
      if (on) { g.strokeStyle = tab.color; g.lineWidth = 3; g.stroke(); }
      g.fillStyle = tab.color;
      g.fillRect(r.x, r.y + 16, 5, r.h - 32);
      g.fillStyle = fl > 0 ? '#06121f' : '#e6edf5';
      const label = this.labels.get(r.id) ?? r.label;
      g.font = `600 ${label.length > 13 ? 24 : 28}px ${FONT}`;
      g.fillText(label, r.x + r.w / 2 + 3, r.y + r.h / 2 + 1);
    }

    // stato
    const sy = H - this.statusH;
    g.strokeStyle = '#232b36';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(24, sy); g.lineTo(W - 24, sy); g.stroke();
    g.textAlign = 'left';
    g.font = `600 26px ${FONT}`;
    g.fillStyle = '#e6edf5';
    g.fillText(clip(g, this.status[0] || '', W - 56), 28, sy + 36);
    g.font = `400 23px ${FONT}`;
    g.fillStyle = '#8fc6ff';
    wrap(g, this.status[1] || '', W - 56).slice(0, 2).forEach((l, i) => g.fillText(l, 28, sy + 76 + i * 30));

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
