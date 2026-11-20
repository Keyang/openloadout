// The landing effects of a dropped piece (engine/gen/fx-drop.js, family "fx"): light.columns@1, upright lines of light
// standing on a row that shorten from the top, and drop.motes@1, square motes sliding apart along a row. They are the look
// the Gridline kit's drop-streak drew in code (bundles/specs/kit-puzzle-gridline.md, `drop-streak`), now generators.
// Both are pinned by the goldens harness (tests/helpers/gen-harness.mjs); the tests after it hold what the
// specification asks. To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-drop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { COLUMN_STYLES } from '../../engine/gen/fx-drop.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const FIVE = ['shine', 'core', 'mid', 'edge', 'rim'];
const CASES = {
  'light.columns@1': [
    { args: { at: [32, 62], paints: FIVE } },
    { args: { at: [32, 62], count: 5, span: 60, height: 56, style: 'blocks', paints: FIVE }, ctx: { t: 0.4, loop: false, frames: 6, frame: 2 } },
    { args: { at: [0, 0], count: 2, span: 16, height: 40, style: 'dashes', seed: 7, paints: ['core', 'edge.light', 'edge'] }, ctx: { t: 0.8, loop: false, frames: 6, frame: 4 } },
    { args: { at: [10.5, 30], count: 1, height: 12, thick: 2, paints: ['core'] }, ctx: { t: 1, loop: false, frames: 6, frame: 5 } },
  ],
  'drop.motes@1': [
    { args: { at: [32, 62], paints: FIVE } },
    { args: { at: [32, 62], count: 5, reach: 10, paints: FIVE }, ctx: { t: 0.6, loop: false, frames: 6, frame: 3 } },
    { args: { at: [0, 0], count: 1, reach: 4, rise: 0, keep: 0, paints: ['core', 'edge'] }, ctx: { t: 0.2, loop: false, frames: 6, frame: 1 } },
    { args: { at: [20, 20], count: 3, keep: 2, paints: FIVE }, ctx: { t: 1, loop: false, frames: 6, frame: 5 } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

// ---- what they draw ------------------------------------------------------------------------------------------------

/** A call's rects as a map "x,y" -> paint, at phase t of a one-shot. */
function pixels(call, t = 0) {
  const r = registry.runGenerator(call, { t, loop: false, size: [64, 64] });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'rect');
    assert.ok(Number.isInteger(p.at[0]) && Number.isInteger(p.at[1]) && Number.isInteger(p.size[0]) && Number.isInteger(p.size[1]), 'whole pixels only');
    for (let j = 0; j < p.size[1]; j++) for (let i = 0; i < p.size[0]; i++) out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.paint));
  }
  return out;
}
const box = (px) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const columnsOf = (px) => new Set([...px.keys()].map((k) => Number(k.split(',')[0])));
/** How many separate runs of neighbouring columns are lit. */
const runs = (px) => { const xs = [...columnsOf(px)].sort((a, b) => a - b); return xs.filter((x, i) => i === 0 || x !== xs[i - 1] + 1).length; };
const cols = (more = {}, t = 0) => pixels({ gen: 'light.columns', v: 1, at: [32, 62], paints: FIVE, ...more }, t);
const dust = (more = {}, t = 0) => pixels({ gen: 'drop.motes', v: 1, at: [32, 62], paints: FIVE, ...more }, t);

test('the column styles are the specification\'s', () => {
  assert.deepEqual([...COLUMN_STYLES], ['lines', 'dashes', 'blocks']);
});

test('columns stand on the row, the tallest as tall as asked, spread over the span, hottest at the foot', () => {
  for (const count of [2, 3, 4, 5]) for (const span of [16, 38, 60]) for (const height of [40, 48, 56]) {
    const px = cols({ count, span, height });
    const b = box(px);
    assert.equal(b.y1, 62, 'the lowest lit row is the landing row');
    assert.equal(b.h, height, `count ${count} span ${span}: the tallest is ${height} px`);
    assert.ok(b.w <= span && b.w >= span - 2, `count ${count} span ${span}: spread over the span (${b.w})`);
    assert.equal(runs(px), count, `count ${count} span ${span}: ${count} separate streaks`);
    assert.ok(b.x0 >= 1 && b.x1 <= 62, 'inside a 64 px frame with its border');
    for (const [k, paint] of px) if (k.endsWith(',62')) assert.equal(paint, '"shine"', 'the foot is the hottest paint');
  }
});

test('columns shorten from the top and thin; the last frame keeps a 2 px tip at the foot of each', () => {
  for (const style of COLUMN_STYLES) for (const count of [2, 5]) {
    let last = Infinity;
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const b = box(cols({ style, count, span: 60, height: 56 }, t));
      assert.equal(b.y1, 62, `${style}: stays on the row at t ${t}`);
      assert.ok(b.h <= last, `${style}: never grows (t ${t})`);
      last = b.h;
    }
    const end = cols({ style, count, span: 60, height: 56 }, 1);
    assert.equal(box(end).h, 2, `${style}: a 2 px tip`);
    assert.equal(runs(end), count, `${style}: a tip for each`);
    assert.equal(end.size, count * 4, `${style}: each tip is 2 x 2`);
  }
  // at the smallest setting a streak still spans a third of a 64 px frame in half of six frames (style guide section 4)
  for (const style of COLUMN_STYLES) {
    const tall = [0, 0.2, 0.4, 0.6, 0.8, 1].filter((t) => box(cols({ style, count: 2, span: 16, height: 40 }, t)).h >= 22).length;
    assert.ok(tall >= 3, `${style}: ${tall} of 6 frames span a third`);
  }
});

test('dashes are 3 px with gaps, blocks are squares as wide as the streak; lines are unbroken', () => {
  const column = (style) => { const px = cols({ style, count: 2, span: 60, height: 56 }); const x = box(px).x1; return Array.from({ length: 56 }, (_, h) => px.has(`${x},${62 - h}`)); };
  assert.ok(column('lines').every(Boolean), 'lines: no gap');
  const lit = (rows) => rows.join('').replaceAll('true', '1').replaceAll('false', '0');
  assert.ok(lit(column('dashes')).startsWith('1110011100111'), 'dashes: 3 lit, 2 dark');
  assert.ok(lit(column('blocks')).startsWith('111100111100'), 'blocks: 4 lit, 2 dark');
});

test('drop.motes: a row of 2x2 and 3x3 squares on the row, half each side, sliding apart and rising; four 2x2 are left', () => {
  for (const count of [2, 3, 5]) {
    const start = dust({ count, reach: 10 });
    assert.equal(box(start).y1, 62, 'on the row');
    assert.ok(box(start).h <= 3);
    assert.equal(runs(start), 2 * count, `${count} a side, none touching`);
    let width = 0;
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const b = box(dust({ count, reach: 10 }, t));
      if (t <= 0.6) assert.ok(b.w >= width, `spreads (t ${t})`);
      assert.ok(b.x0 >= 1 && b.x1 <= 62, `inside a 64 px frame with its border (t ${t}: ${b.x0}..${b.x1})`);
      width = b.w;
    }
    const end = dust({ count, reach: 10 }, 1);
    assert.equal(end.size, 16, 'four 2x2 motes at the end');
    assert.equal(runs(end), 4);
    assert.equal(box(end).y1, 60, 'risen 2 px');
  }
});

test('both draw the same on a node at its origin as in frame pixels (rects only, nothing cut at 0)', () => {
  for (const gen of ['light.columns', 'drop.motes']) {
    const a = pixels({ gen, v: 1, at: [32, 62], paints: FIVE }, 0.4), b = pixels({ gen, v: 1, at: [0, 0], paints: FIVE }, 0.4);
    assert.equal(a.size, b.size);
    for (const [k, paint] of b) { const [x, y] = k.split(',').map(Number); assert.equal(a.get(`${x + 32},${y + 62}`), paint); }
  }
});
