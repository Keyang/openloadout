// Badge icon generators (migration batch M4b; docs/data-sprites.md 3.3, family "icon"): what the library map marks
// (sprites/icons-map) still did in code once their pictures are data.
//   icon.badge@1  a map mark fitted to its box as engine/icons.js iconFit fits one: its picture alone (tidied and
//                 inked), or set on a badge pin: a big round head of the marker colour round a plate of the badge colour,
//                 on a point (engine/icons-badge-stem.js iconBadgeStem), tidied and inked, with the picture on the plate,
//                 either icon bodies drawn with a pen of their own centred on the plate and searched until they fill it
//                 without leaving it, tidied and inked (engine/icons-badge.js iconBadge), or hand-set pixel layers
//                 (stamps) laid on the plate's middle and inked (the code sprite's badgeGlyph).
// Its pin is drawn by icon.body@1 and icon.rim@1 (engine/gen/icon-sets.js) through a pen of its own, as are the
// picture's bodies: the picture lists icon.body, icon.rim, icon.line and icon.glint calls (never plain shapes) and, on a
// pin, may be stamps instead. A rim with `over` (and a glint) paints only where the picture is already painted, as in
// icon.fitted@1. Name it as an icon set's body `fit`: each picture's list becomes its `draw`.
//
//   "fit": { "gen": "icon.badge", "v": 1, "pin": { "from": "style", "pick": { "picture": false, "badge": true } },
//     "size": { "from": "size", "map": [[0, 0], [1, 1]] }, "tip": { "from": "size", "map": [[0, 7.8], [0.5, 11.5], [1, 11.5]] },
//     "paint": "body", "face": "face", "shiny": { "from": "shine", "pick": { "true": true, "false": false } },
//     "grow": { "from": "bold", "pick": { "true": 0.5, "false": 0 } }, "pinGrow": { "from": "bold", "pick": { "true": 0.15, "false": 0 } }, "draw": [] }
//
// Pure: no randomness, no clock; Node and browser.
import { defineGenerator } from './registry.js';
import { point, px, share, flag, paint, primitives } from './args.js';
import { Pixels, tidied, tilesFor, workCost, unclipped } from './pixels.js';
import { ellipseIn } from '../surface.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, worst) => (fin(v) ? v : worst);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** How many times icon.badge@1 draws its pin while it searches for the scale (engine/icons.js iconFit). */
export const BADGE_PASSES = 6;
/** How many times it draws the plate's picture while it searches for the picture's scale (engine/icons-badge.js iconBadge). */
export const BADGE_PICTURE_PASSES = 8;
/** The most the picture's search scales it up from its first try (engine/icons-badge.js has no such bound; no picture of the library's comes near it). */
export const BADGE_PICTURE_GROWTH = 2;
/** The pin's head and plate in the pen's units (engine/icons-badge-stem.js): the head's middle and radius, and the plate's radius with the default ring of 1.8. */
const HEAD = Object.freeze({ x: 0, y: -2.6, r: 9 });

/** The pen generators a badge's picture may list (each gets the picture's pen). */
export const BADGE_PICTURE_GENERATORS = Object.freeze(['icon.body', 'icon.rim', 'icon.line', 'icon.glint']);
const ANCHORS = { tl: [0, 0], tc: [0.5, 0], tr: [1, 0], cl: [0, 0.5], c: [0.5, 0.5], cr: [1, 0.5], bl: [0, 1], bc: [0.5, 1], br: [1, 1] };

/** Puts primitives (stamps and dots, as the pen generators return them) on a grid in order; with over, only on painted pixels. */
function put(g, prims, over) {
  for (const p of prims) {
    if (!isObj(p)) continue;
    if (p.kind === 'dot') { if (!over || g.has(p.at[0], p.at[1])) g.set(p.at[0], p.at[1], p.paint); continue; }
    if (p.kind !== 'stamp' || !Array.isArray(p.rows) || !isObj(p.key)) continue;
    const w = Math.max(0, ...p.rows.map((r) => r.length)), h = p.rows.length;
    const [ax, ay] = ANCHORS[p.anchor ?? 'tl'] ?? [0, 0];
    const x0 = Math.round(p.at[0] - ax * w), y0 = Math.round(p.at[1] - ay * h);
    p.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ' || !Object.hasOwn(p.key, ch)) continue;
        if (!over || g.has(x0 + i, y0 + j)) g.set(x0 + i, y0 + j, p.key[ch]);
      }
    });
  }
}

/** engine/surface.js outline on a grid: every empty pixel beside a painted one (left, right, up, down) takes the ink. Changes the grid. */
function inked(g, ink) {
  const hits = [];
  for (let y = g.y0; y < g.y0 + g.h; y++) for (let x = g.x0; x < g.x0 + g.w; x++) {
    if (g.has(x, y)) continue;
    if (g.has(x - 1, y) || g.has(x + 1, y) || g.has(x, y - 1) || g.has(x, y + 1)) hits.push([x, y]);
  }
  for (const [x, y] of hits) g.set(x, y, ink);
  return g;
}

/** Every painted pixel of src laid over g (engine/surface.js blit of a layer of the same box). */
function over(g, src) {
  for (let y = src.y0; y < src.y0 + src.h; y++) for (let x = src.x0; x < src.x0 + src.w; x++) { const c = src.get(x, y); if (c !== null) g.set(x, y, c); }
}

/** True when an item of a picture paints only over what is painted: an icon.glint (unless over is false), or any call with over. */
const overOnly = (item) => (item.over === undefined ? item.gen === 'icon.glint' : item.over === true);

/** The picture's calls with a pen (and the picture's grow on its bodies and rims, unless they say their own). */
function withPen(item, pen, grow) {
  const own = item.grow !== undefined || item.bold !== undefined;
  return { ...item, ...pen, ...((item.gen === 'icon.body' || item.gen === 'icon.rim') && !own && grow > 0 ? { grow } : {}) };
}

/** The picture set on the plate (engine/icons-badge.js iconBadge, fill and margin as its defaults): searched, tidied, inked, laid on g. */
function pictureOn(g, a, ctx, call, k) {
  const [cx, cy] = a.centre;
  const pcx = cx + k * HEAD.x, pcy = cy + k * HEAD.y;
  const R = Math.max(1, (HEAD.r - a.ring) * k - a.margin), hole = ellipseIn(pcx, pcy, R, R);
  const want = 2 * R * a.fill;
  // the picture's middle column on a pixel's middle (the code's arrow head, moved by its own pen's offset)
  const at = [a.snap ? Math.floor(pcx) + 0.5 : pcx, pcy];
  const draw = (scale) => {
    const s = g.blank(), pen = { centre: at, scale: Math.min(4, Math.max(0.1, scale)), turn: 0, soften: a.soften, shiny: a.shiny };
    for (const item of a.draw) if (isObj(item) && BADGE_PICTURE_GENERATORS.includes(item.gen)) put(s, call(withPen(item, pen, a.pinGrow), ctx), overOnly(item));
    tidied(s);
    return inked(s, a.ink);
  };
  const first = want / 23;
  let scale = first, best = null;
  for (let pass = 0; pass < BADGE_PICTURE_PASSES; pass++) {
    const s = draw(scale), b = s.bounds();
    if (!b) return;
    const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    let inside = true;
    for (let y = b.y0; y <= b.y1 && inside; y++) for (let x = b.x0; x <= b.x1; x++) if (s.has(x, y) && !hole(x + 0.5, y + 0.5)) { inside = false; break; }
    if (inside && (!best || side > best.side)) best = { s, side };
    if (inside && side >= want - 0.5) break;
    // (never past twice the first try: a picture that fills the plate stops long before, one that cannot is a speck)
    scale = Math.min(BADGE_PICTURE_GROWTH * first, scale * (inside ? Math.min(1.25, (want + 0.5) / side) : 0.88));
  }
  if (!best) {
    // nothing fitted: the last try, cut to the plate, so the badge is never empty
    const s = draw(scale);
    for (let y = s.y0; y < s.y0 + s.h; y++) for (let x = s.x0; x < s.x0 + s.w; x++) if (!hole(x + 0.5, y + 0.5)) s.set(x, y, null);
    best = { s };
  }
  over(g, best.s);
}

/** The hand-set layers laid with the top left of their widest and tallest on the plate's middle, inked, laid on g (the code sprite's badgeGlyph). */
function glyphOn(g, a, k) {
  const [cx, cy] = a.centre;
  const stamps = stampsOf(a.draw);
  const w = Math.max(0, ...stamps.map((p) => Math.max(0, ...p.rows.map((r) => r.length)))), h = Math.max(0, ...stamps.map((p) => p.rows.length));
  const x0 = Math.round(cx + k * HEAD.x - w / 2), y0 = Math.round(cy + k * HEAD.y - h / 2);
  const u = g.blank();
  put(u, stamps.map((p) => ({ ...p, at: [x0, y0], anchor: 'tl' })), false);
  over(g, inked(u, a.ink));
}

/** The stamps of a list (a pin's hand-set layers). */
const stampsOf = (list) => (Array.isArray(list) ? list : []).filter((p) => isObj(p) && p.kind === 'stamp' && Array.isArray(p.rows) && isObj(p.key));

/** The whole mark once at a scale: its picture alone, tidied and inked; or the pin, tidied and inked, then its picture or its layers on the plate. */
function badgeAt(a, ctx, call, scale) {
  const [cx, cy] = a.centre, R = a.room;
  const g = new Pixels(Math.floor(cx - R / 2), Math.floor(cy - R / 2), R, R);
  const k = Math.min(4, Math.max(0.1, scale));
  const pen = { centre: [cx, cy], scale: k, turn: 0, soften: a.soften, shiny: a.shiny };
  if (!a.pin) {
    for (const item of a.draw) if (isObj(item) && BADGE_PICTURE_GENERATORS.includes(item.gen)) put(g, call(withPen(item, pen, a.grow), ctx), overOnly(item));
    tidied(g);
    return inked(g, a.ink);
  }
  const plate = { kind: 'ellipse', at: [HEAD.x, HEAD.y], r: [HEAD.r - a.ring, HEAD.r - a.ring], paint: a.face };
  // the pin keeps its regular weight whatever the picture's grow (iconBadgeStem with the icon's plain pen)
  put(g, call({ gen: 'icon.body', v: 1, shapes: [{ kind: 'ellipse', at: [HEAD.x, HEAD.y], r: [HEAD.r, HEAD.r], paint: a.paint }, { kind: 'poly', points: [[-5.2, 4.2], [5.2, 4.2], [0, a.tip]], paint: a.paint }], paint: a.paint, soft: 0, ...pen }, ctx), false);
  put(g, call({ gen: 'icon.rim', v: 1, shapes: [plate], paint: a.ink, ...pen }, ctx), true);
  put(g, call({ gen: 'icon.body', v: 1, shapes: [plate], paint: a.face, flat: true, ...pen }, ctx), false);
  tidied(g);
  inked(g, a.ink);
  if (stampsOf(a.draw).length) glyphOn(g, a, k);
  else pictureOn(g, a, ctx, call, k);
  return g;
}

/** The longer side asked for at this size (engine/icons.js iconFit: span by Size, times fill, at least 4). */
const wantOf = (a) => Math.max(4, Math.round((a.span[0] + (a.span[1] - a.span[0]) * clamp01(a.size)) * a.fitFill));

function badgeRun(a, ctx, call) {
  // nothing to draw (an icon set's picture that is drawn some other way): nothing, not an empty pin
  if (!(Array.isArray(a.draw) && a.draw.some(isObj))) return [];
  const want = wantOf(a), [cx, cy] = a.centre;
  let scale = (want - 2) / 22, best = null, lo = 0, hi = Infinity;
  for (let pass = 0; pass < BADGE_PASSES; pass++) {
    const g = badgeAt(a, ctx, call, scale), b = g.bounds();
    if (!b) return [];
    const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    if (!best || Math.abs(side - want) < Math.abs(best.side - want) || (Math.abs(side - want) === Math.abs(best.side - want) && side < best.side)) best = { g, b, side };
    if (side === want) break;
    if (side < want) lo = Math.max(lo, scale); else hi = Math.min(hi, scale);
    scale = lo > 0 && hi < Infinity ? (lo + hi) / 2 : (scale * (want - 1.5)) / (side - 1.5);
  }
  const { g, b } = best;
  const dx = Math.floor(cx - (b.x1 - b.x0 + 1) / 2) - b.x0, dy = Math.floor(cy - (b.y1 - b.y0 + 1) / 2) - b.y0;
  return g.stamps().map((s) => ({ ...s, at: [s.at[0] + dx, s.at[1] + dy] }));
}

/** The work of one draw of a grid `side` square (tidy, ink, bounds, the copy and the inside test), in shape tests. */
const gridWork = (side) => 12 * side * side;

/**
 * icon.badge@1: a map mark as the library map marks drew one (engine/icons.js iconFit round the picture alone, or round
 * engine/icons-badge-stem.js iconBadgeStem and then engine/icons-badge.js iconBadge or hand-set layers), centred on
 * `centre`, its longer side round((span[0] + (span[1] - span[0]) * size) * fitFill) pixels. Alone (`pin` off): `draw`,
 * pen generators' calls written about 23 units across, grown by `grow`, tidied and inked. On a pin: the pin's head of
 * `paint` round a plate of `face` on a point ending `tip` units below the middle, tidied and inked, and on the plate
 * `draw`: pen generators' calls grown by `pinGrow`, searched until they fill `fill` of the plate without leaving it,
 * tidied and inked; or, when it holds stamps, those laid on the plate's middle and inked. An empty `draw` draws nothing
 * (a plain shape in it is not drawn: on a pin, the pin alone).
 * Returns stamps.
 */
export const iconBadge = defineGenerator({
  id: 'icon.badge', v: 1, family: 'icon',
  about: 'A map mark fitted to its box: a picture alone, or on a badge pin (a big round head round a plate, on a point) as a small picture or hand-set pixels (port of engine/icons-badge.js).',
  args: {
    draw: primitives({ about: 'The picture: icon.body, icon.rim, icon.line and icon.glint calls written about 23 units across; on a pin, or stamps laid on the plate\'s middle (their at is not read)' }),
    pin: flag({ default: true, about: 'On a badge pin (off: the picture alone)' }),
    paint: paint({ default: 'clear', about: 'The pin' }),
    face: paint({ default: 'clear', about: 'The plate' }),
    ink: paint({ default: 'ink', about: 'The ink lines round the pin and round the picture' }),
    centre: point({ default: [16, 16], about: 'The middle of the box it is centred in (the frame\'s middle)' }),
    size: share({ default: 0.5, about: 'Small to Big: the longer side from span[0] to span[1] pixels' }),
    span: point({ default: [20, 26], lo: 4, hi: 64, about: 'The longer side at Small and at Big, ink line included' }),
    fitFill: share({ default: 1, about: 'A share of that size' }),
    tip: px(6.5, 11.5, { default: 11.5, about: 'Where the pin\'s point ends, in units below the middle (the head\'s bottom is 6.4)' }),
    ring: px(0.5, 6, { default: 1.8, about: 'The pin\'s ring round the plate, in units' }),
    fill: share({ default: 0.86, about: 'The share of the plate\'s width the picture fills' }),
    margin: px(0, 4, { default: 1, about: 'Pixels kept clear inside the plate\'s edge' }),
    grow: px(0, 2, { default: 0, about: 'Pixels added round every body of the picture alone (Bold: half a pixel)' }),
    pinGrow: px(0, 2, { default: 0, about: 'Pixels added round every body of the picture on a pin (Bold there: 0.15)' }),
    snap: flag({ default: false, about: 'On a pin, the picture\'s middle column on a pixel\'s middle (an arrow head with a one-pixel tip)' }),
    soften: flag({ default: false, about: 'The second, softer shadow tone' }),
    shiny: flag({ default: true, about: 'Highlight bands and glints (Shine)' }),
    room: px(4, 90, { default: 32, about: 'The side of the square round centre it draws in: the frame (32), as iconFit drew in it' }),
  },
  cost: (a, { costOf }) => {
    const R = Math.ceil(num(a.room, 90)), spanMax = Math.max(num(a.span?.[0], 64), num(a.span?.[1], 64)) * num(a.fitFill, 1);
    const k = Math.min(4, Math.max(0.1, spanMax / 18)), kIn = Math.min(4, Math.max(0.1, ((2 * (HEAD.r - num(a.ring, 0.5)) * k * num(a.fill, 1)) / 23) * BADGE_PICTURE_GROWTH));   // the picture's largest scale
    const pen = (scale) => ({ centre: [16, 16], scale, turn: 0 });
    const pin = costOf({ gen: 'icon.body', v: 1, shapes: [{ kind: 'ellipse', at: [0, -2.6], r: [9, 9], paint: 'clear' }, { kind: 'poly', points: [[-5.2, 4.2], [5.2, 4.2], [0, 11.5]], paint: 'clear' }], paint: 'clear', ...pen(k) })
      + 2 * costOf({ gen: 'icon.body', v: 1, shapes: [{ kind: 'ellipse', at: [0, -2.6], r: [7.2, 7.2], paint: 'clear' }], paint: 'clear', ...pen(k) });
    const items = (Array.isArray(a.draw) ? a.draw : []).filter((x) => isObj(x) && BADGE_PICTURE_GENERATORS.includes(x.gen));
    const grown = (x, g, scale) => Math.max(1, costOf({ ...x, ...pen(scale), ...(x.gen === 'icon.body' || x.gen === 'icon.rim' ? { grow: Math.max(num(x.grow, 0), num(g, 2)) } : {}) }));
    const picture = items.reduce((n, x) => n + grown(x, a.pinGrow, kIn), 0), alone = items.reduce((n, x) => n + grown(x, a.grow, k), 0);
    const stampPx = (Array.isArray(a.draw) ? a.draw : []).reduce((n, p) => n + (isObj(p) && Array.isArray(p.rows) ? p.rows.reduce((m, r) => m + String(r).length, 0) : 0), 0);
    // alone: the picture and the grid's work a pass; on a pin (or not yet known): the pin and the picture's own search, or the layers
    const onPin = pin + workCost(gridWork(R)) + BADGE_PICTURE_PASSES * (picture + workCost(gridWork(R))) + workCost(stampPx + gridWork(R));
    const pass = Math.max(alone + workCost(gridWork(R)), a.pin === false ? 0 : onPin);
    return tilesFor(R, R) + BADGE_PASSES * pass;
  },
  run: (a, ctx, { call }) => unclipped((b, c) => badgeRun(b, c, call), a, ctx, a.centre, (b, dx, dy) => ({ ...b, centre: [b.centre[0] + dx, b.centre[1] + dy] })),
});
