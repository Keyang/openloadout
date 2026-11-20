// Writes sprites/<id>.json from its writer tools/projectiles/<id>.mjs (see tools/projectiles/lib.mjs), or with --check
// only says whether the file on disk is what its writer gives. Run from anywhere:
//   node tools/projectiles/write.mjs [<id> ...] [--check]      (no id: all eight)
// A definition that tools/check.mjs's schema refuses is never written.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, PROJECTILE_IDS, fileText } from './lib.mjs';
import { validateSprite } from '../../catalog/sprite-schema.js';

/** The text the writer of `id` gives for sprites/<id>.json; throws when its definition is not valid. */
export async function writtenText(id) {
  if (!PROJECTILE_IDS.includes(id)) throw new Error(`${id}: not a projectile written here (${PROJECTILE_IDS.join(', ')})`);
  const w = await import(pathToFileURL(path.join(ROOT, 'tools', 'projectiles', `${id}.mjs`)).href);
  const def = w.definition();
  const v = validateSprite(def);
  if (!v.ok) throw new Error(`${id}: not a valid definition: ${(v.errors ?? []).slice(0, 5).join('; ')}`);
  return fileText(def);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), check = args.includes('--check'), ids = args.filter((a) => !a.startsWith('--'));
  let bad = 0;
  for (const id of ids.length ? ids : PROJECTILE_IDS) {
    const text = await writtenText(id), file = path.join(ROOT, 'sprites', `${id}.json`);
    if (check) {
      const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
      if (!same) bad++;
      console.log(`${same ? 'same' : 'DIFFERS'} sprites/${id}.json`);
    } else { fs.writeFileSync(file, text); console.log(`wrote sprites/${id}.json (${Buffer.byteLength(text)} bytes)`); }
  }
  process.exitCode = bad ? 1 : 0;
}
