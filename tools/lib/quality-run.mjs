// Runs the quality bar (quality/sprite.js, quality/sound.js) over many assets at once:
// across worker threads, with each result cached in .cache/quality.json. A cached result
// is used when nothing it depends on has changed: the asset file, the engine, rigs, sound
// engine, quality code and catalog/schema.js (and, for sprites, the sounds their cues name
// (only those) and any shared helper file sprites/_*.js). A crashed check is never cached. Used by tools/check.mjs, tools/sfx.mjs and
// tools/build.mjs.
//
//   const { results, metaChecked, notice } = await runQuality({
//     root,        // project folder (default: this project)
//     sprites,     // undefined = every sprite in sprites/; or a list of ids or file paths ([] = none)
//     sounds,      // undefined = every patch in sounds/; or a list of file paths ([] = none)
//     cache,       // false = check everything again (results are still written to the cache)
//     cacheFile,   // default <root>/.cache/quality.json
//     workers,     // default: one per core, minus one
//     onResult,    // (result) => void, called as each asset finishes
//   });
//   results: [{ kind, id, file, ok, errors, warnings, notes, metrics, cached, ... }] in the order asked
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT } from './assets.mjs';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'quality-worker.mjs');
const DEP_DIRS = ['engine', 'rigs', 'sound', 'quality'];
const DEP_FILES = ['catalog/schema.js'];
const VERSION = 1;
const isAsset = (f, ext) => f.endsWith(ext) && !f.startsWith('_') && f !== 'index.js' && f !== 'index.json';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (/\.(m?js|json)$/.test(e.name)) out.push(f);
  }
  return out;
}
function hashFiles(root, files) {
  const h = crypto.createHash('sha1');
  for (const f of files) { h.update(path.relative(root, f)); h.update('\0'); h.update(fs.readFileSync(f)); h.update('\0'); }
  return h.digest('hex');
}

/** Hash of everything every check depends on besides the asset itself. */
export function dependencyHash(root = ROOT) {
  const files = [...DEP_DIRS.flatMap((d) => walk(path.join(root, d))), ...DEP_FILES.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f))];
  return hashFiles(root, files);
}
/** Shared sprite helpers (sprites/_*.js): every sprite may import them. */
function spriteHelpersHash(root) {
  const sprites = path.join(root, 'sprites');
  return hashFiles(root, fs.existsSync(sprites) ? fs.readdirSync(sprites).filter((f) => f.startsWith('_')).sort().map((f) => path.join(sprites, f)) : []);
}

/** Hash of the sounds a sprite's cues name (sounds/<id>.json), so editing another sound keeps its cached result. */
export function soundsHash(root, ids) {
  const h = crypto.createHash('sha1');
  for (const id of [...new Set(ids)].sort()) {
    const f = path.join(root, 'sounds', `${id}.json`);
    h.update(id); h.update('\0');
    h.update(fs.existsSync(f) ? fs.readFileSync(f) : '(missing)'); h.update('\0');
  }
  return h.digest('hex');
}

/** A crashed or unfinished check says nothing about the asset, so it is never cached. */
export function cacheable(result) {
  return !(result.errors ?? []).some((e) => /^checker (crashed|stopped)/.test(e));
}

export class UnknownAsset extends Error {
  constructor(kind, id, known) { super(`Unknown ${kind} "${id}". Known: ${known.join(', ')}`); this.kind = kind; this.id = id; this.known = known; }
}

function spriteFiles(root, list) {
  const dir = path.join(root, 'sprites');
  const all = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => isAsset(f, '.js')).sort() : [];
  if (list === undefined) return all.map((f) => path.join(dir, f));
  return list.map((x) => {
    if (/\.m?js$/.test(x) || x.includes('/') || x.includes(path.sep)) return path.resolve(x);
    const f = path.join(dir, `${x}.js`);
    if (!fs.existsSync(f)) throw new UnknownAsset('sprite', x, all.map((n) => n.slice(0, -3)));
    return f;
  });
}
function soundFiles(root, list) {
  const dir = path.join(root, 'sounds');
  if (list === undefined) return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => isAsset(f, '.json')).sort().map((f) => path.join(dir, f)) : [];
  return list.filter((x) => path.basename(x) !== 'index.json').map((x) => path.resolve(x));
}

function readCache(file) {
  try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c.version === VERSION && c.entries) return c; } catch { /* no cache yet */ }
  return { version: VERSION, entries: {} };
}
function writeCache(file, updates) {
  const c = readCache(file);                      // re-read: another run may have written since
  Object.assign(c.entries, updates);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(c));
  fs.renameSync(tmp, file);
}

/** Whether catalog/schema.js will be used, and a one-line notice when it will not. */
export async function metaStatus(root = ROOT) {
  const f = path.join(root, 'catalog', 'schema.js');
  if (!fs.existsSync(f)) return { metaChecked: false, notice: 'metadata not checked: catalog/schema.js does not exist yet' };
  try {
    const m = await import(pathToFileURL(f).href);
    return typeof m.validateMeta === 'function' ? { metaChecked: true, notice: null } : { metaChecked: false, notice: 'metadata not checked: catalog/schema.js has no validateMeta export' };
  } catch (e) { return { metaChecked: false, notice: `metadata not checked: catalog/schema.js failed to load (${e.message})` }; }
}

export async function runQuality({ root = ROOT, sprites, sounds, cache = true, cacheFile, workers, onResult } = {}) {
  root = path.resolve(root);
  cacheFile = cacheFile ?? path.join(root, '.cache', 'quality.json');
  const tasks = [
    ...spriteFiles(root, sprites).map((file) => ({ kind: 'sprite', file })),
    ...soundFiles(root, sounds).map((file) => ({ kind: 'sound', file })),
  ];
  const { metaChecked, notice } = await metaStatus(root);
  const dep = dependencyHash(root), extras = tasks.some((t) => t.kind === 'sprite') ? spriteHelpersHash(root) : '';
  const stored = readCache(cacheFile).entries;
  const results = new Array(tasks.length), todo = [], updates = {};
  tasks.forEach((t, i) => {
    t.i = i;
    t.rel = path.relative(root, t.file).startsWith('..') ? t.file : path.relative(root, t.file);
    t.key = `${t.kind}:${t.rel}`;
    let content = '';
    try { content = fs.readFileSync(t.file); } catch { /* the worker reports it */ }
    t.hash = crypto.createHash('sha1').update(dep).update(t.kind === 'sprite' ? extras : '').update(content).digest('hex');
    if (t.kind === 'sound') { try { t.music = JSON.parse(content).category === 'music'; } catch { t.music = false; } }
    const entry = stored[t.key];
    const fresh = entry && entry.hash === t.hash && (!entry.uses || soundsHash(root, entry.uses) === entry.usesHash);
    const hit = cache && fresh ? entry.result : null;
    if (hit) { results[i] = { kind: t.kind, file: t.rel, ...hit, cached: true }; onResult?.(results[i]); } else todo.push(t);
  });

  // longest first: music tracks take minutes, so start them before everything else
  todo.sort((a, b) => (b.music === true) - (a.music === true) || a.i - b.i);
  const n = Math.min(todo.length, workers ?? Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1));
  await new Promise((resolve) => {
    if (!todo.length) return resolve();
    let next = 0, running = 0;
    const finishTask = (t, result) => {
      results[t.i] = { kind: t.kind, file: t.rel, ...result, cached: false };
      if (cacheable(result)) {
        const uses = result.uses ?? null;
        updates[t.key] = uses ? { hash: t.hash, uses, usesHash: soundsHash(root, uses), result } : { hash: t.hash, result };
      }
      onResult?.(results[t.i]);
    };
    for (let w = 0; w < n; w++) {
      const worker = new Worker(WORKER, { workerData: { root } });
      running++;
      let current = null;
      const feed = () => {
        if (next >= todo.length) { current = null; worker.terminate(); return; }
        current = todo[next++];
        worker.postMessage({ i: current.i, kind: current.kind, file: current.file });
      };
      worker.on('message', (m) => {
        if (m.ready) return feed();
        finishTask(current, m.result);
        feed();
      });
      worker.on('error', (e) => {
        if (current) finishTask(current, { id: path.basename(current.file), ok: false, errors: [`checker crashed: ${e.message}`], warnings: [], notes: [], metrics: {} });
        current = null;
      });
      worker.on('exit', () => {
        running--;
        if (current) { finishTask(current, { id: path.basename(current.file), ok: false, errors: ['checker stopped before finishing'], warnings: [], notes: [], metrics: {} }); }
        // a worker that died leaves its share of the queue: hand it to a fresh one
        if (next < todo.length && running === 0) {
          const rest = todo.slice(next); next = todo.length;
          const ordered = [...rest.filter((t) => t.kind === 'sprite'), ...rest.filter((t) => t.kind === 'sound')];
          runQuality({ root, sprites: ordered.filter((t) => t.kind === 'sprite').map((t) => t.file), sounds: ordered.filter((t) => t.kind === 'sound').map((t) => t.file), cache: false, cacheFile, workers: 1 })
            .then((r) => { r.results.forEach((x, j) => { results[ordered[j].i] = x; }); resolve(); });
          return;
        }
        if (running === 0) resolve();
      });
    }
  });
  if (Object.keys(updates).length) writeCache(cacheFile, updates);
  return { results, metaChecked, notice };
}
