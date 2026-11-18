// Spike trap: a row of spikes across one tile that sinks into the floor and snaps back out.
// The four clips are one cycle, in the order a game steps through them: `idle` (out), `retract`
// (sinks slowly; ends on the tips), `warn` (only the tips, twitching), `attack` (snaps out with an
// overshoot; ends on `idle`).
//
// A spike is a rigid thing that slides: its picture never changes, only how much of it is above
// the ground line. So every spike is drawn whole at its height for the frame, then everything
// below the ground line is cut away and the base plate (if any) is laid over its foot.
// Retracted, the tips still stand 4 px above the ground line (7 px with the plate, which is 4 px
// tall), at any length: the trap is never an empty frame.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { Surface, rectIn } from '../engine/surface.js';
import { spikeIn } from '../engine/shapes.js';
import { lerp } from '../engine/motion.js';
import { ramp, tone, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { twinkle } from '../engine/fx.js';

const P = PALETTE.thornwood;
const SIZE = 32, GROUND = 29;                                  // the last row above the ground line; its outline lands on row 30
const X0 = 2, WIDTH = 28;                                      // the spikes share columns 2..29: 30 px with the outline
const PLATE = 4;                                               // height of the base plate
// the tips sit on the spikes: the two lists share no colour
const METAL = swatches('thornwood', 'metal');
const ACCENT = swatches('thornwood', 'accent', { lead: 'crimson' }).filter((c) => !METAL.includes(c));
const COUNT = { three: 3, four: 4, five: 5 };

// What each style is made of (from the Metal colour, so the control always matters), how the spikes
// differ in height along the row, and the outline of one spike: its half width and the sideways shift
// of its middle, d px below the tip of a spike `full` px long and `hw` px wide at the foot.
// k runs 0 at the tip to 1 at the foot; `side` is -1 or 1, alternating along the row; `lean` is -1, 0 or 1,
// towards the middle of the row.
const STYLES = {
  metal: {
    body: (c) => c,
    tall: [1, 1, 1, 1, 1],
    half: (k, hw) => 0.5 + (hw + 0.4) * k,                     // a straight cone; the feet of neighbours meet, so the row is one zigzag
    shift: () => 0,
  },
  bone: {
    body: (c) => mix(c, P.cream, 0.6),
    tall: [0.9, 1, 0.84, 1, 0.9],
    half: (k, hw) => 0.6 + (hw * 0.72 - 0.6) * k ** 0.6,       // a tusk: nearly as thick half way up as at the foot
    shift: (k, hw, side, lean) => lean * hw * 0.5 * (1 - k) ** 2,   // curving in towards the middle of the row, like teeth in a jaw
  },
  thorn: {
    body: (c) => mix(c, P.leaf, 0.55),
    tall: [1, 0.86, 1, 0.9, 1],
    half: (k, hw) => 0.9 + (hw - 0.9) * k ** 1.3,              // flaring wide at the foot
    shift: (k, hw) => hw * 0.7 * (1 - k) ** 1.6,               // hooked, all the same way
  },
  crystal: {
    body: (c) => mix(c, P.magic, 0.5),
    tall: [0.74, 1, 0.66, 0.92, 0.8],
    half: (k, hw) => (k < 0.3 ? 0.5 + (hw * 0.85 - 0.5) * (k / 0.3) : hw * (0.85 + 0.15 * (k - 0.3) / 0.7)),   // a cut point on a straight shaft
    shift: (k, hw, side) => side * hw * 0.55 * Math.max(0, 1 - k / 0.3),   // the point is off to one side
  },
};

// How far out the spikes are this frame: `out` 0 (only the tips) to 1 (fully out), `over` extra px,
// and `twitch(i)` px for spike i.
function reach(clip, frame) {
  if (clip === 'retract') return { out: 1 - frame / 5, over: 0, twitch: () => 0 };
  if (clip === 'warn') return { out: 0, over: 0, twitch: (i) => [0, i % 2 ? 2 : 0, 1, i % 2 ? 0 : 2][frame] };
  if (clip === 'attack') return { out: [0, 0.62, 1, 1, 1, 1][frame], over: [0, 0, 2, -1, 1, 0][frame], twitch: () => 0 };
  return { out: 1, over: 0, twitch: () => 0 };
}

export default defineSprite({
  id: 'spike-trap',
  name: 'Spike trap',
  kind: 'Item',
  blurb: 'A row of floor spikes that sinks, twitches a warning and snaps back out; change what the spikes are made of, how many and how long they are, the base plate and the colours.',
  meta: {
    type: 'prop',
    role: 'world/hazard',
    themes: ['fantasy', 'forest'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['spikes', 'spike', 'trap', 'hazard', 'danger', 'retract', 'stab', 'floor spikes', 'thorns', 'crystal', 'sharp', 'damage', 'pit'],
    license: 'draft',
  },
  size: [SIZE, SIZE],
  pivot: [16, 30],
  params: {
    style: choice('Style', 'metal', ['metal', 'bone', 'thorn', 'crystal']),
    count: choice('Spikes', 'four', ['three', 'four', 'five']),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    base: toggle('Base plate', true),
    metal: color('Metal', P.steel, METAL),
    accent: color('Tips', P.crimson, ACCENT),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true, label: 'Out' },
    retract: { frames: 6, fps: (p) => 9 * lerp(0.65, 1.45, p.speed), loop: false },
    warn: { frames: 4, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
    attack: { frames: 6, fps: (p) => 14 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Extend' },
  },
  sounds: { attack: [{ sound: 'sword-slash', preset: 'Quick dagger', frame: 1, volume: 0.7 }] },

  render(g, { clip, frame, p }) {
    const S = STYLES[p.style], n = COUNT[p.count];
    const body = ramp(S.body(p.metal)), tip = ramp(p.accent);
    const long = Math.round(lerp(12, 22, p.length));
    const pitch = WIDTH / n, hw = pitch / 2 - 0.4;
    const least = p.base ? PLATE + 3 : 4;                      // what still shows when retracted
    const { out, over, twitch } = reach(clip, frame);

    const s = new Surface(SIZE, SIZE);
    const above = rectIn(X0, 0, WIDTH, GROUND + 1);            // inside the tile and above the ground line
    const tops = [];
    for (let i = 0; i < n; i++) {
      const full = Math.max(least + 2, Math.round(long * S.tall[(i + (n === 3 ? 1 : 0)) % 5]));
      const shown = Math.round(lerp(least, full, out)) + (out === 1 ? over : 0) + twitch(i);
      const xc = X0 + pitch * (i + 0.5), top = GROUND + 1 - shown, side = i % 2 ? -1 : 1;
      const lean = Math.sign(Math.round(16 - xc));               // -1, 0 or 1: towards the middle of the row
      const red = Math.max(3, Math.round(full * 0.26));         // rows of tip colour
      // The spike is three shape fills, lit from the top right: the whole spike, tip at `top` and foot
      // `full` px below it (under the ground line while it is sunk); the part of it thick enough to
      // have a shaded side, of which only the leftmost pixel column is painted; and the lit right
      // face, a narrower spike laid over its right side and kept on the spike.
      const half = (k) => S.half(k, hw), shift = (k) => S.shift(k, hw, side, lean);
      const foot = top + full, shank = Math.max(0, GROUND + 1 - foot);
      const spike = spikeIn(xc, top, foot, half, shift, shank);
      const thick = spikeIn(xc, top, foot, (k) => (half(k) >= 2.4 ? half(k) : -1), shift, shank);
      const face = spikeIn(xc, top, foot, (k) => half(k) * 0.425, (k) => shift(k) + half(k) * 0.575, shank);
      const box = [xc - pitch, top, xc + pitch, GROUND + 1];
      const paint = (R, rows) => {
        s.fill(...box, spike, R.base, { clip: rows });
        s.fill(...box, thick, R.dark, { clip: (px, py) => rows(px, py) && !spike(px - 1, py) });
        s.fill(...box, face, R.light, { clip: (px, py) => rows(px, py) && spike(px, py) });
      };
      paint(body, above);
      paint(tip, (px, py) => above(px, py) && py < top + red);  // the top `red` rows again, in the tip colour
      tops.push([Math.round(xc + S.shift(0, hw, side, lean) - 0.5), top]);
    }

    if (p.base) {
      // the plate the spikes come through: lit along its top, a dark slot under every spike, a bolt at each end
      const plate = ramp(tone(S.body(p.metal), -0.9)), y = GROUND + 1 - PLATE;
      s.rect(X0, y, WIDTH, PLATE, plate.base);
      s.rect(X0, y, WIDTH, 1, plate.light);
      s.rect(X0, GROUND, WIDTH, 1, plate.dark);
      for (let i = 0; i < n; i++) {
        const xc = X0 + pitch * (i + 0.5);
        s.rect(Math.round(xc - hw), y, Math.round(2 * hw), 1, plate.dark);
      }
      for (const x of [X0 + 1, X0 + WIDTH - 3]) s.rect(x, y + 2, 2, 1, plate.light);
    }
    g.blit(s);
    g.outline(INK);

    // the snap: a glint on two of the tips as they reach full height
    if (clip === 'attack' && frame === 2) for (const i of [0, n - 2]) twinkle(g, tops[i][0], tops[i][1] - 1, 1, body.light);
  },
});
