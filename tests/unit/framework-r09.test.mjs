// Framework additions made with batch R09 (dungeon tiles, dungeon door, top-down chest, boulder): engine/dungeon.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness, INK } from '../../engine/color.js';
import { steps } from '../../engine/fx.js';
import { runeSeal } from '../../engine/dungeon.js';

const hex = (v) => '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('');
const drawn = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const colours = (g) => new Set(g.data).size;
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

// ---- runeSeal -------------------------------------------------------------------------------------------------
test('runeSeal draws a ring with a rim, turning marks and a heart, and lets what is under it show', () => {
  const C = steps('#7a4fc4');
  const g = runeSeal(new Surface(32, 32), 16.5, 16.5, 9, 0, C);
  assert.ok(drawn(g) > 60, 'the ring and its marks are drawn');
  assert.equal(g.get(16, 16), col(C[0]), 'the heart is the hottest colour');
  assert.equal(g.get(16, 7), col(C[2]), 'the outer ring, straight up from the middle');
  assert.equal(g.get(16, 6), col(C[C.length - 1]), 'its rim, one pixel further out');
  assert.equal(g.get(16, 14), 0, 'between the heart and the inner ring nothing is drawn');
  const b = g.bounds();
  assert.ok(b.x0 >= 5 && b.x1 <= 27 && b.y0 >= 5 && b.y1 <= 27, 'it keeps to its radius and its rim');
});

test('runeSeal: the marks move with the turn, and a sixth of a turn of six marks closes the loop', () => {
  const C = steps('#4fd8ee');
  const at = (turn) => runeSeal(new Surface(32, 32), 16.5, 16.5, 9, turn, C, { marks: 6 });
  assert.ok(!same(at(0), at(1 / 12)), 'a twelfth of a turn moves the marks');
  // marks alternate between two kinds, so two steps of a sixth bring the same picture back
  assert.ok(same(at(0), at(2 / 6)), 'a third of a turn is the same picture');
  const boxed = runeSeal(new Surface(32, 32), 16.5, 16.5, 9, 0, C, { box: [0, 0, 32, 16] });
  assert.equal(boxed.bounds().y1, 15, 'nothing is drawn outside the box');
});
