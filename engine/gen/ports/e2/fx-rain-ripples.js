// PORT (migration batch E2): the drawing of the code sprite sprites/rain-ripples.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.rain-ripples@1
// (engine/gen/fx-e2.js), which sprites/rain-ripples.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, fract, hash, TAU } from '../../../motion.js';
import { PALETTE, swatches } from './palettes.js';
import { steps, ring } from './fx.js';
import { wakeRing } from './water.js';

const P = PALETTE.thornwood;
const CX = 32, CY = 32;
const BOX = [1, 1, 63, 63];
// The foam sits on each ring, so the two lists share no colour.
const FOAM = [P.cream, P.sky, P.steel, '#d8d8e0'];
const WATER = swatches('thornwood', 'water');

// Where drop i strikes: spread over a disc of radius `reach` round the middle (sunflower order, so none crowd), flattened for the view.
function spot(i, n, reach, R) {
  const a = i * 2.39996 + hash(i, 3) * 0.6, d = reach * Math.sqrt((i + 0.5) / n) * (0.8 + 0.2 * hash(i, 4));
  const room = 30 - R - 4;                           // the lasting ring reaches 3.5 px past the ring
  return { x: Math.round(CX + Math.max(-room, Math.min(room, Math.cos(a) * d))), y: Math.round(CY + Math.max(-room * 1.2, Math.min(room * 1.2, Math.sin(a) * d * 0.8))) };
}

/** Draws one frame of the effect as sprites/rain-ripples.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const C = steps(p.edge, { core: p.core });                          // [white, foam, middle, water, dark water]
  const [white, foam, , water, rim] = C;
  const n = p.pieces, R = lerp(6, 9.5, p.size), reach = lerp(15, 25, p.spread);
  const rings = p.style !== 'splashes', splashes = p.style !== 'rings';
  for (let i = 0; i < n; i++) {
    const { x, y } = spot(i, n, reach, R);
    const life = fract(t + (i + 0.35 * hash(i, 9)) / n);             // evenly round the loop: the drops never strike together
    const r = R * (0.75 + 0.25 * hash(i, 5));
    if (rings) {
      ring(g, { t: life, x, y, r0: 2.5, r1: r, thick: 2, squash: 0.5, seed: i, colours: [white, foam, water, rim], box: BOX });
      // the faint ring that lingers after the first one has broken up
      if (life > 0.55) wakeRing(g, { x: x + 0.5, y: y + 0.5, rx: r + 1.5, ry: (r + 1.5) * 0.5, t: life, grow: 1, colour: rim, gaps: 0.55, seed: i });
    }
    if (splashes && life < 0.6) {
      // a tiny crown of four pixels round the strike, flung out a step and falling back as single drops
      const k = life / 0.6, d = (k < 0.3 ? 1 : k < 0.7 ? 2 : 3) * lerp(1, 1.8, p.size);
      const c = k < 0.3 ? white : k < 0.7 ? foam : water;
      if (k < 0.3) g.dot(x, y, foam);
      for (let j = 0; j < 4; j++) { const a = TAU * (j + 0.5) / 4; g.dot(Math.round(x + Math.cos(a) * d * 1.2), Math.round(y + Math.sin(a) * d * 0.7), c); }
    }
  }
}
