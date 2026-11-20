// PORT (migration batch M9): a copy of engine/bubbles.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/bubbles.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Speech and thought bubbles, name plates (added with batch H5a, bundles/specs/core-sprites-3.md): the boxes that carry
// a game's own words over a character. panel9 (engine/ui.js) and skinPanel (engine/ui-skins.js) draw boxes and
// skinTooltip a fixed tail; these draw a bubble with a tail in a chosen direction, a spiky shout, a cloud with a trail
// of puffs, a plate with a badge, and the pieces a game sets along an edge (a tail alone, a notch).
//
//   const b = speechBubble(g, 1, 1, 94, 46, { style: p.style, tail: p.tail, face: p.face, frame: p.frame, border: p.border, corner: p.corner, shadow: p.shadow });
//   textArea: (clip, p) => ({ ...b.inner, text: INK, edge: b.edge })        // slice: plus the frame's 1 px
//   const t = thoughtBubble(g, 1, 1, 94, 46, { style: 'cloud', trail: 'down-left', face, frame, accent });
//   const n = namePlate(g, 1, 1, 62, 14, { style: 'plain', face, frame, accent, badge: true });   // n.text, n.badgeText
//   const r = bubbleGrow(b.body, b.tip, k);   // an opening clip: draw the bubble into r, k from 0 to 1
//
// SHARED RULES. From the outside in: 1 px ink, the line band of `frame` (1 px at border 0, 2 px at border 1), the face,
// flat. No bevel: the face is one colour, and is the text area (`inner`; a plate's `text` and `badgeText`). Each piece is
// painted as one shape (body, tail, spikes, bumps together) by depth from its edge, so a tail's face runs into the
// bubble's face with no line across. Everything that is not flat (corners, spikes, bumps, the tail and its join, the
// drop shadow) lies in the four CORNER ZONES, outside the columns and the rows of `inner`, so a piece stretches: drawn
// wider or taller, every middle column and row repeats unchanged. `slice` is how far that reaches in from each side of
// the rectangle given (the side a tail or trail leaves gets the larger slice); a sprite adds the frame's 1 px. The drop
// shadow (shadow: true) falls 2 px down and to the left, inside the rectangle and inside the slice.
// Nothing is drawn outside the rectangle given; every helper returns the rectangles it drew.
// TIGHT. `inner` normally keeps clear of the corner zones, so it stretches; a small balloon that is never stretched
// (emote-bubbles) passes `tight: true` and gets the whole flat face instead: the body less its ink and band, 1 + band px
// each side (2 px at border 0), more only where a corner cuts deeper (a box notch). `slice` is still the stretch slice.
// A box too small for its style gives an empty `inner` (w or h 0, never negative), and `slice` is never negative.
// TRIMMED (review M9 round 1, issue 3): the declarations and imports no M9 port reaches are left out, so the copy holds
// only what draws; what is kept is word for word as before.

import { Surface, ellipseIn, polyIn } from './surface.js';
import { tone, INK } from './colour.js';
import { roundRectIn, cornerPx, EDGE } from './ui.js';

/** The speech bubble styles: round (round corners), box (square corners, a notch at each), shout (three spikes out of each corner). No arguments: a frozen list. */
export const SPEECH_STYLES = Object.freeze(['round', 'box', 'shout']);
/** The thought bubble styles: cloud (two bumps per corner), puff (one big bump per corner), dream (as cloud, with a sparkle beside each top corner). No arguments: a frozen list. */
export const TAIL_DIRS = Object.freeze(['down-left', 'down-right', 'up-left', 'up-right', 'left', 'right']);
/** The directions a thought bubble's trail of puffs can run: down-left, down-right, up-left, up-right, down (the middle of the bottom). No arguments: a frozen list. */
export const PLATE_STYLES = Object.freeze(['plain', 'ribbon', 'pointed']);

const SH = 2;   // the drop shadow's offset, down and to the left
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const bandOf = (border) => 1 + Math.round(clamp01(border ?? 0.5));
function check(fn, what, v, list) {
  if (!list.includes(v)) throw new Error(`${fn}: ${what} "${v}" is not one of ${list.join(', ')}`);
}
function need(fn, face, frame) {
  if (!face || !frame) throw new Error(`${fn}: needs a face and a frame colour`);
}

// ---- one shape, painted by depth ----------------------------------------------------------------------------------

// A mask the size of the surface: the pixels of one piece.
function maskOf(g) { return new Uint8Array(g.w * g.h); }
function addTest(m, g, x0, y0, x1, y1, inside) {
  for (let py = Math.max(0, Math.floor(y0)); py < Math.min(g.h, Math.ceil(y1)); py++) for (let px = Math.max(0, Math.floor(x0)); px < Math.min(g.w, Math.ceil(x1)); px++) if (inside(px + 0.5, py + 0.5)) m[py * g.w + px] = 1;
}
const addPx = (m, g, px, py) => { if (px >= 0 && py >= 0 && px < g.w && py < g.h) m[py * g.w + px] = 1; };

// Depth of every pixel of a mask: 1 on its edge (a side neighbour outside), 2 one pixel in, ... up to cap.
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

// Paints a mask: ink on its edge, the band `b` px deep, the face inside. With shadow, the mask in ink 2 px down-left first.
function paintMask(g, m, { face, frame, b, ink, shadow }) {
  const W = g.w, H = g.h;
  if (shadow) for (let i = 0; i < W * H; i++) if (m[i]) { const x = i % W, y = (i - x) / W; g.dot(x - SH, y + SH, ink); }
  const d = depthOf(m, W, H, b + 2);
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const x = i % W, y = (i - x) / W;
    g.dot(x, y, d[i] === 1 ? ink : d[i] <= 1 + b ? frame : face);
  }
  return d;
}

// The text area: the body B less the insets `ins`, never negative (an empty area sits in the middle of what is left,
// inside the box). With tight, the body less its ink and band (1 + b px each side), stepped in further until every
// pixel is face (depth past the band); `ins` then only matters for the slice.
function innerOf(B, ins, box, { tight, d, W, b }) {
  let r;
  if (tight) {
    const allFace = (k) => {
      for (let py = B.y + k; py < B.y + B.h - k; py++) for (let px = B.x + k; px < B.x + B.w - k; px++) {
        if (px < 0 || py < 0 || px >= W || py * W + px >= d.length || d[py * W + px] <= 1 + b) return false;
      }
      return true;
    };
    let k = 1 + b;
    while (2 * k < Math.min(B.w, B.h) && !allFace(k)) k++;
    r = { x: B.x + k, y: B.y + k, w: B.w - 2 * k, h: B.h - 2 * k };
  } else r = { x: B.x + ins.left, y: B.y + ins.top, w: B.w - ins.left - ins.right, h: B.h - ins.top - ins.bottom };
  const fit = (p, n, lo, hi) => {
    if (n > 0) return [p, n];
    const c = Math.round(p + n / 2);
    return [Math.min(hi, Math.max(lo, c)), 0];
  };
  [r.x, r.w] = fit(r.x, r.w, box.x, box.x + box.w);
  [r.y, r.h] = fit(r.y, r.h, box.y, box.y + box.h);
  return r;
}
// The slice of a stretch inner `s` within the box, never negative.
function sliceOf(s, box) {
  const t = { x: s.x, y: s.y, w: Math.max(0, s.w), h: Math.max(0, s.h) };
  const L = Math.max(0, Math.min(box.w, t.x - box.x)), T = Math.max(0, Math.min(box.h, t.y - box.y));
  return { left: L, top: T, right: Math.max(0, box.x + box.w - (t.x + t.w)), bottom: Math.max(0, box.y + box.h - (t.y + t.h)) };
}

// ---- tails ---------------------------------------------------------------------------------------------------------

// The rows of a wedge `width` px wide at its base (row 0) narrowing to one pixel at row `len`, its tip at column
// `tipU` (0 is the base's first column): [[v, first u, last u], ...]. Its sides bow out a little (it stays wide near
// the bubble and narrows fast at the end), so even a short tail shows its face.
function wedge(width, len, tipU) {
  const out = [];
  for (let v = 0; v <= len; v++) {
    const k = len ? (v / len) ** 1.6 : 1;
    out.push([v, Math.round(tipU * k), Math.round((width - 1) + (tipU - (width - 1)) * k)]);
  }
  return out;
}

// A tail's pixels and tip for a bubble body B, in a side's own frame turned to the page (see TAIL_DIRS).
// Canonical: along the bottom edge, its base 7 px wide (5 px inside its ink) starting 3 px from the left corner, its
// tip 2 px further left than the base.
function tailPixels(B, dir, len) {
  const rows = wedge(7, len, -2).map(([v, a, z]) => [v, a + 3, z + 3]);
  const R = B.x + B.w - 1, Bt = B.y + B.h - 1;
  const place = {
    'down-left': (u, v) => [B.x + u, Bt + v],
    'down-right': (u, v) => [R - u, Bt + v],
    'up-left': (u, v) => [B.x + u, B.y - v],
    'up-right': (u, v) => [R - u, B.y - v],
    left: (u, v) => [B.x - v, Bt - u],
    right: (u, v) => [R + v, Bt - u],
  }[dir];
  const px = [];
  for (const [v, a, z] of rows) for (let u = a; u <= z; u++) px.push(place(u, v));
  const [tx, ty] = place(rows.at(-1)[1], len);
  return { px, tip: { x: tx, y: ty } };
}

const sideOf = (dir) => (dir === 'none' ? null : dir === 'left' || dir === 'right' ? dir : dir.startsWith('down') ? 'bottom' : 'top');

// A tail or notch drawn alone, its top row on a bubble's bottom band: the band and face of that edge on its top two
// rows, so it covers the edge seamlessly. width: the wedge at the bubble (ink included); len: rows below the edge.
function tailAlone(g, cx, top, { dir, width, len, face, frame, ink }) {
  const x0 = cx - (width >> 1), x1 = x0 + width - 1;
  const tipU = dir === 'down' ? (width - 1) / 2 : dir === 'down-left' ? -1 : width;
  // a stand-in for the bubble's bottom edge: three rows of face above the band row, the band row, the ink row
  const W = width + 10, H = len + 8, ox = x0 - 5, oy = top - 4;
  const m = new Uint8Array(W * H);
  for (let y = 0; y <= 5; y++) for (let x = 0; x < W; x++) m[y * W + x] = 1;
  for (const [v, a, z] of wedge(width, len, tipU)) for (let u = a; u <= z; u++) m[(5 + v) * W + 5 + u] = 1;
  const d = depthOf(m, W, H, 3);
  const s = new Surface(g.w, g.h);
  let tip = null;
  for (let y = 4; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!m[i]) continue;
    const px = ox + x, py = oy + y;
    if (y <= 5 && (px < x0 - 1 || px > x1 + 1)) continue;
    s.dot(px, py, d[i] === 1 ? ink : d[i] === 2 ? frame : face);
  }
  const last = wedge(width, len, tipU).at(-1);
  tip = { x: x0 + last[1], y: top + 1 + len };
  g.blit(s);
  const b = s.bounds();
  return { tip, rect: b ? { x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 } : null };
}

// ---- speech bubbles ------------------------------------------------------------------------------------------------

// Spikes of a shout, for the top left corner, as polygons in edge units (x right, y down from the body's corner).
const SPIKES = [[[0, 3], [3, 0], [-3, -3]], [[4, 0], [7, 0], [5.5, -3]], [[0, 4], [0, 7], [-2, 5.5]]];
// The four corners as functions from a corner's local (u, v) to the page, for points in edge units.
const cornerMaps = (B) => [
  (u, v) => [B.x + u, B.y + v], (u, v) => [B.x + B.w - u, B.y + v],
  (u, v) => [B.x + B.w - u, B.y + B.h - v], (u, v) => [B.x + u, B.y + B.h - v],
];

/**
 * Draws a speech bubble filling the box (x, y, w, h) with its tail: returns { body, inner, edge, slice, tip }; `inner` is the flat face (the text area; never negative), `tip` the tail's outermost pixel (of the tail itself: with shadow, the drop shadow lies 2 px beyond it, down and to the left).
 * Arguments: g; x, y, w, h; opt { style (SPEECH_STYLES), tail (TAIL_DIRS or 'none'), tailLen (px, default 5), face, frame (colours), border (0..1: the band 1 to 2 px), corner (0..1: round corners 0 to 4 px; box: a notch 1 to 3 px), shadow, tight (inner is the whole flat face, for a balloon never stretched: see TIGHT), ink }.
 */
export function speechBubble(g, x, y, w, h, { style = 'round', tail = 'down-left', tailLen = 5, face, frame, border = 0.5, corner = 0.5, shadow = false, tight = false, ink = INK } = {}) {
  check('speechBubble', 'style', style, SPEECH_STYLES);
  if (tail !== 'none') check('speechBubble', 'tail', tail, TAIL_DIRS);
  need('speechBubble', face, frame);
  const b = bandOf(border), sh = shadow ? SH : 0, shout = style === 'shout';
  const P = shout ? 3 : 0, L = tail === 'none' ? 0 : Math.max(2, Math.round(tailLen)), side = sideOf(tail);
  const T = Math.max(0, L - P);
  // the room for the body: the box less the shadow, less the tail's rows on its side, less the spikes' room
  const R = { x: x + sh, y, w: w - sh, h: h - sh };
  if (side === 'bottom') R.h -= T;
  if (side === 'top') { R.y += T; R.h -= T; }
  if (side === 'left') { R.x += T; R.w -= T; }
  if (side === 'right') R.w -= T;
  const B = { x: R.x + P, y: R.y + P, w: R.w - 2 * P, h: R.h - 2 * P };
  const m = maskOf(g);
  if (style === 'round') addTest(m, g, B.x, B.y, B.x + B.w, B.y + B.h, roundRectIn(B.x, B.y, B.w, B.h, cornerPx(corner)));
  else {
    const n = style === 'box' ? 1 + Math.round(clamp01(corner) * 2) : 0;
    addTest(m, g, B.x, B.y, B.x + B.w, B.y + B.h, (px, py) => {
      const dx = Math.min(px - B.x, B.x + B.w - px), dy = Math.min(py - B.y, B.y + B.h - py);
      return px >= B.x && py >= B.y && px < B.x + B.w && py < B.y + B.h && !(dx < n && dy < n);
    });
    if (style === 'box') for (const [ux, uy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      // the notch's inner corner pixel is kept, so the outline steps in: a 1 px notch at square 0, deeper rounder up
      const cx = ux ? B.x + B.w - 1 - n : B.x + n, cy = uy ? B.y + B.h - 1 - n : B.y + n;
      addPx(m, g, cx, cy);
    }
    if (shout) for (const map of cornerMaps(B)) for (const pts of SPIKES) {
      const poly = pts.map(([u, v]) => map(u, v));
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      addTest(m, g, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), polyIn(poly));
    }
  }
  let tip = null;
  if (side) {
    const t = tailPixels(B, tail, L);
    for (const [px, py] of t.px) addPx(m, g, px, py);
    tip = t.tip;
  }
  const d = paintMask(g, m, { face, frame, b, ink, shadow: !!shadow });
  // the flat middle: EDGE px in from the body, more where a spike, the tail or the shadow's corner reaches
  const k = shout ? 9 : EDGE, tl = 11 + sh;
  const ins = { left: k, top: Math.max(k, sh ? sh + 4 : 0), right: Math.max(k, sh ? sh + 5 : 0), bottom: k };
  if (tail === 'down-left' || tail === 'up-left') ins.left = Math.max(ins.left, tl);
  if (tail === 'down-right' || tail === 'up-right') ins.right = Math.max(ins.right, tl);
  if (tail === 'left' || tail === 'right') ins.bottom = Math.max(ins.bottom, tl);
  if (shout && sh) { ins.right = Math.max(ins.right, k + sh); ins.top = Math.max(ins.top, k + sh); }
  const box = { x, y, w, h }, at = { d, W: g.w, b };
  const stretch = innerOf(B, ins, box, { ...at, tight: false });
  const inner = tight ? innerOf(B, ins, box, { ...at, tight: true }) : stretch;
  return { body: B, inner, edge: { x: B.x + (B.w >> 1), y: B.y + 1 }, slice: sliceOf(stretch, box), tip };
}

/**
 * Draws a tail alone with its top row on `top`, pointing down, down-left or down-right, for a game to set anywhere along a bubble's bottom edge: its top two rows are a 1 px band and the face, so it covers that edge seamlessly. Returns { tip, rect }.
 * Arguments: g; cx (the tail's middle column), top (the row of the bubble's bottom band); opt { dir ('down', 'down-left', 'down-right'), size (px wide at the bubble, ink included, and rows long; default 5), face, frame, ink }.
 */
export function bubbleTail(g, cx, top, { dir = 'down', size = 5, face, frame, ink = INK } = {}) {
  check('bubbleTail', 'dir', dir, ['down', 'down-left', 'down-right']);
  need('bubbleTail', face, frame);
  const n = Math.max(3, Math.round(size));
  return tailAlone(g, cx, top, { dir, width: n, len: n, face, frame, ink });
}

// ---- thought bubbles -----------------------------------------------------------------------------------------------

// Bumps of each style for the top left corner, in edge units (u right, v down from the body's corner): [cu, cv, rx, ry].
export function bubbleGrow(rect, tip, k) {
  const t = clamp01(k);
  const sx = tip.x > rect.x + rect.w / 2 ? tip.x - 1 : tip.x, sy = tip.y > rect.y + rect.h / 2 ? tip.y - 1 : tip.y;
  const w = 2 + Math.round((rect.w - 2) * t), h = 2 + Math.round((rect.h - 2) * t);
  // the left and top edges travel from the 2x2 to the rectangle's; the size alone sets the right and bottom
  const x0 = Math.round(sx + (rect.x - sx) * t), y0 = Math.round(sy + (rect.y - sy) * t);
  return { x: t >= 1 ? rect.x : x0, y: t >= 1 ? rect.y : y0, w, h };
}

// ---- name plates ---------------------------------------------------------------------------------------------------

// How far in from each end the plate's end shape reaches (the text starts this far in).
const PLATE_END = { plain: 6, ribbon: 7, pointed: 9 };

/**
 * Draws a name plate filling (x, y, w, h), for a name over a character: returns { body, text, badgeText, edge, slice }; `text` is the flat face clear of the badge, `badgeText` the badge's inside (or null).
 * Arguments: g; x, y, w, h (a 64x16 frame: 1, 1, 62, 14); opt { style (PLATE_STYLES), face, frame, accent (the badge ring and the arrows), border (0..1), corner (0..1, plain), shadow, badge (a round badge at the left end), lit (the band brightened and an arrow head at each end), ink }.
 */
export function namePlate(g, x, y, w, h, { style = 'plain', face, frame, accent, border = 0.5, corner = 0.5, shadow = false, badge = false, lit = false, ink = INK } = {}) {
  check('namePlate', 'style', style, PLATE_STYLES);
  need('namePlate', face, frame);
  const b = bandOf(border), sh = shadow ? SH : 0;
  const B = { x: x + sh, y, w: w - sh, h: h - sh };
  const band = lit ? tone(frame, 0.45) : frame, A = accent ?? tone(frame, 0.85);
  const mid = (B.h - 1) / 2;
  const m = maskOf(g);
  if (style === 'plain') addTest(m, g, B.x, B.y, B.x + B.w, B.y + B.h, roundRectIn(B.x, B.y, B.w, B.h, Math.min(cornerPx(corner), (B.h - 1) >> 1)));
  else {
    const F = 3;
    // u: pixels in from the nearer end; v: the row
    const endCut = style === 'ribbon'
      ? (v) => Math.max(0, F - Math.round(Math.abs(v - mid) * F / (B.h / 2)))
      : (v) => Math.floor(Math.abs(v - mid));
    for (let v = 0; v < B.h; v++) for (let i = 0; i < B.w; i++) {
      const u = Math.min(i, B.w - 1 - i);
      if (u >= endCut(v)) addPx(m, g, B.x + i, B.y + v);
    }
  }
  paintMask(g, m, { face, frame: band, b, ink, shadow: !!shadow });
  let end = PLATE_END[style];
  let badgeText = null;
  if (badge) {
    // a round badge as tall as the plate at its left end: ink, a ring of the accent, the face inside
    const D = B.h, cx = B.x + D / 2, cy = B.y + D / 2;
    const bm = maskOf(g);
    addTest(bm, g, B.x, B.y, B.x + D, B.y + D, ellipseIn(cx, cy, D / 2, D / 2));
    if (shadow) for (let i = 0; i < bm.length; i++) if (bm[i] && !m[i]) { const px = i % g.w, py = (i - px) / g.w; g.dot(px - SH, py + SH, ink); }
    paintMask(g, bm, { face, frame: A, b: 1, ink, shadow: false });
    // the largest square of face round the badge's middle
    const fx = Math.floor(cx), fy = Math.floor(cy);
    const dm = depthOf(bm, g.w, g.h, 3), ok = (px, py) => bm[py * g.w + px] && dm[py * g.w + px] >= 3;
    let best = null;
    for (let a = D; a >= 1 && !best; a--) {
      const x0 = fx - (a >> 1), y0 = fy - (a >> 1);
      let all = true;
      for (let py = y0; py < y0 + a && all; py++) for (let px = x0; px < x0 + a; px++) if (!ok(px, py)) { all = false; break; }
      if (all) best = { x: x0, y: y0, w: a, h: a };
    }
    badgeText = best;
    end = Math.max(end, D + 4);
  }
  const text = { x: B.x + end, y: B.y + 1 + b, w: B.w - end - PLATE_END[style], h: B.h - 2 * (1 + b) };
  if (lit) {
    // an arrow head of the accent at each end, 3 px tall, pointing in towards the name
    const my = B.y + Math.floor(mid);
    for (const [ax, dir] of [[text.x - 3, 1], [text.x + text.w + 2, -1]]) {
      for (const [dx, dy] of [[0, -1], [0, 0], [0, 1], [dir, 0]]) if (m[(my + dy) * g.w + ax + dx]) g.dot(ax + dx, my + dy, A);
    }
  }
  const slice = { left: text.x - x, top: text.y - y, right: x + w - (text.x + text.w), bottom: y + h - (text.y + text.h) };
  return { body: B, text, badgeText, edge: { x: B.x + (B.w >> 1), y: B.y + 1 }, slice };
}

/**
 * Draws a small notch pointing down, for a game to set under the middle of a name plate: its top rows are a plate's bottom band and face, so it joins the plate seamlessly. Returns { tip, rect }.
 * Arguments: g; cx (its middle column), top (the row of the plate's bottom band); opt { size (rows long, and the face 2 px narrower than it is wide; default 3), face, frame, ink }.
 */
export function plateNotch(g, cx, top, { size = 3, face, frame, ink = INK } = {}) {
  need('plateNotch', face, frame);
  const n = Math.max(2, Math.round(size));
  return tailAlone(g, cx, top, { dir: 'down', width: n + 2, len: n, face, frame, ink });
}
