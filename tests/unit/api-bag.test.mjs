// The bag keeps the whole definition of an asset made on a visit (Contract 11), so the asset is still there after a
// reload and travels in a shared link: a sound patch, or (before build item B11) sprite source text, which the site now
// keeps only to say it was made with an older version of Loadout (app/api.js madeItemState; Keyang's DQ2). app/bag.js runs in Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, LINK_LIMIT, MAX_SOURCE } from '../../app/bag.js';

const SOURCE = "import { defineSprite } from '../engine/sprite.js';\nexport default defineSprite({ id: 'my-gem' /* ... */ });\n";
const PATCH = { format: 'sfxpatch/0.1', id: 'my-chime', name: 'Chime', category: 'pickup', duration: '0.2', params: [], nodes: [{ id: 'o', type: 'osc', freq: 800 }], out: 'o' };
const gem = (over = {}) => ({ kind: 'sprite', id: 'my-gem', settings: { params: { size: 1 }, cues: null, scale: 2 }, definition: { source: SOURCE }, ...over });
const chime = (over = {}) => ({ kind: 'sound', id: 'my-chime', settings: { params: {}, style: null, seed: 1 }, definition: { patch: PATCH }, ...over });

test('an item keeps its definition, and a catalogue item has none', () => {
  const bag = createBag(memoryStorage());
  const a = bag.add(gem()), b = bag.add(chime()), c = bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.deepEqual(bag.get(a).definition, { source: SOURCE });
  assert.deepEqual(bag.get(b).definition, { patch: PATCH });
  assert.ok(!('definition' in bag.get(c)));
  assert.equal(bag.madeCount(), 2);
  // what comes out is a copy: changing it does not change the bag
  bag.get(b).definition.patch.name = 'changed';
  assert.equal(bag.get(b).definition.patch.name, 'Chime');
});

test('the definition survives a reload: a new bag on the same storage has it', () => {
  const storage = memoryStorage();
  createBag(storage).add(gem());
  createBag(storage).add(chime());
  const again = createBag(storage);
  assert.deepEqual(again.items().map((i) => [i.id, i.definition]), [['my-gem', { source: SOURCE }], ['my-chime', { patch: PATCH }]]);
  assert.deepEqual(again.items()[0].settings, { params: { size: 1 }, cues: null, scale: 2 });
});

test('a definition of the wrong shape is dropped, not stored', () => {
  const bag = createBag(memoryStorage());
  for (const definition of [null, 7, 'text', {}, { source: '' }, { source: 7 }, { patch: 'x' }, { patch: PATCH }, { source: 'x'.repeat(MAX_SOURCE + 1) }]) {
    const key = bag.add({ kind: 'sprite', id: 'my-gem', settings: {}, definition });
    assert.ok(!('definition' in bag.get(key)), JSON.stringify(definition).slice(0, 40));
  }
  const key = bag.add({ kind: 'sound', id: 'my-chime', settings: {}, definition: { source: SOURCE } });
  assert.ok(!('definition' in bag.get(key)), 'a sound keeps a patch, not source text');
  const fn = bag.add({ kind: 'sound', id: 'my-chime', settings: {}, definition: { patch: { ...PATCH, run() {} } } });
  assert.deepEqual(bag.get(fn).definition.patch, PATCH, 'only plain data is kept');
});

test('a shared link carries the definitions and gives them back', () => {
  const from = createBag(memoryStorage());
  from.add(gem()); from.add(chime()); from.add({ kind: 'sprite', id: 'knight', settings: {} });
  const link = from.toLink();
  const to = createBag(memoryStorage());
  assert.deepEqual(to.peekLink(link), { count: 3, made: 2, old: 1 }, 'source text is no longer a program that runs: it is counted as old (B11, DQ2)');
  assert.equal(to.fromLink(link), 3);
  assert.deepEqual(to.items().map((i) => [i.kind, i.id, i.definition ?? null]), [['sprite', 'my-gem', { source: SOURCE }], ['sound', 'my-chime', { patch: PATCH }], ['sprite', 'knight', null]]);
  assert.deepEqual(to.items()[0].settings, from.items()[0].settings);
  // a link with nothing made on a visit reads as before
  const plain = createBag(memoryStorage());
  plain.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.deepEqual(to.peekLink(plain.toLink()), { count: 1 });
});

test('LINK_LIMIT is a number of characters, and a small made asset fits under it', () => {
  assert.ok(Number.isInteger(LINK_LIMIT) && LINK_LIMIT >= 2000);
  const bag = createBag(memoryStorage());
  bag.add(chime());
  assert.ok(bag.toLink().length < LINK_LIMIT);
  bag.add(gem({ definition: { source: `// ${'x'.repeat(LINK_LIMIT)}\n${SOURCE}` } }));
  assert.ok(bag.toLink().length > LINK_LIMIT, 'a long source makes a link over the limit: the page then says so instead of copying it');
});

test('setDefinitions: whoever knows the assets made on this visit fills the definition in', () => {
  const bag = createBag(memoryStorage());
  bag.setDefinitions((kind, id) => (id === 'my-gem' ? { source: SOURCE } : null));
  const a = bag.add({ kind: 'sprite', id: 'my-gem', settings: {} });          // what a card's "Add to bag" button does
  const b = bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  const c = bag.add(gem({ definition: { source: '// mine\n' } }));           // one handed in is kept
  assert.deepEqual(bag.get(a).definition, { source: SOURCE });
  assert.ok(!('definition' in bag.get(b)));
  assert.deepEqual(bag.get(c).definition, { source: '// mine\n' });
  bag.setDefinitions(() => { throw new Error('boom'); });
  assert.doesNotThrow(() => bag.add({ kind: 'sprite', id: 'knight', settings: {} }));
});

test('redefine: an asset made again under the same id replaces the definition of every bag item of it', () => {
  const bag = createBag(memoryStorage());
  let told = 0;
  const a = bag.add(gem()), b = bag.add(gem({ settings: { params: { size: 0 } } })), c = bag.add(chime());
  bag.onChange(() => told++);
  assert.equal(bag.redefine('my-gem', { source: '// new\n' }), 2);
  assert.deepEqual([bag.get(a).definition, bag.get(b).definition], [{ source: '// new\n' }, { source: '// new\n' }]);
  assert.deepEqual(bag.get(c).definition, { patch: PATCH });
  assert.deepEqual(bag.get(b).settings.params, { size: 0 }, 'settings stay');
  assert.equal(told, 1);
  assert.equal(bag.redefine('nothing', { source: '// x\n' }), 0);
  assert.equal(told, 1, 'nothing changed, nobody told');
  assert.equal(bag.redefine('my-gem', { nonsense: true }), 0, 'a bad definition changes nothing');
});
