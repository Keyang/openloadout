// window.loadout.make.sprite and identity in the bag (build item B11b; the review of B11, rounds 1 to 3). A sprite made
// with make.sprite carries a `made` token (app/bag.js madeToken: a short hash of the make call), stored on every bag
// item of it. make.sprite changes ONLY the bag items of that token under that id: never a studio sprite, a studio
// draft's item, or another made sprite (one made on an earlier visit, or one from someone's link). An id the bag holds
// for any of those is refused, so nothing in the bag is overwritten and the bag never shows one sprite and downloads
// another. The catalogue registration (app/catalog.js addStudioSprite, through app/bag.js followStudio) keeps the same
// rule. In Node: the page's fetch is stood in for by one that reads the site's folder, and the site's one bag
// (app/bag.js `bag`) lives in memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = pathToFileURL(`${ROOT}/`);
globalThis.fetch = async (u) => {
  const url = new URL(String(u), SITE);
  try { return new Response(fs.readFileSync(fileURLToPath(url))); } catch { return new Response('', { status: 404 }); }
};

const { createLoadout } = await import('../../app/api-core.js');
const { bag, madeToken, loadStudioCheck, followStudio, settleStudioIds } = await import('../../app/bag.js');
const C = await import('../../app/catalog.js');
const { goodData } = await import('../fixtures/api/data.mjs');

const named = (id, name) => ({ ...goodData(id), name });
const rows = () => bag.items().map((i) => [i.id, i.made ?? null, i.definition?.data?.name ?? null, ...(i.draft ? [i.draft] : [])]);
/** A fresh visit: a new window.loadout, nothing made on it yet (the catalogue module forgets what the last one made). */
function visit() {
  for (const row of C.runtimeAssets()) if (row.madeIn === 'visit') C.removeRuntimeAsset(row.id);
  return createLoadout({});
}
async function fresh() { await loadStudioCheck(); bag.clear(); await C.loadCatalog(); return visit(); }

test('make.sprite never overwrites a studio sprite the bag holds under that id: it is refused, and the bag is as it was', async () => {
  const L = await fresh();
  bag.add({ kind: 'sprite', id: 'probe-gem', settings: {}, definition: { data: named('probe-gem', 'Studio mine') } });
  const r = await L.make.sprite(named('probe-gem', 'Agent'));
  assert.equal(r.ok, false, 'refused');
  assert.equal(r.kept, false);
  assert.match(r.errors.join('\n'), /in the bag/);
  assert.match(r.errors.join('\n'), /id of its own/);
  assert.deepEqual(rows(), [['probe-gem', null, 'Studio mine']]);
  assert.equal(C.assetById('probe-gem')?.madeIn === 'visit', false, 'nothing was registered under its id');
});

test('make.sprite never takes the id of a studio draft\'s item: refused, so the bag shows and downloads the same sprite', async () => {
  const L = await fresh();
  bag.add({ kind: 'sprite', id: 'probe-gem3', settings: {}, definition: { data: named('probe-gem3', 'Studio drafted') }, draft: 'dr1' });
  const r = await L.make.sprite(named('probe-gem3', 'Agent'));
  assert.equal(r.ok, false);
  assert.equal(r.kept, false);
  assert.deepEqual(rows(), [['probe-gem3', null, 'Studio drafted', 'dr1']]);
  assert.notEqual(C.assetById('probe-gem3')?.name, 'Agent', 'the catalogue does not draw the bag item as the agent\'s sprite');
});

test('make.sprite: the bag items of a made sprite carry its token; a passing re-make reaches every one of them and nothing else', async () => {
  const L = await fresh();
  const first = named('tok-gem', 'First');
  assert.equal((await L.make.sprite(first)).ok, true);
  const x = await L.bag.add('tok-gem'), y = await L.bag.add('tok-gem', { params: { shape: 'square' } });
  const T = madeToken(bag.get(x.key).definition.data);
  assert.deepEqual([x.item.made, y.item.made], [T, T], 'each item carries the token of the make call');
  // another sprite with that id comes in afterwards: it gets an id of its own, and the re-make does not reach it
  const studio = bag.add({ kind: 'sprite', id: 'tok-gem', settings: {}, definition: { data: named('tok-gem', 'Studio') } });
  assert.equal(bag.get(studio).id, 'tok-gem-2');
  const again = await L.make.sprite(named('tok-gem', 'Second'));
  assert.equal(again.ok, true, again.errors.join('\n'));
  assert.equal(again.replaced, true);
  const T2 = bag.get(x.key).made;
  assert.notEqual(T2, T, 'the items now carry the new call\'s token');
  assert.deepEqual(rows(), [['tok-gem', T2, 'Second'], ['tok-gem', T2, 'Second'], ['tok-gem-2', null, 'Studio']]);
  assert.equal(T2, madeToken(bag.get(x.key).definition.data));
});

test('make.sprite never changes another made sprite: a stranger\'s from a link, or mine from an earlier visit (refused); handed back unchanged it is mine again', async () => {
  const L = await fresh();
  const mine = named('earlier-gem', 'Made before');
  assert.equal((await L.make.sprite(mine)).ok, true);
  const k = (await L.bag.add('earlier-gem')).key;
  const T = bag.get(k).made;
  // a reload: nothing is made on this visit yet, the bag still holds the item with its token
  const L2 = visit();
  const other = await L2.make.sprite(named('earlier-gem', 'Something else'));
  assert.equal(other.ok, false, 'another make call does not take over the bag\'s made sprite');
  assert.equal(other.kept, false);
  assert.deepEqual(rows(), [['earlier-gem', T, 'Made before']]);
  // the very definition the bag holds, handed over again, is the same make: then a re-make reaches the item
  const rejoin = await L2.make.sprite(bag.get(k).definition.data);
  assert.equal(rejoin.ok, true, rejoin.errors.join('\n'));
  const next = await L2.make.sprite(named('earlier-gem', 'Made again'));
  assert.equal(next.ok, true, next.errors.join('\n'));
  assert.deepEqual(rows().map((r) => r.slice(0, 1).concat(r.slice(2))), [['earlier-gem', 'Made again']]);
  // a stranger's made sprite of that id, from a link added to the bag: an id of its own, and my re-makes never reach it
  const { createBag, memoryStorage } = await import('../../app/bag.js');
  const theirs = createBag(memoryStorage());
  const stranger = named('earlier-gem', 'Stranger');
  theirs.add({ kind: 'sprite', id: 'earlier-gem', settings: {}, definition: { data: stranger }, made: madeToken(stranger) });
  await bag.fromLinkAsync(theirs.toLink(), { mode: 'add' });
  assert.deepEqual(rows().map((r) => [r[0], r[2]]), [['earlier-gem', 'Made again'], ['earlier-gem-2', 'Stranger']]);
  assert.equal((await L2.make.sprite(named('earlier-gem', 'Third'))).ok, true);
  assert.deepEqual(rows().map((r) => [r[0], r[2]]), [['earlier-gem', 'Third'], ['earlier-gem-2', 'Stranger']]);
});

test('the catalogue registers what the bag downloads: the first item of an id is drawn under it, and the second is numbered', async () => {
  await fresh();
  const { memoryStorage, createBag } = await import('../../app/bag.js');
  // stored (or written by another tab): two items under one id with different definitions, not settled yet
  const s = memoryStorage();
  s.setItem('loadout-bag-v1', JSON.stringify({ version: 1, next: 3, items: [
    { key: 'i1', kind: 'sprite', id: 'shown-gem', settings: {}, definition: { data: named('shown-gem', 'Gold') } },
    { key: 'i2', kind: 'sprite', id: 'shown-gem', settings: {}, definition: { data: named('shown-gem', 'Blue') } },
  ] }));
  const b = createBag(s, { taken: C.takenFor });
  const stop = followStudio(b);
  try {
    await C.studioSettled();
    assert.equal(C.assetById('shown-gem')?.name, 'Gold', 'before settling, the id is drawn as the first item, the one that keeps it');
    const stopSettle = settleStudioIds(b, () => C.loadCatalog());
    await new Promise((done) => setTimeout(done, 50));
    await C.studioSettled();
    stopSettle();
    assert.deepEqual(b.items().map((i) => [i.id, i.definition.data.name]), [['shown-gem', 'Gold'], ['shown-gem-2', 'Blue']], 'the second gets a free id');
    for (const i of b.items()) assert.equal(C.assetById(i.id)?.name, i.definition.data.name, `${i.id} is drawn as the bag holds it`);
  } finally { b.clear(); stop(); await C.studioSettled(); }
});

test('addStudioSprite keeps the rule: an id a sprite made on this visit holds is not registered for another definition', async () => {
  const L = await fresh();
  assert.equal((await L.make.sprite(named('held-gem', 'Made now'))).ok, true);
  const other = await C.addStudioSprite(named('held-gem', 'Someone else'));
  assert.equal(other.ok, false);
  assert.match(other.errors.join('\n'), /another definition/);
  assert.equal(C.assetById('held-gem').name, 'Made now');
  const same = await C.addStudioSprite(JSON.parse(JSON.stringify((await L.assets.get('held-gem')).asset.definition)));
  assert.equal(same.ok, true, 'its own definition is fine: it is drawn as it is');
});
