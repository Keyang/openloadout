// Fireball: a ball of flame flying right, its tail streaming to the left. No ink outline: the
// flame is the framework's layered flame (engine/fx.js `flame`): core, middle, glow, and a rim in
// the glow's own darker tone. `hit` opens into a ring of embers. The skull style puts a skull
// face in the hot core; everything else here is proportions and choreography.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp, PI, TAU } from '../engine/motion.js';
import { ellipseIn, rectIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, flame, particles, ring, glow } from '../engine/fx.js';

const P = PALETTE.thornwood;
const CY = 16;
const LEFT = -PI / 2;                                    // the way the tail streams
// The core sits inside the glow, so the two controls never offer the same colour.
const GLOW = swatches('thornwood', 'edge', { lead: 'ember' });
const CORE = [P.cream, P.gold, P.skin, P.sky, P.goblin].filter((c) => !GLOW.includes(c));

// Sizes shared by both clips. The whole drawing is centred on the pivot; the head leads on the right.
function dims(p) {
  const R = lerp(3.5, 6.5, p.size) * (p.style === 'skull' ? 1.08 : p.style === 'comet' ? 0.92 : 1);
  const tail = Math.min(lerp(5, 13, p.length) * (p.style === 'comet' ? 1.3 : 1), 26 - 2 * R);
  return { R, tail, cx: Math.round(16 + tail / 2) };
}

// The skull in the core: a round cranium over a short jaw, two dark sockets, facing right.
function drawSkull(g, cx, R, C, jaw) {
  const bone = { base: C[0], dark: C[1], light: C[0] }, dark = C.at(-1);
  const big = R >= 4.6;
  const cr = R * 0.7, top = CY - 0.5 - (big ? 0.5 : 0);
  g.blob([ellipseIn(cx + 0.5, top, cr + 0.4, cr), rectIn(cx - 1, top + cr * 0.55, big ? 5 : 3, (big ? 2.5 : 1.5) + jaw)], bone, { shade: 1 });
  const e = big ? 2 : 1, ey = Math.round(top - (big ? 0.5 : 0));
  g.rect(cx - (big ? 2 : 1), ey, e, e, dark);
  g.rect(cx + (big ? 2 : 1), ey, e, e, dark);
  if (big) {
    g.rect(cx + 1, ey + 3, 1, 1, dark);                                   // the nose
    const ty = Math.round(top + cr * 0.55 + 1.5 + jaw);
    g.rect(cx, ty, 1, 1, dark); g.rect(cx + 2, ty, 1, 1, dark);           // gaps between the teeth
  }
}

export default defineSprite({
  id: 'fireball',
  name: 'Fireball',
  kind: 'Effect',
  blurb: 'A ball of flame with a streaming tail that bursts into a ring of embers. Change its size, style, tail, sparks and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'arcade', 'shooter'], view: 'side',
    words: ['fireball', 'fire', 'flame', 'spell', 'magic', 'comet', 'skull', 'shot', 'fly', 'hit', 'burn', 'ember', 'wizard attack'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'fly',
  sounds: { hit: [{ sound: 'whoosh', preset: 'Heavy swing', frame: 0, volume: 0.7 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'ball', ['ball', 'comet', 'skull']),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    sparks: toggle('Sparks', true),
    core: color('Core', P.cream, CORE, { material: 'fire' }),   // flame: a look keeps it a fire colour
    glow: color('Glow', P.ember, GLOW, { material: 'fire' }),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    const { R, tail, cx } = dims(p);
    const C = steps(p.glow, { core: p.core, white: false });           // [core, middle, glow, rim]

    if (clip === 'hit') {
      // frame 0: the white-hot flash; then a ring of embers opens, cools and breaks up
      const hot = steps(p.glow, { core: p.core });
      const r1 = lerp(9, 13.5, p.size);
      const bx = Math.min(cx, 18);                       // where the head was, pulled in so the burst has room
      ring(g, { t, x: bx, y: CY, r0: R + 1, r1, thick: 4, seed: 2, colours: [C[0], C[1], C[2], C[2], C[3]] });
      // embers thrown a little ahead of the ring
      particles(g, { t, x: bx, y: CY, loop: false, count: p.sparks ? 10 : 5, seed: 5, stagger: 0.15, angle: PI, arc: TAU, dist: (r1 + 1) * 1.4, gravity: 3, size: 2.4, colours: [C[1], C[2], C[2], C[3]] });
      const flash = (R * 1.5 + 2) * clamp(1 - t * 2.4);
      if (flash >= 1.5) glow(g, bx, CY, flash, hot);
      return;
    }

    // ---- fly ----
    const sway = lerp(0.4, 2.2, p.flicker);
    const pump = (ph) => 1 + lerp(0.03, 0.2, p.flicker) * wave(2 * t, ph);     // twice per loop, so it closes
    const full = R + tail;
    let tongues;
    if (p.style === 'comet') tongues = [{ angle: LEFT, length: full * pump(0), width: R * 0.9, sway: sway * 0.7 }];
    else if (p.style === 'skull') {
      // flames stream off the top and the back of the skull like hair
      tongues = [
        { angle: LEFT - 0.2, length: full * pump(0), width: R * 0.8, phase: 0 },
        { angle: LEFT + 0.25, length: full * 0.62 * pump(0.4), width: R * 0.55, phase: 0.5, at: [0, R * 0.3] },
      ];
    } else {
      // one main tail and two shorter licks that start high and low on the ball
      tongues = [
        { angle: LEFT, length: full * pump(0), width: R * 0.8, phase: 0 },
        { angle: LEFT - 0.14, length: full * 0.74 * pump(0.3), width: R * 0.5, phase: 0.37, sway: sway * 0.6, at: [0, -R * 0.5] },
        { angle: LEFT + 0.12, length: full * 0.56 * pump(0.6), width: R * 0.45, phase: 0.71, sway: sway * 0.6, at: [0, R * 0.55] },
      ];
    }
    // sparks first, so the flame covers the ones still inside it
    if (p.sparks) particles(g, { t, x: cx - R * 0.6, y: CY, count: 8, seed: 3, angle: LEFT, arc: 2.2, dist: tail + R + 3, gravity: -2, size: 2.4, lifespan: 0.8, colours: C });
    flame(g, { t, x: cx, y: CY, head: R, tongues, sway, cycles: 1, heat: p.style === 'skull' ? 0.05 : 0.55, colours: p.style === 'skull' ? [C[1], C[1], C[2], C[3]] : C });
    if (p.style === 'skull') drawSkull(g, cx, R, C, wave(2 * t, 0.1) > 0.3 ? 1 : 0);
  },
});
