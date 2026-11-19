// Ellipse path: points spaced evenly along an ellipse by distance, not by angle. Things that run round a flat
// ellipse at equal steps of angle bunch up at its two ends (where the path turns) and spread out along its long
// sides, so marks round a flat ring crowd into each other at the ends and race across the middle. Spacing them by
// distance along the path keeps every gap the same and every mark moving at one on-screen speed.
//
//   import { ellipseTurn } from '../engine/ellipse-path.js';
//   const a = ellipseTurn(rx, ry, t + i / count);               // the angle for mark i, evenly spaced and looping
//   const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;  // the same point any cos/sin ellipse code uses
//
// `u` is a fraction of the way round (0 at the right end, like angle 0, going the way angles grow), so u and u + 1
// give the same angle and a loop that adds whole turns closes.

import { TAU } from './motion.js';

const STEPS = 720;
const cache = new Map();

// the running length round the ellipse at STEPS + 1 even angles, built once per (rx, ry)
function lengths(rx, ry) {
  const key = `${rx},${ry}`;
  let L = cache.get(key);
  if (L) return L;
  L = new Float64Array(STEPS + 1);
  let px = rx, py = 0;
  for (let k = 1; k <= STEPS; k++) {
    const a = (TAU * k) / STEPS, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    L[k] = L[k - 1] + Math.hypot(x - px, y - py);
    px = x; py = y;
  }
  if (cache.size > 256) cache.clear();
  cache.set(key, L);
  return L;
}

/**
 * The angle (radians, 0 to TAU) of the point a fraction u of the way round an ellipse measured by distance along it, so even steps of u give evenly spaced points; u wraps, so u and u + 1 agree.
 * Arguments: rx, ry (the ellipse's radii across and down, in px); u (the fraction of the way round by distance, 0 at angle 0, any number: only its fractional part counts).
 */
export function ellipseTurn(rx, ry, u) {
  const f = u - Math.floor(u);
  if (!(rx > 0) || !(ry > 0) || rx === ry) return TAU * f;
  const L = lengths(rx, ry), want = f * L[STEPS];
  let lo = 0, hi = STEPS;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid] <= want) lo = mid; else hi = mid; }
  const span = L[hi] - L[lo];
  return (TAU * (lo + (span > 0 ? (want - L[lo]) / span : 0))) / STEPS;
}

/**
 * The length of the way round an ellipse in px (its perimeter), measured the same way ellipseTurn measures it.
 * Arguments: rx, ry (the ellipse's radii across and down, in px).
 */
export function ellipseLength(rx, ry) {
  if (!(rx > 0) || !(ry > 0)) return 0;
  if (rx === ry) return TAU * rx;
  return lengths(rx, ry)[STEPS];
}
