// A drop shadow cast by everything drawn on a scratch surface (added with batch K23, bundles/specs/core-sprites-3.md).
// The UI helpers that take `shadow: true` cast a fixed 2 px shadow down and to the left; a piece that needs another
// offset (a 16 px name plate that cannot spare two rows) draws itself with its shadow off on a scratch surface and
// casts it here, then the surface goes on top.
//
//   const s = new Surface(64, 16);
//   namePlate(s, 3, 1, 60, 13, { ...opt, shadow: false });
//   dropShadow(g, s, { dx: -2, dy: 1, box: { x: 1, y: 1, w: 62, h: 14 } });

import { INK } from './color.js';

/**
 * Casts the silhouette of everything drawn on `src` in ink, offset by (dx, dy), on pixels of `g` that `src` leaves empty and inside `box`, then copies `src` on top: returns g.
 * Arguments: g; src (a Surface the size of g); opt { dx (default -2: left), dy (default 2: down), ink (the shadow colour), box ({ x, y, w, h }: no shadow pixel falls outside it; default the whole surface) }.
 */
export function dropShadow(g, src, { dx = -2, dy = 2, ink = INK, box = null } = {}) {
  const b = box ?? { x: 0, y: 0, w: g.w, h: g.h };
  for (let i = 0; i < src.data.length; i++) {
    if (!src.data[i]) continue;
    const px = i % src.w + dx, py = (i - i % src.w) / src.w + dy;
    if (px < b.x || py < b.y || px >= b.x + b.w || py >= b.y + b.h || src.get(px, py)) continue;
    g.dot(px, py, ink);
  }
  return g.blit(src);
}
