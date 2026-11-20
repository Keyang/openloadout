// Box records of redrawn library sprites that are not pixel-exact (migration batch M1, second review; the exact ones
// have pixel records, tests/helpers/redraw-pixels.mjs). Over the same cases as a pixel record, a box record holds the
// box each frame of the code sprite drew, packed as four characters (x0, y0, x1, y1, each one of BOX_DIGITS; '----' for
// a frame that draws nothing), and optionally its frame hashes; tests/unit/library-redraws-boxes.test.mjs holds the
// data redraw to them.
//
//   caseBox(sprite, c)        { box, hash } of one case, drawn as the site draws it (box null when nothing is drawn)
//   packBoxes(boxes)          the record's text for a list of boxes; readBoxes(text) the list again
//   boxShift(a, b)            how far two boxes are apart: the largest move of any side, in pixels (99 when one is empty)
//   touchesEdge(box, size)    does a box reach the frame's edge (a clipped drawing)
// Node and browser alike (no imports beyond engine/sprite.js and redraw-pixels.mjs).
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';
import { frameHash } from './redraw-pixels.mjs';

/** The digits a box coordinate is written in: 0 to 61, so frames up to 62 pixels across. */
export const BOX_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The box of the drawn pixels of an image { w, h, data }: { x0, y0, x1, y1 } inclusive, or null when it is empty. */
export function imageBox(img) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!(img.data[y * img.w + x] >>> 24)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** One case of a sprite (redrawCases): its box and its frame hash, at its settings cleaned and filled with defaults. */
export function caseBox(sprite, c) {
  const img = renderPixels(sprite, c.clip, c.frame, cleanParams(sprite, { ...defaultParams(sprite), ...c.params }));
  return { box: imageBox(img), hash: frameHash(img) };
}

/** A list of boxes as a record's text: four BOX_DIGITS a box, '----' for an empty one. */
export function packBoxes(boxes) {
  return boxes.map((b) => {
    if (!b) return '----';
    const v = [b.x0, b.y0, b.x1, b.y1];
    if (v.some((n) => !Number.isInteger(n) || n < 0 || n >= BOX_DIGITS.length)) throw new Error(`a box ${JSON.stringify(b)} does not fit the record's digits`);
    return v.map((n) => BOX_DIGITS[n]).join('');
  }).join('');
}

/** The boxes of a record's text (packBoxes), in order. */
export function readBoxes(text) {
  const out = [];
  for (let i = 0; i < text.length; i += 4) {
    const s = text.slice(i, i + 4);
    if (s === '----') { out.push(null); continue; }
    const [x0, y0, x1, y1] = [...s].map((ch) => BOX_DIGITS.indexOf(ch));
    out.push({ x0, y0, x1, y1 });
  }
  return out;
}

/** The largest move of any side between two boxes, in pixels; 0 when both are empty, 99 when only one is. */
export function boxShift(a, b) {
  if (!a || !b) return a || b ? 99 : 0;
  return Math.max(Math.abs(a.x0 - b.x0), Math.abs(a.y0 - b.y0), Math.abs(a.x1 - b.x1), Math.abs(a.y1 - b.y1));
}

/** Does a box reach the edge of a frame [w, h] (row or column 0, or the last one): a drawing that may be clipped. */
export const touchesEdge = (box, [w, h]) => !!box && (box.x0 <= 0 || box.y0 <= 0 || box.x1 >= w - 1 || box.y1 >= h - 1);
