// Framework additions made with batch S19 (dodge-trail, spawn-warp, debris-burst), all in the new module engine/fx-floor.js:
//   figureIn, streaksIn, smearIn     the blur of a small figure; the streaks a fast shape drags; the two together
//   afterimages, speedLines          fading copies of a shape behind a dash; one-shot speed lines beside them
//   lightShape                       any shape painted as light: its colour, a dark rim of its own, a hotter heart
//   floorRing, riftIn                a steady ring of light on a floor seen from above (whole, broken into arcs or tick marks, round or with sides); a jagged tear
//   scrap, SCRAP_SHAPES, splash      solid pieces flung across the floor that come to rest; liquid that lands and flattens
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn } from '../../engine/surface.js';
import { col, tone } from '../../engine/color.js';
import { PI, TAU } from '../../engine/motion.js';
import { steps } from '../../engine/fx.js';
import { figureIn, streaksIn, smearIn, afterimages, speedLines, floorRing, lightShape, riftIn, scrap, SCRAP_SHAPES, splash } from '../../engine/fx-floor.js';

const S = 48, C = 24;
const draw = (fn, w = S, h = S) => { const g = new Surface(w, h); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const onBorder = (g) => { let n = 0; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x] && (x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1)) n++; return n; };
const area = (test, w = S, h = S) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) n++; return n; };
const boxOfTest = (test, w = S, h = S) => { let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
const ts = [0, 0.2, 0.4, 0.6, 0.8, 1];
const CY = steps('#5fe0f0', { core: '#f0ead8', white: false });       // [core, middle, edge, rim]

// Every drawing helper, with an ordinary call, as a function of the clip phase t (and an optional box).
const blur = (cx, cy, s) => figureIn(cx, cy, 12 * s, 20 * s, { lean: 3 * s, legs: 4 * s });
const CASES = {
  afterimages: (g, t, box) => afterimages(g, { t, x: 32, y: C, count: 3, step: 8, shape: blur, smear: 6, colours: CY, white: '#ffffff', box }),
  speedLines: (g, t, box) => speedLines(g, { t, x: 32, y: C, count: 5, length: 22, spread: 12, colours: CY, box }),
  floorRing: (g, t, box) => floorRing(g, { x: C, y: C, r: 6 + 14 * t, gaps: 4, phase: t, colours: CY, box }),
  'floorRing as tick marks': (g, t, box) => floorRing(g, { x: C, y: C, r: 20, thick: 2, gaps: 8, open: 0.7, phase: TAU * t / 8, colours: ['#e2473f', '#e2473f'], rim: false, box }),
  scrap: (g, t, box) => scrap(g, { t, x: C, y: C, count: 7, dist: 20, size: 7, rim: '#231b33', box }),
  splash: (g, t, box) => splash(g, { t, x: C, y: C, count: 7, dist: 20, size: 6, box }),
};

test('every helper is repeatable, draws on every frame, and keeps the 1 px border empty', () => {
  for (const [name, run] of Object.entries(CASES)) for (const t of ts) {
    const a = draw((g) => run(g, t)), b = draw((g) => run(g, t));
    assert.ok(same(a, b), `${name} at t=${t}: two draws differ`);
    assert.ok(lit(a) >= 2, `${name} at t=${t}: ${lit(a)} pixels`);
    assert.equal(onBorder(a), 0, `${name} at t=${t}: a pixel on the frame edge`);
  }
});

test('every helper stays inside a box', () => {
  const box = [10, 12, 40, 36];
  for (const [name, run] of Object.entries(CASES)) for (const t of ts) {
    const g = draw((s) => run(s, t, box));
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g.data[y * S + x]) assert.ok(x >= 10 && x < 40 && y >= 12 && y < 36, `${name} at t=${t}: pixel (${x}, ${y}) outside the box`);
  }
});

// ---- trails ----------------------------------------------------------------------

test('figureIn: fills its box, a head wider than the body, and it can lean and stand on two legs', () => {
  const f = figureIn(C, C, 12, 20);
  assert.deepEqual(boxOfTest(f), { x0: 18, y0: 14, x1: 29, y1: 33 });
  const rowWidth = (test, y) => { let n = 0; for (let x = 0; x < S; x++) if (test(x + 0.5, y + 0.5)) n++; return n; };
  assert.ok(rowWidth(f, 18) > rowWidth(f, 28), 'the head is wider than the body');
  const legs = figureIn(C, C, 12, 20, { legs: 4 });
  assert.equal(legs(C + 0.2, 32.5), false, 'a gap between the legs');
  assert.equal(legs(C + 2.5, 32.5), true, 'a leg beside it');
  assert.equal(legs(C + 0.2, 26.5), true, 'no gap above the legs');
  const lean = figureIn(C, C, 12, 20, { lean: 4 });
  const top = boxOfTest((x, y) => y < 16 && lean(x, y)), foot = boxOfTest((x, y) => y > 31 && lean(x, y));
  assert.ok((top.x0 + top.x1) / 2 > (foot.x0 + foot.x1) / 2 + 2, 'the head is ahead of the feet');
});

test('streaksIn and smearIn: streaks trail from the far side on every other row, and never ahead', () => {
  const ball = ellipseIn(30, C, 6, 6);
  const tail = streaksIn(ball, { reach: 8 }), blurBall = smearIn(ball, { reach: 8 });
  const b = boxOfTest(tail);
  assert.ok(b.x0 < 24 && b.x0 >= 30 - 6 - 8, `streaks reach left to ${b.x0}`);
  assert.ok(b.x1 < 30, 'nothing ahead of the shape');
  for (let y = 18; y < 30; y++) { const any = Array.from({ length: S }, (_, x) => tail(x + 0.5, y + 0.5)).some(Boolean); if (y % 2) assert.equal(any, false, `row ${y} has no streak`); }
  assert.equal(area(blurBall), area(ball) + area(tail), 'smearIn is the shape plus its streaks');
  // another way: streaks that trail downward
  const down = boxOfTest(streaksIn(ball, { reach: 8, angle: 0 }));
  assert.ok(down.y1 > 30 && down.y0 > C - 6, 'angle 0 trails down the screen');
});

test('afterimages: the newest is hottest and lasts, the oldest goes first, white only at t = 0', () => {
  const at = (t, opt = {}) => draw((g) => afterimages(g, { t, x: 34, y: C, count: 3, step: 10, shape: (cx, cy, s) => figureIn(cx, cy, 8 * s, 18 * s), colours: CY, white: '#ffffff', ...opt }));
  const first = at(0);
  assert.ok(count(first, '#ffffff') > 4, 'a white heart on the first frame');
  assert.equal(count(at(0.2), '#ffffff'), 0, 'and on no other');
  // three copies at t = 0: something drawn round each of the three centres
  const near = (g, cx) => { let n = 0; for (let y = 16; y < 32; y++) for (let x = cx - 3; x <= cx + 3; x++) if (g.data[y * S + x]) n++; return n; };
  for (const cx of [34, 24, 14]) assert.ok(near(first, cx) > 20, `a copy at x=${cx}`);
  const mid = at(0.6);
  assert.equal(near(mid, 12), 0, 'the oldest is gone after half the clip');
  assert.ok(near(mid, 33) > 10, 'the newest is still there');
  const last = at(1);
  assert.ok(lit(last) >= 2, 'the last frame is not empty');
  assert.equal(lit(last), count(last, CY.at(-1)), 'and is the rim colour only');
  assert.ok(lit(first) > lit(at(0.4)) && lit(at(0.4)) > lit(last), 'it only shrinks');
  // smear adds streaks; the hottest colour is never a body
  assert.ok(lit(at(0, { smear: 6 })) > lit(first));
  assert.ok(count(at(0.2), CY[0]) < count(at(0.2), CY[1]), 'the core colour is a heart, not a body');
  assert.throws(() => afterimages(new Surface(S, S), { t: 0, x: C, y: C }), /shape/);
});

test('speedLines: one line per row, they shorten, and a pixel of each is left', () => {
  const at = (t) => draw((g) => speedLines(g, { t, x: 36, y: C, count: 4, length: 16, spread: 9, colours: CY }));
  const rows = (g) => { const r = new Set(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g.data[y * S + x]) r.add(y); return r.size; };
  assert.equal(rows(at(0)), 4);
  assert.equal(rows(at(1)), 4, 'every line is still there at the end');
  assert.ok(lit(at(0)) > 3 * lit(at(1)), 'much shorter at the end');
  const b = draw((g) => speedLines(g, { t: 0, x: 36, y: C, count: 4, length: 16, spread: 9, colours: CY })).bounds();
  assert.ok(b.x1 <= 36, 'they trail to the left of x');
});

// ---- marks on the floor ------------------------------------------------------------

test('floorRing: squashed, banded, rimmed; a polygon; gaps', () => {
  const g = draw((s) => floorRing(s, { x: C, y: C, r: 16, squash: 0.5, thick: 2, colours: CY }));
  const b = g.bounds();
  assert.deepEqual([b.x0, b.x1], [C - 17, C + 16], 'r px across, plus the rim');
  assert.ok(b.y1 - b.y0 < (b.x1 - b.x0) * 0.62, 'squashed');
  assert.equal(g.get(C, C), 0, 'open in the middle');
  assert.ok(count(g, CY[0]) > 20 && count(g, CY[2]) > 20 && count(g, CY[3]) > 20, 'a hot line, a band and a rim');
  const cold = draw((s) => floorRing(s, { x: C, y: C, r: 16, squash: 0.5, thick: 2, colours: CY, heat: 0 }));
  assert.equal(count(cold, CY[0]) + count(cold, CY[1]), 0, 'heat 0: one colour and its rim');
  assert.equal(count(draw((s) => floorRing(s, { x: C, y: C, r: 16, colours: CY, rim: false })), CY[3]), 0, 'rim: false');
  const whole = lit(draw((s) => floorRing(s, { x: C, y: C, r: 16, colours: CY })));
  const broken = lit(draw((s) => floorRing(s, { x: C, y: C, r: 16, colours: CY, gaps: 4, open: 0.5 })));
  assert.ok(broken > whole * 0.4 && broken < whole * 0.6, `half the ring is left (${broken} of ${whole})`);
  const a = draw((s) => floorRing(s, { x: C, y: C, r: 16, colours: CY, gaps: 4, open: 0.5 })), turned = draw((s) => floorRing(s, { x: C, y: C, r: 16, colours: CY, gaps: 4, open: 0.5, phase: 0.6 }));
  assert.ok(diff(a, turned) > 20, 'phase moves the breaks');
  const hex = draw((s) => floorRing(s, { x: C, y: C, r: 16, sides: 6, colours: CY }));
  assert.ok(diff(hex, draw((s) => floorRing(s, { x: C, y: C, r: 16, colours: CY }))) > 20, 'six sides are not a circle');
  assert.equal(hex.get(C, C), 0);
  assert.equal(lit(draw((s) => floorRing(s, { x: C, y: C, r: 0.5, colours: CY }))), 2, 'too small: a pixel pair');
});

test('lightShape: the shape, a rim outside it, a heart inside it', () => {
  const disc = ellipseIn(C, C, 8, 5);
  const g = draw((s) => lightShape(s, disc, { colours: CY, heart: '#ffffff' }));
  assert.equal(count(g, CY[2]) + count(g, '#ffffff'), area(disc), 'the shape is the edge colour and the heart');
  assert.ok(count(g, '#ffffff') > 20 && count(g, '#ffffff') < area(disc), 'the heart lies inside');
  assert.ok(count(g, CY[3]) > 20, 'a rim');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g.data[y * S + x] === col(CY[3])) assert.equal(disc(x + 0.5, y + 0.5), false, 'the rim is outside the shape');
  assert.equal(count(draw((s) => lightShape(s, disc, { colours: CY, rim: false })), CY[3]), 0, 'rim: false');
  assert.equal(lit(draw((s) => lightShape(s, disc, { colours: CY, rim: false }))), area(disc), 'no heart unless asked');
  assert.ok(count(draw((s) => lightShape(s, disc, { colours: CY, heart: '#ffffff', inset: 2 })), '#ffffff') < count(g, '#ffffff'), 'a deeper inset, a smaller heart');
  const boxed = draw((s) => lightShape(s, disc, { colours: CY, box: [C, 0, S, S] })).bounds();
  assert.equal(boxed.x0, C, 'inside the box');
});

test('riftIn: as long as asked, jagged, never broken, and it closes to a hairline', () => {
  const open = riftIn(C, C, 30, 10, { seed: 2 }), b = boxOfTest(open);
  assert.deepEqual([b.x0, b.x1], [C - 15, C + 14]);
  assert.ok(b.y1 - b.y0 + 1 <= 11 && b.y1 - b.y0 + 1 >= 6, `it reaches ${b.y1 - b.y0 + 1} px across`);
  for (let x = C - 15; x < C + 15; x++) assert.ok(Array.from({ length: S }, (_, y) => open(x + 0.5, y + 0.5)).some(Boolean), `column ${x} is part of the crack`);
  const shut = riftIn(C, C, 30, 10, { seed: 2, open: 0 });
  assert.ok(area(shut) < area(open) * 0.6 && area(shut) >= 30, 'closed: a thin line, still whole');
  const straight = riftIn(C, C, 30, 10, { seed: 2, jag: 0 });
  const mids = (test) => { const m = []; for (let x = C - 12; x < C + 12; x++) { const ys = []; for (let y = 0; y < S; y++) if (test(x + 0.5, y + 0.5)) ys.push(y); m.push((ys[0] + ys.at(-1)) / 2); } return Math.max(...m) - Math.min(...m); };
  assert.ok(mids(open) >= 3, 'its middle line zigzags');
  assert.ok(mids(straight) <= 1, 'jag 0: a plain slit');
  const up = boxOfTest(riftIn(C, C, 30, 10, { seed: 2, angle: PI / 2 }));
  assert.ok(up.y1 - up.y0 > 25 && up.x1 - up.x0 < 12, 'angle PI / 2 stands it up');
});

// ---- thrown across the floor -----------------------------------------------------------

test('scrap: every shape, pieces fly out and rest, `keep` of them stay, rims are the colour asked', () => {
  assert.deepEqual([...SCRAP_SHAPES], ['plates', 'shards', 'bolts']);
  assert.ok(Object.isFrozen(SCRAP_SHAPES));
  const INK = '#231b33';
  for (const shape of SCRAP_SHAPES) {
    const at = (t, opt = {}) => draw((g) => scrap(g, { t, x: C, y: C, count: 6, keep: 3, shape, dist: 16, size: 7, colour: '#9aa6c0', rim: INK, ...opt }));
    const b0 = at(0).bounds(), b1 = at(0.5).bounds();
    assert.ok(b1.x1 - b1.x0 > b0.x1 - b0.x0 + 8, `${shape}: they spread`);
    // at the end: three pieces, each a separate inked island
    const end = at(1), seen = new Uint8Array(S * S);
    let islands = 0;
    for (let i = 0; i < S * S; i++) {
      if (!end.data[i] || seen[i]) continue;
      islands++;
      const stack = [i];
      while (stack.length) { const j = stack.pop(); if (seen[j] || !end.data[j]) continue; seen[j] = 1; const x = j % S; if (x > 0) stack.push(j - 1); if (x < S - 1) stack.push(j + 1); if (j >= S) stack.push(j - S); if (j < S * S - S) stack.push(j + S); }
    }
    assert.equal(islands, 3, `${shape}: three pieces are left on the floor`);
    assert.ok(count(end, INK) > 20, `${shape}: inked`);
    assert.ok(same(end, at(1)), 'repeatable');
    assert.ok(same(at(0.9, { keep: 6 }), at(1, { keep: 6 })), `${shape}: at rest before the end`);
    assert.equal(count(at(0.5, { rim: null }), INK), 0, 'no rim unless asked');
    assert.ok(diff(at(0.4), at(0.4, { spin: 0 })) > 10, `${shape}: spin changes the flight`);
  }
  assert.ok(diff(draw((g) => scrap(g, { t: 1, x: C, y: C, shape: 'plates' })), draw((g) => scrap(g, { t: 1, x: C, y: C, shape: 'shards' }))) > 10);
  const heap = draw((g) => scrap(g, { t: 0, x: C, y: C, dist: 16 })).bounds(), started = draw((g) => scrap(g, { t: 0, x: C, y: C, dist: 16, from: 0.4 })).bounds();
  assert.ok(started.x1 - started.x0 > heap.x1 - heap.x0, '`from` starts them already apart');
  assert.throws(() => scrap(new Surface(S, S), { t: 0, x: C, y: C, shape: 'gears' }), /plates, shards, bolts/);
});

test('splash: a ball that bursts, blobs that fly, puddles that stay and are flat', () => {
  const GOO = '#9fe040';
  const at = (t, opt = {}) => draw((g) => splash(g, { t, x: C, y: C, count: 6, dist: 16, size: 6, colour: GOO, ...opt }));
  const b0 = at(0).bounds(), b1 = at(1).bounds();
  assert.ok(b0.x1 - b0.x0 < 16, 'it starts as one ball');
  assert.ok(b1.x1 - b1.x0 > 24, 'and ends spread over the floor');
  assert.ok(b1.y1 - b1.y0 < b1.x1 - b1.x0, 'squashed with the floor');
  assert.ok(lit(at(1)) > lit(at(0)), 'the puddles cover more than the ball did');
  const end = at(1);
  assert.ok(count(end, GOO) > 60, 'puddles in the liquid colour');
  assert.ok(count(end, tone(GOO, -1)) > 30, 'rimmed with its dark tone');
  assert.ok(end.get(C, C) !== 0, 'a puddle where it burst');
  assert.ok(lit(at(1, { pool: 0 })) < lit(end) - 20, 'pool: 0 leaves out the middle puddle');
  assert.ok(lit(at(1, { drops: 0 })) < lit(end), 'droplets can be left out');
  assert.equal(count(at(1, { rim: '#ff00ff' }), tone(GOO, -1)), 0, 'a rim colour of your own');
  assert.ok(count(at(1, { rim: '#ff00ff' }), '#ff00ff') > 30);
  assert.ok(count(at(0.3, { glint: '#ffffff' }), '#ffffff') >= 1, 'a wet glint on the flying blobs');
});
