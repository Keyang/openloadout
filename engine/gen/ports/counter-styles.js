// PORT (migration batch M9): a copy of engine/counter-styles.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/counter-styles.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Counter styles: the three looks of a counter plate drawn so they differ in shape, not just in the tone of a
// line. Companion to engine/counters.js: counterPlate draws the case (and checks that the digits fit); this
// module repaints the inside of the case in the chosen style and returns the same { windows, text, edge, case }.
// Made with sprite batch K22, fix round 1 (bundles/specs/core-sprites-3.md: ui-score-counter, ui-timer).
//
//   import { styledCounterPlate } from '../engine/counter-styles.js';
//   const { windows, text } = styledCounterPlate(g, 1, 1, 62, 22, { count: 4, metrics, style: p.style, face, frame, colon: 2 });
//
// THE STYLES, inside the same case:
//   plate  a separate sunken window per digit, set apart by a column of the case (ink, case, ink) when they fit
//   strip  one unbroken window for all the digits, no cell lines, a lit top edge (the face's light tone)
//   drum   barrel windows: 2 rows taller than a plate window, rounded corners, a shaded band of 2 rows at the
//          top and bottom (the face's deep tone outside, its dark tone inside, the face itself lighter in the
//          middle), and a lit ridge of the case (its light tone) between drums
// Only `face` is drawn inside each rectangle of `text`.

import { ramp, tone, INK } from './colour.js';
import { counterPlate, counterWindows, COUNTER_STYLES } from './counters.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// the gaps between windows each style tries, widest first
const GAPS = { plate: [3, 2, 1], strip: [1], drum: [3, 1] };

/**
 * Draws a counter's case and its digit windows in one of COUNTER_STYLES, each style a different shape (see the module comment), and says where the game prints: { windows, text (flat rectangles of face only), edge (one pixel of the frame band), case }.
 * Arguments: as counterPlate of engine/counters.js: g; x, y, w, h; options { count, metrics, style, face, frame, border, corner, lead, colon, ink }. Throws when the windows do not fit (as counterPlate).
 */
export function styledCounterPlate(g, x, y, w, h, opt = {}) {
  const { count, metrics, style = 'plate', face, frame, border = 0.5, lead = 0, colon = -1, ink = INK } = opt;
  if (!COUNTER_STYLES.includes(style)) throw new Error(`styledCounterPlate: style "${style}" is not one of ${COUNTER_STYLES.join(', ')}`);
  // the case, and the check that the digits fit at the narrowest gap
  const base = counterPlate(g, x, y, w, h, { ...opt, style: 'plate' });
  const F = ramp(frame), band = 1 + Math.round(clamp01(border)), inner = band + 1;
  const box = { x: x + inner + 1, y: y + inner + 1, w: w - 2 * (inner + 1), h: h - 2 * (inner + 1) };
  const rect = (rx, ry, rw, rh, c) => { for (let py = ry; py < ry + rh; py++) for (let px = rx; px < rx + rw; px++) g.dot(px, py, c); };
  rect(box.x, box.y, box.w, box.h, F.dark);
  // the widest gap that fits
  const fits = (ws) => ws.every((r) => r.x - 1 >= box.x + Math.max(0, lead) && r.x + r.w + 1 <= box.x + box.w);
  let windows = base.windows;
  for (const gap of GAPS[style]) {
    const ws = counterWindows(box.x + 1, box.y + 1, box.w - 2, box.h - 2, count, metrics, { gap, lead, colon });
    if (fits(ws)) { windows = ws; break; }
  }
  const text = [], n = windows.length;
  if (style === 'plate') {
    for (const r of windows) { rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, ink); rect(r.x, r.y, r.w, r.h, face); text.push({ ...r }); }
  } else if (style === 'strip') {
    const a = windows[0], b = windows[n - 1], sx = a.x, sw = b.x + b.w - a.x;
    rect(sx - 1, a.y - 2, sw + 2, a.h + 3, ink);                  // the ink round it
    rect(sx, a.y - 1, sw, 1, tone(face, 0.6));                    // the lit top edge
    rect(sx, a.y, sw, a.h, face);                                 // one unbroken window
    for (const r of windows) text.push({ ...r });
  } else {
    const deep = tone(tone(face, -1), -1), dark = tone(face, -1);
    for (const r of windows) {
      // the barrel: ink round a rounded box 2 rows taller than the window, its corners cut
      const X0 = r.x - 1, X1 = r.x + r.w, Y0 = r.y - 2, Y1 = r.y + r.h + 1;
      for (let py = Y0; py <= Y1; py++) for (let px = X0; px <= X1; px++) {
        const cx = px === X0 || px === X1, cy = py === Y0 || py === Y1;
        if (cx && cy) continue;                                    // the outer corners stay case
        g.dot(px, py, ink);
      }
      for (let py = r.y - 1; py <= r.y + r.h; py++) {
        const k = py - (r.y - 1), last = r.h + 1;
        const c = k === 0 || k === last ? deep : k === 1 || k === last - 1 ? dark : face;
        for (let px = r.x; px < r.x + r.w; px++) {
          if ((k === 0 || k === last) && (px === r.x || px === r.x + r.w - 1)) continue;   // the inner corners: ink
          g.dot(px, py, c);
        }
      }
      text.push({ x: r.x, y: r.y + 1, w: r.w, h: r.h - 2 });
    }
    // the case between two drums: a lit ridge (the colon's gap keeps the case's dark inside for the colon)
    for (let i = 1; i < n; i++) {
      const a = windows[i - 1], b = windows[i], left = a.x + a.w, right = b.x - 1;
      if (i === colon) continue;
      if (right === left) rect(left, a.y - 2, 1, a.h + 4, F.light);
      else for (let px = left + 1; px < right; px++) rect(px, a.y - 1, 1, a.h + 2, F.light);
    }
  }
  return { windows, text, edge: base.edge, case: base.case };
}
