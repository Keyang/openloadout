// The whirling ring of sparks (engine/gen/fx-spin.js, family "fx"): spark.swirl@1, the flourish over a piece spun into
// a tight slot (bundles/specs/kit-puzzle-gridline.md, `spin-sparkle`: the look the code sprite drew with spinRing,
// spinTrails, chips, sparkMark and sparkFlash; none was carried over, so it is written from the specification and the
// reviewed renders). It is pinned by the goldens harness; the tests after it hold what the specification asks.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-spin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { SWIRL_MARKS } from '../../engine/gen/fx-spin.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const FIVE = ['shine', 'core', 'mid', 'edge', 'rim'];
const ONE = (frame, frames = 10) => ({ t: frame / (frames - 1), loop: false, frames, frame, size: [48, 48], clip: 'burst' });

test('spark.swirl@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('spark.swirl', 1), { cases: [
    { args: { at: [24, 24], paints: FIVE } },
    { args: { at: [24, 24], count: 6, r0: 6, r1: 18, turn: 0.5, mark: 'square', size: 4, core: 3, paints: FIVE }, ctx: ONE(3) },
    { args: { at: [24, 24], count: 8, r0: 6.7, r1: 20.2, turn: 0.75, mark: 'star', size: 4, core: 4, paints: FIVE }, ctx: ONE(5) },
    { args: { at: [24, 24], count: 4, r0: 4.8, r1: 14.4, turn: 0.25, mark: 'arc', size: 3, core: 2, paints: FIVE }, ctx: ONE(1) },
    { args: { at: [0, 0], count: 5, mark: 'arc', trails: 0, paints: ['core', 'edge'] }, ctx: ONE(7) },
    { args: { at: [24, 24], count: 6, mark: 'star', paints: FIVE }, ctx: ONE(9) },
  ] });
});

// ---- what the specification asks -----------------------------------------------------------------------------------

/** A call's rects as a map "x,y" -> paint, at a frame of the ten-frame burst. */
function pixels(more = {}, frame = 0, frames = 10) {
  const r = registry.runGenerator({ gen: 'spark.swirl', v: 1, at: [24, 24], paints: FIVE, ...more }, ONE(frame, frames));
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'rect');
    assert.ok([...p.at, ...p.size].every(Number.isInteger), 'whole pixels only');
    for (let j = 0; j < p.size[1]; j++) for (let i = 0; i < p.size[0]; i++) out.set(`${p.at[0] + i},${p.at[1] + j}`, p.paint);
  }
  return out;
}
const box = (px) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
/** The separate blobs of touching pixels (corners count), each a list of [x, y]. */
function blobs(px) {
  const left = new Set(px.keys()), out = [];
  for (const k of px.keys()) {
    if (!left.has(k)) continue;
    const blob = [], todo = [k];
    left.delete(k);
    while (todo.length) {
      const [x, y] = todo.pop().split(',').map(Number);
      blob.push([x, y]);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const n = `${x + i},${y + j}`; if (left.has(n)) { left.delete(n); todo.push(n); } }
    }
    out.push(blob);
  }
  return out;
}

test('the marks are the specification\'s styles', () => {
  assert.deepEqual([...SWIRL_MARKS], ['square', 'star', 'arc']);
});

test('frame 0 is the white core alone, 6 px across at the default, the same on every side', () => {
  for (const mark of SWIRL_MARKS) for (const core of [2, 3, 4]) {
    const px = pixels({ mark, core }, 0), b = box(px);
    assert.equal(blobs(px).length, 1, `${mark}: one piece`);
    assert.equal(px.get('23,23'), 'shine'); assert.equal(px.get('24,24'), 'shine');
    assert.equal(b.x0 + b.x1, 47, `${mark}: centred across`); assert.equal(b.y0 + b.y1, 47, `${mark}: centred down`);
    assert.equal(b.w, b.h);
    for (const [k, paint] of px) { const [x, y] = k.split(',').map(Number); assert.equal(px.get(`${47 - x},${y}`), paint, 'mirrored'); assert.equal(px.get(`${x},${47 - y}`), paint, 'mirrored'); }
    if (mark === 'square') {
      const lit = [...px].filter(([, p]) => p !== 'edge').length;
      assert.equal(lit, (2 * core) ** 2, `the core is ${2 * core} px across inside its line`);
    }
  }
});

test('the ring widens from r0 to r1 (its marks shrink, so its box may lose a few pixels late); the core is gone by frame 3', () => {
  for (const mark of SWIRL_MARKS) {
    let last = 0;
    for (let f = 3; f <= 9; f++) {
      const px = pixels({ mark, trails: 0 }, f), b = box(px);
      assert.ok(!px.has('23,23') && !px.has('24,24'), `${mark}: the middle is empty at frame ${f}`);
      assert.ok(b.w >= last - 4, `${mark}: widens (frame ${f}: ${b.w} after ${last})`);
      last = b.w;
    }
    const end = box(pixels({ mark }, 9));
    assert.ok(end.w >= 34 && end.w <= 38, `${mark}: about 18 px out at the end (${end.w})`);
  }
});

test('the last frame keeps each spark as a 2 x 2, evenly round the ring', () => {
  for (const mark of SWIRL_MARKS) for (const count of [4, 5, 6, 7, 8]) for (const turn of [0.25, 0.5, 0.75]) {
    const px = pixels({ mark, count, turn }, 9), bl = blobs(px);
    assert.equal(bl.length, count, `${mark} ${count}: one blob a spark`);
    for (const blob of bl) {
      assert.equal(blob.length, 4);
      const b = box(new Map(blob.map(([x, y]) => [`${x},${y}`, 1])));
      assert.equal(b.w, 2); assert.equal(b.h, 2);
    }
  }
});

test('every spark shows as its own mark on every ring frame, and all stay within the room', () => {
  for (const mark of SWIRL_MARKS) for (const count of [4, 6, 8]) for (const [r0, r1, size, core] of [[4.8, 14.4, 3, 2], [6, 18, 4, 3], [6.7, 20.2, 5, 4]]) {
    for (let f = 0; f <= 9; f++) {
      const px = pixels({ mark, count, r0, r1, size, core, turn: 0.75 }, f), b = box(px);
      assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 46 && b.y1 <= 46, `${mark} ${count} frame ${f}: inside the 48 px frame's border (${JSON.stringify(b)})`);
      assert.ok(px.size >= 4, 'never empty');
      if (f >= 4) assert.ok(blobs(pixels({ mark, count, r0, r1, size, core, turn: 0.75, trails: 0 }, f)).length >= count, `${mark} ${count} frame ${f}: the sparks are apart`);
    }
  }
});

test('turn: the ring goes farther round with more of it', () => {
  const where = (turn) => { const px = pixels({ count: 4, turn, mark: 'square' }, 9); return [...px.keys()].sort().join(' '); };
  assert.notEqual(where(0.25), where(0.375));
  assert.equal(where(0), where(0.25), 'a quarter turn puts four sparks where they began');
});

test('trails: short arcs behind some sparks in the middle of the clip, none on the first ring frames or the last', () => {
  for (const mark of SWIRL_MARKS) {
    const more = (f) => pixels({ mark, trails: 2 }, f).size - pixels({ mark, trails: 0 }, f).size;
    assert.equal(more(1), 0); assert.equal(more(9), 0);
    assert.ok(more(4) >= 6 && more(4) <= 20, `${mark}: two short arcs at frame 4 (${more(4)} px)`);
  }
});

test('it draws the same on a node at its origin as in frame pixels', () => {
  for (const mark of SWIRL_MARKS) for (const f of [0, 2, 5, 9]) {
    const a = pixels({ mark }, f), b = pixels({ mark, at: [0, 0] }, f);
    assert.equal(a.size, b.size);
    for (const [k, paint] of b) { const [x, y] = k.split(',').map(Number); assert.equal(a.get(`${x + 24},${y + 24}`), paint); }
  }
});
