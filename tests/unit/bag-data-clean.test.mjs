// Studio item S8 (docs/studio.md 2.3, 5 journey d, 6; Contract 14 rules 6, 7, 9): a studio sprite in the bag.
// Its bag item is { kind: 'sprite', id, settings, definition: { data } }: data, checked by engine/data-sprite.js
// validateDataSprite (never strict) on the way in, kept across reloads, and (Keyang's Q1) following later edits of
// its studio draft, with a frozen copy on request. The bag holds no quality bar: data items are never asked for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, cleanDefinition, loadStudioCheck, studioCheckLoaded, STUDIO_JSON_BYTES, BAG_KEY } from '../../app/bag.js';
import { STUDIO_LIMITS } from '../../catalog/studio-schema.js';
import { validateDataSprite } from '../../engine/data-sprite.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const beast = (over = {}) => ({ ...studioTemplate('four-legs'), id: 'moss-beast', name: 'Moss beast', ...over });
const item = (data, over = {}) => ({ kind: 'sprite', id: data.id, settings: {}, definition: { data }, ...over });

// ---- before the checker has arrived: the plain-data wall only (the checker is loaded on demand: it is large) ----

test('bag data: before the checker is loaded, cleanDefinition keeps only plain studio JSON within 64 KB', () => {
  assert.equal(studioCheckLoaded(), false, 'this test runs first, before anything loads the checker');
  assert.equal(STUDIO_JSON_BYTES, STUDIO_LIMITS.jsonBytes);
  const d = cleanDefinition('sprite', { data: beast() });
  assert.deepEqual(d, { data: beast() });
  assert.equal(cleanDefinition('sprite', { data: { ...beast(), format: 'loadout-rig' } }), null);
  assert.equal(cleanDefinition('sprite', { data: { ...beast(), id: 'Bad Id' } }), null);
  assert.equal(cleanDefinition('sprite', { data: 'text' }), null);
  assert.equal(cleanDefinition('sprite', { data: { ...beast(), blurb: 'x'.repeat(STUDIO_JSON_BYTES) } }), null, 'over 64 KB');
  assert.equal(cleanDefinition('sound', { data: beast() }), null, 'only a sprite can be studio data');
  // prototype keys are dropped; a getter is never run
  const hostile = JSON.parse(`{"__proto__":{"polluted":1},"constructor":{"x":1},${JSON.stringify(beast()).slice(1)}`);
  const clean = cleanDefinition('sprite', { data: hostile });
  assert.ok(clean);
  assert.equal(Object.hasOwn(clean.data, '__proto__'), false);
  assert.equal(Object.hasOwn(clean.data, 'constructor'), false);
  assert.equal({}.polluted, undefined);
  let ran = false;
  const sneaky = beast();
  Object.defineProperty(sneaky, 'name', { enumerable: true, get() { ran = true; return 'x'; } });
  assert.equal(cleanDefinition('sprite', { data: sneaky }), null);
  assert.equal(ran, false);
  // a definition with data and source is studio data only
  assert.deepEqual(Object.keys(cleanDefinition('sprite', { data: beast(), source: 'export default 1' })), ['data']);
});

// ---- with the checker ----

test('bag data: with the checker, cleanDefinition validates (never strict) and keeps the cleaned copy', async () => {
  await loadStudioCheck();
  assert.equal(studioCheckLoaded(), true);
  const d = cleanDefinition('sprite', { data: { ...beast(), extra: 1 } });
  assert.ok(d);
  assert.equal('extra' in d.data, false, 'unknown fields dropped');
  assert.deepEqual(d.data, validateDataSprite(beast()).value);
  // meta gaps are warnings outside strict mode, so a studio sprite without words still goes in the bag
  const { words, ...meta } = beast().meta;
  assert.ok(cleanDefinition('sprite', { data: beast({ meta }) }));
  assert.equal(validateDataSprite(beast({ meta }), { strict: true }).ok, false);
  // a definition that does not pass is refused
  const broken = beast();
  broken.body.rig.shapes[0].bone = 'nope';
  assert.equal(cleanDefinition('sprite', { data: broken }), null);
});

test('bag data: a studio sprite goes in the bag and is kept after a reload', async () => {
  await loadStudioCheck();
  const storage = memoryStorage();
  const bag = createBag(storage, { now: () => 7 });
  const key = bag.add(item(beast()));
  const [it] = bag.items();
  assert.equal(it.key, key);
  assert.equal(it.id, 'moss-beast');
  assert.deepEqual(it.definition, { data: validateDataSprite(beast()).value });
  assert.deepEqual(it.settings, { params: {}, cues: null, scale: 1 });
  assert.equal(bag.madeCount(), 1);
  assert.equal(bag.studioCount(), 1);
  assert.ok(storage.getItem(BAG_KEY).includes('"data"'));
  const again = createBag(storage);
  assert.deepEqual(again.items(), bag.items());
  // the item's id is its definition's id
  assert.equal(again.items()[0].definition.data.id, again.items()[0].id);
});

test('bag data: a definition that does not pass is refused by add, and the bag is unchanged', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  const broken = beast();
  broken.body.rig.shapes[0].bone = 'nope';
  assert.throws(() => bag.add(item(broken)), /studio/i);
  assert.throws(() => bag.add(item({ ...beast(), format: 'nothing' })), /studio/i);
  assert.equal(bag.count(), 0);
});

test('bag data: storage that was changed by hand is read back through the plain-data wall', async () => {
  await loadStudioCheck();
  const storage = memoryStorage();
  const good = validateDataSprite(beast()).value;
  storage.setItem(BAG_KEY, JSON.stringify({ version: 1, next: 3, items: [
    { key: 'i1', kind: 'sprite', id: 'moss-beast', settings: {}, definition: { data: good } },
    { key: 'i2', kind: 'sprite', id: 'odd', settings: {}, definition: { data: { format: 'loadout-sprite', id: 'Not An Id' } } },
  ] }));
  const bag = createBag(storage);
  assert.equal(bag.items()[0].definition.data.name, 'Moss beast');
  // a studio item whose data is not studio data does not become a catalogue item: it is left out
  assert.deepEqual(bag.items().map((i) => i.id), ['moss-beast']);
});

test('bag data: the item\'s id never clashes: a second studio sprite with the same id, or a library id, gets its own', async () => {
  await loadStudioCheck();
  const taken = new Set(['knight']);
  const bag = createBag(memoryStorage(), { taken: (id) => taken.has(id) });
  const a = bag.add(item(beast()));
  const b = bag.add(item(beast({ name: 'Other beast' })));
  const c = bag.add(item(beast({ id: 'knight' })));
  const ids = bag.items().map((i) => i.id);
  assert.deepEqual(ids, ['moss-beast', 'moss-beast-2', 'knight-2']);
  for (const it of bag.items()) assert.equal(it.definition.data.id, it.id);
  assert.equal(bag.get(b).definition.data.name, 'Other beast');
  assert.ok(a && c);
  // a catalogue item with the id a studio sprite wants takes it first
  const bag2 = createBag(memoryStorage());
  bag2.add({ kind: 'sprite', id: 'moss-beast', settings: {} });
  bag2.add(item(beast()));
  assert.deepEqual(bag2.items().map((i) => i.id), ['moss-beast', 'moss-beast-2']);
  // a 40-character id still fits with its number
  const long = 'a'.repeat(40);
  bag2.add(item(beast({ id: long })));
  bag2.add(item(beast({ id: long })));
  assert.deepEqual(bag2.items().slice(2).map((i) => i.id), [long, `${'a'.repeat(38)}-2`]);
});

test('bag data: updateDefinition follows the draft (Q1): the item changes, keeps its key and settings, and tells listeners', async () => {
  await loadStudioCheck();
  const storage = memoryStorage();
  const bag = createBag(storage);
  const key = bag.add(item(beast(), { draft: 'moss-beast', settings: { params: { fur: '#336633' }, scale: 2 } }));
  let told = 0;
  bag.onChange(() => told++);
  assert.equal(bag.updateDefinition(key, { data: beast({ name: 'Mossy' }) }), true);
  assert.equal(told, 1);
  const it = bag.get(key);
  assert.equal(it.definition.data.name, 'Mossy');
  assert.equal(it.draft, 'moss-beast');
  assert.deepEqual(it.settings.params, { fur: '#336633' });
  assert.equal(it.settings.scale, 2);
  assert.equal(createBag(storage).get(key).definition.data.name, 'Mossy', 'kept');
  // the same definition again changes nothing
  assert.equal(bag.updateDefinition(key, { data: beast({ name: 'Mossy' }) }), true);
  assert.equal(told, 1);
  // a renamed sprite id is followed, unless another item holds it
  bag.updateDefinition(key, { data: beast({ id: 'swamp-beast', name: 'Mossy' }) });
  assert.equal(bag.get(key).id, 'swamp-beast');
  assert.equal(bag.get(key).definition.data.id, 'swamp-beast');
  bag.add({ kind: 'sprite', id: 'bog', settings: {} });
  bag.updateDefinition(key, { data: beast({ id: 'bog' }) });
  assert.equal(bag.get(key).id, 'bog-2');
  // what it refuses: no such key, an item that is not studio data, a definition that does not pass
  assert.equal(bag.updateDefinition('nope', { data: beast() }), false);
  const plain = bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.equal(bag.updateDefinition(plain, { data: beast() }), false);
  const broken = beast();
  broken.body.rig.shapes[0].bone = 'nope';
  assert.throws(() => bag.updateDefinition(key, { data: broken }), /studio/i);
  assert.equal(bag.get(key).id, 'bog-2', 'unchanged');
});

test('bag data: keepCopy keeps a frozen copy beside the item that follows; the copy never follows', async () => {
  await loadStudioCheck();
  const storage = memoryStorage();
  const bag = createBag(storage);
  const key = bag.add(item(beast(), { draft: 'moss-beast' }));
  const copy = bag.keepCopy(key);
  assert.equal(typeof copy, 'string');
  assert.notEqual(copy, key);
  const c = bag.get(copy);
  assert.equal(c.frozen, true);
  assert.equal('draft' in c, false);
  assert.equal(c.id, 'moss-beast-2');
  assert.equal(c.definition.data.id, 'moss-beast-2');
  assert.equal(c.definition.data.name, 'Moss beast');
  assert.equal(bag.updateDefinition(copy, { data: beast({ name: 'Changed' }) }), false);
  bag.updateDefinition(key, { data: beast({ name: 'Changed' }) });
  assert.equal(bag.get(copy).definition.data.name, 'Moss beast');
  assert.equal(bag.get(key).definition.data.name, 'Changed');
  assert.equal(bag.get(key).id, 'moss-beast', 'the one that follows keeps its id');
  const back = createBag(storage);
  assert.equal(back.get(copy).frozen, true);
  assert.equal(back.get(key).draft, 'moss-beast');
  // only a studio item has a frozen copy
  const plain = bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.equal(bag.keepCopy(plain), null);
  assert.equal(bag.keepCopy('nope'), null);
});

test('bag data: draft and frozen are kept only on studio items, and only in their own form', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  const k1 = bag.add({ kind: 'sprite', id: 'knight', settings: {}, draft: 'x', frozen: true });
  assert.equal('draft' in bag.get(k1), false);
  assert.equal('frozen' in bag.get(k1), false);
  const k2 = bag.add(item(beast(), { draft: 'Not A Draft' }));
  assert.equal('draft' in bag.get(k2), false);
  const k3 = bag.add(item(beast({ id: 'b2' }), { draft: 'b2', frozen: true }));
  assert.equal(bag.get(k3).frozen, true);
  assert.equal('draft' in bag.get(k3), false, 'a frozen item follows no draft');
});

test('bag data: the shared bag takes a studio definition the way window.loadout.studio.toBag hands it', async () => {
  const m = await import('../../app/bag.js');
  const value = validateDataSprite(studioTemplate('blob')).value;
  assert.ok(m.cleanDefinition('sprite', { data: value })?.data !== undefined);
  const key = m.bag.add({ kind: 'sprite', id: value.id, settings: {}, definition: { data: value }, draft: 'goo' });
  assert.equal(m.bag.get(key).draft, 'goo');
  assert.equal(m.bag.updateDefinition(key, { data: { ...value, name: 'Green goo' } }), true);
  assert.equal(m.bag.items().find((i) => i.key === key).definition.data.name, 'Green goo');
  m.bag.remove(key);
});
