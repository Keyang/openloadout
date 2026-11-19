// Studio item S8, review round 2 (issue 7; Contract 14 rule 6): the bag reads a studio definition before the large
// checker has loaded, so it needs the plain-data wall on its own. catalog/plain-data.js is that wall (the walk of
// catalog/studio-schema.js plainCopy, in a module with no imports); app/bag.js uses it, and this file holds it to the
// same answers as plainStudioData so the two cannot drift apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainData, PLAIN_LIMITS, PROTO_KEYS } from '../../catalog/plain-data.js';
import { plainStudioData, STUDIO_LIMITS } from '../../catalog/studio-schema.js';
import { cleanDefinition } from '../../app/bag.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const beast = (over = {}) => ({ ...studioTemplate('four-legs'), id: 'moss-beast', name: 'Moss beast', ...over });

// inputs the two walls must answer alike: good ones, and every kind of thing the wall refuses or drops
function inputs() {
  const list = [];
  list.push(['a template', beast()]);
  for (const id of ['blank', 'two-legs', 'topdown-beast']) list.push([`template ${id}`, { ...studioTemplate(id), id: `x-${id}` }]);
  list.push(['prototype keys', JSON.parse(`{"__proto__":{"polluted":1},"constructor":{"x":1},"a":{"prototype":2,"b":1}}`)]);
  const getter = { a: 1 }; Object.defineProperty(getter, 'b', { get() { throw new Error('ran'); }, enumerable: true });
  list.push(['a getter', getter]);
  const arrGetter = [1, 2]; Object.defineProperty(arrGetter, 1, { get() { throw new Error('ran'); } });
  list.push(['a getter in a list', { a: arrGetter }]);
  const extra = [1, 2, 3]; extra.note = 'not an entry'; extra.x = { y: 1 };
  list.push(['a list with own fields', { a: extra }]);
  list.push(['a hole', { a: [1, , 3] }]);      // eslint-disable-line no-sparse-arrays
  list.push(['undefined in a list', { a: [1, undefined] }]);
  list.push(['an undefined field', { a: 1, b: undefined }]);
  list.push(['NaN', { a: NaN }]);
  list.push(['Infinity', { a: [Infinity] }]);
  list.push(['a function', { a: () => 1 }]);
  list.push(['a class instance', { a: new Date(0) }]);
  list.push(['a Map', { a: new Map() }]);
  list.push(['a null-prototype object', Object.assign(Object.create(null), { a: 1 })]);
  const loop = { a: {} }; loop.a.b = loop;
  list.push(['a loop', loop]);
  const shared = { s: 1 }; list.push(['the same object twice (not a loop)', { a: shared, b: shared }]);
  let deep = 1; for (let i = 0; i < 25; i++) deep = [deep];
  list.push(['too deep', { a: deep }]);
  list.push(['too many values', { a: Array.from({ length: 41_000 }, () => 0) }]);
  list.push(['too much text', { a: 'x'.repeat(70 * 1024) }]);
  list.push(['a symbol', { a: Symbol('s') }]);
  list.push(['a bigint', { a: 10n }]);
  const sym = { a: 1 }; sym[Symbol('hidden')] = 2;
  list.push(['a symbol key', sym]);
  const hidden = { a: 1 }; Object.defineProperty(hidden, 'b', { value: 2, enumerable: false });
  list.push(['a field that is not enumerable', hidden]);
  const proxy = new Proxy({ a: 1, b: { c: 2 } }, { get() { throw new Error('get ran'); } });
  list.push(['a proxy', proxy]);
  list.push(['a string', 'text']);
  list.push(['null', null]);
  return list;
}

test('plain data: the caps are the studio schema\'s', () => {
  assert.equal(PLAIN_LIMITS.jsonBytes, STUDIO_LIMITS.jsonBytes);
  assert.equal(PLAIN_LIMITS.nesting, STUDIO_LIMITS.nesting);
  assert.equal(PLAIN_LIMITS.nodes, STUDIO_LIMITS.nodes);
  assert.deepEqual([...PROTO_KEYS].sort(), ['__proto__', 'constructor', 'prototype']);
});

test('plain data: the small wall and plainStudioData give the same answer and the same copy for every input', () => {
  for (const [what, v] of inputs()) {
    if (typeof v === 'string') continue;      // plainStudioData also reads JSON text; the bag hands over objects only
    const mine = plainData(v);
    const theirs = plainStudioData(v);
    assert.equal(mine.errors.length === 0, theirs.ok, `${what}: ${mine.errors[0] ?? ''} | ${theirs.errors[0] ?? ''}`);
    if (theirs.ok) assert.deepEqual(mine.value, theirs.value, what);
    else assert.equal(mine.errors[0], theirs.errors[0], `${what}: the same words`);
  }
});

test('plain data: a list copies its entries only, never its own fields (they are not appended)', () => {
  const extra = [1, 2, 3]; extra.note = 'not an entry';
  assert.deepEqual(plainData({ a: extra }).value, { a: [1, 2, 3] });
});

test('plain data: the bag uses this wall (a list\'s own fields are not appended, getters never run)', () => {
  const d = beast();
  d.size.extra = 'not an entry';
  const clean = cleanDefinition('sprite', { data: d }, { full: false });
  assert.ok(clean, 'kept');
  assert.deepEqual(clean.data.size, [...beast().size]);
  let ran = false;
  const g = beast(); Object.defineProperty(g, 'name', { get() { ran = true; return 'x'; }, enumerable: true });
  assert.equal(cleanDefinition('sprite', { data: g }, { full: false }), null);
  assert.equal(ran, false);
});
