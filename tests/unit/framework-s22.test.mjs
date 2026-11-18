// Framework additions made with batch S22 (derelict-boss, the roguelite kit's boss theme): electronic voices and a
// drum pattern for the music kit, in sound/compose.js.
//   halfTimeBeat   kick and snare rows for a half-time beat, or the same with the kick on every 8th note
//   subDrop        a sine that falls two octaves and dies away: the first beat of a section
//   chorus         two drifting, slightly detuned copies of any signal, one for each side
//   alarmTone      a thin, hard pulse that ignores the chords: a warning signal
// Everything is measured on small pieces built inline at a low sample rate: nobody here can listen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice, validatePatch } from '../../sound/sfx-engine.js';
import { clock, chords, drumRow, noteRow, sawBass, halfTimeBeat, subDrop, chorus, alarmTone } from '../../sound/compose.js';
import * as kit from '../../tools/compose/kit.mjs';

const META = { type: 'music', role: 'music/boss', themes: ['neutral'], gameTypes: ['arcade'], words: ['test', 'tune', 'tiny', 'loop', 'boss', 'synth'], license: 'draft' };
const SR = 8000, BPM = 120, STEP = (SR * 15) / BPM, BAR = STEP * 16;   // samples per 16th and per bar at 120 bpm

/** A small piece around the nodes under test: a clock, four chords in C minor, a noise source, and a plain mix of `out`. */
function piece(nodes, out = '0', { validate = false } = {}) {
  const patch = {
    format: 'sfxpatch/0.1', id: 's22-test', name: 'S22 test', category: 'music', description: 'test', meta: META,
    loop: true, wrap: true, normalize: false, gain: 1, duration: '8*4*60/bpm',
    params: [
      { id: 'bpm', label: 'Tempo', min: 100, max: 140, default: BPM },
      { id: 'key', label: 'Key', min: -5, max: 6, default: 0 },
      { id: 'bright', label: 'Brightness', min: 0, max: 1, default: 0.6 },
    ],
    nodes: [...clock(), ...chords('Cm Ab | Bb G', { tonic: 'C' }), { id: 'nz', type: 'noise' }, ...nodes.flat(Infinity)],
    out: [out, out],
  };
  if (validate) assert.deepEqual(validatePatch(patch).errors, []);
  return patch;
}
/** Runs a piece and returns, for each named node, its samples. */
function run(patch, ids, samples, params = {}) {
  const v = createVoice(patch, { sampleRate: SR, params });
  const idx = ids.map((id) => { const i = v.nodeIds.indexOf(id); assert.ok(i >= 0, `no node "${id}" (have ${v.nodeIds.join(' ')})`); return i; });
  const out = Object.fromEntries(ids.map((id) => [id, new Float32Array(samples)]));
  for (let s = 0; s < samples; s++) { v.tick(); ids.forEach((id, j) => { out[id][s] = v.nodeValues[idx[j]]; }); }
  return out;
}
const span = (a, b) => [Math.floor(a), Math.floor(b)];
const rms = (x, a = 0, b = x.length) => { const [i0, i1] = span(a, b); let sq = 0; for (let i = i0; i < i1; i++) sq += x[i] * x[i]; return Math.sqrt(sq / Math.max(1, i1 - i0)); };
const peak = (x, a = 0, b = x.length) => { const [i0, i1] = span(a, b); let p = 0; for (let i = i0; i < i1; i++) p = Math.max(p, Math.abs(x[i])); return p; };
const dB = (ratio) => 20 * Math.log10(ratio);
/** Zero crossings per second between two samples: a rough pitch (twice the frequency of a simple wave). */
const crossings = (x, a, b) => { const [i0, i1] = span(a, b); let n = 0; for (let i = i0 + 1; i < i1; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return (n * SR) / (i1 - i0); };
/** The share of a signal's energy in its sample-to-sample changes: higher is brighter. */
const edge = (x, a = 0, b = x.length) => { const [i0, i1] = span(a, b); let d = 0, e = 0; for (let i = i0 + 1; i < i1; i++) { d += (x[i] - x[i - 1]) ** 2; e += x[i] * x[i]; } return d / Math.max(e, 1e-12); };
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} is not within ${tol} of ${b}`);

test('S22 every new helper is exported by the kit too, and its nodes validate in a patch', () => {
  for (const name of ['halfTimeBeat', 'subDrop', 'chorus', 'alarmTone']) assert.equal(typeof kit[name], 'function', `kit.mjs passes on ${name}`);
  const beat = halfTimeBeat();
  piece([
    drumRow('kT', beat.kick), drumRow('sT', beat.snare),
    drumRow('bT', 'X.x.X.x.X.x.X.x.'), noteRow('bS', '0 _ 12 _ 0 _ 12 _'), sawBass('b', 'bT', { note: 36, semis: 'bS', drive: 4 }),
    drumRow('dT', 'X', { every: 128 }), subDrop('d', 'dT'),
    drumRow('alT', ['X.X.............', '................']), noteRow('alS', '0 0 -1 -1'), alarmTone('al', 'alT', { semis: 'alS' }),
    chorus('c', 'bO'),
  ], 'bO*0.4 + dO*0.4 + alO*0.2 + cL*0.2', { validate: true });
});

test('S22 halfTimeBeat: the snare falls on beat 3 only, the kick on beat 1, and "driving" puts the kick on every 8th', () => {
  const plain = halfTimeBeat({ fill: false }), filled = halfTimeBeat(), driving = halfTimeBeat({ driving: true });
  for (const beat of [plain, filled, driving]) {
    assert.deepEqual(Object.keys(beat), ['kick', 'snare']);
    for (const rows of [beat.kick, beat.snare]) {
      assert.equal(rows.length, 8, 'eight bars');
      for (const bar of rows) assert.match(bar, /^[Xxo.]{16}$/, 'one mark per 16th');
    }
    for (const bar of beat.kick) assert.equal(bar[0], 'X', 'the kick is on beat 1 of every bar');
    for (const bar of beat.snare) assert.equal(bar[8], 'X', 'the snare is on beat 3 of every bar');
    for (const bar of beat.snare) assert.equal(bar.slice(0, 8), '........', 'and never in the first half of a bar: that is what makes it half time');
    assert.equal(drumRow('kT', beat.kick).type, 'pattern');
    assert.equal(drumRow('sT', beat.snare).type, 'pattern');
  }
  for (const bar of plain.snare) assert.equal(bar, '........X.......', 'without fills the snare is beat 3 alone');
  for (const bar of plain.kick) assert.ok([...bar].filter((c) => c !== '.').length <= 3, 'a half-time kick is sparse');
  for (const bar of plain.kick) assert.equal(bar[8], '.', 'the kick leaves beat 3 to the snare');
  assert.notDeepEqual(filled.snare, plain.snare, 'fills change the end of a phrase');
  assert.deepEqual(filled.snare.slice(0, 3), plain.snare.slice(0, 3), 'and only bars 4 and 8');
  assert.equal(filled.snare[7].slice(0, 12), plain.snare[7].slice(0, 12), 'a fill is in the last beat of its bar');
  for (const bar of driving.kick) for (let i = 0; i < 16; i++) assert.equal(bar[i] !== '.', i % 2 === 0, 'driving: a kick on every 8th note and none between');
  assert.deepEqual(halfTimeBeat({ driving: true, fill: false }).snare, plain.snare, 'driving keeps the snare where it was');
});

test('S22 subDrop: starts on the pitch given, falls the octaves given in the time given, and dies away', () => {
  const nodes = [drumRow('dT', ['....X...........', '................']), subDrop('d', 'dT', { from: '400', octaves: 2, fall: 0.25, decay: 0.5 })];
  const r = run(piece(nodes), ['dO', 'dP', 'dA'], BAR * 2);
  const t0 = STEP * 4;
  assert.ok(peak(r.dO, 0, t0 - 1) === 0, 'silent until its row fires');
  near(r.dP[Math.floor(t0) + 1], 1, 0.01, 'the fall starts at the pitch given');
  near(r.dP[Math.floor(t0 + 0.125 * SR)], 0.5, 0.02, 'half way through the fall it is an octave down (the fall is even in pitch)');
  near(r.dP[Math.floor(t0 + 0.3 * SR)], 0.25, 0.001, 'two octaves down at the end, and it stays there');
  const early = crossings(r.dO, t0, t0 + 0.03 * SR), late = crossings(r.dO, t0 + 0.26 * SR, t0 + 0.4 * SR);
  near(early, 2 * 400 * 0.93, 90, 'it starts near 400 Hz');
  near(late, 2 * 100, 20, 'and ends at 100 Hz');
  assert.ok(peak(r.dO) <= 1 && peak(r.dO) > 0.9, 'full level, never more');
  assert.ok(rms(r.dO, t0 + 0.9 * SR, t0 + 1.0 * SR) < 1e-4, 'gone after the fall and the decay');
  // the default starts on the chord's root, an octave above the bass
  const d = run(piece([nodes[0], subDrop('d', 'dT')]), ['dW', 'dP', 'dO'], Math.floor(t0) + 400);
  near(crossings(d.dO, t0, t0 + 0.04 * SR), 2 * hz(48) * 0.96, 40, 'default: from C3 in a bar of C minor');
});

test('S22 chorus: two copies at the level of the input, drifting apart in pitch, one for each side', () => {
  const tone = [{ id: 'x', type: 'osc', freq: 440 }];
  const n = SR * 4;
  const r = run(piece([tone, chorus('c', 'x', { depth: '1', rate: 0.5 })]), ['x', 'cL', 'cR'], n);
  near(dB(rms(r.cL, SR) / rms(r.x, SR)), 0, 0.3, 'left copy: the level of the input');
  near(dB(rms(r.cR, SR) / rms(r.x, SR)), 0, 0.3, 'right copy: the level of the input');
  // the drift is slowest to change at the top of its swing, a quarter of a cycle in: the pitches are furthest apart at 0, 1, 2 s
  const fL = crossings(r.cL, 1.9 * SR, 2.1 * SR) / 2, fR = crossings(r.cR, 1.9 * SR, 2.1 * SR) / 2;
  assert.ok(Math.abs(fL - fR) > 3, `the copies are detuned against each other (${fL.toFixed(1)} and ${fR.toFixed(1)} Hz)`);
  assert.ok(Math.abs(fL - 440) < 12 && Math.abs(fR - 440) < 12, 'by cents, not by notes');
  assert.ok((fL - 440) * (fR - 440) < 0, 'one above the note while the other is below');
  const whole = (crossings(r.cL, SR, 3 * SR) + crossings(r.cR, SR, 3 * SR)) / 4;
  near(whole, 440, 0.6, 'over a whole swing the pitch is the pitch played');
  const still = run(piece([tone, chorus('c', 'x', { depth: '0' })]), ['cL', 'cR'], SR);
  let diff = 0; for (let i = 0; i < SR; i++) diff = Math.max(diff, Math.abs(still.cL[i] - still.cR[i]));
  assert.ok(diff < 1e-6, 'depth 0: the two copies are the same');
  const shallow = run(piece([tone, chorus('c', 'x', { depth: '0.3', rate: 0.5 })]), ['cL', 'cR'], n);
  const gap = (q) => Math.abs(crossings(q.cL, 1.9 * SR, 2.1 * SR) - crossings(q.cR, 1.9 * SR, 2.1 * SR));
  assert.ok(gap(shallow) < gap(r), 'less depth, less detune');
});

test('S22 alarmTone: sounds on its row at the notes its note row gives, whatever the chord, and follows the Key control', () => {
  const nodes = [drumRow('alT', 'X...X...........'), noteRow('alS', '0 _ _ _ -1 _ _ _'), alarmTone('al', 'alT', { semis: 'alS', base: 72, decay: 0.08 })];
  const r = run(piece(nodes), ['alHz', 'alO', 'alA'], BAR * 2);
  near(r.alHz[10], hz(72), 0.01, 'first note: C5');
  near(r.alHz[Math.floor(STEP * 4) + 10], hz(71), 0.01, 'second note: a semitone below');
  near(r.alHz[Math.floor(BAR) + 10], hz(72), 0.01, 'bar 2 (Ab): the alarm does not follow the chords');
  assert.ok(peak(r.alO) <= 1 && peak(r.alO) > 0.5, `bounded and loud (peak ${peak(r.alO).toFixed(2)})`);
  assert.ok(rms(r.alO, STEP * 2.5, STEP * 4 - 2) < 0.01, 'short: silent again before the second note');
  assert.ok(rms(r.alO, STEP * 8, BAR - 2) < 1e-4, 'and silent for the rest of the bar');
  near(crossings(r.alO, 0.01 * SR, 0.05 * SR) / 2, hz(72), 60, 'the pitch heard is the pitch written');
  const k = run(piece(nodes), ['alHz'], 100, { key: -2 });
  near(k.alHz[10], hz(70), 0.01, 'Key moves it by whole semitones');
  const soft = run(piece([nodes.slice(0, 2), alarmTone('al', 'alT', { semis: 'alS', base: 72, grit: '0' })]), ['alO'], BAR).alO;
  const hard = run(piece([nodes.slice(0, 2), alarmTone('al', 'alT', { semis: 'alS', base: 72, grit: '1' })]), ['alO'], BAR).alO;
  assert.ok(edge(hard) > edge(soft), 'grit makes it harsher');
  near(dB(rms(hard) / rms(soft)), 0, 3, 'without changing its level much');
});
