// engine/surface.js as creature batch C1's ports see it: engine/gen/ports/surface.js (the paint-ref grid under the name
// Surface, and the site's pure shape tests) plus blitInside, copied word for word from engine/surface.js (it only reads
// bounds and blits, so a grid of paint refs blits as one of colours; the grids share the running port's paint table).
// It is the drawing code of the creature ports (engine/gen/creature-c1.js), so it is NOT temporary. Pure; Node and browser.
export { Surface, ellipseIn, polyIn, rectIn, capsuleIn } from '../surface.js';

/** engine/surface.js blitInside: pastes a layer moved by the least whole number of pixels that keeps its picture `margin` px clear of every side of the frame; returns [dx, dy]. Arguments: g, src, margin, { dx, dy }. */
export function blitInside(g, src, margin = 2, { dx = 0, dy = 0 } = {}) {
  const b = src.bounds();
  if (!b) return [0, 0];
  const keep = (v, lo, hi) => Math.round(v < lo ? lo : v > hi ? hi : v);
  const sx = keep(dx, margin - b.x0, g.w - 1 - margin - b.x1), sy = keep(dy, margin - b.y0, g.h - 1 - margin - b.y1);
  g.blit(src, sx, sy);
  return [sx, sy];
}
