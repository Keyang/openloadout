// Block generators (family "block"): the cell a falling-block puzzle is built from, in five finishes, with a symbol
// and a shine, and the landing preview. The look of the Gridline kit (bundles/specs/kit-puzzle-gridline.md: what the
// specification's blockCell and ghostCell of "engine/blocks.js" drew; that module was never carried over, so these are
// written from the specification and the reviewed renders, the default bevel pixel for pixel). Every Gridline sprite
// that shows a block (the block skins, the emblem, the piece box, the panels' corner blocks, the gauge, the buddy, the
// backdrop's stacks) names block.cell@1 with its own size and paint; the four colour schemes are the pieces
// pieces/part-block-<scheme>.v1.json, which call it with the scheme's seven colours.
//
//   { "gen": "block.cell", "v": 1, "at": [0, 0], "size": 16, "style": "bevel", "edge": 2, "symbol": "none", "paint": "body", "shine": "clear" }
//   { "gen": "block.ghost", "v": 1, "at": [0, 0], "size": 16, "style": "line", "paint": "glow" }
//
// Both return stamps (whole pixels, never turned) keyed to the call's own paint refs; a cell draws its own ink line, so
// no outline op is needed after it. `at` is the square's top-left pixel.
import { defineGenerator } from './registry.js';
import { point, count, paint, word, share } from './args.js';
import { Pixels, rampOf, toneOf, colourOf, workCost } from './pixels.js';

/** The finishes block.cell@1 draws: bevel (a lit band), gem (four facets), glass (a lit rim and a streak), pillow (cut corners), frame (a ring round a dark middle). */
export const BLOCK_STYLES = Object.freeze(['bevel', 'gem', 'glass', 'pillow', 'frame']);

/** The symbols block.cell@1 draws in a cell's middle: one for each of seven colour slots, in order, then the junk cell's cross. */
export const BLOCK_SYMBOLS = Object.freeze(['disc', 'ring', 'plus', 'diamond', 'bar', 'triangle', 'square', 'cross']);

/** The lines block.ghost@1 draws: a solid line or dashes (2 px on, 2 off). */
export const GHOST_STYLES = Object.freeze(['line', 'dash']);

// a lighter or darker tone of a paint ref, as the tone colour rule
const toned = (ref, by) => ({ rule: 'tone', of: colourOf(ref), by });
// whichever of two paints stands out more against a third (engine/color.js pick)
const clearest = (against, a, b) => ({ rule: 'standOut', against: colourOf(against), from: [colourOf(a), colourOf(b)] });

/** True where symbol `name`, s px across, covers pixel (i, j) of its own s x s box (t: its line's thickness). */
function symbolAt(name, s, i, j) {
  const t = Math.max(1, Math.round(s / 6)), h = s / 2, u = i + 0.5 - h, v = j + 0.5 - h;
  switch (name) {
    case 'disc': return u * u + v * v <= h * h;
    case 'ring': return u * u + v * v <= h * h && u * u + v * v > (h - t) * (h - t);
    case 'plus': return Math.abs(u) < t || Math.abs(v) < t;
    case 'diamond': return Math.abs(u) + Math.abs(v) <= h && Math.abs(u) + Math.abs(v) > h - 2 * t;
    case 'bar': return Math.abs(v) < t;
    case 'triangle': return Math.abs(u) < Math.min(h, Math.ceil((j + 1) / 2));
    case 'square': return Math.max(Math.abs(u), Math.abs(v)) > h - t;
    case 'cross': return Math.abs(i - j) < t || Math.abs(i + j - (s - 1)) < t;
    default: return false;
  }
}

/**
 * block.cell@1: one cell filling the square `size` px a side whose top-left pixel is `at`: a 1 px `ink` line on all
 * four sides, then the finish in the ramp of `paint`. bevel: a band `edge` px wide, light on the top and right, dark
 * on the bottom and left, round a flat face. gem: four facets (top light, sides base, bottom dark) meeting at a
 * lighter centre square 2 x edge px across. glass: a lighter face, a pale 1 px rim `edge` px in and a pale diagonal
 * streak from the top right (its symbol is the colour's deepest dark, never the rim's tone, and the streak stops 1 px
 * short of the symbol's box). pillow: corners cut by `edge` px, a light patch at the top right, a dark line along the
 * bottom and left. frame: a ring `edge` px wide round a dark middle. `symbol` draws one of BLOCK_SYMBOLS in the
 * middle (6 px at a 16 px cell) in the tone that stands out more; `shine` (a paint; clear for none) a 5 px L in the
 * top-right corner. Small cells take a thinner edge and a smaller symbol. Arguments: at, size, style, edge, symbol,
 * paint, shine, ink.
 */
export const blockCell = defineGenerator({
  id: 'block.cell', v: 1, family: 'block',
  about: 'One cell of a falling-block puzzle filling a square: an ink line, then a bevel, gem, glass, pillow or frame finish in one colour, with a symbol and a shine.',
  args: {
    at: point({ default: [0, 0], about: 'The top-left pixel of the square' }),
    size: count(6, 32, { default: 16, about: 'The square\'s side in pixels' }),
    style: word(BLOCK_STYLES, { default: 'bevel', about: 'The finish' }),
    edge: count(1, 3, { default: 2, about: 'The bevel band, the gem\'s centre, the glass rim, the pillow\'s cut, the frame\'s ring' }),
    symbol: word(['none', ...BLOCK_SYMBOLS], { default: 'none', about: 'A symbol in the middle (none: a plain cell)' }),
    paint: paint({ about: 'The cell\'s colour (its ramp gives the tones)' }),
    shine: paint({ default: 'clear', about: 'The white L in the top-right corner: a light slot such as "shine" (clear: none)' }),
    ink: paint({ default: 'ink', about: 'The line round the cell' }),
  },
  cost: (a) => 1 + workCost(a.size * a.size * 16),
  run(a) {
    const N = a.size, n = N - 2, x0 = Math.floor(a.at[0]), y0 = Math.floor(a.at[1]);
    const e = Math.min(a.edge, Math.max(1, Math.floor(n / 4)));
    const g = new Pixels(x0, y0, N, N);
    const R = rampOf(a.paint), pale = toned(R.light, 1), mid = (n - 1) / 2;
    let face = R.base, mark = clearest(a.paint, R.light, R.dark), lift = 0;
    const at = (i, j) => {                                      // the paint of interior pixel (i, j), 0..n-1 each way
      const dt = j, dl = i, dr = n - 1 - i, db = n - 1 - j, m = Math.min(dt, dl, dr, db);
      if (a.style === 'gem') {
        if (Math.abs(i - mid) < e && Math.abs(j - mid) < e) return face;
        return dt === m ? R.light : db === m ? R.dark : R.base;
      }
      if (a.style === 'glass') return m < e - 1 ? R.base : m === e - 1 ? pale : face;
      if (a.style === 'frame') return m < e ? R.base : face;
      if (a.style === 'pillow') {
        if (dl + dt < e || dr + dt < e || dl + db < e || dr + db < e) return a.ink;
        if (dr + dt <= e + 1) return R.light;
        if (dl === 0 || db === 0 || dl + db === e || (dl + dt === e && dt > 0) || (dr + db === e && dr > 0)) return R.dark;
        return R.base;
      }
      if (m >= e) return face;                                  // bevel
      return dt === m ? R.light : db === m || dl === m ? R.dark : R.light;
    };
    if (a.style === 'gem') { face = toned(a.paint, 0.4); mark = clearest(a.paint, pale, R.deep); }
    else if (a.style === 'glass') { face = toned(a.paint, 0.3); mark = toned(R.deep, -1); }   // never the rim's pale tone: the deepest dark, 3:1 or more on the lighter face
    else if (a.style === 'frame') { face = R.dark; mark = R.light; }
    else if (a.style === 'pillow') lift = Math.ceil(e / 2);
    g.rect(x0, y0, N, N, a.ink);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.set(x0 + 1 + i, y0 + 1 + j, at(i, j));
    const s = a.symbol === 'none' ? 0 : Math.min(n - 2, 2 * Math.max(1, Math.floor((N * 3) / 16 + 0.25))), o = (N - s) / 2;
    if (a.style === 'glass') {                                  // the streak: 2 px wide, down and left from the face's top-right corner,
      const f = n - 2 * e, len = Math.floor(f * 0.3 + 0.5);     // stopping 1 px short of the symbol's box (none of it on a face the box fills)
      const near = (x, y) => s > 0 && x >= x0 + o - 1 && x <= x0 + o + s && y >= y0 + o - 1 && y <= y0 + o + s;
      for (let k = 0; k < len; k++) for (const d of [0, 1]) {
        const x = x0 + 1 + e + f - 1 - k - d, y = y0 + 1 + e + k;
        if (f - 1 - k - d >= 0 && !near(x, y)) g.set(x, y, pale);
      }
    }
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (symbolAt(a.symbol, s, i, j)) g.set(x0 + o + i, y0 + o + j, mark);
    if (a.shine !== 'clear') {                                  // the L: along the top, then down the right side
      const arm = N >= 12 ? 3 : 2, cx = x0 + N - 2 - lift, cy = y0 + 1 + lift;
      for (let k = 0; k < arm; k++) { g.set(cx - k, cy, a.shine); g.set(cx, cy + k, a.shine); }
    }
    return g.stamps();
  },
});

/**
 * block.ghost@1: the landing preview of a falling piece, one cell: an `ink` line along the edge of the square `size`
 * px a side whose top-left pixel is `at`, a 1 px line of `paint` inside it, and the middle left see-through. style
 * line is a solid line; dash is 2 px on and 2 off along each side (an entry square). Arguments: at, size, style,
 * paint, ink (clear: no ink line).
 */
export const blockGhost = defineGenerator({
  id: 'block.ghost', v: 1, family: 'block',
  about: 'The landing preview of a falling block: an ink line, a line of light inside it (solid or dashed) and an empty middle.',
  args: {
    at: point({ default: [0, 0], about: 'The top-left pixel of the square' }),
    size: count(6, 32, { default: 16, about: 'The square\'s side in pixels' }),
    style: word(GHOST_STYLES, { default: 'line', about: 'A solid line or dashes' }),
    paint: paint({ about: 'The line of light' }),
    ink: paint({ default: 'ink', about: 'The line round it (clear: none)' }),
  },
  cost: (a) => 1 + workCost(a.size * 16),
  run(a) {
    const N = a.size, x0 = Math.floor(a.at[0]), y0 = Math.floor(a.at[1]);
    const g = new Pixels(x0, y0, N, N);
    const on = (k) => a.style === 'line' || k % 4 < 2;
    for (let k = 0; k < N; k++) {
      if (a.ink !== 'clear') for (const [x, y] of [[k, 0], [k, N - 1], [0, k], [N - 1, k]]) g.set(x0 + x, y0 + y, a.ink);
      if (k < 1 || k > N - 2 || !on(k - 1)) continue;
      for (const [x, y] of [[k, 1], [k, N - 2], [1, k], [N - 2, k]]) g.set(x0 + x, y0 + y, a.paint);
    }
    return g.stamps();
  },
});

/** The pieces block.rim@1 draws: the left and right walls, the floor under the field, its two corners, and the caps on top of the walls. */
export const RIM_PIECES = Object.freeze(['l', 'r', 'floor', 'floor-l', 'floor-r', 'cap-l', 'cap-r']);

/** The walls block.rim@1 draws: tube (a round pipe with rings), plate (a flat bar with seams and rivets), dotted (a dark band of dots). */
export const RIM_STYLES = Object.freeze(['tube', 'plate', 'dotted']);

/**
 * block.rim@1: one piece of the wall round a falling-block field, in the square tile `size` px a side whose top-left
 * pixel is `at`. The wall lies on the field side of its tile and is `edge` px across; the rest stays see-through.
 * From the outside in: an `ink` line, the body (edge - 4 px, never less than 1) in the ramp of `paint`, an ink line,
 * a 1 px line of `lit`, and an ink line against the field (left out at edge 4). tube: a round pipe, lit toward the
 * field, with raised rings, a quarter-round corner and a cap with its outer corner cut. plate: a flat bar, dark on the
 * outside and light toward the field, with seams and rivets and square corners. dotted: a dark band with dots of the
 * wall's colour. `texture` sets how many marks: none, then one, two and four to the tile (rings and dots), or a seam,
 * then rivets, then twice as many (plate); marks come round every tile, so a wall of one piece shows no seam. Pieces:
 * l and r (walls, on the right and left of their tiles), floor (along the top of its tile), floor-l and floor-r (the
 * corners under the walls), cap-l and cap-r (the wall's end, `edge` px tall, on top of a wall). The look "wellRim" of
 * the Gridline specification drew (bundles/specs/kit-puzzle-gridline.md), from its reviewed renders. Arguments: at,
 * size, piece, style, edge, texture, paint, lit, ink.
 */
export const blockRim = defineGenerator({
  id: 'block.rim', v: 1, family: 'block',
  about: 'One piece of the wall round a falling-block field: a tube, plate or dotted band with a line of light, on the field side of its tile (walls, floor, corners, caps).',
  args: {
    at: point({ default: [0, 0], about: 'The top-left pixel of the tile' }),
    size: count(12, 32, { default: 16, about: 'The tile\'s side in pixels' }),
    piece: word(RIM_PIECES, { default: 'l', about: 'Which piece: a wall, the floor, a corner or a cap' }),
    style: word(RIM_STYLES, { default: 'tube', about: 'The wall' }),
    edge: count(4, 10, { default: 6, about: 'The wall\'s width from the field side' }),
    texture: share({ default: 0.5, about: 'How many marks: rings on a tube, seams and rivets on a plate, dots on a dotted band' }),
    paint: paint({ about: 'The wall\'s colour (its ramp gives the tones)' }),
    lit: paint({ about: 'The line of light along the field side' }),
    ink: paint({ default: 'ink', about: 'The lines round the body and the light' }),
  },
  cost: (a) => 1 + workCost(a.size * a.size * 16),
  run(a) {
    const N = a.size, E = a.edge, B = Math.max(1, E - 4), x0 = Math.floor(a.at[0]), y0 = Math.floor(a.at[1]);
    const g = new Pixels(x0, y0, N, N), R = rampOf(a.paint), t = a.texture;
    const level = t < 0.15 ? 0 : t < 0.4 ? 1 : t < 0.8 ? 2 : 3;        // how busy: none, sparse, some, many
    const period = [0, N, Math.floor(N / 2), Math.floor(N / 4)][level];
    // the body's paint i px in from its outer side (0..B-1), s px along the wall (null: a corner, where no mark lies)
    const body = (i, s) => {
      if (a.style === 'dotted') {
        const lo = Math.floor((B - 2) / 2), across = B === 1 ? i === 0 : i >= Math.max(0, lo) && i <= Math.max(0, lo) + 1;
        const p = level === 0 ? N : period, q = Math.floor(p / 2);       // plain still shows one dot a tile
        const along = s !== null && (level === 0 ? s % N === Math.floor(N / 2) - 1 : (s % p) - (q - 1) >= 0 && (s % p) - (q - 1) < 2);
        return across && along ? R.base : R.dark;
      }
      if (a.style === 'plate') {
        const flat = B >= 2 && i === 0 ? R.dark : B >= 3 && i === B - 1 ? R.light : R.base;
        if (s === null || level === 0) return flat;
        const sp = level === 3 ? Math.floor(N / 2) : N, m = s % sp;                  // a seam: a lit line, then a dark one
        if (m === Math.floor(sp / 2) - 1) return R.light;
        if (m === Math.floor(sp / 2)) return R.dark;
        const mid = Math.floor((B - 1) / 2), r8 = s % Math.floor(N / 2);  // rivets: a dark pixel and a lit one in the body's middle
        const rivet = (k) => (level === 3 ? r8 === 1 + k || r8 === Math.floor(N / 2) - 3 + k : m === 2 + k || m === sp - 4 + k);
        if (level >= 2 && i === mid && rivet(0)) return B === 1 ? R.dark : R.deep;          // its head, then its lit lip
        if (level >= 2 && i === mid && rivet(1)) return R.light;
        return flat;
      }
      const round = B === 1 ? R.base : i === 0 && B >= 3 ? R.dark : (B >= 5 ? i >= B - 3 && i <= B - 2 : i === B - 1) ? R.light : R.base;
      if (s === null || level === 0) return round;                       // tube rings: a lit line, then a dark one, round the pipe
      const m = s % period, h = Math.floor(period / 2);
      return m === h - 1 ? R.light : m === h ? R.dark : round;
    };
    // the paint d px in from the wall's outer side (0..E-1), s px along it
    const across = (d, s) => (d === 0 || d === B + 1 || d === B + 3 ? a.ink : d === B + 2 ? a.lit : body(d - 1, s));
    const flip = a.piece.endsWith('-r') || a.piece === 'r', kind = a.piece === 'l' || a.piece === 'r' ? 'wall' : a.piece.startsWith('cap') ? 'cap' : 'floor';
    const put = (x, y, ref) => g.set(x0 + (flip ? N - 1 - x : x), y0 + y, ref);   // drawn as the left-hand piece, mirrored for the right
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - (N - E), dy = E - 1 - y;                           // px in from the wall's outer (left) side, and from the floor's outer (bottom) side
      if (kind === 'wall') { if (dx >= 0) put(x, y, across(dx, y)); continue; }
      if (a.piece === 'floor') { if (dy >= 0) put(x, y, across(dy, x)); continue; }
      if (kind === 'floor') {                                           // a corner: the wall comes down its right side and turns into the floor
        if (dx < 0 || dy < 0) continue;
        let d = Math.min(dx, dy);
        if (a.style === 'tube') d = Math.round(E - 1 - (Math.hypot(N - x - 0.5, y + 0.5) - 0.5));
        if (d >= 0) put(x, y, across(Math.min(d, E - 1), null));
        continue;
      }
      const top = y - (N - E);                                          // a cap: the wall's end, closed by an ink line
      if (dx < 0 || top < 0) continue;
      if (top === 0) { if (!(a.style === 'tube' && dx === 0)) put(x, y, a.ink); continue; }
      put(x, y, across(dx, top >= 2 ? y : null));
    }
    return g.stamps();
  },
});

/**
 * block.cell@2: block.cell@1's cell, drawn by the same code, that may also be 4 or 5 px a side: the small cells an
 * interface piece lays on its frame band (the junk gauge's two end cells). At 6 px and more it draws exactly what
 * version 1 draws; a 4 px cell is the ink line round two light pixels over two dark ones. Arguments: as block.cell@1.
 */
export const blockCell2 = defineGenerator({
  id: 'block.cell', v: 2, family: 'block',
  about: 'One cell of a falling-block puzzle filling a square, as block.cell@1 draws it, that may also be as small as 4 px: a cell laid on an interface frame.',
  args: { ...blockCell.args, size: count(4, 32, { default: 16, about: 'The square\'s side in pixels, 4 at the least' }) },
  cost: (a) => 1 + workCost(a.size * a.size * 16),
  run: (a, ctx) => blockCell.run(a, ctx),
});
