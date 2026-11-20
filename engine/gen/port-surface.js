// A drawing grid for generators that port a whole code sprite's picture (migration batch M9, the interface pieces:
// fonts, input pictures, bubbles, counters, HUD glyphs). Not a family module and registers nothing.
//
// A generator never touches the site's Surface and never returns one (docs/data-sprites.md 3.1). A port still has to
// decide, pixel by pixel, which PAINT each pixel of the old picture took, and the old pictures were drawn with the
// Surface's calls (fill, blob, poly, line, arc, outline, tint, blit ...) in the frame's own pixels. PortSurface is a
// grid with exactly those calls and exactly that geometry (it is a Surface subclass that keeps, in each cell, the number
// of a PAINT REF in a shared table instead of a packed colour), so the old drawing code runs on it unchanged, with paint
// refs where it had colours, and the grid hands back stamps keyed to those refs. Colours the old code worked out from a
// colour (engine/color.js ramp, tone, mix, pick) become the colour rules of the same functions (rampP, toneP, mixP,
// pickP below), which engine/resolve.js works out per frame, so any colour a person picks shades as the code shaded it.
//
//   const g = new PortSurface(32, 32);                           // the old frame, in the old frame's pixels
//   g.ellipse(16, 16, 6, 6, rampP('body'), { shade: 1 });         // as the code drew it, with paint refs
//   g.outline(INK_P);
//   return g.stamps([at[0] - 16, at[1] - 16]);                    // moved so the old frame's (16, 16) is at `at`
//
// A port draws its old frame whole and moves the result by whole pixels, so it draws the same on a node as in frame
// pixels (tests/unit/gen-node-origin.test.mjs) and keeps the old frame's edges (an outline never reaches past them).
// Pure: no randomness, no clock, no DOM; runs the same in the browser and in Node.
import { Surface } from '../surface.js';
import { MAX_STAMP } from './args.js';
import { colourOf, rampOf, toneOf, mixOf } from './pixels.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** The characters a stamp's key uses, in order: 62 paints at most in one stamp (stamps() throws past that; it never drops a pixel). */
const KEY_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** The outline paint of the old code (engine/color.js INK) as a paint ref. */
export const INK_P = 'ink';

/** A paint ref as a generator may hand it on: a colour the old code wrote out ('#ffffff') becomes the identity `mix` rule of that colour (a generator's paints are never a bare hex, engine/gen/args.js); anything else as it is. Arguments: ref. */
export function fixed(ref) {
  return typeof ref === 'string' && HEX.test(ref) ? { rule: 'mix', of: ref.toLowerCase(), with: ref.toLowerCase(), amount: 0 } : ref;
}

/** The three-tone ramp of a paint ref ({ base, light, dark, deep }), as engine/color.js ramp gives it for a colour. Arguments: ref. */
export function rampP(ref) { return rampOf(fixed(ref)); }

/** A lighter (by above 0) or darker (below 0) tone of a paint ref, as engine/color.js tone: the `tone` colour rule (by held to -3..3). Arguments: ref, by. */
export function toneP(ref, by) {
  if (ref === 'clear') return ref;
  return { rule: 'tone', of: colourOf(fixed(ref)), by: Math.max(-3, Math.min(3, by)) };
}

/** A blend of two paint refs, as engine/color.js mix (amount 0 is all of a, 1 all of b): the `mix` colour rule. Arguments: a, b, amount. */
export function mixP(a, b, amount) { return mixOf(fixed(a), fixed(b), Math.max(0, Math.min(1, amount))); }

/** Whichever of up to four paint refs stands out most against another, as engine/color.js pick: the `standOut` colour rule. Arguments: against, ...from. */
export function pickP(against, ...from) { return { rule: 'standOut', against: colourOf(fixed(against)), from: from.slice(0, 4).map((x) => colourOf(fixed(x))) }; }

/** One tone (light, base, dark, deep) of a paint ref as a paint ref ("face" -> "face.dark"; a tone or a rule -> the ramp rule). Arguments: ref, tone. */
export function toneOfP(ref, tone) { return toneOf(fixed(ref), tone); }

/** The paint refs a group of PortSurfaces share, each with its cell number (1 and up; 0 is see-through). */
export class PaintTable {
  /** An empty table. No arguments. */
  constructor() { this.refs = []; this.index = new Map(); this.strings = new Map(); this.objects = new WeakMap(); }
  /** The cell number of a paint ref, added on first use; a falsy ref (no colour) is 0. Arguments: ref. */
  id(ref) {
    if (ref === null || ref === undefined || ref === false || ref === 0) return 0;
    // the same string or the same object again (a dot at a time): its number, without working out its key again
    const seen = typeof ref === 'string' ? this.strings.get(ref) : typeof ref === 'object' ? this.objects.get(ref) : undefined;
    if (seen !== undefined) return seen;
    const i = this.keyed(ref);
    if (typeof ref === 'string') this.strings.set(ref, i); else if (typeof ref === 'object') this.objects.set(ref, i);
    return i;
  }
  /** The cell number of a paint ref by its key (a written-out colour as its identity rule), added on first use. Arguments: ref. */
  keyed(ref) {
    // a colour the old code wrote out ('#ffffff') is kept as that colour: the identity mix rule, since a generator's
    // paints are slots, tones, ink, clear or colour rules, never a bare hex (engine/gen/args.js)
    ref = fixed(ref);
    const k = typeof ref === 'string' ? ref : JSON.stringify(ref);
    let i = this.index.get(k);
    if (i === undefined) { this.refs.push(ref); i = this.refs.length; this.index.set(k, i); }
    return i;
  }
  /** The paint ref of a cell number, or null for 0. Arguments: i. */
  ref(i) { return i ? this.refs[i - 1] : null; }
}

// The table every PortSurface made while a port runs shares (withPaintTable), so a ported helper's own scratch grids
// (`new Surface(w, h)` in the code it was copied from) blit onto the port's grid with their paints kept.
let current = null;

/** Runs fn() with one paint table shared by every PortSurface made meanwhile (nested calls keep the outer table); returns what fn returns. Arguments: fn. */
export function withPaintTable(fn) {
  if (current) return fn();
  current = new PaintTable();
  try { return fn(); } finally { current = null; }
}

/**
 * A Surface of paint refs: the site Surface's every call and its geometry, with each cell holding the number of a paint
 * ref in a PaintTable (shared by every grid made with blank(), so blit between them keeps paints). get() returns that
 * number (0 when empty), so code that only asks "is it painted" runs unchanged; paintAt() gives the ref.
 */
export class PortSurface extends Surface {
  /** A w x h grid of see-through pixels on a paint table (a new one when none is given). Arguments: w, h, table. */
  constructor(w, h, table = current ?? new PaintTable()) {
    super(w, h);
    this.table = table;
  }

  /** A new empty grid on the same paint table, w x h (default this one's size), with the same light. Arguments: w, h. */
  blank(w = this.w, h = this.h) {
    const s = new PortSurface(w, h, this.table);
    s.shadow = [...this.shadow];
    return s;
  }

  /** The paint ref of pixel (x, y), or null when it is empty or off the grid. Arguments: x, y. */
  paintAt(x, y) { return this.table.ref(this.get(x, y)); }

  /** One pixel in a paint ref (engine/surface.js dot). Arguments: x, y, ref. */
  dot(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.data[y * this.w + x] = this.table.id(c);
    return this;
  }

  /** engine/surface.js fill, painting paint refs: paint is a ref (flat) or a ramp { base, light, dark }. Arguments: x0, y0, x1, y1, inside, paint, opt { shade, light, outline, clip }. */
  fill(x0, y0, x1, y1, inside, paint, opt = {}) {
    const isRamp = isObj(paint) && Object.hasOwn(paint, 'base') && !Object.hasOwn(paint, 'rule');
    const T = this.table;
    const base = T.id(isRamp ? paint.base : paint);
    const shade = opt.shade ?? (isRamp ? 1 : 0);
    const light = opt.light ?? 0;
    const dark = isRamp ? T.id(paint.dark) : base;
    const lite = isRamp ? T.id(paint.light) : base;
    const [sx, sy] = this.shadow;
    const clip = opt.clip;
    const pad = opt.outline ? 1 : 0;
    const ax = Math.max(0, Math.floor(x0) - pad), ay = Math.max(0, Math.floor(y0) - pad);
    const bx = Math.min(this.w - 1, Math.ceil(x1) + pad), by = Math.min(this.h - 1, Math.ceil(y1) + pad);
    const { data, w } = this;
    if (opt.outline) {
      const oc = T.id(opt.outline);
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

  /** A 1 px line round everything drawn so far, in a paint ref (engine/surface.js outline). Arguments: ref, { corners }. */
  outline(c, { corners = false } = {}) {
    const oc = this.table.id(c);
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

  /** Every painted pixel in one paint ref (engine/surface.js tint). Arguments: ref. */
  tint(c) {
    const tc = this.table.id(c);
    for (let i = 0; i < this.data.length; i++) if (this.data[i]) this.data[i] = tc;
    return this;
  }

  /** Not available: a port never makes colours of its own. Throws. */
  bytes() { throw new Error('PortSurface holds paint refs, not colours'); }

  /**
   * The painted pixels as stamps moved by (dx, dy) whole pixels (anchor 'tl', '.' see-through), cut into tiles of at
   * most 32 x 32 from the top-left of what is painted; each stamp's key maps a character to a paint ref. [] when
   * nothing is painted. Arguments: [dx, dy].
   */
  stamps([dx, dy] = [0, 0]) {
    const b = this.bounds();
    if (!b) return [];
    const out = [];
    const { data, w } = this;
    for (let ty = b.y0; ty <= b.y1; ty += MAX_STAMP) for (let tx = b.x0; tx <= b.x1; tx += MAX_STAMP) {
      const tw = Math.min(MAX_STAMP, b.x1 - tx + 1), th = Math.min(MAX_STAMP, b.y1 - ty + 1);
      const chars = new Map(), key = {}, rows = [];
      let any = false;
      for (let y = ty; y < ty + th; y++) {
        let row = '';
        for (let x = tx; x < tx + tw; x++) {
          const c = data[y * w + x];
          if (!c) { row += '.'; continue; }
          let ch = chars.get(c);
          if (ch === undefined) {
            if (chars.size >= KEY_CHARS.length) throw new Error(`PortSurface: a ${MAX_STAMP} x ${MAX_STAMP} tile holds more than ${KEY_CHARS.length} paints, more than one stamp's key can name (at ${tx}, ${ty})`);
            ch = KEY_CHARS[chars.size]; chars.set(c, ch); key[ch] = this.table.ref(c);
          }
          row += ch; any = true;
        }
        rows.push(row);
      }
      if (any) out.push({ kind: 'stamp', at: [tx + dx, ty + dy], anchor: 'tl', rows, key });
    }
    return out;
  }
}

/** The most stamps PortSurface.stamps gives for a w x h grid: its 32 x 32 tiles (a cost bound). Arguments: w, h. */
export const portTiles = (w, h) => Math.max(1, Math.ceil(Math.max(1, w) / MAX_STAMP)) * Math.max(1, Math.ceil(Math.max(1, h) / MAX_STAMP));

/** The whole-pixel move that puts the old frame's point (ox, oy) on `at` (rounded): [dx, dy]. Arguments: at, ox, oy. */
export function shiftTo(at, ox, oy) { return [Math.round(at[0]) - ox, Math.round(at[1]) - oy]; }
