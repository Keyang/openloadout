// engine/draw-list.js, part 2: stamps (docs/data-sprites.md 2.7): a small block of pixels placed at a rounded point,
// moved, swapped or mirrored, NEVER turned; '.' and ' ' are see-through; each key letter names a paint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { ramp, col } from '../../engine/color.js';
import * as D from '../../engine/draw-list.js';

const SKIN = '#e0a878', EYE = '#231b33', METAL = '#b8c4cc';
const palette = { skin: SKIN, eye: { hex: EYE, detail: true }, metal: METAL };
const draw = (list, opt = {}) => D.renderList(32, 32, list, { palette, ...opt }).g;
/** The drawn pixels as rows of characters: '.' see-through, else the letter `legend` gives the packed colour. */
function picture(g, legend) {
  const byCol = new Map(Object.entries(legend).map(([ch, hex]) => [col(hex), ch]));
  const rows = [];
  for (let y = 0; y < g.h; y++) { let r = ''; for (let x = 0; x < g.w; x++) { const v = g.data[y * g.w + x]; r += v ? byCol.get(v) ?? '?' : '.'; } rows.push(r); }
  return rows;
}
/** The smallest box round the drawn pixels, as rows (see picture), and where it starts. */
function crop(g, legend) {
  const b = g.bounds();
  if (!b) return { x: null, y: null, rows: [] };
  const rows = picture(g, legend).slice(b.y0, b.y1 + 1).map((r) => r.slice(b.x0, b.x1 + 1));
  return { x: b.x0, y: b.y0, rows };
}
const legend = { a: EYE, b: ramp(SKIN).dark, m: ramp(METAL).light, s: SKIN };
const eye = { kind: 'stamp', at: [10, 12], rows: ['ab', 'b.', '.a'], key: { a: 'eye', b: 'skin.dark' } };

test('draw-list stamp: rows and key place exact pixels, top-left anchor at the point, see-through cells left alone', () => {
  const c = crop(draw([eye]), legend);
  assert.deepEqual([c.x, c.y], [10, 12]);
  assert.deepEqual(c.rows, ['ab', 'b.', '.a']);
  const g = draw([{ kind: 'rect', at: [0, 0], size: [32, 32], paint: '#336699' }, eye]);
  assert.equal(g.get(11, 13), col('#336699'), 'a "." cell keeps what was under it');
});

test('draw-list stamp: a slot letter paints the slot base, flat; a tone ref its tone; "clear" makes a hole', () => {
  const g = draw([{ kind: 'stamp', at: [4, 4], rows: ['ss', 'mm'], key: { s: 'skin', m: 'metal.light' } }]);
  assert.deepEqual(crop(g, legend).rows, ['ss', 'mm']);
  const holed = draw([{ kind: 'rect', at: [0, 0], size: [8, 8], paint: '#336699' }, { kind: 'stamp', at: [2, 2], rows: ['x'], key: { x: 'clear' } }]);
  assert.equal(holed.get(2, 2), 0);
  assert.equal(holed.get(3, 2), col('#336699'));
});

test('draw-list stamp: anchors (tl, tc, tr, cl, c, cr, bl, bc, br) put that point of the block on the rounded point', () => {
  const rows = ['aaaa', 'aaaa', 'aaaa'];      // 4 wide, 3 tall
  const want = { tl: [10, 10], tc: [8, 10], tr: [6, 10], cl: [10, 9], c: [8, 9], cr: [6, 9], bl: [10, 7], bc: [8, 7], br: [6, 7] };
  for (const [anchor, xy] of Object.entries(want)) {
    const c = crop(draw([{ kind: 'stamp', at: [10, 10], anchor, rows, key: { a: 'eye' } }]), legend);
    assert.deepEqual([c.x, c.y], xy, anchor);
  }
  for (const at of [[10.4, 10.4], [9.6, 9.5]]) {
    const c = crop(draw([{ kind: 'stamp', at, rows: ['a'], key: { a: 'eye' } }]), legend);
    assert.deepEqual([c.x, c.y], [Math.round(at[0]), Math.round(at[1])], 'a point between pixels is rounded, never sampled');
  }
});

test('draw-list stamp: mirror flips the block about its anchor point (a face looking the other way)', () => {
  const c = crop(draw([{ ...eye, mirror: 'x' }]), legend);
  assert.deepEqual(c.rows, ['ba', '.b', 'a.']);
  assert.deepEqual([c.x, c.y], [8, 12], 'a top-left anchor becomes the top-right corner: the block lies left of the point');
  const m = crop(draw([{ ...eye, mirror: true }]), legend);
  assert.deepEqual(m.rows, ['ba', '.b', 'a.'], 'true is x');
});

test('draw-list stamp: a variant swaps the rows (a blink), the same size or not', () => {
  const blink = { ...eye, variants: { blink: ['..', 'bb', '..'], wide: ['aaa'] } };
  assert.deepEqual(crop(draw([{ ...blink, variant: 'blink' }]), legend).rows, ['bb']);
  assert.deepEqual(crop(draw([{ ...blink, variant: 'wide' }]), legend).rows, ['aaa']);
  assert.deepEqual(crop(draw([{ ...blink, variant: 'nope' }]), legend).rows, ['ab', 'b.', '.a'], 'an unknown variant keeps the rows');
});

test('draw-list stamp: placed on a turning node it is moved, never turned (every angle gives the same block)', () => {
  const block = ['aab', 'b.a'];
  for (let deg = 0; deg < 360; deg += 15) {
    const frame = D.nodeFrame({ at: [16, 16], turn: deg });
    const placed = D.placeOn({ kind: 'stamp', at: [6, 0], rows: block, key: { a: 'eye', b: 'skin.dark' } }, frame);
    const c = crop(draw([placed]), legend);
    assert.deepEqual(c.rows, block, `turned ${deg}`);
    const p = [16 + 6 * Math.cos(deg * Math.PI / 180), 16 + 6 * Math.sin(deg * Math.PI / 180)];
    assert.ok(Math.abs(c.x - p[0]) <= 0.5 + 1e-9 && Math.abs(c.y - p[1]) <= 0.5 + 1e-9, `its corner follows the node at ${deg}`);
  }
  for (let a = 0; a < 360; a += 30) {
    const placed = D.placeOn({ kind: 'stamp', at: [5, 1], anchor: 'c', rows: block, key: { a: 'eye', b: 'skin.dark' } }, D.boneFrame([16, 16], a * Math.PI / 180));
    assert.deepEqual(crop(draw([placed]), legend).rows, block, `on a bone at ${a}`);
  }
});

test('draw-list stamp: a node frame that is mirrored mirrors the stamp; a rect on a turning node only moves', () => {
  const placed = D.placeOn({ ...eye, at: [2, 0] }, D.nodeFrame({ at: [16, 16], mirror: true }));
  assert.deepEqual(crop(draw([placed]), legend).rows, ['ba', '.b', 'a.']);
  const r = D.placeOn({ kind: 'rect', at: [4, 0], size: [3, 2], paint: 'eye' }, D.nodeFrame({ at: [16, 16], turn: 40 }));
  const c = crop(draw([r]), legend);
  assert.deepEqual(c.rows, ['aaa', 'aaa'], 'a rect keeps its size and square corners');
});

test('draw-list stamp: blocks over 32 x 32 and stamp pixels over the cap are refused, and the refusal is reported', () => {
  const big = { kind: 'stamp', at: [0, 0], rows: Array.from({ length: 33 }, () => 'a'), key: { a: 'eye' } };
  const out = D.renderList(64, 64, [big], { palette });
  assert.equal(out.drawn, 0);
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0].why, /32/);
  const square = { kind: 'stamp', at: [0, 0], rows: Array.from({ length: 32 }, () => 'a'.repeat(32)), key: { a: 'eye' } };   // 1,024 pixels
  const many = D.renderList(64, 64, Array.from({ length: 9 }, () => square), { palette });
  assert.equal(D.DRAW_LIST_LIMITS.stampPixels, 8192);
  assert.equal(many.drawn, 8, 'eight blocks of 1,024 fit the 8,192 cap, the ninth does not');
  assert.match(many.skipped[0].why, /8,?192|stamp pixels/);
});
