#!/usr/bin/env node
// Ready-made versions as a build output (docs/site-design.md, section 4). Making a sprite's versions draws it dozens of times
// (seconds for the biggest), so the build makes them once and the pages read generated/versions.json:
//
//   { "<asset id>": [{ name, made: 'hand' | 'generated', params } | { name, made: 'hand', style }], ... }
//
// params holds only the settings that differ from the asset's defaults (clean them over the defaults to use them: cleanParams
// for a sprite, the patch defaults for a sound); a sound's style version names its preset instead. Sprites and sounds share one
// id space in the catalogue, so one map holds both. engine/versions.js stays for assets made on the page at run time.
//
// Cached: generated/.versions-cache.json keeps each asset's versions with a hash of every file they come from (the asset's
// file, everything it imports, and engine/versions.js with everything that imports, found by tools/lib/imports.mjs), so a
// build redoes only what changed. The output is the same whether or not the cache was used.
//
// A sprite is a data file, sprites/<id>.json (docs/data-sprites.md, DQ1; build item B9c): read and drawn by the project's
// engine/data-sprite.js through tools/lib/assets.mjs loadSpriteFile, never imported; a code file in sprites/ is refused
// (build item R4a: assertNoCodeSprites). A data sprite's key is its definition, the pieces it uses (with what those use), the code that reads and draws
// every data sprite (engine/data-sprite.js, engine/data-frames.js, engine/pieces.js, catalog/sprite-schema.js, with all
// they import, every generator family included) and the loaders tools/lib/assets.mjs and pieces-index.mjs.
//
//   node tools/lib/versions-build.mjs [--root <dir>] [--only id,id] [--no-cache]      write generated/versions.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importGraph } from './imports.mjs';
import { isSpriteFile, loadSpriteFile, assertNoCodeSprites } from './assets.mjs';
import { pieceFilesFor } from './pieces-index.mjs';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VERSIONS_FILE = 'generated/versions.json';
const CACHE_FILE = 'generated/.versions-cache.json';
/** How many versions the build makes per asset: the asset page's row. */
export const VERSIONS_PER_ASSET = 12;

const sha = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);

// what reads and draws every data sprite, besides engine/versions.js (each with everything it imports)
const DATA_CODE = ['engine/data-sprite.js', 'engine/data-frames.js', 'engine/pieces.js', 'catalog/sprite-schema.js'];
// the loaders a data sprite goes through before its engine draws it (these tools' own files, named as in any project)
const TOOLS_LIB = path.dirname(fileURLToPath(import.meta.url));
const DATA_LOADERS = ['assets.mjs', 'pieces-index.mjs'];

/**
 * The cache key of one asset's versions: a hash of the asset's file and every file that it and engine/versions.js load;
 * for a data sprite (.json) also the code that draws it and the pieces it uses (see the top of this file).
 * graph: from importGraph({ root }); file: the asset's absolute path; root: the project folder. An import that cannot be followed changes the key every time.
 */
export function versionsKey(graph, file, root = HERE) {
  const data = file.endsWith('.json') && path.basename(path.dirname(file)) === 'sprites';
  const { files, unknown } = graph.closure([file, path.join(root, 'engine', 'versions.js'), ...(data ? DATA_CODE.map((f) => path.join(root, f)) : [])]);
  const parts = files.map((f) => `${path.relative(root, f)}:${fs.existsSync(f) ? sha(fs.readFileSync(f)) : '-'}`);
  if (data) {
    let definition = null;
    try { definition = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* the load says why; the file's text is in the key already */ }
    if (definition) {
      const { files: pieces, missing } = pieceFilesFor(definition, { root });
      for (const f of pieces) parts.push(`${f}:${sha(fs.readFileSync(path.join(root, f)))}`);
      for (const f of missing) parts.push(`${f}:-`);
    }
    for (const f of DATA_LOADERS) parts.push(`tools/lib/${f}:${sha(fs.readFileSync(path.join(TOOLS_LIB, f)))}`);
  }
  if (unknown.length) parts.push(String(Date.now()));
  return sha(parts.join('\n'));
}

// only what differs from the defaults: a small file, and a page cleans it back over the defaults
const diffOf = (params, dflt) => Object.fromEntries(Object.entries(params).filter(([k, v]) => v !== dflt[k]));

/**
 * Every asset's ready-made versions: { id: [{ name, made, params } | { name, made, style }] }, ids sorted.
 * root: the project folder; only: ids to make (all when left out); cache: an object of earlier results (read and filled in).
 */
export async function buildVersions({ root = HERE, only = null, cache = null } = {}) {
  const imp = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const { versionsOf, soundVersionsOf } = await imp('engine/versions.js');
  const { defaultParams } = await imp('engine/sprite.js');
  const graph = importGraph({ root });
  const want = only ? new Set(only) : null;
  const out = {};
  // an asset's versions from the cache when its file and the framework are unchanged, otherwise made now
  const keep = async (id, file, make) => {
    const key = versionsKey(graph, file, root);
    if (cache && cache[id] && cache[id].key === key) { out[id] = cache[id].versions; return; }
    out[id] = await make();
    if (cache) cache[id] = { key, versions: out[id] };
  };
  assertNoCodeSprites(root);                                // a code file in sprites/ is refused, not skipped (R4a)
  const spriteDir = path.join(root, 'sprites');
  const spriteFiles = fs.readdirSync(spriteDir).filter(isSpriteFile).sort();
  for (const f of spriteFiles) {
    const id = f.replace(/\.json$/, '');
    if (want && !want.has(id)) continue;
    const file = path.join(spriteDir, f);
    await keep(id, file, async () => {
      const sprite = await loadSpriteFile(root, file);      // loaded only when its versions must be made: a data file read as data
      const dflt = defaultParams(sprite);
      return versionsOf(sprite, VERSIONS_PER_ASSET).map((v) => ({ name: v.name, made: v.made, params: diffOf(v.params, dflt) }));
    });
  }
  const soundDir = path.join(root, 'sounds');
  for (const f of fs.readdirSync(soundDir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
    const id = f.slice(0, -5);
    if (want && !want.has(id)) continue;
    if (out[id]) throw new Error(`versions: a sprite and a sound are both called "${id}"`);
    await keep(id, path.join(soundDir, f), () => {
      const patch = JSON.parse(fs.readFileSync(path.join(soundDir, f), 'utf8'));
      const dflt = Object.fromEntries((patch.params ?? []).map((d) => [d.id, d.default]));
      return soundVersionsOf(patch, VERSIONS_PER_ASSET).map((v) => (v.style ? { name: v.name, made: v.made, style: v.style } : { name: v.name, made: v.made, params: diffOf(v.params, dflt) }));
    });
  }
  return Object.fromEntries(Object.keys(out).sort().map((id) => [id, out[id]]));
}

/** Make every asset's versions and write generated/versions.json (with its cache). Returns { file, assets, made, ms }. root, only: as buildVersions; useCache: false to make everything again. */
export async function writeVersions({ root = HERE, only = null, useCache = true } = {}) {
  const t0 = Date.now();
  const cachePath = path.join(root, CACHE_FILE);
  let cache = {};
  if (useCache) try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { cache = {}; }
  const before = new Set(Object.entries(cache).map(([id, c]) => `${id}:${c.key}`));
  const all = await buildVersions({ root, only, cache });
  fs.mkdirSync(path.join(root, 'generated'), { recursive: true });
  const file = path.join(root, VERSIONS_FILE);
  fs.writeFileSync(file, JSON.stringify(all) + '\n');
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  const made = Object.keys(all).filter((id) => !before.has(`${id}:${cache[id]?.key}`)).length;
  return { file, assets: Object.keys(all).length, made, ms: Date.now() - t0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const res = await writeVersions({ root: arg('--root') ? path.resolve(arg('--root')) : HERE, only: arg('--only') ? arg('--only').split(',') : null, useCache: !process.argv.includes('--no-cache') });
  console.log(`versions: ${res.assets} assets (${res.made} made, the rest from the cache) in ${res.ms} ms -> ${path.relative(process.cwd(), res.file)}`);
}
