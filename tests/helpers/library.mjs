// The library's sprites for tests, whatever their file kind (build item T1, B9c's review list; docs/data-sprites.md
// section 7). A library sprite is sprites/<id>.js (a code file) or sprites/<id>.json (a data file); the migration
// batches (M1 to M40) turn one into the other under the same id, so a test never imports sprites/<id>.js itself:
//
//   librarySprites()      every sprite in sprites/ that loads, code and data files alike (a scan: "every tileset there is")
//   libraryCoverage()     what that scan covered, checked against the files (a scan's t.diagnostic line)
//   librarySprite(id)     one library sprite by id, either kind (a test about that asset: "tiles-forest joins up")
//   hasLibrarySprite(id)  is there a library sprite with this id, either kind
//   codeSprite(id)        a CODE sprite for a test about the framework a code file uses (a rig, a helper): its frozen
//                         copy tests/fixtures/code-sprites/<id>.js when there is one, else the library's sprites/<id>.js
//   codeSpriteSource(id)  the source text of that code sprite; codeSpritesWhere(re) every code sprite whose source matches
//
// Loading goes through tools/lib/assets.mjs (findSpriteFile, loadSpriteFile), the loader the build uses, so a data
// file is checked and drawn exactly as on the site. Node only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, spriteIds, findSpriteFile, loadSpriteFile } from '../../tools/lib/assets.mjs';

export { ROOT };

/** Where frozen copies of code sprites live: the code file as it was before its redraw, imports pointing at ../../../ (a file in the fixed data form is kept word for word). */
export const FROZEN_DIR = path.join(ROOT, 'tests', 'fixtures', 'code-sprites');

const one = new Map();
/** Is there a library sprite with this id, a code file or a data file. */
export const hasLibrarySprite = (id) => findSpriteFile(ROOT, id) !== null;

/** The file of a library sprite relative to the project (sprites/<id>.js or sprites/<id>.json), or null. */
export function librarySpriteFile(id) {
  const f = findSpriteFile(ROOT, id);
  return f && path.relative(ROOT, f).split(path.sep).join('/');
}

/** One library sprite by id, whatever its file kind (what defineSprite returns); throws naming the id when there is none. Loaded once per process. */
export function librarySprite(id) {
  if (!one.has(id)) {
    const file = findSpriteFile(ROOT, id);
    const p = file ? loadSpriteFile(ROOT, file) : Promise.reject(new Error(`sprites/${id}: there is no library sprite with this id (neither .js nor .json)`));
    p.catch(() => {});
    one.set(id, p);
  }
  return one.get(id);
}

let all = null;
/**
 * Every sprite in sprites/ that loads, code and data files alike, sorted by id: { sprites: [{ id, file, def, data }],
 * unloadable: ['<file>: <why>'] }. A file another builder has half-written is named in unloadable, not thrown, so a
 * scan reports it and checks the rest. Loaded once per process.
 */
export function librarySprites() {
  if (!all) {
    all = (async () => {
      const sprites = [], unloadable = [];
      for (const id of spriteIds(ROOT)) {
        const abs = findSpriteFile(ROOT, id);
        const file = path.relative(ROOT, abs).split(path.sep).join('/');
        try {
          const def = await librarySprite(id);
          if (!def || def.id !== id) throw new Error(`its sprite's id is ${def && def.id}, not ${id}`);
          sprites.push({ id, file, def, data: file.endsWith('.json') });
        } catch (e) { unloadable.push(`${file}: ${String(e.message).split('\n')[0]}`); }
      }
      return { sprites, unloadable };
    })();
  }
  return all;
}

/**
 * What a scan of librarySprites() covered, checked against the files in sprites/ (for a scan's t.diagnostic): throws
 * when the loaded and unloadable sprites do not add up to every file, or the data files among them to every .json file,
 * so a scan cannot quietly lose a file kind. Returns one line: "<n> sprites checked (<d> data files) of <files>; not
 * loaded: <file: why> | ..." naming each file that did not load.
 */
export async function libraryCoverage() {
  const { sprites, unloadable } = await librarySprites();
  const ids = spriteIds(ROOT), json = ids.filter((id) => findSpriteFile(ROOT, id).endsWith('.json')).length;
  const data = sprites.filter((s) => s.data).length, dataOut = unloadable.filter((u) => /^sprites\/[^:]*\.json:/.test(u)).length;
  if (sprites.length + unloadable.length !== ids.length) throw new Error(`librarySprites covers ${sprites.length} + ${unloadable.length} unloadable of ${ids.length} files in sprites/`);
  if (data + dataOut !== json) throw new Error(`librarySprites covers ${data} + ${dataOut} unloadable of ${json} data files in sprites/`);
  return `${sprites.length} sprites checked (${data} data files) of ${ids.length}; not loaded: ${unloadable.length ? unloadable.join(' | ') : 'none'}`;
}

// ---- code sprites, for tests about the framework their code uses ---------------------------------------------------

/** The file a code sprite is read from: its frozen copy when there is one (a framework test keeps testing the code it was written against), else the library's sprites/<id>.js, else null. */
export function codeSpriteFile(id) {
  for (const f of [path.join(FROZEN_DIR, `${id}.js`), path.join(ROOT, 'sprites', `${id}.js`)]) if (fs.existsSync(f)) return f;
  return null;
}

/** The source text of a code sprite (codeSpriteFile), or null when there is neither a frozen copy nor a code file. */
export function codeSpriteSource(id) {
  const f = codeSpriteFile(id);
  return f && fs.readFileSync(f, 'utf8');
}

/**
 * A code sprite for a test about the framework its code uses (a rig, a helper module): the frozen copy
 * tests/fixtures/code-sprites/<id>.js when there is one, else the library's sprites/<id>.js. A frozen copy of a file in
 * the fixed data form (a studio file or a converted library file, docs/studio.md 2.4) is kept word for word, so it is
 * read with catalog/data-file.js and made with engine/data-sprite.js dataSprite, exactly what importing it does.
 * Throws when neither exists: freeze the code file (copy it there, imports to ../../../) before redrawing it.
 */
export async function codeSprite(id) {
  const file = codeSpriteFile(id);
  if (!file) throw new Error(`sprites/${id}.js is gone and tests/fixtures/code-sprites/${id}.js is not there: freeze the code file before redrawing it`);
  if (file.startsWith(FROZEN_DIR + path.sep)) {
    const text = fs.readFileSync(file, 'utf8');
    const DF = await import('../../catalog/data-file.js');
    if (DF.claimsStudioForm(text) || text.split('\n')[0] === DF.LIBRARY_HEADER) {
      const r = DF.readDataFile(text, { file: `tests/fixtures/code-sprites/${id}.js` });
      if (!r.ok) throw new Error(`tests/fixtures/code-sprites/${id}.js: ${r.errors.join('; ')}`);
      return (await import('../../engine/data-sprite.js')).dataSprite(r.value);
    }
  }
  return (await import(pathToFileURL(file).href)).default;
}

/**
 * Every code sprite whose source matches `re` (a rig's file name, say), frozen copies and the library's code files
 * together, one per id (the frozen copy first): [{ id, file, source }], sorted by id. A test about a rig keeps its
 * sprites when the library's are redrawn as data.
 */
export function codeSpritesWhere(re) {
  const ids = new Set();
  for (const dir of [FROZEN_DIR, path.join(ROOT, 'sprites')]) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.js') && !f.startsWith('_') && f !== 'index.js') ids.add(f.slice(0, -3));
  const out = [];
  for (const id of [...ids].sort()) {
    const file = codeSpriteFile(id), source = fs.readFileSync(file, 'utf8');
    if (re.test(source)) out.push({ id, file, source });
  }
  return out;
}

/**
 * The text of a code sprite as a file in a project's sprites/ folder (a scratch project of a test): codeSpriteSource with
 * a frozen copy's imports put back from ../../../ to ../. Throws when there is neither a frozen copy nor a code file.
 */
export function codeSpriteAsFile(id) {
  const text = codeSpriteSource(id);
  if (text === null) throw new Error(`sprites/${id}.js is gone and tests/fixtures/code-sprites/${id}.js is not there`);
  return text.replaceAll("from '../../../engine/", "from '../engine/").replaceAll("from '../../../rigs/", "from '../rigs/");
}

/**
 * The module of a code sprite (codeSpriteFile, frozen copy first), for a test that also needs its named exports
 * (knight.js weaponReach). A frozen copy in the fixed data form cannot be imported from tests/fixtures/ (its import
 * '../engine/data-sprite.js' is kept word for word); the form allows it one export, default, so its module is
 * { default: codeSprite(id) }. Throws as codeSprite does.
 */
export async function codeSpriteModule(id) {
  const file = codeSpriteFile(id);
  if (!file) throw new Error(`sprites/${id}.js is gone and tests/fixtures/code-sprites/${id}.js is not there: freeze the code file before redrawing it`);
  if (file.startsWith(FROZEN_DIR + path.sep)) {
    const DF = await import('../../catalog/data-file.js'), text = fs.readFileSync(file, 'utf8');
    if (DF.claimsStudioForm(text) || text.split('\n')[0] === DF.LIBRARY_HEADER) return Object.freeze({ __proto__: null, default: await codeSprite(id) });
  }
  return import(pathToFileURL(file).href);
}
