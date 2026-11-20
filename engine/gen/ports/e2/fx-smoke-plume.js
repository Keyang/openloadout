// PORT (migration batch E2): the drawing of the code sprite sprites/smoke-plume.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.smoke-plume@1
// (engine/gen/fx-e2.js), which sprites/smoke-plume.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp } from '../../../motion.js';
import { mix, tone } from '../colour.js';
import { PALETTE } from './palettes.js';
import { steps } from './fx.js';
import { plume } from './fumes.js';

const P = PALETTE.thornwood;
const CX = 24, FOOT = 44.5;                      // the column's foot: the middle of row 45 (its rim lands on row 46)
// Light and dark puffs touch in the column, so the two lists share no colour.
const LIGHT = [P.cream, P.haze, P.sky, '#d8d8e0'];
const DARK = [P.stone, P.slate, P.cavern, '#6b7280', P.moss];

// The colours of the column, lightest first, the rim last.
function colours(p) {
  if (p.style === 'soot') return [mix(p.core, p.edge, 0.55), p.edge, tone(p.edge, -0.6), tone(p.edge, -1.4)];      // dark: the light colour only tints the young puffs
  if (p.style === 'steam') { const m = mix(p.core, p.edge, 0.35); return [p.core, mix(p.core, m, 0.5), m, tone(m, -1.2)]; }   // pale all the way up
  return steps(p.edge, { core: p.core, white: false });
}

// The column's settings for this look: steam is quick and thin, soot slow and lumpy.
function column(p, t) {
  const steam = p.style === 'steam', soot = p.style === 'soot';
  return {
    t, x: CX, y: FOOT, count: p.pieces, seed: 5, cycles: steam ? 2 : 1,
    rise: lerp(26, 35, p.size) * (soot ? 0.9 : 1), drift: lerp(0, 13, p.drift), sway: steam ? 0.6 : 1.2,
    size: lerp(3.2, 5.6, p.size) * (steam ? 0.85 : soot ? 1.05 : 1), shape: steam ? 'wispy' : soot ? 'lumpy' : 'round',
    colours: colours(p),
  };
}

/** Draws one frame of the effect as sprites/smoke-plume.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { clip, t, p }) {
  if (clip === 'loop') plume(g, column(p, t));
  else plume(g, { ...column(p, t), stop: 0 });          // starts as loop frame 0; no puff is born after it, so it ends on one wisp
}
