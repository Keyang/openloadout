// Falling ash (core-sprites-2, batch K20): screen-wide ash as one 64x64 loop that wraps round its inner 62x62 square,
// so copies laid 62 px apart cover the screen with no seam. Built on the framework's wrapping weather field
// (engine/weather.js: `fallField` for soot; its lattice and paths, `fallLattice` and `fallAt`, for flecks drawn cell by
// cell here): irregular flecks with a dark underside that tumble as they drift down, cinders whose ember core blinks as
// they tumble, or fine soot falling straight. Columns alternate the ash colour and a dimmer tone of it, so some flecks
// seem further off; the dark underside keeps grey ash visible on a grey backdrop. This file is the styles (rows, how far each falls per loop, how often it tumbles), the sizes and
// the colours.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, fract } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { tone } from '../engine/color.js';
import { fallField, fallLattice, fallAt } from '../engine/weather.js';

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

export default defineSprite({
  id: 'ash-fall',
  name: 'Falling ash',
  kind: 'Effect',
  blurb: 'Ash tumbling down over the whole screen, as grey flecks, glowing cinders that blink as they tumble, or fine soot. Change how many flakes, their size, the style, the sway, the colours and the speed. Lay copies 62 px apart (each over its neighbours\' empty border) to cover the screen.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'dungeon', 'horror'], gameTypes: ['platformer', 'roguelike-action', 'top-down-rpg', 'shooter'], view: 'none',
    words: ['ash', 'ashes', 'cinders', 'embers', 'soot', 'volcano', 'burned', 'smoulder', 'fallout', 'falling', 'gloomy', 'overlay'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Flakes', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big', when: { style: ['ash', 'cinders'] } }),
    style: choice('Style', 'ash', ['ash', 'cinders', 'soot']),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion', when: { style: ['ash', 'cinders'] } }),
    body: color('Ash', P.stone, ASH, { material: 'stone' }),
    glow: color('Embers', P.ember, EMBERS, { material: 'fire', when: { style: ['cinders'] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Ash', params: {} },
    { name: 'Cinders', params: { style: 'cinders', body: P.haze, pieces: 10 } },
    { name: 'Soot', params: { style: 'soot', body: P.slate } },
    { name: 'Heavy fall', params: { pieces: 12, size: 1 } },
    { name: 'Cold ash', params: { body: P.cream, sway: 1, pieces: 5 } },
  ],

  render(g, { t, p }) {
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
  },
});
