// Framework additions made with batch S16 (sci-fi upgrade and weapon icons).
//   engine/shapes.js: burstIn, arrowIn, crossIn, hexIn, hoopIn        shape tests signs are made of
//   engine/icons.js:
//     ICON_PLATES, iconPlate     a backing plate (hexagon or disc) behind an icon, and the room it leaves
//     iconBold                   a pen that draws every shape thicker
//     iconOver                   a second colour laid on the first, with an ink line only where they touch
//     ICON_RISE, iconRise        level pictures raised towards the right by sliding whole columns
//     iconBurst, iconShot, iconArrow, iconStreaks, iconHoop, iconWing, iconMagnet, iconCrosshair, iconHeart      flat sign pictures
//     iconPistol, iconShotgun, iconBeamGun, iconLauncher, iconBlades, iconMine                                      sci-fi weapons
// R3 (2026-11-21): engine/icons.js went (iconPlate, iconBold, iconOver, iconRise and the sign and weapon pictures) with its tests; the shape tests of engine/shapes.js stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { burstIn, arrowIn, crossIn, hexIn, hoopIn } from '../../engine/shapes.js';
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const colours = (g) => { const s = new Set(g.data); s.delete(0); return s; };
const count = (test, w = 40, h = 40) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) n++; return n; };
const filled = (test, w = 40, h = 40) => new Surface(w, h).fill(0, 0, w, h, test, '#ffffff');
const BODY = '#5fe0f0', ACCENT = '#f2a030', METAL = '#9aa6c0', GLOW = '#5fe0f0', MARK = '#f2a030';

// ---- shape tests ---------------------------------------------------------------------------

test('burstIn: long and short points alternate, the first long one pointing up', () => {
  const b = burstIn(20, 20, 12, 8);
  assert.ok(b(20, 8.6) && b(31.4, 20) && b(20, 31.4) && b(8.6, 20), 'the four long points reach the full radius');
  const d = 12 * Math.SQRT1_2;
  assert.ok(!b(20 + d - 0.6, 20 - d + 0.6), 'a short point stops short of the full radius');
  assert.ok(b(20 + d * 0.6, 20 - d * 0.6), 'but is there further in');
  assert.ok(b(20.5, 20.5), 'the middle is solid');
  const g = filled(b).bounds();
  assert.equal(g.x1 - g.x0, g.y1 - g.y0, 'as wide as it is tall');
  assert.ok(g.x1 - g.x0 >= 18 && g.x0 === 39 - g.x1 && g.y0 === 39 - g.y1, 'and centred');
  assert.ok(count(burstIn(20, 20, 12, 8, { inner: 0.6 })) > count(b), 'a bigger inner radius makes fatter points');
});

test('arrowIn: a shaft and a wider head ending at the tip', () => {
  const a = arrowIn(4, 20, 34, 20, { shaft: 4, head: 12, long: 8 });
  assert.ok(a(5.5, 20.5) && a(5.5, 18.5) && !a(5.5, 16.5), 'the shaft is 4 wide');
  assert.ok(a(26.5, 15.5) && a(26.5, 24.5) && !a(25.5, 15.5), 'the head starts 8 before the tip and is 12 wide');
  assert.ok(a(33.4, 20), 'it reaches the tip');
  assert.ok(!a(34.5, 20.5) && !a(3.5, 20.5), 'and ends there');
  const up = filled(arrowIn(20, 34, 20, 4, { shaft: 4, head: 12, long: 8 })).bounds();
  assert.deepEqual([up.x0, up.x1, up.y1], [14, 25, 33], 'the same arrow pointing up');
  assert.ok(up.y0 <= 5, 'to within a pixel of its tip');
  const barbed = arrowIn(4, 20, 34, 20, { shaft: 4, head: 12, long: 8, notch: 3 });
  assert.ok(a(27.5, 22.6) && !barbed(27.5, 22.6) && barbed(27.5, 24.5), 'a notch cuts the back of the head into barbs');
});

test('crossIn: a plus sign with arms of even width', () => {
  const g = filled(crossIn(20, 20, 12, 4));
  assert.deepEqual(g.bounds(), { x0: 14, y0: 14, x1: 25, y1: 25 });
  assert.equal(lit(g), 12 * 4 * 2 - 16);
  assert.ok(!g.get(14, 14) && g.get(14, 19) && g.get(19, 14));
});

test('hexIn: a hexagon on its point with clean two-along one-up edges', () => {
  const g = filled(hexIn(20, 20, 24, 26));
  assert.deepEqual(g.bounds(), { x0: 8, y0: 7, x1: 31, y1: 32 });
  const row = (y) => { let n = 0; for (let x = 0; x < 40; x++) if (g.get(x, y)) n++; return n; };
  assert.deepEqual([row(7), row(8), row(9), row(10)], [2, 6, 10, 14], 'each row is two pixels wider on both sides');
  assert.equal(row(13), 24); assert.equal(row(20), 24);
  for (let y = 7; y <= 32; y++) assert.equal(row(y), row(39 - y), `row ${y} mirrors`);
  for (let y = 7; y <= 32; y++) for (let x = 0; x < 20; x++) assert.equal(!!g.get(x, y), !!g.get(39 - x, y), 'left mirrors right');
});

test('hoopIn: a band of even width round an ellipse, open in the middle', () => {
  const h = hoopIn(20, 20, 10, 6, 3);
  assert.ok(h(10.5, 20.5) && h(12.5, 20.5) && !h(13.5, 20.5), 'three wide at the side');
  assert.ok(h(20.5, 14.5) && h(20.5, 16.5) && !h(20.5, 17.5), 'three wide at the top');
  assert.ok(!h(20.5, 20.5), 'the middle is open');
  assert.ok(count(hoopIn(20, 20, 10, 6, 20)) > count(h), 'a band thicker than the hoop fills it');
});

