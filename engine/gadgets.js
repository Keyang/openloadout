// Gadgets: the small science-fiction objects that pickups, icons and props are made of (batch S15:
// credit chip, health cell, shield cell, keycard). A flat badge turned about its upright axis with a
// raised rim (a chip, a token, a medal), a circuit mark to put on it, containers of glowing charge
// (a power cell, a syringe, a med pack) with the charge itself, a hexagon lying on a flat side, a
// chevron, a lean that keeps edges hard, and the short run of a shape's edge that a travelling light is made of.
// Everything draws through the Surface's own calls (fill, line, dot), so it suits every style.
// Pure functions: Node and browser, no Math.random.
//
//   import { drawToken, drawCircuit, cellIn, drawCharge, flatHexIn, rimRunIn, chevronIn } from '../engine/gadgets.js';
//   const T = drawToken(g, hexIn(0, 0, 14, 16), 16, 17, p.metal, { turn: PI * t, thick: 3 });   // a spinning chip
//   if (T.squeeze > 0.45) drawCircuit(g, T.at, p.glow, { rx: 5, ry: 5 });                       // a lit chip mark on its face
//   const C = cellIn(20, 'cell'), put = (f) => placedIn(f, 16, 17);                             // a power cell, upright
//   g.blob([put(C.casing)], ramp(p.body), { light: 1 });
//   g.fill(0, 0, 32, 32, put(C.seams), ramp(p.body).deep);
//   drawCharge(g, C.window, p.glow, { from: C.fill[0], to: C.fill[1], level: p.level, beat, place: put });
//   g.outline(INK);
//   g.fill(0, 0, 32, 32, rimRunIn(flatHexIn(16, 16, 20, 18), 16, 16, t), '#ffffff');            // a light running round a hexagon
//
// Conventions as in shapes.js: x grows right, y grows down, sizes in pixels; shapes that must come
// out symmetrical take a whole-number centre for an even size and one ending in .5 for an odd size.

import { ramp, tone, mix } from './color.js';
import { clamp, TAU } from './motion.js';
import { rectIn } from './surface.js';
import { placedIn, insetIn, turnedIn, anyIn } from './shapes.js';
import { roundRectIn } from './ui.js';

// ---- shapes -------------------------------------------------------------------

/**
 * Shape test for a hexagon lying on a flat side: flat top and bottom, points left and right, slanted edges that step one pixel across for two up (hexIn of shapes.js stands on a point instead).
 * Arguments: cx, cy (centre: whole numbers for an even width and height); w (width between the two points); h (height between the flat sides; the slanted edges run in h / 4, so w about 1.1 times h looks regular).
 */
export function flatHexIn(cx, cy, w, h) {
  const a = w / 2, b = h / 2;
  return (px, py) => { const x = Math.abs(px - cx), y = Math.abs(py - cy); return y < b && x + y / 2 < a + 0.25; };
}

/**
 * Shape test for a chevron: a V-shaped band of even thickness, w wide and h tall over all, its point at the bottom: a rank stripe, an arrow mark, a direction sign.
 * Arguments: cx, cy (centre of its box); w, h (width and height of the whole V in pixels); thick (how thick the band is, measured straight down; default 2); options { up (true: the point is at the top) }.
 */
export function chevronIn(cx, cy, w, h, thick = 2, { up = false } = {}) {
  const half = w / 2, top = cy - h / 2, drop = Math.max(0, h - thick);
  return (px, py) => {
    const dx = Math.abs(px - cx), y = up ? 2 * cy - py : py;
    if (dx >= half) return false;
    const k = half > 1 ? clamp((dx - 0.5) / (half - 1)) : 0;          // 0 in the middle columns, 1 in the outermost
    const y0 = top + Math.round(drop * (1 - k));
    return y >= y0 && y < y0 + thick;
  };
}

/**
 * Shape test for a short run of a shape's edge, chosen by its direction from a centre: move the phase and the run travels round the shape (a chasing light on a rim, a scanner, a loading mark).
 * Arguments: test (the shape, a shape test); cx, cy (the point directions are measured from, usually its middle); phase (where the middle of the run is, in turns: 0 at the top, 0.25 at the right, clockwise; it wraps); span (its length as a share of the whole way round, default 0.2; 1 is the whole edge); thick (how many pixels deep into the shape, default 1).
 */
export function rimRunIn(test, cx, cy, phase = 0, span = 0.2, thick = 1) {
  const deep = (px, py) => test(px - thick, py) && test(px + thick, py) && test(px, py - thick) && test(px, py + thick);
  return (px, py) => {
    if (!test(px, py) || deep(px, py)) return false;
    if (span >= 1) return true;
    let d = Math.atan2(px - cx, cy - py) / TAU - phase;
    d -= Math.round(d);
    return Math.abs(d) <= span / 2;
  };
}

/**
 * Shape tests leaned like italic type: every row slides sideways by a whole number of pixels in proportion to its height above a base row, so edges stay hard and every row keeps its width (a card held at a slant, a rocking sign, a leaning post). Unlike a turn, it never breaks thin lines or small marks.
 * Arguments: tests (one shape test or a list, joined, written upright); cy (the row that stays where it is); slope (pixels a row slides to the right for each pixel it is above cy: 0.5 steps one pixel every two rows; negative leans to the left).
 */
export function leanedIn(tests, cy, slope) {
  const f = anyIn(tests);
  return (px, py) => f(px - Math.round(slope * (cy - py)), py);
}

// ---- a turned badge ---------------------------------------------------------------

/**
 * Draws a flat badge turned about its upright axis, as a coin, a chip or a medal spins: the edge band on the side turning away, the face with a lit raised rim, and a sunken field inside the rim. Returns { face, body, field, on, at, x, squeeze } for putting a mark on the face. Call g.outline afterwards.
 * Arguments: g (the Surface); badge (the badge seen face-on, a shape test around (0, 0)); cx, cy (where its middle goes); colour (its metal); options { turn (radians: 0 face-on, PI / 2 edge-on; default 0), thick (thickness of the badge in pixels, default 2), rim (width of the raised rim in pixels, default 1; 0 for a flat face with no field), field (colour of the sunken field; default a tone darker than the metal), sx, sy (squash across and down, default 1) }. In the result: face, body and field are shape tests in the frame (field is null without a rim); on(test) places a shape test written on the face-on badge onto the face as it is turned; at(u, v) gives the frame position [x, y] of a point of the face-on badge; x is how far the face has slid sideways; squeeze is its width as a share of face-on (1 to 0).
 */
export function drawToken(g, badge, cx, cy, colour, { turn = 0, thick = 2, rim = 1, field, sx = 1, sy = sx } = {}) {
  const M = ramp(colour), T = turnedIn(badge, turn, thick), k = Math.max(T.squeeze, 1e-3);
  const put = (test) => placedIn(test, cx, cy, { sx, sy });
  const body = put(T.body), face = put(T.face);
  g.fill(0, 0, g.w, g.h, body, { base: M.dark, dark: M.deep, light: M.base }, { shade: 1, light: 1 });     // the edge
  g.fill(0, 0, g.w, g.h, face, M, { shade: 1, light: 1 });
  let sunk = null;
  if (rim > 0) {
    sunk = insetIn(face, rim);
    const [dx, dy] = g.shadow;
    g.fill(0, 0, g.w, g.h, sunk, field ?? tone(colour, -0.3));
    // the shadow the raised rim casts into the field, on the side the light comes from
    g.fill(0, 0, g.w, g.h, (px, py) => sunk(px, py) && !sunk(px - dx, py - dy), M.dark);
  }
  return {
    face, body, field: sunk, x: T.x, squeeze: T.squeeze,
    on: (test) => put((x, y) => T.face(x, y) && test((x - T.x) / k, y)),
    at: (u, v) => [cx + (T.x + u * k) * sx, cy + v * sy],
  };
}

/**
 * Draws the mark of a circuit: the outline of a square chip with two pins leaving each side and a bright node at its heart, as printed on a credit chip, a card or a board. Every line is one pixel wide wherever the placing function puts it, so the mark survives being squeezed on a turning face.
 * Arguments: g (the Surface); at ((u, v) => [x, y]: turns a position in pixels from the middle of the mark into a frame position; drawToken returns one, or pass (u, v) => [cx + u, cy + v]); colour (of the lines); options { rx, ry (half the width and height of the whole mark in whole pixels, 3 or more; default 5 and rx: the mark is 2 * rx wide, pins included), pad (colour of the node, default white) }.
 */
export function drawCircuit(g, at, colour, { rx = 5, ry = rx, pad = '#ffffff' } = {}) {
  const H = Math.max(3, Math.round(rx)), V = Math.max(3, Math.round(ry));
  const bx = Math.max(2, H - (H >= 5 ? 2 : 1)), by = Math.max(2, V - (V >= 5 ? 2 : 1));      // half the chip: the pins take what is left (one pixel on a small mark, so that the chip stays open inside)
  const px = Math.max(1, Math.round(bx / 2)), py = Math.max(1, Math.round(by / 2));   // where the pins leave, counted from the middle
  // columns and rows are counted in whole pixels either side of the middle: ... -2, -1 | 0, 1 ...
  const dot = (i, j, c) => { const [x, y] = at(i + 0.5, j + 0.5); g.dot(Math.floor(x), Math.floor(y), c); };
  for (let i = -bx; i < bx; i++) { dot(i, -by, colour); dot(i, by - 1, colour); }
  for (let j = -by; j < by; j++) { dot(-bx, j, colour); dot(bx - 1, j, colour); }
  for (let j = by; j < V; j++) for (const i of [-px, px - 1]) { dot(i, -j - 1, colour); dot(i, j, colour); }
  for (let i = bx; i < H; i++) for (const j of [-py, py - 1]) { dot(-i - 1, j, colour); dot(i, j, colour); }
  for (const [i, j] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) dot(i, j, pad);
}

// ---- containers of charge -----------------------------------------------------------

/** The containers cellIn can make: cell (a glass tube between two metal caps), syringe (needle up, a glass barrel, finger grips and a plunger), pack (a carrying case with a handle and a cross-shaped window). No arguments: a frozen list. */
export const CELL_SHAPES = Object.freeze(['cell', 'syringe', 'pack']);

/**
 * A small container of charge h pixels tall standing upright around (0, 0), in whole pixels: returns { casing, seams, window, shine, fill: [from, to], half }.
 * Arguments: h (total height in whole pixels, 14 or more; an odd h needs to be placed on a centre ending in .5); shape (one of CELL_SHAPES, default 'cell'). casing (the hard case), seams (the dark lines between the case and its window, and the slot of a handle) and window (where the charge shows: paint it with drawCharge) are shape tests that never overlap; shine is where the highlight on the glass goes, inside the window (nowhere on a pack); fill is the row the charge fills from and the row it fills to (a cell and a pack fill from the bottom, a syringe from the needle end); half is half the widest width. Even widths: put x = 0 on a whole pixel.
 */
export function cellIn(h, shape = 'cell') {
  const top = -h / 2, bottom = h / 2;
  if (shape === 'syringe') {
    const half = Math.max(4, Math.round(h * 0.22)), bw = half - 2;                 // half the grips, half the barrel
    const needle = Math.max(3, Math.round(h * 0.2)), hub = 2, grip = h >= 20 ? 2 : 1, rod = Math.max(2, Math.round(h * 0.12)), pad = 2;
    const barrel = h - needle - hub - grip - rod - pad;
    const y1 = top + needle, y2 = y1 + hub, y3 = y2 + barrel, y4 = y3 + grip, y5 = y4 + rod;
    const parts = [rectIn(-1, top, 2, needle), rectIn(-bw + 1, y1, 2 * bw - 2, hub), rectIn(-half, y3, 2 * half, grip), rectIn(-1, y4, 2, rod), rectIn(-half + 1, y5, 2 * half - 2, pad)];
    return {
      casing: (px, py) => { for (const f of parts) if (f(px, py)) return true; return false; },
      seams: (px, py) => px >= -bw && px < bw && ((py >= y2 && py < y2 + 1) || (py >= y3 - 1 && py < y3)),
      window: rectIn(-bw, y2 + 1, 2 * bw, barrel - 2),
      shine: rectIn(bw - 2, y2 + 2, 1, Math.max(2, Math.round((barrel - 2) * 0.4))),
      fill: [y2 + 1, y3 - 1], half,
    };
  }
  if (shape === 'pack') {
    const boxH = 2 * Math.floor((h - 3) / 2), grab = h - boxH, half = Math.round(h * 0.45), yb = top + grab, cy = yb + boxH / 2;
    const size = 2 * Math.floor((Math.min(boxH, 2 * half) - 4) / 2), a = size / 2, b = size >= 10 ? 2 : 1;
    const box = roundRectIn(-half, yb, 2 * half, boxH, 2);
    const handle = rectIn(-4, top, 8, grab), slot = rectIn(-3, top + 1, 6, grab - 1);       // an arch over a dark slot, painted, so that it stays whole when the pack is squashed
    const cross = (px, py) => { const x = Math.abs(px), y = Math.abs(py - cy); return (x < a && y < b) || (x < b && y < a); };
    const seams = (px, py) => slot(px, py) || (!cross(px, py) && (cross(px - 1, py) || cross(px + 1, py) || cross(px, py - 1) || cross(px, py + 1)));
    return {
      casing: (px, py) => (box(px, py) || handle(px, py)) && !cross(px, py) && !seams(px, py),
      seams, window: cross, shine: () => false, fill: [cy + a, cy - a], half,
    };
  }
  const cap = Math.max(3, Math.round(h * 0.2)), half = Math.max(5, Math.round(h * 0.3)), tw = half - 2;      // the caps; half their width; half the tube
  const capA = roundRectIn(-half, top, 2 * half, cap, 1), capB = roundRectIn(-half, bottom - cap, 2 * half, cap, 1);
  return {
    casing: (px, py) => capA(px, py) || capB(px, py),
    seams: (px, py) => px >= -tw && px < tw && ((py >= top + cap && py < top + cap + 1) || (py >= bottom - cap - 1 && py < bottom - cap)),
    window: rectIn(-tw, top + cap + 1, 2 * tw, h - 2 * cap - 2),
    shine: rectIn(tw - 2, top + cap + 2, 1, Math.max(2, Math.round((h - 2 * cap - 2) * 0.4))),
    fill: [bottom - cap - 1, top + cap + 1], half,
  };
}

/**
 * Paints a window of glowing charge: the part that is full in the charge's colour with a brighter core, the rest in the dark of an empty window. Returns { wet, core } as shape tests in the frame. Draw it before g.outline: it is the inside of a thing.
 * Arguments: g (the Surface); window (shape test of the whole window); colour (of the charge); options { from, to (the rows it fills from and to: from below to for a window that fills downward), level (0 nearly empty to 1 full; two rows are always left), beat (0 at rest to 1: the charge flares, light with a white core), empty (colour of the unfilled part; default a deep tone of the charge), place (for a window that is tilted or squashed: a function that turns a shape test written upright, as window, from and to are, into the frame, such as (f) => placedIn(f, cx, cy, { angle }); default: they are in frame pixels already) }.
 */
export function drawCharge(g, window, colour, { from, to, level = 1, beat = 0, empty, place = (f) => f } = {}) {
  const C = ramp(colour), span = Math.abs(to - from);
  const reach = Math.max(Math.min(2, span), span * clamp(level));
  const wet = from > to ? (px, py) => py >= from - reach && window(px, py) : (px, py) => py < from + reach && window(px, py);
  const core = insetIn(wet, 1);
  const b = clamp(beat), all = place(window), full = place(wet), heart = place(core);
  g.fill(0, 0, g.w, g.h, all, empty ?? C.deep);
  g.fill(0, 0, g.w, g.h, full, b >= 0.3 ? C.light : C.base);
  g.fill(0, 0, g.w, g.h, heart, b >= 0.6 ? '#ffffff' : b >= 0.3 ? mix(C.light, '#ffffff', 0.5) : C.light);
  return { wet: full, core: heart };
}

// ---- light round a thing, and a band on a turning ball ------------------------------------

/**
 * Shape test for a halo: the pixels just outside the ink outline of a thing, beside the part of it that is lit (a glowing tube flaring on a beat, a lamp, a hot barrel). Draw it after g.outline, in a light tone of the glow.
 * Arguments: body (shape test of the whole thing, everything g.outline will rim); lit (shape test of its lit part, inside the body or on its edge; a pixel is in the halo when it is two pixels straight out from a lit pixel and neither in the body nor on its outline).
 */
export function haloIn(body, lit) {
  const near = (f, px, py, d) => f(px - d, py) || f(px + d, py) || f(px, py - d) || f(px, py + d);
  return (px, py) => !body(px, py) && !near(body, px, py, 1) && near(lit, px, py, 2);
}

/**
 * Shape test for a band that runs from pole to pole over the near side of a ball turning about its upright axis: at turn 0 it is a bar down the middle; as the turn grows it crosses to the right limb, comes round the back and crosses in again from the left (one crossing per half turn).
 * Arguments: cx, cy (centre of the ball); rx, ry (its radii); turn (radians; PI brings the band back to the middle); thick (width of the band in pixels, default 2).
 */
export function meridianIn(cx, cy, rx, ry, turn = 0, thick = 2) {
  const s = Math.sin(turn), k = Math.cos(turn) >= 0 ? s : -s, half = thick / 2, reach = Math.abs(k) * rx;
  return (px, py) => {
    const dx = px - cx, yy = (py - cy) / ry;
    if ((dx / rx) ** 2 + yy * yy > 1) return false;
    if (Math.abs(dx - k * rx * Math.sqrt(1 - yy * yy)) < half) return true;          // where the band runs up and down
    const u = reach > 1e-6 ? (dx * Math.sign(k)) / reach : -1;                         // where it runs across, near the poles
    return u >= 0 && u <= 1 && Math.abs(Math.abs(py - cy) - ry * Math.sqrt(1 - u * u)) < half;
  };
}
