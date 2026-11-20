// The Gridline kit's interface piece (family "ui"): the dark window with a lit frame that its boxes, panels, counter
// and gauge are built from (bundles/specs/kit-puzzle-gridline.md, "Interface": what its three styles drew with panel9
// 'plain' and cornerBlocks, techPanel 'plate', and the neon tube of the skins; those sprites' code was never carried
// over, so this is written from the specification and the reviewed renders). It RETURNS PRIMITIVES, as the pieces of
// engine/gen/ui-pieces.js do, and the panel layout (engine/gen/ui.js) writes its slice and text areas to the sheet
// (measureGridbox, listed in UI_MEASURES).
//
//   { "gen": "ui.gridbox", "v": 1, "at": [1, 1], "size": [94, 62], "look": "blocks", "border": 2, "tab": "left",
//     "face": "face", "frame": "frame", "accent": "accent", "shine": "shine", "spent": "spent" }
//
// THE LOOKS (rings counted inward from the rectangle's edge; `border` b is the band's width, 1 to 3 px):
//   blocks   square corners: ink, the band (lit along the top and right when 2 px or more), ink, the face with a 1 px
//            darker line under the top and right of the frame; then a 6 px block.cell@1 (bevel) of the accent on each
//            corner of the body
//   plate    corners cut at 45 degrees by `corner` px: ink, a light edge, the band (darker along its lower left), ink, the face
//   tube     corners round by `corner`: ink, the tube (a lighter core when 2 px or more), a ring of the tube's glow on
//            the face, the face
// A TAB (`tab` left or right) is a second, smaller box of the same look, 44 px wide, standing 12 px above the body and
// starting 6 px in from its side, its band 1 px thinner; the body is drawn over its lower rows, so the two read as one
// piece. `chevron` cuts an ink notch in the body's top band under the middle of the tab and puts a 5 x 3 down arrow in
// it. `dim` is the box that cannot be used: the frame in its dark tone, the corner blocks in `spent` (a grey).
// `flash` turns the frame and the corner blocks toward `shine`; with `fade` it dies away over a clip that does not
// loop (and pulses over one that does).
//
// MEASURES. Text areas: the piece area (the flat face, clear of the corner blocks) and, with a tab, the title strip
// (the tab's flat face above the body); both hold only the face colour. Each carries `edge` (a pixel of the frame
// band) unless the box is dim. Slice: how far the piece area lies from each side (7 px of the rectangle at least), the
// top down to the piece area so the tab keeps its height, and the tab's side out past the tab so it keeps its width.
//
// Pure: no surface, no clock, no randomness; runs the same in the browser and in Node.
import { defineGenerator } from './registry.js';
import { point, px, share, word, flag, paint } from './args.js';
import { UI_SLICE, roundRows, cutRows, rowsArea, spansArea, rectArea, marksToStamps, toneOf, mixOf } from './ui-shapes.js';

/** The looks ui.gridbox@1 draws: blocks (square, a block on each corner), plate (cut corners, a lit edge), tube (round, a neon tube). */
export const GRID_LOOKS = Object.freeze(['blocks', 'plate', 'tube']);

/** Where ui.gridbox@1 puts its title tab: none, over the left of the top edge, or over the right. */
export const GRID_TABS = Object.freeze(['none', 'left', 'right']);

const TAB_W = 44, TAB_RISE = 12, TAB_IN = 6, TAB_UNDER = 8;   // the tab: its width, the rows above the body, its distance from the body's side, its rows under the body
const BLOCK = 6;                                               // a corner block's side
const SHADOW_MAX = 24;                                         // rects a plate's band shadow takes at most (its spans change only in the corners)

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(fin(v) ? v : lo)));
const clamp01 = (v) => Math.max(0, Math.min(1, fin(v) ? v : 0));
const flat = (p) => ({ paint: p, shade: 0 });
const lit = (p) => ({ paint: p, shade: 1, light: 1 });
const inset = (r, n) => ({ x: r.x + n, y: r.y + n, w: r.w - 2 * n, h: r.h - 2 * n });
const meet = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y }; };

/** The 4-neighbour erosion of rows (one span each): the pixels one step deeper inside. */
function erode(rows) {
  const at = new Map(rows.map((r) => [r[0], r]));
  const out = [];
  for (const [y, x0, x1] of rows) {
    const up = at.get(y - 1), dn = at.get(y + 1);
    if (!up || !dn) continue;
    const a = Math.max(x0 + 1, up[1], dn[1]), b = Math.min(x1 - 1, up[2], dn[2]);
    if (a <= b) out.push([y, a, b]);
  }
  return out;
}

/** One box of a look in rectangle r with band b and corner k: its rings (rings[d - 1]: the pixels of depth d and deeper, as a Map y -> row too) and its flat inner rectangle. */
function boxOf(look, r, b, k) {
  const outer = look === 'plate' ? cutRows(r.x, r.y, r.w, r.h, k) : roundRows(r.x, r.y, r.w, r.h, look === 'tube' ? k : 0);
  const rings = [outer];
  for (let d = 1; d < 3 + b; d++) rings.push(erode(rings[d - 1]));
  const face = new Map((rings[2 + b] ?? []).map((row) => [row[0], row]));
  const inFace = (x, y) => { const s = face.get(y); return !!s && x >= s[1] && x <= s[2]; };
  // the flat inner: the face's rectangle, set in until its corners are face (a cut or round corner reaches further in)
  let i = 2 + b;
  while (2 * i < Math.min(r.w, r.h) && !inFace(r.x + i, r.y + i)) i++;
  let inner = inset(r, i);
  if (look === 'blocks') inner = { x: inner.x, y: inner.y + 1, w: inner.w - 1, h: inner.h - 1 };   // the sunken line under the top and right
  return { r, b, rings, inner };
}

/** The pixels of a plate's band on its shadow side, as spans: those of depth 3 whose pixel down and to the left is less deep. */
function bandShadow(ring3) {
  const at = new Map(ring3.map((row) => [row[0], row]));
  const spans = [];
  for (const [y, x0, x1] of ring3) {
    const below = at.get(y + 1);
    // inside the row below shifted right by one, every pixel has a deeper neighbour down and to the left
    const a = below ? Math.max(x0, below[1] + 1) : x1 + 1, b = below ? Math.min(x1, below[2] + 1) : x0 - 1;
    if (a > b) { spans.push([y, x0, x1]); continue; }
    if (x0 <= a - 1) spans.push([y, x0, a - 1]);
    if (b + 1 <= x1) spans.push([y, b + 1, x1]);
  }
  return spans;
}

/** The primitives of one box: its rings painted from the outside in. Arguments: B (boxOf), look, C ({ ink, face, frame }). */
function boxPrims(B, look, C) {
  const b = B.b, ring = (d) => B.rings[d - 1] ?? [];
  const out = [...rowsArea(ring(1), flat(C.ink))];
  if (look === 'blocks') {
    out.push(...rowsArea(ring(2), b >= 2 ? lit(C.frame) : flat(C.frame)));
    out.push(...rowsArea(ring(2 + b), flat(C.ink)), ...rowsArea(ring(3 + b), flat(C.face)));
    const f = inset(B.r, 2 + b);
    if (f.w > 0 && f.h > 0) out.push(...rectArea(f.x, f.y, f.w, 1, flat(toneOf(C.face, 'dark'))), ...rectArea(f.x + f.w - 1, f.y, 1, f.h, flat(toneOf(C.face, 'dark'))));
  } else if (look === 'plate') {
    out.push(...rowsArea(ring(2), flat(toneOf(C.frame, 'light'))));
    if (b >= 2) {
      out.push(...rowsArea(ring(3), flat(C.frame)));
      out.push(...spansArea(bandShadow(ring(3)), flat(toneOf(C.frame, 'dark'))).slice(0, SHADOW_MAX));
    }
    out.push(...rowsArea(ring(2 + b), flat(C.ink)), ...rowsArea(ring(3 + b), flat(C.face)));
  } else {
    out.push(...rowsArea(ring(2), flat(C.frame)));
    if (b >= 2) out.push(...rowsArea(ring(3), flat(toneOf(C.frame, 'light'))));
    if (b >= 3) out.push(...rowsArea(ring(4), flat(C.frame)));
    out.push(...rowsArea(ring(2 + b), flat(mixOf(C.face, C.frame, 0.35))), ...rowsArea(ring(3 + b), flat(C.face)));
  }
  return out;
}

/** Everything a grid box works out before drawing: its rectangle, the body and the tab (boxOf each), the piece area and the title strip. */
function gridGeom(a) {
  const x = Math.floor(a.at[0]), y = Math.floor(a.at[1]), w = Math.round(a.size[0]), h = Math.round(a.size[1]);
  const b = clampI(a.border, 1, 3), k = clampI(a.corner, 0, 4);
  const side = a.tab !== 'none' && w >= TAB_W + 2 * TAB_IN + 2 * BLOCK && h - TAB_RISE >= 24 ? a.tab : 'none';
  const rise = side === 'none' ? 0 : TAB_RISE;
  const body = boxOf(a.look, { x, y: y + rise, w, h: h - rise }, b, k);
  const tab = side === 'none' ? null : boxOf(a.look, { x: side === 'left' ? x + TAB_IN : x + w - TAB_IN - TAB_W, y, w: TAB_W, h: TAB_RISE + TAB_UNDER }, Math.max(1, b - 1), k);
  const piece = a.look === 'blocks' ? meet(body.inner, inset(body.r, BLOCK)) : body.inner;
  const title = tab ? { x: tab.inner.x, y: tab.inner.y, w: tab.inner.w, h: body.r.y - tab.inner.y } : null;
  return { x, y, w, h, b, side, rise, body, tab, piece, title };
}

/** How far the flash has gone at this moment: `flash`, dying away over a clip that does not loop (pulsing over one that does) with `fade`. */
function flashAt(a, ctx) {
  const t = fin(ctx?.t) ? ctx.t : 0;
  const amount = clamp01(a.flash) * (a.fade ? (ctx?.loop ? 0.5 + 0.5 * Math.cos(2 * Math.PI * t) : 1 - clamp01(t)) : 1);
  return Math.round(amount * 1e4) / 1e4;
}

/**
 * ui.gridbox@1: a stretchable dark window of the Gridline kit filling its rectangle (ink outline included): look
 * blocks (square corners and a block.cell@1 on each corner of the body), plate (cut corners, a lit edge) or tube (round
 * corners, a neon tube and its glow); an optional title tab over the left or right of the top edge, a down arrow under
 * the tab, a dimmed look and a white flash. Its piece area and the tab's title strip hold only the face colour (see the
 * header for the rings and the measures). Arguments: at, size, look, corner, border, tab, chevron, dim, flash, fade,
 * face, frame, accent, shine, spent, ink.
 */
export const uiGridbox = defineGenerator({
  id: 'ui.gridbox', v: 1, family: 'ui',
  about: 'A dark window with a lit frame filling a rectangle: blocks on its corners, a cut plate or a neon tube, with an optional title tab, down arrow, dimmed look and flash.',
  args: {
    at: point({ default: [0, 0], about: 'The top left corner of the rectangle it fills, in frame pixels' }),
    size: point({ lo: 16, hi: 640, about: 'The width and height of the rectangle it fills, its ink outline and its tab included' }),
    look: word([...GRID_LOOKS], { default: 'blocks', about: 'blocks (square, a block cell on each corner), plate (cut corners, a lit edge) or tube (round corners, a neon tube)' }),
    corner: px(0, 4, { default: 2, about: 'How far a plate\'s corners are cut or a tube\'s are round, 0 to 4 px (the blocks look keeps square corners)' }),
    border: px(1, 3, { default: 2, about: 'Width of the frame band in pixels, 1 to 3 (rounded); a tab\'s band is 1 px thinner' }),
    tab: word([...GRID_TABS], { default: 'none', about: 'A title tab 44 px wide standing 12 px above the body: none, left or right (none when the rectangle is too small for one)' }),
    chevron: flag({ default: false, about: 'A 5 x 3 down arrow on an ink notch in the top band, under the middle of the tab' }),
    dim: flag({ default: false, about: 'The box that cannot be used: the frame in its dark tone, the corner blocks in the spent colour' }),
    flash: share({ default: 0, about: 'How far the frame and the corner blocks have turned toward the shine' }),
    fade: flag({ default: false, about: 'The flash dies away over the clip (pulses when the clip loops)' }),
    face: paint({ default: 'face', about: 'The flat middle' }),
    frame: paint({ default: 'frame', about: 'The frame band' }),
    accent: paint({ default: 'frame', about: 'The corner blocks of the blocks look' }),
    shine: paint({ default: 'frame', about: 'A light slot (white) the flash turns toward' }),
    spent: paint({ default: 'face', about: 'A grey slot: the corner blocks of a dim box' }),
    ink: paint({ default: 'ink', about: 'The outline' }),
  },
  // two boxes (7 rings and a plate's band shadow each at most), the notch and its arrow, four corner blocks
  cost: (a, { costOf }) => 2 * (9 + SHADOW_MAX) + 2 + 4 * costOf({ gen: 'block.cell', v: 1, at: [0, 0], size: BLOCK, style: 'bevel', edge: 1, paint: 'ink' }),
  run(a, ctx, { call }) {
    const G = gridGeom(a);
    if (G.w < 16 || G.h < 16) return [];
    const amount = flashAt(a, ctx);
    const turn = (p) => (amount > 0 ? mixOf(p, a.shine, amount) : p);
    const C = { ink: a.ink, face: a.face, frame: a.dim ? toneOf(a.frame, 'dark') : turn(a.frame) };
    const out = [];
    if (G.tab) out.push(...boxPrims(G.tab, a.look, C));
    out.push(...boxPrims(G.body, a.look, C));
    const B = G.body.r;
    if (a.look === 'blocks') {
      const cell = a.dim ? a.spent : turn(a.accent);
      for (const [cx, cy] of [[B.x, B.y], [B.x + B.w - BLOCK, B.y], [B.x, B.y + B.h - BLOCK], [B.x + B.w - BLOCK, B.y + B.h - BLOCK]]) {
        if (Math.abs(cx) > 640 || Math.abs(cy) > 640) continue;   // beyond where a cell may be placed
        out.push(...call({ gen: 'block.cell', v: 1, at: [cx, cy], size: BLOCK, style: 'bevel', edge: 1, paint: cell, ink: a.ink }, ctx));
      }
    }
    if (a.chevron && G.tab) {
      const cx = G.tab.r.x + (G.tab.r.w >> 1), rows = Math.max(3, Math.min(G.piece.y - B.y, G.b + 2)), y0 = B.y + ((rows - 3) >> 1);
      out.push(...rectArea(cx - 3, B.y, 7, rows, flat(a.ink)));
      const marks = new Map();
      for (let j = 0; j < 3; j++) for (let i = -(2 - j); i <= 2 - j; i++) marks.set(`${cx + i},${y0 + j}`, 'a');
      out.push(...marksToStamps(marks, { a: toneOf(C.frame, 'light') }));
    }
    return out;
  },
});

/**
 * The slice and text areas of a ui.gridbox@1 call (Contract 8; UI_MEASURES in engine/gen/ui-pieces.js): { slice,
 * textArea }, the text area a list [piece area, title strip] when the box has a tab. Arguments: a (the call's arguments
 * with defaults filled), ctx ({ size: the frame }).
 */
export function measureGridbox(a, ctx = {}) {
  const G = gridGeom(a), p = G.piece, min = UI_SLICE - 1;
  // from the rectangle's own sides
  let left = Math.max(min, p.x - G.x), top = Math.max(min + G.rise, p.y - G.y);
  let right = Math.max(min, G.x + G.w - (p.x + p.w)), bottom = Math.max(min, G.y + G.h - (p.y + p.h));
  if (G.side === 'left') left = Math.max(left, G.tab.r.x + G.tab.r.w - G.x + 1);
  if (G.side === 'right') right = Math.max(right, G.x + G.w - G.tab.r.x + 1);
  const size = Array.isArray(ctx.size) ? ctx.size : [0, 0];
  const fills = G.x <= 1 && G.y <= 1 && G.x + G.w >= size[0] - 1 && G.y + G.h >= size[1] - 1;
  const slice = fills
    ? { left: left + G.x, top: top + G.y, right: right + size[0] - (G.x + G.w), bottom: bottom + size[1] - (G.y + G.h) }
    : { rect: { x: G.x, y: G.y, w: G.w, h: G.h }, left, top, right, bottom };
  const edge = { x: G.body.r.x + (G.body.r.w >> 1), y: G.body.r.y + 1 };
  const area = (r) => (a.dim ? { ...r } : { ...r, edge: { ...edge } });
  return { slice, textArea: G.title ? [area(p), area(G.title)] : area(p) };
}

// ---- ui.gridbox@2 ------------------------------------------------------------------------------------------------
// The same window with four things put back as the kit's boxes had them (the reviewed renders of ui-piece-box):
//   corner   the Corner control itself, 0..1: a plate is cut round(corner x 4) px (techPanel's `cut`), a tube is rounded
//            by the candy cut table (moreSkinCuts('neon', corner)): square, then 1, 2-1, 4-2-1, 5-3-2-1 and 6-4-2-1 px
//            cut from its first rows, so the middle of the slider is a 4 px round
//   tube     the neon piece (moreSkinBase('neon', 'tube') and moreSkinMarks): ink, a 1 px gap of the face, the tube in
//            the frame colour, its light core, a third pixel of the tube inside the core at border 3, then the face; a
//            1 px border draws the same 2 px tube. No glow ring on the face. The tab is a whole tube too (never thinner
//            than 2 px) with only its two top corners round
//   dim      a tube goes to the frame's dark tone whole: edge, core and tab (a plate and the blocks as in version 1)
//   flash    over a clip that does not loop it steps in hundredths (1, 0.66, 0.33, 0 over four frames), and a flashing
//            blocks box is flat light: no shade band on its frame, plain squares for its corner blocks, so each step
//            adds two colours and the clip stays inside a ui's 16
// The blocks and plate looks at rest are version 1's, pixel for pixel.

/** The corner cut tables of ui.gridbox@2's tube, square to round: row by row, how many pixels each corner loses (engine/ui-candy-slab.js CANDY_CUTS). */
export const GRID_TUBE_CUTS = Object.freeze([[], [1], [2, 1], [4, 2, 1], [5, 3, 2, 1], [6, 4, 2, 1]].map((c) => Object.freeze(c)));

/** The cut table for a Corner value 0..1 that fits a w x h rectangle (the next squarer one when it does not). */
function tubeCuts(corner, w, h) {
  let k = Math.round(clamp01(corner) * (GRID_TUBE_CUTS.length - 1));
  while (k > 0 && (2 * GRID_TUBE_CUTS[k].length > h || 2 * GRID_TUBE_CUTS[k][0] + 2 > w)) k--;
  return GRID_TUBE_CUTS[k];
}

/** The rows of a rectangle whose corners lose `cuts` pixels row by row: all four, or only the top two (`bottom` false: a tab). */
function tableRows(x, y, w, h, cuts, bottom = true) {
  const out = [];
  for (let iy = 0; iy < h; iy++) {
    const ry = h - 1 - iy;
    const c = Math.max(iy < cuts.length ? cuts[iy] : 0, bottom && ry < cuts.length ? cuts[ry] : 0);
    if (c <= w - 1 - c) out.push([y + iy, x + c, x + w - 1 - c]);
  }
  return out;
}

/** One tube box in rectangle r with border b and Corner value corner: its rings (as boxOf), the tube's width tb (2 or 3) and its flat inner rectangle. */
function tubeOf(r, b, corner, bottom = true) {
  const tb = Math.max(2, b);
  const rings = [tableRows(r.x, r.y, r.w, r.h, tubeCuts(corner, r.w, r.h), bottom)];
  for (let d = 1; d < 3 + tb; d++) rings.push(erode(rings[d - 1]));
  return { r, b, tb, rings, inner: inset(r, 3 + tb) };
}

/** The primitives of one tube box: ink, the gap, the tube, its core, the face. Arguments: B (tubeOf), C ({ ink, face, frame, core }; core null: the tube in one colour). */
function tubePrims(B, C) {
  const ring = (d) => B.rings[d - 1] ?? [];
  const out = [...rowsArea(ring(1), flat(C.ink)), ...rowsArea(ring(2), flat(C.face)), ...rowsArea(ring(3), flat(C.frame))];
  if (C.core) {
    out.push(...rowsArea(ring(4), flat(C.core)));
    if (B.tb >= 3) out.push(...rowsArea(ring(5), flat(C.frame)));
  }
  out.push(...rowsArea(ring(3 + B.tb), flat(C.face)));
  return out;
}

/** Everything a version 2 grid box works out before drawing (as gridGeom, with `corner` 0..1 and the tube's own boxes). */
function gridGeom2(a) {
  const x = Math.floor(a.at[0]), y = Math.floor(a.at[1]), w = Math.round(a.size[0]), h = Math.round(a.size[1]);
  const b = clampI(a.border, 1, 3), tube = a.look === 'tube', k = a.look === 'plate' ? Math.round(clamp01(a.corner) * 4) : 0;
  const side = a.tab !== 'none' && w >= TAB_W + 2 * TAB_IN + 2 * BLOCK && h - TAB_RISE >= 24 ? a.tab : 'none';
  const rise = side === 'none' ? 0 : TAB_RISE;
  const bodyR = { x, y: y + rise, w, h: h - rise };
  const tabR = side === 'none' ? null : { x: side === 'left' ? x + TAB_IN : x + w - TAB_IN - TAB_W, y, w: TAB_W, h: TAB_RISE + TAB_UNDER };
  const body = tube ? tubeOf(bodyR, b, a.corner) : boxOf(a.look, bodyR, b, k);
  const tab = !tabR ? null : tube ? tubeOf(tabR, Math.max(1, b - 1), a.corner, false) : boxOf(a.look, tabR, Math.max(1, b - 1), k);
  const piece = a.look === 'blocks' ? meet(body.inner, inset(body.r, BLOCK)) : body.inner;
  const title = tab ? { x: tab.inner.x, y: tab.inner.y, w: tab.inner.w, h: body.r.y - tab.inner.y } : null;
  return { x, y, w, h, b, tube, side, rise, body, tab, piece, title };
}

/** How far a version 2 flash has gone: as flashAt, but over a clip that does not loop it falls in whole hundredths (1, 0.66, 0.33, 0 over four frames). */
function flashAt2(a, ctx) {
  const t = fin(ctx?.t) ? ctx.t : 0;
  const step = !a.fade ? 1 : ctx?.loop ? 0.5 + 0.5 * Math.cos(2 * Math.PI * t) : Math.floor((1 - clamp01(t)) * 100 + 1e-6) / 100;
  return Math.round(clamp01(a.flash) * step * 1e4) / 1e4;
}

/**
 * ui.gridbox@2: the stretchable dark window of the Gridline kit as ui.gridbox@1 draws it, with `corner` the Corner
 * control itself (0..1), the tube look drawn as the kit's neon piece (ink, a gap of the face, a 2 px tube with a light
 * core, round by the candy cut table; its tab a whole tube with two round top corners), a dim tube wholly in the
 * frame's dark tone, and a flash that falls 1, 0.66, 0.33, 0 and is flat light on the blocks look. Port of the tube of
 * engine/ui-skins-more.js (moreSkinMarks 'neon' 'tube' over roundSlab with moreSkinCuts) and of techPanel's `cut`.
 * Arguments: at, size, look, corner, border, tab, chevron, dim, flash, fade, face, frame, accent, shine, spent, ink.
 */
export const uiGridbox2 = defineGenerator({
  id: 'ui.gridbox', v: 2, family: 'ui',
  about: 'A dark window with a lit frame filling a rectangle: blocks on its corners, a cut plate or a round neon tube with a light core, with an optional title tab, down arrow, dimmed look and flash; Corner is 0 to 1.',
  args: {
    at: point({ default: [0, 0], about: 'The top left corner of the rectangle it fills, in frame pixels' }),
    size: point({ lo: 16, hi: 640, about: 'The width and height of the rectangle it fills, its ink outline and its tab included' }),
    look: word([...GRID_LOOKS], { default: 'blocks', about: 'blocks (square, a block cell on each corner), plate (cut corners, a lit edge) or tube (round corners, a neon tube with a light core)' }),
    corner: share({ default: 0.5, about: 'Square to Round, 0 to 1: a plate\'s corners are cut 0 to 4 px, a tube\'s are round by up to 6 px (4 px in the middle); the blocks look keeps square corners' }),
    border: px(1, 3, { default: 2, about: 'Width of the frame band in pixels, 1 to 3 (rounded); a tab\'s band is 1 px thinner; a tube is never thinner than 2 px' }),
    tab: word([...GRID_TABS], { default: 'none', about: 'A title tab 44 px wide standing 12 px above the body: none, left or right (none when the rectangle is too small for one)' }),
    chevron: flag({ default: false, about: 'A 5 x 3 down arrow on an ink notch in the top band, under the middle of the tab' }),
    dim: flag({ default: false, about: 'The box that cannot be used: the frame in its dark tone (a tube wholly), the corner blocks in the spent colour' }),
    flash: share({ default: 0, about: 'How far the frame and the corner blocks have turned toward the shine' }),
    fade: flag({ default: false, about: 'The flash dies away over the clip in hundredths (pulses when the clip loops)' }),
    face: paint({ default: 'face', about: 'The flat middle' }),
    frame: paint({ default: 'frame', about: 'The frame band' }),
    accent: paint({ default: 'frame', about: 'The corner blocks of the blocks look' }),
    shine: paint({ default: 'frame', about: 'A light slot (white) the flash turns toward' }),
    spent: paint({ default: 'face', about: 'A grey slot: the corner blocks of a dim box' }),
    ink: paint({ default: 'ink', about: 'The outline' }),
  },
  // two boxes (7 rings and a plate's band shadow each at most), the notch and its arrow, four corner blocks (a cell, or two rects in a flash)
  cost: (a, { costOf }) => 2 * (9 + SHADOW_MAX) + 2 + 4 * Math.max(2, costOf({ gen: 'block.cell', v: 1, at: [0, 0], size: BLOCK, style: 'bevel', edge: 1, paint: 'ink' })),
  run(a, ctx, { call }) {
    const G = gridGeom2(a);
    if (G.w < 16 || G.h < 16) return [];
    const amount = flashAt2(a, ctx), flashing = amount > 0 && !a.dim;
    const turn = (p) => (flashing ? mixOf(p, a.shine, amount) : p);
    const frame = a.dim ? toneOf(a.frame, 'dark') : turn(a.frame);
    const C = { ink: a.ink, face: a.face, frame, core: a.dim ? null : toneOf(frame, 'light') };
    // a flashing blocks box is flat light: its band carries no shade band
    const plain = (list) => (flashing && a.look === 'blocks' ? list.map(({ light, ...p }) => ({ ...p, shade: 0 })) : list);
    const box = (B) => (G.tube ? tubePrims(B, C) : plain(boxPrims(B, a.look, C)));
    const out = [];
    if (G.tab) out.push(...box(G.tab));
    out.push(...box(G.body));
    const B = G.body.r;
    if (a.look === 'blocks') {
      const cell = a.dim ? a.spent : turn(a.accent);
      for (const [cx, cy] of [[B.x, B.y], [B.x + B.w - BLOCK, B.y], [B.x, B.y + B.h - BLOCK], [B.x + B.w - BLOCK, B.y + B.h - BLOCK]]) {
        if (Math.abs(cx) > 640 || Math.abs(cy) > 640) continue;   // beyond where a cell may be placed
        if (flashing) out.push(...rectArea(cx, cy, BLOCK, BLOCK, flat(a.ink)), ...rectArea(cx + 1, cy + 1, BLOCK - 2, BLOCK - 2, flat(cell)));
        else out.push(...call({ gen: 'block.cell', v: 1, at: [cx, cy], size: BLOCK, style: 'bevel', edge: 1, paint: cell, ink: a.ink }, ctx));
      }
    }
    if (a.chevron && G.tab) {
      const cx = G.tab.r.x + (G.tab.r.w >> 1), rows = Math.max(3, Math.min(G.piece.y - B.y, G.b + 2)), y0 = B.y + ((rows - 3) >> 1);
      out.push(...rectArea(cx - 3, B.y, 7, rows, flat(a.ink)));
      const marks = new Map();
      for (let j = 0; j < 3; j++) for (let i = -(2 - j); i <= 2 - j; i++) marks.set(`${cx + i},${y0 + j}`, 'a');
      out.push(...marksToStamps(marks, { a: toneOf(C.frame, 'light') }));
    }
    return out;
  },
});

/**
 * The slice and text areas of a ui.gridbox@2 call (Contract 8; UI_MEASURES in engine/gen/ui-pieces.js), as
 * measureGridbox gives them for version 1: { slice, textArea }, the text area a list [piece area, title strip] when the
 * box has a tab; a tube's frame pixel (`edge`) is on its tube, one in from the gap. Arguments: a (the call's arguments
 * with defaults filled), ctx ({ size: the frame }).
 */
export function measureGridbox2(a, ctx = {}) {
  const G = gridGeom2(a), p = G.piece, min = UI_SLICE - 1;
  let left = Math.max(min, p.x - G.x), top = Math.max(min + G.rise, p.y - G.y);
  let right = Math.max(min, G.x + G.w - (p.x + p.w)), bottom = Math.max(min, G.y + G.h - (p.y + p.h));
  if (G.side === 'left') left = Math.max(left, G.tab.r.x + G.tab.r.w - G.x + 1);
  if (G.side === 'right') right = Math.max(right, G.x + G.w - G.tab.r.x + 1);
  const size = Array.isArray(ctx.size) ? ctx.size : [0, 0];
  const fills = G.x <= 1 && G.y <= 1 && G.x + G.w >= size[0] - 1 && G.y + G.h >= size[1] - 1;
  const slice = fills
    ? { left: left + G.x, top: top + G.y, right: right + size[0] - (G.x + G.w), bottom: bottom + size[1] - (G.y + G.h) }
    : { rect: { x: G.x, y: G.y, w: G.w, h: G.h }, left, top, right, bottom };
  const edge = { x: G.body.r.x + (G.body.r.w >> 1), y: G.body.r.y + (G.tube ? 2 : 1) };
  const area = (r) => (a.dim ? { ...r } : { ...r, edge: { ...edge } });
  return { slice, textArea: G.title ? [area(p), area(G.title)] : area(p) };
}
