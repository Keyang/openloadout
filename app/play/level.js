// Playground: the ground of the scene. A level is a small map of letters, one letter for each 32 px cell,
// written to show whatever tiles the bag holds:
//   side view   ground two deep, a step, a floating island, platforms (one for each kind in the bag), a ledge one
//               tile thick, a block two tall and a single block; with slopes a mound; with a liquid a pool in a dip
//               (water behind its banks) and, with a waterfall, a fall into it from under the ledge; for each back
//               wall in the bag a tower and a hall with that wall behind (an archway at the tower's foot, a window
//               and battlements where the tileset has those clips); at the far end a post and the cliff that ends
//               the level, with a window through it. Between them these use every piece a block can have.
//               NOTHING STANDS ABOVE THE VIEW'S RESTING TOP EDGE. The view shows 180 px of a 288 px level, resting
//               with its top a little above row 3 (draw.js cameraFloor). Whatever lay in rows 0 to 2 was cut by that
//               edge and looked as if it hung from the top of the picture, so those rows are empty: they are the sky
//               the view climbs into when the player jumps. Whatever floats has two tiles of room under it.
//   top-down    a walled room on the first floor in the bag: walls with faces, a wall one tile thick, a lane of
//               second ground with a crossing and a bend that leads to a square, a pond or pit that cannot be walked
//               into (a bridge over it where the tileset has one), a second pit, a patch of any other floor, and a
//               rail fence round a yard where the tileset has one (its wood blocks the way)
//
// NOTHING ABOUT TILES IS DECIDED HERE. It is all asked of the tile helper, engine/tiles.js, the same code the
// preview tool (tools/tilemap.mjs), the scene tool (tools/scene.mjs) and the checker use:
//   classifyTiles([{ key, clips, names }])   what the tilesets in the bag have, together: blocks (each ground, wall,
//                          hole or liquid), lone fills (floors and back walls), thin platforms, slopes, stacks, decals
//   layoutTiles(rows, tiles, { view, legend, decals: true })   for a map of letters: the clip for every cell, the
//                          decals scattered by its own rule, and which cells are solid, tiles or no tiles
// The names a tileset must use are listed at the top of engine/tiles.js and in docs/style-guide.md section 6.
// The map is kept as text (engine/maptext.js writeMap): levelText gives it, the page offers it to copy, and
// tools/scene.mjs or a game can read it back. Where the bag has no tiles at all for something (no block, no
// platform, no floor, no wall), the page draws that plainly.
// Pure JavaScript: no DOM.
import { TILE, classifyTiles, layoutTiles } from '../../engine/tiles.js';
import { writeMap } from '../../engine/maptext.js';
import { FENCE } from '../../engine/fences.js';

export const UNIT = TILE;
const EMPTY = 0, SOLID = 1, UP = 2, DOWN = 3;     // side view cells (UP: a slope rising to the right)
const FLOOR = 0, WALL = 1, HOLE = 2, PATH = 3;     // top-down cells
const WADE_DEPTH = 20;                             // how far under the top of a pool's first cell a wader's feet are
const NO_TILES = classifyTiles({});                // a map can be read for what is solid with no tiles at all

// The maps. The letters are layoutTiles' own: side view '#' the ground, 'I' a second block, '/' '\' slopes,
// '~' a liquid, '=' '-' thin platforms, '|' ':' '!' things that stack; top-down 'W' the wall, 'O' the hole,
// 'P' 'Q' ground laid over the floor; '.' nothing. Every other letter is named in the level's legend.
const SIDE_MAP = [
  '........................',     // rows 0 to 2 are sky: see the note at the top of this file
  '........................',
  '........................',
  '...#...#........II.###..',     // a block two tall (col-t, col-b); a block on its own (single); a small floating
  '...#............II......',     // island; a ledge one tile thick (strip-l/m/r), which a waterfall pours from
  '............###.........',     // a step up, two tiles high
  '............###.........',
  '########################',     // the ground, two deep
  '########################',
];
// The far end of every side-view level, after the halls: a post two tiles tall (col-t, col-m), low enough to jump,
// and the cliff that ends the level, with a window through the rock (round the window: bottom, inner-bl, inner-br).
// The cliff is the end: nothing lies beyond it, so it is in nobody's way. (A rock with room to walk under an
// underside like that would need five rows above the ground, and the view shows four.)
// POST: the post's column. CLIFF: the cliff's first column.
const SIDE_END = [
  '..........',
  '..........',
  '..........',
  '....######',
  '....######',
  '.#..##..##',
  '.#..######',
  '##########',
  '##########',
];
const POST = 1, CLIFF = 4;
const TOP_MAP = [
  'WWWWWWWWWWWWWWWWWWWWWWWW',     // the north wall is two deep, so its front face shows
  'WWWWWWWWWWWWWWWWWWWWWWWW',
  'W......................W',
  'W................W.....W',     // a wall one tile thick
  'W.......WWW......W.....W',     // a wall to walk round: its top, then its face
  'W.......WWW......W.....W',
  'W......................W',
  'W......................W',
  'W......................W',
  'W......................W',
  'W......................W',
  'W......................W',
  'W......................W',
  'WWWWWWWWWWWWWWWWWWWWWWWW',
];
const THIN_SPOTS = [[4, 6, 5], [9, 11, 3], [21, 23, 5]];   // floating platforms: first column, last column, row
const THIN_LETTERS = ['=', '-', '_'];
const STACK_COLS = [0, 11, 15, 18];                        // where ladders, vines and posts stand, three tiles tall
const STACK_LETTERS = ['|', ':', '!', '%'];
const POOL = { c0: 19, c1: 21, row: 7, fall: 20 };          // the dip the pool lies in, and the column a waterfall comes down
// the letters of one tower and hall: block, block with the back wall behind it, back wall, window, battlement, arch halves
const HALL_LETTERS = [{ S: 'S', R: 'R', K: 'K', N: 'N', M: 'M', A: 'A', Z: 'Z' }, { S: 'C', R: 'D', K: 'E', N: 'G', M: 'J', A: 'U', Z: 'X' }];
const HALL_WIDTH = 8;

const list = (v, letters) => (Array.isArray(v) ? v : Array.from({ length: Math.max(0, Number(v) || 0) }, () => null)).slice(0, letters);

/** Side view: the letters and the legend for what the bag has (the options of makeLevel). */
function sideMap(f) {
  const map = SIDE_MAP.map((row) => [...row]), legend = {};
  const set = (c0, c1, r0, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) map[r][c] = ch; };
  const G = f.ground ?? null;
  // say which block each standard letter is, so the text reads the same whatever order the tilesets are in
  if (G) { legend['#'] = `block:${G}`; legend.I = `block:${f.second ?? G}`; }
  if (f.slopes) {
    set(7, 7, 6, 6, '/'); set(8, 9, 6, 6, '#'); set(10, 10, 6, 6, '\\');                  // a mound to walk over
    if (typeof f.slopes === 'string') { legend['/'] = `slope-up:${f.slopes}`; legend['\\'] = `slope-down:${f.slopes}`; }
  }
  // floating platforms: thin ones (stood on from above) when the bag has platform pieces or no tiles at all;
  // a strip of the block, one tile thick, when the bag has a block but no platform pieces
  if (f.strip) set(THIN_SPOTS[0][0], THIN_SPOTS[0][1], THIN_SPOTS[0][2], THIN_SPOTS[0][2], '#');
  else list(f.thins ?? 1, THIN_SPOTS.length).forEach((prefix, i) => {
    const [c0, c1, r] = THIN_SPOTS[i];
    set(c0, c1, r, r, THIN_LETTERS[i]);
    if (prefix) legend[THIN_LETTERS[i]] = `thin:${prefix}`;
  });
  // columns three tiles tall, standing on the ground in the gaps between the other things
  const stacks = list(f.stacks ?? 0, STACK_COLS.length).map((prefix, i) => {
    set(STACK_COLS[i], STACK_COLS[i], 4, 6, STACK_LETTERS[i]);
    if (prefix) legend[STACK_LETTERS[i]] = `stack:${prefix}`;
    return { c: STACK_COLS[i], r0: 4, r1: 6 };
  });
  // a pool in a dip: the liquid, with its fill behind the ground cells that hold it, so their dents show water
  if (f.pool) {
    legend['~'] = `liquid:${f.pool}`;
    const bank = G ? 'B' : '#';
    if (G) legend.B = [`back:${f.pool}`, `block:${G}`];
    set(POOL.c0, POOL.c1, POOL.row, POOL.row, '~');
    set(POOL.c0 - 1, POOL.c0 - 1, POOL.row, POOL.row, bank); set(POOL.c1 + 1, POOL.c1 + 1, POOL.row, POOL.row, bank);
    set(POOL.c0, POOL.c1, POOL.row + 1, POOL.row + 1, bank);
  }
  // a waterfall from under the ledge above, down to the pool's surface (its foot takes the place of the surface there)
  if (f.fall) {
    legend.V = `liquid:${f.fall}`;
    set(POOL.fall, POOL.fall, 4, f.pool ? POOL.row : POOL.row - 1, 'V');
  }
  // for each back wall in the bag: a tower with an archway at its foot, and a hall under a roof with that wall behind
  const halls = [];
  (f.interiors ?? []).slice(0, HALL_LETTERS.length).forEach((it, i) => {
    const L = HALL_LETTERS[i], x = map[0].length;
    halls.push(x);
    map.forEach((row, r) => row.push(...(r >= 7 ? '#' : '.').repeat(HALL_WIDTH)));
    const S = it.block ? L.S : '#', R = it.block ? L.R : '#';
    if (it.block) { legend[L.S] = `block:${it.block}`; legend[L.R] = [`back:${it.floor}`, `block:${it.block}`]; }
    legend[L.K] = `floor:${it.floor}`;
    // Its top is at row 3, inside the view when the player stands on the ground (the view shows from row 2.6 down).
    set(x + 1, x + 1, 4, 5, S);                                                              // the tower's outer side
    set(x + 2, x + 6, 4, 4, R);                                                              // the roof, with the wall behind it
    set(x + 2, x + 2, 5, 5, R); set(x + 6, x + 6, 5, 5, R);                                  // the tower's inner side; the end wall
    set(x + 3, x + 5, 5, 6, L.K); set(x + 6, x + 6, 6, 6, L.K);                              // the back wall; a way out
    set(x + 1, x + 2, 6, 6, L.K);
    if (it.archL && it.archR && it.block) {
      legend[L.A] = [`back:${it.floor}`, `open:${it.block}:${it.archL}`]; legend[L.Z] = [`back:${it.floor}`, `open:${it.block}:${it.archR}`];
      map[6][x + 1] = L.A; map[6][x + 2] = L.Z;
    }
    if (it.window) { legend[L.N] = it.window; map[5][x + 4] = L.N; }
    if (it.battlement) { legend[L.M] = it.battlement; set(x + 1, x + 6, 3, 3, L.M); }
  });
  // the far end: the post and the cliff
  const end = map[0].length;
  map.forEach((row, r) => row.push(...SIDE_END[r]));
  return { map, legend, stacks, halls, end };
}

/** Top-down: the letters and the legend for what the bag has. */
function topMap(f) {
  const map = TOP_MAP.map((row) => [...row]), legend = {};
  const set = (c0, c1, r0, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) map[r][c] = ch; };
  const grounds = list(f.grounds ?? (f.path ? 1 : 0), 2), holes = list(f.holes ?? (f.hole ? 1 : 0), 2), floors = list(f.floors ?? 0, 2);
  if (f.wall) legend.W = `block:${f.wall}`;
  if (grounds.length) {
    // a lane one tile wide: down the room, across it (a crossing), and round a bend to a square
    if (grounds[0]) legend.P = `block:${grounds[0]}`;
    set(4, 4, 3, 10, 'P'); set(2, 13, 6, 6, 'P'); set(13, 13, 7, 8, 'P');
    const square = grounds.length > 1 ? 'Q' : 'P';
    if (grounds[1]) legend.Q = `block:${grounds[1]}`;
    set(11, 14, 9, 11, square);
  }
  // a pond or a pit: the first hole in the bag, or a liquid; a bridge across it where the tileset has one
  const pond = holes.length ? 'O' : f.liquid ? '~' : null;
  if (pond) {
    const what = holes.length ? (holes[0] ? `block:${holes[0]}` : null) : `liquid:${f.liquid}`;
    if (what) legend[pond] = what;
    set(16, 19, 7, 9, pond);
    if (f.bridge && what) { legend.H = [what, f.bridge]; set(16, 19, 8, 8, 'H'); }
  }
  if (holes.length > 1) { if (holes[1]) legend.X = `block:${holes[1]}`; set(19, 21, 3, 4, holes[1] ? 'X' : 'O'); }
  // any other floor in the bag (the planks of a house): a patch of it
  if (floors[1]) { legend.L = `floor:${floors[1]}`; set(6, 9, 10, 11, 'L'); }
  // a rail fence round the yard (the fence helper's recipe: a post, a run of rails along the top, a column down each
  // side); the south side is left open, the way in
  if (f.fence) {
    legend.T = f.fence.post; legend.Y = f.fence.h; legend.J = f.fence.v;
    map[9][5] = 'T'; set(6, 9, 9, 9, 'Y'); set(5, 5, 10, 11, 'J');
    if (floors[1]) { legend.N = [`floor:${floors[1]}`, f.fence.v]; set(9, 9, 10, 11, 'N'); } else set(9, 9, 10, 11, 'J');
  }
  return { map, legend, stacks: [] };
}

/**
 * The level for a mode ('side' or 'top'), from what the bag's tiles have (levelFeatures gives these options):
 *   tiles: the helper's classification, used to read the map. ground, second: the prefixes of the first two blocks.
 *   slopes: true or a prefix: build the mound. thins: how many floating platforms, or their prefixes.
 *   strip: the bag has a block but no platform pieces, so the platform is a strip of the block (solid).
 *   stacks: how many columns to stand, or their prefixes. pool, fall: the prefixes of a liquid and of a waterfall.
 *   interiors: [{ floor, block, archL, archR, window, battlement }], a tower and hall for each back wall.
 *   top-down: wall (prefix); grounds, holes, floors (prefixes, or path / hole: true for one); liquid; bridge (a clip);
 *   fence: { h, v, post } (clips).
 * Also on the level: wet (a Set of 'col,row': the cells of liquid), blocks ([{ x0, y0, x1, y1 }]: the wood of fences,
 * which cannot be walked through), harmful (set by the page: the pool's liquid hurts).
 * What is solid, a slope or a platform is read from layoutTiles' cells for the map, not worked out here.
 * Returns { mode, tile, cols, rows, width, height, map (the letters), legend, cells, start, spots } and, side view,
 * { groundY, slopes, thins: [{ c0, c1, r, x0, x1, y }], stacks: [{ c, r0, r1 }], post: { c } (the column of the post
 * at the far end), cliff: { c0 } (the first column of the cliff that ends the level) }.
 * spots: { pickup, prop, mover }: where the first things of each sort are put ({ x, y } of their ground point).
 */
export function makeLevel(mode, f = {}) {
  const T = TILE, top = mode === 'top';
  const { map, legend, stacks, halls, end } = top ? topMap(f) : sideMap(f);
  const rows = map.length, cols = map[0].length;
  const level = { mode: top ? 'top' : 'side', tile: T, cols, rows, width: cols * T, height: rows * T, map, legend };
  // the helper says what each cell is: a block, a slope, a platform, a liquid; and, top-down, a wall, a hole or ground
  const cells = layoutTiles(map.map((r) => r.join('')), f.tiles ?? NO_TILES, { view: top ? 'top-down' : 'side', legend }).cells;
  level.wet = new Set();
  level.blocks = [];
  level.harmful = false;
  cells.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.kind === 'liquid') level.wet.add(`${c},${r}`);
    // a fence blocks where its wood stands (engine/fences.js says where): the rails of a run, the strip of a column, a post
    for (const t of cell.things) {
      if (t.kind !== 'clip' || !f.fence) continue;
      const x = c * T, y = r * T, [px0, px1, , py1] = FENCE.post;
      if (t.clip === f.fence.h) level.blocks.push({ x0: x, x1: x + T, y0: y + FENCE.rails[1], y1: y + py1 + 1 });
      else if (t.clip === f.fence.v) level.blocks.push({ x0: x + FENCE.strip[0] - 1, x1: x + px1 + 1, y0: y, y1: y + T });
      else if (t.clip === f.fence.post) level.blocks.push({ x0: x + px0, x1: x + px1 + 1, y0: y + FENCE.rails[1], y1: y + py1 + 1 });
    }
  }));

  if (top) {
    const kindOf = (prefix) => (f.tiles ?? NO_TILES).blocks.find((b) => b.prefix === prefix)?.kind;
    level.cells = Uint8Array.from(cells.flat().map((cell) => {
      // a bridge makes water walkable; water and pits are not; walls are not; other ground is
      if (cell.things.some((t) => t.kind === 'clip' && /^bridge/.test(t.clip))) return PATH;
      if (cell.kind === 'liquid') return HOLE;
      const block = cell.things.find((t) => t.kind === 'block' || t.kind === 'part');
      if (!block) return FLOOR;
      if (!cell.solid) return PATH;
      return (kindOf(block.prefix) ?? block.as) === 'hole' ? HOLE : WALL;
    }));
    level.start = { x: Math.round(2.5 * T), y: Math.round(4.9 * T) };
    const all = [];
    for (let r = 2; r <= rows - 2; r++) for (let c = 1; c <= cols - 2; c++) {
      if ((c + r) % 2 || isWall(level, c, r)) continue;
      const s = { x: Math.round((c + 0.5) * T), y: Math.round((r + 0.9) * T) };
      if (Math.hypot(s.x - level.start.x, s.y - level.start.y) > T * 1.4) all.push(s);
    }
    all.sort((a, b) => Math.hypot(a.x - level.start.x, a.y - level.start.y) - Math.hypot(b.x - level.start.x, b.y - level.start.y));
    level.spots = { pickup: all.filter((_, i) => i % 3 === 0), prop: all.filter((_, i) => i % 3 === 1), mover: all.filter((_, i) => i % 3 === 2) };
    return level;
  }

  level.slopes = !!f.slopes;
  level.stacks = stacks;
  level.cells = Uint8Array.from(cells.flat().map((cell) => (cell.kind === 'slope-up' ? UP : cell.kind === 'slope-down' ? DOWN : cell.solid ? SOLID : EMPTY)));
  // every run of platform cells in a row is one platform to stand on
  level.thins = [];
  cells.forEach((row, r) => {
    for (let c = 0; c < cols; c++) {
      if (row[c].kind !== 'thin') continue;
      let c1 = c;
      while (c1 + 1 < cols && row[c1 + 1].kind === 'thin' && map[r][c1 + 1] === map[r][c]) c1++;
      level.thins.push({ c0: c, c1, r, x0: c * T, x1: (c1 + 1) * T, y: r * T });
      c = c1;
    }
  });
  level.thins.sort((a, b) => THIN_LETTERS.indexOf(map[a.r][a.c0]) - THIN_LETTERS.indexOf(map[b.r][b.c0]));
  level.groundY = 7 * T;
  level.start = { x: 40, y: level.groundY };
  const on = (x, from = 0) => ({ x, y: surfaceBelow(level, x, from).y });
  const low = level.groundY - 40;                      // "on the ground": below the platforms
  level.spots = {
    pickup: [on(104, low), on(5.5 * T, 4.5 * T), on(9 * T, low), on(13.5 * T, 3.5 * T), on(17 * T), on(22.6 * T, low)],
    prop: [on(76, low), on(208, low), on(11.5 * T, low), on(16.5 * T, low), on(23.5 * T, low)],
    mover: [on(190, low), on(13.5 * T, 3.5 * T), on(23 * T, low), on(120, low)],
  };
  // inside each hall: something to collect, something standing, something moving
  for (const x of halls) {
    level.spots.pickup.splice(2, 0, on((x + 4.5) * T, low));
    level.spots.prop.splice(2, 0, on((x + 3.5) * T, low));
    level.spots.mover.splice(1, 0, on((x + 5.2) * T, low));
  }
  // the far end: where the post stands and where the cliff begins
  level.post = { c: end + POST };
  level.cliff = { c0: end + CLIFF };
  return level;
}

/**
 * What a level should have, from the bag's tiles as the helper sorted them (tileIndex), or null with none.
 * Returns the options makeLevel takes.
 */
export function levelFeatures(index, mode) {
  if (!index) return {};
  const T = index.tiles, of = (clip) => (T.extras.includes(clip) ? clip : null);
  if (mode === 'top') {
    const solid = T.blocks.filter((b) => !b.liquid);
    const holes = solid.filter((b) => b.kind === 'hole'), liquid = T.blocks.find((b) => b.liquid);
    return {
      tiles: T,
      wall: solid.find((b) => b.kind === 'wall')?.prefix ?? null,
      grounds: solid.filter((b) => b.kind === 'ground').map((b) => b.prefix),
      holes: holes.map((b) => b.prefix),
      liquid: liquid?.prefix ?? null,
      floors: T.floors.map((x) => x.prefix),
      bridge: holes.length || liquid ? of('bridge-h') : null,
      fence: of('fence-h') && of('fence-v') && of('fence-post') ? { h: 'fence-h', v: 'fence-v', post: 'fence-post' } : null,
    };
  }
  const solid = T.blocks.filter((b) => !b.liquid), first = solid[0];
  const slope = (first && T.slopes.find((s) => s.prefix === first.prefix)) || T.slopes[0];
  const sameSet = (clip, it) => !!clip && (!T.from || T.from[clip] === it.set);
  return {
    tiles: T,
    ground: first?.prefix ?? null, second: solid[1]?.prefix ?? null,
    slopes: first && slope && slope.up && slope.down ? slope.prefix : false,
    thins: T.thins.length ? T.thins.map((t) => t.prefix) : first ? 0 : 1,
    strip: !T.thins.length && !!first,
    stacks: T.stacks.filter((s) => s.pieces.cap || s.pieces.mid).map((s) => s.prefix),
    pool: T.blocks.find((b) => b.liquid && !b.pieces.foot)?.prefix ?? null,
    fall: T.blocks.find((b) => b.liquid && b.pieces.foot)?.prefix ?? null,
    // a back wall goes with the block of its own tileset (brick behind castle stone, dark behind cave rock)
    interiors: T.floors.map((x) => {
      const block = solid.find((b) => b.set === x.set) ?? first;
      const mine = (clip) => (sameSet(of(clip), x) ? clip : null);
      return { floor: x.prefix, block: block?.prefix ?? null, archL: mine('arch-l'), archR: mine('arch-r'), window: mine('window'), battlement: mine('battlement') };
    }),
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
  // in a liquid, whoever falls in does not sink to the bottom: it stands a little under the surface and wades
  for (let r = Math.max(0, Math.floor((y - 0.001) / T)); r < level.rows; r++) {
    if (!level.wet || !level.wet.has(`${c},${r}`) || level.wet.has(`${c},${r - 1}`)) continue;
    const s = r * T + WADE_DEPTH;
    if (s >= y - 0.001 && s < best) { best = s; thin = false; }
    break;
  }
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

/** Side view: true when whoever has its feet at (x, y) stands in a liquid (it wades; the page draws the liquid in front of it). */
export function wetAt(level, x, y) {
  return level.mode === 'side' && level.wet.has(`${Math.floor(x / level.tile)},${Math.floor((y - 1) / level.tile)}`);
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
 * What the tilesets in the bag have, together, as the helper sorts them.
 * sets: [{ key, names, clips }] (key: the bag item; names: its clip names in file order; clips: the sprite's own
 * clip table, where the helper's blockClips and decoClips leave a block's kind and a decal's place).
 * Returns { tile, tiles (what classifyTiles returned; tiles.from says which bag item each clip is from) }, or null
 * with no tileset.
 */
export function tileIndex(sets) {
  if (!sets || !sets.length) return null;
  return { tile: TILE, tiles: classifyTiles(sets.map((s) => ({ key: s.key, clips: s.clips ?? {}, names: s.names }))) };
}

/** The level as the helper's layoutTiles takes it: { rows (strings of letters), legend, view }. */
export function levelMap(level) {
  return { rows: level.map.map((r) => r.join('')), legend: level.legend ?? {}, view: level.mode === 'top' ? 'top-down' : 'side' };
}

/**
 * The level as map text (engine/maptext.js): what "Copy this level" gives, and what tools/scene.mjs or a game
 * reads back with readMap. tilesets: the ids of the tilesets it was laid out for, noted on a settings line.
 */
export function levelText(level, tilesets = []) {
  const map = levelMap(level);
  return writeMap({ ...map, settings: tilesets.length ? { tilesets: tilesets.join(', ') } : {} });
}

/**
 * Every tile to draw for a level, exactly as layoutTiles lays it out (decals scattered by its rule):
 * { tiles: [{ key, clip, x, y, layer, over, front }], plain, open }. tiles are in drawing order; key is the bag item
 * the clip is from; `over` marks walls, platforms and decals, which are drawn after the page's plain walls; `front`
 * marks the liquid of a side-view pool or waterfall, which the page draws again in front of whoever stands in it.
 * plain: what the bag has no tiles for at all, which the page draws plainly: 'ground' (no block), 'thin' (no
 * platform pieces) in side view; 'floor' (no lone fill), 'wall' (no wall block) top-down.
 * opts.seeThrough(key, clip): true for a tile with see-through pixels. Top-down, the floor is left out under the
 * inside of a pit or pond (its fill) when that is see-through, so what is behind the scene (the bag's background)
 * shows through it; open: a Set of 'col,row' for those cells. The floor always stays under the edge and corner
 * pieces, which are see-through outside their rounded outline.
 */
export function levelTiles(level, index, { seeThrough = null } = {}) {
  const top = level.mode === 'top', T = index?.tiles;
  const map = levelMap(level);
  const laid = T ? layoutTiles(map.rows, T, { view: map.view, legend: map.legend, decals: true }) : { tiles: [] };
  let tiles = laid.tiles.map((t) => ({
    key: t.set ?? T.from?.[t.clip], clip: t.clip, x: t.col * TILE, y: t.row * TILE, layer: t.layer, over: t.layer >= WALL_LAYER,
    front: !top && t.layer === LIQUID_LAYER && level.wet.has(`${t.col},${t.row}`),
  }));
  const open = new Set();
  if (T && top && seeThrough) {
    const inside = new Set(T.blocks.filter((b) => b.kind === 'hole' || b.liquid).flatMap((b) => b.fills));      // the fills of pits and ponds
    for (const t of tiles) {
      const c = t.x / TILE, r = t.y / TILE;
      if (inside.has(t.clip) && t.layer > FLOOR_LAYER && level.cells[r * level.cols + c] === HOLE && seeThrough(t.key, t.clip)) open.add(`${c},${r}`);
    }
    tiles = tiles.filter((t) => t.layer !== FLOOR_LAYER || !open.has(`${t.x / TILE},${t.y / TILE}`));
  }
  const plain = [];
  if (top) {
    if (!T || !T.floors.length) plain.push('floor');
    if (!T || !T.blocks.some((b) => b.kind === 'wall' && !b.liquid)) plain.push('wall');
  } else {
    if (!T || !T.blocks.some((b) => !b.liquid)) plain.push('ground');
    if (level.thins.length && (!T || !T.thins.length)) plain.push('thin');
  }
  return { tiles, plain, open };
}
// layoutTiles sorts its tiles into layers: 0 floors and back fills, 1 stacks and liquids, 2 ground, 3 holes, 4 walls, 5 thin platforms, 6 decals
const FLOOR_LAYER = 0, LIQUID_LAYER = 1, WALL_LAYER = 4;

/** The kinds of cell, for the page's plain drawing. */
export const CELL = { EMPTY, SOLID, UP, DOWN, FLOOR, WALL, HOLE, PATH };
