// The bag knows whether the browser keeps it (final review, fault 1). In a private window, or with site data blocked,
// the browser refuses its storage: the bag then lives in memory for this visit only, and must say so, not "saved".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBag, memoryStorage, pickStorage, BAG_KEY } from '../../app/bag.js';

const item = { kind: 'sprite', id: 'knight', settings: {} };

test('a bag on storage the browser keeps says it is kept', () => {
  const bag = createBag(memoryStorage());
  assert.equal(bag.kept(), true);
  bag.add(item);
  assert.equal(bag.kept(), true);
  assert.equal(bag.saved(), true);
});

test('a bag on storage that only lives as long as the page says it is not kept, even though every save "works"', () => {
  const bag = createBag(memoryStorage(), { kept: false });
  assert.equal(bag.kept(), false);
  bag.add(item);
  assert.equal(bag.kept(), false, 'adding must not make it look kept');
  assert.equal(bag.count(), 1, 'it still holds things for this visit');
});

test('a bag whose saves fail is not kept either', () => {
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} };
  const bag = createBag(full);
  bag.add(item);
  assert.equal(bag.saved(), false);
  assert.equal(bag.kept(), false);
});

test('pickStorage: the browser storage when it can be read, with kept true', () => {
  const store = memoryStorage();
  const got = pickStorage({ localStorage: store });
  assert.equal(got.storage, store);
  assert.equal(got.kept, true);
});

test('pickStorage: storage the browser blocks (reading it throws) gives memory, with kept false', () => {
  const win = {};
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('SecurityError: access is denied'); } });
  const got = pickStorage(win);
  assert.equal(got.kept, false);
  got.storage.setItem(BAG_KEY, 'x');
  assert.equal(got.storage.getItem(BAG_KEY), 'x', 'the memory stand-in still works for this visit');
});

test('pickStorage: storage whose getItem throws gives memory, with kept false', () => {
  const got = pickStorage({ localStorage: { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} } });
  assert.equal(got.kept, false);
});

test('pickStorage: no window at all (Node) gives memory, with kept false', () => {
  assert.equal(pickStorage(undefined).kept, false);
  assert.equal(pickStorage({}).kept, false);
});

test('NOT_KEPT says in everyday words what happens and what to do', async () => {
  const { NOT_KEPT } = await import('../../app/bag.js');
  assert.match(NOT_KEPT, /reload|close/i);
  assert.match(NOT_KEPT, /download/i);
  assert.match(NOT_KEPT, /link/i);
  assert.doesNotMatch(NOT_KEPT, /localStorage|storage API|quota|cookie/i);
});
