// Bundle-level customisation (architecture.md, Contract 7), the picture side.
// One theme restyles every sprite in a bundle the same way, so they keep
// matching. Colour settings are applied AFTER a frame is rendered, so they work
// on any sprite with no per-sprite work; `shapes` additionally varies each
// sprite's own controls from the theme's seed.
// Pure JavaScript: runs the same in the browser and in Node. No DOM, no files.

import { rgbToHsl, hslToRgb, hexToRgb, col, INK } from './color.js';
import { rng } from './motion.js';
import { renderFrame, cleanParams } from './sprite.js';
import { styleFor } from './styles.js';

// ---- the theme -------------------------------------------------------------

/** The neutral theme: applying it changes nothing. */
export function defaultTheme() {
  return {
    seed: 0,
    colour: { hue: 0, saturation: 1, contrast: 1, tint: null, tintAmount: 0, palette: null, outline: null },
    sound: { pitch: 0, brightness: 0 },
    music: { tempo: 1, intensity: null },
    shapes: false,
  };
}

/** A complete theme from a partial one (missing blocks and fields take their neutral values). */
export function normalizeTheme(theme = {}) {
  const d = defaultTheme();
  const t = theme || {};
  return {
    seed: Number.isFinite(t.seed) ? t.seed : d.seed,
    colour: { ...d.colour, ...(t.colour || {}) },
    sound: { ...d.sound, ...(t.sound || {}) },
    music: { ...d.music, ...(t.music || {}) },
    shapes: !!t.shapes,
  };
}

// ---- palettes ----------------------------------------------------------------
// Each runs roughly dark to light and holds a few side hues, so the parts of a
// sprite (skin, cloth, metal, outline) still land on different colours.

export const PALETTES = [
  { name: 'Sunset', colours: ['#1b1030', '#3a1846', '#63204f', '#93294f', '#c2414b', '#e3664a', '#f2934f', '#f7bd6a', '#fde3a0', '#fff6dc', '#4a3a78', '#7a5c9e', '#9a8aa8', '#cdbccb'] },
  { name: 'Frost', colours: ['#0e1428', '#1c2a4a', '#2b4470', '#3d6698', '#5a8fc0', '#7fb6dd', '#a9d6ee', '#d4eef8', '#f4fbff', '#5c5a8a', '#8b86b8', '#c3c0e0'] },
  { name: 'Forest', colours: ['#101a12', '#c8ccc0', '#2f4a24', '#43682c', '#5f8a34', '#86ad45', '#b5cf62', '#4a3424', '#6e4c2e', '#9a7046', '#c7a06a', '#e8c49a', '#f4f0d8', '#a4ac9c', '#4e6878', '#8e3a2e'] },
  { name: 'Candy', colours: ['#2a1a33', '#5a2a5e', '#9a3f86', '#d65ea8', '#f58fc4', '#fbc2de', '#fff0f6', '#5ec8b8', '#9ee8d4', '#fff2a0', '#a88ae8', '#6a5ab8', '#d8d4e8', '#e86a6a', '#fdd8bc'] },
  { name: 'Night', colours: ['#07081a', '#121a3a', '#1e2c5a', '#2d417a', '#3f5c9a', '#5a7fb8', '#85a8d2', '#c0d8ee', '#f3f0c8', '#3a2a5e', '#6a4a8a', '#9a7ab8', '#f2c86a'] },
  { name: 'Desert', colours: ['#1f140e', '#3d2617', '#63391f', '#8f5228', '#b86e34', '#d99549', '#ecbe6e', '#f6e1a6', '#fff8e6', '#a8443a', '#4e6e86', '#7aa0b8'] },
  { name: 'Toxic', colours: ['#0a120a', '#142414', '#1e3a18', '#2e5a1c', '#4a8a1a', '#78c420', '#b4f040', '#eaffa0', '#3a1a4a', '#6a2a8a', '#a85ad0', '#f0f0c0', '#8a9a88', '#c4ccb8', '#e0663a'] },
  { name: 'Mono', colours: ['#0c0c10', '#1e1e24', '#34343c', '#4e4e58', '#6a6a74', '#8a8a94', '#aaaab2', '#c8c8ce', '#e4e4e8', '#fafafa'] },
  { name: 'Ocean', colours: ['#061420', '#0c2638', '#123e56', '#185a74', '#1e7a92', '#2e9cae', '#58bec4', '#94dcd6', '#d6f4ee', '#f6e6b8', '#e88a6a', '#2a3a6a'] },
  { name: 'Ember', colours: ['#120808', '#2a0e0e', '#4a1410', '#741c12', '#a42c14', '#d04818', '#ee7428', '#f8a43c', '#fcd468', '#fff4c0', '#3a2a2a', '#6a5048'] },
  { name: 'Pocket', colours: ['#0b1a0d', '#183418', '#2a4f22', '#3e6a2c', '#5a8a34', '#7ea83c', '#a4c44a', '#e8f4b0'] },
];

/** A built-in palette by name (any letter case), or null. */
export function paletteByName(name) {
  if (typeof name !== 'string') return null;
  const n = name.trim().toLowerCase();
  return PALETTES.find((p) => p.name.toLowerCase() === n) ?? null;
}

// ---- colour maths ------------------------------------------------------------

const srgbToLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

/** OKLab: a colour space where straight-line distance matches how different colours look. */
function oklab(r, g, b) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// Lightness counts a little more than hue when picking the nearest palette
// colour, so a sprite's light / base / shadow bands stay separate steps.
const L_WEIGHT = 1.6;

function paletteMatcher(palette) {
  const list = Array.isArray(palette) ? palette : paletteByName(palette)?.colours;
  if (!list || !list.length) return null;
  const entries = list.map((hex) => { const [r, g, b] = hexToRgb(hex); return { rgb: [r, g, b], lab: oklab(r, g, b) }; });
  return (r, g, b) => {
    const [L, A, B] = oklab(r, g, b);
    let best = entries[0], bd = Infinity;
    for (const e of entries) {
      const dl = (L - e.lab[0]) * L_WEIGHT, da = A - e.lab[1], db = B - e.lab[2];
      const d = dl * dl + da * da + db * db;
      if (d < bd) { bd = d; best = e; }
    }
    return best.rgb;
  };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * Turns the colour settings into one function (r, g, b) -> [r, g, b], or null
 * when they change nothing. Steps that are at their neutral value are skipped,
 * so they cannot nudge a colour by rounding.
 */
function colourTransform(colour) {
  const c = { ...defaultTheme().colour, ...(colour || {}) };
  const hue = ((Number(c.hue) || 0) % 360 + 360) % 360;
  const sat = Number.isFinite(Number(c.saturation)) ? Math.max(0, Number(c.saturation)) : 1;
  const con = Number.isFinite(Number(c.contrast)) ? Math.max(0, Number(c.contrast)) : 1;
  const tintAmt = Math.max(0, Math.min(1, Number(c.tintAmount) || 0));
  const tint = typeof c.tint === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.tint) && tintAmt > 0 ? rgbToHsl(...hexToRgb(c.tint)) : null;
  const nearest = c.palette ? paletteMatcher(c.palette) : null;
  const outline = typeof c.outline === 'string' && /^#[0-9a-f]{6}$/i.test(c.outline) ? hexToRgb(c.outline) : null;
  const ink = hexToRgb(INK);
  const doHsl = hue !== 0 || sat !== 1;
  if (!doHsl && con === 1 && !tint && !nearest && !outline) return null;
  return (r, g, b) => {
    if (outline && r === ink[0] && g === ink[1] && b === ink[2]) return outline;
    if (doHsl) {
      const [h, s, l] = rgbToHsl(r, g, b);
      [r, g, b] = hslToRgb(h + hue, Math.min(1, s * sat), l);
    }
    if (con !== 1) { r = (r - 128) * con + 128; g = (g - 128) * con + 128; b = (b - 128) * con + 128; }
    if (tint) {
      // Colourise: the tint's hue and strength at this pixel's own lightness, so shading survives.
      const l = rgbToHsl(clamp255(r), clamp255(g), clamp255(b))[2];
      const [tr, tg, tb] = hslToRgb(tint[0], tint[1], l);
      r += (tr - r) * tintAmt; g += (tg - g) * tintAmt; b += (tb - b) * tintAmt;
    }
    r = clamp255(r); g = clamp255(g); b = clamp255(b);
    return nearest ? nearest(r, g, b) : [r, g, b];
  };
}

/**
 * Recolour pixels in place and return them.
 * pixels: a Uint32Array in the Surface's byte order (color.js `pack`: r in the
 * low byte, alpha in the high byte), or RGBA bytes (Uint8ClampedArray / Uint8Array).
 * Pixels with alpha 0 are left untouched; alpha is never changed.
 * Each distinct colour is worked out once, so the number of distinct colours never rises.
 */
export function applyColour(pixels, colour) {
  const fn = colourTransform(colour);
  if (!fn) return pixels;
  const memo = new Map();
  const map = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let v = memo.get(key);
    if (v === undefined) { v = fn(r, g, b); memo.set(key, v); }
    return v;
  };
  if (pixels instanceof Uint32Array) {
    let lastIn = -1, lastOut = 0;
    for (let i = 0; i < pixels.length; i++) {
      const v = pixels[i];
      if (!(v >>> 24)) continue;
      if (v === lastIn) { pixels[i] = lastOut; continue; }
      const [r, g, b] = map(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);
      lastIn = v;
      lastOut = pixels[i] = ((v & 0xff000000) | (b << 16) | (g << 8) | r) >>> 0;
    }
    return pixels;
  }
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const [r, g, b] = map(pixels[i], pixels[i + 1], pixels[i + 2]);
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
  }
  return pixels;
}

// ---- presets -----------------------------------------------------------------

const preset = (id, name, blurb, { colour = {}, sound = {}, music = {} } = {}) => {
  const t = defaultTheme();
  return { id, name, blurb, theme: { ...t, colour: { ...t.colour, ...colour }, sound: { ...t.sound, ...sound }, music: { ...t.music, ...music } } };
};

/** Named whole-bundle looks. Each `theme` is a complete Contract 7 theme. */
export const THEME_PRESETS = [
  preset('original', 'Original', 'Everything as it was made.'),
  preset('sunset', 'Sunset', 'Warm pinks and oranges, a slower, softer sound.', { colour: { palette: 'Sunset' }, sound: { brightness: -0.15 }, music: { tempo: 0.95 } }),
  preset('frost', 'Frost', 'Icy blues, with higher, crisper sounds.', { colour: { palette: 'Frost' }, sound: { pitch: 2, brightness: 0.3 } }),
  preset('forest', 'Forest', 'Mossy greens and bark browns, a little earthier.', { colour: { palette: 'Forest' }, sound: { brightness: -0.2 } }),
  preset('candy', 'Candy', 'Sweet pastels with bright, bouncy sounds.', { colour: { palette: 'Candy' }, sound: { pitch: 3, brightness: 0.3 }, music: { tempo: 1.05 } }),
  preset('night', 'Night', 'Moonlit blues, deeper and calmer sounds.', { colour: { palette: 'Night' }, sound: { pitch: -2, brightness: -0.4 }, music: { tempo: 0.92, intensity: 0.5 } }),
  preset('desert', 'Desert', 'Sand, clay and sky.', { colour: { palette: 'Desert' }, sound: { brightness: -0.1 } }),
  preset('toxic', 'Toxic', 'Acid greens and poison purples, a bit lower and harsher.', { colour: { palette: 'Toxic' }, sound: { pitch: -1, brightness: 0.2 } }),
  preset('mono', 'Mono', 'Shades of grey, muffled sound.', { colour: { palette: 'Mono' }, sound: { brightness: -0.3 } }),
  preset('handheld', 'Handheld', 'The green screen of an old pocket console, with chirpy sounds.', { colour: { palette: 'Pocket' }, sound: { pitch: 2, brightness: 0.4 } }),
  preset('vivid', 'Vivid', 'Stronger colours and punchier sound.', { colour: { saturation: 1.3, contrast: 1.1 }, sound: { brightness: 0.25 }, music: { tempo: 1.05 } }),
  preset('faded', 'Faded', 'Washed-out colours like an old photo, softer sound.', { colour: { saturation: 0.65, contrast: 0.9, tint: '#e8d8b0', tintAmount: 0.15 }, sound: { brightness: -0.35 }, music: { tempo: 0.95 } }),
  preset('spooky', 'Spooky', 'Purple shadows and lower, darker sounds.', { colour: { hue: -20, saturation: 0.7, contrast: 1.1, tint: '#6a4ac0', tintAmount: 0.4, outline: '#0a0612' }, sound: { pitch: -3, brightness: -0.3 }, music: { tempo: 0.9, intensity: 0.6 } }),
  preset('golden', 'Golden', 'Everything glows like late afternoon.', { colour: { saturation: 1.1, tint: '#ffc040', tintAmount: 0.3 }, sound: { brightness: 0.1 } }),
];

// ---- seeded variation ----------------------------------------------------------

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** A seed for one asset under one theme seed: same inputs, same number; different assets differ. */
export function assetSeed(seed, id) {
  let h = (hashString(String(id)) ^ Math.imul((Number(seed) | 0) + 0x632be5ab, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

// How far `shapes` moves each kind of control from where the bundle has it.
const RANGE_SPREAD = 0.4;    // a slider moves up to 40% of its travel either way
const CHOICE_CHANCE = 0.5;   // a list control switches to another option half the time
const COLOUR_CHANCE = 0.6;   // a colour control picks another of its swatches
const TOGGLE_CHANCE = 0.25;  // an on/off control flips

/**
 * The controls to render `sprite` with under `theme`.
 * theme.shapes false: `baseParams` itself, unchanged.
 * theme.shapes true: each control nudged from `baseParams` using theme.seed and
 * the sprite's id, so one seed always gives one look and sprites in the same
 * bundle vary differently. Always valid values (cleanParams).
 */
export function themedParams(sprite, baseParams, theme) {
  if (!theme || !theme.shapes) return baseParams;
  const base = cleanParams(sprite, baseParams || {});
  const r = rng(assetSeed(theme.seed ?? 0, sprite.id));
  const p = { ...base };
  for (const [k, d] of Object.entries(sprite.params)) {
    // Draw the same number of random values for every control, so adding one
    // control to a sprite does not reshuffle the others.
    const a = r(), b = r();
    if (d.kind === 'range') {
      let v = base[k] + (a * 2 - 1) * RANGE_SPREAD * (d.max - d.min);
      if (d.step) v = d.min + Math.round((v - d.min) / d.step) * d.step;
      p[k] = Number(v.toFixed(6));
    } else if (d.kind === 'choice') {
      if (a < CHOICE_CHANCE) p[k] = d.options[Math.floor(b * d.options.length)].value;
    } else if (d.kind === 'color') {
      if (a < COLOUR_CHANCE && d.swatches?.length) p[k] = d.swatches[Math.floor(b * d.swatches.length)];
    } else if (d.kind === 'toggle') {
      if (a < TOGGLE_CHANCE) p[k] = !base[k];
    }
  }
  return cleanParams(sprite, p);
}

// ---- Surprise me ---------------------------------------------------------------

const TINTS = ['#ffb040', '#ff7a5a', '#5aa8ff', '#7ae0c0', '#b48aff', '#ff8ac8'];
const OUTLINES = ['#000000', '#1a1020', '#2a1a10', '#0e1a2a', '#2a0e1a', '#102014'];
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * A tasteful random whole-bundle theme ("Surprise me"). Same seed, same theme.
 * Ranges are kept narrow on purpose:
 *   saturation 0.75..1.3: below ~0.7 neighbouring parts (skin, cloth, metal) turn
 *     the same mud; above ~1.35 skin and gold go neon and shading bands clip.
 *   contrast 0.9..1.15: below 0.9 the dark outline drifts to grey and the
 *     silhouette softens; above ~1.2 shadow bands crush into the outline and
 *     highlight bands into white, so the 3-tone shading is lost.
 *   hue -50..50 degrees: further round, skin turns green or blue on every character.
 *   tint at most 0.3, outline only from dark colours (a light outline breaks the
 *     silhouette) and never on top of a palette (it would add an off-palette colour).
 *   sound pitch -4..4 semitones and brightness -0.5..0.5; music tempo 0.9..1.1.
 * Half the time it picks one of the built-in palettes instead of hue / saturation.
 */
export function randomTheme(seed = 0, { shapes = false } = {}) {
  const r = rng(assetSeed(seed, 'surprise-me'));
  const t = defaultTheme();
  t.seed = seed;
  t.shapes = !!shapes;
  const c = t.colour;
  if (r() < 0.5) {
    c.palette = PALETTES[Math.floor(r() * PALETTES.length)].name;
    c.contrast = round2(1 + r() * 0.1);
  } else {
    c.hue = Math.round((r() * 2 - 1) * 50);
    c.saturation = round2(0.75 + r() * 0.55);
    c.contrast = round2(0.9 + r() * 0.25);
    if (r() < 0.4) { c.tint = TINTS[Math.floor(r() * TINTS.length)]; c.tintAmount = round2(0.1 + r() * 0.2); }
  }
  // An outline from outside the palette would break the palette's look, so only without one.
  const o = r();
  if (!c.palette && o < 0.4) c.outline = OUTLINES[Math.floor(r() * OUTLINES.length)];
  t.sound.pitch = Math.round((r() * 2 - 1) * 4);
  t.sound.brightness = round2((r() * 2 - 1) * 0.5);
  t.music.tempo = round2(0.9 + r() * 0.2);
  t.music.intensity = r() < 0.5 ? null : round2(0.4 + r() * 0.6);
  return t;
}

/**
 * Render one frame with the theme's controls and colours. Returns what renderFrame returns: a Surface in the pixel style.
 * style: the style to draw in (one the sprite lists; its first when left out).
 */
export function renderThemedFrame(sprite, clip, frame, baseParams, theme, { style } = {}) {
  const t = normalizeTheme(theme);
  const st = styleFor(sprite, style);
  const g = renderFrame(sprite, clip, frame, themedParams(sprite, cleanParams(sprite, baseParams || {}), t), { style: st.id });
  // a surface that is not a pixel grid says how a look recolours it (engine/styles.js, defineStyle)
  if (st.recolour) st.recolour(g, (pixels) => applyColour(pixels, t.colour));
  else applyColour(g.data, t.colour);
  return g;
}
