// Paper tear (added with batch K11 fix round 1, bundles/specs/core-sprites-2.md): a deckled edge bitten along
// every side of a piece already drawn, a folded-down corner, and diagonal hatch lines, for paper-and-ink pieces.
// engine/ui-skins.js and engine/ui-paper.js only bite and fold inside the corner zones of a piece, which leaves a
// torn page with a few nicks at its corners; these work on the drawn pixels of any piece instead.
//
//   const out = skinButton(g, 1, 1, 94, 30, 'normal', 'paper', { style: 'torn', shadow: true, ... });
//   tearEdges(g, out.body, deckleBites(out.body), { shadow: { dx: -2, dy: 2, colour: INK } });
//   foldCorner(g, out.body, 5, { flap: tone(face, -1), shadow: { dx: -2, dy: 2, colour: INK } });
//   hatchLines(g, opening, frame, { pitch: 4 });
//
// tearEdges only removes pixels of the piece (never adds one outside it): each bite takes `depth` px off the side,
// counted from the first drawn pixel, and every pixel of the piece the bite uncovers is inked again. With
// `shadow` (the piece's drop shadow is `colour`, moved dx, dy), a bite shows the shadow behind it and the shadow
// gets the same bite, so the shadow keeps following the piece.

import { col, INK } from './color.js';

/** The four sides tearEdges knows. No arguments: a frozen list. */
export const TEAR_SIDES = Object.freeze(['top', 'right', 'bottom', 'left']);

/**
 * Evenly spread bites along the sides of a box: a list of { side, at, w } (at: px from the side's start, left or top).
 * Arguments: box { x, y, w, h }; opt { margin (px kept clear at each end of a side, default 8), pitch (px from one bite to the next, default 9), widths (cycled bite widths, default [2, 3]), sides (default all four) }.
 */
export function deckleBites(box, { margin = 8, pitch = 9, widths = [2, 3], sides = TEAR_SIDES } = {}) {
  const out = [];
  let n = 0;
  for (const side of sides) {
    if (!TEAR_SIDES.includes(side)) throw new Error(`deckleBites: side "${side}" is not one of ${TEAR_SIDES.join(', ')}`);
    const len = side === 'top' || side === 'bottom' ? box.w : box.h;
    const free = len - 2 * margin;
    if (free < 2) continue;
    const count = Math.max(1, Math.floor((free + pitch - 2) / pitch));
    // centre the run of bites on the side; alternate the widths and a 1 px wobble so the edge does not look ruled
    const span = (count - 1) * pitch, start = margin + Math.floor((free - span - 2) / 2);
    for (let i = 0; i < count; i++) {
      const w = widths[n++ % widths.length];
      const at = Math.max(margin, Math.min(len - margin - w, start + i * pitch + (i % 2 ? 1 : 0)));
      out.push({ side, at, w });
    }
  }
  return out;
}

// The mask of a piece: its drawn pixels inside the box.
function maskOf(g, box) {
  const m = new Uint8Array(g.w * g.h);
  for (let py = Math.max(0, box.y); py < Math.min(g.h, box.y + box.h); py++) for (let px = Math.max(0, box.x); px < Math.min(g.w, box.x + box.w); px++) if (g.data[py * g.w + px]) m[py * g.w + px] = 1;
  return m;
}

// After pixels of a piece were removed: shows its shadow behind them and takes them out of the shadow too.
function mendShadow(g, m, cleared, shadow) {
  const at = (px, py) => px >= 0 && py >= 0 && px < g.w && py < g.h;
  if (!shadow) { for (const i of cleared) g.data[i] = 0; return; }
  const { dx, dy } = shadow, c = col(shadow.colour ?? INK);
  const cast = (px, py) => { const qx = px - dx, qy = py - dy; return at(qx, qy) && m[qy * g.w + qx]; };
  for (const i of cleared) {
    const px = i % g.w, py = (i - px) / g.w;
    g.data[i] = cast(px, py) ? c : 0;
    const sx = px + dx, sy = py + dy;
    if (at(sx, sy) && !m[sy * g.w + sx] && g.data[sy * g.w + sx] && !cast(sx, sy)) g.data[sy * g.w + sx] = 0;
  }
}

/**
 * Bites a drawn piece along its sides: removes `depth` px at each bite and inks every pixel of the piece next to a removed one. Returns the set of removed pixel indices.
 * Arguments: g; box { x, y, w, h } (the piece, its shadow left out); bites (from deckleBites, or { side, at, w } of your own); opt { depth (default 2), ink, shadow ({ dx, dy, colour }: the piece's drop shadow) }.
 */
export function tearEdges(g, box, bites, { depth = 2, ink = INK, shadow = null } = {}) {
  const m = maskOf(g, box), cleared = new Set();
  const on = (px, py) => px >= box.x && py >= box.y && px < box.x + box.w && py < box.y + box.h && m[py * g.w + px];
  for (const { side, at, w } of bites) {
    if (!TEAR_SIDES.includes(side)) throw new Error(`tearEdges: side "${side}" is not one of ${TEAR_SIDES.join(', ')}`);
    for (let k = 0; k < w; k++) {
      // walk in from the side to the first pixel of the piece, then take `depth` px
      const across = side === 'top' || side === 'bottom';
      const len = across ? box.h : box.w;
      for (let s = 0, taken = 0; s < len && taken < depth; s++) {
        const px = across ? box.x + at + k : side === 'left' ? box.x + s : box.x + box.w - 1 - s;
        const py = across ? (side === 'top' ? box.y + s : box.y + box.h - 1 - s) : box.y + at + k;
        if (!on(px, py)) { if (taken) break; continue; }
        cleared.add(py * g.w + px); taken++;
      }
    }
  }
  for (const i of cleared) m[i] = 0;
  const c = col(ink);
  for (const i of cleared) {
    const px = i % g.w, py = (i - px) / g.w;
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) if (on(nx, ny)) g.data[ny * g.w + nx] = c;
  }
  mendShadow(g, m, cleared, shadow);
  return cleared;
}

/**
 * Folds the top right corner of a drawn piece down: the corner (u + v < size) cut away, an ink crease along the
 * diagonal, and the flap (the cut corner turned over, u + v > size, up to `size` px from both sides) in `flap`.
 * Returns { x, y, w, h }: the square it changed.
 * Arguments: g; box { x, y, w, h }; size (px, 2 or more); opt { flap (colour; required), ink, edge (true: ink the flap's two open sides as well), shadow ({ dx, dy, colour }) }.
 */
export function foldCorner(g, box, size, { flap, ink = INK, edge = false, shadow = null } = {}) {
  if (!flap) throw new Error('foldCorner: needs a flap colour');
  const F = Math.max(2, Math.round(size)), m = maskOf(g, box), cleared = new Set();
  const cx = box.x + box.w - 1, cy = box.y, c = col(ink), fc = col(flap);
  for (let v = 0; v <= F; v++) for (let u = 0; u <= F; u++) {
    const px = cx - u, py = cy + v;
    if (px < box.x || py >= box.y + box.h || px < 0 || py < 0 || px >= g.w || py >= g.h) continue;
    const i = py * g.w + px;
    if (u + v < F) { if (m[i]) { cleared.add(i); m[i] = 0; } continue; }
    g.data[i] = u + v === F || (edge && (u === F || v === F)) ? c : fc;
    m[i] = 1;
  }
  mendShadow(g, m, cleared, shadow);
  return { x: cx - F, y: cy, w: F + 1, h: F + 1 };
}

/**
 * Diagonal hatch lines (rising to the right, 1 px, `pitch` px apart) over the drawn pixels of a rectangle, as a hand-coloured chart is hatched.
 * Arguments: g; rect { x, y, w, h }; colour; opt { pitch (default 4), phase (shifts the lines sideways, default 0) }. Returns g.
 */
export function hatchLines(g, rect, colour, { pitch = 4, phase = 0 } = {}) {
  const c = col(colour), P = Math.max(2, Math.round(pitch));
  for (let j = 0; j < rect.h; j++) for (let i = 0; i < rect.w; i++) {
    const px = rect.x + i, py = rect.y + j;
    if (px < 0 || py < 0 || px >= g.w || py >= g.h || !g.data[py * g.w + px]) continue;
    if ((((i + j + phase) % P) + P) % P === 0) g.data[py * g.w + px] = c;
  }
  return g;
}

/**
 * Copies onto g, moved (dx, dy), every pixel inside rect where surface `withIt` differs from `without`: a mark a
 * helper draws (a pin, a gem) lifted off one drawing of a piece and set down again somewhere else. Returns g.
 * Arguments: g; withIt, without (two Surfaces of g's size, the piece drawn with and without the mark); rect { x, y, w, h }; opt { dx, dy (default 0) }.
 */
export function moveMark(g, withIt, without, rect, { dx = 0, dy = 0 } = {}) {
  for (let py = rect.y; py < rect.y + rect.h; py++) for (let px = rect.x; px < rect.x + rect.w; px++) {
    const v = withIt.get(px, py);
    if (!v || v === without.get(px, py)) continue;
    const qx = px + dx, qy = py + dy;
    if (qx >= 0 && qy >= 0 && qx < g.w && qy < g.h) g.data[qy * g.w + qx] = v;
  }
  return g;
}

/**
 * A tooltip's tail: a wedge of paper hanging under the bottom left of a sheet, its left side flush with the sheet's
 * left edge, inked round, `rows` tall and `width` + 1 px wide at its top, narrowing to 4 px; the sheet's bottom
 * edge is opened over it (`open` rows), so the paper runs down into the wedge. Clears whatever was drawn in its
 * box first. Returns { x, y, w, h }.
 * Arguments: g; x, y (the sheet's left edge column, and the row under the sheet); opt { rows (default 5), width (default 7), open (rows of the sheet's edge opened above it, default 3), face (colour; required), ink }.
 */
export function tooltipTail(g, x, y, { rows = 5, width = 7, open = 3, face, ink = INK } = {}) {
  if (!face) throw new Error('tooltipTail: needs a face colour');
  const f = col(face), c = col(ink), W = width + 1;
  const put = (px, py, v) => { if (px >= 0 && py >= 0 && px < g.w && py < g.h) g.data[py * g.w + px] = v; };
  for (let py = y; py < y + rows; py++) for (let px = x; px < x + W; px++) put(px, py, 0);
  const right = (r) => x + width - Math.round((r * (width - 3)) / Math.max(1, rows - 1));
  for (let r = 0; r < rows; r++) {
    const b = right(r);
    for (let px = x; px <= b; px++) put(px, y + r, px === x || px === b || r === rows - 1 ? c : f);
  }
  // the opening: the sheet's left ink runs straight down into the wedge's, the paper fills between
  for (let py = y - open; py < y; py++) { put(x, py, c); for (let px = x + 1; px < right(0); px++) put(px, py, f); put(right(0), py, c); }
  return { x, y, w: W, h: rows };
}
