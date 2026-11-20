// Shapes and paints the interface piece generators share (build item B13; engine/gen/ui-pieces.js draws with them).
// Nothing here is a generator: these are the pieces of engine/ui.js's drawing (its pixel-art round corners, cut
// corners, rings of a bevel), rewritten to RETURN PRIMITIVES (engine/draw-list.js) instead of painting a Surface.
//
//   roundRows(x, y, w, h, k)    the rows of a rectangle with pixel-art round corners (engine/ui.js roundRectIn)
//   cutRows(x, y, w, h, cut)    the rows of a rectangle with cut corners (engine/ui.js cutRectIn)
//   rowsArea(rows, fields)      those rows as primitives: one rect, or one staircase polygon whose corners lie on whole
//                               pixels, so it covers exactly those pixels (a pixel centre never lies on its edge);
//                               a tall shape in a few polygons (areaCount bounds how many)
//   spansArea(spans, fields)    any pixels given as spans per row, as rects (repeated spans merged down)
//   marksToStamps(marks, key)   single pixels (grain, specks, nails) as stamps of at most 32 x 32, never turned
//   toneOf(paint, tone)         a tone of a paint: "face" -> "face.dark"; a tone or a colour rule -> the ramp rule of it
//   mixOf(a, b, amount)         a colour rule mixing two paints (engine/data-rules.js `mix`)
//
// Pure: no surface, no clock, no randomness; runs the same in the browser and in Node.

/** The nine-slice border of a piece that fills its frame, in pixels from the frame edge (engine/ui.js SLICE). */
export const UI_SLICE = 8;
/** How far a panel's bevel reaches in from its left and bottom edges (engine/ui.js EDGE). */
export const UI_EDGE = 5;
/** The drop shadow's offset, down and to the left (engine/ui.js SHADOW). */
export const UI_SHADOW = 2;
/** How far a raised button travels when pressed (engine/ui.js LIP). */
export const UI_LIP = 2;
/** The states of an interface piece, the clips of a panel body by default (engine/ui.js BUTTON_STATES). */
export const UI_STATES = Object.freeze(['normal', 'hover', 'pressed', 'disabled']);
/** The style words a skin may name looks by (the `style` argument of every piece; the panel layout maps a word to the skin's arguments for it). */
export const UI_STYLES = Object.freeze(['plain', 'framed', 'carved', 'plank', 'stone', 'ornate', 'scroll', 'solid', 'outline', 'pill',
  // migration batch M8: the style words of the skin families (engine/gen/ui-skin.js; pieces/skin-*.v1.json)
  'jelly', 'striped', 'frosted', 'ice', 'rime', 'shard', 'temple', 'royal', 'ruin', 'vine', 'bark', 'bloom', 'tube', 'double', 'sign',
  'sheet', 'torn', 'card', 'segmented', 'slanted']);

// Pixels cut from each row of a corner, outermost row first: the quarter circles pixel artists use (engine/ui.js CUTS).
const CUTS = [[], [1], [2, 1], [3, 1, 1], [4, 2, 1, 1]];
const MAX_POINTS = 64;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The rows [[y, x0, x1], ...] (x1 inclusive) of a rectangle with pixel-art round corners k (0 to 4, reduced to fit), exactly roundRectIn's pixels. Arguments: x, y, w, h (whole pixels), k. */
export function roundRows(x, y, w, h, k) {
  if (!(w > 0 && h > 0)) return [];
  const kk = Math.max(0, Math.min(Math.round(fin(k) ? k : 0), 4, Math.floor((Math.min(w, h) - 1) / 2)));
  const cuts = CUTS[kk];
  const out = [];
  for (let iy = 0; iy < h; iy++) {
    const dy = Math.min(iy, h - 1 - iy), c = dy < cuts.length ? cuts[dy] : 0;
    if (x + c <= x + w - 1 - c) out.push([y + iy, x + c, x + w - 1 - c]);
  }
  return out;
}

/** The rows [[y, x0, x1], ...] of a rectangle whose corners are cut at 45 degrees, exactly cutRectIn's pixels. Arguments: x, y, w, h; cut (one number, or [top left, top right, bottom right, bottom left]). */
export function cutRows(x, y, w, h, cut = 0) {
  if (!(w > 0 && h > 0)) return [];
  const four = Array.isArray(cut) ? cut : [cut, cut, cut, cut];
  const [tl, tr, br, bl] = four.map((c) => Math.max(0, Math.round(fin(c) ? c : 0)));
  const out = [];
  for (let iy = 0; iy < h; iy++) {
    const ry = h - 1 - iy;
    const x0 = Math.max(tl - iy, bl - ry, 0), x1 = w - 1 - Math.max(tr - iy, br - ry, 0);
    if (x0 <= x1) out.push([y + iy, x + x0, x + x1]);
  }
  return out;
}

/** The span [x0, x1] of the row at y in a list of rows, or null. */
export function spanAt(rows, y) {
  for (const r of rows) if (r[0] === y) return [r[1], r[2]];
  return null;
}

/** Rows merged into runs of equal rows ({ y0, y1, x0, x1 }), in order. */
function runsOf(rows) {
  const runs = [];
  for (const [y, x0, x1] of rows) {
    const last = runs[runs.length - 1];
    if (last && last.y1 + 1 === y && last.x0 === x0 && last.x1 === x1) last.y1 = y;
    else runs.push({ y0: y, y1: y, x0, x1 });
  }
  return runs;
}

/** The outline of rows that touch one another as one staircase polygon (corners on whole pixels), or null when they do not join. */
function stairs(rows) {
  return outline(runsOf(rows));
}

/** The staircase polygon round runs that touch one another: { runs, pts }, or null when they do not join. */
function outline(runs) {
  for (let i = 1; i < runs.length; i++) {
    const a = runs[i - 1], b = runs[i];
    if (b.y0 !== a.y1 + 1 || b.x0 > a.x1 || a.x0 > b.x1) return null;
  }
  const pts = [];
  const push = (px, py) => {
    const n = pts.length;
    if (n && pts[n - 1][0] === px && pts[n - 1][1] === py) return;
    if (n >= 2) {
      const [ax, ay] = pts[n - 2], [bx, by] = pts[n - 1];
      if ((ax === bx && bx === px) || (ay === by && by === py)) pts.pop();
    }
    pts.push([px, py]);
  };
  for (const r of runs) { push(r.x1 + 1, r.y0); push(r.x1 + 1, r.y1 + 1); }
  for (let i = runs.length - 1; i >= 0; i--) { push(runs[i].x0, runs[i].y1 + 1); push(runs[i].x0, runs[i].y0); }
  // the closing corner may make the first point a middle one
  while (pts.length > 3) {
    const n = pts.length, [ax, ay] = pts[n - 1], [bx, by] = pts[0], [cx, cy] = pts[1];
    if ((ax === bx && bx === cx) || (ay === by && by === cy)) pts.shift(); else break;
  }
  return { runs, pts };
}

/** Runs of equal rows per staircase polygon when one outline would pass the polygon's points: 4 points a run at most. */
export const RUNS_PER_POLY = MAX_POINTS / 4;

/**
 * Rows of pixels as primitives that paint exactly those pixels: one rect when they make a rectangle, else one staircase
 * polygon (one body, so a shaded paint gets one shade band round the whole). When the outline would pass the polygon's
 * 64 points (a tall pill) the runs of equal rows go in polygons of RUNS_PER_POLY runs each, top to bottom, so n runs
 * give ceil(n / RUNS_PER_POLY) primitives (a cost bound: areaCount); rows that do not join give a rect per run.
 * Arguments: rows ([[y, x0, x1], ...] sorted by y), fields (copied onto each primitive: paint, shade, light, group ...).
 */
export function rowsArea(rows, fields = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const rect = (r) => ({ kind: 'rect', at: [r.x0, r.y0], size: [r.x1 - r.x0 + 1, r.y1 - r.y0 + 1], ...fields });
  const one = (runs) => {
    const s = outline(runs);
    if (!s) return runs.map(rect);
    if (s.runs.length === 1) return [rect(s.runs[0])];
    if (s.pts.length >= 3 && s.pts.length <= MAX_POINTS) return [{ kind: 'poly', points: s.pts, ...fields }];
    return null;
  };
  const runs = runsOf(rows);
  const whole = one(runs);
  if (whole) return whole;
  const out = [];
  for (let i = 0; i < runs.length; i += RUNS_PER_POLY) out.push(...(one(runs.slice(i, i + RUNS_PER_POLY)) ?? runs.slice(i, i + RUNS_PER_POLY).map(rect)));
  return out;
}

/** How many primitives rowsArea gives at most for a joined shape `h` rows tall (each row a run): a cost bound. Arguments: h. */
export function areaCount(h) {
  return Math.max(1, Math.ceil(Math.max(0, Math.round(fin(h) ? h : 0)) / RUNS_PER_POLY));
}

/**
 * Pixels given as spans, any number per row ([[y, x0, x1], ...]; single pixels are [y, x, x]), as rects that paint
 * exactly those pixels: spans that touch on a row are joined, and a span that repeats on the rows below it goes in one
 * rect. Arguments: spans, fields.
 */
export function spansArea(spans, fields = {}) {
  const open = new Map();   // "x0,x1" -> { y0, y1, x0, x1 }
  const out = [];
  const close = (r) => out.push({ kind: 'rect', at: [r.x0, r.y0], size: [r.x1 - r.x0 + 1, r.y1 - r.y0 + 1], ...fields });
  const byY = new Map();
  for (const [y, x0, x1] of spans) { if (!byY.has(y)) byY.set(y, []); byY.get(y).push([x0, x1]); }
  // spans that touch or overlap on a row are one span
  const merged = (list) => list.sort((a, b) => a[0] - b[0]).reduce((acc, [x0, x1]) => {
    const last = acc[acc.length - 1];
    if (last && x0 <= last[1] + 1) last[1] = Math.max(last[1], x1); else acc.push([x0, x1]);
    return acc;
  }, []);
  for (const y of [...byY.keys()].sort((a, b) => a - b)) {
    const here = new Set();
    for (const [x0, x1] of merged(byY.get(y))) {
      const k = `${x0},${x1}`;
      here.add(k);
      const r = open.get(k);
      if (r && r.y1 + 1 === y) r.y1 = y;
      else { if (r) close(r); open.set(k, { y0: y, y1: y, x0, x1 }); }
    }
    for (const [k, r] of open) if (!here.has(k)) { close(r); open.delete(k); }
  }
  for (const r of open.values()) close(r);
  return out.sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
}

/** A rectangle as one rect primitive (nothing when it is empty). Arguments: x, y, w, h, fields. */
export function rectArea(x, y, w, h, fields = {}) {
  return w > 0 && h > 0 ? [{ kind: 'rect', at: [x, y], size: [w, h], ...fields }] : [];
}

/**
 * Single pixels as stamps (at most 32 x 32 each, never turned): marks is a Map "x,y" -> a key character, key maps each
 * character to its paint. Stamps cover only the 32 x 32 tiles that hold a mark. Arguments: marks, key.
 */
export function marksToStamps(marks, key) {
  const tiles = new Map();
  for (const [k, ch] of marks) {
    const [x, y] = k.split(',').map(Number);
    const tx = Math.floor(x / 32), ty = Math.floor(y / 32), id = `${tx},${ty}`;
    if (!tiles.has(id)) tiles.set(id, []);
    tiles.get(id).push([x, y, ch]);
  }
  const out = [];
  for (const id of [...tiles.keys()].sort()) {
    const px = tiles.get(id);
    const x0 = Math.min(...px.map((p) => p[0])), y0 = Math.min(...px.map((p) => p[1]));
    const x1 = Math.max(...px.map((p) => p[0])), y1 = Math.max(...px.map((p) => p[1]));
    const grid = Array.from({ length: y1 - y0 + 1 }, () => Array(x1 - x0 + 1).fill('.'));
    for (const [x, y, ch] of px) grid[y - y0][x - x0] = ch;
    const used = new Set(px.map((p) => p[2]));
    out.push({ kind: 'stamp', at: [x0, y0], anchor: 'tl', rows: grid.map((r) => r.join('')), key: Object.fromEntries([...used].sort().map((c) => [c, key[c]])) });
  }
  return out;
}

/** The number of stamps marksToStamps can give for marks inside a w x h box at x, y: the 32 x 32 tiles it touches (a cost bound). */
export function stampTiles(x, y, w, h) {
  if (!(w > 0 && h > 0)) return 0;
  return (Math.floor((x + w - 1) / 32) - Math.floor(x / 32) + 1) * (Math.floor((y + h - 1) / 32) - Math.floor(y / 32) + 1);
}

/** A tone of a paint: a slot "face" gives "face.dark"; a tone, ink or a colour rule gives the ramp rule of it (engine/data-rules.js `ramp`). Arguments: paint, tone (light, base, dark, deep). */
export function toneOf(paint, tone) {
  if (typeof paint === 'string' && !paint.includes('.') && paint !== 'ink' && paint !== 'clear') return `${paint}.${tone}`;
  return { rule: 'ramp', of: isObj(paint) || typeof paint === 'string' ? paint : 'ink', tone };
}

/** A colour rule mixing two paints, amount 0 (all of a) to 1 (all of b): engine/data-rules.js `mix`. Arguments: a, b, amount. */
export function mixOf(a, b, amount) {
  return { rule: 'mix', of: a, with: b, amount: Math.min(1, Math.max(0, amount)) };
}

/** A colour rule giving a lighter (by above 0) or darker (below 0) tone of a paint: engine/data-rules.js `tone`. Arguments: paint, by (-3 to 3). */
export function shadeOf(paint, by) {
  return { rule: 'tone', of: paint, by: Math.min(3, Math.max(-3, by)) };
}
