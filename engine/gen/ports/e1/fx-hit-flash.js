// PORT (build item E1, after its first review): the drawing of the code sprite sprites/hit-flash.js (its constants, helpers
// and render), word for word, with its imports pointed at the port shims and at migration batch E2's copies of the
// engine helpers (engine/gen/ports/e2/; engine/rock.js crack at engine/gen/ports/e1/rock.js), so it draws paint refs on
// an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.hit-flash@1
// (engine/gen/fx-e1-effects.js), which sprites/hit-flash.json names; it goes only with the last version that draws with it.
// Its settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE
// note says where it differs from its source; never change what a released generator version draws through it.
// The code file's own summary:
// Energy hit: where a shot lands. A white dot, then a thin ring opening with straight shards flying
// off it, then dots: the sci-fi partner of the platformer's hit spark (rings and straight shards
// where that one has a star). Built from the framework's glow, ring, starburst and particles
// (engine/fx.js) and its splat shape (engine/plating.js); this file is the timing and the three styles.
import { lerp, PI, TAU } from '../../../motion.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { steps, starburst, ring, glow, particles } from '../e2/fx.js';
import { splatIn } from '../e2/plating.js';

const P = PALETTE.derelict;
const M = 15.5;                                          // a pixel centre, so the burst is the same on every side
const REACH = 14;                                        // the farthest a shard tip goes from the middle
const inFrame = (px, py) => px >= 1 && py >= 1 && px < 31 && py < 31;
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('derelict', 'edge', { lead: 'cyan' });
const CORE = [P.cream, P.suit, P.skin, P.gold].filter((c) => !EDGE.includes(c));

/** Draws one frame of the effect as sprites/hit-flash.js did: g (a PortSurface), { t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, frame, p }) {
  const C = steps(p.edge, { core: p.core });           // [white, core, middle, edge, rim]
  const [white, core, mid, edge, rim] = C;
  const n = p.pieces;
  const R = lerp(7, 10.5, p.size);                     // how far the ring opens
  const far = Math.min(REACH, R + 3.5);                // where the shard tips end up
  const turn = PI + p.twist * (PI / n);                // half a shard's spacing is the most the burst can turn
  const shards = (o) => starburst(g, { x: M, y: M, count: n, turn, ...o });

  if (p.style === 'cross') {
    // four long straight arms round a small ring: they leave the middle, thin and fly outward, with short shards between them
    const at = PI + p.twist * (PI / 4);
    const arms = (o) => starburst(g, { x: M, y: M, count: 4, turn: at, ...o });
    const between = (o) => starburst(g, { x: M, y: M, count: n, turn: at + PI / n, ...o });
    if (frame > 0) ring(g, { t, x: M, y: M, r0: R * 0.3, r1: R * 0.62, thick: 2, seed: 5, colours: C });
    if (frame === 0) { arms({ r1: far - 1, width: R * 0.38, colour: core, rim: edge }); arms({ r1: far - 3, width: 0.4, colour: white }); glow(g, M, M, R * 0.4, [white, white, core, edge]); }
    else if (frame === 1) { between({ r0: R * 0.75, r1: R * 1.1, width: 0.4, colour: core }); arms({ r0: R * 0.72, r1: far, width: 2.2, colour: core, rim: edge }); glow(g, M, M, R * 0.18, [white, core, edge]); }
    else if (frame === 2) { between({ r0: R * 0.95, r1: R * 1.25, width: 0.4, colour: edge }); arms({ r0: R * 0.9, r1: far, width: 1.6, colour: mid, rim: rim }); }
    else if (frame === 3) { between({ r0: R * 1.2, r1: R * 1.2 + 1.6, width: 0.4, colour: edge }); arms({ r0: far - 3.5, r1: far, width: 0.4, colour: edge }); }
    else { between({ r0: R * 1.3, r1: R * 1.3 + 1, width: 0.4, colour: rim }); arms({ r0: far - 1.5, r1: far, width: 0.4, colour: rim }); }
    return;
  }

  if (p.style === 'splash') {
    // a lumpy blob of light that bursts into round drops
    const lump = (r) => splatIn(M, M, r, { seed: 2, lobes: n, drops: 0 });
    const body = (test, colour, rimColour) => g.fill(1, 1, 31, 31, test, colour, { shade: 0, clip: inFrame, ...(rimColour ? { outline: rimColour } : {}) });
    const drops = () => particles(g, { t, x: M, y: M, loop: false, count: Math.round(n * 1.5), seed: 6, stagger: 0.12, angle: turn, arc: TAU, dist: Math.min(REACH - 1, R * 1.45), size: lerp(5.4, 7, p.size), colours: [core, core, mid, edge, rim] });
    if (frame === 0) { body(lump(R * 1.05), core, edge); body(lump(R * 1.05 - 2.4), white); }
    else if (frame === 1) { drops(); body(lump(R * 0.66), core, edge); }
    else drops();
    return;
  }

  // ---- ring ----
  const dot = R * 0.5;                                 // the white dot of frame 0
  if (frame > 0) ring(g, { t, x: M, y: M, r0: dot, r1: R, thick: 2, seed: 3, colours: C });
  if (frame === 0) { shards({ r0: dot - 1, r1: dot + 3, width: 1.6, colour: core, rim: edge }); glow(g, M, M, dot, [white, white, core, edge]); }
  else if (frame === 1) { shards({ r0: R * 0.72 + 1.5, r1: R * 0.72 + 6, width: 1.6, colour: core, rim: edge }); glow(g, M, M, dot * 0.45, [white, core, edge]); }
  else if (frame === 2) shards({ r0: R * 0.88 + 1.5, r1: far, width: 0.4, colour: mid });
  else if (frame === 3) shards({ r0: far - 2.5, r1: far, width: 0.4, colour: edge });
  else shards({ r0: far - 1, r1: far + 0.4, width: 0.4, colour: rim });
}
