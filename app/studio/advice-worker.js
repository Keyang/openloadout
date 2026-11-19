// The studio's advice, worked out in a background worker (item S12; docs/studio.md section 6): the quality bar takes
// seconds on a body like the Hero (about 4 s), so the page sends the definition here and stays free. A definition is
// data drawn by framework code (Contract 14 rule 6), so nothing of it runs: the worker loads only the site's own
// modules. One message in: { id, def, soundsUrl }; one out: { id, result: { bar, pixels } } or { id, error }.
// runAdvice() is also called on the page itself where a browser has no module workers.
import { barAdvice, pixelAdvice, groupAdvice } from './advice.js';

let library = null;       // the sound library, read once: id -> patch

/** The advice for a definition: { bar (barAdvice's answer), pixels (groupAdvice of pixelAdvice) }. Arguments: def, soundsUrl (generated/sounds.json; optional). */
export async function runAdvice(def, soundsUrl) {
  if (soundsUrl && !library) {
    try { const r = await fetch(soundsUrl); if (r.ok) library = new Map((await r.json()).patches.map((p) => [p.id, p])); } catch { library = null; }
  }
  const bar = await barAdvice(def, { sounds: library });
  let pixels = [];
  try { pixels = groupAdvice(pixelAdvice(def), def); } catch { pixels = []; }
  return { bar: library || !bar.ok ? bar : { ...bar, items: [...bar.items, { level: 'tip', text: 'The sounds it plays were not checked: the sound library could not be read.' }] }, pixels };
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = async (e) => {
    const { id, def, soundsUrl } = e.data ?? {};
    try { globalThis.postMessage({ id, result: await runAdvice(def, soundsUrl) }); } catch (err) { globalThis.postMessage({ id, error: String(err?.message ?? err).slice(0, 300) }); }
  };
}
