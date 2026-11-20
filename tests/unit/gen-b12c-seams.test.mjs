// The seams of build item B12c (docs/data-sprites.md section 9, row B12c): what the other layouts and the validator
// must do now that twenty more keyable behaviours can be emitters.
//   1. engine/gen/pictures.js and engine/data-sprite.js (its built-in pictures layout) read the on/off and amount
//      rules from engine/gen/emit-keys.js, holding an amount to 0..1 (a binding below 0 too), not from their own copies;
//   2. the pictures layout is guarded as the emitters layout is: a frame whose keyed emitter calls cost more than a
//      frame's budget in all is refused before any of them runs (engine/gen/emitters.js checkKeyedCost);
//   3. a motion's args may lower an emitter's size arguments (engine/gen/index.js SIZE_KEYS; every keyable argument
//      when the registry has no table), never raise them, so a motion cannot raise what the validator charged;
//   4. the stamps a body's draw list writes count in the emitters' summed stamp bound (both share a frame's 8,192);
//   5. engine/data-sprite.js LAYOUT_FILES names engine/gen/emitters.js as the file of the emitters layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRegistry, generators, GEN_LIMITS } from '../../engine/gen/index.js';
import { point, share, px, count, paint } from '../../engine/gen/args.js';
import { pictures } from '../../engine/gen/pictures.js';
import { picturesLayout } from '../../engine/data-sprite.js';
import { validateSprite } from '../../catalog/sprite-schema.js';

const ROOT = new URL('../../', import.meta.url);
const source = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');

/** A copy of the site's registry with three test generators: `lamp` (an fx with an amount and keyable r), `heavy` (keyable n, priced n x 1,000) and the motion `raise` (gives the args it is told to). */
function testRegistry({ sizeKeys } = {}) {
  const reg = createRegistry();
  for (const g of generators()) reg.defineGenerator({ id: g.id, v: g.v, family: g.family, about: g.about, args: g.args, cost: g.cost, run: g.run, keyable: [...g.keyable], wraps: g.wraps });
  reg.defineGenerator({
    id: 'lamp', v: 1, family: 'fx', about: 'A test lamp: one dot, its amount and radius written into where it sits.',
    args: { at: point(), amount: share({ default: 1 }), r: px(0, 32, { default: 4 }), paint: paint() }, keyable: ['r'], cost: (a) => 1 + a.r,
    run: (a) => [{ kind: 'dot', at: [a.at[0] + a.r, a.at[1] + Math.round(a.amount * 10)], paint: a.paint }],
  });
  reg.defineGenerator({
    id: 'heavy', v: 1, family: 'fx', about: 'A test behaviour priced n x 1,000.',
    args: { at: point(), n: count(1, 100, { default: 1 }), paint: paint() }, keyable: ['n'], cost: (a) => a.n * 1000, run: () => [],
  });
  reg.defineGenerator({
    id: 'raise', v: 1, family: 'motion', about: 'A test motion: lamp r set to `r` on the whole picture.',
    args: { r: px(0, 64, { default: 20 }) }, cost: () => 1, run: (a) => [{ move: [0, 0], args: { 'lamp.r': a.r } }],
  });
  return sizeKeys ? { ...reg, SIZE_KEYS: sizeKeys } : reg;
}

/** A pictures layout input with the expand step recorded instead of run: returns [input, calls seen by expand]. */
function inputFor(body, { pose = {}, clips = {}, gen = testRegistry() } = {}) {
  const seen = [];
  const input = {
    kind: 'pictures', body, resolved: { id: 't', size: [64, 64], palette: { a: '#ffffff' }, clips }, clip: {}, pose, generators: gen, warn: () => {},
    expand: (items) => { seen.push(...items.filter((x) => x && x.gen)); return { primitives: [], palette: {} }; },
    place: (p) => p, nodeFrames: () => new Map(), visible: (items) => items,
  };
  return [input, seen];
}
const CTX = { t: 0, frame: 0, frames: 4, loop: true, size: [64, 64], clip: 'a', direction: null };
const LAYOUTS = [['pictures@1 (engine/gen/pictures.js)', (i, c) => pictures.run(i, c)], ['the built-in picturesLayout (engine/data-sprite.js)', picturesLayout]];

// ---- 1. the on/off and amount rules from one place ------------------------------------------------------------------

test('pictures.js and data-sprite.js read the on/off and amount rules from engine/gen/emit-keys.js, with no copies of their own', () => {
  for (const f of ['engine/gen/pictures.js', 'engine/data-sprite.js']) {
    const s = source(f);
    assert.match(s, /import \{[^}]*\bamountKeyed\b[^}]*\bemitterCall\b[^}]*\} from '\.\/(gen\/)?emit-keys\.js'/, `${f} imports amountKeyed and emitterCall`);
    assert.doesNotMatch(s, /function amountKeyed\b/, `${f} keeps no copy of amountKeyed`);
  }
});

test('an emitter\'s amount is held to 0..1 in both pictures layouts, from a key or from the emitter itself (a binding)', () => {
  for (const [name, run] of LAYOUTS) {
    // the emitter's own amount, a binding worked out below 0 or above 1
    for (const [own, want] of [[-3, 0], [5, 1], [0.25, 0.25]]) {
      const [input, seen] = inputFor({ emitters: [{ id: 'l', gen: 'lamp', v: 1, at: [8, 8], amount: own, paint: 'a' }] });
      run(input, CTX);
      assert.equal(seen.length, 1, `${name}: the lamp no key names always draws`);
      assert.equal(seen[0].amount, want, `${name}: amount ${own} reaches the lamp as ${want}`);
    }
    // a key's amount: off at 0 and below, on above it
    const clips = { a: { keys: [{ t: 0, emit: { l: { amount: 1 } } }] } };
    for (const [k, want] of [[0, null], [-0.5, null], [0.5, 0.5]]) {
      const [input, seen] = inputFor({ emitters: [{ id: 'l', gen: 'lamp', v: 1, at: [8, 8], paint: 'a' }] }, { clips, pose: { emit: { l: { amount: k } } } });
      run(input, CTX);
      assert.equal(seen.length ? seen[0].amount : null, want, `${name}: keyed amount ${k}`);
    }
  }
});

// ---- 2. the summed-cost guard of a frame's keyed calls --------------------------------------------------------------

test('the pictures layout refuses a frame whose keyed emitter calls cost more than a frame\'s budget, before any runs', () => {
  const emitters = Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, gen: 'heavy', v: 1, at: [8, 8], n: 1, paint: 'a' }));
  // as written, a few of them sum to under the budget and draw
  const under = Math.floor(GEN_LIMITS.primitives / 1000) - 1;
  const ok = emitters.slice(0, Math.max(1, under));
  const [input0, seen0] = inputFor({ emitters: ok });
  pictures.run(input0, CTX);
  assert.equal(seen0.length, ok.length, 'within the budget: drawn');
  // keyed up (a definition the validator would refuse, drawn without that check): refused before expand runs any
  const emit = Object.fromEntries(emitters.map((e) => [e.id, { n: 100 }]));
  const [input, seen] = inputFor({ emitters }, { pose: { emit } });
  assert.throws(() => pictures.run(input, CTX), /over the frame budget/);
  assert.equal(seen.length, 0, 'nothing ran');
});

// ---- 3. motions held to the SIZE_KEYS rule on emitters --------------------------------------------------------------

test('a motion may lower an emitter\'s size argument but never raise it (no SIZE_KEYS table: every keyable argument is one)', () => {
  const body = (r) => ({ motion: [{ gen: 'raise', v: 1, r }], emitters: [{ id: 'l', gen: 'lamp', v: 1, at: [8, 8], r: 6, paint: 'a' }] });
  for (const [r, want] of [[20, 6], [6, 6], [2, 2], [0, 0]]) {
    const [input, seen] = inputFor(body(r));
    pictures.run(input, CTX);
    assert.equal(seen[0].r, want, `a motion giving lamp.r ${r} to an emitter set at 6`);
  }
  // the emitter leaves r to its default (4): a motion cannot raise that either
  const [input, seen] = inputFor({ motion: [{ gen: 'raise', v: 1, r: 20 }], emitters: [{ id: 'l', gen: 'lamp', v: 1, at: [8, 8], paint: 'a' }] });
  pictures.run(input, CTX);
  assert.equal(seen[0].r ?? 4, 4, 'held to the default it was priced at');
});

test('a keyable argument the registry\'s SIZE_KEYS leave out is free: a motion may raise it', () => {
  const gen = testRegistry({ sizeKeys: { 'lamp@1': [] } });
  const [input, seen] = inputFor({ motion: [{ gen: 'raise', v: 1, r: 20 }], emitters: [{ id: 'l', gen: 'lamp', v: 1, at: [8, 8], r: 6, paint: 'a' }] }, { gen });
  pictures.run(input, CTX);
  assert.equal(seen[0].r, 20);
});

test('a motion still sets a draw-list call\'s keyable arguments as it says (only emitters are priced as written)', () => {
  const [input, seen] = inputFor({ motion: [{ gen: 'raise', v: 1, r: 20 }], draw: [{ id: 'l', gen: 'lamp', v: 1, at: [8, 8], r: 6, paint: 'a' }] });
  pictures.run(input, CTX);
  assert.equal(seen[0].r, 20);
});

// ---- 4. the draw list's stamps in the emitters' stamp bound ---------------------------------------------------------

const STAMP = (id) => ({ id, kind: 'stamp', at: [0, 0], rows: Array.from({ length: 32 }, () => 'a'.repeat(32)), key: { a: 'spark' } });
function glowSprite({ r = 41, stamps = 1 } = {}) {
  const def = JSON.parse(source('tests/fixtures/v2/hit-spark.json'));
  def.size = [96, 96];
  def.pivot = [48, 48];
  def.body = { draw: Array.from({ length: stamps }, (_, i) => STAMP(`s${i}`)), emitters: [{ id: 'ball', gen: 'glow', v: 1, at: [48, 48], r, paints: ['spark', 'spark.dark'] }] };
  def.controls = [];
  def.clips = { hit: { frames: 4, fps: 12, loop: false } };
  delete def.was;
  return def;
}

test('the stamps a body\'s draw list writes count in the emitters\' summed stamp bound (both share a frame\'s 8,192)', () => {
  // the glow alone: (2 x 41 + 5)^2 = 7,569 stamp pixels; one 32 x 32 stamp: 1,024; together 8,593, over 8,192
  const alone = validateSprite(glowSprite({ stamps: 0 }));
  assert.doesNotMatch(alone.errors.join(' '), /stamp pixels/, alone.errors.join('; '));
  const small = validateSprite(glowSprite({ r: 30, stamps: 1 }));
  assert.doesNotMatch(small.errors.join(' '), /stamp pixels/, `a smaller glow (65^2 = 4,225) and the stamp fit: ${small.errors.join('; ')}`);
  const both = validateSprite(glowSprite({ stamps: 1 }));
  assert.equal(both.ok, false);
  assert.match(both.errors.join(' '), /8,593 stamp pixels.*1,024 of them the body's own stamps/, both.errors.join('; '));
});

// ---- 5. LAYOUT_FILES -----------------------------------------------------------------------------------------------

test('engine/data-sprite.js names engine/gen/emitters.js as the file of the emitters layout', () => {
  assert.match(source('engine/data-sprite.js'), /const LAYOUT_FILES = Object\.freeze\(\{[^}]*emitters: 'engine\/gen\/emitters\.js'/);
});
