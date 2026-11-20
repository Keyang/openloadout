// PORT (build item E1, after its first review): the drawing of the code sprite sprites/fx-thunder-spell.js (its constants, helpers
// and render), word for word, with its imports pointed at the port shims and at migration batch E2's copies of the
// engine helpers (engine/gen/ports/e2/; engine/rock.js crack at engine/gen/ports/e1/rock.js), so it draws paint refs on
// an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.fx-thunder-spell@1
// (engine/gen/fx-e1-effects.js), which sprites/fx-thunder-spell.json names; it goes only with the last version that draws with it.
// Its settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE
// note says where it differs from its source; never change what a released generator version draws through it.
// The code file's own summary:
// Thunder spell: a bolt from the top of the frame to the ground line, played over the target on a
// battle screen. Frame 0 a thin leader, frame 1 the full bolt in white, frame 2 the bolt in colour
// with its forks, frame 3 a thinner second flicker, then sparks skitter along the ground and die.
// No ink outline: lightning is rimmed with its own dark tone. The bolt is the framework's
// (engine/spells.js `bolt`), the ground ring, flash and sparks are engine/fx.js; this file is the
// three styles and the timing.
import { lerp, PI } from '../../../motion.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { steps, ring, glow, particles } from '../e2/fx.js';
import { bolt, boltPath } from '../e2/spells.js';

const P = PALETTE.hearthvale;
const CX = 32, FLOOR = 90, TOP = 2;                      // the ground row; the bolt's first row (its rim is on row 1)
const ABOVE = [1, 1, 63, FLOOR];
// The core runs inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('hearthvale', 'edge', { lead: 'thunder' });
const CORE = [P.cream, P.skin, P.sky, P.haze].filter((c) => !EDGE.includes(c));

/** Draws one frame of the effect as sprites/fx-thunder-spell.js did: g (a PortSurface), { frame, p } (p the settings, colours as paint refs). */
export function render(g, { frame, p }) {
  const [core, mid, edge, rim] = steps(p.edge, { core: p.core, white: false });
  const hot = steps(p.edge, { core: p.core });
  const pillar = p.style === 'pillar', chain = p.style === 'chain';
  const reach = lerp(4, 11, p.width);                      // how far the strike wanders to the side
  const kinks = Math.round(lerp(4, 8, p.wobble)), zigzag = lerp(1, 5.5, p.wobble) * (pillar ? 0.4 : chain ? 0.8 : 1);
  const x0 = CX + (pillar ? 0 : Math.round(reach * 0.9)), y1 = FLOOR - 1;
  const shape = { x0, y0: TOP, x1: CX, y1, box: ABOVE };
  const route = (mirror) => boltPath(x0, TOP, CX, y1, { kinks, zigzag: chain ? zigzag + reach * 0.45 : zigzag, sway: pillar || chain ? 0 : reach, mirror, seed: 3 });
  const path = route(false), strands = chain ? [path, route(true)] : [path];
  const forks = { forks: p.pieces, forkLength: lerp(0.2, 0.36, p.width), forkAngle: pillar ? 1.25 : 0.9, zigzag: Math.max(2, zigzag), seed: 5 };
  // a pillar is a column of light: this much wider than a bolt at its brightest, closing again as it fades
  const fat = pillar ? lerp(7, 12, p.width) * [0, 1, 0.62, 0.25, 0, 0, 0, 0][frame] : 0;
  // one stroke of the whole strike: every strand at this width, in these colours
  const strike = (wide, colours, more = {}) => strands.forEach((route, i) => bolt(g, { ...shape, path: route, width: wide + fat, colours, ...(i === 0 ? more : {}) }));
  // round a pillar a thin bolt crackles, wider than the column, so it shows on both sides of it
  if (pillar && frame >= 1 && frame <= 3) bolt(g, { ...shape, kinks: kinks + 2, zigzag: lerp(7, 12, p.width) * 0.5 + 2 + zigzag, width: 1, seed: 7 + frame, colours: [edge, rim] });
  const gx = CX, gy = FLOOR - 2;                           // where it hits the ground

  // the ground ring opens from the hit and breaks up; its last pixels are what is left at the end
  if (frame >= 1) ring(g, { t: (frame - 1) / 6, x: gx, y: gy, r0: 4, r1: lerp(13, 22, p.width), thick: 3, squash: 0.28, seed: 2, colours: [core, mid, edge, rim], box: [1, 1, 63, FLOOR + 1] });
  if (p.sparks && frame >= 1) {
    // sparks thrown low to both sides that hop along the ground, and small arcs that crawl outward with them
    const k = (frame - 1) / 6, far = lerp(15, 25, p.width);
    for (const side of [-1, 1]) {
      particles(g, { t: k, x: gx, y: gy, loop: false, count: 5, seed: side + 6, stagger: 0.25, angle: side * (PI / 2 + 0.35), arc: 0.7, dist: far, gravity: 7, size: 3.4, colours: [core, edge, edge, rim], box: ABOVE });
      if (frame >= 3 && frame <= 6) {
        const a = (frame - 3) / 4;
        bolt(g, { x0: gx + side * 3, y0: gy, x1: gx + side * (far + 3), y1: gy - 1, kinks: 5, zigzag: 2.2, width: 1, from: a, to: Math.min(1, a + 0.42), seed: frame + side + 9, colours: frame <= 4 ? [core, rim] : [edge, rim], box: ABOVE });
      }
    }
  }

  if (frame === 0) strike(1, [edge, rim], { to: 0.9 });                               // the leader, feeling its way down
  else if (frame === 1) { strike(5, pillar ? ['#ffffff', core, edge, rim] : ['#ffffff', edge, rim]); glow(g, gx, FLOOR, lerp(7, 10, p.width), hot, { box: ABOVE }); }
  else if (frame === 2) { strike(3.4, pillar ? [core, mid, edge, rim] : [core, edge, rim], forks); glow(g, gx, FLOOR, lerp(4.5, 6.5, p.width), [core, mid, edge, rim], { box: ABOVE }); }
  else if (frame === 3) strike(1.8, [mid, rim], { ...forks, forkLength: forks.forkLength * 0.6 });
  else if (frame === 4) for (const [from, to] of [[0.06, 0.2], [0.4, 0.52], [0.74, 0.9]]) strike(1, [edge, rim], { from, to });   // what is left of the channel
  else if (frame === 5) for (const [from, to] of [[0.12, 0.18], [0.8, 0.88]]) bolt(g, { ...shape, path, width: 1, colours: [rim], from, to });
}
