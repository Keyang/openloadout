// Sun rays (core-sprites-1, batch K08): an area loop of light falling from the top left through a canopy, a window
// or a hole in a ceiling. 1 px rays fan down from one point (engine/fx.js `rays`), brightest at their source: dashed,
// the dashes run down them twice per loop; solid, the rays are unbroken and swell. With Dust on, specks glint in the
// light (`sparkles`, each in a small spot on a ray). Light only: no ink and no fill between the rays. This file is
// the fan, the slant and the timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, pulse, hash } from '../engine/motion.js';
import { mix } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { rays, sparkles } from '../engine/fx.js';

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

export default defineSprite({
  id: 'sun-rays',
  name: 'Sun rays',
  kind: 'Effect',
  blurb: 'Shafts of light falling through a canopy, a window or a hole in a ceiling, with dashes running down them or a slow swell, and dust glinting in the light. Change the number of rays, their length, spread and slant, the style and the colours.',
  meta: { type: 'effect', role: 'environment/lighting', themes: ['neutral', 'forest', 'dungeon'], gameTypes: ['platformer', 'top-down-rpg', 'puzzle', 'farming-sim'], view: 'none',
    words: ['sun rays', 'sunbeam', 'light shaft', 'god rays', 'moonlight', 'window light', 'shine', 'dust', 'glow', 'holy'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 32],
  grounded: false,
  params: {
    pieces: range('Rays', 4, { min: 1, max: 7, step: 1, lo: 'Few', hi: 'Many' }),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    slant: range('Slant', 0.5, { lo: 'Straight down', hi: 'Slanted' }),
    style: choice('Style', 'dashed', ['dashed', 'solid']),
    motes: toggle('Dust', false),
    core: color('Core', P.cream, CORE),
    edge: color('Light', P.gold, LIGHT),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    loop: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },
  versions: [
    { name: 'Sunbeams', params: {} },
    { name: 'Moonlight', params: { edge: P.sky } },
    { name: 'Holy light', params: { style: 'solid', pieces: 7 } },
    { name: 'Dusty attic', params: { motes: true, slant: 1, edge: P.wood } },
    { name: 'Single shaft', params: { pieces: 1, spread: 0 } },
  ],

  render(g, { t, p }) {
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
  },
});
