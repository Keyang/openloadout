// app/catalog.js and assets made on a visit (Contract 11): once handed over with addRuntimeAsset they answer
// assetById / loadSprite / loadSound like catalogue assets, until the page is left or they are removed.
import test from 'node:test';
import assert from 'node:assert/strict';

const CATALOG = {
  version: 1,
  assets: [
    { id: 'blob', kind: 'sprite', name: 'Blob', bundles: [], tech: { soundIds: ['pop'] } },
    { id: 'pop', kind: 'sound', name: 'Pop', bundles: [], tech: {} },
  ],
  bundles: [],
};
let copy = 0;
async function fresh({ load = true } = {}) {
  const asked = [];
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, status: 200, json: async () => CATALOG }; };
  const m = await import(`../../app/catalog.js?runtime=${++copy}`);
  if (load) await m.loadCatalog();
  return { m, asked };
}
const real = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = real; });

const GEM = { id: 'gem', render() {}, sounds: { collect: [{ sound: 'chime', frame: 0 }] } };
const GEM_ROW = { id: 'gem', kind: 'sprite', name: 'Gem', runtime: true, ok: true, src: null, thumb: null, bundles: [], tech: { soundIds: ['chime', 'pop'] } };
const CHIME = { id: 'chime', name: 'Chime', nodes: [] };
const CHIME_ROW = { id: 'chime', kind: 'sound', name: 'Chime', runtime: true, ok: true, src: null, thumb: null, bundles: [], tech: {} };

test('an asset handed over is found by id, and its own "file" is the definition, with no request', async () => {
  const { m, asked } = await fresh();
  assert.equal(m.assetById('gem'), null);
  m.addRuntimeAsset(GEM_ROW, GEM);
  m.addRuntimeAsset(CHIME_ROW, CHIME);
  assert.equal(m.assetById('gem'), GEM_ROW);
  assert.equal(await m.loadSprite('gem'), GEM);
  assert.equal(m.spriteNow('gem'), GEM);
  assert.equal(await m.loadSound('chime'), CHIME);
  assert.equal(await m.loadAsset(CHIME_ROW), CHIME);
  assert.deepEqual(await m.loadSprites(['gem']), { gem: GEM });
  assert.deepEqual(m.runtimeAssets().map((r) => r.id), ['gem', 'chime']);
  assert.deepEqual(m.allAssets().map((r) => r.id), ['blob', 'pop', 'gem', 'chime']);
  assert.equal(m.currentCatalog().assets.length, 2, 'the built catalogue itself is not changed');
  assert.deepEqual(asked, ['generated/catalog.json']);
});

test('what goes with what includes assets made on the visit', async () => {
  const { m } = await fresh();
  m.addRuntimeAsset(GEM_ROW, GEM);
  m.addRuntimeAsset(CHIME_ROW, CHIME);
  assert.deepEqual(m.soundsOf('gem').map((r) => r.id), ['chime', 'pop']);
  assert.deepEqual(m.spritesUsing('chime').map((r) => r.id), ['gem']);
  assert.deepEqual(m.spritesUsing('pop').map((r) => r.id), ['blob', 'gem']);
});

test('the catalogue wins: an id it already uses is refused', async () => {
  const { m } = await fresh();
  assert.throws(() => m.addRuntimeAsset({ ...GEM_ROW, id: 'blob' }, { ...GEM, id: 'blob' }), /blob.*catalogue/);
  assert.equal(m.assetById('blob').name, 'Blob');
  assert.throws(() => m.addRuntimeAsset({ id: 'x' }, GEM), /kind/);
  assert.throws(() => m.addRuntimeAsset(null, GEM));
});

test('making it again replaces it; removing it forgets it', async () => {
  const { m } = await fresh();
  m.addRuntimeAsset(GEM_ROW, GEM);
  const better = { ...GEM, better: true };
  m.addRuntimeAsset({ ...GEM_ROW, name: 'Better gem' }, better);
  assert.equal(m.assetById('gem').name, 'Better gem');
  assert.equal(await m.loadSprite('gem'), better);
  assert.equal(m.spriteNow('gem'), better);
  assert.equal(m.runtimeAssets().length, 1);
  assert.equal(m.removeRuntimeAsset('gem'), true);
  assert.equal(m.removeRuntimeAsset('gem'), false);
  assert.equal(m.assetById('gem'), null);
  assert.equal(m.spriteNow('gem'), null);
  await assert.rejects(m.loadSprite('gem'), /not a sprite on this site/);
  assert.equal(m.removeRuntimeAsset('blob'), false, 'a catalogue asset cannot be removed');
  assert.equal(m.assetById('blob').name, 'Blob');
});

test('onCatalogChange tells listeners when an asset arrives or goes', async () => {
  const { m } = await fresh();
  const seen = [];
  const stop = m.onCatalogChange((what) => seen.push(what));
  m.addRuntimeAsset(CHIME_ROW, CHIME);
  m.removeRuntimeAsset('chime');
  stop();
  m.addRuntimeAsset(CHIME_ROW, CHIME);
  assert.deepEqual(seen, [{ added: 'chime' }, { removed: 'chime' }]);
});

test('before the catalogue has loaded, an asset can be handed over and found', async () => {
  const { m } = await fresh({ load: false });
  m.addRuntimeAsset(GEM_ROW, GEM);
  assert.equal(m.assetById('gem'), GEM_ROW);
  assert.equal(await m.loadSprite('gem'), GEM);
  // once the catalogue is in, its own assets come first
  await m.loadCatalog();
  assert.equal(m.assetById('blob').name, 'Blob');
  assert.equal(m.assetById('gem'), GEM_ROW);
});
