// Framework addition made with batch R08, fix round 1 (village walls): coursedFace in engine/tiles.js, the paint of a
// top-down wall's front face (it was drawing code inside sprites/tiles-village.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { TILE, drawBlock, coursedFace } from '../../engine/tiles.js';

const BODY = '#8a8794', TOP = '#b0aeb8', JOINT = '#5c586c', MOSS = '#3f7a3a', TIP = '#6fb04a';
const JOINTS = [[4, 15, 26], [9, 20, 30]];

test('coursedFace lays courses with a joint row under each, and runs the lowest course down to the base line', () => {
  const paint = coursedFace({ rows: 29, course: 7, joints: [], body: BODY, joint: JOINT });
  for (let x = 0; x < TILE; x++) {
    for (const y of [6, 13, 20]) assert.equal(paint(x, y), JOINT, `a course line on row ${y}`);
    assert.equal(paint(x, 27), BODY, 'no line where a fifth course would start: the fourth runs on to row 28');
    assert.equal(paint(x, 28), BODY);
  }
  // 21 rows of face (under the sliver of cap of a wall one tile deep): three courses, the third one row deeper
  const low = coursedFace({ rows: 21, course: 7, body: BODY, joint: JOINT });
  assert.deepEqual([6, 13, 20].map((y) => low(5, y)), [JOINT, JOINT, BODY]);
  // fewer rows than one course: one course, no line
  const tiny = coursedFace({ rows: 4, course: 7, body: BODY, joint: JOINT });
  for (let y = 0; y < 4; y++) assert.equal(tiny(3, y), BODY);
});

test('coursedFace takes the upright joints of each course from the table in turn, and repeats every 32 px', () => {
  const paint = coursedFace({ rows: 29, course: 7, joints: JOINTS, body: BODY, joint: JOINT });
  for (let c = 0; c < 4; c++) for (let x = 0; x < TILE; x++) {
    const want = JOINTS[c % 2].includes(x) ? JOINT : BODY;
    assert.equal(paint(x, c * 7 + 3), want, `course ${c}, column ${x}`);
    assert.equal(paint(x + TILE, c * 7 + 3), want, 'the next tile along shows the same');
    assert.equal(paint(x - TILE, c * 7 + 3), want);
  }
});

test('coursedFace lights the first row of each stone, or of the first `lit` courses only', () => {
  const all = coursedFace({ rows: 29, course: 7, joints: JOINTS, body: BODY, top: TOP, joint: JOINT });
  assert.deepEqual([0, 7, 14, 21].map((y) => all(6, y)), [TOP, TOP, TOP, TOP]);
  assert.equal(all(4, 0), JOINT, 'an upright joint cuts the lit row');
  assert.equal(all(6, 1), BODY);
  const first = coursedFace({ rows: 29, course: 7, joints: JOINTS, body: BODY, top: TOP, lit: 1, joint: JOINT });
  assert.deepEqual([0, 7, 14, 21].map((y) => first(6, y)), [TOP, BODY, BODY, BODY]);
  const none = coursedFace({ rows: 29, course: 7, body: BODY, joint: JOINT });
  assert.equal(none(6, 0), BODY, 'no top colour: the stones are one colour');
});

test('coursedFace stands growth at the foot, with a tip on clumps two px high or more', () => {
  const foot = new Array(TILE).fill(0); foot[3] = 1; foot[10] = 3;
  const paint = coursedFace({ rows: 29, course: 7, joints: JOINTS, body: BODY, joint: JOINT, foot, footColour: MOSS, footTip: TIP });
  assert.equal(paint(3, 28), MOSS); assert.equal(paint(3, 27), BODY, 'one px high: no tip');
  assert.deepEqual([28, 27, 26, 25].map((y) => paint(10, y)), [MOSS, MOSS, TIP, BODY]);
  assert.equal(paint(5, 28), BODY, 'bare where the list says 0');
  assert.equal(paint(10 + TILE, 26), TIP, 'the growth repeats along the wall');
  // the same clumps stand on the last row of a lower face
  const low = coursedFace({ rows: 21, course: 7, body: BODY, joint: JOINT, foot, footColour: MOSS });
  assert.deepEqual([20, 19, 18, 17].map((y) => low(10, y)), [MOSS, MOSS, MOSS, BODY], 'no tip colour: the clump is one colour');
});

test('coursedFace chips the mortar where it is told to, and nowhere when the list is empty', () => {
  const chips = [[0, 20, 3], [2, 17, 4]];
  const worn = coursedFace({ rows: 29, course: 7, joints: JOINTS, body: BODY, joint: JOINT, chips });
  const fresh = coursedFace({ rows: 29, course: 7, joints: JOINTS, body: BODY, joint: JOINT });
  assert.deepEqual([19, 20, 21, 22].map((x) => worn(x, 3)), [BODY, JOINT, JOINT, BODY], 'two px wide by default');
  assert.deepEqual([17, 18].map((x) => worn(x, 2 * 7 + 4)), [JOINT, JOINT]);
  let differ = 0;
  for (let y = 0; y < 29; y++) for (let x = 0; x < TILE; x++) if (worn(x, y) !== fresh(x, y)) differ++;
  assert.equal(differ, 4, 'two chips of two px, and nothing else changes');
  const wide = coursedFace({ rows: 29, course: 7, body: BODY, joint: JOINT, chips: [[1, 5, 2]], chip: 3 });
  assert.deepEqual([4, 5, 6, 7, 8].map((x) => wide(x, 9)), [BODY, JOINT, JOINT, JOINT, BODY]);
});

test('coursedFace is the face of a wall block: 29 rows on the bottom pieces, 21 under the sliver of cap', () => {
  const foot = new Array(TILE).fill(0); foot[12] = 2;
  const face = (rows) => coursedFace({ rows, course: 7, joints: JOINTS, body: BODY, top: TOP, joint: JOINT, foot, footColour: MOSS, footTip: TIP });
  const wall = (rows) => ({ fill: () => '#c8c6cc', top: { depth: 3, paint: () => '#e4e2e6' }, face: { paint: face(rows), shadow: '#40384c' } });
  const tall = drawBlock(new Surface(TILE, TILE), 'bottom', wall(29)), paintTall = face(29);
  for (let y = 0; y < 29; y++) for (let x = 0; x < TILE; x++) assert.equal(tall.get(x, y), col(paintTall(x, y)), `bottom piece at ${x},${y}`);
  for (let x = 0; x < TILE; x++) { assert.equal(tall.get(x, 29), col(INK), 'the base line'); assert.equal(tall.get(x, 31), col('#40384c'), 'the shadow'); }
  const low = drawBlock(new Surface(TILE, TILE), 'strip-m', wall(21)), paintLow = face(21);
  for (let y = 8; y < 29; y++) for (let x = 0; x < TILE; x++) assert.equal(low.get(x, y), col(paintLow(x, y - 8)), `strip piece at ${x},${y}`);
  // the two faces end the same way on the base line: the growth and the lowest course line up along a wall
  assert.equal(tall.get(12, 28), col(MOSS)); assert.equal(low.get(12, 28), col(MOSS));
  assert.equal(tall.get(12, 27), col(TIP)); assert.equal(low.get(12, 27), col(TIP));
  // pieces beside each other continue the courses: the bottom-l piece's face matches the bottom piece's, past its ink end
  const corner = drawBlock(new Surface(TILE, TILE), 'bottom-l', wall(29));
  for (let y = 0; y < 29; y++) for (let x = 1; x < TILE; x++) assert.equal(corner.get(x, y), tall.get(x, y));
});

// ---- engine/paving.js: spreadStones (fix round 1: the marks of a fill version, spread over the tile) ----
import { patternFill, drawCourses, courseShift } from '../../engine/tiles.js';
import { drawHerringbone, spreadStones } from '../../engine/paving.js';

const gap = (a, b) => {                                    // between two stones' middles, round the tile's edges
  const dx = Math.abs(a.x + a.w / 2 - b.x - b.w / 2) % TILE, dy = Math.abs(a.y + a.h / 2 - b.y - b.h / 2) % TILE;
  return Math.hypot(Math.min(dx, TILE - dx), Math.min(dy, TILE - dy));
};
const cobbles = () => {
  let stones;
  const heights = [8, 8, 8, 8];
  patternFill('#d0cecc', (s) => { stones = drawCourses(s, heights.map((h, i) => ({ h, joints: [[3, 11, 20, 28], [7, 15, 23, 30], [2, 10, 18, 26], [6, 13, 22, 29]][i] })), { shift: courseShift(heights, 3).shift }); });
  return stones.filter((st) => st.inner);
};

test('spreadStones returns every stone once, the chosen one first, each as far as it can be from those before it', () => {
  const free = cobbles();
  assert.ok(free.length >= 6);
  for (const start of [0, 3, free.length - 1]) {
    const order = spreadStones(free, { start });
    assert.equal(order.length, free.length);
    assert.equal(new Set(order).size, free.length, 'no stone twice');
    assert.equal(order[0], free[start]);
    for (let k = 1; k < order.length; k++) {
      const near = (st) => Math.min(...order.slice(0, k).map((o) => gap(o, st)));
      const best = Math.max(...order.slice(k).map(near));
      assert.ok(near(order[k]) >= best - 1e-9, `stone ${k} is the farthest left from the first ${k}`);
    }
  }
  assert.deepEqual(spreadStones(free, { start: 2 }), spreadStones(free, { start: 2 }), 'the same order every time');
  assert.notDeepEqual(spreadStones(free, { start: 0 }), spreadStones(free, { start: free.length - 1 }), 'another start, another order');
});
test('spreadStones keeps the first few stones apart: no two of the first four cobbles are neighbours', () => {
  const order = spreadStones(cobbles());
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(gap(order[i], order[j]) > 9, `stones ${i} and ${j} are ${gap(order[i], order[j]).toFixed(1)} px apart`);
  // bricks of a herringbone: the first five take the four quarters of the tile and its middle
  let bricks;
  patternFill('#d0cecc', (s) => { bricks = drawHerringbone(s, { size: 4 }); });
  const five = spreadStones(bricks.filter((b) => b.inner)).slice(0, 5);
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) assert.ok(gap(five[i], five[j]) >= 11, `bricks ${i} and ${j} are ${gap(five[i], five[j]).toFixed(1)} px apart`);
});
test('spreadStones measures round the tile edge unless told not to, wraps the start, and takes an empty list', () => {
  const a = { x: 3, y: 14, w: 4, h: 4 }, b = { x: 25, y: 14, w: 4, h: 4 }, c = { x: 14, y: 14, w: 4, h: 4 };
  // round the edge a and b are 10 px apart, so the middle stone is the farthest from a; on a flat tile b is
  assert.deepEqual(spreadStones([a, b, c]), [a, c, b]);
  assert.deepEqual(spreadStones([a, b, c], { wrap: false }), [a, b, c]);
  assert.equal(spreadStones([a, b, c], { start: 4 })[0], b, 'a start past the end goes round');
  assert.equal(spreadStones([a, b, c], { start: -1 })[0], c);
  assert.deepEqual(spreadStones([]), []);
  assert.deepEqual(spreadStones(undefined), []);
});
