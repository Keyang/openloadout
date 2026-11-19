// Every generator the site registers (engine/gen/index.js) passes the goldens harness (tests/helpers/gen-harness.mjs):
// pinned output at three or more argument sets, determinism, no clock or dice, argument fuzz, cost, loop closure.
// A generator with no golden file fails here, so a new one cannot land without its goldens.
//
// To pin a NEW generator version: add its cases to CASES below, run once with GEN_GOLDEN_WRITE=1, look at the file
// it wrote in tests/fixtures/gen/, and keep it. A pinned file is never rewritten.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { count, px } from '../../engine/gen/args.js';
import { checkGeneratorContract, readGolden } from '../helpers/gen-harness.mjs';

// Argument sets used when a golden file is first written (later the file itself is the source of the cases).
const CASES = {
  'twinkle@1': [
    { args: { at: [16, 16], size: 0, paint: 'gold', core: 'shine' } },
    { args: { at: [16.5, 12.7], size: 2, paint: 'gold.light', core: 'shine' } },
    { args: { at: [3, 4], size: 1, paint: 'spark', core: 'spark.light' } },
    { args: { at: [0, 0], size: 4, paint: 'gold', core: 'shine' } },
  ],
  'mark@1': [
    { args: { name: 'skull', at: [16, 12], size: 7, paint: 'wood.dark' } },
    { args: { name: 'star', at: [16, 15], size: 9, paint: 'ink' } },
    { args: { name: 'arrow', at: [10.5, 10], size: 5, paint: 'cream', flip: true } },
    { args: { name: 'leaf', at: [16, 16], size: 11, paint: 'leaf', turn: 1 } },
    { args: { name: 'question', at: [8, 8], size: 3, paint: 'ink' } },
  ],
  'row@1': [
    { args: { from: [2, 0], to: [26, 0], count: 7, place: { kind: 'dot', paint: 'metal.dark' } } },
    { args: { from: [0, 0], to: [10, 5], count: 3, place: { gen: 'twinkle', v: 1, size: 1, paint: 'gold', core: 'shine' } } },
    { args: { from: [4, 4], to: [9, 4], count: 1, place: { kind: 'stamp', rows: ['ab'], key: { a: 'metal', b: 'metal.light' } } } },
    { args: { from: [1.25, 30], to: [30.75, 30], count: 4, snap: false, place: { use: 'stamp:clod', v: 1, paint: { a: 'soil.dark' } } } },
  ],
};

// Motions (node moves) and layouts (a whole frame) do not return primitives: tests/unit/gen-motion-layout-contract.test.mjs
// holds every registered one to its own goldens, fuzz and determinism (build item B8).
const shapeListGenerators = () => registry.generators().filter((g) => g.family !== 'motion' && g.family !== 'layout');

test('every registered generator has a golden file with at least three cases', () => {
  const missing = shapeListGenerators().filter((g) => !readGolden(g.key) && !CASES[g.key]);
  assert.deepEqual(missing.map((g) => g.key), [], 'generators with no goldens');
});

for (const g of shapeListGenerators()) {
  test(`${g.key} passes the goldens harness`, () => checkGeneratorContract(registry, g, { cases: CASES[g.key] }));
}

test('the harness catches a changed output', () => {
  const g = registry.generator('twinkle', 1);
  const golden = readGolden(g.key);
  const r = registry.runGenerator({ gen: 'twinkle', v: 1, ...golden.cases[0].args, size: 1 });
  assert.notDeepEqual(r.primitives, golden.cases[0].primitives, 'a different argument gives a different picture');
  // a golden that no longer matches what the generator returns fails the harness
  const tampered = structuredClone(golden);
  const stamp = tampered.cases[1].primitives[0];
  stamp.rows[0] = stamp.rows[0].replace('a', '.');
  assert.throws(() => checkGeneratorContract(registry, g, { golden: tampered }), /differs from the pinned golden/);
  const fewer = { ...structuredClone(golden), cases: golden.cases.slice(0, 2) };
  assert.throws(() => checkGeneratorContract(registry, g, { golden: fewer }), /three/);
});

test('the harness refuses a cost that rises and then falls: a table would be costed at its ends only', () => {
  const r = registry.createRegistry();
  r.defineGenerator({
    id: 'hump', v: 1, family: 'test', about: 'Costs most at the middle size.',
    args: { size: count(0, 20) }, cost: (a) => 11 - Math.abs(a.size - 10), run: () => [],
  });
  const golden = { id: 'hump', v: 1, cases: [0, 5, 20].map((size) => ({ args: { size }, primitives: [] })) };
  assert.throws(() => checkGeneratorContract(r, r.generator('hump', 1), { golden }), /rises and falls/);
  // one that only falls (fewer dots as the gap grows) is fine
  r.defineGenerator({
    id: 'gaps', v: 1, family: 'test', about: 'Fewer as the gap grows.',
    args: { gap: px(1, 64) }, cost: (a) => Math.ceil(64 / a.gap), run: () => [],
  });
  const g2 = { id: 'gaps', v: 1, cases: [1, 8, 64].map((gap) => ({ args: { gap }, primitives: [] })) };
  assert.doesNotThrow(() => checkGeneratorContract(r, r.generator('gaps', 1), { golden: g2 }));
});
