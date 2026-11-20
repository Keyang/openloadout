// ui.gridbox@1 (engine/gen/ui-grid.js): the dark window of the Gridline kit's interface (bundles/specs/
// kit-puzzle-gridline.md, "Interface"): a panel in the blocks, plate or tube look with an optional title tab, a down
// arrow under the tab, a dimmed look and a white flash. Pinned by the goldens harness (tests/helpers/gen-harness.mjs);
// the tests after it hold what the specification asks of the next and hold boxes.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-ui-gridbox.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { GRID_LOOKS, measureGridbox } from '../../engine/gen/ui-grid.js';
import { UI_MEASURES, measurePiece } from '../../engine/gen/ui-pieces.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const BOX = { at: [1, 1], size: [94, 62], face: 'face', frame: 'frame', accent: 'accent', shine: 'shine', spent: 'spent' };
const CASES = [
  { args: { ...BOX, tab: 'left' } },
  { args: { ...BOX, look: 'plate', tab: 'right', chevron: true, corner: 4, border: 3 } },
  { args: { ...BOX, look: 'tube', corner: 4, border: 2, tab: 'left', dim: true } },
  { args: { ...BOX, border: 1, flash: 1, fade: true }, ctx: { t: 1 / 3, loop: false, frames: 4, frame: 1 } },
  { args: { at: [-20, -12], size: [40, 24], look: 'tube', corner: 0, border: 3, face: 'face', frame: 'frame.light', accent: 'accent' } },
];

test('ui.gridbox@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('ui.gridbox', 1), { cases: CASES });
});

// ---- what a box is ---------------------------------------------------------------------------------------------------

const entry = () => registry.generator('ui.gridbox', 1);
const run = (more = {}, ctx = {}) => {
  const r = registry.runGenerator({ gen: 'ui.gridbox', v: 1, ...BOX, ...more }, { size: [96, 64], ...ctx });
  assert.ok(r.ok, r.errors.join('; '));
  return r.primitives;
};
const measure = (more = {}) => measurePiece(entry(), { ...BOX, ...more }, { size: [96, 64] });
const areas = (m) => (Array.isArray(m.textArea) ? m.textArea : [m.textArea]);

/** The last paint laid on every pixel of a 96 x 64 frame by rects, polygons made of whole-pixel rows and stamps: { "x,y": paint as text }. */
function pixels(prims) {
  const out = new Map();
  const set = (x, y, p) => out.set(`${x},${y}`, JSON.stringify(p));
  for (const p of prims) {
    if (p.kind === 'rect') { for (let j = 0; j < p.size[1]; j++) for (let i = 0; i < p.size[0]; i++) set(p.at[0] + i, p.at[1] + j, p.paint); }
    else if (p.kind === 'stamp') p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') set(p.at[0] + i, p.at[1] + j, p.key[ch]); }));
    else if (p.kind === 'poly') {
      // a staircase polygon whose corners lie on whole pixels: a pixel is inside when its centre is (even-odd rule)
      const ys = p.points.map((q) => q[1]), xs = p.points.map((q) => q[0]);
      for (let y = Math.min(...ys); y < Math.max(...ys); y++) for (let x = Math.min(...xs); x < Math.max(...xs); x++) {
        let inside = false;
        for (let i = 0, j = p.points.length - 1; i < p.points.length; j = i++) {
          const [ax, ay] = p.points[i], [bx, by] = p.points[j];
          if ((ay > y + 0.5) !== (by > y + 0.5) && x + 0.5 < ((bx - ax) * (y + 0.5 - ay)) / (by - ay) + ax) inside = !inside;
        }
        if (inside) set(x, y, p.paint);
      }
    } else assert.fail(`an unexpected primitive: ${p.kind}`);
  }
  return out;
}

test('the looks are the specification\'s, and the piece has a measure', () => {
  assert.deepEqual([...GRID_LOOKS], ['blocks', 'plate', 'tube']);
  assert.equal(UI_MEASURES['ui.gridbox@1'], measureGridbox);
  assert.equal(entry().family, 'ui');
});

test('the piece area holds a four-cell piece (66 x 34 or more) at every look, border, corner and tab', () => {
  for (const look of GRID_LOOKS) for (const border of [1, 2, 3]) for (const corner of [0, 2, 4]) for (const tab of ['none', 'left', 'right']) {
    const [piece, title] = areas(measure({ look, border, corner, tab }));
    assert.ok(piece.w >= 66 && piece.h >= 34, `${look} border ${border} corner ${corner} tab ${tab}: the piece area is ${piece.w} x ${piece.h}`);
    assert.equal(!!title, tab !== 'none', `${look} tab ${tab}: a title area only with a tab`);
    if (title) assert.ok(title.w >= 30 && title.h >= 7, `${look} border ${border} corner ${corner}: the title strip is ${title.w} x ${title.h}`);
  }
});

test('every text area holds only the face colour, in every look and state', () => {
  for (const look of GRID_LOOKS) for (const border of [1, 2, 3]) for (const corner of [0, 4]) for (const more of [{ tab: 'left' }, { tab: 'right', chevron: true }, { tab: 'none' }, { tab: 'left', dim: true }, { tab: 'left', flash: 1 }]) {
    const args = { look, border, corner, ...more };
    const px = pixels(run(args));
    for (const r of areas(measure(args))) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        assert.equal(px.get(`${x},${y}`), '"face"', `${JSON.stringify(args)}: (${x},${y}) of a text area is not the face`);
      }
    }
  }
});

test('nothing is drawn outside the rectangle, and its edge is ink', () => {
  for (const look of GRID_LOOKS) for (const tab of ['none', 'left', 'right']) {
    const px = pixels(run({ look, tab, corner: 0 }));
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 1 && y >= 1 && x <= 94 && y <= 62, `${look} ${tab}: (${k}) is outside`); }
    assert.equal(px.get('48,62'), '"ink"', `${look} ${tab}: the bottom line is ink`);
    assert.equal(px.get('1,40'), '"ink"', `${look} ${tab}: the left line is ink`);
  }
});

test('the blocks look has a block.cell at each corner of the body in the accent; the other looks have none', () => {
  const stamps6 = (prims) => prims.filter((p) => p.kind === 'stamp' && p.rows.length === 6 && p.rows[0].length === 6);
  const cells = stamps6(run({ tab: 'left' }));
  assert.deepEqual(cells.map((p) => p.at).sort((a, b) => a[1] - b[1] || a[0] - b[0]), [[1, 13], [89, 13], [1, 57], [89, 57]]);
  const one = registry.runGenerator({ gen: 'block.cell', v: 1, at: [1, 13], size: 6, style: 'bevel', edge: 1, paint: 'accent' }).primitives;
  assert.deepEqual(JSON.parse(JSON.stringify(cells.find((p) => p.at[0] === 1 && p.at[1] === 13))), JSON.parse(JSON.stringify(one[0])), 'the corner block is block.cell@1, not a second block face');
  assert.equal(stamps6(run({ look: 'plate', tab: 'left' })).length, 0);
  assert.equal(stamps6(run({ look: 'tube', tab: 'left' })).length, 0);
});

test('dim darkens the frame and greys the blocks; a flash fades over a clip that does not loop', () => {
  const text = (prims) => JSON.stringify(prims);
  const dim = text(run({ dim: true }));
  assert.ok(dim.includes('"spent') && !dim.includes('"accent'), 'the blocks are the spent colour');
  assert.ok(!/"paint":"frame"/.test(dim), 'no band in the plain frame colour');
  const at = (frame) => run({ flash: 1, fade: true }, { t: frame / 3, loop: false, frames: 4, frame });
  assert.notDeepEqual(at(0), run(), 'frame 0 is lit');
  assert.ok(text(at(0)).includes('"amount":1'), 'frame 0 is white');
  assert.ok(text(at(1)).includes('"amount":0.6667') || /"amount":0\.66/.test(text(at(1))), 'frame 1 is two thirds');
  assert.deepEqual(at(3), run(), 'the last frame is the box at rest');
});

test('the slice keeps the tab: its top reaches down to the piece area and its side out past the tab', () => {
  const left = measure({ tab: 'left' }), right = measure({ tab: 'right' }), none = measure({ tab: 'none' });
  const [piece] = areas(left);
  assert.ok(left.slice.top >= piece.y && left.slice.top <= piece.y + 1);
  assert.equal(left.slice.left, 1 + 6 + 44 + 1);
  assert.equal(right.slice.right, 1 + 6 + 44 + 1);
  assert.ok(left.slice.left + left.slice.right < 96 && left.slice.top + left.slice.bottom < 64);
  assert.ok(none.slice.left >= 8 && none.slice.left <= 10 && none.slice.top === none.slice.left);
  const off = measurePiece(entry(), { ...BOX, at: [10, 6], size: [70, 50] }, { size: [96, 64] });
  assert.deepEqual(off.slice.rect, { x: 10, y: 6, w: 70, h: 50 }, 'a box that does not fill the frame is measured from its own rectangle');
});

test('the down arrow is a 5 x 3 chevron on an ink notch in the top band, under the middle of the tab', () => {
  const px = pixels(run({ tab: 'right', chevron: true }));
  const cx = 1 + 94 - 6 - 44 + 22, y0 = 13;
  for (const [dy, half] of [[0, 2], [1, 1], [2, 0]]) {
    for (let dx = -3; dx <= 3; dx++) {
      const got = px.get(`${cx + dx},${y0 + dy}`);
      if (Math.abs(dx) <= half) assert.equal(got, '"frame.light"', `(${dx},${dy}) is the arrow`); else assert.equal(got, '"ink"', `(${dx},${dy}) is the notch`);
    }
  }
  assert.deepEqual(pixels(run({ tab: 'none', chevron: true })), pixels(run({ tab: 'none' })), 'no arrow without a tab');
});
