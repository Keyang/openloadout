import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { skinButton, skinPanel } from '../../engine/ui-skins.js';
import { CANDY_CUTS, candyCuts, roundSlab, candyStyle, candyBubble, candySprinkles, candyStripe, unionInked } from '../../engine/ui-candy-slab.js';

const FACE = '#7a4f33', FRAME = '#f0ead8';
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const KEEP = { x: 8, y: 8, w: 80, h: 16 };
const button = (border = 0.5, corner = 0.75) => {
  const g = new Surface(96, 32);
  const out = skinButton(g, 1, 1, 94, 30, 'normal', 'candy', { face: FACE, frame: FRAME, style: 'jelly', border, cornerPx: 0 });
  const slab = roundSlab(g, out.body, candyCuts(corner), { below: 2, bottomCuts: candyCuts(corner, 3) });
  return { g, out, slab };
};

test('candyCuts runs from square to round and respects a row limit', () => {
  assert.deepEqual(candyCuts(0), []);
  assert.deepEqual(candyCuts(0.75), [5, 3, 2, 1]);
  assert.equal(candyCuts(1), CANDY_CUTS.at(-1));
  assert.ok(candyCuts(1, 3).length <= 3 && candyCuts(0.75, 3)[0] >= 3);
});

test('roundSlab at corner 0.75 removes 3 px or more along each edge of every corner', () => {
  const { g } = button();
  const firstX = (y) => { for (let x = 0; x < 96; x++) if (g.get(x, y)) return x; return -1; };
  const lastX = (y) => { for (let x = 95; x >= 0; x--) if (g.get(x, y)) return x; return -1; };
  assert.ok(firstX(1) >= 1 + 3 && lastX(1) <= 94 - 3, 'top row');
  for (const y of [1, 2, 3]) assert.equal(g.get(1, y), 0, `left column row ${y}`);
  assert.ok(firstX(30) >= 1 + 3, 'lip bottom row');
});

test('roundSlab keeps the outline inked and the middle untouched', () => {
  const plain = new Surface(96, 32);
  skinButton(plain, 1, 1, 94, 30, 'normal', 'candy', { face: FACE, frame: FRAME, style: 'jelly', cornerPx: 0 });
  const { g, slab } = button();
  for (let y = 8; y < 24; y++) for (let x = 8; x < 88; x++) assert.equal(g.get(x, y), plain.get(x, y));
  assert.equal(g.get(48, 1), col(INK));
  assert.equal(slab.rings, 4);
});

test('candyStyle: the three styles differ from each other by 12 px or more; jelly is 2 px deep', () => {
  const look = {};
  for (const st of ['jelly', 'striped', 'frosted']) {
    const { g, slab } = button();
    candyStyle(g, slab, st, { keep: KEEP, stripe: candyStripe(FRAME), glossHi: '#b79f76', glossLo: '#9b7a57', icing: '#f9f7e3' });
    look[st] = g;
  }
  assert.ok(diff(look.jelly, look.striped) >= 12 && diff(look.jelly, look.frosted) >= 12 && diff(look.striped, look.frosted) >= 12);
  assert.equal(look.jelly.get(48, 4), col('#b79f76'));
  assert.equal(look.jelly.get(48, 5), col('#9b7a57'));
});

test('candyBubble changes 12 px or more at every border, outside the stretched middle', () => {
  for (const border of [0, 0.5, 1]) {
    const { g, slab } = button(border);
    const before = g.data.slice();
    const n = candyBubble(g, slab, { keep: KEEP, white: '#ffffff', soft: '#b79f76' });
    assert.ok(n >= 12, `border ${border}: ${n}`);
    for (let i = 0; i < before.length; i++) if (before[i] !== g.data[i]) {
      const x = i % 96, y = (i - x) / 96;
      assert.ok(x >= 88 && y < 8, `bubble pixel at ${x},${y}`);
    }
  }
});

test('candySprinkles draws 8 or more two-pixel sprinkles in the band, and tiled sides repeat', () => {
  const g = new Surface(96, 64);
  const out = skinPanel(g, 1, 1, 94, 62, 'candy', { face: FACE, frame: FRAME, style: 'jelly', cornerPx: 0 });
  const slab = roundSlab(g, out.body, candyCuts(0.75));
  const keep = { x: 8, y: 8, w: 80, h: 48 };
  const before = g.clone ? g.clone() : Object.assign(new Surface(96, 64), { data: g.data.slice() });
  const n = candySprinkles(g, slab, { colors: ['#4fd8ee', '#1788c6'], keep });
  assert.ok(n >= 8);
  let moved = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 96; x++) if (g.get(x, y) !== before.get(x, y)) {
    moved++;
    const d = slab.at(x, y);
    assert.ok(d >= 2 && d < slab.rings, `sprinkle pixel ${x},${y} off the band`);
  }
  assert.equal(moved, 2 * n);
  for (let x = 8; x < 72; x++) for (let y = 0; y < 64; y++) assert.equal(g.get(x, y), g.get(x + 16, y));
});

test('unionInked keeps sugar over ink and ink only outside', () => {
  const a = new Surface(4, 1), b = new Surface(4, 1), g = new Surface(4, 1);
  a.dot(0, 0, INK); a.dot(1, 0, '#ffffff'); b.dot(1, 0, INK); b.dot(2, 0, INK);
  unionInked(g, [b, a]);
  assert.deepEqual([...g.data], [col(INK), col('#ffffff'), col(INK), 0]);
});
