// The quality bar's findings for a version 2 studio sprite, worked out in a background worker (build item B17; Contract
// 14 rule 7: advice only). The bar takes up to seconds on a big sprite, so the page sends the checked definition here
// and stays free. Nothing of the definition runs: it is data drawn by framework code (engine/data-sprite.js) after the
// pieces it names are loaded (engine/pieces.js). One message in: { ask, def, soundsUrl }; one out: { ask, result:
// { problems, suggestions } } or { ask, error }. runV2Advice() is also called on the page where there are no module workers.
import { makeDataSprite } from '../../engine/data-sprite.js';
import { sitePieces } from '../../engine/pieces.js';

let library = null;       // the sound library, read once: id -> patch

/** The quality bar's findings: { problems (what the library would refuse), suggestions }, or { error }. Arguments: def (checked, version 2), soundsUrl (generated/sounds.json; optional). */
export async function runV2Advice(def, soundsUrl) {
  if (soundsUrl && !library) {
    try { const r = await fetch(soundsUrl); if (r.ok) library = new Map((await r.json()).patches.map((p) => [p.id, p])); } catch { library = null; }
  }
  const got = await sitePieces().loadFor(def);
  if (!got.ok) return { error: got.errors[0] ?? 'its pieces could not be loaded' };
  const made = makeDataSprite(def);
  if (!made.ok) return { error: made.errors[0] ?? 'it could not be drawn' };
  const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../../quality/sprite.js'), import('../../catalog/schema.js')]);
  const r = checkSprite(made.sprite, { validateMeta, ...(library ? { soundIndex: library } : {}) });
  return { problems: r.errors, suggestions: [...r.warnings, ...(library ? [] : ['The sounds it plays were not checked: the sound library could not be read.'])] };
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = async (e) => {
    const { ask, def, soundsUrl } = e.data ?? {};
    try { globalThis.postMessage({ ask, result: await runV2Advice(def, soundsUrl) }); } catch (err) { globalThis.postMessage({ ask, error: String(err?.message ?? err).slice(0, 300) }); }
  };
}
