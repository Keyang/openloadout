// Playground: the ground of the scene. A level is a small map of letters, one letter for each
// 32 px cell (side view: ground, a step, an island, platforms, a strip, a pillar, a single block
// and, when the bag's tiles have slopes, a mound; top-down: a walled room with walls inside it and,
// when the bag's tiles have them, a pit or pond and a patch of second ground).
//
// WHICH TILE GOES WHERE IS NOT DECIDED HERE. It is decided by the tile helper, engine/tiles.js,
// the same code the preview tool (tools/tilemap.mjs) and the checker use, so the three cannot disagree:
//   classifyTiles(clips)   what a tileset has: blocks (each ground, wall or hole: blockKind), lone fills (floors),
//                          thin platforms, slopes, things that stack (cap, mid, foot), decals and where they go
//   layoutTiles(rows, ...) the clip for every cell of a map of letters: the 13 pieces of a block, the narrow
//                          pieces (strip-l/m/r, col-t/m/b, single), fill versions, thin-l/m/r, slopes, stacks
// The names a tileset must use are listed at the top of engine/tiles.js and in docs/style-guide.md section 6.
// This file only: writes the map, says what is solid in it (for walking and jumping), scatters the
// decals a tileset has over the cells the helper's rules allow, and joins several tilesets in the bag
// into one list for the helper. With no tiles for something, the page draws it plainly instead.
// Pure JavaScript: no DOM.
import { hash } from '../../engine/motion.js';
import { TILE, classifyTiles, layoutTiles, pickPiece } from '../../engine/tiles.js';

export const UNIT = TILE;
const EMPTY = 0, SOLID = 1, UP = 2, DOWN = 3;     // side view cells (UP: a slope rising to the right)
const FLOOR = 0, WALL = 1, HOLE = 2, PATH = 3;     // top-down cells

// The maps. The letters are layoutTiles' own: side view '#' the first block, 'I' the second (else the first),
// '/' '\' slopes, '=' '-' thin platforms, '|' ':' '!' things that stack; top-down 'W' the wall, 'O' the hole,
// 'P' 'Q' other ground laid over the floor; '.' nothing.
const SIDE_MAP = [
  '........................',
  '...#................####',     // a pillar one tile wide (col-t, col-m, col-b); a mass high up with a part hanging
  '...#.........###....####',     // under it (bottom pieces, inner-bl, inner-br); a strip one tile high (strip-l/m/r)
  '...#...#.........II..##.',     // a block on its own (single); the top of a small floating island
  '.................II.....',
  '............####........',     // a step up, two tiles high
  '............####........',
  '########################',     // the ground, two deep
  '########################',
];
const TOP_MAP = [
  'WWWWWWWWWWWWWWWWWWWW',         // the north wall is two deep, so its front face shows
  'WWWWWWWWWWWWWWWWWWWW',
  'W..................W',
  'W...............W..W',         // a wall one tile thick
  'W.......WWW.....W..W',         // a wall to walk round: its top, then its face
  'W.......WWW.....W..W',
  'W..................W',
  'W..................W',
  'W..................W',
  'W..................W',
  'W..................W',
  'WWWWWWWWWWWWWWWWWWWW',
];
const THIN_SPOTS = [[4, 6, 5], [9, 11, 3], [20, 22, 5]];   // floating platforms: first column, last column, row
const THIN_LETTERS = ['=', '-', '~'];                      // '~' is given to the helper in the legend
const STACK_COLS = [2, 11, 16, 19];                        // where ladders, vines and posts stand, three tiles tall
const STACK_LETTERS = ['|', ':', '!', '¦'];
const DECAL_LETTERS = 'αβγδεζηθικλμνξοπρστυφχψω';          // private letters for decals, named in the legend

/**
 * The level for a mode ('side' or 'top'). What it has follows the bag's tiles (levelFeatures):
 *   slopes: build the mound. thins: how many floating platforms (one for each kind of platform in the bag).
 *   strip: the bag has a block but no platform pieces, so the platform is a strip of the block (solid).
 *   stacks: how many columns to stand (one for each ladder, vine or post in the bag).
 *   hole, path, path2: build the pit, and the patches of second and third ground (top-down).
 * Returns { mode, tile, cols, rows, width, height, map (the letters), cells, start, spots } and, side view,
 * { groundY, slopes, thins: [{ c0, c1, r, x0, x1, y }], stacks: [{ c, r0, r1 }] }.
 * spots: { pickup, prop, mover }: where the first things of each sort are put ({ x, y } of their ground point).
 */
export function makeLevel(mode, { slopes = false, thins = 1, strip = false, stacks = 0, hole = false, path = false, path2 = false } = {}) {
  const T = TILE, top = mode === 'top';
  const map = (top ? TOP_MAP : SIDE_MAP).map((row) => [...row]);
  const rows = map.length, cols = map[0].length;
  const set = (c0, c1, r0, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) map[r][c] = ch; };
  const level = { mode: top ? 'top' : 'side', tile: T, cols, rows, width: cols * T, height: rows * T, map };

  if (top) {
    if (hole) set(13, 15, 7, 8, 'O');
    if (path) set(2, 6, 7, 9, 'P');
    if (path2) set(9, 11, 9, 10, 'Q');
    level.cells = Uint8Array.from(map.flat().map((ch) => (ch === 'W' ? WALL : ch === 'O' ? HOLE : ch === 'P' || ch === 'Q' ? PATH : FLOOR)));
    level.start = { x: Math.round(2.5 * T), y: Math.round(5.9 * T) };
    const all = [];
    for (let r = 2; r <= 10; r++) for (let c = 1; c <= 18; c++) {
      if ((c + r) % 2 || isWall(level, c, r)) continue;
      const s = { x: Math.round((c + 0.5) * T), y: Math.round((r + 0.9) * T) };
      if (Math.hypot(s.x - level.start.x, s.y - level.start.y) > T * 1.4) all.push(s);
    }
    all.sort((a, b) => Math.hypot(a.x - level.start.x, a.y - level.start.y) - Math.hypot(b.x - level.start.x, b.y - level.start.y));
    level.spots = { pickup: all.filter((_, i) => i % 3 === 0), prop: all.filter((_, i) => i % 3 === 1), mover: all.filter((_, i) => i % 3 === 2) };
    return level;
  }

  level.slopes = !!slopes;
  if (level.slopes) { map[6][7] = '/'; map[6][8] = '#'; map[6][9] = '#'; map[6][10] = '\\'; }      // a mound to walk over
  // floating platforms: thin ones (stood on from above) when the bag has platform pieces or no tiles at all;
  // a strip of the block, one tile thick, when the bag has a block but no platform pieces
  level.thins = [];
  if (strip) set(THIN_SPOTS[0][0], THIN_SPOTS[0][1], THIN_SPOTS[0][2], THIN_SPOTS[0][2], '#');
  else THIN_SPOTS.slice(0, Math.max(0, thins)).forEach(([c0, c1, r], i) => {
    set(c0, c1, r, r, THIN_LETTERS[i]);
    level.thins.push({ c0, c1, r, x0: c0 * T, x1: (c1 + 1) * T, y: r * T });
  });
  // columns three tiles tall, standing on the ground in the gaps between the other things
  level.stacks = STACK_COLS.slice(0, Math.max(0, stacks)).map((c, i) => { set(c, c, 4, 6, STACK_LETTERS[i]); return { c, r0: 4, r1: 6 }; });
  level.cells = Uint8Array.from(map.flat().map((ch) => (ch === '#' || ch === 'I' ? SOLID : ch === '/' ? UP : ch === '\\' ? DOWN : EMPTY)));
  level.groundY = 7 * T;
  level.start = { x: 40, y: level.groundY };
  const on = (x, from = 0) => ({ x, y: surfaceBelow(level, x, from).y });
  const low = level.groundY - 40;                      // "on the ground": below the platforms
  level.spots = {
    pickup: [on(104, low), on(5.5 * T, 4.5 * T), on(9 * T, low), on(13.5 * T, 3.5 * T), on(18 * T), on(21.5 * T, low)],
    prop: [on(76, low), on(208, low), on(11.5 * T, low), on(16.5 * T, low), on(23.3 * T, low)],
    mover: [on(190, low), on(14 * T, 3.5 * T), on(22.5 * T, low), on(120, low)],
  };
  return level;
}

/**
 * What a level should have, from the bag's tiles as the helper sorted them (tileIndex), or null with none.
 * Returns the options makeLevel takes.
 */
export function levelFeatures(index, mode) {
  if (!index) return {};
  const T = index.tiles;
  if (mode === 'top') {
    const grounds = T.blocks.filter((b) => b.kind === 'ground');
    return { hole: T.blocks.some((b) => b.kind === 'hole'), path: grounds.length > 0, path2: grounds.length > 1 };
  }
  const first = T.blocks[0];
  const slope = (first && T.slopes.find((s) => s.prefix === first.prefix)) || T.slopes[0];      // the helper's own choice for '/' and '\'
  return {
    slopes: !!(first && slope && slope.up && slope.down),
    thins: T.thins.length ? Math.min(T.thins.length, THIN_SPOTS.length) : first ? 0 : 1,
    strip: !T.thins.length && !!first,
    stacks: Math.min(T.stacks.length, STACK_COLS.length),
  };
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

// ---- tiles: everything here is asked of engine/tiles.js ------------------------------------------------

/**
 * Join the tilesets in the bag into one list and let the helper sort it.
 * sets: [{ key, names, size, clips }] (key: the bag item; names: its clip names in file order; clips: the sprite's
 * own clip table, where the helper's blockClips and decoClips leave a block's kind and a decal's place).
 * Returns { tile, tiles (what classifyTiles returned), keyOf (clip name -> the bag item it came from) }, or null
 * with no tileset. When two tilesets use the same clip name, the first one in the bag keeps it.
 */
export function tileIndex(sets) {
  if (!sets || !sets.length) return null;
  const keyOf = new Map(), list = [];
  for (const set of sets) for (const name of set.names) {
    if (keyOf.has(name)) continue;
    keyOf.set(name, set.key);
    list.push({ name, place: set.clips?.[name]?.place, block: set.clips?.[name]?.block });
  }
  return { tile: TILE, tiles: classifyTiles(list), keyOf };
}

/**
 * The level as the helper's layoutTiles takes it: { rows (strings of letters), legend, view }.
 * The level's own letters are layoutTiles' standard ones. Added here: a letter for a third platform or a fourth
 * column, and one private letter for each decal the bag has, scattered (the same way every time) over the cells
 * the helper's rules allow: an 'on' decal over a fill cell of its block or over the floor, an 'above' decal in
 * the empty cell over a top piece, a 'below' decal in the empty cell under a bottom piece.
 */
export function levelMap(level, index) {
  const view = level.mode === 'top' ? 'top-down' : 'side';
  const map = level.map.map((row) => [...row]);
  const legend = {};
  if (!index) return { rows: map.map((r) => r.join('')), legend, view };
  const T = index.tiles, { cols, rows } = level;
  const letter = (c, r) => level.map[Math.max(0, Math.min(rows - 1, r))][Math.max(0, Math.min(cols - 1, c))];     // the map carries on past its edges
  if (T.thins[2]) legend[THIN_LETTERS[2]] = `thin:${T.thins[2].prefix}`;
  if (T.stacks[3]) legend[STACK_LETTERS[3]] = `stack:${T.stacks[3].prefix}`;

  // which block each letter stands for, as layoutTiles reads them
  const grounds = T.blocks.filter((b) => b.kind === 'ground');
  const blockOf = view === 'side'
    ? { '#': T.blocks[0], I: T.blocks[1] ?? T.blocks[0], '/': T.blocks[0], '\\': T.blocks[0] }
    : { W: T.blocks.find((b) => b.kind === 'wall'), O: T.blocks.find((b) => b.kind === 'hole'), P: grounds[0], Q: grounds[1] };
  const prefixAt = (c, r) => blockOf[letter(c, r)]?.prefix ?? null;
  const pieceAt = (c, r) => { const p = prefixAt(c, r); return p === null ? null : pickPiece((x, y) => prefixAt(x, y) === p, c, r); };
  const empty = (c, r) => r >= 0 && r < rows && c >= 0 && c < cols && level.map[r][c] === '.';
  const floor = view === 'top-down' ? T.floors[0] : null;

  T.decals.slice(0, DECAL_LETTERS.length).forEach((d, i) => {
    const ch = DECAL_LETTERS[i];
    legend[ch] = d.clip;
    const chance = d.place === 'on' ? (floor && d.prefix === floor.prefix ? 0.12 : 0.25) : d.place === 'above' ? 0.3 : 0.6;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (map[r][c] !== level.map[r][c] || hash(c * 7 + 3 + i * 31, r * 13 + 5) >= chance) continue;      // one decal to a cell
      const fits = d.place === 'on' ? (prefixAt(c, r) === d.prefix && pieceAt(c, r) === 'fill') || (!!floor && d.prefix === floor.prefix && empty(c, r))
        : d.place === 'above' ? empty(c, r) && r + 1 < rows && prefixAt(c, r + 1) === d.prefix && pieceAt(c, r + 1) === 'top'
          : empty(c, r) && r > 0 && prefixAt(c, r - 1) === d.prefix && String(pieceAt(c, r - 1)).startsWith('bottom');
      if (fits) map[r][c] = ch;
    }
  });
  return { rows: map.map((r) => r.join('')), legend, view };
}

/**
 * Every tile to draw for a level, as layoutTiles lays it out: { tiles: [{ key, clip, x, y, over }], plain, bare }.
 * tiles are in drawing order (key: the bag item the clip is from); `over` marks walls, platforms and decals, drawn
 * after the page's plain walls. What the bag has no tiles for, the page draws plainly: plain lists which
 * ('ground', 'thin' in side view; 'floor', 'wall' top-down) and bare (a Set of 'col,row') the ground or wall cells
 * that got no tile.
 */
export function levelTiles(level, index) {
  const top = level.mode === 'top';
  const map = levelMap(level, index);
  const laid = index ? layoutTiles(map.rows, index.tiles, { view: map.view, legend: map.legend }) : { tiles: [] };
  const tiles = laid.tiles.map((t) => ({ key: index.keyOf.get(t.clip), clip: t.clip, x: t.col * TILE, y: t.row * TILE, over: t.layer >= WALL_LAYER }));
  const covered = new Set(laid.tiles.filter((t) => t.layer === (top ? WALL_LAYER : GROUND_LAYER)).map((t) => `${t.col},${t.row}`));
  const bare = new Set();
  for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
    const v = level.cells[r * level.cols + c];
    if ((top ? v === WALL : v !== EMPTY) && !covered.has(`${c},${r}`)) bare.add(`${c},${r}`);
  }
  const plain = [];
  if (top) {
    if (!index || !index.tiles.floors.length) plain.push('floor');
    if (bare.size) plain.push('wall');
  } else {
    if (bare.size) plain.push('ground');
    const thinTiles = new Set(laid.tiles.filter((t) => t.layer === THIN_LAYER).map((t) => `${t.col},${t.row}`));
    if (level.thins.some((p) => !thinTiles.has(`${p.c0},${p.r}`))) plain.push('thin');
  }
  return { tiles, plain, bare };
}
// the layers layoutTiles sorts its tiles into (floor 0, stack 1, ground 2, hole 3, wall 4, thin 5, decal 6)
const GROUND_LAYER = 2, WALL_LAYER = 4, THIN_LAYER = 5;

/** The kinds of cell, for the page's plain drawing. */
export const CELL = { EMPTY, SOLID, UP, DOWN, FLOOR, WALL, HOLE, PATH };
