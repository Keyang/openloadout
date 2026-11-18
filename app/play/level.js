// Playground: the ground of the scene, on a grid of tiles (32 px, docs/style-guide.md section 6).
// Side view: ground, a raised step, a floating island, a thin platform and, when the bag's tiles
// have slopes, a mound. Top-down: a walled room, with a pit or pond and a patch of second ground
// when the bag's tiles have them. The layout is the same with or without tiles in the bag: tiles
// only decide how it is drawn, and with none the page draws a plain ground instead.
//
// THE TILE NAMES THE PLAYGROUND UNDERSTANDS (any prefix <p>; several tilesets in the bag are used together)
//   the block:   <p>-left   <p>-top     <p>-right        top corners and top edge
//                <p>-side-l <p>-fill    <p>-side-r       sides and inside
//                <p>-bottom-l <p>-bottom <p>-bottom-r    underside (top-down wall: its front face)
//                <p>-inner-tl -tr -bl -br                inside corners
//   platforms:   <p>-thin-l <p>-thin-m <p>-thin-r        one tile high, stood on from above
//   slopes:      <p>-slope-up <p>-slope-down             45 degrees, rising and falling to the right
//   columns:     <p>-cap <p>-mid <p>-foot                things that repeat up and down (a ladder, a vine, a post):
//                                                        one column of each stands in a side-view scene
//   decals:      <p>-deco-a ...                          scattered over fill tiles of the same prefix; a decal whose clip
//                                                        says place 'above' or 'below' (engine/tiles.js decoClips) goes in
//                                                        the empty cell above a top tile or under a bottom tile instead
//   Each cell's piece is picked from its neighbours. A missing piece falls back to the nearest one
//   (a corner to its edge, an edge to the fill).
//   Top-down, which block is what: a prefix with only <p>-fill is the floor; a prefix containing
//   "wall" is the wall; a prefix starting pit, water, hole, void, lava, acid or pool is a hole
//   (it blocks the way); any other block is a second ground laid over the floor.
//   Which block is the side-view ground: the first with both -top and -fill. Platforms: every prefix with
//   -thin-m gets a floating platform of its own (the ground's first). Slopes: the first prefix with both slopes.
//   Other clip names (bridge-h, stairs-down, window, ...) are not placed.
// Pure JavaScript: no DOM.
import { hash } from '../../engine/motion.js';

export const UNIT = 32;
const EMPTY = 0, SOLID = 1, UP = 2, DOWN = 3;     // side view cells (UP: a slope rising to the right)
const FLOOR = 0, WALL = 1, HOLE = 2, PATH = 3;     // top-down cells
const SIDE = { cols: 24, rows: 9 };                // in 32 px units
const THIN_SPOTS = [[4, 6, 5], [9, 11, 3], [21, 23, 5], [0, 2, 3]];     // floating platforms: first column, last column, row
const STACK_COLS = [2, 12, 17, 7];                 // where columns (ladders, vines, posts) stand
const TOP = { cols: 20, rows: 12 };

/**
 * The level for a mode.
 *   tile: the tile size (the tileset's frame width; 32 with no tileset).
 *   slopes: build the mound (side view). hole, path: build the pit and the patch of second ground (top-down).
 *   thins: how many floating platforms (side view; one for each kind of platform in the bag, at least one).
 *   stacks: how many columns to stand (side view; one for each ladder, vine or post in the bag).
 * side: { mode, tile, cols, rows, width, height, groundY, cells, thins: [{ c0, c1, r, x0, x1, y }], start, spots }
 * top:  { mode, tile, cols, rows, width, height, cells, start, spots }
 * spots: { pickup, prop, mover }: where the first things of each sort are put ({ x, y } of their ground point).
 */
export function makeLevel(mode, { tile = UNIT, slopes = false, hole = false, path = false, thins = 1, stacks = 0 } = {}) {
  const T = Math.max(8, Math.round(tile));
  const k = Math.max(1, Math.round(UNIT / T));        // cells for each 32 px unit
  const size = mode === 'top' ? TOP : SIDE;
  const cols = size.cols * k, rows = size.rows * k;
  const cells = new Uint8Array(cols * rows);
  // fill a rectangle given in units
  const box = (c0, r0, c1, r1, v) => { for (let r = r0 * k; r < (r1 + 1) * k; r++) for (let c = c0 * k; c < (c1 + 1) * k; c++) cells[r * cols + c] = v; };
  const level = { mode: mode === 'top' ? 'top' : 'side', tile: T, cols, rows, width: cols * T, height: rows * T, cells };
  const U = k * T;                                     // one unit in pixels

  if (level.mode === 'top') {
    box(0, 0, 19, 1, WALL); box(0, 11, 19, 11, WALL); box(0, 0, 0, 11, WALL); box(19, 0, 19, 11, WALL);   // the room: the north wall is two deep so its face shows
    box(8, 4, 10, 5, WALL);                            // a wall to walk round
    if (hole) box(13, 7, 15, 8, HOLE);
    if (path) box(2, 7, 6, 9, PATH);
    level.start = { x: Math.round(2.5 * U), y: Math.round(5.9 * U) };
    const all = [];
    for (let r = 2; r <= 10; r++) for (let c = 1; c <= 18; c++) {
      if ((c + r) % 2 || cells[r * k * cols + c * k] === WALL || cells[r * k * cols + c * k] === HOLE) continue;
      const s = { x: Math.round((c + 0.5) * U), y: Math.round((r + 0.9) * U) };
      if (Math.hypot(s.x - level.start.x, s.y - level.start.y) > U * 1.4) all.push(s);
    }
    all.sort((a, b) => Math.hypot(a.x - level.start.x, a.y - level.start.y) - Math.hypot(b.x - level.start.x, b.y - level.start.y));
    level.spots = { pickup: all.filter((_, i) => i % 3 === 0), prop: all.filter((_, i) => i % 3 === 1), mover: all.filter((_, i) => i % 3 === 2) };
    return level;
  }

  box(0, 7, 23, 8, SOLID);                             // the ground, two deep
  box(13, 5, 16, 6, SOLID);                            // a step up
  box(18, 3, 20, 4, SOLID);                            // a floating island
  level.slopes = !!slopes && k === 1;
  if (level.slopes) { box(8, 6, 8, 6, UP); box(9, 6, 10, 6, SOLID); box(11, 6, 11, 6, DOWN); }
  level.groundY = 7 * U;
  // floating platforms: the first is always there; the others only when the bag has more kinds of platform
  level.thins = THIN_SPOTS.slice(0, Math.max(1, Math.min(THIN_SPOTS.length, thins))).map(([c0, c1, r]) => ({ c0: c0 * k, c1: (c1 + 1) * k - 1, r: r * k, x0: c0 * U, x1: (c1 + 1) * U, y: r * U }));
  // columns three tiles tall, standing on the ground in the gaps between the other things
  level.stacks = k === 1 ? STACK_COLS.slice(0, Math.max(0, stacks)).map((c) => ({ c, r0: 4, r1: 6 })) : [];
  level.start = { x: 40, y: level.groundY };
  const on = (x, from = 0) => ({ x, y: surfaceBelow(level, x, from).y });
  const low = level.groundY - 40;                      // "on the ground": below the platforms
  level.spots = {
    pickup: [on(104, low), on(5.5 * U), on(9.9 * U, low), on(14.5 * U), on(19.5 * U), on(22 * U, low)],
    prop: [on(76, low), on(236, low), on(12.5 * U, low), on(17.5 * U, low), on(23 * U, low)],
    mover: [on(232, low), on(15 * U), on(21 * U, low), on(120, low)],
  };
  return level;
}

/** What a level should have, from the bag's tiles: { tile, slopes, hole, path }. */
export function levelFeatures(index, mode) {
  if (!index) return { tile: UNIT };
  if (mode === 'top') { const s = topSet(index); return { tile: index.tile, hole: !!s.hole, path: !!s.path }; }
  const set = sideSet(index);
  return { tile: index.tile, slopes: !!set.slope, thins: Math.max(1, set.thins.length), stacks: set.stacks.length };
}

// ---- where things can stand ---------------------------------------------------------------------

/** Side view: the cell at a column and row. Past the sides and under the bottom is solid; above the top is empty. */
function cellAt(level, c, r) {
  if (r < 0) return EMPTY;
  if (r >= level.rows || c < 0 || c >= level.cols) return SOLID;
  return level.cells[r * level.cols + c];
}

/** Side view: the height of the ground's surface inside one cell at x, or null when the cell is empty. */
function surfaceIn(level, c, r, x) {
  const v = cellAt(level, c, r), T = level.tile;
  if (v === SOLID) return r * T;
  if (v === UP) return (r + 1) * T - (x - c * T);
  if (v === DOWN) return r * T + (x - c * T);
  return null;
}

/** Side view: true when a point is inside the ground (platforms you can jump up through do not count). */
export function solidAt(level, x, y) {
  const T = level.tile, c = Math.floor(x / T), r = Math.floor(y / T);
  const s = surfaceIn(level, c, r, x);
  return s !== null && y > s + 0.001;
}

/**
 * Side view: the first surface at or below y at this x: { y, thin } (thin: a platform, stood on from above only).
 * With nothing below, the bottom of the level.
 */
export function surfaceBelow(level, x, y) {
  const T = level.tile, c = Math.floor(x / T);
  let best = level.height, thin = false;
  for (let r = Math.max(0, Math.floor((y - 0.001) / T)); r < level.rows; r++) {
    const s = surfaceIn(level, c, r, x);
    if (s === null) continue;
    best = s >= y - 0.001 ? s : y;        // (a point already inside the ground stands where it is)
    break;
  }
  for (const p of level.thins ?? []) if (x >= p.x0 && x <= p.x1 && p.y >= y - 0.001 && p.y < best) { best = p.y; thin = true; }
  return { y: best, thin };
}

/** Side view: how far the flat surface at (x, y) runs to each side: { x0, x1 }. */
export function spanAt(level, x, y) {
  const T = level.tile;
  const flat = (px) => px >= 0 && px < level.width && Math.abs(surfaceBelow(level, px, y - 1).y - y) < 0.5 && !solidAt(level, px, y - 2);
  let x0 = x, x1 = x;
  while (flat(x0 - T / 2)) x0 -= T / 2;
  while (flat(x1 + T / 2)) x1 += T / 2;
  return { x0: Math.max(0, Math.floor(x0 / T) * T), x1: Math.min(level.width, Math.ceil(x1 / T) * T) };
}

/** Side view: the surface under a point with how far it runs: { y, x0, x1 }. */
export function supportAt(level, x, y) {
  const s = surfaceBelow(level, x, y);
  return { y: s.y, ...spanAt(level, x, s.y) };
}

/** Top-down: true for a cell that cannot be walked on: a wall or a hole (outside the room counts as wall). */
export function isWall(level, col, row) {
  if (col < 0 || row < 0 || col >= level.cols || row >= level.rows) return true;
  const v = level.cells[row * level.cols + col];
  return v === WALL || v === HOLE;
}

/** Top-down: true when a rectangle touches a wall or a hole. */
export function hitsWall(level, x0, y0, x1, y1) {
  const T = level.tile;
  for (let r = Math.floor(y0 / T); r <= Math.floor((y1 - 0.001) / T); r++) for (let c = Math.floor(x0 / T); c <= Math.floor((x1 - 0.001) / T); c++) if (isWall(level, c, r)) return true;
  return false;
}

// ---- tiles ------------------------------------------------------------------------------------------

const SUFFIX = /-(inner-(?:tl|tr|bl|br)|bottom-(?:l|r)|side-(?:l|r)|thin-(?:l|m|r)|slope-(?:up|down)|deco-[a-z0-9]+|fill|top|left|right|bottom|cap|mid|foot)$/;
const HOLE_NAME = /^(pit|water|hole|void|lava|acid|pool)/;
const WALL_NAME = /wall/;
// a missing piece falls back to the nearest one it can stand in for
const FALLBACK = {
  left: ['top', 'fill'], right: ['top', 'fill'], top: ['fill'], fill: ['top'],
  'side-l': ['fill'], 'side-r': ['fill'], bottom: ['fill'], 'bottom-l': ['bottom', 'side-l', 'fill'], 'bottom-r': ['bottom', 'side-r', 'fill'],
  'inner-tl': ['fill'], 'inner-tr': ['fill'], 'inner-bl': ['fill'], 'inner-br': ['fill'],
  'thin-l': ['thin-m', 'left', 'top'], 'thin-m': ['top'], 'thin-r': ['thin-m', 'right', 'top'],
  cap: ['mid', 'foot'], mid: ['cap', 'foot'], foot: ['mid', 'cap'],
};

/**
 * Read the tiles of every tileset in the bag. sets: [{ key, names, size, clips }] (key: the bag item; names: its clip
 * names in file order; clips: the sprite's own clip table, read for a decal's `place`).
 * Returns { tile, blocks: [{ prefix, pieces: { fill: { key, clip }, top: ..., 'thin-m': ..., 'slope-up': ... }, decos: [{ key, clip }] }], loose }
 * or null with no tileset. A tileset with none of the names is used whole: its first clip is every piece.
 */
export function tileIndex(sets) {
  if (!sets || !sets.length) return null;
  const blocks = new Map(), loose = [];
  const block = (prefix) => { if (!blocks.has(prefix)) blocks.set(prefix, { prefix, pieces: {}, decos: [] }); return blocks.get(prefix); };
  for (const set of sets) {
    let known = 0;
    for (const clip of set.names) {
      const m = SUFFIX.exec(clip);
      if (!m) { loose.push({ key: set.key, clip }); continue; }
      known++;
      const b = block(clip.slice(0, m.index));
      if (m[1].startsWith('deco-')) b.decos.push({ key: set.key, clip, place: ['above', 'below'].includes(set.clips?.[clip]?.place) ? set.clips[clip].place : 'on' });
      else if (!b.pieces[m[1]]) b.pieces[m[1]] = { key: set.key, clip };
    }
    if (!known && set.names.length) {
      const b = block('');
      if (!b.pieces.fill) b.pieces.fill = { key: set.key, clip: set.names[0] };
    }
  }
  return { tile: sets[0].size ?? UNIT, blocks: [...blocks.values()], loose };
}

/** A piece of a block, or the nearest piece it has. */
function pieceOf(block, name) {
  if (block.pieces[name]) return block.pieces[name];
  for (const alt of FALLBACK[name] ?? []) if (block.pieces[alt]) return block.pieces[alt];
  return block.pieces.fill ?? block.pieces.top ?? null;
}
const isBlock = (b) => !!(b.pieces.top || b.pieces.fill);

/**
 * Side view: which blocks make the ground, the thin platforms, the slopes and the columns.
 * thins: every prefix with thin pieces, the ground's own first; each gets a floating platform, so every kind of
 * platform in the bag is seen. stacks: every prefix with cap, mid or foot pieces (a ladder, a vine, a post).
 */
export function sideSet(index) {
  const real = index.blocks.filter(isBlock);
  const ground = real.find((b) => b.pieces.top && b.pieces.fill) ?? real[0] ?? null;
  const first = (test) => (ground && test(ground) ? ground : index.blocks.find(test) ?? null);
  const hasThin = (b) => !!(b.pieces['thin-m'] || b.pieces['thin-l']);
  const thins = index.blocks.filter(hasThin).sort((a, b) => (b === ground) - (a === ground));
  return {
    ground, thins,
    thin: thins[0] ?? null,
    slope: first((b) => b.pieces['slope-up'] && b.pieces['slope-down']),
    stacks: index.blocks.filter((b) => b.pieces.cap || b.pieces.mid || b.pieces.foot),
  };
}

/** Top-down: which block is the floor, the wall, the hole and the second ground. */
export function topSet(index) {
  const real = index.blocks.filter(isBlock);
  const wall = real.find((b) => WALL_NAME.test(b.prefix)) ?? null;
  const hole = real.find((b) => b !== wall && HOLE_NAME.test(b.prefix)) ?? null;
  const ground = real.filter((b) => b !== wall && b !== hole);
  const base = ground.find((b) => b.pieces.fill && !b.pieces.top) ?? null;
  const path = ground.find((b) => b !== base && b.pieces.top) ?? null;
  return { base: base ?? (path ? null : ground[0] ?? null), wall, hole, path };
}

/**
 * The piece of a block for one cell, from its neighbours. inside(c, r): is that cell part of the same block.
 *   nothing above: left · top · right       nothing below: bottom-l · bottom · bottom-r
 *   between: side-l · side-r, or an inner corner where only a diagonal neighbour is missing, else fill
 */
export function pieceFor(inside, c, r) {
  const N = inside(c, r - 1), S = inside(c, r + 1), W = inside(c - 1, r), E = inside(c + 1, r);
  if (!N) return !W && E ? 'left' : W && !E ? 'right' : 'top';
  if (!S) return !W && E ? 'bottom-l' : W && !E ? 'bottom-r' : 'bottom';
  if (!W && E) return 'side-l';
  if (W && !E) return 'side-r';
  if (!W && !E) return 'fill';
  if (!inside(c - 1, r - 1)) return 'inner-tl';
  if (!inside(c + 1, r - 1)) return 'inner-tr';
  if (!inside(c - 1, r + 1)) return 'inner-bl';
  if (!inside(c + 1, r + 1)) return 'inner-br';
  return 'fill';
}

/**
 * Every tile to draw for a level: { tiles: [{ key, clip, x, y, over }], plain }.
 * tiles are in drawing order; `over` marks the ones drawn after the plain walls (walls and their decals).
 * plain lists what the bag has no tiles for, which the page draws plainly: 'ground', 'thin' (side view), 'floor', 'wall' (top-down).
 */
export function levelTiles(level, index) {
  const T = level.tile, tiles = [], plain = [];
  const put = (piece, c, r, over = false) => { if (piece) tiles.push({ key: piece.key, clip: piece.clip, x: c * T, y: r * T, over }); };
  const at = (c, r) => (c < 0 || r < 0 || c >= level.cols || r >= level.rows ? -1 : level.cells[r * level.cols + c]);
  // a decal of one place ('on', 'above', 'below'), picked and scattered the same way every time
  const decal = (block, place, c, r, chance, over = false) => {
    const pool = block.decos.filter((d) => d.place === place);
    if (!pool.length || hash(c * 7 + 3 + place.length, r * 13 + 5) >= chance) return;
    put(pool[Math.floor(hash(c + 11, r + 17) * pool.length)], c, r, over);
  };

  if (level.mode === 'top') {
    const set = index ? topSet(index) : {};
    if (!set.base) plain.push('floor');
    if (!set.wall) plain.push('wall');
    const layer = (block, value, outside, over) => {
      if (!block) return;
      const inside = (c, r) => { const v = at(c, r); return v === -1 ? outside : v === value; };
      for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
        if (at(c, r) !== value) continue;
        const name = pieceFor(inside, c, r);
        put(pieceOf(block, name), c, r, over);
        if (name === (over ? 'bottom' : 'fill')) decal(block, 'on', c, r, over ? 0.3 : 0.2, over);      // a wall's decals go on its front face
      }
    };
    if (set.base) {
      for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) { put(pieceOf(set.base, 'fill'), c, r); if (at(c, r) === FLOOR) decal(set.base, 'on', c, r, 0.12); }
    }
    layer(set.path, PATH, false, false);
    layer(set.hole, HOLE, false, false);
    layer(set.wall, WALL, true, true);
    return { tiles, plain };
  }

  const set = index ? sideSet(index) : {};
  if (!set.ground) plain.push('ground');
  if (!set.thin && !set.ground) plain.push('thin');
  if (set.ground) {
    const ground = (c, r) => { if (r < 0) return false; const v = at(c, r); return v === -1 || v !== EMPTY; };
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      const v = at(c, r);
      if (v === UP || v === DOWN) { put((set.slope ?? set.ground).pieces[v === UP ? 'slope-up' : 'slope-down'] ?? pieceOf(set.ground, 'top'), c, r); continue; }
      if (v !== SOLID) continue;
      const above = at(c, r - 1);
      const name = above === UP || above === DOWN ? 'fill' : pieceFor(ground, c, r);
      put(pieceOf(set.ground, name), c, r);
      const thinHere = (cc, rr) => level.thins.some((p) => rr === p.r && cc >= p.c0 && cc <= p.c1);
      if (name === 'fill') decal(set.ground, 'on', c, r, 0.25);
      if (name === 'top' && at(c, r - 1) === EMPTY && !thinHere(c, r - 1)) decal(set.ground, 'above', c, r - 1, 0.3);
      if (name.startsWith('bottom') && at(c, r + 1) === EMPTY && !thinHere(c, r + 1)) decal(set.ground, 'below', c, r + 1, 0.6);
    }
  }
  // each floating platform is made of the next kind of platform in the bag (with none: of the ground's top pieces)
  const kinds = set.thins?.length ? set.thins : set.ground ? [set.ground] : [];
  if (kinds.length) level.thins.forEach((p, i) => {
    const thin = kinds[i % kinds.length];
    for (let c = p.c0; c <= p.c1; c++) put(pieceOf(thin, c === p.c0 ? 'thin-l' : c === p.c1 ? 'thin-r' : 'thin-m'), c, p.r);
  });
  // one column of each ladder, vine or post: cap on top, foot on the ground, mid between
  (level.stacks ?? []).forEach((col, i) => {
    const stack = set.stacks?.[i];
    if (!stack) return;
    for (let r = col.r0; r <= col.r1; r++) put(pieceOf(stack, r === col.r0 ? 'cap' : r === col.r1 ? 'foot' : 'mid'), col.c, r);
  });
  return { tiles, plain };
}

/** The kinds of cell, for the page's plain drawing. */
export const CELL = { EMPTY, SOLID, UP, DOWN, FLOOR, WALL, HOLE, PATH };
