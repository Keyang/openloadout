// Paper marks (added with batch K11, bundles/specs/core-sprites-2.md): the torn and card styles of the `paper` skin
// of engine/ui-skins.js, for the small pieces that module draws without them (a bar housing, a slider rail, a
// knob, a checkbox, a round option). skinPanel, skinButton and skinTab already draw these marks themselves; use
// this after the others, on the piece's own box, so a paper style shows on every piece of a paper sprite.
//
//   skinBarHousing(g, 1, 1, 62, 14, 'paper', { frame: p.frame });
//   paperMarks(g, 1, 1, 62, 14, p.style, { face: P.cream, keep: { x: 8, y: 4, w: 48, h: 8 }, fold: 3 });
//
// It only changes pixels already drawn inside the box (never adds one outside the piece):
//   sheet  nothing
//   torn   a 2x2 bite by each corner, along the top and bottom, and (on a piece 16 px wide and 12 tall or more) along the
//          sides; every pixel the bites uncover is edged in ink again
//   card   the top right corner folded down (a flap of the paper's dark tone, inked) and the paper's own colour
//          along the bottom two rows above the ink turned to its dark tone: the edge of a thick card
// `keep` is the flat middle a game stretches ({ x, y, w, h }): bites and the fold stay out of its columns and rows
// (the corner zones); the card edge runs the whole bottom, outside its rows, so it repeats cleanly sideways.

import { tone, col, INK } from './color.js';

/** The paper styles paperMarks knows: sheet (no marks), torn and card. No arguments: a frozen list. */
export const PAPER_MARK_STYLES = Object.freeze(['sheet', 'torn', 'card']);

/**
 * Adds the torn bites or the card fold and edge of the paper skin to a piece already drawn in (x, y, w, h), changing only its drawn pixels.
 * Arguments: g; x, y, w, h (the piece's box); style ('sheet', 'torn' or 'card'); opt { face (the paper colour drawn), keep ({ x, y, w, h }: the stretched middle to stay out of), fold (px, default 4), ink }.
 */
export function paperMarks(g, x, y, w, h, style, { face = '#f0ead8', keep = null, fold = 4, ink = INK } = {}) {
  if (!PAPER_MARK_STYLES.includes(style)) throw new Error(`paperMarks: style "${style}" is not one of ${PAPER_MARK_STYLES.join(', ')}`);
  if (style === 'sheet') return g;
  const inBox = (px, py) => px >= x && px < x + w && py >= y && py < y + h && px >= 0 && py >= 0 && px < g.w && py < g.h;
  const drawn = (px, py) => inBox(px, py) && !!g.data[py * g.w + px];
  const corner = (px, py) => !keep || ((px < keep.x || px >= keep.x + keep.w) && (py < keep.y || py >= keep.y + keep.h));
  const ok = (px, py) => drawn(px, py) && corner(px, py);
  const corners = [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x + w - 1, y + h - 1, -1, -1], [x, y + h - 1, 1, -1]];
  if (style === 'torn') {
    const gone = new Set();
    const bites = [[2, 0]];
    if (h >= 12 && w >= 16) bites.push([0, 3]);   // side bites only on a piece big enough to keep its shape
    for (const [cx, cy, sx, sy] of corners) for (const [u0, v0] of bites) for (let v = 0; v < 2; v++) for (let u = 0; u < 2; u++) {
      const px = cx + sx * (u0 + u), py = cy + sy * (v0 + v);
      if (ok(px, py)) gone.add(py * g.w + px);
    }
    for (const i of gone) g.data[i] = 0;
    const c = col(ink);
    for (const i of gone) {
      const px = i % g.w, py = (i - px) / g.w;
      for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) if (!gone.has(ny * g.w + nx) && ok(nx, ny)) g.data[ny * g.w + nx] = c;
    }
    return g;
  }
  // card: the edge first, then the fold over it
  const f = col(face), dark = col(tone(face, -1));
  for (let px = x; px < x + w; px++) for (const py of [y + h - 3, y + h - 2]) if (drawn(px, py) && (!keep || py >= keep.y + keep.h || py < keep.y) && g.data[py * g.w + px] === f) g.data[py * g.w + px] = dark;
  const F = Math.max(2, Math.round(fold)), cx = x + w - 1, flap = col(tone(face, -0.5)), c = col(ink);
  for (let v = 0; v <= F; v++) for (let u = 0; u <= F; u++) {
    const px = cx - u, py = y + v;
    if (!ok(px, py)) continue;
    if (u + v < F) g.data[py * g.w + px] = 0;
    else if (u + v === F || u === F || v === F) g.data[py * g.w + px] = c;
    else g.data[py * g.w + px] = flap;
  }
  return g;
}
