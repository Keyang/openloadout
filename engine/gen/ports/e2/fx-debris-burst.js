// PORT (migration batch E2): the drawing of the code sprite sprites/debris-burst.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.debris-burst@1
// (engine/gen/fx-e2.js), which sprites/debris-burst.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp } from '../../../motion.js';
import { INK } from '../colour.js';
import { PALETTE, swatches } from './palettes.js';
import { steps, puffs, glow } from './fx.js';
import { scrap, splash, SCRAP_SHAPES } from './fx-floor.js';

const D = PALETTE.derelict;
const CX = 24, CY = 24;
const DUST = steps(D.panel, { core: D.steel, white: false });           // the dust a wreck throws up: a rim of its own, no ink
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

/** Draws one frame of the effect as sprites/debris-burst.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, t, frame, p }) {
  const far = lerp(10, 18, p.spread);                                 // how far the farthest piece is thrown, across
  if (clip === 'goo') {
    splash(g, { t, x: CX, y: CY, count: p.pieces, seed: 2, dist: far, hop: lerp(3, 6, p.size), size: lerp(4, 6.6, p.size), pool: lerp(8, 14, p.size), from: 0.08, colour: p.accent });
    return;
  }
  // scrap: a pale flash and a puff of dust where it broke, and the pieces over them
  const dust = Math.min(1, t * 1.75);                                 // the dust is gone before the pieces have settled
  if (dust < 1) puffs(g, { t: dust, x: CX, y: CY, count: 4, seed: 3, stagger: 0.18, angle: 0, arc: 6.2, dist: far * 0.5, rise: 2, size: lerp(2.2, 3.4, p.size), lobes: 3, colours: DUST });
  if (frame === 0) glow(g, CX, CY, lerp(8, 11, p.size), ['#ffffff', '#ffffff', D.cream, D.steel]);
  scrap(g, { t, x: CX, y: CY, count: p.pieces, keep: 3, seed: 1, shape: p.style, dist: far, hop: lerp(4, 7, p.size), size: lerp(5.4, 8.6, p.size), spin: p.spin ? 1 : 0, from: 0.2, colour: p.body, rim: INK, box: [2, 2, 46, 46] });
}
