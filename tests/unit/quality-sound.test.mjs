// The sound and music quality bar (quality/sound.js): one fixture per rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSound } from '../../quality/sound.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quality', 'sounds');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const TYPES = ['sfx', 'ambience', 'music', 'jingle'];
const validateMeta = (meta, kind) => {
  const errors = [];
  if (kind !== 'sound' && kind !== 'music') errors.push(`kind should be sound or music, got ${kind}`);
  if (!TYPES.includes(meta.type)) errors.push(`type "${meta.type}" is not an allowed value`);
  return { ok: !errors.length, errors };
};
const run = (name, o = { validateMeta }) => checkSound(load(name), o);
const has = (list, re) => list.some((m) => re.test(m));
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;
function expectError(name, re) {
  const r = run(name);
  assert.ok(has(r.errors, re), `expected an error matching ${re}\n${show(r)}`);
  return r;
}

test('a sound effect that meets the bar passes with no errors', () => {
  const r = run('good-blip');
  assert.deepEqual(r.errors, [], show(r));
  assert.equal(r.metrics.type, 'sfx');
  assert.equal(r.metrics.metaChecked, true);
  assert.equal(typeof r.metrics.ms, 'number');
  assert.equal(r.metrics.params.length, 3);
  for (const p of r.metrics.params) assert.ok(p.distance > 1.5, `${p.id} ${p.distance}`);
  assert.ok(r.metrics.analysis.seconds > 0.1);
  assert.ok(Array.isArray(r.metrics.nodes));
});

test('an invalid patch fails with the validator\'s errors', () => {
  const r = expectError('invalid', /out: required/);
  assert.equal(r.metrics.valid, false);
});
test('a silent render is an error', () => expectError('silent', /silent/));
test('a slider that silences the sound at one end is an error', () => expectError('param-silent', /param 'level': silent at min/));
test('non-finite samples at any control setting are an error', () => expectError('non-finite', /not a finite number at level=min/));
test('a control that changes nothing (0 dB) is an error', () => expectError('dead-control', /param 'grit': changes nothing/));
test('a control with a small but real effect is only a warning', () => {
  const r = run('good-blip');
  assert.ok(!has(r.errors, /changes nothing/), show(r));
});
test('metadata: missing meta is an error when a validator is given', () => expectError('no-meta', /no meta/));
test('metadata: skipped when no validator is given', () => {
  const r = run('no-meta', {});
  assert.ok(!has(r.errors, /meta/), show(r));
  assert.equal(r.metrics.metaChecked, false);
});
test('a loop that jumps at its seam is an error', () => expectError('loop-click', /loop seam/));

test('a jingle (meta.type jingle, category jingle) is judged as a one-shot, not as a track', () => {
  const r = run('jingle');
  assert.deepEqual(r.errors, [], show(r));
  assert.equal(r.metrics.type, 'jingle');
  assert.equal(r.metrics.music, undefined, 'no tempo, length or instrument checks');
});
test('a jingle must not loop', () => expectError('jingle-loops', /a jingle must not loop/));
test('an ambience must loop', () => expectError('ambience-no-loop', /an ambience must loop/));
test('a music track that meets the bar passes', () => {
  const r = run('music-good');
  assert.deepEqual(r.errors, [], show(r));
  assert.equal(r.metrics.type, 'music');
  assert.equal(r.metrics.music.writtenBpm, 120);
  assert.ok(Math.abs(r.metrics.music.detectedBpm - 120) <= 2);
  assert.equal(r.metrics.music.lengthControl, 'bars');
  assert.equal(r.metrics.music.instrumentControl, 'inst');
});
test('music: the detected tempo must match the written tempo', () => expectError('music-wrong-tempo', /detected tempo .* does not match the written tempo 120/));
test('music: a length control must exist', () => expectError('music-no-length', /no length control/));
test('music: a melody-instrument control must exist', () => expectError('music-no-instrument', /no melody-instrument control/));
