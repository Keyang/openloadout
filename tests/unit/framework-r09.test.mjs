// Framework additions made with batch R09 (dungeon tiles, dungeon door, top-down chest, boulder): engine/dungeon.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness, INK } from '../../engine/color.js';
import { steps } from '../../engine/fx.js';
import { drawStairs, sunkWall, boneIn, runeSeal } from '../../engine/dungeon.js';

const hex = (v) => '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('');
const drawn = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const colours = (g) => new Set(g.data).size;
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

// ---- drawStairs -----------------------------------------------------------------------------------------------
test('drawStairs fills the tile, inks three sides and leaves the south side open', () => {
  for (const dir of ['down', 'up']) {
    const g = drawStairs(new Surface(32, 32), dir, { tread: '#7e84a0', wall: '#5a5f7a' });
    assert.equal(drawn(g), 32 * 32, `${dir}: every pixel is drawn`);
    for (let i = 0; i < 32; i++) {
      assert.equal(g.get(0, i), col(INK), `${dir}: west line at row ${i}`);
      assert.equal(g.get(31, i), col(INK), `${dir}: east line at row ${i}`);
      assert.equal(g.get(i, 0), col(INK), `${dir}: north line at column ${i}`);
    }
    assert.notEqual(g.get(16, 31), col(INK), `${dir}: the south side is open`);
    assert.ok(colours(g) <= 24, `${dir}: ${colours(g)} colours, a tile takes at most 24`);
  }
});

test('drawStairs: going down the treads get darker to the north, going up they get lighter', () => {
  const light = (g, y) => brightness(hex(g.get(16, y)));
  const down = drawStairs(new Surface(32, 32), 'down', { tread: '#7e84a0' });
  const up = drawStairs(new Surface(32, 32), 'up', { tread: '#7e84a0' });
  // the middle row of each of the five treads, from the south
  const rows = [28, 22, 16, 10, 5];
  for (let i = 1; i < rows.length; i++) assert.ok(light(down, rows[i]) < light(down, rows[i - 1]), `down: tread ${i} is darker than tread ${i - 1}`);
  assert.equal(down.get(16, 2), col(INK), 'down: the flight ends in the dark');
  const treads = [27, 21, 15, 9, 3];
  for (let i = 1; i < treads.length; i++) assert.ok(light(up, treads[i]) > light(up, treads[i - 1]), `up: tread ${i} is lighter than tread ${i - 1}`);
});

test('drawStairs is the same every time, takes 3 to 7 steps and refuses another direction', () => {
  assert.ok(same(drawStairs(new Surface(32, 32), 'up', { tread: '#c9a06a' }), drawStairs(new Surface(32, 32), 'up', { tread: '#c9a06a' })));
  assert.ok(!same(drawStairs(new Surface(32, 32), 'down', { steps: 3 }), drawStairs(new Surface(32, 32), 'down', { steps: 7 })));
  assert.ok(same(drawStairs(new Surface(32, 32), 'down', { steps: 7 }), drawStairs(new Surface(32, 32), 'down', { steps: 20 })), 'more than 7 is 7');
  assert.throws(() => drawStairs(new Surface(32, 32), 'left'), /not down or up/);
});

// ---- sunkWall -------------------------------------------------------------------------------------------------
test('sunkWall paints courses from the rim down, each in its own tone, and repeats along the edge', () => {
  const brick = { body: '#5a5f7a', joint: '#3b395c' };
  const paint = sunkWall({ depth: 12, course: 4, joints: [[5, 16], [11]], tones: [brick, brick, { body: '#3b395c' }], lit: '#94a0b2' });
  assert.equal(paint(1, 0), '#94a0b2', 'the first row under the rim is lit');
  assert.equal(paint(2, 0), '#5a5f7a', 'a brick');
  assert.equal(paint(2, 5), '#3b395c', 'an upright joint of the first course');
  assert.equal(paint(4, 9), '#3b395c', 'the joint under the first course');
  assert.equal(paint(6, 5), '#5a5f7a', 'the second course has its joints elsewhere');
  assert.equal(paint(6, 11), '#3b395c');
  for (let u = 0; u < 32; u++) for (let d = 9; d <= 12; d++) assert.equal(paint(d, u), '#3b395c', 'the lowest course is one plain band');
  assert.equal(paint(20, 3), '#3b395c', 'past its depth it carries on in the last tone');
  assert.throws(() => sunkWall({ depth: 8 }), /at least one tone/);
});

// ---- boneIn ---------------------------------------------------------------------------------------------------
test('boneIn is a shaft with a knob wider than it at each end', () => {
  const bone = boneIn(8.5, 16.5, 23.5, 16.5, 0.8, 1.6), g = new Surface(32, 32).fill(0, 0, 32, 32, bone, '#f0ead8');
  const tall = (x) => { let n = 0; for (let y = 0; y < 32; y++) if (g.get(x, y)) n++; return n; };
  assert.ok(tall(16) >= 1 && tall(16) <= 2, 'the shaft is thin');
  assert.ok(tall(8) > tall(16) && tall(23) > tall(16), 'both ends are knobs');
  const b = g.bounds();
  assert.ok(b.x0 >= 6 && b.x1 <= 25 && b.y0 >= 13 && b.y1 <= 19, 'it stays near its two ends');
  assert.ok(boneIn(4, 4, 12, 12)(8, 8), 'a slanted bone has its middle on the line');
});

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
