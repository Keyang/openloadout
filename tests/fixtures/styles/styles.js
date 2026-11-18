// Two styles that exist only to prove the style seam (docs/architecture.md, Contract 12).
// TEST FIXTURES: never registered on the shipped site, never listed on a real sprite. They are not good-looking.
//
//   silhouette    same pixel surface as `pixel`; its finish flattens every drawn pixel to one colour.
//                 Proves: a style can be a finish only, and reuse the PNG sheet exporter.
//   outline-svg   a different surface (it records the shape calls it understands instead of filling pixels)
//                 and a different exporter (one SVG file per frame instead of a PNG sheet).
//                 Proves: a second rendering pipeline and a second export pipeline plug in through the registry.
//
// A sprite that lists either one imports this file, so the style is registered before defineSprite checks the list.
import { defineStyle, styleById, pngSheet } from '../../../engine/styles.js';
import { renderSheet } from '../../../engine/sprite.js';
import { Surface } from '../../../engine/surface.js';
import { col, INK } from '../../../engine/color.js';

// ---- silhouette: a finish on the pixel surface ------------------------------------------------------------------

if (!styleById('silhouette')) defineStyle({
  id: 'silhouette',
  label: 'Silhouette',
  about: 'Only the outline shape, filled with one dark colour.',
  makeSurface: (width, height) => new Surface(width, height),
  finish: (surface) => { surface.tint(INK); },
  exporters: { sheet: pngSheet },
});

// ---- outline-svg: a surface that records shapes -----------------------------------------------------------------

/** The calls this surface keeps. Everything else a sprite calls is counted in `skipped` and draws nothing. */
export const UNDERSTOOD = ['ellipse', 'capsule', 'limb', 'poly', 'arc', 'rect'];
const IGNORED = ['dot', 'line', 'fill', 'blob', 'tint', 'blit'];
const NO_PIXELS = 'this surface records shapes and has no pixels to read or write; a sprite that reads pixels back stays in the pixel style';

const base = (paint) => col(typeof paint === 'object' && paint !== null ? paint.base : paint);

/** Stands in for engine/surface.js's Surface: the same calls, but shapes are kept as a list, not filled into a grid. */
export class ShapeRecorder {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.shadow = [-1, 1];      // sprites may set it; a flat style has no shade band, so it is not used
    this.ops = [];              // { kind, c (packed colour), ...numbers }
    this.skipped = {};          // call name -> how many times it was called and dropped
    for (const name of IGNORED) this[name] = () => { this.skipped[name] = (this.skipped[name] ?? 0) + 1; return this; };
  }
  clear() { this.ops = []; return this; }
  ellipse(cx, cy, rx, ry, paint) { if (rx > 0 && ry > 0) this.ops.push({ kind: 'ellipse', cx, cy, rx, ry, c: base(paint) }); return this; }
  rect(x, y, w, h, paint) { this.ops.push({ kind: 'rect', x, y, w, h, c: base(paint) }); return this; }
  capsule(x0, y0, x1, y1, r0, r1, paint) {
    if (typeof r1 !== 'number') { paint = r1; r1 = r0; }
    this.ops.push({ kind: 'capsule', x0, y0, x1, y1, r0, r1, c: base(paint) });
    return this;
  }
  limb(x0, y0, x1, y1, width, paint) { return this.capsule(x0, y0, x1, y1, width / 2, width / 2, paint); }
  poly(pts, paint) { this.ops.push({ kind: 'poly', pts: pts.map(([x, y]) => [x, y]), c: base(paint) }); return this; }
  arc(cx, cy, r, a0, a1, thick, paint) { this.ops.push({ kind: 'arc', cx, cy, r, a0, a1, thick, c: base(paint) }); return this; }
  /** The whole-figure outline: everything drawn so far gets a rim (in the SVG: the same shapes underneath, stroked). */
  outline(c) { this.ops.push({ kind: 'outline', c: col(c) }); return this; }
  get data() { throw new Error(NO_PIXELS); }
  get() { throw new Error(NO_PIXELS); }
  bounds() { throw new Error(NO_PIXELS); }
  bytes() { throw new Error(NO_PIXELS); }
}

/** A pixel picture of the recorded shapes, flat-coloured: what the site previews and the quality bar looks at. */
export function replay(rec) {
  const g = new Surface(rec.w, rec.h);
  const flat = { shade: 0 };
  for (const o of rec.ops) {
    if (o.kind === 'ellipse') g.ellipse(o.cx, o.cy, o.rx, o.ry, o.c, flat);
    else if (o.kind === 'rect') g.rect(o.x, o.y, o.w, o.h, o.c, flat);
    else if (o.kind === 'capsule') g.capsule(o.x0, o.y0, o.x1, o.y1, o.r0, o.r1, o.c, flat);
    else if (o.kind === 'poly') g.poly(o.pts, o.c, flat);
    else if (o.kind === 'arc') g.arc(o.cx, o.cy, o.r, o.a0, o.a1, o.thick, o.c);
    else if (o.kind === 'outline') g.outline(o.c);
  }
  return g;
}

const n = (v) => String(Math.round(v * 100) / 100);
const hex = (c) => `#${[c & 255, (c >>> 8) & 255, (c >>> 16) & 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** One recorded shape as SVG. rim: the outline colour (the shape is drawn in it, one pixel bigger all round), or null. */
function shapeSvg(o, rim) {
  const paint = rim === null ? `fill="${hex(o.c)}"` : `fill="${hex(rim)}" stroke="${hex(rim)}" stroke-width="2" stroke-linejoin="round"`;
  if (o.kind === 'ellipse') return `<ellipse cx="${n(o.cx)}" cy="${n(o.cy)}" rx="${n(o.rx)}" ry="${n(o.ry)}" ${paint}/>`;
  if (o.kind === 'rect') return `<rect x="${n(o.x)}" y="${n(o.y)}" width="${n(o.w)}" height="${n(o.h)}" ${paint}/>`;
  if (o.kind === 'poly') return `<polygon points="${o.pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" ${paint}/>`;
  if (o.kind === 'capsule') {
    // two round ends and the bar between them (the bar's corners are not exact tangent points when it tapers)
    const dx = o.x1 - o.x0, dy = o.y1 - o.y0, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len;
    const quad = [[o.x0 + px * o.r0, o.y0 + py * o.r0], [o.x1 + px * o.r1, o.y1 + py * o.r1], [o.x1 - px * o.r1, o.y1 - py * o.r1], [o.x0 - px * o.r0, o.y0 - py * o.r0]];
    return `<g ${paint}><circle cx="${n(o.x0)}" cy="${n(o.y0)}" r="${n(o.r0)}"/><circle cx="${n(o.x1)}" cy="${n(o.y1)}" r="${n(o.r1)}"/><polygon points="${quad.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}"/></g>`;
  }
  if (o.kind === 'arc') {
    // rig angles: 0 points down, PI/2 right, PI up
    const at = (a) => [o.cx + Math.sin(a) * o.r, o.cy + Math.cos(a) * o.r];
    const lo = Math.min(o.a0, o.a1), span = Math.min(Math.abs(o.a1 - o.a0), Math.PI * 2 - 0.001);
    const [sx, sy] = at(lo), [ex, ey] = at(lo + span);
    return `<path d="M${n(sx)} ${n(sy)}A${n(o.r)} ${n(o.r)} 0 ${span > Math.PI ? 1 : 0} 0 ${n(ex)} ${n(ey)}" fill="none" stroke="${hex(rim === null ? o.c : rim)}" stroke-width="${n(o.thick + (rim === null ? 0 : 2))}"/>`;
  }
  return '';
}

/** One frame as an SVG document. scale: how many screen pixels one sprite pixel takes. */
export function frameSvg(rec, scale = 1) {
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rec.w} ${rec.h}" width="${rec.w * scale}" height="${rec.h * scale}">`];
  // an outline call rims everything drawn before it: those shapes go in first, one pixel bigger, in the outline colour
  let from = 0;
  rec.ops.forEach((o, i) => {
    if (o.kind !== 'outline') return;
    for (const s of rec.ops.slice(from, i)) if (s.kind !== 'outline') out.push(shapeSvg(s, o.c));
    from = i + 1;
  });
  for (const o of rec.ops) if (o.kind !== 'outline') out.push(shapeSvg(o, null));
  out.push('</svg>');
  return out.join('\n') + '\n';
}

/** A whole-bundle look on recorded shapes: `apply` recolours a list of packed colours in place (engine/theme.js applyColour). */
function recolour(rec, apply) {
  const colours = Uint32Array.from(rec.ops.map((o) => o.c));
  apply(colours);
  rec.ops.forEach((o, i) => { o.c = colours[i]; });
}

/**
 * The outline-svg exporter: one SVG file per frame, and the sheet's JSON with each frame pointing at its file.
 * options: { scale, clips, recolour } as engine/styles.js exportSheet hands them over.
 */
function svgFrames(sprite, params, { scale = 1, clips, recolour: apply = null } = {}) {
  const sheet = renderSheet(sprite, params, clips ? { scale, clips, style: 'outline-svg' } : { scale, style: 'outline-svg' });
  const enc = new TextEncoder();
  const files = [];
  const frames = sheet.meta.frames.map((frame, i) => {
    const rec = sheet.surfaces[i];
    if (apply) recolour(rec, apply);
    const name = `frames/${frame.name}.svg`;
    files.push({ name, bytes: enc.encode(frameSvg(rec, scale)), type: 'image/svg+xml' });
    return { ...frame, x: 0, y: 0, file: name };
  });
  return { files, data: { ...sheet.meta, format: 'one SVG file per frame', frames } };
}

if (!styleById('outline-svg')) defineStyle({
  id: 'outline-svg',
  label: 'Outlined shapes',
  about: 'Smooth outlined shapes that stay sharp at any size, saved as one SVG picture per frame.',
  makeSurface: (width, height) => new ShapeRecorder(width, height),
  toPixels: replay,
  recolour,
  exporters: { sheet: svgFrames },
});
