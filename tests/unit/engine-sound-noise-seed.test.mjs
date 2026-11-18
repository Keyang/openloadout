// Sound engine: the noise node's optional fixed `seed` field (batch F04).
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePatch, renderPatch } from '../../sound/sfx-engine.js';

const patch = (noise) => ({
  format: 'sfxpatch/0.1', id: 'test-noise', name: 'Test noise', category: 'ui',
  duration: 0.05,
  nodes: [{ id: 'n', type: 'noise', ...noise }],
  out: 'n * 0.5',
});
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test('noise with a fixed seed validates', () => {
  const r = validatePatch(patch({ seed: 7 }));
  assert.deepEqual(r.errors, []);
});

test('noise with a fixed seed is identical whatever seed the take renders with', () => {
  for (const color of ['white', 'pink', 'brown']) {
    const a = renderPatch(patch({ color, seed: 7 }), { seed: 1 }).samples;
    const b = renderPatch(patch({ color, seed: 7 }), { seed: 98765 }).samples;
    assert.ok(same(a, b), `${color} noise with seed 7 changed between takes`);
  }
});

test('different fixed seeds give different noise', () => {
  const a = renderPatch(patch({ seed: 7 }), { seed: 1 }).samples;
  const b = renderPatch(patch({ seed: 8 }), { seed: 1 }).samples;
  assert.ok(!same(a, b));
});

test('noise without a seed still changes with the take seed', () => {
  const a = renderPatch(patch({}), { seed: 1 }).samples;
  const b = renderPatch(patch({}), { seed: 2 }).samples;
  assert.ok(!same(a, b));
  const c = renderPatch(patch({}), { seed: 1 }).samples;
  assert.ok(same(a, c));
});
