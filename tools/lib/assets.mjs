// Finds every asset in the source tree. There is no list to maintain:
// a file in sprites/ is a sprite, a file in sounds/ is a sound or a music track,
// a file in bundles/ is a bundle. Used by the build, the checkers and the tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const isAsset = (f, ext) => f.endsWith(ext) && !f.startsWith('_') && f !== 'index.js' && f !== 'index.json';

/** [{ id, file, def }] — def is what defineSprite returned. Sorted by id. */
export async function loadSprites(root = ROOT) {
  const dir = path.join(root, 'sprites');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => isAsset(x, '.js')).sort()) {
    const file = path.join(dir, f);
    const def = (await import(pathToFileURL(file).href)).default;
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
    const patch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
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
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const id = f.slice(0, -5);
    if (b.id !== id) throw new Error(`bundles/${f}: "id" must be "${id}" (found ${b.id})`);
    return { ...b, file: `bundles/${f}` };
  });
}

export async function loadAssets(root = ROOT) {
  return { sprites: await loadSprites(root), sounds: loadSounds(root), bundles: loadBundles(root) };
}
