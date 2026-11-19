// Anger pinwheel (added with sprite batch K24 fix round 5, bundles/specs/core-sprites-3.md, emote-bubbles): the
// anger vein of engine/anger-vein.js (four bent strokes in a pinwheel round a plus-shaped gap, both arms 3 px or
// longer) with a throb that never thickens anything. anger-vein's throb swells each stroke's arm beside the elbow,
// which makes a 2x2 block of colour; with the ink line round it each stroke is then a blob, and at 1x half the loop
// reads as four dots in a window pattern. Here every stroke keeps its 1 px arms on every frame; on the beat each
// steps 1 px along the pinwheel (top-left right, top-right down, bottom-right left, bottom-left up), so the vein
// twitches while its shapes, its arm lengths, its bent ends and its outer reach stay. The plus-shaped gap is 4 px
// of body at rest (ink, 2 px of background, ink) and 3 px on the beat (ink, 1 px of background, ink): no stroke
// ever touches another.
//
//   import { drawAngerPinwheel, angerPinwheelBody } from '../engine/anger-pinwheel.js';
//
//   drawAngerPinwheel(g, cx, by, 12, { t, colour: p.accent });   // body's bottom row on `by`, centred on `cx`
//
// Sizes as anger-vein's: the body is 12 px square at sizes 10 and 11, 14 at 12 and 13, 16 at 14 and over.

import { Surface } from './surface.js';
import { INK } from './color.js';
import { glyphGrid } from './ui.js';
import { angerVeinBody } from './anger-vein.js';

const fract = (v) => ((v % 1) + 1) % 1;

/**
 * The body pixels at loop phase t: a glyphGrid of anger-vein's size (body plus 1 px each side), the strokes at rest
 * on the loop's first half and each stepped 1 px clockwise round the gap on its second half.
 * Arguments: size (nominal mark size, 10 to 16 px); options { t (0..1, one loop) }.
 */
export function angerPinwheelBody(size, { t = 0 } = {}) {
  const rest = angerVeinBody(size, { t: 0 });
  const k = fract(t) >= 0.5 ? 1 : 0;
  if (!k) return rest;
  const g = glyphGrid(rest.w, rest.h), m = rest.w / 2;   // the gap is in the middle: each quarter holds one stroke
  for (let y = 0; y < rest.h; y++) for (let x = 0; x < rest.w; x++) {
    if (!rest.at(x, y)) continue;
    const L = x < m, T = y < m;
    const [dx, dy] = T ? (L ? [1, 0] : [0, 1]) : (L ? [0, -1] : [-1, 0]);
    g.set(x + dx, y + dy);
  }
  return g;
}

/**
 * Draws the anger pinwheel in a colour with a 1 px ink line, centred on cx with the body's bottom row on by: returns { box } (the drawn pixels, ink included).
 * Arguments: g (the Surface); cx, by; size (10 to 16); options { t (0..1), colour (required), ink (default INK) }.
 */
export function drawAngerPinwheel(g, cx, by, size, { t = 0, colour, ink = INK } = {}) {
  if (!colour) throw new Error('drawAngerPinwheel: needs a colour');
  const b = angerPinwheelBody(size, { t });
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
