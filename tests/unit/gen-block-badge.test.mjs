// The block badge (engine/gen/block-badge.js): the Gridline title emblem's cells and the line of light round them
// (bundles/specs/kit-puzzle-gridline.md, `gridline-emblem`). block.badge@1 and block.badgeRim@1 are pinned by the
// goldens harness (tests/helpers/gen-harness.mjs); the tests after it hold what the specification asks of the emblem.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-block-badge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { BADGE_SHAPES, badgeSize } from '../../engine/gen/block-badge.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const SEVEN = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
const CASES = {
  'block.badge@1': [
    { args: { at: [48, 32], paints: SEVEN } },
    { args: { at: [0, 0], shape: 'arrow', cell: 6, style: 'gem', paints: SEVEN, flash: 'shine', play: 'build', room: 10 }, ctx: { t: 3 / 11, loop: false, frames: 12, frame: 3 } },
    { args: { at: [48, 32], shape: 'stairs', cell: 10, style: 'glass', paints: ['body', 'body.light'], flash: 'shine', play: 'shine' }, ctx: { t: 3 / 7, loop: false, frames: 8, frame: 3 } },
    { args: { at: [20, 20], shape: 'ring', cell: 8, style: 'frame', edge: 1, paints: SEVEN, flash: 'shine', play: 'build', room: 4 }, ctx: { t: 6 / 11, loop: false, frames: 12, frame: 6 } },
  ],
  'block.badgeRim@1': [
    { args: { at: [48, 32], paint: 'glow', shine: 'shine' } },
    { args: { at: [0, 0], shape: 'arrow', cell: 6, paint: 'glow', shine: 'shine', play: 'round' }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [48, 32], shape: 'stairs', cell: 10, outline: false, paint: 'glow', shine: 'shine', play: 'round' }, ctx: { t: 0.75, loop: true, frames: 8, frame: 6 } },
    { args: { at: [20, 20], shape: 'ring', paint: 'glow', shine: 'shine', play: 'build' }, ctx: { t: 9 / 11, loop: false, frames: 12, frame: 9 } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

// ---- what the emblem is ----------------------------------------------------------------------------------------------

/** A call's output as { "x,y": paint (as text) }, later primitives over earlier ones. */
function pixels(call, ctx = {}) {
  const r = registry.runGenerator(call, { size: [96, 64], ...ctx });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    if (p.kind === 'rect') { for (let j = 0; j < p.size[1]; j++) for (let i = 0; i < p.size[0]; i++) out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.paint)); continue; }
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
  }
  return out;
}
const box = (px) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const badge = (more = {}, ctx) => pixels({ gen: 'block.badge', v: 1, at: [48, 32], paints: SEVEN, flash: 'shine', ...more }, ctx);
const rim = (more = {}, ctx) => pixels({ gen: 'block.badgeRim', v: 1, at: [48, 32], paint: 'glow', shine: 'shine', ...more }, ctx);
const build = (f) => ({ t: f / 11, loop: false, frames: 12, frame: f });
const shine = (f) => ({ t: f / 7, loop: false, frames: 8, frame: f });

test('the shapes have the specification\'s cells', () => {
  assert.deepEqual([...BADGE_SHAPES], ['diamond', 'arrow', 'stairs', 'ring']);
  assert.deepEqual(BADGE_SHAPES.map((s) => badgeSize(s)), [{ cols: 5, rows: 5, cells: 12 }, { cols: 7, rows: 5, cells: 19 }, { cols: 8, rows: 4, cells: 20 }, { cols: 5, rows: 5, cells: 17 }]);
});

test('the cells fill the shape\'s box round the middle, and each is a block.cell@2', () => {
  for (const shape of BADGE_SHAPES) for (const cell of [6, 8, 10]) {
    const s = badgeSize(shape), px = badge({ shape, cell }), b = box(px);
    assert.deepEqual([b.w, b.h], [s.cols * cell, s.rows * cell], `${shape} at ${cell}`);
    assert.deepEqual([b.x0, b.y0], [48 - (s.cols * cell) / 2, 32 - (s.rows * cell) / 2], `${shape} at ${cell} is centred`);
    assert.equal(px.size, s.cells * cell * cell, `${shape} at ${cell}: every cell whole, none over another`);
  }
  const r = registry.runGenerator({ gen: 'block.badge', v: 1, at: [48, 32], shape: 'diamond', cell: 8, style: 'gem', paints: SEVEN }, {});
  const one = registry.runGenerator({ gen: 'block.cell', v: 2, at: r.primitives[0].at, size: 8, style: 'gem', paint: 'c1' }, {});
  assert.deepEqual(r.primitives[0], one.primitives[0]);
});

test('with the outline the box is 4 px wider and taller than the cells, and fits 96x64 with the light at every place', () => {
  for (const shape of BADGE_SHAPES) for (const cell of [6, 8, 10]) {
    const s = badgeSize(shape), b = box(rim({ shape, cell, play: 'none' }));
    assert.deepEqual([b.w, b.h], [s.cols * cell + 4, s.rows * cell + 4], `${shape} at ${cell}`);
    for (let f = 0; f < 8; f++) for (const outline of [true, false]) {
      const lit = box(rim({ shape, cell, outline, play: 'round' }, { t: f / 8, loop: true, frames: 8, frame: f }));
      assert.ok(lit.x0 >= 1 && lit.x1 <= 94 && lit.y0 >= 3 && lit.y1 <= 60, `${shape} at ${cell}, frame ${f}: the light keeps a 1 px border with 2 px of bob`);
    }
  }
});

test('the two lines are closed, lie outside the cells and leave a hole in the middle empty', () => {
  for (const shape of BADGE_SHAPES) {
    const cells = badge({ shape }), line = rim({ shape, play: 'none' });
    for (const k of line.keys()) assert.ok(!cells.has(k), `${shape}: (${k}) of the outline lies on a cell`);
    const inks = [...line.values()].filter((v) => v === '"ink"').length, glows = [...line.values()].filter((v) => v === '"glow"').length;
    assert.ok(inks > glows && glows > 0 && inks - glows === 8, `${shape}: the outer line is 8 px longer than the inner one (${inks}, ${glows})`);
  }
  assert.ok(!rim({ shape: 'diamond', play: 'none' }).has('48,32'), 'the diamond\'s empty middle has no line');
});

test('the light runs once round and closes; with no outline only the light is drawn', () => {
  const at = (f) => rim({ play: 'round' }, { t: f / 8, loop: true, frames: 8, frame: f });
  const differ = (a, b) => { let n = 0; for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) n++; return n; };
  for (let f = 0; f < 8; f++) assert.ok(differ(at(f), at((f + 1) % 8)) >= 12, `frames ${f} and ${(f + 1) % 8} differ`);
  assert.equal(differ(at(0), rim({ play: 'rest' })), 0, 'rest is the loop\'s first frame');
  const bare = rim({ outline: false });
  assert.ok(bare.size > 10 && bare.size < 40);
  assert.ok(![...bare.values()].includes('"ink"'));
});

test('build: the bottom row first, two lots landing in a flash on frames 3 and 7, the outline closing on 9 and 10', () => {
  for (const shape of BADGE_SHAPES) {
    const s = badgeSize(shape), whole = badge({ shape });
    const first = box(badge({ shape, play: 'build' }, build(0)));
    assert.equal(first.h, 8, `${shape}: frame 0 is the bottom row`);
    assert.equal(first.y1, 32 + (s.rows * 8) / 2 - 1);
    for (const f of [3, 7]) assert.ok([...badge({ shape, play: 'build' }, build(f)).values()].includes('"shine"'), `${shape}: a flash on frame ${f}`);
    for (const f of [0, 1, 2, 4, 5, 6, 8, 9, 10, 11]) assert.ok(![...badge({ shape, play: 'build' }, build(f)).values()].includes('"shine"'), `${shape}: no flash on frame ${f}`);
    for (const f of [8, 9, 10, 11]) assert.deepEqual(badge({ shape, play: 'build' }, build(f)), whole, `${shape}: whole from frame 8`);
    for (let f = 0; f < 9; f++) assert.equal(rim({ shape, play: 'build' }, build(f)).size, 0, `${shape}: no outline on frame ${f}`);
    const half = rim({ shape, play: 'build' }, build(9)).size, full = rim({ shape, play: 'build' }, build(10)).size;
    assert.ok(half > 0 && half < full);
    assert.deepEqual(rim({ shape, play: 'build' }, build(11)), rim({ shape }), `${shape}: the last frame is the badge at rest`);
  }
});

test('a dropping cell is never more than `room` above its place', () => {
  for (const room of [0, 3, 11]) for (let f = 0; f < 12; f++) {
    const b = box(badge({ cell: 8, play: 'build', room }, build(f)));
    assert.ok(b.y0 >= 12 - room, `room ${room}, frame ${f}: top at ${b.y0}`);
  }
});

test('shine: a band crosses the cells left to right on frames 0 to 6, in each cell\'s own light tone mixed towards the flash', () => {
  const whole = badge({});
  let last = -Infinity;
  for (let f = 0; f < 7; f++) {
    const px = badge({ play: 'shine' }, shine(f)), lit = [...px.entries()].filter(([k, v]) => whole.get(k) !== v);
    assert.ok(lit.length >= 6, `frame ${f}: the band shows (${lit.length} px)`);
    for (const [, v] of lit) { const rule = JSON.parse(v); assert.equal(rule.rule, 'mix'); assert.equal(rule.with, 'shine'); assert.equal(rule.amount, 0.5); }
    const mean = lit.reduce((s, [k]) => s + Number(k.split(',')[0]) + Number(k.split(',')[1]), 0) / lit.length;
    assert.ok(mean > last, `frame ${f}: the band moves on`);
    last = mean;
  }
  assert.deepEqual(badge({ play: 'shine' }, shine(7)), whole, 'the last frame is the badge at rest');
});
