// engine/surface.js as migration batch E2's ported helpers see it: engine/gen/ports/surface.js (the paint-ref grid
// under the name Surface, and the site's pure shape tests) plus the two copy helpers the E2 effects use, cropped and
// masked, made on the same paint table (PortSurface.blank) so the copy keeps its paints. Pure; Node and browser.
export { Surface, ellipseIn, polyIn, rectIn, capsuleIn } from '../surface.js';

/** engine/surface.js cropped on a paint-ref grid: a copy of src keeping only the pixels inside the box x0 <= x < x1, y0 <= y < y1, each where it was. Arguments: src, x0, y0, x1, y1. */
export function cropped(src, x0, y0, x1, y1) {
  const out = src.blank(src.w, src.h);
  out.shadow = src.shadow;
  const ax = Math.max(0, Math.floor(x0)), ay = Math.max(0, Math.floor(y0)), bx = Math.min(src.w, Math.floor(x1)), by = Math.min(src.h, Math.floor(y1));
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) out.data[y * src.w + x] = src.data[y * src.w + x];
  return out;
}

/** engine/surface.js masked on a paint-ref grid: a copy of src keeping only the pixels a shape test allows, each where it was. Arguments: src, inside. */
export function masked(src, inside) {
  const out = src.blank(src.w, src.h);
  out.shadow = src.shadow;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.data[y * src.w + x];
    if (c && inside(x + 0.5, y + 0.5)) out.data[y * src.w + x] = c;
  }
  return out;
}
