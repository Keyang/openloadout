// PORT (migration batch M9): a copy of engine/bump-cloud.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/bump-cloud.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// A small thought cloud (added with sprite batch K24 fix round 3, bundles/specs/core-sprites-3.md, emote-bubbles): a
// balloon 20 to 32 px across whose outline is round bumps all the way round, for an emote or an icon. thoughtBubble's
// cloud (engine/bubbles.js) bumps only its corners, so a small one reads as a rectangle with nicks in it (a hide or a
// parchment scrap), and scallopCloud (engine/scallop-cloud.js) is sized for 96x48 panels. bumpCloud puts round lobes
// on every edge (3 or more along the top and bottom, 3 down each side, each lobe's outer row 3 px or wider, the
// cusps between them about 1 px deep, no straight run with a nick in it) and hangs a trail of three separate puffs
// under it (faces 3, 2 and 1 px across, each inked round), each smaller, further out to the side and 2 px lower
// than the one before, with 1 px of background between neighbours and between the first puff and the cloud.
// The cloud is drawn like the other bubbles: a 1 px ink line, a band of `frame` (1 or 2 px), a flat face.
//
//   import { bumpCloud, BUMP_TRAIL } from '../engine/bump-cloud.js';
//
//   const out = bumpCloud(g, 2, 1, 28, 20, { face, frame, border: 0, trail: 'down-left' });   // trail under it
//   out.inner   // the flat face rectangle (for a mark or text); out.tip: the smallest puff's centre
//
// (x, y, w, h) is the cloud itself, bumps included; the trail takes BUMP_TRAIL.rows more rows under it and
// BUMP_TRAIL.cols columns across, and is kept 1 px inside the surface.

import { Surface } from './surface.js';
import { INK } from './colour.js';

/** How much room a bumpCloud trail takes: rows under the cloud (the gap row included) and columns across, from the first puff's ink to the last's. No arguments: a frozen object. */
export const BUMP_TRAIL = Object.freeze({ rows: 8, cols: 14 });
/** The directions a bumpCloud trail can run: down-left, down-right, or none. No arguments: a frozen list. */
export const BUMP_TRAILS = Object.freeze(['down-left', 'down-right', 'none']);

// The puffs for a down-left trail, from the first puff's face left column `a` and the cloud's bottom row `bt`:
// [left column, top row, face size] of each face; each next puff 2 rows lower and far enough left that its ink keeps
// a column of background from the one before (worked out on the pixel shapes below).
const PUFFS = [[0, 3, 3], [-5, 5, 2], [-9, 7, 1]];
// a puff's face pixels: a d x d square (inked round, it becomes round: the outline skips the corners)
function puffFace(d) {
  const out = [];
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) out.push([x, y]);
  return out;
}

function depthOf(m, W, H, cap) {
  const d = new Uint8Array(W * H);
  let ring = [];
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const x = i % W, y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W]) { d[i] = 1; ring.push(i); }
  }
  for (let k = 2; k <= cap && ring.length; k++) {
    const next = [];
    for (const i of ring) for (const n of [i - 1, i + 1, i - W, i + W]) if (m[n] && !d[n]) { d[n] = k; next.push(n); }
    ring = next;
  }
  for (let i = 0; i < W * H; i++) if (m[i] && !d[i]) d[i] = cap;
  return d;
}

// The lobes for a cloud filling (x, y, w, h): [cx, cy, r], every centre on a pixel centre or a pixel edge. Corner lobes and the
// lobes down the sides have radius r; the lobes between the top corners (and the bottom ones) are bigger, their
// centres lowered (raised) so their crowns stay on the box's edge: a cloud's big middle puffs.
const OV = 3.5;                                           // how far a middle lobe overlaps a corner lobe (px)
function lobesOf(x, y, w, h) {
  const r = Math.min(w, h) >= 18 ? 4.4 : Math.min(w, h) >= 12 ? 3.4 : 2.4, f = Math.floor(r);
  const cw = w - 1 - 2 * f, ch = h - 1 - 2 * f, out = [];
  // a middle lobe's radius: overlapping the corner lobe by about 1.5 px (a cusp 1 to 2 px deep), never smaller than r
  const middle = (pitch, ov) => {
    let rm = r;
    for (let k = 0; k < 3; k++) rm = Math.max(r, Math.min(r + 5, Math.hypot(pitch, Math.floor(rm) - f) - r + ov));
    return rm;
  };
  const n = Math.max(2, Math.round(cw / 7)), m = Math.max(2, Math.round(ch / 7));
  const rt = middle(cw / n, OV), rs = middle(ch / m, OV);
  // offsets along an edge in half pixels, mirrored about its middle so the cloud is symmetric
  const half = (v) => Math.round(v * 2) / 2;
  const along = (i, k, len) => (2 * i <= k ? half((i * len) / k) : len - half(((k - i) * len) / k));
  for (let i = 0; i <= n; i++) {
    const cx = x + f + along(i, n, cw) + 0.5, edge = i === 0 || i === n;
    const rr = edge ? r : rt, ff = Math.floor(rr);
    out.push([cx, y + ff + 0.5, rr], [cx, y + h - 1 - ff + 0.5, rr]);
  }
  for (let j = 1; j < m; j++) {
    const cy = y + f + along(j, m, ch) + 0.5, ff = Math.floor(rs);
    out.push([x + ff + 0.5, cy, rs], [x + w - 1 - ff + 0.5, cy, rs]);
  }
  return { lobes: out, core: { x: x + f, y: y + f, w: Math.max(1, cw + 1), h: Math.max(1, ch + 1) } };
}

// The rectangle of face pixels, centred, whose shorter side is longest (then the biggest): room for a square mark.
function innerOf(d, W, x, y, w, h, b) {
  const face = (px, py) => px >= 0 && py >= 0 && px < W && d[py * W + px] > 1 + b;
  const all = (x0, y0, x1, y1) => { for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) if (!face(px, py)) return false; return true; };
  let best = null;
  for (let ix = 1; ix < (w >> 1); ix++) for (let iy = 1; iy < (h >> 1); iy++) {
    const x0 = x + ix, x1 = x + w - 1 - ix, y0 = y + iy, y1 = y + h - 1 - iy;
    if (x1 < x0 || y1 < y0 || !all(x0, y0, x1, y1)) continue;
    const area = (x1 - x0 + 1) * (y1 - y0 + 1), short = Math.min(x1 - x0, y1 - y0);
    if (!best || short > best.short || (short === best.short && area > best.area)) best = { short, area, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  return best ? { x: best.x, y: best.y, w: best.w, h: best.h } : { x: x + (w >> 1), y: y + (h >> 1), w: 0, h: 0 };
}

/**
 * Draws a small thought cloud with round bumps on every edge in the box (x, y, w, h) and a trail of three separate puffs under it: returns { body, inner, edge, tip, puffs }.
 * Arguments: g; x, y, w, h (the cloud, bumps included; 12 by 12 or more); opt { face, frame (colours), border (0..1: the band 1 to 2 px), trail ('down-left', 'down-right' or 'none'), trailX (the first puff's middle column; default under the cloud's left or right quarter; kept so the trail stays 1 px inside g), ink }.
 */
export function bumpCloud(g, x, y, w, h, { face, frame, border = 0.5, trail = 'down-left', trailX, ink = INK } = {}) {
  if (!face || !frame) throw new Error('bumpCloud: needs a face and a frame colour');
  if (!BUMP_TRAILS.includes(trail)) throw new Error(`bumpCloud: trail "${trail}" is not one of ${BUMP_TRAILS.join(', ')}`);
  const b = 1 + Math.round(Math.max(0, Math.min(1, border)));
  const W = g.w, H = g.h, m = new Uint8Array(W * H);
  const { lobes, core } = lobesOf(x, y, w, h);
  for (let py = Math.max(0, y); py < Math.min(H, y + h); py++) for (let px = Math.max(0, x); px < Math.min(W, x + w); px++) {
    const X = px + 0.5, Y = py + 0.5;
    let on = X >= core.x && X < core.x + core.w && Y >= core.y && Y < core.y + core.h;
    for (let k = 0; !on && k < lobes.length; k++) { const [cx, cy, r] = lobes[k]; on = (X - cx) ** 2 + (Y - cy) ** 2 <= r * r; }
    if (on) m[py * W + px] = 1;
  }
  const d = depthOf(m, W, H, b + 2);
  for (let i = 0; i < W * H; i++) if (m[i]) { const px = i % W; g.dot(px, (i - px) / W, d[i] === 1 ? ink : d[i] <= 1 + b ? frame : face); }
  const inner = innerOf(d, W, x, y, w, h, b);
  // a band pixel straight above the inner rectangle's middle: the colour a mark or text sits beside
  const ex = inner.x + (inner.w >> 1);
  let ey = inner.y;
  while (ey > 0 && d[ey * W + ex] > 1 + b) ey--;
  const puffs = [];
  if (trail !== 'none') {
    const left = trail === 'down-left', bt = y + h - 1;
    // a: the first puff's face left column (down-left); mirrored for down-right
    let mid = trailX ?? (left ? x + Math.floor(w / 4) : x + w - 1 - Math.floor(w / 4));
    // the trail's ink runs from mid - 11 to mid + 2 (down-left; mirrored down-right): keep it 1 px inside the surface
    mid = Math.round(left ? Math.max(12, Math.min(W - 4, mid)) : Math.min(W - 13, Math.max(3, mid)));
    const a = mid - 1;
    for (const [ox, oy, sz] of PUFFS) {
      const fx = left ? a + ox : a + 3 - ox - sz, fy = bt + oy;
      const s = new Surface(W, H);
      for (const [px, py] of puffFace(sz)) s.dot(fx + px, fy + py, face);
      s.outline(ink);
      g.blit(s);
      puffs.push({ x: fx + (sz >> 1), y: fy + (sz >> 1), d: sz });
    }
  }
  return { body: { x, y, w, h }, inner, edge: { x: ex, y: ey }, tip: puffs.length ? { x: puffs[2].x, y: puffs[2].y } : null, puffs };
}
