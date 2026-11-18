// Saw blade: a spinning circular blade, the hazard that slides along tracks and walls.
// The blade turns by exactly one tooth per loop, so the loop closes however many teeth it has;
// everything else on it either turns with the teeth and repeats tooth by tooth (the slots of the
// ring blade) or stands still (the groove, the glint, the hub plate, which is the cap of the axle
// and does not turn). `grind` is the same spin with the blade biting: it judders by a pixel and
// throws sparks back from its lower edge.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, TAU, PI } from '../engine/motion.js';
import { ramp, tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { toothedIn } from '../engine/mech.js';
import { starIn, ringIn } from '../engine/shapes.js';
import { particles, twinkle, steps } from '../engine/fx.js';

const P = PALETTE.thornwood;
const SIZE = 48, C = 24;
// the hub plate sits on the blade: the two lists share no colour, so no look can merge them
const METAL = swatches('thornwood', 'metal');
const ACCENT = swatches('thornwood', 'accent', { lead: 'crimson' }).filter((c) => !METAL.includes(c));
const SPARKS = steps(P.ember, { core: P.gold });

// Where the blade is this frame and how big: shared by everything that is drawn on it.
function blade(clip, t, frame, p) {
  const R = Math.round(lerp(11, 18, p.size));                 // to the tooth tips
  const sway = lerp(0, 2.2, p.wobble);                        // the axle is a little off centre
  const x = C + Math.round(sway * Math.cos(TAU * t));
  const y = C + Math.round(sway * Math.sin(TAU * t)) + (clip === 'grind' ? frame % 2 : 0);   // biting: it judders
  return { R, x, y, teeth: Math.round(p.teeth), turn: (TAU * t) / Math.round(p.teeth) };
}

export default defineSprite({
  id: 'saw-blade',
  name: 'Saw blade',
  kind: 'Item',
  blurb: 'A spinning circular saw blade that hurts on touch; change its size, the cut of its teeth, how many it has, the hub plate, the metal and how much it wobbles.',
  meta: {
    type: 'prop',
    role: 'world/hazard',
    themes: ['fantasy', 'forest'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['saw', 'blade', 'sawblade', 'buzzsaw', 'hazard', 'trap', 'spin', 'grind', 'cut', 'danger', 'obstacle', 'metal', 'sharp'],
    license: 'draft',
  },
  size: [SIZE, SIZE],
  pivot: [C, C],
  grounded: false,
  params: {
    size: range('Size', 0.55, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'classic', ['classic', 'jagged', 'ring']),
    teeth: range('Teeth', 8, { min: 6, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    hub: toggle('Hub plate', true),
    metal: color('Metal', P.steel, METAL),
    accent: color('Hub plate', P.crimson, ACCENT, { when: { hub: [true] } }),
    wobble: range('Wobble', 0.35, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Spin' },
    grind: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
  },

  render(g, { clip, t, frame, p }) {
    const { R, x, y, teeth, turn } = blade(clip, t, frame, p);
    const metal = ramp(p.metal);
    const all = [0, 0, SIZE, SIZE];

    // ---- the blade: one body per style, so the shadow band runs round the whole of it ----
    let root;                                                  // radius of the solid disc inside the teeth
    if (p.style === 'jagged') {
      // long straight fangs, like a throwing star with too many points
      root = R * 0.62;
      g.fill(...all, starIn(x, y, R, teeth, { inner: 0.62, angle: turn }), metal, { shade: 2, light: 1 });
      g.fill(...all, ringIn(x, y, root - 1.5, 1), metal.dark);                      // a groove where the fangs spring from
    } else {
      const depth = p.style === 'ring' ? Math.max(2, R * 0.16) : Math.max(2.5, R * 0.22);
      root = R - depth;
      const body = toothedIn(x, y, R, teeth, depth, turn, 'saw');
      g.fill(...all, body, metal, { shade: 2, light: 1 });
      if (p.style === 'ring') {
        // a ring of square holes punched through the blade, one per tooth, turning with the teeth
        const mid = R * 0.6, hole = (TAU * mid) / teeth >= 6 ? 3 : 2;
        for (let i = 0; i < teeth; i++) {
          const a = turn + (i * TAU) / teeth;
          g.rect(Math.round(x + mid * Math.cos(a) - hole / 2), Math.round(y + mid * Math.sin(a) - hole / 2), hole, hole, metal.deep);
        }
      } else g.fill(...all, ringIn(x, y, R * 0.6, 1), metal.dark);                  // the groove of a pressed blade: it does not turn
    }
    // the glint: a curved streak of light that stays at the top right while the teeth pass under it
    const shine = Math.max(4, root - 2);
    g.arc(x, y, shine, PI * 0.62, PI * 0.9, 1, metal.light);
    g.arc(x, y, shine, PI * 0.68, PI * 0.82, 1, '#ffffff');

    // ---- the middle: the bolted plate that caps the axle, or the bare axle ----
    if (p.hub) {
      const plate = ramp(p.accent), h = Math.max(4, Math.round(R * 0.34));
      g.ellipse(x, y, h, h, plate, { outline: INK, light: 1 });
      if (h >= 5) {                                            // four bolts
        const k = Math.round(h * 0.55);
        for (const bx of [x - k, x + k - 1]) for (const by of [y - k, y + k - 1]) g.dot(bx, by, by < y ? metal.light : metal.base);
      }
      g.rect(x - 1, y - 1, 2, 2, metal.base);
      g.dot(x, y - 1, metal.light);
    } else {
      g.ellipse(x, y, 2.5, 2.5, tone(p.metal, -1.6), { outline: INK });
      g.dot(x, y - 1, metal.base);
    }
    g.outline(INK);

    // ---- light and speed, not outlined ----
    const inFrame = (px, py) => px >= 1 && py >= 1 && px < SIZE - 1 && py < SIZE - 1;
    // two short arcs just off the teeth that run round with the blade, one turn per loop
    for (const side of [0, PI]) {
      const a = side - TAU * t + PI * 0.3;                     // clockwise on screen
      g.arc(x, y, R + 2.5, a - 0.26, a + 0.26, 1, '#ffffff', { clip: inFrame });
    }
    if (clip === 'grind') {
      // where the lower edge bites: a hot spot, and sparks thrown back the way the rim is moving
      const bx = x - 1, by = Math.min(y + R - 1, SIZE - 4);
      particles(g, { t, x: bx, y: by, count: 12, seed: 4, cycles: 2, angle: -PI * 0.6, arc: 1.1, dist: R + 6, gravity: 6, size: 2.4, spread: 1.5, lifespan: 0.85, colours: SPARKS });
      twinkle(g, bx, by + 1, frame % 2 ? 2 : 1, SPARKS[2]);
    }
  },
});
