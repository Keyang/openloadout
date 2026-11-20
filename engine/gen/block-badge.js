// The block badge (family "block"): a title emblem made of block cells fitted into each other like pieces, and the
// line of light round it. The look of the Gridline kit's title emblem (bundles/specs/kit-puzzle-gridline.md,
// `gridline-emblem`: what its code sprite drew with blockCell, rectsRim and rimRun, which were never carried over; so
// these are written from the specification and the reviewed renders). Two generators, so the cells can take a colour
// scheme's seven paints inside a piece (pieces/part-badge-<scheme>.v1.json) while the sprite gives the rim its light:
//
//   { "gen": "block.badge", "v": 1, "at": [48, 32], "shape": "diamond", "cell": 8, "style": "bevel", "paints": ["c1", ... "c7"], "flash": "shine", "play": "rest" }
//   { "gen": "block.badgeRim", "v": 1, "at": [48, 32], "shape": "diamond", "cell": 8, "outline": true, "paint": "glow", "shine": "shine", "play": "round" }
//
// Both are laid out round `at`, the middle of the shape's box of cells, and both play over the clip phase when `play`
// asks: build (a 12-frame one-shot: the bottom row, then the rows above dropping in two lots, each landing in a flash,
// then the outline closing) and shine (an 8-frame one-shot: a band of light crossing the cells), round (a loop: the
// light runs once round the outline). Each cell is block.cell@2, called through the registry: there is one block face.
import { defineGenerator } from './registry.js';
import { point, count, px, paint, paints, word, flag } from './args.js';
import { Pixels, toneOf, mixOf, workCost } from './pixels.js';
import { BLOCK_STYLES } from './block.js';

/** The shapes block.badge@1 lays cells out in: a diamond round an empty middle, an arrow pointing up, steps rising to the right, a square ring round one cell. */
export const BADGE_SHAPES = Object.freeze(['diamond', 'arrow', 'stairs', 'ring']);

/** What block.badge@1 plays over the clip: rest (the whole badge), build (rows dropping in, each landing in a flash), shine (a band of light crossing the cells). */
export const BADGE_PLAYS = Object.freeze(['rest', 'build', 'shine']);

/** What block.badgeRim@1 plays over the clip: rest (the light at its start), round (the light runs once round, a loop), build (nothing, then the outline closing in the last frames), none (the outline alone). */
export const RIM_PLAYS = Object.freeze(['rest', 'round', 'build', 'none']);

// A run of cells along a row or down a column, all in one colour (0 to 6).
const run = (c, r, n, slot, down = false) => Array.from({ length: n }, (_, i) => [down ? c : c + i, down ? r + i : r, slot]);

// Each shape: how many cells wide and tall, and its cells as [column, row, colour]. Cells of one colour lie together.
const SHAPES = Object.freeze({
  // rows of 1, 3, 5, 3 and 1 with the middle left empty: four three-cell corners turning round it
  diamond: { cols: 5, rows: 5, cells: [[2, 0, 0], [2, 1, 0], [3, 1, 0], [4, 2, 2], [3, 2, 2], [3, 3, 2], [2, 4, 4], [2, 3, 4], [1, 3, 4], [0, 2, 5], [1, 2, 5], [1, 1, 5]] },
  // a head of 1, 3, 5 and 7 over a shaft of 3, coloured in runs of four along each row
  arrow: { cols: 7, rows: 5, cells: [...run(3, 0, 1, 6), ...run(2, 1, 3, 0), ...run(1, 2, 4, 4), ...run(5, 2, 1, 2), ...run(0, 3, 4, 1), ...run(4, 3, 3, 5), ...run(2, 4, 3, 3)] },
  // two lines along the bottom, two ells and a square above: steps two columns wide rising to the right
  stairs: { cols: 8, rows: 4, cells: [...run(0, 3, 4, 0), ...run(4, 3, 4, 4), [4, 1, 2], ...run(2, 2, 3, 2), [5, 1, 5], ...run(5, 2, 3, 5), ...run(6, 0, 2, 6), ...run(6, 1, 2, 6)] },
  // a square ring of four runs of four round one cell
  ring: { cols: 5, rows: 5, cells: [...run(0, 0, 4, 0), ...run(4, 0, 4, 2, true), ...run(1, 4, 4, 4), ...run(0, 1, 4, 5, true), [2, 2, 6]] },
});
const MOST_CELLS = 20, MOST_COLS = 8, MOST_ROWS = 5;

/** How many cells wide and tall a badge shape is, and how many cells it has: { cols, rows, cells }. */
export function badgeSize(shape) {
  const s = SHAPES[shape];
  return s ? { cols: s.cols, rows: s.rows, cells: s.cells.length } : null;
}

// Where the cells are: the shape, the cell's side and the top-left pixel of the box of cells.
function layout(a) {
  const shape = SHAPES[a.shape], n = a.cell;
  return { shape, n, x0: Math.round(a.at[0] - (shape.cols * n) / 2), y0: Math.round(a.at[1] - (shape.rows * n) / 2) };
}

// The clip phase a one-shot plays over: 0 to 1; in a loop it wraps, so the loop closes.
const phase = (ctx) => { const t = Number.isFinite(ctx.t) ? ctx.t : 0; return ctx.loop ? t - Math.floor(t) : Math.max(0, Math.min(1, t)); };
// The frame of a 12-frame build and of an 8-frame shine the phase stands for.
const buildFrame = (ctx) => Math.round(phase(ctx) * 11);
const shineFrame = (ctx) => Math.round(phase(ctx) * 7);
// The build frame a row of cells lands on: the bottom row is there from the start, the two above it land on 3, the rest on 7.
const landsOn = (r, rows) => (r === rows - 1 ? 0 : r >= rows - 3 ? 3 : 7);

/**
 * block.badge@1: block cells laid out as a badge round `at`: a `shape` of BADGE_SHAPES, each cell `cell` px a side and
 * drawn by block.cell@2 in `style` and `edge`, coloured from `paints` (seven colours of a scheme, in order; fewer are
 * used in turn). `play` rest draws them all. build plays a 12-frame one-shot over the clip phase: the bottom row
 * alone, then the two rows above dropping in (a cell and a half up, half a cell up, landed on frame 3), then the rest
 * (landed on frame 7), each lot `flash` inside its ink line on the frame it lands; a dropping cell is never more than
 * `room` px above its place (so it stays in the frame). shine plays an 8-frame one-shot: a 3 px band leaning like a
 * slash crosses the cells from the first it meets on the left to the last on the right, over each cell that cell's light tone mixed half towards `flash`.
 * Arguments: at, shape, cell, style, edge, paints, flash, ink, play, room.
 */
export const blockBadge = defineGenerator({
  id: 'block.badge', v: 1, family: 'block',
  about: 'A badge of block cells fitted like pieces (a diamond, an arrow, steps or a ring) that can build itself row by row or take a band of light across it.',
  args: {
    at: point({ lo: -480, hi: 480, default: [0, 0], about: 'The middle of the badge' }),
    shape: word(BADGE_SHAPES, { default: 'diamond', about: 'How the cells are arranged' }),
    cell: count(6, 16, { default: 8, about: 'One cell\'s side in pixels' }),
    style: word(BLOCK_STYLES, { default: 'bevel', about: 'The cells\' finish (block.cell)' }),
    edge: count(1, 3, { default: 2, about: 'The cells\' edge (block.cell)' }),
    paints: paints(7, { about: 'The cells\' colours, one for each group of cells (seven of a scheme, in order)' }),
    flash: paint({ default: 'clear', about: 'The white of a landing flash and of the shine band: a light slot (clear: neither)' }),
    ink: paint({ default: 'ink', about: 'The line round each cell' }),
    play: word(BADGE_PLAYS, { default: 'rest', about: 'What it plays over the clip: rest, build (12 frames) or shine (8 frames)' }),
    room: px(0, 64, { default: 64, about: 'The most a dropping cell is drawn above its place: the rows clear above the badge' }),
  },
  cost: (a) => MOST_CELLS * (3 + workCost(a.cell * a.cell * 16)),
  run(a, ctx, { call }) {
    const { shape, n, x0, y0 } = layout(a), out = [], over = [];
    const F = a.play === 'build' ? buildFrame(ctx) : 11, S = a.play === 'shine' ? shineFrame(ctx) : 7;
    const sums = shape.cells.map(([c, r]) => x0 + y0 + (c + r) * n);   // the band starts on the first cell it meets and ends on the last
    const lo = Math.min(...sums) + 1, hi = Math.max(...sums) + 2 * n - 5;
    const band = Math.round(lo + (hi - lo) * (S / 6));
    for (const [c, r, slot] of shape.cells) {
      const lands = landsOn(r, shape.rows), f = lands - F;
      if (f > 2) continue;                                          // not there yet
      const up = f <= 0 ? 0 : Math.min(Math.floor(a.room), f === 1 ? Math.round(n / 2) : Math.round(n * 1.5));
      const x = x0 + c * n, y = y0 + r * n - up, colour = a.paints[slot % a.paints.length];
      out.push(...call({ gen: 'block.cell', v: 2, at: [x, y], size: n, style: a.style, edge: a.edge, paint: colour, ink: a.ink }, ctx));
      if (a.flash === 'clear') continue;
      if (F < 11 && F > 0 && lands === F) over.push({ kind: 'rect', at: [x + 1, y + 1], size: [n - 2, n - 2], paint: a.flash });
      if (S < 7) {
        const g = new Pixels(x, y, n, n), lit = mixOf(toneOf(colour, 'light'), a.flash, 0.5);
        for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
          const s = x + i + y + j - band;
          if (s >= 0 && s < 3) g.set(x + i, y + j, lit);
        }
        over.push(...g.stamps());
      }
    }
    return [...out, ...over];
  },
});

// The two lines round a shape's cells, each as the pixels of a closed walk clockwise from its top-left pixel: `ring`
// 1 px out from the cells and `outer` 2 px out, in the box's own pixels (the cells start at [pad, pad]).
function rims(shape, n, pad) {
  const W = shape.cols * n + 2 * pad, H = shape.rows * n + 2 * pad;
  const cell = new Uint8Array(W * H), near = new Uint8Array(W * H);
  for (const [c, r] of shape.cells) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) cell[(pad + r * n + j) * W + pad + c * n + i] = 1;
  const isCell = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cell[y * W + x] === 1;
  // how far a pixel is from the cells, counting corners as near as sides: 1, 2, or 0 for anything else
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (cell[y * W + x]) continue;
    let d = 0;
    for (let j = -2; j <= 2 && d !== 1; j++) for (let i = -2; i <= 2; i++) {
      if (!isCell(x + i, y + j)) continue;
      const m = Math.max(Math.abs(i), Math.abs(j));
      if (!d || m < d) d = m;
    }
    near[y * W + x] = d;
  }
  // only what the outside reaches: a hole in the middle of the cells gets no line
  const outside = new Uint8Array(W * H), todo = [0];
  outside[0] = 1;
  while (todo.length) {
    const k = todo.pop(), x = k % W, y = (k - x) / W;
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const u = x + i, v = y + j;
      if (u < 0 || v < 0 || u >= W || v >= H || outside[v * W + u] || cell[v * W + u]) continue;
      outside[v * W + u] = 1; todo.push(v * W + u);
    }
  }
  const walk = (d) => {
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && near[y * W + x] === d && outside[y * W + x] === 1;
    let start = -1;
    for (let k = 0; k < W * H && start < 0; k++) if (on(k % W, Math.floor(k / W))) start = k;
    if (start < 0) return [];
    const seen = new Uint8Array(W * H), path = [];
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];                // right, down, left, up: clockwise on a screen
    let x = start % W, y = Math.floor(start / W), heading = 0;
    for (;;) {
      seen[y * W + x] = 1; path.push([x, y]);
      let next = -1;
      for (const turn of [3, 0, 1, 2]) {                             // keep the cells on the right hand: try left of the heading last
        const h = (heading + turn + 2) % 4 === heading ? -1 : (heading + turn) % 4;
        if (h < 0) continue;
        const u = x + DIRS[h][0], v = y + DIRS[h][1];
        if (on(u, v) && !seen[v * W + u]) { next = h; break; }
      }
      if (next < 0) break;
      heading = next; x += DIRS[next][0]; y += DIRS[next][1];
    }
    return path;
  };
  return { W, H, ring: walk(1), outer: walk(2) };
}

// `length` pixels of a closed walk ending at its place k (0 to 1), the head last.
function stretch(path, k, length) {
  const n = path.length;
  if (!n) return [];
  const head = Math.round(k * n) % n, out = [];
  for (let i = Math.min(length, n) - 1; i >= 0; i--) out.push(path[(head - i + n * 2) % n]);
  return out;
}

const RIM_PAD = 4;   // the box round the cells: 2 px of lines, then 2 px for the twinkle's arms

/**
 * block.badgeRim@1: the line round a block badge (block.badge@1 with the same at, shape and cell) and the light on it.
 * From the outside in: an `ink` line 2 px out from the cells, then a line of `paint` 1 px out, both left out when
 * `outline` is false; a hole in the middle of the cells gets neither. The light is a stretch of `shine` on the inner
 * line (of `paint` with no outline), a shorter stretch of `paint` on the outer one and a small twinkle at its head.
 * `play` rest holds the light at its start (the top-left corner); round runs it once round, clockwise, over a looping
 * clip; build plays the end of block.badge@1's 12-frame build: nothing until frame 9, then the outline drawn half way
 * round in `shine`, then all the way, then rest; none draws the outline and no light. Arguments: at, shape, cell,
 * outline, paint, shine, ink, play.
 */
export const blockBadgeRim = defineGenerator({
  id: 'block.badgeRim', v: 1, family: 'block',
  about: 'The outline round a badge of block cells (block.badge) and the light that runs round it: an ink line, a line of light, a bright stretch with a twinkle at its head.',
  args: {
    at: point({ lo: -480, hi: 480, default: [0, 0], about: 'The middle of the badge' }),
    shape: word(BADGE_SHAPES, { default: 'diamond', about: 'How the cells are arranged' }),
    cell: count(6, 16, { default: 8, about: 'One cell\'s side in pixels' }),
    outline: flag({ default: true, about: 'Draw the two lines (false: the light alone)' }),
    paint: paint({ about: 'The line of light and the glow of the running light' }),
    shine: paint({ about: 'The bright stretch of the running light: a light slot' }),
    ink: paint({ default: 'ink', about: 'The outer line' }),
    play: word(RIM_PLAYS, { default: 'rest', about: 'What the light does over the clip: rest, round (a loop), build (the end of a 12-frame build) or none' }),
  },
  cost: (a) => 1 + Math.ceil((MOST_COLS * a.cell + 2 * RIM_PAD) / 32) * Math.ceil((MOST_ROWS * a.cell + 2 * RIM_PAD) / 32)
    + workCost((MOST_COLS * a.cell + 2 * RIM_PAD) * (MOST_ROWS * a.cell + 2 * RIM_PAD) * 40),
  run(a, ctx) {
    const { shape, n, x0, y0 } = layout(a);
    const F = a.play === 'build' ? buildFrame(ctx) : 11;
    if (F < 9) return [];
    const R = rims(shape, n, RIM_PAD), ox = x0 - RIM_PAD, oy = y0 - RIM_PAD;
    const g = new Pixels(ox, oy, R.W, R.H);
    const put = (list, ref) => { for (const [x, y] of list) g.set(ox + x, oy + y, ref); };
    if (a.outline) {
      const part = F === 9 ? 0.5 : 1, hot = F < 11;
      put(R.outer.slice(0, Math.round(R.outer.length * part)), a.ink);
      put(R.ring.slice(0, Math.round(R.ring.length * part)), hot ? a.shine : a.paint);
    }
    if (a.play === 'none') return g.stamps();
    const k = F === 9 ? 0.5 : F === 10 ? 0.96 : a.play === 'round' ? phase(ctx) : 0;
    const length = F < 11 ? 14 : Math.max(10, Math.round(R.ring.length * 0.12));
    put(stretch(R.ring, k, length), a.outline ? a.shine : a.paint);
    put(stretch(R.outer, k, Math.round(length / 2)), a.paint);
    const head = stretch(R.outer, k, 1)[0];
    if (head) {
      const [hx, hy] = head;
      for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.set(ox + hx + 2 * i, oy + hy + 2 * j, a.paint); g.set(ox + hx + i, oy + hy + j, a.shine); }
      g.set(ox + hx, oy + hy, a.shine);
    }
    return g.stamps();
  },
});
