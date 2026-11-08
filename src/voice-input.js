/**
 * Comandi vocali dentro il visore: il browser del Quest non ha il riconoscimento vocale,
 * quindi lo facciamo noi con Whisper (modello open source, gira nel visore, gratis).
 * Il modello si scarica la prima volta e poi resta in memoria nel browser.
 */
const TF_URL = new URL('./vendor/transformers-4.3.1.mjs', import.meta.url).href;
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

  get ready() { return !!this.asr && !!this.ctx; }

  /** Microfono + modello. Da chiamare con un tocco dell'utente. onProgress(0..1). */
  async init(onProgress) {
    if (this.ready) return true;
    this.set('loading', 0);
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ sampleRate: 16000 });
      const src = this.ctx.createMediaStreamSource(this.stream);
      const proc = this.ctx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => this.onAudio(e.inputBuffer.getChannelData(0));
      src.connect(proc);
      proc.connect(this.ctx.destination); // necessario perché il nodo lavori (esce in silenzio)
      this.rate = this.ctx.sampleRate;
    }
    const { pipeline, env } = await import(TF_URL);
    env.allowLocalModels = false;
    const files = new Map();
    const model = MODELS[this.quality] || MODELS.veloce;
    const progress_callback = (p) => {
        if (p.status === 'progress' && p.total) {
          files.set(p.file, [p.loaded, p.total]);
          let l = 0, t = 0;
          for (const [a, b] of files.values()) { l += a; t += b; }
          onProgress?.(t ? l / t : 0);
          this.set('loading', t ? l / t : 0);
        }
    };
    // con la scheda grafica (WebGPU) il "codificatore" è molto più veloce; altrimenti processore
    let gpu = false;
    try { gpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { gpu = false; }
    if (gpu && this.quality !== 'preciso') {
      try {
        this.asr = await pipeline('automatic-speech-recognition', model, {
          device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, progress_callback,
        });
        this.device = 'webgpu';
      } catch (e) {
        console.warn('WebGPU non disponibile per la voce, uso il processore', e);
        this.asr = null;
      }
    }
    if (!this.asr) {
      this.asr = await pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
      this.device = 'wasm';
    }
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
    const speech = rms > 0.02;
    // ascolto continuo: parte da solo quando senti parlare (e l'AI non sta parlando)
    if (this.continuous && !this.recording && speech && !this.isBusy() && this.state !== 'thinking') {
      this.start();
      this.continuousTake = true;
    }
    if (!this.recording) return;
    this.chunks.push(new Float32Array(data));
    this.elapsed += dt;
    if (speech) { this.heard = true; this.silence = 0; } else this.silence += dt;
    if ((this.heard && this.silence > 0.9) || this.elapsed > 9 || (!this.heard && this.elapsed > 5)) {
      this.recording = false;
      if (this.heard) this.transcribe(); else this.set(this.continuous ? 'continuous' : 'ready');
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
