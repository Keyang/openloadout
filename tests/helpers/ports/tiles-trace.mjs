// Tracing a code tileset's pictures into stamps keyed to paints (migration batch M5: the writers of
// tests/helpers/ports/tiles-forest.mjs, tiles-cave.mjs and tiles-dungeon.mjs use it). No drawing code is copied: the
// frozen code tileset (tests/fixtures/code-sprites/) is rendered and its pixels are written down as stamps.
//
// axes: [{ key, levels: [[value, when-condition-or-null], ...] }] (a toggle: [[false, null], [true, [true]]]).
// For every grid point in order, the pixels that the stamps drawn so far (those of every point at or below it on
// each axis) leave wrong are drawn again, behind that point's conditions: so the stack is exact at every point.
//
// Which paint a pixel is written in: refMap (the first paint giving that colour at the default colours), nearMap (the
// nearest, counting misses) or lookMap (the first paint giving the code's colour at that pixel under every look asked
// for: the colours a pixel follows when someone picks another swatch, not only the colour it has at the defaults).
import { renderFrame } from '../../../engine/sprite.js';
import { col } from '../../../engine/color.js';
import { resolvePalette, paintHex } from '../../../engine/resolve.js';

const rgb = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
const hexText = (v) => `#${rgb(v).map((x) => x.toString(16).padStart(2, '0')).join('')}`;

/** colour (packed) -> ref, first ref wins, at the definition's default colours */
export function refMap(def, refs) {
  const pal = resolvePalette(def, {}), m = new Map();
  for (const r of refs) { const h = paintHex(r, pal, {}); if (!h) throw new Error('no colour for ' + r); const v = col(h); if (!m.has(v)) m.set(v, r); }
  return m;
}
/** colour (packed) -> ref: the exact ref when one gives it, else the nearest (RGB distance); `misses` counts each approximation */
export function nearMap(def, refs, misses = new Map(), params = {}) {
  const pal = resolvePalette(def, params), list = refs.map((r) => { const h = paintHex(r, pal, params); if (!h) throw new Error('no colour for ' + r); return [r, col(h)]; });
  return { get(v) {
    const hit = list.find(([, c]) => c === v); if (hit) return hit[0];
    if (!(v >>> 24)) return undefined;
    const [r, g, b] = rgb(v); let best = null, bd = Infinity;
    for (const [ref, c] of list) { const [R, G, B] = rgb(c); const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < bd) { bd = d; best = ref; } }
    const k = `${hexText(v)} -> ${typeof best === 'string' ? best : JSON.stringify(best)} (${Math.round(Math.sqrt(bd))})`; misses.set(k, (misses.get(k) ?? 0) + 1);
    return best;
  } };
}
/**
 * A paint chooser that reads the code under several looks: at(clip, params) gives { get(v, i) }, the first of `refs`
 * whose colour is the code's at pixel i under every look ({ ...params, ...look }; looks[0] should be {}). When none is,
 * the one right under the most looks (the first look counting `weight` times), and the miss is counted in `misses`.
 */
export function lookMap(code, def, refs, looks, { misses = new Map(), weight = 8 } = {}) {
  const frames = new Map(), paints = new Map();
  const frame = (clip, p) => { const k = `${clip}|${JSON.stringify(p)}`; if (!frames.has(k)) frames.set(k, renderFrame(code, clip, 0, p).data); return frames.get(k); };
  const paint = (ref, p) => {
    const k = `${JSON.stringify(ref)}|${JSON.stringify(p)}`;
    if (!paints.has(k)) { const h = paintHex(ref, resolvePalette(def, p), p); if (!h) throw new Error('no colour for ' + JSON.stringify(ref)); paints.set(k, col(h)); }
    return paints.get(k);
  };
  return { misses, at(clip, params) {
    const ps = looks.map((l) => ({ ...params, ...l }));
    return { get(v, i) {
      if (!(v >>> 24)) return undefined;
      let best = null, score = -1;
      for (const ref of refs) {
        let s = 0, all = true;
        ps.forEach((p, n) => { if (paint(ref, p) === frame(clip, p)[i]) s += n === 0 ? weight : 1; else all = false; });
        if (all) return ref;
        if (s > score) { score = s; best = ref; }
      }
      const k = `${clip} ${hexText(v)} -> ${typeof best === 'string' ? best : JSON.stringify(best)}`; misses.set(k, (misses.get(k) ?? 0) + 1);
      return best;
    } };
  } };
}
/** pixels split into groups that touch (8 ways) */
export function parts(px) {
  const left = new Set(px.keys()), out = [];
  while (left.size) {
    const first = left.values().next().value, group = new Map(), todo = [first];
    left.delete(first);
    while (todo.length) {
      const i = todo.pop(); group.set(i, px.get(i));
      const x = i % 32, y = Math.floor(i / 32);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = (y + dy) * 32 + x + dx; if (x + dx >= 0 && x + dx < 32 && left.has(j)) { left.delete(j); todo.push(j); } }
    }
    out.push(group);
  }
  return out.sort((a, b) => Math.min(...a.keys()) - Math.min(...b.keys()));
}
const KEYS = 'abcdefghijklmnopqrstuvwxyz';
/** One stamp of these pixels (index -> packed colour), each written in the paint byHex.get(colour, index) gives. */
export function stampOf(px, byHex, extra = {}) {
  const idx = [...px.keys()];
  const xs = idx.map((i) => i % 32), ys = idx.map((i) => Math.floor(i / 32));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const key = {}, letter = new Map(), rows = [];
  for (let y = y0; y <= y1; y++) {
    let row = '';
    for (let x = x0; x <= x1; x++) {
      const v = px.get(y * 32 + x);
      if (v === undefined) { row += '.'; continue; }
      const ref = byHex.get(v, y * 32 + x);
      if (!ref) throw new Error(`a colour that is no slot: ${hexText(v)} at ${x},${y}`);
      const id = typeof ref === 'string' ? ref : JSON.stringify(ref);
      if (!letter.has(id)) { if (letter.size >= KEYS.length) throw new Error('a stamp of more paints than keys'); letter.set(id, KEYS[letter.size]); key[KEYS[letter.size - 1]] = ref; }
      row += letter.get(id);
    }
    rows.push(row);
  }
  return { kind: 'stamp', at: [x0, y0], rows, key, ...extra };
}
/** the stamps that draw a code sprite's clip over `base` (packed colour, or a frame's pixels), exact on the grid of `axes` */
export function traceGrid(code, clip, params, axes, byHex, base) {
  const dims = axes.map((a) => a.levels.length);
  const points = [];
  const walk = (i, acc) => { if (i === axes.length) { points.push(acc); return; } for (let k = 0; k < dims[i]; k++) walk(i + 1, [...acc, k]); };
  walk(0, []);
  const stamps = [];   // { at: index vector, px: Map }
  const out = [];
  for (const pt of points) {
    const p = { ...params };
    axes.forEach((a, i) => { p[a.key] = a.levels[pt[i]][0]; });
    const want = renderFrame(code, clip, 0, p).data;
    const have = typeof base === 'number' ? new Uint32Array(1024).fill(base) : Uint32Array.from(base);
    for (const s of stamps) if (s.at.every((k, i) => k <= pt[i])) for (const [i, v] of s.px) have[i] = v;
    const px = new Map();
    for (let i = 0; i < 1024; i++) if (want[i] !== have[i]) px.set(i, want[i]);
    if (!px.size) continue;
    stamps.push({ at: pt, px });
    const when = {};
    axes.forEach((a, i) => { const w = a.levels[pt[i]][1]; if (w) when[a.key] = w; });
    const map = typeof byHex.at === 'function' ? byHex.at(clip, p) : byHex;
    for (const part of parts(px)) out.push(stampOf(part, map, Object.keys(when).length ? { when } : {}));
  }
  return out;
}
