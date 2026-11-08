/**
 * Voce dell'assistente generata nel browser (sul Quest la sintesi vocale di sistema spesso
 * non ha voci). La sintesi gira in un worker; qui si riproduce con WebAudio, frase per frase.
 */
export class NeuralVoice {
  constructor() {
    this.state = 'off'; // off | loading | ready | error
    this.progress = 0;
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    this.gen = 0;
    this.nextTime = 0;
    this.playing = 0;
    this.waiters = new Map();
    this.onState = null;
    this.onEnd = null;
    this.worker = null;
    try { this.voice = localStorage.getItem('officina-voce') || 'paola'; } catch { this.voice = 'paola'; }
  }

  /** Cambia voce (paola | miro): la nuova si scarica la prima volta. */
  setVoice(v) {
    this.voice = v;
    try { localStorage.setItem('officina-voce', v); } catch { /* niente */ }
    if (this.worker && this.state !== 'error') {
      this.setState('loading');
      this.loading = new Promise((resolve) => {
        this.waiters.set('init', { resolve, reject: () => resolve(false) });
        this.worker.postMessage({ type: 'init', voice: v });
      });
    }
    return this.loading;
  }

  /** Va chiamata da un tocco dell'utente: sblocca l'audio e scarica la voce. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
      this.buf = new Float32Array(this.analyser.fftSize);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.load();
  }

  load() {
    if (this.loading) return this.loading;
    this.worker = new Worker(new URL('./tts-worker.js', import.meta.url));
    this.worker.onmessage = (e) => this.onMsg(e.data);
    this.worker.onerror = (e) => {
      e.preventDefault?.();
      console.warn('voce: worker non avviato', e.message);
      this.setState('error');
      this.worker.terminate();
      this.loading = null; // si potrà riprovare
      for (const w of this.waiters.values()) w.reject(new Error('voce non disponibile'));
      this.waiters.clear();
    };
    this.setState('loading');
    this.loading = new Promise((resolve) => {
      this.waiters.set('init', { resolve, reject: () => resolve(false) });
      this.worker.postMessage({ type: 'init', voice: this.voice });
    });
    return this.loading;
  }

  setState(s) { this.state = s; this.onState?.(s, this.progress); }

  onMsg(m) {
    if (m.type === 'progress') { this.progress = m.p; this.onState?.(this.state, m.p); return; }
    if (m.type === 'ready') { this.setState('ready'); this.waiters.get('init')?.resolve(true); this.waiters.delete('init'); return; }
    const w = this.waiters.get(m.id ?? 'init');
    this.waiters.delete(m.id ?? 'init');
    if (m.type === 'error') {
      console.warn('voce:', m.message);
      if (this.state === 'loading') this.setState('error');
      w?.reject(new Error(m.message));
    } else if (m.type === 'audio') w?.resolve(m);
  }

  get ready() { return this.state === 'ready' && this.ctx?.state === 'running'; }

  /** Volume istantaneo 0..1 della voce (per far muovere l'ologramma). */
  level() {
    if (!this.playing || !this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.min(1, Math.sqrt(s / this.buf.length) * 6);
  }

  cancel() {
    this.gen++;
    for (const src of this.sources || []) { try { src.stop(); } catch { /* già ferma */ } }
    this.sources = [];
    this.playing = 0;
  }

  /** Parla. pitch 1 = normale; >1 più acuta (senza accelerare). Ritorna quando ha finito. */
  async speak(text, { pitch = 1 } = {}) {
    this.cancel();
    const gen = this.gen;
    const rate = 1; // niente alterazione del tono: la voce resta naturale
    const lengthScale = Math.min(1.25, Math.max(0.8, 1 / Math.max(0.5, pitch)));
    const parts = text.replace(/\s+/g, ' ').match(/[^.!?;:]+[.!?;:]*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
    this.nextTime = this.ctx.currentTime + 0.05;
    // tutte le frasi partono subito verso il worker; si riproducono in ordine
    const jobs = parts.map((p, i) => new Promise((resolve, reject) => {
      const id = `${gen}-${i}`;
      this.waiters.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'synth', id, text: p, lengthScale });
    }));
    let last = null;
    for (const job of jobs) {
      let m;
      try { m = await job; } catch { continue; }
      if (gen !== this.gen) return;
      const b = this.ctx.createBuffer(1, m.audio.length, m.rate);
      b.copyToChannel(m.audio, 0);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate;
      src.connect(this.analyser);
      const at = Math.max(this.nextTime, this.ctx.currentTime + 0.02);
      src.start(at);
      this.nextTime = at + b.duration / rate + 0.12;
      this.playing++;
      (this.sources ||= []).push(src);
      last = new Promise((r) => { src.onended = () => { this.playing = Math.max(0, this.playing - 1); r(); }; });
    }
    await last;
    if (gen === this.gen) this.onEnd?.();
  }
}
