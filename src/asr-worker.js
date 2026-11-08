/* Riconoscimento vocale (Whisper) in un worker: la trascrizione non blocca più la grafica del visore. */
import { pipeline, env } from './vendor/transformers-4.3.1.mjs';

env.allowLocalModels = false;
let asr = null;

async function load({ model, preferGpu }) {
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, [p.loaded, p.total]);
      let l = 0, t = 0;
      for (const [a, b] of files.values()) { l += a; t += b; }
      postMessage({ type: 'progress', p: t ? l / t : 0 });
    }
  };
  let device = 'wasm';
  if (preferGpu) {
    let gpu = false;
    try { gpu = !!(self.navigator?.gpu && (await navigator.gpu.requestAdapter())); } catch { gpu = false; }
    if (gpu) {
      try {
        asr = await pipeline('automatic-speech-recognition', model, { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, progress_callback });
        device = 'webgpu';
      } catch { asr = null; }
    }
  }
  if (!asr) asr = await pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
  return device;
}

let queue = Promise.resolve();
onmessage = (e) => { queue = queue.then(() => handle(e.data)); };

async function handle(m) {
  try {
    if (m.type === 'init') {
      asr = null;
      const device = await load(m);
      postMessage({ type: 'ready', device });
    } else if (m.type === 'transcribe') {
      const r = await asr(m.audio, { language: 'italian', task: 'transcribe' });
      postMessage({ type: 'text', id: m.id, text: (r?.text || '').trim() });
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String(err?.message || err) });
  }
}
