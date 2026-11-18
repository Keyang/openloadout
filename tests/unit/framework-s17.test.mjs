// Framework additions made with batch S17 (station projectiles: blaster bolt, scatter pellet, micro rocket,
// plasma orb, acid glob, orbit blade). All in a module of their own, engine/shots.js:
//   lightShape                       any shape test painted as light: nested bands from a white-hot core out to a dark rim
//   dropIn                           a round head whose tail narrows to a point: a comet, a pellet and its streak, a drip
//   crescentIn                       a disc with a bite out of one side: a sickle blade, a moon, a claw
//   missile, MISSILE_NOSES, MISSILE_FINS   a small missile lying level, nose to the right, shaded as a metal tube
//   hotEdge                          the glowing line just outside the ink of a blade's cutting edge
//   trailPuffs                       the puffs a moving thing leaves behind: born full size, falling back and shrinking
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn, rectIn } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';
import { lightShape, dropIn, crescentIn, missile, MISSILE_NOSES, MISSILE_FINS, hotEdge, trailPuffs } from '../../engine/shots.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const at = (g, x, y) => g.data[y * g.w + x];
const area = (f, w = 32, h = 32) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f(x + 0.5, y + 0.5)) n++; return n; };
const [A, B, C, RIM] = ['#f0ead8', '#a8e5e4', '#5fe0f0', '#2591c5'];

// ---- lightShape -------------------------------------------------------------------

test('lightShape: bands run from the hottest colour in the middle to the rim just outside the shape', () => {
  const g = new Surface(32, 32);
  const n = lightShape(g, ellipseIn(16, 16, 7, 7), [A, B, C, RIM]);
  assert.equal(at(g, 16, 16), col(A), 'the middle is the hottest colour');
  assert.equal(at(g, 9, 16), col(C), 'the outermost pixel of the shape is the last body colour');
  assert.equal(at(g, 10, 16), col(B), 'one pixel in: the next');
  assert.equal(at(g, 11, 16), col(A), 'two pixels in: the core');
  assert.equal(at(g, 8, 16), col(RIM), 'the pixel just outside is the rim');
  assert.equal(at(g, 7, 16), 0, 'and nothing beyond it');
  assert.equal(n, area(ellipseIn(16, 16, 7, 7)), 'it returns the number of pixels in the shape');
  assert.equal(lit(g), n + count(g, RIM));
});

test('lightShape: a shape too thin for every band keeps its outer ones', () => {
  const g = new Surface(32, 16);
  lightShape(g, rectIn(6, 7, 12, 3), [A, C, RIM]);                  // three rows: edge, core, edge
  assert.equal(at(g, 10, 8), col(A)); assert.equal(at(g, 10, 7), col(C)); assert.equal(at(g, 10, 9), col(C));
  assert.equal(at(g, 10, 6), col(RIM)); assert.equal(at(g, 10, 10), col(RIM));
  const thin = new Surface(32, 16);
  lightShape(thin, rectIn(6, 8, 12, 1), [A, C, RIM]);              // one row: only the edge colour and its rim
  assert.equal(count(thin, A), 0); assert.equal(count(thin, C), 12);
});

test('lightShape: inset widens the bands, rim: false leaves the rim out, one colour is flat', () => {
  const wide = new Surface(32, 32);
  lightShape(wide, ellipseIn(16, 16, 9, 9), [A, C, RIM], { inset: 3 });
  assert.equal(at(wide, 7, 16), col(C)); assert.equal(at(wide, 9, 16), col(C)); assert.equal(at(wide, 10, 16), col(A));
  const bare = new Surface(32, 32);
  lightShape(bare, ellipseIn(16, 16, 7, 7), [A, C], { rim: false });
  assert.equal(at(bare, 8, 16), 0, 'no rim');
  assert.equal(at(bare, 9, 16), col(C)); assert.equal(at(bare, 10, 16), col(A));
  const flat = new Surface(32, 32);
  lightShape(flat, ellipseIn(16, 16, 5, 5), [C]);
  assert.equal(count(flat, C), lit(flat));
});

test('lightShape: stays inside the frame\'s 1 px border and inside a box', () => {
  const g = new Surface(16, 16);
  lightShape(g, ellipseIn(8, 8, 20, 20), [A, C, RIM]);
  for (let i = 0; i < 16; i++) for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) assert.equal(at(g, x, y), 0, `(${x}, ${y}) is on the border`);
  assert.equal(lit(g), 14 * 14);
  const b = new Surface(32, 32);
  lightShape(b, ellipseIn(16, 16, 12, 12), [A, C, RIM], { box: [10, 10, 20, 20] });
  assert.deepEqual(b.bounds(), { x0: 10, y0: 10, x1: 19, y1: 19 });
});

// ---- dropIn -------------------------------------------------------------------------

test('dropIn: a round head and a tail that narrows to a point on the left', () => {
  const d = dropIn(20, 16, 4, 12);
  assert.ok(d(20.5, 16.5) && d(23.5, 16.5) && d(20.5, 12.5), 'the head is a disc');
  assert.ok(!d(24.5, 16.5), 'nothing in front of the head');
  assert.ok(d(8.6, 16), 'the tip of the tail, 12 px behind the centre');
  assert.ok(!d(7.4, 16), 'nothing beyond it');
  const halfAt = (x) => { let n = 0; for (let y = 8; y < 24; y++) if (d(x + 0.5, y + 0.5)) n++; return n; };
  for (let x = 9; x < 16; x++) assert.ok(halfAt(x) <= halfAt(x + 1), `the tail narrows toward its tip (column ${x})`);
  assert.ok(halfAt(10) < halfAt(19));
});

test('dropIn: a tail no longer than the head is just the disc, and the angle turns the tail', () => {
  assert.equal(area(dropIn(16, 16, 5, 3)), area(ellipseIn(16, 16, 5, 5)));
  const up = dropIn(16, 20, 3, 10, PI);                              // PI = up, the rig convention
  assert.ok(up(16, 10.4) && !up(16, 9), 'the tail points up');
  assert.ok(!up(6.5, 20.5), 'and no longer left');
});

// ---- crescentIn -----------------------------------------------------------------------

test('crescentIn: a disc with a bite out of the side the angle names', () => {
  const c = crescentIn(16, 16, 8, { bite: 0.8, shift: 0.5, angle: PI / 2 });   // the bite faces right
  assert.ok(c(9.5, 16.5), 'the back of the crescent is solid');
  assert.ok(!c(20.5, 16.5), 'the bite is empty');
  assert.ok(!c(6.5, 16.5), 'nothing outside the disc');
  assert.ok(c(16.5, 9.5) && c(16.5, 22.5), 'both horns are there');
  assert.ok(area(c) < area(ellipseIn(16, 16, 8, 8)) * 0.6);
  const down = crescentIn(16, 16, 8, { bite: 0.8, shift: 0.5, angle: 0 });      // 0 = down
  assert.ok(!down(16.5, 20.5) && down(16.5, 9.5));
});

test('crescentIn: a deeper bite leaves a thinner crescent', () => {
  const fat = area(crescentIn(16, 16, 8, { bite: 0.7, shift: 0.6 })), thin = area(crescentIn(16, 16, 8, { bite: 0.95, shift: 0.3 }));
  assert.ok(thin < fat);
  assert.ok(thin > 0);
});

// ---- missile ----------------------------------------------------------------------------

const rocket = (o = {}) => { const g = new Surface(32, 16); const r = missile(g, { x: 10, y: 8, length: 12, width: 4, colour: '#9aa6c0', stripe: '#2fb3a8', ...o }); return { g, r }; };

test('missile: lies level with its nose to the right, inside its length and width, and says where its ends are', () => {
  const { g, r } = rocket({ fins: 'none' });
  assert.deepEqual(g.bounds(), { x0: 10, y0: 6, x1: 21, y1: 9 });
  assert.deepEqual(r.nozzle, [10, 8]); assert.deepEqual(r.tip, [22, 8]);
  assert.ok(count(g, '#2fb3a8') >= 4, 'the stripe is there');
  assert.equal(count(g, INK), 0, 'it leaves the outline to the caller');
});

test('missile: every nose and every set of fins is its own shape', () => {
  assert.deepEqual(MISSILE_NOSES, ['round', 'pointed', 'flat']);
  assert.deepEqual(MISSILE_FINS, ['none', 'small', 'swept']);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    assert.ok(diff(rocket({ nose: MISSILE_NOSES[i] }).g, rocket({ nose: MISSILE_NOSES[j] }).g) >= 2, `${MISSILE_NOSES[i]} and ${MISSILE_NOSES[j]} noses differ`);
    assert.ok(diff(rocket({ fins: MISSILE_FINS[i] }).g, rocket({ fins: MISSILE_FINS[j] }).g) >= 3, `${MISSILE_FINS[i]} and ${MISSILE_FINS[j]} fins differ`);
  }
  const b = rocket({ fins: 'swept' }).g.bounds();
  assert.ok(b.y0 < 6 && b.y1 > 9, 'fins stand out above and below the tube');
  assert.throws(() => rocket({ nose: 'square' }), /nose/);
  assert.throws(() => rocket({ fins: 'big' }), /fins/);
});

test('missile: the three noses read in outline: flat cut square, round a dome, pointed a cone to a one-pixel tip 2 px past the dome', () => {
  const inked = (nose) => { const { g, r } = rocket({ nose, fins: 'none' }); g.outline(INK); return { g, r }; };
  const body = (g, x) => { let n = 0; for (let y = 0; y < 16; y++) if (at(g, x, y) && at(g, x, y) !== col(INK)) n++; return n; };
  const round = inked('round'), pointed = inked('pointed'), flat = inked('flat');
  assert.deepEqual(flat.r.tip, [20, 8], 'flat ends where the dome would begin');
  assert.deepEqual([body(flat.g, 19), body(flat.g, 20)], [4, 0], 'and its end is square and full width');
  assert.deepEqual([body(round.g, 20), body(round.g, 21), body(round.g, 22)], [4, 2, 0], 'round: a 2 px dome');
  assert.deepEqual(pointed.r.tip, [24, 8], 'pointed reaches 2 px past the dome');
  assert.deepEqual([19, 20, 21, 22, 23, 24].map((x) => body(pointed.g, x)), [4, 2, 2, 2, 1, 0], 'a cone 4 px long down to one pixel');
  const sil = (a, b) => a.data.reduce((n, v, i) => n + (!!v !== !!b.data[i] ? 1 : 0), 0);
  for (const [a, b, name] of [[round, pointed, 'round and pointed'], [round, flat, 'round and flat'], [pointed, flat, 'pointed and flat']]) {
    assert.ok(diff(a.g, b.g) >= 12, `${name} differ by 12 px or more (${diff(a.g, b.g)})`);
    assert.ok(sil(a.g, b.g) >= 4, `${name} differ in outline (${sil(a.g, b.g)})`);
  }
  // the stripe is on the straight tube, so it does not move when the nose changes
  const stripeAt = (g) => { for (let x = 0; x < 32; x++) if (at(g, x, 7) === col('#2fb3a8')) return x; return -1; };
  assert.equal(stripeAt(round.g), stripeAt(pointed.g)); assert.equal(stripeAt(round.g), stripeAt(flat.g));
  // an odd width has its tip on the centre row
  const odd = new Surface(32, 16); missile(odd, { x: 10, y: 8.5, length: 12, width: 5, nose: 'pointed', fins: 'none' });
  assert.deepEqual(odd.bounds(), { x0: 10, y0: 6, x1: 23, y1: 10 });
  assert.ok(at(odd, 23, 8) && !at(odd, 23, 7) && !at(odd, 23, 9));
});

test('missile: no stripe when none is asked for, and it keeps to its box', () => {
  assert.equal(count(rocket({ stripe: null }).g, '#2fb3a8'), 0);
  const { g } = rocket({ x: 24, fins: 'swept' });
  for (let y = 0; y < 16; y++) assert.equal(at(g, 31, y), 0);
  const boxed = rocket({ box: [1, 1, 18, 15] }).g;
  assert.ok(boxed.bounds().x1 <= 17);
});

// ---- hotEdge ------------------------------------------------------------------------------

test('hotEdge: a line of light one pixel outside the ink, only where it is asked for', () => {
  const g = new Surface(32, 32);
  g.ellipse(16, 16, 6, 6, '#c2c9d6'); g.outline(INK);
  const before = lit(g);
  const n = hotEdge(g, ellipseIn(16, 16, 6, 6), '#5fe0f0', { where: (px) => px > 16 });
  assert.equal(at(g, 23, 16), col('#5fe0f0'), 'the pixel outside the ink, on the right');
  assert.equal(at(g, 22, 16), col(INK), 'the ink is untouched');
  assert.equal(at(g, 8, 16), 0, 'nothing on the left');
  assert.equal(lit(g), before + n);
  assert.ok(n >= 10);
  const all = new Surface(32, 32);
  const m = hotEdge(all, ellipseIn(16, 16, 6, 6), '#5fe0f0');
  assert.ok(m > n, 'with no `where` it runs all the way round');
  assert.equal(at(all, 16, 16), 0, 'and paints nothing inside');
});

test('hotEdge: exactly the pixels two steps from the shape, and it keeps off the frame border', () => {
  const g = new Surface(16, 16);
  const n = hotEdge(g, rectIn(5, 5, 6, 6), '#5fe0f0');
  assert.equal(n, 4 * 6 + 4, 'a line along each side and one pixel at each corner');
  assert.equal(at(g, 3, 7), col('#5fe0f0')); assert.equal(at(g, 4, 7), 0, 'the ink line is left alone');
  assert.equal(at(g, 4, 4), col('#5fe0f0'), 'the corner pixel joins the sides');
  assert.equal(at(g, 3, 4), 0);
  const edge = new Surface(16, 16);
  hotEdge(edge, rectIn(2, 2, 12, 12), '#5fe0f0');                   // its line would fall on the border: left out
  for (let i = 0; i < 16; i++) for (const [x, y] of [[i, 0], [i, 15], [0, i], [15, i]]) assert.equal(at(edge, x, y), 0);
});

// ---- trailPuffs -----------------------------------------------------------------------------

const puffsAt = (t, o = {}) => { const g = new Surface(32, 16); trailPuffs(g, { t, x: 20, y: 8, count: 3, dist: 12, size: 5, colours: ['#9aa6c0', '#6b7896'], ...o }); return g; };

test('trailPuffs: the loop closes, something is always in view, and only its two colours are used', () => {
  assert.equal(diff(puffsAt(0), puffsAt(1)), 0, 't = 1 is t = 0 again');
  for (let f = 0; f < 8; f++) {
    const g = puffsAt(f / 8);
    assert.ok(lit(g) >= 4, `frame ${f} shows a puff`);
    assert.equal(count(g, '#9aa6c0') + count(g, '#6b7896'), lit(g));
    if (f) assert.ok(diff(g, puffsAt((f - 1) / 8)) > 0, `frame ${f} differs from the one before`);
  }
});

test('trailPuffs: a puff is born full size where it is asked for, falls back and shrinks', () => {
  const young = new Surface(32, 16), old = new Surface(32, 16);
  trailPuffs(young, { t: 0, x: 20, y: 8, count: 1, dist: 12, size: 5 });
  trailPuffs(old, { t: 0.7, x: 20, y: 8, count: 1, dist: 12, size: 5 });
  const a = young.bounds(), b = old.bounds();
  assert.ok(a.x0 <= 18 && a.x1 >= 21, 'the newborn puff sits on the point');
  assert.ok(b.x1 < a.x0, 'the old one has fallen back to the left');
  assert.ok(lit(old) < lit(young) / 2, 'and is much smaller');
  const up = new Surface(16, 32);
  trailPuffs(up, { t: 0.7, x: 8, y: 22, count: 1, dist: 12, size: 5, angle: PI });
  assert.ok(up.bounds().y1 < 18, 'the angle says which way they fall back');
});

test('trailPuffs: stays inside its box and off the frame border', () => {
  for (let f = 0; f < 8; f++) {
    const g = puffsAt(f / 8, { x: 4, dist: 14 });
    for (let y = 0; y < 16; y++) assert.equal(at(g, 0, y), 0);
    const b = puffsAt(f / 8, { box: [10, 1, 31, 15] }).bounds();
    if (b) assert.ok(b.x0 >= 10);
  }
});
