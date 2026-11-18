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
import { waterTones, rippleFill, lapPaint, shoreMap, drawShore, wakeRing, lilyPad, plankBridge } from '../../engine/water.js';
import { CRYSTAL_CUTS, crystalFaces, drawCrystal, drawAura } from '../../engine/crystals.js';

const WATER = '#4fa8d8', DEEP = '#2c79c0', FOAM = '#f0ead8', SAND = '#ecda95', FACE = '#b9925f';
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const column = (g, x) => Array.from({ length: g.h }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y));

// ---- water ----------------------------------------------------------------------------------------------------

test('waterTones: the body is clearly darker than the colour, and its marks differ from it', () => {
  const W = waterTones(WATER, { foam: FOAM });
  assert.equal(W.shallow, WATER);
  assert.equal(W.foam, FOAM);
  assert.ok(brightness(WATER) - brightness(W.body) >= 0.12, `body ${W.body} against ${WATER}`);
  assert.notEqual(col(W.light), col(W.body));
  assert.notEqual(col(W.dark), col(W.body));
  assert.ok(brightness(W.froth) > brightness(WATER) && brightness(W.froth) < brightness(FOAM));
});

test('rippleFill: repeats every 32 px, closes over one loop, and draws only its streaks and glints', () => {
  const at = (t, opt) => { const f = rippleFill(DEEP, t, { light: WATER, ...opt }); return (x, y) => f(x, y); };
  for (const t of [0, 0.125, 0.5, 0.875]) {
    const f = at(t, { count: 6, glints: [[1, 1, 0, 2]] }), again = at(t + 1, { count: 6, glints: [[1, 1, 0, 2]] });
    let marks = 0;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      assert.equal(f(x, y), f(x + TILE, y - TILE), `t ${t}: repeats at ${x},${y}`);
      assert.equal(f(x, y), again(x, y), `t ${t}: the loop closes at ${x},${y}`);
      if (f(x, y) !== col(DEEP)) marks++;
    }
    assert.ok(marks > 0 && marks < 120, `t ${t}: ${marks} px of marks`);
  }
  const bare = at(0.3, { count: 0 });
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(bare(x, y), col(DEEP));
  // a glint near the corner wraps round the tile's edges
  const corner = at(0, { count: 0, glints: [[0, 0, 0, 1]], glint: FOAM });
  assert.equal(corner(31, 0), col(FOAM));
  assert.equal(corner(0, 31), col(FOAM));
  // tips: the leading pixel of a streak, in another colour
  const tipped = rippleFill(DEEP, 0.3, { light: WATER, count: 6, tips: FOAM });
  let tips = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (tipped(x, y) === col(FOAM)) { tips++; assert.equal(tipped(x - 1, y), col(WATER)); }
  assert.ok(tips > 0);
});

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
const paints = (t = 0) => ({ body: rippleFill(DEEP, t, { light: WATER }), bank: (b) => (b.part === 'face' ? FACE : SAND), lap: { foam: FOAM, shallow: WATER }, laps: { s: { foam: null } } });
const shorePiece = (name, t = 0) => drawShore(new Surface(TILE, TILE), name, SHORE, paints(t), t);

test('drawShore: every pair of pieces that can touch meets outline to outline, on every frame', () => {
  for (const t of [0, 0.375]) {
    const made = Object.fromEntries([...BLOCK_PIECES, ...NARROW_PIECES].map((p) => [p, shorePiece(p, t)]));
    for (const [a, axis, b] of blockJoins({ narrow: true })) {
      const A = axis === 'x' ? column(made[a], TILE - 1) : row(made[a], TILE - 1);
      const B = axis === 'x' ? column(made[b], 0) : row(made[b], 0);
      for (let i = 0; i < TILE; i++) assert.equal(!!A[i], !!B[i], `${a} ${axis === 'x' ? 'left of' : 'above'} ${b}: the outlines meet at ${i}`);
    }
  }
});

test('drawShore: the fill is the body, a north shore has a cap, a face and a waterline, a south shore only a lip', () => {
  const fill = shorePiece('fill'), body = paints().body;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(fill.get(x, y), body(x, y));
  assert.equal(count(shorePiece('water-fill')), TILE * TILE, 'a whole clip name works');
  const top = shorePiece('top');
  // column 16: the outline is on the boundary there; 2 rows of cap, 5 of face, the ink line, then water
  assert.deepEqual(column(top, 16).slice(0, 8), [SAND, SAND, FACE, FACE, FACE, FACE, FACE, INK].map(col));
  assert.notEqual(top.get(16, 8), col(INK));
  // column 4: the outline is pulled in two px, and the whole bank with it
  assert.deepEqual(column(top, 4).slice(0, 10), [0, 0, SAND, SAND, FACE, FACE, FACE, FACE, FACE, INK].map((c) => (c ? col(c) : 0)));
  const bottom = shorePiece('bottom');
  assert.deepEqual(column(bottom, 16).slice(-2), [INK, SAND].map(col));
  assert.equal(bottom.get(0, 31), col(INK), 'the lip runs out at the tile corner: the waterline is on the boundary');
  assert.equal(bottom.get(31, 31), col(INK));
  // `laps` replaces the lap's options shore by shore: this south shore was given no foam, the north shore has some
  for (let x = 0; x < TILE; x++) for (let y = 24; y < TILE; y++) assert.notEqual(bottom.get(x, y), col(FOAM));
  assert.ok(top.data.includes(col(FOAM)));
});

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

test('crystals: every cut fills its box, turns, and comes back to where it started', () => {
  assert.deepEqual([...CRYSTAL_CUTS], ['shard', 'prism', 'orb', 'star']);
  for (const cut of CRYSTAL_CUTS) {
    const draw = (turn) => { const g = new Surface(32, 48); drawCrystal(g, 16, 24, 6, 10, '#4fd8ee', { cut, turn }); return g; };
    const a = draw(0), back = draw(1), mid = draw(0.25);
    assert.deepEqual([...a.data], [...back.data], `${cut}: a turn of 1 is a turn of 0`);
    const b = a.bounds();
    assert.ok(b.x0 >= 9 && b.x1 <= 22 && b.y0 >= 13 && b.y1 <= 34, `${cut}: inside its box ${JSON.stringify(b)}`);
    assert.ok(b.y1 - b.y0 >= (cut === 'star' ? 15 : 17), `${cut}: ${b.y1 - b.y0 + 1} px tall`);   // a star's tips are thinner than a pixel
    assert.ok(new Set(a.data).size >= 4, `${cut}: at least three tones`);
    assert.ok(a.data.some((v, i) => v !== mid.data[i]), `${cut}: a quarter of the way round looks different`);
    const { outline, faces } = crystalFaces(16, 24, 6, 10, cut, 0.3);
    assert.ok(outline(16, 24) && !outline(2, 2));
    if (cut !== 'orb') assert.ok(faces.length >= 3 && faces.every((f) => f.pts.length >= 3 && [-1, 0, 1, 2].includes(f.tone)), `${cut}: ${faces.length} faces`);
  }
});

test('drawAura: rings of light round a drawing, never on it, never past the reach or the box', () => {
  const src = new Surface(32, 32);
  src.rect(12, 12, 8, 8, '#4fd8ee');
  const g = drawAura(new Surface(32, 32), src, { reach: 2, colours: ['#ffffff', '#f0ead8'] });
  assert.equal(g.get(15, 15), 0, 'nothing under the drawing');
  assert.equal(g.get(11, 15), col('#ffffff'));
  assert.equal(g.get(10, 15), col('#f0ead8'));
  assert.equal(g.get(9, 15), 0);
  assert.deepEqual(g.bounds(), { x0: 10, y0: 10, x1: 21, y1: 21 });
  const boxed = drawAura(new Surface(32, 32), src, { reach: 3, box: [1, 1, 31, 12] });
  assert.ok(boxed.bounds().y1 <= 11);
  assert.equal(count(drawAura(new Surface(32, 32), src, { reach: 0 })), 0);
  const moved = drawAura(new Surface(32, 32), src, { reach: 1, dx: 3, dy: -2 });
  assert.deepEqual(moved.bounds(), { x0: 14, y0: 9, x1: 23, y1: 18 });
});
