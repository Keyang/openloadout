// The build's check of studio library files (docs/studio.md 2.4, item S7; Contract 14 rule 8): tools/lib/assets.mjs,
// which the build, the checkers and the tests use to find sprites, takes a studio file written by
// tools/lib/data-file.mjs like any sprite, and refuses, before importing it, a file that carries the studio comment but
// is not exactly the fixed form, with a plain message naming the file. Runs on a temporary sprites/ folder, never the real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSprites } from '../../tools/lib/assets.mjs';
import { writeDataFile } from '../../tools/lib/data-file.mjs';
import { codeSpriteAsFile } from '../helpers/library.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const newt = JSON.parse(fs.readFileSync(path.join(REAL, 'tests', 'fixtures', 'studio', 'newt.json'), 'utf8'));
const beetle = JSON.parse(fs.readFileSync(path.join(REAL, 'tests', 'fixtures', 'data-sprite', 'beetle-topdown.json'), 'utf8'));

let n = 0;
/** A project root with the framework folders linked in and only the given files in sprites/. */
function rootWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `loadout-data-file-build-${n++}-`));
  for (const d of ['engine', 'catalog', 'rigs', 'sound', 'quality']) if (fs.existsSync(path.join(REAL, d))) fs.symlinkSync(path.join(REAL, d), path.join(dir, d));
  fs.mkdirSync(path.join(dir, 'sprites'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'sprites', name), text);
  return dir;
}
const roots = [];
test.after(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
const make = (files) => { const r = rootWith(files); roots.push(r); return r; };
const newtFile = writeDataFile(newt);
const beetleFile = writeDataFile(beetle);

test('data-file build: a studio file in sprites/ is found and loaded like any sprite', async () => {
  const root = make({ [newtFile.name]: newtFile.text, [beetleFile.name]: beetleFile.text });
  const got = await loadSprites(root);
  assert.deepEqual(got.map((s) => s.id), ['dung-beetle', 'moss-newt']);
  assert.equal(got[1].file, 'sprites/moss-newt.js');
  assert.equal(got[1].def.name, 'Moss newt');
  assert.equal(typeof got[1].def.render, 'function');
});

test('data-file build: a studio file with code added after the JSON is refused before it runs, naming the file', async () => {
  globalThis.__dataFileBuildRan = undefined;
  const tampered = newtFile.text.replace(/\}\);\n$/, '}, (globalThis.__dataFileBuildRan = 1));\n');
  const root = make({ [newtFile.name]: tampered });
  await assert.rejects(loadSprites(root), (e) => {
    assert.ok(e.message.startsWith('sprites/moss-newt.js:'), e.message);
    assert.match(e.message, /studio/i);
    assert.match(e.message, /JSON/);
    return true;
  });
  assert.equal(globalThis.__dataFileBuildRan, undefined, 'the tampered file never ran');
});

test('data-file build: a line of code after the call is refused, and so is code before the comment', async () => {
  globalThis.__dataFileBuildRan = undefined;
  for (const text of [`${newtFile.text}globalThis.__dataFileBuildRan = 1;\n`, `globalThis.__dataFileBuildRan = 1;\n${newtFile.text}`]) {
    const root = make({ [newtFile.name]: text });
    await assert.rejects(loadSprites(root), /^Error: sprites\/moss-newt\.js: .*studio/i);
  }
  assert.equal(globalThis.__dataFileBuildRan, undefined);
});

test('data-file build: a studio file whose definition has library gaps is refused (strict is for library files)', async () => {
  const gap = structuredClone(newt); delete gap.meta.license;
  const w = writeDataFile(gap);
  assert.equal(w.ok, true);
  const root = make({ [w.name]: w.text });
  await assert.rejects(loadSprites(root), (e) => /^sprites\/moss-newt\.js: /.test(e.message) && /licen/i.test(e.message));
});

test('data-file build: a studio file under another file name is refused, naming both ids', async () => {
  const root = make({ 'other-newt.js': newtFile.text });
  await assert.rejects(loadSprites(root), (e) => e.message.startsWith('sprites/other-newt.js:') && /moss-newt/.test(e.message));
});

test('data-file build: ordinary sprite files are not affected', async () => {
  // an ordinary code sprite: the old code coin, frozen (tests/helpers/library.mjs), as the library's own are redrawn as data
  const root = make({ 'coin.js': codeSpriteAsFile('coin'), [newtFile.name]: newtFile.text });
  const got = await loadSprites(root);
  assert.equal(got.length, 2);
});
