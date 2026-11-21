// Framework additions of batch R04 (tiles-meadow, tree-oak, tree-pine):
//   engine/tiles.js    drawSoftBlock: a block of soft ground (a path, sand, the bank of a pond) with true arcs at its
//                      corners and an outline that wanders further in than drawBlock allows
//                      bandCell, bandStone: a mark in an edge band (a half-buried stone) that stays upright and lit
//                      from the top right on all four edges
//   engine/foliage.js  tree parts: a crown of leaf masses, tufts round its outside, leaf marks, a trunk with root
//                      flares, a fir tier, falling leaves
// R3 (2026-11-21): engine/foliage.js (the tree parts) went with its tests; the engine/tiles.js tests stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, BLOCK_PIECES, NARROW_PIECES, blockJoins, drawBlock, drawSoftBlock, bandCell, bandStone } from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
const SAND = '#ecda95', RIM = '#a05c37', SHADE = '#c9a06a', BANK = '#7fbf5a';
const piece = (draw, name, material, t = 0) => { const g = new Surface(TILE, TILE); draw(g, name, material, t); return g; };
const column = (g, x) => Array.from({ length: TILE }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: TILE }, (_, x) => g.get(x, y));
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);

const soft = (over = {}) => ({
  ink: null, round: 8,
  fill: (x, y, t, v) => (v ? '#d9bc7e' : SAND),
  top: { depth: 3, inset: dips(3, 6), paint: (d) => (d === 1 ? RIM : SHADE) },
  right: { depth: 3, inset: dips(5, 5), paint: (d) => (d === 1 ? RIM : SHADE) },
  bottom: { depth: 1, inset: dips(7, 4), paint: () => RIM },
  left: { depth: 1, inset: dips(9, 8), paint: () => RIM },
  ...over,
});

test('drawSoftBlock: an outer corner is a true arc of the radius asked for', () => {
  const flat = { ink: null, fill: () => SAND };
  for (const round of [4, 8, 12]) {
    const g = piece(drawSoftBlock, 'left', { ...flat, round });
    // the same either side of the diagonal, and as much cut away as a quarter circle leaves of its square
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(!!g.get(x, y), !!g.get(y, x), `round ${round}: mirrored at ${x},${y}`);
    const cut = TILE * TILE - count(g), ideal = round * round * (1 - Math.PI / 4);
    assert.ok(Math.abs(cut - ideal) <= round, `round ${round}: ${cut} px cut away, a quarter circle leaves ${ideal.toFixed(1)}`);
    assert.ok(!g.get(0, 0) && g.get(round, round) && g.get(TILE - 1, 0) && g.get(0, TILE - 1));
  }
  // a tile on its own with a big radius is a round patch, the same in all four corners
  const dot = piece(drawSoftBlock, 'single', { ...flat, round: 14 });
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    assert.equal(!!dot.get(x, y), !!dot.get(TILE - 1 - x, y));
    assert.equal(!!dot.get(x, y), !!dot.get(x, TILE - 1 - y));
  }
});

test('drawSoftBlock: the outline may wander up to 8 px in, and is still on the tile boundary at both ends of an edge', () => {
  const g = piece(drawSoftBlock, 'top', { ink: null, fill: () => SAND, top: { inset: () => 20 } });
  const first = (x) => column(g, x).findIndex((v) => v);
  assert.equal(first(0), 0);
  assert.equal(first(TILE - 1), 0);
  assert.equal(first(3), 3);
  assert.equal(first(16), 8);
});

const row48 = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y));

// ---- engine/tiles.js: marks in an edge band that have a top and a bottom ------------------------------------

const EDGES = { top: 'top', bottom: 'bottom', left: 'side-l', right: 'side-r' };      // the edge, and a piece that has only that edge
const TONES = { light: '#e4e4ee', base: '#b6b0bf', dark: '#6a6478' };
// a path whose four edges each carry the stones given, on a plain band 8 px deep
const stony = (stones) => {
  const edge = (which) => ({ depth: 8, paint: (d, u) => bandStone(which, d, u, stones, TONES) ?? (d === 1 ? RIM : null) });
  return { ink: null, round: 0, fill: () => SAND, top: edge('top'), bottom: edge('bottom'), left: edge('left'), right: edge('right') };
};
// the stone's pixels in a tile, as rows of letters (L light, B base, D dark, '.' not stone), cropped to the stone
const stoneRows = (g) => {
  const letter = new Map([[col(TONES.light), 'L'], [col(TONES.base), 'B'], [col(TONES.dark), 'D']]);
  const rows = [];
  for (let y = 0; y < TILE; y++) rows.push(row(g, y).map((v) => letter.get(v) ?? '.'));
  const used = rows.map((r, y) => (r.some((c) => c !== '.') ? y : -1)).filter((y) => y >= 0);
  const xs = rows.flatMap((r) => r.map((c, x) => (c !== '.' ? x : -1)).filter((x) => x >= 0));
  assert.ok(used.length, 'a stone was drawn');
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  return { x0, y0: used[0], rows: rows.slice(used[0], used.at(-1) + 1).map((r) => r.slice(x0, x1 + 1).join('')) };
};

test('bandCell: a band pixel becomes a column and a row counted from the top left on screen, on every edge', () => {
  const box = [10, 3, 5, 2];                                   // from u = 10, 5 px along the edge; depths 3 and 4
  assert.deepEqual(bandCell('top', 3, 10, box), { col: 0, row: 0, wide: 5, tall: 2 });
  assert.deepEqual(bandCell('top', 4, 14, box), { col: 4, row: 1, wide: 5, tall: 2 });
  // along the bottom edge depth runs upwards: the pixel nearest the outline is the box's bottom row
  assert.deepEqual(bandCell('bottom', 3, 10, box), { col: 0, row: 1, wide: 5, tall: 2 });
  assert.deepEqual(bandCell('bottom', 4, 14, box), { col: 4, row: 0, wide: 5, tall: 2 });
  // on the sides u runs down the screen and the box is as tall as it is long
  assert.deepEqual(bandCell('left', 3, 10, box), { col: 0, row: 0, wide: 2, tall: 5 });
  assert.deepEqual(bandCell('left', 4, 14, box), { col: 1, row: 4, wide: 2, tall: 5 });
  assert.deepEqual(bandCell('right', 3, 10, box), { col: 1, row: 0, wide: 2, tall: 5 });
  assert.deepEqual(bandCell('right', 4, 14, box), { col: 0, row: 4, wide: 2, tall: 5 });
  for (const which of Object.keys(EDGES)) {
    for (const [d, u] of [[2, 12], [5, 12], [3, 9], [3, 15]]) assert.equal(bandCell(which, d, u, box), null, `${which}: ${d}, ${u} is outside the box`);
  }
  // a box may run on over the tile's end into the next tile
  assert.deepEqual(bandCell('top', 1, 1, [30, 1, 4, 1]), { col: 3, row: 0, wide: 4, tall: 1 });
  assert.throws(() => bandCell('north', 3, 10, box), /not an edge/);
});

test('bandStone: a stone on each of the four edges has its light row at the top and its dark row at the bottom', () => {
  for (const draw of [drawSoftBlock, drawBlock]) for (const [which, name] of Object.entries(EDGES)) {
    const where = `${draw.name}, ${which} edge`;
    const g = piece(draw, name, stony([[12, 3, 5, 4]]));          // 5 px along the edge, 4 px across it
    const { rows } = stoneRows(g);
    const flat = which === 'top' || which === 'bottom';
    assert.equal(rows.length, flat ? 4 : 5, `${where}: as tall on screen as it lies`);
    assert.equal(rows[0].length, flat ? 5 : 4, `${where}: as wide on screen as it lies`);
    assert.ok(/^\.L+\.$/.test(rows[0]), `${where}: the top row is light, with both corners rounded off (${rows[0]})`);
    assert.ok(/^D+$/.test(rows.at(-1)), `${where}: the bottom row is dark (${rows.at(-1)})`);
    for (const r of rows.slice(1, -1)) assert.ok(/^B+L$/.test(r), `${where}: between them the body, lit down its right side (${r})`);
  }
});

test('bandStone: the same stone looks the same on opposite edges, and a square one on all four', () => {
  const on = (which, stones) => stoneRows(piece(drawSoftBlock, EDGES[which], stony(stones))).rows.join('/');
  const long = [[12, 3, 5, 3]];
  assert.equal(on('top', long), on('bottom', long));
  assert.equal(on('left', long), on('right', long));
  assert.notEqual(on('top', long), on('left', long));           // lying along the edge: wide on top, tall on the side
  const square = [[12, 3, 4, 4]];
  for (const which of ['bottom', 'left', 'right']) assert.equal(on(which, square), on('top', square), `${which} edge`);
  assert.equal(on('top', square), '.LL./BBBL/BBBL/DDDD');
});

test('bandStone: it lies where its box says, small stones keep their corners, the first stone wins, none means null', () => {
  // depth 3 from the top outline is row 2; from the right outline it is column 29
  assert.deepEqual((({ x0, y0 }) => [x0, y0])(stoneRows(piece(drawSoftBlock, 'top', stony([[12, 3, 5, 3]])))), [12, 2]);
  assert.deepEqual((({ x0, y0 }) => [x0, y0])(stoneRows(piece(drawSoftBlock, 'side-r', stony([[12, 3, 5, 3]])))), [TILE - 5, 12]);
  assert.deepEqual(stoneRows(piece(drawSoftBlock, 'top', stony([[12, 3, 2, 2]]))).rows, ['LL', 'DD']);
  assert.equal(bandStone('top', 4, 13, [[12, 3, 5, 4], [12, 3, 5, 2]], TONES), TONES.base);
  assert.equal(bandStone('top', 4, 13, [[12, 3, 5, 2], [12, 3, 5, 4]], TONES), TONES.dark);
  // where the first stone's corner is rounded off, the one under it shows
  assert.equal(bandStone('top', 3, 12, [[12, 3, 5, 2], [10, 3, 5, 2]], TONES), TONES.light);
  assert.equal(bandStone('top', 3, 12, [[12, 3, 5, 2]], TONES), null);
  assert.equal(bandStone('left', 3, 13, [], TONES), null);
  assert.equal(bandStone('left', 3, 13, undefined, TONES), null);
  assert.equal(bandStone('left', 1, 13, [[12, 3, 5, 2]], TONES), null);
});
