// Icon generators (docs/data-sprites.md 3.3, family "icon"): the icon pen, shading and fit of engine/icons.js, so an
// icon set is data. An icon is written UPRIGHT in its own space ((0, 0) its middle, y down, one unit about a pixel) as
// a list of bodies (icon.paint@1), creases (icon.line@1) and glints (icon.glint@1), each a list of plain shapes; the
// pen turns, scales and centres the SHAPE TESTS (engine/shapes.js placedIn), and every pixel is sampled at its centre
// with a hard edge, so light keeps coming from the top right whatever the lean. icon.fit@1 does what iconFit does:
// it scales the icon until its longer side, outline included, is what the Size slider asks for, takes the pimples off
// round shapes (iconTidy) and centres it in the frame, all from the shapes themselves: no drawn pixel is read back.
// Built by B8 for icons-food; ports of engine/icons.js iconPen, iconPaint, iconLine, iconGlint, iconFit, iconTidy.
//
//   { "gen": "icon.fit", "v": 1, "size": { "from": "size", "map": [[0, 0], [1, 1]] }, "turn": 26.57, "draw": [
//       { "gen": "icon.paint", "v": 1, "shapes": [{ "kind": "ellipse", "at": [1.5, 0], "r": [9.6, 5.4] }], "paint": "body", "soft": 1 },
//       { "gen": "icon.line", "v": 1, "path": [4.4, -3.6, 3.6, 0, 4.4, 3.4], "paint": "body.dark", "over": true },
//       { "gen": "icon.glint", "v": 1, "at": [1, -3.6], "len": 1, "dot": false, "paint": "shine" } ] }
import { defineGenerator } from './registry.js';
import { point, px, count, angle, share, flag, paint, primitives, profile } from './args.js';
import { Pixels, toneOf, mixOf, tidied, tilesFor, workCost, shapeTest, unclipped } from './pixels.js';
import { SHAPE_CAPS } from './args.js';
import { LEAF_POINTS } from './shape.js';
import { placedIn } from '../shapes.js';

const RAD = Math.PI / 180;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The pen arguments every icon generator takes; icon.fit@1 sets them on each call it fits. */
export const ICON_PEN_ARGS = Object.freeze(['centre', 'scale', 'turn', 'soften', 'shiny']);

const penArgs = () => ({
  centre: point({ default: [16, 16], about: 'Where the middle of the icon goes, in frame pixels' }),
  scale: px(0.1, 4, { default: 1, about: 'Pixels per unit (icon.fit sets it)' }),
  turn: angle({ default: 0, about: 'Degrees the icon leans clockwise (icon.fit sets it)' }),
  zoom: px(0.25, 4, { default: 1, about: 'Extra scale for this part (the food shapes are drawn 1.2 to 1.3 times up)' }),
  soften: flag({ default: true, about: 'The second, softer shadow tone (the Extra shading control; icon.fit sets it)' }),
  shiny: flag({ default: true, about: 'Highlight bands and glints (the Shine control; icon.fit sets it)' }),
});

/** The pen of engine/icons.js iconPen at these arguments: at(test) puts a local shape test in the frame, pt(x, y) a local point. */
function penOf(a) {
  const [cx, cy] = a.centre, k = a.scale * a.zoom, t = a.turn * RAD;
  const c = Math.cos(t), s = Math.sin(t);
  return { k, cx, cy, at: (test) => placedIn(test, cx, cy, { angle: t, sx: k }), pt: (x, y) => [cx + k * (x * c - y * s), cy + k * (x * s + y * c)] };
}

/**
 * The most pixels across an icon pen draws: every icon generator draws only inside a box this many pixels square
 * centred on its pen's centre (and inside the frame), so one call never holds more stamp pixels than a frame may
 * (SHAPE_CAPS.stampPixels) and the pixels it scans are bounded whatever its scale (docs/data-sprites.md 3.4 rule 2).
 */
export const PEN_ROOM = 90;

/** The frame box a pen can reach (local units within 32 of the middle, or the local box [u0, v0, u1, v1] given), cut to the pen's room and the frame: a Pixels grid over it. */
function gridFor(a, ctx, box = [-32, -32, 32, 32]) {
  const P = penOf(a), [W, H] = ctx.size;
  const [u0, v0, u1, v1] = box.map((v) => Math.max(-32, Math.min(32, v)));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) {
    const [x, y] = P.pt(u, v);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const rx = Math.floor(P.cx - PEN_ROOM / 2), ry = Math.floor(P.cy - PEN_ROOM / 2);
  const ax = Math.max(0, rx, Math.floor(x0)), ay = Math.max(0, ry, Math.floor(y0));
  const bx = Math.min(W, rx + PEN_ROOM, Math.ceil(x1) + 1), by = Math.min(H, ry + PEN_ROOM, Math.ceil(y1) + 1);
  return new Pixels(ax, ay, Math.max(0, bx - ax), Math.max(0, by - ay));
}

// ---- what an icon call costs (docs/data-sprites.md 3.4 rule 2) -------------------------------------------------------
// A pixel generator's run time is the pixels it visits times the shape tests it makes at each, so its cost charges
// that work (pixels.js workCost) as well as the stamps it returns. Everything here is an upper bound read from the
// call as written: a value that is not a plain number yet (a binding inside a shape) is taken at its worst.

/** Shape tests one point of an icon body costs for a list of shapes: a polygon its points, a leaf@1 call its polygon, taper@1 one, another call its cost times the most points a polygon may have. */
function testsIn(list, costOf) {
  let n = 0;
  for (const p of Array.isArray(list) ? list : []) {
    if (!isObj(p)) continue;
    if (Object.hasOwn(p, 'gen')) {
      n += p.gen === 'taper' && p.v === 1 ? 1 : p.gen === 'leaf' && p.v === 1 ? LEAF_POINTS : Math.max(1, costOf(p)) * SHAPE_CAPS.polyPoints;
    } else n += p.kind === 'poly' && Array.isArray(p.points) ? p.points.length : 1;
  }
  return n;
}
/** The registry cost of the nested generator calls in some lists of shapes (each is run once). */
const callsIn = (lists, costOf) => lists.reduce((n, list) => n + (Array.isArray(list) ? list : []).filter((p) => isObj(p) && Object.hasOwn(p, 'gen')).reduce((m, p) => m + Math.max(1, costOf(p)), 0), 0);
/** The pixels round icon.paint@1's box whose answers its bands can ask for: dark and soft bands at most 3 + 3 deep, light 2. */
const PAINT_MARGIN = 6;
/** Shape tests icon.paint@1 makes over a box `side` pixels square: the body (with its cut-outs) once at each pixel of the box and its margin and once more moved by `edge`, the `within` list once a pixel of the box (a test there is dearer: four), and the pixel itself. */
const paintTests = (a, costOf, side) => (side + 2 * PAINT_MARGIN) ** 2 * (2 * (testsIn(a.shapes, costOf) + testsIn(a.minus, costOf)) + 2) + side * side * (4 * testsIn(a.within, costOf) + 3);
const num = (v, worst) => (fin(v) ? v : worst);
/** The local box [u0, v0, u1, v1] a list of shapes covers (a leaf or taper call from its ends, any other call or a value not yet a number: the whole 64-unit square). */
function boxIn(list) {
  const all = [-32, -32, 32, 32];
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const p of Array.isArray(list) ? list : []) {
    if (!isObj(p)) continue;
    let b = null;
    try {
      if (Object.hasOwn(p, 'gen')) {
        const R = p.gen === 'leaf' ? num(p.width, 64) / 2 : p.gen === 'taper' ? Math.max(num(p.r0, 32), num(p.r1, 32)) : NaN;
        if (fin(R) && Array.isArray(p.from) && Array.isArray(p.to)) b = [Math.min(p.from[0], p.to[0]) - R, Math.min(p.from[1], p.to[1]) - R, Math.max(p.from[0], p.to[0]) + R, Math.max(p.from[1], p.to[1]) + R];
      } else b = boxOf(p);
    } catch { b = null; }
    if (!b || !b.every(fin)) return all;
    u0 = Math.min(u0, b[0]); v0 = Math.min(v0, b[1]); u1 = Math.max(u1, b[2]); v1 = Math.max(v1, b[3]);
  }
  return u0 === Infinity ? [0, 0, 0, 0] : [u0, v0, u1, v1].map((v) => Math.max(-32, Math.min(32, v)));
}
/** The side, in pixels, of a square holding every pixel a pen at scale k can paint for a local box, whatever its turn: at most PEN_ROOM. */
const sideFor = (box, k) => Math.min(PEN_ROOM, Math.hypot(box[2] - box[0], box[3] - box[1]) * k + 6);
/** Pixels per unit of a pen, at its worst when the call does not say yet. */
const kOf = (a) => num(a.scale, 4) * num(a.zoom, 4);
/** The work of icon.line@1's steps along a path at scale k: each segment's length in pixels and two (at most 4,096 a segment), four tests a step (a step paints a pixel). */
function lineSteps(path, k) {
  let n = 0;
  if (!Array.isArray(path)) return 0;
  for (let i = 0; i + 3 < path.length; i += 2) n += Math.min(4096, Math.hypot(num(path[i + 2], 640) - num(path[i], -640), num(path[i + 3], 640) - num(path[i + 1], -640)) * k + 2);
  return 4 * n;
}
const pair = (v) => (Array.isArray(v) ? v : [v, v]);
/** The local box [u0, v0, u1, v1] a plain shape covers, or null. */
function boxOf(p) {
  const pts = [];
  const r = (v) => Math.max(...pair(v ?? 1).map(Math.abs));
  switch (p.kind) {
    case 'ellipse': { const [rx, ry] = pair(p.r).map(Math.abs), R = p.turn ? Math.max(rx, ry) : 0; pts.push([p.at[0] - (R || rx), p.at[1] - (R || ry)], [p.at[0] + (R || rx), p.at[1] + (R || ry)]); break; }
    case 'poly': pts.push(...p.points); break;
    case 'capsule': case 'limb': { const R = p.kind === 'limb' ? (p.width ?? 1) / 2 : r(p.r); for (const q of [p.from, p.to]) pts.push([q[0] - R, q[1] - R], [q[0] + R, q[1] + R]); break; }
    case 'rect': pts.push(p.at, [p.at[0] + p.size[0], p.at[1] + p.size[1]]); break;
    default: return null;
  }
  return [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
}
/** Shape tests of a list of shapes and calls to shape generators (leaf@1), each call run through the registry; box (optional) grows to cover them. */
function testsOf(list, ctx, call, box = null) {
  const out = [];
  const add = (p) => {
    const t = shapeTest(p);
    if (!t) return;
    out.push(t);
    const b = box && boxOf(p);
    if (b) { box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1]); box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3]); }
  };
  for (const item of list) {
    if (isObj(item) && Object.hasOwn(item, 'gen')) { for (const p of call(item, ctx)) add(p); continue; }
    add(item);
  }
  return out;
}

/**
 * icon.paint@1: one body of an icon, painted as engine/icons.js iconPaint paints it through the pen: the shapes joined
 * (less `minus`, kept inside `within` when given), a dark band `dark` pixels deep away from the light, a softer second
 * tone `soft` pixels further in while the pen's `soften` is on, a highlight band `lit` deep on the lit side while its
 * `shiny` is on; `flat` paints one colour. `edge` keeps only the pixels whose neighbour that way is outside (a dimple's
 * rim: [0, 1]). Shapes are ellipse, poly, capsule, rect, limb and calls to shape generators (leaf@1), in the icon's
 * own upright space, within 32 units of its middle; a shape's own paint is not used (the call's is). Returns stamps.
 */
export const iconPaint = defineGenerator({
  id: 'icon.paint', v: 1, family: 'icon',
  about: 'One body of an icon: shapes written upright, turned and scaled by the icon pen and shaded the icon way.',
  args: {
    shapes: primitives({ about: 'The body: ellipse, poly, capsule, rect, limb, or calls to shape generators' }),
    minus: primitives({ default: [], about: 'Shapes cut out of the body' }),
    within: primitives({ default: [], about: 'Paint only inside these shapes (none: everywhere)' }),
    paint: paint({ about: 'Its colour (its ramp gives the dark, soft and light tones)' }),
    dark: count(0, 3, { default: 1, about: 'How many pixels deep the dark band away from the light is' }),
    soft: count(0, 3, { default: 2, about: 'How deep the softer second tone inside the dark band is' }),
    lit: count(0, 2, { default: 1, about: 'How many pixels deep the highlight band on the lit side is' }),
    flat: flag({ default: false, about: 'One colour, no bands' }),
    edge: point({ default: [0, 0], lo: -3, hi: 3, about: 'Keep only pixels whose neighbour this way is outside the body ([0, 0]: all)' }),
    ...penArgs(),
  },
  // what it returns (the stamps of a box at most PEN_ROOM square) and the shape tests it makes over that box
  cost: (a, { costOf }) => {
    const side = sideFor(boxIn(a.shapes), kOf(a));
    return Math.max(tilesFor(side, side), workCost(paintTests(a, costOf, side))) + callsIn([a.shapes, a.minus, a.within], costOf);
  },
  run: (a, ctx, { call }) => paintRun(a, ctx, call),
});

/** icon.paint@1's drawing (see there), also run directly by icon.fit@1 on each pass. */
function paintRun(a, ctx, call) {
  const P = penOf(a), box = [Infinity, Infinity, -Infinity, -Infinity];
  const list = testsOf(a.shapes, ctx, call, box).map(P.at);
  if (!list.length) return [];
  // only the box the shapes cover (a pixel more each way) can be painted
  const g = gridFor(a, ctx, [box[0] - 1 / P.k, box[1] - 1 / P.k, box[2] + 1 / P.k, box[3] + 1 / P.k]);
  if (!g.w || !g.h) return [];
  const minus = testsOf(a.minus, ctx, call).map(P.at), clips = testsOf(a.within, ctx, call).map(P.at);
  const body = (x, y) => { for (const m of minus) if (m(x, y)) return false; for (const f of list) if (f(x, y)) return true; return false; };
  // The body is asked at pixel centres only (the bands are whole pixels deep), so each answer is kept: once per pixel
  // of the grid and a margin of PAINT_MARGIN, and once more at the pixel centre moved by `edge`.
  const M = PAINT_MARGIN, CW = g.w + 2 * M, cx0 = g.x0 - M, cy0 = g.y0 - M;
  const [ex, ey] = a.edge;
  const at0 = new Int8Array(CW * (g.h + 2 * M)), atE = ex || ey ? new Int8Array(at0.length) : null;
  const inside = (x, y) => {
    const i = (y - cy0) * CW + (x - cx0);
    let v = at0[i];
    if (!v) v = at0[i] = body(x + 0.5, y + 0.5) ? 1 : 2;
    if (v === 2 || !atE) return v === 1;
    let e = atE[i];
    if (!e) e = atE[i] = body(x + 0.5 + ex, y + 0.5 + ey) ? 1 : 2;
    return e === 2;
  };
  const clip = clips.length ? (x, y) => clips.some((f) => f(x, y)) : null;
  const dark = toneOf(a.paint, 'dark'), lite = toneOf(a.paint, 'light'), mid = mixOf(a.paint, dark, 0.5);
  const ids = new Map();
  const idOf = (ref) => { if (!ids.has(ref)) ids.set(ref, g.id(ref)); return ids.get(ref); };
  const [sx, sy] = g.shadow;
  const D = a.flat ? 0 : a.dark, soft = a.flat || !a.soften ? 0 : a.soft, hi = a.flat || !a.shiny ? 0 : a.lit;
  for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) {
    if (!inside(x, y) || (clip && !clip(x + 0.5, y + 0.5))) continue;
    let c = a.paint;
    if (D && !inside(x + sx * D, y + sy * D)) c = dark;
    else if (soft && !inside(x + sx * (D + soft), y + sy * (D + soft))) c = mid;
    else if (hi && !inside(x - sx * hi, y - sy * hi)) c = lite;
    g.setId(x, y, idOf(c));
  }
  return g.stamps();
}

/**
 * icon.line@1: a 1 px crease, fold or string through points written in the icon's own space (path: x0, y0, x1, y1,
 * ...), one pixel wide at every size: engine/icons.js iconLine. `over`: inside icon.fit, only pixels already painted
 * are recoloured, so a crease never pokes out of its body. Returns stamps.
 */
export const iconLine = defineGenerator({
  id: 'icon.line', v: 1, family: 'icon',
  about: 'A one-pixel crease, fold or string through points written in the icon\'s own space.',
  args: {
    path: profile({ about: 'The points, x then y each: two points or more' }),
    paint: paint({ about: 'Its colour' }),
    over: flag({ default: false, about: 'Inside icon.fit: only recolour pixels already painted' }),
    ...penArgs(),
  },
  // its stamps (a box at most PEN_ROOM square), the box it scans and the steps along its path
  cost: (a) => {
    const side = sideFor([-32, -32, 32, 32], kOf(a));
    return Math.max(tilesFor(side, side), workCost(3 * side * side + lineSteps(a.path, kOf(a))));
  },
  run: (a, ctx) => lineRun(a, ctx),
});

/** icon.line@1's drawing (see there), also run directly by icon.fit@1 on each pass. */
function lineRun(a, ctx) {
  const P = penOf(a), g = gridFor(a, ctx), pts = [];
  if (!Array.isArray(a.path)) return [];
  for (let i = 0; i + 1 < a.path.length; i += 2) pts.push([a.path[i], a.path[i + 1]]);
  for (let i = 0; i + 1 < pts.length; i++) {
    let [x0, y0] = P.pt(...pts[i]).map(Math.floor);
    const [x1, y1] = P.pt(...pts[i + 1]).map(Math.floor);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    for (let err = dx + dy, n = 0; n < 4096; n++) {
      g.set(x0, y0, a.paint);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  return g.stamps();
}

/**
 * icon.glint@1: the white glint of glass, metal, a gem or a fruit at a point of the icon's own space, drawn while the
 * pen's `shiny` is on: a short upright stroke `len` pixels long and, below it to the left, one separate pixel (`dot`),
 * as engine/icons.js iconGlint; or with `corner` the three-pixel corner of engine/food.js (the point, the pixel right of
 * it and the one below). `over` (default on): inside icon.fit, only on pixels already painted. Returns one stamp.
 */
export const iconGlint = defineGenerator({
  id: 'icon.glint', v: 1, family: 'icon',
  about: 'The glint of glass, metal or fruit: a short stroke and a pixel, or a three-pixel corner, while Shine is on.',
  args: {
    at: point({ lo: -32, hi: 32, about: 'Where the top of the stroke goes, in the icon\'s own space' }),
    len: count(1, 4, { default: 2, about: 'Pixels in the stroke' }),
    dot: flag({ default: true, about: 'One separate pixel below it to the left' }),
    corner: flag({ default: false, about: 'Three pixels in a corner instead (fruit)' }),
    over: flag({ default: true, about: 'Inside icon.fit: only on pixels already painted' }),
    paint: paint({ about: 'Its colour (white: a "shine" slot)' }),
    ...penArgs(),
  },
  cost: () => 1,
  run: (a, ctx) => glintRun(a, ctx),
});

/** icon.glint@1's drawing (see there), also run directly by icon.fit@1 on each pass. */
function glintRun(a, ctx) {
  if (!a.shiny) return [];
  const [fx, fy] = penOf(a).pt(a.at[0], a.at[1]), X = Math.floor(fx), Y = Math.floor(fy);
  const g = new Pixels(X - 2, Y - 1, 6, 8);
  if (a.corner) { g.set(X, Y, a.paint); g.set(X + 1, Y, a.paint); g.set(X, Y + 1, a.paint); }
  else {
    for (let i = 0; i < a.len; i++) g.set(X, Y + i, a.paint);
    if (a.dot) g.set(X - 1, Y + a.len + 1, a.paint);
  }
  const [W, H] = ctx.size;
  const cut = g.blank();
  for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) if (x >= 0 && y >= 0 && x < W && y < H && g.has(x, y)) cut.set(x, y, g.get(x, y));
  return cut.stamps();
}

/** True when an icon.fit item paints only over what is painted (icon.line with over; icon.glint unless over is false). */
const overOnly = (item) => (item.over === undefined ? item.gen === 'icon.glint' : item.over === true);

/** How many times icon.fit@1 may draw its list while it searches for the scale (engine/icons.js iconFit). */
export const FIT_PASSES = 6;

/** The box, in pixels, icon.fit@1 draws in, centred in the frame: the longest side it can ask for and 8 more, at most PEN_ROOM (a pass that overshoots is cut there, and is still seen to be too big). */
const fitRoom = (a) => Math.min(PEN_ROOM, Math.ceil(Math.max(num(a.span?.[0], 32), num(a.span?.[1], 32))) + 8);

/** The icon generators icon.fit@1 runs itself on each pass (its arguments were checked with the fit's): id -> [entry, run]. */
const DIRECT = new Map([['icon.paint', [iconPaint, (a, c, call) => paintRun(a, c, call)]], ['icon.line', [iconLine, (a, c) => lineRun(a, c)]], ['icon.glint', [iconGlint, (a, c) => glintRun(a, c)]]]);

/** A call's arguments with its generator's defaults filled and the pen's set on top. */
function argsOf(entry, item, pen) {
  const out = {};
  for (const [k, t] of Object.entries(entry.args)) out[k] = Object.hasOwn(item, k) ? item[k] : t.default;
  return Object.assign(out, pen);
}

/**
 * icon.fit@1: an icon fitted to its box, as engine/icons.js iconFit: the calls of `draw` (icon.paint, icon.line,
 * icon.glint, in order, each over what came before) are drawn with the pen at a scale searched until the icon's longer
 * side, its outline included, is round((span[0] + (span[1] - span[0]) * size) * fill) pixels; the pimples round shapes
 * grow are taken off (`tidy`, iconTidy); it is centred in the frame. `turn` is its lean when `tilt` is on; `soften` and
 * `shiny` are set on every call. It draws in a box its longest side plus 8 pixels square (at most PEN_ROOM) round the frame's
 * middle, and its cost charges every pass (FIT_PASSES) over every item of its list. Returns the icon as stamps; draw
 * the outline after it.
 */
export const iconFit = defineGenerator({
  id: 'icon.fit', v: 1, family: 'icon',
  about: 'Fits an icon to its box: scaled until its longer side is what the Size slider asks for, tidied and centred.',
  args: {
    draw: primitives({ default: [], about: 'The icon: icon.paint, icon.line and icon.glint calls, in order (a pictures body\'s fit gets each picture\'s list)' }),
    size: share({ default: 0.5, about: 'Small to Big: the longer side from span[0] to span[1] pixels' }),
    fill: share({ default: 1, about: 'A share of that size, for an icon that should look smaller than the rest' }),
    span: point({ default: [20, 26], lo: 4, hi: 32, about: 'The longer side at Small and at Big, outline included' }),
    tilt: flag({ default: true, about: 'Lean it by `turn`' }),
    turn: angle({ default: 0, about: 'Its lean, degrees clockwise' }),
    soften: flag({ default: true, about: 'The second, softer shadow tone' }),
    shiny: flag({ default: true, about: 'Highlight bands and glints' }),
    tidy: flag({ default: true, about: 'Take the pimples off round shapes' }),
  },
  // its stamps (its box), and FIT_PASSES draws of its list: each item's shape tests over the box, merging it, tidying
  cost: (a, { costOf }) => {
    const room = fitRoom(a), area = room * room;
    let tests = 0, extra = 0;
    for (const item of Array.isArray(a.draw) ? a.draw : []) {
      tests += area;
      if (!isObj(item) || !Object.hasOwn(item, 'gen')) continue;
      if (item.v === 1 && item.gen === 'icon.paint') { tests += paintTests(item, costOf, room); extra += callsIn([item.shapes, item.minus, item.within], costOf); }
      else if (item.v === 1 && item.gen === 'icon.line') tests += 3 * area + lineSteps(item.path, 4 * num(item.zoom, 4));
      else if (item.v === 1 && item.gen === 'icon.glint') tests += 64;
      else extra += FIT_PASSES * Math.max(1, costOf(item));
    }
    return Math.max(tilesFor(room, room), workCost(FIT_PASSES * (tests + 14 * area))) + extra;
  },
  run(a, ctx, { call }) {
    const [W, H] = ctx.size, room = fitRoom(a), RW = Math.min(W, room), RH = Math.min(H, room);
    const inner = { ...ctx, size: [RW, RH] };
    const want = Math.max(4, Math.round((a.span[0] + (a.span[1] - a.span[0]) * clamp01(a.size)) * a.fill));
    const turn = a.tilt ? a.turn : 0;
    // the shape calls inside the bodies do not depend on the pen: each is run once
    const memo = new Map();
    const once = (node, c) => { const k = JSON.stringify(node); if (!memo.has(k)) memo.set(k, call(node, c)); return memo.get(k); };
    const draw = (scale) => {
      const g = new Pixels(0, 0, RW, RH);
      const pen = { centre: [RW / 2, RH / 2], scale, turn, soften: a.soften, shiny: a.shiny };
      for (const item of a.draw) {
        let prims;
        const direct = isObj(item) && item.v === 1 ? DIRECT.get(item.gen) : undefined;
        if (direct) prims = direct[1](argsOf(direct[0], item, pen), inner, once);
        else if (isObj(item) && Object.hasOwn(item, 'gen')) prims = call({ ...item, ...pen }, inner);
        else prims = [item];
        const over = isObj(item) && overOnly(item);
        for (const p of prims) {
          if (p.kind === 'dot') { if (!over || g.has(p.at[0], p.at[1])) g.set(p.at[0], p.at[1], p.paint); continue; }
          if (p.kind !== 'stamp') continue;
          const key = new Map(Object.entries(p.key).map(([ch, ref]) => [ch, g.id(ref)]));
          p.rows.forEach((row, j) => {
            for (let i = 0; i < row.length; i++) {
              const ch = row[i];
              if (ch === '.' || ch === ' ' || !key.has(ch)) continue;
              const x = p.at[0] + i, y = p.at[1] + j;
              if (!over || g.has(x, y)) g.setId(x, y, key.get(ch));
            }
          });
        }
      }
      return a.tidy ? tidied(g) : g;
    };
    let scale = (want - 2) / 22, best = null, lo = 0, hi = Infinity;
    for (let pass = 0; pass < FIT_PASSES; pass++) {
      const g = draw(Math.min(4, Math.max(0.1, scale)));
      const b = g.bounds();
      if (!b) return [];
      const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) + 2;
      if (!best || Math.abs(side - want) < Math.abs(best.side - want) || (Math.abs(side - want) === Math.abs(best.side - want) && side < best.side)) best = { g, b, side };
      if (side === want) break;
      if (side < want) lo = Math.max(lo, scale); else hi = Math.min(hi, scale);
      scale = lo > 0 && hi < Infinity ? (lo + hi) / 2 : (scale * (want - 1.5)) / (side - 1.5);
    }
    const { g, b } = best;
    const dx = Math.floor((W - (b.x1 - b.x0 + 3)) / 2) - (b.x0 - 1), dy = Math.floor((H - (b.y1 - b.y0 + 3)) / 2) - (b.y0 - 1);
    return g.stamps().slice(0, 9).map((s) => ({ ...s, at: [s.at[0] + dx, s.at[1] + dy] }));
  },
});

// ---- @2 of the pen's three generators: drawn whole at any coordinates (build item B10b) ---------------------------
// The @1 pen keeps to the frame (0 to its size), so an icon body, crease or glint whose pen centre is a node's origin
// lost what lay left of or above it. Each @2 runs its @1 drawing with the centre moved into the middle of the largest
// frame by whole pixels and moves the stamps back (pixels.js unclipped): the same pixels inside the frame, the rest kept.
// icon.fit@1 runs @1 items itself and lays out the whole frame; @2 items inside a fit are run as calls.
const centreMoved = (b, dx, dy) => ({ ...b, centre: [b.centre[0] + dx, b.centre[1] + dy] });

/** icon.paint@2: icon.paint@1's body (the same arguments and pixels inside the frame), drawn whole when its centre is a node's origin. */
export const iconPaint2 = defineGenerator({
  id: 'icon.paint', v: 2, family: 'icon',
  about: 'One body of an icon: shapes written upright, turned and scaled by the icon pen and shaded the icon way; drawn whole also centred on a node.',
  args: iconPaint.args,
  cost: (a, helpers) => iconPaint.cost(a, helpers),
  run: (a, ctx, { call }) => unclipped((b, c) => paintRun(b, c, call), a, ctx, a.centre, centreMoved),
});

/** icon.line@2: icon.line@1's crease (the same arguments and pixels inside the frame), drawn whole when its centre is a node's origin. */
export const iconLine2 = defineGenerator({
  id: 'icon.line', v: 2, family: 'icon',
  about: 'A one-pixel crease, fold or string through points written in the icon\'s own space; drawn whole also centred on a node.',
  args: iconLine.args,
  cost: (a) => iconLine.cost(a, {}),
  run: (a, ctx) => unclipped(lineRun, a, ctx, a.centre, centreMoved),
});

/** icon.glint@2: icon.glint@1's glint (the same arguments and pixels inside the frame), drawn whole when its centre is a node's origin. */
export const iconGlint2 = defineGenerator({
  id: 'icon.glint', v: 2, family: 'icon',
  about: 'The glint of glass, metal or fruit: a short stroke and a pixel, or a three-pixel corner, while Shine is on; drawn whole also centred on a node.',
  args: iconGlint.args,
  cost: (a) => iconGlint.cost(a, {}),
  run: (a, ctx) => unclipped(glintRun, a, ctx, a.centre, centreMoved),
});
