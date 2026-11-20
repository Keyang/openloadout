// Square chips and the checker (engine/gen/fx-chips.js, family "fx"): what a cleared block cell of a falling-block
// puzzle turns into (bundles/specs/kit-puzzle-gridline.md, `cell-burst`: the look the specification's "chips" helper and
// the sprite's own checker drew; neither was carried over, so these are written from the specification and the
// reviewed renders). chip.burst@1 and checker.fade@1 are pinned by the goldens harness; the tests after it hold what
// the specification asks. To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-chips.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const HOT = ['shine', 'core', 'edge', 'edge', 'rim'];
const ONE = (frame, frames = 8) => ({ t: frame / (frames - 1), loop: false, frames, frame, size: [32, 32], clip: 'burst' });

const CASES = {
  'chip.burst@1': [
    { args: { at: [16, 16], paints: HOT } },
    { args: { at: [16, 16], side: 12, count: 6, size: 4, dist: 11, begin: 0.1428, paints: HOT }, ctx: ONE(1) },
    { args: { at: [16, 16], side: 14, count: 8, size: 5, dist: 14, begin: 0.1428, paints: HOT }, ctx: ONE(4) },
    { args: { at: [16, 16], count: 5, size: 5, mark: 'spark', dist: 11, begin: 0.1428, paints: HOT }, ctx: ONE(2) },
    { args: { at: [0, 0], count: 4, size: 5, mark: 'ring', dist: 8, seed: 9, begin: 0.1428, paints: ['core', 'edge'] }, ctx: ONE(6) },
    { args: { at: [16, 16], count: 7, size: 3, dist: 14, gravity: 2, begin: 0.1428, paints: HOT }, ctx: ONE(7) },
  ],
  'checker.fade@1': [
    { args: { at: [16, 16], paints: ['shine', 'core', 'edge', 'rim'] } },
    { args: { at: [16, 16], cells: 6, paints: ['shine', 'core', 'edge', 'rim'] }, ctx: ONE(2, 6) },
    { args: { at: [0, 0], cells: 8, unit: 2, paints: ['shine', 'core', 'edge', 'rim'] }, ctx: ONE(4, 6) },
    { args: { at: [16, 16], cells: 7, keep: 4, paints: ['shine', 'core', 'edge', 'rim'] }, ctx: ONE(5, 6) },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

// ---- what the specification asks -----------------------------------------------------------------------------------

/** The rects of a call at a frame, each { x, y, w, h, paint }. */
function rects(call, ctx) {
  const r = registry.runGenerator(call, ctx);
  assert.ok(r.ok, r.errors.join('; '));
  for (const p of r.primitives) assert.equal(p.kind, 'rect', 'only rects: whole pixels, never turned');
  return r.primitives.map((p) => ({ x: p.at[0], y: p.at[1], w: p.size[0], h: p.size[1], paint: p.paint }));
}
/** The pixels rects cover, as a Map "x,y" -> paint (later rects on top). */
function pixels(list) {
  const m = new Map();
  for (const r of list) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) m.set(`${x},${y}`, r.paint);
  return m;
}
/** The separate blobs of a pixel map (pixels that touch by a side or a corner are one blob), each a list of [x, y]. */
function blobs(m) {
  const seen = new Set(), out = [];
  for (const k of m.keys()) {
    if (seen.has(k)) continue;
    const blob = [], todo = [k];
    seen.add(k);
    while (todo.length) {
      const [x, y] = todo.pop().split(',').map(Number);
      blob.push([x, y]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = `${x + dx},${y + dy}`; if (m.has(n) && !seen.has(n)) { seen.add(n); todo.push(n); } }
    }
    out.push(blob);
  }
  return out;
}
const span = (blob, i) => Math.max(...blob.map((p) => p[i])) - Math.min(...blob.map((p) => p[i])) + 1;

const BURST = { gen: 'chip.burst', v: 1, at: [16, 16], begin: 0.1428, paints: HOT };

test('chip.burst@1: before it splits it is one whole square, `side` px a side, centred on `at`: white, a line of core, a line of edge', () => {
  for (const side of [10, 12, 14]) {
    const m = pixels(rects({ ...BURST, side }, ONE(0)));
    assert.equal(m.size, side * side);
    const a = 16 - side / 2;
    assert.equal(m.get(`${a},${a}`), 'edge');
    assert.equal(m.get(`${a + 1},${a + 1}`), 'core');
    assert.equal(m.get(`${a + 2},${a + 2}`), 'shine');
    assert.equal(m.get('16,16'), 'shine');
    assert.ok(!m.has(`${a - 1},${a}`) && !m.has(`${a + side},${a}`));
  }
});

test('chip.burst@1: it splits into `count` chips that never touch, fly out from the middle and shrink to 2 x 2, kept inside `room`', () => {
  for (const mark of ['square', 'spark', 'ring']) for (const count of [4, 5, 6, 7, 8]) for (const dist of [8, 11, 14]) for (const size of [3, 4, 5]) {
    if (mark !== 'square' && size !== 5) continue;
    let reach = 0;
    for (let frame = 1; frame < 8; frame++) {
      const m = pixels(rects({ ...BURST, mark, count, dist, size, side: 12 }, ONE(frame)));
      const bs = blobs(m);
      assert.equal(bs.length, count, `${mark} x${count} dist ${dist} size ${size}, frame ${frame}: ${bs.length} separate chips`);
      for (const [k] of m) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 1 && x <= 30 && y >= 1 && y <= 30, `a pixel at ${k} is outside the room`); }
      const mid = (b, i) => (Math.min(...b.map((p) => p[i])) + Math.max(...b.map((p) => p[i])) + 1) / 2;
      const far = Math.max(...bs.map((b) => Math.hypot(mid(b, 0) - 16, mid(b, 1) - 16)));
      assert.ok(far >= reach - 1.5, `${mark} x${count}, frame ${frame}: the chips come back in (${far} after ${reach})`);
      reach = Math.max(reach, far);
      if (frame === 7) for (const b of bs) { assert.equal(b.length, 4, 'the last frame keeps each chip as a 2 x 2'); assert.equal(span(b, 0), 2); assert.equal(span(b, 1), 2); }
    }
  }
});

test('chip.burst@1: square chips step down a pixel at a time (4, 3, 2), cool from white through the edge colour to the rim, and carry a rim L while 3 px or more', () => {
  const sides = [], bodies = [];
  for (let frame = 1; frame < 8; frame++) {
    const m = pixels(rects({ ...BURST, count: 6, size: 4, dist: 11 }, ONE(frame)));
    const b = blobs(m)[0];
    sides.push(span(b, 0));
    assert.equal(span(b, 0), span(b, 1), 'a chip is square');
    const x1 = Math.max(...b.map((p) => p[0])), y0 = Math.min(...b.map((p) => p[1])), x0 = Math.min(...b.map((p) => p[0])), y1 = Math.max(...b.map((p) => p[1]));
    bodies.push(m.get(`${x1},${y0}`));
    if (span(b, 0) >= 3) assert.equal(m.get(`${x0},${y1}`), 'rim', `frame ${frame}: the corner away from the light is the rim`);
  }
  assert.deepEqual(sides, [4, 4, 3, 3, 3, 2, 2]);
  assert.deepEqual(bodies, ['shine', 'core', 'core', 'edge', 'edge', 'edge', 'rim']);
});

test('chip.burst@1: sparks are pluses with a hotter middle and rings are hollow, 5 px then smaller', () => {
  const spark = pixels(rects({ ...BURST, mark: 'spark', count: 4, size: 5, dist: 11 }, ONE(3)));
  for (const b of blobs(spark)) { assert.equal(b.length, 9); assert.equal(span(b, 0), 5); assert.equal(span(b, 1), 5); }
  assert.deepEqual([...new Set(spark.values())].sort(), ['core', 'shine']);
  const ring = pixels(rects({ ...BURST, mark: 'ring', count: 4, size: 5, dist: 11 }, ONE(3)));
  for (const b of blobs(ring)) { assert.equal(b.length, 12); assert.equal(span(b, 0), 5); }
  const small = pixels(rects({ ...BURST, mark: 'ring', count: 4, size: 5, dist: 11 }, ONE(6)));
  for (const b of blobs(small)) { assert.equal(b.length, 8); assert.equal(span(b, 0), 4); }
});

const FADE = { gen: 'checker.fade', v: 1, at: [16, 16], paints: ['shine', 'core', 'edge', 'rim'] };

test('checker.fade@1: a checker of 2 x 2 squares that blinks out from the top row down and ends as `keep` squares in the bottom row', () => {
  for (const cells of [6, 7, 8]) {
    const first = pixels(rects({ ...FADE, cells }, ONE(0, 6)));
    assert.equal(first.size, 4 * cells * cells, 'the first frame is the whole cell');
    assert.deepEqual([...new Set(first.values())].sort(), ['edge', 'shine']);
    const x0 = 16 - cells;
    assert.equal(first.get(`${x0},${x0}`), 'shine');
    assert.equal(first.get(`${x0 + 2},${x0}`), 'edge');
    let top = x0, n = first.size;
    for (let frame = 1; frame < 6; frame++) {
      const m = pixels(rects({ ...FADE, cells }, ONE(frame, 6)));
      const y = Math.min(...[...m.keys()].map((k) => Number(k.split(',')[1])));
      assert.ok(y >= top, `frame ${frame}: the top row comes down`);
      assert.ok(m.size < n, `frame ${frame}: fewer squares`);
      top = y; n = m.size;
    }
    const last = pixels(rects({ ...FADE, cells }, ONE(5, 6)));
    const bs = blobs(last);
    assert.equal(bs.length, 4);
    for (const b of bs) { assert.equal(b.length, 4); assert.equal(Math.min(...b.map((p) => p[1])), x0 + 2 * (cells - 1)); }
    assert.deepEqual([...new Set(last.values())], ['rim']);
  }
});
