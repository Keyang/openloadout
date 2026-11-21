// The build and the studio's library file form (docs/studio.md 2.4, item S7; Contract 14 rule 8). Until build item R4a the
// build took a studio file, sprites/<id>.js, written by tools/lib/data-file.mjs, and checked its fixed form before it
// imported it. Since R4a (every sprite is data; docs/data-sprites.md section 5) tools/lib/assets.mjs takes no code file
// at all: a studio file in sprites/ is refused like any program, with the same message (the file's name, what to make
// instead, the /sprite-forge skill), and is never imported. The writer (tools/lib/data-file.mjs) and its form are still
// tested in data-file-form.test.mjs, for the studio's own download. Runs on a temporary sprites/ folder, never the real one.
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

/** What every refusal says for a file `rel`: its name first, then what to make instead and how. */
const refused = (rel, id) => (e) => {
  assert.ok(e.message.startsWith(`${rel}:`), e.message);
  assert.match(e.message, /code sprite/);
  assert.ok(e.message.includes(`sprites/${id}.json`), e.message);
  assert.match(e.message, /\/sprite-forge/);
  return true;
};

test('data-file build: a studio file in sprites/ is refused, naming it and the way to make it as data', async () => {
  assert.equal(newtFile.ok, true);
  assert.equal(beetleFile.ok, true);
  const root = make({ [newtFile.name]: newtFile.text });
  await assert.rejects(loadSprites(root), refused('sprites/moss-newt.js', 'moss-newt'));
  await assert.rejects(loadSprites(make({ [newtFile.name]: newtFile.text, [beetleFile.name]: beetleFile.text })), (e) => {
    assert.ok(e.message.startsWith('sprites/dung-beetle.js, sprites/moss-newt.js:'), e.message);
    assert.match(e.message, /code sprites/);
    return true;
  });
});

test('data-file build: a studio file with code added to it, or under another file name, is refused the same way and never runs', async () => {
  globalThis.__dataFileBuildRan = undefined;
  const tampered = newtFile.text.replace(/\}\);\n$/, '}, (globalThis.__dataFileBuildRan = 1));\n');
  await assert.rejects(loadSprites(make({ [newtFile.name]: tampered })), refused('sprites/moss-newt.js', 'moss-newt'));
  await assert.rejects(loadSprites(make({ [newtFile.name]: `globalThis.__dataFileBuildRan = 1;\n${newtFile.text}` })), refused('sprites/moss-newt.js', 'moss-newt'));
  await assert.rejects(loadSprites(make({ 'other-newt.js': newtFile.text })), refused('sprites/other-newt.js', 'other-newt'));
  assert.equal(globalThis.__dataFileBuildRan, undefined, 'a code file is never imported');
});

test('data-file build: an ordinary code sprite (the frozen code coin) is refused too', async () => {
  const root = make({ 'coin.js': codeSpriteAsFile('coin') });
  await assert.rejects(loadSprites(root), refused('sprites/coin.js', 'coin'));
});
