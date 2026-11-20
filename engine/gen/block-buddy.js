// The block buddy (family "block"): the one living thing of the Gridline kit (bundles/specs/kit-puzzle-gridline.md,
// `grid-buddy`). Four cells joined as a four-cell piece lying flat, as ONE body (a dark seam where two cells meet, a
// line of light along the top of each, one ink line round the lot: not four block.cell faces side by side), with eyes
// and cheeks on its upper right cell and two stub feet, in one of four acts played over the clip phase: idle (breathes,
// blinks), cheer (crouches, hops, its cells spreading at the top, two pluses above), worry (shakes, a drop of sweat
// running down its side) and slump (the cells sag and slide apart, the body sinks onto its feet, eyes shut). Written
// from the specification row and the reviewed renders of the code sprite it replaces (its pose function, and what
// pieceCells and blockEyes of the never carried-over engine/blocks.js drew).
//
//   { "gen": "block.buddy", "v": 1, "on": "buddy", "at": [0, 0], "act": "cheer", "clip": ["cheer"], "shape": "square",
//     "size": 0.5, "build": 0.5, "eyes": "round", "feet": true, "bounce": 0.5,
//     "paint": "body", "accent": "accent", "shine": "shine", "drop": "drop", "spark": "spark" }
//
// `at` is where it stands: the middle column, and the row under its feet (a sprite's pivot). It returns stamps (whole
// pixels, never turned) keyed to the call's own paint refs and draws its own ink line, so no outline op is needed
// after it; the pluses of the cheer are laid after the ink line and are never inked. It needs 24 px to each side of
// `at` and 42 rows above it (a 48 x 48 frame with the pivot at [24, 42]); nothing is drawn outside that box.
import { defineGenerator } from './registry.js';
import { point, share, word, flag, paint } from './args.js';
import { Pixels, rampOf, workCost } from './pixels.js';
import { rectIn } from '../surface.js';
import { lerp, clamp, fract, keys, wave, pulse, hash } from '../motion.js';
import { hopArc, squashStretch } from '../creature.js';

/** The acts block.buddy@1 plays over a clip: idle and worry loop, cheer and slump play once. */
export const BUDDY_ACTS = Object.freeze(['idle', 'cheer', 'worry', 'slump']);

/** The four-cell bodies block.buddy@1 draws, lying flat: square 2 by 2 cells, line 4 by 1, zig and ell 3 by 2. */
export const BUDDY_SHAPES = Object.freeze(['square', 'line', 'zig', 'ell']);

/** The eyes block.buddy@1 draws: dots (ink squares), round (white with a pupil), visor (one white band with two pupils). */
export const BUDDY_EYES = Object.freeze(['dots', 'round', 'visor']);

// [column, row] of each cell, row 0 on top
const CELLS = Object.freeze({
  square: [[0, 0], [1, 0], [0, 1], [1, 1]],
  line: [[0, 0], [1, 0], [2, 0], [3, 0]],
  zig: [[0, 0], [1, 0], [1, 1], [2, 1]],
  ell: [[2, 0], [0, 1], [1, 1], [2, 1]],
});

const W = 48, CX = 24, GROUND = 42;   // the box it is drawn in, and where `at` sits in it
const FOOT = 3;                       // rows of foot below the body (the ink line makes the fourth)
const HEAD = 6;                       // rows kept clear above the highest hop, for the two pluses
const SEED_A = 16, SEED_B = 116;      // plus timers: the first is biggest on frame 4 of 8, the second on frame 5

/** Where every cell is at phase t of an act: the code sprite's pose, in the 48 x 48 box. */
function pose(a, t) {
  const tall = a.shape === 'line' ? Math.round(lerp(7, 8, a.size)) : Math.round(lerp(8, 11, a.size));
  const wide = tall + Math.round(lerp(-1, 1, a.build));
  const cells = CELLS[a.shape];
  const cols = Math.max(...cells.map(([c]) => c)) + 1, rows = Math.max(...cells.map(([, r]) => r)) + 1;
  const rest = GROUND - 1 - (a.feet ? FOOT : 0);                       // the row under the body at rest
  const idleTop = rest - rows * tall - 1;                              // the ink row above the body at rest
  let lift = 0, sink = 0, gapX = 0, gapY = 0, squashPx = 0, dx = 0, mood = 'calm', sq = 0, sparkle = null, drop = null, breath = null;

  if (a.act === 'idle') {
    // breathing: the top comes down a pixel (two when bouncy) and goes back; a blink on frames 5 and 6 of 8
    breath = a.bounce > 0.75 ? [2, 2, 2, 1, 0, 0, 0, 1] : a.bounce < 0.25 ? [1, 1, 0, 0, 0, 0, 0, 0] : [1, 1, 1, 0, 0, 0, 0, 0];
    if (t >= 5 / 8 - 0.01 && t < 7 / 8 - 0.01) mood = 'flat';
  } else if (a.act === 'cheer') {
    // the hop's beats over eight frames: crouch 0 to 1, off the ground 2, top 4, land 6, recover 7
    const arc = hopArc((t * 7) / 8);
    const hop = Math.min(Math.round(lerp(4, 8, a.bounce)), idleTop - 3 - HEAD);
    lift = Math.round(hop * arc.lift);
    sq = t >= 1 ? 0 : arc.squash;
    squashPx = Math.round(2 * clamp(sq, -1, 1));                       // +2 crouched .. -2 stretched
    if (arc.air && arc.lift > 0.8) { gapX = 1; gapY = rows > 1 ? 1 : 0; }
    if (arc.air || (t > 0.8 && t < 1)) mood = 'happy';
    sparkle = idleTop - 3 - hop;                                       // the ink row above the body at the top of the hop
  } else if (a.act === 'worry') {
    dx = Math.round(wave(t * 2));                                      // 0, 1, 0, -1, twice a loop
    mood = 'wide';
    squashPx = a.bounce > 0.75 ? Math.round(pulse(t * 2)) : 0;
    drop = t;
  } else {
    mood = t < 0.1 ? 'wide' : 'flat';
    gapX = Math.round(keys(t, [[0, 0], [0.2, 0], [0.5, 1], [0.72, 2], [1, 2]]));
    const down = Math.round(keys(t, [[0, 0], [0.15, -1], [0.3, 0], [0.6, 3], [1, 3]]));   // a start, then down
    if (a.feet) sink = Math.max(0, down); else squashPx = Math.max(0, down);
    if (down < 0) squashPx = -1;
  }

  // squash and stretch: rows share the height change, cells trade a pixel of width for it
  const change = -squashPx, upper = rows > 1 ? Math.trunc(change / 2) + (change % 2) : change, lower = change - upper;
  const rowTall = rows > 1 ? [tall + upper, tall + lower] : [tall + change];
  const [k] = squashStretch(a.act === 'cheer' ? 0.12 * clamp(sq, -1, 1) : 0);
  const w = a.act === 'cheer' ? Math.max(6, clamp(Math.round(wide * k), wide - 1, wide + 1)) : wide;

  const total = cols * w + (cols - 1) * gapX, left = CX - Math.floor(total / 2) + dx;
  const base = rest - lift + sink;                                     // one past the body's last row
  const rowY = [];
  for (let r = rows - 1, y = base; r >= 0; r--) { y -= rowTall[r]; rowY[r] = y; y -= gapY; }
  const at = cells.map(([c, r]) => ({ c, r, x: left + c * (w + gapX), y: rowY[r], w, h: rowTall[r] }));
  const has = (c, r) => at.some((q) => q.c === c && q.r === r);
  // breathing: the top of each column comes down and goes back, the left half one frame ahead of the right, so it rolls
  if (breath) for (const q of at) if (!has(q.c, q.r - 1)) { const d = breath[(Math.round(t * 8) + (q.c < cols / 2 ? 1 : 0)) % 8]; q.y += d; q.h -= d; }
  const top = at.filter((q) => q.r === 0), eye = top.reduce((p, q) => (q.c > p.c ? q : p));
  const low = at.filter((q) => q.r === rows - 1), ends = [low.reduce((p, q) => (q.c < p.c ? q : p)), low.reduce((p, q) => (q.c > p.c ? q : p))];
  const side = at.filter((q) => q.c === 0).sort((p, q) => p.r - q.r);  // the left column, top first: the sweat runs down it
  return { at, has, eye, ends, side, base, mood, gapX, gapY, sparkle, drop, left, total, sink };
}

/**
 * The eyes on cell e (what blockEyes drew): two eyes 2 px wide, 2 px apart, their last row on row ey, in ink and
 * `white`, by style and mood (calm, flat: shut, wide, happy: carets); kept inside the cell. Returns the row after them.
 */
function eyes(g, e, ex, ey, style, mood, white, ink) {
  const put = (x, y, ref) => { if (x >= e.x && x < e.x + e.w && y >= e.y && y < e.y + e.h) g.set(x, y, ref); };
  const box = (x, y, w, h, ref) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, ref); };
  if (style === 'visor') {
    const half = Math.min(4, Math.floor((e.w - 1) / 2)), x0 = ex - half, slim = half < 3;   // a band under 6 px: one pixel an eye, at its ends
    const pl = x0 + (slim ? 0 : 1), pr = x0 + 2 * half - (slim ? 1 : 2);
    const tallBy = mood === 'wide' ? [ey - 3, 5] : mood === 'flat' ? [ey - 1, 3] : [ey - 2, 3];   // shut: the band stays, its slits on row ey
    box(x0, tallBy[0], 2 * half, tallBy[1], white);
    if (mood === 'happy') { for (const p of [pl, pr]) { put(p, ey - 1, ink); if (!slim) { put(p - 1, ey, ink); put(p + 1, ey, ink); } } }
    else if (mood === 'flat') { box(pl, ey, slim ? 1 : 2, 1, ink); box(pr - (slim ? 0 : 1), ey, slim ? 1 : 2, 1, ink); }
    else { put(pl, ey - 1, ink); put(pr, ey - 1, ink); }
    return tallBy[0] + tallBy[1];
  }
  const L = ex - 3, R = ex + 1;
  if (mood === 'flat') { box(L, ey, 2, 1, ink); box(R, ey, 2, 1, ink); return ey + 1; }
  if (style === 'dots') {
    if (mood === 'happy') { box(L, ey - 1, 2, 1, ink); box(R, ey - 1, 2, 1, ink); return ey; }
    const h = mood === 'wide' ? 3 : 2;
    box(L, ey - h + 1, 2, h, ink); box(R, ey - h + 1, 2, h, ink);
    return ey + 1;
  }
  if (mood === 'happy') {                                              // a caret each, 3 px wide; side by side in a narrow cell
    const peaks = e.w < 8 ? [ex - 2, ex + 2] : [ex - 3, ex + 2];
    for (const p of peaks) { put(p, ey - 1, ink); put(p - 1, ey, ink); put(p + 1, ey, ink); }
    return ey + 1;
  }
  const h = mood === 'wide' ? 4 : 3;
  box(L, ey - h + 1, 2, h, white); box(R, ey - h + 1, 2, h, white);
  if (mood === 'wide') { put(L + 1, ey - 1, ink); put(R, ey - 1, ink); }
  else { box(L + 1, ey - 1, 1, 2, ink); box(R, ey - 1, 1, 2, ink); }   // the pupils look at each other
  return ey + 1;
}

/**
 * block.buddy@1: the block buddy standing at `at` (the middle column, the row under its feet), at the clip's phase of
 * `act`. `shape` joins its four cells (square, line, zig, ell, lying flat); `size` sets the cell's height (8 to 11 px;
 * a line 7 to 8) and `build` its width (1 px narrower, square, 1 px wider); `eyes` (dots, round, visor) sit on the
 * upper right cell over two cheek dots of `accent`; `feet` adds two 3 px stubs of `accent` under the end cells.
 * `bounce` deepens the idle breath, raises the cheer's hop (4 to 8 px, less where the pluses need the room) and adds a
 * squash to the worry. The body is the ramp of `paint` shaded as one body, lit from the top right; `shine` is the eye
 * whites, the pluses' cores and the drop's glint, `drop` the sweat, `spark` the pluses, `ink` every line. In a loop
 * the phase wraps, so t = 0 and 1 draw the same. Arguments: at, act, shape, size, build, eyes, feet, bounce, paint,
 * accent, shine, drop, spark, ink.
 */
export const blockBuddy = defineGenerator({
  id: 'block.buddy', v: 1, family: 'block',
  about: 'The block buddy: four joined cells with eyes, cheeks and stub feet that breathes and blinks, cheers with a hop, worries with a drop of sweat or slumps apart, over the clip.',
  args: {
    at: point({ about: 'Where it stands: the middle column and the row under its feet (it needs 24 px each side and 42 rows above)' }),
    act: word(BUDDY_ACTS, { default: 'idle', about: 'What it does over the clip: idle and worry loop, cheer and slump play once' }),
    shape: word(BUDDY_SHAPES, { default: 'square', about: 'How its four cells join, lying flat' }),
    size: share({ default: 0.5, about: 'The cell\'s height: 8 to 11 px (a line: 7 to 8)' }),
    build: share({ default: 0.5, about: 'The cell\'s width: 1 px narrower than tall, square, 1 px wider' }),
    eyes: word(BUDDY_EYES, { default: 'round', about: 'The eyes on its upper right cell' }),
    feet: flag({ default: true, about: 'Two stub feet under the end cells' }),
    bounce: share({ default: 0.5, about: 'How lively: a deeper breath, a higher hop, a squash in the worry' }),
    paint: paint({ about: 'The body (its ramp gives the tones)' }),
    accent: paint({ about: 'The feet and the cheeks' }),
    shine: paint({ about: 'The eye whites, the pluses\' cores and the drop\'s glint: a light slot such as "shine"' }),
    drop: paint({ about: 'The drop of sweat in the worry' }),
    spark: paint({ about: 'The two pluses above the cheer' }),
    ink: paint({ default: 'ink', about: 'The line round the body, and the pupils' }),
  },
  cost: () => 4 + workCost(W * W * 16),
  run(a, ctx) {
    const t = ctx.loop ? fract(ctx.t) : ctx.t;
    const s = pose(a, t), R = rampOf(a.paint), g = new Pixels(0, 0, W, W);

    // feet first: the body covers them as it sinks
    if (a.feet) for (const q of s.ends) g.rect(q.x + Math.floor((q.w - 3) / 2), s.base - s.sink, 3, FOOT, a.accent);

    // the four cells as one body, lit from the top right
    // (the shadow test reads cells 1 px apart as still joined, so a cell's lit side is not shaded by the crack beside it)
    const lit = s.at.map((q) => rectIn(q.x, q.y, q.w + (s.gapX === 1 && s.has(q.c + 1, q.r) ? 1 : 0), q.h + (s.gapY === 1 && s.has(q.c, q.r + 1) ? 1 : 0)));
    for (const q of s.at) for (let y = q.y; y < q.y + q.h; y++) for (let x = q.x; x < q.x + q.w; x++) {
      g.set(x, y, lit.some((f) => f(x + 0.5 - 2, y + 0.5 + 2)) ? R.base : R.dark);
    }
    for (const q of s.at) {
      // a line of light along the top of every cell, and a dark seam where a cell meets the next
      g.rect(q.x + 1, q.y, q.w - 2, 1, R.light);
      if (!s.gapX && s.has(q.c + 1, q.r)) g.rect(q.x + q.w - 1, q.y, 1, q.h, R.dark);
      if (!s.gapY && s.has(q.c, q.r + 1)) g.rect(q.x, q.y + q.h - 1, q.w, 1, R.dark);
    }

    // eyes on the upper right cell, a cheek under each
    const e = s.eye, ex = e.x + Math.floor(e.w / 2);
    const ey = e.y + (s.mood === 'wide' || e.h >= 9 ? clamp(e.h - 3, 1, 4) : clamp(e.h - 3, 1, 3));
    const under = eyes(g, e, ex, ey, a.eyes, s.mood, a.shine, a.ink);
    // cheeks: a clear row under the eyes when the cell has one to spare, and the cell's last row left to the body
    const room = e.y + e.h - 1 - under, cheekY = under + (room >= 2 ? 1 : 0), cheekTall = Math.min(2, e.y + e.h - 1 - cheekY);
    for (let j = 0; j < cheekTall; j++) for (const x of [ex - 3, ex - 2, ex + 1, ex + 2]) if (x >= e.x && x < e.x + e.w) g.set(x, cheekY + j, a.accent);

    // worry: a drop of sweat runs down the left cells and starts again
    if (s.drop !== null) {
      const p = s.side[0], q = s.side[s.side.length - 1], from = p.y + 2, to = q.y + q.h - 4;
      const x = p.x + 2, y = Math.round(lerp(from, to, s.drop));
      g.rect(x, y - 1, 2, 5, a.ink); g.rect(x - 1, y + 1, 4, 2, a.ink);
      g.rect(x, y + 1, 2, 2, a.drop); g.set(x, y, a.drop); g.set(x + 1, y + 1, a.shine);
    }

    // one ink line round everything drawn so far (sides only: the corners stay open, as an outline op leaves them)
    const edge = [];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      if (!g.has(x, y) && (g.has(x - 1, y) || g.has(x + 1, y) || g.has(x, y - 1) || g.has(x, y + 1))) edge.push([x, y]);
    }
    for (const [x, y] of edge) g.set(x, y, a.ink);

    // cheer: two pluses above it, one over each end of the body, never inked
    if (s.sparkle !== null) {
      const spot = (x, y, seed) => {
        const life = fract(t + hash(0, seed * 64 + 1));
        const size = life < 0.12 ? 0 : life < 0.24 ? 1 : life < 0.36 ? 2 : life < 0.48 ? 1 : life < 0.6 ? 0 : -1;
        if (size < 0) return;
        const put = (px, py, ref) => { if (px >= 1 && py >= 1 && px < W - 1 && py < W - 1) g.set(px, py, ref); };
        for (let i = 1; i <= size; i++) { put(x - i, y, a.spark); put(x + i, y, a.spark); put(x, y - i, a.spark); put(x, y + i, a.spark); }
        put(x, y, size ? a.shine : a.spark);
      };
      spot(clamp(s.left + 1, 4, 20), Math.max(3, s.sparkle - 3), SEED_A);
      spot(clamp(s.left + s.total - 2, 27, 43), Math.max(3, s.sparkle - 5), SEED_B);
    }

    const ox = Math.floor(a.at[0]) - CX, oy = Math.floor(a.at[1]) - GROUND;
    return g.stamps().map((p) => ({ ...p, at: [p.at[0] + ox, p.at[1] + oy] }));
  },
});
