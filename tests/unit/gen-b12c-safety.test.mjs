// Safety of B12c's effect behaviours (docs/data-sprites.md 3.4 rule 2; Contract 15 rule 6), held to the rules B12b set
// for B12's (tests/unit/gen-b12-safety.test.mjs, which also runs over every fx generator): each behaviour's cost bounds
// its run time and its stamp bound (engine/gen/index.js STAMP_BOUNDS) the stamp pixels it returns, at its smallest and
// biggest arguments, in the biggest frame; its SIZE_KEYS are the keyable arguments its price reads, and its other
// keyable arguments change neither its cost nor its bound, so keys cannot raise what the validator charged; a key that
// sets a size argument above what the emitter sets is refused; sixteen emitters of one behaviour in a 640 x 360 frame
// cannot freeze the page. Timings are the quickest of several runs against a wide allowance, stretched by the machine's
// load above its cores (busy below), so a loaded machine does not fail a sound bound.
import test from 'node:test';
import os from 'node:os';
import assert from 'node:assert/strict';
import { checkCall, runGenerator, GEN_LIMITS, STAMP_BOUNDS, SIZE_KEYS, generator } from '../../engine/gen/index.js';
import { stampPixels, SHAPE_CAPS } from '../../engine/gen/args.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';

const BIG = { size: [640, 360], t: 0.5, loop: false };
const MS_PER_COST = 0.1;
// how much slower than an idle machine this one runs now: 1 while the load is under the cores, else load / cores, read
// when each timing is judged (review B12c: a full run at a load of about 100 on 10 cores timed mist at 1.4 times its
// allowance; on an idle machine the allowance is the same as before)
const busy = () => Math.max(1, os.loadavg()[0] / Math.max(1, os.cpus().length));
const msFor = (cost) => (30 + cost * MS_PER_COST) * busy();
function quickest(fn, n = 3) {
  fn();
  let best = Infinity, out;
  for (let i = 0; i < n; i++) { const t0 = performance.now(); out = fn(); best = Math.min(best, performance.now() - t0); }
  return [out, best];
}
const P = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const KEYS = ['twinkle@2', 'sparkles@1', 'rays@1', 'beam@1', 'scorch@1', 'shards@1', 'smoke@1', 'leaves@1', 'flame@1', 'embers@1', 'spark.ring@1', 'blast.ball@1', 'puff.ring@1', 'bolt@1', 'swirl@1', 'motes@1', 'fall.field@1', 'trail.puffs@1', 'mist@1', 'ripples@1'];
const entryOf = (key) => { const [id, v] = key.split('@'); return generator(id, Number(v)); };
const pixelsOf = (out) => (out.ok ? stampPixels(out.primitives) : Number((/returned (\d+) stamp pixels/.exec(out.errors.join(' ')) ?? [])[1]));

/** A call's arguments with its generator's defaults filled, as the validator prices them. */
function filled(call) {
  const g = generator(call.gen, call.v), out = {};
  for (const [k, t] of Object.entries(g.args)) out[k] = call[k] ?? t.default;
  return out;
}

/** A small seeded random source (mulberry32), so the sampled calls are the same every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, lo, hi) => lo + (hi - lo) * r() ** 2;
const any = (r, list) => list[Math.floor(r() * list.length)];
const some = (r, n = 8) => P.slice(0, 1 + Math.floor(r() * n));

/** Sampled calls of each B12c behaviour (without `at`), small numbers more often than big. */
const SAMPLE = {
  twinkle: (r) => ({ size: Math.floor(r() * 5), paint: 'a', core: 'b' }),
  sparkles: (r) => ({ count: Math.round(pick(r, 0, 64)), seed: Math.floor(r() * 50), cycles: 1 + Math.floor(r() * 8), big: r() < 0.6, reach: [pick(r, 0, 320), pick(r, 0, 180)], paints: some(r), core: 'h' }),
  rays: (r) => ({ count: Math.round(pick(r, 1, 32)), angle: 360 * r() - 180, arc: 360 * r(), r0: pick(r, 0, 320), r1: pick(r, 0, 320), dash: pick(r, 1, 64), gap: pick(r, 0, 64), phase: 8 * r(), cycles: Math.floor(r() * 9), seed: Math.floor(r() * 50), paints: some(r) }),
  beam: (r) => ({ width: pick(r, 1, 64), height: pick(r, 0, 360), dash: pick(r, 1, 64), gap: pick(r, 0, 64), solid: r(), phase: 8 * r(), cycles: Math.floor(r() * 9), seed: Math.floor(r() * 50), paints: some(r) }),
  scorch: (r) => ({ r: [pick(r, 0, 160), pick(r, 0, 160)], spread: r(), start: r(), hole: r(), gaps: r(), embers: Math.round(pick(r, 0, 32)), heat: r(), seed: Math.floor(r() * 50), paint: 'a', paints: some(r) }),
  shards: (r) => ({ count: Math.round(pick(r, 0, 32)), seed: Math.floor(r() * 50), dist: pick(r, 0, 256), gravity: pick(r, -128, 128), size: pick(r, 0, 32), angle: 360 * r(), arc: 360 * r(), spin: 8 * r(), paint: 'a' }),
  smoke: (r) => ({ count: Math.round(pick(r, 1, 16)), seed: Math.floor(r() * 50), loop: r() < 0.5, cycles: 1 + Math.floor(r() * 8), stagger: r(), rise: pick(r, 0, 128), drift: pick(r, -64, 64), size: pick(r, 0, 24), paint: 'a' }),
  leaves: (r) => ({ count: Math.round(pick(r, 1, 16)), seed: Math.floor(r() * 50), dist: pick(r, 0, 128), gravity: pick(r, -64, 128), size: pick(r, 1, 24), paints: some(r), rim: r() < 0.5 ? 'clear' : 'h' }),
  flame: (r) => ({ head: pick(r, 0, 64), angle: 360 * r() - 180, length: pick(r, 0, 128), width: pick(r, 0, 32), sway: pick(r, 0, 16), cycles: 1 + Math.floor(r() * 8), heat: r(), tongues: 1 + Math.floor(r() * 9), fan: 120 * r() - 60, spread: pick(r, 0, 64), shorten: r(), slim: r(), paints: P.slice(0, 2 + Math.floor(r() * 7)) }),
  embers: (r) => ({ count: Math.round(pick(r, 0, 64)), r0: pick(r, 0, 320), r1: pick(r, 0, 320), size: pick(r, 0, 8), hold: r(), tail: pick(r, 0, 16), gravity: pick(r, -128, 128), turn: 360 * r(), seed: Math.floor(r() * 50), paints: some(r) }),
  'spark.ring': (r) => ({ count: Math.round(pick(r, 1, 32)), r0: pick(r, 0, 160), r1: pick(r, 0, 160), rise: pick(r, 0, 128), squash: 0.1 + 1.9 * r(), style: any(r, ['plus', 'diamond', 'dot']), reach: 1 + Math.floor(r() * 4), turn: 360 * r(), full: r() < 0.5, seed: Math.floor(r() * 50), paints: some(r) }),
  'blast.ball': (r) => ({ r: pick(r, 0, 160), hole: pick(r, 0, 160), bumps: Math.round(pick(r, 0, 32)), bump: 0.6 * r(), points: r() < 0.5, turn: 360 * r(), heat: r(), gaps: r(), seed: Math.floor(r() * 50), paints: some(r) }),
  'puff.ring': (r) => ({ count: Math.round(pick(r, 1, 16)), r0: pick(r, 0, 160), r1: pick(r, 0, 160), size: pick(r, 0, 32), last: pick(r, 0, 32), hold: r(), rise: pick(r, 0, 128), cool: r(), uneven: r(), apart: r() < 0.4, lobes: 1 + Math.floor(r() * 3), turn: 360 * r(), seed: Math.floor(r() * 50), paints: some(r) }),
  bolt: (r) => ({ length: pick(r, 0, 640), angle: 360 * r() - 180, kinks: Math.round(pick(r, 0, 16)), zigzag: pick(r, 0, 32), sway: pick(r, 0, 64), width: pick(r, 1, 16), lead: r(), fade: r() * 0.5, taper: r(), forks: Math.floor(r() * 9), forkLength: r(), forkAngle: 120 * r(), flicker: Math.floor(r() * 9), seed: Math.floor(r() * 50), paints: some(r) }),
  swirl: (r) => ({ count: Math.round(pick(r, 1, 32)), loop: r() < 0.5, cycles: 1 + Math.floor(r() * 8), stagger: r(), r0: pick(r, 0, 160), r1: pick(r, 0, 160), turns: 8 * r() - 4, squash: 0.1 + 1.9 * r(), size: 4 * r(), tail: Math.floor(r() * 9), seed: Math.floor(r() * 50), paints: some(r) }),
  motes: (r) => ({ count: Math.round(pick(r, 1, 32)), loop: r() < 0.5, cycles: 1 + Math.floor(r() * 8), stagger: r(), rise: pick(r, 0, 256), width: pick(r, 0, 256), size: pick(r, 1, 15), shape: any(r, ['dot', 'plus', 'leaf', 'star', 'heart']), sway: pick(r, 0, 32), seed: Math.floor(r() * 50), paints: some(r) }),
  'fall.field': (r) => ({ period: pick(r, 2, 640), cols: Math.round(pick(r, 1, 64)), rows: 1 + Math.floor(r() * 16), laps: 1 + Math.floor(r() * 8), slant: any(r, ['none', 'left', 'right']), sway: pick(r, 0, 16), swayCycles: Math.floor(r() * 9), turns: 1 + Math.floor(r() * 8), axis: any(r, ['down', 'right']), shape: any(r, ['dot', 'streak', 'flake', 'leaf', 'petal', 'seed', 'ash', 'grain']), size: 6 * r(), alt: any(r, ['none', 'dot', 'leaf', 'ash']), altSize: 6 * r(), paints: some(r), coreEvery: Math.floor(r() * 9), core: 'h', shift: [128 * r() - 64, 128 * r() - 64], seed: Math.floor(r() * 50) }),
  'trail.puffs': (r) => ({ count: Math.round(pick(r, 1, 16)), angle: 360 * r() - 180, dist: pick(r, 0, 128), size: pick(r, 0, 32), spread: pick(r, 0, 16), cycles: 1 + Math.floor(r() * 8), seed: Math.floor(r() * 50), paints: some(r, 2) }),
  mist: (r) => ({ width: pick(r, 0, 640), count: Math.round(pick(r, 1, 16)), dist: pick(r, 0, 128), angle: 360 * r() - 180, rise: pick(r, 0, 64), lift: pick(r, 0, 64), size: pick(r, 0.5, 24), shape: any(r, ['round', 'wispy', 'chunky']), lobes: 1 + Math.floor(r() * 4), stretch: 1 + 3 * r(), floor: r() < 0.4 ? Math.floor(r() * 360) : -1, cycles: 1 + Math.floor(r() * 8), seed: Math.floor(r() * 50), paints: some(r) }),
  ripples: (r) => ({ count: Math.floor(r() * 10), length: pick(r, 2, 32), stir: pick(r, 0, 16), margin: Math.floor(r() * 13), seed: Math.floor(r() * 50), under: r() < 0.5, paint: 'a', dark: r() < 0.5 ? 'clear' : 'b', tips: r() < 0.5 ? 'clear' : 'c' }),
};

/** The call at the top of every range: numbers at their highest, paints as many as allowed, `at` in the middle. */
function topCall(g) {
  const top = { gen: g.id, v: g.v };
  for (const [k, t] of Object.entries(g.args)) {
    if (k === 'at') top.at = [320.5, 180.5];
    else if (t.type === 'paints') top[k] = P.slice(0, t.n);
    else if (t.type === 'paint') top[k] = 'a';
    else if (t.type === 'point') top[k] = [t.hi, t.hi];
    else if (Number.isFinite(t.hi)) top[k] = t.hi;
  }
  return top;
}

test('every B12c behaviour, at its smallest, its defaults and its biggest, runs within its cost and its stamp bound in the biggest frame', () => {
  for (const key of KEYS) {
    const g = entryOf(key);
    assert.ok(g, `${key} is registered`);
    const top = topCall(g);
    const variants = [top, { ...SAMPLE[g.id](rng(1)), gen: g.id, v: g.v, at: [320.5, 180.5] }];
    for (const [k, t] of Object.entries(g.args)) {
      if (Array.isArray(t.values)) variants.push(...t.values.map((o) => ({ ...top, [k]: o })));
      if (t.type === 'flag') variants.push({ ...top, [k]: false }, { ...top, [k]: true });
    }
    for (const call of variants) {
      const c = checkCall(call, { budget: Infinity });
      assert.ok(Number.isFinite(c.cost), `${key}: ${c.errors.join('; ')}`);
      // a call over the frame budget is refused before it runs; it is still timed against its cost, the quicker of two
      // runs after a warm-up (it is slow by design; one run alone failed once under a load of about 100, review B12c)
      const runs = c.cost > GEN_LIMITS.primitives ? 2 : 3;
      for (const ctx of [BIG, { ...BIG, t: 0 }, { ...BIG, t: 1 }, { ...BIG, t: 0.2, loop: true }]) {
        const [out, ms] = quickest(() => runGenerator(call, ctx, { budget: Infinity }), runs);
        assert.ok(ms <= msFor(c.cost), `${key} ${JSON.stringify(call).slice(0, 120)}: ${ms.toFixed(1)} ms for cost ${c.cost} (allowed ${msFor(c.cost).toFixed(1)})`);
        const px = pixelsOf(out);
        assert.ok(Number.isFinite(px), `${key}: ${out.errors.join('; ')}`);
        assert.ok(px <= STAMP_BOUNDS[key](filled(call), BIG.size), `${key} ${JSON.stringify(call).slice(0, 120)}: ${px} stamp pixels over its bound ${STAMP_BOUNDS[key](filled(call), BIG.size)}`);
      }
    }
  }
});

test('each B12c behaviour\'s stamp bound holds for sampled calls in three frame sizes and four phases', () => {
  const r = rng(12);
  let checked = 0, under = 0;
  for (const key of KEYS) {
    const g = entryOf(key);
    for (let i = 0; i < 40; i++) {
      const call = { gen: g.id, v: g.v, at: [Math.round(40 + 560 * r()) + 0.5, Math.round(20 + 320 * r()) + 0.5], ...SAMPLE[g.id](r) };
      if (!checkCall(call).ok) continue;
      for (const size of [[640, 360], [128, 96], [48, 48]]) {
        const at = size[0] < 640 ? [Math.min(call.at[0], size[0] / 2), Math.min(call.at[1], size[1] / 2)] : call.at;
        const bound = STAMP_BOUNDS[key](filled({ ...call, at }), size);
        if (bound <= SHAPE_CAPS.stampPixels) under++;
        for (const [t, loop] of [[0, false], [0.3, false], [0.6, true], [1, false]]) {
          const out = runGenerator({ ...call, at }, { size, t, loop, frame: i % 5 });
          const px = pixelsOf(out);
          assert.ok(Number.isFinite(px), `${key}: ${out.errors.join('; ')}`);
          assert.ok(px <= bound, `${key} ${JSON.stringify(call)} in ${size} at t ${t}: ${px} stamp pixels, bound ${bound}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 3000 && under > 500, `${checked} runs checked, ${under} bounds within the cap`);
});

/** One end ('lo' or 'hi') of an argument's range as a value of its type: a number, or [end, end] for a point. */
const endOf = (t, end) => (!Number.isFinite(t[end]) ? undefined : t.type === 'point' ? [t[end], t[end]] : t[end]);

/** A behaviour's keyable arguments its price does not read (the keyable ones less SIZE_KEYS). */
const freeKeys = (key) => entryOf(key).keyable.filter((f) => !SIZE_KEYS[key].includes(f));

test('each B12c behaviour\'s size keys are keyable arguments, and its cost and bound read none of its other keyable arguments', () => {
  const r = rng(7);
  for (const key of KEYS) {
    const g = entryOf(key);
    assert.ok(SIZE_KEYS[key].every((f) => g.keyable.includes(f)), `${key}: size keys are keyable arguments`);
    for (let i = 0; i < 40; i++) {
      const base = filled({ gen: g.id, v: g.v, at: [320.5, 180.5], ...SAMPLE[g.id](r) });
      const price = (a) => [g.cost(Object.freeze(a), { costOf: () => 1 }), STAMP_BOUNDS[key](a, [640, 360]), STAMP_BOUNDS[key](a, [48, 48])];
      const want = price(base);
      for (const f of freeKeys(key)) for (const v of [endOf(g.args[f], 'lo'), endOf(g.args[f], 'hi')]) {
        if (v === undefined) continue;
        assert.deepEqual(price({ ...base, [f]: v }), want, `${key}: ${f} = ${JSON.stringify(v)} changes its price`);
      }
      // `at` never changes the price: every key may move it
      assert.deepEqual(price({ ...base, at: [-640, 640] }), want, `${key}: at changes its price`);
    }
  }
});

test('free keys at their extremes run within the cost of the call as declared, and within its stamp bound', () => {
  for (const key of KEYS) {
    const g = entryOf(key);
    for (const call of [topCall(g), { ...SAMPLE[g.id](rng(3)), gen: g.id, v: g.v, at: [320.5, 180.5] }]) {
      const c = checkCall(call, { budget: Infinity });
      for (const end of ['lo', 'hi']) {
        const keyed = { ...call };
        for (const f of freeKeys(key)) keyed[f] = endOf(g.args[f], end);
        for (const ctx of [BIG, { ...BIG, t: 0.95 }, { ...BIG, t: 0.2, loop: true }]) {
          const [out, ms] = quickest(() => runGenerator(keyed, ctx, { budget: Infinity }), c.cost > GEN_LIMITS.primitives ? 2 : 3);
          assert.ok(ms <= msFor(c.cost), `${key} free keys at ${end}: ${ms.toFixed(1)} ms for cost ${c.cost}`);
          const px = pixelsOf(out);
          assert.ok(Number.isFinite(px), `${key}: ${out.errors.join('; ')}`);
          assert.ok(px <= STAMP_BOUNDS[key](filled(call), BIG.size), `${key} free keys at ${end}: ${px} stamp pixels over its bound`);
        }
      }
    }
  }
});

/** N emitters of one call in a 640 x 360 frame. */
function hostile(call, N = 16, frames = 4) {
  return {
    format: 'loadout-sprite', version: 2, id: 'hostile-fx', name: 'Hostile', blurb: 'x', size: [640, 360], pivot: [320, 180], grounded: false,
    meta: { type: 'effect', role: 'effects/spark', view: 'none', themes: ['neutral'], gameTypes: ['arcade'], words: ['x'], license: 'draft' },
    palette: [{ id: 'spark', label: 'Spark', default: '#ffd060', material: 'fire' }],
    controls: [],
    body: { emitters: Array.from({ length: N }, (_, i) => ({ id: `e${i}`, ...call })) },
    clips: { a: { frames, fps: 8, loop: true } },
  };
}
/** Every paint of a call made the sprite's one slot. */
const sparkPaints = (call) => Object.fromEntries(Object.entries(call).map(([k, v]) => [k, v === 'a' || v === 'h' || v === 'b' || v === 'c' ? 'spark' : Array.isArray(v) && v.every((x) => P.includes(x)) ? v.map(() => 'spark') : v]));

test('sixteen emitters of a B12c behaviour at its biggest in the biggest frame are refused or drawn quickly', () => {
  let drawnOk = 0;
  for (const key of KEYS) for (const which of ['top', 'sample']) {
    const g = entryOf(key);
    const call = sparkPaints({ ...(which === 'top' ? topCall(g) : { ...SAMPLE[g.id](rng(9)), gen: g.id, v: g.v }), at: [320, 180] });
    const def = hostile(call);
    const t0 = performance.now();
    const v = validateSprite(def);
    const m = makeDataSprite(def);
    const made = performance.now() - t0;
    assert.ok(made <= 4 * msFor(GEN_LIMITS.primitives), `${key}: checking and making took ${made.toFixed(0)} ms (valid ${v.ok})`);
    if (!m.ok) continue;
    const [, ms] = quickest(() => { try { return renderFrame(m.sprite, 'a', 1, defaultParams(m.sprite)); } catch (e) { return e; } }, 2);
    assert.ok(ms <= msFor(GEN_LIMITS.primitives), `${key}: one frame took ${ms.toFixed(0)} ms`);
    drawnOk++;
  }
  assert.ok(drawnOk >= 5, `only ${drawnOk} of the hostile effects were accepted, so the test proves little about drawing`);
});

test('a key cannot raise a size argument of a B12c behaviour past what the emitter sets', () => {
  for (const key of KEYS) {
    const g = entryOf(key);
    const sizes = SIZE_KEYS[key];
    if (!sizes.length) continue;
    const f = sizes[0], t = g.args[f];
    const whole = t.type === 'count' ? Math.round : (v) => v;
    const low = whole(t.lo + (t.hi - t.lo) * 0.1), high = Math.max(low + 1, whole(t.lo + (t.hi - t.lo) * 0.3));
    const call = sparkPaints({ ...SAMPLE[g.id](rng(5)), gen: g.id, v: g.v, at: [320, 180], [f]: low });
    const def = hostile(call, 1);
    def.clips.a.keys = [{ t: 0, emit: { e0: { [f]: high } } }];
    const v = validateSprite(def);
    assert.equal(v.ok, false, `${key}: keyed ${f} above its declared ${low}, yet valid`);
    assert.match(v.errors.join(' '), new RegExp(`a key sets ${f} to [\\d.]+, above the [\\d.]+ the emitter sets`), `${key}: ${v.errors.slice(0, 2).join('; ')}`);
    // keyed down is fine
    def.clips.a.keys = [{ t: 0, emit: { e0: { [f]: t.lo } } }];
    assert.doesNotMatch(validateSprite(def).errors.join(' '), /a key sets/, `${key}: keyed ${f} down to ${t.lo}`);
  }
});

// The frame border rule (engine/gen/fx-common.js FRAME PIXELS): every B12c behaviour paints only inside the frame's
// 1 px empty border, except fall.field@1, a weather layer that fills the whole frame as engine/weather.js fallField
// did (review B12c issue 6: the exception was stated, not guarded).
const WHOLE_FRAME = new Set(['fall.field@1']);
test('each B12c behaviour paints only inside the frame\'s 1 px border (fall.field@1: inside the frame)', () => {
  const r = rng(21);
  let cells = 0;
  for (const key of KEYS) {
    const g = entryOf(key), m = WHOLE_FRAME.has(key) ? 0 : 1;
    const calls = [];
    for (let i = 0; i < 12; i++) {
      const s = { gen: g.id, v: g.v, ...SAMPLE[g.id](r) };
      calls.push({ ...s, at: [Math.round(-20 + 680 * r()), Math.round(-20 + 400 * r())] }, ...(i < 2 ? [{ ...s, at: [0, 0] }, { ...s, at: [639, 359] }] : []));
    }
    for (const call of calls) {
      if (!checkCall(call).ok) continue;   // what a frame can draw (within its budget)
      for (const size of [[640, 360], [48, 48]]) {
        if (call.at && size[0] < 640 && (call.at[0] > 600 || call.at[1] > 300)) continue;
        for (const [t, loop] of [[0, false], [0.45, true], [1, false]]) {
          const out = runGenerator(call, { size, t, loop, frame: 3 }, { budget: Infinity });
          if (!out.ok) continue;
          for (const p of out.primitives) {
            assert.equal(p.kind, 'stamp', `${key}: draws only stamps`);
            assert.ok((p.anchor ?? 'tl') === 'tl', `${key}: stamps are placed by their top-left corner`);
            p.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) {
              if (!Object.hasOwn(p.key, row[x])) continue;
              const X = p.at[0] + x, Y = p.at[1] + y;
              assert.ok(X >= m && Y >= m && X <= size[0] - 1 - m && Y <= size[1] - 1 - m, `${key} ${JSON.stringify(call).slice(0, 100)} in ${size} at t ${t}: paints (${X}, ${Y})`);
              cells++;
            } });
          }
        }
      }
    }
  }
  assert.ok(cells > 5000, `only ${cells} painted cells checked`);
});
