// Falling petals (core-sprites-2, batch K20): screen-wide petals as one 64x64 loop that wraps round its inner 62x62
// square, so copies laid 62 px apart cover the screen with no seam. Built on the framework's wrapping weather field
// (engine/weather.js: its lattice and paths, `fallLattice` and `fallAt`, the same ones `fallField` uses), with every
// piece drawn cell by cell here (the weather field's `petal` and `seed` shapes, one size larger for rose, so they read
// at 1x). Blossom alternates the two colours by column and turns over by darkening to its underside; a rose petal is
// two-tone (its rim in the second colour); a seed's tuft is the second colour. This file is the styles (rows, how far
// each falls per loop, the shape), the sizes and the colours.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, hash } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { tone, mix } from '../engine/color.js';
import { fallLattice, fallAt } from '../engine/weather.js';

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

export default defineSprite({
  id: 'petal-fall',
  name: 'Falling petals',
  kind: 'Effect',
  blurb: 'Blossom, rose petals or fluffy seeds drifting and spinning down over the whole screen. Change how many petals, their size, the style, the sway, the two colours and the speed. Lay copies 62 px apart (each over its neighbours\' empty border) to cover the screen.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'farm', 'forest'], gameTypes: ['top-down-rpg', 'farming-sim', 'puzzle', 'card-game'], view: 'none',
    words: ['petals', 'blossom', 'cherry blossom', 'rose petals', 'flowers', 'seeds', 'dandelion', 'spring', 'wedding', 'drifting', 'falling', 'overlay'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Petals', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big', when: { style: ['blossom', 'rose'] } }),
    style: choice('Style', 'blossom', ['blossom', 'rose', 'seeds']),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    body: color('Petals', P.skin, PETALS, { material: 'plant' }),
    accent: color('Second petals', P.thorn, SECOND, { material: 'plant' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Blossom', params: {} },
    { name: 'Rose petals', params: { style: 'rose', body: P.crimson, accent: P.thorn } },
    { name: 'Seeds on the wind', params: { style: 'seeds', body: P.cream, pieces: 6 } },
    { name: 'Golden petals', params: { body: P.gold, accent: P.ember } },
    { name: 'Light drift', params: { pieces: 4, sway: 1 } },
  ],

  render(g, { t, p }) {
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
  },
});
