// Cloth helpers: things made of fabric that move in the wind. For now one: a flag flying from a
// pole (a checkpoint banner, a castle pennant, a ship's colours). Pure drawing on a Surface.
//
//   import { flag, FLAG_SHAPES } from '../engine/cloth.js';
//   const f = flag(g, { x: 10, y: 6, length: 18, height: 12, shape: 'swallowtail', t, amp: 2, paint: ramp(p.cloth),
//     marks: [{ inside: markIn('star', 17, 12, 7), paint: p.emblemColour }] });
//   f.at(1, 0.5)            // [x, y] of the fly end at mid height this frame, for something tied to it
//
// HOW IT WAVES. The cloth is cut into columns one pixel wide. The column at the pole (the hoist)
// never moves; every other column slides up or down by a whole number of pixels (little near
// the pole, the full `amp` at the free end) along a wave that travels from the pole outwards, so the folds run along the cloth and a loop closes
// exactly (t = 1 is t = 0). A fold facing the light (top right) takes the paint's light tone,
// one facing away its dark tone. Marks are given on the FLAT cloth and ride the folds.
// The flag has no outline: draw the pole and the flag, then g.outline(INK) once.

import { clamp, TAU } from './motion.js';

/** The flag outlines flag() can cut: banner (a rectangle), pennant (a long triangle), swallowtail (a rectangle with a notch in its free end). No arguments: a frozen list. */
export const FLAG_SHAPES = Object.freeze(['banner', 'pennant', 'swallowtail']);

/**
 * Draws a flag flying to the right from its top-left corner (x, y), with folds that travel along the cloth, and returns { offset(u), at(u, v) } so other things can follow it.
 * Arguments: g (the Surface); o: { x, y (whole numbers: the top of the hoist), length, height (px), shape (one of FLAG_SHAPES), t (clip phase 0..1), amp (px the free end moves up and down), waves (folds along the cloth, default 1.5), notch (0..1: how deep the swallowtail's cut is), paint (a colour or a ramp), marks ([{ inside(px, py), paint }]: pictures printed on the flat cloth), clip }.
 */
export function flag(g, o) {
  const { shape = 'banner', t = 0, amp = 2, waves = 1.5, notch = 0.4, paint, marks = [], clip } = o;
  if (!FLAG_SHAPES.includes(shape)) throw new Error(`cloth.flag: no shape "${shape}". Shapes: ${FLAG_SHAPES.join(', ')}`);
  const x = Math.round(o.x), y = Math.round(o.y), len = Math.max(1, Math.round(o.length)), h = Math.max(1, Math.round(o.height));
  const tones = (c) => (typeof c === 'object' ? c : { light: c, base: c, dark: c });
  const body = tones(paint);
  const grip = (u) => clamp(u) ** 1.5;                                   // held still at the pole, freest at the far end
  const turn = (u) => TAU * (waves * u - t);
  const offset = (u) => Math.round(amp * grip(u) * Math.sin(turn(u)));
  const cut = (u, v) => {
    const off = Math.abs(v - 0.5);
    if (shape === 'pennant') return off <= 0.5 * (1 - u) + 0.5 / h;
    if (shape === 'swallowtail' && u > 1 - notch) return off >= 0.5 * (u - (1 - notch)) / notch - 1 / h;
    return true;
  };
  for (let i = 0; i < len; i++) {
    const u = (i + 0.5) / len, dy = offset(u);
    // which way this column of cloth faces: falling to the right catches the light, rising hides from it
    // (the folds show all along the cloth, also near the pole where it hardly moves)
    const slope = amp >= 0.5 && i >= 2 ? Math.cos(turn(u)) : 0;
    const key = slope > 0.55 ? 'light' : slope < -0.55 ? 'dark' : 'base';
    let last = -1;
    for (let j = h - 1; j >= 0; j--) if (cut(u, (j + 0.5) / h)) { last = j; break; }
    for (let j = 0; j < h; j++) {
      if (!cut(u, (j + 0.5) / h)) continue;
      const px = x + i, py = y + j + dy;
      if (clip && !clip(px + 0.5, py + 0.5)) continue;
      let tone = body, k = key;
      for (const m of marks) if (m.inside(x + i + 0.5, y + j + 0.5)) { tone = tones(m.paint); k = key; }
      if (tone === body && (i === 0 || (j === last && h >= 6 && key !== 'dark'))) k = key === 'light' && i > 0 ? 'base' : 'dark';   // the sleeve on the pole, and the shaded lower edge
      g.dot(px, py, tone[k]);
    }
  }
  return {
    /** How many pixels the cloth is moved down at u (0 = the pole, 1 = the free end) this frame. */
    offset,
    /** The pixel [x, y] at u along and v down the waving cloth (both 0..1). */
    at: (u, v) => [x + clamp(u) * (len - 1) + (u >= 1 ? 0 : 0.5), y + clamp(v) * (h - 1) + 0.5 + offset(clamp(u))],
  };
}
