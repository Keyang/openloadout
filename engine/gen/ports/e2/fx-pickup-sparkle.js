// PORT (migration batch E2): the drawing of the code sprite sprites/pickup-sparkle.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.pickup-sparkle@1
// (engine/gen/fx-e2.js), which sprites/pickup-sparkle.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp } from '../../../motion.js';
import { PALETTE, swatches } from './palettes.js';
import { steps } from './fx.js';
import { SPARK_STYLES, sparkMark, sparkRing, sparkOrbit, sparkFlash } from './bursts.js';

const P = PALETTE.thornwood;
const M = 15.5;                                          // a pixel centre: the ring is the same on every side
// The bright middle of a twinkle sits inside its edge colour, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'edge', { lead: 'gold' });
const CORE = [P.cream, P.skin, P.sky, P.goblin, P.steel].filter((c) => !EDGE.includes(c));

/** Draws one frame of the effect as sprites/pickup-sparkle.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, t, frame, p }) {
  const C = steps(p.edge, { core: p.core, white: false });      // [core, middle, edge, rim]
  const reach = p.size > 0.7 ? 3 : 2;                           // the biggest a twinkle of the burst gets
  const scale = lerp(0.88, 1.12, p.size);
  // every mark is `full`: the core colour fills a twinkle up to its tips, so Core shows as much as Edge

  if (clip === 'loop') {
    sparkOrbit(g, { t, x: M, y: M + 1, count: p.pieces, r: lerp(6.5, 10.5, p.spread) * scale, rise: lerp(0, 4, p.rise), style: p.style, reach: p.size < 0.3 ? 2 : 3, full: true, seed: 2, colours: C });
    return;
  }
  // the ring: it starts round the flash, spreads fast and thins before it stops
  sparkRing(g, { t, x: M, y: M, count: p.pieces, r0: lerp(4, 5.5, p.size), r1: lerp(7, 11.5, p.spread) * scale, rise: lerp(0, 5, p.rise), style: p.style, reach, full: true, seed: 1, colours: C });
  // the flash in the middle: on frame 0 a white star as wide as the ring will get, the biggest picture of
  // the clip; then a twinkle that shrinks and is gone by frame 3
  if (frame === 0) sparkFlash(g, M, M, lerp(8, 10, p.size), p.style, C);
  else if (frame === 1) sparkMark(g, M, M, 3, p.style, C, { full: true });
  else if (frame === 2) sparkMark(g, M, M, 2, p.style, C, { full: true });
}
