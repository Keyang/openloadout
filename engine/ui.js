// Interface helper: nine-slice panels, button states, bars, highlight rows, arrow heads and
// digits (docs/style-guide.md sections 8 and 14). Pure drawing on a Surface: runs in Node
// and in the browser. Every piece draws its own INK outline, so a sprite made only
// of these does not call g.outline().
//
//   import { panel9, button, barHousing, barOpening, barFill, highlight, triangle, slice9 } from '../engine/ui.js';
//
//   // a 96x48 dialogue box: pass the frame minus its 1 px empty border
//   const box = panel9(g, 1, 1, 94, 46, { face: p.face, frame: p.frame, border: p.border, corner: p.corner });
//   triangle(g, box.inner.x + box.inner.w - 6, box.inner.y + box.inner.h - 4, 7, 'down', p.accent);   // "more text"
//
//   // a 96x32 button, one clip per state; write the label inside `text`
//   const { text } = button(g, 1, 1, 94, 30, clip, { face: p.face, frame: p.frame, border: p.border, corner: p.corner, shine: p.shine });
//
//   // a 64x16 bar: the housing clip and the fill clip share one opening
//   const opening = barHousing(g, 1, 1, 62, 14, { frame: p.frame, border: p.border, corner: p.corner });
//   barFill(g, opening, 0.6, { fill: p.fill, shine: p.shine });              // 60% full; a `fill` clip passes 1
//
// THE BEVEL (the same on panels, buttons and bars), from the outside in:
//   1 px INK  ·  the frame band, 1 to 3 px (`border`), lit along the top and right, dark along the
//   bottom and left  ·  1 px INK  ·  the face. A panel's face is sunken: a 1 px shadow under the top
//   and right of the frame. A button's face is flat, so text sits on one colour.
//
// STRETCHING. Everything that is not flat lies within EDGE (5) px of the panel's left and bottom
// edges and EDGE + 1 of its top and right (the face's shadow under the frame). With the 1 px empty
// border of a frame and the 2 px drop shadow (which falls left and down), that is the 8 px
// nine-slice border of the style guide (SLICE): cut 8 px off each side of the frame, keep the
// corners, repeat the edges along their length and the middle both ways.
//
// TELLING THE GAME (docs/architecture.md, Contract 8). A sprite declares `slice`, one entry per
// stretchable clip, and the exported sheet JSON then carries, on that clip and on each of its frames:
//   border   { left, bottom, right, top }   Unity's order, in sheet pixels: how far the corners reach in
//            from each side of `rect` (or of the frame when there is no rect)
//   rect     { x, y, w, h }                 where the piece sits in its frame, when it does not fill it
//   opening  { x, y, w, h }                 the trough of a bar housing, and where its fill strips lie
//   tile     { x, w }                       instead of a border, for a middle that repeats a pattern (a
//            segmented bar): columns x .. x + w - 1 are one repeat; insert whole copies to lengthen
// In defineSprite:
//   slice: {
//     box: slice9(),                                         // a panel that fills its frame: 8 px each side
//     'name-tag': slice9({ x: 20, y: 14, w: 56, h: 20 }),    // a piece drawn in its own rectangle: rect + 7 px
//     frame: (p) => ({ left: 16, top: 8, right: 16, bottom: 8, opening: barOpening(1, 1, 62, 14, p) }),   // may follow the settings
//   },
// A cursor exports its hot spot as a `tip` socket: sockets: (clip, t, p) => ({ tip: { x, y, angle } }).
//
// CONTRAST (style guide, section 8). White text must keep 4.5 to 1 on a text face, and a frame 3 to 1
// against its face, under every whole-bundle look. Do not pick face and frame swatches by eye:
//   const SW = panelSwatches('hearthvale', { face: 'panel', frame: 'cream' });
//   face: color('Face', SW.face[0], SW.face),  frame: color('Frame', SW.frame[0], SW.frame),
// The two defaults are kept as given; every other swatch is kept only if it holds both rules under
// every look, a near miss comes back as a darker (face) or lighter (frame) tone of itself, and the
// rest are dropped. SW.failing names any rule the defaults themselves break (it should be empty).
//
// DIGITS. digitSize(size, style) gives the three sizes every digit set uses; digitBody(n, size) the
// strokes of a digit; rimmed(g, body, x, y, { colour, edge, shadow }) draws any small glyph as body,
// rim, ink (and inks its holes). Every digit differs from every other by more than 2 body pixels.
//
// `corner` and `border` are the 0..1 values of the sprite's sliders (Square / Round, Thin / Thick).
// Pass `cornerPx` (0 to 4) or `borderPx` (1 to 3) instead to give pixels directly.

import { Surface } from './surface.js';
import { ramp, tone, mix, brightness, rgbToHex, hexToRgb, col, INK } from './color.js';
import { THEME_PRESETS, normalizeTheme, applyColour } from './theme.js';
import { PALETTE, paletteName, swatches } from './palettes.js';

/** The nine-slice border, in pixels from the frame edge: corners and borders end inside it. */
export const SLICE = 8;
/** Everything that is not flat lies within this many pixels of a panel's left and bottom edges (one more at the top and right). */
export const EDGE = 5;
/** The drop shadow's offset: down and to the left, because light comes from the top right. */
export const SHADOW = 2;
/** The bottom bevel of a raised button: how far the face travels when pressed. */
export const LIP = 2;
export const BUTTON_STATES = ['normal', 'hover', 'pressed', 'disabled'];
export const PANEL_STYLES = ['plain', 'ornate', 'scroll'];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Slider value (Square 0 .. Round 1) to corner size in pixels, 0 to 4. */
export const cornerPx = (corner = 0.5) => Math.round(clamp01(corner) * 4);
/** Slider value (Thin 0 .. Thick 1) to the frame band's width in pixels, 1 to 3. */
export const borderPx = (border = 0.5) => 1 + Math.round(clamp01(border) * 2);

// Pixels cut from each row of a corner, outermost row first: the quarter circles pixel artists use.
const CUTS = [[], [1], [2, 1], [3, 1, 1], [4, 2, 1, 1]];

/**
 * Shape test for a rectangle with pixel-art round corners (use with g.fill or g.blob).
 * k is the corner size in pixels, 0 (square) to 4; it is reduced to fit small rectangles.
 */
export function roundRectIn(x, y, w, h, k = 0) {
  const cuts = CUTS[Math.max(0, Math.min(k, 4, Math.floor((Math.min(w, h) - 1) / 2)))];   // one row and one column always reach the sides
  return (px, py) => {
    const ix = Math.floor(px - x), iy = Math.floor(py - y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
    const dx = Math.min(ix, w - 1 - ix), dy = Math.min(iy, h - 1 - iy);
    return !(dy < cuts.length && dx < cuts[dy]);
  };
}

const paintRR = (g, x, y, w, h, k, paint, opt) => (w > 0 && h > 0 ? g.fill(x, y, x + w, y + h, roundRectIn(x, y, w, h, Math.max(0, k)), paint, opt) : g);

/**
 * A `slice` entry for a sprite (see the top of this file).
 * slice9()      a panel that fills its frame (drawn at 1, 1, W - 2, H - 2): SLICE px on every side.
 * slice9(rect)  a panel drawn in its own rectangle inside a bigger frame: that rectangle as `rect`,
 *               and SLICE - 1 px on every side of it (there is no empty border inside a rect).
 */
export function slice9(rect) {
  if (!rect) return { left: SLICE, top: SLICE, right: SLICE, bottom: SLICE };
  const m = SLICE - 1;
  return { rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, left: m, top: m, right: m, bottom: m };
}

/** The WCAG contrast ratio of two colours, 1 (the same) to 21 (black on white). Text needs 4.5; a frame against its face 3. */
export function contrast(a, b) {
  const lum = (hex) => { const [r, g, bl] = hexToRgb(hex).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The same colour with no colour in it (a disabled button). */
export function desaturate(hex) {
  const v = Math.round(brightness(hex) * 255);
  return rgbToHex(v, v, v);
}

// The bevel: ink, frame band, ink, face. `sunken` puts a 1 px shadow under the top and right of the frame.
function slab(g, x, y, w, h, k, b, face, frame, ink, sunken) {
  paintRR(g, x, y, w, h, k, ink);
  if (b >= 2) paintRR(g, x + 1, y + 1, w - 2, h - 2, k - 1, ramp(frame), { shade: 1, light: 1 });
  else paintRR(g, x + 1, y + 1, w - 2, h - 2, k - 1, frame);
  // the face is always square, so its flat area is a plain rectangle; the ink line around it rounds by 1 px at most
  paintRR(g, x + 1 + b, y + 1 + b, w - 2 - 2 * b, h - 2 - 2 * b, Math.min(1, k - 1 - b), ink);
  const i = 2 + b;
  if (sunken) {
    const keep = g.shadow;
    g.shadow = [1, -1];
    g.rect(x + i, y + i, w - 2 * i, h - 2 * i, ramp(face), { shade: 1 });
    g.shadow = keep;
  } else g.rect(x + i, y + i, w - 2 * i, h - 2 * i, face);
  return { x: x + i, y: y + i, w: w - 2 * i, h: h - 2 * i };
}

// Rows of a rod seen from the side, top to bottom, for 1, 2 or 3 px of thickness.
const rodRows = (colour, n) => { const r = ramp(colour); return n <= 1 ? [r.base] : n === 2 ? [r.light, r.base] : [r.light, r.base, r.dark]; };

// One roll of a scroll: an inked rod across the full width with a knob of the accent colour at each end.
function roll(g, x, y, w, R, k, frame, accent, ink) {
  const kk = Math.min(k, (R - 1) >> 1);
  paintRR(g, x, y, w, R, kk, ink);
  const body = roundRectIn(x + 1, y + 1, w - 2, R - 2, Math.max(0, kk - 1));
  const rows = rodRows(frame, R - 2), knob = rodRows(accent, R - 2);
  for (let r = 0; r < R - 2; r++) {
    g.fill(x + 1, y + 1 + r, x + w - 1, y + 2 + r, (px, py) => body(px, py) && py > y + 1 + r && py < y + 2 + r, rows[r]);
    for (const kx of [x + 1, x + w - 4]) g.fill(kx, y + 1 + r, kx + 3, y + 2 + r, (px, py) => body(px, py) && px > kx && px < kx + 3 && py > y + 1 + r && py < y + 2 + r, knob[r]);
  }
  g.rect(x + 4, y + 1, 1, R - 2, ink);
  g.rect(x + w - 5, y + 1, 1, R - 2, ink);
}

/**
 * A stretchable panel, drawn to fill exactly the rectangle (x, y, w, h), its ink outline and
 * its drop shadow included. In a sprite, pass the frame minus the 1 px empty border.
 *
 * opt.face     colour of the flat middle
 * opt.frame    colour of the border band (the rolls of a scroll)
 * opt.border   0..1, Thin to Thick (1 to 3 px)         opt.corner  0..1, Square to Round (0 to 4 px)
 * opt.style    'plain' | 'ornate' (a stud of opt.accent in each corner; corners round by 2 px at most, so the
 *              studs stay whole) | 'scroll' (a sheet between two 5 px rolls; `border` adds trim down its sides)
 * opt.accent   colour of the studs and of the scroll's knobs (default: the frame colour)
 * opt.shadow   true: a 2 px drop shadow, down and to the left; the body shrinks to make room
 * opt.sunken   false for a flat face with no shadow under the frame (default true)
 *
 * Returns { body, inner, slice }: `body` is the panel without its shadow; `inner` is the flat,
 * clear middle (one colour: put text and rows here); `slice` is how far the corners and borders
 * reach in from each side of the rectangle given (add the frame's empty border: at most SLICE).
 */
export function panel9(g, x, y, w, h, opt = {}) {
  const { face, frame, accent = frame, style = 'plain', ink = INK, sunken = true } = opt;
  if (!PANEL_STYLES.includes(style)) throw new Error(`panel9: style "${style}" is not one of ${PANEL_STYLES.join(', ')}`);
  if (!face || !frame) throw new Error('panel9: needs a face and a frame colour');
  const b = Math.max(1, Math.min(3, opt.borderPx ?? borderPx(opt.border)));
  // an ornate panel rounds half as far (0 to 2 px): a rounder corner would cut its studs to chips
  const k = style === 'ornate' ? Math.min(2, opt.cornerPx ?? Math.round(clamp01(opt.corner ?? 0.5) * 2)) : opt.cornerPx ?? cornerPx(opt.corner);
  const sh = opt.shadow ? SHADOW : 0;
  const bx = x + sh, by = y, bw = w - sh, bh = h - sh;
  const s = new Surface(g.w, g.h);
  let inner;

  if (style === 'scroll') {
    // each roll is 5 px, ink included: all that fits above a drop shadow inside the 8 px border
    const R = 5;
    s.rect(bx + 2, by + R - 1, bw - 4, bh - 2 * R + 2, ink);   // the sheet, 2 px narrower than the rolls on each side
    s.rect(bx + 3, by + R, bw - 6, bh - 2 * R, face);
    const trim = b - 1;                                        // the border: 0 to 2 px of the frame colour down each side of the sheet
    if (trim) {
      const r = ramp(frame);
      s.rect(bx + 3, by + R, trim, bh - 2 * R, r.dark);
      s.rect(bx + bw - 3 - trim, by + R, trim, bh - 2 * R, r.base);
    }
    s.rect(bx + 3, by + R, bw - 6, 1, tone(face, -1));         // the top roll's shadow on the sheet
    roll(s, bx, by, bw, R, k, frame, accent, ink);
    roll(s, bx, by + bh - R, bw, R, k, frame, accent, ink);
    inner = { x: bx + 3 + trim, y: by + R + 1, w: bw - 6 - 2 * trim, h: bh - 2 * R - 1 };
  } else {
    const f = slab(s, bx, by, bw, bh, k, b, face, frame, ink, sunken);
    const band = sunken ? 1 : 0;
    inner = { x: f.x, y: f.y + band, w: f.w - band, h: f.h - band };
    if (style === 'ornate') {
      // a 3x3 stud in each corner, inked on its two inner sides; it follows a round corner
      const within = roundRectIn(bx + 1, by + 1, bw - 2, bh - 2, Math.max(0, k - 1));
      const st = ramp(accent);
      for (const [cx, cy, dx, dy] of [[bx, by, 1, 1], [bx + bw - 1, by, -1, 1], [bx, by + bh - 1, 1, -1], [bx + bw - 1, by + bh - 1, -1, -1]]) {
        for (let j = 1; j <= 4; j++) for (let i = 1; i <= 4; i++) {
          const px = cx + dx * i, py = cy + dy * j;
          if (!within(px + 0.5, py + 0.5)) continue;
          // light towards the top right, dark towards the bottom left
          const u = dx > 0 ? i : 4 - i, v = dy > 0 ? j : 4 - j;      // 1..3 from the left, 1..3 from the top
          s.dot(px, py, i === 4 || j === 4 ? ink : u === 3 && v === 1 ? st.light : u === 1 || v === 3 ? st.dark : st.base);
        }
      }
      const cut = Math.max(0, EDGE - (2 + b));
      inner = { x: inner.x + cut, y: f.y + Math.max(band, cut), w: 0, h: 0 };
      inner.w = f.x + f.w - Math.max(band, cut) - inner.x;
      inner.h = f.y + f.h - cut - inner.y;
    }
  }

  // the drop shadow: the body's own silhouette in ink, 2 px down and to the left, under the body
  if (sh) for (let py = 0; py < s.h; py++) for (let px = 0; px < s.w; px++) if (s.data[py * s.w + px]) g.dot(px - sh, py + sh, ink);
  g.blit(s);
  return {
    body: { x: bx, y: by, w: bw, h: bh },
    inner,
    slice: { left: inner.x - x, top: inner.y - y, right: x + w - (inner.x + inner.w), bottom: y + h - (inner.y + inner.h) },
  };
}

/** Clip entries for a button sprite: one frame per state, in the style guide's order. */
export function buttonClips() {
  return Object.fromEntries(BUTTON_STATES.map((s) => [s, { frames: 1, fps: 8, loop: true }]));
}

/**
 * A button in one of its four states, in the rectangle (x, y, w, h) (a 96x32 frame: 1, 1, 94, 30).
 *   normal    a raised slab: the bevelled body standing on a lip, 2 px (LIP) of a darker tone of the frame
 *   hover     the same with the face one tone lighter
 *   pressed   the body 2 px lower, down onto the lip: the bottom edge stays where it was
 *   disabled  no saturation, no shine
 * opt: face, frame, border, corner (as panel9; a button's band is 1 or 2 px so the text area stays
 * 18 px tall), shine (a 1 px light line along the top of the face).
 * Returns { text, body }: `text` is the flat area for the label, one colour in every state; it
 * covers the middle 78x18 of a 96x32 frame, and moves down 2 px when pressed.
 */
export function button(g, x, y, w, h, state = 'normal', opt = {}) {
  if (!BUTTON_STATES.includes(state)) throw new Error(`button: state "${state}" is not one of ${BUTTON_STATES.join(', ')}`);
  if (!opt.face || !opt.frame) throw new Error('button: needs a face and a frame colour');
  const ink = opt.ink ?? INK;
  const k = opt.cornerPx ?? cornerPx(opt.corner), b = Math.min(2, opt.borderPx ?? borderPx(opt.border));
  const off = state === 'disabled';
  const frame = off ? desaturate(opt.frame) : opt.frame;
  let face = off ? desaturate(opt.face) : opt.face;
  if (state === 'hover') face = tone(face, 0.85);
  const pressed = state === 'pressed';
  const by = pressed ? y + LIP : y, bh = h - LIP;
  const lip = off ? desaturate(ramp(opt.frame).deep) : ramp(frame).deep;
  if (!pressed) {
    // the lip: the slab's side, showing under the body and in its cut bottom corners
    paintRR(g, x, y + LIP, w, bh, k, ink);
    paintRR(g, x + 1, y + LIP + 1, w - 2, bh - 2, k - 1, lip);
  }
  const f = slab(g, x, by, w, bh, k, b, face, frame, ink, false);
  if (!pressed) {
    // the body's own bottom line joins the lip, so the lip is 2 px of colour and the travel is still 2 px
    const row = y + bh - 1, lipC = g.get(x + (w >> 1), row + 1);
    for (let px = x + 1; px < x + w - 1; px++) if (g.get(px, row + 1) === lipC) g.dot(px, row, lip);
  }
  const shine = !!opt.shine && !off && !pressed;
  if (shine) g.rect(f.x, f.y, f.w, 1, tone(face, 0.85));
  return { text: { x: f.x, y: f.y + (shine ? 1 : 0), w: f.w, h: f.h - (shine ? 1 : 0) }, body: { x, y: by, w, h: bh } };
}

/**
 * The opening of a bar housing drawn in (x, y, w, h): the trough the fill strip fits exactly.
 * opt: border, corner (as panel9), caps (px of solid frame at each end, for ornate ends; default 0).
 */
export function barOpening(x, y, w, h, opt = {}) {
  const b = Math.max(1, Math.min(3, opt.borderPx ?? borderPx(opt.border)));
  const i = 2 + b, caps = Math.max(0, opt.caps ?? 0);
  return { x: x + i + caps, y: y + i, w: w - 2 * (i + caps), h: h - 2 * i };
}

// Columns left empty between the segments of a strip `w` px long.
function gapColumns(w, segments) {
  const out = new Set();
  for (let i = 1; i < segments; i++) out.add(Math.round((i * (w + 1)) / segments) - 1);
  return out;
}

/**
 * The empty housing of a bar (a 64x16 frame: 1, 1, 62, 14): the bevel around a dark trough.
 * opt: frame, border, corner, caps (see barOpening), back (the trough colour; default a dark tone
 * made from the frame colour), segments (draw this many compartments; pass the same to barFill).
 * Returns the opening { x, y, w, h }.
 */
export function barHousing(g, x, y, w, h, opt = {}) {
  if (!opt.frame) throw new Error('barHousing: needs a frame colour');
  const ink = opt.ink ?? INK;
  const k = opt.cornerPx ?? cornerPx(opt.corner), b = Math.max(1, Math.min(3, opt.borderPx ?? borderPx(opt.border)));
  const back = opt.back ?? mix(ink, opt.frame, 0.2);
  const o = barOpening(x, y, w, h, opt);
  paintRR(g, x, y, w, h, k, ink);
  if (b >= 2) paintRR(g, x + 1, y + 1, w - 2, h - 2, k - 1, ramp(opt.frame), { shade: 1, light: 1 });
  else paintRR(g, x + 1, y + 1, w - 2, h - 2, k - 1, opt.frame);
  g.rect(o.x - 1, o.y - 1, o.w + 2, o.h + 2, ink);
  const keep = g.shadow;
  g.shadow = [1, -1];
  g.rect(o.x, o.y, o.w, o.h, { base: back, dark: tone(back, -1), light: back }, { shade: 1 });
  g.shadow = keep;
  if (opt.segments > 1) for (const gx of gapColumns(o.w, opt.segments)) g.rect(o.x + gx, o.y, 1, o.h, ink);
  return o;
}

/**
 * The fill strip of a bar, cropped to `value` (0 empty .. 1 full), inside `opening` (from
 * barHousing or barOpening). It never draws outside the opening. A `fill` clip passes 1 and
 * lets the game crop the strip.
 * opt: fill (colour), shine (a light line and a glint along the top), segments (thin gaps so the
 * housing's compartments show), flash (0..1: how far the strip has turned white).
 */
export function barFill(g, opening, value, opt = {}) {
  if (!opt.fill) throw new Error('barFill: needs a fill colour');
  const o = opening;
  const n = Math.round(o.w * clamp01(value));
  if (n <= 0 || o.h <= 0) return g;
  const flash = clamp01(opt.flash ?? 0);
  const lit = (c) => (flash ? mix(c, '#ffffff', flash) : c);
  const r = ramp(opt.fill);
  const gaps = opt.segments > 1 ? gapColumns(o.w, opt.segments) : null;
  for (let i = 0; i < n; i++) {
    if (gaps && gaps.has(i)) continue;
    for (let j = 0; j < o.h; j++) {
      let c = r.base;
      if (o.h >= 3 && j === o.h - 1) c = r.dark;
      else if (opt.shine && j === 0) c = i >= 2 && i <= 4 ? '#ffffff' : r.light;
      g.dot(o.x + i, o.y + j, lit(c));
    }
  }
  return g;
}

/**
 * The highlight behind a chosen row (a menu command, a dialogue choice).
 * With opt.fill: an inked 2 px ring of opt.colour, lit along the top and right, round a flat text
 * area of the fill colour. Give a dark fill (a darker tone of the panel face) and white text keeps
 * its contrast whatever the accent colour is. Without opt.fill: a solid bar of opt.colour.
 * opt: colour, fill, corner (0..1; at most 2 px).
 * Returns { inner }: the flat text area. Stretchable: everything else is within 4 px of its edge.
 */
export function highlight(g, x, y, w, h, opt = {}) {
  if (!opt.colour) throw new Error('highlight: needs a colour');
  const ink = opt.ink ?? INK, r = ramp(opt.colour);
  const k = Math.min(2, opt.cornerPx ?? cornerPx(opt.corner));
  paintRR(g, x, y, w, h, k, ink);
  if (opt.fill) {
    paintRR(g, x + 1, y + 1, w - 2, h - 2, k - 1, r, { shade: 1, light: 1 });
    g.rect(x + 3, y + 3, w - 6, h - 6, opt.fill);
    return { inner: { x: x + 3, y: y + 3, w: w - 6, h: h - 6 } };
  }
  const body = roundRectIn(x + 1, y + 1, w - 2, h - 2, Math.max(0, k - 1));
  g.fill(x + 1, y + 1, x + w - 1, y + h - 1, body, r.base);
  g.fill(x + 1, y + 1, x + w - 1, y + 2, (px, py) => body(px, py) && py < y + 2, r.light);
  g.fill(x + 1, y + h - 2, x + w - 1, y + h - 1, (px, py) => body(px, py) && py > y + h - 2, r.dark);
  return { inner: { x: x + 2, y: y + 2, w: w - 4, h: h - 4 } };
}

/**
 * A crisp arrow head: rows `size`, size - 2, ... 1 px long (size is odd), centred on pixel (cx, cy).
 * dir: 'down' | 'up' | 'left' | 'right' is where it points. paint: a colour or a ramp.
 * It has no outline: call g.outline(INK) after it, or draw it on its own Surface.
 */
export function triangle(g, cx, cy, size, dir, paint, opt) {
  const n = (size + 1) >> 1, half = (size - 1) >> 1, top = cy - ((n - 1) >> 1), left = cx - ((n - 1) >> 1);
  const inside = (px, py) => {
    const ix = Math.floor(px), iy = Math.floor(py);
    const along = dir === 'down' ? iy - top : dir === 'up' ? top + n - 1 - iy : dir === 'right' ? ix - left : left + n - 1 - ix;
    const across = Math.abs(dir === 'down' || dir === 'up' ? ix - cx : iy - cy);
    return along >= 0 && along < n && across <= half - along;
  };
  return g.fill(cx - size, cy - size, cx + size, cy + size, inside, paint, opt);
}

// ---- digits and other small rimmed glyphs ------------------------------------------

/** A small grid of on/off cells: { w, h, at(x, y), set(x, y, v), box(x0, y0, x1, y1) }. The body of a glyph. */
export function glyphGrid(w, h) {
  const cells = new Uint8Array(w * h);
  return {
    w, h,
    at: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? cells[y * w + x] : 0),
    set(x, y, v = 1) { if (x >= 0 && y >= 0 && x < w && y < h) cells[y * w + x] = v ? 1 : 0; },
    box(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y); },
  };
}

/**
 * Body sizes [width, height] for the three steps of a Size slider, per style. With a 1 px rim and
 * a 1 px ink line a 6x9 body is the 10 px wide digit of the specifications; nothing is taller than
 * 9, so a 1 px drop shadow still fits the 14x14 of a 16x16 glyph frame.
 */
export const DIGIT_SIZES = { chunky: [[6, 7], [6, 9], [7, 9]], rounded: [[6, 7], [6, 9], [7, 9]], slim: [[4, 9], [5, 9], [6, 9]] };

/**
 * The digit size for a slider value 0..1 and a style ('chunky' | 'slim' | 'rounded'):
 * { w, h, stroke, bar, round }. stroke: the width of the upright strokes; bar: the height of the
 * top and bottom bars (1 px on the 7 px digit, so both counters keep two rows).
 */
export function digitSize(size = 0.5, style = 'chunky') {
  const list = DIGIT_SIZES[style];
  if (!list) throw new Error(`digitSize: style "${style}" is not one of ${Object.keys(DIGIT_SIZES).join(', ')}`);
  const [w, h] = list[Math.min(list.length - 1, Math.floor(clamp01(size) * list.length))];
  const stroke = style === 'slim' ? 1 : 2;
  return { w, h, stroke, bar: h < 9 ? 1 : stroke, round: style === 'rounded' };
}

const MID = 'mid';
// Strokes in box units: x 0 (left) .. 1 (right), y 0 (top) .. 1 (bottom), or MID for the middle bar.
const DIGIT_STROKES = [
  [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  [[[0.2, 0], [0.5, 0], [0.5, 1]], [[0, 1], [1, 1]]],
  [[[0, 0], [1, 0], [1, MID], [0, MID], [0, 1], [1, 1]]],
  [[[0, 0], [1, 0], [1, 1], [0, 1]], [[0.4, MID], [1, MID]]],
  [[[0, 0], [0, MID], [1, MID]], [[1, 0], [1, 1]]],
  [[[1, 0], [0, 0], [0, MID], [1, MID], [1, 1], [0, 1]]],
  [[[1, 0], [0, 0], [0, 1], [1, 1], [1, MID], [0, MID]]],
  [[[0, 0], [1, 0], [1, 1]]],
  [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], [[0, MID], [1, MID]]],
  [[[1, MID], [0, MID], [0, 0], [1, 0], [1, 1], [0, 1]]],
];
// Digits with a waist: the outer pixel is taken off these sides at the middle bar, so an 8 is two
// bowls and not a 0 with a line through it (that line alone is only 2 px of difference).
const WAIST = { 3: ['right'], 8: ['left', 'right'] };

/**
 * The body of digit n (0 to 9) as a glyphGrid, for a size from digitSize(). The middle bar is
 * always 1 px, which keeps both counters at least two rows tall. size.round takes the outside
 * pixel off every right-angle turn (never off a stroke's end).
 */
export function digitBody(n, size) {
  const paths = DIGIT_STROKES[n];
  if (!paths) throw new Error(`digitBody: ${n} is not a digit (0 to 9)`);
  const { w, h, stroke: sw, bar, round } = size;
  const b = glyphGrid(w, h);
  const midRow = Math.floor((h - 1) / 2);
  const left = (u) => Math.round(u * (w - sw)), right = (u) => left(u) + sw - 1;
  const top = (v) => (v === MID ? midRow : v === 0 ? 0 : h - bar), bottom = (v) => (v === MID ? midRow : v === 0 ? bar - 1 : h - 1);
  for (const path of paths) for (let i = 0; i + 1 < path.length; i++) {
    const [au, av] = path[i], [bu, bv] = path[i + 1];
    if (av === bv) b.box(Math.min(left(au), left(bu)), top(av), Math.max(right(au), right(bu)), bottom(av));
    else b.box(left(au), Math.min(top(av), top(bv)), right(au), Math.max(bottom(av), bottom(bv)));
  }
  for (const side of WAIST[n] ?? []) b.set(side === 'left' ? 0 : w - 1, midRow, 0);
  if (round && sw >= 2) for (const path of paths) {
    const len = path.length, closed = len > 2 && path[0][0] === path[len - 1][0] && path[0][1] === path[len - 1][1];
    const num = (v) => (v === MID ? 0.5 : v);
    for (let i = closed ? 0 : 1; i < len - 1; i++) {
      const a = path[i === 0 ? len - 2 : i - 1], v = path[i], c = path[i + 1];
      if (v[1] === MID) continue;                               // the middle bar is 1 px: nothing to round there
      const d1 = [Math.sign(v[0] - a[0]), Math.sign(num(v[1]) - num(a[1]))], d2 = [Math.sign(c[0] - v[0]), Math.sign(num(c[1]) - num(v[1]))];
      if (d1[0] * d2[0] + d1[1] * d2[1] !== 0) continue;
      b.set(d1[0] - d2[0] > 0 ? right(v[0]) : left(v[0]), d1[1] - d2[1] > 0 ? bottom(v[1]) : top(v[1]), 0);
    }
  }
  return b;
}

/**
 * Draw a small glyph the way damage numbers are drawn: the BODY (a glyphGrid, its top left at
 * x, y) in opt.colour; a 1 px RIM of opt.edge all round it, darker below and to the left (away
 * from the light); a 1 px INK line; holes the outside cannot reach filled with ink (a pale
 * stroke across a dark hole reads at 1x); and with opt.shadow a 1 px drop shadow down and to
 * the left. opt.lean moves the rows above the middle 1 px right (leaning digits).
 * It needs 2 px of room on every side of the body (3 on the left and below with a shadow).
 */
export function rimmed(g, body, x, y, opt = {}) {
  if (!opt.colour || !opt.edge) throw new Error('rimmed: needs a colour and an edge colour');
  const ink = opt.ink ?? INK, W = g.w, H = g.h;
  const s = new Surface(W, H);
  const half = Math.floor(body.h / 2);
  for (let j = 0; j < body.h; j++) for (let i = 0; i < body.w; i++) if (body.at(i, j)) s.dot(x + i + (opt.lean && j < half ? 1 : 0), y + j, opt.colour);
  const solid = Uint8Array.from(s.data, (v) => (v ? 1 : 0));
  const was = (px, py) => px >= 0 && py >= 0 && px < W && py < H && solid[py * W + px] === 1;
  // what the outside can reach, walking side to side and up and down from a corner of the frame
  const outside = new Uint8Array(W * H), todo = [0];
  outside[0] = 1;
  while (todo.length) {
    const i = todo.pop(), px = i % W, py = (i - px) / W;
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || outside[ny * W + nx] || solid[ny * W + nx]) continue;
      outside[ny * W + nx] = 1; todo.push(ny * W + nx);
    }
  }
  for (let i = 0; i < W * H; i++) if (!solid[i] && !outside[i]) s.dot(i % W, (i - (i % W)) / W, ink);
  s.outline(opt.edge, { corners: true });
  const dark = tone(opt.edge, -1);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (!outside[py * W + px] || !s.get(px, py)) continue;
    if (!(was(px - 1, py) || was(px, py + 1) || was(px - 1, py + 1))) s.dot(px, py, dark);
  }
  s.outline(ink);
  if (opt.shadow) for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) if (s.get(px, py)) g.dot(px - 1, py + 1, ink);
  g.blit(s);
  return g;
}

// ---- sci-fi (tech) pieces: cut corners, a thin lit edge, scan lines (batch S20) ------------
// The partner of the bevel above for station and space interfaces. THE TECH BEVEL, from the outside in:
//   1 px INK  ·  the band, 1 to 3 px (`border`): its outer pixel is the LIT EDGE, the light tone of the
//   frame colour all the way round, the rest is the frame colour, darker along the bottom and left
//   ·  1 px INK  ·  the face, flat. Corners are cut at 45 degrees (`cut`), each by its own amount.
// The lit edge is what keeps a tech frame apart from its face: the light tone of any frame colour
// keeps 3 to 1 against a dark face under every whole-bundle look, where a mid-grey band does not.
//
//   const card = techPanel(g, 1, 1, 62, 94, { face: p.face, frame: p.frame, glow: p.glow, border: p.border, cut: p.corner, lip: 2 });
//   scanLines(g, card.inner.x, card.inner.y, card.inner.w, 20, tone(p.face, 0.4), { pitch: 3, over: p.face });
//   const o = techBarHousing(g, 1, 1, 62, 14, { frame: p.frame, border: p.border, cut: p.corner, caps: 4, segments: 7, slant: 0.5 });
//   techBarFill(g, o, 1, { fill: p.fill, segments: 7, slant: 0.5 });      // the same segments and slant as the housing

/** The looks techPanel draws: plate (a bevelled metal band), hologram (lines of light round a tinted face, corner brackets), glass (a pale rim with no line between it and the face, its inner edge lit along the top and right, a glare in the corner). No arguments: a frozen list. */
export const TECH_STYLES = Object.freeze(['plate', 'hologram', 'glass']);

/** Slider value (Square 0 .. Cut 1) to the size of a cut corner in pixels, 0 to 4. Arguments: corner (0..1, default 0.5). */
export const cutPx = (corner = 0.5) => Math.round(clamp01(corner) * 4);

// One cut for all four corners, or [top left, top right, bottom right, bottom left].
const fourCuts = (cut) => (Array.isArray(cut) ? [0, 1, 2, 3].map((i) => Math.max(0, Math.round(cut[i] ?? 0))) : Array(4).fill(Math.max(0, Math.round(cut ?? 0))));

/**
 * Shape test for a rectangle whose corners are cut off at 45 degrees, as a clean one-pixel staircase (use with g.fill or g.blob): the outline of a sci-fi panel, bar, card or plate.
 * Arguments: x, y, w, h (the rectangle, whole pixels); cut (pixels taken off along each side of a corner: one number for all four, or [top left, top right, bottom right, bottom left]; default 0).
 */
export function cutRectIn(x, y, w, h, cut = 0) {
  const [tl, tr, br, bl] = fourCuts(cut);
  return (px, py) => {
    const ix = Math.floor(px - x), iy = Math.floor(py - y);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) return false;
    const rx = w - 1 - ix, ry = h - 1 - iy;
    return ix + iy >= tl && rx + iy >= tr && rx + ry >= br && ix + ry >= bl;
  };
}

// How deep each pixel of a shape lies: 0 outside, 1 on its edge, 2 one pixel in, and so on up to `max`.
function depthMap(W, H, inside, max) {
  const d = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) if (inside(px + 0.5, py + 0.5)) d[py * W + px] = 1;
  for (let k = 1; k < max; k++) {
    const next = [];
    for (let py = 1; py < H - 1; py++) for (let px = 1; px < W - 1; px++) {
      const i = py * W + px;
      if (d[i] === k && d[i - 1] >= k && d[i + 1] >= k && d[i - W] >= k && d[i + W] >= k) next.push(i);
    }
    for (const i of next) d[i] = k + 1;
  }
  return d;
}

/**
 * A stretchable sci-fi panel drawn to fill exactly the rectangle (x, y, w, h), its ink outline and its lip included: cut corners, a thin lit edge all round, a flat face. Returns { body, face, inner, slice, tones }, in the manner of panel9.
 * Arguments: g (the Surface); x, y, w, h (in a sprite: the frame minus its 1 px empty border); opt { face, frame (colours; required), glow (the colour of its light: a hologram's lines, a lit frame; default the frame colour), style (one of TECH_STYLES, default 'plate'), border (0..1, Thin to Thick) or borderPx (1 to 3), cut (0..1, Square to Cut) or cutPx (pixels: one number or [top left, top right, bottom right, bottom left]), lip (pixels of the slab's side showing under the body, default 0; the body is that much shorter), tab ({ inset, rise }: the top edge stands `rise` px higher between `inset` px from each side, default none), lights ([top left, top right, bottom right, bottom left], true for each corner of the face that carries a small light of the glow colour: a triangle, or a stripe along a cut corner; never inside `inner`), lit (true: the frame and the lights take the bright glow colour, as when pointed at), off (true: no colour, as when disabled), ink }.
 * In the result `body` is the panel without its lip, `face` the rectangle of the face under the top edge, `inner` the flat one-colour middle (put text here), `slice` how far corners, borders and lights reach in from each side of the rectangle given (7 px, so 8 with a frame's empty border; more beside a corner cut deeper than 6 px or a corner light), and `tones` the colours it used ({ edge, band, face, side, glow, glowLow: the light and its darker partner }), so that what a sprite adds matches the look, lit or greyed.
 */
export function techPanel(g, x, y, w, h, opt = {}) {
  const { face, frame, glow = frame, style = 'plate', ink = INK } = opt;
  if (!TECH_STYLES.includes(style)) throw new Error(`techPanel: style "${style}" is not one of ${TECH_STYLES.join(', ')}`);
  if (!face || !frame) throw new Error('techPanel: needs a face and a frame colour');
  const b = Math.max(1, Math.min(3, opt.borderPx ?? borderPx(opt.border)));
  const cuts = fourCuts(opt.cutPx ?? cutPx(opt.cut));
  const lip = Math.max(0, Math.round(opt.lip ?? 0));
  const rise = opt.tab ? Math.max(0, Math.round(opt.tab.rise ?? 2)) : 0, tabIn = opt.tab ? Math.round(opt.tab.inset ?? 12) : 0;
  const off = !!opt.off, lit = !!opt.lit && !off;
  const bh = h - lip, W = g.w, H = g.h;
  const shape = (dy) => {
    const main = cutRectIn(x, y + dy + rise, w, bh - rise, cuts);
    if (!rise) return main;
    const tab = cutRectIn(x + tabIn, y + dy, w - 2 * tabIn, rise + 1, [rise, rise, 0, 0]);
    return (px, py) => main(px, py) || tab(px, py);
  };

  // the colours of this look; a greyed panel loses its colour last, so its tones stay pure grey
  const F = ramp(frame), G = ramp(glow);
  let edge = F.light, band = F.base, bandDark = F.dark, faceC = face, side = F.dark;
  // (a hologram that is switched off has no light in its face)
  if (style === 'hologram') { edge = G.light; band = G.dark; bandDark = G.dark; faceC = off ? face : mix(face, glow, 0.14); }
  if (style === 'glass') { band = tone(face, 0.85); bandDark = band; }
  if (lit) {
    edge = style === 'hologram' ? mix(G.light, '#ffffff', 0.6) : G.light;
    band = G.base; bandDark = style === 'plate' ? G.dark : G.base;
  }
  let shine = tone(faceC, 0.45), dim = tone(faceC, -0.5), light = lit ? G.light : G.base, lightLow = lit ? G.base : G.dark;
  if (off) [edge, band, bandDark, faceC, side, shine, dim, light, lightLow] = [edge, band, bandDark, faceC, side, shine, dim, light, lightLow].map(desaturate);

  // the lip: the slab's side, showing under the body and in its cut bottom corners
  if (lip) {
    const d = depthMap(W, H, shape(lip), 2);
    for (let i = 0; i < d.length; i++) if (d[i]) g.dot(i % W, (i - (i % W)) / W, d[i] === 1 ? ink : side);
  }
  const d = depthMap(W, H, shape(0), 4 + b);
  const at = (px, py) => (px < 0 || py < 0 || px >= W || py >= H ? 0 : d[py * W + px]);
  // a hologram keeps its band only round the corners, as brackets
  const reach = SLICE - 1;
  const bracket = (px, py) => Math.min(px - x, x + w - 1 - px) < reach && Math.min(py - y - rise, y + bh - 1 - py) < reach;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const k = d[py * W + px];
    if (!k) continue;
    let c;
    if (k === 1) c = ink;
    // a pane of glass has no line between its rim and its face: the rim's inner edge catches the light instead (dark along the bottom and the left)
    else if (k === 2 + b) c = style !== 'glass' ? ink : at(px - 1, py + 1) < 2 + b ? dim : shine;
    else if (k === 2) c = edge;
    else if (k <= 1 + b) c = style === 'hologram' && !bracket(px, py) ? ink : style === 'plate' && at(px - 1, py + 1) <= 2 ? bandDark : band;
    else c = faceC;
    g.dot(px, py, c);
  }
  // the body's own bottom line joins the lip, so the lip is `lip` px of colour
  if (lip) { const row = y + bh - 1, sideC = g.get(x + (w >> 1), row + 1); for (let px = x + 1; px < x + w - 1; px++) if (g.get(px, row) && g.get(px, row + 1) === sideC) g.dot(px, row, side); }

  const fx = x + 2 + b, fy = y + rise + 2 + b, fw = w - 2 * (2 + b), fh = bh - rise - 2 * (2 + b);
  let topIn = Math.max(SLICE - 1, 2 + b, Math.ceil((Math.max(...cuts) + 2 + b) / 2));
  const m = topIn;
  if (style === 'glass') {
    // the glare: two short streaks leaning with the light, near the top right corner of the face
    for (const [sx, n] of [[fx + fw - 4, 4], [fx + fw - 8, 2]]) for (let i = 0; i < n; i++) if (at(sx - i, fy + 3 + i) > 3 + b) g.dot(sx - i, fy + 3 + i, shine);
    topIn = Math.max(m, 2 + b + 7);
  }
  // how far what is not flat reaches in from each side of the body (left, top, right, bottom): a cut corner, then a light, may reach further than the bevel
  const need = [m, m, m, m];
  cuts.forEach((c, i) => { need[i === 0 || i === 3 ? 0 : 2] = Math.max(need[i === 0 || i === 3 ? 0 : 2], c + 1); need[i < 2 ? 1 : 3] = Math.max(need[i < 2 ? 1 : 3], c + 1); });
  // corner lights: the corner of the face in the glow colour, kept out of the flat middle
  (opt.lights ?? []).forEach((on, i) => {
    if (!on) return;
    const reach = Math.min(Math.max(5, cuts[i] - (2 + b) + 2), 2 * (m - 2 - b)), right = i === 1 || i === 2, low = i >= 2;
    for (let j = 0; j < reach; j++) for (let k = 0; k < reach - j; k++) {
      const px = right ? fx + fw - 1 - k : fx + k, py = low ? fy + fh - 1 - j : fy + j;
      if (at(px, py) < 3 + b) continue;
      g.dot(px, py, light);
      need[right ? 2 : 0] = Math.max(need[right ? 2 : 0], 3 + b + k);
      need[low ? 3 : 1] = Math.max(need[low ? 3 : 1], 3 + b + j);
    }
  });
  return {
    body: { x, y, w, h: bh },
    face: { x: fx, y: fy, w: fw, h: fh },
    inner: { x: x + m, y: y + rise + topIn, w: w - 2 * m, h: bh - rise - topIn - m },
    slice: { left: need[0], top: rise + Math.max(topIn, need[1]), right: need[2], bottom: need[3] + lip },
    tones: { edge, band, face: faceC, side, glow: light, glowLow: lightLow },
  };
}

/**
 * Thin horizontal lines every few rows inside a rectangle: scan lines on a screen, vents on a panel, ruled lines on a card.
 * Arguments: g (the Surface); x, y, w, h (the rectangle); colour; options { pitch (rows from one line to the next, default 3), phase (the row of the first line inside the rectangle, default 0), over (a colour: paint only pixels that have exactly this colour, so the lines never cross a frame or a mark), skip (a rectangle { x, y, w, h } left clear) }.
 */
export function scanLines(g, x, y, w, h, colour, { pitch = 3, phase = 0, over, skip } = {}) {
  const only = over === undefined ? null : g.get.bind(g), want = over === undefined ? 0 : new Surface(1, 1).dot(0, 0, over).get(0, 0);
  for (let py = y + phase; py < y + h; py += Math.max(1, pitch)) for (let px = x; px < x + w; px++) {
    if (skip && px >= skip.x && px < skip.x + skip.w && py >= skip.y && py < skip.y + skip.h) continue;
    if (only && only(px, py) !== want) continue;
    g.dot(px, py, colour);
  }
  return g;
}

// Is column i of row j of a bar's opening a line between two compartments? `slant` leans the lines
// (pixels sideways per row; 0.5 is one pixel every two rows), right at the top, about the upright line's place.
function techGap(w, h, segments, slant) {
  if (!(segments > 1)) return () => false;
  const cols = gapColumns(w, segments);
  const lean = (j) => (slant ? Math.floor((h - 1 - j) * slant) - Math.floor(Math.floor((h - 1) * slant) / 2) : 0);
  const out = (i, j) => cols.has(i - lean(j));
  out.cols = cols; out.lean = lean;
  return out;
}

/**
 * The empty housing of a sci-fi bar (a 64x16 frame: 1, 1, 62, 14): cut corners and the lit edge of the tech bevel round a dark trough, with upright or leaning compartments and tick marks if asked. Returns the opening { x, y, w, h }, which is barOpening() of the same options.
 * Arguments: g (the Surface); x, y, w, h; opt { frame (colour; required), border or borderPx, caps (as barOpening), cut (0..1) or cutPx (pixels: one number or four, as cutRectIn; kept clear of the trough), back (the trough colour; default a dark tone made from the frame colour), segments (this many compartments), slant (how far their dividing lines lean, pixels sideways per row: 0 upright, 0.5 one pixel every two rows), ticks (pixels from one tick mark to the next along the band above and below the trough; with compartments the ticks continue their lines instead; default none), ink }. Pass the same segments and slant to techBarFill.
 */
export function techBarHousing(g, x, y, w, h, opt = {}) {
  if (!opt.frame) throw new Error('techBarHousing: needs a frame colour');
  const ink = opt.ink ?? INK, F = ramp(opt.frame);
  const b = Math.max(1, Math.min(3, opt.borderPx ?? borderPx(opt.border))), caps = Math.max(0, opt.caps ?? 0);
  const cuts = fourCuts(opt.cutPx ?? cutPx(opt.cut)).map((c) => Math.min(c, 2 + 2 * b + caps));
  const back = opt.back ?? mix(ink, opt.frame, 0.2);
  const o = barOpening(x, y, w, h, opt);
  const W = g.w, H = g.h, d = depthMap(W, H, cutRectIn(x, y, w, h, cuts), 3);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const k = d[py * W + px];
    if (k) g.dot(px, py, k === 1 ? ink : k === 2 ? F.light : px > 0 && py < H - 1 && d[(py + 1) * W + px - 1] <= 2 ? F.dark : F.base);
  }
  g.rect(o.x - 1, o.y - 1, o.w + 2, o.h + 2, ink);
  const keep = g.shadow;
  g.shadow = [1, -1];
  g.rect(o.x, o.y, o.w, o.h, { base: back, dark: tone(back, -1), light: back }, { shade: 1 });
  g.shadow = keep;
  const gap = techGap(o.w, o.h, opt.segments, opt.slant ?? 0);
  if (gap.cols) for (let j = 0; j < o.h; j++) for (const c of gap.cols) g.dot(o.x + c + gap.lean(j), o.y + j, ink);
  if (opt.ticks > 0) {
    const cols = gap.cols ? [...gap.cols] : [];
    if (!gap.cols) {
      // as many ticks as fit, one pitch apart, with what is left over shared between the two ends
      const n = Math.max(1, Math.floor((o.w - 2) / opt.ticks)), first = Math.floor((o.w - 1 - (n - 1) * opt.ticks) / 2);
      for (let k = 0; k < n; k++) cols.push(first + k * opt.ticks);
    }
    const lean = gap.lean ?? (() => 0);
    for (const c of cols) {
      for (let py = y + 1; py < o.y - 1; py++) g.dot(o.x + c + lean(0), py, ink);
      for (let py = o.y + o.h + 1; py < y + h - 1; py++) g.dot(o.x + c + lean(o.h - 1), py, ink);
    }
  }
  return o;
}

/**
 * The fill strip of a sci-fi bar, cropped to `value` (0 empty .. 1 full), inside `opening` (from techBarHousing or barOpening): light along its top, dark along its bottom, with the same upright or leaning gaps as the housing's compartments. It never draws outside the opening; a `fill` clip passes 1 and lets the game crop the strip.
 * Arguments: g (the Surface); opening ({ x, y, w, h }); value (0..1); opt { fill (colour; required), segments, slant (as techBarHousing), flash (0..1: how far the strip has turned white) }.
 */
export function techBarFill(g, opening, value, opt = {}) {
  if (!opt.fill) throw new Error('techBarFill: needs a fill colour');
  const o = opening, n = Math.round(o.w * clamp01(value));
  if (n <= 0 || o.h <= 0) return g;
  const flash = clamp01(opt.flash ?? 0), r = ramp(opt.fill);
  const lit = (c) => (flash ? mix(c, '#ffffff', flash) : c);
  const gap = techGap(o.w, o.h, opt.segments, opt.slant ?? 0);
  for (let i = 0; i < n; i++) for (let j = 0; j < o.h; j++) {
    if (gap(i, j)) continue;
    g.dot(o.x + i, o.y + j, lit(j === 0 ? r.light : o.h >= 3 && j === o.h - 1 ? r.dark : r.base));
  }
  return g;
}

/**
 * Finishes a small mark drawn on a layer of its own (a HUD pip, a map square, a status glyph): an ink line round it, an optional ink drop shadow down and to the left, then the mark itself on top.
 * Arguments: g (the Surface to draw on); layer (a Surface of the same size holding the mark, with no outline yet; it is outlined in place); options { heavy (true: the ink line also fills the corners, for a bolder mark), shadow (pixels the shadow falls down and to the left, default 0), ink }.
 */
export function stampGlyph(g, layer, { heavy = false, shadow = 0, ink = INK } = {}) {
  layer.outline(ink, { corners: heavy });
  if (shadow > 0) for (let py = 0; py < layer.h; py++) for (let px = 0; px < layer.w; px++) if (layer.data[py * layer.w + px]) g.dot(px - shadow, py + shadow, ink);
  g.blit(layer);
  return g;
}

// ---- swatch lists that keep their contrast under every whole-bundle look ---------------------

const LOOK_COLOURS = [null, ...THEME_PRESETS.map((t) => normalizeTheme(t.theme).colour)];
const lookMemo = new Map();

/** A colour as made, then as each whole-bundle look (THEME_PRESETS) turns it: 1 + THEME_PRESETS.length colours. */
export function underLooks(hex) {
  const key = hex.toLowerCase();
  let out = lookMemo.get(key);
  if (!out) {
    out = LOOK_COLOURS.map((c) => {
      if (!c) return key;
      const px = applyColour(new Uint32Array([col(key)]), c)[0];
      return rgbToHex(px & 255, (px >>> 8) & 255, (px >>> 16) & 255);
    });
    lookMemo.set(key, out);
  }
  return [...out];
}

/** The lowest contrast two colours have with each other, as made and under every whole-bundle look. */
export function worstContrast(a, b) {
  const A = underLooks(a), B = underLooks(b);
  let least = Infinity;
  for (let i = 0; i < A.length; i++) least = Math.min(least, contrast(A[i], B[i]));
  return least;
}

// The first colour is kept as it is. Each other one is kept if it passes; else the first of its tones
// (by the amounts given) that passes takes its place; else it is dropped. Untouched colours come first.
function fit(list, passes, amounts) {
  const kept = [list[0].toLowerCase()], moved = [];
  for (const raw of list.slice(1)) {
    const c = raw.toLowerCase();
    if (passes(c)) { kept.push(c); continue; }
    for (const a of amounts) { const t = tone(c, a); if (brightness(t) >= 0.18 && passes(t)) { moved.push(t); break; } }
  }
  return [...new Set([...kept, ...moved])].slice(0, 8);
}

/**
 * Face swatches that text can be read on: `min` to 1 (4.5) against `text` (white) under every look.
 * The first candidate (the default) is returned unchanged; a failing one comes back darker or not at all.
 */
export function textFaces(candidates, { text = '#ffffff', min = 4.5 } = {}) {
  return fit(candidates, (c) => worstContrast(text, c) >= min, [-0.3, -0.6, -0.9, -1.2]);
}

/**
 * Frame swatches that stand out from every one of `faces`: `min` to 1 (3) under every look.
 * The first candidate (the default) is returned unchanged; a failing one comes back lighter or not at all.
 */
export function framesFor(faces, candidates, { min = 3 } = {}) {
  return fit(candidates, (c) => faces.every((f) => worstContrast(c, f) >= min), [0.3, 0.6, 0.9, 1.2, 1.5]);
}

/**
 * Both swatch lists for a panel, a button or a bar of one bundle: { face, frame, failing }.
 * opt.face, opt.frame: palette colour names of the two defaults (kept first, unchanged).
 * opt.faces, opt.frames: palette colour names (or '#rrggbb') to offer besides them; left out, the
 * bundle's own `face` and `frame` swatch groups are used.
 * failing: [{ rule: 'text' | 'frame', face, frame?, ratio }] for every rule the DEFAULTS break
 * (nothing else in the lists can break one). Empty is what a specification should give.
 */
export function panelSwatches(bundle, opt = {}) {
  const name = paletteName(bundle), P = PALETTE[name];
  const hex = (c) => { if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase(); if (!P[c]) throw new Error(`panelSwatches: "${c}" is not a ${name} colour`); return P[c]; };
  if (!opt.face || !opt.frame) throw new Error('panelSwatches: name the default face and frame colours');
  const faceList = [hex(opt.face), ...(opt.faces ? opt.faces.map(hex) : swatches(name, 'face', { lead: opt.face }).slice(1))];
  const frameList = [hex(opt.frame), ...(opt.frames ? opt.frames.map(hex) : swatches(name, 'frame', { lead: opt.frame }).slice(1))];
  const face = textFaces(faceList), frame = framesFor(face, frameList);
  const failing = [], r2 = (v) => Math.round(v * 100) / 100;
  if (worstContrast('#ffffff', face[0]) < 4.5) failing.push({ rule: 'text', face: face[0], ratio: r2(worstContrast('#ffffff', face[0])) });
  for (const f of face) if (worstContrast(frame[0], f) < 3) failing.push({ rule: 'frame', face: f, frame: frame[0], ratio: r2(worstContrast(frame[0], f)) });
  return { face, frame, failing };
}
