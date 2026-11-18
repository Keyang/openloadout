// Framework additions made with batch P07 (platformer creatures: spore-hopper, crow-scout), all in the new
// module engine/creature.js:
//   squashStretch   the two size multipliers of a squashed or stretched body, area kept
//   hopArc          one hop on the style guide's beats: crouch, leave the ground, top, land
//   flapCycle       one wing beat: a fast down-stroke, a trailing tip, a fold on the way up, the body's rise
//   leafIn          a pointed leaf, petal or feather between two points
//   fanTips, fanIn  a fan of such blades from one root (tail fan, crest, collar of leaves)
//   bulbHalf, bulbIn   an onion-shaped body, widest low down, drawn up to a neck
//   springIn        a coiled spring seen from the side, which packs flat and opens
//   featherWing     a feathered wing hinged at the shoulder, with ragged flight feathers
//   nudgeInside     how far to move a drawing so it stays inside the frame
//   flutterIn       loose feathers or leaves thrown out, then drifting down and thinning out
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PI } from '../../engine/motion.js';
import { squashStretch, hopArc, flapCycle, leafIn, fanTips, fanIn, bulbHalf, bulbIn, springIn, featherWing, nudgeInside, flutterIn } from '../../engine/creature.js';

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const draw = (test, w = 48, h = 48) => new Surface(w, h).fill(0, 0, w, h, test, '#ffffff');
const frames = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => f / 8);

// ---- squashStretch --------------------------------------------------------------

test('squashStretch keeps the area: wider means shorter by the same factor', () => {
  assert.deepEqual(squashStretch(0), [1, 1]);
  for (const k of [-0.5, -0.2, 0.1, 0.4]) {
    const [wide, tall] = squashStretch(k);
    near(wide * tall, 1);
    assert.equal(wide > 1, k > 0, `squash ${k}: wider only when squashed`);
  }
  assert.deepEqual(squashStretch(5), squashStretch(0.6), 'held at the limit');
  assert.deepEqual(squashStretch(5, 0.3), squashStretch(0.3, 0.3));
});

// ---- hopArc -----------------------------------------------------------------------

test('hopArc follows the hop beats of an 8-frame clip: crouch 0 to 1, leave on 2, top on 4, land on 6', () => {
  const f = frames.map((t) => hopArc(t));
  assert.equal(f[0].lift, 0); assert.equal(f[1].lift, 0);
  assert.ok(f[1].squash > 0.95, 'frame 1 is the deepest crouch');
  assert.ok(f[1].legs < 0.05, 'frame 1: the legs are pressed flat');
  assert.ok(f[2].squash < -0.9 && f[2].legs > 1.9, 'frame 2: stretched, legs at twice their length');
  assert.ok(f[2].lift > 0 && f[2].lift < 0.4, `frame 2 has only just left the ground (${f[2].lift})`);
  assert.ok(f[4].lift > 0.95, 'frame 4 is the top');
  for (const x of f) assert.ok(x.lift <= f[4].lift + 1e-9 && x.lift >= 0 && x.lift <= 1);
  assert.equal(f[6].lift, 0);
  assert.ok(f[6].squash > 0.95 && f[6].legs < 0.05, 'frame 6: landed and squashed');
  assert.ok(f[3].fall < 0 && f[5].fall > 0, 'rising on 3, falling on 5');
  assert.equal(f[4].air, true); assert.equal(f[6].air, false);
});

test('hopArc closes its loop and never jumps', () => {
  const a = hopArc(0), b = hopArc(1);
  near(a.squash, b.squash); near(a.legs, b.legs); near(a.lift, b.lift);
  for (let i = 0; i < 400; i++) {
    const p = hopArc(i / 400), q = hopArc((i + 1) / 400);
    assert.ok(Math.abs(p.lift - q.lift) < 0.06 && Math.abs(p.squash - q.squash) < 0.12 && Math.abs(p.legs - q.legs) < 0.12, `a jump at t = ${i / 400}`);
  }
});

// ---- flapCycle ----------------------------------------------------------------------

test('flapCycle: the down-stroke starts on frame 1, ends on frame 4 and is shorter than the up-stroke', () => {
  const f = frames.map((t) => flapCycle(t));
  assert.ok(f[1].arm > 0.95, `frame 1 is the top of the beat (${f[1].arm})`);
  assert.ok(f[4].arm < -0.95, `frame 4 is the bottom (${f[4].arm})`);
  for (const x of f) assert.ok(x.arm >= -1 && x.arm <= 1 && x.fold >= 0 && x.fold <= 1 && x.lift >= -1 && x.lift <= 1);
  let down = 0;
  for (let i = 0; i < 1000; i++) if (flapCycle(i / 1000).stroke === 'down') down++;
  assert.ok(down > 300 && down < 500, `the down-stroke takes ${down / 10}% of the beat`);
  assert.equal(new Set(f.map((x) => Math.round(x.arm * 20))).size, 8, 'every frame of 8 has its own wing angle');
});

test('flapCycle: the tip trails the arm, the wing folds only on the way up, and the body rises as the wings go down', () => {
  const mid = flapCycle(0.3);                       // half-way down
  assert.equal(mid.stroke, 'down');
  assert.ok(mid.tip > mid.arm, 'on the way down the tip is still higher than the arm');
  assert.equal(mid.fold, 0);
  const up = flapCycle(0.8);
  assert.equal(up.stroke, 'up');
  assert.ok(up.fold > 0.5 && up.tip < up.arm, 'on the way up the wing is pulled in and the tip hangs below the arm');
  assert.ok(flapCycle(0.58).lift > 0.9, 'the body is highest just after the bottom of the stroke');
  assert.ok(flapCycle(0.16).lift < -0.9, 'and lowest just after the top');
  const a = flapCycle(0), b = flapCycle(1);
  near(a.arm, b.arm); near(a.tip, b.tip); near(a.fold, b.fold); near(a.lift, b.lift);
});

// ---- leafIn, fanIn ------------------------------------------------------------------

test('leafIn is widest at its belly and comes to a point at the tip', () => {
  const g = draw(leafIn(4, 10, 24, 10, 6, { belly: 0.4 }), 32, 20);
  const b = g.bounds();
  assert.ok(b.x0 === 4 && b.x1 >= 21 && b.x1 <= 23, `runs from the stem towards the tip (${b.x0}..${b.x1})`);
  const tall = (x) => { let n = 0; for (let y = 0; y < 20; y++) if (g.get(x, y)) n++; return n; };
  assert.equal(tall(12), 6, 'six pixels across at the belly');
  assert.ok(tall(21) <= 2 && tall(21) >= 1, 'a point at the tip');
  assert.ok(tall(4) < tall(12) && tall(4) >= 1, 'narrower at the stem end');
  assert.equal(lit(draw(leafIn(4, 10, 24, 10, 6, { blunt: 1 }), 32, 20)) > lit(g), true, 'blunt widens the stem end');
});

test('fanTips spreads the blades evenly between the two angles, and fanIn fills each of them', () => {
  const tips = fanTips(24, 24, PI / 2, PI, 4, 10);
  assert.equal(tips.length, 4);
  near(tips[0][0], 34); near(tips[0][1], 24);           // PI / 2 is picture-right
  near(tips[3][0], 24); near(tips[3][1], 14);           // PI is up
  for (const [x, y] of tips) near(Math.hypot(x - 24, y - 24), 10);
  const graded = fanTips(24, 24, 0, 1, 3, [6, 12]);
  near(Math.hypot(graded[0][0] - 24, graded[0][1] - 24), 6); near(Math.hypot(graded[2][0] - 24, graded[2][1] - 24), 12);
  const inside = fanIn(24, 24, PI / 2, PI, 4, 10, 4);
  for (const [x, y] of tips) assert.ok(inside(24 + (x - 24) * 0.6, 24 + (y - 24) * 0.6), 'part-way along every blade is inside');
  assert.ok(!inside(24, 34) && !inside(14, 24), 'nothing on the other side of the root');
  assert.equal(fanTips(0, 0, 0, 1, 1, 5).length, 1, 'one blade sits in the middle');
});

// ---- bulbIn -----------------------------------------------------------------------

test('bulbHalf is widest low down and narrows to the neck', () => {
  near(bulbHalf(0.34), 1);
  near(bulbHalf(1), 0.3);
  near(bulbHalf(0), 0.35);
  let last = 1;
  for (let v = 0.34; v <= 1.0001; v += 0.02) { const w = bulbHalf(Math.min(v, 1)); assert.ok(w <= last + 1e-9, `narrower all the way up (v = ${v})`); last = w; }
  near(bulbHalf(0.5, { low: 0.5, neck: 0.1 }), 1);
  assert.equal(bulbHalf(-0.1), 0); assert.equal(bulbHalf(1.1), 0);
});

test('bulbIn stands on its base, is 2 rx wide and h tall, and lean pushes only the top over', () => {
  const g = draw(bulbIn(24, 40, 9, 18));
  const b = g.bounds();
  assert.equal(b.y1, 39, 'its lowest row is just above the base line');
  assert.equal(b.y1 - b.y0 + 1, 18);
  assert.equal(b.x1 - b.x0 + 1, 18);
  const row = (s, y) => { const xs = []; for (let x = 0; x < 48; x++) if (s.get(x, y)) xs.push(x); return xs; };
  assert.ok(row(g, 22).length < row(g, 33).length / 2, 'the neck is less than half the width of the belly');
  const leant = draw(bulbIn(24, 40, 9, 18, { lean: 6 }));
  assert.deepEqual(row(leant, 39), row(g, 39), 'the bottom row stays put');
  assert.ok(row(leant, 22)[0] - row(g, 22)[0] >= 4, 'the top row moves right');
});

// ---- springIn ---------------------------------------------------------------------

test('springIn zigzags between its ends, packs flat when they meet and opens when they part', () => {
  const rest = draw(springIn(24, 40, 24, 30, 3, 8, 1));
  const flat = draw(springIn(24, 40, 24, 38, 3, 8, 1));
  const long = draw(springIn(24, 40, 24, 20, 3, 8, 1));
  const size = (g) => { const b = g.bounds(); return [b.x1 - b.x0 + 1, b.y1 - b.y0 + 1]; };
  assert.ok(size(flat)[1] <= 4 && size(flat)[0] >= 8, `pressed flat it is a low slab (${size(flat)})`);
  assert.ok(size(rest)[1] >= 10 && size(rest)[1] <= 12);
  assert.ok(size(long)[1] >= 20, 'stretched it is tall');
  assert.ok(size(long)[0] >= 8 && size(long)[0] <= 10, 'and keeps its width');
  // a bar on each side of the axis
  const b = rest.bounds();
  assert.ok(b.x0 <= 20 && b.x1 >= 27);
  assert.ok(springIn(24, 40, 24, 30, 3, 8, 1)(24, 39.5) && springIn(24, 40, 24, 30, 3, 8, 1)(24, 30.5), 'both ends are on the wire');
  // gaps show between the bars of an open spring
  let gaps = 0;
  for (let y = b.y0; y <= b.y1; y++) if (!long.get(24, y)) gaps++;
  assert.ok(lit(long) < size(long)[0] * size(long)[1] * 0.7, 'an open spring is not a solid block');
});

// ---- featherWing --------------------------------------------------------------------

test('featherWing reaches `length` from the shoulder along its angle and has one tip per feather', () => {
  const w = featherWing(24, 30, PI, 16, { feathers: 5 });          // pointing straight up
  assert.equal(w.tips.length, 5);
  const [tx, ty] = w.tips.at(-1);
  near(tx, 24, 1e-6); near(ty, 14, 1e-6);
  assert.ok(w.inside(24.5, 29.5), 'the shoulder is inside');
  for (const [x, y] of w.tips) assert.ok(w.inside(24 + (x - 24) * 0.8, 30 + (y - 30) * 0.8) || w.inside(w.wrist[0] + (x - w.wrist[0]) * 0.7, w.wrist[1] + (y - w.wrist[1]) * 0.7), 'most of the way to every tip is inside');
  near(w.wrist[0], 24); assert.ok(w.wrist[1] < 30 && w.wrist[1] > 14);
  const b = draw(w.inside).bounds();
  assert.ok(b.y0 >= 14 && b.y0 <= 16, `the wing ends at its longest tip (${b.y0})`);
});

test('featherWing: the inner feathers trail to the side `spread` says, and folding closes the fan', () => {
  const right = featherWing(24, 30, PI, 16, { spread: -1.2 }), left = featherWing(24, 30, PI, 16, { spread: 1.2 });
  assert.ok(right.tips[0][0] > 26 && left.tips[0][0] < 22, 'the first (inner) feather trails right for a negative spread, left for a positive one');
  near(right.tips[0][0] - 24, 24 - left.tips[0][0]);
  const open = draw(left.inside), shut = draw(featherWing(24, 30, PI, 16, { spread: 1.2, fold: 1 }).inside);
  assert.ok(lit(shut) < lit(open) * 0.8, 'a folded wing covers less');
  const ob = open.bounds(), sb = shut.bounds();
  assert.ok(sb.x1 - sb.x0 < ob.x1 - ob.x0, 'and is narrower');
  const bent = featherWing(24, 30, PI, 16, { tip: 0.5 });
  assert.ok(Math.abs(bent.tips.at(-1)[0] - 24) > 3, 'tip bends the outer feathers');
});

test('featherWing: fingers spreads the outer feathers apart and thins them, without moving the longest tip', () => {
  const smooth = featherWing(24, 34, PI, 20, { feathers: 5 }), split = featherWing(24, 34, PI, 20, { feathers: 5, fingers: 1 });
  const gap = (w) => Math.hypot(w.tips[4][0] - w.tips[3][0], w.tips[4][1] - w.tips[3][1]);
  assert.ok(gap(split) > gap(smooth) + 1, `the two outer tips stand further apart (${gap(split)} vs ${gap(smooth)})`);
  assert.deepEqual(split.tips.at(-1), smooth.tips.at(-1));
  assert.ok(lit(draw(split.inside)) < lit(draw(smooth.inside)), 'narrower feathers cover less');
  // a row just below the tips crosses separate feathers: more than one run of pixels
  const g = draw(split.inside);
  const runs = (y) => { let n = 0, on = false; for (let x = 0; x < 48; x++) { const v = !!g.get(x, y); if (v && !on) n++; on = v; } return n; };
  assert.ok([17, 18, 19, 20, 21, 22].some((y) => runs(y) >= 2), 'the back edge is notched');
});

// ---- nudgeInside --------------------------------------------------------------------

test('nudgeInside moves a drawing just far enough to stay inside the margin', () => {
  assert.deepEqual(nudgeInside([[10, 10], [30, 30]], 48, 48), [0, 0]);
  assert.deepEqual(nudgeInside([[0.5, 10], [30, 30]], 48, 48, 2), [2, 0]);
  assert.deepEqual(nudgeInside([[10, 10], [30, 47.2]], 48, 48, 2), [0, -2]);
  assert.deepEqual(nudgeInside([[10, 10, 9]], 48, 48, 2), [1, 1], 'a third number is a radius round the point');
  const [dx] = nudgeInside([[0, 10], [48, 10]], 48, 48, 2);
  assert.equal(dx, 0, 'too wide to fit: centred');
  assert.deepEqual(nudgeInside([], 48, 48), [0, 0]);
});

// ---- flutterIn ----------------------------------------------------------------------

test('flutterIn throws its blades out, lets them sink and thin out, and always keeps some', () => {
  const at = (t, o) => flutterIn(t, 24, 20, { box: [5, 5, 42, 42], ...o });
  assert.equal(at(0).length, 8);
  assert.equal(at(1).length, 3, 'three are left at the end');
  assert.equal(at(1, { count: 6, keep: 2 }).length, 2);
  assert.equal(at(1, { count: 2, keep: 5 }).length, 2, 'never more than it started with');
  let last = 9;
  for (let i = 0; i <= 20; i++) { const n = at(i / 20).length; assert.ok(n <= last && n >= 3, `t = ${i / 20}: ${n} blades`); last = n; }
  const box = (t) => new Surface(48, 48).fill(0, 0, 48, 48, (px, py) => at(t).some((f) => f(px, py)), '#ffffff').bounds();
  const start = box(0.05), mid = box(0.5), end = box(1);
  assert.ok(mid.x1 - mid.x0 > start.x1 - start.x0 + 4, 'they spread out');
  assert.ok(end.y1 > mid.y1 && end.y0 > start.y0, 'and sink');
  for (const t of [0, 0.3, 0.6, 1]) for (const f of at(t)) assert.ok(lit(draw(f)) >= 3, `t = ${t}: every blade is at least three pixels`);
  for (const t of [0.2, 0.7, 1]) { const b = box(t); assert.ok(b.x0 >= 2 && b.y0 >= 2 && b.x1 <= 45 && b.y1 <= 45, `t = ${t}: inside the box`); }
  assert.deepEqual(box(0.4), box(0.4), 'the same every time');
});

// ---- added in fix round 1: bulbRibsIn, fitScale, and creatureEye's 'sleepy' style, squint and flip ----
import { bulbRibsIn, fitScale, creatureEye, CREATURE_EYES, CREATURE_EYES_MORE } from '../../engine/creature.js';
import { pack } from '../../engine/color.js';

// a Surface that counts reads, so a test can say a helper never reads pixels back
class CountReads extends Surface { constructor(w, h) { super(w, h); this.reads = 0; } get(x, y) { this.reads++; return super.get(x, y); } }
const eyeAt = (opt, at = [20, 20]) => { const g = new CountReads(40, 40); creatureEye(g, at[0], at[1], opt); return g; };
const pixels = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) out.push([x, y, g.data[y * g.w + x]]); return out; };

test('bulbRibsIn: one pixel a row for each rib, inside the bulb, following its outline, its lean and its squash', () => {
  const shape = { low: 0.38, neck: 0.3, flat: 0.2 }, ribs = [-0.68, -0.26, 0.2, 0.62];
  for (const [rx, h, lean] of [[8.4, 17.7, 0], [10, 15, 0], [7, 21, 2.5], [8.4, 17.7, -3]]) {
    const o = { ...shape, lean }, body = bulbIn(24, 40, rx, h, o), g = draw(bulbRibsIn(24, 40, rx, h, ribs, o));
    const b = g.bounds(), rows = b.y1 - b.y0 + 1;
    assert.ok(rows >= 8, `the ribs run at least 8 px (${rows})`);
    assert.ok(Math.abs(rows - 0.8 * h) <= 1.5, `from 0.08 to 0.88 of the height by default (${rows} of ${h})`);
    for (let y = b.y0; y <= b.y1; y++) {
      const xs = []; for (let x = 0; x < 48; x++) if (g.get(x, y)) xs.push(x);
      assert.ok(xs.length >= 3 && xs.length <= 4, `row ${y}: one pixel for each rib, two may share a pixel near the neck (${xs})`);
      for (const x of xs) assert.ok(body(x + 0.5, y + 0.5), `row ${y}: the rib at ${x} is on the bulb`);
    }
    // each rib keeps its share of the half-width: at the widest row the outer two are about 1.3 half-widths apart
    const wide = Math.round(40 - h * 0.38 - 0.5), row = []; for (let x = 0; x < 48; x++) if (g.get(x, wide)) row.push(x);
    assert.equal(row.length, 4);
    assert.ok(Math.abs((row[3] - row[0]) - 1.3 * rx) <= 1.01, `the outer ribs are 1.3 half-widths apart where it is widest (${row})`);
  }
  // a lean bends the ribs over with the body
  const top = (lean) => { const g = draw(bulbRibsIn(24, 40, 8, 18, [0], { ...shape, lean })), y = g.bounds().y0; for (let x = 0; x < 48; x++) if (g.get(x, y)) return x; };
  assert.ok(top(3) > top(0) && top(-3) < top(0), 'the top of a rib follows the lean');
  // from, to and width
  const short = draw(bulbRibsIn(24, 40, 8, 18, [0], { ...shape, from: 0.3, to: 0.6 })).bounds();
  assert.ok(short.y1 - short.y0 + 1 <= 7 && short.y1 <= 40 - 18 * 0.3, 'from and to set where it runs');
  assert.ok(lit(draw(bulbRibsIn(24, 40, 8, 18, [0], { ...shape, width: 2 }))) > 1.8 * lit(draw(bulbRibsIn(24, 40, 8, 18, [0], shape))), 'width makes it thicker');
  assert.equal(lit(draw(bulbRibsIn(24, 40, 8, 18, [], shape))), 0, 'no fractions, no ribs');
});

test('fitScale: 1 when the drawing fits, the first smaller scale that fits when it does not, and one scale for a whole clip', () => {
  const tall = (k) => [[24, 24 - 30 * k], [24, 40]];                    // a wing lifted 30 px at full scale over a fixed body
  assert.equal(fitScale(() => [[10, 10], [30, 30, 2]], 48, 48, 2), 1, 'already fits');
  const k = fitScale(tall, 48, 48, 2.5);
  assert.ok(k < 1 && k >= 0.3, `scaled down (${k})`);
  assert.ok(16 + 30 * k <= 43 + 1e-9, 'at the returned scale it fits between the margins');
  assert.ok(16 + 30 * (k + 0.1) > 43, 'and it is the biggest of the scales tried that does');
  assert.equal(fitScale((s) => [[0, 24], [60 * s, 24]], 48, 48, 2), 0.7, 'the width counts as well as the height');
  assert.equal(fitScale(() => [[0, 0], [0, 90]], 48, 48, 2), 0.3, 'never below the least scale');
  assert.equal(fitScale(() => [[0, 0], [0, 90]], 48, 48, 2, { least: 0.5 }), 0.5);
  const finer = fitScale(tall, 48, 48, 2.5, { step: 0.02 });
  assert.ok(finer >= k && finer <= k + 0.1, 'a finer step finds a bigger scale');
  // a list of frames: every frame has to fit at the one scale
  const clip = (s) => [[[24, 20], [24, 30]], tall(s), [[10, 10, 3]]];
  assert.equal(fitScale(clip, 48, 48, 2.5), k, 'the tallest frame decides');
  assert.equal(fitScale(() => [], 48, 48), 1, 'nothing to fit');
  // a radius round a point counts
  assert.ok(fitScale((s) => [[24, 24, 25 * s]], 48, 48, 2) < 1);
});

test('creatureEye: the first three styles are drawn exactly as before the sleepy style, squint and flip were added', () => {
  assert.deepEqual(CREATURE_EYES, ['dots', 'angry', 'glow']);
  assert.deepEqual(CREATURE_EYES_MORE, ['sleepy']);
  const I = pack(0x23, 0x1b, 0x33), Wh = pack(255, 255, 255), B = pack(0x3a, 0x24, 0x18);
  const want = {
    dots: [[19, 18, Wh], [20, 18, Wh], [19, 19, Wh], [20, 19, I], [19, 20, Wh], [20, 20, I]],
    angry: [[18, 18, B], [18, 19, Wh], [19, 19, B], [20, 19, B], [18, 20, Wh], [19, 20, Wh], [20, 20, I]],
    blink: [[19, 20, B], [20, 20, B]],
  };
  const base = { body: '#7a4f33', brow: '#3a2418' };
  assert.deepEqual(pixels(eyeAt({ ...base, style: 'dots' })), want.dots.sort((a, b) => a[1] - b[1] || a[0] - b[0]));
  assert.deepEqual(pixels(eyeAt({ ...base, style: 'angry' })), want.angry.sort((a, b) => a[1] - b[1] || a[0] - b[0]));
  assert.deepEqual(pixels(eyeAt({ ...base, style: 'dots', blink: true })), want.blink);
  for (const style of CREATURE_EYES) for (const blink of [false, true]) {
    assert.deepEqual(pixels(eyeAt({ ...base, style, blink, flip: false, squint: false })), pixels(eyeAt({ ...base, style, blink })), `${style}: flip and squint switched off change nothing`);
  }
});

test('creatureEye sleepy: a heavy lid of a darker body tone over a slit of eye, unlike every other style, and it blinks', () => {
  for (const body of ['#a4c44a', '#3f5068', '#7a4f33']) {
    const base = { body }, sleepy = eyeAt({ ...base, style: 'sleepy' });
    for (const style of CREATURE_EYES) assert.notDeepEqual(pixels(sleepy), pixels(eyeAt({ ...base, style })), `on ${body} sleepy differs from ${style}`);
    const px = pixels(sleepy), b = sleepy.bounds();
    assert.ok(px.length >= 6, 'it draws a lid and a slit');
    assert.ok(b.x0 >= 18 && b.x1 <= 22 && b.y0 >= 18 && b.y1 <= 22, `inside the box round its middle (${JSON.stringify(b)})`);
    const bottom = px.filter(([, y]) => y === b.y1), lid = px.filter(([, y]) => y < b.y1);
    assert.equal(new Set(bottom.map(([, , c]) => c)).size, 1, 'the slit is one colour');
    assert.equal(new Set(lid.map(([, , c]) => c)).size, 1, 'the lid is one colour');
    assert.notEqual(bottom[0][2], lid[0][2], 'and the two differ');
    assert.ok(lid.length > bottom.length, 'the lid covers more than half of the eye');
    const [r, g2, bl] = [1, 3, 5].map((i) => parseInt(body.slice(i, i + 2), 16));
    assert.notEqual(lid[0][2], pack(r, g2, bl), 'the lid is not the plain body colour');
    const shut = eyeAt({ ...base, style: 'sleepy', blink: true });
    assert.notDeepEqual(pixels(shut), pixels(sleepy), 'a blink shows');
    assert.ok(pixels(shut).length >= 4);
    assert.equal(sleepy.reads + shut.reads, 0, 'it does not read pixels back');
  }
  const own = pixels(eyeAt({ body: '#a4c44a', style: 'sleepy', lid: '#c9423a' }));
  assert.ok(own.some(([, , c]) => c === pack(0xc9, 0x42, 0x3a)), 'lid sets the colour of the lid');
});

test('creatureEye squint: three pixels in a chevron that points forward, the same for every style, in a colour that shows on the body', () => {
  for (const body of ['#a4c44a', '#3f5068']) {
    const first = pixels(eyeAt({ body, style: 'dots', squint: true }));
    assert.deepEqual(first.map(([x, y]) => [x, y]), [[19, 19], [20, 20], [19, 21]].map(([x, y]) => [x, y - 1]), 'a > round the middle of the eye');
    assert.equal(new Set(first.map(([, , c]) => c)).size, 1);
    for (const style of [...CREATURE_EYES, ...CREATURE_EYES_MORE]) {
      const g = eyeAt({ body, style, squint: true, blink: style === 'angry' });
      assert.deepEqual(pixels(g), first, `${style}: squeezed shut looks the same`);
      assert.equal(g.reads, 0);
      assert.notDeepEqual(pixels(g), pixels(eyeAt({ body, style })), `${style}: and unlike the open eye`);
    }
  }
  const dark = pixels(eyeAt({ body: '#3f5068', squint: true }))[0][2], pale = pixels(eyeAt({ body: '#f0ead8', squint: true }))[0][2];
  assert.equal(dark, pack(255, 255, 255)); assert.equal(pale, pack(0x23, 0x1b, 0x33));
});

test('creatureEye flip: the mirror image about the middle of the eye, for every style and state', () => {
  const mirrored = (g) => pixels(g).map(([x, y, c]) => [39 - x, y, c]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const base = { body: '#7a4f33', glow: '#f2c230' };
  for (const style of [...CREATURE_EYES, ...CREATURE_EYES_MORE]) for (const state of [{}, { blink: true }, { squint: true }]) {
    const plain = eyeAt({ ...base, style, ...state }), flipped = eyeAt({ ...base, style, ...state, flip: true });
    assert.deepEqual(pixels(flipped), mirrored(plain), `${style} ${JSON.stringify(state)}: flipped is the mirror image`);
    assert.equal(flipped.reads, 0);
  }
  assert.notDeepEqual(pixels(eyeAt({ ...base, style: 'angry', flip: true })), pixels(eyeAt({ ...base, style: 'angry' })), 'an angry brow slopes the other way');
  // the rim of a flipped glowing eye is kept inside the mirrored shape
  const within = (px) => px >= 20, rim = pixels(eyeAt({ ...base, style: 'glow', flip: true, within }));
  assert.ok(rim.every(([x]) => x >= 19), 'within is asked about the pixel that is drawn');
});
