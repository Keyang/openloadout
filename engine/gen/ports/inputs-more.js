// PORT (migration batch M9): a copy of engine/inputs-more.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/inputs-more.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// More for input pictures, beside engine/inputs.js (core-sprites-2, batch K15): the lit rim of a key's top face, and
// the short rays that say "click" next to a mouse button.
//
// keyBevel repaints the top face keyCap drew (it never adds a pixel): a 1 px light row along the top and the right
// edge (the light comes from the top right) and a 1 px shaded row along the bottom, where the face meets its side.
// It stays outside keyCap's `text` area, so that area keeps the one flat colour a game prints its letter on.
// clickRays is light: draw it after g.outline(INK), as motionMarks is drawn.
//
//   import { keyCap, mouseBody } from '../engine/inputs.js';
//   import { keyBevel, clickRays } from '../engine/inputs-more.js';
//   const { top } = keyCap(g, 4, 5, 24, 22, { top: p.body, side: p.frame, corner: p.corner, depth: 2 });
//   keyBevel(g, top, { colour: p.body, corner: p.corner });
//   g.outline(INK);
//   clickRays(g, 8, 6, { side: 'left', len: 3, colour: p.glow, phase: 0.5 });

import { ramp } from './colour.js';

// keyCap's top face: a rectangle with its corners cut round to radius r, tested at pixel centres
const roundRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  if (r <= 0) return true;
  const qx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const qy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  return (px - qx) ** 2 + (py - qy) ** 2 <= r * r;
};

/**
 * Lights the top and right edge of a key's top face and shades its bottom edge, 1 px each, leaving the flat middle (keyCap's text area) untouched.
 * Arguments: g, top (the `top` box keyCap returns, { x, y, w, h }), o: { colour (the top face's colour, as given to keyCap), corner (0 square .. 1 round, as given to keyCap; 0.5) }.
 */
export function keyBevel(g, top, { colour, corner = 0.5 } = {}) {
  const { x, y, w, h } = top;
  const r = Math.max(0, Math.min(1, corner)) * Math.min(6, Math.min(w, h) / 2);
  const inside = roundRect(x, y, w, h, r), R = ramp(colour);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const cx = i + 0.5, cy = j + 0.5;
    if (!inside(cx, cy)) continue;
    if (!inside(cx, cy + 1)) g.dot(i, j, R.dark);
    else if (!inside(cx, cy - 1) || !inside(cx + 1, cy)) g.dot(i, j, R.light);
  }
  return g;
}

/** The ways clickRays can fan out: left (up, up-left, left), right (its mirror) and up (up-left, up, up-right). No arguments: a frozen list. */
export const RAY_SIDES = Object.freeze(['left', 'right', 'up']);
const FANS = { left: [[0, -1], [-1, -1], [-1, 0]], right: [[0, -1], [1, -1], [1, 0]], up: [[-1, -1], [0, -1], [1, -1]] };

/**
 * Draws three short 1 px rays fanning out from beside the pixel (x, y), the "click" lines next to a pressed button; phase 0 to 1 moves them out by up to 2 px and shortens them (to 1 px each at the end).
 * Arguments: g, x, y (the pixel they fan out from, left empty), o: { side (one of RAY_SIDES; 'up'), len (px per ray; 3), gap (empty px before each ray; 1), phase (0..1; 0), colour, box ([x0, y0, x1, y1), default the surface) }.
 */
export function clickRays(g, x, y, { side = 'up', len = 3, gap = 1, phase = 0, colour = '#f2c230', box } = {}) {
  if (!RAY_SIDES.includes(side)) throw new Error(`clickRays: "${side}" is not one of ${RAY_SIDES.join(', ')}`);
  const [x0, y0, x1, y1] = box ?? [0, 0, g.w, g.h];
  const shift = Math.round(2 * Math.max(0, Math.min(1, phase))), L = Math.max(1, Math.round(len) - shift);
  x = Math.floor(x); y = Math.floor(y);
  for (const [ux, uy] of FANS[side]) for (let k = gap + shift; k < gap + shift + L; k++) {
    const px = x + ux * k, py = y + uy * k;
    if (px >= x0 && px < x1 && py >= y0 && py < y1) g.dot(px, py, colour);
  }
  return g;
}
