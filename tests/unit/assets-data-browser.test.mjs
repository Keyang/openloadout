// app/catalog.js loads a library data sprite (sprites/<id>.json; docs/data-sprites.md, build item B9) when the
// catalogue row's src says so: the definition is fetched (never imported), the pieces it uses are loaded into the site's
// piece store, and engine/data-sprite.js draws it. A code sprite is still imported. Runs in Node with a stand-in fetch
// (as tests/unit/catalog-load.test.mjs does); the site's piece store reads a scratch project's pieces/ from the disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { sitePieces } from '../../engine/pieces.js';
import { nodePieceReader } from '../../tools/lib/pieces-index.mjs';
import { dataProject, badgeDef, tuftDef, asFile } from '../helpers/data-sprites.mjs';

const project = dataProject({ data: { badge: badgeDef(), 'tuft-pot': tuftDef() }, pieces: true });
sitePieces().useReader(nodePieceReader(project));

const row = (id, src) => ({ id, kind: 'sprite', name: id, bundles: [], src, tech: { soundIds: [] } });
const CATALOG = { version: 1, assets: [row('badge', 'sprites/badge.json'), row('tuft-pot', 'sprites/tuft-pot.json'), row('coin', 'sprites/coin.js'), row('gone', 'sprites/gone.json')], bundles: [] };

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
  const m = await import(`../../app/catalog.js?data=${++copy}`);
  await m.loadCatalog();
  return { m, asked };
}

test('a row whose src is sprites/<id>.json is fetched and drawn by engine/data-sprite.js', async () => {
  const { m, asked } = await fresh();
  const s = await m.loadSprite('badge');
  assert.ok(asked.includes('sprites/badge.json'), 'the definition is fetched');
  assert.equal(s.id, 'badge');
  assert.equal(typeof s.render, 'function');
  assert.ok(renderFrame(s, 'idle', 0, defaultParams(s)).data.some((v) => v >>> 24));
  assert.equal(m.spriteNow('badge'), s, 'kept once loaded');
  assert.equal(await m.loadSprite('badge'), s, 'loaded once');
  assert.equal(asked.filter((u) => u === 'sprites/badge.json').length, 1);
});

test('the pieces a data sprite uses are loaded before it is drawn', async () => {
  const { m } = await fresh();
  const s = await m.loadSprite('tuft-pot');
  assert.equal(s.id, 'tuft-pot');
  assert.ok(sitePieces().has('part:test-tuft@1'));
  assert.ok(renderFrame(s, 'idle', 0, defaultParams(s)).data.some((v) => v >>> 24));
});

test('a code sprite is still imported, and a data file that is missing rejects (and may be tried again)', async () => {
  const { m, asked } = await fresh();
  const coin = await m.loadSprite('coin');
  assert.equal(coin.id, 'coin');
  assert.ok(!asked.some((u) => u.includes('coin')), 'a code sprite is imported, not fetched');
  await assert.rejects(m.loadSprite('gone'), /sprites\/gone\.json/);
  fs.writeFileSync(path.join(project, 'sprites', 'gone.json'), asFile(badgeDef('gone')));
  assert.equal((await m.loadSprite('gone')).id, 'gone', 'a failed load is not kept');
});
