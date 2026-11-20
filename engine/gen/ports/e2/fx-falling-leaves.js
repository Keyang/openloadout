// PORT (migration batch E2): the drawing of the code sprite sprites/falling-leaves.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.falling-leaves@1
// (engine/gen/fx-e2.js), which sprites/falling-leaves.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp } from '../../../motion.js';
import { PALETTE } from './palettes.js';
import { leafField } from './leaf-tumble.js';

const P = PALETTE.thornwood;
// Columns alternate the two colours and leaves of neighbouring columns can touch: the lists share no colour.
const LEAVES = [P.ember, P.crimson, P.leaf, P.soil];
const SECOND = [P.gold, P.moss, P.grass, P.wood];
// Each style: rows per column, row gaps fallen per loop, flips per row gap, sways per period and slant.
const STYLES = {
  drift: { rows: 2, laps: 1, turns: 1, swayCycles: 1, slant: 0 },
  flutter: { rows: 2, laps: 1, turns: 3, swayCycles: 3, slant: 0 },
  gust: { rows: 2, laps: 2, turns: 2, swayCycles: 1, slant: 1 },
};
// a lattice seed whose columns start evenly spread down the square at every count (seed 0 bunches them into a band)
const SEED = 26;

/** Draws one frame of the effect as sprites/falling-leaves.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const s = STYLES[p.style];
  leafField(g, { t, cols: p.pieces, rows: s.rows, laps: s.laps, slant: s.slant, turns: s.turns, swayCycles: s.swayCycles,
    sway: lerp(1, 5, p.sway), size: Math.round(lerp(3, 5, p.size)), colours: [p.body, p.accent], seed: SEED });
}
