// Runs the quality bar (quality/sprite.js, quality/sound.js) over many assets at once:
// across worker threads, with each result cached in .cache/quality.json.
//
// A SPRITE is a data file (R4a: a code file is refused, see below) and is keyed on what draws and checks it (the list
// under A DATA SPRITE). A SOUND is keyed on the files it really loads, and nothing else:
//   - the asset's own file;
//   - the checker's code: quality/sound.js with everything it imports (found from the source text by
//     tools/lib/imports.mjs), catalog/schema.js, and the worker that calls them (tools/lib/quality-worker.mjs).
// So an edit to the sound engine re-checks the sounds, and an edit to a file nothing loads re-checks nothing. If any
// module behind a sound holds an import that cannot be followed by reading it (import(someVariable)), that sound is
// keyed on the whole of engine/, rigs/, sound/ and quality/ instead, so a stale pass is never served. A crashed check
// is never cached. assetFiles() returns the list for one asset. Used by tools/check.mjs, tools/sfx.mjs and tools/build.mjs.
//
// A CODE SPRITE IS REFUSED (build item R4a, docs/data-sprites.md section 5): a file in sprites/ that is not a data file
// <id>.json (a .js or .mjs program, an old <id>.js, a helper _x.js) stops runQuality, spriteFiles and assetFiles with
// assets.mjs codeSpriteRefusal, whether the run lists sprites/ or is handed the file by path or id; it is never imported.
//
// A DATA SPRITE (sprites/<id>.json, docs/data-sprites.md 4.2, build item B9) loads no module of its own, so it is keyed
// on what draws and checks it (dataSpriteDeps):
//   - its definition (the file's text);
//   - the code every data sprite runs: engine/data-sprite.js, engine/data-frames.js (framesInClip),
//     catalog/sprite-schema.js, quality/sprite.js, quality/data-checks.js (the data checks) and catalog/schema.js with
//     everything they import, the worker and its loaders (tools/lib/assets.mjs,
//     tools/lib/pieces-index.mjs), but NOT the generator families (engine/gen/<family>.js, and engine/gen/index.js
//     that lists them; engine/gen/registry.js and args.js are in);
//   - every generator and colour rule it names, as id@v (the validator's `uses`), each with its own code: the
//     generator's declaration in its family file, the declarations of that file it names (helpers), the top-level
//     statements of that file that mention one of those names or an import (TABLE.a = 2 further down), the modules it
//     imports from, and the code of every generator it calls by a written-in id (call({ gen: 'twinkle', v: 1 })), in
//     turn (generatorIndex reads the family files as text, never runs them). A generator that cannot be found that way,
//     a declaration whose id and version are not written plainly, and a call whose id or version is not written plainly
//     (gen: someName; but gen: call.gen passes on a call written in the data, already named) key on every family file. What reading text cannot see: code reached through something other than
//     a name (an object handed in from another family at run time, eval); released versions never change (Contract 15
//     rule 5) and the goldens of tests/fixtures/gen/ catch a changed drawing, so this is a second line, not the only one;
//   - the layout of its body kind (every layout registered with that id: the newest draws it);
//   - every piece it names (pieces/), with the pieces those use in turn (their files) and the generators those name;
//   - the sounds its cues name (after the check, as for any sprite).
// So a change to one generator re-checks only the sprites naming it, a new version of a generator re-checks nothing
// until a definition names it, and a change to a piece only the sprites using it.
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
import { ROOT, isSpriteFile, isCodeSpriteFile, findSpriteFile, spriteIds, assertNoCodeSprites, refuseCodeId, CodeSpriteError } from './assets.mjs';
import { importGraph } from './imports.mjs';
import { pieceFilesFor } from './pieces-index.mjs';
import { usesOf } from '../../engine/pieces.js';

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
/** Throws the refusal of a code sprite file (assets.mjs CodeSpriteError), naming it as the project would (sprites/x.js), or as the path when it is outside the project. Arguments: root, file (absolute or relative to the project). */
function refuseSpriteFile(root, file) {
  const abs = path.resolve(root, file);
  const rel = abs.startsWith(root + path.sep) ? path.relative(root, abs).split(path.sep).join('/') : abs;
  if (isCodeSpriteFile(abs)) throw new CodeSpriteError(rel);
  throw new Error(`${rel}: not a sprite file; a sprite is a data file sprites/<id>.json (format "loadout-sprite", version 2), made with the /sprite-forge skill`);
}

/**
 * The files a cached result for one asset depends on (see the top of this file).
 * kind: 'sprite' or 'sound'; file: the asset's file (a sprite's is a .json data file; any other is refused, R4a);
 * graph: an importGraph() to share between many calls.
 * Returns { files, missing, open }: absolute paths, sorted; `missing` are files that are named but not on disk
 * (creating one changes the key); `open` is true when an import could not be followed, in which case `files`
 * holds the whole framework.
 */
export function assetFiles(root = ROOT, kind, file, graph) {
  root = path.resolve(root);
  graph ??= importGraph({ root });
  if (kind === 'sprite') {
    if (String(file).endsWith('.json')) return dataSpriteFiles(root, file, graph);
    refuseSpriteFile(root, file);
  }
  const starts = [path.resolve(file), path.join(root, 'quality', 'sound.js'), ...DEP_FILES.map((f) => path.join(root, f))];
  const checks = path.join(root, 'quality', 'data-checks.js');
  const c = closureWhere(graph, starts, (from) => from !== checks);
  // the worker loads the checker by a path it works out while running (the lines above name those files), so it is
  // listed as one file and not read for imports
  const all = new Set([...c.files, WORKER]);
  if (c.unknown.length) for (const f of DEP_DIRS.flatMap((d) => walk(path.join(root, d)))) all.add(f);
  return { files: [...all].sort(), missing: c.missing, open: c.unknown.length > 0 };
}

// ---- data sprites (sprites/<id>.json; see A DATA SPRITE at the top) ------------------------------------------------

const GEN_SHARED = new Set(['registry.js', 'args.js']);
/** Is f a generator family module (engine/gen/<family>.js) or their list (engine/gen/index.js), which a data sprite's code key leaves out? */
const isFamilyFile = (f) => path.basename(path.dirname(f)) === 'gen' && path.basename(path.dirname(path.dirname(f))) === 'engine' && !GEN_SHARED.has(path.basename(f));
// (the registry and the argument types run every generator, so they count for every data sprite, though only families import them)
const DATA_STARTS = ['engine/data-sprite.js', 'engine/data-frames.js', 'catalog/sprite-schema.js', 'quality/sprite.js', 'quality/data-checks.js', 'engine/gen/registry.js', 'engine/gen/args.js', ...DEP_FILES];
const LOADERS = ['assets.mjs', 'pieces-index.mjs'].map((f) => path.join(path.dirname(WORKER), f));
const BODY_KINDS = ['rig', 'tiles', 'layers', 'panel', 'emitters', 'pictures'];
const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const sha1 = (...parts) => { const h = crypto.createHash('sha1'); for (const p of parts) h.update(p); return h.digest('hex'); };

/**
 * What starts reach through graph, following the imports of a file only where follow(file, dep) says so: { files,
 * missing, unknown }, absolute paths, sorted. A file reached is always in files; follow decides only whether its imports are read.
 */
function closureWhere(graph, starts, follow) {
  const files = new Set(), missing = new Set(), unknown = new Set();
  const queue = starts.map((f) => path.resolve(f));
  while (queue.length) {
    const f = queue.pop();
    if (files.has(f) || missing.has(f)) continue;
    if (!isFile(f)) { missing.add(f); continue; }
    files.add(f);
    if (!follow(f)) continue;
    const s = graph.direct(f);
    if (s.unknown) unknown.add(f);
    for (const m of s.missing) missing.add(m);
    for (const d of s.deps) if (!files.has(d) && follow(f, d)) queue.push(d);
  }
  return { files: [...files].sort(), missing: [...missing].sort(), unknown: [...unknown].sort() };
}

/** What starts reach through graph without entering a generator family: { files, missing, unknown }, absolute paths, sorted. */
function closureOutsideFamilies(graph, starts) {
  return closureWhere(graph, starts, (f, d) => d === undefined || !isFamilyFile(d));
}

/** A data file's definition, or null when it cannot be read as JSON (the check then says so). */
function readDefinition(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * The files a data sprite's cached result depends on: its own file, the pieces it uses (with what they use), and the
 * code that loads, draws and checks every data sprite, without the generator families (the generators it names are keyed
 * one by one: dataSpriteDeps). Returns { files, missing, open } as assetFiles does.
 * Arguments: root (the project), file (the data file), graph (an importGraph() to share).
 */
export function dataSpriteFiles(root = ROOT, file, graph) {
  root = path.resolve(root);
  graph ??= importGraph({ root });
  const c = closureOutsideFamilies(graph, [file, ...DATA_STARTS.map((f) => path.join(root, f))]);
  const all = new Set([...c.files, WORKER, ...LOADERS]);
  const missing = new Set(c.missing);
  const def = readDefinition(file);
  if (def) {
    const p = pieceFilesFor(def, { root });
    for (const f of p.files) all.add(path.join(root, f));
    for (const f of p.missing) missing.add(path.join(root, f));
  }
  if (c.unknown.length) for (const f of DEP_DIRS.flatMap((d) => walk(path.join(root, d)))) all.add(f);
  return { files: [...all].sort(), missing: [...missing].sort(), open: c.unknown.length > 0 };
}

/** Every generator and colour rule a definition (or a piece's body) names: ["id@v"], sorted (a colour rule without v is @1). */
function generatorRefs(x) {
  const out = new Set();
  let n = 0;
  const walkRefs = (y, depth) => {
    if (!y || typeof y !== 'object' || depth > 64 || ++n > 100000) return;
    if (Array.isArray(y)) { for (const z of y) walkRefs(z, depth + 1); return; }
    if (typeof y.gen === 'string') out.add(`${y.gen}@${y.v}`);
    if (typeof y.rule === 'string') out.add(`${y.rule}@${y.v ?? 1}`);
    for (const k of Object.keys(y)) walkRefs(y[k], depth + 1);
  };
  walkRefs(x, 0);
  return [...out].sort();
}

// The top-level statements of a module's text, each with the comment just above it: [{ text, names, imports, free }].
// names: what it declares; imports: [[local name, path as written]] for an import of a file of the project; free: a
// statement that declares nothing (TABLE.a = 2; register(x);), its own chunk so a fingerprint can take it alone.
const DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\b/;
// a line at the left edge that starts a statement of its own (not a closing bracket, a string, or a comment)
const FREE = /^[A-Za-z_$(\[!+\-~]/;
function topChunks(text) {
  const lines = text.split('\n');
  const starts = [0];
  let comment = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(\/\*|\/\/)/.test(line)) { if (comment < 0) comment = i; continue; }
    if (comment >= 0 && /^\s\*/.test(line)) continue;
    if (DECL.test(line) || /^import\b/.test(line) || FREE.test(line)) { const s = comment >= 0 ? comment : i; if (s > starts[starts.length - 1]) starts.push(s); }
    comment = -1;
  }
  return starts.map((s, k) => {
    const body = lines.slice(s, k + 1 < starts.length ? starts[k + 1] : lines.length).join('\n');
    const names = [], imports = [];
    const head = body.split('\n').find((l) => DECL.test(l) || /^import\b/.test(l) || FREE.test(l)) ?? '';
    const free = FREE.test(head) && !DECL.test(head) && !/^import\b/.test(head);
    const one = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(head);
    if (one) names.push(one[1]);
    const many = /^(?:export\s+)?(?:const|let|var)\s*\{([^}]*)\}/.exec(head);
    if (many) for (const part of many[1].split(',')) { const m = /([A-Za-z_$][\w$]*)\s*$/.exec(part.split('=')[0].trim()); if (m) names.push(m[1]); }
    for (const m of body.matchAll(/^import\s+([^'"]*?)\s*from\s*(['"])(\.\.?\/[^'"]+)\2/gm)) {
      const what = m[1];
      const braces = /\{([^}]*)\}/.exec(what);
      if (braces) for (const spec of braces[1].split(',')) { const w = spec.trim().split(/\s+as\s+/); const local = (w[1] ?? w[0]).trim(); if (local) imports.push([local, m[3]]); }
      const star = /\*\s*as\s+([A-Za-z_$][\w$]*)/.exec(what);
      if (star) imports.push([star[1], m[3]]);
      const dflt = /^([A-Za-z_$][\w$]*)/.exec(what);
      if (dflt) imports.push([dflt[1], m[3]]);
    }
    return { text: body, names, imports, free };
  });
}

/**
 * The generators a piece of code calls by a written-in id: { refs: ["id@v"], open } (open: a call whose id or version
 * is not written plainly, gen: someName, so any generator may be called). Reads `gen: 'id', v: n` as written in calls.
 * A call that passes on the generator of a call written in the data (gen: call.gen, gen: item.gen) is not open: that
 * generator is named by the definition, so it is in the key already.
 */
function calledGenerators(text) {
  const refs = new Set();
  let open = false;
  for (const m of text.matchAll(/\bgen:\s*/g)) {
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
    const lit = /^(['"])([^'"\n]+)\1\s*,\s*v:\s*(\d+)\b/.exec(rest);
    if (lit) refs.add(`${lit[2]}@${Number(lit[3])}`);
    else if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.gen\b/.test(rest)) open = true;
  }
  return { refs: [...refs].sort(), open };
}

/**
 * The generators of a project read from engine/gen/*.js as text, never run: { find(ref) -> the fingerprint of id@v or
 * null, layouts(kind) -> the fingerprints of every layout declared with that id, all (the fingerprint of every family
 * file, for what cannot be found) }. A generator's fingerprint covers its declaration (defineGenerator({ id, v, ... })
 * written in its family file), the declarations of that file it names (followed in turn), and the modules it imports
 * from, with what they import (not entering other families).
 * Arguments: root, graph (an importGraph()), digest (file -> hash, shared).
 */
function generatorIndex(root, graph, digest) {
  const dir = path.join(root, 'engine', 'gen');
  const families = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.m?js$/.test(f) && !GEN_SHARED.has(f)).sort().map((f) => path.join(dir, f)) : [];
  const byKey = new Map(), layouts = new Map();   // id@v -> { fp (its own code), calls (id@v it calls), open }; layout id -> [id@v]
  const filesHash = (files) => {
    const c = closureOutsideFamilies(graph, files);
    const h = crypto.createHash('sha1');
    for (const f of c.files) h.update(`${path.relative(root, f)}\0${digest(f)}\0`);
    for (const f of c.missing) h.update(`${path.relative(root, f)}\0(missing)\0`);
    // an import that cannot be followed: every module of the framework then counts
    if (c.unknown.length) for (const f of DEP_DIRS.flatMap((d) => walk(path.join(root, d)))) h.update(`${path.relative(root, f)}\0${digest(f)}\0`);
    return h.digest('hex');
  };
  const all = filesHash(families);
  for (const file of families) {
    const chunks = topChunks(fs.readFileSync(file, 'utf8'));
    const declared = new Map(), imported = new Map(), mentions = new Map();   // mentions: name -> the free statements naming it
    const wordsOf = (c) => new Set(c.text.match(/[A-Za-z_$][\w$]*/g) ?? []);
    chunks.forEach((c, i) => {
      for (const n of c.names) declared.set(n, i);
      for (const [n, spec] of c.imports) imported.set(n, path.resolve(path.dirname(file), spec.replace(/[?#].*$/, '')));
    });
    chunks.forEach((c, i) => { if (c.free) for (const w of wordsOf(c)) if (declared.has(w) || imported.has(w)) mentions.set(w, [...(mentions.get(w) ?? []), i]); });
    const fingerprint = (i) => {
      const seen = new Set([i]), queue = [i], files = new Set(), h = crypto.createHash('sha1');
      const visit = (k) => { if (!seen.has(k)) { seen.add(k); queue.push(k); } };
      let text = '';
      while (queue.length) {
        const k = queue.shift();
        h.update(chunks[k].text); h.update('\0');
        text += `${chunks[k].text}\n`;
        for (const word of wordsOf(chunks[k])) {
          if (declared.has(word)) visit(declared.get(word));
          if (imported.has(word)) files.add(imported.get(word));
          for (const f of mentions.get(word) ?? []) visit(f);
        }
      }
      h.update(filesHash([...files].sort()));
      return { fp: h.digest('hex'), ...calledGenerators(text) };
    };
    chunks.forEach((c, i) => {
      for (const m of c.text.matchAll(/defineGenerator\(\s*\{([^}]*)/g)) {
        const head = m[1];
        const id = /\bid:\s*(['"])([^'"\n]+)\1/.exec(head)?.[2], v = /\bv:\s*(\d+)\b/.exec(head)?.[1], family = /\bfamily:\s*(['"])([^'"\n]+)\1/.exec(head)?.[2];
        // not written plainly: nothing can be said of it alone, so anything not found keys on every family file (`all`)
        if (!id || !v) continue;
        const key = `${id}@${Number(v)}`, f = fingerprint(i), had = byKey.get(key);
        byKey.set(key, had ? { fp: sha1(had.fp, f.fp), calls: [...new Set([...had.calls, ...f.refs])].sort(), open: had.open || f.open } : { fp: f.fp, calls: f.refs, open: f.open });
        if (family === 'layout') layouts.set(id, [...(layouts.get(id) ?? []), key]);
      }
    });
  }
  // a generator's key: its own code, then every generator it calls by name, in turn (one not found, or a call not
  // written plainly, counts as every family file); a loop of calls stops at a generator already on the way
  const done = new Map();
  const find = (ref, way = new Set()) => {
    if (done.has(ref)) return done.get(ref);
    const e = byKey.get(ref);
    if (!e) return null;
    if (way.has(ref)) return e.fp;
    way.add(ref);
    const parts = [e.fp];
    if (e.open) parts.push(`open\0${all}`);
    for (const c of e.calls) if (c !== ref) parts.push(`${c}\0${find(c, way) ?? all}`);
    way.delete(ref);
    const out = parts.length > 1 ? sha1(...parts) : e.fp;
    if (!way.size) done.set(ref, out);
    return out;
  };
  return { find: (ref) => find(ref), layouts: (kind) => (layouts.get(kind) ?? []).map((k) => find(k)), all };
}

/** The names of the built-in colour rules (engine/data-rules.js COLOUR_RULES): part of the code every data sprite runs, so keyed by name alone. */
async function builtinRules(root) {
  try { const m = await import(pathToFileURL(path.join(root, 'engine', 'data-rules.js')).href); return new Set(Object.keys(m.COLOUR_RULES ?? {})); } catch { return new Set(); }
}

/**
 * What a data sprite's cached result is keyed on (see A DATA SPRITE at the top): { files, missing, open } (dataSpriteFiles),
 * uses (every generator, colour rule and piece it names, "id@v", sorted: the validator's list), kind (its body kind),
 * generators ({ "id@v": fingerprint } for those it and its pieces name), layout ([fingerprints] of its body kind's layouts).
 * Arguments: root, file, { graph, digest, gens (a generatorIndex), rules (built-in colour rule names) }: made when left out.
 */
export function dataSpriteDeps(root = ROOT, file, { graph, digest, gens, rules } = {}) {
  root = path.resolve(root);
  graph ??= importGraph({ root });
  digest ??= (f) => { try { return sha1(fs.readFileSync(f)); } catch { return '(missing)'; } };
  gens ??= generatorIndex(root, graph, digest);
  rules ??= new Set();
  const { files, missing, open } = dataSpriteFiles(root, file, graph);
  const def = readDefinition(file);
  const pieceRefs = def ? usesOf(def).filter((u) => u.ref).map((u) => u.ref) : [];
  const own = def ? generatorRefs(def) : [];
  const inPieces = [];
  if (def) for (const f of pieceFilesFor(def, { root }).files) { const p = readDefinition(path.join(root, f)); if (p) inPieces.push(...generatorRefs(p.body)); }
  const generators = {};
  for (const ref of [...new Set([...own, ...inPieces])].sort()) {
    const name = ref.slice(0, ref.lastIndexOf('@'));
    generators[ref] = gens.find(ref) ?? (rules.has(name) && ref.endsWith('@1') ? 'built-in' : gens.all);
  }
  const kind = def && def.body && typeof def.body === 'object' ? BODY_KINDS.find((k) => Object.hasOwn(def.body, k)) ?? null : null;
  return {
    files, missing, open, kind,
    uses: [...new Set([...own, ...pieceRefs])].sort(),
    generators,
    layout: kind && kind !== 'rig' ? gens.layouts(kind) : [],
  };
}

/** Makes the cache key of one asset: (kind, file) => 40 hex characters. Reads each file once however many assets share it. rules: built-in colour rule names (data sprites). */
function keyMaker(root, rules = new Set()) {
  const graph = importGraph({ root }), digests = new Map();
  const digest = (f) => {
    if (!digests.has(f)) { let d = '(missing)'; try { d = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); } catch { /* gone since it was listed */ } digests.set(f, d); }
    return digests.get(f);
  };
  let gens = null;
  const dataKey = (file) => {
    gens ??= generatorIndex(root, graph, digest);
    const d = dataSpriteDeps(root, file, { graph, digest, gens, rules });
    const h = crypto.createHash('sha1').update(`v${VERSION}\0data\0`);
    for (const f of d.files) { h.update(path.relative(root, f)); h.update('\0'); h.update(digest(f)); h.update('\0'); }
    for (const f of d.missing) { h.update(path.relative(root, f)); h.update('\0(missing)\0'); }
    for (const [ref, fp] of Object.entries(d.generators)) h.update(`gen\0${ref}\0${fp}\0`);
    for (const fp of d.layout) h.update(`layout\0${fp}\0`);
    return h.digest('hex');
  };
  return (kind, file) => {
    if (kind === 'sprite') { if (file.endsWith('.json')) return dataKey(file); refuseSpriteFile(root, file); }
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
  // data files only (<id>.json, build item B9); a code file in sprites/ stops the run (R4a), a code file named in the list too
  if (list === undefined) assertNoCodeSprites(root);
  const all = fs.existsSync(dir) ? fs.readdirSync(dir).filter(isSpriteFile).sort() : [];
  if (list === undefined) return all.map((f) => path.join(dir, f));
  return list.map((x) => {
    if (/\.(m?js|cjs|ts|json)$/.test(x) || x.includes('/') || x.includes(path.sep)) { if (!x.endsWith('.json')) refuseSpriteFile(root, x); return path.resolve(x); }
    const f = findSpriteFile(root, x);
    if (!f) { refuseCodeId(root, x); throw new UnknownAsset('sprite', x, spriteIds(root)); }
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
  const keyOf = keyMaker(root, tasks.some((t) => t.kind === 'sprite' && t.file.endsWith('.json')) ? await builtinRules(root) : undefined);
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
const spriteArg = (file) => (/^sprites\/[^/]+\.json$/.test(file) ? path.basename(file).replace(/\.json$/, '') : file);

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
