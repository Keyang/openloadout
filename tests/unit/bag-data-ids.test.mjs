// Studio item S8, review round 2 (issues 1 and 5): whose id is whose.
//  - A studio sprite the bag holds is registered with the site (followStudio) so the bag, playground and export draw it,
//    but it is not part of the library: allAssets() and libraryHas() leave it out, so a draft is never refused for its
//    own bag row (window.loadout.studio known(); the studio page's id checks).
//  - A studio sprite that comes in before the catalogue has loaded may hold a library id; once the catalogue is in, the
//    bag gives it another (settleIds / settleStudioIds), so it is never drawn as the library sprite of that id.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../app/catalog.js';
import * as B from '../../app/bag.js';
import { createStudio } from '../../app/api-studio.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

// the built catalogue, as a page fetches it: one library sprite ('knight') and the sounds the templates play
let fetched = 0;
globalThis.fetch = async () => { fetched++; return { ok: true, json: async () => ({ version: 1, assets: [{ id: 'knight', kind: 'sprite', name: 'Hero', tech: {} }, ...['footstep-gravel', 'whoosh', 'punch', 'land-thud'].map((id) => ({ id, kind: 'sound', name: id }))], bundles: [] }) }; };

const beast = (over = {}) => ({ ...studioTemplate('four-legs'), id: 'moss-beast', name: 'Moss beast', ...over });
const item = (data, over = {}) => ({ kind: 'sprite', id: data.id, settings: {}, definition: { data }, ...over });

test('ids: before the catalogue loads, a studio sprite with a library id keeps it; settleIds gives it another once the library is known', async () => {
  await B.loadStudioCheck();
  let library = new Set();
  const bag = B.createBag(B.memoryStorage(), { taken: (id) => library.has(id) });
  const early = bag.add(item(beast({ id: 'knight', name: 'Not the hero' }), { draft: 'not-the-hero' }));
  const other = bag.add(item(beast()));
  assert.equal(bag.get(early).id, 'knight', 'the library is not known yet');
  assert.equal(bag.settleIds(), 0, 'nothing to do while the library is not known');
  library = new Set(['knight']);
  let told = 0;
  bag.onChange(() => told++);
  assert.equal(bag.settleIds(), 1);
  const it = bag.get(early);
  assert.equal(it.id, 'knight-2');
  assert.equal(it.definition.data.id, 'knight-2', 'the definition says the same id');
  assert.equal(it.draft, 'not-the-hero', 'it still follows its draft');
  assert.equal(bag.get(other).id, 'moss-beast', 'an id the library does not hold is left alone');
  assert.equal(told, 1);
  assert.equal(bag.settleIds(), 0, 'settled');
});

test('ids: settleStudioIds waits for the library only when the bag holds a studio sprite, then settles every id', async () => {
  let library = new Set();
  const bag = B.createBag(B.memoryStorage(), { taken: (id) => library.has(id) });
  let asked = 0, release;
  const ready = () => { asked++; return new Promise((r) => { release = () => { library = new Set(['knight']); r(); }; }); };
  const stop = B.settleStudioIds(bag, ready);
  assert.equal(asked, 0, 'a bag without studio sprites does not load the catalogue');
  bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.equal(asked, 0, 'a library item is not a studio sprite');
  const key = bag.add(item(beast({ id: 'knight' })));
  assert.equal(asked, 1);
  bag.add(item(beast()));
  assert.equal(asked, 1, 'asked once');
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(bag.get(key).id, 'knight-2');
  assert.equal(bag.items().find((i) => i.kind === 'sprite' && !i.definition).id, 'knight', 'the library item stays');
  // from now on the library is known, so add() itself avoids its ids
  assert.equal(bag.get(bag.add(item(beast({ id: 'knight' })))).id, 'knight-3');
  stop();
});

test('ids: the site\'s studio sprites are not library assets (allAssets, libraryHas), but are drawn by id (assetById)', async () => {
  await C.loadCatalog();
  const r = await C.addStudioSprite(beast({ id: 'row-beast' }));
  assert.equal(r.ok, true);
  assert.equal(C.assetById('row-beast')?.studio, true, 'the bag, playground and export find it');
  assert.equal(C.allAssets().some((a) => a.id === 'row-beast'), false, 'not in the library');
  assert.deepEqual(C.studioAssets().map((a) => a.id), ['row-beast']);
  assert.equal(C.libraryHas('row-beast'), false);
  assert.equal(C.libraryHas('knight'), true);
  assert.equal(C.libraryHas('nothing-here'), false);
  // an asset made on this visit (loadout.make) is in the library of this visit
  C.addRuntimeAsset({ id: 'made-gem', kind: 'sprite', name: 'Gem', runtime: true }, { id: 'made-gem', render() {} });
  assert.equal(C.libraryHas('made-gem'), true);
  assert.ok(C.allAssets().some((a) => a.id === 'made-gem'));
  C.removeRuntimeAsset('made-gem');
  C.removeStudioSprite('row-beast');
});

test('ids: a draft whose sprite is in the bag can be saved after a reload (its own bag row is not "the library")', async () => {
  const mem = B.memoryStorage();
  const stop = B.followStudio(B.bag);
  const s1 = createStudio({ window: {}, storage: mem, kept: true, bag: async () => B });
  const c = await s1.create({ from: 'template:four-legs', name: 'Moss beast' });
  assert.equal(c.ok, true, JSON.stringify(c));
  const tb = await s1.toBag(c.draft);
  assert.equal(tb.ok, true, JSON.stringify(tb));
  await C.studioSettled();
  assert.equal(C.assetById(c.draft)?.studio, true, 'the bag row is registered');
  // a reload: a fresh studio over the same storage, with the bag's sprite registered before it reads the library
  const s2 = createStudio({ window: {}, storage: mem, kept: true, bag: async () => B });
  const g = await s2.get(c.draft);
  const r = await s2.set(c.draft, { ...g.definition, name: 'Moss beast edited' });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
  assert.equal(r.bag, 'updated');
  await C.studioSettled();
  assert.equal(B.bag.get(tb.key).definition.data.name, 'Moss beast edited', 'the bag item followed the edit');
  assert.equal(C.assetById(c.draft).name, 'Moss beast edited');
  const v = await s2.validate(g.definition);
  assert.equal(v.ok, true, JSON.stringify(v).slice(0, 400));
  const f = await s2.file(c.draft);
  assert.equal(f.ok, true, JSON.stringify(f).slice(0, 400));
  stop();
  B.bag.clear();
  assert.ok(fetched >= 1);
});

test('ids: a studio sprite renamed to a taken id gets that id with a number, not its old numbered id (review round 3, issue 6)', async () => {
  await B.loadStudioCheck();
  const library = new Set(['moss', 'moss-beast']);
  const bag = B.createBag(B.memoryStorage(), { taken: (id) => library.has(id) });
  const k = bag.add(item(beast(), { draft: 'moss-beast' }));
  assert.equal(bag.get(k).id, 'moss-beast-2', 'the library holds moss-beast');
  assert.equal(bag.updateDefinition(k, { data: beast({ name: 'Moss beast, again' }) }), true);
  assert.equal(bag.get(k).id, 'moss-beast-2', 'the same wanted id keeps its numbered id');
  assert.equal(bag.updateDefinition(k, { data: beast({ id: 'moss' }) }), true);
  assert.equal(bag.get(k).id, 'moss-2', 'renamed to moss: moss with a number');
  assert.equal(bag.get(k).definition.data.id, 'moss-2');
  assert.equal(bag.updateDefinition(k, { data: beast({ id: 'moss' }) }), true);
  assert.equal(bag.get(k).id, 'moss-2', 'and it keeps that one');
  // a long id is cut to fit its number: the cut form is still its own
  const long = 'a'.repeat(40);
  library.add(long);
  const k2 = bag.add(item(beast({ id: long })));
  assert.equal(bag.get(k2).id, `${'a'.repeat(38)}-2`);
  assert.equal(bag.updateDefinition(k2, { data: beast({ id: long, name: 'Long again' }) }), true);
  assert.equal(bag.get(k2).id, `${'a'.repeat(38)}-2`);
});
