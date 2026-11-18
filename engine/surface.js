// A Surface is a small grid of pixels plus shape-drawing calls.
// Every shape is sampled at pixel centres with a hard edge: no anti-aliasing,
// no rotation of bitmaps. Because shapes are redrawn from joint positions each
// frame, limbs can sit at any angle and still be clean pixel art.
//
// Coordinates: pixel (x, y) covers the square [x, x+1) x [y, y+1); y grows down.
// Paint: a '#rrggbb' string (flat) or a ramp from color.js (shaded).

import { col } from './color.js';

// ---- shape tests ------------------------------------------------------------
// Each returns inside(px, py). Combine several with g.blob([...]) to paint them
// as ONE body: one shade band around the whole group and no seams at the joins.

/** Shape test for an ellipse centred on (cx, cy) with radii rx, ry: returns inside(px, py). */
export const ellipseIn = (cx, cy, rx, ry) => (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;

/** Shape test for a thick line with round ends from (x0, y0) to (x1, y1); its radius goes from r0 to r1. Returns inside(px, py). */
export function capsuleIn(x0, y0, x1, y1, r0, r1 = r0) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
  return (px, py) => {
    let t = ((px - x0) * dx + (py - y0) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t);
    const r = r0 + (r1 - r0) * t;
    return ex * ex + ey * ey <= r * r;
  };
}

/** Shape test for a polygon; pts = [[x, y], ...]. Returns inside(px, py). */
export function polyIn(pts) {
  const n = pts.length;
  return (px, py) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}

/** Shape test for a rectangle with its top-left corner at (x, y), w wide and h tall. Returns inside(px, py). */
export const rectIn = (x, y, w, h) => (px, py) => px >= x && px < x + w && py >= y && py < y + h;

/**
 * A grid of w x h pixels to draw on, all see-through to begin with. Every drawing call returns the Surface,
 * so calls chain. `data` holds one packed colour per pixel (0 = see-through); `shadow` is the way shade falls.
 */
export class Surface {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
    /** Direction the shadow falls, in pixels. Default: light from top-right. */
    this.shadow = [-1, 1];
  }

  /** Make every pixel see-through again. */
  clear() { this.data.fill(0); return this; }

  /** The packed colour of one pixel; 0 when it is see-through or outside the grid. */
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[y * this.w + x];
  }

  /** Set one pixel. */
  dot(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.data[y * this.w + x] = col(c);
    return this;
  }

  /**
   * Fill every pixel whose centre satisfies inside(cx, cy), within a bounding box.
   * opt.shade  – depth in px of the shadow band on the far-from-light side (ramp default 1, 0 = flat)
   * opt.light  – depth in px of the highlight band on the lit side (default 0)
   * opt.outline – colour: stamps a 1px rim around this shape before filling it
   * opt.clip   – extra predicate (cx, cy) => bool limiting where pixels land
   */
  fill(x0, y0, x1, y1, inside, paint, opt = {}) {
    const isRamp = typeof paint === 'object';
    const base = col(isRamp ? paint.base : paint);
    const shade = opt.shade ?? (isRamp ? 1 : 0);
    const light = opt.light ?? 0;
    const dark = isRamp ? col(paint.dark) : base;
    const lite = isRamp ? col(paint.light) : base;
    const [sx, sy] = this.shadow;
    const clip = opt.clip;
    const pad = opt.outline ? 1 : 0;
    const ax = Math.max(0, Math.floor(x0) - pad), ay = Math.max(0, Math.floor(y0) - pad);
    const bx = Math.min(this.w - 1, Math.ceil(x1) + pad), by = Math.min(this.h - 1, Math.ceil(y1) + pad);
    const { data, w } = this;
    if (opt.outline) {
      const oc = col(opt.outline);
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        if (inside(cx, cy)) continue;
        if (clip && !clip(cx, cy)) continue;
        if (inside(cx + 1, cy) || inside(cx - 1, cy) || inside(cx, cy + 1) || inside(cx, cy - 1)) data[y * w + x] = oc;
      }
    }
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (!inside(cx, cy)) continue;
      if (clip && !clip(cx, cy)) continue;
      let c = base;
      if (shade && !inside(cx + sx * shade, cy + sy * shade)) c = dark;
      else if (light && !inside(cx - sx * light, cy - sy * light)) c = lite;
      data[y * w + x] = c;
    }
    return this;
  }

  /**
   * Paint several shape tests as one merged body (see ellipseIn, capsuleIn, polyIn, rectIn).
   * opt.minus: a list of shape tests to cut out of the body (scalloped wing edges, open mouths).
   */
  blob(parts, paint, opt = {}) {
    const minus = opt.minus ?? [];
    const inside = (px, py) => {
      for (const m of minus) if (m(px, py)) return false;
      for (const f of parts) if (f(px, py)) return true;
      return false;
    };
    return this.fill(0, 0, this.w, this.h, inside, paint, opt);
  }

  /** Rectangle with its top-left corner at (x, y), w wide and h tall. */
  rect(x, y, w, h, paint, opt) {
    return this.fill(x, y, x + w, y + h, (cx, cy) => cx >= x && cx < x + w && cy >= y && cy < y + h, paint, opt);
  }

  /** Ellipse centred on (cx, cy) with radii rx, ry (all may be fractional). */
  ellipse(cx, cy, rx, ry, paint, opt) {
    if (rx <= 0 || ry <= 0) return this;
    return this.fill(cx - rx, cy - ry, cx + rx, cy + ry,
      (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, paint, opt);
  }

  /** Thick line with round ends; radius tapers from r0 at the start to r1 at the end. */
  capsule(x0, y0, x1, y1, r0, r1, paint, opt) {
    if (typeof r1 !== 'number') { opt = paint; paint = r1; r1 = r0; }
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
    const R = Math.max(r0, r1);
    const inside = (px, py) => {
      let t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t);
      const r = r0 + (r1 - r0) * t;
      return ex * ex + ey * ey <= r * r;
    };
    return this.fill(Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R, inside, paint, opt);
  }

  /**
   * A limb exactly `width` pixels thick. End points are snapped so the
   * thickness stays constant from frame to frame (no pixel shimmer).
   */
  limb(x0, y0, x1, y1, width, paint, opt) {
    const snap = width % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
    return this.capsule(snap(x0), snap(y0), snap(x1), snap(y1), width / 2, width / 2, paint, opt);
  }

  /** Filled polygon; pts = [[x, y], ...]. */
  poly(pts, paint, opt) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const n = pts.length;
    const inside = (px, py) => {
      let hit = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    return this.fill(x0, y0, x1, y1, inside, paint, opt);
  }

  /** 1px line (Bresenham). */
  line(x0, y0, x1, y1, c) {
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.dot(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /**
   * Part of a ring: centre (cx, cy), radius r, from angle a0 to a1, `thick` px wide.
   * Angles use the rig convention: 0 = down, PI/2 = forward (right), PI = up.
   */
  arc(cx, cy, r, a0, a1, thick, c, opt = {}) {
    const lo = Math.min(a0, a1), span = Math.abs(a1 - a0);
    const TAU = Math.PI * 2;
    const inside = (px, py) => {
      const dx = px - cx, dy = py - cy;
      const d = Math.hypot(dx, dy);
      if (Math.abs(d - r) > thick / 2) return false;
      let a = Math.atan2(dx, dy) - lo;
      a = ((a % TAU) + TAU) % TAU;
      return a <= span;
    };
    return this.fill(cx - r - thick, cy - r - thick, cx + r + thick, cy + r + thick, inside, c, { shade: 0, ...opt });
  }

  /**
   * Draw a 1px outline around everything drawn so far.
   * Shapes drawn after this call (sparks, slash trails) stay un-outlined.
   */
  outline(c, { corners = false } = {}) {
    const oc = col(c);
    const { w, h, data } = this;
    const hits = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[y * w + x]) continue;
      let n = this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1);
      if (!n && corners) n = this.get(x - 1, y - 1) || this.get(x + 1, y - 1) || this.get(x - 1, y + 1) || this.get(x + 1, y + 1);
      if (n) hits.push(y * w + x);
    }
    for (const i of hits) data[i] = oc;
    return this;
  }

  /** Replace every drawn pixel with one colour (hit flash). */
  tint(c) {
    const tc = col(c);
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) this.data[i] = tc;
    return this;
  }

  /** Copy another surface on top of this one, skipping its transparent pixels. */
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.data[y * src.w + x];
      if (!c) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      this.data[ty * this.w + tx] = c;
    }
    return this;
  }

  /** Bounding box of drawn pixels, or null when empty. */
  bounds() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.data[y * this.w + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  /** RGBA bytes, ready for ImageData or a PNG encoder. */
  bytes() {
    return new Uint8ClampedArray(this.data.buffer, this.data.byteOffset, this.data.length * 4);
  }
}

/**
 * Returns a copy of a Surface leaned by a small angle round (px, py), made only by sliding whole rows sideways and whole columns up or down, so every pixel is kept and no edge turns soft: a rocking crate, a wobbling signpost.
 * Arguments: src (the Surface to copy; it is not changed), px, py (the point that stays put, usually the foot), angle (radians, positive leans the top to the right; keep it under about 0.3).
 */
export function tilt(src, px, py, angle) {
  const out = new Surface(src.w, src.h);
  out.shadow = src.shadow;
  const k = Math.tan(angle);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    // undo the column slide (things right of the point sink), then the row slide (things above it move right)
    const sy = y - Math.round((x + 0.5 - px) * k);
    const sx = x - Math.round((py - (sy + 0.5)) * k);
    const c = src.get(sx, sy);
    if (c) out.data[y * src.w + x] = c;
  }
  return out;
}

/**
 * Returns a copy of a Surface leaned sideways by sliding whole rows only: each row moves `slope` px for every pixel it stands above row py, so a thin post, pole or stalk sways without breaking up and its foot stays where it is.
 * Arguments: src (the Surface to copy; it is not changed), py (the row that stays put, usually the ground line), slope (px sideways per px of height, positive to the right; 0.1 moves a point 30 px up by 3 px).
 */
export function lean(src, py, slope) {
  const out = new Surface(src.w, src.h);
  out.shadow = src.shadow;
  for (let y = 0; y < src.h; y++) {
    const dx = Math.round((py - (y + 0.5)) * slope);
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x - dx, y);
      if (c) out.data[y * src.w + x] = c;
    }
  }
  return out;
}

/**
 * Returns a copy of one upright strip of a Surface squeezed towards its hinge column by leaving out whole columns and rows, so every pixel stays hard: a door leaf, shutter or lid seen turning away on its hinge.
 * Arguments: src (the Surface holding the leaf; it is not changed), hinge (the column that stays put), width (how many columns the leaf has from the hinge: positive lies to its right, negative to its left), k (0..1: the share of its width that is still seen; 1 is face on), lift (px the bottom of the free edge rises, default 0), drop (px the top of the free edge falls, default 0).
 * Only the leaf is copied (what else is on src is left out), never thinner than one column; its top and bottom rows are those of its drawn pixels. Column d of the turned leaf (0 at the hinge) shows the leaf's own column floor((d + 0.5) * width / seen), where seen = round(width * k) is how many columns are left.
 */
export function swing(src, hinge, width, k, lift = 0, drop = 0) {
  const out = new Surface(src.w, src.h);
  out.shadow = src.shadow;
  const dir = width < 0 ? -1 : 1, W = Math.max(1, Math.abs(Math.round(width)));
  const vis = Math.max(1, Math.round(W * Math.min(1, Math.max(0, k))));
  let top = src.h, bottom = -1;
  for (let i = 0; i < W; i++) for (let y = 0; y < src.h; y++) if (src.get(hinge + dir * i, y)) { if (y < top) top = y; if (y > bottom) bottom = y; }
  if (bottom < 0) return out;
  const H = bottom - top + 1;
  for (let d = 0; d < vis; d++) {
    const f = vis > 1 ? d / (vis - 1) : 0, x = hinge + dir * d;
    const sx = hinge + dir * Math.min(W - 1, Math.floor(((d + 0.5) * W) / vis));
    const a = top + Math.round(drop * f), b = Math.max(a, bottom - Math.round(lift * f)), h = b - a + 1;
    if (x < 0 || x >= out.w) continue;
    for (let y = a; y <= b; y++) {
      const c = src.get(sx, top + Math.min(H - 1, Math.floor(((y - a + 0.5) * H) / h)));
      if (c && y >= 0 && y < out.h) out.data[y * out.w + x] = c;
    }
  }
  return out;
}

/**
 * Returns a copy of a Surface that keeps only the pixels inside a box, each where it was: one half of a lid that slides apart, one side of a thing that splits in two, a turned layer held inside the frame's border.
 * Arguments: src (the Surface to copy; it is not changed), x0, y0, x1, y1 (the box: columns x0 <= x < x1 and rows y0 <= y < y1 are kept).
 */
export function cropped(src, x0, y0, x1, y1) {
  const out = new Surface(src.w, src.h);
  out.shadow = src.shadow;
  const ax = Math.max(0, Math.floor(x0)), ay = Math.max(0, Math.floor(y0)), bx = Math.min(src.w, Math.floor(x1)), by = Math.min(src.h, Math.floor(y1));
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) out.data[y * src.w + x] = src.data[y * src.w + x];
  return out;
}

/**
 * Returns a copy of a Surface that keeps only the pixels a shape test allows, each where it was: a door leaf seen through its arched doorway, a picture inside a round frame, a layer held inside any outline.
 * Arguments: src (the Surface to copy; it is not changed), inside (a shape test (px, py) asked at each pixel's centre, such as ellipseIn or a sprite's own).
 */
export function masked(src, inside) {
  const out = new Surface(src.w, src.h);
  out.shadow = src.shadow;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.data[y * src.w + x];
    if (c && inside(x + 0.5, y + 0.5)) out.data[y * src.w + x] = c;
  }
  return out;
}

/**
 * Returns a copy of a Surface without its specks: every group of touching pixels (side by side or one above the other; corners do not count) smaller than `min` pixels is left out, so a layer of smoke, sparks or debris leaves no stray pixels.
 * Arguments: src (the Surface to copy; it is not changed), min (the fewest pixels a group needs to stay, default 4). Reads pixels back, so it suits the pixel style only.
 */
export function despeckle(src, min = 4) {
  const out = new Surface(src.w, src.h);
  out.shadow = src.shadow;
  const { w, h, data } = src, seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !data[start]) continue;
    const group = [start];
    seen[start] = 1;
    for (let k = 0; k < group.length; k++) {
      const i = group[k], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || seen[j] || !data[j]) continue;
        seen[j] = 1;
        group.push(j);
      }
    }
    if (group.length >= min) for (const i of group) out.data[i] = data[i];
  }
  return out;
}

/**
 * Draws a connected line one pixel wide through a list of points, each joined to the next by a straight 1 px line: a crease, crack, seam, wire or kinked stroke; returns the Surface.
 * Arguments: g (the Surface), pts ([[x, y], ...]: the points in order; one point draws one pixel, none draws nothing), colour (one flat colour, as g.line takes), options { closed (true also joins the last point back to the first) }.
 */
export function polyline(g, pts, colour, { closed = false } = {}) {
  if (pts.length === 1) g.dot(Math.floor(pts[0][0]), Math.floor(pts[0][1]), colour);
  for (let i = 1; i < pts.length; i++) g.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], colour);
  if (closed && pts.length > 2) g.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], colour);
  return g;
}

/**
 * The steepest slope lean() can be given before a Surface's picture comes within `margin` px of the left or right side of its frame: how far a sign, post or pole may sway and keep its border.
 * Arguments: src (the Surface holding the upright picture; it is only measured), py (the row that stays put, as lean takes it), margin (px to keep clear at each side, default 2: the outline and the empty border). Returns px sideways per px of height, 0 or more (0 when nothing is drawn above py).
 */
export function leanRoom(src, py, margin = 2) {
  const b = src.bounds();
  if (!b || py - b.y0 <= 0) return 0;
  return Math.max(0, Math.min(b.x0 - margin, src.w - margin - 1 - b.x1)) / (py - b.y0);
}

/**
 * Pastes a layer onto a Surface, moved by the least whole number of pixels that keeps its picture `margin` px clear of every side of the frame: a leaned, thrown or shaken layer that must never be clipped. Returns [dx, dy], the shift it used. Reads pixels back, so it suits the pixel style only.
 * Arguments: g (the Surface to paste onto); src (the layer; it is not changed); margin (px to keep clear on every side, default 2: the outline and the empty border); options { dx, dy (where the layer would go if it fitted, default 0 and 0) }.
 */
export function blitInside(g, src, margin = 2, { dx = 0, dy = 0 } = {}) {
  const b = src.bounds();
  if (!b) return [0, 0];
  const keep = (v, lo, hi) => Math.round(v < lo ? lo : v > hi ? hi : v);
  const sx = keep(dx, margin - b.x0, g.w - 1 - margin - b.x1), sy = keep(dy, margin - b.y0, g.h - 1 - margin - b.y1);
  g.blit(src, sx, sy);
  return [sx, sy];
}
