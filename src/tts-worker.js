/* Sintesi vocale italiana nel browser (Piper VITS), in un worker per non bloccare la VR.
 * Fonemi: espeak-ng (piper-phonemize wasm). Voci: rhasspy "Paola" it-IT (dati CC0) e OpenVoiceOS "Miro" it-IT (CC BY-NC-ND 4.0). */
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const PHON = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/';
const VOICES = {
  paola: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium/it_IT-paola-medium.onnx',
  miro: 'https://huggingface.co/OpenVoiceOS/pipertts_it-IT_miro/resolve/main/miro_it-IT.onnx',
};
const CACHE = 'officina-voce-v1';

importScripts(ORT + 'ort.wasm.min.js', PHON + 'piper_phonemize.js');
/* global ort, createPiperPhonemize */
ort.env.wasm.wasmPaths = ORT;
ort.env.wasm.numThreads = 1;

let session = null;
let voice = 'paola';

async function cachedFetch(url, onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) return new Uint8Array(await hit.arrayBuffer()); } catch { /* niente cache */ }
  const res = await fetch(url);
  if (!res.ok) throw new Error('download voce: HTTP ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (total) onProgress?.(got / total);
  }
  const buf = new Uint8Array(got); let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  try { await cache?.put(url, new Response(buf)); } catch { /* spazio pieno: pazienza */ }
  return buf;
}

let phon = null, pending = null;
async function phonemize(text) {
  phon ||= createPiperPhonemize({
    noInitialRun: true,
    print: (d) => { const p = pending; pending = null; p?.resolve(JSON.parse(d).phoneme_ids); },
    printErr: (e) => { if (/error/i.test(e) && pending) { const p = pending; pending = null; p.reject(new Error(e)); } },
    locateFile: (u) => PHON + u.split('/').pop(),
  });
  const m = await phon;
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    m.callMain(['-l', 'it', '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  });
}

async function init(v) {
  if (v && v !== voice && VOICES[v]) { voice = v; session = null; }
  if (session) return;
  const bytes = await cachedFetch(VOICES[voice], (p) => postMessage({ type: 'progress', p }));
  session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  await phonemize('ciao'); // scalda espeak (scarica i suoi dati)
}

async function synth(text, lengthScale) {
  const ids = await phonemize(text);
  const n = ids.length;
  const out = await session.run({
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, n]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(n)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([0.667, lengthScale, 0.8]), [3]),
  });
  return out[session.outputNames[0]].data;
}

let queue = Promise.resolve();
onmessage = (e) => { queue = queue.then(() => handle(e.data)); };

async function handle(m) {
  try {
    if (m.type === 'init') { await init(m.voice); postMessage({ type: 'ready' }); }
    if (m.type === 'synth') {
      await init();
      const audio = await synth(m.text, m.lengthScale || 1);
      postMessage({ type: 'audio', id: m.id, audio, rate: 22050 }, [audio.buffer]);
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String(err?.message || err) });
  }
}
