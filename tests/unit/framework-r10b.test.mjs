// Framework additions of batch R10, fix round 1 (tiles-shore, save-crystal):
//   engine/ground.js   raisedGround: a ground colour lifted a step so it stands apart by value, without bleaching
//                      a colour that is light already
//   engine/orbits.js   around: a body with rings round it, each ring's far half behind the body and its near half
//                      in front. orbitHoop: a thin hoop with a bead that runs round it, as such a ring
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, mix, brightness } from '../../engine/color.js';
import { ring } from '../../engine/fx.js';
import { raisedGround } from '../../engine/ground.js';
import { around, orbitHoop } from '../../engine/orbits.js';

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

test('around: a ring\'s far half is hidden by the body and its near half covers it', () => {
  const body = new Surface(32, 32);
  body.rect(12, 6, 8, 20, RED);
  // a plain band 3 rows high across the whole frame, split at row 16: rows 15 is far, rows 16 and 17 are near
  const band = { y: 16, draw: (layer, half) => layer.rect(2, 15, 28, 3, half === 'far' ? FAR : NEAR) };
  const g = around(new Surface(32, 32), body, [band]);
  assert.equal(g.get(4, 15), col(FAR), 'beside the body the far half shows');
  assert.equal(g.get(16, 15), col(RED), 'the body hides the far half');
  assert.equal(g.get(4, 16), col(NEAR));
  assert.equal(g.get(16, 16), col(NEAR), 'the near half covers the body');
  assert.equal(g.get(16, 17), col(NEAR));
  assert.equal(g.get(16, 14), col(RED));
  assert.equal(count(g, FAR), 28 - 8);
  assert.equal(count(g, NEAR), 2 * 28);
  assert.equal(count(g, RED), 8 * 20 - 2 * 8);
  // no rings: just the body, pasted where asked
  const moved = around(new Surface(32, 32), body, [], { dx: 3, dy: -2 });
  assert.deepEqual(moved.bounds(), { x0: 15, y0: 4, x1: 22, y1: 23 });
});

test('around: an effect drawn once is split at its row (fx.ring), and outer rings lie outside inner ones', () => {
  const body = new Surface(32, 48);
  body.rect(13, 8, 6, 30, RED);
  const o = { t: 0.2, x: 16, y: 24, r0: 11, r1: 11, thick: 2, squash: 0.35, colour: '#4fd8ee' };
  const whole = new Surface(32, 48);
  ring(whole, o);
  const g = around(new Surface(32, 48), body, [{ y: 24, draw: (layer) => ring(layer, o) }]);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
    const r = whole.get(x, y), b = body.get(x, y);
    assert.equal(g.get(x, y), y < 24 ? (b || r) : (r || b), `${x},${y}`);
  }
  // two rings that cross the same pixels: the first listed is the inner one. Behind the body the outer ring lies
  // under the inner; in front of it the outer ring lies over the inner
  const flat = (c) => ({ y: 20, draw: (layer) => layer.rect(4, 18, 24, 4, c) });
  const two = around(new Surface(32, 48), new Surface(32, 48), [flat(FAR), flat(NEAR)]);
  assert.equal(two.get(6, 18), col(FAR), 'far half: the inner ring on top');
  assert.equal(two.get(6, 21), col(NEAR), 'near half: the outer ring on top');
});

test('orbitHoop: a hoop round a body, dim behind it and bright in front, with a bead that runs round', () => {
  const body = new Surface(32, 32);
  body.rect(13, 4, 6, 24, RED);
  const hoop = (turn) => orbitHoop({ cx: 16, cy: 16, rx: 10, ry: 3, thick: 1, back: FAR, front: NEAR, bead: turn === null ? null : { turn, colour: '#ffffff' } });
  const g = around(new Surface(32, 32), body, [hoop(null)]);
  assert.ok(count(g, FAR) > 6 && count(g, NEAR) > 6);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g.get(x, y) === col(FAR)) { assert.ok(y < 16, `far half above the middle (${x},${y})`); assert.equal(body.get(x, y), 0, 'and never on the body'); }
    if (g.get(x, y) === col(NEAR)) assert.ok(y >= 16, `near half from the middle down (${x},${y})`);
  }
  assert.equal(g.get(16, 13), col(RED), 'the far half passes behind the body');
  assert.equal(g.get(16, 18), col(NEAR), 'the near half passes in front of it');
  assert.equal(g.get(6, 16), col(NEAR));
  assert.equal(g.get(16, 16), col(RED), 'a hoop, not a disc');
  // the bead: a quarter of the way round it is nearest the camera (a plus with a white heart, over the body);
  // three quarters round it is at the back, one pixel, hidden by the body
  const near = around(new Surface(32, 32), body, [hoop(0.25)]);
  assert.equal(near.get(16, 18), col('#ffffff'));
  assert.equal(near.get(15, 18), col('#ffffff'));
  assert.equal(near.get(16, 19), col('#ffffff'));
  const far = around(new Surface(32, 32), body, [hoop(0.75)]);
  assert.deepEqual([...far.data], [...g.data], 'behind the body the bead cannot be seen');
  const side = around(new Surface(32, 32), body, [hoop(0.55)]);
  assert.equal(count(side, '#ffffff'), 1, 'on the far half beside the body it is one pixel');
  // one turn brings it back
  assert.deepEqual([...around(new Surface(32, 32), body, [hoop(1.25)]).data], [...near.data]);
});
