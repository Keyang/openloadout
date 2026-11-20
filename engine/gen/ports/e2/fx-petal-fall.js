// PORT (migration batch E2): the drawing of the code sprite sprites/petal-fall.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.petal-fall@1
// (engine/gen/fx-e2.js), which sprites/petal-fall.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, hash } from '../../../motion.js';
import { PALETTE } from './palettes.js';
import { tone, mix } from '../colour.js';
import { fallLattice, fallAt } from './weather.js';

const P = PALETTE.thornwood;
// The two colours touch on a rose petal and across columns: the lists share no colour.
const PETALS = [P.skin, P.cream, P.crimson, P.gold, PALETTE.derelict.chitin];
const SECOND = [P.thorn, P.ember, P.moss, P.magic, P.hero];
// Each style: rows per column, row gaps fallen per loop and sway factor (its shape and colours are drawn in render).
const STYLES = {
  blossom: { rows: 3, laps: 1, swayBy: 1 },
  rose: { rows: 2, laps: 1, swayBy: 1 },
  seeds: { rows: 2, laps: 1, swayBy: 2 },
};
// a lattice seed whose columns start evenly spread down the square at every count (seed 0 bunches them into a band)
const SEED = 26;

// Blossom petals: one leaning teardrop per size (2x4, 3x4 or 4x6 px), drawn cell by cell so it reads as a petal even at
// 1x: T is the pale pointed tip, X the face, S the shaded round end. Columns lean left or right (a mirror of the same
// drop); as a petal turns over, its face darkens to the underside while the outline and the pale tip stay.
const DROPS = {
  2: ['T.', 'XX', 'XX', '.S'],
  3: ['T..', 'XX.', 'XXX', '.XS'],
  4: ['T...', 'XX..', 'XXX.', 'XXXX', '.XXS', '..S.'],
};
// Rose petals: one size step above the blossom drop at every Size setting (9, 14 or 23 cells against 6, 8 or 14), a
// rounded petal whose curled outer edge R is the second colour, X the face, S its shaded base; mirrored by column.
const ROSES = {
  2: ['.RR', 'RXX', 'RXS', '.S.'],
  3: ['.RR.', 'RXXX', 'RXXX', '.XXS', '..S.'],
  4: ['.RRR.', 'RXXXX', 'RXXXX', 'RXXXS', '.XXS.', '..S..'],
};
// A seed is a little parachute: a stalk and seed B (S its shaded tip) in the body colour, under a fluffy tuft of rays
// radiating up and out from a dark knot A to pale tips L, with gaps between them so it reads as fluff, not a cap.
const SEED_CHUTE = ['.L.L.', 'L.L.L', '.LAL.', '..B..', '..B..', '..S..'];
const cellsOf = (rows) => rows.flatMap((row, y) => [...row].map((k, x) => [x, y, k]).filter(([, , k]) => k !== '.'));

// The weather field's lattice and paths (engine/weather.js), drawing one cell pattern at every piece, wrapped round the
// same inner square as fallField so copies laid 62 px apart still join with no seam. pals(i) gives column i's face and
// underside colours by key; mirror leans every other column (by hash) the other way.
function patternField(g, { t, cols, rows, laps, sway, pattern, pals, mirror = true }) {
  const period = 62, origin = 1, opts = { rows, period, laps, sway, swayCycles: 1, turns: 1 };
  const mod = (v, m) => ((v % m) + m) % m;
  const cells = cellsOf(pattern), w = pattern[0].length;
  const lattice = fallLattice({ cols, rows, period, seed: SEED });
  for (let i = 0; i < cols; i++) {
    const { face, under = face } = pals(i);
    const flip = mirror && hash(i, SEED * 31 + 5) < 0.5;
    const here = lattice.filter((p) => p.col === i).map((p) => fallAt(p, t, opts)).sort((a, b) => a.y - b.y);
    for (const at of here) {
      const ax = Math.floor(at.x) - (w >> 1), ay = Math.floor(at.y) - 1;
      const pal = at.turn >= 0.25 && at.turn < 0.75 ? under : face;
      for (const [x, y, k] of cells) g.dot(origin + mod(ax + (flip ? w - 1 - x : x), period), origin + mod(ay + y, period), pal[k]);
    }
  }
}

/** Draws one frame of the effect as sprites/petal-fall.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const s = STYLES[p.style];
  const field = { t, cols: p.pieces, rows: s.rows, laps: s.laps, sway: lerp(1, 4, p.sway) * s.swayBy };
  const step = Math.round(lerp(2, 4, p.size));
  if (p.style === 'blossom') {
    const colours = [p.body, p.accent];
    patternField(g, { ...field, pattern: DROPS[step], pals: (i) => {
      const c = colours[i % 2], face = { T: tone(c, 0.7), X: c, S: tone(c, -0.6) };
      return { face, under: { ...face, X: tone(c, -0.3) } };
    } });
  } else if (p.style === 'rose') {
    const c = p.body, face = { R: p.accent, X: c, S: tone(c, -0.6) };
    patternField(g, { ...field, pattern: ROSES[step], pals: () => ({ face, under: { ...face, X: tone(c, -0.3) } }) });
  } else {
    const c = p.body, face = { L: mix(tone(p.accent, 0.8), c, 0.65), A: p.accent, B: c, S: tone(c, -0.35) };
    patternField(g, { ...field, pattern: SEED_CHUTE, pals: () => ({ face }), mirror: false });
  }
}
