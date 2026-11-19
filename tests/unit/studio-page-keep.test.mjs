// What the studio page keeps (docs/studio.md section 5; item S9; review issues 2 and 3): a change that would break the
// definition is refused and said, never shown or saved; a draft in the bag keeps its bag item up to date (Keyang's Q1,
// follow edits), and every way that can fail is said, never swallowed (Contract 11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptChange, bagTakes, followBag } from '../../app/studio/keep.js';
import { studioTemplate } from '../../rigs/studio-templates.js';
import { validateDataSprite } from '../../engine/data-sprite.js';

const newt = () => validateDataSprite({ ...studioTemplate('four-legs'), id: 'moss-newt', name: 'Moss newt' }).value;

test('a valid change is kept as the validator cleaned it', () => {
  const r = acceptChange({ ...newt(), name: 'Changed' });
  assert.equal(r.ok, true);
  assert.equal(r.def.name, 'Changed');
});

test('a change that would break the definition is refused, in plain words', () => {
  const r = acceptChange({ ...newt(), id: 'Not An Id' });
  assert.equal(r.ok, false);
  assert.match(r.message, /^That change was not made: /);
  assert.equal(r.def, undefined, 'nothing to show');
  const thrown = acceptChange(newt(), { check: () => { throw new Error('boom'); } });
  assert.equal(thrown.ok, false);
  assert.match(thrown.message, /not made/);
});

// a stand-in for app/bag.js: its cleanDefinition and bag (items, add, updateDefinition)
function fakeBag({ takes = true, items = [{ key: 'k1' }], update = () => true } = {}) {
  const calls = [];
  return {
    calls,
    cleanDefinition: (kind, d) => (takes && kind === 'sprite' && d?.data ? { data: d.data } : null),
    bag: { items: () => items, add: () => 'k2', updateDefinition: (key, d) => { calls.push([key, d]); return update(key, d); } },
  };
}

test('the bag takes studio sprites when its cleanDefinition keeps { data } (S8)', () => {
  assert.equal(bagTakes(fakeBag(), newt()), true);
  assert.equal(bagTakes(fakeBag({ takes: false }), newt()), false);
  assert.equal(bagTakes(null, newt()), false);
  assert.equal(bagTakes({ cleanDefinition: () => { throw new Error('x'); }, bag: {} }, newt()), false);
});

test('a draft in the bag updates its bag item', () => {
  const m = fakeBag();
  const r = followBag(m, 'k1', newt());
  assert.deepEqual(r, { state: 'updated' });
  assert.equal(m.calls.length, 1);
  assert.deepEqual(m.calls[0][1], { data: newt() });
});

test('a bag item that was taken out is said, so the draft forgets it', () => {
  const r = followBag(fakeBag({ items: [] }), 'k1', newt());
  assert.equal(r.state, 'gone');
  assert.match(r.message, /no longer in your bag/i);
  const frozen = followBag(fakeBag({ update: () => false }), 'k1', newt());
  assert.equal(frozen.state, 'gone', 'a frozen copy follows nothing');
});

test('a bag that refuses the update says why, never silently', () => {
  const r = followBag(fakeBag({ update: () => { throw new Error('it does not pass the studio checks'); } }), 'k1', newt());
  assert.equal(r.state, 'failed');
  assert.match(r.message, /bag.*not.*updated/i);
  assert.match(r.message, /studio checks/);
  const cannot = followBag(fakeBag({ takes: false }), 'k1', newt());
  assert.equal(cannot.state, 'failed');
  const none = followBag(null, 'k1', newt());
  assert.equal(none.state, 'failed');
});
