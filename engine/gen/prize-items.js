// Pickup generators of migration batch M2 (docs/data-sprites.md section 9, M1 to M40, and 3.3, family "shape"): the
// ten library pickups hourglass, keycard, meal, potion, power-orb, scroll, shield-cell, star-charm, trophy and xp-shard
// redrawn as data name one of these each. Every one is a port of the code that drew the sprite (the helper it called
// in engine/prizes.js, engine/pickups.js, engine/food.js, engine/crystals.js, engine/gadgets.js, or the drawing in the
// sprite file itself), with the sprite's colours turned into the paint refs its call names: each pixel takes the paint
// the code gave it, decided by the code's own shape tests at pixel centres (engine/gen/pixels.js), and comes back as
// stamps, so the redraw is the old picture. Light (engine/color.js ramp, mix, tone) becomes the colour rules of
// engine/gen/pixels.js rampOf and mixOf and the `tone` rule, worked out per frame by engine/resolve.js.
//
// Shared by all of them:
//   - they draw centred on `at`, the same on a node at its origin as in frame pixels (tests/unit/gen-node-origin.test.mjs);
//   - `scale` is the code's size factor k (the sprite's Size slider through a table);
//   - an idle animation (a falling thread of sand, a turning medal, a blinking light) runs on the clip phase ctx.t and
//     closes its loop;
//   - in a one-shot clip (a pickup's collect) it is drawn as engine/pickups.js pickupPose drew a pickup being collected:
//     it squashes at the dip, stretches as it rises, swells a little at the top and shrinks to nothing, its small details
//     left off once it is under 0.9 of its size, its idle animation held still. That is the default (`collect`, true),
//     so a data file cannot forget it; `collect: false` keeps the drawing whole in a one-shot clip that is not a
//     collect. A looping clip is never posed. The rise itself is pickup.collect@1 on
//     the node (that motion's scale and squash reach token@1 only), the white flash a frame edit, the burst
//     pickup.burst@1, the sparkle gleam@1.
// Pure: no randomness, no clock, no surface; Node and browser.
import { defineGenerator } from './registry.js';
import { point, px, count, share, word, flag, paint } from './args.js';
import { Pixels, rampOf, mixOf, tilesFor, workCost, tilted } from './pixels.js';
import { ellipseIn, polyIn, rectIn, capsuleIn } from '../surface.js';
import { placedIn, insetIn, anyIn, allIn, ringIn, turnedIn, bottleIn, starPoints, BOTTLE_SHAPES, hexIn, hoopIn, spunIn, boundsOf } from '../shapes.js';
import { markIn } from '../marks.js';
import { keys, fract, wave, pulse, hash } from '../motion.js';

const PI = Math.PI, TAU = 2 * Math.PI;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- shared ---------------------------------------------------------------------------------------------------------

const REST = Object.freeze({ sx: 1, sy: 1, scale: 1, show: true, bare: false, still: false });

/**
 * Where a pickup's drawing is in a frame of its clip (engine/pickups.js pickupPose without the rise, which is the node's):
 * at rest it is whole and animated; being collected (`collect`, a one-shot clip) it squashes, stretches, swells by
 * `swell` at the top and shrinks to nothing, its details off under 0.9 of its size and its idle animation held.
 */
export function prizePose(collect, ctx, swell = 1.1) {
  if (!collect || ctx.loop) return REST;
  const t = ctx.t;
  const sq = keys(t, [[0, 0], [0.14, 0.2], [0.3, -0.18], [0.5, 0], [1, 0]]);
  const scale = keys(t, [[0, 1], [0.5, 1], [0.58, swell], [0.75, 0.5], [0.86, 0]]);
  return { sx: scale * (1 + sq), sy: scale * (1 - sq), scale, show: scale > 0.3, bare: scale < 0.9, still: true };
}

/** A grid of paint refs (engine/gen/pixels.js Pixels) reach pixels round (cx, cy) each way, and its whole box as fill bounds. */
function gridAround(cx, cy, reach) {
  const R = Math.ceil(reach);
  const g = new Pixels(Math.floor(cx) - R, Math.floor(cy) - R, 2 * R + 1, 2 * R + 1);
  return { g, box: [g.x0, g.y0, g.x0 + g.w, g.y0 + g.h] };
}

/** The colour rule for a lighter (by > 0) or darker tone of a paint ref (engine/color.js tone). */
const toneOf = (ref, by) => ({ rule: 'tone', of: typeof ref === 'string' && ref.includes('.') ? rampRule(ref) : ref, by });
const rampRule = (ref) => { const [slot, t] = ref.split('.'); return t === 'base' ? slot : { rule: 'ramp', of: slot, tone: t }; };

// place a test drawn at scale 1 around (0, 0): scale k, squash sx / sy, turn angle, centre (cx, cy) (engine/prizes.js placer)
const placer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (test) => placedIn(test, cx, cy, { angle, sx: k * sx, sy: k * sy });
// where a point at scale 1 lands (same transform as placer; engine/prizes.js pointer)
const pointer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (x, y) => {
  const c = Math.cos(angle), s = Math.sin(angle), X = x * k * sx, Y = y * k * sy;
  return [cx + X * c - Y * s, cy + X * s + Y * c];
};

/** The cost of a pixel port drawn in a box reach pixels each way with about `fills` passes of `tests` shape tests a pixel: stamps plus work. */
const portCost = (reach, fills, tests = 6) => tilesFor(2 * reach + 1, 2 * reach + 1) + workCost((2 * reach + 3) ** 2 * fills * tests);

const scaleArg = (lo, hi, about) => px(lo, hi, { default: 1, about });
const collectArg = () => flag({ default: true, about: 'In a one-shot clip (a pickup\'s collect) it squashes, stretches, swells and shrinks to nothing, details off; false keeps it whole there. A looping clip never moves it' });

// ---- timepiece@1: sprites/hourglass.js, engine/prizes.js drawTimer -------------------------------------------------

/** The timepieces timepiece@1 draws: an hourglass with sand running through it, a stopwatch, an alarm clock with two bells. */
export const TIMEPIECE_KINDS = Object.freeze(['hourglass', 'stopwatch', 'clock']);

function drawTimer(g, box, cx, cy, o) {
  const { kind, level, t, bare } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o);
  const F = rampOf(o.frame), Sd = rampOf(o.sand), G = rampOf(o.glass), Fc = rampOf(o.face);
  if (kind === 'hourglass') {
    const caps = anyIn(rectIn(-7.2, -10.6, 14.4, 2.6), rectIn(-7.2, 8, 14.4, 2.6));
    const posts = anyIn(rectIn(-6.6, -8, 1.6, 16), rectIn(5, -8, 1.6, 16));
    const top = ellipseIn(0, -4.2, 4.4, 4), bottom = ellipseIn(0, 4.2, 4.4, 4), neck = rectIn(-0.9, -1.4, 1.8, 2.8);
    const bulbs = anyIn(top, bottom, neck);
    const u = clamp01(level);
    g.fill(...box, place(posts), F, { shade: 1 });
    g.fill(...box, place(bulbs), G, { shade: 1, light: 1 });
    // the sand left in the top bulb, sinking to a funnel in the middle, rimmed with its own dark tone against the glass
    const surf = lerp(-1.8, -7.2, u);
    g.fill(...box, place(allIn(top, (px, py) => py > surf + Math.max(0, 1.6 - Math.abs(px) * 0.7))), Sd, { shade: 0, light: 1, outline: Sd.dark, clip: place(insetIn(top, 1)) });
    // the pile in the bottom bulb, a mound that grows as the top empties
    const h = lerp(5.6, 1.8, u), foot = 8;
    const pile = allIn(bottom, (px, py) => py > foot - h * (1 - (px / 5) ** 2));
    g.fill(...box, place(pile), Sd, { shade: 1, outline: Sd.dark, clip: place(insetIn(bottom, 1)) });
    // a thread of grains falling through the neck to the pile, moving one pixel a frame
    if (!bare && u > 0.02) {
      const [nx] = at(0, 0);
      const x = Math.floor(nx), [, y0] = at(0, -1.4), [, y1] = at(0, foot - h);
      const shift = Math.round(fract(t) * 8);
      for (let y = Math.floor(y0); y < Math.floor(y1); y++) if (((y - shift) % 4 + 4) % 4 < 2) g.dot(x, y, Sd.light);
    }
    g.fill(...box, place(caps), F, { shade: 1, light: 1 });
    if (!bare) g.fill(...box, place(anyIn(rectIn(2.2, -6.6, 1, 2.4), rectIn(2.2, 2.2, 1, 2))), o.shine, { clip: place(insetIn(bulbs, 1)) });   // light on the glass
    return;
  }
  const clock = kind === 'clock', r = clock ? 7.6 : 8, oy = 1.4;
  if (clock) {
    // two bells, each turned out a little, a hammer between them, and two feet
    const bells = anyIn(placedIn(allIn(ellipseIn(0, 0, 3.4, 3), (px, py) => py < 0.9), -5.2, -6.2, { angle: -0.5 }), placedIn(allIn(ellipseIn(0, 0, 3.4, 3), (px, py) => py < 0.9), 5.2, -6.2, { angle: 0.5 }));
    const hammer = anyIn(rectIn(-0.6, -9.4, 1.2, 3.2), ellipseIn(0, -9.4, 1.2, 1));
    const feet = anyIn(capsuleIn(-4.4, 7.4, -5.8, 9.8, 1), capsuleIn(4.4, 7.4, 5.8, 9.8, 1));
    g.fill(...box, place(anyIn(hammer, feet)), F, { shade: 1 });
    g.fill(...box, place(bells), F, { shade: 1, light: 1 });
  } else {
    // a crown button on a short stem, and a small pusher at the top right
    const crown = anyIn(rectIn(-1, -8.6, 2, 2.6), rectIn(-2.6, -10.8, 5.2, 2.4));
    const pusher = capsuleIn(4.6, -5.2, 6.4, -7, 1);
    g.fill(...box, place(anyIn(crown, pusher)), F, { shade: 1, light: 1 });
  }
  const kase = ellipseIn(0, oy, r, r), dial = ellipseIn(0, oy, r - 1.8, r - 1.8);
  g.fill(...box, place(kase), F, { shade: 2, light: 1 });
  g.fill(...box, place(dial), Fc, { shade: 1 });
  if (!bare) {
    // four ticks, a short hand that stays, and a long hand that jumps an eighth of a turn each frame
    const R = r - 2.8;
    g.fill(...box, place(anyIn([0, 1, 2, 3].map((q) => rectIn(Math.round(Math.sin(q * PI / 2) * R) - 0.5, oy + Math.round(-Math.cos(q * PI / 2) * R) - 0.5, 1, 1)))), Fc.dark, { shade: 0 });
    if (clock) g.fill(...box, place(capsuleIn(0, oy, -2.6, oy - 1.6, 0.55)), o.hand, { shade: 0 });
    const a = TAU * Math.floor(fract(t) * 8) / 8, L = r - 3;
    g.fill(...box, place(capsuleIn(0, oy, Math.sin(a) * L, oy - Math.cos(a) * L, 0.55)), o.hand, { shade: 0 });
    g.fill(...box, place(rectIn(-0.5, oy - 0.5, 1, 1)), o.hand, { shade: 0 });
  }
}

const TIMER_REACH = 12;

/**
 * timepiece@1: a timepiece face-on centred on `at`: an hourglass in a frame with the sand left in its top bulb
 * (`level`) and a thread of grains falling through its neck one pixel a frame, a stopwatch with a crown button, or a
 * round alarm clock with two bells and feet, whose long hand jumps an eighth of a turn each frame of an 8-frame loop.
 * Port of engine/prizes.js drawTimer (sprites/hourglass.js), pixel for pixel, as stamps; about 20 px tall at scale 1.
 * Paints: frame (its ramp: the frame or the case), sand, glass (the hourglass's glass), face (the clock face), hand
 * (the hands), shine (the light on the glass). Call the outline after it.
 */
export const timepiece = defineGenerator({
  id: 'timepiece', v: 1, family: 'shape',
  about: 'An hourglass with sand running through it, a stopwatch or an alarm clock whose hand jumps once round a loop.',
  args: {
    at: point({ about: 'The middle of the timepiece' }),
    kind: word(TIMEPIECE_KINDS, { default: 'hourglass', about: 'Hourglass, stopwatch or alarm clock' }),
    scale: scaleArg(0.5, 1.2, 'Its size: 1 is about 20 pixels tall'),
    level: share({ default: 0.5, about: 'The sand left in the top bulb: little to a full bulb' }),
    collect: collectArg(),
    frame: paint({ about: 'The frame or the case' }),
    sand: paint({ about: 'The sand' }),
    glass: paint({ about: 'The hourglass glass' }),
    face: paint({ about: 'The clock face' }),
    hand: paint({ default: 'ink', about: 'The hands and the ticks' }),
    shine: paint({ about: 'The light on the glass' }),
  },
  cost: (a) => portCost(TIMER_REACH * a.scale * 1.2 + 2, 14),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const cx = a.at[0], cy = a.at[1];
    const { g, box } = gridAround(cx, cy, TIMER_REACH * a.scale * 1.2 + 2);
    drawTimer(g, box, cx, cy, { kind: a.kind, k: a.scale, sx: pose.sx, sy: pose.sy, level: a.level, t: pose.still ? 0 : ctx.t, bare: pose.bare,
      frame: a.frame, sand: a.sand, glass: a.glass, face: a.face, hand: a.hand, shine: a.shine });
    return g.stamps();
  },
});

// ---- shared pieces of the ports: a turned badge (engine/gadgets.js drawToken), a glint band (engine/pickups.js glint) ----

// A flat badge turned about its upright axis: the edge band, the face with a lit rim, a sunken field (engine/gadgets.js drawToken).
function drawToken(g, box, badge, cx, cy, metal, { turn = 0, thick = 2, rim = 1, field, sx = 1, sy = sx } = {}) {
  const M = rampOf(metal), T = turnedIn(badge, turn, thick), k = Math.max(T.squeeze, 1e-3);
  const put = (test) => placedIn(test, cx, cy, { sx, sy });
  const body = put(T.body), face = put(T.face);
  g.fill(...box, body, { base: M.dark, dark: M.deep, light: M.base }, { shade: 1, light: 1 });     // the edge
  g.fill(...box, face, M, { shade: 1, light: 1 });
  let sunk = null;
  if (rim > 0) {
    sunk = insetIn(face, rim);
    const [dx, dy] = g.shadow;
    g.fill(...box, sunk, field ?? toneOf(metal, -0.3));
    g.fill(...box, (px, py) => sunk(px, py) && !sunk(px - dx, py - dy), M.dark);   // the shadow the rim casts into the field
  }
  return {
    face, body, field: sunk, x: T.x, squeeze: T.squeeze,
    on: (test) => put((x, y) => T.face(x, y) && test((x - T.x) / k, y)),
    at: (u, v) => [cx + (T.x + u * k) * sx, cy + v * sy],
  };
}

// A slanted bright band across a shape, kept inside it (engine/pickups.js glint).
function glintBand(g, test, { x, y, r, phase = 0, slant = 0.5, width = 0.15, paint }) {
  const band = (px, py) => Math.abs((px - x) / r + (slant * (py - y)) / r - phase) < width && test(px, py);
  g.fill(x - r - 2, y - r - 2, x + r + 2, y + r + 2, band, paint);
}

// ---- trophy@1: sprites/trophy.js, engine/prizes.js drawTrophy ------------------------------------------------------

/** The prizes trophy@1 draws: a two-handled cup on a plinth, a medal on a ribbon (turning like a coin), a crown. */
export const TROPHY_KINDS = Object.freeze(['cup', 'medal', 'crown']);
/** The marks a trophy's face can carry (engine/marks.js), or none. */
export const TROPHY_EMBLEMS = Object.freeze(['star', 'sun', 'diamond', 'none']);

function drawTrophy(g, box, cx, cy, o) {
  const { kind, emblem, turn, bare } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o);
  const k = o.k, S = { x: k * o.sx, y: k * o.sy };
  const M = rampOf(o.metal), engraved = M.dark;
  const size = k * Math.min(o.sx, o.sy) >= 1.05 ? 7 : 5;
  const mark = (x, y) => {
    if (!emblem || bare) return;
    const [px, py] = at(x, y);
    g.fill(...box, markIn(emblem, Math.floor(px), Math.floor(py), size), engraved);
  };
  if (kind === 'medal') {
    // two straps of ribbon from above meeting at a clasp, and the medal hanging from it
    const straps = anyIn(polyIn([[-6.4, -10.4], [-2.4, -10.4], [1.4, -3.2], [-1.6, -3.2]]), polyIn([[2.4, -10.4], [6.4, -10.4], [1.6, -3.2], [-1.4, -3.2]]));
    const Rb = rampOf(o.ribbon);
    g.fill(...box, place(straps), Rb, { shade: 1 });
    if (!bare) g.fill(...box, place(allIn(straps, (px, py) => Math.abs(px) < 0.9 + (py + 10.4) * 0.06 && py > -6)), Rb.dark, { shade: 0 });   // where the straps cross
    const clasp = rectIn(-2.2, -4.2, 4.4, 2);
    g.fill(...box, place(clasp), M, { shade: 1, light: 1 });
    const [mx, my] = at(0, 3.6);
    const T = drawToken(g, box, ellipseIn(0, 0, 6.6, 6.6), mx, my, o.metal, { turn, thick: 2, rim: 1, sx: S.x, sy: S.y });
    if (emblem && !bare && T.squeeze > 0.35) g.fill(...box, T.on(markIn(emblem, 0, 0, size)), engraved);
    return anyIn(place(clasp), T.body);
  }
  if (kind === 'crown') {
    const band = rectIn(-8.5, 0.6, 17, 7);
    const points = polyIn([[-8.5, 1], [-8.5, -6.2], [-4.4, -1.4], [0, -8.4], [4.4, -1.4], [8.5, -6.2], [8.5, 1]]);
    const balls = anyIn(ellipseIn(-8, -6.6, 1.6, 1.6), ellipseIn(0, -9, 1.6, 1.6), ellipseIn(8, -6.6, 1.6, 1.6));
    const body = place(anyIn(band, points, balls));
    g.fill(...box, body, M, { shade: 2, light: 1 });
    if (!bare) {
      // a raised rim along the top and the foot of the band
      g.fill(...box, place(anyIn(rectIn(-8.5, 0.6, 17, 1), rectIn(-8.5, 6.6, 17, 1))), M.light, { shade: 0 });
      g.fill(...box, place(balls), M, { shade: 1, light: 1 });
    }
    mark(0, 3.9);
    return body;
  }
  const bowl = anyIn(allIn(ellipseIn(0, -7.2, 6.4, 6), (px, py) => py > -9.6), rectIn(-6.8, -10.6, 13.6, 1.6));
  const handles = anyIn(allIn(ringIn(-6.4, -6.4, 3.4, 1.5), (px) => px < -5.2), allIn(ringIn(6.4, -6.4, 3.4, 1.5), (px) => px > 5.2));
  const stem = anyIn(rectIn(-1, -1.6, 2, 3.2), ellipseIn(0, 0, 1.8, 1), polyIn([[-1.8, 1.4], [1.8, 1.4], [4.4, 3.6], [-4.4, 3.6]]));
  const plinth = rectIn(-5.6, 3.6, 11.2, 5.6);
  const B = rampOf(o.base);
  g.fill(...box, place(plinth), { base: B.base, light: B.light, dark: B.dark }, { shade: 1, light: 1 });
  if (!bare) g.fill(...box, place(rectIn(-2.6, 5.4, 5.2, 2)), M.base, { shade: 0 });   // the name plate, left blank
  g.fill(...box, place(handles), M, { shade: 1, light: 1 });
  g.fill(...box, place(stem), M, { shade: 1, light: 1 });
  g.fill(...box, place(bowl), M, { shade: 2, light: 1 });
  if (!bare) g.fill(...box, place(rectIn(-6.8, -9.2, 13.6, 1)), M.dark, { shade: 0, clip: place(bowl) });   // under the lip
  mark(0, -5.4);
  return place(anyIn(bowl, handles, stem));
}

/** How far each trophy reaches each way from its middle at scale 1, outline not included (engine/prizes.js REACH): [up, down, side]. */
const TROPHY_REACH = { cup: [11, 10, 11], medal: [11, 10, 8], crown: [11, 9, 10] };

/**
 * trophy@1: a prize face-on centred on `at`: a two-handled cup on a dark plinth, a medal on two straps of ribbon that
 * turns like a coin half a turn a loop, or a crown with three points, with an engraved mark (`emblem`) on its face and,
 * while it floats (`glint`), a strong white band sweeping across its metal once a loop. Port of engine/prizes.js
 * drawTrophy and sprites/trophy.js's glint, pixel for pixel, as stamps; about 19 px tall at scale 1. Paints: metal (its
 * ramp), ribbon (the medal's), base (the cup's plinth), shine (the glint band). Call the outline after it.
 */
export const trophy = defineGenerator({
  id: 'trophy', v: 1, family: 'shape',
  about: 'A cup on a plinth, a turning medal on a ribbon or a crown, with an engraved mark and a glint sweeping across.',
  args: {
    at: point({ about: 'The middle of the prize' }),
    kind: word(TROPHY_KINDS, { default: 'cup', about: 'Cup, medal or crown' }),
    scale: scaleArg(0.5, 1.2, 'Its size: 1 is about 19 pixels tall'),
    emblem: word(TROPHY_EMBLEMS, { default: 'star', about: 'The mark engraved on its face' }),
    glint: flag({ default: true, about: 'A bright band sweeps across the metal once a loop while it floats' }),
    collect: collectArg(),
    metal: paint({ about: 'The cup, medal or crown' }),
    ribbon: paint({ about: 'The medal\'s ribbon' }),
    base: paint({ about: 'The cup\'s plinth' }),
    shine: paint({ about: 'The glint band' }),
  },
  cost: (a) => portCost(12 * a.scale * 1.2 + 2, 14),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const cx = a.at[0], cy = a.at[1], idle = !pose.still;
    const { g, box } = gridAround(cx, cy, 12 * a.scale * 1.2 + 2);
    const shiny = drawTrophy(g, box, cx, cy, { kind: a.kind, k: a.scale, sx: pose.sx, sy: pose.sy, metal: a.metal, ribbon: a.ribbon, base: a.base,
      emblem: a.emblem === 'none' ? null : a.emblem, turn: idle ? PI * ctx.t : 0, bare: pose.bare });
    if (idle && a.glint) glintBand(g, shiny, { x: cx, y: cy, r: TROPHY_REACH[a.kind][2] * a.scale, phase: lerp(-1.6, 1.6, ctx.t), width: 0.2, paint: a.shine });
    return g.stamps();
  },
});

// ---- potion.bottle@1: sprites/potion.js, engine/pickups.js drawBottle ----------------------------------------------

/** The bottles potion.bottle@1 draws (engine/shapes.js BOTTLE_SHAPES): round, tall, flask, vial. */
export const POTION_BOTTLES = Object.freeze([...BOTTLE_SHAPES]);

/**
 * potion.bottle@1: a corked glass bottle `height` px tall (cork included) centred on `at`, with liquid filled to
 * `level`; while it floats the liquid's surface tilts against the float (one way as it rises, the other as it sinks)
 * and two bubbles rise through it once a loop. Port of engine/pickups.js drawBottle as sprites/potion.js called it,
 * pixel for pixel, as stamps (an odd height sits half a pixel up, on a pixel centre). Paints: glass (its ramp), liquid
 * (its ramp: the liquid, its lit surface, the bubbles), cork (its ramp), shine (the highlight on the glass). Call the
 * outline after it.
 */
export const potionBottle = defineGenerator({
  id: 'potion.bottle', v: 1, family: 'shape',
  about: 'A corked glass bottle of liquid whose surface tilts as it floats while bubbles rise through it.',
  args: {
    at: point({ about: 'The middle of the bottle (an odd height sits half a pixel above it)' }),
    height: count(8, 28, { default: 18, about: 'How tall the bottle is with its cork, in pixels' }),
    shape: word(POTION_BOTTLES, { default: 'round', about: 'Round, tall, flask or vial' }),
    level: share({ default: 0.7, about: 'How full: nearly empty to full' }),
    bubbles: flag({ default: true, about: 'Two bubbles rise through the liquid once a loop' }),
    collect: collectArg(),
    glass: paint({ about: 'The glass' }),
    liquid: paint({ about: 'The liquid' }),
    cork: paint({ about: 'The cork' }),
    shine: paint({ about: 'The highlight on the glass' }),
  },
  cost: (a) => portCost(a.height * 0.7 + 3, 8),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const h = a.height, cx = a.at[0], cy = a.at[1] - (h % 2 ? 0.5 : 0), idle = !pose.still, t = idle ? ctx.t : 0;
    const { g, box } = gridAround(cx, cy, h * 0.7 + 3);
    const B = bottleIn(h, a.shape), sx = pose.sx, sy = pose.sy;
    const place = (f) => placedIn(f, cx, cy, { sx, sy });
    const body = place(B.glass), inner = insetIn(body, 1);
    const G = rampOf(a.glass), L = rampOf(a.liquid);
    const tilt = idle ? -0.16 * wave(t) : 0, nBubbles = a.bubbles && !pose.bare ? 2 : 0;
    g.fill(...box, place(B.cork), rampOf(a.cork));
    g.fill(...box, body, G, { shade: 1, light: 1 });
    // the surface is compared in the bottle's own coordinates, so a tie falls the same way on a node as in the frame
    const top = lerp(B.fill[1] - 2, B.fill[0], clamp01(a.level)) * sy, floor = cy + B.fill[1] * sy, surface = cy + top;
    const wet = (px, py) => py - cy >= top + tilt * (px - cx) && inner(px, py);
    g.fill(...box, wet, L, { shade: 1 });
    g.fill(...box, (px, py) => wet(px, py) && !wet(px, py - 1), L.light);          // the surface of the liquid
    for (let i = 0; i < nBubbles; i++) {
      const life = fract(t + hash(i, 5) * (i ? 1 : 0));
      const bx = Math.floor(cx + (i ? (hash(i, 3) - 0.5) * B.half * sx : -1)), by = Math.floor(lerp(floor - 1, surface + 1, life));
      const big = i === 0 && life < 0.75;
      for (const [ox, oy] of big ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]]) if (wet(bx + ox + 0.5, by + oy + 0.5)) g.dot(bx + ox, by + oy, L.light);
    }
    if (!pose.bare) g.fill(...box, placedIn(B.shine, cx, cy, { sx, sy }), a.shine, { clip: inner });
    return g.stamps();
  },
});

// ---- meal@1 and meal.steam@1: sprites/meal.js, engine/food.js drawMeal, engine/fx.js smoke -------------------------

/** The meals meal@1 draws: a roast leg with its bone, a loaf, a cheese wedge, a crimped pie. */
export const MEAL_KINDS = Object.freeze(['drumstick', 'bread', 'cheese', 'pie']);
/** How far each meal reaches each way from its middle at scale 1, outline not included (engine/food.js REACH): [up, down, side]. */
const MEAL_REACH = { drumstick: [8, 12, 12], bread: [6, 6, 10], cheese: [9, 7, 10], pie: [6, 7, 10] };
const anyOf = (...tests) => (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; };
const without = (test, ...holes) => (px, py) => { for (const h of holes) if (h(px, py)) return false; return test(px, py); };
/** The row a meal's middle is on when its reach box is centred on y (engine/food.js foodReach, as sprites/meal.js centred it). */
const mealRow = (kind, k, y) => { const [up, down] = MEAL_REACH[kind]; return Math.round(y + ((up - down) * k) / 2); };

function drawMeal(g, box, cx, cy, o) {
  const { kind, bite, bare } = o;
  const place = placer(cx, cy, o), C = rampOf(o.food);
  // the cheese's bite is centred on its tall corner, so it takes the corner off whole and never leaves a loose piece above
  const bites = { drumstick: [1.4, -5.4], bread: [6.4, -3.4], cheese: [8.6, -5.2], pie: [6.4, -3] };
  const b = bite ? { hole: place(ellipseIn(...bites[kind], 2.6, 2.6)), rim: place(ellipseIn(...bites[kind], 3.6, 3.6)) } : null;
  const cut = (test) => (b ? without(test, b.hole) : test);
  const flesh = o.crumb;
  let body;
  if (kind === 'bread') {
    body = cut(place(without(ellipseIn(0, 1.5, 10, 7.5), rectIn(-11, 4.6, 22, 6))));
    g.fill(...box, body, C, { shade: 2 });
    // the underside: a band of the deepest crust along the flat bottom, where the loaf sat in the tin
    g.fill(...box, place(rectIn(-11, 3.2, 22, 2)), C.deep, { shade: 0, clip: body });
    // the score marks: pale crumb showing in each cut, its upper lip catching the light
    if (!bare) for (const x of [-5, 0, 5]) {
      g.fill(...box, place(capsuleIn(x - 1.6, -1.2, x + 1.2, -4.2, 0.7)), flesh, { shade: 0, clip: body });
      g.fill(...box, place(capsuleIn(x - 0.6, -0.6, x + 2.2, -3.6, 0.6)), C.light, { shade: 0, clip: body });
    }
  } else if (kind === 'cheese') {
    // a wedge lying on its flat side: the cut face towards us, its sloping top running back from the point to the tall end
    const A = [-9, 5.6], B = [8.4, 5.6], Cc = [8.4, -3.6], up = [1.2, -4];
    const face = polyIn([A, B, Cc]);
    const topFace = polyIn([A, Cc, [Cc[0] + up[0], Cc[1] + up[1]], [A[0] + up[0], A[1] + up[1]]]);
    body = cut(place(anyOf(face, topFace)));
    g.fill(...box, body, C, { shade: 1 });
    g.fill(...box, place(topFace), C.light, { clip: body, shade: 0 });
    // the rind down the tall end, a step darker than the cut face
    g.fill(...box, place(rectIn(7, -4, 3, 10)), mixOf(C.base, C.dark, 0.5), { clip: body, shade: 0 });
    if (!bare) for (const [x, y, r] of [[4.2, 2.6, 1.6], [5, -0.6, 1], [-1.4, 3.4, 1.1]]) g.fill(...box, place(ellipseIn(x, y, r, r)), C.deep, { clip: place(face) });
  } else if (kind === 'pie') {
    const lid = ellipseIn(0, -1, 9.5, 4.5);
    body = cut(place(anyOf(lid, rectIn(-9.5, -1, 19, 4), ellipseIn(0, 3, 9.5, 4))));
    g.fill(...box, body, C, { shade: 2 });
    g.fill(...box, place(lid), C.light, { clip: body });
    if (!bare) {
      // the crimped rim: a band round the lid in the crust's own tone, pinched by a dark mark every third pixel
      const rim = place(without(lid, ellipseIn(0, -1, 7.6, 3)));
      g.fill(...box, rim, C.base, { clip: body });
      g.fill(...box, (px, py) => rim(px, py) && ((Math.floor(px - cx) % 3) + 3) % 3 === 0, C.dark, { clip: body });
      // the vent: three short slanted slits side by side, the filling showing through
      for (const x of [-3, 0, 3]) g.fill(...box, place(polyIn([[x - 1.2, -0.2], [x + 0.2, -0.2], [x + 1.2, -2.4], [x - 0.2, -2.4]])), o.filling, { clip: body });
    }
  } else {
    // the bone behind, then the meat over its near end
    const Bn = rampOf(o.bone);
    const boneTest = place(anyOf(capsuleIn(1.5, 1.5, 7, 7, 1.5), ellipseIn(9, 6.6, 1.9, 1.9), ellipseIn(6.6, 9, 1.9, 1.9)));
    g.fill(...box, boneTest, Bn, { shade: 1 });
    body = cut(place(anyOf(ellipseIn(-3, -1.5, 7, 6), polyIn([[-4, 3.5], [1, -5], [5.5, 2.5], [3.6, 4.6]]))));
    g.fill(...box, body, C, { shade: 2, light: 1 });
    if (!bare) g.fill(...box, place(capsuleIn(-6.5, -3.6, -2, -5.4, 0.6)), C.light, { shade: 0, clip: body });
    body = anyOf(body, boneTest);
  }
  if (b && !bare) g.fill(...box, without(b.rim, b.hole), flesh, { clip: body });
  return body;
}

/**
 * meal@1: a hearty meal face-on: a roast leg with its bone end, a loaf with score marks, a cheese wedge with holes or a
 * crimped pie with a vent, optionally with a round bite out of its top right; its reach is centred on `at` (so a
 * drumstick, which reaches further down than up, sits a little higher). While it floats it squashes a pixel at the
 * bottom of each dip (the float's lowest point is three quarters into the loop) and a bright band sweeps across it in
 * the first half of the loop. Port of engine/food.js drawMeal and sprites/meal.js's squash and glint, pixel for pixel,
 * as stamps; about 19 px across at scale 1. Paints: food (its ramp: meat, crust or cheese), bone, filling (seen through
 * the pie's vent), crumb (the inside, in cuts and the bite), gleam (the band). Call the outline after it.
 */
export const meal = defineGenerator({
  id: 'meal', v: 1, family: 'shape',
  about: 'A roast leg, loaf, cheese wedge or pie, maybe bitten, squashing at each dip with a glint sweeping across.',
  args: {
    at: point({ about: 'The middle of the box it reaches over' }),
    kind: word(MEAL_KINDS, { default: 'drumstick', about: 'Roast leg, loaf, cheese or pie' }),
    scale: scaleArg(0.5, 1.2, 'Its size: 1 is about 19 pixels across'),
    bite: flag({ default: false, about: 'A round bite out of its top right' }),
    glint: flag({ default: true, about: 'A bright band sweeps across it in the first half of the loop while it floats' }),
    collect: collectArg(),
    food: paint({ about: 'The meat, crust or cheese' }),
    bone: paint({ about: 'The roast leg\'s bone' }),
    filling: paint({ about: 'The filling seen through the pie\'s vent' }),
    crumb: paint({ about: 'The inside of the food, in its cuts and its bite' }),
    gleam: paint({ about: 'The glint band' }),
  },
  cost: (a) => portCost(13 * a.scale * 1.2 + 3, 16),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const [up, down, side] = MEAL_REACH[a.kind], k = a.scale, idle = !pose.still;
    const cx = a.at[0], cy = mealRow(a.kind, k, a.at[1]);
    const dip = idle ? clamp01((-wave(ctx.t) - 0.6) / 0.4) : 0;
    const sy = pose.sy * (1 - dip / (2 * down * k + 2 * up * k) * 2), sx = pose.sx * (1 + dip / (side * k * 2));
    const { g, box } = gridAround(cx, cy, 13 * k * 1.2 + 3);
    const body = drawMeal(g, box, cx, cy, { kind: a.kind, k, sx, sy, food: a.food, bone: a.bone, filling: a.filling, crumb: a.crumb, bite: a.bite, bare: pose.bare });
    // the sweep runs from t 0.1 to 0.7; outside it the band lies off the food, so the loop closes
    const u = (ctx.t - 0.1) / 0.6;
    if (idle && a.glint && u > 0 && u < 1) glintBand(g, body, { x: cx, y: cy, r: side * k, phase: lerp(-1.5, 1.5, u), width: 0.1, paint: a.gleam });
    return g.stamps();
  },
});

const STEAM_PUFFS = 3;   // puffs alive in each wisp at once

/**
 * meal.steam@1: the steam over a hot meal@1 of the same kind and scale at the same `at`: two narrow wisps rising from
 * either side of its top, each a column of three puffs born a third of a loop apart, the second wisp a sixth behind,
 * each puff light when young and darker as it thins, rimmed a tone darker. `room` is how far the frame's top usable
 * row is above `at`: the wisps rise until four rows under it and never leave the frame. Port of sprites/meal.js's
 * steam (engine/fx.js smoke, one puff a call), pixel for pixel, as stamps. Paint: the steam. Draw it after the outline.
 */
export const mealSteam = defineGenerator({
  id: 'meal.steam', v: 1, family: 'shape',
  about: 'Two wisps of steam rising from either side of the top of a hot meal, puff after puff, once a loop.',
  args: {
    at: point({ about: 'The same point the meal is drawn at' }),
    kind: word(MEAL_KINDS, { default: 'drumstick', about: 'The meal it rises from' }),
    scale: scaleArg(0.5, 1.2, 'The meal\'s size'),
    room: px(4, 64, { default: 16, about: 'Pixels from `at` up to the frame\'s top row it may use (the frame is 30 rows tall below that)' }),
    paint: paint({ about: 'The steam' }),
  },
  cost: () => 2 * STEAM_PUFFS + workCost(2 * STEAM_PUFFS * 49 * 2),
  run(a, ctx) {
    const [up] = MEAL_REACH[a.kind], cx = a.at[0];
    const top = mealRow(a.kind, a.scale, a.at[1]) - up * a.scale, roof = a.at[1] - a.room;
    const B = [cx - 15, Math.floor(roof), cx + 15, Math.floor(roof) + 30];
    const g = new Pixels(B[0], B[1], B[2] - B[0], B[3] - B[1]);
    const rise = Math.max(3, top - roof - 3), size = 2.4, h2 = hash(0, 66), h3 = hash(0, 67), h1 = hash(0, 65);
    const clip = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
    for (const [w, dx, drift] of [[0, -4.5, -0.6], [1, 4.5, 0.6]]) for (let j = 0; j < STEAM_PUFFS; j++) {
      const k = fract(ctx.t + (j + w / 2) / STEAM_PUFFS + h1);
      const r = size * (0.5 + 0.5 * k) * Math.sqrt(Math.sin(PI * k));
      if (r < 0.6) continue;
      const x = cx + dx + (h2 - 0.5) * 1.2 * size + drift * k + 0.8 * Math.sin(TAU * (k + h3)), y = top - 1 - rise * k;
      const c = k < 0.33 ? toneOf(a.paint, 0.45) : k < 0.66 ? a.paint : toneOf(a.paint, -0.4);
      if (r < 1.5) { if (clip(Math.floor(x) + 0.5, Math.floor(y) + 0.5)) g.dot(x, y, toneOf(c, -1)); continue; }
      g.fill(x - r, y - r, x + r, y + r, (px, py) => (px - x) ** 2 + (py - y) ** 2 <= r * r, { base: c, dark: toneOf(c, -0.55), light: c }, { shade: r >= 3 ? 1 : 0, outline: toneOf(c, -1), clip });
    }
    return g.stamps();
  },
});

// ---- scroll@1: sprites/scroll.js drawRolled and its rock, engine/prizes.js drawScroll ------------------------------

/** The scrolls scroll@1 draws: rolled and tied, lying on the diagonal; open between two rods; a folded letter. */
export const SCROLL_KINDS = Object.freeze(['rolled', 'open', 'letter']);

// The icon pen's body paint and line on a grid of paint refs (engine/icons.js iconPaint, iconLine).
function penPaint(g, pen, tests, paint, opt = {}) {
  const list = [].concat(tests).map(pen.at), minus = [].concat(opt.minus ?? []).map(pen.at), clip = opt.clip ? pen.at(opt.clip) : null;
  const inside = (px, py) => {
    for (const m of minus) if (m(px, py)) return false;
    for (const f of list) if (f(px, py)) return true;
    return false;
  };
  const r = isRampPaint(paint) ? paint : rampOf(paint);
  const base = r.base, dark = r.dark ?? r.base, lite = r.light ?? r.base, mid = r.mid ?? mixOf(r.base, r.dark ?? r.base, 0.5);
  const [sx, sy] = g.shadow;
  const soft = opt.flat || !pen.shade ? 0 : opt.soft ?? 2, hi = opt.flat || !pen.shine ? 0 : opt.light ?? 1;
  const X0 = g.x0, Y0 = g.y0, X1 = g.x0 + g.w, Y1 = g.y0 + g.h;
  if (opt.rim) {
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (inside(px, py) || (clip && !clip(px, py))) continue;
      if (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) g.set(x, y, opt.rim);
    }
  }
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (!inside(px, py) || (clip && !clip(px, py))) continue;
    let c = base;
    if (!opt.flat) {
      if (!inside(px + sx, py + sy)) c = dark;
      else if (soft && !inside(px + sx * (1 + soft), py + sy * (1 + soft))) c = mid;
      else if (hi && !inside(px - sx * hi, py - sy * hi)) c = lite;
    }
    g.set(x, y, c);
  }
}
const isRampPaint = (p) => p !== null && typeof p === 'object' && Object.hasOwn(p, 'base') && !Object.hasOwn(p, 'rule');
function penLine(g, pen, pts, paint, { over = false } = {}) {
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x0, y0] = pen.pt(...pts[i]).map(Math.floor);
    const [x1, y1] = pen.pt(...pts[i + 1]).map(Math.floor);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    for (let err = dx + dy; ;) {
      if (!over || g.has(x0, y0)) g.set(x0, y0, paint);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

const ROLL = { half: 8.6, round: 4, diagonal: PI / 4, rock: 0.1 };
// a round wax seal 5 px across (rows 3-5-5-5-3); a rod end, a 3x3 block lit at the top right, the same at every slant
const DISC = [[-1, 1], [-2, 2], [-2, 2], [-2, 2], [-1, 1]];
const KNOB = [[-1, -1, 'dark'], [0, -1, 'base'], [1, -1, 'base'], [-1, 0, 'deep'], [0, 0, 'dark'], [1, 0, 'base'], [-1, 1, 'deep'], [0, 1, 'deep'], [1, 1, 'dark']];

// The rolled scroll lying on the diagonal, low end left: a tube of paper with the roll end-on at the lower end and its loose
// edge along it, a rod end poking out of both ends, a ribbon round its middle with two short ends, the seal right of it.
function drawRolled(g, cx, cy, { k, sx, sy, angle, paper, ribbon, rods, seal, bare }) {
  const c = Math.cos(angle), s = Math.sin(angle), HALF = ROLL.half, ROUND = ROLL.round;
  const pen = { k, angle, shade: true, shine: true, pt: (x, y) => [cx + k * (x * sx * c - y * sy * s), cy + k * (x * sx * s + y * sy * c)],
    at: (test) => placedIn(test, cx, cy, { angle, sx: k * sx, sy: k * sy }) };
  const Pp = rampOf(paper), Rb = rampOf(ribbon), Rd = rampOf(rods);
  const tube = [rectIn(-HALF, -ROUND, 2 * HALF + 0.6, 2 * ROUND)];
  penPaint(g, pen, [...tube, ellipseIn(-HALF - 0.6, 0, 2, ROUND)], Pp, { soft: 2 });
  if (!bare) penLine(g, pen, [[-HALF + 2, 1.3], [HALF - 1, 1.3]], Pp.dark, { over: true });
  penPaint(g, pen, ellipseIn(-HALF - 0.6, 0, 2, ROUND), Pp.dark, { flat: true });
  penPaint(g, pen, [capsuleIn(-0.6, 1.2, -2.8, ROUND + 0.4, 0.8), capsuleIn(0.2, 1.2, 2.2, ROUND + 0.4, 0.8)], Rb.dark, { flat: true, clip: rectIn(-HALF, -ROUND - 1, 2 * HALF, 2 * ROUND + 1.6) });
  const onTube = (x, y) => tube.some((f) => f(x, y));
  penPaint(g, pen, rectIn(-1.6, -ROUND - 1, 3.2, 2 * ROUND + 2), Rb, { soft: 0, rim: 'ink', clip: onTube });
  if (k * Math.min(sx, sy) > 0.6) {
    for (const along of [-HALF - 1.4, HALF + 2.2]) {
      const [fx, fy] = pen.pt(along, 0), X = Math.round(fx - 0.5), Y = Math.round(fy - 0.5);
      for (const [dx, dy, t] of KNOB) g.dot(X + dx, Y + dy, Rd[t]);
    }
  }
  if (seal) {
    const [fx, fy] = pen.pt(4.8, -0.2), x = Math.round(fx - 0.5), y = Math.round(fy - 0.5);
    DISC.forEach(([a, b], i) => { for (let dx = a; dx <= b; dx++) g.dot(x + dx, y - 2 + i, Rb.dark); });
    if (!bare) { g.dot(x - 1, y - 1, Rb.base); g.dot(x, y, Rb.deep); }
  }
}

// An open scroll between two rods with wavy lines of writing, or a folded letter with a flap (engine/prizes.js drawScroll).
function drawFlatScroll(g, box, cx, cy, o) {
  const { kind, seal, bare } = o;
  const place = placer(cx, cy, o);
  const Pp = rampOf(o.paper), Rb = rampOf(o.ribbon), Rd = rampOf(o.rods);
  const wax = (x, y) => {
    g.fill(...box, place(ellipseIn(x, y, 2.6, 2.6)), Rb, { shade: 1, light: 1 });
    if (!bare) g.fill(...box, place(ellipseIn(x - 0.2, y + 0.2, 1, 1)), Rb.dark, { shade: 0 });
  };
  if (kind === 'open') {
    const sheet = rectIn(-6.6, -7, 13.2, 14);
    const roll = (y) => anyIn(rectIn(-7.6, y - 1.7, 15.2, 3.4), ellipseIn(-7.6, y, 1, 1.7), ellipseIn(7.6, y, 1, 1.7));
    const knobs = (y) => anyIn(ellipseIn(-9.6, y, 1.6, 1.5), ellipseIn(9.6, y, 1.6, 1.5));
    g.fill(...box, place(anyIn(knobs(-8.4), knobs(8.4))), Rd, { shade: 1 });
    g.fill(...box, place(sheet), Pp, { shade: 1 });
    if (!bare) {
      // four lines of writing as wavy strokes, the last one short
      const lines = (px, py) => {
        for (const [y, x1] of [[-4.2, 4.4], [-1.6, 4.4], [1, 4.4], [3.6, 1]]) {
          if (px < -4.4 || px > x1) continue;
          if (Math.abs(py - (y + 0.7 * Math.sin(px * 1.4))) < 0.5) return true;
        }
        return false;
      };
      g.fill(...box, place(lines), toneOf(o.paper, -1.5), { clip: place(sheet) });
    }
    for (const y of [-8.4, 8.4]) g.fill(...box, place(roll(y)), Pp, { shade: 1, light: 1 });
    if (seal) wax(3.6, 4);
    return;
  }
  const sheet = rectIn(-9.4, -6.2, 18.8, 12.4);
  const flap = polyIn([[-9.4, -6.2], [9.4, -6.2], [0, 1.6]]);
  g.fill(...box, place(sheet), Pp, { shade: 1 });
  if (!bare) g.fill(...box, place(anyIn(capsuleIn(-8.6, 5.2, -2, 0.4, 0.45), capsuleIn(8.6, 5.2, 2, 0.4, 0.45))), Pp.dark, { shade: 0 });   // the folds of the back
  g.fill(...box, place(flap), { base: Pp.light, light: o.shine, dark: Pp.base }, { shade: 0, outline: Pp.dark, clip: place(sheet) });
  if (seal) wax(0, 1.4);
}

/**
 * scroll@1: a scroll face-on centred on `at`: rolled and tied with a ribbon, lying on the diagonal with its curled end
 * and rod ends showing; open on two rods with wavy lines of writing (never letters); or a folded letter with a flap;
 * with a round wax seal (`seal`). While it floats it rocks a step each way, half a loop after the float: the rolled one
 * turns its shapes (the rod ends and the seal are fixed pixel blocks), the flat ones lean by whole pixels so the paper
 * keeps every pixel. Port of sprites/scroll.js drawRolled and engine/prizes.js drawScroll, pixel for pixel, as stamps;
 * about 20 px across at scale 1. Paints: paper, ribbon (and the seal), rods, shine (the letter's lit flap). Call the
 * outline after it.
 */
export const scroll = defineGenerator({
  id: 'scroll', v: 1, family: 'shape',
  about: 'A rolled scroll tied with a ribbon, an open scroll on two rods or a folded letter, with a wax seal, rocking as it floats.',
  args: {
    at: point({ about: 'The middle of the scroll' }),
    kind: word(SCROLL_KINDS, { default: 'rolled', about: 'Rolled, open or a letter' }),
    scale: scaleArg(0.5, 1.2, 'Its size: 1 is about 20 pixels across'),
    seal: flag({ default: true, about: 'A round wax seal' }),
    collect: collectArg(),
    paper: paint({ about: 'The paper' }),
    ribbon: paint({ about: 'The ribbon and the wax seal' }),
    rods: paint({ about: 'The rods and their ends' }),
    shine: paint({ about: 'The lit fold of the letter\'s flap' }),
  },
  cost: (a) => portCost(12 * a.scale * 1.2 + 4, 16),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const cx = a.at[0], cy = Math.round(a.at[1]), k = a.scale;
    const step = pose.still ? 0 : Math.round(wave(ctx.t, 0.5));
    const { g, box } = gridAround(cx, cy, 12 * k * 1.2 + 4);
    const o = { kind: a.kind, k, sx: pose.sx, sy: pose.sy, paper: a.paper, ribbon: a.ribbon, rods: a.rods, shine: a.shine, seal: a.seal, bare: pose.bare };
    if (a.kind === 'rolled') {
      drawRolled(g, cx, cy, { ...o, angle: -ROLL.diagonal + step * ROLL.rock });
      return g.stamps();
    }
    drawFlatScroll(g, box, cx, cy, o);
    return (step ? tilted(g, cx, cy, step * 0.08) : g).stamps();
  },
});

// ---- keycard@1: sprites/keycard.js -------------------------------------------------------------------------------

// Shape tests the card is made of (engine/ui.js roundRectIn and cutRectIn, engine/gadgets.js chevronIn and leanedIn),
// copied rather than imported: engine/ui.js loads the whole sprite engine, which loads this registry.
const ROUND_CUTS = [[], [1], [2, 1], [3, 1, 1], [4, 2, 1, 1]];
function roundRectIn(x, y, w, h, k = 0) {
  const cuts = ROUND_CUTS[Math.max(0, Math.min(k, 4, Math.floor((Math.min(w, h) - 1) / 2)))];
  return (px, py) => {
    const ix = Math.floor(px - x), iy = Math.floor(py - y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
    const dx = Math.min(ix, w - 1 - ix), dy = Math.min(iy, h - 1 - iy);
    return !(dy < cuts.length && dx < cuts[dy]);
  };
}
function cutRectIn(x, y, w, h, [tl, tr, br, bl]) {
  return (px, py) => {
    const ix = Math.floor(px - x), iy = Math.floor(py - y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
    const rx = w - 1 - ix, ry = h - 1 - iy;
    return ix + iy >= tl && rx + iy >= tr && rx + ry >= br && ix + ry >= bl;
  };
}
function chevronIn(cx, cy, w, h, thick = 2) {
  const half = w / 2, top = cy - h / 2, drop = Math.max(0, h - thick);
  return (px, py) => {
    const dx = Math.abs(px - cx);
    if (dx >= half) return false;
    const k = half > 1 ? Math.min(1, Math.max(0, (dx - 0.5) / (half - 1))) : 0;
    const y0 = top + Math.round(drop * (1 - k));
    return py >= y0 && py < y0 + thick;
  };
}
// shape tests leaned like italic type: each row slides a whole number of pixels for its height above row cy
const leanedIn = (tests, cy, slope) => { const f = anyIn(tests); return (px, py) => f(px - Math.round(slope * (cy - py)), py); };

/** The shapes keycard@1 draws: a card with round corners, a square data chip with a cut corner and pins, a round fob on a ring. */
export const KEYCARD_SHAPES = Object.freeze(['card', 'chip', 'fob']);
/** The stripes across a keycard: one band, two bands or a chevron. */
export const KEYCARD_STRIPES = Object.freeze(['one', 'two', 'chevron']);
const CARD_SLANT = 0.375, CARD_ROCK = 0.125;   // a row slides this far for each row above the middle: at rest, and more or less as it rocks

function stripeOf(kind, w, y) {
  if (kind === 'two') return [[rectIn(-w / 2, y, w, 2), rectIn(-w / 2, y + 3, w, 2)], y + 2.5];
  if (kind === 'chevron') return [[chevronIn(0, y + 3, w, 6, 2)], y + 3];
  return [[rectIn(-w / 2, y, w, 3)], y + 1.5];
}
// the thing upright, its middle at (0, 0), h tall: { body, pins, stripe, mid, bezel, lamp, marks }, lists of shape tests
function cardShapes(shape, stripes, h) {
  if (shape === 'chip') {
    const s = h - 4, top = -s / 2 - 1, [stripe, mid] = stripeOf(stripes, s, top + 3);
    return { body: [cutRectIn(-s / 2, top, s, s, [0, 4, 0, 0])], pins: [-s / 2 + 2, -1, s / 2 - 4].map((x) => rectIn(x, top + s, 2, 2)), stripe, mid,
      bezel: [rectIn(-s / 2 + 2, top + s - 6, 5, 4)], lamp: [rectIn(-s / 2 + 3, top + s - 5, 3, 2)], marks: [rectIn(s / 2 - 5, top + s - 5, 3, 1), rectIn(s / 2 - 5, top + s - 3, 2, 1)] };
  }
  if (shape === 'fob') {
    const r = Math.round(h / 3), cy = h / 2 - r, top = -h / 2, [stripe, mid] = stripeOf(stripes, 2 * r, cy - r + 3);
    return { body: [ellipseIn(0, cy, r, r), rectIn(-2, top + 6, 4, cy - r - top - 4)], pins: [ringIn(0, top + 4, 4, 1.6)], stripe, mid,
      bezel: [rectIn(-3, cy + 1, 6, 4)], lamp: [rectIn(-2, cy + 2, 4, 2)], marks: [] };
  }
  const w = 2 * Math.round(h / 3), top = -h / 2, [stripe, mid] = stripeOf(stripes, w, top + 4);
  return { body: [roundRectIn(-w / 2, top, w, h, 2)], pins: [], stripe, mid,
    bezel: [rectIn(-w / 2 + 2, h / 2 - 7, 5, 5)], lamp: [rectIn(-w / 2 + 3, h / 2 - 6, 3, 3)],
    marks: [rectIn(-2, top + 2, 4, 1), rectIn(w / 2 - 4, h / 2 - 6, 2, 1), rectIn(w / 2 - 4, h / 2 - 4, 2, 1)] };
}

/** How far right of `at` a keycard's middle sits so the card, leaned at rest, is centred on it (sprites/keycard.js), and where its right edge is: { ox, right }. */
export function keycardRest(shape, stripes, h) {
  const K = cardShapes(shape, stripes, h);
  const rest = boundsOf(placedIn(leanedIn([...K.body, ...K.pins], 0, CARD_SLANT), 16, 16), 32, 32);
  const ox = Math.round(16 - (rest.x0 + rest.x1 + 1) / 2);
  return { ox, right: rest.x1 + ox - 16 };
}

/**
 * keycard@1: a security card held at a slant centred on `at`: a card with round corners, a lanyard slot and lines of
 * print, a square data chip with a cut corner and three contact pins, or a round fob on a ring; a coloured stripe
 * across it (one band, two or a chevron) with a lit edge along its top, a status light in a dark bezel. It is leaned by
 * sliding whole rows, never turned, so its edges stay hard; while it floats it rocks about a pixel each way, its light
 * flares white for a quarter of the loop and a glint slides along the stripe in the first half. Port of
 * sprites/keycard.js, pixel for pixel, as stamps; `height` 16 to 20 px. Paints: card (its ramp), stripe (its ramp),
 * lamp (the status light), pins (bare metal: the chip's pins, the fob's ring), bezel, glint (the band on the
 * stripe), shine (the flaring light). Call the outline after it.
 */
export const keycard = defineGenerator({
  id: 'keycard', v: 1, family: 'shape',
  about: 'A security card, data chip or fob held at a slant, with a coloured stripe, a blinking light and a glint along the stripe.',
  args: {
    at: point({ about: 'The middle of the card, leaned at rest' }),
    shape: word(KEYCARD_SHAPES, { default: 'card', about: 'Card, chip or fob' }),
    stripes: word(KEYCARD_STRIPES, { default: 'one', about: 'One band, two bands or a chevron' }),
    height: count(12, 24, { default: 18, about: 'How tall it is, in pixels (an even number looks best)' }),
    collect: collectArg(),
    card: paint({ about: 'The card' }),
    stripe: paint({ about: 'The stripe' }),
    lamp: paint({ about: 'The status light' }),
    pins: paint({ about: 'Bare metal: the chip\'s pins, the fob\'s ring' }),
    bezel: paint({ about: 'The dark bezel round the light' }),
    glint: paint({ about: 'The glint sliding along the stripe' }),
    shine: paint({ about: 'The light as it flares' }),
  },
  cost: (a) => portCost(a.height + 4, 12) + workCost(32 * 32 * 4),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const h = a.height, K = cardShapes(a.shape, a.stripes, h), idle = !pose.still, t = ctx.t;
    const { ox } = keycardRest(a.shape, a.stripes, h);
    const x = a.at[0] + ox, y = a.at[1];
    const slope = CARD_SLANT + (idle ? CARD_ROCK * wave(t) : 0);
    const put = (tests) => placedIn(leanedIn(tests, 0, slope), x, y, { sx: pose.sx, sy: pose.sy });
    const { g, box } = gridAround(x, y, h + 4);
    const M = rampOf(a.card), A = rampOf(a.stripe);
    const body = put(K.body);
    if (K.pins.length) g.fill(...box, put(K.pins), rampOf(a.pins));
    g.fill(...box, body, M, { light: 1 });
    const stripe = allIn(put(K.stripe), body);
    g.fill(...box, stripe, A);
    // a lit edge along the top of the stripe (its foot is the stripe's own dark tone)
    g.fill(...box, (px, py) => body(px, py) && !stripe(px, py) && stripe(px, py + 1), M.light);
    if (!pose.bare) {
      g.fill(...box, put(K.marks), M.dark, { clip: body });
      g.fill(...box, put(K.bezel), a.bezel, { clip: body });
      const flare = idle && t >= 0.5 && t < 0.75;
      g.fill(...box, put(K.lamp), flare ? a.shine : a.lamp, { clip: body });
      if (idle) glintBand(g, stripe, { x: x - slope * K.mid, y: y + K.mid, r: h / 3, phase: lerp(-1.6, 1.6, clamp01((t - 0.05) / 0.45)), slant: -0.5, width: 0.24, paint: a.glint });
    }
    return g.stamps();
  },
});

// ---- xp.shard@1: sprites/xp-shard.js -----------------------------------------------------------------------------

// a crystal standing on a point, edges sloping one across for one down (engine/gadgets.js crystalIn)
function crystalIn(cx, cy, w, h) {
  const a = w / 2, b = Math.max(h / 2, a);
  return (px, py) => { const x = Math.abs(px - cx), y = Math.abs(py - cy); return x < a && x + y < b + 0.25; };
}
// a cube seen from a corner (engine/gadgets.js cubeIn), on engine/shapes.js hexIn
function cubeIn(cx, cy, w) {
  const a = w / 2, r = w / 4, topY = cy - a + r, body = hexIn(cx, cy, w, w);
  const top = (px, py) => body(px, py) && Math.abs(px - cx) / a + Math.abs(py - topY) / r <= 1.05;
  return { body, top, topY, right: (px, py) => px > cx && body(px, py) && !top(px, py) };
}
const scaledIn = (test, k) => placedIn(test, 0, 0, { sx: k });

/** The shapes xp.shard@1 draws: a crystal on its point, a ball, a four-pointed spark, a cube seen from a corner. */
export const XP_SHAPES = Object.freeze(['shard', 'orb', 'star', 'cube']);
/** What an xp.shard@1 call draws: the shard floating, the shard pulled to the right with its tail, or the streaks behind it (drawn after the outline). */
export const XP_LAYERS = Object.freeze(['float', 'pulled', 'streaks']);
// each shape n px along its longer side around (0, 0): { body, hw, hh, heart (k => the pale heart), faces, oddX, oddY }
const SHARD_SHAPES = {
  shard: (n) => { const w = 2 * Math.floor(n * 0.3) + 1, body = crystalIn(0, 0, w, n); return { body, hw: w / 2, hh: n / 2, heart: (k) => scaledIn(body, lerp(0.42, 0.62, k)), oddX: true, oddY: n % 2 === 1 }; },
  orb: (n) => { const r = n % 2 ? (n - 1) / 2 + 0.4 : n / 2, body = ellipseIn(0, 0, r, r); return { body, hw: n / 2, hh: n / 2, heart: (k) => scaledIn(body, lerp(0.42, 0.62, k)), oddX: n % 2 === 1, oddY: n % 2 === 1 }; },
  star: (n) => { const body = polyIn(starPoints(0, 0, n / 2 + 0.3, 4, { inner: 0.42 })); return { body, hw: n / 2, hh: n / 2, heart: (k) => scaledIn(body, lerp(0.42, 0.62, k)), oddX: n % 2 === 1, oddY: n % 2 === 1 }; },
  cube: (n) => {
    const w = 2 * Math.ceil(n / 2), C = cubeIn(0, 0, w), top = (px, py) => C.top(px, py + C.topY);
    return { body: C.body, hw: w / 2, hh: w / 2, heart: (k) => placedIn(top, 0, C.topY, { sx: lerp(0.7, 1, k) }), faces: [[C.right, 'dark']] };
  },
};

/**
 * xp.shard@1: a tiny glowing shard of experience in a 16 px frame whose middle is `at`: a crystal, a ball, a spark or a
 * cube, `length` px along its longer side (an odd length sits on a pixel centre), lit at its edge with no shadow and a
 * pale heart that swells twice a loop while it floats. `layer` "pulled" draws it squeezed long and low at the head of a
 * tapering tail near the frame's right edge (pulled towards the player, the tail beating); "streaks" draws the two loose
 * streaks that run behind it then (after the outline). Port of sprites/xp-shard.js, pixel for pixel, as stamps. Paints:
 * body (its ramp), heart. Call the outline after the shard; the streaks go after the outline.
 */
export const xpShard = defineGenerator({
  id: 'xp.shard', v: 1, family: 'shape',
  about: 'A tiny glowing shard, ball, spark or cube of experience with a pulsing heart, or pulled along with a tail and streaks.',
  args: {
    at: point({ about: 'The middle of its 16 pixel frame' }),
    shape: word(XP_SHAPES, { default: 'shard', about: 'Crystal, ball, spark or cube' }),
    length: count(6, 12, { default: 9, about: 'Pixels along its longer side' }),
    layer: word(XP_LAYERS, { default: 'float', about: 'Floating, pulled to the right with a tail, or the streaks behind it' }),
    collect: collectArg(),
    body: paint({ about: 'The shard' }),
    heart: paint({ about: 'Its pale heart' }),
  },
  cost: () => portCost(9, 8),
  run(a, ctx) {
    const S = SHARD_SHAPES[a.shape](a.length), { hw, hh } = S, t = ctx.t;
    const cx = a.at[0] + (S.oddX ? 0.5 : 0), cy = a.at[1] + (S.oddY ? 0.5 : 0), B = rampOf(a.body);
    const F = [a.at[0] - 8, a.at[1] - 8, a.at[0] + 8, a.at[1] + 8];          // the 16 px frame
    const g = new Pixels(F[0], F[1], 16, 16);
    const draw = (x, y, sx, sy, k, bare) => {
      const put = (test) => placedIn(test, x, y, { sx, sy }), body = put(S.body);
      g.fill(...F, body, B, { shade: 0, light: S.faces ? 0 : 1 });
      for (const [face, tone] of S.faces ?? []) g.fill(...F, put(face), B[tone], { clip: body });
      if (!bare) g.fill(...F, put(S.heart(k)), a.heart, { clip: insetIn(body, 1) });
    };
    if (a.layer !== 'float') {
      const long = Math.min(Math.max(2 * hw * 1.3, 6), 9) + pulse(t * 2), low = Math.min(Math.max(2 * hh * 0.7, 4), 7);
      const head = F[2] - 2 - long / 2, tail = F[0] + 2 + Math.round(pulse(t));
      if (a.layer === 'pulled') {
        g.fill(...F, polyIn([[head, cy - low * 0.4], [head, cy + low * 0.4], [tail, cy + 0.5], [tail, cy - 0.5]]), S.faces ? B.dark : { base: B.base, dark: B.base, light: B.light }, { light: 1 });
        draw(head, cy, long / (2 * hw), low / (2 * hh), 0.4, false);
        return g.stamps();
      }
      // two loose streaks behind it, sliding left and shrinking (engine/fx.js streaks), inside the frame's 1 px border
      const x0 = head - long / 2 - 2, reach = Math.max(2, head - F[0] - long / 2 - 4), spread = low / 2 + 0.5;
      for (let i = 0; i < 2; i++) {
        const life = fract(t + (i + 0.5 * hash(i, 1)) / 2);
        const side = (i - 0.5) * 2 * spread;
        const len = Math.max(1, Math.round(3 * (0.6 + 0.4 * hash(i, 2)) * (1 - 0.7 * life)));
        const sx = x0 - reach * life, sy = cy - side;
        for (let j = 0; j < len; j++) {
          const px = Math.floor(sx - j), py = Math.floor(sy);
          if (px >= F[0] + 1 && py >= F[1] + 1 && px < F[2] - 1 && py < F[3] - 1) g.dot(px, py, B.light);
        }
      }
      return g.stamps();
    }
    const pose = prizePose(a.collect, ctx, 1);
    if (!pose.show) return [];
    draw(cx, cy, pose.sx, pose.sy, pose.still ? 0 : pulse(t * 2), pose.bare);
    return g.stamps();
  },
});

// ---- shield.cell@1: sprites/shield-cell.js -----------------------------------------------------------------------

// a hexagon lying on a flat side (engine/gadgets.js flatHexIn)
function flatHexIn(cx, cy, w, h) {
  const a = w / 2, b = h / 2;
  return (px, py) => { const x = Math.abs(px - cx), y = Math.abs(py - cy); return y < b && x + y / 2 < a + 0.25; };
}
// a short run of a shape's edge, chosen by its direction from a centre: phase 0 at the top, clockwise (engine/gadgets.js rimRunIn)
function rimRunIn(test, cx, cy, phase = 0, span = 0.2, thick = 1) {
  const deep = (px, py) => test(px - thick, py) && test(px + thick, py) && test(px, py - thick) && test(px, py + thick);
  return (px, py) => {
    if (!test(px, py) || deep(px, py)) return false;
    if (span >= 1) return true;
    let d = Math.atan2(px - cx, cy - py) / TAU - phase;
    d -= Math.round(d);
    return Math.abs(d) <= span / 2;
  };
}
// a band from pole to pole over the near side of a ball turning about its upright axis (engine/gadgets.js meridianIn)
function meridianIn(cx, cy, rx, ry, turn = 0, thick = 2) {
  const s = Math.sin(turn), k = Math.cos(turn) >= 0 ? s : -s, half = thick / 2, reach = Math.abs(k) * rx;
  return (px, py) => {
    const dx = px - cx, yy = (py - cy) / ry;
    if ((dx / rx) ** 2 + yy * yy > 1) return false;
    if (Math.abs(dx - k * rx * Math.sqrt(1 - yy * yy)) < half) return true;
    const u = reach > 1e-6 ? (dx * Math.sign(k)) / reach : -1;
    return u >= 0 && u <= 1 && Math.abs(Math.abs(py - cy) - ry * Math.sqrt(1 - u * u)) < half;
  };
}

/** The shapes shield.cell@1 draws: a six-sided shell lying on a flat side, an orb crossed by casing bands, a ring in two clamps. */
export const SHIELD_SHAPES = Object.freeze(['hex', 'orb', 'ring']);
const SHIELD_WIDTH = { hex: [16, 22], orb: [14, 20], ring: [16, 22] };   // width at the smallest and biggest size
const even = (v) => 2 * Math.round(v / 2);
const SWAY = 0.75;   // how far the shell turns to each side, in radians: never edge-on

/** The width and height of a shield cell of this shape at size u (0..1), whole even pixels: { w, h }. */
export function shieldCellSize(shape, u) {
  const [w0, w1] = SHIELD_WIDTH[shape], w = even(lerp(w0, w1, u));
  return { w, h: shape === 'hex' ? even(w * 0.9) : w };
}

/**
 * shield.cell@1: a cell of shield energy centred on `at`: a thick six-sided shell lying on a flat side in a pale
 * casing, turning slowly from side to side and showing its edge (one or two layers of energy inside it); an orb of
 * energy with a cap on each pole and one or two casing bands from pole to pole that cross it as it turns; or a ring of
 * energy in a clamp at the top and the bottom, turning round a bright bead (a second ring inside it turning the other
 * way). While it floats a bright line runs once round its rim. Width 16 to 22 px from small to big (the orb 14 to 20),
 * even. Port of sprites/shield-cell.js (engine/gadgets.js drawToken, rimRunIn, meridianIn), pixel for pixel, as
 * stamps. Paints: casing (its ramp), energy (its ramp), band (the orb's bands), shine (the running light, the
 * bead, the glints). Call the outline after it.
 */
export const shieldCell = defineGenerator({
  id: 'shield.cell', v: 1, family: 'shape',
  about: 'A turning six-sided shell, banded orb or clamped ring of shield energy with a light running round its rim.',
  args: {
    at: point({ about: 'The middle of the cell' }),
    shape: word(SHIELD_SHAPES, { default: 'hex', about: 'Six sides, orb or ring' }),
    size: share({ default: 0.5, about: 'Small to big: 16 to 22 pixels wide (the orb 14 to 20)' }),
    layers: count(1, 2, { default: 1, about: 'One or two layers of shell, band or ring' }),
    collect: collectArg(),
    casing: paint({ about: 'The casing' }),
    energy: paint({ about: 'The energy' }),
    band: paint({ about: 'The casing bands across the orb' }),
    shine: paint({ about: 'The light running round the rim, the bead and the glints' }),
  },
  cost: () => portCost(14, 12),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const { w, h } = shieldCellSize(a.shape, a.size), R = w / 2, two = a.layers === 2;
    const idle = !pose.still, t = ctx.t, x0 = a.at[0], y = a.at[1];
    const { g, box } = gridAround(x0, y, 14);
    const M = rampOf(a.casing), G = rampOf(a.energy), white = a.shine;
    const run = idle ? t + 0.06 : 0.12;
    const put = (test) => placedIn(test, x0, y, { sx: pose.sx, sy: pose.sy });
    if (a.shape === 'orb') {
      const ball = put(ellipseIn(0, 0, R, R));
      g.fill(...box, ball, G, { shade: 2 });
      if (!pose.bare) {
        g.fill(...box, put(ellipseIn(R * 0.2, -R * 0.2, R * 0.5, R * 0.5)), G.light, { clip: insetIn(ball, 1) });
        g.fill(...box, put(ellipseIn(R * 0.3, -R * 0.3, R * 0.2, R * 0.2)), white);
        const turn = idle ? PI * t : 0.5;
        const bands = [meridianIn(0, 0, R, R, turn, 2), ...(two ? [meridianIn(0, 0, R, R, turn + PI / 2, 2)] : [])];
        g.fill(...box, put(anyIn(bands)), a.band, { outline: G.dark, clip: ball });
      }
      g.fill(...box, (px, py) => ball(px, py) && Math.abs(py - y) > (R - 2) * pose.sy, M, { light: 1 });
      g.fill(...box, rimRunIn(ball, x0, y, run, 0.2), white);
    } else if (a.shape === 'ring') {
      const turn = idle ? SWAY * wave(t) : 0, c = Math.cos(turn);
      const hoop = put(hoopIn(0, 0, R * c, R, 3));
      g.fill(...box, hoop, G, { shade: 1, light: 1 });
      if (two && !pose.bare) g.fill(...box, put(hoopIn(0, 0, (R - 5) * Math.cos(idle ? SWAY * wave(t, 0.25) : 0.5), R - 5, 2)), { base: G.light, dark: G.base, light: G.light }, { shade: 1 });
      g.fill(...box, put(ellipseIn(0, 0, 2, 2)), white, { outline: G.base });
      const clamp = anyIn(rectIn(-2, -R, 4, 4), rectIn(-2, R - 4, 4, 4));
      g.fill(...box, put(clamp), M, { light: 1 });
      g.fill(...box, rimRunIn(hoop, x0, y, run, 0.16), white, { clip: (px, py) => !put(clamp)(px, py) });
    } else {
      // a thick six-sided shell: a pale rim, a dark groove, then the energy, brighter towards the middle
      const T = drawToken(g, box, flatHexIn(0, 0, w, h), x0, y, a.casing, { turn: idle ? SWAY * wave(t) : 0, thick: 4 * pose.scale, rim: 2, field: G.dark, sx: pose.sx, sy: pose.sy });
      if (T.field) {
        g.fill(...box, insetIn(T.field, 1), G.base);
        if (two) { g.fill(...box, insetIn(T.field, 3), G.dark); g.fill(...box, insetIn(T.field, 4), G.light); }
        else g.fill(...box, insetIn(T.field, 3), G.light);
        if (!pose.bare) g.fill(...box, T.on(rectIn(-1, -1, 2, 2)), white);
        g.fill(...box, rimRunIn(T.face, x0 + T.x * pose.sx, y, run, 0.2, 2), white, { clip: (px, py) => !T.field(px, py) });
      }
    }
    return g.stamps();
  },
});

// ---- star.charm@1: sprites/star-charm.js -------------------------------------------------------------------------

// a four-point sparkle: size 0 one pixel, 1 a plus, 2 a big plus, its centre `core` from size 1 up (engine/fx.js twinkle)
function twinkleAt(g, x, y, size, paint, core) {
  const s = Math.max(0, Math.round(size));
  x = Math.floor(x); y = Math.floor(y);
  for (let i = 1; i <= s; i++) { g.dot(x - i, y, paint); g.dot(x + i, y, paint); g.dot(x, y - i, paint); g.dot(x, y + i, paint); }
  g.dot(x, y, s ? core : paint);
}

/** The stars star.charm@1 draws, by their points. */
export const CHARM_POINTS = Object.freeze(['four', 'five', 'six', 'eight']);
/** What a star.charm@1 call draws: the halo behind it, the badge on its loop, or the trailing twinkles and the gleam in front. */
export const CHARM_LAYERS = Object.freeze(['halo', 'charm', 'sparkles']);
const CHARM_N = { four: 4, five: 5, six: 6, eight: 8 };
// six and eight points: deeper notches, and a bar down each point so a slanted point is a solid stair of pixels
const CHARM_CUT = { six: { inner: 0.46, spine: 0.71 }, eight: { inner: 0.44, spine: 0.75 } };
// the turn through one loop, in half turns: it passes edge-on quickly (only frame 4 of 8 is the bar)
const CHARM_TURN = [[0, 0], [0.375, 0.32], [0.5, 0.5], [0.625, 0.68], [1, 1]];
const CHARM_LOOP = 2, CHARM_THICK = 2;

/**
 * star.charm@1: a flat star-shaped medallion with sharp straight points, a raised rim and a jewel, hanging from a small
 * loop at its top point; `at` is the middle of the whole charm. While it floats it swings about six degrees each way
 * round the loop and turns edge-on once a loop as a coin does (the loop stays face-on; a short stem keeps the two
 * joined). `layer` picks what is drawn: "halo", a thin ring of light behind the star that swells and brightens twice a
 * loop; "charm", the badge and its loop (outline it on its own: the halo and the twinkles are not inked); "sparkles",
 * three twinkles that trail the swing and blink in turn (still in the first half of a collect) and, with `sparkle`, a
 * gleam as it turns to face us again. 13 to 19 px across its points from small to big. Port of sprites/star-charm.js,
 * pixel for pixel, as stamps. Paints: metal (its ramp), energy (its ramp: the jewel, the halo, the twinkles), shine.
 */
export const starCharm = defineGenerator({
  id: 'star.charm', v: 1, family: 'shape',
  about: 'A star-shaped medallion with a jewel hanging from a loop, swinging and turning edge-on, with a halo and trailing twinkles.',
  args: {
    at: point({ about: 'The middle of the charm, loop included' }),
    points: word(CHARM_POINTS, { default: 'five', about: 'Four, five, six or eight points' }),
    size: share({ default: 0.5, about: 'Small to big: 13 to 19 pixels across its points' }),
    jewel: flag({ default: true, about: 'A round jewel in its middle' }),
    sparkle: flag({ default: true, about: 'A gleam as it turns to face us again (the sparkles layer)' }),
    layer: word(CHARM_LAYERS, { default: 'charm', about: 'The halo behind, the badge, or the twinkles in front' }),
    collect: collectArg(),
    metal: paint({ about: 'The badge' }),
    energy: paint({ about: 'The jewel, the halo and the twinkles' }),
    shine: paint({ about: 'The glint on the jewel and the twinkles\' centres' }),
  },
  cost: () => portCost(14, 10),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    const idle = !pose.still, t = ctx.t;
    const R = Math.round(lerp(13, 19, a.size)) / 2, n = CHARM_N[a.points], D = R, mid = (D + R - CHARM_LOOP) / 2;
    const swing = idle ? 0.11 * wave(t) : 0, turn = idle ? PI * keys(t, CHARM_TURN, (x) => x) : 0;
    const cx = a.at[0], y = a.at[1];
    const put = (test) => placedIn(placedIn(test, 0, -mid, { angle: swing }), cx, y, { sx: pose.sx, sy: pose.sy });
    const sx = cx - Math.sin(swing) * D * pose.sx, sy = y + (Math.cos(swing) * D - mid) * pose.sy;
    const M = rampOf(a.metal), G = rampOf(a.energy);
    const { g, box } = gridAround(cx, y, 15);
    if (a.layer === 'sparkles') {
      if (!(idle || t < 0.5)) return [];
      const tw = idle ? t : 0;
      [[-0.95, 0.55], [1, 0.1], [-0.15, 1.2]].forEach(([ux, uy], i) => {
        const life = fract(tw + i / 3), lag = 2.5 * (wave(tw, -0.14 * (i + 1)) - wave(0, -0.14 * (i + 1)));
        if (life < 0.67) twinkleAt(g, cx + ux * (R + 2) - lag, y + (D - mid) + uy * (R + 1) * 0.8, life < 0.34 ? 1 : 0, life < 0.34 ? G.base : G.light, a.shine);
      });
      if (idle && a.sparkle) {
        const d = Math.abs(fract(t - 0.875 + 0.5) - 0.5), size = d < 0.07 ? 2 : d < 0.19 ? 1 : -1;
        if (size >= 0) twinkleAt(g, sx + R * 0.6, sy - R * 0.8, size, M.light, a.shine);
      }
      return g.stamps();
    }
    if (!pose.show) return [];
    if (a.layer === 'halo') {
      if (pose.bare) return [];
      const beat = pulse(t * 2), hr = R * lerp(0.74, 0.96, beat);
      g.fill(...box, ringIn(sx, sy, hr + 1, 1), toneOf(a.energy, -1));
      g.fill(...box, ringIn(sx, sy, hr, 1), beat > 0.5 ? G.light : G.base);
      return g.stamps();
    }
    const cut = CHARM_CUT[a.points], flat = polyIn(starPoints(0, D, R, n, { inner: cut?.inner }));
    const spines = cut && spunIn(capsuleIn(0, 0, 0, cut.spine - R, cut.spine), 0, D, n);
    const star = spines ? (x, yy) => flat(x, yy) || (yy >= CHARM_LOOP - 1 && spines(x, yy)) : flat;
    const stem = rectIn(-1, CHARM_LOOP - 1, 2, 2), loop = ringIn(0, 0, CHARM_LOOP, 1);
    const edgeOn = Math.abs(Math.cos(turn)) < 0.2, tall = rectIn(-R, D - R, 2 * R, R + (n % 2 ? R * Math.cos(PI / n) : R));
    const T = turnedIn((x, yy) => (edgeOn ? tall(x, yy) : star(x, yy)) || stem(x, yy), turn, edgeOn ? CHARM_THICK : 1.2);
    const side = mixOf(M.base, M.dark, 0.5), front = { base: M.light, dark: M.base, light: mixOf(M.light, a.shine, 0.5) };
    g.fill(...box, put(T.body), { base: side, dark: M.dark, light: M.base }, { shade: 1 });     // the edge of the badge
    g.fill(...box, put(T.face), front, { shade: 1, light: T.squeeze > 0.9 ? 1 : 0 });
    g.fill(...box, put(loop), front, { shade: 1 });                                          // the loop, always face-on
    if (T.squeeze > 0.3) {
      g.fill(...box, insetIn(put((x, yy) => T.face(x, yy) && star((x - T.x) / T.squeeze, yy)), 1), M.base);
      if (a.jewel && !pose.bare) {
        const jr = Math.max(2, R * 0.28);
        g.fill(...box, put(ellipseIn(T.x, D, jr * T.squeeze, jr)), G, { light: 1, outline: M.dark });
        if (T.squeeze > 0.6) g.dot(sx + T.x, sy - 1, a.shine);
      }
    }
    return g.stamps();
  },
});

// ---- power.orb@1: sprites/power-orb.js (engine/crystals.js drawCrystal and drawAura, engine/orbits.js orbitHoop) ---

/** The shells power.orb@1 draws: a polished orb, a six-sided prism with pointed ends, a long four-sided shard. */
export const ORB_SHELLS = Object.freeze(['orb', 'prism', 'shard']);
/** The marks inside a power orb: an up arrow, a sun, a star, or none. */
export const ORB_MARKS = Object.freeze(['arrow', 'sun', 'star', 'none']);
/** What a power.orb@1 call draws: the glow round the inked shell, the far half of its ring, the shell with its mark, or the near half of its ring. */
export const ORB_LAYERS = Object.freeze(['aura', 'far', 'shell', 'near']);
// half width and height of each shell at the smallest and the biggest size; where the mark and the hoop sit below the middle
const ORB_SIZE = { orb: { rx: [5, 7], ry: [5, 7] }, prism: { rx: [4, 5], ry: [7, 9] }, shard: { rx: [5, 5], ry: [7, 10] } };
const ORB_PLACE = { orb: { mark: -1, hoop: 3, drift: 1 }, prism: { mark: -1, hoop: 3, drift: 1 }, shard: { mark: 0, hoop: 4, drift: 0 } };
const SPINDLES = { shard: { sides: 4, top: 0.22, bottom: 0.22, width: 1 }, prism: { sides: 6, top: -0.5, bottom: 0.5, width: 1 } };
const faceTone = (score) => (score > 0.95 ? 2 : score > 0.3 ? 1 : score > -0.45 ? 0 : -1);

// a standing crystal turned about its upright axis: { outline, faces } (engine/crystals.js crystalFaces, orb, prism and shard)
function crystalFaces(cx, cy, rx, ry, cut, turn) {
  if (cut === 'orb') return { outline: ellipseIn(cx, cy, rx, ry), faces: [] };
  const S = SPINDLES[cut], n = S.sides, lean = Math.min(1.2, ry * 0.1);
  const at = (i, h) => { const a = (turn + i) * (TAU / n); return [cx + Math.sin(a) * rx * S.width, cy + h * ry + Math.cos(a) * lean]; };
  const up = [cx, cy - ry], down = [cx, cy + ry];
  const faces = [], all = [];
  for (let i = 0; i < n; i++) {
    const mid = (turn + i + 0.5) * (TAU / n), toUs = Math.cos(mid), toLight = Math.sin(mid);
    const a = at(i, S.top), b = at(i + 1, S.top), c = at(i + 1, S.bottom), d = at(i, S.bottom);
    const list = [{ pts: [up, a, b], lift: 0.45 }, ...(S.bottom > S.top ? [{ pts: [a, b, c, d], lift: 0 }] : []), { pts: [d, c, down], lift: -0.55 }];
    for (const f of list) {
      all.push(polyIn(f.pts));
      if (toUs > 0.02) faces.push({ pts: f.pts, tone: faceTone(toLight + f.lift) });
    }
  }
  return { outline: (px, py) => all.some((f) => f(px, py)), faces };
}
// a standing crystal lit from the top right (engine/crystals.js drawCrystal); returns its silhouette
function drawCrystal(g, cx, cy, rx, ry, glow, shine, { cut, turn }) {
  const R = rampOf(glow), { outline, faces } = crystalFaces(cx, cy, rx, ry, cut, turn);
  const box = [cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2];
  const tones = { 2: mixOf(R.light, shine, 0.55), 1: R.light, 0: R.base, [-1]: R.dark };
  if (cut === 'orb') {
    g.fill(...box, outline, R, { shade: Math.min(rx, ry) >= 6 ? 2 : 1 });
    const a = TAU * turn, wx = cx + rx * (0.28 + 0.1 * Math.cos(a)), wy = cy - ry * (0.3 + 0.08 * Math.sin(a));
    const keep = (px, py) => outline(px, py) && outline(px + 1, py) && outline(px, py - 1);
    g.fill(...box, ellipseIn(wx, wy, rx * 0.42, ry * 0.42), R.light, { clip: keep });
    g.fill(...box, ellipseIn(wx + rx * 0.12, wy - ry * 0.1, Math.max(1, rx * 0.18), Math.max(1, ry * 0.18)), tones[2], { clip: keep });
    g.fill(...box, (px, py) => outline(px, py) && !outline(px + 1.5, py - 1.5) && px < cx && py > cy, R.dark);
    return outline;
  }
  g.fill(...box, outline, R.base);
  for (const f of faces) g.fill(...box, polyIn(f.pts), tones[f.tone] ?? R.base, { clip: outline });
  return outline;
}
// the 'up' arrow mark: a head widening a pixel each side per row, a shaft under it (sprites/power-orb.js arrowUpIn)
const arrowUpIn = (x, y, size) => {
  const n = Math.max(2, (size - 1) >> 1), half = n >= 3 ? 1 : 0, tip = y - n;
  return (px, py) => { const i = Math.abs(Math.floor(px) - x), j = Math.floor(py) - tip; if (j < 0 || j > 2 * n) return false; return j < n + 1 ? i <= j : i <= half; };
};

/** The half width and height of a power orb's shell at size u (0..1), whole pixels: { rx, ry }. */
export function powerOrbSize(shell, u) {
  const S = ORB_SIZE[shell];
  return { rx: Math.round(lerp(S.rx[0], S.rx[1], u)), ry: Math.round(lerp(S.ry[0], S.ry[1], u)) };
}

/**
 * power.orb@1: a floating power-up centred on `at`: a glowing shell (a polished orb, a six-sided prism or a long
 * shard) turning slowly about its upright axis, with a bright band sweeping across it, a mark inside it (an up arrow,
 * a sun or a star, 7 px where the shell is wide enough round it, else 5, drifting a pixel side to side as it turns),
 * a glow hugging its outline that swells and sinks once a loop, and a metal ring round its lower half with a bead of
 * light running round it. `layer` picks what is drawn, back to front: "aura" (the glow round the shell as inked),
 * "far" (the ring's far half), "shell" (outline this one on its own), "near" (the ring's near half). Port of
 * sprites/power-orb.js, pixel for pixel, as stamps. Paints: energy (its ramp: the shell, the glow, the bead), metal
 * (the ring's ramp), markInk (the mark), markHalo (a pixel round the mark where it stands clear of the shell: white
 * round a dark mark), shine.
 */
export const powerOrb = defineGenerator({
  id: 'power.orb', v: 1, family: 'shape',
  about: 'A glowing orb, prism or shard with a mark inside, turning in its own glow inside a metal ring with a running bead.',
  args: {
    at: point({ about: 'The middle of the shell' }),
    shell: word(ORB_SHELLS, { default: 'orb', about: 'Orb, prism or shard' }),
    size: share({ default: 0.5, about: 'Small to big' }),
    mark: word(ORB_MARKS, { default: 'star', about: 'The mark inside it' }),
    layer: word(ORB_LAYERS, { default: 'shell', about: 'The glow, the ring\'s far half, the shell, or the ring\'s near half' }),
    collect: collectArg(),
    energy: paint({ about: 'The shell, its glow and the bead' }),
    metal: paint({ about: 'The ring' }),
    markInk: paint({ default: 'ink', about: 'The mark' }),
    markHalo: paint({ about: 'The pixel round the mark' }),
    shine: paint({ about: 'The glints and the bead\'s heart' }),
  },
  cost: () => portCost(15, 14) + workCost(31 * 31 * 25),
  run(a, ctx) {
    const pose = prizePose(a.collect, ctx);
    if (!pose.show) return [];
    const idle = !pose.still, t = fract(ctx.t), cx = a.at[0], cy = a.at[1];     // the turn as a share of the loop: t = 1 draws as t = 0
    const { rx, ry } = powerOrbSize(a.shell, a.size), place = ORB_PLACE[a.shell];
    const G = rampOf(a.energy), bright = toneOf(a.energy, 1.6);
    const { g, box } = gridAround(cx, cy, 15);
    if (a.layer === 'far' || a.layer === 'near') {
      if (pose.bare) return [];
      const far = a.layer === 'far', M = rampOf(a.metal);
      const hx = Math.min(rx + 4, 14) * Math.min(1, pose.sx), hy = 3, hcy = Math.round(cy) + place.hoop;
      const hoop = hoopIn(cx, hcy, hx, hy, 2);
      g.fill(...box, (px, py) => (far ? py < hcy : py >= hcy) && hoop(px, py), far ? M.dark : M.base);
      if (idle) {
        const angle = TAU * t, near = Math.sin(angle) >= 0;
        if (near !== far) twinkleAt(g, cx + Math.cos(angle) * (hx - 1), hcy + Math.sin(angle) * (hy - 1), far ? 0 : 1, bright, a.shine);
      }
      return g.stamps();
    }
    const sx = rx * pose.sx, sy = ry * pose.sy;
    const shell = drawCrystal(g, cx, cy, Math.max(2, sx), Math.max(2, sy), a.energy, a.shine, { cut: a.shell, turn: idle ? t : 0 });
    if (a.layer === 'aura') {
      // the glow round the shell as it is inked (the shell and the ring of ink round it), in rings of colour from the nearest out
      if (pose.still && ctx.t > 0.5 && ctx.t < 0.65) return [];          // none on the white flash
      const r = idle ? 1 + Math.round(pulse(t)) : 1, rings = [mixOf(bright, a.energy, 0.5), a.energy];
      const inked = (x, y) => g.has(x, y) || g.has(x - 1, y) || g.has(x + 1, y) || g.has(x, y - 1) || g.has(x, y + 1);
      const out = g.blank();
      for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) {
        if (inked(x, y)) continue;
        let near = Infinity;
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (inked(x + ox, y + oy)) near = Math.min(near, Math.hypot(ox, oy));
        const ring = Math.round(near);
        if (ring >= 1 && ring <= r) out.set(x, y, rings[Math.min(ring, rings.length) - 1]);
      }
      return out.stamps();
    }
    if (idle) glintBand(g, shell, { x: cx, y: cy, r: ry, phase: lerp(-1.6, 1.6, clamp01((t - 0.1) / 0.5)), width: 0.12, paint: mixOf(bright, a.shine, 0.6) });
    if (a.mark !== 'none' && !pose.bare) {
      const mx = Math.floor(cx) + (idle ? Math.round(wave(t)) * place.drift : 0), my = Math.round(cy) + place.mark;
      let inner = 0;
      for (let x = g.x0; x < g.x0 + g.w; x++) if (g.has(x, my)) inner++;
      const size = inner >= 7 + 4 ? 7 : 5, halo = inner >= size + 4;
      const sign = a.mark === 'arrow' ? arrowUpIn(mx, my, size) : markIn(a.mark, mx, my, size);
      const inShell = (x, y) => g.has(x, y);
      const marked = [];
      for (let y = my - 4; y <= my + 4; y++) for (let x = mx - 4; x <= mx + 4; x++) if (sign(x + 0.5, y + 0.5)) marked.push([x, y]);
      const isMark = (x, y) => sign(x + 0.5, y + 0.5);
      if (halo) for (let y = my - 5; y <= my + 5; y++) for (let x = mx - 5; x <= mx + 5; x++) {
        if (isMark(x, y) || !inShell(x, y)) continue;
        if (isMark(x - 1, y) || isMark(x + 1, y) || isMark(x, y - 1) || isMark(x, y + 1) || isMark(x - 1, y - 1) || isMark(x + 1, y - 1) || isMark(x - 1, y + 1) || isMark(x + 1, y + 1)) g.set(x, y, a.markHalo);
      }
      for (const [x, y] of marked) if (inShell(x, y)) g.set(x, y, a.markInk);
    }
    return g.stamps();
  },
});

/** Every generator this module adds (batch M2), by its export name: name -> registry entry. */
export const PRIZE_GENERATORS = Object.freeze({ timepiece, trophy, potionBottle, meal, mealSteam, scroll, keycard, xpShard, shieldCell, starCharm, powerOrb });
