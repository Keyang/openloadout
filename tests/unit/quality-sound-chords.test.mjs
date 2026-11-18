// The sound quality bar, M-chords (added 2026-11-18): each bar of a track sounds its written chord,
// and little of the pitched sound is on notes that none of the chords use (a tune a semitone off).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSound, writtenChords, THRESHOLDS } from '../../quality/sound.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'quality', 'sounds');
const load = (name) => JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
const has = (list, re) => list.some((m) => re.test(m));
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;
const node = (p, id) => p.nodes.find((n) => n.id === id);
// one render instead of the whole bar: these tests are about the chords
const lean = (p) => ({ ...p, params: p.params.map((q) => ({ ...q })), presets: undefined });

test('writtenChords reads the chords the kit writes: nodes tonic, root, third and fifth', () => {
  const w = writtenChords(load('music-chords'));
  assert.equal(w.tonic, 0);
  assert.equal(w.tonicFrom, 'tonic');
  assert.deepEqual(w.bars.map((b) => b.name), ['C E G', 'F A C', 'G B D', 'C E G']);
  assert.deepEqual(w.bars[1].notes, [5, 9, 0]);
});
test('writtenChords: an older patch with no tonic node takes the tonic from the bass, the lowest midi(n + tr)', () => {
  const p = load('music-chords');
  p.nodes = p.nodes.filter((n) => n.id !== 'tonic' && n.id !== 'fifth');
  const w = writtenChords(p);
  assert.equal(w.tonic, 0);
  assert.equal(w.tonicFrom, 'bass');
  assert.deepEqual(w.bars.map((b) => b.name), ['C E G', 'F A C', 'G B D', 'C E G'], 'with no fifth node the fifth is 7 semitones');
  node(p, 'bO').freq = 'midi(45 + tr)';
  assert.equal(writtenChords(p).tonic, 9, '45 is an A');
});
test('writtenChords: the key control\'s default moves every chord; a patch with no chord nodes has none', () => {
  const p = load('music-chords');
  p.params.push({ id: 'key', label: 'Key', min: -5, max: 6, default: 2 });
  assert.deepEqual(writtenChords(p).bars[0].name, 'D F# A');
  assert.equal(writtenChords(load('music-good')), null);
});

test('a track whose bars sound their written chords passes, and the bars are in the metrics', () => {
  const r = checkSound(lean(load('music-chords')));
  assert.deepEqual(r.errors, [], show(r));
  assert.ok(!has(r.warnings, /chord|semitone/), show(r));
  const c = r.metrics.music.chords;
  assert.equal(c.bars.length, 4);
  assert.equal(c.matched, 4);
  assert.ok(c.outOfKey < THRESHOLDS.outOfKeyMax, `out of key ${c.outOfKey}`);
  assert.deepEqual(c.bars[0].written, 'C E G');
  assert.equal(c.bars[0].top.length, 3);
  assert.equal(c.bars[0].match, true);
});
test('bars that sound other chords than the written ones are an error naming the bars', () => {
  const p = lean(load('music-chords'));
  // the bass and the pad now follow a row one bar late; the written chords (root) stay
  p.nodes.push({ id: 'late', type: 'seq', trig: 'c16', every: 16, loop: true, steps: '0 0 5 7' });
  node(p, 'tr').expr = 'late';
  node(p, 'lS').steps = '12 _ 16 _ 19 _ _ _ 16 _ 14 _ 12 _ _ _ | 12 _ 16 _ 19 _ _ _ 16 _ 14 _ 12 _ _ _ | 17 _ 21 _ 24 _ _ _ 21 _ 19 _ 17 _ _ _ | 19 _ 23 _ 26 _ _ _ 23 _ 21 _ 19 _ _ _';
  const r = checkSound(p);
  const e = r.errors.find((m) => /written chord/.test(m));
  assert.ok(e, show(r));
  assert.match(e, /only 1 of 4 bars/);
  assert.match(e, /bar 2 is written F A C but its strongest notes are /);
  assert.match(e, /75%/);
  assert.equal(r.metrics.music.chords.matched, 1);
});
test('a tune a semitone off its chords is caught', () => {
  const p = lean(load('music-chords'));
  for (const id of ['soft', 'buzzy']) node(p, id).freq = 'midi(61 + lS)';
  const r = checkSound(p);
  const w = [...r.warnings, ...r.errors].find((m) => /semitone/.test(m));
  assert.ok(w, show(r));
  assert.match(w, /\d+% of the pitched sound is on notes that none of the written chords use/);
  assert.ok(r.metrics.music.chords.outOfKey > THRESHOLDS.outOfKeyMax);
});
test('a track that does not write its chords gets a warning that says what to write', () => {
  const r = checkSound(lean(load('music-good')));
  assert.deepEqual(r.errors, [], show(r));
  const w = r.warnings.find((m) => /chords/.test(m));
  assert.ok(w, show(r));
  assert.match(w, /tonic.*root.*third.*fifth/);
  assert.equal(r.metrics.music.chords, null);
});
test('chords are a music check only: a jingle is not asked for them', () => {
  const r = checkSound(load('jingle'));
  assert.ok(!has([...r.errors, ...r.warnings], /chord/), show(r));
});
