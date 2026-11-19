// Anger vein (added with sprite batch K24 fix round 4, bundles/specs/core-sprites-3.md, emote-bubbles): the anger
// mark for a small balloon, 10 to 13 px nominal, that keeps reading as anger on every frame. engine/emote-small.js's
// anger throbs by shortening its arms, so half its loop is four 3 px stubs (four dots at game size), and its four
// straight inward-cornered Ls look like an "exit fullscreen" icon. Here each of the four strokes is an L whose bend
// points in at a plus-shaped gap, with both arms 3 px or longer: one runs straight out along the gap, the other's
// end turns 1 px diagonally away from it (a bent vein end). The strokes are a quarter turn apart, a pinwheel, so the
// four do not make a frame's corners or four arrowheads. The gap between neighbouring strokes is always 2 px of
// background once the 1 px ink line is round them. The throb never shortens an arm: on half the loop each straight
// arm swells to 2 px thick on its outer side (away from the gap), so the gap and the arm lengths stay.
//
//   import { drawAngerVein, angerVeinBody } from '../engine/anger-vein.js';
//
//   drawAngerVein(g, cx, by, 12, { t, colour: p.accent });     // body's bottom row on `by`, centred on `cx`
//
// The body is 12 px square at sizes 10 and 11 and 14 px at 12 and 13 (16 at 14 and over): each stroke fills a
// q x q quarter (q 4, 5 or 6) and the gap is 4 px of body (ink, 2 px of background, ink).

import { Surface } from './surface.js';
import { INK } from './color.js';
import { glyphGrid } from './ui.js';

const fract = (v) => ((v % 1) + 1) % 1;
// a stroke's quarter size for a nominal mark size
const quarter = (size) => Math.max(4, Math.min(6, Math.floor((Math.round(size) - 2) / 2)));

// One stroke in the top-left quarter (0..q-1 each way, the bend at (q-1, q-1)): [x, y] pixels. The arm along the
// top of the gap runs q-1 px out from the bend and its end turns up, 1 px diagonally away from the gap; the arm along
// the side of the gap runs straight to the quarter's edge (q px). On the throb that straight arm swells to 2 px on
// its outer side from 2 px past the bend to its end (a club, clear of the bend: no solid wedge), so the vein bulges and its arms and the gap stay as they are.
function stroke(q, thick) {
  const b = q - 1, out = [];
  for (let i = 0; i < q - 1; i++) out.push([b - i, b]);
  out.push([0, b - 1]);
  for (let i = 1; i < q; i++) out.push([b, b - i]);
  if (thick) for (let i = 2; i < q; i++) out.push([b - 1, b - i]);
  return out;
}

/**
 * The body pixels of the anger vein at loop phase t: a glyphGrid as wide and tall as the mark (12, 14 or 16 px) plus 2, the four strokes on its bottom row less 1, centred.
 * Arguments: size (nominal mark size, 10 to 16 px); options { t (0..1, one loop; on its second half the strokes swell) }.
 */
export function angerVeinBody(size, { t = 0 } = {}) {
  const q = quarter(size), B = 2 * q + 4, g = glyphGrid(B + 2, B + 2);
  const thick = fract(t) >= 0.5;
  for (const [x, y] of stroke(q, thick)) {
    // the four strokes a quarter turn apart (a pinwheel: each turned end leads into the next stroke's quarter)
    for (const [u, v] of [[x, y], [B - 1 - y, x], [B - 1 - x, B - 1 - y], [y, B - 1 - x]]) g.set(1 + u, 1 + v);
  }
  return g;
}

/**
 * Draws the anger vein in a colour with a 1 px ink line, centred on cx with the body's bottom row on by: returns { box } (the drawn pixels, ink included).
 * Arguments: g (the Surface); cx, by; size (10 to 16); options { t (0..1), colour (required), ink (default INK) }.
 */
export function drawAngerVein(g, cx, by, size, { t = 0, colour, ink = INK } = {}) {
  if (!colour) throw new Error('drawAngerVein: needs a colour');
  const b = angerVeinBody(size, { t });
  const x0 = Math.round(cx) - Math.floor(b.w / 2), y0 = Math.round(by) - (b.h - 2);
  const s = new Surface(g.w, g.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.at(x, y)) s.dot(x0 + x, y0 + y, colour);
  s.outline(ink);
  // a pixel of background shut in by ink (the cup of a size 10 or 11 stroke) is inked: no lone dot of face
  const W = s.w, H = s.h, out = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) {
    const i = st.pop();
    if (out[i] || s.data[i]) continue;
    out[i] = 1;
    const x = i % W;
    if (x > 0) st.push(i - 1);
    if (x < W - 1) st.push(i + 1);
    if (i >= W) st.push(i - W);
    if (i < W * (H - 1)) st.push(i + W);
  }
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + b.h); y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + b.w); x++) {
    if (!out[y * W + x] && !s.data[y * W + x]) s.dot(x, y, ink);
  }
  const bb = s.bounds();
  g.blit(s);
  return { box: bb ? { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0 + 1, h: bb.y1 - bb.y0 + 1 } : { x: x0, y: y0, w: 0, h: 0 } };
}
