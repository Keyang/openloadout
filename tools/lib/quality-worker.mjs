// Worker thread for tools/lib/quality-run.mjs: checks one asset per message.
// workerData: { root }. Message in: { i, kind: 'sprite' | 'sound', file }. Message out: { i, result }.
// A sprite file is a code file (imported) or a data file, <id>.json (tools/lib/assets.mjs loadDataSprite: read, never imported).
import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

const { root } = workerData;
const url = (f) => pathToFileURL(f).href;
const { checkSprite } = await import(url(path.join(root, 'quality', 'sprite.js')));
const { checkSound } = await import(url(path.join(root, 'quality', 'sound.js')));
// the data checks of a data sprite (quality/data-checks.js, build item B9) are run by checkSprite itself

let validateMeta;
const schema = path.join(root, 'catalog', 'schema.js');
if (fs.existsSync(schema)) { try { const m = await import(url(schema)); if (typeof m.validateMeta === 'function') validateMeta = m.validateMeta; } catch { /* the main thread reports it */ } }

const soundIndex = new Map();
const soundsDir = path.join(root, 'sounds');
if (fs.existsSync(soundsDir)) for (const f of fs.readdirSync(soundsDir)) {
  if (!f.endsWith('.json') || f === 'index.json' || f.startsWith('_')) continue;
  try { const p = JSON.parse(fs.readFileSync(path.join(soundsDir, f), 'utf8')); soundIndex.set(p.id, p); } catch { /* reported when that sound is checked */ }
}

const failed = (id, msg) => ({ id, ok: false, errors: [msg], warnings: [], notes: [], metrics: {} });

async function checkOne({ kind, file }) {
  const base = path.basename(file).replace(/\.(js|mjs|json)$/, '');
  if (kind === 'sprite') {
    let def;
    if (file.endsWith('.json')) {
      // a data sprite (sprites/<id>.json, build item B9): read as JSON and drawn by the project's engine/data-sprite.js, never imported
      const { loadDataSprite } = await import('./assets.mjs');
      try { def = await loadDataSprite(root, file, { soundIds: [...soundIndex.keys()] }); } catch (e) { return failed(base, `cannot be loaded: ${String(e.message).replace(/^.*?\.json: /, '')}`); }
    } else try { def = (await import(url(file))).default; } catch (e) { return failed(base, `cannot be loaded: ${e.message}`); }
    if (!def || typeof def.render !== 'function' || !def.clips) return failed(base, 'cannot be loaded: the default export is not a sprite made with defineSprite');
    const r = checkSprite(def, { soundIndex, validateMeta });
    if (def.id !== base) r.errors.unshift(`id "${def.id}" must match the file name "${base}"`);
    const uses = [...new Set(Object.values(def.sounds ?? {}).flat().map((c) => c.sound))].sort();
    return { id: def.id, name: def.name, clips: Object.keys(def.clips).length, uses, ok: !r.errors.length, errors: r.errors, warnings: r.warnings, notes: [], metrics: r.metrics };
  }
  let patch;
  try { patch = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return failed(base, `cannot be read: ${e.message}`); }
  const r = checkSound(patch, { validateMeta });
  return { id: patch.id ?? base, name: patch.name, loop: !!patch.loop, ok: !r.errors.length, errors: r.errors, warnings: r.warnings, notes: r.notes, metrics: r.metrics };
}

parentPort.on('message', async (task) => {
  let result;
  try { result = await checkOne(task); } catch (e) { result = failed(path.basename(task.file), `checker crashed: ${e.stack || e.message}`); }
  parentPort.postMessage({ i: task.i, result });
});
parentPort.postMessage({ ready: true });
