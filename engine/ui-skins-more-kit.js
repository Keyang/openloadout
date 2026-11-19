// Fitting a flat piece for the skins of engine/ui-skins-more.js (added with batch K25, bundles/specs/core-sprites-3.md):
// two steps the menu-kit sprites of the neon, crystal and grove skins share, that the flat helpers and moreSkinMarks
// do not take care of themselves.
//
//   const out = skinButton(g, 1, 1, 94, 30, clip, 'flat', { ...look, style: base.style, cornerPx: 0, borderPx: 2 });
//   if (want3) thickenBand(g, out.body, { skip: [out.text] });        // a 3 px band where the flat helper stops at 2
//   roundSlab(g, out.body, moreSkinCuts(skin, p.corner), { below: LIP, bottomCuts });
//   const m = moreSkinButtonMarks(g, out.body, skin, p.style, { piece: 'button', ...same options as moreSkinMarks });
//
// thickenBand    skinButton and skinTab draw a band of at most 2 px; skinPanel and skinBarHousing go to 3. This
//                grows the band of a flat piece by one ring inwards (over the face), so a button's Border can reach
//                the panel's 3 px. The ink, the outline style's gap between the ink and the band, and every
//                rectangle of `skip` are left alone; every side grows the same, so the piece still stretches.
// moreSkinButtonMarks  a button standing on its lip has its body's bottom line drawn in the lip's colour, not ink.
//                moreSkinMarks measures every ring from the ink inwards, so on that side it would find no ink and
//                draw no core, glow, bevel or second tube. This inks that line while the marks are made and puts
//                the lip's colour back after, so the bottom side gets the same rings as the top.
// moreSkinHeading  the flat panel's heading line is 2 px of its accent, which these skins do not use; a sprite draws
//                the panel without a heading, makes the marks, then paints the strip and a rule of its own colours
//                (neon: a 3 px tube line) over the face inside the rings.

import { col, INK } from './color.js';
import { desaturate } from './ui.js';
import { moreSkinMarks } from './ui-skins-more.js';

const inRects = (rects, px, py) => rects.some((r) => r && px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);

/**
 * Grows the band of a flat piece already drawn in `body` by one ring inwards over its face, the ink, the outline style's gap and `skip` untouched: returns the number of pixels painted.
 * Arguments: g; body ({ x, y, w, h }: the piece's slab); opt { skip (rectangles never painted, such as text areas), ink (default INK; its grey is also taken as ink) }.
 */
export function thickenBand(g, body, { skip = [], ink = INK } = {}) {
  const inks = new Set([col(ink), col(desaturate(ink))]);
  const get = (px, py) => (px < body.x || py < body.y || px >= body.x + body.w || py >= body.y + body.h ? 0 : g.get(px, py));
  const mx = body.x + (body.w >> 1);
  const face = get(mx, body.y + (body.h >> 1));
  // the band: down the middle column from the top, the first colour that is neither ink nor the face
  let band = 0;
  for (let py = body.y; py < body.y + body.h && !band; py++) { const c = get(mx, py); if (c && !inks.has(c) && c !== face) band = c; }
  if (!band || !face) return 0;
  const n4 = (px, py) => [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]];
  const paint = [];
  for (let py = body.y; py < body.y + body.h; py++) for (let px = body.x; px < body.x + body.w; px++) {
    if (get(px, py) !== face || inRects(skip, px, py)) continue;
    const near = n4(px, py).map(([x, y]) => get(x, y));
    // next to the band, and not next to ink or the outside (that pixel is the outline style's gap)
    if (near.includes(band) && !near.some((c) => !c || inks.has(c))) paint.push([px, py]);
  }
  for (const [px, py] of paint) g.data[py * g.w + px] = band;
  return paint.length;
}

/**
 * Runs moreSkinMarks on a button that stands on its lip, its body's bottom line (drawn in the lip's colour) inked while the marks are made and given back after: returns what moreSkinMarks returns.
 * Arguments: g; body (the button's slab, the lip below it; its top line is taken as the ink); skin; style; opt (exactly moreSkinMarks' options).
 */
export function moreSkinButtonMarks(g, body, skin, style, opt = {}) {
  const row = body.y + body.h - 1, mx = body.x + (body.w >> 1);
  const inkC = g.get(mx, body.y);   // the body's top line: the ink as drawn (grey when disabled)
  const lined = [];
  if (row + 1 < g.h && row >= 0) {
    const lipC = g.get(mx, row);
    // the line is the lip's colour where the pixel under it is the lip too and the one above is not
    if (lipC && lipC !== inkC && g.get(mx, row + 1) === lipC) {
      for (let px = body.x; px < body.x + body.w; px++) if (g.get(px, row) === lipC && g.get(px, row - 1) !== lipC) { lined.push(px); g.data[row * g.w + px] = inkC; }
    }
    const out = moreSkinMarks(g, body, skin, style, opt);
    for (const px of lined) g.data[row * g.w + px] = lipC;
    return out;
  }
  return moreSkinMarks(g, body, skin, style, opt);
}

/**
 * Paints a heading strip across the top of a marked panel's flat face, under a rule of one or more rows, over the run of face pixels through each row's middle (rings, marks and an outline gap kept): returns { title, inner }, the strip's text area and the face left under the rule.
 * Arguments: g; body (the panel's slab); inner (the flat face, as moreSkinMarks returns it); rows (the strip's height); opt { strip (its colour), rule (a list of colours, one per row under the strip) }.
 */
export function moreSkinHeading(g, body, inner, rows, { strip, rule = [] } = {}) {
  const face = g.get(inner.x + (inner.w >> 1), inner.y + (inner.h >> 1));
  // the run of face pixels through the middle of the row: the face inside the rings, never a gap outside the band
  const mx = inner.x + (inner.w >> 1);
  const paint = (py, c) => {
    if (g.get(mx, py) !== face) return;
    let a = mx, b = mx;
    while (a > body.x && g.get(a - 1, py) === face) a--;
    while (b < body.x + body.w - 1 && g.get(b + 1, py) === face) b++;
    for (let px = a; px <= b; px++) g.data[py * g.w + px] = col(c);
  };
  for (let i = 0; i < rows; i++) paint(inner.y + i, strip);
  rule.forEach((c, i) => paint(inner.y + rows + i, c));
  const used = rows + rule.length;
  return { title: { x: inner.x, y: inner.y, w: inner.w, h: rows }, inner: { ...inner, y: inner.y + used, h: inner.h - used } };
}
