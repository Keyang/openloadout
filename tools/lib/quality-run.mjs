// Runs the quality bar (quality/sprite.js, quality/sound.js) over many assets at once:
// across worker threads, with each result cached in .cache/quality.json.
//
// What a cached result is keyed on: the files that asset really loads, and nothing else.
//   - the asset's own file;
//   - for a sprite, every module it imports, followed through their imports (its rig, the engine modules
//     the rig uses, a shared helper sprites/_*.js), read from the source text by tools/lib/imports.mjs;
//   - the checker's code: quality/sprite.js or quality/sound.js with everything it imports, catalog/schema.js,
//     and the worker that calls them (tools/lib/quality-worker.mjs);
//   - for a sprite, the sounds its cues name (only those).
// So an edit to one rig re-checks the sprites on that rig, an edit to the sound engine re-checks the sounds,
// and an edit to a file nothing loads re-checks nothing. If any module behind an asset holds an import that
// cannot be followed by reading it (import(someVariable)), that asset is keyed on the whole of engine/, rigs/,
// sound/ and quality/ instead, so a stale pass is never served. A crashed check is never cached.
// assetFiles() returns the list for one asset. Used by tools/check.mjs, tools/sfx.mjs and tools/build.mjs.
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
//
//   failureReport(results) -> lines of text for the assets that failed: which file, what is wrong, what to do.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT } from './assets.mjs';
import { importGraph } from './imports.mjs';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'quality-worker.mjs');
const DEP_DIRS = ['engine', 'rigs', 'sound', 'quality'];
const DEP_FILES = ['catalog/schema.js'];
const VERSION = 2;       // 2: each asset is keyed on the files it loads (1 keyed every asset on whole folders)
// A worker starts with the options Node was started with. Under `node -e "<script>"` those options hold the script
// itself, so each worker would run it again (and start workers of its own, without end): then start it with none.
const FROM_ONE_LINER = process.execArgv.some((a) => /^(-e|--eval|-p|--print|-pe)$/.test(a) || /^--(eval|print)=/.test(a));
const WORKER_OPTIONS = FROM_ONE_LINER ? { execArgv: [] } : {};
const isAsset = (f, ext) => f.endsWith(ext) && !f.startsWith('_') && f !== 'index.js' && f !== 'index.json';

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (/\.(m?js|json)$/.test(e.name)) out.push(f);
  }
  return out;
}
/**
 * The files a cached result for one asset depends on (see the top of this file).
 * kind: 'sprite' or 'sound'; file: the asset's file; graph: an importGraph() to share between many calls.
 * Returns { files, missing, open }: absolute paths, sorted; `missing` are files that are named but not on disk
 * (creating one changes the key); `open` is true when an import could not be followed, in which case `files`
 * holds the whole framework.
 */
export function assetFiles(root = ROOT, kind, file, graph) {
  root = path.resolve(root);
  graph ??= importGraph({ root });
  const starts = [path.resolve(file), path.join(root, 'quality', kind === 'sprite' ? 'sprite.js' : 'sound.js'), ...DEP_FILES.map((f) => path.join(root, f))];
  const c = graph.closure(starts);
  // the worker loads the checker by a path it works out while running (the lines above name those files), so it is
  // listed as one file and not read for imports
  const all = new Set([...c.files, WORKER]);
  if (c.unknown.length) for (const f of DEP_DIRS.flatMap((d) => walk(path.join(root, d)))) all.add(f);
  return { files: [...all].sort(), missing: c.missing, open: c.unknown.length > 0 };
}

/** Makes the cache key of one asset: (kind, file) => 40 hex characters. Reads each file once however many assets share it. */
function keyMaker(root) {
  const graph = importGraph({ root }), digests = new Map();
  const digest = (f) => {
    if (!digests.has(f)) { let d = '(missing)'; try { d = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); } catch { /* gone since it was listed */ } digests.set(f, d); }
    return digests.get(f);
  };
  return (kind, file) => {
    const { files, missing } = assetFiles(root, kind, file, graph);
    const h = crypto.createHash('sha1').update(`v${VERSION}\0${kind}\0`);
    for (const f of files) { h.update(path.relative(root, f)); h.update('\0'); h.update(digest(f)); h.update('\0'); }
    for (const f of missing) { h.update(path.relative(root, f)); h.update('\0(missing)\0'); }
    return h.digest('hex');
  };
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
  const keyOf = keyMaker(root);
  const stored = readCache(cacheFile).entries;
  const results = new Array(tasks.length), todo = [], updates = {};
  tasks.forEach((t, i) => {
    t.i = i;
    t.rel = path.relative(root, t.file).startsWith('..') ? t.file : path.relative(root, t.file);
    t.key = `${t.kind}:${t.rel}`;
    t.hash = keyOf(t.kind, t.file);
    if (t.kind === 'sound') { try { t.music = JSON.parse(fs.readFileSync(t.file, 'utf8')).category === 'music'; } catch { t.music = false; } }
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
      const worker = new Worker(WORKER, { workerData: { root }, ...WORKER_OPTIONS });
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

// ---- saying what failed ------------------------------------------------------------------
// One wording for every tool that stops on the quality bar (the build today): for each asset that failed,
// which file, what is wrong, and what to do about it.

const isCrash = (e) => /^checker (crashed|stopped)/.test(e);
/** The id to hand to tools/check.mjs: the file's own name when it is in sprites/, otherwise the path. */
const spriteArg = (file) => (/^sprites\/[^/]+\.m?js$/.test(file) ? path.basename(file).replace(/\.m?js$/, '') : file);

function whatToDo(r) {
  const errors = r.errors ?? [];
  if (errors.length && errors.every(isCrash)) {
    return ['This is not a finding about the asset: the checking code itself broke while looking at it.',
      'Build again. If the same message comes back, pass it on exactly as it is.'];
  }
  if (r.kind === 'sprite') {
    const arg = spriteArg(r.file);
    const first = errors.some((e) => e.startsWith('cannot be loaded'))
      ? `The file stops with a mistake before anything can be drawn; the words after "cannot be loaded:" say what it is. Correct it in ${r.file}.`
      : `Open ${r.file} and correct what is listed.`;
    return [first, `Check only this sprite:  node tools/check.mjs ${arg}`, `Look at what it draws:   node tools/render.mjs ${arg}   (pictures go to out/)`];
  }
  const first = errors.some((e) => e.startsWith('cannot be read'))
    ? `The file is not written correctly, often a missing or extra comma, quote or bracket; the words after "cannot be read:" say where. Correct it in ${r.file}.`
    : `Open ${r.file} and correct what is listed.`;
  return [first, `Check only this sound, with what was measured:  node tools/sfx.mjs check ${r.file}`];
}

/**
 * The assets that failed, as lines of text: for each, the file (and its name), "What is wrong" with every
 * finding word for word, and "What to do" with the commands that check and show just that asset. Ends with
 * how to read the short forms findings use, and where every check is explained. No failures: no lines.
 * results: as runQuality() returns them.
 */
export function failureReport(results) {
  const failed = results.filter((r) => !r.ok || (r.errors ?? []).length);
  if (!failed.length) return [];
  const lines = [];
  for (const r of failed) {
    const errors = (r.errors ?? []).length ? r.errors : ['it did not pass, and the checker gave no reason'];
    lines.push(`${r.file}${r.name ? `  ("${r.name}")` : ''}`);
    if (errors.length === 1) lines.push(`  What is wrong:  ${errors[0]}`);
    else { lines.push(`  What is wrong (${errors.length} things):`); errors.forEach((e, i) => lines.push(`    ${i + 1}. ${e}`)); }
    const todo = whatToDo(r);
    lines.push(`  What to do:     ${todo[0]}`);
    for (const t of todo.slice(1)) lines.push(`                  ${t}`);
    lines.push('');
  }
  const all = failed.flatMap((r) => r.errors ?? []);
  const place = all.map((e) => /^(\S+) frame (\d+) \/ ([^:]+):/.exec(e)).find(Boolean);
  const more = all.map((e) => /\(and (\d+) more\)/.exec(e)).find(Boolean);
  if (place || more) {
    lines.push('How to read a finding:');
    if (place) lines.push(`  "${place[1]} frame ${place[2]} / ${place[3]}" is the animation called "${place[1]}", picture ${place[2]} of it (pictures are counted from 0), drawn with the settings named after the slash.`);
    if (more) lines.push(`  "(and ${more[1]} more)" means the same fault was seen in ${more[1]} more ${more[1] === '1' ? 'place' : 'places'}; correcting the cause clears them all.`);
  }
  lines.push('What each check looks for is explained in docs/quality-bar.md.');
  return lines;
}
