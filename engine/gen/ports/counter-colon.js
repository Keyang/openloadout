// PORT (migration batch M9): a copy of engine/counter-colon.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/counter-colon.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Counter colon: a timer's colon that reads at game size. counterColon of engine/counter-digits.js draws 1 px dots
// in the middle of the 3 px gap between two windows (ink, case, ink), which at 1x merge with the digits: '1:30'
// reads as '130'. Here the gap is bridged with the window's own inside, so the two windows become one run of face
// around the colon, and the colon's dots are 2 px wide with face on each side. Made with sprite batch K22, fix
// round 2 (bundles/specs/core-sprites-3.md: ui-timer). Pure drawing on a Surface.
//
//   import { styledCounterPlate } from '../engine/counter-styles.js';
//   import { bridgeColonGap, wideCounterColon } from '../engine/counter-colon.js';
//
//   const { windows } = styledCounterPlate(g, 1, 1, 62, 22, { count: 4, metrics, style, face, frame, colon: 2 });
//   bridgeColonGap(g, windows, 2);                                  // in every clip, so the case never changes
//   wideCounterColon(g, windows, 2, metrics, { colour: glow });     // only where the colon shows

import { windowPen } from './counter-digits.js';

function check(windows, colon, who) {
  if (!(colon >= 1 && colon < windows.length)) throw new Error(`${who}: colon ${colon} must be the index of a window after the first (1 to ${windows.length - 1})`);
  const a = windows[colon - 1], b = windows[colon];
  if (b.x - (a.x + a.w) < 1) throw new Error(`${who}: windows ${colon - 1} and ${colon} leave no gap for a colon`);
  return { a, b };
}

/**
 * Joins the two windows either side of a colon into one run: every column of the gap between them (and the facing edge column of each) is painted as a copy of the column just inside the left window, from 2 rows above the window to 2 rows below, so the window's face, its ink line and any shading run on unbroken. Returns the run of columns the colon stands in: { x, w } (the gap and both facing edge columns).
 * Arguments: g (the Surface); windows (from counterWindows, counterPlate or styledCounterPlate, laid out with the same `colon`); colon (the index of the window after the colon, 1 or more).
 */
export function bridgeColonGap(g, windows, colon) {
  const { a, b } = check(windows, colon, 'bridgeColonGap');
  const src = a.x + a.w - 2, x0 = a.x + a.w - 1, x1 = b.x;
  for (let py = a.y - 2; py <= a.y + a.h + 1; py++) {
    if (py < 0 || py >= g.h) continue;
    const c = g.get(src, py);
    for (let px = x0; px <= x1; px++) if (c) g.data[py * g.w + px] = c;
  }
  return { x: x0, w: x1 - x0 + 1 };
}

/**
 * Draws a timer's colon in the gap before window `colon`, as two dots `width` px wide (default 2), centred in the run bridgeColonGap makes (so 1 px or more of face stays on each side), set symmetrically about the middle of the digits: 2 rows tall from cap 7 (2 rows tall at cap 5 too, touching the cap line and the baseline). Returns the two dots' rectangles.
 * Arguments: g (the Surface); windows (as bridgeColonGap); colon (the index of the window after the colon); metrics (from fontMetrics); options { colour, width (default 2) }.
 */
export function wideCounterColon(g, windows, colon, metrics, { colour, width = 2 } = {}) {
  if (!colour) throw new Error('wideCounterColon: needs a colour');
  const { a, b } = check(windows, colon, 'wideCounterColon');
  const x0 = a.x + a.w - 1, n = b.x - x0 + 1;
  if (width < 1 || width > n - 2) throw new Error(`wideCounterColon: dots ${width} px wide do not fit with 1 px each side in a run of ${n}`);
  const x = x0 + Math.floor((n - width) / 2);
  const top = windowPen(b, '0', metrics).base - metrics.cap, cap = metrics.cap;
  let dots;
  if (cap < 7) dots = [{ y: top, h: 2 }, { y: top + cap - 2, h: 2 }];
  else {
    const c = (cap - 1) / 2;
    dots = [{ y: top + c - 2, h: 2 }, { y: top + c + 1, h: 2 }];
  }
  dots = dots.map((d) => ({ x, y: d.y, w: width, h: d.h }));
  for (const d of dots) for (let py = d.y; py < d.y + d.h; py++) for (let px = d.x; px < d.x + d.w; px++) g.dot(px, py, colour);
  return dots;
}
