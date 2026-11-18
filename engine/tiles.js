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
 * Several tilesets at once (what a bag holds): pass [{ key, clips, names }] (key: your name for the tileset; clips: its
 * clip table; names: optional, its clip names in order). Every block, floor, thin, slope, stack and decal then has
 * `set` (the key of the tileset it came from) and the result has `from` ({ clip: key }). The first tileset to use a
 * clip name keeps it, and a block, platform, slope pair or stack belongs whole to the first tileset with its prefix.
 */
export function classifyTiles(clips) {
  const many = Array.isArray(clips) && clips.length > 0 && clips.every((c) => c && typeof c === 'object' && 'key' in c && (c.clips !== undefined || Array.isArray(c.names)));
  const entries = (table, names) => (names ?? Object.keys(table ?? {})).map((name) => ({ name, place: table?.[name]?.place, block: table?.[name]?.block }));
  const list = many ? clips.flatMap((set) => entries(set.clips, set.names).map((c) => ({ ...c, set: set.key })))
    : Array.isArray(clips) ? clips.map((c) => (typeof c === 'string' ? { name: c } : c)) : entries(clips);
  const groups = new Map(), thins = new Map(), slopes = new Map(), stacks = new Map(), decals = [], extras = [];
  const from = {};
  const tag = (o, set) => (many ? { ...o, set } : o);
  const of = (map, prefix, make) => { if (!map.has(prefix)) map.set(prefix, make()); return map.get(prefix); };
  for (const c of list) {
    if (many && c.name in from) continue;                      // the first tileset to use a name keeps it
    const k = pieceOf(c.name);
    const group = !k ? null : k.kind === 'thin' ? thins : k.kind === 'slope' ? slopes : k.kind === 'stack' ? stacks : k.kind === 'block' ? groups : null;
    if (many && group && group.has(k.prefix) && group.get(k.prefix).set !== c.set) continue;   // ... and a prefix stays with one tileset
    if (many) from[c.name] = c.set;
    if (!k) extras.push(c.name);
    else if (k.kind === 'deco') decals.push(tag({ clip: c.name, prefix: k.prefix, place: c.place === 'above' || c.place === 'below' ? c.place : 'on' }, c.set));
    else if (k.kind === 'thin') of(thins, k.prefix, () => tag({ prefix: k.prefix, pieces: {} }, c.set)).pieces[k.piece] = c.name;
    else if (k.kind === 'slope') of(slopes, k.prefix, () => tag({ prefix: k.prefix }, c.set))[k.piece] = c.name;
    else if (k.kind === 'stack') of(stacks, k.prefix, () => tag({ prefix: k.prefix, pieces: {} }, c.set)).pieces[k.piece] = c.name;
    else {
      const b = of(groups, k.prefix, () => ({ prefix: k.prefix, pieces: {}, fills: [], hint: undefined, set: c.set }));
      if (k.piece.startsWith('fill')) b.fills.push(c.name); else b.pieces[k.piece] = c.name;
      if (c.block) b.hint = c.block;
    }
  }
  const blocks = [], floors = [];
  for (const b of groups.values()) {
    b.fills.sort((x, y) => (pieceOf(x).piece === 'fill' ? -1 : pieceOf(y).piece === 'fill' ? 1 : x < y ? -1 : 1));
    const own = decals.filter((d) => d.prefix === b.prefix);
    if (!Object.keys(b.pieces).length) { floors.push(tag({ prefix: b.prefix, fill: b.fills[0], fills: b.fills, decals: own }, b.set)); continue; }
    if (b.fills.length) b.pieces.fill = b.fills[0];
    blocks.push(tag({ prefix: b.prefix, kind: blockKind(b.prefix, b.hint), pieces: b.pieces, fills: b.fills, decals: own }, b.set));
  }
  const out = { blocks, floors, thins: [...thins.values()], slopes: [...slopes.values()], stacks: [...stacks.values()], decals, extras };
  return many ? { ...out, from } : out;
}

// the piece for each mix of sides that face out, written N E S W
const BY_SIDES = {
  '': 'fill', N: 'top', E: 'side-r', S: 'bottom', W: 'side-l', NW: 'left', NE: 'right', SW: 'bottom-l', ES: 'bottom-r',
  NS: 'strip-m', NSW: 'strip-l', NES: 'strip-r', EW: 'col-m', NEW: 'col-t', ESW: 'col-b', NESW: 'single',
};
/**
 * The closest piece a block has to the one a cell wants: `piece` itself when the block has it, else, in this order,
 * the piece that closes the most of the same sides without closing any other (the top counts most, then the two
 * sides, then the bottom), the fill, and last the piece that wrongly closes the fewest sides. Null for a block
 * with no pieces. piece: the piece wanted. has: the pieces the block has (an object keyed by piece).
 */
export function nearestPiece(piece, has) {
  if (has[piece] && SHAPES[piece]) return piece;
  const want = SHAPES[piece] ?? {}, worth = { N: 8, W: 4, E: 4, S: 2 };
  let best = null, top = -Infinity;
  for (const name of [...BLOCK_PIECES, ...NARROW_PIECES]) {
    if (!has[name]) continue;
    const shape = SHAPES[name];
    let score = shape.inner && shape.inner !== want.inner ? -1 : 0;
    for (const side of ['N', 'E', 'S', 'W']) if (shape[side]) score += want[side] ? worth[side] : -100;
    if (score > top) { top = score; best = name; }
  }
  return best;
}

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
 * a piece it lacks is replaced by the closest it has (nearestPiece), so a block with only some pieces still draws.
 * A side that faces out always wins; with all four sides solid one cut corner gives its inner piece (top corners first).
 */
export function pickPiece(solid, x, y, has) {
  if (!solid(x, y)) return null;
  // is the neighbour at (dx, dy) filled on the side (or corner) that faces this cell?
  const full = (dx, dy, facing) => { const v = solid(x + dx, y + dy); return SLOPE_FILLED[v] ? !!SLOPE_FILLED[v][facing] : !!v; };
  const N = !full(0, -1, 'S'), E = !full(1, 0, 'W'), S = !full(0, 1, 'N'), W = !full(-1, 0, 'E');
  let piece = BY_SIDES[`${N ? 'N' : ''}${E ? 'E' : ''}${S ? 'S' : ''}${W ? 'W' : ''}`];
  if (piece === 'fill') piece = !full(-1, -1, 'SE') ? 'inner-tl' : !full(1, -1, 'SW') ? 'inner-tr' : !full(-1, 1, 'NE') ? 'inner-bl' : !full(1, 1, 'NW') ? 'inner-br' : 'fill';
  if (has && !has[piece]) piece = nearestPiece(piece, has) ?? piece;
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

/** How often a cell that may hold a decal gets one, by where it goes: on a block's fill, on bare floor (top-down), above a top, under a bottom. */
export const DECAL_CHANCE = { on: 0.25, floor: 0.12, above: 0.3, below: 0.5 };

/**
 * Which decal, if any, goes in a cell: a clip name or null, the same every time for the same cell. decals: the
 * decals that may go there, [{ clip, place }] (a block's or a floor's `decals`). place: 'on' (the cell is a fill
 * piece of the block, or bare floor), 'above' (an empty cell over the block's `top` piece) or 'below' (an empty
 * cell under its `bottom` piece). x, y: the cell. chance: 0..1, default DECAL_CHANCE[place].
 */
export function pickDecal(decals, place, x, y, chance = DECAL_CHANCE[place]) {
  const list = (decals ?? []).filter((d) => d.place === place);
  if (!list.length || !(hash(x * 7 + 3, y * 13 + 5) < chance)) return null;
  return list[Math.floor(hash(x * 11 + 1, y * 17 + 9) * list.length)].clip;
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
 * those for a cell that holds several things. opts.decals: true to scatter the tileset's decals by pickDecal's rule
 * over the cells the map leaves free (or { on, floor, above, below } chances in place of DECAL_CHANCE).
 *   side      '#' the first block, 'I' the second (else the first), '/' '\' its slopes, '=' the first thin platform,
 *             '-' the second, '|' ':' '!' the first three things that stack, 'H' 'Y' 'T' the same three standing
 *             behind the first platform (their top piece shares its cell), 'F' the first lone fill (a back wall)
 *   top-down  the first floor lies under every cell; 'W' the wall, 'O' the hole, 'P' 'Q' the other blocks
 *   both      'a'..'z' the decal with that letter ('on': over a cell of its block or floor; 'above', 'below': in
 *             an empty cell); '0'..'9' the clips the helper has no name for; '.' or a space: nothing
 * The map carries on past its edges as its edge cells. tiles: [{ clip, col, row, layer }] in drawing order (with
 * `set`, the tileset's key, when clips came from classifyTiles with several tilesets).
 * cells[row][col]: { kind, prefix, solid, things } (side: blocks and slopes are solid; top-down: walls and holes).
 * kind and solid come from the letters whether or not the tileset has tiles for them, so they can drive a game.
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
  // What the standard letters are, tiles or no tiles: a map says what is solid even when the tileset cannot draw it.
  const STANDARD = { '#': ['block'], I: ['block'], '/': ['slope-up'], '\\': ['slope-down'], '=': ['thin'], '-': ['thin'], H: ['thin'], Y: ['thin'], T: ['thin'], '|': ['stack'], ':': ['stack'], '!': ['stack'], F: ['floor'], W: ['block', 'wall'], O: ['block', 'hole'], P: ['block', 'ground'], Q: ['block', 'ground'] };
  const one = (ch, what) => {
    if (!what) return { kind: (STANDARD[ch] ?? ['empty'])[0], prefix: null, as: (STANDARD[ch] ?? [])[1], missing: !!STANDARD[ch], note: `"${ch}": the tileset has no ${WORDS[ch] ?? 'piece for it'}` };
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
        if (m.note) { if (!notes.includes(m.note)) notes.push(m.note); if (!m.missing) continue; }
        if (m.kind === 'decal') {
          // an "on" decal lies over a cell of its block (or of the floor); the others stand in an empty cell
          const block = m.decal.place === 'on' ? byPrefix(T.blocks, m.decal.prefix) : null;
          if (block && !things.some((t) => t.kind === 'block')) things.push({ kind: 'block', prefix: block.prefix });
        }
        things.push(m);
      }
      const main = things.find((t) => SOLID.includes(t.kind)) ?? things.find((t) => t.kind !== 'decal' && t.kind !== 'clip') ?? null;
      // solid: in side view every block and slope; top-down, walls and holes. Decided by the letter (or the block's
      // name) even when the tileset has no such block, so a game's collisions and the picture agree.
      const block = main && SOLID.includes(main.kind) ? byPrefix(T.blocks, main.prefix) : null;
      const solid = !!main && SOLID.includes(main.kind) && (view === 'side' || (block ? block.kind : main.as ?? blockKind(main.prefix ?? '')) !== 'ground');
      cells[r].push({ kind: main ? main.kind : 'empty', prefix: main ? main.prefix : null, solid, things });
    }
  }
  const at = (c, r) => (R && C ? cells[Math.max(0, Math.min(R - 1, r))][Math.max(0, Math.min(C - 1, c))] : { kind: 'empty', things: [] });
  const has = (c, r, kinds, prefix) => at(c, r).things.some((t) => kinds.includes(t.kind) && (prefix === undefined || t.prefix === prefix));
  const inside = (c, r) => c >= 0 && c < C && r >= 0 && r < R;
  const put = (clip, col, row, layer, why) => { if (clip) tiles.push(T.from ? { clip, col, row, layer, set: T.from[clip] } : { clip, col, row, layer }); else if (why && !notes.includes(why)) notes.push(why); };
  const pieces = new Map();                                       // 'col,row' -> { block, piece } for the cells of blocks
  const LAYER = { floor: 0, stack: 1, ground: 2, hole: 3, wall: 4, thin: 5, decal: 6 };
  const floor = view === 'top-down' ? T.floors[0] : null;
  if (view === 'top-down' && !floor) notes.push('no floor: a top-down tileset needs a `<name>-fill` on its own to lie under everything');
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (floor) put(floor.fills[fillVariant(c, r, floor.fills.length)], c, r, LAYER.floor);
    for (const thing of cells[r][c].things) {
      const { kind, prefix } = thing;
      if (thing.missing) continue;                                  // nothing to draw it with: already noted
      if (kind === 'floor') { const f = byPrefix(T.floors, prefix); put(f && f.fills[fillVariant(c, r, f.fills.length)], c, r, LAYER.floor, `no lone fill "${prefix}-fill"`); }
      if (kind === 'block') {
        // more of this block, or one of its slopes (pickPiece knows which sides of a slope are filled)
        const b = byPrefix(T.blocks, prefix), part = (x, y) => (has(x, y, ['block'], prefix) ? true : has(x, y, ['slope-up'], prefix) ? 'slope-up' : has(x, y, ['slope-down'], prefix) ? 'slope-down' : false);
        if (!b) put(null, c, r, 0, `no block "${prefix}"`);
        else {
          put(pickClip(b, part, c, r), c, r, LAYER[b.kind], `${b.prefix}: no piece for the cell at ${c},${r} (${pickPiece(part, c, r)})`);
          pieces.set(`${c},${r}`, { block: b, piece: pickPiece(part, c, r, b.pieces) });
        }
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
  if (opts.decals) {
    // scatter the decals the map does not place itself: one to a cell at most, by pickDecal's rule
    const chance = { ...DECAL_CHANCE, ...(opts.decals === true ? {} : opts.decals) };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const things = cells[r][c].things, here = pieces.get(`${c},${r}`);
      if (things.some((t) => t.kind === 'decal' || t.kind === 'clip')) continue;
      if (here) { if (here.piece === 'fill') put(pickDecal(here.block.decals, 'on', c, r, chance.on), c, r, LAYER.decal); continue; }
      if (things.length) continue;
      if (floor) { put(pickDecal(floor.decals, 'on', c, r, chance.floor), c, r, LAYER.decal); continue; }
      const under = pieces.get(`${c},${r + 1}`), over = pieces.get(`${c},${r - 1}`);
      if (under && under.piece === 'top') put(pickDecal(under.block.decals, 'above', c, r, chance.above), c, r, LAYER.decal);
      else if (over && over.piece === 'bottom') put(pickDecal(over.block.decals, 'below', c, r, chance.below), c, r, LAYER.decal);
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

// ---- light marks, and liquids (added with batch P05: cave rock, water and waterfalls) ----------------------
// A liquid is two pieces under one prefix: '<prefix>-top', the surface, see-through above a line that may wave,
// and '<prefix>-fill', the body (with other versions, like a block's fill). It has no sides and no underside: it
// lies in a basin of some block, whose own outline closes it. Worked example: sprites/tiles-water.js.

const lightCache = new Map();
/**
 * The tone for light marks inside a fill (lit facets, glints, streaks on water): the light of the colour's ramp, or the next tone up if some whole-bundle look (engine/theme.js) would turn it into the fill's colour.
 * Arguments: colour: the mark's material, '#rrggbb'. against: the fill's colour when the mark is of another material
 * (default: colour). from: 0 to 1, where the search starts between the colour and its ramp's light (default 1, the
 * light itself; 0.5 gives a softer tone for large lit areas, when that one survives every look).
 */
export function textureLight(colour, against = colour, from = 1) {
  const start = Math.min(1, Math.max(0.1, Number(from) || 1));
  const key = `${colour}/${against}/${start}`;
  let tone = lightCache.get(key);
  if (tone) return tone;
  const light = ramp(colour).light, candidates = [];
  for (let k = start; k < 1; k += 0.125) candidates.push(mix(colour, light, k));
  candidates.push(light, mix(light, '#ffffff', 0.3), mix(light, '#ffffff', 0.6), '#ffffff');
  const kept = (c) => col(c) !== col(against) && THEME_PRESETS.every((look) => { const to = applyColour(Uint32Array.from([col(against), col(c)]), look.theme.colour); return to[0] !== to[1]; });
  tone = candidates.find(kept) ?? light;
  lightCache.set(key, tone);
  return tone;
}

/**
 * The clip entries of a liquid (water, lava, a swamp): '<prefix>-top', its surface, and '<prefix>-fill', its body, animated; draw them with drawLiquid.
 * Arguments: prefix: the liquid's prefix. opts.frames (default 8), opts.fps (number or (p) => number, default 6),
 * opts.label (the word shown before each piece, default the prefix), opts.kind (kept on each entry as `block`, as
 * blockClips does), opts.fills (2 or 3: also '<prefix>-fill-b', '-fill-c', other versions of the body that pickClip
 * mixes in by position so a deep pool does not repeat every 32 px).
 */
export function liquidClips(prefix, opts = {}) {
  const word = opts.label ?? title(prefix), o = { ...opts, frames: opts.frames ?? 8 };
  const extra = opts.kind ? { block: opts.kind } : {};
  const out = { [`${prefix}-top`]: entry(o, `${word}: surface`, extra), [`${prefix}-fill`]: entry(o, `${word}: body`, extra) };
  for (let i = 1; i < Math.min(26, opts.fills ?? 1); i++) out[`${prefix}-fill-${String.fromCharCode(97 + i)}`] = entry(o, `${word}: body, version ${String.fromCharCode(65 + i)}`, extra);
  return out;
}

/**
 * Which piece of a liquid goes in a cell: 'top' (its surface: nothing of the liquid in the cell above) or 'fill' (its body); null for a cell with no liquid in it.
 * Arguments: liquid(x, y): true where the liquid is. x, y: the cell. A liquid needs no other piece: whatever holds
 * it closes its sides and its bed.
 */
export function pickLiquid(liquid, x, y) {
  if (!liquid(x, y)) return null;
  return liquid(x, y - 1) ? 'fill' : 'top';
}

// Columns are read in pairs that straddle the tile boundary (31 and 0, 1 and 2, ... 29 and 30), so the surface
// line is as high on one side of a join as on the other whatever shape the wave has.
const liquidColumn = (x) => (wrap(x + 1) >> 1) << 1;

/**
 * The row of a liquid's surface line at column x of its surface piece (0..31): where a float, a lily pad or the foot of a waterfall meets it.
 * Arguments: liquid: what drawLiquid takes. x: the column (any whole number: the line repeats every 32 px).
 * t: the clip phase.
 */
export function liquidLine(liquid, x, t = 0) {
  const level = clampInt(liquid.level ?? 6, 0, M);
  return liquid.rise ? clampInt(level - Math.round(liquid.rise(liquidColumn(x), t)), 0, M) : level;
}

/**
 * Draw one piece of a liquid on a 32x32 Surface: 'fill' is the body, 'top' the surface, see-through above a line that may wave; pieces of one liquid join each other exactly on every frame.
 * Arguments: g: the Surface. piece: 'top', 'fill', a version of the fill ('fill-b') or a whole clip name
 * ('water-top'). liquid: { body, level, rise, surface } (below). t: the clip phase. Returns g.
 *   liquid.body(x, y, t, v)        required. The colour of the body at x, y in 0..31; v is the fill version (0 under the
 *                                  surface). Like a material's fill: it repeats every 32 px both ways, and other
 *                                  versions keep their marks off the tile's edges on every frame
 *   liquid.level                   the row of the surface line when the liquid lies still (default 6)
 *   liquid.rise(u, t)              px the line stands above the level at column u (rounded; below 0 is a trough).
 *                                  Asked at even columns only: columns u - 1 and u share a height, so a wave that
 *                                  travels needs no pinning at the tile's ends. It must repeat every 32 px
 *   liquid.surface(d, x, t, line)  the colour d px under the line (0: the line itself) at column x, or null to show
 *                                  the body there. line: the row of the line at that column
 * Things that float on it or stand out of it (a lily pad, a bubble) are the sprite's own: draw them afterwards,
 * clear of the first and last column, and ask liquidLine where the surface is.
 */
export function drawLiquid(g, piece, liquid, t = 0) {
  const k = piece === 'top' || /^fill(-[b-z])?$/.test(piece) ? piece : pieceOf(piece)?.piece;
  if (k !== 'top' && !/^fill(-[b-z])?$/.test(k ?? '')) throw new Error(`drawLiquid: "${piece}" is not a piece of a liquid (top, fill, fill-b, ...)`);
  const top = k === 'top', v = !top && k.length > 4 ? k.charCodeAt(5) - 97 : 0;
  for (let x = 0; x < TILE; x++) {
    const line = top ? liquidLine(liquid, x, t) : 0;
    for (let y = line; y < TILE; y++) {
      const c = top && liquid.surface ? liquid.surface(y - line, x, t, line) : null;
      g.dot(x, y, c === null || c === undefined ? liquid.body(x, y, t, v) : c);
    }
  }
  return g;
}

// ---- added with batch P04 (castle tiles): drawCourses, drawBattlement, drawArchway ----
//
//   const fill = patternFill(p.stone, (s) => drawCourses(s, [{ h: 11, joints: [9, 25] }, { h: 10, joints: [3, 17] }, { h: 11, joints: [12, 28] }], { joint: textureTone(p.stone) }));
//   drawBattlement(g, material, t, { merlons: [[8, 23]], top: 10 });                 // one merlon and a gap; goes in the cell above a top tile
//   drawArchway(g, material, t, { x0: 1, x1: 62, spring: 32, crown: 8, band });       // the left half of an archway two tiles wide
//   drawArchway(g, material, t, { x0: -31, x1: 30, spring: 32, crown: 8, band });     // the right half
//   drawArchway(g, backWall, t, { x0: 11, x1: 20, spring: 13, crown: 7, foot: 24 });  // a whole window in one tile

/**
 * Draws stone courses on a tile's pattern: rows of stones with 1 px joints that repeat every 32 px, so a wall of the tile shows unbroken courses; returns the face of every stone.
 * Arguments: s (the 32x32 Surface patternFill hands to its drawing, already filled with the stone's colour); courses ([{ h, joints }] from the top down: h px high each, its last row being the joint under it, the heights adding up to 32; joints: the columns of its upright joints, none for one unbroken stone); options { joint (the joints' colour; left out: nothing is drawn and only the stones are returned), lit (a colour for a short highlight along the top right of each stone, where the light catches it), glint (px of that highlight, default 3), round (true cuts the four corners of every stone: cobbles), shift (px the whole pattern is moved down, going round the bottom of the tile to its top; default 0) }.
 * Returns [{ x, y, w, h, course, inner }]: the top-left pixel and size of each face (a stone that goes round the edge of the tile has x + w or y + h above 32); inner: it keeps 3 px off every edge of the tile, so a version of the fill may recolour or mark it.
 * Give it a shift that puts the tile's top and bottom rows inside one course (no joint row on row 0 or 31): the checker allows no more of a step across a join than there is inside the tile, and a joint row on the boundary is that step.
 * Versions of a fill (fill-b, fill-c) must share the tile's four edge lines: give them the same heights and shift, the same joints in the course that goes round the bottom of the tile, no joint on the first or last column, and keep the joints they change more than `glint` px from the left edge.
 */
export function drawCourses(s, courses, { joint = null, lit = null, glint = 3, round = false, shift = 0 } = {}) {
  const stones = [];
  const put = (x, y, c) => s.dot(wrap(x), wrap(y), c);
  let y0 = wrap(Math.round(shift));
  courses.forEach((c, course) => {
    const h = Math.max(2, Math.round(c.h)), face = h - 1;
    const xs = [...new Set((c.joints ?? []).map((x) => wrap(Math.round(x))))].sort((a, b) => a - b), n = xs.length;
    if (joint) {
      for (let x = 0; x < TILE; x++) put(x, y0 + face, joint);
      for (const x of xs) for (let y = 0; y < face; y++) put(x, y0 + y, joint);
    }
    for (let i = 0; i < Math.max(1, n); i++) {
      const a = n ? xs[i] + 1 : 0, w = n ? (xs[(i + 1) % n] - xs[i] - 1 + TILE) % TILE : TILE, end = a + w - 1;
      if (w < 1) continue;
      const cut = round && n && w >= 3 && face >= 3;
      if (cut && joint) for (const [x, y] of [[a, y0], [end, y0], [a, y0 + face - 1], [end, y0 + face - 1]]) put(x, y, joint);
      if (lit && n && w >= 3) {
        const last = end - (cut ? 1 : 0), run = Math.min(Math.round(glint), w - 2);
        for (let k = 0; k < run; k++) if (last - k >= (end >= TILE ? TILE : 0)) put(last - k, y0, lit);                // never round the edge of the tile
        if (face >= 4) put(end, y0 + 1, lit);
      }
      stones.push({ x: a, y: y0, w, h: face, course, inner: a >= 3 && a + w <= TILE - 3 && y0 >= 3 && y0 + face <= TILE - 3 });
    }
    y0 = wrap(y0 + h);
  });
  return stones;
}

/**
 * Draws battlements from a block's material: merlons standing on the bottom of the tile, inked and banded along their tops and sides like the block itself, with an optional low parapet running between them.
 * Arguments: g (the 32x32 Surface); material (as drawBlock takes it: its fill, ink, round, and the bands of its top, left and right edges; the top edge's inset and wrap are not used); t (the clip phase); options { merlons ([[x0, x1], ...]: the first and last column of each merlon, default [[8, 23]]), top (the row of the merlons' top line, default 8), sill (the row of the parapet's top line between the merlons; 32, the default, for no parapet) }.
 * The piece repeats sideways and has no line along its bottom: it goes in the empty cell above a top tile, whose own outline closes it. A parapet runs off both edges of the tile.
 */
export function drawBattlement(g, material, t = 0, { merlons = [[8, 23]], top = 8, sill = TILE } = {}) {
  const eTop = edgeOf(material, 'top'), eL = edgeOf(material, 'left'), eR = edgeOf(material, 'right');
  const ink = material.ink === undefined ? INK : material.ink, add = ink ? 0 : 1;
  const round = clampInt(material.round ?? 0, 0, 3);
  const y0 = clampInt(top, 0, M), ys = clampInt(sill, y0, TILE);
  const merlonAt = (x) => { const u = wrap(x); return merlons.find(([a, b]) => u >= a && u <= b) ?? null; };
  const solid = (x, y) => {
    if (y >= TILE) return true;
    if (y < 0) return false;
    const m = merlonAt(x);
    if (!m) return y >= ys;
    if (y < y0) return false;
    return !(round && y < ys && Math.min(wrap(x) - m[0], m[1] - wrap(x)) + (y - y0) < round);
  };
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (!solid(x, y)) continue;
    const m = merlonAt(x);
    const corner = m && ys < TILE && y === ys && (x === m[0] || x === m[1]);      // where a merlon's side meets the parapet
    if (ink && (corner || !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1))) { g.dot(x, y, ink); continue; }
    let best = null;
    const band = (e, d, u) => {
      d += add;
      const depth = depthAt(e, u, t);
      if (!e.paint || d < 1 || d > depth || (best && best.d <= d)) return;
      const c = e.paint(d, wrap(u), t, depth);
      if (c !== null && c !== undefined) best = { c, d };
    };
    if (!m) band(eTop, y - ys, x);
    else if (y < ys) { band(eTop, y - y0, x); band(eL, x - m[0], y); band(eR, m[1] - x, y); }
    else {
      // under the level of the parapet: the merlon's own top is far above; the parapet's top band and the merlon's
      // side bands meet in a mitre, as the bands of a block do in an inner corner
      const a = y - ys, bl = x - m[0], br = m[1] - x;
      band(eTop, y - y0, x);
      if (a >= Math.min(bl, br)) band(eTop, a, x); else band(bl <= br ? eL : eR, Math.min(bl, br), y);
    }
    g.dot(x, y, best ? best.c : material.fill(x, y, t, 0));
  }
  return g;
}

/**
 * Draws a fill with an arch-headed opening cut through it: the opening is see-through, its edge takes the material's ink line, and a band can follow it round for the stones of an arch ring or a window's frame.
 * Arguments: g (the 32x32 Surface); material (as drawBlock takes it; only its fill and ink are used: version 0 of the fill, and ink null for no line); t (the clip phase); options { x0, x1 (the first and last open column; they may lie outside 0..31, which is how one tile holds half of an archway two tiles wide), spring (the row the arch springs from: the opening is straight-sided from there down; 32 = the bottom of the tile), crown (the top row of the opening), foot (the last open row; default: the opening runs off the bottom of the tile), band ({ depth, paint(d, u, t, depth), joints: { every, colour } }: depth px of band round the opening; paint gets d px in from the line (1 = the first) and u px along the opening's outline measured from the crown, negative to its left; null from paint shows the fill; joints draws clean 1 px joints across the band every `every` px, counted from half a stone either side of the crown so a keystone sits on it) }.
 * The tile's own edges get no line: it is laid among fill tiles, or inside an opening whose edge tiles are already inked.
 */
export function drawArchway(g, material, t = 0, { x0 = 1, x1 = 2 * TILE - 2, spring = TILE, crown = 8, foot = Infinity, band = null } = {}) {
  const ink = material.ink === undefined ? INK : material.ink, add = ink ? 0 : 1;
  const cx = (x0 + x1 + 1) / 2, rx = Math.max(0.5, (x1 + 1 - x0) / 2), ry = Math.max(0.5, spring - crown);
  const open = (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    if (px < x0 || px > x1 + 1 || py > foot + 1) return false;
    return py >= spring || ((px - cx) / rx) ** 2 + ((py - spring) / ry) ** 2 < 1;
  };
  const depth = band ? Math.max(0, Math.round(band.depth ?? 0)) : 0, reach = depth + 1;
  const R = (rx + ry) / 2, quarter = (Math.PI / 2) * R;
  const along = (x, y) => { const px = x + 0.5, py = y + 0.5; return py >= spring ? Math.sign(px - cx) * (quarter + py - spring) : Math.atan2((px - cx) / rx, (spring - py) / ry) * R; };
  const inBand = new Uint8Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (open(x, y)) continue;
    if (ink && (open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1))) { g.dot(x, y, ink); continue; }
    let c = null;
    if (depth && band.paint) {
      let near = Infinity;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (dx * dx + dy * dy < near && open(x + dx, y + dy)) near = dx * dx + dy * dy;
      const d = Math.ceil(Math.sqrt(near) - 1.01) + add;
      if (d >= 1 && d <= depth) { c = band.paint(d, along(x, y), t, depth); if (c !== null && c !== undefined) inBand[y * TILE + x] = 1; }
    }
    g.dot(x, y, c ?? material.fill(x, y, t, 0));
  }
  if (depth && band.joints && band.joints.every >= 2) {
    const { every, colour } = band.joints;
    const mark = (x, y) => { if (x >= 0 && y >= 0 && x < TILE && y < TILE && inBand[y * TILE + x]) g.dot(x, y, colour); };
    for (let s = every / 2; s < quarter + TILE; s += every) for (const side of [-1, 1]) {
      if (s >= quarter) {
        // down the jambs: a level joint
        const y = Math.floor(spring + s - quarter);
        if (y <= foot) for (let x = 0; x < TILE; x++) if (Math.sign(x + 0.5 - cx) === side) mark(x, y);
        continue;
      }
      // across the ring: a straight line out from the opening, square to its edge
      const a = (side * s) / R, bx = cx + rx * Math.sin(a), by = spring - ry * Math.cos(a);
      let nx = Math.sin(a) / rx, ny = -Math.cos(a) / ry;
      const len = Math.hypot(nx, ny); nx /= len; ny /= len;
      let ax = Math.floor(bx), ay = Math.floor(by);
      const ex = Math.floor(bx + nx * (depth + 2)), ey = Math.floor(by + ny * (depth + 2));
      const dx = Math.abs(ex - ax), dy = -Math.abs(ey - ay), sx = ax < ex ? 1 : -1, sy = ay < ey ? 1 : -1;
      for (let err = dx + dy; ;) {
        mark(ax, ay);
        if (ax === ex && ay === ey) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; ax += sx; }
        if (e2 <= dx) { err += dx; ay += sy; }
      }
    }
  }
  return g;
}

// ---- soft ground (added with batch R04: the meadow's paths) -------------------------------------------------
// Ground laid on other ground on a top-down map (a dirt path, sand, a flower bed, a rug of moss) and the lip of a
// pond want a softer line than a block of rock: corners that are true arcs, and an outline that wanders further in.
// drawSoftBlock draws the same pieces as drawBlock, under the same names, from the same kind of material, so the
// picker, the classifier and the checker need nothing new: build the clips with blockClips as usual.
// Worked example: sprites/tiles-meadow.js.

const softInset = (e, u, t) => { u = wrap(u); return e.inset ? Math.min(clampInt(e.inset(u, t), 0, 8), u, M - u) : 0; };

/**
 * Draw one piece of a block of soft ground (a path, sand, moss, the bank of a pond) on a 32x32 Surface: as drawBlock, but every outer corner is a true arc and the outline may wander up to 8 px in.
 * Arguments: g: the Surface. piece: a name from BLOCK_PIECES or NARROW_PIECES ('top', 'inner-tl', 'strip-l', ...), a
 * fill version ('fill-b') or a whole clip name ('path-top'). material: what drawBlock takes (fill, top, bottom,
 * side or left and right, ink, outside), read differently in five places (below). t: the clip phase, passed on to
 * the material, so a bank or a foam line can move. Returns g.
 *   material.round    0..14: the radius in px of every outer corner (drawBlock cuts 3 px at most). The end of a strip
 *                     or a column is then a round cap, and a tile on its own a round patch
 *   edge.inset(u, t)  0..8 px (drawBlock: 0..3). It is still pinned to the tile boundary at both ends of every edge
 *                     (0 px at u = 0 and 31, at most 1 px at 1 and 30, ...): that is what lets a path one tile wide
 *                     turn a corner, fork and cross itself with the same 20 pieces
 *   edge.paint        each open side of a piece offers its band, and a pixel takes the band it is nearest the start
 *                     of; in a corner's arc depth is measured from the arc. In an inner corner the two bands turn
 *                     round the corner in a quarter circle
 *   outside(x, y, t, out)   also gets `out`, how many px beyond the outline the pixel is (1: the first one), so a
 *                     pond can have a bank of a set width that follows its curve, see-through beyond it (return null)
 *   edge.wrap, edge.tuck, material.face   not used: soft ground has the same kind of edge all round and no front
 * With `ink: null` (floor on floor) the band starts on the outline itself: paint d = 1 is the line round the patch.
 * Pieces of one material join exactly in every arrangement blockJoins lists, at every radius.
 */
export function drawSoftBlock(g, piece, material, t = 0) {
  let name = SHAPES[piece] || /^fill-[b-z]$/.test(piece) ? piece : pieceOf(piece)?.piece;
  let variant = 0;
  if (name && name.startsWith('fill-')) { variant = name.charCodeAt(5) - 97; name = 'fill'; }
  if (!SHAPES[name]) throw new Error(`drawSoftBlock: "${piece}" is not a block piece (${[...BLOCK_PIECES, ...NARROW_PIECES].join(', ')})`);
  const { N, E, S, W, inner = null } = SHAPES[name];
  const edges = { N: edgeOf(material, 'top'), S: edgeOf(material, 'bottom'), W: edgeOf(material, 'left'), E: edgeOf(material, 'right') };
  const ink = material.ink === undefined ? INK : material.ink;
  const R = Math.min(14, Math.max(0, Number(material.round) || 0));
  const add = ink ? 0 : 1;                                   // with no ink line the band starts on the outline itself
  // how far a pixel's centre is inside each open side, in px (under 0: outside it)
  const reach = (x, y) => ({
    N: N ? y + 0.5 - softInset(edges.N, x, t) : FAR, S: S ? M - y + 0.5 - softInset(edges.S, x, t) : FAR,
    W: W ? x + 0.5 - softInset(edges.W, y, t) : FAR, E: E ? M - x + 0.5 - softInset(edges.E, y, t) : FAR,
  });
  const CORNERS = [['N', 'W'], ['N', 'E'], ['S', 'W'], ['S', 'E']];
  // the same, measured from the arc wherever a pixel is in the corner square of two open sides
  const rounded = (r) => {
    const d = { ...r };
    if (R) for (const [a, b] of CORNERS) if (r[a] < R && r[b] < R) { const c = R - Math.hypot(R - r[a], R - r[b]); d[a] = Math.min(d[a], c); d[b] = Math.min(d[b], c); }
    return d;
  };
  const solid = (x, y) => { const d = rounded(reach(x, y)); return d.N >= 0 && d.S >= 0 && d.W >= 0 && d.E >= 0; };
  // one ring of cells round the tile, so the outline knows what is past the tile's own edge
  const P = TILE + 2, mask = new Uint8Array(P * P);
  for (let y = -1; y <= TILE; y++) for (let x = -1; x <= TILE; x++) mask[(y + 1) * P + x + 1] = solid(x, y) ? 1 : 0;
  const at = (x, y) => mask[(y + 1) * P + x + 1];
  const band = (e, d, u) => {
    const depth = depthAt(e, u, t);
    d += add;
    if (!e.paint || d < 1 || d > depth) return null;
    const c = e.paint(d, wrap(u), t, depth);
    return c === null || c === undefined ? null : c;
  };

  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (!at(x, y)) {
      if (material.outside) {
        const d = rounded(reach(x, y)), c = material.outside(x, y, t, Math.ceil(-Math.min(d.N, d.S, d.W, d.E)));
        if (c !== null && c !== undefined) g.dot(x, y, c);
      }
      continue;
    }
    let colour = null;
    if (inner) {
      // an inner corner: every pixel is solid, and depth is the distance from the one cell outside, at the corner
      const a = inner[0] === 't' ? y : M - y, b = inner[1] === 'l' ? x : M - x;
      const d = Math.floor(Math.hypot(a + 1, b + 1) - 1 + 1e-6);
      if (ink && d === 0) { g.dot(x, y, ink); continue; }
      colour = a >= b ? band(edges[inner[0] === 't' ? 'N' : 'S'], d, x) : band(edges[inner[1] === 'l' ? 'W' : 'E'], d, y);
    } else {
      if (ink && (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1))) { g.dot(x, y, ink); continue; }
      const r = reach(x, y), d = rounded(r);
      let best = FAR, near = FAR;
      for (const k of ['N', 'S', 'W', 'E']) {
        if (r[k] >= FAR) continue;
        const depth = Math.floor(d[k]), c = band(edges[k], depth, k === 'N' || k === 'S' ? x : y);
        if (c !== null && (depth < best || (depth === best && r[k] < near))) { best = depth; near = r[k]; colour = c; }
      }
    }
    g.dot(x, y, colour ?? material.fill(x, y, t, variant));
  }
  return g;
}

/**
 * Give the marks of one colour in a tile pattern a lit lip: every `base` pixel just beside a `mark` pixel, on the side away from the light, turns `lit`, wrapping round the tile's edges (creases in rock, joints, cracks).
 * Arguments: s: the Surface a pattern is drawn on (as patternFill hands it to `draw`). mark: the colour of the lines.
 * base: the colour a lip may replace. lit: the lip's colour. opts.dx, opts.dy: where the lip lies from its mark
 * (default -1, 1: down and to the left, for light from the top right). A mark that runs on into the next tile keeps
 * its lip across the join, as long as it leaves every version of the fill at the same place. Returns s.
 */
export function lipMarks(s, mark, base, lit, { dx = -1, dy = 1 } = {}) {
  const m = col(mark), b = col(base), at = (x, y) => s.data[(((y % s.h) + s.h) % s.h) * s.w + (((x % s.w) + s.w) % s.w)], hits = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (at(x, y) === b && at(x - dx, y - dy) === m) hits.push(y * s.w + x);
  for (const i of hits) s.data[i] = col(lit);
  return s;
}

/**
 * Works out how far to move stone courses down (the `shift` of drawCourses) so that no joint row lies on the tile's first or last row, and says which course then goes round the bottom of the tile.
 * Arguments: heights (the courses' heights from the top down, adding up to 32, as drawCourses takes them); from (the smallest shift to try, default 1: the joint under the course that goes round then lands on row from - 1, so a trim band `from - 1` px deep along a top edge sits exactly on a course line).
 * Returns { shift, round }: the first shift from `from` up that keeps every joint row off rows 0 and 31, and the index of the course whose faces cross the tile's bottom edge (every version of a fill must give that course the same joints).
 */
export function courseShift(heights, from = 1) {
  for (let shift = Math.max(0, Math.round(from)); shift < Math.max(0, Math.round(from)) + 2 * TILE; shift++) {
    let y = shift, round = -1, clear = true;
    heights.forEach((h, i) => {
      const joint = wrap(y + h - 1);
      if (joint === 0 || joint === M) clear = false;
      if (Math.floor(y / TILE) !== Math.floor((y + h - 2) / TILE)) round = i;
      y += h;
    });
    if (clear && round >= 0) return { shift, round };
  }
  return { shift: 0, round: -1 };
}

// ---- marks in an edge band that have a top and a bottom (added with batch R04: stones along a path's border) ----
// An edge's paint(d, u) counts d in from the outline and u along the edge, so the same mark comes out turned a
// different way on each of the four edges. These two put a mark back upright, so it keeps the light on its top and
// right whichever edge it lies along. They work in drawBlock and drawSoftBlock alike. Worked example: sprites/tiles-meadow.js.

/**
 * Turn a pixel of an edge band into a column and a row of a box lying in that band, counted from the box's top left on screen, so a mark drawn there stands upright on all four edges.
 * Arguments: which: the edge, 'top', 'bottom', 'left' or 'right'. d, u: the band pixel, as an edge's paint(d, u)
 * gets them (d: px in from the outline, 1 = the first; u: px along the edge, x for top and bottom, y for the sides).
 * box: [u0, d0, along, across]: where the box starts along the edge (it may run on past 31 into the next tile), the
 * depth of its row nearest the outline, how many px it covers along the edge and how many across it.
 * Returns null outside the box, else { col, row, wide, tall }: col 0 is the box's left column and row 0 its top row
 * as seen on screen; wide and tall are its size on screen (along and across swap on the two side edges).
 */
export function bandCell(which, d, u, box) {
  const [u0, d0, along, across] = box;
  const a = wrap(u - u0), b = Math.round(d) - d0;
  if (a >= along || b < 0 || b >= across) return null;
  if (which === 'top') return { col: a, row: b, wide: along, tall: across };
  if (which === 'bottom') return { col: a, row: across - 1 - b, wide: along, tall: across };
  if (which === 'left') return { col: b, row: a, wide: across, tall: along };
  if (which === 'right') return { col: across - 1 - b, row: a, wide: across, tall: along };
  throw new Error(`bandCell: "${which}" is not an edge (top, bottom, left, right)`);
}

/**
 * The colour of a small half-buried stone at one pixel of an edge band, or null where no stone lies: each stone is lit along its top row and right column and dark along its bottom row on every edge, with its two top corners rounded off.
 * Arguments: which, d, u: as bandCell (call it from an edge's paint and fall back to the band's own colour on null).
 * stones: a list of boxes [u0, d0, along, across], as bandCell takes them; the first stone that covers the pixel
 * wins. tones: { light, base, dark }, the stone's colours (a ramp from engine/color.js will do). A stone 2 px wide
 * or less keeps its top corners.
 */
export function bandStone(which, d, u, stones, tones) {
  for (const box of stones ?? []) {
    const c = bandCell(which, d, u, box);
    if (!c) continue;
    if (c.row === 0 && c.wide > 2 && (c.col === 0 || c.col === c.wide - 1)) continue;          // round shoulders
    return c.row === c.tall - 1 ? tones.dark : c.row === 0 || c.col === c.wide - 1 ? tones.light : tones.base;
  }
  return null;
}

// ---- added with batch P05, fix round 1 (cave rock): fillBehind ----
// Every edge piece of a block is drawn over version 0 of the fill, so a wall, an underside or a small island
// built mostly from edge pieces repeats that version's marks every 32 px. Versions of a fill share their four
// edge lines and keep their marks off the outer 3 px, so any of them may lie behind any piece.
const FILL_BEHIND = { 'side-l': 1, 'side-r': 2, bottom: 2, 'bottom-l': 1, 'bottom-r': 1, 'inner-tl': 2, 'inner-tr': 1, 'inner-bl': 1, 'inner-br': 2, 'col-m': 1, 'col-b': 2 };

/**
 * Says which version of the fill to draw behind an edge piece of a block (0 to n - 1, fixed per piece), so that the sides, underside and inner corners of a block do not all repeat version 0.
 * Arguments: piece (a piece name such as 'side-l', or a whole clip name such as 'rock-side-l'), n (how many versions the fill has, default 3). The top row (top, left, right, the strip, col-t, single) and the fill itself get 0, the plainest, and so does any name that is not a block piece.
 * Use it when building the material for one clip: `fill: (x, y, t, v) => versions[v || fillBehind(clip, versions.length)](x, y)`. It is safe only for versions that share their edge lines and keep their marks off the outer 3 px (the checker's S-tile-fill-versions).
 */
export function fillBehind(piece, n = 3) {
  const name = FILL_BEHIND[piece] !== undefined ? piece : pieceOf(piece ?? '')?.piece;
  const count = Math.max(1, Math.floor(n) || 1);
  return (FILL_BEHIND[name] ?? 0) % count;
}
