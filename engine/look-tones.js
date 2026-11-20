// Colour rules that read a colour's numbers (migration batch M9, review round 2): what the interface code sprites worked
// out from a colour, and a data sprite now names as a colour rule of engine/data-rules.js COLOUR_RULES (lifted, grey,
// ifLight). A port generator draws paint refs and cannot read a colour (engine/gen/ports/colour.js), so these are worked
// out where every colour rule is, from the settings, frame by frame.
//
//   lifted(of, against, beside)   tests/fixtures/code-sprites/ui-name-plate.js litBand: tones of `of` from itself up in steps of 0.15 (to
//                                 2.4) until one keeps 3 to 1 against `against` under every whole-bundle look and sits
//                                 0.1 or more apart in brightness from `beside`; else the first that keeps 3 to 1; else of
//   grey(of)                      engine/ui.js desaturate: the grey of the same brightness
//   ifLight(of, above, a, b)      a when engine/color.js brightness(of) is above `above`, else b
//
// Pure: no DOM, no Node, no clock, no randomness. Runs unchanged in the browser and in Node. The look colours are worked
// out on first use, not when this module loads: engine/theme.js reaches back to engine/data-rules.js, which imports this.
import { tone, brightness, hexToRgb, rgbToHex, col } from './color.js';
import { THEME_PRESETS, normalizeTheme, applyColour } from './theme.js';

let looks = null;
const memo = new Map();
// a colour as made, then as each whole-bundle look turns it (engine/ui.js underLooks)
function underLooks(hex) {
  const key = hex.toLowerCase();
  let out = memo.get(key);
  if (!out) {
    looks ??= [null, ...THEME_PRESETS.map((t) => normalizeTheme(t.theme).colour)];
    out = looks.map((c) => {
      if (!c) return key;
      const px = applyColour(new Uint32Array([col(key)]), c)[0];
      return rgbToHex(px & 255, (px >>> 8) & 255, (px >>> 16) & 255);
    });
    if (memo.size > 4096) memo.clear();
    memo.set(key, out);
  }
  return out;
}
// engine/ui.js contrast: the WCAG ratio of two colours
function contrast(a, b) {
  const lum = (hex) => { const [r, g, bl] = hexToRgb(hex).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The lowest contrast two colours have with each other, as made and under every whole-bundle look (engine/ui.js worstContrast). Arguments: a, b ('#rrggbb'). */
export function worstLookContrast(a, b) {
  const A = underLooks(a), B = underLooks(b);
  let least = Infinity;
  for (let i = 0; i < A.length; i++) least = Math.min(least, contrast(A[i], B[i]));
  return least;
}

/** The `lifted` colour rule: `of` lifted (lighter, same hue) until it keeps 3 to 1 against `against` under every look and sits 0.1 in brightness from `beside` (tests/fixtures/code-sprites/ui-name-plate.js litBand). Arguments: of, against, beside ('#rrggbb'). */
export function lifted(of, against, beside) {
  let fallback = null;
  for (let t = 0; t <= 2.4; t += 0.15) {
    const c = tone(of, t);
    if (worstLookContrast(c, against) < 3) continue;
    fallback ??= c;
    if (Math.abs(brightness(c) - brightness(beside)) >= 0.1) return c;
  }
  return fallback ?? of;
}

/** The `grey` colour rule: the grey of the same brightness (engine/ui.js desaturate, a disabled button or card). Arguments: of ('#rrggbb'). */
export function grey(of) {
  const v = Math.round(brightness(of) * 255);
  return rgbToHex(v, v, v);
}

/** The `ifLight` colour rule: `then` when brightness(of) is above `above` (strictly), else `otherwise`. Arguments: of ('#rrggbb'), above (0..1), then, otherwise. */
export function ifLight(of, above, then, otherwise) {
  return brightness(of) > above ? then : otherwise;
}
