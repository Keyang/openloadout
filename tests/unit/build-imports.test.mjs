// tools/lib/imports.mjs: which files a module loads (itself, what it imports, and what those import).
// The quality cache keys each asset on this list, so the list must never miss a file the asset's code loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importGraph } from '../../tools/lib/imports.mjs';
import { codeSpritesWhere } from '../helpers/library.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A scratch folder holding the given files: { 'a/b.js': 'text', ... }. Returns its path. */
function project(files) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-imports-')));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const relList = (dir, files) => files.map((f) => path.relative(dir, f).split(path.sep).join('/'));

test('follows imports through imports, in every way a module can name another file', () => {
  const dir = project({
    'sprites/one.js': "import { rig } from '../rigs/r.js';\nimport '../engine/side-effect.js';\nexport default rig;\n",
    'rigs/r.js': "import { a } from '../engine/a.js';\nexport { b } from '../engine/b.js';\nexport * from '../engine/c.js';\nexport const rig = a;\n",
    'engine/a.js': "import { \n  deep, \n } from './deep.js';\nexport const a = deep;\n",
    'engine/deep.js': "export const deep = 1;\nexport const later = () => import('./lazy.js');\n",
    'engine/lazy.js': "export const worklet = new URL('./worklet.js', import.meta.url);\n",
    'engine/worklet.js': '// loaded by address, not by import\n',
    'engine/b.js': "import data from './table.json' with { type: 'json' };\nexport const b = data;\n",
    'engine/table.json': '{ "x": "./not-followed.js" }\n',
    'engine/c.js': 'export const c = 3;\n',
    'engine/side-effect.js': 'globalThis.x = 1;\n',
    'engine/unused.js': 'export const unused = 1;\n',
    'engine/not-followed.js': 'export const n = 1;\n',
  });
  const g = importGraph();
  const r = g.closure([path.join(dir, 'sprites', 'one.js')]);
  assert.deepEqual(relList(dir, r.files), [
    'engine/a.js', 'engine/b.js', 'engine/c.js', 'engine/deep.js', 'engine/lazy.js', 'engine/side-effect.js', 'engine/table.json', 'engine/worklet.js', 'rigs/r.js', 'sprites/one.js',
  ]);
  assert.deepEqual(r.unknown, []);
  assert.deepEqual(r.missing, []);
});

test('modules that import each other in a circle are each listed once', () => {
  const dir = project({
    'a.js': "import './b.js';\n",
    'b.js': "import './c.js';\n",
    'c.js': "import './a.js';\n",
  });
  const r = importGraph().closure([path.join(dir, 'a.js')]);
  assert.deepEqual(relList(dir, r.files), ['a.js', 'b.js', 'c.js']);
});

test('an import of a file that is not there is reported, so creating the file later changes the answer', () => {
  const dir = project({ 'a.js': "import { x } from './gone.js';\n" });
  const r = importGraph().closure([path.join(dir, 'a.js')]);
  assert.deepEqual(relList(dir, r.files), ['a.js']);
  assert.deepEqual(relList(dir, r.missing), ['gone.js']);
});

test('an import that cannot be followed by reading the text is reported as unknown, never dropped', () => {
  const dir = project({
    'a.js': "import './b.js';\n",
    'b.js': "export const load = (name) => import(name);\nexport const other = (id) => import(`./parts/${id}.js`);\n",
  });
  const r = importGraph().closure([path.join(dir, 'a.js')]);
  assert.deepEqual(relList(dir, r.files), ['a.js', 'b.js']);
  assert.deepEqual(relList(dir, r.unknown), ['b.js']);
});

test('packages and Node\'s own modules are left out', () => {
  const dir = project({ 'a.js': "import fs from 'node:fs';\nimport { test } from '@playwright/test';\nimport path from 'path';\n" });
  const r = importGraph().closure([path.join(dir, 'a.js')]);
  assert.deepEqual(relList(dir, r.files), ['a.js']);
  assert.deepEqual(r.missing, []);
});

test('a path that starts with / is looked for in the site\'s folder when one is given', () => {
  const dir = project({
    'sprites/one.js': "import { a } from '/engine/a.js';\n",
    'engine/a.js': 'export const a = 1;\n',
  });
  const file = path.join(dir, 'sprites', 'one.js');
  assert.deepEqual(relList(dir, importGraph({ root: dir }).closure([file]).files), ['engine/a.js', 'sprites/one.js']);
  // without the site's folder the path means the disk's top folder, where there is no such file: reported, not dropped
  const alone = importGraph().closure([file]);
  assert.deepEqual(relList(dir, alone.files), ['sprites/one.js']);
  assert.equal(alone.missing.length, 1);
});

test('a starting file that is not there is reported as missing', () => {
  const dir = project({});
  const r = importGraph().closure([path.join(dir, 'nothing.js')]);
  assert.deepEqual(r.files, []);
  assert.deepEqual(relList(dir, r.missing), ['nothing.js']);
});
