// The skinned interface pieces of migration batch M8 (engine/gen/ui-skin.js; docs/data-sprites.md 2.5b, build item B13's
// panel body): ui.slab, ui.trough, ui.strip, ui.toggle, ui.pointer and ui.selector, the skin pieces of the families
// (pieces/skin-*.v*.json) and the "*" arguments a skin gives every piece of the family. Held to here:
//   - each generator passes the goldens harness (pinned output, determinism, cost an upper bound under the budget,
//     argument fuzz, loop closure)
//   - the cost holds over every role, corner shape, corner, border, state, ring list and size the validator takes
//   - a skin's ornaments are its own stamps: corner stamps mirrored into the four corners (topTrim and extraTop the two
//     top ones), along stamps repeated in the rings, every stamp kept to the slab, extras and gleam only when on
//   - a strip fills exactly the opening of the housing called with the same box, rings, border, caps and segments; a
//     segmented housing's compartments are whole, its strip has gaps over the lines, its slice a tile pitch
//   - a skin's "*" arguments reach a piece only where it declares them with a fitting type; checkSkin refuses one that
//     fits no piece
//   - every skin family piece is valid, pinned, and draws a panel body (tests/fixtures/v2/panel/skinned-pieces.json)
//   - (review round 1 of M8) the cost holds with every ornament list full; rightTrim and gleamRight draw in the lit top
//     right corner only; corner ornaments lie inside the slice's corner cells; a titled slab gives two text areas; a
//     piece too small to stretch exports its rect alone; a housing and its strip measure alike; ui.area@1 draws nothing
//     and gives the areas and slice it is told
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { SKIN_PIECES, SKIN_MEASURES, troughGeom, SKIN_MAX, TROUGH_MAX, ornamentCost } from '../../engine/gen/ui-skin.js';
import { UI_MEASURES, measurePiece } from '../../engine/gen/ui-pieces.js';
import { UI_STYLES } from '../../engine/gen/ui-shapes.js';
import { checkSkin, checkSkinPiece, prepareCall, ANY_PIECE } from '../../engine/gen/ui.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { validatePiece } from '../../engine/pieces.js';
import { nodePieceStore, readPins } from '../../tools/lib/pieces-index.mjs';

const PAINTS = { face: 'face', frame: 'frame', accent: 'accent' };
const STAMP = (rows, at = [0, 0]) => ({ kind: 'stamp', at, rows, key: { a: 'accent', b: 'frame.light' } });
const CANDYISH = { rings: ['ink', 'frame', 'ink'], bandAt: 1, lit: true, extras: true, gleam: true, sides: true, every: 8,
  extra: [STAMP(['a..', '..b'], [3, 1])], extraAlong: [STAMP(['ab'], [0, 1])], gleamTop: [STAMP(['.b', 'bb'], [5, 4])], trim: [STAMP(['ab'], [2, 2])] };
const CASES = {
  'ui.slab@1': [
    { args: { at: [1, 1], size: [94, 62], ...PAINTS } },
    { args: { at: [1, 1], size: [94, 62], role: 'title', edge: 'cut', corner: 3, border: 3, ...CANDYISH, ...PAINTS } },
    { args: { at: [1, 1], size: [94, 30], role: 'button', state: 'hover', gloss: 2, ...CANDYISH, ...PAINTS } },
    { args: { at: [1, 1], size: [94, 30], role: 'button', state: 'pressed', lip: 0, shadow: true, edge: 'pill', rings: ['ink', 'frame'], ...PAINTS } },
    { args: { at: [1, 1], size: [94, 40], role: 'tooltip', edge: 'chip', corner: 4, border: 1, ...PAINTS } },
    { args: { at: [1, 1], size: [94, 31], role: 'tab-open', topTrim: [STAMP(['aaaa', 'a.a.'], [1, 1])], ...PAINTS } },
    { args: { at: [1, 1], size: [94, 30], role: 'tab', lined: true, line: 'ink', ...PAINTS } },
    { args: { at: [1, 1], size: [94, 62], role: 'inset', lined: true, sunken: true, rings: ['ink', 'frame', 'face', 'frame'], ...PAINTS } },
  ],
  'ui.trough@1': [
    { args: { at: [1, 1], size: [62, 14], ...PAINTS } },
    { args: { at: [1, 1], size: [62, 14], lit: true, trough: 'ink', segments: 5, ...PAINTS } },
    { args: { at: [1, 1], size: [62, 14], caps: 4, notches: true, edge: 'cut', ...CANDYISH, ...PAINTS } },
    { args: { at: [1, 1], size: [62, 14], role: 'rail', trough: 'well', ...PAINTS } },
  ],
  'ui.strip@1': [
    { args: { at: [1, 1], size: [62, 14], fill: 'fill' } },
    { args: { at: [1, 1], size: [62, 14], segments: 5, glint: true, fill: 'fill', shine: 'shine' } },
    { args: { at: [1, 1], size: [62, 14], hatch: true, gloss: true, caps: 4, value: 0.5, fill: 'fill' } },
    { args: { at: [1, 1], size: [62, 14], flash: 1, fade: true, fill: 'fill', shine: 'shine' }, ctx: { t: 0.5, loop: false, frames: 4, frame: 2 } },
  ],
  'ui.toggle@1': [
    { args: { at: [16, 16], ...PAINTS } },
    { args: { at: [16, 16], kind: 'radio', ...PAINTS } },
    { args: { at: [16, 16], kind: 'switch', size: 28, checked: false, ...PAINTS } },
    { args: { at: [16, 16], kind: 'check', checked: false, edge: 'cut', ...CANDYISH, ...PAINTS } },
  ],
  'ui.pointer@1': [
    { args: { at: [4, 16], ...PAINTS } },
    { args: { at: [4, 16], len: 14, reach: 3, ...PAINTS }, ctx: { t: 0.25, loop: true, frames: 8, frame: 2 } },
    { args: { at: [2, 10], len: 28, rings: ['ink', 'frame'], ...PAINTS } },
  ],
  'ui.selector@1': [
    { args: { at: [1, 1], size: [30, 30], ...PAINTS } },
    { args: { at: [1, 1], size: [30, 30], len: 8, thick: 1, ...PAINTS }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [4, 4], size: [24, 16], ...PAINTS } },
  ],
  'ui.area@1': [
    { args: { at: [8, 17], size: [80, 39] } },
    { args: { at: [8, 17], size: [80, 39], edge: [48, 2], also: true, alsoAt: [8, 5], alsoSize: [80, 11], alsoText: 'ink', left: 8, top: 17, right: 8, bottom: 8 } },
    { args: { at: [0, 0], size: [256, 256], text: 'ink' } },
  ],
};

test('M8 registers its seven skinned pieces in the site registry, family "ui", each with its measure', () => {
  assert.deepEqual([...SKIN_PIECES], Object.keys(CASES));
  for (const key of SKIN_PIECES) {
    const [id, v] = key.split('@');
    const e = registry.generator(id, Number(v));
    assert.ok(e, key);
    assert.equal(e.family, 'ui');
    assert.equal(typeof UI_MEASURES[key], 'function', `${key} is measured (UI_MEASURES)`);
    assert.equal(UI_MEASURES[key], SKIN_MEASURES[key]);
  }
  for (const w of ['jelly', 'temple', 'vine', 'tube', 'sheet', 'segmented', 'slanted']) assert.ok(UI_STYLES.includes(w), w);
});

for (const [key, cases] of Object.entries(CASES)) {
  test(`${key} passes the goldens harness`, () => {
    const [id, v] = key.split('@');
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

test('every skinned piece returns no more than its cost, over roles, corners, borders, states, rings and sizes', () => {
  const sizes = [[6, 6], [20, 12], [94, 30], [96, 64], [SKIN_MAX, SKIN_MAX], [SKIN_MAX, 7]];
  const ringsList = [['ink'], ['ink', 'frame'], ['ink', 'frame', 'ink'], ['ink', 'frame.dark', 'frame', 'face']];
  let n = 0;
  const run = (gen, args) => {
    const r = registry.runGenerator({ gen, v: 1, ...args });
    assert.ok(r.ok, `${gen} ${JSON.stringify(args).slice(0, 160)}: ${r.errors.join('; ')}`);
    assert.ok(r.primitives.length <= r.cost, `${gen} returns ${r.primitives.length}, its cost is ${r.cost}: ${JSON.stringify(args).slice(0, 200)}`);
    assert.ok(r.cost <= registry.GEN_LIMITS.primitives);
    n++;
  };
  for (const size of sizes) for (const edge of ['round', 'cut', 'pill', 'chip']) for (const corner of [0, 2, 4]) for (const border of [1, 3]) for (const rings of ringsList) {
    const look = { at: [1, 1], size, edge, corner, border, rings, bandAt: rings.length - 1 > 0 ? 1 : 0, lit: true, ...CANDYISH, rings, ...PAINTS };
    for (const role of ['panel', 'title', 'inset', 'tooltip', 'tab', 'tab-open']) run('ui.slab', { ...look, role, gloss: 3, sunken: true, lined: true });
    for (const state of ['normal', 'hover', 'pressed', 'disabled']) for (const shadow of [false, true]) run('ui.slab', { ...look, role: 'button', state, lip: state === 'pressed' ? 0 : 2, shadow, travel: 4 });
    for (const role of ['housing', 'rail']) run('ui.trough', { ...look, size: [size[0], Math.min(size[1], TROUGH_MAX)], role, caps: 3, segments: 7, notches: true, every: 4 });
    run('ui.strip', { at: [1, 1], size: size.map((n) => Math.max(12, n)), border, rings, caps: 3, segments: 7, hatch: true, glint: true, gloss: true, fill: 'fill' });
  }
  for (const kind of ['check', 'radio', 'switch']) for (const size of [8, 20, 28, 40]) for (const checked of [true, false]) run('ui.toggle', { at: [20, 20], kind, size, checked, ...CANDYISH, ...PAINTS });
  for (const len of [8, 20, 28]) for (const t of [0, 0.25, 0.5]) { const r = registry.runGenerator({ gen: 'ui.pointer', v: 1, at: [4, 16], len, ...PAINTS }, { t, loop: true }); assert.ok(r.ok && r.primitives.length <= r.cost); }
  assert.ok(n > 1000, `${n} cases`);
});

/** Eight one-pixel stamps in a row at [x, y] and on (a full corner list); two for an along list. */
const LINE8 = (x = 0, y = 0) => Array.from({ length: 8 }, (_, i) => ({ kind: 'stamp', at: [x + i, y], rows: ['a'], key: { a: 'accent' } }));
const FULL = { trim: LINE8(), topTrim: LINE8(0, 1), extra: LINE8(0, 2), extraTop: LINE8(0, 3), gleamTrim: LINE8(1, 0), gleamTop: LINE8(1, 1), rightTrim: LINE8(2, 0), gleamRight: LINE8(2, 1),
  along: [STAMP(['a', 'b']), STAMP(['b', 'a'])], extraAlong: [STAMP(['a', 'b']), STAMP(['b', 'a'])], extras: true, gleam: true, sides: true, every: 4, start: 0 };

test('the cost holds with every ornament list full and every ornament toggle on (the worst case the review asked for)', () => {
  // with all lists full the ornaments alone are most of a piece's primitives, so a cost that undercounted them fails here
  let most = 0;
  for (const size of [[SKIN_MAX, SKIN_MAX], [SKIN_MAX, 32], [40, 40], [20, 20]]) for (const lit of [true, false]) for (const edge of ['round', 'chip']) {
    const look = { at: [0, 0], size, ...PAINTS, ...FULL, lit, edge, corner: 4, border: 3, rings: ['ink', 'frame', 'ink', 'face'], bandAt: 1 };
    for (const [gen, args] of [['ui.slab', look], ['ui.slab', { ...look, role: 'title' }], ['ui.slab', { ...look, role: 'button', shadow: true }], ['ui.slab', { ...look, role: 'tooltip' }],
      ['ui.trough', { ...look, size: [size[0], Math.min(size[1], TROUGH_MAX)], notches: true, segments: 7 }], ['ui.toggle', { ...look, at: [20, 20], size: Math.min(40, size[0]), kind: 'check' }]]) {
      const r = registry.runGenerator({ gen, v: 1, ...args });
      assert.ok(r.ok, `${gen}: ${r.errors.join('; ')}`);
      const stamps = r.primitives.filter((p) => p.kind === 'stamp').length;
      assert.ok(r.primitives.length <= r.cost, `${gen} ${JSON.stringify(size)} returns ${r.primitives.length} (${stamps} stamps), its cost is ${r.cost}`);
      // the ornaments' own share of the cost holds them alone (so a share that undercounted them fails, whatever the slack elsewhere)
      const [w, h] = gen === 'ui.toggle' ? [args.size, args.size] : [args.size[0], args.size[1]];
      assert.ok(stamps <= ornamentCost(w, h, args.every), `${gen} ${JSON.stringify(size)}: ${stamps} ornament stamps, ornamentCost ${ornamentCost(w, h, args.every)}`);
      most = Math.max(most, stamps / ornamentCost(w, h, args.every));
    }
  }
  assert.ok(most > 0.5, `the worst case comes near the ornaments' bound (${most.toFixed(2)} of it)`);
});

test('rightTrim and gleamRight are drawn in the top right corner only, the corner the light comes from', () => {
  const base = { gen: 'ui.slab', v: 1, at: [1, 1], size: [40, 20], corner: 0, ...PAINTS };
  const px = stampPixels(registry.runGenerator({ ...base, rightTrim: [STAMP(['ab'], [1, 1])] }).primitives);
  assert.deepEqual([...px].sort(), ['38,2', '39,2'].sort());
  const bubble = { gleamRight: [STAMP(['a'], [2, 2])] };
  assert.equal(stampPixels(registry.runGenerator({ ...base, ...bubble }).primitives).size, 0, 'gleamRight only with gleam on');
  assert.deepEqual([...stampPixels(registry.runGenerator({ ...base, ...bubble, gleam: true }).primitives)], ['38,3']);
});

test('a slab\'s and a housing\'s corner ornaments lie inside its slice\'s corner cells, so nine-slicing never stretches them', () => {
  const corner = (x, y, w = 3) => [STAMP(['a'.repeat(w), 'a'.repeat(w)], [x, y])];
  const cases = [];
  for (const [x, y, w] of [[1, 1, 3], [4, 0, 4], [6, 2, 6], [9, 9, 3], [2, 12, 2]]) for (const list of ['trim', 'topTrim', 'extra', 'gleamTop', 'rightTrim', 'gleamRight']) cases.push({ [list]: corner(x, y, w), extras: true, gleam: true });
  let n = 0;
  for (const orn of cases) for (const at of [[0, 0], [1, 1]]) {
    const frame = [96, 64];
    const look = { at, ...PAINTS, ...orn, rings: ['ink', 'frame', 'ink'], bandAt: 1 };
    const calls = [...['panel', 'title', 'inset', 'tooltip', 'tab', 'tab-open'].map((role) => ['ui.slab', { ...look, size: [94, role === 'tooltip' ? 40 : 62], role }]),
      ...['normal', 'pressed'].map((state) => ['ui.slab', { ...look, size: [94, 30], role: 'button', state, lip: state === 'pressed' ? 0 : 2 }]),
      ['ui.trough', { ...look, size: [62, 14] }]];
    for (const [gen, args] of calls) {
      const entry = registry.generator(gen, 1);
      const r = registry.runGenerator({ gen, v: 1, ...args });
      const sl = measurePiece(entry, { ...args }, { size: frame }).slice;
      const rect = sl.rect ?? { x: 0, y: 0, w: frame[0], h: frame[1] };
      if (sl.left === undefined) continue;
      for (const p of stampPixels(r.primitives)) {
        const [px, py] = p.split(',').map(Number);
        const inX = px < rect.x + sl.left || px >= rect.x + rect.w - sl.right, inY = py < rect.y + sl.top || py >= rect.y + rect.h - sl.bottom;
        assert.ok(inX && inY, `${gen} ${args.role ?? ''} ${JSON.stringify(orn).slice(0, 90)}: ornament pixel ${p} is outside the corner cells of ${JSON.stringify(sl)}`);
        n++;
      }
    }
  }
  assert.ok(n > 500, `${n} ornament pixels checked`);
});

test('a titled slab gives two text areas, its body and its heading band; a piece too small to stretch exports its rect and no border', () => {
  const m = measurePiece(registry.generator('ui.slab', 1), { at: [1, 1], size: [94, 62], role: 'title', title: 10, ...PAINTS }, { size: [96, 64] });
  assert.ok(Array.isArray(m.textArea) && m.textArea.length === 2, JSON.stringify(m.textArea));
  const [body, head] = m.textArea;
  assert.ok(head.y + head.h <= body.y && head.h >= 8, JSON.stringify(m.textArea));
  assert.ok(m.slice.top >= head.y + head.h);
  for (const [gen, args] of [['ui.slab', { at: [26, 1], size: [12, 14], role: 'button' }], ['ui.slab', { at: [26, 1], size: [12, 14] }], ['ui.trough', { at: [26, 1], size: [12, 14] }]]) {
    const { opening, ...s } = measurePiece(registry.generator(gen, 1), { ...args, ...PAINTS }, { size: [64, 16] }).slice;
    assert.deepEqual(s, { rect: { x: 26, y: 1, w: 12, h: 14 } }, `${gen} ${JSON.stringify(args)}`);
    assert.ok(gen === 'ui.trough' ? opening : opening === undefined, 'a housing still says where its opening is');
  }
});

test('a housing and its strip measure alike: the strip takes the housing\'s ends and edges, so they share one border', () => {
  for (const geo of [{}, { caps: 4 }, { edges: 8, ends: 16 }, { border: 3, caps: 2, edges: 6 }]) {
    const box = { at: [1, 1], size: [62, 14], rings: ['ink', 'frame', 'ink'], bandAt: 1, ...geo };
    const a = measurePiece(registry.generator('ui.trough', 1), { ...box, ...PAINTS }, { size: [64, 16] }).slice;
    const b = measurePiece(registry.generator('ui.strip', 1), { ...box, fill: 'fill' }, { size: [64, 16] }).slice;
    assert.deepEqual(b, a, JSON.stringify(geo));
    if (geo.edges) assert.deepEqual([a.top, a.bottom], [geo.edges, geo.edges]);
  }
});

test('ui.area@1 draws nothing and gives a clip the text areas and slice it is told (a board whose own piece measures otherwise)', () => {
  const e = registry.generator('ui.area', 1);
  assert.deepEqual(registry.runGenerator({ gen: 'ui.area', v: 1, at: [8, 17], size: [80, 39] }).primitives, []);
  const m = measurePiece(e, { at: [8, 17], size: [80, 39], edge: [48, 2], also: true, alsoAt: [8, 5], alsoSize: [80, 11], alsoText: 'ink', left: 8, top: 17, right: 8, bottom: 8 }, { size: [96, 64] });
  assert.deepEqual(m.textArea, [{ x: 8, y: 17, w: 80, h: 39, edge: { x: 48, y: 2 } }, { x: 8, y: 5, w: 80, h: 11, colour: 'ink' }]);
  assert.deepEqual(m.slice, { left: 8, top: 17, right: 8, bottom: 8 });
  assert.deepEqual(measurePiece(e, { at: [8, 8], size: [80, 48] }, { size: [96, 64] }), { textArea: { x: 8, y: 8, w: 80, h: 48 } });
});

/** The pixels a list of stamps covers: a Set of "x,y". */
const stampPixels = (prims) => {
  const out = new Set();
  for (const s of prims.filter((p) => p.kind === 'stamp')) s.rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') out.add(`${s.at[0] + i},${s.at[1] + j}`); }));
  return out;
};

test('a skin\'s corner stamps are mirrored into the four corners (topTrim into the two top ones), kept to the slab; extras and gleam only when on', () => {
  const base = { gen: 'ui.slab', v: 1, at: [1, 1], size: [40, 20], corner: 0, ...PAINTS };
  const one = registry.runGenerator({ ...base, trim: [STAMP(['ab', 'a.'], [1, 1])] }).primitives;
  const px = stampPixels(one);
  // the top left as written, the top right mirrored left to right, the bottom ones mirrored top to bottom
  for (const p of ['2,2', '3,2', '2,3', '39,2', '38,2', '39,3', '2,19', '3,19', '2,18', '39,19', '38,19', '39,18']) assert.ok(px.has(p), p);
  assert.equal(px.size, 12);
  const top = stampPixels(registry.runGenerator({ ...base, topTrim: [STAMP(['ab'], [1, 1])] }).primitives);
  assert.deepEqual([...top].sort(), ['2,2', '3,2', '38,2', '39,2'].sort());
  // a stamp reaching outside the slab keeps only the slab's pixels
  const out = stampPixels(registry.runGenerator({ ...base, corner: 4, trim: [STAMP(['aaa', 'aaa'], [0, 0])] }).primitives);
  assert.ok(!out.has('1,1') && out.size > 0, 'the cut corner stays empty');
  // ornaments behind a toggle
  const orn = { extra: [STAMP(['a'], [3, 3])], gleamTrim: [STAMP(['b'], [4, 4])] };
  assert.equal(stampPixels(registry.runGenerator({ ...base, ...orn }).primitives).size, 0);
  assert.equal(stampPixels(registry.runGenerator({ ...base, ...orn, extras: true }).primitives).size, 4);
  assert.equal(stampPixels(registry.runGenerator({ ...base, ...orn, extras: true, gleam: true }).primitives).size, 8);
});

test('along stamps repeat every `every` px from `start` px in, along the top and bottom (and down the sides), only in the rings', () => {
  const r = registry.runGenerator({ gen: 'ui.slab', v: 1, at: [0, 0], size: [64, 32], corner: 0, rings: ['ink', 'frame', 'ink'], border: 1, along: [STAMP(['a', 'a'], [0, 0])], every: 8, start: 8, ...PAINTS });
  const px = stampPixels(r.primitives);
  for (const x of [8, 16, 24, 32, 40, 48]) { assert.ok(px.has(`${x},0`) && px.has(`${x},1`), `top at ${x}`); assert.ok(px.has(`${x},31`) && px.has(`${x},30`), `bottom at ${x}`); }
  assert.ok(!px.has('56,0'), 'none within `start` of the far corner');
  assert.ok([...px].every((p) => { const [x, y] = p.split(',').map(Number); return y <= 2 || y >= 29; }), 'only in the rings (3 px deep)');
  const sides = stampPixels(registry.runGenerator({ gen: 'ui.slab', v: 1, at: [0, 0], size: [64, 32], corner: 0, rings: ['ink', 'frame', 'ink'], border: 1, along: [STAMP(['ab'], [0, 0])], every: 8, start: 8, sides: true, ...PAINTS }).primitives);
  assert.ok(sides.has('0,8') && sides.has('0,9') && sides.has('63,8'), 'turned a quarter down the sides');
});

test('a strip fills exactly the opening of its housing; a segmented one has whole compartments, gaps over the lines and a tile pitch', () => {
  const surf = (prims) => { const s = new Set(); for (const p of prims) if (p.kind === 'rect') for (let y = p.at[1]; y < p.at[1] + p.size[1]; y++) for (let x = p.at[0]; x < p.at[0] + p.size[0]; x++) s.add(`${x},${y}`); return s; };
  for (const border of [1, 2, 3]) for (const segments of [0, 5, 7]) for (const caps of [0, 3]) {
    const box = { at: [1, 1], size: [62, 14], border, caps, segments };
    const T = troughGeom({ ...box, rings: ['ink', 'frame', 'ink'], bandAt: 1 });
    const strip = registry.runGenerator({ gen: 'ui.strip', v: 1, ...box, fill: 'fill' });
    const px = surf(strip.primitives);
    const xs = [...px].map((p) => +p.split(',')[0]), ys = [...px].map((p) => +p.split(',')[1]);
    assert.deepEqual([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], [T.o.x, T.o.y, T.o.x + T.o.w - 1, T.o.y + T.o.h - 1], JSON.stringify(box));
    if (segments) {
      assert.equal((T.o.w + 1) % segments, 0, 'whole compartments');
      for (let k = 1; k < segments; k++) assert.ok(!px.has(`${T.o.x + k * T.pitch - 1},${T.o.y + 1}`), 'a gap over each line');
      const m = measurePiece(registry.generator('ui.trough', 1), { ...box, rings: ['ink', 'frame', 'ink'], bandAt: 1 }, { size: [64, 16] });
      assert.deepEqual(m.slice.tile, { x: T.o.x + T.pitch, w: T.pitch });
      assert.equal(m.slice.left, undefined, 'no border: stretching would smear the compartments');
    } else {
      const m = measurePiece(registry.generator('ui.strip', 1), box, { size: [64, 16] });
      assert.deepEqual(m.slice.opening, T.o);
      assert.ok(m.slice.left >= 8 && m.slice.left === m.slice.right || m.slice.left >= 8);
    }
  }
});

test('a skin\'s "*" arguments reach a piece only where it declares them with a fitting type; checkSkin refuses one no piece takes', () => {
  const skin = { args: { [ANY_PIECE]: { rings: ['ink', 'frame'], lit: true, border: 2 } }, styles: { jelly: { [ANY_PIECE]: { gloss: 2 } } } };
  const slab = prepareCall(registry, { gen: 'ui.slab', v: 1, at: [1, 1], size: [40, 20], style: 'jelly' }, skin);
  assert.deepEqual([slab.rings, slab.lit, slab.gloss], [['ink', 'frame'], true, 2]);
  const strip = prepareCall(registry, { gen: 'ui.strip', v: 1, at: [1, 1], size: [40, 12], style: 'jelly' }, skin);
  assert.equal(strip.lit, undefined, 'ui.strip has no lit');
  assert.equal(strip.gloss, undefined, 'ui.strip\'s gloss is a flag: 2 does not fit it');
  assert.deepEqual(strip.rings, ['ink', 'frame']);
  const bar = prepareCall(registry, { gen: 'ui.bar', v: 1, at: [1, 1], size: [40, 12] }, skin);
  assert.equal(bar.border, 2, 'an older piece that declares the argument takes it too');
  assert.deepEqual(checkSkin(skin).errors, []);
  assert.match(checkSkin({ args: { [ANY_PIECE]: { notAnArgument: 1 } } }).errors.join(), /not an argument of any interface piece/);
  assert.match(checkSkin({ args: { [ANY_PIECE]: { rings: 3 } } }).errors.join(), /fits no interface piece/);
  assert.match(checkSkin({ args: { [ANY_PIECE]: { style: 'jelly' } } }).errors.join(), /set by the panel/);
});

const SKIN_FILES = ['skin-candy.v2.json', 'skin-crystal.v1.json', 'skin-flat.v2.json', 'skin-gilded.v2.json', 'skin-grove.v2.json', 'skin-neon.v1.json', 'skin-paper.v2.json', 'skin-tech.v1.json'];

test('the skin family pieces are valid skins, pinned, with a slot for every paint they name', () => {
  const pins = readPins().pins ?? readPins();
  for (const f of SKIN_FILES) {
    const text = fs.readFileSync(new URL(`../../pieces/${f}`, import.meta.url), 'utf8');
    const r = validatePiece(text, { file: f, check: checkSkinPiece });
    assert.ok(r.ok, `${f}: ${r.errors.join('; ')}`);
    assert.ok(pins[`${r.piece.id}@${r.piece.v}`], `${f} is pinned`);
    const slots = new Set(r.piece.slots.map((s) => s.id));
    for (const p of Object.values(r.piece.body.paint)) assert.ok(p === 'ink' || slots.has(String(p).split('.')[0]), `${f}: paint ${p} is a slot`);
  }
});

test('a panel body with a skin family piece draws every skinned piece (tests/fixtures/v2/panel/skinned-pieces.json)', async () => {
  const def = JSON.parse(fs.readFileSync(new URL('../fixtures/v2/panel/skinned-pieces.json', import.meta.url), 'utf8'));
  const store = nodePieceStore({ check: checkSkinPiece });
  const loaded = await store.loadFor(def);
  assert.ok(loaded.ok, loaded.errors.join('; '));
  const s = dataSprite(def, { pieces: store, strict: true });
  const p = defaultParams(s);
  const solid = (g) => g.data.filter((v) => v >>> 24).length;
  for (const c of Object.keys(s.clips)) assert.ok(solid(renderFrame(s, c, 0, p)) > 40, `${c} draws`);
  // the button's states differ; hover is brighter than normal, pressed sits lower
  const [n, h, pr] = ['normal', 'hover', 'pressed'].map((c) => renderFrame(s, c, 0, p));
  assert.notDeepEqual(n.data, h.data);
  assert.ok(pr.bounds().y0 > n.bounds().y0, 'pressed sits lower');
  // the text area is one colour (the ornaments keep out of it) and the slice is the 8 px border
  const ta = s.textArea('normal', p);
  const colours = new Set();
  for (let y = ta.y; y < ta.y + ta.h; y++) for (let x = ta.x; x < ta.x + ta.w; x++) colours.add(n.get(x, y));
  assert.equal(colours.size, 1, 'one colour under the text');
  assert.deepEqual([s.slice('normal', p).left, s.slice('normal', p).right], [8, 8]);
  // the switch moves its knob; the pointer nudges; the selector steps
  assert.notDeepEqual(renderFrame(s, 'switch-on', 0, p).data, renderFrame(s, 'switch-off', 0, p).data);
  assert.notDeepEqual(renderFrame(s, 'pointer', 0, p).data, renderFrame(s, 'pointer', 2, p).data);
  assert.notDeepEqual(renderFrame(s, 'selector', 0, p).data, renderFrame(s, 'selector', 4, p).data);
});
