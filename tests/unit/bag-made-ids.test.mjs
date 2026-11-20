// Identity in the bag of a sprite made with window.loadout.make.sprite (build items B11, B11b; docs/data-sprites.md
// section 5). Each bag item of a made sprite carries a `made` token: a short hash of the make call that produced the
// definition it holds (madeToken). The rules, each of which a test below breaks when the rule is broken:
//   1. Items share an id only when they carry the same token AND hold the same definition. Two different definitions
//      never share an id in one bag: the one that comes second gets a free id (wanted-2, ...), as a studio sprite does,
//      and, numbered, it is a sprite of its own (it loses its token).
//   2. A re-make (updateDefinition with { data, made }) reaches the items of that token under that id, all at once, and
//      gives them the new call's token. Nothing else: not a studio sprite, a studio draft's item, a frozen copy, or the
//      items of another token.
//   3. The token is kept in storage and travels in a link (`m`); anything that is not a token is dropped.
// The same through window.loadout (make.sprite) is tests/unit/api-made-token.test.mjs and tests/e2e/route2-data.spec.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, loadStudioCheck, madeToken } from '../../app/bag.js';
import { goodData } from '../fixtures/api/data.mjs';

const ID = 'dup-gem';
const gem = (over = {}, id = ID) => ({ ...goodData(id), ...over });
const T = madeToken(gem());                    // the token of the make call that made gem()
const rows = (bag) => bag.items().map((i) => [i.id, i.made ?? null, i.definition.data.id, i.definition.data.name, ...(i.from ? [i.from] : [])]);
const linkOf = (entries) => '#/bag?load=' + Buffer.from(JSON.stringify({ v: 1, i: entries })).toString('base64url');

test('madeToken: a short hash of a make call\'s definition; the same definition gives the same token, another gives another', () => {
  assert.match(T, /^[a-z0-9]{6,16}$/);
  assert.equal(madeToken(gem()), T);
  assert.notEqual(madeToken(gem({ name: 'Better gem' })), T);
  assert.notEqual(madeToken(gem({}, 'other-gem')), T, 'the id is part of the call');
});

test('bag: items of one made sprite share its id, in storage and through a link; the token goes with them', async () => {
  await loadStudioCheck();
  const storage = memoryStorage();
  const bag = createBag(storage);
  const a = bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem() }, made: T });
  bag.add({ kind: 'sprite', id: ID, settings: { params: { shape: 'square' } }, definition: { data: gem() }, made: T });
  assert.deepEqual(rows(bag).map((r) => r.slice(0, 2)), [[ID, T], [ID, T]]);
  assert.equal(bag.settleIds(), 0, 'settling renames neither');
  assert.deepEqual(createBag(storage).items().map((i) => [i.id, i.made]), [[ID, T], [ID, T]], 'storage keeps the token');
  const to = createBag(memoryStorage());
  assert.equal(await to.fromLinkAsync(bag.toLink()), 2);
  assert.deepEqual(to.items().map((i) => [i.id, i.made]), [[ID, T], [ID, T]], 'a link carries it');
  assert.equal(to.settleIds(), 0);
  assert.equal(bag.get(a).made, T);
});

test('bag: anything that is not a token is dropped, from an add, from storage and from a link', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  for (const bad of [true, 1, 'A', 'has space', 'x'.repeat(40), { t: T }]) {
    const k = bag.add({ kind: 'sprite', id: `bad-${bag.count()}`, settings: {}, definition: { data: gem({}, `bad-${bag.count()}`) }, made: bad });
    assert.equal(bag.get(k).made, undefined, JSON.stringify(bad));
  }
  const storage = memoryStorage();
  storage.setItem('loadout-bag-v1', JSON.stringify({ version: 1, items: [{ key: 'i1', kind: 'sprite', id: ID, settings: {}, made: 'NOT A TOKEN', definition: { data: gem() } }], next: 2 }));
  assert.equal(createBag(storage).items()[0].made, undefined);
  const to = createBag(memoryStorage());
  await to.fromLinkAsync(linkOf([['s', ID, {}, { d: gem(), m: '<script>' }]]));
  assert.equal(to.items()[0].made, undefined);
});

test('bag: one token with two definitions under one id: the second is numbered and loses the token (add, link, storage)', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: gem({ name: 'A' }, 'gem') }, made: T });
  bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: gem({ name: 'B' }, 'gem') }, made: T });
  assert.deepEqual(rows(bag), [['gem', T, 'gem', 'A'], ['gem-2', null, 'gem-2', 'B']]);
  // a link that claims one token for two definitions opens as two sprites
  const gold = gem({ name: 'Gold twin' }, 'twin-gem'), blue = gem({ name: 'Other twin' }, 'twin-gem');
  const twin = createBag(memoryStorage());
  assert.equal(await twin.fromLinkAsync(linkOf([['s', 'twin-gem', {}, { d: gold, m: T }], ['s', 'twin-gem', {}, { d: blue, m: T }], ['s', 'twin-gem', {}, { d: gold, m: T }]])), 3);
  assert.deepEqual(rows(twin), [['twin-gem', T, 'twin-gem', 'Gold twin', 'link'], ['twin-gem-2', null, 'twin-gem-2', 'Other twin', 'link'], ['twin-gem', T, 'twin-gem', 'Gold twin', 'link']]);
  // a stored pair: settled apart, the first keeps the id
  const storage = memoryStorage();
  const item = (key, name) => ({ key, kind: 'sprite', id: 'gem', settings: {}, addedAt: 1, made: T, definition: { data: gem({ name }, 'gem') } });
  storage.setItem('loadout-bag-v1', JSON.stringify({ version: 1, items: [item('i1', 'A'), item('i2', 'B'), item('i3', 'A')], next: 4 }));
  const stored = createBag(storage);
  assert.equal(stored.settleIds(), 1);
  assert.deepEqual(rows(stored), [['gem', T, 'gem', 'A'], ['gem-2', null, 'gem-2', 'B'], ['gem', T, 'gem', 'A']]);
  assert.equal(stored.settleIds(), 0);
});

test('bag: one definition under two tokens (two make calls) does not share an id either: the token is the identity', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem() }, made: T });
  bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem() }, made: 'zzzzzzzz' });
  assert.deepEqual(rows(bag).map((r) => r.slice(0, 2)), [[ID, T], [`${ID}-2`, null]]);
});

test('bag: a shared link added to a bag that holds my made sprite of that id gives the stranger\'s an id of its own', async () => {
  await loadStudioCheck();
  const mine = createBag(memoryStorage());
  const myData = gem({ name: 'Mine' }, 'gem'), theirData = gem({ name: 'Stranger' }, 'gem');
  mine.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: myData }, made: madeToken(myData) });
  const theirs = createBag(memoryStorage());
  theirs.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: theirData }, made: madeToken(theirData) });
  assert.equal(await mine.fromLinkAsync(theirs.toLink(), { mode: 'add' }), 1);      // the bag page's "Add n items from the shared bag"
  assert.deepEqual(rows(mine), [['gem', madeToken(myData), 'gem', 'Mine'], ['gem-2', null, 'gem-2', 'Stranger', 'link']]);
  assert.equal(mine.settleIds(), 0);
  // my very sprite from a link (same token, same definition) is the same sprite: it shares the id
  const same = createBag(memoryStorage());
  same.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: myData }, made: madeToken(myData) });
  await mine.fromLinkAsync(same.toLink(), { mode: 'add' });
  assert.deepEqual(rows(mine).map((r) => r.slice(0, 4)), [['gem', madeToken(myData), 'gem', 'Mine'], ['gem-2', null, 'gem-2', 'Stranger'], ['gem', madeToken(myData), 'gem', 'Mine']]);
});

test('bag: a studio sprite and a frozen copy get ids of their own; an item handed in with a made item\'s very definition joins it', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  const a = bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem() }, made: T });
  const copy = bag.keepCopy(a);
  assert.deepEqual([bag.get(copy).id, bag.get(copy).made], [`${ID}-2`, undefined], 'a frozen copy follows nothing');
  const studio = bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem({ name: 'Studio gem' }) } });
  assert.deepEqual([bag.get(studio).id, bag.get(studio).made], [`${ID}-3`, undefined], 'a studio sprite never takes a made sprite\'s id');
  const drafted = bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem() }, draft: 'dr1' });
  assert.deepEqual([bag.get(drafted).id, bag.get(drafted).made], [`${ID}-4`, undefined], 'a draft\'s item is the studio\'s, even with the same data');
  const same = bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem() } });      // loadout.bag.add of the sprite's own row after a reload
  assert.deepEqual([bag.get(same).id, bag.get(same).made], [ID, T]);
});

test('bag: an item added by id gets the made definition and its token (the page\'s "Add to my bag")', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  bag.setDefinitions((kind, id) => (kind === 'sprite' && id === ID ? { data: gem(), made: T } : null));
  bag.add({ kind: 'sprite', id: ID, settings: {} });
  bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem() } });      // the definition the visit made, without the token
  bag.add({ kind: 'sprite', id: ID, settings: {}, definition: { data: gem({ name: 'Another gem' }) } });      // another definition: a studio sprite
  assert.deepEqual(rows(bag).map((r) => r.slice(0, 2)), [[ID, T], [ID, T], [`${ID}-2`, null]]);
});

test('bag: a re-make reaches the items of its token under its id, all at once, and gives them the new token; nothing else', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  const keys = [0, 1, 2].map(() => bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: gem({}, 'gem') }, made: T }));
  const studio = bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: gem({ name: 'Studio' }, 'gem') } });
  const other = bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: gem({ name: 'Other make' }, 'gem') }, made: 'othertok' });
  const drafted = bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: gem({ name: 'Drafted' }, 'gem') }, draft: 'dr1' });
  assert.deepEqual([studio, other, drafted].map((k) => bag.get(k).id), ['gem-2', 'gem-3', 'gem-4']);
  const better = gem({ name: 'Better' }, 'gem'), T2 = madeToken(better);
  // what app/api-core.js make.sprite does: updateDefinition on one item of the token
  assert.equal(bag.updateDefinition(keys[1], { data: better, made: T2 }), true);
  assert.deepEqual(rows(bag), [['gem', T2, 'gem', 'Better'], ['gem', T2, 'gem', 'Better'], ['gem', T2, 'gem', 'Better'],
    ['gem-2', null, 'gem-2', 'Studio'], ['gem-3', null, 'gem-3', 'Other make'], ['gem-4', null, 'gem-4', 'Drafted']]);
  for (const k of keys) assert.equal(bag.updateDefinition(k, { data: better, made: T2 }), true);
  assert.deepEqual(rows(bag).map((r) => r[0]), ['gem', 'gem', 'gem', 'gem-2', 'gem-3', 'gem-4']);
  // a token handed to a studio sprite's update does not make it a made sprite
  assert.equal(bag.updateDefinition(studio, { data: gem({ name: 'Studio 2' }, 'gem-2'), made: T2 }), true);
  assert.equal(bag.get(studio).made, undefined);
});

test('bag: a made item whose id another definition holds is numbered and loses its token, so a later re-make cannot reach it', async () => {
  await loadStudioCheck();
  const held = new Map([['gem', gem({ name: 'Made now' }, 'gem')]]);
  // taken(id, data), as app/catalog.js takenFor: a sprite made on this visit holds its id against other definitions
  const bag = createBag(memoryStorage(), { taken: (id, data) => held.has(id) && JSON.stringify(held.get(id)) !== JSON.stringify(data) });
  const old = gem({ name: 'Made before' }, 'gem');
  const k = bag.add({ kind: 'sprite', id: 'gem', settings: {}, definition: { data: old }, made: madeToken(old) });
  assert.deepEqual(rows(bag), [['gem-2', null, 'gem-2', 'Made before']]);
  // a stored one is settled the same way once the made sprite is known
  const storage = memoryStorage();
  storage.setItem('loadout-bag-v1', JSON.stringify({ version: 1, items: [{ key: 'i1', kind: 'sprite', id: 'gem', settings: {}, made: madeToken(old), definition: { data: old } }], next: 2 }));
  const stored = createBag(storage, { taken: (id, data) => held.has(id) && JSON.stringify(held.get(id)) !== JSON.stringify(data) });
  assert.equal(stored.settleIds(), 1);
  assert.deepEqual(rows(stored), [['gem-2', null, 'gem-2', 'Made before']]);
  assert.ok(k);
});
