// The tile helper (engine/tiles.js): one material description gives all 13 pieces of a
// block, and they join each other with no seam in every arrangement a block allows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, BLOCK_PIECES, blockClips, thinClips, slopeClips, decoClips, pieceOf, pieceFor, blockJoins,
  tileNoise, edgeWave, scatter, patternFill, surfaceAt,
  drawBlock, drawThin, drawSlope, drawTile,
} from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { seamCheck } from '../../quality/sprite.js';

const SOIL = '#7a4f33', SOIL_DARK = '#5a3a2e', GRASS = '#6aa83e', LIP = '#a4c44a';

// a side-view ground: grass cap over soil, lumpy top line, ragged underside
const grassy = (over = {}) => ({
  ink: INK,
  round: 1,
  fill: (x, y) => (tileNoise(x >> 1, y, 3) > 0.94 ? SOIL_DARK : SOIL),
  top: {
    depth: 7, wrap: 4, tuck: true,
    inset: (u) => Math.round(edgeWave(u, 1) * 2),
    ragged: (u) => (tileNoise(u >> 1, 0, 9) > 0.5 ? 1 : 0),
    paint: (d) => (d === 1 ? LIP : GRASS),
  },
  bottom: { depth: 2, inset: (u) => Math.round(edgeWave(u, 5) * 3), paint: () => SOIL_DARK },
  ...over,
});
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
test('edgeWave is a smooth 0..1 profile that repeats every 32 px', () => {
  for (let u = 0; u < 32; u++) {
    const v = edgeWave(u, 4);
    assert.ok(v >= 0 && v <= 1);
    assert.ok(Math.abs(v - edgeWave(u + 32, 4)) < 1e-9);
    assert.ok(Math.abs(v - edgeWave(u + 1, 4)) < 0.34, 'no jump between neighbouring pixels');
  }
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
test('pieceFor picks the piece from what is around a cell', () => {
  const all = { N: true, E: true, S: true, W: true, NE: true, SE: true, SW: true, NW: true };
  assert.equal(pieceFor(all), 'fill');
  assert.equal(pieceFor({ ...all, N: false, NE: false, NW: false }), 'top');
  assert.equal(pieceFor({ ...all, N: false, NW: true, NE: false }), 'top');
  assert.equal(pieceFor({ ...all, N: false, W: false, NW: false, SW: false }), 'left');
  assert.equal(pieceFor({ ...all, E: false, NE: false, SE: false }), 'side-r');
  assert.equal(pieceFor({ ...all, S: false, E: false, SE: false, SW: false }), 'bottom-r');
  assert.equal(pieceFor({ ...all, NW: false }), 'inner-tl');
  assert.equal(pieceFor({ ...all, SE: false }), 'inner-br');
  assert.equal(pieceFor({ ...all, W: false, E: false }), null, 'a strip one tile wide is not one of the 13');
});

for (const [name, material] of [['side-view ground', grassy()], ['side-view ground, flat', grassy({ round: 0, top: { ...grassy().top, inset: null, ragged: null } })], ['top-down path', path()], ['top-down wall', wall()]]) {
  test(`${name}: every pair of pieces that can touch joins without a seam`, () => {
    const g = Object.fromEntries(BLOCK_PIECES.map((p) => [p, piece(p, material)]));
    const isWall = !!material.face, face = (p) => p.startsWith('bottom');
    for (const [a, axis, b] of blockJoins()) {
      if (isWall && face(a) !== face(b)) continue;       // the cap meets its own front face there: a step by design
      const s = seamCheck(g[a], g[b], axis);
      assert.ok(s.ok, `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}: ${s.breaks} gaps (allowed ${s.maxBreaks}), brightness step ${s.jump.toFixed(3)} (allowed ${s.maxJump.toFixed(3)})`);
    }
  });
}

test('a flat material continues exactly across every legal join: the two sides of the boundary are the same pixels', () => {
  const g = Object.fromEntries(BLOCK_PIECES.map((p) => [p, piece(p, path())]));
  for (const [a, axis, b] of blockJoins()) {
    const A = axis === 'x' ? column(g[a], TILE - 1) : row(g[a], TILE - 1), B = axis === 'x' ? column(g[b], 0) : row(g[b], 0);
    assert.ok(same(A, B), `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}`);
  }
});

test('fill is fully opaque; edge pieces are see-through only outside the outline, at most 3 px in', () => {
  const m = grassy();
  assert.equal(opaque(piece('fill', m)), TILE * TILE);
  assert.ok(opaque(piece('top', m)) < TILE * TILE, 'the lumpy top line leaves some sky');
  // the outline is pinned to the tile boundary at both ends of every edge
  assert.ok(piece('top', m).get(0, 0) && piece('top', m).get(31, 0) && piece('bottom', m).get(0, 31) && piece('bottom', m).get(31, 31));
  for (const p of BLOCK_PIECES) {
    const g = piece(p, m);
    for (let y = 3; y < TILE - 3; y++) for (let x = 3; x < TILE - 3; x++) assert.ok(g.get(x, y), `${p}: hole at ${x},${y}`);
  }
});
test('the exposed edge is inked: every pixel beside the outside is the ink colour', () => {
  const ink = col(INK);
  for (const material of [grassy(), path({ ink: INK })]) for (const p of BLOCK_PIECES) {
    const g = piece(p, material);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (!g.get(x, y)) continue;
      const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && x + dx < TILE && y + dy >= 0 && y + dy < TILE && !g.get(x + dx, y + dy));
      if (beside) assert.equal(g.get(x, y), ink, `${p} at ${x},${y}`);
    }
  }
  // the four sides that face the outside are inked along the tile boundary too
  assert.ok(row(piece('top', path({ ink: INK })), 0).every((v) => v === ink));
  assert.ok(column(piece('side-r', path({ ink: INK })), TILE - 1).every((v) => v === ink));
  // an inner corner keeps the outline connected: its corner pixel is ink
  assert.equal(piece('inner-tl', path({ ink: INK })).get(0, 0), ink);
  assert.equal(piece('inner-br', path({ ink: INK })).get(31, 31), ink);
});
test('the edge band is at the same place on every piece that has it', () => {
  const m = path();
  const top = piece('top', m), left = piece('left', m), right = piece('right', m), sideL = piece('side-l', m), bl = piece('bottom-l', m);
  assert.ok(same(column(top, 16), column(left, 16)) && same(column(top, 16), column(right, 16)));
  assert.ok(same(row(sideL, 16), row(left, 16)) && same(row(sideL, 16), row(bl, 16)));
});
test('wrap lets a cap hang down the side at an outer corner, and only there', () => {
  const m = grassy({ round: 0, top: { depth: 5, wrap: 6, paint: () => GRASS } });
  const left = piece('left', m), top = piece('top', m);
  const capRows = (g, x) => column(g, x).filter((v) => v === col(GRASS)).length;
  assert.equal(capRows(top, 1), 5);
  assert.ok(capRows(left, 1) > 5, 'deeper beside the corner');
  assert.equal(capRows(left, 12), 5, 'back to the plain depth away from it');
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
test('outside can be painted (the bank of a hole) instead of left see-through', () => {
  const m = grassy({ outside: () => '#3f8a4f' });
  assert.equal(opaque(piece('left', m)), TILE * TILE);
});
test('drawing is deterministic and follows t for animated materials', () => {
  const m = grassy({ fill: (x, y, t) => (tileNoise(x, y + Math.round(t * 8), 1) > 0.5 ? '#3f9fd1' : '#2f7fb1') });
  for (const p of BLOCK_PIECES) assert.deepEqual(piece(p, m, 0.25).data, piece(p, m, 0.25).data);
  assert.notDeepEqual(piece('fill', m, 0).data, piece('fill', m, 0.5).data);
});

test('thin platform: 12 px thick in the top of the tile, see-through below, pieces join sideways', () => {
  const m = grassy();
  const thin = (part, o) => { const g = new Surface(TILE, TILE); drawThin(g, part, m, 0, o); return g; };
  const l = thin('l'), mid = thin('m'), r = thin('r');
  for (const g of [l, mid, r]) {
    const b = g.bounds();
    assert.ok(b.y1 <= 11 && b.y1 >= 9, `bottom at ${b.y1}`);
  }
  for (const [a, b] of [[l, mid], [mid, mid], [mid, r], [l, r]]) assert.ok(seamCheck(a, b, 'x').ok);
  assert.ok(column(l, l.bounds().x0).filter(Boolean).every((v) => v === col(INK)), 'the left end is closed by the ink line');
  assert.ok(column(r, r.bounds().x1).filter(Boolean).every((v) => v === col(INK)), 'the right end is closed by the ink line');
  assert.ok(thin('m', { thickness: 8 }).bounds().y1 <= 7);
  assert.equal(thin('m').get(16, 20), 0);
});
test('slopes: 45 degrees, rising and falling to the right, joining the top beside them and the corner under them', () => {
  const m = grassy();
  const slope = (d) => { const g = new Surface(TILE, TILE); drawSlope(g, d, m); return g; };
  const up = slope('up'), down = slope('down');
  assert.equal(up.get(2, 10), 0); assert.ok(up.get(29, 10)); assert.ok(up.get(16, 28));
  assert.equal(down.get(29, 10), 0); assert.ok(down.get(2, 10));
  assert.ok(seamCheck(up, piece('top', m), 'x').ok, 'slope-up left of top');
  assert.ok(seamCheck(piece('top', m), down, 'x').ok, 'top left of slope-down');
  assert.ok(seamCheck(up, piece('inner-tl', m), 'y').ok, 'slope-up above inner-tl');
  assert.ok(seamCheck(down, piece('inner-tr', m), 'y').ok, 'slope-down above inner-tr');
  // the surface line is inked in every column, one or two pixels deep (two where the line steps)
  for (let x = 4; x < 28; x++) { const n = column(up, x).filter((v) => v === col(INK)).length; assert.ok(n >= 1 && n <= 3, `column ${x}: ${n}`); }
  const flat = grassy({ top: { depth: 6, tuck: true, paint: () => GRASS } });
  const upFlat = new Surface(TILE, TILE); drawSlope(upFlat, 'up', flat);
  for (let x = 0; x < TILE; x++) assert.equal(column(upFlat, x).filter((v) => v === col(INK)).length, 1, `flat slope, column ${x}`);
  // with tuck the cap carries on under the slope exactly: the corner tile's first row is the row after the slope's last
  const under = piece('inner-tl', flat);
  for (let x = 0; x < 5; x++) assert.equal(under.get(x, 0), upFlat.get(x + 1, TILE - 1), `slope-up continues into inner-tl, column ${x}`);
  assert.equal(under.get(0, 0), col(GRASS)); assert.equal(under.get(6, 0), col(SOIL));
});
test('surfaceAt says where the top line is, for decals that stand on it', () => {
  const m = grassy(), top = piece('top', m);
  for (let x = 0; x < TILE; x++) {
    const y = surfaceAt(m, x);
    assert.ok(y >= 0 && y <= 3);
    assert.equal(top.get(x, y), col(INK));
    if (y > 0) assert.equal(top.get(x, y - 1), 0);
  }
});
test('drawTile draws block, thin and slope clips by name and leaves the rest to the sprite', () => {
  const m = grassy();
  const by = (clip) => { const g = new Surface(TILE, TILE); return [drawTile(g, clip, m, 0), g]; };
  assert.deepEqual(by('grass-side-l')[1].data, piece('side-l', m).data);
  assert.equal(by('grass-thin-m')[0], true);
  assert.equal(by('grass-slope-up')[0], true);
  const [handled, g] = by('grass-deco-a');
  assert.equal(handled, false);
  assert.equal(g.bounds(), null);
});
