// PORT (migration batch M9): a copy of engine/counter-digits.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/counter-digits.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Counter digits: a digit standing in a counter window (at rest, nudged a pixel for a bump or a shake, flashed, or
// with its top row lit) and the colon between two windows of a timer. Companion to engine/counters.js, whose
// rollDigit places a digit at rest by the same rule (centred in the window). Made with sprite batch K22
// (bundles/specs/core-sprites-3.md: ui-score-counter, ui-timer). Pure drawing on a Surface.
//
//   import { counterPlate } from '../engine/counters.js';
//   import { windowDigit, counterColon } from '../engine/counter-digits.js';
//
//   const { windows } = counterPlate(g, 1, 1, 62, 22, { count: 4, metrics, face, frame, colon: 2 });
//   '0130'.split('').forEach((d, i) => windowDigit(g, windows[i], d, metrics, { colour: glow, dx: shake }));
//   counterColon(g, windows, 2, metrics, { colour: glow });
// TRIMMED (review M9 round 1, issue 3): the declarations and imports no M9 port reaches are left out, so the copy holds
// only what draws; what is kept is word for word as before.

import { Surface } from './surface.js';
import { INK } from './colour.js';
import { fontGlyph, drawText } from './pixel-font.js';

/**
 * Where a character stands at rest in a counter window, centred both ways (the rule rollDigit of engine/counters.js uses): { x (pen point), base (baseline) }.
 * Arguments: win ({ x, y, w, h }, a window of counterWindows or counterPlate); ch (a character of the font); metrics (from fontMetrics).
 */
export function windowPen(win, ch, metrics) {
  const gw = fontGlyph(String(ch), metrics).w;
  return { x: win.x + Math.floor((win.w - gw) / 2), base: win.y + Math.floor((win.h - metrics.cap) / 2) + metrics.cap };
}

/**
 * Draws one character standing in a counter window, body only, moved dx, dy whole pixels from rest and clipped to the window; `lit` paints the glyph's top row in a second colour.
 * Arguments: g (the Surface); win ({ x, y, w, h }); ch (a character of the font); metrics (from fontMetrics); options { colour, dx (default 0), dy (default 0), lit (a colour for the top row, or none), ink }.
 */
export function windowDigit(g, win, ch, metrics, { colour, dx = 0, dy = 0, lit, ink = INK } = {}) {
  if (!colour) throw new Error('windowDigit: needs a colour');
  const s = new Surface(g.w, g.h), pen = windowPen(win, ch, metrics), gl = fontGlyph(String(ch), metrics);
  const x0 = pen.x + Math.round(dx), base = pen.base + Math.round(dy);
  drawText(s, String(ch), x0, base, { metrics, colour, outline: 'none', ink });
  if (lit) {
    const top = base - gl.rise;
    for (let i = 0; i < gl.w; i++) if (gl.body.at(i, 0)) s.dot(x0 + i, top, lit);
  }
  for (let py = win.y; py < win.y + win.h; py++) for (let px = win.x; px < win.x + win.w; px++) {
    const c = s.get(px, py);
    if (c) g.data[py * g.w + px] = c;
  }
  return g;
}

/**
 * Draws a timer's colon in the gap before window `colon`: two dots 1 px wide (2 rows tall from cap 7, 1 below) in the gap's middle column, set symmetrically about the middle of the digits; returns the two dots' rectangles.
 * Arguments: g (the Surface); windows (from counterWindows or counterPlate, laid out with the same `colon`); colon (the index of the window after the colon, 1 or more); metrics (from fontMetrics); options { colour }.
 */