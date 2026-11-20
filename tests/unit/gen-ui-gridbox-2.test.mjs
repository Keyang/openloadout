// ui.gridbox@2 (engine/gen/ui-grid.js): the Gridline kit's dark window as ui.gridbox@1 draws it, with the Corner control
// passed straight through (0..1: a plate cut of round(corner x 4) px, a tube rounded by the candy cut table), the tube
// drawn as the neon piece was (ink, a gap of the face, the tube and its light core; a tab with its two top corners
// round), a dim box whose whole tube is the frame's dark tone, and a flash that is flat light in the 0.66 and 0.33 steps.
// Pinned by the goldens harness (tests/helpers/gen-harness.mjs); the tests after it hold what the next and hold boxes need.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-ui-gridbox-2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { GRID_LOOKS, GRID_TUBE_CUTS, measureGridbox2 } from '../../engine/gen/ui-grid.js';
import { UI_MEASURES, measurePiece } from '../../engine/gen/ui-pieces.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const BOX = { at: [1, 1], size: [94, 62], face: 'face', frame: 'frame', accent: 'accent', shine: 'shine', spent: 'spent' };
const CASES = [
  { args: { ...BOX, tab: 'left' } },
  { args: { ...BOX, look: 'plate', tab: 'right', chevron: true, corner: 1, border: 3 } },
  { args: { ...BOX, look: 'tube', corner: 0.5, border: 2, tab: 'left' } },
  { args: { ...BOX, look: 'tube', corner: 1, border: 3, tab: 'right', chevron: true, dim: true } },
  { args: { ...BOX, border: 2, flash: 1, fade: true }, ctx: { t: 1 / 3, loop: false, frames: 4, frame: 1 } },
  { args: { at: [-20, -12], size: [40, 24], look: 'tube', corner: 0, border: 3, face: 'face', frame: 'frame.light', accent: 'accent' } },
];

test('ui.gridbox@2 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('ui.gridbox', 2), { cases: CASES });
});

// ---- what a box is ---------------------------------------------------------------------------------------------------

const entry = () => registry.generator('ui.gridbox', 2);
const run = (more = {}, ctx = {}) => {
  const r = registry.runGenerator({ gen: 'ui.gridbox', v: 2, ...BOX, ...more }, { size: [96, 64], ...ctx });
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
/** Rows of a pixel map from (x0, y0), w x h, one letter a paint (given in `names`; `.` nothing, `?` any other). */
const picture = (px, x0, y0, w, h, names) => Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => {
  const p = px.get(`${x0 + i},${y0 + j}`);
  return p === undefined ? '.' : names[p] ?? '?';
}).join(''));
const NAMES = { '"ink"': 'k', '"face"': 'f', '"frame"': 'b', '"frame.light"': 'c', '"frame.dark"': 'd' };

test('the looks are the same three, and the piece has a measure', () => {
  assert.equal(UI_MEASURES['ui.gridbox@2'], measureGridbox2);
  assert.equal(entry().family, 'ui');
  assert.deepEqual(GRID_TUBE_CUTS.map((c) => [...c]), [[], [1], [2, 1], [4, 2, 1], [5, 3, 2, 1], [6, 4, 2, 1]]);
});

test('the piece area holds a four-cell piece (66 x 34 or more) at every look, border, corner and tab', () => {
  for (const look of GRID_LOOKS) for (const border of [1, 2, 3]) for (const corner of [0, 0.25, 0.5, 0.75, 1]) for (const tab of ['none', 'left', 'right']) {
    const [piece, title] = areas(measure({ look, border, corner, tab }));
    assert.ok(piece.w >= 66 && piece.h >= 34, `${look} border ${border} corner ${corner} tab ${tab}: the piece area is ${piece.w} x ${piece.h}`);
    assert.equal(!!title, tab !== 'none', `${look} tab ${tab}: a title area only with a tab`);
    if (title) assert.ok(title.w >= 30 && title.h >= 7, `${look} border ${border} corner ${corner}: the title strip is ${title.w} x ${title.h}`);
  }
});

test('every text area holds only the face colour, in every look and state', () => {
  for (const look of GRID_LOOKS) for (const border of [1, 2, 3]) for (const corner of [0, 0.5, 1]) for (const more of [{ tab: 'left' }, { tab: 'right', chevron: true }, { tab: 'none' }, { tab: 'left', dim: true }, { tab: 'left', flash: 1 }]) {
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
  for (const look of GRID_LOOKS) for (const tab of ['none', 'left', 'right']) for (const corner of [0, 1]) {
    const px = pixels(run({ look, tab, corner }));
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 1 && y >= 1 && x <= 94 && y <= 62, `${look} ${tab}: (${k}) is outside`); }
    assert.equal(px.get('48,62'), '"ink"', `${look} ${tab}: the bottom line is ink`);
    assert.equal(px.get('1,40'), '"ink"', `${look} ${tab}: the left line is ink`);
  }
});

test('a plate at the middle of Corner is cut 2 px, at Round 4 px, at Square not at all (techPanel cut: corner)', () => {
  for (const [corner, cut] of [[0, 0], [0.5, 2], [1, 4]]) {
    const px = pixels(run({ look: 'plate', corner, tab: 'none' }));
    for (let j = 0; j <= 4; j++) {
      const first = [...Array(12).keys()].find((i) => px.has(`${1 + i},${1 + j}`));
      assert.equal(first, Math.max(0, cut - j), `corner ${corner}: row ${j} starts ${first} px in`);
    }
  }
});

test('a tube is ink, a gap of the face, the tube and its light core, round by the candy cut table', () => {
  // the default: corner 0.5 cuts 4, 2 and 1 px from the first three rows; border 2 (and 1) is a 2 px tube
  const want = ['....kkkkkkkk', '..kkffffffff', '.kffbbbbbbbb', 'kfbbcccccccc', 'kfbcffffffff', 'kfbcffffffff'];
  for (const border of [1, 2]) assert.deepEqual(picture(pixels(run({ look: 'tube', corner: 0.5, border, tab: 'none' })), 1, 1, 12, 6, NAMES), want, `border ${border}`);
  // Round: 6, 4, 2 and 1 px; Thick: a third pixel of the tube inside the core
  assert.deepEqual(picture(pixels(run({ look: 'tube', corner: 1, border: 3, tab: 'none' })), 1, 1, 12, 7, NAMES),
    ['......kkkkkk', '....kkffffff', '..kkffbbbbbb', '.kffbbcccccc', 'kfbbccbbbbbb', 'kfbcbbffffff', 'kfbcbfffffff']);
  // Square: plain rings
  assert.deepEqual(picture(pixels(run({ look: 'tube', corner: 0, border: 2, tab: 'none' })), 1, 1, 7, 6, NAMES),
    ['kkkkkkk', 'kffffff', 'kfbbbbb', 'kfbcccc', 'kfbcfff', 'kfbcfff']);
});

test('a tube\'s tab is a whole tube with its two top corners round, whatever the border', () => {
  for (const border of [1, 2, 3]) {
    const px = pixels(run({ look: 'tube', corner: 0.5, border, tab: 'left' }));
    assert.deepEqual(picture(px, 7, 1, 10, 6, NAMES), ['....kkkkkk', '..kkffffff', '.kffbbbbbb', 'kfbbcccccc', 'kfbcffffff', 'kfbcffffff'], `border ${border}: the tab's top left`);
    assert.deepEqual(picture(px, 41, 1, 10, 6, NAMES), ['kkkkkk....', 'ffffffkk..', 'bbbbbbffk.', 'ccccccbbfk', 'ffffffcbfk', 'ffffffcbfk'], `border ${border}: the tab's top right`);
    // the body is drawn over its lower rows, across its whole width
    assert.deepEqual(picture(px, 7, 13, 44, 1, NAMES), ['k'.repeat(44)]);
  }
});

test('dim: the whole tube (edge, core and tab) is the frame\'s dark tone; a plate and the blocks keep their rings in the dark tone\'s shades', () => {
  for (const border of [1, 2, 3]) for (const corner of [0, 0.5, 1]) {
    const px = pixels(run({ look: 'tube', dim: true, tab: 'left', border, corner }));
    const seen = new Set(px.values());
    assert.deepEqual([...seen].sort(), ['"face"', '"frame.dark"', '"ink"'], `border ${border} corner ${corner}`);
  }
  assert.deepEqual(picture(pixels(run({ look: 'tube', dim: true, tab: 'left' })), 7, 6, 6, 2, NAMES), ['kfddff', 'kfddff']);
  const text = (prims) => JSON.stringify(prims);
  for (const look of ['blocks', 'plate']) assert.ok(!/"paint":"frame"/.test(text(run({ look, dim: true }))), `${look}: no band in the plain frame colour`);
  const dim = text(run({ dim: true }));
  assert.ok(dim.includes('"spent') && !dim.includes('"accent'), 'the blocks are the spent colour');
});

test('a flash fades in the steps 1, 0.66, 0.33, 0 over four frames, and a flashing frame is flat light', () => {
  const text = (prims) => JSON.stringify(prims);
  const at = (frame, more = {}) => run({ flash: 1, fade: true, tab: 'left', ...more }, { t: frame / 3, loop: false, frames: 4, frame });
  for (const look of GRID_LOOKS) {
    assert.ok(text(at(0, { look })).includes('"amount":1'), `${look}: frame 0 is white`);
    assert.ok(text(at(1, { look })).includes('"amount":0.66') && !text(at(1, { look })).includes('"amount":0.666'), `${look}: frame 1 is 0.66`);
    assert.ok(text(at(2, { look })).includes('"amount":0.33') && !text(at(2, { look })).includes('"amount":0.333'), `${look}: frame 2 is 0.33`);
    assert.deepEqual(at(3, { look }), run({ tab: 'left', look }), `${look}: the last frame is the box at rest`);
  }
  // the blocks look: no shade band on a flashing frame and plain squares for its blocks, so a flash adds two colours a step
  for (const frame of [0, 1, 2]) {
    const prims = at(frame);
    assert.ok(prims.every((p) => !p.shade && !p.light), `frame ${frame}: nothing shaded`);
    assert.equal(prims.filter((p) => p.kind === 'stamp').length, 0, `frame ${frame}: no bevelled cell`);
    const paints = new Set(prims.map((p) => JSON.stringify(p.paint)));
    assert.ok(paints.size <= 5, `frame ${frame}: ${paints.size} paints (ink, face, its dark line, the lit frame, the lit blocks)`);
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

test('the blocks and plate looks at rest are ui.gridbox@1\'s, pixel for pixel', () => {
  const v1 = (more) => { const r = registry.runGenerator({ gen: 'ui.gridbox', v: 1, ...BOX, ...more }, { size: [96, 64] }); assert.ok(r.ok, r.errors.join('; ')); return r.primitives; };
  for (const look of ['blocks', 'plate']) for (const border of [1, 2, 3]) for (const [corner, k] of [[0, 0], [0.5, 2], [1, 4]]) for (const more of [{ tab: 'left' }, { tab: 'right', chevron: true }, { tab: 'none' }, { tab: 'left', dim: true }]) {
    assert.deepEqual(run({ look, border, corner, ...more }), v1({ look, border, corner: k, ...more }), `${look} border ${border} corner ${corner} ${JSON.stringify(more)}`);
  }
});

test('the slice keeps the tab: its top reaches down to the piece area and its side out past the tab', () => {
  for (const look of GRID_LOOKS) {
    const left = measure({ look, tab: 'left' }), right = measure({ look, tab: 'right' }), none = measure({ look, tab: 'none' });
    const [piece] = areas(left);
    assert.ok(left.slice.top >= piece.y && left.slice.top <= piece.y + 4, `${look}: top ${left.slice.top}, piece ${piece.y}`);   // a plate's slice is the 8 px its cut corners need
    assert.equal(left.slice.left, 1 + 6 + 44 + 1);
    assert.equal(right.slice.right, 1 + 6 + 44 + 1);
    assert.ok(left.slice.left + left.slice.right < 96 && left.slice.top + left.slice.bottom < 64);
    assert.ok(none.slice.left >= 8 && none.slice.left <= 10 && none.slice.top === none.slice.left, `${look}: ${JSON.stringify(none.slice)}`);
  }
  // a tube's slice clears its roundest corner (6 px and the ink)
  assert.ok(measure({ look: 'tube', corner: 1, tab: 'none' }).slice.left >= 8);
  const off = measurePiece(entry(), { ...BOX, at: [10, 6], size: [70, 50] }, { size: [96, 64] });
  assert.deepEqual(off.slice.rect, { x: 10, y: 6, w: 70, h: 50 }, 'a box that does not fill the frame is measured from its own rectangle');
});

test('the down arrow is a 5 x 3 chevron on an ink notch in the top band, under the middle of the tab, in every look', () => {
  const cx = 1 + 94 - 6 - 44 + 22;
  for (const look of GRID_LOOKS) {
    const px = pixels(run({ look, tab: 'right', chevron: true }));
    const y0 = [13, 14].find((y) => px.get(`${cx - 2},${y}`) === '"frame.light"');
    assert.ok(y0 !== undefined, `${look}: an arrow under the tab`);
    for (const [dy, half] of [[0, 2], [1, 1], [2, 0]]) for (let dx = -3; dx <= 3; dx++) {
      const got = px.get(`${cx + dx},${y0 + dy}`);
      if (Math.abs(dx) <= half) assert.equal(got, '"frame.light"', `${look}: (${dx},${dy}) is the arrow`); else assert.equal(got, '"ink"', `${look}: (${dx},${dy}) is the notch`);
    }
    assert.deepEqual(pixels(run({ look, tab: 'none', chevron: true })), pixels(run({ look, tab: 'none' })), 'no arrow without a tab');
  }
});
