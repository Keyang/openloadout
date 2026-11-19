// Crystal corner marks drawn at a given place (added with batch K26 fix round 1, bundles/specs/core-sprites-3.md):
// the frost fern, upright shards, hanging icicles and the two glints of the crystal skin (engine/ui-skins-more.js,
// skin `crystal`), for the pieces where moreSkinMarks finds no room for them (a bar housing's band lies between two
// ink lines; a 20 px check box's corner zone is smaller than the fern), and to finish the ferns it does draw.
//
//   crystalFern(g, 9, 9, 1, 1, { stem: T.facetLight, tip: T.accent, len: 3, branches: 1, can })
//   crystalShards(g, 5, 10, 1, [5, 3], { light: T.facetLight, dark: T.facetDark, tip: T.white })
//   crystalIcicles(g, 5, 5, 1, [2, 3, 1], { light: T.facetLight, tip: T.white })
//   crystalGlint(g, 6, 3, 'plus', { color: T.white })      crystalGlint(g, 6, 12, 'sparkle', { color: T.accent, sx: 1, sy: -1 })
//   crystalFernRoots(g, body, { inside, stem, tip })        // grows each fern moreSkinMarks drew back to its cut corner
//   crystalCornerIn(g, body, 3, inside)                     // how far along a corner's diagonal the face starts
//   crystalOnPiece(g, (px, py) => ...)                      // a `can`: only on pixels already drawn (and the test)
//   crystalOnColours(g, [face, band])                       // a `can`: only on pixels of these colours
//   crystalCornerFern(g, box, 0, face, { stem, tip, len: 3, can })   // a fern from the band at a corner, inwards
//   crystalRecolour(g, 4, 16, 12, frame, accent)            // a run of one row from one colour to another
//
//   fern     a 1 px diagonal stem `len` px long from (x, y) in the direction (sx, sy), its next pixel the `tip`; side
//            branches 1 px either side of the stem's 2nd, 3rd ... pixel (`branches` pairs), as moreSkinMarks lays them,
//            or with `alternate` one branch at each of those pixels, on alternate sides (a small fern that never
//            makes an X, for a piece too small for the pairs)
//   shards   upright shards 2 px wide standing on row y and rising, one per height, `gap` px apart, going (sx) from x:
//            the column nearer the corner dark, the other lit, its top pixel `tip`, so each shard ends in a point
//            (`gap` may be a list, one gap after each shard but the last)
//   icicles  1 px spikes hanging from row y, one per length, `gap` px apart (never touching, so no bar forms across
//            their tops), their last pixel `tip`
//   glint    'plus' (a centre and four 1 px arms, 5 px) or 'sparkle' (a centre and two diagonal pixels, 3 px)
// `can(px, py)` says where a mark may be painted (default: anywhere on the surface). Every function returns the list
// of pixels it painted, [[x, y], ...], so a sprite can widen its slice to hold them.

import { col, INK } from './color.js';
import { desaturate } from './ui.js';

const paint = (g, px, py, c, can, out) => {
  if (px < 0 || py < 0 || px >= g.w || py >= g.h || (can && !can(px, py))) return;
  g.data[py * g.w + px] = col(c);
  out.push([px, py]);
};

/**
 * Draws a frost fern: a 1 px diagonal stem `len` px long from (x, y) going (sx, sy), then its tip pixel, with `branches` pairs of 1 px side branches: returns the pixels painted.
 * Arguments: g; x, y (the stem's first pixel, at the corner); sx, sy (+1 or -1: the way in); opt { stem, tip (colours), len (default 4), branches (pairs, or with `alternate` single branches; default 2), alternate (default false), can }.
 */
export function crystalFern(g, x, y, sx, sy, { stem, tip, len = 4, branches = 2, alternate = false, can = null } = {}) {
  const out = [];
  for (let i = 0; i < len; i++) paint(g, x + sx * i, y + sy * i, stem, can, out);
  paint(g, x + sx * len, y + sy * len, tip, can, out);
  for (let i = 1; i <= Math.min(branches, len - 1); i++) {
    if (!alternate || i % 2) paint(g, x + sx * (i + 1), y + sy * (i - 1), stem, can, out);
    if (!alternate || !(i % 2)) paint(g, x + sx * (i - 1), y + sy * (i + 1), stem, can, out);
  }
  return out;
}

/**
 * Draws upright crystal shards standing on row y, 2 px wide, one per height, from column x going sx (away from the corner), `gap` px apart: returns the pixels painted.
 * Arguments: g; x (the first shard's column nearer the corner); y (the row they stand on: their lowest pixel); sx (+1 or -1); heights (px, one per shard); opt { light, dark, tip, gap (px between shards, or a list of them; default 1), can }.
 */
export function crystalShards(g, x, y, sx, heights, { light, dark, tip, gap = 1, can = null } = {}) {
  const out = [];
  let u = 0;
  for (const [k, h] of heights.entries()) {
    const near = x + sx * u, far = x + sx * (u + 1);
    for (let i = 0; i < h; i++) {
      // the far column is the full height, its top the tip; the near column stops a pixel short, so the shard points
      if (i < h - 1) paint(g, near, y - i, dark, can, out);
      paint(g, far, y - i, i === h - 1 ? tip : light, can, out);
    }
    u += 2 + (Array.isArray(gap) ? gap[k] ?? 1 : gap);
  }
  return out;
}

/**
 * Draws icicles: 1 px spikes hanging from row y, one per length, from column x going sx, `gap` px apart, each ending in its tip pixel: returns the pixels painted.
 * Arguments: g; x; y (the row they hang from); sx (+1 or -1); lens (px, one per icicle); opt { light, tip, gap (default 1), can }.
 */
export function crystalIcicles(g, x, y, sx, lens, { light, tip, gap = 1, can = null } = {}) {
  const out = [];
  lens.forEach((len, k) => { const px = x + sx * k * (1 + gap); for (let i = 0; i < len; i++) paint(g, px, y + i, i === len - 1 ? tip : light, can, out); });
  return out;
}

/**
 * Draws a glint centred on (x, y): 'plus' (5 px) or 'sparkle' (3 px: the centre and the pixels at (+sx, +sy) and (-sx, -sy)): returns the pixels painted.
 * Arguments: g; x, y; kind ('plus' or 'sparkle'); opt { color, sx, sy (the sparkle's diagonal, default 1, 1), can }.
 */
export function crystalGlint(g, x, y, kind, { color, sx = 1, sy = 1, can = null } = {}) {
  if (kind !== 'plus' && kind !== 'sparkle') throw new Error(`crystalGlint: kind "${kind}" is not plus or sparkle`);
  const out = [];
  const at = kind === 'plus' ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0], [sx, sy], [-sx, -sy]];
  for (const [u, v] of at) paint(g, x + u, y + v, color, can, out);
  return out;
}

/**
 * Grows each frost fern moreSkinMarks drew (style rime) back to its cut corner: on each corner's diagonal, where the first pixel of the `inside` colour starts a stem of `stem` whose 4th pixel is `tip`, the pixel before it (the band's inner pixel) is painted `stem`, so the stem is 4 px plus its tip and starts at the cut. Returns the pixels painted.
 * Arguments: g; box ({ x, y, w, h }: the piece's slab); opt { inside (the face colour the fern lies on), stem, tip, ink (never painted over; its grey neither), corners (which of top left, top right, bottom right, bottom left; default all) }.
 */
export function crystalFernRoots(g, box, { inside, stem, tip, ink = INK, corners = [true, true, true, true] } = {}) {
  const out = [], inks = new Set([col(ink), col(desaturate(ink))]);
  const C = [[box.x, box.y, 1, 1], [box.x + box.w - 1, box.y, -1, 1], [box.x + box.w - 1, box.y + box.h - 1, -1, -1], [box.x, box.y + box.h - 1, 1, -1]];
  const get = (px, py) => (px < 0 || py < 0 || px >= g.w || py >= g.h ? 0 : g.data[py * g.w + px]);
  const S = col(stem), T = col(tip), I = col(inside);
  C.forEach(([cx, cy, sx, sy], c) => {
    if (!corners[c]) return;
    for (let i = 1; i < Math.min(box.w, box.h) >> 1; i++) {
      const at = (k) => get(cx + sx * k, cy + sy * k);
      // the fern's first pixel: stem, stem, stem, tip along the diagonal, the pixel before it neither ink nor empty
      if (at(i) === S && at(i + 1) === S && at(i + 2) === S && at(i + 3) === T) {
        const r = at(i - 1);
        if (r && !inks.has(r) && r !== S && r !== I) paint(g, cx + sx * (i - 1), cy + sy * (i - 1), stem, null, out);
        return;
      }
    }
  });
  return out;
}

/**
 * How many steps along a corner's diagonal (from the corner pixel inwards) the first pixel of the `inside` colour lies: the corner zone's depth, where moreSkinMarks starts its marks. Returns -1 when the diagonal never reaches it.
 * Arguments: g; box ({ x, y, w, h }); corner (0 top left, 1 top right, 2 bottom right, 3 bottom left); inside (a colour).
 */
export function crystalCornerIn(g, box, corner, inside) {
  const [cx, cy, sx, sy] = [[box.x, box.y, 1, 1], [box.x + box.w - 1, box.y, -1, 1], [box.x + box.w - 1, box.y + box.h - 1, -1, -1], [box.x, box.y + box.h - 1, 1, -1]][corner];
  const I = col(inside);
  for (let i = 0; i < Math.min(box.w, box.h); i++) {
    const px = cx + sx * i, py = cy + sy * i;
    if (px >= 0 && py >= 0 && px < g.w && py < g.h && g.data[py * g.w + px] === I) return i;
  }
  return -1;
}

/**
 * A `can` for the functions above: true on pixels already drawn (not empty), and where `also(px, py)` holds when it is given, so a mark never grows past the piece's outline.
 * Arguments: g; also (optional test).
 */
export function crystalOnPiece(g, also = null) {
  return (px, py) => px >= 0 && py >= 0 && px < g.w && py < g.h && !!g.data[py * g.w + px] && (!also || also(px, py));
}

/**
 * A `can` for the functions above: true only on pixels of one of `colours`, so a mark lies on the face and the band and never on a tick, a dot or a knob.
 * Arguments: g; colours (a list of colours).
 */
export function crystalOnColours(g, colours) {
  const ok = new Set(colours.filter(Boolean).map(col));
  return (px, py) => px >= 0 && py >= 0 && px < g.w && py < g.h && ok.has(g.data[py * g.w + px]);
}

/**
 * Draws a frost fern growing in from a corner of `box` along its diagonal, its stem starting `back` pixels before the first pixel of the `inside` colour (1: the band's inner pixel), so it grows out of the band: returns the pixels painted ([] where the diagonal never meets `inside`).
 * Arguments: g; box ({ x, y, w, h }); corner (0 top left, 1 top right, 2 bottom right, 3 bottom left); inside (the face colour); opt (crystalFern's: stem, tip, len, branches, alternate, can; and back, default 1).
 */
export function crystalCornerFern(g, box, corner, inside, { back = 1, ...opt } = {}) {
  const k = crystalCornerIn(g, box, corner, inside);
  if (k < back) return [];
  const [cx, cy, sx, sy] = [[box.x, box.y, 1, 1], [box.x + box.w - 1, box.y, -1, 1], [box.x + box.w - 1, box.y + box.h - 1, -1, -1], [box.x, box.y + box.h - 1, 1, -1]][corner];
  return crystalFern(g, cx + sx * (k - back), cy + sy * (k - back), sx, sy, opt);
}

/**
 * Repaints the pixels of row y from column x0 to x1 (inclusive) that are colour `from` in colour `to`: returns the pixels painted.
 * Arguments: g; x0, x1, y; from, to (colours).
 */
export function crystalRecolour(g, x0, x1, y, from, to) {
  const out = [], F = col(from), C = col(to);
  if (y < 0 || y >= g.h) return out;
  for (let px = Math.max(0, Math.min(x0, x1)); px <= Math.min(g.w - 1, Math.max(x0, x1)); px++) if (g.data[y * g.w + px] === F) { g.data[y * g.w + px] = C; out.push([px, y]); }
  return out;
}
