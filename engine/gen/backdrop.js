// Backdrop generators and the `layers` layout (docs/data-sprites.md 2.4, 3.3 "backdrop", "place", "colour", 4.3; build
// item B14). A background is data: `body.layers` is a stack of layers, back to front, each one a clip, each a list of
// these named generators. They are the ports of engine/backdrop.js, engine/space.js and engine/scenery.js, each
// RETURNING PRIMITIVES instead of drawing:
//
//   outlines that repeat across the layer's width     ridge, swell (a planet's limb), the mist at a ridge's foot (mist.band)
//   fills under or between an outline                 fill.below, fill.between; ridge and swell fill under themselves
//   things that stand on an outline                   treeline (clumps of round or pointed trees)
//   things placed across the width, wrapping          scatter (any primitive, piece or generator), cloud, disc, canopy,
//                                                     nebula, stars
//   the sky                                           sky.bands (flat bands, lightest at the horizon)
//   colour rules (family "colour")                    sky.look, space.look, haze (recede into the air), lit.tone, clear.of
//
//   { "gen": "ridge", "v": 1, "id": "hill", "base": 150, "seed": 7, "peaks": 3, "paint": "back" },
//   { "gen": "treeline", "v": 1, "on": "hill", "clumps": 8, "tall": 12, "seed": 4, "paint": "leaf" }
//
// HOW A LAYER WRAPS. Every generator works in frame pixels, across ctx.size[0] (320 for the library's backdrops; any width
// up to 640: "wide frames"). Outlines are built only from waves with a whole number of cycles across that width, so they
// repeat exactly; a placed thing that hangs over the right edge comes back in on the left (as engine/backdrop.js
// wrapped() did), unless the call says wrap: false. The layout tells every generator that takes `wrap` (the registry
// entry's `wraps: true`) whether its layer wraps (`wraps` of the layer, default true), unless the call writes it.
// scatter@1 is the one placer that also serves a tile (engine/tiles.js scatter): left alone it does not wrap.
//
// `ON` AN EARLIER ITEM. In a layers body `on` names an earlier item (catalog/sprite-schema.js checks it), not a node: a
// call that takes a `ground` (treeline, fill.below, fill.between, scatter) stands on that item's outline. The layout
// replaces `on` by the item's outline as a `ground` struct ({ kind: "ridge" | "swell", ...its numbers }), so the
// generator, which sees only its arguments, rebuilds the same outline. A ground may also be written out.
//
// FILLS ARE STAIR POLYGONS. A fill paints whole columns, each from one row to another, exactly as engine/backdrop.js
// fillBetween did (rows rounded at each column's centre). The columns become polygons of whole-pixel steps (at most 64
// points each, at most 46 for a 640 px layer), so a whole ridge is a handful of primitives and a layer stays far inside the
// 4,000 a frame may hold. Every fill and shape is flat (shade 0): a background has no shading bands and no outline.
//
// COLOUR RULES of family "colour" are worked out by the layers layout (workOutColour) from the palette's slots: each
// colour a rule gives becomes a palette slot of its own (named <slot>-r<n>, n from 501) with the material of the first
// slot it reads, so the sky bands a sky.look gives are of the sky (Contract 7: a forest sky stays a sky under every
// look). engine/resolve.js works out only engine/data-rules.js COLOUR_RULES and leaves for the frame any of those that
// holds a registry colour rule anywhere inside (choose: in the branch taken), so in a layers body a backdrop colour rule
// may stand anywhere in a paint: outermost, inside mix, tone, ramp, bandTone or choose, or in a generator's paint. A
// colour resolve.js could not work out is flagged lost: true on its palette entry; the layout refuses a frame that
// paints one (engine/draw-list.js lostPaints), reading the flag, never the colour, so a palette's real #ff00ff draws.
// A frame's colour work is bounded (COLOUR_BUDGET, clear.of weighed as 60). Run as a plain generator, a colour rule
// draws a swatch.
//
// Pure: no DOM, no Node, no clock, no randomness (seeds through engine/motion.js hash). Runs unchanged in the browser
// and in Node.
import { defineGenerator, expandList as siteExpandList, generator as siteGenerator, checkCall as siteCheckCall } from './registry.js';
import { px, share, count, seed, word, flag, paint, paints, point, place, struct, primitives } from './args.js';
import { hash, clamp, lerp, fract, TAU } from '../motion.js';
import { mix, tone, brightness, col, hexToRgb, rgbToHsl, hsl } from '../color.js';
import { ellipseIn, capsuleIn } from '../surface.js';
import { PALETTES, applyColour } from '../theme.js';
import { COLOUR_RULES, FALLBACK, whenMatches } from '../data-rules.js';
import { sceneItems, paintHex } from '../resolve.js';
import { lostPaints } from '../draw-list.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const mod = (x, W) => ((x % W) + W) % W;
const gapOf = (a, b, W) => { const d = mod(a - b, W); return d > W / 2 ? d - W : d; };
const phase = (t) => (fin(t) ? t % 1 : 0);
const FLAT = { shade: 0 };

// ---- columns and stair polygons ------------------------------------------------------------------------------------

/** The most points a stair polygon gets (engine/draw-list.js polygons hold at most 64). */
const POLY_POINTS = 64;

/** An upper bound on the stair polygons columnPolys gives for a run of `cols` columns (each column adds at most 4 points). */
const polyBound = (cols) => Math.ceil(cols / Math.floor((POLY_POINTS - 4) / 4)) + 2;

/** Stair polygons for a fill across the frame's width: at most 46 for 640 columns (the cost of every fill). */
const FILL_COST = polyBound(640) + 1;

/**
 * Whole columns as flat stair polygons: column x painted from row y0[x] to y1[x] (end not included; nothing where
 * y1[x] <= y0[x]), each polygon at most 64 points, every pixel exactly the column's. Returns primitives ({ kind: 'poly',
 * points, paint, shade: 0 }). For tests and other layouts that fill columns. Arguments: y0, y1 (equal-length lists of
 * whole rows), paint.
 */
export function columnPolys(y0, y1, paintRef) {
  const W = Math.min(y0.length, y1.length);
  const T = new Array(W), B = new Array(W), full = new Array(W);
  let last = 0;
  for (let x = 0; x < W; x++) {
    const a = y0[x], b = y1[x];
    if (fin(a) && fin(b) && b > a) { T[x] = a; B[x] = b; full[x] = true; last = a; } else { T[x] = last; B[x] = last; full[x] = false; }
  }
  const out = [];
  let a = 0;
  while (a < W) {
    // greedy chunk: 4 points at the ends, 2 more for every change of the top or the bottom row
    let n = 4, b = a + 1, any = full[a];
    while (b < W) {
      const add = (T[b] !== T[b - 1] ? 2 : 0) + (B[b] !== B[b - 1] ? 2 : 0);
      if (n + add > POLY_POINTS) break;
      n += add; any = any || full[b]; b++;
    }
    if (any) {
      const pts = [[a, T[a]]];
      for (let x = a + 1; x < b; x++) if (T[x] !== T[x - 1]) pts.push([x, T[x - 1]], [x, T[x]]);
      pts.push([b, T[b - 1]], [b, B[b - 1]]);
      for (let x = b - 1; x > a; x--) if (B[x] !== B[x - 1]) pts.push([x, B[x]], [x, B[x - 1]]);
      pts.push([a, B[a]]);
      out.push({ kind: 'poly', points: pts, paint: paintRef, ...FLAT });
    }
    a = b;
  }
  return out;
}

/** The columns between two outlines across a frame [W, H], as engine/backdrop.js fillBetween rounds them: { y0, y1 }. */
function columnsBetween(top, bottom, W, H) {
  const y0 = new Array(W), y1 = new Array(W);
  for (let x = 0; x < W; x++) {
    const t = top(x + 0.5), b = bottom(x + 0.5);
    y0[x] = fin(t) ? Math.max(0, Math.round(t)) : H;
    y1[x] = fin(b) ? Math.min(H, Math.round(b)) : 0;
  }
  return { y0, y1 };
}

/** A fill between two outlines as stair polygons (engine/backdrop.js fillBetween). */
const fillBetweenPolys = (top, bottom, paintRef, W, H) => { const c = columnsBetween(top, bottom, W, H); return columnPolys(c.y0, c.y1, paintRef); };

// ---- outlines: x -> y, repeating across the layer's width -----------------------------------------------------------

const tri = (u) => 1 - 4 * Math.abs(u - Math.floor(u) - 0.5);
const sine = (u) => Math.cos(TAU * u);

/**
 * A line of hills or mountains across a layer W px wide, repeating exactly (engine/backdrop.js ridge, with the width a
 * parameter): between `base` (its lowest valley) and base - height (its highest peak), `peaks` summits. Returns x -> y.
 * Arguments: { base, height, seed, peaks, shape ('round' | 'jagged'), rough (0..1) }, W.
 */
export function ridgeOutline({ base = 140, height = 40, seed: s = 1, peaks = 4, shape = 'round', rough = 0.35 } = {}, W = 320) {
  const main = shape === 'jagged' ? tri : sine;
  const p = Math.max(1, Math.round(peaks));
  const ph = (k) => hash(s, k);
  const slow = p > 1 ? [[1, 0.42], [Math.max(1, p - 1), p > 2 ? 0.3 : 0]] : [];
  const fast = [[p * 2 + 1, 0.2], [p * 3 + 2, 0.12], [p * 5 + 1, 0.07]];
  const raw = (x) => {
    const u = mod(x, W) / W;
    let v = main(u * p + ph(1));
    for (let i = 0; i < slow.length; i++) v += slow[i][1] * (0.6 + 0.4 * ph(10 + i)) * sine(u * slow[i][0] + ph(20 + i));
    if (rough > 0) for (let i = 0; i < fast.length; i++) v += rough * fast[i][1] * main(u * fast[i][0] + ph(30 + i));
    return v;
  };
  let lo = Infinity, hi = -Infinity;
  for (let x = 0; x < W; x++) { const v = raw(x + 0.5); if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  return (x) => base - height * clamp((raw(x) - lo) / span);
}

/**
 * One broad rise across a layer W px wide, repeating exactly (engine/space.js arch): the limb of a planet, the arc of
 * its ring, a swell of dust. Returns x -> y. Arguments: { base, height, at (the column of its top), power }, W.
 */
export function swellOutline({ base = 170, height = 24, at = 160, power = 1 } = {}, W = 320) {
  return (x) => base - height * (0.5 + 0.5 * Math.cos((TAU * (x - at)) / W)) ** power;
}

/**
 * Where the sunlit part of an outline ends (engine/backdrop.js litEdge): a wedge on each face that falls away to the
 * right, widening downhill, `depth` thick. Returns x -> y. Arguments: outline, depth, W.
 */
export function litEdgeOutline(outline, depth, W = 320) {
  const y = new Float64Array(W), drop = new Float64Array(W);
  let top = 0;
  for (let x = 0; x < W; x++) { y[x] = outline(x + 0.5); if (y[x] < y[top]) top = x; }
  for (let i = 1; i < W; i++) {
    const x = (top + i) % W, before = (top + i - 1) % W;
    const fall = y[x] - y[before];
    drop[x] = x === top ? 0 : Math.max(0, fall >= 0 ? drop[before] + fall : drop[before] + fall * 3);
  }
  return (x) => { const i = Math.floor(mod(x, W)); return y[i] + drop[i] * depth; };
}

/** The ground struct's fields: an outline written out, or the one an earlier item draws (the layout fills it from `on`). */
const GROUND_FIELDS = {
  kind: word(['line', 'ridge', 'swell'], { default: 'line', about: 'A flat line, a ridge or a swell' }),
  base: px(-360, 720, { default: 0, about: 'Its lowest row (a line: its row)' }),
  height: px(-360, 360, { default: 40, about: 'How far it rises above base' }),
  seed: seed({ default: 1, about: 'Which ridge' }),
  peaks: count(1, 12, { default: 4, about: 'Summits across the layer (a ridge)' }),
  shape: word(['round', 'jagged'], { default: 'round', about: 'Soft hills or crags (a ridge)' }),
  rough: share({ default: 0.35, about: 'Small bumps on top (a ridge)' }),
  at: px(-640, 1280, { default: 160, about: 'The column of its top (a swell)' }),
  power: px(0.75, 4, { default: 1, about: 'Above 1 a narrower rise with a flatter foot (a swell)' }),
  dx: px(-640, 640, { default: 0, about: 'Moved this many px right' }),
  dy: px(-360, 360, { default: 0, about: 'Moved this many px down' }),
};
const GROUND = (about) => struct(GROUND_FIELDS, { default: { kind: 'line' }, about });

/** The outline of a ground struct across a layer W px wide: x -> y (a line at `base` by default). Arguments: ground, W, base (the call's own base for a line, when the ground says none). */
export function groundOutline(g, W, base = 0) {
  const d = (k) => (isObj(g) && g[k] !== undefined ? g[k] : GROUND_FIELDS[k].default);
  let f;
  if (d('kind') === 'ridge') f = ridgeOutline({ base: d('base'), height: d('height'), seed: d('seed'), peaks: d('peaks'), shape: d('shape'), rough: d('rough') }, W);
  else if (d('kind') === 'swell') f = swellOutline({ base: d('base'), height: d('height'), at: d('at'), power: d('power') }, W);
  else { const y = isObj(g) && g.base !== undefined ? g.base : base; f = () => y; }
  const dx = d('dx'), dy = d('dy');
  return dx || dy ? (x) => f(x - dx) + dy : f;
}

/** The ground struct an outline-drawing call stands for (ridge@1, swell@1), for a call `on` it; null for any other. */
export function groundOf(call) {
  if (!isObj(call) || call.v !== 1) return null;
  const pickN = (keys) => Object.fromEntries(keys.filter((k) => call[k] !== undefined).map((k) => [k, call[k]]));
  if (call.gen === 'ridge') return { kind: 'ridge', ...pickN(['base', 'height', 'seed', 'peaks', 'shape', 'rough']) };
  if (call.gen === 'swell') return { kind: 'swell', ...pickN(['base', 'height', 'at', 'power']) };
  return null;
}

// ---- placing across the width ---------------------------------------------------------------------------------------

/**
 * `n` positions across a layer W px wide (engine/backdrop.js scatter, the width a parameter): [{ x, i, u, v, w }], one
 * per slot of W / n (jitter 0 evenly spaced, 1 anywhere in its slot) or, stable, placed by the golden ratio so they keep
 * their places when n changes. u, v, w: three steady numbers 0..1 for each. Arguments: n, seed, { jitter, stable }, W.
 */
export function spots(n, s = 1, { jitter = 0.6, stable = false } = {}, W = 320) {
  const k = Math.max(0, Math.floor(n));
  const out = [];
  if (stable) {
    const start = hash(s, 77);
    for (let i = 0; i < k; i++) {
      const u01 = start + i * 0.6180339887498949;
      out.push({ x: Math.floor((u01 - Math.floor(u01)) * W) % W, i, u: hash(s * 31 + i, 1), v: hash(s * 31 + i, 2), w: hash(s * 31 + i, 3) });
    }
    return out.sort((a, b) => a.x - b.x || a.i - b.i);
  }
  const slot = W / (k || 1);
  for (let i = 0; i < k; i++) {
    const at = (i + 0.5 + (hash(s * 31 + i, 0) - 0.5) * jitter) * slot;
    out.push({ x: Math.min(W - 1, Math.max(0, Math.round(at))), i, u: hash(s * 31 + i, 1), v: hash(s * 31 + i, 2), w: hash(s * 31 + i, 3) });
  }
  return out;
}

/** The columns a thing at x reaching `reach` px either way is drawn at: x, and once more W px to the side when it crosses the join (engine/backdrop.js wrapped). */
function copiesAt(x, reach, W, wrap) {
  if (!wrap) return [x];
  const out = [x];
  if (x + reach > W) out.push(x - W);
  if (x - reach < 0) out.push(x + W);
  return out;
}

/** How far a placed primitive reaches either way from its `at`, for its copies across the join. */
function reachOf(p) {
  const r = Array.isArray(p.r) ? p.r[0] : p.r;
  switch (p.kind) {
    case 'rect': return (Array.isArray(p.size) ? p.size[0] : 1) + 1;
    case 'dot': return 2;
    case 'ellipse': return (fin(r) ? r : 8) + 1;
    case 'ring': case 'arc': return (fin(r) ? r : 8) + (fin(p.thick) ? p.thick : 1) + 1;
    case 'stamp': return Math.max(1, ...(Array.isArray(p.rows) ? p.rows.map((x) => String(x).length) : [1])) + 1;
    default: return 40;
  }
}

/** Generators scatter@1 hands a seed and its wrap to when they place them and the call does not say: "<id>@<v>" -> arguments. */
const PLACED_TAKES = Object.freeze({ 'cloud@1': ['seed', 'wrap'], 'canopy@1': ['seed', 'wrap'], 'nebula@1': ['seed', 'wrap'], 'disc@1': ['wrap'] });

const at01 = (paintRef, k) => (isObj(paintRef) && (paintRef.rule === 'sky.look' || paintRef.rule === 'space.look') ? { ...paintRef, at: k } : null);

// ---- the generators -------------------------------------------------------------------------------------------------

/** The most places scatter@1 tries for one copy before it leaves it out (tiles.scatter tried until it had its count). */
const SCATTER_TRIES = 12;

/**
 * scatter@1: copies of one thing at seeded points across the frame (engine/backdrop.js scatter and engine/tiles.js
 * scatter, docs/data-sprites.md 3.3): its x from one slot of the width each (jitter) or, stable, placed so a Density
 * slider adds things to the ones there; its y between rows[0] and rows[1] (below a ground's outline when it has one),
 * kept inside the frame. margin keeps them that far inside the frame: top and bottom always, the sides when not
 * wrapping. gap keeps the copies that far apart (across plus down, as tiles.scatter measured): a copy too near an
 * earlier one tries other places nearby, and is left out only when none is free. It wraps only when told (wrap: in a
 * layers body the layout tells it whether its layer wraps; in a tile or alone it does not), and then a thing near an
 * edge comes back across the join. drift and show: over a looping clip each copy slides `drift` px and shows for that
 * share of its cycle.
 */
export const scatter = defineGenerator({
  id: 'scatter', v: 1, family: 'place', wraps: true,
  about: 'Copies of one thing at seeded points across the frame, a gap apart, the same ones kept when the count grows; wrapping at the edges in a layer.',
  args: {
    count: count(0, 64, { default: 4, about: 'How many' }),
    seed: seed({ default: 1, about: 'Which points' }),
    stable: flag({ default: false, about: 'Keep the points already there when the count grows (a Density slider)' }),
    jitter: share({ default: 0.6, about: '0 evenly spaced, 1 anywhere in its slot' }),
    rows: point({ lo: -360, hi: 360, default: [0, 360], about: 'The rows the things lie between, kept inside the frame (below the ground when there is one)' }),
    margin: px(0, 64, { default: 0, about: 'Kept this far inside the frame: top and bottom, and the sides when not wrapping' }),
    gap: px(0, 64, { default: 0, about: 'Copies kept this far apart (across plus down); one that cannot be is left out' }),
    drift: px(-64, 64, { default: 0, about: 'Each copy slides this far over its cycle of a looping clip' }),
    show: share({ default: 1, about: 'The share of its cycle each copy is shown' }),
    ground: GROUND('The outline the rows are measured from (set from `on`)'),
    place: place({ about: 'The thing to copy: a primitive, a piece or a generator call' }),
    wrap: flag({ default: false, about: 'Things over an edge come back on the other side (a layer says whether it wraps)' }),
  },
  keyable: ['count'],
  cost: (a, { costOf }) => a.count * (Object.hasOwn(a.place, 'gen') ? costOf(a.place) : 3 * costOf(a.place)),
  run(a, ctx, { call }) {
    const [W, H] = ctx.size;
    const m = a.margin;
    const ground = isObj(a.ground) && a.ground.kind !== 'line' ? groundOutline(a.ground, W) : null;
    const kept = [], out = [];
    const thing = a.place, isCall = Object.hasOwn(thing, 'gen'), isUse = !isCall && Object.hasOwn(thing, 'use') && !Object.hasOwn(thing, 'kind');
    const takes = isCall ? PLACED_TAKES[`${thing.gen}@${thing.v}`] ?? [] : [];
    const t = phase(ctx.t);
    const slot = W / Math.max(1, a.count);
    // a column of the frame for a spot's column u (0..W): itself when wrapping, else squeezed inside the side margins
    const column = (u) => (a.wrap ? mod(Math.round(u), W) : Math.round(m + (clamp(u, 0, W - 1) * Math.max(0, W - 1 - 2 * m)) / Math.max(1, W - 1)));
    // its row for a share v (0..1) of the rows at that column, inside the frame and its top and bottom margins; null when none
    const row = (x, v) => {
      const gy = ground ? ground(x + 0.5) : 0;
      const lo = Math.max(gy + a.rows[0], m), hi = Math.min(gy + a.rows[1], H - 1 - m);
      return hi < lo ? null : Math.round(lo + v * (hi - lo));
    };
    const near = (x, y) => kept.some((k) => Math.abs(a.wrap ? gapOf(k[0], x, W) : k[0] - x) + Math.abs(k[1] - y) < a.gap);
    for (const c of spots(a.count, a.seed, { jitter: a.jitter, stable: a.stable }, W)) {
      let x = null, y = null;
      for (let k = 0; k < (a.gap > 0 ? SCATTER_TRIES : 1) && x === null; k++) {
        const id = a.seed * 31 + c.i;
        const cx = column(k ? c.x + (hash(id, 100 + k) - 0.5) * slot : c.x), cy = row(cx, k ? hash(id, 120 + k) : c.v);
        if (cy !== null && (a.gap <= 0 || !near(cx, cy))) { x = cx; y = cy; }
      }
      if (x === null) continue;
      kept.push([x, y]);
      if (a.show < 1 || a.drift) {
        const life = fract(t + hash(a.seed * 31 + c.i, 4));
        if (life >= a.show) continue;
        x += Math.round(a.drift * life);
        if (a.wrap) x = mod(x, W);
      }
      if (isCall) {
        const child = { ...thing, at: [x, y] };
        if (takes.includes('seed') && child.seed === undefined) child.seed = (a.seed * 31 + c.i) % 10000;
        if (takes.includes('wrap') && child.wrap === undefined) child.wrap = a.wrap;
        out.push(...call(child, ctx));
        continue;
      }
      const reach = isUse ? 40 : reachOf(thing);
      for (const cx of copiesAt(x, reach, W, a.wrap)) out.push(isUse ? { kind: 'use', ...thing, at: [cx, y] } : { ...thing, at: [cx, y] });
    }
    return out;
  },
});

/**
 * sky.bands@1: the sky in flat bands across the whole layer, top to horizon: the last band (the horizon) from row
 * `horizon` down, the others sharing the rows above it. A look rule (sky.look, space.look) gives each band its colour
 * from the top (at 0) to the horizon (at 1); any other paint steps from darker at the top to lighter at the horizon.
 */
export const skyBands = defineGenerator({
  id: 'sky.bands', v: 1, family: 'backdrop',
  about: 'The sky in flat bands across the whole layer, darkest at the top, the lightest from the horizon row down.',
  args: {
    paint: paint({ about: 'A sky look (sky.look, space.look) or a colour stepped from darker to lighter' }),
    bands: count(2, 12, { default: 4, about: 'How many bands' }),
    horizon: px(0, 360, { default: 96, about: 'The row where the last, lightest band starts' }),
  },
  cost: (a) => a.bands,
  run(a, ctx) {
    const [W, H] = ctx.size, n = a.bands;
    const edge = (i) => (i >= n - 1 ? Math.round(a.horizon) : Math.round((i * a.horizon) / (n - 1)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const y0 = Math.min(H, edge(i)), y1 = i === n - 1 ? H : Math.min(H, edge(i + 1));
      if (y1 <= y0) continue;
      const p = at01(a.paint, k) ?? { rule: 'tone', of: a.paint, by: Math.round(lerp(-0.6, 0.4, k) * 1000) / 1000 };
      out.push({ kind: 'rect', at: [0, y0], size: [W, y1 - y0], paint: p, ...FLAT });
    }
    return out;
  },
});

const LIT_EDGE = struct({ depth: px(0, 2, { about: 'How thick the lit wedge gets: 0 none, 0.5 thin, 1.5 broad' }), paint: paint({ about: 'The lit faces' }) },
  { default: { depth: 0, paint: 'ink' }, about: 'Sunlit faces: the faces that fall away to the right, a wedge from each summit' });

/**
 * ridge@1: a line of hills or mountains across the layer, repeating exactly (engine/backdrop.js ridge + fillBelow), its
 * sunlit faces lighter (litEdge, as litEdge + fillBetween). Give it an `id` and other calls can stand `on` it.
 */
export const ridgeGen = defineGenerator({
  id: 'ridge', v: 1, family: 'backdrop',
  about: 'A line of hills or mountains across the layer, filled down to the bottom, repeating exactly, its sunlit faces lighter.',
  args: {
    base: px(-360, 720, { about: 'The row of its lowest valley' }),
    height: px(0, 360, { default: 40, about: 'How far its highest peak rises above base' }),
    seed: seed({ default: 1, about: 'Which ridge' }),
    peaks: count(1, 12, { default: 4, about: 'Summits across the layer' }),
    shape: word(['round', 'jagged'], { default: 'round', about: 'Soft hills or straight-sided crags' }),
    rough: share({ default: 0.35, about: 'Small bumps on top of the main shape' }),
    paint: paint({ about: 'The ridge' }),
    litEdge: LIT_EDGE,
    to: px(0, 720, { default: 720, about: 'The row the fill stops at (the bottom of the layer)' }),
  },
  cost: () => 2 * FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const o = ridgeOutline(a, W);
    const out = fillBetweenPolys(o, () => a.to, a.paint, W, H);
    if (a.litEdge.depth > 0) out.push(...fillBetweenPolys(o, litEdgeOutline(o, a.litEdge.depth, W), a.litEdge.paint, W, H));
    return out;
  },
});

const RIM = struct({
  depth: px(0, 32, { about: 'How thick the band under the edge is' }),
  grow: px(-32, 32, { default: 0, about: 'How much thicker it gets towards `at`' }),
  at: px(-640, 1280, { default: 160, about: 'The column where it is thickest' }),
  paint: paint({ about: 'The band' }),
}, { default: { depth: 0, paint: 'ink' }, about: 'A band under the edge (a planet\'s sunlit rim)' });

/**
 * swell@1: one broad rise across the layer, repeating exactly (engine/space.js arch + fillBelow): a planet's limb, a swell
 * of dust, filled down to the bottom, with a band of another colour under its edge (rim, thickest at rim.at).
 */
export const swell = defineGenerator({
  id: 'swell', v: 1, family: 'backdrop',
  about: 'One broad rise across the layer, filled down to the bottom, repeating exactly: a planet\'s limb or a swell of dust, with a lit rim.',
  args: {
    base: px(-360, 720, { about: 'The row of its lowest point, half the layer from its top' }),
    height: px(-360, 360, { default: 24, about: 'How far it rises' }),
    at: px(-640, 1280, { default: 160, about: 'The column of its top' }),
    power: px(0.75, 4, { default: 1, about: 'Above 1 a narrower rise with a flatter foot' }),
    paint: paint({ about: 'The body' }),
    rim: RIM,
    to: px(0, 720, { default: 720, about: 'The row the fill stops at' }),
  },
  cost: () => 2 * FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const o = swellOutline(a, W);
    const out = fillBetweenPolys(o, () => a.to, a.paint, W, H);
    const r = a.rim;
    if (r.depth > 0 || r.grow > 0) {
      const thick = swellOutline({ base: r.depth, height: -(r.grow ?? 0), at: r.at ?? 160 }, W);
      out.push(...fillBetweenPolys(o, (x) => o(x) + thick(x), r.paint, W, H));
    }
    return out;
  },
});

/** fill.below@1: everything below an outline down to a row (engine/backdrop.js fillBelow): a ground written out or set from `on`, moved by dx, dy. */
export const fillBelowGen = defineGenerator({
  id: 'fill.below', v: 1, family: 'backdrop',
  about: 'Everything below an outline (an earlier item it stands on, or a ground written out), moved by dx and dy, down to a row.',
  args: {
    ground: GROUND('The outline: set from `on`, or written out'),
    base: px(-360, 720, { default: 0, about: 'The row of a flat ground' }),
    dx: px(-640, 640, { default: 0, about: 'The outline moved this many px right' }),
    dy: px(-360, 360, { default: 0, about: 'The outline moved this many px down' }),
    to: px(0, 720, { default: 720, about: 'The row the fill stops at' }),
    paint: paint({ about: 'The fill' }),
  },
  cost: () => FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const g = groundOutline(a.ground, W, a.base);
    return fillBetweenPolys((x) => g(x - a.dx) + a.dy, () => a.to, a.paint, W, H);
  },
});

/** fill.between@1: a band that follows an outline, from `from` px below it to `to` px below it (engine/backdrop.js fillBetween of shifted outlines): a lit edge, a ring. */
export const fillBetweenGen = defineGenerator({
  id: 'fill.between', v: 1, family: 'backdrop',
  about: 'A band that follows an outline, from one depth below it to another: a lit edge along a ridge, the bands of a ring.',
  args: {
    ground: GROUND('The outline: set from `on`, or written out'),
    base: px(-360, 720, { default: 0, about: 'The row of a flat ground' }),
    from: px(-360, 360, { default: 0, about: 'Where the band starts, px below the outline' }),
    to: px(-360, 360, { default: 3, about: 'Where it ends, px below the outline' }),
    dx: px(-640, 640, { default: 0, about: 'The outline moved this many px right' }),
    paint: paint({ about: 'The band' }),
  },
  cost: () => FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const g = groundOutline(a.ground, W, a.base);
    return fillBetweenPolys((x) => g(x - a.dx) + a.from, (x) => g(x - a.dx) + a.to, a.paint, W, H);
  },
});

/** mist.band@1: mist lying at the foot of a ridge (engine/backdrop.js mistBand): the air colour with a softly waving top, `height` px deep above row `at`, down to a row. */
export const mistBand = defineGenerator({
  id: 'mist.band', v: 1, family: 'backdrop',
  about: 'Mist lying on the ground: a band with a softly waving top, height px deep above a row, across the whole layer.',
  args: {
    at: px(-360, 720, { about: 'The row it lies on' }),
    height: px(0, 120, { default: 6, about: 'How deep it is' }),
    seed: seed({ default: 21, about: 'Which waves' }),
    paint: paint({ about: 'The mist (the air colour)' }),
    to: px(0, 720, { default: 720, about: 'The row it stops at' }),
  },
  cost: () => FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const o = ridgeOutline({ base: a.at, height: 5, seed: a.seed, peaks: 3, rough: 0.2 }, W);
    return fillBetweenPolys((x) => o(x) - a.height, () => a.to, a.paint, W, H);
  },
});

const LIT_BAND = struct({ dx: px(-16, 16, { default: -2, about: 'Moved this many px right' }), dy: px(0, 16, { about: 'How deep the band is: 0 none' }), paint: paint({ about: 'The lit band' }) },
  { default: { dy: 0, paint: 'ink' }, about: 'A lit band along the tops of the crowns' });

/**
 * treeline@1: clumps of trees standing on a ground (engine/backdrop.js treeline, as sprites/bg-forest.js grew them on its
 * hills): `clumps` places across the layer (stable, so a Density slider adds clumps), kept on the upper slopes (crest),
 * `per` trees each, round crowns or firs up to `tall` px. Filled from the crowns down to the ground only, so the hill it
 * stands on stays in front of their feet; a lit band along the crowns.
 */
export const treeline = defineGenerator({
  id: 'treeline', v: 1, family: 'backdrop',
  about: 'Clumps of round trees or firs standing on a hill (an earlier ridge it is on), filled from the crowns down to the ground.',
  args: {
    ground: GROUND('The ground they stand on: set from `on`, or written out'),
    base: px(-360, 720, { default: 720, about: 'The row of a flat ground (at most the layer\'s bottom row)' }),
    clumps: count(0, 40, { default: 8, about: 'How many clumps across the layer' }),
    per: count(1, 6, { default: 4, about: 'Trees in a clump' }),
    tall: px(2, 64, { about: 'The tallest tree, px' }),
    seed: seed({ default: 1, about: 'Which clumps' }),
    shape: word(['round', 'pointed'], { default: 'round', about: 'Round crowns or firs' }),
    width: px(0.3, 3, { default: 1.15, about: 'A crown\'s width as a share of its height' }),
    crest: share({ default: 0.7, about: 'Clumps only where the ground is this high or higher (1: everywhere)' }),
    paint: paint({ about: 'The trees' }),
    lit: LIT_BAND,
  },
  cost: () => 2 * FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const ground = groundOutline(a.ground, W, Math.min(a.base, H));
    const ys = Array.from({ length: 32 }, (_, i) => ground(((i + 0.5) * W) / 32));
    const line = lerp(Math.min(...ys), Math.max(...ys), a.crest);
    const at = [];
    for (const c of spots(a.clumps, a.seed, { stable: true }, W)) {
      if (a.crest < 1 && ground(c.x) > line) continue;
      for (let k = 0; k < a.per; k++) at.push({ x: c.x + Math.round((k - (a.per - 1) / 2) * a.tall * 0.55), u: hash(c.i, 60 + k), v: hash(c.i, 70 + k) });
    }
    const trees = at.map((t) => { const h = a.tall * lerp(0.65, 1, t.u); return { x: t.x + 0.5, h, r: Math.max(2, (h * a.width * lerp(0.8, 1.15, t.v)) / 2) }; });
    if (trees.length) trees.reduce((p, q) => (q.h > p.h ? q : p)).h = a.tall;
    for (const t of trees) t.foot = ground(t.x);
    const wood = (x) => {
      let y = ground(x);
      for (const t of trees) {
        const d = Math.abs(gapOf(x, t.x, W));
        if (d >= t.r) continue;
        const k = a.shape === 'pointed' ? 1 - d / t.r : Math.sqrt(1 - (d / t.r) ** 2);
        if (t.foot - t.h * k < y) y = t.foot - t.h * k;
      }
      return y;
    };
    const out = fillBetweenPolys(wood, ground, a.paint, W, H);
    if (a.lit.dy > 0) out.push(...fillBetweenPolys(wood, (x) => Math.min(ground(x), wood(x - a.lit.dx) + a.lit.dy), a.lit.paint, W, H));
    return out;
  },
});

/**
 * cloud@1: a flat-bottomed cartoon cloud (engine/backdrop.js cloud): `at` is the middle of its flat underside, `size`
 * its width (varied by `vary` from its seed), three bumps on a long body; `under` paints its bottom three rows. Wraps.
 */
export const cloud = defineGenerator({
  id: 'cloud', v: 1, family: 'backdrop', wraps: true,
  about: 'A flat-bottomed cartoon cloud: three bumps on a long body, its underside a darker band, wrapping at the edges.',
  args: {
    at: point({ about: 'The middle of its flat underside' }),
    size: px(8, 96, { default: 40, about: 'Its width, px' }),
    vary: share({ default: 0.3, about: 'How much the width varies with the seed' }),
    seed: seed({ default: 0, about: 'Which bumps' }),
    paint: paint({ about: 'The cloud' }),
    under: paint({ default: 'clear', about: 'Its bottom three rows (clear: none)' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => 2 * (polyBound(Math.ceil(a.size * 1.75) + 8) + 1),
  run(a, ctx) {
    const [W, H] = ctx.size;
    const x0 = Math.round(a.at[0]), y = Math.round(a.at[1]);
    const w = a.size * lerp(1 - a.vary / 2, 1 + a.vary / 2, hash(a.seed, 40));
    const r = Math.max(3, Math.round(w * 0.13));
    const bumps = [
      [-w * lerp(0.2, 0.28, hash(a.seed, 41)), w * lerp(0.15, 0.2, hash(a.seed, 42))],
      [w * lerp(-0.04, 0.06, hash(a.seed, 43)), w * lerp(0.22, 0.27, hash(a.seed, 44))],
      [w * lerp(0.2, 0.28, hash(a.seed, 45)), w * lerp(0.14, 0.19, hash(a.seed, 46))],
    ];
    const body = capsuleIn(x0 - w / 2 + r, y - 1, x0 + w / 2 - r, y - 1, r, r);
    const lobes = bumps.map(([dx, br]) => ellipseIn(Math.round(x0 + dx), y - Math.round(br * 0.45), br, br));
    const inside = (px, py) => body(px, py) || lobes.some((f) => f(px, py));
    const top = Math.floor(y - Math.max(r + 2, ...bumps.map(([, br]) => br * 1.45 + 2)));
    const y0 = new Array(W).fill(0), y1 = new Array(W).fill(0), u0 = new Array(W).fill(0), u1 = new Array(W).fill(0);
    const reach = Math.ceil(w / 2 + 2 + Math.max(...bumps.map(([dx, br]) => Math.abs(dx) + br - w / 2), 0));
    for (let xx = x0 - reach; xx <= x0 + reach; xx++) {
      const fx = a.wrap ? mod(xx, W) : xx;
      if (fx < 0 || fx >= W) continue;
      let lo = Infinity, hi = -Infinity, ulo = Infinity;
      for (let py = Math.max(top, 0); py < y; py++) {
        if (inside(xx + 0.5, py + 0.5)) { if (py < lo) lo = py; hi = py; }
        if (py >= y - 3 && ulo === Infinity && body(xx + 0.5, py + 0.5)) ulo = py;
      }
      if (hi >= lo) { y0[fx] = Math.max(0, lo); y1[fx] = Math.min(H, hi + 1); }
      if (ulo !== Infinity) { u0[fx] = Math.max(0, ulo); u1[fx] = Math.min(H, y); }
    }
    const out = columnPolys(y0, y1, a.paint);
    if (a.under !== 'clear') out.push(...columnPolys(u0, u1, a.under));
    return out;
  },
});

/** disc@1: a flat disc that wraps (engine/backdrop.js disc): the sun, the moon, a round bush. */
export const disc = defineGenerator({
  id: 'disc', v: 1, family: 'backdrop', wraps: true,
  about: 'A flat disc (the sun, the moon, a round bush) that comes back across the join.',
  args: {
    at: point({ about: 'Its middle' }),
    r: px(1, 64, { default: 8, about: 'Its radius' }),
    paint: paint({ about: 'The disc' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: () => 3,
  run(a, ctx) {
    const W = ctx.size[0];
    return copiesAt(a.at[0], a.r + 1, W, a.wrap).map((x) => ({ kind: 'ellipse', at: [x, a.at[1]], r: [a.r, a.r], paint: a.paint, ...FLAT }));
  },
});

/**
 * stars@1: stars across the layer that keep their places when their number changes (engine/space.js starField): 2 px
 * dots, small crosses (plus) and big crosses with a bright heart (big), never a single pixel; over a looping clip the
 * twinkling share flares a size bigger for a quarter of its cycle and is dim for another quarter. Wraps.
 */
export const stars = defineGenerator({
  id: 'stars', v: 1, family: 'backdrop', wraps: true,
  about: 'Stars across the layer that keep their places as their number changes: dots and crosses, some twinkling over a looping clip.',
  args: {
    count: count(0, 200, { default: 40, about: 'How many (more are added to the ones already there)' }),
    seed: seed({ default: 1, about: 'Which stars' }),
    top: px(0, 360, { default: 0, about: 'The highest row they lie on' }),
    bottom: px(0, 360, { default: 360, about: 'The lowest row' }),
    paint: paint({ about: 'A star (a cross\'s arms)' }),
    dim: paint({ default: 'clear', about: 'A twinkling star at its faintest (clear: as paint)' }),
    heart: paint({ default: 'clear', about: 'A cross\'s heart (clear: as paint)' }),
    plus: share({ default: 0.3, about: 'The share that are small crosses' }),
    big: share({ default: 0.1, about: 'The share that are big crosses' }),
    twinkle: share({ default: 0, about: 'The share that twinkle over a looping clip' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  keyable: ['count'],
  cost: (a) => a.count * 9,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const bottom = Math.min(a.bottom, H), room = Math.max(0, bottom - a.top - 7);
    const dim = a.dim === 'clear' ? a.paint : a.dim, heart = a.heart === 'clear' ? a.paint : a.heart;
    const t = phase(ctx.t);
    const out = [];
    for (const s of spots(a.count, a.seed, { stable: true }, W)) {
      const y = Math.round(a.top + 3 + s.v * room), id = a.seed * 31 + s.i;
      const life = hash(id, 5) < a.twinkle ? fract(t + hash(id, 6)) : -1;
      const flare = life >= 0 && life < 0.25, faint = life >= 0.5 && life < 0.75;
      const size = (s.w < a.big ? 2 : s.w < a.big + a.plus ? 1 : 0) + (flare ? 1 : 0);
      const arm = faint ? dim : a.paint;
      const x0 = a.wrap ? s.x : Math.min(W - 2 - size, Math.max(size, s.x));
      for (const x of copiesAt(x0, size + 2, W, a.wrap)) {
        if (!size) { out.push({ kind: 'rect', at: [x, y], size: [2, 2], paint: arm, ...FLAT }); continue; }
        out.push({ kind: 'rect', at: [x - size, y], size: [2 * size + 1, 1], paint: arm, ...FLAT });
        out.push({ kind: 'rect', at: [x, y - size], size: [1, 2 * size + 1], paint: arm, ...FLAT });
        out.push({ kind: 'dot', at: [x, y], paint: faint ? arm : heart });
      }
    }
    return out;
  },
});

/** nebula@1: a big ragged patch of glowing gas (engine/space.js nebula): overlapping lobes in a box `size` round `at`, in two or three flat tones lighter towards its heart. Wraps. */
export const nebula = defineGenerator({
  id: 'nebula', v: 1, family: 'backdrop', wraps: true,
  about: 'A big ragged patch of glowing gas: overlapping lobes in two or three flat tones, lighter towards its heart, wrapping at the edges.',
  args: {
    at: point({ about: 'Its middle' }),
    size: point({ lo: 8, hi: 640, about: 'The box it stays in: width and height' }),
    seed: seed({ default: 0, about: 'Which nebula' }),
    lobes: count(3, 24, { default: 11, about: 'More is denser and rounder' }),
    paint: paint({ about: 'The gas' }),
    inner: paint({ about: 'Its lighter inner part' }),
    core: paint({ default: 'clear', about: 'The brightest knots near the heart (clear: none)' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.lobes * 6,  // base, inner and core lobes (at most 2 n), up to three copies
  run(a, ctx) {
    const W = ctx.size[0], [w, h] = a.size, n = a.lobes, list = [];
    for (let i = 0; i < n; i++) {
      const ang = TAU * hash(a.seed, 50 + i), far = 0.28 * Math.sqrt((i + hash(a.seed, 60 + i)) / n);
      const rx = Math.max(2, w * lerp(0.11, 0.2, hash(a.seed, 70 + i))), ry = Math.max(2, h * lerp(0.1, 0.2, hash(a.seed, 80 + i)));
      list.push([Math.cos(ang) * far * w, Math.sin(ang) * far * h, rx, ry]);
    }
    const cy = Math.round(a.at[1]), out = [];
    const e = (x, y, rx, ry, p) => out.push({ kind: 'ellipse', at: [x, y], r: [rx, ry], paint: p, ...FLAT });
    for (const cx of copiesAt(Math.round(a.at[0]), w / 2 + 2, W, a.wrap)) {
      for (const [dx, dy, rx, ry] of list) e(cx + dx, cy + dy, rx, ry, a.paint);
      for (const [dx, dy, rx, ry] of list.slice(0, Math.ceil(n * 0.6))) e(cx + dx * 0.8 + rx * 0.1, cy + dy * 0.8 - ry * 0.1, Math.max(1.5, rx * 0.62), Math.max(1.5, ry * 0.6), a.inner);
      if (a.core !== 'clear') for (const [dx, dy, rx, ry] of list.slice(0, Math.ceil(n * 0.25))) e(cx + dx * 0.6, cy + dy * 0.6, Math.max(1.5, rx * 0.36), Math.max(1.5, ry * 0.34), a.core);
    }
    return out;
  },
});

/** canopy@1: a mass of leaves about `r` px round `at` (engine/backdrop.js canopy): overlapping round clumps in three tones, lit from the top right. Wraps. */
export const canopy = defineGenerator({
  id: 'canopy', v: 1, family: 'backdrop', wraps: true,
  about: 'A mass of leaves: overlapping round clumps in a dark, a base and a light tone, lit from the top right, wrapping at the edges.',
  args: {
    at: point({ about: 'Its middle' }),
    r: px(4, 64, { default: 16, about: 'About how far it reaches (12 or more keeps its three tones)' }),
    seed: seed({ default: 0, about: 'Which clumps' }),
    paint: paint({ about: 'The leaves' }),
    lit: paint({ about: 'The lit clumps' }),
    dark: paint({ about: 'The shaded clumps' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: () => 54,
  run(a, ctx) {
    const W = ctx.size[0], r = a.r, s = a.seed;
    const clumps = [[0, 0, r * 0.62]];
    for (let i = 0; i < 5; i++) {
      const ang = TAU * ((i + hash(s, 50 + i) * 0.7) / 5) + hash(s, 49) * TAU;
      const d = r * lerp(0.42, 0.55, hash(s, 60 + i));
      clumps.push([Math.cos(ang) * d * 1.1, Math.sin(ang) * d * 0.8, r * lerp(0.36, 0.5, hash(s, 70 + i))]);
    }
    const out = [], cy = Math.round(a.at[1]);
    const e = (x, y, rx, ry, p) => { if (rx > 0 && ry > 0) out.push({ kind: 'ellipse', at: [x, y], r: [rx, ry], paint: p, ...FLAT }); };
    for (const cx of copiesAt(Math.round(a.at[0]), r * 1.1 + 3, W, a.wrap)) {
      for (const [dx, dy, cr] of clumps) e(cx + dx, cy + dy, cr, cr, a.dark);
      for (const [dx, dy, cr] of clumps) e(cx + dx + 1.5, cy + dy - 2, cr - 1.5, cr - 2, a.paint);
      for (const [dx, dy, cr] of clumps) e(cx + dx + cr * 0.3, cy + dy - cr * 0.38, cr * 0.5, cr * 0.42, a.lit);
    }
    return out;
  },
});

// ---- colour rules ---------------------------------------------------------------------------------------------------

const CREAM = '#f0ead8', VIOLET = '#7a4fc4', EMBER = '#e08a2c', GOLD = '#f2c230', NIGHT = '#1f2452', MOONLIT = '#3d4a8a', ROSE = '#e8909a';

/** The sky of engine/backdrop.js skyLook at one time ('day', 'dusk', 'night'; and 'dawn', new here: paler and rosier than dusk): { top, horizon, glow, cloud }. */
function skyAt(sky, time) {
  if (time === 'dawn') { const horizon = mix(mix(sky, ROSE, 0.45), CREAM, 0.55); return { top: mix(mix(sky, VIOLET, 0.4), NIGHT, 0.1), horizon, glow: mix(ROSE, CREAM, 0.5), cloud: mix(horizon, CREAM, 0.6) }; }
  if (time === 'day') { const horizon = mix(tone(sky, 0.75), CREAM, 0.3); return { top: mix(sky, tone(sky, -1.2), 0.75), horizon, glow: mix(CREAM, GOLD, 0.22), cloud: mix(horizon, CREAM, 0.6) }; }
  if (time === 'dusk') { const horizon = mix(mix(sky, EMBER, 0.5), CREAM, 0.5); return { top: mix(mix(sky, VIOLET, 0.62), NIGHT, 0.18), horizon, glow: mix(EMBER, CREAM, 0.42), cloud: mix(horizon, CREAM, 0.6) }; }
  const horizon = mix(sky, MOONLIT, 0.78);
  return { top: mix(sky, NIGHT, 0.88), horizon, glow: mix(CREAM, sky, 0.22), cloud: mix(horizon, CREAM, 0.14) };
}
const blendLook = (a, b, k) => (k <= 0 ? a : k >= 1 ? b : { top: mix(a.top, b.top, k), horizon: mix(a.horizon, b.horizon, k), glow: mix(a.glow, b.glow, k), cloud: mix(a.cloud, b.cloud, k) });

/** One colour of a sky at a time of day (0 dawn, 0.5 midday, 1 dusk) and of night (dark 0..1): engine/backdrop.js skyLook, blended. what: band (at: 0 top .. 1 horizon), air, glow, cloud, under (a cloud's underside). */
function skyLookHex({ of, time = 0.5, dark = 0, what = 'band', at = 0 }) {
  const L = blendLook(blendLook(skyAt(of, 'day'), skyAt(of, time < 0.5 ? 'dawn' : 'dusk'), clamp(Math.abs(time - 0.5) * 2)), skyAt(of, 'night'), clamp(dark));
  if (what === 'air') return L.horizon;
  if (what === 'glow') return L.glow;
  if (what === 'cloud') return L.cloud;
  if (what === 'under') return mix(L.top, L.horizon, 0.7);
  return at <= 0 ? L.top : at >= 1 ? L.horizon : mix(L.top, L.horizon, at);
}

// engine/backdrop.js standOut and engine/space.js lighterThan, noDarkerThan: a tone kept clear of what lies behind it
const underPalette = PALETTES.map(() => new Map());
function inPalettes(hex) {
  return PALETTES.map((pal, i) => {
    let v = underPalette[i].get(hex);
    if (v === undefined) { if (underPalette[i].size > 4096) underPalette[i].clear(); v = applyColour(new Uint32Array([col(hex)]), { palette: pal.name })[0]; underPalette[i].set(hex, v); }
    return v;
  });
}
// every site palette's colour for each of `hexes` not yet known, worked out in one engine/theme.js applyColour call per
// palette (which sets up its palette on every call: one call per colour made a clear.of cost up to 10 ms)
function inPalettesAll(hexes) {
  const miss = [...new Set(hexes)].filter((h) => !underPalette[0].has(h));
  if (!miss.length) return;
  PALETTES.forEach((pal, i) => {
    if (underPalette[i].size + miss.length > 4096) underPalette[i].clear();
    const px = applyColour(new Uint32Array(miss.map(col)), { palette: pal.name });
    miss.forEach((h, k) => underPalette[i].set(h, px[k]));
  });
}
const cleared = new Map();
function clearOfHex({ of, behind = [], also = [], step = 0.08, way = 'auto', floor = 0 }) {
  const key = `${of}|${behind.join('|')}|${also.join('|')}|${step}|${way}|${floor}`;
  if (cleared.has(key)) return cleared.get(key);
  let out = of;
  if (behind.length || also.length) {
    // the tones it may move to, each way, known under every palette at once (those a step away in brightness)
    const all = [...behind, ...also], tones = [of];
    for (let k = 1; k <= 48; k++) tones.push(tone(of, k * 0.06), tone(of, -k * 0.06));
    const lights = all.map(brightness);
    inPalettesAll([...behind, ...tones.filter((c) => { const v = brightness(c); return lights.some((o) => Math.abs(v - o) >= step - 1e-9); })]);
    const theirs = behind.map(inPalettes), b0 = brightness(of);
    const clear = (c, dir) => {
      const v = brightness(c);
      for (const o of all) if ((v - brightness(o)) * dir < step - 1e-9) return false;
      const mine = inPalettes(c);      // the costly test (every site palette) only once the step is there
      for (const t of theirs) for (let k = 0; k < mine.length; k++) if (mine[k] === t[k]) return false;
      return true;
    };
    const move = (dir) => { let c = of; for (let k = 1; k <= 48 && !clear(c, dir); k++) c = tone(of, dir * k * 0.06); return clear(c, dir) ? c : null; };
    if (way === 'lighter') { out = of; for (let k = 1; k <= 48 && !clear(out, 1); k++) out = tone(of, k * 0.06); }
    else if (way === 'darker') out = move(-1) ?? of;
    else { const lighter = all.every((o) => brightness(o) < Math.min(b0, 0.5)); out = move(lighter ? 1 : -1) ?? move(lighter ? -1 : 1) ?? of; }
  }
  if (floor > 0 && brightness(out) < floor) {
    const [h, s, l] = rgbToHsl(...hexToRgb(out));
    for (let k = 1; k <= 100 && brightness(out) < floor; k++) out = hsl(h, s, Math.min(1, l + k * 0.01));
  }
  if (cleared.size > 4096) cleared.clear();
  cleared.set(key, out);
  return out;
}

/**
 * How each colour rule of this module is worked out, "<id>@<v>" -> fn(args) -> '#rrggbb', every paint argument already a
 * '#rrggbb' (a paints list: those that are colours). Read by workOutColour.
 */
export const COLOUR_WORK = Object.freeze({
  'sky.look@1': skyLookHex,
  'space.look@1': ({ of, deep, what = 'band', at = 0 }) => mix(deep, of, lerp(0.1, 0.55, what === 'air' ? 1 : clamp(at))),
  'haze@1': ({ of, air, depth = 0.5 }) => mix(of, air, lerp(0.35, 0.86, clamp(depth))),
  'lit.tone@1': ({ of, air, amount = 0.4 }) => (brightness(air) > brightness(of) ? mix(of, air, amount) : tone(of, amount)),
  'clear.of@1': clearOfHex,
});

/** A colour rule's sample, run as a plain generator: a swatch of the whole frame in the colour it names. */
const swatch = (id) => (a, ctx) => [{ kind: 'rect', at: [0, 0], size: [...ctx.size], paint: { rule: id, v: 1, ...a } }];

/** sky.look@1: a colour of the sky at a time of day, from one sky colour (engine/backdrop.js skyLook): a band (at 0 the top, 1 the horizon), the air, the sun's glow, a cloud or its underside. */
export const skyLookRule = defineGenerator({
  id: 'sky.look', v: 1, family: 'colour',
  about: 'A colour of the sky at a time of day from one sky colour: a band from the top to the horizon, the air, the sun, a cloud or its underside.',
  args: {
    of: paint({ about: 'The daytime sky colour (a palette slot)' }),
    time: share({ default: 0.5, about: '0 dawn, 0.5 midday, 1 dusk' }),
    dark: share({ default: 0, about: 'How far towards night' }),
    what: word(['band', 'air', 'glow', 'cloud', 'under'], { default: 'band', about: 'Which colour of the sky' }),
    at: share({ default: 0, about: 'A band: 0 the top of the sky, 1 the horizon' }),
  },
  cost: () => 1, run: swatch('sky.look'),
});

/** space.look@1: a colour of open space from one tint and the darkest colour of the kit (engine/space.js spaceLook): a band (at 0 the top, near black, 1 the lowest) or the air. */
export const spaceLookRule = defineGenerator({
  id: 'space.look', v: 1, family: 'colour',
  about: 'A colour of open space from one tint and the darkest colour: a band from near black at the top to the lowest, or the air.',
  args: {
    of: paint({ about: 'The tint of space (a palette slot)' }),
    deep: paint({ about: 'The darkest colour, which the top band stays close to' }),
    what: word(['band', 'air'], { default: 'band', about: 'A band or the air (the lowest band)' }),
    at: share({ default: 0, about: 'A band: 0 the top, 1 the lowest' }),
  },
  cost: () => 1, run: swatch('space.look'),
});

/** haze@1: a colour as it looks through the air (engine/backdrop.js recede): mixed towards the air from 35% of the way (depth 0, the near layer) to 86% (depth 1, the horizon). */
export const hazeRule = defineGenerator({
  id: 'haze', v: 1, family: 'colour',
  about: 'A colour as it looks through the air: mixed towards the air colour, more the farther it is (depth 0 near, 1 the horizon).',
  args: {
    of: paint({ about: 'The colour' }),
    air: paint({ about: 'The air colour (a sky look\'s air)' }),
    depth: share({ default: 0.5, about: '0 the near layer, 1 the horizon' }),
  },
  cost: () => 1, run: swatch('haze'),
});

/** lit.tone@1: the sunlit tone of a shape (engine/backdrop.js litTone): part of the way to the air colour, never lighter than the air; under a dark sky a plain lighter tone. */
export const litToneRule = defineGenerator({
  id: 'lit.tone', v: 1, family: 'colour',
  about: 'The sunlit tone of a shape: part of the way to the air colour, so it never outshines the sky; under a dark sky a lighter tone.',
  args: {
    of: paint({ about: 'The shape\'s main tone' }),
    air: paint({ about: 'The air colour' }),
    amount: share({ default: 0.4, about: 'How far towards the air' }),
  },
  cost: () => 1, run: swatch('lit.tone'),
});

/** clear.of@1: a shape's colour moved far enough in value from what it is seen against that no whole-bundle look merges them (engine/backdrop.js standOut; way lighter: engine/space.js lighterThan; floor: noDarkerThan). */
export const clearOfRule = defineGenerator({
  id: 'clear.of', v: 1, family: 'colour',
  about: 'A shape\'s colour moved a clear step of value from what it is seen against, so no whole-bundle look merges them.',
  args: {
    of: paint({ about: 'The shape\'s colour' }),
    behind: paints(4, { about: 'What it is seen against: kept a step away and a different colour under every site palette' }),
    also: paints(4, { default: ['clear'], about: 'Colours it only keeps the step from (clear: none)' }),
    step: share({ default: 0.08, about: 'The least difference in brightness' }),
    way: word(['auto', 'darker', 'lighter'], { default: 'auto', about: 'auto: darker in front of a light sky, lighter against the dark' }),
    floor: share({ default: 0, about: 'Never darker than this brightness (0.18 keeps clear of the ink)' }),
  },
  cost: () => 1, run: swatch('clear.of'),
});

/**
 * What a frame's colour rules may cost the layers layout (docs/data-sprites.md 3.4 rule 2: nothing a definition says can
 * hang the page). walk: the objects and lists inside the paints it reads in one frame (every paint of every primitive);
 * work: the colour rules it works out in one frame (each distinct paint once a frame). A library background reads a few
 * hundred and works out a few dozen; a frame past either is refused, saying why.
 */
const COLOUR_BUDGET = Object.freeze({ walk: 40000, work: 1500 });
/** What working out one colour rule costs of COLOUR_BUDGET.work (1 if not named): clear.of searches up to 96 tones under every site palette (about 0.4 ms at worst), so a frame works out about 24 different ones at most (a library background uses 6 at most). */
const COLOUR_WEIGHT = Object.freeze({ 'clear.of': 60 });

/** The objects and lists inside the colour rules anywhere in a call's arguments (0 when it names none). */
function ruleNodesIn(v, depth = 0) {
  if (depth > 12 || !v || typeof v !== 'object') return 0;
  if (!Array.isArray(v) && typeof v.rule === 'string') return paintWalk(v).nodes;
  let n = 0;
  for (const x of Array.isArray(v) ? v : Object.values(v)) n += ruleNodesIn(x, depth + 1);
  return n;
}

/** A paint walked once: { nodes (the objects and lists inside it), own (it holds a colour rule this module works out) }. */
function paintWalk(v, depth = 0, acc = { nodes: 0, own: false }) {
  if (depth > 8 || !v || typeof v !== 'object') return acc;
  acc.nodes++;
  if (Array.isArray(v)) { for (const x of v) paintWalk(x, depth + 1, acc); return acc; }
  if (typeof v.rule === 'string' && !Object.hasOwn(COLOUR_RULES, v.rule)) acc.own = true;
  for (const k of Object.keys(v)) if (k !== 'when') paintWalk(v[k], depth + 1, acc);
  return acc;
}

/**
 * The colour a paint gives, '#rrggbb', with this module's colour rules worked out (sky.look, space.look, haze, lit.tone,
 * clear.of), inside engine/data-rules.js rules and around them; null for clear, a slot the palette has not, or a rule
 * nobody works out. Never throws. Arguments: ref (a paint), palette ({ slot: { hex } | '#rrggbb' }), params (the
 * settings, for `choose`), reg (the registry the rule's entry is read from; default the site's), depth (how deep
 * inside another rule; 0), budget (optional { left }: the rules it may still work out, one off for each; past it the
 * answer is null and budget.over is set).
 */
export function workOutColour(ref, palette = {}, params = {}, reg = null, depth = 0, budget = null) {
  try {
    if (depth > 8) return null;
    if (typeof ref === 'string') return paintHex(ref, palette, params);
    if (!isObj(ref) || typeof ref.rule !== 'string') return null;
    if (budget && (budget.left -= COLOUR_WEIGHT[ref.rule] ?? 1) < 0) { budget.over = true; return null; }
    let lost = false;
    const taken = (c) => (whenMatches(isObj(c.when) || Array.isArray(c.when) ? c.when : { '': [] }, isObj(params) ? params : {}) ? c.then : c.else);
    const sub = (x, d) => {
      if (Array.isArray(x)) return x.map((y) => sub(y, d + 1));
      if (!isObj(x)) return x;
      if (x.rule === 'choose') return sub(taken(x), d + 1);   // only the branch the settings take is worked out
      // a colour nobody works out: the whole paint is null (lost), never worked out with a stand-in colour
      if (typeof x.rule === 'string' && !Object.hasOwn(COLOUR_RULES, x.rule)) { const h = workOutColour(x, palette, params, reg, d + 1, budget); if (h === null) lost = true; return h ?? FALLBACK; }
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, k === 'when' ? y : sub(y, d + 1)]));
    };
    // choose reads only the branch the settings take (as engine/data-rules.js does): the other is never worked out
    if (ref.rule === 'choose') return workOutColour(taken(ref), palette, params, reg, depth + 1, budget);
    if (Object.hasOwn(COLOUR_RULES, ref.rule)) { const r = sub(ref, depth); return lost || budget?.over ? null : paintHex(r, palette, params); }
    const v = fin(ref.v) ? ref.v : 1, key = `${ref.rule}@${v}`;
    const work = COLOUR_WORK[key];
    const entry = (reg && typeof reg.generator === 'function' ? reg.generator(ref.rule, v) : null) ?? siteGenerator(ref.rule, v);
    if (!work || !entry || entry.family !== 'colour') return null;
    const args = {};
    for (const [k, t] of Object.entries(entry.args)) {
      const x = Object.hasOwn(ref, k) ? ref[k] : t.default;
      if (t.type === 'paint') { args[k] = workOutColour(x, palette, params, reg, depth + 1, budget); if (args[k] === null && !t.optional) return null; }
      else if (t.type === 'paints') args[k] = (Array.isArray(x) ? x : []).map((y) => workOutColour(y, palette, params, reg, depth + 1, budget)).filter(Boolean);
      else args[k] = x;
    }
    const out = work(args);
    return typeof out === 'string' && /^#[0-9a-f]{6}$/i.test(out) ? out.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** The slots a paint reads (palette slot names, tones taken off), in order. */
function slotsRead(v, palette, out = [], depth = 0) {
  if (depth > 8) return out;
  if (typeof v === 'string') { const s = v.split('.')[0]; if (Object.hasOwn(palette, s)) out.push(s); return out; }
  if (Array.isArray(v)) { for (const x of v) slotsRead(x, palette, out, depth + 1); return out; }
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (k !== 'rule' && k !== 'when' && k !== 'what' && k !== 'way' && k !== 'v') slotsRead(x, palette, out, depth + 1);
  return out;
}

/**
 * The frame's own colours: every paint of a primitive that holds one of this module's colour rules worked out to a
 * palette slot of its own (<slot>-r<n>, n from 501, the material of the first slot the rule reads), added to `palette`.
 * Each distinct paint is worked out once a frame (S.seen), and the frame's colour work is bounded (COLOUR_BUDGET).
 * Throws, naming the rule, for a colour that cannot be worked out (never drawn magenta) or a frame over the budget.
 * Returns the primitive with those paints replaced. Arguments: p, S ({ palette, params, reg, synth: Map, seen: Map,
 * walked, work: { left }, clip }).
 */
function finishOwnPaints(p, S, depth = 0) {
  if (!isObj(p) || depth > 6) return p;
  const fix = (v) => {
    if (!v || typeof v !== 'object') return v;
    const w = paintWalk(v);
    S.walked += w.nodes;
    if (S.walked > COLOUR_BUDGET.walk) throw new Error(`layer ${S.clip}: its colour rules are too much to read in one frame (more than ${COLOUR_BUDGET.walk} parts of paints): nest fewer colour rules, or paint fewer things with a big one`);
    if (!w.own) return v;
    const text = JSON.stringify(v);
    if (S.seen.has(text)) return S.seen.get(text);
    const hex = workOutColour(v, S.palette, S.params, S.reg, 0, S.work);
    if (S.work.over) throw new Error(`layer ${S.clip}: its colour rules are too much to work out in one frame (more than ${COLOUR_BUDGET.work} rules, each clear.of counting as ${COLOUR_WEIGHT['clear.of']}: about 24 different clear.of at most): nest fewer colour rules or use fewer different ones`);
    if (!hex) throw new Error(`layer ${S.clip}: the colour rule "${String(v.rule).slice(0, 40)}" cannot be worked out (a slot it names is missing, or a rule inside it is not a colour rule); it would be drawn magenta`);
    const reads = slotsRead(v, S.palette);
    const material = reads.map((r) => S.palette[r]?.material).find(Boolean) ?? null;
    const key = `${hex}|${material}`;
    let id = S.synth.get(key) ?? null;
    if (!id) {
      const stem = /^[a-z][a-zA-Z0-9-]{0,31}$/.test(reads[0] ?? '') ? reads[0] : 'c';
      for (let n = 501; n < 100000 && !id; n++) if (!Object.hasOwn(S.palette, `${stem}-r${n}`)) id = `${stem}-r${n}`;
      if (!id) throw new Error(`layer ${S.clip}: too many colours from colour rules in one frame`);
      S.palette[id] = { hex, detail: false, material, derived: true, rule: String(v.rule).slice(0, 40) };
      S.synth.set(key, id);
    }
    S.seen.set(text, id);
    return id;
  };
  const out = { ...p };
  if (Object.hasOwn(p, 'paint')) out.paint = fix(p.paint);
  if (isObj(p.key)) out.key = Object.fromEntries(Object.entries(p.key).map(([k, v]) => [k, fix(v)]));
  if (Array.isArray(p.stops)) out.stops = p.stops.map(fix);
  if (p.kind === 'text' && Object.hasOwn(p, 'outline')) out.outline = fix(p.outline);
  for (const f of ['area', 'shape']) if (isObj(p[f])) out[f] = finishOwnPaints(p[f], S, depth + 1);
  return out;
}

/** True when a primitive still needs engine/resolve.js expandFrame: a piece (`use`), or a paint that is not a plain slot, tone, ink or clear (an engine/data-rules.js colour rule). */
function needsExpand(p) {
  if (!isObj(p) || p.kind === 'use' || p.when !== undefined) return true;
  const plain = (v) => v === undefined || typeof v === 'string';
  if (!plain(p.paint) || (p.kind === 'text' && !plain(p.outline))) return true;
  if (isObj(p.key) && !Object.values(p.key).every(plain)) return true;
  if (Array.isArray(p.stops) && !p.stops.every(plain)) return true;
  return isObj(p.area) || isObj(p.shape);
}

// ---- the layout -----------------------------------------------------------------------------------------------------

/**
 * One frame of a layers body (LAYOUTS in engine/data-sprite.js): the clip's layer, its items as the scene decides
 * (sceneItems: `when` with clip), each call told whether the layer wraps and stood on the outline its `on` names, run
 * through the registry; this module's colour rules worked out to slots; then pieces and engine/data-rules.js rules
 * (input.expand). Returns { list, palette }.
 */
function layout(input, ctx) {
  const layers = Array.isArray(input.body) ? input.body : [];
  const layer = layers.find((l) => isObj(l) && l.name === ctx.clip);
  const R = input.resolved;
  if (!layer) return { list: [], palette: R.palette };
  const reg = input.generators && typeof input.generators.expandList === 'function' && typeof input.generators.generator === 'function' ? input.generators : null;
  const entryOf = (c) => { try { return (reg ?? { generator: siteGenerator }).generator(c.gen, c.v) ?? null; } catch { return null; } };
  const warn = typeof input.warn === 'function' ? input.warn : () => {};
  // the outlines items draw, by id, across every layer (an item may stand on one drawn in an earlier layer)
  const outlines = new Map();
  for (const l of layers) for (const it of Array.isArray(l?.draw) ? l.draw : []) {
    const g = isObj(it) && typeof it.id === 'string' ? groundOf(it) : null;
    if (g && !outlines.has(it.id)) outlines.set(it.id, g);
  }
  const items = sceneItems(Array.isArray(layer.draw) ? layer.draw : [], { clip: ctx.clip, direction: null }).map((it) => {
    if (!isObj(it) || !Object.hasOwn(it, 'gen')) {
      if (isObj(it) && typeof it.on === 'string') { warn(`${it.kind ?? 'an item'} on "${it.on}": in a layer only a generator that takes a ground stands on an item; on is left out`); const { on, ...rest } = it; void on; return rest; }
      return it;
    }
    const e = entryOf(it);
    const call = { ...it };
    if (e?.wraps && e.args?.wrap && call.wrap === undefined) call.wrap = layer.wraps !== false;
    if (typeof call.on === 'string') {
      const g = outlines.get(call.on);
      if (g && e?.args?.ground) { if (call.ground === undefined) call.ground = g; }
      else warn(`${call.gen} on "${call.on}": ${g ? `${call.gen} does not stand on an outline` : `"${call.on}" draws no outline (a ridge or a swell)`}; on is left out`);
      delete call.on;
    }
    return call;
  });
  // before anything runs: a call's paints are copied into every primitive it gives (cost bounds how many), so a call
  // whose colour rules times its cost is past what a frame may read is refused here, before the copies are made
  for (const call of items) {
    if (!isObj(call) || !Object.hasOwn(call, 'gen')) continue;
    const nodes = ruleNodesIn(call);
    if (!nodes) continue;
    let cost = 1;
    try { const c = (reg ?? { checkCall: siteCheckCall }).checkCall(call); if (fin(c?.cost)) cost = Math.max(1, c.cost); } catch { cost = 1; }
    if (nodes * cost > COLOUR_BUDGET.walk * 4) throw new Error(`layer ${String(ctx.clip).slice(0, 24)}: ${String(call.gen).slice(0, 24)} copies ${nodes} parts of colour rules into up to ${cost} shapes, too much to read in one frame: nest fewer colour rules, or paint fewer things with a big one`);
  }
  const plainCtx = { t: ctx.t, frame: ctx.frame, frames: ctx.frames, loop: ctx.loop, size: [...ctx.size], clip: ctx.clip, direction: null };
  const r = (reg ?? { expandList: siteExpandList }).expandList(items, plainCtx);
  if (!r.ok) throw new Error(`layer ${ctx.clip}: ${r.errors.slice(0, 6).join('; ')}`);
  const S = { palette: Object.fromEntries(Object.entries(R.palette ?? {}).map(([k, v]) => [k, { ...v }])), params: R.params ?? {}, reg, synth: new Map(), seen: new Map(), walked: 0, work: { left: COLOUR_BUDGET.work }, clip: ctx.clip };
  const own = r.primitives.map((p) => finishOwnPaints(p, S));
  const mine = Object.fromEntries(Object.entries(S.palette).filter(([k]) => !Object.hasOwn(R.palette ?? {}, k)));
  // pieces and engine/data-rules.js rules (input.expand) only for the primitives that hold them: a fill's polygons,
  // painted with slots, are checked once (by the registry, above), not twice (section 4.2: a layer in 10 ms)
  const list = [];
  let palette = { ...R.palette }, run = [];
  const flush = () => { if (!run.length) return; const x = input.expand(run); list.push(...x.primitives); palette = { ...palette, ...x.palette }; run = []; };
  for (const p of own) {
    if (needsExpand(p)) run.push(p);
    else { flush(); list.push(p); }
  }
  flush();
  const out = { ...palette, ...mine };
  // a colour engine/resolve.js could not work out, read from its flag (lost: true on the palette entry), never from its
  // colour, so a palette's real magenta draws: an error naming the slot, never a silent magenta shape
  const lost = lostPaints(list, out);
  if (lost.length) {
    const { slot } = lost[0];
    // (kept short: engine/data-sprite.js keeps the first 300 characters of a layout's message, with its own prefix)
    throw new Error(`layer ${String(ctx.clip).slice(0, 24)}: colour "${slot.slice(0, 24)}" cannot be worked out (a slot it names is missing, or its derive names a framework colour rule such as sky.look); it would be drawn magenta`);
  }
  return { list, palette: out };
}

/**
 * layers@1: the layout of a background (docs/data-sprites.md 2.4, 4.3): each layer is a clip (back to front, as the
 * body lists them); the clip's layer is laid out from its draw list. Called as a plain generator it draws nothing.
 */
export const layers = defineGenerator({
  id: 'layers', v: 1, family: 'layout',
  about: 'Lays out a background: each layer is a clip, back to front, its generators told the layer wraps and stood on earlier outlines.',
  args: { draw: primitives({ default: [], about: 'A layer\'s draw list; the layout reads the whole body from engine/data-sprite.js' }) },
  cost: () => 0,
  run(input, ctx) {
    if (!isObj(input) || !isObj(input.resolved) || typeof input.expand !== 'function') return [];
    return layout(input, ctx);
  },
});

/** The generators of this module that work in frame pixels by design (engine/gen/index.js FRAME_GENERATORS), each with why: "<id>@<v>" -> reason (kept in engine/gen/backdrop-frame.js, which imports nothing, so loading this module first never trips over a half-loaded engine/gen/index.js). */
export { BACKDROP_FRAME_GENERATORS } from './backdrop-frame.js';
