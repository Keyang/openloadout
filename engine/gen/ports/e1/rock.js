// PORT (build item E1): engine/rock.js crack, word for word, for the effect ports of build item E1 (engine/gen/ports/e1/,
// the shockwave's quake cracks): it draws through the Surface's own dot, so on an engine/gen/port-surface.js grid it
// paints the paint ref it is given. It goes only with the last generator version that draws with it; never change what a
// released version draws through it.
import { hash } from '../../../motion.js';

/**
 * A hairline crack from (x, y) running `length` px along `angle` (radians; 0 down, PI / 2 right), zigzagging `jag`
 * radians either side, with one shorter branch from near its middle when `branch` and it is 7 px or longer; `clip(px,
 * py)` (pixel centres) keeps it inside a shape. Arguments: g, x, y, angle, length, colour, { seed, clip, jag, branch }.
 */
export function crack(g, x, y, angle, length, colour, { seed = 0, clip, jag = 0.7, branch = true } = {}) {
  const put = (px, py) => {
    const ix = Math.floor(px), iy = Math.floor(py);
    if (ix < 0 || iy < 0 || ix >= g.w || iy >= g.h) return;
    if (clip && !clip(ix + 0.5, iy + 0.5)) return;
    g.dot(ix, iy, colour);
  };
  const run = (sx, sy, a0, len, sd) => {
    let px = sx, py = sy, done = 0, i = 0, fork = null;
    while (done < len) {
      const seg = Math.min(len - done, 2 + Math.floor(hash(i, sd * 13 + 1) * 3));
      const a = a0 + (i % 2 ? 1 : -1) * jag * (0.5 + 0.5 * hash(i, sd * 13 + 2));
      const dx = Math.sin(a), dy = Math.cos(a), m = Math.max(Math.abs(dx), Math.abs(dy));
      const n = Math.max(1, Math.round(seg * m));
      for (let s = 0; s < n; s++) { put(px, py); px += dx / m; py += dy / m; }
      done += seg;
      if (!fork && done >= len * 0.45) fork = [px, py, a0 + (i % 2 ? -1 : 1) * 1.1];
      i++;
    }
    put(px, py);
    return fork;
  };
  const fork = run(x + 0.5, y + 0.5, angle, length, seed);
  if (branch && fork && length >= 7) run(fork[0], fork[1], fork[2], Math.max(2, Math.round(length * 0.35)), seed + 101);
  return g;
}
