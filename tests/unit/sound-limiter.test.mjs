// sound/limiter.js: the soft clip at the end of the site's speakers chain. Sounds at normal levels pass straight
// through; anything louder bends towards full scale and never passes it. (The Web Audio part is measured in
// tests/e2e/sound-words.spec.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { softLimit, limitCurve, LIMIT_KNEE, CURVE_RANGE } from '../../sound/limiter.js';

test('below the knee a sample passes unchanged, both ways', () => {
  for (const x of [0, 0.1, -0.3, 0.71, -0.712, LIMIT_KNEE]) assert.equal(softLimit(x), x);
});

test('above the knee it bends, keeps rising and never reaches past full scale', () => {
  let prev = softLimit(LIMIT_KNEE);
  for (let x = LIMIT_KNEE + 0.01; x < 20; x += 0.05) {
    const y = softLimit(x);
    assert.ok(y <= 1 && y >= prev, `${x} -> ${y}`);
    assert.equal(softLimit(-x), -y);
    prev = y;
  }
  assert.ok(softLimit(1.42) > 0.95, 'two sounds at once are still loud, not crushed');
  assert.equal(softLimit(NaN), 0);
});

test('the WaveShaper curve is softLimit over -range..range, so the scaled input reads the right point', () => {
  const n = 4097, c = limitCurve(n, CURVE_RANGE);
  assert.equal(c.length, n);
  assert.ok(Math.abs(c[(n - 1) / 2]) < 1e-9, 'the middle point is silence');
  for (const x of [0.5, 0.712, 1, 1.42, 2.1, 3.9]) {
    const u = x / CURVE_RANGE, i = Math.round(((u + 1) / 2) * (n - 1));
    assert.ok(Math.abs(c[i] - softLimit(x)) < 2e-3, `${x}: ${c[i]} vs ${softLimit(x)}`);
  }
  assert.ok(c.every((y) => Math.abs(y) <= 1));
});
