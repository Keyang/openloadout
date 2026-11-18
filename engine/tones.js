// Tone rules shared by the body rigs: which tone of a colour a thin thing is painted in so that it can be told, by
// how light it is, from what lies under it. Pure functions: they run in Node and in the browser.
//
//   import { bandTone } from '../engine/tones.js';
//   const under = [];                                             // what is already drawn where the belt will go
//   for (let x = x0; x < x0 + wide; x++) under.push(g.get(x, y));
//   g.rect(x0, y, wide, 1, bandTone(colour, under));

import { ramp, hexToRgb, INK } from './color.js';

const INK_RGB = hexToRgb(INK);
// how light a colour is, 0..1: of a '#rrggbb', or of a pixel as a Surface holds it (null for an empty pixel and for the outline)
const lightOf = (c) => {
  if (typeof c === 'string') { const [r, g, b] = hexToRgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  if (!(c >>> 24)) return null;
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return r === INK_RGB[0] && g === INK_RGB[1] && b === INK_RGB[2] ? null : (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/**
 * Returns the tone of a colour that a thin band on cloth (a belt, a strap, a sash) is painted in, so that it stands clear of the cloth under it: its shadow tone, as a belt is painted by habit, unless that lands within `least` in brightness of the cloth; then whichever of its three tones (shadow, the colour itself, light) is furthest from the cloth, so that the two stay apart under a whole-bundle look that squeezes colours together.
 * Arguments: colour (a '#rrggbb', or a ramp); under (what it lies on: a '#rrggbb', a list of them, or the pixels already drawn there as Surface.get() returns them, where empty pixels and the outline do not count: the commonest colour among them is the cloth); least (the smallest difference in brightness, 0 to 1, that counts as clear; default 0.12).
 */
export function bandTone(colour, under, least = 0.12) {
  const c = typeof colour === 'string' ? ramp(colour) : colour, tones = [c.dark, c.base, c.light];
  const list = (Array.isArray(under) || ArrayBuffer.isView(under) ? Array.from(under) : [under]);
  let cloth;
  if (list.some((u) => typeof u === 'number')) {
    // pixels: the cloth is the colour most of them have
    const count = new Map();
    for (const u of list) if (typeof u === 'number' && lightOf(u) !== null) count.set(u, (count.get(u) ?? 0) + 1);
    const most = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    cloth = most ? [lightOf(most[0])] : [];
  } else cloth = list.map(lightOf);
  if (!cloth.length) return c.dark;
  const spare = (t) => Math.min(...cloth.map((b) => Math.abs(lightOf(t) - b)));      // how far the tone is from the nearest cloth
  if (spare(c.dark) >= least - 1e-9) return c.dark;
  let best = c.dark;
  for (const t of tones) if (spare(t) > spare(best) + 1e-9) best = t;
  return best;
}
