// The interface piece generators of build item B13 (docs/data-sprites.md 2.5b, 3.3 family "ui", section 9 row B13),
// ported from engine/ui.js, engine/ui-wood.js and engine/ui-skins.js into engine/gen/ui-pieces.js. Each returns
// primitives (never a surface) and has a measure (UI_MEASURES): the slice and text area the panel layout writes to the
// sheet (Contract 8). Held to here:
//   - every piece is registered in the site registry, family "ui", and passes the goldens harness (pinned output at
//     three or more argument sets, determinism, argument fuzz, cost, loop closure)
//   - the measures give exactly what the code helpers give: panel9's inner (every look, border, corner, shadow), the
//     wood button's text area and slice in every state, the bar opening, the knob's rect, the highlight's inner
//   - the shapes are the code helpers' shapes: a round rect as rows is roundRectIn, a cut rect cutRectIn, a pill pillIn
//   - a state moves a button (lip, lift); hover lightens it
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-ui-pieces.test.mjs (writes only files that do not exist).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { UI_MEASURES, measurePiece, UI_PIECES } from '../../engine/gen/ui-pieces.js';
import { roundRows, cutRows, rowsArea, UI_STYLES, UI_STATES } from '../../engine/gen/ui-shapes.js';
import { panel9, roundRectIn, cutRectIn, highlight, barOpening, PANEL_STYLES } from '../../engine/ui.js';
import { Surface } from '../../engine/surface.js';
import { drawList } from '../../engine/draw-list.js';
import { paintHex } from '../../engine/resolve.js';

import { oldReplay } from '../helpers/old-replay.mjs';
const OLD = oldReplay('gen-ui-pieces');   // what engine/ui-wood.js and engine/ui-skins.js (deleted by R3) drew and answered, recorded in the order of the calls (tests/helpers/old-replay.mjs)
const PAINTS = { face: 'face', frame: 'frame', accent: 'accent' };
const CASES = {
  'ui.panel@1': [
    { args: { at: [1, 1], size: [94, 46], ...PAINTS } },
    { args: { at: [1, 1], size: [94, 46], look: 'ornate', corner: 4, border: 3, shadow: true, ...PAINTS } },
    { args: { at: [20, 14], size: [56, 20], look: 'scroll', corner: 1, border: 2, ...PAINTS } },
    { args: { at: [1, 1], size: [94, 46], row: true, corner: 2, border: 1, sunken: false, ...PAINTS } },
  ],
  'ui.button@1': [
    { args: { at: [1, 1], size: [94, 30], face: 'face', frame: 'frame' } },
    { args: { at: [1, 1], size: [94, 30], bevel: 'wood', texture: 'grain', grain: 0.8, nails: true, corner: 2, border: 2, face: 'face', frame: 'frame', nail: 'nail', shine: 'shine' } },
    { args: { at: [1, 1], size: [94, 30], bevel: 'wood', cut: 'cut', sunken: true, texture: 'chisel', grain: 1, state: 'pressed', lip: 0, face: 'face', frame: 'frame', nail: 'nail', shine: 'shine' } },
    { args: { at: [1, 1], size: [94, 30], bevel: 'wood', texture: 'specks', grain: 0.5, state: 'hover', corner: 0, border: 1, face: 'face', frame: 'frame', nail: 'nail', shine: 'shine' } },
    { args: { at: [1, 1], size: [94, 30], bevel: 'wood', texture: 'specks', grain: 1, greyed: 0.75, corner: 4, border: 3, face: 'face', frame: 'frame', nail: 'nail', shine: 'shine', stone: 'stone' } },
    { args: { at: [0, 0], size: [40, 16], bevel: 'lit', shine: 'shine', glint: true, state: 'hover', face: 'face', frame: 'frame' } },
  ],
  'ui.bar@1': [
    { args: { at: [1, 1], size: [62, 14], frame: 'frame', back: 'face' } },
    { args: { at: [1, 1], size: [62, 14], shape: 'pill', border: 3, notches: true, frame: 'frame', back: 'face' } },
    { args: { at: [1, 1], size: [62, 14], layer: 'fill', value: 0.6, fill: 'fill', frame: 'frame' } },
    { args: { at: [1, 1], size: [62, 14], layer: 'fill', fade: true, flash: 1, fill: 'fill', shine: 'shine', frame: 'frame' }, ctx: { t: 0.5, loop: false, frames: 4, frame: 2 } },
    { args: { at: [1, 1], size: [62, 14], bevel: 'lit', corner: 3, border: 2, frame: 'frame' } },
    { args: { at: [0, 0], size: [40, 32], shape: 'pill', frame: 'frame', back: 'face' } },
    { args: { at: [0, 0], size: [200, 120], shape: 'pill', bevel: 'lit', notches: true, frame: 'frame', back: 'face' } },
  ],
  'ui.slider@1': [
    { args: { at: [1, 1], size: [62, 14], frame: 'frame', back: 'face' } },
    { args: { at: [1, 1], size: [62, 14], shape: 'pill', notches: true, frame: 'frame', back: 'face' } },
    { args: { at: [2, 3], size: [40, 10], corner: 4, frame: 'frame', back: 'face' } },
  ],
  'ui.knob@1': [
    { args: { at: [32, 8], face: 'face', frame: 'frame' } },
    { args: { at: [32, 8], size: 14, shape: 'pill', face: 'face', frame: 'frame' } },
    { args: { at: [10, 10], size: 10, outlined: true, corner: 4, face: 'face', frame: 'frame' } },
  ],
  'ui.highlight@1': [
    { args: { at: [6, 8], size: [84, 14], paint: 'accent', face: 'face' } },
    { args: { at: [6, 8], size: [84, 14], inside: 'solid', corner: 2, paint: 'accent' } },
    { args: { at: [0, 0], size: [20, 10], corner: 0, darken: -1, paint: 'accent', face: 'face' } },
  ],
  'ui.arrow@1': [
    { args: { at: [48, 23], paint: 'accent' } },
    { args: { at: [48, 23], size: 9, bob: 2, paint: 'accent' }, ctx: { t: 0.25, loop: true, frames: 8, frame: 2 } },
    { args: { at: [10, 10], size: 5, dir: 'right', outline: false, paint: 'accent' } },
  ],
};

test('B13 registers its interface pieces in the site registry, family "ui"', () => {
  const fam = Object.fromEntries(registry.generators().map((g) => [g.key, g.family]));
  for (const key of Object.keys(CASES)) assert.equal(fam[key], 'ui', key);
  assert.deepEqual([...UI_PIECES].sort(), Object.keys(CASES).sort(), 'UI_PIECES lists them');
  for (const key of Object.keys(CASES)) assert.equal(typeof UI_MEASURES[key], 'function', `${key} has a measure`);
  assert.ok(UI_STYLES.includes('plain') && UI_STYLES.includes('framed') && UI_STYLES.includes('carved'), 'the style words of the ui-button fixture');
  assert.deepEqual([...UI_STATES], ['normal', 'hover', 'pressed', 'disabled']);
});

for (const key of Object.keys(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases: CASES[key] });
  });
}

// ---- shapes ----------------------------------------------------------------------------------------------------

/** The pixels a shape test covers in a w x h frame, as a set of "x,y". */
const covered = (W, H, inside) => { const s = new Set(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x + 0.5, y + 0.5)) s.add(`${x},${y}`); return s; };
/** The pixels a primitive list paints in one paint, as a set of "x,y". */
function painted(W, H, prims) {
  const g = new Surface(W, H);
  drawList(g, prims, { palette: { p: '#808080' } });
  const s = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.get(x, y)) s.add(`${x},${y}`);
  return s;
}

test('a round rect as rows paints exactly roundRectIn, a cut rect cutRectIn, at every corner and size', () => {
  for (const [w, h] of [[94, 30], [12, 14], [5, 5], [3, 9], [1, 1]]) {
    for (let k = 0; k <= 4; k++) {
      const want = covered(100, 40, roundRectIn(2, 3, w, h, k));
      assert.deepEqual(painted(100, 40, rowsArea(roundRows(2, 3, w, h, k), { paint: 'p', shade: 0 })), want, `round ${w}x${h} k${k}`);
      const cut = covered(100, 40, cutRectIn(2, 3, w, h, k));
      assert.deepEqual(painted(100, 40, rowsArea(cutRows(2, 3, w, h, k), { paint: 'p', shade: 0 })), cut, `cut ${w}x${h} c${k}`);
    }
  }
  assert.deepEqual(cutRows(0, 0, 10, 10, [0, 0, 0, 0]).length, 10);
  assert.deepEqual(roundRows(0, 0, 0, 5, 2), [], 'nothing for an empty rect');
});

// ---- measures: exactly what the code helpers give --------------------------------------------------------------

const ctx = (size) => ({ t: 0, frame: 0, frames: 1, loop: true, size, clip: 'box', direction: null });

test('ui.panel measures panel9: the inner text area in every look, border, corner and shadow; slice9 for the frame or its rect', () => {
  const ui = registry.generator('ui.panel', 1);
  for (const look of PANEL_STYLES) for (const border of [0, 0.5, 1]) for (const corner of [0, 0.25, 0.5, 0.75, 1]) for (const shadow of [false, true]) {
    for (const [x, y, w, h] of [[1, 1, 94, 46], [20, 14, 56, 20]]) {
      const old = panel9(new Surface(96, 48), x, y, w, h, { face: '#4a609c', frame: '#f0ead8', style: look, border, corner, shadow });
      const m = measurePiece(ui, { at: [x, y], size: [w, h], look, border: 1 + border * 2, corner: corner * 4, shadow }, ctx([96, 48]));
      const b = 1 + Math.round(border * 2);
      assert.deepEqual(m.textArea, { ...old.inner, edge: { x: x + (w >> 1), y: old.body.y + (look === 'scroll' ? 2 : b) } }, `${look} b${border} c${corner} ${shadow} at ${x}`);
      assert.deepEqual(m.slice, x === 1 ? { left: 8, top: 8, right: 8, bottom: 8 } : { rect: { x, y, w, h }, left: 7, top: 7, right: 7, bottom: 7 });
    }
  }
  // a chosen row: the highlight's flat middle is the text area (ui-dialogue's choice clip)
  const old = panel9(new Surface(96, 48), 1, 1, 94, 46, { face: '#4a609c', frame: '#f0ead8', border: 0.5 });
  const hl = highlight(new Surface(96, 48), old.inner.x + 1, old.inner.y + 2, old.inner.w - 2, 14, { colour: '#f2c230', fill: '#203050', corner: 0.5 });
  assert.deepEqual(measurePiece(ui, { at: [1, 1], size: [94, 46], row: true }, ctx([96, 48])).textArea, hl.inner);
});

test('ui.button measures the wood button: text area and slice in every state, border and corner (ui-buttons-wood)', () => {
  const ui = registry.generator('ui.button', 1);
  for (const state of ['normal', 'hover', 'pressed', 'disabled']) for (const border of [0, 0.5, 1]) for (const corner of [0, 1]) for (const style of ['plank', 'carved', 'stone']) {
    const text = OLD.value();
    const lip = state === 'pressed' ? 0 : 2;
    const m = measurePiece(ui, { at: [1, 1], size: [94, 30], bevel: 'wood', cut: style === 'carved' ? 'cut' : 'round', border: 1 + border * 2, corner: corner * 4, state, lip }, ctx([96, 32]));
    assert.deepEqual(m.textArea, { ...text, edge: { x: 48, y: 2 + (state === 'pressed' ? 2 : 0) } }, `${state} ${style} b${border}`);
    assert.deepEqual(m.slice, state === 'pressed' ? { left: 8, top: 9, right: 8, bottom: 5 } : { left: 8, top: 7, right: 8, bottom: 7 });
  }
});

test('ui.bar measures the housing\'s opening (skinBarOpening, barOpening) and the bars\' slice; the slider and knob theirs', () => {
  const bar = registry.generator('ui.bar', 1);
  for (const border of [1, 2, 3]) for (const caps of [0, 3]) {
    const o = OLD.value();
    assert.deepEqual(o, barOpening(1, 1, 62, 14, { borderPx: border, caps }));
    for (const layer of ['housing', 'fill']) {
      const m = measurePiece(bar, { at: [1, 1], size: [62, 14], border, caps, layer }, ctx([64, 16]));
      assert.deepEqual(m.slice, { left: Math.max(8, o.x + 1), top: 4, right: Math.max(8, 64 - (o.x + o.w) + 1), bottom: 4, opening: o });
      assert.equal(m.textArea, undefined);
    }
  }
  const slider = measurePiece(registry.generator('ui.slider', 1), { at: [1, 1], size: [62, 14] }, ctx([64, 16]));
  assert.deepEqual(slider.slice, { left: 8, top: 8, right: 8, bottom: 8 });
  for (const size of [10, 12, 14]) {
    const rect = OLD.value();
    assert.deepEqual(measurePiece(registry.generator('ui.knob', 1), { at: [32, 8], size }, ctx([64, 16])).slice, { rect });
  }
  const r = OLD.value();
  const prims = registry.runGenerator({ gen: 'ui.slider', v: 1, at: [1, 1], size: [62, 14], frame: 'frame', back: 'face' }).primitives;
  const g = new Surface(64, 16);
  drawList(g, prims, { palette: { frame: '#f0ead8', face: '#3f5068' } });
  for (let y = 0; y < 16; y++) assert.equal(!!g.get(30, y), y >= r.y && y < r.y + r.h, `the rail covers rows ${r.y} to ${r.y + r.h - 1} (row ${y})`);
});

test('ui.highlight measures highlight\'s inner, filled or solid', () => {
  const hl = registry.generator('ui.highlight', 1);
  const filled = highlight(new Surface(96, 48), 6, 8, 84, 14, { colour: '#f2c230', fill: '#000000' });
  const solid = highlight(new Surface(96, 48), 6, 8, 84, 14, { colour: '#f2c230' });
  assert.deepEqual(measurePiece(hl, { at: [6, 8], size: [84, 14] }, ctx([96, 48])).textArea, filled.inner);
  assert.deepEqual(measurePiece(hl, { at: [6, 8], size: [84, 14], inside: 'solid' }, ctx([96, 48])).textArea, solid.inner);
});

// ---- drawing ---------------------------------------------------------------------------------------------------

const PALETTE = { face: '#a06a3c', frame: '#7a4f33', nail: '#c2c9d6', shine: '#ffffff', accent: '#f2c230', fill: '#6aa83e', stone: '#737868' };
const SLOTS = Object.fromEntries(Object.entries(PALETTE).map(([k, hex]) => [k, { hex }]));
/** A primitive with its colour rules worked out to colours, as engine/resolve.js expandFrame does before drawing. */
const worked = (p) => {
  const fix = (v) => (v && typeof v === 'object' && v.rule ? paintHex(v, SLOTS) : v);
  const q = { ...p };
  if (Object.hasOwn(p, 'paint')) q.paint = fix(p.paint);
  if (p.key) q.key = Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, fix(v)]));
  return q;
};
function draw(call, size = [96, 32], c = {}) {
  const r = registry.runGenerator(call, c);
  assert.ok(r.ok, r.errors.join('; '));
  const g = new Surface(...size);
  const out = drawList(g, r.primitives.map(worked), { palette: PALETTE });
  assert.deepEqual(out.skipped, [], JSON.stringify(out.skipped));
  return g;
}
const box = (g) => { let y0 = Infinity, y1 = -1, x0 = Infinity, x1 = -1; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return { x0, y0, x1, y1 }; };

test('a button fills its rectangle; pressed sits on the lip 2 px lower and shows no lip; lift raises it', () => {
  const call = { gen: 'ui.button', v: 1, at: [1, 1], size: [94, 30], bevel: 'wood', face: 'face', frame: 'frame', nail: 'nail', shine: 'shine' };
  const normal = draw(call), pressed = draw({ ...call, state: 'pressed', lip: 0 });
  assert.deepEqual(box(normal), { x0: 1, y0: 1, x1: 94, y1: 30 });
  assert.deepEqual(box(pressed), { x0: 1, y0: 3, x1: 94, y1: 30 }, 'the bottom stays where it was');
  assert.notEqual(normal.get(48, 2), pressed.get(48, 2));
  const lifted = draw({ ...call, state: 'pressed', lip: 0, lift: 1 });
  assert.equal(box(lifted).y0, 2, 'lift moves the body up, within the box');
  // hover lightens the stain: the middle is lighter than in normal
  const hover = draw({ ...call, state: 'hover' });
  const lum = (c) => (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255);
  assert.ok(lum(hover.get(48, 16)) > lum(normal.get(48, 16)), 'hover is lighter');
});

test('the wood textures stay out of the flat middle (the text area is one colour) and nails sit in the corners', () => {
  for (const [texture, extra] of [['grain', {}], ['chisel', { cut: 'cut', sunken: true }], ['specks', {}]]) {
    const call = { gen: 'ui.button', v: 1, at: [1, 1], size: [94, 30], bevel: 'wood', texture, grain: 1, nails: true, face: 'face', frame: 'frame', nail: 'nail', shine: 'shine', ...extra };
    const g = draw(call);
    const m = measurePiece(registry.generator('ui.button', 1), call, ctx([96, 32])).textArea;
    const c0 = g.get(m.x, m.y);
    for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) assert.equal(g.get(x, y), c0, `${texture}: ${x},${y} in the text area is flat`);
    const marks = new Set();
    for (let y = 1; y < 31; y++) for (let x = 1; x < 95; x++) if (!(x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h)) marks.add(g.get(x, y));
    assert.ok(marks.size >= 6, `${texture}: rings, marks and nails show (${marks.size} colours)`);
  }
});

test('a bar fill covers its share of the opening and nothing outside it; the flash fades over a clip that does not loop', () => {
  const o = OLD.value();
  const g = draw({ gen: 'ui.bar', v: 1, at: [1, 1], size: [62, 14], layer: 'fill', value: 0.5, fill: 'fill' }, [64, 16]);
  const b = box(g);
  assert.deepEqual(b, { x0: o.x, y0: o.y, x1: o.x + Math.round(o.w * 0.5) - 1, y1: o.y + o.h - 1 });
  const flash = (t) => draw({ gen: 'ui.bar', v: 1, at: [1, 1], size: [62, 14], layer: 'fill', fade: true, flash: 1, fill: 'fill', shine: 'shine' }, [64, 16], { t, loop: false, frames: 4 }).get(o.x, o.y);
  assert.notEqual(flash(0), flash(1), 'white at the start, the fill colour at the end');
  assert.equal(flash(1), draw({ gen: 'ui.bar', v: 1, at: [1, 1], size: [62, 14], layer: 'fill', fill: 'fill' }, [64, 16]).get(o.x, o.y));
});

test('an arrow bobs with the clip and is outlined; style, state and paints only as named', () => {
  const at = (t) => box(draw({ gen: 'ui.arrow', v: 1, at: [48, 23], size: 9, bob: 2, paint: 'accent' }, [96, 48], { t, loop: true, frames: 8 }));
  assert.equal(at(0).y0 + 1, at(0.25).y0, 'down 1 px a quarter of the way');
  assert.deepEqual(at(0), at(1), 'the loop closes');
  const g = draw({ gen: 'ui.arrow', v: 1, at: [48, 23], size: 9, paint: 'accent' }, [96, 48]);
  assert.equal(g.get(48 - 5, 21) >>> 0, 0xff331b23 >>> 0, 'inked to the left of its top row (rows 21 to 25, the top one 44 to 52)');
});

// ---- review fixes (B13 round 2) ----------------------------------------------------------------------------------

test('every piece returns no more than its cost at any size the validator takes (a tall pill too)', () => {
  const ok = (call) => { const r = registry.runGenerator(call); assert.ok(r.ok, `${JSON.stringify(call)}: ${r.errors.join('; ')}`); return r; };
  // the review's cases: a 40x32 pill gave 39 primitives against a cost of 22; a 640x360 one 501 against 172
  const pill = ok({ gen: 'ui.bar', v: 1, size: [40, 32], shape: 'pill' });
  assert.ok(pill.primitives.length <= 8 && pill.primitives.length <= pill.cost, `a tall pill is a few polygons, not a rect per row (${pill.primitives.length})`);
  // the outline, in two polygons, covers exactly pillIn's pixels (engine/ui-skins.js: a circle of radius h / 2 at each end)
  const inPill = (px, py) => (px < 16 ? (px - 16) ** 2 + (py - 16) ** 2 <= 256 : px > 24 ? (px - 24) ** 2 + (py - 16) ** 2 <= 256 : true);
  const outline = pill.primitives.filter((p) => p.kind === 'poly' && p.paint === 'ink');
  assert.equal(outline.length, 2);
  assert.deepEqual(painted(40, 32, outline.map((p) => ({ ...p, paint: 'p' }))), covered(40, 32, inPill));
  ok({ gen: 'ui.bar', v: 1, at: [0, 0], size: [640, 360], shape: 'pill', bevel: 'lit', notches: true, border: 3 });
  for (const h of [4, 5, 8, 14, 16, 27, 28, 29, 32, 40, 64, 65, 128, 200, 360, 640]) for (const w of [8, 24, 40, 63, 128, 300, 640]) {
    for (const shape of ['round', 'pill']) for (const bevel of ['flat', 'lit']) for (const notches of [false, true]) for (const border of [1, 3]) {
      ok({ gen: 'ui.bar', v: 1, at: [0, 0], size: [w, h], shape, bevel, notches, border, corner: 4, caps: 2 });
    }
    for (const shape of ['round', 'pill']) ok({ gen: 'ui.slider', v: 1, at: [0, 0], size: [w, h], shape, notches: true, corner: 4 });
    for (const look of ['plain', 'ornate', 'scroll']) for (const shadow of [false, true]) ok({ gen: 'ui.panel', v: 1, at: [0, 0], size: [w, h], look, shadow, row: true, corner: 4, border: 3 });
    if (w >= 8 && h >= 8) {
      ok({ gen: 'ui.button', v: 1, at: [0, 0], size: [w, h], bevel: 'lit', glint: true, corner: 4, border: 2 });
      for (const [cut, texture] of [['round', 'grain'], ['cut', 'chisel'], ['round', 'specks']]) for (const state of ['normal', 'pressed']) {
        ok({ gen: 'ui.button', v: 1, at: [0, 0], size: [w, h], bevel: 'wood', cut, texture, grain: 1, nails: true, sunken: cut === 'cut', state, corner: 4, border: 3, greyed: 0.75 });
      }
    }
    if (w >= 5 && h >= 5) for (const inside of ['fill', 'solid']) ok({ gen: 'ui.highlight', v: 1, at: [0, 0], size: [w, h], inside, corner: 4 });
  }
});

// the wood skin's stone slot: a grey that, darkened toward the ink, is the grey of the default stained face
const SURE = { nail: '#c2c9d6', shine: '#ffffff', stone: '#737868' };
/** A wooden button drawn by ui.button with its own colours, as engine/resolve.js would: { surface }. */
function woodNew(call, colours) {
  const slots = Object.fromEntries(Object.entries(colours).map(([k, hex]) => [k, { hex }]));
  const fix = (v) => (v && typeof v === 'object' && v.rule ? paintHex(v, slots) : v);
  const r = registry.runGenerator(call);
  assert.ok(r.ok, r.errors.join('; '));
  const g = new Surface(96, 32);
  drawList(g, r.primitives.map((p) => { const q = { ...p }; if (Object.hasOwn(p, 'paint')) q.paint = fix(p.paint); if (p.key) q.key = Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, fix(v)])); return q; }), { palette: colours });
  return g;
}
const woodCall = (style, state, { border, corner, nails, grain }) => ({
  gen: 'ui.button', v: 1, at: [1, 1], size: [94, 30], bevel: 'wood', cut: style === 'carved' ? 'cut' : 'round', sunken: style === 'carved',
  texture: { plank: 'grain', carved: 'chisel', stone: 'specks' }[style], greyed: style === 'stone' ? 0.75 : 0, grain, nails,
  border: 1 + border * 2, corner: corner * 4, state, lip: state === 'pressed' ? 0 : 2, face: 'face', frame: 'frame', nail: 'nail', shine: 'shine', stone: 'stone',
});
const chan = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];

test('the wooden board is woodButton\'s, pixel for pixel: the frame band\'s lower left is mix(frame, ink, 0.5), never the engine\'s red shadow tone', () => {
  for (const [face, frame] of [['#a06a3c', '#7a4f33'], ['#3f6fd1', '#f2c230'], ['#c9423a', '#c2c9d6']]) {
    for (const state of ['normal', 'hover', 'pressed']) for (const style of ['plank', 'carved']) for (const border of [0, 0.5, 1]) for (const corner of [0, 0.25, 0.5, 1]) for (const nails of [false, true]) {
      const opts = { border, corner, nails, grain: 0.5 };
      const old = OLD.surface(96, 32);
      const g = woodNew(woodCall(style, state, opts), { face, frame, ...SURE });
      const off = [];
      for (let i = 0; i < old.data.length; i++) if (old.data[i] !== g.data[i]) off.push(`${i % 96},${Math.floor(i / 96)}`);
      assert.deepEqual(off, [], `${face}/${frame} ${state} ${style} b${border} c${corner} nails ${nails}: ${off.length} pixels differ`);
    }
  }
});

test('the stone style is a greyed slab: woodButton\'s stone within a few levels, its stain grey', () => {
  for (const state of ['normal', 'hover', 'pressed']) for (const border of [0, 1]) for (const corner of [0, 1]) {
    const old = OLD.surface(96, 32);
    const g = woodNew(woodCall('stone', state, { border, corner, nails: true, grain: 1 }), { face: '#a06a3c', frame: '#7a4f33', ...SURE });
    let worst = 0;
    for (let i = 0; i < old.data.length; i++) {
      assert.equal(!!(old.data[i] >>> 24), !!(g.data[i] >>> 24), `${state}: the same pixels are drawn`);
      const [a, b] = [chan(old.data[i]), chan(g.data[i])];
      worst = Math.max(worst, ...a.map((c, k) => Math.abs(c - b[k])));
    }
    assert.ok(worst <= 8, `${state} b${border} c${corner}: a channel is ${worst} levels off woodButton's stone`);
    const sat = (v) => { const c = chan(v); return Math.max(...c) - Math.min(...c); };
    const plank = woodNew(woodCall('plank', state, { border, corner, nails: true, grain: 1 }), { face: '#a06a3c', frame: '#7a4f33', ...SURE });
    assert.ok(sat(g.get(48, 16)) <= 0.35 * sat(plank.get(48, 16)), `${state}: the stain is greyed (${chan(g.get(48, 16))} against plank's ${chan(plank.get(48, 16))})`);
  }
});
