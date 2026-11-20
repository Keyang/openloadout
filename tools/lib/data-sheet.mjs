// Small data sprites drawn into one contact sheet, for tools/gen.mjs and tools/piece.mjs (docs/data-sprites.md
// section 8 'Check', build item B9). Each cell is a one-clip loadout-sprite (version 2, a `pictures` body) holding the
// thing to look at, drawn by engine/data-sprite.js exactly as a data sprite naming it would be: colour slots with
// their tones, the outline, pieces loaded through the site's piece store. Nothing here is a second renderer.
//
//   const cell = sheetCell({ size: [32, 32], slots, draw, frames: 4, nodes })   -> { ok, sprite, errors }
//   const pic = cellFrames(cell, 4)                                      -> [Surface | null] (frames 0..3: phases 0, .25, .5, .75)
//   const { png, w, h } = sheetPng(rows, { cell: [32, 32], scale: 3 })  rows: [[Surface | null]]; transparent between cells
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame } from '../../engine/sprite.js';
import { encodePNG } from '../png.mjs';

/** Colours a sheet gives slots that have none of their own, distinct enough to tell apart: [{ hex, material }]. */
export const SHEET_COLOURS = Object.freeze([
  { hex: '#e8b23a', material: 'metal' }, { hex: '#3a6ea5', material: 'cloth' }, { hex: '#b0603a', material: 'earth' },
  { hex: '#3a8e4a', material: 'plant' }, { hex: '#a04ab0', material: 'magic' }, { hex: '#fff4c0', material: 'light' },
  { hex: '#d04848', material: 'paint' }, { hex: '#6a6a7a', material: 'stone' },
]);
/** The colour a sheet swaps a slot to, to show what that slot paints. */
export const SWAP_COLOUR = '#e0409a';

/**
 * One cell of a sheet as a data sprite: { ok, sprite, errors }. Never throws.
 * Arguments: { size ([w, h] in pixels), slots ([{ id, label?, default, material }]), draw (the pictures body's draw
 * list), frames (frames of its one looping clip, default 1), nodes (the body's nodes, for items drawn `on` one) }.
 */
export function sheetCell({ size, slots, draw, frames = 1, nodes }) {
  const definition = {
    format: 'loadout-sprite', version: 2, id: 'sheet-cell', name: 'Sheet cell', blurb: 'One cell of a tool contact sheet.',
    size: [...size], pivot: [Math.floor(size[0] / 2), size[1] - 1], grounded: false,
    palette: slots.map((s) => ({ id: s.id, label: s.label ?? s.id, default: s.default, material: s.material })),
    body: { pictures: { ...(nodes ? { nodes } : {}), draw } },
    clips: { idle: { frames, fps: Math.max(1, frames) } },
    preview: 'idle',
  };
  try {
    const r = makeDataSprite(definition);
    return r.ok ? { ok: true, sprite: r.sprite, errors: [] } : { ok: false, sprite: null, errors: r.errors };
  } catch (e) {
    return { ok: false, sprite: null, errors: [String(e?.message ?? e)] };
  }
}

/** The frames 0..n-1 of a cell's clip as Surfaces (null for a frame that could not be drawn, or for a cell that failed). */
export function cellFrames(cell, n = 1) {
  return Array.from({ length: n }, (_, f) => {
    if (!cell.ok) return null;
    try { return renderFrame(cell.sprite, 'idle', f, {}); } catch { return null; }
  });
}

/**
 * Lays rows of frames out as one PNG at `scale`: { png, w, h }. A null frame leaves its cell empty. Cells are `gap`
 * pixels apart (before scaling), and everything but the frames is transparent.
 * Arguments: rows ([[Surface | null]]), { cell ([w, h]), scale (default 3), gap (default 2) }.
 */
export function sheetPng(rows, { cell, scale = 3, gap = 2 } = {}) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const [cw, ch] = cell;
  const w = (cols * (cw + gap) + gap) * scale, h = (Math.max(1, rows.length) * (ch + gap) + gap) * scale;
  const out = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, ry) => row.forEach((g, cx) => {
    if (!g) return;
    const src = g.bytes();
    const ox = gap + cx * (cw + gap), oy = gap + ry * (ch + gap);
    for (let y = 0; y < Math.min(ch, g.h ?? ch) * scale; y++) {
      for (let x = 0; x < Math.min(cw, g.w ?? cw) * scale; x++) {
        const i = (Math.floor(y / scale) * (g.w ?? cw) + Math.floor(x / scale)) * 4;
        const o = ((oy * scale + y) * w + ox * scale + x) * 4;
        out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = src[i + 3];
      }
    }
  }));
  return { png: encodePNG(w, h, out), w, h };
}
