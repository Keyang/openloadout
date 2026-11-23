// cloud@2 (engine/gen/backdrop.js): cloud@1's cloud, pixel for pixel, in polygons kept to the cloud's own columns, and
// with `sway`: a slide there and back over a looping clip that closes. Held to here:
//   - the goldens harness (pinned primitives, determinism, argument fuzz, cost, loop closure)
//   - with sway 0 it paints exactly the pixels cloud@1 paints, wrapping or not, under band or not
//   - no polygon reaches outside the cloud's columns (cloud@1's start at column 0 and end at the frame's right edge,
//     so one cloud written in a layer asked up to 5% of a frame's work budget): its work is a tenth of cloud@1's or less
//   - sway moves it whole px there and back at a steady pace: never further than `sway`, at most 1 px a frame at
//     sway 3 over 8 frames (every seed 0 to 63), and the last frame leads back into the first (t = 1 draws as t = 0)
//   - cloud@1 is unchanged (its golden: tests/unit/gen-backdrop-goldens.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { renderList, costOf } from '../../engine/draw-list.js';

const W = 320, H = 180, SIZE = { size: [W, H] };
const PALETTE = { puff: '#f0ead8', belly: '#9fb4c8' };
const run = (v, args, ctx = SIZE) => { const r = registry.runGenerator({ gen: 'cloud', v, ...args }, ctx); assert.ok(r.ok, r.errors.join('; ')); return r.primitives; };
const pixels = (prims) => renderList(W, H, prims, { palette: PALETTE }).g;
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const left = (g) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (g.get(x, y) >>> 24) return x; return -1; };
const LOOKS = [
  { at: [176, 94], size: 40, vary: 0, seed: 11, paint: 'puff', under: 'belly', wrap: false },
  { at: [40, 52], size: 44, vary: 0.4, seed: 3, paint: 'puff', wrap: false },
  { at: [310, 60], size: 56, seed: 7, paint: 'puff', under: 'belly', wrap: true },
  { at: [4, 120], size: 30, seed: 2, paint: 'puff', under: 'belly', wrap: true },
  { at: [300, 30], size: 60, seed: 9, paint: 'puff', under: 'belly', wrap: false },
];

test('cloud@2 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('cloud', 2), { cases: [
    { args: { at: [16, 16], paint: 'puff' } },
    { args: { at: [176, 94], size: 40, vary: 0, seed: 11, paint: 'puff', under: 'belly', wrap: false }, ctx: SIZE },
    { args: { at: [310, 60], size: 56, seed: 7, paint: 'puff', under: 'belly', wrap: true }, ctx: SIZE },
    { args: { at: [98, 62], size: 28, vary: 0, seed: 7, sway: 3, paint: 'puff', under: 'belly', wrap: false }, ctx: { size: [W, H], t: 0.375, loop: true, frames: 8, frame: 3 } } ] });
});

test('cloud@2 at sway 0 paints exactly the pixels of cloud@1', () => {
  for (const look of LOOKS) assert.ok(same(pixels(run(1, look)), pixels(run(2, look))), JSON.stringify(look));
});

test('cloud@2 keeps every polygon to the cloud\'s own columns, at a tenth of the work of cloud@1 or less', () => {
  for (const look of LOOKS.filter((l) => !l.wrap)) {
    const one = run(1, look), two = run(2, look);
    const g = pixels(two), x0 = left(g);
    let x1 = x0; for (let x = x0; x < W; x++) for (let y = 0; y < H; y++) if (g.get(x, y) >>> 24) x1 = x;
    for (const p of two) for (const [x] of p.points) assert.ok(x >= x0 && x <= x1 + 1, `${JSON.stringify(look.at)}: a point at column ${x} outside ${x0}..${x1 + 1}`);
    const work = (list) => list.reduce((n, p) => n + costOf(p, W, H), 0);
    assert.ok(work(two) * 10 <= work(one), `${JSON.stringify(look.at)}: ${work(two)} against ${work(one)}`);
  }
});

test('cloud@2 sways there and back over a loop: whole px, never past `sway`, 1 px a frame at most, closing', () => {
  const look = { at: [98, 62], size: 28, vary: 0, seed: 7, sway: 3, paint: 'puff', under: 'belly', wrap: false };
  const still = left(pixels(run(2, { ...look, sway: 0 })));
  for (let seed = 0; seed < 64; seed++) {
    const xs = [];
    for (let f = 0; f <= 8; f++) xs.push(left(pixels(run(2, { ...look, seed }, { size: [W, H], t: f / 8, loop: true, frames: 8, frame: f % 8 }))) - left(pixels(run(2, { ...look, seed, sway: 0 }))));
    assert.equal(xs[8], xs[0], `seed ${seed}: t = 1 draws as t = 0 (${xs})`);
    assert.ok(xs.every((d) => d >= 0 && d <= 3), `seed ${seed}: within its sway (${xs})`);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 2, `seed ${seed}: it moves (${xs})`);
    for (let f = 1; f <= 8; f++) assert.ok(Math.abs(xs[f] - xs[f - 1]) <= 1, `seed ${seed}: no jump between frames ${f - 1} and ${f} (${xs})`);
  }
  // not in a loop, or with no clip phase, it stays at its place
  assert.equal(left(pixels(run(2, look))), still);
  // a negative sway slides the other way
  const back = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => left(pixels(run(2, { ...look, sway: -3 }, { size: [W, H], t: f / 8, loop: true, frames: 8, frame: f }))) - still);
  assert.ok(back.every((d) => d <= 0 && d >= -3) && Math.min(...back) <= -2, `${back}`);
});
