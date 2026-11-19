// Puff cloud (added with sprite batch K24 fix round 4, bundles/specs/core-sprites-3.md, emote-bubbles): a small
// thought cloud 20 to 32 px across whose outline is all round bumps, for an emote or an icon. bumpCloud
// (engine/bump-cloud.js) gives its lobes 1 px cusps on a filled core, so at game size its edge is flat runs a step
// apart and it reads as a scalloped plaque or a postage stamp. Here every bump is an arc 2 px deep: its crown 2 px
// across on the box's edge, 4 px across one row in, its corners cut, and a cusp 1 to 3 px wide two rows in between
// it and the next; the corners are bigger round lobes. There are 3 or more bumps along the top and the bottom and
// 2 or more between the corners down each side (with the corner lobes, 4 or more), and no straight edge is longer
// than 3 px. The face is a flat rectangle 3 px inside the box on every side (`inner`, the room for a mark): over a
// cusp, whose ink lies 2 px in, the line band is left out so the face keeps that whole rectangle. The trail is
// bumpCloud's own (three separate puffs, each smaller and 2 px lower than the one before).
//
//   import { puffCloud } from '../engine/puff-cloud.js';
//   import { BUMP_TRAIL } from '../engine/bump-cloud.js';
//
//   const out = puffCloud(g, 3, 1, 26, 22, { face, frame, trail: 'down-left' });   // trail in the 8 rows under it
//   out.inner   // { x: 6, y: 4, w: 20, h: 16 }: the flat face; out.tip: the smallest puff's centre
//
// (x, y, w, h) is the cloud itself, bumps included; the trail takes BUMP_TRAIL.rows more rows under it.

import { Surface } from './surface.js';
import { INK } from './color.js';
import { bumpCloud, BUMP_TRAILS } from './bump-cloud.js';

const CORNER = [4, 2, 1, 1, 0, 0, 1];                   // a corner lobe's edge, from the corner: a round lobe, crown 2 px
const BUMPS = {                                            // a bump's edge (rows in from the box's edge) by its width
  4: [1, 0, 0, 1], 5: [1, 0, 0, 1, 1], 6: [1, 1, 0, 0, 1, 1], 7: [1, 1, 0, 0, 1, 1, 1],
};

// The edge between two corner lobes, m px long: cusps (2 rows in) and bumps (4 to 7 px wide) alternating, a cusp at
// each end. Chosen for narrow cusps first (a 1 px notch reads as two puffs meeting, a wider one as a scalloped
// plaque), then mirrored about the middle, then big bumps. A run too short for a bump (a balloon still growing) is
// all cusp.
function middleEdge(m) {
  let best = null;
  const walk = (left, seq, bumps, cusps) => {
    for (const c of [1, 2, 3]) {
      if (c === left && bumps.length) {
        const out = [...seq, ...Array(c).fill(2)], all = [...cusps, c];
        const sym = out.every((v, i) => v === out[out.length - 1 - i]);
        const score = -10 * all.reduce((a, k) => a + k - 1, 0) + (sym ? 6 : 0) + bumps.reduce((a, w) => a + (w >= 6 ? 4 : w === 5 ? 2 : 0), 0);
        if (!best || score > best.score) best = { score, out };
      }
      for (const w of [4, 5, 6, 7]) if (c + w < left) walk(left - c - w, [...seq, ...Array(c).fill(2), ...BUMPS[w]], [...bumps, w], [...cusps, c]);
    }
  };
  walk(m, [], [], []);
  return best ? best.out : Array(Math.max(0, m)).fill(2);
}
// One edge of the box, n px long: how many rows (or columns) in its outline lies at each step along it.
function edgeOf(n) {
  if (n < 2 * CORNER.length) return Array.from({ length: n }, (_, i) => Math.min(2, i, n - 1 - i));
  return [...CORNER, ...middleEdge(n - 2 * CORNER.length), ...[...CORNER].reverse()];
}

// The cloud's pixels inside (x, y, w, h): every pixel inside all four edges.
function maskOf(W, H, x, y, w, h) {
  const m = new Uint8Array(W * H), across = edgeOf(w), down = edgeOf(h);
  for (let py = Math.max(0, y); py < Math.min(H, y + h); py++) for (let px = Math.max(0, x); px < Math.min(W, x + w); px++) {
    const i = px - x, j = py - y;
    if (j >= across[i] && h - 1 - j >= across[i] && i >= down[j] && w - 1 - i >= down[j]) m[py * W + px] = 1;
  }
  return m;
}

/**
 * Draws a small thought cloud whose outline is round bumps 2 px deep in the box (x, y, w, h), with bumpCloud's trail of three puffs under it: returns { body, inner, edge, tip, puffs }.
 * Arguments: g; x, y, w, h (the cloud, bumps included; 14 by 14 or more); opt { face, frame (colours), trail ('down-left', 'down-right' or 'none'), trailX (the first puff's middle column, as bumpCloud), ink }.
 */
export function puffCloud(g, x, y, w, h, { face, frame, trail = 'down-left', trailX, ink = INK } = {}) {
  if (!face || !frame) throw new Error('puffCloud: needs a face and a frame colour');
  if (!BUMP_TRAILS.includes(trail)) throw new Error(`puffCloud: trail "${trail}" is not one of ${BUMP_TRAILS.join(', ')}`);
  const W = g.w, H = g.h, m = maskOf(W, H, x, y, w, h);
  const inner = { x: x + 3, y: y + 3, w: Math.max(0, w - 6), h: Math.max(0, h - 6) };
  const inInner = (px, py) => px >= inner.x && px < inner.x + inner.w && py >= inner.y && py < inner.y + inner.h;
  const at = (px, py) => px >= 0 && py >= 0 && px < W && py < H && m[py * W + px];
  const rim = (px, py) => !at(px - 1, py) || !at(px + 1, py) || !at(px, py - 1) || !at(px, py + 1);
  let edge = null;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (!m[py * W + px]) continue;
    const band = !rim(px, py) && (rim(px - 1, py) || rim(px + 1, py) || rim(px, py - 1) || rim(px, py + 1));
    g.dot(px, py, rim(px, py) ? ink : band && !inInner(px, py) ? frame : face);
  }
  // a band pixel straight above the inner rectangle's middle: the colour a mark or text sits beside
  const ex = inner.x + (inner.w >> 1);
  for (let py = inner.y - 1; py >= y && !edge; py--) if (at(ex, py) && !rim(ex, py)) edge = { x: ex, y: py };
  let tip = null, puffs = [];
  if (trail !== 'none') {
    // bumpCloud's trail: drawn with its cloud on a scratch surface, and only the rows under the cloud kept
    const s = new Surface(W, H), out = bumpCloud(s, x, y, w, h, { face, frame, border: 0, trail, trailX, ink });
    for (let py = y + h; py < H; py++) for (let px = 0; px < W; px++) { const c = s.get(px, py); if (c) g.data[py * W + px] = c; }
    tip = out.tip; puffs = out.puffs;
  }
  return { body: { x, y, w, h }, inner, edge: edge || { x: ex, y }, tip, puffs };
}
