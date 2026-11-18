// Plated metal floors seen from above, and what is fitted into them: the hard-surface partner of the soft ground in
// engine/tiles.js (docs/style-guide.md, sections 6 and 14). Added with batch S03 (sprites/tiles-station-floor.js, the
// worked example); the other station tilesets (walls, pit) and metal props are meant to share it.
//
//   import { patternFill, drawBlock, textureTone, textureLight } from '../engine/tiles.js';
//   import { platingSeams, platingSpots, rimPlates, drawBolt, drawGrate, fanBladesIn, splatIn } from '../engine/plating.js';
//
//   // a fill: the plate colour, its seams, and a few marks on the bare metal between them
//   const fill = patternFill(p.floor, (s) => {
//     const boxes = platingSeams(s, p.style, { seam: textureTone(p.floor), lit: textureLight(p.floor, p.floor, 0.4) });
//     platingSpots(boxes, { w: 5, h: 4, seed: 1 }).slice(0, 2).forEach(([x, y]) => drawBolt(s, x, y, { lit, dark }));
//   });
//   // a second floor laid on the first (a walkway, an inset area): its rim is a row of trim plates, one per tile
//   const rim = rimPlates({ depth: p.edge, line: seam, face: p.floor, outer: lit });
//   drawBlock(g, piece, { ink: null, fill, top: rim, right: rim, bottom: rim, left: rim });
//
// What is different about a hard floor:
//   - its seams are meant to repeat, so they lie ON the tile boundary (style 'panels') or divide the tile evenly
//     ('grid', 'hex'); no version of a fill may move them. What varies from tile to tile is what lies between them:
//     bolts, scuffs, stains. platingSeams hands back the boxes of bare plate where such marks are safe
//   - an edge band that is the same depth all along shows a notch wherever a lane one tile wide bends, forks or
//     crosses, because those cells are drawn with pieces that have no inner corner. rimPlates cuts both ends of the
//     band on every tile at 45 degrees, so nothing but the 1 px line reaches a tile's corner and no piece is missing
//   - light comes from the top right: a groove shows a lit lip on its lower left side, a raised plate is lit along
//     its top and right edges, a bolt at its top right
//
// Everything here is pure and repeatable (no Math.random, no state between calls) and draws with hard pixel edges.
// The drawing helpers write flat colours through Surface.dot and Surface.rect only: they suit the pixel style.

import { hash, TAU } from './motion.js';

const T = 32, M = T - 1;
const wrap = (v) => ((Math.floor(v) % T) + T) % T;

// ---- seams -----------------------------------------------------------------------------------

/** The plate layouts platingSeams knows: panels (one plate per tile), grid (four per tile), hex (a honeycomb of plates 24 px wide and 16 tall). No arguments: a frozen list. */
export const PLATING_STYLES = Object.freeze(['panels', 'grid', 'hex']);

// is (x, y) on a seam? Each layout repeats every 32 px both ways.
function seamAt(style, x, y) {
  x = wrap(x); y = wrap(y);
  if (style === 'hex') {
    // flat-topped cells with 45 degree sides: a flat of 8 px, a slant of 8 px, repeating every 32 px across and 16 down
    const v = y % 16;
    if (v === 0 && x <= 8) return true;
    if (v === 8 && x >= 16 && x <= 24) return true;
    if (x >= 8 && x <= 16 && (x - 8 === v || x - 8 === 16 - v)) return true;
    return x >= 24 && (x - 24 === 8 - v || x - 24 === v - 8);
  }
  if (y === 0 || x === M) return true;
  return style === 'grid' && (y === 16 || x === 15);
}

// Boxes of bare plate, 3 px or more inside the tile and 3 px or more from every seam (its lip included).
const SAFE = {
  panels: [[3, 4, 27, 28]],
  grid: [[3, 4, 11, 12], [19, 4, 27, 12], [3, 20, 11, 28], [19, 20, 27, 28]],
  hex: [[3, 5, 10, 11], [14, 13, 25, 19], [3, 21, 10, 27]],
};

/**
 * Draws the seams of a plated metal floor on a tile's pattern so that they repeat every 32 px, each groove with a lit lip on its lower left side, and returns the boxes of bare plate between them.
 * Arguments: s (the 32x32 Surface that patternFill hands to its drawing, already filled with the plate's colour); style (one of PLATING_STYLES: 'panels' puts the seams on the tile's first row and last column, so one tile is one plate; 'grid' adds a row and a column through the middle; 'hex' is a honeycomb with no line along the tile boundary); options { seam (the colour of the grooves), lit (the colour of the lip: the row under a level groove, the column left of an upright one, the pixel under a groove that falls to the right; left out: no lip) }.
 * Returns [{ x0, y0, x1, y1 }]: boxes (both ends included) of plate that keep 3 px off the tile's edge and off every seam, where a version of the fill may put its marks (platingSpots divides them up).
 * Every version of a fill must call it with the same style: the seams are the tile's edge lines.
 */
export function platingSeams(s, style, { seam, lit = null } = {}) {
  if (!SAFE[style]) throw new Error(`platingSeams: "${style}" is not a plate layout (${PLATING_STYLES.join(', ')})`);
  const on = (x, y) => seamAt(style, x, y);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!on(x, y)) continue;
    if (seam) s.dot(x, y, seam);
    if (!lit) continue;
    // a groove that rises to the right runs along the light and has no lit side
    if (on(x - 1, y + 1) && !on(x - 1, y) && !on(x, y + 1)) continue;
    if (!on(x, y + 1)) s.dot(x, wrap(y + 1), lit);
    else if (!on(x - 1, y)) s.dot(wrap(x - 1), y, lit);
  }
  return SAFE[style].map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1 }));
}

/**
 * Divides boxes of bare plate into places for small marks (bolts, scuffs, stains) that never touch each other, a seam or the tile's edge, in an order shuffled by a seed; take as many from the front as you need.
 * Arguments: boxes ([{ x0, y0, x1, y1 }], as platingSeams returns them); options { w, h (the size of one mark in px, default 5 by 4), seed (another seed, another order: give each version of a fill its own, default 0), avoid ([[x, y, w, h], ...]: boxes already taken, such as bolts; a place within 1 px of one is left out) }.
 * Returns [[x, y], ...]: the top-left pixel of each place, 1 px or more apart, the same every time for the same arguments.
 */
export function platingSpots(boxes, { w = 5, h = 4, seed = 0, avoid = [] } = {}) {
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  const out = [];
  for (const b of boxes ?? []) {
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const nx = Math.floor((bw + 1) / (W + 1)), ny = Math.floor((bh + 1) / (H + 1));
    if (nx < 1 || ny < 1) continue;
    const ox = b.x0 + Math.floor((bw - (nx * (W + 1) - 1)) / 2), oy = b.y0 + Math.floor((bh - (ny * (H + 1) - 1)) / 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push([ox + i * (W + 1), oy + j * (H + 1)]);
  }
  const free = out.filter(([x, y]) => !avoid.some(([ax, ay, aw = 1, ah = 1]) => x < ax + aw + 1 && x + W > ax - 1 && y < ay + ah + 1 && y + H > ay - 1));
  return free.map((spot, i) => ({ spot, k: hash(i * 7 + 3, (seed | 0) * 31 + 11) })).sort((a, b) => a.k - b.k || a.spot[1] - b.spot[1] || a.spot[0] - b.spot[0]).map((e) => e.spot);
}

// ---- the rim of a floor laid on a floor ---------------------------------------------------------

/**
 * An edge for drawBlock that is a row of bevelled trim plates, one per tile: a line along the outline and a band whose two ends are cut at 45 degrees, so a lane one tile wide bends, forks and crosses with no notch.
 * Arguments: options { depth (px of rim, its line included: 2 or more, default 4), line (the colour of the outline row, or null to show the fill), face (the colour of the band), outer (the colour of the band's first row, just inside the line; default: face), inner (the colour of the band's last row at each place, which follows the cut ends; default: face), cast (the colour of one more row beyond the band where it is full depth: the shadow a raised rim throws on the floor inside it; default: none) }.
 * Returns { depth, paint }: give it to a material as top, bottom, left or right, with `ink: null` (the line is the band's first pixel). Use it for all four edges, each with its own colours: at an outer corner two bands meet in a mitre, and an inner corner holds nothing but its corner pixel, as do the cells where a lane turns.
 */
export function rimPlates({ depth = 4, line = null, face = null, outer = null, inner = null, cast = null } = {}) {
  const D = Math.max(2, Math.round(depth));
  return {
    depth: D + (cast ? 1 : 0),
    paint(d, u) {
      if (d === 1) return line;
      const k = Math.min(wrap(u), M - wrap(u)), reach = Math.min(D, k);
      if (d > reach) return cast && d === D + 1 && k > D ? cast : null;
      if (inner && d === reach) return inner;
      if (outer && d === 2) return outer;
      return face;
    },
  };
}

// ---- fittings ------------------------------------------------------------------------------------

/**
 * Draws a bolt head or rivet two pixels square: lit at its top right, dark at its lower left, with no outline of its own.
 * Arguments: g (the Surface); x, y (its top-left pixel); options { lit (the colour of the top right pixel), dark (the lower left pixel), face (the other two; default: lit) }.
 */
export function drawBolt(g, x, y, { lit, dark, face = lit } = {}) {
  g.dot(x, y, face); g.dot(x + 1, y + 1, face);
  g.dot(x + 1, y, lit);
  g.dot(x, y + 1, dark);
  return g;
}

/**
 * Draws a slatted grate lying in a floor or set in a wall: a frame one pixel wide and, inside it, slats that repeat every `pitch` rows, each a lit row, bar rows and a row of dark slot.
 * Arguments: g (the Surface); x, y (the frame's top-left pixel); w, h (its size, frame included); options { frame (the frame's colour), bar (the slats), slot (the gaps between them), lit (the first row of each slat, where the light catches it; left out: bar), pitch (rows from one slat to the next, 2 or more, default 3), upright (true: the slats run down the grate and repeat across it) }.
 * Returns { x0, y0, x1, y1 }: the box inside the frame, both ends included.
 */
export function drawGrate(g, x, y, w, h, { frame, bar, slot, lit = null, pitch = 3, upright = false } = {}) {
  const P = Math.max(2, Math.round(pitch));
  g.rect(x, y, w, 1, frame); g.rect(x, y + h - 1, w, 1, frame);
  g.rect(x, y, 1, h, frame); g.rect(x + w - 1, y, 1, h, frame);
  for (let j = 0; j < h - 2; j++) for (let i = 0; i < w - 2; i++) {
    const r = (upright ? i : j) % P;
    g.dot(x + 1 + i, y + 1 + j, r === P - 1 ? slot : r === 0 && lit ? lit : bar);
  }
  return { x0: x + 1, y0: y + 1, x1: x + w - 2, y1: y + h - 2 };
}

/**
 * Shape test for the blades of a fan or rotor seen from straight above: wedges round a hub, each swept back towards its tip; returns inside(px, py).
 * Arguments: cx, cy (the hub's centre); r (px to the blade tips); options { blades (how many, default 3), angle (the turn in radians, clockwise on screen; a turn of one blade step, TAU / blades, gives the same picture, so a looping clip turns that far), hub (px round the centre left clear for a hub cap, default 1.5), duty (the share of the circle that is blade, default 0.5), sweep (radians a blade's tip trails its root, default 0.5; 0 for straight wedges) }.
 */
export function fanBladesIn(cx, cy, r, { blades = 3, angle = 0, hub = 1.5, duty = 0.5, sweep = 0.5 } = {}) {
  const step = TAU / Math.max(1, Math.round(blades));
  return (px, py) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d > r || d < hub) return false;
    const a = Math.atan2(dy, dx) - angle - sweep * (d / r);
    return (((a % step) + step) % step) < step * duty;
  };
}

/**
 * Shape test for something that hit the floor and spread: one lumpy, lopsided body round a centre with small droplets flung out past it (goo, blood, oil, paint, soot); returns inside(px, py).
 * Arguments: cx, cy (the centre); r (px to the body's longest lobes; the droplets lie up to 1.6 times as far out); options { seed (another seed, another splat), lobes (how many bulges the body has, default 5), drops (how many droplets, default 4), squash (its height as a share of its width, default 1: seen from straight above) }.
 */
export function splatIn(cx, cy, r, { seed = 0, lobes = 5, drops = 4, squash = 1 } = {}) {
  const n = Math.max(2, Math.round(lobes)), ph = hash(seed, 1) * TAU, ph2 = hash(seed, 2) * TAU;
  const dots = [];
  for (let i = 0; i < Math.max(0, Math.round(drops)); i++) {
    const a = (TAU * (i + hash(seed, 10 + i) * 0.7)) / Math.max(1, drops) + ph, dist = r * (1.25 + 0.35 * hash(seed, 20 + i));
    dots.push([cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * squash, 0.9 + 0.9 * hash(seed, 30 + i)]);
  }
  return (px, py) => {
    const dx = px - cx, dy = (py - cy) / squash;
    const a = Math.atan2(dy, dx);
    if (Math.hypot(dx, dy) <= r * (0.68 + 0.17 * Math.sin(n * a + ph) + 0.15 * Math.sin(2 * a + ph2))) return true;
    for (const [x, y, rad] of dots) if ((px - x) ** 2 + (py - y) ** 2 <= rad * rad) return true;
    return false;
  };
}

// ---- marks of use ---------------------------------------------------------------------------------

/** The marks of use drawPlateMark knows, each fitting a place 5 px by 4: scratch (a thin slanted line), scuff (two short rubbed dashes), pit (a small dent). No arguments: a frozen list. */
export const PLATE_MARKS = Object.freeze(['scratch', 'scuff', 'pit']);

/**
 * Draws one small mark of use on bare metal, inside a place 5 px wide and 4 high (as platingSpots hands them out): a scratch, a scuff or a pit, in one flat colour.
 * Arguments: g (the Surface, usually the one patternFill hands to its drawing); kind (one of PLATE_MARKS); x, y (the top-left pixel of the place); colour (a light tone for a scratch or a scuff, where bright metal shows; a dark tone for a pit).
 */
export function drawPlateMark(g, kind, x, y, colour) {
  if (kind === 'scratch') for (let i = 0; i < 4; i++) g.dot(x + i, y + 3 - i, colour);
  else if (kind === 'scuff') { g.rect(x, y + 1, 3, 1, colour); g.rect(x + 2, y + 2, 3, 1, colour); }
  else if (kind === 'pit') { g.rect(x + 1, y + 1, 2, 1, colour); g.rect(x + 2, y + 2, 2, 1, colour); }
  else throw new Error(`drawPlateMark: "${kind}" is not a mark (${PLATE_MARKS.join(', ')})`);
  return g;
}
