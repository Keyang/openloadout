// chip.burst@2 (engine/gen/fx-chips.js, family "fx"): chip.burst@1 with three more arguments, for the Gridline kit's
// big clear burst (bundles/specs/kit-puzzle-gridline.md, `quad-burst`): `block` "chips" shows the chips already split
// into a tight grid before they fly (so `count` shows from the first frame and nothing pops), `square` sends them to a
// square instead of a round ring, and `keep` stops them cooling short of the last paints, so the last frame stays
// bright. Pinned by the goldens harness. To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-chips-grid.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const HOT = ['shine', 'core', 'mid', 'edge', 'edge', 'rim'];
const ONE = (frame, frames = 12) => ({ t: frame / (frames - 1), loop: false, frames, frame, size: [96, 96], clip: 'burst' });

test('chip.burst@2 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('chip.burst', 2), { cases: [
    { args: { at: [48, 48], paints: HOT } },
    { args: { at: [48, 48], block: 'chips', count: 12, size: 5, dist: 26, begin: 0.3, room: 47, paints: HOT }, ctx: ONE(1) },
    { args: { at: [48, 48], block: 'chips', count: 16, size: 5, dist: 26, begin: 0.3, room: 47, paints: HOT }, ctx: ONE(3) },
    { args: { at: [48, 48], block: 'chips', count: 8, size: 4, dist: 26, square: 1, keep: 1, begin: 0.3, room: 47, paints: HOT }, ctx: ONE(6) },
    { args: { at: [0, 0], block: 'chips', count: 12, size: 6, dist: 30, square: 1, keep: 1, gravity: 2, begin: 0.3, room: 47, paints: HOT }, ctx: ONE(11) },
    { args: { at: [16, 16], side: 12, count: 5, size: 5, mark: 'spark', dist: 11, square: 0.5, begin: 0.1428, paints: HOT }, ctx: ONE(4) },
  ] });
});

function rects(call, ctx) {
  const r = registry.runGenerator(call, ctx);
  assert.ok(r.ok, r.errors.join('; '));
  for (const p of r.primitives) assert.equal(p.kind, 'rect', 'only rects: whole pixels, never turned');
  return r.primitives.map((p) => ({ x: p.at[0], y: p.at[1], w: p.size[0], h: p.size[1], paint: p.paint }));
}
function pixels(list) {
  const m = new Map();
  for (const r of list) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) m.set(`${x},${y}`, r.paint);
  return m;
}
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
const keys = (m) => [...m.keys()].sort().join(' ');

const BURST = { gen: 'chip.burst', v: 2, at: [48, 48], block: 'chips', size: 5, dist: 26, begin: 0.3, room: 47, paints: HOT };

test('chip.burst@2: block "chips" shows `count` separate chips in a tight grid before it splits, white first, then core with a rim L', () => {
  for (const count of [8, 12, 16]) for (const size of [4, 5, 6]) {
    const first = pixels(rects({ ...BURST, count, size }, ONE(1)));
    const bs = blobs(first);
    assert.equal(bs.length, count, `${count} chips of ${size} px on frame 1`);
    for (const b of bs) { assert.equal(b.length, size * size); assert.equal(span(b, 0), size); }
    assert.deepEqual([...new Set(first.values())], ['shine']);
    const third = pixels(rects({ ...BURST, count, size }, ONE(3)));
    assert.equal(keys(third), keys(first), 'the grid does not move before it splits');
    assert.deepEqual([...new Set(third.values())].sort(), ['core', 'rim']);
  }
  const few = pixels(rects({ ...BURST, count: 8 }, ONE(2))), many = pixels(rects({ ...BURST, count: 16 }, ONE(2)));
  assert.ok(many.size - few.size >= 100, 'the Chips slider shows before the chips fly');
});

test('chip.burst@2: the chips fly from where the grid lay, so nothing pops when it splits', () => {
  for (const count of [8, 12, 16]) {
    const grid = pixels(rects({ ...BURST, count }, ONE(3)));
    const split = pixels(rects({ ...BURST, count, begin: 3 / 11 }, ONE(3)));
    assert.equal(keys(split), keys(grid));
  }
});

test('chip.burst@2: block "whole" is the whole square of chip.burst@1', () => {
  const m = pixels(rects({ ...BURST, block: 'whole', side: 14 }, ONE(1)));
  assert.equal(m.size, 14 * 14);
  assert.equal(blobs(m).length, 1);
});

test('chip.burst@2: square 1 sends the chips to a square `dist` px from the middle, square 0 to a round ring', () => {
  const mid = (b, i) => (Math.min(...b.map((p) => p[i])) + Math.max(...b.map((p) => p[i])) + 1) / 2 - 48;
  for (const count of [8, 12, 16]) {
    const sq = blobs(pixels(rects({ ...BURST, count, gravity: 0, square: 1 }, ONE(11))));
    assert.equal(sq.length, count);
    for (const b of sq) { const far = Math.max(Math.abs(mid(b, 0)), Math.abs(mid(b, 1))); assert.ok(far >= 25 && far <= 29.5, `a chip ${far} px out along its longer way`); }
    const round = blobs(pixels(rects({ ...BURST, count, gravity: 0, square: 0 }, ONE(11))));
    for (const b of round) { const far = Math.hypot(mid(b, 0), mid(b, 1)); assert.ok(far >= 25 && far <= 29.5, `a chip ${far} px out`); }
  }
});

test('chip.burst@2: keep 1 ends every chip as a 2 x 2 of the last paint but one with one rim pixel; keep 0 as chip.burst@1, all rim', () => {
  for (const count of [8, 12, 16]) {
    const m = pixels(rects({ ...BURST, count, keep: 1, square: 1 }, ONE(11)));
    const bs = blobs(m);
    assert.equal(bs.length, count);
    for (const b of bs) {
      assert.equal(b.length, 4); assert.equal(span(b, 0), 2); assert.equal(span(b, 1), 2);
      const paints = b.map(([x, y]) => m.get(`${x},${y}`)).sort();
      assert.deepEqual(paints, ['edge', 'edge', 'edge', 'rim']);
    }
    const cold = pixels(rects({ ...BURST, count, keep: 0 }, ONE(11)));
    assert.deepEqual([...new Set(cold.values())], ['rim']);
  }
});

// just after the split (frames 4 to 6 of 12) chips from the inside of a big grid may still touch by a corner, as in chip.burst@1
test('chip.burst@2: the chips are apart in the grid and once they have flown, and keep inside `room` at every frame, count and reach', () => {
  for (const count of [8, 10, 12, 13, 16]) for (const dist of [19, 26, 36]) for (const size of [4, 5, 6]) for (let frame = 1; frame < 12; frame++) {
    const m = pixels(rects({ ...BURST, count, dist, size, square: 1, keep: 1, gravity: 2 }, ONE(frame)));
    if (frame <= 3 || frame >= 7) assert.equal(blobs(m).length, count, `x${count} dist ${dist} size ${size}, frame ${frame}`);
    for (const [k] of m) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 1 && x <= 94 && y >= 1 && y <= 94, `a pixel at ${k} is outside the room`); }
  }
});
