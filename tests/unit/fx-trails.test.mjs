// Trails of light (engine/fx-trails.js): a 1 px line with a bright head that steps down to a darker tail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { taperLine } from '../../engine/fx-trails.js';

const C = ['#ffffff', '#c0c0c0', '#606060'];
const row = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y));

test('taperLine to the right puts the head colour at the head and the darkest at the tail', () => {
  const g = new Surface(32, 8);
  taperLine(g, 20, 4, PI / 2, 9, C);
  const r = row(g, 4);
  assert.equal(r[20], col(C[0]));
  assert.equal(r[12], col(C[2]));
  assert.equal(r.filter((v) => v).length, 9);
  assert.equal(r[21], 0);
  assert.equal(r[11], 0);
  // the colours never get brighter towards the tail
  const order = r.slice(12, 21).map((v) => [col(C[2]), col(C[1]), col(C[0])].indexOf(v));
  assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v >= order[i - 1])), String(order));
});

test('taperLine of three pixels shows every colour of a three-step list', () => {
  const g = new Surface(16, 8);
  taperLine(g, 8, 3, PI / 2, 3, C);
  assert.deepEqual([g.get(8, 3), g.get(7, 3), g.get(6, 3)], C.map(col));
});

test('taperLine keeps out of the 1 px border and inside a box', () => {
  const g = new Surface(16, 8);
  taperLine(g, 20, 0, PI / 2, 30, C);
  assert.equal(g.bounds(), null);
  const h = new Surface(16, 8);
  taperLine(h, 14, 4, PI / 2, 20, C, { box: [4, 0, 10, 8] });
  const b = h.bounds();
  assert.equal(b.x0, 4);
  assert.equal(b.x1, 9);
});

test('taperLine of one pixel draws the head colour only', () => {
  const g = new Surface(8, 8);
  taperLine(g, 4, 4, PI / 2, 1, C);
  assert.equal(g.get(4, 4), col(C[0]));
  assert.equal(g.data.filter((v) => v).length, 1);
});
