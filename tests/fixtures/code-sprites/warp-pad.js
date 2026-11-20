// FROZEN COPY, not a sprite: sprites/warp-pad.js as it was on 2026-11-20 (migration batch P5), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Warp pad: the exit to the next floor of the Derelict Station. A low platform lying on the deck, seen from above
// and in front, with a ring of small lights round its rim and rings of light on its face.
//   idle      the rim lights chase round; the rings glow and, with Flicker, break up
//   charge    every light is on, and rings of light rise from the pad one after another
//   activate  ("Warp") a column of light shoots up to the top of the frame, flashes white and collapses, while a
//             ring runs out across the pad; its last frame is the first frame of idle
// The platform and its pylons are solids (engine/solids.js), the rings lie on the floor (engine/fx-floor.js), the
// column, the lamps and the colour steps are effects (engine/fx.js). This file is the three shapes of pad, where
// the lights sit and what happens when. Everything that is light is drawn after the outline.
//
// The pivot is the front foot of the pad (its outline is on the pivot row), so it stands like any prop; but it is a
// floor piece: a game draws it under whoever steps on it, whatever their rows.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp, clamp, fract, hash, pulse, TAU } from '../../../engine/motion.js';
import { INK } from '../../../engine/color.js';
import { ellipseIn, polyIn } from '../../../engine/surface.js';
import { PALETTE, swatches, swatchesBetween } from '../../../engine/palettes.js';
import { steps, lamp, beam, twinkle } from '../../../engine/fx.js';
import { floorRing, lightShape } from '../../../engine/fx-floor.js';
import { solid, extrude, bandIn, wallFill, ngonPoints } from '../../../engine/solids.js';

const D = PALETTE.derelict;
const W = 64, H = 48, CX = 32, GROUND = 39;         // the lowest body row; its outline lands on the pivot row
const WALL = 3;                                     // px of platform above the deck
const LAMPS = 12;
// the rings of light on the pad's face, as shares of its radius, outermost first
const RINGS = { one: [0.62], two: [0.68, 0.4], three: [0.72, 0.5, 0.28] };
// the four pylons, standing on the rim clear of the rings: [across, down] as shares of the pad's radii, and px
// tall; the two at the back first
const PYLONS = [[-0.6, -0.7, 8], [0.6, -0.7, 8], [-0.86, 0.36, 9], [0.86, 0.36, 9]];
// activate, frame by frame. tall: the column's height as a share of the way to the top of the frame; wide: px
// across; firm: how much of it is unbroken; white: the flash; wave: how far the ring on the pad has run (a share of
// the pad's radius); hoops: how far up the last rings of `charge` are; sparks: what is left in the air
const ACT = [
  { hoops: [0.2, 0.6] },
  { tall: 0.4, wide: 8, firm: 1, hoops: [0.55] },
  { tall: 1, wide: 10, firm: 0.9 },                               // it reaches the top of the frame (the sound)
  { tall: 1, wide: 14, firm: 1, white: true },                    // and flashes white
  { tall: 1, wide: 10, firm: 0.6, wave: 0.45 },
  { tall: 1, wide: 6, firm: 0.35, wave: 0.7 },
  { tall: 0.62, wide: 4, firm: 0.2, wave: 0.9 },                  // it collapses
  { tall: 0.34, wide: 3, firm: 0.1, wave: 1.02, sparks: 3 },
  { tall: 0.14, wide: 2, firm: 0, sparks: 2 },
  {},                                                             // at rest: idle's first frame
];
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

// The pad's size and where its face is: rx, ry (half the face, across and down), cy (the row of its middle).
function dims(p) {
  const rx = Math.round(p.size < 0.5 ? lerp(22, 28, p.size * 2) : lerp(28, 30, p.size * 2 - 1)), ry = Math.round(rx * 0.43);
  const sides = p.style === 'hex' ? 6 : 0;
  const face = (cy, k = 1) => (sides ? polyIn(ngonPoints(CX, cy, rx * k, ry * k, sides)) : ellipseIn(CX, cy, rx * k, ry * k));
  // stand it on the ground row whatever its shape: measure where its front foot comes, then move it there
  const at = solid(face(20), WALL, [0, 0, W, H]).box[3] - 1, cy = 20 + GROUND - at;
  return { rx, ry, cy, sides, face: (k) => face(cy, k) };
}

// Where the rim lights sit, in order round the pad: [[x, y], ...].
function lampSpots(d) {
  if (!d.sides) return ngonPoints(CX, d.cy, d.rx - 3.5, d.ry - 2, LAMPS, TAU / 24);
  const corners = ngonPoints(CX, d.cy, d.rx - 4.5, d.ry - 2, 6);
  return corners.flatMap(([x, y], i) => { const [nx, ny] = corners[(i + 1) % 6]; return [[x, y], [(x + nx) / 2, (y + ny) / 2]]; });
}

export default defineSprite({
  id: 'warp-pad',
  name: 'Warp pad',
  kind: 'Item',
  blurb: 'A teleporter platform on the floor: its lights chase round, rings of light rise as it charges, and a column of light fires when it warps. Change its size, shape, rings, colours and flicker.',
  meta: {
    type: 'prop',
    role: 'world/prop',
    themes: ['sci-fi', 'space'],
    gameTypes: ['roguelike-action', 'shooter'],
    view: 'top-down',
    words: ['warp', 'teleporter', 'pad', 'portal', 'exit', 'platform', 'beam', 'charge', 'activate', 'next level', 'transporter', 'glowing'],
    license: 'draft',
  },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'round', ['round', 'hex', 'pylons']),
    rings: choice('Rings', 'two', ['one', 'two', 'three']),
    body: color('Body', D.hull, swatchesBetween('derelict', ['wall', 'outfit'], { lead: 'hull', max: 0.6 })),
    accent: color('Rim lights', D.teal, swatches('derelict', 'accent', { lead: 'teal' })),
    glow: color('Glow', D.cyan, swatches('derelict', 'glow')),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: fps(8), loop: true },
    charge: { frames: 8, fps: fps(10), loop: true },
    activate: { frames: 10, fps: fps(12), loop: false, label: 'Warp' },
  },
  sounds: {
    charge: [{ sound: 'spaceship-hum', preset: 'Cruise', frame: 0, volume: 0.35 }],
    activate: [{ sound: 'warp-out', preset: 'Warp out', frame: 2, volume: 0.8 }],
  },

  render(g, { clip, t, frame, p }) {
    const d = dims(p), { rx, ry, cy } = d, squash = ry / rx;
    // activate ends on idle's first frame, exactly
    const a = clip === 'activate' && frame < ACT.length - 1 ? ACT[frame] : null;
    const charging = clip === 'charge' || !!a;
    const beat = a ? frame : Math.round(t * 8);               // which frame of the loop

    // ---- the pad: a low platform with a raised rim, a sunk deck and an emitter in the middle ----
    const S = extrude(g, d.face(1), WALL, p.body, { lip: 1, shade: 2 });
    wallFill(g, S, bandIn(S, 1, 1), p.accent, { flat: true });
    g.fill(0, 0, W, H, d.face(0.8), S.ramps.wall.base);
    g.ellipse(CX, cy, 5, 2.4, S.ramps.wall.dark);
    const posts = p.style === 'pylons' ? PYLONS.map(([kx, ky, tall]) => {
      const x = CX + Math.round(kx * rx), y = cy + Math.round(ky * ry);
      extrude(g, ellipseIn(x, y - tall, 2.6, 1.4), tall, p.body);
      return [x, y - tall, y];
    }) : [];
    g.outline(INK);

    // ---- everything below is light: no ink, a darker rim of its own colour ----
    const C = steps(p.glow, { white: false });                // [core, middle, glow, rim]
    const hot = a?.white ? ['#ffffff', '#ffffff', C[0], C[3]] : C;

    // the rim lights: three lit ones chase round, each with a dim one behind it; charging, all are on and a flare runs
    lampSpots(d).forEach(([x, y], i) => {
      if (posts.some(([px, py, foot]) => Math.abs(x - px) < 4 && y > py - 2 && y < foot + 2)) return;      // behind a pylon
      const k = (((i - beat) % 4) + 4) % 4;
      lamp(g, Math.round(x) - 1, Math.round(y) - 1, 2, 2, p.accent, a?.white ? 2 : charging ? (k === 0 ? 2 : 1) : k === 0 ? 1 : k === 3 ? 0.5 : 0);
    });
    posts.forEach(([x, y], i) => lamp(g, x - 1, y - 1, 2, 2, p.glow, a?.white || (charging && (beat + i) % 2 === 0) ? 2 : (beat + i) % 4 === 0 || charging ? 1 : 0.5));

    // the rings on the face: a slow swell at rest, hot while charging; Flicker breaks them into arcs that jump about
    RINGS[p.rings].forEach((k, j) => {
      const wild = p.flicker * (0.35 + 0.65 * hash(beat, 11 + j));
      const heat = charging ? 1 : 0.2 + 0.6 * pulse(t, -j / 4);
      floorRing(g, { x: CX, y: cy, r: rx * k, squash, thick: j ? 1 : 2, sides: d.sides, colours: hot, heat,
        gaps: wild > 0.3 ? 5 : 0, open: clamp(wild * 0.5, 0, 0.5), phase: TAU * hash(beat, 21 + j) });
    });
    lamp(g, CX - 2, cy - 1, 4, 2, p.glow, charging ? 2 : hash(beat, 3) < p.flicker * 0.5 ? 0.5 : 1);

    // rings of light that rise from the pad, thin out and break up
    const hoop = (life, j) => floorRing(g, { x: CX, y: Math.round(lerp(cy - 2, 7, life)), r: rx * lerp(0.6, 0.3, life), squash, thick: life < 0.45 ? 2 : 1, colours: C, heat: 1 - life,
      gaps: life > 0.55 || p.flicker > 0.6 ? 4 : 0, open: clamp((life - 0.4) * 0.9 + p.flicker * 0.25, 0.1, 0.7), phase: TAU * hash(j, 5) + life * 2 });
    const n = RINGS[p.rings].length;
    if (clip === 'charge') for (let j = 0; j < n; j++) hoop(fract(t + j / n), j);
    (a?.hoops ?? []).forEach((life, j) => hoop(life, j));

    if (a?.wave) floorRing(g, { x: CX, y: cy, r: Math.max(6, rx * a.wave), squash, thick: a.wave < 0.8 ? 2 : 1, sides: d.sides, colours: C, heat: 1.2 - a.wave, gaps: a.wave > 0.8 ? 6 : 0, open: 0.4, phase: 1 });
    if (a?.white) lightShape(g, d.face(0.6), { colours: [C[0], C[2]], heart: '#ffffff', inset: 2 });
    if (a?.tall) {
      // the column stands on the emitter; at full height it is asked for more than fits, so that every part of it
      // runs up to the row one pixel below the top of the frame and is cut off there
      const full = cy + 4;
      beam(g, { x: CX, y: cy + 1, w: a.wide, h: a.tall >= 1 ? Math.round(full * 2.2) : Math.round(full * a.tall), phase: frame * 0.37, dash: 3, gap: p.flicker > 0.6 ? 3 : 2, solid: a.firm, seed: 3, colours: hot });
    }
    for (let i = 0; i < (a?.sparks ?? 0); i++) twinkle(g, CX + [-5, 4, 0][i], Math.round(cy - 6 - 7 * i - (frame - 7) * 3), 1, C[2]);
  },
});
