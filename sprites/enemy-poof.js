// Defeat poof (kit-platformer-fantasy, batch P13): what is left when an enemy is defeated.
// Frames 0 to 1 a bright ball (pure white on frame 0 only); 2 to 4 it breaks into round puffs that
// move outward, the whole poof growing from frame to frame; 5 to 7 the puffs cool and shrink to dots
// while two or three small stars (or skulls, or for the cloud style a last few puffs) drift up.
// Built from the framework: blastBall, puffRing and driftUp (engine/bursts.js), puffs (engine/fx.js)
// and the picture marks (engine/marks.js); this file is the timing and the three styles.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, puffs } from '../engine/fx.js';
import { blastBall, puffRing, driftUp } from '../engine/bursts.js';
import { drawMark } from '../engine/marks.js';

const P = PALETTE.thornwood;
const CX = 24, CY = 24;
// The light top of a puff sits on its darker body, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'edge', { lead: 'thorn' });
const CORE = [P.cream, P.skin, P.sky, P.goblin, P.steel].filter((c) => !EDGE.includes(c));
const MARK = { stars: 'star', skulls: 'skull' };
// The phase of the puff ring on frames 2 to 7: it opens evenly over frames 2 to 4, then the puffs fall away fast.
const PUFF_AT = [0, 0.2, 0.4, 0.62, 0.9, 1];

export default defineSprite({
  id: 'enemy-poof',
  name: 'Defeat poof',
  kind: 'Effect',
  blurb: 'The puff an enemy leaves when it is defeated: a bright ball that breaks into puffs, with stars or skulls drifting up. Change its size, number of puffs, spread, style and colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'turn-based-rpg', 'roguelike-action', 'arcade'], view: 'none',
    words: ['poof', 'puff', 'smoke', 'cloud', 'defeat', 'vanish', 'die', 'enemy', 'kill', 'stars', 'skull', 'burst', 'pop', 'disappear'], license: 'draft' },
  size: [48, 48],
  pivot: [CX, CY],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 6, { min: 4, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'stars', ['cloud', 'stars', 'skulls']),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.thorn, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 8, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { t, frame, p }) {
    const C = steps(p.edge, { core: p.core, white: false });      // [light top, body, shade, rim]
    const [core, mid, edge, rim] = C;
    const n = p.pieces;
    const puff = lerp(5, 6.5, p.size);                            // the radius of one puff before it thins
    const R = puff * 1.66;                                        // the ball: a little smaller than the cloud it bursts into

    if (frame === 0) { blastBall(g, { x: CX, y: CY, r: R * 0.9, bump: 0, colours: ['#ffffff', '#ffffff', core, edge] }); return; }
    if (frame === 1) { blastBall(g, { x: CX, y: CY, r: R, bumps: n, bump: 0.2, turn: 0.4, heat: 0.75, colours: [core, core, mid, rim] }); return; }

    // the puffs, frames 2 to 7: one cloud wider than the ball, then a ring of puffs that opens (2 to 4, at
    // full size, so the poof only ever grows), then they lose their light tops and shrink to dots (5) and
    // to single pixels (6 to 7), which leaves the stars clear
    puffRing(g, { t: PUFF_AT[frame - 2], x: CX, y: CY, count: n, r0: puff * 0.9, r1: puff * lerp(1.9, 2.75, p.spread), size: puff, end: 0.5, hold: 0.4, cool: 0.55, rise: 1, apart: frame > 2, seed: 3, colours: C });

    // what drifts up out of it from frame 5 on, once the puffs have opened and cooled
    if (frame < 5) return;
    if (p.style === 'cloud') {
      puffs(g, { t: clamp((frame - 4) / 3), x: CX, y: CY - 2, count: 3, seed: 5, loop: false, stagger: 0.3, angle: PI, arc: 1.3, dist: lerp(9, 15, p.spread), rise: 0, size: lerp(2.4, 3.2, p.size), shape: 'round', lobes: 2, colours: C });
      return;
    }
    // two or three stars or skulls, far enough apart that each keeps its own outline, and kept inside the frame
    const big = p.size > 0.7 ? 9 : 7;
    for (const s of driftUp({ t, x: CX, y: CY, count: n >= 6 ? 3 : 2, rise: lerp(11, 15, p.spread), spread: big + 6, sway: 1, from: 5 / 7 - 0.01, stagger: 0, seed: 2, box: [1, 1, 47, 47], pad: (big + 1) / 2 })) {
      drawMark(g, MARK[p.style], s.x, s.y, s.life > 0.8 ? big - 2 : big, core, { outline: rim });
    }
  },
});
