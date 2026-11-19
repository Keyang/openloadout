// Grove vine marks that read at game size (added with batch K27 fix round 1, bundles/specs/core-sprites-3.md).
// moreSkinMarks (engine/ui-skins-more.js) draws the grove skin's corner marks as a few pixels each: a checkered twist
// on the band right at the corner, a five-pixel flower that the leaves then cover, and two unrimmed leaves of the
// accent on the band. At 1x the vine reads as a plain pale rim. groveMarks runs moreSkinMarks (or a wrapper with its
// signature, such as moreSkinButtonMarks) without its Leaves, then draws over the corner zones:
//
//   twist   vine and bloom: across the whole corner zone (every band pixel outside `keep`'s columns and rows), a 1 px
//           stripe of the band's dark tone every 2 px, straight across the band: columns on the top and bottom
//           runs, rows on the sides, so the band reads as a twisted vine and not as a dithered rim; with `twistIn`
//           each stripe runs on that many pixels over the inside (a small piece whose band is only a rim).
//   leaves  every style, with `leaves`: two leaves of the accent per corner, 3x2 each, rimmed in the accent's dark
//           tone, lying across the band's inner edge (half on the band, half on the face), `leafAt` px or more from
//           the corner (default just past the flower). One lies along the top or bottom, the other along the side, or
//           (no room on the side, or `sideLeaf` false) 6 px past the first along the top or bottom, one row further out.
//   flower  bloom: a five-pixel flower of the accent round a gold middle in each top corner zone, rimmed in the
//           accent's dark tone, where moreSkinMarks puts it (one past the band on the corner's diagonal) or else at
//           the place nearest the corner where all five pixels fit; drawn last,
//           so the leaves never cover it (the leaves start past its rim). bloom's bottom buds stay as moreSkinMarks
//           draws them.
// Every mark stays off the outline, off ink (unless `overInk`, then only inner ink lines, never the outline), out of
// `skip` and `clear`, and out of `keep`'s columns and rows, so a piece that stretched before still stretches; the
// returned slice grows where a mark reaches further in, and `inner` is shrunk again to the flat face left.

import { col, tone, INK } from './color.js';
import { desaturate } from './ui.js';
import { moreSkinMarks, moreSkinTones } from './ui-skins-more.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inRects = (rects, px, py) => rects.some((r) => r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);

// Depth of every drawn pixel inside `box` from the nearest empty pixel or the box's edge (1 on the outline).
function depthOf(get, box) {
  const { x, y, w, h } = box, d = new Uint16Array(w * h);
  const drawn = (px, py) => px >= x && py >= y && px < x + w && py < y + h && get(px, py) !== 0;
  let edge = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j;
    if (drawn(px, py) && N4.some(([a, b]) => !drawn(px + a, py + b))) { d[j * w + i] = 1; edge.push([px, py]); }
  }
  for (let k = 2; edge.length; k++) {
    const next = [];
    for (const [px, py] of edge) for (const [a, b] of N4) {
      const nx = px + a, ny = py + b;
      if (drawn(nx, ny) && !d[(ny - y) * w + nx - x]) { d[(ny - y) * w + nx - x] = k; next.push([nx, ny]); }
    }
    edge = next;
  }
  return (px, py) => (px < x || py < y || px >= x + w || py >= y + h ? 0 : d[(py - y) * w + px - x]);
}

/**
 * Draws a grove piece's marks so they read at game size: moreSkinMarks without its Leaves, then a striped twist over each whole corner zone, two rimmed leaves per corner and a rimmed bloom flower: returns { inner, slice }.
 * Arguments: g; body (the piece's slab); style (vine, bark, bloom); opt (moreSkinMarks' options, with `leaves` for the Leaves extra; `base` a function with moreSkinMarks' signature, default moreSkinMarks; `leafAt` how far from the corner the leaves start; `sideLeaf` false keeps both leaves on the top and bottom runs; `twistIn` px each stripe runs on over the inside; `overInk` lets marks cover inner ink lines; `clear` rectangles the leaves and flower keep out of).
 */
export function groveMarks(g, body, style, opt = {}) {
  const { base = moreSkinMarks, leaves = false, leafAt = null, sideLeaf = true, twistIn = 0, overInk = false, clear = [], ...rest } = opt;
  const { face, frame, accent, state = 'normal', keep = null, skip = [], rect = null, ink = INK } = rest;
  const before = g.data.slice();
  const m = base(g, body, 'grove', style, { ...rest, extras: false });
  const T = moreSkinTones('grove', { face, frame, accent, style, state });
  const off = state === 'disabled', grey = (c) => (off ? desaturate(c) : c);
  const box = { x: Math.max(0, body.x), y: Math.max(0, body.y), w: Math.min(g.w, body.x + body.w) - Math.max(0, body.x), h: Math.min(g.h, body.y + body.h) - Math.max(0, body.y) };
  const at = (px, py) => (px < 0 || py < 0 || px >= g.w || py >= g.h ? 0 : before[py * g.w + px]);
  const depth = depthOf(at, box);
  const inks = new Set([col(ink), col(desaturate(ink))]);
  const bandC = col(T.band), twistC = col(T.twist);
  const isInk = (px, py) => inks.has(at(px, py));
  const inKeepCols = (px) => !!keep && px >= keep.x && px < keep.x + keep.w;
  const inKeepRows = (py) => !!keep && py >= keep.y && py < keep.y + keep.h;
  const zone = (px, py) => !inKeepCols(px) && !inKeepRows(py) && !inRects(skip, px, py);
  // a pixel a mark may cover: inside the outline, not ink (or an inner ink line with overInk), in a corner zone
  const free = (px, py) => depth(px, py) >= 2 && zone(px, py) && (!isInk(px, py) || (overInk && depth(px, py) >= 2 && N4.every(([a, b]) => depth(px + a, py + b) >= 1)));
  // the band as drawn before the marks: band-coloured pixels joined to the outside, found from the outermost inwards
  const band = new Set(), key = (px, py) => py * g.w + px, todo = [];
  for (let py = box.y; py < box.y + box.h; py++) for (let px = box.x; px < box.x + box.w; px++) if (at(px, py) === bandC && depth(px, py) <= 3) { band.add(key(px, py)); todo.push([px, py]); }
  while (todo.length) {
    const [px, py] = todo.pop();
    for (const [a, b] of N4) { const nx = px + a, ny = py + b; if (!band.has(key(nx, ny)) && at(nx, ny) === bandC && depth(nx, ny) >= 2 && depth(nx, ny) <= 5) { band.add(key(nx, ny)); todo.push([nx, ny]); } }
  }
  const isBand = (px, py) => band.has(key(px, py));
  const varying = [];
  const paint = (px, py, c) => { g.data[key(px, py)] = col(c); varying.push([px, py]); };
  const corners = [[box.x, box.y, 1, 1], [box.x + box.w - 1, box.y, -1, 1], [box.x + box.w - 1, box.y + box.h - 1, -1, -1], [box.x, box.y + box.h - 1, 1, -1]];
  const local = (c, u, v) => { const [cx, cy, sx, sy] = corners[c]; return [cx + sx * u, cy + sy * v]; };
  const halfW = box.w >> 1, halfH = box.h >> 1;

  // the colour just inside the band, down the middle column (the face, a well, a trough)
  const insideC = (() => { const mx = box.x + halfW; let passed = false; for (let py = box.y; py < box.y + box.h; py++) { if (isBand(mx, py)) { passed = true; continue; } const k = at(mx, py); if (passed && k && !inks.has(k)) return k; } return col(T.face); })();
  // the twist: across the band of each whole corner zone, a stripe of the dark tone on every second column (top and
  // bottom runs) or row (sides)
  if (style !== 'bark') for (let c = 0; c < 4; c++) for (let v = 0; v < halfH; v++) for (let u = 0; u < halfW; u++) {
    const [px, py] = local(c, u, v);
    if (!isBand(px, py) || !free(px, py) || isInk(px, py)) continue;
    // nearer the top or bottom (a horizontal run) when the outside is closer up or down than sideways
    let du = 0; while (du < u && isBand(...local(c, u - du - 1, v))) du++;
    let dv = 0; while (dv < v && isBand(...local(c, u, v - dv - 1))) dv++;
    const along = dv <= du ? u : v;
    const want = along % 2 === 0 ? twistC : bandC;
    // with twistIn, a dark stripe runs on past the band's inner edge over that many pixels of the inside
    if (want === twistC && twistIn > 0) {
      const step = (k) => (dv <= du ? local(c, u, v + k) : local(c, u + k, v));
      if (!isBand(...step(1))) for (let k = 1; k <= twistIn; k++) {
        const [qx, qy] = step(k);
        if (at(qx, qy) !== insideC || !free(qx, qy) || inRects(clear, qx, qy)) break;
        paint(qx, qy, T.twist);
      }
    }
    const now = g.data[key(px, py)];
    // a pixel moreSkinMarks gave a colour of its own (bloom's bud) keeps it
    if (now !== bandC && now !== twistC) continue;
    if (now !== want) paint(px, py, want === twistC ? T.twist : T.band);
    else varying.push([px, py]);
  }

  const leafC = grey(accent ?? T.accent), rimC = grey(tone(accent ?? T.accent, -1)), goldC = T.gold;
  const used = new Set();
  // pixels a leaf or flower body may sit on: free, not text, not a `clear` rectangle, and not already holding a
  // colour of its own (a tick, a dot: anything but the band, its twist, the face or the knot)
  const plain = new Set([bandC, twistC, col(T.face), col(T.knot), col(T.faceDark ?? T.face)]);
  plain.add(insideC);
  // never on the accent itself (a lit track, a tick): the flower and the leaves are the accent and would not show
  plain.delete(col(T.accent)); plain.delete(col(accent ?? T.accent));
  const seat = (px, py) => free(px, py) && !inRects(clear, px, py) && (plain.has(at(px, py)) || (overInk && isInk(px, py))) && !used.has(key(px, py));
  // a shape: its body pixels (all must seat) and its rim (drawn where free and not on another shape's body)
  const shape = (cells, rimCells, bodyC) => {
    if (!cells.every(([px, py]) => seat(px, py))) return false;
    for (const [px, py] of rimCells) if (free(px, py) && !inRects(clear, px, py) && !used.has(key(px, py)) && !isInk(px, py)) paint(px, py, rimC);
    for (const [px, py, k] of cells) { paint(px, py, k ?? bodyC); used.add(key(px, py)); }
    return true;
  };
  const rimOf = (cells) => {
    const inside = new Set(cells.map(([x, y]) => key(x, y))), out = new Map();
    for (const [x, y] of cells) for (const [a, b] of N4) { const k = key(x + a, y + b); if (!inside.has(k)) out.set(k, [x + a, y + b]); }
    return [...out.values()];
  };
  // the band's rows on the top (or bottom) run at column u, and its columns on the side run at row v, from a corner
  const runAcross = (c, u, vertical) => {
    let i = 0, first = -1, last = -1;
    for (; i < (vertical ? halfW : halfH); i++) {
      const [px, py] = vertical ? local(c, i, u) : local(c, u, i);
      if (isBand(px, py)) { if (first < 0) first = i; last = i; } else if (first >= 0) break;
    }
    return first < 0 ? null : { first, last };
  };

  // the flower's middle per corner, [u, v] from the corner: one past the first pixel of the inside on the diagonal
  // (where moreSkinMarks puts it), or else the place nearest the corner where its five pixels seat
  const flowerAt = [];
  for (let c = 0; c < 4; c++) {
    let f = null, passed = false, i0 = 1;
    for (let i = 0; i < Math.min(halfW, halfH); i++) { const [px, py] = local(c, i, i); if (isBand(px, py)) passed = true; else if (passed && at(px, py) === insideC) { i0 = i + 1; break; } }
    // then every other place in the corner zone, nearest the corner first
    const spots = [[i0, i0]];
    for (let d = 2; d < halfW + halfH; d++) for (let v = 1; v < Math.min(d, halfH - 1); v++) if (d - v < halfW - 1) spots.push([d - v, v]);
    for (const [u, v] of spots) {
      const pts = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => local(c, u + a, v + b));
      if (pts.every(([px, py]) => seat(px, py))) { f = [u, v]; break; }
    }
    flowerAt.push(f);
  }

  if (leaves) for (let c = 0; c < 4; c++) {
    // past the flower's rim (or where it would be), so the bloom's flower always shows
    const s = Math.max((flowerAt[c]?.[0] ?? 2) + 3, leafAt ?? 0);
    const across = (u, vertical) => runAcross(c, u, vertical);
    // a leaf lying along a run: 3 long, 2 across (the band's inner row and the first row past it)
    const leafAlong = (from, vertical, out = 0) => {
      const r = across(from + 1, vertical);
      if (!r) return false;
      const cells = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const [px, py] = vertical ? local(c, r.last + j - out, from + i) : local(c, from + i, r.last + j - out);
        cells.push([px, py]);
      }
      return shape(cells, rimOf(cells), leafC);
    };
    // one along the top or bottom, one along the side; with no room on the side (or `sideLeaf` false) the second lies
    // 6 px further along the top or bottom, one row further out (on the band), so the two read as separate leaves
    const first = leafAlong(s, false);
    const second = (sideLeaf && leafAlong(s, true)) || leafAlong(s + 6, false, 1) || leafAlong(s + 6, false);
    if (!first || !second) (sideLeaf && leafAlong(s + 6, true)) || leafAlong(s + 12, false);
  }

  if (style === 'bloom') for (const c of [0, 1]) {
    const f = flowerAt[c];
    if (!f) continue;
    const cells = [[0, 0, goldC], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b, k]) => [...local(c, f[0] + a, f[1] + b), k]);
    for (const [px, py] of cells) used.delete(key(px, py));
    const rim = rimOf(cells);
    for (const [px, py] of rim) used.delete(key(px, py));
    shape(cells, rim, T.accent);
  }

  // the flat face left (shrunk from moreSkinMarks' inner where a mark now lies on its edge)
  const a = { ...m.inner };
  {
    const k = g.get(a.x + (a.w >> 1), a.y + (a.h >> 1));
    const rowOk = (py) => { for (let px = a.x; px < a.x + a.w; px++) if (g.get(px, py) !== k) return false; return true; };
    const colOk = (px) => { for (let py = a.y; py < a.y + a.h; py++) if (g.get(px, py) !== k) return false; return true; };
    let guard = 400;
    while (a.w > 0 && a.h > 0 && guard--) {
      if (!rowOk(a.y)) { a.y++; a.h--; } else if (!rowOk(a.y + a.h - 1)) a.h--; else if (!colOk(a.x)) { a.x++; a.w--; } else if (!colOk(a.x + a.w - 1)) a.w--; else break;
    }
  }
  const R = rect ?? body, S = { ...m.slice };
  for (const [px, py] of varying) {
    if (px < R.x + R.w / 2) S.left = Math.max(S.left, px - R.x + 1); else S.right = Math.max(S.right, R.x + R.w - px);
    if (py < R.y + R.h / 2) S.top = Math.max(S.top, py - R.y + 1); else S.bottom = Math.max(S.bottom, R.y + R.h - py);
  }
  return { inner: a, slice: S };
}
