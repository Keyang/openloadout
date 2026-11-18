// render-worker.js — renders a patch off the main thread, so long pieces
// (music loops) do not freeze the page while they are being built.
import { renderPatch } from './sfx-engine.js';

self.onmessage = (e) => {
  const { id, patch, params, seed, maxSeconds } = e.data;
  try {
    const t0 = performance.now();
    const r = renderPatch(patch, { params, seed, maxSeconds });
    const buffers = [...new Set([r.samples.buffer, ...r.channels.map((c) => c.buffer)])];
    self.postMessage({ id, r, ms: performance.now() - t0 }, buffers);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
