import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import {
  crystalFern, crystalShards, crystalIcicles, crystalGlint, crystalFernRoots, crystalCornerIn,
  crystalOnPiece, crystalOnColours, crystalCornerFern, crystalRecolour,
} from '../../engine/ui-crystal-frost.js';

const STEM = '#b1f7ff', TIP = '#c9423a', DARK = '#6aa1d0', WHITE = '#ffffff', FACE = '#3f5068', BAND = '#8fd0f0';
const count = (g, c) => g.data.filter((v) => v === col(c)).length;
const keys = (pts) => new Set(pts.map(([x, y]) => `${x},${y}`));

// a 20x20 box: ink outline, a 2 px band, a face, its corners cut by one pixel
const box = () => {
  const g = new Surface(20, 20);
  g.rect(0, 0, 20, 20, INK); g.rect(1, 1, 18, 18, BAND); g.rect(3, 3, 14, 14, FACE);
  for (const [x, y] of [[0, 0], [19, 0], [0, 19], [19, 19]]) g.data[y * 20 + x] = 0;
  return g;
};

test('crystalFern: a 4 px stem, its tip, and two branches each side (9 px)', () => {
  const g = new Surface(16, 16);
  const pts = crystalFern(g, 2, 2, 1, 1, { stem: STEM, tip: TIP });
  assert.equal(pts.length, 9);
  assert.equal(count(g, STEM), 8);
  assert.equal(count(g, TIP), 1);
  assert.equal(g.get(6, 6), col(TIP));
  for (let i = 0; i < 4; i++) assert.equal(g.get(2 + i, 2 + i), col(STEM));
  for (const [x, y] of [[4, 2], [2, 4], [5, 3], [3, 5]]) assert.equal(g.get(x, y), col(STEM), `branch ${x},${y}`);
});

test('crystalFern: alternate puts one branch per stem pixel on alternate sides (no X)', () => {
  const g = new Surface(16, 16);
  const pts = crystalFern(g, 10, 10, -1, -1, { stem: STEM, tip: TIP, len: 3, branches: 2, alternate: true });
  assert.equal(pts.length, 6);
  assert.deepEqual(keys(pts), keys([[10, 10], [9, 9], [8, 8], [7, 7], [8, 10], [9, 7]]));
});

test('crystalFern: can limits where it paints', () => {
  const g = new Surface(16, 16);
  const pts = crystalFern(g, 2, 2, 1, 1, { stem: STEM, tip: TIP, can: (x) => x < 5 });
  assert.ok(pts.every(([x]) => x < 5));
  assert.equal(count(g, TIP), 0);
});

test('crystalShards: separate shards of the given heights, each pointed with its tip on top', () => {
  const g = new Surface(16, 16);
  crystalShards(g, 1, 12, 1, [5, 3], { light: STEM, dark: DARK, tip: WHITE });
  // shard 1: columns 1 (dark, 4 px) and 2 (lit, tip on row 8); a gap at column 3; shard 2: columns 4 and 5
  assert.equal(g.get(2, 8), col(WHITE));
  assert.equal(g.get(1, 8), 0);
  for (let y = 0; y < 16; y++) assert.equal(g.get(3, y), 0, `gap row ${y}`);
  assert.equal(g.get(5, 10), col(WHITE));
  assert.equal(g.get(5, 9), 0);
  const right = new Surface(16, 16);
  crystalShards(right, 14, 12, -1, [5, 3], { light: STEM, dark: DARK, tip: WHITE, gap: [2] });
  assert.equal(right.get(13, 8), col(WHITE));
  assert.equal(right.get(9, 10), col(WHITE));
});

test('crystalIcicles: 1 px spikes a column apart, never joined across their tops', () => {
  const g = new Surface(16, 16);
  const pts = crystalIcicles(g, 3, 4, 1, [2, 3, 1], { light: STEM, tip: WHITE });
  assert.equal(pts.length, 6);
  for (const x of [4, 6]) assert.equal(g.get(x, 4), 0);
  assert.equal(g.get(3, 5), col(WHITE));
  assert.equal(g.get(5, 6), col(WHITE));
  assert.equal(g.get(7, 4), col(WHITE));
});

test('crystalGlint: a 5 px plus and a 3 px sparkle; an unknown kind throws', () => {
  const g = new Surface(16, 16);
  assert.equal(crystalGlint(g, 4, 4, 'plus', { color: WHITE }).length, 5);
  assert.equal(crystalGlint(g, 10, 10, 'sparkle', { color: TIP, sx: 1, sy: -1 }).length, 3);
  assert.equal(g.get(11, 9), col(TIP));
  assert.equal(g.get(9, 11), col(TIP));
  assert.throws(() => crystalGlint(g, 1, 1, 'star', { color: WHITE }));
});

test('crystalCornerIn and crystalCornerFern find the face on each corner diagonal', () => {
  const g = box(), b = { x: 0, y: 0, w: 20, h: 20 };
  for (let c = 0; c < 4; c++) assert.equal(crystalCornerIn(g, b, c, FACE), 3);
  assert.equal(crystalCornerIn(g, b, 0, '#123456'), -1);
  const pts = crystalCornerFern(g, b, 2, FACE, { stem: STEM, tip: TIP, len: 3, branches: 2, alternate: true, can: crystalOnColours(g, [FACE, BAND]) });
  assert.equal(pts.length, 6);
  assert.equal(g.get(17, 17), col(STEM));   // the root, on the band's inner pixel
  assert.equal(g.get(14, 14), col(TIP));
});

test('crystalFernRoots grows a fern back onto the band, once, and leaves ink alone', () => {
  const g = box(), b = { x: 0, y: 0, w: 20, h: 20 };
  crystalFern(g, 3, 3, 1, 1, { stem: STEM, tip: TIP, len: 3, branches: 2 });
  const pts = crystalFernRoots(g, b, { inside: FACE, stem: STEM, tip: TIP });
  assert.deepEqual(pts, [[2, 2]]);
  assert.equal(g.get(2, 2), col(STEM));
  assert.deepEqual(crystalFernRoots(g, b, { inside: FACE, stem: STEM, tip: TIP }), []);
  assert.equal(g.get(1, 1), col(BAND));
});

test('crystalOnPiece and crystalOnColours', () => {
  const g = box();
  const on = crystalOnPiece(g), notTop = crystalOnPiece(g, (x, y) => y > 0);
  assert.equal(on(0, 0), false); assert.equal(on(1, 1), true); assert.equal(on(-1, 3), false);
  assert.equal(notTop(5, 0), false); assert.equal(notTop(5, 1), true);
  const face = crystalOnColours(g, [FACE]);
  assert.equal(face(5, 5), true); assert.equal(face(1, 1), false);
});

test('crystalRecolour repaints only the run of one colour', () => {
  const g = box();
  const pts = crystalRecolour(g, 0, 19, 10, FACE, TIP);
  assert.equal(pts.length, 14);
  assert.equal(g.get(2, 10), col(BAND));
  assert.equal(g.get(3, 10), col(TIP));
  assert.equal(crystalRecolour(g, 0, 19, 40, FACE, TIP).length, 0);
});

test('same arguments, same pixels', () => {
  const a = box(), b = box();
  for (const g of [a, b]) { crystalFern(g, 3, 3, 1, 1, { stem: STEM, tip: TIP }); crystalShards(g, 3, 16, 1, [6, 4, 3], { light: STEM, dark: DARK, tip: WHITE, gap: [1, 0] }); }
  assert.deepEqual([...a.data], [...b.data]);
});
