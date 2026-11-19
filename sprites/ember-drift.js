// Drifting embers (core-sprites-1, batch K08): an area loop of glowing bits rising and swaying above lava, a burning
// village or a forge, each on its own timer. Embers are the framework's looping `particles` (engine/fx.js) with a
// negative gravity and a wobble: born at row 60 in the core colour, they cool through the ember colour to a dark dot
// before they vanish. Ash is grey flakes with no hot core that flutter up more slowly; sparks are small pluses
// (`motes` in engine/spells.js). Light only: no ink. This file is the column, the sizes and the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { mix, tone } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { steps, particles } from '../engine/fx.js';
import { motes } from '../engine/spells.js';

const P = PALETTE.thornwood;
const CX = 32, ROOT = 60;                                // embers rise from this row, in a column round the middle
// The core sits inside each ember, so the two lists share no colour: gold stays in the core list only.
const CORE = [P.gold, P.cream, P.skin, P.steel];
const EDGE = [P.ember, P.magic, P.crimson, P.thorn, P.moss, P.stone];

export default defineSprite({
  id: 'ember-drift',
  name: 'Drifting embers',
  kind: 'Effect',
  blurb: 'Glowing embers rising and swaying above lava, a burning village or a forge, cooling to dark dots before they vanish, as a patch to place over the heat. Change their size and number, how wide and how high they rise, embers, ash or sparks, and the colours.',
  meta: { type: 'effect', role: 'effects/weather', themes: ['neutral', 'dungeon', 'fantasy'], gameTypes: ['platformer', 'roguelike-action', 'top-down-rpg', 'shooter'], view: 'side',
    words: ['embers', 'sparks', 'ash', 'cinders', 'fire', 'lava', 'forge', 'burning', 'rise', 'glow', 'heat'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 62],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 8, { min: 4, max: 14, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    rise: range('Rise', 0.5, { lo: 'Low', hi: 'High' }),
    style: choice('Style', 'embers', ['embers', 'ash', 'sparks']),
    core: color('Core', P.gold, CORE, { material: 'fire' }),
    edge: color('Embers', P.ember, EDGE, { material: 'fire' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Embers', params: {} },
    { name: 'Falling ash', params: { style: 'ash', core: P.cream, edge: P.stone } },
    { name: 'Magic sparks', params: { style: 'sparks', core: P.cream, edge: P.magic } },
    { name: 'Inferno', params: { pieces: 14, rise: 1, spread: 1 } },
    { name: 'Few sparks', params: { pieces: 4, size: 0 } },
  ],

  render(g, { t, p }) {
    const C = steps(p.edge, { core: p.core, white: false });          // [core, middle, ember, dark ember]
    const half = lerp(11, 24, p.spread);                                // how far either side of the middle they start
    const up = lerp(34, 56, p.rise);                                   // how high the highest climbs
    const box = [1, 1, 63, ROOT + 2];
    if (p.style === 'sparks') {
      motes(g, { t, x: CX, y: ROOT - 1, count: p.pieces, seed: 4, rise: up, width: 2 * half, size: lerp(3, 5.6, p.size), shape: 'plus', sway: 2.5, colours: C, box });
      return;
    }
    const ash = p.style === 'ash';
    // ash: grey flakes with no hot core, slower and more fluttery; embers: hot beads that cool as they rise
    const colours = ash ? [mix(p.core, P.stone, 0.45), mix(p.edge, P.stone, 0.5), tone(mix(p.edge, P.stone, 0.5), -0.8)] : C;
    particles(g, { t, x: CX, y: ROOT, count: p.pieces, seed: ash ? 6 : 2, angle: PI, arc: 0.35, dist: up * 0.55, gravity: -up * 0.45,
      spread: half, wobble: ash ? 3.5 : 2, size: lerp(3.6, 6, p.size), colours, box });
  },
});
