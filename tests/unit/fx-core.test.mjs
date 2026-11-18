// Effect helpers (style guide sections 2, 4 and 14): repeatable particles, twinkles, rings,
// shards, smoke and the white-core-to-dark-rim colour steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { brightness, tone, col } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { steps, stepAt, lifeOf, particles, sparkles, twinkle, ring, shards, smoke, glow } from '../../engine/fx.js';

const S = 48, C = 24;
const draw = (fn) => { const g = new Surface(S, S); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

// Every helper, with an ordinary call, as a function of the clip phase t (and an optional box).
const CASES = {
  particles: { loop: true, run: (g, t, box) => particles(g, { t, x: C, y: 40, count: 10, seed: 3, dist: 26, size: 2, colour: '#e08a2c', box }) },
  'particles one-shot': { loop: false, run: (g, t, box) => particles(g, { t, x: C, y: C, loop: false, count: 10, seed: 5, arc: 2 * PI, dist: 16, size: 2, colour: '#4fd8ee', box }) },
  sparkles: { loop: true, run: (g, t, box) => sparkles(g, { t, count: 6, seed: 2, colour: '#f2c230', box }) },
  smoke: { loop: true, run: (g, t, box) => smoke(g, { t, x: C, y: 40, count: 5, seed: 1, rise: 24, size: 5, colour: '#8f97a8', box }) },
  'smoke one-shot': { loop: false, run: (g, t, box) => smoke(g, { t, x: C, y: 36, loop: false, count: 6, seed: 4, rise: 10, size: 5, colour: '#8f97a8', box }) },
  ring: { loop: false, run: (g, t, box) => ring(g, { t, x: C, y: C, r0: 2, r1: 20, thick: 4, colour: '#5fe0f0', box }) },
  'ring squashed': { loop: false, box: [8, 30, 41, 46], run: (g, t, box) => ring(g, { t, x: C, y: 40, r0: 3, r1: 22, thick: 3, squash: 0.35, colour: '#a06a3c', box }) },
  shards: { loop: false, run: (g, t, box) => shards(g, { t, x: C, y: C, count: 7, seed: 9, dist: 18, gravity: 8, size: 3, colour: '#8f97a8', box }) },
  twinkle: { loop: null, run: (g, t, box) => twinkle(g, C, C, Math.round(2 * t), '#f2c230', { box }) },
  glow: { loop: null, run: (g, t, box) => glow(g, C, C, 3 + 8 * t, steps('#e8662c'), { box }) },
};

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

for (const [name, c] of Object.entries(CASES)) {
  test(`${name}: deterministic, draws something, every pixel solid`, () => {
    const orig = Math.random;
    Math.random = () => { throw new Error('Math.random used'); };
    try {
      for (const t of ts) {
        const a = draw((g) => c.run(g, t)), b = draw((g) => c.run(g, t));
        assert.ok(same(a, b), `t=${t} same pixels twice`);
      }
    } finally { Math.random = orig; }
    const drawn = ts.map((t) => lit(draw((g) => c.run(g, t))));
    assert.ok(drawn.filter((n) => n > 0).length >= ts.length - 1, `${name} draws in nearly every frame: ${drawn}`);
    assert.ok(Math.max(...drawn) >= 6, `${name} draws more than a speck: ${drawn}`);
    // every pixel is fully opaque (hard edges, no half-transparent pixels)
    for (const t of ts) for (const v of draw((g) => c.run(g, t)).data) if (v) assert.equal(v >>> 24, 255);
  });

  test(`${name}: stays inside the frame and inside a box it is given`, () => {
    for (const t of ts) {
      const g = draw((s) => c.run(s, t));
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (x === 0 || y === 0 || x === S - 1 || y === S - 1) assert.equal(g.get(x, y), 0, `t=${t}: pixel on the frame's outer border at ${x},${y}`);
      }
      const box = c.box ?? [16, 14, 33, 35];   // x0, y0, x1, y1: pixels with x0 <= x < x1, y0 <= y < y1
      const h = draw((s) => c.run(s, t, box));
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const inside = x >= box[0] && x < box[2] && y >= box[1] && y < box[3];
        if (!inside) assert.equal(h.get(x, y), 0, `t=${t}: pixel outside the box at ${x},${y}`);
      }
    }
  });

  if (c.loop === true) {
    test(`${name}: the loop closes (t = 0 and t = 1 give the same pixels) and it moves`, () => {
      const a = draw((g) => c.run(g, 0)), b = draw((g) => c.run(g, 1));
      assert.ok(same(a, b));
      const mid = draw((g) => c.run(g, 0.5));
      assert.ok(!same(a, mid), 'frames differ during the loop');
    });
  }
  if (c.loop === false) {
    test(`${name}: a one-shot ends on a few pixels, never empty, and is biggest early`, () => {
      assert.ok(lit(draw((g) => c.run(g, 0))) > 0, 'frame 0 of a one-shot is never empty: it is the brightest idea');
      const end = lit(draw((g) => c.run(g, 1)));
      assert.ok(end >= 2, `last frame keeps ${end} pixels`);
      const peak = Math.max(...ts.slice(0, 5).map((t) => lit(draw((g) => c.run(g, t)))));
      assert.ok(peak > end, `the end (${end}) is thinner than the peak (${peak})`);
    });
  }
}

test('particles and smoke loop exactly over whole cycles only', () => {
  const p = (t) => draw((g) => particles(g, { t, x: C, y: 40, count: 12, cycles: 2, seed: 7, colour: '#9fe040' }));
  assert.ok(same(p(0), p(1)));
  assert.ok(same(p(0), p(0.5)), 'two cycles: half way is the start again');
  const s = (t) => draw((g) => smoke(g, { t, x: C, y: 40, cycles: 2, colour: '#7fb0b8' }));
  assert.ok(same(s(0), s(1)));
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

// Each helper called with one colour and with that colour's steps must draw the same pixels.
const BOTH = {
  particles: (g, cs) => particles(g, { t: 0.3, x: C, y: 40, count: 10, seed: 3, dist: 20, size: 3, ...cs }),
  sparkles: (g, cs) => sparkles(g, { t: 0.3, count: 8, seed: 2, ...cs }),
  smoke: (g, cs) => smoke(g, { t: 0.4, x: C, y: 40, size: 5, rise: 20, ...cs }),
  ring: (g, cs) => ring(g, { t: 0.3, x: C, y: C, r1: 16, ...cs }),
  shards: (g, cs) => shards(g, { t: 0.4, x: C, y: C, size: 6, ...cs }),
  glow: (g, cs) => glow(g, C, C, 8, cs.colours ?? cs.colour),
  twinkle: (g, cs) => twinkle(g, C, C, 2, cs.colours ?? cs.colour),
};
for (const [name, run] of Object.entries(BOTH)) {
  test(`${name}: accepts colour or colours, and uses them`, () => {
    const one = draw((g) => run(g, { colour: '#e2473f' }));
    const list = draw((g) => run(g, { colours: steps('#e2473f') }));
    assert.ok(lit(one) > 0);
    assert.ok(same(one, list), 'colour: c and colours: steps(c) draw the same');
    const other = draw((g) => run(g, { colours: steps('#5fd47a') }));
    assert.ok(!same(list, other), 'a different colour list changes the pixels');
  });
}

test('shards and smoke use their seed', () => {
  const a = draw((g) => shards(g, { t: 0.4, x: C, y: C, seed: 1, colour: '#8f97a8' }));
  const b = draw((g) => shards(g, { t: 0.4, x: C, y: C, seed: 2, colour: '#8f97a8' }));
  assert.ok(!same(a, b));
  const c = draw((g) => smoke(g, { t: 0.4, x: C, y: 40, seed: 1 }));
  const d = draw((g) => smoke(g, { t: 0.4, x: C, y: 40, seed: 2 }));
  assert.ok(!same(c, d));
});

test('one-shots never end on an empty frame, even when pieces fly past the box', () => {
  const box = [10, 10, 30, 30];
  const ends = {
    particles: (g, t) => particles(g, { t, x: 20, y: 20, loop: false, count: 6, dist: 200, gravity: 90, colour: '#4fd8ee', box }),
    shards: (g, t) => shards(g, { t, x: 20, y: 20, count: 5, dist: 300, gravity: 200, colour: '#8f97a8', box }),
    ring: (g, t) => ring(g, { t, x: 20, y: 20, r0: 2, r1: 80, colour: '#5fe0f0', box }),
    'ring off-centre': (g, t) => ring(g, { t, x: 12, y: 27, r1: 40, squash: 0.4, colour: '#5fe0f0', box }),
  };
  for (const [name, run] of Object.entries(ends)) {
    for (const t of ts) {
      const g = draw((s) => run(s, t));
      assert.ok(lit(g) > 0, `${name} t=${t} is not empty`);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        if (!(x >= box[0] && x < box[2] && y >= box[1] && y < box[3])) assert.equal(g.get(x, y), 0, `${name} t=${t} outside the box`);
      }
    }
  }
  // a ring whose centre is outside its box cannot be kept in it: say so
  assert.throws(() => draw((g) => ring(g, { t: 0.5, x: 2, y: 2, colour: '#5fe0f0', box })), /centre .* outside/);
});
