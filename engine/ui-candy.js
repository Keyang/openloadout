// Candy marks (added with batch K12, bundles/specs/core-sprites-2.md): the jelly, striped and frosted styles of the
// `candy` skin of engine/ui-skins.js, drawn over a piece that module has already drawn, plus a highlight glint on its
// face. skinPanel and skinButton draw only a faint version of each style (the stripes in bandDark on a pale rim,
// one or two drip pixels), and the small pieces (a bar housing, a slider rail, a switch) draw none: use this after
// the helper, on the piece's own box, so a candy style reads on every piece of a candy sprite.
//
//   const out = skinButton(g, 1, 1, 94, 30, clip, 'candy', { face: p.face, frame: p.frame, style: p.style });
//   candyMarks(g, out.body.x, out.body.y, out.body.w, out.body.h, p.style, { frame: p.frame, stripe: p.face, keep: { x: 8, y: 8, w: 80, h: 16 }, shine: p.shine });
//
// It only recolours pixels already drawn inside the box (it never adds one). It tells the rim from the rest by
// colour: the band tones skinTones('candy', { frame, state }) gives; ink is INK; everything else drawn is "inside"
// (the face, a trough, a track).
//   jelly    the first inside row under the top ink lit (the colour under it, tone +0.45): a glossy band. Pass
//            gloss: false on a piece the helper glosses already (skinPanel, skinButton, skinCheck, skinRadio in jelly)
//   striped  stripes of `stripe` across the rim, 3 px apart on the diagonal ((x + y) % 3 === 0), in the corners only
//   frosted  the whole top rim iced (its band tones turned to the light tone), and icing drips hanging from it over
//            the ink line onto the inside, three in each top corner
//   shine    (any style) a glint of white and the inside's light tone on the inside of the top right corner
// `keep` is the stretched middle ({ x, y, w, h }, as a nine-slice would repeat it): stripes, drips and the glint stay
// outside both its columns and its rows; the gloss and the icing run the whole width, the same in every column, so
// the piece still stretches sideways (the icing stays above `keep`'s rows too).

import { tone, col, INK } from './color.js';
import { desaturate } from './ui.js';
import { skinTones } from './ui-skins.js';

/** The candy styles candyMarks knows: jelly, striped and frosted. No arguments: a frozen list. */
export const CANDY_MARK_STYLES = Object.freeze(['jelly', 'striped', 'frosted']);

const hexOf = (v) => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('');

/**
 * Adds the jelly gloss, the rim stripes or the icing and drips of the candy skin, and optionally a glint, to a piece already drawn in (x, y, w, h), recolouring only its drawn pixels.
 * Arguments: g; x, y, w, h (the piece's box); style ('jelly', 'striped' or 'frosted'); opt { frame (the rim colour the piece was drawn with), state (as skinTones), stripe (colour of the stripes), keep ({ x, y, w, h }: the stretched middle), shine (a glint), gloss (jelly: default true), ink }.
 */
export function candyMarks(g, x, y, w, h, style, { frame, state = 'normal', stripe, keep = null, skip = [], shine = false, gloss = true, ink = INK } = {}) {
  if (!CANDY_MARK_STYLES.includes(style)) throw new Error(`candyMarks: style "${style}" is not one of ${CANDY_MARK_STYLES.join(', ')}`);
  const T = skinTones('candy', { frame, state }), off = state === 'disabled';
  const grey = (c) => (off ? desaturate(c) : c);
  const rimSet = new Set([T.band, T.bandLight, T.bandDark].map(col)), inkC = col(off ? desaturate(ink) : ink);
  const x1 = Math.min(g.w, x + w), y1 = Math.min(g.h, y + h);
  const inBox = (px, py) => px >= Math.max(0, x) && px < x1 && py >= Math.max(0, y) && py < y1;
  const at = (px, py) => (inBox(px, py) ? g.data[py * g.w + px] : 0);
  const isRim = (px, py) => rimSet.has(at(px, py));
  const isInk = (px, py) => at(px, py) === inkC;
  const isInside = (px, py) => { const v = at(px, py); return !!v && v !== inkC && !rimSet.has(v); };
  const corner = (px, py) => !keep || ((px < keep.x || px >= keep.x + keep.w) && (py < keep.y || py >= keep.y + keep.h));
  const skipped = (px, py) => skip.some((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
  const set = (px, py, c) => { if (!skipped(px, py)) g.data[py * g.w + px] = col(c); };
  // the top rim's depth, measured down the middle column: how many rim rows lie under the top ink
  const mid = x + (w >> 1);
  let top = y; while (top < y1 && !isRim(mid, top)) top++;
  let depth = 0; while (isRim(mid, top + depth)) depth++;

  if (style === 'jelly' && gloss) {
    for (let px = x; px < x1; px++) {
      let py = y; while (py < y1 && !isInside(px, py)) py++;
      if (py >= y1 || py > y + (h >> 1) || !(isInk(px, py - 1) || isRim(px, py - 1))) continue;
      const under = isInside(px, py + 1) ? at(px, py + 1) : at(px, py);
      set(px, py, tone(hexOf(under), 0.45));
    }
  }
  if (style === 'striped') {
    const s = grey(stripe ?? tone(T.band, -1.5));
    for (let py = y; py < y1; py++) for (let px = x; px < x1; px++) if ((px + py) % 3 === 0 && isRim(px, py) && corner(px, py)) set(px, py, s);
  }
  if (style === 'frosted' && depth) {
    const icing = T.bandLight;
    // the icing: in every column, the first rim run from the top, at most the top rim's depth deep
    for (let px = x; px < x1; px++) {
      let py = y; while (py < y1 && !isRim(px, py)) { if (isInside(px, py)) { py = y1; break; } py++; }
      for (let k = 0; k < depth && py + k < y1 && isRim(px, py + k); k++) if (!keep || py + k < keep.y || py + k >= keep.y + keep.h) set(px, py + k, icing);
    }
    // the drips: from under the icing, over the ink line, down onto the inside
    const drips = [[4, 2], [5, 3], [7, 1]];
    for (const [cx, sx] of [[x, 1], [x1 - 1, -1]]) drips.forEach(([u, len], i) => {
      const px = cx + sx * u, n = sx > 0 ? len : drips[(i + 1) % drips.length][1];
      let py = y; while (py < y1 && !isRim(px, py)) py++;
      while (py < y1 && isRim(px, py)) py++;
      for (let k = 0; k < n && py + k < y1; k++) if (at(px, py + k) && !isRim(px, py + k) && corner(px, py + k)) set(px, py + k, icing);
    });
  }
  if (shine && !off) {
    // the glint: on the inside pixel nearest the top right corner, outside the stretched middle
    let best = null;
    for (let py = y; py < y1; py++) for (let px = x1 - 1; px >= x; px--) if (isInside(px, py) && corner(px, py) && (!best || px - py > best[0] - best[1])) best = [px, py];
    if (best) {
      const [gx, gy] = best, light = tone(hexOf(at(gx, gy + 1) || at(gx, gy)), 0.85);
      for (const [dx, dy, c] of [[0, 0, '#ffffff'], [-1, 0, '#ffffff'], [0, 1, '#ffffff'], [-2, 0, light], [-1, 1, light], [0, 2, light]]) {
        const px = gx + dx, py = gy + dy;
        if (isInside(px, py) && corner(px, py)) set(px, py, c);
      }
    }
  }
  return g;
}
