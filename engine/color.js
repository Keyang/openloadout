// Colour helpers. Colours are written as '#rrggbb' strings (in a sprite's data, and in the renderers) and
// packed to 32-bit ABGR (the byte order ImageData uses) when they hit a Surface.

const packed = new Map();

/** Pack red, green, blue and alpha (0..255 each) into the one 32-bit number a Surface stores per pixel. */
export function pack(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** '#rrggbb' (or '#rgb') -> [r, g, b], each 0..255. */
export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Red, green, blue (0..255, rounded and clamped) -> '#rrggbb'. */
export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** '#rrggbb' | packed number -> packed number. */
export function col(c) {
  if (typeof c === 'number') return c;
  let v = packed.get(c);
  if (v === undefined) {
    const [r, g, b] = hexToRgb(c);
    v = pack(r, g, b);
    packed.set(c, v);
  }
  return v;
}

/** Red, green, blue (0..255) -> [hue in degrees 0..360, saturation 0..1, lightness 0..1]. */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Hue (degrees, any number), saturation and lightness (0..1) -> [r, g, b], each 0..255 and not rounded. */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Hue (degrees), saturation and lightness (0..1) -> '#rrggbb'. */
export const hsl = (h, s, l) => rgbToHex(...hslToRgb(h, s, l));

/** Move hue `h` up to `deg` degrees toward `target` along the short way round. */
function hueToward(h, target, deg) {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < deg) return target;
  return h + Math.sign(d) * deg;
}

/** Blend two '#rrggbb' colours: t = 0 gives a, t = 1 gives b. */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/**
 * Lighten (amount > 0) or darken (amount < 0) with a pixel-art hue shift.
 * Colourfulness (chroma) is held roughly constant, so pale colours such as
 * skin get soft shadows instead of vivid ones.
 */
export function tone(hex, amount) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const grey = s < 0.08;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sat = (l1, boost) => Math.min(1, (chroma * boost) / Math.max(0.05, 1 - Math.abs(2 * l1 - 1)));
  if (amount >= 0) {
    const l1 = l + (1 - l) * 0.45 * amount;
    return hsl(grey ? h : hueToward(h, 55, 16 * amount), grey ? s : sat(l1, 1 - 0.1 * amount), l1);
  }
  const k = -amount;
  const l1 = l * (1 - 0.3 * k);
  return hsl(grey ? 250 : hueToward(h, 255, 13 * k), grey ? 0.1 * Math.min(1, k) : sat(l1, 1 + 0.1 * Math.min(1, k)), l1);
}

/**
 * Three-tone ramp from one base colour: shadows drift toward blue-violet and
 * get more saturated, highlights drift toward yellow. One user-picked colour
 * therefore always yields a usable light / base / dark set.
 */
export function ramp(hex) {
  return { isRamp: true, light: tone(hex, 0.85), base: hex, dark: tone(hex, -1), deep: tone(tone(hex, -1), -1) };
}

/** A ramp one step darker: use for limbs on the far side of the body. */
export function farRamp(hex) {
  return ramp(mix(tone(hex, -0.75), '#241a3a', 0.12));
}

/** Perceived brightness of a colour, 0 (black) to 1 (white). */
export function brightness(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Whichever of the candidates stands out most against `against`.
 * Use for eyes, teeth and markings so they stay visible on any user colour:
 *   const eye = pick(p.fur, '#ffffff', INK)
 */
export function pick(against, ...candidates) {
  const b = brightness(against);
  return candidates.reduce((best, c) => (Math.abs(brightness(c) - b) > Math.abs(brightness(best) - b) ? c : best));
}

export const INK = '#231b33'; // default outline colour

/**
 * An everyday name for a colour, for people who do not read colour codes: colorName('#f2a030') -> 'orange',
 * colorName('#1f2f6f') -> 'dark blue'. hex: '#rrggbb' or '#rgb'. Returns '' for anything that is not a colour code.
 * Lower-case words only (a page capitalises it); the same code always gives the same name.
 */
export function colorName(hex) {
  if (typeof hex !== 'string' || !/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim())) return '';
  const [h, s, l] = rgbToHsl(...hexToRgb(hex.trim()));
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  if (l >= 0.94 && chroma < 0.2) return 'white';
  if (l <= 0.07) return 'black';
  if (chroma < 0.08 || s < 0.1) return l >= 0.75 ? 'light grey' : l <= 0.22 ? 'near black' : l <= 0.38 ? 'dark grey' : 'grey';
  let base;
  if (h < 12 || h >= 345) base = 'red';
  else if (h < 42) base = 'orange';
  else if (h < 66) base = 'yellow';
  else if (h < 85) base = 'lime green';
  else if (h < 160) base = 'green';
  else if (h < 185) base = 'teal';
  else if (h < 200) base = l > 0.5 ? 'sky blue' : 'teal';
  else if (h < 258) base = 'blue';            // pure blue is hue 240 and navy too: blue runs on to blue-violet
  else if (h < 300) base = 'purple';
  else base = 'pink';
  // warm colours change name with lightness and strength: dull dark orange is brown, dull mid orange is tan,
  // pale orange is cream, dark red stays red, light red is pink, dark pink reads as purple
  if (base === 'orange' && s < 0.55 && l < 0.5) return l < 0.2 ? 'dark brown' : 'brown';
  if ((base === 'orange' || (base === 'yellow' && s < 0.6)) && l < 0.42) return l < 0.2 ? 'dark brown' : 'brown';
  if (base === 'yellow' && l < 0.32) return 'olive';
  if (base === 'lime green' && l < 0.36) return 'olive green';      // dark yellow-green reads as olive, not lime
  if ((base === 'orange' || base === 'yellow') && l > 0.8 && s < 0.9) return 'cream';
  if (base === 'orange' && s < 0.55 && l <= 0.8) return 'tan';
  if (base === 'red' && l > 0.72) return 'pink';
  if (base === 'red' && l < 0.42) return 'dark red';
  if (base === 'pink' && l < 0.36) return l < 0.3 ? 'dark purple' : 'purple';   // dark magenta and plum read as purple
  const shade = l < 0.3 ? 'dark ' : l > 0.72 ? 'light ' : '';
  const dull = !shade && s < 0.3 ? 'greyish ' : '';
  return shade + dull + base;
}
