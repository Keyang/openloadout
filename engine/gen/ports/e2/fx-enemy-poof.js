// PORT (migration batch E2): the drawing of the code sprite sprites/enemy-poof.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.enemy-poof@1
// (engine/gen/fx-e2.js), which sprites/enemy-poof.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, clamp, PI } from '../../../motion.js';
import { PALETTE, swatches } from './palettes.js';
import { steps, puffs } from './fx.js';
import { blastBall, puffRing, driftUp } from './bursts.js';
import { drawMark } from './marks.js';

const P = PALETTE.thornwood;
const CX = 24, CY = 24;
// The light top of a puff sits on its darker body, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'edge', { lead: 'thorn' });
const CORE = [P.cream, P.skin, P.sky, P.goblin, P.steel].filter((c) => !EDGE.includes(c));
const MARK = { stars: 'star', skulls: 'skull' };
// The phase of the puff ring on frames 2 to 7: it opens evenly over frames 2 to 4, then the puffs fall away fast.
const PUFF_AT = [0, 0.2, 0.4, 0.62, 0.9, 1];

/** Draws one frame of the effect as sprites/enemy-poof.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, frame, p }) {
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
}
