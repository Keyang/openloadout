// The light on a mouse that engine/inputs.js mouseBody drew flat (core-sprites-2, batch K15, fix round 2): a 1 px
// light rim on the side the light comes from and a 1 px dark rim on the far side, on the plastic and on the lit
// button alike, so the body shows three values of its colour. It repaints only pixels mouseBody painted (it never
// adds one) and leaves the seam and the wheel alone. Light comes from where the Surface says (g.shadow; by default
// the top right, as input-key's keyBevel). Call it right after mouseBody with the same arguments, before g.outline.
//
//   import { mouseBody } from '../engine/inputs.js';
//   import { mouseLight } from '../engine/mouse-light.js';
//   const o = { w: 14, h: 19, shape: 'oval', body: p.body, lit: p.glow, button: 'left', down };
//   mouseBody(g, 16, 16, o);
//   mouseLight(g, 16, 16, o);
//   g.outline(INK);

import { tone } from './color.js';

const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The shape test of the mouse body mouseBody draws at (cx, cy), with the same size rules, and where its parts lie.
 * Arguments: cx, cy, o: { w (12 to 17; 14), h (16 to 22; 19), shape ('oval' | 'slim') }. Returns { inside(px, py), x0, y0, x1, y1, mx (the middle line), split (the first row below the buttons) }.
 */
export function mouseBodyIn(cx, cy, { w = 14, h = 19, shape = 'oval' } = {}) {
  h = clampN(Math.round(h), 16, 22); w = clampN(Math.round(w), 12, 17);
  if (shape === 'slim') w = Math.max(12, w - 2);
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2), x1 = x0 + w, y1 = y0 + h, mx = x0 + w / 2;
  const front = shape === 'slim' ? 0.85 : 0.95;
  const inside = (px, py) => {
    const v = (py - y0) / h, half = w / 2;
    if (v < 0 || v > 1) return false;
    const top = Math.min(1, Math.sqrt(Math.max(0, 1 - ((0.42 - Math.min(v, 0.42)) / 0.42) ** 2)));
    const bot = Math.min(1, Math.sqrt(Math.max(0, 1 - ((Math.max(v, 0.62) - 0.62) / 0.38) ** 2)));
    const width = half * Math.min(top, bot) * (v < 0.5 ? front + (1 - front) * (v / 0.5) : 1);
    return Math.abs(px - mx) <= width;
  };
  return { inside, x0, y0, x1, y1, mx, split: y0 + Math.round(h * 0.42) };
}

/**
 * Lights a mouse mouseBody drew: a 1 px rim in a lighter tone of its colour on the lit side and a 1 px rim in a darker tone on the far side, for the plastic and for the lit left or right button (a pressed button, `down`, keeps only its dark rim); the seam and the wheel keep their colours.
 * Arguments: g, cx, cy, o: the same options given to mouseBody ({ w, h, shape, body, lit, button, down }), plus { light (how much lighter the lit rim is, 0..1; 0.85), shade (how much darker the far rim is, 0..1; 1) }.
 */
export function mouseLight(g, cx, cy, { w = 14, h = 19, shape = 'oval', body = '#8a8a9a', lit = '#e6c545', button = 'left', down = false, light = 0.85, shade = 1 } = {}) {
  const B = mouseBodyIn(cx, cy, { w, h, shape });
  const { inside, x0, y0, x1, y1, mx, split } = B;
  const [sx, sy] = g.shadow ?? [-1, 1];
  const sides = { left: (px) => px < mx - 0.5, right: (px) => px > mx + 0.5 };
  const s = sides[button], dy = down ? 1 : 0;
  const seamCols = [Math.floor(mx - 0.5), Math.floor(mx)];
  const wx = Math.floor(mx) - 1, wy = y0 + Math.max(2, Math.round(h * 0.12));
  const tones = (c) => ({ hi: tone(c, light), lo: tone(c, -shade) });
  const plastic = tones(body), key = tones(lit);
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    if (!inside(px, py)) continue;
    if (y === split) continue;                                                    // the seam across
    if (y < split && seamCols.includes(x) && inside(mx, py)) continue;            // the seam down the middle
    if (x >= wx && x < wx + 2 && y >= wy && y < wy + 5) continue;                 // the wheel (and where it sinks to)
    const far = !inside(px + sx, py + sy), near = !inside(px - sx, py - sy);
    if (!far && !near) continue;
    let set = plastic, lightOk = true;
    if (s && s(px) && inside(px, py - dy) && py - dy < split) {
      if (down && !inside(px, py - 1)) continue;                                  // the pressed button's dark top edge
      set = key; lightOk = !down;
    }
    if (far) g.dot(x, y, set.lo);
    else if (lightOk) g.dot(x, y, set.hi);
  }
  return g;
}
