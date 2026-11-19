// engine/draw-list.js, part 11 (second review of B3): the work count can never be turned off or fooled. Numbers too
// large to count (a line from -1e308 to 1e308) are refused, never NaN; cuts made from a member's id are counted and
// taken out even when the member is alone in its group; listCost(list, w, h) is exactly what drawList spends, for the
// validator (B1) and generators (B2) to test against workBudget; `only` operations cost what they are charged; and a
// mirrored node gives the exact left-right flip of polygons and rects whose edges run through pixel centres.
import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import * as D from '../../engine/draw-list.js';
import { characterList, tileList, iconList, layerList, palette as libPalette } from '../helpers/draw-list-lists.mjs';

const palette = { skin: '#4f9d57', cloth: '#3a6ea5', sky: '#6fa3e0', rock: '#6b6f7d', ...libPalette };
const timed = (f) => { const t = performance.now(); const r = f(); return { ...r, ms: performance.now() - t }; };
const fullRects = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ kind: 'rect', at: [i % 3, 0], size: [640, 360], paint: 'skin', ...extra }));
const overBudget = (out) => out.skipped.filter((s) => /work budget/.test(s.why)).length;

test('draw-list costs: a line from -1e308 to 1e308 is refused, and the budget still holds for what follows', () => {
  const far = { kind: 'line', from: [-1e308, 5], to: [1e308, 5], paint: 'skin' };
  const c = D.costOf(far, 640, 360);
  assert.ok(Number.isFinite(c) && c >= 0, `costOf ${c}`);
  const out = timed(() => D.renderList(640, 360, [far, ...fullRects(3999)], { palette }));
  assert.ok(Number.isFinite(out.work) && out.work <= D.workBudget(640, 360), `work ${out.work}`);
  assert.ok(out.skipped.some((s) => s.index === 0), 'the far line is left out and reported');
  assert.ok(overBudget(out) > 3000, `the full-frame rects are cut at the budget (${overBudget(out)} left out)`);
  assert.ok(out.ms < 1500, `${out.ms.toFixed(0)} ms`);
  assert.ok(Number.isFinite(D.listCost([far, ...fullRects(10)], 640, 360, { palette })));
  // a line from far off (but placeable) still draws the part that crosses the frame
  const ok = D.renderList(64, 16, [{ kind: 'line', from: [-1e8, 5], to: [1e8, 5], paint: '#ff0000' }]);
  assert.deepEqual(ok.skipped, []);
  for (let x = 0; x < 64; x++) assert.notEqual(ok.g.get(x, 5), 0, `pixel ${x},5`);
});

test('draw-list costs: no primitive with huge numbers makes the work NaN (the budget check always holds)', () => {
  const B = 1e308;
  const hostile = [
    { kind: 'rect', at: [B, B], size: [B, B], paint: 'skin' },
    { kind: 'rect', at: [-B, -B], size: [B, B], paint: 'skin' },
    { kind: 'ellipse', at: [-B, 0], r: [B, B], paint: 'skin' },
    { kind: 'ellipse', at: [B, 0], r: [B, 3], turn: 30, paint: 'skin' },
    { kind: 'capsule', from: [-B, -B], to: [B, B], r: [B, 1], paint: 'skin' },
    { kind: 'limb', from: [-B, 0], to: [B, 0], width: 3, paint: 'skin' },
    { kind: 'line', from: [-B, -B], to: [B, B], thick: 3, paint: 'skin' },
    { kind: 'line', from: [-B, -B], to: [B, B], paint: 'skin' },
    { kind: 'poly', points: [[-B, -B], [B, -B], [0, B]], paint: 'skin' },
    { kind: 'arc', at: [0, 0], r: B, a0: 0, a1: 90, thick: B, paint: 'skin' },
    { kind: 'ring', at: [-B, B], r: B, paint: 'skin' },
    { kind: 'dot', at: [B, -B], paint: 'skin' },
    { kind: 'stamp', at: [B, -B], rows: ['a'], key: { a: 'skin' } },
    { kind: 'text', text: 'HI', at: [-B, B], paint: 'skin' },
    { kind: 'dither', area: { kind: 'ellipse', at: [-B, 0], r: [B, B] }, paint: 'skin' },
    { kind: 'bands', area: { kind: 'ellipse', at: [-B, 0], r: [B, B] }, stops: ['sky', 'sky.dark'], dir: 'out' },
    { kind: 'bands', area: { kind: 'rect', at: [-B, -B], size: [B, B] }, stops: ['sky', 'sky.dark'] },
    { kind: 'cut', shape: { kind: 'ellipse', at: [B, B], r: [B, B] } },
    { kind: 'cut', from: 'g', shape: { kind: 'rect', at: [-B, -B], size: [B, B] } },
  ];
  for (const p of hostile) {
    const c = D.costOf(p, 640, 360);
    assert.ok(Number.isFinite(c) && c >= 0, `${p.kind} costOf ${c}`);
    const out = D.renderList(640, 360, [p, ...fullRects(400)], { palette });
    assert.ok(Number.isFinite(out.work) && out.work <= D.workBudget(640, 360), `${p.kind} then 400 full rects: work ${out.work}`);
    assert.ok(overBudget(out) > 300, `${p.kind}: the budget still cuts (${overBudget(out)} left out)`);
    assert.ok(Number.isFinite(D.listCost([p], 640, 360, { palette })), `${p.kind} listCost`);
  }
});

test('draw-list costs: cuts made from a member\'s id are counted (no hang), in the plain and the shade-1.5 body', () => {
  const body = (extra) => [{ kind: 'rect', at: [0, 0], size: [640, 360], paint: 'skin', group: 'g', id: 'x', ...extra }, { kind: 'rect', at: [0, 0], size: [2, 2], paint: 'skin', group: 'g' }];
  const rectCuts = Array.from({ length: 3990 }, (_, i) => ({ kind: 'cut', from: 'x', shape: { kind: 'rect', at: [-10 - i, -10], size: [1, 1] } }));
  const poly = Array.from({ length: 64 }, (_, k) => [-50 + 5 * Math.sin(k), -50 + 5 * Math.cos(k)]);
  const polyCuts = Array.from({ length: 3990 }, () => ({ kind: 'cut', from: 'x', shape: { kind: 'poly', points: poly } }));
  for (const [name, list] of [['rect cuts', [...body({}), ...rectCuts]], ['shade 1.5, 64-point cuts', [...body({ shade: 1.5 }), ...polyCuts]]]) {
    const out = timed(() => D.renderList(640, 360, list, { palette }));
    assert.ok(out.ms < 1500, `${name}: ${out.ms.toFixed(0)} ms`);
    assert.ok(out.work <= D.workBudget(640, 360));
    assert.ok(out.skipped.some((s) => s.index === 0 && /work budget/.test(s.why)), `${name}: the body is left out for the budget`);
    assert.ok(D.listCost(list, 640, 360, { palette }) > D.workBudget(640, 360), `${name}: listCost is over the budget`);
  }
  // a few id cuts on a member of a two-member body: taken out of that member only, and counted
  const small = [
    { kind: 'rect', at: [0, 0], size: [16, 16], paint: '#ff0000', group: 'g', id: 'x' },
    { kind: 'rect', at: [16, 0], size: [16, 16], paint: '#ff0000', group: 'g', id: 'y' },
    { kind: 'cut', from: 'x', shape: { kind: 'rect', at: [4, 4], size: [24, 8] } },
  ];
  const s = D.renderList(32, 16, small);
  assert.equal(s.g.get(8, 8), 0, 'cut from x');
  assert.notEqual(s.g.get(20, 8), 0, 'y keeps its pixels');
  assert.equal(s.work, D.listCost(small, 32, 16));
});

test('draw-list costs: a cut from an id takes pixels out of a primitive that is alone in its group (plain, shade 1.5, glow)', () => {
  for (const extra of [{}, { shade: 1.5 }, { glow: true }, { shade: 2, light: 1 }]) {
    const prim = { kind: 'rect', at: [0, 0], size: [16, 16], paint: 'skin', id: 'x', ...extra };
    const cut = { kind: 'cut', from: 'x', shape: { kind: 'rect', at: [4, 4], size: [8, 8] } };
    const grouped = D.renderList(16, 16, [{ ...prim, group: 'g' }, cut], { palette });
    const alone = D.renderList(16, 16, [prim, cut], { palette });
    assert.equal(grouped.g.get(8, 8), 0, `${JSON.stringify(extra)}: pixel 8,8 is cut`);
    assert.ok(grouped.g.data.every((v, i) => v === alone.g.data[i]), `${JSON.stringify(extra)}: the same pixels as without the group`);
    assert.equal(grouped.work, D.listCost([{ ...prim, group: 'g' }, cut], 16, 16, { palette }));
  }
});

test('draw-list costs: listCost is exactly what drawList spends, and drawList leaves something out for the budget exactly when listCost is over it', () => {
  const dots = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'dot', at: i % 2 ? [639, 359] : [0, 0], paint: 'skin', group: `d${i >> 1}` }));
  const cases = [
    ['character', 64, 64, characterList()], ['tile', 32, 32, tileList()], ['icon', 32, 32, iconList()], ['layer', 320, 180, layerList()],
    ['200 far-apart grouped dots', 640, 360, dots(200)], ['8 far-apart grouped dots', 640, 360, dots(8)],
    ['groups, cuts, only', 64, 64, [
      { kind: 'ellipse', at: [20, 20], r: [10, 8], paint: 'skin', group: 'b', id: 'head' },
      { kind: 'rect', at: [14, 26], size: [12, 20], paint: 'skin', group: 'b', shade: 1.5 },
      { kind: 'poly', points: [[30, 30], [50, 34], [40, 50]], paint: 'cloth', id: 'flag', z: 2 },
      { kind: 'cut', from: 'head', shape: { kind: 'ellipse', at: [24, 18], r: 2 } },
      { kind: 'cut', from: 'b', shape: { kind: 'rect', at: [14, 40], size: [3, 3] } },
      { kind: 'outline', only: 'b' }, { kind: 'tint', only: 'flag', paint: '#ffffff' },
      { kind: 'ellipse', at: [50, 50], r: 4, paint: 'skin', glow: true },
      { kind: 'bands', area: { kind: 'rect', at: [0, 50], size: [64, 14] }, stops: ['sky', 'sky.dark'] },
      { kind: 'line', from: [0, 63], to: [63, 0], paint: 'ink' }, { kind: 'outline', sides: 'all' },
    ]],
    ['4,000 full-frame rects', 640, 360, fullRects(4000)],
    ['3,000 full-frame bands', 640, 360, Array.from({ length: 3000 }, () => ({ kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [640, 360] }, stops: ['sky', 'sky.dark'] }))],
  ];
  for (const [name, w, h, list] of cases) {
    const t = timed(() => ({ c: D.listCost(list, w, h, { palette }) }));
    assert.ok(t.ms < 1000, `${name}: listCost took ${t.ms.toFixed(0)} ms`);
    const out = D.renderList(w, h, list, { palette });
    const over = t.c > D.workBudget(w, h);
    assert.equal(overBudget(out) > 0, over, `${name}: listCost ${t.c}, budget ${D.workBudget(w, h)}, left out ${overBudget(out)}`);
    if (!over) assert.equal(out.work, t.c, `${name}: drawList spent ${out.work}, listCost says ${t.c}`);
  }
  assert.ok(D.listCost(dots(200), 640, 360, { palette }) > dots(200).reduce((s, p) => s + D.costOf(p, 640, 360), 0), 'a group costs more than its members alone');
  // without a palette every slot counts as a three-tone slot: never less than with the real palette
  for (const [, w, h, list] of cases.slice(0, 4)) assert.ok(D.listCost(list, w, h) >= D.listCost(list, w, h, { palette }));
  assert.equal(D.listCost(null, 64, 64), 0);
});

test('draw-list costs: `only` operations take time in line with their count (many owners)', () => {
  const dots = Array.from({ length: 3500 }, (_, i) => ({ kind: 'dot', at: [i % 64, (i / 64) | 0], paint: 'skin', group: 'k' + i }));
  const ops = Array.from({ length: 499 }, () => ({ kind: 'tint', only: 'zz', paint: '#ffffff' }));
  const list = [...dots, ...ops];
  D.renderList(64, 64, list, { palette });
  const ms = Math.min(...Array.from({ length: 3 }, () => timed(() => D.renderList(64, 64, list, { palette })).ms));
  assert.ok(ms < 150, `3,500 owners and 499 tint-only ops at 64 x 64: ${ms.toFixed(0)} ms`);
});

test('draw-list costs: a mirrored node is the exact flip of polygons and rects whose edges run through pixel centres', () => {
  const shapes = [
    { kind: 'poly', points: [[2, -8], [14, -4], [4, -1]], paint: '#e8b83a' },
    { kind: 'poly', points: [[-9, -9], [3, -6], [9, 1], [2, 9], [-7, 4]], paint: '#e8b83a' },
    { kind: 'poly', points: Array.from({ length: 12 }, (_, i) => [Math.round(11 * Math.sin(i * 0.5236)), Math.round(7 * Math.cos(i * 0.5236))]), paint: '#e8b83a' },
    { kind: 'rect', at: [-11.5, -12.5], size: [5, 3], paint: '#aa00aa' },
    { kind: 'dither', area: { kind: 'poly', points: [[2, -8], [14, -4], [4, -1]] }, amount: 1, paint: '#e8b83a' },
    { kind: 'cut', shape: { kind: 'poly', points: [[-6, -6], [6, -2], [0, 5]] } },
  ];
  for (const turn of [0, 25, -70, 90]) for (const s of shapes) {
    const under = s.kind === 'cut' ? [{ kind: 'rect', at: [16, 16], size: [32, 32], paint: '#3a6ea5' }] : [];
    const a = D.renderList(64, 64, [...under, D.placeOn(s, D.nodeFrame({ at: [32, 32], turn }))], { palette }).g;
    const b = D.renderList(64, 64, [...under, D.placeOn(s, D.nodeFrame({ at: [32, 32], turn: -turn, mirror: true }))], { palette }).g;
    let lit = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (a.get(x, y)) lit++;
      assert.equal(a.get(x, y) !== 0, b.get(63 - x, y) !== 0, `${s.kind} turn ${turn}: pixel ${x},${y}`);
    }
    assert.ok(lit > 0);
  }
  // placed twice on mirrored nodes is the unmirrored shape again
  const p = shapes[0], twice = D.placeOn(D.placeOn(p, D.nodeFrame({ mirror: true })), D.nodeFrame({ at: [32, 32], mirror: true }));
  const once = D.placeOn(p, D.nodeFrame({ at: [32, 32] }));
  const ga = D.renderList(64, 64, [twice], { palette }).g, gb = D.renderList(64, 64, [once], { palette }).g;
  assert.ok(ga.data.every((v, i) => v === gb.data[i]));
});
