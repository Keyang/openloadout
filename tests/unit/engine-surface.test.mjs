// Shapes on a Surface: pixel counts and edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';

const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);

test('rect fills exactly w x h pixels', () => {
  const g = new Surface(20, 20).rect(2, 3, 5, 4, '#ff0000');
  assert.equal(count(g), 20);
  assert.deepEqual(g.bounds(), { x0: 2, y0: 3, x1: 6, y1: 6 });
});

test('rect is clipped at the surface edge', () => {
  const g = new Surface(10, 10).rect(8, 8, 5, 5, '#fff');
  assert.equal(count(g), 4);
});

test('ellipse of radius 3 x 3 centred on a pixel corner is symmetric', () => {
  const g = new Surface(12, 12).ellipse(6, 6, 3, 3, '#00ff00');
  const n = count(g);
  assert.ok(n > 20 && n < 36, `unexpected pixel count ${n}`);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    assert.equal(!!g.get(x, y), !!g.get(11 - x, y), `not mirrored at ${x},${y}`);
  }
});

test('ellipse with a zero radius draws nothing', () => {
  assert.equal(count(new Surface(8, 8).ellipse(4, 4, 0, 3, '#fff')), 0);
});

test('limb keeps a constant thickness for odd and even widths', () => {
  for (const width of [1, 2, 3, 4]) {
    const g = new Surface(30, 10).limb(5, 5, 25, 5, width, '#fff');
    // a horizontal limb: a middle column is exactly `width` pixels tall
    let col = 0;
    for (let y = 0; y < 10; y++) if (g.get(15, y)) col++;
    assert.equal(col, width, `width ${width}`);
  }
});

test('limb thickness does not change when the end point moves by a fraction', () => {
  const a = new Surface(30, 30).limb(5, 5, 20.0, 20.0, 3, '#fff');
  const b = new Surface(30, 30).limb(5.2, 5.1, 20.3, 20.4, 3, '#fff');
  assert.equal(count(a), count(b));
});

test('outline adds a rim of the outline colour around drawn pixels only', () => {
  const g = new Surface(10, 10).rect(3, 3, 4, 4, '#ff0000');
  const before = count(g);
  g.outline('#000000');
  assert.equal(count(g), before + 16);       // 4 sides x 4 pixels, no corners
  assert.equal(g.get(2, 3), 0xff000000);
  assert.equal(g.get(2, 2), 0);
  const c = new Surface(10, 10).rect(3, 3, 4, 4, '#ff0000').outline('#000', { corners: true });
  assert.equal(count(c), before + 16 + 4);
});

test('blob merges several shapes into one body', async () => {
  const { rectIn } = await import('../../engine/surface.js');
  const g = new Surface(20, 10).blob([rectIn(0, 0, 6, 4), rectIn(4, 0, 6, 4)], '#fff');
  assert.equal(count(g), 10 * 4);
});

test('blob minus cuts a hole', async () => {
  const { rectIn } = await import('../../engine/surface.js');
  const g = new Surface(10, 10).blob([rectIn(0, 0, 10, 10)], '#fff', { minus: [rectIn(2, 2, 3, 3)] });
  assert.equal(count(g), 100 - 9);
});

test('bounds is null on an empty surface', () => {
  assert.equal(new Surface(5, 5).bounds(), null);
});

test('dot ignores out-of-range coordinates and bytes() is RGBA of the right size', () => {
  const g = new Surface(4, 4).dot(-1, 0, '#fff').dot(4, 4, '#fff').dot(1, 2, '#102030');
  assert.equal(count(g), 1);
  const b = g.bytes();
  assert.equal(b.length, 4 * 4 * 4);
  const i = (2 * 4 + 1) * 4;
  assert.deepEqual([...b.slice(i, i + 4)], [0x10, 0x20, 0x30, 255]);
});

test('a ramp paints a dark band on the shadow side', () => {
  const ramp = { base: '#808080', dark: '#202020', light: '#e0e0e0' };
  const g = new Surface(10, 10).rect(2, 2, 6, 6, ramp);
  // shadow falls to the lower left: bottom row and left column are dark, top-right is base
  assert.equal(g.get(2, 7), 0xff202020);
  assert.equal(g.get(7, 2), 0xff808080);
});
