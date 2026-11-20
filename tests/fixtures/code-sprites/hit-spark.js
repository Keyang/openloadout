// FROZEN COPY, not a sprite: sprites/hit-spark.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Hit spark: the flash where a hit lands. Frame 0 is a white star two thirds of the frame across;
// then its rays fly outward and thin, and the last two frames are only the ray tips. Built from
// the framework's starburst, ring and glow (engine/fx.js); this file is the timing and the styles.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp, PI } from '../../../engine/motion.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { steps, starburst, ring, glow } from '../../../engine/fx.js';

const P = PALETTE.thornwood;
const M = 15.5;                                          // a pixel centre, so the star is the same on every side
const REACH = 14;                                        // the farthest a ray tip goes from the middle
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'edge', { lead: 'gold' });
const CORE = [P.cream, P.skin, P.sky, P.goblin, P.steel].filter((c) => !EDGE.includes(c));

export default defineSprite({
  id: 'hit-spark',
  name: 'Hit spark',
  kind: 'Effect',
  blurb: 'The flash where a hit lands: a white star whose rays fly outward and fade. Change its size, rays, style, turn and colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'turn-based-rpg', 'roguelike-action', 'arcade'], view: 'none',
    words: ['hit', 'spark', 'impact', 'flash', 'star', 'slash', 'strike', 'clash', 'damage', 'burst', 'attack', 'sharp'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 6, { min: 4, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    style: choice('Style', 'star', ['star', 'slash', 'ring']),
    twist: range('Twist', 0, { lo: 'Straight', hi: 'Turned' }),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.gold, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 5, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { t, frame, p }) {
    const C = steps(p.edge, { core: p.core });           // [white, core, middle, edge, rim]
    const [white, core, mid, edge, rim] = C;
    const n = p.pieces;
    const R = lerp(7, 11.5, p.size);                     // the star's radius on frame 0
    const far = Math.min(REACH, R * 1.5);                // where the tips end up
    const out = (k) => lerp(R, far, k);
    const turn = PI + p.twist * (PI / n);                // half a ray's spacing is the most a star can turn
    const star = (o) => starburst(g, { x: M, y: M, count: n, turn, ...o });

    if (p.style === 'slash') {
      // one long cut from bottom left to top right, with small sparks across it
      const cut = PI * 0.75 + p.twist * (PI / 2), L = Math.min(REACH, R * 1.3);
      const blade = (o) => starburst(g, { x: M, y: M, count: 2, turn: cut, ...o });
      const across = (o) => starburst(g, { x: M, y: M, count: n, turn: cut + PI / n, ...o });
      if (frame === 0) { across({ r1: R * 0.62, width: R * 0.3, colour: core, rim: edge }); blade({ r1: L, width: R * 0.62, colour: core, rim: edge }); blade({ r1: L - 2, width: R * 0.62 - 2.2, colour: white }); }
      else if (frame === 1) { across({ r0: R * 0.35, r1: R * 0.95, width: 1.6, colour: core, rim: edge }); blade({ r1: REACH, width: R * 0.34, colour: core, rim: edge }); blade({ r1: REACH - 3, width: 0.4, colour: white }); }
      else if (frame === 2) { across({ r0: R * 0.75, r1: R * 1.15, width: 0.4, colour: edge }); blade({ r0: R * 0.45, r1: REACH, width: 1.7, colour: core, rim: edge }); }
      else if (frame === 3) { across({ r0: R * 1.05, r1: R * 1.05 + 1.6, width: 0.4, colour: edge }); blade({ r0: REACH - 4, r1: REACH, width: 0.4, colour: edge }); }
      else { across({ r0: R * 1.2, r1: R * 1.2 + 1, width: 0.4, colour: rim }); blade({ r0: REACH - 1.5, r1: REACH, width: 0.4, colour: rim }); }
      return;
    }

    if (p.style === 'ring') {
      // a round flash inside a shock ring; short rays escape ahead of the ring
      const rr = far - 3;                                // where the ring ends up
      ring(g, { t, x: M, y: M, r0: R * 0.75, r1: rr, thick: 3, seed: 3, colours: C });
      if (frame === 0) { star({ r1: R, width: R * 0.3, colour: core, rim: edge }); glow(g, M, M, R * 0.62, [white, white, core, edge]); }
      else if (frame === 1) glow(g, M, M, R * 0.4, [white, core, edge]);
      else if (frame === 2) star({ r0: far - 2.5, r1: far, width: 0.4, colour: edge });
      else if (frame === 3) star({ r0: far - 1, r1: far, width: 0.4, colour: rim });
      return;
    }

    // ---- star ----
    if (frame === 0) {
      star({ r1: R, width: R * 0.56, colour: core, rim: edge });
      star({ r1: R - 1.6, width: R * 0.56 - 2, colour: white });
    } else if (frame === 1) {
      star({ r0: R * 0.3, r1: out(0.45), width: R * 0.3, colour: core, rim: edge });
      star({ r0: R * 0.55, r1: out(0.45) - 2, width: 0.4, colour: white });
    } else if (frame === 2) {
      star({ r0: R * 0.72, r1: out(0.8), width: 1.5, colour: mid, rim: rim });
      star({ r0: out(0.8) - 2, r1: out(0.8), width: 0.4, colour: core });
    } else if (frame === 3) star({ r0: out(1) - 2.4, r1: out(1), width: 0.4, colour: edge });
    else star({ r0: out(1) - 0.9, r1: out(1) + 0.4, width: 0.4, colour: rim });
  },
});
