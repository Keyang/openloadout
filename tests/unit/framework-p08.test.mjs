// Framework additions made with batch P08 (the platformer boss, moss-golem; the pathfinder for bosses):
//   (rigs/bigbody.js, the side-view large two-legged body rig, was also added; R2 deleted it and its tests)
//   engine/rock.js    seam (the dark line between stacked stones), capIn (the layer on top of a shape: moss, snow),
//                     crack (a jagged crack)
//   engine/growth.js  mossCap (a cap of moss drawn on a shape), mushroom, sapling (things standing on a point that turn with it)
//   engine/creature.js  hornFit (the longest a horn can be without leaving a box; added in fix round 1)
// R2: rigs/bigbody.js went: the tests of the big-body rig are deleted; those of the engine helpers (engine/rock.js and the rest) stay.
// R3 (2026-11-21): engine/growth.js went (mossCap, mushroom, sapling) with its tests; the engine/rock.js and engine/creature.js tests stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn, rectIn } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { capIn, crack } from '../../engine/rock.js';
import { ramp } from '../../engine/color.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, c) => { const v = col(c); return g.data.reduce((n, x) => n + (x === v ? 1 : 0), 0); };
test('capIn covers the top of a shape to the asked depth, column by column', () => {
  const block = rectIn(6, 12, 20, 14);
  const cap = capIn(block, [0, 0, 31, 31], { depth: 3, rise: 0, ragged: 0 });
  const g = new Surface(32, 32).fill(0, 0, 32, 32, cap, '#a4c44a');
  assert.deepEqual(g.bounds(), { x0: 6, y0: 12, x1: 25, y1: 14 });
  assert.equal(lit(g), 20 * 3);
});

test('capIn: lumps rise above the edge, the lower edge hangs ragged, and it keeps to its box', () => {
  const hill = ellipseIn(16, 22, 12, 9);
  const g = new Surface(32, 32).fill(0, 0, 32, 32, capIn(hill, [0, 0, 31, 31], { depth: 2, rise: 2, ragged: 3, seed: 4 }), '#a4c44a');
  const b = g.bounds();
  assert.ok(b.y0 < 13, 'something stands above the top of the hill (row 13)');
  assert.ok(b.y0 >= 11, 'by no more than the rise');
  let deepest = 0, shallowest = 99;
  for (let x = 8; x <= 24; x++) {
    let top = -1, n = 0;
    for (let y = 0; y < 32; y++) if (hill(x + 0.5, y + 0.5)) { if (top < 0) top = y; if (g.get(x, y)) n++; }
    deepest = Math.max(deepest, n); shallowest = Math.min(shallowest, n);
    assert.ok(n >= 2 && n <= 5, `column ${x}: ${n} px of cap inside the hill`);
  }
  assert.ok(deepest > shallowest, 'the lower edge is ragged');
  const part = new Surface(32, 32).fill(0, 0, 32, 32, capIn(hill, [10, 0, 16, 15], { depth: 2, rise: 0, ragged: 0 }), '#a4c44a');
  const pb = part.bounds();
  assert.ok(pb.x0 >= 10 && pb.x1 <= 16, 'only the columns of the box');
  const same = new Surface(32, 32).fill(0, 0, 32, 32, capIn(hill, [0, 0, 31, 31], { depth: 2, rise: 2, ragged: 3, seed: 4 }), '#a4c44a');
  assert.deepEqual(same.data, g.data, 'the same seed gives the same cap');
});

// ---- engine/rock.js: crack -----------------------------------------------------------
