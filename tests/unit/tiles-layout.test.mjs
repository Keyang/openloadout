// The shared picker, classifier and map layout of the tile helper (engine/tiles.js): the one place that
// decides which piece goes in which cell, used by tools/tilemap.mjs and by the playground.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, BLOCK_PIECES, NARROW_PIECES, blockClips, thinClips, slopeClips, decoClips, pieceOf, blockJoins,
  blockKind, classifyTiles, pickPiece, pickClip, pickThin, pickStack, fillVariant, layoutTiles,
  drawBlock, drawSlope, drawThin, textureTone, tileNoise, nearestPiece, pickDecal, DECAL_CHANCE,
} from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { col, ramp, INK } from '../../engine/color.js';
import { seamCheck } from '../../quality/sprite.js';

const SOIL = '#7a4f33', GRASS = '#6aa83e', LIP = '#a4c44a';
const grassy = (over = {}) => ({
  ink: INK, round: 1,
  fill: (x, y, t, v) => (tileNoise(x >> 1, y, 3 + (v ?? 0)) > 0.96 && x > 3 && x < 28 && y > 3 && y < 28 ? '#5a3a2e' : SOIL),
  top: { depth: 7, wrap: 4, tuck: 3, paint: (d, u, t, here) => (d === 1 ? LIP : d === here ? '#5a3a2e' : GRASS) },
  bottom: { depth: 2, paint: () => '#5a3a2e' },
  ...over,
});
const rim = { depth: 3, paint: (d) => (d === 1 ? '#8a6a44' : '#b08a5a') };
const path = () => ({ ink: '#6a4a30', fill: () => '#c9a06a', top: rim, side: rim, bottom: rim });
const wall = () => ({
  ink: INK, fill: () => '#a8a4a0',
  top: { depth: 3, paint: () => '#d0ccc8' }, side: { depth: 3, paint: () => '#c0bcb8' },
  face: { paint: () => '#787c90', shadow: '#4a6a3a' },
});
const piece = (name, m) => { const g = new Surface(TILE, TILE); drawBlock(g, name, m); return g; };
const column = (g, x) => Array.from({ length: TILE }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: TILE }, (_, x) => g.get(x, y));
const same = (a, b) => a.every((v, i) => v === b[i]);
const grid = (rows) => (x, y) => { const r = rows[Math.max(0, Math.min(rows.length - 1, y))]; return r[Math.max(0, Math.min(r.length - 1, x))] === '#'; };

// ---- more pieces: strips, columns, a single tile ---------------------------------------------------
test('the seven narrow pieces have names, clips and labels', () => {
  assert.deepEqual(NARROW_PIECES, ['strip-l', 'strip-m', 'strip-r', 'col-t', 'col-m', 'col-b', 'single']);
  const clips = blockClips('grass', { narrow: true });
  assert.equal(Object.keys(clips).length, 20);
  for (const p of NARROW_PIECES) { assert.ok(clips[`grass-${p}`].label); assert.deepEqual(pieceOf(`grass-${p}`), { prefix: 'grass', kind: 'block', piece: p }); }
  assert.equal(Object.keys(blockClips('grass')).length, 13, 'without the option nothing changes');
});
test('narrow pieces are closed on the sides that face out and join each other and the block', () => {
  const m = path(), ink = col('#6a4a30');
  const g = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES].map((p) => [p, piece(p, m)]));
  assert.ok(row(g['strip-m'], 0).every((v) => v === ink) && row(g['strip-m'], 31).every((v) => v === ink));
  assert.ok(column(g['col-m'], 0).every((v) => v === ink) && column(g['col-m'], 31).every((v) => v === ink));
  assert.ok(column(g['strip-l'], 0).every((v) => v === ink) && column(g['strip-r'], 31).every((v) => v === ink));
  assert.ok(row(g['col-t'], 0).every((v) => v === ink) && row(g['col-b'], 31).every((v) => v === ink));
  for (const line of [row(g.single, 0), row(g.single, 31), column(g.single, 0), column(g.single, 31)]) assert.ok(line.every((v) => v === ink));
  const joins = blockJoins({ narrow: true });
  for (const j of [['strip-l', 'x', 'strip-m'], ['strip-m', 'x', 'strip-m'], ['strip-m', 'x', 'strip-r'], ['strip-l', 'x', 'strip-r'], ['col-t', 'y', 'col-m'], ['col-m', 'y', 'col-m'], ['col-m', 'y', 'col-b'], ['col-t', 'y', 'col-b']]) {
    assert.ok(joins.some((k) => k.join() === j.join()), j.join(' '));
  }
  assert.equal(blockJoins().length, 64, 'the 13-piece list is unchanged');
  for (const [a, axis, b] of joins) {
    const A = axis === 'x' ? column(g[a], 31) : row(g[a], 31), B = axis === 'x' ? column(g[b], 0) : row(g[b], 0);
    assert.ok(same(A, B), `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}`);
  }
});

// ---- one picker -----------------------------------------------------------------------------
test('pickPiece resolves every one of the 256 ways a cell can be surrounded', () => {
  const names = new Set([...BLOCK_PIECES, ...NARROW_PIECES]);
  const D = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  for (let bits = 0; bits < 256; bits++) {
    const solid = (x, y) => (x === 0 && y === 0) || D.some(([dx, dy], i) => dx === x && dy === y && (bits >> i) & 1);
    const p = pickPiece(solid, 0, 0);
    assert.ok(names.has(p), `surroundings ${bits.toString(2)}: ${p}`);
    // the sides that face out are exactly the sides the piece is drawn closed on
    const open = { N: !((bits >> 0) & 1), E: !((bits >> 1) & 1), S: !((bits >> 2) & 1), W: !((bits >> 3) & 1) };
    const g = piece(p, path()), ink = col('#6a4a30');
    assert.equal(row(g, 0).every((v) => v === ink), open.N, `${bits.toString(2)} ${p}: north`);
    assert.equal(column(g, 31).every((v) => v === ink), open.E, `${bits.toString(2)} ${p}: east`);
    assert.equal(row(g, 31).every((v) => v === ink), open.S, `${bits.toString(2)} ${p}: south`);
    assert.equal(column(g, 0).every((v) => v === ink), open.W, `${bits.toString(2)} ${p}: west`);
  }
  assert.equal(pickPiece(() => false, 0, 0), null, 'an empty cell has no piece');
});
test('pickPiece: the usual cells, and a block with only the 13 pieces still gets a piece everywhere', () => {
  const rows = ['.....', '.###.', '.###.', '.###.', '.....', '..#..', '..#..', '.....', '.##..'];
  const at = (x, y, has) => pickPiece((cx, cy) => rows[cy]?.[cx] === '#', x, y, has);
  assert.deepEqual([at(1, 1), at(2, 1), at(3, 1), at(1, 2), at(2, 2), at(3, 2), at(1, 3), at(2, 3), at(3, 3)], ['left', 'top', 'right', 'side-l', 'fill', 'side-r', 'bottom-l', 'bottom', 'bottom-r']);
  assert.deepEqual([at(2, 5), at(2, 6), at(1, 8), at(2, 8)], ['col-t', 'col-b', 'strip-l', 'strip-r']);
  const only13 = Object.fromEntries(BLOCK_PIECES.map((p) => [p, `x-${p}`]));
  for (const [x, y] of [[2, 5], [2, 6], [1, 8], [2, 8]]) assert.ok(BLOCK_PIECES.includes(at(x, y, only13)), `${x},${y}`);
  // inner corners, also where two are cut
  const L = ['##.', '###', '###'];
  assert.equal(pickPiece(grid(L), 1, 1), 'inner-tr');
  assert.ok(['inner-tl', 'inner-tr'].includes(pickPiece((x, y) => !(y === -1 && x !== 0), 0, 0)));
});

test('pickPiece knows which sides of a slope are filled: its low side and its top are open', () => {
  // cells: '#' block, '/' slope-up (filled on its right and underneath), '\\' slope-down (filled on its left and underneath)
  const of = (rows) => (x, y) => { const ch = rows[y]?.[x]; return ch === '#' ? true : ch === '/' ? 'slope-up' : ch === '\\' ? 'slope-down' : false; };
  // 1. a block beside a slope's low end is closed on that side
  assert.equal(pickPiece(of(['....', '.#/.', '.###']), 1, 1), 'col-t');
  assert.equal(pickPiece(of(['.#..', '.#/.', '.###']), 1, 1), 'col-m');
  assert.equal(pickPiece(of(['....', '##/.', '####']), 1, 1), 'right');
  assert.equal(pickPiece(of(['....', '.\\##', '####']), 2, 1), 'left');
  // ... and still open towards a slope's high end
  assert.equal(pickPiece(of(['....', './##', '####']), 2, 1), 'top');
  assert.equal(pickPiece(of(['....', '##\\.', '####']), 1, 1), 'top');
  // 2. under a slope that ends at a drop, beside the next slope's low end: a closed side, not an inner corner
  assert.equal(pickPiece(of(['./..', '##/#', '####']), 1, 1), 'side-r');
  assert.equal(pickPiece(of(['..\\.', '#\\##', '####']), 2, 1), 'side-l');
  // 3. a block resting on a slope is closed underneath
  assert.equal(pickPiece(of(['.##.', '.##.', '.#/#', '####']), 2, 1), 'bottom-r');
  assert.equal(pickPiece(of(['###', '###', '#/#', '###']), 1, 1), 'bottom');
  // a cell under a slope is still covered by it; corners: only a slope's empty top corner counts as cut
  assert.equal(pickPiece(of(['./#', '###', '###']), 1, 1), 'inner-tl');
  assert.equal(pickPiece(of(['##/', '###', '###']), 1, 1), 'fill', 'the foot of a slope fills the corner');
  assert.equal(pickPiece(of(['###', '###', '##/']), 1, 1), 'inner-br', 'the open top corner of a slope is a cut corner');
  assert.equal(pickPiece(of(['###', '###', '##\\']), 1, 1), 'fill');
  // plain true and false behave as before
  assert.equal(pickPiece((x, y) => y >= 1, 1, 1), 'top');
});
test('layoutTiles closes blocks towards the open sides of slopes, and says when a slope ends at a drop', () => {
  const rows = ['........', '........', '...#....', '...#/...', '##.##/##', '########'];
  const L = layoutTiles(rows, FOREST);
  const at = (c, r) => L.tiles.filter((t) => t.col === c && t.row === r).map((t) => t.clip);
  assert.deepEqual(at(3, 2), ['grass-col-t']);
  assert.deepEqual(at(3, 3), ['grass-col-m'], 'beside the slope\'s low end');
  assert.deepEqual(at(4, 4), ['grass-side-r'], 'under one slope, beside the low end of the next');
  assert.deepEqual(at(6, 4), ['grass-top'], 'beside a slope\'s high end');
  assert.ok(L.notes.some((n) => /slope.*4,3.*drop/.test(n)), L.notes.join('; '));
  const resting = layoutTiles(['....', '.##.', '.##.', '.#/#', '####'], FOREST);
  assert.deepEqual(resting.tiles.filter((t) => t.col === 2 && t.row === 2).map((t) => t.clip), ['grass-bottom-r']);
  // a hill whose slopes all end on blocks has nothing to report
  assert.deepEqual(layoutTiles(['../\\..', './##\\.', '######'], FOREST).notes, []);
});

// ---- one classifier ---------------------------------------------------------------------------
test('blockKind: one list of words for walls and holes, and the hint from blockClips wins', () => {
  for (const w of ['wall', 'brick-wall', 'cliff', 'hedge', 'fence']) assert.equal(blockKind(w), 'wall', w);
  for (const h of ['pit', 'water', 'hole', 'void', 'lava', 'acid', 'pool', 'pond', 'chasm', 'water-deep']) assert.equal(blockKind(h), 'hole', h);
  for (const g of ['grass', 'path', 'carpet', 'stone']) assert.equal(blockKind(g), 'ground', g);
  assert.equal(blockKind('ruin', 'wall'), 'wall');
  assert.equal(blockKind('wall', 'ground'), 'ground');
});
test('classifyTiles sorts a tileset\'s clips into blocks, floors, platforms, slopes, stacks, decals and the rest', () => {
  const clips = {
    'floor-fill': {}, 'floor-fill-b': {},
    ...blockClips('grass', { narrow: true, fills: 3 }), ...thinClips('grass'), ...slopeClips('grass'),
    ...decoClips('grass', ['above', 'on', 'below']), 'grass-deco-10': { place: 'above' },
    ...blockClips('ruin', { kind: 'wall' }), ...blockClips('pond'),
    'ladder-cap': {}, 'ladder-mid': {}, 'ladder-foot': {}, window: {},
  };
  const t = classifyTiles(clips);
  assert.deepEqual(t.blocks.map((b) => [b.prefix, b.kind]), [['grass', 'ground'], ['ruin', 'wall'], ['pond', 'hole']]);
  const grass = t.blocks[0];
  assert.deepEqual(grass.fills, ['grass-fill', 'grass-fill-b', 'grass-fill-c']);
  assert.equal(grass.pieces['col-m'], 'grass-col-m');
  assert.equal(grass.pieces.fill, 'grass-fill');
  assert.deepEqual(t.floors.map((f) => [f.prefix, f.fills]), [['floor', ['floor-fill', 'floor-fill-b']]]);
  assert.deepEqual(t.thins, [{ prefix: 'grass', pieces: { l: 'grass-thin-l', m: 'grass-thin-m', r: 'grass-thin-r' } }]);
  assert.deepEqual(t.slopes, [{ prefix: 'grass', up: 'grass-slope-up', down: 'grass-slope-down' }]);
  assert.deepEqual(t.stacks, [{ prefix: 'ladder', pieces: { cap: 'ladder-cap', mid: 'ladder-mid', foot: 'ladder-foot' } }]);
  assert.deepEqual(t.decals.map((d) => [d.clip, d.place]), [['grass-deco-a', 'above'], ['grass-deco-b', 'on'], ['grass-deco-c', 'below'], ['grass-deco-10', 'above']]);
  assert.deepEqual(t.extras, ['window']);
  // the same from a list of names, and from a list of entries that carry something of the caller's own
  assert.deepEqual(classifyTiles(Object.keys(clips)).blocks.map((b) => b.prefix), ['grass', 'ruin', 'pond']);
  assert.equal(classifyTiles(Object.keys(clips)).blocks[1].kind, 'ground', 'no hint and no wall word: ground');
  assert.equal(classifyTiles([{ name: 'wall-fill' }, { name: 'wall-top' }]).blocks[0].kind, 'wall');
});
test('pieceOf reads fill variants and decals with any letters or digits', () => {
  assert.deepEqual(pieceOf('grass-fill-b'), { prefix: 'grass', kind: 'block', piece: 'fill-b' });
  assert.deepEqual(pieceOf('grass-deco-12'), { prefix: 'grass', kind: 'deco', piece: '12' });
  assert.deepEqual(pieceOf('grass-deco-a'), { prefix: 'grass', kind: 'deco', piece: 'a' });
});

// ---- fill variants: what breaks the 32 px repeat ------------------------------------------------------
test('fill variants: blockClips adds them, the material draws them, and the picker spreads them by position', () => {
  assert.deepEqual(Object.keys(blockClips('grass', { fills: 3 })).filter((k) => /fill/.test(k)), ['grass-fill', 'grass-fill-b', 'grass-fill-c']);
  const m = grassy();
  const a = piece('fill', m), b = piece('fill-b', m), c = piece('fill-c', m);
  assert.notDeepEqual(a.data, b.data); assert.notDeepEqual(b.data, c.data);
  for (const g of [a, b, c]) assert.ok(g.data.every((v) => v !== 0));
  // every variant joins every other on all four sides
  for (const A of [a, b, c]) for (const B of [a, b, c]) for (const axis of ['x', 'y']) assert.ok(seamCheck(A, B, axis).ok);
  const counts = [0, 0, 0];
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) { const v = fillVariant(x, y, 3); assert.equal(v, fillVariant(x, y, 3)); counts[v]++; }
  assert.ok(counts.every((n) => n > 150), `each variant is used: ${counts}`);
  assert.equal(fillVariant(5, 7, 1), 0);
  // no long runs of one variant along a row
  let longest = 0, run = 0;
  for (let x = 1; x < 200; x++) { run = fillVariant(x, 3, 3) === fillVariant(x - 1, 3, 3) ? run + 1 : 0; longest = Math.max(longest, run); }
  assert.ok(longest < 8, `longest run ${longest}`);
  const block = classifyTiles(blockClips('grass', { fills: 3 })).blocks[0];
  const seen = new Set();
  for (let x = 0; x < 12; x++) seen.add(pickClip(block, () => true, x, 4));
  assert.deepEqual([...seen].sort(), ['grass-fill', 'grass-fill-b', 'grass-fill-c']);
  assert.equal(pickClip(block, (x, y) => y >= 0, 3, 0), 'grass-top');
});

// ---- platforms and stacks ---------------------------------------------------------------------------
test('pickThin: free ends get end pieces; an end against a block runs into it', () => {
  const thin = (x, y) => y === 0 && x >= 2 && x <= 5, none = () => false;
  assert.deepEqual([2, 3, 4, 5].map((x) => pickThin(thin, none, x, 0)), ['l', 'm', 'm', 'r']);
  const wallAt6 = (x, y) => x === 6 && y === 0;
  assert.deepEqual([2, 5].map((x) => pickThin(thin, wallAt6, x, 0)), ['l', 'm'], 'no end piece beside a block: no double outline');
});
test('pickStack: cap on top, foot at the bottom, mid between', () => {
  const st = (x, y) => x === 0 && y >= 1 && y <= 4;
  assert.deepEqual([1, 2, 3, 4].map((y) => pickStack(st, 0, y)), ['cap', 'mid', 'mid', 'foot']);
});

// ---- one layout -----------------------------------------------------------------------------------
const FOREST = { ...blockClips('grass', { narrow: true, fills: 2 }), ...thinClips('grass'), ...slopeClips('grass'), ...decoClips('grass', ['above', 'on']), 'ladder-cap': {}, 'ladder-mid': {}, 'ladder-foot': {} };
test('layoutTiles turns a grid of letters into placed pieces', () => {
  const rows = [
    '.........',
    '..==.....',
    '..|...a..',
    '#.|../##.',
    '#########',
    '#########',
  ];
  const L = layoutTiles(rows, FOREST);
  assert.equal(L.cols, 9); assert.equal(L.rows, 6); assert.equal(L.view, 'side');
  assert.deepEqual(L.notes, []);
  const at = (c, r) => L.tiles.filter((t) => t.col === c && t.row === r).map((t) => t.clip);
  assert.deepEqual(at(0, 3), ['grass-right']);                     // the map carries on past its edge
  assert.deepEqual(at(0, 4), ['grass-inner-tr']);
  assert.deepEqual(at(5, 3), ['grass-slope-up']);
  assert.deepEqual(at(5, 4), ['grass-inner-tl'], 'the cell under a slope');
  assert.deepEqual(at(2, 1), ['grass-thin-l']); assert.deepEqual(at(3, 1), ['grass-thin-r']);
  assert.deepEqual(at(2, 2), ['ladder-cap']); assert.deepEqual(at(2, 3), ['ladder-foot']);
  assert.deepEqual(at(6, 2), ['grass-deco-a'], 'an above decal stands in an empty cell');
  assert.equal(at(5, 4).length, 1);
  assert.ok(/^grass-fill/.test(at(5, 5)[0]));
  // an "on" decal is drawn over a cell of its block
  const on = layoutTiles(['....', '####', '#b##', '####'], FOREST);
  assert.deepEqual(on.tiles.filter((t) => t.col === 1 && t.row === 2).map((t) => t.clip.replace(/fill-b$/, 'fill')), ['grass-fill', 'grass-deco-b']);
  // tiles come in drawing order, and every cell says whether it is solid
  assert.deepEqual([...L.tiles].sort((p, q) => p.layer - q.layer), L.tiles);
  assert.equal(L.cells[4][3].solid, true); assert.equal(L.cells[0][0].solid, false);
  assert.equal(L.cells[3][5].kind, 'slope-up'); assert.equal(L.cells[1][2].kind, 'thin');
});
test('layoutTiles reports what it cannot place, and takes a legend', () => {
  const L = layoutTiles(['..X.', '####', '####'], FOREST, { legend: { X: 'grass-deco-a', '#': 'grass' } });
  assert.deepEqual(L.notes, []);
  assert.equal(L.tiles.find((t) => t.row === 0).clip, 'grass-deco-a');
  const bad = layoutTiles(['.Z..', '####'], FOREST);
  assert.ok(bad.notes.some((n) => /Z/.test(n)), bad.notes.join('; '));
  const noSlope = layoutTiles(['./#', '###'], blockClips('rock'));
  assert.ok(noSlope.notes.some((n) => /slope/.test(n)));
});
test('layoutTiles, top-down: floor under everything, walls with doorways, a wall one tile wide, a pit and a path', () => {
  const ROOM = { 'floor-fill': {}, ...blockClips('wall', { kind: 'wall', narrow: true }), ...blockClips('pit', { kind: 'hole' }), ...blockClips('path'), ...decoClips('floor', ['on']) };
  const rows = [
    'WWWW..WWWW',
    'WWWW..WWWW',
    'WW......WW',
    'WW.PP.W.WW',
    '...PP.W...',
    'WW.a..OO.W',
    'WW....OO.W',
    'WWWWWWWWWW',
  ];
  const L = layoutTiles(rows, ROOM, { view: 'top-down' });
  assert.deepEqual(L.notes, []);
  assert.equal(L.view, 'top-down');
  const at = (c, r) => L.tiles.filter((t) => t.col === c && t.row === r).map((t) => t.clip);
  assert.deepEqual(at(4, 2), ['floor-fill']);
  assert.deepEqual(at(2, 1), ['floor-fill', 'wall-bottom'], 'the north wall shows its face');
  assert.deepEqual(at(3, 0), ['floor-fill', 'wall-side-r'], 'the doorway: the wall ends');
  assert.deepEqual(at(3, 1), ['floor-fill', 'wall-bottom-r']);
  assert.deepEqual(at(6, 3), ['floor-fill', 'wall-col-t']);
  assert.deepEqual(at(6, 4), ['floor-fill', 'wall-col-b'], 'a wall one tile wide ends in a face');
  assert.deepEqual(at(3, 3), ['floor-fill', 'path-left']);
  assert.deepEqual(at(6, 5), ['floor-fill', 'pit-left']);
  assert.deepEqual(at(3, 5), ['floor-fill', 'floor-deco-a']);
  assert.equal(L.cells[0][0].solid, true); assert.equal(L.cells[5][6].solid, true, 'a hole cannot be walked on'); assert.equal(L.cells[3][3].solid, false);
});

// ---- slopes ---------------------------------------------------------------------------------------------
test('slopes: no nub where a slope meets the corner tile under its foot or another slope', () => {
  const m = grassy(), ink = col(INK);
  const up = new Surface(TILE, TILE); drawSlope(up, 'up', m);
  const tl = piece('inner-tl', m), tr = piece('inner-tr', m);
  assert.notEqual(tl.get(0, 0), ink, 'a cap that tucks leaves the corner pixel to the cap');
  assert.notEqual(tr.get(31, 0), ink);
  // slope above its corner tile: the cap carries on exactly one row further down
  for (let x = 0; x < 3; x++) assert.equal(tl.get(x, 0), up.get(x + 1, 31), `column ${x}`);
  // a rim that is the same all round keeps its corner pixel
  assert.equal(piece('inner-tl', path()).get(0, 0), col('#6a4a30'));
});
test('slopes: the band is as thick across a slope as on the flat, and meets the flat top without a step', () => {
  const m = grassy({ top: { depth: 8, tuck: 3, paint: () => GRASS } });
  const up = new Surface(TILE, TILE); drawSlope(up, 'up', m);
  const top = piece('top', m);
  const depthAt = (g, x) => column(g, x).filter((v) => v === col(GRASS)).length;
  assert.equal(depthAt(top, 10), 8);
  assert.ok(depthAt(up, 16) >= 11 && depthAt(up, 16) <= 12, `mid-slope the band is 8 px across, so about 11 down: ${depthAt(up, 16)}`);
  assert.equal(depthAt(up, 31), depthAt(top, 0), 'at the join the two are the same');
  for (let x = 20; x < 31; x++) assert.ok(Math.abs(depthAt(up, x) - depthAt(up, x + 1)) <= 1, `no step at column ${x}`);
});

// ---- top-down walls one tile thick --------------------------------------------------------------------------
test('a top-down wall one tile wide or one tile deep still has a cap and a face', () => {
  const m = wall(), ink = col(INK), face = col('#787c90');
  const colB = piece('col-b', m), colT = piece('col-t', m), stripM = piece('strip-m', m), single = piece('single', m);
  assert.equal(colB.get(16, 12), face); assert.equal(colB.get(0, 12), ink); assert.equal(colB.get(31, 12), ink);
  assert.equal(colT.get(16, 12), col('#a8a4a0'));
  assert.equal(stripM.get(16, 0), ink, 'a strip is closed on top');
  assert.equal(stripM.get(16, 2), col('#d0ccc8'), 'with a sliver of cap');
  assert.equal(stripM.get(16, 5), col('#a8a4a0'));
  assert.equal(stripM.get(16, 20), face, 'over its face');
  assert.equal(stripM.get(16, 29), ink); assert.equal(stripM.get(16, 31), col('#4a6a3a'));
  assert.equal(single.get(0, 20), ink); assert.equal(single.get(31, 20), ink); assert.equal(single.get(16, 20), face);
  assert.ok(same(row(colT, 31), row(piece('col-m', m), 0)));
});

test('textureTone: the dark of a colour\'s ramp, or deeper, and never a tone that a look turns into the colour', async () => {
  const { THEME_PRESETS, applyColour } = await import('../../engine/theme.js');
  const { PALETTE } = await import('../../engine/palettes.js');
  assert.equal(textureTone('#7a4f33'), ramp('#7a4f33').dark);
  for (const pal of Object.values(PALETTE)) for (const [name, c] of Object.entries(pal)) {
    if (name === 'ink' || name === 'void') continue;
    const t = textureTone(c);
    assert.ok([ramp(c).dark, ramp(c).deep].includes(t) || t !== c, name);
    for (const look of THEME_PRESETS) { const to = applyColour(Uint32Array.from([col(c), col(t)]), look.theme.colour); assert.notEqual(to[0], to[1], `${name} ${c} under ${look.id}`); }
  }
});

// ---- what the playground had to work round: partial blocks, solidity, several tilesets, scattered decals ----------
test('nearestPiece: a block that lacks a piece gets the closest one it has, in a stated order', () => {
  assert.equal(nearestPiece('top', { top: 1 }), 'top');
  // the piece that closes the most of the same sides without closing any other: top first, then the sides, then the bottom
  assert.equal(nearestPiece('left', { top: 1, 'side-l': 1, fill: 1 }), 'top');
  assert.equal(nearestPiece('left', { 'side-l': 1, fill: 1 }), 'side-l');
  assert.equal(nearestPiece('bottom-r', { bottom: 1, 'side-r': 1, fill: 1 }), 'side-r');
  assert.equal(nearestPiece('single', { top: 1, fill: 1 }), 'top');
  assert.equal(nearestPiece('inner-tl', { fill: 1, top: 1, 'inner-br': 1 }), 'fill');
  assert.equal(nearestPiece('side-l', { top: 1, fill: 1 }), 'fill', 'never a piece that closes a joined side while one that does not is there');
  assert.equal(nearestPiece('fill', { top: 1, left: 1 }), 'top', 'with nothing better: the piece with the fewest wrongly closed sides');
  assert.equal(nearestPiece('top', {}), null);
  const all13 = Object.fromEntries(BLOCK_PIECES.map((p) => [p, `x-${p}`]));
  assert.deepEqual(NARROW_PIECES.map((p) => nearestPiece(p, all13)), ['left', 'top', 'right', 'left', 'side-l', 'bottom-l', 'left'], 'the narrow pieces fall back as before');
  for (const p of [...BLOCK_PIECES, ...NARROW_PIECES]) assert.equal(nearestPiece(p, { ...all13, [p]: 1 }), p);
});
test('pickClip and layoutTiles draw a partial block with what it has', () => {
  const block = classifyTiles(['rock-fill', 'rock-top']).blocks[0];
  const solid = (x, y) => x >= 1 && x <= 2 && y >= 1 && y <= 2;
  assert.deepEqual([[1, 1], [2, 1], [1, 2], [2, 2]].map(([x, y]) => pickClip(block, solid, x, y)), ['rock-top', 'rock-top', 'rock-fill', 'rock-fill']);
  const L = layoutTiles(['....', '.##.', '.##.', '....'], ['rock-fill', 'rock-top']);
  assert.deepEqual(L.notes, []);
  assert.deepEqual(L.tiles.map((t) => t.clip), ['rock-top', 'rock-top', 'rock-fill', 'rock-fill']);
  assert.equal(pickPiece(solid, 1, 1, block.pieces), 'top');
  assert.equal(pickPiece(solid, 1, 1), 'left', 'without `has` the exact piece is named');
});
test('layoutTiles: what is solid comes from the letters, whether or not the tileset has tiles for them', () => {
  const side = layoutTiles(['..=.', '#/.|', 'I\\##'], {});
  assert.deepEqual(side.tiles, []);
  assert.ok(side.notes.length >= 4);
  const k = (L, r, c) => [L.cells[r][c].kind, L.cells[r][c].solid];
  assert.deepEqual([k(side, 1, 0), k(side, 1, 1), k(side, 2, 1), k(side, 2, 0), k(side, 0, 2), k(side, 1, 3), k(side, 0, 0)],
    [['block', true], ['slope-up', true], ['slope-down', true], ['block', true], ['thin', false], ['stack', false], ['empty', false]]);
  const top = layoutTiles(['W.O', 'P.Q'], {}, { view: 'top-down' });
  assert.deepEqual([k(top, 0, 0), k(top, 0, 2), k(top, 1, 0), k(top, 1, 2), k(top, 0, 1)], [['block', true], ['block', true], ['block', false], ['block', false], ['empty', false]]);
  // a letter of the caller's own: solid as the block it names would be
  const own = layoutTiles(['XYZ'], {}, { view: 'top-down', legend: { X: 'block:lava', Y: 'block:carpet', Z: 'block:hedge' } });
  assert.deepEqual([own.cells[0][0].solid, own.cells[0][1].solid, own.cells[0][2].solid], [true, false, true]);
  assert.equal(layoutTiles(['X'], {}, { legend: { X: 'block:anything' } }).cells[0][0].solid, true, 'side view: every block is solid');
  // with tiles the answer is the same
  const withTiles = layoutTiles(['..=.', '#/.|', 'I\\##'], FOREST);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) assert.deepEqual(k(withTiles, r, c), k(side, r, c), `${c},${r}`);
});
test('classifyTiles takes several tilesets and says which one each thing came from', () => {
  const A = { ...blockClips('grass'), ...thinClips('grass') };
  const B = { ...thinClips('plank'), 'ladder-cap': {}, 'ladder-mid': {}, ...blockClips('grass'), 'grass-deco-a': { place: 'above' }, ...blockClips('brick', { kind: 'wall' }) };
  const t = classifyTiles([{ key: 'forest', clips: A }, { key: 'planks', clips: B }]);
  assert.deepEqual(t.blocks.map((b) => [b.prefix, b.set, b.kind]), [['grass', 'forest', 'ground'], ['brick', 'planks', 'wall']], 'a prefix belongs to the first tileset that has it');
  assert.deepEqual(t.thins.map((x) => [x.prefix, x.set]), [['grass', 'forest'], ['plank', 'planks']]);
  assert.deepEqual(t.stacks.map((x) => [x.prefix, x.set]), [['ladder', 'planks']]);
  assert.deepEqual(t.decals.map((d) => [d.clip, d.set]), [['grass-deco-a', 'planks']], 'a decal may come from another tileset than its block');
  assert.deepEqual(t.blocks[0].decals.map((d) => d.clip), ['grass-deco-a']);
  assert.equal(t.from['grass-top'], 'forest'); assert.equal(t.from['plank-thin-m'], 'planks'); assert.equal(t.from['brick-fill'], 'planks');
  // names (file order) may be given beside the clip table
  const viaNames = classifyTiles([{ key: 1, names: ['wall-top', 'wall-fill'], clips: { 'wall-top': { block: 'ground' }, 'wall-fill': {} } }]);
  assert.deepEqual(viaNames.blocks.map((b) => [b.prefix, b.set, b.kind]), [['wall', 1, 'ground']]);
  // every tile of a layout says which tileset draws it
  const L = layoutTiles(['=-', '##'], t);
  assert.deepEqual(L.tiles.map((x) => [x.clip, x.set]).sort(), [['grass-top', 'forest'], ['grass-top', 'forest'], ['grass-thin-l', 'forest'], ['plank-thin-l', 'planks']].sort());
  // one tileset: nothing changes
  const single = classifyTiles(A);
  assert.equal(single.from, undefined); assert.equal('set' in single.blocks[0], false);
});
test('pickDecal: which decal, if any, stands in a cell, the same every time', () => {
  const decals = [{ clip: 'g-deco-a', place: 'above' }, { clip: 'g-deco-b', place: 'above' }, { clip: 'g-deco-c', place: 'on' }];
  const seen = new Map();
  let n = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const d = pickDecal(decals, 'above', x, y);
    assert.equal(d, pickDecal(decals, 'above', x, y));
    if (d) { n++; seen.set(d, (seen.get(d) ?? 0) + 1); }
  }
  assert.deepEqual([...seen.keys()].sort(), ['g-deco-a', 'g-deco-b'], 'only decals of that place');
  assert.ok(Math.abs(n / 1600 - DECAL_CHANCE.above) < 0.06, `${n} of 1600`);
  assert.ok(Math.min(...seen.values()) > n * 0.3, 'both are used');
  assert.equal(pickDecal(decals, 'below', 3, 3), null);
  assert.equal(pickDecal([], 'on', 3, 3), null);
  let all = 0;
  for (let x = 0; x < 200; x++) if (pickDecal(decals, 'on', x, 0, 1)) all++;
  assert.equal(all, 200, 'a chance of 1 puts one in every cell');
});
test('layoutTiles scatters decals by that rule when asked: on fill, above a top, under a bottom, never elsewhere', () => {
  const clips = { ...blockClips('grass', { fills: 2 }), ...decoClips('grass', ['above', 'on', 'below']) };
  const rows = ['.'.repeat(30), '.'.repeat(30), '#'.repeat(30), '#'.repeat(30), '#'.repeat(30), '.'.repeat(30)];
  const L = layoutTiles(rows, clips, { decals: true });
  const at = (c, r) => L.tiles.filter((t) => t.col === c && t.row === r).map((t) => t.clip);
  const placed = L.tiles.filter((t) => /-deco-/.test(t.clip));
  for (const place of ['a', 'b', 'c']) assert.ok(placed.some((t) => t.clip === `grass-deco-${place}`), `some grass-deco-${place}`);
  for (const t of placed) {
    if (t.clip === 'grass-deco-a') { assert.equal(t.row, 1); assert.deepEqual(at(t.col, 2), ['grass-top']); }
    if (t.clip === 'grass-deco-b') { assert.equal(t.row, 3); assert.ok(/^grass-fill/.test(at(t.col, 3)[0])); }
    if (t.clip === 'grass-deco-c') { assert.equal(t.row, 5); assert.deepEqual(at(t.col, 4), ['grass-bottom']); }
  }
  assert.deepEqual(layoutTiles(rows, clips, { decals: true }).tiles, L.tiles);
  assert.equal(layoutTiles(rows, clips).tiles.filter((t) => /-deco-/.test(t.clip)).length, 0, 'not unless asked');
  assert.equal(layoutTiles(rows, clips, { decals: { above: 0, on: 0, below: 0 } }).tiles.filter((t) => /-deco-/.test(t.clip)).length, 0);
  // a decal written in the map stays where it is; top-down, floor decals go on bare floor
  const room = layoutTiles(['........', '........', '..WW....', '..WW....'], { 'floor-fill': {}, ...blockClips('wall', { kind: 'wall' }), ...decoClips('floor', ['on']) }, { view: 'top-down', decals: { floor: 1 } });
  const crack = room.tiles.filter((t) => t.clip === 'floor-deco-a');
  assert.equal(crack.length, 28, 'every bare floor cell, none on the wall');
});
