// Drawing a sprite in the site's art style, for every page (the header toggle: app/art-style.js).
//
// A page asks for a frame with framePicture() and gets a canvas plus `k`, the canvas pixels a frame pixel: 1 for pixel
// art (a canvas the size of the frame, shown with crisp pixels as before), more for flat art (a vector picture drawn
// at the size it is shown, so its edges stay smooth). It then draws it with drawPicture() at the frame's size in its
// own coordinates, or sizes an element with showPicture(). Nothing here changes what a pixel page looks like.
import { renderFrame } from '../engine/sprite.js';
import { renderThemedFrame } from '../engine/theme.js';
import { artStyleOf, styleById, pixelsOf } from '../engine/styles.js';

const dpr = () => (typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1);

/** The style a sprite is shown in: the one named (when it has it), else the site's (when it has that), else its first. */
export const shownStyle = (sprite, named) => artStyleOf(sprite, named);

/**
 * Canvas pixels a frame pixel for a picture shown `zoom` CSS pixels a frame pixel: 1 for a pixel-grid style, else
 * enough for the screen (zoom x devicePixelRatio, 2 to 12, whole), and no more than 2,048 px a side for a frame `side` px (but at least 2).
 */
export function pictureScale(style, zoom = 4, side = 64) {
  const s = styleById(style);
  if (!s || !s.pictureScale || s.pictureScale <= 1) return 1;
  // a big frame (a background) is drawn no bigger than 2,048 px a side: a vector picture costs its area
  // never 1: a vector picture shown small is still drawn bigger than its grid, so it is told apart from pixel art and smoothed
  return Math.max(2, Math.min(12, Math.ceil(zoom * dpr()), Math.floor(2048 / Math.max(1, side))));
}

/** A canvas holding a Surface's pixels. */
export function surfaceCanvas(g) {
  const cv = document.createElement('canvas');
  cv.width = g.w; cv.height = g.h;
  if (g.w && g.h) cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(g.data.buffer, g.data.byteOffset, g.w * g.h * 4), g.w, g.h), 0, 0);
  return cv;
}

/**
 * One frame as a picture: { canvas, k, style, g }. options: { style (named; else the site's), zoom (CSS px a frame px
 * where it is shown, default 4), theme and record (a whole-bundle look, as renderThemedFrame takes them), grid (true:
 * always the frame-size grid, for a page that reads pixels) }. g is the Surface drawn (the grid for a pixel style).
 */
export function framePicture(sprite, clip, frame, params, { style, zoom = 4, theme = null, record, grid = false } = {}) {
  const st = shownStyle(sprite, style);
  const k = grid ? 1 : pictureScale(st, zoom, Math.max(...sprite.size));
  const opts = k > 1 ? { style: st, scale: k } : { style: st };
  let g = theme ? renderThemedFrame(sprite, clip, frame, params, theme, { ...opts, record }) : renderFrame(sprite, clip, frame, params, opts);
  if (k === 1) g = pixelsOf(g, st);
  return { canvas: surfaceCanvas(g), k: g.w / sprite.size[0], style: st, g };
}

/**
 * Draw a picture into a 2D context at (x, y), fw x fh in that context's units (the frame's size, as a pixel frame is
 * drawn), smoothing only a vector picture.
 */
export function drawPicture(ctx, pic, x, y, fw, fh) {
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = pic.k > 1;
  if (pic.k > 1) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(pic.canvas, x, y, fw, fh);
  ctx.imageSmoothingEnabled = was;
}

/**
 * Give a canvas that a page scales up with CSS (width = frame x zoom) the right look: crisp pixels for a pixel picture,
 * smooth for a vector one. el: the element; k: the picture's canvas pixels a frame pixel.
 */
export function showPicture(el, k) {
  el.style.imageRendering = k > 1 ? 'auto' : '';
  el.classList.toggle('is-vector', k > 1);
  return el;
}

/**
 * Size a scene canvas (one a page draws a whole scene on, in frame pixels) for the site's style: for flat its backing
 * store is `k` times bigger and its context scaled, so sprites drawn on it with drawPicture stay smooth; returns k.
 * cv: the canvas; w, h: its size in scene pixels; zoom: CSS px a scene pixel.
 */
export function sizeScene(cv, w, h, zoom, style = null) {
  const k = style ? pictureScale(style, zoom, Math.max(w, h)) : 1;
  cv.width = w * k; cv.height = h * k;
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;      // the scene's own pixel art stays crisp; drawPicture smooths a vector sprite
  showPicture(cv, k);
  return k;
}
