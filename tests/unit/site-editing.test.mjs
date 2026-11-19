// Changes save themselves (docs/site-design.md, section 3): the edit session behind the editing panel (app/editing.js),
// against a real bag on memory storage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, NOT_KEPT } from '../../app/bag.js';
import { createEdit, countChanges } from '../../app/editing.js';

const defaults = () => ({ params: { height: 0.5, weapon: 'sword', hair: '#5a3a22' }, cues: { walk: [{ sound: 'footstep', frame: 1, preset: null, params: null, volume: 1 }] }, scale: 1 });
const open = (bag, more = {}) => createEdit({ kind: 'sprite', id: 'knight', defaults: defaults(), bag, ...more });
const withParam = (edit, key, value) => edit.set({ params: { ...edit.settings().params, [key]: value } });

test('opening a page without changing anything adds nothing', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  assert.equal(bag.count(), 0);
  assert.equal(edit.inBag(), false);
  assert.equal(edit.state().status, 'idle');
  assert.match(edit.state().text, /save by themselves/i);
  assert.deepEqual(edit.settings(), defaults());
});

test('the first change creates the bag item, later changes update that same item', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  withParam(edit, 'weapon', 'axe');
  assert.equal(bag.count(), 1);
  const [item] = bag.items();
  assert.equal(item.id, 'knight');
  assert.equal(item.settings.params.weapon, 'axe');
  assert.equal(edit.key(), item.key);
  withParam(edit, 'height', 0.9);
  edit.set({ scale: 2 });
  assert.equal(bag.count(), 1, 'still one item');
  assert.equal(bag.get(item.key).settings.params.height, 0.9);
  assert.equal(bag.get(item.key).settings.scale, 2);
  const s = edit.state();
  assert.equal(s.status, 'saved');
  assert.match(s.text, /Saved in your bag/);
  assert.equal(s.changes, 2);
  assert.match(s.detail, /2 changes/);
});

test('opened from the bag (its key in the address) it edits that item and starts from its settings', () => {
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sprite', id: 'knight', settings: { params: { ...defaults().params, weapon: 'spear' }, cues: null, scale: 1 } });
  const key = bag.add({ kind: 'sprite', id: 'knight', settings: { params: { ...defaults().params, weapon: 'axe' }, cues: null, scale: 4 } });
  const edit = open(bag, { key });
  assert.equal(edit.key(), key);
  assert.equal(edit.settings().params.weapon, 'axe');
  assert.equal(edit.settings().scale, 4);
  assert.deepEqual(edit.settings().cues, defaults().cues, 'an item stored without its own sounds has the asset\'s own');
  withParam(edit, 'height', 0.1);
  assert.equal(bag.count(), 2);
  assert.equal(bag.get(key).settings.params.height, 0.1);
});

test('opened from anywhere else it edits the bag item for that asset if there is one', () => {
  const bag = createBag(memoryStorage());
  bag.add({ kind: 'sound', id: 'knight', settings: {} });      // another kind with the same id is not it
  const key = bag.add({ kind: 'sprite', id: 'knight', settings: { params: { ...defaults().params, weapon: 'axe' }, cues: null, scale: 1 } });
  const edit = open(bag, { start: defaults() });
  assert.equal(edit.key(), key);
  assert.equal(edit.settings().params.weapon, 'axe', 'the page shows the item as it was changed');
  assert.equal(edit.state().status, 'saved');
  withParam(edit, 'weapon', 'sword');
  assert.equal(bag.count(), 2);
  assert.equal(bag.get(key).settings.params.weapon, 'sword');
});

test('a link that carries settings shows those settings and does not overwrite the visitor\'s own item', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add({ kind: 'sprite', id: 'knight', settings: { params: { ...defaults().params, weapon: 'axe' }, cues: null, scale: 1 } });
  const start = { ...defaults(), params: { ...defaults().params, weapon: 'spear', height: 0.2 } };
  const edit = open(bag, { start });
  assert.equal(edit.settings().params.weapon, 'spear', 'the link\'s settings still work');
  assert.equal(edit.inBag(), false);
  assert.equal(bag.count(), 1, 'opening a link adds nothing');
  withParam(edit, 'height', 0.3);
  assert.equal(bag.count(), 2, 'the first change keeps it as its own item');
  assert.equal(bag.get(key).settings.params.weapon, 'axe');
  assert.equal(bag.get(edit.key()).settings.params.weapon, 'spear');
});

test('a link with settings and the key of a bag item edits that item (the page was reloaded while editing)', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add({ kind: 'sprite', id: 'knight', settings: { params: { ...defaults().params, weapon: 'axe' }, cues: null, scale: 1 } });
  const edit = open(bag, { key, start: { ...defaults(), params: { ...defaults().params, weapon: 'spear' } } });
  assert.equal(edit.key(), key);
  assert.equal(edit.settings().params.weapon, 'spear');
});

test('a key that is not in the bag, or belongs to another asset, is ignored', () => {
  const bag = createBag(memoryStorage());
  const other = bag.add({ kind: 'sprite', id: 'wolf', settings: {} });
  assert.equal(open(bag, { key: other }).inBag(), false);
  assert.equal(open(bag, { key: 'i99' }).inBag(), false);
});

test('Start over puts the asset back to its defaults and keeps it in the bag', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  withParam(edit, 'weapon', 'axe');
  edit.set({ scale: 4 });
  edit.startOver();
  assert.equal(bag.count(), 1);
  assert.deepEqual(bag.get(edit.key()).settings.params, defaults().params);
  assert.deepEqual(edit.settings(), defaults());
  assert.equal(edit.state().changes, 0);
  assert.match(edit.state().detail, /original/);
});

test('Start over on something that is not in the bag adds nothing', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag, { start: { ...defaults(), params: { ...defaults().params, weapon: 'spear' } } });
  edit.startOver();
  assert.equal(bag.count(), 0);
  assert.deepEqual(edit.settings(), defaults());
});

test('Remove takes it out; the next change puts it back as a new item', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  withParam(edit, 'weapon', 'axe');
  edit.remove();
  assert.equal(bag.count(), 0);
  assert.equal(edit.inBag(), false);
  assert.equal(edit.settings().params.weapon, 'axe', 'what is on screen stays');
  withParam(edit, 'weapon', 'spear');
  assert.equal(bag.count(), 1);
});

test('add() puts it in the bag as it is, once', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  const key = edit.add();
  assert.equal(bag.count(), 1);
  assert.equal(edit.add(), key);
  assert.equal(bag.count(), 1);
  assert.match(edit.state().detail, /original/);
});

test('an item removed somewhere else (the bag page, another tab) is let go of', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  withParam(edit, 'weapon', 'axe');
  const seen = [];
  edit.onChange((s) => seen.push(s.status));
  bag.remove(edit.key());
  assert.equal(edit.inBag(), false);
  assert.equal(seen.at(-1), 'idle');
});

test('when the browser is not keeping the bag the state is the NOT_KEPT warning, not "Saved"', () => {
  const bag = createBag(memoryStorage(), { kept: false });
  const edit = open(bag);
  assert.equal(edit.state().status, 'idle', 'nothing to warn about before anything is in the bag');
  withParam(edit, 'weapon', 'axe');
  const s = edit.state();
  assert.equal(s.status, 'not-kept');
  assert.equal(s.text, NOT_KEPT);
  assert.doesNotMatch(s.text, /^Saved/);
  assert.equal(bag.count(), 1, 'it still holds it for this visit');
});

test('a draft cannot be saved: changes stay on the page', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag, { canSave: false });
  withParam(edit, 'weapon', 'axe');
  assert.equal(bag.count(), 0);
  assert.equal(edit.add(), null);
  assert.equal(edit.state().status, 'off');
  assert.equal(edit.settings().params.weapon, 'axe');
});

test('listeners hear every change, and stop after close()', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  let n = 0, last = null;
  edit.onChange((s) => { n++; last = s; });
  withParam(edit, 'weapon', 'axe');
  assert.ok(n >= 1);
  assert.equal(last.status, 'saved', 'the last thing a listener hears after the first change is that it is saved');
  assert.equal(last.inBag, true);
  edit.close();
  const before = n;
  bag.clear();
  assert.equal(n, before);
});

test('with a schedule, a burst of changes (a slider being dragged) is one save', () => {
  const bag = createBag(memoryStorage());
  let run = null, writes = 0;
  bag.onChange(() => writes++);
  const edit = open(bag, { schedule: (fn) => { run = fn; } });
  for (const h of [0.6, 0.7, 0.8]) withParam(edit, 'height', h);
  assert.equal(edit.state().status, 'saving');
  assert.equal(bag.count(), 0);
  run();
  assert.equal(writes, 1);
  assert.equal(bag.get(edit.key()).settings.params.height, 0.8);
  withParam(edit, 'height', 0.9);
  edit.close();      // leaving the page saves what is pending
  assert.equal(bag.items()[0].settings.params.height, 0.9);
});

test('sounds and music: style and seed are kept, and counted as changes', () => {
  const bag = createBag(memoryStorage());
  const d = { params: { pitch: 440, length: 0.3 }, style: null, seed: 1 };
  const edit = createEdit({ kind: 'sound', id: 'coin-pickup', defaults: d, bag });
  edit.set({ style: 'Deep', params: { pitch: 220, length: 0.3 } });
  assert.deepEqual(bag.items()[0].settings, { params: { pitch: 220, length: 0.3 }, style: 'Deep', seed: 1 });
  assert.equal(edit.state().changes, 2);
  assert.equal(countChanges('sound', { ...d, seed: 7 }, d), 1);
  assert.equal(countChanges('sprite', { ...defaults(), scale: 4 }, defaults()), 0, 'pixel size is how it is exported, not a change to the asset');
  assert.equal(countChanges('sprite', { ...defaults(), cues: {} }, defaults()), 1);
});
