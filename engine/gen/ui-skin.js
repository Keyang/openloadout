// Skinned interface pieces (migration batch M8; docs/data-sprites.md 2.5b and 3.3, family "ui"): the bodies of the
// eight skin families' bars, buttons, controls and panels (candy, crystal, flat, gilded, grove, neon, paper, tech), each
// family's look held as data in one skin piece (pieces/skin-<name>.v<v>.json) that every piece of the family names, so a
// fix to the skin reaches the whole family. A redraw of what engine/ui-skins.js, engine/ui-skins-more.js and the skin
// modules (ui-candy, ui-crystal-*, ui-gilded*, ui-grove-vine, ui-neon-tube, ui-paper) drew in code, not pixel for pixel.
//
// THE SKIN MODEL. Every piece here is a slab drawn by depth from its outline in (4-neighbour erosion, as the code skins
// drew): `rings` lists the paints of the outer rings, outline first; the ring at `bandAt` is the frame band and is
// repeated `border` times (1 to 3 px); everything deeper is the face. `lit` tones the band light where its outer edge
// faces up or right and dark where it faces down or left (the light comes from the top right). `edge` is the corner
// shape (round, cut at 45 degrees, a soft pill, or chipped), `corner` its size. Ornaments are the skin's own pixel
// stamps (never drawing code): `trim` stamps written for the top left corner and mirrored into the other three
// (`topTrim` the two top ones; `rightTrim` and `gleamRight` the top right one only, the corner the light comes from), `along`
// stamps repeated every `every` px along the top and bottom band (and the sides with `sides`), and `extra` and
// `extraAlong` the same, drawn only when the sprite's ornament toggle (`extras`) is on. Every stamp is kept to the
// slab's own pixels. The panel layout (engine/gen/ui.js) puts a skin's arguments in place: its "*" args reach every
// piece that declares them (so shared geometry, such as a housing's `caps`, `ends` and `edges`, goes in "*", where both
// the housing and its strip take it).
//
// SLICES (Contract 8). A piece's slice keeps the style guide's 8 px border (a button's and a panel's corners and band fit
// inside it), the rows a role needs besides (a title's heading and rule, a tooltip's tail, a pressed button's lip), and
// grows to hold every corner ornament the piece draws, so nine-slicing never stretches one (along ornaments repeat
// along the edges and are stretched with them). A piece too small to keep a middle exports its rect and no border.
// Every measure is kept to the frame (fitMeasure), so no argument makes an export that throws or a text area outside it.
//
// THE PIECES.
//   ui.slab@1      a panel, a titled panel, an inset well, a tooltip with its tail, a button in its four states (on a
//                  lip it is pressed onto, or a drop shadow), a tab, an open tab, and a slider knob (the code's skinKnob:
//                  a 1 px band, corners of at most 2 px, no skin ornaments, only the knob's own marks)
//   ui.trough@1    a bar's empty housing round its opening (end caps, compartments, notches), or a slider's rail (the
//                  code's skinSlider: the outline, 1 px of the frame and the trough, at every border)
//   ui.strip@1     a bar's fill strip, exactly the housing's opening (gloss, glint, shadow row, hatching, compartments,
//                  a flash that fades over a one-shot clip)
//   ui.toggle@1    a check box, a radio option or an on/off switch, on or off
//   ui.pointer@1   a pointer: an arrow head on a short tail that nudges toward what it points at once a loop
//   ui.selector@1  four corner brackets round a slot that step in and back out once a loop
//   ui.area@1      draws nothing: a clip's text areas and slice as data, for a board whose own piece measures otherwise
// Added by migration batch M8b (the control sets and the neon bars; at the end of this module):
//   ui.trough.lit@1  ui.trough@1 lit as a neon tube: a glow ring inside a housing's opening, a rail with a light core
//   ui.toggle@2      the code's tick, radio dot and banded switch with its smaller inked knob
//   ui.pointer@2     a pointer drawn from its own pixel art, whose measure gives its moving tip as the attach point `tip`
//   ui.selector@2    the code's brackets: lit at the bend, a core line, and its step patterns (pulse, between, held, grow)
// and (review M8b round 1) the code sets' band marks on ui.toggle@2 (tube, gap, twist, bevel, facets, plates, bites,
// card, cracks ...), the styles on ui.selector@2 (second tube, stripes, gap, flower, knot), the sign's gaps on
// ui.trough.lit@1, and:
//   ui.strip.lit@1   ui.strip@1 with a short run at the start of its top row (the code's barFill shine: the RPG bars)
// and (review M8b round 2) ui.selector@2's `bends` (per-corner stamps over each bracket's bend: the crystal bevel) and
// `eased` steps (the code's pulse, its first frame the pose between), its vine stripes kept on their columns as it
// creeps, and ui.pointer@2's `blink` (the neon core going dark on one frame in eight).
// Each returns rects (spans of one paint, merged down) and stamps; SKIN_MEASURES gives the slice and text area of each
// (Contract 8), joined to UI_MEASURES in engine/gen/ui-pieces.js.
//
// Pure: no surface, no clock, no randomness; runs the same in the browser and in Node.
import { defineGenerator } from './registry.js';
import { point, count, share, px, word, flag, paint, paints, primitives } from './args.js';
import { pulse, fract } from '../motion.js';
import { UI_SLICE, UI_STATES, UI_STYLES, roundRows, cutRows, rowsArea, areaCount, spansArea, marksToStamps, toneOf, mixOf, shadeOf } from './ui-shapes.js';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(fin(v) ? v : lo)));
const clamp01 = (v) => Math.max(0, Math.min(1, fin(v) ? v : 0));

/** Largest piece these generators draw, in pixels each way (so the cost bound stays under the frame budget). */
export const SKIN_MAX = 128;
/** Most ring paints a skin may list, outline first. */
export const SKIN_RINGS = 4;
/** Most stamps a skin's `trim` or `extra` list may hold (each mirrored into four corners). */
export const SKIN_TRIMS = 8;
/** Tallest bar housing, rail or fill strip, in pixels (taller boxes are drawn this tall): a bar does not stretch in height. */
export const TROUGH_MAX = 32;
/** Most stamps an `along` or `extraAlong` list may hold (used in turn along the edges). */
export const SKIN_ALONG = 2;

// ---- the arguments every skinned piece shares -------------------------------------------------------------------

const PILL_CUTS = [5, 3, 2, 1];
const styleArg = () => word([...UI_STYLES], { default: 'plain', about: 'The skin\'s name for the look: the panel layout puts the skin\'s arguments for it in place' });
const stateArg = () => word([...UI_STATES], { default: 'normal', about: 'Its state: hover brightens face and band; the panel layout sets it from the clip' });

/** The skin's arguments, shared by every piece of this module (a skin's "*" args reach them all). */
const skinArgs = () => ({
  style: styleArg(),
  edge: word(['round', 'cut', 'pill', 'chip'], { default: 'round', about: 'The corners: round, cut at 45 degrees, soft pill ends or chipped (uneven cuts)' }),
  corner: px(0, 4, { default: 2, about: 'Corner size in pixels, 0 square to 4 round (rounded to a whole pixel)' }),
  border: px(1, 3, { default: 2, about: 'Width of the frame band in pixels, 1 to 3 (rounded)' }),
  rings: paints(SKIN_RINGS, { default: ['ink', 'frame', 'ink'], about: 'The paints of the outer rings, outline first; the one at bandAt is the frame band' }),
  bandAt: count(0, SKIN_RINGS - 1, { default: 1, about: 'Which ring is the frame band, repeated border times' }),
  lit: flag({ default: false, about: 'The band lighter where it faces up or right, darker where it faces down or left' }),
  hoverFace: px(0, 1, { default: 0.1, about: 'How much lighter the face is on hover' }),
  hoverBand: px(0, 1, { default: 0.45, about: 'How much brighter the band is on hover' }),
  offBand: px(-1, 1, { default: 0.3, about: 'How much brighter (above 0) or darker the band is when disabled, so it stays apart from the greyed face' }),
  trim: primitives({ default: [], about: 'Stamps for the top left corner (box pixels), mirrored into the other three; kept to the slab' }),
  along: primitives({ default: [], about: 'Stamps repeated along the top band (mirrored along the bottom), every `every` px' }),
  sides: flag({ default: false, about: 'The along stamps also run down the left and right band (turned a quarter)' }),
  every: px(4, 32, { default: 8, about: 'How far apart the along stamps are' }),
  start: px(0, 32, { default: 8, about: 'How far in from each corner the along stamps start' }),
  alongIn: flag({ default: false, about: 'Along stamps count rows from the band\'s inner row and reach one row past the rings (a pattern that follows the band); their frame paint takes the band\'s tone' }),
  topTrim: primitives({ default: [], about: 'Stamps for the top left corner mirrored into the top right only (icing, a fold)' }),
  rightTrim: primitives({ default: [], about: 'Stamps written for the top left corner and drawn in the top right one only, the corner the light comes from (a folded corner)' }),
  gleamRight: primitives({ default: [], about: 'Light stamps drawn in the top right corner only, with gleam on (one highlight bubble on the lit corner)' }),
  extra: primitives({ default: [], about: 'Corner stamps drawn only with extras on (gems, leaves, glints, sprinkles)' }),
  extraTop: primitives({ default: [], about: 'Top corner stamps drawn only with extras on (pins)' }),
  extraAlong: primitives({ default: [], about: 'Along stamps drawn only with extras on' }),
  extras: flag({ default: false, about: 'The ornaments: the sprite\'s ornament toggle' }),
  gleamTrim: primitives({ default: [], about: 'Corner stamps of light (glints, a highlight bubble) drawn only with gleam on' }),
  gleamTop: primitives({ default: [], about: 'Top corner stamps of light drawn only with gleam on' }),
  gleam: flag({ default: false, about: 'The light marks: the sprite\'s shine or glints toggle' }),
  face: paint({ default: 'face', about: 'The face' }),
  frame: paint({ default: 'frame', about: 'The frame band' }),
  accent: paint({ default: 'frame', about: 'The accent: a title\'s rule, a tick, a chosen dot, an on switch' }),
  ink: paint({ default: 'ink', about: 'The outline' }),
});

// ---- shapes and depths ------------------------------------------------------------------------------------------

/** The rows [[y, x0, x1]] of a box with the skin's corners: round, cut, a soft pill (PILL_CUTS, smaller on a short box) or chipped. */
function edgeRows(edge, x, y, w, h, k) {
  if (!(w > 0 && h > 0)) return [];
  if (edge === 'cut') return cutRows(x, y, w, h, k);
  if (edge === 'chip') return cutRows(x, y, w, h, [k, Math.max(0, k - 2), k + 1, Math.max(0, k - 1)]);
  if (edge === 'pill') {
    const n = Math.min(PILL_CUTS.length, h >> 1), out = [];
    const cuts = h >= 10 ? PILL_CUTS : PILL_CUTS.slice(PILL_CUTS.length - n).map((c, i) => Math.min(c, n - i));
    for (let iy = 0; iy < h; iy++) {
      const dy = Math.min(iy, h - 1 - iy), c = dy < cuts.length ? Math.min(cuts[dy], w >> 1) : 0;
      if (c <= w - 1 - c) out.push([y + iy, x + c, x + w - 1 - c]);
    }
    return out;
  }
  return roundRows(x, y, w, h, k);
}

/** The rows of a disc of diameter d whose box starts at x, y (a radio option, a switch knob). */
function discRows(x, y, d) {
  const out = [], r = d / 2;
  for (let iy = 0; iy < d; iy++) {
    const dy = iy + 0.5 - r, half = Math.sqrt(Math.max(0, r * r - dy * dy));
    const a = Math.ceil(r - half - 0.5), b = Math.floor(r + half - 0.5);
    if (a <= b) out.push([y + iy, x + a, x + b]);
  }
  return out;
}

/**
 * A grid over a box: `depth` per pixel (0 outside, 1 the outline, 2 one in ... the 4-neighbour distance to the outside,
 * the depth the code skins drew by), from shape rows. `open` (a number of rows) treats the box as running on below its
 * bottom: an open tab has no bottom edge. Returns { x, y, w, h, d (Int16Array), at(px, py) }.
 */
function depthGrid(rows, box, open = false) {
  const { x, y, w, h } = box;
  const d = new Int16Array(Math.max(0, w * h));
  const BIG = 9999;
  for (const [ry, x0, x1] of rows) {
    if (ry < y || ry >= y + h) continue;
    for (let px2 = Math.max(x, x0); px2 <= Math.min(x + w - 1, x1); px2++) d[(ry - y) * w + (px2 - x)] = BIG;
  }
  const get = (i, j) => (i < 0 || i >= w || j < 0 ? 0 : j >= h ? (open ? BIG : 0) : d[j * w + i]);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (d[k]) d[k] = Math.min(d[k], get(i - 1, j) + 1, get(i, j - 1) + 1);
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const k = j * w + i;
    if (d[k]) d[k] = Math.min(d[k], get(i + 1, j) + 1, get(i, j + 1) + 1);
  }
  const at = (px2, py2) => get(px2 - x, py2 - y);
  return { x, y, w, h, d, at };
}

/**
 * A ring paint as drawn: a bare name of one of the piece's paint arguments (face, frame, accent) is that argument's paint,
 * so a skin's rings follow the paints a sprite maps its slots to (a list of rings is not renamed with the skin's slots:
 * only its toned entries, "frame.dark", are).
 */
const ringPaint = (a, p) => (typeof p === 'string' && (p === 'face' || p === 'frame' || p === 'accent') && a[p] !== undefined ? a[p] : p);

/** The ring paints of a skin with the band repeated `border` times: [{ paint, band }] from the outline in. */
function ringList(a) {
  const list = Array.isArray(a.rings) && a.rings.length ? a.rings.slice(0, SKIN_RINGS) : ['ink'];
  const at = clampI(a.bandAt, 0, list.length - 1), b = clampI(a.border, 1, 3);
  const out = [];
  list.forEach((p, i) => { for (let n = 0; n < (i === at ? b : 1); n++) out.push({ paint: ringPaint(a, p), band: i === at }); });
  return out;
}

/**
 * A raster of paints: set(px, py, paint) keeps one paint per pixel. prims(layers) turns it into primitives: first each
 * layer { D, bases } (a depth grid and the paint of each depth, the last for every depth below it) as nested areas, one
 * per depth whose paint differs from the one above it (rowsArea: a staircase polygon, so a ring costs a few primitives
 * whatever its size), then every pixel whose paint is not its layer's as rects of one paint (spansArea, merged down).
 */
function raster() {
  const cells = new Map(), keys = new Map(), order = [];
  const keyOf = (p) => {
    const k = typeof p === 'string' ? p : JSON.stringify(p);
    if (!keys.has(k)) { keys.set(k, { paint: p, id: order.length }); order.push(k); }
    return keys.get(k).id;
  };
  return {
    set(px2, py2, p) { if (p !== undefined && p !== null) cells.set(`${px2},${py2}`, keyOf(p)); },
    get(px2, py2) { return cells.get(`${px2},${py2}`); },
    has(px2, py2) { return cells.has(`${px2},${py2}`); },
    // migration batch M8b (ui.toggle@2's marks): a pixel's paint, and taking a pixel out
    paintAt(px2, py2) { const id = cells.get(`${px2},${py2}`); return id === undefined ? undefined : keys.get(order[id]).paint; },
    del(px2, py2) { cells.delete(`${px2},${py2}`); },
    prims(layers = []) {
      const out = [], covered = new Map();
      for (const { D, bases } of layers) {
        let last = null;
        bases.forEach((p, n) => {
          const level = n + 1, id = keyOf(p);
          for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) {
            const dd = D.d[j * D.w + i];
            if (dd >= level) covered.set(`${D.x + i},${D.y + j}`, id);
          }
          if (id === last) return;
          last = id;
          const spans = [];
          let joined = true;
          for (let j = 0; j < D.h; j++) {
            let start = -1, runs = 0;
            for (let i = 0; i <= D.w; i++) {
              const on = i < D.w && D.d[j * D.w + i] >= level;
              if (on && start < 0) start = i;
              if (!on && start >= 0) { spans.push([D.y + j, D.x + start, D.x + i - 1]); start = -1; runs++; }
            }
            if (runs > 1) joined = false;
          }
          if (spans.length) out.push(...(joined ? rowsArea(spans, { paint: p, shade: 0 }) : spansArea(spans, { paint: p, shade: 0 })));
        });
      }
      const byPaint = order.map(() => []);
      for (const [k, id] of cells) {
        if (covered.get(k) === id) continue;
        const [px2, py2] = k.split(',').map(Number);
        byPaint[id].push([py2, px2, px2]);
      }
      byPaint.forEach((spans, id) => { if (spans.length) out.push(...spansArea(spans, { paint: keys.get(order[id]).paint, shade: 0 })); });
      return out;
    },
  };
}

/** The base paints of a slab's depths (its rings, then its face) for raster().prims: the band untoned. */
const basesOf = (rings, band, face) => [...rings.map((r) => (r.band ? band : r.paint)), face];

/** Paints a depth grid's rings and face into a raster: the band toned by side when lit, deeper pixels by face(px, py). */
function paintSlab(R, G, rings, band, a, face) {
  for (let j = 0; j < G.h; j++) for (let i = 0; i < G.w; i++) {
    const dd = G.d[j * G.w + i];
    if (!dd) continue;
    const px2 = G.x + i, py2 = G.y + j;
    if (dd <= rings.length) {
      const r = rings[dd - 1];
      let p = r.band ? band : r.paint;
      if (r.band && a.lit) {
        const up = G.at(px2, py2 - 1) < dd, right = G.at(px2 + 1, py2) < dd, down = G.at(px2, py2 + 1) < dd, left = G.at(px2 - 1, py2) < dd;
        const s = (up ? 1 : 0) + (right ? 1 : 0) - (down ? 1 : 0) - (left ? 1 : 0);
        if (s > 0) p = toneOf(band, 'light'); else if (s < 0) p = toneOf(band, 'dark');
      }
      R.set(px2, py2, p);
    } else R.set(px2, py2, face(px2, py2, dd - rings.length));
  }
}

// ---- ornaments --------------------------------------------------------------------------------------------------

const stampsOf = (list, n) => (Array.isArray(list) ? list.filter((s) => isObj(s) && s.kind === 'stamp' && Array.isArray(s.rows) && Array.isArray(s.at) && isObj(s.key)).slice(0, n) : []);
const rowsOf = (s) => s.rows.map((r) => String(r).replace(/ /g, '.'));
const widthOf = (rows) => rows.reduce((m, r) => Math.max(m, r.length), 0);
const padded = (rows) => { const w = widthOf(rows); return rows.map((r) => r.padEnd(w, '.')); };
const flipX = (rows) => padded(rows).map((r) => [...r].reverse().join(''));
const flipY = (rows) => [...rows].reverse();
const turn = (rows) => { const p = padded(rows); return Array.from({ length: widthOf(p) }, (_, i) => p.map((r) => r[i]).join('')); };

/** One stamp at x, y (its top left), kept to the pixels where inside(px, py) holds; null when nothing is left. */
function placed(s, rows, x, y, inside) {
  const out = rows.map((r, j) => [...r].map((ch, i) => (ch !== '.' && inside(x + i, y + j) ? ch : '.')).join(''));
  if (!out.some((r) => /[^.]/.test(r))) return null;
  const used = new Set(out.join('').replace(/\./g, ''));
  const key = Object.fromEntries(Object.entries(s.key).filter(([k]) => used.has(k)));
  return { kind: 'stamp', at: [x, y], anchor: 'tl', rows: out, key };
}

/** Corner stamps mirrored into the four corners of a box (written for its top left, in pixels from its corner); with which 'top' the two top corners only, 'right' the top right one only. */
function cornerStamps(list, box, inside, which = 'all') {
  const out = [];
  for (const s of stampsOf(list, SKIN_TRIMS)) {
    const rows = padded(rowsOf(s)), sw = widthOf(rows), sh = rows.length, dx = Math.round(s.at[0]), dy = Math.round(s.at[1]);
    const right = box.x + box.w - dx - sw, bottom = box.y + box.h - dy - sh;
    const at = [[box.x + dx, box.y + dy, rows], [right, box.y + dy, flipX(rows)], [box.x + dx, bottom, flipY(rows)], [right, bottom, flipY(flipX(rows))]];
    for (const [x, y, r] of which === 'top' ? at.slice(0, 2) : which === 'right' ? at.slice(1, 2) : at) {
      const p = placed(s, r, x, y, inside);
      if (p) out.push(p);
    }
  }
  return out;
}

/** How many rows in from its edge a slab's band ends: the index of its last band ring (0 when it has none). */
const bandInner = (a) => { const r = ringList(a); let n = 0; r.forEach((x, i) => { if (x.band) n = i; }); return n; };

/**
 * With alongIn, a stamp whose key paints the frame takes the band's paint on that side instead (lit: light along the top
 * and right, dark along the bottom and left), so a pattern carved into the band keeps the band's own tone.
 */
function bandKeyed(s, a, side) {
  if (!a.alongIn) return s;
  const band = stateTones(a).band, tone = !a.lit ? band : side === 'top' || side === 'right' ? toneOf(band, 'light') : toneOf(band, 'dark');
  return { ...s, key: Object.fromEntries(Object.entries(s.key).map(([k, v]) => [k, v === a.frame ? tone : v])) };
}

/** Stamps repeated along the top and bottom of a box every `every` px from `from` px in (and down the sides with `sides`), used in turn; with alongIn their rows count from the band's inner row. */
function alongStamps(list, box, a, inside) {
  const out = [], ss = stampsOf(list, SKIN_ALONG);
  if (!ss.length) return out;
  const every = Math.max(4, Math.round(fin(a.every) ? a.every : 8)), from = Math.max(0, Math.round(fin(a.start) ? a.start : 8));
  const off = a.alongIn ? bandInner(a) : 0;
  let n = 0;
  for (let px2 = box.x + from; ; px2 += every, n++) {
    const s = ss[n % ss.length], rows = padded(rowsOf(s)), sw = widthOf(rows), sh = rows.length, dy = Math.round(s.at[1]) + off;
    if (px2 + sw > box.x + box.w - from) break;
    for (const [y, r, side] of [[box.y + dy, rows, 'top'], [box.y + box.h - dy - sh, flipY(rows), 'bottom']]) { const p = placed(bandKeyed(s, a, side), r, px2, y, inside); if (p) out.push(p); }
  }
  if (!a.sides) return out;
  n = 0;
  for (let py2 = box.y + from; ; py2 += every, n++) {
    const s = ss[n % ss.length], rows = turn(rowsOf(s)), sw = widthOf(rows), sh = rows.length, dx = Math.round(s.at[1]) + off;
    if (py2 + sh > box.y + box.h - from) break;
    for (const [x, r, side] of [[box.x + dx, rows, 'left'], [box.x + box.w - dx - sw, flipX(rows), 'right']]) { const p = placed(bandKeyed(s, a, side), r, x, py2, inside); if (p) out.push(p); }
  }
  return out;
}

/** The corner ornaments of a skin on a box, kept to inside(px, py): trim, topTrim and rightTrim always, extra and extraTop with extras on, gleamTrim, gleamTop and gleamRight with gleam on. */
function cornerOrnaments(a, box, inside) {
  const out = [...cornerStamps(a.trim, box, inside), ...cornerStamps(a.topTrim, box, inside, 'top'), ...cornerStamps(a.rightTrim, box, inside, 'right')];
  if (a.extras) out.push(...cornerStamps(a.extra, box, inside), ...cornerStamps(a.extraTop, box, inside, 'top'));
  if (a.gleam) out.push(...cornerStamps(a.gleamTrim, box, inside), ...cornerStamps(a.gleamTop, box, inside, 'top'), ...cornerStamps(a.gleamRight, box, inside, 'right'));
  return out;
}

/** The ornaments of a skin on a box: its corner ornaments (as cornerOrnaments, kept to inside(px, py)) and along always and extraAlong with extras on, kept to ring(px, py) (the outer rings; with alongIn to deep(px, py), the rings and one row more). */
function ornaments(a, box, inside, ring = inside, deep = ring) {
  // in the order version 1 first drew them (its goldens), the top right only lists after their kind
  const keep = a.alongIn ? deep : ring;
  const out = [...cornerStamps(a.trim, box, inside), ...cornerStamps(a.topTrim, box, inside, 'top'), ...cornerStamps(a.rightTrim, box, inside, 'right'), ...alongStamps(a.along, box, a, keep)];
  if (a.extras) out.push(...cornerStamps(a.extra, box, inside), ...cornerStamps(a.extraTop, box, inside, 'top'), ...alongStamps(a.extraAlong, box, a, keep));
  if (a.gleam) out.push(...cornerStamps(a.gleamTrim, box, inside), ...cornerStamps(a.gleamTop, box, inside, 'top'), ...cornerStamps(a.gleamRight, box, inside, 'right'));
  return out;
}

/**
 * How far corner stamps reach in from each side of a rectangle r { x, y, w, h }: { left, top, right, bottom }, the
 * pixels a slice's border must keep so that it holds them (a stamp left of r's middle counts on the left, and so on).
 */
function reachOf(stamps, r) {
  const out = { left: 0, top: 0, right: 0, bottom: 0 };
  const mx = r.x + r.w / 2, my = r.y + r.h / 2;
  for (const st of stamps) st.rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    const px2 = st.at[0] + i, py2 = st.at[1] + j;
    if (px2 < mx) out.left = Math.max(out.left, px2 - r.x + 1); else out.right = Math.max(out.right, r.x + r.w - px2);
    if (py2 < my) out.top = Math.max(out.top, py2 - r.y + 1); else out.bottom = Math.max(out.bottom, r.y + r.h - py2);
  }));
  return out;
}

/**
 * A slice from the lines that bound its stretch, in frame pixels (lx, ty: the first stretched column and row; rx, by:
 * one past the last), widened to hold `reach`, over the rectangle r: the frame when the piece fills it (no rect), else
 * the piece's own rect. A piece whose borders overlap exports its rect and no border (it cannot stretch), also when it
 * fills its frame (the rect is then the frame); borders that meet keep no middle that way (a bar 16 px tall with 8 rows
 * at each edge: it stretches sideways only, as the code's).
 */
function sliceOf({ lx, ty, rx, by }, r, fills, reach) {
  const left = Math.max(lx - r.x, reach.left), top = Math.max(ty - r.y, reach.top);
  const right = Math.max(r.x + r.w - rx, reach.right), bottom = Math.max(r.y + r.h - by, reach.bottom);
  const b = { left: Math.max(0, left), top: Math.max(0, top), right: Math.max(0, right), bottom: Math.max(0, bottom) };
  if (b.left + b.right > r.w || b.top + b.bottom > r.h) return { rect: { ...r } };
  return fills ? b : { rect: { ...r }, ...b };
}

/**
 * A measure ({ slice?, textArea? }) kept to a frame of `size` (Contract 8): a rect cut to the frame, a border dropped
 * (the rect kept) when it leaves nothing of it, each text area cut to the frame and dropped when nothing is left, an
 * edge pixel outside the frame dropped, a tile or opening outside the frame dropped. What the panel layout exports, so a
 * piece drawn smaller than its own measure assumes, or an argument naming pixels outside the frame, never makes an
 * export that throws or a text area outside the picture.
 */
export function fitMeasure(m, size) {
  if (!isObj(m)) return {};
  const W = Math.max(0, Math.round(fin(size?.[0]) ? size[0] : 0)), H = Math.max(0, Math.round(fin(size?.[1]) ? size[1] : 0));
  const cut = (r) => {
    if (!isObj(r) || ![r.x, r.y, r.w, r.h].every(fin)) return null;
    const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
    const x1 = Math.min(W, Math.round(r.x + r.w)), y1 = Math.min(H, Math.round(r.y + r.h));
    return x1 - x0 >= 1 && y1 - y0 >= 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  const out = {};
  if (isObj(m.slice)) {
    const s = m.slice, o = {};
    const rect = s.rect ? cut(s.rect) : null;
    if (rect) o.rect = rect;
    const r = rect ?? { w: W, h: H };
    const sides = ['left', 'top', 'right', 'bottom'];
    if (sides.some((k) => s[k] !== undefined)) {
      const b = Object.fromEntries(sides.map((k) => [k, Math.max(0, Math.round(fin(s[k]) ? s[k] : 0))]));
      if (b.left + b.right <= r.w && b.top + b.bottom <= r.h) Object.assign(o, b);
    }
    const opening = s.opening ? cut(s.opening) : null;
    if (opening) o.opening = opening;
    if (isObj(s.tile) && fin(s.tile.x) && fin(s.tile.w) && s.tile.w >= 1 && s.tile.x >= 0 && s.tile.x + s.tile.w <= W) o.tile = { x: s.tile.x, w: s.tile.w };
    if (Object.keys(o).length) out.slice = o;
  }
  const area = (a) => {
    const r = cut(a);
    if (!r) return null;
    const q = { ...a, ...r };
    if (isObj(a.edge) && !(a.edge.x >= 0 && a.edge.y >= 0 && a.edge.x < W && a.edge.y < H)) delete q.edge;
    return q;
  };
  if (Array.isArray(m.textArea)) { const list = m.textArea.map(area).filter(Boolean); if (list.length) out.textArea = list.length === 1 ? list[0] : list; }
  else if (isObj(m.textArea)) { const a = area(m.textArea); if (a) out.textArea = a; }
  return out;
}

/** An upper bound on the stamps ornaments returns over a w x h box with `every`: monotone in each (held with every list full in tests/unit/gen-ui-skin.test.mjs). */
export function ornamentCost(w, h, every) {
  const e = Math.max(4, fin(every) ? every : 4);
  const runs = 2 * (Math.ceil(Math.max(0, w) / e) + 1) + 2 * (Math.ceil(Math.max(0, h) / e) + 1);
  return 20 * SKIN_TRIMS + 2 * runs;   // the corner lists place a stamp 4 + 2 + 1 + 4 + 2 + 4 + 2 + 1 times; two along lists
}

/** Rects per row of a piece's height that its pixels off its nested areas can take at most (the toned band's sides and corner steps, face lines, a tail): a cost bound, held over every role, edge, corner, border and size in tests/unit/gen-ui-skin.test.mjs. */
const OVERRIDES_PER_ROW = 4;
const sizeOf = (a) => [clampI(a.size?.[0], 0, SKIN_MAX), clampI(a.size?.[1], 0, SKIN_MAX)];
const boxOf = (a) => { const [w, h] = sizeOf(a); return { x: Math.floor(a.at[0]), y: Math.floor(a.at[1]), w, h }; };
const sizeArg = (lo) => point({ lo, hi: SKIN_MAX, about: `The width and height of the rectangle it fills, its outline included (${lo} to ${SKIN_MAX})` });
const atArg = () => point({ default: [0, 0], about: 'The top left corner of the rectangle it fills, in frame pixels' });

/** The band and face of a state: hover brightens both, disabled brightens the band (the layout greys it). */
function stateTones(a) {
  const hover = a.state === 'hover', off = a.state === 'disabled';
  const hb = clamp01(a.hoverBand), hf = clamp01(a.hoverFace);
  return {
    face: hover && hf > 0 ? shadeOf(a.face, hf) : a.face,
    band: hover && hb > 0 ? shadeOf(a.frame, hb) : off && a.offBand !== 0 ? shadeOf(a.frame, clampI(a.offBand * 100, -100, 100) / 100) : a.frame,
  };
}

// ---- ui.slab ------------------------------------------------------------------------------------------------------

const SLAB_ROLES = ['panel', 'title', 'inset', 'tooltip', 'button', 'tab', 'tab-open', 'knob'];
/** A slider knob's band and largest corner (the code's skinKnob: a 1 px band, corners of at most 2 px), whatever the skin's border and corner. */
const KNOB_BAND = 1, KNOB_CORNER = 2;
/** Most stamps a knob's marks, extraMarks or gleamMarks list may hold. */
const KNOB_MARKS = 4;
/** How far a slab's text area keeps in from its face: the corner ornaments reach no deeper. */
const TEXT_INSET = 3;
/** Rows a tooltip's tail hangs below its body; it sits at the body's left end, inside the slice's corner cell. */
const TAIL = 4;

/** The depth grid of a slab's body (an open tab's runs on below its bottom). Arguments: a, G (slabGeom). */
function slabGrid(a, G) {
  const { bx, by, bw, bh, k } = G, body = { x: bx, y: by, w: bw, h: bh }, open = a.role === 'tab-open';
  const rows = open ? edgeRows(a.edge, bx, by, bw, bh + 8, k).filter((r) => r[0] < by + bh) : edgeRows(a.edge, bx, by, bw, bh, k);
  return depthGrid(rows, body, open);
}

/** A knob's own marks (the skin's ornaments never reach a knob): marks always, extraMarks with extras on, gleamMarks with gleam on, each `at` from the face's top left and kept to the face. */
function knobMarks(a, G, D) {
  const inside = (px2, py2) => D.at(px2, py2) > G.rings.length;
  const lists = [a.marks, a.extras ? a.extraMarks : null, a.gleam ? a.gleamMarks : null];
  const out = [];
  for (const list of lists) for (const st of stampsOf(list, KNOB_MARKS)) {
    const p = placed(st, padded(rowsOf(st)), G.face.x + Math.round(st.at[0]), G.face.y + Math.round(st.at[1]), inside);
    if (p) out.push(p);
  }
  return out;
}

/** A slab's ornaments: corner stamps kept to its body, along stamps to its rings (with alongIn, the rings and the face's first row); an open tab's bottom ones fall away (it has no bottom edge). A knob has only its own marks. */
function slabOrnaments(a, G, D) {
  if (a.role === 'knob') return knobMarks(a, G, D);
  const box = { x: G.bx, y: G.by, w: G.bw, h: G.bh + (a.role === 'tab-open' ? 16 : 0) };
  const inside = (px2, py2) => py2 < G.by + G.bh && D.at(px2, py2) > 0, ring = (px2, py2) => inside(px2, py2) && D.at(px2, py2) <= G.rings.length;
  const deep = (px2, py2) => inside(px2, py2) && D.at(px2, py2) <= G.rings.length + 1;
  return ornaments(a, box, inside, ring, deep);
}

/** Everything a slab works out before drawing: the body's box (after a lip, a shadow, a tail or a tab's drop) and its face. */
function slabGeom(a) {
  const { x, y, w, h } = boxOf(a);
  const knob = a.role === 'knob';
  const rings = ringList(knob ? { ...a, border: KNOB_BAND } : a), k = clampI(a.corner, 0, knob ? KNOB_CORNER : 4);
  const sh = a.shadow && !knob ? 2 : 0;
  let bx = x + sh, bw = w - sh, by = y, bh = h - sh, T = 0, L = 0;
  if (a.role === 'button') {
    T = sh ? sh : clampI(a.travel, 0, 4);
    L = Math.min(T, clampI(a.lip, 0, 4));
    const lift = Math.round(fin(a.lift) ? a.lift : 0);
    bh = h - T;
    by = Math.max(y, Math.min(y + T, y + (T - L) - lift));
  } else if (a.role === 'tooltip') bh = h - sh - TAIL;
  else if (a.role === 'tab') { by = y + 2; bh = h - 2; }
  else if (a.role === 'tab-open') { bh = h; bx = x; bw = w; }
  const E = rings.length;
  const face = { x: bx + E, y: by + E, w: bw - 2 * E, h: bh - 2 * E + (a.role === 'tab-open' ? E : 0) };
  return { x, y, w, h, k, sh, bx, by, bw, bh, T, L, rings, E, face };
}

/**
 * ui.slab@1: a skinned slab filling its rectangle, in one of its roles: panel; title (a heading band of a darker face
 * with a rule under it); inset (a sunken well of a darker face); tooltip (a shorter box with a tail at its bottom left);
 * button (in its state, on a lip `travel` px tall that it is pressed down onto, or on a 2 px drop shadow); tab (a darker
 * tab standing 2 px lower on an ink line) and tab-open (full height, open at the bottom). Its rings, band, corners and
 * ornaments are the skin's (see the header). A redraw of the code skins' panels, buttons and tabs.
 */
export const uiSlab = defineGenerator({
  id: 'ui.slab', v: 1, family: 'ui',
  about: 'A skinned slab: a panel, titled panel, well, tooltip, button in its state, or tab; rings, corners and ornaments from the skin.',
  args: {
    at: atArg(), size: sizeArg(6), ...skinArgs(), state: stateArg(),
    role: word([...SLAB_ROLES], { default: 'panel', about: 'What it is: panel, title, inset, tooltip, button, tab, tab-open, or knob (1 px band, corners up to 2 px, only its own marks)' }),
    shadow: flag({ default: false, about: 'A 2 px ink drop shadow down and to the left; the body shrinks to make room (a button stands on it)' }),
    gloss: count(0, 3, { default: 0, about: 'Rows of a lighter face under the top of the face (a glossy candy)' }),
    sunken: flag({ default: false, about: 'A 1 px darker line along the top and right of the face' }),
    title: px(4, 32, { default: 10, about: 'A title\'s heading band, in rows of the face' }),
    titleShade: px(-3, 3, { default: -1, about: 'How much darker (below 0) the heading band or the inset well is than the face' }),
    line: paint({ default: 'frame', about: 'The line under a heading and along the top of a well' }),
    lined: flag({ default: false, about: 'A well and an inactive tab have a line along the top of the face (their sunken edge)' }),
    travel: px(0, 4, { default: 2, about: 'How tall a button\'s lip is: how far it goes down when pressed' }),
    lip: px(0, 4, { default: 2, about: 'How much of the lip shows under the button: 2 at rest, 0 pressed (the panel\'s state sets it)' }),
    lift: px(-4, 4, { default: 0, about: 'Raises the button, within its box' }),
    ledge: paint({ default: 'frame.dark', about: 'The lip a button stands on' }),
    marks: primitives({ default: [], about: 'A knob\'s own stamps (at most 4), `at` from its face\'s top left, kept to the face: rules, a highlight' }),
    extraMarks: primitives({ default: [], about: 'A knob\'s stamps drawn only with extras on (a gem)' }),
    gleamMarks: primitives({ default: [], about: 'A knob\'s stamps of light drawn only with gleam on (glints)' }),
  },
  // the shadow or lip and the body's rings and face as nested areas, the toned band, face lines, tail and tab line as rects, the ornaments
  cost: (a) => { const [w, h] = sizeOf(a); return 24 + (SKIN_RINGS + 6) * areaCount(h + 8) + OVERRIDES_PER_ROW * (h + 8) + ornamentCost(w, h, a.every); },
  run(a) {
    const G = slabGeom(a);
    const { x, y, w, h, k, sh, bx, by, bw, bh, T, L, rings, E, face: F } = G;
    if (bw < 3 || bh < 3) return [];
    const R = raster();
    const tones = stateTones(a);
    const body = { x: bx, y: by, w: bw, h: bh };
    // what stands under the body: a drop shadow, or a button's lip
    const layers = [];
    if (sh) {
      if (a.role !== 'button' || a.state !== 'pressed') {
        const sg = depthGrid(edgeRows(a.edge, bx - sh, by + sh, bw, bh, k), { x: bx - sh, y: by + sh, w: bw, h: bh });
        for (let j = 0; j < sg.h; j++) for (let i = 0; i < sg.w; i++) if (sg.d[j * sg.w + i]) R.set(sg.x + i, sg.y + j, a.ink);
        layers.push({ D: sg, bases: [a.ink] });
      }
    } else if (a.role === 'button' && L > 0) {
      const lg = depthGrid(edgeRows(a.edge, bx, y + T, bw, bh, k), { x: bx, y: y + T, w: bw, h: bh });
      for (let j = 0; j < lg.h; j++) for (let i = 0; i < lg.w; i++) { const dd = lg.d[j * lg.w + i]; if (dd) R.set(lg.x + i, lg.y + j, dd === 1 ? a.ink : a.ledge); }
      layers.push({ D: lg, bases: [a.ink, a.ledge] });
    }
    if (a.role === 'tooltip') {
      // the tail: a small wedge under the body's left end, ink round the band, inside the slice's corner cell
      const tx = bx + 1, ty = by + bh - 1;
      for (let j = 0; j <= TAIL; j++) {
        const reach = TAIL - j;
        for (let i = 0; i <= reach + 1; i++) R.set(tx + i, ty + j, i === 0 || i === reach + 1 || j === TAIL ? a.ink : tones.band);
      }
    }
    const D = slabGrid(a, G);
    const ts = clampI(a.titleShade * 10, -30, 30) / 10;
    const faceAt = (px2, py2, fd) => {
      const fy = py2 - F.y, fx = px2 - F.x;
      if (a.role === 'title') {
        const tr = Math.min(Math.round(a.title), F.h - 2);
        if (fy < tr) return shadeOf(tones.face, ts);
        if (fy === tr) return a.line;
      }
      if (a.role === 'inset' || a.role === 'tab') {
        if (fy === 0 && a.lined) return a.line;
        return shadeOf(tones.face, ts);
      }
      if (a.gloss > 0 && fy >= 0 && fy < a.gloss && fd <= a.gloss + 1) return fy === 0 ? mixOf(tones.face, toneOf(a.frame, 'light'), 0.5) : shadeOf(tones.face, 0.6);
      if (a.sunken && (fy === 0 || fx === F.w - 1)) return toneOf(tones.face, 'dark');
      return tones.face;
    };
    paintSlab(R, D, rings, tones.band, a, faceAt);
    if (a.role === 'tab') for (let px2 = x; px2 < x + w; px2++) R.set(px2, y + h - 1, a.ink);
    layers.push({ D, bases: basesOf(rings, tones.band, tones.face) });
    return [...R.prims(layers), ...slabOrnaments(a, G, D)];
  },
});

/** A slab's slice and text areas (Contract 8; the header's SLICES): the body's text area (a title's heading band too), the edge pixel, and the slice for its role. */
function measureSlab(a, ctx) {
  const G = slabGeom(a);
  const size = Array.isArray(ctx.size) ? ctx.size : [0, 0];
  if (a.role === 'knob') return { slice: { rect: { x: G.x, y: G.y, w: G.w, h: G.h } } };   // the code's knob: its rect only, no text
  const fills = G.x <= 1 && G.y <= 1 && G.x + G.w >= size[0] - 1 && G.y + G.h >= size[1] - 1;
  const F = G.face;
  const tr = Math.min(Math.round(a.title), F.h - 2) + 1;   // a title's heading band and its rule, in rows of the face
  let text = { x: F.x, y: F.y, w: F.w, h: F.h };
  if (a.role === 'title') text = { x: F.x, y: F.y + tr, w: F.w, h: F.h - tr };
  else if ((a.role === 'inset' || a.role === 'tab') && a.lined) text = { x: F.x, y: F.y + 1, w: F.w, h: F.h - 1 };
  else if (a.gloss > 0) text = { x: F.x, y: F.y + a.gloss, w: F.w, h: F.h - a.gloss };
  if (a.sunken) text = { x: text.x, y: text.y + (text.y === F.y ? 1 : 0), w: text.w - 1, h: text.h - (text.y === F.y ? 1 : 0) };
  // kept clear of the corner ornaments (icing, bubbles, gems reach at most TEXT_INSET px into the face)
  text = { x: text.x + TEXT_INSET, y: text.y + (text.y === F.y ? TEXT_INSET : 0), w: text.w - 2 * TEXT_INSET, h: text.h - (text.y === F.y ? TEXT_INSET : 0) - 1 };
  if (text.w < 1 || text.h < 1) text = { x: F.x, y: F.y, w: F.w, h: F.h };   // a slab too small for the inset: its whole face (none when it has no face: fitMeasure)
  // the edge pixel: one of the band along the top, the nearest to its middle that no ornament covers (a well or tab
  // lined in ink: that line, its sunken edge)
  const D = slabGrid(a, G);
  const covered = new Set();
  for (const st of slabOrnaments(a, G, D)) st.rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') covered.add(`${st.at[0] + i},${st.at[1] + j}`); }));
  const ey = (a.role === 'inset' || a.role === 'tab') && a.lined && a.line === a.ink ? F.y : G.by + Math.max(0, G.rings.findIndex((r) => r.band));
  let ex = G.bx + (G.bw >> 1);
  for (let n = 0; n < G.bw && covered.has(`${ex},${ey}`); n++) ex = G.bx + (G.bw >> 1) + (n % 2 ? -(n + 1) / 2 : n / 2 + 1);
  const edge = { x: ex, y: ey };
  // a title's heading band takes a line of text too: the body's area first, then the heading's (the code's order)
  const textArea = a.role === 'title'
    ? [{ ...text, edge }, { x: F.x + TEXT_INSET, y: F.y, w: F.w - 2 * TEXT_INSET, h: tr - 1, edge }]
    : { ...text, edge };
  // the slice: the lines that bound the stretch, then widened to hold the corner ornaments
  const r = fills ? { x: 0, y: 0, w: size[0], h: size[1] } : { x: G.x, y: G.y, w: G.w, h: G.h };
  const lx = fills ? UI_SLICE : G.x + UI_SLICE - 1, rx = fills ? size[0] - UI_SLICE : G.x + G.w - (UI_SLICE - 1);
  let ty = fills ? UI_SLICE : G.y + UI_SLICE - 1, by = fills ? size[1] - UI_SLICE : G.y + G.h - (UI_SLICE - 1);
  const bodyEnd = G.by + G.bh;   // one past the body's bottom row
  if (a.role === 'button') {
    // pressed (no lip showing) the band moves down: the border keeps the band and the lip's place under it
    ty = Math.max(ty, G.by + 6);
    by = G.L > 0 ? Math.min(by, bodyEnd - Math.max(4, G.E)) : bodyEnd - Math.max(4, G.E);
  } else if (a.role === 'tab') { ty = Math.max(ty, G.by + G.E); by = bodyEnd - 1; }   // a tab's bottom is its ink line
  else if (a.role === 'tab-open') { ty = Math.max(ty, G.by + G.E); by = Math.min(bodyEnd, r.y + r.h - 1); }   // open at the bottom: it runs on
  else if (a.role === 'title') ty = Math.max(ty, F.y + tr + 1);   // the heading band, its rule and the row under it
  else if (a.role === 'tooltip') by = Math.min(by, bodyEnd - (UI_SLICE - 1));   // the tail hangs below that
  const box = { x: G.bx, y: G.by, w: G.bw, h: G.bh + (a.role === 'tab-open' ? 16 : 0) };
  const reach = reachOf(cornerOrnaments(a, box, (px2, py2) => py2 < G.by + G.bh && D.at(px2, py2) > 0), r);
  return { slice: sliceOf({ lx, ty, rx, by }, r, fills, reach), textArea };
}

// ---- ui.trough and ui.strip -------------------------------------------------------------------------------------

/**
 * A rail's rings, as the code's skinSlider drew them whatever the border: the skin's outline, then 1 px of the frame
 * (a skin whose band is its outer ring: the frame alone); the trough lies inside them.
 */
function railRings(a) {
  const list = Array.isArray(a.rings) && a.rings.length ? a.rings.slice(0, SKIN_RINGS) : ['ink'];
  const at = clampI(a.bandAt, 0, list.length - 1);
  return at > 0 ? [{ paint: ringPaint(a, list[0]), band: false }, { paint: a.frame, band: true }] : [{ paint: a.frame, band: true }];
}

/**
 * The opening of a housing in its box: inside its rings and `caps` px of solid band at each end; with `segments`, the
 * caps grow until the opening plus one divides into whole compartments of `pitch` px. A rail is 4 to 6 px tall,
 * centred in the box: its outline and a 1 px band (railRings) round its trough, the opening. Shared by ui.trough and
 * ui.strip, so a strip fills the housing's opening exactly.
 */
export function troughGeom(a) {
  const box = boxOf(a);
  box.h = Math.min(box.h, TROUGH_MAX);
  const rings = a.role === 'rail' ? railRings(a) : ringList(a), E = rings.length;
  let { x, y, w, h } = box;
  if (a.role === 'rail') { const rh = Math.max(4, Math.min(6, Math.round(h * 0.4))); y += (h - rh) >> 1; h = rh; }
  const segs = clampI(a.segments, 0, 16);
  let caps = a.role === 'rail' ? 0 : clampI(a.caps, 0, 16);
  const ow = (c) => w - 2 * (E + c);
  if (segs > 1 && a.role !== 'rail') { let n = 0; while (n < 32 && ow(caps) > segs && (ow(caps) + 1) % segs !== 0) { caps++; n++; } }
  const o = { x: x + E + caps, y: y + E, w: Math.max(0, ow(caps)), h: Math.max(0, h - 2 * E) };
  const pitch = segs > 1 && (o.w + 1) % segs === 0 ? (o.w + 1) / segs : 0;
  return { box, x, y, w, h, rings, E, caps, o, segs: pitch ? segs : 0, pitch };
}

/**
 * ui.trough@1: a skinned bar housing (role housing: its rings round an opening, `caps` px of band at each end, an ink
 * line round the opening, a dark trough, optional notches across the band every 8 px and compartment lines) or a
 * slider's rail (role rail: 4 to 6 px tall, centred). The opening is what ui.strip@1 fills.
 */
export const uiTrough = defineGenerator({
  id: 'ui.trough', v: 1, family: 'ui',
  about: 'A skinned bar housing round its opening (caps, compartments, notches), or a slider\'s rail.',
  args: {
    at: atArg(), size: sizeArg(6), ...skinArgs(),
    role: word(['housing', 'rail'], { default: 'housing', about: 'A bar\'s housing, or a slider\'s rail (4 to 6 px tall, centred)' }),
    caps: px(0, 16, { default: 0, about: 'Pixels of solid band at each end of the opening' }),
    ends: px(8, 24, { default: 8, about: 'The least a bar\'s slice keeps at each end (left and right), in pixels' }),
    edges: px(2, 8, { default: 4, about: 'The rows a bar\'s slice keeps at the top and the bottom (8: a bar 16 px tall does not stretch in height)' }),
    segments: count(0, 16, { default: 0, about: 'Compartments the opening is split into (the caps grow until they are whole)' }),
    notches: flag({ default: false, about: 'A 1 px ink notch across the band every 8 px' }),
    trough: word(['dark', 'ink', 'well'], { default: 'dark', about: 'The trough: the face darkened toward the ink, the ink lifted toward the frame, or the face itself with a shadow row under its top (a paper well)' }),
    rim: paint({ default: 'ink', about: 'The ring round a housing\'s opening (paper: a rule of the frame)' }),
    divider: paint({ default: 'ink', about: 'The lines between compartments' }),
  },
  // rings and band per row, the dividers of up to 16 compartments and the notches every 8 px on each row, the ornaments
  cost: (a) => { const [w, h0] = sizeOf(a), h = Math.min(h0, TROUGH_MAX); return 24 + (SKIN_RINGS + 4) * areaCount(h) + (OVERRIDES_PER_ROW + 2 * Math.ceil(w / 8)) * (h + 2) + 2 * 16 + ornamentCost(w, h, a.every); },
  run(a) {
    const T = troughGeom(a);
    const { x, y, w, h, rings, o } = T;
    if (w < 3 || h < 3) return [];
    const rail = a.role === 'rail', open = o.w > 0 && o.h > 0;
    const R = raster();
    const D = depthGrid(edgeRows(a.edge, x, y, w, h, clampI(a.corner, 0, rail ? 2 : 4)), { x, y, w, h });
    const well = a.trough === 'well';
    // the band is the ring at bandAt, in its own paint: the frame in every skin but paper's, whose band is the card itself
    const band = rings.find((r) => r.band)?.paint ?? a.frame;
    const trough = a.trough === 'ink' ? mixOf(a.ink, a.frame, 0.2) : well ? a.face : mixOf(a.face, a.ink, 0.55);
    const inO = (px2, py2) => open && px2 >= o.x && px2 < o.x + o.w && py2 >= o.y && py2 < o.y + o.h;
    const faceAt = (px2, py2) => {
      if (inO(px2, py2)) {
        if (T.pitch && (px2 - o.x + 1) % T.pitch === 0) return a.divider;
        return py2 === o.y && !rail ? shadeOf(trough, well ? -0.5 : -1) : trough;
      }
      if (!rail && open && px2 >= o.x - 1 && px2 <= o.x + o.w && py2 >= o.y - 1 && py2 <= o.y + o.h && (px2 === o.x - 1 || px2 === o.x + o.w)) return a.rim;
      return band;
    };
    paintSlab(R, D, rings, band, a, faceAt);
    // a housing's opening is always ringed (in ink, or the skin's rim), whatever the corners (a bar's strip sits in a
    // ringed slot); a rail has no ring (the code's), and rings that leave no opening draw none
    if (!rail && open) {
      for (let px2 = o.x - 1; px2 <= o.x + o.w; px2++) { R.set(px2, o.y - 1, a.rim); R.set(px2, o.y + o.h, a.rim); }
      for (let py2 = o.y; py2 < o.y + o.h; py2++) { R.set(o.x - 1, py2, a.rim); R.set(o.x + o.w, py2, a.rim); }
    }
    if (a.notches) {
      for (let px2 = x + 8; px2 < x + w - 8; px2 += 8) for (let py2 = y + 1; py2 < y + h - 1; py2++) {
        const dd = D.at(px2, py2);
        if (dd > 1 && dd <= rings.length && rings[dd - 1].band) R.set(px2, py2, a.ink);
      }
    }
    const inside = (px2, py2) => D.at(px2, py2) > 0 && !inO(px2, py2), ring = (px2, py2) => inside(px2, py2) && D.at(px2, py2) <= rings.length;
    const deep = (px2, py2) => inside(px2, py2) && D.at(px2, py2) <= rings.length + 1;
    return [...R.prims([{ D, bases: basesOf(rings, band, trough) }]), ...ornaments(a, { x, y, w, h }, inside, ring, deep)];
  },
});

/** A housing's or rail's slice (Contract 8): a bar keeps `ends` px (and its caps) at each end and `edges` rows at the top and bottom, with its opening or tile pitch; its corner ornaments widen it. */
function measureTrough(a, ctx) {
  const T = troughGeom(a), size = Array.isArray(ctx.size) ? ctx.size : [0, 0], o = T.o, b = T.box;
  const fills = b.x <= 1 && b.y <= 1 && b.x + b.w >= size[0] - 1 && b.y + b.h >= size[1] - 1;
  const r = fills ? { x: 0, y: 0, w: size[0], h: size[1] } : { ...b };
  const reach = Array.isArray(a.trim) ? reachOf(cornerOrnaments(a, { x: T.x, y: T.y, w: T.w, h: T.h }, (px2, py2) => px2 >= T.x && px2 < T.x + T.w && py2 >= T.y && py2 < T.y + T.h), r) : { left: 0, top: 0, right: 0, bottom: 0 };
  if (a.role === 'rail') {
    if (fills) return { slice: 2 * UI_SLICE <= size[0] && 2 * UI_SLICE <= size[1] ? { left: UI_SLICE, top: UI_SLICE, right: UI_SLICE, bottom: UI_SLICE } : { rect: { ...r } } };
    if (2 * (UI_SLICE - 1) >= b.w) return { slice: { rect: { ...b } } };
    return { slice: { rect: { ...b }, left: UI_SLICE - 1, top: 0, right: UI_SLICE - 1, bottom: 0 } };
  }
  if (T.pitch) return { slice: { tile: { x: o.x + T.pitch, w: T.pitch }, opening: { ...o } } };
  // notches every 8 px across the band: the bar repeats at that pitch, so it tiles rather than stretches (the code's tick marks)
  if (a.notches) return { slice: { tile: { x: o.x + 16, w: 8 }, opening: { ...o } } };
  const end = fills ? clampI(a.ends, UI_SLICE, 24) : UI_SLICE - 1, ed = clampI(a.edges, 2, 8);
  const s = sliceOf({ lx: Math.max(r.x + end, o.x), ty: r.y + ed, rx: Math.min(r.x + r.w - end, o.x + o.w), by: r.y + r.h - ed }, r, fills, reach);
  return { slice: { ...s, opening: { ...o } } };
}

/**
 * ui.strip@1: a bar's fill strip, the opening of the ui.trough@1 called with the same box, rings, border, caps and
 * segments, cropped to `value`: an optional glossy top row, a darker bottom row, a glint at its start, diagonal hatching
 * and gaps over the housing's compartment lines; it turns toward `shine` by `flash` (with `fade`, dying away over a clip that does not loop).
 */
export const uiStrip = defineGenerator({
  id: 'ui.strip', v: 1, family: 'ui',
  about: 'A bar\'s fill strip in its housing\'s opening: gloss, glint, shadow row, hatching and compartments; it can flash.',
  args: {
    at: atArg(), size: sizeArg(12), style: styleArg(),   // at least 12: a smaller housing has no opening to fill
    border: px(1, 3, { default: 2, about: 'The housing\'s band width (the opening follows it)' }),
    rings: paints(SKIN_RINGS, { default: ['ink', 'frame', 'ink'], about: 'The housing\'s rings (only how many there are counts)' }),
    bandAt: count(0, SKIN_RINGS - 1, { default: 1, about: 'Which of them is the band' }),
    caps: px(0, 16, { default: 0, about: 'The housing\'s caps' }),
    ends: px(8, 24, { default: 8, about: 'The housing\'s ends: the least its slice keeps at each end' }),
    edges: px(2, 8, { default: 4, about: 'The housing\'s edges: the rows its slice keeps at the top and the bottom' }),
    notches: flag({ default: false, about: 'The housing has notches: the slice is then their tile pitch, as the housing\'s (the strip draws none)' }),
    segments: count(0, 16, { default: 0, about: 'The housing\'s compartments' }),
    value: share({ default: 1, about: 'How full the strip is (a game crops a full strip itself)' }),
    gloss: flag({ default: false, about: 'A lighter top row' }),
    shadow: flag({ default: true, about: 'A darker bottom row (strips 3 px tall or more)' }),
    glint: flag({ default: false, about: 'A small bright wedge at the start of the top rows (4, 3 and 2 px)' }),
    hatch: flag({ default: false, about: 'Diagonal lines of a darker tone every 4 px' }),
    flash: share({ default: 0, about: 'How far the strip has turned toward the shine' }),
    fade: flag({ default: false, about: 'The flash dies away over the clip (pulses when the clip loops)' }),
    fill: paint({ default: 'fill', about: 'The strip' }),
    shine: paint({ default: 'frame', about: 'A light slot (white) the strip flashes toward and glints with' }),
    hatchIn: paint({ default: 'clear', about: 'The hatching\'s paint (clear: the strip\'s own dark tone; paper: the frame, its ink)' }),
  },
  // rows of fill, gloss, shadow, glint and up to 16 compartment lines; the hatching as stamps of 32 x 32
  cost: (a) => { const [w, h0] = sizeOf(a), h = Math.min(h0, TROUGH_MAX); return 8 + (2 * 16 + 8) * (h + 1) + 2 * (Math.ceil(w / 32) + 1) * (Math.ceil(h / 32) + 1); },
  run(a, ctx) {
    const T = troughGeom({ ...a, role: 'housing', edge: 'round', corner: 0 });
    const { o } = T;
    const n = Math.round(o.w * clamp01(a.value));
    if (n <= 0 || o.h <= 0) return [];
    const t = fin(ctx?.t) ? ctx.t : 0;
    const amount = clamp01(a.flash) * (a.fade ? (ctx?.loop ? 0.5 + 0.5 * Math.cos(2 * Math.PI * t) : 1 - clamp01(t)) : 1);
    const lift = (p) => (amount > 0 ? mixOf(p, a.shine, amount) : p);
    const R = raster();
    const dark = toneOf(a.fill, 'dark'), light = toneOf(a.fill, 'light');
    const marks = new Map();
    for (let py2 = o.y; py2 < o.y + o.h; py2++) for (let px2 = o.x; px2 < o.x + n; px2++) {
      const j = py2 - o.y, i = px2 - o.x;
      let p = a.fill;
      if (a.hatch && (i + j) % 4 === 0 && !(T.pitch && (i + 1) % T.pitch === 0) && !(a.shadow && j === o.h - 1 && o.h >= 3)) marks.set(`${px2},${py2}`, 'h');
      if (a.gloss && j === 0 && o.h >= 3) p = light;
      if (a.shadow && j === o.h - 1 && o.h >= 3) p = dark;
      if (T.pitch && (i + 1) % T.pitch === 0) continue;   // a gap over the housing's compartment line
      if (a.glint && o.h >= 3 && i >= 1 && i <= 4 - j && j <= 2 && j < o.h - 1) p = a.shine;   // a glint in the strip's top left, kept inside the end's slice
      R.set(px2, py2, lift(p));
    }
    const hatchPaint = a.hatchIn === undefined || a.hatchIn === 'clear' ? dark : a.hatchIn;
    return [...R.prims(), ...marksToStamps(marks, { h: lift(hatchPaint) })];
  },
});

function measureStrip(a, ctx) { return measureTrough({ ...a, role: 'housing', edge: 'round', corner: 0 }, ctx); }

// ---- ui.toggle ----------------------------------------------------------------------------------------------------

/** The box of a toggle round its centre: a check or radio `size` px square, a switch `size` x (size * 4 / 7 rounded up to even). */
function toggleBox(a) {
  const s = clampI(a.size, 8, 40), cx = Math.floor(a.at[0]), cy = Math.floor(a.at[1]);
  const w = s, h = a.kind === 'switch' ? Math.max(8, Math.round((s * 4) / 7 / 2) * 2) : s;
  return { x: cx - (w >> 1), y: cy - (h >> 1), w, h };
}

/** The pixels of a tick in a face box f: a short arm down to the right, then a long one up to the right, 2 px thick. */
function tickPixels(f) {
  const out = new Set();
  const u = Math.max(1, Math.floor(Math.min(f.w, f.h) / 6));
  const x0 = f.x + u, yMid = f.y + Math.floor(f.h / 2), knee = [f.x + Math.floor(f.w * 0.4), f.y + f.h - 1 - u], tip = [f.x + f.w - 1 - u, f.y + u];
  const line = (ax, ay, bx2, by2) => {
    const n = Math.max(Math.abs(bx2 - ax), Math.abs(by2 - ay));
    for (let s = 0; s <= n; s++) {
      const px2 = Math.round(ax + ((bx2 - ax) * s) / Math.max(1, n)), py2 = Math.round(ay + ((by2 - ay) * s) / Math.max(1, n));
      out.add(`${px2},${py2}`); out.add(`${px2},${py2 - 1}`);
    }
  };
  line(x0, yMid, knee[0], knee[1]);
  line(knee[0], knee[1], tip[0], tip[1]);
  return [...out].map((k) => k.split(',').map(Number)).filter(([px2, py2]) => px2 >= f.x && px2 < f.x + f.w && py2 >= f.y && py2 < f.y + f.h);
}

/**
 * ui.toggle@1: a skinned check box (a tick of the accent, inked round, when on), a radio option (a round slab with a dot
 * of the accent when on) or an on/off switch (a pill track of the accent when on, of the face's dark tone when off, its
 * round knob of the band at the end it is set to), centred on `at`.
 */
export const uiToggle = defineGenerator({
  id: 'ui.toggle', v: 1, family: 'ui',
  about: 'A skinned check box, radio option or on/off switch, on or off.',
  args: {
    at: point({ about: 'Its centre' }), ...skinArgs(),
    kind: word(['check', 'radio', 'switch'], { default: 'check', about: 'A check box, a radio option or a switch' }),
    checked: flag({ default: true, about: 'Ticked, chosen or switched on' }),
    size: count(8, 40, { default: 20, about: 'Its width in pixels (a switch is a little over half as tall)' }),
    knob: paint({ default: 'frame', about: 'A switch\'s knob' }),
  },
  // the rings and face as nested areas (two layers for a switch), the toned band, the tick or dot and its ink as rects, the ornaments
  cost: (a) => { const s = clampI(a.size, 8, 40); return 24 + 2 * (SKIN_RINGS + 4) * areaCount(s) + OVERRIDES_PER_ROW * (s + 2) + ornamentCost(s, s, a.every); },
  run(a) {
    const b = toggleBox(a);
    const R = raster();
    const k = clampI(a.corner, 0, 4);
    if (a.kind === 'switch') {
      const rows = roundRows(b.x, b.y, b.w, b.h, Math.min(4, (b.h - 1) >> 1));
      const D = depthGrid(rows, b);
      const track = a.checked ? a.accent : toneOf(a.face, 'dark');
      paintSlab(R, D, [{ paint: a.ink, band: false }], a.frame, { ...a, lit: false }, () => track);
      const d = b.h - 4, kx = a.checked ? b.x + b.w - 2 - d : b.x + 2, ky = b.y + 2;
      const K = depthGrid(discRows(kx, ky, d), { x: kx, y: ky, w: d, h: d });
      paintSlab(R, K, [{ paint: a.ink, band: false }], a.knob, a, (px2, py2) => (py2 < ky + (d >> 2) + 1 && px2 > kx + (d >> 1) ? toneOf(a.knob, 'light') : a.knob));
      return R.prims([{ D, bases: [a.ink, track] }, { D: K, bases: [a.ink, a.knob] }]);
    }
    const rows = a.kind === 'radio' ? discRows(b.x, b.y, b.w) : edgeRows(a.edge, b.x, b.y, b.w, b.h, k);
    const D = depthGrid(rows, b);
    const rings = ringList(a), E = rings.length;
    const f = { x: b.x + E, y: b.y + E, w: b.w - 2 * E, h: b.h - 2 * E };
    let mark = () => null;
    if (a.checked && a.kind === 'check' && f.w >= 4) {
      const tick = new Set(tickPixels(f).map(([px2, py2]) => `${px2},${py2}`));
      const near = (px2, py2) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tick.has(`${px2 + dx},${py2 + dy}`));
      mark = (px2, py2) => (tick.has(`${px2},${py2}`) ? a.accent : near(px2, py2) ? a.ink : null);
    } else if (a.checked && a.kind === 'radio' && f.w >= 3) {
      const dd = Math.max(3, f.w - 4), off = (b.w - dd) >> 1;
      const dot = new Map(discRows(b.x + off, b.y + off, dd).map((r) => [r[0], r]));
      mark = (px2, py2) => { const r = dot.get(py2); return r && px2 >= r[1] && px2 <= r[2] ? a.accent : null; };
    }
    paintSlab(R, D, rings, a.frame, a, (px2, py2) => mark(px2, py2) ?? a.face);
    const inside = (px2, py2) => D.at(px2, py2) > 0;
    return [...R.prims([{ D, bases: basesOf(rings, a.frame, a.face) }]), ...ornaments(a, b, inside)];
  },
});

// ---- ui.pointer and ui.selector -----------------------------------------------------------------------------------

/** The pointer's nudge at phase t: 1, 2, 2, 2, 1, 0, 0, 0 px over a loop of 8 (its first and last frames differ). */
const nudge = (t, reach) => Math.round(reach * pulse(fract(t + 0.25)));

/** The rows of a pointer pointing right from x (its tail end) at centre row cy: a tail 4 px tall, then a head 2 * half + 1 px tall. */
function pointerRows(x, cy, len) {
  const head = Math.max(5, Math.round(len * 0.55)), half = Math.max(3, Math.min(7, Math.round(head * 0.55))), tail = len - head;
  const out = [];
  for (let py2 = cy - half; py2 <= cy + half; py2++) {
    const dy = Math.abs(py2 - cy);
    const reach = Math.round(((half - dy) / half) * (head - 1));
    const x0 = dy <= 2 && tail > 0 ? x : x + tail, x1 = x + tail + reach;
    if (x0 <= x1) out.push([py2, x0, x1]);
  }
  return out;
}

/**
 * ui.pointer@1: a skinned pointer pointing right: a head on a short tail, `len` px long from `at` (its tail end, centre
 * row), its outline and band the skin's round a face of the accent, nudging up to `reach` px toward what it points at
 * once a loop. The point is its furthest right pixel.
 */
export const uiPointer = defineGenerator({
  id: 'ui.pointer', v: 1, family: 'ui',
  about: 'A skinned pointer: an arrow head on a short tail that nudges toward what it points at once a loop.',
  args: {
    at: point({ about: 'Its tail end, on its centre row' }), ...skinArgs(),
    len: count(8, 28, { default: 20, about: 'Its length in pixels' }),
    reach: px(0, 3, { default: 2, about: 'How far it nudges, once a loop' }),
  },
  keyable: [],
  cost: (a) => 24 + 4 * areaCount(16) + OVERRIDES_PER_ROW * 18 + ornamentCost(clampI(a.len, 8, 28), 16, a.every),
  run(a, ctx) {
    const t = fin(ctx?.t) ? ctx.t : 0;
    const x = Math.floor(a.at[0]) + nudge(t, clampI(a.reach, 0, 3)), cy = Math.floor(a.at[1]), len = clampI(a.len, 8, 28);
    const rows = pointerRows(x, cy, len);
    const box = { x, y: rows[0][0], w: len, h: rows.length };
    const D = depthGrid(rows, box);
    const R = raster();
    const rings = ringList({ ...a, border: 1 });
    paintSlab(R, D, rings.slice(0, 2), a.frame, a, (px2, py2) => (py2 < cy ? toneOf(a.accent, 'light') : a.accent));
    return R.prims([{ D, bases: basesOf(rings.slice(0, 2), a.frame, a.accent) }]);
  },
});

/** The four brackets of a selector in box b stepped `step` px in: rows of each L `len` long and `thick` thick. */
function bracketCells(b, step, len, thick) {
  const cells = new Set();
  const corners = [[b.x + step, b.y + step, 1, 1], [b.x + b.w - 1 - step, b.y + step, -1, 1], [b.x + step, b.y + b.h - 1 - step, 1, -1], [b.x + b.w - 1 - step, b.y + b.h - 1 - step, -1, -1]];
  for (const [cx, cy, dx, dy] of corners) for (let i = 0; i < len; i++) for (let s = 0; s < thick; s++) {
    cells.add(`${cx + dx * i},${cy + dy * s}`);
    cells.add(`${cx + dx * s},${cy + dy * i}`);
  }
  return cells;
}

/**
 * ui.selector@1: four skinned corner brackets round a slot (its box `at`, `size`), each an L of the band inked round,
 * that step in 1 px and back out once a loop; the slot inside stays empty, so it nine-slices round any slot.
 */
export const uiSelector = defineGenerator({
  id: 'ui.selector', v: 1, family: 'ui',
  about: 'Four skinned corner brackets round a slot that step in and back out once a loop.',
  args: {
    at: atArg(), size: sizeArg(12), ...skinArgs(),
    len: count(3, 12, { default: 6, about: 'How long each arm of a bracket is' }),
    thick: count(1, 3, { default: 2, about: 'How thick a bracket is' }),
  },
  cost: (a) => { const [, h] = sizeOf(a); return 8 + 8 * (h + 2); },
  run(a, ctx) {
    const t = fin(ctx?.t) ? ctx.t : 0;
    const box = boxOf(a);
    const step = 1 + (pulse(t) > 0.5 ? 1 : 0);
    const cells = bracketCells(box, step, clampI(a.len, 3, 12), clampI(a.thick, 1, 3));
    const R = raster();
    for (const k of cells) { const [px2, py2] = k.split(',').map(Number); R.set(px2, py2, pulse(t) > 0.5 ? shadeOf(a.frame, 0.3) : a.frame); }
    for (const k of cells) {
      const [px2, py2] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells.has(`${px2 + dx},${py2 + dy}`)) R.set(px2 + dx, py2 + dy, a.ink);
    }
    return R.prims();
  },
});

const measureSelector = (a, ctx) => {
  const b = boxOf(a), size = Array.isArray(ctx.size) ? ctx.size : [0, 0];
  const fills = b.x <= 1 && b.y <= 1 && b.x + b.w >= size[0] - 1 && b.y + b.h >= size[1] - 1;
  return { slice: fills ? { left: UI_SLICE, top: UI_SLICE, right: UI_SLICE, bottom: UI_SLICE } : { rect: { ...b }, left: UI_SLICE - 1, top: UI_SLICE - 1, right: UI_SLICE - 1, bottom: UI_SLICE - 1 } };
};

// ---- ui.area ------------------------------------------------------------------------------------------------------

/**
 * ui.area@1: draws nothing. Named first among a clip's interface pieces (the panel layout measures the first one in
 * effect), it gives the clip the text areas and slice written in its arguments, which may follow a control through a
 * table binding: for a board drawn by a piece whose own measure does not fit the clip (the wooden titled panel's
 * heading strip). A text area of the size given, an optional second one (`also`), and the slice when any border is set.
 */
export const uiArea = defineGenerator({
  id: 'ui.area', v: 1, family: 'ui',
  about: 'Draws nothing: gives a clip the text areas (one or two) and nine-slice border written in its arguments.',
  args: {
    at: point({ lo: -256, hi: 256, default: [0, 0], about: 'The top left of the text area, in frame pixels' }),
    size: point({ lo: 1, hi: 256, default: [8, 8], about: 'The width and height of the text area' }),
    edge: point({ lo: -256, hi: 256, default: [-1, -1], about: 'The edge pixel, where the frame\'s contrast with the text is measured (a negative coordinate: none)' }),
    text: paint({ default: 'clear', about: 'The colour the text is made for (clear: the skin\'s, else white)' }),
    also: flag({ default: false, about: 'A second text area (a heading)' }),
    alsoAt: point({ lo: -256, hi: 256, default: [0, 0], about: 'The top left of the second text area' }),
    alsoSize: point({ lo: 1, hi: 256, default: [8, 8], about: 'The width and height of the second text area' }),
    alsoText: paint({ default: 'clear', about: 'The colour the second area\'s text is made for (clear: the skin\'s, else white)' }),
    left: px(0, 64, { default: 0, about: 'The slice\'s left border (no slice when all four are 0)' }),
    top: px(0, 64, { default: 0, about: 'The slice\'s top border' }),
    right: px(0, 64, { default: 0, about: 'The slice\'s right border' }),
    bottom: px(0, 64, { default: 0, about: 'The slice\'s bottom border' }),
  },
  keyable: [],
  cost: () => 0,
  run: () => [],
});

/** The generators of this module that work in frame pixels by design (engine/gen/index.js FRAME_GENERATORS): never drawn on a node. */
export const SKIN_FRAME_GENERATORS = Object.freeze({
  'ui.area@1': 'draws nothing: the text areas and slice it gives a clip are frame pixels, so it is named in a panel body, never on a node',
});

/** ui.area@1's measure: the areas and slice its arguments write, whole pixels, kept to the frame (fitMeasure; a slice must leave a middle, as a sprite's own slice must). */
function measureArea(a, ctx = {}) {
  const whole = (v) => Math.round(fin(v) ? v : 0);
  const area = (at, size, text, edge) => ({ x: whole(at?.[0]), y: whole(at?.[1]), w: Math.max(1, whole(size?.[0])), h: Math.max(1, whole(size?.[1])),
    ...(edge && whole(edge[0]) >= 0 && whole(edge[1]) >= 0 ? { edge: { x: whole(edge[0]), y: whole(edge[1]) } } : {}), ...(text !== undefined && text !== 'clear' ? { colour: text } : {}) });
  const one = area(a.at, a.size, a.text, a.edge);
  const out = { textArea: a.also ? [one, area(a.alsoAt, a.alsoSize, a.alsoText, null)] : one };
  const b = { left: whole(a.left), top: whole(a.top), right: whole(a.right), bottom: whole(a.bottom) };
  if (b.left || b.top || b.right || b.bottom) out.slice = b;
  // kept to the frame: an area cut to it (dropped when nothing is left), a slice that leaves no middle dropped
  const fit = fitMeasure(out, ctx.size);
  if (fit.slice && (fit.slice.left + fit.slice.right >= (ctx.size?.[0] ?? 0) || fit.slice.top + fit.slice.bottom >= (ctx.size?.[1] ?? 0))) delete fit.slice;
  return fit;
}

/** The pieces of this module, "<id>@<v>" each (all family "ui"). */
export const SKIN_PIECES = Object.freeze(['ui.slab@1', 'ui.trough@1', 'ui.strip@1', 'ui.toggle@1', 'ui.pointer@1', 'ui.selector@1', 'ui.area@1']);

/** A measure whose result is kept to the frame (fitMeasure). */
const fitted = (fn) => (a, ctx = {}) => fitMeasure(fn(a, ctx), ctx.size);

/** Where each piece of this module puts its slice and text area, "<id>@<v>" -> (args with defaults, ctx) -> { slice?, textArea? } (Contract 8), always kept to the frame (fitMeasure); engine/gen/ui-pieces.js joins them to UI_MEASURES. */
export const SKIN_MEASURES = Object.freeze({
  'ui.slab@1': fitted(measureSlab), 'ui.trough@1': fitted(measureTrough), 'ui.strip@1': fitted(measureStrip),
  'ui.toggle@1': () => ({}), 'ui.pointer@1': () => ({}), 'ui.selector@1': fitted(measureSelector), 'ui.area@1': measureArea,
  // migration batch M8b: the second versions and the lit trough (below)
  'ui.trough.lit@1': fitted(measureTrough), 'ui.toggle@2': () => ({}), 'ui.pointer@2': measurePointer2, 'ui.selector@2': fitted(measureSelector),
  // review M8b round 1: the RPG bars' fill lit as the code's barFill
  'ui.strip.lit@1': fitted(measureStrip),
});

// ---- the lit trough and the second versions (migration batch M8b) --------------------------------------------------
// The control sets (sprites/ui-controls-*.json) and the neon bars redrawn as data: each draws what the code helpers drew
// (engine/ui-skins.js skinCheck, skinRadio, skinSwitch, skinPointer, skinSelector, skinSlider; engine/ui-neon-tube.js
// neonBarTube) closer than version 1, which stays as it was (its goldens) until no asset names it. Each takes every
// argument of the piece it extends, so a skin's arguments reach both.

/** The pieces migration batch M8b added to this module, "<id>@<v>" each (all family "ui"): the lit trough and three second versions. */
export const SKIN_PIECES_2 = Object.freeze(['ui.trough.lit@1', 'ui.toggle@2', 'ui.pointer@2', 'ui.selector@2', 'ui.strip.lit@1']);

const isClear = (p) => p === undefined || p === null || p === 'clear';
/** The pixels of a shape test sampled at pixel centres in a box, as rows [[y, x0, x1]] (one run per row: convex shapes). */
function rowsOfTest(x, y, w, h, inside) {
  const out = [];
  for (let py2 = y; py2 < y + h; py2++) {
    let a = null, b = null;
    for (let px2 = x; px2 < x + w; px2++) if (inside(px2 + 0.5, py2 + 0.5)) { if (a === null) a = px2; b = px2; }
    if (a !== null) out.push([py2, a, b]);
  }
  return out;
}
/** The pixels (as "x,y" keys) 4-next to a set of pixels and not in it: the ink outline the code drew round a shape. */
function inkRound(cells) {
  const out = new Set();
  for (const k of cells) {
    const [px2, py2] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = `${px2 + dx},${py2 + dy}`; if (!cells.has(n)) out.add(n); }
  }
  return out;
}
const cellXY = (k) => k.split(',').map(Number);

/**
 * ui.trough.lit@1: ui.trough@1 lit as a tube, as the code's neonBarTube drew the neon bars: `glowRing` (with extras on)
 * rings the inside of a housing's opening and is a rail's band; `core` is a rail's trough (a light core inside its band)
 * and with `twoTubes` the lower half of it is the accent (a second tube). With none of them it draws exactly as ui.trough@1. A generator of
 * its own rather than ui.trough@2, so the other skin families' bars keep naming the newest ui.trough.
 */
export const uiTroughLit = defineGenerator({
  id: 'ui.trough.lit', v: 1, family: 'ui',
  about: 'A skinned bar housing round its opening, or a slider\'s rail, lit as a tube: a glow inside the opening, a rail with a light core.',
  args: {
    ...uiTrough.args,
    glowRing: paint({ default: 'clear', about: 'With extras on: a ring just inside a housing\'s opening and a rail\'s band, a neon tube\'s glow (clear: none)' }),
    core: paint({ default: 'clear', about: 'A rail\'s trough: the light core inside its band (clear: the trough that `trough` says)' }),
    twoTubes: flag({ default: false, about: 'The lower half of a rail\'s core in the accent: a second tube' }),
    sign: flag({ default: false, about: 'Neon sign: the tube broken where it bends at each corner (its pixels on the corner\'s diagonal and one beside), in the face\'s tone -1' }),
  },
  // version 1's bound over the rows it draws (a rail at most 6), and the glow ring and the second tube's rows as rects
  cost: (a) => { const [w, h0] = sizeOf(a), h = Math.min(h0, a.role === 'rail' ? 6 : TROUGH_MAX); return 24 + (SKIN_RINGS + 4) * areaCount(h) + (OVERRIDES_PER_ROW + 2 * Math.ceil(w / 8)) * (h + 2) + 2 * 16 + ornamentCost(w, h, a.every) + 2 * (h + 2) + 4; },
  run(a) {
    const T = troughGeom(a);
    const { x, y, w, h, rings, o } = T;
    if (w < 3 || h < 3) return [];
    const rail = a.role === 'rail', open = o.w > 0 && o.h > 0;
    const glow = a.extras && !isClear(a.glowRing) ? a.glowRing : null;
    const R = raster();
    const D = depthGrid(edgeRows(a.edge, x, y, w, h, clampI(a.corner, 0, rail ? 2 : 4)), { x, y, w, h });
    const well = a.trough === 'well';
    const band = rail && glow ? glow : rings.find((r) => r.band)?.paint ?? a.frame;
    const trough = rail && !isClear(a.core) ? a.core : a.trough === 'ink' ? mixOf(a.ink, a.frame, 0.2) : well ? a.face : mixOf(a.face, a.ink, 0.55);
    const low = rail && a.twoTubes ? a.accent : null, mid = y + (h >> 1);
    const inO = (px2, py2) => open && px2 >= o.x && px2 < o.x + o.w && py2 >= o.y && py2 < o.y + o.h;
    const faceAt = (px2, py2) => {
      if (inO(px2, py2)) {
        if (T.pitch && (px2 - o.x + 1) % T.pitch === 0) return a.divider;
        if (!rail && glow && (px2 === o.x || py2 === o.y || px2 === o.x + o.w - 1 || py2 === o.y + o.h - 1)) return glow;
        if (low && py2 >= mid) return low;
        return py2 === o.y && !rail ? shadeOf(trough, well ? -0.5 : -1) : trough;
      }
      if (!rail && open && px2 >= o.x - 1 && px2 <= o.x + o.w && py2 >= o.y - 1 && py2 <= o.y + o.h && (px2 === o.x - 1 || px2 === o.x + o.w)) return a.rim;
      return band;
    };
    paintSlab(R, D, rings.map((r) => (r.band && rail && glow ? { ...r, paint: glow } : r)), band, a, faceAt);
    // review M8b round 1: the sign's gaps (moreSkinMarks sign), on the rings only, never on ink
    if (a.sign) for (const [cx, cy, sx, sy] of boxCorners({ x, y, w, h })) for (let i = 0; i < Math.min(w, h) >> 1; i++) for (const [u, v] of [[i, i], [i + 1, i]]) {
      const px2 = cx + sx * u, py2 = cy + sy * v, dd = D.at(px2, py2);
      if (dd >= 2 && dd <= rings.length && !inO(px2, py2) && R.paintAt(px2, py2) !== a.ink) R.set(px2, py2, shadeOf(a.face, -1));
    }
    if (!rail && open) {
      for (let px2 = o.x - 1; px2 <= o.x + o.w; px2++) { R.set(px2, o.y - 1, a.rim); R.set(px2, o.y + o.h, a.rim); }
      for (let py2 = o.y; py2 < o.y + o.h; py2++) { R.set(o.x - 1, py2, a.rim); R.set(o.x + o.w, py2, a.rim); }
    }
    if (a.notches) {
      for (let px2 = x + 8; px2 < x + w - 8; px2 += 8) for (let py2 = y + 1; py2 < y + h - 1; py2++) {
        const dd = D.at(px2, py2);
        if (dd > 1 && dd <= rings.length && rings[dd - 1].band) R.set(px2, py2, a.ink);
      }
    }
    const inside = (px2, py2) => D.at(px2, py2) > 0 && !inO(px2, py2), ring = (px2, py2) => inside(px2, py2) && D.at(px2, py2) <= rings.length;
    const deep = (px2, py2) => inside(px2, py2) && D.at(px2, py2) <= rings.length + 1;
    return [...R.prims([{ D, bases: basesOf(rings, band, trough) }]), ...ornaments(a, { x, y, w, h }, inside, ring, deep)];
  },
});

// ---- the code sets' band marks on a toggle (review M8b round 1: each family's look at its defaults) ----------------
// Ports of what engine/ui-skins-more.js moreSkinMarks, engine/ui-grove-vine.js groveMarks, engine/ui-neon-tube.js
// neonGrowBand, engine/ui-crystal-frost.js (icicles, ferns, shards), engine/ui-gilded.js gildedCorners and
// engine/ui-paper.js paperMarks and engine/paper-tear.js tearEdges drew over the code sets' check boxes, options and
// switches, each an argument of ui.toggle@2 that a sprite names (per style through a pick): no mark is ever on unless
// asked for, so a call without them draws as before (the flat set's pixels).

/** Gold, as a paint a generator may hand on (the code's PALETTE.thornwood.gold, a bloom flower's heart): the identity mix. */
const GOLD_PAINT = Object.freeze({ rule: 'mix', of: '#f2c230', with: '#f2c230', amount: 0 });
/** White, as a paint a generator may hand on (the code's '#ffffff': an icicle's or a shard's tip). */
const WHITE_PAINT = Object.freeze({ rule: 'mix', of: '#ffffff', with: '#ffffff', amount: 0 });

/** The gilded corner plates of engine/ui-gilded.js (top left corner, row from the outline in): T the outer row's bevel, S the outer column's, G gold, L lit, D dark, o ink, g the gem's place, x a chip. */
const GILDED_PLATES = Object.freeze({
  temple: ['TTTTTT', 'SgggGG', 'SgggGG', 'SgggGo', 'SGGGoo', 'SGGo..'],
  royal: ['TTTTTT', 'SgggDL', 'SgggDD', 'SgggDL', 'SDDDDD', 'SLDLD.'],
  ruin: ['xx.xx.', 'xgggDo', '.gggDD', '.ggg.o', 'xD.o..', 'xoD...'],
});
const PLATE_BASE = { temple: 'G', royal: 'G', ruin: 'D' }, PLATE_MARK = { temple: 'o', royal: 'L', ruin: 'o' };

/** The band marks ui.toggle@2 takes beside version 1's arguments (each off by default). Their colours are the code's tones of the piece's own paints (so a toggle names few paints: gen-node-origin holds a generator to 12). */
const TOGGLE_MARK_ARGS = Object.freeze({
  tube: word(['none', 'tube', 'double', 'sign'], { default: 'none', about: 'Neon: a light core in the band (tube, double: a gap of the face outside it; double: a second tube of the accent; sign: the band broken at its bends)' }),
  vine: word(['none', 'vine', 'bark', 'bloom'], { default: 'none', about: 'Grove: the band twisted every 2 px (vine, bloom: with flowers and buds), or bark: its inner lines dark, with knots' }),
  twistIn: count(0, 2, { default: 0, about: 'How many pixels each twist stripe runs on over the face (or a switch\'s track)' }),
  bevel: word(['none', 'outer', 'skin', 'frosted'], { default: 'none', about: 'The band bevelled: outer (crystal, its outer line), skin (candy, gilded: outer line lit up and right, every line dark down and left) or frosted (as skin, lit wherever it faces up)' }),
  bevelDepth: share({ default: 0.5, about: 'How much darker the bevel\'s dark side is (the code: crystal 0.6, candy 0.5, gilded 1); its light side is the frame\'s tone +0.85' }),
  facets: word(['none', 'ice', 'rime', 'shard'], { default: 'none', about: 'Crystal: icicles hanging from the top band, a frost fern in from each corner (its tip the accent), or shards standing on the bottom band' }),
  plate: word(['none', 'temple', 'royal', 'ruin'], { default: 'none', about: 'Gilded: the code\'s gold corner plate of that style in each corner (no gem: a mark in its middle)' }),
  plateSize: count(1, 6, { default: 4, about: 'How many rows and columns of the plate are drawn' }),
  fillet: flag({ default: false, about: 'Gilded temple: a ring of the frame inside every ring, the face\'s first ring (its gold fillet)' }),
  stripes: flag({ default: false, about: 'Candy striped: the band\'s pixels on every third diagonal in the frame\'s tone -1.5' }),
  gloss: flag({ default: false, about: 'Candy jelly: the face\'s first row where it faces up in the face\'s tone +0.45' }),
  bites: flag({ default: false, about: 'Paper torn: 2 px bites along the sides (a box two a side, a switch two in its top and bottom), inked again' }),
  card: count(0, 6, { default: 0, about: 'Paper card: the top right corner folded down this many px and the face\'s bottom two rows in its dark tone; 0: none' }),
  cracks: flag({ default: false, about: 'Gilded ruin: the code\'s two cracks, a box\'s from its band into the stone (a lit lip beside each), a switch\'s across its band' }),
  trackOff: paint({ default: 'clear', about: 'A switch\'s track when off (clear: the face\'s dark tone)' }),
  trackEnd: paint({ default: 'clear', about: 'An on switch\'s track from its knob\'s middle to its end in this (paper: the rule, so no accent shows beside the knob); clear: the track' }),
});

/** The paints a ui.toggle@2 call's band marks draw with, from its words and flags: each the code's tone of the piece's own paints (engine/ui-skins-more.js moreSkinTones, engine/ui-skins.js skinTones), null when off. */
function toggleMarkPaints(a) {
  const t = a.tube ?? 'none', v = a.vine ?? 'none';
  return {
    core: t !== 'none' ? shadeOf(a.frame, 0.85) : null,
    gapRing: t === 'tube' || t === 'double' ? a.face : null,
    inner: t === 'double' ? a.accent : v === 'bark' ? shadeOf(a.frame, -1) : null,
    bandInner: v === 'bark' ? shadeOf(a.frame, -1) : null,
    gap: t === 'sign' ? shadeOf(a.face, -1) : null,
    gapClip: t === 'sign' ? shadeOf(a.frame, -1) : null,
    twist: v === 'vine' || v === 'bloom' ? shadeOf(a.frame, -1) : null,
    knot: v === 'bark' ? shadeOf(a.face, 0.45) : null,
    flower: v === 'bloom' ? a.accent : null,
    faceRing: a.fillet ? a.frame : null,
    diagonal: a.stripes ? shadeOf(a.frame, -1.5) : null,
    gloss: a.gloss ? shadeOf(a.face, 0.45) : null,
    light: shadeOf(a.frame, 0.85), dark: shadeOf(a.frame, -clamp01(fin(a.bevelDepth) ? a.bevelDepth : 0.5) * 1),
  };
}

/** Does a ui.toggle@2 call ask for any band mark (its cost then counts a rect a pixel). */
function toggleMarked(a) {
  return (a.tube && a.tube !== 'none') || (a.vine && a.vine !== 'none') || (a.bevel && a.bevel !== 'none') || (a.facets && a.facets !== 'none') || (a.plate && a.plate !== 'none')
    || !!a.fillet || !!a.stripes || !!a.gloss || !!a.bites || a.card > 0 || !!a.cracks || !isClear(a.trackOff) || !isClear(a.trackEnd);
}

/** An upper bound on the stamps ornaments returns for these arguments over a w x h box: each corner list's stamps times its places (4, 2 or 1), and the along lists' runs when they hold a stamp (ornamentCost, counted from the lists given). */
function ornamentCostOf(a, w, h) {
  const n = (l) => Math.min(Array.isArray(l) ? l.length : 0, SKIN_TRIMS), al = (l) => (Array.isArray(l) && l.length ? 1 : 0);
  const e = Math.max(4, fin(a.every) ? a.every : 4), runs = 2 * (Math.ceil(Math.max(0, w) / e) + 1) + 2 * (Math.ceil(Math.max(0, h) / e) + 1);
  return 4 * n(a.trim) + 2 * n(a.topTrim) + n(a.rightTrim) + 2 * runs * al(a.along)
    + (a.extras ? 4 * n(a.extra) + 2 * n(a.extraTop) + 2 * runs * al(a.extraAlong) : 0) + (a.gleam ? 4 * n(a.gleamTrim) + 2 * n(a.gleamTop) + n(a.gleamRight) : 0);
}

/** The code's ruin cracks (sprites/ui-controls-gilded.js): ink and the stone's lit lip, in pixels from a 20 px box's or a 28 x 16 switch's top left. */
const RUIN_CRACKS = Object.freeze({
  box: { ink: [[7, 1], [7, 2], [6, 3], [6, 4], [5, 5], [5, 6], [4, 7], [18, 13], [17, 13], [16, 14], [15, 14], [14, 15], [13, 15]], lip: [[7, 4], [6, 5], [6, 6], [5, 7], [15, 13], [14, 14], [13, 14]] },
  // a switch's two cracks (the code drew them with engine/rock.js crack, seeds 4 and 8): across the band, top right and bottom left
  switch: { ink: [[20, 1], [20, 2], [19, 3], [19, 4], [18, 5], [19, 6], [8, 9], [9, 10], [8, 11], [8, 12], [7, 13], [7, 14]], lip: [] },
});

/** ui.toggle@2's rings: the skin's (ringList) with the tube's gap ring after the outline, every band line after the first in the bark's dark tone, the second the tube's core (neither then lit as the band), the second tube or the bark's dark ring just inside the band, and the gilded fillet inside them all; band lines carry `line` (0 the outer one). */
function toggleRings(a, { onSwitch = false } = {}) {
  const M = toggleMarkPaints(a);
  const base = ringList(a), out = [];
  if (M.gapRing && !onSwitch) base.splice(1, 0, { paint: M.gapRing, band: false });
  let line = 0;
  base.forEach((r, i) => {
    if (!r.band) { out.push(r); return; }
    let p = null;
    if (line >= 1 && M.bandInner) p = M.bandInner;
    if (line === 1 && M.core) p = M.core;
    out.push(p === null ? { ...r, line } : { paint: p, band: false, line });
    line++;
    if (!(base[i + 1] && base[i + 1].band) && M.inner) out.push({ paint: M.inner, band: false, innerRing: true });
  });
  if (M.faceRing && !onSwitch) out.push({ paint: M.faceRing, band: false });
  return out;
}

/** The four corners of a box as [corner x, corner y, step x, step y]: top left, top right, bottom right, bottom left. */
const boxCorners = (b) => [[b.x, b.y, 1, 1], [b.x + b.w - 1, b.y, -1, 1], [b.x + b.w - 1, b.y + b.h - 1, -1, -1], [b.x, b.y + b.h - 1, 1, -1]];

/**
 * Draws ui.toggle@2's band marks into the raster R of a toggle (its depth grid D, rings as toggleRings gives them, box
 * b, arguments a, `inside` the face's or the track's paint), in the order the code drew them: the bevel, the twist,
 * the bark's knots, the bloom's flowers and buds, the sign's gaps and clips, the crystal's facets, the gilded plates,
 * the bottom trims, then the torn bites. Returns late(T, keepOff): the marks drawn after the tick, dot or knob (raster
 * T): the card's edge and fold and the `marks` stamps, never on keepOff pixels' ink.
 */
function toggleMarks(R, D, rings, b, a, inside) {
  const C = boxCorners(b), local = (c, u, v) => [C[c][0] + C[c][2] * u, C[c][1] + C[c][3] * v];
  const nR = rings.length;
  const lastBand = rings.reduce((m, r, i) => (r.line !== undefined ? i + 1 : m), 0);   // the depth of the band's inner line
  const isBand = (px2, py2) => { const d = D.at(px2, py2); return d >= 1 && d <= nR && rings[d - 1].line !== undefined; };
  const isFace = (px2, py2) => D.at(px2, py2) > lastBand && !(rings[D.at(px2, py2) - 1]?.paint === a.ink);
  const free = (px2, py2) => D.at(px2, py2) >= 2 && R.paintAt(px2, py2) !== a.ink;
  const M = toggleMarkPaints(a), light = M.light, dark = M.dark;
  const box = a.kind === 'switch' ? null : { x: b.x + 5, y: b.y + 5, w: b.w - 10, h: b.h - 10 };   // the middle the crystal marks keep clear (the tick, the dot)
  const inMiddle = (px2, py2) => !!box && px2 >= box.x && px2 < box.x + box.w && py2 >= box.y && py2 < box.y + box.h;
  // first step along a corner's diagonal (from the corner pixel) past the band onto the face, as moreSkinMarks' firstInside
  const diag = (c, du = 1, dv = 1, u0 = 0, v0 = 0) => {
    let passed = false;
    for (let i = 0; i < Math.max(b.w, b.h); i++) { const [px2, py2] = local(c, u0 + du * i, v0 + dv * i); if (isBand(px2, py2)) passed = true; else if (passed && isFace(px2, py2)) return i; }
    return 2;
  };
  // the bevel (moreSkinMarks crystal; engine/ui-skins.js rings for candy and gilded)
  if (a.bevel === 'outer' || a.bevel === 'skin' || a.bevel === 'frosted') for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) {
    const px2 = D.x + i, py2 = D.y + j, d = D.at(px2, py2), r = rings[d - 1];
    if (!d || !r || r.line === undefined || (a.bevel === 'outer' && r.line !== 0)) continue;
    const lowLeft = D.at(px2 - 1, py2 + 1) < d, topSide = D.at(px2, py2 - 1) < d, topRight = topSide || D.at(px2 + 1, py2) < d;
    if (a.bevel === 'frosted' && topSide) R.set(px2, py2, light);
    else if (lowLeft) R.set(px2, py2, dark);
    else if (topRight && r.line === 0) R.set(px2, py2, light);
  }
  // the candy stripes (candyMarks striped): every third diagonal of the band
  if (M.diagonal) for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) { const px2 = D.x + i, py2 = D.y + j; if (((px2 + py2) % 3 + 3) % 3 === 0 && isBand(px2, py2)) R.set(px2, py2, M.diagonal); }
  // the frosted icing's drips (engine/ui-candy.js candyMarks frosted): from under the top band, over the ink line, onto the face
  if (a.bevel === 'frosted') {
    const drips = [[4, 2], [5, 3], [7, 1]];
    for (const [cx, sx] of [[b.x, 1], [b.x + b.w - 1, -1]]) drips.forEach(([u, len], i) => {
      const px2 = cx + sx * u, n = sx > 0 ? len : drips[(i + 1) % drips.length][1];
      let py2 = b.y; while (py2 < b.y + b.h && !isBand(px2, py2)) py2++;
      while (py2 < b.y + b.h && isBand(px2, py2)) py2++;
      for (let k2 = 0; k2 < n && py2 + k2 < b.y + b.h; k2++) if (D.at(px2, py2 + k2) > 0 && !isBand(px2, py2 + k2)) R.set(px2, py2 + k2, light);
    });
  }
  // the gloss (engine/ui-skins.js rings, candy jelly): the face's first ring where it faces up
  if (M.gloss) for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) {
    const px2 = D.x + i, py2 = D.y + j, d = D.at(px2, py2);
    if (d === nR + 1 && D.at(px2, py2 - 1) < d) R.set(px2, py2, M.gloss);
  }
  // the track's end (the paper set's switchGap): from the knob's middle column to the end, on an on switch
  if (!isClear(a.trackEnd) && a.kind === 'switch' && a.checked) {
    const kh = b.h - 4, from = Math.ceil(b.x + b.w - 2 - kh + kh / 2);
    for (let j = 0; j < D.h; j++) for (let i = 0; i < D.w; i++) { const px2 = D.x + i, py2 = D.y + j; if (px2 >= from && D.at(px2, py2) > nR) R.set(px2, py2, a.trackEnd); }
  }
  // the twist (groveMarks): across the band of each corner quarter, a stripe every 2 px, running twistIn px on over the face
  if (M.twist) {
    const hw = b.w >> 1, hh = b.h >> 1, tin = clampI(a.twistIn, 0, 2);
    for (let c = 0; c < 4; c++) for (let v = 0; v < hh; v++) for (let u = 0; u < hw; u++) {
      const [px2, py2] = local(c, u, v);
      if (!isBand(px2, py2)) continue;
      let du = 0; while (du < u && isBand(...local(c, u - du - 1, v))) du++;
      let dv = 0; while (dv < v && isBand(...local(c, u, v - dv - 1))) dv++;
      if ((dv <= du ? u : v) % 2 !== 0) continue;
      R.set(px2, py2, M.twist);
      const step = (n) => (dv <= du ? local(c, u, v + n) : local(c, u + n, v));
      if (tin && !isBand(...step(1))) for (let n = 1; n <= tin; n++) { const [qx, qy] = step(n); if (!isFace(qx, qy)) break; R.set(qx, qy, M.twist); }
    }
  }
  // the bark's knots (moreSkinMarks bark): 2 x 2, one past the first pixel of the face on each corner's diagonal
  if (M.knot) for (let c = 0; c < 4; c++) { const m = diag(c) + 1; for (const [u, v] of [[m, m], [m + 1, m], [m, m + 1], [m + 1, m + 1]]) { const q = local(c, u, v); if (free(...q)) R.set(...q, M.knot); } }
  // the bloom (groveMarks): a flower in each top corner, a bud on the band in each bottom corner
  if (M.flower) {
    const rim = toneOf(M.flower, 'dark'), heart = GOLD_PAINT;
    for (const c of [2, 3]) { const m = diag(c) + 1; const q2 = local(c, m, 2), q1 = local(c, m, 1); if (free(...q2)) R.set(...q2, M.flower); if (free(...q1)) R.set(...q1, rim); }
    for (const c of [0, 1]) {
      const i0 = diag(c) + 1;
      const cells = [[0, 0, heart], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([u, v, p]) => [...local(c, i0 + u, i0 + v), p ?? M.flower]);
      if (!cells.every(([px2, py2]) => free(px2, py2))) continue;
      const own = new Set(cells.map(([px2, py2]) => `${px2},${py2}`));
      for (const [px2, py2] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k2 = `${px2 + dx},${py2 + dy}`; if (!own.has(k2) && free(px2 + dx, py2 + dy)) R.set(px2 + dx, py2 + dy, rim); }
      for (const [px2, py2, p] of cells) R.set(px2, py2, p);
    }
  }
  // the sign's gaps (moreSkinMarks sign): the band's pixels on each corner's diagonal and one beside, a clip just inside
  if (M.gap) for (let c = 0; c < 4; c++) {
    for (let i = 0; i <= Math.max(b.w, b.h); i++) for (const [u, v] of [[i, i], [i + 1, i]]) { const q = local(c, u, v); if (isBand(...q) && free(...q)) R.set(...q, M.gap); }
    let m = 0, passed = false;
    while (m < Math.min(b.w, b.h) >> 1) { const q = local(c, m, m); if (isBand(...q)) passed = true; else if (passed && isFace(...q)) break; m++; }
    for (const [u, v] of [[m, m], [m + 1, m], [m, m + 1], [m + 1, m + 1]]) { const q = local(c, u, v); if (free(...q) && !inMiddle(...q)) R.set(...q, M.gapClip); }
  }
  // the crystal's facets (moreSkinMarks ice and shard; the control sets' ferns, engine/ui-crystal-frost.js)
  if (a.facets === 'ice') for (const c of [0, 1]) {
    const m = diag(c);
    for (const [u, len] of [[m + 1, 2], [m + 2, 3], [m + 4, 1]]) {
      const v = diag(c, 0, 1, u, 0);
      for (let i = 0; i < len; i++) { const q = local(c, u, v + i); if (free(...q) && !inMiddle(...q)) R.set(...q, i === len - 1 ? WHITE_PAINT : light); }
    }
  }
  if (a.facets === 'shard') for (const c of [2, 3]) {
    const m = diag(c);
    for (const [u, hgt] of [[m, 4], [m + 3, 3], [m + 5, 2]]) {
      let v = 0; while (v < b.h && D.at(...local(c, u, v)) < 2) v++;
      for (let i = 0; i < hgt; i++) {
        const l = local(c, u, v + i), r = local(c, u + 1, v + i);
        if (i < hgt - 1 && free(...l) && !inMiddle(...l)) R.set(...l, c === 3 ? dark : light);
        if (free(...r) && !inMiddle(...r)) R.set(...r, i === hgt - 1 ? WHITE_PAINT : c === 3 ? light : dark);
      }
    }
  }
  if (a.facets === 'rime') {
    // a 3 px stem starting `back` px out on the band along each corner's diagonal, one branch at its 2nd and 3rd pixels on
    // alternate sides, its tip the accent; on a switch only at the two corners away from the knob, on its track
    const back = a.kind === 'radio' ? 2 : 1;
    const which = a.kind === 'switch' ? (a.checked ? [0, 3] : [1, 2]) : [0, 1, 2, 3];
    const can = (px2, py2) => { const p = R.paintAt(px2, py2); return p !== undefined && p !== a.ink && (isFace(px2, py2) || isBand(px2, py2)); };
    for (const c of which) {
      let k2 = -1; for (let i = 0; i < Math.min(b.w, b.h); i++) if (isFace(...local(c, i, i))) { k2 = i; break; }
      if (k2 < back) continue;
      const s = k2 - back, put = (u, v, p) => { const q = local(c, s + u, s + v); if (can(...q)) R.set(...q, p); };
      for (let i = 0; i < 3; i++) put(i, i, light);
      put(3, 3, a.accent);
      for (let i = 1; i <= 2; i++) { if (i % 2) put(i + 1, i - 1, light); else put(i - 1, i + 1, light); }
    }
  }
  // the gilded plates (gildedCorners without gems): the outer row and column bevelled, gold, lit, dark, ink and chips
  const cleared = [];
  if (a.plate && a.plate !== 'none' && GILDED_PLATES[a.plate]) {
    const rows = GILDED_PLATES[a.plate], size = clampI(a.plateSize, 1, 6);
    for (let c = 0; c < 4; c++) {
      const [, , sx, sy] = C[c];
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        let ch = rows[j][i];
        if (ch === '.') continue;
        const [px2, py2] = local(c, i + 1, j + 1);
        if (D.at(px2, py2) < 2) continue;
        if (ch === 'g') ch = i === 2 && j === 2 ? PLATE_MARK[a.plate] : PLATE_BASE[a.plate];
        if (ch === 'x') {
          R.set(px2, py2, a.ink);
          for (const [ox, oy] of [[px2 - sx, py2], [px2, py2 - sy], [px2 - sx, py2 - sy]]) {
            if (D.at(ox, oy) !== 1) continue;
            if (!D.at(ox - sx, oy) || !D.at(ox, oy - sy)) cleared.push([ox, oy]);
          }
          continue;
        }
        const p = ch === 'T' ? (sy > 0 ? light : dark) : ch === 'S' ? (sx > 0 ? dark : light) : ch === 'G' ? a.frame : ch === 'L' ? light : ch === 'D' ? dark : a.ink;
        R.set(px2, py2, p);
      }
    }
  }
  // the torn bites (tearEdges): 2 px in from the side at each bite, every pixel of the piece next to one inked
  if (a.bites) {
    const n = b.w;
    const bites = a.kind === 'switch' ? [['top', Math.round(n * 8 / 28)], ['top', Math.round(n * 15 / 28)], ['bottom', Math.round(n * 11 / 28)], ['bottom', Math.round(n * 18 / 28)]]
      : a.kind === 'check' ? ['top', 'right', 'bottom', 'left'].flatMap((side, k2) => [[side, 5 + (k2 % 2)], [side, n - 8 + (k2 % 2)]]) : [];
    for (const [side, at] of bites) for (let k2 = 0; k2 < 2; k2++) {
      const across = side === 'top' || side === 'bottom', len = across ? b.h : b.w;
      for (let s = 0, taken = 0; s < len && taken < 2; s++) {
        const px2 = across ? b.x + at + k2 : side === 'left' ? b.x + s : b.x + b.w - 1 - s;
        const py2 = across ? (side === 'top' ? b.y + s : b.y + b.h - 1 - s) : b.y + at + k2;
        if (!D.at(px2, py2)) { if (taken) break; continue; }
        cleared.push([px2, py2]); taken++;
      }
    }
  }
  const gone = new Set(cleared.map(([px2, py2]) => `${px2},${py2}`));
  const clear = (px2, py2) => { if (px2 >= D.x && py2 >= D.y && px2 < D.x + D.w && py2 < D.y + D.h) D.d[(py2 - D.y) * D.w + (px2 - D.x)] = 0; R.del(px2, py2); };
  for (const [px2, py2] of cleared) clear(px2, py2);
  if (a.bites) for (const k2 of gone) { const [px2, py2] = cellXY(k2); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (D.at(px2 + dx, py2 + dy) > 0 && !gone.has(`${px2 + dx},${py2 + dy}`)) R.set(px2 + dx, py2 + dy, a.ink); }

  return (T, keepOff = new Set()) => {
    const top = (px2, py2) => { const p = T.paintAt(px2, py2); return p !== undefined ? p : R.paintAt(px2, py2); };
    const drawn = (px2, py2) => D.at(px2, py2) > 0 || T.has(px2, py2);
    // the card (paperMarks card): the face's bottom two rows above the ink in its dark tone, then the fold over it
    const F = clampI(a.card, 0, 6);
    if (F > 0) {
      for (let px2 = b.x; px2 < b.x + b.w; px2++) for (const py2 of [b.y + b.h - 3, b.y + b.h - 2]) if (drawn(px2, py2) && top(px2, py2) === a.face) T.set(px2, py2, shadeOf(a.face, -1));
      const Fd = Math.max(2, F), cx = b.x + b.w - 1;
      for (let v = 0; v <= Fd; v++) for (let u = 0; u <= Fd; u++) {
        const px2 = cx - u, py2 = b.y + v;
        if (!drawn(px2, py2)) continue;
        if (u + v < Fd) { clear(px2, py2); T.del(px2, py2); } else if (u + v === Fd || u === Fd || v === Fd) T.set(px2, py2, a.ink); else T.set(px2, py2, shadeOf(a.face, -0.5));
      }
    }
    // the ruin's cracks, last over everything inside the slab (the code drew them after the tick and the knob)
    if (a.cracks) {
      const C2 = a.kind === 'switch' ? RUIN_CRACKS.switch : a.kind === 'check' ? RUIN_CRACKS.box : null;
      if (C2) { for (const [u, v] of C2.ink) if (drawn(b.x + u, b.y + v)) T.set(b.x + u, b.y + v, a.ink); for (const [u, v] of C2.lip) if (drawn(b.x + u, b.y + v)) T.set(b.x + u, b.y + v, shadeOf(a.face, 0.45)); }
    }
  };
}

/**
 * ui.toggle@2: a skinned check box, radio option or switch as the code drew them: the box's rings with a tick of two
 * 2 px strokes of the accent inked round (P(0.27, 0.5) to P(0.43, 0.68) to P(0.73, 0.3) of the box); the option's
 * rings with a dot a fifth of its size across, a light pixel up and right and ink round it; the switch a pill (cut
 * corners with edge cut) of ink, a band of the frame and the track (the accent on, the face's dark tone off), its knob
 * 2 px smaller than the track inside it, inked round, at the end it is set to. The skin's ornaments as version 1.
 */
export const uiToggle2 = defineGenerator({
  id: 'ui.toggle', v: 2, family: 'ui',
  about: 'A skinned check box, radio option or on/off switch, on or off, as the code drew them: its tick, dot and banded switch, with the code sets\' band marks.',
  args: {
    ...uiToggle.args,
    knobLight: flag({ default: false, about: 'A light pixel on a switch\'s knob, up and right (candy, gilded)' }),
    ...TOGGLE_MARK_ARGS,
  },
  // version 1's bound, and the tick or dot with its ink, the knob and its ring as rects; with any band mark, a rect a pixel
  cost: (a) => { const s = clampI(a.size, 8, 40); return 24 + 2 * (SKIN_RINGS + 4) * areaCount(s) + OVERRIDES_PER_ROW * (s + 2) + ornamentCostOf(a, s, s) + 6 * (s + 4) + 8 + (toggleMarked(a) ? 3 * (s + 4) + 16 : 0); },
  run(a) {
    const b = toggleBox(a);
    const R = raster();
    const k = clampI(a.corner, 0, 4);
    if (a.kind === 'switch') {
      const cut = a.edge === 'cut';
      const rows = cut ? cutRows(b.x, b.y, b.w, b.h, 3) : rowsOfTest(b.x, b.y, b.w, b.h, (px2, py2) => {
        const r = b.h / 2, cy = b.y + r;
        if (px2 < b.x + r) return (px2 - (b.x + r)) ** 2 + (py2 - cy) ** 2 <= r * r;
        if (px2 > b.x + b.w - r) return (px2 - (b.x + b.w - r)) ** 2 + (py2 - cy) ** 2 <= r * r;
        return true;
      });
      const D = depthGrid(rows, b);
      const track = a.checked ? a.accent : isClear(a.trackOff) ? toneOf(a.face, 'dark') : a.trackOff;
      // a tube (a core given): a band of `border` lines, its second the core, and `inner` inside it, over the track
      const M = toggleMarkPaints(a), tube = !!(M.core || M.inner);
      const rings = tube ? toggleRings({ ...a, rings: ['ink', a.frame], bandAt: 1, border: M.core ? a.border : 1 }, { onSwitch: true }) : [{ paint: a.ink, band: false }, { paint: a.frame, band: true, line: 0 }];
      paintSlab(R, D, rings, a.frame, { ...a, lit: false }, () => track);
      const late = toggleMarks(R, D, rings, b, a, track);
      const kh = b.h - 4, kx = a.checked ? b.x + b.w - 2 - kh : b.x + 2, ky = b.y + 2;
      const r = kh / 2 - 1, cx = kx + kh / 2, cy = ky + kh / 2;
      const knobIn = cut ? (px2, py2) => { const ix = Math.floor(px2 - kx - 1), iy = Math.floor(py2 - ky - 1), n = kh - 2; return ix >= 0 && iy >= 0 && ix < n && iy < n && ix + iy >= 2 && n - 1 - ix + iy >= 2 && 2 * (n - 1) - ix - iy >= 2 && ix + n - 1 - iy >= 2; }
        : (px2, py2) => (px2 - cx) ** 2 + (py2 - cy) ** 2 <= r * r;
      const knob = new Set();
      for (let py2 = ky; py2 < ky + kh; py2++) for (let px2 = kx; px2 < kx + kh; px2++) if (knobIn(px2 + 0.5, py2 + 0.5)) knob.add(`${px2},${py2}`);
      const ring = inkRound(knob);
      const keepOff = new Set([...knob, ...ring]);
      const inside = (px2, py2) => D.at(px2, py2) > 0 && !keepOff.has(`${px2},${py2}`);
      const orn = ornaments(a, b, inside);
      const K = raster();
      for (const c of ring) K.set(...cellXY(c), a.ink);
      for (const c of knob) K.set(...cellXY(c), a.knob);
      if (a.knobLight) K.set(kx + kh - 4, ky + 3, toneOf(a.knob, 'light'));
      late(K, keepOff);
      return [...R.prims([{ D, bases: basesOf(rings, a.frame, track) }]), ...orn, ...K.prims()];
    }
    const rows = a.kind === 'radio' ? discRows(b.x, b.y, b.w) : edgeRows(a.edge, b.x, b.y, b.w, b.h, k);
    const D = depthGrid(rows, b);
    const rings = toggleRings(a);
    paintSlab(R, D, rings, a.frame, a, () => a.face);
    const late = toggleMarks(R, D, rings, b, a, a.face);
    const inside = (px2, py2) => D.at(px2, py2) > 0;
    const M = raster();
    if (a.checked && a.kind === 'check') {
      const P = (u, v) => [b.x + Math.round(u * b.w), b.y + Math.round(v * b.w)];
      const segs = [[P(0.27, 0.5), P(0.43, 0.68)], [P(0.43, 0.68), P(0.73, 0.3)]];
      const tick = new Set();
      for (const [[x0, y0], [x1, y1]] of segs) {
        const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
        for (let py2 = Math.min(y0, y1) - 2; py2 <= Math.max(y0, y1) + 2; py2++) for (let px2 = Math.min(x0, x1) - 2; px2 <= Math.max(x0, x1) + 2; px2++) {
          const cx = px2 + 0.5, cy = py2 + 0.5;
          let t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = cx - (x0 + dx * t), ey = cy - (y0 + dy * t);
          if (ex * ex + ey * ey <= 1) tick.add(`${px2},${py2}`);
        }
      }
      for (const c of inkRound(tick)) M.set(...cellXY(c), a.ink);
      for (const c of tick) M.set(...cellXY(c), a.accent);
    } else if (a.checked && a.kind === 'radio') {
      const rr = Math.max(2.5, b.w * 0.2), mx = b.x + b.w / 2, my = b.y + b.w / 2;
      const dot = new Set();
      for (let py2 = Math.floor(my - rr) - 1; py2 <= my + rr; py2++) for (let px2 = Math.floor(mx - rr) - 1; px2 <= mx + rr; px2++) {
        if ((px2 + 0.5 - mx) ** 2 + (py2 + 0.5 - my) ** 2 <= rr * rr) dot.add(`${px2},${py2}`);
      }
      for (const c of inkRound(dot)) M.set(...cellXY(c), a.ink);
      for (const c of dot) M.set(...cellXY(c), a.accent);
      M.set(Math.floor(mx + rr / 2), Math.floor(my - rr / 2), toneOf(a.accent, 'light'));
    }
    late(M, new Set());
    return [...R.prims([{ D, bases: basesOf(rings, a.frame, a.face) }]), ...ornaments(a, b, inside), ...M.prims()];
  },
});

/** Most stamps a pointer's art may hold. */
const POINTER_ART = 8;

/**
 * ui.pointer@2: a pointer pointing right that nudges up to `reach` px toward what it points at once a loop (as version
 * 1), drawn from its own pixel art when given one (`art`: stamps, `at` from its tail end on its centre row; the code
 * sets' drop, shard, leaf, chevron, nib and arrow), else as version 1. Its measure gives its tip, `tip` px from `at`
 * moved by the nudge, as the attach point `tip` (the code's socket: the middle of its row, angle a quarter turn: right).
 */
export const uiPointer2 = defineGenerator({
  id: 'ui.pointer', v: 2, family: 'ui',
  about: 'A skinned pointer that nudges toward what it points at once a loop, drawn from its own pixel art when given one; its tip is an attach point.',
  args: {
    ...uiPointer.args,
    art: primitives({ default: [], about: `The pointer as pixel stamps pointing right (at most ${POINTER_ART}; other primitives are not drawn), \`at\` from its tail end on its centre row; none: version 1` }),
    tip: point({ lo: -40, hi: 40, default: [19, 0], about: 'Its hot spot from `at` before the nudge: the attach point `tip` (the code sets: 19 px along, on the centre row)' }),
    // review M8b round 2: the neon pointer's core goes dark on one frame in eight, as the code's moreSkinPointer drew it
    blink: paint({ default: 'clear', about: 'On the last frame of every eight, the art\'s pixels in the accent take this paint (the neon core going dark; clear: none)' }),
  },
  keyable: [],
  cost: (a) => 24 + 4 * areaCount(16) + OVERRIDES_PER_ROW * 18 + ornamentCost(clampI(a.len, 8, 28), 16, a.every) + POINTER_ART,
  run(a, ctx) {
    // review M8b rounds 1 and 2 (issues 8 and 5): art past the 8th stamp is an error, never dropped unseen; a stamp's own
    // shape is checked with the arguments (rows, at, key); any other primitive among them is not drawn, as the art's
    // description says (the generator contract has every primitive list run, so it cannot be an error)
    const given = Array.isArray(a.art) ? a.art : [];
    if (given.length > POINTER_ART) throw new Error(`art: at most ${POINTER_ART} stamps (it has ${given.length})`);
    const art = stampsOf(given, POINTER_ART);
    if (!art.length) return uiPointer.run(a, ctx);
    const t = fin(ctx?.t) ? ctx.t : 0;
    const x = Math.floor(a.at[0]) + nudge(t, clampI(a.reach, 0, 3)), y = Math.floor(a.at[1]);
    // blink: the code's frame number, floor(t x 8) of the loop; on the 8th the accent's letters take the blink paint
    const dark = !isClear(a.blink) && Math.floor((((t % 1) + 1) % 1) * 8 + 1e-9) % 8 === 7;
    const same = (p) => JSON.stringify(p) === JSON.stringify(a.accent);
    return art.map((s) => ({ kind: 'stamp', at: [x + Math.round(s.at[0]), y + Math.round(s.at[1])], anchor: 'tl', rows: padded(rowsOf(s)), key: Object.fromEntries(Object.entries(s.key).map(([k, p]) => [k, dark && same(p) ? a.blink : p])) }));
  },
});

/** ui.pointer@2's measure: no slice or text area; its tip as the attach point `tip` at this frame's nudge. */
function measurePointer2(a, ctx = {}) {
  const t = fin(ctx.t) ? ctx.t : 0, tip = Array.isArray(a.tip) ? a.tip : [19, 0];
  const at = Array.isArray(a.at) ? a.at : [0, 0];
  const x = Math.floor(fin(at[0]) ? at[0] : 0) + nudge(t, clampI(a.reach, 0, 3)) + Math.round(fin(tip[0]) ? tip[0] : 0);
  const y = Math.floor(fin(at[1]) ? at[1] : 0) + Math.round(fin(tip[1]) ? tip[1] : 0) + 0.5;
  return { points: { tip: { x, y, angle: Math.PI / 2 } } };
}

/** The step patterns of the code sets' selectors over a loop of 8: [step in, arm longer by, buds] per frame, or 'both' (the between pose). */
const SELECTOR_STEPS = Object.freeze({
  between: ['both', 0, 0, 0, 'both', 1, 1, 1],                         // candy: through a between pose that holds both
  eased: ['both', 0, 0, 1, 1, 1, 1, 0],                                  // the code's pulse (out 3, in 4, out 1), its first frame between (review M8b round 2)
  held: [0, 0, 1, 1, 1, 1, 0, 0],                                        // gilded: two frames out, four in, two out
  grow: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 1, 2], [1, 0, 2], [0, 0, 2], [0, 0, 1]],   // grove: creeping in, a bud opening
});
/** Most stamps a selector's bends may hold: four corners, out and stepped in. */
const SELECTOR_BENDS = 8;
/** The frames of the held pattern whose gem catches the light. */
const HELD_GLINT = Object.freeze([0, 1, 0, 0, 1, 0, 0, 1]);

/**
 * ui.selector@2: four skinned corner brackets round a slot (its box `at`, `size`), as the code's skinSelector drew them:
 * each an L whose arms are `len` px long and `thick` lines thick, 1 px in from the box and stepping 1 px further in
 * once a loop, inked round; `lit` gives the two pixels at the bend of its outer line the band's light tone, `core` its
 * second line (a neon tube's light core), extras a gem of the accent at the bend. `steps`: pulse (out half the loop,
 * in half), between (through a pose that holds both), held (two frames out, four in, two out; the gem catching the
 * light) or grow (creeping in 2 px while the arms grow 1 px and a bud of the accent opens at their ends).
 */
export const uiSelector2 = defineGenerator({
  id: 'ui.selector', v: 2, family: 'ui',
  about: 'Four skinned corner brackets round a slot that step in and back out once a loop, as the code drew them: lit at the bend, a core line, four step patterns.',
  args: {
    ...uiSelector.args,
    steps: word(['pulse', 'between', 'held', 'grow', 'eased'], { default: 'pulse', about: 'How it steps over a loop: pulse, between (a pose holding both), held (gilded), grow (arms creep in, buds open), eased (the code\'s pulse: out 3 frames, in 4, out 1, its first frame the pose between)' }),
    core: paint({ default: 'clear', about: 'The second line of each arm: a neon tube\'s light core (clear: the band)' }),
    // review M8b round 1: the code sets' styles reach the selector (neon double and sign, grove vine, bark and bloom, crystal)
    marks: word(['none', 'double', 'sign', 'vine', 'bark', 'bloom', 'rime', 'shard'], { default: 'none', about: 'A style\'s marks: double (a second tube), sign (broken at the bend), vine (twisted), bark (a knot), bloom (flower, buds), rime (frost tip), shard (glint)' }),
    // review M8b round 2: the crystal bevel (light face, the colour, dark side, a glint), written as data per corner
    bends: primitives({ default: [], about: `Stamps recolouring the bracket at each bend (TL, TR, BR, BL; at most ${SELECTOR_BENDS}, the last four stepped in; stamps only), \`at\` from the bend, not mirrored` }),
  },
  cost: (a) => { const [, h] = sizeOf(a); const marked = !!a.marks && a.marks !== 'none';
    return 16 + 16 * (h + 2) + (marked ? 16 * (clampI(a.len, 3, 12) + 4) : 0); },
  run(a, ctx) {
    const t = fin(ctx?.t) ? ctx.t : 0;
    const box = boxOf(a), len = clampI(a.len, 3, 12), thick = clampI(a.thick, 1, 3);
    const given = Array.isArray(a.bends) ? a.bends : [];
    if (given.length > SELECTOR_BENDS) throw new Error(`bends: at most ${SELECTOR_BENDS} stamps (it has ${given.length})`);
    const bends = stampsOf(given, SELECTOR_BENDS).map((s) => ({ rows: padded(rowsOf(s)), dx: Math.round(s.at[0]), dy: Math.round(s.at[1]), key: s.key }));
    const i8 = a.steps === 'held' ? Math.round(t * 8) % 8 : Math.floor(fract(t) * 8 + 1e-6) % 8;
    const pose = a.steps === 'between' || a.steps === 'eased' ? SELECTOR_STEPS[a.steps][i8] : a.steps === 'held' ? SELECTOR_STEPS.held[i8] : a.steps === 'grow' ? SELECTOR_STEPS.grow[i8] : pulse(t) >= 0.5 ? 1 : 0;
    const accent = a.steps === 'held' && HELD_GLINT[i8] ? toneOf(a.accent, 'light') : a.accent;
    // one pose's cells: "x,y" -> paint
    const cells = (step, grow = 0, buds = 0) => {
      const out = new Map();
      const corners = [[box.x, box.y, 1, 1], [box.x + box.w - 1, box.y, -1, 1], [box.x + box.w - 1, box.y + box.h - 1, -1, -1], [box.x, box.y + box.h - 1, 1, -1]];
      corners.forEach(([cx, cy, sx, sy], ci) => {
        const ox = cx + sx * (1 + step), oy = cy + sy * (1 + step), arm = len + grow;
        for (let i = 0; i < arm; i++) for (let j = 0; j < thick; j++) {
          const p = j === 1 && !isClear(a.core) ? a.core : a.lit && j === 0 && i < 2 ? toneOf(a.frame, 'light') : a.frame;
          out.set(`${ox + sx * i},${oy + sy * j}`, p);
          out.set(`${ox + sx * j},${oy + sy * i}`, p);
        }
        // review M8b round 1: a style's marks, in the code's tones of the piece's own paints
        const mk = a.marks ?? 'none';
        const inner = mk === 'double' ? a.accent : null, stripes = mk === 'vine' || mk === 'bloom' ? shadeOf(a.frame, -1) : null, gap = mk === 'sign' ? shadeOf(a.face, -1) : null;
        if (inner) for (let i = 0; i < arm; i++) for (const k of [`${ox + sx * i},${oy + sy * thick}`, `${ox + sx * thick},${oy + sy * i}`]) if (!out.has(k)) out.set(k, inner);
        // the twist stays on its columns as the bracket steps in (review M8b round 2: the code's stripes did not move): a
        // pixel's place along the L is the larger of its two distances from the bend, so the bend square is striped by rings
        if (stripes) for (let i = 1 - (step % 2); i < arm; i += 2) for (let j = 0; j < thick && j <= i; j++) { out.set(`${ox + sx * i},${oy + sy * j}`, stripes); out.set(`${ox + sx * j},${oy + sy * i}`, stripes); }
        if (gap) for (const k of [...out.keys()]) { const [px2, py2] = cellXY(k), u = (px2 - ox) * sx, v = (py2 - oy) * sy; if (u >= 0 && v >= 0 && Math.abs(u - v) <= 1) out.set(k, gap); }
        for (let j = 0; j < buds; j++) { out.set(`${ox + sx * arm},${oy + sy * j}`, a.accent); out.set(`${ox + sx * j},${oy + sy * arm}`, a.accent); }
        if (a.extras) out.set(`${ox},${oy}`, accent);
        if (mk === 'bloom') {
          const rim = toneOf(a.accent, 'dark');
          if (sy > 0) {
            for (const [u, v] of [[0, 0], [2, 0], [0, 2], [3, 1], [1, 3]]) { const k = `${ox + sx * u},${oy + sy * v}`; if (out.has(k)) out.set(k, rim); }
            for (const [u, v, p] of [[1, 1, GOLD_PAINT], [0, 1], [2, 1], [1, 0], [1, 2]]) out.set(`${ox + sx * u},${oy + sy * v}`, p ?? a.accent);
          } else { out.set(`${ox + sx * 3},${oy}`, rim); out.set(`${ox + sx * 3},${oy + sy}`, a.accent); }
        }
        // the knot one in from the bend: bark's dark knot, rime's frost tip (the accent), shard's glint on the bottom brackets
        const knot = mk === 'bark' ? shadeOf(a.frame, -1) : mk === 'rime' ? a.accent : mk === 'shard' && sy < 0 ? shadeOf(a.frame, 0.85) : null;
        if (knot && out.has(`${ox + sx},${oy + sy}`)) out.set(`${ox + sx},${oy + sy}`, knot);
        // the bend stamps: this corner's (the stepped-in pose's when there are eight), on the bracket's own pixels only
        const bend = bends[(step >= 1 && bends.length > 4 ? 4 : 0) + ci];
        // (walking the bracket's pixels, this corner's quarter, not the stamp's: a huge stamp costs no more)
        if (bend) for (const k of [...out.keys()]) {
          const [px2, py2] = cellXY(k), u = (px2 - ox) * sx, v = (py2 - oy) * sy;
          if (u < 0 || v < 0 || u > arm + 1 || v > arm + 1) continue;
          const ch = bend.rows[py2 - oy - bend.dy]?.[px2 - ox - bend.dx];
          if (ch && ch !== '.' && Object.hasOwn(bend.key, ch)) out.set(k, bend.key[ch]);
        }
      });
      return out;
    };
    const R = raster();
    const layer = (m) => { const ink = inkRound(new Set(m.keys())); return { m, ink }; };
    const poses = pose === 'both' ? [layer(cells(1)), layer(cells(0))] : Array.isArray(pose) ? [layer(cells(pose[0], pose[1], pose[2]))] : [layer(cells(pose))];
    // as the code's unionInked: the first pose's colour wins, then the next's, and ink only where no pose has colour
    for (const { ink } of poses) for (const k of ink) R.set(...cellXY(k), a.ink);
    for (const { m } of [...poses].reverse()) for (const [k, p] of m) R.set(...cellXY(k), p);
    return R.prims();
  },
});

/**
 * ui.strip.lit@1: ui.strip@1 with the code's barFill shine (sprites/ui-bars-rpg.js): over its top row (gloss: the fill's
 * light tone), a run of `glintLen` pixels from its `glintAt`th column in `glintPaint`, flashing toward the shine with the
 * rest of the strip and skipping the compartment lines. A generator of its own rather than ui.strip@2, so the other skin
 * families' bars keep naming the newest ui.strip. With no glint paint it draws exactly as ui.strip@1.
 */
export const uiStripLit = defineGenerator({
  id: 'ui.strip.lit', v: 1, family: 'ui',
  about: 'A bar\'s fill strip as ui.strip, with a short glint at the start of its top row, as the code\'s barFill drew it.',
  args: {
    ...uiStrip.args,
    glintAt: count(0, 16, { default: 2, about: 'The column of the top row its glint starts at, from the strip\'s start' }),
    glintLen: count(0, 8, { default: 3, about: 'How many pixels long its glint is' }),
    glintPaint: paint({ default: 'clear', about: 'The glint\'s paint (clear: none, as ui.strip@1)' }),
  },
  // ui.strip@1's bound, and the glint's row
  cost: (a) => { const [w, h0] = sizeOf(a), h = Math.min(h0, TROUGH_MAX); return 8 + (2 * 16 + 8) * (h + 1) + 2 * (Math.ceil(w / 32) + 1) * (Math.ceil(h / 32) + 1) + clampI(a.glintLen, 0, 8); },
  run(a, ctx) {
    const base = uiStrip.run(a, ctx);
    if (isClear(a.glintPaint) || !(a.glintLen > 0)) return base;
    const T = troughGeom({ ...a, role: 'housing', edge: 'round', corner: 0 });
    const { o } = T;
    const n = Math.round(o.w * clamp01(a.value));
    if (n <= 0 || o.h <= 0) return base;
    const t = fin(ctx?.t) ? ctx.t : 0;
    const amount = clamp01(a.flash) * (a.fade ? (ctx?.loop ? 0.5 + 0.5 * Math.cos(2 * Math.PI * t) : 1 - clamp01(t)) : 1);
    const p = amount > 0 ? mixOf(a.glintPaint, a.shine, amount) : a.glintPaint;
    const R = raster();
    for (let i = clampI(a.glintAt, 0, 16); i < Math.min(n, clampI(a.glintAt, 0, 16) + clampI(a.glintLen, 0, 8)); i++) if (!(T.pitch && (i + 1) % T.pitch === 0)) R.set(o.x + i, o.y, p);
    return [...base, ...R.prims()];
  },
});
