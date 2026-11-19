// engine/draw-list.js, part 7: deterministic, never throws on bad data, caps every count (docs/data-sprites.md 2.7 caps
// and 3.4): a primitive it cannot draw is left out and reported, the rest still draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../engine/draw-list.js';

const palette = { skin: '#4f9d57', cloth: '#3a6ea5' };
const sample = [
  { kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [64, 30] }, stops: ['cloth.light', 'cloth', 'cloth.dark'], edges: 'dither' },
  { kind: 'ellipse', at: [30, 30], r: [12, 9], turn: 17, paint: 'skin', group: 'b' },
  { kind: 'capsule', from: [22, 36], to: [30, 50], r: [4, 3], paint: 'skin', group: 'b' },
  { kind: 'dither', area: { kind: 'ellipse', at: [30, 30], r: [8, 6] }, pattern: 'bayer4', amount: 0.3, paint: 'skin.light' },
  { kind: 'stamp', at: [34, 26], rows: ['ab', 'bb'], key: { a: 'ink', b: 'skin.dark' }, z: 5 },
  { kind: 'arc', at: [30, 30], r: 16, a0: 100, a1: 260, thick: 2, paint: 'cloth.light' },
  { kind: 'text', font: 'font:chunky@1', size: 0, text: 'OK', at: [4, 60], paint: 'cloth.light' },
  { kind: 'outline' },
  { kind: 'ring', at: [50, 12], r: 5, thick: 2, paint: 'skin.light', glow: true },
];

test('draw-list: the same list draws the same pixels every time, with no randomness and no clock', () => {
  const a = D.renderList(64, 64, sample, { palette }).g;
  const random = Math.random, now = Date.now, perf = performance.now;
  Math.random = () => { throw new Error('Math.random used'); };
  Date.now = () => { throw new Error('Date.now used'); };
  try {
    const b = D.renderList(64, 64, sample, { palette }).g;
    assert.ok(a.data.every((v, i) => v === b.data[i]));
  } finally { Math.random = random; Date.now = now; performance.now = perf; }
  assert.ok(a.data.some((v) => v), 'it drew');
});

test('draw-list: the list is not changed by drawing it', () => {
  const copy = JSON.parse(JSON.stringify(sample));
  D.renderList(64, 64, sample, { palette });
  assert.deepEqual(sample, copy);
});

test('draw-list: generators and pieces are not its job: `gen` and `use` are reported as not expanded', () => {
  const out = D.renderList(32, 32, [{ gen: 'glint', v: 1 }, { kind: 'use', use: 'part:hair', v: 1 }, { kind: 'rect', at: [1, 1], size: [4, 4], paint: 'skin' }], { palette });
  assert.equal(out.drawn, 1);
  assert.equal(out.skipped.length, 2);
  for (const s of out.skipped) assert.match(s.why, /expand/);
  assert.deepEqual(out.skipped.map((s) => s.index), [0, 1]);
});

test('draw-list: bad primitives are skipped with a reason, never thrown, and the rest draws', () => {
  const bad = [
    null, 7, 'rect', [], {}, { kind: 'blob' },
    { kind: 'rect', at: [1, 1], size: [4, 4], paint: 'nope' },
    { kind: 'rect', at: [1, 1], size: [4, 4], paint: '#12345' },
    { kind: 'rect', at: [1, 1], size: [4, 4], paint: { rule: 'tone', of: 'skin', by: -0.5 } },
    { kind: 'rect', at: ['a', 1], size: [4, 4], paint: 'skin' },
    { kind: 'ellipse', at: [5, 5], r: [NaN, 2], paint: 'skin' },
    { kind: 'poly', points: [[0, 0], [1, 1]], paint: 'skin' },
    { kind: 'stamp', at: [1, 1], rows: 'ab', key: { a: 'skin' } },
    { kind: 'stamp', at: [1, 1], rows: ['ab'], key: { a: 'skin' } },
    { kind: 'dither', area: { kind: 'stamp' }, paint: 'skin' },
    { kind: 'dither', area: { kind: 'rect', at: [0, 0], size: [3, 3] }, pattern: 'plaid', paint: 'skin' },
    { kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [3, 3] }, stops: [] },
    { kind: 'cut' },
    { kind: 'outline', paint: 'nope' },
    { kind: 'rect', at: [1, 1], size: [4, 4], paint: 'skin', __proto__: { evil: true } },
  ];
  let out;
  assert.doesNotThrow(() => { out = D.renderList(32, 32, [...bad, { kind: 'rect', at: [10, 10], size: [4, 4], paint: 'cloth' }], { palette }); });
  assert.equal(out.drawn, 2, 'the last rect and the one with an inherited field');
  assert.equal(out.skipped.length, bad.length - 1);
  for (const s of out.skipped) { assert.equal(typeof s.why, 'string'); assert.ok(s.why.length > 3); assert.equal(typeof s.index, 'number'); }
  assert.notEqual(out.g.get(11, 11), 0);
});

test('draw-list: at most 4,000 primitives a frame; frames are capped at 640 x 360', () => {
  const many = Array.from({ length: 4005 }, (_, i) => ({ kind: 'dot', at: [i % 60, Math.floor(i / 60) % 60], paint: 'skin' }));
  const out = D.renderList(64, 64, many, { palette });
  assert.equal(D.DRAW_LIST_LIMITS.primitives, 4000);
  assert.equal(out.drawn, 4000);
  assert.equal(out.skipped.length, 5);
  const big = D.renderList(5000, 5000, [], { palette });
  assert.deepEqual([big.g.w, big.g.h], [640, 360]);
});

test('draw-list: a non-finite or missing palette leaves the slot unknown (skipped), not a crash', () => {
  const out = D.renderList(16, 16, [{ kind: 'rect', at: [1, 1], size: [4, 4], paint: 'skin' }]);
  assert.equal(out.drawn, 0);
  assert.match(out.skipped[0].why, /skin/);
});

test('draw-list: paintOf resolves paint refs the way the renderer does', () => {
  assert.equal(D.paintOf('#abcdef', {}), '#abcdef');
  assert.equal(D.paintOf('ink', {}), '#231b33');
  assert.equal(D.paintOf('clear', {}), D.CLEAR);
  assert.equal(D.paintOf('skin', palette).base, '#4f9d57');
  assert.equal(typeof D.paintOf('skin.dark', palette), 'string');
  assert.equal(D.paintOf('ghost', palette), null);
  assert.equal(D.paintOf('skin.shiny', palette), null);
});
