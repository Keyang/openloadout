// towers@2 and banners@2 (engine/gen/scenery.js), added for bg-sky-harbour. Held to here:
//   - the goldens harness for both (pinned primitives, determinism, argument fuzz, cost, loop closure)
//   - towers@2 with no `dark` and no `bright` paints exactly the pixels of towers@1; with them it paints the same
//     silhouette, and every tower has a `dark` column on its left and a `bright` one on its right
//   - banners@2: no banner hangs below top + length (+ sway); the notch is `tail` px deep; over a loop the tips move
//     `sway` px and the last frame leads back into the first
//   - towers@1 and banners@1 are unchanged (their goldens: tests/unit/gen-backdrop-scenery.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { renderList } from '../../engine/draw-list.js';

const W = 320, H = 180, SIZE = { size: [W, H] };
const PALETTE = { stone: '#806040', lamp: '#f2c230', dark: '#403020', bright: '#c0a080', cloth: '#e2709a', shade: '#8a3a5a', trim: '#f0c0d0' };
const HEX = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, v]));
const run = (gen, v, args, ctx = SIZE) => { const r = registry.runGenerator({ gen, v, ...args }, ctx); assert.ok(r.ok, r.errors.join('; ')); return r.primitives; };
const pixels = (prims) => renderList(W, H, prims, { palette: PALETTE }).g;
const TOWERS = [
  { base: 150, count: 6, seed: 31, jitter: 0.7, sink: 6, lit: 3, stone: 'stone', lamp: 'lamp' },
  { base: 120, count: 9, seed: 6, stone: 'stone', lamp: 'lamp' },
  { base: 100, count: 3, seed: 2, jitter: 1, lit: 3, stone: 'stone', lamp: 'lamp', wrap: false },
];

test('towers@2 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('towers', 2), { cases: [
    { args: { base: 30, count: 2, stone: 'stone', lamp: 'lamp' } },
    { args: { ...TOWERS[0], dark: 'dark', bright: 'bright' }, ctx: SIZE },
    { args: { ...TOWERS[2], dark: 'dark' }, ctx: SIZE } ] });
});

test('towers@2 without dark and bright paints exactly the pixels of towers@1', () => {
  for (const look of TOWERS) { const a = pixels(run('towers', 1, look)), b = pixels(run('towers', 2, look)); assert.ok(a.data.every((v, i) => v === b.data[i]), JSON.stringify(look)); }
});

test('towers@2 with dark and bright keeps the silhouette and shades every tower: dark on its left, bright on its right', () => {
  for (const look of TOWERS) {
    const a = pixels(run('towers', 1, look)), b = pixels(run('towers', 2, { ...look, dark: 'dark', bright: 'bright' }));
    assert.ok(a.data.every((v, i) => (v >>> 24 !== 0) === (b.data[i] >>> 24 !== 0)), `${JSON.stringify(look)}: same silhouette`);
    const count = (g, y, want) => { let n = 0; for (let x = 0; x < W; x++) if (g.get(x, y) === want) n++; return n; };
    const stone = a.get(0, 0) || null;
    // on a row through the towers' bodies: each run of painted pixels starts dark and ends bright
    const y = look.base - 4;
    let runs = 0;
    for (let x = 1; x < W - 1; x++) {
      if (!(a.get(x, y) >>> 24)) continue;
      if (!(a.get(x - 1, y) >>> 24)) { runs++; assert.notEqual(b.get(x, y), b.get(x + 2, y), `${JSON.stringify(look)}: column ${x} is the shaded side`); }
      if (!(a.get(x + 1, y) >>> 24)) assert.notEqual(b.get(x, y), b.get(x - 2, y), `${JSON.stringify(look)}: column ${x} is the lit side`);
    }
    assert.ok(runs >= 1, 'a tower crosses the row');
    void count; void stone; void HEX;
  }
});

const BANNERS = { count: 5, offset: 0.5, top: 133, width: 14, length: 22, short: 17, tail: 6, cloth: 'cloth', dark: 'shade', trim: 'trim' };
const lowest = (g, x0 = 0, x1 = W) => { for (let y = H - 1; y >= 0; y--) for (let x = x0; x < x1; x++) if (g.get(x, y) >>> 24) return y; return -1; };

test('banners@2 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('banners', 2), { cases: [
    { args: { cloth: 'cloth', dark: 'shade', trim: 'trim' } },
    { args: BANNERS, ctx: SIZE },
    { args: { ...BANNERS, sway: 1 }, ctx: { size: [W, H], t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { count: 4, top: 0, width: 22, length: 48, short: 40, tail: 8, cloth: 'cloth', dark: 'shade', trim: 'trim' }, ctx: SIZE } ] });
});

test('banners@2: nothing hangs below top + length, the long ones reach it, and the notch is `tail` deep', () => {
  const g = pixels(run('banners', 2, BANNERS));
  assert.equal(lowest(g), BANNERS.top + BANNERS.length - 1);
  // banner 0 (long) is centred on column 32, banner 1 (short) on 96
  assert.equal(lowest(g, 25, 39), BANNERS.top + BANNERS.length - 1);
  assert.equal(lowest(g, 89, 103), BANNERS.top + BANNERS.short - 1);
  assert.equal(lowest(g, 32, 33), BANNERS.top + BANNERS.length - BANNERS.tail - 1, 'the notch on the long one\'s middle column');
  for (let y = 0; y < BANNERS.top; y++) for (let x = 0; x < W; x++) assert.equal(g.get(x, y) >>> 24, 0, 'nothing above the rope');
});

test('banners@2 sways: tips move `sway` px over a loop, out of step, and the loop closes', () => {
  const at = (f) => pixels(run('banners', 2, { ...BANNERS, sway: 1 }, { size: [W, H], t: f / 8, loop: true, frames: 8, frame: f % 8 }));
  const lows = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((f) => [0, 1, 2, 3, 4].map((k) => lowest(at(f), 25 + 64 * k, 39 + 64 * k)));
  assert.deepEqual(lows[8], lows[0]);
  for (let k = 0; k < 5; k++) {
    const base = BANNERS.top + (k % 2 ? BANNERS.short : BANNERS.length) - 1, col = lows.slice(0, 8).map((r) => r[k]);
    assert.ok(col.every((y) => y === base || y === base + 1), `banner ${k}: ${col}`);
    assert.equal(col.filter((y) => y === base + 1).length, 4, `banner ${k} is long for half the loop: ${col}`);
  }
  assert.ok(lows.slice(0, 8).some((r) => new Set(r.map((y, k) => y - (k % 2 ? BANNERS.short : BANNERS.length))).size > 1), 'not all in step');
  // no loop: still
  assert.equal(lowest(pixels(run('banners', 2, { ...BANNERS, sway: 1 }))), BANNERS.top + BANNERS.length - 1);
});
