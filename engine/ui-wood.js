// Wooden interface pieces (added with batch P13): the partner of engine/ui.js for menus made of
// boards. A stretchable board in a darker frame, in three styles, and a button made of the same board.
//
//   import { WOOD_STYLES, woodPanel, woodButton, woodTones } from '../engine/ui-wood.js';
//   const board = woodPanel(g, 1, 1, 94, 62, { face: p.face, frame: p.frame, border: p.border, corner: p.corner, texture: p.texture, nails: p.nails });
//   const titled = woodPanel(g, 1, 1, 94, 62, { face, frame, strip: p.accent });     // a lighter strip across the top for a heading
//   const { text } = woodButton(g, 1, 1, 94, 30, clip, { style: p.style, face: p.face, frame: p.frame, border: p.border, corner: p.corner, texture: p.texture, nails: p.nails });
//
// THE WOOD BEVEL, from the outside in:
//   1 px INK  ·  the frame band, 1 to 3 px (`border`): its outer pixel is the CARVED EDGE, a pale line
//   of the frame colour all the way round; the rest is the frame colour, darker along the bottom and left
//   ·  1 px INK  ·  the board, flat.
// The board is STAINED: its flat middle is the face colour mixed 40% toward the outline colour
// (woodTones().text), dark enough that white text keeps 4.5 to 1 on it under every whole-bundle look,
// while the lighter grain shows the face colour. The carved edge is what keeps the frame apart from the board: it
// keeps 3 to 1 against the stain for any frame colour, where a dark wooden band beside a dark board cannot.
//
// STRETCHING. Everything that is not flat lies within SLICE - 1 (7) px of the rectangle's sides, so with
// the 1 px empty border of a frame that is the 8 px nine-slice border of the style guide. Grain, chisel
// marks and specks lie only between the bevel and that line, in rows along the top and bottom, so a
// board stretched sideways only gets longer grain. Nails are 3x3 and sit in the corners. The result's
// `inner` is the flat, one-colour middle; `slice` says how far the rest reaches in from each side.
//
// STYLES (WOOD_STYLES): plank (round corners, broken grain lines), carved (cut corners, a sunken board
// with an even row of chisel marks), stone (round corners, the stain greyed, specks instead of grain).

import { Surface } from './surface.js';
import { ramp, mix, col, INK } from './color.js';
import { hash } from './motion.js';
import { SLICE, LIP, BUTTON_STATES, roundRectIn, cutRectIn, cornerPx, borderPx, desaturate } from './ui.js';

/** The styles woodPanel and woodButton draw: plank (grain lines), carved (cut corners, a sunken board, chisel marks), stone (a greyed slab with specks). No arguments: a frozen list. */
export const WOOD_STYLES = Object.freeze(['plank', 'carved', 'stone']);

/**
 * Works out the colours of a wooden piece from its two colours: returns { text (the flat stained middle, dark enough for white text), grain (darker marks), light (lighter marks), edge (the pale carved edge of the frame), band, bandDark (the frame), lip (the side of a raised button), nail: { light, base } }.
 * Arguments: face (the board's colour); frame (the frame's colour); options { style (one of WOOD_STYLES; stone greys the stain), state ('normal', 'hover': a lighter stain and a brighter edge, 'pressed', 'disabled': no colour), nail (the colour of nail heads, default a steel grey) }.
 */
export function woodTones(face, frame, { style = 'plank', state = 'normal', nail = '#c2c9d6' } = {}) {
  const hover = state === 'hover';
  // darker wood is the same wood with less light on it: mixed toward the outline colour, which keeps it brown
  // (the engine's shadow tones turn a brown red)
  let text = mix(face, INK, hover ? 0.2 : 0.4);
  if (style === 'stone') text = mix(text, desaturate(text), 0.75);
  const F = ramp(frame), N = ramp(nail);
  const T = {
    text, grain: mix(text, INK, 0.4), light: mix(text, ramp(face).light, 0.4),
    edge: mix(F.light, '#ffffff', hover ? 0.6 : 0.35), band: hover ? frame : mix(frame, INK, 0.3), bandDark: mix(frame, INK, 0.5), lip: mix(frame, INK, 0.55),
    nail: { light: N.light, base: N.base },
  };
  if (state !== 'disabled') return T;
  const grey = (c) => desaturate(c);
  return { text: grey(T.text), grain: grey(T.grain), light: grey(T.light), edge: grey(T.edge), band: grey(T.band), bandDark: grey(T.bandDark), lip: grey(T.lip), nail: { light: grey(T.nail.light), base: grey(T.nail.base) } };
}

// How deep each pixel of a shape lies: 0 outside, 1 on its edge, 2 one pixel in, and so on up to `max`.
function depths(W, H, inside, max) {
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

const outlineOf = (style, x, y, w, h, k) => (style === 'carved' ? cutRectIn(x, y, w, h, k + 1) : roundRectIn(x, y, w, h, k));

/**
 * Draws a stretchable wooden board in its frame, filling exactly the rectangle (x, y, w, h), its ink outline included: the wood bevel round a flat stained middle, with grain, chisel marks or specks kept between the two; returns { body, face, inner, title, slice, tones }.
 * Arguments: g (the Surface); x, y, w, h (in a sprite: the frame minus its 1 px empty border); opt { face, frame (colours; required), style (one of WOOD_STYLES, default 'plank'), state (as woodTones, default 'normal'), border (0..1, Thin to Thick) or borderPx (1 to 3), corner (0..1, Square to Round) or cornerPx (0 to 4; carved cuts its corners one pixel deeper), texture (0..1: Plain to Busy, how much grain), nails (true: a 3x3 nail head in each corner), nail (their colour), strip (a colour: a strip of it across the top of the board for a heading, `stripRows` rows tall, default 11, with a line under it), clear ({ top, bottom }: rows in from the rectangle that the bevel and the texture may use, default 7 each), ink }.
 * In the result `body` is the rectangle, `face` the board inside the bevel, `inner` the flat one-colour middle (put text here), `title` the flat part of the strip (or null), `slice` how far everything else reaches in from each side of the rectangle (add a frame's 1 px empty border), and `tones` the colours it used (woodTones).
 */
export function woodPanel(g, x, y, w, h, opt = {}) {
  const { face, frame, style = 'plank', state = 'normal', ink = INK, texture = 0.5, nails = false, nail, strip = null, stripRows = 11 } = opt;
  if (!WOOD_STYLES.includes(style)) throw new Error(`woodPanel: style "${style}" is not one of ${WOOD_STYLES.join(', ')}`);
  if (!face || !frame) throw new Error('woodPanel: needs a face and a frame colour');
  const b = Math.max(1, Math.min(3, opt.borderPx ?? borderPx(opt.border)));
  const k = Math.max(0, Math.min(4, opt.cornerPx ?? cornerPx(opt.corner)));
  const T = woodTones(face, frame, { style, state, nail });
  const m = SLICE - 1;
  const top = Math.max(2 + b, opt.clear?.top ?? m), bottom = Math.max(2 + b, opt.clear?.bottom ?? m);
  const W = g.w, H = g.h;
  const s = new Surface(W, H);

  // the bevel
  const d = depths(W, H, outlineOf(style, x, y, w, h, k), 4 + b);
  const at = (px, py) => (px < 0 || py < 0 || px >= W || py >= H ? 0 : d[py * W + px]);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const v = d[py * W + px];
    if (!v) continue;
    s.dot(px, py, v === 1 || v === 2 + b ? ink : v === 2 ? T.edge : v <= 1 + b ? (at(px - 1, py + 1) < v ? T.bandDark : T.band) : T.text);
  }

  const F = { x: x + 2 + b, y: y + 2 + b, w: w - 2 * (2 + b), h: h - 2 * (2 + b) };
  let inner = { x: x + m, y: y + top, w: w - 2 * m, h: h - top - bottom };
  const flat = col(T.text);
  // marks go only on the board, and never into the flat middle
  const mark = (px, py, c) => {
    if (px >= inner.x && px < inner.x + inner.w && py >= inner.y && py < inner.y + inner.h) return;
    if (s.get(px, py) === flat) s.dot(px, py, c);
  };
  // the rows a texture may use, nearest the frame first
  const rowsTop = [], rowsBottom = [];
  for (let py = F.y; py < inner.y; py++) rowsTop.push(py);
  for (let py = F.y + F.h - 1; py >= inner.y + inner.h; py--) rowsBottom.push(py);
  const amount = Math.max(0, Math.min(1, texture));
  const usedOf = (rows) => (amount <= 0 ? 0 : Math.min(rows.length, 1 + Math.floor(amount * rows.length)));

  if (style === 'carved') {
    // a sunken board: shadow under the top and beside the right of the frame, light along the left (and the bottom, where there is room)
    for (let px = F.x; px < F.x + F.w; px++) { mark(px, F.y, T.grain); mark(px, F.y + F.h - 1, T.light); }
    for (let py = F.y + 1; py < F.y + F.h - 1; py++) { mark(F.x, py, T.light); mark(F.x + F.w - 1, py, T.grain); }
    // chisel marks: an even row of short cuts, every 4 px
    const cut = (rows) => rows.slice(1, 1 + usedOf(rows.slice(1))).forEach((py, r) => {
      for (let px = F.x + 2 + (r % 2) * 2; px < F.x + F.w - 2; px += 4) { mark(px, py, T.grain); if (amount > 0.6) mark(px + 1, py, T.grain); }
    });
    cut(rowsTop); cut(rowsBottom);
  } else if (style === 'stone') {
    // specks and small chips, lighter and darker than the slab
    const rows = [...rowsTop, ...rowsBottom], n = rows.length ? Math.round(amount * 22) : 0;
    for (let i = 0; i < n; i++) {
      const py = rows[Math.floor(hash(i, 31) * rows.length)], px = F.x + 1 + Math.floor(hash(i, 32) * (F.w - 3));
      const c = i % 3 === 0 ? T.light : T.grain;
      mark(px, py, c); if (hash(i, 33) > 0.45) mark(px + 1, py, c);
    }
  } else {
    // grain: broken lines along the board, lighter just under the frame and darker below that
    const grain = (rows, seed) => rows.slice(0, usedOf(rows)).forEach((py, r) => {
      let px = F.x + 1 + Math.floor(hash(r, seed + 1) * 4);
      for (let i = 0; px < F.x + F.w - 1; i++) {
        const dash = 3 + Math.floor(hash(i, seed + r * 7 + 2) * 8), gap = 2 + Math.floor(hash(i, seed + r * 7 + 3) * 5);
        if (hash(i, seed + r * 7 + 4) < 0.35 + 0.65 * amount) for (let j = 0; j < dash && px + j < F.x + F.w - 1; j++) mark(px + j, py, r % 2 ? T.grain : T.light);
        px += dash + gap;
      }
    });
    grain(rowsTop, 40); grain(rowsBottom, 80);
  }

  // a strip across the top of the board for a heading
  let title = null;
  if (strip) {
    const sy = F.y, sh = Math.max(3, Math.min(stripRows, F.h - 6));
    for (let py = sy; py < sy + sh + 1; py++) for (let px = F.x; px < F.x + F.w; px++) {
      if (at(px, py) < 3 + b) continue;
      s.dot(px, py, py === sy + sh ? ink : strip);
    }
    title = { x: x + m, y: sy, w: w - 2 * m, h: sh };
    const cutTop = sy + sh + 1 - y;                                // rows in from the rectangle down to the line under the strip
    if (cutTop > top) inner = { x: inner.x, y: y + cutTop, w: inner.w, h: h - cutTop - bottom };
  }

  if (nails) {
    // a 3x3 nail head in each corner of the board, lit from the top right; it never reaches the flat middle
    const nx = Math.min(F.x, x + m - 3), ny = Math.min(F.y, y + m - 3);
    for (const [cx, cy] of [[nx, ny], [x + w - nx + x - 3, ny], [nx, y + h - ny + y - 3], [x + w - nx + x - 3, y + h - ny + y - 3]]) {
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        if (at(cx + i, cy + j) < 2 + b) continue;
        s.dot(cx + i, cy + j, i === 0 && j === 2 ? ink : i + (2 - j) >= 3 ? T.nail.light : T.nail.base);     // two tones and an ink corner: lit from the top right
      }
    }
  }

  g.blit(s);
  return {
    body: { x, y, w, h }, face: F, inner, title,
    slice: { left: inner.x - x, top: inner.y - y, right: x + w - (inner.x + inner.w), bottom: y + h - (inner.y + inner.h) },
    tones: T,
  };
}

/**
 * Draws a wooden button in one of its four states in the rectangle (x, y, w, h) (a 96x32 frame: 1, 1, 94, 30): the board of woodPanel standing on a 2 px lip, lighter when pointed at, 2 px lower when pressed, grey when disabled; returns { text, body, tones }.
 * Arguments: g (the Surface); x, y, w, h; state ('normal', 'hover', 'pressed' or 'disabled'); opt { face, frame, style, border or borderPx (a button's band is 1 or 2 px, so the text area stays 18 px tall), corner or cornerPx, texture, nails, nail, ink: as woodPanel }.
 * In the result `text` is the flat one-colour area for the label: it covers the middle 78x18 of a 96x32 frame and moves down 2 px when pressed; `body` is the button without its lip; `tones` the colours used (woodTones).
 */
export function woodButton(g, x, y, w, h, state = 'normal', opt = {}) {
  if (!BUTTON_STATES.includes(state)) throw new Error(`woodButton: state "${state}" is not one of ${BUTTON_STATES.join(', ')}`);
  if (!opt.face || !opt.frame) throw new Error('woodButton: needs a face and a frame colour');
  const ink = opt.ink ?? INK, style = opt.style ?? 'plank';
  if (!WOOD_STYLES.includes(style)) throw new Error(`woodButton: style "${style}" is not one of ${WOOD_STYLES.join(', ')}`);
  const b = Math.max(1, Math.min(2, opt.borderPx ?? borderPx(opt.border)));
  const k = Math.max(0, Math.min(4, opt.cornerPx ?? cornerPx(opt.corner)));
  const pressed = state === 'pressed';
  const bh = h - LIP, by = pressed ? y + LIP : y;
  const T = woodTones(opt.face, opt.frame, { style, state, nail: opt.nail });
  if (!pressed) {
    // the lip: the board's side, showing under the body and in its cut bottom corners
    const d = depths(g.w, g.h, outlineOf(style, x, y + LIP, w, bh, k), 2);
    for (let i = 0; i < d.length; i++) if (d[i]) g.dot(i % g.w, (i - (i % g.w)) / g.w, d[i] === 1 ? ink : T.lip);
  }
  const r = woodPanel(g, x, by, w, bh, { ...opt, style, state, borderPx: b, cornerPx: k, strip: null, clear: { top: 6, bottom: 4 } });
  if (!pressed) {
    // the body's own bottom line joins the lip, so the lip is 2 px of colour and the travel is still 2 px
    const row = y + bh - 1, lipC = col(T.lip);
    for (let px = x + 1; px < x + w - 1; px++) if (g.get(px, row + 1) === lipC) g.dot(px, row, T.lip);
  }
  return { text: r.inner, body: r.body, tones: T };
}
