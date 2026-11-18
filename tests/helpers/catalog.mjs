// The built catalogue, for browser tests: what the site under test lists. Tests take their asset ids,
// names and counts from here, so adding assets never breaks them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** generated/catalog.json of the project (built first when it is not there). */
export function readCatalogue(root = ROOT) {
  const file = path.join(root, 'generated', 'catalog.json');
  if (!fs.existsSync(file)) execFileSync('node', [path.join(ROOT, 'tools', 'build.mjs'), '--root', root, '--skip-quality'], { cwd: ROOT, stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Lookups over a catalogue: rows by kind, by id, and how assets are tied together. */
export function catalogueOf(catalog) {
  const byId = Object.fromEntries(catalog.assets.map((a) => [a.id, a]));
  const ofKind = (kind) => catalog.assets.filter((a) => a.kind === kind);
  return {
    catalog, byId, ofKind,
    sprites: ofKind('sprite'), sounds: ofKind('sound'), music: ofKind('music'),
    bundle: (id) => catalog.bundles.find((b) => b.id === id),
    /** Sprites whose animations play this sound. */
    usersOf: (soundId) => ofKind('sprite').filter((a) => (a.tech.soundIds ?? []).includes(soundId)),
    /** Rows of the sounds a sprite plays that are on the site. */
    soundsOf: (spriteId) => (byId[spriteId]?.tech.soundIds ?? []).map((id) => byId[id]).filter(Boolean),
  };
}
