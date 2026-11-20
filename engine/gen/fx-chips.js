// Square chips and the checker (family "fx"): what a cleared cell of a falling-block puzzle turns into. The look of the
// Gridline kit's `cell-burst` (bundles/specs/kit-puzzle-gridline.md: what the specification's "chips" helper of
// engine/fx.js and the sprite's own checker drew; neither was carried over, so these are written from the
// specification and the reviewed renders).
//   chip.burst@1    a lit square that splits into square chips (or plus sparks, or small rings) which fly out and
//                   shrink a pixel at a time, each ending as a 2 x 2
//   checker.fade@1  a cell as a checker of small squares that blinks out from the top row down
//
//   { "gen": "chip.burst", "v": 1, "at": [16, 16], "side": 12, "count": 6, "size": 4, "dist": 11, "begin": 0.1428, "paints": ["shine", "core", "edge", "edge", "rim"] }
//   { "gen": "checker.fade", "v": 1, "at": [16, 16], "cells": 7, "paints": ["shine", "core", "edge", "rim"] }
//
// Both return rects of whole pixels (no stamps, nothing turned), read the clip phase ctx.t (fract(t) in a looping clip,
// so a loop closes) and nothing of the frame: a chip keeps within `room` px of `at`, so each draws the same on a node as
// in frame pixels, in a draw list or named as an emitter. `paints` is a list hottest first, the last the rim; white is
// a slot the sprite declares. Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, word, paints } from './args.js';
import { hash, fract, clamp, lerp, easeOut, TAU } from '../motion.js';

/** The marks chip.burst@1 flies: square chips, plus-shaped sparks, small rings. */
export const CHIP_MARKS = Object.freeze(['square', 'spark', 'ring']);

const FLAT = { shade: 0 };
const rect = (x, y, w, h, paint) => ({ kind: 'rect', at: [x, y], size: [w, h], paint, ...FLAT });

/** How many chips each row of the starting block holds: one or two rows up to six chips (5: 3, 2), three up to twelve (7: 2, 3, 2; 8: 3, 2, 3), then four; odd ones out go to the top row, the middle row or the outer rows. */
function chipRows(n) {
  const rows = n <= 2 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4;
  const base = Math.floor(n / rows), rem = n % rows;
  const out = Array.from({ length: rows }, () => base);
  if (rows === 2 && rem) out[0]++;
  if (rows === 3 && rem === 1) out[1]++;
  if (rows === 3 && rem === 2) { out[0]++; out[2]++; }
  if (rows === 4) { if (rem === 1) out[1]++; if (rem === 2) { out[1]++; out[2]++; } if (rem === 3) { out[0]++; out[1]++; out[3]++; } }
  return out;
}

/**
 * Where each of n chips is at phase k (0 just split, 1 at rest), from the middle [0, 0]: they start as a block of rows
 * `pitch` px apart and each flies in a straight line, fast then slow, to its own place on a ring `dist` px from the
 * middle (at least 3 px farther out than it began, so a wide block still flies; up to a tenth more by its seed), then falls `gravity` px by the end. The places on the
 * ring are evenly spaced and given out in the order the chips lie round the middle, turned to suit the block, so the
 * chips spread all round and none crosses another. A chip that starts on the very middle among others stays there
 * (7, 9, 11) and only falls and shrinks; one alone flies up. Returns [x, y] per chip.
 */
function chipSpots(n, k, { pitch, size, dist, gravity, seed: s }) {
  // a chip `size` px across whose middle is v from the block's middle, moved the part pixel that puts its corner on a whole pixel
  const snap = (v) => Math.round(v - size / 2) + size / 2;
  const rows = chipRows(n), start = [];
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r]; c++) start.push([(c - (rows[r] - 1) / 2) * pitch, (r - (rows.length - 1) / 2) * pitch]);
  const round = start.map((p, i) => ({ i, a: Math.atan2(p[0], -p[1]), r0: Math.hypot(p[0], p[1]) })).filter((c) => c.r0 > 0.01).sort((p, q) => p.a - q.a || p.i - q.i);
  const m = round.length;
  let sx = 0, sy = 0;
  round.forEach((c, j) => { const d = c.a - (TAU * j) / m; sx += Math.cos(d); sy += Math.sin(d); });
  const turn = m ? Math.atan2(sy, sx) : 0;
  const out = start.map((p) => [snap(p[0]), snap(p[1]) + gravity * k * k]);
  if (n === 1) out[0] = [0, -dist * easeOut(k) + gravity * k * k];
  const e = easeOut(k);
  round.forEach((c, j) => {
    const an = turn + (TAU * j) / m, far = Math.max(c.r0 + 3, dist) * (1 + 0.1 * hash(c.i, s * 64 + 3));
    const x0 = snap(start[c.i][0]), y0 = snap(start[c.i][1]);
    out[c.i] = [lerp(x0, Math.sin(an) * far, e), lerp(y0, -Math.cos(an) * far, e) + gravity * k * k];
  });
  return out;
}

/**
 * chip.burst@1: a cleared cell breaking up. Until `begin` (a share of the clip) it is one whole square `side` px a side
 * centred on `at`: the first paint, with a line of the second round it and a line of the third outside (side 0: no
 * square). From `begin` it is `count` chips that start as a tight block (rows a chip and a pixel apart), fly out to
 * evenly spaced places on a ring `dist` px from the middle (3 px or more beyond where each began), fast then slow,
 * fall `gravity` px, and shrink from `size` px a pixel at a time to 2 x 2; they cool through `paints` from the first to the last. mark "square": a square chip with an L of the
 * last paint on the two sides away from the light (bottom and left) while it is 3 px or more. "spark": a plus 5 px
 * across (while the chip is 4 px or more), then 3 px, with a middle one step hotter, then the 2 x 2. "ring": a hollow
 * ring 5 px across, then 4 px, then the 2 x 2 (give sparks and rings size 5, so they never touch). No pixel leaves the
 * box `room` px each way from `at`. Arguments: at, side, count, size, dist, gravity, mark, seed, begin, room, paints.
 */
export const chipBurst = defineGenerator({
  id: 'chip.burst', v: 1, family: 'fx',
  about: 'A lit square that splits into square chips, plus sparks or small rings, which fly out and shrink a pixel at a time to 2 x 2: a block cell breaking.',
  args: {
    at: point({ about: 'The middle of the cell (a pixel corner: 16, 16 in a 32 px frame)' }),
    side: count(0, 32, { default: 12, about: 'The side of the whole square it is before it splits (0: none)' }),
    count: count(1, 16, { default: 6, about: 'How many chips' }),
    size: count(2, 8, { default: 4, about: 'A chip\'s side when it splits; it steps down to 2' }),
    dist: px(0, 64, { default: 11, about: 'How far from the middle the chips end' }),
    gravity: px(-16, 16, { default: 2, about: 'How far a chip falls by the end (below 0 floats up)' }),
    mark: word(CHIP_MARKS, { default: 'square', about: 'What flies: square chips, plus-shaped sparks or small rings' }),
    seed: seed({ default: 5, about: 'Which chips fly a little farther' }),
    begin: share({ default: 0.15, about: 'When in the clip the square splits, as a share of the clip: before it the whole square shows' }),
    room: px(2, 320, { default: 15, about: 'How far from the middle a pixel may be, each way: 1 px less than half the frame' }),
    paints: paints(8, { about: 'Its colours hottest first: white, the core, the block\'s colour, the last its dark rim' }),
  },
  keyable: ['dist', 'gravity'],
  cost: (a) => 3 + 4 * a.count,
  run(a, ctx) {
    const u = ctx.loop ? fract(ctx.t) : clamp(ctx.t);
    const C = a.paints, last = C.length - 1, [ax, ay] = a.at;
    if (u < a.begin) {
      const S = a.side, x = Math.round(ax - S / 2), y = Math.round(ay - S / 2), out = [];
      if (S >= 1) out.push(rect(x, y, S, S, C[Math.min(2, last)]));
      if (S >= 3) out.push(rect(x + 1, y + 1, S - 2, S - 2, C[Math.min(1, last)]));
      if (S >= 5) out.push(rect(x + 2, y + 2, S - 4, S - 4, C[0]));
      return out;
    }
    const k = a.begin < 1 ? clamp((u - a.begin) / (1 - a.begin)) : 1;
    const step = Math.round(k * last), body = C[step], hot = C[Math.max(0, step - 1)], rim = C[last];
    const s = Math.round(lerp(a.size, 2, k) + 0.02);   // a half rounds up, also when the frame's phase is a hair short of it
    const big = a.mark !== 'square' && s >= 4, mid = a.mark !== 'square' && !big && s >= 3;
    const n = a.mark === 'square' ? s : big ? 5 : mid ? (a.mark === 'spark' ? 3 : 4) : 2;
    const lo = (c) => Math.ceil(c - a.room), hi = (c) => Math.floor(c + a.room) - n;
    const out = [];
    for (const [dx, dy] of chipSpots(a.count, k, { pitch: a.size + 1, size: a.size, dist: a.dist, gravity: a.gravity, seed: a.seed })) {
      const x = Math.max(lo(ax), Math.min(hi(ax), Math.round(ax + dx - n / 2)));
      const y = Math.max(lo(ay), Math.min(hi(ay), Math.round(ay + dy - n / 2)));
      if (a.mark === 'square') {
        if (n >= 3 && body !== rim) { out.push(rect(x, y, n, n, rim)); out.push(rect(x + 1, y, n - 1, n - 1, body)); }
        else out.push(rect(x, y, n, n, body));
      } else if (n === 2) out.push(rect(x, y, 2, 2, body));
      else if (a.mark === 'spark') {
        const m = (n - 1) / 2;
        out.push(rect(x, y + m, n, 1, body)); out.push(rect(x + m, y, 1, n, body)); out.push(rect(x + m, y + m, 1, 1, hot));
      } else {
        out.push(rect(x + 1, y, n - 2, 1, body)); out.push(rect(x + 1, y + n - 1, n - 2, 1, body));
        out.push(rect(x, y + 1, 1, n - 2, body)); out.push(rect(x + n - 1, y + 1, 1, n - 2, body));
      }
    }
    return out;
  },
});

/**
 * checker.fade@1: a cell as `cells` by `cells` squares of `unit` px, centred on `at`, in two colours turn about, that
 * blinks out from the top row down over the clip: a front runs down it; the row it is in keeps only every other
 * square, the rows above it are gone, and the bottom row stays to the end as `keep` squares spread evenly. `paints`
 * is hottest first, up to four: at the very start the squares are the first and the third, in the first half the
 * second and the third, then the third and the last; thinned squares are the third, and what is left at the end the
 * last. Arguments: at, cells, unit, keep, paints.
 */
export const checkerFade = defineGenerator({
  id: 'checker.fade', v: 1, family: 'fx',
  about: 'A cell as a checker of small squares that blinks out from the top row down, ending as a few squares in the bottom row.',
  args: {
    at: point({ about: 'The middle of the cell' }),
    cells: count(2, 16, { default: 7, about: 'Squares along each side' }),
    unit: count(1, 4, { default: 2, about: 'A square\'s side in pixels' }),
    keep: count(1, 8, { default: 4, about: 'How many squares of the bottom row stay to the end' }),
    paints: paints(4, { about: 'Its colours hottest first: white, the core, the block\'s colour, its dark rim' }),
  },
  keyable: [],
  cost: (a) => a.cells * a.cells,
  run(a, ctx) {
    const k = ctx.loop ? fract(ctx.t) : clamp(ctx.t);
    const C = a.paints, last = C.length - 1, at = (i) => C[Math.min(i, last)];
    const n = a.cells, u = a.unit, x0 = Math.round(a.at[0] - (n * u) / 2), y0 = Math.round(a.at[1] - (n * u) / 2);
    const front = k * n, done = k >= 1 - 1e-9;
    const hot = k <= 1e-9 ? at(0) : k < 0.5 ? at(1) : at(2), cool = k < 0.5 ? at(2) : at(3);
    const thinned = done ? at(3) : at(2);
    const keep = Math.min(a.keep, n);
    const out = [];
    for (let r = 0; r < n; r++) {
      if (r < front - 1) continue;
      const thin = r < front;
      if (thin && r === n - 1) {
        for (let i = 0; i < keep; i++) out.push(rect(x0 + (keep > 1 ? Math.round((i * u * (n - 1)) / (keep - 1)) : u * Math.floor((n - 1) / 2)), y0 + u * r, u, u, thinned));
        continue;
      }
      for (let c = 0; c < n; c++) {
        const even = (r + c) % 2 === 0;
        if (thin && !even) continue;
        out.push(rect(x0 + u * c, y0 + u * r, u, u, thin ? thinned : even ? hot : cool));
      }
    }
    return out;
  },
});

/** The most stamp pixels each generator here can return ("<id>@<v>" -> (args, size) -> pixels): none, both return rects (engine/gen/index.js STAMP_BOUNDS). */
export const CHIPS_STAMP_BOUNDS = Object.freeze({
  'chip.burst@1': () => 0,
  'chip.burst@2': () => 0,
  'checker.fade@1': () => 0,
});

/** The keyable arguments of each generator here that its cost or stamp bound reads: none (engine/gen/index.js SIZE_KEYS). */
export const CHIPS_SIZE_KEYS = Object.freeze({
  'chip.burst@1': Object.freeze([]),
  'chip.burst@2': Object.freeze([]),
  'checker.fade@1': Object.freeze([]),
});

/** What chip.burst@2 shows before it splits: one whole lit square, or the chips already apart in their tight grid. */
export const CHIP_BLOCKS = Object.freeze(['whole', 'chips']);

/**
 * chip.burst@2: chip.burst@1 with three more arguments (the Gridline kit's big clear burst; at their defaults it draws
 * as version 1). `block` "chips": until `begin` the chips already lie apart in their tight grid (rows a chip and a
 * pixel apart, so 1 px gaps), all the first paint for the first 45% of that time, then the second paint with the rim
 * L; they then fly from where they lie, so `count` shows from the first frame and nothing pops ("whole": the lit
 * square `side` px a side of version 1). `square` 0 to 1 moves each chip's resting place from the round ring `dist`
 * px out to the square `dist` px out each way along the same line from the middle, so a burst spreads square, toward
 * the corners. `keep` is how many of the last paints the chips never cool to (the rim still draws their L): with keep
 * 1 or more a square chip ends as a 2 x 2 of its colour with one rim pixel in the corner away from the light.
 * Arguments: at, side, block, count, size, dist, square, gravity, mark, seed, begin, keep, room, paints.
 */
export const chipBurst2 = defineGenerator({
  id: 'chip.burst', v: 2, family: 'fx',
  about: 'A lit square or a tight grid of chips that fly out to a ring or a square and shrink a pixel at a time to 2 x 2, cooling as far as you let them: a block cell or a big clear breaking.',
  args: {
    at: point({ about: 'The middle of the cell (a pixel corner: 16, 16 in a 32 px frame)' }),
    side: count(0, 32, { default: 12, about: 'The side of the whole square it is before it splits (block "whole"; 0: none)' }),
    block: word(CHIP_BLOCKS, { default: 'whole', about: 'Before it splits: one whole lit square, or the chips already apart in a tight grid' }),
    count: count(1, 16, { default: 6, about: 'How many chips' }),
    size: count(2, 8, { default: 4, about: 'A chip\'s side when it splits; it steps down to 2' }),
    dist: px(0, 64, { default: 11, about: 'How far from the middle the chips end' }),
    square: share({ default: 0, about: 'Where the chips end: 0 on a round ring, 1 on a square that far out each way' }),
    gravity: px(-16, 16, { default: 2, about: 'How far a chip falls by the end (below 0 floats up)' }),
    mark: word(CHIP_MARKS, { default: 'square', about: 'What flies: square chips, plus-shaped sparks or small rings' }),
    seed: seed({ default: 5, about: 'Which chips fly a little farther' }),
    begin: share({ default: 0.15, about: 'When in the clip the chips start to fly, as a share of the clip' }),
    keep: count(0, 6, { default: 0, about: 'How many of the last paints the chips never cool to (1: they end in the last but one, with one rim pixel)' }),
    room: px(2, 320, { default: 15, about: 'How far from the middle a pixel may be, each way: 1 px less than half the frame' }),
    paints: paints(8, { about: 'Its colours hottest first: white, the core, the block\'s colour, the last its dark rim' }),
  },
  keyable: ['dist', 'gravity'],
  cost: (a) => 3 + 4 * a.count,
  run(a, ctx) {
    const u = ctx.loop ? fract(ctx.t) : clamp(ctx.t);
    const C = a.paints, last = C.length - 1, [ax, ay] = a.at, rim = C[last];
    const spots = (k) => chipSpots(a.count, k, { pitch: a.size + 1, size: a.size, dist: a.dist, gravity: a.gravity, seed: a.seed });
    const place = (d, c, n) => Math.max(Math.ceil(c - a.room), Math.min(Math.floor(c + a.room) - n, Math.round(c + d - n / 2)));
    if (u < a.begin && a.block === 'whole') {
      const S = a.side, x = Math.round(ax - S / 2), y = Math.round(ay - S / 2), out = [];
      if (S >= 1) out.push(rect(x, y, S, S, C[Math.min(2, last)]));
      if (S >= 3) out.push(rect(x + 1, y + 1, S - 2, S - 2, C[Math.min(1, last)]));
      if (S >= 5) out.push(rect(x + 2, y + 2, S - 4, S - 4, C[0]));
      return out;
    }
    if (u < a.begin) {
      const n = a.size, hot = u < 0.45 * a.begin, body = hot ? C[0] : C[Math.min(1, last)], out = [];
      for (const [dx, dy] of spots(0)) {
        const x = place(dx, ax, n), y = place(dy, ay, n);
        if (!hot && n >= 3 && body !== rim) { out.push(rect(x, y, n, n, rim)); out.push(rect(x + 1, y, n - 1, n - 1, body)); }
        else out.push(rect(x, y, n, n, body));
      }
      return out;
    }
    const k = a.begin < 1 ? clamp((u - a.begin) / (1 - a.begin)) : 1;
    const coolest = Math.max(0, last - Math.min(a.keep, last));
    const step = Math.round(k * coolest), body = C[step], hot = C[Math.max(0, step - 1)];
    const s = Math.round(lerp(a.size, 2, k) + 0.02);
    const big = a.mark !== 'square' && s >= 4, mid = a.mark !== 'square' && !big && s >= 3;
    const n = a.mark === 'square' ? s : big ? 5 : mid ? (a.mark === 'spark' ? 3 : 4) : 2;
    // each chip's line from the middle is kept; its resting place moves out from the ring to the square along it
    const from = spots(0), rest = spots(1), now = spots(k), e = easeOut(k), g = a.gravity;
    const out = [];
    for (let i = 0; i < now.length; i++) {
      let [dx, dy] = now[i];
      if (a.square > 0 && a.count > 1) {
        const rx = rest[i][0], ry = rest[i][1] - g, far = Math.hypot(rx, ry), most = Math.max(Math.abs(rx), Math.abs(ry));
        const moved = Math.hypot(rx - from[i][0], ry - from[i][1]);
        if (moved > 0.01 && most > 0.01) {
          const m = lerp(1, far / most, a.square);
          dx = lerp(from[i][0], rx * m, e); dy = lerp(from[i][1], ry * m, e) + g * k * k;
        }
      }
      const x = place(dx, ax, n), y = place(dy, ay, n);
      if (a.mark === 'square') {
        if (n >= 3 && body !== rim) { out.push(rect(x, y, n, n, rim)); out.push(rect(x + 1, y, n - 1, n - 1, body)); }
        else { out.push(rect(x, y, n, n, body)); if (a.keep > 0 && body !== rim) out.push(rect(x, y + n - 1, 1, 1, rim)); }
      } else if (n === 2) out.push(rect(x, y, 2, 2, body));
      else if (a.mark === 'spark') {
        const c = (n - 1) / 2;
        out.push(rect(x, y + c, n, 1, body)); out.push(rect(x + c, y, 1, n, body)); out.push(rect(x + c, y + c, 1, 1, hot));
      } else {
        out.push(rect(x + 1, y, n - 2, 1, body)); out.push(rect(x + 1, y + n - 1, n - 2, 1, body));
        out.push(rect(x, y + 1, 1, n - 2, body)); out.push(rect(x + n - 1, y + 1, 1, n - 2, body));
      }
    }
    return out;
  },
});
