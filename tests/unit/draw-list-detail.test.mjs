// engine/draw-list.js, part 5: the pixel-detail primitives that are new in version 2 (docs/data-sprites.md 2.7):
// dither (a screen-aligned pattern inside a shape), bands (a gradient as stepped bands) and text (glyphs of the font).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn, ellipseIn } from '../../engine/surface.js';
import { ramp, col, INK } from '../../engine/color.js';
import { fontMetrics, drawText, textWidth } from '../../engine/pixel-font.js';
import * as D from '../../engine/draw-list.js';

const SKY = '#5b8fd6', MIST = '#dfe8f0', CLOTH = '#3a6ea5';
const palette = { sky: SKY, mist: MIST, cloth: CLOTH };
const draw = (list, opt = {}, w = 48, h = 48) => D.renderList(w, h, list, { palette, ...opt }).g;
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const area = { kind: 'rect', at: [4, 4], size: [16, 16] };
const inArea = rectIn(4, 4, 16, 16);
const on = (g, x, y) => g.get(x, y) !== 0;

// ---- dither ----------------------------------------------------------------------------------------------------

test('draw-list dither: checker at one half is every other pixel of the area by absolute (x + y) parity, flat', () => {
  const g = draw([{ kind: 'dither', area, pattern: 'checker', amount: 0.5, paint: 'mist' }]);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const want = inArea(x + 0.5, y + 0.5) && (x + y) % 2 === 0;
    assert.equal(on(g, x, y), want, `${x},${y}`);
    if (want) assert.equal(g.get(x, y), col(MIST));
  }
});

test('draw-list dither: amount 0 draws nothing, amount 1 fills the area; amount takes the share of the pattern', () => {
  assert.ok(draw([{ kind: 'dither', area, pattern: 'bayer4', amount: 0, paint: 'mist' }]).data.every((v) => v === 0));
  assert.ok(same(draw([{ kind: 'dither', area, pattern: 'bayer4', amount: 1, paint: 'mist' }]), new Surface(48, 48).rect(4, 4, 16, 16, MIST)));
  for (const [pattern, amount, per16] of [['bayer4', 0.25, 4], ['bayer4', 0.5, 8], ['bayer4', 0.75, 12], ['bayer2', 0.25, 4], ['bayer2', 0.75, 12], ['checker', 0.5, 8]]) {
    const g = draw([{ kind: 'dither', area: { kind: 'rect', at: [0, 0], size: [4, 4] }, pattern, amount, paint: 'mist' }]);
    assert.equal(g.data.filter(Boolean).length, per16, `${pattern} at ${amount}`);
  }
});

test('draw-list dither: lines-h are every other row, lines-v every other column; the default pattern is checker', () => {
  const h = draw([{ kind: 'dither', area, pattern: 'lines-h', amount: 0.5, paint: 'mist' }]);
  const v = draw([{ kind: 'dither', area, pattern: 'lines-v', amount: 0.5, paint: 'mist' }]);
  for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) { assert.equal(on(h, x, y), y % 2 === 0); assert.equal(on(v, x, y), x % 2 === 0); }
  assert.ok(same(draw([{ kind: 'dither', area, amount: 0.5, paint: 'mist' }]), draw([{ kind: 'dither', area, pattern: 'checker', amount: 0.5, paint: 'mist' }])));
});

test('draw-list dither: the pattern stays screen-aligned when the area moves or turns', () => {
  const a = draw([{ kind: 'dither', area: { kind: 'ellipse', at: [20, 20], r: [8, 6] }, amount: 0.5, paint: 'mist' }]);
  const b = draw([{ kind: 'dither', area: { kind: 'ellipse', at: [21, 20], r: [8, 6], turn: 20 }, amount: 0.5, paint: 'mist' }]);
  for (const g of [a, b]) for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (on(g, x, y)) assert.equal((x + y) % 2, 0);
});

// ---- bands ------------------------------------------------------------------------------------------------------

const box = { kind: 'rect', at: [4, 4], size: [10, 10] };
const R = ramp(SKY);

test('draw-list bands: down splits the area\'s rows into equal stepped bands, first stop on top; up is the reverse', () => {
  const g = draw([{ kind: 'bands', area: box, dir: 'down', stops: ['sky.light', 'sky.dark'] }]);
  for (let y = 4; y < 14; y++) for (let x = 4; x < 14; x++) assert.equal(g.get(x, y), col(y < 9 ? R.light : R.dark), `${x},${y}`);
  assert.equal(g.data.filter(Boolean).length, 100, 'exactly the area');
  const u = draw([{ kind: 'bands', area: box, dir: 'up', stops: ['sky.light', 'sky.dark'] }]);
  for (let y = 4; y < 14; y++) assert.equal(u.get(6, y), col(y < 9 ? R.dark : R.light));
  const three = draw([{ kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [3, 30] }, stops: ['sky.light', 'sky', 'sky.dark'] }]);
  assert.deepEqual([0, 9, 10, 19, 20, 29].map((y) => three.get(1, y)), [R.light, R.light, SKY, SKY, R.dark, R.dark].map(col), 'dir defaults to down; a slot stop is its base');
});

test('draw-list bands: out puts the first stop in the middle, in puts it at the edge', () => {
  const sq = { kind: 'rect', at: [10, 10], size: [9, 9] };
  const o = draw([{ kind: 'bands', area: sq, dir: 'out', stops: ['sky.light', 'sky', 'sky.dark'] }]);
  assert.equal(o.get(14, 14), col(R.light)); assert.equal(o.get(10, 14), col(R.dark));
  const i = draw([{ kind: 'bands', area: sq, dir: 'in', stops: ['sky.light', 'sky', 'sky.dark'] }]);
  assert.equal(i.get(14, 14), col(R.dark)); assert.equal(i.get(10, 14), col(R.light));
});

test('draw-list bands: dither edges mix the first row of each band with the band before it, checker-wise', () => {
  const g = draw([{ kind: 'bands', area: box, dir: 'down', stops: ['sky.light', 'sky.dark'], edges: 'dither' }]);
  for (let x = 4; x < 14; x++) {
    assert.equal(g.get(x, 8), col(R.light));
    assert.equal(g.get(x, 9), col((x + 9) % 2 === 0 ? R.light : R.dark), `row 9, x ${x}`);
    assert.equal(g.get(x, 10), col(R.dark));
  }
});

test('draw-list bands: the area may be any shape (a sky ellipse) and is covered exactly', () => {
  const g = draw([{ kind: 'bands', area: { kind: 'ellipse', at: [24, 24], r: [14, 10] }, stops: ['sky.light', 'sky', 'sky.dark'] }]);
  const e = ellipseIn(24, 24, 14, 10);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) assert.equal(on(g, x, y), e(x + 0.5, y + 0.5));
});

// ---- text -------------------------------------------------------------------------------------------------------

test('draw-list text: glyphs of the font at the pen point on the baseline, as pixel-font drawText draws them', () => {
  const m = fontMetrics(0.5, 'chunky');
  const want = new Surface(64, 24); drawText(want, 'HI 7', 3, 14, { metrics: m, colour: CLOTH, outline: 'none' });
  assert.ok(same(draw([{ kind: 'text', font: 'font:chunky@1', size: 0.5, text: 'HI 7', at: [3, 14], paint: 'cloth' }], {}, 64, 24), want));
  const inked = new Surface(64, 24); drawText(inked, 'Go!', 3, 14, { metrics: fontMetrics(1, 'slim'), colour: CLOTH, outline: 'ink' });
  assert.ok(same(draw([{ kind: 'text', font: 'slim', cap: 9, text: 'Go!', at: [3, 14], paint: 'cloth', outline: 'ink' }], {}, 64, 24), inked));
});

test('draw-list text: align centre and right move the pen point by the line\'s width', () => {
  const m = fontMetrics(0, 'serif'), w = textWidth('ABC', m);
  for (const [align, x0] of [['left', 30], ['centre', Math.round(30 - w / 2)], ['center', Math.round(30 - w / 2)], ['right', 30 - w]]) {
    const g = draw([{ kind: 'text', font: 'font:serif', cap: 5, text: 'ABC', at: [30, 20], align, paint: 'cloth' }], {}, 64, 24);
    assert.equal(g.bounds().x0, x0, align);
  }
});

test('draw-list text: a character the font lacks, an unknown font or more than 40 characters is refused and reported', () => {
  for (const bad of [{ text: 'a~b' }, { font: 'font:gothic' }, { text: 'A'.repeat(41) }]) {
    const out = D.renderList(64, 24, [{ kind: 'text', font: 'chunky', text: 'AB', at: [2, 10], paint: 'cloth', ...bad }], { palette });
    assert.equal(out.drawn, 0, JSON.stringify(bad));
    assert.equal(out.skipped.length, 1);
    assert.ok(out.skipped[0].why.length > 0);
  }
});

test('draw-list text: the ink outline of a text is the font\'s own, drawn from the glyphs (it does not ink other shapes)', () => {
  const g = draw([{ kind: 'rect', at: [0, 0], size: [3, 3], paint: '#ff0000' }, { kind: 'text', font: 'chunky', size: 0, text: 'I', at: [20, 20], paint: 'cloth', outline: 'ink' }]);
  assert.notEqual(g.get(3, 1), col(INK), 'the rect beside it has no ink');
});
