// FROZEN COPY, not a sprite: sprites/ui-crosshair.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Crosshair (kit-roguelite-scifi, batch S20): the aiming cursor of a twin-stick shooter.
// Four marks round a centre dot, drawn about the exact centre of the frame (the point where
// pixels 15 and 16 meet), so the picture is the same mirrored or turned a quarter. That point is
// the pivot and the exported `tip` socket: the hot spot a game aims with.
//   idle    the marks breathe 1 px, the upright pair and the level pair in turn (out and back; brackets
//           in and back: the box closes on the target); with Spin on a cross, a circle or arrow heads also
//           make a quarter turn per loop in four steps (it closes: the marks are four of a kind). An arrow
//           head is redrawn at each step as two clean bars from its point, so it stays the same V all the
//           way round. Brackets do not spin: a corner piece with arms 5 to 7 px long cannot be turned an
//           eighth without its notch closing up, so the Spin control is not offered for them
//   shoot   the marks jump out 3 px on frame 0 and come back by the last frame
//   reload  the marks dim and an arc with a bright head goes round once, in a lane of its own: outside
//           the marks (a big cross or circle and the arrow heads draw in to leave it room), or, for
//           brackets, whose corners reach too far out, round the dot inside them (small ones step out)
//   hit     four diagonal ticks flash white, then burn in the accent colour and fly out. They never touch
//           the marks (an ink line, or an empty pixel, is always between): they sit between the arms of a
//           cross, beyond a ring (or through its breaks, when the gap is wide enough to hold them), beyond
//           arrow heads, and inside the box of brackets
// Straight marks (cross, circle) are 2 or 4 px thick (never odd: an odd line cannot sit on the centre
// point). Corner pieces and arrow heads are 2 or 3: their line doubles where two arms meet, so 3 px
// there weighs what 4 does on a straight mark, and leaves room for an opening you can see through.
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { lerp, fract, PI, TAU } from '../../../engine/motion.js';
import { tone, INK } from '../../../engine/color.js';
import { rectIn } from '../../../engine/surface.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { spunIn, reachOf, cornerIn, grownIn } from '../../../engine/shapes.js';

const P = PALETTE.derelict;
const C = 16;                                        // the centre point: pivot, hot spot and centre of every turn
const KICK = 3;
const FAR = 11;                                      // cross, circle, arrow heads: no mark reaches further along its axis at rest. With the kick that is 14, and the ink line stays off the frame's edge
const BOX = 10;                                      // brackets: half the widest box. Its corners are the farthest points of any style: at 10, with the kick, their ink line is on pixel 13
const WING = 5;                                      // columns of an arrow head on each side of its point: the notch between the wings is then 3 px deep inside the ink
const LANE = 13;                                     // reload: the widest arc that stays in the frame has its middle line 13 px out (2 px of arc, then its ink line on pixel 14)
const INNER = 5;                                     // reload: the middle line of an arc that goes round the dot instead, one clear pixel outside the dot's ink line
const CLEAR = 4.2;                                   // from a mark's last pixel to the middle line of the arc: ink, a clear pixel, ink, half the arc, and the slack of the pixel grid on a slant
const EDGE = 13;                                     // hit: the last pixel out along a diagonal that a tick may cover (its ink line is then on pixel 14)
const TURN = [0, Math.atan(0.5), PI / 4, Math.atan(2)];
const SPINS = ['cross', 'circle', 'chevrons'];       // the styles that can turn (see the header for why brackets cannot)

const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

/**
 * Sizes in pixels from the settings, per style.
 * cross, circle: th thickness, gap clear space round the centre, R reach from the centre.
 * brackets: th thickness, open from an axis to the end of an arm (so two neighbours never close the box), S half the box.
 * chevrons: deep thickness of the arrow head measured along its axis, gap from the centre to its point, wing columns on each side.
 */
function dims(p) {
  const chunky = p.thickness >= 0.5, size = Math.round(lerp(7, FAR, p.size));
  if (p.style === 'brackets') {
    // the opening between two neighbours is twice `open`, less their ink lines: 4 px at the tightest (3 for the moment one
    // pair breathes in). An arm is at least 3 px longer than it is thick: shorter, the ink line fills the corner and the
    // piece is only a block. The box is never more than BOX px to a side of the centre
    const th = chunky ? 3 : 2, open = Math.round(lerp(3, BOX - th - 3, p.gap));
    return { th, open, S: Math.max(Math.round(lerp(7, BOX, p.size)), open + th + 3) };
  }
  if (p.style === 'chevrons') {
    // the wings come first (never fewer than WING columns), then the gap, then the size, in what room the frame leaves.
    // The point is never closer than 3 px: closer, the ink lines of two neighbours' wings would touch
    const deep = chunky ? 3 : 2, gap = Math.round(lerp(3, FAR + 1 - deep - WING, p.gap));
    return { deep, gap, wing: Math.max(size, gap + deep + WING - 1) + 1 - deep - gap };
  }
  const th = chunky ? 4 : 2, gap = Math.round(lerp(th / 2 + 1, th / 2 + 4, p.gap));
  return { th, gap, R: Math.max(size, gap + 3) };               // 3 px of mark at the least
}

/** The marks as they wait out a reload, drawn in to leave the arc a lane outside them: a cross no longer than 9 px, a circle no wider than 8, arrow heads in their smallest form. Brackets keep their shape and step out instead (see render). */
function waiting(style, D) {
  if (style === 'brackets') return D;
  if (style === 'chevrons') return { deep: 2, gap: 3, wing: WING - 1 };
  return { ...D, R: Math.min(D.R, style === 'circle' ? 8 : 9) };
}

/** One straight mark (cross, circle), drawn round (0, 0) at the top, moved `d` px outward: a shape test for spunIn, which also turns it. */
function mark(style, D, d) {
  if (style === 'cross') return rectIn(-D.th / 2, -D.R - d, D.th, D.R - D.gap);
  // a quarter of a ring, shorter the wider the gap: tight leaves a 2 px break at each diagonal
  const { th, gap } = D, out = D.R + d, o2 = out * out, i2 = (out - th) * (out - th), k = lerp(0.82, 0.42, (gap - th / 2 - 1) / 3);
  return (x, y) => { const r2 = x * x + y * y; return y < 0 && r2 <= o2 && r2 > i2 && Math.abs(x) < -y * k; };
}

/** One corner piece (brackets) or arrow head (chevrons) round (0, 0), moved `d` px outward: two clean bars from its tip. An arrow head is first turned by `angle`. */
function corner(style, D, d, angle = 0) {
  // brackets: the corner at the top right of a box; both arms stop `open` px short of the axes
  if (style === 'brackets') { const S = D.S + d, len = D.S - D.open; return cornerIn(S - 0.5, 0.5 - S, -len, 0, 0, len, D.th); }
  // chevrons: an arrow head pointing at the centre, its point `gap` px away, its wings sloping back and out. Turned, its point
  // and its wings are turned and the bars drawn afresh; it then moves outward by whole pixels, along the nearest of the eight ways
  const c = Math.cos(angle), s = Math.sin(angle), turn = (x, y) => [x * c - y * s, x * s + y * c];
  const [tx, ty] = turn(0, -D.gap - 0.5), [ox, oy] = turn(0, -1), most = Math.max(Math.abs(ox), Math.abs(oy));
  const step = (v) => (Math.abs(v) > 0.6 * most ? Math.sign(v) * d : 0);
  // its wings are `deep` px per column on the slant, which is deep / 1.41 px across; never under 1.6, so no turn thins them to a hairline
  return cornerIn(tx + step(ox), ty + step(oy), ...turn(D.wing, -D.wing), ...turn(-D.wing, -D.wing), Math.max(1.6, D.deep / Math.SQRT2));
}

/** The four marks as two pairs (upright and level), each moved outward by its own amount and all turned by `angle`. */
function marks(style, D, dA, dB, angle = 0) {
  const bars = style === 'brackets' || style === 'chevrons';
  const a = bars ? spunIn(corner(style, D, dA, angle), C, C, 2) : spunIn(mark(style, D, dA), C, C, 2, angle);
  const b = bars ? spunIn(corner(style, D, dB, angle), C, C, 2, PI / 2) : spunIn(mark(style, D, dB), C, C, 2, angle + PI / 2);
  return (px, py) => a(px, py) || b(px, py);
}

/** Four diagonal ticks of a hit marker, covering pixels `from` to `to` counted out from the centre: a shape test. */
function ticks(from, to) {
  const one = (x, y) => { const far = Math.max(x, -y); return x > 0 && y < 0 && Math.abs(x + y) < 1.25 && far > from && far < to + 1; };
  return spunIn(one, C, C, 4);
}

/**
 * Where the hit ticks may lie so that they never touch the marks: [from, to], pixels counted out from the centre along a diagonal.
 * Brackets hold them inside the box, from the dot to the last pixel clear of the corner piece. Every other style has them start
 * where the diagonal is clear all the way out: between the arms of a cross, through the breaks of an open circle, beyond a ring.
 * "Clear" is one pixel between tick and mark, which the ink line fills; arrow heads run alongside the ticks and would still read
 * as one shape with them, so there it is two, and the ticks start beyond the wings.
 */
function tickRoom(style, shape) {
  const near = grownIn(shape, style === 'chevrons' ? 2 : 1);
  const clear = (i) => !(near(C + i + 0.5, C - i - 0.5) || near(C + i + 0.5, C - i + 0.5) || near(C + i - 0.5, C - i - 0.5));      // the three pixels of a tick, `i` out
  let from = EDGE, to = 2;
  if (style === 'brackets') { while (to < EDGE && clear(to + 1)) to++; return [2, to]; }
  while (from > 2 && clear(from - 1)) from--;
  return [from, EDGE];
}

export default defineSprite({
  id: 'ui-crosshair',
  name: 'Crosshair',
  kind: 'Item',
  blurb: 'An aiming cursor that breathes, kicks when firing, shows a reload sweep and flashes a hit marker; change its style, size, gap, thickness, spin and colours.',
  meta: {
    type: 'ui', role: 'interface/cursor', themes: ['sci-fi', 'neutral'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'none',
    words: ['crosshair', 'reticle', 'cursor', 'aim', 'target', 'sight', 'pointer', 'shoot', 'reload', 'hit', 'marker', 'mouse'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [C, C],
  grounded: false,
  preview: 'idle',
  // the hot spot is the centre in every frame of every clip
  sockets: () => ({ tip: { x: C, y: C, angle: 0 } }),
  params: {
    style: choice('Style', 'cross', ['cross', 'circle', 'brackets', 'chevrons']),
    size: range('Size', 0.6, { lo: 'Small', hi: 'Big' }),
    gap: range('Gap', 0.35, { lo: 'Tight', hi: 'Open' }),
    thickness: range('Thickness', 0.25, { lo: 'Thin', hi: 'Chunky' }),
    spin: toggle('Spin', false, { when: { style: SPINS } }),
    body: color('Body', P.cream, swatches('derelict', 'core', { lead: 'cream' })),
    accent: color('Accent', P.red, swatches('derelict', 'accent', { lead: 'red' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: fps(8), loop: true },
    shoot: { frames: 4, fps: fps(14), loop: false, label: 'Firing' },
    reload: { frames: 8, fps: fps(10), loop: true },
    hit: { frames: 4, fps: fps(12), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    let D = dims(p), dA = 0, dB = 0, angle = 0, colour = p.body;
    if (clip === 'idle') {
      // each pair is out for half the loop, a quarter of a loop apart; both are in on frame 0
      // (when it spins the breathing falls on the frames between two turns, so every frame moves)
      const spins = p.spin && SPINS.includes(p.style), late = spins ? 0.125 : 0, breath = p.style === 'brackets' ? -1 : 1;
      dA = fract(t + late) < 0.5 ? 0 : breath;
      dB = fract(t + 0.25 + late) < 0.5 ? 0 : breath;
      // spinning: a quarter turn per loop in four steps whose lines are clean in pixels (level, one up
      // for two along, the diagonal, two up for one along), two frames each
      if (spins) angle = TURN[frame >> 1];
    } else if (clip === 'shoot') dA = dB = KICK - frame;
    else if (clip === 'reload') {
      D = waiting(p.style, D);
      colour = tone(p.body, -1.4);
      // brackets step out until the arc has room to go round the dot inside them
      if (p.style === 'brackets') while (reachOf(marks(p.style, D, dA, dA), C, C, 32).near < INNER + CLEAR) dA++;
      dB = dA;
    }
    const shape = marks(p.style, D, dA, dB, angle);
    g.fill(0, 0, 32, 32, shape, colour);

    if (clip === 'reload') {
      // the arc is 2 px wide and its ink line starts 2 px beyond the farthest pixel of the marks; where that
      // would leave the frame it goes round the dot instead, with a longer sweep to make up for the small circle.
      // It runs clockwise from the top: a bright head, and a tail between the head and the dimmed marks in value
      const round = Math.ceil(reachOf(shape, C, C, 32).far + CLEAR), r = round <= LANE ? round : INNER;
      const start = PI - TAU * t, head = lerp(1.2, 0.6, (r - INNER) / (LANE - INNER)), tail = 2.3 * head;
      g.arc(C, C, r, start + head, start + head + tail, 2, tone(p.body, -0.7));
      g.arc(C, C, r, start, start + head, 2, p.body);
    }
    if (clip === 'hit' && frame < 3) {
      // five pixels long while they flash, then four, two further out (or as far out as their room goes)
      const [from, to] = tickRoom(p.style, shape), start = frame === 2 ? Math.min(from + 2, to - 1) : from;
      g.fill(0, 0, 32, 32, ticks(start, Math.min(to, start + (frame === 2 ? 3 : 4))), frame === 0 ? '#ffffff' : p.accent);
    }

    // the centre dot marks the hot spot
    g.rect(C - 1, C - 1, 2, 2, p.accent);
    g.outline(INK);
  },
});
