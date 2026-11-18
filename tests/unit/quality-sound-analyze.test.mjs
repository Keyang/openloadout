// The measurements the sound quality bar added on 2026-11-18 (sound/analyze.js): where a sound starts,
// where its note starts are, how much of it a phone can play, and which notes sound in each bar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, onsetMs, onsets, onsetShift, barPitchClasses, PITCH_NAMES } from '../../sound/analyze.js';

const SR = 44100;
const tone = (hz, seconds, amp = 1) => Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR));
/** Short decaying ticks at the given times (seconds). */
function ticks(times, seconds, hz = 1000) {
  const x = new Float32Array(Math.round(seconds * SR));
  for (const t of times) { const a = Math.round(t * SR); for (let i = 0; i < 2000 && a + i < x.length; i++) x[a + i] += Math.exp(-i / 300) * Math.sin((2 * Math.PI * hz * i) / SR); }
  return x;
}

test('onsetMs: the first moment a sound comes within 20 dB of its loudest, however late the loudest moment is', () => {
  const x = new Float32Array(SR / 2);
  x.set(tone(800, 0.1, 0.4), 0);                 // a quiet first note, at once
  x.set(tone(1200, 0.1, 1), Math.round(0.3 * SR)); // the loudest note, 300 ms in
  assert.ok(onsetMs(x, SR) < 2, `onset ${onsetMs(x, SR)}`);
  const a = analyze(x, SR);
  assert.ok(a.attackMs > 250, 'time to the loudest sample is still reported');
  assert.ok(Math.abs(a.onsetMs - onsetMs(x, SR)) < 1e-9, 'analyze() reports the onset too');
});
test('onsetMs: a swell starts late; a lower threshold finds it earlier', () => {
  const x = tone(600, 0.5).map((v, i) => v * Math.min(1, i / (0.2 * SR)));
  const at20 = onsetMs(x, SR), at40 = onsetMs(x, SR, -40);
  assert.ok(at20 > 15 && at20 < 30, `-20 dB of a 200 ms linear rise is about 20 ms, got ${at20}`);
  assert.ok(at40 < at20);
  assert.equal(onsetMs(new Float32Array(100), SR), 0, 'silence has no onset');
});
test('analyze: above300 is the share of energy a phone speaker can play', () => {
  assert.ok(analyze(tone(100, 0.5), SR).above300 < 0.05);
  assert.ok(analyze(tone(1000, 0.5), SR).above300 > 0.95);
  const a = analyze(tone(1000, 0.5), SR);
  assert.ok(Math.abs(a.above300 - (1 - a.bands['sub <80'] - a.bands['low 80-300'])) < 1e-9);
});
test('onsets: finds each note start', () => {
  const times = [0.1, 0.35, 0.6, 0.85];
  const found = onsets(ticks(times, 1.2), SR);
  assert.equal(found.length, times.length, `found ${found.map((t) => t.toFixed(3))}`);
  found.forEach((t, i) => assert.ok(Math.abs(t - times[i]) < 0.012, `onset ${i} at ${t}`));
});
test('onsetShift: how far note starts move between two renders', () => {
  const straight = onsets(ticks([0.1, 0.35, 0.6, 0.85], 1.2), SR);
  const swung = onsets(ticks([0.1, 0.39, 0.6, 0.89], 1.2), SR);
  const same = onsetShift(straight, straight), moved = onsetShift(straight, swung);
  assert.equal(same.ms, 0);
  assert.ok(moved.ms > 30 && moved.ms < 50, `two of four ticks moved 40 ms, got ${moved.ms}`);
  assert.ok(Math.abs(moved.moved - 0.5) < 0.01, `half of the note starts moved, got ${moved.moved}`);
  assert.equal(onsetShift([], []).ms, 0);
});
test('barPitchClasses: the share of pitched energy on each of the 12 notes, bar by bar', () => {
  const midi = (m) => 440 * 2 ** ((m - 69) / 12);
  const bar = (notes) => { const x = new Float32Array(SR); for (const m of notes) { const t = tone(midi(m), 1, 1 / notes.length); for (let i = 0; i < SR; i++) x[i] += t[i]; } return x; };
  const x = new Float32Array(2 * SR);
  x.set(bar([60, 64, 67]), 0);   // C E G
  x.set(bar([62, 65, 69]), SR);  // D F A
  const pcs = barPitchClasses(x, SR, 2);
  assert.equal(pcs.length, 2);
  assert.equal(pcs[0].length, 12);
  const top3 = (p) => [...p.keys()].sort((a, b) => p[b] - p[a]).slice(0, 3).map((i) => PITCH_NAMES[i]).sort();
  assert.deepEqual(top3(pcs[0]), ['C', 'E', 'G']);
  assert.deepEqual(top3(pcs[1]), ['A', 'D', 'F']);
  assert.ok(Math.abs(pcs[0].reduce((a, v) => a + v, 0) - 1) < 1e-6, 'shares add up to 1');
  assert.deepEqual([...barPitchClasses(new Float32Array(SR), SR, 1)[0]], new Array(12).fill(0), 'a silent bar has no notes');
});
