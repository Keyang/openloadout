// Splash (core-sprites-1, batch K07): something falling into water, seen from the side. Frame 0 is the crown at its
// tallest with a foam heart; then the crown sinks, its drops arc out and fall back, and a flattened ring spreads
// along the water line (row 45); the last frame keeps a few drops on the line. The crown and the jet are the
// framework's `spikesIn` (engine/blast.js) painted as light in nested bands (`lightShape`, engine/shots.js), the
// drops are one-shot `particles` with gravity and the ring is `ring` with a squash (engine/fx.js); the colours are
// the `steps` chain without its white step, so the foam is the heart. Light only: no ink. This file is the
// three styles and the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, easeIn, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, particles, ring } from '../engine/fx.js';
import { spikesIn } from '../engine/blast.js';
import { lightShape } from '../engine/shots.js';

const P = PALETTE.thornwood;
const CX = 24.5, LINE = 45;                          // the middle column and the water line
const BOX = [1, 1, 47, LINE + 1];                    // nothing goes under the water line
// The foam sits on the water, so the two lists share no colour.
const FOAM = [P.cream, P.gold, P.wood, P.sky, P.steel];
const WATER = [...swatches('thornwood', 'water'), P.soil];

// The shape of each style: the crown's spikes, how high the drops fly and how far the ring runs.
function plan(p) {
  const s = p.size, w = p.spread;
  if (p.style === 'column') return { count: 3, arc: lerp(0.45, 0.8, w), H: lerp(26, 38, s), deep: 12, short: 0.4, width: lerp(4.5, 6, s), mound: lerp(5, 7, s),
    fly: lerp(20, 30, s), cone: lerp(0.8, 1.3, w), drops: p.pieces, size: 3, r1: lerp(10, 16, w) + 3 * s, rings: 1 };
  if (p.style === 'ripple') return { count: 3, arc: lerp(1.0, 1.4, w), H: lerp(5, 8, s), deep: 4, short: 0.7, width: 2.5, mound: lerp(4, 6, s),
    fly: lerp(8, 12, s), cone: lerp(1.6, 2.4, w), drops: Math.max(2, Math.round(p.pieces / 3)), size: 2, r1: lerp(12, 20, w) + 2 * s, rings: 2 };
  return { count: 5, arc: lerp(1.1, 1.5, w), H: lerp(15, 24, s), deep: 9, short: 0.72, width: lerp(3.5, 4.5, s), mound: lerp(6, 8, s),
    fly: lerp(14, 22, s), cone: lerp(1.7, 2.5, w), drops: p.pieces, size: 3, r1: lerp(12, 21, w) + 2 * s, rings: 1 };
}

export default defineSprite({
  id: 'splash-burst',
  name: 'Splash',
  kind: 'Effect',
  blurb: 'Something falling into water, seen from the side: a crown or jet of water whose drops arc out and fall back while a ring spreads along the surface. Change its size, drops, spread, style and colours.',
  meta: { type: 'effect', role: 'effects/dust', themes: ['neutral', 'underwater'], gameTypes: ['platformer', 'top-down-rpg', 'farming-sim', 'arcade'], view: 'side',
    words: ['splash', 'water', 'plunge', 'drops', 'droplets', 'ripple', 'dive', 'fall in', 'pond', 'lake', 'wet', 'mud'], license: 'draft' },
  size: [48, 48],
  pivot: [24, 46],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Drops', 6, { min: 3, max: 10, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'crown', ['crown', 'column', 'ripple']),
    core: color('Foam', P.cream, FOAM),
    edge: color('Water', P.water, WATER),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { burst: [{ sound: 'water-splash', preset: 'Diver', frame: 0, volume: 0.8 }] },
  versions: [
    { name: 'Splash', params: {} },
    { name: 'Big plunge', params: { style: 'column', size: 1, pieces: 10 } },
    { name: 'Pebble plop', params: { style: 'ripple', size: 0 } },
    { name: 'Mud splash', params: { core: P.wood, edge: P.soil } },
    { name: 'Lava splash', params: { core: P.gold, edge: P.ember } },
  ],

  render(g, { t, p }) {
    const C = steps(p.edge, { core: p.core, white: false });          // [foam, middle, water, dark water]
    const S = plan(p);
    // the ring along the water line: a flattened ellipse that runs out and breaks into arcs (two for a ripple)
    for (let j = 0; j < S.rings; j++) {
      const k = clamp((t - 0.08 - 0.3 * j) / (0.92 - 0.3 * j));
      if (t < 0.08 + 0.3 * j) continue;
      const r1 = S.r1 * (j ? 0.62 : 1);
      ring(g, { t: k, x: 24, y: LINE - 2, r0: 4, r1, thick: 2, squash: 0.12, seed: 3 + j, colours: C, box: BOX });
    }
    // the drops: thrown up out of the crown, falling back to rest on the line
    const from = LINE - S.H * 0.85;
    particles(g, { t, x: CX, y: from, count: S.drops, seed: p.style === 'ripple' ? 5 : 2, loop: false, stagger: 0.12,
      angle: PI, arc: S.cone, dist: S.fly, gravity: S.fly * 1.6 + S.H * 0.85, size: S.size, spread: 2, colours: C, box: BOX });
    // the crown (or jet) over its mound: tallest on frame 0, sinking into the water by t = 0.6
    const k = clamp(t / 0.6);
    if (k >= 1) return;
    const H = S.H * (1 - easeIn(k)), open = 1 + 0.35 * k;
    // the spikes fan out of a point under the water, so they rise from the surface apart and lean outward: a crown, not a flame
    const crown = spikesIn(CX, LINE + 0.5 + S.deep, { count: S.count, angle: PI, arc: S.arc * open, r0: S.deep, r1: S.deep + Math.max(1.5, H), short: S.short, width: S.width * (1 - 0.4 * k), belly: 0.55, blunt: 0.7 });
    const mw = S.mound * 1.15 + 4 * k, mh = Math.max(1.2, S.mound * 0.9 * (1 - k));
    const mound = (px, py) => py < LINE + 1 && ((px - CX) / mw) ** 2 + ((py - LINE - 0.5) / mh) ** 2 <= 1;
    lightShape(g, (px, py) => py < LINE + 1 && (crown(px, py) || mound(px, py)), C, { box: BOX });
  },
});
