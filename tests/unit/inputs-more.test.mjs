// engine/inputs-more.js: a key's lit rim and click rays, beside engine/inputs.js (core-sprites-2, batch K15).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp } from '../../engine/color.js';
import { keyCap } from '../../engine/inputs.js';
import { keyBevel, clickRays, RAY_SIDES } from '../../engine/inputs-more.js';

const TOP = '#f0ead8', SIDE = '#5d6475', GLOW = '#f2c230';
const opaque = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const v = col(hex); return g.data.reduce((n, p) => n + (p === v ? 1 : 0), 0); };
const cells = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) out.push([x, y]); return out; };

for (const corner of [0, 0.5, 1]) for (const [w, h, depth] of [[20, 18, 1], [24, 22, 2], [26, 24, 3], [58, 22, 2]]) {
  test(`keyBevel ${w}x${h} corner ${corner}: repaints only the top face and leaves its text area one colour`, () => {
    const a = new Surface(64, 32), b = new Surface(64, 32);
    keyCap(a, 2, 4, w, h, { top: TOP, side: SIDE, corner, depth });
    const { top, text } = keyCap(b, 2, 4, w, h, { top: TOP, side: SIDE, corner, depth });
    keyBevel(b, top, { colour: TOP, corner });
    assert.equal(opaque(a), opaque(b), 'no pixel added or removed');
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      if (a.get(x, y) === b.get(x, y)) continue;
      assert.ok(x >= top.x && x < top.x + top.w && y >= top.y && y < top.y + top.h, `changed ${x},${y} outside the top face`);
    }
    for (let y = text.y; y < text.y + text.h; y++) for (let x = text.x; x < text.x + text.w; x++) assert.equal(b.get(x, y), col(TOP), `text area pixel ${x},${y}`);
    const R = ramp(TOP);
    assert.ok(count(b, R.light) >= w - 4, 'a lit top row');
    assert.ok(count(b, R.dark) >= w - 4, 'a shaded bottom row');
  });
}

test('keyBevel with a pressed key follows the moved top face', () => {
  const g = new Surface(32, 32);
  const { top } = keyCap(g, 4, 5, 24, 22, { top: TOP, side: SIDE, depth: 2, down: true });
  keyBevel(g, top, { colour: TOP });
  assert.equal(g.get(16, top.y), col(ramp(TOP).light));
  assert.equal(g.get(16, top.y + top.h - 1), col(ramp(TOP).dark));
});

test('RAY_SIDES lists the three fans and is frozen', () => {
  assert.deepEqual([...RAY_SIDES], ['left', 'right', 'up']);
  assert.ok(Object.isFrozen(RAY_SIDES));
});

test('clickRays draws three rays of len px, all in the colour, none on the start pixel', () => {
  for (const side of RAY_SIDES) for (const len of [2, 3, 4]) {
    const g = new Surface(32, 32); clickRays(g, 16, 16, { side, len, colour: GLOW });
    assert.equal(count(g, GLOW), 3 * len, `${side} ${len}`);
    assert.equal(g.get(16, 16), 0);
    assert.ok(cells(g).every(([, y]) => y <= 16), `${side}: nothing below the start`);
  }
});

test('clickRays: right is left mirrored to the pixel', () => {
  const a = new Surface(33, 33), b = new Surface(33, 33);
  clickRays(a, 16, 16, { side: 'left', len: 3, colour: GLOW });
  clickRays(b, 16, 16, { side: 'right', len: 3, colour: GLOW });
  for (let y = 0; y < 33; y++) for (let x = 0; x < 33; x++) assert.equal(a.get(x, y), b.get(32 - x, y));
});

test('clickRays: phase moves the rays out and shortens them, never below one pixel each', () => {
  const at = (phase) => { const g = new Surface(32, 32); clickRays(g, 16, 16, { side: 'up', len: 3, colour: GLOW, phase }); return g; };
  const near = (g) => Math.min(...cells(g).map(([x, y]) => Math.max(Math.abs(x - 16), Math.abs(y - 16))));
  assert.ok(near(at(1)) > near(at(0)));
  assert.ok(count(at(1), GLOW) < count(at(0), GLOW));
  assert.ok(count(at(1), GLOW) >= 3);
});

test('clickRays keeps inside its box', () => {
  const g = new Surface(32, 32); clickRays(g, 3, 3, { side: 'left', len: 4, colour: GLOW, box: [1, 1, 31, 31] });
  assert.ok(cells(g).every(([x, y]) => x >= 1 && y >= 1));
  assert.ok(cells(g).length > 0);
});
