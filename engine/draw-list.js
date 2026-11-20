// The primitive draw list and its pixel renderer (docs/data-sprites.md sections 2.7 and 4.1 step 6; Contract 15 rule 4).
// Every layout (a bone rig, tiles, layers, a panel, emitters, pictures) ends in the same flat list of primitives in frame
// coordinates; this module paints such a list onto an engine/surface.js Surface so it looks like the library's pixel art.
//
//   drawList(g, list, { palette, glowRim })   paint a list onto a Surface: { drawn, skipped: [{ index, kind, why }], work }
//   renderList(w, h, list, opt)                the same on a new Surface: { g, drawn, skipped }
//   placeOn(prim, frame)                       a primitive written in a node's own frame, placed in frame coordinates
//                                              (areas and shapes nested past PLACE_DEPTH are dropped: null)
//   nodeFrame({ at, turn, mirror, scale })     the frame of a picture node (x right, y down, turned clockwise)
//   boneFrame(start, angle)                    the frame of a solved bone, exactly as rigs/bones.js places its shapes
//   paintOf(ref, palette)                      what a paint ref paints: '#rrggbb' (flat), a ramp (three tones) or CLEAR
//   lostPaints(list, palette)                  the primitives painting a slot flagged `lost` (not drawn): [{ index, slot }]
//   costOf(prim, w, h), workBudget(w, h)       the work one primitive asks of a frame alone, and a frame's budget
//   listCost(list, w, h, { palette, shadow })  the work drawList spends on a whole list, exactly (over workBudget: cut)
//
// PRIMITIVES (frame px; angles in degrees, rig convention: 0 down, 90 picture-right, 180 up). Every one may carry
// `paint`, `z`, `group`, `glow`, `hidden`, `id`, `shade`, `light`, `far`:
//   rect     { at: [x, y] (top-left), size: [w, h], mirror? }               g.rect
//   ellipse  { at, r: [rx, ry] | r, turn? (degrees clockwise on screen) }   g.ellipse; turned by shapes.js placedIn
//   capsule  { from, to, r: [r0, r1] | r }                                  g.capsule
//   limb     { from, to, width (whole px) }                                 g.limb (ends snapped by width parity)
//   poly     { points: [[x, y], ...] (3..64), mirror? }                     g.poly
//            (mirror: true, which placeOn sets on a mirrored node: a pixel centre exactly on an edge falls as in the
//            mirror image, so a mirrored node is the exact left-right flip; without it, exactly g.rect and g.poly)
//   dot      { at, size: 1 | 2 }                                            one pixel (floor) or a 2x2 block (round - 1), flat
//   line     { from, to, thick? }                                           g.line (1 px, flat); thicker: g.limb, flat
//            (a 1 px line with an end over 1,024 px off the frame is clipped to the frame first; one with an end
//            over 1e9 px off, which a float cannot place to the pixel, is left out and reported)
//   arc      { at, r, a0, a1, thick? (default 1) }                          g.arc
//   ring     { at, r, thick? }                                              g.arc all the way round
//   stamp    { at, anchor? (tl tc tr cl c cr bl bc br), rows: [strings], key: { char: paint }, variants?, variant?, mirror? }
//            pixels placed at the ROUNDED point, never turned and never sampled; '.' and ' ' are see-through
//   dither   { area: (a shape primitive), pattern? (checker bayer2 bayer4 lines-h lines-v), amount (0..1), paint }
//            the pattern is by absolute frame position, also left of and above the frame
//   bands    { area, dir? (down up in out), stops: [paints], edges? (hard | dither) }
//            measured over the area's whole extent (up to one frame past each edge; beyond, its box), so bands keep
//            their size and place as the area slides off the frame
//   text     { font ('font:chunky@1', 'slim', ...), size (0..1) | cap (5 | 7 | 9), text (<= 40), at (pen point, baseline),
//              align? (left centre right), paint, outline? ('none' | 'ink' | a paint) }
// OPERATIONS act on what is drawn before them in the list:
//   outline  { paint? (default ink), only? (a group or id), sides? ('outer': g.outline; 'all': corners too) }
//   tint     { paint, only? }                                               g.tint (a hit flash)
//   cut      { shape, from? }   with `from` (a group or id): taken out of that body wherever it is painted (blob minus,
//            so the shade band follows the cut); without: clears every pixel inside the shape drawn so far
// `gen` and `use` entries are not this module's: generators and pieces are expanded first (engine/gen); here they are
// left out and reported, as is any primitive that is not valid. Nothing here throws on bad data.
//
// PAINT REFS. '#rrggbb' (flat), 'ink', 'clear' (makes see-through), '<slot>' (the slot's ramp: three tones, or flat
// when the slot is `detail`), '<slot>.light' / '.base' / '.dark' / '.deep' (one tone, flat), '<slot>.far' (farRamp), or
// a ramp object { base, light, dark }. `palette` maps slot ids to '#rrggbb' or { hex, detail }. Colour rules
// ({ rule }) are resolved before drawing (engine/resolve.js), not here. One-pixel kinds (dot, line, stamp, text, dither,
// bands) paint flat: a slot gives its base. A slot flagged { lost: true } (engine/resolve.js could not work its colour
// out) names no colour: what it paints is left out and reported, never drawn in whatever hex it holds.
//
// HOW IT STAYS PIXEL ART (style guide 1 and 2; docs/studio.md section 4). Shapes are shape tests sampled at pixel
// centres with hard edges (Surface.fill); nothing is a turned bitmap. A slot ramp gives three tones: a 1 px shadow band
// on the side away from the light (`shade`, default 1, up to 3) and an optional highlight band (`light`), with the light
// from the top right (g.shadow). Shapes with the same `group` and `z` between two operations are ONE body (as g.blob):
// one band round the whole, no seams. Stamps and text are whole pixels at rounded points. `glow` primitives are drawn
// last, after every operation, flat, rimmed with a darker tone of their own colour where they meet air (never over the
// body), as rigs/bones.js draws them; a glowing stamp, text or 1 px line is drawn last too, without a rim.
//
// SPEED. A body's shape tests are asked once per pixel centre inside its box into a mask (one loop per common kind, so
// the test is not a call per pixel), and the three tones are read from the mask at whole-pixel offsets: the pixels are
// those Surface.fill gives. Bands that are not whole pixels (shade 1.5) or a turned light (g.shadow not whole) keep the
// joined test at the centre, shade and light points of each pixel (three masks, asked where Surface.fill asks): the same
// pixels, in work that grows with the members' area. Polygons of more than 8 points keep each row's crossings.
// Measured in draw-list-speed.test.mjs.
//
// ORDER. The list is cut at its operations. Between two operations primitives paint in `z` order (default 0), list
// order breaking ties; each operation then acts on everything painted so far. Glow comes after all of it, every
// operation included (tint and outline never touch glow). So an expander must keep operations where they are in the
// list and may sort by z only between them (docs/data-sprites.md 4.1 step 5 "sorted by z" means that).
// OUTLINE SIDES. 'outer' (default) is g.outline: ink on every see-through pixel beside a drawn one (left, right, up,
// down); 'all' also inks the four corner neighbours. Neither draws lines between groups inside the silhouette (that is
// `outline only` a group, which inks round that group also over what lies beside it).
//
// CAPS (docs/data-sprites.md 2.7): 4,000 primitives a frame, 8,192 stamp pixels in all, stamps 32 x 32, polygons 64
// points, text 40 characters, a frame of at most 640 x 360 (renderList); and a work budget a frame (workBudget, counted
// in pixel tests, see costOf and "work" below): what would go over it is left out and reported, so no list can hang the
// page (3.4 rule 2). A cost that is not a finite number of 0 or more (numbers near 1e308) is refused, never added, so
// the budget check always holds. listCost counts a whole list as drawList does, for the validator and generators.
// Pure: no randomness, no clock, no DOM; the list is never changed; runs the same in the browser and
// in Node.

import { Surface, capsuleIn } from './surface.js';
import { ramp, farRamp, tone, col, INK } from './color.js';
import { FONT_STYLES, fontMetrics, textBody } from './pixel-font.js';

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

/** The shape kinds a draw list may hold, in the order of docs/data-sprites.md 2.7 (the five bone shapes first). */
export const DRAW_LIST_KINDS = Object.freeze(['limb', 'capsule', 'ellipse', 'poly', 'dot', 'rect', 'line', 'arc', 'ring', 'stamp', 'dither', 'bands', 'text']);

/** The operations a draw list may hold: outline, tint and cut act on what is drawn before them. */
export const DRAW_LIST_OPS = Object.freeze(['outline', 'tint', 'cut']);

/** The dither patterns, each a threshold grid repeated across the screen: checker, bayer2, bayer4, lines-h, lines-v. */
export const DITHER_PATTERNS = Object.freeze(['checker', 'bayer2', 'bayer4', 'lines-h', 'lines-v']);

/** The directions bands may run: down and up (rows), out (first stop in the middle) and in (first stop at the edge). */
export const BAND_DIRECTIONS = Object.freeze(['down', 'up', 'in', 'out']);

/** Where a stamp's point sits on its block, as [share across, share down]: tl (top-left, the default) to br. */
export const STAMP_ANCHORS = Object.freeze({ tl: [0, 0], tc: [0.5, 0], tr: [1, 0], cl: [0, 0.5], c: [0.5, 0.5], cr: [1, 0.5], bl: [0, 1], bc: [0.5, 1], br: [1, 1] });

/** The counts the renderer draws at most: primitives a frame, stamp pixels in all, a stamp's side, polygon points, text length, frame size. */
export const DRAW_LIST_LIMITS = Object.freeze({ primitives: 4000, stampPixels: 8192, stampSide: 32, polyPoints: 64, textLength: 40, width: 640, height: 360, workPerPixel: 48, workMin: 1048576 });

/** The work budget of one frame of w x h, in pixel tests (see costOf): what a frame may ask for before the rest of its list is left out and reported. */
export function workBudget(w, h) {
  const W = clamp(Math.round(fin(w) ? w : 1), 1, DRAW_LIST_LIMITS.width), H = clamp(Math.round(fin(h) ? h : 1), 1, DRAW_LIST_LIMITS.height);
  return Math.max(DRAW_LIST_LIMITS.workMin, DRAW_LIST_LIMITS.workPerPixel * W * H);
}

/** What the paint ref 'clear' resolves to: pixels painted with it become see-through. */
export const CLEAR = Object.freeze({ clear: true });

const AREA_KINDS = new Set(['rect', 'ellipse', 'capsule', 'limb', 'poly', 'dot', 'arc', 'ring']);
const BODY_KINDS = new Set(['rect', 'ellipse', 'capsule', 'limb', 'poly', 'dot', 'arc', 'ring', 'line']);
const PATTERNS = {
  checker: { m: [[0, 1], [1, 0]], n: 2 },
  bayer2: { m: [[0, 2], [3, 1]], n: 4 },
  bayer4: { m: [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], n: 16 },
  'lines-h': { m: [[0], [1]], n: 2 },
  'lines-v': { m: [[0, 1]], n: 2 },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => isObj(o) && Object.hasOwn(o, k);
const pt = (v) => (Array.isArray(v) && v.length >= 2 && fin(v[0]) && fin(v[1]) ? [v[0], v[1]] : null);
const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);
const half = (v) => Math.round(v * 2) / 2;
/** Two radii from `r` given as one number or [a, b]; null when not finite or below zero. */
const radii = (r) => {
  if (fin(r)) return r >= 0 ? [r, r] : null;
  if (Array.isArray(r) && fin(r[0])) { const b = fin(r[1]) ? r[1] : r[0]; return r[0] >= 0 && b >= 0 ? [r[0], b] : null; }
  return null;
};
/** A value of the data, short and safe to put in a message (never throws: cycles, BigInt, huge strings). */
const show = (v) => {
  if (typeof v === 'string') return JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}...` : v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) return String(v);
  return Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : `a ${typeof v}`;
};
class Skip extends Error {}
const no = (why) => { throw new Skip(why); };

// ---- paints -----------------------------------------------------------------------------------------------------

const RAMPS = new Map();
/** ramp / farRamp / tone(-1) of a colour, kept (they are pure; the store is emptied when it grows large). */
function cached(kind, hex) {
  const key = kind + hex;
  let v = RAMPS.get(key);
  if (v === undefined) {
    if (RAMPS.size > 4096) RAMPS.clear();
    v = kind === 'r' ? ramp(hex) : kind === 'f' ? farRamp(hex) : tone(hex, -1);
    RAMPS.set(key, v);
  }
  return v;
}

/** The palette listCost reckons with when it is given none: every slot name is a three-tone slot. */
const ANY_SLOT = Object.freeze({});
function slotOf(palette, id) {
  if (palette === ANY_SLOT) return { hex: '#808080', detail: false };
  if (!own(palette, id)) return null;
  const s = palette[id];
  if (typeof s === 'string') return HEX.test(s) ? { hex: s, detail: false } : null;
  if (isObj(s)) {
    if (s.lost === true) return null;   // engine/resolve.js could not work its colour out (its flag, never its colour)
    const hex = typeof s.hex === 'string' ? s.hex : s.default;
    return typeof hex === 'string' && HEX.test(hex) ? { hex, detail: s.detail === true } : null;
  }
  return null;
}

/**
 * What a paint ref paints: a '#rrggbb' string (flat), a ramp { base, light, dark, deep } (three tones), CLEAR, or null when it names nothing.
 * Arguments: ref ('#rrggbb', 'ink', 'clear', 'slot', 'slot.light' | '.base' | '.dark' | '.deep' | '.far', or a ramp object); palette ({ slot: '#rrggbb' | { hex, detail } }); options { far (a plain slot gives its farRamp) }.
 */
export function paintOf(ref, palette = {}, { far = false } = {}) {
  if (typeof ref === 'string') {
    if (HEX.test(ref)) return ref;
    if (ref === 'ink') return INK;
    if (ref === 'clear') return CLEAR;
    const dot = ref.indexOf('.');
    const slot = slotOf(palette, dot < 0 ? ref : ref.slice(0, dot));
    if (!slot) return null;
    if (dot < 0) return slot.detail ? slot.hex : cached(far ? 'f' : 'r', slot.hex);
    const t = ref.slice(dot + 1);
    if (t === 'base') return slot.hex;
    if (t === 'light' || t === 'dark' || t === 'deep') return cached('r', slot.hex)[t];
    if (t === 'far') return cached('f', slot.hex);
    return null;
  }
  if (isObj(ref) && typeof ref.base === 'string' && HEX.test(ref.base)) {
    const pick = (v) => (typeof v === 'string' && HEX.test(v) ? v : ref.base);
    return { isRamp: true, base: ref.base, light: pick(ref.light), dark: pick(ref.dark), deep: pick(ref.deep) };
  }
  return null;
}

const flat = (p) => (typeof p === 'string' || p === CLEAR ? p : p.base);
function needPaint(ref, palette, opt) {
  const p = paintOf(ref, palette, opt);
  if (p === null && lostSlot(ref, palette)) no(`paint ${show(ref)}: its colour could not be worked out (engine/resolve.js flags the slot lost), so it is not drawn`);
  if (p === null) no(ref === undefined ? 'it has no paint' : `paint ${show(ref)} names no colour (a slot of the palette, a slot tone, '#rrggbb', 'ink' or 'clear'; colour rules are resolved before drawing)`);
  return p;
}

/** The slot a paint ref names ('slot' or 'slot.tone') when the palette flags it `lost` (engine/resolve.js could not work its colour out), else null. */
function lostSlot(ref, palette) {
  if (typeof ref !== 'string' || HEX.test(ref)) return null;
  const id = ref.indexOf('.') < 0 ? ref : ref.slice(0, ref.indexOf('.'));
  return own(palette, id) && isObj(palette[id]) && palette[id].lost === true ? id : null;
}

/**
 * The primitives of a list that paint with a slot whose colour could not be worked out (the palette flags it `lost`;
 * drawList leaves them out): [{ index, slot }], one per primitive, in list order. Reads paint, a stamp's key, band stops,
 * a text's outline, and a dither's or a cut's area and shape. For engine/data-sprite.js and the layouts, which make such
 * a frame an error naming the slot. Arguments: list, palette ({ slot: '#rrggbb' | { hex, lost? } }).
 */
export function lostPaints(list, palette = {}) {
  const out = [];
  if (!Array.isArray(list) || !isObj(palette)) return out;
  const find = (p, depth = 0) => {
    if (!isObj(p) || depth > 6) return null;
    for (const v of [p.paint, p.kind === 'text' ? p.outline : undefined, ...(isObj(p.key) ? Object.values(p.key) : []), ...(Array.isArray(p.stops) ? p.stops : [])]) {
      const s = lostSlot(v, palette);
      if (s) return s;
    }
    return find(p.area, depth + 1) ?? find(p.shape, depth + 1);
  };
  for (let i = 0; i < list.length && out.length < 200; i++) { const slot = find(list[i]); if (slot) out.push({ index: i, slot }); }
  return out;
}

// ---- frames: placing a primitive written in a node's own frame -------------------------------------------------------

/**
 * The frame of a picture node: local x runs right and y down, turned `turn` degrees clockwise on screen, scaled, and flipped left to right when `mirror`; for placeOn.
 * Arguments: options { at ([x, y], the node's origin in frame px), turn (degrees, default 0), mirror (default false), scale (default 1) }.
 */
export function nodeFrame({ at = [0, 0], turn = 0, mirror = false, scale = 1 } = {}) {
  const o = pt(at) ?? [0, 0], t = (fin(turn) ? turn : 0) * RAD, k = fin(scale) && scale > 0 ? scale : 1;
  const c = clean(Math.cos(t)), s = clean(Math.sin(t)), m = mirror ? -1 : 1;
  return { at: o, u: [m * c * k, m * s * k], v: [-s * k, c * k], k, turnRad: mirror ? t + Math.PI : t, det: m, mirror: !!mirror };
}

/**
 * The frame of a solved bone, placed exactly as rigs/bones.js places its shapes: origin at the bone's start rounded to half pixels, u along the bone, v to its left; for placeOn.
 * Arguments: start ([x, y], frame px, as solveRig gives it), angle (radians, rig convention, as solveRig gives it).
 */
export function boneFrame(start, angle) {
  const o = pt(start) ?? [0, 0], a = fin(angle) ? angle : 0;
  const s = clean(Math.sin(a)), c = clean(Math.cos(a));
  return { at: [half(o[0]), half(o[1])], u: [s, c], v: [c, -s], k: 1, turnRad: Math.PI / 2 - a, det: -1, mirror: false };
}

const mapPt = (F, p) => [F.at[0] + p[0] * F.u[0] + p[1] * F.v[0], F.at[1] + p[0] * F.u[1] + p[1] * F.v[1]];
/** The screen angle (degrees, rig convention) of a local rig-convention angle `a` (degrees). */
const mapAngle = (F, a) => {
  const x = Math.sin(a * RAD), y = Math.cos(a * RAD);
  return Math.atan2(x * F.u[0] + y * F.v[0], x * F.u[1] + y * F.v[1]) / RAD;
};
const scaleR = (r, k) => (k === 1 ? r : fin(r) ? r * k : Array.isArray(r) ? r.map((v) => (fin(v) ? v * k : v)) : r);

/**
 * A primitive written in a node's own frame, placed in frame coordinates (a new object; the input is not changed).
 * Points, centres and ends move and turn with the node; ellipses, lines, arcs and rings turn; stamps, rects and text are only moved (a stamp is mirrored with a mirrored node); radii scale with the node, whole-pixel widths do not.
 * Arguments: prim (a primitive or operation of this module), frame (from nodeFrame or boneFrame).
 */
export function placeOn(prim, frame) {
  return placeAt(prim, frame, 0);
}

/** How deep placeOn places a dither's or bands' `area` and a cut's `shape` inside one another (a real one is 1 deep); deeper ones are dropped (null), so drawList skips the primitive with a reason. */
export const PLACE_DEPTH = 6;

// placeOn at a depth of nesting: the area or shape a primitive at PLACE_DEPTH holds is dropped, not placed (build item F3)
function placeAt(prim, frame, depth) {
  if (!isObj(prim) || !isObj(frame)) return prim;
  const F = frame, out = { ...prim };
  for (const f of ['at', 'from', 'to']) { const p = pt(prim[f]); if (p) out[f] = mapPt(F, p); }
  if (Array.isArray(prim.points)) out.points = prim.points.map((p) => { const q = pt(p); return q ? mapPt(F, q) : p; });
  switch (prim.kind) {
    case 'ellipse': {
      out.r = scaleR(prim.r, F.k);
      const local = fin(prim.turnRad) ? prim.turnRad : fin(prim.turn) ? prim.turn * RAD : 0;
      out.turnRad = local === 0 ? F.turnRad : F.turnRad + (F.det < 0 ? -local : local);
      delete out.turn;
      break;
    }
    case 'capsule': out.r = scaleR(prim.r, F.k); break;
    case 'ring': out.r = scaleR(prim.r, F.k); break;
    case 'arc': {
      out.r = scaleR(prim.r, F.k);
      if (fin(prim.a0) && fin(prim.a1)) {
        const lo = Math.min(prim.a0, prim.a1), span = Math.abs(prim.a1 - prim.a0);
        const b = F.det < 0 ? mapAngle(F, lo + span) : mapAngle(F, lo);
        out.a0 = b; out.a1 = b + span;
      }
      break;
    }
    case 'rect': {
      const p = pt(prim.at), sz = pt(prim.size);
      if (p && sz) out.at = F.mirror ? [mapPt(F, p)[0] - sz[0], mapPt(F, p)[1]] : mapPt(F, p);
      if (F.mirror) out.mirror = prim.mirror !== true;
      break;
    }
    // a polygon or rect placed on a mirrored node carries mirror: true, so pixel centres on its edges fall as in the flip
    case 'poly': if (F.mirror) out.mirror = prim.mirror !== true; break;
    case 'stamp': if (F.mirror) out.mirror = !(prim.mirror === true || prim.mirror === 'x'); break;
    case 'dither': case 'bands': if (isObj(prim.area)) out.area = depth < PLACE_DEPTH ? placeAt(prim.area, F, depth + 1) : null; break;
    case 'cut': if (isObj(prim.shape)) out.shape = depth < PLACE_DEPTH ? placeAt(prim.shape, F, depth + 1) : null; break;
    default: break;
  }
  return out;
}

// ---- shape tests ------------------------------------------------------------------------------------------------

/**
 * The same test as surface.js polyIn, with the same arithmetic (so the same pixels), on flat number arrays (as
 * rigs/bones.js). A polygon of many points keeps each row's crossings, sorted: polyIn's answer is whether an odd number
 * of them lie right of the point, which a search of the row gives without walking every edge again.
 */
function polyTest(pts, mirror = false) {
  const n = pts.length, X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = pts[i][0]; Y[i] = pts[i][1]; }
  // mirrored (placed on a mirrored node): crossings LEFT of the point are counted, so a pixel centre exactly on an edge
  // falls as in the mirror image of the unmirrored shape (polyIn counts those right of it: ties fall the other way)
  if (mirror) {
    const T = polyTest(pts.map(([x, y]) => [-x, y]));
    return (px, py) => T(-px, py);
  }
  if (n > 8) {
    const rows = new Map();
    return (px, py) => {
      let xs = rows.get(py);
      if (xs === undefined) {
        const found = [];
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = X[i], yi = Y[i], xj = X[j], yj = Y[j];
          if ((yi > py) !== (yj > py)) found.push(((xj - xi) * (py - yi)) / (yj - yi) + xi);
        }
        xs = Float64Array.from(found).sort();
        if (rows.size > 4096) rows.clear();
        rows.set(py, xs);
      }
      let lo = 0, hi = xs.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] <= px) lo = mid + 1; else hi = mid; }
      return ((xs.length - lo) & 1) === 1;
    };
  }
  return (px, py) => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = X[i], yi = Y[i], xj = X[j], yj = Y[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
}

/** The inside test of Surface.arc, with its arithmetic. */
function arcTest(cx, cy, r, a0, a1, thick) {
  const lo = Math.min(a0, a1), span = Math.abs(a1 - a0);
  return (px, py) => {
    const dx = px - cx, dy = py - cy;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - r) > thick / 2) return false;
    let a = Math.atan2(dx, dy) - lo;
    a = ((a % TAU) + TAU) % TAU;
    return a <= span;
  };
}

// Scanners: the same tests written into the mask loop (one loop per kind, so the test is not a call per pixel).
// Each fills mask cells (row-major, W wide, origin rx0, ry0) for the pixel centres of columns ax..bx and rows ay..by
// that the shape covers, and returns the box of what it set, [x0, y0, x1, y1], or null.
function scanRect(x, y, w, h, mirror = false) {
  return (mask, W, rx0, ry0, ax, ay, bx, by) => {
    let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    for (let j = ay; j <= by; j++) {
      const cy = j + 0.5, row = (j - ry0) * W - rx0;
      if (!(cy >= y && cy < y + h)) continue;
      for (let i = ax; i <= bx; i++) {
        const cx = i + 0.5;
        if (mirror ? !(cx > x && cx <= x + w) : !(cx >= x && cx < x + w)) continue;
        mask[row + i] = 1;
        if (i < X0) X0 = i; if (i > X1) X1 = i; if (j < Y0) Y0 = j; if (j > Y1) Y1 = j;
      }
    }
    return X1 >= X0 ? [X0, Y0, X1, Y1] : null;
  };
}
function scanEllipse(cx, cy, rx, ry) {
  return (mask, W, rx0, ry0, ax, ay, bx, by) => {
    let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    for (let j = ay; j <= by; j++) {
      const py = j + 0.5, row = (j - ry0) * W - rx0, q = ((py - cy) / ry) ** 2;
      for (let i = ax; i <= bx; i++) {
        const px = i + 0.5;
        if (!(((px - cx) / rx) ** 2 + q <= 1)) continue;
        mask[row + i] = 1;
        if (i < X0) X0 = i; if (i > X1) X1 = i; if (j < Y0) Y0 = j; if (j > Y1) Y1 = j;
      }
    }
    return X1 >= X0 ? [X0, Y0, X1, Y1] : null;
  };
}
function scanTurned(cx, cy, rx, ry, ct, st) {
  return (mask, W, rx0, ry0, ax, ay, bx, by) => {
    let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    for (let j = ay; j <= by; j++) {
      const dy = j + 0.5 - cy, row = (j - ry0) * W - rx0;
      for (let i = ax; i <= bx; i++) {
        const dx = i + 0.5 - cx, u = dx * ct + dy * st, v = dy * ct - dx * st;
        if (!((u / rx) ** 2 + (v / ry) ** 2 <= 1)) continue;
        mask[row + i] = 1;
        if (i < X0) X0 = i; if (i > X1) X1 = i; if (j < Y0) Y0 = j; if (j > Y1) Y1 = j;
      }
    }
    return X1 >= X0 ? [X0, Y0, X1, Y1] : null;
  };
}
function scanCapsule(x0, y0, x1, y1, r0, r1) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
  return (mask, W, rx0, ry0, ax, ay, bx, by) => {
    let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    for (let j = ay; j <= by; j++) {
      const py = j + 0.5, row = (j - ry0) * W - rx0;
      for (let i = ax; i <= bx; i++) {
        const px = i + 0.5;
        let t = ((px - x0) * dx + (py - y0) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (x0 + dx * t), ey = py - (y0 + dy * t);
        const r = r0 + (r1 - r0) * t;
        if (!(ex * ex + ey * ey <= r * r)) continue;
        mask[row + i] = 1;
        if (i < X0) X0 = i; if (i > X1) X1 = i; if (j < Y0) Y0 = j; if (j > Y1) Y1 = j;
      }
    }
    return X1 >= X0 ? [X0, Y0, X1, Y1] : null;
  };
}

/** A shape primitive as { test, box, flat? } in frame px: what Surface would fill for it (box as Surface passes it to fill). */
function areaOf(p) {
  switch (p.kind) {
    case 'rect': {
      const a = pt(p.at), s = pt(p.size);
      if (!a || !s) no('a rect needs at: [x, y] and size: [w, h]');
      if (s[0] <= 0 || s[1] <= 0) no('a rect needs a size above 0');
      const [x, y] = a, [w, h] = s;
      // mirrored: columns are half-open on the left, so the pixels are the mirror image of the unmirrored rect's
      if (p.mirror === true) return { test: (cx, cy) => cx > x && cx <= x + w && cy >= y && cy < y + h, box: [x, y, x + w, y + h], scan: scanRect(x, y, w, h, true) };
      return { test: (cx, cy) => cx >= x && cx < x + w && cy >= y && cy < y + h, box: [x, y, x + w, y + h], scan: scanRect(x, y, w, h) };
    }
    case 'ellipse': {
      const c = pt(p.at), r = radii(p.r);
      if (!c || !r) no('an ellipse needs at: [x, y] and r: [rx, ry]');
      const [cx, cy] = c, [rx, ry] = r;
      if (rx <= 0 || ry <= 0) no('an ellipse needs radii above 0');
      const turn = fin(p.turnRad) ? p.turnRad : fin(p.turn) ? p.turn * RAD : 0;
      if (turn === 0) return { test: (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, box: [cx - rx, cy - ry, cx + rx, cy + ry], scan: scanEllipse(cx, cy, rx, ry) };
      const R = Math.max(rx, ry);
      // shapes.js placedIn(ellipseIn(0, 0, rx, ry), cx, cy, { angle: turn }) written out, with its arithmetic (same pixels)
      const ct = Math.cos(turn), st = Math.sin(turn);
      return { test: (px, py) => { const dx = px - cx, dy = py - cy, u = dx * ct + dy * st, v = dy * ct - dx * st; return (u / rx) ** 2 + (v / ry) ** 2 <= 1; }, box: [cx - R, cy - R, cx + R, cy + R], scan: scanTurned(cx, cy, rx, ry, ct, st) };
    }
    case 'capsule': {
      const a = pt(p.from), b = pt(p.to), r = radii(p.r);
      if (!a || !b || !r) no('a capsule needs from, to and r');
      const R = Math.max(r[0], r[1]);
      return { test: capsuleIn(a[0], a[1], b[0], b[1], r[0], r[1]), box: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R], scan: scanCapsule(a[0], a[1], b[0], b[1], r[0], r[1]) };
    }
    case 'limb': case 'line': {
      const a0 = pt(p.from), b0 = pt(p.to);
      if (!a0 || !b0) no(`a ${p.kind} needs from: [x, y] and to: [x, y]`);
      const w = Math.max(1, Math.round(fin(p.kind === 'limb' ? p.width : p.thick) ? (p.kind === 'limb' ? p.width : p.thick) : 1));
      const snap = w % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
      const a = [snap(a0[0]), snap(a0[1])], b = [snap(b0[0]), snap(b0[1])], r = w / 2;
      return { test: capsuleIn(a[0], a[1], b[0], b[1], r, r), box: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r], flat: p.kind === 'line', scan: scanCapsule(a[0], a[1], b[0], b[1], r, r) };
    }
    case 'poly': {
      if (!Array.isArray(p.points)) no('a poly needs points: [[x, y], ...]');
      if (p.points.length > DRAW_LIST_LIMITS.polyPoints) no(`a poly has at most ${DRAW_LIST_LIMITS.polyPoints} points`);
      const pts = p.points.map(pt);
      if (pts.length < 3 || pts.some((q) => !q)) no('a poly needs at least 3 points, each [x, y]');
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { test: polyTest(pts, p.mirror === true), box: [x0, y0, x1, y1] };
    }
    case 'dot': {
      const a = pt(p.at);
      if (!a) no('a dot needs at: [x, y]');
      const size = fin(p.size) && p.size >= 2 ? 2 : 1;
      const x = size === 1 ? Math.floor(a[0]) : Math.round(a[0]) - 1, y = size === 1 ? Math.floor(a[1]) : Math.round(a[1]) - 1;
      return { test: (cx, cy) => cx >= x && cx < x + size && cy >= y && cy < y + size, box: [x, y, x + size, y + size], flat: true };
    }
    case 'arc': case 'ring': {
      const c = pt(p.at);
      if (!c || !fin(p.r) || p.r < 0) no(`a ${p.kind} needs at: [x, y] and r`);
      const thick = fin(p.thick) && p.thick > 0 ? p.thick : 1;
      let a0 = 0, a1 = TAU;
      if (p.kind === 'arc') {
        if (!fin(p.a0) || !fin(p.a1)) no('an arc needs a0 and a1 (degrees)');
        a0 = p.a0 * RAD; a1 = p.a1 * RAD;
      }
      return { test: arcTest(c[0], c[1], p.r, a0, a1, thick), box: [c[0] - p.r - thick, c[1] - p.r - thick, c[0] + p.r + thick, c[1] + p.r + thick], arc: true };
    }
    default: return no(`${show(p.kind)} cannot be an area (use ${[...AREA_KINDS].join(', ')})`);
  }
}

// ---- work: what a frame may ask for (docs/data-sprites.md 3.4 rule 2) ---------------------------------------------
// Work is counted in pixel tests over the boxes a primitive touches (clipped to the frame), not in time, so the same
// list is cut at the same place on every machine. A test that costs more than a rect's is weighted (WEIGHT: measured,
// so that a unit is about the same time, 5 to 15 ns, for every kind). The budget is 48 units a frame pixel (at least
// 2^20): a full 640 x 360 budget is about 60 to 160 ms, a 64 x 64 frame's about 5 to 15 ms; the library-sized lists of
// draw-list-budget.test.mjs ask a quarter of it or less, a packed 640 x 360 scene under a half. costOf gives the count
// for one primitive drawn alone.
const WEIGHT = Object.freeze({ arc: 2, polyMany: 2.5, dither: 1, bands: 2, line: 4, text: 10 });
/** The weight of one shape test of an area (polygons by their points; rect, ellipse, capsule, limb, dot are 1). */
const testWeight = (p, A) => (A.arc ? WEIGHT.arc : p.kind === 'poly' ? (p.points.length > 8 ? WEIGHT.polyMany : 1 + p.points.length / 4) : 1);

/** Pixels of the box [x0, y0, x1, y1] (as fill takes it: floor to ceil) inside the window X0..X1, Y0..Y1. */
function boxIn(b, X0, Y0, X1, Y1) {
  const x0 = Math.max(X0, Math.floor(b[0])), x1 = Math.min(X1, Math.ceil(b[2])), y0 = Math.max(Y0, Math.floor(b[1])), y1 = Math.min(Y1, Math.ceil(b[3]));
  return x1 < x0 || y1 < y0 ? 0 : (x1 - x0 + 1) * (y1 - y0 + 1);
}
const boxArea = (b, w, h) => boxIn(b, 0, 0, w - 1, h - 1);
/** Bands scan their area inside the frame and look for its far edges up to one frame past each side. */
const bandsCost = (box, wt, w, h) => { const a = boxArea(box, w, h); return 1 + (wt + WEIGHT.bands) * a + wt * (boxIn(box, -w, -h, 2 * w - 1, 2 * h - 1) - a); };
/**
 * One body: each member's tests (weighted, plus one per cut made from that member's id), the joined mask read over the
 * joined box (once more per cut of the body), a glow's rim, who-owns-what marks (each member's tests and every cut
 * again); three masks when its bands are not whole pixels. Members are { box, wt, own (cuts from its id) }.
 */
function bodyCost(members, minus, { glow, slow, owner }, w, h) {
  let a = 0, t = 0, o = 0;
  for (const m of members) { const b = boxArea(m.box, w, h), k = (m.wt ?? 1) + (m.own ?? 0); a += b; t += b * k; o += b * (k + minus); }
  const u = members.length === 1 ? a : boxArea(boxOf(members), w, h), f = slow ? 3 : 1;
  return members.length + f * (t + u * (1 + minus)) + (glow ? f * u : 0) + (owner ? o : 0);
}
const opCost = (op, w, h) => (op.op === 'cut' ? (op.from !== undefined ? 1 : 1 + boxArea(op.box, w, h)) : 1 + w * h * (op.only === undefined ? 1 : op.op === 'outline' ? 3 : 2));
/** Spend work from the frame's budget: null, or why not when it would go over (nothing is spent then). */
function afford(budget, n) {
  if (!(typeof n === 'number' && n >= 0 && n < Infinity)) return 'its work cannot be counted (a number in it is too large or not a number)';
  if (budget.work + n > budget.limit) return `over the frame's work budget (${budget.limit.toLocaleString('en')} pixel tests a frame; this needs ${Math.round(n).toLocaleString('en')} more): draw fewer or smaller shapes`;
  budget.work += n;
  return null;
}
/** Spend work from the frame's budget, or refuse (Skip) when it would go over. */
function spend(budget, n) {
  const why = afford(budget, n);
  if (why) no(why);
}

// ---- items: what the list becomes before painting ------------------------------------------------------------------
// A fill item { test, box, paint, o } paints with Surface.fill; a pixel item { px: [x, y, packed | 0, ...] } sets pixels.

function stampItem(p, palette, budget) {
  const at = pt(p.at);
  if (!at) no('a stamp needs at: [x, y]');
  let rows = p.rows;
  if (typeof p.variant === 'string' && own(p.variants, p.variant)) rows = p.variants[p.variant];
  const S = DRAW_LIST_LIMITS.stampSide;
  if (!Array.isArray(rows) || !rows.length) no('a stamp needs rows: a list of strings');
  if (rows.length > S) no(`a stamp is at most ${S} x ${S} pixels`);
  let w = 0;
  for (const r of rows) { if (typeof r !== 'string') no('a stamp needs rows: a list of strings'); if (r.length > w) w = r.length; }
  const h = rows.length;
  if (w > S) no(`a stamp is at most ${S} x ${S} pixels`);
  const anchor = p.anchor === undefined ? 'tl' : p.anchor;
  if (!own(STAMP_ANCHORS, anchor)) no(`anchor ${show(anchor)} is not one of ${Object.keys(STAMP_ANCHORS).join(', ')}`);
  const flip = p.mirror === true || p.mirror === 'x';
  let [ax, ay] = STAMP_ANCHORS[anchor];
  if (flip) ax = 1 - ax;
  const x0 = Math.round(at[0] - ax * w), y0 = Math.round(at[1] - ay * h);
  const keys = new Map(), px = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch === '.' || ch === ' ') continue;
    if (!keys.has(ch)) {
      if (!own(p.key, ch)) no(`stamp letter ${show(ch)} has no paint in key`);
      const c = needPaint(p.key[ch], palette);
      keys.set(ch, c === CLEAR ? 0 : col(flat(c)));
    }
    px.push(x0 + (flip ? w - 1 - i : i), y0 + j, keys.get(ch));
  }
  const n = px.length / 3;
  if (budget.stampPixels + n > DRAW_LIST_LIMITS.stampPixels) no(`stamp pixels are capped at ${DRAW_LIST_LIMITS.stampPixels.toLocaleString('en')} a frame`);
  budget.stampPixels += n;
  spend(budget, 1 + w * h);
  return { px, box: [x0, y0, x0 + w, y0 + h] };
}

function textItem(p, palette, budget) {
  const at = pt(p.at);
  if (!at) no('a text needs at: [x, baseline]');
  if (p.font !== undefined && typeof p.font !== 'string') no('font names a font: font:chunky@1, font:slim@1, font:rounded@1 or font:serif@1');
  const fm = /^(?:font:)?([a-z]+)(?:@(\d+))?$/.exec(p.font ?? 'chunky');
  if (!fm || !FONT_STYLES.includes(fm[1]) || (fm[2] !== undefined && fm[2] !== '1')) no(`font ${show(p.font)} is not one of ${FONT_STYLES.map((s) => `font:${s}@1`).join(', ')}`);
  if (typeof p.text !== 'string') no('a text needs text');
  if (p.text.length > 2 * DRAW_LIST_LIMITS.textLength || [...p.text].length > DRAW_LIST_LIMITS.textLength) no(`a text is at most ${DRAW_LIST_LIMITS.textLength} characters`);
  const size = p.cap === 5 ? 0 : p.cap === 7 ? 0.5 : p.cap === 9 ? 1 : fin(p.size) ? clamp(p.size, 0, 1) : 0.5;
  const m = fontMetrics(size, fm[1]);
  // the work is reckoned from the font's cell before any glyph is built: (characters x widest advance) x (cap + descent)
  const cost = 1 + WEIGHT.text * ([...p.text].length * (m.maxW + m.track) + 2) * (m.cap + m.descent + 2);
  if (budget === null) return { cost };
  spend(budget, cost);
  let body;
  try { body = textBody(p.text, m); } catch (e) { no(`the font cannot draw that text: ${String(e.message).slice(0, 80)}`); }
  const align = p.align ?? 'left';
  if (!['left', 'centre', 'center', 'right'].includes(align)) no(`align ${show(align)} is not left, centre or right`);
  const x0 = align === 'left' ? Math.round(at[0]) : align === 'right' ? Math.round(at[0] - body.w) : Math.round(at[0] - body.w / 2);
  const y0 = Math.round(at[1]) - body.rise;
  const ink = p.outline === undefined || p.outline === 'none' || p.outline === false ? null : p.outline === true ? INK : flat(needPaint(p.outline, palette));
  if (ink === CLEAR) no('a text outline cannot be clear');
  const fill = needPaint(p.paint, palette);
  const c = fill === CLEAR ? 0 : col(flat(fill));
  const px = [];
  if (ink) {
    const k = col(ink), B = body.body;
    for (let y = -1; y <= body.h; y++) for (let x = -1; x <= body.w; x++) {
      if (B.at(x, y)) continue;
      if (B.at(x - 1, y) || B.at(x + 1, y) || B.at(x, y - 1) || B.at(x, y + 1)) px.push(x0 + x, y0 + y, k);
    }
  }
  for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) if (body.body.at(x, y)) px.push(x0 + x, y0 + y, c);
  return { px, box: [x0 - 1, y0 - 1, x0 + body.w + 1, y0 + body.h + 1] };
}

const NEAR = 1024;
/** How far off the frame (px) a coordinate may lie and still be placed to the pixel; a line reaching further is refused. */
const FAR = 1e9;
/**
 * Pixels of a 1 px line, Bresenham, as Surface.line takes them, for a frame of w x h. A line with both ends within 1,024
 * px of the frame is exactly Surface.line; a longer one is first clipped to the frame (plus 2 px) and drawn between the
 * clipped ends, so a line from far away still draws the part that crosses the frame, in a bounded number of steps.
 */
function lineEnds(a, b, w, h) {
  // a float of 1e308 cannot place a line to the pixel (its step is 1e292) and b - a overflows: refuse what is that far
  const off = (v, n) => Math.max(-v, v - n);
  if (Math.max(off(a[0], w), off(b[0], w), off(a[1], h), off(b[1], h)) > FAR) no(`a 1 px line's ends must lie within ${FAR.toLocaleString('en')} px of the frame`);
  let p = a, q = b;
  const near = (v) => v[0] >= -NEAR && v[1] >= -NEAR && v[0] <= w + NEAR && v[1] <= h + NEAR;
  if (!near(a) || !near(b)) {
    // Liang-Barsky against [-2, w + 2] x [-2, h + 2]
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    for (const [pk, qk] of [[-dx, a[0] + 2], [dx, w + 2 - a[0]], [-dy, a[1] + 2], [dy, h + 2 - a[1]]]) {
      if (pk === 0) { if (qk < 0) return null; continue; }
      const r = qk / pk;
      if (pk < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    p = [a[0] + t0 * dx, a[1] + t0 * dy]; q = [a[0] + t1 * dx, a[1] + t1 * dy];
  }
  return [Math.floor(p[0]), Math.floor(p[1]), Math.floor(q[0]), Math.floor(q[1])];
}
/** How many pixels linePixels gives for these ends (each Bresenham step moves one along the longer axis). */
const lineCount = (e) => (e ? Math.max(Math.abs(e[2] - e[0]), Math.abs(e[3] - e[1])) + 1 : 0);
function linePixels(e, c) {
  if (!e) return [];
  let [x0, y0] = e;
  const [, , x1, y1] = e;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const px = [], steps = dx - dy + 1;
  for (let n = 0; n < steps; n++) {
    px.push(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return px;
}

function ditherItem(p, palette) {
  if (!isObj(p.area) || !AREA_KINDS.has(p.area.kind)) no(`a dither needs an area: a shape (${[...AREA_KINDS].join(', ')})`);
  const A = areaOf(p.area), pattern = p.pattern ?? 'checker';
  if (!own(PATTERNS, pattern)) no(`pattern ${show(pattern)} is not one of ${DITHER_PATTERNS.join(', ')}`);
  if (p.amount !== undefined && !fin(p.amount)) no('amount is a number 0..1 (bindings are resolved before drawing)');
  const amount = clamp(fin(p.amount) ? p.amount : 0.5, 0, 1), { m, n } = PATTERNS[pattern];
  const rows = m.length, cols = m[0].length;
  const on = m.map((r) => r.map((v) => (v + 0.5) / n < amount));
  const inside = A.test;
  // screen-aligned by absolute position; ((v % n) + n) % n keeps the phase left of and above the frame too
  return { test: (px, py) => inside(px, py) && on[((Math.floor(py) % rows) + rows) % rows][((Math.floor(px) % cols) + cols) % cols], box: A.box, flat: true, wt: testWeight(p.area, A) + WEIGHT.dither };
}

function bandsItem(p, palette, w, h, budget) {
  if (!isObj(p.area) || !AREA_KINDS.has(p.area.kind)) no(`bands need an area: a shape (${[...AREA_KINDS].join(', ')})`);
  if (!Array.isArray(p.stops) || !p.stops.length || p.stops.length > 16) no('bands need 1 to 16 stops (paints)');
  const dir = p.dir ?? 'down', edges = p.edges ?? 'hard';
  if (!BAND_DIRECTIONS.includes(dir)) no(`dir ${show(dir)} is not one of ${BAND_DIRECTIONS.join(', ')}`);
  if (edges !== 'hard' && edges !== 'dither') no('edges are hard or dither');
  const stops = p.stops.map((s) => { const c = needPaint(s, palette); return c === CLEAR ? 0 : col(flat(c)); });
  const A = areaOf(p.area);
  if (budget) spend(budget, bandsCost(A.box, testWeight(p.area, A), w, h));
  if (budget?.dry) return { px: [], box: [0, 0, 0, 0] };
  const bx0 = Math.max(0, Math.floor(A.box[0])), by0 = Math.max(0, Math.floor(A.box[1]));
  const bx1 = Math.min(w - 1, Math.ceil(A.box[2])), by1 = Math.min(h - 1, Math.ceil(A.box[3]));
  const cells = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (A.test(x + 0.5, y + 0.5)) {
    cells.push(x, y);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const n = stops.length, px = [];
  if (!cells.length) return { px, box: [0, 0, 0, 0] };
  // The bands are measured over the area's whole extent, not only the part inside the frame, so they keep their size
  // and place as the area slides off the frame (a scrolled sky, a wrap seam): the box of the pixels the area covers up
  // to one frame past each side of the frame (found from the outside in); where the area reaches further, its box.
  const ex0 = clamp(Math.ceil(A.box[0] - 0.5), -FAR, FAR), ex1 = clamp(Math.floor(A.box[2] - 0.5), -FAR, FAR);
  const ey0 = clamp(Math.ceil(A.box[1] - 0.5), -FAR, FAR), ey1 = clamp(Math.floor(A.box[3] - 0.5), -FAR, FAR);
  const WX0 = -w, WX1 = 2 * w - 1, WY0 = -h, WY1 = 2 * h - 1;
  const cx0 = Math.max(WX0, ex0), cx1 = Math.min(WX1, ex1), cy0 = Math.max(WY0, ey0), cy1 = Math.min(WY1, ey1);
  const rowHas = (y) => { for (let x = cx0; x <= cx1; x++) if (A.test(x + 0.5, y + 0.5)) return true; return false; };
  if (ey0 < WY0) y0 = ey0; else for (let y = cy0; y <= cy1; y++) if (rowHas(y)) { y0 = y; break; }
  if (ey1 > WY1) y1 = ey1; else for (let y = cy1; y >= cy0; y--) if (rowHas(y)) { y1 = y; break; }
  const ry0 = Math.max(WY0, y0), ry1 = Math.min(WY1, y1);
  const colHas = (x) => { for (let y = ry0; y <= ry1; y++) if (A.test(x + 0.5, y + 0.5)) return true; return false; };
  if (ex0 < WX0) x0 = ex0; else for (let x = cx0; x <= cx1; x++) if (colHas(x)) { x0 = x; break; }
  if (ex1 > WX1) x1 = ex1; else for (let x = cx1; x >= cx0; x--) if (colHas(x)) { x1 = x; break; }
  const H = y1 - y0 + 1, cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, hw = (x1 - x0 + 1) / 2, hh = H / 2;
  const step = dir === 'down' || dir === 'up' ? n / H : n / Math.max(1, Math.min(hw, hh));
  for (let k = 0; k < cells.length; k += 2) {
    const x = cells[k], y = cells[k + 1];
    let f;
    if (dir === 'down') f = ((y - y0 + 0.5) / H) * n;
    else if (dir === 'up') f = ((y1 - y + 0.5) / H) * n;
    else { const dx = (x + 0.5 - cx) / hw, dy = (y + 0.5 - cy) / hh; f = Math.sqrt(dx * dx + dy * dy) * n; }
    let i = Math.min(n - 1, Math.floor(f));
    if (edges === 'dither' && i > 0 && f - i < step && (x + y) % 2 === 0) i--;
    if (dir === 'in') i = n - 1 - i;
    px.push(x, y, stops[i]);
  }
  return { px, box: [Math.max(0, x0), Math.max(0, y0), Math.min(w, x1 + 1), Math.min(h, y1 + 1)] };
}

/** Turns one entry of the list into an item, or throws Skip with the reason. */
function itemOf(p, i, palette, budget, w, h) {
  if (!isObj(p)) no('not a primitive (an object with a kind)');
  if (p.gen !== undefined || p.kind === 'gen') no(`generator ${show(p.gen ?? p.id ?? '')} must be expanded before drawing (engine/gen)`);
  if (p.kind === 'use' || p.use !== undefined) no(`piece ${show(p.use ?? '')} must be expanded before drawing (engine/pieces)`);
  const kind = p.kind;
  if (DRAW_LIST_OPS.includes(kind)) {
    if (kind === 'cut') {
      if (!isObj(p.shape) || !AREA_KINDS.has(p.shape.kind)) no(`a cut needs a shape (${[...AREA_KINDS].join(', ')})`);
      const A = areaOf(p.shape);
      if (p.from !== undefined && typeof p.from !== 'string') no('a cut\'s from is a group or a primitive id');
      return { op: 'cut', test: A.test, box: A.box, from: p.from, i, kind };
    }
    const paint = flat(needPaint(p.paint ?? (kind === 'outline' ? 'ink' : undefined), palette));
    if (paint === CLEAR) no(`an ${kind} cannot be clear`);
    if (p.only !== undefined && typeof p.only !== 'string') no('only names a group or a primitive id');
    if (kind === 'outline' && p.sides !== undefined && p.sides !== 'outer' && p.sides !== 'all') no('sides are outer or all');
    return { op: kind, paint, only: p.only, corners: p.sides === 'all', i, kind };
  }
  if (typeof kind !== 'string' || !DRAW_LIST_KINDS.includes(kind)) no(`kind ${show(kind)} is not one of ${DRAW_LIST_KINDS.join(', ')}`);
  const z = fin(p.z) ? clamp(p.z, -1000, 1000) : 0;
  const base = { p, i, z, group: typeof p.group === 'string' ? p.group : null, id: typeof p.id === 'string' ? p.id : null, glow: p.glow === true };
  if (kind === 'stamp') return { ...base, ...stampItem(p, palette, budget) };
  if (kind === 'text') return { ...base, ...textItem(p, palette, budget) };
  if (kind === 'bands') return { ...base, ...bandsItem(p, palette, w, h, budget) };
  if (kind === 'dither') {
    const d = ditherItem(p, palette), c = needPaint(p.paint, palette);
    return { ...base, ...d, paint: flat(c), o: { shade: 0 }, noUnion: true };
  }
  if (kind === 'line' && !(fin(p.thick) && p.thick > 1)) {
    const a = pt(p.from), b = pt(p.to);
    if (!a || !b) no('a line needs from: [x, y] and to: [x, y]');
    const c = needPaint(p.paint, palette);
    const e = lineEnds(a, b, w, h);
    spend(budget, 1 + WEIGHT.line * lineCount(e));
    const px = budget.dry ? [] : linePixels(e, c === CLEAR ? 0 : col(flat(c)));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < px.length; k += 3) { x0 = Math.min(x0, px[k]); x1 = Math.max(x1, px[k]); y0 = Math.min(y0, px[k + 1]); y1 = Math.max(y1, px[k + 1]); }
    return { ...base, px, box: px.length ? [x0, y0, x1 + 1, y1 + 1] : [0, 0, 0, 0] };
  }
  const A = areaOf(p);
  // glow is flat in its slot's own colour (never the far ramp), as rigs/bones.js paints it
  const c = needPaint(p.paint, palette, { far: p.far === true && !base.glow });
  const ramped = typeof c === 'object' && c !== CLEAR;
  const shade = ramped && !A.arc ? clamp(fin(p.shade) ? p.shade : 1, 0, 3) : ramped && fin(p.shade) ? clamp(p.shade, 0, 3) : 0;
  const light = ramped && fin(p.light) ? clamp(p.light, 0, 2) : 0;
  return { ...base, test: A.test, box: A.box, scan: A.scan ?? null, paint: c, o: { shade, light }, flatAlone: !!A.flat, wt: testWeight(p, A) };
}

// ---- painting ---------------------------------------------------------------------------------------------------

/** A shape test less the cut tests (a pixel centre inside any cut is not covered). */
const cutTest = (t, cuts) => (cuts.length ? (px, py) => { for (const c of cuts) if (c(px, py)) return false; return t(px, py); } : t);
const guarded = (f, [x0, y0, x1, y1]) => (px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1 && f(px, py);
const boxOf = (items) => items.reduce((a, it) => [Math.min(a[0], it.box[0]), Math.min(a[1], it.box[1]), Math.max(a[2], it.box[2]), Math.max(a[3], it.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
const whole = (o, g) => Number.isInteger(o.shade ?? 0) && Number.isInteger(o.light ?? 0) && Array.isArray(g.shadow) && Number.isInteger(g.shadow[0]) && Number.isInteger(g.shadow[1]);

/**
 * One body: the pixel centres one or more shape tests cover (minus the cuts), as a mask over the members' boxes and a
 * margin of m px round them (inside the frame and m px past it). Each test is asked once per pixel centre; the band
 * tests of Surface.fill, which look whole pixels away, then read the mask. Exact: nothing is asked off a pixel centre.
 */
function bodyMask(members, minus, m, w, h) {
  const B = boxOf(members);
  const rx0 = Math.max(-m, Math.floor(B[0]) - m - 1), ry0 = Math.max(-m, Math.floor(B[1]) - m - 1);
  const rx1 = Math.min(w - 1 + m, Math.ceil(B[2]) + m), ry1 = Math.min(h - 1 + m, Math.ceil(B[3]) + m);
  const W = Math.max(0, rx1 - rx0 + 1), H = Math.max(0, ry1 - ry0 + 1), mask = new Uint8Array(W * H);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const mem of members) {
    // only the pixel centres inside the member's box (a shape never reaches past its box: rigs/bones.js guards each test by it)
    const ax = Math.max(rx0, Math.ceil(mem.box[0] - 0.5)), ay = Math.max(ry0, Math.ceil(mem.box[1] - 0.5));
    const bx = Math.min(rx1, Math.floor(mem.box[2] - 0.5)), by = Math.min(ry1, Math.floor(mem.box[3] - 0.5));
    if (mem.scan) {
      const b = mem.scan(mask, W, rx0, ry0, ax, ay, bx, by);
      if (b) { if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; }
      continue;
    }
    const t = mem.test;
    for (let y = ay; y <= by; y++) {
      const row = (y - ry0) * W - rx0, cy = y + 0.5;
      for (let x = ax; x <= bx; x++) {
        if (mask[row + x] || !t(x + 0.5, cy)) continue;
        mask[row + x] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (minus.length && x1 >= x0) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const k = (y - ry0) * W + x - rx0;
    if (mask[k]) for (const c of minus) if (c(x + 0.5, y + 0.5)) { mask[k] = 0; break; }
  }
  const at = (x, y) => { const i = x - rx0, j = y - ry0; return i >= 0 && j >= 0 && i < W && j < H && mask[j * W + i] === 1; };
  return { mask, rx0, ry0, W, H, x0, y0, x1, y1, at, test: (px, py) => at(Math.floor(px), Math.floor(py)) };
}

class Painter {
  constructor(g, items, { glowRim, glow, budget, skipped, dry = false }) {
    this.g = g; this.items = items; this.budget = budget; this.skipped = skipped; this.over = 0;
    this.dry = dry;                        // only count the work (listCost): nothing is painted
    this.cuts = new Map();                 // group or id -> [tests]
    for (const it of items) if (it.op === 'cut' && it.from !== undefined) {
      if (!this.cuts.has(it.from)) this.cuts.set(it.from, []);
      this.cuts.get(it.from).push(it.test);
    }
    this.byIndex = new Map(items.map((it) => [it.i, it]));    // list index -> item, for `only`
    this.hasOwner = items.some((it) => it.only !== undefined);
    this.owner = this.hasOwner && !dry ? new Int32Array(g.w * g.h) : null;
    this.rim = glowRim !== false;
    this.solid = glow && this.rim && !dry ? new Uint8Array(g.w * g.h) : null;     // what the body covers, for glow rims
  }

  /** Spend the work of a body or an operation; when it would go over the budget, its entries are left out and reported. */
  afford(cost, entries) {
    const why = afford(this.budget, cost);
    if (!why) return true;
    for (const m of entries) this.skipped.push({ index: m.i, kind: m.kind ?? m.p?.kind ?? null, why });
    this.over += entries.length;
    return false;
  }

  /** The cuts made from an item's id (none when its id is its group's name: those are the body's). */
  idCuts(it) { return it.id && it.id !== it.group ? this.cuts.get(it.id) ?? [] : []; }

  /** The cuts of a body of one item: from its group and from its id. */
  minusOf(it) { return [...(it.group ? this.cuts.get(it.group) ?? [] : []), ...this.idCuts(it)]; }

  /** The test of one member of a body of several, with the cuts made from its id (its group's cuts are the body's). */
  ownTest(it) { return cutTest(it.test, this.idCuts(it)); }

  /** Who owns each pixel (for `only`): a pixel item's own pixels, or a shape's pixel centres. */
  mark(it, test, box) {
    if (!this.owner) return;
    const { g } = this, tok = it.i + 1;
    if (it.px) { for (let k = 0; k < it.px.length; k += 3) { const x = it.px[k], y = it.px[k + 1]; if (x >= 0 && y >= 0 && x < g.w && y < g.h) this.owner[y * g.w + x] = it.px[k + 2] ? tok : 0; } return; }
    const ax = Math.max(0, Math.floor(box[0])), ay = Math.max(0, Math.floor(box[1])), bx = Math.min(g.w - 1, Math.ceil(box[2])), by = Math.min(g.h - 1, Math.ceil(box[3]));
    const clear = it.paint === CLEAR;
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (test(x + 0.5, y + 0.5)) this.owner[y * g.w + x] = clear ? 0 : tok;
  }

  putPixels(it) {
    const { data, w, h } = this.g, px = it.px, solid = this.solid && !it.glow ? this.solid : null;
    for (let k = 0; k < px.length; k += 3) {
      const x = px[k], y = px[k + 1];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      data[y * w + x] = px[k + 2];
      if (solid && px[k + 2]) solid[y * w + x] = 1;
    }
  }

  /** Paint a body mask exactly as Surface.fill paints its test (three tones from g.shadow); CLEAR makes see-through. */
  paintMask(B, paint, o) {
    if (B.x1 < B.x0) return;
    const { g } = this, { data, w } = g, { mask, rx0, ry0, W, at } = B;
    const X0 = Math.max(0, B.x0), Y0 = Math.max(0, B.y0), X1 = Math.min(w - 1, B.x1), Y1 = Math.min(g.h - 1, B.y1);
    if (paint === CLEAR) {
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (mask[(y - ry0) * W + x - rx0]) data[y * w + x] = 0;
      return;
    }
    const isRamp = typeof paint === 'object';
    const base = col(isRamp ? paint.base : paint), shade = o.shade ?? (isRamp ? 1 : 0), light = o.light ?? 0;
    const dark = isRamp ? col(paint.dark) : base, lite = isRamp ? col(paint.light) : base;
    const [sx, sy] = g.shadow, shx = sx * shade, shy = sy * shade, lix = -sx * light, liy = -sy * light;
    const solid = this.solid;
    for (let y = Y0; y <= Y1; y++) {
      const row = (y - ry0) * W - rx0;
      for (let x = X0; x <= X1; x++) {
        if (!mask[row + x]) continue;
        let c = base;
        if (shade && !at(x + shx, y + shy)) c = dark;
        else if (light && !at(x + lix, y + liy)) c = lite;
        data[y * w + x] = c;
        if (solid && this.painting === 'body') solid[y * w + x] = 1;
      }
    }
  }

  /** Before a glow: its rim in its own darker tone where it meets air, never on the body (as rigs/bones.js). */
  rimMask(B, paint) {
    if (!this.rim || paint === CLEAR || B.x1 < B.x0) return;
    const { g } = this, { data, w } = g, { at } = B, c = col(cached('t', paint)), solid = this.solid;
    const X0 = Math.max(0, B.x0 - 1), Y0 = Math.max(0, B.y0 - 1), X1 = Math.min(w - 1, B.x1 + 1), Y1 = Math.min(g.h - 1, B.y1 + 1);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      if (at(x, y) || solid[y * w + x]) continue;
      if (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1)) data[y * w + x] = c;
    }
  }

  /**
   * The exact Surface.fill path for bands that are not whole pixels (shade 1.5) or a light that is not (g.shadow): the
   * pixels Surface.fill gives over each member's box with the joined test (rigs/bones.js paintAll). Each test is asked
   * exactly where fill asks it, but once: the joined test is kept, per pixel, for the centre, the shade point and the
   * light point (three masks), so the work grows with the members' area, not with members times area.
   */
  slowBody(members, minus, paint, o, glow) {
    const { g } = this, { w } = g;
    if (members.length === 1 && !minus.length) { this.slowLone(members[0], paint, o, glow); return; }
    const parts = members.map((m) => ({ t: guarded(members.length > 1 ? this.ownTest(m) : m.test, m.box), box: m.box }));
    const U = boxOf(members);
    const RX0 = Math.max(-1, Math.floor(U[0]) - 2), RY0 = Math.max(-1, Math.floor(U[1]) - 2);
    const RX1 = Math.min(w, Math.ceil(U[2]) + 2), RY1 = Math.min(g.h, Math.ceil(U[3]) + 2);
    const RW = RX1 - RX0 + 1, RH = RY1 - RY0 + 1;
    if (RW <= 0 || RH <= 0) return;
    /** The joined test asked, for every pixel (x, y) of the region, at ((x + 0.5) + dx, (y + 0.5) + dy), as fill asks it. */
    const asked = (dx, dy) => {
      const M = new Uint8Array(RW * RH);
      for (const { t, box } of parts) {
        const ax = Math.max(RX0, Math.floor(box[0] - 0.5 - dx) - 1), bx = Math.min(RX1, Math.ceil(box[2] - 0.5 - dx) + 1);
        const ay = Math.max(RY0, Math.floor(box[1] - 0.5 - dy) - 1), by = Math.min(RY1, Math.ceil(box[3] - 0.5 - dy) + 1);
        for (let y = ay; y <= by; y++) {
          const row = (y - RY0) * RW - RX0, qy = (y + 0.5) + dy;
          for (let x = ax; x <= bx; x++) if (!M[row + x] && t((x + 0.5) + dx, qy)) M[row + x] = 1;
        }
      }
      if (minus.length) for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) {
        const k = (y - RY0) * RW + x - RX0;
        if (M[k]) for (const c of minus) if (c((x + 0.5) + dx, (y + 0.5) + dy)) { M[k] = 0; break; }
      }
      return M;
    };
    const at = (M, x, y) => x >= RX0 && y >= RY0 && x <= RX1 && y <= RY1 && M[(y - RY0) * RW + x - RX0] === 1;
    const M0 = asked(0, 0);
    // the pixels the members' fills cover: inside the joined box, in the frame
    const X0 = Math.max(0, Math.floor(U[0])), Y0 = Math.max(0, Math.floor(U[1])), X1 = Math.min(w - 1, Math.ceil(U[2])), Y1 = Math.min(g.h - 1, Math.ceil(U[3]));
    if (glow && this.rim && paint !== CLEAR) {
      const solid = this.solid, c = col(cached('t', paint));
      for (let y = Math.max(0, Math.floor(U[1] - 1)); y <= Math.min(g.h - 1, Math.ceil(U[3] + 1)); y++) for (let x = Math.max(0, Math.floor(U[0] - 1)); x <= Math.min(w - 1, Math.ceil(U[2] + 1)); x++) {
        if (at(M0, x, y) || solid[y * w + x] === 1) continue;
        if (at(M0, x + 1, y) || at(M0, x - 1, y) || at(M0, x, y + 1) || at(M0, x, y - 1)) g.data[y * w + x] = c;
      }
    }
    if (paint === CLEAR) {
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (at(M0, x, y)) g.data[y * w + x] = 0;
    } else {
      const isRamp = typeof paint === 'object', base = col(isRamp ? paint.base : paint), dark = isRamp ? col(paint.dark) : base, lite = isRamp ? col(paint.light) : base;
      const shade = o.shade ?? (isRamp ? 1 : 0), light = o.light ?? 0, [sx, sy] = g.shadow;
      const MS = shade ? asked(sx * shade, sy * shade) : null, ML = light ? asked(-(sx * light), -(sy * light)) : null;
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
        if (!at(M0, x, y)) continue;
        let c = base;
        if (shade && !at(MS, x, y)) c = dark;
        else if (light && !at(ML, x, y)) c = lite;
        g.data[y * w + x] = c;
      }
    }
    if (this.solid && !glow) for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (at(M0, x, y)) this.solid[y * w + x] = 1;
  }

  /** One shape alone, no cuts: Surface.fill over its box with its own test (no guard, as Surface would draw it). */
  slowLone(m, paint, o, glow) {
    const { g } = this, inside = m.test, box = m.box;
    if (glow && this.rim && paint !== CLEAR) {
      const solid = this.solid, w = g.w;
      const sol = (px, py) => { const x = Math.floor(px), y = Math.floor(py); return x >= 0 && y >= 0 && x < w && y < g.h && solid[y * w + x] === 1; };
      const rim = (px, py) => (inside(px + 1, py) || inside(px - 1, py) || inside(px, py + 1) || inside(px, py - 1)) && !inside(px, py) && !sol(px, py);
      g.fill(box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1, rim, cached('t', paint), { shade: 0 });
    }
    if (paint !== CLEAR) g.fill(box[0], box[1], box[2], box[3], inside, paint, o);
    else {
      const ax = Math.max(0, Math.floor(box[0])), ay = Math.max(0, Math.floor(box[1])), bx = Math.min(g.w - 1, Math.ceil(box[2])), by = Math.min(g.h - 1, Math.ceil(box[3]));
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (inside(x + 0.5, y + 0.5)) g.data[y * g.w + x] = 0;
    }
    if (this.solid && !glow) this.mark2solid(inside, box);
  }

  mark2solid(test, box) {
    const { w, h } = this.g, s = this.solid;
    const ax = Math.max(0, Math.floor(box[0])), ay = Math.max(0, Math.floor(box[1])), bx = Math.min(w - 1, Math.ceil(box[2])), by = Math.min(h - 1, Math.ceil(box[3]));
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (test(x + 0.5, y + 0.5)) s[y * w + x] = 1;
  }

  /** Paint the shapes between two operations (or the glow), z order, same group and z as one body. */
  paintRun(run, glow) {
    this.painting = glow ? 'glow' : 'body';
    run.sort((a, b) => a.z - b.z || a.i - b.i);
    const done = new Set(), bodies = new Map(), { g } = this, dry = this.dry;
    const keyOf = (it) => (it.group && !it.noUnion && !it.px ? `${it.z}\u0000${it.group}` : null);
    for (const it of run) { const k = keyOf(it); if (k) { const b = bodies.get(k); if (b) b.push(it); else bodies.set(k, [it]); } }
    for (const it of run) {
      if (it.px) { if (!dry) { this.putPixels(it); this.mark(it); } continue; }      // stamps, text, 1 px lines, bands: whole pixels
      const key = keyOf(it);
      if (key && done.has(key)) continue;
      const members = key ? bodies.get(key) : [it];
      if (key) done.add(key);
      // a body of one: the cuts from its group and from its id are the body's; of several: each member's id cuts are its own
      const lone = members.length === 1, minus = lone ? this.minusOf(it) : this.cuts.get(it.group) ?? [];
      let paint = it.paint, o = it.o;
      if (glow) { paint = flat(paint); o = { shade: 0, light: 0 }; }
      // one shape alone is exactly the Surface call it stands for: a dot or a 1 px wide line paints flat
      if (lone && !minus.length && it.flatAlone) { paint = flat(paint); o = { shade: 0, light: 0 }; }
      const slow = !whole(o, g);
      const counted = members.map((m) => ({ box: m.box, wt: m.wt, own: lone ? 0 : this.idCuts(m).length }));
      if (!this.afford(bodyCost(counted, minus.length, { glow, slow, owner: this.hasOwner }, g.w, g.h), members)) continue;
      if (dry) continue;
      if (slow) { this.slowBody(members, minus, paint, o, glow); }
      else {
        // no guard is needed: bodyMask asks each test only at the pixel centres inside its box
        const parts = lone ? members : members.map((m) => { const t = this.ownTest(m); return { test: t, box: m.box, scan: t === m.test ? m.scan : null }; });
        const B = bodyMask(parts, minus, Math.max(1, o.shade ?? 0, o.light ?? 0), g.w, g.h);
        if (glow) this.rimMask(B, paint);
        this.paintMask(B, paint, o);
      }
      // who owns what: each member's own pixels, less every cut of the body and of the member
      if (this.owner) for (const m of members) this.mark(m, cutTest(lone ? m.test : this.ownTest(m), minus), m.box);
    }
  }

  outline(op) {
    const { g } = this;
    if (op.only === undefined) { g.outline(op.paint, { corners: op.corners }); return; }
    const mine = this.ownedBy(op.only), oc = col(op.paint), { w, h, data } = g, hits = [];
    const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mine[y * w + x] === 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mine[y * w + x]) continue;
      let n = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
      if (!n && op.corners) n = at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1);
      if (n) hits.push(y * w + x);
    }
    for (const k of hits) { data[k] = oc; this.owner[k] = 0; }
  }

  ownedBy(name) {
    const out = new Uint8Array(this.g.w * this.g.h), byTok = new Map();
    for (let k = 0; k < out.length; k++) {
      const t = this.owner[k];
      if (!t || !this.g.data[k]) continue;
      let yes = byTok.get(t);
      if (yes === undefined) { const it = this.byIndex.get(t - 1); yes = !!it && (it.group === name || it.id === name); byTok.set(t, yes); }
      if (yes) out[k] = 1;
    }
    return out;
  }

  tint(op) {
    if (op.only === undefined) { this.g.tint(op.paint); return; }
    const mine = this.ownedBy(op.only), c = col(op.paint);
    for (let k = 0; k < mine.length; k++) if (mine[k]) this.g.data[k] = c;
  }

  cut(op) {
    if (op.from !== undefined) return;              // taken out of its body when that body is painted
    const { g } = this;
    const ax = Math.max(0, Math.floor(op.box[0])), ay = Math.max(0, Math.floor(op.box[1])), bx = Math.min(g.w - 1, Math.ceil(op.box[2])), by = Math.min(g.h - 1, Math.ceil(op.box[3]));
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (op.test(x + 0.5, y + 0.5)) { g.data[y * g.w + x] = 0; if (this.owner) this.owner[y * g.w + x] = 0; }
  }
}

/**
 * Paints a draw list onto a Surface as pixel art and returns { drawn, skipped: [{ index, kind, why }] (by index), work (pixel tests spent, see costOf) }; nothing is thrown for bad data and the list is not changed.
 * Arguments: g (a Surface), list (primitives and operations in frame coordinates, see the header), options { palette ({ slot: '#rrggbb' | { hex, detail } }), glowRim (default true: rim glow with its own darker tone) }.
 */
export function drawList(g, list, { palette = {}, glowRim = true } = {}) {
  return paintList(g, list, palette, glowRim, false);
}

/** drawList's work; with dry, nothing is painted (g needs only w, h, shadow) and the budget has no limit (listCost). */
function paintList(g, list, palette, glowRim, dry) {
  const skipped = [], items = [], budget = { stampPixels: 0, work: 0, limit: dry ? Infinity : workBudget(g.w, g.h), dry };
  const entries = Array.isArray(list) ? list : [];
  entries.forEach((p, i) => {
    const kind = isObj(p) && typeof p.kind === 'string' ? p.kind : isObj(p) && p.gen !== undefined ? 'gen' : null;
    if (i >= DRAW_LIST_LIMITS.primitives) { skipped.push({ index: i, kind, why: `a frame draws at most ${DRAW_LIST_LIMITS.primitives.toLocaleString('en')} primitives` }); return; }
    if (isObj(p) && p.hidden === true) return;
    if (budget.work + 1 > budget.limit) { skipped.push({ index: i, kind, why: afford(budget, 1) }); return; }
    try { items.push(itemOf(p, i, palette, budget, g.w, g.h)); }
    catch (e) {
      if (!(e instanceof Skip)) throw e;
      skipped.push({ index: i, kind, why: e.message });
    }
  });
  const glow = items.filter((it) => it.glow && !it.op);
  const P = new Painter(g, items, { glowRim, glow: glow.length > 0, budget, skipped, dry });
  let run = [];
  for (const it of items) {
    if (it.op) {
      if (run.length) { P.paintRun(run, false); run = []; }
      if (!P.afford(opCost(it, g.w, g.h), [it]) || dry) continue;
      if (it.op === 'outline') P.outline(it); else if (it.op === 'tint') P.tint(it); else P.cut(it);
      continue;
    }
    if (!it.glow) run.push(it);
  }
  if (run.length) P.paintRun(run, false);
  if (glow.length) P.paintRun(glow, true);
  skipped.sort((a, b) => a.index - b.index);
  return { drawn: items.length - P.over, skipped, work: budget.work };
}

/**
 * The work one primitive or operation asks of a frame of w x h when drawn alone (not in a group, no cuts, no `only`), in
 * the pixel tests workBudget counts; 0 for what the renderer would not draw. Adding it up is NOT what a list costs: a
 * group body costs its joined box, a cut from a body or id costs that body again, `only` marks owners. For a frame's
 * list use listCost (docs/data-sprites.md 3.4 rule 2). A slot paint is taken as a three-tone slot.
 * Arguments: prim (a primitive or operation in frame coordinates), w, h (frame px).
 */
export function costOf(prim, w, h) {
  const c = primCost(prim, w, h);
  return typeof c === 'number' && c >= 0 && c < Infinity ? c : 0;     // what cannot be counted is not drawn (afford)
}

/**
 * The work drawList spends on a whole list for a frame of w x h, exactly (groups, cuts, `only`, z order and operations as
 * it paints them), counted without painting and without a limit: drawList leaves something out for the budget exactly
 * when listCost(list, w, h, opt) > workBudget(w, h), and otherwise spends listCost. For the validator (B1) and the
 * generators (B2) to refuse a frame over its budget (docs/data-sprites.md 3.4 rule 2). Takes about a tenth of the time
 * drawing would (bands and lines are not built).
 * Arguments: list (as drawList takes it), w, h (frame px, at most 640 x 360), options { palette (the sprite's; default:
 * every slot counts as a three-tone slot, never less than with the real palette), shadow (g.shadow, default [-1, 1]) }.
 */
export function listCost(list, w, h, { palette = ANY_SLOT, shadow = [-1, 1] } = {}) {
  const W = clamp(Math.round(fin(w) ? w : 1), 1, DRAW_LIST_LIMITS.width), H = clamp(Math.round(fin(h) ? h : 1), 1, DRAW_LIST_LIMITS.height);
  return paintList({ w: W, h: H, shadow }, list, palette, true, true).work;
}

function primCost(prim, w, h) {
  const W = clamp(Math.round(fin(w) ? w : 1), 1, DRAW_LIST_LIMITS.width), H = clamp(Math.round(fin(h) ? h : 1), 1, DRAW_LIST_LIMITS.height);
  if (!isObj(prim) || prim.gen !== undefined || prim.use !== undefined) return 0;
  const p = prim, kind = p.kind;
  try {
    if (kind === 'outline' || kind === 'tint') return opCost({ op: kind, only: typeof p.only === 'string' ? p.only : undefined }, W, H);
    if (kind === 'cut') {
      if (!isObj(p.shape) || !AREA_KINDS.has(p.shape.kind)) return 0;
      return opCost({ op: 'cut', from: p.from, box: areaOf(p.shape).box }, W, H);
    }
    if (typeof kind !== 'string' || !DRAW_LIST_KINDS.includes(kind)) return 0;
    if (kind === 'stamp') {
      let rows = p.rows;
      if (typeof p.variant === 'string' && own(p.variants, p.variant)) rows = p.variants[p.variant];
      const S = DRAW_LIST_LIMITS.stampSide;
      if (!Array.isArray(rows) || !rows.length || rows.length > S) return 0;
      let sw = 0;
      for (const r of rows) { if (typeof r !== 'string') return 0; sw = Math.max(sw, r.length); }
      return sw > S ? 0 : 1 + sw * rows.length;
    }
    if (kind === 'text') return textItem(p, {}, null).cost;
    if (kind === 'line' && !(fin(p.thick) && p.thick > 1)) {
      const a = pt(p.from), b = pt(p.to);
      return a && b ? 1 + WEIGHT.line * lineCount(lineEnds(a, b, W, H)) : 0;
    }
    if (kind === 'bands' || kind === 'dither') {
      if (!isObj(p.area) || !AREA_KINDS.has(p.area.kind)) return 0;
      const A = areaOf(p.area), wt = testWeight(p.area, A);
      return kind === 'bands' ? bandsCost(A.box, wt, W, H) : bodyCost([{ box: A.box, wt: wt + WEIGHT.dither }], 0, {}, W, H);
    }
    const A = areaOf(p);
    const slow = (fin(p.shade) && !Number.isInteger(clamp(p.shade, 0, 3))) || (fin(p.light) && !Number.isInteger(clamp(p.light, 0, 2)));
    return bodyCost([{ box: A.box, wt: testWeight(p, A) }], 0, { glow: p.glow === true, slow }, W, H);
  } catch (e) {
    if (e instanceof Skip) return 0;
    throw e;
  }
}

/**
 * A new Surface of w x h (at most 640 x 360) with a draw list painted on it: { g, drawn, skipped }.
 * Arguments: w, h (frame px), list (see drawList), options (as drawList takes them).
 */
export function renderList(w, h, list, opt = {}) {
  const W = clamp(Math.round(fin(w) ? w : 1), 1, DRAW_LIST_LIMITS.width), H = clamp(Math.round(fin(h) ? h : 1), 1, DRAW_LIST_LIMITS.height);
  const g = new Surface(W, H);
  return { g, ...drawList(g, list, opt) };
}
