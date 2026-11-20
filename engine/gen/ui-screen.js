// ui.screen@1 (family "ui"): the panel of a game's screens round a round (pause, results, game over, a new best), as
// the Gridline kit draws them (bundles/specs/kit-puzzle-gridline.md, `ui-gridline-panels`): a dark window in a lit
// frame, in three looks, with the things those screens carry. It is the look the code sprite's helpers drew (panel9
// "plain" with corner blocks, techPanel "plate", the neon tube, moreSkinHeading, and the kit's own runLight and
// bandBreak, which were never carried over), written from the specification and the reviewed renders, as primitives.
//
//   { "gen": "ui.screen", "v": 1, "at": [1, 1], "size": [94, 62], "look": "blocks", "border": 2, "title": true, "badge": "pause" }
//
// LOOKS. blocks: a square frame (ink, a band lit along the top and right, ink, a sunken face) with a small block
// (block.cell@1, 6 px) on every corner. plate: corners cut at 45 degrees, a light edge all round and a band darker on
// the left and bottom. tube: round corners, an ink line, a neon tube 1 to 3 px thick (a lighter core when 2 px or
// more) and a ring of its glow on the face, with no ink inside it. The three are the looks of ui.gridbox@1
// (engine/gen/ui-grid.js), ring for ring, so the kit's boxes and screens are one family.
// THINGS. title: a strip of the face's dark tone across the top of the face over a 1 px line of the frame colour.
// divide: a 1 px line of the frame colour down the face (labels left, numbers right). badge: a 13 px block with two
// bars in the top-left corner. fallen: the two top corner blocks lie beside the bottom ones. notch: a 5 px gap broken
// out of the top band, see-through, with the chip that came out lying under it. runner: a 3 px white light with a
// fading wake that runs once round the frame per loop. blink: the corner blocks turn to the reward colour in turn.
//
// MEASURES (measureScreen; ui-pieces.js UI_MEASURES names it). The text areas (the flat face, two when divided, then
// the title strip) hold one colour each: they keep clear of the corner blocks, the badge, the chip and the divider.
// The slice is the frame's reach plus whatever must not stretch (the badge, the title, the numbers column, the break).
//
// Pure: no surface, no clock; runs the same in the browser and in Node.
import { defineGenerator } from './registry.js';
import { point, count, share, px, word, flag, paint } from './args.js';
import { roundRows, cutRows, spansArea, rectArea } from './ui-shapes.js';
import { toneOf, mixOf } from './pixels.js';

/** The looks ui.screen@1 draws: blocks (a square bevel with corner blocks), plate (cut corners, a lit edge), tube (a neon tube). */
export const SCREEN_LOOKS = Object.freeze(['blocks', 'plate', 'tube']);

const CELL = 6;        // a corner block
const BADGE = 13;      // the badge, in the top-left corner block's place
const NOTCH = 12;      // the break's left column, counted from the right edge
const GAP = 5;         // the break's width
const START = 24;      // where the running light is at t = 0, in pixels clockwise from the top-left corner
const HEAD = 3;        // the light's head
const WAKE = 5;        // the pixels that fade behind it
const MIN_SLICE = 7;   // the least a side keeps, from the panel's own edge (8 from a frame it fills but a 1 px border)

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(fin(v) ? v : lo)));
const flat = (p) => ({ paint: p, shade: 0 });
const meet = (a, b) => { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }; };

/** The 4-neighbour erosion of rows of one span each: the pixels one step deeper inside. */
function erode(rows) {
  const at = new Map(rows.map((r) => [r[0], r]));
  const out = [];
  for (const [y, x0, x1] of rows) {
    const up = at.get(y - 1), dn = at.get(y + 1);
    if (!up || !dn) continue;
    const a = Math.max(x0 + 1, up[1], dn[1]), b = Math.min(x1 - 1, up[2], dn[2]);
    if (a <= b) out.push([y, a, b]);
  }
  return out;
}

/** How deep pixel (i, j) of a w x h rectangle with round corners k lies (1: its outline), counted by 4-neighbour steps, up to 8. */
function roundDepth(w, h, k, i, j) {
  let ring = roundRows(0, 0, w, h, k), d = 0;
  while (d < 8 && ring.some(([y, x0, x1]) => y === j && i >= x0 && i <= x1)) { d++; ring = erode(ring); }
  return d;
}

/**
 * Everything a screen panel works out without drawing: its box, band and corner, how deep its frame reaches, the
 * title strip, the divider, the break, and from them the text areas and the slice (box-relative).
 */
function screenGeom(a) {
  const x = Math.floor(a.at[0]), y = Math.floor(a.at[1]), w = Math.round(a.size[0]), h = Math.round(a.size[1]);
  const look = a.look, b = clampI(a.border, 1, 3), blocks = look === 'blocks';
  const c = blocks ? 0 : clampI(a.corner, 0, 4);
  const reach = 2 + b;                                           // rows of frame from the edge: ink and band (and the ink or gap beside it)
  // the flat inner: the face's rectangle, set in until its corners are face (a cut or round corner reaches further in)
  let ins = 2 + b;
  if (look === 'plate') ins = Math.max(ins, Math.ceil((c + 2 + b) / 2));
  if (look === 'tube') while (2 * ins < Math.min(w, h) && roundDepth(w, h, c, ins, ins) < 3 + b) ins++;
  const well = { x: x + ins, y: y + 2 + b, w: w - 2 * ins, h: h - 2 * (2 + b) };   // where a title and a divider may lie
  let inner = { x: x + ins, y: y + ins, w: w - 2 * ins, h: h - 2 * ins };
  if (blocks) inner = { x: inner.x, y: inner.y + 1, w: inner.w - 1, h: inner.h - 1 };   // the sunken line along the top and right
  const box = { x, y, w, h };
  const keep = blocks ? { x: x + CELL, y: y + CELL, w: w - 2 * CELL, h: h - 2 * CELL } : box;

  let title = null, top = inner.y;
  const rows = clampI(a.titleRows, 6, 24);
  if (a.title && well.h >= rows + 8 && well.w >= 8) {
    title = { x: well.x, y: well.y, w: well.w, h: rows, line: well.y + rows };
    top = Math.max(top, title.line + 1);
  }
  let main = meet({ x: inner.x, y: top, w: inner.w, h: inner.y + inner.h - top }, keep);

  let notch = null;
  if (a.notch && w >= 2 * NOTCH + 8 && h >= reach + 14) {
    const gapRows = 1 + b;                                       // the outline and the band; the ink under them is the break's floor (a tube gets one)
    const cx = x + w - NOTCH, cy = y + gapRows + 2;
    notch = { c0: cx, rows: gapRows, floor: y + gapRows, chip: { x: cx, y: cy }, bottom: cy + 5 };
  }
  if (notch && main.y < notch.bottom) main = { ...main, y: notch.bottom, h: Math.max(0, main.y + main.h - notch.bottom) };

  const badge = a.badge === 'pause' && w >= 2 * BADGE && h >= 2 * BADGE ? { x, y, w: BADGE, h: BADGE } : null;
  if (badge && main.y < y + BADGE && main.x < x + BADGE) main = { ...main, y: y + BADGE, h: Math.max(0, main.y + main.h - y - BADGE) };

  let divider = null, areas = [main];
  if (a.divide > 0 && a.divide < 1 && main.w >= 12) {
    const dx = main.x + Math.max(4, Math.min(main.w - 5, Math.round(inner.w * a.divide)));
    divider = { x: dx, y: title ? title.line + 1 : well.y, h: well.y + well.h - (title ? title.line + 1 : well.y) };
    areas = [{ ...main, w: dx - main.x }, { ...main, x: dx + 1, w: main.x + main.w - dx - 1 }];
  }
  let strip = null;
  if (title) {
    strip = { x: title.x, y: title.y, w: title.w, h: title.h };
    if (blocks) strip = meet(strip, { x: x + CELL, y, w: w - 2 * CELL, h });
    if (badge && strip.x < x + BADGE) strip = { ...strip, x: x + BADGE, w: Math.max(0, strip.x + strip.w - x - BADGE) };
  }

  // the slice, from the panel's own edges
  const side = Math.max(MIN_SLICE, ins + (blocks ? 1 : 0));
  const s = { left: side, top: side, right: side, bottom: side };
  if (title) s.top = Math.max(s.top, title.line + 1 - y);
  if (divider) s.right = Math.max(s.right, x + w - divider.x);
  if (notch) { s.right = Math.max(s.right, NOTCH + 1); s.top = Math.max(s.top, notch.bottom - y); }
  if (blocks && a.fallen) { s.left = Math.max(s.left, 2 * CELL); s.right = Math.max(s.right, 2 * CELL); }
  if (badge) { s.left = Math.max(s.left, BADGE); s.top = Math.max(s.top, BADGE); }
  s.left = Math.min(s.left, Math.max(1, w - s.right - 2)); s.top = Math.min(s.top, Math.max(1, h - s.bottom - 2));

  const mid = y + (h >> 1);
  const edge = blocks ? { x: x + w - 2, y: mid } : { x: x + 1, y: mid };
  return { x, y, w, h, b, c, look, blocks, reach, well, inner, title, strip, divider, notch, badge, areas, slice: s, edge };
}

// classes of the pixel map, each one paint
const K = { none: 0, ink: 1, light: 2, base: 3, dark: 4, face: 5, faceDark: 6, halo: 7, line: 8, shine: 9, wake1: 10, wake2: 11, chipLight: 12, chipBase: 13, chipInk: 14 };
const FACE = new Set([K.face, K.faceDark]);
const BAND = new Set([K.light, K.base, K.dark]);

/** The class of every pixel of the panel: an Int8Array w * h (row by row from the box's top-left pixel). */
function screenMap(a, G, t) {
  const { x, y, w, h, b, look } = G;
  const m = new Int8Array(w * h);
  const get = (px, py) => (px < x || py < y || px >= x + w || py >= y + h ? 0 : m[(py - y) * w + (px - x)]);
  const set = (px, py, k) => { if (px >= x && py >= y && px < x + w && py < y + h) m[(py - y) * w + (px - x)] = k; };

  // the frame, ring by ring from the outline in: depth 1 is the outline
  const depth = new Int8Array(w * h);
  let ring = look === 'plate' ? cutRows(x, y, w, h, G.c) : roundRows(x, y, w, h, look === 'tube' ? G.c : 0);
  const deepest = G.reach + 1;
  for (let d = 1; d <= deepest && ring.length; d++) {
    for (const [ry, x0, x1] of ring) for (let px = x0; px <= x1; px++) depth[(ry - y) * w + (px - x)] = d;
    ring = erode(ring);
  }
  const dAt = (px, py) => (px < x || py < y || px >= x + w || py >= y + h ? 0 : depth[(py - y) * w + (px - x)]);
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
    const d = dAt(px, py);
    if (!d) continue;
    let k;
    if (look === 'tube') {
      if (d === 1) k = K.ink;
      else if (d <= 1 + b) k = d === 3 ? K.light : K.base;
      else if (d === 2 + b) k = K.halo;
      else k = K.face;
    } else if (look === 'plate') {
      if (d === 1 || d === 2 + b) k = K.ink;
      else if (d === 2) k = K.light;
      else if (d <= 1 + b) k = d === 3 && dAt(px - 1, py + 1) <= 2 ? K.dark : K.base;
      else k = K.face;
    } else {
      if (d === 1 || d === 2 + b) k = K.ink;
      else if (d <= 1 + b) k = b === 1 || d > 2 ? K.base : py === y + 1 ? K.light : py === y + h - 2 ? K.dark : px === x + 1 ? K.dark : K.light;
      else k = (py === y + 2 + b || px === x + w - 3 - b) ? K.faceDark : K.face;
    }
    set(px, py, k);
  }

  if (G.title) {
    const T = G.title;
    for (let px = T.x; px < T.x + T.w; px++) {
      for (let py = T.y; py < T.y + T.h; py++) if (FACE.has(get(px, py))) set(px, py, K.faceDark);
      if (FACE.has(get(px, T.line))) set(px, T.line, K.line);
    }
  }
  if (G.divider) for (let py = G.divider.y; py < G.divider.y + G.divider.h; py++) if (FACE.has(get(G.divider.x, py))) set(G.divider.x, py, K.line);

  if (G.notch) {
    const N = G.notch;
    for (let px = N.c0 - 1; px <= N.c0 + GAP + 1; px++) if (get(px, N.floor)) set(px, N.floor, K.ink);
    for (let r = 0; r < N.rows; r++) {
      const from = N.c0 + (r % 2);                               // jagged: every other row breaks one pixel farther right
      for (let i = 0; i < GAP; i++) set(from + i, y + r, K.none);
      for (const px of [from - 1, from + GAP]) if (get(px, y + r)) set(px, y + r, K.ink);
    }
    // the chip: a 2 px sliver of the band lying tilted on the face, inked
    const chip = [];
    for (let i = 0; i < 4; i++) chip.push([N.chip.x + i, N.chip.y + i, K.chipLight], [N.chip.x + i + 1, N.chip.y + i, K.chipBase]);
    const on = new Set(chip.map(([px, py]) => `${px},${py}`));
    for (const [px, py] of chip) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!on.has(`${px + dx},${py + dy}`) && FACE.has(get(px + dx, py + dy))) set(px + dx, py + dy, K.chipInk);
    for (const [px, py, k] of chip) if (FACE.has(get(px, py)) || get(px, py) === K.chipInk) set(px, py, k);
  }

  if (a.runner) {
    const L = 2 * (w + h), head = (Math.floor((t % 1) * L) + START) % L;
    // the pixels of the frame at step s round the box, clockwise from the top-left corner, from the edge inwards
    const across = (s, fn) => {
      const q = ((s % L) + L) % L;
      for (let d = 0; d < G.reach; d++) {
        if (q < w) fn(x + q, y + d);
        else if (q < w + h) fn(x + w - 1 - d, y + q - w);
        else if (q < 2 * w + h) fn(x + w - 1 - (q - w - h), y + h - 1 - d);
        else fn(x + d, y + h - 1 - (q - 2 * w - h));
      }
    };
    for (let i = WAKE; i >= 1; i--) across(head - i, (px, py) => { if (BAND.has(get(px, py))) set(px, py, i <= 2 ? K.wake1 : K.wake2); });
    for (let i = 0; i < HEAD; i++) across(head + i, (px, py) => { const k = get(px, py); if (k && !FACE.has(k)) set(px, py, K.shine); });
  }
  return m;
}

/** The corner blocks of the blocks look: [{ x, y, lit }] (lit: the one that takes the reward colour now). */
function cornerCells(a, G, t) {
  if (!G.blocks || G.w < 4 * CELL || G.h < 2 * CELL) return [];
  const { x, y, w, h } = G, r = x + w - CELL, low = y + h - CELL;
  if (a.fallen) return [{ x, y: low }, { x: x + CELL - 1, y: low }, { x: r - CELL + 1, y: low }, { x: r, y: low }];
  const lit = a.blink ? Math.floor((t % 1) * 4) % 4 : -1;       // clockwise from the top left
  const all = [{ x, y }, { x: r, y }, { x: r, y: low }, { x, y: low }].map((p, i) => ({ ...p, lit: i === lit }));
  return G.badge ? all.slice(1) : all;
}

const cellCall = (at, size, colour, ink) => ({ gen: 'block.cell', v: 1, at, size, style: 'bevel', edge: 1, symbol: 'none', paint: colour, shine: 'clear', ink });

/**
 * ui.screen@1: a game screen's panel filling the rectangle `size` at `at` (its ink outline included), in one of three
 * looks (SCREEN_LOOKS), with a title strip, a divider, a pause badge, fallen corner blocks, a break in the top band,
 * a running light and blinking corner blocks, each switched on by its argument (see the top of this file). `corner`
 * shapes the plate's cut and the tube's round corners (the blocks look is square); `border` is the band's width.
 * The light and the blink follow the clip phase and close in a loop. Arguments: at, size, look, corner, border, title,
 * titleRows, divide, badge, fallen, notch, runner, blink, face, frame, accent, reward, shine, ink.
 */
export const uiScreen = defineGenerator({
  id: 'ui.screen', v: 1, family: 'ui',
  about: 'A game screen\'s panel: a dark window in a lit frame (corner blocks, a cut plate or a neon tube) with an optional title strip, divider, pause badge, broken band, running light and blinking corners.',
  args: {
    at: point({ default: [0, 0], about: 'The top left corner of the rectangle it fills, in frame pixels' }),
    size: point({ lo: 24, hi: 640, about: 'The width and height of the rectangle it fills, its ink outline included' }),
    look: word([...SCREEN_LOOKS], { default: 'blocks', about: 'blocks (a square bevel with a block on each corner), plate (cut corners, a lit edge) or tube (a neon tube)' }),
    corner: px(0, 4, { default: 2, about: 'The plate\'s cut or the tube\'s round corner in pixels, 0 to 4 (rounded); the blocks look is square' }),
    border: px(1, 3, { default: 2, about: 'Width of the frame band in pixels, 1 to 3 (rounded)' }),
    title: flag({ default: false, about: 'A strip of the face\'s dark tone across the top of the face, over a 1 px line of the frame colour, with its own text area' }),
    titleRows: count(6, 24, { default: 10, about: 'The title strip\'s height' }),
    divide: share({ default: 0, about: 'A 1 px line of the frame colour down the face, this share of the way across (0: none); two text areas' }),
    badge: word(['none', 'pause'], { default: 'none', about: 'A 13 px block in the top-left corner with two bars cut into its face' }),
    fallen: flag({ default: false, about: 'Blocks look: the two top corner blocks lie beside the bottom ones' }),
    notch: flag({ default: false, about: 'A 5 px gap broken out of the top band near the right, see-through, with the chip lying under it' }),
    runner: flag({ default: false, about: 'A 3 px white light with a fading wake that runs once round the frame per loop' }),
    blink: flag({ default: false, about: 'Blocks look: the corner blocks turn to the reward colour one after another, clockwise, once per loop' }),
    face: paint({ default: 'face', about: 'The flat middle' }),
    frame: paint({ default: 'frame', about: 'The frame band, the title\'s line and the divider' }),
    accent: paint({ default: 'frame', about: 'The corner blocks, and the badge in the blocks look' }),
    reward: paint({ default: 'frame', about: 'What a blinking corner block turns to' }),
    shine: paint({ default: 'frame', about: 'The running light: a light slot such as "shine"' }),
    ink: paint({ default: 'ink', about: 'The outline' }),
  },
  cost: (a, { costOf }) => 480 + 6 * Math.max(1, costOf(cellCall([0, 0], BADGE, a.accent, a.ink))),
  run(a, ctx, { call }) {
    const G = screenGeom(a);
    const { x, y, w, h } = G;
    const m = screenMap(a, G, ctx.t);
    const light = toneOf(a.frame, 'light');
    const paints = {
      [K.ink]: a.ink, [K.light]: light, [K.base]: a.frame, [K.dark]: toneOf(a.frame, 'dark'), [K.face]: a.face, [K.faceDark]: toneOf(a.face, 'dark'),
      [K.halo]: mixOf(a.face, a.frame, 0.35), [K.line]: a.frame, [K.shine]: a.shine, [K.wake1]: mixOf(a.shine, light, 1 / 3), [K.wake2]: mixOf(a.shine, light, 2 / 3),
      [K.chipLight]: light, [K.chipBase]: a.frame, [K.chipInk]: a.ink,
    };
    // the face first as whole rows, then every other class over it: far fewer rects than a face cut round each mark
    const spans = new Map();
    for (let j = 0; j < h; j++) {
      let from = 0;
      for (let i = 1; i <= w; i++) {
        if (i < w && m[j * w + i] === m[j * w + from]) continue;
        const k = m[j * w + from];
        if (k) { if (!spans.has(k)) spans.set(k, []); spans.get(k).push([y + j, x + from, x + i - 1]); }
        from = i;
      }
    }
    const out = [];
    for (const k of [...spans.keys()].sort((p, q) => p - q)) out.push(...spansArea(spans.get(k), flat(paints[k])));
    const placed = (px, py) => Math.abs(px) <= 640 && Math.abs(py) <= 640;   // where a cell may be placed
    for (const c of cornerCells(a, G, ctx.t)) if (placed(c.x, c.y)) out.push(...call(cellCall([c.x, c.y], CELL, c.lit ? a.reward : a.accent, a.ink), ctx));
    if (G.badge && placed(x, y)) {
      out.push(...call(cellCall([x, y], BADGE, G.blocks ? a.accent : a.frame, a.ink), ctx));
      out.push(...rectArea(x + 2, y + 2, 3, BADGE - 4, flat(a.ink)), ...rectArea(x + BADGE - 5, y + 2, 3, BADGE - 4, flat(a.ink)));
    }
    return out;
  },
});

/**
 * The slice and the text areas of a ui.screen@1 call (Contract 8), in frame pixels: { slice, textArea }. The text area
 * is one rectangle, or a list (the face, or its two halves when divided, then the title strip), each with `edge`, a
 * pixel of the frame band. The slice is measured from the frame when the panel fills it but a 1 px border, else from
 * the panel's own `rect`. Arguments: a (the call's arguments, defaults filled), ctx ({ size }).
 */
export function measureScreen(a, ctx) {
  const G = screenGeom(a);
  const { x, y, w, h } = G, s = G.slice, size = Array.isArray(ctx?.size) ? ctx.size : [0, 0];
  const fills = x <= 1 && y <= 1 && x + w >= size[0] - 1 && y + h >= size[1] - 1;
  const slice = fills
    ? { left: s.left + x, top: s.top + y, right: s.right + size[0] - (x + w), bottom: s.bottom + size[1] - (y + h) }
    : { rect: { x, y, w, h }, ...s };
  const areas = [...G.areas, ...(G.strip ? [G.strip] : [])].filter((r) => r.w > 0 && r.h > 0).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, edge: { ...G.edge } }));
  return { slice, textArea: areas.length === 1 ? areas[0] : areas };
}
