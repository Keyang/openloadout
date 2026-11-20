// The health cell (migration batch M1, docs/data-sprites.md section 9): cell@1, family "shape", draws a small container
// of glowing charge (a glass cell between two caps, a syringe, or a med pack with a cross window) filled to a level, its
// charge flaring on a beat; with layer "halo", the light that spills beside the glass on a strong beat (drawn after the
// outline). cell.pulse@1, family "motion", beats it (idle) or swells and shrinks it (collect). Port of
// sprites/health-cell.js render with engine/gadgets.js cellIn, drawCharge and haloIn, pixel for pixel, as stamps.
import { defineGenerator } from './registry.js';
import { point, px, count, share, word, flag, paint } from './args.js';
import { Pixels, rampOf, mixOf, tilesFor } from './pixels.js';
import { rectIn } from '../surface.js';
import { keys, fract, clamp } from '../motion.js';

// engine/ui.js roundRectIn and engine/shapes.js insetIn, copied (this module keeps no drawing helper alive)
const CUTS = [[], [1], [2, 1], [3, 1, 1], [4, 2, 1, 1]];
const roundRectIn = (x, y, w, h, k = 0) => {
  const cuts = CUTS[Math.max(0, Math.min(k, 4, Math.floor((Math.min(w, h) - 1) / 2)))];
  return (px0, py0) => {
    const ix = Math.floor(px0 - x), iy = Math.floor(py0 - y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
    const dx = Math.min(ix, w - 1 - ix), dy = Math.min(iy, h - 1 - iy);
    return !(dy < cuts.length && dx < cuts[dy]);
  };
};
const insetIn = (test) => (x, y) => test(x, y) && test(x - 1, y) && test(x + 1, y) && test(x, y - 1) && test(x, y + 1);

/** engine/gadgets.js cellIn: a container h px tall upright round (0, 0): { casing, seams, window, shine, fill: [from, to], half }. */
function cellIn(h, shape) {
  const top = -h / 2, bottom = h / 2;
  if (shape === 'syringe') {
    const half = Math.max(4, Math.round(h * 0.22)), bw = half - 2;
    const needle = Math.max(3, Math.round(h * 0.2)), hub = 2, grip = h >= 20 ? 2 : 1, rod = Math.max(2, Math.round(h * 0.12)), pad = 2;
    const barrel = h - needle - hub - grip - rod - pad;
    const y1 = top + needle, y2 = y1 + hub, y3 = y2 + barrel, y4 = y3 + grip, y5 = y4 + rod;
    const parts = [rectIn(-1, top, 2, needle), rectIn(-bw + 1, y1, 2 * bw - 2, hub), rectIn(-half, y3, 2 * half, grip), rectIn(-1, y4, 2, rod), rectIn(-half + 1, y5, 2 * half - 2, pad)];
    return {
      casing: (x, y) => { for (const f of parts) if (f(x, y)) return true; return false; },
      seams: (x, y) => x >= -bw && x < bw && ((y >= y2 && y < y2 + 1) || (y >= y3 - 1 && y < y3)),
      window: rectIn(-bw, y2 + 1, 2 * bw, barrel - 2),
      shine: rectIn(bw - 2, y2 + 2, 1, Math.max(2, Math.round((barrel - 2) * 0.4))),
      fill: [y2 + 1, y3 - 1], half,
    };
  }
  if (shape === 'pack') {
    const boxH = 2 * Math.floor((h - 3) / 2), grab = h - boxH, half = Math.round(h * 0.45), yb = top + grab, cy = yb + boxH / 2;
    const size = 2 * Math.floor((Math.min(boxH, 2 * half) - 4) / 2), a = size / 2, b = size >= 10 ? 2 : 1;
    const box = roundRectIn(-half, yb, 2 * half, boxH, 2);
    const handle = rectIn(-4, top, 8, grab), slot = rectIn(-3, top + 1, 6, grab - 1);
    const cross = (x, y) => { const X = Math.abs(x), Y = Math.abs(y - cy); return (X < a && Y < b) || (X < b && Y < a); };
    const seams = (x, y) => slot(x, y) || (!cross(x, y) && (cross(x - 1, y) || cross(x + 1, y) || cross(x, y - 1) || cross(x, y + 1)));
    return { casing: (x, y) => (box(x, y) || handle(x, y)) && !cross(x, y) && !seams(x, y), seams, window: cross, shine: () => false, fill: [cy + a, cy - a], half };
  }
  const cap = Math.max(3, Math.round(h * 0.2)), half = Math.max(5, Math.round(h * 0.3)), tw = half - 2;
  const capA = roundRectIn(-half, top, 2 * half, cap, 1), capB = roundRectIn(-half, bottom - cap, 2 * half, cap, 1);
  return {
    casing: (x, y) => capA(x, y) || capB(x, y),
    seams: (x, y) => x >= -tw && x < tw && ((y >= top + cap && y < top + cap + 1) || (y >= bottom - cap - 1 && y < bottom - cap)),
    window: rectIn(-tw, top + cap + 1, 2 * tw, h - 2 * cap - 2),
    shine: rectIn(tw - 2, top + cap + 2, 1, Math.max(2, Math.round((h - 2 * cap - 2) * 0.4))),
    fill: [bottom - cap - 1, top + cap + 1], half,
  };
}

/** The containers cell@1 draws, in the order a choice lists them: cell (a glass tube between two caps), syringe, pack (a med pack with a cross window). */
export const CELL_KINDS = Object.freeze(['cell', 'syringe', 'pack']);

const even = (v) => 2 * Math.round(v / 2);
const reach = (a) => Math.ceil((even(a.height) / 2) * Math.max(1, a.scale) * 1.6 + 6);

/** cell@1: a container of glowing charge filled to `level`, flaring with `beat`; layer "halo" is the light beside it on a strong beat (port of sprites/health-cell.js). */
export const cell = defineGenerator({
  id: 'cell', v: 1, family: 'shape',
  about: 'A small container of glowing charge (a cell, a syringe or a med pack) filled to a level, flaring on a beat; or the halo of light beside it.',
  args: {
    at: point({ about: 'Its middle (an even height sits on the pixel corner nearest it)' }),
    shape: word(CELL_KINDS, { default: 'cell', about: 'Which container' }),
    height: count(8, 30, { about: 'Pixels tall (made even)' }),
    level: share({ default: 0.8, about: 'How full: two rows are always lit' }),
    beat: share({ default: 0, about: 'The beat: 0 at rest; 0.3 and up the charge flares, 0.6 and up its core goes white and the halo shows' }),
    layer: word(['body', 'halo'], { default: 'body', about: 'body: the container; halo: the light spilling beside it (draw it after the outline)' }),
    scale: px(0, 2, { default: 1, about: 'Its size as a share of `height`' }),
    squash: px(-0.5, 0.5, { default: 0, about: 'Wider (above 0) or taller (below 0)' }),
    bare: flag({ default: false, about: 'Small and moving fast: full, no shine' }),
    casing: paint({ about: 'The case: its ramp, the seams in its deep tone' }),
    charge: paint({ about: 'The glowing charge: its ramp' }),
    shine: paint({ about: 'White: the glass shine and a flaring core' }),
  },
  keyable: ['beat', 'scale', 'squash', 'bare'],
  cost: (a) => tilesFor(2 * reach(a), 2 * reach(a)),
  run(a) {
    if (a.scale <= 0.3) return [];
    const h = even(a.height), C = cellIn(h, a.shape);
    const cx = Math.round(a.at[0]), cy = Math.round(a.at[1]);
    const sx = a.scale * (1 + a.squash), sy = a.scale * (1 - a.squash);
    const put = (test) => (x, y) => test((x - cx) / sx, (y - cy) / sy);
    const R = reach(a), g = new Pixels(cx - R, cy - R, 2 * R, 2 * R), B = [cx - R, cy - R, cx + R, cy + R];
    const M = rampOf(a.casing), G = rampOf(a.charge);
    // drawCharge
    const [from, to] = C.fill, span = Math.abs(to - from), level = a.bare ? 1 : a.level;
    const wetReach = Math.max(Math.min(2, span), span * clamp(level));
    const wetUp = from > to ? (x, y) => y >= from - wetReach && C.window(x, y) : (x, y) => y < from + wetReach && C.window(x, y);
    const wet = put(wetUp), b = clamp(a.beat);
    if (a.layer === 'halo') {
      if (b < 0.6) return [];
      const whole = put((x, y) => C.casing(x, y) || C.seams(x, y) || C.window(x, y));
      const near = (f, x, y, d) => f(x - d, y) || f(x + d, y) || f(x, y - d) || f(x, y + d);
      g.fill(...B, (x, y) => !whole(x, y) && !near(whole, x, y, 1) && near(wet, x, y, 2), b >= 0.95 ? mixOf(G.light, a.shine, 0.4) : G.light);
      return g.stamps();
    }
    g.blob([put(C.casing)], M, { light: 1 });
    g.fill(...B, put(C.seams), M.deep);
    g.fill(...B, put(C.window), G.dark);
    g.fill(...B, wet, b >= 0.3 ? G.light : G.base);
    g.fill(...B, put(insetIn(wetUp)), b >= 0.6 ? a.shine : b >= 0.3 ? mixOf(G.light, a.shine, 0.5) : G.light);
    if (!a.bare && b < 0.3) g.fill(...B, put(C.shine), a.shine, { clip: wet });
    return g.stamps();
  },
});

const BEAT = Object.freeze([[0, 0], [0.125, 1], [0.25, 0.4], [0.375, 0.9], [0.5, 0.35], [0.625, 0.1], [0.75, 0], [1, 0]]);
/** cell.pulse@1: beats the cell@1 calls on its node twice a loop (idle, engine/pickups.js heartbeat), or swells and shrinks them as a collected pickup (collect, with pickup.collect@1 moving it). */
export const cellPulse = defineGenerator({
  id: 'cell.pulse', v: 1, family: 'motion',
  about: 'Beats a health cell twice a loop like a heart, or swells and shrinks it as it is collected.',
  args: {
    mode: word(['beat', 'collect'], { default: 'beat', about: 'beat: the idle heartbeat; collect: the swell and shrink' }),
    stretch: share({ default: 1, about: 'How much of the squash and stretch of a collect it takes (a tall one less, so it stays in the frame)' }),
  },
  cost: () => 0,
  run(a, ctx) {
    if (a.mode === 'collect') {
      const t = ctx.t, scale = keys(t, [[0, 1], [0.5, 1], [0.58, 1.1], [0.75, 0.5], [0.86, 0]]);
      const squash = a.stretch * keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
      return [{ move: [0, 0], args: { 'cell.beat': 0, 'cell.scale': scale, 'cell.squash': squash, 'cell.bare': scale < 0.9 } }];
    }
    return [{ move: [0, 0], args: { 'cell.beat': keys(fract(ctx.t), BEAT, (x) => x) } }];
  },
});
