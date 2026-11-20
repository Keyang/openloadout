// The square ring and the grid rays (engine/gen/fx-quad.js, family "fx"): square.ring@1, a square ring of light that
// opens from one size to another with a block cell at each corner, and ray.lines@1, rays on the straight and slanted
// lines of a grid. They are the look the Gridline kit's big clear burst drew in code
// (bundles/specs/kit-puzzle-gridline.md, `quad-burst`: squareRing, rays and blockCell; the code helpers were never
// carried over, so these are written from the specification and the reviewed renders). Both are pinned by the goldens
// harness; the tests after it hold what the specification asks.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-quad.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { STAMP_BOUNDS, SIZE_KEYS } from '../../engine/gen/index.js';
import { stampPixels } from '../../engine/gen/args.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const FIVE = ['shine', 'core', 'mid', 'edge', 'rim'];
const CTX = { t: 0.5, loop: false, frames: 12, frame: 5, size: [96, 96], clip: 'burst' };

const CASES = {
  'square.ring@1': [
    { args: { at: [48, 48], paints: FIVE } },
    { args: { at: [48, 48], from: [39, 5], to: [39, 39], open: 0, thick: 5, room: 47, paints: FIVE } },
    { args: { at: [48, 48], from: [39, 5], to: [39, 39], open: 0.68, thick: 4, room: 47, paints: FIVE } },
    { args: { at: [48, 48], from: [39, 5], to: [39, 39], open: 1.75, grow: 4, thick: 2, cool: 3, gaps: 0.6, room: 47, paints: FIVE } },
    { args: { at: [48, 48], from: [0, 0], to: [47, 47], open: 0.62, thick: 4, weight: 1.3, cell: 6, cellPaint: 'edge', room: 47, paints: FIVE } },
    { args: { at: [0, 0], from: [0, 0], to: [47, 47], open: 1, thick: 0, cell: 8, cellPaint: 'edge', cellStyle: 'gem', room: 47, paints: ['core', 'edge'] } },
  ],
  'ray.lines@1': [
    { args: { at: [48, 48], paints: FIVE } },
    { args: { at: [48, 48], reach: 30, r0: 0.26, r1: 0.95, room: 47, paints: FIVE } },
    { args: { at: [48, 48], reach: 30, r0: 0.34, r1: 1.08, cool: 1, dash: 4, gap: 3, phase: 0.5, room: 47, paints: FIVE } },
    { args: { at: [0, 0], reach: 20, r0: 0.4, r1: 0.6, cool: 3, slanted: false, room: 15, paints: ['core', 'edge'] } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

// ---- what the specification asks -----------------------------------------------------------------------------------

/** A call's rects as a map "x,y" -> paint (later rects on top), and its stamps. */
function drawn(call) {
  const r = registry.runGenerator(call, CTX);
  assert.ok(r.ok, r.errors.join('; '));
  const px = new Map(), stamps = [];
  for (const p of r.primitives) {
    if (p.kind === 'stamp') { stamps.push(p); continue; }
    assert.equal(p.kind, 'rect', 'only rects and the cells\' stamps');
    assert.ok([...p.at, ...p.size].every(Number.isInteger), 'whole pixels only');
    assert.ok(p.size[0] > 0 && p.size[1] > 0, 'no empty rect');
    for (let j = 0; j < p.size[1]; j++) for (let i = 0; i < p.size[0]; i++) px.set(`${p.at[0] + i},${p.at[1] + j}`, p.paint);
  }
  return { px, stamps };
}
const box = (px) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const RING = { gen: 'square.ring', v: 1, at: [48, 48], from: [40, 5], to: [40, 40], room: 47, paints: FIVE };
const RAYS = { gen: 'ray.lines', v: 1, at: [48, 48], reach: 30, room: 47, paints: FIVE };

test('square.ring@1: shut, it is a filled bar 80 x 10 across the middle, white inside a line of the core and a rim', () => {
  const { px } = drawn({ ...RING, open: 0, thick: 5 });
  const b = box(px);
  assert.deepEqual([b.w, b.h, b.x0, b.y0], [80, 10, 8, 43]);
  assert.equal(px.size, 800, 'filled: no hole');
  assert.equal(px.get('8,43'), 'rim');
  assert.equal(px.get('9,44'), 'core');
  assert.equal(px.get('48,48'), 'shine');
});

test('square.ring@1: open, it is a square ring with an empty middle; past open 1 it grows by `grow`', () => {
  const { px } = drawn({ ...RING, open: 1, thick: 4 });
  const b = box(px);
  assert.deepEqual([b.w, b.h], [80, 80]);
  assert.equal(px.has('48,48'), false, 'the middle is empty');
  assert.equal(px.get('8,48'), 'rim', 'a rim outside');
  assert.equal(px.get('11,48'), 'shine', 'the hottest paint inside');
  assert.equal(px.has('12,48'), false, '4 px thick');
  assert.equal(box(drawn({ ...RING, open: 2, grow: 4, thick: 2 }).px).w, 88);
  assert.equal(box(drawn({ ...RING, open: 2, grow: 30, thick: 2 }).px).w, 94, 'never past `room`');
});

test('square.ring@1: `cool` drops the hottest paints, `weight` scales the thickness, `thick` 0 draws no ring', () => {
  const cold = drawn({ ...RING, open: 1, thick: 2, cool: 3 }).px;
  assert.deepEqual([...new Set(cold.values())], ['edge']);
  assert.equal(drawn({ ...RING, open: 1, thick: 4, weight: 1.5 }).px.has('13,48'), true);
  assert.equal(drawn({ ...RING, open: 1, thick: 0 }).px.size, 0);
});

test('square.ring@1: `gaps` breaks the sides into dashes, the same on facing sides and mirrored, and keeps the corners', () => {
  const whole = drawn({ ...RING, open: 1, thick: 1, cool: 3 }).px;
  const cut = drawn({ ...RING, open: 1, thick: 1, cool: 3, gaps: 0.6 }).px;
  assert.ok(cut.size < whole.size * 0.75 && cut.size > 24, `${cut.size} of ${whole.size}`);
  for (const k of ['8,8', '87,8', '8,87', '87,87']) assert.ok(cut.has(k), `corner ${k}`);
  for (const k of cut.keys()) {
    const [x, y] = k.split(',').map(Number);
    assert.ok(cut.has(`${95 - x},${y}`) && cut.has(`${x},${95 - y}`), `mirrored at ${k}`);
  }
});

test('square.ring@1: a block cell rides each corner, kept inside `room`, and stays when the ring has gone', () => {
  const { stamps, px } = drawn({ ...RING, from: [0, 0], to: [47, 47], open: 1, thick: 0, cell: 6, cellPaint: 'edge' });
  assert.equal(px.size, 0);
  assert.equal(stamps.length, 4);
  assert.deepEqual(stamps.map((s) => s.at.join(',')).sort(), ['1,1', '1,89', '89,1', '89,89']);
  for (const s of stamps) assert.deepEqual([s.rows.length, s.rows[0].length], [6, 6]);
  const mid = drawn({ ...RING, from: [0, 0], to: [47, 47], open: 0.5, thick: 3, cell: 6, cellPaint: 'edge' }).stamps;
  assert.deepEqual(mid.map((s) => s.at.join(',')).sort(), ['21,21', '21,69', '69,21', '69,69'], 'centred on the ring\'s corners');
  const call = { ...RING, cell: 8, cellPaint: 'edge' };
  const filled = registry.checkCall(call);
  assert.ok(filled.ok, filled.errors.join('; '));
  assert.ok(stampPixels(registry.runGenerator(call, CTX).primitives) <= STAMP_BOUNDS['square.ring@1']({ ...call, cellStyle: 'bevel', cellEdge: 1 }, [96, 96]));
});

test('ray.lines@1: eight rays 2 px across, mirrored each way, hottest at the inner end, none in the middle', () => {
  const { px } = drawn({ ...RAYS, r0: 0.3, r1: 1 });
  assert.equal(px.has('48,48'), false);
  for (const k of px.keys()) {
    const [x, y] = k.split(',').map(Number);
    assert.ok(px.has(`${95 - x},${y}`) && px.has(`${x},${95 - y}`), `mirrored at ${k}`);
  }
  assert.ok(px.has('57,47') && px.has('57,48') && !px.has('57,46') && !px.has('57,49'), 'the ray to the right is two rows');
  assert.ok(px.has('57,57') && px.has('57,56'), 'a slanted ray');
  assert.equal(px.get('57,48'), 'shine');
  assert.equal(px.get('77,48'), 'edge', 'the tip is the coolest but the rim');
  assert.equal(box(px).x1, 77, 'r1 x reach');
  assert.equal(drawn({ ...RAYS, r0: 0.3, r1: 1, slanted: false }).px.has('57,57'), false);
});

test('ray.lines@1: `gap` dashes them, `phase` slides the dashes out, `cool` drops paints, r1 at or under r0 draws nothing', () => {
  const whole = drawn({ ...RAYS, r0: 0.3, r1: 1 }).px, dashed = drawn({ ...RAYS, r0: 0.3, r1: 1, dash: 4, gap: 3 }).px;
  assert.ok(dashed.size < whole.size * 0.7 && dashed.size > whole.size * 0.4, `${dashed.size} of ${whole.size}`);
  const moved = drawn({ ...RAYS, r0: 0.3, r1: 1, dash: 4, gap: 3, phase: 0.5 }).px;
  assert.notDeepEqual([...moved.keys()].sort(), [...dashed.keys()].sort());
  assert.deepEqual([...new Set(drawn({ ...RAYS, r0: 0.3, r1: 1, cool: 3 }).px.values())], ['edge']);
  assert.equal(drawn({ ...RAYS, r0: 0.5, r1: 0.5 }).px.size, 0);
  assert.ok(box(drawn({ ...RAYS, r0: 0.3, r1: 1.5, reach: 60 }).px).x1 <= 94, 'kept inside `room`');
});

test('both have a stamp bound and size keys their cost does not read', () => {
  for (const key of Object.keys(CASES)) {
    assert.equal(typeof STAMP_BOUNDS[key], 'function', key);
    assert.deepEqual([...SIZE_KEYS[key]], [], key);
  }
});
