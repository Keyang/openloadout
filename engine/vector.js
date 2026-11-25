// The vector renderer of the flat style (Contract 12; docs/framework-api.md "Styles", "The flat style").
//
// The same draw list the pixel renderer (engine/draw-list.js) paints, drawn as true vector shapes: every primitive
// becomes exact polygons in float frame coordinates (an ellipse a smooth ellipse, a limb a round-capped stroke, a
// rect a rounded rectangle), nothing is snapped to the pixel grid, and each body is filled once with anti-aliased
// coverage at the output resolution. What makes it read as flat art rather than enlarged pixel art (the research
// in docs/framework-api.md, "The flat style"):
//   - shading is one hard cel shadow: the body minus itself moved toward the light (a crescent on the side away from
//     it), and an optional highlight the same way on the lit side; never pixel bands;
//   - the outline is a round stroke of even width round the silhouette (a distance field, so corners stay round),
//     drawn behind the fills;
//   - a dot is a round dot, a pixel stamp or pixel-font text is traced into shapes and smoothed (Chaikin), and its
//     smallest specks (eyes, rivets) become round dots;
//   - dither (a texture of single pixels) is left out; bands keep their colours, with smooth outer edges.
// Same order as drawList: the list is cut at its operations, z order between them, shapes of one group and z are one
// body, glow last. Pure: no DOM, no randomness; runs in Node and the browser.
//
//   renderVector(list, palette, { width, height, scale, shadow })  a Surface of width*scale x height*scale
//   VectorSurface                                                   records what drawList is asked to draw (styles.js)

import { Surface } from './surface.js';
import { pack, hexToRgb, col, INK } from './color.js';
import { paintOf, renderList, DRAW_LIST_KINDS, DRAW_LIST_OPS } from './draw-list.js';

const RAD = Math.PI / 180;
const SUB = 4;                     // sub-rows per output pixel (horizontal coverage is exact)
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pt = (v) => (Array.isArray(v) && v.length >= 2 && fin(v[0]) && fin(v[1]) ? [v[0], v[1]] : null);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const radii = (r) => (fin(r) ? (r >= 0 ? [r, r] : null) : Array.isArray(r) && fin(r[0]) ? [r[0], fin(r[1]) ? r[1] : r[0]] : null);

/** The look of the flat style, in sprite pixels (frame px) unless said otherwise. */
export const FLAT_LOOK = Object.freeze({
  outline: (w, h) => clamp(0.014 * Math.max(w, h), 0.6, 1.4),  // the outline's width: about 1.4% of the frame, 0.6 to 1.4 px
  shadeShare: 0.14,          // the cel shadow's crescent: this share of the body's smaller side, moved toward the light
  shadeMin: 0.6, shadeMax: 2.2,
  shadeFrom: 5,              // bodies narrower than this (limbs, trim) are one flat colour: a crescent on them reads as noise
  corner: (w, h) => (Math.min(w, h) < 2 ? 0 : Math.min(1.1, 0.3 * Math.min(w, h))),     // a rect's corner radius
  dot: 0.62,                 // a one-pixel dot's radius
  speck: 4,                  // a stamp's patch of at most this many pixels (in a 2 x 2 box) becomes a round dot
  staircase: 0.75,           // a traced outline within this many pixels of a straight line is that line (pixel stair-steps go)
  flattenStamps: true,       // a stamp's light, dark and deep tones of a slot are drawn in the slot's base colour
});

// ---- geometry: primitives as closed polygons [x0, y0, x1, y1, ...] in frame px ------------------------------------

function circle(cx, cy, r, n = 0) {
  const k = n || clamp(Math.ceil(r * 10), 12, 64), out = new Array(k * 2);
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; out[2 * i] = cx + r * Math.cos(a); out[2 * i + 1] = cy + r * Math.sin(a); }
  return out;
}
function ellipse(cx, cy, rx, ry, turn = 0) {
  const k = clamp(Math.ceil(Math.max(rx, ry) * 10), 16, 72), ct = Math.cos(turn), st = Math.sin(turn), out = new Array(k * 2);
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2, u = rx * Math.cos(a), v = ry * Math.sin(a);
    out[2 * i] = cx + u * ct - v * st; out[2 * i + 1] = cy + u * st + v * ct;
  }
  return out;
}
/** A stroke from a to b, r0 wide at a and r1 at b, with round ends: two discs and the band between them. */
function capsule(a, b, r0, r1 = r0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  const polys = [];
  if (r0 > 0) polys.push(circle(a[0], a[1], r0));
  if (r1 > 0) polys.push(circle(b[0], b[1], r1));
  if (L > 1e-6) {
    const nx = -dy / L, ny = dx / L;
    polys.push([a[0] + nx * r0, a[1] + ny * r0, b[0] + nx * r1, b[1] + ny * r1, b[0] - nx * r1, b[1] - ny * r1, a[0] - nx * r0, a[1] - ny * r0]);
  }
  return polys;
}
function roundRect(x, y, w, h, r) {
  if (r <= 0.01) return [x, y, x + w, y, x + w, y + h, x, y + h];
  const out = [], n = 6;
  const corner = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); out.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); } };
  corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
  return out;
}
/** An arc (rig convention: 0 down, 90 picture-right), thick wide; a ring when a0..a1 is the whole turn. */
function arc(cx, cy, r, a0, a1, thick) {
  const lo = Math.min(a0, a1), span = Math.min(Math.abs(a1 - a0), Math.PI * 2), ro = r + thick / 2, ri = Math.max(0, r - thick / 2);
  const k = clamp(Math.ceil(span * ro * 2), 8, 96), P = (rr, a) => [cx + rr * Math.sin(a), cy + rr * Math.cos(a)];
  if (span >= Math.PI * 2 - 1e-9) {
    const outer = [], inner = [];
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; outer.push(...P(ro, a)); inner.push(...P(ri, -a)); }
    return ri > 0 ? [orient(outer, 1), orient(inner, -1)] : [orient(outer, 1)];
  }
  const out = [];
  for (let i = 0; i <= k; i++) out.push(...P(ro, lo + (i / k) * span));
  for (let i = k; i >= 0; i--) out.push(...P(ri, lo + (i / k) * span));
  return [out];
}

/** The polygons of an area primitive (rect ellipse capsule limb line poly dot arc ring), or null when it is not one. */
export function shapePolys(p, look = FLAT_LOOK) {
  const out = rawPolys(p, look);
  if (!out) return null;
  return p.kind === 'ring' ? out : out.map((q) => orient(q, 1));
}
function rawPolys(p, look) {
  switch (p.kind) {
    case 'rect': {
      const a = pt(p.at), s = pt(p.size);
      if (!a || !s || s[0] <= 0 || s[1] <= 0) return null;
      return [roundRect(a[0], a[1], s[0], s[1], look.corner(s[0], s[1]))];
    }
    case 'ellipse': {
      const c = pt(p.at), r = radii(p.r);
      if (!c || !r || r[0] <= 0 || r[1] <= 0) return null;
      const turn = fin(p.turnRad) ? p.turnRad : fin(p.turn) ? p.turn * RAD : 0;
      return [ellipse(c[0], c[1], r[0], r[1], turn)];
    }
    case 'capsule': {
      const a = pt(p.from), b = pt(p.to), r = radii(p.r);
      return a && b && r ? capsule(a, b, r[0], r[1]) : null;
    }
    case 'limb': case 'line': {
      const a = pt(p.from), b = pt(p.to);
      if (!a || !b) return null;
      const w = Math.max(p.kind === 'line' ? 0.8 : 1, fin(p.kind === 'limb' ? p.width : p.thick) ? (p.kind === 'limb' ? p.width : p.thick) : 1);
      return capsule(a, b, w / 2);
    }
    case 'poly': {
      if (!Array.isArray(p.points) || p.points.length < 3) return null;
      const pts = p.points.map(pt);
      return pts.some((q) => !q) ? null : [pts.flat()];
    }
    case 'dot': {
      const a = pt(p.at);
      if (!a) return null;
      return fin(p.size) && p.size >= 2 ? [circle(Math.round(a[0]), Math.round(a[1]), 1.05)] : [circle(Math.floor(a[0]) + 0.5, Math.floor(a[1]) + 0.5, look.dot)];
    }
    case 'arc': case 'ring': {
      const c = pt(p.at);
      if (!c || !fin(p.r) || p.r < 0) return null;
      const thick = fin(p.thick) && p.thick > 0 ? p.thick : 1;
      if (p.kind === 'ring') return arc(c[0], c[1], p.r, 0, Math.PI * 2, thick);
      return fin(p.a0) && fin(p.a1) ? arc(c[0], c[1], p.r, p.a0 * RAD, p.a1 * RAD, thick) : null;
    }
    default: return null;
  }
}

/** Twice the signed area of a polygon (positive: clockwise on screen, y down). */
const area2 = (q) => { let s = 0; const n = q.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += q[2 * i] * q[2 * j + 1] - q[2 * j] * q[2 * i + 1]; } return s; };
/** The polygon turned to run one way (sign +1) or the other (-1): the parts of one body must all run the same way, or non-zero filling makes holes where they overlap. */
function orient(q, sign = 1) {
  if (Math.sign(area2(q)) === sign || q.length < 6) return q;
  const out = new Array(q.length), n = q.length / 2;
  for (let i = 0; i < n; i++) { out[2 * i] = q[2 * (n - 1 - i)]; out[2 * i + 1] = q[2 * (n - 1 - i) + 1]; }
  return out;
}
const boxOf = (polys) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of polys) for (let i = 0; i < q.length; i += 2) { if (q[i] < x0) x0 = q[i]; if (q[i] > x1) x1 = q[i]; if (q[i + 1] < y0) y0 = q[i + 1]; if (q[i + 1] > y1) y1 = q[i + 1]; }
  return [x0, y0, x1, y1];
};

// ---- pixels to shapes: stamps and pixel-font text -----------------------------------------------------------------

/** The outline loops of a set of pixels (cells: Set of y * W + x), as rectilinear polygons with holes reversed. */
function traceLoops(cells, W) {
  const inside = (x, y) => x >= 0 && x < W && cells.has(y * W + x);
  const next = new Map(), key = (x, y) => `${x},${y}`;
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); const l = next.get(k); if (l) l.push([bx, by]); else next.set(k, [[bx, by]]); };
  for (const c of cells) {
    const x = c % W, y = (c - x) / W;
    if (!inside(x, y - 1)) add(x, y, x + 1, y);
    if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [k0, list] of next) {
    while (list.length) {
      const [sx, sy] = k0.split(',').map(Number), loop = [sx, sy];
      let [cx, cy] = list.pop();
      let guard = 0;
      while (!(cx === sx && cy === sy) && guard++ < 100000) {
        loop.push(cx, cy);
        const l = next.get(key(cx, cy));
        if (!l || !l.length) break;
        [cx, cy] = l.pop();
      }
      loops.push(loop);
    }
  }
  // drop the points in the middle of straight runs
  return loops.map((q) => {
    const n = q.length / 2, out = [];
    for (let i = 0; i < n; i++) {
      const ax = q[2 * ((i + n - 1) % n)], ay = q[2 * ((i + n - 1) % n) + 1], bx = q[2 * i], by = q[2 * i + 1], cx = q[2 * ((i + 1) % n)], cy = q[2 * ((i + 1) % n) + 1];
      if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) out.push(bx, by);
    }
    return out.length >= 6 ? out : q;
  });
}
/** Ramer-Douglas-Peucker on a closed polygon: a pixel staircase within `eps` of a straight line becomes that line. */
function simplify(q, eps) {
  const n = q.length / 2;
  if (n <= 4) return q;
  const P = (i) => [q[2 * (i % n)], q[2 * (i % n) + 1]];
  // split at the two points farthest apart, then simplify each half as an open chain
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < n; i++) { const [x, y] = P(i), [x0, y0] = P(0), d = (x - x0) ** 2 + (y - y0) ** 2; if (d > best) { best = d; b = i; } }
  best = -1;
  for (let i = 0; i < n; i++) { const [x, y] = P(i), [xb, yb] = P(b), d = (x - xb) ** 2 + (y - yb) ** 2; if (d > best) { best = d; a = i; } }
  const chain = (from, to) => { const out = []; for (let i = from; ; i = (i + 1) % n) { out.push(P(i)); if (i === to) break; } return out; };
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    const [x0, y0] = pts[0], [x1, y1] = pts[pts.length - 1], L = Math.hypot(x1 - x0, y1 - y0) || 1;
    let far = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((x1 - x0) * (y0 - pts[i][1]) - (x0 - pts[i][0]) * (y1 - y0)) / L; if (d > far) { far = d; at = i; } }
    if (far <= eps) return [pts[0], pts[pts.length - 1]];
    const l = rdp(pts.slice(0, at + 1)), r = rdp(pts.slice(at));
    return [...l.slice(0, -1), ...r];
  };
  const one = rdp(chain(a, b)), two = rdp(chain(b, a));
  const out = [...one.slice(0, -1), ...two.slice(0, -1)];
  return out.length >= 3 ? out.flat() : q;
}

/** Chaikin corner cutting, closed: each corner cut at a quarter of its two edges. */
function chaikin(q, rounds = 2) {
  for (let r = 0; r < rounds; r++) {
    const n = q.length / 2, out = [];
    for (let i = 0; i < n; i++) {
      const ax = q[2 * i], ay = q[2 * i + 1], bx = q[2 * ((i + 1) % n)], by = q[2 * ((i + 1) % n) + 1];
      out.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by);
    }
    q = out;
  }
  return q;
}
/** Groups of 4-connected cells. */
function components(cells, W) {
  const seen = new Set(), out = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const comp = new Set([c]), stack = [c];
    seen.add(c);
    while (stack.length) {
      const k = stack.pop(), x = k % W;
      for (const n of [k - W, k + W, x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1]) if (n >= 0 && cells.has(n) && !seen.has(n)) { seen.add(n); comp.add(n); stack.push(n); }
    }
    out.push(comp);
  }
  return out;
}
/** A patch of pixels as smooth shapes: a speck (at most `speck` pixels in a 2 x 2 box) is a round dot, anything else its traced outline rounded. */
function patchPolys(cells, W, look) {
  const out = [];
  // pixels that touch only at a corner (a diagonal line of pixel art) are one line: bridge each such corner with one pixel
  const has = (x, y) => x >= 0 && x < W && y >= 0 && cells.has(y * W + x);
  const bridged = new Set(cells);
  for (const c of cells) {
    const x = c % W, y = (c - x) / W;
    for (const dx of [-1, 1]) if (has(x + dx, y + 1) && !has(x + dx, y) && !has(x, y + 1)) bridged.add((y + 1) * W + x);
  }
  cells = bridged;
  for (const comp of components(cells, W)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of comp) { const x = c % W, y = (c - x) / W; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (comp.size <= look.speck && bw <= 2 && bh <= 2) out.push(ellipse(x0 + bw / 2, y0 + bh / 2, Math.max(look.dot, bw / 2 + 0.08), Math.max(look.dot, bh / 2 + 0.08)));
    else {
      const loops = traceLoops(comp, W);
      // the outer loop (the largest) runs clockwise, holes the other way, so a hole stays a hole when bodies are joined
      const flip = Math.sign(area2(loops.reduce((m, q) => (Math.abs(area2(q)) > Math.abs(area2(m)) ? q : m), loops[0]))) < 0;
      for (const loop of loops) out.push(chaikin(simplify(flip ? orient(loop, -Math.sign(area2(loop))) : loop, comp.size > 12 ? look.staircase : 0.3), comp.size > 12 ? 3 : 2));
    }
  }
  return out;
}
/** A stamp or text drawn by the pixel renderer, then traced: [{ polys, hex }], the silhouette first in its main colour. */
function pixelShapes(p, palette, w, h, look) {
  // flat art has one colour a material: a stamp's tones of one slot (its pixel shading) become that slot's base colour
  const key = isObj(p.key) ? Object.fromEntries(Object.entries(p.key).map(([k, ref]) => [k, look.flattenStamps && typeof ref === 'string' && /^[a-z][\w-]*\.(light|dark|deep)$/i.test(ref) ? `${ref.slice(0, ref.lastIndexOf('.'))}.base` : ref])) : p.key;
  const { g } = renderList(w, h, [{ ...p, ...(key ? { key } : {}), z: 0, group: undefined, glow: false, id: undefined }], { palette });
  const byColour = new Map(), all = new Set();
  for (let i = 0; i < g.data.length; i++) {
    const v = g.data[i];
    if (!(v >>> 24)) continue;
    all.add(i);
    const s = byColour.get(v); if (s) s.add(i); else byColour.set(v, new Set([i]));
  }
  if (!all.size) return [];
  const hexOf = (v) => `#${[v & 255, (v >> 8) & 255, (v >> 16) & 255].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  const order = [...byColour.entries()].sort((a, b) => b[1].size - a[1].size);
  const out = [{ polys: patchPolys(all, w, look), hex: hexOf(order[0][0]) }];
  for (const [v, cells] of order.slice(1)) out.push({ polys: patchPolys(cells, w, look), hex: hexOf(v) });
  return out;
}

// ---- coverage: polygons to anti-aliased coverage at the output scale ------------------------------------------------

/** Coverage of the union of polys (non-zero), moved by (dx, dy) frame px, at `scale`, inside W x H: { x0, y0, w, h, cov } or null. */
function coverage(polys, scale, W, H, dx = 0, dy = 0) {
  const [bx0, by0, bx1, by1] = boxOf(polys);
  const x0 = Math.max(0, Math.floor((bx0 + dx) * scale)), y0 = Math.max(0, Math.floor((by0 + dy) * scale));
  const x1 = Math.min(W, Math.ceil((bx1 + dx) * scale)), y1 = Math.min(H, Math.ceil((by1 + dy) * scale));
  if (x1 <= x0 || y1 <= y0) return null;
  const w = x1 - x0, h = y1 - y0, cov = new Float32Array(w * h);
  const E = [];
  for (const q of polys) {
    const n = q.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = (q[2 * i] + dx) * scale, ay = (q[2 * i + 1] + dy) * scale, bx = (q[2 * j] + dx) * scale, by = (q[2 * j + 1] + dy) * scale;
      if (ay !== by) E.push(ax, ay, bx, by);
    }
  }
  const xs = [], ws = [];
  for (let sy = y0 * SUB; sy < y1 * SUB; sy++) {
    const yc = (sy + 0.5) / SUB;
    xs.length = 0; ws.length = 0;
    for (let e = 0; e < E.length; e += 4) {
      const ay = E[e + 1], by = E[e + 3];
      if ((ay <= yc) === (by <= yc)) continue;
      xs.push(E[e] + ((yc - ay) * (E[e + 2] - E[e])) / (by - ay));
      ws.push(by > ay ? 1 : -1);
    }
    if (xs.length < 2) continue;
    const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
    const row = (Math.floor(yc) - y0) * w;
    let wind = 0;
    for (let k = 0; k < idx.length - 1; k++) {
      wind += ws[idx[k]];
      if (!wind) continue;
      const sa = Math.max(x0, xs[idx[k]]), sb = Math.min(x1, xs[idx[k + 1]]);
      if (sb <= sa) continue;
      const ia = Math.floor(sa), ib = Math.min(x1 - 1, Math.floor(sb - 1e-9));
      for (let i = ia; i <= ib; i++) {
        const o = Math.min(sb, i + 1) - Math.max(sa, i);
        if (o > 0) cov[row + i - x0] += o / SUB;
      }
    }
  }
  for (let i = 0; i < cov.length; i++) if (cov[i] > 1) cov[i] = 1;
  return { x0, y0, w, h, cov };
}
const covAt = (C, x, y) => (C && x >= C.x0 && y >= C.y0 && x < C.x0 + C.w && y < C.y0 + C.h ? C.cov[(y - C.y0) * C.w + x - C.x0] : 0);

// ---- the canvas: premultiplied colour, painted body by body --------------------------------------------------------

class Canvas {
  constructor(W, H) { this.W = W; this.H = H; this.r = new Float32Array(W * H); this.g = new Float32Array(W * H); this.b = new Float32Array(W * H); this.a = new Float32Array(W * H); this.layers = new Map(); }
  /** Paint coverage C in colour(s): tones(i) -> [r, g, b] (0..1) for pixel i of C; source over. */
  over(C, tone) {
    if (!C) return;
    const { W } = this;
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) {
      const s = C.cov[y * C.w + x];
      if (s <= 0) continue;
      const i = (C.y0 + y) * W + C.x0 + x, [r, g, b] = tone(y * C.w + x, C.x0 + x, C.y0 + y), k = 1 - s;
      this.r[i] = r * s + this.r[i] * k; this.g[i] = g * s + this.g[i] * k; this.b[i] = b * s + this.b[i] * k; this.a[i] = s + this.a[i] * k;
    }
  }
  /** Take coverage C away (destination out). */
  clear(C) {
    if (!C) return;
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) {
      const s = C.cov[y * C.w + x];
      if (s <= 0) continue;
      const i = (C.y0 + y) * this.W + C.x0 + x, k = 1 - s;
      this.r[i] *= k; this.g[i] *= k; this.b[i] *= k; this.a[i] *= k;
    }
    for (const L of this.layers.values()) for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) L[(C.y0 + y) * this.W + C.x0 + x] *= 1 - C.cov[y * C.w + x];
  }
  /** Note where a group or id was painted (for an outline or tint of only that). */
  mark(keys, C) {
    if (!C) return;
    for (const k of keys) {
      const L = this.layers.get(k);
      if (!L) continue;
      for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const i = (C.y0 + y) * this.W + C.x0 + x; L[i] = Math.max(L[i], C.cov[y * C.w + x]); }
    }
  }
  /**
   * A round outline `width` output px wide in rgb, round the shape of `mask` (alpha 0..1; the canvas when left out):
   * behind everything (`behind`) or over what is beside the shape. A Euclidean distance field, so it is even and round.
   */
  outline(rgb, width, { mask = this.a, behind = true } = {}) {
    const { W, H } = this, INF = 1e20, d = new Float64Array(W * H);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] >= 0.5 ? 0 : INF;
    edt(d, W, H);
    for (let i = 0; i < d.length; i++) {
      const o = clamp(width + 1 - Math.sqrt(d[i]), 0, 1) * (mask[i] >= 0.5 ? 0 : 1);
      if (o <= 0 && !(mask[i] > 0 && mask[i] < 0.5)) continue;
      const s = mask[i] > 0 && mask[i] < 0.5 ? 1 : o;
      if (behind) { const k = s * (1 - this.a[i]); this.r[i] += rgb[0] * k; this.g[i] += rgb[1] * k; this.b[i] += rgb[2] * k; this.a[i] += k; }
      else { const k = 1 - s * (1 - mask[i]); const t = s * (1 - mask[i]); this.r[i] = rgb[0] * t + this.r[i] * k; this.g[i] = rgb[1] * t + this.g[i] * k; this.b[i] = rgb[2] * t + this.b[i] * k; this.a[i] = t + this.a[i] * k; }
    }
  }
  /** Every painted pixel (weighted by `mask` when given) becomes rgb: a hit flash. */
  tint(rgb, mask = null) {
    for (let i = 0; i < this.a.length; i++) {
      const w = mask ? mask[i] : 1, a = this.a[i];
      if (!a || !w) continue;
      this.r[i] = rgb[0] * a * w + this.r[i] * (1 - w); this.g[i] = rgb[1] * a * w + this.g[i] * (1 - w); this.b[i] = rgb[2] * a * w + this.b[i] * (1 - w);
    }
  }
  toSurface() {
    const s = new Surface(this.W, this.H);
    for (let i = 0; i < this.a.length; i++) {
      const a = this.a[i];
      if (a < 1 / 255) continue;
      s.data[i] = pack(Math.round(clamp(this.r[i] / a, 0, 1) * 255), Math.round(clamp(this.g[i] / a, 0, 1) * 255), Math.round(clamp(this.b[i] / a, 0, 1) * 255), Math.round(clamp(a, 0, 1) * 255));
    }
    return s;
  }
}

/** Squared Euclidean distance transform in place (Felzenszwalb and Huttenlocher), rows then columns. */
function edt(d, W, H) {
  const n = Math.max(W, H), f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n), out = new Float64Array(n);
  const pass = (len, get, set) => {
    for (let i = 0; i < len; i++) f[i] = get(i);
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s;
      while (true) { const p = v[k]; s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k] && k > 0) k--; else break; }
      if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; out[q] = (q - p) * (q - p) + f[p]; }
    for (let i = 0; i < len; i++) set(i, out[i]);
  };
  for (let y = 0; y < H; y++) pass(W, (x) => d[y * W + x], (x, val) => { d[y * W + x] = val; });
  for (let x = 0; x < W; x++) pass(H, (y) => d[y * W + x], (y, val) => { d[y * W + x] = val; });
}

const rgbOf = (hex) => hexToRgb(hex).map((c) => c / 255);

// ---- the list: the same order and bodies as drawList ----------------------------------------------------------------

/**
 * Draw a list as flat vector art. Returns a Surface of width*scale x height*scale with straight alpha.
 * list, palette: as drawList takes them (generators and pieces already expanded); options { width, height (frame px),
 * scale (output px a frame px, default 4), shadow ([x, y], the side away from the light, default [-1, 1]), look }.
 */
export function renderVector(list, palette = {}, { width, height, scale = 4, shadow = [-1, 1], look = FLAT_LOOK } = {}) {
  const fw = Math.max(1, Math.round(width)), fh = Math.max(1, Math.round(height)), W = fw * scale, H = fh * scale;
  const cv = new Canvas(W, H);
  const items = [], entries = Array.isArray(list) ? list : [];
  entries.forEach((p, i) => {
    if (!isObj(p) || p.hidden === true || typeof p.kind !== 'string') return;
    if (!DRAW_LIST_KINDS.includes(p.kind) && !DRAW_LIST_OPS.includes(p.kind)) return;
    items.push({ p, i, z: fin(p.z) ? clamp(p.z, -1000, 1000) : 0, group: typeof p.group === 'string' ? p.group : null, id: typeof p.id === 'string' ? p.id : null, glow: p.glow === true, op: DRAW_LIST_OPS.includes(p.kind) });
  });
  // what an operation names with `only` gets a layer of its own; cuts with `from` are taken out of those bodies wherever they are painted
  for (const it of items) if (it.op && typeof it.p.only === 'string' && !cv.layers.has(it.p.only)) cv.layers.set(it.p.only, new Float32Array(W * H));
  const cutsFrom = new Map();
  for (const it of items) if (it.op && it.p.kind === 'cut' && typeof it.p.from === 'string' && isObj(it.p.shape)) {
    const polys = shapePolys(it.p.shape, look);
    if (polys) { const l = cutsFrom.get(it.p.from) ?? []; l.push(...polys); cutsFrom.set(it.p.from, l); }
  }
  const sh = Math.hypot(shadow[0], shadow[1]) || 1, ux = shadow[0] / sh, uy = shadow[1] / sh;
  const outlineW = look.outline(fw, fh) * scale;

  const paintBody = (members) => {
    const head = members[0], p = head.p;
    const paint = paintOf(p.paint, palette, { far: p.far === true && !head.glow });
    if (paint === null) return;
    let polys = [];
    for (const m of members) { const q = shapePolys(m.p, look); if (q) polys.push(...q); }
    if (!polys.length) return;
    let C = coverage(polys, scale, W, H);
    if (!C) return;
    const minus = [...(head.group ? cutsFrom.get(head.group) ?? [] : []), ...members.flatMap((m) => (m.id && m.id !== m.group ? cutsFrom.get(m.id) ?? [] : []))];
    if (minus.length) {
      const K = coverage(minus, scale, W, H);
      if (K) for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) C.cov[y * C.w + x] *= 1 - covAt(K, C.x0 + x, C.y0 + y);
    }
    const keys = [head.group, ...members.map((m) => m.id)].filter((k) => k && cv.layers.has(k));
    if (isObj(paint) && paint.clear === true) { cv.clear(C); return; }      // 'clear' makes see-through
    const ramp = typeof paint === 'object' && paint !== null && typeof paint.base === 'string';
    const lone = members.length === 1 && (p.kind === 'dot' || p.kind === 'line');
    const shade = ramp && !head.glow && !lone ? clamp(fin(p.shade) ? p.shade : (p.kind === 'arc' || p.kind === 'ring' ? 0 : 1), 0, 3) : 0;
    const light = ramp && !head.glow && !lone && fin(p.light) ? clamp(p.light, 0, 2) : 0;
    const base = rgbOf(ramp ? paint.base : paint);
    const [bx0, by0, bx1, by1] = boxOf(polys), size = Math.min(bx1 - bx0, by1 - by0);
    if ((!shade && !light) || size < look.shadeFrom) { cv.over(C, () => base); cv.mark(keys, C); return; }
    const off = clamp(look.shadeShare * size, look.shadeMin, look.shadeMax);
    // the part that stays lit: the body moved toward the light, over itself; what it leaves uncovered is the crescent
    const S = shade ? coverage(polys, scale, W, H, -ux * off * shade, -uy * off * shade) : null;
    const L = light ? coverage(polys, scale, W, H, ux * off * light * 0.6, uy * off * light * 0.6) : null;
    const dark = rgbOf(paint.dark), lite = rgbOf(paint.light);
    const tone = (k, x, y) => {
      const c = C.cov[k];
      const s = shade ? Math.min(c, covAt(S, x, y)) : c, l = light ? Math.min(s, covAt(L, x, y)) : s;
      const dk = (c - s) / c, lt = (s - l) / c, bs = l / c;
      return [dark[0] * dk + lite[0] * lt + base[0] * bs, dark[1] * dk + lite[1] * lt + base[1] * bs, dark[2] * dk + lite[2] * lt + base[2] * bs];
    };
    cv.over(C, tone);
    cv.mark(keys, C);
  };

  const paintPixels = (it) => {
    for (const { polys, hex } of pixelShapes(it.p, palette, fw, fh, look)) {
      const C = coverage(polys, scale, W, H);
      cv.over(C, () => rgbOf(hex));
      cv.mark([it.group, it.id].filter((k) => k && cv.layers.has(k)), C);
    }
  };
  const paintBands = (it) => {
    const area = isObj(it.p.area) ? shapePolys(it.p.area, { ...look, corner: () => 0 }) : null;
    if (!area) return;
    const { g } = renderList(fw, fh, [{ ...it.p, z: 0, group: undefined, glow: false }], { palette });
    const C = coverage(area, scale, W, H);
    // each output pixel takes the colour of the band under it (the nearest drawn pixel at the edge)
    const near = (x, y) => {
      const fx = clamp(Math.floor(x / scale), 0, fw - 1), fy = clamp(Math.floor(y / scale), 0, fh - 1);
      for (let r = 0; r < 3; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const v = g.get(fx + i, fy + j); if (v >>> 24) return [(v & 255) / 255, ((v >> 8) & 255) / 255, ((v >> 16) & 255) / 255]; }
      return null;
    };
    if (!C) return;
    const out = { ...C, cov: C.cov.slice() }, cols = [];
    for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const c = near(C.x0 + x, C.y0 + y); cols.push(c); if (!c) out.cov[y * C.w + x] = 0; }
    cv.over(out, (k) => cols[k] ?? [0, 0, 0]);
  };

  const run = (list) => {
    list.sort((a, b) => a.z - b.z || a.i - b.i);
    const keyOf = (it) => (it.group && !['stamp', 'text', 'bands', 'dither'].includes(it.p.kind) ? `${it.z}\u0000${it.group}` : null);
    const bodies = new Map(), done = new Set();
    for (const it of list) { const k = keyOf(it); if (k) { const b = bodies.get(k); if (b) b.push(it); else bodies.set(k, [it]); } }
    for (const it of list) {
      const kind = it.p.kind;
      if (kind === 'dither') continue;                          // a texture of single pixels: not part of flat art
      if (kind === 'stamp' || kind === 'text') { paintPixels(it); continue; }
      if (kind === 'bands') { paintBands(it); continue; }
      const key = keyOf(it);
      if (key && done.has(key)) continue;
      if (key) done.add(key);
      paintBody(key ? bodies.get(key) : [it]);
    }
  };

  let seg = [];
  const glow = [];
  for (const it of items) {
    if (!it.op) { if (it.glow) glow.push(it); else seg.push(it); continue; }
    if (seg.length) { run(seg); seg = []; }
    const p = it.p;
    if (p.kind === 'outline') {
      const paint = paintOf(p.paint ?? 'ink', palette);
      const hex = typeof paint === 'string' ? paint : paint && paint.base ? paint.base : INK;
      if (typeof p.only === 'string') cv.outline(rgbOf(hex), outlineW * 0.6, { mask: cv.layers.get(p.only), behind: false });
      else cv.outline(rgbOf(hex), outlineW);
    } else if (p.kind === 'tint') {
      const paint = paintOf(p.paint, palette);
      const hex = typeof paint === 'string' ? paint : paint && paint.base ? paint.base : null;
      if (hex) cv.tint(rgbOf(hex), typeof p.only === 'string' ? cv.layers.get(p.only) : null);
    } else if (p.kind === 'cut' && p.from === undefined && isObj(p.shape)) {
      const polys = shapePolys(p.shape, look);
      if (polys) cv.clear(coverage(polys, scale, W, H));
    }
  }
  if (seg.length) run(seg);
  if (glow.length) run(glow);
  return cv.toSurface();
}

/** What a flat frame is drawn on: it keeps what drawList is asked to draw, and styles.js finishes it with renderVector. */
export class VectorSurface {
  constructor(w, h) { this.w = w; this.h = h; this.frame = [w, h]; this.shadow = [-1, 1]; this.drawn = []; }
  /** drawList hands its list here instead of painting pixels (engine/draw-list.js). */
  record(list, palette) { this.drawn.push({ list: Array.isArray(list) ? list.slice() : [], palette }); return { drawn: Array.isArray(list) ? list.length : 0, skipped: [], work: 0 }; }
  _nope() { throw new Error('a flat frame is drawn as shapes: it has no pixels to read until it is finished'); }
  get data() { return this._nope(); }
}

/** A finished picture of what a VectorSurface recorded, at `scale` output px a frame px. */
export function finishVector(g, scale = 4, look = FLAT_LOOK) {
  const [w, h] = g.frame;
  const list = [], palette = {};
  for (const d of g.drawn) { Object.assign(palette, d.palette); list.push(...d.list); }
  const out = renderVector(list, palette, { width: w, height: h, scale, shadow: g.shadow, look });
  out.flat = { w, h, scale };
  return out;
}
