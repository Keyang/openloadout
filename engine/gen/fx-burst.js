// Effect behaviours (docs/data-sprites.md 2.5c and 3.3, family "fx"; build item B12): what an `emitters` body names
// for its sparks, flashes, rings, trails and smoke. Each is a port of an engine/fx.js helper (and the blaster bolt's bar
// of light, engine/shots.js lightShape on sprites/blaster-bolt.js's shapes) that RETURNS PRIMITIVES instead of drawing:
// it paints whole pixels, exactly as the code it replaces did, into a grid of paint refs (engine/gen/pixels.js Pixels)
// and hands them back as stamps keyed to the paints its call named ("spark", "spark.light", a colour rule ...).
//   particles@1  engine/fx.js particles   sparks, embers, bubbles thrown from a point; looping or one burst
//   starburst@1  engine/fx.js starburst   tapered spikes out from a point: the star of a hit, a muzzle flash
//   glow@1       engine/fx.js glow        concentric hard discs, rim to a white middle: the bright frame of a burst
//   ring@1       engine/fx.js ring        an expanding ring that breaks into arcs: a shockwave
//   streaks@1    engine/fx.js streaks     speed lines streaming behind a moving thing
//   puffs@1      engine/fx.js puffs       round, chunky or wispy puffs of smoke or dust
//   shot.bar@1   sprites/blaster-bolt.js  a bar of light pointing right, lit in bands, its tail flickering
// Shared rules, as engine/fx.js has them:
//   - FRAME PIXELS. Each keeps to the frame's 1 px empty border (and to `area` when given); one-shots stop at its edge so
//     no frame is ever empty. So each works in frame pixels by design (engine/gen/index.js FRAME_GENERATORS): name it as
//     an emitter, which the emitters and pictures layouts put on its node's frame first, not in a draw list on a node.
//   - TIME. A behaviour reads the clip phase ctx.t. In a looping clip a one-shot runs once a loop (its phase is fract(t),
//     so a loop closes); `begin` and `end` (shares of the clip) start it later and end it sooner: before `begin` it
//     draws nothing, after `end` it holds its last look (plasma-burst's ring starts at 0.1 of the clip).
//   - COLOURS. `paints` is a list hottest first (engine/fx.js steps: white, core, middle, edge, rim); the last is the rim.
//     A sprite that wants a white core declares a slot for it ("shine": "#ffffff"): white is not a fixed paint.
//   - ANGLES in degrees, rig convention (0 down, 90 picture-right, 180 up), where engine/fx.js took radians.
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, flag, angle, word, paints, struct } from './args.js';
import { Pixels, tilesFor, workCost, polyTest } from './pixels.js';
import { capsuleIn, polyIn, ellipseIn } from '../surface.js';
import { hash, fract, clamp, lerp, easeOut, TAU, PI } from '../motion.js';

const RAD = Math.PI / 180;
/** The most stamps a frame-sized grid can give (640 x 360 in 32 x 32 tiles). */
const MAX_TILES = tilesFor(640, 360);
const tilesOf = (w, h) => Math.min(MAX_TILES, tilesFor(Math.ceil(w), Math.ceil(h)));
/** The most pixels a behaviour can visit in one box: the biggest frame's. */
const FRAME_AREA = 640 * 360;
/** The pixels of a box w x h, cut to the biggest frame. */
const areaOf = (w, h) => Math.min(FRAME_AREA, Math.max(1, Math.ceil(w)) * Math.max(1, Math.ceil(h)));
/**
 * A behaviour's cost (3.4 rule 2, Contract 15 rule 6): the stamps it can return (the tiles of a w x h box) or the simple
 * shape tests it can make (engine/gen/pixels.js workCost: one pixel visited, one disc or ellipse test, one polygon
 * edge), whichever is more; `tests` counts the scans of its own grid too. So its run time is bounded by its cost
 * (tests/unit/gen-b12-safety.test.mjs), however big the frame.
 */
const charge = (w, h, tests) => Math.max(tilesOf(w, h), workCost(tests));

// ---- shared arguments, time, box, colours (engine/fx.js) -----------------------------------------------------------

const beginArg = () => share({ default: 0, about: 'When in the clip it starts, as a share of the clip: before it nothing is drawn' });
const endArg = () => share({ default: 1, about: 'When in the clip it is over, as a share of the clip: after it its last look holds' });
const areaArg = () => struct({ x0: px(0, 640), y0: px(0, 360), x1: px(0, 640), y1: px(0, 360) }, { default: { x0: 0, y0: 0, x1: 640, y1: 360 }, about: 'The box it stays in, always inside the frame\'s 1 px border' });

/** The behaviour's own phase 0..1 at ctx (fract(t) in a looping clip), with begin and end; null before it begins. */
function phaseOf(a, ctx) {
  const u = ctx.loop ? fract(ctx.t) : clamp(ctx.t);
  if (u < a.begin) return null;
  return a.end > a.begin ? clamp((u - a.begin) / (a.end - a.begin)) : 1;
}

/** engine/fx.js boxOf: the frame less its 1 px border, cut to `area`: [x0, y0, x1, y1], x0 <= x < x1. */
function boxOf(ctx, area) {
  const [W, H] = ctx.size;
  const b = [1, 1, W - 1, H - 1];
  if (area) { b[0] = Math.max(b[0], Math.floor(area.x0)); b[1] = Math.max(b[1], Math.floor(area.y0)); b[2] = Math.min(b[2], Math.floor(area.x1)); b[3] = Math.min(b[3], Math.floor(area.y1)); }
  return b;
}

/**
 * The box [x0, y0, x1, y1) (x1, y1 not in it; whole pixels, floored and ceiled outward) cut to the box B: where a
 * behaviour works, so a small thing in a big frame visits only its own pixels. Empty when x1 <= x0 or y1 <= y0.
 */
function boxIn(B, x0, y0, x1, y1) {
  return [Math.max(B[0], Math.floor(x0)), Math.max(B[1], Math.floor(y0)), Math.min(B[2], Math.ceil(x1)), Math.min(B[3], Math.ceil(y1))];
}
const emptyBox = (S) => !(S[2] > S[0] && S[3] > S[1]);
/** A grid over the box S (from boxIn); its stamps are cut from what is painted, so they are the same as a frame grid's. */
const gridOf = (S) => new Pixels(S[0], S[1], Math.max(0, S[2] - S[0]), Math.max(0, S[3] - S[1]));

/** engine/fx.js stepAt: pick a step by heat, 1 the hottest (first), 0 the rim (last). */
function stepAt(list, heat) {
  return list[Math.round((1 - clamp(heat)) * (list.length - 1))];
}

/** engine/fx.js lifeOf: life 0..1 of particle i at phase t (looping: on its own timer; one-shot: after a staggered wait). */
function lifeOf(t, i, { seed: s = 0, loop = true, cycles = 1, stagger = 0.6 } = {}) {
  const h = hash(i, s * 64 + 1);
  if (loop) return fract(cycles * t + h);
  const tt = clamp(t), delay = h * stagger;
  if (tt <= delay) return 0;
  return delay >= 1 ? 1 : (tt - delay) / (1 - delay);
}

const inside01 = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);

/** engine/fx.js put: one pixel (floored) when it is inside the box. */
function put(g, B, x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < B[0] || y < B[1] || x >= B[2] || y >= B[3]) return;
  g.set(x, y, c);
}

/** engine/fx.js paint: each pixel of the box whose centre colourAt gives a paint for takes it. */
function paintBox(g, B, x0, y0, x1, y1, colourAt) {
  const ax = Math.max(B[0], Math.floor(x0)), ay = Math.max(B[1], Math.floor(y0));
  const bx = Math.min(B[2] - 1, Math.ceil(x1)), by = Math.min(B[3] - 1, Math.ceil(y1));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const c = colourAt(x + 0.5, y + 0.5);
    if (c) g.set(x, y, c);
  }
}

/** engine/fx.js disc: a hard disc; under one pixel across it is one pixel. */
function disc(g, B, cx, cy, r, c) {
  if (r < 0.75) { put(g, B, cx, cy, c); return; }
  paintBox(g, B, cx - r, cy - r, cx + r, cy + r, (px0, py0) => ((px0 - cx) ** 2 + (py0 - cy) ** 2 <= r * r ? c : null));
}

// ---- particles@1 ---------------------------------------------------------------------------------------------------

/**
 * particles@1: particles thrown from `at` (sparks, embers, bubbles, motes) within a cone `arc` degrees wide about
 * `angle`, each flying `dist` px in its life, falling `gravity` px by its end (below 0 floats up), `size` px across when
 * born and shrinking, scattered `spread` px at the start and swaying `wobble` px; its colour runs through `paints` from
 * hot to rim as it ages. `loop`: each repeats on its own timer (seen for `lifespan` of it); off: one burst over the clip
 * (each waits up to `stagger` of the clip in the hot core, then flies, and ends as one rim-coloured pixel kept inside the
 * box). Port of engine/fx.js particles, pixel for pixel; each particle is one stamp.
 */
export const particles = defineGenerator({
  id: 'particles', v: 1, family: 'fx',
  about: 'Particles thrown from a point in a cone: sparks, embers or bubbles, looping or one burst, cooling as they fly.',
  args: {
    at: point({ about: 'Where they are thrown from' }),
    count: count(0, 64, { default: 8, about: 'How many' }),
    seed: seed({ default: 0, about: 'Which scatter' }),
    loop: flag({ default: true, about: 'Each repeats on its own timer (off: one burst over the clip)' }),
    cycles: count(1, 8, { default: 1, about: 'Lives per loop of the clip' }),
    stagger: share({ default: 0.6, about: 'One burst: the longest a particle waits in the core, as a share of the clip' }),
    angle: angle({ default: 180, about: 'The way they fly: 0 down, 90 right, 180 up' }),
    arc: angle({ default: 90, about: 'How wide the cone is, in degrees (360 all round)' }),
    dist: px(0, 256, { default: 12, about: 'How far one flies in its life' }),
    gravity: px(-128, 128, { default: 0, about: 'How far one falls by its end (below 0 floats up)' }),
    size: px(0, 16, { default: 2, about: 'Pixels across when born; it shrinks as it ages' }),
    spread: px(0, 64, { default: 0, about: 'Scatter at the start, in pixels' }),
    wobble: px(0, 32, { default: 0, about: 'Side-to-side sway, in pixels' }),
    lifespan: share({ default: 1, about: 'Looping: the share of its timer a particle is seen' }),
    begin: beginArg(),
    end: endArg(),
    paints: paints(8, { about: 'Its colours as it ages, hottest first; the last is the rim' }),
    area: areaArg(),
  },
  keyable: ['dist', 'gravity', 'size', 'spread', 'wobble', 'angle', 'arc', 'lifespan'],
  cost: (a) => a.count,
  run(a, ctx) {
    const k0 = phaseOf(a, ctx);
    if (k0 === null) return [];
    const B = boxOf(ctx, a.area), C = a.paints, [x, y] = a.at;
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const ang = a.angle * RAD, arc = a.arc * RAD, loop = a.loop;
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const life = lifeOf(k0, i, { seed: a.seed, loop, cycles: a.cycles, stagger: a.stagger });
      if (loop && life >= a.lifespan) continue;
      const k = loop ? life / a.lifespan : life;
      const an = ang + (h(i, 2) - 0.5) * arc;
      const d = a.dist * (0.55 + 0.45 * h(i, 3)) * easeOut(k);
      let px0 = x + (h(i, 4) - 0.5) * 2 * a.spread + Math.sin(an) * d + a.wobble * Math.sin(TAU * (k + h(i, 5)));
      let py0 = y + Math.cos(an) * d + a.gravity * k * k;
      if (!loop) { px0 = inside01(px0, B[0], B[2]); py0 = inside01(py0, B[1], B[3]); }
      const s = a.size * (1 - k);
      const c = stepAt(C, 1 - k);
      if (loop && s < 0.5) continue;
      if (!Number.isFinite(px0) || !Number.isFinite(py0)) continue;
      const g = new Pixels(Math.floor(px0) - 12, Math.floor(py0) - 12, 25, 25);
      if (s < 1.5) put(g, B, px0, py0, c);
      else if (s < 2.5) { const qx = Math.floor(px0 - 0.5), qy = Math.floor(py0 - 0.5); put(g, B, qx, qy, c); put(g, B, qx + 1, qy, c); put(g, B, qx, qy + 1, c); put(g, B, qx + 1, qy + 1, c); }
      else { disc(g, B, px0, py0, s / 2, C[C.length - 1]); disc(g, B, px0, py0, s / 2 - 1, c); }
      out.push(...g.stamps());
    }
    return out;
  },
});

// ---- starburst@1 ---------------------------------------------------------------------------------------------------

/** engine/fx.js stamp, on a mask already made: the pixels of box S that are on take `colour`, after a 1 px rim of `rim` (when given) round them. */
function stampMask(g, S, m, colour, rim) {
  const w = S[2] - S[0], h = S[3] - S[1];
  const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && m[yy * w + xx] === 1;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if (m[yy * w + xx]) g.set(S[0] + xx, S[1] + yy, colour);
    else if (rim && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.set(S[0] + xx, S[1] + yy, rim);
  }
}

/**
 * starburst@1: `points` tapered spikes pointing out from `at`, each from radius r[0] to r[1] (r[0] 0 joins them into one
 * star), `width` px across at their widest, the first at `turn` degrees, in paints[0] with a 1 px rim of paints[1] when
 * given; a spike thinner than a pixel stays an unbroken line. `twist` turns it on by a share of half the spacing between
 * spikes, so one Twist slider suits any number of them (sprites/hit-spark.js). Keys fly the spikes out: `push` moves both ends out, `cut`
 * takes pixels off the inner end and `short` off the tip; and cool them: `paints` is a list hottest first, the spikes
 * take the first and their rim the one `rim` steps cooler (none past the end), and `cool` drops that many of the hottest
 * (as glow's), so one emitter goes from a rimmed core to bare edge-coloured tips frame by frame. Centre it on a pixel
 * centre (x.5) for a star the same on every side. Port of engine/fx.js starburst, pixel for pixel.
 */
export const starburst = defineGenerator({
  id: 'starburst', v: 1, family: 'fx',
  about: 'Tapered spikes pointing out from a point: the star of a hit, a muzzle flash, rays flying outward.',
  args: {
    at: point({ about: 'The middle of the star' }),
    points: count(1, 32, { default: 6, about: 'How many spikes' }),
    r: point({ lo: 0, hi: 320, default: [0, 10], about: 'The spikes\' inner and outer radius [r0, r1]; r0 0 joins them into one star' }),
    width: px(0, 64, { default: 3, about: 'Pixels across a spike at its widest' }),
    turn: angle({ default: 180, about: 'Where the first spike points: 0 down, 90 right, 180 up' }),
    twist: share({ default: 0, about: 'Turns the star on by this share of half the spacing between spikes (180 / points degrees): a Twist slider that suits any number of spikes' }),
    push: px(0, 320, { default: 0, about: 'How far both ends of every spike have moved out' }),
    cut: px(0, 320, { default: 0, about: 'Pixels taken off each spike\'s inner end' }),
    short: px(0, 320, { default: 0, about: 'Pixels taken off each spike\'s tip' }),
    paints: paints(8, { about: 'Hottest first: the spikes take the first (less those `cool` drops), their 1 px rim the paint `rim` steps cooler, when there is one' }),
    rim: count(1, 7, { default: 1, about: 'How many paints cooler than the spikes their rim is (1: the next paint; past the last paint: no rim)' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the last always stays): keys cool the spikes frame by frame' }),
  },
  keyable: ['width', 'turn', 'push', 'cut', 'short', 'cool'],
  // the star's box (its reach, half a spike's width and a margin for the rim, each way), every spike tested in its own
  // box (at most ((length + width) / sqrt 2 + 4) squared, 4 edges a pixel), its spine, and the rim pass over the star's box
  cost: (a) => {
    const reach = Math.max(a.r[0], a.r[1]), side = 2 * (reach + a.push + a.width / 2 + 3) + 2;
    const star = areaOf(side, side), len = reach + a.width, spike = Math.min(star, areaOf(len / Math.SQRT2 + 4, len / Math.SQRT2 + 4));
    return charge(side, side, a.points * (4 * spike + 2 * len + 2) + 4 * star);
  },
  run(a, ctx) {
    const r0 = a.r[0] + a.push + a.cut, r1 = a.r[1] + a.push - a.short;
    if (r1 <= r0 || a.points < 1) return [];
    const [x, y] = a.at, B = boxOf(ctx, null);
    const turn = a.turn * RAD + a.twist * (PI / a.points), hw = (a.width / 2) * 0.9993;
    // every spike and its rim lie within reach + hw of the middle: the star's box, cut to the frame's border
    const reach = Math.max(Math.abs(r0), Math.abs(r1)) + hw + 3;
    const S = boxIn(B, x - reach, y - reach, x + reach + 1, y + reach + 1);
    if (emptyBox(S)) return [];
    const w = S[2] - S[0], h = S[3] - S[1], m = new Uint8Array(w * h);
    const mark = (px0, py0) => { if (px0 >= S[0] && py0 >= S[1] && px0 < S[2] && py0 < S[3]) m[(py0 - S[1]) * w + (px0 - S[0])] = 1; };
    const sround = (v) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5);
    for (let i = 0; i < a.points; i++) {
      const an = turn + (i * TAU) / a.points, ux = Math.sin(an), uy = Math.cos(an), rm = r0 + (r1 - r0) * 0.3;
      const pts = [[x + ux * r0, y + uy * r0], [x + ux * rm - uy * hw, y + uy * rm + ux * hw], [x + ux * r1, y + uy * r1], [x + ux * rm + uy * hw, y + uy * rm - ux * hw]];
      // the spine: a spike thinner than a pixel stays an unbroken line
      for (let d = r0; d <= r1 - 0.5; d += 0.5) mark(Math.floor(x + sround(ux * d)), Math.floor(y + sround(uy * d)));
      // the spike: each pixel of its own box whose centre is inside
      const inside = polyTest(pts);
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const ax = Math.max(S[0], Math.floor(Math.min(...xs)) - 1), ay = Math.max(S[1], Math.floor(Math.min(...ys)) - 1);
      const bx = Math.min(S[2] - 1, Math.ceil(Math.max(...xs)) + 1), by = Math.min(S[3] - 1, Math.ceil(Math.max(...ys)) + 1);
      for (let py0 = ay; py0 <= by; py0++) for (let px0 = ax; px0 <= bx; px0++) {
        const k = (py0 - S[1]) * w + (px0 - S[0]);
        if (!m[k] && inside(px0 + 0.5, py0 + 0.5)) m[k] = 1;
      }
    }
    const g = gridOf(S);
    const c = Math.min(a.paints.length - 1, Math.max(0, Math.round(a.cool)));
    stampMask(g, S, m, a.paints[c], a.paints[c + a.rim] ?? null);
    return g.stamps();
  },
});

// ---- glow@1 --------------------------------------------------------------------------------------------------------

/**
 * glow@1: concentric hard discs from a rim (radius r, 1 px wide, the last paint) in to the first paint at the middle:
 * the brightest frame of a burst, a muzzle flash, a glowing orb. Keys cool a ball as it fades: `scale` times the radius
 * (so r can follow a slider) and `cool` drops that many of the hottest paints. Port of engine/fx.js glow, pixel for pixel.
 */
export const glow = defineGenerator({
  id: 'glow', v: 1, family: 'fx',
  about: 'Concentric hard discs from a dark rim in to a bright middle: the flash of a burst or a glowing orb.',
  args: {
    at: point({ about: 'The middle' }),
    r: px(0, 160, { default: 6, about: 'The outer radius' }),
    scale: px(0, 4, { default: 1, about: 'Times the radius: keys shrink or swell the ball while r follows a slider' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the rim always stays): keys cool a ball frame by frame' }),
    paints: paints(8, { about: 'Hottest (the middle) first; the last is the 1 px rim' }),
  },
  keyable: ['r', 'scale', 'cool'],
  // a disc test over the box of each of its discs, and the scans of its grid
  cost: (a) => { const d = 2 * a.r * a.scale + 5; return charge(d, d, (a.paints.length + 3) * areaOf(d, d)); },
  run(a, ctx) {
    const list = a.paints.slice(Math.min(a.paints.length - 1, Math.max(0, Math.round(a.cool)))), n = list.length, [x, y] = a.at, r = a.r * a.scale;
    if (r <= 0) return [];
    const B = boxOf(ctx, null), S = boxIn(B, x - r - 2, y - r - 2, x + r + 3, y + r + 3);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    disc(g, B, x, y, r, list[n - 1]);
    const inner = r - 1;
    for (let j = n - 2; j >= 0; j--) {
      const rr = inner * (j + 1) / (n - 1);
      if (rr <= 0) continue;
      disc(g, B, x, y, rr, list[j]);
    }
    return g.stamps();
  },
});

// ---- ring@1 --------------------------------------------------------------------------------------------------------

/**
 * ring@1: a ring opening from `at` over its time (radius r0 to r1, easing out; `thick` px thinning to 1; `squash` below
 * 1 flattens it), its colour cooling from hot to rim with a 1 px rim outside while it is thick; from 0.6 of its time it
 * breaks into arcs (which, by `seed`), and its last look keeps a few rim pixels. It stops growing at the box's edge; a
 * centre outside the box draws nothing. Port of engine/fx.js ring, pixel for pixel.
 */
export const ring = defineGenerator({
  id: 'ring', v: 1, family: 'fx',
  about: 'A ring that opens from a point, cools and breaks into arcs: a shockwave, a ripple, a landing dust ring.',
  args: {
    at: point({ about: 'The middle' }),
    r0: px(0, 320, { default: 2, about: 'Its radius at the start' }),
    r1: px(0, 320, { default: 12, about: 'Its radius at the end' }),
    thick: px(0, 32, { default: 3, about: 'Pixels thick at the start; it thins to 1' }),
    squash: px(0.1, 2, { default: 1, about: 'Below 1 flattens it (a ring on the ground)' }),
    seed: seed({ default: 0, about: 'Where it breaks into arcs' }),
    begin: beginArg(),
    end: endArg(),
    paints: paints(8, { about: 'Hottest first; the last is the rim' }),
    area: areaArg(),
  },
  keyable: ['thick', 'squash'],
  // two ellipse tests and a sector test a pixel of its box, and the scans of its grid
  cost: (a) => {
    const R = Math.max(a.r0, a.r1, 0.6), w = 2 * R + 6, h = 2 * R * Math.max(1, a.squash) + 6;
    return charge(w, h, 8 * areaOf(w, h));
  },
  run(a, ctx) {
    const k = phaseOf(a, ctx);
    if (k === null) return [];
    const B = boxOf(ctx, a.area), C = a.paints, [x, y] = a.at;
    if (x < B[0] || x >= B[2] || y < B[1] || y >= B[3]) return [];
    const sq = Math.max(0.1, a.squash);
    const R = Math.max(a.r0, a.r1, 0.6), RY = Math.max(0.6, R * sq);
    const g = gridOf(boxIn(B, x - R - 2, y - RY - 2, x + R + 3, y + RY + 3));
    const room = Math.min(x - B[0], B[2] - x, (y - B[1]) / sq, (B[3] - y) / sq);
    const r = Math.min(lerp(a.r0, a.r1, easeOut(k)), Math.max(0.6, room));
    const th = Math.max(1, Math.round(a.thick * (1 - 0.8 * k)));
    const band = stepAt(C, 1 - k * 0.85);
    const rim = C[C.length - 1];
    const fade = k <= 0.6 ? 0 : ((k - 0.6) / 0.4) * 0.85;
    const SECT = 16;
    const keep = (px0, py0) => {
      if (fade === 0) return true;
      const s = Math.floor(((Math.atan2(px0 - x, py0 - y) + PI) / TAU) * SECT) % SECT;
      return s === 0 || s === SECT / 2 || hash(s, a.seed * 64 + 7) > fade;
    };
    const rx = r, ry = Math.max(0.6, r * sq);
    const inE = (px0, py0, ax, ay) => ax > 0 && ay > 0 && ((px0 - x) / ax) ** 2 + ((py0 - y) / ay) ** 2 <= 1;
    paintBox(g, B, x - rx - 1, y - ry - 1, x + rx + 1, y + ry + 1, (px0, py0) => {
      if (!inE(px0, py0, rx, ry) || inE(px0, py0, rx - th, ry - th)) return null;
      if (!keep(px0, py0)) return null;
      if (k >= 1) return rim;
      return th >= 2 && !inE(px0, py0, rx - 1, ry - 1) ? rim : band;
    });
    return g.stamps();
  },
});

// ---- streaks@1 -----------------------------------------------------------------------------------------------------

/** engine/fx.js streaks: the speed lines of o ({ at, count, seed, cycles, angle (degrees), length, reach, spread, paints }) at phase t, into g within the box B. */
function speedLines(g, B, o, t) {
  const C = o.paints, [x, y] = o.at;
  const h = (i, ch) => hash(i, o.seed * 64 + ch);
  const an = o.angle * RAD, ux = Math.sin(an), uy = Math.cos(an);
  for (let i = 0; i < o.count; i++) {
    const life = fract(o.cycles * t + (i + 0.5 * h(i, 1)) / o.count);
    const side = o.count === 1 ? 0 : (i / (o.count - 1) - 0.5) * 2 * o.spread;
    const len = Math.max(1, Math.round(o.length * (0.6 + 0.4 * h(i, 2)) * (1 - 0.7 * life)));
    const d = o.reach * life;
    const sx = x + ux * d - uy * side, sy = y + uy * d + ux * side;
    const c = stepAt(C, 1 - life);
    for (let j = 0; j < len; j++) put(g, B, sx + ux * j, sy + uy * j, c);
  }
}

/**
 * streaks@1: 1 px speed lines streaming away from beside `at` along `angle` (default left, behind something flying
 * right): each slides `reach` px and shortens from `length` px on its own evenly staggered timer, `cycles` times a loop
 * (so a loop closes and some line is always in view), cooling through `paints`; `spread`: how far the outer lines sit
 * to either side. Port of engine/fx.js streaks, pixel for pixel.
 */
export const streaks = defineGenerator({
  id: 'streaks', v: 1, family: 'fx',
  about: 'Speed lines streaming away behind a moving thing: the trail of an arrow, a dash or a bolt.',
  args: {
    at: point({ about: 'Where the lines start, beside the moving thing\'s tail' }),
    count: count(1, 16, { default: 3, about: 'How many lines' }),
    seed: seed({ default: 0, about: 'Which lengths and timing' }),
    cycles: count(1, 8, { default: 1, about: 'Times each line runs per loop' }),
    angle: angle({ default: -90, about: 'The way they stream: -90 left, 90 right, 0 down, 180 up' }),
    length: px(1, 64, { default: 6, about: 'How long a new line is' }),
    reach: px(0, 128, { default: 6, about: 'How far a line slides in its life' }),
    spread: px(0, 64, { default: 3, about: 'How far the outer lines sit to either side of the middle one' }),
    paints: paints(8, { about: 'New to old, hottest first' }),
    area: areaArg(),
  },
  keyable: ['length', 'reach', 'spread', 'angle'],
  // a pixel a step of each line, and the scans of its grid (its box: as far as a line can reach, each way)
  cost: (a) => {
    const side = 2 * (a.reach + a.length + a.spread + 2) + 3;
    return charge(side, side, a.count * (a.length + 2) + 3 * areaOf(side, side));
  },
  run(a, ctx) {
    const B = boxOf(ctx, a.area), [x, y] = a.at;
    const far = a.reach + a.length + a.spread + 2;
    const g = gridOf(boxIn(B, x - far, y - far, x + far + 1, y + far + 1));
    speedLines(g, B, a, ctx.t);
    return g.stamps();
  },
});

// ---- puffs@1 -------------------------------------------------------------------------------------------------------

/** The shapes a puff of puffs@1 may take: round, chunky (square) or wispy (stretched along its way). */
export const PUFF_SHAPES = Object.freeze(['round', 'chunky', 'wispy']);
const smoothStep = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
// where a puff's extra lumps sit, in units of its radius: [dx, dy, size]; they share its flat underside (engine/fx.js)
const LUMPS = [[-0.85, 0.3, 0.7], [0.9, 0.38, 0.62], [0.15, -0.62, 0.6], [-0.2, 0.45, 0.55]];

/**
 * puffs@1: puffs of smoke or dust thrown from `at` within a cone (`angle`, `arc`), flying `dist` px and rising `rise` px,
 * `size` px in radius, with up to five `lobes`, `round`, `chunky` (square) or `wispy` (stretched along their way); a
 * light top on a darker body, a soft rim (the last paint) round the whole cloud, overlapping puffs joined into one.
 * `loop`: each repeats on its own timer; off: one burst over the clip, each thinning to a speck. `floor`: a row they rest
 * above (below 0: none). Port of engine/fx.js puffs, pixel for pixel.
 */
export const puffs = defineGenerator({
  id: 'puffs', v: 1, family: 'fx',
  about: 'Puffs of smoke or dust thrown from a point that rise, spread and thin, joined into one soft-rimmed cloud.',
  args: {
    at: point({ about: 'Where they come from' }),
    count: count(1, 16, { default: 4, about: 'How many puffs' }),
    seed: seed({ default: 0, about: 'Which scatter' }),
    loop: flag({ default: false, about: 'Each repeats on its own timer (off: one burst over the clip)' }),
    cycles: count(1, 8, { default: 1, about: 'Lives per loop of the clip' }),
    stagger: share({ default: 0.2, about: 'One burst: the longest a puff waits, as a share of the clip' }),
    angle: angle({ default: 90, about: 'The way they fly: 0 down, 90 right, 180 up' }),
    arc: angle({ default: 30, about: 'How wide the cone is, in degrees (360 all round)' }),
    dist: px(0, 128, { default: 8, about: 'How far one flies' }),
    rise: px(0, 128, { default: 4, about: 'How far one rises' }),
    size: px(0.5, 24, { default: 3, about: 'A puff\'s radius' }),
    shape: word(PUFF_SHAPES, { default: 'round', about: 'Round, chunky (square) or wispy (stretched along its way)' }),
    lobes: count(1, 5, { default: 1, about: 'Lumps per puff' }),
    floor: px(-1, 360, { default: -1, about: 'The row they rest above (below 0: no floor)' }),
    begin: beginArg(),
    end: endArg(),
    paints: paints(8, { about: 'The light top, the body, ... ; the last is the soft rim' }),
    area: areaArg(),
  },
  keyable: ['dist', 'rise', 'size', 'angle', 'arc'],
  // each puff's box (2.4 times its radius, at most 1.2 times size, and a pixel round it) twice, with up to 5 tests of
  // its lobes a pixel each time, and the scans of its grid (with a floor, the whole frame)
  cost: (a) => {
    const pad = 2.88 * a.size + 1, puff = areaOf(2 * pad + 5, 2 * pad + 5);
    const side = 2 * (a.dist + a.rise + pad + 3) + 3, grid = a.floor >= 0 ? FRAME_AREA : areaOf(side, side);
    return Math.max(a.floor >= 0 ? MAX_TILES : tilesOf(side, side), workCost(a.count * (8 * a.lobes + 2) * puff + 3 * grid));
  },
  run(a, ctx) {
    const t = phaseOf(a, ctx);
    if (t === null) return [];
    const B = boxOf(ctx, a.area), [x, y] = a.at;
    const C = a.paints.length > 1 ? a.paints : [a.paints[0], a.paints[0]];
    const n = C.length, rim = C[n - 1], loop = a.loop, size = a.size, shape = a.shape;
    const floor = a.floor >= 0 ? a.floor : null;
    const ang = a.angle * RAD, arc = a.arc * RAD;
    const h = (i, ch) => hash(i, a.seed * 64 + ch);
    const list = [];
    for (let i = 0; i < a.count; i++) {
      const k = loop ? fract(a.cycles * t + (i + 0.3 * h(i, 1)) / a.count) : lifeOf(t, i, { seed: a.seed, loop: false, stagger: a.stagger });
      const an = ang + (h(i, 2) - 0.5) * arc;
      const d = a.dist * (0.6 + 0.4 * h(i, 3)) * easeOut(k);
      const up = a.rise * (0.6 + 0.4 * h(i, 4)) * k ** 1.5;
      const grow = lerp(0.85, 1, easeOut(k / 0.3)), thin = loop ? Math.min(1, k / 0.1) * (1 - smoothStep((k - 0.8) / 0.2)) : 1 - 0.64 * smoothStep((k - 0.35) / 0.65) ** 1.2;
      const r = size * (0.8 + 0.4 * h(i, 5)) * (loop ? lerp(0.7, 1, k) * thin : grow * thin);
      let px0 = x + Math.sin(an) * d, py0 = y + Math.cos(an) * d - up;
      const vx = Math.sin(an) * a.dist * (1 - k) * 2, vy = Math.cos(an) * a.dist * (1 - k) * 2 - a.rise * 1.5 * Math.sqrt(k);
      if (floor !== null) py0 = Math.min(py0, floor - Math.max(0.5, r));
      if (!loop) { px0 = inside01(px0, B[0] + 0.5, B[2] - 0.5); py0 = inside01(py0, B[1] + 0.5, B[3] - 0.5); }
      list.push({ k, r, px: px0, py: py0, vx, vy, flip: h(i, 6) < 0.5 });
    }
    list.sort((p, q) => q.k - p.k);
    const clip = (px0, py0) => px0 >= B[0] && py0 >= B[1] && px0 < B[2] && py0 < B[3];
    const drawn = [];
    for (const P of list) {
      const idx = P.k < 0.82 ? 0 : 1;
      const base = C[Math.min(idx, n - 2)], dark = C[Math.min(idx + 1, n - 2)];
      if (P.r < 0.9) {
        if (!(loop && P.r < 0.6)) drawn.push({ speck: true, P, colour: P.k > 0.8 ? rim : base });
        continue;
      }
      const one = (cx, cy, r) => {
        if (shape === 'chunky') { const qd = Math.max(1, Math.round(r * 0.85)), qx = Math.round(cx), qy = Math.round(cy); return (px1, py1) => Math.abs(px1 - qx) < qd && Math.abs(py1 - qy) < qd; }
        if (shape === 'wispy') {
          const vl = Math.hypot(P.vx, P.vy) || 1, ux = P.vx / vl, uy = P.vy / vl;
          const ra = r * 1.45, rb = Math.max(0.8, r * 0.5);
          return (px1, py1) => { const dx = px1 - cx, dy = py1 - cy; return ((dx * ux + dy * uy) / ra) ** 2 + ((dy * ux - dx * uy) / rb) ** 2 <= 1; };
        }
        return (px1, py1) => (px1 - cx) ** 2 + (py1 - cy) ** 2 <= r * r;
      };
      const tests = [one(P.px, P.py, P.r)];
      const flip = P.flip ? -1 : 1;
      const apart = loop ? 1 : 1 + 1.2 * smoothStep((P.k - 0.45) / 0.55);
      for (let j = 0; j < Math.min(a.lobes - 1, LUMPS.length); j++) {
        const [lx, ly, ls] = LUMPS[j];
        if (P.r * ls >= 0.75) tests.push(one(P.px + flip * lx * P.r * apart, P.py + ly * P.r, P.r * ls));
      }
      const inside = (px1, py1) => tests.some((f) => f(px1, py1));
      const pad = P.r * 2.4 + 1;
      drawn.push({ P, inside, box: [P.px - pad, P.py - pad, P.px + pad, P.py + pad], paint: { base, dark, light: base }, shade: P.r >= 2.5 && shape !== 'wispy' ? 1 : 0 });
    }
    // the grid: every puff's box and a pixel round it for the rim, cut to the box B
    const U = [Infinity, Infinity, -Infinity, -Infinity];
    for (const D of drawn) {
      const [b0, b1, b2, b3] = D.speck ? [D.P.px, D.P.py, D.P.px, D.P.py] : D.box;
      U[0] = Math.min(U[0], b0 - 2); U[1] = Math.min(U[1], b1 - 2); U[2] = Math.max(U[2], b2 + 3); U[3] = Math.max(U[3], b3 + 3);
    }
    if (!drawn.length || !U.every(Number.isFinite)) return [];
    const g = gridOf(boxIn(B, ...U));
    // every rim first, then every body: puffs that overlap join into one cloud with no line between them
    for (const D of drawn) if (!D.speck) g.fill(...D.box, D.inside, rim, { outline: rim, clip });
    for (const D of drawn) {
      if (D.speck) put(g, B, D.P.px, D.P.py, D.colour);
      else g.fill(...D.box, D.inside, D.paint, { shade: D.shade, clip });
    }
    return g.stamps();
  },
});

// ---- shot.bar@1 ----------------------------------------------------------------------------------------------------

/** The styles of shot.bar@1: bolt (round nose, thin tail), pulse (a head, a dash and a dot), needle (a spindle), flat (flattened against what it hit). */
export const SHOT_BAR_STYLES = Object.freeze(['bolt', 'pulse', 'needle', 'flat']);
/** How far above and below its middle row a flat bar's oval reaches, at most (sprites/blaster-bolt.js hit). */
const FLAT_REACH = 6;

/** sprites/blaster-bolt.js shapeOf: the bar's shape test for one style, from its tail end xt to its nose xh, `rows` px thick about the line cy. */
function barShape(style, xt, xh, cy, rows) {
  const half = rows / 2, L = xh - xt;
  const any = (...tests) => (px0, py0) => tests.some((f) => f(px0, py0));
  if (style === 'flat') return any(ellipseIn(xh, cy, 2.5, Math.min(FLAT_REACH, half + 3)), capsuleIn(xt, cy, xh, cy, Math.max(1, half - 1)));
  if (style === 'needle') {
    const xw = xh - L * 0.32;
    return polyIn([[xt, cy], [xw, cy - half], [xh, cy], [xw, cy + half]]);
  }
  if (style === 'pulse') {
    const head = Math.max(5, Math.round(L * 0.42)), dash = Math.max(3, Math.round(L * 0.24));
    const x1 = xh - head - 2, x0 = x1 - dash - 2, small = Math.max(1, half - 0.5);
    return any(capsuleIn(xh - head + half, cy, xh - half, cy, half), capsuleIn(x1 - dash + small, cy, x1 - small, cy, small), capsuleIn(xt + small, cy, Math.max(xt + small, x0 - small), cy, small));
  }
  const xb = xt + L * 0.38;
  return any(capsuleIn(xb, cy, xh - half, cy, half), capsuleIn(xt + 0.5, cy, xb, cy, 0.5, half));
}

/** engine/shots.js lightShape: a shape painted as light in nested 1 px bands (the last paint a rim just outside it). */
function lightBands(g, B, inside, list) {
  const w = B[2] - B[0], h = B[3] - B[1];
  if (w <= 0 || h <= 0 || !list.length) return;
  const hasRim = list.length > 1;
  const body = hasRim ? list.slice(0, -1) : list;
  const D = new Uint16Array(w * h);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if (!inside(B[0] + xx + 0.5, B[1] + yy + 0.5)) continue;
    D[yy * w + xx] = 1 + Math.min(xx > 0 ? D[yy * w + xx - 1] : 0, yy > 0 ? D[(yy - 1) * w + xx] : 0);
  }
  for (let yy = h - 1; yy >= 0; yy--) for (let xx = w - 1; xx >= 0; xx--) {
    const i = yy * w + xx;
    if (D[i]) D[i] = Math.min(D[i], 1 + (xx < w - 1 ? D[i + 1] : 0), 1 + (yy < h - 1 ? D[i + w] : 0));
  }
  const on = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && D[yy * w + xx] > 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const d = D[yy * w + xx];
    if (d) g.set(B[0] + xx, B[1] + yy, body[body.length - 1 - Math.min(body.length - 1, d - 1)]);
    else if (hasRim && (on(xx - 1, yy) || on(xx + 1, yy) || on(xx, yy - 1) || on(xx, yy + 1))) g.set(B[0] + xx, B[1] + yy, list[list.length - 1]);
  }
}

/**
 * shot.bar@1: a bar of light pointing right, the player's blaster shot: `length` px long (a needle 1.1 times that),
 * `thick` px across about the row `at[1]`, its nose `lead` px past half its length right of `at[0]` (kept 3 px inside
 * the frame), lit in 1 px bands from the rim (the last paint) in to the core (the first). Styles: `bolt` (a round-nosed
 * bar whose last third thins to a point), `pulse` (a head, a dash and a dot), `needle` (a spindle), `flat` (flattened
 * against what it hit: a tall thin oval at at[0] + lead, `length` px of stub behind it; no flicker). Its tail end moves
 * out by `beat` x `flicker` px (keys step `beat` -1..1; `flicker` is how far, from a slider). `trail`: two speed lines
 * of the glow stream back from just behind the tail, wherever it flickers to. Drawn pointing right, the
 * same above and below its middle row, so a game can turn it. Port of sprites/blaster-bolt.js (shapeOf) and
 * engine/shots.js lightShape, pixel for pixel.
 */
export const shotBar = defineGenerator({
  id: 'shot.bar', v: 1, family: 'fx',
  about: 'A bar of light pointing right, lit in bands from its rim to its core, its tail flickering: a blaster shot.',
  args: {
    at: point({ about: 'The middle: the bar is centred on at[0] and on the row at[1]' }),
    length: px(1, 320, { default: 16, about: 'How long it is, in pixels (a needle is 1.1 times as long)' }),
    thick: px(1, 32, { default: 4, about: 'Pixels across, without its rim' }),
    style: word(SHOT_BAR_STYLES, { default: 'bolt', about: 'Bolt (round nose, thin tail), pulse (head, dash, dot), needle (a spindle) or flat (flattened where it hit)' }),
    lead: px(0, 32, { default: 2, about: 'How far the nose sits past half the length (room for a trail behind)' }),
    beat: px(-1, 1, { default: 0, about: 'Where the tail is in its flicker: -1 in, 0 at rest, 1 out' }),
    flicker: px(0, 16, { default: 0, about: 'How far the tail flickers, in pixels' }),
    trail: flag({ default: false, about: 'Two speed lines of the glow (the second paint) stream back from its tail, level with its edges' }),
    paints: paints(4, { about: 'The core first, the glow, ...; the last is the rim' }),
  },
  keyable: ['beat'],
  // its box (as long as the bar and its flicker, with room for a short pulse's head and dash, as thick as the bar and a
  // rim): up to three shape tests a pixel, the two banding passes and the scans of its grid
  cost: (a) => {
    const w = 1.1 * a.length + a.flicker + a.thick + 24, h = a.thick + 2 * FLAT_REACH + 6;
    return charge(w, h, 9 * areaOf(w, h) + 32);
  },
  run(a, ctx) {
    const [W] = ctx.size, B = boxOf(ctx, null);
    const rows = Math.max(1, Math.round(a.thick));
    const half = rows / 2, cy = a.at[1] - Math.ceil(rows / 2) + half;
    const L = Math.round(a.length * (a.style === 'needle' ? 1.1 : 1));
    const beat = Math.round(a.beat * a.flicker);
    const flat = a.style === 'flat';
    const xh = Math.min(W - 3, flat ? a.at[0] + a.lead : a.at[0] + Math.ceil(L / 2) + a.lead), xt = flat ? xh - L : Math.max(3, xh - L - beat);
    // every style lies within [min(xt, xh - L) - rows - 12, xh + 2.5] x [cy - half - 6, cy + half + 6] (a short pulse's
    // head and dash reach left of its tail; a flat bar's oval above and below it); with a margin of empty pixels the
    // bands are the same as over the whole frame
    const S = boxIn(B, Math.min(xt, xh - L) - rows - 15, cy - half - FLAT_REACH - 3, xh + 6, cy + half + FLAT_REACH + 4);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    if (a.trail) {
      // sprites/blaster-bolt.js: two lines of the glow, level with the bar's edges, slide back from just behind its tail
      const P = a.paints, glowP = P[Math.min(1, P.length - 1)];
      speedLines(g, S, { at: [xt - 1, cy], count: 2, seed: 3, cycles: 1, angle: -90, length: 7, reach: 3, spread: half - 0.5, paints: [glowP, glowP, P[P.length - 1]] }, ctx.t);
    }
    lightBands(g, S, barShape(a.style, xt, xh, cy, rows), a.paints);
    return g.stamps();
  },
});

// ---- stamp pixels ------------------------------------------------------------------------------------------------

/** The pixels of a frame W x H less its 1 px border: the most one grid of a behaviour can paint there. */
const innerOf = (size) => Math.max(0, (Array.isArray(size) ? size[0] : 640) - 2) * Math.max(0, (Array.isArray(size) ? size[1] : 360) - 2);
/** The pixels of a box w x h, cut to the frame less its border. */
const boxPixels = (w, h, size) => Math.min(innerOf(size), areaOf(w, h));

/**
 * The most stamp pixels each behaviour can return in a frame of `size` [W, H] (2.7: a frame holds at most
 * SHAPE_CAPS.stampPixels, 8,192, and the registry refuses a call that returns more when it runs): "<id>@<v>" ->
 * (args with defaults filled, size) -> pixels. Each is the box its painting can reach, cut to the frame less its border;
 * monotone in each number, like a cost. catalog/sprite-schema.js refuses an emitter whose bound, as written and as its
 * clip keys set it, is over the cap, so what validates also loads (the second B12 review). Read through
 * engine/gen/index.js STAMP_BOUNDS; tests/unit/gen-b12-safety.test.mjs holds every run to its bound.
 */
export const FX_STAMP_BOUNDS = Object.freeze({
  // one stamp a particle, from its own 25 x 25 grid: its disc's box (size + 3 px a side), or 2 x 2, or 1 px
  'particles@1': (a, size) => a.count * Math.min(625, innerOf(size), a.size < 1.5 ? 1 : a.size < 2.5 ? 4 : Math.max(4, (Math.ceil(a.size) + 3) ** 2)),
  // within its tips' farthest reach (r1 + push), half a spike's width and the rim of the middle
  'starburst@1': (a, size) => { const d = 2 * (Math.max(a.r[0], a.r[1]) + a.push + a.width / 2) + 8; return boxPixels(d, d, size); },
  'glow@1': (a, size) => { const d = 2 * a.r * a.scale + 5; return boxPixels(d, d, size); },
  'ring@1': (a, size) => { const R = Math.max(a.r0, a.r1, 0.6); return boxPixels(2 * R + 6, 2 * Math.max(0.6, R * Math.max(0.1, a.squash)) + 6, size); },
  // its box, or the 32 x 32 tiles its lines can cross (a line n px long crosses at most 2 floor(n / 32) + 3)
  'streaks@1': (a, size) => {
    const side = 2 * (a.reach + a.length + a.spread + 2) + 3;
    return Math.min(boxPixels(side, side, size), a.count * (2 * Math.floor(Math.ceil(a.length + 0.5) / 32) + 3) * 1024);
  },
  // the puffs' middles lie within dist each way and dist + rise up (a floor moves them apart by at most a puff's
  // radius), each puff within its box (2.4 times its radius and a pixel) and a rim pixel
  'puffs@1': (a, size) => { const pad = 2.88 * a.size + 1, w = 2 * (a.dist + pad + 3) + 3; return boxPixels(w, w + a.rise + 1.2 * a.size, size); },
  'shot.bar@1': (a, size) => boxPixels(1.1 * a.length + a.flicker + a.thick + 24, a.thick + 2 * FLAT_REACH + 6, size),
});

/**
 * The keyable arguments of each behaviour that its cost or its stamp bound reads (docs/data-sprites.md 3.4 rule 2;
 * build item B12b): "<id>@<v>" -> names. An emitter is priced once, at the values it declares (or its bindings' largest)
 * and amount 1, so catalog/sprite-schema.js refuses a clip key that sets one of these above what the emitter sets: keys
 * may lower a size, never raise it. Its other keyable arguments (turns, cuts, cooling, the bolt's beat) move freely,
 * because neither price reads them (tests/unit/gen-b12-safety.test.mjs holds both to that). Read through
 * engine/gen/index.js SIZE_KEYS.
 */
export const FX_SIZE_KEYS = Object.freeze({
  'particles@1': Object.freeze(['size']),
  'starburst@1': Object.freeze(['width', 'push']),
  'glow@1': Object.freeze(['r', 'scale']),
  'ring@1': Object.freeze(['squash']),
  'streaks@1': Object.freeze(['length', 'reach', 'spread']),
  'puffs@1': Object.freeze(['dist', 'rise', 'size']),
  'shot.bar@1': Object.freeze([]),
});
