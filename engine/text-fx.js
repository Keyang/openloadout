// Text effects (added with sprite batch K24, bundles/specs/core-sprites-3.md, ui-word-pop): a glint band that runs
// across a line of pixel-font text, and where each character of a line sits, for words that drop in letter by
// letter, shine and break into sparkles. Works with engine/pixel-font.js; pure shape tests and numbers, no drawing.
//
//   import { textSweepIn, glyphSpots } from '../engine/text-fx.js';
//
//   drawText(g, 'CLEAR', x, base, { metrics: m, colour: p.body, outline: 'rimmed', edge: p.edge });
//   g.fill(x, 0, x + w, g.h, textSweepIn('CLEAR', m, x, base, at), '#ffffff');      // a 2 px glint at column `at`
//   for (const s of glyphSpots('CLEAR', m)) twinkle(g, x + s.cx, base + s.cy, 1, p.glow);   // a sparkle per letter

import { fontGlyph, textBody } from './pixel-font.js';

/**
 * A shape test true on the body pixels of a line of text (as textBody lays it out, pen point at x on baseline base) that lie in a band `width` px wide leaning right as it rises: a glint running across a word.
 * Arguments: text; metrics (from fontMetrics); x, base; at (the band's first column, counted from x on the line's top row); options { width (default 2), slant (columns the band leans per row, default 0.5), offsets (whole-pixel rises per character, as drawText), track }.
 */
export function textSweepIn(text, metrics, x, base, at, { width = 2, slant = 0.5, offsets, track } = {}) {
  const tb = textBody(text, metrics, track === undefined ? {} : { track });
  const top = Math.round(base) - tb.rise, x0 = Math.round(x);
  const chars = [...text];
  // which character owns each column, so a raised character is tested at its own height
  const owner = new Int16Array(tb.w).fill(-1);
  chars.forEach((ch, i) => {
    if (ch === ' ') return;
    const w = fontGlyph(ch, metrics).w;
    for (let c = tb.advances[i]; c < tb.advances[i] + w && c < tb.w; c++) owner[c] = i;
  });
  return (px, py) => {
    const cx = Math.floor(px) - x0;
    if (cx < 0 || cx >= tb.w) return false;
    const i = owner[cx], rise = i >= 0 && offsets ? Math.round(offsets[i] ?? 0) : 0;
    const cy = Math.floor(py) - top + rise;
    if (cy < 0 || cy >= tb.h || !tb.body.at(cx, cy)) return false;
    const k = cx + Math.floor(cy * slant);
    return k >= at && k < at + width;
  };
}

/**
 * Where each character of a line sits, spaces skipped: [{ ch, index (in the text), x (pen point from the line's start), w, rise, cx, cy (its middle: cx from the line's start, cy from the baseline, negative up) }].
 * Arguments: text; metrics (from fontMetrics); options { track }.
 */
export function glyphSpots(text, metrics, { track } = {}) {
  const tb = textBody(text, metrics, track === undefined ? {} : { track });
  const out = [];
  [...text].forEach((ch, i) => {
    if (ch === ' ') return;
    const gl = fontGlyph(ch, metrics);
    out.push({ ch, index: i, x: tb.advances[i], w: gl.w, rise: gl.rise, cx: tb.advances[i] + (gl.w - 1) / 2, cy: -(gl.rise + 1) / 2 });
  });
  return out;
}
