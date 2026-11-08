/**
 * Fotocamera del visore (passthrough) tramite getUserMedia: sul Meta Quest Browser le
 * telecamere frontali compaiono come normali webcam dopo aver dato il permesso.
 * Serve per la scansione degli oggetti tenuti in mano.
 */
export class HeadsetCamera {
  constructor() {
    this.stream = null;
    this.video = null;
  }

  get supported() { return !!navigator.mediaDevices?.getUserMedia; }

  get ready() { return !!this.stream && this.video?.readyState >= 2; }

  /** Va chiamata da un tocco dell'utente (pulsante nella pagina o nel pannello). */
  async start() {
    if (this.ready) return true;
    if (!this.supported) throw new Error('Questo browser non dà accesso alla fotocamera.');
    let devices = [];
    try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { /* niente */ }
    const cams = devices.filter((d) => d.kind === 'videoinput');
    // sul Quest le telecamere del passthrough hanno nomi tipo "Passthrough Camera" o simili
    const pick = cams.find((d) => /passthrough|left|right|camera/i.test(d.label)) || cams[0];
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: pick?.deviceId ? { deviceId: { exact: pick.deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } } : { width: { ideal: 1280 } },
      audio: false,
    });
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();
    return true;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
  }

  /** Un fotogramma come JPEG base64 (lato lungo max 1024 px). */
  frame() {
    const v = this.video;
    const w = v.videoWidth, h = v.videoHeight;
    const k = Math.min(1, 1024 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  /** Scatta [n] foto distanziate di [gap] ms (mentre l'utente gira l'oggetto). */
  async burst(n = 4, gap = 900, onShot) {
    const shots = [];
    for (let i = 0; i < n; i++) {
      if (i) await new Promise((r) => setTimeout(r, gap));
      shots.push(this.frame());
      onShot?.(i + 1, n);
    }
    return shots;
  }
}
