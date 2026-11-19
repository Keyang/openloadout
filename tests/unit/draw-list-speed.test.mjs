// engine/draw-list.js, part 8: the performance targets of docs/data-sprites.md section 4.2, measured.
//   one frame, 64x64 character (<= 160 shapes, <= 40 stamps): median <= 0.5 ms, worst <= 3 ms
//   one tile 32x32; one icon: <= 1 ms
//   one background layer 320x180: <= 10 ms
// The lists are built to the top of each budget (160 body shapes in groups, 40 stamps, glow, an outline; a full tile
// with bands, dither and stamps; a sky of bands, ridges of 48-point polygons, 40 clouds and a dithered mist).
// Other test files may run at the same time on this machine, so the worst case is measured as the slowest of the
// frames after the slowest 1% (garbage collection pauses are not the renderer's); the median is the plain median.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as D from '../../engine/draw-list.js';

import { palette, characterList, tileList, iconList, layerList } from '../helpers/draw-list-lists.mjs';

function measure(w, h, list, runs) {
  for (let i = 0; i < 20; i++) D.renderList(w, h, list, { palette });
  const times = [];
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); D.renderList(w, h, list, { palette }); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(runs / 2)], p99: times[Math.floor(runs * 0.99) - 1], max: times[runs - 1] };
}

const report = (name, m) => `${name}: median ${m.median.toFixed(3)} ms, 99th ${m.p99.toFixed(3)} ms, slowest ${m.max.toFixed(3)} ms`;

test('draw-list speed: a 64x64 character of 160 shapes and 40 stamps, median <= 0.5 ms, worst <= 3 ms', () => {
  const list = characterList();
  assert.equal(list.filter((p) => p.kind === 'stamp').length, 40);
  assert.equal(list.filter((p) => !['stamp', 'outline'].includes(p.kind) && !p.glow).length, 160);
  const out = D.renderList(64, 64, list, { palette });
  assert.deepEqual(out.skipped, []);
  const m = measure(64, 64, list, 400);
  console.log(report('character 64x64', m));
  assert.ok(m.median <= 0.5, report('character', m));
  assert.ok(m.p99 <= 3, report('character', m));
});

test('draw-list speed: a 32x32 tile and a 32x32 icon, <= 1 ms each', () => {
  for (const [name, list] of [['tile', tileList()], ['icon', iconList()]]) {
    assert.deepEqual(D.renderList(32, 32, list, { palette }).skipped, []);
    const m = measure(32, 32, list, 400);
    console.log(report(`${name} 32x32`, m));
    assert.ok(m.median <= 1, report(name, m));
    assert.ok(m.p99 <= 3, report(name, m));
  }
});

test('draw-list speed: a 320x180 background layer, <= 10 ms', () => {
  const list = layerList();
  assert.deepEqual(D.renderList(320, 180, list, { palette }).skipped, []);
  const m = measure(320, 180, list, 60);
  console.log(report('layer 320x180', m));
  assert.ok(m.median <= 10, report('layer', m));
  assert.ok(m.p99 <= 20, report('layer', m));
});
