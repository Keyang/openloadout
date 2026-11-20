// PORT (migration batch M9): a copy of engine/counters.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/counters.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Counters: a plate of digit windows (a score counter, a timer), a digit rolling to the next one inside its
// window, and a small clock mark (bundles/specs/core-sprites-3.md, helper batch H4b). Pure drawing on a
// Surface: runs in Node and in the browser. The digits are the pixel font's (engine/pixel-font.js).
//
//   import { counterPlate, rollDigit, clockIn } from '../engine/counters.js';
//   import { fontMetrics, drawText } from '../engine/pixel-font.js';
//
//   const metrics = fontMetrics(p.size, 'chunky');
//   const { windows, text } = counterPlate(g, 1, 1, 62, 18, { count: 6, metrics, style: p.style, face: p.face, frame: p.frame, lead: 12 });
//   rollDigit(g, windows[5], 3, 4, k, metrics, { colour: '#ffffff' });     // the last digit rolling from 3 to 4
//   g.fill(2, 4, 12, 14, clockIn(7, 9, 5, { minute: t }), INK);             // a clock in the lead
//
// THE CASE, from the outside in: 1 px INK · the frame band, 1 to 2 px (`border`), lit along the top and
// right and dark along the bottom and left · 1 px INK · the inside, in the frame's dark tone. Each window
// is the face colour inside a 1 px INK line. `text` lists the flat rectangles of face a game prints its
// digits into; nothing but `face` is drawn inside them.

import { Surface } from './surface.js';
import { ramp, tone, INK } from './colour.js';
import { roundRectIn } from './ui.js';
import { fontGlyph, drawText } from './pixel-font.js';

/** The looks counterPlate draws: plate (one bevelled case, a separate sunken window per digit), strip (one long window, cells split by 1 px lines of the face's dark tone), drum (windows whose top and bottom rows are dark, like an odometer). No arguments: a frozen list. */
export const COUNTER_STYLES = Object.freeze(['plate', 'strip', 'drum']);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Where the digit windows of a counter go, without drawing: [{ x, y, w, h }], left to right. Each is metrics.digitW + 2 x pad wide and metrics.cap + 2 x pad tall, gap px apart, right-aligned in the box after `lead` px kept on the left, centred up and down.
 * Arguments: x, y, w, h (the box); count (how many digits); metrics (from fontMetrics); options { gap (default 1), pad (default 1), lead (px kept free on the left for a picture, default 0), colon (index of the window that has a 3 px gap before it for a colon; -1 none) }.
 */
export function counterWindows(x, y, w, h, count, metrics, { gap = 1, pad = 1, lead = 0, colon = -1 } = {}) {
  const ww = metrics.digitW + 2 * pad, wh = metrics.cap + 2 * pad;
  const before = (i) => (i === 0 ? 0 : i === colon ? Math.max(3, gap) : gap);
  let total = 0;
  for (let i = 0; i < count; i++) total += before(i) + ww;
  let wx = x + w - total;
  const wy = y + Math.floor((h - wh) / 2), out = [];
  for (let i = 0; i < count; i++) { wx += before(i); out.push({ x: wx, y: wy, w: ww, h: wh }); wx += ww; }
  return out;
}

/**
 * Draws a counter's case and its digit windows, and says where the game prints: { windows, text (flat rectangles of face only), edge (one pixel of the frame band, for textArea), case (the case's rectangle) }.
 * Arguments: g (the Surface); x, y, w, h (the case); options { count, metrics (from fontMetrics), style (one of COUNTER_STYLES), face, frame (colours), border (0..1: a 1 or 2 px band), corner (0..1), lead (px kept free on the left inside the case), colon (as counterWindows), ink }. Throws when the windows do not fit inside the case after `lead`.
 */
export function counterPlate(g, x, y, w, h, { count, metrics, style = 'plate', face, frame, border = 0.5, corner = 0.5, lead = 0, colon = -1, ink = INK } = {}) {
  if (!COUNTER_STYLES.includes(style)) throw new Error(`counterPlate: style "${style}" is not one of ${COUNTER_STYLES.join(', ')}`);
  if (!face || !frame) throw new Error('counterPlate: needs a face and a frame colour');
  if (!metrics) throw new Error('counterPlate: needs metrics (from fontMetrics)');
  const band = 1 + Math.round(clamp01(border)), k = Math.round(clamp01(corner) * 3), F = ramp(frame);
  const rr = (d, kk = k) => roundRectIn(x + d, y + d, w - 2 * d, h - 2 * d, Math.max(0, kk - d));
  // the case: ink, the band lit along the top and right, ink, the inside
  g.fill(x, y, x + w, y + h, rr(0), ink);
  for (let d = 1; d <= band; d++) {
    const inside = rr(d);
    g.fill(x, y, x + w, y + h, inside, F.base);
    g.fill(x, y, x + w, y + h, (px, py) => inside(px, py) && (!inside(px, py - 1) || !inside(px + 1, py)), F.light);
    g.fill(x, y, x + w, y + h, (px, py) => inside(px, py) && (!inside(px, py + 1) || !inside(px - 1, py)) && inside(px, py - 1) && inside(px + 1, py), F.dark);
  }
  const inner = band + 1;
  g.fill(x, y, x + w, y + h, rr(inner), ink);
  g.fill(x, y, x + w, y + h, rr(inner + 1), F.dark);
  const box = { x: x + inner + 1, y: y + inner + 1, w: w - 2 * (inner + 1), h: h - 2 * (inner + 1) };
  // the windows, each inside a 1 px ink line (so the area they are laid out in keeps 1 px clear all round)
  const windows = counterWindows(box.x + 1, box.y + 1, box.w - 2, box.h - 2, count, metrics, { lead, colon });
  // the windows and their ink lines must fit inside the case after `lead`; too many digits (or too much lead)
  // would draw over the lead picture or the band
  for (const r of windows) if (r.x - 1 < box.x + Math.max(0, lead) ||r.y - 1 < box.y || r.x + r.w + 1 > box.x + box.w || r.y + r.h + 1 > box.y + box.h) {
    throw new Error(`counterPlate: ${count} windows (lead ${lead}) do not fit inside a ${w}x${h} case; make it larger or show fewer digits`);
  }
  const dark = tone(face, -1), text = [];
  const rect = (r, c) => { for (let py = r.y; py < r.y + r.h; py++) for (let px = r.x; px < r.x + r.w; px++) g.dot(px, py, c); };
  if (style === 'strip' && windows.length) {
    const a = windows[0], b = windows[windows.length - 1], all = { x: a.x, y: a.y, w: b.x + b.w - a.x, h: a.h };
    rect({ x: all.x - 1, y: all.y - 1, w: all.w + 2, h: all.h + 2 }, ink);
    rect(all, face);
    for (let i = 1; i < windows.length; i++) {
      const left = windows[i - 1].x + windows[i - 1].w, right = windows[i].x;
      if (i !== colon) for (let px = left; px < right; px++) rect({ x: px, y: all.y, w: 1, h: all.h }, dark);
    }
    for (const r of windows) text.push({ ...r });
  } else for (const r of windows) {
    rect({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, ink);
    rect(r, face);
    if (style === 'drum') {
      rect({ x: r.x, y: r.y, w: r.w, h: 1 }, dark);
      rect({ x: r.x, y: r.y + r.h - 1, w: r.w, h: 1 }, dark);
      text.push({ x: r.x, y: r.y + 1, w: r.w, h: r.h - 2 });
    } else text.push({ ...r });
  }
  return { windows, text, edge: { x: x + Math.floor(w / 2), y: y + 1 }, case: { x, y, w, h } };
}

// where a digit stands at rest in a window: centred both ways
function penIn(win, ch, metrics) {
  const gw = fontGlyph(String(ch), metrics).w;
  return { x: win.x + Math.floor((win.w - gw) / 2), base: win.y + Math.floor((win.h - metrics.cap) / 2) + metrics.cap };
}

/**
 * Draws one window's digit rolling up to the next: `from` moved up by round(k x win.h) px and `to` following from below, both drawn by drawText with no outline and clipped to the window. k 0 is `from` at rest, 1 is `to` at rest.
 * Arguments: g (the Surface); win ({ x, y, w, h }, a window of counterWindows or counterPlate); from, to (digits 0 to 9); k (0..1); metrics (from fontMetrics); options { colour (the digits' colour), ink }.
 */
export function rollDigit(g, win, from, to, k, metrics, { colour, ink = INK } = {}) {
  if (!colour) throw new Error('rollDigit: needs a colour');
  const s = new Surface(g.w, g.h), shift = Math.round(clamp01(k) * win.h);
  const a = penIn(win, from, metrics), b = penIn(win, to, metrics);
  if (shift < win.h) drawText(s, String(from), a.x, a.base - shift, { metrics, colour, outline: 'none', ink });
  if (shift > 0) drawText(s, String(to), b.x, b.base - shift + win.h, { metrics, colour, outline: 'none', ink });
  for (let py = win.y; py < win.y + win.h; py++) for (let px = win.x; px < win.x + win.w; px++) { const c = s.get(px, py); if (c) g.data[py * g.w + px] = c; }
  return g;
}

/**
 * Shape test for a small clock face: a ring 1 px thick of radius r round (cx, cy) and two hands from the centre (the hour hand shorter), at angles from `hour` and `minute` (0..1 of a turn, 0 straight up, clockwise). Returns inside(px, py).
 * Arguments: cx, cy (the centre, in pixels: a pixel's centre is x + 0.5); r (the radius, 3 or more); options { hour (default 0.25: pointing right), minute (default 0: pointing up) }.
 */
export function clockIn(cx, cy, r, { hour = 0.25, minute = 0 } = {}) {
  const hand = (turn, len) => {
    const a = turn * 2 * Math.PI, ex = cx + Math.sin(a) * len, ey = cy - Math.cos(a) * len;
    return (px, py) => {
      const dx = ex - cx, dy = ey - cy, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - cx) * dx + (py - cy) * dy) / l2));
      return Math.hypot(px - (cx + dx * t), py - (cy + dy * t)) <= 0.5;
    };
  };
  const hourHand = hand(hour, Math.max(1.5, r * 0.5)), minuteHand = hand(minute, Math.max(2, r - 1.5));
  return (px, py) => {
    const d = Math.hypot(px - cx, py - cy);
    return (d > r - 1 && d <= r) || hourHand(px, py) || minuteHand(px, py) || d < 0.75;
  };
}

