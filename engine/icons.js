// Icon helper: how an icon set is laid out, tilted, sized and shaded, and the item shapes icon
// sets share (docs/style-guide.md sections 8 and 14). Pure drawing on a Surface: runs in Node and
// in the browser. Other makers add shapes here: APPEND at the end, never change what is above.
//
//   import { ICON_SIZE, ICON_PIVOT, ICON_LEAN, iconClips, iconFit, iconPaint, iconBottle, iconFlame } from '../engine/icons.js';
//
//   clips: iconClips(['potion', 'key', ['mana-flask', 'Mana flask']]),     // one 1-frame clip per icon
//   render(g, { clip, p }) {
//     iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: ICON_LEAN }, (s, pen) => {
//       iconBottle(s, pen, { shape: 'round', glass: P.cream, liquid: p.body, cork: P.wood });   // everything with an ink line
//       s.outline(INK);                                                      // once, after the whole body
//       iconFlame(s, pen, 0, -9, { colours: [P.thunder, P.fire] });          // light goes on after the outline
//     });
//   }
//
// iconFit(g, options, draw) is how a set stays even: it scales the icon until its longer side is
// what the Size slider asks for (20 to 26 px, the style guide's icon size), whatever the shape and
// whether it leans or not, and centres it in the frame. iconPen makes a pen by hand (a fixed scale)
// for the rare icon that must not be fitted.
//
// HOW AN ICON IS DRAWN. A shape is described UPRIGHT in its own space: (0, 0) is the middle of the
// icon, x grows to the right, y grows DOWN, and one unit is about one pixel. A long thing stands on
// end: handle at the bottom, point at the top. The pen then turns it clockwise (so the handle ends
// bottom left and the point top right, the way every icon in every set leans), scales it and puts it
// in the middle of the 32x32 frame. Nothing is rotated as a bitmap: the pen turns the SHAPE TESTS
// (placedIn of shapes.js), and every pixel is still sampled at its centre with a hard edge, so light
// keeps coming from the top right of the screen whatever the lean.
//
// TWO LEANS, both chosen because their edges are clean pixel stairs:
//   ICON_LEAN      atan(1/2), 26.6 degrees: edges step 2 along, 1 up. Bottles, bags, things that stand.
//   ICON_DIAGONAL  45 degrees: edges step 1 and 1. Keys, blades, wands: long things that lie.
// A thing that lies flat when upright (a loaf, a rolled map) takes a NEGATIVE angle, so it still
// rises to the top right. A thing that would look as if it were falling over (a tent, a lit candle)
// takes half of ICON_LEAN.
//
// THE STYLE CONTROLS of an icon set are carried by the pen, so every shape obeys them alike:
//   size   0..1  Small to Big: with iconFit the longer side goes 20 to 26 px; a pen made by hand scales 0.87 to 1.13
//   tilt   on: leaning; off: upright
//   shade  on: a second, softer shadow tone inside the 1 px dark band (rounder, one more colour)
//   shine  on: the highlight band on the lit side, and white glints on glass, metal and gems
//
// Shapes paint bodies only. The sprite calls outline(INK) once, then adds light (iconFlame, fx.js
// twinkle) that must stay without an ink line. Shapes that end in a light return where it goes
// (iconCandle returns `wick`, iconBomb returns `fuse`): local points for iconFlame / pen.pt.
// The outlines of bottles, gems, rings and hearts are the shape tests of shapes.js (bottleIn,
// gemIn, gemFacets, ringIn, heartIn): this file paints them through the pen, it does not redraw them.

import { Surface, ellipseIn, capsuleIn, polyIn, rectIn } from './surface.js';
import { ramp, tone, mix, col, INK } from './color.js';
import { placedIn, ringIn, heartIn, gemIn, gemFacets, bottleIn, GEM_CUTS, BOTTLE_SHAPES } from './shapes.js';

/** The frame of an icon: 32x32 (docs/style-guide.md section 1). No arguments: a frozen pair [w, h]. */
export const ICON_SIZE = Object.freeze([32, 32]);
/** The pivot of an icon: the frame centre. No arguments: a frozen pair [x, y]. */
export const ICON_PIVOT = Object.freeze([16, 16]);
/** The lean of things that stand (bottles, bags, lamps): atan(1/2), so straight edges step two pixels along and one up. No arguments: radians. */
export const ICON_LEAN = Math.atan(0.5);
/** The lean of long things that lie (keys, blades, wands): 45 degrees, so straight edges step one and one. No arguments: radians. */
export const ICON_DIAGONAL = Math.PI / 4;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const boxIn = (x0, y0, x1, y1) => rectIn(x0, y0, x1 - x0, y1 - y0);

/**
 * Clip entries for an icon set: one clip of one frame per icon, in the order given.
 * Arguments: names: a list of clip names, or [name, label] pairs where the button text differs from the name.
 */
export function iconClips(names) {
  return Object.fromEntries(names.map((n) => (Array.isArray(n) ? [n[0], { frames: 1, fps: 1, loop: true, label: n[1] }] : [n, { frames: 1, fps: 1, loop: true }])));
}

/**
 * The placement and style of one icon: turns shapes written upright around (0, 0) into the leaning, scaled icon in the middle of its frame.
 * Arguments: options { size (0..1, Small to Big), tilt (true: leaning), angle (the lean in radians, clockwise; default ICON_LEAN),
 * scale (extra scale for this icon, default 1), shade (second shadow tone), shine (highlights and glints), cx, cy (the frame centre, default 16, 16),
 * span ([smallest, biggest] scale of the Size slider, default [0.87, 1.13]) }.
 * Returns { at(test) -> the shape test in frame pixels, pt(x, y) -> [frame x, frame y], k (the scale), angle, shade, shine, cx, cy }.
 */
export function iconPen(o = {}) {
  const { size = 0.5, tilt = true, angle = ICON_LEAN, scale = 1, shade = true, shine = true, cx = 16, cy = 16, span = [0.87, 1.13] } = o;
  const a = tilt ? angle : 0, k = scale * (span[0] + (span[1] - span[0]) * clamp01(size));
  const c = Math.cos(a), s = Math.sin(a);
  return {
    k, angle: a, shade: !!shade, shine: !!shine, cx, cy,
    pt: (x, y) => [cx + k * (x * c - y * s), cy + k * (x * s + y * c)],
    at: (test) => placedIn(test, cx, cy, { angle: a, sx: k }),
  };
}

/**
 * Paint shape tests written in an icon's own upright space as ONE body through the pen, with the icon shading: a 1 px dark band away from the light, a softer second tone inside it when the pen's shade is on, a highlight band when its shine is on.
 * Arguments: g: the Surface; pen: from iconPen; tests: a shape test or a list (ellipseIn, capsuleIn, polyIn, rectIn, in local units); paint: a colour or a ramp;
 * options { minus (tests cut out), clip (a local test: paint only where it holds; the shading still follows the whole body), flat (true: one colour),
 * soft (width in px of the second tone, default 2; 0 for none), light (width of the highlight band, default 1; 0 for none), rim (a colour: a 1 px line round this body, drawn first, to part it from what is under it) }.
 */
export function iconPaint(g, pen, tests, paint, opt = {}) {
  const list = [].concat(tests).map(pen.at), minus = [].concat(opt.minus ?? []).map(pen.at), clip = opt.clip ? pen.at(opt.clip) : null;
  const inside = (px, py) => {
    for (const m of minus) if (m(px, py)) return false;
    for (const f of list) if (f(px, py)) return true;
    return false;
  };
  const r = typeof paint === 'string' ? ramp(paint) : paint;
  const base = col(r.base), dark = col(r.dark ?? r.base), lite = col(r.light ?? r.base), mid = col(r.mid ?? mix(r.base, r.dark ?? r.base, 0.5));
  const [sx, sy] = g.shadow;
  const soft = opt.flat || !pen.shade ? 0 : opt.soft ?? 2, hi = opt.flat || !pen.shine ? 0 : opt.light ?? 1;
  const { data, w, h } = g;
  if (opt.rim) {
    const rc = col(opt.rim);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      if (inside(px, py) || (clip && !clip(px, py))) continue;
      if (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) data[y * w + x] = rc;
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (!inside(px, py) || (clip && !clip(px, py))) continue;
    let c = base;
    if (!opt.flat) {
      if (!inside(px + sx, py + sy)) c = dark;
      else if (soft && !inside(px + sx * (1 + soft), py + sy * (1 + soft))) c = mid;
      else if (hi && !inside(px - sx * hi, py - sy * hi)) c = lite;
    }
    data[y * w + x] = c;
  }
  return g;
}

/**
 * A 1 px line through points written in an icon's own upright space: a crease, a fold, a string, a vein. It is one pixel wide at every size.
 * Arguments: g: the Surface; pen: from iconPen; pts: [[x, y], ...] in local units (two or more); colour; options { over (true: only recolour pixels that are already painted, so a crease never pokes out of its body) }.
 */
export function iconLine(g, pen, pts, colour, { over = false } = {}) {
  const c = col(colour);
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x0, y0] = pen.pt(...pts[i]).map(Math.floor);
    const [x1, y1] = pen.pt(...pts[i + 1]).map(Math.floor);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    for (let err = dx + dy; ;) {
      if (x0 >= 0 && y0 >= 0 && x0 < g.w && y0 < g.h && (!over || g.data[y0 * g.w + x0])) g.data[y0 * g.w + x0] = c;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  return g;
}

/**
 * The white glint of glass, metal or a gem: a short upright stroke and, below it to the left, one separate pixel; only pixels that are already painted are touched. Draws nothing when the pen's shine is off.
 * Arguments: g: the Surface; pen: from iconPen; x, y: where the top of the stroke goes, in local units; options { len (pixels in the stroke, default 2), dot (false: no separate pixel), colour (default white) }.
 */
export function iconGlint(g, pen, x, y, { len = 2, dot = true, colour = '#ffffff' } = {}) {
  if (!pen.shine) return g;
  const [fx, fy] = pen.pt(x, y), X = Math.floor(fx), Y = Math.floor(fy);
  for (let i = 0; i < len; i++) if (g.get(X, Y + i)) g.dot(X, Y + i, colour);
  if (dot && g.get(X - 1, Y + len + 1)) g.dot(X - 1, Y + len + 1, colour);
  return g;
}

/**
 * A small flame with no ink line, rising straight up the screen from a point given in the icon's own space (a flame does not lean with its candle). Draw it AFTER the outline: it is rimmed with a darker tone of its own colour.
 * Arguments: g: the Surface; pen: from iconPen; x, y: the foot of the flame in local units; options { h (height in units, default 7), w (width, default 5),
 * colours ([core, body]: the hot middle and the flame; the rim is tone(body, -1)), sway (px the tip leans to the right, default 0) }.
 */
export function iconFlame(g, pen, x, y, { h = 7, w = 5, colours = ['#f4e06a', '#e8662c'], sway = 0 } = {}) {
  const [fx, fy] = pen.pt(x, y), X = Math.floor(fx) + 0.5, Y = Math.floor(fy) + 1;
  const H = Math.max(4, Math.round(h * pen.k)), W = Math.max(3, Math.round(w * pen.k)), [core, body] = colours;
  const drop = (hh, ww, lift) => {
    const r = ww / 2, cyy = Y - lift - r;
    const tip = polyIn([[X - r, cyy], [X + r, cyy], [X + sway, Y - lift - hh]]);
    return (px, py) => (px - X) ** 2 + (py - cyy) ** 2 <= r * r || tip(px, py);
  };
  g.fill(0, 0, g.w, g.h, drop(H, W, 0), tone(body, -1));
  g.fill(0, 0, g.w, g.h, drop(H - 2, W - 2, 1), body);
  if (W >= 5) g.fill(0, 0, g.w, g.h, drop(Math.max(2, H - 5), Math.max(1, W - 4), 2), core);
  return g;
}

// ---- item shapes -------------------------------------------------------------------------
// Every shape below is written upright around (0, 0) and about 23 units along its longer side.
// Small parts (a cork, a cord, a collar) take two tones and the main body four, so an icon stays
// within ten colours with every style control on.

/**
 * A corked bottle of liquid, upright with the cork at the top, painted through the pen: glass, the liquid up to a level with a line at its surface, the cork and a glint. The outline is bottleIn of shapes.js.
 * Arguments: g: the Surface; pen: from iconPen; options { shape (one of BOTTLE_SHAPES in shapes.js: round, tall, flask, vial; default 'round'), h (height with the cork in units, default 23), glass, liquid, cork (colours),
 * level (0..1: how full, default 0.72), label (a colour: a paper band round the body; default none), soft (width of the liquid's second shadow tone, default 2), wide (stretch across, default 1: 1.3 makes a squat, boxy bottle) }.
 * Returns { top, bottom, half, surface, label }: the bottle's top and bottom y, half its width, the y of the liquid's surface, and the label band [x0, y0, x1, y1] (null without one), all in local units.
 */
export function iconBottle(g, pen, o = {}) {
  const { shape = 'round', h = 23, glass, liquid, cork, level = 0.72, label = null, soft = 2, wide = 1 } = o;
  if (!BOTTLE_SHAPES.includes(shape)) throw new Error(`iconBottle: shape "${shape}" is not one of ${BOTTLE_SHAPES.join(', ')}`);
  if (!glass || !liquid || !cork) throw new Error('iconBottle: needs glass, liquid and cork colours');
  const H = Math.max(12, Math.round(h)), B = bottleIn(H, shape), L = ramp(liquid), half = B.half * wide;
  const body = wide === 1 ? B.glass : placedIn(B.glass, 0, 0, { sx: wide, sy: 1 }), stopper = wide === 1 ? B.cork : placedIn(B.cork, 0, 0, { sx: wide, sy: 1 });
  const [top, bottom] = B.fill, surface = bottom + 1 - (bottom + 1 - top) * clamp01(level);
  iconPaint(g, pen, stopper, cork, { soft: 0, light: 0 });
  iconPaint(g, pen, body, glass, { soft: 0, light: 0 });
  iconPaint(g, pen, body, L, { clip: (x, y) => y >= surface, soft });
  if (level < 1) iconPaint(g, pen, body, pen.shine ? L.light : mix(L.base, L.dark, 0.5), { flat: true, clip: (x, y) => y >= surface && y < surface + 1 });
  let band = null;
  if (label) {
    const room = bottom + 1 - surface;
    band = [-half - 2, surface + room * 0.3, half + 2, surface + room * 0.74];
    iconPaint(g, pen, body, label, { soft: 0, light: 0, clip: boxIn(...band) });
  }
  iconGlint(g, pen, half * 0.42, surface + 1);
  return { top: -H / 2, bottom: H / 2, half, surface, label: band };
}

/**
 * A loaf of bread lying on its side: a domed crust with a flat bottom and slanted cuts across the top.
 * Arguments: g: the Surface; pen: from iconPen; options { crust (colour), cuts (how many slashes, 0 to 4, default 3) }.
 */
export function iconLoaf(g, pen, o = {}) {
  const { crust, cuts = 3 } = o;
  if (!crust) throw new Error('iconLoaf: needs a crust colour');
  const C = ramp(crust);
  iconPaint(g, pen, ellipseIn(0, 0.5, 11.5, 6.6), C, { minus: boxIn(-13, 5, 13, 9), soft: 3 });
  const n = Math.max(0, Math.min(4, Math.round(cuts)));
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -5.5 + (11 * i) / (n - 1), y = Math.abs(x) > 4 ? 0.6 : 0;
    iconPaint(g, pen, capsuleIn(x - 1.8, 2.2 + y, x + 0.6, -2.6 + y, 1.1), C.dark, { flat: true });
    iconPaint(g, pen, capsuleIn(x - 0.9, 1.6 + y, x + 1.5, -3.2 + y, 1.1), tone(crust, 1.5), { flat: true });
  }
  return g;
}

/**
 * A sprig of leaves: a bare stalk with pointed leaves in pairs up its sides and one at the tip, or a round bud there instead.
 * Arguments: g: the Surface; pen: from iconPen; options { leaf, stem (colours), pairs (1 to 3 pairs of leaves, default 2), bud (a colour: a bud at the tip in place of the top leaf; default none) }.
 */
export function iconSprig(g, pen, o = {}) {
  const { leaf, stem = leaf, pairs = 2, bud = null } = o;
  if (!leaf) throw new Error('iconSprig: needs a leaf colour');
  const n = Math.max(1, Math.min(3, Math.round(pairs)));
  const stemAt = (y) => 1.2 - ((y + 9) / 20.5) * 2.4;                    // the stem leans a little: x at height y
  iconPaint(g, pen, [capsuleIn(stemAt(11.8), 11.8, stemAt(1), 1, 1), capsuleIn(stemAt(1), 1, stemAt(-7), -7, 1)], stem, { soft: 0, light: 0 });
  const blade = (x0, y0, x1, y1, r) => { const mx = x0 + (x1 - x0) * 0.45, my = y0 + (y1 - y0) * 0.45; return [capsuleIn(x0, y0, mx, my, 0.7, r), capsuleIn(mx, my, x1, y1, r, 0.4)]; };
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 3 : 5.5 - (8.5 * i) / (n - 1), len = 9.6 - i * 1.4, r = 2.7 - i * 0.25;
    leaves.push([stemAt(y), y, stemAt(y) - len * 0.9, y - len * 0.55, r], [stemAt(y - 1.2), y - 1.2, stemAt(y - 1.2) + len * 0.92, y - 1.2 - len * 0.42, r]);
  }
  if (!bud) leaves.push([stemAt(-6), -6, stemAt(-6) + 1.4, -12.6, 2.5]);
  const L = ramp(leaf);
  for (const [x0, y0, x1, y1, r] of leaves) {
    iconPaint(g, pen, blade(x0, y0, x1, y1, r), L, { soft: 1, rim: L.dark });
    iconLine(g, pen, [[x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.3], [x0 + (x1 - x0) * 0.78, y0 + (y1 - y0) * 0.78]], pen.shine ? L.light : L.dark, { over: true });
  }
  if (bud) {
    iconPaint(g, pen, ellipseIn(stemAt(-9.5), -9.8, 2.8, 2.8), bud, { soft: 1, rim: L.dark });
    iconGlint(g, pen, stemAt(-9.5) + 0.8, -11.2, { len: 1, dot: false });
  }
  return g;
}

/**
 * A candle stub standing in a shallow dish with a finger ring: melted wax with drips. The wick and flame are not drawn: put them at the `wick` point after the outline (iconFlame).
 * Arguments: g: the Surface; pen: from iconPen; options { wax, dish (colours), tall (height of the stub in units, 5 to 12, default 8) }. Returns { wick: [x, y] } in local units.
 */
export function iconCandle(g, pen, o = {}) {
  const { wax, dish, tall = 8 } = o;
  if (!wax || !dish) throw new Error('iconCandle: needs wax and dish colours');
  const t = Math.max(5, Math.min(12, tall)), top = 6.5 - t;
  // the dish: a ring to hold it by on the left, a shallow bowl
  iconPaint(g, pen, ringIn(-8.6, 6.6, 3.4, 2), dish, { soft: 0, light: 0 });
  iconPaint(g, pen, [polyIn([[-6.5, 6.5], [10.5, 6.5], [7.8, 10.6], [-3.8, 10.6]]), capsuleIn(-6.3, 6.4, 10.3, 6.4, 1.1)], dish, { soft: 1, light: 0 });
  // the stub: wax with a melted rim and two drips
  iconPaint(g, pen, [boxIn(-2.4, top, 6, 6.4), ellipseIn(1.8, top, 4.4, 1.5), capsuleIn(-2.5, top + 0.5, -2.7, top + 3.6, 1.2), capsuleIn(6.1, top + 0.5, 6.2, top + 2.2, 1.1)], wax, { soft: 0 });
  return { wick: [1.8, top - 2.2] };
}

/**
 * A round bomb: an iron ball with a collar at the top right and a fuse curling up from it. The spark is not drawn: put a twinkle or iconFlame at the `fuse` point after the outline.
 * Arguments: g: the Surface; pen: from iconPen; options { body, cap, fuse (colours) }. Returns { fuse: [x, y] } (the burning end) in local units.
 */
export function iconBomb(g, pen, o = {}) {
  const { body, cap, fuse } = o;
  if (!body || !cap || !fuse) throw new Error('iconBomb: needs body, cap and fuse colours');
  iconPaint(g, pen, [capsuleIn(6.2, -4.2, 8.4, -7.2, 0.95), capsuleIn(8.4, -7.2, 7.6, -10, 0.95), capsuleIn(7.6, -10, 5.6, -11.2, 0.95)], fuse, { flat: true });
  iconPaint(g, pen, polyIn([[2.2, -4], [5.9, -0.3], [8.3, -2.7], [4.6, -6.4]]), cap, { soft: 0, light: 0 });
  iconPaint(g, pen, ellipseIn(-1, 3, 8.1, 8.1), body, { rim: INK });
  iconGlint(g, pen, 2.5, -1.5);
  return { fuse: [5.6, -11.2] };
}

/**
 * A small ridge tent seen from the front and a little from the right: a triangle of cloth with a dark open door and its folded flap, the lit far slope, and the pole tips crossing at the top.
 * Arguments: g: the Surface; pen: from iconPen; options { cloth, pole (colours), inside (the dark of the doorway; default a deep tone of the cloth mixed with the outline colour) }.
 */
export function iconTent(g, pen, o = {}) {
  const { cloth, pole } = o;
  if (!cloth || !pole) throw new Error('iconTent: needs cloth and pole colours');
  const C = ramp(cloth), inside = o.inside ?? mix(C.deep, INK, 0.5), lit = pen.shine ? C.light : mix(C.base, C.light, 0.4);
  // the poles cross behind the ridge
  iconPaint(g, pen, [capsuleIn(-2.6, -6, 0.4, -10.6, 0.9), capsuleIn(-2.6, -6, -5.4, -10.6, 0.9)], pole, { flat: true });
  // the far slope, facing the light; then the front, with the fold between them
  iconPaint(g, pen, polyIn([[-2.6, -7.8], [6.4, -5.4], [11.5, 8.4], [5, 9.5]]), lit, { flat: true });
  iconPaint(g, pen, polyIn([[-2.6, -8], [-11.5, 9.5], [5.2, 9.5]]), C, { soft: 2, light: 0 });
  iconLine(g, pen, [[-2.6, -8], [5, 9.4]], C.dark, { over: true });
  // the doorway and its folded flap
  iconPaint(g, pen, polyIn([[-3.2, -0.5], [-7, 9.5], [-0.4, 9.5]]), inside, { flat: true });
  iconPaint(g, pen, polyIn([[-3.2, -0.5], [-0.4, 9.5], [1.8, 9.5], [-2, -1]]), lit, { flat: true });
  return g;
}

/**
 * A big door key standing on end: a bow to hold it by at the bottom, a collar, the shaft, and teeth at the top pointing right.
 * Arguments: g: the Surface; pen: from iconPen; options { metal (colour), teeth (1 to 3, default 2), bow ('ring' | 'heart' | 'diamond', default 'ring') }.
 */
export function iconKey(g, pen, o = {}) {
  const { metal, teeth = 2, bow = 'ring' } = o;
  if (!metal) throw new Error('iconKey: needs a metal colour');
  const n = Math.max(1, Math.min(3, Math.round(teeth)));
  const bows = {
    ring: { plus: [ringIn(0, 7.4, 5, 2.9)], minus: [] },
    heart: { plus: [heartIn(0, 8, 11.5, 10.5, 'round')], minus: [ellipseIn(0, 7.4, 1.7, 1.7)] },
    diamond: { plus: [polyIn([[0, 1.4], [6, 7.4], [0, 13.4], [-6, 7.4]])], minus: [polyIn([[0, 5], [2.4, 7.4], [0, 9.8], [-2.4, 7.4]])] },
  };
  const b = bows[bow];
  if (!b) throw new Error(`iconKey: bow "${bow}" is not one of ${Object.keys(bows).join(', ')}`);
  const bits = [boxIn(1.5, -11.5, 3, -11.5 + n * 3.4 - 1.2)];
  for (let i = 0; i < n; i++) bits.push(boxIn(1.5, -11.5 + i * 3.4, i % 2 ? 5 : 6.2, -9.3 + i * 3.4));
  iconPaint(g, pen, [...b.plus, boxIn(-1.5, -11.5, 1.5, 3.5), boxIn(-2.7, 0, 2.7, 2.4), ...bits], metal, { minus: b.minus, soft: 1 });
  iconGlint(g, pen, 0.2, -9, { len: 3, dot: false });
  return g;
}

/**
 * A rolled sheet lying on its side and tied round the middle: a tube of paper with the roll showing at the left end, the loose edge along it, and a band with two tails.
 * Arguments: g: the Surface; pen: from iconPen; options { paper, band (colours), tails (false: a plain band with no hanging ends) }.
 */
export function iconScroll(g, pen, o = {}) {
  const { paper, band, tails = true } = o;
  if (!paper || !band) throw new Error('iconScroll: needs paper and band colours');
  const R = ramp(paper);
  iconPaint(g, pen, [boxIn(-10, -3.6, 10, 3.6), ellipseIn(10, 0, 1.7, 3.6)], R, { soft: 2 });
  // the loose edge of the sheet, and the roll seen end-on
  iconLine(g, pen, [[-8, 1.2], [8.5, 1.2]], R.dark, { over: true });
  iconPaint(g, pen, ellipseIn(-10, 0, 1.9, 3.6), R.dark, { flat: true, rim: R.dark });
  if (tails) iconPaint(g, pen, [capsuleIn(0, 4, -2.6, 8.4, 1.1), capsuleIn(0.4, 4, 2.6, 9, 1.1)], band, { soft: 0, light: 0, rim: INK });
  iconPaint(g, pen, boxIn(-2, -4.4, 2, 4.4), band, { soft: 0, rim: INK });
  return g;
}

/**
 * A sealed letter: an envelope seen from the back, its flap folded down to a point and held by a round wax seal.
 * Arguments: g: the Surface; pen: from iconPen; options { paper, seal (colours) }.
 */
export function iconLetter(g, pen, o = {}) {
  const { paper, seal } = o;
  if (!paper || !seal) throw new Error('iconLetter: needs paper and seal colours');
  const R = ramp(paper);
  iconPaint(g, pen, boxIn(-10.5, -7, 10.5, 7), R, { soft: 2, light: 0 });
  iconPaint(g, pen, polyIn([[-10.5, -7], [10.5, -7], [0, 1.6]]), pen.shine ? R.light : R.base, { flat: true });
  iconLine(g, pen, [[-10.5, -7], [0, 1.6], [10.4, -7]], R.dark, { over: true });
  iconLine(g, pen, [[-10.5, 6.9], [-4, 1.5]], R.dark, { over: true });
  iconLine(g, pen, [[10.4, 6.9], [4, 1.5]], R.dark, { over: true });
  iconPaint(g, pen, ellipseIn(0, 1.4, 3.3, 3.3), seal, { soft: 0, rim: INK });
  iconGlint(g, pen, 1, 0, { len: 1, dot: false });
  return g;
}

/**
 * A cut gem or a splinter of crystal painted through the pen in flat facets, lit from the top right: the facets facing the light turn near-white when the pen's shine is on, and the turned-away ones get a softer tone inside a dark edge when its shade is on. The cut is gemIn / gemFacets of shapes.js.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, cut (one of GEM_CUTS in shapes.js: diamond, emerald, round, shard, heart; default 'shard'), x, y (its centre in local units, default 0, 0),
 * rx, ry (half its width and height, default 6 and 12), turn (radians it leans by itself, clockwise, before the pen's own lean; default 0), glint (false: no white stroke) }.
 */
export function iconGem(g, pen, o = {}) {
  const { colour, cut = 'shard', x = 0, y = 0, rx = 6, ry = 12, turn = 0, glint = true } = o;
  if (!GEM_CUTS.includes(cut)) throw new Error(`iconGem: cut "${cut}" is not one of ${GEM_CUTS.join(', ')}`);
  if (!colour) throw new Error('iconGem: needs a colour');
  const C = ramp(colour), half = mix(C.base, C.dark, 0.5), bright = mix(C.light, '#ffffff', 0.55);
  const put = (test) => placedIn(test, x, y, { angle: turn }), stone = put(gemIn(0, 0, rx, ry, cut));
  iconPaint(g, pen, stone, C.base, { flat: true });
  for (const f of gemFacets(0, 0, rx, ry, cut)) {
    const facet = put(polyIn(f.pts));
    if (f.tone < 0) iconPaint(g, pen, facet, { base: pen.shade ? half : C.dark, dark: C.dark, light: C.dark }, { soft: 0, light: 0, clip: stone });
    else iconPaint(g, pen, facet, f.tone >= 2 ? (pen.shine ? bright : C.light) : f.tone === 1 ? C.light : C.base, { flat: true, clip: stone });
  }
  if (glint) {
    const c = Math.cos(turn), s = Math.sin(turn), gx = rx * 0.28, gy = -ry * 0.42;
    iconGlint(g, pen, x + gx * c - gy * s, y + gx * s + gy * c, { len: Math.max(1, Math.round(ry / 5)), dot: false });
  }
  return g;
}

/**
 * A drawstring pouch: a round sack gathered at the neck under a frilled top, a cord with a bead hanging from the knot, and coins at its foot.
 * Arguments: g: the Surface; pen: from iconPen; options { cloth, tie, coin (colours), coins (0 to 2 coins lying at the foot, default 2) }.
 */
export function iconPouch(g, pen, o = {}) {
  const { cloth, tie, coin, coins = 2 } = o;
  if (!cloth || !tie || (coins > 0 && !coin)) throw new Error('iconPouch: needs cloth, tie and coin colours');
  const C = ramp(cloth);
  iconPaint(g, pen, [ellipseIn(-1.5, 4.2, 8.4, 6.9), ellipseIn(-1.5, 6.2, 7.4, 5), polyIn([[-4.3, -4], [1.3, -4], [4.6, 1.5], [-7.6, 1.5]]), polyIn([[-4.2, -3.5], [1.2, -3.5], [4.4, -9.6], [0.6, -8.2], [-1.5, -10.2], [-3.6, -8.2], [-7.4, -9.6]])], C, { soft: 3 });
  // creases under the neck, the cord and its bead
  iconLine(g, pen, [[-3, -1.6], [-4.6, 1.6]], C.dark, { over: true });
  iconLine(g, pen, [[0.2, -1.6], [1, 1]], C.dark, { over: true });
  iconPaint(g, pen, [capsuleIn(1, -4, 4.8, -0.6, 0.8), ellipseIn(5.4, 0.4, 1.7, 1.7)], tie, { soft: 0, light: 0, rim: C.dark });
  iconPaint(g, pen, boxIn(-5, -5.2, 2, -3), tie, { soft: 0, light: 0, rim: C.dark });
  const n = Math.max(0, Math.min(2, Math.round(coins)));
  if (n > 1) iconPaint(g, pen, ellipseIn(3.2, 9.8, 3.4, 2.2), coin, { soft: 0, rim: INK });
  if (n > 0) iconPaint(g, pen, ellipseIn(7.6, 7.6, 3.5, 3.5), coin, { soft: 0, rim: INK });
  return g;
}

/**
 * A hand lantern: a carrying ring, a peaked cap, a glass with corner posts and a small flame inside, and a foot.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, glow (the glass behind the flame: pale for a lit pane, dark to make any flame stand out), flame (colours) }.
 */
export function iconLantern(g, pen, o = {}) {
  const { metal, glow, flame } = o;
  if (!metal || !glow || !flame) throw new Error('iconLantern: needs metal, glow and flame colours');
  iconPaint(g, pen, ringIn(0, -10, 3, 1.7), metal, { soft: 0 });
  iconPaint(g, pen, boxIn(-4.6, -5, 4.6, 6.5), glow, { flat: true });
  // the flame, behind the posts: a drop of the flame colour with a white heart
  iconPaint(g, pen, [ellipseIn(0, 2.6, 2.3, 2.6), polyIn([[-2.1, 1.8], [2.1, 1.8], [0, -3.4]])], flame, { flat: true });
  iconPaint(g, pen, ellipseIn(0, 3, 1.1, 1.5), '#ffffff', { flat: true });
  iconPaint(g, pen, [boxIn(-5.6, -5.2, -3.8, 6.5), boxIn(3.8, -5.2, 5.6, 6.5)], metal, { soft: 0 });
  iconPaint(g, pen, [polyIn([[-6.8, -4.6], [6.8, -4.6], [3, -8.4], [-3, -8.4]]), boxIn(-6.8, 6, 6.8, 9), boxIn(-5, 9, 5, 10.6)], metal, { soft: 1 });
  return g;
}

// ---- fitting an icon to its frame -----------------------------------------------------------

/**
 * Draw one icon so that it always fills its slot the same way: scaled until its longer side (outline and lights included) is the size the Size slider asks for, then centred in the frame to the pixel. Use it in place of making a pen by hand.
 * Arguments: g: the Surface (the frame); options { size (0..1, Small to Big), tilt, angle, shade, shine (as iconPen), fill (this icon's share of the set's size, default 1: 0.85 for a thing that is meant to look small),
 * span ([smallest, biggest] longer side in px, default [20, 26], the style guide's icon size) }; draw(surface, pen): draws the whole icon (bodies, surface.outline, lights) with the pen it is given.
 * Returns { pen, scale, side (the longer side in px), dx, dy (the whole-pixel shift that centred it) }; draw is called up to six times.
 */
export function iconFit(g, o, draw) {
  const { size = 0.5, fill = 1, span = [20, 26] } = o;
  const want = Math.max(4, Math.round((span[0] + (span[1] - span[0]) * clamp01(size)) * fill));
  let scale = (want - 2) / 22, best = null, lo = 0, hi = Infinity;
  for (let pass = 0; pass < 6; pass++) {
    const s = new Surface(g.w, g.h);
    s.shadow = g.shadow;
    const pen = iconPen({ tilt: o.tilt, angle: o.angle, shade: o.shade, shine: o.shine, cx: g.w / 2, cy: g.h / 2, scale, span: [1, 1] });
    draw(s, pen);
    const b = s.bounds();
    if (!b) return { pen, scale, side: 0, dx: 0, dy: 0 };
    const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    if (!best || Math.abs(side - want) < Math.abs(best.side - want) || (Math.abs(side - want) === Math.abs(best.side - want) && side < best.side)) best = { s, b, side, scale, pen };
    if (side === want) break;
    if (side < want) lo = Math.max(lo, scale); else hi = Math.min(hi, scale);
    // first a proportional step; once the answer is bracketed, halve the bracket
    scale = lo > 0 && hi < Infinity ? (lo + hi) / 2 : (scale * (want - 1.5)) / (side - 1.5);
  }
  const { s, b } = best;
  const dx = Math.floor((g.w - (b.x1 - b.x0 + 1)) / 2) - b.x0, dy = Math.floor((g.h - (b.y1 - b.y0 + 1)) / 2) - b.y0;
  g.blit(s, dx, dy);
  return { pen: best.pen, scale: best.scale, side: best.side, dx, dy };
}

/**
 * Take the pimples off round shapes: one or two pixels standing alone on a flat run at least four pixels longer (the pole a small circle grows when its centre falls between pixels) are removed, so balls, coins and bottles end in a clean flat. Call it after the bodies and BEFORE the outline.
 * Arguments: g: the Surface. Points (the tip of a blade or a crystal, which sit on a run of one to three) and thin things that go on (a stem, a wick) are left alone. Returns the Surface.
 */
export function iconTidy(g) {
  const { w, h, data } = g, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] !== 0, gone = [];
  // turned 0: runs along rows (a pimple points up or down); turned 1: runs along columns (it points left or right)
  for (const turned of [0, 1]) {
    const at = (a, b) => (turned ? on(b, a) : on(a, b)), A = turned ? h : w, B = turned ? w : h;
    for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) {
      if (!at(a, b) || at(a - 1, b)) continue;                           // a is where a run starts
      let e = a;
      while (at(e + 1, b)) e++;
      if (e - a < 2) for (const side of [-1, 1]) {
        let bare = true, held = true;
        for (let k = a; k <= e; k++) if (at(k, b - side)) bare = false;            // nothing beyond it
        for (let k = a - 2; k <= e + 2; k++) if (!at(k, b + side)) held = false;   // a longer run under it
        if (bare && held) for (let k = a; k <= e; k++) gone.push(turned ? k * w + b : b * w + k);
      }
      a = e;
    }
  }
  for (const i of gone) data[i] = 0;
  return g;
}

// ---- gear shapes (batch R17) ------------------------------------------------------------------
// Things worn or wielded, written upright like the item shapes above: a weapon stands on its
// handle with the point at the top (turn it with ICON_DIAGONAL). A worn thing full of small square
// details (a helm, a breastplate, a boot) is smeared by a turned pen: paint it with an UPRIGHT pen
// inside iconSlant, which leans the finished pixels by sliding whole rows.
//
//   iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: 0 }, (s, pen) => {
//     iconSlant(s, p.tilt ? ICON_SLANT : 0, (u) => iconHelm(u, pen, { metal: p.metal, horn: P.cream }));
//     iconTidy(s).outline(INK);
//   });

import { lean as leanRows } from './surface.js';

/** The lean of worn things drawn with iconSlant: each row slides one pixel to the right for every four rows it stands above the middle. No arguments: a slope in pixels per pixel. */
export const ICON_SLANT = 0.25;

/**
 * Paint an icon's bodies upright, then lean the finished pixels to the right by sliding whole rows, so a shape full of small square details (a helm, armour, a boot) leans with its set and stays crisp.
 * Call it BEFORE the outline.
 * Arguments: g: the Surface; slope (pixels a row slides per pixel it stands above the middle row, usually ICON_SLANT; 0 paints straight onto g); draw(surface): paints the bodies upright, with an upright pen. Returns g.
 */
export function iconSlant(g, slope, draw) {
  if (!slope) { draw(g); return g; }
  const u = new Surface(g.w, g.h);
  u.shadow = g.shadow;
  draw(u);
  return g.blit(leanRows(u, g.h / 2, slope));
}

// The two tones of a blade's flats: the side that faces up when the blade lies on the icon diagonal, and the side that faces down.
function bladeTones(pen, metal) {
  const M = typeof metal === 'string' ? ramp(metal) : metal, mid = mix(M.base, M.dark, 0.5);
  return [pen.shine ? M.light : M.base, pen.shade ? mid : pen.shine ? M.base : M.dark];
}

/**
 * A straight sword standing on its pommel: a two-edged blade with a ridge down the middle, a cross guard, a wrapped grip and a round pommel.
 * Arguments: g: the Surface; pen: from iconPen; options { metal (the blade), hilt (guard and pommel), grip (colours), gem (a colour: a jewel for a pommel; default the hilt colour),
 * long (length of the blade in units, 8 to 18, default 16), wide (half the blade's width, default 2.3) }. Returns { tip: [x, y] } in local units.
 */
export function iconSword(g, pen, o = {}) {
  const { metal, hilt, grip, gem = null } = o;
  if (!metal || !hilt || !grip) throw new Error('iconSword: needs metal, hilt and grip colours');
  const long = Math.max(8, Math.min(18, o.long ?? 16)), w = o.wide ?? 2.3, foot = 4.2, tip = foot - long, sh = tip + w * 1.5;
  const [lit, shadow] = bladeTones(pen, metal);
  iconPaint(g, pen, boxIn(-1.4, foot + 2, 1.4, foot + 6.4), grip, { soft: 0, light: 0 });
  iconPaint(g, pen, polyIn([[-w, foot], [-w, sh], [0, tip], [0, foot]]), lit, { flat: true });
  iconPaint(g, pen, polyIn([[0, foot], [0, tip], [w, sh], [w, foot]]), shadow, { flat: true });
  iconPaint(g, pen, [boxIn(-5.4, foot, 5.4, foot + 2.2), ellipseIn(-5.4, foot + 1.1, 1.5, 1.5), ellipseIn(5.4, foot + 1.1, 1.5, 1.5)], hilt, { soft: 0, light: 0 });
  iconPaint(g, pen, ellipseIn(0, foot + 7.4, 2.2, 2.2), gem ?? hilt, { soft: 0, light: 0 });
  iconGlint(g, pen, -w * 0.5, tip + long * 0.3, { len: 2, dot: false });
  return { tip: [0, tip] };
}

/**
 * A dagger standing on its pommel: a short broad blade with one curved edge, a small guard, a grip and a ring to hang it by.
 * Arguments: g: the Surface; pen: from iconPen; options { metal (the blade), hilt (guard and ring), grip (colours) }. Returns { tip: [x, y] } in local units.
 */
export function iconDagger(g, pen, o = {}) {
  const { metal, hilt, grip } = o;
  if (!metal || !hilt || !grip) throw new Error('iconDagger: needs metal, hilt and grip colours');
  const [lit, shadow] = bladeTones(pen, metal);
  iconPaint(g, pen, ringIn(0, 9.4, 2.9, 1.7), hilt, { soft: 0, light: 0 });
  iconPaint(g, pen, boxIn(-1.6, 2.6, 1.6, 7.2), grip, { soft: 0, light: 0 });
  // the back of the blade is straight, the edge bellies out and sweeps up to the point
  iconPaint(g, pen, polyIn([[-2.6, 1], [-2.6, -6.5], [-0.6, -11.6], [0.2, -5], [0.2, 1]]), lit, { flat: true });
  iconPaint(g, pen, polyIn([[0.2, 1], [0.2, -5], [-0.6, -11.6], [2.6, -7.4], [3.4, -3.4], [3, 1]]), shadow, { flat: true });
  iconPaint(g, pen, [boxIn(-4.6, 0.8, 4.8, 2.8), ellipseIn(4.8, 1.2, 1.5, 1.7)], hilt, { soft: 0 });
  iconGlint(g, pen, -1.4, -6, { len: 2, dot: false });
  return { tip: [-0.6, -11.6] };
}

/**
 * A mage's staff standing on its foot: a wooden shaft with a metal shoe, a wrapped grip and a collar, and two short horns at the top with a round orb between them.
 * Arguments: g: the Surface; pen: from iconPen; options { wood, metal, orb (colours), grip (a colour: a wrapping round the middle of the shaft; default none) }. Returns { orb: [x, y] } (its centre) in local units.
 */
export function iconStaff(g, pen, o = {}) {
  const { wood, metal, orb, grip = null } = o;
  if (!wood || !metal || !orb) throw new Error('iconStaff: needs wood, metal and orb colours');
  iconPaint(g, pen, boxIn(-1.25, -3, 1.25, 12.6), wood, { soft: 0, light: 0 });
  if (grip) iconPaint(g, pen, boxIn(-1.6, 2, 1.6, 6.4), grip, { flat: true });
  iconPaint(g, pen, boxIn(-1.6, 10.6, 1.6, 13), metal, { soft: 0, light: 0 });
  iconPaint(g, pen, [...[-1, 1].map((s) => polyIn([[s * 1.8, -2.4], [s * 5.6, -4.8], [s * 6.2, -8], [s * 4, -8], [s * 3.6, -6.2], [s * 1.2, -5]])), boxIn(-2.3, -4.4, 2.3, -2.4)], metal, { soft: 0, light: 0 });
  iconPaint(g, pen, ellipseIn(0, -8.4, 3.6, 3.6), orb, { soft: 1, rim: INK });
  iconGlint(g, pen, 0.9, -10.2, { len: 2, dot: false });
  return { orb: [0, -8.4] };
}

/**
 * A strung bow standing on end: a curved wooden limb bellying to the left and tapering to its tips, a wrapped grip at its middle, capped tips and a taut string.
 * Arguments: g: the Surface; pen: from iconPen; options { wood, grip, tips, string (colours) }.
 */
export function iconBow(g, pen, o = {}) {
  const { wood, grip, tips, string } = o;
  if (!wood || !grip || !tips || !string) throw new Error('iconBow: needs wood, grip, tips and string colours');
  // the limb is the sliver between two circles: thickest at the grip, thin at the tips
  const limb = ellipseIn(8.2, 0, 14.2, 14.2), hollow = ellipseIn(14, 0, 16.9, 16.9), reach = (x, y) => x <= 2.2;
  iconLine(g, pen, [[1.4, -11.4], [1.4, 11.4]], string);
  iconPaint(g, pen, limb, wood, { minus: hollow, clip: reach, soft: 1 });
  iconPaint(g, pen, limb, grip, { minus: hollow, clip: boxIn(-9, -2.8, 0, 2.8), soft: 0, light: 0 });
  iconPaint(g, pen, [ellipseIn(1.3, -11.6, 1.5, 1.5), ellipseIn(1.3, 11.6, 1.5, 1.5)], tips, { soft: 0, light: 0 });
  return g;
}

/**
 * A heater shield seen from the front: a flat-topped board that narrows to a point, a metal rim, and a round boss in the middle that may hold a jewel.
 * Arguments: g: the Surface; pen: from iconPen; options { face (the board), rim (the metal), gem (a colour: a jewel in the boss; default none), bars (true: a metal bar down and across the board) }.
 */
export function iconShield(g, pen, o = {}) {
  const { face, rim, gem = null, bars = false } = o;
  if (!face || !rim) throw new Error('iconShield: needs face and rim colours');
  const out = [[-9.4, -10.6], [9.4, -10.6], [9.6, -1.5], [6.6, 6], [0, 11.6], [-6.6, 6], [-9.6, -1.5]];
  const inner = out.map(([x, y]) => [x * 0.74, -1.2 + (y + 1.2) * 0.76]);
  const F = ramp(face), M = ramp(rim);
  iconPaint(g, pen, polyIn(out), M, { soft: 1 });
  iconPaint(g, pen, polyIn(inner), F, { soft: 2, light: 0, rim: M.dark });
  if (bars) iconPaint(g, pen, [boxIn(-1.1, -9, 1.1, 8), boxIn(-7, -3.4, 7, -1.2)], M, { soft: 0, light: 0, clip: polyIn(inner) });
  iconPaint(g, pen, ellipseIn(0, -2.2, 3.4, 3.4), M, { soft: 0, rim: M.dark });
  if (gem) iconPaint(g, pen, ellipseIn(0, -2.2, 1.9, 1.9), gem, { flat: true });
  iconGlint(g, pen, 0.6, -3.6, { len: 1, dot: false });
  return g;
}

/**
 * An open-faced helm seen from the front: a round dome with a brow band and a nose guard over a dark face opening, two cheek plates, and (unless turned off) a horn curving up from each side.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, horn (a colour for the horns; none: a plain helm), gem (a colour: a jewel on the brow; default none), lining (a colour: a padded collar under the cheek plates; default none),
 * dark (the colour inside the opening; default a deep tone of the metal mixed with the outline colour) }.
 */
export function iconHelm(g, pen, o = {}) {
  const { metal, horn = null, gem = null, lining = null } = o;
  if (!metal) throw new Error('iconHelm: needs a metal colour');
  const M = ramp(metal), dark = o.dark ?? mix(M.deep, INK, 0.6);
  if (horn) for (const s of [-1, 1]) iconPaint(g, pen, [capsuleIn(s * 6.4, -3.4, s * 9.4, -5.4, 2.2, 2), capsuleIn(s * 9.4, -5.4, s * 9.6, -11, 2, 0.9)], horn, { soft: 0, light: 0 });
  if (lining) iconPaint(g, pen, boxIn(-6.6, 10.4, 6.6, 12.2), lining, { soft: 0, light: 0 });
  iconPaint(g, pen, [ellipseIn(0, -1.4, 8, 8.8), boxIn(-8, -1.4, 8, 11)], M, { soft: 2 });
  iconPaint(g, pen, boxIn(-4.2, 3.6, 4.2, 11), dark, { flat: true });
  iconPaint(g, pen, boxIn(-5.8, 3.6, 5.8, 6), dark, { flat: true });
  iconPaint(g, pen, [boxIn(-8.6, 1, 8.6, 3.6), boxIn(-1.1, 1, 1.1, 9)], pen.shine ? { base: M.light, dark: M.base, light: M.light, mid: M.light } : { base: M.base, dark: M.dark, light: M.base, mid: M.base }, { soft: 0, light: 0, rim: M.dark });
  if (gem) iconPaint(g, pen, ellipseIn(0, -3.2, 2.1, 2.1), gem, { flat: true, rim: M.dark });
  iconGlint(g, pen, 4, -6.4, { len: 2, dot: false });
  return g;
}

/**
 * A breastplate seen from the front: angled shoulder plates, a scooped neck, a waist drawn in by a belt with a buckle, a flared skirt plate and a ridge down the chest that may hold a jewel.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, belt, buckle (colours), gem (a colour: a jewel on the chest; default none) }.
 */
export function iconArmour(g, pen, o = {}) {
  const { metal, belt, buckle, gem = null } = o;
  if (!metal || !belt || !buckle) throw new Error('iconArmour: needs metal, belt and buckle colours');
  const M = ramp(metal);
  const body = polyIn([[-4, -10.8], [-10.6, -9.4], [-11.6, -4.4], [-7.4, -2.6], [-6, 4], [-8.8, 10.8], [8.8, 10.8], [6, 4], [7.4, -2.6], [11.6, -4.4], [10.6, -9.4], [4, -10.8]]);
  iconPaint(g, pen, body, M, { minus: ellipseIn(0, -11.8, 3.4, 3.8), soft: 2 });
  for (const s of [-1, 1]) iconLine(g, pen, [[s * 6.4, -9.8], [s * 7.2, -2.8]], M.dark, { over: true });
  iconLine(g, pen, [[0, -7.6], [0, 3]], pen.shine ? M.light : M.dark, { over: true });
  iconLine(g, pen, [[-7.4, 8.2], [7.4, 8.2]], M.dark, { over: true });
  iconPaint(g, pen, boxIn(-6.4, 3.6, 6.4, 6), belt, { soft: 0, light: 0, rim: M.dark });
  iconPaint(g, pen, boxIn(-1.6, 3.2, 1.6, 6.4), buckle, { flat: true });
  if (gem) iconPaint(g, pen, ellipseIn(0, -3.8, 2.1, 2.1), gem, { soft: 0, light: 0, rim: M.dark });
  return g;
}

/**
 * A finger ring standing on edge with its jewel at the top: a round band, a claw setting and a cut gem.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, gem (colours), cut (one of GEM_CUTS in shapes.js, default 'diamond') }.
 */
export function iconRing(g, pen, o = {}) {
  const { metal, gem, cut = 'diamond' } = o;
  if (!metal || !gem) throw new Error('iconRing: needs metal and gem colours');
  iconPaint(g, pen, ringIn(0, 3.4, 8.2, 2.7), metal, { soft: 1 });
  iconPaint(g, pen, polyIn([[-3.6, -6.2], [3.6, -6.2], [2.4, -3.2], [-2.4, -3.2]]), metal, { soft: 0, light: 0 });
  iconGem(g, pen, { colour: gem, cut, x: 0, y: -8.2, rx: 4.8, ry: 3.8 });
  return g;
}

/**
 * A tall boot seen from the side, toe to the right: a leg with a turned-down cuff, a round toe, a strap with a buckle over the ankle, and a sole with a heel.
 * Arguments: g: the Surface; pen: from iconPen; options { leather, sole, buckle (colours), cuff (a colour; default the light tone of the leather), pair (true: a second boot stands behind, to the left) }.
 */
export function iconBoot(g, pen, o = {}) {
  const { leather, sole, buckle, pair = false } = o;
  if (!leather || !sole || !buckle) throw new Error('iconBoot: needs leather, sole and buckle colours');
  const L = ramp(leather), cuff = o.cuff ?? L.light;
  const one = (dx, dy, far) => {
    const at = (x0, y0, x1, y1) => boxIn(x0 + dx, y0 + dy, x1 + dx, y1 + dy), paint = far ? { light: L.base, base: mix(L.base, L.dark, 0.5), dark: L.dark, mid: L.dark } : L;
    iconPaint(g, pen, [at(-6, 7.6, 9.6, 9.6), at(-6, 9.6, -2.4, 11.4)], sole, { flat: true });
    iconPaint(g, pen, [at(-5.4, -9, 1.6, 7.6), at(-5.4, 2.4, 6, 7.6), ellipseIn(5.6 + dx, 4.4 + dy, 4, 3.3)], paint, { minus: at(-8, 7.6, 12, 12), soft: 2, rim: far ? L.dark : null });
    iconPaint(g, pen, at(-6.4, -11.4, 2.6, -7.8), far ? L.base : cuff, { flat: true, rim: L.dark });
    if (!far) {
      iconPaint(g, pen, at(-5.4, -1.4, 1.6, 1.4), L.dark, { flat: true });
      iconPaint(g, pen, at(-2.4, -2.6, 1.2, 2.6), buckle, { flat: true });
    }
  };
  if (pair) one(-5.2, -1.8, true);
  one(pair ? 2.2 : 0, pair ? 0.8 : 0, false);
  return g;
}

// ---- plates, signs and sci-fi weapons (batch S16) -----------------------------------------------
// SIGNS are flat pictures in two colours for upgrade cards, status marks and badges. Make the pen
// with shade off: a sign then has a dark band away from the light, a light one towards it when shine
// is on, and nothing softer. Where the second colour lies on the first, iconOver puts an ink line
// between them, so a sign still reads when a whole-bundle look takes the hues away.
// A sign may sit on a PLATE (iconPlate): draw the plate first, straight onto the frame, then fit the
// icon to the room it leaves. iconBold makes any pen draw thicker.
//
//   const plate = p.backing === 'none' ? null : iconPlate(g, { shape: p.backing, size: p.size, face: p.face, shine: p.shine });
//   iconFit(g, { size: p.size, tilt: false, shade: false, shine: p.shine, span: plate && [plate.room, plate.room] || undefined }, (s, pen) => {
//     iconBurst(s, p.bold ? iconBold(pen) : pen, { colour: p.body, core: p.accent });
//     iconTidy(s).outline(INK);
//   });
//
// WEAPONS lie on their side pointing right (x from about -11.5 to 11.5). They are full of small
// square details, which a turned pen smears: paint them level, with an upright pen, inside iconRise,
// which slides whole columns so the muzzle climbs to the top right like every other icon. They
// return the points their lights go on (iconBeamGun `tip`, iconBlades `core`, iconMine `lamp`):
// local points for pen.pt, then for the function iconRise returns, for a glow after the outline.
//
//   iconFit(g, { size: p.size, tilt: false, shade: false, shine: p.shine }, (s, pen) => {
//     let made;
//     const moved = iconRise(s, p.tilt ? ICON_RISE : 0, (u) => { made = iconBeamGun(u, pen, { metal: p.body, glow: p.glow }); });
//     iconTidy(s).outline(INK);
//     fxGlow(s, ...moved(...pen.pt(...made.tip)), 2, [p.glow, tone(p.glow, -1)]);        // glow of fx.js
//   });

import { starIn as signStarIn, burstIn as signBurstIn, arrowIn as signArrowIn, crossIn as signCrossIn, hexIn as signHexIn, hoopIn as signHoopIn } from './shapes.js';

/** The backing plates iconPlate draws: hex (a hexagon standing on a point) and circle (a disc). No arguments: a frozen list. */
export const ICON_PLATES = Object.freeze(['hex', 'circle']);

/**
 * A backing plate behind an icon, drawn straight onto the frame with its own ink line: a hexagon standing on a point or a disc, flat, with a lit rim towards the light when shine is on.
 * Draw it first, then fit the icon over it with iconFit's `span` set to [room, room].
 * Arguments: g: the Surface (the frame); options { shape ('hex' | 'circle'), size (0..1, Small to Big), face (colour), shine (true: the lit rim), ink (the outline colour, default the ink colour),
 * span ([smallest, biggest] size in px with the ink line, default [26, 30]: a plate goes to the frame's 1 px border) }.
 * Returns { side (its longer side in px, ink line included), room (the longer side in px of an icon that sits well on it) }.
 */
export function iconPlate(g, o = {}) {
  const { shape = 'hex', size = 0.5, face, shine = true, ink = INK, span = [26, 30] } = o;
  if (!ICON_PLATES.includes(shape)) throw new Error(`iconPlate: shape "${shape}" is not one of ${ICON_PLATES.join(', ')}`);
  if (!face) throw new Error('iconPlate: needs a face colour');
  const side = 2 * Math.round((span[0] + (span[1] - span[0]) * clamp01(size)) / 2), d = side - 2, cx = g.w / 2, cy = g.h / 2;
  const s = new Surface(g.w, g.h), F = ramp(face);
  s.shadow = g.shadow;
  s.fill(0, 0, g.w, g.h, shape === 'hex' ? signHexIn(cx, cy, d - 2, d) : ellipseIn(cx, cy, d / 2, d / 2), { light: F.light, base: F.base, dark: F.base }, { shade: 0, light: shine ? 1 : 0 });
  if (shape === 'circle') iconTidy(s);
  g.blit(s.outline(ink));
  return { side, room: side - 8 };
}

/** The rise of lying things drawn with iconRise: each column slides one pixel up for every four columns it stands to the right of the middle. No arguments: a slope in pixels per pixel. */
export const ICON_RISE = 0.25;

/**
 * Paint an icon's bodies level, then raise the finished pixels towards the right by sliding whole columns, so a long thing full of small square details (a gun, a tool, a vehicle) points to the top right with its set and stays crisp.
 * Call it BEFORE the outline.
 * Arguments: g: the Surface; slope (pixels a column slides up per pixel it stands right of the middle column, usually ICON_RISE; 0 paints straight onto g); draw(surface): paints the bodies level, with an upright pen.
 * Returns moved(x, y) -> [x, y]: where a frame point of the level picture ends up, for a light put on after the outline.
 */
export function iconRise(g, slope, draw) {
  if (!slope) { draw(g); return (x, y) => [x, y]; }
  const u = new Surface(g.w, g.h), lift = (x) => Math.round((Math.floor(x) + 0.5 - g.w / 2) * slope);
  u.shadow = g.shadow;
  draw(u);
  for (let x = 0; x < g.w; x++) for (let y = 0; y < g.h; y++) {
    const c = u.get(x, y + lift(x));
    if (c) g.data[y * g.w + x] = c;
  }
  return (x, y) => [x, y - lift(x)];
}

/**
 * A pen that draws every shape a little thicker: each shape it places is grown on every side, so strokes gain weight and gaps narrow. Hand it to any icon shape in place of the pen it was made from.
 * Arguments: pen: from iconPen or iconFit; by (pixels added on every side, default 0.5: about one pixel more across each stroke). Points (pen.pt) are not moved.
 */
export function iconBold(pen, by = 0.5) {
  const d = by * Math.SQRT1_2;
  const grown = (f) => (px, py) => f(px, py) || f(px - by, py) || f(px + by, py) || f(px, py - by) || f(px, py + by) || f(px - d, py - d) || f(px + d, py - d) || f(px - d, py + d) || f(px + d, py + d);
  return { ...pen, bold: by, at: (test) => grown(pen.at(test)) };
}

/**
 * Paint a shape of a second colour over what is already drawn, with a parting line between the two only where they touch: unlike iconPaint's `rim`, nothing is added outside the picture, so its outline stays one pixel wide.
 * Arguments: g: the Surface; pen: from iconPen; tests: a shape test or a list, in local units; paint: a colour or a ramp; options: as iconPaint, where rim is the colour of the parting line (default the ink colour).
 */
export function iconOver(g, pen, tests, paint, opt = {}) {
  const before = g.data.slice(), rim = opt.rim ?? INK, rc = col(rim);
  iconPaint(g, pen, tests, paint, { ...opt, rim });
  const list = [].concat(tests).map(pen.at), minus = [].concat(opt.minus ?? []).map(pen.at);
  const inside = (px, py) => !minus.some((f) => f(px, py)) && list.some((f) => f(px, py));
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const i = y * g.w + x;
    if (!before[i] && g.data[i] === rc && !inside(x + 0.5, y + 0.5)) g.data[i] = 0;
  }
  return g;
}

/**
 * An impact burst: a star of long and short points, with a round core of a second colour ringed by an ink line.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the burst), core (a colour for the middle; default none), points (how many, an even number, default 8), r (radius of the long points, default 11.5),
 * fat (radius of the inside corners as a share of r, default 0.42), turn (radians clockwise, default 0: a long point straight up) }.
 */
export function iconBurst(g, pen, o = {}) {
  const { colour, core = null, points = 8, r = 11.5, fat = 0.42, turn = 0 } = o;
  if (!colour) throw new Error('iconBurst: needs a colour');
  iconPaint(g, pen, signBurstIn(0, 0, r, points, { inner: fat, angle: turn }), colour, { soft: 0 });
  if (core) iconOver(g, pen, ellipseIn(0, 0, r * 0.29, r * 0.29), core, { soft: 0, light: 0 });
  return g;
}

/**
 * A shot of energy in flight: a round-nosed slug with a tail of a second colour that thins out behind it.
 * Arguments: g: the Surface; pen: from iconPen; options { from: [x, y] (where the tail ends), to: [x, y] (the nose), colour (the slug), tail (a colour; default none: the slug alone),
 * r (half the slug's thickness, default 2.6), head (the slug's share of the length, default 0.5) }.
 */
export function iconShot(g, pen, o = {}) {
  const { from, to, colour, tail = null, r = 2.6, head = 0.5 } = o;
  if (!colour || !from || !to) throw new Error('iconShot: needs from and to points and a colour');
  const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1e-6, ux = dx / L, uy = dy / L;
  const back = Math.min(L - r, L * (1 - head) + r), ax = from[0] + ux * back, ay = from[1] + uy * back;
  if (tail) iconPaint(g, pen, capsuleIn(from[0] + ux * 0.7, from[1] + uy * 0.7, ax, ay, 0.7, r * 0.8), tail, { soft: 0, light: 0 });
  const slug = capsuleIn(ax, ay, to[0] - ux * r, to[1] - uy * r, r);
  if (tail) iconOver(g, pen, slug, colour, { soft: 0 }); else iconPaint(g, pen, slug, colour, { soft: 0 });
  return g;
}

/**
 * A straight arrow from a tail point to a tip; its head may take a second colour, parted from the shaft by an ink line.
 * Arguments: g: the Surface; pen: from iconPen; options { from: [x, y], to: [x, y] (the tip), colour (the shaft), head (a colour for the head; default the shaft's),
 * shaft (width of the shaft, default 3), wide (width of the head, default 8.5), long (length of the head, default 6.5), notch (how far the back of the head is cut in, for barbs; default 0) }.
 */
export function iconArrow(g, pen, o = {}) {
  const { from, to, colour, head = null, shaft = 3, wide = 8.5, long = 6.5, notch = 0 } = o;
  if (!colour || !from || !to) throw new Error('iconArrow: needs from and to points and a colour');
  iconPaint(g, pen, signArrowIn(from[0], from[1], to[0], to[1], { shaft, head: wide, long, notch }), colour, { soft: 0 });
  if (head) {
    const dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1e-6, k = Math.max(0, L - long) / L;
    iconOver(g, pen, signArrowIn(from[0] + dx * k, from[1] + dy * k, to[0], to[1], { shaft: 0, head: wide, long, notch }), head, { soft: 0 });
  }
  return g;
}

/**
 * Speed lines: level bars that thin to a point at their left end, one for each entry of a list.
 * Arguments: g: the Surface; pen: from iconPen; options { lines: [[from x, to x, y], ...] (each line runs from its thin end to its full end, in local units), colour, thick (thickness at the full end, default 2.6) }.
 */
export function iconStreaks(g, pen, o = {}) {
  const { lines, colour, thick = 2.6 } = o;
  if (!colour || !Array.isArray(lines) || !lines.length) throw new Error('iconStreaks: needs a colour and a list of lines [from x, to x, y]');
  const h = thick / 2;
  iconPaint(g, pen, lines.map(([x0, x1, y]) => capsuleIn(x0 + 0.7, y, x1 - h, y, 0.7, h)), colour, { soft: 0 });
  return g;
}

/**
 * A hoop seen at an angle, whole or one half at a time, so that a thing can pass through it: paint the back half, then the thing, then the front half over it.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, x, y (centre, default 0, 0), rx, ry (outer radii, default 8 and 5), thick (width of the band, default 2.8),
 * half ('back': the upper half, 'front': the lower half, 'all'; default 'all'), over (true: paint it with iconOver, an ink line parting it from what is under it) }.
 */
export function iconHoop(g, pen, o = {}) {
  const { colour, x = 0, y = 0, rx = 8, ry = 5, thick = 2.8, half = 'all', over = false } = o;
  if (!colour) throw new Error('iconHoop: needs a colour');
  if (!['back', 'front', 'all'].includes(half)) throw new Error(`iconHoop: half "${half}" is not one of back, front, all`);
  const clip = half === 'all' ? undefined : half === 'back' ? (px, py) => py < y : (px, py) => py >= y;
  (over ? iconOver : iconPaint)(g, pen, signHoopIn(x, y, rx, ry, thick), colour, { soft: 0, clip });
  return g;
}

/**
 * A small wing swept back from a root: a leading edge rising from the root and blunt feathers streaming level behind it, the longest at the top, as on a messenger's boot or helmet.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, x, y (the root, default 0, 0), len (length of the leading edge, default 10), side (1: the feathers stream to the right, -1: to the left),
 * lift (radians the leading edge rises above level, default 1.25), sweep (radians the feathers lie back from the leading edge, default 1.1), reach (length of the top feather, default 0.7 of len), feathers (how many, default 3),
 * over (true: paint it with iconOver, an ink line parting it from what it grows from) }.
 */
export function iconWing(g, pen, o = {}) {
  const { colour, x = 0, y = 0, len = 10, side = 1, lift = 1.25, sweep = 1.1, feathers = 3, over = false } = o;
  if (!colour) throw new Error('iconWing: needs a colour');
  const reach = o.reach ?? len * 0.7, n = Math.max(1, Math.round(feathers)), r = Math.max(1.2, len * 0.14);
  const ux = side * Math.cos(lift), uy = -Math.sin(lift), fx = side * Math.cos(lift - sweep), fy = -Math.sin(lift - sweep);
  const tests = [capsuleIn(x, y, x + ux * len, y + uy * len, r * 1.15, r)];
  for (let i = 1; i <= n; i++) {
    const s = i / n, px = x + ux * len * s, py = y + uy * len * s, L = reach * (0.45 + 0.55 * s);
    tests.push(capsuleIn(px, py, px + fx * L, py + fy * L, r, r * 0.8));
  }
  (over ? iconOver : iconPaint)(g, pen, tests, colour, { soft: 0 });
  return g;
}

/**
 * A horseshoe magnet standing with its poles up: a thick bow with two straight arms, their ends in a second colour.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the bow), tips (the pole ends), thick (thickness of the bar, default 5.4), wide (width over all, default 18), tall (height over all, default 21), tip (length of a pole end, default 4.6) }.
 */
export function iconMagnet(g, pen, o = {}) {
  const { colour, tips, thick = 5.4, wide = 18, tall = 21, tip = 4.6 } = o;
  if (!colour || !tips) throw new Error('iconMagnet: needs colour and tips colours');
  const a = wide / 2, top = -tall / 2, cy = tall / 2 - a, ring = ringIn(0, cy, a, thick);
  const arms = (y1) => [boxIn(-a, top, -a + thick, y1), boxIn(a - thick, top, a, y1)];
  iconPaint(g, pen, [(px, py) => py >= cy && ring(px, py), ...arms(cy + 0.5)], colour, { soft: 0 });
  iconOver(g, pen, arms(top + tip), tips, { soft: 0 });
  return g;
}

/**
 * A cross-hair: a ring with four ticks standing out from it and, in the middle, a star or a dot of a second colour.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (ring and ticks), mark (a colour for the middle; default none), star (points of the middle star, default 4; 0: a round dot),
 * r (outer radius of the ring, default 8.8), thick (width of ring and ticks, default 2.5), reach (how far the ticks stand out from the ring, default 3.4) }.
 */
export function iconCrosshair(g, pen, o = {}) {
  const { colour, mark = null, star = 4, r = 8.8, thick = 2.5, reach = 3.4 } = o;
  if (!colour) throw new Error('iconCrosshair: needs a colour');
  const h = thick / 2, a = r - thick * 0.6, b = r + reach, m = r - thick - 1.2;
  iconPaint(g, pen, [ringIn(0, 0, r, thick), boxIn(-h, -b, h, -a), boxIn(-h, a, h, b), boxIn(-b, -h, -a, h), boxIn(a, -h, b, h)], colour, { soft: 0 });
  if (mark && m > 1) iconPaint(g, pen, star ? signStarIn(0, 0, m, star, { inner: 0.36 }) : ellipseIn(0, 0, m * 0.6, m * 0.6), mark, { soft: 0, light: 0 });
  return g;
}

/**
 * A flat heart, alone or with a plus sign of a second colour on it, parted from it by an ink line: a life, health, healing.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, plus (a colour for the plus sign; default none: the heart alone), w, h (the heart's size, default 22 by 20),
 * style (a heart style of shapes.js, default 'classic'), at ([x, y] of the middle of the plus, default the middle of the heart's lobes), cross (the plus sign's size, default 9), thick (the width of its bars, default 2.5) }.
 */
export function iconHeart(g, pen, o = {}) {
  const { colour, plus = null, w = 22, h = 20, style = 'classic', at = [0, -1.4], cross = 9, thick = 2.5 } = o;
  if (!colour) throw new Error('iconHeart: needs a colour');
  iconPaint(g, pen, heartIn(0, 0, w, h, style), colour, { soft: 0 });
  if (plus) iconOver(g, pen, signCrossIn(at[0], at[1], cross, thick), plus, { soft: 0, light: 0 });
  return g;
}

// The tones of a gun: its metal, the darker furniture (grip, stock, pump) and the dark of gaps and window frames.
function gunTones(metal) {
  const M = typeof metal === 'string' ? ramp(metal) : metal;
  return { M, grip: { light: M.dark, base: M.dark, dark: M.deep, mid: M.dark }, gap: M.deep };
}
const FURNITURE = { soft: 0, light: 0 };

/**
 * A chunky sidearm lying on its side, muzzle to the right: a slab of a slide with sights, a short barrel, a raked grip, a trigger guard and a lit cell under the barrel.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, glow (the lit cell) (colours) }.
 */
export function iconPistol(g, pen, o = {}) {
  const { metal, glow } = o;
  if (!metal || !glow) throw new Error('iconPistol: needs metal and glow colours');
  const { M, grip } = gunTones(metal);
  iconPaint(g, pen, polyIn([[-7.6, -1.6], [-1.6, -1.6], [-3.6, 8], [-9.6, 8]]), grip, FURNITURE);
  iconPaint(g, pen, boxIn(-2, -1.6, 3.6, 3.6), grip, { ...FURNITURE, minus: boxIn(-3, -2, 2, 2) });
  iconPaint(g, pen, boxIn(3, -1.6, 7.6, 2.2), glow, { flat: true });
  iconPaint(g, pen, [boxIn(-8.8, -6.8, 7.8, -1.2), boxIn(7.8, -5.8, 10.6, -2.2), boxIn(-8.4, -8.4, -5.8, -6.8), boxIn(5, -7.8, 6.8, -6.8)], M, { soft: 1 });
  iconPaint(g, pen, boxIn(9.2, -5.8, 10.6, -2.2), grip, FURNITURE);
  iconLine(g, pen, [[-6.8, -3.1], [5.4, -3.1]], M.dark, { over: true });
  iconGlint(g, pen, -3, -6.2, { len: 1, dot: false });
  return g;
}

/**
 * A sawn-off scatter gun lying on its side, muzzles to the right: two fat barrels one over the other under a flared muzzle band, a pump beneath them, a short receiver with a lit dot and a trigger guard, and a grip that curls down behind it.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, glow (the lit dot) (colours) }.
 */
export function iconShotgun(g, pen, o = {}) {
  const { metal, glow } = o;
  if (!metal || !glow) throw new Error('iconShotgun: needs metal and glow colours');
  const { M, grip, gap } = gunTones(metal);
  iconPaint(g, pen, polyIn([[-6.6, -4.4], [-9.2, -3.2], [-11.5, 1.6], [-11.5, 7.2], [-8.2, 7.2], [-7, 3.4], [-4.6, 1.6]]), grip, FURNITURE);
  iconPaint(g, pen, boxIn(-5, 1.6, -1.4, 4.6), grip, { ...FURNITURE, minus: boxIn(-4, 1, -2.4, 3.3) });
  iconPaint(g, pen, boxIn(0.6, 1.4, 7.4, 4.2), grip, FURNITURE);
  iconPaint(g, pen, [boxIn(-7.2, -5, -2, 2), boxIn(-2, -5.6, 11.5, 1.6), boxIn(8.8, -7, 11.5, 3)], M, { soft: 1 });
  iconLine(g, pen, [[-1.2, -2.1], [9, -2.1]], gap, { over: true });
  iconPaint(g, pen, boxIn(-5.8, -3.4, -3.4, -1), glow, { flat: true, rim: gap });
  iconGlint(g, pen, 4, -5, { len: 1, dot: false });
  return g;
}

/**
 * A beam gun lying on its side, emitter to the right: a stock and a housing with a lit cell window, a grip, and a thin emitter rod carrying three rings that get smaller towards the tip.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, glow (the cell window) (colours) }. Returns { tip: [x, y] } (the end of the rod, for a light drawn after the outline) in local units.
 */
export function iconBeamGun(g, pen, o = {}) {
  const { metal, glow } = o;
  if (!metal || !glow) throw new Error('iconBeamGun: needs metal and glow colours');
  const { M, grip, gap } = gunTones(metal);
  iconPaint(g, pen, polyIn([[-11.5, -2.6], [-8.2, -3], [-8.2, 2.2], [-11.5, 3.8]]), grip, FURNITURE);
  iconPaint(g, pen, polyIn([[-7.2, 2.6], [-3.8, 2.6], [-5.4, 7.6], [-8.8, 7.6]]), grip, FURNITURE);
  iconPaint(g, pen, boxIn(-1.8, -2.3, 10.2, 0.5), grip, FURNITURE);
  iconPaint(g, pen, boxIn(-8.8, -4.8, -1.6, 2.8), M, { soft: 1 });
  iconPaint(g, pen, [boxIn(0, -4.8, 2, 3), boxIn(3.6, -4.1, 5.4, 2.3), boxIn(7, -3.4, 8.6, 1.6)], M, { soft: 0 });
  iconPaint(g, pen, boxIn(-7.2, -3.2, -3.2, -0.6), glow, { flat: true, rim: gap });
  return { tip: [10.9, -0.9] };
}

/**
 * A rocket launcher lying on its side, mouth to the right: a fat tube with a flared exhaust bell, a collar at the mouth with the nose of a rocket showing, a sight on top, two grips, and an optional warning band.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, glow (the rocket's nose) (colours), mark (a colour: a warning band round the tube; default none) }.
 */
export function iconLauncher(g, pen, o = {}) {
  const { metal, glow, mark = null } = o;
  if (!metal || !glow) throw new Error('iconLauncher: needs metal and glow colours');
  const { M, grip } = gunTones(metal), tube = boxIn(-7.8, -5.2, 6.4, 2);
  const bell = polyIn([[-7.6, -5.2], [-11.5, -7.4], [-11.5, 4.2], [-7.6, 2]]);
  iconPaint(g, pen, polyIn([[-0.6, 2], [2.8, 2], [1.4, 7.2], [-2, 7.2]]), grip, FURNITURE);
  iconPaint(g, pen, polyIn([[-6.4, 2], [-3.4, 2], [-4.4, 5], [-7.4, 5]]), grip, FURNITURE);
  iconPaint(g, pen, boxIn(-1.8, -8, 1.4, -5.2), grip, FURNITURE);
  iconPaint(g, pen, [tube, bell, boxIn(5, -6, 7.4, 2.8)], M, { soft: 1 });
  iconPaint(g, pen, bell, grip, { flat: true, clip: boxIn(-12, -8, -9.8, 5) });
  if (mark) iconPaint(g, pen, boxIn(-5.4, -5.2, -2.6, 2), mark, { flat: true, rim: M.dark, clip: tube });
  iconOver(g, pen, [polyIn([[7.4, -4.4], [9.2, -4], [11.5, -1.6], [9.2, 0.8], [7.4, 1.2]])], glow, { flat: true });
  iconGlint(g, pen, 2, -4.6, { len: 1, dot: false });
  return g;
}

/**
 * Curved blades circling a hub: each a claw that tapers from a blunt heel to a point along a lit cutting edge, round a small hub with a lit middle.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, glow (the cutting edges and the hub's middle) (colours), blades (how many, 2 to 5, default 3), r (radius to the cutting edge, default 11.4),
 * wide (width of a blade at its heel, default 5.4), sweep (the share of its turn each blade covers, default 0.74), turn (radians clockwise, default 0: a heel straight up) }. Returns { core: [0, 0] }.
 */
export function iconBlades(g, pen, o = {}) {
  const { metal, glow, blades = 3, r = 11.4, wide = 5.4, sweep = 0.74, turn = 0 } = o;
  if (!metal || !glow) throw new Error('iconBlades: needs metal and glow colours');
  const { M, gap } = gunTones(metal), n = Math.max(2, Math.min(5, Math.round(blades))), step = (Math.PI * 2) / n, span = step * sweep;
  const edge = (px, py) => px * px + py * py > (r - 1.6) ** 2;
  for (let i = 0; i < n; i++) {
    const a0 = turn + i * step, pts = [], at = (u, d) => [Math.sin(a0 + span * u) * d, -Math.cos(a0 + span * u) * d];
    for (let k = 0; k <= 8; k++) pts.push(at(k / 8, r));
    for (let k = 7; k >= 0; k--) pts.push(at(k / 8, r - wide * Math.sqrt(1 - k / 8)));
    iconPaint(g, pen, polyIn(pts), M, { soft: 0 });
    iconPaint(g, pen, polyIn(pts), glow, { flat: true, clip: edge });
  }
  iconPaint(g, pen, ellipseIn(0, 0, 4.3, 4.3), M, { soft: 0 });
  iconPaint(g, pen, ellipseIn(0, 0, 2.3, 2.3), glow, { flat: true, rim: gap });
  return { core: [0, 0] };
}

/**
 * A disc mine seen a little from above: a low drum with contact prongs at its sides and two feet, a lamp on top, and optional warning stripes round its wall.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, glow (the lamp) (colours), mark (a colour: slanted warning stripes on the wall; default none) }. Returns { lamp: [x, y] } (the top of the lamp) in local units.
 */
export function iconMine(g, pen, o = {}) {
  const { metal, glow, mark = null } = o;
  if (!metal || !glow) throw new Error('iconMine: needs metal and glow colours');
  const { M, grip } = gunTones(metal), top = ellipseIn(0, 0.8, 9.8, 4.5), wall = [ellipseIn(0, 5.2, 9.8, 4.5), boxIn(-9.8, 0.8, 9.8, 5.2)];
  iconPaint(g, pen, [polyIn([[-11.8, 2], [-8.6, 0.8], [-8.6, 5.2], [-11.8, 4]]), polyIn([[11.8, 2], [8.6, 0.8], [8.6, 5.2], [11.8, 4]]), boxIn(-5.6, 7.4, -3.2, 10.6), boxIn(3.2, 7.4, 5.6, 10.6)], grip, FURNITURE);
  iconPaint(g, pen, wall, grip, FURNITURE);
  if (mark) iconPaint(g, pen, [-8.2, -2.6, 3].map((x) => polyIn([[x, 10.5], [x + 2.4, 10.5], [x + 5, 0], [x + 2.6, 0]])), mark, { flat: true, minus: top, clip: (px, py) => wall[0](px, py) || wall[1](px, py) });
  iconPaint(g, pen, top, M, { soft: 1 });
  iconPaint(g, pen, ellipseIn(0, 0.6, 4.8, 2.4), grip, { flat: true });
  iconOver(g, pen, ellipseIn(0, -1.8, 2.9, 2.6), glow, { flat: true });
  return { lamp: [0, -3.2] };
}
