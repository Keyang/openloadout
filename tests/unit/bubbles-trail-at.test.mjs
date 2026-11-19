// engine/bubbles.js, thoughtBubble's `trailAt` (added with sprite batch K24, emote-bubbles: a 'down' trail under the
// balloon's left quarter, middle or right quarter).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { thoughtBubble, THOUGHT_STYLES } from '../../engine/bubbles.js';

const P = PALETTE.thornwood;
const PAPER = { face: P.cream, frame: P.cavern };
const AT = ['middle', 'left', 'right'];
const draw = (w, h, opt) => { const g = new Surface(w, h); const out = thoughtBubble(g, 1, 1, w - 2, h - 2, { ...PAPER, ...opt }); return { g, out }; };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const only = (g, r, colour) => {
  const want = col(colour);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (g.get(x, y) !== want) return false;
  return true;
};
// the sizes the emote balloons draw (body 22 to 24 wide, 20 to 21 tall, plus 3 px round it and 6 below) and a big one
const SIZES = [[28, 29], [30, 30], [96, 48]];

test('trailAt middle is the default: the same pixels as leaving it out', () => {
  for (const style of THOUGHT_STYLES) for (const [w, h] of SIZES) for (const border of [0, 1]) {
    const a = draw(w, h, { style, trail: 'down', border, tight: true });
    const b = draw(w, h, { style, trail: 'down', border, tight: true, trailAt: 'middle' });
    assert.ok(same(a.g, b.g), `${style} ${w}x${h}`);
    assert.deepEqual(a.out, b.out);
  }
});

test('the tip is the lowest drawn pixel, drawn in the face, inside the frame; three places, three pictures', () => {
  for (const style of THOUGHT_STYLES) for (const [w, h] of SIZES) for (const shadow of [false, true]) {
    const pics = new Set();
    for (const trailAt of AT) {
      const { g, out } = draw(w, h, { style, trail: 'down', trailAt, shadow, border: 0, tight: true });
      const what = `${style} ${w}x${h} ${trailAt} shadow ${shadow}`;
      assert.equal(g.get(out.tip.x, out.tip.y), col(PAPER.face), `${what}: the smallest puff's centre is face`);
      const bb = g.bounds();
      assert.ok(bb.x0 >= 1 && bb.y0 >= 1 && bb.x1 <= w - 2 && bb.y1 <= h - 2, `${what}: nothing on the frame's border`);
      if (!shadow) {
        // the tip's puff (2 px, inked) is the lowest thing drawn: its centre is one row above the ink under it
        assert.equal(out.tip.y + 1, bb.y1, `${what}: the tip is outermost downwards`);
      }
      const B = out.body, mid = B.x + B.w / 2;
      if (trailAt === 'left') assert.ok(out.tip.x < mid - B.w / 8, `${what}: left of the middle`);
      if (trailAt === 'right') assert.ok(out.tip.x > mid + B.w / 8, `${what}: right of the middle`);
      // the trail runs out from under its quarter: on a small body its last puff reaches into the 3 px pad beside it
      assert.ok(out.tip.x >= B.x - 3 && out.tip.x < B.x + B.w + 3, `${what}: under the body or its pad`);
      assert.ok(only(g, out.inner, PAPER.face), `${what}: inner holds only the face`);
      pics.add([...g.data].join(','));
    }
    assert.equal(pics.size, 3, `${style} ${w}x${h}: three different pictures`);
  }
});

test('left is right mirrored: the trail rows under the body are mirror images', () => {
  for (const style of THOUGHT_STYLES) for (const [w, h] of SIZES) {
    const L = draw(w, h, { style, trail: 'down', trailAt: 'left', border: 0, tight: true });
    const R = draw(w, h, { style, trail: 'down', trailAt: 'right', border: 0, tight: true });
    const B = L.out.body, axis2 = 2 * B.x + B.w - 1;   // pixel x mirrors to axis2 - x
    for (let y = B.y + B.h + 1; y < h; y++) for (let x = 0; x < w; x++) {
      const mx = axis2 - x;
      if (mx < 0 || mx >= w) { assert.equal(L.g.get(x, y), 0); continue; }
      assert.equal(L.g.get(x, y), R.g.get(mx, y), `${style} ${w}x${h} at ${x},${y}`);
    }
    // the smallest puff is 2 px wide and its tip is its right-hand pixel, so the mirrored tip sits 1 px to the right
    assert.equal(L.out.tip.x - 1, axis2 - R.out.tip.x, 'the tips mirror too');
  }
});

test('trailAt refuses an unknown place; the same arguments give the same pixels', () => {
  assert.throws(() => draw(30, 30, { trail: 'down', trailAt: 'centre' }), /trailAt "centre" is not one of middle, left, right/);
  for (const trailAt of AT) assert.ok(same(draw(30, 30, { trail: 'down', trailAt }).g, draw(30, 30, { trail: 'down', trailAt }).g));
});
