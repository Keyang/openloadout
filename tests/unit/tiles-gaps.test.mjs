// What the first five tilesets built on the tile helper found missing in layout: liquids, a fill behind edge
// tiles, a cell that is solid for its neighbours but drawn with another clip, a stack that is only a foot,
// and the bends, forks and crossings of a lane one tile wide.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, BLOCK_PIECES, NARROW_PIECES, LANE_PIECES, blockClips, liquidClips, decoClips, pieceOf, blockJoins,
  classifyTiles, pickPiece, nearestPiece, layoutTiles, drawBlock,
} from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';

const JOINS_NARROW = 72;       // blockJoins({ narrow: true }).length before lanes existed
const at = (L, c, r) => L.tiles.filter((t) => t.col === c && t.row === r).map((t) => t.clip);
const rim = { depth: 3, paint: (d) => (d === 1 ? '#8a6a44' : '#b08a5a') };
const path = () => ({ ink: '#6a4a30', fill: () => '#c9a06a', top: rim, side: rim, bottom: rim });
const piece = (name, m) => { const g = new Surface(TILE, TILE); drawBlock(g, name, m); return g; };
const column = (g, x) => Array.from({ length: TILE }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: TILE }, (_, x) => g.get(x, y));

// ---- 1. liquids ---------------------------------------------------------------------------------------
const POOL = { ...blockClips('grass'), ...liquidClips('water', { fills: 2 }), 'fall-top': {}, 'fall-fill': {}, 'fall-foot': {} };
test('classifyTiles: a block with only a top and fills is a liquid; a foot under the same prefix is its last piece', () => {
  const t = classifyTiles(POOL);
  const by = Object.fromEntries(t.blocks.map((b) => [b.prefix, b]));
  assert.equal(by.water.liquid, true); assert.equal(by.fall.liquid, true); assert.ok(!by.grass.liquid);
  assert.equal(by.fall.pieces.foot, 'fall-foot');
  assert.equal(by.water.pieces.foot, undefined);
  assert.ok(!classifyTiles(blockClips('grass')).blocks[0].liquid);
});
test('layoutTiles: a liquid shows its top where nothing of it is above, else its body; it is not solid and lies behind the ground', () => {
  const L = layoutTiles(['.....', '#~~~#', '#~~~#', '#####'], POOL);
  assert.deepEqual(L.notes, []);
  assert.deepEqual([at(L, 1, 1), at(L, 3, 1)], [['water-top'], ['water-top']]);
  assert.ok(/^water-fill/.test(at(L, 2, 2)[0]));
  assert.deepEqual([L.cells[1][1].kind, L.cells[1][1].solid, L.cells[1][1].prefix], ['liquid', false, 'water']);
  assert.deepEqual(at(L, 0, 1), ['grass-right'], 'the ground beside the pool is closed towards it');
  const order = L.tiles.map((t) => t.clip.split('-')[0]);
  assert.ok(order.lastIndexOf('water') < order.indexOf('grass'), 'liquids are drawn before the ground');
  // a liquid of your own letter, with a foot: a waterfall
  const F = layoutTiles(['...', '.V.', '.V.', '.V.', '###'], POOL, { legend: { V: 'liquid:fall' } });
  assert.deepEqual([at(F, 1, 1), at(F, 1, 2), at(F, 1, 3)], [['fall-top'], ['fall-fill'], ['fall-foot']]);
  assert.deepEqual(F.notes, []);
  assert.deepEqual(at(layoutTiles(['.', 'V', '#'], POOL, { legend: { V: 'liquid:fall' } }), 0, 1), ['fall-top'], 'one cell: the top wins');
  // named as a block, a liquid is laid out the same way, in its block's own layer, as before
  const B = layoutTiles(['..', '##', '##'], liquidClips('water'));
  assert.deepEqual(B.tiles.map((t) => [t.clip, t.layer]), [['water-top', 3], ['water-top', 3], ['water-fill', 3], ['water-fill', 3]]);
  assert.equal(B.cells[1][0].solid, true, 'a block letter is solid, as before');
  // with no liquid in the tileset the letter still says what the cell is
  const none = layoutTiles(['~'], blockClips('grass'));
  assert.deepEqual([none.cells[0][0].kind, none.cells[0][0].solid], ['liquid', false]);
});

// ---- 2. a fill behind ------------------------------------------------------------------------------------
test('layoutTiles: "back:<prefix>" puts that fill behind whatever else the cell holds', () => {
  const L = layoutTiles(['.....', 'g~~~g', 'g~~~g', '#####'], POOL, { legend: { g: ['back:water', 'block:grass'] } });
  assert.deepEqual(L.notes, []);
  assert.deepEqual(at(L, 0, 1), ['water-top', 'grass-right'], 'the water carries on behind the bank, surface and all');
  assert.ok(/^water-fill/.test(at(L, 0, 2)[0])); assert.equal(at(L, 0, 2)[1], 'grass-side-r');
  assert.deepEqual([L.cells[1][0].kind, L.cells[1][0].solid], ['block', true]);
  assert.ok(L.tiles.find((t) => t.col === 0 && t.row === 1 && t.clip === 'water-top').layer < L.tiles.find((t) => t.clip === 'grass-right').layer);
  // behind a block: a lone fill (a back wall), or another block's fill
  const C = { ...blockClips('rock', { fills: 2 }), 'dark-fill': {}, 'dark-fill-b': {}, ...blockClips('moss') };
  const W = layoutTiles(['w.', '##'], C, { legend: { w: ['back:dark', 'block:rock'], '#': 'block:rock' } });
  assert.ok(/^dark-fill/.test(at(W, 0, 0)[0])); assert.equal(at(W, 0, 0).length, 2);
  assert.deepEqual(at(layoutTiles(['m'], C, { legend: { m: ['back:moss', 'block:rock'] } }), 0, 0).map((c) => c.replace(/-fill(-b)?$/, '')), ['moss', 'rock']);
  assert.ok(layoutTiles(['x'], C, { legend: { x: 'back:nothing' } }).notes.some((n) => /nothing/.test(n)));
});
test('layoutTiles: a decal over a lone fill keeps the fill under it', () => {
  const clips = { ...blockClips('stone'), 'brick-fill': {}, ...decoClips('brick', ['on']) };
  assert.deepEqual(at(layoutTiles(['a', '#'], clips), 0, 0), ['brick-fill', 'brick-deco-a']);
  // top-down, a decal of the floor that already lies under everything adds nothing
  const room = layoutTiles(['a'], { 'floor-fill': {}, ...decoClips('floor', ['on']) }, { view: 'top-down' });
  assert.deepEqual(at(room, 0, 0), ['floor-fill', 'floor-deco-a']);
});

// ---- 3. solid for its neighbours, drawn with another clip -----------------------------------------------------
test('layoutTiles: "part:" and "open:" join a cell to a block but draw it with a clip of your own', () => {
  const CASTLE = { ...blockClips('stone'), 'arch-l': {}, 'arch-r': {}, window: {} };
  const rows = ['####', '#AB#', '####'];
  const L = layoutTiles(rows, CASTLE, { legend: { A: 'open:stone:arch-l', B: 'open:stone:arch-r' } });
  assert.deepEqual(L.notes, []);
  assert.deepEqual([at(L, 1, 1), at(L, 2, 1)], [['arch-l'], ['arch-r']]);
  assert.deepEqual([at(L, 0, 1), at(L, 1, 0), at(L, 3, 1), at(L, 2, 2)].map((c) => c[0].replace(/-fill.*/, '-fill')), ['stone-fill', 'stone-fill', 'stone-fill', 'stone-fill'], 'the wall round the arch is not outlined against it');
  assert.deepEqual([L.cells[1][1].kind, L.cells[1][1].prefix, L.cells[1][1].solid], ['part', 'stone', false], 'an opening can be walked through');
  const W = layoutTiles(['###', '#w#', '###'], CASTLE, { legend: { w: 'part:stone:window' } });
  assert.deepEqual(at(W, 1, 1), ['window']);
  assert.equal(W.cells[1][1].solid, true);
  assert.equal(L.tiles.find((t) => t.clip === 'arch-l').layer, L.tiles.find((t) => /stone-fill/.test(t.clip)).layer);
  // as a plain extra the cell is empty, and the wall closes round it (as before)
  assert.equal(at(layoutTiles(rows, CASTLE, { legend: { A: 'arch-l', B: 'arch-r' } }), 0, 1)[0], 'stone-side-r');
  assert.ok(layoutTiles(['A'], CASTLE, { legend: { A: 'open:stone:nope' } }).notes.some((n) => /nope/.test(n)));
});

// ---- 4. a stack that is only a foot ------------------------------------------------------------------------
test('a stack with only a foot draws its foot at the bottom of the run and nothing above, without a note', () => {
  const L = layoutTiles(['|', '|', '#'], { ...blockClips('g'), 'drip-foot': {} });
  assert.deepEqual(L.notes, []);
  assert.deepEqual([at(L, 0, 0), at(L, 0, 1)], [[], ['drip-foot']]);
  assert.deepEqual(pieceOf('fall-foot'), { prefix: 'fall', kind: 'stack', piece: 'foot' });
});

// ---- 5. lanes: bends, forks and crossings ---------------------------------------------------------------------
const of = (rows) => (x, y) => rows[y]?.[x] === '#';
const ALL = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES, ...LANE_PIECES].map((p) => [p, `p-${p}`]));
test('the nine lane pieces: names, clips, and which cells get them', () => {
  assert.deepEqual(LANE_PIECES, ['elbow-tl', 'elbow-tr', 'elbow-bl', 'elbow-br', 'tee-t', 'tee-r', 'tee-b', 'tee-l', 'cross']);
  const clips = blockClips('path', { narrow: true, lanes: true });
  assert.equal(Object.keys(clips).length, 29);
  for (const p of LANE_PIECES) { assert.ok(clips[`path-${p}`].label); assert.deepEqual(pieceOf(`path-${p}`), { prefix: 'path', kind: 'block', piece: p }); }
  assert.equal(Object.keys(blockClips('path', { narrow: true })).length, 20);
  // a bend: two sides joined, the corner between them cut
  assert.equal(pickPiece(of(['....', '.##.', '.#..']), 1, 1, ALL), 'elbow-tl');
  assert.equal(pickPiece(of(['....', '.##.', '..#.']), 2, 1, ALL), 'elbow-tr');
  assert.equal(pickPiece(of(['.#..', '.##.', '....']), 1, 1, ALL), 'elbow-bl');
  assert.equal(pickPiece(of(['..#.', '.##.', '....']), 2, 1, ALL), 'elbow-br');
  // a fork: three sides joined, both corners between them cut
  assert.equal(pickPiece(of(['.....', '#####', '..#..']), 2, 1, ALL), 'tee-t');
  assert.equal(pickPiece(of(['..#..', '#####', '.....']), 2, 1, ALL), 'tee-b');
  assert.equal(pickPiece(of(['.#.', '.##', '.#.']), 1, 1, ALL), 'tee-l');
  assert.equal(pickPiece(of(['.#.', '##.', '.#.']), 1, 1, ALL), 'tee-r');
  assert.equal(pickPiece(of(['.#.', '###', '.#.']), 1, 1, ALL), 'cross');
  // a corner that is not cut is ground two tiles wide: the usual pieces
  assert.equal(pickPiece(of(['....', '.##.', '.##.']), 1, 1, ALL), 'left');
  assert.equal(pickPiece(of(['.....', '#####', '.##..']), 2, 1, ALL), 'top');
  assert.equal(pickPiece(of(['##.', '###', '.#.']), 1, 1, ALL), 'inner-tr');
  // a tileset without them, or a caller that does not say what it has, gets the pieces it always got
  const no = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES].map((p) => [p, 1]));
  assert.equal(pickPiece(of(['....', '.##.', '.#..']), 1, 1, no), 'left');
  assert.equal(pickPiece(of(['....', '.##.', '.#..']), 1, 1), 'left');
  assert.equal(pickPiece(of(['.#.', '###', '.#.']), 1, 1, no), 'inner-tl');
  assert.equal(nearestPiece('elbow-tl', no), 'left'); assert.equal(nearestPiece('tee-t', no), 'top'); assert.equal(nearestPiece('cross', no), 'fill');
});
test('lane pieces are drawn from the same material and continue every piece they can touch exactly', () => {
  const m = path(), ink = col('#6a4a30');
  const names = [...BLOCK_PIECES, ...NARROW_PIECES, ...LANE_PIECES];
  const g = Object.fromEntries(names.map((p) => [p, piece(p, m)]));
  // an elbow: closed on its two open sides, and the rim turns the cut corner
  assert.ok(row(g['elbow-tl'], 0).every((v) => v === ink) && column(g['elbow-tl'], 0).every((v) => v === ink));
  assert.equal(g['elbow-tl'].get(31, 31), ink); assert.notEqual(g['elbow-tl'].get(28, 28), col('#c9a06a'), 'the rim, not bare fill');
  assert.equal(g['elbow-tl'].get(16, 16), col('#c9a06a'));
  for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) assert.equal(g.cross.get(x, y), ink, `cross corner ${x},${y}`);
  assert.ok(row(g['tee-t'], 0).every((v) => v === ink)); assert.equal(g['tee-t'].get(0, 31), ink); assert.equal(g['tee-t'].get(31, 31), ink);
  const joins = blockJoins({ narrow: true, lanes: true });
  for (const j of [['strip-m', 'x', 'elbow-tr'], ['elbow-tr', 'y', 'col-m'], ['elbow-tl', 'x', 'strip-m'], ['tee-t', 'y', 'col-m'], ['strip-m', 'x', 'tee-t'], ['strip-m', 'x', 'cross'], ['cross', 'y', 'col-b'], ['col-t', 'y', 'tee-b'], ['elbow-bl', 'x', 'elbow-tr']]) assert.ok(joins.some((k) => k.join() === j.join()), j.join(' '));
  for (const [a, axis, b] of joins) {
    const A = axis === 'x' ? column(g[a], 31) : row(g[a], 31), B = axis === 'x' ? column(g[b], 0) : row(g[b], 0);
    assert.ok(A.every((v, i) => v === B[i]), `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}`);
  }
  assert.equal(blockJoins().length, 64); assert.equal(blockJoins({ narrow: true }).length, JOINS_NARROW, 'the lists without lanes are unchanged');
});
test('layoutTiles lays a lane with its bends, forks and crossing, and falls back when the tileset has none', () => {
  const rows = ['.......', '...P...', '.PPPPP.', '...P.P.', '...PPP.', '.......'];
  const full = layoutTiles(rows, { 'floor-fill': {}, ...blockClips('path', { narrow: true, lanes: true }) }, { view: 'top-down' });
  const p = (c, r) => at(full, c, r)[1];
  assert.deepEqual([p(3, 1), p(1, 2), p(3, 2), p(5, 2), p(3, 3), p(3, 4), p(5, 4), p(5, 3)], ['path-col-t', 'path-strip-l', 'path-cross', 'path-elbow-tr', 'path-col-m', 'path-elbow-bl', 'path-elbow-br', 'path-col-m']);
  const plain = layoutTiles(rows, { 'floor-fill': {}, ...blockClips('path', { narrow: true }) }, { view: 'top-down' });
  assert.deepEqual([at(plain, 3, 2)[1], at(plain, 5, 2)[1], at(plain, 3, 4)[1]], ['path-inner-tl', 'path-right', 'path-bottom-l']);
  assert.deepEqual(plain.notes, []);
});
