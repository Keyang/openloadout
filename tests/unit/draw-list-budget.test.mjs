// engine/draw-list.js, part 10: nothing can hang the page (docs/data-sprites.md 3.4 rule 2). Inside the caps (4,000
// primitives, 640 x 360) a list can still ask for billions of pixel tests, so every frame has a work budget counted in
// pixel tests (not time: the same list is cut at the same place on every machine); what would go over it is left out
// and reported. costOf(prim, w, h) is what one primitive costs, for the validator (B1) and generators (B2) to add up.
// Also: hostile shapes of data that only JS can build (huge arrays, cycles, BigInt) are skipped, never thrown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { Surface, rectIn, ellipseIn } from '../../engine/surface.js';
import { ramp } from '../../engine/color.js';
import * as D from '../../engine/draw-list.js';
import { characterList, tileList, iconList, layerList } from '../helpers/draw-list-lists.mjs';

const palette = { skin: '#4f9d57', cloth: '#3a6ea5', sky: '#6fa3e0', rock: '#6b6f7d', soil: '#7a5230', fire: '#ffb347',
  metal: '#b8c4cc', hair: '#5a3a22', eye: { hex: '#231b33', detail: true }, grass: '#4f9d57', leaf: '#3f7f46', cloud: '#eef2f8' };
const timed = (f) => { const t = performance.now(); const r = f(); return { ...r, ms: performance.now() - t }; };
const full = (i, extra = {}) => ({ kind: 'rect', at: [i % 5, 0], size: [600, 300], paint: 'skin', ...extra });

test('draw-list budget: each frame has a work budget in pixel tests, larger for larger frames', () => {
  assert.equal(typeof D.workBudget, 'function');
  const small = D.workBudget(64, 64), big = D.workBudget(640, 360);
  assert.ok(Number.isInteger(small) && small > 0);
  assert.ok(big > small);
  assert.equal(D.workBudget(640, 360), D.workBudget(5000, 5000), 'frames are capped at 640 x 360');
});

test('draw-list budget: lists inside the caps that ask for too much work finish fast, cut at the budget and reported', () => {
  const heavy = {
    '4,000 full-frame rects': Array.from({ length: 4000 }, (_, i) => full(i, { size: [640, 360] })),
    '2,000 rects and 2,000 outlines (sides all)': Array.from({ length: 4000 }, (_, i) => (i % 2 ? { kind: 'outline', sides: 'all' } : full(i))),
    '1,000 rects and 1,000 outlines only a group': Array.from({ length: 2000 }, (_, i) => (i % 2 ? { kind: 'outline', only: 'g' } : full(i, { group: 'g', z: i }))),
    '2,000 full-frame glows': Array.from({ length: 2000 }, (_, i) => full(i, { glow: true })),
    '400 grouped full-frame rects, shade 1.5': Array.from({ length: 400 }, (_, i) => full(i, { size: [640, 360], group: 'g', shade: 1.5 })),
    '2,000 tints': [full(0), ...Array.from({ length: 2000 }, () => ({ kind: 'tint', paint: '#ffffff' }))],
    '2,000 cuts from one body': [full(0, { group: 'g' }), ...Array.from({ length: 2000 }, (_, i) => ({ kind: 'cut', from: 'g', shape: { kind: 'rect', at: [i % 600, 0], size: [1, 1] } }))],
    '3,000 full-frame bands': Array.from({ length: 3000 }, () => ({ kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [640, 360] }, stops: ['sky', 'sky.dark'] })),
    '3,000 full-frame dithers': Array.from({ length: 3000 }, () => ({ kind: 'dither', area: { kind: 'rect', at: [0, 0], size: [640, 360] }, amount: 0.5, paint: 'sky' })),
    '2,000 pairs of far-apart grouped dots': Array.from({ length: 4000 }, (_, i) => ({ kind: 'dot', at: i % 2 ? [639, 359] : [0, 0], paint: 'skin', group: `d${i >> 1}` })),
  };
  for (const [name, list] of Object.entries(heavy)) {
    const out = timed(() => D.renderList(640, 360, list, { palette }));
    assert.ok(out.ms < 1500, `${name}: ${out.ms.toFixed(0)} ms`);
    assert.ok(out.work <= D.workBudget(640, 360), `${name}: work ${out.work}`);
    const over = out.skipped.filter((s) => /work budget/.test(s.why));
    assert.ok(over.length > 0, `${name}: something was left out (${out.skipped.length} skipped)`);
    for (const s of over) assert.equal(typeof s.index, 'number');
  }
});

test('draw-list budget: what fits is drawn and what is left out is the end of the paint order (deterministic)', () => {
  const list = Array.from({ length: 4000 }, (_, i) => full(i, { size: [640, 360], paint: i % 2 ? 'skin' : 'cloth' }));
  const a = D.renderList(640, 360, list, { palette }), b = D.renderList(640, 360, list, { palette });
  assert.deepEqual(a.skipped, b.skipped);
  assert.ok(a.g.data.every((v, i) => v === b.g.data[i]));
  const firstOut = a.skipped[0].index;
  assert.ok(firstOut > 10, 'a good number of full-frame rects still draw');
  assert.deepEqual(a.skipped.map((s) => s.index), Array.from({ length: 4000 - firstOut }, (_, k) => firstOut + k));
});

test('draw-list budget: the library-sized lists never come near it (character, tile, icon, layer, a full 640 x 360 scene)', () => {
  const scene = [{ kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [640, 360] }, stops: ['sky.light', 'sky', 'sky.dark', 'sky.deep'], edges: 'dither' }];
  for (let l = 0; l < 8; l++) {
    const pts = [[0, 360]];
    for (let i = 0; i <= 60; i++) pts.push([(i * 640) / 60, 120 + l * 25 + 20 * Math.sin(i * 0.7 + l)]);
    pts.push([640, 360]);
    scene.push({ kind: 'poly', points: pts, paint: l % 2 ? 'rock' : 'leaf', z: l, shade: 2 });
  }
  for (let c = 0; c < 60; c++) scene.push({ kind: 'ellipse', at: [(c * 53) % 640, 20 + (c * 17) % 90], r: [14, 6], paint: 'cloud', group: `c${c % 12}`, z: 9 });
  scene.push({ kind: 'dither', area: { kind: 'rect', at: [0, 200], size: [640, 60] }, pattern: 'bayer4', amount: 0.3, paint: 'cloud', z: 10 });
  for (let s = 0; s < 200; s++) scene.push({ kind: 'stamp', at: [(s * 37) % 630, 260 + (s * 11) % 90], rows: ['.a.', 'aba', '.a.'], key: { a: 'leaf', b: 'fire' }, z: 11 });
  scene.push({ kind: 'outline' });
  for (const [name, w, h, list, share] of [['character', 64, 64, characterList(), 0.1], ['tile', 32, 32, tileList(), 0.1], ['icon', 32, 32, iconList(), 0.1], ['layer', 320, 180, layerList(), 0.25], ['scene', 640, 360, scene, 0.5]]) {
    const out = D.renderList(w, h, list, { palette });
    assert.deepEqual(out.skipped, [], name);
    assert.ok(out.work <= D.workBudget(w, h) * share, `${name}: work ${out.work} of ${D.workBudget(w, h)}`);
  }
});

test('draw-list budget: costOf is what the renderer counts for a primitive drawn alone (validators add it up)', () => {
  const list = [
    { kind: 'rect', at: [-10, 4], size: [30, 12], paint: 'skin' },
    { kind: 'ellipse', at: [30, 30], r: [12, 9], turn: 17, paint: 'skin' },
    { kind: 'capsule', from: [22, 36], to: [30, 50], r: [4, 3], paint: 'cloth' },
    { kind: 'limb', from: [5, 5], to: [20, 40], width: 3, paint: 'cloth' },
    { kind: 'poly', points: [[0, 0], [40, 10], [10, 60]], paint: 'rock', shade: 2 },
    { kind: 'dot', at: [3, 3], paint: 'skin' },
    { kind: 'line', from: [0, 0], to: [63, 40], paint: 'cloth' },
    { kind: 'line', from: [0, 60], to: [63, 2], thick: 3, paint: 'cloth' },
    { kind: 'arc', at: [30, 30], r: 16, a0: 100, a1: 260, thick: 2, paint: 'cloth.light' },
    { kind: 'ring', at: [50, 12], r: 5, thick: 2, paint: 'skin.light' },
    { kind: 'stamp', at: [34, 26], rows: ['ab', 'bb'], key: { a: 'ink', b: 'skin.dark' } },
    { kind: 'dither', area: { kind: 'ellipse', at: [30, 30], r: [8, 6] }, pattern: 'bayer4', amount: 0.3, paint: 'skin.light' },
    { kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [64, 30] }, stops: ['cloth.light', 'cloth', 'cloth.dark'], edges: 'dither' },
    { kind: 'text', font: 'font:chunky@1', size: 0, text: 'OK', at: [4, 60], paint: 'cloth.light', outline: 'ink' },
    { kind: 'ellipse', at: [50, 50], r: 5, paint: 'fire', glow: true },
    { kind: 'ellipse', at: [20, 50], r: [7, 5], paint: 'skin', shade: 1.5, light: 0.5 },
    { kind: 'cut', shape: { kind: 'rect', at: [0, 0], size: [3, 3] } },
    { kind: 'tint', paint: '#ffffff' },
    { kind: 'outline' },
  ];
  for (const p of list) {
    const c = D.costOf(p, 64, 64);
    assert.ok(Number.isFinite(c) && c > 0, `${p.kind}: ${c}`);
    const out = D.renderList(64, 64, [p], { palette });
    assert.deepEqual(out.skipped, [], p.kind);
    assert.equal(out.work, c, `${p.kind}: the renderer counted ${out.work}, costOf says ${c}`);
  }
  const all = D.renderList(64, 64, list, { palette });
  assert.equal(all.work, list.reduce((s, p) => s + D.costOf(p, 64, 64), 0), 'ungrouped primitives add up');
  for (const bad of [null, {}, { kind: 'nope' }, { gen: 'star', v: 1 }, { kind: 'rect' }]) assert.equal(D.costOf(bad, 64, 64), 0);
  const whole = D.costOf({ kind: 'ellipse', at: [20, 50], r: [7, 5], paint: 'skin' }, 64, 64), half = D.costOf({ kind: 'ellipse', at: [20, 50], r: [7, 5], paint: 'skin', shade: 1.5 }, 64, 64);
  assert.equal(half - 1, 3 * (whole - 1), 'bands that are not whole pixels ask three masks');
  assert.ok(D.costOf({ kind: 'rect', at: [0, 0], size: [1e9, 1e9] }, 640, 360) <= 2 * 650 * 370, 'cost is of the part that can reach the frame');
});

test('draw-list budget: a body whose shade or light is not a whole number (shade 1.5) is still Surface.fill, and its work grows with its size, not members squared', () => {
  const members = [
    { kind: 'rect', at: [4, 4], size: [20, 10], paint: 'skin', group: 'b', shade: 1.5, light: 0.5 },
    { kind: 'ellipse', at: [26, 14], r: [9, 7], paint: 'skin', group: 'b', shade: 1.5 },
    { kind: 'rect', at: [50, 40], size: [6, 6], paint: 'skin', group: 'b' },
  ];
  const g = D.renderList(64, 64, [...members, { kind: 'cut', from: 'b', shape: { kind: 'ellipse', at: [24, 6], r: [4, 4] } }], { palette }).g;
  const want = new Surface(64, 64), cut = ellipseIn(24, 6, 4, 4);
  const tests = [rectIn(4, 4, 20, 10), ellipseIn(26, 14, 9, 7), rectIn(50, 40, 6, 6)], boxes = [[4, 4, 24, 14], [17, 7, 35, 21], [50, 40, 56, 46]];
  const guarded = tests.map((t, k) => (x, y) => x >= boxes[k][0] && x <= boxes[k][2] && y >= boxes[k][1] && y <= boxes[k][3] && t(x, y));
  const inside = (x, y) => !cut(x, y) && guarded.some((t) => t(x, y));
  for (const b of boxes) want.fill(b[0], b[1], b[2], b[3], inside, ramp('#4f9d57'), { shade: 1.5, light: 0.5 });
  assert.ok(g.data.every((v, i) => v === want.data[i]), 'the same pixels as one g.blob over the members (bones paintAll)');
  // linear: 200 members cost about twice 100 members, in work counted and in time
  const many = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'rect', at: [i % 7, (i * 3) % 11], size: [20, 15], paint: 'skin', group: 'g', shade: 1.5 }));
  const w1 = D.renderList(64, 64, many(100), { palette }), w2 = D.renderList(64, 64, many(200), { palette });
  assert.deepEqual(w2.skipped, []);
  assert.ok(w2.work < 2.2 * w1.work, `${w1.work} -> ${w2.work}`);
  // the fastest of 5 tries (other test files may run at the same time), after a warm-up
  const best = (n) => { const l = many(n); for (let k = 0; k < 5; k++) D.renderList(64, 64, l, { palette }); return Math.min(...Array.from({ length: 5 }, () => timed(() => D.renderList(64, 64, l, { palette })).ms)); };
  const t1 = best(100), t2 = best(200);
  assert.ok(t2 < 30, `200 members, shade 1.5: ${t2.toFixed(2)} ms`);
  assert.ok(t2 < 4 * t1 + 2, `twice the members: ${t1.toFixed(2)} ms -> ${t2.toFixed(2)} ms`);
});

test('draw-list safety: shapes of data only code can build (200k stamp rows, cycles, BigInt, huge arrays) are skipped, not thrown', () => {
  const cyc = {}; cyc.self = cyc;
  const hostile = [
    { kind: 'stamp', at: [0, 0], rows: Array(200000).fill('a'), key: { a: 'skin' } },
    { kind: 'stamp', at: [0, 0], rows: ['a'.repeat(200000)], key: { a: 'skin' } },
    { kind: 'rect', at: [0, 0], size: [4, 4], paint: cyc },
    { kind: 'rect', at: [0, 0], size: [4, 4], paint: 10n },
    { kind: 10n },
    { kind: cyc },
    { gen: cyc },
    { gen: 5n },
    { kind: 'use', use: cyc },
    { kind: 'text', text: 'A', at: [0, 9], font: cyc, paint: 'skin' },
    { kind: 'dither', area: { kind: 'rect', at: [0, 0], size: [4, 4] }, pattern: cyc, paint: 'skin' },
    { kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [4, 4] }, dir: 10n, stops: ['skin'] },
    { kind: 'stamp', at: [0, 0], rows: ['a'], key: { a: 'skin' }, anchor: cyc },
    { kind: 'poly', points: Array(1e6).fill([1, 1]), paint: 'skin' },
    { kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [4, 4] }, stops: Array(1e6).fill('skin') },
    { kind: 'dither', area: { kind: cyc }, paint: 'skin' },
  ];
  let out;
  assert.doesNotThrow(() => { out = D.renderList(32, 32, [...hostile, { kind: 'rect', at: [10, 10], size: [4, 4], paint: 'cloth' }], { palette }); });
  assert.equal(out.drawn, 1);
  assert.equal(out.skipped.length, hostile.length);
  for (const s of out.skipped) assert.ok(typeof s.why === 'string' && s.why.length < 400, s.why);
  assert.doesNotThrow(() => D.costOf({ kind: 'stamp', at: [0, 0], rows: Array(200000).fill('a') }, 32, 32));
});
