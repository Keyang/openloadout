// The backdrop generators of build item B14 (docs/data-sprites.md 2.4, 3.3 "backdrop", "place", "colour"; engine/gen/backdrop.js):
// each registered in the site registry in its family, each passing the goldens harness (tests/helpers/gen-harness.mjs:
// pinned primitives at three or more argument sets, determinism, no clock or dice, argument fuzz, cost, loop closure),
// the colour rules pinned by the colours they work out, and the ports drawing what the code helpers they replace drew
// (engine/backdrop.js ridge, litEdge, fillBelow, fillBetween; engine/space.js arch, spaceLook): pixel for pixel.
//
// To pin a NEW version: add its cases to CASES, run once with GEN_GOLDEN_WRITE=1, look at the file in tests/fixtures/gen/.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { workOutColour, COLOUR_WORK, BACKDROP_FRAME_GENERATORS, columnPolys } from '../../engine/gen/backdrop.js';
import { renderList } from '../../engine/draw-list.js';
import { Surface } from '../../engine/surface.js';
import { mix } from '../../engine/color.js';

const WIDE = { size: [96, 48] };
const PAL = { sky: { hex: '#7fb8e0', material: 'sky' }, void: { hex: '#141a33', material: 'sky' }, land: { hex: '#2fb3a8', material: 'stone' }, rock: { hex: '#6a7280', material: 'stone' } };
const work = (rule) => workOutColour(rule, PAL, {});

const PALETTE = { rock: '#6a7280', lit: '#a0a8b8', air: '#c8d8e8', land: '#2fb3a8' };
const draw = (gen, args, size = [320, 180]) => {
  const r = registry.runGenerator({ gen, v: 1, ...args }, { size });
  assert.ok(r.ok, r.errors.join('; '));
  return renderList(size[0], size[1], r.primitives, { palette: PALETTE }).g;
};
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);

test('columns become stair polygons of at most 64 points, never more than 46 for the widest frame, and paint each column exactly', () => {
  const W = 640, H = 360;
  const y0 = new Int32Array(W), y1 = new Int32Array(W);
  for (let x = 0; x < W; x++) { y0[x] = (x * 7919) % 300; y1[x] = x % 3 === 0 ? y0[x] : y0[x] + 1 + ((x * 104729) % 50); }
  const polys = columnPolys(y0, y1, 'rock');
  assert.ok(polys.length <= 46, `${polys.length} polygons`);
  assert.ok(polys.every((p) => p.kind === 'poly' && p.points.length <= 64 && p.points.length >= 3 && p.shade === 0));
  const g = renderList(W, H, polys, { palette: PALETTE }).g;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) assert.equal(!!(g.get(x, y) >>> 24), y >= y0[x] && y < y1[x], `column ${x} row ${y}`);
});
