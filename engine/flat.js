// The flat style (Contract 12): the same draw list as the pixel style, drawn with solid colours and smooth edges.
//
// How: a flat frame is drawn at SS x FLAT_SCALE times its size by the same renderer (engine/draw-list.js), with the
// list rewritten by flatPlan: every coordinate, radius and width is multiplied, shading bands are switched off (a slot
// paints its base tone), a dot becomes a round dot, a stamp becomes solid blocks, and an outline becomes a thin line.
// finish() then averages SS x SS blocks, which gives the smooth (anti-aliased) edge. The result is a picture of
// FLAT_SCALE x the frame size; pixelsOf (toPixels) gives the frame-size grid that previews and the quality bar read.
// Left out by design: dither (a texture of single pixels) and text (a pixel font): UNSUPPORTED. Pure; no DOM.

import { Surface } from './surface.js';
import { pack } from './color.js';
import { STAMP_ANCHORS } from './draw-list.js';

/** How many pixels a flat frame has for each pixel of the sprite's own frame. */
export const FLAT_SCALE = 4;
/** Drawing size over FLAT_SCALE: the edge is smoothed from SS x SS samples per output pixel. */
const SS = 2;
const S = FLAT_SCALE * SS;
/** Outline thickness, in drawing pixels (a half sprite pixel). */
const OUTLINE = 4;
/** Primitive kinds a flat frame leaves out (reported by the renderer as skipped, never an error). */
export const UNSUPPORTED = Object.freeze(['dither', 'text']);

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pt = (v) => (Array.isArray(v) && v.length >= 2 && fin(v[0]) && fin(v[1]) ? [v[0] * S, v[1] * S] : v);
const rad = (r) => (fin(r) ? r * S : Array.isArray(r) ? r.map((v) => (fin(v) ? v * S : v)) : r);

/** A surface a flat frame is drawn on: SS x FLAT_SCALE times the frame, carrying the plan drawList reads. */
export class FlatSurface extends Surface {
  constructor(w, h) {
    super(w * S, h * S);
    this.frame = [w, h];
    this.flatPlan = flatPlan;
  }
}

/** A shape (area or cut shape) scaled to drawing pixels. */
function shape(p) {
  if (!isObj(p)) return p;
  const o = { ...p };
  for (const f of ['at', 'from', 'to']) if (p[f] !== undefined) o[f] = pt(p[f]);
  if (Array.isArray(p.points)) o.points = p.points.map(pt);
  if (p.r !== undefined) o.r = rad(p.r);
  if (p.size !== undefined && p.kind === 'rect') o.size = pt(p.size);
  if (p.kind === 'limb' && fin(p.width)) o.width = Math.max(1, Math.round(p.width * S));
  if ((p.kind === 'arc' || p.kind === 'ring')) o.thick = (fin(p.thick) ? p.thick : 1) * S;
  if (p.kind === 'dot') return dotShape(p);
  return o;
}

/** A dot (one pixel, or a 2 x 2 block) is a round dot in a flat frame. */
function dotShape(p) {
  const a = Array.isArray(p.at) ? p.at : [0, 0], size = p.size === 2 ? 2 : 1;
  const cx = size === 2 ? Math.round(a[0]) : Math.floor(a[0]) + 0.5, cy = size === 2 ? Math.round(a[1]) : Math.floor(a[1]) + 0.5;
  const { kind, at, size: _s, ...rest } = p;
  return { ...rest, kind: 'ellipse', at: [cx * S, cy * S], r: (size * S) / 2 };
}

/** A stamp as solid rectangles: runs of one key across, merged down while the next row repeats the run. */
function stamp(p) {
  let rows = p.rows;
  if (typeof p.variant === 'string' && isObj(p.variants) && Object.hasOwn(p.variants, p.variant)) rows = p.variants[p.variant];
  const at = Array.isArray(p.at) && fin(p.at[0]) && fin(p.at[1]) ? p.at : null;
  if (!at || !Array.isArray(rows) || !rows.length || !isObj(p.key)) return [];
  const anchor = Object.hasOwn(STAMP_ANCHORS, p.anchor ?? 'tl') ? p.anchor ?? 'tl' : 'tl';
  const flip = p.mirror === true || p.mirror === 'x';
  const w = Math.max(...rows.map((r) => (typeof r === 'string' ? r.length : 0))), h = rows.length;
  let [ax, ay] = STAMP_ANCHORS[anchor];
  if (flip) ax = 1 - ax;
  const x0 = Math.round(at[0] - ax * w), y0 = Math.round(at[1] - ay * h);
  const { kind, at: _a, anchor: _n, rows: _r, key, variants, variant, mirror, id, ...rest } = p;
  const out = [], open = new Map();
  const close = (k, run) => { out.push({ ...rest, kind: 'rect', at: [run.x * S, run.y * S], size: [run.w * S, run.h * S], paint: key[run.ch] }); open.delete(k); };
  for (let j = 0; j <= h; j++) {
    const row = j < h && typeof rows[j] === 'string' ? rows[j] : '', here = new Set();
    for (let i = 0; i < row.length;) {
      const ch = row[i];
      if (ch === '.' || ch === ' ' || !Object.hasOwn(key, ch)) { i++; continue; }
      let e = i + 1;
      while (e < row.length && row[e] === ch) e++;
      const cx = flip ? w - e : i, k = `${cx}:${e - i}:${ch}`;
      here.add(k);
      const run = open.get(k);
      if (run) run.h++; else open.set(k, { x: x0 + cx, y: y0 + j, w: e - i, h: 1, ch });
      i = e;
    }
    for (const [k, run] of [...open]) if (!here.has(k)) close(k, run);
  }
  return out;
}

/**
 * The list and palette a flat surface draws: what drawList paints in place of the list it was given.
 * Returns { list, palette, glowRim }.
 */
export function flatPlan(list, palette) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (!isObj(p)) { out.push(p); continue; }
    const kind = p.kind;
    if (UNSUPPORTED.includes(kind)) continue;
    if (kind === 'outline') {
      for (let n = 0; n < OUTLINE; n++) out.push({ ...p, sides: n % 2 ? 'all' : 'outer' });
    } else if (kind === 'tint') {
      out.push(p);
    } else if (kind === 'cut') {
      out.push({ ...p, shape: shape(p.shape) });
    } else if (kind === 'stamp') {
      out.push(...stamp(p));
    } else if (kind === 'bands') {
      out.push({ ...p, area: shape(p.area) });
    } else if (kind === 'line') {
      out.push({ ...p, from: pt(p.from), to: pt(p.to), thick: Math.max(1, fin(p.thick) ? p.thick : 1) * S });
    } else {
      const s = shape(p);
      out.push({ ...s, shade: 0, light: 0 });
    }
  }
  return { list: out, palette, glowRim: false };
}

/** The finished frame: SS x SS blocks averaged into one pixel (colour weighted by how much of the block is covered). */
export function smooth(g) {
  const [w, h] = g.frame, W = w * FLAT_SCALE, H = h * FLAT_SCALE, out = new Surface(W, H);
  const src = g.data, sw = g.w;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, gr = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const v = src[(y * SS + j) * sw + x * SS + i], va = v >>> 24;
      if (!va) continue;
      a += va; r += (v & 255) * va; gr += ((v >> 8) & 255) * va; b += ((v >> 16) & 255) * va;
    }
    if (!a) continue;
    out.data[y * W + x] = pack(Math.round(r / a), Math.round(gr / a), Math.round(b / a), Math.round(a / (SS * SS)));
  }
  out.flat = { w, h, scale: FLAT_SCALE };
  out.raw = g;                       // the unsmoothed drawing: toGrid reads whole colours from it, never blends
  out.shadow = g.shadow;
  return out;
}

/**
 * The frame-size grid of a finished flat frame: a pixel is drawn where the drawing covers more than half of it, in the
 * colour that covers most of it (never a blend, so the grid has the colours the sprite was drawn with).
 */
export function toGrid(g) {
  const { w, h } = g.flat ?? { w: Math.round(g.w / FLAT_SCALE), h: Math.round(g.h / FLAT_SCALE) };
  const src = g.raw ?? g, sw = src.w, k = src.w / w, out = new Surface(w, h);
  const seen = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    seen.clear();
    let covered = 0, best = 0, bestN = 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const v = src.data[(y * k + j) * sw + x * k + i];
      if (v >>> 24 < 128) continue;
      covered++;
      const n = (seen.get(v) ?? 0) + 1;
      seen.set(v, n);
      if (n > bestN) { bestN = n; best = v; }
    }
    if (covered * 2 >= k * k) out.data[y * w + x] = pack(best & 255, (best >> 8) & 255, (best >> 16) & 255);
  }
  return out;
}
