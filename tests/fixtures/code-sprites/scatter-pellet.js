// FROZEN COPY, not a sprite: sprites/scatter-pellet.js as it was on 2026-11-20 (build item E3, frozen in E3b), before the migration redrew it as
// data (docs/data-sprites.md section 7). Kept for tests/unit/projectile-*.test.mjs, which hold sprites/scatter-pellet.json to it (tests/helpers/library.mjs
// codeSprite); imports point at ../../../. Never edit it; the build never scans tests/.
// Scatter pellet: one of the many small shots of the scatter gun. A dot of light with a short tail
// to the left: a pale core, a band of its glow colour and that colour's own dark rim (no ink), so it
// shows on any floor. Small and simple on purpose: a game fires them by the dozen. Drawn pointing
// right and the same above and below its centre line, so a game can turn it to any angle.
// `hit` is a white pop and four short sparks. The light is the framework's (engine/shots.js, engine/fx.js).
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp, PI } from '../../../engine/motion.js';
import { ellipseIn, capsuleIn, polyIn } from '../../../engine/surface.js';
import { anyIn, starIn } from '../../../engine/shapes.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { steps, glow as flash, starburst } from '../../../engine/fx.js';
import { lightShape } from '../../../engine/shots.js';

const P = PALETTE.derelict;
// The core sits inside the glow, so the two controls never offer the same colour, and every core is lighter than every glow.
const GLOW = swatches('derelict', 'glow', { lead: 'signal' });
const CORE = [P.cream, P.suit, P.skin, P.steel].filter((c) => !GLOW.includes(c));

// The pellet as layers of light, back to front: [shape test, colours for lightShape]. The head is `d` px across,
// centred on (cx, cy); the tail ends `tail` px behind the centre. C: { core, hot, glow, rim, flare } (hot: the band round
// the core, paler on a frame that flares).
function layersOf(shape, cx, cy, d, tail, C) {
  if (shape === 'shard') {
    // a splinter: one long sharp dart, widest just behind its point
    const half = [1.1, 1.6, 2.2][d - 3];
    return [[polyIn([[cx + d / 2 + 1.8, cy], [cx - 0.5, cy - half], [cx - tail, cy], [cx - 0.5, cy + half]]), [C.core, C.hot, C.rim]]];
  }
  const r = d % 2 ? (d - 1) / 2 + 0.4 : d / 2;           // a small pixel circle, odd or even
  // a streak that cools along its length (one row thick, or two about an even head), then the head over it
  const from = cx - r - 1, split = Math.round(from - (tail - r - 1) * 0.5);
  const streak = capsuleIn(cx - tail + 0.5, cy, cx, cy, cy % 1 ? 0.4 : 0.6, d === 5 ? 1.4 : cy % 1 ? 0.4 : 0.6);
  const tailOf = [[(px, py) => px < split && streak(px, py), [C.rim]], [(px, py) => px >= split && streak(px, py), [C.glow]]];
  // spark: a four-pointed star, all core, with the glow as its rim; round: a ball of light
  if (shape === 'spark') return [...tailOf, [anyIn(starIn(cx, cy, r + (C.flare ? 3 : 2), 4, { inner: C.flare ? 0.3 : 0.36 }), ellipseIn(cx, cy, r * 0.6, r * 0.6)), [C.core, C.glow]]];
  return [...tailOf, [ellipseIn(cx, cy, r, r), [C.core, C.hot, C.rim]]];
}

export default defineSprite({
  id: 'scatter-pellet',
  name: 'Scatter pellet',
  kind: 'Effect',
  blurb: 'One small shot from a scatter gun: a bright dot with a short tail, drawn pointing right so a game can turn it to any angle; it pops into four sparks. Change its size, shape, tail and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'top-down',
    words: ['pellet', 'shot', 'bullet', 'buckshot', 'shotgun', 'scatter', 'spread', 'spark', 'shoot', 'fly', 'hit', 'player shot', 'small'], license: 'draft' },
  size: [16, 16],
  pivot: [8, 8],
  grounded: false,
  preview: 'fly',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'shard', 'spark']),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    core: color('Core', P.cream, CORE),
    glow: color('Glow', P.signal, GLOW),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 4, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 4, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, frame, p }) {
    const d = Math.round(lerp(3, 5, p.size));             // px across the head, without its rim
    const mid0 = d % 2 || p.shape !== 'round' ? 7.5 : 8;  // a dart and a star have a middle row; so has a ball an odd number of px across
    const cy = mid0;
    const [white, core, mid, glow, rim] = steps(p.glow, { core: p.core });

    if (clip === 'hit') {
      const cx = mid0, reach = lerp(4.5, 6.4, p.size);
      const spark = (o) => starburst(g, { x: 7.5, y: 7.5, count: 4, turn: PI / 4, ...o });     // on a pixel centre, so the four come out even
      if (frame === 0) flash(g, cx, cy, d / 2 + 1.6, [white, white, core, glow]);          // the white pop
      else if (frame === 1) spark({ r0: 0, r1: reach * 0.8, width: 0.9, colour: core, rim: glow });
      else if (frame === 2) spark({ r0: reach * 0.45, r1: reach, width: 0.4, colour: mid });      // paler than the glow, so it shows on a floor of the glow's own value
      else spark({ r0: reach - 1.2, r1: reach, width: 0.4, colour: rim });
      return;
    }

    // ---- fly ----
    const r = d / 2, base = lerp(4.5, 8.5, p.length);
    const cx = mid0 + Math.round((base - r) / 2);                                  // the whole pellet sits about the pivot
    const tail = Math.min(cx - 1, base + [0, 1, 0, -1][frame] * Math.round(lerp(1, 2.4, p.flicker)));   // the tail flickers in and out
    // a wild pellet also flares: on the long beat the band round its core burns paler (a star's points reach further)
    const flare = (frame === 1 && p.flicker >= 0.4) || (frame === 3 && p.flicker >= 0.8);
    for (const [shape, colours] of layersOf(p.shape, cx, cy, d, tail, { core, hot: flare ? mid : glow, glow, rim, flare })) lightShape(g, shape, colours);
  },
});
