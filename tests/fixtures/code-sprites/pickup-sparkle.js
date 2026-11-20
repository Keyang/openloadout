// FROZEN COPY, not a sprite: sprites/pickup-sparkle.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Pickup sparkle (kit-platformer-fantasy, batch P13): twinkles for a collected thing, played over a
// pickup. `burst`: a white flash in the middle (frame 0, the biggest picture of the clip) and a ring of
// twinkles that spreads, drifts up and thins to single pixels, the same construction as the end of a
// pickup's own collect clip (engine/pickups.js collectBurst). `loop` (Shimmer): twinkles round a rare
// item flare up in turn. Every mark is the framework's sparkFlash, sparkMark, sparkRing and sparkOrbit
// (engine/bursts.js); this file is the sizes, the timing and the two clips. Pure white is on frame 0
// of the burst only.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp } from '../../../engine/motion.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { steps } from '../../../engine/fx.js';
import { SPARK_STYLES, sparkMark, sparkRing, sparkOrbit, sparkFlash } from '../../../engine/bursts.js';

const P = PALETTE.thornwood;
const M = 15.5;                                          // a pixel centre: the ring is the same on every side
// The bright middle of a twinkle sits inside its edge colour, so the two controls never offer the same colour.
const EDGE = swatches('thornwood', 'edge', { lead: 'gold' });
const CORE = [P.cream, P.skin, P.sky, P.goblin, P.steel].filter((c) => !EDGE.includes(c));

export default defineSprite({
  id: 'pickup-sparkle',
  name: 'Pickup sparkle',
  kind: 'Effect',
  blurb: 'Twinkles for a collected thing: a ring that spreads and fades, and a shimmer that loops round a rare item. Change the size, number, spread, style, drift and colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'turn-based-rpg', 'roguelike-action', 'arcade', 'puzzle'], view: 'none',
    words: ['sparkle', 'twinkle', 'glitter', 'shimmer', 'shine', 'glint', 'collect', 'pickup', 'reward', 'treasure', 'rare', 'magic', 'star'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Pieces', 6, { min: 4, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'plus', SPARK_STYLES),
    rise: range('Rise', 0.5, { lo: 'Low', hi: 'High' }),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.gold, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 8, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false },
    loop: { label: 'Shimmer', frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core, white: false });      // [core, middle, edge, rim]
    const reach = p.size > 0.7 ? 3 : 2;                           // the biggest a twinkle of the burst gets
    const scale = lerp(0.88, 1.12, p.size);
    // every mark is `full`: the core colour fills a twinkle up to its tips, so Core shows as much as Edge

    if (clip === 'loop') {
      sparkOrbit(g, { t, x: M, y: M + 1, count: p.pieces, r: lerp(6.5, 10.5, p.spread) * scale, rise: lerp(0, 4, p.rise), style: p.style, reach: p.size < 0.3 ? 2 : 3, full: true, seed: 2, colours: C });
      return;
    }
    // the ring: it starts round the flash, spreads fast and thins before it stops
    sparkRing(g, { t, x: M, y: M, count: p.pieces, r0: lerp(4, 5.5, p.size), r1: lerp(7, 11.5, p.spread) * scale, rise: lerp(0, 5, p.rise), style: p.style, reach, full: true, seed: 1, colours: C });
    // the flash in the middle: on frame 0 a white star as wide as the ring will get, the biggest picture of
    // the clip; then a twinkle that shrinks and is gone by frame 3
    if (frame === 0) sparkFlash(g, M, M, lerp(8, 10, p.size), p.style, C);
    else if (frame === 1) sparkMark(g, M, M, 3, p.style, C, { full: true });
    else if (frame === 2) sparkMark(g, M, M, 2, p.style, C, { full: true });
  },
});
