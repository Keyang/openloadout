// Playground: the ground of the scene, built from the tile names of docs/style-guide.md section 6.
// With no tileset in the bag there is still a ground to stand on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeLevel, levelFeatures, tileIndex, sideSet, topSet, levelTiles, pieceFor, isWall, solidAt, surfaceBelow, supportAt, CELL } from '../../app/play/level.js';
import { tilesSide, tilesTop } from '../fixtures/play/index.js';

const BLOCK = ['left', 'top', 'right', 'side-l', 'fill', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br'];
const block = (p) => BLOCK.map((s) => `${p}-${s}`);
const setOf = (key, names, size = 32) => ({ key, names, size });
const sideIndex = tileIndex([setOf('s', Object.keys(tilesSide.clips))]);
const topIndex = tileIndex([setOf('t', Object.keys(tilesTop.clips))]);
const tileAt = (tiles, c, r, T = 32) => tiles.filter((t) => t.x === c * T && t.y === r * T).map((t) => t.clip);

test('side view: a ground, a step, an island, a thin platform and places to put things', () => {
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
  const step = supportAt(level, 15 * 32, 0);
  assert.equal(step.y, level.groundY - 64, 'the step is two tiles high');
  assert.deepEqual([step.x0, step.x1], [13 * 32, 17 * 32]);
});

test('with no tileset the level is the same, nothing is tiled and everything is drawn plainly', () => {
  assert.equal(tileIndex([]), null);
  assert.deepEqual(levelFeatures(null, 'side'), { tile: 32 });
  assert.deepEqual(levelTiles(makeLevel('side'), null), { tiles: [], plain: ['ground', 'thin'] });
  assert.deepEqual(levelTiles(makeLevel('top'), null), { tiles: [], plain: ['floor', 'wall'] });
  assert.deepEqual(makeLevel('side').cells, makeLevel('side', levelFeatures(tileIndex([setOf('x', block('grass'))]), 'side')).cells, 'tiles without slopes do not change the ground');
});

test('each cell gets the piece its neighbours call for', () => {
  // a 3 x 3 square: the nine outer pieces of the block
  const inside = (c, r) => c >= 0 && c <= 2 && r >= 1 && r <= 3;
  assert.deepEqual([0, 1, 2].map((c) => pieceFor(inside, c, 1)), ['left', 'top', 'right']);
  assert.deepEqual([0, 1, 2].map((c) => pieceFor(inside, c, 2)), ['side-l', 'fill', 'side-r']);
  assert.deepEqual([0, 1, 2].map((c) => pieceFor(inside, c, 3)), ['bottom-l', 'bottom', 'bottom-r']);
  const ell = (c, r) => (c >= 0 && c <= 3 && r >= 2 && r <= 4) || (c >= 2 && c <= 3 && r >= 0 && r <= 1) || r > 4;
  assert.equal(pieceFor(ell, 2, 2), 'inner-tl', 'the outside shows at the top left');
  assert.equal(pieceFor(ell, 1, 2), 'top');
  assert.equal(pieceFor(ell, 2, 1), 'side-l');
  const notch = (c, r) => !(c === 0 && r === 0) && !(c === 2 && r === 0) && !(c === 0 && r === 2) && !(c === 2 && r === 2);
  assert.equal(pieceFor((c, r) => notch(c, r) || c === 2 || r === 2, 1, 1), 'inner-tl');
  assert.equal(pieceFor((c, r) => !(c === 2 && r === 0), 1, 1), 'inner-tr');
  assert.equal(pieceFor((c, r) => !(c === 0 && r === 2), 1, 1), 'inner-bl');
  assert.equal(pieceFor((c, r) => !(c === 2 && r === 2), 1, 1), 'inner-br');
});

test('side view tiles: tops, fill, corners, sides, inner corners, undersides, thin platforms and slopes', () => {
  const set = sideSet(sideIndex);
  assert.equal(set.ground.prefix, 'stone');
  assert.ok(set.thin && set.slope);
  const level = makeLevel('side', levelFeatures(sideIndex, 'side'));
  assert.equal(level.slopes, true);
  const { tiles, plain } = levelTiles(level, sideIndex);
  assert.deepEqual(plain, []);
  const at = (c, r) => tileAt(tiles, c, r)[0];
  assert.equal(at(1, 7), 'stone-top');
  assert.equal(at(1, 8), 'stone-fill');
  // the step, two tiles high on the ground: corners, sides, and inner corners where it meets the ground
  assert.equal(at(13, 5), 'stone-left');
  assert.equal(at(14, 5), 'stone-top');
  assert.equal(at(16, 5), 'stone-right');
  assert.equal(at(13, 6), 'stone-side-l');
  assert.equal(at(14, 6), 'stone-fill');
  assert.equal(at(16, 6), 'stone-side-r');
  assert.equal(at(13, 7), 'stone-inner-tl');
  assert.equal(at(16, 7), 'stone-inner-tr');
  assert.equal(at(12, 7), 'stone-top');
  // the floating island: top row and underside
  assert.deepEqual([at(18, 3), at(19, 3), at(20, 3)], ['stone-left', 'stone-top', 'stone-right']);
  assert.deepEqual([at(18, 4), at(19, 4), at(20, 4)], ['stone-bottom-l', 'stone-bottom', 'stone-bottom-r']);
  // the thin platform and the mound
  assert.deepEqual([at(4, 5), at(5, 5), at(6, 5)], ['stone-thin-l', 'stone-thin-m', 'stone-thin-r']);
  assert.deepEqual([at(8, 6), at(9, 6), at(10, 6), at(11, 6)], ['stone-slope-up', 'stone-top', 'stone-top', 'stone-slope-down']);
  assert.equal(at(8, 7), 'stone-fill', 'under a slope the ground is plain fill');
  assert.equal(surfaceBelow(level, 8 * 32 + 16, 0).y, level.groundY - 16, 'half way up the slope');
  assert.equal(surfaceBelow(level, 10 * 32, 0).y, level.groundY - 32);
  assert.ok(tiles.some((t) => t.clip === 'stone-deco-a'), 'decals lie over fill tiles');
  assert.ok(tiles.filter((t) => t.clip === 'stone-deco-a').every((d) => tileAt(tiles, d.x / 32, d.y / 32)[0] === 'stone-fill'));
  assert.ok(tiles.every((t) => t.key === 's'));
});

test('a tileset with only some pieces still covers everything', () => {
  const few = tileIndex([setOf('f', ['grass-top', 'grass-fill'])]);
  const level = makeLevel('side', levelFeatures(few, 'side'));
  assert.equal(level.slopes, false);
  const { tiles, plain } = levelTiles(level, few);
  assert.deepEqual(plain, []);
  const at = (c, r) => tileAt(tiles, c, r)[0];
  assert.equal(at(13, 5), 'grass-top', 'a corner falls back to the top edge');
  assert.equal(at(13, 6), 'grass-fill', 'a side falls back to the fill');
  assert.equal(at(13, 7), 'grass-fill');
  assert.equal(at(19, 4), 'grass-fill');
  assert.equal(at(5, 5), 'grass-top', 'no thin pieces: the top edge');
  const topOnly = levelTiles(makeLevel('side'), tileIndex([setOf('o', ['moss-top'])])).tiles;
  assert.equal(tileAt(topOnly, 1, 8)[0], 'moss-top');
  const odd = tileIndex([setOf('q', ['bricks', 'planks'])]);
  assert.equal(tileAt(levelTiles(makeLevel('side'), odd).tiles, 1, 7)[0], 'bricks', 'no known names: the first clip everywhere');
  assert.equal(tileAt(levelTiles(makeLevel('top'), odd).tiles, 3, 3)[0], 'bricks');
});

test('top-down: a walled room; the floor, the wall block and the pit block are told apart by their names', () => {
  const set = topSet(topIndex);
  assert.equal(set.base.prefix, 'floor');
  assert.equal(set.wall.prefix, 'wall');
  assert.equal(set.hole.prefix, 'pit');
  assert.equal(set.path, null);
  const level = makeLevel('top', levelFeatures(topIndex, 'top'));
  assert.equal(level.mode, 'top');
  assert.ok(isWall(level, 0, 0) && isWall(level, level.cols - 1, level.rows - 1) && isWall(level, -1, 3));
  const T = level.tile;
  assert.equal(isWall(level, Math.floor(level.start.x / T), Math.floor((level.start.y - 1) / T)), false, 'the player starts on the floor');
  for (const list of Object.values(level.spots)) { assert.ok(list.length >= 3); for (const s of list) assert.equal(isWall(level, Math.floor(s.x / T), Math.floor((s.y - 1) / T)), false); }
  assert.equal(isWall(level, 14, 7), true, 'the pit blocks the way');
  const { tiles, plain } = levelTiles(level, topIndex);
  assert.deepEqual(plain, []);
  const at = (c, r) => tileAt(tiles, c, r);
  assert.deepEqual(at(3, 3).slice(0, 1), ['floor-fill']);
  assert.ok(tiles.filter((t) => t.clip === 'floor-fill').length === level.cols * level.rows, 'the floor lies under everything');
  // the north wall is two deep: its cap, then its front face on the bottom row
  assert.deepEqual(at(5, 0), ['floor-fill', 'wall-fill']);
  assert.deepEqual(at(5, 1), ['floor-fill', 'wall-bottom']);
  assert.deepEqual(at(0, 5).at(-1), 'wall-side-r', 'the west wall shows its east edge');
  assert.deepEqual(at(19, 5).at(-1), 'wall-side-l');
  assert.deepEqual(at(5, 11).at(-1), 'wall-top', 'the south wall shows the north edge of its cap');
  assert.deepEqual(at(0, 1).at(-1), 'wall-inner-br');
  // the wall inside the room: cap row and face row
  assert.deepEqual([at(8, 4).at(-1), at(9, 4).at(-1), at(10, 4).at(-1)], ['wall-left', 'wall-top', 'wall-right']);
  assert.deepEqual([at(8, 5).at(-1), at(9, 5).at(-1), at(10, 5).at(-1)], ['wall-bottom-l', 'wall-bottom', 'wall-bottom-r']);
  assert.deepEqual([at(13, 7).at(-1), at(14, 7).at(-1), at(15, 8).at(-1)], ['pit-left', 'pit-top', 'pit-bottom-r']);
  assert.ok(tiles.some((t) => t.clip === 'floor-deco-a'));
  assert.ok(tiles.filter((t) => t.clip.startsWith('wall-')).every((t) => t.over), 'walls are drawn over the floor layers');
});

test('a decal goes where its clip says: on a fill tile, above a top tile or under a bottom tile', () => {
  const names = [...block('moss'), 'moss-deco-a', 'moss-deco-b', 'moss-deco-c'];
  const clips = { 'moss-deco-a': { place: 'on' }, 'moss-deco-b': { place: 'above' }, 'moss-deco-c': { place: 'below' } };
  const index = tileIndex([{ key: 'm', names, size: 32, clips }]);
  const level = makeLevel('side');
  const { tiles } = levelTiles(level, index);
  const of = (clip) => tiles.filter((t) => t.clip === clip);
  assert.ok(of('moss-deco-a').length && of('moss-deco-b').length && of('moss-deco-c').length);
  for (const d of of('moss-deco-a')) assert.equal(tileAt(tiles, d.x / 32, d.y / 32)[0], 'moss-fill');
  for (const d of of('moss-deco-b')) { assert.deepEqual(tileAt(tiles, d.x / 32, d.y / 32), ['moss-deco-b'], 'in an empty cell'); assert.equal(tileAt(tiles, d.x / 32, d.y / 32 + 1)[0], 'moss-top'); }
  for (const d of of('moss-deco-c')) assert.match(tileAt(tiles, d.x / 32, d.y / 32 - 1)[0], /^moss-bottom/);
});

test('several tilesets in the bag are used together, and a second ground is laid over the floor', () => {
  const index = tileIndex([setOf('a', ['grass-fill', ...block('path'), 'grass-deco-a']), setOf('b', block('wall')), setOf('c', block('water'))]);
  const set = topSet(index);
  assert.deepEqual([set.base.prefix, set.path.prefix, set.wall.prefix, set.hole.prefix], ['grass', 'path', 'wall', 'water']);
  const level = makeLevel('top', levelFeatures(index, 'top'));
  const { tiles } = levelTiles(level, index);
  assert.deepEqual(tileAt(tiles, 2, 7), ['grass-fill', 'path-left']);
  assert.deepEqual(tileAt(tiles, 4, 8).slice(0, 2), ['grass-fill', 'path-fill']);
  assert.equal(isWall(level, 4, 8), false, 'the second ground can be walked on');
  assert.equal(tiles.find((t) => t.clip === 'wall-fill').key, 'b');
  assert.equal(tiles.find((t) => t.clip === 'water-top').key, 'c');
  // only walls in the bag: the floor is drawn plainly, the walls are tiles
  const onlyWalls = tileIndex([setOf('b', block('wall'))]);
  assert.deepEqual(levelTiles(makeLevel('top', levelFeatures(onlyWalls, 'top')), onlyWalls).plain, ['floor']);
  assert.equal(makeLevel('top', levelFeatures(onlyWalls, 'top')).cells.includes(CELL.HOLE), false);
});

test('smaller tiles make the same sized scene', () => {
  const a = makeLevel('side', { tile: 32 }), b = makeLevel('side', { tile: 16 });
  assert.equal(a.width, b.width);
  assert.equal(a.groundY, b.groundY);
  assert.equal(b.cols, a.cols * 2);
  assert.equal(surfaceBelow(b, 15 * 32, 0).y, surfaceBelow(a, 15 * 32, 0).y);
});

// The first real tilesets, when they are there (they are being made alongside the playground).
for (const id of ['tiles-forest', 'tiles-platforms']) {
  const file = new URL(`../../sprites/${id}.js`, import.meta.url);
  test(`the real tileset ${id} tiles a side-view level with no fallbacks for the block`, { skip: !fs.existsSync(file) && `sprites/${id}.js is not there yet` }, async () => {
    const def = (await import(file.href)).default;
    const index = tileIndex([setOf(id, Object.keys(def.clips), def.size[0])]);
    const set = sideSet(index);
    assert.ok(set.ground || set.thin, 'it has a block or thin platforms');
    const level = makeLevel('side', levelFeatures(index, 'side'));
    const { tiles } = levelTiles(level, index);
    assert.ok(tiles.length > 0);
    for (const t of tiles) assert.ok(def.clips[t.clip], `${t.clip} is one of its clips`);
    if (set.ground && BLOCK.every((s) => set.ground.pieces[s])) {
      const at = (c, r) => tileAt(tiles, c, r)[0], p = set.ground.prefix;
      assert.deepEqual([at(13, 5), at(13, 6), at(13, 7), at(1, 8), at(19, 4)], [`${p}-left`, `${p}-side-l`, `${p}-inner-tl`, `${p}-fill`, `${p}-bottom`]);
    }
    if (set.thin) assert.ok(tiles.some((t) => /-thin-m$/.test(t.clip)));
  });
}
