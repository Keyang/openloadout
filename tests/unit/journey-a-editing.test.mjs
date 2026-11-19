// Keeping changes (docs/user-journeys.md J11, J9.2, reloads across pages): an open edit session (app/editing.js) follows
// its bag item when it changes elsewhere, and a bag item named in the address wins over the settings the address carries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage } from '../../app/bag.js';
import { createEdit } from '../../app/editing.js';

const defaults = () => ({ params: { height: 0.5, weapon: 'sword', hair: '#5a3a22', outfit: '#c9423a' }, cues: { walk: [] }, scale: 1 });
const open = (bag, more = {}) => createEdit({ kind: 'sprite', id: 'knight', defaults: defaults(), bag, ...more });
const withParam = (edit, key, value) => edit.set({ params: { ...edit.settings().params, [key]: value } });

test('a change made to the item elsewhere reaches the open session, and its next change keeps it (J11.2)', () => {
  const bag = createBag(memoryStorage());
  const a = open(bag);
  withParam(a, 'outfit', '#4f9d57');
  const key = a.key();
  const b = open(bag, { key });                       // the same item, opened in the bag's panel
  let told = 0;
  a.onChange(() => told++);
  withParam(b, 'hair', '#3a6ad8');
  assert.equal(a.settings().params.hair, '#3a6ad8', 'A shows what B did');
  assert.ok(told > 0, 'A was told, so its page redraws');
  withParam(a, 'height', 0.9);
  const s = bag.get(key).settings.params;
  assert.equal(s.hair, '#3a6ad8', 'B\'s change is kept');
  assert.equal(s.height, 0.9, 'A\'s change is kept');
  assert.equal(s.outfit, '#4f9d57');
  assert.equal(b.settings().params.height, 0.9, 'B follows A too');
});

test('another tab writing the storage: the session takes the item as it is now after reload()', () => {
  const store = memoryStorage();
  const bagA = createBag(store), bagB = createBag(store);
  const a = open(bagA);
  withParam(a, 'outfit', '#4f9d57');
  bagB.reload();
  const b = open(bagB, { key: a.key() });
  withParam(b, 'hair', '#3a6ad8');
  bagA.reload();                                      // what the storage event does (app/bag.js)
  assert.equal(a.settings().params.hair, '#3a6ad8');
  withParam(a, 'height', 0.2);
  bagB.reload();
  assert.deepEqual(
    { hair: bagB.get(a.key()).settings.params.hair, height: bagB.get(a.key()).settings.params.height, outfit: bagB.get(a.key()).settings.params.outfit },
    { hair: '#3a6ad8', height: 0.2, outfit: '#4f9d57' });
});

test('a change still waiting to be saved is not lost when the item changes elsewhere meanwhile', () => {
  const bag = createBag(memoryStorage());
  let later = null;
  const a = open(bag, { schedule: (fn) => { later = fn; } });
  withParam(a, 'outfit', '#4f9d57'); later();
  const b = open(bag, { key: a.key() });
  withParam(a, 'height', 0.8);                         // waiting
  withParam(b, 'hair', '#3a6ad8');                     // lands first
  assert.equal(a.settings().params.height, 0.8, 'the waiting change stays on screen');
  assert.equal(a.settings().params.hair, '#3a6ad8');
  later();
  const s = bag.get(a.key()).settings.params;
  assert.equal(s.hair, '#3a6ad8'); assert.equal(s.height, 0.8); assert.equal(s.outfit, '#4f9d57');
});

test('a bag item named in the address wins over the settings the address carries, its look included', () => {
  const bag = createBag(memoryStorage());
  const key = bag.add({ kind: 'sprite', id: 'knight', settings: { ...defaults(), params: { ...defaults().params, hair: '#3a6ad8', outfit: '#4f9d57' }, look: 'night' } });
  const edit = open(bag, { key, start: { ...defaults(), params: { ...defaults().params, outfit: '#4f9d57' } } });      // a stale bookmark (browser Back)
  assert.equal(edit.key(), key);
  assert.equal(edit.settings().params.hair, '#3a6ad8');
  assert.equal(edit.settings().look, 'night');
  withParam(edit, 'height', 0.3);
  assert.equal(bag.get(key).settings.look, 'night', 'the next change keeps the look');
  assert.equal(bag.get(key).settings.params.hair, '#3a6ad8');
});

test('settings in an address with no bag item still open as they are (a shared link)', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag, { key: 'i9', start: { ...defaults(), params: { ...defaults().params, weapon: 'axe' } } });
  assert.equal(edit.settings().params.weapon, 'axe');
  assert.equal(edit.inBag(), false);
});

test('changes that are not in the bag say so plainly (J1.2, J9.2)', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag, { start: { ...defaults(), params: { ...defaults().params, weapon: 'axe' } } });
  const s = edit.state();
  assert.equal(s.status, 'unsaved');
  assert.match(s.text, /not in your bag yet/i);
  assert.doesNotMatch(s.text, /save by themselves/i);
  assert.match(open(createBag(memoryStorage())).state().text, /save by themselves/i, 'nothing changed: the usual words');
});

test('after Start over the footer says 0 changes', () => {
  const bag = createBag(memoryStorage());
  const edit = open(bag);
  withParam(edit, 'weapon', 'axe');
  edit.startOver();
  assert.match(edit.state().detail, /^0 changes/);
});
