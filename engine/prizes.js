// Prize helpers: rewards and bonuses drawn face-on at pickup size (docs/style-guide.md sections 1 and 14).
// Four families, three kinds each: money (a drawstring pouch, a knotted sack, a stack of coins),
// trophies (a two-handled cup on a plinth, a medal on a ribbon, a crown), scrolls (rolled and tied,
// open on two rods, a sealed letter) and timepieces (an hourglass, a stopwatch, an alarm clock).
// Every kind is described upright around (0, 0) in pixels at scale 1, then scaled, squashed and
// turned by placedIn (shapes.js), so a pickup can bob, rock and pop it. Pure drawing on a Surface:
// Node and browser, no Math.random. Colours are arguments; nothing here outlines (call g.outline(INK)
// once afterwards, as for any body).
//
//   import { PURSE_KINDS, prizeReach, drawPurse } from '../engine/prizes.js';
//   const r = prizeReach('purse', p.shape), k = lerp(0.8, 1.12, p.size);
//   const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: 17, up: r.up * k + 1, down: r.down * k + 1, side: r.side * k + 1 });
//   drawPurse(g, 16, at.y, { kind: p.shape, k, sx: at.sx, sy: at.sy, fullness: p.fullness, spill: p.spill, leather: p.body, metal: p.metal, rope: p.accent, t });
//   g.outline(INK);
//
// Each draw function returns { body, glint } in frame pixels: body is the silhouette as a shape test
// (for a glint band or a clip), glint the [x, y] of the shiny spot on the lit side.

import { ramp, tone, mix } from './color.js';
import { ellipseIn, polyIn, rectIn, capsuleIn } from './surface.js';
import { placedIn, insetIn, ringIn, anyIn, allIn } from './shapes.js';
import { drawToken } from './gadgets.js';
import { markIn } from './marks.js';
import { fract, PI, TAU } from './motion.js';

/** The money drawPurse can draw, in the order a choice control lists them: pouch (a drawstring purse with a frilled neck), sack (a knotted cloth sack), stack (coins piled up, leaning a pixel each way). No arguments: a frozen list. */
export const PURSE_KINDS = Object.freeze(['pouch', 'sack', 'stack']);
/** The prizes drawTrophy can draw, in the order a choice control lists them: cup (two handles, on a plinth), medal (a disc on a ribbon, turning like a coin), crown (a band with three points). No arguments: a frozen list. */
export const TROPHY_KINDS = Object.freeze(['cup', 'medal', 'crown']);
/** The scrolls drawScroll can draw, in the order a choice control lists them: rolled (tied with a ribbon), open (a sheet between two rods, with wavy lines), letter (folded, with a flap). No arguments: a frozen list. */
export const SCROLL_KINDS = Object.freeze(['rolled', 'open', 'letter']);
/** The timepieces drawTimer can draw, in the order a choice control lists them: hourglass (sand running through a glass in a frame), stopwatch (a crown button on top), clock (an alarm clock with two bells and feet). No arguments: a frozen list. */
export const TIMER_KINDS = Object.freeze(['hourglass', 'stopwatch', 'clock']);

// How far each kind reaches from its centre at scale 1, in whole pixels (outline not included), at its biggest setting and turned up to 0.12 radians either way: up, down, to the side.
const REACH = {
  purse: { pouch: [9, 13, 13], sack: [10, 13, 13], stack: [10, 13, 12] },
  trophy: { cup: [11, 10, 11], medal: [11, 10, 8], crown: [11, 9, 10] },
  scroll: { rolled: [8, 9, 11], open: [11, 11, 12], letter: [7, 7, 10] },
  timer: { hourglass: [11, 11, 8], stopwatch: [11, 9, 8], clock: [10, 11, 9] },
};

/**
 * How far a kind of prize reaches from its centre at scale 1, so a pickup can keep its float and pop inside the frame: { up, down, side } in pixels, outline not included, at its biggest setting.
 * Arguments: family ('purse', 'trophy', 'scroll' or 'timer'); kind (one of PURSE_KINDS, TROPHY_KINDS, SCROLL_KINDS or TIMER_KINDS).
 */
export function prizeReach(family, kind) {
  const r = REACH[family]?.[kind];
  if (!r) throw new Error(`prizeReach: unknown ${family} kind "${kind}"`);
  return { up: r[0], down: r[1], side: r[2] };
}

// place a test drawn at scale 1 around (0, 0): scale k, squash sx / sy, turn angle, centre (cx, cy)
const placer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (test) => placedIn(test, cx, cy, { angle, sx: k * sx, sy: k * sy });
// where a point at scale 1 lands in the frame (same transform as placer)
const pointer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (x, y) => {
  const c = Math.cos(angle), s = Math.sin(angle), X = x * k * sx, Y = y * k * sy;
  return [cx + X * c - Y * s, cy + X * s + Y * c];
};
const W = (g) => [0, 0, g.w, g.h];
const ROLL_TILT = -0.62;                          // the slant a rolled scroll lies at, low end left (about 35 degrees)
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// a white glint pixel or two, seen while the phase u is near 0 (once per loop)
const flashAt = (u, width = 0.14) => Math.abs(fract(u + 0.5) - 0.5) < width;

// a coin lying flat, seen from the front and a little above: its top face over its edge
function flatCoin(g, place, x, y, rx, M) {
  g.fill(...W(g), place(anyIn(ellipseIn(x, y + 1.2, rx, 1.6), rectIn(x - rx, y, 2 * rx, 1.2))), M.dark, { shade: 0 });
  g.fill(...W(g), place(ellipseIn(x, y, rx, 1.6)), M, { shade: 0, light: 1 });
}

/**
 * Draw a bag or pile of money face-on, centred on (cx, cy): a drawstring pouch, a knotted sack or a stack of coins; returns { body, glint }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of PURSE_KINDS), k (scale, 1 is about 18 px tall), sx, sy (squash), angle (turn, radians clockwise), fullness (0 lean to 1 bulging: how round the bag, how many coins in the stack), spill (true: three loose coins beside it, each catching a glint in turn), leather (colour of the bag), metal (colour of the coins and of the coin charm on a bag's cord), rope (colour of the cord), t (loop phase 0..1 for the glints and the turning charm; null: no glints, charm face-on), bare (true: leave small details out) }.
 */
export function drawPurse(g, cx, cy, o = {}) {
  const { kind = 'pouch', fullness = 0.5, spill = false, leather = '#a06a3c', metal = '#f2c230', rope = '#c9423a', t = null, bare = false } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o), box = W(g);
  const k = (o.k ?? 1), S = { x: k * (o.sx ?? 1), y: k * (o.sy ?? 1) };
  const M = ramp(metal), L = ramp(leather), R = ramp(rope), f = clamp01(fullness);
  const shine = (i) => t != null && !bare && flashAt(t - i / 3);
  const coins = [];                                        // [x, y] of every coin face that can catch a glint
  // a frame point back in the scale-1 drawing (the inverse of at), so bands can follow rows of the drawing
  const rowOf = (px, py) => { const a = o.angle ?? 0, c = Math.cos(a), s = Math.sin(a), dx = px - cx, dy = py - cy; return [(dx * c + dy * s) / S.x, (dy * c - dx * s) / S.y]; };
  // the loose coins: one standing on its edge at the left (behind), two lying flat in front
  const where = kind === 'stack' ? { up: [-8.4, 5.6], a: [7.6, 8.8], b: [-4, 10] } : { up: [-8.2, 5.4], a: [-4.4, 9.6], b: [-9.4, 9.2] };
  const looseBehind = () => {
    if (!spill) return;
    const [sx0, sy0] = at(...where.up);
    drawToken(g, ellipseIn(0, 0, 3, 3), sx0, sy0, metal, { turn: 0.55, thick: 1.5, rim: 0, sx: S.x, sy: S.y });
    coins.push([where.up[0] + 0.5, where.up[1] - 1.5]);
  };
  const looseFront = () => {
    if (!spill) return;
    flatCoin(g, place, ...where.a, 3.2, M);
    flatCoin(g, place, ...where.b, 2.8, M);
    coins.push([where.a[0] + 1, where.a[1] - 0.6], [where.b[0] + 1, where.b[1] - 0.6]);
  };
  let body, glintAt;
  if (kind === 'stack') {
    const n = Math.round(lerp(3, 6, f)), lean = [0, 1, 0, -1, 0, 1, 0, -1];
    looseBehind();
    const parts = [];
    const RX = 6.5;
    for (let i = 0; i < n; i++) {
      // each coin seen edge-on: three rows, its lit rim on top, then the edge, then the shadow under it
      const x = lean[i], y = 9.5 - 3 * i;
      const coin = capsuleIn(x - RX + 1.5, y, x + RX - 1.5, y, 1.5);
      parts.push(coin);
      const row = (dy) => allIn(place(coin), (px, py) => { const [, ry] = rowOf(px, py); return ry >= y + dy - 0.5 && ry < y + dy + 0.5; });
      g.fill(...box, row(-1), M.light, { shade: 0 });
      g.fill(...box, row(0), M.base, { shade: 0 });
      g.fill(...box, row(1), M.dark, { shade: 0 });
    }
    // the top coin lies face up: a raised rim round a sunken field
    const tx = lean[n - 1], ty = 9.5 - 3 * (n - 1) - 2.2;
    const top = ellipseIn(tx, ty, RX, 2.2);
    parts.push(top);
    g.fill(...box, place(top), M, { shade: 0, light: 1 });
    if (!bare) g.fill(...box, place(ellipseIn(tx - 0.4, ty + 0.3, RX - 2.2, 0.9)), M.dark, { shade: 0 });
    coins.push([tx + 3.5, ty - 0.8]);
    looseFront();
    body = place(anyIn(parts));
    glintAt = [tx + 4, ty];
  } else {
    const sack = kind === 'sack';
    const rx = sack ? lerp(7, 9.4, f) : lerp(6, 8.6, f), ry = sack ? lerp(5.6, 7.2, f) : lerp(5, 6.6, f);
    const by = 8.5, bcy = by - ry;
    let top, bag;
    if (sack) {
      // a squat cloth bag with a flattish foot, gathered at a neck and knotted, two cloth tips standing up
      bag = anyIn(allIn(ellipseIn(0, bcy + 0.6, rx, ry + 0.4), (px, py) => py < by), polyIn([[-2.2, -3.4], [2.2, -3.4], [rx * 0.62, bcy - ry * 0.45], [-rx * 0.62, bcy - ry * 0.45]]));
      top = anyIn(ellipseIn(0, -4.8, 2.8, 2.2), polyIn([[-2.4, -4], [-6.2, -7.4], [-5.2, -9.2], [-2.4, -8.4], [0.6, -5.6]]), polyIn([[2.2, -4.2], [4.6, -9.6], [6.6, -8.6], [6.2, -6.4], [-0.4, -5.4]]));
      glintAt = [rx * 0.45, bcy - ry * 0.35];
    } else {
      // a round purse narrowing to a tied neck, with a frill of leather standing above the tie
      bag = anyIn(ellipseIn(0, bcy, rx, ry), polyIn([[-2.4, -3.6], [2.4, -3.6], [rx * 0.66, bcy - ry * 0.5], [-rx * 0.66, bcy - ry * 0.5]]));
      top = polyIn([[-2, -3.5], [2, -3.5], [5.2, -8.6], [2.6, -7.4], [0.2, -9.4], [-2.4, -7.4], [-5.2, -8.6]]);
      glintAt = [rx * 0.5, bcy - ry * 0.4];
    }
    // the cord: a band round the neck and a loose end hanging to the right with a coin tied to it
    const band = capsuleIn(-3.2, -3.2, 3.2, -3.2, 1.2), tail = capsuleIn(2.8, -2.4, 7.2, 1, 0.6);
    const charm = [7.6, 3.4];
    looseBehind();
    g.fill(...box, place(top), L, { shade: 1 });
    if (!bare) g.fill(...box, place(sack ? ellipseIn(0, -4.6, 1.4, 1) : ellipseIn(0, -5.2, 1.6, 1)), L.dark, { shade: 0 });   // the mouth's shadow / the knot's fold
    g.fill(...box, place(bag), L, { shade: rx >= 7 ? 2 : 1 });
    if (!bare) {
      // fold lines from the neck, and on the sack a patch sewn on in a lighter tone
      g.fill(...box, place(capsuleIn(-1.2, -1.6, -3.6, bcy + ry * 0.55, 0.45)), L.dark, { shade: 0, clip: place(insetIn(bag, 1)) });
      if (sack) g.fill(...box, place(rectIn(-5.5, bcy + 0.5, 4, 3.5)), L.light, { shade: 0, outline: L.dark, clip: place(insetIn(bag, 1)) });
    }
    g.fill(...box, place(band), R, { shade: 1 });
    g.fill(...box, place(tail), R, { shade: 0 });
    const [qx, qy] = at(...charm);
    const T = drawToken(g, ellipseIn(0, 0, 2.6, 2.6), qx, qy, metal, { turn: t == null ? 0 : PI * t, thick: 1.5, rim: 0, sx: S.x, sy: S.y });
    if (!bare && T.squeeze > 0.6 && t != null) g.dot(...at(charm[0] + 0.6, charm[1] - 1.2), M.light);
    looseFront();
    body = place(anyIn(bag, top, band));
  }
  // the coins catch the glint one after another
  coins.forEach(([x, y], i) => { if (shine(i)) { const [px, py] = at(x, y); g.dot(px, py, '#ffffff'); g.dot(px - 1, py, '#ffffff'); } });
  return { body, glint: at(...glintAt) };
}

/**
 * Draw a prize face-on, centred on (cx, cy): a two-handled cup on a plinth, a medal on a short ribbon, or a crown, with an optional picture mark on its face; returns { body, shiny, glint } (shiny: the metal alone, for a glint band).
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of TROPHY_KINDS), k (scale, 1 is about 19 px tall), sx, sy (squash), metal (colour of the cup, medal or crown), ribbon (colour of the medal's ribbon), base (colour of the cup's plinth), emblem (a mark from engine/marks.js MARKS, such as 'star', 'sun' or 'diamond', or null), turn (radians the medal has turned about its upright axis, 0 face-on), bare (true: leave small details out) }.
 */
export function drawTrophy(g, cx, cy, o = {}) {
  const { kind = 'cup', metal = '#f2c230', ribbon = '#3f6fd1', base = '#5d6475', emblem = null, turn = 0, bare = false } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o), box = W(g);
  const k = (o.k ?? 1), S = { x: k * (o.sx ?? 1), y: k * (o.sy ?? 1) };
  const M = ramp(metal), engraved = M.dark;
  const size = k * Math.min(o.sx ?? 1, o.sy ?? 1) >= 1.05 ? 7 : 5;
  let shiny;
  const mark = (x, y) => {
    if (!emblem || bare) return;
    const [px, py] = at(x, y);
    g.fill(...box, markIn(emblem, Math.floor(px), Math.floor(py), size), engraved);
  };
  let body, glintAt;
  if (kind === 'medal') {
    // two straps of ribbon from above meeting at a clasp, and the medal hanging from it
    const straps = anyIn(polyIn([[-6.4, -10.4], [-2.4, -10.4], [1.4, -3.2], [-1.6, -3.2]]), polyIn([[2.4, -10.4], [6.4, -10.4], [1.6, -3.2], [-1.4, -3.2]]));
    const Rb = ramp(ribbon);
    g.fill(...box, place(straps), Rb, { shade: 1 });
    if (!bare) g.fill(...box, place(allIn(straps, (px, py) => Math.abs(px) < 0.9 + (py + 10.4) * 0.06 && py > -6)), Rb.dark, { shade: 0 });   // where the straps cross
    const clasp = rectIn(-2.2, -4.2, 4.4, 2);
    g.fill(...box, place(clasp), M, { shade: 1, light: 1 });
    const [mx, my] = at(0, 3.6);
    const T = drawToken(g, ellipseIn(0, 0, 6.6, 6.6), mx, my, metal, { turn, thick: 2, rim: 1, sx: S.x, sy: S.y });
    if (emblem && !bare && T.squeeze > 0.35) g.fill(...box, T.on(markIn(emblem, 0, 0, size)), engraved);
    body = anyIn(place(straps), place(clasp), T.body);
    shiny = anyIn(place(clasp), T.body);
    glintAt = [3, 0];
  } else if (kind === 'crown') {
    const band = rectIn(-8.5, 0.6, 17, 7);
    const points = polyIn([[-8.5, 1], [-8.5, -6.2], [-4.4, -1.4], [0, -8.4], [4.4, -1.4], [8.5, -6.2], [8.5, 1]]);
    const balls = anyIn(ellipseIn(-8, -6.6, 1.6, 1.6), ellipseIn(0, -9, 1.6, 1.6), ellipseIn(8, -6.6, 1.6, 1.6));
    body = place(anyIn(band, points, balls));
    g.fill(...box, body, M, { shade: 2, light: 1 });
    if (!bare) {
      // a raised rim along the top and the foot of the band
      g.fill(...box, place(anyIn(rectIn(-8.5, 0.6, 17, 1), rectIn(-8.5, 6.6, 17, 1))), M.light, { shade: 0 });
      g.fill(...box, place(balls), M, { shade: 1, light: 1 });
    }
    mark(0, 3.9);
    shiny = body;
    glintAt = [5, 2];
  } else {
    const bowl = anyIn(allIn(ellipseIn(0, -7.2, 6.4, 6), (px, py) => py > -9.6), rectIn(-6.8, -10.6, 13.6, 1.6));
    const handles = anyIn(allIn(ringIn(-6.4, -6.4, 3.4, 1.5), (px) => px < -5.2), allIn(ringIn(6.4, -6.4, 3.4, 1.5), (px) => px > 5.2));
    const stem = anyIn(rectIn(-1, -1.6, 2, 3.2), ellipseIn(0, 0, 1.8, 1), polyIn([[-1.8, 1.4], [1.8, 1.4], [4.4, 3.6], [-4.4, 3.6]]));
    const plinth = rectIn(-5.6, 3.6, 11.2, 5.6);
    const B = ramp(base);
    g.fill(...box, place(plinth), { base: B.base, light: B.light, dark: B.dark }, { shade: 1, light: 1 });
    if (!bare) g.fill(...box, place(rectIn(-2.6, 5.4, 5.2, 2)), M.base, { shade: 0 });   // the name plate, left blank
    g.fill(...box, place(handles), M, { shade: 1, light: 1 });
    g.fill(...box, place(stem), M, { shade: 1, light: 1 });
    g.fill(...box, place(bowl), M, { shade: 2, light: 1 });
    if (!bare) g.fill(...box, place(rectIn(-6.8, -9.2, 13.6, 1)), M.dark, { shade: 0, clip: place(bowl) });   // under the lip
    mark(0, -5.4);
    body = place(anyIn(bowl, handles, stem, plinth));
    shiny = place(anyIn(bowl, handles, stem));
    glintAt = [3.5, -7];
  }
  return { body, shiny, glint: at(...glintAt) };
}

/**
 * Draw a scroll face-on, centred on (cx, cy): rolled and tied with a ribbon, open between two rods with wavy lines of writing (never letters), or a folded letter; returns { body, glint }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of SCROLL_KINDS), k (scale, 1 is about 20 px across), sx, sy (squash), angle (turn, radians clockwise), paper (colour), ribbon (colour of the ribbon and the wax seal), rods (colour of the rods and their knobs), seal (true: a round wax seal 5 px across), bare (true: leave small details out) }.
 */
export function drawScroll(g, cx, cy, o = {}) {
  const { kind = 'rolled', paper = '#f0ead8', ribbon = '#c9423a', rods = '#a06a3c', seal = false, bare = false } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o), box = W(g);
  const Pp = ramp(paper), Rb = ramp(ribbon), Rd = ramp(rods);
  const ink = tone(paper, -1.5);
  const wax = (x, y) => {
    g.fill(...box, place(ellipseIn(x, y, 2.6, 2.6)), Rb, { shade: 1, light: 1 });
    if (!bare) g.fill(...box, place(ellipseIn(x - 0.2, y + 0.2, 1, 1)), Rb.dark, { shade: 0 });
  };
  let body, glintAt;
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
      g.fill(...box, place(lines), ink, { clip: place(sheet) });
    }
    for (const y of [-8.4, 8.4]) g.fill(...box, place(roll(y)), Pp, { shade: 1, light: 1 });
    if (seal) wax(3.6, 4);
    body = place(anyIn(sheet, roll(-8.4), roll(8.4), knobs(-8.4), knobs(8.4)));
    glintAt = [4, -9];
  } else if (kind === 'letter') {
    const sheet = rectIn(-9.4, -6.2, 18.8, 12.4);
    const flap = polyIn([[-9.4, -6.2], [9.4, -6.2], [0, 1.6]]);
    g.fill(...box, place(sheet), Pp, { shade: 1 });
    if (!bare) {
      // the folds of the back: two lines from the lower corners
      g.fill(...box, place(anyIn(capsuleIn(-8.6, 5.2, -2, 0.4, 0.45), capsuleIn(8.6, 5.2, 2, 0.4, 0.45))), Pp.dark, { shade: 0 });
    }
    g.fill(...box, place(flap), { base: Pp.light, light: '#ffffff', dark: Pp.base }, { shade: 0, outline: Pp.dark, clip: place(sheet) });
    if (seal) wax(0, 1.4);
    body = place(sheet);
    glintAt = [6, -5];
  } else {
    // rolled: a tube of paper lying at a slant (low end left), its curled left end showing, rod knobs at both
    // ends, a ribbon round its middle with two short tails, and the seal on the paper to the right of it
    const lay = placer(cx, cy, { ...o, angle: (o.angle ?? 0) + ROLL_TILT }), pt = pointer(cx, cy, { ...o, angle: (o.angle ?? 0) + ROLL_TILT });
    const tube = anyIn(rectIn(-7.6, -4, 15.2, 8), ellipseIn(7.6, 0, 1.4, 4));
    const end = ellipseIn(-7.6, 0, 1.6, 4);
    const knobs = anyIn(ellipseIn(-10.2, 0, 1.4, 1.7), ellipseIn(10.2, 0, 1.4, 1.7));
    const band = rectIn(-3.2, -4.5, 2.8, 9);
    const tails = anyIn(polyIn([[-2.6, 4], [-1.2, 4], [-0.4, 7.6], [-1.8, 7.8]]), polyIn([[-2.6, 4], [-1.4, 4], [-3.6, 7.6], [-4.8, 7.2]]));
    g.fill(...box, lay(knobs), Rd, { shade: 1 });
    g.fill(...box, lay(tube), Pp, { shade: 1, light: 1 });
    g.fill(...box, lay(end), Pp.light, { shade: 0 });
    if (!bare) g.fill(...box, lay(allIn(ringIn(-7.6, 0.3, 2.4, 1), ellipseIn(-7.6, 0, 1.2, 2.8))), Pp.dark, { shade: 0 });   // the curl of the roll
    g.fill(...box, lay(tails), Rb, { shade: 1 });
    g.fill(...box, lay(band), Rb, { shade: 1, light: 1 });
    if (seal) {
      g.fill(...box, lay(ellipseIn(3.8, 0.2, 2.6, 2.6)), Rb, { shade: 1, light: 1 });
      if (!bare) g.fill(...box, lay(ellipseIn(3.6, 0.4, 1, 1)), Rb.dark, { shade: 0 });
    }
    body = lay(anyIn(tube, end, knobs, band, tails));
    body.glintAt = pt(4, -3);
    glintAt = null;
  }
  return { body, glint: glintAt ? at(...glintAt) : body.glintAt };
}

/**
 * Draw a timepiece face-on, centred on (cx, cy): an hourglass with sand running through its neck, a stopwatch or an alarm clock whose hand jumps once round per loop; returns { body, glint }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of TIMER_KINDS), k (scale, 1 is about 20 px tall), sx, sy (squash), frame (colour of the frame or the case), sand (colour of the sand), level (0 little sand left in the top bulb to 1 a full top bulb), glass (colour of the glass), face (colour of a clock face), hand (colour of the hands and ticks), t (loop phase 0..1: falling grains, and the hand's place, one eighth of a turn per frame of an 8-frame loop), bare (true: leave small details out) }.
 */
export function drawTimer(g, cx, cy, o = {}) {
  const { kind = 'hourglass', frame = '#a06a3c', sand = '#e6c96a', level = 0.5, glass = '#8fd0f0', face = '#f0ead8', hand = '#231b33', t = 0, bare = false } = o;
  const place = placer(cx, cy, o), at = pointer(cx, cy, o), box = W(g);
  const F = ramp(frame), Sd = ramp(sand), G = ramp(glass), Fc = ramp(face);
  let body, glintAt;
  if (kind === 'hourglass') {
    const caps = anyIn(rectIn(-7.2, -10.6, 14.4, 2.6), rectIn(-7.2, 8, 14.4, 2.6));
    const posts = anyIn(rectIn(-6.6, -8, 1.6, 16), rectIn(5, -8, 1.6, 16));
    const top = ellipseIn(0, -4.2, 4.4, 4), bottom = ellipseIn(0, 4.2, 4.4, 4), neck = rectIn(-0.9, -1.4, 1.8, 2.8);
    const bulbs = anyIn(top, bottom, neck);
    const u = clamp01(level);
    g.fill(...box, place(posts), F, { shade: 1 });
    g.fill(...box, place(bulbs), G, { shade: 1, light: 1 });
    // the sand left in the top bulb, sinking to a funnel in the middle
    const surf = lerp(-1.8, -7.2, u);
    // sand is rimmed with its own dark tone where it meets the glass, so it shows whatever the two colours
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
    if (!bare) g.fill(...box, place(anyIn(rectIn(2.2, -6.6, 1, 2.4), rectIn(2.2, 2.2, 1, 2))), '#ffffff', { clip: place(insetIn(bulbs, 1)) });   // light on the glass
    body = place(anyIn(caps, posts, bulbs));
    glintAt = [3, -6];
  } else {
    const clock = kind === 'clock', r = clock ? 7.6 : 8, oy = 1.4;
    const parts = [];
    if (clock) {
      // two bells, each turned out a little, a hammer between them, and two feet
      const bells = anyIn(placedIn(allIn(ellipseIn(0, 0, 3.4, 3), (px, py) => py < 0.9), -5.2, -6.2, { angle: -0.5 }), placedIn(allIn(ellipseIn(0, 0, 3.4, 3), (px, py) => py < 0.9), 5.2, -6.2, { angle: 0.5 }));
      const hammer = anyIn(rectIn(-0.6, -9.4, 1.2, 3.2), ellipseIn(0, -9.4, 1.2, 1));
      const feet = anyIn(capsuleIn(-4.4, 7.4, -5.8, 9.8, 1), capsuleIn(4.4, 7.4, 5.8, 9.8, 1));
      g.fill(...box, place(anyIn(hammer, feet)), F, { shade: 1 });
      g.fill(...box, place(bells), F, { shade: 1, light: 1 });
      parts.push(bells, hammer, feet);
    } else {
      // a crown button on a short stem, and a small pusher at the top right
      const crown = anyIn(rectIn(-1, -8.6, 2, 2.6), rectIn(-2.6, -10.8, 5.2, 2.4));
      const pusher = capsuleIn(4.6, -5.2, 6.4, -7, 1);
      g.fill(...box, place(anyIn(crown, pusher)), F, { shade: 1, light: 1 });
      parts.push(crown, pusher);
    }
    const kase = ellipseIn(0, oy, r, r), dial = ellipseIn(0, oy, r - 1.8, r - 1.8);
    g.fill(...box, place(kase), F, { shade: 2, light: 1 });
    g.fill(...box, place(dial), Fc, { shade: 1 });
    if (!bare) {
      // four ticks, a short hand that stays, and a long hand that jumps an eighth of a turn each frame
      const R = r - 2.8;
      g.fill(...box, place(anyIn([0, 1, 2, 3].map((q) => rectIn(Math.round(Math.sin(q * PI / 2) * R) - 0.5, oy + Math.round(-Math.cos(q * PI / 2) * R) - 0.5, 1, 1)))), Fc.dark, { shade: 0 });
      if (clock) g.fill(...box, place(capsuleIn(0, oy, -2.6, oy - 1.6, 0.55)), hand, { shade: 0 });
      const a = TAU * Math.floor(fract(t) * 8) / 8, L = r - 3;
      g.fill(...box, place(capsuleIn(0, oy, Math.sin(a) * L, oy - Math.cos(a) * L, 0.55)), hand, { shade: 0 });
      g.fill(...box, place(rectIn(-0.5, oy - 0.5, 1, 1)), hand, { shade: 0 });
    }
    body = place(anyIn(kase, ...parts));
    glintAt = [r * 0.5, oy - r * 0.6];
  }
  return { body, glint: at(...glintAt) };
}
