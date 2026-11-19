// Keycard (kit-roguelite-scifi, batch S15): the card that opens a locked blast door. Held at a slant,
// it floats and rocks while a glint slides along its coloured stripe (the stripe says which door) and
// its status light blinks. Other shapes: a data chip with a cut corner and contact pins, and a round
// fob on a ring. Collecting it is the standard pickup pop (engine/pickups.js).
// The card is written upright and leaned by sliding whole rows (leanedIn in engine/gadgets.js), never
// turned, so its edges, its slot and its light stay hard at every angle of the rock.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp } from '../engine/motion.js';
import { ramp, mix, INK } from '../engine/color.js';
import { ellipseIn, rectIn } from '../engine/surface.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { placedIn, ringIn, allIn, boundsOf } from '../engine/shapes.js';
import { roundRectIn, cutRectIn } from '../engine/ui.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { chevronIn, leanedIn } from '../engine/gadgets.js';

const P = PALETTE.derelict;
const CX = 16, CY = 16;
const SLANT = 0.375, ROCK = 0.125;      // how far a row slides for each row it is above the middle: at rest, and more or less as it rocks (never past one pixel for two rows)
const FULL = [0, 0, 32, 32];

// The stripe across a body w wide, its top edge at row y: one band, two bands or a chevron. Returns [tests, middle row].
function stripeOf(kind, w, y) {
  if (kind === 'two') return [[rectIn(-w / 2, y, w, 2), rectIn(-w / 2, y + 3, w, 2)], y + 2.5];
  if (kind === 'chevron') return [[chevronIn(0, y + 3, w, 6, 2)], y + 3];
  return [[rectIn(-w / 2, y, w, 3)], y + 1.5];
}

// The thing upright, its middle at (0, 0), h tall at the size of the card: { body, pins, stripe, mid, bezel, lamp, marks }, all lists
// of shape tests (body: the casing; pins: bare metal; the stripe is kept inside the body; mid: the row the middle of the stripe
// is on; marks: small dark details: a lanyard slot, lines of print).
function cardShapes(shape, stripes, h) {
  if (shape === 'chip') {
    // a data chip: square, one corner cut off, three contact pins along its foot
    const s = h - 4, top = -s / 2 - 1, [stripe, mid] = stripeOf(stripes, s, top + 3);
    return { body: [cutRectIn(-s / 2, top, s, s, [0, 4, 0, 0])], pins: [-s / 2 + 2, -1, s / 2 - 4].map((x) => rectIn(x, top + s, 2, 2)), stripe, mid,
      bezel: [rectIn(-s / 2 + 2, top + s - 6, 5, 4)], lamp: [rectIn(-s / 2 + 3, top + s - 5, 3, 2)], marks: [rectIn(s / 2 - 5, top + s - 5, 3, 1), rectIn(s / 2 - 5, top + s - 3, 2, 1)] };
  }
  if (shape === 'fob') {
    // a fob: a round tag on a short neck, hanging from a ring
    const r = Math.round(h / 3), cy = h / 2 - r, top = -h / 2, [stripe, mid] = stripeOf(stripes, 2 * r, cy - r + 3);
    return { body: [ellipseIn(0, cy, r, r), rectIn(-2, top + 6, 4, cy - r - top - 4)], pins: [ringIn(0, top + 4, 4, 1.6)], stripe, mid,
      bezel: [rectIn(-3, cy + 1, 6, 4)], lamp: [rectIn(-2, cy + 2, 4, 2)], marks: [] };
  }
  // a card: half as tall again as it is wide, round corners, a slot for a lanyard, two lines of print
  const w = 2 * Math.round(h / 3), top = -h / 2, [stripe, mid] = stripeOf(stripes, w, top + 4);
  return { body: [roundRectIn(-w / 2, top, w, h, 2)], pins: [], stripe, mid,
    bezel: [rectIn(-w / 2 + 2, h / 2 - 7, 5, 5)], lamp: [rectIn(-w / 2 + 3, h / 2 - 6, 3, 3)],
    marks: [rectIn(-2, top + 2, 4, 1), rectIn(w / 2 - 4, h / 2 - 6, 2, 1), rectIn(w / 2 - 4, h / 2 - 4, 2, 1)] };
}

export default defineSprite({
  id: 'keycard',
  name: 'Keycard',
  kind: 'Item',
  blurb: 'A security card held at a slant, with a coloured stripe and a blinking light: it opens a locked door. Make it a card, a data chip or a fob, and change its stripes and colours.',
  meta: { type: 'pickup', role: 'items/key', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade', 'puzzle'], view: 'front',
    words: ['keycard', 'key', 'card', 'access', 'pass', 'security', 'unlock', 'open', 'door', 'chip', 'fob', 'collect', 'pickup', 'clearance'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'card', ['card', 'chip', 'fob']),
    stripes: choice('Stripes', 'one', ['one', 'two', 'chevron']),
    sparkle: toggle('Sparkle', true),
    body: color('Card', P.panel, swatchesBetween('derelict', 'metal', { lead: 'panel', min: 0.45 }), { material: 'paint' }),      // no dark card: it would merge with the outline
    accent: color('Stripe', P.red, swatches('derelict', 'accent', { lead: 'red' }), { material: 'signal' }),
    glow: color('Light', P.cyan, swatches('derelict', 'glow')),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'credit-pickup', preset: 'Keycard', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const h = 2 * Math.round(lerp(8, 10, p.size)), K = cardShapes(p.shape, p.stripes, h);
    // measure the leaning card at rest, so that it sits in the middle of the frame whatever its shape and size
    const rest = boundsOf(placedIn(leanedIn([...K.body, ...K.pins], 0, SLANT), 16, 16), 32, 32);
    const ox = Math.round(CX - (rest.x0 + rest.x1 + 1) / 2), wide = (rest.x1 - rest.x0 + 1) / 2 + 2;       // two more pixels each way for the rocking
    const idle = clip === 'idle';
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY, up: h / 2 + 1, side: wide + 1 });
    const x = 16 + ox, y = at.y;
    const slope = SLANT + (idle ? ROCK * wave(t) : 0);        // rocks its top and its foot about a pixel each way, starting from rest
    const put = (tests) => placedIn(leanedIn(tests, 0, slope), x, y, { sx: at.sx, sy: at.sy });
    const M = ramp(p.body), A = ramp(p.accent);

    if (at.show) {
      const body = put(K.body);
      if (K.pins.length) g.fill(...FULL, put(K.pins), ramp(P.steel));
      g.fill(...FULL, body, M, { light: 1 });
      const stripe = allIn(put(K.stripe), body);
      g.fill(...FULL, stripe, A);
      // a lit edge along the top of the stripe (its foot is the stripe's own dark tone): it is told from the card by value in every look
      g.fill(...FULL, (px, py) => body(px, py) && !stripe(px, py) && stripe(px, py + 1), M.light);
      if (!at.bare) {
        g.fill(...FULL, put(K.marks), M.dark, { clip: body });
        g.fill(...FULL, put(K.bezel), P.plate, { clip: body });
        // the status light: lit, and flaring for a quarter of the loop
        const flare = idle && t >= 0.5 && t < 0.75;
        g.fill(...FULL, put(K.lamp), flare ? '#ffffff' : p.glow, { clip: body });
        // the glint slides along the stripe in the first half of the loop
        if (idle) glint(g, stripe, { x: x - slope * K.mid, y: y + K.mid, r: h / 3, phase: lerp(-1.6, 1.6, clamp((t - 0.05) / 0.45)), slant: -0.5, width: 0.24, colour: mix(A.light, '#ffffff', 0.6) });
      }
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, rest.x1 + ox - 1, y - h / 2 + 1, t, M.light, { at: 0.8 });
    collectBurst(g, { burst: at.burst, x: CX, y, r: h / 2, colour: p.accent, sparkle: p.sparkle });
  },
});
