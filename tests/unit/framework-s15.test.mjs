// Framework additions made with batch S15 (station pickups: credit chip, health cell, shield cell, XP shard, keycard):
//   engine/gadgets.js  flatHexIn, chevronIn        a hexagon lying on a flat side; a V-shaped band
//                      rimRunIn                    a short run of a shape's edge, for a light that travels round it
//                      leanedIn                    shape tests leaned by sliding whole rows, so edges stay hard
//                      drawToken                   a flat badge turned about its upright axis: edge, rimmed face, sunken field
//                      drawCircuit                 the mark of a circuit: a chip outline with pins and a bright node, drawn through a placing function
//                      CELL_SHAPES, cellIn         three containers of charge: a power cell, a syringe, a med pack
//                      drawCharge                  the glowing fill of a window, to a level, brighter on a beat
//                      haloIn                      the pixels just outside a thing's outline, beside its lit part
//                      meridianIn                  a band from pole to pole over a ball that turns about its upright axis
//                      crystalIn, cubeIn           a crystal standing on a point; a cube seen from a corner, as three faces
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn, ellipseIn } from '../../engine/surface.js';
import { col, ramp } from '../../engine/color.js';
import { hexIn, boundsOf } from '../../engine/shapes.js';
import { flatHexIn, chevronIn, rimRunIn, leanedIn, drawToken, drawCircuit, CELL_SHAPES, cellIn, drawCharge, haloIn, meridianIn, crystalIn, cubeIn } from '../../engine/gadgets.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const area = (test, w = 32, h = w) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) n++; return n; };
const GOLD = '#f2c230', HEAL = '#5fd47a';

// ---- shapes ------------------------------------------------------------------------

test('flatHexIn: flat top and bottom, points left and right, the same both ways round', () => {
  const hex = flatHexIn(16, 16, 20, 18);
  assert.deepEqual(boundsOf(hex, 32), { x0: 6, y0: 7, x1: 25, y1: 24 }, 'fills its box exactly');
  const row = (y) => { let n = 0; for (let x = 0; x < 32; x++) if (hex(x + 0.5, y + 0.5)) n++; return n; };
  assert.equal(row(15), 20, 'full width through the middle');
  assert.equal(row(16), 20);
  assert.ok(row(7) >= 10 && row(7) < 16, 'a flat top that is narrower than the middle');
  assert.equal(row(7), row(24), 'top and bottom match');
  for (let y = 7; y < 16; y++) assert.ok(row(y + 1) - row(y) <= 2 && row(y + 1) >= row(y), 'it widens by at most one pixel a side per row');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) assert.equal(hex(x + 0.5, y + 0.5), hex(31 - x + 0.5, y + 0.5), 'mirror image left to right');
  // it is hexIn lying on its side
  const up = hexIn(16, 16, 18, 20);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) assert.equal(hex(x + 0.5, y + 0.5), up(y + 0.5, x + 0.5));
});

test('chevronIn: a V of even thickness that points down, or up', () => {
  const v = chevronIn(16, 16, 12, 8, 3);
  assert.deepEqual(boundsOf(v, 32), { x0: 10, y0: 12, x1: 21, y1: 19 });
  for (let x = 10; x < 22; x++) { let n = 0; for (let y = 0; y < 32; y++) if (v(x + 0.5, y + 0.5)) n++; assert.equal(n, 3, `column ${x} is 3 px thick`); }
  assert.equal(v(15.5, 19.5), true, 'the point is at the bottom, in the middle');
  assert.equal(v(15.5, 12.5), false, 'and the middle of the top is open');
  assert.equal(v(10.5, 12.5), true, 'the arms start at the top corners');
  const up = chevronIn(16, 16, 12, 8, 3, { up: true });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) assert.equal(up(x + 0.5, y + 0.5), v(x + 0.5, 32 - (y + 0.5)), 'pointing up is the mirror image');
});

test('rimRunIn: a short piece of the edge, which moves round with the phase', () => {
  const disc = ellipseIn(16, 16, 9, 9);
  const top = rimRunIn(disc, 16, 16, 0, 0.2), right = rimRunIn(disc, 16, 16, 0.25, 0.2);
  assert.ok(area(top) >= 4 && area(top) <= 16, `a short run (${area(top)} px)`);
  const bt = boundsOf(top, 32), br = boundsOf(right, 32);
  assert.ok(bt.y1 < 12, 'phase 0 is at the top');
  assert.ok(br.x0 > 20, 'a quarter on, it is at the right: it runs clockwise');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (top(x + 0.5, y + 0.5)) {
    assert.ok(disc(x + 0.5, y + 0.5), 'inside the shape');
    assert.ok(!(disc(x - 0.5, y + 0.5) && disc(x + 1.5, y + 0.5) && disc(x + 0.5, y - 0.5) && disc(x + 0.5, y + 1.5)), 'and on its edge');
  }
  // all the way round covers the whole edge once; a thicker run is the edge two pixels deep
  let whole = 0; for (let i = 0; i < 8; i++) whole += area(rimRunIn(disc, 16, 16, i / 8, 0.125));
  assert.ok(Math.abs(whole - area(rimRunIn(disc, 16, 16, 0, 1))) <= 8, 'eight eighths make the ring');
  assert.ok(area(rimRunIn(disc, 16, 16, 0, 0.2, 2)) > area(top));
  assert.equal(area(rimRunIn(disc, 16, 16, 1.25, 0.2)), area(right), 'the phase wraps');
});

test('leanedIn: rows slide whole pixels, keep their width, and the base row stays put', () => {
  const card = rectIn(10, 7, 12, 18), slot = rectIn(14, 9, 4, 1);
  const leaned = leanedIn(card, 16, 0.5), mark = leanedIn(slot, 16, 0.5);
  const row = (f, y) => { const xs = []; for (let x = 0; x < 32; x++) if (f(x + 0.5, y + 0.5)) xs.push(x); return xs; };
  for (let y = 7; y < 25; y++) assert.equal(row(leaned, y).length, 12, `row ${y} keeps its width`);
  assert.equal(row(leaned, 16)[0], 10, 'the row under the base line has not moved');
  assert.equal(row(leaned, 15)[0], 10, 'nor the one over it');
  assert.equal(row(leaned, 7)[0] - row(leaned, 24)[0], 8, 'the top leans right of the foot by slope times height, less a row');
  for (let y = 7; y < 24; y++) { const d = row(leaned, y)[0] - row(leaned, y + 1)[0]; assert.ok(d === 0 || d === 1, 'steps of one pixel'); }
  assert.equal(row(mark, 9).length, 4, 'a one-pixel line survives whole');
  assert.equal(row(mark, 9)[0] - 14, row(leaned, 9)[0] - 10, 'and moves with the rest');
  assert.equal(area(leanedIn([card, slot], 16, 0)), area(card), 'no slope: as it was');
  assert.equal(row(leanedIn(card, 16, -0.5), 7)[0], 20 - row(leaned, 7)[0], 'a negative slope is the mirror image');
});

// ---- the turned badge ----------------------------------------------------------------

test('drawToken: face-on it is the badge with a rim and a sunken field; turned it narrows and shows its edge', () => {
  const hex = hexIn(0, 0, 14, 16), M = ramp(GOLD);
  const a = new Surface(32, 32), A = drawToken(a, hex, 16, 16, GOLD, { turn: 0, thick: 3 });
  assert.deepEqual(a.bounds(), { x0: 9, y0: 8, x1: 22, y1: 23 }, 'face-on: exactly the badge');
  assert.equal(A.squeeze, 1);
  assert.ok(area(A.field) > 60 && area(A.field) < area(A.face), 'a field inside the rim');
  assert.ok(count(a, M.base) > 0 && count(a, M.light) > 0, 'the rim is lit');
  const b = new Surface(32, 32), B = drawToken(b, hex, 16, 16, GOLD, { turn: Math.PI / 4, thick: 3 });
  const wb = b.bounds();
  assert.ok(wb.x1 - wb.x0 + 1 < 14 && wb.x1 - wb.x0 + 1 >= 10, 'an eighth of a turn: narrower');
  assert.equal(wb.y1 - wb.y0, 15, 'and as tall');
  assert.ok(area(B.body) > area(B.face), 'the edge shows beside the face');
  const c = new Surface(32, 32); drawToken(c, hex, 16, 16, GOLD, { turn: Math.PI / 2, thick: 4 });       // an even badge on a whole-number centre: an even thickness is exact
  const wc = c.bounds();
  assert.equal(wc.x1 - wc.x0 + 1, 4, 'edge-on: a bar as wide as the badge is thick');
  assert.equal(wc.y1 - wc.y0 + 1, 16, 'and as tall as the badge');
  // rim 0: no field
  const d = new Surface(32, 32), D = drawToken(d, hex, 16, 16, GOLD, { rim: 0 });
  assert.equal(D.field, null);
  // `on` and `at` follow the face as it turns
  assert.deepEqual(A.at(0, 0), [16, 16]);
  assert.ok(B.at(4, 0)[0] - B.at(0, 0)[0] < 4 && B.at(4, 0)[0] > B.at(0, 0)[0], 'a point on the face moves in as it turns');
  assert.ok(area(B.on(rectIn(-3, -3, 6, 6))) < area(A.on(rectIn(-3, -3, 6, 6))), 'a mark on the face is squeezed with it');
  // squashed by sx, sy
  const e = new Surface(32, 32); drawToken(e, hex, 16, 16, GOLD, { sx: 1.2, sy: 0.8 });
  const we = e.bounds();
  assert.ok(we.x1 - we.x0 + 1 > 14 && we.y1 - we.y0 + 1 < 16);
});

test('drawCircuit: a chip outline with pins and a bright node, through a placing function, the same every time', () => {
  const a = new Surface(32, 32), b = new Surface(32, 32), c = new Surface(32, 32);
  drawCircuit(a, (u, v) => [16 + u, 16 + v], '#5fe0f0', { rx: 5, ry: 5 });
  drawCircuit(b, (u, v) => [16 + u, 16 + v], '#5fe0f0', { rx: 5, ry: 5 });
  assert.deepEqual([...a.data], [...b.data], 'repeatable');
  assert.deepEqual(a.bounds(), { x0: 11, y0: 11, x1: 20, y1: 20 }, 'exactly 2 * rx by 2 * ry, centred on the pixel corner');
  assert.ok(lit(a) >= 24 && lit(a) <= 45, `thin lines, not a block (${lit(a)} px)`);
  assert.equal(count(a, '#ffffff'), 4, 'a 2 x 2 node');
  assert.ok(a.get(15, 15) && a.get(16, 16), 'in the middle');
  assert.equal(a.get(14, 14), 0, 'the chip is an outline: open inside');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    assert.equal(!!a.get(x, y), !!a.get(31 - x, y), 'mirror image left to right');
    assert.equal(!!a.get(x, y), !!a.get(x, 31 - y), 'and top to bottom');
  }
  drawCircuit(c, (u, v) => [16 + u * 0.6, 16 + v], '#5fe0f0', { rx: 5, ry: 5 });
  const narrow = c.bounds();
  assert.ok(narrow.x1 - narrow.x0 < 9, 'it follows the placing function');
  assert.equal(narrow.y1 - narrow.y0, 9);
  // no pixel hangs by a corner alone
  for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) if (a.get(x, y)) {
    assert.ok(a.get(x - 1, y) || a.get(x + 1, y) || a.get(x, y - 1) || a.get(x, y + 1), `pixel ${x},${y} touches another`);
  }
  // a tall narrow one keeps its pins
  const d = new Surface(32, 32); drawCircuit(d, (u, v) => [16 + u, 16 + v], '#5fe0f0', { rx: 3, ry: 6 });
  assert.deepEqual(d.bounds(), { x0: 13, y0: 10, x1: 18, y1: 21 });
});

// ---- containers of charge ---------------------------------------------------------------

test('cellIn: every shape has a case, a window inside it and a way to fill', () => {
  assert.deepEqual([...CELL_SHAPES], ['cell', 'syringe', 'pack']);
  for (const shape of CELL_SHAPES) for (const h of [16, 20, 22]) {
    const C = cellIn(h, shape), put = (f) => (px, py) => f(px - 16, py - 16);
    const whole = boundsOf([put(C.casing), put(C.window), put(C.seams)], 32);
    assert.equal(whole.y1 - whole.y0 + 1, h, `${shape} ${h}: as tall as asked`);
    assert.ok(Math.abs((whole.x0 + whole.x1 + 1) / 2 - 16) <= 0.5, `${shape} ${h}: centred`);
    assert.equal(whole.x1 - whole.x0 + 1, 2 * C.half, `${shape} ${h}: half is half its width`);
    assert.ok(area(put(C.window)) >= 12, `${shape} ${h}: a window worth looking at (${area(put(C.window))} px)`);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const px = x + 0.5 - 16, py = y + 0.5 - 16;
      if (C.shine(px, py)) assert.ok(C.window(px, py), `${shape} ${h}: the shine is on the glass`);
      if (C.window(px, py)) {
        assert.ok(!C.casing(px, py) && !C.seams(px, py), `${shape} ${h}: the window is not also case`);
        assert.ok(py >= Math.min(...C.fill) - 0.5 && py <= Math.max(...C.fill) + 0.5, `${shape} ${h}: fill covers the window's rows`);
      }
      assert.equal(C.casing(px, py) || C.window(px, py) || C.seams(px, py), C.casing(-px, py) || C.window(-px, py) || C.seams(-px, py), `${shape} ${h}: mirror image`);
    }
  }
  assert.ok(cellIn(20, 'cell').half < cellIn(20, 'pack').half, 'a pack is wider than a cell');
  assert.ok(area((px, py) => cellIn(20, 'cell').shine(px - 16, py - 16)) >= 2 && area((px, py) => cellIn(20, 'pack').shine(px - 16, py - 16)) === 0, 'glass shines, a pack does not');
  // the handle of a pack is a solid tab: squashed to half its width it is still joined to the box
  const K = cellIn(20, 'pack'), thin = (f) => (px, py) => f((px - 16) / 0.5, py - 16);
  for (let y = 6; y < 12; y++) { let n = 0; for (let x = 0; x < 32; x++) if (thin(K.casing)(x + 0.5, y + 0.5) || thin(K.seams)(x + 0.5, y + 0.5)) n++; assert.ok(n >= 2, `row ${y} of a squashed pack is not broken`); }
  assert.ok(cellIn(20, 'syringe').fill[0] < cellIn(20, 'syringe').fill[1], 'a syringe fills from the needle end, which is up');
  assert.ok(cellIn(20, 'cell').fill[0] > cellIn(20, 'cell').fill[1], 'a cell fills from the bottom');
});

test('drawCharge: fills from one end to a level, and brightens on a beat', () => {
  const win = rectIn(12, 8, 8, 12), C = ramp(HEAL);
  const full = new Surface(32, 32), half = new Surface(32, 32), low = new Surface(32, 32);
  const F = drawCharge(full, win, HEAL, { from: 20, to: 8, level: 1 });
  const H = drawCharge(half, win, HEAL, { from: 20, to: 8, level: 0.5 });
  drawCharge(low, win, HEAL, { from: 20, to: 8, level: 0 });
  assert.equal(lit(full), 96, 'the whole window is painted');
  assert.equal(lit(half), 96, 'at any level: the rest is the dark of an empty window');
  assert.equal(area(F.wet), 96);
  assert.ok(area(H.wet) >= 40 && area(H.wet) <= 56, `half is about half (${area(H.wet)})`);
  assert.ok(boundsOf(H.wet, 32).y1 === 19 && boundsOf(H.wet, 32).y0 > 10, 'filled from the bottom');
  assert.ok(count(low, C.base) + count(low, C.light) >= 8, 'never quite empty');
  // from the top
  const T = drawCharge(new Surface(32, 32), win, HEAL, { from: 8, to: 20, level: 0.5 });
  assert.ok(boundsOf(T.wet, 32).y0 === 8 && boundsOf(T.wet, 32).y1 < 18, 'filled from the top');
  // a beat makes it brighter, pixel for pixel in the same place
  const beat = new Surface(32, 32); drawCharge(beat, win, HEAL, { from: 20, to: 8, level: 1, beat: 1 });
  assert.ok(count(beat, '#ffffff') > count(full, '#ffffff'), 'more white on the beat');
  assert.equal(count(beat, C.base), 0, 'and no resting tone left');
  assert.equal(lit(beat), 96);
  // written upright and placed: it fills along the window, wherever the window is put
  const side = new Surface(32, 32), quarter = (f) => (px, py) => f(16 + (py - 16), 16 - (px - 16));       // a quarter turn about (16, 16)
  const S = drawCharge(side, win, HEAL, { from: 20, to: 8, level: 0.5, place: quarter });
  assert.equal(lit(side), 96);
  const sb = boundsOf(S.wet, 32), wb = side.bounds();
  assert.equal(wb.x1 - wb.x0 + 1, 12, 'the window lies on its side');
  assert.equal(sb.y1 - sb.y0 + 1, 8, 'and the charge fills along it: its whole height');
  assert.ok(sb.x1 - sb.x0 + 1 <= 7, 'from one end');
});

// ---- light round a thing, a band on a ball ---------------------------------------------------

test('haloIn: one pixel clear of the outline, only beside the lit part', () => {
  const body = rectIn(10, 8, 12, 16), lit = rectIn(10, 12, 12, 6), halo = haloIn(body, lit);
  assert.deepEqual(boundsOf(halo, 32), { x0: 8, y0: 12, x1: 23, y1: 17 }, 'two columns, left and right of the lit rows');
  assert.equal(area(halo), 12);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (halo(x + 0.5, y + 0.5)) {
    assert.ok(!body(x + 0.5, y + 0.5), 'never on the body');
    assert.ok(!body(x - 0.5, y + 0.5) && !body(x + 1.5, y + 0.5) && !body(x + 0.5, y - 0.5) && !body(x + 0.5, y + 1.5), 'never where the outline goes');
  }
  assert.equal(area(haloIn(body, rectIn(13, 12, 6, 6))), 0, 'a lit part deep inside the body has no halo');
});

test('meridianIn: a bar down the middle that crosses the ball to the right, once per half turn', () => {
  const ball = ellipseIn(16, 16, 8, 8);
  const mid = (turn) => { const b = boundsOf(meridianIn(16, 16, 8, 8, turn), 32); return (b.x0 + b.x1 + 1) / 2; };
  const still = meridianIn(16, 16, 8, 8, 0);
  assert.deepEqual(boundsOf(still, 32), { x0: 15, y0: 8, x1: 16, y1: 23 }, 'turn 0: two pixels wide, pole to pole');
  assert.ok(mid(0.5) > mid(0) && mid(1.0) > mid(0.5), 'it moves to the right');
  assert.ok(mid(Math.PI - 0.5) < 16 && mid(Math.PI - 0.5) < mid(Math.PI - 0.2), 'and comes in again from the left');
  for (const turn of [0, 0.4, 0.8, 1.2, 1.5, 1.9, 2.4, 2.9]) {
    const band = meridianIn(16, 16, 8, 8, turn);
    for (let y = 9; y < 23; y++) { let n = 0; for (let x = 0; x < 32; x++) if (band(x + 0.5, y + 0.5)) { n++; assert.ok(ball(x + 0.5, y + 0.5), 'on the ball'); } assert.ok(n >= 1, `turn ${turn}: row ${y} has band`); }
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) assert.equal(band(x + 0.5, y + 0.5), meridianIn(16, 16, 8, 8, turn + Math.PI)(x + 0.5, y + 0.5), 'half a turn on, the same picture');
  }
});

// ---- two small solids -------------------------------------------------------------------------

test('crystalIn: a point at each end, upright flanks, exactly symmetrical', () => {
  const c = crystalIn(8, 8, 6, 10);
  assert.deepEqual(boundsOf(c, 16), { x0: 5, y0: 3, x1: 10, y1: 12 });
  const row = (y) => { let n = 0; for (let x = 0; x < 16; x++) if (c(x + 0.5, y + 0.5)) n++; return n; };
  assert.deepEqual([3, 4, 5, 6, 7].map(row), [2, 4, 6, 6, 6], 'it widens two pixels a row, then runs straight');
  for (let y = 0; y < 16; y++) { assert.equal(row(y), row(15 - y), 'top and bottom match'); for (let x = 0; x < 8; x++) assert.equal(c(x + 0.5, y + 0.5), c(15 - x + 0.5, y + 0.5), 'left and right match'); }
  // an odd height on a centre ending in .5
  assert.deepEqual(boundsOf(crystalIn(8, 8.5, 6, 9), 16), { x0: 5, y0: 4, x1: 10, y1: 12 });
  assert.equal(area(crystalIn(8, 8, 6, 4), 16), area(crystalIn(8, 8, 6, 6), 16), 'never shorter than it is wide');
});

test('cubeIn: three faces that share the cube between them', () => {
  const C = cubeIn(8, 8, 10);
  assert.deepEqual(boundsOf(C.body, 16), { x0: 3, y0: 3, x1: 12, y1: 12 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const p = [x + 0.5, y + 0.5], n = [C.top, C.left, C.right].filter((f) => f(...p)).length;
    assert.equal(n, C.body(...p) ? 1 : 0, `pixel ${x},${y} belongs to exactly one face of the cube, or to none`);
    assert.equal(C.top(...p), C.top(16 - p[0], p[1]), 'the top is symmetrical');
    assert.equal(C.left(...p), C.right(16 - p[0], p[1]), 'the two sides mirror each other');
  }
  const top = boundsOf(C.top, 16);
  assert.equal(top.y0, 3, 'the top face starts at the top');
  assert.ok(top.y1 <= 8, 'and is a flat diamond over the two sides');
  assert.ok(Math.abs((top.y0 + top.y1 + 1) / 2 - C.topY) <= 0.5, 'topY is its middle row');
  assert.ok(area(C.left, 16) > area(C.top, 16) * 0.6, 'the sides are as big as the top or bigger');
});
