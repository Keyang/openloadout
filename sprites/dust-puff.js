// Dust puff: dust on the ground line, for landing, running and sliding down a wall. Every puff
// is the framework's `puffs` (engine/fx.js); this file sets where they start, which way they go
// and how the three clips differ.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, puffs } from '../engine/fx.js';

const P = PALETTE.thornwood;
const CX = 16, FLOOR = 30;                               // the ground row: the lowest rim pixels sit on it
// The light top of a puff sits on its darker body, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'ground', { lead: 'stone' });
const CORE = [P.cream, P.skin, P.steel, P.gold].filter((c) => !EDGE.includes(c));

export default defineSprite({
  id: 'dust-puff',
  name: 'Dust puff',
  kind: 'Effect',
  blurb: 'Dust kicked up on the ground: a landing burst, a running puff and a wall-slide trickle. Change its size, number of puffs, spread, style, rise and colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'roguelike-action', 'arcade'], view: 'side',
    words: ['dust', 'puff', 'smoke', 'cloud', 'land', 'landing', 'run', 'skid', 'slide', 'jump', 'kick', 'dirt', 'footstep'], license: 'draft' },
  size: [32, 32],
  pivot: [CX, FLOOR],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 4, { min: 2, max: 6, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'round', ['round', 'wispy', 'chunky']),
    rise: range('Rise', 0.5, { lo: 'Low', hi: 'High' }),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.stone, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { label: 'Landing', frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
    kick: { label: 'Running', frames: 4, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false },
    slide: { label: 'Wall slide', frames: 6, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },

  render(g, { clip, t, p }) {
    const colours = steps(p.edge, { core: p.core, white: false });     // [light top, body, shade, rim]
    const size = lerp(2.5, 4, p.size), n = p.pieces;
    const common = { t, shape: p.style, floor: FLOOR, colours, lobes: 3 };

    if (clip === 'burst') {
      // two groups shoot out left and right along the ground, rise a little and thin out
      const dist = lerp(7, 12.5, p.spread) * (1 - 0.3 * p.size), rise = lerp(1, 9, p.rise);   // big puffs travel less, to stay in the frame
      puffs(g, { ...common, x: CX - 1, y: FLOOR - 2, count: Math.ceil(n / 2), seed: 1, stagger: 0.18, angle: -PI / 2, arc: 0.3, dist, rise, size });
      puffs(g, { ...common, x: CX + 1, y: FLOOR - 2, count: Math.floor(n / 2), seed: 2, stagger: 0.18, angle: PI / 2, arc: 0.3, dist, rise, size });
    } else if (clip === 'kick') {
      // a small puff (and a smaller one after it) behind a running heel, drifting back and up; the runner faces right
      puffs(g, { ...common, x: CX + 3, y: FLOOR - 2, count: 2 + Math.floor((n - 2) / 2), seed: 4, stagger: 0.3, angle: -PI / 2 - 0.3, arc: 0.5, dist: lerp(5, 11, p.spread), rise: lerp(1, 8, p.rise), size: size * 0.85 });
    } else {
      // a steady trickle rising up the wall, each puff on its own timer
      puffs(g, { ...common, lobes: 2, loop: true, x: CX, y: FLOOR - 2, count: n, seed: 6, angle: PI + 0.12, arc: lerp(0.15, 0.7, p.spread), dist: lerp(11, 22, p.rise), rise: 0, size: size * 0.78 });
    }
  },
});
