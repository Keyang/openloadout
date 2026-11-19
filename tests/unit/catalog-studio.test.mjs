// Studio item S8 (docs/studio.md section 6, "app/catalog.js"; Contract 14 rule 4): a studio sprite in the bag is known to
// the site like an asset made on a visit. addRuntimeAsset(row, { data }) registers it and loadSprite(id) gives
// dataSprite(data): data drawn by framework code, so no worker. addStudioSprite(definition) checks it and makes its row;
// followStudio(bag) keeps the site's studio sprites the ones the bag holds. loadCatalog() and loadSprite() wait for
// a registration in progress, so a page that asks while one is under way (the playground after a reload) finds it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../app/catalog.js';
import { createBag, memoryStorage, followStudio, loadStudioCheck } from '../../app/bag.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const beast = (over = {}) => ({ ...studioTemplate('four-legs'), id: 'moss-beast', name: 'Moss beast', ...over });
const pixels = (sprite, clip = 'walk', frame = 2) => Buffer.from(renderFrame(sprite, clip, frame, defaultParams(sprite)).data.buffer).toString('base64');

// the built catalogue, as a page fetches it (one catalogue sprite)
globalThis.fetch = async (url) => ({ ok: true, json: async () => ({ version: 1, assets: [{ id: 'knight', kind: 'sprite', name: 'Hero', tech: {} }], bundles: [] }) });

test('catalog studio: addStudioSprite checks the definition, makes a catalogue-shaped row and the sprite', async () => {
  const r = await C.addStudioSprite(beast());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.id, 'moss-beast');
  const row = C.assetById('moss-beast');
  assert.equal(row.kind, 'sprite');
  assert.equal(row.name, 'Moss beast');
  assert.equal(row.studio, true);
  assert.equal(row.runtime, true);
  assert.equal(row.madeIn, 'studio');
  assert.equal(row.role, 'characters/enemy');
  assert.equal(row.view, 'side');
  assert.equal(row.type, 'creature');
  assert.deepEqual(row.tech.frame, beast().size);
  assert.deepEqual(row.tech.clips.map((c) => c.name), Object.keys(beast().clips));
  assert.ok(row.tech.clips.every((c) => Number.isFinite(c.fps) && c.fps > 0));
  assert.equal(row.stripClip, beast().preview);
  assert.ok(Array.isArray(row.styles) && row.styles.includes('pixel'));
  const sprite = await C.loadSprite('moss-beast');
  assert.equal(sprite.id, 'moss-beast');
  assert.equal(typeof sprite.render, 'function');
  assert.equal(C.spriteNow('moss-beast'), sprite);
  assert.equal(pixels(sprite), pixels(dataSprite(beast())), 'drawn as dataSprite draws it');
  assert.ok(C.runtimeAssets().some((a) => a.id === 'moss-beast'));
  assert.match(C.madeNote('moss-beast').text, /studio/i);
  assert.equal(C.madeNote('moss-beast').draft, false);
});

test('catalog studio: a definition that does not pass is not registered, and says why', async () => {
  const broken = beast({ id: 'broken-beast' });
  broken.body.rig.shapes[0].bone = 'nope';
  const r = await C.addStudioSprite(broken);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /bone/);
  assert.equal(C.assetById('broken-beast'), null);
  const code = await C.addStudioSprite({ source: 'export default 1' });
  assert.equal(code.ok, false);
});

test('catalog studio: addRuntimeAsset(row, { data }) alone is enough: loadSprite builds dataSprite(data) on demand', async () => {
  const data = beast({ id: 'lazy-beast' });
  C.addRuntimeAsset({ id: 'lazy-beast', kind: 'sprite', name: 'Lazy', runtime: true, studio: true }, { data });
  assert.equal(C.spriteNow('lazy-beast'), null);
  const sprite = await C.loadSprite('lazy-beast');
  assert.equal(sprite.id, 'lazy-beast');
  assert.equal(C.spriteNow('lazy-beast'), sprite);
  assert.equal(pixels(sprite), pixels(dataSprite(data)));
  assert.equal(C.removeStudioSprite('lazy-beast'), true);
  assert.equal(C.assetById('lazy-beast'), null);
});

test('catalog studio: a catalogue id is refused; the same id again replaces the earlier one', async () => {
  await C.loadCatalog();
  const r = await C.addStudioSprite(beast({ id: 'knight' }));
  assert.equal(r.ok, false);
  assert.equal(C.assetById('knight').name, 'Hero');
  await C.addStudioSprite(beast({ name: 'Renamed beast' }));
  assert.equal(C.assetById('moss-beast').name, 'Renamed beast');
  assert.equal(C.runtimeAssets().filter((a) => a.id === 'moss-beast').length, 1);
});

test('catalog studio: loadCatalog and loadSprite wait for a registration that is under way', async () => {
  const p = C.addStudioSprite(beast({ id: 'late-beast' }));        // not awaited: a page asks at once
  const cat = await C.loadCatalog();
  assert.ok(cat.assets.some((a) => a.id === 'knight'));
  assert.ok(C.assetById('late-beast'), 'known by the time the catalogue is handed over');
  const p2 = C.addStudioSprite(beast({ id: 'later-beast' }));
  const s = await C.loadSprite('later-beast');
  assert.equal(s.id, 'later-beast');
  await Promise.all([p, p2]);
  // the last of two quick changes wins, whatever order their checks end in
  C.addStudioSprite(beast({ id: 'quick', name: 'First' }));
  await C.addStudioSprite(beast({ id: 'quick', name: 'Second' }));
  await C.studioSettled();
  assert.equal(C.assetById('quick').name, 'Second');
});

test('catalog studio: followStudio keeps the site\'s studio sprites the ones the bag holds', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  const stop = followStudio(bag);
  const key = bag.add({ kind: 'sprite', id: 'bag-beast', settings: {}, definition: { data: beast({ id: 'bag-beast' }) } });
  await C.studioSettled();
  assert.equal(C.assetById('bag-beast').name, 'Moss beast');
  bag.updateDefinition(key, { data: beast({ id: 'bag-beast', name: 'Edited' }) });
  await C.studioSettled();
  assert.equal(C.assetById('bag-beast').name, 'Edited', 'a later edit reaches the site');
  assert.equal((await C.loadSprite('bag-beast')).name, 'Edited');
  bag.remove(key);
  await C.studioSettled();
  assert.equal(C.assetById('bag-beast'), null, 'out of the bag, gone from the site');
  // a bag read back with a studio sprite in it registers it at once
  const storage = memoryStorage();
  createBag(storage).add({ kind: 'sprite', id: 'kept-beast', settings: {}, definition: { data: beast({ id: 'kept-beast' }) } });
  const stop2 = followStudio(createBag(storage));
  await C.loadCatalog();
  assert.ok(C.assetById('kept-beast'));
  stop(); stop2();
});
