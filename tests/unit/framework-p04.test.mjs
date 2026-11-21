// Framework additions made with batch P04 (castle tiles, wooden door, wall torch):
//   engine/tiles.js    drawCourses     stone courses on a tile's pattern: rows of stones with joints that repeat every 32 px
//                      courseShift     how far to move courses down so that no joint row lies on the tile's first or last row
//                      drawBattlement  merlons standing on the bottom of a tile, inked and banded like the block they stand on
//                      drawArchway     a fill with an arch-headed opening cut through it: half an archway per tile, or a window
//   engine/surface.js  swing           a copy of a Surface squeezed towards a hinge column: a door leaf turning away
//                      masked          a copy of a Surface that keeps only the pixels a shape test allows
// Added in fix round 1 (generic code moved out of the three asset files):
//   engine/tiles.js      stoneSpot     a place for a small mark on the face of one of drawCourses' stones
//                        stoneTuft     a tuft of moss (or slime, or snow) lying on the top of a stone
//   engine/shapes.js     anyIn         several shape tests joined into one
//                        archIn        an opening with straight sides under a round arch, or the frame round it
//   engine/buildings.js  layOver       a piece painted over what is already drawn, inked only where it covers something
//                        archStones    the joints of the stones of an arch ring, and a keystone on its crown
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, swing, masked, ellipseIn, rectIn } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { TILE, patternFill, drawBlock, drawCourses, courseShift, drawBattlement, drawArchway, stoneSpot, stoneTuft } from '../../engine/tiles.js';
import { anyIn, archIn } from '../../engine/shapes.js';
import { archStones } from '../../engine/buildings.js';

const STONE = '#8f97a8', JOINT = '#5d6475', LIT = '#c2c9d6', TRIM = '#d8dce6';
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const row = (g, y) => Array.from({ length: g.w }, (_, x) => g.get(x, y));
const column = (g, x) => Array.from({ length: g.h }, (_, y) => g.get(x, y));
const COURSES = [{ h: 11, joints: [9, 25] }, { h: 10, joints: [3, 17] }, { h: 11, joints: [12, 28] }];
const pattern = (courses, opt) => { let stones; const fill = patternFill(STONE, (s) => { stones = drawCourses(s, courses, { joint: JOINT, ...opt }); }); return { fill, stones }; };
// a plain stone block: the same rim on every side
const block = (fill) => ({ ink: INK, fill, top: { depth: 3, paint: () => TRIM }, side: { depth: 3, paint: () => TRIM }, bottom: { depth: 3, paint: () => TRIM } });

// ---- drawCourses ------------------------------------------------------------------------

test('drawCourses: joint rows run right across, upright joints stand where asked, and the stones are returned', () => {
  const { fill, stones } = pattern(COURSES);
  for (const y of [10, 20, 31]) for (let x = 0; x < TILE; x++) assert.equal(fill(x, y), col(JOINT), `row ${y} is a joint all the way`);
  for (const x of [9, 25]) for (let y = 0; y < 10; y++) assert.equal(fill(x, y), col(JOINT), `column ${x} is a joint in the first course`);
  assert.equal(fill(9, 12), col(STONE), 'the joint of one course does not run into the next');
  assert.equal(stones.length, 6);
  // a stone between two joints, and the one that goes round the edge of the tile
  assert.deepEqual(stones[0], { x: 10, y: 0, w: 15, h: 10, course: 0, inner: false });
  assert.deepEqual(stones[1], { x: 26, y: 0, w: 15, h: 10, course: 0, inner: false });
  assert.deepEqual(stones[2], { x: 4, y: 11, w: 13, h: 9, course: 1, inner: true });
  assert.equal(stones.reduce((n, s) => n + s.w * s.h, 0) + count({ data: Uint32Array.from({ length: TILE * TILE }, (_, i) => fill(i % TILE, Math.floor(i / TILE))) }, JOINT), TILE * TILE, 'faces and joints make up the whole tile');
});

test('drawCourses: the pattern repeats every 32 px, so a block made from it joins itself', () => {
  const { fill } = pattern(COURSES, { lit: LIT });
  for (const [x, y] of [[3, 5], [17, 13], [31, 31]]) assert.equal(fill(x + TILE, y - TILE), fill(x, y));
  const m = block(fill), top = drawBlock(new Surface(TILE, TILE), 'top', m), mid = drawBlock(new Surface(TILE, TILE), 'fill', m);
  assert.deepEqual(column(top, 31).slice(4), column(mid, 31).slice(4), 'under its rim a top tile is the fill');
  assert.equal(count(mid, INK), 0);
});

test('drawCourses: lit puts a short highlight at the top right of each stone and never on a joint; round cuts the corners', () => {
  const plain = pattern(COURSES), lit = pattern(COURSES, { lit: LIT, glint: 3 }), round = pattern(COURSES, { round: true });
  let n = 0;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (lit.fill(x, y) !== col(LIT)) { assert.equal(lit.fill(x, y), plain.fill(x, y)); continue; }
    n++;
    assert.equal(plain.fill(x, y), col(STONE), `the highlight at ${x},${y} lies on a stone`);
  }
  assert.ok(n >= 6 * 3 && n <= 6 * 4, `three or four lit pixels a stone (${n})`);
  assert.equal(lit.fill(24, 0), col(LIT), 'the top right pixel of the first stone');
  assert.equal(lit.fill(10, 0), col(STONE), 'its top left pixel is plain');
  // round: the four corners of a stone are joint
  for (const [x, y] of [[4, 11], [16, 11], [4, 19], [16, 19]]) { assert.equal(round.fill(x, y), col(JOINT)); assert.equal(plain.fill(x, y), col(STONE)); }
  assert.equal(round.fill(5, 11), col(STONE));
});

test('drawCourses: two layouts that share their first course and joint rows have the same four edge lines', () => {
  const a = pattern([COURSES[0], { h: 10, joints: [6, 20] }, COURSES[2]], { lit: LIT }), b = pattern([COURSES[0], { h: 10, joints: [10, 24] }, COURSES[2]], { lit: LIT });
  for (let i = 0; i < TILE; i++) {
    assert.equal(a.fill(i, 0), b.fill(i, 0)); assert.equal(a.fill(i, 31), b.fill(i, 31));
    assert.equal(a.fill(0, i), b.fill(0, i)); assert.equal(a.fill(31, i), b.fill(31, i));
  }
  assert.notEqual(a.fill(6, 15), b.fill(6, 15), 'and differ inside');
  // a course with no upright joint is one long stone
  const slab = pattern([{ h: 16, joints: [] }, { h: 16, joints: [15] }]);
  assert.deepEqual(slab.stones[0], { x: 0, y: 0, w: 32, h: 15, course: 0, inner: false });
  assert.equal(slab.stones[1].w, 31);
});

test('drawCourses: shift moves the whole pattern down and round the tile, so the tile boundary can lie inside a course', () => {
  const plain = pattern(COURSES, { lit: LIT }), moved = pattern(COURSES, { lit: LIT, shift: 6 });
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x += 5) assert.equal(moved.fill(x, y + 6), plain.fill(x, y));
  // the last course now goes round the bottom of the tile: rows 31 and 0 are both its faces, and its joint row is row 5
  assert.equal(moved.fill(3, 31), col(STONE)); assert.equal(moved.fill(3, 0), col(STONE)); assert.equal(moved.fill(3, 5), col(JOINT));
  assert.deepEqual(moved.stones[0], { x: 10, y: 6, w: 15, h: 10, course: 0, inner: true });
  assert.deepEqual(moved.stones[4], { x: 13, y: 27, w: 15, h: 10, course: 2, inner: false });
});

test('courseShift: no joint row on the first or last row, and the course that goes round the tile is named', () => {
  assert.deepEqual(courseShift([11, 10, 11], 6), { shift: 6, round: 2 });      // joint rows 16, 26 and 5
  assert.deepEqual(courseShift([16, 16]), { shift: 2, round: 1 });        // a shift of 1 would put the second joint row on row 0
  // 8 px courses: a shift of 8 would put a joint on row 31 and 9 on row 0, so the next clear one is taken
  assert.deepEqual(courseShift([8, 8, 8, 8], 8), { shift: 10, round: 2 });
  for (const heights of [[11, 10, 11], [8, 8, 8, 8], [16, 16], [5, 9, 7, 11]]) for (let from = 0; from < 12; from++) {
    const { shift, round } = courseShift(heights, from);
    assert.ok(shift >= from);
    const { fill, stones } = pattern(heights.map((h) => ({ h, joints: [9, 25] })), { shift });
    assert.notEqual(fill(3, 0), col(JOINT)); assert.notEqual(fill(3, 31), col(JOINT));
    assert.deepEqual(stones.filter((st) => st.y + st.h > TILE).map((st) => st.course), [round, round], `${heights} from ${from}`);
  }
});

// ---- drawBattlement ----------------------------------------------------------------------

test('drawBattlement: a merlon stands on the bottom of the tile, inked on its top and sides and open below', () => {
  const m = block(pattern(COURSES).fill);
  const g = drawBattlement(new Surface(TILE, TILE), m, 0, { merlons: [[8, 23]], top: 10 });
  assert.deepEqual(g.bounds(), { x0: 8, y0: 10, x1: 23, y1: 31 });
  for (let x = 8; x <= 23; x++) assert.equal(g.get(x, 10), col(INK), 'the top line');
  for (let y = 10; y <= 31; y++) { assert.equal(g.get(8, y), col(INK)); assert.equal(g.get(23, y), col(INK)); }
  assert.notEqual(g.get(15, 31), col(INK), 'no line along the bottom: it stands on the top tile under it');
  assert.equal(g.get(15, 11), col(TRIM), 'the block\'s own top band under the line');
  assert.equal(g.get(9, 25), col(TRIM), 'and its side band');
  assert.equal(g.get(15, 25), m.fill(15, 25), 'the block\'s fill inside');
  assert.equal(count(g, TRIM), 14 * 3 + 2 * 3 * 18, 'a 3 px band along the top and down both sides');
});

test('drawBattlement: with a sill the parapet runs across the tile and off both edges, so the piece repeats sideways', () => {
  const m = block(pattern(COURSES).fill);
  const g = drawBattlement(new Surface(TILE, TILE), m, 0, { merlons: [[8, 23]], top: 6, sill: 22 });
  assert.deepEqual(g.bounds(), { x0: 0, y0: 6, x1: 31, y1: 31 });
  assert.equal(g.get(0, 22), col(INK)); assert.equal(g.get(31, 22), col(INK));
  assert.notEqual(g.get(0, 26), col(INK), 'the parapet has no line at the edge of the tile');
  assert.deepEqual(column(g, 0), column(g, 31), 'the two edges of the tile match');
  assert.equal(g.get(8, 21), col(INK), 'the merlon\'s side comes down to the parapet');
  assert.equal(g.get(8, 22), col(INK), 'and the corner where they meet is inked');
  assert.equal(g.get(12, 27), m.fill(12, 27));
  // two merlons to a tile, and a material with no ink line
  const two = drawBattlement(new Surface(TILE, TILE), { ...m, ink: null }, 0, { merlons: [[2, 9], [18, 25]], top: 12 });
  assert.equal(count(two, INK), 0);
  assert.equal(two.get(2, 12), col(TRIM)); assert.equal(two.get(12, 20), 0); assert.equal(two.get(21, 30), m.fill(21, 30));
});

// ---- drawArchway -------------------------------------------------------------------------

test('drawArchway: half an archway is a fill with a see-through quarter cut out, inked along the curve', () => {
  const m = block(pattern(COURSES).fill);
  const l = drawArchway(new Surface(TILE, TILE), m, 0, { x0: 1, x1: 62, spring: 32, crown: 8 });
  const r = drawArchway(new Surface(TILE, TILE), m, 0, { x0: -31, x1: 30, spring: 32, crown: 8 });
  assert.equal(l.get(31, 31), 0, 'open under the crown');
  assert.equal(l.get(31, 8), 0, 'the top row of the opening');
  assert.equal(l.get(31, 7), col(INK), 'the line over the crown');
  assert.equal(l.get(0, 31), col(INK), 'the curve comes down to the bottom left corner');
  assert.equal(l.get(2, 2), m.fill(2, 2), 'the fill in the corner above the arch');
  for (let x = 0; x < TILE; x++) assert.equal(l.get(x, 0), m.fill(x, 0), 'the top row is the fill: it joins the fill tile above');
  for (let y = 0; y < 20; y++) assert.equal(l.get(0, y), m.fill(0, y), 'and so does the left column');
  // every pixel next to the opening is ink, and ink is nowhere else
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if (!l.get(x, y)) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx < TILE && y + dy < TILE && x + dx >= 0 && y + dy >= 0 && !l.get(x + dx, y + dy));
    if (x < 31 && y < 31) assert.equal(l.get(x, y) === col(INK), edge, `${x},${y}`);
  }
  // the right half mirrors the left one (the outline, not the texture)
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(!!r.get(31 - x, y), !!l.get(x, y), `mirror at ${x},${y}`);
});

test('drawArchway: the band follows the opening, is told how far along the outline it is, and takes clean joints', () => {
  const m = block(pattern(COURSES).fill);
  const us = [];
  const band = { depth: 4, paint: (d, u) => { us.push(u); return d === 4 ? JOINT : TRIM; }, joints: { every: 8, colour: '#ff0000' } };
  const l = drawArchway(new Surface(TILE, TILE), m, 0, { x0: 1, x1: 62, spring: 32, crown: 10, band });
  assert.equal(l.get(31, 9), col(INK)); assert.equal(l.get(31, 8), col(TRIM)); assert.equal(l.get(31, 5), col(JOINT));
  assert.equal(l.get(31, 4), m.fill(31, 4), 'past the band, the fill');
  assert.ok(Math.min(...us) < -35 && Math.max(...us) <= 0.5, 'the left half counts back from the crown');
  assert.ok(count(l, '#ff0000') >= 4 * 3, 'four or more joints across the ring');
  // no band and no ink: a plain hole
  const plain = drawArchway(new Surface(TILE, TILE), { ...m, ink: null }, 0, { x0: 1, x1: 62, spring: 32, crown: 10 });
  assert.equal(count(plain, INK), 0);
});

test('drawArchway: a whole window in one tile, with straight sides below the springing and a foot', () => {
  const m = { ink: JOINT, fill: () => col(STONE) };
  const g = drawArchway(new Surface(TILE, TILE), m, 0, { x0: 11, x1: 20, spring: 13, crown: 7, foot: 24, band: { depth: 2, paint: () => TRIM } });
  assert.equal(g.get(15, 7), 0); assert.equal(g.get(15, 6), col(JOINT)); assert.equal(g.get(15, 24), 0); assert.equal(g.get(15, 25), col(JOINT));
  assert.equal(g.get(11, 18), 0); assert.equal(g.get(10, 18), col(JOINT)); assert.equal(g.get(9, 18), col(TRIM)); assert.equal(g.get(7, 18), col(STONE));
  assert.deepEqual(row(g, 18), row(g, 18).slice().reverse(), 'the same on both sides');
  assert.equal(g.get(0, 0), col(STONE)); assert.equal(g.get(31, 31), col(STONE));
});

// ---- swing ---------------------------------------------------------------------------------

test('swing: a leaf squeezed towards its hinge keeps whole columns, and only the leaf is copied', () => {
  const src = new Surface(24, 16);
  for (let x = 4; x < 20; x++) src.rect(x, 2, 1, 12, x % 2 ? '#aa0000' : '#00aa00');
  src.rect(0, 0, 2, 2, '#0000aa');                                     // something that is not the leaf
  const same = swing(src, 4, 16, 1);
  for (let x = 4; x < 20; x++) assert.deepEqual(column(same, x), column(src, x));
  assert.equal(same.get(0, 0), 0, 'what lies outside the leaf is left out');
  const half = swing(src, 4, 16, 0.5);
  assert.deepEqual(half.bounds(), { x0: 4, y0: 2, x1: 11, y1: 13 });
  assert.equal(half.get(4, 5), src.get(5, 5)); assert.equal(half.get(11, 5), src.get(19, 5));
  const sliver = swing(src, 4, 16, 0);
  assert.deepEqual(sliver.bounds(), { x0: 4, y0: 2, x1: 4, y1: 13 }, 'never thinner than one column');
});

test('swing: the free edge lifts by whole pixels, and a negative width hinges on the right', () => {
  const src = new Surface(24, 16);
  src.rect(4, 2, 16, 12, '#aa0000');
  const g = swing(src, 4, 16, 0.5, 3);
  assert.equal(g.get(4, 13), col('#aa0000'), 'the hinge column stays put');
  assert.equal(g.get(11, 13), 0); assert.equal(g.get(11, 10), col('#aa0000')); assert.equal(g.get(11, 11), 0);
  assert.equal(g.get(11, 2), col('#aa0000'), 'the top edge stays level');
  const d = swing(src, 4, 16, 0.5, 3, 2);
  assert.equal(d.get(11, 3), 0, 'unless it is told to drop'); assert.equal(d.get(11, 4), col('#aa0000')); assert.equal(d.get(4, 2), col('#aa0000'));
  // what is on the leaf is squeezed with it, top to bottom
  const marked = new Surface(24, 16); marked.rect(4, 2, 16, 12, '#aa0000'); marked.rect(4, 12, 16, 2, '#00aa00');
  const sq = swing(marked, 4, 16, 0.5, 6);
  assert.equal(sq.get(11, 7), col('#00aa00'), 'the band along the bottom rides up with the edge'); assert.equal(sq.get(11, 8), 0);
  const r = swing(src, 19, -16, 0.25);
  assert.deepEqual(r.bounds(), { x0: 16, y0: 2, x1: 19, y1: 13 });
  assert.notEqual(src.get(4, 5), 0, 'the source is not changed');
});

// ---- masked --------------------------------------------------------------------------------

test('masked: only the pixels a shape test allows are kept, each where it was', () => {
  const src = new Surface(16, 16);
  src.rect(0, 0, 16, 16, '#aa0000'); src.rect(6, 6, 2, 2, '#00aa00');
  const round = masked(src, ellipseIn(8, 8, 5, 5));
  assert.deepEqual(round.bounds(), { x0: 3, y0: 3, x1: 12, y1: 12 });
  assert.equal(round.get(3, 3), 0, 'the corner of the box is outside the circle');
  assert.equal(round.get(6, 6), col('#00aa00')); assert.equal(round.get(8, 3), col('#aa0000'));
  assert.equal(src.get(0, 0), col('#aa0000'), 'the source is not changed');
  // see-through pixels stay see-through, and the copy can then be pasted somewhere else
  const holed = new Surface(16, 16); holed.rect(4, 4, 4, 4, '#aa0000');
  const kept = masked(holed, () => true);
  assert.deepEqual(kept.bounds(), { x0: 4, y0: 4, x1: 7, y1: 7 });
  const g = new Surface(16, 16).blit(masked(holed, (px) => px < 6), 5, 0);
  assert.deepEqual(g.bounds(), { x0: 9, y0: 4, x1: 10, y1: 7 });
});

// ---- stoneSpot, stoneTuft (fix round 1) ---------------------------------------------------------

test('stoneSpot: a place on the face of a stone, clear of its joints and 3 px from every edge of the tile', () => {
  const { fill, stones } = pattern(COURSES, { lit: LIT });
  let found = 0;
  stones.forEach((st, i) => {
    const at = stoneSpot(st, i, 4);
    if (!at) return;
    found++;
    const [x, y] = at;
    assert.ok(Number.isInteger(x) && Number.isInteger(y));
    assert.ok(x >= 3 && x + 1 <= 28 && y >= 3 && y <= 28, `${x},${y} keeps off the outer 3 px`);
    assert.equal(fill(x, y), col(STONE), `${x},${y} is on a face`); assert.equal(fill(x + 1, y), col(STONE), 'and so is the pixel to its right: the mark is 2 px wide');
    assert.notEqual(fill(x - 1, y), col(JOINT)); assert.notEqual(fill(x + 2, y), col(JOINT), 'a pixel of stone either side of the mark');
    assert.notEqual(fill(x, y + 1), col(JOINT), 'and under it');
    assert.ok((y - st.y + TILE) % TILE >= 2, 'not on the two rows the highlight uses');
    assert.deepEqual(stoneSpot(st, i, 4), at, 'the same every time');
  });
  assert.equal(found, stones.length, 'every stone of this layout has room');
  // another seed, or another stone number, moves it
  const st = stones[2];
  assert.ok(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((seed) => String(stoneSpot(st, 0, seed)))).size >= 4);
  assert.ok(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => String(stoneSpot(st, i, 0)))).size >= 4);
});

test('stoneSpot: a stone that goes round the edge of the tile gets a spot on the part that is clear; one with no room gets null', () => {
  const round = { x: 26, y: 27, w: 15, h: 10 };                    // columns 26..40 and rows 27..36: round both edges
  for (let seed = 0; seed < 20; seed++) {
    const [x, y] = stoneSpot(round, 0, seed);
    assert.ok(x === 27 || (x >= 3 && x <= 6), `column ${x}: 3 px in from either edge of the tile, and a pixel short of the joint at 9`);
    assert.equal(y, 3, 'the one row of it that is clear of the edges: rows 29 to 31 and 0 to 2 are not');
  }
  assert.equal(stoneSpot({ x: 10, y: 4, w: 3, h: 8 }), null, 'too narrow for a 2 px mark with a pixel of stone either side');
  assert.equal(stoneSpot({ x: 10, y: 4, w: 9, h: 3 }), null, 'too low');
  assert.equal(stoneSpot({ x: 29, y: 4, w: 5, h: 8 }), null, 'all of it within 3 px of the edge');
  // the options: a wider margin, and a mark of another size
  for (let seed = 0; seed < 20; seed++) {
    const [x, y] = stoneSpot({ x: 0, y: 0, w: 32, h: 31 }, seed, 1, { margin: 8, w: 3, h: 2 });
    assert.ok(x >= 8 && x + 2 <= 23 && y >= 8 && y + 1 <= 23, `${x},${y}`);
  }
  assert.deepEqual(stoneSpot({ x: 4, y: 4, w: 5, h: 6 }, 0, 0, { w: 3, h: 1 }), [5, stoneSpot({ x: 4, y: 4, w: 5, h: 6 }, 0, 0, { w: 3, h: 1 })[1]], 'one column fits a 3 px mark on a 5 px stone');
});

test('stoneTuft: a tuft lies on the top of a stone, over the joint above it, and stays between its upright joints', () => {
  const moss = { light: '#b6d36a', base: '#6fa33c', dark: '#3d6b2e' };
  const stone = { x: 8, y: 12, w: 14, h: 9 };
  const draw = (st, opt) => { const s = new Surface(TILE, TILE); s.rect(0, 0, TILE, TILE, STONE); return stoneTuft(s, st, moss, opt); };
  const s = draw(stone);
  const green = (g) => { const b = { x0: TILE, y0: TILE, x1: -1, y1: -1 }; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (g.get(x, y) !== col(STONE)) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); } return b; };
  const b = green(s);
  assert.equal(b.x1 - b.x0 + 1, 6, 'six px wide');
  assert.ok(b.x0 >= 9 && b.x1 <= 20, 'a pixel inside each upright joint');
  assert.equal(b.y0, 11, 'it starts on the joint row over the stone'); assert.ok(b.y1 <= 13, 'and hangs one row down its face at most');
  for (let x = b.x0; x <= b.x1; x++) assert.equal(s.get(x, 12), col(moss.dark), 'a full row of the dark tone along the top of the face');
  assert.equal(s.get(b.x0, 11), col(STONE)); assert.equal(s.get(b.x1, 11), col(STONE), 'the row above is 1 px shorter at each end');
  assert.equal(s.get(b.x0 + 1, 11), col(moss.base)); assert.equal(s.get(b.x0 + 2, 11), col(moss.light), 'with one lit pixel');
  assert.equal(count(s, moss.light), 1); assert.equal(count(s, moss.base), 3);
  // big: nine px wide, and more of it hangs down
  const big = draw(stone, { big: true }), bb = green(big);
  assert.equal(bb.x1 - bb.x0 + 1, 9); assert.ok(bb.x0 >= 9 && bb.x1 <= 20);
  // a narrow stone gets a narrower tuft, and another seed puts it somewhere else along a wide one
  const nb = green(draw({ x: 8, y: 12, w: 6, h: 9 }, { big: true }));
  assert.deepEqual([nb.x0, nb.x1], [9, 12]);
  const wide = { x: 2, y: 12, w: 28, h: 9 };
  assert.ok(new Set([0, 1, 2, 3, 4, 5].map((seed) => green(draw(wide, { seed })).x0)).size >= 3);
  assert.deepEqual(green(draw(wide)), green(draw(wide, { seed: 0 })));
});

// ---- anyIn, archIn (fix round 1) ----------------------------------------------------------------

test('anyIn: a point is inside when any of the tests has it; lists are taken apart; no test at all is never inside', () => {
  const a = rectIn(0, 0, 4, 4), b = ellipseIn(10, 10, 3, 3), c = rectIn(20, 0, 2, 2);
  const both = anyIn(a, b);
  assert.equal(both(1, 1), true); assert.equal(both(10, 10), true); assert.equal(both(6, 6), false); assert.equal(both(21, 1), false);
  const all = anyIn(a, [b, [c]]);
  assert.equal(all(1, 1), true); assert.equal(all(10, 12), true); assert.equal(all(21, 1), true); assert.equal(all(15, 15), false);
  assert.equal(anyIn()(1, 1), false); assert.equal(anyIn([])(1, 1), false);
  assert.equal(anyIn(a)(3.5, 3.5), true); assert.equal(anyIn(a)(4.5, 3.5), false);
  // it goes straight into a drawing call, as one body
  const g = new Surface(16, 16).fill(0, 0, 16, 16, anyIn(rectIn(2, 2, 4, 4), rectIn(4, 4, 6, 6)), '#aa0000');
  assert.deepEqual(g.bounds(), { x0: 2, y0: 2, x1: 9, y1: 9 }); assert.equal(count(g, '#aa0000'), 16 + 36 - 4);
});

test('archIn: straight sides from the springing line down, a round head above it, and a flat top when it does not rise', () => {
  const arch = archIn(4, 16, 2, 8, 20);
  const g = new Surface(24, 24).fill(0, 0, 24, 24, arch, '#aa0000');
  assert.deepEqual(g.bounds(), { x0: 4, y0: 2, x1: 15, y1: 19 });
  for (let y = 8; y <= 19; y++) assert.equal(row(g, y).filter(Boolean).length, 12, `row ${y} is the full width`);
  assert.equal(g.get(4, 2), 0, 'the corner is cut by the arch'); assert.notEqual(g.get(9, 2), 0); assert.notEqual(g.get(10, 2), 0);
  for (let y = 2; y < 8; y++) {
    assert.deepEqual(row(g, y).slice(4, 16), row(g, y).slice(4, 16).reverse(), `row ${y} is the same on both sides`);
    assert.ok(row(g, y).filter(Boolean).length <= row(g, y + 1).filter(Boolean).length, 'and it widens downwards');
  }
  const flat = new Surface(24, 24).fill(0, 0, 24, 24, archIn(4, 16, 2, 2, 20), '#aa0000');
  assert.equal(count(flat, '#aa0000'), 12 * 18, 'spring at the top: a plain box');
  assert.deepEqual(new Surface(24, 24).fill(0, 0, 24, 24, archIn(4, 16, 6, 2, 20), '#aa0000').bounds(), { x0: 4, y0: 6, x1: 15, y1: 19 }, 'spring above the top: still a box from the top down');
});

test('archStones: joints square to the curve, above the springing line only, an odd number of stones and a keystone on the crown', () => {
  const cx = 16, spring = 18, rx = 8, ry = 6, depth = 4;
  const frame = archIn(cx - rx, cx + rx, spring - ry, spring, 30, depth);
  const draw = (opt) => { const g = new Surface(32, 32).fill(0, 0, 32, 32, frame, STONE); const n = archStones(g, cx, spring, rx, ry, { depth, colour: JOINT, clip: frame, ...opt }); return { g, n }; };
  const { g, n } = draw();
  assert.equal(n, 5, 'five stones is the least');
  let joints = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g.get(x, y) !== col(JOINT)) continue;
    joints++;
    assert.ok(y < spring, `the joint at ${x},${y} is above the springing line`);
    assert.ok(frame(x + 0.5, y + 0.5), 'and inside the frame');
  }
  assert.ok(joints >= 4 * 3, `four joints across the ring (${joints} px)`);
  for (let y = spring - ry - depth; y < spring - ry; y++) { assert.equal(g.get(cx - 1, y), col(STONE)); assert.equal(g.get(cx, y), col(STONE), 'no joint on the crown: a stone sits on it'); }
  // each joint runs from the opening outwards: it is found at every depth of the ring
  const ringAt = (g2, r) => { let k = 0; for (let i = 0; i < 400; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 400, x = Math.floor(cx + (rx + r) * Math.sin(a)), y = Math.floor(spring - (ry + r) * Math.cos(a)); if (y < spring && g2.get(x, y) === col(JOINT)) k++; } return k; };
  for (const r of [0.5, 1.5, 2.5]) assert.ok(ringAt(g, r) > 0, `joints at ${r} px out`);
  // a smaller `every` cuts more stones, still an odd number
  const fine = draw({ every: 2.5 });
  assert.equal(fine.n % 2, 1); assert.ok(fine.n > n); assert.ok(count(fine.g, JOINT) > joints);
  assert.equal(draw({ every: 100 }).n, 5);
  assert.equal(archStones(new Surface(64, 64), 32, 40, 15, 11, { colour: JOINT }), 9, 'a bigger arch has more');
  // the keystone: 4 px wide, lit, the depth of the ring, with a joint down each side from its second row
  const key = draw({ keystone: LIT }).g, top = spring - ry - depth;
  for (let y = top; y < top + depth; y++) for (let x = cx - 2; x < cx + 2; x++) assert.equal(key.get(x, y), col(LIT), `keystone at ${x},${y}`);
  for (let y = top + 1; y < top + depth; y++) { assert.equal(key.get(cx - 3, y), col(JOINT)); assert.equal(key.get(cx + 2, y), col(JOINT)); }
  assert.notEqual(key.get(cx - 3, top), col(JOINT), 'its top corners are left to the outline');
  assert.equal(count(key, LIT), 4 * depth);
  // without a clip the joints run the full depth, also past where a narrower frame would end
  const open = new Surface(32, 32); archStones(open, cx, spring, rx, ry, { depth: 6, colour: JOINT });
  assert.ok(count(open, JOINT) > joints);
});
