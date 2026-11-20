// engine/surface.js as migration batch C3's ported helpers see it: engine/gen/ports/surface.js (the paint-ref grid under
// the name Surface, and the site's pure shape tests) plus the two layer helpers the scout drone's death uses, tilt and
// blitInside, word for word except that the copy tilt makes is on the same paint table (PortSurface.blank), so it keeps
// its paints. Pure; Node and browser.
export { Surface, ellipseIn, polyIn, rectIn, capsuleIn } from '../surface.js';

/** engine/surface.js tilt on a paint-ref grid: a copy of src leaned by a small angle round (px, py), made only by sliding whole rows sideways and whole columns up or down. Arguments: src, px, py, angle. */
export function tilt(src, px, py, angle) {
  // HAND CHANGE (C3): src.blank instead of new Surface, so the copy shares src's paint table
  const out = src.blank(src.w, src.h);
  out.shadow = src.shadow;
  const k = Math.tan(angle);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    // undo the column slide (things right of the point sink), then the row slide (things above it move right)
    const sy = y - Math.round((x + 0.5 - px) * k);
    const sx = x - Math.round((py - (sy + 0.5)) * k);
    const c = src.get(sx, sy);
    if (c) out.data[y * src.w + x] = c;
  }
  return out;
}

/** engine/surface.js blitInside: pastes a layer onto a grid, moved by the least whole number of pixels that keeps its picture `margin` px clear of every side; returns [dx, dy]. Arguments: g, src, margin, { dx, dy }. */
export function blitInside(g, src, margin = 2, { dx = 0, dy = 0 } = {}) {
  const b = src.bounds();
  if (!b) return [0, 0];
  const keep = (v, lo, hi) => Math.round(v < lo ? lo : v > hi ? hi : v);
  const sx = keep(dx, margin - b.x0, g.w - 1 - margin - b.x1), sy = keep(dy, margin - b.y0, g.h - 1 - margin - b.y1);
  g.blit(src, sx, sy);
  return [sx, sy];
}
