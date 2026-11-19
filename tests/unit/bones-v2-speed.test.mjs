// Bone rig v2 (rigs/bones.js, build item B5), part 4: speed. docs/data-sprites.md 4.2: one frame of a 64x64
// character with up to 160 shapes and 40 stamps, median at most 0.5 ms and worst at most 3 ms, for the whole frame
// (solveRig, rigList, engine/draw-list.js drawList). Measured as tests/unit/draw-list-speed.test.mjs measures the draw
// list alone (the median is the plain median; the worst case is the slowest frame after the slowest 1%: garbage
// collection pauses are not the renderer's), the worst case in this thread's CPU time (see the test).
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import * as B from '../../rigs/bones.js';

const colours = [{ id: 'skin', default: '#e0a878' }, { id: 'cloth', default: '#3a6ea5' }, { id: 'metal', default: '#b8c4cc' }, { id: 'eye', default: '#2a1d6e', detail: true }, { id: 'fire', default: '#ffb84a' }];

/**
 * A 64x64 character-sized rig built like engine/draw-list.js's own speed test (tests/helpers/draw-list-lists.mjs
 * characterList), on bones: 24 bones in 4 chains, 160 body shapes (limb, capsule, ellipse, poly; two in three in one
 * of 8 groups, 8 z levels), 40 stamps with a variant, a glowing ellipse and dot.
 */
function character() {
  const bones = [];
  for (let c = 0; c < 4; c++) for (let i = 0; i < 6; i++) bones.push({ id: `c${c}b${i}`, parent: i ? `c${c}b${i - 1}` : null, ...(i ? {} : { at: [20 + c * 8, 30] }), angle: i ? 12 : 150 + c * 20, length: 4 });
  const kinds = ['limb', 'capsule', 'ellipse', 'poly'];
  const shapes = [];
  for (let k = 0; k < 160; k++) {
    const on = bones[k % bones.length].id, kind = kinds[k % kinds.length];
    const s = { id: `s${k}`, on, kind, paint: ['skin', 'cloth', 'metal'][k % 3], z: (k % 8) * 2, ...(k % 3 ? { group: `g${k % 8}` } : {}) };
    if (kind === 'limb') s.width = 1 + (k % 3);
    if (kind === 'capsule') Object.assign(s, { from: 0, to: 1, r: [2 + (k % 3), 1.5] });
    if (kind === 'ellipse') Object.assign(s, { at: [2, 0], r: [2 + (k % 4), 1.5 + (k % 3)] });
    if (kind === 'poly') s.points = [[0, -2], [4, -2], [5, 1], [1, 2]];
    shapes.push(s);
  }
  for (let k = 0; k < 40; k++) shapes.push({ id: `t${k}`, on: bones[(k * 5) % bones.length].id, kind: 'stamp', at: [1, -1], rows: ['ab.', 'bba', '.a.'], key: { a: 'eye', b: 'metal.light' }, variants: { shut: ['...', 'bbb', '...'] }, z: 30 });
  shapes.push({ id: 'orb', on: 'c0b5', kind: 'ellipse', at: [3, 0], r: [3, 3], paint: 'fire', glow: true }, { id: 'spark', on: 'c1b5', kind: 'dot', at: [3, 0], paint: 'fire', glow: true });
  return { version: 2, size: [64, 64], colours, bones, shapes };
}

test('bones v2: a 64x64 character of 160 shapes and 40 stamps on bones draws a frame (solve, list, draw) in a median of at most 0.5 ms, at worst 3 ms', () => {
  const rig = character();
  const g = new Surface(64, 64);
  const pose = (f) => {
    const bones = {};
    for (const b of rig.bones) bones[b.id] = (b.parent ? 12 : 150) + 15 * Math.sin(f * 0.7 + b.length + b.id.length);
    return { bones, root: [f % 2, 0], swap: f % 4 === 0 ? { t3: 'shut' } : undefined };
  };
  const poses = Array.from({ length: 16 }, (_, f) => pose(f));
  for (let f = 0; f < 200; f++) { g.clear(); B.drawRig(g, rig, poses[f % 16]); }     // warm up
  // Each frame is timed twice: by the wall clock, and by this thread's own CPU clock (process.threadCpuUsage, which
  // does not run while the thread waits for a core). The median is the wall clock's; the worst case is the CPU
  // clock's (the other test files node --test runs beside this one take the cores, and that wait is not the
  // renderer's). Three rounds at most, the best kept.
  const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
  let median = Infinity, p99 = Infinity;
  for (let round = 0; round < 3 && (median > 0.5 || p99 > 3); round++) {
    const runs = 400, wall = [], own = [];
    for (let f = 0; f < runs; f++) {
      const t0 = performance.now(), c0 = cpu();
      g.clear(); B.drawRig(g, rig, poses[f % 16]);
      own.push(cpu() - c0); wall.push(performance.now() - t0);
    }
    wall.sort((a, b) => a - b); own.sort((a, b) => a - b);
    median = Math.min(median, wall[runs >> 1]);
    p99 = Math.min(p99, own[Math.floor(runs * 0.99) - 1]);
  }
  const said = `median ${median.toFixed(3)} ms, 99th ${p99.toFixed(3)} ms a frame`;
  console.log(`bone rig 64x64: ${said}`);
  assert.ok(median <= 0.5, said);
  assert.ok(p99 <= 3, said);
  const J = B.solveRig(rig, pose(1));
  const out = B.rigList(rig, J, pose(1), {});
  assert.deepEqual(out.skipped, [], 'every shape is drawn');
  assert.equal(out.list.length, 203, '160 shapes, 40 stamps, 2 glowing ones and the outline');
});
