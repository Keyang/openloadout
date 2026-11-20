// The square ring and the grid rays (family "fx"): the big moment of a falling-block puzzle, square and flat. The look
// of the Gridline kit's big clear burst (bundles/specs/kit-puzzle-gridline.md, `quad-burst`: what the specification's
// squareRing of "engine/fx-square.js", rays of "engine/fx.js" and blockCell of "engine/blocks.js" drew; those code
// helpers were never carried over, so these are written from the specification and the reviewed renders).
//   square.ring@1  a square ring of light that opens from one size to another (a bar into a square), cools, thins and
//                  breaks into dashes, with a block cell (block.cell@2, engine/gen/block.js) riding each corner
//   ray.lines@1    rays 2 px across on the straight and the slanted lines of a grid, hot at the inner end, unbroken
//                  or dashed
// Neither reads the clip phase: the sprite's clip keys move `open`, `thick`, `cool`, `gaps` (the ring) and `r0`, `r1`,
// `cool`, `phase` (the rays) frame by frame, and bindings set the sizes (`from`, `to`, `weight`, `reach`), so the
// timing is data and the size follows a slider. Both return whole-pixel rects (the ring's cells are block.cell
// stamps), keep within `room` px of `at` and read nothing of the frame: each draws the same on a node as in frame
// pixels. `paints` is hottest first, the last the rim (engine/gen/fx-burst.js COLOURS: white, core, middle, edge, rim).
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM.
//
//   { "gen": "square.ring", "v": 1, "at": [48, 48], "from": [39, 5], "to": [39, 39], "open": 1, "thick": 4, "room": 47, "paints": ["shine", "core", "mid", "edge", "rim"] }
//   { "gen": "ray.lines", "v": 1, "at": [48, 48], "reach": 30, "r0": 0.26, "r1": 0.95, "room": 47, "paints": ["shine", "core", "mid", "edge", "rim"] }
import { defineGenerator } from './registry.js';
import { point, px, count, share, seed, word, flag, paint, paints } from './args.js';
import { hash, clamp, lerp } from '../motion.js';
import { blockCell2, BLOCK_STYLES } from './block.js';
import { workCost } from './pixels.js';

// light is flat: no shadow band, no highlight band
const FLAT = Object.freeze({ shade: 0, light: 0 });
const rect = (x, y, w, h, p) => ({ kind: 'rect', at: [x, y], size: [w, h], paint: p, ...FLAT });

/**
 * The stretches of a side that stay lit, as [from, to) along the side with 0 its middle and `half` its end: all of it
 * when `gaps` is 0; else `keep` px at each end always (the corners) and, between them, runs of `dash` px counted from
 * the middle, each dark when its hash is under `gaps`, the same on both halves.
 */
function litRuns(half, gaps, dash, keep, key) {
  if (!(gaps > 0) || half - keep <= 0) return [[-half, half]];
  const inner = half - keep, runs = [[-half, -inner]];
  const mid = [];
  for (let m = 0; m * dash < inner; m++) if (hash(m, key) >= gaps) mid.push([m * dash, Math.min(inner, (m + 1) * dash)]);
  for (let i = mid.length - 1; i >= 0; i--) runs.push([-mid[i][1], -mid[i][0]]);
  for (const r of mid) runs.push(r);
  runs.push([inner, half]);
  const out = [];
  for (const r of runs) { if (out.length && out[out.length - 1][1] === r[0]) out[out.length - 1][1] = r[1]; else out.push([...r]); }
  return out;
}

/**
 * square.ring@1: a ring with square corners centred on `at`. Its half sizes run from `from` (open 0) to `to` (open 1)
 * and past open 1 grow by `grow` px for each 1 more, never beyond `room`; so a flat bar opens upward and downward into
 * a square and swells. It is `thick` x `weight` px thick, measured inward (0: no ring; as thick as its smaller half
 * size or more: filled, a bar or a block). From the outside in: a 1 px line of the last paint (3 px and thicker), a
 * 1 px line one paint cooler than the body (4 px and thicker), then the body in the hottest paint left after `cool`
 * are dropped. `gaps` breaks each side into runs of `dash` px, that share of them dark (by `seed`), mirrored about the
 * side's middle and alike on facing sides; the corners always stay. `cell` 4 or more puts a block cell that many px a
 * side (block.cell@2 in `cellStyle`, band `cellEdge`, colour `cellPaint`, no symbol, no shine) centred on each corner,
 * moved inside `room`; the cells draw also when `thick` is 0, so they are what a ring leaves. Arguments: at, from, to,
 * open, grow, thick, weight, cool, gaps, dash, seed, cell, cellPaint, cellStyle, cellEdge, room, paints.
 */
export const squareRing = defineGenerator({
  id: 'square.ring', v: 1, family: 'fx',
  about: 'A square ring of light that opens from one size to another (a bar into a square), cools, thins and breaks into dashes, with a block cell riding each corner if wanted.',
  args: {
    at: point({ about: 'The middle (a pixel corner: 48, 48 in a 96 px frame)' }),
    from: point({ lo: 0, hi: 320, default: [12, 2], about: 'Its half sizes [across, up] when shut (open 0): a flat bar' }),
    to: point({ lo: 0, hi: 320, default: [12, 12], about: 'Its half sizes [across, up] when open (open 1)' }),
    open: px(0, 2, { default: 1, about: 'How far it has opened: 0 shut, 1 open, up to 2 grown beyond' }),
    grow: px(0, 64, { default: 0, about: 'Pixels each half size grows for each 1 that open is past 1' }),
    thick: px(0, 32, { default: 3, about: 'Pixels thick, measured inward (0: no ring; as thick as its smaller half size: filled)' }),
    weight: px(0.25, 4, { default: 1, about: 'Multiplies the thickness: a Size slider\'s share' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints it has lost (rounded; the last always stays)' }),
    gaps: share({ default: 0, about: 'The share of each side\'s dashes that are dark (0: unbroken)' }),
    dash: count(2, 16, { default: 5, about: 'A dash\'s length when it breaks up' }),
    seed: seed({ default: 3, about: 'Which dashes go dark' }),
    cell: count(0, 16, { default: 0, about: 'The side of the block cell on each corner (4 or more; under 4: none)' }),
    cellPaint: paint({ default: 'clear', about: 'The corner cells\' colour' }),
    cellStyle: word(BLOCK_STYLES, { default: 'bevel', about: 'The corner cells\' finish (block.cell@2)' }),
    cellEdge: count(1, 3, { default: 1, about: 'The corner cells\' band (block.cell@2 edge)' }),
    room: px(2, 320, { default: 47, about: 'How far from the middle a pixel may be, each way: 1 px less than half the frame' }),
    paints: paints(8, { about: 'Its colours hottest first: white, the core, a middle, the edge colour, the last its dark rim' }),
  },
  keyable: ['open', 'thick', 'cool', 'gaps'],
  // three lines of the band on four sides, each cut into at most its dashes and the two corner runs; four cells
  cost: (a) => 12 * (Math.ceil((2 * a.room) / a.dash) + 3) + (a.cell >= 4 ? 4 * (1 + workCost(a.cell * a.cell * 16)) : 0),
  run(a, ctx) {
    const ax = Math.round(a.at[0]), ay = Math.round(a.at[1]), room = Math.floor(a.room);
    const k = clamp(a.open), past = Math.max(0, a.open - 1) * a.grow;
    const half = (i) => Math.min(room, Math.max(0, Math.round(lerp(a.from[i], a.to[i], k) + past)));
    const rx = half(0), ry = half(1), least = Math.min(rx, ry);
    const out = [];
    const T = a.thick > 0 ? Math.min(least, Math.max(1, Math.round(a.thick * a.weight))) : 0;
    if (T > 0) {
      const C = a.paints, last = C.length - 1, c = Math.min(last, Math.max(0, Math.round(a.cool)));
      const body = C[c], next = C[Math.min(last, c + 1)], rim = C[last];
      // the band's lines from the outside in, each [from, to) px in from the outer edge
      const lines = [];
      let d = 0;
      if (T >= 3 && body !== rim) lines.push([d, ++d, rim]);
      if (T >= 4 && next !== rim && next !== body) lines.push([d, ++d, next]);
      lines.push([d, T, body]);
      const filled = T >= least, gaps = filled ? 0 : a.gaps, keep = Math.max(a.dash, T + 2);
      const across = litRuns(rx, gaps, a.dash, keep, a.seed * 8), up = litRuns(ry, gaps, a.dash, keep, a.seed * 8 + 1);
      for (const [i0, i1, p] of lines) {
        // the top and bottom strips, the whole width of this line; then the left and right strips between them (T is
        // at most the smaller half size, so facing strips meet at the middle at most and never overlap)
        for (const [u0, u1] of across) {
          const x0 = Math.max(u0, -rx + i0), x1 = Math.min(u1, rx - i0);
          if (x1 <= x0) continue;
          out.push(rect(ax + x0, ay - ry + i0, x1 - x0, i1 - i0, p), rect(ax + x0, ay + ry - i1, x1 - x0, i1 - i0, p));
        }
        for (const [u0, u1] of up) {
          const y0 = Math.max(u0, -ry + i1), y1 = Math.min(u1, ry - i1);
          if (y1 <= y0) continue;
          out.push(rect(ax - rx + i0, ay + y0, i1 - i0, y1 - y0, p), rect(ax + rx - i1, ay + y0, i1 - i0, y1 - y0, p));
        }
      }
    }
    if (a.cell >= 4) {
      const n = a.cell, lo = (m) => m - room, hi = (m) => m + room - n;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = Math.max(lo(ax), Math.min(hi(ax), Math.round(ax + sx * rx - n / 2)));
        const y = Math.max(lo(ay), Math.min(hi(ay), Math.round(ay + sy * ry - n / 2)));
        out.push(...blockCell2.run({ at: [x, y], size: n, style: a.cellStyle, edge: a.cellEdge, symbol: 'none', paint: a.cellPaint, shine: 'clear', ink: 'ink' }, ctx));
      }
    }
    return out;
  },
});

/**
 * ray.lines@1: rays from `at` along the lines of a grid: right, left, up and down, and (`slanted`) the four slanted
 * ones between, each 2 px across and laid from the four middle pixels so that they mirror each other. A ray runs from
 * `r0` x `reach` to `r1` x `reach` px out (a slanted one that many pixel steps times `slant`, so at 1 its tip is on
 * the corner of the square the straight tips touch), never beyond `room`; nothing draws while r1 is not past r0. Along
 * its length it runs through `paints` from the hottest left after `cool` are dropped to the last but one (the last,
 * the rim, only when it is all that is left). `gap` above 0 cuts it into `dash` lit px and `gap` dark; `phase` slides
 * the dashes outward by that share of one dash and gap. Arguments: at, reach, r0, r1, cool, dash, gap, phase, slanted,
 * slant, room, paints.
 */
export const rayLines = defineGenerator({
  id: 'ray.lines', v: 1, family: 'fx',
  about: 'Rays 2 px across on the straight and slanted lines of a grid, hot at the inner end, unbroken or dashed: the rays of a square burst.',
  args: {
    at: point({ about: 'The middle (a pixel corner: 48, 48 in a 96 px frame)' }),
    reach: px(0, 320, { default: 24, about: 'The rays\' full length in pixels: r0 and r1 are shares of it' }),
    r0: px(0, 2, { default: 0.25, about: 'Where each ray starts, as a share of reach' }),
    r1: px(0, 2, { default: 1, about: 'Where each ray ends, as a share of reach' }),
    cool: px(0, 7, { default: 0, about: 'How many of the hottest paints they have lost (rounded; the last always stays)' }),
    dash: count(1, 16, { default: 4, about: 'Lit pixels of each dash, when gap is above 0' }),
    gap: count(0, 16, { default: 0, about: 'Dark pixels between dashes (0: unbroken rays)' }),
    phase: px(0, 8, { default: 0, about: 'How far the dashes have slid outward, in dash-and-gap lengths' }),
    slanted: flag({ default: true, about: 'The four slanted rays too (false: only right, left, up and down)' }),
    slant: px(0.5, 1.5, { default: 1, about: 'A slanted ray\'s pixel steps beside a straight ray\'s pixels' }),
    room: px(2, 320, { default: 47, about: 'How far from the middle a pixel may be, each way: 1 px less than half the frame' }),
    paints: paints(8, { about: 'Its colours hottest first: white, the core, a middle, the edge colour, the last its dark rim' }),
  },
  keyable: ['r0', 'r1', 'cool', 'phase'],
  // a straight ray is at most one rect a pixel of its length, a slanted one exactly that; none is longer than room
  cost: (a) => (a.slanted ? 8 : 4) * (Math.ceil(a.room) + 1),
  run(a) {
    const ax = Math.round(a.at[0]), ay = Math.round(a.at[1]), room = Math.floor(a.room);
    const C = a.paints, last = C.length - 1, c = Math.min(last, Math.max(0, Math.round(a.cool)));
    const list = c >= last ? [C[last]] : C.slice(c, last);
    const period = a.dash + a.gap, slide = Math.round(a.phase * period);
    const out = [];
    /** The steps of one ray that are lit, as [step, paint], for a ray `scale` pixel steps a pixel of reach. */
    const steps = (scale) => {
      const n0 = Math.round(a.reach * a.r0 * scale), n1 = Math.min(room, Math.round(a.reach * a.r1 * scale));
      const lit = [];
      for (let s = n0; s < n1; s++) {
        if (a.gap > 0 && ((((s - slide) % period) + period) % period) >= a.dash) continue;
        lit.push([s, list[Math.min(list.length - 1, Math.floor(((s - n0) / (n1 - n0)) * list.length))]]);
      }
      return lit;
    };
    // straight rays: runs of one paint as rects 2 px across
    const straight = steps(1);
    for (let i = 0; i < straight.length;) {
      let j = i + 1;
      while (j < straight.length && straight[j][0] === straight[j - 1][0] + 1 && straight[j][1] === straight[i][1]) j++;
      const s0 = straight[i][0], n = j - i, p = straight[i][1];
      out.push(rect(ax + s0, ay - 1, n, 2, p), rect(ax - s0 - n, ay - 1, n, 2, p), rect(ax - 1, ay + s0, 2, n, p), rect(ax - 1, ay - s0 - n, 2, n, p));
      i = j;
    }
    if (a.slanted) {
      // slanted rays: each step one pixel out and one along, two pixels tall, the second toward the middle row
      for (const [s, p] of steps(a.slant)) {
        for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          const x = sx > 0 ? ax + s : ax - 1 - s, y = sy > 0 ? ay + s : ay - 1 - s;
          out.push(rect(x, Math.min(y, y - sy), 1, 2, p));
        }
      }
    }
    return out;
  },
});

/** The most stamp pixels each generator here can return ("<id>@<v>" -> (args, size) -> pixels): the ring's four corner cells, one stamp each; the rays are rects (engine/gen/index.js STAMP_BOUNDS). */
export const QUAD_STAMP_BOUNDS = Object.freeze({
  'square.ring@1': (a) => (a.cell >= 4 ? 4 * a.cell * a.cell : 0),
  'ray.lines@1': () => 0,
});

/** The keyable arguments of each generator here that its cost or stamp bound reads: none (engine/gen/index.js SIZE_KEYS). */
export const QUAD_SIZE_KEYS = Object.freeze({
  'square.ring@1': Object.freeze([]),
  'ray.lines@1': Object.freeze([]),
});
