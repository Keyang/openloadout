// FROZEN COPY, not a sprite: sprites/blaster-bolt.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Blaster bolt: the player's shot, a short bar of light with a pale core, a rim of its glow colour
// and no ink outline. Drawn pointing right and the same above and below its centre line, so a game
// can turn it to any angle. It flickers in length; `hit` flattens it against what it struck, then
// opens into a small ring with four sparks. The light is the framework's (engine/shots.js
// `lightShape`, engine/fx.js); this file is the three shapes, the sizes and the timing.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp, PI } from '../../../engine/motion.js';
import { ellipseIn, capsuleIn, polyIn } from '../../../engine/surface.js';
import { anyIn } from '../../../engine/shapes.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { steps, streaks, ring, starburst } from '../../../engine/fx.js';
import { lightShape } from '../../../engine/shots.js';

const P = PALETTE.derelict;
const LEFT = -PI / 2;                                    // the way the trail streams
const HIT_X = 17.5, HIT_Y = 7.5;                         // where the bolt lands in `hit`: a pixel centre near the middle, so the ring has room and the sparks come out even
// The core sits inside the glow, so the two controls never offer the same colour, and every core is lighter than every glow.
const GLOW = swatches('derelict', 'glow');
const CORE = [P.cream, P.suit, P.skin, P.steel].filter((c) => !GLOW.includes(c));

// The bolt's shape for one style, from its tail end xt to its nose xh, `rows` px thick about the line cy.
function shapeOf(style, xt, xh, cy, rows) {
  const half = rows / 2, L = xh - xt;
  if (style === 'needle') {
    // a spindle: sharp at both ends, widest a third of the way back from the nose
    const xw = xh - L * 0.32;
    return polyIn([[xt, cy], [xw, cy - half], [xh, cy], [xw, cy + half]]);
  }
  if (style === 'pulse') {
    // three beats of one burst: a fat head, a dash and a dot, each smaller than the one in front
    const head = Math.max(5, Math.round(L * 0.42)), dash = Math.max(3, Math.round(L * 0.24));
    const x1 = xh - head - 2, x0 = x1 - dash - 2, small = Math.max(1, half - 0.5);
    return anyIn(capsuleIn(xh - head + half, cy, xh - half, cy, half), capsuleIn(x1 - dash + small, cy, x1 - small, cy, small), capsuleIn(xt + small, cy, Math.max(xt + small, x0 - small), cy, small));
  }
  // bolt: a round-nosed bar whose last third thins to a point, so even standing still it has a front and a back
  const xb = xt + L * 0.38;
  return anyIn(capsuleIn(xb, cy, xh - half, cy, half), capsuleIn(xt + 0.5, cy, xb, cy, 0.5, half));
}

export default defineSprite({
  id: 'blaster-bolt',
  name: 'Blaster bolt',
  kind: 'Effect',
  blurb: 'A bar of light fired by a blaster, drawn pointing right so a game can turn it to any angle; it bursts into a ring and four sparks. Change its length, thickness, style, trail and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'top-down',
    words: ['bolt', 'laser', 'blaster', 'shot', 'bullet', 'energy', 'pulse', 'zap', 'shoot', 'fly', 'hit', 'player shot', 'bright'], license: 'draft' },
  size: [32, 16],
  pivot: [16, 8],
  grounded: false,
  preview: 'fly',
  params: {
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    thickness: range('Thickness', 0.5, { lo: 'Thin', hi: 'Chunky' }),
    style: choice('Style', 'bolt', ['bolt', 'pulse', 'needle']),
    trail: toggle('Trail', true),
    core: color('Core', P.cream, CORE),
    glow: color('Glow', P.cyan, GLOW),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 4, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 5, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const rows = Math.round(lerp(3, 5.4, p.thickness));  // px across the light, without its rim
    const half = rows / 2, cy = 8 - Math.ceil(rows / 2) + half;
    const [white, core, , glow, rim] = steps(p.glow, { core: p.core });
    const light = [core, glow, rim];

    if (clip === 'hit') {
      const reach = lerp(7, 9.2, p.length);              // how far the four sparks fly
      const spark = (o) => starburst(g, { x: HIT_X, y: HIT_Y, count: 4, turn: PI / 4, ...o });
      if (frame === 0) {
        // flattened against what it hit: a tall thin oval, white hot, with a stub of the bar still behind it
        lightShape(g, anyIn(ellipseIn(HIT_X, cy, 2.5, Math.min(6, half + 3)), capsuleIn(HIT_X - 6, cy, HIT_X, cy, Math.max(1, half - 1))), [white, core, glow, rim]);
        return;
      }
      // a small ring opens where it struck; the four sparks fly out past it along the diagonals
      const R = lerp(3.5, 5, p.thickness);
      ring(g, { t: (frame - 1) / 3, x: HIT_X, y: HIT_Y, r0: 2, r1: R, thick: 2, seed: 4, colours: [core, glow, glow, rim] });
      if (frame === 1) spark({ r0: 2.5, r1: reach * 0.62, width: 1.7, colour: core, rim: glow });
      else if (frame === 2) spark({ r0: R + 0.8, r1: reach * 0.92, width: 0.4, colour: glow });
      else if (frame === 3) spark({ r0: reach - 2.2, r1: reach, width: 0.4, colour: glow });
      else spark({ r0: reach - 1.1, r1: reach, width: 0.4, colour: rim });
      return;
    }

    // ---- fly ----
    const L = Math.round(lerp(12, 21, p.length) * (p.style === 'needle' ? 1.1 : 1));
    const beat = [0, 1, 0, -1][frame] * Math.round(lerp(1, 3, p.flicker));     // the tail end flickers in and out
    const xh = Math.min(29, 16 + Math.ceil(L / 2) + (p.trail ? 2 : 0)), xt = Math.max(3, xh - L - beat);
    // two speed lines of the glow colour, level with the bolt's upper and lower edges, slide back from its tail
    if (p.trail) streaks(g, { t, x: xt - 1, y: cy, count: 2, seed: 3, angle: LEFT, length: 7, reach: 3, spread: half - 0.5, colours: [glow, glow, rim] });
    lightShape(g, shapeOf(p.style, xt, xh, cy, rows), light);
  },
});
