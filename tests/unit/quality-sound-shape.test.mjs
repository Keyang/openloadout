// The sound quality bar, checks added on 2026-11-18: where a sound starts (not when it is loudest),
// energy a phone can play, the one-shot rules on every style, and crest factor in the report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSound, THRESHOLDS, onsetKind, declaresRumble } from '../../quality/sound.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DIR = path.join(HERE, '..', 'fixtures', 'quality', 'sounds');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const has = (list, re) => list.some((m) => re.test(m));
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}\nnotes:\n  ${r.notes.join('\n  ')}`;

// ---- item 1: onset ---------------------------------------------------------------------------------
test('a sound that starts at once but is loudest late is not a slow start', () => {
  const r = checkSound(load('onset-late-peak'));
  assert.equal(onsetKind(load('onset-late-peak')), 'pickup');
  assert.ok(r.metrics.analysis.attackMs > 100, 'time to the loudest sample is long');
  assert.ok(r.metrics.analysis.onsetMs < THRESHOLDS.onsetMaxMs, `onset ${r.metrics.analysis.onsetMs}`);
  assert.ok(!has(r.warnings, /slow start/), show(r));
  assert.deepEqual(r.errors, [], show(r));
});
test('a hit that takes longer than 10 ms to arrive is a warning that says what was measured and how to fix it', () => {
  const r = checkSound(load('onset-slow'));
  assert.equal(r.metrics.kind, 'hit');
  assert.ok(r.metrics.analysis.onsetMs > THRESHOLDS.onsetMaxMs);
  const w = r.warnings.find((m) => /slow start/.test(m));
  assert.ok(w, show(r));
  assert.match(w, /\d+ ms/);
  assert.match(w, /within 10 ms/);
  assert.match(w, /attack/);
  assert.deepEqual(r.errors, [], 'a warning only');
});
test('the 10 ms rule is only for hits, clicks, shots, steps and pickups', () => {
  const p = load('onset-slow');
  for (const [role, kind] of [['actions/hit', 'hit'], ['effects/impact', 'hit'], ['interface/click', 'click'], ['actions/shoot', 'shot'], ['characters/footstep', 'step'], ['items/pickup', 'pickup']]) {
    assert.equal(onsetKind({ ...p, meta: { ...p.meta, role } }), kind, role);
  }
  for (const role of ['actions/dash', 'actions/cast', 'world/door', 'effects/magic']) {
    const q = { ...p, meta: { ...p.meta, role } };
    assert.equal(onsetKind(q), null, role);
    assert.ok(!has(checkSound(q).warnings, /slow start/), role);
  }
  assert.equal(onsetKind({ id: 'x' }), null, 'no meta, no kind');
});

// ---- item 2: phone energy ----------------------------------------------------------------------------
test('less than 40% of the energy above 300 Hz is a warning, with the share, the rule and the fix', () => {
  const r = checkSound(load('phone-low'));
  assert.ok(r.metrics.analysis.above300 < THRESHOLDS.phoneShareMin);
  const w = r.warnings.find((m) => /above 300 Hz/.test(m));
  assert.ok(w, show(r));
  assert.match(w, /\d+%/);
  assert.match(w, /40%/);
  assert.match(w, /rumble/, 'says how to declare a rumble');
  assert.deepEqual(r.errors, [], 'a warning only');
});
test('a patch that says it is a rumble (in tags or meta.words) is not held to the phone rule', () => {
  const p = load('phone-low');
  assert.equal(declaresRumble(p), false);
  for (const q of [{ ...p, tags: ['thud', 'rumble'] }, { ...p, meta: { ...p.meta, words: [...p.meta.words.slice(0, 5), 'rumble'] } }]) {
    assert.equal(declaresRumble(q), true);
    const r = checkSound(q);
    assert.ok(!has(r.warnings, /above 300 Hz/), show(r));
    assert.ok(has(r.notes, /rumble/), 'a note still gives the number');
  }
});
test('a sound with enough high end gets no phone warning', () => {
  const r = checkSound(load('good-blip'));
  assert.ok(!has(r.warnings, /above 300 Hz/), show(r));
});

// ---- item 3: styles ------------------------------------------------------------------------------------
test('every style gets the one-shot checks, and each message names the style', () => {
  const r = checkSound(load('styles'));
  assert.deepEqual(r.errors, [], show(r));
  const style = (name, re) => assert.ok(r.warnings.some((m) => m.includes(`"${name}"`) && re.test(m)), `expected a warning naming "${name}" matching ${re}\n${show(r)}`);
  style('Cut short', /cut off/);
  style('Too long', /lasts 3\.02 s/);
  style('Boomy', /above 300 Hz/);
  style('Hot', /peak/);
  assert.ok(!r.warnings.some((m) => m.includes('"Fine"')), `the style that breaks nothing is not named\n${show(r)}`);
  const s = Object.fromEntries(r.metrics.styles.map((x) => [x.name, x]));
  assert.deepEqual(Object.keys(s), ['Fine', 'Cut short', 'Too long', 'Boomy', 'Hot']);
  assert.deepEqual(s.Fine.flags, []);
  assert.ok(s['Too long'].seconds > 3 && s.Boomy.above300 < 0.4 && s.Hot.rawPeak > 1 && s['Cut short'].endLevelDb > THRESHOLDS.styleCutOffDb);
  assert.deepEqual(r.metrics.presets, ['Fine', 'Cut short', 'Too long', 'Boomy', 'Hot'], 'metrics.presets is unchanged');
});
test('a silent style is still an error with the message it always had', () => {
  const p = load('param-silent');
  p.presets = { Mute: { level: p.params.find((q) => q.id === 'level').min } };
  const r = checkSound(p);
  assert.ok(has(r.errors, /^preset 'Mute' is silent$/), show(r));
});
test('the default is held to its type\'s length too', () => {
  const p = load('styles');
  p.params.find((q) => q.id === 'length').default = 2.5;
  const r = checkSound(p);
  assert.ok(has(r.warnings, /lasts 2\.52 s; a sound effect lasts 0\.03 to 2 s/), show(r));
  const j = checkSound(load('jingle'));
  assert.ok(!has(j.warnings, /a jingle lasts/) === (j.metrics.analysis.seconds >= 1 && j.metrics.analysis.seconds <= 6), show(j));
});

// ---- item 7: the report --------------------------------------------------------------------------------
test('the report prints crest factor and onset next to attack', () => {
  const cache = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quality-shape-')), 'quality.json');
  const r = spawnSync(process.execPath, ['tools/sfx.mjs', 'check', 'tests/fixtures/quality/sounds/good-blip.json', 'tests/fixtures/quality/sounds/styles.json', '--cache-file', cache], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  assert.match(r.stdout, /timing\s+onset \d+\.\d ms \(a click starts within 10 ms\) · attack \d+ ms \(time to the loudest moment\)/);
  assert.match(r.stdout, /crest \d+\.\d dB/);
  assert.match(r.stdout, /crest \d+\.\d dB \(peak over average level; a click should be above 10 dB\)/, 'for a hit, click, shot, step or pickup the crest rule is printed');
  assert.match(r.stdout, /above 300 Hz \d+%/);
  assert.match(r.stdout, /styles\s+Fine: \d\.\d\d s · above 300 Hz 100%.*\n\s+Cut short: .*← cut off/);
});
