// Finds every asset in the source tree. There is no list to maintain:
// a file in sprites/ is a sprite, a file in sounds/ is a sound or a music track,
// a file in bundles/ is a bundle, a file bundles/specs/<id>.plan.json is the plan of a kit.
// Used by the build, the checkers and the tests.
//
// DATA SPRITES (docs/data-sprites.md, build item B9; section 10 DQ1: data sprites are sprites/<id>.json). A sprite is
// either a code file, sprites/<id>.js (a program, or the studio's fixed data wrapper, docs/studio.md 2.4), or a data
// file, sprites/<id>.json: one loadout-sprite definition (version 2, or version 1), JSON only. Both kinds live side by
// side until the removals (section 5); one id has one file. A data file is never imported: it is read as JSON, the
// pieces it names are read from the project's pieces/ (engine/pieces.js, tools/lib/pieces-index.mjs), and it is drawn by
// the project's own engine/data-sprite.js dataSprite, checked as a library file (strict: gaps in meta are errors; a
// sound cue must name a sound in sounds/). So the build, the catalogue, the pictures, search, tools/check.mjs and
// tools/render.mjs take it like any sprite. Its catalogue row carries `rev`, a short hash of its definition (dataRev).
// The file goes through the project's catalog/sprite-schema.js parseSpriteJson first (Contract 15 rule 6: 128 KB, nesting
// and __proto__ refused before anything else runs on it; a file over 128 KB is not even read), and the sprite drawn
// takes any frame number, as a code sprite does (engine/data-frames.js framesInClip, the one app/catalog.js uses).
//
// pieces/ in the build: piecesProblems(root) is what the validate step refuses (an invalid piece file, a released
// version whose content changed or whose file is gone; Contract 15 rule 5), and refreshDataPictures removes the
// pictures of a data sprite whose pieces changed, so the thumbnails step draws them again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDataFile } from './data-file.mjs';
import { canonicalJson, nodePieceReader, buildPiecesIndex, checkPins, readPins, pieceFilesFor } from './pieces-index.mjs';
import * as ownFrames from '../../engine/data-frames.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const isAsset = (f, ext) => f.endsWith(ext) && !f.startsWith('_') && f !== 'index.js' && f !== 'index.json';
/** Is this file name (in sprites/) a sprite: a code file <id>.js or a data file <id>.json, not a helper (_*) or an index. */
export const isSpriteFile = (f) => isAsset(f, '.js') || isAsset(f, '.json');
const idOfFile = (f) => f.replace(/\.(js|json)$/, '');
const SPRITE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** The file of a sprite by its id: sprites/<id>.js or sprites/<id>.json as an absolute path (the code file when both exist), or null. Only a plain id, never a path. */
export function findSpriteFile(root = ROOT, id) {
  if (typeof id !== 'string' || !SPRITE_ID.test(id)) return null;
  for (const ext of ['.js', '.json']) { const f = path.join(root, 'sprites', `${id}${ext}`); if (fs.existsSync(f)) return f; }
  return null;
}

/** Every sprite id of a project, code and data files alike, sorted (for "Known: ..." lists). */
export function spriteIds(root = ROOT) {
  const dir = path.join(root, 'sprites');
  if (!fs.existsSync(dir)) return [];
  return [...new Set(fs.readdirSync(dir).filter(isSpriteFile).map(idOfFile))].sort();
}

/** The revision of a data sprite's definition: 12 hex characters of SHA-256 over its canonical JSON, so spacing and key order do not count (docs/data-sprites.md 2.8). */
export function dataRev(definition) {
  return crypto.createHash('sha256').update(canonicalJson(definition)).digest('hex').slice(0, 12);
}

/** The ids of a project's sounds (sounds/<id>.json), what a data sprite's cues may name. */
function soundIdsOf(root) {
  const dir = path.join(root, 'sounds');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => isAsset(f, '.json')).map((f) => f.slice(0, -5)).sort() : [];
}

// a project's own engine, once per project folder: its dataSprite and its piece store, given a disk reader of its pieces/
const engines = new Map();
function dataEngine(root) {
  if (!engines.has(root)) {
    const p = (async () => {
      const at = (rel) => {
        const f = path.join(root, rel);
        if (!fs.existsSync(f)) throw new Error(`${rel} is missing in ${root}: a data sprite is drawn by the project's own engine`);
        return import(pathToFileURL(f).href);
      };
      const [D, P, S] = await Promise.all([at('engine/data-sprite.js'), at('engine/pieces.js'), at('catalog/sprite-schema.js')]);
      // the project's own framesInClip (engine/data-frames.js, in its picture and quality keys); a copy made before it existed uses this one's
      const F = fs.existsSync(path.join(root, 'engine', 'data-frames.js')) ? await at('engine/data-frames.js') : ownFrames;
      const store = P.sitePieces();
      store.useReader(nodePieceReader(root));
      return { dataSprite: D.dataSprite, framesInClip: F.framesInClip, store, parse: S.parseSpriteJson, maxBytes: S.SPRITE_LIMITS?.jsonBytes ?? 128 * 1024 };
    })();
    p.catch(() => engines.delete(root));
    engines.set(root, p);
  }
  return engines.get(root);
}

/** Reads and draws one data file: { def (the sprite), value (the definition as written) }; throws an Error that starts with the file's name. */
async function readDataSprite(root, file, { soundIds } = {}) {
  root = path.resolve(root);
  const abs = path.resolve(root, file);
  const inside = abs.startsWith(root + path.sep);
  const rel = inside ? path.relative(root, abs).split(path.sep).join('/') : abs;
  const { dataSprite, framesInClip, store, parse, maxBytes } = await dataEngine(root);
  // the wall first (Contract 15 rule 6): too big is refused before it is read, then parseSpriteJson (nesting, __proto__)
  let size;
  try { size = fs.statSync(abs).size; } catch (e) { throw new Error(`${rel}: cannot be read (${e.code || e.message})`); }
  if (size > maxBytes) throw new Error(`${rel}: the definition is ${Math.ceil(size / 1024)} KB of text; the most is ${Math.round(maxBytes / 1024)} KB`);
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { throw new Error(`${rel}: cannot be read (${e.code || e.message})`); }
  const parsed = parse(text);
  if (!parsed.ok) {
    const e = parsed.errors.join('; ');
    throw new Error(/not JSON/.test(e) ? `${rel}: not valid JSON (${e})` : `${rel}: ${e}`);
  }
  // a library file holds no such keys at all (parseSpriteJson drops them and warns)
  const proto = parsed.warnings.find((w) => /__proto__/.test(w));
  if (proto) throw new Error(`${rel}: ${proto}; take them out of the file`);
  const value = parsed.value;
  const got = await store.loadFor(value);
  if (!got.ok) throw new Error(`${rel}: a piece it uses could not be loaded: ${got.errors.slice(0, 6).join('; ')}`);
  let def;
  try { def = dataSprite(value, { strict: true, soundIds: soundIds ?? soundIdsOf(root) }); } catch (e) { throw new Error(`${rel}: ${e.message}`); }
  return { def: framesInClip(def), value };
}

/**
 * Loads one data sprite file (sprites/<id>.json, or any path) with the engine and pieces of the project at root, checked
 * as a library file. Returns the sprite (what defineSprite returns); throws an Error that starts with the file's name.
 * Arguments: root (the project folder), file (absolute, or relative to root), { soundIds } (default: the project's sounds).
 */
export async function loadDataSprite(root = ROOT, file, opts = {}) {
  return (await readDataSprite(root, file, opts)).def;
}

/**
 * Loads one sprite file of either kind (build item B9c): a data file (.json) with loadDataSprite and the engine and
 * pieces of the project at root, a code file (.js) imported. With findSpriteFile it is how a tool loads a sprite by id
 * (tools/scene.mjs, tools/tilemap.mjs, tools/lib/versions-build.mjs). Returns the sprite (what defineSprite returns);
 * throws an Error that starts with the file's name. Arguments: root, file (absolute, or relative to root), opts (as loadDataSprite takes them).
 */
export async function loadSpriteFile(root = ROOT, file, opts = {}) {
  const abs = path.resolve(root, file);
  if (abs.endsWith('.json')) return loadDataSprite(root, abs, opts);
  const rel = abs.startsWith(path.resolve(root) + path.sep) ? path.relative(root, abs).split(path.sep).join('/') : abs;
  if (!fs.existsSync(abs)) throw new Error(`${rel}: there is no such file`);
  let def;
  try { def = (await import(pathToFileURL(abs).href)).default; } catch (e) { throw new Error(`${rel}: ${e.message}`); }
  if (!def || typeof def.render !== 'function') throw new Error(`${rel}: the default export is not a sprite`);
  return def;
}

/**
 * What the build's validate step refuses in pieces/ (build item B9; Contract 15 rule 5, a released version never changes):
 * every piece file that is not valid (tools/lib/pieces-index.mjs buildPiecesIndex), every pinned version whose content
 * changed, and every pinned version whose file is gone. A version with no pin yet is not refused (it is pinned when
 * released: node tools/lib/pieces-index.mjs --pin). Returns [messages], each naming the file or the version; [] when
 * there is no pieces/. Arguments: root (the project).
 */
export function piecesProblems(root = ROOT) {
  if (!fs.existsSync(path.join(root, 'pieces'))) return [];
  const { index, errors } = buildPiecesIndex({ root });
  let pins;
  try { pins = readPins(root); } catch (e) { return [...errors, `pieces/_pins.json: not valid JSON (${e.message})`]; }
  const p = checkPins(index, pins);
  return [
    ...errors,
    ...p.changed.map((r) => `${r} is released (pinned in pieces/_pins.json) and its content changed: put the change in a new version instead, and put this one back`),
    ...p.gone.map((r) => `${r} is released (pinned in pieces/_pins.json) and its file is gone: put the file back; a released version is never removed`),
  ];
}

// the files besides pieces/ a data sprite's pictures are keyed on: what reads and cleans it before engine/ draws it.
// [name, file]: the name is what the key hashes, always a path relative to a project (never an absolute path), so the
// same project gives the same keys in any checkout; the file is where it is read (the project's schema, these tools' own loaders).
const TOOLS_LIB = path.dirname(fileURLToPath(import.meta.url));
const PICTURE_LOADERS = [
  ['catalog/sprite-schema.js', (root) => path.join(root, 'catalog', 'sprite-schema.js')],
  ['tools/lib/assets.mjs', () => path.join(TOOLS_LIB, 'assets.mjs')],
  ['tools/lib/pieces-index.mjs', () => path.join(TOOLS_LIB, 'pieces-index.mjs')],
];

/**
 * Removes the thumbnail and strip of every data sprite whose pieces or loaders changed since the last build, so
 * tools/lib/thumbs.mjs writeImages (which keys pictures on the sprite's own file and on engine/ and rigs/, not on pieces/
 * or catalog/) draws them again. A data sprite's key is the content of every piece file it loads, with what those use
 * (pieceFilesFor), and of what reads it before drawing (the project's catalog/sprite-schema.js, this file and
 * pieces-index.mjs), kept in <root>/.cache/build.json as dataPictures. Call it just before writeImages. Returns the ids whose pictures were removed.
 * Arguments: { root, sprites (loadSprites' list) }.
 */
export function refreshDataPictures({ root = ROOT, sprites = [] } = {}) {
  const cacheFile = path.join(root, '.cache', 'build.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  const old = cache.dataPictures ?? {};
  const now = {}, removed = [];
  for (const s of sprites) {
    if (!s.data) continue;
    let definition = null;
    try { definition = JSON.parse(fs.readFileSync(path.join(root, s.file), 'utf8')); } catch { continue; }
    const { files, missing } = pieceFilesFor(definition, { root });
    const h = crypto.createHash('sha1');
    // what reads the file before engine/ draws it (thumbs.mjs keys on engine/ and rigs/ only): the project's schema and these loaders
    for (const [name, where] of PICTURE_LOADERS) { const a = where(root); h.update(name); h.update('\0'); h.update(fs.existsSync(a) ? fs.readFileSync(a) : '(missing)'); h.update('\0'); }
    for (const f of files) { h.update(f); h.update('\0'); h.update(fs.readFileSync(path.join(root, f))); h.update('\0'); }
    for (const f of missing) { h.update(f); h.update('\0(missing)\0'); }
    now[s.id] = h.digest('hex');
    if (old[s.id] === now[s.id]) continue;
    const pics = [`generated/thumbs/${s.id}.png`, `generated/strips/${s.id}.png`].map((f) => path.join(root, f)).filter((f) => fs.existsSync(f));
    for (const f of pics) fs.rmSync(f);
    if (pics.length) removed.push(s.id);
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ ...cache, dataPictures: now }, null, 2) + '\n');
  return removed.sort();
}

/** Reads a JSON file; a parse error names the file (rel) and the problem. */
function readJSON(abs, rel) {
  const text = fs.readFileSync(abs, 'utf8');
  try { return JSON.parse(text); } catch (e) { throw new Error(`${rel}: not valid JSON (${e.message})`); }
}

/**
 * [{ id, file, def }] — def is what defineSprite returned. Sorted by file name. A data file (sprites/<id>.json) also
 * has data: true and rev (dataRev of its definition). Throws naming the file for one that cannot be loaded, and for an
 * id that has both a code file and a data file.
 */
export async function loadSprites(root = ROOT) {
  const dir = path.join(root, 'sprites');
  const out = [];
  const names = fs.readdirSync(dir).filter(isSpriteFile).sort();
  const seen = new Map();
  for (const f of names) {
    const id = idOfFile(f);
    if (seen.has(id)) throw new Error(`sprites/${seen.get(id)} and sprites/${f}: one sprite has one file; keep the code file or the data file, not both`);
    seen.set(id, f);
  }
  const soundIds = names.some((f) => f.endsWith('.json')) ? soundIdsOf(root) : null;
  for (const f of names) {
    const file = path.join(dir, f);
    if (f.endsWith('.json')) {
      const id = f.slice(0, -5);
      const { def, value } = await readDataSprite(root, file, { soundIds });
      if (def.id !== id) throw new Error(`sprites/${f}: "id" must be "${id}" (found ${def.id})`);
      out.push({ id, file: `sprites/${f}`, def, data: true, rev: dataRev(value) });
      continue;
    }
    let def;
    // a file made in the studio must be exactly its data form before it is run (docs/studio.md 2.4); throws naming the file
    checkDataFile(fs.readFileSync(file, 'utf8'), `sprites/${f}`);
    try { def = (await import(pathToFileURL(file).href)).default; } catch (e) { throw new Error(`sprites/${f}: ${e.message}`); }
    const id = f.slice(0, -3);
    if (!def || def.id !== id) throw new Error(`sprites/${f}: the default export must be a sprite whose id is "${id}" (found ${def && def.id})`);
    out.push({ id, file: `sprites/${f}`, def });
  }
  return out;
}

/** [{ id, file, patch, isMusic }] — sound effects and music tracks. Sorted by id. */
export function loadSounds(root = ROOT) {
  const dir = path.join(root, 'sounds');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => isAsset(x, '.json')).sort()) {
    const patch = readJSON(path.join(dir, f), `sounds/${f}`);
    const id = f.slice(0, -5);
    if (patch.id !== id) throw new Error(`sounds/${f}: "id" must be "${id}" (found ${patch.id})`);
    out.push({ id, file: `sounds/${f}`, patch, isMusic: patch.category === 'music' });
  }
  return out;
}

/** [{ id, name, gameType, blurb, sprites: [], sounds: [], music: [], ... }] from bundles/*.json. */
export function loadBundles(root = ROOT) {
  const dir = path.join(root, 'bundles');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((x) => isAsset(x, '.json')).sort().map((f) => {
    const b = readJSON(path.join(dir, f), `bundles/${f}`);
    const id = f.slice(0, -5);
    if (b.id !== id) throw new Error(`bundles/${f}: "id" must be "${id}" (found ${b.id})`);
    return { ...b, file: `bundles/${f}` };
  });
}

/**
 * What a full game kit holds: [fewest, most] of each kind (the first acceptance criterion: 40 to 50 sprites,
 * 20 sounds and 2 music tracks). tools/bundles-from-plans.mjs says so when a plan is outside it, and
 * tests/e2e/three-bundles.spec.mjs needs at least three kits of this size.
 */
export const KIT_SIZE = Object.freeze({ sprites: Object.freeze([40, 50]), sounds: Object.freeze([20, 20]), music: Object.freeze([2, 2]) });

/**
 * What any kit may hold: [fewest, most] of each kind. A kit can be smaller than a full kit (a falling-block puzzle
 * needs about 24 sprites, not 40; Keyang, 2026-11-19), so tests/e2e/three-bundles.spec.mjs holds every kit to this
 * range and only the count of full kits to KIT_SIZE.
 */
export const SMALL_KIT_SIZE = Object.freeze({ sprites: Object.freeze([12, 50]), sounds: Object.freeze([8, 30]), music: Object.freeze([1, 4]) });

/**
 * The most a plan's own size may ask for of each kind (kitSize): four times the most any kit may hold without a size
 * of its own (SMALL_KIT_SIZE). The fewest it may ask for is 1 of each kind. A bound against a slip of the hand
 * (600 for 60), not a rule about what a kit should be.
 */
export const KIT_SIZE_MOST = Object.freeze({ sprites: 200, sounds: 120, music: 16 });

/**
 * What is wrong with a plan's own `size`: a list of sentences, empty when it is { sprites, sounds, music }, each
 * [fewest, most]: two whole numbers, 1 or more, fewest not above most, most not above KIT_SIZE_MOST.
 * size: the value of a plan's "size" field.
 */
export function kitSizeFaults(size) {
  const kinds = Object.keys(SMALL_KIT_SIZE);
  if (size === null || typeof size !== 'object' || Array.isArray(size)) return [`"size" must be { ${kinds.join(', ')} }, each [fewest, most] (found ${JSON.stringify(size)})`];
  const out = [];
  for (const key of Object.keys(size)) if (!kinds.includes(key)) out.push(`"size.${key}" is not a kind of asset a kit holds (the kinds are ${kinds.join(', ')})`);
  for (const kind of kinds) {
    const r = size[kind];
    if (!Array.isArray(r) || r.length !== 2 || !r.every((n) => Number.isInteger(n))) { out.push(`"size.${kind}" must be [fewest, most]: two whole numbers (found ${JSON.stringify(r)})`); continue; }
    const [lo, hi] = r, found = `"size.${kind}" is [${lo}, ${hi}]`;
    if (lo < 1) out.push(`${found}; a kit holds at least 1`);
    else if (lo > hi) out.push(`${found}; the fewest cannot be above the most`);
    else if (hi > KIT_SIZE_MOST[kind]) out.push(`${found}; the most a plan may ask for is ${KIT_SIZE_MOST[kind]} (KIT_SIZE_MOST in tools/lib/assets.mjs)`);
  }
  return out;
}

/**
 * The size one kit is held to: { sprites: [fewest, most], sounds: [fewest, most], music: [fewest, most] }. A plan
 * that declares its own `size` (a plan of any game type may: a falling-block puzzle is smaller than most kits, an
 * action-adventure bigger) has that size, and a bad one throws (kitSizeFaults); any other plan has the rule that
 * holds for every kit. KIT_SIZE and SMALL_KIT_SIZE are not changed by this, and neither is which kits count as full.
 * plan: a kit plan, or nothing. otherwise: the size of a plan that declares none; the caller's own rule
 * (SMALL_KIT_SIZE for the kit checks, KIT_SIZE for the size note of tools/bundles-from-plans.mjs).
 */
export function kitSize(plan, otherwise = SMALL_KIT_SIZE) {
  const own = plan && Object.hasOwn(plan, 'size') && plan.size !== undefined;
  if (own) {
    const faults = kitSizeFaults(plan.size);
    if (faults.length) throw new Error(faults.join('; '));
  }
  const from = own ? plan.size : otherwise;
  return Object.fromEntries(Object.keys(SMALL_KIT_SIZE).map((kind) => [kind, [...from[kind]]]));
}

/**
 * The kit plans: [{ id, file, plan }] from bundles/specs/<id>.plan.json, sorted by id. A plan is everything that
 * is about one kit (its name, game type, the sentence shown on its page, its palette, and the sprites, sounds and
 * music it holds), so a new kit is a new plan file and its assets. tools/bundles-from-plans.mjs turns a finished
 * plan into bundles/<id>.json. A bundle that has a plan is a full game kit; the small starter bundles have none.
 * A plan may declare its own `size` (kitSize); one that is not valid throws here, naming the plan's file.
 */
export function loadPlans(root = ROOT) {
  const dir = path.join(root, 'bundles', 'specs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.plan.json')).sort().map((f) => {
    const file = `bundles/specs/${f}`;
    const plan = readJSON(path.join(dir, f), file);
    const id = f.slice(0, -'.plan.json'.length);
    if (plan.id !== id) throw new Error(`${file}: "id" must be "${id}" (found ${plan.id}); a plan's file is named after its kit`);
    try { kitSize(plan); } catch (e) { throw new Error(`${file}: ${e.message}`); }
    return { id, file, plan };
  });
}

export async function loadAssets(root = ROOT) {
  return { sprites: await loadSprites(root), sounds: loadSounds(root), bundles: loadBundles(root) };
}
