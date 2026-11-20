// FROZEN COPY, not a sprite: sprites/upgrade-pedestal.js as it was on 2026-11-20 (migration batch P5), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Upgrade pedestal: a short stand that offers an upgrade as a hologram floating and turning above it.
// Seen from above and in front (three-quarter view). Three stands: a pillar with a dish, a low ring of
// lights on the floor, and a claw whose two prongs cradle the hologram. The stand is built from the
// solids of engine/solids.js; the hologram (a cube, an orb, an arrow or a star) is light, so it goes on
// after the outline in two tones of the glow colour with a scan line climbing it. `activate`: the
// hologram flashes, streaks up and is gone; the last frame is `taken`, the bare, dark stand.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { lerp, wave, fract, PI } from '../../../engine/motion.js';
import { tone, mix, INK } from '../../../engine/color.js';
import { ellipseIn, capsuleIn, polyIn } from '../../../engine/surface.js';
import { PALETTE, swatches, swatchesBetween } from '../../../engine/palettes.js';
import { lamp, hologram, meridians, twinkle, particles } from '../../../engine/fx.js';
import { placedIn, turnedIn, starIn } from '../../../engine/shapes.js';
import { extrude, bandIn, wallFill, stripesIn, turningCubeIn } from '../../../engine/solids.js';

const P = PALETTE.derelict;
const W = 32, H = 48, CX = 16, GROUND = 45;      // the lowest body row; its outline lands on the pivot row
// activate, frame by frame. holo: how the hologram is drawn ([wide, tall] stretch, white-hot); up: px it has
// risen; streak: [bottom, top] rows of the streak it becomes (as shares of the way to the top of the frame);
// sparks: how many are left behind; lit: the stand's lights (1 on, 0 dark); lens: the projector (2 flares, 0 is dark)
const ACT = [
  { holo: [1, 1], lit: 1, lens: 1 },
  { holo: [1.35, 0.6], hot: true, lit: 1, lens: 2 },                 // it flashes and squashes (the sound)
  { holo: [0.6, 1.5], hot: true, up: 3, lit: 1, lens: 2 },           // stretches upward
  { streak: [0, 1], lit: 1, lens: 2 },                               // and is a streak to the top of the frame
  { streak: [0.55, 1], sparks: 3, lit: 1, lens: 1 },
  { sparks: 3, lit: 0, lens: 1 },
  { sparks: 2, lit: 0, lens: 0 },
  { lit: 0, lens: 0 },                                               // taken: the bare, dark stand
];

// r: half the width of the stand's body; R: half the size of the hologram
function dims(p) {
  return { r: Math.round(lerp(5, 8, p.size)), R: Math.round(lerp(5, 7, p.size)), col: Math.round(lerp(7, 11, p.size)) };
}

// The stand. lit: 1 its lights are on, 0 dark. Returns { lens: [x, y, w, h] the projector,
// top: its highest row, hy: the row the hologram's middle rests on }.
function stand(g, p, d, lit) {
  const { r, R } = d;
  const light = lit >= 1 ? tone(p.accent, 0.7) : tone(p.accent, -1.5);
  const disc = (cy, rx, ry, h, opt) => extrude(g, ellipseIn(CX, cy, rx, ry), h, p.body, opt);

  if (p.style === 'ring') {
    // a wide, low platform: a ring of lights round its edge, a raised inner ring, the projector in the middle
    const rx = Math.min(13, r + 5), cy = GROUND + 1 - 3 - 4;
    const S = disc(cy, rx, 4, 3, { lip: 1 });
    wallFill(g, S, bandIn(S, 0, 3), S.ramps.wall.dark, { flat: true });
    wallFill(g, S, stripesIn(bandIn(S, 1, 1), { pitch: 4, slant: 0, phase: 1 }), light, { flat: true });
    disc(cy - 1, rx - 3, 3, 1, { lip: 1 });
    g.ellipse(CX, cy - 1, rx - 5, 2, S.ramps.wall.dark);
    const lw = Math.max(2, rx - 7);
    return { lens: [CX - lw, cy - 2, 2 * lw, 2], top: cy - 4, hy: cy - 4 - 5 - R };
  }

  if (p.style === 'claw') {
    // a foot with two prongs that curve up round the hologram, a light at each tip
    const cy = GROUND + 1 - 3 - 3;
    const S = disc(cy, r + 1, 3, 3, { lip: 1 }), Rw = S.ramps.wall;
    wallFill(g, S, bandIn(S, 1, 1), light, { flat: true });
    g.ellipse(CX, cy, r - 2, 1.6, Rw.dark);
    const hy = cy - 5 - R, out = Math.min(R + 5, 13);
    for (const side of [-1, 1]) {
      const kx = CX + side * out, tx = CX + side * (out - 2);
      g.limb(CX + side * (r - 1), cy - 1, kx, hy + 3, 3, Rw);
      g.limb(kx, hy + 3, tx, hy - R + 2, 3, Rw);
      g.rect(Math.round(tx) - 1, hy - R, 2, 2, light);
    }
    return { lens: [CX - 2, cy - 1, 4, 2], top: hy - R, hy };
  }

  // pillar: a foot, a column with a band of light, and a dish that carries the projector
  const cy0 = GROUND + 1 - 2 - 3;
  disc(cy0, r + 2, 3, 2, { lip: 1 });
  const cy1 = cy0 - d.col, S1 = disc(cy1, r - 1, 2, d.col);
  wallFill(g, S1, bandIn(S1, 2, 4), S1.ramps.wall.dark, { flat: true });
  wallFill(g, S1, bandIn(S1, 3, 2), light, { flat: true });
  const cy2 = cy1 - 2, S2 = disc(cy2, r + 1, 3, 2, { lip: 1 });
  g.ellipse(CX, cy2, r - 1, 2, S2.ramps.wall.dark);
  return { lens: [CX - (r - 2), cy2 - 1, 2 * (r - 2), 2], top: cy2 - 3, hy: cy2 - 3 - 3 - R };
}

// The hologram as shape tests round (0, 0): { body, lit } (lit: the part that takes the lighter tone, or null).
function shape(p, R, t) {
  // a cube turns a quarter turn per loop (after which it looks the same): it starts with a corner to the camera, which
  // shows three faces, and is face-on in the middle of the loop. Its top face and its near edge take the lighter tone
  if (p.shape === 'cube') return turningCubeIn(R, t);
  if (p.shape === 'orb') return { body: ellipseIn(0, 0, R, R), lit: null };
  // flat badges turn like a coin: half a turn per loop
  const flat = p.shape === 'arrow'
    ? polyIn([[0, -R], [R * 0.95, -R * 0.05], [R * 0.4, -R * 0.05], [R * 0.4, R], [-R * 0.4, R], [-R * 0.4, -R * 0.05], [-R * 0.95, -R * 0.05]])
    : starIn(0, R * 0.1, R * 1.2, 5);
  return { body: turnedIn(flat, PI * t, 2).body, lit: null };
}

export default defineSprite({
  id: 'upgrade-pedestal',
  name: 'Upgrade pedestal',
  kind: 'Item',
  blurb: 'A stand that offers an upgrade as a turning hologram, which streaks away when it is taken. Change the stand, the hologram, its size, float and colours.',
  meta: { type: 'prop', role: 'world/prop', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['pedestal', 'upgrade', 'hologram', 'altar', 'stand', 'shop', 'powerup', 'reward', 'choose', 'activate', 'take', 'projector', 'glowing'], license: 'draft' },
  size: [W, H],
  pivot: [CX, GROUND + 1],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'pillar', ['pillar', 'ring', 'claw']),
    shape: choice('Hologram', 'cube', ['cube', 'orb', 'arrow', 'star']),
    body: color('Body', P.hull, swatchesBetween('derelict', ['wall', 'outfit'], { lead: 'hull', max: 0.6 })),
    accent: color('Lights', P.teal, swatches('derelict', 'accent', { lead: 'teal' })),
    glow: color('Hologram colour', P.xp, swatches('derelict', 'glow', { lead: 'xp' })),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: (p) => 8 * lerp(0.65, 1.45, p.speed), loop: true },
    activate: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    taken: { frames: 1, fps: 8, loop: true },
  },
  sounds: { activate: [{ sound: 'upgrade-get', preset: 'Upgrade', frame: 1 }] },

  render(g, { clip, t, frame, p }) {
    const d = dims(p), R = d.R;
    // activate starts on the first idle frame, exactly, and ends on taken
    const resting = clip === 'idle' || (clip === 'activate' && frame === 0);
    const a = resting ? { holo: [1, 1], lit: 1, lens: frame % 4 === 0 ? 2 : 1 } : clip === 'taken' ? ACT[7] : ACT[frame] ?? ACT[7];
    const s = stand(g, p, d, a.lit);
    g.outline(INK);
    lamp(g, ...s.lens, p.glow, a.lens);

    // ---- everything below is light: no ink, a darker rim of its own colour ----
    const white = mix(p.glow, '#ffffff', 0.75);
    const loop = clip === 'idle' ? t : 0;
    const room = Math.max(0, s.hy - R - 3);                             // rows free above the hologram
    const bob = Math.round(Math.min(room, lerp(0, 3, p.bob)) * wave(loop, 0.25));
    const hy = s.hy - bob - (a.up ?? 0);

    if (a.holo) {
      const { body, lit } = shape(p, R, loop), [sx, sy] = a.holo;
      const at = (f) => (f ? placedIn(f, CX, hy, { sx, sy }) : null);
      hologram(g, at(body), a.hot ? white : p.glow, { scan: a.hot ? null : fract(loop + 0.15), lit: a.hot ? null : at(lit), light: a.hot ? 0 : 2 });
      if (p.shape === 'orb' && !a.hot) meridians(g, CX, hy, R, loop, p.glow);     // two lines of longitude sweep across the orb as it turns
      if (resting) particles(g, { t: loop, x: CX, y: s.top - 1, count: 3, seed: 4, angle: PI, arc: 0.9, dist: Math.max(2, s.top - hy - R), size: 1.2, colours: [tone(p.glow, 0.9), p.glow, tone(p.glow, -1)] });   // motes rise from the projector
    }
    if (a.streak) {
      // the hologram gone to a streak of light
      const y0 = lerp(hy + R, 2, a.streak[0]), y1 = lerp(hy + R, 2, a.streak[1]);
      hologram(g, capsuleIn(CX, y0, CX, y1 + 1, a.streak[0] ? 1 : 1.6, 1), white, { light: 0 });
    }
    if (a.sparks) {
      // what it leaves in the air for a moment
      const size = a.sparks === 3 && !a.streak ? 1 : a.streak ? 1 : 0;
      for (let i = 0; i < a.sparks; i++) twinkle(g, CX + [-3, 2, -1][i], Math.max(3, Math.round(lerp(hy - R, 4, (i + 1) / 3)) - (frame - 4)), size, p.glow);
    }
  },
});
