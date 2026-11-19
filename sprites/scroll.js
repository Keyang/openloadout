// Scroll (core-sprites-1, batch K03): a quest item, a spell to learn, a piece of a map. A rolled scroll
// tied with a ribbon, a half-open scroll on two rods with wavy lines of writing (never letters), or a
// folded letter, each with an optional wax seal. It rocks gently as it bobs. Collecting it is the
// standard pickup pop (engine/pickups.js). The three kinds are drawn by drawScroll in engine/prizes.js;
// this file gives them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave } from '../engine/motion.js';
import { INK, ramp } from '../engine/color.js';
import { Surface, tilt, ellipseIn, rectIn, capsuleIn } from '../engine/surface.js';
import { placedIn } from '../engine/shapes.js';
import { PALETTE } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, gleam } from '../engine/pickups.js';
import { SCROLL_KINDS, prizeReach, drawScroll } from '../engine/prizes.js';
import { ICON_DIAGONAL, iconPaint, iconLine } from '../engine/icons.js';

const P = PALETTE.thornwood;
const CX = 16;
const ROCK = 0.1;                                 // how far the rolled scroll rocks each way, in radians: its ends move about 1 px
// a round wax seal 5 px across (rows 3-5-5-5-3), a shade darker than the ribbon so the two never read as one mark
const DISC = [[-1, 1], [-2, 2], [-2, 2], [-2, 2], [-1, 1]];
// a rod end: a 3x3 block of wood, lit at the top right and shaded at the bottom left, the same pixels at every slant
const KNOB = [[-1, -1, 'dark'], [0, -1, 'base'], [1, -1, 'base'], [-1, 0, 'deep'], [0, 0, 'dark'], [1, 0, 'base'], [-1, 1, 'deep'], [0, 1, 'deep'], [1, 1, 'dark']];
const HALF = 8.6, ROUND = 4;                    // the tube's half length and half thickness, in pixels at scale 1
// how far the rolled scroll reaches from its centre at scale 1 (up, down, side), lying on the diagonal and rocked
const ROLLED_REACH = { up: 9, down: 10, side: 10 };

// A pen like icons.js iconPen (shapes written lying flat around (0, 0)), but squashed by the collect pop.
function rollPen(cx, cy, { k, sx, sy, angle }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { k, angle, shade: true, shine: true, cx, cy,
    pt: (x, y) => [cx + k * (x * sx * c - y * sy * s), cy + k * (x * sx * s + y * sy * c)],
    at: (test) => placedIn(test, cx, cy, { angle, sx: k * sx, sy: k * sy }) };
}

// The rolled scroll, lying on the diagonal (low end left, like the rolled map of icons-key-items): a tube of
// paper with the roll seen end-on at the lower end, its loose edge along it, a rod end poking out of both ends,
// a ribbon round its middle whose two short ends lie on the paper, and the seal to the right of the ribbon.
function drawRolled(g, cx, cy, { k, sx, sy, angle, paper, ribbon, rods, seal, bare }) {
  const pen = rollPen(cx, cy, { k, sx, sy, angle }), Pp = ramp(paper), Rb = ramp(ribbon), Rd = ramp(rods);
  const tube = [rectIn(-HALF, -ROUND, 2 * HALF + 0.6, 2 * ROUND)];                           // cut square at the far end
  iconPaint(g, pen, [...tube, ellipseIn(-HALF - 0.6, 0, 2, ROUND)], Pp, { soft: 2 });
  if (!bare) iconLine(g, pen, [[-HALF + 2, 1.3], [HALF - 1, 1.3]], Pp.dark, { over: true });   // the loose edge of the sheet
  iconPaint(g, pen, ellipseIn(-HALF - 0.6, 0, 2, ROUND), Pp.dark, { flat: true });              // the roll, end-on, round the rod
  // the ribbon: a band round the middle and two short ends lying on the paper below it, never past the tube
  iconPaint(g, pen, [capsuleIn(-0.6, 1.2, -2.8, ROUND + 0.4, 0.8), capsuleIn(0.2, 1.2, 2.2, ROUND + 0.4, 0.8)], Rb.dark, { flat: true, clip: rectIn(-HALF, -ROUND - 1, 2 * HALF, 2 * ROUND + 1.6) });
  const onTube = (x, y) => tube.some((f) => f(x, y));
  iconPaint(g, pen, rectIn(-1.6, -ROUND - 1, 3.2, 2 * ROUND + 2), Rb, { soft: 0, rim: INK, clip: onTube });   // flush with the tube's edges
  // a rod end at each end of the tube: fixed 3x3 blocks, so they keep their size whatever the slant or squash
  if (k * Math.min(sx, sy) > 0.6) {
    for (const along of [-HALF - 1.4, HALF + 2.2]) {
      const [fx, fy] = pen.pt(along, 0), X = Math.round(fx - 0.5), Y = Math.round(fy - 0.5);
      for (const [dx, dy, tone] of KNOB) g.dot(X + dx, Y + dy, Rd[tone]);
    }
  }
  if (seal) {
    const [fx, fy] = pen.pt(4.8, -0.2), x = Math.round(fx - 0.5), y = Math.round(fy - 0.5);
    DISC.forEach(([a, b], i) => { for (let dx = a; dx <= b; dx++) g.dot(x + dx, y - 2 + i, Rb.dark); });
    if (!bare) { g.dot(x - 1, y - 1, Rb.base); g.dot(x, y, Rb.deep); }   // a lit corner and a pressed middle
  }
  return { glint: pen.pt(-4.6, -ROUND - 0.6) };                        // on the upper edge, clear of both rod ends
}

export default defineSprite({
  id: 'scroll',
  name: 'Scroll',
  kind: 'Item',
  blurb: 'A floating scroll or sealed letter to collect: a quest item, a spell or a map. Change its kind, size, seal, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/key', themes: ['neutral', 'fantasy'], gameTypes: ['top-down-rpg', 'turn-based-rpg', 'platformer', 'arcade'], view: 'front',
    words: ['scroll', 'letter', 'map', 'parchment', 'paper', 'message', 'spell', 'quest', 'note', 'seal', 'collect', 'read'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'rolled', SCROLL_KINDS),
    seal: toggle('Seal', true),
    sparkle: toggle('Sparkle', true),
    body: color('Paper', P.cream, [P.cream, '#d8d8e0', '#e0b040', PALETTE.hearthvale.wheat], { material: 'paint' }),
    accent: color('Ribbon', P.crimson, [P.crimson, P.gold, P.hero, P.thorn, P.ember, '#4f9d57'], { when: [{ shape: ['rolled'] }, { seal: [true] }] }),
    wood: color('Rods', P.wood, [P.wood, P.soil, '#a8612a', '#5a3a22', '#c98a4a', P.steel], { when: { shape: ['rolled', 'open'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'item-get', preset: 'Storybook', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Sealed scroll', params: {} },
    { name: 'Open scroll', params: { shape: 'open', seal: false } },
    { name: 'Letter', params: { shape: 'letter', accent: P.hero } },
    { name: 'Old map', params: { shape: 'open', body: PALETTE.hearthvale.wheat } },
    { name: 'Royal decree', params: { accent: P.gold, wood: P.steel } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.82, 1.06, p.size), rolled = p.shape === 'rolled', r = rolled ? ROLLED_REACH : prizeReach('scroll', p.shape);
    const cy = Math.round(16.5 + ((r.up - r.down) * k) / 2);
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up * k + 1, down: r.down * k + 1, side: r.side * k + 1 });
    const idle = clip === 'idle';
    const y = Math.round(at.y);
    let glintAt = [CX + r.side * k - 2, at.y - r.up * k + 1];
    if (at.show) {
      // It rocks a little each way, half a loop after the float. The rolled scroll is drawn turned (its shapes
      // turn, and the rod ends and seal are fixed pixel blocks, so it keeps its thickness and its ends); the flat
      // kinds are drawn upright and slid by whole pixels, which keeps every pixel of the paper.
      const step = idle ? Math.round(wave(t, 0.5)) : 0;
      if (rolled) {
        const out = drawRolled(g, CX, y, { k, sx: at.sx, sy: at.sy, angle: -ICON_DIAGONAL + step * ROCK, paper: p.body, ribbon: p.accent, rods: p.wood, seal: p.seal, bare: at.bare });
        glintAt = out.glint;
      } else {
        const s = new Surface(g.w, g.h);
        drawScroll(s, CX, y, { kind: p.shape, k, sx: at.sx, sy: at.sy, paper: p.body, ribbon: p.accent, rods: p.wood, seal: p.seal, bare: at.bare });
        g.blit(step ? tilt(s, CX, y, step * 0.08) : s);
      }
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, glintAt[0], glintAt[1], t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side * k, colour: p.body, sparkle: p.sparkle });
  },
});
