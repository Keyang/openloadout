// Build item Z1 (docs/data-sprites.md section 9, R4b): app/catalog.js loads a library sprite from its data file and
// nowhere else. There is no branch that imports sprites/<id>.js; a saved link to an old code sprite's id opens because the
// id exists as data (its catalogue row names sprites/<id>.json); an id the catalogue does not have, and a row that names no
// data file, are refused with a clear message and no file is asked for.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataProject, coinDef, asFile } from '../helpers/data-sprites.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(HERE, '..', '..', 'app', 'catalog.js'), 'utf8');

const project = dataProject({ data: { coin: coinDef() } });
const row = (id, src) => ({ id, kind: 'sprite', name: id, bundles: [], src, tech: { soundIds: [] } });
const CATALOG = { version: 1, assets: [row('coin', 'sprites/coin.json'), row('old-code', 'sprites/old-code.js'), row('no-src', null), { id: 'chime', kind: 'sound', name: 'Chime', bundles: [], tech: {} }], bundles: [] };

let copy = 0;
const real = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = real; });
/** A fresh copy of app/catalog.js whose fetch answers the catalogue and the scratch project's files; returns { m, asked }. */
async function fresh() {
  const asked = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    asked.push(u);
    if (u === 'generated/catalog.json') return { ok: true, status: 200, json: async () => CATALOG };
    const f = path.join(project, u);
    if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => null, text: async () => '' };
    const text = fs.readFileSync(f, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  return { m: await import(`../../app/catalog.js?z1=${++copy}`), asked };
}

test('app/catalog.js has no import of a sprite\'s code file', () => {
  const code = SOURCE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/import\(\s*[`'"][^`'"]*sprites\//.test(code), 'no dynamic import of sprites/...');
  assert.ok(!/sprites\/\$\{[^}]*\}\.js\b|\.js`\)/.test(code), 'no address of a code file built from an id');
});

test('an id the catalogue does not list as a sprite is refused with its name, and no file is asked for', async () => {
  const { m, asked } = await fresh();
  await m.loadCatalog();
  await assert.rejects(m.loadSprite('knight-of-old'), /"knight-of-old" is not a sprite on this site/);
  await assert.rejects(m.loadSprite('chime'), /"chime" is not a sprite on this site/);
  assert.deepEqual(asked, ['generated/catalog.json']);
  assert.equal(m.spriteNow('knight-of-old'), null);
});

test('a row that names a code file, or no file, is refused: the site does not guess sprites/<id>.js', async () => {
  const { m, asked } = await fresh();
  await m.loadCatalog();
  await assert.rejects(m.loadSprite('old-code'), /"old-code" has no data file/);
  await assert.rejects(m.loadSprite('no-src'), /"no-src" has no data file/);
  assert.deepEqual(asked, ['generated/catalog.json'], 'neither the code file nor a .json named after the id is asked for');
  assert.equal(m.spriteNow('old-code'), null);
  const got = await m.loadSprites(['old-code', 'no-src', 'coin']);
  assert.deepEqual(Object.keys(got), ['coin'], 'the ones that cannot load are left out');
});

test('an id of an old code sprite opens as data: its row names sprites/<id>.json', async () => {
  const { m, asked } = await fresh();
  await m.loadCatalog();
  const s = await m.loadSprite('coin');
  assert.equal(s.id, 'coin');
  assert.equal(typeof s.render, 'function');
  assert.ok(asked.includes('sprites/coin.json'));
  assert.ok(!asked.some((u) => u.endsWith('sprites/coin.js')));
});

test('asked before the catalogue is in, loadSprite waits for it rather than guessing a file from the id', async () => {
  const { m, asked } = await fresh();
  const s = await m.loadSprite('coin');      // no loadCatalog() first
  assert.equal(s.id, 'coin');
  assert.deepEqual(asked.slice(0, 2), ['generated/catalog.json', 'sprites/coin.json']);
  const { m: m2, asked: asked2 } = await fresh();
  await assert.rejects(m2.loadSprite('old-code'), /has no data file/);
  assert.ok(!asked2.some((u) => u.endsWith('.js')));
});
