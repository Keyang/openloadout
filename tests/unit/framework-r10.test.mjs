// Framework additions of batch R10 (tiles-shore, save-crystal):
//   engine/water.js     waterTones, rippleFill, lapPaint: a body of water's tones, its moving surface, the water
//                       lapping at a shore. shoreMap, drawShore: a pond, river or pool seen from above and in front,
//                       piece by piece. wakeRing, lilyPad, plankBridge: things on and over the water
//   engine/crystals.js  CRYSTAL_CUTS, crystalFaces, drawCrystal: big standing crystals that turn; drawAura: a glow
//                       that hugs whatever is drawn on another Surface
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, BLOCK_PIECES, NARROW_PIECES, blockJoins } from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { col, brightness, INK } from '../../engine/color.js';
import { lapPaint, shoreMap, drawShore, wakeRing, lilyPad, plankBridge } from '../../engine/water.js';
import { crystalFaces } from '../../engine/crystals.js';

const WATER = '#4fa8d8', DEEP = '#2c79c0', FOAM = '#f0ead8', SAND = '#ecda95', FACE = '#b9925f';
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const column = (g, x) => Array.from({ length: g.h }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y));

// ---- water ----------------------------------------------------------------------------------------------------

test('lapPaint: a line on the waterline, shallow water, a foam line that moves, deep water further in', () => {
  const lap = { foam: FOAM, shallow: WATER, reach: 2, rows: 2 };
  for (let u = 0; u < TILE; u++) {
    assert.equal(lapPaint(0, u, 0.2, lap), INK);
    assert.equal(lapPaint(9, u, 0.2, lap), null);
    assert.equal(lapPaint(0, u, 0.2, { ...lap, line: null, foam: null }), WATER, 'with no line, row 0 is water');
    for (const t of [0, 0.25, 0.6]) for (let k = 0; k < 6; k++) {
      assert.equal(lapPaint(k, u, t, lap), lapPaint(k, u + TILE, t + 1, lap), 'repeats along the shore and over the loop');
      assert.ok([INK, FOAM, WATER, null].includes(lapPaint(k, u, t, lap)));
    }
  }
  // the foam is somewhere along the shore on every frame, and not always in the same row
  const rowsOf = (t) => { const seen = new Set(); for (let u = 0; u < TILE; u++) for (let k = 1; k < 5; k++) if (lapPaint(k, u, t, lap) === FOAM) seen.add(`${u}:${k}`); return seen; };
  const a = rowsOf(0), b = rowsOf(0.5);
  assert.ok(a.size > 4 && b.size > 4);
  assert.ok([...a].some((k) => !b.has(k)), 'the foam moves');
  // no foam asked for: none drawn
  for (let u = 0; u < TILE; u++) for (let k = 0; k < 6; k++) assert.notEqual(lapPaint(k, u, 0.3, { ...lap, foam: null }), FOAM);
});

const zeroEnds = Array.from({ length: TILE }, (_, u) => Math.min(1, Math.max(0, (Math.min(u, TILE - 1 - u) - 1) / 2)));
const SHORE = { round: 11, cap: 2, face: 5, lip: [2, 1], thin: { h: zeroEnds, v: zeroEnds }, inset: { top: (u) => (u % 9 === 4 ? 2 : 0), left: (u) => (u % 7 === 3 ? 1 : 0) } };
const shorePiece = (name, t = 0) => drawShore(new Surface(TILE, TILE), name, SHORE, paints(t), t);

test('drawShore: an inner corner closes the end of the north bank with a line', () => {
  const m = shoreMap('inner-tl', SHORE), at = (x, y) => m.part[y * TILE + x];
  for (let y = 0; y < 7; y++) { assert.ok(at(0, y) === 1 || at(0, y) === 2, `the bank's last column, row ${y}`); assert.equal(at(1, y), 4, `the line that closes it, row ${y}`); }
  assert.equal(at(0, 7), 4);
  assert.ok(at(20, 20) === 6 && at(31, 0) >= 5);
  assert.equal(shoreMap('water-inner-tl', SHORE), m, 'a piece is worked out once per spec');
  assert.notEqual(shoreMap('inner-tl', { ...SHORE }), m);
  assert.throws(() => shoreMap('deco-a', SHORE), /not a block piece/);
});

test('wakeRing, lilyPad, plankBridge', () => {
  const ring = wakeRing(new Surface(32, 32), { x: 16, y: 16, rx: 8, ry: 4, t: 0, colour: FOAM, gaps: 0.3 });
  const b = ring.bounds();
  assert.ok(count(ring) > 8 && b.x0 >= 7 && b.x1 <= 24 && b.y0 >= 11 && b.y1 <= 20, JSON.stringify(b));
  assert.equal(ring.get(16, 16), 0, 'a ring, not a disc');
  const half = wakeRing(new Surface(32, 32), { x: 16, y: 16, rx: 8, ry: 4, colour: FOAM, gaps: 0, front: true });
  assert.ok(half.bounds().y0 >= 16);

  const g = new Surface(32, 32), pad = lilyPad(g, 16, 16, 7, 4, '#4f9d57', { flower: FOAM });
  assert.ok(pad(15.5, 16.5) && !pad(2, 2));
  assert.ok(count(g) > 60 && count(g) < 130);
  assert.ok(g.data.includes(col(FOAM)), 'the flower');
  const plain = new Surface(32, 32);
  lilyPad(plain, 16, 16, 7, 4, '#4f9d57');
  assert.ok(!plain.data.includes(col(FOAM)));

  const h = plankBridge(new Surface(32, 32), 'h', '#9a6a3e', { from: 4, to: 28 });
  const v = plankBridge(new Surface(32, 32), 'v', '#9a6a3e', { from: 4, to: 27 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    assert.equal(!!h.get(x, y), y >= 4 && y <= 28, `h: see-through beside the bridge at ${x},${y}`);
    assert.equal(!!v.get(x, y), x >= 4 && x <= 27, `v: see-through beside the bridge at ${x},${y}`);
  }
  // it repeats along its length: one board is like the next, and the tile joins itself
  assert.deepEqual(column(h, 3), column(h, 11));
  assert.deepEqual(row(v, 3), row(v, 27));
  assert.deepEqual(row(h, 4), new Array(32).fill(col(INK)));
  assert.deepEqual(column(v, 27), new Array(32).fill(col(INK)));
});

// ---- crystals -------------------------------------------------------------------------------------------------
