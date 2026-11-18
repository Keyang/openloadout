// Dodge trail: what a dodge to the right leaves behind. Three body-sized blurs stretch to the left, the newest
// (nearest the dodger) white-hot, with speed lines beside them; each frame the oldest shrinks and darkens. A game
// spawns it where the dodge began and turns or mirrors it for other directions. Everything is the framework's
// (engine/fx-floor.js: afterimages, speedLines, figureIn; engine/fx.js: steps, particles); this file is
// the sizes, the timing and the three styles.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, particles } from '../engine/fx.js';
import { afterimages, speedLines, figureIn } from '../engine/fx-floor.js';

const D = PALETTE.derelict;
const CX = 24, CY = 24;
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('derelict', 'edge', { lead: 'cyan' });
const CORE = [D.cream, D.suit, D.steel, D.gold, D.chitin].filter((c) => !EDGE.includes(c));

export default defineSprite({
  id: 'dodge-trail',
  name: 'Dodge trail',
  kind: 'Effect',
  blurb: 'The fading blurs and speed lines a dodge to the right leaves behind. Change its size, length, number of streaks, style and colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['dodge', 'dash', 'trail', 'afterimage', 'blur', 'ghost', 'speed lines', 'streak', 'roll', 'blink', 'evade', 'thruster', 'fast'], license: 'draft' },
  size: [48, 48],
  pivot: [CX, CY],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    pieces: range('Streaks', 4, { min: 2, max: 6, step: 1, lo: 'Few', hi: 'Many' }),
    style: choice('Style', 'streaks', ['streaks', 'ghosts', 'sparks']),
    core: color('Core', D.cream, CORE),
    edge: color('Edge', D.cyan, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { t, p }) {
    const C = steps(p.edge, { core: p.core, white: false });            // [core, middle, edge, rim]
    const H = lerp(16, 25, p.size), W = H * 0.67;                       // one blur: about the size of a dodging body
    const lean = H * 0.16;                                              // it leans into the dodge
    const step = lerp(6, 10, p.length);                                 // from one blur to the next
    const x0 = CX + step;                                               // the newest blur; the three are centred on the frame
    const blur = (cx, cy, s) => figureIn(cx, cy, W * s, H * s, { head: 0.52, waist: 0.64, lean: lean * s, legs: H * s * 0.2 });
    // the lines run from the newest blur back past the oldest, between and beside the bodies
    const lines = (from = x0) => speedLines(g, { t, x: from, y: CY, count: p.pieces, length: 2 * step + lerp(6, 12, p.length), spread: H / 2 + 1, reach: lerp(2, 5, p.length), colours: C, seed: 2 });

    if (p.style === 'ghosts') {
      // clean copies of the body, well apart
      const far = step * 1.25;
      lines(CX + far - 3);
      afterimages(g, { t, x: CX + far - 3, y: CY, count: 3, step: far, shape: blur, colours: C, white: '#ffffff' });
    } else if (p.style === 'sparks') {
      // one blur where the dodger left, and a spray of sparks thrown back along the lines
      lines();
      afterimages(g, { t, x: x0, y: CY, count: 1, shape: blur, colours: C, white: '#ffffff' });
      particles(g, { t, x: x0 - W / 2 - 1, y: CY, loop: false, count: 5 + 2 * p.pieces, seed: 5, stagger: 0.35, angle: -PI / 2, arc: 0.8, dist: 2 * step + lerp(2, 8, p.length), size: 2.4, spread: H / 3, colours: C });
    } else {
      // streaks: the blurs run into each other, and the trailing side of each is dragged out into streaks
      const near = step * 0.85;
      lines(CX + near);
      afterimages(g, { t, x: CX + near, y: CY, count: 3, step: near, smear: step, shape: blur, colours: C, white: '#ffffff' });
    }
  },
});
