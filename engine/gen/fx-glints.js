// Effect behaviours of light (docs/data-sprites.md 2.5c and 3.3, family "fx"; build item B12c): what an `emitters` body
// names for glints, shafts of light, a loot beam and the burn mark a blast leaves. Each is a port of an engine/fx.js
// helper that RETURNS PRIMITIVES (stamps keyed to the paints its call names) instead of drawing, pixel for pixel:
//   twinkle@2   engine/fx.js twinkle    a four-point sparkle kept inside the frame's 1 px border (twinkle@1 is not)
//   sparkles@1  engine/fx.js sparkles   twinkles flaring on their own timers over a field round a point
//   rays@1      engine/fx.js rays       dashed beams fanning out from a point, the dashes travelling outward
//   beam@1      engine/fx.js beam       a column of light standing on a row, breaking into rising dashes
//   scorch@1    engine/fx.js scorch     a broken ring of burn on the floor, with embers that flicker by the frame
// Shared rules (engine/gen/fx-common.js): frame pixels (each keeps to the frame's 1 px border, so each is named as an
// emitter), the clip phase ctx.t, paint refs only, a cost from the arguments alone.
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, angle, paint, paints } from './args.js';
import { hash, fract, clamp, lerp } from '../motion.js';
import { RAD, areaArg, boxOf, boxIn, emptyBox, gridOf, gridAround, stepAt, put, paintBox, charge, areaOf, innerOf, boxPixels } from './fx-common.js';

// ---- twinkle@2 -----------------------------------------------------------------------------------------------------

/** A twinkle of `size` 0..4 at the pixel (x, y), arms `arm`, centre `core` from size 1 up, onto g within B (engine/fx.js twinkle). */
function twinkleOn(g, B, x, y, s, arm, core) {
  x = Math.floor(x); y = Math.floor(y);
  for (let i = 1; i <= s; i++) { put(g, B, x - i, y, arm); put(g, B, x + i, y, arm); put(g, B, x, y - i, arm); put(g, B, x, y + i, arm); }
  put(g, B, x, y, s ? core : arm);
}

/**
 * twinkle@2: a four-point sparkle at a point (size 0 one pixel, 1 a plus, up to 4), its centre the core paint from
 * size 1 up, kept inside the frame's 1 px border (and `area`) as engine/fx.js twinkle is; twinkle@1 draws past the
 * border. Port of engine/fx.js twinkle, pixel for pixel.
 */
export const twinkle2 = defineGenerator({
  id: 'twinkle', v: 2, family: 'fx',
  about: 'A four-point sparkle at a point, one pixel to a big plus, with a bright core, kept inside the frame.',
  args: {
    at: point({ about: 'The centre pixel' }),
    size: count(0, 4, { default: 1, about: 'How far each arm reaches: 0 one pixel, 1 a plus, 2 a big plus' }),
    paint: paint({ about: 'The arms' }),
    core: paint({ about: 'The centre, from size 1 up: a light slot such as "shine" (white in fx.js)' }),
    area: areaArg(),
  },
  keyable: ['size'],
  cost: () => 1,
  run(a, ctx) {
    const B = boxOf(ctx, a.area), s = a.size;
    const g = gridAround(B, a.at[0], a.at[1], s);
    twinkleOn(g, B, a.at[0], a.at[1], s, a.paint, a.core);
    return g.stamps();
  },
});

// ---- sparkles@1 ----------------------------------------------------------------------------------------------------

/**
 * sparkles@1: `count` twinkles scattered over the field `reach` [rx, ry] pixels round `at`, each on its own repeating
 * timer: off, a pixel, a plus, a big plus (`big`), back down, `cycles` times a loop, so the loop closes. Their arms
 * take the edge paint (the second from last), a lone pixel the paint a quarter of the way down the list, the centre
 * `core`. Port of engine/fx.js sparkles (its `area` is [x - rx, y - ry, x + rx, y + ry]), pixel for pixel.
 */
export const sparkles = defineGenerator({
  id: 'sparkles', v: 1, family: 'fx',
  about: 'Twinkles flaring and fading on their own timers over a field: the glint of gems, stars or magic.',
  args: {
    at: point({ about: 'The middle of the field' }),
    reach: point({ lo: 0, hi: 320, default: [8, 8], about: 'How far the field reaches across and down from the middle [rx, ry]' }),
    count: count(0, 64, { default: 8, about: 'How many twinkles' }),
    seed: seed({ default: 0, about: 'Where they are and when they flare' }),
    cycles: count(1, 8, { default: 1, about: 'Flares of each twinkle per loop of the clip' }),
    big: flag({ default: true, about: 'Flare up to a big plus (off: a plus at most)' }),
    paints: paints(8, { about: 'Hottest first: the arms take the second from last, a lone pixel the one a quarter of the way down' }),
    core: paint({ about: 'A twinkle\'s centre: a light slot such as "shine" (white in fx.js)' }),
  },
  keyable: ['reach'],
  // one stamp of at most 5 x 5 a twinkle
  cost: (a) => Math.max(1, a.count),
  run(a, ctx) {
    const B = boxOf(ctx, null), [x, y] = a.at, [rx, ry] = a.reach;
    const A = boxOf(ctx, { x0: x - rx, y0: y - ry, x1: x + rx, y1: y + ry });
    const C = a.paints, arm = C.at(-2) ?? C[0], dim = stepAt(C, 0.75);
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const m = a.big ? 2 : 1;
    const w = Math.max(1, A[2] - A[0] - 2 * m), hh = Math.max(1, A[3] - A[1] - 2 * m);
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const life = fract(a.cycles * ctx.t + h(i, 1));
      const size = life < 0.12 ? 0 : life < 0.24 ? 1 : life < 0.36 ? m : life < 0.48 ? 1 : life < 0.6 ? 0 : -1;
      if (size < 0) continue;
      const px0 = A[0] + m + Math.floor(h(i, 2) * w), py0 = A[1] + m + Math.floor(h(i, 3) * hh);
      const g = gridAround(B, px0, py0, size);
      twinkleOn(g, B, px0, py0, size, size ? arm : dim, a.core);
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- rays@1 --------------------------------------------------------------------------------------------------------

/**
 * rays@1: `count` beams of light fanning out from `at` over `arc` degrees about `angle`, each a 1 px dashed line from
 * radius r0 to between 0.7 and 1 of r1 (by `seed`), hottest near the point and cooling outward through `paints`;
 * `dash` px lit, `gap` px unlit (gap 0 unbroken), the dashes moved `phase` steps outward plus `cycles` steps a loop of
 * the clip (whole numbers close a loop). Port of engine/fx.js rays (its phase is phase + cycles x t), pixel for pixel.
 */
export const rays = defineGenerator({
  id: 'rays', v: 1, family: 'fx',
  about: 'Dashed beams of light fanning out from a point, the dashes travelling outward: the glow of a chest or a reward.',
  args: {
    at: point({ about: 'The point they fan out from' }),
    count: count(1, 32, { default: 5, about: 'How many beams' }),
    angle: angle({ default: 180, about: 'The middle of the fan: 0 down, 90 right, 180 up' }),
    arc: angle({ default: 90, about: 'How wide the fan is, in degrees' }),
    r0: px(0, 320, { default: 2, about: 'Where the beams start, in pixels from the point' }),
    r1: px(0, 320, { default: 12, about: 'How far the longest beam reaches' }),
    dash: px(0, 64, { default: 3, about: 'Pixels lit in each dash' }),
    gap: px(0, 64, { default: 2, about: 'Pixels unlit between dashes (0: unbroken)' }),
    phase: px(0, 8, { default: 0, about: 'Steps the dashes have moved outward (keys move it; whole steps look alike)' }),
    cycles: count(0, 8, { default: 0, about: 'Steps the dashes move outward per loop of the clip' }),
    seed: seed({ default: 0, about: 'Which beams are longer and where their dashes start' }),
    paints: paints(8, { about: 'Hottest (near the point) first' }),
  },
  keyable: ['r0', 'r1', 'phase', 'angle', 'arc'],
  // a pixel a half-pixel step of each beam, and the scans of its grid (its box: as far as a beam can reach, each way)
  cost: (a) => { const R = Math.max(a.r0, a.r1), side = 2 * R + 5; return charge(side, side, a.count * (2 * R + 2) + 3 * areaOf(side, side)); },
  run(a, ctx) {
    const { r0, r1, dash, gap } = a;
    if (r1 <= r0) return [];
    const B = boxOf(ctx, null), C = a.paints, [x, y] = a.at, R = Math.max(r0, r1);
    const S = boxIn(B, x - R - 2, y - R - 2, x + R + 3, y + R + 3);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    const step = dash + gap, phase = a.phase + a.cycles * ctx.t;
    const A = a.angle * RAD, ARC = a.arc * RAD;
    for (let i = 0; i < a.count; i++) {
      const an = A + (a.count === 1 ? 0 : (i / (a.count - 1) - 0.5) * ARC);
      const sx = Math.sin(an), sy = Math.cos(an);
      const reachOf = r0 + (r1 - r0) * (0.7 + 0.3 * hash(i, a.seed * 64 + 2));
      const shift = hash(i, a.seed * 64 + 3) * step;
      let last = null;
      for (let d = r0; d <= reachOf; d += 0.5) {
        const px0 = Math.floor(x + sx * d), py0 = Math.floor(y + sy * d);
        if (last && last[0] === px0 && last[1] === py0) continue;
        last = [px0, py0];
        if (gap > 0 && fract((d - shift) / step - phase) >= dash / step) continue;
        put(g, B, px0, py0, stepAt(C, 1 - (d - r0) / (r1 - r0)));
      }
    }
    return g.stamps();
  },
});

// ---- beam@1 --------------------------------------------------------------------------------------------------------

/**
 * beam@1: a column of light `width` px across standing on the row under `at` and rising `height` px: a loot beam, a
 * teleporter, a scanner. Solid and hottest at its foot for `solid` of its height, then broken into `dash` px dashes
 * (`gap` px apart; gap 0 unbroken) that travel up `phase` steps plus `cycles` a loop, cooling towards the top; its side
 * columns dimmer and shorter. at[0] is its middle (a whole number for an even width, x.5 for an odd one). Port of
 * engine/fx.js beam (w, h; phase + cycles x t), pixel for pixel.
 */
export const beam = defineGenerator({
  id: 'beam', v: 1, family: 'fx',
  about: 'A column of light rising from a row, solid at its foot and breaking into rising dashes: a loot beam or a teleporter.',
  args: {
    at: point({ about: 'Its middle across, and the row just under its foot' }),
    width: px(1, 64, { default: 4, about: 'Pixels across' }),
    height: px(0, 360, { default: 12, about: 'Pixels tall' }),
    dash: px(0, 64, { default: 2, about: 'Pixels lit in each dash above the solid foot' }),
    gap: px(0, 64, { default: 2, about: 'Pixels unlit between dashes (0: unbroken)' }),
    solid: share({ default: 0.4, about: 'The share of its height that is unbroken, from the foot' }),
    phase: px(0, 8, { default: 0, about: 'Steps the dashes have moved up (keys move it)' }),
    cycles: count(0, 8, { default: 0, about: 'Steps the dashes move up per loop of the clip' }),
    seed: seed({ default: 0, about: 'The columns\' heights and where their dashes start' }),
    paints: paints(8, { about: 'Hottest (the middle of its foot) first' }),
  },
  keyable: ['height', 'phase'],
  // a pixel of each column, and the scans of its grid
  cost: (a) => { const w = a.width + 3, h = a.height + 3; return charge(w, h, (Math.round(a.width) + 1) * (a.height + 1) + 3 * areaOf(w, h)); },
  run(a, ctx) {
    const B = boxOf(ctx, null), C = a.paints, [x, y] = a.at;
    const n = Math.max(1, Math.round(a.width)), half = n / 2, step = a.dash + a.gap, h = a.height;
    const left = Math.round(x - half);
    const S = boxIn(B, left - 1, y - Math.max(1, Math.round(h)) - 2, left + n + 1, y + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S), phase = a.phase + a.cycles * ctx.t;
    for (let i = 0; i < n; i++) {
      const cx = left + i, d = Math.abs(cx + 0.5 - x) / Math.max(0.5, half);
      const hc = Math.max(1, Math.round(h * (1 - 0.45 * d * d) * (0.85 + 0.15 * hash(i, a.seed * 64 + 1))));
      const firm = hc * a.solid * (1 - 0.6 * d);
      const shift = hash(i, a.seed * 64 + 2) * step;
      for (let k = 0; k < hc; k++) {
        if (k >= firm && a.gap > 0 && fract((k - shift) / step - phase) >= a.dash / step) continue;
        put(g, B, cx, y - 1 - k, stepAt(C, 1 - 0.75 * d - 0.6 * (k / Math.max(1, h))));
      }
    }
    return g.stamps();
  },
});

// ---- scorch@1 ------------------------------------------------------------------------------------------------------

/**
 * scorch@1: the burn mark a blast leaves on the floor: a flat, broken ring of `paint` reaching `r` [rx, ry] px from
 * `at` when fully spread (`spread` 0..1 grows it from `start` of its size), the middle `hole` of its area left clean,
 * `gaps` of it broken away in dashes two pixels wide; while `heat` is above 0 a few `embers` glow in it (bright above
 * 0.5, dull below: the fire's paints, hottest first), which ones by the frame, so they flicker. A ground mark with no
 * ink: name it under the blast. Port of engine/fx.js scorch (t is spread, flicker the frame), pixel for pixel.
 */
export const scorch = defineGenerator({
  id: 'scorch', v: 1, family: 'fx',
  about: 'The broken ring of burn a blast leaves on the floor, spreading, with embers that flicker as it cools.',
  args: {
    at: point({ about: 'Its middle (pixel centres are at .5)' }),
    r: point({ lo: 0, hi: 160, default: [10, 4], about: 'How far it reaches across and down when fully spread [rx, ry]' }),
    spread: share({ default: 1, about: 'How far it has spread, 0 to 1 (keys grow it)' }),
    start: share({ default: 0.55, about: 'The share of its full size it has at spread 0' }),
    hole: share({ default: 0.45, about: 'The share of its area left clean in the middle (0 fills it)' }),
    gaps: share({ default: 0.18, about: 'The share of the ring broken away' }),
    paint: paint({ about: 'The burn: a dark tone of the floor' }),
    embers: count(0, 32, { default: 4, about: 'How many embers glow in it while it is hot' }),
    heat: share({ default: 0, about: '1 just blown to 0 cold: embers bright above 0.5, dull below, gone at 0 (keys cool it)' }),
    paints: paints(8, { about: 'The fire\'s paints, hottest first: the embers take the fourth from last (bright) or the second from last (dull)' }),
    seed: seed({ default: 0, about: 'Where it is broken and where the embers sit' }),
  },
  keyable: ['spread', 'heat'],
  // a test a pixel of its box, the embers, and the scans of its grid
  cost: (a) => { const w = 2 * a.r[0] + 4, h = 2 * a.r[1] + 4; return charge(w, h, 3 * areaOf(w, h) + a.embers); },
  run(a, ctx) {
    const B = boxOf(ctx, null), [x, y] = a.at, [rx, ry] = a.r;
    const S = boxIn(B, x - rx - 1, y - ry - 1, x + rx + 2, y + ry + 2);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    const grown = lerp(clamp(a.start), 1, clamp(a.spread));
    const ax = rx * grown, ay = ry * grown;
    if (ax > 0 && ay > 0) paintBox(g, B, x - rx, y - ry, x + rx, y + ry, (px0, py0) => {
      const q = ((px0 - x) / ax) ** 2 + ((py0 - y) / ay) ** 2;
      return q <= 1 && q > a.hole && hash(Math.floor(px0 / 2), Math.floor(py0) + 7 + a.seed * 64) > a.gaps ? a.paint : null;
    });
    if (a.heat > 0) {
      const C = a.paints, ember = a.heat > 0.5 ? C[C.length - 4] ?? C[0] : C[C.length - 2] ?? C[0];
      const flicker = Math.round(Number.isFinite(ctx.frame) ? ctx.frame : 0);
      const h = (i, ch) => hash(i, a.seed * 64 + ch);
      for (let i = 0; i < a.embers; i++) {
        if (h(i, flicker) <= 0.35) continue;
        put(g, B, Math.floor(x) + Math.round((h(i, 3) - 0.5) * rx * 1.2), Math.floor(y) + Math.round((h(i, 5) - 0.5) * ry), ember);
      }
    }
    return g.stamps();
  },
});

// ---- stamp bounds, size keys, frame pixels --------------------------------------------------------------------------

/** The most stamp pixels each behaviour of this file can return in a frame of `size`: "<id>@<v>" -> (args, size) -> pixels (engine/gen/index.js STAMP_BOUNDS). */
export const GLINT_STAMP_BOUNDS = Object.freeze({
  'twinkle@2': (a, size) => Math.min(innerOf(size), (2 * a.size + 1) ** 2),
  'sparkles@1': (a, size) => a.count * Math.min(innerOf(size), a.big ? 25 : 9),
  'rays@1': (a, size) => { const side = 2 * Math.max(a.r0, a.r1) + 5; return boxPixels(side, side, size); },
  'beam@1': (a, size) => boxPixels(a.width + 3, a.height + 3, size),
  'scorch@1': (a, size) => boxPixels(2 * a.r[0] + 4, 2 * a.r[1] + 4, size),
});

/** The keyable arguments of each behaviour of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS). */
export const GLINT_SIZE_KEYS = Object.freeze({
  'twinkle@2': Object.freeze(['size']),
  'sparkles@1': Object.freeze([]),
  'rays@1': Object.freeze(['r0', 'r1']),
  'beam@1': Object.freeze(['height']),
  'scorch@1': Object.freeze([]),
});

/** Why each behaviour of this file works in frame pixels (engine/gen/index.js FRAME_GENERATORS). */
export const GLINT_FRAME_GENERATORS = Object.freeze({
  'twinkle@2': 'a sparkle kept inside the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'sparkles@1': 'twinkles kept inside the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'rays@1': 'beams clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'beam@1': 'a column of light clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
  'scorch@1': 'a burn mark clipped to the frame\'s 1 px border: name it as an emitter, not in a draw list on a node',
});
