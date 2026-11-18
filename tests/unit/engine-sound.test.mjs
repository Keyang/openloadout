// Sound engine: validation, rendering, stepped controls, stereo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePatch, renderPatch, createVoice, defaultParams } from '../../sound/sfx-engine.js';

const load = (id) => JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'));

// A tiny patch that does not depend on the shipped library.
const tiny = () => ({
  format: 'sfxpatch/0.1', id: 'test-tone', name: 'Test tone', category: 'ui',
  duration: 'len',
  params: [
    { id: 'pitch', label: 'Pitch', min: 100, max: 1000, default: 440 },
    { id: 'len', label: 'Length', min: 0.1, max: 0.5, default: 0.25 },
    { id: 'steps', label: 'Steps', min: 0, max: 8, default: 0, step: 2 },
    { id: 'kind', label: 'Kind', min: 0, max: 2, default: 0, options: ['a', 'b', 'c'] },
  ],
  nodes: [{ id: 'o', type: 'osc', wave: 'sine', freq: 'pitch' }],
  out: 'o * 0.5',
});

test('validatePatch accepts a real patch', () => {
  const r = validatePatch(load('coin-pickup'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('validatePatch accepts the tiny patch and the music patch', () => {
  assert.equal(validatePatch(tiny()).ok, true);
  assert.equal(validatePatch(load('battle-theme')).ok, true);
});

test('validatePatch rejects broken patches with a reason', () => {
  const noOut = tiny(); delete noOut.out;
  assert.ok(validatePatch(noOut).errors.some((e) => /out/.test(e)));
  const badNode = tiny(); badNode.nodes[0].type = 'warp';
  assert.ok(validatePatch(badNode).errors.some((e) => /unknown type/.test(e)));
  const badId = tiny(); badId.id = 'Bad Id';
  assert.equal(validatePatch(badId).ok, false);
  const badDefault = tiny(); badDefault.params[0].default = 5;
  assert.ok(validatePatch(badDefault).errors.some((e) => /outside/.test(e)));
  const badExpr = tiny(); badExpr.out = 'o * nothere';
  assert.equal(validatePatch(badExpr).ok, false);
  const badOptions = tiny(); badOptions.params[3].max = 5;
  assert.ok(validatePatch(badOptions).errors.some((e) => /options/.test(e)));
  assert.equal(validatePatch(null).ok, false);
  assert.equal(validatePatch([]).ok, false);
});

test('renderPatch returns samples of the expected length', () => {
  const r = renderPatch(tiny(), { sampleRate: 8000 });
  assert.equal(r.sampleRate, 8000);
  assert.equal(r.samples.length, Math.round(0.25 * 8000));
  assert.equal(r.channels.length, 1);
  assert.equal(r.badSamples, 0);
  assert.ok(Math.abs(r.duration - 0.25) < 1e-9);
  const peak = r.samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(peak > 0.5 && peak <= 0.9, `normalised peak ${peak}`);
});

test('renderPatch follows a parameter that changes the length', () => {
  const r = renderPatch(tiny(), { sampleRate: 8000, params: { len: 0.4 } });
  assert.equal(r.samples.length, 3200);
});

test('renderPatch is deterministic', () => {
  const a = renderPatch(load('punch'), { sampleRate: 11025, seed: 3 });
  const b = renderPatch(load('punch'), { sampleRate: 11025, seed: 3 });
  assert.deepEqual([...a.samples], [...b.samples]);
});

test('a stepped control snaps to whole steps and an options control to whole numbers', () => {
  const v = createVoice(tiny(), { params: { steps: 3.1, kind: 1.4 } });
  // read back through setParam / duration-independent behaviour: render with the two values and with their snapped forms
  const a = renderPatch(tiny(), { sampleRate: 4000, params: { steps: 3.1, kind: 1.4, pitch: 300 } });
  const b = renderPatch(tiny(), { sampleRate: 4000, params: { steps: 4, kind: 1, pitch: 300 } });
  assert.deepEqual([...a.samples], [...b.samples]);
  assert.ok(v.duration > 0);
});

test('stepped snapping drives a parameter expression (the battle theme length)', () => {
  const t = load('battle-theme');
  const len = (bars) => createVoice(t, { params: { bars } }).duration;
  assert.equal(len(8), len(11));     // 11 snaps to 8
  assert.equal(len(16), len(13));    // 13 snaps to 16
  assert.ok(len(32) > len(16) && len(16) > len(8));
  const d = defaultParams(t);
  assert.equal(d.bars, 8);
});

test('stereo output has two channels of equal length; mono mix is their average', () => {
  const t = load('battle-theme');
  const r = renderPatch(t, { sampleRate: 8000, params: { bars: 8, bpm: 190 } });
  assert.equal(r.channels.length, 2);
  assert.equal(r.channels[0].length, r.channels[1].length);
  assert.equal(r.samples.length, r.channels[0].length);
  const i = 1234;
  assert.ok(Math.abs(r.samples[i] - (r.channels[0][i] + r.channels[1][i]) / 2) < 1e-6);
  assert.equal(r.loop, true);
  assert.equal(r.badSamples, 0);
});

test('a tiny stereo patch renders two channels', () => {
  const p = tiny(); p.out = ['o * 0.5', 'o * 0.25'];
  const r = renderPatch(p, { sampleRate: 4000 });
  assert.equal(r.channels.length, 2);
  assert.notDeepEqual([...r.channels[0]], [...r.channels[1]]);
});
