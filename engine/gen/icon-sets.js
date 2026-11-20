// Icon-set generators (migration batch M4; docs/data-sprites.md 3.3, family "icon": icon.plate, icon.slant, icon.rise):
// what the library icon sets still did in code once their shapes are data. Each is a port of engine/icons.js and
// draws through the same icon pen as icon.paint (engine/gen/icon.js): shapes written UPRIGHT in the icon's own space
// ((0, 0) its middle, y down, one unit about a pixel), turned, scaled and centred by the pen's centre, scale and turn.
//   icon.fitted@1  a whole icon as a sprite's render() drew one: its bodies (plain shapes, so a picture is ONE call:
//                  a sprite may name 64 calls in all), iconSlant or iconRise, iconTidy, outline(INK), then its lights
//                  with no ink line, fitted to its box as iconFit fits one (the ink line and lights measured as drawn)
//   icon.body@1    one body, as icon.paint@2, that can be drawn bold (iconBold) or with a dark band of its own colour
//   icon.rim@1     the 1 px line round a body (iconPaint's `rim`); with `over`, only on what is already painted: the
//                  parting line iconOver draws between a body and what it lies on
//   icon.flame@1   a small flame rising straight up the screen, rimmed with a darker tone, no ink line (iconFlame)
//   icon.plate@1   the backing plate behind an icon, a hexagon or a disc with its own ink line (iconPlate)
// Name icon.fitted in a picture's own draw list, with no body `fit` (icon.fit@1 adds an ink line it does not draw).
// Which fitter: icon.fit@1 (engine/gen/icon.js) for a NEW icon set, one body per generator call under the body's fit;
// icon.fitted@1 for a REDRAW of a code icon set that must keep its pixels (lights after the ink line, a plate, iconSlant
// or iconRise, Bold, iconFit's search measured on the ink line), one call per picture so a set stays under the 64-call
// cap. Give it room 32 (the frame iconFit drew in). Inside it, and in icon.body and icon.rim:
//   - a polygon of four corners on two rows and two columns is tested as a box is (engine/surface.js rectIn: left and
//     top edges in, right and bottom out), so a box the helpers drew lands on the same pixels;
//   - a hole with a `group` opens only the shapes of that group (a ring beside a solid shape, both one body);
//   - coordinates stay within 64 units of the middle (a definition keeps no more), so a half plane is a box or a
//     polygon some 40 units across, not 200.
// tallyWork counts the shape tests these generators make; tests/unit/gen-icon-sets.test.mjs holds each cost to it.
// Pure: no randomness, no clock; runs the same in the browser and in Node.
//
//   "pictures": { "coin": { "label": "Coin", "draw": [ { "gen": "icon.fitted", "v": 1, "turn": 13.28,
//       "size": { "from": "size", "map": [[0, 0], [1, 1]] }, "tilt": { "from": "tilt", "pick": { "true": true, "false": false } },
//       "draw": [ { "kind": "ellipse", "at": [0, 0], "r": [10, 9], "paint": "metal", "shade": 2 },
//                 { "kind": "line", "from": [-4, 0], "to": [4, 0], "paint": "metal.dark" },
//                 { "gen": "icon.glint", "v": 2, "at": [3, -6], "paint": "white" } ],
//       "lights": [ { "gen": "twinkle", "v": 1, "at": [8, -8], "size": 1, "paint": "metal", "core": "white" } ] } ] } }
import { defineGenerator } from './registry.js';
import { point, px, count, angle, share, word, flag, paint, primitives } from './args.js';
import { Pixels, toneOf, mixOf, tidied, tilesFor, workCost, shapeTest, unclipped } from './pixels.js';
import { SHAPE_CAPS } from './args.js';
import { PEN_ROOM } from './icon.js';
import { placedIn, hexIn } from '../shapes.js';
import { ellipseIn, polyIn, rectIn } from '../surface.js';

const RAD = Math.PI / 180;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v, worst) => (fin(v) ? v : worst);

/** The icon generators that draw through the pen: an icon.fitted@1 call hands them its pen (centre, scale, turn, soften, shiny). */
export const PEN_GENERATORS = Object.freeze(['icon.paint', 'icon.line', 'icon.glint', 'icon.body', 'icon.rim', 'icon.flame']);

const penArgs = () => ({
  centre: point({ default: [16, 16], about: 'Where the middle of the icon goes, in frame pixels' }),
  scale: px(0.1, 4, { default: 1, about: 'Pixels per unit (icon.fit sets it)' }),
  turn: angle({ default: 0, about: 'Degrees the icon leans clockwise (icon.fit sets it)' }),
  zoom: px(0.25, 4, { default: 1, about: 'Extra scale for this part' }),
  soften: flag({ default: true, about: 'The second, softer shadow tone (the Extra shading control; icon.fit sets it)' }),
  shiny: flag({ default: true, about: 'Highlight bands and glints (the Shine control; icon.fit sets it)' }),
});

// The shape tests made while tallyWork runs (null otherwise): what the costs below are held to (tests/unit/gen-icon-sets.test.mjs).
let tally = null;
/** A shape test that adds `w` (a polygon its points) to the tally while tallyWork runs; the test itself otherwise. */
const counted = (f, w = 1) => (tally && f ? (x, y) => { tally.tests += w; return f(x, y); } : f);
/** The weight of one shape in shape tests: a polygon its points, any other shape 1 (as the costs count them). */
const weightOf = (p) => (isObj(p) && p.kind === 'poly' && Array.isArray(p.points) ? p.points.length : 1);
/** Runs fn and gives the shape tests icon.fitted@1, icon.body@1 and icon.rim@1 made meanwhile (their costs must cover them). */
export function tallyWork(fn) {
  const was = tally;
  tally = { tests: 0 };
  try { fn(); return tally.tests; } finally { tally = was; }
}

/** The pen of engine/icons.js iconPen at these arguments: at(test) a local shape test in the frame, pt(x, y) a local point, k its scale. */
function penOf(a) {
  const [cx, cy] = a.centre, k = a.scale * a.zoom, t = a.turn * RAD;
  const c = Math.cos(t), s = Math.sin(t);
  return { k, cx, cy, at: (test) => placedIn(test, cx, cy, { angle: t, sx: k }), pt: (x, y) => [cx + k * (x * c - y * s), cy + k * (x * s + y * c)] };
}

/** A frame shape test grown by `by` pixels on every side, corners included, as engine/icons.js iconBold grows it. */
function grownTest(f, by) {
  const d = by * Math.SQRT1_2;
  if (by !== 0.5) return (px, py) => f(px, py) || f(px - by, py) || f(px + by, py) || f(px, py - by) || f(px, py + by) || f(px - d, py - d) || f(px + d, py - d) || f(px - d, py + d) || f(px + d, py + d);
  // bold (half a pixel): the four points along the axes lie on the edges between pixel centres, each shared with the
  // next pixel, so each is asked once, kept under a whole-number key (twice its coordinates: a small integer)
  const kept = new Map(), at = (x, y) => {
    const k = (Math.round(2 * x) + 8192) * 16384 + Math.round(2 * y) + 8192;
    let v = kept.get(k);
    if (v === undefined) { if (kept.size > 65536) kept.clear(); v = f(x, y) ? 1 : 0; kept.set(k, v); }
    return v === 1;
  };
  return (px, py) => f(px, py) || at(px - by, py) || at(px + by, py) || at(px, py - by) || at(px, py + by) || f(px - d, py - d) || f(px + d, py - d) || f(px - d, py + d) || f(px + d, py + d);
}
/** One test true where any of a list is (each shape grown on its own and then joined is the join grown: grow the join once). */
const anyOf = (list) => (list.length === 1 ? list[0] : (x, y) => { for (const f of list) if (f(x, y)) return true; return false; });
/** The frame box [x0, y0, x1, y1] a pen puts a local box in (its four corners placed), a hair wider, or null. */
function frameBoxOf(P, b) {
  if (!b) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]) { const [x, y] = P.pt(u, v); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0 - 1e-6, y0 - 1e-6, x1 + 1e-6, y1 + 1e-6];
}
/** One frame test of a list of local shapes: each shape asked only at points inside its own placed box (outside it, it cannot hold). */
function boxedAny(P, shapes) {
  const parts = [];
  for (const s of shapes) { const t = counted(iconShapeTest(s), weightOf(s)); if (t) parts.push({ f: P.at(t), b: frameBoxOf(P, boxOf(s)) }); }
  if (!parts.length) return null;
  const n = parts.length;
  return (x, y) => {
    if (tally) tally.tests += n;   // each box asked counts as a test
    for (const { f, b } of parts) { if (b && (x < b[0] || x > b[2] || y < b[1] || y > b[3])) continue; if (f(x, y)) return true; }
    return false;
  };
}
/** A list of frame tests grown by `by` as iconBold grows each: one grown test of their join (the same pixels, each point asked once), or the list itself when by is 0. */
const grownAll = (list, by) => (by > 0 && list.length ? [grownTest(anyOf(list), by)] : list);

/** Shape tests a pixel of a bold body (grown by half a pixel) costs for each of its own: the centre, the four points towards the corners and (shared with the next pixels, so asked once) two of the four along the axes. */
const GROWN_TESTS = 7;
/** Shape tests a point of a body costs for each of its own: 1 plain, GROWN_TESTS bold, all nine grown by any other amount (a cost must not fall as grow rises). */
const grownTests = (a) => (growArg(a) > 0 ? 9 : boldMaybe(a) ? GROWN_TESTS : 1);
/** Whether a body may be drawn bold, for its cost: bold is on, or not yet known (a bound flag's worst reads as 0, never false). */
const boldMaybe = (a) => a.bold !== undefined && a.bold !== false;
/** Its grow argument at its largest (2 while it is not yet a number). */
const growArg = (a) => (a.grow === undefined ? 0 : num(a.grow, 2));

const pairOf = (v) => (Array.isArray(v) ? v : [v, v]);
/** The local box [u0, v0, u1, v1] of one plain shape, or null (a call, or a kind with no box). */
function boxOf(p) {
  try {
    const pts = [];
    switch (p.kind) {
      case 'ellipse': { const [rx, ry] = pairOf(p.r).map(Math.abs), R = p.turn ? Math.max(rx, ry) : 0; pts.push([p.at[0] - (R || rx), p.at[1] - (R || ry)], [p.at[0] + (R || rx), p.at[1] + (R || ry)]); break; }
      case 'poly': pts.push(...p.points); break;
      case 'capsule': case 'limb': { const R = p.kind === 'limb' ? (p.width ?? 1) / 2 : Math.max(...pairOf(p.r ?? 1).map(Math.abs)); for (const q of [p.from, p.to]) pts.push([q[0] - R, q[1] - R], [q[0] + R, q[1] + R]); break; }
      case 'rect': pts.push(p.at, [p.at[0] + p.size[0], p.at[1] + p.size[1]]); break;
      default: return null;
    }
    const b = [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
    return b.every(fin) ? b : null;
  } catch { return null; }
}
/** The local box of a call to oval@1 or taper@1 (one shape each, its box read from its arguments), or null for any other call. */
function callBox(x) {
  if (x.gen === 'oval' && Array.isArray(x.at) && Array.isArray(x.r) && [...x.at, ...x.r].every(fin)) { const R = Math.max(...x.r); return [x.at[0] - R, x.at[1] - R, x.at[0] + R, x.at[1] + R]; }
  if (x.gen === 'taper' && Array.isArray(x.from) && Array.isArray(x.to) && [...x.from, ...x.to, x.r0].every(fin)) { const R = Math.max(x.r0, fin(x.r1) ? x.r1 : 0); return [Math.min(x.from[0], x.to[0]) - R, Math.min(x.from[1], x.to[1]) - R, Math.max(x.from[0], x.to[0]) + R, Math.max(x.from[1], x.to[1]) + R]; }
  return null;
}
/** The local box a list of shapes covers, within 32 units of the middle (a call or a shape not yet a number: the whole 64-unit square). */
function boxIn(list) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const p of Array.isArray(list) ? list : []) {
    if (!isObj(p)) continue;
    const b = Object.hasOwn(p, 'gen') ? callBox(p) : boxOf(p);
    if (!b) return [-32, -32, 32, 32];
    u0 = Math.min(u0, b[0]); v0 = Math.min(v0, b[1]); u1 = Math.max(u1, b[2]); v1 = Math.max(v1, b[3]);
  }
  return u0 === Infinity ? [0, 0, 0, 0] : [u0, v0, u1, v1].map((v) => Math.max(-32, Math.min(32, v)));
}
/** The side, in pixels, of a square holding every pixel a pen at scale k (grown by g) can paint for a local box, whatever its turn: at most PEN_ROOM. */
const sideFor = (box, k, g = 0) => Math.min(PEN_ROOM, Math.hypot(box[2] - box[0], box[3] - box[1]) * k + 6 + 2 * g);
/** The side, in pixels, of a square holding a local box at any turn at scale k, grown by g, with a pixel to spare each way: at most PEN_ROOM. */
function turnedSide(box, k, turn, g = 0) {
  // upright (an icon.fitted call whose tilt is off: no turn at all) its longer side; else at any turn (a cost must not
  // rise and fall as the turn grows) the box's diagonal
  const across = turn === 'upright' ? Math.max(box[2] - box[0], box[3] - box[1]) : Math.hypot(box[2] - box[0], box[3] - box[1]);
  return Math.min(PEN_ROOM, across * k + 2 * g + 4);
}
/** The margin round a body's box whose pixels its bands may ask about: the dark band, the soft tone and the lit band (at most 1 + 3 + 2) and one more. */
const BAND_MARGIN = 7;
const kOf = (a) => (a.scale === undefined ? 1 : num(a.scale, 4)) * (a.zoom === undefined ? 1 : num(a.zoom, 4));

/** A Pixels grid over the frame box a pen reaches for a local box (with `pad` pixels more each way), cut to the pen's room and the frame. */
function gridFor(P, ctx, box, pad) {
  const [W, H] = ctx.size;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]) {
    const [x, y] = P.pt(u, v);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const rx = Math.floor(P.cx - PEN_ROOM / 2), ry = Math.floor(P.cy - PEN_ROOM / 2);
  const ax = Math.max(0, rx, Math.floor(x0 - pad)), ay = Math.max(0, ry, Math.floor(y0 - pad));
  const bx = Math.min(W, rx + PEN_ROOM, Math.ceil(x1 + pad) + 1), by = Math.min(H, ry + PEN_ROOM, Math.ceil(y1 + pad) + 1);
  return new Pixels(ax, ay, Math.max(0, bx - ax), Math.max(0, by - ay));
}

/**
 * The test of one shape of an icon: as engine/gen/pixels.js shapeTest, except that a polygon of four corners on two
 * rows and two columns (a box a definition cannot write as a rect, its corners not whole pixels) is tested as
 * engine/surface.js rectIn tests a box: its left and top edges in, its right and bottom edges out, the far edges at
 * x0 + (x1 - x0) as engine/icons.js boxIn puts them. So a box the helpers drew lands on the same pixels, edge for edge.
 */
function iconShapeTest(p) {
  if (isObj(p) && p.kind === 'poly' && Array.isArray(p.points) && p.points.length === 4 && p.points.every((q) => Array.isArray(q) && fin(q[0]) && fin(q[1]))) {
    const xs = [...new Set(p.points.map((q) => q[0]))], ys = [...new Set(p.points.map((q) => q[1]))];
    const corners = new Set(p.points.map((q) => `${q[0]},${q[1]}`));
    if (xs.length === 2 && ys.length === 2 && corners.size === 4) {
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      return rectIn(x0, y0, x1 - x0, y1 - y0);
    }
  }
  return shapeTest(p);
}

/** Shape tests of a list of shapes and calls to shape generators (each call run through the registry). */
function testsOf(list, ctx, call) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (isObj(item) && Object.hasOwn(item, 'gen')) { for (const p of call(item, ctx)) { const t = iconShapeTest(p); if (t) out.push(counted(t, weightOf(p))); } continue; }
    const t = iconShapeTest(item);
    if (t) out.push(counted(t, weightOf(item)));
  }
  return out;
}

/** The plain shapes of a list, a shape generator's call run through the registry for its own. */
const shapesIn = (list, ctx, call) => (Array.isArray(list) ? list : []).flatMap((item) => (isObj(item) && Object.hasOwn(item, 'gen') ? call(item, ctx) : isObj(item) ? [item] : []));

/** The group of each test testsOf gives for a list (a call's group for every shape it gives), null where none. */
function groupsOf(list, ctx, call) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const g = isObj(item) && typeof item.group === 'string' ? item.group : null;
    if (isObj(item) && Object.hasOwn(item, 'gen')) { for (const p of call(item, ctx)) if (shapeTest(p)) out.push(g); continue; }
    if (shapeTest(item)) out.push(g);
  }
  return out;
}

/** Shape tests one point of a body costs for a list: a polygon its points, a call its cost times the most points a polygon may have. */
function testsIn(list, costOf) {
  let n = 0;
  for (const p of Array.isArray(list) ? list : []) {
    if (!isObj(p)) continue;
    if (Object.hasOwn(p, 'gen')) n += callBox(p) ? 1 : Math.max(1, costOf(p)) * SHAPE_CAPS.polyPoints;
    else n += p.kind === 'poly' && Array.isArray(p.points) ? p.points.length : 1;
  }
  return n;
}
const callsIn = (lists, costOf) => lists.reduce((n, list) => n + (Array.isArray(list) ? list : []).filter((p) => isObj(p) && Object.hasOwn(p, 'gen')).reduce((m, p) => m + Math.max(1, costOf(p)), 0), 0);
/** The work of one body or rim over a box `side` pixels square: the body, its cut-outs and grown copies at each pixel, and at the shading offsets. */
function bodyWork(a, costOf, side, points = askedOf(side)) {
  const G = grownTests(a), asked = points * G;
  const list = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
  // with holes every point asks every shape and hole; else each shape only at the points in its own box (boxedAny)
  if (list(a.holes).length) return asked * (testsIn(a.shapes, costOf) + testsIn(a.minus, costOf) + testsIn(a.holes, costOf)) + side * side * G * (testsIn(a.within, costOf) + 8);
  const own = (p, all) => { const b = Object.hasOwn(p, 'gen') ? callBox(p) : boxOf(p); const s2 = b ? turnedSide(b, kOf(a), a.turn === undefined ? 0 : a.turn, grownOf(a)) : side; return Math.min(all, (s2 + 2) ** 2 * G) * testsIn([p], costOf); };
  const n = list(a.shapes).length + list(a.minus).length + list(a.within).length;
  return asked * n + [...list(a.shapes), ...list(a.minus)].reduce((m, p) => m + own(p, asked), 0) + list(a.within).reduce((m, p) => m + own(p, side * side * G), 0) + side * side * 8;
}
/** How many pixel centres a body over a box `side` square asks about at most: each of its own, and three more for each of those (the bands' look-ups), or its box and margin, whichever is fewer (each is asked once). */
const askedOf = (side, margin = BAND_MARGIN) => Math.min((side + 2 * margin) ** 2, 4 * side * side);
/** How far a body may be grown, for its cost: its grow at its largest, half a pixel at least while it may be bold. */
const grownOf = (a) => Math.max(boldMaybe(a) ? 0.5 : 0, growArg(a));
const bodyCost = (a, { costOf }) => {
  const side = turnedSide(boxIn(a.shapes), kOf(a), a.turn === undefined ? 0 : a.turn, grownOf(a));
  return Math.max(tilesFor(side, side), workCost(bodyWork(a, costOf, side))) + callsIn([a.shapes, a.minus, a.holes, a.within], costOf);
};
/** icon.rim@1's cost: the body asked once at every pixel of its grid (the body's box, 3 pixels more each way and the grow) and a pixel round it. */
const rimCost = (a, { costOf }) => {
  const side = turnedSide(boxIn(a.shapes), kOf(a), a.turn === undefined ? 0 : a.turn, grownOf(a)), grid = side + 8 + 2 * Math.ceil(grownOf(a));
  return Math.max(tilesFor(grid, grid), workCost(bodyWork(a, costOf, grid, grid * grid))) + callsIn([a.shapes, a.minus, a.holes, a.within], costOf);
};

/** The body of a call as one frame test: its shapes joined, less `minus`, grown by `grow`; and its `within` test (or null). */
function bodyTests(a, ctx, call) {
  const P = penOf(a), G = a.bold === true ? 0.5 : a.grow > 0 ? a.grow : 0;
  const holes = testsOf(a.holes, ctx, call).map(P.at);
  let list;
  if (holes.length) {
    // the shapes less their holes are one shape, grown as one (a ring drawn bold: its opening narrows); a hole with a
    // `group` opens only the shapes of that group (two rings in one body), one with none every shape
    const own = testsOf(a.shapes, ctx, call).map(P.at);
    const ownG = groupsOf(a.shapes, ctx, call), holeG = groupsOf(a.holes, ctx, call);
    const grouped = holeG.some((g) => g !== null);
    const base = grouped
      ? (x, y) => { for (let i = 0; i < own.length; i++) { if (!own[i](x, y)) continue; let open = false; for (let j = 0; j < holes.length && !open; j++) if ((holeG[j] === null || holeG[j] === ownG[i]) && holes[j](x, y)) open = true; if (!open) return true; } return false; }
      : (x, y) => { for (const h of holes) if (h(x, y)) return false; for (const f of own) if (f(x, y)) return true; return false; };
    list = own.length ? [G ? grownTest(base, G) : base] : [];
  } else { const T = boxedAny(P, shapesIn(a.shapes, ctx, call)); list = grownAll(T ? [T] : [], G); }
  const M = boxedAny(P, shapesIn(a.minus, ctx, call)), W = boxedAny(P, shapesIn(a.within, ctx, call));
  const minus = grownAll(M ? [M] : [], G), clips = grownAll(W ? [W] : [], G);
  const inside = (x, y) => { for (const m of minus) if (m(x, y)) return false; for (const f of list) if (f(x, y)) return true; return false; };
  return { P, G, any: list.length > 0, inside, clip: clips.length ? (x, y) => clips.some((f) => f(x, y)) : null };
}

const bodyArgs = () => ({
  shapes: primitives({ about: 'The body: ellipse, poly, capsule, rect, limb, or calls to shape generators' }),
  minus: primitives({ default: [], about: 'Shapes cut out of the body (grown with it when bold, as iconPaint cuts them)' }),
  holes: primitives({ default: [], about: 'Openings in the shapes themselves, before they are grown (a ring\'s middle: bold, it narrows); a hole with a group opens only the shapes of that group' }),
  within: primitives({ default: [], about: 'Paint only inside these shapes (none: everywhere)' }),
  grow: px(0, 2, { default: 0, about: 'Pixels added on every side, corners included (bold says half a pixel)' }),
  bold: flag({ default: false, about: 'Drawn bold, as iconBold: half a pixel added on every side (grow is then not read)' }),
});

/**
 * icon.body@1: one body of an icon painted as engine/icons.js iconPaint paints it through the pen (icon.paint@2's
 * arguments and pixels), and also through iconBold's pen: `grow` pixels added on every side of every shape, its
 * cut-outs and its `within` alike, so strokes gain weight and gaps narrow. `band` gives the dark band a colour of its
 * own, as iconPaint's hand-made ramps do (a gem's shadowed facet); `middle` and `highlight` the softer and the lit
 * tones. Returns stamps.
 */
export const iconBody = defineGenerator({
  id: 'icon.body', v: 1, family: 'icon',
  about: 'One body of an icon, shaded the icon way, that can be drawn bold: grown on every side (port of engine/icons.js iconPaint through iconBold).',
  args: {
    ...bodyArgs(),
    paint: paint({ about: 'Its colour (its ramp gives the dark, soft and light tones)' }),
    dark: count(0, 3, { default: 1, about: 'How many pixels deep the dark band away from the light is' }),
    soft: count(0, 3, { default: 2, about: 'How deep the softer second tone inside the dark band is' }),
    lit: count(0, 2, { default: 1, about: 'How many pixels deep the highlight band on the lit side is' }),
    flat: flag({ default: false, about: 'One colour, no bands' }),
    band: paint({ default: 'clear', about: 'The dark band\'s colour when it is not the paint\'s own dark tone (clear: its own), as a ramp of iconPaint\'s' }),
    middle: paint({ default: 'clear', about: 'The softer tone\'s colour when it is not half way to the dark band (clear: half way)' }),
    highlight: paint({ default: 'clear', about: 'The lit band\'s colour when it is not the paint\'s own light tone (clear: its own)' }),
    ...penArgs(),
  },
  cost: bodyCost,
  run: (a, ctx, { call }) => unclipped((b, c) => bodyRun(b, c, call), a, ctx, a.centre, centreMoved),
});

function bodyRun(a, ctx, call) {
  const T = bodyTests(a, ctx, call);
  if (!T.any) return [];
  const g = gridFor(T.P, ctx, boxIn(a.shapes), 2 + T.G);
  const D = a.flat ? 0 : a.dark, soft = a.flat || !a.soften ? 0 : a.soft, hi = a.flat || !a.shiny ? 0 : a.lit;
  paintBody(g, g, T.inside, T.clip, a.paint, a.band === 'clear' ? null : a.band, D, soft, hi, a.middle === 'clear' ? null : a.middle, a.highlight === 'clear' ? null : a.highlight);
  return g.stamps();
}

const centreMoved = (b, dx, dy) => ({ ...b, centre: [b.centre[0] + dx, b.centre[1] + dy] });

/**
 * icon.rim@1: the 1 px line round a body, drawn before the body as engine/icons.js iconPaint's `rim` draws it: every
 * pixel outside the body (and inside `within`, when given) beside one inside it, left, right, up or down. With `over`,
 * inside an icon.fitted@1 or icon.fit@1 call, only pixels already painted take it: iconOver's parting line between a
 * second body and what it lies on, which adds nothing outside the picture. Returns stamps.
 */
export const iconRim = defineGenerator({
  id: 'icon.rim', v: 1, family: 'icon',
  about: 'The one-pixel line round an icon body, drawn before it; with over, only on what is painted (port of engine/icons.js iconPaint rim, iconOver).',
  args: {
    ...bodyArgs(),
    paint: paint({ about: 'The line\'s colour (ink for iconOver\'s parting line)' }),
    over: flag({ default: false, about: 'Inside icon.fitted or icon.fit: only on pixels already painted' }),
    ...penArgs(),
  },
  cost: rimCost,
  run: (a, ctx, { call }) => unclipped((b, c) => rimRun(b, c, call), a, ctx, a.centre, centreMoved),
});

function rimRun(a, ctx, call) {
  const T = bodyTests(a, ctx, call);
  if (!T.any) return [];
  const g = gridFor(T.P, ctx, boxIn(a.shapes), 3 + T.G);
  const { inside, clip } = T;
  // the body asked once at each pixel of the grid and a pixel round it, then the rim read from that
  const W = g.w + 2, H = g.h + 2, mask = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) mask[j * W + i] = inside(g.x0 + i - 1 + 0.5, g.y0 + j - 1 + 0.5) ? 1 : 0;
  const on = (x, y) => mask[(y - g.y0 + 1) * W + (x - g.x0 + 1)] === 1;
  for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) {
    if (on(x, y) || (clip && !clip(x + 0.5, y + 0.5))) continue;
    if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1)) g.set(x, y, a.paint);
  }
  return g.stamps();
}

/**
 * icon.flame@1: a small flame with no ink line rising straight up the screen from a point of the icon's own space (a
 * flame does not lean with its candle), as engine/icons.js iconFlame: a drop of `rim`, a smaller drop of `paint` inside
 * it and, when it is 5 px wide or more, a hot core. Draw it after the ink line: in an icon.fitted@1 call's `lights`.
 */
export const iconFlame = defineGenerator({
  id: 'icon.flame', v: 1, family: 'icon',
  about: 'A small flame with no ink line rising straight up from a point of an icon, rimmed with a darker tone (port of engine/icons.js iconFlame).',
  args: {
    at: point({ lo: -32, hi: 32, about: 'The foot of the flame, in the icon\'s own space' }),
    h: px(1, 16, { default: 7, about: 'Its height, in units' }),
    w: px(1, 12, { default: 5, about: 'Its width, in units' }),
    sway: px(-4, 4, { default: 0, about: 'Pixels its tip leans to the right' }),
    paint: paint({ about: 'The flame' }),
    core: paint({ about: 'Its hot middle' }),
    rim: paint({ about: 'Its rim: a darker tone of the flame' }),
    ...penArgs(),
  },
  cost: (a) => tilesFor(80, 80) + workCost(3 * 80 * 80 * 4),
  run: (a, ctx) => unclipped(flameRun, a, ctx, a.centre, centreMoved),
});

function flameRun(a, ctx) {
  const P = penOf(a);
  const [fx, fy] = P.pt(a.at[0], a.at[1]), X = Math.floor(fx) + 0.5, Y = Math.floor(fy) + 1;
  const H = Math.max(4, Math.round(a.h * P.k)), W = Math.max(3, Math.round(a.w * P.k)), sway = a.sway;
  const drop = (hh, ww, lift) => {
    const r = ww / 2, cyy = Y - lift - r;
    const tip = polyIn([[X - r, cyy], [X + r, cyy], [X + sway, Y - lift - hh]]);
    return (px, py) => (px - X) ** 2 + (py - cyy) ** 2 <= r * r || tip(px, py);
  };
  const R = Math.ceil(Math.max(H, W) + Math.abs(sway) + 2);
  const g = new Pixels(Math.floor(X) - R, Math.floor(Y) - R - H, 2 * R + 1, 2 * R + H + 1);
  const all = (test, ref) => g.fill(g.x0, g.y0, g.x0 + g.w - 1, g.y0 + g.h - 1, test, ref);
  all(drop(H, W, 0), a.rim);
  all(drop(H - 2, W - 2, 1), a.paint);
  if (W >= 5) all(drop(Math.max(2, H - 5), Math.max(1, W - 4), 2), a.core);
  return g.stamps();
}

/**
 * oval@1: an ellipse turned by `turn` degrees about its middle, as one shape: what a picture's ellipse cannot say (its
 * definition keeps an ellipse's at and r only). Name it in a group of an icon.fitted@1 body, or anywhere a shape may stand.
 */
export const oval = defineGenerator({
  id: 'oval', v: 1, family: 'shape',
  about: 'An ellipse turned about its middle by an angle, as one shape: the head of a music note, a leaning egg.',
  args: {
    at: point({ about: 'Its middle' }),
    r: point({ lo: 0, hi: 320, about: 'Half its width and half its height, before it is turned' }),
    turn: angle({ default: 0, about: 'Degrees it is turned clockwise' }),
    paint: paint({ about: 'Its colour' }),
  },
  cost: () => 1,
  run: (a) => [{ kind: 'ellipse', at: [...a.at], r: [...a.r], ...(a.turn ? { turn: a.turn } : {}), paint: a.paint }],
});

/** The plates icon.plate@1 draws: a hexagon standing on a point, or a disc. */
export const PLATE_SHAPES = Object.freeze(['hex', 'circle']);

/**
 * icon.plate@1: the backing plate behind an icon, as engine/icons.js iconPlate: a hexagon standing on a point or a
 * disc centred on `at`, flat `face` with a lit rim towards the light while `shine` is on, the disc tidied, ringed by its
 * own ink line. Its side (ink line included) runs from span[0] at Size 0 to span[1] at Size 1, in even steps; an icon
 * sits well on it 8 px smaller. Draw it under the icon (a lower `z`). Returns stamps.
 */
export const iconPlate = defineGenerator({
  id: 'icon.plate', v: 1, family: 'icon',
  about: 'The backing plate behind an icon: a hexagon on its point or a disc, flat with a lit rim, inked (port of engine/icons.js iconPlate).',
  args: {
    at: point({ default: [16, 16], about: 'Its middle (the frame\'s middle for an icon)' }),
    shape: word(PLATE_SHAPES, { default: 'hex', about: 'A hexagon standing on a point, or a disc' }),
    size: share({ default: 0.5, about: 'Small to Big' }),
    face: paint({ about: 'Its colour' }),
    shine: flag({ default: true, about: 'A lit rim towards the light' }),
    ink: paint({ default: 'ink', about: 'Its outline' }),
    span: point({ default: [26, 30], lo: 4, hi: 64, about: 'Its side with the ink line at Small and at Big' }),
  },
  cost: (a) => { const s = Math.max(num(a.span?.[0], 64), num(a.span?.[1], 64)) + 4; return tilesFor(s, s) + workCost(4 * s * s); },
  run: (a) => plateGrid(a.at, a.shape, plateSide(a.span, a.size), a.face, a.shine, a.ink).stamps(),
});

/** The side of a plate, its ink line included: span[0] at Size 0 to span[1] at Size 1, in even steps (iconPlate). */
const plateSide = (span, size) => 2 * Math.round((span[0] + (span[1] - span[0]) * clamp01(size)) / 2);
/** A plate of that side centred on `at` on a grid of its own, as engine/icons.js iconPlate paints one. */
function plateGrid(at, shape, side, face, shine, ink) {
  const d = side - 2, [cx, cy] = at;
  const g = new Pixels(Math.floor(cx - side), Math.floor(cy - side), 2 * side + 2, 2 * side + 2);
  const test = shape === 'hex' ? hexIn(cx, cy, d - 2, d) : ellipseIn(cx, cy, d / 2, d / 2);
  g.fill(g.x0, g.y0, g.x0 + g.w - 1, g.y0 + g.h - 1, test, { light: toneOf(face, 'light'), base: face, dark: face }, { shade: 0, light: shine ? 1 : 0 });
  if (shape === 'circle') tidied(g);
  return inked(g, ink);
}

/** engine/surface.js outline on a grid: every empty pixel beside a painted one (left, right, up, down) takes the ink. Changes the grid. */
function inked(g, ink) {
  const hits = [];
  for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) {
    if (g.has(x, y)) continue;
    if (g.has(x - 1, y) || g.has(x + 1, y) || g.has(x, y - 1) || g.has(x, y + 1)) hits.push([x, y]);
  }
  for (const [x, y] of hits) g.set(x, y, ink);
  return g;
}

/** A grid leaned as engine/surface.js lean: each row slides right by round((py - (y + 0.5)) * slope). */
function leanedRows(src, py, slope) {
  const out = src.blank();
  for (let y = src.y0; y < src.y0 + src.h; y++) {
    const dx = Math.round((py - (y + 0.5)) * slope);
    for (let x = src.x0; x < src.x0 + src.w; x++) { const c = src.get(x - dx, y); if (c !== null) out.set(x, y, c); }
  }
  return out;
}
/** A grid raised as engine/icons.js iconRise: each column slides up by lift(x). */
function raisedColumns(src, lift) {
  const out = src.blank();
  for (let x = src.x0; x < src.x0 + src.w; x++) {
    const d = lift(x);
    for (let y = src.y0; y < src.y0 + src.h; y++) { const c = src.get(x, y + d); if (c !== null) out.set(x, y, c); }
  }
  return out;
}

/** True when an item paints only over what is painted: an icon.glint (unless over is false), or any call with over. */
const overOnly = (item) => (item.over === undefined ? item.gen === 'icon.glint' : item.over === true);
const ANCHORS = { tl: [0, 0], tc: [0.5, 0], tr: [1, 0], cl: [0, 0.5], c: [0.5, 0.5], cr: [1, 0.5], bl: [0, 1], bc: [0.5, 1], br: [1, 1] };

/** Puts primitives (stamps and dots, as generators return them) on a grid in order; with over, only on painted pixels. */
function put(g, prims, over) {
  for (const p of prims) {
    if (!isObj(p)) continue;
    if (p.kind === 'dot') { if (!over || g.has(p.at[0], p.at[1])) g.set(p.at[0], p.at[1], p.paint); continue; }
    if (p.kind !== 'stamp' || !Array.isArray(p.rows) || !isObj(p.key)) continue;
    const w = Math.max(0, ...p.rows.map((r) => r.length)), h = p.rows.length;
    const [ax, ay] = ANCHORS[p.anchor ?? 'tl'] ?? [0, 0];
    const x0 = Math.round(p.at[0] - ax * w), y0 = Math.round(p.at[1] - ay * h);
    p.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ' || !Object.hasOwn(p.key, ch)) continue;
        if (!over || g.has(x0 + i, y0 + j)) g.set(x0 + i, y0 + j, p.key[ch]);
      }
    });
  }
}

/** The plain shape kinds an icon's draw list holds as bodies (BODIES in icon.fitted@1). */
export const BODY_KINDS = Object.freeze(['ellipse', 'poly', 'capsule', 'rect', 'limb']);

/**
 * Paints one body on a grid as engine/icons.js iconPaint does: every pixel whose centre is inside (and inside `clip`),
 * the `band` colour where the pixel D away from the light is outside, the mid tone `soft` further in (while soften), the
 * light tone where the pixel `hi` towards the light is outside (while shiny). inside(x, y) and clip take pixel centres.
 */
function paintBody(g, box, inside, clip, paintRef, band, D, soft, hi, middle = null, highlight = null) {
  const [sx, sy] = g.shadow;
  const dark = band ?? toneOf(paintRef, 'dark'), lite = highlight ?? toneOf(paintRef, 'light'), mid = middle ?? mixOf(paintRef, dark, 0.5);
  const M = D + soft + hi + 1, W = box.w + 2 * M, X0 = box.x0 - M, Y0 = box.y0 - M;
  const seen = new Int8Array(W * (box.h + 2 * M));
  const at = (x, y) => {
    const i = (y - Y0) * W + (x - X0);
    if (i < 0 || i >= seen.length || x < X0 || x >= X0 + W) return inside(x + 0.5, y + 0.5);
    let v = seen[i];
    if (!v) v = seen[i] = inside(x + 0.5, y + 0.5) ? 1 : 2;
    return v === 1;
  };
  const ids = new Map();
  const idOf = (ref) => { const k = typeof ref === 'string' ? ref : JSON.stringify(ref); if (!ids.has(k)) ids.set(k, g.id(ref)); return ids.get(k); };
  for (let y = box.y0; y < box.y0 + box.h; y++) for (let x = box.x0; x < box.x0 + box.w; x++) {
    if (!at(x, y) || (clip && !clip(x + 0.5, y + 0.5))) continue;
    let c = paintRef;
    if (D && !at(x + sx * D, y + sy * D)) c = dark;
    else if (soft && !at(x + sx * (D + soft), y + sy * (D + soft))) c = mid;
    else if (hi && !at(x - sx * hi, y - sy * hi)) c = lite;
    g.setId(x, y, idOf(c));
  }
}

/** The frame box (a Pixels-like { x0, y0, w, h }) a pen reaches for a local box, `pad` pixels more each way, inside the grid g. */
function boxOn(g, P, box, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]) {
    const [x, y] = P.pt(u, v);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const ax = Math.max(g.x0, Math.floor(x0 - pad)), ay = Math.max(g.y0, Math.floor(y0 - pad));
  const bx = Math.min(g.x0 + g.w, Math.ceil(x1 + pad) + 1), by = Math.min(g.y0 + g.h, Math.ceil(y1 + pad) + 1);
  return { x0: ax, y0: ay, w: Math.max(0, bx - ax), h: Math.max(0, by - ay) };
}

/** A 1 px line between two frame points (engine/icons.js iconLine's steps); with over, only on painted pixels. */
function lineOn(g, a, b, ref, over) {
  let [x0, y0] = a.map(Math.floor);
  const [x1, y1] = b.map(Math.floor);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  for (let err = dx + dy, n = 0; n < 4096; n++) {
    if (!over || g.has(x0, y0)) g.set(x0, y0, ref);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/**
 * Draws an icon's list on a grid, in order (BODIES in icon.fitted@1): runs of plain shapes as bodies, `cut`s taken out
 * of the body they name, `line`s as creases over what is painted, dots and stamps at points of the icon, and calls: a
 * pen generator's (PEN_GENERATORS) with the pen, another's with its `at` put where the pen and the lean put it.
 */
function drawItems(g, list, a, P, pen, ctx, call, where) {
  const items = Array.isArray(list) ? list.filter(isObj) : [];
  const cuts = new Map();
  for (const it of items) if (it.kind === 'cut' && typeof it.from === 'string' && isObj(it.shape)) { if (!cuts.has(it.from)) cuts.set(it.from, []); cuts.get(it.from).push(it.shape); }
  const G = a.bold === true ? 0.5 : a.grow > 0 ? a.grow : 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const shapeCall = Object.hasOwn(item, 'gen') && typeof item.group === 'string' && !PEN_GENERATORS.includes(item.gen);
    if (Object.hasOwn(item, 'gen') && !shapeCall) {
      let node = item;
      if (PEN_GENERATORS.includes(item.gen)) node = { ...item, ...pen, ...((item.gen === 'icon.body' || item.gen === 'icon.rim') && item.grow === undefined && item.bold === undefined && G ? (a.bold === true ? { bold: true } : { grow: G }) : {}) };
      else if (Array.isArray(item.at)) node = { ...item, at: where(...P.pt(item.at[0], item.at[1])).map((v) => Math.floor(v) + 0.5) };
      put(g, call(node, ctx), overOnly(item));
      continue;
    }
    if (BODY_KINDS.includes(item.kind) || shapeCall) {
      // a run of shapes of one group is one body (a shape generator's call in the group, such as oval@1, gives shapes too)
      const run = [item];
      const inRun = (x) => x.group === item.group && (BODY_KINDS.includes(x.kind) || Object.hasOwn(x, 'gen'));
      while (typeof item.group === 'string' && i + 1 < items.length && inRun(items[i + 1])) run.push(items[++i]);
      const minus = [...(typeof item.group === 'string' ? cuts.get(item.group) ?? [] : []), ...(typeof item.id === 'string' ? cuts.get(item.id) ?? [] : [])];
      const shapesOf = (x) => (Object.hasOwn(x, 'gen') ? call(x, ctx) : [x]);
      const T = boxedAny(P, run.flatMap(shapesOf)), C = boxedAny(P, minus);
      const tests = grownAll(T ? [T] : [], G), outs = grownAll(C ? [C] : [], G);
      if (!tests.length) continue;
      const inside = (x, y) => { for (const m of outs) if (m(x, y)) return false; for (const f of tests) if (f(x, y)) return true; return false; };
      const shade = fin(item.shade) ? Math.round(item.shade) : 3, light = fin(item.light) ? Math.round(item.light) : 1;
      const D = shade > 0 ? 1 : 0, soft = a.soften && shade > 1 ? shade - 1 : 0, hi = a.shiny ? light : 0;
      paintBody(g, boxOn(g, P, boxIn(run), 2 + G + 1 / P.k), inside, null, item.paint, null, D, soft, hi);
      continue;
    }
    if (item.kind === 'line' && Array.isArray(item.from) && Array.isArray(item.to)) { lineOn(g, P.pt(item.from[0], item.from[1]), P.pt(item.to[0], item.to[1]), item.paint, true); continue; }
    if ((item.kind === 'stamp' || item.kind === 'dot') && Array.isArray(item.at)) {
      const [x, y] = where(...P.pt(item.at[0], item.at[1])).map(Math.floor);
      put(g, [{ ...item, at: [x, y] }], false);
    }
  }
}

/** How many times icon.fitted@1 may draw its list while it searches for the scale (engine/icons.js iconFit). */
export const FITTED_PASSES = 6;
/** The most pixels a unit an icon.fitted@1 pen draws at: an icon is written some 23 units across, so an eighteenth of the size it is asked for is room enough. */
const spanOf = (a) => { const s = Array.isArray(a.span) ? a.span : [20, 26]; if (a.plate === undefined || a.plate === 'none') return s; const p = Array.isArray(a.plateSpan) ? a.plateSpan : [26, 30]; return [Math.max(num(s[0], 64), num(p[0], 64) - 8), Math.max(num(s[1], 64), num(p[1], 64) - 8)]; };
const kMax = (a) => Math.min(4, Math.max(0.1, (Math.max(num(spanOf(a)[0], 64), num(spanOf(a)[1], 64)) * (a.fill === undefined ? 1 : num(a.fill, 1))) / 18));
/** The side of the square grid icon.fitted@1 draws an icon on: the largest size it is asked for and 10 pixels more, at most PEN_ROOM and at most its `room`. */
const roomOf = (a) => Math.min(PEN_ROOM, Math.ceil(Math.max(num(spanOf(a)[0], 64), num(spanOf(a)[1], 64))) + 10, Math.ceil(a.room === undefined ? PEN_ROOM : num(a.room, PEN_ROOM)));

/** Shape tests one pixel of a plain body costs: each shape (a polygon its points), each cut, nine times over when grown. */
function bodiesWork(list, k, grow, room, turn, soften = true, shiny = true, per = grow > 0 ? 9 : 1) {
  const items = Array.isArray(list) ? list.filter(isObj) : [];
  // a cut is asked at the pixels of the body it names (a group or an id); one that names none is charged to every body
  const cuts = new Map();
  for (const x of items) if (x.kind === 'cut') { const k2 = typeof x.from === 'string' ? x.from : ''; cuts.set(k2, (cuts.get(k2) ?? 0) + (x.shape?.kind === 'poly' && Array.isArray(x.shape.points) ? x.shape.points.length : 1)); }
  const cutOf = (x) => (cuts.get('') ?? 0) + (typeof x.group === 'string' ? cuts.get(x.group) ?? 0 : 0) + (typeof x.id === 'string' && x.id !== x.group ? cuts.get(x.id) ?? 0 : 0);
  let work = 0;
  const shapeOf = (x) => BODY_KINDS.includes(x.kind) || (Object.hasOwn(x, 'gen') && typeof x.group === 'string' && !PEN_GENERATORS.includes(x.gen));
  for (let i = 0; i < items.length; i++) {
    const x = items[i];
    if (shapeOf(x)) {
      // a run of shapes of one group is one body, as drawItems draws it: every pixel of the run's whole box asks every
      // shape of the run (a polygon its points; a shape call oval@1 or taper@1 one shape, any other the most points its
      // shapes may have, over the whole room) and the cuts of the run's group and first id
      const run = [x];
      while (typeof x.group === 'string' && i + 1 < items.length && items[i + 1].group === x.group && shapeOf(items[i + 1])) run.push(items[++i]);
      const wild = run.some((y) => Object.hasOwn(y, 'gen') && !callBox(y));
      const box = wild ? null : boxIn(run.map((y) => (Object.hasOwn(y, 'gen') ? { kind: 'rect', at: callBox(y).slice(0, 2), size: [callBox(y)[2] - callBox(y)[0], callBox(y)[3] - callBox(y)[1]] } : y)));
      // the run's box at its largest turn and scale, cut to the room; with its bands' margin for the grid it walks
      const inner = box ? Math.min(room, turnedSide(box, k, turn, grow)) : room;
      const side = Math.min(room, inner + 2 * BAND_MARGIN);
      // its bands look this far past its box (drawItems: the dark band, the soft tone while soften, the lit band while shiny, one more)
      const sh = fin(x.shade) ? Math.round(x.shade) : 3, li = fin(x.light) ? Math.round(x.light) : 1;
      const margin = Math.min(BAND_MARGIN, (sh > 0 ? 1 : 0) + (soften !== false && sh > 1 ? sh - 1 : 0) + (shiny !== false ? Math.max(0, li) : 0) + 1);
      const asked = askedOf(inner, margin) * per;
      // every point asked checks each shape's and each cut's box (boxedAny); a shape is tested only at the points in its
      // own box (a polygon its points; a shape call oval@1 or taper@1 one shape; any other the most points its shapes may have, everywhere)
      const own = (y, w) => { const b = Object.hasOwn(y, 'gen') ? callBox(y) : boxOf(y); const s2 = b ? Math.min(room, turnedSide(b, k, turn, grow)) : room; return Math.min(asked, (s2 + 2) ** 2 * per) * w; };
      const cutList = items.filter((c) => c.kind === 'cut' && isObj(c.shape) && (typeof c.from !== 'string' || c.from === x.group || (typeof x.id === 'string' && c.from === x.id)));
      work += asked * (run.length + cutList.length)
        + run.reduce((n, y) => n + own(y, Object.hasOwn(y, 'gen') ? (callBox(y) ? 1 : SHAPE_CAPS.polyPoints) : weightOf(y)), 0)
        + cutList.reduce((n, c) => n + own(c.shape, weightOf(c.shape)), 0)
        + 4 * side * side;
    }
    else if (x.kind === 'line') work += 4 * room;
    else if (x.kind === 'stamp' || x.kind === 'dot') work += 32 * 32;
  }
  return work;
}

/**
 * icon.fitted@1: a whole icon, drawn and fitted as a sprite's render() drew one with engine/icons.js iconFit. Its `draw`
 * list is drawn through the pen in order (BODIES below); then, as iconSlant and iconRise, every row slid right by `slant`
 * pixels a pixel above the middle row or every column up by `rise` pixels a pixel right of the middle column (whole
 * pixels: square details stay crisp; give such an icon no turn); then the pimples taken off (iconTidy, `tidy`) and the
 * ink line put round it (outline(INK)); then its `lights` (a flame, a twinkle, a glow, a dot) with no ink line, where the
 * lean moved their points. All of it is drawn at a scale searched (up to FITTED_PASSES draws, as iconFit) until its
 * longer side, ink and lights included, is round((span[0] + (span[1] - span[0]) * size) * fill) pixels, then moved by
 * whole pixels so it is centred on `centre`. `turn` is the lean while `tilt` is on; `soften` and `shiny` are the Extra
 * shading and Shine controls; `grow` draws every body bold (iconBold). With a `plate` (iconPlate) the plate is drawn
 * first, its side from plateSpan by Size, and the icon fits its room, the side less 8 pixels (times `fill`).
 * BODIES. Written in the icon's own upright space ((0, 0) its middle, y down, about 23 units across):
 *   ellipse, poly, capsule, rect, limb   a body, shaded the icon way in its `paint`; a run of shapes of one `group` is
 *                                        one body (a shape generator's call in the run, oval@1 or taper@1, adds its shapes). `shade` is how deep its shadow is: 0 flat, 1 the 1 px dark band,
 *                                        2 and 3 a softer tone 1 or 2 px further in (default 3, iconPaint's); `light`
 *                                        the lit band (0 to 2, default 1)
 *   cut { shape, from }                  a shape taken out of the body of that group or id (iconPaint's minus)
 *   line { from, to }                    a 1 px crease in its paint, only over what is painted (iconLine over)
 *   dot, stamp                           at a point of the icon (a stamp's anchor on the floored pixel)
 *   a generator call                     icon.paint, icon.body, icon.rim, icon.line, icon.glint, icon.flame get the
 *                                        pen; any other call its `at` as a point of the icon, put on the middle of
 *                                        the pixel it falls in (twinkle, glow)
 * It draws on a grid the largest size asked for and 10 pixels more square (at most PEN_ROOM), at a scale of at most a
 * eighteenth of that size a unit. Returns stamps.
 */
export const iconFitted = defineGenerator({
  id: 'icon.fitted', v: 1, family: 'icon',
  about: 'A whole icon: bodies written as shapes, leaned, tidied and inked, its lights on top, fitted to its box as iconFit fits one.',
  args: {
    draw: primitives({ about: 'The icon in order: shapes as bodies, cuts, lines as creases, dots, stamps and icon generators\' calls' }),
    lights: primitives({ default: [], about: 'What goes on after the ink line: icon.flame, twinkle, glow calls, dots or stamps at points of the icon' }),
    centre: point({ default: [16, 16], about: 'The middle of the box it is centred in (the frame\'s middle)' }),
    size: share({ default: 0.5, about: 'Small to Big: the longer side from span[0] to span[1] pixels' }),
    fill: share({ default: 1, about: 'A share of that size, for an icon that should look smaller than the rest' }),
    span: point({ default: [20, 26], lo: 4, hi: 64, about: 'The longer side at Small and at Big, ink line included' }),
    tilt: flag({ default: true, about: 'Lean it by `turn`' }),
    turn: angle({ default: 0, about: 'Its lean, degrees clockwise' }),
    slant: px(0, 1, { default: 0, about: 'Pixels each row slides right for every pixel it is above the middle (iconSlant: 0.25)' }),
    rise: px(0, 1, { default: 0, about: 'Pixels each column slides up for every pixel it is right of the middle (iconRise: 0.25)' }),
    grow: px(0, 2, { default: 0, about: 'Pixels added round every body (bold says half a pixel)' }),
    bold: flag({ default: false, about: 'Every body drawn bold, as iconBold: half a pixel added round it (grow is then not read)' }),
    soften: flag({ default: true, about: 'The second, softer shadow tone (Extra shading)' }),
    shiny: flag({ default: true, about: 'Highlight bands and glints (Shine)' }),
    tidy: flag({ default: true, about: 'Take the pimples off round shapes before the ink line' }),
    ink: paint({ default: 'ink', about: 'The ink line round it' }),
    plate: word(['none', ...PLATE_SHAPES], { default: 'none', about: 'A backing plate behind it (iconPlate): the icon then fits the plate, 8 px smaller than its side' }),
    face: paint({ default: 'clear', about: 'The plate\'s colour' }),
    plateSpan: point({ default: [26, 30], lo: 4, hi: 64, about: 'The plate\'s side with its ink line at Small and at Big, in even steps' }),
    room: px(4, PEN_ROOM, { default: PEN_ROOM, about: 'The side of the square round `centre` it draws in while it searches for the scale: the sprite\'s frame (32), as iconFit drew in it, so a try too big for the frame measures as the frame cut it' }),
  },
  // FITTED_PASSES draws of its lists (its bodies at the largest scale it uses, its calls at their own cost) and the grid
  // work of each pass (lean, tidy, ink, bounds), on a grid of PEN_ROOM square
  cost: (a, { costOf }) => {
    const k = kMax(a), g = grownOf(a), R = roomOf(a);
    // the lean it draws at: its turn when it is a number and tilt may be on (and upright too), any turn when it is not yet one
    const turn = a.tilt === false ? 'upright' : a.turn === undefined ? 0 : fin(a.turn) ? a.turn : NaN;
    // a pen generator's call is costed with the pen it gets: this call's largest scale and lean, its own zoom (1 unless it says)
    const penCost = (item) => costOf(PEN_GENERATORS.includes(item.gen) ? { ...item, scale: k, zoom: item.zoom ?? 1, turn: turn === 'upright' ? 0 : turn, centre: [16, 16], ...((item.gen === 'icon.body' || item.gen === 'icon.rim') && item.grow === undefined && item.bold === undefined ? { ...(boldMaybe(a) ? { bold: true } : {}), ...(growArg(a) > 0 ? { grow: growArg(a) } : {}) } : {}) } : item);
    const pass = workCost(bodiesWork(a.draw, k, g, R, turn, a.soften, a.shiny, grownTests(a)) + bodiesWork(a.lights, k, 0, R, turn, a.soften, a.shiny, 1) + 8 * R * R) + callsIn([a.draw, a.lights], penCost);
    const P = Math.max(num(a.plateSpan?.[0], 64), num(a.plateSpan?.[1], 64)) + 4;
    return tilesFor(R, R) + FITTED_PASSES * pass + (a.plate === 'none' ? 0 : tilesFor(P, P) + workCost(8 * P * P));
  },
  run: (a, ctx, { call }) => unclipped((b, c) => fittedRun(b, c, call), a, ctx, a.centre, centreMoved),
});

/** Draws the whole icon once at a scale: bodies, lean, tidy, ink, lights. */
function iconAt(a, ctx, call, scale) {
  const [cx, cy] = a.centre;
  const pen = { centre: [cx, cy], scale: Math.min(kMax(a), Math.max(0.1, scale)), turn: a.tilt ? a.turn : 0, soften: a.soften, shiny: a.shiny };
  const P = penOf({ ...pen, zoom: 1 }), R = roomOf(a);
  let g = new Pixels(Math.floor(cx - R / 2), Math.floor(cy - R / 2), R, R);
  drawItems(g, a.draw, a, P, pen, ctx, call, (x, y) => [x, y]);
  let where = (x, y) => [x, y];
  if (a.slant > 0) {
    g = leanedRows(g, cy, a.slant);
    where = (x, y) => [x + Math.round((cy - (Math.floor(y) + 0.5)) * a.slant), y];
  } else if (a.rise > 0) {
    const lift = (x) => Math.round((Math.floor(x) + 0.5 - cx) * a.rise);
    g = raisedColumns(g, lift);
    where = (x, y) => [x, y - lift(x)];
  }
  if (a.tidy) tidied(g);
  inked(g, a.ink);
  drawItems(g, a.lights, { ...a, grow: 0, bold: false }, P, pen, ctx, call, where);
  return g;
}

function fittedRun(a, ctx, call) {
  const side = a.plate === 'none' ? 0 : plateSide(a.plateSpan, a.size);
  const want = Math.max(4, Math.round((side ? side - 8 : a.span[0] + (a.span[1] - a.span[0]) * clamp01(a.size)) * a.fill));
  const [cx, cy] = a.centre;
  let scale = (want - 2) / 22, best = null, lo = 0, hi = Infinity;
  for (let pass = 0; pass < FITTED_PASSES; pass++) {
    const g = iconAt(a, ctx, call, scale), b = g.bounds();
    if (!b) return [];
    const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    if (!best || Math.abs(side - want) < Math.abs(best.side - want) || (Math.abs(side - want) === Math.abs(best.side - want) && side < best.side)) best = { g, b, side };
    if (side === want) break;
    if (side < want) lo = Math.max(lo, scale); else hi = Math.min(hi, scale);
    scale = lo > 0 && hi < Infinity ? (lo + hi) / 2 : (scale * (want - 1.5)) / (side - 1.5);
  }
  const { g, b } = best;
  const dx = Math.floor(cx - (b.x1 - b.x0 + 1) / 2) - b.x0, dy = Math.floor(cy - (b.y1 - b.y0 + 1) / 2) - b.y0;
  const icon = g.stamps().map((s) => ({ ...s, at: [s.at[0] + dx, s.at[1] + dy] }));
  return side ? [...plateGrid(a.centre, a.plate, side, a.face, a.shiny, a.ink).stamps(), ...icon] : icon;
}
