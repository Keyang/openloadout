// PORT (migration batch E2): the drawing of the code sprite sprites/wind-gust.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.wind-gust@1
// (engine/gen/fx-e2.js), which sprites/wind-gust.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, hash, fract, PI } from '../../../motion.js';
import { tone, mix } from '../colour.js';
import { PALETTE, swatches } from './palettes.js';
import { twinkle } from './fx.js';
import { taperLine } from './fx-trails.js';

const P = PALETTE.thornwood;
const CY = 32, LEFT = 3;                                 // the middle of the patch; where the streaks set off
// The specks ride along the streaks, so the two lists share no colour (stone left the streak list).
const STREAKS = [P.cream, P.haze, P.sky, P.magic, PALETTE.hearthvale.wheat];
const DUST = swatches('thornwood', 'ground', { lead: 'wood' });

/** Draws one frame of the effect as sprites/wind-gust.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  const C = [mix(p.core, '#ffffff', 0.6), p.core, p.core, mix(p.core, tone(p.core, -1), 0.6), tone(p.core, -1.2)];   // bright head, core, two darker steps to the tail
  const half = lerp(9, 25, p.spread);                                // how far the outer streaks sit from the middle
  const length = lerp(8, 26, p.length);
  const D = [tone(p.accent, 0.5), p.accent];
  const glints = [];                                                 // where glints sit this frame, to keep them apart
  // one lane per streak, spread over the height in an order that is not top to bottom, each on its own timer
  // and starting a little further in or out, so the gust never lines up into a staircase
  for (let i = 0; i < p.pieces; i++) {
    const lane = ((i * 0.618034 + 0.31) % 1) * 2 - 1, y = Math.round(CY + lane * half);
    const life = fract(t + (i + 0.4 * hash(i, 73)) / p.pieces);
    // every third streak is a long one, the rest short, so the lengths clearly differ
    const full = length * (i % 3 === 0 ? 1.15 + 0.15 * hash(i, 72) : 0.45 + 0.4 * hash(i, 72));
    const len = Math.max(3, Math.round(full * (1 - 0.35 * life)));
    const x0 = LEFT + len + Math.round(6 * hash(i, 71));
    const hx = Math.round(x0 + (61 - x0) * life);                    // the head slides to the right edge and shortens
    taperLine(g, hx, y, PI / 2, len, life > 0.75 ? C.slice(1) : C);

    if (p.style === 'dust') {
      // specks blown along beside the streak: a 2 px clump and a single speck, a row above or below it
      const side = hash(i, 74) < 0.5 ? -1 : 1;
      const ax = hx - Math.round(len * fract(0.25 + hash(i, 75) + 0.5 * life)), bx = hx - Math.round(len * fract(0.6 + hash(i, 76) + 0.5 * life));
      twinkle(g, ax, y + side, 0, D[0]); twinkle(g, ax + 1, y + side, 0, D[0]);
      twinkle(g, bx, y - side, 0, D[1]);
    } else if (p.style === 'glints' && i % 2 === 0) {
      // a twinkle riding the head, flaring up once on its own timer; never touching another glint
      const k = fract(t + hash(i, 77)), size = k < 0.12 ? 0 : k < 0.24 ? 1 : k < 0.36 ? 2 : k < 0.48 ? 1 : k < 0.6 ? 0 : -1;
      if (size < 0) continue;
      if (glints.some((o) => Math.max(Math.abs(o.x - hx), Math.abs(o.y - y)) < o.size + size + 4)) continue;
      glints.push({ x: hx, y, size });
      twinkle(g, hx, y, size, C[0], { core: '#ffffff' });
    }
  }
}
