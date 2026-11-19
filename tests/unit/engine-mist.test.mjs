// engine/mist.js: a bank of looping wisps spread along a band (ground fog, steam along a vent, dust along a road),
// joined into one cloud with one rim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { mistBank, MIST_SHAPES } from '../../engine/mist.js';

const C = ['#f0ead8', '#b8ccc8', '#7fb0b8'];
const bank = (t, o = {}) => { const g = new Surface(64, 64); mistBank(g, { t, x0: 6, x1: 58, y: 60, count: 5, dist: 10, rise: 3, size: 4, floor: 61, colours: C, ...o }); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];

test('mistBank closes its loop: t = 0 and t = 1 draw the same frame', () => {
  for (const shape of MIST_SHAPES) assert.deepEqual(bank(1, { shape }).data, bank(0, { shape }).data, shape);
});

test('mistBank draws something on every frame and changes between frames', () => {
  let last = null;
  for (const t of ts) {
    const g = bank(t);
    assert.ok(lit(g) > 60, `t=${t}: ${lit(g)} pixels`);
    if (last) assert.notDeepEqual(g.data, last.data);
    last = g;
  }
});

test('mistBank stays above the floor row, inside the 1 px border, and lies on the floor', () => {
  for (const shape of MIST_SHAPES) for (const t of ts) {
    const b = bank(t, { shape, size: 6, dist: 16, rise: 8 }).bounds();
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 62 && b.y1 <= 61, `${shape} t=${t}: ${JSON.stringify(b)}`);
  }
  assert.equal(bank(0).bounds().y1, 61);
});

test('mistBank spreads its wisps along the band, not from one point', () => {
  const b = bank(0.3, { dist: 1 }).bounds();
  assert.ok(b.x1 - b.x0 >= 40, JSON.stringify(b));
});

test('mistBank joins touching wisps into one cloud: the rim colour never sits between two body pixels in a row', () => {
  const g = bank(0.4, { count: 8, size: 5 }), rim = col(C[2]), body = new Set([col(C[0]), col(C[1])]);
  for (let y = 0; y < 64; y++) for (let x = 1; x < 63; x++) {
    if (g.data[y * 64 + x] !== rim) continue;
    const l = g.data[y * 64 + x - 1], r = g.data[y * 64 + x + 1], u = g.data[(y - 1) * 64 + x], d = g.data[(y + 1) * 64 + x];
    assert.ok(!(body.has(l) && body.has(r) && body.has(u) && body.has(d)), `rim pixel inside the cloud at ${x},${y}`);
  }
});

test('mistBank rejects an unknown shape', () => {
  assert.throws(() => bank(0, { shape: 'square' }), /shape/);
});

test('mistBank stretch draws round wisps wider and flatter', () => {
  const b1 = bank(0.3, { count: 1, x0: 20, x1: 44 }).bounds(), b2 = bank(0.3, { count: 1, x0: 20, x1: 44, stretch: 2 }).bounds();
  assert.ok(b2.x1 - b2.x0 > b1.x1 - b1.x0 && b2.y1 - b2.y0 < b1.y1 - b1.y0, JSON.stringify([b1, b2]));
});
