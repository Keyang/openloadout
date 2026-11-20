// PORT (migration batch E2): the drawing of the code sprite sprites/dodge-trail.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.dodge-trail@1
// (engine/gen/fx-e2.js), which sprites/dodge-trail.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, PI } from '../../../motion.js';
import { PALETTE, swatches } from './palettes.js';
import { steps, particles } from './fx.js';
import { afterimages, speedLines, figureIn } from './fx-floor.js';

const D = PALETTE.derelict;
const CX = 24, CY = 24;
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('derelict', 'edge', { lead: 'cyan' });
const CORE = [D.cream, D.suit, D.steel, D.gold, D.chitin].filter((c) => !EDGE.includes(c));

/** Draws one frame of the effect as sprites/dodge-trail.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
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
}
