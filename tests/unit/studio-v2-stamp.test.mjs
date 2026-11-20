// The studio's stamp painter, as pure data changes (build item B17; docs/data-sprites.md sections 2.7 and 6):
// paint a stamp's pixels with palette paints, resize it within the schema's caps (32 x 32, 8,192 stamp pixels in all,
// 32 key characters), its variants kept the same size, unused key characters dropped.
//   node --test tests/unit/studio-v2-stamp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { STAMP_SIDE, STAMP_KEYS, stampSize, cellsOf, paintCell, fillCells, resizeStamp, keyFor, pruneKeys, newStamp, stampPixelsIn, STAMP_PIXEL_CAP, stampRoom } from '../../app/studio/v2-stamp.js';

const mark = () => ({ kind: 'stamp', on: 'coin', at: [-1, -2], rows: ['ab', 'b.'], key: { a: 'gold.light', b: 'gold.dark' } });

test('the caps are the schema\'s', () => {
  assert.equal(STAMP_SIDE, 32);
  assert.equal(STAMP_KEYS, 32);
  assert.equal(STAMP_PIXEL_CAP, 8192);
});

test('size and cells read the rows through the key; see-through cells are null', () => {
  const s = mark();
  assert.deepEqual(stampSize(s), [2, 2]);
  assert.deepEqual(cellsOf(s), [['gold.light', 'gold.dark'], ['gold.dark', null]]);
});

test('painting a cell with a paint the key has reuses its character, and never changes the stamp given', () => {
  const s = mark();
  const t = paintCell(s, 1, 1, 'gold.light');
  assert.deepEqual(t.rows, ['ab', 'ba']);
  assert.deepEqual(s.rows, ['ab', 'b.']);
  assert.deepEqual(t.key, s.key);
});

test('a new paint gets a new character; a paint no cell uses any more leaves the key', () => {
  const t = paintCell(mark(), 0, 0, 'ink');
  assert.equal(t.rows[0][1], 'b');
  const ch = t.rows[0][0];
  assert.equal(t.key[ch], 'ink');
  assert.equal(t.key.a, undefined, 'gold.light is used by no cell any more');
  assert.equal(Object.keys(t.key).length, 2);
});

test('erasing (null) makes a cell see-through', () => {
  const t = paintCell(mark(), 0, 0, null);
  assert.deepEqual(t.rows, ['.b', 'b.']);
  assert.deepEqual(Object.keys(t.key), ['b']);
});

test('cells outside the stamp are left alone', () => {
  const s = mark();
  assert.deepEqual(paintCell(s, 5, 0, 'ink'), s);
  assert.deepEqual(paintCell(s, -1, 0, 'ink'), s);
});

test('a variant is painted on its own rows, and keys stay shared', () => {
  const s = { ...mark(), variants: { blink: ['..', 'bb'] } };
  const t = paintCell(s, 0, 0, 'gold.light', 'blink');
  assert.deepEqual(t.variants.blink, ['a.', 'bb']);
  assert.deepEqual(t.rows, ['ab', 'b.']);
  assert.deepEqual(cellsOf(t, 'blink')[0], ['gold.light', null]);
});

test('pruning keeps the characters any variant uses', () => {
  const s = { ...mark(), rows: ['..', '..'], key: { a: 'gold.light', b: 'gold.dark', c: 'ink' }, variants: { blink: ['c.', '..'] } };
  assert.deepEqual(Object.keys(pruneKeys(s).key), ['c']);
});

test('a stamp with 32 paints in its key refuses a 33rd paint', () => {
  const key = {};
  const chars = keyChars(32);
  chars.forEach((c, i) => { key[c] = `s${i}`; });
  const s = { kind: 'stamp', at: [0, 0], rows: [chars.join('')], key };
  assert.equal(keyFor(s, 's3'), chars[3]);
  assert.equal(keyFor(s, 'another'), null);
  assert.deepEqual(paintCell(s, 0, 0, 'another'), s, 'no room: unchanged');
});

test('resizing pads with see-through cells and crops, rows and variants alike, within 1..32', () => {
  const s = { ...mark(), variants: { blink: ['..', 'bb'] } };
  const big = resizeStamp(s, 4, 3);
  assert.deepEqual(big.rows, ['ab..', 'b...', '....']);
  assert.deepEqual(big.variants.blink, ['....', 'bb..', '....']);
  const small = resizeStamp(s, 1, 1);
  assert.deepEqual(small.rows, ['a']);
  assert.deepEqual(small.variants.blink, ['.']);
  assert.deepEqual(small.key, { a: 'gold.light' }, 'b was cut off rows and variant alike');
  assert.deepEqual(resizeStamp(s, 2, 2).key, { a: 'gold.light', b: 'gold.dark' });
  assert.deepEqual(stampSize(resizeStamp(s, 99, 0)), [32, 1]);
});

test('fill paints every cell of the same paint joined to the one picked', () => {
  const s = { kind: 'stamp', at: [0, 0], rows: ['aa.', 'a..', '..a'], key: { a: 'ink' } };
  const t = fillCells(s, 0, 0, 'gold');
  const g = keyFor(t, 'gold');
  assert.deepEqual(t.rows, [`${g}${g}.`, `${g}..`, '..a']);
});

test('a new stamp is a square of one paint', () => {
  const s = newStamp({ w: 3, h: 2, paint: 'gold', on: 'coin' });
  assert.equal(s.kind, 'stamp');
  assert.deepEqual(s.rows, ['aaa', 'aaa']);
  assert.deepEqual(s.key, { a: 'gold' });
  assert.equal(s.on, 'coin');
});

test('stamp pixels are counted over the whole definition, variants and generator places included', () => {
  const def = { body: { pictures: { draw: [mark(), { ...mark(), variants: { x: ['..', '..'] } }, { gen: 'scatter', v: 1, place: { kind: 'stamp', rows: ['aaa'], key: { a: 'ink' } } }] } } };
  assert.equal(stampPixelsIn(def), 4 + 8 + 3);
});

test('stampRoom says how big a stamp may grow before the definition passes the cap', () => {
  const rows = Array.from({ length: 32 }, () => 'a'.repeat(32));
  const draw = Array.from({ length: 8 }, () => ({ kind: 'stamp', at: [0, 0], rows, key: { a: 'ink' } }));
  const def = { body: { pictures: { draw: [...draw, mark()] } } };
  assert.equal(stampPixelsIn(def), 8192 + 4);
  // the definition is already past the cap: the small stamp may not grow at all
  assert.equal(stampRoom(def, ['body', 'pictures', 'draw', 8]), 4 - 4);
  const def2 = { body: { pictures: { draw: [...draw.slice(1), mark()] } } };
  assert.equal(stampRoom(def2, ['body', 'pictures', 'draw', 7]), 8192 - 7 * 1024);
});

function keyChars(n) {
  return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.slice(0, n).split('');
}
