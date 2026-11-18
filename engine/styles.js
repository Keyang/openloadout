// Styles: more than one way to draw and export a sprite (docs/architecture.md, Contract 12).
// A style is a named pipeline with three parts: the surface a sprite draws on, a finish applied to each
// finished frame, and exporters that turn frames into files. Every renderer and exporter goes through this
// registry, so a new pipeline plugs in without touching the sprites that do not use it.
// Pure JavaScript: runs the same in the browser and in Node.
//
//   pixel   the one style on the site today: the pixel grid of surface.js, no finish, a PNG sheet plus JSON.
//           A sprite that lists no styles has this one, and draws exactly as it did before styles existed.
//
// A sprite opts in with `styles: ['pixel', 'flat']` in defineSprite (best first) and is told which one is
// being drawn as `ctx.style` in render(g, ctx). How to add a style is in docs/framework-api.md, "Styles".

import { Surface } from './surface.js';
import { renderSheet } from './sprite.js';      // sprite.js imports this file too; neither uses the other until a call

const registry = new Map();
const ID_RE = /^[a-z][a-z0-9-]*$/;
const list = (ids) => ids.join(', ');

/**
 * Register a style and return it (frozen). A second style with the same id is refused.
 * style: {
 *   id       lowercase letters, digits and dashes: what a sprite writes in `styles` and what links and files carry;
 *   label    the name people see ("Pixel art");
 *   about    one plain sentence the site shows under the choice;
 *   makeSurface(width, height, options)   a new, empty drawing surface for one frame. It answers the calls of
 *            surface.js's Surface that it can carry (docs/framework-api.md lists them). options: the frame being
 *            drawn, { clip, t, frame, frames, loop, p, style };
 *   finish(surface, context)   optional: what is done to a frame after the sprite drew it (flatten, outline,
 *            palette). Change the surface in place, or return another one. context: options plus `sprite`;
 *   toPixels(surface)   optional, needed when the surface is not a pixel grid: a pixel Surface of the finished
 *            frame, which is what the site previews and what the quality bar looks at;
 *   recolour(surface, apply)   optional, needed when the surface is not a pixel grid: apply a whole-bundle look.
 *            `apply` takes a Uint32Array of packed colours and recolours it in place;
 *   exporters: { sheet(sprite, params, options) }   turns a sprite into files. Returns (or resolves to)
 *            { files: [{ name, bytes, type }], data }: the picture files, and the JSON that ships with them
 *            (it must keep `animations`, so sounds can be timed). options: see exportSheet().
 * }
 */
export function defineStyle(style) {
  const s = style ?? {};
  const where = `style ${typeof s.id === 'string' ? `"${s.id}"` : '?'}`;
  if (typeof s.id !== 'string' || !ID_RE.test(s.id)) throw new Error(`${where}: id must be lowercase letters, digits and dashes, starting with a letter`);
  if (registry.has(s.id)) throw new Error(`${where}: there is already a style with this id`);
  if (typeof s.label !== 'string' || !s.label.trim()) throw new Error(`${where}: needs a label, the name people see ("Pixel art")`);
  if (typeof s.about !== 'string' || !s.about.trim()) throw new Error(`${where}: needs about, one plain sentence that says what it looks like`);
  if (typeof s.makeSurface !== 'function') throw new Error(`${where}: needs makeSurface(width, height, options), which returns a new drawing surface`);
  for (const k of ['finish', 'toPixels', 'recolour']) if (s[k] !== undefined && s[k] !== null && typeof s[k] !== 'function') throw new Error(`${where}: ${k} must be a function, or left out`);
  const exporters = s.exporters;
  if (exporters === null || typeof exporters !== 'object' || typeof exporters.sheet !== 'function' || Object.values(exporters).some((f) => typeof f !== 'function')) throw new Error(`${where}: needs exporters: { sheet(sprite, params, options) }, which returns { files, data }`);
  const made = Object.freeze({
    id: s.id, label: s.label, about: s.about,
    makeSurface: s.makeSurface, finish: s.finish ?? null, toPixels: s.toPixels ?? null, recolour: s.recolour ?? null,
    exporters: Object.freeze({ ...exporters }),
  });
  registry.set(made.id, made);
  return made;
}

/** The style with this id, or null when there is none. id: a style id such as 'pixel'. */
export function styleById(id) {
  return registry.get(id) ?? null;
}

/** The ids of every registered style, in the order they were registered ('pixel' first). No arguments. */
export function styleIds() {
  return [...registry.keys()];
}

/** The styles a sprite can be drawn in, best first: its `styles` list, or ['pixel'] when it has none. sprite: a sprite definition. */
export function stylesOf(sprite) {
  const own = sprite && sprite.styles;
  return Array.isArray(own) && own.length ? [...own] : ['pixel'];
}

/** True when the sprite lists this style. sprite: a sprite definition; id: a style id. */
export function supports(sprite, id) {
  return stylesOf(sprite).includes(id);
}

/**
 * The style to draw a sprite in: the one asked for, or the sprite's first when none is. Throws, naming the styles
 * the sprite has, when it does not list the one asked for; there is no falling back to another style.
 * sprite: a sprite definition; id: a style id, or nothing.
 */
export function styleFor(sprite, id) {
  // read in place, no copies: this runs once for every frame drawn
  const own = sprite && sprite.styles, has = Array.isArray(own) && own.length > 0;
  const asked = id !== undefined && id !== null;
  const chosen = asked ? id : has ? own[0] : 'pixel';
  const style = registry.get(chosen);
  if (style && (!asked || (has ? own.includes(chosen) : chosen === 'pixel'))) return style;
  const name = sprite && sprite.id ? `sprite ${sprite.id}` : 'this sprite';
  const what = typeof chosen === 'string' ? `"${chosen}"` : String(chosen);
  throw new Error(`${name} cannot be drawn in the style ${what}${style ? '' : ' (there is no style with that name)'}. Its styles are: ${list(stylesOf(sprite))}`);
}

/**
 * Check a sprite's `styles` list and return a clean copy; throws with what to write instead. Used by defineSprite.
 * styles: what the sprite file wrote (undefined means ['pixel']); where: the start of the error message ("sprite coin").
 */
export function cleanStyles(styles, where = 'sprite') {
  if (styles === undefined) return ['pixel'];
  if (!Array.isArray(styles)) throw new Error(`${where}: styles must be a list of style ids, best first, like ['pixel']`);
  if (!styles.length) throw new Error(`${where}: styles needs at least one style; leave it out for ['pixel']`);
  const seen = new Set();
  for (const id of styles) {
    if (!registry.has(id)) throw new Error(`${where}: ${typeof id === 'string' ? `"${id}"` : String(id)} is not a style. The styles are: ${list(styleIds())} (a style made elsewhere must be loaded first: import its file in the sprite)`);
    if (seen.has(id)) throw new Error(`${where}: styles lists "${id}" twice; remove the repeat`);
    seen.add(id);
  }
  return [...styles];
}

/**
 * A pixel Surface of a finished frame, whatever it was drawn on: the frame itself for a style that draws on the
 * pixel grid, otherwise the style's own pixel picture of it. What previews and the quality bar look at.
 * surface: what renderFrame returned; id: the style it was drawn in.
 */
export function pixelsOf(surface, id = 'pixel') {
  const style = registry.get(id);
  return style && style.toPixels ? style.toPixels(surface) : surface;
}

/**
 * Apply a whole-bundle look to a finished frame of any style, in place.
 * surface: what renderFrame returned; id: the style it was drawn in; apply: (Uint32Array of packed colours) => void,
 * for example (pixels) => applyColour(pixels, theme.colour) from theme.js.
 */
export function recolourFrame(surface, id, apply) {
  const style = registry.get(id);
  if (style && style.recolour) style.recolour(surface, apply);
  else apply(surface.data);
  return surface;
}

/**
 * Export a sprite as files in one of its styles: asks that style's sheet exporter. Resolves to
 * { style, files: [{ name, bytes, type }], data }, where data is the JSON that ships with the files.
 * sprite, params: the sprite and its settings; options: { style (the sprite's first when left out), scale = 1,
 * clips (all of them when left out), recolour (a look: (Uint32Array of packed colours) => void, or null),
 * encodePng(width, height, rgbaBytes) -> PNG bytes or a promise of them (needed by styles that make a PNG:
 * tools/png.mjs in Node, a canvas in the browser) }. Rejects for a style the sprite does not list.
 */
export async function exportSheet(sprite, params, options = {}) {
  const style = styleFor(sprite, options.style);
  const out = await style.exporters.sheet(sprite, params, { ...options, style: style.id });
  if (!out || !Array.isArray(out.files) || out.data === null || typeof out.data !== 'object') throw new Error(`style "${style.id}": its sheet exporter must return { files: [{ name, bytes, type }], data }`);
  return { style: style.id, files: out.files, data: out.data };
}

/**
 * The sheet exporter of every style that draws on the pixel grid: one PNG with a row per clip, and the sheet's
 * JSON (renderSheet's meta, which says `style` when it is not pixel). Returns { files: [{ name, bytes, type }], data }.
 * sprite, params: the sprite and its settings; options: { style, scale, clips, recolour, encodePng } as exportSheet passes them.
 */
export async function pngSheet(sprite, params, { style = 'pixel', scale = 1, clips, recolour = null, encodePng } = {}) {
  if (typeof encodePng !== 'function') throw new Error(`style "${style}" exports a PNG sheet, which needs options.encodePng(width, height, rgbaBytes): tools/png.mjs encodePNG in Node, a canvas in the browser`);
  const sheet = renderSheet(sprite, params, clips ? { scale, clips, style } : { scale, style });
  if (recolour) recolour(sheet.data);
  const bytes = await encodePng(sheet.w, sheet.h, new Uint8ClampedArray(sheet.data.buffer, sheet.data.byteOffset, sheet.data.byteLength));
  return { files: [{ name: sheet.meta.image, bytes, type: 'image/png' }], data: sheet.meta };
}

// ---- the styles on the site ---------------------------------------------------------------------------------------

defineStyle({
  id: 'pixel',
  label: 'Pixel art',
  about: 'Square pixels on a small grid, with a dark outline and three tones of shading.',
  makeSurface: (width, height) => new Surface(width, height),
  // no finish: the outline and the shading are drawn by the sprite itself, as they always were
  exporters: { sheet: pngSheet },
});
