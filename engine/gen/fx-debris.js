// Effect behaviours of things thrown or drifting (docs/data-sprites.md 2.5c and 3.3, family "fx"; build item B12c):
// what an `emitters` body names for shards, smoke, leaves, a trail of puffs and a bank of mist. Each is a port of an
// engine helper that RETURNS PRIMITIVES (stamps keyed to the paints its call names) instead of drawing, pixel for pixel:
//   shards@1       engine/fx.js shards        spinning chips flung from a point, rimmed and lit, landing as pixels
//   smoke@1        engine/fx.js smoke         puffs rising from a point, light when young and darker as they age
//   leaves@1       engine/fx.js leaves        pointed leaves thrown up and out that tumble and flutter down
//   trail.puffs@1  engine/shots.js trailPuffs puffs a moving thing leaves behind it, shrinking to a pixel
//   mist@1         engine/mist.js mistBank    a bank of looping wisps along a band, joined into one cloud with one rim
// Where the code worked out a tone of its colour (engine/color.js tone and ramp), the port names the colour rule that
// works out the same tone, so a look changes it as it changed the code's. Shared rules: engine/gen/fx-common.js.
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, angle, word, paint, paints } from './args.js';
import { rampOf } from './pixels.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from '../motion.js';
import { RAD, beginArg, endArg, areaArg, phaseOf, lifeOf, boxOf, boxIn, emptyBox, gridOf, gridAround, put, paintBox, clipOf, inside01, toneRule, isNone, leafIn, tilesOf, areaOf, charge, innerOf, boxPixels } from './fx-common.js';
import { workCost } from './pixels.js';

/** The cost of `count` things, each painted in its own grid `side` px across making `tests` shape tests a pixel. */
const perThing = (n, side, tests) => Math.max(n * tilesOf(side, side), workCost(n * (tests * areaOf(side, side) + 8)));
/** The stamp pixels of `count` things, each in its own grid `side` px across, cut to the frame less its border. */
const perThingPixels = (n, side, size) => n * Math.min(innerOf(size), areaOf(side, side));

// ---- shards@1 ------------------------------------------------------------------------------------------------------

/** The side of one shard's own grid at its biggest: a shard is at most 1.3 x size long, painted in its box and a pixel round. */
const shardSide = (size) => 2 * Math.ceil(1.3 * size + 2) + 1;

/**
 * shards@1: `count` shards flung from `at` within a cone (`angle`, `arc` degrees): rock chips, glass, scraps, splinters.
 * Each a spinning triangle about `size` px long, shaded with the light and rimmed a tone darker (from 5 px long), that
 * flies `dist` px, falls `gravity` px by the end, turns `spin` times, shrinks a little and lands as one or two pixels,
 * kept inside the box. One-shot over the clip (`begin`, `end`). Port of engine/fx.js shards, pixel for pixel.
 */
export const shards = defineGenerator({
  id: 'shards', v: 1, family: 'fx',
  about: 'Spinning shards flung from a point that fly, fall and land as pixels: rock chips, glass or metal scraps.',
  args: {
    at: point({ about: 'Where they are flung from' }),
    count: count(0, 32, { default: 6, about: 'How many shards' }),
    seed: seed({ default: 0, about: 'Which scatter' }),
    dist: px(0, 256, { default: 14, about: 'How far one flies' }),
    gravity: px(-128, 128, { default: 8, about: 'How far one falls by the end (below 0 floats up)' }),
    size: px(0, 32, { default: 3, about: 'About how long a shard is, in pixels' }),
    angle: angle({ default: 180, about: 'The way they fly: 0 down, 90 right, 180 up' }),
    arc: angle({ default: 360, about: 'How wide the cone is, in degrees (360 all round)' }),
    spin: px(0, 8, { default: 1.5, about: 'How many turns a shard makes at most' }),
    paint: paint({ about: 'The shards: lit and rimmed with tones of it' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['dist', 'gravity', 'size', 'angle', 'arc', 'spin'],
  // each shard in its own grid: three edges a test, up to three tests a pixel
  cost: (a) => perThing(a.count, shardSide(a.size), 9),
  run(a, ctx) {
    const k = phaseOf(a, ctx);
    if (k === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, R = rampOf(a.paint), rim = R.dark;
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const A = a.angle * RAD, ARC = a.arc * RAD, [sx, sy] = [-1, 1];
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const an = A + (h(i, 2) - 0.5) * ARC;
      const d = a.dist * (0.5 + 0.5 * h(i, 3)) * easeOut(k);
      const cx = inside01(x + Math.sin(an) * d, B[0] + 0.5, B[2] - 0.5), cy = inside01(y + Math.cos(an) * d + a.gravity * k * k * (0.6 + 0.4 * h(i, 4)), B[1] + 0.5, B[3] - 0.5);
      const L = Math.max(1, a.size * (0.7 + 0.6 * h(i, 5)) * (1 - 0.6 * k));
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      const g = gridAround(B, cx, cy, Math.ceil(L) + 2);
      if (L < 2) { put(g, B, cx, cy, k > 0.9 ? rim : R.base); out.push(...g.stamps()); continue; }
      const rot = TAU * (h(i, 6) + a.spin * (h(i, 7) - 0.5) * 2 * k);
      const ux = Math.cos(rot), uy = Math.sin(rot), wd = Math.max(1.4, L * 0.6);
      const pts = [[cx + ux * L / 2, cy + uy * L / 2], [cx - ux * L / 2 - uy * wd / 2, cy - uy * L / 2 + ux * wd / 2], [cx - ux * L / 2 + uy * wd / 2, cy - uy * L / 2 - ux * wd / 2]];
      const inside = (px0, py0) => {
        let hit = false;
        for (let p = 0, q = 2; p < 3; q = p++) {
          const [xi, yi] = pts[p], [xj, yj] = pts[q];
          if ((yi > py0) !== (yj > py0) && px0 < ((xj - xi) * (py0 - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      };
      let drew = false;
      paintBox(g, B, cx - L, cy - L, cx + L, cy + L, (px0, py0) => {
        if (!inside(px0, py0)) return null;
        drew = true;
        if (L >= 5 && !inside(px0 + sx, py0 + sy)) return rim;
        if (L >= 5 && !inside(px0 - sx, py0 - sy)) return R.light;
        return R.base;
      });
      if (!drew) put(g, B, cx, cy, R.base);
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- smoke@1 -------------------------------------------------------------------------------------------------------

/** The side of one puff's own grid: a puff of smoke is at most 1.25 x size in radius, with its rim. */
const smokeSide = (size) => 2 * Math.ceil(1.25 * size + 3) + 1;

/**
 * smoke@1: `count` puffs rising from `at`: chimney smoke, dust, steam, a poof. Each is born small, swells, drifts
 * `drift` px sideways and rises `rise` px over its life, `size` px in radius at most; young puffs a tone lighter than
 * `paint`, old ones a tone darker, each shaded by the light and rimmed a tone darker than itself, the young in front.
 * `loop`: each repeats on its own timer and vanishes at the end of its life; off: one burst (`stagger`), ending as small
 * dark wisps. Port of engine/fx.js smoke (its tones as colour rules), pixel for pixel.
 */
export const smoke = defineGenerator({
  id: 'smoke', v: 1, family: 'fx',
  about: 'Puffs of smoke rising and swelling from a point, light when young and darker as they age: chimney smoke or steam.',
  args: {
    at: point({ about: 'Where the puffs come from' }),
    count: count(1, 16, { default: 5, about: 'How many puffs' }),
    seed: seed({ default: 0, about: 'Which scatter' }),
    loop: flag({ default: true, about: 'Each repeats on its own timer (off: one burst over the clip)' }),
    cycles: count(1, 8, { default: 1, about: 'Lives per loop of the clip' }),
    stagger: share({ default: 0.5, about: 'One burst: the longest a puff waits, as a share of the clip' }),
    rise: px(0, 128, { default: 14, about: 'How far a puff rises in its life' }),
    drift: px(-64, 64, { default: 3, about: 'How far a puff drifts sideways (below 0: left)' }),
    size: px(0, 24, { default: 4, about: 'A puff\'s radius, about' }),
    paint: paint({ about: 'The smoke: young puffs take a lighter tone of it, old ones a darker' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['rise', 'drift', 'size'],
  // each puff in its own grid: its rim's and its shade's tests, about eight a pixel
  cost: (a) => perThing(a.count, smokeSide(a.size), 8),
  run(a, ctx) {
    const t = phaseOf(a, ctx);
    if (t === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, base = a.paint, size = a.size;
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const list = [];
    for (let i = 0; i < a.count; i++) {
      const k = lifeOf(t, i, { seed: a.seed, loop: a.loop, cycles: a.cycles, stagger: a.stagger });
      const r = a.loop ? size * (0.5 + 0.5 * k) * Math.sqrt(Math.sin(PI * k)) : size * (0.45 + 0.8 * k) * (1 - 0.8 * k ** 3);
      if (r < 0.6) continue;
      list.push({ k, r, px: x + (h(i, 2) - 0.5) * 1.2 * size + a.drift * k + 0.8 * Math.sin(TAU * (k + h(i, 3))), py: y - a.rise * k });
    }
    list.sort((p, q) => q.k - p.k);
    const clip = clipOf(B), young = toneRule(base, 0.45), old = toneRule(base, -0.4);
    const out = [];
    for (const P of list) {
      const c = P.k < 0.33 ? young : P.k < 0.66 ? base : old;
      const g = gridAround(B, P.px, P.py, Math.ceil(P.r) + 3);
      if (P.r < 1.5) put(g, B, P.px, P.py, toneRule(c, -1));
      else g.fill(P.px - P.r, P.py - P.r, P.px + P.r, P.py + P.r, (px0, py0) => (px0 - P.px) ** 2 + (py0 - P.py) ** 2 <= P.r * P.r, { base: c, dark: toneRule(c, -0.55), light: c }, { shade: P.r >= 3 ? 1 : 0, outline: toneRule(c, -1), clip });
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- leaves@1 ------------------------------------------------------------------------------------------------------

/** The side of one leaf's own grid: half its length and a margin, with its rim. */
const leafSide = (size) => 2 * (Math.ceil(size / 2 + 1.5) + 4) + 1;

/**
 * leaves@1: `count` pointed leaves thrown up and out from `at` that tumble and flutter down: what flies from a cut
 * bush or a shaken tree. Each `size` px long (shrinking a little), in turn of `paints` (each a three-tone ramp, shaded
 * by the light) with a rim of its deep tone, or `rim` when given; they fly `dist` px, fall `gravity` px by the end, stay
 * inside the box and are all there on the last frame. One-shot over the clip. Port of engine/fx.js leaves, pixel for pixel.
 */
export const leaves = defineGenerator({
  id: 'leaves', v: 1, family: 'fx',
  about: 'Leaves thrown up and out from a point that tumble and flutter down: what flies from a cut bush or a shaken tree.',
  args: {
    at: point({ about: 'Where they are thrown from' }),
    count: count(1, 16, { default: 5, about: 'How many leaves' }),
    seed: seed({ default: 0, about: 'Which scatter' }),
    dist: px(0, 128, { default: 8, about: 'How far one flies' }),
    gravity: px(-64, 128, { default: 9, about: 'How far one falls by the end' }),
    size: px(1, 24, { default: 5, about: 'How long a leaf is, in pixels' }),
    paints: paints(8, { about: 'The leaves\' colours, used in turn; each is shaded in its own tones' }),
    rim: paint({ default: 'clear', about: 'The rim of every leaf (clear: each leaf\'s own deep tone)' }),
    begin: beginArg(),
    end: endArg(),
    area: areaArg(),
  },
  keyable: ['dist', 'gravity', 'size'],
  // each leaf in its own grid: its rim's and its shade's tests, about eight a pixel
  cost: (a) => perThing(a.count, leafSide(a.size), 8),
  run(a, ctx) {
    const k = phaseOf(a, ctx);
    if (k === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at, size = a.size, clip = clipOf(B);
    const ramps = a.paints.map((p) => rampOf(p));
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const an = PI + ((i + 0.5) / a.count - 0.5) * 3.1 + (hash(i, a.seed * 64 + 1) - 0.5) * 0.4;
      const far = a.dist * (0.7 + 0.3 * hash(i, a.seed * 64 + 3)) * easeOut(k);
      const half = lerp(size, size * 0.72, k) / 2, pad = half + 1.5;
      const cx = inside01(x + Math.sin(an) * far, B[0] + pad, B[2] - pad), cy = inside01(y + Math.cos(an) * far + a.gravity * k * k, B[1] + pad, B[3] - pad);
      const turn = an + (2.2 + i) * k + 0.8 * Math.sin(TAU * (1.5 * k + i / a.count));
      const ux = Math.sin(turn) * half, uy = Math.cos(turn) * half, R = ramps[i % ramps.length];
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      const g = gridAround(B, cx, cy, Math.ceil(pad) + 4);
      g.fill(cx - pad - 1, cy - pad - 1, cx + pad + 1, cy + pad + 1, leafIn(cx - ux, cy - uy, cx + ux, cy + uy, Math.max(2, size * 0.56), { belly: 0.5, blunt: 0.3 }), R, { outline: isNone(a.rim) ? R.deep : a.rim, clip });
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- trail.puffs@1 -------------------------------------------------------------------------------------------------

/** The side of one trail puff's own grid: its radius (half its size) and its rim. */
const trailSide = (size) => 2 * (Math.ceil(size / 2) + 4) + 1;

/**
 * trail.puffs@1: the puffs a moving thing leaves behind it: rocket exhaust, a steam trail, a dust wake. `count` puffs,
 * evenly spaced in time (`cycles` lives a loop, so the loop closes), each born `size` px across at `at`, falling back
 * `dist` px along `angle` (default left, behind something flying right) and `spread` px to one side or the other, and
 * shrinking to a pixel; the newborn in front. A big puff is shaded and rimmed with the second paint. Port of
 * engine/shots.js trailPuffs, pixel for pixel.
 */
export const trailPuffs = defineGenerator({
  id: 'trail.puffs', v: 1, family: 'fx',
  about: 'Puffs a moving thing leaves behind it, each falling back and shrinking to a pixel: exhaust, steam or a dust wake.',
  args: {
    at: point({ about: 'Where a puff is born, behind the moving thing' }),
    count: count(1, 16, { default: 3, about: 'How many puffs are in the air' }),
    angle: angle({ default: -90, about: 'The way they fall back: -90 left, 90 right, 0 down, 180 up' }),
    dist: px(0, 128, { default: 9, about: 'How far a puff falls back in its life' }),
    size: px(0, 32, { default: 4, about: 'Pixels across a puff when it is born' }),
    spread: px(0, 16, { default: 0.6, about: 'How far a puff sits to one side or the other of the line' }),
    cycles: count(1, 8, { default: 1, about: 'Lives of each puff per loop of the clip' }),
    seed: seed({ default: 0, about: 'Which way each puff leans' }),
    paints: paints(2, { about: 'The puff\'s body, then its shaded side and rim (the body when only one is given)' }),
    area: areaArg(),
  },
  keyable: ['dist', 'angle', 'spread'],
  // each puff in its own grid: its rim's and its shade's tests, about seven a pixel
  cost: (a) => perThing(a.count, trailSide(a.size), 7),
  run(a, ctx) {
    const B = boxOf(ctx, a.area), clip = clipOf(B), [x, y] = a.at;
    const base = a.paints[0], dark = a.paints[1] ?? a.paints[0];
    const A = a.angle * RAD, ux = Math.sin(A), uy = Math.cos(A);
    const list = [];
    for (let i = 0; i < a.count; i++) {
      const life = fract(Math.max(1, Math.round(a.cycles)) * ctx.t + i / a.count);
      const side = (i % 2 ? 1 : -1) * a.spread * (0.5 + hash(i, a.seed * 64 + 3)) * life;
      list.push({ life, r: (a.size / 2) * (1 - life ** 1.6), px: x + ux * a.dist * life - uy * side, py: y + uy * a.dist * life + ux * side });
    }
    list.sort((p, q) => q.life - p.life);
    const out = [];
    for (const P of list) {
      if (P.r < 0.3) continue;
      const g = gridAround(B, P.px, P.py, Math.ceil(P.r) + 4);
      if (P.r < 0.75) { if (clip(P.px, P.py)) g.set(P.px, P.py, dark); out.push(...g.stamps()); continue; }
      const cx = Math.round(P.px * 2) / 2, cy = Math.round(P.py * 2) / 2;
      g.fill(cx - P.r - 1, cy - P.r - 1, cx + P.r + 1, cy + P.r + 1, (px0, py0) => (px0 - cx) ** 2 + (py0 - cy) ** 2 <= P.r * P.r, { base, dark, light: base }, { shade: P.r >= 2.5 ? 1 : 0, outline: P.r >= 2 ? dark : null, clip });
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- mist@1 --------------------------------------------------------------------------------------------------------

/** The shapes of mist@1's wisps (engine/mist.js MIST_SHAPES): round, wispy (flat streaks), chunky (square blocks). */
export const MIST_SHAPES = Object.freeze(['round', 'wispy', 'chunky']);
// where a wisp's extra lumps sit, in units of its radius: [dx, dy, size] (engine/mist.js)
const MIST_LUMPS = [[-0.9, 0.3, 0.7], [0.95, 0.35, 0.62], [0.2, -0.55, 0.6]];
const smooth = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
// the shape tests mist@1 charges each lump of each wisp a pixel, by wisp shape (its cost)
const MIST_TEST = Object.freeze({ round: 8, chunky: 12, wispy: 20 });
/** How far a wisp's pixels reach from its middle, at most, with its rim and a pixel to spare, beyond its radius' share. */
const mistMargin = (size) => 4.2 * size + 3;
/** The box mist@1 works in: [width, height] from its arguments alone (see the run). */
function mistBox(a) {
  const M = mistMargin(a.size);
  return [a.width + 4 * a.dist + 2 * M + 2, 2 * a.dist + a.lift + a.rise + 2 * M + 3];
}

/**
 * mist@1: a bank of `count` looping wisps along the band from `at` to `width` px right of it, joined into one cloud
 * with one rim: ground fog, steam along a vent, dust over a road. Each wisp swells, drifts `dist` px along `angle`,
 * lifts `rise` px and thins out on its own timer (`cycles` a loop); every other one starts up to `lift` px higher;
 * `size` px in radius, `round` (drawn out sideways by `stretch`), `wispy` or `chunky`, with `lobes` lumps. A wisp
 * that is thinning out takes the shaded paint, the rest the lit one, the last paint the rim; `floor` is a row nothing
 * goes below (below 0: none). Port of engine/mist.js mistBank (x0 at[0], x1 at[0] + width, y at[1]), pixel for pixel.
 */
export const mist = defineGenerator({
  id: 'mist', v: 1, family: 'fx',
  about: 'A bank of looping wisps along a band, joined into one cloud with one rim: ground fog, steam or hanging dust.',
  args: {
    at: point({ about: 'The left end of the band, on the row the wisps start on' }),
    width: px(0, 640, { default: 24, about: 'How long the band is, in pixels' }),
    count: count(1, 16, { default: 5, about: 'How many wisps' }),
    dist: px(0, 128, { default: 8, about: 'How far a wisp drifts in its life' }),
    angle: angle({ default: 90, about: 'The way they drift: 90 right, -90 left, 180 up' }),
    rise: px(0, 64, { default: 3, about: 'How far a wisp lifts by the end of its life' }),
    lift: px(0, 64, { default: 0, about: 'Every other wisp starts up to this much higher, for a deeper bank' }),
    size: px(0.5, 24, { default: 4, about: 'A grown wisp\'s radius' }),
    shape: word(MIST_SHAPES, { default: 'round', about: 'Round, wispy (flat streaks) or chunky (square blocks)' }),
    lobes: count(1, 4, { default: 2, about: 'Lumps a wisp' }),
    stretch: px(1, 4, { default: 1, about: 'Round wisps only: how many times wider than tall' }),
    floor: px(-1, 360, { default: -1, about: 'The ground row: the rim lands on it, nothing goes below (below 0: none)' }),
    cycles: count(1, 8, { default: 1, about: 'Lives of each wisp per loop of the clip' }),
    seed: seed({ default: 0, about: 'Where the wisps sit and when they swell' }),
    paints: paints(8, { about: 'Lightest first: the lit top, the shaded side, ...; the last is the rim' }),
    area: areaArg(),
  },
  keyable: ['dist', 'rise', 'lift', 'size', 'angle'],
  // its box (as wide as the band and twice its drift, as tall as its drift, lift and rise, with a wisp's reach round
  // it): up to eight tests of every lump of every wisp a pixel, and the scans of its grid; a chunky lump's test costs
  // half as much again as a round one's and a wispy (turned) one's two and a half times (timed at the biggest arguments:
  // the B12c review measured wispy at 2.2 to 2.8 times round per unit of a shape-blind price)
  cost: (a) => { const [w, h] = mistBox(a); return charge(w, h, (MIST_TEST[a.shape] * a.count * a.lobes + 4) * areaOf(w, h)); },
  run(a, ctx) {
    const [x0, y] = a.at, x1 = x0 + a.width, size = a.size, shape = a.shape, stretch = a.stretch;
    const floor = a.floor >= 0 ? a.floor : null;
    const B = boxOf(ctx, a.area);
    if (floor !== null) B[3] = Math.min(B[3], floor + 1);
    const C = a.paints, n = C.length, rim = C[n - 1], base = C[0], dark = C[Math.min(1, n - 1)];
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const A = a.angle * RAD, ux = Math.sin(A), uy = Math.cos(A), dist = a.dist;
    // the box every wisp lies in (see mistBox): the band and its drift across; from the top of its drift, lift and
    // rise (or the floor, when that is higher) to the bottom of its drift (or the floor), with a wisp's reach round it
    const M = mistMargin(size), yTop = y - a.lift - dist - a.rise, yBot = y + dist;
    const S = boxIn(B, x0 - 2 * dist - M, (floor !== null ? Math.min(yTop, floor) : yTop) - M, x1 + 2 * dist + M + 1, (floor !== null ? Math.min(yBot, floor + 1) : yBot) + M + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    const tests = [], young = [], specks = [];
    for (let i = 0; i < a.count; i++) {
      const k = fract(a.cycles * ctx.t + (i + 0.4 * h(i, 1)) / a.count);
      const u = a.count === 1 ? 0.5 : (i + 0.5 + (h(i, 2) - 0.5) * 0.6) / a.count;
      const sx = lerp(x0 + size, x1 - size - Math.max(0, ux) * dist + Math.min(0, ux) * dist, clamp(u));
      const sy = y - (i % 2 ? a.lift * (0.5 + 0.5 * h(i, 3)) : 0);
      const thin = Math.min(1, k / 0.1) * (1 - smooth((k - 0.8) / 0.2));
      const r = size * (0.8 + 0.4 * h(i, 4)) * lerp(0.75, 1, k) * thin;
      const px0 = sx + ux * dist * k;
      let py0 = sy + uy * dist * k - a.rise * (0.6 + 0.4 * h(i, 5)) * k ** 1.5;
      if (floor !== null) py0 = Math.min(py0, floor - Math.max(0.5, shape === 'round' ? r / Math.sqrt(stretch) : r));
      if (r < 0.9) { if (r >= 0.5) specks.push([px0, py0]); continue; }
      const vx = ux * dist + 1e-3, vy = uy * dist - a.rise * 0.35, vl = Math.hypot(vx, vy), wx = vx / vl, wy = vy / vl;
      const one = (cx, cy, rr) => {
        if (shape === 'chunky') { const q = Math.max(1, Math.round(rr * 0.85)), qx = Math.round(cx), qy = Math.round(cy); return (qx2, qy2) => Math.abs(qx2 - qx) < q && Math.abs(qy2 - qy) < q; }
        if (shape === 'wispy') { const ra = rr * 1.8, rb = Math.max(0.8, rr * 0.5); return (ax, ay) => { const dx = ax - cx, dy = ay - cy; return ((dx * wx + dy * wy) / ra) ** 2 + ((dy * wx - dx * wy) / rb) ** 2 <= 1; }; }
        const rx = rr * Math.sqrt(stretch), ry = rr / Math.sqrt(stretch);
        return (ax, ay) => ((ax - cx) / rx) ** 2 + ((ay - cy) / ry) ** 2 <= 1;
      };
      const flip = h(i, 6) < 0.5 ? -1 : 1, mine = [one(px0, py0, r)];
      for (let j = 0; j < Math.min(Math.round(a.lobes) - 1, MIST_LUMPS.length); j++) {
        const [lx, ly, ls] = MIST_LUMPS[j];
        if (r * ls >= 0.75) mine.push(one(px0 + flip * lx * r, py0 + ly * r, r * ls));
      }
      tests.push(...mine);
      if (k < 0.75) young.push(...mine);
    }
    const clip = clipOf(B);
    if (tests.length) {
      const inside = (px1, py1) => tests.some((f) => f(px1, py1));
      g.fill(S[0] - 1, S[1] - 1, S[2] + 1, S[3] + 1, inside, dark, { outline: rim, clip });
      if (young.length) g.fill(S[0], S[1], S[2], S[3], (px1, py1) => young.some((f) => f(px1, py1)), base, { clip });
    }
    for (const [sx0, sy0] of specks) { const qx = Math.floor(sx0), qy = Math.floor(sy0); if (clip(qx + 0.5, qy + 0.5)) g.set(qx, qy, dark); }
    return g.stamps();
  },
});

// ---- stamp bounds, size keys, frame pixels --------------------------------------------------------------------------

/** The most stamp pixels each behaviour of this file can return in a frame of `size`: "<id>@<v>" -> (args, size) -> pixels (engine/gen/index.js STAMP_BOUNDS). */
export const DEBRIS_STAMP_BOUNDS = Object.freeze({
  'shards@1': (a, size) => perThingPixels(a.count, shardSide(a.size), size),
  'smoke@1': (a, size) => perThingPixels(a.count, smokeSide(a.size), size),
  'leaves@1': (a, size) => perThingPixels(a.count, leafSide(a.size), size),
  'trail.puffs@1': (a, size) => perThingPixels(a.count, trailSide(a.size), size),
  'mist@1': (a, size) => { const [w, h] = mistBox(a); return boxPixels(w, h, size); },
});

/** The keyable arguments of each behaviour of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS). */
export const DEBRIS_SIZE_KEYS = Object.freeze({
  'shards@1': Object.freeze(['size']),
  'smoke@1': Object.freeze(['size']),
  'leaves@1': Object.freeze(['size']),
  'trail.puffs@1': Object.freeze([]),
  'mist@1': Object.freeze(['dist', 'rise', 'lift', 'size']),
});

/** Why each behaviour of this file works in frame pixels (engine/gen/index.js FRAME_GENERATORS). */
export const DEBRIS_FRAME_GENERATORS = Object.freeze({
  'shards@1': 'an effect whose one-shot shards stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
  'smoke@1': 'puffs clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'leaves@1': 'an effect whose one-shot leaves stop at the frame\'s border: name it as an emitter, not in a draw list on a node',
  'trail.puffs@1': 'puffs clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'mist@1': 'a bank of mist clipped to the frame\'s 1 px border and its floor: name it as an emitter, not in a draw list on a node',
});
