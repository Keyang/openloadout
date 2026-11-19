// Food helpers: things to eat drawn face-on, the size of a pickup (docs/style-guide.md sections 1 and 14).
// Three families, four kinds each: fruit (apple, pear, berries, citrus), meals (drumstick, bread,
// cheese, pie) and sweets (wrapped, lollipop, donut, cupcake), plus the two patterns food is
// decorated with (a spiral swirl and scattered sprinkles). Every kind is described upright around
// (0, 0) in pixels at scale 1, then scaled, squashed and turned by placedIn (shapes.js), so a
// pickup can bob, rock and pop it. Pure drawing on a Surface: Node and browser. Colours are
// arguments; nothing here outlines (call g.outline(INK) once afterwards, as for any body).
//
//   import { FRUIT_KINDS, foodReach, drawFruit } from '../engine/food.js';
//   const r = foodReach('fruit', p.shape), k = lerp(0.8, 1.15, p.size);
//   const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: 17, up: r.up * k + 1, down: r.down * k + 1, side: r.side * k + 1 });
//   drawFruit(g, 16, at.y, { kind: p.shape, k, sx: at.sx, sy: at.sy, angle, lag, colour: p.body, leaf: p.accent, stalk: P.soil, shine: p.shine, bare: at.bare });
//   g.outline(INK);
//
// Each draw function returns { body, glint } in frame pixels: body is the silhouette as a shape test
// (for a glint band or a clip), glint the [x, y] of the shiny spot on the lit side.

import { ramp, mix } from './color.js';
import { ellipseIn, polyIn, rectIn, capsuleIn } from './surface.js';
import { placedIn, edgeIn } from './shapes.js';
import { leafIn } from './creature.js';
import { stripesIn } from './solids.js';
import { fract, PI } from './motion.js';

const TAU = 2 * PI;
const anyOf = (...tests) => (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; };
const without = (test, ...holes) => (px, py) => { for (const h of holes) if (h(px, py)) return false; return test(px, py); };

/** The fruit drawFruit can draw, in the order a choice control lists them: apple (round, a dimple at the stalk), pear (narrow top), berries (a cluster of five on one stalk), citrus (round, dotted peel). No arguments: a frozen list. */
export const FRUIT_KINDS = Object.freeze(['apple', 'pear', 'berries', 'citrus']);
/** The meals drawMeal can draw, in the order a choice control lists them: drumstick (a roast leg with a bone end), bread (a loaf with score marks), cheese (a wedge with holes), pie (round, crimped, with a vent). No arguments: a frozen list. */
export const MEAL_KINDS = Object.freeze(['drumstick', 'bread', 'cheese', 'pie']);
/** The sweets drawCandy can draw, in the order a choice control lists them: wrapped (in twisted paper), lollipop (a disc on a stick), donut (an iced ring), cupcake (frosting in a ridged cup). No arguments: a frozen list. */
export const CANDY_KINDS = Object.freeze(['wrapped', 'lollipop', 'donut', 'cupcake']);

// How far each kind reaches from its centre at scale 1, in whole pixels (outline not included), turned up to 0.12 radians either way: up, down, to the side.
const REACH = {
  fruit: { apple: [11, 8, 9], pear: [13, 8, 9], berries: [12, 8, 11], citrus: [12, 8, 9] },
  meal: { drumstick: [8, 12, 12], bread: [6, 6, 10], cheese: [9, 7, 10], pie: [6, 7, 10] },
  candy: { wrapped: [7, 7, 11], lollipop: [10, 11, 8], donut: [8, 8, 9], cupcake: [9, 9, 8] },
};

/**
 * How far a kind of food reaches from its centre at scale 1, so a pickup can keep its float and pop inside the frame: { up, down, side } in pixels, outline not included.
 * Arguments: family ('fruit', 'meal' or 'candy'); kind (one of FRUIT_KINDS, MEAL_KINDS or CANDY_KINDS).
 */
export function foodReach(family, kind) {
  const r = REACH[family]?.[kind];
  if (!r) throw new Error(`foodReach: unknown ${family} kind "${kind}"`);
  return { up: r[0], down: r[1], side: r[2] };
}

/**
 * Shape test for stripes that wind out from a centre in a spiral: the swirl on a lollipop, a snail shell, a hypnotic disc.
 * Arguments: cx, cy (centre); options { arms (how many stripes wind out, default 2), twist (radians each stripe turns per pixel out, default 0.35), duty (share that is stripe, default 0.5), phase (0..1 turns the swirl) }.
 */
export function swirlIn(cx, cy, { arms = 2, twist = 0.35, duty = 0.5, phase = 0 } = {}) {
  return (px, py) => {
    const dx = px - cx, dy = py - cy, r = Math.hypot(dx, dy);
    if (r < 0.75) return true;
    return fract(((Math.atan2(dy, dx) + twist * r) / TAU) * arms + phase) < duty;
  };
}

/**
 * Shape test for scattered sprinkles inside another shape: rows of short dashes, each row shifted half a step, every other one standing up (sprinkles, seeds, a dotted peel).
 * Arguments: inside (the shape test they are kept in); options { pitch (px from one sprinkle to the next along a row and between rows, default 4), dash (length of each in px, default 2; 1 gives dots), stand (true: every other sprinkle stands upright, default true), phase (px to slide them sideways) }.
 */
export function speckIn(inside, { pitch = 4, dash = 2, stand = true, phase = 0 } = {}) {
  const P = Math.max(2, Math.round(pitch)), D = Math.max(1, Math.min(P - 1, Math.round(dash))), half = Math.floor(P / 2);
  const mod = (v) => ((v % P) + P) % P;
  // which way the sprinkle starting on pixel (x, y) lies: 'h', 'v', or null when no sprinkle starts there
  const start = (x, y) => {
    if (mod(y)) return null;
    const row = Math.round(y / P), shift = row % 2 ? half : 0;
    if (mod(x - shift)) return null;
    return stand && (Math.round((x - shift) / P) + row) % 2 ? 'v' : 'h';
  };
  return (px, py) => {
    if (!inside(px, py)) return false;
    const x = Math.floor(px) - Math.round(phase), y = Math.floor(py);
    for (let i = 0; i < D; i++) if (start(x - i, y) === 'h' || start(x, y - i) === 'v') return true;
    return false;
  };
}

// place a test drawn at scale 1 around (0, 0): scale k, squash sx / sy, turn angle, centre (cx, cy)
const placer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (test) => placedIn(test, cx, cy, { angle, sx: k * sx, sy: k * sy });
// where a point at scale 1 lands in the frame (same transform as placer)
const pointer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (x, y) => {
  const c = Math.cos(angle), s = Math.sin(angle), X = x * k * sx, Y = y * k * sy;
  return [cx + X * c - Y * s, cy + X * s + Y * c];
};
const W = (g) => [0, 0, g.w, g.h];

// a bite out of the top right: the hole, and the bitten edge (paler: the inside of the food)
function biteOf(place, at) {
  const hole = place(ellipseIn(at[0], at[1], 2.6, 2.6));
  const rim = place(ellipseIn(at[0], at[1], 3.6, 3.6));
  return { hole, rim };
}

/**
 * Draw a piece of fruit face-on, its body centred on (cx, cy), with a stalk and an optional leaf; returns { body, glint }.
 * Arguments: g (the Surface); cx, cy (centre of the fruit); o: { kind (one of FRUIT_KINDS), k (scale, 1 is about 17 px across), sx, sy (squash), angle (turn, radians clockwise), lag (extra turn of the stalk and leaf, so they trail the body), colour (the fruit), stalk (colour), leaf (colour, or null for no leaf), shine (true: a glossy highlight band and a white spot), bare (true: leave small details out) }.
 */
export function drawFruit(g, cx, cy, o = {}) {
  const { kind = 'apple', colour = '#c9423a', stalk = '#7a4f33', leaf = null, shine = false, bare = false, lag = 0 } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o);
  const placeStalk = placer(cx, cy, { ...o, angle: (o.angle ?? 0) + lag });
  const C = ramp(colour), box = W(g);
  const big = (o.k ?? 1) * (o.sx ?? 1) >= 0.85;
  let body, top, glintAt;
  if (kind === 'pear') {
    body = place(anyOf(ellipseIn(0, 2.5, 6.8, 5.6), ellipseIn(0, -3.4, 3.8, 4), polyIn([[-3.8, -3.4], [3.8, -3.4], [6.4, 1.2], [-6.4, 1.2]])));
    top = -6.6; glintAt = [3.5, 0.5];
  } else if (kind === 'berries') {
    body = place(anyOf(...BERRIES.map(([x, y]) => ellipseIn(x, y, BERRY, BERRY))));
    top = -5.6; glintAt = [5.5, -4];
  } else if (kind === 'citrus') {
    body = place(ellipseIn(0, 0.5, 8.5, 7.8));
    top = -6.6; glintAt = [3.5, -3];
  } else {
    body = place(without(anyOf(ellipseIn(-2.5, 0.5, 6, 7), ellipseIn(2.5, 0.5, 6, 7)), ellipseIn(0, -6.9, 1.6, 1.3)));
    top = -5; glintAt = [3.5, -2.5];
  }
  // the stalk behind the top of the fruit, then the fruit, then the leaf in front
  const stalkLen = kind === 'citrus' ? 2.6 : 4.8;
  g.fill(...box, placeStalk(capsuleIn(0, top + 1, 0.6, top - stalkLen, 1)), ramp(stalk), { shade: 0 });
  if (kind === 'berries') {
    // each berry its own round, back ones first, parted by the deep tone
    for (const [x, y] of BERRIES) {
      g.fill(...box, place(ellipseIn(x, y, BERRY, BERRY)), C, { shade: 1, light: shine ? 1 : 0, outline: C.deep });
      if (!bare) { const [hx, hy] = at(x + 1, y - 1.2); g.dot(hx, hy, C.light); g.dot(hx - 1, hy, C.light); }
    }
  } else {
    g.fill(...box, body, C, { shade: big ? 2 : 1, light: shine ? 1 : 0 });
  }
  if (kind === 'citrus' && !bare) g.fill(...box, speckIn(place(ellipseIn(0, 0.5, 6.5, 5.8)), { pitch: 4, dash: 1, stand: false, phase: 1 }), C.dark);
  if (kind === 'apple' && !bare) g.fill(...box, edgeIn(place(ellipseIn(0, -6.9, 2.6, 2.2)), 0, 1), C.dark, { clip: body });
  if (leaf && !bare) {
    const [sx0, sy0] = [0.5, top - stalkLen * 0.55];
    g.fill(...box, placeStalk(leafIn(sx0, sy0, sx0 + 6.6, sy0 - 2, 4.4, { belly: 0.45, blunt: 0.25 })), ramp(leaf), { shade: 1 });
  }
  const glint = at(...glintAt);
  if (shine && !bare) { g.dot(glint[0], glint[1], '#ffffff'); g.dot(glint[0] + 1, glint[1], '#ffffff'); g.dot(glint[0], glint[1] + 1, '#ffffff'); }
  return { body, glint };
}
// the berries of a bunch, back row first: three across the top, two below
const BERRIES = [[0, -3.2], [-6, -2.2], [6, -2.2], [-3, 3.2], [3, 3.2]], BERRY = 3.3;

/**
 * Draw a hearty meal face-on, centred on (cx, cy): a roast leg, a loaf, a cheese wedge or a pie; returns { body, glint }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of MEAL_KINDS), k (scale, 1 is about 19 px across), sx, sy (squash), angle (turn, radians clockwise), colour (the food: meat, crust or cheese), bone (colour of the drumstick's bone), filling (colour seen through the pie's vent), bite (true: a round bite out of the top right), bare (true: leave small details out) }.
 */
export function drawMeal(g, cx, cy, o = {}) {
  const { kind = 'drumstick', colour = '#a06a3c', bone = '#f0ead8', filling = '#c9423a', bite = false, bare = false } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o), C = ramp(colour), box = W(g);
  // the cheese's bite is centred on its tall corner, so it takes the corner off whole and never leaves a loose piece above
  const bites = { drumstick: [1.4, -5.4], bread: [6.4, -3.4], cheese: [8.6, -5.2], pie: [6.4, -3] };
  const b = bite ? biteOf(place, bites[kind]) : null;
  const cut = (test) => (b ? without(test, b.hole) : test);
  const flesh = mix(C.light, '#f0ead8', 0.45);
  let body, glintAt = [3, -3];
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
    g.fill(...box, place(rectIn(7, -4, 3, 10)), mix(C.base, C.dark, 0.5), { clip: body, shade: 0 });
    if (!bare) for (const [x, y, r] of [[4.2, 2.6, 1.6], [5, -0.6, 1], [-1.4, 3.4, 1.1]]) g.fill(...box, place(ellipseIn(x, y, r, r)), C.deep, { clip: place(face) });
    glintAt = [5, -6];
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
      for (const x of [-3, 0, 3]) g.fill(...box, place(polyIn([[x - 1.2, -0.2], [x + 0.2, -0.2], [x + 1.2, -2.4], [x - 0.2, -2.4]])), filling, { clip: body });
    }
  } else {
    // the bone behind, then the meat over its near end
    const B = ramp(bone);
    const boneTest = place(anyOf(capsuleIn(1.5, 1.5, 7, 7, 1.5), ellipseIn(9, 6.6, 1.9, 1.9), ellipseIn(6.6, 9, 1.9, 1.9)));
    g.fill(...box, boneTest, B, { shade: 1 });
    body = cut(place(anyOf(ellipseIn(-3, -1.5, 7, 6), polyIn([[-4, 3.5], [1, -5], [5.5, 2.5], [3.6, 4.6]]))));
    g.fill(...box, body, C, { shade: 2, light: 1 });
    if (!bare) g.fill(...box, place(capsuleIn(-6.5, -3.6, -2, -5.4, 0.6)), C.light, { shade: 0, clip: body });
    glintAt = [-1, -4];
    body = anyOf(body, boneTest);
  }
  if (b && !bare) g.fill(...box, without(b.rim, b.hole), flesh, { clip: body });
  return { body, glint: at(...glintAt) };
}

/**
 * Draw a sweet face-on, centred on (cx, cy): in twisted paper, a lollipop, an iced ring donut or a cupcake, glossy, with an optional pattern; returns { body, glint }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of CANDY_KINDS), k (scale, 1 is about 20 px across), sx, sy (squash), angle (turn, radians clockwise), colour (the candy, the icing of a donut, the frosting of a cupcake), pattern ('plain', 'stripes' or 'dots'), icing (colour of the stripes or dots), stick (colour of a lollipop's stick and a cupcake's paper cup), dough (colour of a donut's dough), bare (true: leave small details out) }.
 */
export function drawCandy(g, cx, cy, o = {}) {
  const { kind = 'wrapped', colour = '#c9423a', pattern = 'plain', icing = '#f0ead8', stick = '#f0ead8', dough = '#a06a3c', bare = false } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o), C = ramp(colour), box = W(g);
  let body, deco, glintAt;
  const swirl = kind === 'lollipop';
  if (kind === 'lollipop') {
    g.fill(...box, place(rectIn(-1, 3, 2, 7.5)), ramp(stick), { shade: 1 });
    deco = place(ellipseIn(0, -3, 7.5, 7.5));
    body = deco;
    g.fill(...box, body, C, { shade: 2, light: 1 });
    glintAt = [3, -7];
  } else if (kind === 'donut') {
    const ring = without(ellipseIn(0, 0, 9.5, 7.5), ellipseIn(0, -0.8, 3, 2.2));
    body = place(ring);
    g.fill(...box, body, ramp(dough), { shade: 2 });
    // the icing covers the top of the ring, its lower edge a gentle wave
    const glaze = (px, py) => ring(px, py) && ellipseIn(0, -0.5, 8.8, 6.6)(px, py) && py < 3.4 + Math.sin(px * 1.3) * 0.9 && !ellipseIn(0, -0.8, 4, 3)(px, py);
    deco = place(glaze);
    g.fill(...box, deco, C, { shade: 0, light: 1 });
    glintAt = [5, -3.5];
  } else if (kind === 'cupcake') {
    const cup = place(polyIn([[-7, 1.5], [7, 1.5], [5.5, 9], [-5.5, 9]]));
    const S = ramp(stick);
    g.fill(...box, cup, S, { shade: 1 });
    if (!bare) g.fill(...box, (px, py) => cup(px, py) && Math.floor(px - cx) % 2 === 0, S.dark, { clip: place(rectIn(-7, 3, 14, 6)) });
    // piped frosting: three coils, each smaller and set back, parted by the deep tone, and a curl on top
    const coils = [ellipseIn(0, 0.6, 8, 2.8), ellipseIn(0, -2.4, 6.4, 2.6), ellipseIn(0, -5.2, 4.6, 2.4), ellipseIn(1.4, -7.6, 2, 1.6)];
    deco = place(anyOf(...coils));
    body = anyOf(deco, cup);
    coils.forEach((c, i) => {
      g.fill(...box, place(c), C, { shade: 1, light: 1 });
      if (i) g.fill(...box, place(c), C, { shade: 1, light: 1, outline: C.deep, clip: (px, py) => place(c)(px, py) || place(anyOf(...coils.slice(0, i)))(px, py) });
    });
    glintAt = [2, -6];
  } else {
    const core = ellipseIn(0, 0, 6.5, 5.5);
    const ends = anyOf(polyIn([[-5, -1.4], [-10.5, -5.5], [-9, 0], [-10.5, 5.5], [-5, 1.4]]), polyIn([[5, -1.4], [10.5, -5.5], [9, 0], [10.5, 5.5], [5, 1.4]]));
    g.fill(...box, place(ends), C, { shade: 1 });
    deco = place(core);
    body = anyOf(deco, place(ends));
    g.fill(...box, deco, C, { shade: 1, light: 1, outline: C.deep });
    glintAt = [2.5, -3];
  }
  if (!bare && pattern !== 'plain') {
    // the pattern stays a pixel inside the edge, so the shading still rounds it (the donut's thin glaze only at its sides)
    const inner = kind === 'donut' ? (px, py) => deco(px, py) && deco(px - 1, py) && deco(px + 1, py)
      : (px, py) => deco(px, py) && deco(px - 1, py) && deco(px + 1, py) && deco(px, py - 1) && deco(px, py + 1);
    const test = pattern === 'dots' ? speckIn(inner, { pitch: kind === 'lollipop' ? 4 : 3, dash: 2 })
      : swirl ? (px, py) => inner(px, py) && swirlIn(...at(0, -3), { arms: 3, twist: 0.32 })(px, py)
        : stripesIn(inner, { pitch: 4, slant: kind === 'wrapped' ? 1 : -1, duty: 0.5 });
    g.fill(...box, test, icing);
  }
  const glint = at(...glintAt);
  if (!bare) { g.dot(glint[0], glint[1], '#ffffff'); g.dot(glint[0] + 1, glint[1], '#ffffff'); }
  return { body, glint };
}
