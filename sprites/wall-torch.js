// Wall torch: a burning torch held to a wall, seen from the front. Three brackets: an iron plate with a ring
// that grips a wooden torch, a wooden backboard with a block that holds one, and an iron sconce whose bowl
// holds the fire itself. The flame is the shared one (flame in engine/fx.js: three tones inside a darker rim
// of its own colour, drawn after the outline), so it matches the campfire. The pivot is where the bracket
// meets the wall.
//   idle    burning: the flame ripples upward and pumps twice a loop; a halo of glow pixels and rising sparks if wanted
//   out     unlit: the bracket with a charred head and no flame
//   ignite  starts on `out`, catches with a white flash, flares past full size and settles on the first frame of idle
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { ellipseIn, rectIn, capsuleIn } from '../engine/surface.js';
import { anyIn } from '../engine/shapes.js';
import { layOver } from '../engine/buildings.js';
import { lerp, wave, PI } from '../engine/motion.js';
import { ramp, tone, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, flame, particles, rays, glow } from '../engine/fx.js';

const P = PALETTE.thornwood;
const W = 32, H = 48, CX = 16, WALL = 34;         // WALL: the row where the bracket meets the wall (the pivot)
const CHAR = mix(P.soil, INK, 0.6);               // burnt cloth and cold coals
// ignite, frame by frame: how big the flame is (1 = burning), and whether the white flash shows
const CATCH = [0, 0.3, 0.75, 1.25, 0.92, 1];

// Where the fire sits for each bracket: the middle of the flame's foot.
const FOOT = { iron: [CX + 1, 21], wood: [CX + 1, 21], sconce: [CX, 24] };

// The bracket and what it holds, without the flame, drawn from the wall outwards. lit: the head (or the coals) glows.
// Each piece is laid over the ones before it (layOver): a line where it covers something, none along the silhouette,
// which is left to the one outline at the end.
function bracket(g, p, lit, C) {
  const metal = ramp(p.metal), wood = ramp(P.wood), board = ramp(P.soil);
  const [fx, fy] = FOOT[p.style];
  const head = lit ? { light: C[1], base: mix(C[2], CHAR, 0.45), dark: CHAR } : { light: mix(CHAR, P.stone, 0.3), base: CHAR, dark: tone(CHAR, -0.6) };
  if (p.style === 'sconce') {
    // a wall plate with a short neck, and a wide bowl of coals standing on it
    layOver(g, anyIn(rectIn(CX - 3, WALL - 3, 7, 9), ellipseIn(CX + 0.5, WALL + 6, 3.5, 2.5)), metal, { light: 1, shade: 1 });
    g.rect(CX, WALL - 1, 1, 1, metal.dark); g.rect(CX, WALL + 4, 1, 1, metal.dark);              // rivets
    layOver(g, rectIn(CX - 1, fy + 5, 3, 5), metal);
    const bowl = (px, py) => py >= fy + 1 && ellipseIn(fx + 0.5, fy + 1, 8, 5.4)(px, py);
    layOver(g, anyIn(bowl, ellipseIn(fx + 0.5, fy + 0.5, 5.5, 2)), head, { shade: 1 });                // the coals, heaped a little over the rim
    layOver(g, bowl, metal, { light: 1, shade: 2 });
    g.rect(fx - 6, fy + 1, 13, 1, metal.light);                                                  // the rim of the bowl
    return;
  }
  if (p.style === 'iron') {
    // an iron wall plate with rounded ends, riveted top and bottom
    layOver(g, anyIn(rectIn(CX - 4, WALL - 6, 8, 13), ellipseIn(CX, WALL - 6, 4, 2.5), ellipseIn(CX, WALL + 7, 4, 2.5)), { light: metal.base, base: metal.dark, dark: tone(p.metal, -1.8) }, { light: 1, shade: 1 });
    g.rect(CX - 1, WALL - 7, 2, 1, metal.light); g.rect(CX - 1, WALL + 7, 2, 1, metal.light);
  } else {
    // a wooden backboard, nailed to the wall
    layOver(g, rectIn(CX - 5, WALL - 8, 10, 17), board, { shade: 1 });
    g.rect(CX - 5, WALL - 8, 10, 1, board.light);
    for (const [x, y] of [[-4, -6], [3, -6], [-4, 6], [3, 6]]) g.rect(CX + x, WALL + y, 1, 1, metal.light);
  }
  // the torch: a wooden handle that leans a little, with a wrapped head and an iron band under it
  layOver(g, capsuleIn(CX - 0.5, WALL + 8.5, fx - 0.5, fy + 5.5, 1.5), wood);
  layOver(g, anyIn(rectIn(fx - 3, fy, 6, 6), ellipseIn(fx, fy + 0.5, 3, 1.6)), head, { shade: 1 });
  layOver(g, rectIn(fx - 3, fy + 5, 6, 2), metal, { light: 1 });
  if (p.style === 'iron') {
    // the ring that grips the handle, on an arm from the plate
    layOver(g, rectIn(CX - 5, WALL - 2, 10, 3), metal, { light: 1 });
    g.rect(CX - 2, WALL - 1, 5, 1, metal.dark);
  } else {
    // the block the handle stands in, and the iron strap that holds it
    layOver(g, rectIn(CX - 4, WALL + 1, 9, 5), wood, { shade: 1 });
    g.rect(CX - 4, WALL + 1, 9, 1, wood.light);
    layOver(g, rectIn(CX - 4, WALL - 4, 9, 2), metal, { light: 1 });
  }
}

// The fire: a main tongue and a smaller lick beside it, `size` of full height, at loop phase t.
function fire(g, p, t, size, C) {
  const [fx, fy] = FOOT[p.style], bowl = p.style === 'sconce';
  const pump = 1 + lerp(0.03, 0.14, p.flicker) * (0.6 * wave(2 * t) + 0.4 * wave(3 * t, 0.3));    // whole cycles: the loop closes
  const length = lerp(8, 15, p.height) * size * pump, width = lerp(3.2, 4.6, p.height) * (bowl ? 1.25 : 1) * Math.min(1, 0.5 + size * 0.5);
  const sway = lerp(0.5, 2.4, p.flicker);
  const tongues = [{ angle: PI, length, width, phase: 0 }];
  if (size > 0.5) tongues.push({ angle: PI - 0.12, length: length * 0.55 * (1 + 0.1 * wave(3 * t, 0.6)), width: width * 0.55, phase: 0.4, sway: sway * 0.6, at: [bowl ? -3 : -2, 0] });
  if (bowl && size > 0.5) tongues.push({ angle: PI + 0.14, length: length * 0.45 * (1 + 0.1 * wave(2 * t, 0.2)), width: width * 0.5, phase: 0.75, sway: sway * 0.6, at: [3.5, 0] });
  flame(g, { t, x: fx, y: fy + 1.5, tongues, sway, cycles: 1, heat: 0.55, colours: C });
  return { fx, fy, length };
}

export default defineSprite({
  id: 'wall-torch',
  name: 'Wall torch',
  kind: 'Item',
  blurb: 'A torch burning in a wall bracket, which can be put out and lit again. Change the bracket, the flame, its halo and sparks, and the colours.',
  meta: {
    type: 'prop',
    role: 'world/prop',
    themes: ['fantasy', 'dungeon'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['torch', 'flame', 'fire', 'light', 'sconce', 'lamp', 'burn', 'ignite', 'castle', 'cave', 'wall', 'flicker'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, WALL],
  grounded: false,
  preview: 'idle',
  params: {
    style: choice('Style', 'iron', [{ value: 'iron', label: 'Iron ring' }, { value: 'wood', label: 'Wooden block' }, { value: 'sconce', label: 'Sconce' }]),
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    halo: toggle('Halo', true),
    sparks: toggle('Sparks', true),
    glow: color('Glow', P.ember, swatches('thornwood', 'glow', { lead: 'ember' })),
    metal: color('Metal', P.steel, swatches('thornwood', 'metal')),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true, label: 'Burn' },
    out: { frames: 1, fps: 8, loop: true, label: 'Unlit' },
    ignite: { frames: 6, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    idle: [{ sound: 'fire', preset: 'Torch', frame: 0, volume: 0.35 }],
    ignite: [{ sound: 'whoosh', preset: 'Quick swipe', frame: 1, volume: 0.7 }],
  },

  render(g, { clip, t, frame, p }) {
    const C = steps(p.glow, { white: false });                 // [core, middle, glow, rim]: hottest first
    const size = clip === 'out' ? 0 : clip === 'ignite' ? CATCH[frame] ?? 1 : 1;
    // the last frame of ignite is the first frame of idle; before that the flame runs on its own short clock
    const ti = clip === 'idle' ? t : frame >= 5 ? 0 : frame * 0.125;
    const [fx, fy] = FOOT[p.style];

    bracket(g, p, size > 0, C);
    g.outline(INK);

    // ---- light goes on after the outline ----
    if (size <= 0) return;                                     // unlit: the bracket and its charred head, nothing else
    const burning = clip === 'idle' || frame >= 4;
    if (p.sparks && (burning || frame >= 3)) particles(g, { t: ti, x: fx, y: fy - 3, count: 7, seed: 4, angle: PI, arc: 1.3, dist: lerp(11, 17, p.height), gravity: -2, size: 2.4, spread: 2, wobble: 1.4, lifespan: 0.75, colours: [C[0], C[1], C[2]] });
    const F = fire(g, p, ti, size, C);
    if (p.halo && burning) {
      // a ring of glow pixels over the flame: eight short rays that breathe in and out and step round on every other frame
      const cy = fy - F.length * 0.4, r = Math.min(lerp(8.5, 11, p.height) + 0.8 * wave(2 * ti), cy - 3);
      rays(g, { x: fx, y: cy, count: 8, angle: PI + (Math.round(ti * 8) % 2 ? 0.2 : 0), arc: 1.55 * PI, r0: r, r1: r + 2, gap: 0, colours: [C[1], C[2]] });
    }
    if (clip === 'ignite' && frame >= 1 && frame <= 3) {
      // it catches: a white-hot flash at the head, then a burst of sparks as it flares
      if (frame === 1) glow(g, fx, fy - 1, 4.5, steps(p.glow));
      else particles(g, { t: (frame - 1) / 3, x: fx, y: fy - 2, loop: false, count: 6, seed: 9, stagger: 0.1, angle: PI, arc: 2.6, dist: 11, gravity: 3, size: 1.8, colours: [C[0], C[1], C[2]] });
    }
  },
});
