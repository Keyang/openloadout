// PORT (migration batch E2): the drawing of the code sprite sprites/fireflies.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims and at the E2 copies of the engine helpers (engine/gen/ports/e2/), so
// it draws paint refs on an engine/gen/port-surface.js grid. It is the drawing of the effect generator effect.fireflies@1
// (engine/gen/fx-e2.js), which sprites/fireflies.json names; it goes only with the last version that draws with it. Its
// settings (p) are that generator's arguments; its colours are the paint refs the data file names. A HAND CHANGE note
// says where it differs from its source; never change what a released generator version draws through it.
import { lerp, hash, fract, wave, TAU } from '../../../motion.js';
import { PALETTE, swatches } from './palettes.js';
import { tone, mix } from '../colour.js';
import { glow, twinkle } from './fx.js';

const P = PALETTE.thornwood;
const CX = 32, CY = 33;
// radii that give round discs on a pixel centre: a plus (5 px), 5 px across, 7 px across, 9 px across
const ROUND = [1.2, 2.3, 3.3, 4.3];
// The core sits inside its glow, so the two lists share no colour.
const CORE = [P.cream, P.goblin, P.sky, P.steel, '#d8d8e0'];
const GLOW = swatches('thornwood', 'glow', { lead: 'moss' });

// Where light i is at phase t: a loop round its home, wider sideways than up, rising as it goes out and sinking back.
function place(i, t, p) {
  const h = (ch) => hash(i, 90 + ch);
  const roam = lerp(12, 24, p.spread);
  const hx = CX + (fract(i * 0.618034 + 0.2) - 0.5) * 2 * roam, hy = CY + (h(1) - 0.5) * roam * 1.5;
  // the fewer the lights, the wider each one wanders, so even a lone firefly crosses its patch
  const a = TAU * (t + h(2)), turn = h(3) < 0.5 ? 1 : -1, wide = (p.pieces === 1 ? 12 : 9) / Math.sqrt(p.pieces);   // a lone light roams the widest
  return { x: hx + turn * Math.sin(a) * (lerp(1, 3, h(4)) + wide), y: hy + Math.cos(a) * (lerp(1, 2.5, h(5)) + wide * 0.4) - 1.5 * wave(t, h(6)) };
}

// How bright light i is at phase t, 0 (out) to 1: a slow glow and dim, with blinks out that Flicker adds.
function level(i, t, p) {
  const h = (ch) => hash(i, 120 + ch);
  const slow = 0.6 + 0.4 * Math.cos(TAU * (t + h(1)));
  const off = fract(2 * t + h(2)) < lerp(0, 0.3, p.flicker) * (0.6 + 0.8 * h(3));   // blinks out twice a loop, longer with more flicker
  return off ? 0 : slow;
}

/** Draws one frame of the effect as sprites/fireflies.js did: g (a PortSurface), { clip, t, frame, p } (p the settings, colours as paint refs). */
export function render(g, { t, p }) {
  // one or two lights leave a short trail of fading dots along the path they just flew, as fireflies do on a
  // long look; a crowd does not (the trails would tangle)
  const tail = p.pieces === 1 ? 8 : p.pieces === 2 ? 3 : 0;
  for (let i = 0; i < p.pieces; i++) {
    for (let k = tail; k >= 1; k--) {
      const q = place(i, t - 0.05 * k, p), fade = k / (tail + 1);
      twinkle(g, Math.floor(q.x) + 0.5, Math.floor(q.y) + 0.5, 0, mix(p.glow, tone(p.glow, -1), fade));
    }
  }
  for (let i = 0; i < p.pieces; i++) {
    const { x, y } = place(i, t, p), lv = level(i, t, p);
    const px = Math.floor(x) + 0.5, py = Math.floor(y) + 0.5;            // on a pixel centre: round, the same on every side
    if (p.style === 'specks') {
      // a single dot that blinks: a plus at its brightest, a dot when dim, a dim dot when out
      twinkle(g, px, py, lv > 0.85 && p.size > 0.3 ? 1 : 0, lv > 0 ? p.glow : p.core, { core: p.core });
      if (p.size > 0.65 && lv > 0.5) twinkle(g, px + 1, py, 0, p.glow);   // big specks are two pixels wide
      continue;
    }
    if (p.style === 'wisps') {
      // a pale mote with a ring of glow round it; out, only the mote is left
      const r = ROUND[Math.min(3, Math.round(lerp(1, 3, p.size) * (lv > 0 ? lerp(0.7, 1, lv) : 0.5)))];
      glow(g, px, py, r, lv > 0 ? [p.core, p.core, p.glow] : [p.core, p.core]);
      continue;
    }
    // a firefly: a pale core in a disc of glow that swells and shrinks with its level; out, a dim dot of glow
    if (lv === 0) { twinkle(g, px, py, 0, p.core); continue; }
    const k = Math.round(lerp(0.4, 2.4, p.size)) - (lv < 0.6 ? 1 : 0);   // a step smaller while it dims
    if (k < 0) { twinkle(g, px, py, 1, p.glow, { core: p.core }); continue; }
    glow(g, px, py, ROUND[k], [p.core, p.glow, p.glow]);
  }
}
