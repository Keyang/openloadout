// Framework additions of batch R10, fix round 1 (tiles-shore, save-crystal):
//   engine/ground.js   raisedGround: a ground colour lifted a step so it stands apart by value, without bleaching
//                      a colour that is light already
//   engine/orbits.js   around: a body with rings round it, each ring's far half behind the body and its near half
//                      in front. orbitHoop: a thin hoop with a bead that runs round it, as such a ring
// R3 (2026-11-21): engine/orbits.js (around, orbitHoop) went with its tests; the engine/ground.js test stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, mix, brightness } from '../../engine/color.js';
import { ring } from '../../engine/fx.js';
import { raisedGround } from '../../engine/ground.js';
const count = (g, c) => g.data.reduce((n, v) => n + ((c === undefined ? v : v === col(c)) ? 1 : 0), 0);

// ---- ground ---------------------------------------------------------------------------------------------------

test('raisedGround: a mid colour goes a full step up, a light one less, a very light one not at all', () => {
  // the rule as tiles-meadow and tiles-shore wrote it out by hand
  const byHand = (c) => mix(c, ramp(c).light, Math.min(1, Math.max(0, (0.86 - brightness(c)) / 0.2)));
  for (const c of ['#c9a06a', '#e6c96a', '#a8a4a0', '#f0ead8', '#9a6a3e', '#7fbf5a', '#ffffff', '#231b33']) assert.equal(raisedGround(c), byHand(c), c);
  assert.equal(raisedGround('#c9a06a'), ramp('#c9a06a').light, 'path (brightness 0.66): the whole step');
  assert.equal(raisedGround('#f0ead8'), '#f0ead8', 'cream (0.92): left alone');
  const wheat = raisedGround('#e6c96a');
  assert.ok(brightness(wheat) > brightness('#e6c96a') && brightness(wheat) < brightness(ramp('#e6c96a').light), 'wheat (0.78): part of the step');
  // target and span move the line
  assert.equal(raisedGround('#e6c96a', { target: 0.7 }), '#e6c96a');
  assert.equal(raisedGround('#e6c96a', { target: 1, span: 0.1 }), ramp('#e6c96a').light);
  assert.equal(raisedGround('#e6c96a', { span: 0 }), ramp('#e6c96a').light, 'no span: a full step for everything under the target');
});

// ---- orbits ---------------------------------------------------------------------------------------------------

const RED = '#c9423a', FAR = '#3f6fd1', NEAR = '#f2c230';

