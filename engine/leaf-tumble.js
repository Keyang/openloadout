// Leaf tumble: a field of falling leaves that wraps like engine/weather.js `fallField`, drawn from hand-made leaf
// pictures instead of a sampled oval. At 3 to 5 px a sampled oval turned edge-on is a 1 px bar and turned at an angle
// is a diamond or a '+'; these pictures are always a pointed leaf, longer than it is wide, with a stem end and a tip.
// A leaf turns over by showing its other face (mirrored across its midrib, in its darker underside tones) and rocks
// side to side as it turns, so a field whose turn steps by half a flip a frame still shows two leaf faces, never a bar.
//
//   import { leafField } from '../engine/leaf-tumble.js';
//   leafField(g, { t, cols: 5, rows: 2, laps: 1, turns: 1, sway: 3, size: 4, colours: [p.body, p.accent] });
//
// It stands on weather.js's lattice and motion (`fallLattice`, `fallAt`), so it closes and wraps exactly as fallField
// does: lay copies `period` px apart; t = 0 and t = 1 give the same pixels. Solid pixels, light only (no ink).

import { tone } from './color.js';
import { hash, TAU } from './motion.js';
import { fallLattice, fallAt } from './weather.js';

const mod = (v, m) => ((v % m) + m) % m;

// Leaf pictures pointing right (tip at +x) and down-right (tip at +x +y), by length. Rows top to bottom, the anchor
// is the cell marked in the middle row/column given by `at`. b = body, l = lit (upper side), d = darker rim (stem end
// and lower edge), . = empty.
const PICS = {
  h: {
    3: { at: [1, 1], rows: ['.l.', 'dbb'] },
    4: { at: [2, 1], rows: ['.lb.', 'dbbb', '.dd.'] },
    5: { at: [2, 1], rows: ['.lbb.', 'dbbbb', '.dd..'] },
  },
  d: {
    3: { at: [1, 1], rows: ['d..', '.bl', '..b'] },
    4: { at: [1, 1], rows: ['dl.', 'bbb', '.db'] },
    5: { at: [2, 2], rows: ['d....', '.lb..', '.bbb.', '..db.', '....b'] },
  },
};

function cellsOf(pic) {
  const out = [];
  pic.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.push([i - pic.at[0], j - pic.at[1], ch]); }));
  return out;
}

// quarter turn clockwise on screen (y down): right -> down -> left -> up
const cw = ([x, y, ch]) => [-y, x, ch];

/** Leaf lengths leafCells draws (px): 3, 4 and 5. No arguments: a frozen list. */
export const LEAF_LENGTHS = Object.freeze([3, 4, 5]);

/**
 * The cells of one leaf picture: a pointed leaf `size` px long (3 to 5, rounded) along `angle` (rig convention, 0 = down, PI / 2 = right; snapped to the nearest of 8 directions), its front face for turn < 0.5 and its back face (mirrored across the midrib, in darker tones) after.
 * Arguments: o: { size, angle, turn (0..1), colour, rim (default tone(colour, -1)), light (default tone(colour, 0.5)) }. Returns [[dx, dy, colour]] relative to the anchor pixel. Pure.
 */
export function leafCells({ size = 4, angle = Math.PI / 2, turn = 0, colour = '#c98a4a', rim, light } = {}) {
  const L = Math.min(5, Math.max(3, Math.round(size)));
  const dark = rim ?? tone(colour, -1), lit = light ?? tone(colour, 0.5), deep = tone(dark, -0.6);
  const k = mod(Math.round(Math.atan2(Math.cos(angle), Math.sin(angle)) / (Math.PI / 4)), 8);
  let cells = cellsOf(PICS[k % 2 ? 'd' : 'h'][L]);
  for (let q = 0; q < Math.floor(k / 2); q++) cells = cells.map(cw);
  // the axis the leaf lies along, and a mirror across it (swaps the leaf's two sides)
  const ax = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][k];
  const mirror = ([x, y, ch]) => (ax[0] && ax[1] ? (ax[0] === ax[1] ? [y, x, ch] : [-y, -x, ch]) : ax[0] ? [x, -y, ch] : [-x, y, ch]);
  // keep the lit side on top (or on the left for an upright leaf), so the light comes from one place
  const litCell = cells.find((c) => c[2] === 'l');
  if (litCell && (litCell[1] > 0 || (litCell[1] === 0 && litCell[0] > 0))) cells = cells.map(mirror);
  const back = turn >= 0.5;
  if (back) cells = cells.map(mirror);
  const paint = back ? { b: dark, l: colour, d: deep } : { b: colour, l: lit, d: dark };
  return cells.map(([x, y, ch]) => [x, y, paint[ch]]);
}

/**
 * Draws a wrapping field of tumbling leaves for loop phase t, on weather.js's lattice and motion: lay copies `period` px apart and they join with no seam; t = 0 and t = 1 give the same pixels.
 * Arguments: g; o: { t, cols, rows, laps, slant (-1/0/1), sway, swayCycles, turns (whole flips per row gap), size (3-5), colours (by column), rim, rock (radians a leaf rocks either way as it turns; default 0.8), seed, period (62), origin (1), shift ([dx, dy]) }. Returns { drawn }.
 */
export function leafField(g, o = {}) {
  const { t = 0, cols = 5, rows = 2, laps = 1, slant = 0, sway = 0, swayCycles = 1, turns = 1, size = 4, rim, rock = 0.8,
    seed = 0, period = 62, origin = 1, shift = [0, 0] } = o;
  const colours = Array.isArray(o.colours) && o.colours.length ? o.colours : ['#c98a4a'];
  const sx = Math.round(shift[0] ?? 0), sy = Math.round(shift[1] ?? 0);
  const moveAngle = Math.atan2(slant, 1);
  const lattice = fallLattice({ cols, rows, period, seed });
  const opts = { rows, period, laps, slant, sway, swayCycles, turns };
  let drawn = 0;
  for (let i = 0; i < cols; i++) {
    const colour = colours[i % colours.length];
    // each column leans its own way across the fall (as fallField's leaves do), and rocks round that as it turns
    const lean = moveAngle + Math.PI / 2 + (hash(i, seed * 31 + 5) - 0.5) * 1.2;
    const here = lattice.filter((p) => p.col === i).map((p) => fallAt(p, t, opts)).sort((a, b) => a.y - b.y);
    for (const at of here) {
      const angle = lean + rock * Math.sin(TAU * at.turn);
      const ax = Math.floor(at.x), ay = Math.floor(at.y);
      for (const [dx, dy, c] of leafCells({ size, angle, turn: at.turn, colour, rim })) {
        g.dot(origin + mod(ax + dx + sx, period), origin + mod(ay + dy + sy, period), c);
        drawn++;
      }
    }
  }
  return { drawn };
}
