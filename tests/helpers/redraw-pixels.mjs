// Pixel records of redrawn library sprites (migration batch M4, after its first review: nothing in the project
// proved a redraw drew what the old code sprite drew). Before a code sprite is deleted, tools/redraw-pixels.mjs draws
// it at every case below and writes one hash per frame to tests/fixtures/redraw-pixels/<id>.json; the data file
// that replaces it is then held to those hashes by tests/unit/library-redraws-pixels.test.mjs, so the claim "the
// same pixels at every setting" can be re-run at any time without the old code.
//
//   redrawCases(sprite)        the cases a record holds, in order: every clip and frame at every Size step
//                              (SIZE_STEPS) and every mix of toggles and choices, at the default colours; then every
//                              swatch of every colour control alone; then every ready-made version
//   casesKey(cases)            a short hash of that list, so a record and a sprite agree on the cases
//   frameHash(img, recolour)   a hash of one drawn frame; recolour maps colours the redraw changed on purpose
//                              ('#rrggbb' new -> old) back first, so their pixels are still held exactly, and a
//                              replaced (old) colour the redraw still paints counts as a difference
// Node and browser alike (no imports beyond engine/sprite.js).
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';

/** The Size values a record holds: 0 to 1 in steps of 0.05 (the review found a cog that changed only between 0.59 and 0.74). */
export const SIZE_STEPS = Array.from({ length: 21 }, (_, i) => Math.round(i * 5) / 100);

/** The settings of a sprite a record draws, with its clips and frames: [{ clip, frame, params }] in a fixed order. */
export function redrawCases(sprite) {
  const P = sprite.params ?? {};
  let mixes = [{}];
  for (const [k, d] of Object.entries(P)) {
    let values = null;
    if (d.kind === 'toggle') values = [true, false];
    else if (d.kind === 'choice') values = d.options.map((o) => o.value);
    else if (d.kind === 'range' && k === 'size') values = SIZE_STEPS;
    if (values) mixes = mixes.flatMap((m) => values.map((v) => ({ ...m, [k]: v })));
  }
  for (const [k, d] of Object.entries(P)) if (d.kind === 'color') for (const s of d.swatches ?? []) mixes.push({ [k]: s });
  for (const v of sprite.versions ?? []) mixes.push({ ...(v.params ?? {}) });
  const out = [];
  for (const params of mixes) for (const [clip, c] of Object.entries(sprite.clips)) for (let frame = 0; frame < (c.frames ?? 1); frame++) out.push({ clip, frame, params });
  return out;
}

/** FNV-1a over a string or a list of 32-bit numbers: 8 hex digits. */
function fnv(values) {
  let h = 2166136261;
  for (const v of values) { h ^= v & 0xffff; h = Math.imul(h, 16777619); h ^= v >>> 16; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A short hash of a case list (clips, frames and settings in order), so a record and the sprite it holds agree. */
export const casesKey = (cases) => fnv([...JSON.stringify(cases.map((c) => [c.clip, c.frame, c.params]))].map((ch) => ch.charCodeAt(0)));

/** '#rrggbb' as the 32-bit pixel engine/sprite.js renderPixels gives (alpha in the top byte, red in the low one). */
const pixelOf = (hex) => { const n = parseInt(hex.slice(1), 16); return ((0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >>> 16)) >>> 0; };

/** A pixel no drawing gives (alpha 0x5a over a colour): what a replaced colour still painted by the redraw hashes as. */
const LEFTOVER = 0x5a00c0de;

/** One frame's hash: its size and every pixel, after `recolour` ({ '#new': '#old' }) maps the redraw's changed colours
 *  back. A pixel the redraw paints in an OLD colour of the map hashes as LEFTOVER first, so a redraw that paints both
 *  the new and the old shade where the code painted one (the M4 review's blind spot) no longer matches the record. */
export function frameHash(img, recolour = null) {
  const map = new Map(Object.entries(recolour ?? {}).map(([a, b]) => [pixelOf(a.toLowerCase()), pixelOf(b.toLowerCase())]));
  for (const old of new Set(map.values())) if (!map.has(old)) map.set(old, LEFTOVER);
  const out = [img.w, img.h];
  for (const v of img.data) { const p = v >>> 0; out.push(map.get(p) ?? p); }
  return fnv(out);
}

/** The hash of one case of a sprite: drawn as the site draws it, at its settings cleaned and filled with defaults. */
export const caseHash = (sprite, c, recolour = null) => frameHash(renderPixels(sprite, c.clip, c.frame, cleanParams(sprite, { ...defaultParams(sprite), ...c.params })), recolour);
