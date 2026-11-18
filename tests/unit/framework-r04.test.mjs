// Framework additions of batch R04 (tiles-meadow, tree-oak, tree-pine):
//   engine/tiles.js    drawSoftBlock: a block of soft ground (a path, sand, the bank of a pond) with true arcs at its
//                      corners and an outline that wanders further in than drawBlock allows
//                      bandCell, bandStone: a mark in an edge band (a half-buried stone) that stays upright and lit
//                      from the top right on all four edges
//   engine/foliage.js  tree parts: a crown of leaf masses, tufts round its outside, leaf marks, a trunk with root
//                      flares, a fir tier, falling leaves
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, BLOCK_PIECES, NARROW_PIECES, blockJoins, drawBlock, drawSoftBlock, edgeWave, bandCell, bandStone } from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { CROWN_SHAPES, crownLobes, crownTufts, crownIn, leafMarks, trunkIn, tierIn, leafFall } from '../../engine/foliage.js';

const SAND = '#ecda95', RIM = '#a05c37', SHADE = '#c9a06a', BANK = '#7fbf5a';
const piece = (draw, name, material, t = 0) => { const g = new Surface(TILE, TILE); draw(g, name, material, t); return g; };
const column = (g, x) => Array.from({ length: TILE }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: TILE }, (_, x) => g.get(x, y));
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);

// a top-down path: no ink, a dark line on the outline, a strip of shade under the top and right edges, a deep wander
const dips = (seed, px) => (u) => Math.round(edgeWave(u, seed, [1, 3]) * px);
const soft = (over = {}) => ({
  ink: null, round: 8,
  fill: (x, y, t, v) => (v ? '#d9bc7e' : SAND),
  top: { depth: 3, inset: dips(3, 6), paint: (d) => (d === 1 ? RIM : SHADE) },
  right: { depth: 3, inset: dips(5, 5), paint: (d) => (d === 1 ? RIM : SHADE) },
  bottom: { depth: 1, inset: dips(7, 4), paint: () => RIM },
  left: { depth: 1, inset: dips(9, 8), paint: () => RIM },
  ...over,
});

test('drawSoftBlock: every pair of pieces that can touch joins exactly, narrow pieces included', () => {
  for (const material of [soft(), soft({ ink: INK }), soft({ round: 14 }), soft({ round: 0 })]) {
    const made = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES].map((p) => [p, piece(drawSoftBlock, p, material)]));
    for (const [a, axis, b] of blockJoins({ narrow: true })) {
      const A = axis === 'x' ? column(made[a], TILE - 1) : row(made[a], TILE - 1);
      const B = axis === 'x' ? column(made[b], 0) : row(made[b], 0);
      for (let i = 0; i < TILE; i++) assert.equal(!!A[i], !!B[i], `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}: the outlines meet at ${i}`);
    }
  }
});

test('drawSoftBlock: the fill is opaque, and a fill version is passed on to the material', () => {
  const m = soft();
  const fill = piece(drawSoftBlock, 'fill', m), other = piece(drawSoftBlock, 'path-fill-b', m);
  assert.equal(count(fill), TILE * TILE);
  assert.ok(fill.data.every((v) => v === col(SAND)));
  assert.ok(other.data.every((v) => v === col('#d9bc7e')));
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

test('drawSoftBlock: with no ink the band starts on the outline; with ink the outline is inked and the band lies inside it', () => {
  const bare = piece(drawSoftBlock, 'top', soft({ round: 0, top: { depth: 2, paint: (d) => (d === 1 ? RIM : SHADE) } }));
  assert.equal(bare.get(16, 0), col(RIM));
  assert.equal(bare.get(16, 1), col(SHADE));
  assert.equal(bare.get(16, 2), col(SAND));
  const inked = piece(drawSoftBlock, 'top', soft({ ink: INK, round: 0, top: { depth: 2, paint: (d) => (d === 1 ? RIM : SHADE) } }));
  assert.equal(inked.get(16, 0), col(INK));
  assert.equal(inked.get(16, 1), col(RIM));
  assert.equal(inked.get(16, 2), col(SHADE));
  // an inner corner carries its two neighbours' bands round the turn
  const corner = piece(drawSoftBlock, 'inner-tl', soft({ round: 0 }));
  assert.equal(count(corner), TILE * TILE);
  assert.equal(corner.get(0, 0), col(RIM));
  assert.equal(corner.get(10, 10), col(SAND));
});

test('drawSoftBlock: with square corners and a small wander it draws what drawBlock draws (inner corners apart)', () => {
  const shallow = (seed) => (u) => Math.round(edgeWave(u, seed, [1, 3]) * 3);
  for (const ink of [null, INK, RIM]) {
    const m = soft({ ink, round: 0, top: { depth: 3, inset: shallow(3), paint: (d) => (d === 1 ? RIM : SHADE) }, right: { depth: 3, inset: shallow(5), paint: (d) => (d === 1 ? RIM : SHADE) }, bottom: { depth: 1, inset: shallow(7), paint: () => RIM }, left: { depth: 1, inset: shallow(9), paint: () => RIM } });
    for (const p of [...BLOCK_PIECES, ...NARROW_PIECES].filter((n) => !n.startsWith('inner'))) {
      assert.deepEqual([...piece(drawSoftBlock, p, m).data], [...piece(drawBlock, p, m).data], `${p}, ink ${ink}`);
    }
  }
});

test('drawSoftBlock: outside() paints what is beyond the outline, t reaches the material, and a bad name throws', () => {
  const seen = new Set();
  const m = soft({ outside: (x, y, t) => { seen.add(t); return BANK; }, fill: (x, y, t) => { seen.add(t); return SAND; } });
  const g = piece(drawSoftBlock, 'left', m, 0.25);
  assert.equal(count(g), TILE * TILE);
  assert.equal(g.get(0, 0), col(BANK));
  assert.deepEqual([...seen], [0.25]);
  assert.throws(() => drawSoftBlock(new Surface(TILE, TILE), 'grass-thin-m', soft()), /not a block piece/);
  // outside() is told how far beyond the outline a pixel is, so a bank can follow the curve and stop
  const pond = piece(drawSoftBlock, 'left', { ink: INK, round: 10, fill: () => '#4fa8d8', outside: (x, y, t, out) => (out <= 3 ? BANK : null) });
  assert.equal(pond.get(0, 0), 0, 'the far corner of the tile is beyond the bank');
  let bank = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (pond.get(x, y) === col(BANK)) { bank++; assert.ok(x < 13 && y < 13, 'the bank lies round the arc'); }
  assert.ok(bank >= 20, `${bank} px of bank`);
});

// ---- engine/foliage.js -----------------------------------------------------------------------------------

test('crownLobes: one leaf mass per lobe, inside the box asked for, the same every time, moved by sway', () => {
  assert.deepEqual([...CROWN_SHAPES], ['round', 'wide', 'layered']);
  for (const shape of CROWN_SHAPES) {
    const a = crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape }), b = crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape });
    assert.deepEqual(a, b);
    assert.ok(a.length >= 3 && a.length <= 8, `${shape}: ${a.length} lobes`);
    const x0 = Math.min(...a.map((l) => l.x - l.rx)), x1 = Math.max(...a.map((l) => l.x + l.rx));
    const y0 = Math.min(...a.map((l) => l.y - l.ry)), y1 = Math.max(...a.map((l) => l.y + l.ry));
    assert.ok(x0 >= 32 - 26 - 0.01 && x1 <= 32 + 26 + 0.01 && y0 >= 30 - 20 - 0.01 && y1 <= 30 + 20 + 0.01, `${shape}: inside its box`);
    assert.ok(x1 - x0 >= 52 * 0.85 && y1 - y0 >= 40 * 0.85, `${shape}: fills its box`);
    const moved = crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape, sway: 2, t: 0.25 });
    assert.ok(moved.some((l, i) => Math.round(l.x) !== Math.round(a[i].x)), `${shape}: sway moves a lobe a whole pixel`);
    const offsets = new Set(moved.map((l, i) => Math.round((l.x - a[i].x) * 10)));
    assert.ok(offsets.size > 1, `${shape}: the lobes move out of step`);
  }
  assert.notDeepEqual(crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape: 'round' }), crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape: 'wide' }));
});

test('crownIn: one shape test for the whole crown, true in a lobe and false outside all of them', () => {
  const lobes = crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape: 'round' });
  const inside = crownIn(lobes);
  for (const l of lobes) assert.ok(inside(l.x, l.y));
  assert.ok(!inside(1, 1) && !inside(63, 79));
  // growing the crown by 2 px takes in a point just above its topmost mass
  const top = lobes.reduce((a, b) => (a.y - a.ry < b.y - b.ry ? a : b));
  assert.ok(crownIn(lobes, 2)(top.x, top.y - top.ry - 1.5) && !inside(top.x, top.y - top.ry - 1.5));
});

test('crownTufts: small masses on the outside of the crown only, the same every time, riding on their mass', () => {
  const lobes = crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape: 'round' });
  const tufts = crownTufts(lobes, { size: 4 });
  assert.deepEqual(tufts, crownTufts(lobes, { size: 4 }));
  assert.ok(tufts.length >= 8, `${tufts.length} tufts`);
  const plain = new Surface(64, 80).fill(0, 0, 64, 80, crownIn(lobes), '#4f9d57');
  const tufted = new Surface(64, 80).fill(0, 0, 64, 80, crownIn([...tufts, ...lobes]), '#4f9d57');
  const more = count(tufted) - count(plain);
  assert.ok(more >= 30 && more <= count(plain) * 0.25, `the tufts add ${more} px to the outline`);
  for (const t of tufts) assert.ok(t.rx >= 2.5 && t.rx <= 5.5, 'small');
  // with sway the tufts move with the masses: the crown keeps its tufted outline
  const moved = crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape: 'round', sway: 2, t: 0.25 });
  assert.equal(crownTufts(moved, { size: 4 }).length > 0, true);
});

test('leafMarks: lit clumps towards the top right of each mass and dark creases between masses, all inside the crown', () => {
  const lobes = crownLobes({ cx: 32, cy: 30, w: 52, h: 40, shape: 'round' });
  const g = new Surface(64, 80), body = '#4f9d57', light = '#90ce87', dark = '#287e43';
  g.fill(0, 0, 64, 80, crownIn(lobes), body);
  const before = count(g);
  leafMarks(g, lobes, { light, dark });
  assert.equal(count(g), before, 'no mark outside the crown');
  const inside = crownIn(lobes);
  let lit = 0, shaded = 0, litUp = 0;
  for (let y = 0; y < 80; y++) for (let x = 0; x < 64; x++) {
    if (g.get(x, y) === col(light)) { lit++; const l = lobes.findLast((m) => ((x + 0.5 - m.x) / m.rx) ** 2 + ((y + 0.5 - m.y) / m.ry) ** 2 <= 1); if (x - y > l.x - l.y) litUp++; }
    if (g.get(x, y) === col(dark)) { shaded++; assert.ok(inside(x + 2.5, y - 1.5), `a crease at ${x},${y} has more crown beyond it: the crown's own outline stays in the light`); }
  }
  assert.ok(lit >= 12 && shaded >= 12, `${lit} light and ${shaded} dark pixels`);
  assert.ok(litUp > lit * 0.7, 'most lit pixels lie up and to the right of the middle of their mass: the light comes from the top right');
  const again = new Surface(64, 80);
  again.fill(0, 0, 64, 80, crownIn(lobes), body);
  leafMarks(again, lobes, { light, dark });
  assert.deepEqual([...again.data], [...g.data]);
  const sparse = new Surface(64, 80);
  sparse.fill(0, 0, 64, 80, crownIn(lobes), body);
  leafMarks(sparse, lobes, { light, dark, amount: 0.2 });
  assert.ok(sparse.data.filter((v) => v === col(light)).length < lit);
});

test('trunkIn: as wide as asked at the top, flaring into roots at the foot, standing on its base row', () => {
  const inside = trunkIn(32, 76, 8, 20, { flare: 4 });
  const width = (y) => { let n = 0; for (let x = 0; x < 64; x++) if (inside(x + 0.5, y + 0.5)) n++; return n; };
  assert.equal(width(58), 8);
  assert.ok(width(75) >= 8 + 6, `the foot is ${width(75)} px wide`);
  assert.equal(width(76), 0);
  assert.equal(width(55), 0);
  for (let y = 57; y < 75; y++) assert.ok(width(y + 1) >= width(y), 'never narrower further down');
});

test('tierIn: a fir tier with a point at the top and a jagged lower edge, the same every time', () => {
  const inside = tierIn(24, 20, 44, 16, { teeth: 5, seed: 3 });
  const g = new Surface(48, 80).fill(0, 0, 48, 80, inside, '#357a4c');
  const b = g.bounds();
  assert.ok(b.y0 <= 21 && b.y1 >= 42 && b.y1 <= 44, `rows ${b.y0} to ${b.y1}`);
  assert.ok(b.x1 - b.x0 >= 28 && b.x1 - b.x0 <= 32, `spans ${b.x1 - b.x0 + 1} px`);
  const widthAt = (y) => row48(g, y).filter(Boolean).length;
  assert.ok(widthAt(22) <= 6 && widthAt(36) >= 20, 'narrow at the top, wide lower down');
  // jagged: along the lower edge the lowest drawn row dips into a tooth and comes back, once per tooth
  const low = Array.from({ length: 48 }, (_, x) => { for (let y = 79; y >= 0; y--) if (g.get(x, y)) return y; return -1; }).filter((y) => y >= 0);
  let teeth = 0;
  for (let i = 1; i < low.length - 1; i++) { let j = i; while (j < low.length - 1 && low[j + 1] === low[i]) j++; if (low[i] > low[i - 1] && j < low.length - 1 && low[i] > low[j + 1]) teeth++; i = j; }
  assert.ok(teeth >= 4, `${teeth} teeth along the lower edge`);
  const again = new Surface(48, 80).fill(0, 0, 48, 80, tierIn(24, 20, 44, 16, { teeth: 5, seed: 3 }), '#357a4c');
  assert.deepEqual([...again.data], [...g.data]);
});
const row48 = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y));

test('leafFall: leaves leave the crown one after another, fall inside the box, and the last frame keeps some', () => {
  const box = [1, 1, 62, 78];
  const at = (t) => { const g = new Surface(64, 80); leafFall(g, { t, count: 4, x: 32, y: 30, spread: 20, floor: 75, colours: ['#90ce87', '#4f9d57'], box }); return g; };
  assert.equal(count(at(0)), 0, 'nothing has left the crown yet');
  for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
    const g = at(t), b = g.bounds();
    assert.ok(b, `t ${t}: leaves in the air`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 62 && b.y1 <= 78, `t ${t}: inside the box`);
  }
  const mid = at(0.5).bounds(), end = at(1);
  assert.ok(end.bounds().y1 > mid.y1, 'they fall');
  assert.ok(count(end) >= 8, 'the last frame keeps the leaves on the ground');
  assert.ok(end.bounds().y1 <= 75);
  assert.deepEqual([...at(0.6).data], [...at(0.6).data]);
});

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
