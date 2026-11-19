// Drifting mist (core-sprites-1, batch K08): an area loop of low wisps lying on the ground. The wisps are the
// framework's mistBank (engine/mist.js, added with this batch): each swells, drifts to the right, lifts a little
// and thins out on its own timer, so the loop closes and the bank is never empty; wisps that touch join into one
// cloud with one rim, and the gaps between them keep the bank low and broken rather than a wall. Light only: no
// ink; the bank is rimmed with the mist-shadow colour. This file is the sizes, the reach and the colours.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { mix } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { mistBank } from '../engine/mist.js';

const P = PALETTE.thornwood;
const FLOOR = 61;                                        // the mist lies on this row
const LEFT = 3, RIGHT = 61;                              // the band the wisps start along, inside the 1 px border
// Mist and its shadow are touching pieces of one bank: the light band and the dark band share no colour.
const MIST = [P.cream, '#d8d8e0', P.sky, P.goblin];
const SHADOW = [P.haze, P.dusk, P.stone, P.leaf, P.slate];
// the style is the shape the bank draws; a blocky wisp is a small cloud of square lumps
const SHAPE = { soft: 'round', wispy: 'wispy', blocky: 'chunky' };

export default defineSprite({
  id: 'mist-drift',
  name: 'Drifting mist',
  kind: 'Effect',
  blurb: 'Low wisps of mist that swell, drift right and thin out along the ground, as a patch to place over a pond, a path or a graveyard. Change the size and number of wisps, how high and how far they drift, their shape and colours.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'forest', 'horror'], gameTypes: ['platformer', 'top-down-rpg', 'puzzle', 'roguelike-action'], view: 'side',
    words: ['mist', 'fog', 'haze', 'vapour', 'ground fog', 'swamp', 'graveyard', 'drift', 'creepy', 'morning', 'weather'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 62],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Wisps', 5, { min: 3, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    reach: range('Reach', 0.5, { lo: 'Low', hi: 'High' }),
    drift: range('Drift', 0.5, { lo: 'Still', hi: 'Drifting' }),
    style: choice('Style', 'soft', ['soft', 'wispy', 'blocky']),
    body: color('Mist', P.cream, MIST),
    edge: color('Mist shadow', P.haze, SHADOW),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Morning mist', params: {} },
    { name: 'Swamp fog', params: { body: P.goblin, edge: P.leaf } },
    { name: 'Graveyard fog', params: { style: 'wispy', body: '#d8d8e0', edge: P.dusk } },
    { name: 'Ground fog', params: { reach: 0, pieces: 8 } },
    { name: 'Thick bank', params: { size: 1, reach: 1, style: 'soft' } },
  ],

  render(g, { t, p }) {
    const size = lerp(2.6, 4.6, p.size);                                // a wisp's radius when grown
    mistBank(g, {
      t, x0: LEFT, x1: RIGHT, y: FLOOR - 1, count: p.pieces, seed: 2,
      dist: lerp(2, 14, p.drift), angle: PI / 2,                        // drifting right
      rise: lerp(1, 9, p.reach), lift: lerp(0, 10, p.reach),            // how far up the bank reaches
      size, shape: SHAPE[p.style], lobes: 3, stretch: 1.8, floor: FLOOR,
      colours: [p.body, mix(p.body, p.edge, 0.45), p.edge],             // lit top, shaded side, rim
    });
  },
});
