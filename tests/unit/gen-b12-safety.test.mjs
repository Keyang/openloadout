// Safety of B12's effect behaviours (docs/data-sprites.md 3.4 rule 2; Contract 15 rule 6: a definition is drawn on the
// page with no worker, so the summed cost must bound the work before anything draws). The B12 review found:
//   1. starburst@1 tested every pixel of the whole frame against every spike while its cost was the tiles of its own
//      radius: 32 spikes of radius 2 cost 1 and took 284 ms at 640 x 360; sixteen of them made one frame take 4.7 s;
//   2. shot.bar@1 lit the whole frame in bands for a bar a few pixels long (11 ms at cost 1).
// Now every behaviour works only in the box its drawing can reach (cut to the frame), and its cost charges the shape
// tests it can make there (engine/gen/pixels.js workCost) as well as the stamps it returns. So a call's run time is
// bounded by its cost, as gen-b8-safety.test.mjs holds B8's generators to theirs, with the same allowance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCall, runGenerator, GEN_LIMITS, STAMP_BOUNDS, SIZE_KEYS, generator, generators, createRegistry } from '../../engine/gen/index.js';
import { stampPixels, SHAPE_CAPS } from '../../engine/gen/args.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';

const BIG = { size: [640, 360], t: 0.5, loop: false };
// Milliseconds a unit of cost may take, with a wide margin for a loaded machine (as gen-b8-safety.test.mjs).
const MS_PER_COST = 0.1;
const msFor = (cost) => 30 + cost * MS_PER_COST;
/** The quickest of three runs (the first is a warm-up), so a busy machine does not fail a sound bound. */
function quickest(fn) {
  fn();
  let best = Infinity, out;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); out = fn(); best = Math.min(best, performance.now() - t0); }
  return [out, best];
}
const P = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// each behaviour small and at its biggest; the first three are the review's (scratchpad review-B12/cost.mjs)
const CALLS = [
  { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 2], width: 0.1, paints: ['a'] },
  { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 1.5], width: 64, paints: ['a', 'b'] },
  { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 320], width: 64, paints: ['a', 'b'] },
  { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 100], width: 64, push: 60, paints: ['a', 'b'] },
  { gen: 'starburst', v: 1, at: [15.5, 15.5], points: 6, r: [0, 9.5], width: 5.3, paints: ['a', 'b'] },
  { gen: 'shot.bar', v: 1, at: [320, 180], length: 1, thick: 1, paints: ['a', 'b', 'c', 'd'] },
  { gen: 'shot.bar', v: 1, at: [320, 180], length: 320, thick: 32, flicker: 16, beat: 1, paints: ['a', 'b', 'c', 'd'] },
  { gen: 'shot.bar', v: 1, at: [320, 180], length: 320, thick: 32, style: 'pulse', paints: ['a', 'b', 'c', 'd'] },
  { gen: 'shot.bar', v: 1, at: [320, 180], length: 320, thick: 32, style: 'needle', paints: ['a', 'b', 'c', 'd'] },
  { gen: 'glow', v: 1, at: [320, 180], r: 2, paints: ['a', 'b'] },
  { gen: 'glow', v: 1, at: [320, 180], r: 160, paints: P },
  { gen: 'ring', v: 1, at: [320, 180], r0: 1, r1: 2, thick: 1, paints: ['a'] },
  { gen: 'ring', v: 1, at: [320, 180], r0: 320, r1: 320, thick: 32, paints: P },
  { gen: 'ring', v: 1, at: [320, 180], r0: 10, r1: 320, thick: 32, squash: 2, seed: 3, paints: P },
  { gen: 'puffs', v: 1, at: [320, 180], count: 1, size: 0.5, paints: ['a', 'b'] },
  { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 24, lobes: 5, dist: 128, rise: 128, arc: 360, floor: 300, paints: P },
  { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 24, lobes: 5, dist: 0, rise: 0, shape: 'wispy', paints: P },
  { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 24, lobes: 5, dist: 128, rise: 0, shape: 'chunky', loop: true, paints: P },
  { gen: 'particles', v: 1, at: [320, 180], count: 1, size: 1, paints: ['a'] },
  { gen: 'particles', v: 1, at: [320, 180], count: 64, size: 16, dist: 256, arc: 360, paints: P, loop: false },
  { gen: 'streaks', v: 1, at: [320, 180], count: 1, length: 1, reach: 0, paints: ['a'] },
  { gen: 'streaks', v: 1, at: [320, 180], count: 16, length: 64, reach: 128, spread: 64, cycles: 8, paints: P },
];

test('every B12 behaviour, small and at its biggest, runs within its cost in the biggest frame', () => {
  const seen = new Set();
  for (const call of CALLS) {
    const c = checkCall(call);
    seen.add(call.gen);
    if (!c.ok) { assert.match(c.errors.join(' '), /over the budget/, `${call.gen}: refused only for its cost`); continue; }
    for (const ctx of [BIG, { ...BIG, t: 0.95 }, { ...BIG, t: 0.2, loop: true }]) {
      const [r, ms] = quickest(() => runGenerator(call, ctx));
      // a frame holds at most 8,192 stamp pixels (2.7): a behaviour painting more is refused when it runs, quickly
      if (!r.ok) assert.match(r.errors.join(' '), /stamp pixels, over the 8192/, `${call.gen}: ${r.errors.join('; ')}`);
      assert.ok(ms <= msFor(c.cost), `${call.gen} ${JSON.stringify(call).slice(28, 100)}: ${ms.toFixed(1)} ms for cost ${c.cost} (allowed ${msFor(c.cost).toFixed(1)})`);
    }
  }
  assert.deepEqual([...seen].sort(), ['glow', 'particles', 'puffs', 'ring', 'shot.bar', 'starburst', 'streaks']);
});

test('the review\'s cheap stars cost what they do: a tiny star is cheap and quick, a frame-wide one is charged its work', () => {
  const tiny = checkCall(CALLS[0]), wide = checkCall(CALLS[1]), huge = checkCall(CALLS[2]);
  assert.ok(tiny.ok && wide.ok, `${tiny.errors} ${wide.errors}`);
  // the tiny star works in a box a few pixels across, so it stays cheap and quick
  const [, ms] = quickest(() => runGenerator(CALLS[0], BIG));
  assert.ok(ms < 5, `a 32-spike star of radius 2 takes ${ms.toFixed(1)} ms (was 284 ms)`);
  // a star as wide as the frame costs many times a small one, whether or not it is accepted
  assert.ok(huge.cost > 20 * wide.cost, `${huge.cost} against ${wide.cost}`);
  // cost grows with what the spikes can reach and how many there are
  const base = { gen: 'starburst', v: 1, at: [320, 180], points: 8, r: [0, 40], width: 6, paints: ['a'] };
  assert.ok(checkCall({ ...base, points: 32 }).cost > checkCall(base).cost);
  assert.ok(checkCall({ ...base, r: [0, 120] }).cost > checkCall(base).cost);
  assert.ok(checkCall({ ...base, push: 80 }).cost > checkCall(base).cost);
});

test('a bar of light works in its own box: a short bar in a big frame is cheap and quick', () => {
  const [, ms] = quickest(() => runGenerator(CALLS[5], BIG));
  assert.ok(ms < 3, `a 1 px bar takes ${ms.toFixed(1)} ms (was 11 ms)`);
  assert.ok(checkCall(CALLS[6]).cost > checkCall(CALLS[5]).cost);
});

/** The review's hostile effect (scratchpad review-B12/hostile.mjs): N emitters of one call in a 640 x 360 frame. */
function hostile(call, N = 16, frames = 8) {
  return {
    format: 'loadout-sprite', version: 2, id: 'hostile-fx', name: 'Hostile', blurb: 'x', size: [640, 360], pivot: [320, 180], grounded: false,
    meta: { type: 'effect', role: 'effects/spark', view: 'none', themes: ['neutral'], gameTypes: ['arcade'], words: ['x'], license: 'draft' },
    palette: [{ id: 'spark', label: 'Spark', default: '#ffd060', material: 'fire' }],
    controls: [{ key: 'size', kind: 'range', label: 'Size', lo: 'a', hi: 'b', default: 0.5 }],
    body: { emitters: Array.from({ length: N }, (_, i) => ({ id: `e${i}`, ...call })) },
    clips: { a: { frames, fps: 8, loop: true } },
  };
}

test('a frame of 16 emitters cannot freeze the page: the review\'s hostile effect is quick, or refused quickly', () => {
  const calls = [
    { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, { from: 'size', map: [[0, 1.5], [1, 2]] }], width: 0.1, paints: ['spark'] },
    { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 1.5], width: 64, paints: ['spark'] },
    { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 320], width: 64, paints: ['spark'] },
    { gen: 'shot.bar', v: 1, at: [320, 180], length: 4, thick: 2, paints: ['spark', 'spark'] },
    { gen: 'shot.bar', v: 1, at: [320, 180], length: 320, thick: 32, paints: ['spark', 'spark'] },
    { gen: 'glow', v: 1, at: [320, 180], r: 160, paints: ['spark', 'spark', 'spark', 'spark'] },
    { gen: 'ring', v: 1, at: [320, 180], r0: 300, r1: 320, thick: 32, paints: ['spark', 'spark'] },
    { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 24, lobes: 5, dist: 0, rise: 0, paints: ['spark', 'spark'] },
  ];
  for (const call of calls) {
    const def = hostile(call);
    const v = validateSprite(def);
    const t0 = performance.now();
    const m = makeDataSprite(def);
    const made = performance.now() - t0;
    // a load draws (and checks) every frame: at most the budget's worth of time per frame
    assert.ok(made <= 8 * msFor(GEN_LIMITS.primitives), `${call.gen}: making it took ${made.toFixed(0)} ms (valid ${v.ok}; was 4.7 s)`);
    if (!m.ok) continue;
    const [, ms] = quickest(() => { try { return renderFrame(m.sprite, 'a', 3, defaultParams(m.sprite)); } catch (e) { return e; } });
    assert.ok(ms <= msFor(GEN_LIMITS.primitives), `${call.gen}: one frame took ${ms.toFixed(0)} ms (was 4.7 s)`);
  }
  // the review's exact case is accepted and now quick
  const ok = makeDataSprite(hostile(calls[0]));
  assert.ok(ok.ok, ok.errors.join('; '));
  const [, one] = quickest(() => renderFrame(ok.sprite, 'a', 0, defaultParams(ok.sprite)));
  assert.ok(one < 100, `one frame of 16 tiny stars took ${one.toFixed(0)} ms`);
});

// ---- B12b: priced once (the orchestrator's decision after three reviews) -------------------------------------------
// The second and third reviews found that pricing each emitter at every value its clip keys give (priceEmitKeys) and
// summing stamp pixels over every stretch between keys (sumEmitPixels) could run for 19.6 s on a 117 KB definition,
// and that its loop wrap-round disagreed with the runtime. Now an emitter is priced ONCE: its cost and its stamp-pixel
// bound at its declared (or bound) values, at amount 1, with no key read. A key may lower a size argument (SIZE_KEYS:
// the keyable arguments a behaviour's cost or bound reads) but never raise it past what the emitter sets, so no key can
// raise what was charged; the other keyable arguments (turns, cuts, cooling, the bolt's beat) move freely, because the
// cost and the bound do not read them. Every emitter counts as on in every frame, apart from `when` and `clip`.

/** The review's keyed effect: N emitters declared `call`, each keyed to `key` by the clip's one key. */
function keyedHostile(call, key, N = 16) {
  const def = hostile(call, N);
  def.controls = [];
  def.clips.a.keys = [{ t: 0, emit: Object.fromEntries(Array.from({ length: N }, (_, i) => [`e${i}`, key])) }];
  return def;
}
const S8 = ['spark', 'spark', 'spark', 'spark', 'spark', 'spark', 'spark', 'spark'];
// [name, declared call, key]: each key sets a size argument above what the emitter declares (scratchpad review-B12r
// keyed.mjs and keyed2.mjs, and the third review's twoclip.mjs, whose glow is keyed in scale only)
const KEYED = [
  ['puffs floor', { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 0.5, lobes: 5, dist: 0, rise: 0, arc: 360, floor: 300, paints: ['spark', 'spark'] }, { size: 24, dist: 128, rise: 128, arc: 360 }],
  ['puffs', { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 0.5, lobes: 5, dist: 0, rise: 0, paints: ['spark', 'spark'] }, { size: 24, dist: 128, rise: 128 }],
  ['ring', { gen: 'ring', v: 1, at: [320, 180], r0: 300, r1: 320, thick: 1, squash: 0.1, paints: ['spark', 'spark'] }, { thick: 32, squash: 2 }],
  ['star', { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 2], width: 0.1, paints: ['spark'] }, { push: 300, width: 64 }],
  ['star cut', { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 2], width: 0.1, paints: ['spark'] }, { push: 150, width: 64 }],
  ['glow', { gen: 'glow', v: 1, at: [320, 180], r: 1, paints: S8 }, { r: 160, scale: 4 }],
  ['glow small', { gen: 'glow', v: 1, at: [320, 180], r: 1, paints: S8 }, { r: 40, scale: 1 }],
  ['glow scale', { gen: 'glow', v: 1, at: [320, 180], r: 40, paints: S8 }, { scale: 4 }],
  ['particles', { gen: 'particles', v: 1, at: [320, 180], count: 64, size: 1, dist: 0, paints: ['spark'] }, { size: 16, dist: 256, spread: 64 }],
  ['streaks', { gen: 'streaks', v: 1, at: [320, 180], count: 16, length: 1, reach: 0, spread: 0, cycles: 8, paints: ['spark'] }, { length: 64, reach: 128, spread: 64 }],
];

test('a key cannot raise a size argument past what the emitter sets: the review\'s keyed effects are refused, quickly, naming the argument', () => {
  for (const [name, call, key] of KEYED) {
    const def = keyedHostile(call, key);
    const t0 = performance.now();
    const v = validateSprite(def);
    const m = makeDataSprite(def);
    const ms = performance.now() - t0;
    assert.equal(v.ok, false, `${name}: keyed above its declared size, yet valid`);
    assert.match(v.errors.join(' '), /emit "e\d+": a key sets \w+ to [\d.]+, above the [\d.]+ the emitter sets/, `${name}: ${v.errors.slice(0, 2).join('; ')}`);
    assert.equal(m.ok, false, `${name}: made`);
    assert.ok(ms < 1000, `${name}: checking and making took ${ms.toFixed(0)} ms (was 2,882 ms)`);
  }
});

test('keys never change what an emitter is charged: a key below the declared size, or of an argument the price does not read, costs nothing more', () => {
  const call = { gen: 'glow', v: 1, at: [320, 180], r: 20, paints: ['spark', 'spark'] };
  const plain = validateSprite(keyedHostile(call, {}, 1));
  for (const key of [{ r: 2 }, { r: 20, scale: 0.5 }, { cool: 7 }, { amount: 1 }, { amount: 0 }]) {
    const v = validateSprite(keyedHostile(call, key, 1));
    assert.deepEqual(v.errors, [], JSON.stringify(key));
    assert.equal(v.cost.expanded, plain.cost.expanded, `${JSON.stringify(key)}: priced as declared`);
  }
  // a size argument bound to a control is priced at its binding's largest; a key may go up to that
  const bound = keyedHostile({ ...call, r: { from: 'size', map: [[0, 4], [1, 30]] } }, { r: 30 }, 1);
  bound.controls = [{ key: 'size', kind: 'range', label: 'Size', lo: 'a', hi: 'b', default: 0 }];
  assert.deepEqual(validateSprite(bound).errors, []);
  bound.clips.a.keys[0].emit.e0.r = 31;
  assert.match(validateSprite(bound).errors.join(' '), /a key sets r to 31, above the 30 the emitter sets/);
});

/** A behaviour's keyable arguments its price does not read (the keyable ones less SIZE_KEYS). */
const freeKeys = (key) => generator(...key.split('@').map((x, i) => (i ? Number(x) : x))).keyable.filter((f) => !SIZE_KEYS[key].includes(f));

test('every behaviour names its size keys (SIZE_KEYS), and its cost and stamp bound read none of its other keyable arguments', () => {
  const r = rng(7);
  for (const g of generators().filter((x) => x.family === 'fx')) {
    assert.ok(Array.isArray(SIZE_KEYS[g.key]), `${g.key}: no SIZE_KEYS entry`);
    assert.equal(typeof STAMP_BOUNDS[g.key], 'function', `${g.key}: no STAMP_BOUNDS entry`);
    assert.ok(SIZE_KEYS[g.key].every((f) => g.keyable.includes(f)), `${g.key}: size keys are keyable arguments`);
    const make = SAMPLE[g.id];
    if (!make) continue;
    for (let i = 0; i < 60; i++) {
      const call = { gen: g.id, v: g.v, at: [320.5, 180.5], ...make(r) };
      const base = filled(call);
      const price = (a) => [g.cost(Object.freeze(a), { costOf: () => 1 }), STAMP_BOUNDS[g.key](a, [640, 360]), STAMP_BOUNDS[g.key](a, [48, 48])];
      const want = price(base);
      for (const f of freeKeys(g.key)) for (const v of [g.args[f].lo ?? g.args[f].min, g.args[f].hi ?? g.args[f].max]) {
        if (!Number.isFinite(v)) continue;
        assert.deepEqual(price({ ...base, [f]: v }), want, `${g.key}: ${f} = ${v} changes its price`);
      }
    }
  }
});

test('free keys at their extremes run within the cost of the call as declared, and within its stamp bound', () => {
  for (const call of CALLS) {
    const c = checkCall(call);
    if (!c.ok) continue;
    const key = `${call.gen}@1`, g = generator(call.gen, 1);
    for (const end of ['lo', 'hi']) {
      const keyed = { ...call };
      for (const f of freeKeys(key)) keyed[f] = g.args[f][end] ?? g.args[f][end === 'lo' ? 'min' : 'max'];
      for (const ctx of [BIG, { ...BIG, t: 0.95 }, { ...BIG, t: 0.2, loop: true }]) {
        const [out, ms] = quickest(() => runGenerator(keyed, ctx, { budget: Infinity }));
        assert.ok(ms <= msFor(c.cost), `${call.gen} free keys at ${end}: ${ms.toFixed(1)} ms for cost ${c.cost}`);
        const px = out.ok ? stampPixels(out.primitives) : Number((/returned (\d+) stamp pixels/.exec(out.errors.join(' ')) ?? [])[1]);
        assert.ok(Number.isFinite(px), `${call.gen}: ${out.errors.join('; ')}`);
        assert.ok(px <= STAMP_BOUNDS[key](filled(call), BIG.size), `${call.gen} free keys at ${end}: ${px} stamp pixels over its bound`);
      }
    }
  }
});

test('the emitters layout itself refuses a frame whose keyed calls cost more than the budget, before running them', async () => {
  const { emitters: layout } = await import('../../engine/gen/emitters.js');
  const registry = await import('../../engine/gen/index.js');
  const ctx = Object.freeze({ t: 0, frame: 0, frames: 2, loop: false, size: [640, 360], clip: 'a', direction: null });
  let ran = 0;
  const input = {
    kind: 'emitters', resolved: { palette: {}, clips: { a: { keys: [] } } }, generators: registry, warn: () => {},
    pose: { emit: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`e${i}`, { size: 24, dist: 128, rise: 128 }])) },
    body: { emitters: Array.from({ length: 16 }, (_, i) => ({ id: `e${i}`, ...KEYED[1][1], paints: ['a', 'b'] })) },
    expand: (items) => { ran += items.length; return { primitives: [], palette: {} }; },
    place: (prims) => prims, nodeFrames: () => new Map(), visible: (items) => items,
  };
  const t0 = performance.now();
  assert.throws(() => layout.run(input, ctx), /cost \d[\d,]* in all.*over the frame budget of 4,?000/);
  assert.equal(ran, 0, 'no behaviour ran');
  assert.ok(performance.now() - t0 < 500);
});

/** A small seeded random source (mulberry32), so the sampled calls are the same every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, lo, hi) => lo + (hi - lo) * r() ** 2;
const SAMPLE = {
  particles: (r) => ({ count: Math.round(pick(r, 1, 64)), size: pick(r, 0, 16), dist: pick(r, 0, 256), spread: pick(r, 0, 64), wobble: pick(r, 0, 32), gravity: pick(r, -128, 128), arc: 360 * r(), loop: r() < 0.5, paints: P.slice(0, 1 + Math.floor(r() * 8)) }),
  starburst: (r) => ({ points: Math.round(pick(r, 1, 32)), r: [pick(r, 0, 60), pick(r, 0, 320)], width: pick(r, 0, 64), push: pick(r, 0, 320), cut: pick(r, 0, 40), short: pick(r, 0, 40), turn: 360 * r(), twist: r(), paints: P.slice(0, 1 + Math.floor(r() * 2)) }),
  glow: (r) => ({ r: pick(r, 0, 160), scale: pick(r, 0, 4), cool: Math.floor(r() * 8), paints: P.slice(0, 1 + Math.floor(r() * 8)) }),
  ring: (r) => ({ r0: pick(r, 0, 320), r1: pick(r, 0, 320), thick: pick(r, 0, 32), squash: 0.1 + 1.9 * r(), seed: Math.floor(r() * 8), paints: P.slice(0, 1 + Math.floor(r() * 8)) }),
  streaks: (r) => ({ count: Math.round(pick(r, 1, 16)), length: pick(r, 1, 64), reach: pick(r, 0, 128), spread: pick(r, 0, 64), cycles: 1 + Math.floor(r() * 8), angle: 360 * r() - 180, paints: P.slice(0, 1 + Math.floor(r() * 8)) }),
  puffs: (r) => ({ count: Math.round(pick(r, 1, 16)), size: pick(r, 0.5, 24), lobes: 1 + Math.floor(r() * 5), dist: pick(r, 0, 128), rise: pick(r, 0, 128), arc: 360 * r(), floor: r() < 0.3 ? Math.floor(r() * 360) : -1, loop: r() < 0.5, shape: ['round', 'chunky', 'wispy'][Math.floor(r() * 3)], paints: P.slice(0, 1 + Math.floor(r() * 8)) }),
  'shot.bar': (r) => ({ length: pick(r, 1, 320), thick: pick(r, 1, 32), flicker: pick(r, 0, 16), beat: 2 * r() - 1, lead: pick(r, 0, 32), trail: r() < 0.5, style: ['bolt', 'pulse', 'needle', 'flat'][Math.floor(r() * 4)], paints: P.slice(0, 1 + Math.floor(r() * 4)) }),
  twinkle: (r) => ({ size: Math.floor(r() * 5), paint: 'a', core: 'b' }),
  'pickup.burst': (r) => ({ amount: r(), reach: pick(r, 3, 64), sparkle: r() < 0.7, paint: 'a', bright: 'b', core: 'c' }),
  chunks: (r) => ({ amount: r(), count: Math.round(pick(r, 1, 24)), size: pick(r, 0.5, 32), dist: pick(r, 0, 64), rise: pick(r, 0, 64), floor: Math.floor(r() * 360), paint: 'a' }),
};

/** A call's arguments with its generator's defaults filled, as the validator prices them. */
function filled(call) {
  const g = generator(call.gen, call.v), out = {};
  for (const [k, t] of Object.entries(g.args)) out[k] = call[k] ?? t.default;
  return out;
}

test('each behaviour\'s stamp bound (STAMP_BOUNDS) holds: no run returns more stamp pixels than its bound says (sampled calls, every fx generator)', () => {
  const r = rng(12);
  let over = 0, under = 0;
  for (const [gen, make] of Object.entries(SAMPLE)) {
    const key = `${gen}@1`;
    assert.equal(typeof STAMP_BOUNDS[key], 'function', gen);
    for (let i = 0; i < 70; i++) {
      const call = { gen, v: 1, at: [Math.round(40 + 560 * r()) + 0.5, Math.round(20 + 320 * r()) + 0.5], ...make(r) };
      if (!checkCall(call).ok) continue;
      for (const size of [[640, 360], [128, 96], [48, 48]]) {
        const at = size[0] < 640 ? [Math.min(call.at[0], size[0] / 2), Math.min(call.at[1], size[1] / 2)] : call.at;
        const bound = STAMP_BOUNDS[key](filled({ ...call, at }), size);
        if (bound > SHAPE_CAPS.stampPixels) over++; else under++;
        for (const t of [0, 0.3, 0.6, 1]) {
          const out = runGenerator({ ...call, at }, { size, t, loop: false });
          const px = out.ok ? stampPixels(out.primitives) : Number((/returned (\d+) stamp pixels/.exec(out.errors.join(' ')) ?? [])[1]);
          assert.ok(Number.isFinite(px), `${gen}: ${out.errors.join('; ')}`);
          assert.ok(px <= bound, `${gen} ${JSON.stringify(call)} in ${size} at t ${t}: ${px} stamp pixels, bound ${bound}`);
        }
      }
    }
  }
  assert.ok(over > 30 && under > 150, `${over} over the cap, ${under} within it`);
});

test('each behaviour at its biggest arguments: its cost bounds its run time and its stamp bound its stamps, in the biggest frame', () => {
  for (const g of generators().filter((x) => x.family === 'fx')) {
    // every number at the top of its range, every flag on and off, every word; paints as many as allowed
    const top = { gen: g.id, v: g.v };
    for (const [k, t] of Object.entries(g.args)) {
      if (k === 'at') top.at = [320.5, 180.5];
      else if (t.type === 'paints' || t.kind === 'paints') top[k] = P.slice(0, t.n ?? 8);
      else if (t.type === 'paint' || t.kind === 'paint') top[k] = 'a';
      else if (t.type === 'point' || t.kind === 'point') top[k] = [t.hi ?? t.max ?? 64, t.hi ?? t.max ?? 64];
      else if (Number.isFinite(t.hi ?? t.max)) top[k] = t.hi ?? t.max;
    }
    const variants = [top];
    for (const [k, t] of Object.entries(g.args)) {
      if (Array.isArray(t.options)) variants.push(...t.options.map((o) => ({ ...top, [k]: o })));
      if ((t.type ?? t.kind) === 'flag') variants.push({ ...top, [k]: false }, { ...top, [k]: true });
    }
    for (const call of variants) {
      const c = checkCall(call, { budget: Infinity });
      assert.ok(Number.isFinite(c.cost), `${g.key}: ${c.errors.join('; ')}`);
      for (const ctx of [BIG, { ...BIG, t: 1 }, { ...BIG, t: 0.2, loop: true }]) {
        const [out, ms] = quickest(() => runGenerator(call, ctx, { budget: Infinity }));
        assert.ok(ms <= msFor(c.cost), `${g.key} at its biggest: ${ms.toFixed(1)} ms for cost ${c.cost}`);
        const px = out.ok ? stampPixels(out.primitives) : Number((/returned (\d+) stamp pixels/.exec(out.errors.join(' ')) ?? [])[1]);
        assert.ok(Number.isFinite(px), `${g.key}: ${out.errors.join('; ')}`);
        assert.ok(px <= STAMP_BOUNDS[g.key](filled(call), BIG.size), `${g.key} at its biggest: ${px} stamp pixels over its bound`);
      }
    }
  }
});

test('a definition whose one behaviour would paint more than a frame holds is refused by the validator, not when it loads', () => {
  const one = (size, r) => ({
    ...hostile({ gen: 'glow', v: 1, at: [size[0] / 2, size[1] / 2], r, paints: ['spark', 'spark'] }, 1),
    size, pivot: [size[0] / 2, size[1] / 2], controls: [],
  });
  for (const [size, r] of [[[640, 360], 160], [[128, 96], 60]]) {
    const v = validateSprite(one(size, r));
    assert.equal(v.ok, false, `glow r ${r} in ${size}`);
    assert.match(v.errors.join(' '), /Emitter "e0": glow@1 can paint up to [\d,]+ stamp pixels in this \d+ x \d+ frame.*8,192/);
  }
  // one that fits validates and loads; so does the biggest glow in a frame too small to hold more than the cap
  for (const [size, r] of [[[128, 96], 40], [[64, 64], 160]]) {
    const fits = one(size, r);
    assert.deepEqual(validateSprite(fits).errors, [], `glow r ${r} in ${size}`);
    const m = makeDataSprite(fits);
    assert.ok(m.ok, m.errors?.join('; '));
  }
});

test('the emitters are summed as if all on, apart from `when` and `clip`: amounts are not read', () => {
  // the review's sixteen glows of r 40: each fits, all sixteen together do not
  const all = hostile({ gen: 'glow', v: 1, at: [320, 180], r: 40, paints: S8 });
  all.controls = [];
  assert.match(validateSprite(all).errors.join(' '), /The emitters can paint up to [\d,]+ stamp pixels in one frame.*8,192/);
  // two big glows keyed on one after the other: amounts are not read, so they count as on together and are refused
  const glow = { gen: 'glow', v: 1, at: [64, 48], r: 30, paints: ['spark', 'spark'] };
  const turn = { ...hostile(glow, 2), size: [128, 96], pivot: [64, 48], controls: [] };
  turn.clips = { a: { frames: 4, fps: 8, loop: false, keys: [{ t: 0, emit: { e0: { amount: 1 }, e1: { amount: 0 } } }, { t: 1, emit: { e0: { amount: 0 }, e1: { amount: 1 } } }] } };
  assert.match(validateSprite(turn).errors.join(' '), /The emitters can paint up to/);
  // the third review's loop wrap-round (wrap.mjs): two glows of r 42 in a 200 x 200 frame, refused when checked
  const wrap = { ...hostile({ gen: 'glow', v: 1, at: [100, 100], r: 42, paints: ['spark', 'spark'] }, 2), size: [200, 200], pivot: [100, 100], controls: [] };
  wrap.clips = { a: { frames: 10, fps: 8, loop: true, keys: [{ t: 0, emit: { e1: { amount: 0 } } }, { t: 0.2, emit: { e1: { amount: 1 } } }, { t: 0.4, emit: { e1: { amount: 0 } } }, { t: 0.5, emit: { e0: { amount: 0 } } }, { t: 0.9, emit: { e0: { amount: 1 } } }] } };
  assert.match(validateSprite(wrap).errors.join(' '), /The emitters can paint up to/);
  // ones that a choice control's `when` keeps apart are not summed: each style shows one glow
  const styled = { ...hostile(glow, 2), size: [128, 96], pivot: [64, 48] };
  styled.controls = [{ key: 'style', kind: 'choice', label: 'Style', options: ['a', 'b'], default: 'a' }];
  styled.body.emitters[0].when = { style: ['a'] };
  styled.body.emitters[1].when = { style: ['b'] };
  assert.deepEqual(validateSprite(styled).errors, []);
  const m = makeDataSprite(styled);
  assert.ok(m.ok, m.errors?.join('; '));
  // nor are ones that draw in different clips
  const clipped = { ...hostile(glow, 2), size: [128, 96], pivot: [64, 48], controls: [] };
  clipped.clips = { a: { frames: 2, fps: 8, loop: true }, b: { frames: 2, fps: 8, loop: true } };
  clipped.body.emitters[0].clip = ['a'];
  clipped.body.emitters[1].clip = ['b'];
  assert.deepEqual(validateSprite(clipped).errors, []);
  // both in one clip: summed
  clipped.body.emitters[1].clip = ['a', 'b'];
  assert.match(validateSprite(clipped).errors.join(' '), /The emitters can paint up to [\d,]+ stamp pixels in one frame \(in clip "a"/);
  // whens that can hold together are summed (the fourth review's probe3.mjs): each pair is refused, 8,450 stamp pixels
  const whens = (w0, w1) => {
    const d = { ...hostile(glow, 2), size: [128, 96], pivot: [64, 48] };
    d.controls = [{ key: 'style', kind: 'choice', label: 'Style', options: ['a', 'b', 'c'], default: 'a' }];
    if (JSON.stringify([w0, w1]).includes('"k"')) d.controls.push({ key: 'k', kind: 'choice', label: 'K', options: ['x', 'y'], default: 'x' });
    d.body.emitters[0].when = w0;
    d.body.emitters[1].when = w1;
    return validateSprite(d).errors.join(' ');
  };
  for (const [name, w0, w1] of [
    ['both hold at style a', { style: ['a'] }, { style: ['a', 'b'] }],
    ['one of the alternatives holds with the other', [{ style: ['a'] }, { k: ['y'] }], { style: ['b'] }],
    ['whens on different controls', { style: ['a'] }, { k: ['y'] }],
  ]) assert.match(whens(w0, w1), /The emitters can paint up to 8,450 stamp pixels in one frame/, name);
  // and kept apart they are not
  assert.equal(whens({ style: ['a'] }, { style: ['b'] }), '');
  assert.equal(whens([{ style: ['a'], k: ['x'] }], [{ style: ['a'], k: ['y'] }, { style: ['b', 'c'] }]), '');
});

test('a point argument bound to a control is priced at its largest: a picked or bound starburst r cannot slip under the budget (fourth review)', () => {
  const STYLE = { key: 'style', kind: 'choice', label: 'Style', options: ['a', 'b'], default: 'a' };
  const SIZE = { key: 'size', kind: 'range', label: 'Size', lo: 'a', hi: 'b', default: 0 };
  // only the controls a call binds (an unused control is an error of its own, which would hide the one tested)
  const def = (call, N, body) => {
    const d = { ...hostile(call, N), controls: [] };
    const j = JSON.stringify(call);
    if (j.includes('"from":"style"')) d.controls.push(STYLE);
    if (j.includes('"from":"size"')) d.controls.push(j.includes('"map"') ? SIZE : { ...SIZE, min: 0, max: 320 });
    if (body === 'pictures') d.body = { pictures: { emitters: d.body.emitters } };
    return d;
  };
  const star = (r, width = 64) => ({ gen: 'starburst', v: 1, at: [320, 180], points: 32, r, width, paints: ['spark', 'spark'] });
  const OVER = /over the budget|stamp pixels/;
  const literal = validateSprite(def(star([0, 320]), 1));
  assert.match(literal.errors.join(' '), OVER);
  for (const [name, r] of [
    ['pick', [0, { from: 'style', pick: { a: 2, b: 320 } }]],
    ['map', [0, { from: 'size', map: [[0, 2], [1, 320]] }]],
    ['map rounded up', [0, { from: 'size', map: [[0, 2], [1, 319.6]], round: 'px' }]],
    ['the control itself', [0, { from: 'size' }]],
  ]) {
    for (const body of ['emitters', 'pictures']) {
      for (const N of [1, 16]) {
        const d = def(star(r), N, body);
        const t0 = performance.now();
        const v = validateSprite(d);
        const m = makeDataSprite(d);
        const ms = performance.now() - t0;
        assert.equal(v.ok, false, `${name}, ${body} body, ${N}: valid at cost ${v.cost?.expanded}`);
        assert.match(v.errors.join(' '), OVER, `${name}, ${body}, ${N}: refused for something else: ${v.errors.slice(0, 2).join('; ')}`);
        assert.equal(v.cost.expanded, N * literal.cost.expanded, `${name}, ${body}, ${N}: priced as r [0, 320]`);
        assert.equal(m.ok, false, `${name}, ${body} body, ${N}: made`);
        assert.ok(ms < 1000, `${name}, ${body}, ${N}: checking and making took ${ms.toFixed(0)} ms`);
      }
    }
  }
  // the review's sixteen narrow stars (width 10 to 14), whose style b ran 349 ms a frame in a pictures body: refused
  for (const width of [10, 14]) for (const body of ['emitters', 'pictures']) {
    const v = validateSprite(def(star([0, { from: 'style', pick: { a: 2, b: 320 } }], width), 16, body));
    assert.equal(v.ok, false, `width ${width}, ${body}`);
    assert.match(v.errors.join(' '), OVER);
  }
  // a small picked star is priced at its larger pick and still fits
  const priced = validateSprite(def(star([0, { from: 'style', pick: { a: 2, b: 6 } }], 4), 1));
  assert.deepEqual(priced.errors, []);
  assert.equal(priced.cost.expanded, validateSprite(def(star([0, 6], 4), 1)).cost.expanded, 'priced as r [0, 6]');
  // a map is priced at its largest output after rounding: 15.5 rounds to 16, which costs more than 15.5
  const at = (r) => validateSprite(def(star(r, 4), 1)).cost.expanded;
  assert.ok(at([0, 16]) > at([0, 15.5]), 'the probe below needs a size where rounding changes the cost');
  assert.equal(at([0, { from: 'size', map: [[0, 2], [1, 15.5]], round: 'px' }]), at([0, 16]), 'priced as r [0, 16]');
  assert.equal(at([0, { from: 'size', map: [[0, 2], [1, 15.5]] }]), at([0, 15.5]), 'priced as r [0, 15.5]');
});

test('checking the emitters is a fixed small sum: the third review\'s slow definition (whens on ten controls, many clips of many keys) checks quickly', () => {
  const def = hostile({ gen: 'glow', v: 1, at: [320, 180], r: 1, paints: ['spark', 'spark'] }, 16, 8);
  def.controls = Array.from({ length: 10 }, (_, i) => ({ key: `c${i}`, kind: 'choice', label: `C${i}`, options: ['a', 'b', 'c', 'd'], default: 'a' }));
  def.body.emitters.forEach((e, i) => { e.when = { [`c${i % 10}`]: ['a', 'b'] }; });
  def.clips = {};
  for (let c = 0; c < 64; c++) def.clips[`k${c}`] = { frames: 4, fps: 8, loop: true, keys: Array.from({ length: 30 }, (_, j) => ({ t: j / 30, emit: { [`e${j % 16}`]: { amount: j % 2 } } })) };
  const bytes = JSON.stringify(def).length;
  assert.ok(bytes < 128 * 1024, `${bytes} bytes`);
  const t0 = performance.now();
  const v = validateSprite(def);
  const ms = performance.now() - t0;
  assert.deepEqual(v.errors, []);
  assert.ok(ms < 1500, `checking took ${ms.toFixed(0)} ms (sumEmitPixels took 19.6 s on the review's)`);
});

test('an emitter whose generator has no stamp bound is refused: a new behaviour cannot slip past the frame\'s stamp cap', () => {
  const reg = createRegistry();
  reg.defineGenerator({ id: 'blip', v: 1, family: 'fx', about: 'One stamp.', args: { at: generator('glow', 1).args.at }, cost: () => 1, run: (a) => [{ kind: 'stamp', at: a.at, rows: ['a'], key: { a: 'spark' } }] });
  const def = hostile({ gen: 'blip', v: 1, at: [3, 3] }, 1);
  def.controls = [];
  // a registry with a table of bounds (as the site's) must bound every behaviour it names as an emitter
  const v = validateSprite(def, { generators: { generator: reg.generator, generators: reg.generators, STAMP_BOUNDS: {} } });
  assert.match(v.errors.join(' '), /Emitter "e0": blip@1 has no stamp bound/);
  // the site's own behaviours all have one (the test above); a test's own registry with no table is not bounded
  assert.doesNotMatch(validateSprite(def, { generators: reg }).errors.join(' '), /stamp bound/);
});

test('each behaviour\'s work is in its cost: heavy calls run within their cost with no constant allowance (tolerant of a loaded machine)', () => {
  // calls whose work (shape tests) is far more than the tiles they return: a cost of tiles alone would be a few units.
  // Timed as the quickest of five runs, against 0.25 ms a unit of cost with a 6 ms floor: several times what an idle
  // machine needs, and still under what a cost of tiles alone would allow for each of them
  const HEAVY = [
    { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 24, lobes: 5, dist: 0, rise: 0, paints: P },
    { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 24, lobes: 5, dist: 0, rise: 0, shape: 'wispy', paints: P },
    { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 100], width: 20, paints: ['a', 'b'] },
    { gen: 'ring', v: 1, at: [320, 180], r0: 4, r1: 120, thick: 32, squash: 1, paints: P },
    { gen: 'glow', v: 1, at: [320, 180], r: 120, paints: P },
    { gen: 'shot.bar', v: 1, at: [320, 180], length: 320, thick: 32, style: 'pulse', paints: ['a', 'b', 'c', 'd'] },
  ];
  for (const call of HEAVY) {
    const c = checkCall(call, { budget: Infinity });
    let worst = 0;
    for (const t of [0, 0.5, 1]) {
      runGenerator(call, { size: [640, 360], t, loop: false }, { budget: Infinity });
      let best = Infinity;
      for (let i = 0; i < 5; i++) { const t0 = performance.now(); runGenerator(call, { size: [640, 360], t, loop: false }, { budget: Infinity }); best = Math.min(best, performance.now() - t0); }
      worst = Math.max(worst, best);
    }
    assert.ok(worst <= Math.max(6, c.cost * 0.25), `${call.gen} ${JSON.stringify(call).slice(28, 110)}: ${worst.toFixed(2)} ms for cost ${c.cost}`);
  }
  // and with no clock at all: what only adds work (more paints to test, more lobes, more spikes, wider spikes in the
  // same box) costs more, though the box and so the tiles it can return are the same; a cost of tiles alone would not
  const more = (a, b) => { const x = checkCall(a, { budget: Infinity }).cost, y = checkCall(b, { budget: Infinity }).cost; assert.ok(y > x, `${JSON.stringify(b).slice(0, 90)}: ${y} is not more than ${x}`); };
  more({ gen: 'glow', v: 1, at: [320, 180], r: 60, paints: ['a', 'b'] }, { gen: 'glow', v: 1, at: [320, 180], r: 60, paints: P });
  more({ gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 12, lobes: 1, paints: P }, { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 12, lobes: 5, paints: P });
  more({ gen: 'puffs', v: 1, at: [320, 180], count: 2, size: 12, paints: P }, { gen: 'puffs', v: 1, at: [320, 180], count: 16, size: 12, paints: P });
  more({ gen: 'starburst', v: 1, at: [320, 180], points: 4, r: [0, 60], width: 4, paints: ['a'] }, { gen: 'starburst', v: 1, at: [320, 180], points: 32, r: [0, 60], width: 4, paints: ['a'] });
});
