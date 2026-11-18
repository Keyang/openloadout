// Playground: the ground of the scene. The level is a map of letters; which tile goes in which cell,
// and which block is ground, wall, hole, platform or decal, is decided by the tile helper
// (engine/tiles.js: classifyTiles, pickPiece, layoutTiles), the same code the preview tool and the
// checker use. With no tileset in the bag there is still a ground to stand on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeLevel, levelFeatures, tileIndex, levelMap, levelText, levelTiles, isWall, solidAt, surfaceBelow, supportAt, CELL } from '../../app/play/level.js';
import { readMap } from '../../engine/maptext.js';
import { classifyTiles, layoutTiles, pickPiece, nearestPiece, blockKind, BLOCK_PIECES, NARROW_PIECES, LANE_PIECES } from '../../engine/tiles.js';
import { tilesSide, tilesTop } from '../fixtures/play/index.js';

const block = (p) => BLOCK_PIECES.map((s) => `${p}-${s}`);
const setOf = (key, names, clips) => ({ key, names, size: 32, clips });
const fromDef = (key, def) => setOf(key, Object.keys(def.clips), def.clips);
const sideIndex = tileIndex([fromDef('s', tilesSide)]);
const topIndex = tileIndex([fromDef('t', tilesTop)]);
const build = (mode, index) => { const level = makeLevel(mode, levelFeatures(index, mode)); return { level, ...levelTiles(level, index) }; };
const tileAt = (tiles, c, r) => tiles.filter((t) => t.x === c * 32 && t.y === r * 32).map((t) => t.clip);
const cell = (level, c, r) => level.cells[r * level.cols + c];

test('side view: a ground, a step, an island, a platform, a strip, a pillar, a single block and places to put things', () => {
  const level = makeLevel('side');
  assert.equal(level.mode, 'side');
  assert.equal(level.tile, 32);
  assert.equal(level.width, level.cols * 32);
  assert.ok(level.width >= 640);
  assert.equal(level.start.y, level.groundY);
  assert.equal(surfaceBelow(level, 40, 0).y, level.groundY);
  assert.equal(solidAt(level, 40, level.groundY + 5), true);
  assert.equal(solidAt(level, 40, level.groundY - 5), false);
  const thin = level.thins[0], mid = (thin.x0 + thin.x1) / 2;
  assert.equal(surfaceBelow(level, mid, 0).thin, true, 'the platform is the first thing under the sky');
  assert.equal(surfaceBelow(level, mid, thin.y + 1).y, level.groundY, 'from just under it, the ground is next');
  assert.equal(solidAt(level, mid, thin.y + 4), false, 'a thin platform can be jumped up through');
  for (const list of Object.values(level.spots)) {
    assert.ok(list.length >= 3);
    for (const s of list) { assert.ok(s.x > 0 && s.x < level.width && s.y <= level.groundY && s.y > 0); assert.equal(solidAt(level, s.x, s.y - 1), false, 'on a surface, not inside the ground'); }
  }
  const step = supportAt(level, 13.5 * 32, 3.5 * 32);
  assert.equal(step.y, level.groundY - 64, 'the step is two tiles high');
  assert.deepEqual([step.x0, step.x1], [12 * 32, 15 * 32]);
  // ground one tile thick: a strip three wide, a pillar three tall, a block on its own
  assert.deepEqual([12, 13, 14].map((c) => cell(level, c, 2)), [CELL.SOLID, CELL.SOLID, CELL.SOLID]);
  assert.deepEqual([cell(level, 13, 1), cell(level, 13, 3)], [CELL.EMPTY, CELL.EMPTY]);
  assert.deepEqual([cell(level, 3, 1), cell(level, 3, 2), cell(level, 3, 3), cell(level, 3, 0), cell(level, 3, 4), cell(level, 2, 2), cell(level, 4, 2)], [CELL.SOLID, CELL.SOLID, CELL.SOLID, CELL.EMPTY, CELL.EMPTY, CELL.EMPTY, CELL.EMPTY]);
  assert.deepEqual([cell(level, 7, 3), cell(level, 6, 3), cell(level, 8, 3), cell(level, 7, 2), cell(level, 7, 4)], [CELL.SOLID, CELL.EMPTY, CELL.EMPTY, CELL.EMPTY, CELL.EMPTY]);
});

test('with no tileset the level is the same, nothing is tiled and everything is drawn plainly', () => {
  assert.equal(tileIndex([]), null);
  const side = makeLevel('side', levelFeatures(null, 'side'));
  const s = levelTiles(side, null);
  assert.deepEqual(s.tiles, []);
  assert.deepEqual(s.plain, ['ground', 'thin']);
  const room = makeLevel('top', levelFeatures(null, 'top'));
  const t = levelTiles(room, null);
  assert.deepEqual(t.tiles, []);
  assert.deepEqual(t.plain, ['floor', 'wall']);
  assert.deepEqual(side.cells, makeLevel('side', levelFeatures(tileIndex([setOf('x', [...block('grass'), 'grass-thin-l', 'grass-thin-m', 'grass-thin-r'])]), 'side')).cells, 'tiles without slopes do not change the ground');
});

test('the tiles are exactly what the tile helper lays out for the same map: the two can never disagree', () => {
  for (const [mode, index, def] of [['side', sideIndex, tilesSide], ['top', topIndex, tilesTop]]) {
    const { level, tiles } = build(mode, index);
    const map = levelMap(level);
    assert.equal(map.view, mode === 'top' ? 'top-down' : 'side');
    assert.equal(map.rows.length, level.rows);
    assert.ok(map.rows.every((r) => r.length === level.cols));
    const want = layoutTiles(map.rows, classifyTiles([{ key: mode === 'top' ? 't' : 's', clips: def.clips }]), { view: map.view, legend: map.legend, decals: true });
    assert.deepEqual(tiles.map((t) => [t.clip, t.x / 32, t.y / 32, t.key]), want.tiles.map((t) => [t.clip, t.col, t.row, t.set]));
    assert.deepEqual(want.notes, []);
    // and what is solid in the scene is what the helper calls solid
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) {
      const mine = mode === 'top' ? isWall(level, c, r) : [CELL.SOLID, CELL.UP, CELL.DOWN].includes(cell(level, c, r));
      assert.equal(mine, want.cells[r][c].solid, `cell ${c},${r}`);
    }
  }
});

test('side view tiles: every piece of the block, the narrow pieces, fill versions, thin platforms and slopes', () => {
  const T = sideIndex.tiles;
  assert.equal(T.blocks[0].prefix, 'stone');
  const { level, tiles, plain } = build('side', sideIndex);
  assert.equal(level.slopes, true);
  assert.deepEqual(plain, []);
  const at = (c, r) => tileAt(tiles, c, r)[0];
  assert.equal(at(1, 7), 'stone-top');
  assert.match(at(1, 8), /^stone-fill/);
  // the step, two tiles high on the ground: corners, sides, and inner corners where it meets the ground
  assert.deepEqual([at(12, 5), at(13, 5), at(14, 5)], ['stone-left', 'stone-top', 'stone-right']);
  assert.deepEqual([at(12, 6), at(14, 6)], ['stone-side-l', 'stone-side-r']);
  assert.match(at(13, 6), /^stone-fill/);
  assert.deepEqual([at(12, 7), at(14, 7), at(15, 7)], ['stone-inner-tl', 'stone-inner-tr', 'stone-top']);
  // the small floating island, and the mass high up with a part hanging under it: undersides and bottom inner corners
  assert.deepEqual([at(16, 3), at(17, 3), at(16, 4), at(17, 4)], ['stone-left', 'stone-right', 'stone-bottom-l', 'stone-bottom-r']);
  assert.deepEqual([at(19, 1), at(20, 1), at(19, 2), at(20, 2), at(21, 2), at(22, 2), at(23, 2)], ['stone-left', 'stone-top', 'stone-bottom-l', 'stone-bottom', 'stone-inner-bl', 'stone-inner-br', 'stone-bottom']);
  assert.deepEqual([at(21, 3), at(22, 3)], ['stone-bottom-l', 'stone-bottom-r']);
  // ground one tile thick uses the narrow pieces
  assert.deepEqual([at(12, 2), at(13, 2), at(14, 2)], ['stone-strip-l', 'stone-strip-m', 'stone-strip-r']);
  assert.deepEqual([at(3, 1), at(3, 2), at(3, 3)], ['stone-col-t', 'stone-col-m', 'stone-col-b']);
  assert.equal(at(7, 3), 'stone-single');
  // fill versions are mixed by position
  assert.ok(tiles.some((t) => t.clip === 'stone-fill') && tiles.some((t) => t.clip === 'stone-fill-b'));
  // the thin platform and the mound
  assert.deepEqual([at(4, 5), at(5, 5), at(6, 5)], ['stone-thin-l', 'stone-thin-m', 'stone-thin-r']);
  assert.deepEqual([at(7, 6), at(10, 6)], ['stone-slope-up', 'stone-slope-down']);
  assert.ok([at(8, 6), at(9, 6)].every((c) => /^stone-/.test(c)), 'the top of the mound');
  assert.equal(surfaceBelow(level, 7 * 32 + 16, 5 * 32).y, level.groundY - 16, 'half way up the slope');
  assert.equal(surfaceBelow(level, 9 * 32, 5 * 32).y, level.groundY - 32);
  // each piece is the one the helper picks for that cell
  const solid = (x, y) => { const cx = Math.max(0, Math.min(level.cols - 1, x)), cy = Math.max(0, Math.min(level.rows - 1, y)); return cell(level, cx, cy) !== CELL.EMPTY; };
  for (const [c, r] of [[12, 5], [12, 7], [21, 2], [13, 2], [3, 2], [7, 3]]) assert.equal(at(c, r), 'stone-' + pickPiece(solid, c, r, T.blocks[0].pieces));
  assert.ok(tiles.some((t) => t.clip === 'stone-deco-a'), 'decals lie over cells of their block');
  assert.ok(tiles.every((t) => t.key === 's'));
});

test('a tileset with only some pieces: every cell gets the nearest piece it has, so nothing is left as a hole', () => {
  const few = tileIndex([setOf('f', ['grass-top', 'grass-fill', 'grass-right'])]);
  const { level, tiles, plain } = build('side', few);
  assert.equal(level.slopes, false);
  assert.deepEqual(plain, [], 'nothing is left for the plain drawing');
  const has = few.tiles.blocks[0].pieces;
  const at = (c, r) => tileAt(tiles, c, r)[0];
  assert.equal(at(1, 7), 'grass-top');
  assert.equal(at(1, 8), 'grass-fill');
  assert.equal(at(12, 5), 'grass-' + nearestPiece('left', has), 'a corner it does not have: the nearest piece it has');
  assert.equal(at(12, 6), 'grass-' + nearestPiece('side-l', has));
  assert.equal(at(20, 2), 'grass-' + nearestPiece('bottom', has));
  for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.cols; c++) if (cell(level, c, r) === CELL.SOLID) assert.ok(at(c, r), `cell ${c},${r} has a tile`);
  // no thin pieces: the platform is a strip of the block, one tile thick
  assert.deepEqual(level.thins, []);
  assert.deepEqual([4, 5, 6].map((c) => cell(level, c, 5)), [CELL.SOLID, CELL.SOLID, CELL.SOLID]);
  assert.equal(at(5, 5), 'grass-' + nearestPiece('strip-m', has));
  // names the helper does not know are not placed: the ground is drawn plainly
  const odd = build('side', tileIndex([setOf('q', ['bricks', 'planks'])]));
  assert.deepEqual(odd.tiles, []);
  assert.deepEqual(odd.plain, ['ground', 'thin']);
});

test('top-down: a walled room; the floor, the wall block and the pit block are told apart by the helper', () => {
  const T = topIndex.tiles;
  assert.equal(T.floors[0].prefix, 'floor');
  assert.deepEqual(T.blocks.map((b) => [b.prefix, b.kind]), [['wall', 'wall'], ['pit', 'hole']]);
  const { level, tiles, plain } = build('top', topIndex);
  assert.equal(level.mode, 'top');
  assert.ok(isWall(level, 0, 0) && isWall(level, level.cols - 1, level.rows - 1) && isWall(level, -1, 3));
  assert.equal(isWall(level, Math.floor(level.start.x / 32), Math.floor((level.start.y - 1) / 32)), false, 'the player starts on the floor');
  for (const list of Object.values(level.spots)) { assert.ok(list.length >= 3); for (const s of list) assert.equal(isWall(level, Math.floor(s.x / 32), Math.floor((s.y - 1) / 32)), false); }
  assert.equal(isWall(level, 17, 8), true, 'the pit blocks the way');
  assert.deepEqual(plain, []);
  const at = (c, r) => tileAt(tiles, c, r);
  assert.deepEqual(at(3, 3).slice(0, 1), ['floor-fill']);
  assert.equal(tiles.filter((t) => t.clip === 'floor-fill').length, level.cols * level.rows, 'the floor lies under everything');
  // the north wall is two deep: its cap, then its front face on the bottom row
  assert.deepEqual(at(5, 0), ['floor-fill', 'wall-fill']);
  assert.deepEqual(at(5, 1), ['floor-fill', 'wall-bottom']);
  assert.equal(at(0, 7).at(-1), 'wall-side-r', 'the west wall shows its east edge');
  assert.equal(at(23, 7).at(-1), 'wall-side-l');
  assert.equal(at(5, 13).at(-1), 'wall-top', 'the south wall shows the north edge of its cap');
  assert.equal(at(0, 1).at(-1), 'wall-inner-br');
  // the wall inside the room: cap row and face row
  assert.deepEqual([at(8, 4).at(-1), at(9, 4).at(-1), at(10, 4).at(-1)], ['wall-left', 'wall-top', 'wall-right']);
  assert.deepEqual([at(8, 5).at(-1), at(9, 5).at(-1), at(10, 5).at(-1)], ['wall-bottom-l', 'wall-bottom', 'wall-bottom-r']);
  // a wall one tile thick: the pieces the helper picks (this fixture has no narrow pieces, so the nearest ones)
  assert.deepEqual([17, 17, 17].map((c, i) => isWall(level, c, 3 + i)), [true, true, true]);
  assert.deepEqual([isWall(level, 16, 4), isWall(level, 18, 4)], [false, false]);
  const wall = T.blocks[0], part = (x, y) => level.cells[Math.max(0, Math.min(level.rows - 1, y)) * level.cols + Math.max(0, Math.min(level.cols - 1, x))] === CELL.WALL;
  for (const r of [3, 4, 5]) assert.equal(at(17, r).at(-1), wall.pieces[pickPiece(part, 17, r, wall.pieces)]);
  assert.deepEqual([at(16, 7).at(-1), at(17, 7).at(-1), at(19, 9).at(-1)], ['pit-left', 'pit-top', 'pit-bottom-r']);
  assert.ok(tiles.some((t) => t.clip === 'floor-deco-a'));
  assert.ok(tiles.filter((t) => t.clip.startsWith('wall-')).every((t) => t.over), 'walls are drawn over the floor layers');
  assert.ok(tiles.filter((t) => t.clip.startsWith('pit-') || t.clip === 'floor-fill').every((t) => !t.over));
});

test('what a block is comes from the helper: its words for walls and holes, and the kind a tileset states', () => {
  const clips = Object.fromEntries([['grass-fill', {}], ...block('hedge').map((n) => [n, {}]), ...block('growth').map((n) => [n, { block: 'wall' }]), ...block('pond').map((n) => [n, {}]), ...block('path').map((n) => [n, {}])]);
  const index = tileIndex([setOf('k', Object.keys(clips), clips)]);
  assert.deepEqual(index.tiles.blocks.map((b) => [b.prefix, b.kind]), [['hedge', blockKind('hedge')], ['growth', 'wall'], ['pond', blockKind('pond')], ['path', 'ground']]);
  assert.deepEqual([blockKind('hedge'), blockKind('pond')], ['wall', 'hole']);
  const { level, tiles } = build('top', index);
  assert.equal(tileAt(tiles, 5, 0).at(-1), 'hedge-fill', 'the first wall block is the wall');
  assert.equal(tileAt(tiles, 17, 7).at(-1), 'pond-top');
  assert.equal(isWall(level, 17, 7), true);
  assert.match(tileAt(tiles, 12, 10).at(-1), /^path-fill/);
  assert.equal(isWall(level, 4, 8), false, 'a second ground can be walked on');
});

test('several tilesets in the bag are used together', () => {
  const index = tileIndex([setOf('a', ['grass-fill', ...block('path'), 'grass-deco-a']), setOf('b', block('wall')), setOf('c', block('water'))]);
  const { level, tiles } = build('top', index);
  assert.equal(tileAt(tiles, 2, 6)[0], 'grass-fill');
  assert.match(tileAt(tiles, 2, 6)[1], /^path-/);
  assert.deepEqual(tileAt(tiles, 12, 10).slice(0, 2), ['grass-fill', 'path-fill']);
  assert.equal(tiles.find((t) => t.clip === 'wall-fill').key, 'b');
  assert.equal(tiles.find((t) => t.clip === 'water-top').key, 'c');
  assert.ok(tiles.some((t) => t.clip === 'grass-deco-a' && t.key === 'a'));
  // only walls in the bag: the floor is drawn plainly, the walls are tiles
  const onlyWalls = tileIndex([setOf('b', block('wall'))]);
  const w = build('top', onlyWalls);
  assert.deepEqual(w.plain, ['floor']);
  assert.equal(w.level.cells.includes(CELL.HOLE), false);
  assert.equal(level.cells.includes(CELL.HOLE), true);
});

test('a decal goes where its clip says: on a cell of its block, above a top tile or under a bottom tile', () => {
  const names = [...block('moss'), 'moss-deco-a', 'moss-deco-b', 'moss-deco-c'];
  const clips = { 'moss-deco-a': { place: 'on' }, 'moss-deco-b': { place: 'above' }, 'moss-deco-c': { place: 'below' } };
  const index = tileIndex([setOf('m', names, clips)]);
  assert.deepEqual(index.tiles.decals.map((d) => d.place), ['on', 'above', 'below']);
  const { level, tiles } = build('side', index);
  const of = (clip) => tiles.filter((t) => t.clip === clip);
  assert.ok(of('moss-deco-a').length && of('moss-deco-b').length, 'the helper scatters them (pickDecal)');
  for (const d of of('moss-deco-a')) assert.equal(tileAt(tiles, d.x / 32, d.y / 32)[0], 'moss-fill');
  for (const d of of('moss-deco-b')) { assert.deepEqual(tileAt(tiles, d.x / 32, d.y / 32), ['moss-deco-b'], 'in an empty cell'); assert.equal(tileAt(tiles, d.x / 32, d.y / 32 + 1)[0], 'moss-top'); }
  for (const d of of('moss-deco-c')) assert.equal(tileAt(tiles, d.x / 32, d.y / 32 - 1)[0], 'moss-bottom');
  // exactly the cells pickDecal picks: nothing is placed by the playground itself
  const map = levelMap(level);
  assert.deepEqual(tiles.filter((t) => /-deco-/.test(t.clip)).map((t) => [t.clip, t.x / 32, t.y / 32]),
    layoutTiles(map.rows, index.tiles, { view: 'side', legend: map.legend, decals: true }).tiles.filter((t) => /-deco-/.test(t.clip)).map((t) => [t.clip, t.col, t.row]));
  assert.ok(map.rows.every((row) => !/[a-z]/.test(row)), 'the map itself holds no decal letters');
});

test('every prefix with thin pieces gets a platform, and every cap, mid, foot set stands as a column', () => {
  const ground = setOf('g', [...block('grass'), 'grass-thin-l', 'grass-thin-m', 'grass-thin-r']);
  const extra = setOf('p', ['plank-thin-l', 'plank-thin-m', 'plank-thin-r', 'ladder-cap', 'ladder-mid', 'ladder-foot', 'vine-cap', 'vine-mid', 'vine-foot', 'post-cap', 'post-mid']);
  const index = tileIndex([ground, extra]);
  assert.deepEqual(index.tiles.thins.map((b) => b.prefix), ['grass', 'plank']);
  assert.deepEqual(index.tiles.stacks.map((b) => b.prefix), ['ladder', 'vine', 'post']);
  const features = levelFeatures(index, 'side');
  assert.deepEqual([features.thins, features.stacks], [['grass', 'plank'], ['ladder', 'vine', 'post']]);
  const { level, tiles } = build('side', index);
  assert.equal(level.thins.length, 2, 'a second floating platform');
  assert.equal(level.stacks.length, 3);
  const has = (clip) => tiles.filter((t) => t.clip === clip).length;
  assert.ok(has('grass-thin-m') && has('plank-thin-m') && has('plank-thin-l') && has('plank-thin-r'));
  for (const clip of ['ladder-cap', 'ladder-mid', 'ladder-foot', 'vine-cap', 'vine-mid', 'vine-foot', 'post-cap', 'post-mid']) assert.ok(has(clip), clip + ' is placed');
  for (const [prefix, bottom] of [['ladder', 'ladder-foot'], ['post', 'post-mid']]) {
    const col = tiles.filter((t) => t.clip.startsWith(prefix + '-')).sort((a, b) => a.y - b.y);
    assert.equal(new Set(col.map((t) => t.x)).size, 1);
    assert.equal(col[0].clip, prefix + '-cap');
    assert.equal(col.at(-1).clip, bottom);
    assert.equal(col.at(-1).y + 32, surfaceBelow(level, col[0].x + 16, col.at(-1).y).y, 'its foot is on the ground');
    for (const t of col) assert.equal(solidAt(level, t.x + 16, t.y + 16), false);
  }
  const second = level.thins[1];
  assert.equal(surfaceBelow(level, (second.x0 + second.x1) / 2, second.y - 10).y, second.y);
  assert.deepEqual(makeLevel('side').thins, [level.thins[0]]);
  // with only the extra tileset in the bag there is no block: the ground is plain, its platform and columns are tiles
  const alone = build('side', tileIndex([extra]));
  assert.deepEqual(alone.plain, ['ground']);
  assert.ok(alone.tiles.some((t) => t.clip === 'plank-thin-m') && alone.tiles.some((t) => t.clip === 'vine-mid'));
});

// ---- what the newer tilesets bring: liquids, back walls, arches, lanes, bridges ------------------------

const NARROW = NARROW_PIECES.map((p) => p), LANES = LANE_PIECES.map((p) => p);
const full = (p) => [...block(p), ...NARROW.map((n) => `${p}-${n}`)];
const lay = (level, index) => { const m = levelMap(level); return layoutTiles(m.rows, index.tiles, { view: m.view, legend: m.legend, decals: true }); };

test('side view: a liquid lies as a pool in a dip, with its fill behind the banks; a waterfall comes down into it', () => {
  const index = tileIndex([setOf('g', full('grass')), setOf('w', ['water-top', 'water-fill', 'fall-top', 'fall-fill', 'fall-foot'])]);
  const f = levelFeatures(index, 'side');
  assert.deepEqual([f.ground, f.pool, f.fall], ['grass', 'water', 'fall']);
  const { level, tiles } = build('side', index);
  const at = (c, r) => tileAt(tiles, c, r);
  // the pool: not solid, three wide, one deep, in the top row of the ground
  assert.deepEqual([18, 19, 20, 21, 22].map((c) => cell(level, c, 7)), [CELL.SOLID, CELL.EMPTY, CELL.EMPTY, CELL.EMPTY, CELL.SOLID]);
  assert.deepEqual([19, 20, 21].map((c) => cell(level, c, 8)), [CELL.SOLID, CELL.SOLID, CELL.SOLID]);
  assert.equal(surfaceBelow(level, 19.5 * 32, 6 * 32).y, 8 * 32, 'whoever walks in stands on the bottom of the pool');
  assert.deepEqual([at(19, 7), at(21, 7)], [['water-top'], ['water-top']]);
  // the banks and the bottom: the ground, with the water behind it so no sky shows in the dents of its edge
  for (const [c, r] of [[18, 7], [22, 7], [19, 8], [20, 8], [21, 8]]) { assert.match(at(c, r)[0], /^water-/, `water behind ${c},${r}`); assert.match(at(c, r)[1], /^grass-/); }
  assert.deepEqual(levelMap(level).legend.B, ['back:water', 'block:grass']);
  // the waterfall: its top under the mass above, its body, and its foot in the pool's own top row
  assert.deepEqual([3, 4, 5, 6, 7].map((r) => at(20, r).at(-1)), ['fall-top', 'fall-fill', 'fall-fill', 'fall-fill', 'fall-foot']);
  assert.deepEqual([3, 4, 5, 6].map((r) => cell(level, 20, r)), [CELL.EMPTY, CELL.EMPTY, CELL.EMPTY, CELL.EMPTY], 'falling water is not solid');
  for (const list of Object.values(level.spots)) for (const s of list) assert.ok(s.x < 19 * 32 || s.x > 22 * 32, 'nothing is put in the pool');
  // the ground stays the ground when the water comes first in the bag
  const other = build('side', tileIndex([setOf('w', ['water-top', 'water-fill']), setOf('g', full('grass'))]));
  assert.equal(tileAt(other.tiles, 1, 7)[0], 'grass-top');
  // with no liquid in the bag there is no dip
  assert.deepEqual([19, 20, 21].map((c) => cell(makeLevel('side'), c, 7)), [CELL.SOLID, CELL.SOLID, CELL.SOLID]);
});

test('side view: a back wall gets a tower and a hall of its own tileset, with an archway, a window and battlements where it has them', () => {
  const castle = setOf('c', [...full('stone'), 'brick-fill', 'window', 'battlement', 'arch-l', 'arch-r']);
  const index = tileIndex([setOf('g', full('grass')), castle]);
  const f = levelFeatures(index, 'side');
  assert.deepEqual(f.interiors, [{ floor: 'brick', block: 'stone', archL: 'arch-l', archR: 'arch-r', window: 'window', battlement: 'battlement' }]);
  const { level, tiles } = build('side', index);
  assert.equal(level.cols, 32, 'the level is one hall wider');
  const at = (c, r) => tileAt(tiles, c, r);
  assert.equal(at(1, 7)[0], 'grass-top', 'the ground is still the first block');
  assert.match(at(25, 2)[0], /^stone-/, 'the hall is built of the block that came with the back wall');
  // the archway at the tower's foot: open, with the wall behind it
  assert.deepEqual([at(25, 6), at(26, 6)], [['brick-fill', 'arch-l'], ['brick-fill', 'arch-r']]);
  assert.deepEqual([cell(level, 25, 6), cell(level, 26, 6), cell(level, 25, 5), cell(level, 26, 5)], [CELL.EMPTY, CELL.EMPTY, CELL.SOLID, CELL.SOLID]);
  assert.match(at(25, 5)[0], /^stone-side-l$/, 'the cell above an arch is joined to it: a side piece, not an underside');
  // the hall: back wall, window, a roof with the wall behind its lower row, battlements above
  assert.deepEqual(at(28, 5), ['brick-fill']);
  assert.equal(at(28, 4).at(-1), 'window');
  assert.deepEqual([cell(level, 28, 5), cell(level, 28, 6), cell(level, 28, 3), cell(level, 28, 2)], [CELL.EMPTY, CELL.EMPTY, CELL.SOLID, CELL.SOLID]);
  assert.deepEqual([at(28, 3)[0], at(28, 2).length], ['brick-fill', 1]);
  assert.match(at(28, 3)[1], /^stone-/);
  assert.deepEqual(at(27, 1), ['battlement']);
  // walk in under the arch, through the hall and out the far side: nothing is in the way at ground level
  for (let c = 24; c <= 31; c++) assert.equal(cell(level, c, 6), CELL.EMPTY, `cell ${c},6`);
  assert.ok(level.spots.pickup.some((s) => s.x > 27 * 32 && s.x < 30 * 32 && s.y === level.groundY), 'something to collect inside');
  assert.deepEqual(lay(level, index).notes, []);

  // a cave: its dark wall behind a hall of its own rock, and no archway; two back walls make two halls
  const cave = setOf('k', [...full('rock'), 'dark-fill']);
  const both = build('side', tileIndex([cave, castle]));
  assert.equal(both.level.cols, 40);
  assert.deepEqual([tileAt(both.tiles, 25, 6), tileAt(both.tiles, 28, 5)], [['dark-fill'], ['dark-fill']]);
  assert.match(tileAt(both.tiles, 25, 5)[0], /^rock-/);
  assert.deepEqual(tileAt(both.tiles, 33, 6), ['brick-fill', 'arch-l']);
  assert.match(tileAt(both.tiles, 33, 5)[0], /^stone-/);
  assert.equal(makeLevel('side').cols, 24, 'with no back wall there is no hall');
});

test('top-down: the second ground is a lane with a crossing and a bend, leading to a square', () => {
  const lanes = [...full('path'), ...LANES.map((n) => `path-${n}`)];
  const index = tileIndex([setOf('m', ['grass-fill', ...lanes])]);
  const { level, tiles } = build('top', index);
  const at = (c, r) => tileAt(tiles, c, r).at(-1);
  assert.equal(at(4, 6), 'path-cross', 'where the two lanes meet');
  assert.match(at(13, 6), /^path-elbow-/, 'the bend');
  assert.deepEqual([at(2, 6), at(8, 6), at(4, 3), at(4, 5), at(4, 10)], ['path-strip-l', 'path-strip-m', 'path-col-t', 'path-col-m', 'path-col-b']);
  assert.match(at(12, 10), /^path-fill/);
  assert.equal(at(11, 9), 'path-left', 'the square is a block of the same ground');
  const P = index.tiles.blocks[0], solid = (x, y) => level.map[Math.max(0, Math.min(level.rows - 1, y))][Math.max(0, Math.min(level.cols - 1, x))] === 'P';
  for (const [c, r] of [[4, 6], [13, 6], [13, 9], [13, 8]]) assert.equal(at(c, r), P.pieces[pickPiece(solid, c, r, P.pieces)], `the helper's piece at ${c},${r}`);
  for (const [c, r] of [[4, 6], [13, 7], [12, 10]]) assert.equal(isWall(level, c, r), false, 'a lane is walked on');
  // a tileset without lane pieces still gets the lane, from the pieces it has
  const plain = build('top', tileIndex([setOf('m', ['grass-fill', ...block('path')])]));
  assert.match(tileAt(plain.tiles, 4, 6).at(-1), /^path-/);
  // two second grounds: the lane is the first, the square the second
  const two = build('top', tileIndex([setOf('m', ['grass-fill', ...lanes]), setOf('v', full('cobble'))]));
  assert.equal(tileAt(two.tiles, 4, 6).at(-1), 'path-cross');
  assert.equal(tileAt(two.tiles, 11, 9).at(-1), 'cobble-left');
});

test('top-down: water cannot be walked into, except over a bridge; a liquid counts as water too', () => {
  const shore = setOf('s', [...block('water'), 'bridge-h', 'bridge-v']);
  const index = tileIndex([setOf('m', ['grass-fill']), shore]);
  const f = levelFeatures(index, 'top');
  assert.deepEqual([f.holes, f.bridge], [['water'], 'bridge-h']);
  const { level, tiles } = build('top', index);
  assert.deepEqual([16, 17, 19].map((c) => isWall(level, c, 7)), [true, true, true], 'the pond');
  assert.deepEqual([16, 17, 18, 19].map((c) => isWall(level, c, 8)), [false, false, false, false], 'the bridge across its middle');
  assert.deepEqual([isWall(level, 15, 8), isWall(level, 20, 8)], [false, false]);
  assert.deepEqual(tileAt(tiles, 17, 8).slice(-2), ['water-fill', 'bridge-h']);
  assert.equal(tileAt(tiles, 17, 7).at(-1), 'water-top');
  for (const list of Object.values(level.spots)) for (const s of list) assert.equal(isWall(level, Math.floor(s.x / 32), Math.floor((s.y - 1) / 32)), false);
  // a liquid (only a surface and a body) in a top-down bag is a pond as well
  const lava = build('top', tileIndex([setOf('l', ['floor-fill', 'lava-top', 'lava-fill'])]));
  assert.equal(isWall(lava.level, 17, 8), true);
  assert.match(tileAt(lava.tiles, 17, 8).at(-1), /^lava-/);
  // two holes: a pond and a pit
  const two = build('top', tileIndex([setOf('m', ['grass-fill']), shore, setOf('d', block('pit'))]));
  assert.equal(tileAt(two.tiles, 20, 3).at(-1), 'pit-top');
  assert.equal(isWall(two.level, 20, 4), true);
});

test('top-down: the first floor in the bag lies under everything; any other floor is a patch', () => {
  const index = tileIndex([setOf('m', ['grass-fill']), setOf('v', ['plank-fill', ...block('wall')])]);
  const { level, tiles } = build('top', index);
  assert.equal(tiles.filter((t) => t.clip === 'grass-fill').length, level.cols * level.rows);
  assert.deepEqual(tileAt(tiles, 7, 10), ['grass-fill', 'plank-fill']);
  assert.equal(tiles.filter((t) => t.clip === 'plank-fill').length, 8);
  assert.equal(tileAt(tiles, 5, 0).at(-1), 'wall-fill');
  // the other way round in the bag, the planks are the floor
  const swapped = build('top', tileIndex([setOf('v', ['plank-fill', ...block('wall')]), setOf('m', ['grass-fill'])]));
  assert.equal(swapped.tiles.filter((t) => t.clip === 'plank-fill').length, level.cols * level.rows);
});

test('top-down: the floor is left out under a see-through pit, so what is behind the scene shows', () => {
  const index = tileIndex([setOf('f', ['floor-fill', ...block('void')])]);
  const level = makeLevel('top', levelFeatures(index, 'top'));
  const solidFloor = levelTiles(level, index);
  assert.equal(solidFloor.open.size, 0);
  assert.equal(solidFloor.tiles.filter((t) => t.clip === 'floor-fill').length, level.cols * level.rows);
  const asked = [];
  const { tiles, open } = levelTiles(level, index, { seeThrough: (key, clip) => { asked.push([key, clip]); return clip === 'void-fill'; } });
  assert.ok(asked.every(([key, clip]) => key === 'f' && clip.startsWith('void-')), 'only the pit is asked about');
  assert.deepEqual([...open].sort(), ['17,8', '18,8'], 'the cells whose own tile is see-through: the inside of the pit');
  assert.deepEqual(tileAt(tiles, 17, 8), ['void-fill']);
  assert.deepEqual(tileAt(tiles, 17, 7), ['floor-fill', 'void-top'], 'an edge that is not see-through keeps the floor under it');
});

test('the level is map text: a tool or a game reads it back and lays out the very same tiles', () => {
  for (const [mode, index, ids] of [
    ['side', tileIndex([setOf('g', [...full('grass'), 'grass-thin-l', 'grass-thin-m', 'grass-thin-r']), setOf('w', ['water-top', 'water-fill']), setOf('c', [...full('stone'), 'brick-fill', 'arch-l', 'arch-r'])]), ['tiles-a', 'tiles-b', 'tiles-c']],
    ['top', tileIndex([setOf('m', ['grass-fill', ...full('path')]), setOf('s', [...block('water'), 'bridge-h'])]), ['tiles-m', 'tiles-s']],
  ]) {
    const { level, tiles } = build(mode, index);
    const text = levelText(level, ids);
    assert.match(text, new RegExp(`^@ view = ${mode === 'top' ? 'top-down' : 'side'}\n`));
    assert.match(text, new RegExp(`@ tilesets = ${ids.join(', ')}\n`));
    const read = readMap(text);
    assert.deepEqual(read.rows, level.map.map((r) => r.join('')));
    assert.deepEqual(read.legend, levelMap(level).legend);
    assert.equal(read.settings.tilesets, ids.join(', '));
    const again = layoutTiles(read.rows, index.tiles, { view: read.view, legend: read.legend, decals: true });
    assert.deepEqual(again.tiles.map((t) => [t.clip, t.col, t.row]), tiles.map((t) => [t.clip, t.x / 32, t.y / 32]));
    assert.ok(text.split('\n').filter((l) => l && !l.startsWith('@')).every((row) => [...row].length === level.cols));
  }
  assert.match(levelText(makeLevel('side')), /^@ view = side\n\n\.{24}\n/, 'with no tiles it is still a level');
});

// The real tilesets, when they are there (they are made alongside the playground).
const real = (id) => new URL(`../../sprites/${id}.js`, import.meta.url);
const have = (...ids) => ids.every((id) => fs.existsSync(real(id)));
const load = async (id) => { const def = (await import(real(id).href)).default; return { def, set: fromDef(id, def) }; };
const loadAll = async (ids) => { const all = await Promise.all(ids.map(load)); return { index: tileIndex(all.map((x) => x.set)), defs: Object.fromEntries(all.map((x, i) => [ids[i], x.def])) }; };

test('the real tileset tiles-forest: every cell of the ground gets a piece of its own, narrow pieces and fill versions included', { skip: !have('tiles-forest') && 'sprites/tiles-forest.js is not there yet' }, async () => {
  const { def, set } = await load('tiles-forest');
  const index = tileIndex([set]);
  const { level, tiles, plain } = build('side', index);
  assert.deepEqual(plain, []);
  for (const t of tiles) assert.ok(def.clips[t.clip], `${t.clip} is one of its clips`);
  assert.deepEqual(lay(level, index).notes, []);
  const at = (c, r) => tileAt(tiles, c, r)[0], p = index.tiles.blocks[0].prefix;
  assert.deepEqual([at(12, 5), at(12, 6), at(12, 7), at(20, 2), at(21, 2), at(22, 2)], [`${p}-left`, `${p}-side-l`, `${p}-inner-tl`, `${p}-bottom`, `${p}-inner-bl`, `${p}-inner-br`]);
  if (index.tiles.blocks[0].pieces.single) assert.deepEqual([at(12, 2), at(13, 2), at(14, 2), at(3, 1), at(3, 2), at(3, 3), at(7, 3)], [`${p}-strip-l`, `${p}-strip-m`, `${p}-strip-r`, `${p}-col-t`, `${p}-col-m`, `${p}-col-b`, `${p}-single`]);
  if (index.tiles.blocks[0].fills.length > 1) assert.ok(new Set(tiles.filter((t) => /-fill(-[bc])?$/.test(t.clip)).map((t) => t.clip)).size > 1, 'more than one version of the fill is used');
  const used = new Set(tiles.map((t) => t.clip));
  assert.deepEqual(Object.keys(def.clips).filter((c) => !used.has(c) && !LANE_PIECES.some((l) => c.endsWith('-' + l))), [], 'every clip of the tileset is in the scene');
});

test('the real side-view tilesets together: every platform, column, pool, waterfall, back wall and arch is in the scene', { skip: !have('tiles-forest', 'tiles-platforms', 'tiles-cave', 'tiles-water', 'tiles-castle') && 'the real side-view tilesets are not all there yet' }, async () => {
  const ids = ['tiles-forest', 'tiles-platforms', 'tiles-cave', 'tiles-water', 'tiles-castle'];
  const { index, defs } = await loadAll(ids);
  const { level, tiles } = build('side', index);
  assert.deepEqual(lay(level, index).notes, []);
  const used = (id) => new Set(tiles.filter((t) => t.key === id).map((t) => t.clip));
  for (const clip of Object.keys(defs['tiles-platforms'].clips)) assert.ok(used('tiles-platforms').has(clip), `${clip} of tiles-platforms is placed`);
  for (const clip of Object.keys(defs['tiles-water'].clips).filter((c) => !/^water-fill/.test(c))) assert.ok(used('tiles-water').has(clip), `${clip} of tiles-water is placed`);
  assert.ok([...used('tiles-water')].some((c) => /^water-fill/.test(c)), 'the body of the water is behind the bottom of the pool');
  for (const clip of ['brick-fill', 'arch-l', 'arch-r', 'window', 'battlement', 'stone-top', 'stone-side-l']) assert.ok(used('tiles-castle').has(clip), `${clip} of tiles-castle is placed`);
  for (const clip of ['dark-fill', 'rock-top']) assert.ok(used('tiles-cave').has(clip), `${clip} of tiles-cave is placed`);
  assert.equal(tileAt(tiles, 1, 7)[0], 'grass-top', 'the forest, first in the bag, is the ground');
  assert.equal(level.cols, 40);
  assert.deepEqual(readMap(levelText(level, ids)).rows, level.map.map((r) => r.join('')));
});

test('the real top-down tilesets together: the meadow under everything, a lane, a village square and walls, a pond with a bridge', { skip: !have('tiles-meadow', 'tiles-village', 'tiles-shore') && 'the real top-down tilesets are not all there yet' }, async () => {
  const { index } = await loadAll(['tiles-meadow', 'tiles-village', 'tiles-shore']);
  const { level, tiles, plain } = build('top', index);
  assert.deepEqual(plain, []);
  const at = (c, r) => tileAt(tiles, c, r);
  assert.match(at(3, 3)[0], /^grass-fill/, 'the first floor in the bag lies under everything');
  assert.ok(tiles.filter((t) => /^grass-fill/.test(t.clip)).length === level.cols * level.rows);
  assert.match(at(4, 6).at(-1), /^path-/);
  assert.match(at(12, 10).at(-1), /^cobble-fill/);
  assert.match(at(5, 1).at(-1), /^wall-bottom/, 'the north wall shows its face');
  assert.match(at(17, 7).at(-1), /^water-/);
  assert.equal(at(17, 8).at(-1), 'bridge-h');
  assert.equal(isWall(level, 17, 7), true);
  assert.equal(isWall(level, 17, 8), false);
  assert.match(at(7, 10)[1], /^plank-fill/, 'the village planks are a patch on the meadow');
});
