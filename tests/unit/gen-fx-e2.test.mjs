// The effect behaviours migration batch E2 adds (docs/data-sprites.md section 9, the effect batches; engine/gen/fx-e2.js),
// for the library effects redrawn as data that the B12/B12c behaviours could not draw:
//   fall.field@2   fall.field@1 with a stamp bound that counts its pieces (so a weather sprite can lay a far and a
//                  near field), streaks up to 12 px, and a head and tail paint for each piece (rain's bright head and
//                  dark tail, a snowflake's glint and tips)
// Each is pinned by the goldens harness (tests/helpers/gen-harness.mjs) and checked against what it extends.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-fx-e2.test.mjs (writes only files that do not exist).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { stampPixels } from '../../engine/gen/args.js';

const SHAPES = ['dot', 'streak', 'flake', 'leaf', 'petal', 'seed', 'ash', 'grain'];

/** The primitives of a call, or a failed assertion naming its errors. */
function run(call, ctx) {
  const r = registry.runGenerator(call, ctx);
  assert.ok(r.ok, r.errors?.join('; '));
  return r.primitives;
}
/** Every painted pixel of a call's stamps: Map "x,y" -> paint. */
function pixels(prims) {
  const m = new Map();
  for (const p of prims) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') m.set(`${p.at[0] + i},${p.at[1] + j}`, p.key[ch]); }));
  }
  return m;
}
const CTX = (t) => ({ t, loop: true, frames: 8, frame: Math.round(t * 8), size: [64, 64] });

test('fall.field@2 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('fall.field', 2), { cases: [
    { args: { at: [1, 1], cols: 8, rows: 2, shape: 'streak', size: 9, paints: ['b'], head: 'h', tail: 't' }, ctx: CTX(0.25) },
    { args: { at: [1, 1], cols: 7, rows: 4, shape: 'flake', size: 3, paints: ['b', 'd'], head: 'h', tail: 't', sway: 2, swayCycles: 2 }, ctx: CTX(0.5) },
    { args: { at: [1, 1], cols: 6, rows: 3, laps: 2, slant: 'right', shape: 'dot', size: 2, alt: 'streak', altSize: 2, paints: ['b', 'b', 't', 't'], head: 'h', seed: 26 }, ctx: CTX(0.75) },
    { args: { at: [1, 1], cols: 12, rows: 2, laps: 5, slant: 'right', shape: 'streak', size: 12, paints: ['b'], head: 'h', tail: 't', seed: 3, shift: [17, 23] }, ctx: CTX(0) },
  ] });
});

test('fall.field@2 with no head or tail draws what fall.field@1 draws, every shape, at every phase', () => {
  for (const shape of SHAPES) for (const o of [{ cols: 8, rows: 2, size: 3, paints: ['s0'] }, { cols: 6, rows: 3, laps: 2, slant: 'right', sway: 2, swayCycles: 2, turns: 2, size: 4, paints: ['g0', 'g1'], rim: 'b', seed: 3, shift: [17, 23] }, { cols: 10, rows: 2, axis: 'right', slant: 'left', size: 2, alt: 'ash', altSize: 3, paints: ['g1', 's1'], core: 'p3', coreEvery: 2 }]) {
    for (const t of [0, 0.3, 0.75]) {
      const one = pixels(run({ gen: 'fall.field', v: 1, at: [1, 1], ...o, shape }, CTX(t)));
      const two = pixels(run({ gen: 'fall.field', v: 2, at: [1, 1], ...o, shape }, CTX(t)));
      assert.deepEqual([...two].sort(), [...one].sort(), `${shape} ${o.cols} t ${t}`);
    }
  }
});

test('fall.field@2 paints each streak\'s leading pixel the head and its last the tail, and streaks reach 12 px', () => {
  const call = { gen: 'fall.field', v: 2, at: [1, 1], cols: 1, rows: 1, shape: 'streak', size: 11, paints: ['b'], head: 'h', tail: 't', seed: 4 };
  const m = pixels(run(call, CTX(0.4)));
  const list = [...m].map(([k, p]) => [k.split(',').map(Number), p]);
  assert.equal(list.length, 11, 'one streak of 11 pixels');
  const [h] = list.filter(([, p]) => p === 'h'), [t] = list.filter(([, p]) => p === 't');
  assert.ok(h && t, 'one head and one tail');
  // the tail trails 10 rows above the head (round the 62 px square the field wraps in), in the same column
  assert.equal(t[0][0], h[0][0]);
  assert.equal(((h[0][1] - t[0][1]) % 62 + 62) % 62, 10, 'the head leads the fall, the tail trails it');
  assert.equal(list.filter(([, p]) => p === 'b').length, 9, 'the rest is the body');
  // without head or tail the same streak is all body
  const plain = pixels(run({ ...call, head: 'clear', tail: 'clear' }, CTX(0.4)));
  assert.deepEqual([...plain.keys()].sort(), [...m.keys()].sort());
  assert.ok([...plain.values()].every((p) => p === 'b'));
});

test('fall.field@2 gives a big snowflake a head in its middle and tails on its four diagonal tips', () => {
  const m = pixels(run({ gen: 'fall.field', v: 2, at: [1, 1], cols: 1, rows: 1, shape: 'flake', size: 3, paints: ['b'], head: 'h', tail: 't', seed: 5 }, CTX(0.2)));
  const count = (p) => [...m.values()].filter((v) => v === p).length;
  assert.equal(m.size, 13);
  assert.equal(count('h'), 1);
  assert.equal(count('t'), 4);
  assert.equal(count('b'), 8);
  // a plus (size 2) has no tips: its middle is the head, the rest the body
  const plus = pixels(run({ gen: 'fall.field', v: 2, at: [1, 1], cols: 1, rows: 1, shape: 'flake', size: 2, paints: ['b'], head: 'h', tail: 't', seed: 5 }, CTX(0.2)));
  assert.deepEqual([...plus.values()].sort(), ['b', 'b', 'b', 'b', 'h']);
});

test('fall.field@2 is priced by its pieces, not by its square, and never paints more than that', () => {
  const bound = registry.STAMP_BOUNDS['fall.field@2'];
  assert.equal(typeof bound, 'function');
  const gen = registry.generator('fall.field', 2);
  const withDefaults = (a) => Object.fromEntries(Object.entries(gen.args).map(([k, t]) => [k, a[k] ?? t.default]));
  // a near and a far snow field with glints and tips stay well inside one frame's 8,192 together
  const near = withDefaults({ at: [1, 1], cols: 12, rows: 4, shape: 'flake', size: 3, paints: ['b'] });
  assert.ok(bound(near, [64, 64]) <= 12 * 4 * 25, `near ${bound(near, [64, 64])}`);
  let r = 7;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < 200; i++) {
    const shape = SHAPES[Math.floor(rnd() * SHAPES.length)], alt = ['none', ...SHAPES][Math.floor(rnd() * 9)];
    const a = withDefaults({ at: [1, 1], cols: 1 + Math.floor(rnd() * 32), rows: 1 + Math.floor(rnd() * 6), laps: 1 + Math.floor(rnd() * 4), slant: ['none', 'left', 'right'][Math.floor(rnd() * 3)],
      sway: rnd() * 6, turns: 1 + Math.floor(rnd() * 3), shape, size: rnd() * 12, alt, altSize: rnd() * 6, paints: ['b', 'd'], head: 'h', tail: 't', seed: Math.floor(rnd() * 99) });
    const prims = run({ gen: 'fall.field', v: 2, ...a }, CTX(rnd()));
    pixels(prims);
    const got = stampPixels(prims);
    assert.ok(got <= bound(a, [64, 64]), `${shape}/${alt}: ${got} pixels over its bound ${bound(a, [64, 64])}`);
  }
  assert.deepEqual([...registry.SIZE_KEYS['fall.field@2']], []);
  assert.ok(registry.FRAME_GENERATORS['fall.field@2']);
});

// ---- the effect ports (engine/gen/fx-e2.js effectPort): each library effect whose drawing was its own code ------------

/** The effect ports E2 adds, each with the frame of the code sprite it was ported from (its redraw draws them pixel for pixel: tests/fixtures/redraw-pixels/<id>.json). */
const EFFECTS = {
  'enemy-poof': [48, 48], 'pickup-sparkle': [32, 32], 'bubble-stream': [64, 64], 'cave-drip': [64, 64], confetti: [64, 64],
  'debris-burst': [48, 48], 'dizzy-ring': [32, 32], 'dodge-trail': [48, 48], 'ember-drift': [64, 64], 'falling-leaves': [64, 64],
  fireflies: [64, 64], firework: [64, 64], flames: [32, 32], 'leaf-burst': [48, 48], 'poison-haze': [48, 48], 'rain-ripples': [64, 64],
  'smoke-plume': [48, 48], 'splash-burst': [48, 48], 'sun-rays': [64, 64], 'wind-gust': [64, 64], 'zap-crackle': [32, 32],
  // review round 1, issue 1: their fall.field@2 approximations read worse than the code
  'petal-fall': [64, 64], 'ash-fall': [64, 64],
};

/** Three golden cases of an effect port: its first picture at the start, its last picture half way, and its first at the end with every setting at its far end. */
function effectCases(gen, size) {
  const pics = gen.args.picture.values, top = {}, mid = {};
  let n = 0;
  for (const [k, t] of Object.entries(gen.args)) {
    if (k === 'at') { top.at = mid.at = [size[0] / 2, size[1] / 2]; continue; }
    if (k === 'picture') continue;
    if (t.type === 'paint') { top[k] = mid[k] = `p${n++}`; continue; }
    if (t.type === 'word') { top[k] = t.values.at(-1); continue; }
    if (t.type === 'flag') { top[k] = !t.default; continue; }
    top[k] = t.hi;
  }
  const ctx = (frame, frames, loop) => ({ frame, frames, t: loop ? frame / frames : frame / Math.max(1, frames - 1), loop, size });
  return [
    { args: { ...mid, picture: pics[0] }, ctx: ctx(0, 8, true) },
    { args: { ...mid, picture: pics.at(-1) }, ctx: ctx(3, 8, true) },
    { args: { ...top, picture: pics[0] }, ctx: ctx(5, 8, true) },
  ];
}

for (const [id, size] of Object.entries(EFFECTS)) {
  test(`effect.${id}@1 passes the goldens harness and is priced at its frame`, () => {
    const gen = registry.generator(`effect.${id}`, 1);
    assert.ok(gen, `effect.${id}@1 is registered`);
    assert.equal(gen.family, 'fx');
    checkGeneratorContract(registry, gen, { cases: effectCases(gen, size) });
    assert.equal(registry.STAMP_BOUNDS[`effect.${id}@1`]({}, size), size[0] * size[1]);
    assert.deepEqual([...registry.SIZE_KEYS[`effect.${id}@1`]], []);
  });
}
