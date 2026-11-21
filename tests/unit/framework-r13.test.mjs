// Framework additions made with batch R13 (the skeleton soldier and the thicket imp) that outlive the side-view rig:
//   engine/creature.js   membraneWing
//   engine/fx.js         leaves
// R2b (2026-11-21): rigs/humanoid.js went (skeletonJoints, drawSkeleton, shield, headgear, imp, wing, tail, horns, the
// layer and held-item helpers); the tests of those went with it, and so did the test of its first body, which drew the
// frozen code Hero twice and compared the two.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { membraneWing } from '../../engine/creature.js';
import { leaves } from '../../engine/fx.js';

const PI = Math.PI;
const pixels = (g) => { let n = 0; for (const c of g.data) if (c) n++; return n; };
const differ = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const has = (g, hex) => g.data.includes(col(hex));
const area = (inside) => { let n = 0; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (inside(x + 0.5, y + 0.5)) n++; return n; };


test('membraneWing: an arm, fingers fanned from the wrist and skin with scooped edges', () => {
  const w = membraneWing(40, 30, -PI / 2, 20, { fingers: 4 });
  assert.equal(w.tips.length, 4);
  assert.ok(Math.abs(Math.hypot(w.tips[0][0] - 40, w.tips[0][1] - 30) - 20) < 0.01, 'the leading finger reaches the full length');
  assert.ok(Math.abs(w.wrist[0] - 32) < 0.01 && Math.abs(w.wrist[1] - 30) < 0.01, 'the wrist is 0.4 of the way along the arm');
  assert.ok(w.inside((40 + w.wrist[0] + w.tips[0][0]) / 3 - 0.3, (30 + w.wrist[1] + w.tips[1][1]) / 3), 'the skin by the arm is inside');
  assert.ok(!w.inside(40, 5), 'far from the wing is outside');
  const flat = area(membraneWing(40, 30, -PI / 2, 20, { scoop: 0 }).inside), deep = area(membraneWing(40, 30, -PI / 2, 20, { scoop: 1 }).inside);
  assert.ok(flat > deep + 10, `deeper scoops cut skin away (${flat} > ${deep})`);
  const open = membraneWing(40, 30, -PI / 2, 20), shut = membraneWing(40, 30, -PI / 2, 20, { fold: 1 });
  const fan = (wing) => Math.hypot(wing.tips[0][0] - wing.tips.at(-1)[0], wing.tips[0][1] - wing.tips.at(-1)[1]);
  assert.ok(fan(shut) < fan(open) * 0.5, 'folding brings the finger tips together');
  const other = membraneWing(40, 30, -PI / 2, 20, { spread: -1.5 });
  assert.ok(other.tips.at(-1)[1] < 30 && open.tips.at(-1)[1] > 30, 'the sign of spread picks the side the skin hangs on');
});


test('leaves: thrown up and out, they tumble down, stay in the box and are all there on the last frame', () => {
  const box = [4, 4, 44, 44];
  const at = (t, o = {}) => { const g = new Surface(48, 48); leaves(g, { t, x: 24, y: 22, count: 5, paints: ['#4f9d57', '#7a4fc4'], box, ...o }); return g; };
  const start = at(0), mid = at(0.5), end = at(1);
  for (const g of [start, mid, end]) {
    const b = g.bounds();
    assert.ok(b && b.x0 >= 4 && b.y0 >= 4 && b.x1 < 44 && b.y1 < 44, 'inside the box');
  }
  for (const g of [mid, end]) assert.ok(has(g, '#4f9d57') && has(g, '#7a4fc4'), 'once they have spread, both colours show');
  assert.ok(pixels(end) >= 20, `the last frame still has every leaf (${pixels(end)} pixels)`);
  assert.ok(mid.bounds().x1 - mid.bounds().x0 > start.bounds().x1 - start.bounds().x0 + 6, 'they spread out');
  assert.ok(end.bounds().y1 > mid.bounds().y1 + 2, 'then they fall');
  assert.equal(differ(at(0.5), mid), 0, 'the same input draws the same leaves');
  assert.ok(differ(at(0.5, { seed: 3 }), mid) > 4, 'another seed throws them another way');
  assert.ok(has(at(0.5, { rim: '#231b33' }), '#231b33'), 'a rim colour can be given');
  // pushed against the edge they stop there, never outside
  const edge = at(1, { x: 40, y: 40, dist: 30, gravity: 30 }).bounds();
  assert.ok(edge.x1 < 44 && edge.y1 < 44);
});

