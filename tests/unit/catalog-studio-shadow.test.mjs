// Studio item S8, review round 3 (issue 5): a studio sprite registered before the catalogue has loaded may hold a library
// id. Once the catalogue is in, the id is the library's everywhere: assetById, loadSprite and spriteNow give the library
// sprite, never the studio one cached under that id (the bag then gives the studio sprite another id, settleIds).
// Its own file (a fresh module, so the catalogue is not loaded yet).
// The library sprite is the data stand-in (tests/helpers/code-standin.mjs), an id no library sprite uses, with its own file
// served by the fake fetch (build item Z1: the site no longer imports code sprites). LIB below plays the part the knight played.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../app/catalog.js';
import { studioTemplate } from '../../rigs/studio-templates.js';
import { CODE_STANDIN as LIB, standInFetch } from '../helpers/code-standin.mjs';

globalThis.fetch = standInFetch(async () => ({ ok: true, json: async () => ({ version: 1, assets: [{ id: LIB, kind: 'sprite', name: 'Hero', src: `sprites/${LIB}.json`, tech: {} }, { id: 'coin-chime', kind: 'sound', name: 'Coin' }], bundles: [] }) }));      // sprites/<LIB>.json: the stand-in's file, id LIB, name 'Test badge'
const beast = (id, name) => ({ ...studioTemplate('four-legs'), id, name });

test('shadow: once the catalogue is in, a library id is the library sprite\'s in assetById, loadSprite and spriteNow', async () => {
  const r = await C.addStudioSprite(beast(LIB, 'Not the hero'));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(C.assetById(LIB).name, 'Not the hero', 'before the catalogue: the only one known under the id');
  const early = await C.loadSprite(LIB);
  assert.equal(early.name, 'Not the hero');
  assert.equal(C.spriteNow(LIB), early);
  await C.loadCatalog();
  assert.equal(C.assetById(LIB).name, 'Hero');
  assert.equal(C.spriteNow(LIB), null, 'the library sprite has not been loaded yet; the studio one is not it');
  const hero = await C.loadSprite(LIB);
  assert.equal(hero.id, LIB);
  assert.equal(hero.name, 'Test badge', 'the library\'s file (the stand-in), not the studio sprite');
  assert.notEqual(hero, early);
  assert.equal(C.spriteNow(LIB), hero);
  assert.equal(C.libraryHas(LIB), true);
  // the studio sprite leaves (the bag renamed it): the library sprite stays
  assert.equal(C.removeStudioSprite(LIB), true);
  assert.equal(C.assetById(LIB).name, 'Hero');
  assert.equal(await C.loadSprite(LIB), hero);
  assert.equal(C.spriteNow(LIB), hero);
});

test('shadow: a sound made on a visit under a library id is not played in its place once the catalogue is in', async () => {
  // (the catalogue is in by now: addRuntimeAsset refuses its ids, so this one is taken in under an id of its own first)
  C.addRuntimeAsset({ id: 'own-chime', kind: 'sound', name: 'Own', runtime: true }, { name: 'own', params: [] });
  assert.equal((await C.loadSound('own-chime')).name, 'own');
  assert.throws(() => C.addRuntimeAsset({ id: 'coin-chime', kind: 'sound', name: 'Mine', runtime: true }, { name: 'mine' }), /already an asset/);
});

test('shadow: a studio sprite with an id of its own is drawn as before', async () => {
  const r = await C.addStudioSprite(beast('knight-2', 'Not the hero'));
  assert.equal(r.ok, true);
  const s = await C.loadSprite('knight-2');
  assert.equal(s.name, 'Not the hero');
  assert.equal(C.spriteNow('knight-2'), s);
  assert.equal(C.libraryHas('knight-2'), false);
});
