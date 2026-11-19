// Fire spell: a battle effect in two clips. `burst` is for the target: fire erupts from the
// ground line, holds with licking tongues and falls into rising embers. `cast` is small, for the
// caster's hand: sparks gather into a flame. No ink outline: the fire is the framework's layered
// flame (engine/fx.js `flame`), the gathering sparks are engine/spells.js `swirl`; this file is
// the three styles and the timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, pulse, clamp, hash, PI, TAU } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, flame, particles, glow } from '../engine/fx.js';
import { swirl } from '../engine/spells.js';

const P = PALETTE.hearthvale;
const CX = 32, FLOOR = 58;                               // the ground row: the fire stands on the row above it
const ABOVE = [1, 1, 63, FLOOR];                         // everything that stands on the ground is cut off flat at it
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('hearthvale', 'edge', { lead: 'fire' });
const CORE = [P.thunder, P.cream, P.skin, P.sky].filter((c) => !EDGE.includes(c));

// How tall and how wide the fire is on each of the ten frames of `burst`, as shares of its full size:
// it erupts (0 to 2, overshooting), holds (3 to 5) and falls (6 to 8); frame 9 is embers only.
const TALL = [0.3, 0.8, 1.1, 1, 0.96, 1, 0.68, 0.4, 0.17, 0];
const WIDE = [1.15, 1.05, 0.95, 1, 1, 1, 0.9, 0.75, 0.5, 0];

export default defineSprite({
  id: 'fx-fire-spell',
  name: 'Fire spell',
  kind: 'Effect',
  blurb: 'A fire spell for a battle screen: flames erupt under the target, and sparks gather into a flame in the caster\'s hand. Change its size, height, tongues, style, embers, flicker and colours.',
  meta: { type: 'effect', role: 'effects/magic', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'roguelike-action', 'platformer'], view: 'side',
    words: ['fire', 'flame', 'spell', 'magic', 'burn', 'blaze', 'pillar', 'eruption', 'ember', 'cast', 'attack', 'inferno', 'hot'], license: 'draft' },
  size: [64, 64],
  pivot: [CX, FLOOR],
  sounds: {
    burst: [{ sound: 'wyrm-roar', preset: 'Fire breath', frame: 1, volume: 0.8 }],
    cast: [{ sound: 'magic-spell', preset: 'Quick zap', frame: 1, volume: 0.8 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    pieces: range('Tongues', 5, { min: 3, max: 7, step: 1, lo: 'Few', hi: 'Many' }),
    style: choice('Style', 'pillar', ['pillar', 'ball', 'ring']),
    sparks: toggle('Embers', true),
    core: color('Core', P.thunder, CORE, { material: 'fire' }),   // flame: a look keeps it a fire colour
    edge: color('Edge', P.fire, EDGE, { material: 'fire' }),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 10, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false },
    cast: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core, white: false });            // [core, middle, edge, rim]
    const hot = steps(p.edge, { core: p.core });                        // the same with a white heart, for the flash
    const sway = lerp(0.4, 2.2, p.flicker);
    const dip = (ph) => 1 - lerp(0.02, 0.22, p.flicker) * pulse(3 * t, ph);   // each tongue ducks on its own beat
    const n = p.pieces;

    if (clip === 'cast') {
      // sparks spiral in to a point over the hand (0 to 3), flash (4), and a small flame burns there (5 to 7)
      const fx = CX, fy = 47, R = lerp(3.2, 5, p.size), L = lerp(9, 15, p.height) * lerp(0.9, 1.1, p.size);
      if (frame <= 4) swirl(g, { t: clamp(frame / 3.6), x: fx, y: fy, count: n + 3, seed: 2, r0: lerp(13, 19, p.size), r1: 1.5, turns: 0.4, size: 3, tail: 3, colours: C });
      if (frame === 3) glow(g, fx, fy, R * 0.8, [C[0], C[1], C[2]]);
      if (frame >= 4) {
        const k = [0.55, 1.12, 0.95, 1][frame - 4];
        const tongues = [{ angle: PI, length: (R + L) * k * dip(0), width: R * 0.85, phase: 0 }];
        for (let i = 1; i < Math.min(n, 5); i++) {
          const s = i % 2 ? 1 : -1, u = Math.ceil(i / 2) / 2;
          tongues.push({ angle: PI + s * 0.32 * u, length: (R + L) * k * (0.78 - 0.2 * u) * dip(0.3 * i), width: R * 0.5, phase: 0.37 * i, sway: sway * 0.6, at: [s * R * 0.55 * u, 0] });
        }
        if (p.sparks) particles(g, { t: (frame - 4) / 3, x: fx, y: fy - R, loop: false, count: 5, seed: 6, stagger: 0.5, angle: PI, arc: 1.5, dist: L + 6, gravity: -3, size: 2.4, colours: C });
        flame(g, { t, x: fx, y: fy + 1, head: R * Math.min(1, k + 0.2), tongues, sway, cycles: 2, heat: 0.55, colours: C });
        if (frame === 4) glow(g, fx, fy + 1, R + 2, hot);
      }
      return;
    }

    // ---- burst ----
    const W = lerp(9, 14.5, p.size);                         // half the width of the fire's foot
    const H = lerp(30, 45, p.height) * lerp(0.94, 1.06, p.size);
    const tall = TALL[frame], wide = WIDE[frame];

    // where embers leave the fire: its middle, or the middle of the ball
    const ballR = W * 0.86 * Math.min(1, 0.45 + tall * 0.6) * (frame >= 6 ? wide : 1);
    const ballY = FLOOR - ballR - 1 - H * 0.36 * Math.min(1.05, tall);
    const ex = p.style === 'ring' ? W * 1.3 : W * 0.6, ey = p.style === 'ball' ? Math.min(ballY, FLOOR - 6) : FLOOR - H * 0.25;
    // embers first, so the fire covers the ones still inside it: a steady stream while it burns, thinning out at the end
    const stream = [0, 0.7, 1, 1, 1, 1, 1, 0.8, 0.6, 0.4][frame];
    if (p.sparks && stream > 0) particles(g, { t, x: CX, y: ey, count: 10, seed: 3, cycles: 2, lifespan: 0.75, spread: ex, angle: PI, arc: 1.2, dist: H * 0.8 + 8, gravity: -5, wobble: 2, size: 4.4 * stream, colours: C });
    // what the falling fire leaves: a few embers that climb and cool (they do not depend on the toggle)
    if (frame >= 5) particles(g, { t: (frame - 5) / 4, x: CX, y: ey, loop: false, count: 6, seed: 8, stagger: 0.3, spread: ex, angle: PI, arc: 1.5, dist: H * 0.8, gravity: -4, wobble: 1.5, size: 4.4, colours: C });
    // and two wisps of flame that come loose from its top and shrink as they rise
    if (frame >= 6 && frame <= 8) {
      const k = frame - 6, up = H * (0.5 + 0.17 * k);
      flame(g, { t, x: CX, y: FLOOR - up, sway: sway * 0.6, cycles: 3, heat: 0.4, colours: C, box: ABOVE,
        tongues: [{ angle: PI - 0.15, length: 9 - 2.5 * k, width: 2.6 - 0.6 * k, phase: 0.2, at: [-W * 0.42, k] }, { angle: PI + 0.2, length: 7 - 2 * k, width: 2.2 - 0.5 * k, phase: 0.7, at: [W * 0.4, -3 - 2 * k] }] });
    }

    if (tall > 0) {
      if (p.style === 'ball') {
        // a ball of fire that swells up off the ground, flames streaming from its top
        const R = ballR, cy = ballY;
        const tongues = [{ angle: PI, length: (R + H * 0.34) * Math.min(1.1, tall + 0.1) * dip(0), width: R * 0.8, phase: 0 }];
        for (let i = 1; i < n; i++) {
          const s = i % 2 ? 1 : -1, u = Math.ceil(i / 2) / Math.ceil((n - 1) / 2);
          tongues.push({ angle: PI + s * 0.75 * u, length: (R + H * 0.24 * (1.1 - 0.5 * u)) * Math.min(1.1, tall + 0.1) * dip(0.23 * i), width: R * 0.5, phase: 0.37 * i, sway: sway * 0.7, at: [s * R * 0.5 * u, -R * 0.3 * (1 - u)] });
        }
        flame(g, { t, x: CX, y: cy, head: R, tongues, sway, cycles: 3, heat: 0.55, colours: C, box: ABOVE });
      } else if (p.style === 'ring') {
        // a ring of flames round the target's feet: the far half first and shorter, the near half over it
        const rx = W * 1.45, ry = 4.5, total = 2 * n;
        const at = (i) => { const a = TAU * ((i + 0.5) / total) + 0.25 * Math.sin(TAU * t); return [Math.cos(a) * rx * wide, Math.sin(a) * ry, a]; };
        for (const near of [false, true]) {
          const tongues = [];
          for (let i = 0; i < total; i++) {
            const [ox, oy] = at(i);
            if ((oy > 0) !== near) continue;
            const depth = 0.72 + 0.28 * ((oy + ry) / (2 * ry));          // the far ones are smaller
            tongues.push({ angle: PI + 0.1 * (ox / rx), length: H * 0.72 * tall * depth * (0.8 + 0.3 * hash(i, 5)) * dip(0.19 * i), width: lerp(3, 4.4, p.size) * depth, phase: hash(i, 7), at: [ox, oy] });
          }
          flame(g, { t, x: CX, y: FLOOR - ry - 1, tongues, sway, cycles: 3, heat: 0.5, colours: C, box: ABOVE });
        }
      } else {
        // a pillar: tongues side by side, the tallest in the middle, standing a little into the ground
        const tongues = [];
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;                  // -1 at the left .. 1 at the right
          const len = H * tall * (1 - 0.34 * Math.abs(u) ** 1.5) * (0.84 + 0.2 * hash(i, 3)) * dip(0.23 * i);
          tongues.push({ angle: PI + 0.05 * u, length: len + 3, width: Math.max(2.6, (W * wide * 1.3) / n + 1.4), phase: hash(i, 4), at: [u * W * wide * 0.72, 0] });
        }
        // the middle tongue last, so it reads in front
        flame(g, { t, x: CX, y: FLOOR + 2, tongues, sway, cycles: 3, heat: 0.6, colours: C, box: ABOVE });
      }
    }
    // frame 0: the white-hot flash on the ground where it breaks out; a low glow stays under the fire while it burns
    if (frame === 0) glow(g, CX, FLOOR, W * 0.95, hot, { box: ABOVE });
    else if (frame <= 2 && p.style !== 'pillar') glow(g, CX, FLOOR + 1, W * 0.6 * (3 - frame) * 0.5, C, { box: ABOVE });
  },
});
