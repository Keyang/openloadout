// Tones that keep a colour's hue (migration batch M4): the colour work of engine/icons-swatch.js (hueRamp, iconHued)
// as plain colour functions, so a data sprite can name them as colour rules (engine/data-rules.js COLOUR_RULES
// hueTone and hued) and the code module can go when its last code sprite does. The arithmetic is the same, step for
// step, so a redraw paints the colours the code sprite painted. Pure: Node and browser.
//
//   lightness(hex)                      CIE L* of a colour, 0 (black) to 100 (white): the lightness people see
//   hueTone(hex, tone)                  one tone of the ramp that changes only lightness: light, base, mid, dark, deep
//   hued(hex, against, gap)             the colour moved lighter or darker in its own hue until it stands apart from
//                                       its neighbours by `gap` points of lightness each (iconHued)
import { hexToRgb, rgbToHsl, hsl, INK } from './color.js';

/** The lightness people see: CIE L* of a colour, 0 (black) to 100 (white) (engine/icons-swatch.js lightness). */
export function lightness(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

// the colour at another lightness, same hue and saturation (a grey stays grey)
const atLight = (hex, l) => { const [h, s] = rgbToHsl(...hexToRgb(hex)); return hsl(h, s, Math.max(0, Math.min(1, l))); };

/** The tones of a ramp that changes only lightness (engine/icons-swatch.js hueRamp): light, base, mid, dark and deep. */
export const HUE_TONES = Object.freeze(['light', 'base', 'mid', 'dark', 'deep']);

/** One tone of the hue-keeping ramp of a colour (engine/icons-swatch.js hueRamp): tone one of HUE_TONES; base is the colour. */
export function hueTone(hex, tone) {
  const l = rgbToHsl(...hexToRgb(hex))[2];
  switch (tone) {
    case 'light': return atLight(hex, l + (1 - l) * 0.38);
    case 'mid': return atLight(hex, l * 0.84);
    case 'dark': return atLight(hex, l * 0.68);
    case 'deep': return atLight(hex, l * 0.46);
    default: return hex;
  }
}

/** A colour moved lighter or darker in its own hue by the least that parts it by `gap` L* points from each neighbour, never within 18 of the ink (engine/icons-swatch.js iconHued; gap one number or one per neighbour). */
export function hued(colour, against, gap = 20) {
  const near = [].concat(against).map(lightness), gaps = near.map((_, i) => (Array.isArray(gap) ? gap[i] ?? gap[gap.length - 1] : gap));
  const floor = lightness(INK) + 18;
  // how far short of its gaps a colour falls (0: it clears them all)
  const short = (c) => { const L = lightness(c); return Math.max(L < floor ? floor - L : 0, ...near.map((n, i) => gaps[i] - Math.abs(L - n))); };
  if (short(colour) <= 0) return colour;
  const l = rgbToHsl(...hexToRgb(colour))[2];
  let best = colour, worst = short(colour);
  for (let d = 0.01; d <= 0.7; d += 0.01) for (const c of [l + d <= 0.92 ? atLight(colour, l + d) : null, l - d >= 0.08 ? atLight(colour, l - d) : null]) {
    if (!c) continue;
    const f = short(c);
    if (f <= 0) return c;
    if (f < worst) { best = c; worst = f; }
  }
  return best;
}
