// PORT (migration batch E2): a copy of engine/weather.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/weather.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Weather: a screen-wide field of falling pieces (rain, snow, leaves, petals, ash, blowing sand) that wraps round a
// square, so copies of one frame laid `period` px apart join with no seam and the loop closes with nothing born or dying.
// `fx.particles`, `fx.streaks` and `spells.motes` start their pieces at a point or a band and age them, so tiled copies
// show a stripe; this field has no start and no age.
//
//   import { fallField } from '../engine/weather.js';
//   fallField(g, { t, cols: 4, rows: 2, laps: 2, shape: 'streak', size: 3, colours: [p.accent], shift: [17, 23] }); // far rain
//   fallField(g, { t, cols: 8, rows: 2, laps: 3, shape: 'streak', size: 6, colours: [p.body] });                     // near rain
//
// How it closes. Pieces stand on a lattice: `cols` columns across the period, `rows` pieces evenly spaced down each
// column. A column's pieces all look alike, and a piece's sideways place (slant and sway) and its turn are functions of
// its height, never of time, so every piece of a column traces the same path. Over one loop each piece falls a whole
// number of row gaps (`laps x period / rows`), so it ends where its neighbour began. Every place is taken modulo the
// period and drawn at origin + place, so a piece crossing an edge appears on the far side and the frame's outer 1 px
// border stays empty: a 64 px frame with origin 1 and period 62 is laid 62 px apart, each copy over its neighbours'
// empty border. Pieces are solid pixels, light only (no ink): draw the field after any g.outline.

import { tone } from '../colour.js';
import { hash, fract, TAU } from '../../../motion.js';

/** The piece shapes fallPiece and fallField draw: dot, streak, flake, leaf, petal, seed, ash, grain. No arguments: a frozen list. */
export const WEATHER_PIECES = Object.freeze(['dot', 'streak', 'flake', 'leaf', 'petal', 'seed', 'ash', 'grain']);

const mod = (v, m) => ((v % m) + m) % m;
// places are snapped to 1/4096 px so a sum that should be exact (a piece one row gap on) floors the same way every time
const snap = (v) => Math.round(v * 4096) / 4096;
const isWhole = (v) => Number.isInteger(v);

function checkSlant(slant, who) {
  if (slant !== -1 && slant !== 0 && slant !== 1) {
    throw new Error(`${who}: slant ${slant} must be -1, 0 or 1. A drift wraps only if it moves a piece sideways by a whole number of periods per period of fall (straight down or 45 degrees); draw smaller leans as the lean of each piece (a streak's angle) instead`);
  }
}
function checkWhole(v, name, who, min = 1) {
  if (!isWhole(v) || v < min) throw new Error(`${who}: ${name} ${v} must be a whole number, ${min} or more, or the loop does not close`);
}

/**
 * The lattice a weather field stands on: `cols` columns spread over the period by hash jitter, never closer than `gap x period / cols` (wrapping), each with `rows` pieces evenly spaced from its own offset.
 * Arguments: o: { cols (whole number of columns), rows (whole number of pieces per column), period (px, default 62), seed (default 0), gap (0..1, the closest two columns may come as a share of the even spacing; default 0.6) }. Returns [{ col, row, x, y }]: x is the column's place across, y the piece's place down at loop start, both in 0..period. Pure.
 */
export function fallLattice({ cols, rows, period = 62, seed = 0, gap = 0.6 } = {}) {
  checkWhole(cols, 'cols', 'fallLattice');
  checkWhole(rows, 'rows', 'fallLattice');
  if (!(gap >= 0 && gap < 1)) throw new Error(`fallLattice: gap ${gap} must be at least 0 and under 1`);
  const s = period / cols, step = period / rows, out = [];
  for (let i = 0; i < cols; i++) {
    // each column sits in its own slot, pushed right by up to (1 - gap) of a slot, so two neighbours (and the last and
    // the first, across the wrap) are always at least gap x slot apart
    const x = snap((i + hash(i, seed * 977 + 11) * (1 - gap)) * s);
    const off = hash(i, seed * 977 + 23) * step;
    for (let r = 0; r < rows; r++) out.push({ col: i, row: r, x, y: snap(mod(off + r * step, period)) });
  }
  return out;
}

/**
 * Where one lattice piece is at loop progress u (0..1), modulo the period, and its turn (0..1, a function of its height) for pieces that spin or flip; pieces of one column all follow one path.
 * Arguments: piece ({ col, x, y } from fallLattice), u (0..1), o: { rows, period (62), laps (whole row gaps fallen per loop, 1), slant (-1, 0 or 1: drift one px sideways per px of fall; anything else throws), sway (px side to side), swayCycles (whole sways per period, 1), turns (whole flips per row gap, 1), axis ('y' falls down, 'x' streams right) }. Returns { x, y, turn }.
 */
export function fallAt(piece, u, { rows, period = 62, laps = 1, slant = 0, sway = 0, swayCycles = 1, turns = 1, axis = 'y' } = {}) {
  checkSlant(slant, 'fallAt');
  checkWhole(rows, 'rows', 'fallAt');
  checkWhole(laps, 'laps', 'fallAt');
  checkWhole(turns, 'turns', 'fallAt');
  checkWhole(swayCycles, 'swayCycles', 'fallAt', 0);
  const step = period / rows;
  const along = snap(mod(piece.y + laps * u * step, period));
  const phase = hash(piece.col, 9173);
  const across = piece.x + slant * along + sway * Math.sin(TAU * (swayCycles * along / period + phase));
  const turn = snap(fract(turns * along / step + hash(piece.col, 4421)));
  const c = snap(mod(across, period));
  return axis === 'x' ? { x: along, y: c, turn: turn === 1 ? 0 : turn } : { x: c, y: along, turn: turn === 1 ? 0 : turn };
}

// ---- piece shapes: whole-pixel cell lists relative to the anchor pixel -------------------------------------------

// a 1 px line of n cells from the anchor back against `angle` (rig convention: 0 = down, PI / 2 = right), one cell per
// step along its longer axis, so it is always exactly n pixels
function lineCells(n, angle) {
  const dx = Math.sin(angle), dy = Math.cos(angle), out = [];
  const big = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
  for (let k = 0; k < n; k++) out.push([-Math.round((k * dx) / big), -Math.round((k * dy) / big)]);
  return out;
}

// cells of a shape test sampled at pixel centres round the anchor (the anchor pixel's centre is (0.5, 0.5))
function testCells(reach, inside) {
  const out = [];
  for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++) if (inside(i, j)) out.push([i, j]);
  return out;
}

// split a body into rim (cells with a side open) and middle; a body with no middle is rimmed on its lower-left half
function rimmed(cells, colour, rim) {
  const key = (x, y) => x * 1000 + y, has = new Set(cells.map(([x, y]) => key(x, y)));
  const edge = (x, y) => !has.has(key(x + 1, y)) || !has.has(key(x - 1, y)) || !has.has(key(x, y + 1)) || !has.has(key(x, y - 1));
  const inner = cells.filter(([x, y]) => !edge(x, y));
  if (inner.length) return cells.map(([x, y]) => [x, y, edge(x, y) ? rim : colour]);
  const order = cells.map((c) => c).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0] || a[1] - b[1]);
  const lower = new Set(order.slice(0, Math.floor(cells.length / 2)).map(([x, y]) => key(x, y)));
  return cells.map(([x, y]) => [x, y, lower.has(key(x, y)) ? rim : colour]);
}

// the four quarter turns of a small cell pattern
const quarter = (cells, q) => cells.map(([x, y]) => [[x, y], [-y, x], [-x, -y], [y, -x]][q & 3]);

const ASH_SMALL = [[0, 0], [1, 0], [0, 1]];                  // 3 cells in a 2x2: the corner (0, 0) is its middle
const ASH_BIG = [[0, 0], [0, -1], [1, 0], [-1, 1], [0, 1]];  // 5 irregular cells in a 3x3 round the middle

function pieceCells(shape, { size = 1, colour, rim, core, angle = 0, turn = 0 }) {
  const c = colour;
  switch (shape) {
    case 'dot': {
      const n = size >= 1.5 ? 2 : 1, out = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out.push([i, j, c]);
      return out;
    }
    case 'streak': return lineCells(Math.max(1, Math.round(size)), angle).map(([x, y]) => [x, y, c]);
    case 'grain': {
      // along the axis the angle is nearer to: across for a sideways stream, down for a falling one
      const n = Math.min(6, Math.max(2, Math.round(size)));
      return lineCells(n, Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle)) ? Math.PI / 2 : 0).map(([x, y]) => [x, y, c]);
    }
    case 'flake': {
      if (size < 1.5) return [[0, 0, c]];
      if (size < 2.5) return [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => [x, y, c]);
      return [[0, 0], [0, -1], [0, -2], [0, 1], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, -2], [2, -2], [-2, 2], [2, 2]].map(([x, y]) => [x, y, c]);
    }
    case 'leaf': {
      // a pointed oval 3 to 5 px long along `angle`; it narrows and widens again as it turns over once (turn 0..1)
      const L = Math.min(5, Math.max(3, Math.round(size))), half = L / 2;
      const w0 = L >= 4 ? 1.35 : 1.05;
      const ux = Math.sin(angle), uy = Math.cos(angle);
      const at = (w) => testCells(3, (i, j) => {
        const along = i * ux + j * uy, across = -i * uy + j * ux, k = along / (half + 0.15);
        return Math.abs(k) <= 1 && Math.abs(across) <= Math.max(0.5, w * (1 - k * k));
      });
      // edge-on it is never thinner than half its face-on self, so a turning leaf does not wink out
      const widest = at(w0).length;
      let w = w0 * (0.5 + 0.5 * Math.abs(Math.cos(Math.PI * turn))), cells = at(w);
      while (cells.length * 2 < widest && w < w0) { w += 0.05; cells = at(w); }
      const shown = turn >= 0.25 && turn < 0.75 ? rim ?? tone(c, -1) : c;    // the underside shows while it is turned over
      return rimmed(cells, shown, rim ?? tone(c, -1));
    }
    case 'petal': {
      // a drop 2 to 4 px long with a round tip, spun round by its turn
      const L = Math.min(4, Math.max(2, Math.round(size))), a = angle + TAU * turn;
      const ux = Math.sin(a), uy = Math.cos(a), r = L >= 3 ? 1.05 : 0.75, head = L / 2 - r * 0.6;
      const cells = testCells(3, (i, j) => {
        const along = i * ux + j * uy, across = -i * uy + j * ux;
        if ((along - head) ** 2 + across ** 2 <= r * r) return true;
        const k = (head - along) / (L - r);
        return k >= 0 && k <= 1 && Math.abs(across) <= r * (1 - k) + 0.05;
      });
      return rimmed(cells, c, rim ?? tone(c, -1));
    }
    case 'seed': {
      // a dot with a three-ray tuft trailing behind it (above a falling seed, to the left of a blown one)
      const sideways = Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle));
      const rays = [[0, -1], [0, -2], [-1, -1], [-2, -2], [1, -1], [2, -2]];
      const tuft = rim ?? c;
      return [[0, 0, c], ...(sideways ? rays.map(([x, y]) => [y, x]) : rays).map(([x, y]) => [x, y, tuft])];
    }
    case 'ash': {
      // an irregular fleck that tumbles through four quarter turns; with `core`, its middle pixel glows while turn < 0.5
      const cells = quarter(size >= 2.5 ? ASH_BIG : ASH_SMALL, Math.floor(fract(turn) * 4));
      return cells.map(([x, y], k) => [x, y, k === 0 && core && turn < 0.5 ? core : c]);
    }
    default: throw new Error(`weather: shape "${shape}" is not one of ${WEATHER_PIECES.join(', ')}`);
  }
}

/**
 * Draws one weather piece at (x, y) in solid pixels, clipped to a box: a dot, streak, flake, leaf, petal, seed, ash fleck or grain (WEATHER_PIECES).
 * Arguments: g (the Surface), shape, x, y (floored to the anchor pixel), o: { size (dot 1-2, streak length, flake 1-3, leaf 3-5, petal 2-4, ash 2-3, grain 2-6), colour, rim (leaf and petal edge, seed tuft; default a darker tone), core (ash middle while turn < 0.5), angle (rig convention, 0 = down), turn (0..1), box ([x0, y0, x1, y1), default the surface inside its 1 px border) }.
 */
export function fallPiece(g, shape, x, y, { size = 1, colour = '#d8d8e0', rim, core, angle = 0, turn = 0, box } = {}) {
  const [x0, y0, x1, y1] = box ?? [1, 1, g.w - 1, g.h - 1];
  const ax = Math.floor(x), ay = Math.floor(y);
  for (const [dx, dy, c] of pieceCells(shape, { size, colour, rim, core, angle, turn })) {
    const px = ax + dx, py = ay + dy;
    if (px >= x0 && px < x1 && py >= y0 && py < y1) g.dot(px, py, c);
  }
  return g;
}

/**
 * Draws a whole weather field for loop phase t that wraps round the inner square [origin, origin + period): lay copies `period` px apart and they join with no seam; t = 0 and t = 1 give the same pixels.
 * Arguments: g; o: { t, cols, rows, laps, slant (-1/0/1), sway, swayCycles, turns, axis ('y'|'x'), shape or shapes (list of names or { shape, size }, by column), size, colours (by column), rim, core, coreEvery (light every n-th column's core; 0 none), seed, period (62), origin (1), shift ([dx, dy] whole px) }. Returns { drawn }.
 */
export function fallField(g, o = {}) {
  const { t = 0, cols = 8, rows = 2, laps = 1, slant = 0, sway = 0, swayCycles = 1, turns = 1, axis = 'y', shape = 'dot', shapes, size = 2,
    rim, core, coreEvery = 0, seed = 0, period = 62, origin = 1, shift = [0, 0] } = o;
  checkSlant(slant, 'fallField');
  checkWhole(laps, 'laps', 'fallField');
  checkWhole(turns, 'turns', 'fallField');
  const colours = Array.isArray(o.colours) && o.colours.length ? o.colours : ['#d8d8e0'];
  const list = shapes && shapes.length ? shapes : [shape];
  for (const e of list) { const s = typeof e === 'string' ? e : e?.shape; if (!WEATHER_PIECES.includes(s)) throw new Error(`fallField: shape "${s}" is not one of ${WEATHER_PIECES.join(', ')}`); }
  const sx = Math.round(shift[0] ?? 0), sy = Math.round(shift[1] ?? 0);
  // a streak lies along the way it moves; a grain along the axis; leaves and petals each lean their own way
  const moveAngle = axis === 'x' ? Math.atan2(1, slant) : Math.atan2(slant, 1);
  const lattice = fallLattice({ cols, rows, period, seed });
  const opts = { rows, period, laps, slant, sway, swayCycles, turns, axis };
  let drawn = 0;
  for (let i = 0; i < cols; i++) {
    const entry = list[i % list.length];
    const name = typeof entry === 'string' ? entry : entry.shape;
    const pSize = typeof entry === 'object' && entry.size !== undefined ? entry.size : size;
    const colour = colours[i % colours.length];
    // a grain is told the field's axis outright: at slant +-1 the move angle is a diagonal and says nothing about it
    const lean = name === 'leaf' || name === 'petal' ? moveAngle + Math.PI / 2 + (hash(i, seed * 31 + 5) - 0.5) * 1.2
      : name === 'grain' ? (axis === 'x' ? Math.PI / 2 : 0) : moveAngle;
    const lit = coreEvery > 0 && i % coreEvery === 0 ? core : undefined;
    // pieces of one column drawn in order of where they are, so the order is the same at t = 0 and t = 1
    const here = lattice.filter((p) => p.col === i).map((p) => fallAt(p, t, opts)).sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
    for (const at of here) {
      const ax = Math.floor(at.x), ay = Math.floor(at.y);
      for (const [dx, dy, c] of pieceCells(name, { size: pSize, colour, rim, core: lit, angle: lean, turn: at.turn })) {
        g.dot(origin + mod(ax + dx + sx, period), origin + mod(ay + dy + sy, period), c);
        drawn++;
      }
    }
  }
  return { drawn };
}
