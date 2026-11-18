// The sound quality bar, checks added on 2026-11-18: a control that fails the one-seed spectral test is
// tested again for what that test cannot see: a wider random pick (several seeds) and notes that move in time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSound, THRESHOLDS } from '../../quality/sound.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quality', 'sounds');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const has = (list, re) => list.some((m) => re.test(m));
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;
const param = (r, id) => r.metrics.params.find((p) => p.id === id);

test('a control that only widens a random pick is audible across several seeds, not flagged from one', () => {
  const r = checkSound(load('random-spread'));
  const p = param(r, 'spread');
  assert.ok(p.distance < THRESHOLDS.audibleChangeDb, `with seed 1 alone it scores ${p.distance} dB`);
  assert.equal(p.seeds.count, THRESHOLDS.randomSeeds);
  assert.ok(p.seeds.distance >= THRESHOLDS.audibleChangeDb, `typical take: ${p.seeds.distance} dB`);
  assert.ok(p.seeds.takesAtMin < 0.2 && p.seeds.takesAtMax > THRESHOLDS.audibleChangeDb, `takes differ by ${p.seeds.takesAtMin} dB at min, ${p.seeds.takesAtMax} dB at max`);
  assert.equal(p.audibleBy, 'random takes');
  assert.deepEqual(p.flags, []);
  assert.ok(!has(r.warnings, /param 'spread'/), show(r));
  assert.deepEqual(r.errors, [], show(r));
});
test('a control that really does next to nothing is still flagged after the extra tests', () => {
  const r = checkSound(load('random-spread'));
  const p = param(r, 'fine');
  assert.ok(has(r.warnings, /param 'fine': little audible effect/), show(r));
  assert.ok(p.seeds && p.seeds.distance < THRESHOLDS.audibleChangeDb);
  assert.ok(p.onsetShiftMs < THRESHOLDS.onsetShiftMs);
  assert.equal(p.audibleBy, undefined);
});
test('a sound with no randomness is not rendered with five seeds: two show that seeds change nothing', () => {
  const p = load('timing-swing');
  p.params = p.params.filter((q) => q.id !== 'swing');
  p.nodes[0].rate = '8';
  const r = checkSound(p);
  assert.equal(param(r, 'fine').seeds.count, 2);
  assert.ok(has(r.warnings, /param 'fine': little audible effect/), show(r));
});
test('a control that moves notes in time is audible by onset shift', () => {
  const r = checkSound(load('timing-swing'));
  const p = param(r, 'swing');
  assert.ok(p.distance < THRESHOLDS.audibleChangeDb, `the spectral test scores ${p.distance} dB`);
  assert.ok(p.onsetShiftMs >= THRESHOLDS.onsetShiftMs, `note starts move ${p.onsetShiftMs} ms`);
  assert.ok(p.onsetShiftMs > 25 && p.onsetShiftMs < 50, `a third of a 125 ms step is 42 ms, got ${p.onsetShiftMs}`);
  assert.equal(p.audibleBy, 'timing');
  assert.equal(p.seeds, undefined, 'no need for more seeds once the timing test passes');
  assert.ok(!has(r.warnings, /param 'swing'/), show(r));
  assert.ok(has(r.warnings, /param 'fine': little audible effect/), show(r));
  assert.deepEqual(r.errors, [], show(r));
});
test('controls that pass the spectral test are not tested further, and a dead control is still an error', () => {
  const g = checkSound(load('good-blip'));
  for (const p of g.metrics.params) { assert.equal(p.seeds, undefined); assert.equal(p.onsetShiftMs, undefined); }
  const d = checkSound(load('dead-control'));
  assert.ok(has(d.errors, /param 'grit': changes nothing/), show(d));
});
