// Second fix wave, builder E: a pixel size alone does not put an asset in the bag; a shared bag link keeps a sound's and a
// track's version settings (docs/user-journeys.md J9.1, R2, R3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage } from '../../app/bag.js';
import { createEdit } from '../../app/editing.js';

const defaults = () => ({ params: { height: 0.5, weapon: 'sword' }, cues: { walk: [] }, scale: 1 });
const open = (bag, more = {}) => createEdit({ kind: 'sprite', id: 'knight', defaults: defaults(), bag, ...more });

test('a pixel size alone does not add an unchanged asset; Add to my bag does, at that size', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  edit.set({ scale: 2 });
  assert.equal(bag.count(), 0);
  assert.equal(edit.state().status, 'idle');
  edit.add();
  assert.equal(bag.count(), 1);
  assert.equal(bag.items()[0].settings.scale, 2);
});

test('a pixel size with a change does add, and a later size change updates the item', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  edit.set({ params: { ...edit.settings().params, height: 0.9 } });
  assert.equal(bag.count(), 1);
  edit.set({ scale: 4 });
  assert.equal(bag.items()[0].settings.scale, 4);
});

// a sound patch with two named styles, standing in for the catalogue
const PATCH = { id: 'coin', params: [{ id: 'pitch', default: 800 }, { id: 'ring', default: 0.3 }], presets: { Dull: { pitch: 620, ring: 0.1 } } };
const plain = () => Object.fromEntries(PATCH.params.map((p) => [p.id, p.default]));
const standard = (kind, id, s) => ({ params: { ...plain(), ...((s && s.style && PATCH.presets[s.style]) || {}) } });

test('a link leaves out what the version sets, and opening it brings the version\'s settings back', () => {
  const src = createBag(memoryStorage(), { standard });
  src.add({ kind: 'sound', id: 'coin', settings: { params: { pitch: 620, ring: 0.1 }, style: 'Dull', seed: 1 } });
  src.add({ kind: 'sound', id: 'coin', settings: { params: { pitch: 700, ring: 0.1 }, style: 'Dull', seed: 1 } });
  const link = src.toLink();
  const dst = createBag(memoryStorage(), { standard });
  assert.equal(dst.fromLink(link), 2);
  assert.deepEqual(dst.items().map((i) => i.settings), src.items().map((i) => i.settings));
});

test('an edit session fills what an item leaves out from its version, not from the plain defaults', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add({ kind: 'sound', id: 'coin', settings: { params: {}, style: 'Dull', seed: 1 } });
  const edit = createEdit({ kind: 'sound', id: 'coin', key, bag, defaults: { params: plain(), style: null, seed: 1 }, baseFor: (s) => standard('sound', 'coin', s).params });
  assert.deepEqual(edit.settings().params, { pitch: 620, ring: 0.1 });
  assert.equal(edit.changes(), 3, 'two controls and the style');
});
