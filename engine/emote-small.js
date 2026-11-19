// Small emotes (added with sprite batch K24 fix round 3, bundles/specs/core-sprites-3.md, emote-bubbles): three of the
// marks of engine/emotes.js redrawn for a mark 10 to 14 px tall with a plain 1 px ink line (no rim), where emotes.js's
// own shapes close up: its anger becomes a hollow diamond inside brackets, its spark a hash, its swirl a ring with an
// arrow (the Mars sign). Each shape here keeps balloon face between its strokes once the ink line is round them:
//   anger  four separate L-shaped vein corners, each corner pointing out from the middle; they throb (arms shorten)
//   spark  a four-point star core and four diagonal rays, each ray clear of the core; the rays twinkle
//   swirl  a 1 px spiral of one and a half turns whose inner end stays open, turning; a separate four-point star
//          on the far side from the spiral's outer end, never touching it
// Any other emote is drawn by drawEmote (rim: false), so a sprite can call drawSmallEmote for all nine.
//
//   import { drawSmallEmote, SMALL_EMOTES } from '../engine/emote-small.js';
//
//   drawSmallEmote(g, p.emote, cx, by, 12, { t, colour: p.accent });          // bottom row on `by`, centred on `cx`
//
// A body is a glyphGrid (engine/ui.js) size + 4 wide and tall, the mark standing on its bottom row with its middle
// column on cx, the same convention as emoteBody, so code that measures emotes (engine/emote-fit.js) works unchanged.

import { Surface } from './surface.js';
import { INK } from './color.js';
import { glyphGrid } from './ui.js';
import { drawEmote } from './emotes.js';

/** The emotes drawSmallEmote redraws for small sizes: anger, spark and swirl (the others go to drawEmote). No arguments: a frozen list. */
export const SMALL_EMOTES = Object.freeze(['anger', 'spark', 'swirl']);

const TAU = Math.PI * 2;
const fract = (v) => ((v % 1) + 1) % 1;

function anger(g, s, t) {
  // four bent strokes round a plus-shaped gap (the vein mark): in each quarter of the s x s box a 1 px L whose bend
  // points in towards the middle and whose arms run out along the gap to the box's edge. Neighbouring strokes keep 4 px apart across the gap (3 when s is odd): ink, face, ink once outlined, so
  // no closed diamond forms. On half the loop the arms draw in by 1 px (a throb).
  const W = g.w, base = g.h - 1, x0 = Math.floor(W / 2) - Math.floor(s / 2), y0 = base + 1 - s;
  const lo = s % 2 ? (s - 1) / 2 - 2 : s / 2 - 3, hi = s - 1 - lo;  // the bends' columns (and rows), from x0 / y0
  const pull = fract(t) < 0.5 ? 0 : 1;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = x0 + (sx < 0 ? lo : hi), by = y0 + (sy < 0 ? lo : hi);
    const len = Math.max(1, lo - pull);                             // to the box's edge (one short on the throb)
    for (let i = 0; i <= len; i++) { g.set(bx + sx * i, by); g.set(bx, by + sy * i); }
  }
}

function spark(g, s, t) {
  // a four-point star core (a 3x3 middle with 1 px points out to 2 or 3 px) and four short 1 px rays on the
  // diagonals, from 4 diagonal steps out, so face shows between every ray and the core once both are inked. On half
  // the loop the points and the rays draw in by a pixel (a twinkle).
  const W = g.w, base = g.h - 1, x0 = Math.floor(W / 2) - Math.floor(s / 2), y0 = base + 1 - s;
  const c = Math.floor((s - 1) / 2), mx = x0 + c, my = y0 + c;  // the core's middle pixel
  const tw = fract(t) < 0.5 ? 0 : 1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.set(mx + dx, my + dy);
  const pt = Math.min(c - 1, 3) - tw;                            // the points: 1 px wide
  for (let i = 2; i <= pt; i++) { g.set(mx, my - i); g.set(mx, my + i); g.set(mx - i, my); g.set(mx + i, my); }
  const end = Math.max(4, c - 1 - tw);                           // the rays: 1 px diagonals from 4 to end
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let d = 4; d <= end; d++) g.set(mx + sx * d, my + sy * d);
}

function swirl(g, s, t) {
  // a 1 px spiral: the inner half turn at radius r0, a half turn widening to R, the outer half turn at R, so the
  // inner end keeps 4 px from the outer turn (ink, face, ink between them once outlined) and the spiral stays open;
  // it turns a quarter turn every quarter of the loop. A four-point star (a 1 px plus) stands at the upper right, D px across and
  // up from the spiral's middle: far enough that a pixel of face (two from size 12) parts its ink from the spiral's
  // at every angle, so the spiral's outer end never runs into it (no ring-and-arrow). The grid is 2 px wider and
  // taller than other emotes' to hold the star. Below size 12 the spiral is 9 px across (R 4): its inner end is the
  // middle pixel, a curl rather than a hook.
  const W = g.w, base = g.h - 1;
  const R = Math.max(4, Math.min(6, Math.floor(s / 2) - 1)), r0 = R - 4;
  const D = Math.ceil((R + 2) / Math.SQRT2 + (R >= 5 ? 2 : 1));
  const mx = Math.floor(W / 2) - Math.floor((D + 1 - R) / 2) + 0.5, my = base + 0.5 - R;   // the spiral's middle
  // the outer end's angle (up at t = 0): the spiral turns in quarter turns, each held for a quarter of the loop, since
  // its eighth-turn poses close the gap between the turns in places
  const end = -Math.PI / 2 + (Math.PI / 2) * Math.floor(fract(t) * 4);
  const rad = (u) => (u < Math.PI ? r0 : u < TAU ? r0 + ((u - Math.PI) / Math.PI) * (R - r0) : R);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - mx, dy = y + 0.5 - my, d = Math.hypot(dx, dy);
    // u: how far along the spiral, 0 at the inner end, 3 PI at the outer end (at angle `end`)
    const a = (((Math.atan2(dy, dx) - end) % TAU) + TAU) % TAU;
    for (let k = 0; k < 2; k++) {
      const u = 3 * Math.PI - ((TAU - a) % TAU) - TAU * k;
      if (u < 0 || u > 3 * Math.PI) continue;
      if (Math.abs(d - rad(u)) <= 0.5) { g.set(x, y); break; }
    }
  }
  const sx = Math.floor(mx) + D, sy = Math.floor(my) - D;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(sx + dx, sy + dy);
}

/**
 * The body pixels of a small anger, spark or swirl at loop phase t: a glyphGrid size + 4 wide and tall (swirl size + 6), the mark about size px tall on its bottom row, centred, its idle motion built in.
 * Arguments: kind (one of SMALL_EMOTES); size (10 to 16 px); options { t (0..1, one loop; default 0) }.
 */
export function smallEmoteBody(kind, size, { t = 0 } = {}) {
  if (!SMALL_EMOTES.includes(kind)) throw new Error(`smallEmoteBody: no small emote "${kind}". Small emotes: ${SMALL_EMOTES.join(', ')}`);
  const s = Math.max(10, Math.min(16, Math.round(size)));
  const pad = kind === 'swirl' ? 6 : 4;
  const g = glyphGrid(s + pad, s + pad);
  ({ anger, spark, swirl })[kind](g, s, t);
  return g;
}

/**
 * Draws an emote with a plain 1 px ink line, centred on cx with its bottom row on by, using the small shapes for anger, spark and swirl and drawEmote (rim false) for the rest: returns { box }.
 * Arguments: g (the Surface); kind (one of EMOTES of engine/emotes.js); cx, by; size (10 to 16 for the small three); options { t, colour, ink, and for the other emotes bounce, bold, apart as drawEmote }.
 */
export function drawSmallEmote(g, kind, cx, by, size, { t = 0, colour, ink = INK, ...rest } = {}) {
  if (!colour) throw new Error('drawSmallEmote: needs a colour');
  if (!SMALL_EMOTES.includes(kind)) return drawEmote(g, kind, cx, by, size, { t, colour, ink, ...rest, rim: false, shadow: false });
  const b = smallEmoteBody(kind, size, { t });
  const x0 = Math.round(cx) - Math.floor(b.w / 2), y0 = Math.round(by) - (b.h - 1);
  const s = new Surface(g.w, g.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.at(x, y)) s.dot(x0 + x, y0 + y, colour);
  s.outline(ink);
  const bb = s.bounds();
  g.blit(s);
  return { box: bb ? { x: bb.x0, y: bb.y0, w: bb.x1 - bb.x0 + 1, h: bb.y1 - bb.y0 + 1 } : { x: x0, y: y0, w: 0, h: 0 } };
}
