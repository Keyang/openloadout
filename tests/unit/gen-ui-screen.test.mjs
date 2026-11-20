// ui.screen@1 (engine/gen/ui-screen.js): the panel of the Gridline kit's screens round a round (pause, results, game
// over, a new best): bundles/specs/kit-puzzle-gridline.md, `ui-gridline-panels`. Pinned by the goldens harness
// (tests/helpers/gen-harness.mjs); the tests after it hold what the specification asks of each screen.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-ui-screen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { SCREEN_LOOKS, measureScreen } from '../../engine/gen/ui-screen.js';
import { UI_MEASURES, measurePiece } from '../../engine/gen/ui-pieces.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const BOX = { at: [1, 1], size: [94, 62] };
const PAINTS = { face: 'face', frame: 'frame', accent: 'accent', reward: 'reward', shine: 'shine' };
const CASES = [
  { args: { ...BOX, ...PAINTS, title: true, badge: 'pause' } },
  { args: { ...BOX, ...PAINTS, look: 'plate', corner: 3, border: 3, title: true, divide: 0.6 } },
  { args: { ...BOX, ...PAINTS, look: 'tube', corner: 4, border: 1, notch: true, fallen: true } },
  { args: { ...BOX, ...PAINTS, runner: true, blink: true }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3, size: [96, 64] } },
  { args: { at: [-20, -12], size: [40, 24], ...PAINTS, look: 'tube', runner: true }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
];

test('ui.screen@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('ui.screen', 1), { cases: CASES });
});

const text = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
/** A call's pixels as a Map "x,y" -> paint (as text), later primitives over earlier ones. */
function pixels(args, ctx = {}) {
  const r = registry.runGenerator({ gen: 'ui.screen', v: 1, ...BOX, ...PAINTS, ...args }, { size: [96, 64], ...ctx });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    if (p.kind === 'rect') { for (let j = 0; j < p.size[1]; j++) for (let i = 0; i < p.size[0]; i++) out.set(`${p.at[0] + i},${p.at[1] + j}`, text(p.paint)); }
    else if (p.kind === 'stamp') p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, text(p.key[ch])); }));
    else assert.fail(`a ${p.kind}: only rects and stamps are expected`);
  }
  return { px: out, count: r.primitives.length, cost: r.cost };
}
const areasOf = (args) => { const m = measureScreen(full(args), { size: [96, 64] }); return [].concat(m.textArea); };
const full = (args) => { const e = registry.generator('ui.screen', 1), a = {}; for (const [k, t] of Object.entries(e.args)) a[k] = t.default; return { ...a, ...BOX, ...PAINTS, ...args }; };
const flags = [{}, { title: true }, { title: true, badge: 'pause' }, { badge: 'pause' }, { title: true, divide: 0.6 }, { divide: 0.6 }, { notch: true, fallen: true }, { runner: true, blink: true }];

test('the looks are the kit\'s three, and the measure is listed', () => {
  assert.deepEqual([...SCREEN_LOOKS], ['blocks', 'plate', 'tube']);
  assert.equal(UI_MEASURES['ui.screen@1'], measureScreen);
  const m = measurePiece(registry.generator('ui.screen', 1), { ...BOX, title: true }, { size: [96, 64] });
  assert.ok(Array.isArray(m.textArea) && m.textArea.length === 2, 'the face and the title strip');
});

test('it stays inside its rectangle, and never returns more than its cost, in every look, border, corner and screen', () => {
  for (const look of SCREEN_LOOKS) for (const border of [1, 2, 3]) for (const corner of [0, 2, 4]) for (const f of flags) for (const t of [0, 0.3, 0.77]) {
    const { px, count, cost } = pixels({ look, border, corner, ...f }, { t, loop: true });
    assert.ok(count <= cost, `${look} b${border} c${corner} ${JSON.stringify(f)}: ${count} primitives, cost ${cost}`);
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 1 && y >= 1 && x <= 94 && y <= 62, `${look}: (${k}) is outside the rectangle`); }
  }
});

test('every text area holds one colour only (the face, or the strip\'s dark tone), in every look, border, corner and screen', () => {
  for (const look of SCREEN_LOOKS) for (const border of [1, 2, 3]) for (const corner of [0, 2, 4]) for (const f of flags) {
    const { px } = pixels({ look, border, corner, ...f }, { t: 0.3, loop: true });
    const areas = areasOf({ look, border, corner, ...f });
    assert.ok(areas.length >= 1);
    areas.forEach((r, n) => {
      assert.ok(r.w >= 8 && r.h >= 6, `${look} b${border} c${corner} ${JSON.stringify(f)}: area ${n} is ${r.w} x ${r.h}`);
      const want = f.title && n === areas.length - 1 ? 'face.dark' : 'face';
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(px.get(`${x},${y}`), want, `${look} b${border} c${corner} ${JSON.stringify(f)}: area ${n} at (${x}, ${y})`);
      assert.ok(r.edge && px.get(`${r.edge.x},${r.edge.y}`)?.startsWith('frame') || JSON.stringify(px.get(`${r.edge.x},${r.edge.y}`)).includes('frame'), 'edge is a pixel of the band');
    });
  }
});

test('results has two areas beside a divider of the frame colour, and the numbers column does not stretch', () => {
  const a = { title: true, divide: 0.6 };
  const [labels, numbers, strip] = areasOf(a);
  assert.equal(labels.x + labels.w + 1, numbers.x, 'one column between them');
  const { px } = pixels(a);
  for (let y = labels.y; y < labels.y + labels.h; y++) assert.equal(px.get(`${numbers.x - 1},${y}`), 'frame');
  assert.ok(strip.y < labels.y);
  const m = measureScreen(full(a), { size: [96, 64] });
  assert.equal(m.slice.right, 96 - (numbers.x - 1));
  assert.ok(m.slice.top >= labels.y, 'the title keeps its height');
});

test('pause: a 13 px badge with two 3 x 9 bars in the top-left block\'s place, outside every text area', () => {
  for (const look of SCREEN_LOOKS) for (const title of [true, false]) {
    const { px } = pixels({ look, title, badge: 'pause' });
    for (let j = 0; j < 9; j++) for (const i of [0, 1, 2, 6, 7, 8]) assert.equal(px.get(`${3 + i},${3 + j}`), 'ink', `${look}: a bar at (${3 + i}, ${3 + j})`);
    for (let j = 0; j < 9; j++) assert.equal(px.get(`${7},${3 + j}`), look === 'blocks' ? 'accent' : 'frame', 'the face between the bars');
    for (const r of areasOf({ look, title, badge: 'pause' })) assert.ok(r.x >= 14 || r.y >= 14, `${look}: an area under the badge`);
    const m = measureScreen(full({ look, title, badge: 'pause' }), { size: [96, 64] });
    assert.ok(m.slice.left >= 14 && m.slice.top >= 14, 'the badge does not stretch');
  }
});

test('game over: the top corner blocks lie beside the bottom ones, and the top band has a 5 px see-through gap', () => {
  const { px } = pixels({ notch: true, fallen: true });
  assert.equal(px.get('3,3'), 'frame', 'no block on the top-left corner');
  for (const x of [1 + 2, 1 + 7, 94 - 2, 94 - 7]) assert.ok(px.get(`${x},59`).startsWith('accent'), `a block at x ${x}`);
  for (const look of SCREEN_LOOKS) for (const border of [1, 2, 3]) {
    const p = pixels({ look, border, notch: true, fallen: true }).px;
    for (let r = 0; r < 1 + border; r++) {
      let gap = 0;
      for (let x = 60; x <= 90; x++) if (!p.has(`${x},${1 + r}`)) gap++;
      assert.equal(gap, 5, `${look} b${border}: row ${r} of the band has a 5 px gap`);
    }
    for (let x = 84; x <= 88; x++) assert.equal(p.get(`${x},${2 + border}`), 'ink', 'the gap has an ink floor');
  }
});

test('record: the light is on every frame and comes back, the corners blink clockwise, plate and tube run the light alone', () => {
  const lit = (t, look = 'blocks') => { const { px } = pixels({ look, runner: true, blink: true }, { t, loop: true, frames: 8 }); return px; };
  const order = [];
  for (let f = 0; f < 8; f++) {
    const px = lit(f / 8);
    assert.ok([...px.values()].filter((v) => v === 'shine').length >= 6, `frame ${f}: the head shows`);
    const corners = [[3, 3], [92, 3], [92, 60], [3, 60]].map(([x, y]) => px.get(`${x},${y}`));
    order.push(corners.findIndex((c) => c.startsWith('reward')));
    assert.equal(corners.filter((c) => c.startsWith('reward')).length, 1, `frame ${f}: one corner is lit`);
  }
  assert.deepEqual(order, [0, 0, 1, 1, 2, 2, 3, 3]);
  for (const look of ['plate', 'tube']) assert.ok(![...lit(0.25, look).values()].some((v) => v.startsWith('reward') || v.startsWith('accent')), `${look}: no blocks`);
  assert.deepEqual([...lit(0)], [...lit(1)], 'the loop closes');
});
