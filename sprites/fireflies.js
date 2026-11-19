// Fireflies (core-sprites-1, batch K08): an area loop of small lights over a pond, a meadow or a night path. Each
// light wanders on its own closed path (drifting up and to one side and back, so the loop closes), glows, dims and
// blinks on its own timer. Fireflies are a pale core in a disc of glow (engine/fx.js `glow`), wisps are bigger pale
// motes with a ring of glow, specks are single blinking dots (`twinkle`). Light only: no ink. This file is the
// paths, the blink timing and the sizes.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, hash, fract, wave, TAU } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { tone, mix } from '../engine/color.js';
import { glow, twinkle } from '../engine/fx.js';

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

export default defineSprite({
  id: 'fireflies',
  name: 'Fireflies',
  kind: 'Effect',
  blurb: 'Small lights drifting over a pond, a meadow or a night path, each glowing, dimming and blinking on its own, as a patch to place where it is dark. Change the size of the glow, how many, how far they roam, the style, the flicker and the colours.',
  meta: { type: 'effect', role: 'environment/lighting', themes: ['neutral', 'forest', 'farm'], gameTypes: ['top-down-rpg', 'platformer', 'farming-sim', 'puzzle'], view: 'none',
    words: ['fireflies', 'lights', 'glow', 'wisps', 'will o wisp', 'night', 'summer', 'pond', 'meadow', 'blink', 'magic', 'spirits'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Lights', 5, { min: 1, max: 9, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'fireflies', ['fireflies', 'wisps', 'specks']),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    core: color('Core', P.cream, CORE),
    glow: color('Glow', P.moss, GLOW),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Fireflies', params: {} },
    { name: 'Spirit wisps', params: { style: 'wisps', glow: P.magic } },
    { name: 'Dust in light', params: { style: 'specks', glow: P.gold, pieces: 9 } },
    { name: 'Night swarm', params: { pieces: 9, spread: 1 } },
    { name: 'Lone firefly', params: { pieces: 1, spread: 0 } },
  ],

  render(g, { t, p }) {
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
  },
});
