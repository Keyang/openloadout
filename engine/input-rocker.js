// A round rocker direction pad, beside engine/inputs.js (core-sprites-2, batch K16): one round disc whose top carries
// four raised wedges (one per direction, split by diagonal grooves) round a shallow centre dimple, each wedge with a
// small arrow pointing out. A lit wedge takes the glow colour; a pressed one sinks 1 px below the disc's face (no side
// under it) and darkens. Lighting and pressing never change the disc's outline. Bodies only, no outline: the sprite calls
// g.outline(INK).
//
//   import { padRocker } from '../engine/input-rocker.js';
//   padRocker(g, 16, 16, { reach: 12, body: p.body, glow: p.glow, lit: ['up'], depth: 2, down });
//   g.outline(INK);

import { tone } from './color.js';

const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

// fill every pixel whose centre passes inside(px, py) within the box round (cx, cy) of half-size r
function fillRound(g, cx, cy, r, inside, c) {
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(g.h, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(g.w, Math.ceil(cx + r)); x++) if (inside(x + 0.5, y + 0.5)) g.dot(x, y, c);
  }
}

/**
 * Draws a round rocker direction pad within `reach` of (cx, cy): one disc with four raised wedges split by diagonal grooves, a centre dimple and an arrow per wedge; lit wedges glow, and with `down` they drop flush and darken.
 * Arguments: g, cx, cy, o: { reach (outer radius; 12), body (pad colour), side (the disc's side; default a darker tone of body), glow (lit wedge colour), lit (list of 'up', 'right', 'down', 'left'), depth (side px, 1 to 4; 2), down (the lit wedges press) }. Returns { arms: { up, right, down, left } } as boxes round each wedge's top, and { dimple: { cx, cy, r } }.
 */
export function padRocker(g, cx, cy, { reach = 12, body = '#8a8a9a', side, glow = '#e6c545', lit = [], depth = 2, down = false } = {}) {
  const d = Math.max(1, Math.min(4, Math.round(depth))), h2 = d / 2, R = reach - h2, r2 = R * R;
  const on = new Set(Array.isArray(lit) ? lit : [lit]);
  const sideC = side ?? tone(body, -0.8), plate = tone(body, -0.75);
  const rise = d >= 3 ? 2 : 1, ty = cy - h2;                      // the disc's top face centre; wedges stand `rise` px above it, a pressed one 1 px below
  const ro = R - 1, ri = Math.max(2, R * 0.24), groove = 1;
  // the side: the disc swept d px down, then the plate (the disc's top face, seen in the grooves and round the wedges)
  fillRound(g, cx, cy, reach, (px, py) => {
    const qy = Math.max(cy - h2, Math.min(cy + h2, py));
    return (px - cx) ** 2 + (py - qy) ** 2 <= r2;
  }, sideC);
  fillRound(g, cx, cy, reach, (px, py) => (px - cx) ** 2 + (py - ty) ** 2 <= r2, plate);
  // wedge a's top with its centre at height oy: inside the ring between ri and ro, on a's side of both diagonal grooves
  const wedge = (a, oy) => (px, py) => {
    const [ux, uy] = DIRS[a], x = px - cx, y = py - (ty + oy);
    const along = x * ux + y * uy, across = Math.abs(x * uy - y * ux), rr = Math.hypot(x, y);
    return rr >= ri && rr <= ro && along - across >= groove * Math.SQRT2;
  };
  const arms = {};
  for (const a of ['up', 'left', 'right', 'down']) {                      // the lower ones drawn last, in front
    const pressed = on.has(a) && down, oy = pressed ? 1 : -rise;
    const topC = on.has(a) ? (pressed ? tone(glow, -0.3) : glow) : body;
    // a raised wedge shows its own side: the wedge at plate height in the side colour, under its top
    if (!pressed) fillRound(g, cx, cy, reach, (px, py) => wedge(a, 0)(px, py) && (px - cx) ** 2 + (py - ty) ** 2 <= r2, sideC);
    fillRound(g, cx, cy, reach, (px, py) => wedge(a, oy)(px, py) && (px - cx) ** 2 + (py - ty) ** 2 <= r2, topC);
    // the arrow: a small triangle in the middle of the wedge, its tip pointing out
    const [ux, uy] = DIRS[a], mid = (ri + ro) / 2, mx = cx + ux * mid, my = ty + oy + uy * mid, m = Math.max(2, (ro - ri) * 0.34);
    fillRound(g, mx, my, m + 1, (px, py) => {
      const along = (px - mx) * ux + (py - my) * uy, across = Math.abs((px - mx) * uy - (py - my) * ux);
      return along >= -m * 0.5 && along <= m * 0.6 && across <= (m * 0.6 - along) * 0.9;
    }, tone(topC, -0.9));
    const lo = ri, hi = ro, w = ro * Math.SQRT1_2;
    const box = a === 'up' ? [cx - w, ty + oy - hi, 2 * w, hi - lo] : a === 'down' ? [cx - w, ty + oy + lo, 2 * w, hi - lo]
      : a === 'left' ? [cx - hi, ty + oy - w, hi - lo, 2 * w] : [cx + lo, ty + oy - w, hi - lo, 2 * w];
    arms[a] = { x: Math.floor(box[0]), y: Math.floor(box[1]), w: Math.ceil(box[2]), h: Math.ceil(box[3]) };
  }
  // the dimple: a shallow dark dish in the middle with its lower-left wall lit (light from the top right)
  const dr = Math.max(1.2, ri - 0.8);
  fillRound(g, cx, ty, dr + 1, (px, py) => (px - cx) ** 2 + (py - ty) ** 2 <= dr * dr, tone(body, -0.7));
  fillRound(g, cx, ty, dr + 1, (px, py) => (px - cx) ** 2 + (py - ty) ** 2 <= dr * dr && (px - cx) - (py - ty) <= -dr * 0.6, tone(body, 0.4));
  return { arms: { up: arms.up, right: arms.right, down: arms.down, left: arms.left }, dimple: { cx, cy: ty, r: dr } };
}
