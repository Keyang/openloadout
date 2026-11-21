// Framework additions made with batch P12 (platformer projectiles and effects: arrow, fireball,
// boss rock, dust puff, hit spark), all in engine/fx.js:
//   streaks    speed lines streaming away behind a moving thing
//   flame      a flame in nested layers: rippling tongues, with an optional round head (a fireball)
//   rockIn     shape test for a rough rock outline that can be turned
//   rock       a rigid rock with a lit facet, cracks, chips and a patch that turn with it
//   puffs      soft puffs thrown along a direction (round, wispy or chunky), resting on a floor row
//   starburst  tapered spikes pointing outward from a point (a hit star, a slash)
//   rockBreak  the rock of rock() cut into wedges that fly apart, fall and wear down to rubble (added in fix round 1)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, ramp, tone } from '../../engine/color.js';
import { PI, TAU } from '../../engine/motion.js';
import { steps, rockIn, rock, puffs } from '../../engine/fx.js';

const S = 32, C = 16;
const draw = (fn, w = S, h = S) => { const g = new Surface(w, h); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const borderClear = (g) => { const b = g.bounds(); return !b || (b.x0 >= 1 && b.y0 >= 1 && b.x1 <= g.w - 2 && b.y1 <= g.h - 2); };
test('rockIn: a rough outline round its centre that turns rigidly', () => {
  const area = (opt) => lit(draw((g) => g.fill(0, 0, S, S, rockIn(C, C, 9, opt), '#ffffff')));
  const a0 = area({ seed: 2 });
  assert.ok(a0 > 120 && a0 < 3.2 * 81, `about a disc of radius 9: ${a0}`);
  assert.ok(rockIn(C, C, 9, { seed: 2 })(C, C), 'holds its centre');
  assert.ok(!rockIn(C, C, 9, { seed: 2 })(C + 9.5, C), 'nothing beyond r');
  for (const k of [1, 2, 3, 5]) assert.ok(Math.abs(area({ seed: 2, angle: (k * TAU) / 8 }) - a0) <= a0 * 0.06, `turning by ${k}/8 keeps its size`);
  const full = draw((g) => g.fill(0, 0, S, S, rockIn(C, C, 9, { seed: 2, angle: TAU }), '#ffffff')), none = draw((g) => g.fill(0, 0, S, S, rockIn(C, C, 9, { seed: 2 }), '#ffffff'));
  let off = 0; for (let i = 0; i < full.data.length; i++) if (full.data[i] !== none.data[i]) off++;
  assert.ok(off <= 2, 'a whole turn is the same shape');
  assert.ok(area({ seed: 2, squash: 0.6 }) < a0 * 0.7, 'squash flattens it');
  assert.ok(area({ seed: 2, jag: 0.5 }) < area({ seed: 2, jag: 0.05 }), 'jag pulls corners in');
  // a quarter turn swaps a slab's width and height
  const bw = (angle) => { const b = draw((g) => g.fill(0, 0, S, S, rockIn(C, C, 10, { seed: 1, squash: 0.5, jag: 0.1, angle }), '#ffffff')).bounds(); return [b.x1 - b.x0, b.y1 - b.y0]; };
  const [w0, h0] = bw(0), [w1, h1] = bw(PI / 2);
  assert.ok(w0 > h0 + 4 && h1 > w1 + 4, `slab ${w0}x${h0} turns into ${w1}x${h1}`);
});

test('puffs, one-shot: thrown along the ground, never empty, never below the floor', () => {
  const D = steps('#8f97a8', { core: '#f0ead8', white: false });
  for (const shape of ['round', 'wispy', 'chunky']) {
    const run = (t, extra = {}) => draw((g) => puffs(g, { t, x: 18, y: 29, loop: false, count: 3, seed: 1, angle: PI / 2, dist: 9, rise: 5, size: 3, floor: 30, shape, colours: D, ...extra }));
    for (const t of ts) {
      const g = run(t), b = g.bounds();
      assert.ok(lit(g) >= 2, `${shape} t=${t}: at least two pixels`);
      assert.ok(borderClear(g), `${shape} t=${t}: inside the border`);
      assert.ok(b.y1 <= 30, `${shape} t=${t}: nothing below the floor row (lowest ${b.y1})`);
      for (const v of new Set(g.data.filter((x) => x))) assert.ok(D.some((c) => col(c) === v), `${shape}: only its own colours`);
    }
    // it travels to the right and thins out
    assert.ok(run(0.6).bounds().x1 > run(0).bounds().x1 + 3, `${shape}: thrown to the right`);
    assert.ok(lit(run(1)) < lit(run(0.4)) * 0.7, `${shape}: thins out (${lit(run(0.4))} px, then ${lit(run(1))})`);
    assert.ok(lit(run(1)) >= 3, `${shape}: one speck per puff is left`);
    // more rise lifts the old puffs
    const top = (r) => run(0.8, { rise: r }).bounds().y0;
    assert.ok(top(12) < top(0), `${shape}: rise lifts them`);
  }
  const shapes = ['round', 'wispy', 'chunky'].map((shape) => draw((g) => puffs(g, { t: 0.4, x: 16, y: 20, loop: false, count: 3, seed: 1, size: 4, shape, colours: D })));
  assert.ok(!same(shapes[0], shapes[1]) && !same(shapes[0], shapes[2]) && !same(shapes[1], shapes[2]), 'the three shapes differ');
  // lobes make each puff a small cloud: wider, with a flat underside on the floor row
  const cloud = (lobes) => draw((g) => puffs(g, { t: 0.3, x: 16, y: 29, loop: false, count: 1, dist: 0, rise: 0, size: 4, floor: 30, lobes, colours: D })).bounds();
  const c1 = cloud(1), c3 = cloud(3);
  assert.ok(c3.x1 - c3.x0 >= c1.x1 - c1.x0 + 4, 'three lobes are wider than one');
  assert.equal(c3.y1, 30); assert.equal(c1.y1, 30);
  // puffs that overlap join into one cloud: every rim pixel is on the outside (it touches see-through)
  const pair = draw((g) => puffs(g, { t: 0.3, x: 16, y: 16, loop: false, count: 5, arc: TAU, dist: 5, rise: 0, size: 4, lobes: 3, colours: D }));
  let rims = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    if (pair.get(x, y) !== col(D.at(-1))) continue;
    rims++;
    assert.ok(!pair.get(x - 1, y) || !pair.get(x + 1, y) || !pair.get(x, y - 1) || !pair.get(x, y + 1), `a rim pixel inside the cloud at ${x},${y}`);
  }
  assert.ok(rims > 20);
  // pushed against the box edge, a one-shot still leaves its specks inside
  const far = draw((g) => puffs(g, { t: 1, x: 28, y: 29, loop: false, count: 4, dist: 30, floor: 30, colours: D }));
  assert.ok(lit(far) >= 2 && borderClear(far));
});
