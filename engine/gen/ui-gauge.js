// ui.gauge@1 (family "ui"): a standing gauge, the bar that stands beside the well of a falling-block puzzle and fills
// from the bottom. The look of the Gridline kit's junk gauge (bundles/specs/kit-puzzle-gridline.md, `ui-junk-gauge`:
// what gaugeColumn and gaugeFill of the specification's "engine/blocks.js" drew, and the plate and tube housings its
// interface rows share; those code helpers were never carried over, so this is written from the specification and the
// reviewed renders). ui.bar@1 lies down, fills from the left and has round or pill ends only; this one stands, fills
// from the bottom, marks its rows and has the three Gridline housings.
//
//   { "gen": "ui.gauge", "v": 1, "at": [1, 1], "size": [14, 62], "look": "blocks", "border": 2, "ends": 4, "frame": "frame" }
//   { "gen": "ui.gauge", "v": 1, "at": [1, 1], "size": [14, 62], "layer": "fill", "border": 2, "ends": 4, "marks": 8, "fill": "fill" }
//
// `at` and `size` are the rectangle it fills, its ink outline included (as every interface piece: engine/gen/ui-pieces.js).
// The housing and the strip share one opening (gaugeOpening), whatever the look; the panel layout writes it to the
// sheet with the slice (measureGauge; UI_MEASURES in ui-pieces.js, which imports this module and so registers it).
// Returns stamps (whole pixels, never turned) keyed to the call's own paint refs. Pure: no surface, clock or randomness.
import { defineGenerator } from './registry.js';
import { point, count, share, px, word, flag, paint } from './args.js';
import { Pixels, rampOf, toneOf, mixOf, workCost } from './pixels.js';
import { cutRows } from './ui-shapes.js';

/** The housings ui.gauge@1 draws: blocks (square, a band lit on the top and right, dark on the bottom and left), plate (cut corners, a lit edge round a shaded band) and tube (round ends, a line of light along the band's middle). */
export const GAUGE_LOOKS = Object.freeze(['blocks', 'plate', 'tube']);

// Pixels cut from each row of a tube's end, outermost row first, by corner 0 to 4: the round ends of the neon tube.
const TUBE_CUTS = [[], [2, 1], [4, 2, 1], [5, 3, 2, 1], [6, 4, 2, 1]];
/** Rows kept at the top and the bottom when a housing is stretched (its end cells, its cut or round corners). */
const KEEP = 8;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(fin(v) ? v : lo)));
const clamp01 = (v) => Math.max(0, Math.min(1, fin(v) ? v : 0));
const boxOf = (a) => ({ x: Math.floor(a.at[0]), y: Math.floor(a.at[1]), w: Math.round(a.size[0]), h: Math.round(a.size[1]) });

/** The rows [[y, x0, x1], ...] of a standing tube: a rectangle whose ends are rounded by TUBE_CUTS[k], the cuts held so every row keeps 2 px. */
function tubeRows(x, y, w, h, k) {
  const cuts = TUBE_CUTS[clampI(k, 0, 4)], most = Math.max(0, Math.floor((w - 2) / 2)), out = [];
  for (let iy = 0; iy < h; iy++) {
    const dy = Math.min(iy, h - 1 - iy), c = dy < cuts.length ? Math.min(cuts[dy], most) : 0;
    out.push([y + iy, x + c, x + w - 1 - c]);
  }
  return out;
}

/**
 * The opening of a gauge in its box: the trough its fill strip fits exactly, { x, y, w, h } in the call's coordinates.
 * It lies inside the outer ink line, the band (`border`, 1 to 3 px) and the inner ink line; `ends` (pixels from the
 * box's top and bottom, 0 for none) keeps it clear of a cell laid on the band at each end. Arguments: a ({ at, size, border, ends }).
 */
export function gaugeOpening(a) {
  const { x, y, w, h } = boxOf(a);
  const i = clampI(a.border, 1, 3) + 2, e = Math.max(i, Math.round(fin(a.ends) ? a.ends : 0));
  return { x: x + i, y: y + e, w: w - 2 * i, h: h - 2 * e };
}

/**
 * ui.gauge@1: a standing gauge's empty housing (layer `housing`) or its fill strip (layer `fill`). The housing is an
 * ink line, a band of `frame` `border` px wide in one of GAUGE_LOOKS (blocks: square corners, light along the top and
 * right of its outer edge, dark along the left and bottom of its inner edge; plate: corners cut by `corner` px, a
 * light edge round a band shaded at the bottom left; tube: ends rounded by `corner`, a line of light along the band's
 * second pixel), then a plain trough ringed with ink, the same rectangle in every look. The strip fills the opening
 * from the bottom to `value`: dark down its left side, light down its right, a dark line across it every `marks` px
 * counted from the bottom (0: none), turning toward `shine` by `flash`; with `fade` the flash dies away over a clip
 * that does not loop, or pulses over one that does. `ends` keeps the opening clear of a cell laid on the band at each
 * end. Arguments: at, size, layer, look, corner, border, ends, marks, value, flash, fade, frame, fill, shine, ink.
 */
export const uiGauge = defineGenerator({
  id: 'ui.gauge', v: 1, family: 'ui',
  about: 'A standing gauge: its empty housing (a bevelled, plate or tube band round a dark trough) or its fill strip, filled from the bottom, with row marks and a flash.',
  args: {
    at: point({ default: [0, 0], about: 'The top left corner of the rectangle it fills, in frame pixels' }),
    size: point({ lo: 8, hi: 88, about: 'The width and height of the rectangle it fills, its ink outline included' }),
    layer: word(['housing', 'fill'], { default: 'housing', about: 'The empty housing, or the fill strip that lies in its opening' }),
    look: word([...GAUGE_LOOKS], { default: 'blocks', about: 'The housing: blocks (square, a lit band that takes a block cell at each end), plate (cut corners, a lit edge) or tube (round ends, a line of light)' }),
    corner: px(0, 4, { default: 2, about: 'How far the plate\'s corners are cut or the tube\'s ends rounded, 0 square to 4 (rounded to a whole number); the blocks look stays square' }),
    border: px(1, 3, { default: 2, about: 'Width of the frame band in pixels, 1 to 3 (rounded)' }),
    ends: px(0, 8, { default: 0, about: 'Pixels from the top and the bottom of the box the opening keeps clear of: room for a cell laid on the band at each end' }),
    marks: count(0, 32, { default: 0, about: 'A dark line across the strip every this many pixels, counted from the bottom (0: none)' }),
    value: share({ default: 1, about: 'How full the strip is, from the bottom (a game crops a full strip itself)' }),
    flash: share({ default: 0, about: 'How far the strip has turned toward the shine' }),
    fade: flag({ default: false, about: 'The flash dies away over the clip (pulses when the clip loops)' }),
    frame: paint({ default: 'frame', about: 'The band; the trough is its deepest tone darkened toward the ink' }),
    fill: paint({ default: 'fill', about: 'The strip' }),
    shine: paint({ default: 'shine', about: 'A light slot (white) the strip flashes toward' }),
    ink: paint({ default: 'ink', about: 'The outline' }),
  },
  // stamps of at most 32 x 32 over the box, and the work of laying it pixel by pixel
  cost: (a) => (Math.floor((Math.max(1, a.size[0]) - 1) / 32) + 1) * (Math.floor((Math.max(1, a.size[1]) - 1) / 32) + 1) + workCost(a.size[0] * a.size[1] * 8),
  run(a, ctx) {
    const { x, y, w, h } = boxOf(a);
    const b = clampI(a.border, 1, 3), o = gaugeOpening(a);
    if (w < 3 || h < 3) return [];
    const g = new Pixels(x, y, w, h);
    if (a.layer === 'fill') {
      const n = Math.round(o.h * clamp01(a.value));
      if (n <= 0 || o.w <= 0) return [];
      const t = fin(ctx?.t) ? ctx.t : 0;
      const amount = clamp01(a.flash) * (a.fade ? (ctx?.loop ? 0.5 + 0.5 * Math.cos(2 * Math.PI * t) : 1 - clamp01(t)) : 1);
      const lift = (p) => (amount >= 1 ? a.shine : amount > 0 ? mixOf(p, a.shine, Math.round(amount * 1000) / 1000) : p);
      const R = rampOf(a.fill), base = lift(R.base), dark = lift(R.dark), light = lift(R.light);
      const bottom = o.y + o.h - 1;
      for (let py = bottom - n + 1; py <= bottom; py++) {
        const mark = a.marks > 0 && py > o.y && (bottom + 1 - py) % a.marks === 0;
        for (let i = 0; i < o.w; i++) g.set(o.x + i, py, mark ? dark : o.w >= 3 && i === 0 ? dark : o.w >= 3 && i === o.w - 1 ? light : base);
      }
      return g.stamps();
    }
    // the housing: how deep each pixel lies inside the outer shape (0: its edge), by peeling the shape a ring at a time
    const k = clampI(a.corner, 0, 4);
    const rows = a.look === 'plate' ? cutRows(x, y, w, h, Math.min(k, Math.max(0, Math.floor((w - 2) / 2)))) : a.look === 'tube' ? tubeRows(x, y, w, h, k) : cutRows(x, y, w, h, 0);
    const depth = new Int8Array(w * h).fill(-1);
    const at = (qx, qy) => (qx < x || qy < y || qx >= x + w || qy >= y + h ? -1 : depth[(qy - y) * w + (qx - x)]);
    for (const [ry, x0, x1] of rows) for (let qx = x0; qx <= x1; qx++) depth[(ry - y) * w + (qx - x)] = b + 1;
    for (let d = 0; d <= b; d++) {
      const edge = [];
      for (let qy = y; qy < y + h; qy++) for (let qx = x; qx < x + w; qx++) {
        if (at(qx, qy) !== b + 1) continue;
        if ([at(qx - 1, qy), at(qx + 1, qy), at(qx, qy - 1), at(qx, qy + 1)].some((v) => v < d)) edge.push((qy - y) * w + (qx - x));
      }
      for (const i of edge) depth[i] = d;
    }
    const R = rampOf(a.frame);
    for (let qy = y; qy < y + h; qy++) for (let qx = x; qx < x + w; qx++) {
      const d = at(qx, qy);
      if (d < 0) continue;
      let p = a.ink;
      if (d >= 1 && d <= b) {
        p = R.base;
        if (a.look === 'tube') { if (d === 2) p = R.light; }
        else if (a.look === 'plate') { if (d === 1) p = R.light; else if (at(qx - 1, qy + 1) < 2) p = R.dark; }
        else {
          const top = qy === y + d, bottom = qy === y + h - 1 - d, left = qx === x + d, right = qx === x + w - 1 - d;
          if (d === 1 && ((top && !left) || (right && !bottom))) p = R.light;
          else if (d === b && b >= 2 && (left || bottom)) p = R.dark;
        }
      }
      g.set(qx, qy, p);
    }
    // the trough: one plain rectangle ringed with ink in every look, so a cut or round corner never bites into a strip
    const i = b + 2, T = { x: x + i, y: y + i, w: w - 2 * i, h: h - 2 * i };
    if (T.w > 0 && T.h > 0) {
      g.rect(T.x - 1, T.y - 1, T.w + 2, T.h + 2, a.ink);
      g.rect(T.x, T.y, T.w, T.h, mixOf(toneOf(a.frame, 'deep'), a.ink, 0.55));
    }
    return g.stamps();
  },
});

/**
 * Where a gauge's slice and opening are (Contract 8; UI_MEASURES in engine/gen/ui-pieces.js): the housing keeps KEEP
 * rows at the top and the bottom and its band at the sides, the middle stretches; a strip with row marks is a pattern
 * (lengthen it by whole rows: no border), a plain strip stretches between its dark and light sides. Measured from the
 * frame when the box fills it but its 1 px border, else from the box (`rect`). Arguments: a (the call's arguments, defaults filled), ctx ({ size }).
 */
export function measureGauge(a, ctx = {}) {
  const b = boxOf(a), o = gaugeOpening(a), size = ctx.size;
  if (a.layer === 'fill') return { slice: a.marks > 0 || o.w < 3 ? { opening: { ...o } } : { rect: { ...o }, left: 1, top: 0, right: 1, bottom: 0, opening: { ...o } } };
  const keep = Math.max(0, Math.min(KEEP, Math.floor((b.h - 1) / 2)));
  const fills = Array.isArray(size) && b.x <= 1 && b.y <= 1 && b.x + b.w >= size[0] - 1 && b.y + b.h >= size[1] - 1;
  if (fills) return { slice: { left: o.x, top: keep, right: size[0] - (o.x + o.w), bottom: keep, opening: { ...o } } };
  return { slice: { rect: { ...b }, left: o.x - b.x, top: keep, right: b.x + b.w - (o.x + o.w), bottom: keep, opening: { ...o } } };
}
