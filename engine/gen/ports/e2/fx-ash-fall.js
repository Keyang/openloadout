// PORT (migration batch E2): the drawing of the code sprite sprites/ash-fall.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.ash-fall@1
// (engine/gen/fx-e2.js), which sprites/ash-fall.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, fract } from '../../../motion.js';
import { PALETTE } from './palettes.js';
import { tone } from '../colour.js';
import { fallField, fallLattice, fallAt } from './weather.js';

const P = PALETTE.thornwood;
// The ember core lies in its flake: the two lists share no colour.
const ASH = [P.stone, P.cream, P.slate, '#6b7280', P.haze];
const EMBERS = [P.ember, P.gold, P.crimson, P.magic];
// Each style: shape (soot's dot is fallField's; ash flecks are drawn below), rows per column, row gaps fallen per loop, tumbles per row gap, lit cores, sway on or off.
const STYLES = {
  ash: { shape: 'ash', rows: 3, laps: 1, turns: 1, coreEvery: 0, sways: true },
  cinders: { shape: 'ash', rows: 3, laps: 1, turns: 2, coreEvery: 2, sways: true },
  soot: { shape: 'dot', rows: 2, laps: 2, turns: 1, coreEvery: 0, sways: false },
};
// a lattice seed whose columns start evenly spread down the square at every count (seed 0 bunches them into a band)
const SEED = 26;

// Ash flecks by size step, drawn cell by cell so each has a dark underside that shows on any backdrop, a mid-grey one
// included: a 2 px corner (3 cells), the default sparse 3 px fleck (5 cells), and Big's filled 3 px flake (8 cells).
// The middle cell (0, 0) comes first: a cinder's core.
const FLECKS = [
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [0, -1], [1, 0], [-1, 1], [0, 1]],
  [[0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]],
];
const quarter = (cells, q) => cells.map(([x, y]) => [[x, y], [-y, x], [-x, -y], [y, -x]][q & 3]);
// a colour's underside: two steps darker, slate-blue (stone gives #403d5c, some 65 to 80 below a mid-grey backdrop)
const under = (c) => tone(tone(c, -1), -1);

// The weather field's lattice and paths (engine/weather.js), drawing a shaded fleck at every piece, wrapped round the
// same inner square as fallField so copies laid 62 px apart still join with no seam. A fleck tumbles through quarter
// turns; whichever cells face down-right after the turn are its underside, so the light keeps one side as it tumbles.
function ashField(g, { t, cols, rows, laps, turns, sway, step, colours, core, coreEvery }) {
  const period = 62, origin = 1, opts = { rows, period, laps, sway, swayCycles: 1, turns };
  const mod = (v, m) => ((v % m) + m) % m;
  const lattice = fallLattice({ cols, rows, period, seed: SEED });
  for (let i = 0; i < cols; i++) {
    const c = colours[i % colours.length], dark = under(c);
    const lit = coreEvery > 0 && i % coreEvery === 0 ? core : undefined;
    const here = lattice.filter((p) => p.col === i).map((p) => fallAt(p, t, opts)).sort((a, b) => a.y - b.y);
    for (const at of here) {
      const cells = quarter(FLECKS[step], Math.floor(fract(at.turn) * 4));
      const low = Math.max(...cells.map(([x, y]) => x + y)), deep = step === 2 ? 1 : 0;   // Big's underside is 3 cells deep
      const ax = Math.floor(at.x), ay = Math.floor(at.y);
      cells.forEach(([x, y], k) => {
        const col = k === 0 && lit && at.turn < 0.5 ? lit : x + y >= low - deep ? dark : c;
        g.dot(origin + mod(ax + x, period), origin + mod(ay + y, period), col);
      });
    }
  }
}

/** Draws one frame of the effect as sprites/ash-fall.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const s = STYLES[p.style];
  const colours = [p.body, tone(p.body, -0.3)];
  if (p.style === 'soot') {
    fallField(g, { t, cols: p.pieces, rows: s.rows, laps: s.laps, turns: s.turns, sway: 0, swayCycles: 1, seed: SEED, shape: 'dot', size: 2, colours });
    return;
  }
  // three steps over the 2 to 3 px range: Small a 2 px corner, the default a sparse 3 px fleck, Big a filled 3 px flake
  const step = p.size < 0.25 ? 0 : p.size < 0.75 ? 1 : 2;
  ashField(g, { t, cols: p.pieces, rows: s.rows, laps: s.laps, turns: s.turns, sway: s.sways ? lerp(0, 3, p.sway) : 0, step, colours,
    core: p.glow, coreEvery: s.coreEvery });
}
