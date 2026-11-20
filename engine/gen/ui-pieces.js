// Interface piece generators (docs/data-sprites.md 2.5b and 3.3, family "ui"; build item B13): a panel, a button, a bar
// (its housing or its fill strip), a slider's track, its knob, a highlighted row and the small "more" arrow, each a port
// of the code helpers in engine/ui.js (panel9, button, barHousing, barFill, highlight, triangle), engine/ui-wood.js
// (woodPanel, woodButton) and engine/ui-skins.js (the flat skin's skinBarHousing, skinBarFill, skinSlider, skinKnob)
// that RETURNS PRIMITIVES. The panel layout (engine/gen/ui.js) runs them with the skin's arguments put in place.
//
// HOW A PIECE IS CALLED. `at` and `size` are the rectangle it fills, its ink outline included (a sprite passes its frame
// minus the 1 px empty border: at [1, 1], size [w - 2, h - 2]); a knob and an arrow are placed by their centre `at`.
// `corner` (0 to 4 px) and `border` (1 to 3 px) are rounded here, so a table binding from a slider
// ({ "from": "corner", "map": [[0, 0], [1, 4]] }) gives what cornerPx and borderPx gave the code sprites. `style` is a
// skin's name for a look: the generator does not read it, the panel layout puts the skin's arguments for that word in
// place (`look`, `bevel`, `cut`, `texture`, `shape` ... are what the generator draws by). `state` (normal, hover, pressed,
// disabled), `lip` and `lift` come from the panel's state; greying a disabled piece is the layout's (`desaturate`).
// Paints are palette slots or colour rules: colours the code helpers worked out (a stained board, a darker trough)
// are colour rules of engine/data-rules.js (mix, tone, ramp), never a hex.
//
// MEASURES (UI_MEASURES, measurePiece). Where the slice and the text area of a piece are (Contract 8), worked out from
// the same numbers it draws with and in frame pixels; the panel layout writes them to the sheet:
//   ui.panel    textArea: panel9's flat `inner` with `edge` (a pixel of the frame band), or a chosen row's middle;
//               slice: 8 px each side when it fills the frame but its 1 px empty border (slice9()), else its `rect` and
//               7 px each side (slice9(rect))
//   ui.button   textArea: the flat middle (woodButton's or button's `text`) with `edge`; slice: how far that middle lies
//               from each side of the frame (the wood button's 8, 7, 8, 7; pressed 8, 9, 8, 5), or of its `rect`
//   ui.bar      slice: left and right at least 8 (the opening's reach + 1), top and bottom 4, and the `opening`
//   ui.slider   slice: 8 px each side (it stretches sideways); ui.knob its `rect` only; ui.highlight its middle as text
//   ui.arrow    nothing (it carries no text and does not stretch)
//
// Pure: no surface, no clock; variety only from engine/motion.js hash. Runs the same in the browser and in Node.
import { defineGenerator } from './registry.js';
import { point, count, share, px, word, flag, paint } from './args.js';
import { hash, wave } from '../motion.js';
import {
  UI_SLICE, UI_EDGE, UI_SHADOW, UI_STATES, UI_STYLES, roundRows, cutRows, spanAt, rowsArea, areaCount, spansArea, rectArea, marksToStamps, toneOf, mixOf, shadeOf,
} from './ui-shapes.js';
import { measureGridbox, measureGridbox2 } from './ui-grid.js';   // the Gridline kit's window, ui.gridbox@1: its measure is listed in UI_MEASURES below
import { measureGauge } from './ui-gauge.js';   // registers ui.gauge@1 (its own module) and gives its measure

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
import { measureCounter } from './counter.js';   // the Gridline kit's counter case, ui.counter@1: its measure (the digit windows as text areas) is listed in UI_MEASURES below
import { measureScreen } from './ui-screen.js';   // the Gridline kit's screens, ui.screen@1 (pause, results, game over, new best): its measure is listed in UI_MEASURES below
const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(fin(v) ? v : lo)));
const clamp01 = (v) => Math.max(0, Math.min(1, fin(v) ? v : 0));
const flat = (p) => ({ paint: p, shade: 0 });
const lit = (p) => ({ paint: p, shade: 1, light: 1 });
const boxOf = (a) => ({ x: Math.floor(a.at[0]), y: Math.floor(a.at[1]), w: Math.round(a.size[0]), h: Math.round(a.size[1]) });
/** Stamps marks over a w x h box can need, whatever its place (a cost bound that only grows with the size). */
const tilesFor = (size) => (Math.floor((Math.max(1, size[0]) - 1) / 32) + 2) * (Math.floor((Math.max(1, size[1]) - 1) / 32) + 2);

// ---- argument types every piece shares ------------------------------------------------------------------------

const atArg = () => point({ default: [0, 0], about: 'The top left corner of the rectangle it fills, in frame pixels' });
const sizeArg = (lo) => point({ lo, hi: 640, about: 'The width and height of the rectangle it fills, its ink outline included' });
const styleArg = () => word([...UI_STYLES], { default: 'plain', about: 'The skin\'s name for the look: the panel layout puts the skin\'s arguments for it in place' });
const cornerArg = () => px(0, 4, { default: 2, about: 'Corner size in pixels, 0 square to 4 round (rounded to a whole pixel)' });
const borderArg = () => px(1, 3, { default: 2, about: 'Width of the frame band in pixels, 1 to 3 (rounded)' });
const inkArg = () => paint({ default: 'ink', about: 'The outline' });
const stateArg = () => word([...UI_STATES], { default: 'normal', about: 'Its state: hover lightens it; the panel layout sets it from the clip' });

// ---- shapes ---------------------------------------------------------------------------------------------------

/** The rects a wooden board's band shadow (bandShadow) can take at most, whatever the size: its spans change only in the corners (a cost bound, checked over every corner, cut, border and state in tests/unit/gen-ui-pieces.test.mjs). */
const BAND_SHADOW_MAX = 16;
/** The rects a sunken wooden board's edge lines can take at most (two colours, the corners cut into them): a cost bound, checked as BAND_SHADOW_MAX is. */
const SUNKEN_MAX = 16;

/** The 4-neighbour erosion of a set of rows (one span each): the pixels one step deeper inside (engine/ui-skins.js depths). */
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
/** The rows of a pill (fully round ends) in x, y, w, h: engine/ui-skins.js pillIn's pixels. */
function pillRows(x, y, w, h) {
  if (!(w > 0 && h > 0)) return [];
  const r = h / 2, cy = y + r, out = [];
  const inside = (px, py) => {
    if (px < x + r) return (px - (x + r)) ** 2 + (py - cy) ** 2 <= r * r;
    if (px > x + w - r) return (px - (x + w - r)) ** 2 + (py - cy) ** 2 <= r * r;
    return true;
  };
  for (let iy = 0; iy < h; iy++) {
    const py = y + iy + 0.5;
    let a = -1, b = -1;
    for (let ix = 0; ix < w; ix++) if (inside(x + ix + 0.5, py)) { if (a < 0) a = ix; b = ix; }
    if (a >= 0) out.push([y + iy, x + a, x + b]);
  }
  return out;
}
/** The rings of a shape, outermost first: rings[d - 1] holds the pixels of depth d and deeper, up to `max`. */
function ringsOf(rows, max) {
  const out = [rows];
  for (let d = 1; d < max && out[d - 1].length; d++) out.push(erode(out[d - 1]));
  return out;
}
const inside = (rows, x, y) => { const s = spanAt(rows, y); return !!s && x >= s[0] && x <= s[1]; };
/** Whether a piece fills its frame but its empty border: the slice is then measured from the frame, else from its rect. */
const fills = (b, size) => Array.isArray(size) && b.x <= 1 && b.y <= 1 && b.x + b.w >= size[0] - 1 && b.y + b.h >= size[1] - 1;
/** A slice measured from the frame (a piece that fills it) or from the piece's own rectangle (`rect`). */
function sliceAround(b, size, inner, min = 0) {
  if (fills(b, size)) return { left: Math.max(min, inner.x), top: Math.max(min, inner.y), right: Math.max(min, size[0] - (inner.x + inner.w)), bottom: Math.max(min, size[1] - (inner.y + inner.h)) };
  return { rect: { x: b.x, y: b.y, w: b.w, h: b.h }, left: inner.x - b.x, top: inner.y - b.y, right: b.x + b.w - (inner.x + inner.w), bottom: b.y + b.h - (inner.y + inner.h) };
}

// ---- ui.panel: engine/ui.js panel9 --------------------------------------------------------------------------------

/** Everything panel9 works out without drawing: the box, band, corner, body, its flat inner and a chosen row. */
function panelGeom(a) {
  const { x, y, w, h } = boxOf(a);
  const look = a.look, b = clampI(a.border, 1, 3);
  const k = look === 'ornate' ? Math.min(2, Math.max(0, Math.round((fin(a.corner) ? a.corner : 0) / 2))) : clampI(a.corner, 0, 4);
  const sh = a.shadow ? UI_SHADOW : 0;
  const bx = x + sh, by = y, bw = w - sh, bh = h - sh;
  let inner;
  if (look === 'scroll') {
    const R = 5, trim = b - 1;
    inner = { x: bx + 3 + trim, y: by + R + 1, w: bw - 6 - 2 * trim, h: bh - 2 * R - 1 };
  } else {
    const i = 2 + b, f = { x: bx + i, y: by + i, w: bw - 2 * i, h: bh - 2 * i }, band = a.sunken ? 1 : 0;
    inner = { x: f.x, y: f.y + band, w: f.w - band, h: f.h - band };
    if (look === 'ornate') {
      const cut = Math.max(0, UI_EDGE - (2 + b));
      inner = { x: inner.x + cut, y: f.y + Math.max(band, cut), w: 0, h: 0 };
      inner.w = f.x + f.w - Math.max(band, cut) - inner.x;
      inner.h = f.y + f.h - cut - inner.y;
    }
  }
  let row = null;
  if (a.row) {
    const r = { x: inner.x + 1, y: inner.y + Math.round(a.rowAt), w: inner.w - 2, h: Math.round(a.rowHeight) };
    row = { box: r, inner: { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 } };
  }
  return { x, y, w, h, b, k, sh, bx, by, bw, bh, inner, row, look };
}

/** The highlight behind a chosen row (engine/ui.js highlight): an inked ring of `colour`, lit, round a flat `fill`; or a solid bar. */
function highlightPrims(r, k, colour, fill, ink, solid) {
  const out = [...rowsArea(roundRows(r.x, r.y, r.w, r.h, k), flat(ink))];
  if (!solid) {
    out.push(...rowsArea(roundRows(r.x + 1, r.y + 1, r.w - 2, r.h - 2, k - 1), lit(colour)));
    out.push(...rectArea(r.x + 3, r.y + 3, r.w - 6, r.h - 6, flat(fill)));
    return out;
  }
  const body = roundRows(r.x + 1, r.y + 1, r.w - 2, r.h - 2, Math.max(0, k - 1));
  out.push(...rowsArea(body, flat(colour)));
  const top = spanAt(body, r.y + 1), bottom = spanAt(body, r.y + r.h - 2);
  if (top) out.push(...rectArea(top[0], r.y + 1, top[1] - top[0] + 1, 1, flat(toneOf(colour, 'light'))));
  if (bottom && r.h - 2 > 1) out.push(...rectArea(bottom[0], r.y + r.h - 2, bottom[1] - bottom[0] + 1, 1, flat(toneOf(colour, 'dark'))));
  return out;
}

/** One roll of a scroll (engine/ui.js roll): an inked rod across the width with a knob of the accent at each end. */
function rollPrims(x, y, w, R, k, frame, accent, ink) {
  const kk = Math.min(k, (R - 1) >> 1);
  const out = [...rowsArea(roundRows(x, y, w, R, kk), flat(ink))];
  const body = roundRows(x + 1, y + 1, w - 2, R - 2, Math.max(0, kk - 1));
  const tones = ['light', 'base', 'dark'];
  for (let r = 0; r < R - 2; r++) {
    const s = spanAt(body, y + 1 + r);
    if (!s) continue;
    out.push(...rectArea(s[0], y + 1 + r, s[1] - s[0] + 1, 1, flat(toneOf(frame, tones[Math.min(2, r)]))));
    for (const kx of [x + 1, x + w - 4]) {
      const a = Math.max(kx, s[0]), b = Math.min(kx + 2, s[1]);
      if (a <= b) out.push(...rectArea(a, y + 1 + r, b - a + 1, 1, flat(toneOf(accent, tones[Math.min(2, r)]))));
    }
  }
  out.push(...rectArea(x + 4, y + 1, 1, R - 2, flat(ink)), ...rectArea(x + w - 5, y + 1, 1, R - 2, flat(ink)));
  return out;
}

/**
 * ui.panel@1: a stretchable panel (a dialogue box, a menu, a name tag) filling its rectangle, port of engine/ui.js
 * panel9: plain (the bevel: ink, the frame band lit along the top and right, ink, the sunken face), ornate (a stud of the
 * accent in each corner, corners round 2 px at most), scroll (a sheet between two 5 px rolls); an optional 2 px drop
 * shadow down and to the left; an optional chosen row (the highlight of a menu choice) whose middle is then its text area.
 */
export const uiPanel = defineGenerator({
  id: 'ui.panel', v: 1, family: 'ui',
  about: 'A stretchable panel filling a rectangle: plain, ornate or a scroll, with an optional drop shadow and chosen row.',
  args: {
    at: atArg(), size: sizeArg(4), style: styleArg(),
    look: word(['plain', 'ornate', 'scroll'], { default: 'plain', about: 'plain (the bevel), ornate (studs in the corners) or scroll (a sheet between two rolls)' }),
    corner: cornerArg(), border: borderArg(),
    shadow: flag({ default: false, about: 'A 2 px drop shadow down and to the left; the body shrinks to make room' }),
    sunken: flag({ default: true, about: 'A 1 px shadow under the top and right of the frame on the face' }),
    row: flag({ default: false, about: 'A chosen row across the top of the face (a menu choice); its middle is the text area' }),
    rowAt: px(0, 64, { default: 2, about: 'How far below the top of the face the chosen row starts' }),
    rowHeight: px(7, 64, { default: 14, about: 'The chosen row\'s height' }),
    rowShade: px(-3, 0, { default: -0.6, about: 'How much darker than the face the chosen row\'s middle is' }),
    face: paint({ default: 'face', about: 'The flat middle' }),
    frame: paint({ default: 'frame', about: 'The frame band (the rolls of a scroll)' }),
    accent: paint({ default: 'frame', about: 'The studs, the scroll\'s knobs and the chosen row\'s ring' }),
    ink: inkArg(),
  },
  cost: () => 64,
  run(a) {
    const G = panelGeom(a);
    const { b, k, sh, bx, by, bw, bh } = G;
    if (bw < 3 || bh < 3) return [];
    const out = [];
    if (G.look === 'scroll') {
      const R = 5, trim = b - 1;
      if (sh) {
        out.push(...rectArea(bx + 2 - sh, by + R - 1 + sh, bw - 4, bh - 2 * R + 2, flat(a.ink)));
        out.push(...rowsArea(roundRows(bx - sh, by + sh, bw, R, Math.min(k, 2)), flat(a.ink)), ...rowsArea(roundRows(bx - sh, by + bh - R + sh, bw, R, Math.min(k, 2)), flat(a.ink)));
      }
      out.push(...rectArea(bx + 2, by + R - 1, bw - 4, bh - 2 * R + 2, flat(a.ink)));
      out.push(...rectArea(bx + 3, by + R, bw - 6, bh - 2 * R, flat(a.face)));
      if (trim) {
        out.push(...rectArea(bx + 3, by + R, trim, bh - 2 * R, flat(toneOf(a.frame, 'dark'))));
        out.push(...rectArea(bx + bw - 3 - trim, by + R, trim, bh - 2 * R, flat(a.frame)));
      }
      out.push(...rectArea(bx + 3, by + R, bw - 6, 1, flat(shadeOf(a.face, -1))));
      out.push(...rollPrims(bx, by, bw, R, k, a.frame, a.accent, a.ink), ...rollPrims(bx, by + bh - R, bw, R, k, a.frame, a.accent, a.ink));
    } else {
      if (sh) out.push(...rowsArea(roundRows(bx - sh, by + sh, bw, bh, k), flat(a.ink)));
      out.push(...rowsArea(roundRows(bx, by, bw, bh, k), flat(a.ink)));
      out.push(...rowsArea(roundRows(bx + 1, by + 1, bw - 2, bh - 2, k - 1), b >= 2 ? lit(a.frame) : flat(a.frame)));
      out.push(...rowsArea(roundRows(bx + 1 + b, by + 1 + b, bw - 2 - 2 * b, bh - 2 - 2 * b, Math.min(1, k - 1 - b)), flat(a.ink)));
      const i = 2 + b, f = { x: bx + i, y: by + i, w: bw - 2 * i, h: bh - 2 * i };
      out.push(...rectArea(f.x, f.y, f.w, f.h, flat(a.face)));
      if (a.sunken && f.w > 0 && f.h > 0) out.push(...rectArea(f.x, f.y, f.w, 1, flat(toneOf(a.face, 'dark'))), ...rectArea(f.x + f.w - 1, f.y, 1, f.h, flat(toneOf(a.face, 'dark'))));
      if (G.look === 'ornate') {
        const within = roundRows(bx + 1, by + 1, bw - 2, bh - 2, Math.max(0, k - 1));
        const marks = new Map();
        for (const [cx, cy, dx, dy] of [[bx, by, 1, 1], [bx + bw - 1, by, -1, 1], [bx, by + bh - 1, 1, -1], [bx + bw - 1, by + bh - 1, -1, -1]]) {
          for (let j = 1; j <= 4; j++) for (let i2 = 1; i2 <= 4; i2++) {
            const px2 = cx + dx * i2, py2 = cy + dy * j;
            if (!inside(within, px2, py2)) continue;
            const u = dx > 0 ? i2 : 4 - i2, v = dy > 0 ? j : 4 - j;
            marks.set(`${px2},${py2}`, i2 === 4 || j === 4 ? 'i' : u === 3 && v === 1 ? 'l' : u === 1 || v === 3 ? 'd' : 'a');
          }
        }
        out.push(...marksToStamps(marks, { i: a.ink, l: toneOf(a.accent, 'light'), d: toneOf(a.accent, 'dark'), a: a.accent }));
      }
    }
    if (G.row) out.push(...highlightPrims(G.row.box, Math.min(2, clampI(a.corner, 0, 4)), a.accent, shadeOf(a.face, a.rowShade), a.ink, false));
    return out;
  },
});

function measurePanel(a, ctx) {
  const G = panelGeom(a);
  const b = { x: G.x, y: G.y, w: G.w, h: G.h };
  const slice = fills(b, ctx.size) ? { left: UI_SLICE, top: UI_SLICE, right: UI_SLICE, bottom: UI_SLICE } : { rect: { ...b }, left: UI_SLICE - 1, top: UI_SLICE - 1, right: UI_SLICE - 1, bottom: UI_SLICE - 1 };
  const textArea = G.row ? { ...G.row.inner } : { ...G.inner, edge: { x: G.x + (G.w >> 1), y: G.by + (G.look === 'scroll' ? 2 : G.b) } };
  return { slice, textArea };
}

// ---- ui.button: engine/ui.js button and engine/ui-wood.js woodButton -----------------------------------------------

/** What a button works out before drawing: its box, band, corner, travel, where the body stands and its flat middle. */
function buttonGeom(a) {
  const { x, y, w, h } = boxOf(a);
  const b = clampI(a.border, 1, 2), k = clampI(a.corner, 0, 4);
  const T = clampI(a.travel, 0, 4), L = Math.min(T, clampI(a.lip, 0, 4)), lift = Math.round(fin(a.lift) ? a.lift : 0);
  const bh = h - T, by = Math.max(y, Math.min(y + T, y + (T - L) - lift));
  let text;
  if (a.bevel === 'wood') {
    const m = UI_SLICE - 1, top = Math.max(2 + b, 6), bottom = Math.max(2 + b, 4);
    text = { x: x + m, y: by + top, w: w - 2 * m, h: bh - top - bottom };
  } else {
    const i = 2 + b, gl = a.glint && a.state !== 'disabled' && a.state !== 'pressed' ? 1 : 0;
    text = { x: x + i, y: by + i + gl, w: w - 2 * i, h: bh - 2 * i - gl };
  }
  return { x, y, w, h, b, k, T, L, bh, by, text };
}

/** The rows of a wood board's outline, d pixels in (its depth d + 1): round corners k - d, or corners cut k + 1 - d. */
const woodRows = (cut, x, y, w, h, k, d) => (cut === 'cut' ? cutRows(x + d, y + d, w - 2 * d, h - 2 * d, k + 1 - d) : roundRows(x + d, y + d, w - 2 * d, h - 2 * d, k - d));

/**
 * The pixels of a wooden board's frame band (depth 3 to 1 + b) on its shadow side, as spans per row: those whose pixel
 * down and to the left lies less deep (engine/ui-wood.js woodPanel's bandDark). Arguments: rings (ringsOf the outline), b.
 */
function bandShadow(rings, b) {
  const maps = rings.map((r) => new Map(r.map((row) => [row[0], row])));
  const depthAt = (px2, py2) => {
    let d = 0;
    for (const m of maps) { const s = m.get(py2); if (!s || px2 < s[1] || px2 > s[2]) break; d++; }
    return d;
  };
  const spans = [];
  for (const [py2, x0, x1] of rings[2] ?? []) {
    const deep = maps[1 + b]?.get(py2);
    let start = -1;
    for (let px2 = x0; px2 <= x1 + 1; px2++) {
      const inBand = px2 <= x1 && !(deep && px2 >= deep[1] && px2 <= deep[2]);
      const dark = inBand && depthAt(px2 - 1, py2 + 1) < depthAt(px2, py2);
      if (dark && start < 0) start = px2;
      if (!dark && start >= 0) { spans.push([py2, start, px2 - 1]); start = -1; }
    }
  }
  return spans;
}

/** The wooden board of engine/ui-wood.js woodPanel (the button's body): rings by depth, marks between them and the flat middle, nails. */
function woodBoard(a, G, by) {
  const { x, w, bh, b, k } = G;
  const hover = a.state === 'hover';
  // darker wood is the same wood with less light on it: mixed toward the ink, which keeps it brown (the engine's
  // shadow tones turn a brown red). Stone greys that stain toward the `stone` slot darkened the same way: the grey of
  // the stained face (woodTones' mix(text, desaturate(text), 0.75)) when the slot holds a grey that, mixed toward the
  // ink, is that grey (the wood skin's #737868 for its default face; no colour rule takes the colour out of a colour)
  const amount0 = hover ? Math.max(0, a.stain - 0.2) : a.stain;
  const stained = mixOf(a.face, a.ink, amount0);
  const stain = a.greyed > 0 ? mixOf(stained, mixOf(a.stone, a.ink, amount0), a.greyed) : stained;
  const grain = mixOf(stain, a.ink, 0.4), light = mixOf(stain, toneOf(a.face, 'light'), 0.4);
  const edge = mixOf(toneOf(a.frame, 'light'), a.shine, hover ? 0.6 : 0.35);
  const band = hover ? a.frame : mixOf(a.frame, a.ink, 0.3);
  const rings = ringsOf(woodRows(a.cut, x, by, w, bh, k, 0), 3 + b);
  const ring = (d) => rings[d] ?? [];
  const out = [...rowsArea(ring(0), flat(a.ink)), ...rowsArea(ring(1), flat(edge))];
  if (b >= 2) {
    // the frame band, flat, darker (mix(frame, ink, 0.5), woodTones' bandDark) where the pixel down and to the left is
    // less deep: its lower left, the shadow side of the carving
    out.push(...rowsArea(ring(2), flat(band)));
    out.push(...spansArea(bandShadow(rings, b), flat(mixOf(a.frame, a.ink, 0.5))));
  }
  out.push(...rowsArea(ring(1 + b), flat(a.ink)));
  const stainRows = ring(2 + b);
  out.push(...rowsArea(stainRows, flat(stain)));
  // marks: only on the stained board, never in the flat middle
  const m = UI_SLICE - 1, F = { x: x + 2 + b, y: by + 2 + b, w: w - 2 * (2 + b), h: bh - 2 * (2 + b) };
  const top = Math.max(2 + b, 6), bottom = Math.max(2 + b, 4);
  const inner = { x: x + m, y: by + top, w: w - 2 * m, h: bh - top - bottom };
  const marks = new Map(), taken = new Set();
  const free = (px2, py2) => !(px2 >= inner.x && px2 < inner.x + inner.w && py2 >= inner.y && py2 < inner.y + inner.h)
    && inside(stainRows, px2, py2) && !taken.has(`${px2},${py2}`) && !marks.has(`${px2},${py2}`);
  const mark = (px2, py2, c) => { if (free(px2, py2)) marks.set(`${px2},${py2}`, c); };
  const rowsTop = [], rowsBottom = [];
  for (let py2 = F.y; py2 < inner.y; py2++) rowsTop.push(py2);
  for (let py2 = F.y + F.h - 1; py2 >= inner.y + inner.h; py2--) rowsBottom.push(py2);
  const amount = clamp01(a.grain);
  const usedOf = (rows) => (amount <= 0 ? 0 : Math.min(rows.length, 1 + Math.floor(amount * rows.length)));
  if (a.sunken) {
    // the sunken board's edge: lines along the frame, so rects (as stamps a tall board's edge would pass the stamp cap)
    const edges = { g: [], l: [] };
    const line = (px2, py2, c) => { if (free(px2, py2)) { taken.add(`${px2},${py2}`); edges[c].push([py2, px2, px2]); } };
    for (let px2 = F.x; px2 < F.x + F.w; px2++) { line(px2, F.y, 'g'); line(px2, F.y + F.h - 1, 'l'); }
    for (let py2 = F.y + 1; py2 < F.y + F.h - 1; py2++) { line(F.x, py2, 'l'); line(F.x + F.w - 1, py2, 'g'); }
    out.push(...spansArea(edges.g, flat(grain)), ...spansArea(edges.l, flat(light)));
  }
  if (a.texture === 'chisel') {
    const cut = (rows) => rows.slice(1, 1 + usedOf(rows.slice(1))).forEach((py2, r) => {
      for (let px2 = F.x + 2 + (r % 2) * 2; px2 < F.x + F.w - 2; px2 += 4) { mark(px2, py2, 'g'); if (amount > 0.6) mark(px2 + 1, py2, 'g'); }
    });
    cut(rowsTop); cut(rowsBottom);
  } else if (a.texture === 'specks') {
    const rows = [...rowsTop, ...rowsBottom], n = rows.length ? Math.round(amount * 22) : 0;
    for (let i = 0; i < n; i++) {
      const py2 = rows[Math.floor(hash(i, 31) * rows.length)], px2 = F.x + 1 + Math.floor(hash(i, 32) * (F.w - 3));
      const c = i % 3 === 0 ? 'l' : 'g';
      mark(px2, py2, c); if (hash(i, 33) > 0.45) mark(px2 + 1, py2, c);
    }
  } else if (a.texture === 'grain') {
    const lines = (rows, seed) => rows.slice(0, usedOf(rows)).forEach((py2, r) => {
      let px2 = F.x + 1 + Math.floor(hash(r, seed + 1) * 4);
      for (let i = 0; px2 < F.x + F.w - 1 && i < 640; i++) {
        const dash = 3 + Math.floor(hash(i, seed + r * 7 + 2) * 8), gap = 2 + Math.floor(hash(i, seed + r * 7 + 3) * 5);
        if (hash(i, seed + r * 7 + 4) < 0.35 + 0.65 * amount) for (let j = 0; j < dash && px2 + j < F.x + F.w - 1; j++) mark(px2 + j, py2, r % 2 ? 'g' : 'l');
        px2 += dash + gap;
      }
    });
    lines(rowsTop, 40); lines(rowsBottom, 80);
  }
  out.push(...marksToStamps(marks, { g: grain, l: light }));
  if (a.nails) {
    // a 3x3 nail head in each corner of the board, lit from the top right; never in the flat middle
    const deep = ring(1 + b), nx = Math.min(F.x, x + m - 3), ny = Math.min(F.y, by + m - 3);
    const nails = new Map();
    for (const [cx, cy] of [[nx, ny], [x + w - nx + x - 3, ny], [nx, by + bh - ny + by - 3], [x + w - nx + x - 3, by + bh - ny + by - 3]]) {
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        if (!inside(deep, cx + i, cy + j)) continue;
        nails.set(`${cx + i},${cy + j}`, i === 0 && j === 2 ? 'i' : i + (2 - j) >= 3 ? 'n' : 'm');
      }
    }
    out.push(...marksToStamps(nails, { i: a.ink, n: toneOf(a.nail, 'light'), m: a.nail }));
  }
  return out;
}

/**
 * ui.button@1: a button in one of its states filling its rectangle, its body standing on a lip `travel` px tall:
 * `lip` px of it show under the body (2 at rest, 0 pressed: the body then sits `travel` px lower) and `lift` raises the
 * body within its box. bevel `lit` is engine/ui.js button (ink, the frame band, ink, a flat face; hover a lighter face,
 * `glint` a light line along its top); bevel `wood` is engine/ui-wood.js woodButton (a pale carved edge, the band, a face
 * stained toward the ink, grain, chisel marks or specks kept out of the flat middle, nails in the corners, corners round
 * or cut). Port of both; its flat middle is the text area.
 */
export const uiButton = defineGenerator({
  id: 'ui.button', v: 1, family: 'ui',
  about: 'A button in one of its states, standing on a lip it is pressed down onto: a lit bevel or a wooden board.',
  args: {
    at: atArg(), size: sizeArg(8), style: styleArg(), state: stateArg(),
    bevel: word(['lit', 'wood'], { default: 'lit', about: 'lit (engine/ui.js button) or wood (a carved board, engine/ui-wood.js)' }),
    cut: word(['round', 'cut'], { default: 'round', about: 'Its corners: round, or cut at 45 degrees (one pixel deeper)' }),
    texture: word(['none', 'grain', 'chisel', 'specks'], { default: 'none', about: 'Marks on a wooden board, kept out of the flat middle' }),
    sunken: flag({ default: false, about: 'A wooden board sunk into its frame: shadow under the top and right, light along the left and bottom' }),
    grain: share({ default: 0.5, about: 'How much texture, plain to busy' }),
    stain: share({ default: 0.4, about: 'How far a wooden face is stained toward the ink (white text needs 0.4)' }),
    greyed: share({ default: 0, about: 'How far a wooden board\'s stain is greyed toward the stone paint (a stone slab: 0.75)' }),
    nails: flag({ default: false, about: 'A 3x3 nail head in each corner of a wooden board' }),
    glint: flag({ default: false, about: 'A 1 px light line along the top of a lit face' }),
    corner: cornerArg(), border: px(1, 3, { default: 2, about: 'Width of the frame band, 1 or 2 px (a button keeps an 18 px text area; 3 is drawn as 2)' }),
    travel: px(0, 4, { default: 2, about: 'How tall the lip is: how far the body goes down when pressed' }),
    lip: px(0, 4, { default: 2, about: 'How much of the lip shows under the body: 2 at rest, 0 pressed (the panel\'s state sets it)' }),
    lift: px(-4, 4, { default: 0, about: 'Raises the body, within its box' }),
    face: paint({ default: 'face', about: 'The face' }),
    frame: paint({ default: 'frame', about: 'The frame band and the lip' }),
    nail: paint({ default: 'frame', about: 'The nail heads' }),
    shine: paint({ default: 'frame', about: 'A light slot (white) the wooden board\'s carved edge is lifted toward' }),
    stone: paint({ default: 'frame', about: 'A grey slot a wooden board\'s stain is greyed toward by `greyed`, darkened toward the ink as the stain is' }),
    ink: inkArg(),
  },
  cost: (a) => 24 + BAND_SHADOW_MAX + SUNKEN_MAX + 2 * tilesFor(a.size),
  run(a) {
    const G = buttonGeom(a);
    const { x, y, w, h, b, k, T, L, bh, by } = G;
    if (w < 3 || bh < 3 || h < 3) return [];
    const out = [];
    const wood = a.bevel === 'wood';
    const lipC = wood ? mixOf(a.frame, a.ink, 0.55) : toneOf(a.frame, 'deep');
    const shapeOf = (yy, d) => (wood ? (d ? erode(woodRows(a.cut, x, yy, w, bh, k, 0)) : woodRows(a.cut, x, yy, w, bh, k, 0)) : roundRows(x + d, yy + d, w - 2 * d, bh - 2 * d, k - d));
    if (L > 0) out.push(...rowsArea(shapeOf(y + T, 0), flat(a.ink)), ...rowsArea(shapeOf(y + T, 1), flat(lipC)));
    if (wood) out.push(...woodBoard(a, G, by));
    else {
      const face = a.state === 'hover' ? shadeOf(a.face, 0.85) : a.face;
      out.push(...rowsArea(roundRows(x, by, w, bh, k), flat(a.ink)));
      out.push(...rowsArea(roundRows(x + 1, by + 1, w - 2, bh - 2, k - 1), b >= 2 ? lit(a.frame) : flat(a.frame)));
      out.push(...rowsArea(roundRows(x + 1 + b, by + 1 + b, w - 2 - 2 * b, bh - 2 - 2 * b, Math.min(1, k - 1 - b)), flat(a.ink)));
      const i = 2 + b;
      out.push(...rectArea(x + i, by + i, w - 2 * i, bh - 2 * i, flat(face)));
      if (a.glint && a.state !== 'disabled' && a.state !== 'pressed') out.push(...rectArea(x + i, by + i, w - 2 * i, 1, flat(shadeOf(face, 0.85))));
    }
    if (L > 0 && by === y) {
      // the body's own bottom line joins the lip, so the lip shows as colour all the way along
      const s = spanAt(shapeOf(y + T, 1), y + bh);
      if (s) { const a0 = Math.max(x + 1, s[0]), a1 = Math.min(x + w - 2, s[1]); out.push(...rectArea(a0, y + bh - 1, a1 - a0 + 1, 1, flat(lipC))); }
    }
    return out;
  },
});

function measureButton(a, ctx) {
  const G = buttonGeom(a);
  return { slice: sliceAround(G, ctx.size, G.text), textArea: { ...G.text, edge: { x: G.x + (G.w >> 1), y: G.by + 1 } } };
}

// ---- ui.bar: engine/ui.js barHousing / barFill and the flat skin's skinBarHousing / skinBarFill ----------------------

/** The opening of a bar housing in its box: the trough its fill strip fits exactly (barOpening, skinBarOpening). */
function barGeom(a) {
  const { x, y, w, h } = boxOf(a);
  const b = clampI(a.border, 1, 3), caps = Math.max(0, Math.round(fin(a.caps) ? a.caps : 0)), i = 2 + b;
  return { x, y, w, h, b, caps, o: { x: x + i + caps, y: y + i, w: w - 2 * (i + caps), h: h - 2 * i } };
}

/**
 * ui.bar@1: a bar's empty housing (layer `housing`: the band round a dark trough, optional notches every 8 px) or its
 * fill strip (layer `fill`: cropped to `value`, never outside the opening, turning toward `shine` by `flash`; with
 * `fade` the flash dies away over a clip that does not loop, or pulses over one that does). bevel `flat` is the flat
 * skin's (engine/ui-skins.js), `lit` engine/ui.js barHousing and barFill. The housing and the strip share one opening.
 */
export const uiBar = defineGenerator({
  id: 'ui.bar', v: 1, family: 'ui',
  about: 'A bar\'s empty housing round a trough, or its fill strip cropped to a value: flat or lit, round or pill ends.',
  args: {
    at: atArg(), size: sizeArg(4), style: styleArg(),
    layer: word(['housing', 'fill'], { default: 'housing', about: 'The empty housing, or the fill strip that lies in its opening' }),
    bevel: word(['flat', 'lit'], { default: 'flat', about: 'flat (an unlit band) or lit (a band lit along the top and right)' }),
    shape: word(['round', 'pill'], { default: 'round', about: 'Its ends: round corners, or fully round (a pill)' }),
    corner: cornerArg(), border: borderArg(),
    caps: px(0, 8, { default: 0, about: 'Pixels of solid band at each end of the opening' }),
    notches: flag({ default: false, about: 'A 1 px notch across the band every 8 px' }),
    value: share({ default: 1, about: 'How full the strip is (a game crops a full strip itself)' }),
    flash: share({ default: 0, about: 'How far the strip has turned toward the shine' }),
    fade: flag({ default: false, about: 'The flash dies away over the clip (pulses when the clip loops)' }),
    frame: paint({ default: 'frame', about: 'The band' }),
    back: paint({ default: 'face', about: 'The colour the flat trough is darkened from' }),
    fill: paint({ default: 'fill', about: 'The strip' }),
    shine: paint({ default: 'frame', about: 'A light slot (white) the strip flashes toward' }),
    ink: inkArg(),
  },
  // 4 rects, the outline and the band (rowsArea: a tall pill takes a polygon per RUNS_PER_POLY rows), 2 notches every 8 px
  cost: (a) => 10 + 2 * areaCount(a.size[1]) + 2 * Math.ceil(Math.max(0, a.size[0]) / 8),
  run(a, ctx) {
    const { x, y, w, h, b, o } = barGeom(a);
    if (w < 3 || h < 3) return [];
    const out = [];
    if (a.layer === 'fill') {
      const n = Math.round(o.w * clamp01(a.value));
      if (n <= 0 || o.h <= 0) return [];
      const t = fin(ctx?.t) ? ctx.t : 0;
      const amount = clamp01(a.flash) * (a.fade ? (ctx?.loop ? 0.5 + 0.5 * Math.cos(2 * Math.PI * t) : 1 - clamp01(t)) : 1);
      const lift = (p) => (amount > 0 ? mixOf(p, a.shine, amount) : p);
      const darkRow = a.bevel === 'lit' && o.h >= 3;
      out.push(...rectArea(o.x, o.y, n, o.h - (darkRow ? 1 : 0), flat(lift(a.fill))));
      if (darkRow) out.push(...rectArea(o.x, o.y + o.h - 1, n, 1, flat(lift(toneOf(a.fill, 'dark')))));
      return out;
    }
    const k = a.shape === 'pill' ? 0 : a.bevel === 'flat' ? Math.min(clampI(a.corner, 0, 4), (h - 1) >> 1) : clampI(a.corner, 0, 4);
    const outer = a.shape === 'pill' ? pillRows(x, y, w, h) : roundRows(x, y, w, h, k);
    out.push(...rowsArea(outer, flat(a.ink)));
    const band = a.shape === 'pill' || a.bevel === 'flat' ? erode(outer) : roundRows(x + 1, y + 1, w - 2, h - 2, k - 1);
    out.push(...rowsArea(band, a.bevel === 'lit' && b >= 2 ? lit(a.frame) : flat(a.frame)));
    out.push(...rectArea(o.x - 1, o.y - 1, o.w + 2, o.h + 2, flat(a.ink)));
    const trough = a.bevel === 'lit' ? mixOf(a.ink, a.frame, 0.2) : mixOf(a.back, a.ink, 0.55);
    out.push(...rectArea(o.x, o.y, o.w, o.h, flat(trough)));
    out.push(...rectArea(o.x, o.y, o.w, 1, flat(shadeOf(trough, -1))));
    if (a.bevel === 'lit') out.push(...rectArea(o.x + o.w - 1, o.y, 1, o.h, flat(shadeOf(trough, -1))));
    if (a.notches) {
      for (let px2 = x + 8; px2 < x + w - 8; px2 += 8) {
        for (const [y0, y1] of [[y + 1, o.y - 2], [o.y + o.h + 1, y + h - 2]]) {
          let s = -1;
          for (let py2 = y0; py2 <= y1 + 1; py2++) {
            const on = py2 <= y1 && inside(band, px2, py2);
            if (on && s < 0) s = py2;
            if (!on && s >= 0) { out.push(...rectArea(px2, s, 1, py2 - s, flat(a.ink))); s = -1; }
          }
        }
      }
    }
    return out;
  },
});

function measureBar(a, ctx) {
  const { x, y, w, h, o } = barGeom(a);
  const b = { x, y, w, h };
  if (fills(b, ctx.size)) return { slice: { left: Math.max(UI_SLICE, o.x + 1), top: 4, right: Math.max(UI_SLICE, ctx.size[0] - (o.x + o.w) + 1), bottom: 4, opening: { ...o } } };
  return { slice: { rect: { ...b }, left: Math.max(UI_SLICE - 1, o.x - x + 1), top: 3, right: Math.max(UI_SLICE - 1, x + w - (o.x + o.w) + 1), bottom: 3, opening: { ...o } } };
}

// ---- ui.slider and ui.knob: the flat skin's skinSlider and skinKnob -------------------------------------------------

/** Where a slider's rail lies in its box: 4 to 6 px tall, centred (skinSlider). */
function railOf(a) {
  const { x, y, w, h } = boxOf(a);
  const rh = Math.max(4, Math.min(6, Math.round(h * 0.4)));
  return { box: { x, y, w, h }, rail: { x, y: y + ((h - rh) >> 1), w, h: rh } };
}

/**
 * ui.slider@1: a slider's track across its box, port of the flat skin's skinSlider: a rail 4 to 6 px tall (ink, the
 * band, a dark trough), round corners or pill ends, an optional ink notch every 8 px. It stretches sideways.
 */
export const uiSlider = defineGenerator({
  id: 'ui.slider', v: 1, family: 'ui',
  about: 'A slider\'s track: a rail 4 to 6 px tall centred in its box, its band round a dark trough, with optional notches.',
  args: {
    at: atArg(), size: sizeArg(4), style: styleArg(),
    shape: word(['round', 'pill'], { default: 'round', about: 'Its ends: round corners (2 px at most), or fully round' }),
    corner: cornerArg(),
    notches: flag({ default: false, about: 'An ink notch on the rail every 8 px' }),
    frame: paint({ default: 'frame', about: 'The band' }),
    back: paint({ default: 'face', about: 'The colour the trough is darkened from' }),
    ink: inkArg(),
  },
  cost: (a) => 4 + Math.ceil(Math.max(0, a.size[0]) / 8),
  run(a) {
    const { rail: r } = railOf(a);
    if (r.w < 3) return [];
    const outer = a.shape === 'pill' ? pillRows(r.x, r.y, r.w, r.h) : roundRows(r.x, r.y, r.w, r.h, Math.min(clampI(a.corner, 0, 4), 2));
    const [, band, trough] = ringsOf(outer, 3);
    const out = [...rowsArea(outer, flat(a.ink)), ...rowsArea(band ?? [], flat(a.frame)), ...rowsArea(trough ?? [], flat(mixOf(a.back, a.ink, 0.55)))];
    if (a.notches) for (let px2 = r.x + 8; px2 < r.x + r.w - 8; px2 += 8) out.push({ kind: 'rect', at: [px2, r.y + 1], size: [1, 1], paint: a.ink, shade: 0 });
    return out;
  },
});

function measureSlider(a, ctx) {
  const { box } = railOf(a);
  return { slice: fills(box, ctx.size) ? { left: UI_SLICE, top: UI_SLICE, right: UI_SLICE, bottom: UI_SLICE } : { rect: { ...box }, left: UI_SLICE - 1, top: 0, right: UI_SLICE - 1, bottom: 0 } };
}

/** A knob's rectangle round its centre: `size` px across (10 to 14) and 2 px taller (skinKnob). */
function knobOf(a) {
  const w = clampI(a.size, 10, 14), h = w + 2;
  return { x: Math.floor(a.at[0]) - (w >> 1), y: Math.floor(a.at[1]) - (h >> 1), w, h };
}

/** ui.knob@1: a slider's knob, port of the flat skin's skinKnob: a slab `size` px across and 2 px taller round its centre (ink, the band, the face; `outlined` sets the band 1 px in). */
export const uiKnob = defineGenerator({
  id: 'ui.knob', v: 1, family: 'ui',
  about: 'A slider\'s knob: a small slab round a centre, its band round a flat face.',
  args: {
    at: point({ about: 'The knob\'s centre' }), style: styleArg(),
    size: count(10, 14, { default: 12, about: 'Its width in pixels; it is 2 px taller' }),
    shape: word(['round', 'pill'], { default: 'round', about: 'Round corners (2 px at most), or the pill look (4 px corners)' }),
    outlined: flag({ default: false, about: 'The band set 1 px in from the ink' }),
    corner: cornerArg(),
    face: paint({ default: 'face', about: 'The knob\'s body' }),
    frame: paint({ default: 'frame', about: 'Its edge' }),
    ink: inkArg(),
  },
  cost: () => 4,
  run(a) {
    const { x, y, w, h } = knobOf(a);
    const out = a.outlined ? 1 : 0;
    const rings = ringsOf(a.shape === 'pill' ? roundRows(x, y, w, h, 4) : roundRows(x, y, w, h, Math.min(2, clampI(a.corner, 0, 4))), 3 + out);
    const list = [...rowsArea(rings[0], flat(a.ink))];
    for (let d = 2; d <= rings.length; d++) {
      const paintD = d === 2 && out ? a.face : d <= 2 + out ? a.frame : a.face;
      list.push(...rowsArea(rings[d - 1], flat(paintD)));
    }
    return list;
  },
});

const measureKnob = (a) => ({ slice: { rect: knobOf(a) } });

// ---- ui.highlight and ui.arrow: engine/ui.js highlight and triangle ---------------------------------------------

/** ui.highlight@1: the highlight behind a chosen row (a menu command, a dialogue choice), port of engine/ui.js highlight: an inked ring of `paint`, lit, round a flat middle darker than the face; or a solid bar. */
export const uiHighlight = defineGenerator({
  id: 'ui.highlight', v: 1, family: 'ui',
  about: 'The highlight behind a chosen row: a lit ring round a dark flat middle, or a solid bar.',
  args: {
    at: atArg(), size: sizeArg(5), style: styleArg(),
    inside: word(['fill', 'solid'], { default: 'fill', about: 'fill (a ring round a flat middle darker than the face) or solid (a bar of the colour)' }),
    corner: px(0, 4, { default: 2, about: 'Corner size, 2 px at most' }),
    darken: px(-3, 0, { default: -0.6, about: 'How much darker than the face the middle is' }),
    paint: paint({ default: 'accent', about: 'The ring or bar' }),
    face: paint({ default: 'face', about: 'The panel face the middle is a darker tone of' }),
    ink: inkArg(),
  },
  cost: () => 6,
  run(a) {
    const r = boxOf(a);
    if (r.w < 3 || r.h < 3) return [];
    return highlightPrims(r, Math.min(2, clampI(a.corner, 0, 4)), a.paint, shadeOf(a.face, a.darken), a.ink, a.inside === 'solid');
  },
});

function measureHighlight(a, ctx) {
  const r = boxOf(a), d = a.inside === 'solid' ? 2 : 3;
  const inner = { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
  return { slice: { rect: { ...r }, left: 4, top: 4, right: 4, bottom: 4 }, textArea: inner };
}

/** The rows of a crisp arrow head (engine/ui.js triangle): rows size, size - 2, ... 1 px, pointing `dir`, centred on (cx, cy). */
function arrowRows(cx, cy, size, dir) {
  const n = (size + 1) >> 1, half = (size - 1) >> 1, out = [];
  if (dir === 'down' || dir === 'up') {
    const top = cy - ((n - 1) >> 1);
    for (let iy = top; iy < top + n; iy++) {
      const along = dir === 'down' ? iy - top : top + n - 1 - iy, reach = half - along;
      if (reach >= 0) out.push([iy, cx - reach, cx + reach]);
    }
    return out;
  }
  const left = cx - ((n - 1) >> 1);
  for (let iy = cy - half; iy <= cy + half; iy++) {
    const reach = half - Math.abs(iy - cy);
    out.push(dir === 'right' ? [iy, left, left + reach] : [iy, left + n - 1 - reach, left + n - 1]);
  }
  return out;
}

/** ui.arrow@1: the small arrow head of a "more text" sign, port of engine/ui.js triangle: shaded, inked round itself, bobbing `bob` px along where it points once a loop. */
export const uiArrow = defineGenerator({
  id: 'ui.arrow', v: 1, family: 'ui',
  about: 'A crisp arrow head, shaded and inked, that bobs where it points once a loop.',
  args: {
    at: point({ about: 'Its centre pixel' }), style: styleArg(),
    size: count(3, 15, { default: 9, about: 'Its widest row, in pixels (odd sizes are crisp)' }),
    dir: word(['down', 'up', 'left', 'right'], { default: 'down', about: 'Where it points' }),
    bob: px(0, 4, { default: 0, about: 'How far it bobs along where it points, once a loop' }),
    outline: flag({ default: true, about: 'Ink round it' }),
    paint: paint({ default: 'accent', about: 'The arrow' }),
    ink: inkArg(),
  },
  cost: () => 2,
  run(a, ctx) {
    const drop = Math.round((a.bob / 2) * (1 + wave(fin(ctx?.t) ? ctx.t : 0)));
    const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[a.dir];
    const rows = arrowRows(Math.floor(a.at[0]) + d[0] * drop, Math.floor(a.at[1]) + d[1] * drop, a.size, a.dir);
    const out = rowsArea(rows, { paint: a.paint, shade: 1, group: 'ui-arrow' });
    if (a.outline) out.push({ kind: 'outline', paint: a.ink, only: 'ui-arrow' });
    return out;
  },
});

// ---- measures ---------------------------------------------------------------------------------------------------

/** The interface pieces of this module, "<id>@<v>" each (all family "ui"). */
export const UI_PIECES = Object.freeze(['ui.panel@1', 'ui.button@1', 'ui.bar@1', 'ui.slider@1', 'ui.knob@1', 'ui.highlight@1', 'ui.arrow@1']);

/** Where each piece's slice and text area are, "<id>@<v>" -> (args with defaults, ctx) -> { slice?, textArea? } in frame pixels (Contract 8). */
export const UI_MEASURES = Object.freeze({
  'ui.panel@1': measurePanel, 'ui.button@1': measureButton, 'ui.bar@1': measureBar, 'ui.slider@1': measureSlider,
  'ui.knob@1': measureKnob, 'ui.highlight@1': measureHighlight, 'ui.arrow@1': () => ({}),
  'ui.gridbox@1': measureGridbox,   // engine/gen/ui-grid.js
  'ui.gauge@1': measureGauge,           // engine/gen/ui-gauge.js: the standing gauge of the Gridline kit
  'ui.counter@1': measureCounter,   // engine/gen/counter.js
  'ui.screen@1': measureScreen,   // engine/gen/ui-screen.js
  'ui.gridbox@2': measureGridbox2,   // engine/gen/ui-grid.js: the window with the kit's own tube and corners
});

/**
 * The slice and text area of one piece call: { slice?, textArea? } in frame pixels, its missing arguments taken from
 * the generator's defaults; {} for a generator with no measure. Arguments: entry (the registry's entry), args (resolved,
 * no bindings), ctx ({ size, ... }: the frame).
 */
export function measurePiece(entry, args, ctx = {}) {
  const fn = entry ? UI_MEASURES[`${entry.id}@${entry.v}`] : null;
  if (typeof fn !== 'function') return {};
  const full = {};
  for (const [k, t] of Object.entries(entry.args ?? {})) full[k] = args && Object.hasOwn(args, k) ? args[k] : t.default;
  return fn(full, { size: Array.isArray(ctx.size) ? ctx.size : [0, 0], ...ctx });
}
