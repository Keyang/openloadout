// Shared pieces of the effect behaviours that build item B12c adds (docs/data-sprites.md 2.5c, 3.3 "fx", section 9 row
// B12c): engine/gen/fx-glints.js, fx-debris.js, fx-fire.js, fx-spells.js and fx-fields.js. Not a family module: it
// registers nothing. These are the same rules engine/gen/fx-burst.js (B12) keeps to, written out once for the new
// files so fx-burst.js (released, pinned by its goldens) is left as it is:
//   - FRAME PIXELS: every behaviour keeps to the frame's 1 px empty border (and to its `area` when it has one), as
//     engine/fx.js, engine/bursts.js and engine/spells.js do; so each is named as an emitter, not on a node. One
//     exception: fall.field@1 (fx-fields.js), a weather layer that fills the whole frame, border rows included, as
//     engine/weather.js fallField did. tests/unit/gen-b12c-safety.test.mjs guards both rules.
//   - TIME: the clip phase ctx.t, fract(t) in a looping clip; `begin` and `end` start a one-shot later and end it sooner.
//   - COLOURS: paint refs only. Where the code worked out a tone of a colour (engine/color.js tone), the port names the
//     colour rule that works out the same tone ({ rule: 'tone', of, by }), so a sprite's look changes it as it would.
//   - COST: the stamps a call can return or the simple shape tests it can make (engine/gen/pixels.js workCost),
//     whichever is more, from its arguments alone (never `at`, which every key may move), monotone in each number.
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
import { share, px, struct } from './args.js';
import { Pixels, tilesFor, workCost, colourOf } from './pixels.js';
import { hash, fract, clamp, lerp, PI } from '../motion.js';

/** Degrees to radians: data angles are degrees (rig convention, 0 down, 90 right, 180 up), the code's were radians. */
export const RAD = Math.PI / 180;
/** The most stamps a frame-sized grid can give (640 x 360 in 32 x 32 tiles). */
export const MAX_TILES = tilesFor(640, 360);
/** The most pixels a behaviour can visit in one box: the biggest frame's. */
export const FRAME_AREA = 640 * 360;
/** The 32 x 32 tiles of a box w x h (rounded up), at most a frame's worth. */
export const tilesOf = (w, h) => Math.min(MAX_TILES, tilesFor(Math.ceil(w), Math.ceil(h)));
/** The pixels of a box w x h, at least 1, cut to the biggest frame. */
export const areaOf = (w, h) => Math.min(FRAME_AREA, Math.max(1, Math.ceil(w)) * Math.max(1, Math.ceil(h)));
/** A behaviour's cost: the stamps of a w x h box or the shape tests it makes, whichever is more (fx-burst.js charge). */
export const charge = (w, h, tests) => Math.max(tilesOf(w, h), workCost(tests));
/** The pixels of a frame of `size` less its 1 px border: the most one grid can paint there. */
export const innerOf = (size) => Math.max(0, (Array.isArray(size) ? size[0] : 640) - 2) * Math.max(0, (Array.isArray(size) ? size[1] : 360) - 2);
/** The pixels of a box w x h, cut to the frame less its border: a stamp bound. */
export const boxPixels = (w, h, size) => Math.min(innerOf(size), areaOf(w, h));

/** The `begin` argument every one-shot takes: when in the clip it starts. */
export const beginArg = () => share({ default: 0, about: 'When in the clip it starts, as a share of the clip: before it nothing is drawn' });
/** The `end` argument every one-shot takes: when in the clip it is over. */
export const endArg = () => share({ default: 1, about: 'When in the clip it is over, as a share of the clip: after it its last look holds' });
/** The `area` argument: a box to keep to, inside the frame's border (default the whole frame). */
export const areaArg = (about = 'The box it stays in, always inside the frame\'s 1 px border') => struct({ x0: px(0, 640), y0: px(0, 360), x1: px(0, 640), y1: px(0, 360) }, { default: { x0: 0, y0: 0, x1: 640, y1: 360 }, about });

/** The behaviour's own phase 0..1 at ctx (fract(t) in a looping clip), with begin and end; null before it begins. */
export function phaseOf(a, ctx) {
  const u = ctx.loop ? fract(ctx.t) : clamp(ctx.t);
  const begin = a.begin ?? 0, end = a.end ?? 1;
  if (u < begin) return null;
  return end > begin ? clamp((u - begin) / (end - begin)) : 1;
}

/** The frame less its 1 px border, cut to `area`: [x0, y0, x1, y1], x0 <= x < x1 (engine/fx.js boxOf). */
export function boxOf(ctx, area) {
  const [W, H] = ctx.size;
  const b = [1, 1, W - 1, H - 1];
  if (area) { b[0] = Math.max(b[0], Math.floor(area.x0)); b[1] = Math.max(b[1], Math.floor(area.y0)); b[2] = Math.min(b[2], Math.floor(area.x1)); b[3] = Math.min(b[3], Math.floor(area.y1)); }
  return b;
}

/** The box [x0, y0, x1, y1) (floored and ceiled outward) cut to the box B: where a behaviour works. */
export function boxIn(B, x0, y0, x1, y1) {
  return [Math.max(B[0], Math.floor(x0)), Math.max(B[1], Math.floor(y0)), Math.min(B[2], Math.ceil(x1)), Math.min(B[3], Math.ceil(y1))];
}
/** True when a box from boxIn holds no pixel. */
export const emptyBox = (S) => !(S[2] > S[0] && S[3] > S[1]);
/** A grid over the box S; its stamps are cut from what is painted, so they are the same as a whole frame's would be. */
export const gridOf = (S) => new Pixels(S[0], S[1], Math.max(0, S[2] - S[0]), Math.max(0, S[3] - S[1]));
/** A grid of side 2 * reach + 1 round the pixel of (x, y), cut to B: one small thing's own grid. */
export const gridAround = (B, x, y, reach) => gridOf(boxIn(B, Math.floor(x) - reach, Math.floor(y) - reach, Math.floor(x) + reach + 1, Math.floor(y) + reach + 1));

/** engine/fx.js stepAt: pick a step by heat, 1 the hottest (first), 0 the rim (last). */
export function stepAt(list, heat) {
  return list[Math.round((1 - clamp(heat)) * (list.length - 1))];
}

/** engine/fx.js lifeOf: life 0..1 of thing i at phase t (looping: on its own timer; one-shot: after a staggered wait). */
export function lifeOf(t, i, { seed: s = 0, loop = true, cycles = 1, stagger = 0.6 } = {}) {
  const h = hash(i, s * 64 + 1);
  if (loop) return fract(cycles * t + h);
  const tt = clamp(t), delay = h * stagger;
  if (tt <= delay) return 0;
  return delay >= 1 ? 1 : (tt - delay) / (1 - delay);
}

/** engine/fx.js inside01: v kept a hair inside lo..hi. */
export const inside01 = (v, lo, hi) => Math.min(Math.max(v, lo + 0.01), hi - 0.01);
/** engine/bursts.js within: v held to lo..hi (their middle when hi < lo). */
export const within = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : v < lo ? lo : v > hi ? hi : v);

/** engine/fx.js put: one pixel (floored) when it is inside the box B. */
export function put(g, B, x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < B[0] || y < B[1] || x >= B[2] || y >= B[3]) return;
  g.set(x, y, c);
}

/** engine/fx.js paint: each pixel of the box whose centre colourAt gives a paint for takes it. */
export function paintBox(g, B, x0, y0, x1, y1, colourAt) {
  const ax = Math.max(B[0], Math.floor(x0)), ay = Math.max(B[1], Math.floor(y0));
  const bx = Math.min(B[2] - 1, Math.ceil(x1)), by = Math.min(B[3] - 1, Math.ceil(y1));
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    const c = colourAt(x + 0.5, y + 0.5);
    if (c) g.set(x, y, c);
  }
}

/** A clip test for the box B (pixel centres inside it). */
export const clipOf = (B) => (px0, py0) => px0 >= B[0] && py0 >= B[1] && px0 < B[2] && py0 < B[3];

/** The colour rule for engine/color.js tone(ref, by) as a paint ref (by 0: the ref itself). */
export function toneRule(ref, by) {
  return by === 0 ? ref : { rule: 'tone', of: colourOf(ref), by };
}

/** True when a paint argument says "none" ('clear' is the convention for an optional paint left out). */
export const isNone = (p) => p === 'clear';

// ---- engine/spells.js layered and spineOf ---------------------------------------------------------------------

/**
 * engine/spells.js layered on a grid: a shape painted as nested layers of light, its 1 px rim the last paint, its body
 * the one before, each hotter paint `depth` px further in as far as the shape is thick enough. B is the box it works in
 * (the frame's border, or a box round the shape with a margin of empty pixels, which gives the same pixels).
 */
export function layered(g, B, inside, colours, depth = 1) {
  const w = B[2] - B[0], h = B[3] - B[1];
  if (w <= 0 || h <= 0) return 0;
  let m = new Uint8Array(w * h), n = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (inside(B[0] + xx + 0.5, B[1] + yy + 0.5)) { m[yy * w + xx] = 1; n++; }
  if (!n) return 0;
  const test = (mask) => (px0, py0) => { const xx = Math.floor(px0) - B[0], yy = Math.floor(py0) - B[1]; return xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx] === 1; };
  const clip = clipOf(B), last = colours.length - 1;
  if (last === 0) g.fill(B[0], B[1], B[2], B[3], test(m), colours[0], { clip });
  else g.fill(B[0], B[1], B[2], B[3], test(m), colours[last - 1], { outline: colours[last], clip });
  for (let j = last - 2; j >= 0; j--) {
    for (let d = 0; d < Math.max(1, Math.round(depth)); d++) {
      const e = new Uint8Array(w * h);
      let left = 0;
      for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
        const i = yy * w + xx;
        if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w]) { e[i] = 1; left++; }
      }
      m = e;
      if (!left) return n;
    }
    g.fill(B[0], B[1], B[2], B[3], test(m), colours[j], { clip });
  }
  return n;
}

/** engine/spells.js spineOf: the pixels an unbroken 1 px line through the points covers, as a Set of y * 4096 + x. */
export function spineOf(pts, from = 0, to = 1) {
  const set = new Set();
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len * 2));
    for (let e = 0; e <= n; e++) {
      const k = (done + (len * e) / n) / (total || 1);
      if (k < from || k > to) continue;
      set.add(Math.floor(ay + ((by - ay) * e) / n) * 4096 + Math.floor(ax + ((bx - ax) * e) / n));
    }
    done += len;
  }
  return set;
}

// ---- engine/bursts.js sparkMark -------------------------------------------------------------------------------

/** The styles of a spark mark (engine/bursts.js SPARK_STYLES): plus, diamond, dot. */
export const SPARK_STYLES = Object.freeze(['plus', 'diamond', 'dot']);

/**
 * engine/bursts.js sparkMark on a grid: one small mark of light at (x, y), `reach` 0..4 px to its tips, in a style;
 * list is the paints hottest first with the rim last, core the middle's paint, full fills a plus's arms with the core.
 */
export function sparkMark(g, B, x, y, reach, style, list, { core, full = false } = {}) {
  const arm = list.at(-2) ?? list[0];
  const mid = core ?? list[0];
  const tip = list.length >= 3 ? list.at(-1) : arm;
  const r = Math.max(0, Math.min(4, Math.round(reach)));
  x = Math.floor(x); y = Math.floor(y);
  if (r === 0) { put(g, B, x, y, arm); return; }
  if (style === 'dot') {
    const n = r + 1, x0 = x - ((n - 1) >> 1), y0 = y - ((n - 1) >> 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const corner = (i === 0 || i === n - 1) && (j === 0 || j === n - 1);
      if (n >= 4 && corner) continue;
      if (n >= 3 && (i === 0 || j === n - 1) && !(i === n - 1 || j === 0)) { put(g, B, x0 + i, y0 + j, tip); continue; }
      const lit = n === 2 ? i === 1 && j === 0 : n === 3 ? i >= 1 && j <= 1 : i >= 1 && i <= n - 2 && j >= 1 && j <= n - 2;
      put(g, B, x0 + i, y0 + j, lit ? mid : arm);
    }
    return;
  }
  if (style === 'diamond') {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.abs(i) + Math.abs(j);
      if (d <= r) put(g, B, x + i, y + j, d < r ? mid : r >= 2 && (i === 0 || j === 0) ? tip : arm);
    }
    return;
  }
  for (let i = 1; i <= r; i++) {
    const c = (full ? i < r : r >= 3 && i <= r - 2) ? mid : r >= 2 && i === r ? tip : arm;
    put(g, B, x - i, y, c); put(g, B, x + i, y, c); put(g, B, x, y - i, c); put(g, B, x, y + i, c);
  }
  if (r >= 3) for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(g, B, x + i, y + j, arm);
  put(g, B, x, y, mid);
}

/**
 * engine/creature.js leafIn, copied so the behaviours do not import a drawing helper that goes with the code sprites:
 * the shape test of a pointed leaf from (x0, y0) to (x1, y1), `width` px across, its widest at `belly`, its base `blunt`.
 */
export function leafIn(x0, y0, x1, y1, width, { belly = 0.4, blunt = 0.3 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1e-6, ux = dx / len, uy = dy / len, b = clamp(belly, 0.05, 0.95);
  return (px0, py0) => {
    const s = ((px0 - x0) * ux + (py0 - y0) * uy) / len;
    if (s < 0 || s > 1) return false;
    const d = Math.abs((px0 - x0) * uy - (py0 - y0) * ux);
    const k = s < b ? lerp(blunt, 1, Math.sin((PI / 2) * (s / b))) : 1 - ((s - b) / (1 - b)) ** 1.6;
    return d <= (width / 2) * k;
  };
}
