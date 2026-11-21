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
import { seam, capIn, crack } from '../../engine/rock.js';
import { ramp } from '../../engine/color.js';
import { hornPath, hornIn, hornFit } from '../../engine/creature.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, c) => { const v = col(c); return g.data.reduce((n, x) => n + (x === v ? 1 : 0), 0); };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---- engine/rock.js: seam -----------------------------------------------------------

test('seam darkens only pixels that are already drawn and touch the shape from outside', () => {
  const g = new Surface(32, 32).rect(4, 16, 24, 10, '#8f97a8');
  const before = lit(g);
  const top = ellipseIn(16, 14, 6, 5);              // a stone resting on the slab, half over empty space
  seam(g, top, '#333344');
  assert.equal(lit(g), before, 'no pixel is added or removed');
  const dark = count(g, '#333344');
  assert.ok(dark >= 6, `a contact line is drawn (${dark} px)`);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g.get(x, y) !== col('#333344')) continue;
    assert.ok(!top(x + 0.5, y + 0.5), 'the seam is outside the shape');
    assert.ok(top(x + 1.5, y + 0.5) || top(x - 0.5, y + 0.5) || top(x + 0.5, y + 1.5) || top(x + 0.5, y - 0.5), 'and touches it');
  }
});

test('seam does nothing where the shape touches nothing, and respects box and clip', () => {
  const g = new Surface(32, 32).rect(2, 2, 6, 6, '#8f97a8');
  seam(g, ellipseIn(22, 22, 5, 5), '#333344');
  assert.equal(count(g, '#333344'), 0);
  const h = new Surface(32, 32).rect(0, 0, 32, 32, '#8f97a8');
  seam(h, rectIn(10, 10, 12, 12), '#333344', { clip: (px, py) => py < 10 });
  assert.equal(count(h, '#333344'), 12, 'only the edge above the square');
  const k = new Surface(32, 32).rect(0, 0, 32, 32, '#8f97a8');
  seam(k, rectIn(10, 10, 12, 12), '#333344', { box: [0, 0, 9, 31] });
  assert.equal(count(k, '#333344'), 12, 'only the edge left of the square');
});

// ---- engine/rock.js: capIn -----------------------------------------------------------

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

test('crack runs the asked way for about the asked length, one pixel wide, and stays inside its clip', () => {
  const g = new Surface(48, 48);
  crack(g, 24, 6, 0, 20, '#333344', { seed: 3, branch: false });
  const b = g.bounds();
  assert.equal(b.y0, 6);
  assert.ok(b.y1 >= 20 && b.y1 <= 30, `it runs down about 20 px (to row ${b.y1})`);
  assert.ok(b.x1 - b.x0 >= 2, 'it zigzags');
  assert.ok(b.x1 - b.x0 <= 14, 'but keeps its direction');
  for (let y = b.y0; y <= b.y1; y++) { let n = 0; for (let x = 0; x < 48; x++) if (g.get(x, y)) n++; assert.ok(n >= 1 && n <= 4, `row ${y}: ${n} px`); }
  const disc = ellipseIn(24, 24, 8, 8);
  const c = new Surface(48, 48);
  crack(c, 24, 20, PI / 2, 30, '#333344', { seed: 1, clip: disc });
  assert.ok(lit(c) > 3);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (c.get(x, y)) assert.ok(disc(x + 0.5, y + 0.5), 'no pixel outside the clip');
  const again = new Surface(48, 48);
  crack(again, 24, 6, 0, 20, '#333344', { seed: 3, branch: false });
  assert.deepEqual(again.data, g.data, 'repeatable');
  const forked = new Surface(48, 48);
  crack(forked, 24, 6, 0, 20, '#333344', { seed: 3 });
  assert.ok(lit(forked) > lit(g), 'a long crack has a side branch');
});

// ---- engine/creature.js: hornFit (fix round 1) ------------------------------------------

test('hornFit: the asked length comes back when the horn fits or no box is given', () => {
  const box = [2, 2, 94, 94];
  assert.equal(hornFit(40, 50, PI / 2, 12, { box }), 12);
  assert.equal(hornFit(40, 50, PI, 12, { curl: -0.75, width: 5, tip: 1.2, box }), 12);
  assert.equal(hornFit(90, 50, PI / 2, 12), 12, 'no box: nothing to fit');
  assert.equal(hornFit(90, 50, PI / 2, 0, { box }), 0);
});

test('hornFit: a straight horn is shortened to where its tip, with its width, meets the box, on each of the four sides', () => {
  const box = [2, 2, 94, 94], o = { width: 4, tip: 1, box };
  assert.ok(close(hornFit(80, 50, PI / 2, 20, o), 94 - 0.5 - 80), 'to the right');
  assert.ok(close(hornFit(12, 50, -PI / 2, 20, o), 12 - 2 - 0.5), 'to the left');
  assert.ok(close(hornFit(50, 10, PI, 20, o), 10 - 2 - 0.5), 'up');
  assert.ok(close(hornFit(50, 85, 0, 20, o), 94 - 0.5 - 85), 'down');
});

test('hornFit: a curled horn drawn at the fitted length stays inside the box, and one a little longer does not', () => {
  const box = [2, 2, 94, 94], w = 96;
  for (const [x, y, a, curl] of [[82, 56, PI - 0.5, -0.75], [84, 60, 2.2, -0.75], [88, 40, PI / 2 + 0.4, 0.9], [14, 12, -2.4, 0.6], [60, 88, 0.5, 0.8]]) {
    const o = { curl, width: 5.6, tip: 1.2 }, asked = 16;
    const fit = hornFit(x, y, a, asked, { ...o, box });
    assert.ok(fit > 0 && fit < asked, `it is shortened (${fit})`);
    const g = new Surface(w, w).fill(0, 0, w, w, hornIn(x, y, a, fit, o), '#ffffff', { shade: 0 });
    const b = g.bounds();
    assert.ok(b.x0 >= box[0] && b.y0 >= box[1] && b.x1 < box[2] && b.y1 < box[3], `inside: ${JSON.stringify(b)}`);
    // every point of its centre line, with the horn's half-width round it, is inside; a longer one has a point outside
    const out = (len) => hornPath(x, y, a, len, o).some(([px, py], i) => {
      if (!i) return false;
      const r = (5.6 + (1.2 - 5.6) * (i / 5)) / 2;
      return px + r > box[2] + 1e-6 || px - r < box[0] - 1e-6 || py + r > box[3] + 1e-6 || py - r < box[1] - 1e-6;
    });
    assert.ok(!out(fit) && out(fit + 0.5), 'the fitted length is the longest that fits');
  }
});

test('hornFit: when the root is already at the edge the answer is the least length, 0 unless told otherwise', () => {
  const box = [2, 2, 94, 94];
  assert.equal(hornFit(95, 50, PI / 2, 10, { box }), 0);
  assert.equal(hornFit(95, 50, PI / 2, 10, { box, least: 2 }), 2);
});
