// Breaking helpers: a drawn thing split into its own chunks, which can rattle, come loose, fall and
// end as a row of crumbs (docs/style-guide.md sections 4 and 14: a clip in which something leaves
// ends on what is left, never on an empty frame). For crumbling blocks, smashed crates and pots,
// collapsing walls. Pure functions: no Math.random, the same seed always breaks the same way.
// For cracks on the surface use crack() in engine/rock.js; for loose debris thrown through the
// air use shards() and chunks() in engine/fx.js. Here the pieces are the thing itself.
//
//   import { fragments, drawFragment, crumble } from '../engine/breaking.js';
//   const whole = new Surface(32, 32);  drawMyBlock(whole, p);              // the thing, WITHOUT its outline
//   crumble(g, whole, { t, pieces: 6, seed: 2, floor: 29 });                // one-shot: falls apart over the clip
//   g.outline(INK);                                                         // the chunks are solid: outline them
//
//   const F = fragments(whole, 6, { seed: 2 });                             // or move the chunks yourself:
//   F.forEach((f, i) => drawFragment(g, f, i % 2, 0, { cut: true }));       // a rattle before the fall
//
// A cut line is one pixel wide (the pixels of the lower-numbered chunk along the border are left
// out), so g.outline(INK) afterwards turns every cut into an ink crack.

import { hash, clamp, lerp, easeOut } from './motion.js';

const boxOf = (g, box) => {
  const b = [1, 1, g.w - 1, g.h - 1];
  if (box) { b[0] = Math.max(b[0], Math.floor(box[0])); b[1] = Math.max(b[1], Math.floor(box[1])); b[2] = Math.min(b[2], Math.floor(box[2])); b[3] = Math.min(b[3], Math.floor(box[3])); }
  return b;
};

/**
 * Splits the drawn pixels of a Surface into chunks with straight cuts between them, like a block broken along a few cracks; returns [{ x, y, r, x0, y0, x1, y1, cells }] (centre, reach and box of each chunk, top row first) for drawFragment.
 * Arguments: src (the Surface to split, drawn without its outline; it is not changed); pieces (how many chunks, 1 to 16); options { seed (which way it breaks) }.
 */
export function fragments(src, pieces, { seed = 0 } = {}) {
  const b = src.bounds();
  if (!b) return [];
  const n = clamp(Math.round(pieces), 1, 16);
  const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
  const rows = clamp(Math.round(Math.sqrt((n * bh) / bw)), 1, n);
  // one seed point per chunk on a loose grid: rows of nearly equal counts, each point nudged inside its cell
  const pts = [];
  const each = Math.floor(n / rows), extra = n % rows, first = Math.floor(hash(seed, 11) * rows);
  for (let r = 0; r < rows; r++) {
    const count = each + ((r - first + rows) % rows < extra ? 1 : 0);
    for (let j = 0; j < count; j++) {
      const i = pts.length;
      pts.push([b.x0 + (j + 0.5 + (hash(i, seed * 64 + 1) - 0.5) * 0.5) * (bw / count), b.y0 + (r + 0.5 + (hash(i, seed * 64 + 2) - 0.5) * 0.4) * (bh / rows)]);
    }
  }
  const owner = new Int16Array(src.w * src.h).fill(-1);
  const out = pts.map(() => ({ x: 0, y: 0, r: 0, x0: src.w, y0: src.h, x1: -1, y1: -1, cells: [] }));
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    const c = src.data[y * src.w + x];
    if (!c) continue;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = (x + 0.5 - pts[i][0]) ** 2 + (y + 0.5 - pts[i][1]) ** 2; if (d < bd) { bd = d; best = i; } }
    owner[y * src.w + x] = best;
    const f = out[best];
    f.cells.push({ x, y, c, edge: false });
    f.x += x + 0.5; f.y += y + 0.5;
    if (x < f.x0) f.x0 = x; if (x > f.x1) f.x1 = x; if (y < f.y0) f.y0 = y; if (y > f.y1) f.y1 = y;
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= src.w || y >= src.h ? -1 : owner[y * src.w + x]);
  out.forEach((f, i) => {
    if (!f.cells.length) return;
    f.x /= f.cells.length; f.y /= f.cells.length;
    for (const c of f.cells) {
      c.d = Math.max(Math.abs(c.x + 0.5 - f.x), Math.abs(c.y + 0.5 - f.y));   // measured squarely, so a shrinking chunk stays blocky
      if (c.d > f.r) f.r = c.d;
      c.edge = at(c.x - 1, c.y) > i || at(c.x + 1, c.y) > i || at(c.x, c.y - 1) > i || at(c.x, c.y + 1) > i;
    }
    f.cells.sort((p, q) => p.d - q.d);                        // nearest the centre first: what is left when it shrinks
  });
  return out.filter((f) => f.cells.length);
}

// The cells of a chunk that are drawn: within `keep` px of its centre (across or down), without its side of the cut lines
// when `cut` is set, and never fewer than two.
function kept(f, keep, cut) {
  const list = f.cells.filter((c) => c.d <= keep && !(cut && c.edge));
  return list.length >= 2 ? list : f.cells.slice(0, 2);
}

/**
 * Draws one chunk from fragments(), moved by whole pixels; it can be shrunk towards its centre and cut loose from its neighbours, and always keeps at least two pixels.
 * Arguments: g (the Surface); chunk (one entry of the list fragments() returns); dx, dy (px to move it, default 0); options { keep (px: only what lies this close to its centre is drawn; default all of it), cut (true leaves a one pixel line open against the chunks listed after it), box ([x0, y0, x1, y1] to stay inside; default the frame's 1 px border) }.
 */
export function drawFragment(g, chunk, dx = 0, dy = 0, { keep = Infinity, cut = false, box } = {}) {
  const B = boxOf(g, box);
  dx = Math.round(dx); dy = Math.round(dy);
  for (const c of kept(chunk, keep, cut)) {
    const x = c.x + dx, y = c.y + dy;
    if (x < B[0] || y < B[1] || x >= B[2] || y >= B[3]) continue;
    g.data[y * g.w + x] = c.c;
  }
  return g;
}

/**
 * Breaks a drawn Surface into its own chunks, which crack apart, fall, shrink and come to rest as a row of crumbs on a floor line; one-shot over the clip, never wider than the thing was, and the last frame keeps one crumb per chunk (draw before g.outline).
 * Arguments: g (the Surface to draw on); src (a Surface holding the whole thing without its outline); options { t (clip phase 0..1), pieces (how many chunks, default 6), seed, floor (the row the crumbs rest on; default the lowest drawn row of src), crumb (px across of what is left of a chunk, default 3), stagger (0..1: the share of the clip by which the last chunk, at the top, has let go; default 0.3), box }.
 */
export function crumble(g, src, { t = 0, pieces = 6, seed = 0, floor, crumb = 3, stagger = 0.3, box } = {}) {
  const F = fragments(src, pieces, { seed });
  if (!F.length) return g;
  const B = boxOf(g, box);
  const b = src.bounds();
  const ground = Math.min(floor ?? b.y1, B[3] - 1);
  const pitch = (b.x1 - b.x0 + 1) / F.length;
  // where each crumb ends up: the chunks keep their left-to-right order and share the width evenly
  const rank = F.map((f, i) => i).sort((p, q) => F[p].x - F[q].x);
  const slot = [];
  rank.forEach((i, r) => { slot[i] = b.x0 + (r + 0.5) * pitch; });
  const k = clamp(t);
  const pull = (ground - b.y0 + 1) * 1.3;                     // enough for the highest chunk to land before the end
  const bh = Math.max(1, b.y1 - b.y0);
  F.forEach((f, i) => {
    // the lowest chunks let go first and make room; the ones above hang a moment, then follow
    const delay = clamp(stagger) * clamp(0.8 * (1 - (f.y - b.y0) / bh) + 0.2 * hash(i, seed * 64 + 3));
    const ki = k <= delay ? 0 : delay >= 1 ? 1 : (k - delay) / (1 - delay);
    const small = Math.max(0.8, Math.min((crumb / 2) * (0.7 + 0.6 * hash(i, seed * 64 + 4)), pitch / 2 - 0.4));
    // a chunk starts to break up as soon as it lets go, fast at first, so air shows between the pieces
    const keep = ki <= 0 ? Infinity : lerp(f.r, small, easeOut(ki));
    const cells = kept(f, keep, true);
    let low = 0, left = src.w, right = 0;
    for (const c of cells) { if (c.y > low) low = c.y; if (c.x < left) left = c.x; if (c.x > right) right = c.x; }
    // sideways a chunk never leaves the width the whole thing had, so an outline drawn afterwards still fits
    const dx = clamp(Math.round((slot[i] - f.x) * easeOut(ki)), b.x0 - left, b.x1 - right);
    const dy = Math.min(Math.round(pull * ki * ki), ground - low);
    drawFragment(g, f, dx, dy, { keep, cut: true, box: B });
  });
  return g;
}

/**
 * Draws a drawn Surface rising out of a floor line, or sinking into it: the whole picture is slid down so that only its top `shown` rows stand on the floor row, and nothing is ever drawn below the floor; for a thing that grows back, spawns, sinks or burrows (draw before g.outline).
 * Arguments: g (the Surface to draw on); src (a Surface holding the whole thing without its outline; it is not changed); options { shown (how many of its rows are above the floor line: 0 draws nothing, its full height or more draws all of it; default all of it), floor (the last row anything is drawn on; default the lowest drawn row of src), hop (px it is lifted above that, for the overshoot before it settles; default 0) }.
 */
export function rise(g, src, { shown, floor, hop = 0 } = {}) {
  const b = src.bounds();
  if (!b) return g;
  const tall = b.y1 - b.y0 + 1, ground = Math.round(floor ?? b.y1);
  const rows = clamp(Math.round(shown ?? tall), 0, tall);
  if (!rows) return g;
  const dy = ground + 1 - rows - Math.round(hop) - b.y0;      // how far down the picture is slid
  for (let y = b.y0; y <= b.y1; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= g.h || ty > ground) continue;
    for (let x = b.x0; x <= b.x1; x++) {
      const c = src.data[y * src.w + x];
      if (c && x < g.w) g.data[ty * g.w + x] = c;
    }
  }
  return g;
}

// ---- added with batch S14 (station props): hitWobble ----
//
//   const [squash, shift] = hitWobble(frame);                               // a 4-frame `hurt` clip of a crate, a barrel, a pot
//   g.blit(drawMyProp(p, { wide: squash, short: squash }), shift, 0);       // drawn wider and shorter by `squash`, moved by `shift`
//   if (frame === 0) g.tint('#ffffff');                                     // the hit itself is white (style guide section 4)
//   g.outline(INK);
