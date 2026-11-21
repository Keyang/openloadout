// The tile helper (engine/tiles.js): one material description gives all 13 pieces of a
// block, and they join each other with no seam in every arrangement a block allows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, BLOCK_PIECES, blockClips, thinClips, slopeClips, decoClips, pieceOf, blockJoins, tileNoise, scatter, patternFill, drawBlock, drawThin, drawSlope, drawTile } from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { seamCheck } from '../../quality/sprite.js';

const SOIL = '#7a4f33', SOIL_DARK = '#5a3a2e', GRASS = '#6aa83e', LIP = '#a4c44a';

// a top-down path: the same soft rim on every side, no ink
const rim = { depth: 3, paint: (d) => (d === 1 ? '#8a6a44' : '#b08a5a') };
const path = (over = {}) => ({ ink: '#6a4a30', fill: () => '#c9a06a', top: rim, side: rim, bottom: rim, ...over });
// a top-down wall: a lit cap with a rim, and a front face on the bottom row
const wall = () => ({
  ink: INK,
  fill: () => '#a8a4a0',
  top: { depth: 3, paint: () => '#d0ccc8' }, side: { depth: 3, paint: () => '#c0bcb8' },
  face: { paint: (x, y) => (y % 8 === 7 ? '#5a5f7a' : '#787c90'), shadow: '#4a6a3a' },
});

const piece = (name, material, t = 0) => { const g = new Surface(TILE, TILE); drawBlock(g, name, material, t); return g; };
const opaque = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const column = (g, x) => Array.from({ length: TILE }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: TILE }, (_, x) => g.get(x, y));
const same = (a, b) => a.every((v, i) => v === b[i]);

test('TILE is 32', () => assert.equal(TILE, 32));

test('blockClips returns the 13 clip names of style guide section 6', () => {
  const clips = blockClips('grass');
  assert.deepEqual(Object.keys(clips).sort(), [
    'grass-bottom', 'grass-bottom-l', 'grass-bottom-r', 'grass-fill',
    'grass-inner-bl', 'grass-inner-br', 'grass-inner-tl', 'grass-inner-tr',
    'grass-left', 'grass-right', 'grass-side-l', 'grass-side-r', 'grass-top',
  ]);
  for (const c of Object.values(clips)) { assert.equal(c.frames, 1); assert.ok(c.fps >= 1); assert.equal(typeof c.label, 'string'); }
  assert.equal(BLOCK_PIECES.length, 13);
});
test('blockClips: animated blocks give every piece the same frame count', () => {
  const clips = blockClips('water', { frames: 8, fps: (p) => 6 * p.speed });
  for (const c of Object.values(clips)) { assert.equal(c.frames, 8); assert.equal(typeof c.fps, 'function'); assert.equal(c.loop, true); }
});
test('thinClips, slopeClips and decoClips use the section 6 names', () => {
  assert.deepEqual(Object.keys(thinClips('plank')), ['plank-thin-l', 'plank-thin-m', 'plank-thin-r']);
  assert.deepEqual(Object.keys(slopeClips('grass')), ['grass-slope-up', 'grass-slope-down']);
  const deco = decoClips('grass', ['above', 'on', 'below']);
  assert.deepEqual(Object.keys(deco), ['grass-deco-a', 'grass-deco-b', 'grass-deco-c']);
  assert.deepEqual(Object.values(deco).map((c) => c.place), ['above', 'on', 'below']);
});
test('pieceOf reads a clip name', () => {
  assert.deepEqual(pieceOf('grass-inner-tl'), { prefix: 'grass', kind: 'block', piece: 'inner-tl' });
  assert.deepEqual(pieceOf('wall-bottom-r'), { prefix: 'wall', kind: 'block', piece: 'bottom-r' });
  assert.deepEqual(pieceOf('fill'), { prefix: '', kind: 'block', piece: 'fill' });
  assert.deepEqual(pieceOf('plank-thin-l'), { prefix: 'plank', kind: 'thin', piece: 'l' });
  assert.deepEqual(pieceOf('grass-slope-down'), { prefix: 'grass', kind: 'slope', piece: 'down' });
  assert.deepEqual(pieceOf('stone-deco-b'), { prefix: 'stone', kind: 'deco', piece: 'b' });
  assert.deepEqual(pieceOf('ladder-mid'), { prefix: 'ladder', kind: 'stack', piece: 'mid' });
  assert.equal(pieceOf('window'), null);
});

test('tileNoise repeats every 32 px, is between 0 and 1, and depends on the seed', () => {
  let differs = 0;
  for (let y = -3; y < 40; y += 3) for (let x = -5; x < 40; x += 3) {
    const v = tileNoise(x, y, 7);
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, tileNoise(x + 32, y, 7));
    assert.equal(v, tileNoise(x, y - 64, 7));
    assert.equal(v, tileNoise(x, y, 7));
    if (v !== tileNoise(x, y, 8)) differs++;
  }
  assert.ok(differs > 100);
});
test('scatter gives the same well-spaced marks every time, off the outer 2 px', () => {
  const a = scatter(5, 6), b = scatter(5, 6);
  assert.deepEqual(a, b);
  assert.equal(a.length, 6);
  for (const m of a) assert.ok(m.x >= 2 && m.x <= 29 && m.y >= 2 && m.y <= 29 && m.r >= 0 && m.r < 1);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) assert.ok(Math.abs(a[i].x - a[j].x) + Math.abs(a[i].y - a[j].y) >= 5);
  assert.notDeepEqual(scatter(6, 6), a);
});
test('patternFill turns a drawing into a fill that repeats every 32 px', () => {
  const fill = patternFill('#7a4f33', (s) => s.rect(4, 4, 3, 2, '#5a3a2e'));
  assert.equal(fill(5, 5), col('#5a3a2e'));
  assert.equal(fill(5 + 32, 5 - 32), col('#5a3a2e'));
  assert.equal(fill(20, 20), col('#7a4f33'));
});

test('blockJoins lists every pair the style guide says must join, and no impossible pair', () => {
  const joins = blockJoins();
  const has = (a, axis, b) => joins.some((j) => j[0] === a && j[1] === axis && j[2] === b);
  const must = [
    ['fill', 'x', 'fill'], ['fill', 'y', 'fill'], ['top', 'x', 'top'], ['top', 'y', 'fill'],
    ['left', 'x', 'top'], ['top', 'x', 'right'], ['left', 'y', 'side-l'], ['right', 'y', 'side-r'],
    ['side-l', 'x', 'fill'], ['fill', 'x', 'side-r'], ['side-l', 'y', 'side-l'], ['side-r', 'y', 'side-r'],
    ['bottom', 'x', 'bottom'], ['fill', 'y', 'bottom'], ['bottom-l', 'x', 'bottom'], ['bottom', 'x', 'bottom-r'],
    ['side-l', 'y', 'bottom-l'], ['side-r', 'y', 'bottom-r'],
    ['inner-tl', 'x', 'fill'], ['inner-tl', 'y', 'fill'], ['top', 'x', 'inner-tl'], ['side-l', 'y', 'inner-tl'], ['left', 'y', 'inner-tl'],
    ['inner-tr', 'x', 'top'], ['right', 'y', 'inner-tr'], ['inner-tr', 'x', 'right'],
    ['bottom', 'x', 'inner-bl'], ['inner-bl', 'y', 'side-l'], ['inner-bl', 'y', 'bottom-l'],
    ['inner-br', 'x', 'bottom'], ['inner-br', 'y', 'side-r'],
    ['left', 'x', 'right'], ['left', 'y', 'bottom-l'], ['top', 'y', 'bottom'],
  ];
  for (const [a, axis, b] of must) assert.ok(has(a, axis, b), `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}`);
  const never = [
    ['fill', 'x', 'top'], ['top', 'x', 'fill'], ['right', 'x', 'top'], ['top', 'x', 'left'], ['fill', 'y', 'top'], ['bottom', 'y', 'fill'],
    ['side-r', 'x', 'fill'], ['fill', 'x', 'side-l'], ['inner-tr', 'x', 'inner-tl'], ['left', 'x', 'bottom-r'], ['fill', 'x', 'right'],
  ];
  for (const [a, axis, b] of never) assert.ok(!has(a, axis, b), `not ${a} ${axis === 'x' ? 'left of' : 'above'} ${b}`);
  for (const [a, axis, b] of joins) { assert.ok(BLOCK_PIECES.includes(a) && BLOCK_PIECES.includes(b)); assert.ok(axis === 'x' || axis === 'y'); }
  assert.ok(joins.length > must.length);
});
test('a flat material continues exactly across every legal join: the two sides of the boundary are the same pixels', () => {
  const g = Object.fromEntries(BLOCK_PIECES.map((p) => [p, piece(p, path())]));
  for (const [a, axis, b] of blockJoins()) {
    const A = axis === 'x' ? column(g[a], TILE - 1) : row(g[a], TILE - 1), B = axis === 'x' ? column(g[b], 0) : row(g[b], 0);
    assert.ok(same(A, B), `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}`);
  }
});

test('the edge band is at the same place on every piece that has it', () => {
  const m = path();
  const top = piece('top', m), left = piece('left', m), right = piece('right', m), sideL = piece('side-l', m), bl = piece('bottom-l', m);
  assert.ok(same(column(top, 16), column(left, 16)) && same(column(top, 16), column(right, 16)));
  assert.ok(same(row(sideL, 16), row(left, 16)) && same(row(sideL, 16), row(bl, 16)));
});
test('a top-down wall: the bottom row is its front face, opaque down to the base line, then the shadow', () => {
  const m = wall();
  const b = piece('bottom', m), bl = piece('bottom-l', m), fill = piece('fill', m);
  assert.equal(opaque(b), TILE * TILE);
  assert.equal(b.get(10, 3), col('#787c90'));
  assert.equal(b.get(10, 29), col(INK), 'base line');
  assert.equal(b.get(10, 31), col('#4a6a3a'), 'shadow on the floor');
  assert.equal(bl.get(0, 10), col(INK), 'the face ends in an ink line');
  assert.notEqual(b.get(10, 3), fill.get(10, 3));
  // the corner where the wall turns towards the camera keeps the cap's edge beside the face
  assert.ok(same(column(piece('inner-bl', m), 0), column(piece('side-l', m), 0)));
});