// A grid of paint refs for generators that port whole-pixel drawing (build item B8): the coin's turned disc, the
// crate's container, the icon pen. Not a family module and registers nothing. A generator never touches a Surface
// (docs/data-sprites.md 3.1); it may still decide, pixel by pixel, which PAINT each pixel takes, by asking pure shape
// tests at pixel centres exactly as engine/surface.js fill does, and hand the result back as stamps (whole pixels,
// never turned) keyed to the paint refs its call named: "gold", "gold.dark", or a colour rule that engine/resolve.js
// works out per frame. So a port paints what the code it replaces painted, pixel for pixel, as data the draw list draws.
//
//   const g = new Pixels(0, 0, 32, 32);                       // origin and size, in the call's own coordinates
//   g.fill(0, 0, 32, 32, ellipseIn(16, 16, 6, 6), rampOf('gold'), { shade: 1, light: 1 });
//   return g.stamps();                                        // [{ kind: 'stamp', at, anchor: 'tl', rows, key }]
//
// Pure: no randomness, no clock, no DOM; runs the same in the browser and in Node.
import { MAX_STAMP } from './args.js';
import { ellipseIn, capsuleIn, rectIn } from '../surface.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const TONE_NAMES = ['light', 'base', 'dark', 'deep'];
/** The characters a stamp's key uses, in order: 62 paints at most in one stamp. */
const KEY_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** A paint ref as a colour rule can name it: a slot as it is, a slot tone as the ramp rule, a rule as it is ('ink', 'clear' and '.far' tones have no rule form and come back as they are). */
export function colourOf(ref) {
  if (typeof ref !== 'string') return ref;
  const dot = ref.indexOf('.');
  if (dot < 0) return ref;
  const slot = ref.slice(0, dot), t = ref.slice(dot + 1);
  if (t === 'base') return slot;
  return TONE_NAMES.includes(t) ? { rule: 'ramp', of: slot, tone: t } : ref;
}

/** One tone (light, base, dark, deep) of a paint ref, as a paint ref: "gold" -> "gold.dark"; a tone or a rule -> the ramp rule of it. */
export function toneOf(ref, tone) {
  if (tone === 'base') return ref;
  if (typeof ref === 'string' && ref.indexOf('.') < 0 && ref !== 'ink' && ref !== 'clear') return `${ref}.${tone}`;
  if (ref === 'ink' || ref === 'clear') return ref;
  return { rule: 'ramp', of: colourOf(ref), tone };
}

/** The three-tone ramp of a paint ref as paint refs ({ base, light, dark, deep }), what engine/color.js ramp gives for a colour. */
export function rampOf(ref) {
  return { base: ref, light: toneOf(ref, 'light'), dark: toneOf(ref, 'dark'), deep: toneOf(ref, 'deep') };
}

/** The colour rule for a blend of two paint refs (engine/color.js mix: amount 0 is all of a, 1 all of b). */
export function mixOf(a, b, amount) {
  return { rule: 'mix', of: colourOf(a), with: colourOf(b), amount };
}

/**
 * A grid of paint refs over a box of the call's coordinates (x0, y0 is the top-left pixel; w, h its size), with the
 * Surface calls the ports use: fill (exactly engine/surface.js fill: shade, light, clip, outline), blob, rect, ellipse,
 * capsule, limb, poly, dot, get, set, blit, bounds; shadow is the light's direction as on a Surface ([-1, 1]).
 */
export class Pixels {
  constructor(x0, y0, w, h) {
    this.x0 = Math.floor(x0); this.y0 = Math.floor(y0);
    this.w = Math.max(0, Math.floor(w)); this.h = Math.max(0, Math.floor(h));
    this.cells = new Int32Array(this.w * this.h);
    this.paints = [];
    this.index = new Map();
    this.shadow = [-1, 1];
  }

  /** The cell number of a paint ref (1 and up), added on first use. */
  id(ref) {
    const k = typeof ref === 'string' ? ref : JSON.stringify(ref);
    let i = this.index.get(k);
    if (i === undefined) { this.paints.push(ref); i = this.paints.length; this.index.set(k, i); }
    return i;
  }

  /** True when (x, y) (whole pixels) is inside the grid. */
  inside(x, y) { return x >= this.x0 && y >= this.y0 && x < this.x0 + this.w && y < this.y0 + this.h; }

  /** The paint ref of pixel (x, y), or null when it is empty or off the grid. */
  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return null;
    const c = this.cells[(y - this.y0) * this.w + (x - this.x0)];
    return c ? this.paints[c - 1] : null;
  }

  /** True when pixel (x, y) is painted. */
  has(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    return this.inside(x, y) && this.cells[(y - this.y0) * this.w + (x - this.x0)] !== 0;
  }

  /** Paints pixel (x, y) (floored) with a paint ref; null empties it. */
  set(x, y, ref) {
    x = Math.floor(x); y = Math.floor(y);
    if (!this.inside(x, y)) return this;
    this.cells[(y - this.y0) * this.w + (x - this.x0)] = ref === null ? 0 : this.id(ref);
    return this;
  }

  /** Paints pixel (x, y) (whole pixels) with a cell number from id(): the fast form of set for a paint used many times. */
  setId(x, y, i) {
    if (x >= this.x0 && y >= this.y0 && x < this.x0 + this.w && y < this.y0 + this.h) this.cells[(y - this.y0) * this.w + (x - this.x0)] = i;
    return this;
  }

  /** One pixel, as engine/surface.js dot. */
  dot(x, y, ref) { return this.set(x, y, ref); }

  /** engine/surface.js fill: every pixel whose centre is inside, the dark tone where (x + sx * shade, y + sy * shade) is not, the light tone where (x - sx * light, y - sy * light) is not. paint: a paint ref (flat) or { base, dark, light }. */
  fill(x0, y0, x1, y1, inside, paint, opt = {}) {
    const isRamp = isObj(paint) && Object.hasOwn(paint, 'base') && !Object.hasOwn(paint, 'rule');
    const base = isRamp ? paint.base : paint;
    const shade = opt.shade ?? (isRamp ? 1 : 0), light = opt.light ?? 0;
    const dark = isRamp ? paint.dark : base, lite = isRamp ? paint.light : base;
    const [sx, sy] = this.shadow;
    const clip = opt.clip, pad = opt.outline ? 1 : 0;
    const ax = Math.max(this.x0, Math.floor(x0) - pad), ay = Math.max(this.y0, Math.floor(y0) - pad);
    const bx = Math.min(this.x0 + this.w - 1, Math.ceil(x1) + pad), by = Math.min(this.y0 + this.h - 1, Math.ceil(y1) + pad);
    if (opt.outline) {
      const oc = this.id(opt.outline);
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        if (inside(cx, cy) || (clip && !clip(cx, cy))) continue;
        if (inside(cx + 1, cy) || inside(cx - 1, cy) || inside(cx, cy + 1) || inside(cx, cy - 1)) this.cells[(y - this.y0) * this.w + (x - this.x0)] = oc;
      }
    }
    let ib = 0, id = 0, il = 0;
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (!inside(cx, cy) || (clip && !clip(cx, cy))) continue;
      let c;
      if (shade && !inside(cx + sx * shade, cy + sy * shade)) c = id || (id = this.id(dark));
      else if (light && !inside(cx - sx * light, cy - sy * light)) c = il || (il = this.id(lite));
      else c = ib || (ib = this.id(base));
      this.cells[(y - this.y0) * this.w + (x - this.x0)] = c;
    }
    return this;
  }

  /** Several shape tests as one body (engine/surface.js blob); opt.minus cuts tests out. */
  blob(parts, paint, opt = {}) {
    const minus = opt.minus ?? [];
    const inside = (px, py) => { for (const m of minus) if (m(px, py)) return false; for (const f of parts) if (f(px, py)) return true; return false; };
    return this.fill(this.x0, this.y0, this.x0 + this.w, this.y0 + this.h, inside, paint, opt);
  }

  /** A rectangle with its top-left corner at (x, y) (engine/surface.js rect). */
  rect(x, y, w, h, paint, opt) {
    return this.fill(x, y, x + w, y + h, (cx, cy) => cx >= x && cx < x + w && cy >= y && cy < y + h, paint, opt);
  }

  /** An ellipse (engine/surface.js ellipse). */
  ellipse(cx, cy, rx, ry, paint, opt) {
    if (rx <= 0 || ry <= 0) return this;
    return this.fill(cx - rx, cy - ry, cx + rx, cy + ry, (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, paint, opt);
  }

  /** A thick line with round ends, its radius tapering from r0 to r1 (engine/surface.js capsule). */
  capsule(x0, y0, x1, y1, r0, r1, paint, opt) {
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6, R = Math.max(r0, r1);
    const inside = (px, py) => {
      let t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t), r = r0 + (r1 - r0) * t;
      return ex * ex + ey * ey <= r * r;
    };
    return this.fill(Math.min(x0, x1) - R, Math.min(y0, y1) - R, Math.max(x0, x1) + R, Math.max(y0, y1) + R, inside, paint, opt);
  }

  /** A limb exactly `width` pixels thick, its ends snapped (engine/surface.js limb). */
  limb(x0, y0, x1, y1, width, paint, opt) {
    const snap = width % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
    return this.capsule(snap(x0), snap(y0), snap(x1), snap(y1), width / 2, width / 2, paint, opt);
  }

  /** Copies every painted pixel of src onto this grid, moved by (dx, dy) whole pixels. */
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.cells[y * src.w + x];
      if (c) this.set(src.x0 + x + dx, src.y0 + y + dy, src.paints[c - 1]);
    }
    return this;
  }

  /** The box of painted pixels { x0, y0, x1, y1 } (inclusive), or null when nothing is painted. */
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.cells[y * this.w + x]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x0 === Infinity ? null : { x0: x0 + this.x0, y0: y0 + this.y0, x1: x1 + this.x0, y1: y1 + this.y0 };
  }

  /** A new empty grid over the same box, with the same light. */
  blank() { const g = new Pixels(this.x0, this.y0, this.w, this.h); g.shadow = [...this.shadow]; return g; }

  /**
   * The painted pixels as stamps (anchor 'tl', '.' see-through), cut into tiles of at most 32 x 32 from the top-left of
   * what is painted; each stamp's key maps a character to a paint ref. [] when nothing is painted. Options: { id }.
   */
  stamps(extra = {}) {
    const b = this.bounds();
    if (!b) return [];
    const out = [];
    for (let ty = b.y0; ty <= b.y1; ty += MAX_STAMP) for (let tx = b.x0; tx <= b.x1; tx += MAX_STAMP) {
      const w = Math.min(MAX_STAMP, b.x1 - tx + 1), h = Math.min(MAX_STAMP, b.y1 - ty + 1);
      const chars = new Map(), key = {}, rows = [];
      let any = false;
      for (let y = ty; y < ty + h; y++) {
        let row = '';
        for (let x = tx; x < tx + w; x++) {
          const c = this.cells[(y - this.y0) * this.w + (x - this.x0)];
          if (!c) { row += '.'; continue; }
          let ch = chars.get(c);
          if (ch === undefined) { ch = KEY_CHARS[chars.size]; chars.set(c, ch); key[ch] = this.paints[c - 1]; }
          row += ch; any = true;
        }
        rows.push(row);
      }
      if (any) out.push({ kind: 'stamp', at: [tx, ty], anchor: 'tl', rows, key, ...extra });
    }
    return out;
  }
}

/**
 * How many simple shape tests (one ellipse, rect or capsule test, one polygon edge, one pixel visited) a generator may
 * make for one unit of its cost (docs/data-sprites.md 3.4 rule 2). The pixel generators charge their work at this rate
 * on top of what they return, so a frame within the budget (GEN_LIMITS.primitives, 4,000) makes at most about 16
 * million: measured at 1 to 5 ns a test (B8's calibration), so at most some 75 ms a frame, however hostile the call.
 * tests/unit/gen-b8-safety.test.mjs holds each call's run time to its cost.
 */
export const WORK_PER_COST = 4096;

/** The cost of `tests` simple shape tests at WORK_PER_COST (see there), rounded up. */
export const workCost = (tests) => Math.ceil(Math.max(0, tests) / WORK_PER_COST);

/** engine/surface.js polyIn with the points in flat arrays: the same test, the same arithmetic, some fifteen times faster. */
export function polyTest(pts) {
  const n = pts.length, X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = pts[i][0]; Y[i] = pts[i][1]; }
  return (px, py) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = X[i], yi = Y[i], xj = X[j], yj = Y[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}

const pairOf = (v) => (Array.isArray(v) ? v : [v, v]);
const RAD = Math.PI / 180;

/** The shape test (engine/surface.js) of one plain shape: ellipse (r, turn), poly, capsule (from, to, r), limb (width), rect; null for anything else. */
export function shapeTest(p) {
  if (!isObj(p)) return null;
  switch (p.kind) {
    case 'ellipse': {
      const [rx, ry] = pairOf(p.r), t = (p.turn ?? 0) * RAD;
      if (!t) return ellipseIn(p.at[0], p.at[1], rx, ry);
      const c = Math.cos(t), s = Math.sin(t), [x, y] = p.at;
      return (px, py) => { const dx = px - x, dy = py - y; return ((dx * c + dy * s) / rx) ** 2 + ((dy * c - dx * s) / ry) ** 2 <= 1; };
    }
    case 'poly': return polyTest(p.points);
    case 'capsule': { const [r0, r1] = pairOf(p.r ?? 1); return capsuleIn(p.from[0], p.from[1], p.to[0], p.to[1], r0, r1); }
    case 'limb': { const r = (p.width ?? 1) / 2; return capsuleIn(p.from[0], p.from[1], p.to[0], p.to[1], r, r); }
    case 'rect': return rectIn(p.at[0], p.at[1], p.size[0], p.size[1]);
    default: return null;
  }
}

/** Upper bound on the stamps Pixels.stamps gives for a painted box of w x h pixels. */
export const tilesFor = (w, h) => Math.max(1, Math.ceil(Math.max(1, w) / MAX_STAMP)) * Math.max(1, Math.ceil(Math.max(1, h) / MAX_STAMP));

/** A copy of a grid leaned like engine/surface.js tilt: columns right of (px, py) sink and rows above it slide, so nothing goes soft; angle in radians. */
export function tilted(src, px, py, angle) {
  const out = src.blank();
  const k = Math.tan(angle);
  for (let y = src.y0; y < src.y0 + src.h; y++) for (let x = src.x0; x < src.x0 + src.w; x++) {
    const sy = y - Math.round((x + 0.5 - px) * k);
    const sx = x - Math.round((py - (sy + 0.5)) * k);
    const c = src.get(sx, sy);
    if (c !== null) out.set(x, y, c);
  }
  return out;
}

/** A copy of a grid keeping only the pixels in the box x0..x1, y0..y1 (engine/surface.js cropped). */
export function cropped(src, x0, y0, x1, y1) {
  const out = src.blank();
  const ax = Math.floor(x0), ay = Math.floor(y0), bx = Math.floor(x1), by = Math.floor(y1);
  for (let y = Math.max(ay, src.y0); y < Math.min(by, src.y0 + src.h); y++) for (let x = Math.max(ax, src.x0); x < Math.min(bx, src.x0 + src.w); x++) {
    const c = src.get(x, y);
    if (c !== null) out.set(x, y, c);
  }
  return out;
}

/** engine/icons.js iconTidy on a grid: one or two pixels standing alone on a flat run at least four longer are taken off. Changes the grid; returns it. */
export function tidied(g) {
  const on = (x, y) => g.has(x, y), gone = [];
  const X0 = g.x0, Y0 = g.y0, W = g.w, H = g.h;
  for (const turned of [0, 1]) {
    const at = (a, b) => (turned ? on(b, a) : on(a, b));
    const A0 = turned ? Y0 : X0, A = turned ? H : W, B0 = turned ? X0 : Y0, B = turned ? W : H;
    for (let b = B0; b < B0 + B; b++) for (let a = A0; a < A0 + A; a++) {
      if (!at(a, b) || at(a - 1, b)) continue;
      let e = a;
      while (at(e + 1, b)) e++;
      if (e - a < 2) for (const side of [-1, 1]) {
        let bare = true, held = true;
        for (let k = a; k <= e; k++) if (at(k, b - side)) bare = false;
        for (let k = a - 2; k <= e + 2; k++) if (!at(k, b + side)) held = false;
        if (bare && held) for (let k = a; k <= e; k++) gone.push(turned ? [b, k] : [k, b]);
      }
      a = e;
    }
  }
  for (const [x, y] of gone) g.set(x, y, null);
  return g;
}
