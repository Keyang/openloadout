// Effect behaviours that fill a field (docs/data-sprites.md 2.5c and 3.3, family "fx"; build item B12c): weather that
// wraps round a square and the moving streaks of open water. Each is a port that RETURNS PRIMITIVES (stamps keyed to the
// paints its call names) instead of drawing, pixel for pixel:
//   fall.field@1  engine/weather.js fallField      rain, snow, leaves, petals, ash or sand on a lattice that wraps round a
//                                                   square `period` px across, so tiled copies join and the loop closes
//   ripples@1     engine/ripples.js rippleVersion  the level streaks of light that swell, slide and fade on a 32 x 32
//                                                   water tile, kept inside its margin so versions of a fill join
// Pure: no randomness but `seed` through engine/motion.js hash, no clock, no DOM; runs the same in the browser and Node.
import { defineGenerator } from './registry.js';
import { point, px, count, seed, flag, word, paint, paints } from './args.js';
import { hash, fract, TAU } from '../motion.js';
import { boxOf, boxIn, emptyBox, gridOf, put, toneRule, isNone, areaOf, charge, boxPixels } from './fx-common.js';

// ---- fall.field@1 --------------------------------------------------------------------------------------------------

/** The piece shapes fall.field@1 draws (engine/weather.js WEATHER_PIECES): dot, streak, flake, leaf, petal, seed, ash, grain. */
export const WEATHER_PIECES = Object.freeze(['dot', 'streak', 'flake', 'leaf', 'petal', 'seed', 'ash', 'grain']);
const SLANTS = Object.freeze({ none: 0, left: -1, right: 1 });

const mod = (v, m) => ((v % m) + m) % m;
const snap = (v) => Math.round(v * 4096) / 4096;

/** engine/weather.js fallLattice: `cols` columns over the period (never closer than 0.6 of the even spacing), `rows` pieces each. */
function fallLattice(cols, rows, period, s) {
  const gap = 0.6, w = period / cols, step = period / rows, out = [];
  for (let i = 0; i < cols; i++) {
    const x = snap((i + hash(i, s * 977 + 11) * (1 - gap)) * w);
    const off = hash(i, s * 977 + 23) * step;
    for (let r = 0; r < rows; r++) out.push({ col: i, row: r, x, y: snap(mod(off + r * step, period)) });
  }
  return out;
}

/** engine/weather.js fallAt: where one lattice piece is at loop progress u, modulo the period, and its turn. */
function fallAt(piece, u, { rows, period, laps, slant, sway, swayCycles, turns, axis }) {
  const step = period / rows;
  const along = snap(mod(piece.y + laps * u * step, period));
  const phase = hash(piece.col, 9173);
  const across = piece.x + slant * along + sway * Math.sin(TAU * (swayCycles * along / period + phase));
  const turn = snap(fract(turns * along / step + hash(piece.col, 4421)));
  const c = snap(mod(across, period));
  return axis === 'x' ? { x: along, y: c, turn: turn === 1 ? 0 : turn } : { x: c, y: along, turn: turn === 1 ? 0 : turn };
}

function lineCells(n, angle) {
  const dx = Math.sin(angle), dy = Math.cos(angle), out = [];
  const big = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  for (let k = 0; k < n; k++) out.push([-Math.round((k * dx) / big), -Math.round((k * dy) / big)]);
  return out;
}
function testCells(reach, inside) {
  const out = [];
  for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++) if (inside(i, j)) out.push([i, j]);
  return out;
}
function rimmed(cells, colour, rim) {
  const key = (x, y) => x * 1000 + y, has = new Set(cells.map(([x, y]) => key(x, y)));
  const edge = (x, y) => !has.has(key(x + 1, y)) || !has.has(key(x - 1, y)) || !has.has(key(x, y + 1)) || !has.has(key(x, y - 1));
  const inner = cells.filter(([x, y]) => !edge(x, y));
  if (inner.length) return cells.map(([x, y]) => [x, y, edge(x, y) ? rim : colour]);
  const order = cells.map((c) => c).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]) || p[0] - q[0] || p[1] - q[1]);
  const lower = new Set(order.slice(0, Math.floor(cells.length / 2)).map(([x, y]) => key(x, y)));
  return cells.map(([x, y]) => [x, y, lower.has(key(x, y)) ? rim : colour]);
}
const quarter = (cells, q) => cells.map(([x, y]) => [[x, y], [-y, x], [-x, -y], [y, -x]][q & 3]);
const ASH_SMALL = [[0, 0], [1, 0], [0, 1]];
const ASH_BIG = [[0, 0], [0, -1], [1, 0], [-1, 1], [0, 1]];

/** engine/weather.js pieceCells: the whole-pixel cells of one piece round its anchor, each with its paint ref. */
function pieceCells(shape, { size = 1, colour: c, rim, core, angle = 0, turn = 0 }) {
  const rimOf = () => rim ?? toneRule(c, -1);
  switch (shape) {
    case 'dot': {
      const n = size >= 1.5 ? 2 : 1, out = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push([i, j, c]);
      return out;
    }
    case 'streak': return lineCells(Math.max(1, Math.round(size)), angle).map(([x, y]) => [x, y, c]);
    case 'grain': {
      const n = Math.min(6, Math.max(2, Math.round(size)));
      return lineCells(n, Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle)) ? Math.PI / 2 : 0).map(([x, y]) => [x, y, c]);
    }
    case 'flake': {
      if (size < 1.5) return [[0, 0, c]];
      if (size < 2.5) return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => [x, y, c]);
      return [[0, 0], [0, -1], [0, -2], [0, 1], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, -2], [2, -2], [-2, 2], [2, 2]].map(([x, y]) => [x, y, c]);
    }
    case 'leaf': {
      const L = Math.min(5, Math.max(3, Math.round(size))), half = L / 2;
      const w0 = L >= 4 ? 1.35 : 1.05;
      const ux = Math.sin(angle), uy = Math.cos(angle);
      const at = (w) => testCells(3, (i, j) => {
        const along = i * ux + j * uy, across = -i * uy + j * ux, k = along / (half + 0.15);
        return Math.abs(k) <= 1 && Math.abs(across) <= Math.max(0.5, w * (1 - k * k));
      });
      const widest = at(w0).length;
      let w = w0 * (0.5 + 0.5 * Math.abs(Math.cos(Math.PI * turn))), cells = at(w);
      while (cells.length * 2 < widest && w < w0) { w += 0.05; cells = at(w); }
      const shown = turn >= 0.25 && turn < 0.75 ? rimOf() : c;
      return rimmed(cells, shown, rimOf());
    }
    case 'petal': {
      const L = Math.min(4, Math.max(2, Math.round(size))), an = angle + TAU * turn;
      const ux = Math.sin(an), uy = Math.cos(an), r = L >= 3 ? 1.05 : 0.75, head = L / 2 - r * 0.6;
      const cells = testCells(3, (i, j) => {
        const along = i * ux + j * uy, across = -i * uy + j * ux;
        if ((along - head) ** 2 + across ** 2 <= r * r) return true;
        const k = (head - along) / (L - r);
        return k >= 0 && k <= 1 && Math.abs(across) <= r * (1 - k) + 0.05;
      });
      return rimmed(cells, c, rimOf());
    }
    case 'seed': {
      const sideways = Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle));
      const rays = [[0, -1], [0, -2], [-1, -1], [-2, -2], [1, -1], [2, -2]];
      const tuft = rim ?? c;
      return [[0, 0, c], ...(sideways ? rays.map(([x, y]) => [y, x]) : rays).map(([x, y]) => [x, y, tuft])];
    }
    default: {
      const cells = quarter(size >= 2.5 ? ASH_BIG : ASH_SMALL, Math.floor(fract(turn) * 4));
      return cells.map(([x, y], k) => [x, y, k === 0 && core && turn < 0.5 ? core : c]);
    }
  }
}

/** The work of one weather piece at most: a leaf tests 49 cells up to fifteen times. */
const PIECE_WORK = 800;

/**
 * fall.field@1: a field of falling pieces (rain, snow, leaves, petals, ash, blowing sand) that wraps round the square
 * `period` px across from `at`, so copies laid `period` px apart join with no seam and the loop closes with nothing born
 * or dying. `cols` columns of `rows` pieces fall `laps` row gaps a loop (`axis` down, or right for a sideways stream),
 * drifting a pixel sideways per pixel of fall when `slant` is left or right, swaying `sway` px `swayCycles` times a
 * period; pieces are `shape` (every other column `alt` when it is not none) of `size`, coloured by column from
 * `paints`, leaves and petals rimmed `rim` (clear: a tone darker), ash glowing `core` every `coreEvery` columns;
 * `shift` moves the whole field by whole pixels. Port of engine/weather.js fallField (origin at, shapes [shape, alt]),
 * pixel for pixel.
 */
export const fallField = defineGenerator({
  id: 'fall.field', v: 1, family: 'fx',
  about: 'A field of falling rain, snow, leaves, petals, ash or sand that wraps round a square, so tiles join and the loop closes.',
  args: {
    at: point({ about: 'The top-left corner of the square the field wraps round (1, 1 inside a frame\'s border)' }),
    period: px(2, 640, { default: 62, about: 'The side of that square: copies laid this far apart join' }),
    cols: count(1, 64, { default: 8, about: 'How many columns of pieces' }),
    rows: count(1, 16, { default: 2, about: 'Pieces in each column' }),
    laps: count(1, 8, { default: 1, about: 'Row gaps each piece falls per loop: faster' }),
    slant: word(['none', 'left', 'right'], { default: 'none', about: 'Drift a pixel sideways per pixel of fall (none: straight)' }),
    sway: px(0, 16, { default: 0, about: 'Pixels a piece sways side to side' }),
    swayCycles: count(0, 8, { default: 1, about: 'Sways per period of fall' }),
    turns: count(1, 8, { default: 1, about: 'Flips of a leaf, petal or ash fleck per row gap' }),
    axis: word(['down', 'right'], { default: 'down', about: 'The way they fall: down, or right for a stream blowing sideways' }),
    shape: word(WEATHER_PIECES, { default: 'dot', about: 'Dot, streak, flake, leaf, petal, seed, ash or grain' }),
    size: px(0, 6, { default: 2, about: 'A piece\'s size: dot 1-2, streak length, flake 1-3, leaf 3-5, petal 2-4, ash 2-3, grain 2-6' }),
    alt: word(['none', ...WEATHER_PIECES], { default: 'none', about: 'Every other column\'s shape (none: all `shape`)' }),
    altSize: px(0, 6, { default: 2, about: 'The size of the other columns\' pieces' }),
    paints: paints(8, { about: 'The pieces\' colours, by column in turn' }),
    rim: paint({ default: 'clear', about: 'The edge of a leaf or petal and a seed\'s tuft (clear: a tone darker than the piece)' }),
    core: paint({ default: 'clear', about: 'The glowing middle of an ash fleck while it faces up (clear: none)' }),
    coreEvery: count(0, 8, { default: 0, about: 'Light the core of every n-th column (0: none)' }),
    seed: seed({ default: 0, about: 'Where the columns stand' }),
    shift: point({ lo: -64, hi: 64, default: [0, 0], about: 'Moves the whole field by whole pixels [dx, dy], so two fields do not line up' }),
  },
  keyable: ['sway'],
  // its square: the work of every piece and the scans of its grid
  cost: (a) => { const s = a.period + 1; return charge(s, s, a.cols * a.rows * PIECE_WORK + 3 * areaOf(s, s)); },
  run(a, ctx) {
    const [W, H] = ctx.size, period = a.period, [ox, oy] = a.at;
    const S = boxIn([0, 0, W, H], ox, oy, ox + period + 1, oy + period + 1);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    const slant = SLANTS[a.slant], axis = a.axis === 'right' ? 'x' : 'y';
    const list = a.alt === 'none' ? [a.shape] : [a.shape, { shape: a.alt, size: a.altSize }];
    const sx = Math.round(a.shift[0]), sy = Math.round(a.shift[1]);
    const moveAngle = axis === 'x' ? Math.atan2(1, slant) : Math.atan2(slant, 1);
    const lattice = fallLattice(a.cols, a.rows, period, a.seed);
    const opts = { rows: a.rows, period, laps: a.laps, slant, sway: a.sway, swayCycles: a.swayCycles, turns: a.turns, axis };
    const rim = isNone(a.rim) ? undefined : a.rim, core = isNone(a.core) ? undefined : a.core;
    for (let i = 0; i < a.cols; i++) {
      const entry = list[i % list.length];
      const name = typeof entry === 'string' ? entry : entry.shape;
      const pSize = typeof entry === 'object' ? entry.size : a.size;
      const colour = a.paints[i % a.paints.length];
      const lean = name === 'leaf' || name === 'petal' ? moveAngle + Math.PI / 2 + (hash(i, a.seed * 31 + 5) - 0.5) * 1.2
        : name === 'grain' ? (axis === 'x' ? Math.PI / 2 : 0) : moveAngle;
      const lit = a.coreEvery > 0 && i % a.coreEvery === 0 ? core : undefined;
      const here = lattice.filter((p) => p.col === i).map((p) => fallAt(p, ctx.t, opts)).sort((p, q) => (axis === 'x' ? p.x - q.x : p.y - q.y));
      for (const at of here) {
        const ax = Math.floor(at.x), ay = Math.floor(at.y);
        for (const [dx, dy, c] of pieceCells(name, { size: pSize, colour, rim, core: lit, angle: lean, turn: at.turn })) {
          g.set(ox + mod(ax + dx + sx, period), oy + mod(ay + dy + sy, period), c);
        }
      }
    }
    return g.stamps();
  },
});

// ---- ripples@1 -----------------------------------------------------------------------------------------------------

const TILE = 32;

/**
 * ripples@1: the level streaks of light on a 32 x 32 water tile whose middle is `at` (its top-left corner 16 px up and
 * left of it, rounded down): each swells from
 * nothing to about `length` px and back while it slides `stir` px, on its own timer (a golden step apart), one to a
 * band of rows, none within `margin` px of the tile's edge on any frame, so versions of a fill (other seeds) lie beside
 * each other in any order. Every third streak is `dark` (a trough) when given; `tips` lights the leading pixel of a
 * full-grown streak; `under` adds a shorter line under every third. Lay it over the water's fill. Port of the marks
 * engine/ripples.js rippleVersion lays on its tile, pixel for pixel.
 */
export const ripples = defineGenerator({
  id: 'ripples', v: 1, family: 'fx',
  about: 'Level streaks of light that swell, slide and fade on a water tile, kept inside its margin so versions join.',
  args: {
    at: point({ about: 'The middle of the 32 x 32 tile (its top-left corner is 16 px up and left)' }),
    count: count(0, 9, { default: 5, about: 'Streaks in the tile' }),
    length: px(0, 32, { default: 6, about: 'Pixels of the longest streak' }),
    stir: px(0, 16, { default: 2, about: 'Pixels a streak slides in its life' }),
    margin: count(0, 12, { default: 3, about: 'Pixels along each edge of the tile no streak enters on any frame' }),
    seed: seed({ default: 0, about: 'Which arrangement: another seed, another version of the fill' }),
    paint: paint({ about: 'The streaks: a light tone of the water' }),
    dark: paint({ default: 'clear', about: 'Every third streak, a trough (clear: all light)' }),
    tips: paint({ default: 'clear', about: 'The leading pixel of every full-grown light streak (clear: none)' }),
    under: flag({ default: true, about: 'A shorter line two rows under every third streak' }),
  },
  keyable: [],
  // one tile of at most 32 x 32 and a few hundred pixels set
  cost: () => 1,
  run(a, ctx) {
    const B = boxOf(ctx, null), X = Math.floor(a.at[0]) - TILE / 2, Y = Math.floor(a.at[1]) - TILE / 2;
    const S = boxIn(B, X, Y, X + TILE, Y + TILE);
    if (emptyBox(S)) return [];
    const g = gridOf(S);
    const lo = Math.min(12, Math.max(0, Math.round(a.margin))), hi = TILE - lo, span = hi - lo;
    const n = Math.max(0, Math.min(9, Math.round(a.count)));
    const s = (a.seed | 0) * 131 + 17;
    const mark = (x, y, c) => { if (x >= lo && x < hi && y >= lo && y < hi) put(g, B, X + x, Y + y, c); };
    const slide = Math.max(0, Number(a.stir) || 0), longest = Math.max(2, Math.min(span, Math.round(a.length)));
    const band = n ? span / n : span, startX = hash(s, 9), startT = hash(s, 23);
    const light = a.paint, dark = isNone(a.dark) ? null : a.dark, tips = isNone(a.tips) ? null : a.tips;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const y = lo + Math.floor(i * band + hash(i, s + 5) * band);
      rows.push(Math.min(hi - 1 - 2 * (n - 1 - i), Math.max(y, i ? rows[i - 1] + 2 : lo)));
    }
    for (let i = 0; i < n; i++) {
      const life = fract(ctx.t + fract(i * 0.618034 + startT));
      const full = Math.max(2, Math.round(longest * (0.6 + 0.4 * hash(i, s + 11))));
      const len = life < 0.75 ? Math.round(full * Math.sin((Math.PI * life) / 0.75)) : 0;
      if (len < 2) continue;
      const u = fract(i * 0.618034 + startX);
      const x0 = lo + Math.round((0.5 - 0.5 * Math.cos(Math.PI * u)) * (span - full));
      const x = Math.min(hi - len, Math.max(lo, Math.round(x0 + (full - len) / 2 + slide * (life / 0.75 - 0.5)))), y = rows[i];
      const c = dark && i % 3 === 2 ? dark : light;
      for (let k = 0; k < len; k++) mark(x + k, y, c);
      if (tips && c === light && len >= 4) mark(x + len - 1, y, tips);
      if (a.under && i % 3 === 0 && len >= 5 && (i === n - 1 ? y + 2 < hi : rows[i + 1] - y >= 4)) for (let k = 0; k < len - 3; k++) mark(x + 2 + k, y + 2, c);
    }
    return g.stamps();
  },
});

// ---- stamp bounds, size keys, frame pixels --------------------------------------------------------------------------

/** The most stamp pixels each behaviour of this file can return in a frame of `size`: "<id>@<v>" -> (args, size) -> pixels (engine/gen/index.js STAMP_BOUNDS). */
export const FIELD_STAMP_BOUNDS = Object.freeze({
  // the field may paint the frame's border (its square is where `at` puts it), so it is cut to the whole frame
  'fall.field@1': (a, size) => Math.min(Array.isArray(size) ? size[0] * size[1] : 640 * 360, areaOf(a.period + 1, a.period + 1)),
  'ripples@1': (a, size) => boxPixels(TILE, TILE, size),
});

/** The keyable arguments of each behaviour of this file that its cost or stamp bound reads (engine/gen/index.js SIZE_KEYS). */
export const FIELD_SIZE_KEYS = Object.freeze({
  'fall.field@1': Object.freeze([]),
  'ripples@1': Object.freeze([]),
});

/** Why each behaviour of this file works in frame pixels (engine/gen/index.js FRAME_GENERATORS). */
export const FIELD_FRAME_GENERATORS = Object.freeze({
  'fall.field@1': 'a field that wraps round a square of the frame, clipped to the frame: name it as an emitter, not in a draw list on a node',
  'ripples@1': 'streaks on a 32 px water tile, clipped to the frame\'s 1 px border: name it as an emitter or in a tile\'s fill, not on a node',
});
