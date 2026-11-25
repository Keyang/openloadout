// The flat style (Contract 12): the sprite's draw list drawn as vector shapes by engine/vector.js (solid fills, one cel
// shadow, a round outline, smooth edges), at FLAT_SCALE times the frame unless the caller asks for another size
// (renderFrame's `scale`). toGrid gives the frame-size grid of a finished picture: what the quality bar reads.
// Left out by design: dither (a texture of single pixels). Pure; no DOM.

import { Surface } from './surface.js';
import { pack } from './color.js';
import { VectorSurface, finishVector } from './vector.js';

/** Picture pixels a frame pixel, unless the caller asks for another size. */
export const FLAT_SCALE = 4;

/** A new flat frame: it records the list drawList is given. */
export const flatSurface = (w, h) => new VectorSurface(w, h);

/** The finished picture of a flat frame: context.scale (renderFrame's scale) or FLAT_SCALE picture pixels a frame pixel. */
export const finishFlat = (g, context = {}) => finishVector(g, Number.isInteger(context.scale) && context.scale >= 1 ? context.scale : FLAT_SCALE);

/**
 * The frame-size grid of a finished flat picture: a pixel is drawn where the picture covers more than half of it, in the
 * colour that covers most of it (never a blend, so the grid has the colours the sprite was drawn with).
 */
export function toGrid(g) {
  const { w, h } = g.flat ?? { w: Math.round(g.w / FLAT_SCALE), h: Math.round(g.h / FLAT_SCALE) };
  const k = g.w / w, out = new Surface(w, h), seen = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    seen.clear();
    let alpha = 0, best = 0, bestN = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const v = g.data[(y * k + j) * g.w + x * k + i], a = v >>> 24;
      alpha += a;
      if (a < 200) continue;
      const n = (seen.get(v) ?? 0) + 1;
      seen.set(v, n);
      if (n > bestN) { bestN = n; best = v; }
    }
    if (alpha * 2 >= 255 * k * k && bestN) out.data[y * w + x] = pack(best & 255, (best >> 8) & 255, (best >> 16) & 255);
  }
  return out;
}
