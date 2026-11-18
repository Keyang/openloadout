// Framework additions made with batch S18 (sci-fi effects: muzzle flash, energy hit, small plasma
// blast, large explosion), all in engine/blast.js:
//   spikesIn    shape test for spikes fanned inside a cone, the middle one the longest
//   fireballIn  shape test for a fireball of overlapping lobes, with an optional hole torn in its middle
//   fireball    that fireball painted in nested tones with a rim
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { PI, TAU } from '../../engine/motion.js';
import { spikesIn, fireballIn, fireball } from '../../engine/blast.js';

const draw = (fn, w = 64, h = 64) => { const g = new Surface(w, h); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const at = (g, x, y) => g.data[y * g.w + x];
const filled = (inside, w = 64, h = 64) => draw((g) => g.fill(0, 0, w, h, inside, '#ffffff'), w, h);
const borderClear = (g) => { const b = g.bounds(); return !b || (b.x0 >= 1 && b.y0 >= 1 && b.x1 <= g.w - 2 && b.y1 <= g.h - 2); };

// ---- spikesIn -------------------------------------------------------------------

test('spikesIn: the middle spike is the longest and points along angle', () => {
  const g = filled(spikesIn(8.5, 15.5, { count: 3, angle: PI / 2, arc: 2, r0: 0, r1: 18, short: 0.5, width: 4 }), 32, 32);
  const b = g.bounds();
  assert.ok(b.x1 >= 24 && b.x1 <= 26, `the middle tip reaches about 18 px to the right (x1 = ${b.x1})`);
  assert.ok(b.x0 >= 7, 'nothing behind the point');
  // the same above and below the middle row
  for (let y = 0; y < 15; y++) for (let x = 0; x < 32; x++) assert.equal(at(g, x, 15 - y) !== 0, at(g, x, 15 + y) !== 0, `mirror at (${x}, ${15 - y})`);
  // the outer spikes stop short: the tip column of the middle spike holds only the middle row
  let rows = 0;
  for (let y = 0; y < 32; y++) if (at(g, b.x1, y)) rows++;
  assert.equal(rows, 1, 'a one pixel tip');
});

test('spikesIn: count, short, r0 and belly change the shape', () => {
  const o = { count: 3, angle: PI / 2, arc: 2, r0: 0, r1: 18, short: 0.6, width: 4 };
  const base = filled(spikesIn(8.5, 15.5, o), 32, 32);
  assert.ok(!same(base, filled(spikesIn(8.5, 15.5, { ...o, count: 5 }), 32, 32)), 'count');
  assert.ok(lit(filled(spikesIn(8.5, 15.5, { ...o, short: 1 }), 32, 32)) > lit(base), 'short: 1 makes the outer spikes as long as the middle one');
  const off = filled(spikesIn(8.5, 15.5, { ...o, r0: 8 }), 32, 32);
  assert.equal(at(off, 10, 15), 0, 'r0 leaves the point itself clear');
  assert.ok(at(off, 20, 15) !== 0, 'and the spike is still there further out');
  // a petal (belly 0.7) is fat near its tip where a kite (belly 0.3) is thin
  const kite = filled(spikesIn(8.5, 15.5, { ...o, count: 1, width: 6, belly: 0.3 }), 32, 32);
  const petal = filled(spikesIn(8.5, 15.5, { ...o, count: 1, width: 6, belly: 0.7 }), 32, 32);
  const tall = (g, x) => { let n = 0; for (let y = 0; y < 32; y++) if (at(g, x, y)) n++; return n; };
  assert.ok(tall(petal, 21) > tall(kite, 21), 'petal is wider near the tip');
  assert.ok(tall(kite, 12) > tall(petal, 12), 'kite is wider near the start');
});

test('spikesIn: a spike thinner than a pixel is an unbroken one pixel line, unless hair is off', () => {
  for (const angle of [PI / 2, PI / 2 + 0.4, PI, 2.2]) {
    const g = filled(spikesIn(31.5, 31.5, { count: 1, angle, r0: 3, r1: 20, width: 0.3 }));
    const n = lit(g);
    assert.ok(n >= 12 && n <= 20, `angle ${angle}: about one pixel per step (${n})`);
  }
  const none = filled(spikesIn(31.5, 31.3, { count: 1, angle: PI / 2 + 0.4, r0: 3, r1: 20, width: 0.3, hair: false }));
  assert.ok(lit(none) < 12, 'without hair a thin spike breaks up');
  assert.equal(lit(filled(spikesIn(31.5, 31.5, { count: 3, r0: 10, r1: 10 }))), 0, 'no length, no spike');
});

test('spikesIn: with arc TAU * (count - 1) / count and short 1 the spikes go all round', () => {
  const g = filled(spikesIn(31.5, 31.5, { count: 6, angle: PI, arc: (TAU * 5) / 6, r0: 4, r1: 16, short: 1, width: 4, belly: 0.7 }));
  const b = g.bounds();
  assert.ok(b.y0 <= 19 && b.y1 >= 43, 'reaches up and down');
  assert.ok(b.x0 <= 17 && b.x1 >= 45, 'reaches left and right');
  assert.equal(at(g, 31, 31), 0, 'the middle is clear');
});

// ---- fireballIn -----------------------------------------------------------------

test('fireballIn: a lumpy body about r across that never reaches past r', () => {
  const inside = fireballIn({ x: 32, y: 32, r: 20, lobes: 6, seed: 1 });
  const g = filled(inside);
  const b = g.bounds();
  assert.ok(inside(32.5, 32.5), 'solid in the middle');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (at(g, x, y)) assert.ok(Math.hypot(x + 0.5 - 32, y + 0.5 - 32) <= 20.01, `(${x}, ${y}) is inside r`);
  assert.ok(b.x1 - b.x0 >= 30 && b.y1 - b.y0 >= 30, 'at least three quarters of 2r across');
  assert.ok(lit(g) < Math.PI * 20 * 20 * 0.97, 'not a plain disc: there are clefts between the lobes');
});

test('fireballIn: lobes, seed, bulge and boil change the outline; boil closes at whole numbers', () => {
  const o = { x: 32, y: 32, r: 20, lobes: 6, seed: 1 };
  const base = filled(fireballIn(o));
  assert.ok(!same(base, filled(fireballIn({ ...o, lobes: 9 }))), 'lobes');
  assert.ok(!same(base, filled(fireballIn({ ...o, seed: 2 }))), 'seed');
  assert.ok(!same(base, filled(fireballIn({ ...o, boil: 0.5 }))), 'boil');
  assert.ok(same(base, filled(fireballIn({ ...o, boil: 1 }))), 'boil 0 and boil 1 match');
  assert.ok(same(base, filled(fireballIn(o))), 'repeatable');
  // a low bulge is nearly a disc: more of the circle is filled
  assert.ok(lit(filled(fireballIn({ ...o, bulge: 0 }))) > lit(filled(fireballIn({ ...o, bulge: 1 }))), 'bulge 0 fills more of the circle than bulge 1');
});

test('fireballIn: a hole tears it open from the middle, and inset shrinks it from both sides', () => {
  const o = { x: 32, y: 32, r: 20, lobes: 6, seed: 1 };
  const torn = fireballIn({ ...o, hole: 9 });
  assert.ok(!torn(32.5, 32.5), 'the middle is open');
  assert.ok(lit(filled(torn)) < lit(filled(fireballIn(o))), 'less is left');
  assert.ok(lit(filled(torn)) > 100, 'a ring is left');
  const all = filled(torn), inner = filled((px, py) => torn(px, py, 2));
  assert.ok(lit(inner) < lit(all), 'inset leaves less');
  for (let i = 0; i < all.data.length; i++) if (inner.data[i]) assert.ok(all.data[i], 'the inset shape lies inside the whole one');
  assert.equal(lit(filled(fireballIn({ ...o, hole: 30 }))), 0, 'a hole bigger than the ball leaves nothing');
});

// ---- fireball -------------------------------------------------------------------

const TONES = ['#ffffff', '#f0ead8', '#f2a030', '#cb4900'];      // hottest first; the last is the rim

test('fireball: nested tones, the hottest in the middle, a rim round the outside', () => {
  const g = draw((s) => fireball(s, { x: 32, y: 32, r: 20, lobes: 6, seed: 1, colours: TONES }));
  assert.equal(at(g, 32, 32), col('#ffffff'), 'white hot in the middle');
  for (const c of TONES) assert.ok(count(g, c) > 0, `${c} is used`);
  assert.equal(lit(g), TONES.reduce((n, c) => n + count(g, c), 0), 'no other colour');
  // every pixel next to a see-through one is the rim; no inner tone touches the outside
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
    if (!at(g, x, y)) continue;
    const open = !at(g, x - 1, y) || !at(g, x + 1, y) || !at(g, x, y - 1) || !at(g, x, y + 1);
    if (open) assert.equal(at(g, x, y), col('#cb4900'), `(${x}, ${y}) on the outside is rim`);
  }
  // each tone sits inside the one before: white never touches the edge tone or the rim
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
    if (at(g, x, y) !== col('#ffffff')) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok([col('#ffffff'), col('#f0ead8')].includes(at(g, x + dx, y + dy)), `white at (${x}, ${y}) touches only white or the next tone`);
  }
});

test('fireball: band sets how far the heat reaches; a hole leaves a ring with a rim on both sides', () => {
  const o = { x: 32, y: 32, r: 20, lobes: 6, seed: 1, colours: TONES };
  const hot = draw((s) => fireball(s, { ...o, band: 2 })), cool = draw((s) => fireball(s, { ...o, band: 6 }));
  assert.ok(count(hot, '#ffffff') > count(cool, '#ffffff'), 'a thin band keeps more of the hottest tone');
  assert.equal(lit(hot), lit(cool), 'the outline is the same');
  const torn = draw((s) => fireball(s, { ...o, hole: 10 }));
  assert.equal(at(torn, 32, 32), 0, 'open in the middle');
  let rimInside = 0;
  for (let y = 24; y < 41; y++) for (let x = 24; x < 41; x++) if (at(torn, x, y) === col('#cb4900')) rimInside++;
  assert.ok(rimInside >= 12, 'the hole has a rim of its own');
});

test('fireball: stays inside the 1 px border and the box, is repeatable, and draws nothing for r 0', () => {
  const big = draw((s) => fireball(s, { x: 16, y: 16, r: 30, lobes: 5, colours: TONES }), 32, 32);
  assert.ok(lit(big) > 0 && borderClear(big), 'clipped to the border');
  const boxed = draw((s) => fireball(s, { x: 32, y: 32, r: 20, colours: TONES, box: [20, 20, 40, 40] }));
  const b = boxed.bounds();
  assert.ok(b.x0 >= 20 && b.y0 >= 20 && b.x1 < 40 && b.y1 < 40, 'clipped to the box');
  const a = draw((s) => fireball(s, { x: 32, y: 32, r: 20, lobes: 7, seed: 3, boil: 0.3, hole: 6, colours: TONES }));
  const c = draw((s) => fireball(s, { x: 32, y: 32, r: 20, lobes: 7, seed: 3, boil: 0.3, hole: 6, colours: TONES }));
  assert.ok(same(a, c), 'repeatable');
  assert.equal(lit(draw((s) => fireball(s, { x: 32, y: 32, r: 0, colours: TONES }))), 0, 'r 0 draws nothing');
  // one colour: a flat body with no rim of another colour
  const flat = draw((s) => fireball(s, { x: 32, y: 32, r: 12, colour: '#f2a030' }));
  assert.ok(count(flat, '#f2a030') > 100, 'a single colour works');
});
