// Bundle-level customisation (architecture.md, Contract 7), the picture side.
// One theme restyles every sprite in a bundle the same way, so they keep
// matching. Colour settings are applied AFTER a frame is rendered, so they work
// on any sprite with no per-sprite work; `shapes` additionally varies each
// sprite's own controls from the theme's seed.
//
// A look may move hue, warmth and tone, but a thing must stay what it is. Three rules keep it so:
//   1. Every colour a sprite draws has a material (engine/materials.js: sky, water, skin, warning ...), found by
//      spriteMaterials() from the sprite's colour controls, and a look may only pull a colour as far as its material
//      allows (applyColour with a third argument; spriteLook and renderThemedFrame do it for you).
//   2. Two tones of a sprite that were clearly different stay clearly different (the same call).
//   3. "Also change shapes" (themedParams) moves sliders inside the safe middle of their range and picks among
//      options a sprite marks as variants; it never takes a part off, never swaps one for another kind, never
//      flips a switch and never touches a colour.
// Pure JavaScript: runs the same in the browser and in Node. No DOM, no files.

import { rgbToHsl, hslToRgb, hexToRgb, col, INK } from './color.js';
import { rng } from './motion.js';
import { renderFrame, renderPixels, cleanParams, inEffect, partList } from './sprite.js';
import { styleFor } from './styles.js';
import { controlMaterial, restMaterial, holdColour, limitsOf, materialById, oklab as labOf, oklch, fromOklch, hueTurn } from './materials.js';

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
 * colour: the colour settings of a theme (Contract 7).
 * materials (optional): what each colour of the picture is of, from spriteMaterials(sprite, settings) or
 * namedMaterials(colours), or a function that returns one (it is only called when the look changes a colour, so
 * nothing is drawn to find out for a look that leaves colours alone). With it a colour moves only as far as its
 * material allows and tones that were clearly apart stay apart; a sprite's pictures are always recoloured this
 * way (spriteLook, renderThemedFrame). Without it this is the plain colour maths, the same for every colour.
 * Pixels with alpha 0 are left untouched; alpha is never changed.
 * Each distinct colour is worked out once, so the number of distinct colours never rises.
 */
export function applyColour(pixels, colour, materials) {
  let map;
  const fn = colourTransform(colour);
  if (!fn) return pixels;
  if (materials) {
    const look = lookColours(typeof materials === 'function' ? materials() : materials, colour);
    if (!look) return pixels;
    map = look.of;
  } else {
    const memo = new Map();
    map = (r, g, b) => {
      const key = (r << 16) | (g << 8) | b;
      let v = memo.get(key);
      if (v === undefined) { v = fn(r, g, b); memo.set(key, v); }
      return v;
    };
  }
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

// ---- what each colour of a sprite is of --------------------------------------------------------------------------

/**
 * True when a look leaves one colour only: shades of grey, a colour set whose colours all share one hue (the green
 * screen), no colourfulness, or a tint at nearly full strength. Under such a look hue cannot say what a thing is,
 * so only tone is held, and the colours that carry a meaning (signal, warning) keep theirs.
 * colour: the colour settings of a theme.
 */
export function isOneColourLook(colour) {
  const c = { ...defaultTheme().colour, ...(colour || {}) };
  if (Number.isFinite(Number(c.saturation)) && Number(c.saturation) <= 0.2) return true;
  if (typeof c.tint === 'string' && Number(c.tintAmount) >= 0.8) return true;
  const list = !c.palette ? null : Array.isArray(c.palette) ? c.palette : paletteByName(c.palette)?.colours;
  if (!list || !list.length) return false;
  const hues = list.map((hex) => oklch(...hexToRgb(hex))).filter((k) => k.C >= 0.04).map((k) => k.h).sort((a, b) => a - b);
  if (!hues.length) return true;
  let gap = 360 - hues[hues.length - 1] + hues[0];
  for (let i = 1; i < hues.length; i++) gap = Math.max(gap, hues[i] - hues[i - 1]);
  return 360 - gap <= ONE_HUE_SPAN;
}
/** A colour set whose hues all lie within this many degrees is one colour (isOneColourLook). */
export const ONE_HUE_SPAN = 45;

const TABLES = new WeakMap();       // sprite -> Map(settings -> table)
const TABLES_KEPT = 24;             // per sprite; "Surprise me" with shapes asks for a new one each press
const LOOKS_KEPT = 12;              // per table
// Two colours no sprite is made in: a control is set to the one further from its own colour to see what it paints.
const PROBES = [[255, 0, 255], [0, 224, 0]];
const rgbGap = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const hex2 = (v) => v.toString(16).padStart(2, '0');

/** The frames of a clip that are looked at to learn a sprite's colours: one a third of the way in, and the first of the clip shown on cards. */
function sampleFrames(sprite, clip) {
  const n = sprite.clips[clip].frames;
  const at = [Math.floor(n / 3)];
  if (clip === sprite.preview && !at.includes(0)) at.unshift(0);
  return at;
}

/**
 * What each colour in a sprite's pictures is of, at these settings: the table a look needs to recolour the sprite
 * without turning its sky brown or its skin green.
 * It is found by drawing: a sample of frames of every clip, once as set and once more per colour control with that
 * control set to a colour no sprite uses. The pixels that change are the ones that control paints; each colour of
 * the picture takes the material of the control that paints most of it (controlMaterial in engine/materials.js),
 * and a colour that no control paints takes the sprite's rest material.
 * sprite: a sprite; params: its settings (as drawn: after a look's shape changes); style: the art style (its first when left out).
 * Returns { rest, total, colours: Map(0xRRGGBB -> { n (pixels seen), material, control (the key, or null) }) }.
 * Kept per sprite and settings, so asking again costs nothing. A sprite made on a visit is drawn elsewhere and
 * cannot be asked here: its table has no colours, and every colour of it takes the rest material.
 */
export function spriteMaterials(sprite, params, { style } = {}) {
  const st = styleFor(sprite, style);
  const p = cleanParams(sprite, params || {});
  const key = st.id + JSON.stringify(Object.keys(sprite.params).map((k) => p[k]));
  let per = TABLES.get(sprite);
  if (!per) TABLES.set(sprite, per = new Map());
  let table = per.get(key);
  if (table) return table;
  table = buildTable(sprite, p, st.id);
  if (per.size >= TABLES_KEPT) per.delete(per.keys().next().value);
  per.set(key, table);
  return table;
}

function buildTable(sprite, p, style) {
  const table = { rest: restMaterial(sprite), total: 0, colours: new Map(), looks: new Map() };
  if (sprite.made || typeof sprite.prepare === 'function') return table;
  const keys = Object.keys(sprite.params).filter((k) => sprite.params[k].kind === 'color' && inEffect(sprite, k, p));
  const probes = keys.map((k) => {
    const own = hexToRgb(p[k]);
    const to = rgbGap(own, PROBES[0]) >= rgbGap(own, PROBES[1]) ? PROBES[0] : PROBES[1];
    return { hex: `#${hex2(to[0])}${hex2(to[1])}${hex2(to[2])}`, reach: Math.max(1, rgbGap(own, to)) };
  });
  const draw = (clip, f, q) => { try { return renderPixels(sprite, clip, f, q, { style }).data; } catch { return null; } };
  // Sliders move shapes far more often than they bring in a colour. So when sliders are away from where the sprite
  // was made ("Also change shapes" moves them on every press), the sprite with its sliders back at rest is asked
  // first (its table is kept, and is the one every look without shapes uses): if nothing here is drawn in a colour
  // that table does not know, each colour is of what it is of there, and only the frames as set are drawn.
  const atRest = { ...p };
  let moved = false;
  for (const [k, d] of Object.entries(sprite.params)) if (d.kind === 'range' && p[k] !== d.def) { atRest[k] = d.def; moved = true; }
  if (moved) {
    const known = spriteMaterials(sprite, atRest, { style }).colours;
    const counts = new Map();
    let all = known.size > 0;
    look: for (const clip of Object.keys(sprite.clips)) for (const f of sampleFrames(sprite, clip)) {
      const base = draw(clip, f, p);
      if (!base) continue;
      let lastV = -1, key = 0;
      for (let i = 0; i < base.length; i++) {
        const v = base[i];
        if (!(v >>> 24)) continue;
        if (v !== lastV) { lastV = v; key = ((v & 255) << 16) | (v & 0xff00) | ((v >>> 16) & 255); if (!known.has(key)) { all = false; break look; } }
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    if (all && counts.size) {
      for (const [key, n] of counts) { const e = known.get(key); table.colours.set(key, { n, material: e.material, control: e.control }); table.total += n; }
      return table;
    }
  }
  const seen = new Map();             // colour -> { n, by: pixels each control paints most }
  let asking = true;
  for (const clip of Object.keys(sprite.clips)) for (const f of sampleFrames(sprite, clip)) {
    const base = draw(clip, f, p);
    if (!base || !base.some((v) => v >>> 24)) continue;
    // A control's picture with nothing in it, where the sprite as set draws something, means this sprite is drawn
    // elsewhere and only has the frames it was handed (the quality bar's stand-in for a sprite made on a visit):
    // it cannot be asked, so nothing more is asked of it, and its colours take the rest material.
    const alts = [];
    for (let j = 0; j < keys.length && asking; j++) {
      const a = draw(clip, f, { ...p, [keys[j]]: probes[j].hex });
      if (a && a.length === base.length && a.some((v) => v >>> 24)) alts.push(a);
      else { asking = false; alts.length = 0; for (const e of seen.values()) e.by.fill(0); }
    }
    let lastV = -1, e = null;
    for (let i = 0; i < base.length; i++) {
      const v = base[i];
      if (!(v >>> 24)) continue;
      if (v !== lastV) {
        lastV = v;
        e = seen.get(v & 0xffffff);
        if (!e) seen.set(v & 0xffffff, e = { n: 0, by: new Array(keys.length).fill(0) });
      }
      e.n++;
      let best = -1, most = 0;
      for (let j = 0; j < alts.length; j++) {
        const a = alts[j];
        if (!a || a[i] === v) continue;
        const w = a[i];
        // how much of this pixel's colour the control decides: the change here, against the change made to the control
        const share = (w >>> 24 ? Math.abs((w & 255) - (v & 255)) + Math.abs(((w >>> 8) & 255) - ((v >>> 8) & 255)) + Math.abs(((w >>> 16) & 255) - ((v >>> 16) & 255)) : 765) / probes[j].reach;
        if (share > most) { most = share; best = j; }
      }
      if (best >= 0) e.by[best]++;
    }
  }
  const materials = keys.map((k) => controlMaterial(k, sprite.params[k], sprite));
  for (const [v, e] of seen) {
    let main = -1;
    for (let j = 0; j < keys.length; j++) if (e.by[j] > (main < 0 ? 0 : e.by[main])) main = j;
    const painted = main >= 0 && e.by[main] * 2 >= e.n;
    // kept as 0xRRGGBB (the Surface holds red in the low byte)
    table.colours.set(((v & 255) << 16) | (v & 0xff00) | ((v >>> 16) & 255), { n: e.n, material: painted ? materials[main] : table.rest, control: painted ? keys[main] : null });
    table.total += e.n;
  }
  return table;
}

/**
 * The materials table of a picture that is not a sprite: a short list of named colours, such as a scene's own sky,
 * grass and dirt. Each colour takes the material its name says (controlMaterial in engine/materials.js: "sky",
 * "grassEdge", "wallTop"), or `rest` when the name says nothing.
 * colours: { name: '#rrggbb' }; rest: the material of every other colour ('paint' when left out).
 * Returns a table as spriteMaterials does, for applyColour's third argument.
 */
export function namedMaterials(colours, { rest = 'paint' } = {}) {
  const table = { rest, total: 0, colours: new Map(), looks: new Map() };
  for (const [name, hex] of Object.entries(colours || {})) {
    const [r, g, b] = hexToRgb(hex);
    const said = controlMaterial(name, { label: name }, null);
    table.colours.set((r << 16) | (g << 8) | b, { n: 2, material: said === 'paint' ? rest : said, control: name });
    table.total += 2;
  }
  return table;
}

/**
 * One materials table for a picture made of several sprites (a scene put together from tiles and props): every
 * colour of every table, and where two tables disagree about a colour, what the one that draws more of it says.
 * tables: a list of tables from spriteMaterials or namedMaterials; rest: the material of every other colour.
 */
export function mergeMaterials(tables, { rest = 'paint' } = {}) {
  const out = { rest, total: 0, colours: new Map(), looks: new Map() };
  for (const t of tables) for (const [v, e] of t.colours) {
    const had = out.colours.get(v);
    if (!had) out.colours.set(v, { ...e });
    else out.colours.set(v, { n: had.n + e.n, material: e.n > had.n ? e.material : had.material, control: e.n > had.n ? e.control : had.control });
    out.total += e.n;
  }
  return out;
}

// ---- a look on a sprite: every colour held by its material, and tones kept apart ---------------------------------------

/**
 * Two tones of one sprite stay apart under a look. Made colours at least APART different (colourGap in
 * engine/materials.js: 0 the same, 1 black against white) count as clearly different; after a look they must still be
 * at least half as different as they were, and no closer than HELD (toneNeed). MOST is how many of a sprite's colours,
 * most used first, are kept apart, of those that cover at least SHARE of its pixels (a few flower pixels must not push
 * the soil they lie on; the quality bar counts the same colours, THRESHOLDS.toneShare).
 */
export const TONES = { APART: 0.07, HELD: 0.09, MOST: 96, STEP: 0.04, SHARE: 0.004 };
/** How different two tones must still be after a look, when they were `before` different (colourGap). 0 when they were not clearly different to begin with. */
export const toneNeed = (before) => (before < TONES.APART ? 0 : Math.min(TONES.HELD, before * 0.5));
/**
 * Also two tones a step apart (at least TONES.STEP: the bands of a sky, the steps of a shading) are kept half their gap
 * apart where there is room, so a gradient does not become one colour where the look's set has one colour for it.
 */
const stepNeed = (before) => toneNeed(before) || (before < TONES.STEP ? 0 : before * 0.5);

const gap3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fromLab = (lab) => fromOklch(lab[0], Math.hypot(lab[1], lab[2]), (Math.atan2(lab[2], lab[1]) * 180) / Math.PI);

/**
 * A look worked out for one sprite: null when the look changes no colour, otherwise { one, of(r, g, b) -> [r, g, b] }.
 * table: from spriteMaterials; colour: the colour settings of a theme. Kept on the table, so it is worked out once.
 * Every colour of the table becomes what the look wishes, pulled back inside its material's limits (holdColour);
 * then, most used first, a colour that has come too close to one already placed (toneNeed) takes another colour of
 * the colour set that its material allows, or else is moved away from it the way it differed when made (under a
 * one-colour look: lighter or darker). A colour that is not in the table takes the material of the table colour it
 * is a shade of, or the rest material, and is held the same way.
 */
export function lookColours(table, colour) {
  const c = { ...defaultTheme().colour, ...(colour || {}) };
  const key = JSON.stringify([c.hue, c.saturation, c.contrast, c.tint, c.tintAmount, c.palette, c.outline]);
  if (table.looks.has(key)) return table.looks.get(key);
  const fn = colourTransform(c);
  let look = null;
  if (fn) {
    const one = isOneColourLook(c);
    const ink = hexToRgb(INK);
    const swapsInk = typeof c.outline === 'string' && /^#[0-9a-f]{6}$/i.test(c.outline);
    const isInk = (rgb) => swapsInk && rgb[0] === ink[0] && rgb[1] === ink[1] && rgb[2] === ink[2];
    // A colour set first: where the set's nearest colour is outside what the material allows, the nearest colour of
    // the set that is inside, and the same kind of colour, is taken (a grey-blue stone takes the set's grey, not its
    // brick red turned as far as stone may turn); only when the set has none is the colour held between the two, off
    // the set. Held off the set it keeps the lightness the look gives it before the set (under a set alone: its own),
    // so the steps of a shading the set has nothing for stay steps (the bands of a night sky under Forest).
    const list = c.palette ? (Array.isArray(c.palette) ? c.palette : paletteByName(c.palette)?.colours) : null;
    const set = list && list.length ? list.map((hex) => { const rgb = hexToRgb(hex); return { rgb, lab: labOf(...rgb), lch: oklch(...rgb) }; }) : null;
    const before = set ? colourTransform({ ...c, palette: null }) : null;        // what the look does before its colour set
    const held = (material, from) => {
      const wish = fn(...from);
      if (isInk(from)) return wish;
      const to = holdColour(material, from, wish, { oneColour: one });
      if (to === wish || !set) return to;
      const at = labOf(...(before ? before(...from) : from));
      // the same kind of colour as the look would make it, or (for a material that holds its hue) as it was made: a grey
      // stone may take the set's grey even where the look would give it a cast
      const kinds = one ? null : [oklch(...to), ...(materialById(material)?.hue == null ? [] : [oklch(...from)])];
      let best = null, near = Infinity;
      for (const x of set) {
        const d = gap3(x.lab, at);
        if (d < near && (!kinds || kinds.some((k) => sameKind(k, x.lch))) && holdColour(material, from, x.rgb, { oneColour: one }) === x.rgb) { near = d; best = x.rgb; }
      }
      if (best) return best;
      if (one) return to;
      const t = oklch(...to);
      return holdColour(material, from, fromOklch(oklch(...(before ? before(...from) : from)).L, t.C, t.h), { oneColour: one });
    };
    const entries = [...table.colours].map(([v, e]) => {
      const from = [v >>> 16, (v >>> 8) & 255, v & 255];
      const to = held(e.material, from);
      return { v, n: e.n, material: e.material, from, fromLab: labOf(...from), to, toLab: labOf(...to), fixed: isInk(from) };
    }).sort((a, b) => b.n - a.n || a.v - b.v);
    keepTonesApart(entries.filter((e) => e.n >= Math.max(2, table.total * TONES.SHARE)).slice(0, TONES.MOST), c, one);
    const map = new Map(entries.map((e) => [e.v, e.to]));
    const shadeOf = (from) => {                       // the table colour this one is a shade of, if any
      const lab = labOf(...from);
      let best = null, near = 0.05;
      for (const e of entries) { const d = gap3(lab, e.fromLab); if (d < near) { near = d; best = e; } }
      return best;
    };
    look = {
      one,
      of(r, g, b) {
        const v = (r << 16) | (g << 8) | b;
        let to = map.get(v);
        if (to === undefined) {
          const from = [r, g, b];
          to = held(shadeOf(from)?.material ?? table.rest, from);
          map.set(v, to);
        }
        return to;
      },
    };
  }
  if (table.looks.size >= LOOKS_KEPT) table.looks.delete(table.looks.keys().next().value);
  table.looks.set(key, look);
  return look;
}

/**
 * What "the same kind of colour" means when a look moves a colour to keep it apart from another, or to keep it inside
 * its material's limits: a step may make a colour lighter, darker, a little warmer or cooler, never another colour.
 * A colour with a hue stays within `hue` degrees of it and keeps at least `keep` of its strength; a nearly grey one
 * (weaker than `grey`) stays nearly grey. (The faults behind it, 2026-11-19: under Forest one plank of a wooden door
 * jumped to the set's green to stay apart from the plank beside it.)
 */
export const KIND = { hue: 15, keep: 0.5, grey: 0.03 };
/** True when colour `c` is the same kind of colour as `w` (KIND). Both are { L, C, h } (oklch in engine/materials.js). */
export function sameKind(w, c) {
  if (w.C < KIND.grey) return c.C < Math.max(2 * KIND.grey, w.C * 2);
  return c.C >= w.C * KIND.keep && Math.abs(hueTurn(w.h, c.h)) <= KIND.hue;
}

/**
 * Moves entries (most used first) so that none has come too close to one placed before it. Changes each entry's `to`
 * and `toLab`. Under a look of many colours a colour that clashes tries, in this order: other colours of the colour
 * set that its material allows and that are the same kind of colour (sameKind); then steps away from the colour it
 * clashes with, the way it differed from it when made. It takes the place that leaves it furthest clear of
 * everything placed before it. Under a one-colour look only lightness is left to tell most tones apart, so all of
 * them are spread out in lightness together instead (spreadLightness); the colours that keep their hue (signal,
 * warning) keep it there and count it as part of their difference. In a crowded picture under a look of few
 * tones a pair may still end closer than toneNeed asks: the quality bar reports what is left nearly the same.
 */
function keepTonesApart(entries, colour, one) {
  const list = colour.palette ? (Array.isArray(colour.palette) ? colour.palette : paletteByName(colour.palette)?.colours) : null;
  const set = list ? list.map((hex) => { const rgb = hexToRgb(hex); return { rgb, lab: labOf(...rgb), lch: oklch(...rgb) }; }) : [];
  if (one) spreadLightness(entries.filter((e) => !e.fixed), entries.filter((e) => e.fixed));
  else placeApart(entries, set);
}

/** The greedy placing keepTonesApart describes for a look of many colours: most used first, each clear of the ones placed before it. */
function placeApart(entries, set) {
  const placed = [];
  // how clear of everything placed a colour is at `lab`: the least (gap / gap needed) over the placed colours it was
  // clearly different from; 1 or more is clear of all, 0 is the very same colour. hit: the placed colour it is least clear of.
  const clearance = (e, lab) => {
    let least = Infinity, hit = null;
    for (const a of placed) {
      const need = stepNeed(gap3(a.fromLab, e.fromLab));
      if (!need) continue;
      const m = gap3(a.toLab, lab) / need;
      if (m < least) { least = m; hit = a; }
    }
    return { least, hit };
  };
  for (const e of entries) {
    const now = e.fixed ? { least: 1, hit: null } : clearance(e, e.toLab);
    if (now.least < 1) {
      const { hit } = now;
      let best = { least: now.least, to: e.to, lab: e.toLab };
      const tryAt = (to) => {
        const lab = labOf(...to), c = clearance(e, lab).least;
        if (c > best.least + 1e-9) best = { least: c, to, lab };
        return c >= 1;
      };
      let done = false;
      const kind = oklch(...e.to);
      // another colour of the colour set, nearest first, that the material allows and that is the same kind of colour
      for (const x of set.map((y) => ({ ...y, d: gap3(y.lab, e.toLab) })).filter((y) => y.d > 1e-6).sort((p, q) => p.d - q.d).slice(0, 6)) {
        if (!sameKind(kind, x.lch) || holdColour(e.material, e.from, x.rgb) !== x.rgb) continue;
        if ((done = tryAt(x.rgb))) break;
      }
      if (!done) {
        // a step away from the colour it clashes with: the way it differed from it when made, or its own colour made
        // lighter or darker than that one (the lighter of the two when made first); never into another kind of colour
        const d = [e.fromLab[0] - hit.fromLab[0], e.fromLab[1] - hit.fromLab[1], e.fromLab[2] - hit.fromLab[2]];
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        const need = stepNeed(gap3(hit.fromLab, e.fromLab));
        const up = Math.abs(d[0]) >= 0.02 ? Math.sign(d[0]) : (d[2] >= 0 ? 1 : -1);
        const ways = [(k) => [hit.toLab[0] + (d[0] * k) / len, hit.toLab[1] + (d[1] * k) / len, hit.toLab[2] + (d[2] * k) / len],
          (k) => [hit.toLab[0] + up * k, e.toLab[1], e.toLab[2]], (k) => [hit.toLab[0] - up * k, e.toLab[1], e.toLab[2]]];
        search: for (const part of [1.08, 0.75, 0.5, 1.5]) for (const way of ways) {
          const lab = way(need * part);
          lab[0] = Math.min(1, Math.max(0.03, lab[0]));         // no lighter than white
          const to = holdColour(e.material, e.from, fromLab(lab));
          if (sameKind(kind, oklch(...to)) && tryAt(to)) break search;
        }
      }
      e.to = best.to; e.toLab = best.lab;
    }
    placed.push(e);
  }
}

/** The lightest and darkest a colour may be made to keep tones apart under a one-colour look (OKLab lightness). */
const L_RANGE = [0.04, 0.985];
/** The most spreadLightness moves a tone from the lightness the look gave it: past this the look would no longer be itself. */
const L_PUSH = 0.15;

/**
 * Under a one-colour look: moves the lightness of `movers` so that every two tones that were clearly different
 * (toneNeed), or a step apart (stepNeed), end apart, with `fixed` entries (the outline, where the look swaps it) staying where they are. Each mover
 * stays inside its material's lightness limits, no further than L_PUSH from the lightness the look gave it, and
 * keeps the strength and hue the look gave it (the look's own cast;
 * a signal or warning colour its own hue), which counts toward its difference from the others.
 * How: all of them are put in order of the lightness the look gave them (two the look made just as light go in the
 * order they had when made: the lighter stays lighter, of two equally light the warmer). In that order each pair
 * that must be apart gets the gap it needs, but no more than a cap that is as large as the room allows (found by
 * halving): in a crowded picture every pair still gets as much as it can, and the small gaps that were asked for in
 * full. Each tone is then put as near the lightness the look gave it as those gaps let it be: first the mean of the
 * placing pushed up and the placing pushed down (so no side takes all the moving), then each in turn as near its own
 * as its neighbours allow.
 */
function spreadLightness(movers, fixed) {
  if (!movers.length) return;
  const all = [...movers, ...fixed].map((e, i) => ({ e, moves: i < movers.length, wish: e.toLab[0] }));
  for (const a of all) {
    if (!a.moves) { a.lo = a.hi = a.wish; continue; }
    const lim = limitsOf(a.e.material, a.e.from, { oneColour: true }).light;
    a.lo = Math.min(a.wish, Math.max(L_RANGE[0], a.wish - L_PUSH, lim ? lim[0] : 0));
    a.hi = Math.max(a.wish, Math.min(L_RANGE[1], a.wish + L_PUSH, lim ? lim[1] : 1));
  }
  const madeOrder = (p, q) => { const dl = p.e.fromLab[0] - q.e.fromLab[0]; return Math.abs(dl) >= 0.02 ? dl : p.e.fromLab[2] - q.e.fromLab[2]; };
  all.sort((p, q) => (Math.abs(p.wish - q.wish) > 1e-6 ? p.wish - q.wish : madeOrder(p, q)));
  const n = all.length;
  // r[i][j], i < j in that order: the lightness gap the pair needs (the part hue and strength do not already give)
  const r = all.map(() => new Float64Array(n));
  let most = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const need = stepNeed(gap3(all[i].e.fromLab, all[j].e.fromLab));
    if (!need || (!all[i].moves && !all[j].moves)) continue;
    const ab = Math.hypot(all[i].e.toLab[1] - all[j].e.toLab[1], all[i].e.toLab[2] - all[j].e.toLab[2]);
    r[i][j] = Math.sqrt(Math.max(0, need * need - ab * ab)) * 1.02;
    most = Math.max(most, r[i][j]);
  }
  if (!most) return;
  // the earliest (up) and latest (down) each may be, with every gap capped at `cap`; null when that does not fit
  const envelopes = (cap) => {
    const up = new Float64Array(n), down = new Float64Array(n);
    for (let k = 0; k < n; k++) { let v = all[k].lo; for (let j = 0; j < k; j++) if (r[j][k]) v = Math.max(v, up[j] + Math.min(r[j][k], cap)); up[k] = v; }
    for (let k = n - 1; k >= 0; k--) { let v = all[k].hi; for (let j = k + 1; j < n; j++) if (r[k][j]) v = Math.min(v, down[j] - Math.min(r[k][j], cap)); down[k] = v; }
    for (let k = 0; k < n; k++) if (up[k] > down[k] + 1e-9) return null;
    return { up, down };
  };
  let cap = most, env = envelopes(cap);
  if (!env) {
    let lo = 0, hi = most;
    env = envelopes(0);
    if (!env) return;                                   // the fixed ones alone do not fit: leave the look as it is
    for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; const got = envelopes(mid); if (got) { lo = mid; env = got; } else hi = mid; }
    cap = lo;
  }
  const { up, down } = env;
  const g = (j, k) => Math.min(r[j][k], cap);
  const pushedUp = new Float64Array(n), pushedDown = new Float64Array(n);
  for (let k = 0; k < n; k++) { let v = Math.max(up[k], all[k].wish); for (let j = 0; j < k; j++) if (r[j][k]) v = Math.max(v, pushedUp[j] + g(j, k)); pushedUp[k] = Math.min(down[k], v); }
  for (let k = n - 1; k >= 0; k--) { let v = Math.min(down[k], all[k].wish); for (let j = k + 1; j < n; j++) if (r[k][j]) v = Math.min(v, pushedDown[j] - g(k, j)); pushedDown[k] = Math.max(up[k], v); }
  // from there, each in turn goes as near the lightness the look gave it as its neighbours' gaps let it, until none can
  const x = all.map((_, k) => (pushedUp[k] + pushedDown[k]) / 2);
  for (let sweep = 0; sweep < 40; sweep++) {
    let moved = 0;
    for (let k = 0; k < n; k++) {
      if (!all[k].moves) continue;
      let lo = up[k], hi = down[k];
      for (let j = 0; j < k; j++) if (r[j][k]) lo = Math.max(lo, x[j] + g(j, k));
      for (let j = k + 1; j < n; j++) if (r[k][j]) hi = Math.min(hi, x[j] - g(k, j));
      const v = Math.min(hi, Math.max(lo, all[k].wish));
      if (lo <= hi + 1e-9 && Math.abs(v - x[k]) > 1e-6) { moved = Math.max(moved, Math.abs(v - x[k])); x[k] = v; }
    }
    if (moved < 1e-4) break;
  }
  for (let k = 0; k < n; k++) {
    const a = all[k];
    if (!a.moves) continue;
    if (Math.abs(x[k] - a.e.toLab[0]) < 1e-4) continue;
    const c = oklch(...a.e.to);
    a.e.to = fromOklch(x[k], c.C, c.h);
    a.e.toLab = labOf(...a.e.to);
  }
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

// What "Also change shapes" may do (Contract 7). A look must never remove or swap what makes a sprite recognisable:
//   a slider     moves by at most `spread` of its travel, and never out of the safe middle of its range (the range
//                without `edge` of its travel at each end), where a sprite is itself at any setting. A slider that
//                is already outside the middle never moves further out. A slider marked look: 'keep' does not move.
//   a choice     is left alone, unless the sprite marks it look: 'vary' (its options are variants of one thing).
//                Then it takes another option `vary` of the time, but never one that takes a part off, never an
//                option called "none" or "off", and never when it is at such an option now.
//   an on/off    is left alone, unless marked look: 'vary'; then it flips `flip` of the time. A switch that puts a
//                part on or off (the first control of a part) never flips.
//   a part       what a sprite holds or wears (Contract 3) is never taken off, put on or swapped for another kind:
//                its first control is left alone unless marked look: 'vary'.
//   a colour     is never changed here: colours are the look's own job, held by their material (applyColour).
/** The limits of "Also change shapes": { spread, edge, vary, flip } (see themedParams). */
export const SHAPES = { spread: 0.25, edge: 0.2, vary: 0.5, flip: 0.25 };

const OFF_VALUES = new Set(['none', 'off']);

/**
 * The controls to render `sprite` with under `theme`.
 * theme.shapes false: `baseParams` itself, unchanged.
 * theme.shapes true: sliders nudged from `baseParams` inside the safe middle of their range, and the choices and
 * switches the sprite marks look: 'vary' varied (SHAPES), using theme.seed and the sprite's id, so one seed always
 * gives one look and sprites in the same bundle vary differently. Nothing is taken off or swapped for another kind
 * of thing, and no colour is touched. Always valid values (cleanParams).
 */
export function themedParams(sprite, baseParams, theme) {
  if (!theme || !theme.shapes) return baseParams;
  const base = cleanParams(sprite, baseParams || {});
  const r = rng(assetSeed(theme.seed ?? 0, sprite.id));
  const p = { ...base };
  const parts = partList(sprite);
  for (const [k, d] of Object.entries(sprite.params)) {
    // Draw the same number of random values for every control, so adding one
    // control to a sprite does not reshuffle the others.
    const a = r(), b = r();
    if (d.look === 'keep') continue;
    const part = parts.find((x) => x.selector === k);
    if (d.kind === 'range') {
      const span = d.max - d.min;
      const lo = Math.min(base[k], d.min + SHAPES.edge * span), hi = Math.max(base[k], d.max - SHAPES.edge * span);
      let v = Math.min(hi, Math.max(lo, base[k] + (a * 2 - 1) * SHAPES.spread * span));
      if (d.step) {
        v = d.min + Math.round((v - d.min) / d.step) * d.step;
        if (v < lo - 1e-9) v += d.step;
        if (v > hi + 1e-9) v -= d.step;
        if (v < lo - 1e-9 || v > hi + 1e-9) v = base[k];
      }
      p[k] = Number(v.toFixed(6));
    } else if (d.kind === 'choice') {
      if (d.look !== 'vary' || a >= SHAPES.vary) continue;
      const off = new Set([...OFF_VALUES, ...(part && part.none !== undefined ? (Array.isArray(part.none) ? part.none : [part.none]) : [])]);
      if (off.has(base[k])) continue;
      const options = d.options.map((o) => o.value).filter((v) => !off.has(v));
      if (options.length) p[k] = options[Math.floor(b * options.length)];
    } else if (d.kind === 'toggle') {
      if (d.look === 'vary' && !part && a < SHAPES.flip) p[k] = !base[k];
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
 * The record of what "Also change shapes" made of one sprite: { key: value } for each control whose value the look
 * changed ({} when it changed none, or the look leaves shapes alone). The sprite's own settings with this on top are
 * exactly what the look draws it with. A bag keeps it per sprite (Contract 6, `lookParams`) and hands it back as
 * spriteLook's `record`, so what the bag drew once it keeps drawing, even after the rule behind shapes changes.
 */
export function shapeRecord(sprite, baseParams, theme) {
  const t = normalizeTheme(theme);
  if (!t.shapes) return {};
  const base = cleanParams(sprite, baseParams || {});
  const p = themedParams(sprite, base, t);
  return Object.fromEntries(Object.keys(sprite.params).filter((k) => p[k] !== base[k]).map((k) => [k, p[k]]));
}

const isRecord = (r) => r !== null && typeof r === 'object' && !Array.isArray(r);

/**
 * Everything one sprite needs under a look, and the record of what was made (Contract 7): the settings it is
 * actually drawn with, which of them the look changed, and how its pixels are recoloured.
 * sprite: a sprite; baseParams: the settings it has without the look; theme: the look; style: the art style (its first when left out).
 * record (optional): what the look made of the sprite's shapes before (shapeRecord, as a bag keeps it). Under a look
 * with shapes it is used instead of working the shapes out again; under a look without shapes it is ignored.
 * Returns { params, changed, recolour(pixels) }:
 *   params    every control's value as drawn (themedParams): drawing the sprite with these, with no look, and then
 *             calling recolour, gives the same picture again;
 *   changed   the keys of the controls whose value the look changed ([] unless the look changes shapes);
 *   recolour  recolours pixels in place and returns them (applyColour with the sprite's materials at these
 *             settings, spriteMaterials: not the plain colour maths, which would give another picture).
 */
export function spriteLook(sprite, baseParams, theme, { style, record } = {}) {
  const t = normalizeTheme(theme);
  const base = cleanParams(sprite, baseParams || {});
  const params = t.shapes && isRecord(record) ? cleanParams(sprite, { ...base, ...record }) : themedParams(sprite, base, t);
  const changed = Object.keys(sprite.params).filter((k) => params[k] !== base[k]);
  const plain = !colourTransform(t.colour);
  // what each colour is of is found by drawing, so it is only found when a pixel is first recoloured
  let table = null;
  const recolour = plain ? (pixels) => pixels : (pixels) => applyColour(pixels, t.colour, table ??= spriteMaterials(sprite, params, { style }));
  return { params, changed, recolour };
}

/**
 * Render one frame with the theme's controls and colours. Returns what renderFrame returns: a Surface in the pixel style.
 * style: the style to draw in (one the sprite lists; its first when left out). record: as spriteLook.
 */
export function renderThemedFrame(sprite, clip, frame, baseParams, theme, { style, record, scale } = {}) {
  const st = styleFor(sprite, style);
  const look = spriteLook(sprite, baseParams, theme, { style: st.id, record });
  const g = renderFrame(sprite, clip, frame, look.params, { style: st.id, scale });
  // a surface that is not a pixel grid says how a look recolours it (engine/styles.js, defineStyle)
  if (st.recolour) st.recolour(g, look.recolour);
  else look.recolour(g.data);
  return g;
}
