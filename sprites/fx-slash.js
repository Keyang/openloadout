// Slash: the mark of a weapon hit, played over the target on a battle screen. One crescent sweeps
// from the top right to the bottom left in two frames, then thins from its tail end and is gone;
// `cross` adds a second crescent the other way. The crescent is the framework's (engine/spells.js
// `crescent`), the sparks are engine/fx.js `starburst`; this file is the timing and the styles.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, hash } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, starburst } from '../engine/fx.js';
import { crescent } from '../engine/spells.js';

const P = PALETTE.hearthvale;
const CX = 32, CY = 32;
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('hearthvale', 'edge', { lead: 'steel' });
const CORE = [P.cream, P.thunder, P.skin, P.sky].filter((c) => !EDGE.includes(c));

// One cut over its six steps: [from, to, width, which colours]. It sweeps in over steps 0 and 1,
// then the tail end (where it began) goes first.
const STEPS = [
  [0, 0.72, 0.9, 'hot'],
  [0, 1, 1, 'full'],
  [0.22, 1, 0.72, 'full'],
  [0.5, 1, 0.45, 'cool'],
  [0.74, 1, 0.26, 'thin'],
  [0.9, 1, 0.1, 'last'],
];

export default defineSprite({
  id: 'fx-slash',
  name: 'Slash',
  kind: 'Effect',
  blurb: 'The mark of a weapon hit: a crescent that sweeps across the target and thins away, or two that cross. Change its size, curve, thickness, style, sparks and colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'roguelike-action', 'platformer'], view: 'side',
    words: ['slash', 'cut', 'sword', 'swing', 'strike', 'claw', 'scratch', 'hit', 'attack', 'crescent', 'blade', 'damage', 'sharp'], license: 'draft' },
  size: [64, 64],
  pivot: [CX, CY],
  grounded: false,
  sounds: {
    burst: [{ sound: 'sword-slash', preset: 'Quick dagger', frame: 1, volume: 0.7 }],
    cross: [{ sound: 'sword-slash', preset: 'Quick dagger', frame: 1, volume: 0.7 }, { sound: 'sword-slash', preset: 'Quick dagger', frame: 4, volume: 0.7 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    length: range('Curve', 0.5, { lo: 'Straight', hi: 'Curved' }),
    thickness: range('Thickness', 0.5, { lo: 'Thin', hi: 'Chunky' }),
    style: choice('Style', 'clean', ['clean', 'jagged', 'claw']),
    sparks: toggle('Sparks', true),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.steel, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
    cross: { label: 'Cross slash', frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, frame, p }) {
    const [core, mid, edge, rim] = steps(p.edge, { core: p.core, white: false });
    const PAINT = { hot: ['#ffffff', core, edge, rim], full: [core, mid, edge, rim], cool: [mid, edge, rim], thin: [edge, rim], last: [rim] };
    const half = lerp(21, 33, p.size);                       // half the length of a cut
    const wide = lerp(5, 11.5, p.thickness);
    const bow = lerp(0.6, 0.62 * half, p.length);            // how far the arc stands off the straight line
    const ux = -0.643, uy = 0.766;                           // the way the first cut travels: down and to the left

    // one cut at step `s` (0 to 5); side 1 runs top right to bottom left, side -1 is its mirror image
    const cut = (s, side) => {
      if (s < 0 || s >= STEPS.length) return;
      const [from, to, w, paint] = STEPS[s];
      const dx = ux * side, k = s / (STEPS.length - 1);
      const stroke = (off, len, width, jag) => {
        // `off` moves the cut sideways (across its own direction), for the parallel cuts of a claw
        const ox = CX + uy * off * side, oy = CY - ux * off;
        crescent(g, { x0: ox - dx * half * len, y0: oy - uy * half * len, x1: ox + dx * half * len, y1: oy + uy * half * len, bulge: side * bow * len, width: Math.max(1, width * w), from, to, jag, teeth: 9, seed: side + 2, colours: PAINT[paint] });
      };
      // sparks first, so the cut covers the ones still inside it; they fly on the way the blade went
      if (p.sparks) for (let i = 0; i < 4; i++) {
        // four-point glints: each starts beside the cut and drifts off it, shrinking as it goes
        const along = lerp(-0.6, 0.7, (i + 0.8 * hash(i, side + 7)) / 4) * half, off = (5 + 5 * hash(i, side + 9)) * (1 + 1.2 * k) * (i % 2 ? 1 : -1);
        const r1 = [2.6, 3.6, 3.6, 2.6, 1.6, 1.2][Math.min(5, s + (i % 2))];
        const sx = Math.floor(CX + dx * along + uy * off * side + dx * 5 * k) + 0.5, sy = Math.floor(CY + uy * along - ux * off + uy * 5 * k) + 0.5;
        starburst(g, { x: sx, y: sy, count: 4, r1, width: r1 > 3 ? 1.9 : 1, colour: s >= 4 ? edge : core, rim: r1 > 1.5 ? rim : null });
      }
      if (p.style === 'claw') {
        const gap = wide * 0.62 + 2.6;
        stroke(-gap, 0.8, wide * 0.52, 0);
        stroke(gap, 0.86, wide * 0.52, 0);
        stroke(0, 1, wide * 0.6, 0);
      } else stroke(0, 1, wide, p.style === 'jagged' ? 1.2 + wide * 0.16 : 0);
    };

    cut(frame, 1);
    if (clip === 'cross') cut(frame - 3, -1);
  },
});
