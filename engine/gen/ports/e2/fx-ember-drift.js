// PORT (migration batch E2): the drawing of the code sprite sprites/ember-drift.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.ember-drift@1
// (engine/gen/fx-e2.js), which sprites/ember-drift.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, PI } from '../../../motion.js';
import { mix, tone } from '../colour.js';
import { PALETTE } from './palettes.js';
import { steps, particles } from './fx.js';
import { motes } from './spells.js';

const P = PALETTE.thornwood;
const CX = 32, ROOT = 60;                                // embers rise from this row, in a column round the middle
// The core sits inside each ember, so the two lists share no colour: gold stays in the core list only.
const CORE = [P.gold, P.cream, P.skin, P.steel];
const EDGE = [P.ember, P.magic, P.crimson, P.thorn, P.moss, P.stone];

/** Draws one frame of the effect as sprites/ember-drift.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const C = steps(p.edge, { core: p.core, white: false });          // [core, middle, ember, dark ember]
  const half = lerp(11, 24, p.spread);                                // how far either side of the middle they start
  const up = lerp(34, 56, p.rise);                                   // how high the highest climbs
  const box = [1, 1, 63, ROOT + 2];
  if (p.style === 'sparks') {
    motes(g, { t, x: CX, y: ROOT - 1, count: p.pieces, seed: 4, rise: up, width: 2 * half, size: lerp(3, 5.6, p.size), shape: 'plus', sway: 2.5, colours: C, box });
    return;
  }
  const ash = p.style === 'ash';
  // ash: grey flakes with no hot core, slower and more fluttery; embers: hot beads that cool as they rise
  const colours = ash ? [mix(p.core, P.stone, 0.45), mix(p.edge, P.stone, 0.5), tone(mix(p.edge, P.stone, 0.5), -0.8)] : C;
  particles(g, { t, x: CX, y: ROOT, count: p.pieces, seed: ash ? 6 : 2, angle: PI, arc: 0.35, dist: up * 0.55, gravity: -up * 0.45,
    spread: half, wobble: ash ? 3.5 : 2, size: lerp(3.6, 6, p.size), colours, box });
}
