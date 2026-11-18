// Framework addition of batch S07, fix round 1 (scout-drone):
//   engine/surface.js   blitInside   pastes a layer moved by the least shift that keeps its picture clear of the frame's sides
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, blitInside } from '../../engine/surface.js';

const layer = (x, y, w, h, c = '#c2c9d6') => { const s = new Surface(48, 48); s.rect(x, y, w, h, c); return s; };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

test('blitInside: a layer that already fits is pasted where it is, exactly as blit does', () => {
  const src = layer(10, 12, 20, 15), a = new Surface(48, 48), b = new Surface(48, 48);
  assert.deepEqual(blitInside(a, src), [0, 0]);
  b.blit(src);
  assert.ok(same(a, b));
});

test('blitInside: a layer that pokes past a side is moved back by the least shift that leaves the margin', () => {
  const g = new Surface(48, 48), src = layer(0, 30, 12, 18);                         // touches the left side and the foot
  assert.deepEqual(blitInside(g, src), [2, -2]);
  assert.deepEqual(g.bounds(), { x0: 2, y0: 28, x1: 13, y1: 45 });
  const h = new Surface(48, 48);
  assert.deepEqual(blitInside(h, layer(40, 0, 8, 6), 3), [-3, 3]);                   // the right side and the top, with a wider margin
  assert.deepEqual(h.bounds(), { x0: 37, y0: 3, x1: 44, y1: 8 });
});

test('blitInside: the wanted offset is kept when there is room and cut back when there is not', () => {
  const src = layer(20, 20, 8, 8);
  assert.deepEqual(blitInside(new Surface(48, 48), src, 2, { dx: 5, dy: -4 }), [5, -4]);
  assert.deepEqual(blitInside(new Surface(48, 48), src, 2, { dx: 30, dy: -40 }), [18, -18]);
});

test('blitInside: an empty layer pastes nothing, the layer is not changed, and it is the same every time', () => {
  const g = new Surface(48, 48);
  assert.deepEqual(blitInside(g, new Surface(48, 48)), [0, 0]);
  assert.equal(g.bounds(), null);
  const src = layer(44, 44, 4, 4), before = Uint32Array.from(src.data), a = new Surface(48, 48), b = new Surface(48, 48);
  blitInside(a, src); blitInside(b, src);
  assert.deepEqual(src.data, before);
  assert.ok(same(a, b));
});
