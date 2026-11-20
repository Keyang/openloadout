// PORT (migration batch E2): the drawing of the code sprite sprites/sun-rays.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.sun-rays@1
// (engine/gen/fx-e2.js), which sprites/sun-rays.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, pulse, hash } from '../../../motion.js';
import { mix } from '../colour.js';
import { PALETTE, swatches } from './palettes.js';
import { rays, sparkles } from './fx.js';

const P = PALETTE.thornwood;
// The core runs down the middle of each ray, so the two lists share no colour.
const CORE = [P.cream, P.goblin, P.steel, P.skin, '#d8d8e0'];
const LIGHT = [...swatches('thornwood', 'glow', { lead: 'gold' }), P.sky, P.wood];

// Where the fan starts and which way it points: the source is a little above the frame (the gap in the canopy),
// straight above the middle or, slanted, to the top left; the rays enter at row 1 already apart.
const ABOVE = 9;
function fan(p) {
  const angle = lerp(0, 0.6, p.slant);                      // rig angle: 0 = down, towards PI / 2 = right
  const r0 = (ABOVE + 1.5) / Math.cos(angle);               // where a ray of the middle crosses row 1
  return { x: lerp(31.5, 10, p.slant), y: -ABOVE, angle, arc: lerp(0.2, 1, p.spread), r0, r1: r0 + lerp(40, 76, p.length) };
}

/** Draws one frame of the effect as sprites/sun-rays.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const F = fan(p);
  const C = [p.core, mix(p.core, p.edge, 0.5), p.edge, p.edge];     // hottest at the source; no dark rim on light
  const solid = p.style === 'solid';
  // dashed: the dashes run down the rays twice a loop; solid: the rays reach out and draw back once a loop
  const r1 = F.r1 - (solid ? (F.r1 - F.r0) * 0.22 * (1 - pulse(t)) : 0);
  // the rays start where they are two pixels apart, so a full fan never fills in at its source
  const start = Math.max(F.r0 - 2, p.pieces > 1 ? (2 * (p.pieces - 1)) / F.arc : 0);
  rays(g, { x: F.x, y: F.y, count: p.pieces, angle: F.angle, arc: F.arc, r0: start, r1, dash: 4, gap: solid ? 0 : 3, phase: 2 * t, seed: 3, colours: C });

  if (p.motes) {
    // dust: five specks, each in its own spot on a ray, glinting in turn
    for (let i = 0; i < 5; i++) {
      const k = p.pieces === 1 ? 0 : ((i * 3) % p.pieces) / (p.pieces - 1) - 0.5;
      const a = F.angle + (p.pieces === 1 ? 0 : k * F.arc), d = lerp(F.r0, F.r1, lerp(0.2, 0.7, hash(i, 81)));
      const x = Math.round(F.x + Math.sin(a) * d), y = Math.round(F.y + Math.cos(a) * d);
      sparkles(g, { t: t + i / 5, count: 1, seed: i, big: false, area: [x - 1, y - 1, x + 2, y + 2], colour: p.core });
    }
  }
}
