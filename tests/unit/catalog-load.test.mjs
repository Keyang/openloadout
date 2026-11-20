// app/catalog.js: the one module of the site that reads the built catalogue, and loads an asset's own file.
// It runs in Node with a stand-in fetch. Each test imports its own copy of the module (it keeps what it loaded).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_STANDIN, useCodeStandIn } from '../helpers/code-standin.mjs';

const CATALOG = {
  version: 1,
  assets: [
    { id: 'blob', kind: 'sprite', name: 'Blob', bundles: ['set'], tech: { soundIds: ['pop', 'gone'] } },
    { id: 'rock', kind: 'sprite', name: 'Rock', bundles: [], tech: { soundIds: [] } },
    { id: 'old', kind: 'sprite', name: 'Old', bundles: [], tech: {} },           // a catalogue from before the list existed
    { id: 'pop', kind: 'sound', name: 'Pop', bundles: ['set', 'other'], tech: {} },
    { id: 'tune', kind: 'music', name: 'Tune', bundles: [], tech: {} },
  ],
  bundles: [
    { id: 'set', name: 'Set', sprites: ['blob'], sounds: ['pop'], music: [] },
    { id: 'other', name: 'Other', sprites: [], sounds: ['pop'], music: [] },
  ],
};

let copy = 0;
/** A fresh copy of the module, and the list of addresses it asked for. */
async function fresh({ status = 200, body = CATALOG } = {}) {
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: status === 200, status, json: async () => body }; };
  const m = await import(`../../app/catalog.js?copy=${++copy}`);
  return { m, asked };
}
const real = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = real; });

test('loadCatalog() reads generated/catalog.json, once', async () => {
  const { m, asked } = await fresh();
  assert.equal(m.currentCatalog(), null);
  const [a, b] = await Promise.all([m.loadCatalog(), m.loadCatalog()]);
  assert.equal(a, b);
  assert.equal(a.assets.length, CATALOG.assets.length);
  assert.deepEqual(asked, ['generated/catalog.json']);
  assert.equal(m.currentCatalog(), a);
});

test('loadCatalog(url) reads the address it is given, and later calls give the same catalogue whatever they pass', async () => {
  const { m, asked } = await fresh();
  const a = await m.loadCatalog('tests/fixtures/browse/catalog.json');
  assert.deepEqual(asked, ['tests/fixtures/browse/catalog.json']);
  assert.equal(await m.loadCatalog(), a);
  assert.equal(await m.loadCatalog('somewhere/else.json'), a);
  assert.deepEqual(asked, ['tests/fixtures/browse/catalog.json'], 'the catalogue is fetched once');
  // nothing passed (or null) means the usual address
  const again = await fresh();
  await again.m.loadCatalog(null);
  assert.deepEqual(again.asked, ['generated/catalog.json']);
});

test('a missing catalogue says what to run, and names the file', async () => {
  const { m } = await fresh({ status: 404 });
  await assert.rejects(m.loadCatalog(), /npm run build/);
  const other = await fresh({ status: 404 });
  await assert.rejects(other.m.loadCatalog('x/cat.json'), /x\/cat\.json/);
});

test('lookups: assets, bundles, a bundle\'s assets', async () => {
  const { m } = await fresh();
  assert.equal(m.assetById('blob'), null, 'nothing before the catalogue has loaded');
  await m.loadCatalog();
  assert.equal(m.assetById('blob').name, 'Blob');
  assert.equal(m.assetById('nope'), null);
  assert.equal(m.bundleById('set').name, 'Set');
  assert.deepEqual(m.assetsOfBundle(m.bundleById('set')).map((a) => a.id), ['blob', 'pop']);
});

test('spritesUsing(soundId): the sprites whose animations play a sound, from the catalogue alone', async () => {
  const { m, asked } = await fresh();
  assert.deepEqual(m.spritesUsing('pop'), []);
  await m.loadCatalog();
  assert.deepEqual(m.spritesUsing('pop').map((a) => a.id), ['blob']);
  assert.deepEqual(m.spritesUsing('tune'), []);
  assert.deepEqual(asked, ['generated/catalog.json'], 'no sprite program was loaded');
});

test('soundsOf(spriteId): catalogue rows of the sounds a sprite plays, leaving out ones that are not on the site', async () => {
  const { m } = await fresh();
  await m.loadCatalog();
  assert.deepEqual(m.soundsOf('blob').map((a) => a.id), ['pop']);
  assert.deepEqual(m.soundsOf('rock'), []);
  assert.deepEqual(m.soundsOf('old'), []);
  assert.deepEqual(m.soundsOf('nope'), []);
});

test('bundlesOf(id): the bundles an asset is in, as bundle rows', async () => {
  const { m } = await fresh();
  await m.loadCatalog();
  assert.deepEqual(m.bundlesOf('pop').map((b) => b.id), ['set', 'other']);
  assert.deepEqual(m.bundlesOf('tune'), []);
  assert.deepEqual(m.bundlesOf('nope'), []);
});

test('loadSprite refuses an id the catalogue does not list as a sprite, without asking for a file', async () => {
  const { m, asked } = await fresh();
  await m.loadCatalog();
  await assert.rejects(m.loadSprite('pop'), /not a sprite/);
  await assert.rejects(m.loadSprite('no-such-thing'), /not a sprite/);
  assert.deepEqual(asked, ['generated/catalog.json']);
  assert.equal(m.spriteNow('no-such-thing'), null);
});

test('loadSprite loads a sprite program once; spriteNow gives it at once afterwards; loadSprites skips what is missing', async () => {
  useCodeStandIn();      // a code file under an id no library sprite uses (tests/helpers/code-standin.mjs)
  const { m } = await fresh({ body: { version: 1, assets: [{ id: CODE_STANDIN, kind: 'sprite', tech: {} }, { id: 'ghost-of-a-file', kind: 'sprite', tech: {} }], bundles: [] } });
  await m.loadCatalog();
  assert.equal(m.spriteNow(CODE_STANDIN), null, 'not loaded yet');
  const coin = await m.loadSprite(CODE_STANDIN);
  assert.equal(coin.id, CODE_STANDIN);
  assert.equal(await m.loadSprite(CODE_STANDIN), coin);
  assert.equal(m.spriteNow(CODE_STANDIN), coin);
  // several at once: the one whose file is not there is left out and does not stop the rest
  const got = await m.loadSprites([CODE_STANDIN, 'ghost-of-a-file', CODE_STANDIN]);
  assert.deepEqual(Object.keys(got), [CODE_STANDIN]);
  assert.equal(m.spriteNow('ghost-of-a-file'), null);
});
