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
import { steps, streaks, flame, rockIn, rock, puffs, starburst, rockBreak } from '../../engine/fx.js';

const S = 32, C = 16;
const draw = (fn, w = S, h = S) => { const g = new Surface(w, h); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const borderClear = (g) => { const b = g.bounds(); return !b || (b.x0 >= 1 && b.y0 >= 1 && b.x1 <= g.w - 2 && b.y1 <= g.h - 2); };
const centroid = (g, hex) => { const c = col(hex); let sx = 0, sy = 0, n = 0; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x] === c) { sx += x; sy += y; n++; } return n ? [sx / n, sy / n] : null; };

// ---- streaks ------------------------------------------------------------------

test('streaks: a loop that closes, always shows a line, and stays behind the thing', () => {
  const run = (t) => draw((g) => streaks(g, { t, x: 10, y: 8, count: 3, length: 6, reach: 6, spread: 3, colours: ['#ffffff', '#f0ead8'] }), 32, 16);
  assert.ok(same(run(0), run(1)), 't = 0 and t = 1 match');
  for (const t of ts) {
    const g = run(t), b = g.bounds();
    assert.ok(lit(g) >= 2, `t=${t}: at least two pixels`);
    assert.ok(borderClear(g), `t=${t}: inside the 1 px border`);
    assert.ok(b.x1 <= 10, `t=${t}: lines stream to the left of x`);
  }
  assert.ok(!same(run(0), run(0.25)), 'the lines move');
  assert.ok(same(run(0.3), run(0.3)), 'repeatable');
  // another direction: upward lines stay above y
  const up = draw((g) => streaks(g, { t: 0.4, x: 16, y: 20, angle: PI, count: 2, length: 5 }));
  assert.ok(up.bounds().y1 <= 20);
  // a box is respected
  const boxed = draw((g) => streaks(g, { t: 0.4, x: 10, y: 8, count: 3, length: 9, reach: 9, box: [6, 4, 12, 12] }), 32, 16);
  const bb = boxed.bounds();
  assert.ok(!bb || (bb.x0 >= 6 && bb.x1 < 12 && bb.y0 >= 4 && bb.y1 < 12));
});

// ---- flame --------------------------------------------------------------------

test('flame: nested layers from a rim to a core, inside the frame, in a loop that closes', () => {
  const F = steps('#e08a2c', { core: '#f0ead8', white: false });           // [core, mid, edge, rim]
  const ball = (t, extra = {}) => draw((g) => flame(g, { t, x: 20, y: 16, head: 5, angle: -PI / 2, length: 14, width: 4, sway: 2, colours: F, ...extra }));
  for (const t of ts) {
    const g = ball(t);
    assert.ok(borderClear(g), `t=${t}: inside the 1 px border`);
    for (const c of F) assert.ok(count(g, c) > 0, `t=${t}: layer ${c} is drawn`);
    const used = new Set(g.data.filter((v) => v));
    assert.equal(used.size, F.length, 'only its own colours');
    // every drawn pixel on the outside is the rim colour: nothing hot touches the air
    const rim = col(F.at(-1));
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const v = g.data[y * S + x];
      if (!v || v === rim) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(g.data[(y + dy) * S + x + dx], 0, `t=${t}: a hot pixel at ${x},${y} touches see-through`);
    }
    // the core never touches the rim or the edge layer: one layer per step inward
    const core = col(F[0]), edge = col(F[2]);
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      if (g.data[y * S + x] !== core) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = g.data[(y + dy) * S + x + dx]; assert.ok(v !== rim && v !== edge && v !== 0, `t=${t}: core next to the outside at ${x},${y}`); }
    }
  }
  assert.ok(same(ball(0), ball(1)), 'whole ripples per loop: t = 0 and t = 1 match');
  assert.ok(!same(ball(0), ball(0.25)), 'the tail ripples');
  // the tail streams to the left of the head, the head leads on the right
  const b = ball(0).bounds();
  assert.ok(b.x0 <= 8 && b.x1 >= 24 && b.x1 <= 26, `head on the right, tail to the left: ${JSON.stringify(b)}`);
  // more heat, more core
  assert.ok(count(ball(0, { heat: 1 }), F[0]) > count(ball(0, { heat: 0 }), F[0]));
});

test('flame without a head is a torch flame standing on its foot; several tongues make one body', () => {
  const F = steps('#e08a2c', { white: false });
  const torch = (t, extra = {}) => draw((g) => flame(g, { t, x: 16, y: 28, angle: PI, length: 20, width: 5, colours: F, ...extra }));
  for (const t of ts) {
    const g = torch(t), b = g.bounds();
    assert.ok(borderClear(g));
    assert.ok(b.y1 <= 29 && b.y0 <= 10, `rises from its foot: ${JSON.stringify(b)}`);
  }
  assert.ok(same(torch(0), torch(1)));
  const one = torch(0.3), three = torch(0.3, { tongues: [{}, { angle: PI - 0.5, length: 12, width: 3, phase: 0.3 }, { angle: PI + 0.5, length: 12, width: 3, phase: 0.6 }] });
  assert.ok(lit(three) > lit(one), 'side tongues add to the flame');
  const boxed = draw((g) => flame(g, { t: 0.2, x: 16, y: 28, angle: PI, length: 30, width: 6, colours: F, box: [8, 12, 24, 30] })).bounds();
  assert.ok(boxed.x0 >= 8 && boxed.x1 < 24 && boxed.y0 >= 12 && boxed.y1 < 30, 'the box is respected');
  // a single colour works too
  assert.ok(lit(draw((g) => flame(g, { t: 0, x: 16, y: 28, colour: '#4fd8ee' }))) > 20);
  // `at` moves a tongue's foot: a lick that starts 6 px to the right reaches further right
  const lick = (at) => draw((g) => flame(g, { t: 0, x: 12, y: 28, colours: F, sway: 0, tongues: [{ angle: PI, length: 16, width: 3 }, { angle: PI, length: 10, width: 2, at }] })).bounds().x1;
  assert.ok(lick([6, 0]) >= lick([0, 0]) + 4);
});

// ---- rockIn and rock ----------------------------------------------------------

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

test('rock: a shaded lump whose patch and cracks turn with it, while the light stays put', () => {
  const R = ramp('#8f97a8'), moss = '#a4c44a';
  const run = (angle, extra = {}) => draw((g) => rock(g, { x: C, y: C, r: 9, angle, seed: 3, colour: '#8f97a8', ...extra }));
  for (let i = 0; i < 8; i++) {
    const g = run((i * TAU) / 8, { cracks: 3, chips: 2, patch: { colour: moss, at: 0 } });
    assert.ok(borderClear(g), `turn ${i}: inside the border`);
    const bare = run((i * TAU) / 8);
    assert.ok(count(bare, R.base) > 20 && count(bare, R.dark) > 4 && count(bare, R.light) > 4, `turn ${i}: three tones of stone`);
    assert.ok(count(g, moss) > 6, `turn ${i}: the patch shows`);
    assert.ok(count(g, tone(moss, -1)) > 3, `turn ${i}: the patch has a dark line where it meets the stone`);
    // the lit facet is toward the top right, the shade toward the bottom left
    const [lx, ly] = centroid(run((i * TAU) / 8), R.light), [dx, dy] = centroid(run((i * TAU) / 8), R.dark);
    assert.ok(lx > dx && ly < dy, `turn ${i}: light top right (${lx.toFixed(1)}, ${ly.toFixed(1)}), shade bottom left (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
  }
  // the patch goes round with the rock: a quarter turn clockwise takes it from the right to the bottom
  const p0 = centroid(run(0, { patch: { colour: moss, at: 0 } }), moss), p1 = centroid(run(PI / 2, { patch: { colour: moss, at: 0 } }), moss);
  assert.ok(p0[0] > C + 2 && Math.abs(p0[1] - C) < 4, `patch on the right at angle 0: ${p0}`);
  assert.ok(p1[1] > C + 2 && Math.abs(p1[0] - C) < 4, `patch at the bottom after a quarter turn: ${p1}`);
  // cracks and chips change the picture; a plain rock has no patch colour
  assert.ok(!same(run(0), run(0, { cracks: 3 })));
  assert.ok(lit(run(0, { chips: 3 })) < lit(run(0)), 'chips bite pieces out');
  assert.equal(count(run(0), moss), 0);
  // it returns its shape test, and a box is respected
  const g = new Surface(S, S), inside = rock(g, { x: C, y: C, r: 9, seed: 3, box: [C, 1, 31, 31] });
  assert.equal(typeof inside, 'function');
  assert.ok(inside(C + 0.5, C + 0.5));
  assert.ok(g.bounds().x0 >= C);
  assert.ok(same(run(1.1, { cracks: 2 }), run(1.1, { cracks: 2 })), 'repeatable');
});

// ---- puffs --------------------------------------------------------------------

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

test('puffs, looping: the loop closes and a puff is always in view, even with two', () => {
  const D = steps('#8f97a8', { core: '#f0ead8', white: false });
  for (const n of [2, 3, 6]) {
    const run = (t) => draw((g) => puffs(g, { t, x: 16, y: 28, loop: true, count: n, seed: 2, angle: PI, arc: 0.4, dist: 18, rise: 0, size: 2.2, colours: D }));
    assert.ok(same(run(0), run(1)), `${n} puffs: t = 0 and t = 1 match`);
    for (let f = 0; f < 12; f++) {
      const g = run(f / 12);
      assert.ok(lit(g) >= 4, `${n} puffs, t=${f}/12: something to see (${lit(g)} px)`);
      assert.ok(borderClear(g));
    }
    assert.ok(!same(run(0), run(1 / 6)));
  }
});

// ---- starburst ----------------------------------------------------------------

test('starburst: spikes round a point, joined into a star at r0 = 0, with an optional rim', () => {
  const M = C - 0.5;                                    // a pixel centre: the star is the same on both sides
  const star = (extra = {}) => draw((g) => starburst(g, { x: M, y: M, count: 4, r1: 10, width: 5, colour: '#ffffff', ...extra }));
  const g = star();
  assert.ok(g.get(C - 1, C - 1) && g.get(C, C - 1) && g.get(C - 1, C), 'the middle is filled');
  const b = g.bounds();
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1], [C - 11, C + 9, C - 11, C + 9], 'four spikes reach r1 up, down, left and right');
  // mirror symmetry about the centre pixel, both ways
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    assert.equal(!!g.get(x, y), !!g.get(2 * (C - 1) - x, y), `mirror left-right at ${x},${y}`);
    assert.equal(!!g.get(x, y), !!g.get(x, 2 * (C - 1) - y), `mirror up-down at ${x},${y}`);
  }
  // a rim surrounds it and nothing white touches the air
  const rimmed = star({ rim: '#f2c230' });
  assert.equal(count(rimmed, '#ffffff'), count(g, '#ffffff'));
  assert.ok(count(rimmed, '#f2c230') > 20);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) if (rimmed.data[y * S + x] === col('#ffffff')) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(rimmed.data[(y + dy) * S + x + dx], 0);
  // more spikes, more star; a turn moves it; spikes that start away from the middle leave it open
  assert.ok(lit(star({ count: 8 })) > lit(g));
  assert.ok(!same(star({ turn: PI + 0.4 }), g));
  const open = star({ r0: 5, r1: 12, width: 2 });
  assert.equal(open.get(C - 1, C - 1), 0);
  // a spike thinner than a pixel is still an unbroken line from r0 to r1
  const thin = draw((gg) => starburst(gg, { x: M, y: M, count: 1, turn: PI / 2, r0: 2, r1: 12, width: 0.2, colour: '#ffffff' }));
  for (let x = C + 1; x < C + 11; x++) assert.ok(thin.get(x, C - 1), `thin spike has a pixel at x=${x}`);
  assert.equal(lit(thin), 11, 'and it is one pixel thick');
  // two spikes make a slash; inside the border even when asked to go past it
  const slash = draw((gg) => starburst(gg, { x: C, y: C, count: 2, turn: PI * 0.75, r1: 30, width: 4, colour: '#ffffff', rim: '#e08a2c' }));
  assert.ok(borderClear(slash) && lit(slash) > 30);
  assert.equal(lit(draw((gg) => starburst(gg, { x: C, y: C, r0: 5, r1: 5 }))), 0, 'no length, nothing drawn');
  assert.equal(tone('#ffffff', 0), '#ffffff');
});

// ---- rockBreak (fix round 1: the boss rock shrank on the first frame of its shatter) ----

test('rockBreak: the whole rock at t = 0, wedges that part without shrinking, rubble at the end', () => {
  const INKC = '#231b33', moss = '#a4c44a';
  const base = { x: C, y: C, r: 9, seed: 4, sides: 9, jag: 0.16, colour: '#8f97a8', chips: 1 };
  const run = (t, extra = {}) => draw((g) => rockBreak(g, { ...base, t, ...extra }));
  const inked = (t, extra = {}) => { const g = run(t, extra); g.outline(INKC); return g; };
  const width = (g) => { const b = g.bounds(); return b.x1 - b.x0 + 1; };
  const height = (g) => { const b = g.bounds(); return b.y1 - b.y0 + 1; };
  // t = 0: exactly the footprint of rock() with the same settings
  const whole = draw((g) => rock(g, { ...base }));
  const start = run(0);
  for (let i = 0; i < start.data.length; i++) assert.equal(!!start.data[i], !!whole.data[i], `same footprint as rock() at pixel ${i}`);
  // the first steps never make it smaller: the footprint only grows while the wedges part, and the pixel count holds
  let last = inked(0);
  for (const t of [0.06, 0.1, 0.2, 0.3, 0.45]) {
    const g = inked(t);
    assert.ok(width(g) >= width(last) && height(g) >= height(last), `t=${t}: ${width(g)}x${height(g)} is no smaller than ${width(last)}x${height(last)}`);
    if (t <= 0.3) assert.ok(lit(g) >= lit(inked(0)), `t=${t}: ${lit(g)} pixels, the whole rock has ${lit(inked(0))}`);     // later the pieces wear down
    last = g;
  }
  // as soon as the wedges part, the outline draws cracks inside the rock's old footprint
  const early = inked(0.1);
  let cracks = 0;
  for (let i = 0; i < early.data.length; i++) if (early.data[i] === col(INKC) && whole.data[i]) cracks++;
  assert.ok(cracks >= 8, `ink cracks between the wedges: ${cracks}`);
  // every frame: inside the border, three tones of stone while the pieces are big, never empty, repeatable
  const R = ramp('#8f97a8');
  for (const t of ts) {
    const g = run(t);
    assert.ok(lit(g) >= 2 * 4, `t=${t}: every piece still shows`);
    assert.ok(borderClear(g), `t=${t}: inside the 1 px border`);
    assert.ok(borderClear(inked(t, { box: [2, 2, 30, 30] })), `t=${t}: with a box one pixel in, the ink outline stays inside the border too`);
    if (t <= 0.5) assert.ok(count(g, R.base) > 20 && count(g, R.dark) > 4 && count(g, R.light) > 2, `t=${t}: three tones`);
    assert.ok(same(g, run(t)), 'repeatable');
  }
  // the pieces wear down and end apart: less stone at the end, and as many separate lumps as wedges
  assert.ok(lit(run(1)) < lit(run(0)) * 0.6, 'rubble is smaller than the rock');
  const lumps = (g) => {
    const seen = new Uint8Array(g.data.length); let n = 0;
    for (let i = 0; i < g.data.length; i++) {
      if (!g.data[i] || seen[i]) continue;
      n++; const todo = [i]; seen[i] = 1;
      while (todo.length) { const j = todo.pop(), x = j % g.w, y = (j - x) / g.w; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= g.w || yy >= g.h) continue; const q = yy * g.w + xx; if (g.data[q] && !seen[q]) { seen[q] = 1; todo.push(q); } } }
    }
    return n;
  };
  for (const pieces of [3, 4, 6]) assert.equal(lumps(run(1, { pieces })), pieces, `${pieces} wedges end as ${pieces} lumps`);
  assert.ok(!same(run(0.5, { pieces: 3 }), run(0.5, { pieces: 6 })));
  // they fall: the stone's centre is lower at the end than at the start
  const cy = (g) => { let s = 0, n = 0; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) { s += y; n++; } return s / n; };
  assert.ok(cy(run(1)) > cy(run(0)) + 1.5, 'gravity pulls the pieces down');
  // a patch rides on its pieces from start to end; a bare rock has none
  for (const t of [0, 0.3, 0.7, 1]) assert.ok(count(run(t, { patch: { colour: moss, at: 3.6 } }), moss) >= 2, `t=${t}: the patch is still on its pieces`);
  assert.equal(count(run(0.3), moss), 0);
  // a slab breaks into flat pieces: wider than tall at the start of the break
  const slab = inked(0.1, { squash: 0.6, sides: 6, r: 11 });
  assert.ok(width(slab) > height(slab) + 3, `slab pieces ${width(slab)}x${height(slab)}`);
  // a box is respected, and a big rock near the edge keeps its pieces inside it
  const big = draw((g) => rockBreak(g, { ...base, r: 13, t: 1, dist: 14, box: [2, 2, 30, 30] }));
  const b = big.bounds();
  assert.ok(b.x0 >= 2 && b.y0 >= 2 && b.x1 <= 29 && b.y1 <= 29, `inside the box: ${JSON.stringify(b)}`);
  // seam: the cut lines flash in a colour while the rock is still whole, on the same footprint
  const flash = run(0, { seam: '#ffffff' });
  assert.ok(count(flash, '#ffffff') >= 10, `white cut lines: ${count(flash, '#ffffff')}`);
  assert.equal(lit(flash), lit(start));
});
