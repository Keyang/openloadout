// Framework additions made with hearthvale-village (batch R21), at the end of sound/compose.js:
//   clockEighths, ringRows, pluckedString, struckBell, roundBass, handDrum, shaker
// Everything is checked on a tiny piece built here, by reading node values: nobody here can listen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoice, validatePatch } from '../../sound/sfx-engine.js';
import {
  KitError, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble,
  clockEighths, ringRows, pluckedString, struckBell, roundBass, handDrum, shaker,
} from '../../sound/compose.js';
import * as kit from '../../tools/compose/kit.mjs';

const META = { type: 'music', role: 'music/exploration', themes: ['neutral'], gameTypes: ['arcade'], words: ['test', 'tune', 'tiny', 'loop', 'walk', 'strings'], license: 'draft' };
const SR = 8000, BPM = 120, STEP = (SR * 60) / BPM / 4;      // 1000 samples to a 16th note

function piece({ theClock = clockEighths({ swing: 'swing' }), extra = [], mix = 'r1O + r2O + q1O + bO + dO + kO' } = {}) {
  return assemble({
    id: 'tiny-walk', name: 'Tiny walk', description: 'A test piece.', meta: META,
    tempo: [100, 140, 120], defaults: { intensity: 1, bars: 8, inst: 'Flute' },
    extraParams: [{ id: 'swing', label: 'Lilt', min: 0, max: 1, default: 0 }],
    nodes: [
      theClock, chords('F C | Dm Bb', { tonic: 'F', low: 0 }), arrangement({ all: {} }),
      { id: 'nz', type: 'noise' },
      ringRows('r', '0 _ 4- _ 7 _ 4- _ 0 _ 4- _ 7 _ 12-- _'),
      pluckedString('r1', 'rG1', 'midi(53 + round(key) + rS1)'),
      pluckedString('r2', 'rG2', 'midi(53 + round(key) + rS2)', { ring: 0.8 }),
      drumRow('qT', 'X...............'),
      struckBell('q1', 'qT', 'midi(77 + round(key))'),
      drumRow('bT', 'X.......x.......'), noteRow('bS', '0 _ _ _ _ _ _ _ 7 _ _ _ _ _ _ _'), roundBass('b', 'bT', { semis: 'bS' }),
      drumRow('dT', '....X.......X...'), handDrum('d', 'dT', { pitch: 'midi(41 + tr)', noise: 'nz' }),
      drumRow('kT', 'x.o.x.o.x.o.x.o.'), shaker('k', 'kT', { noise: 'nz' }),
      melody('l', ['F4 _ _ _ _ _ A4 _ C5 _ _ _ _ _ _ _', 'E4 _ _ _ _ _ G4 _ C5 _ _ _ _ _ _ _']),
      instruments('l', { noise: 'nz' }),
      ...extra,
      bus({ centre: 'bO*0.3 + dO*0.4 + kO*0.3', left: `(${mix})*0.2 + lF*0.5`, right: `(${mix})*0.2 + lF*0.5` }),
    ],
    presets: { One: { intensity: 0.3 }, Two: { intensity: 0.6 }, Three: { intensity: 1 } },
  });
}

const index = (voice, id) => { const i = voice.nodeIds.indexOf(id); assert.ok(i >= 0, `no node "${id}"`); return i; };
/** Runs a piece for a number of seconds: per node asked for, its peak, its samples, and the sample of every clock tick. */
function run(patch, ids, { seconds = 4, params = {} } = {}) {
  const voice = createVoice(patch, { sampleRate: SR, params: { bpm: BPM, ...params } });
  const at = ids.map((id) => index(voice, id)), iClock = index(voice, 'c16');
  const n = Math.round(seconds * SR), out = ids.map(() => new Float64Array(n)), ticks = [];
  for (let s = 0; s < n; s++) {
    voice.tick();
    if (voice.nodeValues[iClock] > 0) ticks.push(s);
    at.forEach((k, j) => { out[j][s] = voice.nodeValues[k]; });
  }
  const res = Object.fromEntries(ids.map((id, j) => [id, { samples: out[j], peak: out[j].reduce((m, x) => Math.max(m, Math.abs(x)), 0) }]));
  res.ticks = ticks;
  return res;
}
/** The strongest frequency of a stretch of samples between two limits, by counting how well each candidate fits (a slow, plain DFT). */
function strongest(samples, from, to, lo, hi) {
  let best = 0, bestHz = 0;
  for (let hz = lo; hz <= hi; hz += 1) {
    let re = 0, im = 0;
    for (let i = from; i < to; i++) { const a = (2 * Math.PI * hz * i) / SR; re += samples[i] * Math.cos(a); im += samples[i] * Math.sin(a); }
    const p = re * re + im * im;
    if (p > best) { best = p; bestHz = hz; }
  }
  return bestHz;
}
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
const mean = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i]; return s / (b - a); };

// ---- clockEighths -------------------------------------------------------------------------------------

test('clockEighths: straight at 0, and the same nodes as clock() plus c8p', () => {
  const nodes = clockEighths();
  assert.deepEqual(nodes.map((n) => n.id), ['c16', 'c16p', 'c8w', 'c8p']);
  assert.equal(nodes[0].rate, clock()[0].rate, 'with no swing the rate is the plain 16th clock');
  const r = run(piece(), ['c8p', 'c16p'], { seconds: 2, params: { swing: 0 } });
  assert.equal(r.ticks.length, 16, 'sixteen 16ths in a bar of 2 s');
  r.ticks.forEach((t, i) => assert.ok(Math.abs(t - i * STEP) <= 1, `tick ${i} at ${t}`));
  // c8p is 1 through the first 8th of each beat, 0 through the second; c16p alternates as in clock()
  for (let i = 0; i < 16; i++) {
    assert.equal(r.c8p.samples[r.ticks[i] + 10], i % 4 < 2 ? 1 : 0, `c8p in step ${i}`);
    assert.equal(r.c16p.samples[r.ticks[i] + 10], i % 2 === 0 ? 1 : 0, `c16p in step ${i}`);
  }
});

test('clockEighths: swing moves the 8th between two beats late, never the beat, and both its 16ths together', () => {
  for (const swing of [0.5, 1]) {
    const r = run(piece(), ['c8p'], { seconds: 4, params: { swing } });
    const a = swing / 3;                                     // long 16ths last (1 + a) steps, short ones (1 - a)
    assert.equal(r.ticks.length, 32, 'two bars still hold 32 steps: the tempo is exact');
    for (let i = 0; i < 32; i++) {
      const inBeat = i % 4, beat = Math.floor(i / 4) * 4 * STEP;
      const want = beat + [0, 1 + a, 2 + 2 * a, 3 + a][inBeat] * STEP;
      assert.ok(Math.abs(r.ticks[i] - want) <= 3, `swing ${swing}: step ${i} at ${r.ticks[i]}, expected ${want.toFixed(0)}`);
    }
  }
  // at 1 the off-beat 8th falls two thirds of the way through the beat: a triplet shuffle
  const r = run(piece(), ['c8p'], { seconds: 1, params: { swing: 1 } });
  assert.ok(Math.abs(r.ticks[2] - (4 * STEP * 2) / 3) <= 3);
});

test('clockEighths: clock() would leave a piece written in 8ths untouched; this one moves it', () => {
  const plain = run(piece({ theClock: [...clock({ swing: 'swing' }), { id: 'c8p', type: 'expr', expr: '0' }] }), ['c8p'], { seconds: 2, params: { swing: 1 } });
  const lilt = run(piece(), ['c8p'], { seconds: 2, params: { swing: 1 } });
  for (const i of [2, 6, 10, 14]) {
    assert.ok(Math.abs(plain.ticks[i] - i * STEP) <= 2, 'clock(): the off-beat 8th stays put');
    assert.ok(lilt.ticks[i] - i * STEP > 0.6 * STEP, 'clockEighths: the off-beat 8th is late');
  }
  for (const i of [0, 4, 8, 12]) assert.ok(Math.abs(lilt.ticks[i] - i * STEP) <= 3, 'the beat does not move');
});

test('clockEighths: a piece made with it assembles (one clock named c16) and loops exactly', () => {
  const patch = piece();
  assert.deepEqual(validatePatch(patch).errors, []);
  assert.equal(patch.nodes.filter((n) => n.type === 'clock').length, 1);
  // after a whole number of bars the clock is back on the bar line, at any swing
  const r = run(patch, ['c8p'], { seconds: 16.01, params: { swing: 0.7 } });
  assert.ok(Math.abs(r.ticks[128] - 128 * STEP) <= 4, `step 128 at ${r.ticks[128]}`);
});

// ---- ringRows --------------------------------------------------------------------------------------------

test('ringRows: notes are dealt in turn, and each voice holds its own last note', () => {
  const rows = ringRows('r', '0 _ 4- _ 7 _ 4- _ 0 _ 4- _ 7 _ 12-- _');
  assert.deepEqual(rows.map((n) => n.id), ['rG1', 'rS1', 'rG2', 'rS2']);
  assert.deepEqual(rows.counts, [4, 4]);
  assert.equal(rows[0].steps, 'X...X...X...X...', 'voice 1 takes the 1st, 3rd, 5th and 7th note');
  assert.equal(rows[2].steps, '..x...x...x...o.', 'voice 2 the others, with their marks (- is x, -- is o)');
  assert.equal(rows[1].steps, '0 0 0 0 7 7 7 7 0 0 0 0 7 7 7 7');
  // before its first note of the loop a voice holds its last note of the loop (12), so a ringing string does not jump
  assert.equal(rows[3].steps, '12 12 4 4 4 4 4 4 4 4 4 4 4 4 12 12');
  for (const n of rows) { assert.equal(n.trig, 'c16'); if (n.type === 'seq') assert.equal(n.loop, true); }
});

test('ringRows: a list of bars, three voices, empty steps as "." and negative notes', () => {
  const rows = ringRows('h', ['-3 . 0 . 5 . 9 . . . . . . . . .', '_ _ _ _ _ _ _ _ 12 _ _ _ _ _ _ _'], { voices: 3 });
  assert.deepEqual(rows.map((n) => n.id), ['hG1', 'hS1', 'hG2', 'hS2', 'hG3', 'hS3']);
  assert.deepEqual(rows.counts, [2, 2, 1]);
  assert.equal(rows[0].steps, 'X.....X.........|................');
  assert.equal(rows[1].steps, '9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 | 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9 9'.replace(/^9 9 9 9 9 9/, '-3 -3 -3 -3 -3 -3'));
  assert.equal(rows[2].steps, '..X.............|........X.......');
  assert.equal(rows[5].steps.split(' ').filter((x) => x !== '|').every((x) => x === '5'), true, 'a voice with one note holds it all the way round');
});

test('ringRows: refuses what cannot be played', () => {
  assert.throws(() => ringRows('r', '0 _ 4 _ x _ 4 _'), (e) => e instanceof KitError && /"x" is not a note/.test(e.message));
  assert.throws(() => ringRows('r', '0 _ _ _', { voices: 2 }), (e) => e instanceof KitError && /every voice needs a note/.test(e.message));
  assert.throws(() => ringRows('r', '0 _ 4 _ 7', { voices: 2 }), (e) => e instanceof KitError && /do not divide/.test(e.message));
  assert.throws(() => ringRows('r', '0 _ 4 _', { voices: 0 }), KitError);
  assert.throws(() => ringRows('1r', '0 _ 4 _'), (e) => e instanceof KitError && /letters and digits/.test(e.message));
  assert.throws(() => ringRows('r', ['0 _ 4 _']), (e) => e instanceof KitError && /bar 1 has 4 steps/.test(e.message));
});

// ---- pluckedString ---------------------------------------------------------------------------------------------

test('pluckedString: plays the note of its row, rings on while the other string plays, and has no DC', () => {
  const r = run(piece(), ['r1O', 'r2O', 'r1X', 'r1V', 'r2V'], { seconds: 2 });
  // string 1 is plucked on steps 0, 4, 8, 12 with F3, C4, F3, C4 (0, 7 above F3 = midi 53)
  // (looked for near the note itself: a short pick puts more into a low string's octave than into its first partial)
  assert.ok(Math.abs(strongest(r.r1O.samples, 200, 3800, 150, 200) - hz(53)) <= 3, 'step 0: F3');
  assert.ok(Math.abs(strongest(r.r1O.samples, 4200, 7800, 235, 290) - hz(60)) <= 4, 'step 4: C4');
  // string 2 is plucked on steps 2, 6, 10 with A3 (4) and on 14 with F4 (12)
  assert.ok(Math.abs(strongest(r.r2O.samples, 2200, 5800, 200, 240) - hz(57)) <= 3, 'step 2: A3');
  // string 1 still rings 3 steps after its pluck, while string 2 has been plucked: the notes overlap
  assert.ok(rms(r.r1O.samples, 3000, 3900) > 0.004, 'string 1 rings on (at this low sample rate it fades faster than at 44.1 kHz)');
  assert.ok(rms(r.r2O.samples, 0, 1900) < 1e-9, 'string 2 is silent until its first pluck');
  // a peak near 1, so the gain written in the mix is the level; no DC
  assert.ok(r.r1O.peak > 0.4 && r.r1O.peak < 2, `peak ${r.r1O.peak}`);
  assert.ok(Math.abs(mean(r.r1O.samples, 0, 16000)) < 0.01 * rms(r.r1O.samples, 0, 16000) + 1e-4, 'no DC');
  // the pick is one swing up and one down
  assert.ok(Math.abs(mean(r.r1X.samples, 0, 3000)) < 1e-3);
  // marks set the level: voice 2 plays x (0.7) and one o (0.4)
  assert.equal(r.r1V.samples[100], 1);
  assert.ok(Math.abs(r.r2V.samples[2500] - 0.7) < 1e-9 && Math.abs(r.r2V.samples[14500] - 0.4) < 1e-9);
});

test('pluckedString: ring sets how long, and it never uses the noise burst of the pluck node', () => {
  const nodes = pluckedString('s', 'sG', 'midi(60)', { ring: 0.5, damp: 0.4, pick: 0.002 });
  assert.deepEqual(nodes.map((n) => n.id), ['sV', 'sX', 'sW', 'sO']);
  const w = nodes[2];
  assert.deepEqual([w.type, w.trig, w.decay, w.damp], ['pluck', 0, 0.5, 0.4]);
  assert.equal(nodes[3].mode, 'hp');
  // the short string (ring 0.8) has died away more than the long one (1.6) half a second after a pluck of the same strength
  const r = run(piece({ extra: [
    drumRow('zT', 'X...............'),
    pluckedString('za', 'zT', 'midi(60)', { ring: 1.6 }), pluckedString('zb', 'zT', 'midi(60)', { ring: 0.4 }),
  ] }), ['zaO', 'zbO'], { seconds: 1 });
  assert.ok(rms(r.zaO.samples, 3000, 4000) > 3 * rms(r.zbO.samples, 3000, 4000));
  assert.throws(() => pluckedString('s'), (e) => e instanceof KitError && /give trig/.test(e.message));
  assert.throws(() => pluckedString('s', 'sG'), (e) => e instanceof KitError && /give freq/.test(e.message));
});

// ---- struckBell ----------------------------------------------------------------------------------------------------

test('struckBell: rings at its pitch, peaks near 1 at any sample rate, and dies away', () => {
  const patch = piece();
  const r = run(patch, ['q1O', 'q1X'], { seconds: 2 });
  assert.ok(Math.abs(strongest(r.q1O.samples, 100, 4000, 500, 900) - hz(77)) <= 4, 'F5');
  assert.ok(r.q1O.peak > 0.3 && r.q1O.peak < 1.6, `peak ${r.q1O.peak}`);
  assert.ok(rms(r.q1O.samples, 12000, 16000) < 0.25 * rms(r.q1O.samples, 0, 4000), 'the ring falls away');
  // the same bell at another sample rate is about as loud: the tap is scaled by its length in samples
  const peakAt = (sr) => {
    const v = createVoice(patch, { sampleRate: sr, params: { bpm: BPM } }), k = v.nodeIds.indexOf('q1O');
    let p = 0; for (let s = 0; s < sr / 2; s++) { v.tick(); p = Math.max(p, Math.abs(v.nodeValues[k])); }
    return p;
  };
  const lo = peakAt(22050), hi = peakAt(44100);
  assert.ok(Math.abs(20 * Math.log10(hi / lo)) < 1.5, `peak ${lo.toFixed(2)} at 22.05 kHz, ${hi.toFixed(2)} at 44.1 kHz`);
});

test('struckBell: the partials are yours, and bad ones are refused', () => {
  const nodes = struckBell('q', 'qT', 'midi(72)', { ring: 2, ratios: [1, 2.76, 5.4], gains: [1, 0.5, 0.25] });
  assert.deepEqual(nodes.map((n) => n.id), ['qV', 'qX', 'qO']);
  assert.deepEqual([nodes[2].type, nodes[2].decay], ['modal', 2]);
  assert.deepEqual(nodes[2].ratios, [1, 2.76, 5.4]);
  assert.throws(() => struckBell('q', 'qT', 'midi(72)', { ratios: [1, 2], gains: [1] }), (e) => e instanceof KitError && /one level per partial/.test(e.message));
  assert.throws(() => struckBell('q', 'qT', 'midi(72)', { strike: 0 }), KitError);
  assert.throws(() => struckBell('q', 'qT'), (e) => e instanceof KitError && /give freq/.test(e.message));
});

// ---- roundBass, handDrum, shaker --------------------------------------------------------------------------------------

test('roundBass: the root on beat 1, the note of its row on beat 3, in every chord', () => {
  const r = run(piece(), ['bO', 'bHz', 'bV'], { seconds: 8 });
  // bars of 2 s: F, C, Dm, Bb with low 0 -> roots 0, 7, 9, 5 above F2 (midi 41); beat 3 is a fifth higher
  const roots = [0, 7, 9, 5];
  roots.forEach((root, bar) => {
    const s = bar * 16000;
    assert.ok(Math.abs(r.bHz.samples[s + 500] - hz(41 + root)) < 0.01, `bar ${bar + 1}, beat 1`);
    assert.ok(Math.abs(r.bHz.samples[s + 8500] - hz(41 + root + 7)) < 0.01, `bar ${bar + 1}, beat 3`);
  });
  assert.ok(Math.abs(strongest(r.bO.samples, 200, 4000, 60, 200) - hz(41)) <= 2, 'it sounds F2');
  assert.ok(r.bO.peak > 0.5 && r.bO.peak < 1.8, `peak ${r.bO.peak}`);
  assert.equal(r.bV.samples[100], 1); assert.ok(Math.abs(r.bV.samples[8500] - 0.7) < 1e-9, 'x on beat 3 is softer');
  // a soft start: nothing in the first sample, and silence before the next note
  assert.ok(Math.abs(r.bO.samples[0]) < 0.01);
  assert.ok(rms(r.bO.samples, 7000, 7900) < 0.02, 'it has died away before beat 3');
  assert.throws(() => roundBass('b'), (e) => e instanceof KitError && /give trig/.test(e.message));
});

test('handDrum: a thump on the chord root with a palm slap, on 2 and 4 only', () => {
  const r = run(piece(), ['dO', 'dW', 'dP', 'dB'], { seconds: 2 });
  assert.ok(rms(r.dO.samples, 0, 3900) < 1e-9, 'silent on beat 1');
  assert.ok(rms(r.dO.samples, 4000, 5500) > 0.05, 'beat 2');
  assert.ok(rms(r.dO.samples, 8500, 11900) < 0.01, 'gone by beat 3');
  // it lands on F2 (the root of the bar) after starting higher
  assert.ok(r.dP.samples[4002] > 1.4 && Math.abs(r.dP.samples[4600] - 1) < 1e-6);
  assert.ok(Math.abs(strongest(r.dW.samples, 4500, 6500, 50, 200) - hz(41)) <= 3);
  // the slap is shorter than the thump
  assert.ok(r.dB.samples[4500] === 0 || r.dB.samples[4500] < 0.01);
  assert.deepEqual(handDrum('d', 'dT', { pitch: 100 }).map((n) => n.id), ['dNz', 'dP', 'dW', 'dV', 'dA', 'dB', 'dN', 'dO'], 'without a noise node it brings its own');
  assert.throws(() => handDrum('d', 'dT'), (e) => e instanceof KitError && /give pitch/.test(e.message));
});

test('shaker: a soft-started hiss on every mark, as loud as the mark, with nothing low in it', () => {
  const r = run(piece(), ['kO', 'kA', 'kV'], { seconds: 2 });
  // marks x.o.: 0.7 on the beat's first 8th, 0.4 on the second
  assert.ok(Math.abs(r.kV.samples[100] - 0.7) < 1e-9 && Math.abs(r.kV.samples[2100] - 0.4) < 1e-9);
  // soft start: the envelope is still rising 3 ms in (24 samples at 8 kHz), unlike a hi-hat's half millisecond
  assert.ok(r.kA.samples[16] < 0.5 && r.kA.samples[60] > 0.5);
  assert.ok(r.kA.samples[800] === 0, 'short');
  assert.ok(r.kO.peak > 0.02 && r.kO.peak < 1.5);
  const nodes = shaker('k', 'kT');
  assert.deepEqual(nodes.map((n) => n.id), ['kNz', 'kV', 'kA', 'kN', 'kO']);
  assert.equal(nodes[3].mode, 'bp');
  assert.throws(() => shaker('k'), (e) => e instanceof KitError && /give trig/.test(e.message));
});

// ---- the kit passes them on, and the old tracks are untouched ---------------------------------------------------------------

test('the kit passes the new functions on, each with a description', async () => {
  for (const name of ['clockEighths', 'ringRows', 'pluckedString', 'struckBell', 'roundBass', 'handDrum', 'shaker']) assert.equal(typeof kit[name], 'function', name);
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../sound/compose.js', import.meta.url), 'utf8');
  for (const name of ['clockEighths', 'ringRows', 'pluckedString', 'struckBell', 'roundBass', 'handDrum', 'shaker']) {
    const m = new RegExp(`/\\*\\*\\n \\* ([^\\n]+)\\n(?: \\*[^\\n]*\\n)*? \\*/\\nexport function ${name}\\(`).exec(src);
    assert.ok(m, `${name} has a doc comment directly above it`);
    assert.ok(m[1].length <= 240 && /^[A-Z]/.test(m[1]), `${name}: the first line is one sentence: "${m[1]}"`);
    assert.match(src.slice(m.index, src.indexOf(`export function ${name}(`)), /Arguments:/, `${name} lists its arguments`);
  }
});

test('thornwood-overworld still regenerates byte for byte', async () => {
  const fs = await import('node:fs');
  const { build } = await import('../../tools/compose/thornwood_overworld.mjs');
  const onDisk = fs.readFileSync(new URL('../../sounds/thornwood-overworld.json', import.meta.url), 'utf8');
  assert.equal(JSON.stringify(build(), null, 1) + '\n', onDisk);
});

// ======== hearthvale-village: the track these were added for, against its specification row ==========================
// (bundles/specs/kit-rpg-fantasy.md, Music; docs/style-guide.md, section 12). Quick checks on node values and low
// sample rates; the slow ones (the checker, the chords in each bar) are run by hand and reported.

const village = await import('../../tools/compose/hearthvale_village.mjs');
const { THEME_PRESETS } = await import('../../engine/theme.js');
const { validateMeta } = await import('../../catalog/schema.js');
const vPatch = village.build();
const vNode = (id) => vPatch.nodes.find((n) => n.id === id);
const nums = (s) => { let prev = 0; return s.replace(/\|/g, ' ').trim().split(/\s+/).map((x) => (prev = x === '_' ? prev : Number(x))); };
const flat = (s) => s.replace(/[|\s]/g, '');
const MIDI = (name) => { const m = /^([A-G])(b|#)?(\d)/.exec(name); return 12 * (Number(m[3]) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0); };
const tuneNotes = village.TUNE.map((b) => b.split(/\s+/).filter((x) => x !== '_').map((x) => MIDI(x)));

test('hearthvale-village: the file in sounds/ is what the generator writes, with valid metadata', async () => {
  const fs = await import('node:fs');
  const onDisk = JSON.parse(fs.readFileSync(new URL('../../sounds/hearthvale-village.json', import.meta.url), 'utf8'));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(vPatch)), 'run: node tools/compose/hearthvale_village.mjs');
  const m = validateMeta(onDisk.meta, 'music');
  assert.equal(m.ok, true, m.errors.join('; '));
  assert.deepEqual(validatePatch(onDisk).errors, []);
  assert.deepEqual(kit.lint(onDisk), []);
});

test('hearthvale-village: identity, controls and styles are the specification row', () => {
  assert.deepEqual([vPatch.id, vPatch.name, vPatch.category], ['hearthvale-village', 'Village and fields theme', 'music']);
  assert.deepEqual([vPatch.loop, vPatch.wrap, vPatch.normalize], [true, true, false]);
  assert.deepEqual([vPatch.meta.type, vPatch.meta.role, vPatch.meta.themes[0], vPatch.meta.gameTypes[0], vPatch.meta.license], ['music', 'music/exploration', 'fantasy', 'turn-based-rpg', 'draft']);
  for (const w of ['hearthvale', 'music', 'fantasy', 'farm', 'rpg']) assert.ok(!vPatch.meta.words.includes(w), `"${w}" repeats the bundle, type or theme`);
  assert.deepEqual(vPatch.params.map((p) => p.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'bright', 'space', 'lead', 'swing']);
  const by = Object.fromEntries(vPatch.params.map((p) => [p.id, p]));
  assert.deepEqual([by.bpm.min, by.bpm.max, by.bpm.default], [80, 108, 92]);
  assert.deepEqual([by.bars.min, by.bars.max, by.bars.step, by.bars.default], [8, 32, 8, 16]);
  assert.deepEqual(by.inst.options, kit.INSTRUMENTS);
  assert.equal(by.inst.options[by.inst.default], 'Flute');
  assert.deepEqual([by.intensity.default, by.bright.default, by.space.default, by.lead.default, by.swing.default], [0.85, 0.6, 0.08, 0.8, 0.35]);
  assert.deepEqual([by.lead.label, by.swing.label], ['Melody', 'Lilt']);
  assert.deepEqual(Object.keys(vPatch.presets), ['Quiet morning', 'Market day', 'Shop']);
  // a look may speed the music up or slow it down by 5%: no style sits where that is cut off; nor does the default
  for (const [name, set] of [...Object.entries(vPatch.presets), ['the default', {}]]) {
    assert.ok((set.bpm ?? by.bpm.default) * 1.05 <= by.bpm.max, `"${name}" has no room to speed up by 5%`);
    assert.ok((set.bpm ?? by.bpm.default) * 0.95 >= by.bpm.min, `"${name}" has no room to slow down by 5%`);
  }
  // 32 bars at the slowest tempo stay under two minutes
  assert.ok((32 * 240) / by.bpm.min <= kit.MAX_SECONDS);
});

test('hearthvale-village: the chords are F C Dm Bb | F Bb C F, and every layer keeps to them', () => {
  assert.equal(village.CHORDS, 'F C Dm Bb | F Bb C F');
  assert.equal(Number(vNode('tonic').expr), 5, 'F');
  const root = nums(vNode('root').steps), third = nums(vNode('third').steps);
  assert.deepEqual(root, [0, 7, 9, 5, 0, 5, 7, 0], 'semitones above F: F C D Bb F Bb C F');
  assert.deepEqual(third, [4, 4, 3, 4, 4, 4, 4, 4], 'only the third bar is minor');
  const tones = root.map((r, b) => [0, third[b], 7].map((t) => (r + t) % 12));
  // the rolling strings (semitones above F3) and the pad's three held notes are chord tones in every bar
  for (const id of ['rS1', 'rS2']) nums(vNode(id).steps).forEach((x, i) => {
    // a string keeps its last note over the bar line until it is plucked again: only judge the steps it is plucked on
    if (flat(vNode(id.replace('S', 'G')).steps)[i] !== '.') assert.ok(tones[Math.floor(i / 16)].includes(((x % 12) + 12) % 12), `${id}, step ${i}: ${x}`);
  });
  for (const id of ['hA', 'hB', 'hC']) nums(vNode(id).steps).forEach((x, b) => assert.ok(tones[b].includes(((x % 12) + 12) % 12), `${id}, bar ${b + 1}: ${x}`));
  // the bass: root on beat 1, the chord's fifth on beat 3, between F2 and D3
  assert.equal(flat(vNode('bT').steps), 'X.......x.......');
  nums(vNode('bS').steps).forEach((x, i) => {
    assert.ok(i % 16 < 8 ? x === 0 : [7, -5].includes(x), `bass step ${i}: ${x}`);
    const midi = 41 + root[Math.floor(i / 16)] + x;
    assert.ok(midi >= 41 && midi <= 50, `bass note ${midi}`);
  });
  // the chime (semitones above F5) plays only in bars 4 and 8, on chord tones but for one passing note
  for (const id of ['qG1', 'qG2']) flat(vNode(id).steps).split('').forEach((c, i) => { if (c !== '.') assert.ok([3, 7].includes(Math.floor(i / 16)), `${id} plays in bar ${Math.floor(i / 16) + 1}`); });
});

test('hearthvale-village: the layers are the ones the specification lists', () => {
  // (1) plucked strings in 8th notes: two `pluck` strings taking turns, a note on every 8th
  assert.deepEqual([vNode('r1W').type, vNode('r2W').type], ['pluck', 'pluck']);
  const g1 = flat(vNode('rG1').steps), g2 = flat(vNode('rG2').steps);
  for (let i = 0; i < 128; i++) assert.equal((g1[i] !== '.') || (g2[i] !== '.'), i % 2 === 0, `step ${i}`);
  // (2) pad: saws through a low-pass with a slow attack
  assert.equal(vNode('pW1a').wave, 'saw'); assert.equal(vNode('pL').mode, 'lp');
  assert.ok(vNode('pA').points[1][0] >= 0.3, 'the pad takes at least 0.3 s to swell');
  // (3) bass: a sine and a triangle
  assert.deepEqual([vNode('bO1').wave ?? 'sine', vNode('bO2').wave], ['sine', 'tri']);
  // (5) a shaker on the 8th notes and a hand drum on 2 and 4
  assert.equal(flat(vNode('kT').steps), 'x.o.x.o.x.o.x.o.');
  for (const bar of vNode('dT').steps.split('|')) { assert.equal(bar[4], 'X'); assert.equal(bar[12], 'X'); assert.equal(bar[0], '.'); assert.equal(bar[8], '.'); }
  assert.match(vNode('dW').freq, /tr\)/, 'the hand drum lands on the chord root');
  // (6) the chime is a bell (`modal`)
  assert.deepEqual([vNode('q1O').type, vNode('q2O').type], ['modal', 'modal']);
  // "Lilt" swings the 8th notes, gently: at most a fifth of an 8th late (a full shuffle is a third)
  assert.match(vNode('c16').rate, /\(swing\*0\.6\)\/3\*\(1 - 2\*c8w\)/);
});

test('hearthvale-village: the tune rises a sixth, falls back by steps, begins again the same way and comes home to F', () => {
  assert.equal(village.TUNE.length, 8);
  const first = tuneNotes.slice(0, 4).flat(), second = tuneNotes.slice(4).flat();
  // F4 up to D5 is a major sixth (9 semitones), reached within the first bar
  assert.deepEqual(tuneNotes[0], [MIDI('F4'), MIDI('A4'), MIDI('D5')]);
  assert.equal(tuneNotes[0][2] - tuneNotes[0][0], 9);
  // then down by steps (1 or 2 semitones each) all the way back to the F it started on
  const fall = first.slice(2, 8);
  assert.deepEqual(fall, ['D5', 'C5', 'Bb4', 'A4', 'G4', 'F4'].map(MIDI));
  for (let i = 1; i < fall.length; i++) assert.ok([1, 2].includes(fall[i - 1] - fall[i]));
  // the second four bars begin the same way and end on F
  assert.deepEqual(tuneNotes[4], tuneNotes[0]);
  assert.equal(second[second.length - 1] % 12, 5, 'the last note is F');
  assert.equal(tuneNotes[7].length, 1, 'bar 8 is one long F');
  // long notes: 19 notes in 8 bars, none shorter than an 8th; a range of an octave; all in F major
  const all = tuneNotes.flat();
  assert.ok(all.length <= 24);
  for (const bar of village.TUNE) bar.split(/\s+/).forEach((x, i, a) => { if (x !== '_') assert.equal(a[i + 1] ?? '_', '_', 'no 16th notes'); });
  assert.ok(Math.max(...all) - Math.min(...all) <= 24);
  for (const x of all) assert.ok([5, 7, 9, 10, 0, 2, 4].includes(x % 12), `${x} is not in F major`);
  // it fits its chords, and the strings stay at or under its lowest note
  const fit = kit.tuneFit(vPatch).lines.find((l) => l.id === 'l');
  assert.ok(fit.chordShare >= 0.8, `chord share ${fit.chordShare}`); assert.equal(fit.scaleShare, 1);
  const rollTop = Math.max(...['rS1', 'rS2'].flatMap((id) => nums(vNode(id).steps))) + 53;
  assert.ok(rollTop <= Math.min(...all), 'the rolling strings never go above the tune\'s lowest note');
});

test('hearthvale-village: its own piece, not thornwood-overworld or battle-theme with new sounds', async () => {
  const fs = await import('node:fs');
  const read = (id) => JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'));
  const moves = (p) => { const s = nums(p.nodes.find((n) => n.id === 'lS').steps), g = flat(p.nodes.find((n) => n.id === 'lG').steps); const hit = s.filter((_, i) => g[i] !== '.'); return hit.slice(1).map((x, i) => x - hit[i]); };
  const mine = moves(vPatch);
  for (const id of ['thornwood-overworld', 'battle-theme']) {
    const other = read(id), theirs = moves(other);
    // no run of five intervals in a row is shared (a transposed copy would share them all)
    const runs = new Set(); for (let i = 0; i + 5 <= theirs.length; i++) runs.add(theirs.slice(i, i + 5).join(' '));
    for (let i = 0; i + 5 <= mine.length; i++) assert.ok(!runs.has(mine.slice(i, i + 5).join(' ')), `${id}: shares the intervals ${mine.slice(i, i + 5).join(' ')}`);
    const bars = (p) => p.nodes.find((n) => n.id === 'lG').steps.split('|');
    assert.equal(bars(vPatch).filter((b) => bars(other).includes(b)).length, 0, `${id}: no bar of the tune has a rhythm it uses`);
    const roots = (p) => nums(p.nodes.find((n) => n.id === 'root').steps).map((r) => ((r % 12) + 12) % 12).join(' ');
    assert.notEqual(roots(vPatch), roots(other), `${id}: another chord order`);
  }
});

const V_GATES = { pad: 'gPad', bass: 'gBass', tune: 'gTune', perc: 'gPerc', top: 'gTop' };
function vGatesAt(params, seconds = 0.2, sr = 8000) {
  const v = createVoice(vPatch, { sampleRate: sr, params });
  for (let i = 0; i < seconds * sr; i++) v.tick();
  return Object.fromEntries(Object.entries({ roll: 'gRoll', ...V_GATES }).map(([k, id]) => [k, v.nodeValues[v.nodeIds.indexOf(id)]]));
}

test('hearthvale-village: intensity brings the layers in, in the order the specification gives, and every look keeps the tune', () => {
  const on = (g) => Object.keys(V_GATES).filter((k) => g[k] > 0.99).join(' ');
  const off = (g) => Object.keys(V_GATES).filter((k) => g[k] < 0.01).join(' ');
  for (const i of [0, 0.15, 0.3]) { const g = vGatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'pad', `intensity ${i}: strings and pad`); assert.equal(off(g), 'bass tune perc top'); assert.ok(g.roll >= 0.8, 'still music at 0'); }
  for (const i of [0.4, 0.5, 0.55]) { const g = vGatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'pad bass tune', `intensity ${i}: bass and tune added`); assert.equal(off(g), 'perc top'); }
  for (const i of [0.66, 0.8]) { const g = vGatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'pad bass tune perc', `intensity ${i}: shaker and hand drum added`); assert.equal(off(g), 'top'); }
  for (const i of [0.86, 1]) assert.equal(on(vGatesAt({ intensity: i, bars: 8 })), 'pad bass tune perc top', `intensity ${i}: the chime and the octave`);
  // the octave doubling and the chime both hang on the top gate
  assert.match(village.MIX.octave, /gTune\*gTop/); assert.match(village.MIX.chimeL, /gTop/);
  const set = THEME_PRESETS.map((p) => [p.name, p.theme?.music?.intensity]).filter(([, i]) => i !== null && i !== undefined);
  assert.ok(set.length >= 2, 'some looks set the intensity');
  for (const [name, intensity] of [...set, ['the lowest a random look draws', 0.4]]) assert.ok(vGatesAt({ intensity, bars: 8 }).tune > 0.99, `"${name}" sets intensity ${intensity}`);
});

test('hearthvale-village: a longer version builds up from the front: strings, then pad and bass, then the tune, then everything', () => {
  const sr = 8000, bpm = 92, barLen = (sr * 240) / bpm;
  const want = { 1: '', 2: 'pad bass', 3: 'pad bass tune', 4: 'pad bass tune perc top' };
  for (const bars of kit.LENGTHS) {
    const v = createVoice(vPatch, { sampleRate: sr, params: { bars, bpm, intensity: 1, swing: 0 } });
    let n = 0;
    for (let s = 0; s < bars / 8; s++) {
      const mid = Math.round((s * 8 + 4.5) * barLen);
      while (n < mid) { v.tick(); n++; }
      const section = kit.sectionAt(s * 8 + 4, bars).section;
      const on = Object.keys(V_GATES).filter((k) => v.nodeValues[v.nodeIds.indexOf(V_GATES[k])] > 0.99).join(' ');
      assert.equal(on, want[section], `${bars} bars, section ${s + 1}`);
    }
  }
});

test('hearthvale-village: a quick render is stereo, never silent, and under the limiter at both ends of intensity', async () => {
  const { renderPatch } = await import('../../sound/sfx-engine.js');
  for (const intensity of [0, 1]) {
    const r = renderPatch(vPatch, { sampleRate: 11025, params: { intensity, bars: 8, bpm: 108 } });
    assert.equal(r.channels.length, 2); assert.equal(r.badSamples, 0);
    let sq = 0, diff = 0;
    for (let i = 0; i < r.samples.length; i++) { sq += r.samples[i] ** 2; diff += Math.abs(r.channels[0][i] - r.channels[1][i]); }
    assert.ok(Math.sqrt(sq / r.samples.length) > 0.02, `intensity ${intensity} is still music`);
    assert.ok(diff / r.samples.length > 1e-4, 'left and right differ');
    assert.ok(r.rawPeak <= vPatch.gain + 1e-6);
  }
});
