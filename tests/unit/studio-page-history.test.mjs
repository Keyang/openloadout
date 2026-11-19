// The studio page's undo and redo (docs/studio.md section 5, "Undo and redo"; item S9): every finished change pushes a
// snapshot of the definition (at most 64 KB) on a stack of 200, in memory only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, HISTORY_LIMIT, SNAPSHOT_BYTES } from '../../app/studio/history.js';

const def = (n) => ({ format: 'loadout-sprite', id: 'x', name: `v${n}` });

test('the limits are the design\'s: 200 steps, 64 KB a snapshot', () => {
  assert.equal(HISTORY_LIMIT, 200);
  assert.equal(SNAPSHOT_BYTES, 64 * 1024);
});

test('undo goes back one finished change at a time, redo forward again', () => {
  const h = createHistory(def(0));
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
  h.push(def(1));
  h.push(def(2));
  assert.equal(h.canUndo(), true);
  assert.deepEqual(h.undo(), def(1));
  assert.deepEqual(h.undo(), def(0));
  assert.equal(h.undo(), null, 'nothing before the first');
  assert.equal(h.canRedo(), true);
  assert.deepEqual(h.redo(), def(1));
  assert.deepEqual(h.redo(), def(2));
  assert.equal(h.redo(), null);
  assert.deepEqual(h.now(), def(2));
});

test('a new change after an undo drops the steps that were undone', () => {
  const h = createHistory(def(0));
  h.push(def(1));
  h.push(def(2));
  h.undo();
  h.push(def(3));
  assert.equal(h.canRedo(), false);
  assert.deepEqual(h.undo(), def(1));
});

test('pushing the same definition again is not a step', () => {
  const h = createHistory(def(0));
  assert.equal(h.push(def(0)), false);
  assert.equal(h.canUndo(), false);
  assert.equal(h.push(def(1)), true);
  assert.equal(h.size(), 2);
});

test('the stack keeps the last 200 steps', () => {
  const h = createHistory(def(0));
  for (let i = 1; i <= 260; i++) h.push(def(i));
  assert.equal(h.size(), HISTORY_LIMIT);
  let last = null, n = 0;
  for (let d; (d = h.undo()); n++) last = d;
  assert.equal(n, HISTORY_LIMIT - 1);
  assert.deepEqual(last, def(61));
});

test('a snapshot over 64 KB is not kept (the change still happens on the page)', () => {
  const h = createHistory(def(0));
  assert.equal(h.push({ ...def(1), blurb: 'x'.repeat(SNAPSHOT_BYTES) }), false);
  assert.equal(h.canUndo(), false);
});

test('what comes back is a copy: changing it does not change the stack', () => {
  const h = createHistory(def(0));
  h.push(def(1));
  const back = h.undo();
  back.name = 'changed';
  assert.deepEqual(h.redo(), def(1));
  assert.deepEqual(h.undo(), def(0));
});
