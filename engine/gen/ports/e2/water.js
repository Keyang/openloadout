// PORT (migration batch E2): engine/water.js's wakeRing, word for word, for the rain-ripples effect port
// (engine/gen/ports/e2/fx-rain-ripples.js), drawing paint refs on an engine/gen/port-surface.js grid. It stays when
// engine/water.js goes and goes only with the last generator version that draws with it.
// TRIMMED (E2): only wakeRing is copied; the rest of engine/water.js (tiles, pads, reeds) reaches the site's tile
// rules, which a generator module may not import.
import { TAU, hash } from '../../../motion.js';

/** engine/water.js wakeRing: a broken flat ring of single pixels round (x, y), rx by ry, swelling by `grow` px over t, a share `gaps` of its 12 sectors left out by seed; `front` keeps only its near half. Arguments: g, { x, y, rx, ry, t, grow, colour, gaps, seed, front }. */
export function wakeRing(g, { x, y, rx, ry, t = 0, grow = 1, colour = '#ffffff', gaps = 0.4, seed = 0, front = false }) {
  const k = Math.round(Math.max(0, grow) * (0.5 - 0.5 * Math.cos(TAU * t)));
  const ax = rx + k, ay = ry + k, steps = Math.max(12, Math.ceil(TAU * Math.max(ax, ay) * 1.5));
  const SECT = 12;
  for (let i = 0; i < steps; i++) {
    const ang = (i / steps) * TAU;
    if (front && Math.sin(ang) < 0.1) continue;
    if (hash(Math.floor((ang / TAU) * SECT), seed * 13 + 5) < gaps) continue;
    g.dot(Math.floor(x + Math.cos(ang) * ax), Math.floor(y + Math.sin(ang) * ay), colour);
  }
  return g;
}
