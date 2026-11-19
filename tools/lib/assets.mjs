// Finds every asset in the source tree. There is no list to maintain:
// a file in sprites/ is a sprite, a file in sounds/ is a sound or a music track,
// a file in bundles/ is a bundle, a file bundles/specs/<id>.plan.json is the plan of a kit.
// Used by the build, the checkers and the tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDataFile } from './data-file.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const isAsset = (f, ext) => f.endsWith(ext) && !f.startsWith('_') && f !== 'index.js' && f !== 'index.json';

/** Reads a JSON file; a parse error names the file (rel) and the problem. */
function readJSON(abs, rel) {
  const text = fs.readFileSync(abs, 'utf8');
  try { return JSON.parse(text); } catch (e) { throw new Error(`${rel}: not valid JSON (${e.message})`); }
}

/** [{ id, file, def }] — def is what defineSprite returned. Sorted by id. */
export async function loadSprites(root = ROOT) {
  const dir = path.join(root, 'sprites');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => isAsset(x, '.js')).sort()) {
    const file = path.join(dir, f);
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
 * The kit plans: [{ id, file, plan }] from bundles/specs/<id>.plan.json, sorted by id. A plan is everything that
 * is about one kit (its name, game type, the sentence shown on its page, its palette, and the sprites, sounds and
 * music it holds), so a new kit is a new plan file and its assets. tools/bundles-from-plans.mjs turns a finished
 * plan into bundles/<id>.json. A bundle that has a plan is a full game kit; the small starter bundles have none.
 */
export function loadPlans(root = ROOT) {
  const dir = path.join(root, 'bundles', 'specs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.plan.json')).sort().map((f) => {
    const file = `bundles/specs/${f}`;
    const plan = readJSON(path.join(dir, f), file);
    const id = f.slice(0, -'.plan.json'.length);
    if (plan.id !== id) throw new Error(`${file}: "id" must be "${id}" (found ${plan.id}); a plan's file is named after its kit`);
    return { id, file, plan };
  });
}

export async function loadAssets(root = ROOT) {
  return { sprites: await loadSprites(root), sounds: loadSounds(root), bundles: loadBundles(root) };
}
