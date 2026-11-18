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
