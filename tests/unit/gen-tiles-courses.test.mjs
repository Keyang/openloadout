// tile.courses@1 (build item B15; docs/data-sprites.md 3.3 "tile"): stone courses in a tile, the port of engine/tiles.js
// drawCourses (joints only: rows of stones with 1 px joints that repeat every 32 px, cut corners for cobbles, the whole
// pattern shifted down round the tile), returned as flat rects. Held to: the goldens harness, and the same pixels as
// drawCourses for the dungeon's three pavings and odd cases (joints across the tile's edge, a course with no joints).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { drawCourses } from '../../engine/tiles.js';
import { Surface } from '../../engine/surface.js';
import { renderList } from '../../engine/draw-list.js';

const PAVING = {
  slabs: { heights: [17, 15], joints: [[10, 29], [4, 20]], round: false },
  bricks: { heights: [8, 8, 8, 8], joints: [[13, 29], [5, 21], [13, 29], [5, 21]], round: false },
  cobbles: { heights: [8, 8, 8, 8], joints: [[3, 11, 20, 28], [7, 15, 23, 30], [2, 10, 18, 26], [6, 13, 22, 29]], round: true },
  odd: { heights: [11, 10, 11], joints: [[31, 0, 16], [], [9]], round: true },
};
const argsOf = (P, shift) => ({ heights: P.heights, joints: P.joints.flat(), counts: P.joints.map((j) => j.length), shift, round: P.round, paint: 'joint' });

test('tile.courses@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('tile.courses', 1), { cases: [
    { args: argsOf(PAVING.slabs, 3) }, { args: argsOf(PAVING.bricks, 4) }, { args: argsOf(PAVING.cobbles, 1) } ] });
});

test('tile.courses@1 draws the pixels engine/tiles.js drawCourses draws', () => {
  for (const [name, P] of Object.entries(PAVING)) for (const shift of [0, 3, 17, 31]) {
    const want = new Surface(32, 32);
    drawCourses(want, P.heights.map((h, i) => ({ h, joints: P.joints[i] })), { joint: '#112233', round: P.round, shift });
    const r = registry.runGenerator({ gen: 'tile.courses', v: 1, ...argsOf(P, shift) }, { size: [32, 32] });
    assert.ok(r.ok, r.errors.join('; '));
    const got = renderList(32, 32, r.primitives, { palette: { joint: '#112233' } }).g;
    const diff = want.data.reduce((n, v, i) => n + (v !== got.data[i] ? 1 : 0), 0);
    assert.equal(diff, 0, `${name} shift ${shift}: ${diff} pixels differ`);
  }
});

test('tile.courses@1 is listed as working in tile pixels (it wraps round the tile)', () => {
  assert.ok(Object.hasOwn(registry.FRAME_GENERATORS, 'tile.courses@1'));
});
