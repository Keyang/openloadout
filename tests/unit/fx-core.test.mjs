// Effect helpers (style guide sections 2, 4 and 14): repeatable particles, twinkles, rings,
// shards, smoke and the white-core-to-dark-rim colour steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { brightness, tone, col } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { steps, stepAt, lifeOf, particles, twinkle, ring, glow } from '../../engine/fx.js';

const S = 48, C = 24;
const draw = (fn) => { const g = new Surface(S, S); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

test('steps run from a white core to a dark rim of the effect\'s own colour', () => {
  const s = steps('#e08a2c');
  assert.equal(s[0], '#ffffff');
  assert.equal(s.at(-1), tone('#e08a2c', -1));
  assert.ok(s.includes('#e08a2c'));
  for (let i = 1; i < s.length; i++) assert.ok(brightness(s[i]) < brightness(s[i - 1]), `step ${i} darker than step ${i - 1}: ${s.join(' ')}`);
  for (const c of s) assert.match(c, /^#[0-9a-f]{6}$/);
  const two = steps('#e2473f', { core: '#f0ead8' });
  assert.equal(two[1], '#f0ead8');
  assert.equal(two.at(-1), tone('#e2473f', -1));
  assert.equal(steps('#5fe0f0', { white: false })[0] !== '#ffffff', true);
});

test('stepAt picks the hottest step at 1 and the rim at 0', () => {
  const s = steps('#4fd8ee');
  assert.equal(stepAt(s, 1), s[0]);
  assert.equal(stepAt(s, 0), s.at(-1));
  assert.equal(stepAt(s, 2), s[0]);
  assert.equal(stepAt(s, -1), s.at(-1));
});

test('lifeOf: looping lives wrap and close; one-shot lives wait, then age to 1 at t = 1', () => {
  for (let i = 0; i < 20; i++) {
    const a = lifeOf(0, i), b = lifeOf(1, i);
    assert.ok(a >= 0 && a < 1);
    assert.ok(Math.abs(a - b) < 1e-9 || Math.abs(Math.abs(a - b) - 1) < 1e-9);
    assert.equal(lifeOf(0.3, i, { seed: 4 }), lifeOf(0.3, i, { seed: 4 }));
    assert.equal(lifeOf(0, i, { loop: false }), 0, 'a one-shot particle waits at 0 until it starts');
    assert.equal(lifeOf(1, i, { loop: false }), 1);
  }
  assert.notEqual(lifeOf(0.5, 1, { seed: 1 }), lifeOf(0.5, 1, { seed: 2 }));
  assert.equal(lifeOf(0.5, 3, { loop: false, stagger: 0 }), 0.5);
});

test('more particles draw more pixels; a seed changes the pattern', () => {
  const n = (count) => lit(draw((g) => particles(g, { t: 0.3, x: C, y: 40, count, seed: 1, arc: PI, dist: 24, colour: '#e08a2c' })));
  assert.ok(n(16) > n(3));
  const a = draw((g) => particles(g, { t: 0.3, x: C, y: 40, count: 8, seed: 1, colour: '#e08a2c' }));
  const b = draw((g) => particles(g, { t: 0.3, x: C, y: 40, count: 8, seed: 2, colour: '#e08a2c' }));
  assert.ok(!same(a, b));
});

test('a one-shot ring grows: its radius at t = 0.6 is larger than at t = 0.1', () => {
  const extent = (t) => { const b = draw((g) => ring(g, { t, x: C, y: C, r0: 2, r1: 20, colour: '#5fe0f0' })).bounds(); return b.x1 - b.x0; };
  assert.ok(extent(0.6) > extent(0.1) + 6);
});

test('the hot core is drawn: glow and a new ring use the white step and the rim', () => {
  const s = steps('#e8662c');
  const g = draw((x) => glow(x, C, C, 8, s));
  const used = new Set(g.data.filter(Boolean));
  assert.ok(used.has(col('#ffffff')), 'white core');
  assert.ok(used.has(col(s.at(-1))), 'dark rim');
  const allowed = new Set(s.map(col));
  for (const v of used) assert.ok(allowed.has(v), 'only step colours');
});

test('twinkle sizes: 0 is one pixel, 1 a plus, 2 a big plus with a white centre', () => {
  assert.equal(lit(draw((g) => twinkle(g, C, C, 0, '#f2c230'))), 1);
  assert.equal(lit(draw((g) => twinkle(g, C, C, 1, '#f2c230'))), 5);
  const big = draw((g) => twinkle(g, C, C, 2, '#f2c230'));
  assert.equal(lit(big), 9);
  assert.equal(big.get(C, C), col('#ffffff'));
});

// ---- review round 1 ------------------------------------------------------------
