// PORT (migration batch E2): a copy of engine/fx-trails.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/fx-trails.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Trails of light (style guide sections 2 and 14): a 1 px line with a bright head that steps down through darker
// colours to its tail, so it reads as something moving the way its head points: a wind streak, a comet's wake, a
// shooting star, a spark's trail. `streaks` in engine/fx.js colours a whole line one step; this grades along it.
// Light only: draw it after g.outline; no ink. Hard pixel edges, no Math.random, and it keeps to the frame's 1 px
// empty border (or to `box`).
//
//   import { taperLine } from '../engine/fx-trails.js';
//   taperLine(g, 40, 30, PI / 2, 14, [tone(p.core, 0.5), p.core, tone(p.core, -0.8)]);   // a streak blowing right
//
// Angles use the rig convention (0 = down, PI / 2 = right, PI = up): the way the head points.

import { col } from '../colour.js';

/**
 * A 1 px line whose head at (x, y) points along `angle` and whose tail runs back `length` px, its colour stepping down from the first colour at the head to the last at the tail.
 * Arguments: g (the Surface); x, y (the head); angle (the way it points: 0 = down, PI / 2 = right, PI = up); length (px, at least 1); colours (a list, brightest first); options { box ([x0, y0, x1, y1], default the frame less its 1 px border) }.
 */
export function taperLine(g, x, y, angle, length, colours, { box } = {}) {
  const B = box ?? [1, 1, g.w - 1, g.h - 1];
  const C = (Array.isArray(colours) ? colours : [colours]).map((c) => g.table.id(c));   // HAND CHANGE (E2): col(c) packs a colour; on a paint-ref grid a pixel holds its paint's cell in the grid's table
  const L = Math.max(1, Math.round(length)), n = C.length;
  const ux = Math.sin(angle), uy = Math.cos(angle);
  for (let j = 0; j < L; j++) {
    const px = Math.floor(x - ux * j + 0.5), py = Math.floor(y - uy * j + 0.5);
    if (px < B[0] || py < B[1] || px >= B[2] || py >= B[3]) continue;
    const k = Math.min(n - 1, Math.floor((j * n) / L));
    g.data[py * g.w + px] = C[k];
  }
}
