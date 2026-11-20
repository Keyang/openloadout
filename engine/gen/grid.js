// Grid generators (family "grid"): what the backdrop of an abstract grid world is made of, layer by layer. The look of
// the Gridline kit's `bg-gridline` (bundles/specs/kit-puzzle-gridline.md: what the specification's gridLines of
// "engine/backdrop.js" and the reviewed code sprite's towers, floating shapes and band drew; those code helpers were
// never carried over, so these are written from the specification, the reviewed sprite and its renders).
//
//   far    grid.lines    a flat 1 px grid across the whole layer, every nth line in an accent colour
//          grid.lights   sparse small lights, each inside a square of that grid and never on a line
//   mid    grid.towers   towers of square cells rising from the bottom, their tops stepped like stacks of fallen
//                        pieces, some cells of a second tone, some with a window that blinks on its own phase
//          grid.shapes   outlined shapes floating above them (squares, rings, plus signs, four-cell pieces), none
//                        overlapping, each pulsing through a list of paints on its own phase
//   near   grid.band     a band of big cells in two tones along the bottom, with a lighter lip along its top
//          grid.runner   a lit line along a row with a light that runs left to right and wraps
//
//   { "gen": "grid.lines", "v": 1, "pitch": 20, "paint": "haze", "accent": "haze.light", "accentEvery": [4, 3] }
//   { "gen": "grid.towers", "v": 1, "tall": 6, "seed": 4, "paint": "land", "alt": "land.light", "lit": "glow", "unlit": "land.deep" }
//
// All of them work in frame pixels across ctx.size (a layer's width and height) and return flat rects only (shade 0:
// a background has no shading bands and no outline), so every pixel is exactly the one written. Named in a layers body.
//
// Pure: no DOM, no Node, no clock, no randomness (seeds through engine/motion.js hash). Runs unchanged in the browser
// and in Node. Imports nothing of engine/gen/backdrop.js, so engine/gen/index.js can read GRID_FRAME_GENERATORS while
// that module is still loading (see engine/gen/backdrop-frame.js).
import { defineGenerator } from './registry.js';
import { px, share, count, seed, word, flag, paint, paints, point } from './args.js';
import { hash, fract, pulse } from '../motion.js';

const FLAT = { shade: 0 };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const phase = (t) => (fin(t) ? t % 1 : 0);
const mod = (x, W) => ((x % W) + W) % W;
const rect = (x, y, w, h, paintRef) => ({ kind: 'rect', at: [x, y], size: [w, h], paint: paintRef, ...FLAT });

/** The grid generators, which work in frame pixels by design (engine/gen/index.js FRAME_GENERATORS), each with why: "<id>@<v>" -> reason. */
export const GRID_FRAME_GENERATORS = Object.freeze({
  'grid.lines@1': 'lines across the whole layer, from its left edge and its top: name it in a layers body, not on a node',
  'grid.lights@1': 'lights inside the squares of a grid that starts at the layer\'s corner: name it in a layers body, not on a node',
  'grid.towers@1': 'towers across the layer\'s width standing on a frame row: name it in a layers body, not on a node',
  'grid.shapes@1': 'places shapes across the layer\'s width and wraps them at its edges: name it in a layers body, not on a node',
  'grid.band@1': 'fills rows of the layer across its whole width: name it in a layers body, not on a node',
  'grid.runner@1': 'a line across the layer\'s whole width whose light wraps at its edges: name it in a layers body, not on a node',
});

/** The kinds of floating shape grid.shapes@1 draws: squares, rings, four-cell pieces, or a mix of those and plus signs. */
export const GRID_SHAPE_KINDS = Object.freeze(['squares', 'rings', 'pieces', 'mixed']);

/** `n` columns across a layer W px wide that keep their places when n grows (the golden-ratio walk of engine/backdrop.js scatter, stable): [{ x, i }] in index order. */
function stableColumns(n, s, W) {
  const start = hash(s, 77), out = [];
  for (let i = 0; i < n; i++) { const u = start + i * 0.6180339887498949; out.push({ x: Math.floor((u - Math.floor(u)) * W) % W, i }); }
  return out;
}

/**
 * grid.lines@1: a flat grid of 1 px lines `pitch` px apart across the whole layer, the first down the left edge and
 * along the top, so a layer whose width and height are whole pitches wraps both ways. accentEvery [across, down]:
 * every nth upright line (counted across) and every nth level line (counted down) is drawn in `accent`, over the
 * others (0: none). Port of engine/backdrop.js gridLines as the Gridline specification describes it. Arguments: pitch,
 * paint, accent, accentEvery.
 */
export const gridLines = defineGenerator({
  id: 'grid.lines', v: 1, family: 'grid',
  about: 'A flat grid of 1 px lines across the whole layer, every nth line across and down in an accent colour; wraps both ways when the layer is whole squares.',
  args: {
    pitch: count(4, 64, { default: 20, about: 'The distance from one line to the next, in px' }),
    paint: paint({ about: 'A line' }),
    accent: paint({ default: 'clear', about: 'The brighter lines (clear: none)' }),
    accentEvery: point({ lo: 0, hi: 16, default: [0, 0], about: 'Every nth line across, every nth line down, in the accent (0: none)' }),
  },
  cost: (a) => Math.ceil(640 / a.pitch) + Math.ceil(360 / a.pitch) + 2,
  run(a, ctx) {
    const [W, H] = ctx.size, P = a.pitch;
    const nx = a.accent === 'clear' ? 0 : Math.floor(a.accentEvery[0]), ny = a.accent === 'clear' ? 0 : Math.floor(a.accentEvery[1]);
    const plain = [], lit = [];
    for (let i = 0; i * P < W; i++) (nx > 0 && i % nx === 0 ? lit : plain).push(rect(i * P, 0, 1, H, nx > 0 && i % nx === 0 ? a.accent : a.paint));
    for (let j = 0; j * P < H; j++) (ny > 0 && j % ny === 0 ? lit : plain).push(rect(0, j * P, W, 1, ny > 0 && j % ny === 0 ? a.accent : a.paint));
    return [...plain, ...lit];
  },
});

/**
 * grid.lights@1: `count` small square lights, each inside one square of a grid of `pitch` px (the grid of grid.lines@1
 * with the same pitch) and at least 1 px clear of its lines; the ones already there keep their places as the count
 * grows. Arguments: count, seed, pitch, size, paint.
 */
export const gridLights = defineGenerator({
  id: 'grid.lights', v: 1, family: 'grid',
  about: 'Sparse small lights, each inside a square of a grid and never on its lines, the same ones kept when the count grows.',
  args: {
    count: count(0, 64, { default: 12, about: 'How many (more are added to the ones already there)' }),
    seed: seed({ default: 1, about: 'Which squares' }),
    pitch: count(8, 64, { default: 20, about: 'The grid\'s pitch in px (as grid.lines)' }),
    size: count(2, 4, { default: 2, about: 'A light\'s side in px' }),
    paint: paint({ about: 'A light' }),
  },
  keyable: ['count'],
  cost: (a) => a.count,
  run(a, ctx) {
    const [W, H] = ctx.size, P = a.pitch, span = P - 3 - a.size;
    const cols = Math.max(1, Math.floor(W / P)), rows = Math.max(1, Math.floor(H / P));
    return stableColumns(a.count, a.seed, W).map(({ x, i }) => {
      const id = a.seed * 31 + i;
      const cx = Math.min(cols - 1, Math.floor(x / P)), cy = Math.min(rows - 1, Math.floor(hash(id, 2) * rows));
      return rect(cx * P + 2 + Math.floor(hash(id, 1) * span), cy * P + 2 + Math.floor(hash(id, 3) * span), a.size, a.size, a.paint);
    });
  },
});

/**
 * grid.towers@1: `slots` towers across the layer, one per slot of its width, each two to four columns of `cell` px
 * cells standing on row `base` (the layer's bottom when it is lower): the columns of one tower are of different
 * heights, so its top is stepped like a stack of fallen pieces; the tallest is `tall` cells, two towers always reach
 * it and no column is under two cells. `strip` cells of the same colour run along the whole bottom. Above the strip
 * about a third of the cells take `alt`, and a share (`windows`) hold a small square window, `lit` for the share `blink`
 * of a looping clip, each on its own phase, and `unlit` the rest of it. Port of the reviewed bg-gridline's towers.
 * Arguments: base, cell, slots, tall, strip, seed, paint, alt, lit, unlit, windows, blink.
 */
export const gridTowers = defineGenerator({
  id: 'grid.towers', v: 1, family: 'grid',
  about: 'Towers of square cells rising from the bottom of the layer, their tops stepped, some cells a second tone and some with a window that blinks over a looping clip.',
  args: {
    base: px(0, 360, { default: 360, about: 'The row they stand on (the layer\'s bottom when that is higher)' }),
    cell: count(4, 32, { default: 8, about: 'A cell\'s side in px' }),
    slots: count(1, 16, { default: 8, about: 'How many towers across the layer' }),
    tall: count(2, 16, { default: 6, about: 'The tallest tower, in cells' }),
    strip: count(0, 2, { default: 1, about: 'Cells along the whole bottom' }),
    seed: seed({ default: 1, about: 'Which towers' }),
    paint: paint({ about: 'A cell' }),
    alt: paint({ default: 'clear', about: 'The second tone of about a third of the cells (clear: none)' }),
    lit: paint({ default: 'clear', about: 'A window while it is lit (clear: no windows)' }),
    unlit: paint({ default: 'clear', about: 'A window while it is off (clear: the cell shows)' }),
    windows: share({ default: 0.27, about: 'The share of cells with a window' }),
    blink: share({ default: 0.6, about: 'The share of a looping clip a window is lit' }),
  },
  keyable: ['tall'],
  cost: (a) => 1 + Math.ceil(640 / a.cell) + a.slots * 4 * (1 + 2 * a.tall),
  run(a, ctx) {
    const [W, H] = ctx.size, C = a.cell, S = a.seed * 100, t = phase(ctx.t);
    const bottom = Math.min(Math.round(a.base), H), slot = W / a.slots, room = Math.max(1, Math.floor(slot / C));
    const body = [], cells = [], lights = [];
    const inset = Math.max(1, Math.floor(C / 4)), pane = C - 2 * inset;
    for (let i = 0; i < a.slots; i++) {
      const wide = Math.min(room, 2 + Math.floor(hash(i, S + 41) * 2.99)), start = Math.floor(hash(i, S + 43) * (room - wide + 0.99));
      const full = i === Math.floor(a.slots / 4) || i === Math.floor((a.slots * 5) / 8);
      const top = full ? a.tall : Math.max(2, Math.round(a.tall * (0.55 + 0.45 * hash(i, S + 47))));
      const peak = Math.floor(hash(i, S + 53) * wide);
      for (let c = 0; c < wide; c++) {
        const drop = c === peak ? 0 : 1 + Math.floor(hash(i * 7 + c, S + 59) * 1.99) * (top > 3 ? 1 : 0);
        const n = Math.max(2, top - drop), x = Math.floor((i * slot) / C) * C + (start + c) * C;
        body.push(rect(x, bottom - n * C, C, n * C, a.paint));
        for (let r = a.strip; r < n; r++) {
          const y = bottom - (r + 1) * C;
          if (a.alt !== 'clear' && hash(x + r * 3, S + 61) < 0.34) cells.push(rect(x, y, C, C, a.alt));
          if (a.lit === 'clear' || hash(x * 5 + r, S + 67) >= a.windows) continue;
          const paintRef = fract(t + hash(x, r + S + 71)) < a.blink ? a.lit : a.unlit;
          if (paintRef !== 'clear') lights.push(rect(x + inset, y + inset, pane, pane, paintRef));
        }
      }
    }
    const out = [];
    if (a.strip > 0) {
      out.push(rect(0, bottom - a.strip * C, W, a.strip * C, a.paint));
      if (a.alt !== 'clear') for (let i = 0; i * C < W; i++) if (hash(i, S + 73) < 0.3) cells.push(rect(i * C, bottom - C, Math.min(C, W - i * C), C, a.alt));
    }
    return [...out, ...body, ...cells, ...lights];
  },
});

// ---- floating shapes -------------------------------------------------------------------------------------------------

/** The seven shapes four square cells make joined edge to edge, as [column, row] lists (the pieces of any falling-block puzzle). */
const FOUR_CELLS = Object.freeze([
  [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 1], [1, 1], [2, 1], [1, 0]], [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]],
]);
const MIXED = ['square', 'ring', 'plus', 'piece'];
const KIND_LISTS = { squares: ['square'], rings: ['ring'], pieces: ['piece'], mixed: MIXED };
/** The most rects one floating shape becomes (a ring's rows of runs, equal rows joined; the other kinds take fewer), for the cost. */
const SHAPE_RECTS = 56;

/** One floating shape round (0, 0) as a test of pixel (i, j) (its centre at i + 0.5, j + 0.5) and how far it reaches: a `line` px line round a square, a ring, a plus sign or a four-cell piece. k (0..1) picks its size, which its piece. */
function floating(kind, k, which, line) {
  const boxIn = (x0, y0, w, h) => (i, j) => i >= x0 && i < x0 + w && j >= y0 && j < y0 + h;
  const hollow = (full) => (i, j) => full(i, j) && ![[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].every(([dx, dy]) => full(i + dx * line, j + dy * line));
  if (kind === 'ring') {
    const r = 8 + Math.round(k * 4) + 0.4;
    return { test: (i, j) => { const d = Math.hypot(i, j); return d <= r && d > r - line; }, reach: Math.ceil(r) + 1 };
  }
  if (kind === 'plus') {
    const s = 18 + 2 * Math.round(k * 2), h = s / 2, arm = line + 1;
    return { test: hollow((i, j) => (i >= -arm && i < arm && j >= -h && j < h) || (j >= -arm && j < arm && i >= -h && i < h)), reach: h + 1 };
  }
  if (kind === 'piece') {
    const cells = FOUR_CELLS[which % FOUR_CELLS.length], n = 3 * line;
    const wide = Math.max(...cells.map((c) => c[0])) + 1, high = Math.max(...cells.map((c) => c[1])) + 1;
    const x0 = -Math.round((wide * n) / 2), y0 = -Math.round((high * n) / 2);
    const boxes = cells.map(([c, r]) => boxIn(x0 + c * n, y0 + r * n, n, n));
    return { test: hollow((i, j) => boxes.some((b) => b(i, j))), reach: Math.ceil((wide * n) / 2) + 2 };
  }
  const s = 14 + 2 * Math.round(k * 3);
  return { test: hollow(boxIn(-s / 2, -s / 2, s, s)), reach: s / 2 + 1 };
}

/** The pixels a test covers within `reach` of (0, 0) as rects at (x, y): each row's runs, equal runs of following rows joined into one rect. */
function runsOf(test, reach, x, y, paintRef) {
  const out = [];
  let open = new Map();                                        // "from,to" -> the rect still growing
  for (let j = -reach; j <= reach; j++) {
    const next = new Map();
    for (let i = -reach; i <= reach + 1; i++) {
      if (!test(i, j) || test(i - 1, j)) continue;
      let e = i;
      while (e <= reach && test(e + 1, j)) e++;
      const key = `${i},${e}`, was = open.get(key);
      if (was) { was.size[1] += 1; next.set(key, was); } else { const r = rect(x + i, y + j, e - i + 1, 1, paintRef); out.push(r); next.set(key, r); }
    }
    open = next;
  }
  return out;
}

/**
 * grid.shapes@1: `count` outlined shapes floating between rows `top` and `floor` (their centres), each a `line` px
 * line: squares, rings, four-cell pieces, or a mix of those and plus signs. Across, they keep their places when the
 * count grows; up and down, each in turn takes the one of eight rows that leaves it farthest from the shapes placed
 * before it, so none overlap. Over a looping clip each pulses once through `paints` (its faintest first) on its own
 * phase. Wraps. Port of the reviewed bg-gridline's floating shapes. Arguments: count, seed, kind, top, floor, line,
 * paints, wrap.
 */
export const gridShapes = defineGenerator({
  id: 'grid.shapes', v: 1, family: 'grid', wraps: true,
  about: 'Outlined shapes floating across the layer (squares, rings, plus signs, four-cell pieces), none overlapping, each pulsing in brightness over a looping clip.',
  args: {
    count: count(0, 24, { default: 8, about: 'How many (more are added to the ones already there)' }),
    seed: seed({ default: 1, about: 'Which shapes, and where' }),
    kind: word(GRID_SHAPE_KINDS, { default: 'mixed', about: 'The kind of shape' }),
    top: px(0, 360, { default: 16, about: 'The highest row a shape\'s centre lies on' }),
    floor: px(0, 360, { default: 112, about: 'The lowest row a shape\'s centre lies on' }),
    line: count(2, 3, { default: 3, about: 'How thick its line is, in px' }),
    paints: paints(4, { about: 'Its steps of brightness over a loop, the faintest first (one paint: it does not pulse)' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  keyable: ['count'],
  cost: (a) => a.count * 2 * SHAPE_RECTS,
  run(a, ctx) {
    const [W] = ctx.size, t = phase(ctx.t), kinds = KIND_LISTS[a.kind], S = a.seed * 100;
    const top = Math.round(Math.min(a.top, a.floor)), span = Math.max(0, Math.round(a.floor) - top);
    const placed = [], out = [];
    const gap = (p, q) => { const d = mod(p - q, W); return d > W / 2 ? d - W : d; };
    for (const s of stableColumns(a.count, a.seed, W)) {
      let y = top, room = -1;
      for (let k = 0; k < 8; k++) {
        const cy = top + Math.round(fract(hash(s.i, S + 79) + k * 0.618) * span);
        const free = Math.min(999, ...placed.map((o) => Math.hypot(gap(s.x, o.x) * 0.8, cy - o.y)));
        if (free > room) { room = free; y = cy; }
      }
      placed.push({ x: s.x, y });
      const kind = kinds[(s.i + Math.floor(s.i / kinds.length)) % kinds.length];
      const { test, reach } = floating(kind, hash(a.seed * 31 + s.i, 2), s.i * 3 + 2, a.line);
      const step = Math.min(a.paints.length - 1, Math.floor(pulse(t, hash(s.i, S + 83)) * a.paints.length));
      const xs = [s.x];
      if (a.wrap && s.x + reach + 1 > W) xs.push(s.x - W);
      if (a.wrap && s.x - reach - 1 < 0) xs.push(s.x + W);
      for (const x of xs) out.push(...runsOf(test, Math.ceil(reach), x, y, a.paints[step]));
    }
    return out;
  },
});

// ---- the near band ---------------------------------------------------------------------------------------------------

/**
 * grid.band@1: a band `height` px tall along row `base` (the layer's bottom when it is lower), across the whole layer:
 * `paint`, with a share of its `cell` px cells (counted from the band's top) in `alt`, and `lip` rows of `lipPaint`
 * along its top. Port of the reviewed bg-gridline's near band. Arguments: base, height, cell, seed, share, paint, alt,
 * lip, lipPaint.
 */
export const gridBand = defineGenerator({
  id: 'grid.band', v: 1, family: 'grid',
  about: 'A band of big square cells in two tones along the bottom of the layer, with a lighter lip along its top.',
  args: {
    base: px(0, 360, { default: 360, about: 'The row it stands on (the layer\'s bottom when that is higher)' }),
    height: px(1, 64, { default: 22, about: 'How tall it is, in px' }),
    cell: count(4, 32, { default: 16, about: 'A cell\'s side in px' }),
    seed: seed({ default: 1, about: 'Which cells take the second tone' }),
    share: share({ default: 0.42, about: 'The share of cells in the second tone' }),
    paint: paint({ about: 'The band' }),
    alt: paint({ default: 'clear', about: 'The second tone (clear: none)' }),
    lip: count(0, 4, { default: 0, about: 'Rows of the lip along the top' }),
    lipPaint: paint({ default: 'clear', about: 'The lip (clear: none)' }),
  },
  cost: (a) => 2 + Math.ceil(640 / a.cell) * Math.ceil(a.height / a.cell),
  run(a, ctx) {
    const [W, H] = ctx.size, C = a.cell, tall = Math.max(1, Math.round(a.height)), top = Math.min(Math.round(a.base), H) - tall;
    const out = [rect(0, top, W, tall, a.paint)];
    if (a.alt !== 'clear') {
      for (let i = 0; i * C < W; i++) for (let r = 0; r * C < tall; r++) {
        if (hash(i + r * 31, a.seed * 100 + 89) < a.share) out.push(rect(i * C, top + r * C, Math.min(C, W - i * C), Math.min(C, tall - r * C), a.alt));
      }
    }
    if (a.lip > 0 && a.lipPaint !== 'clear') out.push(rect(0, top, W, Math.min(a.lip, tall), a.lipPaint));
    return out;
  },
});

/**
 * grid.runner@1: a line `thick` px thick along row `row` across the whole layer in `dim`, and a light `length` px
 * long in `paint` that runs along it from left to right once a looping clip, its head at the left edge at the start,
 * wrapping at the edges. Port of the reviewed bg-gridline's lit line. Arguments: row, length, thick, paint, dim.
 */
export const gridRunner = defineGenerator({
  id: 'grid.runner', v: 1, family: 'grid',
  about: 'A lit line along a row of the layer with a light that runs along it from left to right once a loop and wraps.',
  args: {
    row: px(0, 360, { default: 0, about: 'The row of the line' }),
    length: px(2, 320, { default: 48, about: 'How long the running light is, in px' }),
    thick: count(1, 3, { default: 1, about: 'How thick the line is, in px' }),
    paint: paint({ about: 'The running light' }),
    dim: paint({ default: 'clear', about: 'The line it runs along (clear: none)' }),
  },
  cost: () => 3,
  run(a, ctx) {
    const [W] = ctx.size, y = Math.round(a.row), len = Math.min(W, Math.round(a.length));
    const head = Math.round(phase(ctx.t) * W) % W, from = head - len;
    const out = [];
    if (a.dim !== 'clear') out.push(rect(0, y, W, a.thick, a.dim));
    if (from >= 0) out.push(rect(from, y, len, a.thick, a.paint));
    else { if (head > 0) out.push(rect(0, y, head, a.thick, a.paint)); out.push(rect(W + from, y, -from, a.thick, a.paint)); }
    return out;
  },
});
