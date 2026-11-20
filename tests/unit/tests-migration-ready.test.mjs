// The test suite is ready for the migration batches (build item T1, B9c's review list; docs/data-sprites.md section 7):
// every library sprite becomes sprites/<id>.json under the same id, one batch at a time, so no test may depend on a
// library sprite being a code file. Two ways, both in tests/helpers/library.mjs:
//   a test about a library asset loads it whatever its file kind (librarySprite, librarySprites, hasLibrarySprite);
//   a test about the framework a code file uses reads a frozen copy (codeSprite, tests/fixtures/code-sprites/).
// This file tests those helpers, the frozen copies, and that no test file goes around them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spriteIds, findSpriteFile } from '../../tools/lib/assets.mjs';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import {
  ROOT, FROZEN_DIR, librarySprite, librarySprites, hasLibrarySprite, librarySpriteFile,
  codeSprite, codeSpriteModule, codeSpriteFile, codeSpriteSource, codeSpritesWhere, codeSpriteAsFile, libraryCoverage,
} from '../helpers/library.mjs';

const ids = spriteIds(ROOT);
const kindOf = (id) => (findSpriteFile(ROOT, id).endsWith('.json') ? 'data' : 'code');
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

// ---- the library, whatever the file kind -------------------------------------------------------------------------

test('librarySprite loads a data file and a code file alike, by id', async (t) => {
  const data = ids.find((id) => kindOf(id) === 'data'), code = ids.find((id) => kindOf(id) === 'code');
  for (const id of [data, code].filter(Boolean)) {
    const def = await librarySprite(id);
    assert.equal(def.id, id);
    assert.equal(typeof def.render, 'function', `${id}: a sprite`);
    assert.equal(librarySpriteFile(id), `sprites/${id}.${kindOf(id) === 'data' ? 'json' : 'js'}`);
    assert.equal(hasLibrarySprite(id), true);
  }
  t.diagnostic(`a data file: ${data ?? 'none yet'}; a code file: ${code ?? 'none left'}`);
  assert.ok(data || code);
  assert.equal(await librarySprite(ids[0]), await librarySprite(ids[0]), 'loaded once per process');
});

test('librarySprite names an id that is not in the library; hasLibrarySprite says no', async () => {
  assert.equal(hasLibrarySprite('zz-not-a-sprite'), false);
  assert.equal(hasLibrarySprite('../tools/serve'), false, 'only a plain id');
  assert.equal(librarySpriteFile('zz-not-a-sprite'), null);
  await assert.rejects(librarySprite('zz-not-a-sprite'), /sprites\/zz-not-a-sprite: there is no library sprite/);
});

test('librarySprites is every file in sprites/, code and data files, each under its own id', async () => {
  const { sprites, unloadable } = await librarySprites();
  assert.equal(sprites.length + unloadable.length, ids.length);
  assert.deepEqual(sprites.map((s) => s.id), ids.filter((id) => sprites.some((s) => s.id === id)), 'sorted by id');
  for (const s of sprites) {
    assert.equal(s.def.id, s.id);
    assert.equal(s.file, librarySpriteFile(s.id));
    assert.equal(s.data, s.file.endsWith('.json'));
  }
  assert.equal(sprites.filter((s) => s.data).length, ids.filter((id) => kindOf(id) === 'data').length - unloadable.filter((u) => u.includes('.json:')).length);
  assert.ok(sprites.length >= 200, `${sprites.length} sprites loaded`);
});

// ---- frozen code sprites, for tests about the framework ----------------------------------------------------------

const FROZEN = fs.readdirSync(FROZEN_DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
const isDataForm = (text) => /^\/\/ (Made in the Loadout studio|Converted from code to data for the Loadout library)\./.test(text);

test('every frozen copy loads as a sprite with the id of its file name; a code copy imports only ../../../engine and ../../../rigs', async () => {
  assert.ok(FROZEN.length >= 30, `${FROZEN.length} frozen copies`);
  for (const id of FROZEN) {
    const file = path.join(FROZEN_DIR, `${id}.js`), text = fs.readFileSync(file, 'utf8');
    assert.equal(codeSpriteFile(id), file, `${id}: the frozen copy comes first`);
    const def = await codeSprite(id);
    assert.equal(def.id, id, `${id}: the sprite's id`);
    assert.equal(typeof def.render, 'function', id);
    if (isDataForm(text)) continue;
    assert.match(text, /^\/\/ FROZEN COPY, not a sprite:/, `${id}: says what it is on its first line`);
    const from = [...text.matchAll(/^(?:import|export)[^;]*?from '([^']+)'/gm)].map((m) => m[1]);
    assert.ok(from.length >= 1, `${id}: imports the framework`);
    for (const f of from) assert.match(f, /^\.\.\/\.\.\/\.\.\/(engine|rigs)\//, `${id}: ${f}`);
  }
});

test('codeSprite of a frozen copy in the fixed data form is the sprite the file makes when imported', async (t) => {
  const wrappers = FROZEN.filter((id) => isDataForm(fs.readFileSync(path.join(FROZEN_DIR, `${id}.js`), 'utf8')));
  assert.ok(wrappers.length >= 2, `${wrappers.join(', ')}`);
  let compared = 0;
  for (const id of wrappers) {
    const frozen = await codeSprite(id);
    const lib = path.join(ROOT, 'sprites', `${id}.js`);
    // while the library's file is the same text, importing it gives the same pictures
    if (!fs.existsSync(lib) || fs.readFileSync(lib, 'utf8') !== fs.readFileSync(path.join(FROZEN_DIR, `${id}.js`), 'utf8')) continue;
    const imported = (await import(pathToFileURL(lib).href)).default, p = defaultParams(imported);
    assert.deepEqual(Object.keys(frozen.clips), Object.keys(imported.clips), id);
    for (const clip of Object.keys(imported.clips)) assert.ok(same(renderFrame(frozen, clip, 0, p), renderFrame(imported, clip, 0, p)), `${id} ${clip}`);
    compared++;
  }
  t.diagnostic(`${compared} compared with the library's file`);
});

test('codeSprite: a code file with no frozen copy is read from sprites/; with neither, it says to freeze the file first', async () => {
  const code = ids.find((id) => kindOf(id) === 'code' && !FROZEN.includes(id));
  if (code) {
    assert.equal(codeSpriteFile(code), path.join(ROOT, 'sprites', `${code}.js`));
    assert.equal((await codeSprite(code)).id, code);
  }
  assert.equal(codeSpriteFile('zz-not-a-sprite'), null);
  assert.equal(codeSpriteSource('zz-not-a-sprite'), null);
  await assert.rejects(codeSprite('zz-not-a-sprite'), /freeze the code file before redrawing it/);
  await assert.rejects(codeSpriteModule('zz-not-a-sprite'), /freeze the code file before redrawing it/);
  assert.throws(() => codeSpriteAsFile('zz-not-a-sprite'), /zz-not-a-sprite/);
});

test('codeSpriteModule hands over named exports; codeSpriteAsFile puts the imports back for a project\'s sprites/ folder', async () => {
  const knight = await codeSpriteModule('knight');
  assert.equal(knight.default.id, 'knight');
  assert.equal(typeof knight.weaponReach, 'function');
  const text = codeSpriteAsFile('knight');
  assert.ok(!text.includes("'../../../"), 'no import left pointing out of tests/');
  assert.match(text, /from '\.\.\/engine\/sprite\.js'/);
  assert.match(text, /from '\.\.\/rigs\//);
});

test('codeSpriteModule of a frozen copy in the fixed data form is its one export, default, the sprite codeSprite makes', async () => {
  // its word-for-word import '../engine/data-sprite.js' does not resolve from tests/fixtures/ (B9c review round 2, issue 3)
  const wrappers = FROZEN.filter((id) => isDataForm(fs.readFileSync(path.join(FROZEN_DIR, `${id}.js`), 'utf8')));
  assert.ok(wrappers.includes('rogue-battler'), wrappers.join(', '));
  for (const id of wrappers) {
    const m = await codeSpriteModule(id);
    assert.deepEqual(Object.keys(m), ['default'], `${id}: a file in the data form exports only its sprite`);
    assert.equal(m.default.id, id);
    const made = await codeSprite(id), p = defaultParams(made);
    for (const clip of Object.keys(made.clips)) assert.ok(same(renderFrame(m.default, clip, 0, p), renderFrame(made, clip, 0, p)), `${id} ${clip}`);
  }
});

// ---- frozen copies stay as they were frozen ----------------------------------------------------------------------

// tests/fixtures/code-sprites/SHA256SUMS: one line per copy, "<sha256 of the file>  <file>" (the format sha256sum
// writes and `shasum -a 256 -c` checks). A migration batch that freezes a code file adds its line; nobody edits a copy.
const SUMS = path.join(FROZEN_DIR, 'SHA256SUMS');
test('every frozen copy is pinned by its SHA-256 in SHA256SUMS, and no copy has changed since it was frozen', () => {
  const pinned = Object.fromEntries(fs.readFileSync(SUMS, 'utf8').split('\n').filter((l) => l.trim()).map((l) => {
    const m = /^([0-9a-f]{64}) {2}([\w-]+\.js)$/.exec(l);
    assert.ok(m, `SHA256SUMS: not "<sha256>  <id>.js": ${l}`);
    return [m[2], m[1]];
  }));
  const files = FROZEN.map((id) => `${id}.js`);
  assert.deepEqual(files.filter((f) => !(f in pinned)), [], 'a new frozen copy: add its line to SHA256SUMS (shasum -a 256 <file>)');
  assert.deepEqual(Object.keys(pinned).filter((f) => !files.includes(f)), [], 'a copy that went (R1 to R4): take its line out of SHA256SUMS');
  const changed = files.filter((f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(FROZEN_DIR, f))).digest('hex') !== pinned[f]);
  assert.deepEqual(changed, [], 'never edit a frozen copy (tests/fixtures/code-sprites/README.md): a test that needs a changed drawing tests the library asset');
});

test('codeSpritesWhere finds the code on a rig, the frozen copy first, one per id', () => {
  const onRig = codeSpritesWhere(/rigs\/topdown(-[\w-]+)?\.js/);
  assert.ok(onRig.length >= 9, `${onRig.length}`);
  assert.equal(new Set(onRig.map((s) => s.id)).size, onRig.length);
  const hero = onRig.find((s) => s.id === 'hero-walker');
  assert.ok(hero, 'hero-walker is on the rig');
  assert.equal(hero.file, path.join(FROZEN_DIR, 'hero-walker.js'));
  for (const s of onRig) assert.equal(s.file, codeSpriteFile(s.id));
});

// ---- no test goes around the helpers -----------------------------------------------------------------------------

// Files that still import a library code sprite by id, each with why (they belong to builders working on them now:
// the frozen copies they need are already in tests/fixtures/code-sprites/, so each switch is one line: codeSprite(id)).
const KNOWN = {
  'tests/unit/gen-b12-fx.test.mjs': 'B12b: port test against blaster-bolt (frozen)',
  'tests/unit/gen-tiles-clips.test.mjs': 'B15: port test against tiles-forest (frozen)',
  'tests/unit/gen-tiles-rules.test.mjs': 'B15: download rules against tiles-forest, tiles-cave, tiles-dungeon (frozen)',
  'tests/unit/gen-tiles-quality.test.mjs': 'B15: quality against tiles-cave, tiles-dungeon (frozen)',
  'tests/unit/gen-ui-panel.test.mjs': 'B13: port test against ui-buttons-wood, ui-dialogue, ui-bars-flat (frozen)',
  'tests/unit/data-sprite-v2-emitters.test.mjs': 'B12b: redraws against blaster-bolt, plasma-burst, hit-spark (frozen)',
};
// Files allowed to name sprites/<id>.js of the real project: the helper that does it for everyone, this file, and
// conversion-c1, which reads a candidate code file and skips it, saying so, once it is gone (due to go in P3).
const HELPERS = new Set(['tests/helpers/library.mjs', 'tests/unit/tests-migration-ready.test.mjs', 'tests/unit/conversion-c1.test.mjs']);
const testFiles = () => ['tests/unit', 'tests/e2e', 'tests/helpers'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => /\.(test|spec)?\.?mjs$/.test(f)).map((f) => `${d}/${f}`));

const STR_JS = String.raw`(?<q>[\x60'"])[^\x60'"\n]*\.js\k<q>`;   // a string or template literal naming a .js file
/**
 * The names a test file gives the real project's folder (ROOT, REAL, or a const made from import.meta.url two levels
 * up) and its sprites/ folder (a const of path.join(<root>, 'sprites') or new URL('../../sprites/', ...)). A scratch
 * project's folder (root, dir, scratch, ...) is not one of them.
 */
function realNames(text) {
  const roots = new Set(['ROOT', 'REAL']), dirs = new Set();
  for (const m of text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*([^\n;]*)/g)) {
    const [, name, rhs] = m;
    if (/import\.meta\.url/.test(rhs) && /(?:'\.\.',\s*'\.\.'\s*\)|'\.\.\/\.\.'\s*\)|new URL\(\s*'\.\.\/\.\.\/'\s*,\s*import\.meta\.url\s*\))\s*$/.test(rhs.trim().replace(/;$/, ''))) roots.add(name);
  }
  const R = [...roots].join('|');
  for (const m of text.matchAll(new RegExp(String.raw`(?:const|let)\s+(\w+)\s*=\s*(?:path\.(?:join|resolve)\(\s*(?:${R})\s*,\s*'sprites'\s*\)|new URL\(\s*'(?:\.\.\/\.\.\/)?sprites\/?'\s*,\s*(?:import\.meta\.url|${R})\s*\))`, 'g'))) dirs.add(m[1]);
  return { roots: R, dirs: [...dirs].join('|') || '(?!)' };
}

/** The lines of a test file's text that import or read a library sprite's code file of the real project, 1-based. */
function codeFileUses(text) {
  const { roots, dirs } = realNames(text);
  const JS_END = String.raw`[^)\n]*?\.js[\x60'"]`;   // the rest of the call's arguments, up to a literal ending in .js (`${id}.js`, id + '.js')
  const forms = [
    /(?:\bimport\s*\(\s*|\bfrom\s+)[`'"](?:\.\.\/\.\.\/|\/)sprites\/[^)\n]*?\.js[`'"]/,                   // import x from '../../sprites/knight.js', e2e '/sprites/knight.js', '../../sprites/' + id + '.js'
    /new URL\(\s*[`'"]\.\.\/\.\.\/sprites\/[^`'"]*\.js[`'"]/,                                             // new URL('../../sprites/wizard.js', import.meta.url)
    new RegExp(String.raw`new URL\(\s*[\x60'"]sprites\/[^\x60'"]*\.js[\x60'"]\s*,\s*(?:${roots})\s*\)`),  // new URL('sprites/wizard.js', ROOT)
    new RegExp(String.raw`path\.(?:join|resolve)\(\s*(?:${roots})\s*,\s*[\x60'"]sprites(?:[\x60'"]\s*,|\/)${JS_END}`), // path.join(ROOT, 'sprites', id + '.js'), path.join(ROOT, 'sprites/wizard.js')
    new RegExp(String.raw`path\.(?:join|resolve)\(\s*(?:${dirs})\s*,${JS_END}`),                         // path.join(SPRITES, `${id}.js`)
    new RegExp(String.raw`\x60\$\{(?:${roots})\}\/sprites\/[^\x60\n]*\.js\x60`),                          // `${ROOT}/sprites/wizard.js`
    new RegExp(String.raw`\b(?:${roots})\s*\+\s*[\x60'"]\/sprites\/${JS_END}`),                          // ROOT + '/sprites/' + id + '.js'
    new RegExp(String.raw`path\.(?:join|resolve)\([^\n]*?[\x60'"](?:\.\.\/){2}sprites\/${JS_END}`),      // path.join(HERE, '../../sprites/wizard.js'), HERE a test's own folder
    new RegExp(String.raw`path\.(?:join|resolve)\([^\n]*?'\.\.'\s*,\s*'\.\.'\s*,\s*'sprites'\s*,${JS_END}`), // path.join(HERE, '..', '..', 'sprites', 'wizard.js')
  ];
  // a check that the code file is GONE (assert.equal(fs.existsSync(...), false) or !fs.existsSync(...)) holds after the redraw
  const gone = /existsSync\([^\n]*\)\s*,\s*false\b|!\s*fs\.existsSync\(/;
  const out = [];
  text.split('\n').forEach((l, i) => { if (!l.trim().startsWith('//') && !gone.test(l) && forms.some((re) => re.test(l))) out.push(i + 1); });
  return out;
}

/** The lines of a test file's text that list the real project's sprites/ folder keeping only .js files, 1-based. */
function codeOnlyScans(text) {
  const { roots, dirs } = realNames(text);
  const listing = new RegExp(String.raw`readdirSync\(\s*(?:path\.(?:join|resolve)\(\s*(?:${roots})\s*,\s*'sprites'\s*\)|new URL\(\s*'\.\.\/\.\.\/sprites\/?'|(?:${dirs})\s*[,)])`);
  const lines = text.split('\n'), out = [];
  lines.forEach((l, i) => {
    if (l.trim().startsWith('//') || !listing.test(l)) return;
    const near = lines.slice(i, i + 3).join('\n'), around = lines.slice(Math.max(0, i - 3), i + 2).join('\n');
    // kept to .js: endsWith('.js'), /\.js$/ or extname === '.js' with no .json beside it, or .json files dropped
    // (!f.endsWith('.json'), extname !== '.json'); a scan of the import graph says so and is excused
    const keepsJs = /endsWith\(\s*'\.js'\s*\)|\/\\\.js\$\/|extname\([^)]*\)\s*===?\s*'\.js'/.test(near) && !/json|isSpriteFile/.test(near);
    const dropsJson = /!\s*[\w.]+\.endsWith\(\s*'\.json'\s*\)|extname\([^)]*\)\s*!==?\s*'\.json'/.test(near);
    if ((keepsJs || dropsJson) && !/\bcodeSpritesWhere\b|import graph|data files import nothing/.test(around)) out.push(i + 1);
  });
  return out;
}

test('the guard catches the forms a test reads a code sprite by, and leaves a scratch project alone', () => {
  const head = "const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');\n";
  const caught = [
    "import knight from '../../sprites/knight.js';",
    "const w = (await import('../../sprites/wizard.js')).default;",
    "const t = fs.readFileSync(new URL('../../sprites/wizard.js', import.meta.url), 'utf8');",
    "await page.evaluate(() => import('/sprites/knight.js'));",
    "const w = (await import(pathToFileURL(path.join(ROOT, 'sprites', 'wizard.js')).href)).default;",
    "const f = path.join(ROOT, 'sprites', `${id}.js`);",
    "const SPRITES = path.join(ROOT, 'sprites');\nconst f = path.join(SPRITES, `${id}.js`);",
    "const HERE = new URL('../../', import.meta.url);\nconst t = fs.readFileSync(new URL('sprites/knight.js', HERE));",
    // B9c review round 2 (issue 2): forms the first guard let through
    "const f = path.join(ROOT, 'sprites', id + '.js');",
    "const f = path.join(ROOT, 'sprites/wizard.js');",
    "const f = path.join(ROOT, 'sprites/' + id + '.js');",
    "const t = fs.readFileSync(`${ROOT}/sprites/wizard.js`, 'utf8');",
    "const t = fs.readFileSync(ROOT + '/sprites/' + id + '.js', 'utf8');",
    "const w = (await import('../../sprites/' + 'wizard' + '.js')).default;",
    "const HERE = path.dirname(fileURLToPath(import.meta.url));\nconst t = fs.readFileSync(path.join(HERE, '../../sprites/wizard.js'), 'utf8');",
    "const t = fs.readFileSync(path.join(HERE, '..', '..', 'sprites', 'wizard.js'), 'utf8');",
    "const f = path.resolve(ROOT, 'sprites', `wizard.js`);",
  ];
  for (const c of caught) assert.ok(codeFileUses(head + c).length, `missed: ${c}`);
  const scratch = [
    "fs.writeFileSync(path.join(root, 'sprites', 'gone.js'), '');",
    "const f = path.join(dir, 'sprites', `${id}.js`);",
    "fs.copyFileSync(path.join(FIX, 'test-gem.js'), path.join(root, 'sprites', 'test-gem.js'));",
    "const def = await librarySprite('knight');",
    "assert.equal(fs.existsSync(path.join(ROOT, 'sprites', `${id}.js`)), false, 'the code file is deleted');",
    "const f = path.join(root, 'sprites/' + id + '.js');",
    "const t = fs.readFileSync(`${root}/sprites/wizard.js`, 'utf8');",
    "const f = path.join(ROOT, 'sprites', id + '.json');",
    "const f = path.join(ROOT, 'sprites', `${id}.json`);",
  ];
  for (const c of scratch) assert.deepEqual(codeFileUses(head + c), [], `flagged: ${c}`);

  const scans = [
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => f.endsWith('.js'))",
    "const SPRITES = path.join(ROOT, 'sprites');\nfor (const f of fs.readdirSync(SPRITES).filter((f) => f.endsWith('.js'))) {}",
    "const SPRITES = new URL('../../sprites/', import.meta.url);\nconst ids = fs.readdirSync(SPRITES)\n  .filter((f) => /\\.js$/.test(f));",
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => !f.endsWith('.json'))",
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => path.extname(f) === '.js')",
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => path.extname(f) !== '.json')",
  ];
  for (const c of scans) assert.ok(codeOnlyScans(head + c).length, `missed: ${c}`);
  const fine = [
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => /\\.(js|json)$/.test(f))",
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter(isSpriteFile)",
    "fs.readdirSync(path.join(root, 'sprites')).filter((f) => f.endsWith('.js'))",
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => f.endsWith('.js') || f.endsWith('.json'))",
    "fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => ['.js', '.json'].includes(path.extname(f)))",
  ];
  for (const c of fine) assert.deepEqual(codeOnlyScans(head + c), [], `flagged: ${c}`);
});

test('no test imports a library sprite as a code file by id, or reads its code by path, except the known ones', () => {
  const found = {};
  for (const f of testFiles()) {
    if (HELPERS.has(f)) continue;
    const lines = codeFileUses(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (lines.length) found[f] = lines;
  }
  assert.deepEqual(Object.keys(found).filter((f) => !(f in KNOWN)).map((f) => `${f}:${found[f].join(',')}`), [],
    'load a library sprite with tests/helpers/library.mjs (librarySprite for the asset, codeSprite for the framework its code uses)');
  for (const f of Object.keys(KNOWN)) if (!(f in found)) assert.fail(`${f} no longer imports a code sprite: take it out of KNOWN`);
});

test('no test scans sprites/ for code files only: a scan takes data files too', () => {
  const bad = [];
  for (const f of testFiles()) {
    if (HELPERS.has(f)) continue;
    for (const n of codeOnlyScans(fs.readFileSync(path.join(ROOT, f), 'utf8'))) bad.push(`${f}:${n}`);
  }
  assert.deepEqual(bad, [], 'use librarySprites() from tests/helpers/library.mjs');
});

// A unit test that fakes the built catalogue (globalThis.fetch) and then loads one of its sprites through
// app/catalog.js: a row with no src, or a src that is not a .json file, makes loadSprite import sprites/<id>.js. For a
// real library id that breaks when the id is redrawn (B9c review round 2, issue 1: catalog-studio-shadow and knight).
// Give such a row an id no library sprite uses and serve it with tests/helpers/code-standin.mjs (useCodeStandIn).
const LIBRARY_IDS = new Set([...ids, ...FROZEN]);   // every id that is, or was, a library sprite
/** The catalogue rows `{ id: '<x>', kind: 'sprite', ... }` (either key first) inside an `assets: [...]` list in a test file's text: [{ id, text }]. */
function spriteRows(text) {
  const lists = [];      // [start, end) of each assets: [...] list (a fake catalogue's); a bag item or a runtime row is not in one
  for (const m of text.matchAll(/\bassets:\s*\[/g)) {
    let depth = 0, end = m.index + m[0].length - 1;
    for (; end < text.length; end++) { if (text[end] === '[') depth++; else if (text[end] === ']' && --depth === 0) break; }
    lists.push([m.index, end]);
  }
  const out = [];
  for (const m of text.matchAll(/\{\s*(?:id:\s*'([\w-]+)'\s*,\s*kind:\s*'sprite'|kind:\s*'sprite'\s*,\s*id:\s*'([\w-]+)')/g)) {
    if (!lists.some(([a, b]) => m.index > a && m.index < b)) continue;
    let depth = 0, end = m.index;
    for (; end < text.length; end++) { if (text[end] === '{') depth++; else if (text[end] === '}' && --depth === 0) break; }
    out.push({ id: m[1] ?? m[2], text: text.slice(m.index, end + 1) });
  }
  return out;
}
/** The lines of a test file's text that load, through the site's catalogue, a library id its fake catalogue gives no .json src, 1-based. */
function fakeRowLoads(text, libraryIds = LIBRARY_IDS) {
  const risky = new Set(spriteRows(text).filter((r) => libraryIds.has(r.id) && !/\bsrc:\s*[\x60'"][^\x60'"]*\.json[\x60'"]/.test(r.text)).map((r) => r.id));
  if (!risky.size) return [];
  const out = [];
  text.split('\n').forEach((l, i) => {
    if (l.trim().startsWith('//')) return;
    for (const m of l.matchAll(/\bloadSprites?\(\s*\[?([^)\n]*)/g)) if ([...m[1].matchAll(/'([\w-]+)'/g)].some((q) => risky.has(q[1]))) { out.push(i + 1); return; }
  });
  return out;
}

test('the guard catches a fake catalogue row that makes the site import a library sprite\'s code file', () => {
  const lib = new Set(['knight', 'coin']);
  const caught = [
    "globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: 1, assets: [{ id: 'knight', kind: 'sprite', name: 'Hero', tech: {} }], bundles: [] }) });\nconst hero = await C.loadSprite('knight');",
    "const body = { assets: [{ kind: 'sprite', id: 'coin', tech: { clips: [] } }] };\nconst got = await m.loadSprites(['blob', 'coin']);",
    "const body = { assets: [{ id: 'knight', kind: 'sprite', src: 'sprites/knight.js', tech: {} }] };\nawait C.loadSprite('knight');",
  ];
  for (const c of caught) assert.ok(fakeRowLoads(c, lib).length, `missed: ${c}`);
  const fine = [
    "const body = { assets: [{ id: CODE_STANDIN, kind: 'sprite', tech: {} }] };\nawait C.loadSprite(CODE_STANDIN);",
    "const body = { assets: [{ id: 'knight', kind: 'sprite', name: 'Hero', tech: {} }] };\nassert.equal(C.assetById('knight').name, 'Hero');",
    "const body = { assets: [{ id: 'knight', kind: 'sprite', src: 'sprites/knight.json', tech: {} }] };\nawait C.loadSprite('knight');",
    "const body = { assets: [{ id: 'blob', kind: 'sprite', tech: {} }] };\nawait C.loadSprite('blob');",
    "const ROW = { id: 'coin', kind: 'sprite', runtime: true };\nm.addRuntimeAsset(ROW, COIN);\nawait m.loadSprite('coin');",
    "await openLink(page, [{ kind: 'sprite', id: 'knight', settings: {} }]);\nawait C.loadSprite('knight');",
  ];
  for (const c of fine) assert.deepEqual(fakeRowLoads(c, lib), [], `flagged: ${c}`);
});

test('no test loads a library id through a fake catalogue row that sends the site to its code file', () => {
  const bad = [];
  for (const f of testFiles()) {
    if (HELPERS.has(f)) continue;
    for (const n of fakeRowLoads(fs.readFileSync(path.join(ROOT, f), 'utf8'))) bad.push(`${f}:${n}`);
  }
  assert.deepEqual(bad, [], 'give the row an id no library sprite uses: tests/helpers/code-standin.mjs (CODE_STANDIN, useCodeStandIn)');
});

test('every unit test that scans librarySprites() says what it covered (libraryCoverage) or fails on an unloadable file', () => {
  const quiet = testFiles().filter((f) => f.startsWith('tests/unit/') && !HELPERS.has(f)).filter((f) => {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    return /\blibrarySprites\(\)/.test(text) && !/\blibraryCoverage\(|deepEqual\(\s*unloadable\s*,\s*\[\]\s*\)/.test(text);
  });
  assert.deepEqual(quiet, [], 'add: test(\'the scan covers every sprite file ...\', async (t) => t.diagnostic(await libraryCoverage()))');
});

test('libraryCoverage adds the scanned and unloadable sprites up to every file in sprites/', async () => {
  assert.match(await libraryCoverage(), /^\d+ sprites checked \(\d+ data files\) of \d+; not loaded: /);
});
