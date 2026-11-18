// The tile helper (docs/style-guide.md, sections 6 and 14). Describe a material once
// (what the inside looks like, what each edge looks like) and get every piece of a block:
// the 13 tiles of section 6, the thin platform, the slopes. Pieces made from one material
// join each other with no seam in every arrangement a block allows, because every pixel is
// worked out from where it is in the world (texture repeats every 32 px) and how far it is
// from the outline (edges continue from tile to tile).
//
// Worked examples: sprites/tiles-forest.js (side view: block, ledge, slopes, decals) and
// tests/fixtures/quality/sprite-files/q-room-tiles.js (top-down: floor, path, wall with a face, pit).
// Look at the result with `node tools/tilemap.mjs <id>`.
//
//   import { blockClips, thinClips, slopeClips, decoClips, drawTile, patternFill, scatter } from '../engine/tiles.js';
//
//   const DIPS = [0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0];   // the top line, per column
//   function ground(p) {                                  // one material, from the sprite's controls
//     const soil = ramp(p.soil), grass = ramp(p.grass);
//     return {
//       fill: patternFill(p.soil, (s) => scatter(7, 4).forEach((m) => s.rect(m.x, m.y, 2, 1, soil.dark))),   // the inside
//       top: {                                            // the top edge: a grass cap
//         depth: p.edge,                                  // px of cap under the ink line
//         inset: (u) => (p.lumpy ? DIPS[u] : 0),          // how far the outline is pulled in at column u (0 to 3)
//         ragged: (u) => (u % 5 < 2 ? 1 : 0),             // how much shorter the cap is at u
//         paint: (d, u, t, here) => (d === 1 ? grass.light : d === here ? grass.dark : grass.base),
//         wrap: 4, tuck: true,                            // hangs 4 px down the side at a top corner; carries on into an inner corner
//       },
//       bottom: { depth: 2, paint: () => soil.dark },     // the underside, in shade; the sides are bare (ink only)
//     };
//   }
//   clips: { ...blockClips('grass', { narrow: true, fills: 3 }), ...thinClips('grass'), ...slopeClips('grass'), ...decoClips('grass', ['above', 'on']) },
//   render(g, { clip, t, p }) { if (!drawTile(g, clip, ground(p), t)) drawMyDecal(g, clip, p); }
//
// A material:
//   fill(x, y, t, v)  required. The colour inside, for x, y in 0..31 (patternFill makes one from a drawing).
//                     v is the fill version (0, or 1, 2 for 'fill-b', 'fill-c'): give versions different marks, all
//                     kept off the outer 3 px. It may depend on nothing else, or tiles stop joining. Draw marks in
//                     textureTone(colour) (the ramp's dark): softer tones vanish under the whole-bundle looks
//   top, bottom, side (or left and right)    edges, each { depth, inset, ragged, paint, wrap, tuck }, all optional:
//       depth            px of band inside the ink line (0: only the ink line)
//       inset(u, t)      0..3: how far the outline is pulled in at position u along the edge (u is x for
//                        top and bottom, y for the sides; 0..31). The helper pins it to 0 at both ends of
//                        the edge, so write a profile that is 0 there and for much of its length, with dips:
//                        one that sits at 1 or 2 everywhere shows a nub at every tile join
//       ragged(u, t)     px the band is shorter at u (a ragged inner edge)
//       paint(d, u, t, depthHere)   colour of the band d px inside the ink line (1 = the first px), or null
//                        to show the fill there. depthHere is how deep the band is at this u
//       wrap             px the band hangs further along the neighbouring side at an outer corner
//       tuck             how the band ends at an inner corner. Left out: the two bands meet in a mitre and the
//                        corner pixel is outline (right for a rim that is the same on every side). true: the band
//                        carries on into the corner tile as a triangle, and the corner pixel is the band's: use this
//                        for a cap that only the top edge has, and always with slopes (a slope's band then runs on
//                        through the corner tile under its foot, and its line has no nub). A number of px makes the
//                        triangle smaller, at the cost of a pinch where two slope tiles meet corner to corner
//   ink               colour of the outline; INK when left out; null for no line at all. Floor laid on floor
//                     (a path on grass) takes the material's own dark tone here
//   round             0..3: how much each outer corner is cut
//   face              top-down walls only: { paint(x, y, t), base, shadow }. The three bottom pieces then
//                     become the wall's front face: one tile of face, a base line on row 29, and two rows
//                     of `shadow` (a colour, or leave out for see-through). inner-bl and inner-br are then
//                     drawn like the side pieces: the cap's edge runs on beside the face.
//                     Walls may be one tile thick. One tile wide (north to south) needs the narrow pieces col-t,
//                     col-m (cap) and col-b (face). One tile deep (west to east: strip-l, strip-m, strip-r, single)
//                     has no row for the cap, so those pieces are the face under an 8 px sliver of cap: such a wall
//                     reads lower than one two tiles deep. Use two rows where a wall should look full height
//   outside(x, y, t)  paints what is outside the outline (the bank round a hole) instead of leaving it see-through
//
// Pieces. The 13 of style guide section 6 cover ground two tiles thick or more. blockClips(prefix, { narrow: true })
// adds seven for ground one tile thick (strip-l, strip-m, strip-r; col-t, col-m, col-b; single), drawn from the same
// material; { fills: 3 } adds fill-b and fill-c, other versions of the fill that a level mixes by position.
// Decals: decoClips says where each goes ('on', 'above', 'below'); stand 'above' decals where the top line is level.
//
// Animated blocks: blockClips(prefix, { frames: 8, fps }) and use t in fill, inset or paint.
//
// Which piece goes in which cell is decided in one place, for the sample-map tool, the playground and anyone
// laying out a level: classifyTiles (what a tileset has), pickPiece / pickClip / pickThin / pickStack (one cell),
// layoutTiles (a whole grid of letters). They are pure functions over names and grids: no canvas, no Node.
//
// Everything here is pure and repeatable: no Math.random(), no state between calls.

import { Surface } from './surface.js';
import { INK, ramp, mix, col } from './color.js';
import { THEME_PRESETS, applyColour } from './theme.js';
import { hash, rng, TAU } from './motion.js';

export const TILE = 32;
const M = TILE - 1;
const FAR = 1e9;
const wrap = (v) => ((Math.floor(v) % TILE) + TILE) % TILE;
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

// ---- names ------------------------------------------------------------------------

/** The 13 pieces of a block, in the layout of style guide section 6 (three rows of three, then the inner corners). */
export const BLOCK_PIECES = ['left', 'top', 'right', 'side-l', 'fill', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br'];

/**
 * The seven narrow pieces a block may add, for ground one tile thick: a strip (one tile high: 'strip-l', 'strip-m',
 * 'strip-r'), a column (one tile wide: 'col-t', 'col-m', 'col-b') and a tile on its own ('single').
 */
export const NARROW_PIECES = ['strip-l', 'strip-m', 'strip-r', 'col-t', 'col-m', 'col-b', 'single'];

const PIECE_LABELS = {
  'strip-l': 'strip, left end', 'strip-m': 'strip, middle', 'strip-r': 'strip, right end',
  'col-t': 'column, top', 'col-m': 'column, middle', 'col-b': 'column, bottom', single: 'single tile',
  left: 'top left corner', top: 'top', right: 'top right corner',
  'side-l': 'left side', fill: 'middle', 'side-r': 'right side',
  'bottom-l': 'bottom left corner', bottom: 'bottom', 'bottom-r': 'bottom right corner',
  'inner-tl': 'inside corner, top left', 'inner-tr': 'inside corner, top right',
  'inner-bl': 'inside corner, bottom left', 'inner-br': 'inside corner, bottom right',
};
const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const entry = (o, label, extra = {}) => ({ frames: o.frames ?? 1, fps: o.fps ?? 6, loop: true, label, ...extra });

/**
 * The clip entries of a block: { '<prefix>-left': { frames, fps, loop, label }, ... }, the 13 pieces of section 6.
 * opts.frames (default 1; an animated block gives every piece the same count), opts.fps (number or (p) => number),
 * opts.label (the word shown before each piece, default the prefix), opts.kind ('ground' | 'wall' | 'hole': kept on
 * each entry as `block`; see blockKind), opts.narrow (true: also the seven NARROW_PIECES, so the block can be one
 * tile thick), opts.fills (2 or 3: also '<prefix>-fill-b', '-fill-c', other versions of the fill that the picker
 * mixes in by position so a field of fill does not repeat every 32 px).
 */
export function blockClips(prefix, opts = {}) {
  const word = opts.label ?? title(prefix);
  const extra = opts.kind ? { block: opts.kind } : {};
  const out = {};
  for (const p of BLOCK_PIECES) {
    out[`${prefix}-${p}`] = entry(opts, `${word}: ${PIECE_LABELS[p]}`, extra);
    if (p === 'fill') for (let i = 1; i < Math.min(26, opts.fills ?? 1); i++) out[`${prefix}-fill-${String.fromCharCode(97 + i)}`] = entry(opts, `${word}: middle, version ${String.fromCharCode(65 + i)}`, extra);
  }
  if (opts.narrow) for (const p of NARROW_PIECES) out[`${prefix}-${p}`] = entry(opts, `${word}: ${PIECE_LABELS[p]}`, extra);
  return out;
}
/** The three pieces of a thin platform: '<prefix>-thin-l', '-thin-m' (repeats sideways), '-thin-r'. */
export function thinClips(prefix, opts = {}) {
  const word = opts.label ?? `${title(prefix)} platform`;
  return Object.fromEntries([['l', 'left end'], ['m', 'middle'], ['r', 'right end']].map(([k, l]) => [`${prefix}-thin-${k}`, entry(opts, `${word}: ${l}`)]));
}
/** The two 45 degree slopes: '<prefix>-slope-up' rises to the right, '-slope-down' falls to the right. */
export function slopeClips(prefix, opts = {}) {
  const word = opts.label ?? title(prefix);
  return { [`${prefix}-slope-up`]: entry(opts, `${word}: slope up`), [`${prefix}-slope-down`]: entry(opts, `${word}: slope down`) };
}
/**
 * Decal clips '<prefix>-deco-a', '-b', ... One entry of `places` per decal says where it goes:
 *   'on'     over a fill tile of the block (a crack, a pebble, a floor grate). The default.
 *   'above'  in the empty cell above a top tile, standing on the top line (a tuft, a stalagmite)
 *   'below'  in the empty cell under a bottom tile, hanging from it (a stalactite, a root)
 * An entry may also be { place, label }. The place is kept on the clip as `place`.
 */
export function decoClips(prefix, places = ['on', 'on'], opts = {}) {
  const word = opts.label ?? title(prefix);
  return Object.fromEntries(places.map((pl, i) => {
    const o = typeof pl === 'string' ? { place: pl } : pl;
    const letter = String.fromCharCode(97 + i);
    return [`${prefix}-deco-${letter}`, entry(opts, o.label ?? `${word}: detail ${letter.toUpperCase()}`, { place: o.place ?? 'on' })];
  }));
}

const BLOCK_RE = /^(?:(.*)-)?(inner-tl|inner-tr|inner-bl|inner-br|side-l|side-r|bottom-l|bottom-r|strip-[lmr]|col-[tmb]|single|bottom|left|top|right|fill-[b-z]|fill)$/;
/**
 * What a clip name says the tile is: { prefix, kind, piece } or null for a name the helper does not know. clip: the name.
 * kind 'block' (piece: one of BLOCK_PIECES or NARROW_PIECES, or a fill version 'fill-b', 'fill-c'), 'thin' (l, m, r),
 * 'slope' (up, down), 'deco' (a, b, ... or digits), 'stack' (cap, mid, foot: things that repeat up and down).
 */
export function pieceOf(clip) {
  let m = /^(.+)-thin-([lmr])$/.exec(clip);
  if (m) return { prefix: m[1], kind: 'thin', piece: m[2] };
  m = /^(.+)-slope-(up|down)$/.exec(clip);
  if (m) return { prefix: m[1], kind: 'slope', piece: m[2] };
  m = /^(.+)-deco-([a-z0-9]+)$/.exec(clip);
  if (m) return { prefix: m[1], kind: 'deco', piece: m[2] };
  m = /^(.+)-(cap|mid|foot)$/.exec(clip);
  if (m) return { prefix: m[1], kind: 'stack', piece: m[2] };
  m = BLOCK_RE.exec(clip);
  if (m) return { prefix: m[1] ?? '', kind: 'block', piece: m[2] };
  return null;
}

// ---- which pieces can touch ----------------------------------------------------------
// What each piece needs around it: 1 = more of the block, 0 = outside, missing = either.

const SIGNATURE = {
  fill: { N: 1, E: 1, S: 1, W: 1, NE: 1, SE: 1, SW: 1, NW: 1 },
  top: { N: 0, E: 1, S: 1, W: 1, SE: 1, SW: 1 },
  left: { N: 0, E: 1, S: 1, W: 0, SE: 1 },
  right: { N: 0, E: 0, S: 1, W: 1, SW: 1 },
  'side-l': { N: 1, E: 1, S: 1, W: 0, NE: 1, SE: 1 },
  'side-r': { N: 1, E: 0, S: 1, W: 1, NW: 1, SW: 1 },
  bottom: { N: 1, E: 1, S: 0, W: 1, NE: 1, NW: 1 },
  'bottom-l': { N: 1, E: 1, S: 0, W: 0, NE: 1 },
  'bottom-r': { N: 1, E: 0, S: 0, W: 1, NW: 1 },
  'inner-tl': { N: 1, E: 1, S: 1, W: 1, NE: 1, SE: 1, SW: 1, NW: 0 },
  'inner-tr': { N: 1, E: 1, S: 1, W: 1, NE: 0, SE: 1, SW: 1, NW: 1 },
  'inner-bl': { N: 1, E: 1, S: 1, W: 1, NE: 1, SE: 1, SW: 0, NW: 1 },
  'inner-br': { N: 1, E: 1, S: 1, W: 1, NE: 1, SE: 0, SW: 1, NW: 1 },
  'strip-l': { N: 0, S: 0, W: 0, E: 1 }, 'strip-m': { N: 0, S: 0, W: 1, E: 1 }, 'strip-r': { N: 0, S: 0, W: 1, E: 0 },
  'col-t': { N: 0, W: 0, E: 0, S: 1 }, 'col-m': { N: 1, W: 0, E: 0, S: 1 }, 'col-b': { N: 1, W: 0, E: 0, S: 0 },
  single: { N: 0, E: 0, S: 0, W: 0 },
};
const agree = (a, b) => a === undefined || b === undefined || a === b;

/**
 * Every pair of block pieces that can sit next to each other in a block: [[a, axis, b], ...] where
 * axis 'x' means a is on the left of b and 'y' means a is above b. Worked out from what each piece needs
 * around it, so it holds the pairs the style guide lists and the ones that follow from them (a block two
 * tiles wide puts `left` beside `right`). opts.narrow (true): also the pairs among the NARROW_PIECES.
 */
export function blockJoins(opts = {}) {
  const out = [], names = opts.narrow ? [...BLOCK_PIECES, ...NARROW_PIECES] : BLOCK_PIECES;
  for (const a of names) for (const b of names) {
    const A = SIGNATURE[a], B = SIGNATURE[b];
    if (A.E === 1 && B.W === 1 && agree(A.N, B.NW) && agree(A.NE, B.N) && agree(A.S, B.SW) && agree(A.SE, B.S)) out.push([a, 'x', b]);
    if (A.S === 1 && B.N === 1 && agree(A.W, B.NW) && agree(A.SW, B.W) && agree(A.E, B.NE) && agree(A.SE, B.E)) out.push([a, 'y', b]);
  }
  return out;
}

/**
 * The piece for a cell of a block, from what is around it: around = { N, E, S, W, NE, SE, SW, NW },
 * each true where there is more of the block. Null when no piece fits (a strip one tile wide, or a
 * cell that would need two cut corners): a block is at least two tiles wide and two high.
 */
export function pieceFor(around) {
  for (const p of BLOCK_PIECES) {
    const s = SIGNATURE[p];
    if (Object.keys(s).every((k) => !!around[k] === (s[k] === 1))) return p;
  }
  return null;
}

// ---- what a tileset has, and which piece goes in which cell ---------------------------------------
// One classifier and one picker, shared by tools/tilemap.mjs and the playground, so they cannot disagree.

const WALL_WORDS = /wall|cliff|hedge|fence/;
const HOLE_WORDS = /^(pit|hole|water|void|lava|acid|pool|pond|chasm)/;

/**
 * What a block is on a top-down map: 'wall' (stands up, has a front face), 'hole' (cannot be walked on) or 'ground'.
 * prefix: the block's prefix (a wall has wall, cliff, hedge or fence in it; a hole starts with pit, hole, water,
 * void, lava, acid, pool, pond or chasm). hint: the kind given to blockClips, which wins.
 */
export function blockKind(prefix, hint) {
  if (hint === 'wall' || hint === 'hole' || hint === 'ground') return hint;
  return WALL_WORDS.test(prefix) ? 'wall' : HOLE_WORDS.test(prefix) ? 'hole' : 'ground';
}

/**
 * Sort a tileset's clips by what they are. clips: a sprite's `clips` object, a list of clip names, or a list of
 * { name, place, block } (anything else on an entry is ignored). Returns
 *   blocks  [{ prefix, kind, pieces: { piece: clip }, fills: [clip], decals }]  kind from blockKind; fills: 'fill' and its versions
 *   floors  [{ prefix, fill, fills, decals }]   a prefix with nothing but fills: the ground everything else sits on
 *   thins   [{ prefix, pieces: { l, m, r } }]     slopes [{ prefix, up, down }]     stacks [{ prefix, pieces: { cap, mid, foot } }]
 *   decals  [{ clip, prefix, place }]            extras [clip]  names the helper does not know
 */
export function classifyTiles(clips) {
  const list = Array.isArray(clips) ? clips.map((c) => (typeof c === 'string' ? { name: c } : c)) : Object.entries(clips).map(([name, c]) => ({ name, place: c?.place, block: c?.block }));
  const groups = new Map(), thins = new Map(), slopes = new Map(), stacks = new Map(), decals = [], extras = [];
  const of = (map, prefix, make) => { if (!map.has(prefix)) map.set(prefix, make()); return map.get(prefix); };
  for (const c of list) {
    const k = pieceOf(c.name);
    if (!k) extras.push(c.name);
    else if (k.kind === 'deco') decals.push({ clip: c.name, prefix: k.prefix, place: c.place === 'above' || c.place === 'below' ? c.place : 'on' });
    else if (k.kind === 'thin') of(thins, k.prefix, () => ({ prefix: k.prefix, pieces: {} })).pieces[k.piece] = c.name;
    else if (k.kind === 'slope') of(slopes, k.prefix, () => ({ prefix: k.prefix }))[k.piece] = c.name;
    else if (k.kind === 'stack') of(stacks, k.prefix, () => ({ prefix: k.prefix, pieces: {} })).pieces[k.piece] = c.name;
    else {
      const b = of(groups, k.prefix, () => ({ prefix: k.prefix, pieces: {}, fills: [], hint: undefined }));
      if (k.piece.startsWith('fill')) b.fills.push(c.name); else b.pieces[k.piece] = c.name;
      if (c.block) b.hint = c.block;
    }
  }
  const blocks = [], floors = [];
  for (const b of groups.values()) {
    b.fills.sort((x, y) => (pieceOf(x).piece === 'fill' ? -1 : pieceOf(y).piece === 'fill' ? 1 : x < y ? -1 : 1));
    const own = decals.filter((d) => d.prefix === b.prefix);
    if (!Object.keys(b.pieces).length) { floors.push({ prefix: b.prefix, fill: b.fills[0], fills: b.fills, decals: own }); continue; }
    if (b.fills.length) b.pieces.fill = b.fills[0];
    blocks.push({ prefix: b.prefix, kind: blockKind(b.prefix, b.hint), pieces: b.pieces, fills: b.fills, decals: own });
  }
  return { blocks, floors, thins: [...thins.values()], slopes: [...slopes.values()], stacks: [...stacks.values()], decals, extras };
}

// the piece for each mix of sides that face out, written N E S W
const BY_SIDES = {
  '': 'fill', N: 'top', E: 'side-r', S: 'bottom', W: 'side-l', NW: 'left', NE: 'right', SW: 'bottom-l', ES: 'bottom-r',
  NS: 'strip-m', NSW: 'strip-l', NES: 'strip-r', EW: 'col-m', NEW: 'col-t', ESW: 'col-b', NESW: 'single',
};
// what to use when a tileset has only the 13 pieces
const NEAREST = { 'strip-m': 'top', 'strip-l': 'left', 'strip-r': 'right', 'col-t': 'left', 'col-m': 'side-l', 'col-b': 'bottom-l', single: 'left', 'inner-tl': 'fill', 'inner-tr': 'fill', 'inner-bl': 'fill', 'inner-br': 'fill' };

// Which sides and corners of a slope cell are filled, as seen from the cell beside it. A slope that rises to the
// right is filled underneath and on its right; its left side and its top are open, and so is its top left corner.
const SLOPE_FILLED = {
  'slope-up': { N: 0, E: 1, S: 1, W: 0, NE: 1, SE: 1, SW: 1, NW: 0 },
  'slope-down': { N: 0, E: 0, S: 1, W: 1, NE: 0, SE: 1, SW: 1, NW: 1 },
};
/**
 * The piece of a block for one cell, whatever is round it: never null for a cell of the block. solid(x, y): true
 * where there is more of the block, 'slope-up' or 'slope-down' where one of its slopes is (a neighbour then counts
 * only on the sides a slope fills: a block beside a slope's low end, or resting on a slope, is closed there), false
 * elsewhere. x, y: the cell. has: the pieces the tileset has (an object keyed by piece, such as a block's `pieces`);
 * without the narrow pieces the nearest of the 13 is returned. A side that faces out always wins; with all four
 * sides solid one cut corner gives its inner piece (top corners first).
 */
export function pickPiece(solid, x, y, has) {
  if (!solid(x, y)) return null;
  // is the neighbour at (dx, dy) filled on the side (or corner) that faces this cell?
  const full = (dx, dy, facing) => { const v = solid(x + dx, y + dy); return SLOPE_FILLED[v] ? !!SLOPE_FILLED[v][facing] : !!v; };
  const N = !full(0, -1, 'S'), E = !full(1, 0, 'W'), S = !full(0, 1, 'N'), W = !full(-1, 0, 'E');
  let piece = BY_SIDES[`${N ? 'N' : ''}${E ? 'E' : ''}${S ? 'S' : ''}${W ? 'W' : ''}`];
  if (piece === 'fill') piece = !full(-1, -1, 'SE') ? 'inner-tl' : !full(1, -1, 'SW') ? 'inner-tr' : !full(-1, 1, 'NE') ? 'inner-bl' : !full(1, 1, 'NW') ? 'inner-br' : 'fill';
  if (has && !has[piece] && NEAREST[piece]) piece = NEAREST[piece];
  return piece;
}

/**
 * Which version of the fill goes in a cell: 0 (the plain fill, four cells in ten) or 1..n-1, the same every time
 * for the same cell. x, y: the cell. n: how many versions the block has.
 */
export function fillVariant(x, y, n) {
  if (!(n > 1)) return 0;
  const h = hash(x * 3 + 11, y * 7 + 5);
  return h < 0.4 ? 0 : 1 + Math.min(n - 2, Math.floor(((h - 0.4) / 0.6) * (n - 1)));
}

/**
 * The clip for one cell of a block: pickPiece, then the block's own clip for it, with the fill versions mixed by
 * position. block: an entry of classifyTiles().blocks. solid(x, y), x, y: as pickPiece. Null for an empty cell.
 */
export function pickClip(block, solid, x, y) {
  const piece = pickPiece(solid, x, y, block.pieces);
  if (!piece) return null;
  if (piece === 'fill' && block.fills.length) return block.fills[fillVariant(x, y, block.fills.length)];
  return block.pieces[piece] ?? null;
}

/**
 * Which piece of a thin platform goes in a cell: 'l', 'm' or 'r'. thin(x, y): true where the platform is.
 * solid(x, y): true where a block is. x, y: the cell. An end beside a block gets 'm', so the platform runs
 * into the block instead of showing a second outline against it.
 */
export function pickThin(thin, solid, x, y) {
  const left = thin(x - 1, y) || solid(x - 1, y), right = thin(x + 1, y) || solid(x + 1, y);
  return left && right ? 'm' : left ? 'r' : 'l';
}

/** Which piece of something that stacks goes in a cell: 'cap', 'mid' or 'foot'. stack(x, y): true where it is. x, y: the cell. */
export function pickStack(stack, x, y) {
  return !stack(x, y - 1) ? 'cap' : !stack(x, y + 1) ? 'foot' : 'mid';
}

/**
 * Lay out a map written as letters: returns { view, cols, rows, cells, tiles, notes }. rows: equal-length strings,
 * one letter per cell. clips: a tileset's clips (as classifyTiles takes them) or the result of classifyTiles.
 * opts.view: 'side' (default) or 'top-down'. opts.legend: { letter: what }, added to the letters below; `what` is a
 * clip name, a prefix, or 'block:p', 'thin:p', 'stack:p', 'slope-up:p', 'slope-down:p', 'floor:p', or a list of
 * those for a cell that holds several things.
 *   side      '#' the first block, 'I' the second (else the first), '/' '\' its slopes, '=' the first thin platform,
 *             '-' the second, '|' ':' '!' the first three things that stack, 'H' 'Y' 'T' the same three standing
 *             behind the first platform (their top piece shares its cell), 'F' the first lone fill (a back wall)
 *   top-down  the first floor lies under every cell; 'W' the wall, 'O' the hole, 'P' 'Q' the other blocks
 *   both      'a'..'z' the decal with that letter ('on': over a cell of its block or floor; 'above', 'below': in
 *             an empty cell); '0'..'9' the clips the helper has no name for; '.' or a space: nothing
 * The map carries on past its edges as its edge cells. tiles: [{ clip, col, row, layer }] in drawing order.
 * cells[row][col]: { kind, prefix, solid, things } (side: blocks and slopes are solid; top-down: walls and holes).
 * notes: what could not be placed, and slopes whose high side ends at a drop (no piece closes that side).
 */
export function layoutTiles(rows, clips, opts = {}) {
  const T = clips && Array.isArray(clips.blocks) && Array.isArray(clips.decals) ? clips : classifyTiles(clips);
  const view = opts.view === 'top-down' ? 'top-down' : 'side';
  const notes = [], tiles = [];
  const R = rows.length, C = Math.max(0, ...rows.map((r) => r.length));
  const byPrefix = (list, p) => list.find((b) => b.prefix === p);
  const grounds = T.blocks.filter((b) => b.kind === 'ground');
  const wall = T.blocks.find((b) => b.kind === 'wall'), hole = T.blocks.find((b) => b.kind === 'hole');
  const first = T.blocks[0];
  const slopeOf = (b) => (b && byPrefix(T.slopes, b.prefix)) || T.slopes[0];
  const name = (kind, x) => (x ? `${kind}:${x.prefix}` : null);            // null: the letter is known but the tileset has nothing for it
  const behind = (stack) => (stack && T.thins[0] ? [name('stack', stack), name('thin', T.thins[0])] : name('thin', T.thins[0]));
  const legend = view === 'side'
    ? { '#': name('block', first), I: name('block', T.blocks[1] ?? first), '/': name('slope-up', slopeOf(first)), '\\': name('slope-down', slopeOf(first)), '=': name('thin', T.thins[0]), '-': name('thin', T.thins[1] ?? T.thins[0]), '|': name('stack', T.stacks[0]), ':': name('stack', T.stacks[1]), '!': name('stack', T.stacks[2]), H: behind(T.stacks[0]), Y: behind(T.stacks[1]), T: behind(T.stacks[2]), F: name('floor', T.floors[0]) }
    : { W: name('block', wall), O: name('block', hole), P: name('block', grounds[0]), Q: name('block', grounds[1]) };
  const WORDS = { '#': 'block', I: 'second block', '/': 'slope', '\\': 'slope', '=': 'thin platform', '-': 'thin platform', H: 'thin platform', Y: 'thin platform', T: 'thin platform', '|': 'stack', ':': 'second stack', '!': 'third stack', F: 'lone fill', W: 'wall block', O: 'hole block', P: 'ground block', Q: 'second ground block' };
  Object.assign(legend, opts.legend ?? {});
  const known = new Set([...T.blocks.flatMap((b) => [...Object.values(b.pieces), ...b.fills]), ...T.floors.flatMap((f) => f.fills), ...T.thins.flatMap((t) => Object.values(t.pieces)), ...T.slopes.flatMap((x) => [x.up, x.down]), ...T.stacks.flatMap((x) => Object.values(x.pieces)), ...T.decals.map((d) => d.clip), ...T.extras]);

  // what one thing in the legend stands for: { kind, prefix }, { kind: 'clip', clip } or { kind: 'decal', decal }
  const one = (ch, what) => {
    if (!what) return { kind: 'empty', note: `"${ch}": the tileset has no ${WORDS[ch] ?? 'piece for it'}` };
    const m = /^(block|thin|stack|slope-up|slope-down|floor):(.+)$/.exec(what);
    if (m) return { kind: m[1], prefix: m[2] };
    const decal = T.decals.find((d) => d.clip === what);
    if (decal) return { kind: 'decal', decal };
    if (known.has(what)) return { kind: 'clip', clip: what };
    if (byPrefix(T.blocks, what)) return { kind: 'block', prefix: what };
    if (byPrefix(T.thins, what)) return { kind: 'thin', prefix: what };
    if (byPrefix(T.stacks, what)) return { kind: 'stack', prefix: what };
    if (byPrefix(T.floors, what)) return { kind: 'floor', prefix: what };
    return { kind: 'empty', note: `"${ch}": "${what}" is not a clip or a prefix of this tileset` };
  };
  // what a letter stands for: a list, because a legend entry may put several things in one cell
  const meaning = (ch) => {
    if (ch === '.' || ch === ' ' || ch === undefined) return [];
    let what = legend[ch];
    if (what === undefined && /[a-z]/.test(ch)) { const d = T.decals.find((x) => pieceOf(x.clip).piece === ch); if (!d) return [{ kind: 'empty', note: `"${ch}": the tileset has no decal -deco-${ch}` }]; what = d.clip; }
    if (what === undefined && /[0-9]/.test(ch)) { what = T.extras[Number(ch)]; if (!what) return [{ kind: 'empty', note: `"${ch}": the tileset has no other clip number ${ch}` }]; }
    if (what === undefined) return [{ kind: 'empty', note: `"${ch}": no such letter in the legend` }];
    return (Array.isArray(what) ? what : [what]).map((w) => one(ch, w));
  };
  const SOLID = ['block', 'slope-up', 'slope-down'];
  const cells = [];
  for (let r = 0; r < R; r++) {
    cells.push([]);
    for (let c = 0; c < C; c++) {
      const things = [];
      for (const m of meaning(rows[r][c])) {
        if (m.note) { if (!notes.includes(m.note)) notes.push(m.note); continue; }
        if (m.kind === 'decal') {
          // an "on" decal lies over a cell of its block (or of the floor); the others stand in an empty cell
          const block = m.decal.place === 'on' ? byPrefix(T.blocks, m.decal.prefix) : null;
          if (block && !things.some((t) => t.kind === 'block')) things.push({ kind: 'block', prefix: block.prefix });
        }
        things.push(m);
      }
      const main = things.find((t) => SOLID.includes(t.kind)) ?? things.find((t) => t.kind !== 'decal' && t.kind !== 'clip') ?? null;
      const block = main && SOLID.includes(main.kind) ? byPrefix(T.blocks, main.prefix) : null;
      cells[r].push({ kind: main ? main.kind : 'empty', prefix: main ? main.prefix : null, solid: !!block && (view === 'side' || block.kind !== 'ground'), things });
    }
  }
  const at = (c, r) => (R && C ? cells[Math.max(0, Math.min(R - 1, r))][Math.max(0, Math.min(C - 1, c))] : { kind: 'empty', things: [] });
  const has = (c, r, kinds, prefix) => at(c, r).things.some((t) => kinds.includes(t.kind) && (prefix === undefined || t.prefix === prefix));
  const inside = (c, r) => c >= 0 && c < C && r >= 0 && r < R;
  const put = (clip, col, row, layer, why) => { if (clip) tiles.push({ clip, col, row, layer }); else if (why && !notes.includes(why)) notes.push(why); };
  const LAYER = { floor: 0, stack: 1, ground: 2, hole: 3, wall: 4, thin: 5, decal: 6 };
  const floor = view === 'top-down' ? T.floors[0] : null;
  if (view === 'top-down' && !floor) notes.push('no floor: a top-down tileset needs a `<name>-fill` on its own to lie under everything');
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (floor) put(floor.fills[fillVariant(c, r, floor.fills.length)], c, r, LAYER.floor);
    for (const thing of cells[r][c].things) {
      const { kind, prefix } = thing;
      if (kind === 'floor') { const f = byPrefix(T.floors, prefix); put(f && f.fills[fillVariant(c, r, f.fills.length)], c, r, LAYER.floor, `no lone fill "${prefix}-fill"`); }
      if (kind === 'block') {
        // more of this block, or one of its slopes (pickPiece knows which sides of a slope are filled)
        const b = byPrefix(T.blocks, prefix), part = (x, y) => (has(x, y, ['block'], prefix) ? true : has(x, y, ['slope-up'], prefix) ? 'slope-up' : has(x, y, ['slope-down'], prefix) ? 'slope-down' : false);
        if (!b) put(null, c, r, 0, `no block "${prefix}"`);
        else put(pickClip(b, part, c, r), c, r, LAYER[b.kind], `${b.prefix}: no piece for the cell at ${c},${r} (${pickPiece(part, c, r)})`);
      }
      if (kind === 'slope-up' || kind === 'slope-down') {
        const sl = byPrefix(T.slopes, prefix);
        put(sl && sl[kind.slice(6)], c, r, LAYER.ground, `no slope pieces "${prefix}-slope-up" and "-slope-down"`);
        // a slope piece has no outline on its high side: it has to end on more ground (a block or another slope)
        const hx = kind === 'slope-up' ? c + 1 : c - 1;
        if (inside(hx, r) && !has(hx, r, SOLID)) put(null, c, r, 0, `the slope at ${c},${r} ends at a drop: no piece closes a slope's high side, so put a block there`);
      }
      if (kind === 'thin') {
        const t = byPrefix(T.thins, prefix);
        const k = pickThin((x, y) => inside(x, y) && has(x, y, ['thin'], prefix), (x, y) => inside(x, y) && has(x, y, SOLID), c, r);
        put(t && (t.pieces[k] ?? t.pieces.m), c, r, LAYER.thin, `no thin platform "${prefix}-thin-${k}"`);
      }
      if (kind === 'stack') {
        const st = byPrefix(T.stacks, prefix);
        const k = pickStack((x, y) => inside(x, y) && has(x, y, ['stack'], prefix), c, r);
        put(st && (st.pieces[k] ?? st.pieces.mid ?? st.pieces.cap), c, r, LAYER.stack, `nothing that stacks called "${prefix}"`);
      }
      if (kind === 'decal') put(thing.decal.clip, c, r, LAYER.decal);
      if (kind === 'clip') put(thing.clip, c, r, LAYER.decal);
    }
  }
  tiles.sort((a, b) => a.layer - b.layer);
  return { view, cols: C, rows: R, cells, tiles, notes };
}

// ---- texture that repeats ---------------------------------------------------------------

const toneCache = new Map();
/**
 * The tone for marks inside a fill (clods, cracks, seams, pebbles): the dark of the colour's ramp, or the next tone
 * down if some whole-bundle look (engine/theme.js) would turn the dark into the fill's colour and leave the fill plain.
 * colour: the mark's material, '#rrggbb'. against: the fill's colour when the mark is of another material (default: colour).
 */
export function textureTone(colour, against = colour) {
  const key = `${colour}/${against}`;
  let tone = toneCache.get(key);
  if (tone) return tone;
  const r = ramp(colour), candidates = [r.dark, r.deep, mix(r.deep, INK, 0.5), INK];
  const kept = (c) => THEME_PRESETS.every((look) => { const to = applyColour(Uint32Array.from([col(against), col(c)]), look.theme.colour); return to[0] !== to[1]; });
  tone = candidates.find(kept) ?? r.dark;
  toneCache.set(key, tone);
  return tone;
}

/** A stable value 0..1 for a pixel that repeats every 32 px both ways. x, y: the pixel. seed: different seeds give unrelated values. */
export function tileNoise(x, y = 0, seed = 0) {
  return hash(wrap(x) + (seed | 0) * 131, wrap(y) + (seed | 0) * 7919);
}

/**
 * A smooth profile 0..1 along an edge that repeats every 32 px: use it for the bumps of an outline
 * (`inset: (u) => Math.round(edgeWave(u, seed) * px)`). cycles: how many waves fit in one tile.
 */
export function edgeWave(u, seed = 0, cycles = [1, 2, 3]) {
  let v = 0, w = 0;
  cycles.forEach((c, i) => {
    const amp = 1 / (i + 1);
    v += amp * Math.sin(TAU * ((c * u) / TILE + hash(seed, i + 1)));
    w += amp;
  });
  return Math.min(1, Math.max(0, 0.5 + (0.5 * v) / w * 1.25));
}

/**
 * `count` marks spread over a tile, the same every time: [{ x, y, r }] with whole-number positions
 * `margin` px or more from the tile edge and `gap` px or more apart (r is a spare 0..1 value per mark).
 * For the few small marks of a fill pattern, and for placing decals.
 */
export function scatter(seed, count, { margin = 2, gap = 5, x0 = margin, x1 = M - margin, y0 = margin, y1 = M - margin } = {}) {
  const r = rng((seed | 0) * 2654435761 + 97);
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 200; tries++) {
    const x = x0 + Math.floor(r() * (x1 - x0 + 1)), y = y0 + Math.floor(r() * (y1 - y0 + 1)), v = r();
    const need = tries < count * 100 ? gap : Math.max(1, gap - 2);
    if (out.every((m) => Math.abs(m.x - x) + Math.abs(m.y - y) >= need)) out.push({ x, y, r: v });
  }
  return out;
}

/**
 * A fill made by drawing: `draw(s)` gets a 32x32 Surface already filled with `base` and draws the marks
 * on it with the usual shape calls. Returns fill(x, y) for a material. Keep marks off the outer 2 px:
 * the drawing does not wrap round.
 */
export function patternFill(base, draw) {
  const s = new Surface(TILE, TILE);
  s.rect(0, 0, TILE, TILE, base);
  if (draw) draw(s);
  return (x, y) => s.data[wrap(y) * TILE + wrap(x)];
}

// ---- drawing ------------------------------------------------------------------------------

const NO_EDGE = { depth: 0 };
const edgeOf = (m, which) => m[which] ?? ((which === 'left' || which === 'right') ? m.side : null) ?? NO_EDGE;
// The outline may wander up to 3 px in, but it is pinned to the tile boundary at both ends of an edge
// (0 px at u = 0 and 31, at most 1 px at 1 and 30, ...): that is what lets corners, slopes and inner
// corners meet any neighbour exactly, and gives whatever stands on a tile a fixed point to stand on.
const insetAt = (e, u, t) => { u = wrap(u); return e.inset ? Math.min(clampInt(e.inset(u, t), 0, 3), u, M - u) : 0; };
const depthAt = (e, u, t) => Math.max(0, Math.round(e.depth ?? 0) - (e.ragged ? Math.max(0, Math.round(e.ragged(wrap(u), t))) : 0));

/** The row of the top outline at column x of a top tile (0..3): where something standing on the block touches it. */
export function surfaceAt(material, x, t = 0) {
  return insetAt(edgeOf(material, 'top'), x, t);
}

// which sides of each piece face the outside
const SHAPES = {
  fill: {}, top: { N: 1 }, left: { N: 1, W: 1 }, right: { N: 1, E: 1 },
  'side-l': { W: 1 }, 'side-r': { E: 1 },
  bottom: { S: 1 }, 'bottom-l': { S: 1, W: 1 }, 'bottom-r': { S: 1, E: 1 },
  'inner-tl': { inner: 'tl' }, 'inner-tr': { inner: 'tr' }, 'inner-bl': { inner: 'bl' }, 'inner-br': { inner: 'br' },
  'strip-l': { N: 1, S: 1, W: 1 }, 'strip-m': { N: 1, S: 1 }, 'strip-r': { N: 1, S: 1, E: 1 },
  'col-t': { N: 1, W: 1, E: 1 }, 'col-m': { W: 1, E: 1 }, 'col-b': { S: 1, W: 1, E: 1 },
  single: { N: 1, E: 1, S: 1, W: 1 },
};

/**
 * The work behind every piece. shape: { N, E, S, W } sides facing the outside, `inner` an inner corner
 * (tl, tr, bl, br), `slope` ('up' | 'down'), `y1` the last solid row (31; less for a thin platform),
 * `cap` the most the top band may take (thin platforms), `edges` to replace some of the material's edges.
 */
function drawShape(g, material, t, shape) {
  const { N, E, S, W, inner = null, slope = null, y1 = M } = shape;
  const eTop = shape.edges?.top ?? edgeOf(material, 'top'), eBot = shape.edges?.bottom ?? edgeOf(material, 'bottom');
  const eL = edgeOf(material, 'left'), eR = edgeOf(material, 'right');
  const ink = material.ink === undefined ? INK : material.ink;
  const round = clampInt(material.round ?? 0, 0, 3);
  const add = ink ? 0 : 1;                                   // with no ink line the band starts on the outline itself

  // depth of a pixel inside each feature (0 = on the outline, negative = outside)
  const iT = (x) => insetAt(eTop, x, t), iB = (x) => insetAt(eBot, x, t), iL = (y) => insetAt(eL, y, t), iR = (y) => insetAt(eR, y, t);
  const surface = (x) => (slope === 'up' ? M - x : x);       // a slope is a clean 45 degree line: the top edge's inset is not used
  const dN = (x, y) => (slope ? y - surface(x) : N ? y - iT(x) : FAR);
  const dS = (x, y) => (S ? y1 - y - iB(x) : FAR);
  const dW = (x, y) => (W ? x - iL(y) : FAR);
  const dE = (x, y) => (E ? M - x - iR(y) : FAR);
  // an inner corner: a = depth under (or over) its level edge, b = depth beside its upright edge. Outlines are
  // pinned to the tile boundary at the corner, so the piece is solid all over and insets play no part in it.
  const innerA = (x, y) => (inner[0] === 't' ? y : M - y);
  const innerB = (x, y) => (inner[1] === 'l' ? x : M - x);
  const solid = (x, y) => {
    const n = dN(x, y), s = dS(x, y), w = dW(x, y), e = dE(x, y);
    if (n < 0 || s < 0 || w < 0 || e < 0) return false;
    if (round && Math.min(n + w, n + e, s + w, s + e) < round) return false;
    if (inner && innerA(x, y) < 0 && innerB(x, y) < 0) return false;
    return true;
  };
  // one ring of cells round the tile, so the outline knows what is past the tile's own edge
  const P = TILE + 2, mask = new Uint8Array(P * P);
  for (let y = -1; y <= TILE; y++) for (let x = -1; x <= TILE; x++) mask[(y + 1) * P + x + 1] = solid(x, y) ? 1 : 0;
  const at = (x, y) => mask[(y + 1) * P + x + 1];
  const cx = inner ? (inner[1] === 'l' ? -1 : 1) : 0, cy = inner ? (inner[0] === 't' ? -1 : 1) : 0;
  const tuckOf = (edge) => (edge.tuck === true ? Math.round(edge.depth ?? 0) : edge.tuck ? Math.round(edge.tuck) : 0);
  // An inner corner's own pixel is outline where the rims meet in a mitre. Where a band tucks into the corner the
  // pixel belongs to the band: that is what lets a slope's line pass the corner with no nub.
  const cornerInk = inner && !tuckOf(inner[0] === 't' ? eTop : eBot) && !tuckOf(inner[1] === 'l' ? eL : eR);

  const band = (e, d, u, depth, first) => {
    d += add;
    if (!e.paint || d < 1 || d > depth) return null;
    const c = e.paint(d, wrap(u), t, depth);
    return c === null || c === undefined ? null : { c, d, first };
  };
  const droop = (e, near) => (e.wrap && near < FAR ? Math.max(0, e.wrap - 2 * Math.max(0, near - 1 + add)) : 0);

  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (!at(x, y)) {
      if (material.outside) { const c = material.outside(x, y, t); if (c !== null && c !== undefined) g.dot(x, y, c); }
      continue;
    }
    if (ink && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1) || (cornerInk && !at(x + cx, y + cy)))) { g.dot(x, y, ink); continue; }
    const n = dN(x, y), s = dS(x, y), w = dW(x, y), e = dE(x, y);
    const found = [];
    const push = (b) => { if (b) found.push(b); };
    if (n < FAR) {
      let depth = depthAt(eTop, x, t) + droop(eTop, Math.min(w, e));
      if (shape.cap !== undefined) depth = Math.min(depth, shape.cap);
      if (slope) {
        // Depth is measured straight down, so a band as thick across the slope as on the flat is 1.41 times as deep.
        // It grows to that from the flat top's depth at the slope's upper end (the mitre between the two), and at the
        // foot it ends inside the slope tile, except the `tuck` px that the corner tile below carries on.
        const fromTop = slope === 'up' ? M - x : x, room = slope === 'up' ? x : M - x;
        depth = Math.min(Math.round(depth * 1.41), depth + Math.floor(fromTop * 0.41));
        depth = Math.min(depth, Math.max(room, tuckOf(eTop)));
      }
      push(band(eTop, n, x, depth, !!eTop.wrap));
    }
    if (s < FAR) push(band(eBot, s, x, depthAt(eBot, x, t) + droop(eBot, Math.min(w, e)), !!eBot.wrap));
    if (w < FAR) push(band(eL, w, y, depthAt(eL, y, t) + droop(eL, Math.min(n, s)), !!eL.wrap));
    if (e < FAR) push(band(eR, e, y, depthAt(eR, y, t) + droop(eR, Math.min(n, s)), !!eR.wrap));
    if (inner) {
      const a = innerA(x, y), b = innerB(x, y);
      const A = inner[0] === 't' ? eTop : eBot, B = inner[1] === 'l' ? eL : eR;
      if (a >= 0 && b >= 0) {
        // the corner itself. A band that tucks tapers across the corner (and so continues a slope above it);
        // otherwise the two bands meet in a mitre, each pixel taking the band it is deeper under.
        // (the tucked band is as deep everywhere as at the corner column, so its edge is one clean diagonal)
        if (tuckOf(A)) push(band(A, a + b + 1 - add, x, Math.min(tuckOf(A), depthAt(A, inner[1] === 'l' ? 0 : M, t)), true));
        else if (tuckOf(B)) push(band(B, a + b + 1 - add, y, Math.min(tuckOf(B), depthAt(B, inner[0] === 't' ? 0 : M, t)), true));
        else if (a >= b) push(band(A, a, x, depthAt(A, x, t), false));
        else push(band(B, b, y, depthAt(B, y, t), false));
      } else if (a < 0) push(band(B, b, y, depthAt(B, y, t), false));
      else push(band(A, a, x, depthAt(A, x, t), false));
    }
    let best = null;
    for (const f of found) if (!best || (f.first && !best.first) || (f.first === best.first && f.d < best.d)) best = f;
    g.dot(x, y, best ? best.c : material.fill(x, y, t, shape.variant ?? 0));
  }
  return g;
}

// The front face of a top-down wall. ends: { W, E } sides closed by an ink line. sliver: rows of cap drawn over
// the face (a wall one tile deep has no row of its own for the cap).
const SLIVER = 8;
const FACES = {
  bottom: {}, 'bottom-l': { W: 1 }, 'bottom-r': { E: 1 }, 'col-b': { W: 1, E: 1 },
  'strip-l': { W: 1, sliver: 1 }, 'strip-m': { sliver: 1 }, 'strip-r': { E: 1, sliver: 1 }, single: { W: 1, E: 1, sliver: 1 },
};
function drawFace(g, material, t, ends) {
  const f = material.face, ink = material.ink === undefined ? INK : material.ink;
  const eL = edgeOf(material, 'left'), eR = edgeOf(material, 'right');
  const baseRow = M - 2, y0 = ends.sliver ? SLIVER : 0;
  if (ends.sliver) {
    const cap = new Surface(TILE, TILE);
    drawShape(cap, material, t, { N: 1, W: ends.W, E: ends.E });
    for (let y = 0; y < SLIVER; y++) for (let x = 0; x < TILE; x++) { const v = cap.data[y * TILE + x]; if (v) g.dot(x, y, v); }
  }
  for (let y = y0; y < TILE; y++) {
    const xa = ends.W ? insetAt(eL, y, t) : 0, xb = ends.E ? M - insetAt(eR, y, t) : M;
    for (let x = xa; x <= xb; x++) {
      if (y > baseRow) { if (f.shadow) g.dot(x, y, f.shadow); continue; }
      const end = (ends.W && x === xa) || (ends.E && x === xb);
      if (y === baseRow) g.dot(x, y, f.base ?? ink ?? INK);
      else if (end && ink) g.dot(x, y, ink);
      else g.dot(x, y, f.paint(x, y - y0, t));
    }
  }
  return g;
}

/**
 * Draw one piece of a block on a 32x32 Surface. g: the Surface. piece: a name from BLOCK_PIECES or NARROW_PIECES
 * ('top', 'inner-tl', 'col-m', ...) or a fill version ('fill-b'); a whole clip name ('grass-top') works too.
 * material: see the top of this file. t: the clip phase, passed on to the material for animated tiles.
 */
export function drawBlock(g, piece, material, t = 0) {
  let name = SHAPES[piece] || /^fill-[b-z]$/.test(piece) ? piece : pieceOf(piece)?.piece;
  let variant = 0;
  if (name && name.startsWith('fill-')) { variant = name.charCodeAt(5) - 97; name = 'fill'; }
  if (!SHAPES[name]) throw new Error(`drawBlock: "${piece}" is not a block piece (${[...BLOCK_PIECES, ...NARROW_PIECES].join(', ')})`);
  if (material.face) {
    if (FACES[name]) return drawFace(g, material, t, FACES[name]);
    // where the wall turns towards the camera, the cap's edge runs on beside the face
    if (name === 'inner-bl') return drawShape(g, material, t, SHAPES['side-l']);
    if (name === 'inner-br') return drawShape(g, material, t, SHAPES['side-r']);
  }
  return drawShape(g, material, t, variant ? { ...SHAPES[name], variant } : SHAPES[name]);
}

/**
 * Draw a piece of a thin platform: `thickness` px (default 12) in the top of the tile, see-through below.
 * part: 'l', 'm' or 'r' ('m' repeats sideways). opts.bottom replaces the material's bottom edge for the
 * platform's underside (a cap of roots that suits a deep block rarely suits 12 px).
 */
export function drawThin(g, part, material, t = 0, opts = {}) {
  const k = part.length > 1 ? pieceOf(part)?.piece ?? part.slice(-1) : part;
  if (!['l', 'm', 'r'].includes(k)) throw new Error(`drawThin: "${part}" is not l, m or r`);
  const thickness = clampInt(opts.thickness ?? 12, 4, TILE);
  return drawShape(g, material, t, { N: 1, S: 1, W: k === 'l', E: k === 'r', y1: thickness - 1, cap: Math.max(1, thickness - 4), edges: opts.bottom ? { bottom: opts.bottom } : undefined });
}

/**
 * Draw a 45 degree slope. dir 'up' rises to the right (its right edge meets a top tile, its bottom edge sits
 * on an inner-tl tile); 'down' falls to the right (top tile on its left, inner-tr under it). The top edge's
 * band follows the slope and narrows to the edge's `tuck` at the foot, where the corner tile below takes over.
 * The line itself is a clean 45 degrees: the top edge's inset is not used.
 */
export function drawSlope(g, dir, material, t = 0) {
  const d = dir === 'up' || dir === 'down' ? dir : pieceOf(dir)?.piece;
  if (d !== 'up' && d !== 'down') throw new Error(`drawSlope: "${dir}" is not up or down`);
  return drawShape(g, material, t, { slope: d });
}

/**
 * Draw whichever block, thin-platform or slope piece a clip name asks for, from one material.
 * Returns true when it drew the clip, false for any other name (decals, extras): the sprite draws those.
 * opts.thickness and opts.bottom go to drawThin.
 */
export function drawTile(g, clip, material, t = 0, opts = {}) {
  const k = pieceOf(clip);
  if (!k) return false;
  if (k.kind === 'block') { drawBlock(g, k.piece, material, t); return true; }
  if (k.kind === 'thin') { drawThin(g, k.piece, material, t, opts); return true; }
  if (k.kind === 'slope') { drawSlope(g, k.piece, material, t); return true; }
  return false;
}

/**
 * Draw a decal that stands in the open (a tuft above the top line, a stalactite under the block) with the
 * block's outline round it: `draw(s)` draws on a spare Surface, which is then outlined and pasted on g.
 * Things drawn over a fill tile need no outline: draw those straight on g.
 * The top line of a block wanders (surfaceAt(material, x) says how far, per column), so put thin stems on
 * columns where it is 0, and let wide things reach the bottom row of the frame all along their base.
 */
export function drawDecal(g, draw, { ink = INK } = {}) {
  const s = new Surface(g.w, g.h);
  draw(s);
  if (ink) s.outline(ink);
  g.blit(s);
  return g;
}
