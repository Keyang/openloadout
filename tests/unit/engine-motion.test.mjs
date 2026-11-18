// Motion helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys, loopKeys, ik2, hash, rng, clamp, wave, pulse, dir, reach } from '../../engine/motion.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test('keys holds the end values and hits each key exactly', () => {
  const ks = [[0.2, 10], [0.5, 20], [0.8, 0]];
  assert.equal(keys(0, ks), 10);
  assert.equal(keys(1, ks), 0);
  near(keys(0.5, ks), 20);
  near(keys(0.35, ks), 15);                 // smoothstep midpoint
  near(keys(0.35, ks, (t) => t), 15);       // linear easing
});

test('loopKeys closes the loop: t = 0 and t = 1 give the same value', () => {
  const ks = [[0, 3], [0.4, 9], [0.7, -2]];
  near(loopKeys(0, ks), loopKeys(1, ks));
  near(loopKeys(0, ks), 3);
  near(loopKeys(0.4, ks), 9);
  near(loopKeys(0.7, ks), -2);
  // just before the end it is heading back toward the first key
  assert.ok(Math.abs(loopKeys(0.999, ks) - 3) < 0.05);
});

test('ik2 reaches a target within range and the bones keep their length', () => {
  const r = ik2(0, 0, 6, 4, 5, 5, 1);
  near(r.end[0], 6); near(r.end[1], 4);
  near(Math.hypot(r.mid[0], r.mid[1]), 5, 1e-6);
  near(Math.hypot(r.end[0] - r.mid[0], r.end[1] - r.mid[1]), 5, 1e-6);
});

test('ik2 clamps a target that is too far, along the same direction', () => {
  const r = ik2(0, 0, 100, 0, 4, 4, 1);
  assert.ok(r.end[0] < 8 && r.end[0] > 7.9);
  near(r.end[1], 0);
});

test('ik2 bend picks the side of the middle joint', () => {
  const a = ik2(0, 0, 0, 6, 5, 5, 1), b = ik2(0, 0, 0, 6, 5, 5, -1);
  assert.ok(a.mid[0] > 0);
  assert.ok(b.mid[0] < 0);
});

test('hash is stable, within 0..1, and differs for different inputs', () => {
  assert.equal(hash(3, 7), hash(3, 7));
  assert.notEqual(hash(3, 7), hash(7, 3));
  for (let i = 0; i < 200; i++) { const v = hash(i, i * 3); assert.ok(v >= 0 && v < 1); }
  assert.equal(hash(1, 0), hash(1));
});

test('rng is deterministic per seed', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, [c(), c(), c()]);
});

test('small functions', () => {
  assert.equal(clamp(5, 0, 1), 1);
  near(wave(0.25), 1);
  near(pulse(0), 0); near(pulse(0.5), 1);
  near(dir(0)[1], 1); near(dir(Math.PI / 2)[0], 1);
  const [x, y] = reach(2, 3, 0, 4); near(x, 2); near(y, 7);
});
