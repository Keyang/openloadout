// Runs the embedding model off the main thread. Started by search/client.js; talks in messages:
//
//   in   { type: 'init', vendorBase, model, pooling, dtype, queryPrefix, device }   device: 'auto' | 'wasm' | 'webgpu'
//   out  { type: 'ready', device, ms } | { type: 'error', message }
//   in   { type: 'embed', id, text, fixes }      text: the search, lowercase words; fixes: { typed: correction } (optional)
//   out  { type: 'vector', id, vector: Float32Array, ms } | { type: 'vector', id, error }
//
// A correction is applied only to a word the model itself does not know: "sowrd" becomes "sword", but
// "robber" stays "robber" even when the catalogue's nearest word is "bobber".
//
// Everything is loaded from vendor/ (written by tools/lib/vendor.mjs); nothing is fetched from another site.
// The processor build runs on one thread: GitHub Pages cannot send the headers that threads need.
let extractor = null;
let spec = null;

async function hasWebGPU() {
  try { return !!(self.navigator && navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}
async function exists(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

async function init(m) {
  const started = performance.now();
  const base = m.vendorBase.endsWith('/') ? m.vendorBase : m.vendorBase + '/';
  const T = await import(base + 'transformers/transformers.min.js');
  // Model files come from vendor/models/<model id>/ and from nowhere else. (Transformers.js cannot take a full
  // address as its "local" folder, so the vendor folder is given as the host it downloads from.)
  const models = new URL(base + 'models/');
  T.env.allowLocalModels = false;
  T.env.allowRemoteModels = true;
  T.env.remoteHost = models.origin + '/';
  T.env.remotePathTemplate = models.pathname.replace(/^\//, '') + '{model}/';
  const wasm = T.env.backends.onnx.wasm;
  wasm.numThreads = 1;
  wasm.proxy = false;

  // WebGPU needs the larger "asyncify" build of the runtime. Use it only when asked for or available, and when the build copied it.
  const gpuBuild = base + 'ort/ort-wasm-simd-threaded.asyncify';
  let device = 'wasm';
  if (m.device === 'webgpu' || (m.device === 'auto' && (await hasWebGPU()))) {
    if (await exists(gpuBuild + '.wasm')) device = 'webgpu';
  }
  const build = device === 'webgpu' ? gpuBuild : base + 'ort/ort-wasm-simd-threaded';
  wasm.wasmPaths = { mjs: build + '.mjs', wasm: build + '.wasm' };

  spec = { pooling: m.pooling || 'mean', queryPrefix: m.queryPrefix || '' };
  const load = (dev) => T.pipeline('feature-extraction', m.model, { dtype: m.dtype || 'q8', device: dev });
  try {
    extractor = await load(device);
  } catch (err) {
    if (device !== 'webgpu') throw err;
    device = 'wasm';                      // the WebGPU build also runs on the processor
    extractor = await load('wasm');
  }
  await embed('warm up');                 // the first run is the slow one; do it before saying ready
  return { device, ms: Math.round(performance.now() - started) };
}

// A word the model's tokenizer keeps in one piece is a real word.
function isWord(word) {
  try { return extractor.tokenizer.encode(word, { add_special_tokens: false }).length === 1; } catch { return false; }
}
function respell(text, fixes) {
  if (!fixes) return text;
  return text.split(' ').map((w) => (Object.hasOwn(fixes, w) && !isWord(w) ? fixes[w] : w)).join(' ');
}

async function embed(text, fixes = null) {
  const out = await extractor(spec.queryPrefix + respell(text, fixes), { pooling: spec.pooling, normalize: true });
  return Float32Array.from(out.data);
}

self.onmessage = async (event) => {
  const m = event.data || {};
  if (m.type === 'init') {
    try { self.postMessage({ type: 'ready', ...(await init(m)) }); }
    catch (err) { self.postMessage({ type: 'error', message: String((err && err.message) || err) }); }
  } else if (m.type === 'embed') {
    try {
      if (!extractor) throw new Error('the model has not loaded');
      const t = performance.now();
      const vector = await embed(String(m.text || ''), m.fixes || null);
      self.postMessage({ type: 'vector', id: m.id, vector, ms: performance.now() - t }, [vector.buffer]);
    } catch (err) {
      self.postMessage({ type: 'vector', id: m.id, error: String((err && err.message) || err) });
    }
  }
};
