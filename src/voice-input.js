/**
 * Comandi vocali dentro il visore: il browser del Quest non ha il riconoscimento vocale,
 * quindi lo facciamo noi con Whisper (modello open source, gira nel visore, gratis).
 * Il modello si scarica la prima volta e poi resta in memoria nel browser.
 */
const MODELS = { veloce: 'onnx-community/whisper-base', preciso: 'onnx-community/whisper-small' };

export class VoiceInput {
  constructor({ onText, onState, isBusy }) {
    this.onText = onText;
    this.onState = onState || (() => {});
    this.isBusy = isBusy || (() => false); // es. l'AI sta parlando: non ascoltare sé stessa
    this.state = 'off';
    this.quality = 'veloce';
    try { this.quality = localStorage.getItem('officina-voice-quality') || 'veloce'; } catch { /* niente */ }
    this.continuous = false;
    this.chunks = [];
    this.recording = false;
  }

  set(state, info) { this.state = state; this.onState(state, info); }

  get ready() { return !!this.asr && !!this.ctx && !!this.stream; }

  /** Microfono + modello. Da chiamare con un tocco dell'utente. onProgress(0..1). */
  async init(onProgress) {
    if (this.ready) return true;
    this.set('loading', 0);
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ sampleRate: 16000 });
      this.stream.getAudioTracks()[0]?.addEventListener('ended', () => { this.stream = null; this.set('error', 'mic-ended'); });
      const src = this.ctx.createMediaStreamSource(this.stream);
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
      src.connect(proc);
      proc.connect(this.ctx.destination); // necessario perché il nodo lavori (esce in silenzio)
      this.rate = this.ctx.sampleRate;
    }
    // il modello gira in un worker: mentre trascrive, la grafica resta fluida
    if (!this.worker) {
      this.worker = new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' });
      this.pending = new Map();
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') { onProgress?.(m.p); this.set('loading', m.p); return; }
        const key = m.type === 'ready' || (m.type === 'error' && m.id == null) ? 'init' : m.id;
        const w = this.pending.get(key);
        this.pending.delete(key);
        if (m.type === 'error') w?.reject(new Error(m.message)); else w?.resolve(m);
      };
      this.worker.onerror = (e) => {
        e.preventDefault?.();
        for (const w of this.pending.values()) w.reject(new Error('riconoscimento vocale non avviato'));
        this.pending.clear();
      };
    }
    const model = MODELS[this.quality] || MODELS.veloce;
    const ready = await new Promise((resolve, reject) => {
      this.pending.set('init', { resolve, reject });
      this.worker.postMessage({ type: 'init', model, preferGpu: false }); // la GPU serve alla VR: usarla per la voce fa scattare l'immagine
    });
    this.device = ready.device;
    this.asr = (audio) => new Promise((resolve, reject) => {
      const id = (this.seq = (this.seq || 0) + 1);
      this.pending.set(id, { resolve: (m) => resolve({ text: m.text }), reject });
      this.worker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer]);
    });
    this.set('ready');
    return true;
  }

  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('officina-voice-quality', q); } catch { /* niente */ }
    this.asr = null; // si ricarica al prossimo uso
  }

  /** Premi e parla: inizia ad ascoltare, si ferma da solo quando smetti di parlare. */
  start() {
    if (!this.ready || this.recording) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.chunks = [];
    this.recording = true;
    this.heard = false;
    this.silence = 0;
    this.elapsed = 0;
    this.continuousTake = false;
    this.set('listening');
  }

  stop() {
    if (!this.recording) return;
    this.recording = false;
    this.transcribe();
  }

  setContinuous(on) {
    this.continuous = on;
    if (on && this.ctx?.state === 'suspended') this.ctx.resume();
    this.set(on ? 'continuous' : 'ready');
  }

  onAudio(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / data.length);
    const dt = data.length / this.rate;
    // soglia che si adatta al rumore della stanza (il microfono del Quest è più basso di quello di un PC)
    this.level = rms;
    if (!this.recording || !this.heard) this.noise = this.noise == null ? rms : this.noise * 0.97 + Math.min(rms, 0.05) * 0.03;
    const speech = rms > Math.max(0.006, (this.noise || 0) * 3);
    if (rms > 0) this.gotSignal = true;
    // ascolto continuo: parte da solo quando senti parlare (e l'AI non sta parlando)
    if (this.continuous && !this.recording && speech && !this.isBusy() && this.state !== 'thinking') {
      this.start();
      this.continuousTake = true;
      this.heard = true;
    }
    if (!this.recording) return;
    this.chunks.push(new Float32Array(data));
    this.elapsed += dt;
    if (speech) { this.heard = true; this.silence = 0; } else this.silence += dt;
    if ((this.heard && this.silence > 0.6) || this.elapsed > 9 || (!this.heard && this.elapsed > 5)) {
      this.recording = false;
      if (this.heard) this.transcribe();
      else if (!this.continuousTake) this.set('nothing', this.gotSignal ? 'quiet' : 'silent');
      else this.set(this.continuous ? 'continuous' : 'ready');
    }
  }

  async transcribe() {
    const n = this.chunks.reduce((a, c) => a + c.length, 0);
    if (n < this.rate * 0.3) { this.set(this.continuous ? 'continuous' : 'ready'); return; }
    const audio = new Float32Array(n);
    let o = 0;
    for (const c of this.chunks) { audio.set(c, o); o += c.length; }
    this.chunks = [];
    this.set('thinking');
    try {
      const r = await this.asr(audio, { language: 'italian', task: 'transcribe' });
      const text = (r?.text || '').trim();
      this.set(this.continuous ? 'continuous' : 'ready');
      // Whisper a volte "inventa" frasi su silenzi o rumori: le scartiamo
      if (text && !/^(grazie|sottotitoli|\.+|…)[\s.!]*$/i.test(text)) this.onText(text);
    } catch (e) {
      console.error(e);
      this.set(this.continuous ? 'continuous' : 'ready');
    }
  }
}
