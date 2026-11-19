// Falling leaves (core-sprites-2, batch K19): screen-wide leaves as one 64x64 loop that wraps round its inner 62x62
// square, so copies laid 62 px apart cover the screen with no seam. Built on the framework's wrapping weather field
// (engine/weather.js's lattice, drawn by engine/leaf-tumble.js `leafField`): each leaf is a pointed leaf picture with a
// lit upper side, rimmed in a darker tone of its own colour, rocking and turning over (its mirrored, darker underside)
// as it falls and sways, never edge-on as a bar; columns alternate the two leaf colours. This file
// is the styles (rows, how far each falls per loop, how often it turns, the slant), the leaf size and the colours.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { PALETTE } from '../engine/palettes.js';
import { leafField } from '../engine/leaf-tumble.js';

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

export default defineSprite({
  id: 'falling-leaves',
  name: 'Falling leaves',
  kind: 'Effect',
  blurb: 'Leaves in two colours turning over as they fall and sway through the whole scene, drifting, fluttering or blown slantwise by a gust. Change how many leaves, their size, the style, the sway, the colours and the speed. Lay copies 62 px apart (each over its neighbours\' empty border) to cover the screen.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'forest', 'farm'], gameTypes: ['platformer', 'top-down-rpg', 'farming-sim', 'puzzle'], view: 'none',
    words: ['leaves', 'falling leaves', 'autumn', 'fall', 'foliage', 'drifting', 'flutter', 'gust', 'breeze', 'season', 'overlay'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Leaves', 5, { min: 3, max: 9, step: 1, lo: 'Few', hi: 'Many' }),
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'drift', ['drift', 'flutter', 'gust']),
    sway: range('Sway', 0.5, { lo: 'Still', hi: 'Swaying', group: 'Motion' }),
    body: color('Leaves', P.ember, LEAVES, { material: 'plant' }),
    accent: color('Second leaves', P.gold, SECOND, { material: 'plant' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Autumn', params: {} },
    { name: 'Summer green', params: { body: P.leaf, accent: P.grass } },
    { name: 'Gusty', params: { style: 'gust', pieces: 9 } },
    { name: 'A few big leaves', params: { pieces: 3, size: 1, style: 'flutter' } },
    { name: 'Red and brown', params: { body: P.crimson, accent: P.wood } },
  ],

  render(g, { t, p }) {
    const s = STYLES[p.style];
    leafField(g, { t, cols: p.pieces, rows: s.rows, laps: s.laps, slant: s.slant, turns: s.turns, swayCycles: s.swayCycles,
      sway: lerp(1, 5, p.sway), size: Math.round(lerp(3, 5, p.size)), colours: [p.body, p.accent], seed: SEED });
  },
});
