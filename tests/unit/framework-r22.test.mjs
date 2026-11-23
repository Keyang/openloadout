// Batch R22, in two parts.
// 1. Framework additions made with hearthvale-battle: the voices every track repeats, in sound/compose.js:
//      eightBars, chordTone, kickDrum, snareDrum, hatDrum, tomDrum, sawBass, stringPair, brassStab
//    Everything is checked on a tiny piece built here, by reading node values: nobody here can listen.
// 2. hearthvale-battle ("Party battle theme") against its specification row (bundles/specs/kit-rpg-fantasy.md,
//    Music) and the style guide, section 12.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice, renderPatch, validatePatch } from '../../sound/sfx-engine.js';
import { validateMeta } from '../../catalog/schema.js';
import { THEME_PRESETS } from '../../engine/theme.js';
import { INSTRUMENTS, LENGTHS, lint, tuneFit, sectionAt, layerPlays, measureLayers, measureSections } from '../../tools/compose/kit.mjs';
import { build, LAYERS, TUNE, CHORDS as TRACK_CHORDS, PARTS } from '../../tools/compose/hearthvale_battle.mjs';
import {
  KitError, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble,
  eightBars, chordTone, kickDrum, snareDrum, hatDrum, tomDrum, sawBass, stringPair, brassStab,
} from '../../sound/compose.js';
import * as kit from '../../tools/compose/kit.mjs';

const META = { type: 'music', role: 'music/battle', themes: ['neutral'], gameTypes: ['arcade'], words: ['test', 'tune', 'tiny', 'loop', 'fight', 'drums'], license: 'draft' };
const CHORDS = 'Am F | G E';       // A minor: thirds 3 4 4 4, roots 0 -4 -2 -5
const SR = 8000;

let made = null;
/** The tiny piece, built once: assembling validates it by rendering every control's ends. */
const piece = () => structuredClone(made ??= makePiece());
function makePiece(extra = []) {
  return assemble({
    id: 'tiny-fight', name: 'Tiny fight', description: 'A test piece.', meta: META,
    tempo: [100, 160, 120], defaults: { intensity: 1, bars: 8, inst: 'Synth lead' },
    nodes: [
      clock(), chords(CHORDS, { tonic: 'A' }), arrangement({ all: {} }),
      { id: 'nz', type: 'noise' },
      drumRow('kT', 'X...x...X...x...'), kickDrum('k', 'kT'),
      drumRow('sT', '....X.......X...'), snareDrum('s', 'sT', { noise: 'nz' }),
      drumRow('hT', 'X.x.X.x.X.x.X.x.'), hatDrum('h', 'hT', { noise: 'nz' }),
      drumRow('tT', eightBars('................', { 8: '........X.xxX.xx' })),
      noteRow('tS', '12 _ _ _ _ _ _ _ 12 _ 12 7 7 _ 0 0'), tomDrum('t', 'tT', { semis: 'tS', noise: 'nz' }),
      drumRow('bT', 'X.xxX.xxX.xxX.xx'), noteRow('bS', '0 _ 0 0 0 _ 0 12 0 _ 0 0 7 _ 7 12'), sawBass('b', 'bT', { semis: 'bS' }),
      noteRow('aD', '0 1 2 3 4 5 3 2 0 1 2 3 4 5 3 2'), chordTone('aS', 'aD'),
      stringPair('a', 'midi(57 + tr + aS)'),
      drumRow('stT', '..X...X...X...X.'), brassStab('st', 'stT'),
      melody('l', ['A4 _ _ _ E5 _ _ _ _ _ _ _ C5 _ D5 _', 'C5 _ _ _ F5 _ _ _ _ _ _ _ A4 _ C5 _', 'D5 _ _ _ G5 _ _ _ _ _ _ _ B4 _ D5 _', 'E5 _ _ _ B4 _ _ _ G#4 _ _ _ E4 _ _ _']),
      instruments('l', { noise: 'nz' }),
      ...extra,
      bus({ centre: 'kO*0.8 + sO + hO*0.5 + tO*0.6 + bO*0.3', left: 'aL*0.3 + stL*0.4 + lF*0.6', right: 'aR*0.3 + stR*0.4 + lF*0.6', duck: 'kA' }),
    ],
    presets: { One: { intensity: 0.3 }, Two: { intensity: 0.6 }, Three: { intensity: 1 } },
  });
}

const index = (voice, id) => { const i = voice.nodeIds.indexOf(id); assert.ok(i >= 0, `no node "${id}"`); return i; };
/** Runs the piece for `bars` bars and returns, per node id asked for, its peak and its value at the end of every 16th. */
function run(patch, ids, { bars = 8, params = {} } = {}) {
  const voice = createVoice(patch, { sampleRate: SR, params: { bpm: 120, ...params } });
  const at = ids.map((id) => index(voice, id)), iClock = index(voice, 'c16');
  const peak = ids.map(() => 0), steps = ids.map(() => []);
  const n = Math.round(bars * 2 * SR);          // 120 bpm: a bar is 2 s
  let seen = false;
  const before = ids.map(() => 0);              // every node one sample ago: what it held as the step ended
  for (let s = 0; s < n; s++) {
    voice.tick();
    const tick = voice.nodeValues[iClock] > 0;
    if (tick && seen) at.forEach((k, j) => steps[j].push(before[j]));
    if (tick) seen = true;
    at.forEach((k, j) => { const v = voice.nodeValues[k], a = Math.abs(v); before[j] = v; if (a > peak[j]) peak[j] = a; });
  }
  at.forEach((k, j) => steps[j].push(before[j]));
  return Object.fromEntries(ids.map((id, j) => [id, { peak: peak[j], steps: steps[j] }]));
}
const pitchClass = (hz) => ((Math.round(12 * Math.log2(hz / 440) + 69) % 12) + 12) % 12;
const midiOf = (hz) => 12 * Math.log2(hz / 440) + 69;

test('every new voice is exported by the kit too, and the piece made with all of them is a valid patch', () => {
  for (const name of ['eightBars', 'chordTone', 'kickDrum', 'snareDrum', 'hatDrum', 'tomDrum', 'sawBass', 'stringPair', 'brassStab']) assert.equal(typeof kit[name], 'function', `kit.mjs passes on ${name}`);
  const p = piece();
  assert.equal(p.category, 'music');
  assert.equal(new Set(p.nodes.map((n) => n.id)).size, p.nodes.length, 'no two nodes share an id');
});

test('eightBars: one bar eight times, with the bars asked for replaced', () => {
  const rows = eightBars('....X.......X...', { 4: '....X.......X.xx', 8: '....X...x.x.XxXX' });
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((r, i) => (r === '....X.......X...' ? 0 : i + 1)).filter(Boolean), [4, 8]);
  assert.equal(rows[7], '....X...x.x.XxXX');
  assert.deepEqual(eightBars('X...'), Array(8).fill('X...'));
  assert.throws(() => eightBars('X...', { 9: 'x...' }), KitError);
  assert.throws(() => eightBars('X...', { 0: 'x...' }), KitError);
  assert.doesNotThrow(() => drumRow('r', rows));
});

test('chordTone: 0 root, 1 third, 2 fifth, 3 octave, 4 third above, 5 fifth above, following the bar\'s chord', () => {
  const r = run(piece(), ['aS'], { bars: 2 });
  // bar 1 is A minor (third 3), bar 2 is F major (third 4); the row is 0 1 2 3 4 5 3 2, twice a bar
  assert.deepEqual(r.aS.steps.slice(0, 8), [0, 3, 7, 12, 15, 19, 12, 7]);
  assert.deepEqual(r.aS.steps.slice(16, 24), [0, 4, 7, 12, 16, 19, 12, 7]);
  assert.equal(chordTone('x', 'row').type, 'expr');
});

test('every voice sounds, and its finished signal is the node the comment names', () => {
  const r = run(piece(), ['kO', 'kA', 'sO', 'hO', 'tO', 'bO', 'aL', 'aR', 'stL', 'stR']);
  for (const [id, v] of Object.entries(r)) assert.ok(v.peak > 0.05, `${id} is silent (peak ${v.peak})`);
  for (const [id, v] of Object.entries(r)) assert.ok(v.peak < 4, `${id} is far too loud (peak ${v.peak})`);
});

test('kickDrum: lands on the chord root, folded into one low octave whatever the chord and the key', () => {
  const probe = (p) => [...p.nodes.filter((n) => n.id === 'kW').map((n) => ({ id: 'zzKick', type: 'expr', expr: n.freq }))];
  const base = piece();
  const withProbe = { ...base, nodes: [...base.nodes, ...probe(base)] };
  for (const key of [-5, 0, 6]) {
    const r = run(withProbe, ['zzKick'], { bars: 4, params: { key } });
    // the last 16th of each bar: the pitch has long landed. Roots: A F G E
    [9, 5, 7, 4].forEach((pc, bar) => {
      const hz = r.zzKick.steps[bar * 16 + 15];
      assert.equal(pitchClass(hz), (((pc + key) % 12) + 12) % 12, `key ${key}, bar ${bar + 1}: the kick lands on ${hz.toFixed(1)} Hz`);
      assert.ok(midiOf(hz) > 27.5 && midiOf(hz) < 40.5, `key ${key}, bar ${bar + 1}: ${hz.toFixed(1)} Hz is outside the kick's octave (E1 to D#2)`);
    });
  }
  // it starts above its landing note and its envelope is the node to duck with
  const k = kickDrum('k', 'kT');
  assert.deepEqual(k.map((n) => n.id), ['kP', 'kW', 'kA', 'kO']);
});

test('tomDrum: tuned to the chord, moved by the row of semitones it is given', () => {
  const base = piece();
  const withProbe = { ...base, nodes: [...base.nodes, { id: 'zzTom', type: 'expr', expr: base.nodes.find((n) => n.id === 'tW').freq }] };
  const r = run(withProbe, ['zzTom', 'tO'], { bars: 8 });
  // bar 8 is E (root -5 from A): the fill's last step is on the root, its first on the octave
  const last = r.zzTom.steps[7 * 16 + 15], first = r.zzTom.steps[7 * 16 + 8 + 1];
  assert.equal(pitchClass(last), 4, `the last tom is on E (${last.toFixed(1)} Hz)`);
  assert.ok(Math.abs(midiOf(first) - midiOf(last) - 12) < 0.6, 'the first tom of the fill is an octave above the last');
  // silent until the fill: the first seven bars hold nothing
  assert.ok(Math.max(...r.tO.steps.slice(0, 7 * 16).map(Math.abs)) < 1e-6, 'no tom before bar 8');
});

test('snareDrum and hatDrum have no pitch: only filtered noise, and they share the noise they are given', () => {
  const s = snareDrum('s', 'sT', { noise: 'nz' }), h = hatDrum('h', 'hT', { noise: 'nz' });
  for (const n of [...s, ...h]) assert.notEqual(n.type, 'osc', `${n.id} is an oscillator: a snare or a hat with a note shows up as a wrong note in every bar`);
  assert.ok(![...s, ...h].some((n) => n.type === 'noise'), 'given a noise node, they add none');
  assert.equal(snareDrum('s', 'sT').filter((n) => n.type === 'noise').length, 1, 'without one, the snare brings its own');
  assert.equal(hatDrum('h', 'hT').filter((n) => n.type === 'noise').length, 1);
  assert.equal(s[s.length - 1].id, 'sO');
  assert.equal(h[h.length - 1].id, 'hO');
});

test('sawBass: plays the chord root moved by its row, and an accent (X) is louder than a plain hit (x)', () => {
  const base = piece();
  const withProbe = { ...base, nodes: [...base.nodes, { id: 'zzBass', type: 'expr', expr: 'bHz' }] };
  const r = run(withProbe, ['zzBass', 'bV'], { bars: 2 });
  assert.equal(pitchClass(r.zzBass.steps[0]), 9, 'bar 1 starts on A');
  assert.ok(Math.abs(midiOf(r.zzBass.steps[0]) - 45) < 0.01, 'at the note it was given (A2)');
  assert.ok(Math.abs(midiOf(r.zzBass.steps[7]) - 57) < 0.01, 'the row moves it (an octave up on the 8th step)');
  assert.equal(pitchClass(r.zzBass.steps[16]), 5, 'bar 2 starts on F');
  assert.ok(r.bV.steps[0] > r.bV.steps[2], 'the accent is louder');
});

test('stringPair: one saw on each side, a few cents apart; brassStab: root, third, fifth and octave, the third left and the fifth right', () => {
  const a = stringPair('a', 'midi(57 + tr)');
  assert.deepEqual(a.map((n) => n.id), ['aA', 'aO1', 'aO2', 'aL', 'aR']);
  assert.ok(a[1].freq !== a[2].freq, 'the two saws are detuned');
  const st = brassStab('st', 'stT');
  assert.deepEqual(st.map((n) => n.id), ['stA', 'stO1', 'stO2', 'stO3', 'stO4', 'stL', 'stR']);
  assert.ok(st.filter((n) => n.type === 'osc').every((n) => n.wave === 'saw'));
  assert.ok(/third/.test(st[2].freq) && /fifth/.test(st[3].freq), 'the stab follows the bar\'s chord');
  assert.notEqual(st[5].in, st[6].in, 'left and right differ');
  // the stab only sounds when hit: silent at the end of a bar with no hit after step 14 has died away is not required,
  // but it must be silent before its first hit
  const r = run(piece(), ['stL'], { bars: 1 });
  assert.ok(Math.abs(r.stL.steps[0]) < 1e-9 && Math.abs(r.stL.steps[1]) < 1e-9, 'no stab before the first off-beat');
});

test('a voice refuses an id that is not letters and digits', () => {
  for (const f of [() => kickDrum('k-1', 'kT'), () => snareDrum('', 'sT'), () => hatDrum('1h', 'hT'), () => tomDrum('t t', 'tT'), () => sawBass('b.', 'bT'), () => stringPair('a b', '440'), () => brassStab('st!', 'stT'), () => chordTone('x y', 'row')]) assert.throws(f, KitError);
});

// ==== part 2: hearthvale-battle ==============================================================================

const SOUNDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sounds');
const read = (id) => JSON.parse(fs.readFileSync(path.join(SOUNDS, `${id}.json`), 'utf8'));
const track = build();
const node = (p, id) => p.nodes.find((n) => n.id === id);
const flat = (s) => s.replace(/[|\s]/g, '');
const nums = (s) => { let prev = 0; return s.replace(/\|/g, ' ').trim().split(/\s+/).map((x) => (prev = x === '_' ? prev : Number(x))); };   // "_" holds
const barsOf = (s) => s.split('|').map((b) => b.trim());
const pcs = (list) => list.map((r) => ((r % 12) + 12) % 12);
/** The tune of a patch as the moves between its notes, in semitones (a transposed copy gives the same list). */
const moves = (p, seq = 'lS', gate = 'lG') => { const s = nums(node(p, seq).steps), g = flat(node(p, gate).steps); const hit = s.filter((_, i) => g[i] !== '.'); return hit.slice(1).map((x, i) => x - hit[i]); };

test('hearthvale-battle: the file in sounds/ is what the generator writes, with valid metadata', () => {
  const onDisk = read('hearthvale-battle');
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(track)), 'run: node tools/compose/hearthvale_battle.mjs');
  const m = validateMeta(onDisk.meta, 'music');
  assert.equal(m.ok, true, m.errors.join('; '));
  assert.deepEqual(validatePatch(onDisk).errors, []);
  assert.deepEqual(lint(onDisk), []);
});

test('hearthvale-battle: identity, metadata, eleven controls and three styles are the specification row', () => {
  assert.equal(track.id, 'hearthvale-battle');
  assert.equal(track.name, 'Party battle theme');
  assert.equal(track.category, 'music');
  assert.deepEqual([track.loop, track.wrap, track.normalize], [true, true, false]);
  assert.deepEqual([track.meta.type, track.meta.role, track.meta.themes[0], track.meta.gameTypes[0], track.meta.license], ['music', 'music/battle', 'fantasy', 'turn-based-rpg', 'draft']);
  assert.ok(track.meta.words.length >= 6 && track.meta.words.length <= 14);
  for (const w of ['hearthvale', 'music', 'fantasy']) assert.ok(!track.meta.words.includes(w), `"${w}" repeats the bundle, type or theme`);
  assert.deepEqual(track.params.map((p) => p.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'along', 'bright', 'space', 'lead', 'alongLevel', 'grit']);
  const by = Object.fromEntries(track.params.map((p) => [p.id, p]));
  assert.deepEqual([by.bpm.min, by.bpm.max, by.bpm.default], [140, 172, 152]);
  assert.deepEqual([by.key.min, by.key.max, by.key.default], [-5, 6, 0]);
  assert.deepEqual([by.bars.min, by.bars.max, by.bars.step, by.bars.default], [8, 32, 8, 8]);
  assert.deepEqual(by.inst.options, INSTRUMENTS);
  assert.equal(by.inst.options[by.inst.default], 'Synth lead');
  assert.deepEqual([by.intensity.default, by.bright.default, by.space.default, by.lead.default], [0.85, 0.6, 0.08, 0.8]);
  assert.deepEqual([by.lead.label, by.grit.label], ['Melody', 'Grit']);
  assert.deepEqual(Object.keys(track.presets), ['Random encounter', 'Tough fight', 'Wyrm']);
  // a look may speed the music up or slow it down by 5%: no style sits where that is cut off
  for (const [name, set] of Object.entries(track.presets)) {
    assert.ok((set.bpm ?? by.bpm.default) * 1.05 <= by.bpm.max, `"${name}" has no room to speed up by 5%`);
    assert.ok((set.bpm ?? by.bpm.default) * 0.95 >= by.bpm.min, `"${name}" has no room to slow down by 5%`);
  }
  assert.ok(32 * 240 / by.bpm.min <= 120, '32 bars at the slowest tempo fit in 120 s');
});

test('hearthvale-battle: the chords are Am Am F G | Am C D E, in A', () => {
  assert.equal(TRACK_CHORDS, 'Am Am F G | Am C D E');
  assert.equal(Number(node(track, 'tonic').expr), 9, 'the home note is A');
  const root = nums(node(track, 'root').steps), third = nums(node(track, 'third').steps), fifth = nums(node(track, 'fifth').steps);
  assert.deepEqual(pcs(root), [0, 0, 8, 10, 0, 3, 5, 7], 'semitones above A: A A F G A C D E');
  assert.deepEqual(third, [3, 3, 4, 4, 3, 4, 4, 4], 'A minor is minor; F, G, C, D (the Dorian chord) and E are major');
  assert.deepEqual(fifth, Array(8).fill(7));
  assert.ok(root[5] < root[6] && root[6] < root[7], 'the bass climbs C, D, E in the second half');
});

test('hearthvale-battle: the layers are the ones the specification lists', () => {
  // (1) gallop bass: a saw and a square on "X.xxX.xx" per half bar, on the chord root (or its fifth)
  assert.equal(flat(node(track, 'bT').steps), 'X.xxX.xxX.xxX.xx');
  assert.deepEqual([node(track, 'bO1').wave, node(track, 'bO2').wave], ['saw', 'square']);
  for (const x of nums(node(track, 'bS').steps)) assert.ok([0, 7, 12].includes(x), `bass step ${x} is not the root, the fifth or the octave`);
  // (2) drums: kick on every beat, snare on 2 and 4, hats on 8ths (16ths when everything is in)
  assert.equal(flat(node(track, 'kT').steps), 'X...X...X...X...');
  assert.equal(flat(node(track, 'sT').steps), '....X.......X...');
  assert.equal(flat(node(track, 'h8').steps).toLowerCase(), 'x.x.x.x.x.x.x.x.');
  assert.ok(![...flat(node(track, 'h16').steps)].includes('.'), 'the busy hat plays every 16th');
  assert.match(node(track, 'hT').expr, /gBusy > 0\.5 \? h16 : h8/);
  // (3) string-like ostinato: two detuned saws on every 16th, on chord tones
  assert.deepEqual([node(track, 'aO1').wave, node(track, 'aO2').wave, node(track, 'aA').trig], ['saw', 'saw', 'c16']);
  assert.notEqual(node(track, 'aO1').freq, node(track, 'aO2').freq);
  for (const x of nums(node(track, 'aD').steps)) assert.ok([0, 1, 2, 3].includes(x), 'the ostinato plays the root, third, fifth and octave only');
  // (4) stabs: the off-beats of bars 4 and 8, and nowhere else
  const stabs = barsOf(node(track, 'stT').steps);
  assert.deepEqual(stabs.map((b, i) => (b.includes('X') ? i + 1 : 0)).filter(Boolean), [4, 8]);
  assert.equal(stabs[3], '..X...X...X...X.');
  assert.equal(stabs[7], '..X...X...X...X.');
  // (6) tom fill: the last half of bar 8 only, on notes of the bar's chord
  const toms = barsOf(node(track, 'tmT').steps);
  assert.deepEqual(toms.map((b, i) => (/[Xxo]/.test(b) ? i + 1 : 0)).filter(Boolean), [8]);
  assert.equal(toms[7].slice(0, 8), '........');
  assert.ok(/[Xx]/.test(toms[7].slice(8)));
  for (const x of nums(node(track, 'tmS').steps)) assert.ok([0, 7, 12].includes(x));
  // the drums have no note of their own: the kick lands on the chord root, snare and hats are noise
  assert.match(node(track, 'kW').freq, /tonic \+ tr/);
  for (const id of ['sN', 'sB', 'hN']) assert.equal(node(track, id).type, 'filter');
});

test('hearthvale-battle: the tune is a call up a fifth that marches down, answered a step higher, then a climb to E and a fall to A', () => {
  assert.equal(TUNE.length, 8);
  const MIDI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (n) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return 12 * (Number(m[3]) + 1) + MIDI[m[1]] + (m[2] ? 1 : 0); };
  const notes = TUNE.map((b) => b.split(/\s+/).filter((x) => x !== '_').map((x) => midi(x.replace(/-+$/, ''))));
  const rhythm = TUNE.map((b) => b.split(/\s+/).map((x) => (x === '_' ? '.' : 'x')).join(''));
  assert.deepEqual(notes[0].slice(0, 2), [midi('A4'), midi('E5')], 'the call leaps from A up a fifth to E');
  // from the G it touches after the long E, the call only goes down, by steps, to the A it started on
  const down = [...notes[0].slice(2), ...notes[1]];
  assert.equal(down[0], midi('G5'));
  assert.ok(down.every((x, i) => i === 0 || x <= down[i - 1]), 'the march only goes down');
  assert.ok(down.slice(1).every((x, i) => down[i] - x <= 2), 'by steps');
  assert.equal(down[down.length - 1], midi('A4'));
  // the answer: the same rhythm, and from its long note on every note is one scale step (1 or 2 semitones) higher
  assert.deepEqual([rhythm[2], rhythm[3]], [rhythm[0], rhythm[1]]);
  const call = [...notes[0].slice(1), ...notes[1]], answer = [...notes[2].slice(1), ...notes[3]];
  for (let i = 0; i < call.length; i++) assert.ok([1, 2].includes(answer[i] - call[i]), `note ${i + 2} of the answer is ${answer[i] - call[i]} semitones above the call`);
  // the second half climbs: each bar reaches higher than the one before, up to the E chord's B; then it falls
  const tops = notes.slice(4).map((b) => Math.max(...b));
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2] && tops[2] < tops[3], `tops of bars 5 to 8: ${tops}`);
  const last = notes[7];
  assert.equal(last[0], Math.max(...notes.flat()), 'bar 8 starts on the highest note of the tune');
  assert.ok(last.every((x) => [4, 8, 11, 2].includes(x % 12)), 'and falls down the E chord (with its seventh, D)');
  assert.ok(Math.abs(last[last.length - 1] - notes[0][0]) <= 2, 'its last note is a step from the A that starts the loop again');
  // Dorian: F sharp is in the tune; the range is under two octaves; every note is one the chords use
  const all = notes.flat();
  assert.ok(all.some((x) => x % 12 === 6), 'F sharp');
  assert.ok(Math.max(...all) - Math.min(...all) <= 24);
  const fit = tuneFit(track).lines.find((l) => l.id === 'l');
  assert.equal(tuneFit(track).tonic, 9);
  assert.ok(fit.chordShare >= 0.8, `chord share ${fit.chordShare}`);
  assert.equal(fit.scaleShare, 1);
  // the octave doubling plays the same notes on the same gate, an octave up, both saws a few cents off the exact
  // octave (locked to the tune at exactly twice its pitch, a saw cancels part of the Chiptune instrument)
  assert.equal(node(track, 'dO1').freq, '(lP*2*0.996)');
  assert.equal(node(track, 'dO2').freq, '(lP*2*0.996)*1.007');
  assert.equal(node(track, 'dA').trig, 'lG');
});

// (The check that no other track has this one's chords, tune or rhythms is library-wide now: it runs over every
// track found in sounds/, in tests/unit/compose-library.test.mjs.)

// ---- how intensity and length bring the layers in

const GATES = { beat: 'gBeat', tune: 'gTune', snare: 'gSnare', stab: 'gStab', full: 'gFull', busy: 'gBusy', fill: 'gFill' };
function gatesAt(params, seconds = 0.2, sr = 8000) {
  const v = createVoice(track, { sampleRate: sr, params });
  for (let i = 0; i < seconds * sr; i++) v.tick();
  return Object.fromEntries(Object.entries({ bed: 'gBed', ...GATES }).map(([k, id]) => [k, v.nodeValues[v.nodeIds.indexOf(id)]]));
}

test('hearthvale-battle: intensity brings the layers in, in the order the specification gives', () => {
  const on = (g) => Object.keys(GATES).filter((k) => g[k] > 0.99).join(' ');
  const off = (g) => Object.keys(GATES).filter((k) => g[k] < 0.01).join(' ');
  for (const i of [0, 0.1, 0.25]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(off(g), 'beat tune snare stab full busy fill', `intensity ${i}: bass and ostinato only`); assert.ok(g.bed >= 0.8, 'still music at 0'); }
  // the tune alone is all there by 0.4 (the specification names it at 0.75 with its doubling; looks set intensity from 0.4 up and must keep the tune)
  for (const i of [0.4, 0.5]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'beat tune', `intensity ${i}: kick, hats and the tune`); assert.equal(off(g), 'snare stab full busy fill'); }
  for (const i of [0.61, 0.75]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'beat tune snare stab', `intensity ${i}: snare and stabs added`); assert.equal(off(g), 'full busy fill'); }
  for (const i of [0.86, 1]) assert.equal(on(gatesAt({ intensity: i, bars: 8 })), 'beat tune snare stab full busy fill', `intensity ${i}: the octave doubling, 16th hats and tom fills`);
});

test('hearthvale-battle: every look keeps the melody', () => {
  const set = THEME_PRESETS.map((p) => [p.name, p.theme?.music?.intensity]).filter(([, i]) => i !== null && i !== undefined);
  assert.ok(set.length >= 2, 'some looks set the intensity');
  for (const [name, intensity] of [...set, ['the lowest a random look draws', 0.4]]) {
    const g = gatesAt({ intensity, bars: 8 });
    assert.ok(g.tune > 0.99, `"${name}" sets intensity ${intensity}, where the melody is at ${g.tune}`);
  }
});

test('hearthvale-battle: a longer version builds up from the front: bass and ostinato, then drums, then stabs and the tune, then everything', () => {
  const sr = 8000, bpm = 152, barLen = (sr * 240) / bpm;
  const want = { 1: '', 2: 'beat snare fill', 3: 'beat tune snare stab fill', 4: 'beat tune snare stab full busy fill' };
  for (const bars of LENGTHS) {
    const v = createVoice(track, { sampleRate: sr, params: { bars, bpm, intensity: 1 } });
    let n = 0;
    for (let s = 0; s < bars / 8; s++) {
      const mid = Math.round((s * 8 + 4.5) * barLen);
      while (n < mid) { v.tick(); n++; }
      const section = sectionAt(s * 8 + 4, bars).section;
      const on = Object.keys(GATES).filter((k) => v.nodeValues[v.nodeIds.indexOf(GATES[k])] > 0.99).join(' ');
      assert.equal(on, want[section], `${bars} bars, section ${s + 1}`);
      for (const k of Object.keys(GATES)) assert.equal(on.split(' ').includes(k), layerPlays(LAYERS[k], s * 8 + 4, bars));
    }
  }
});

test('hearthvale-battle: by measurement, every section is louder than the one before, and the tune leads where it meets the accompaniment', () => {
  const s = measureSections(track, { sampleRate: 11025 })[32];
  assert.ok(s[1] - s[0] >= 1.5, `section 2 is ${(s[1] - s[0]).toFixed(1)} dB above section 1`);
  assert.ok(s[2] - s[1] >= 0.8 && s[3] - s[2] >= 0.8, `sections keep climbing: ${s.map((d) => d.toFixed(1)).join(' ')}`);
  // 300 to 1200 Hz is where the tune, the ostinato and the stabs sit. With the default instrument the tune leads the
  // ostinato and stabs by 6 dB or more, and everything pitched under it (bass too) by 5 dB or more
  const layers = { tune: PARTS.tune, backing: PARTS.backing, all: PARTS.under };
  const m = measureLayers(track, layers, { band: [300, 1200], sampleRate: 22050 });
  assert.ok(m.tune.db - m.backing.db >= 6, `tune ${m.tune.db.toFixed(1)} dB against ostinato and stabs ${m.backing.db.toFixed(1)} dB`);
  assert.ok(m.tune.db - m.all.db >= 5, `tune ${m.tune.db.toFixed(1)} dB against bass, ostinato and stabs ${m.all.db.toFixed(1)} dB`);
});

test('hearthvale-battle: the octave doubling adds to the tune on every instrument and on both sides (it never cancels it)', () => {
  for (let inst = 0; inst < INSTRUMENTS.length; inst++) {
    const m = measureLayers(track, { tune: PARTS.tune, left: `${PARTS.tune} + ${PARTS.octave}`, right: `${PARTS.tune} + ${PARTS.octaveRight}` }, { sampleRate: 11025, params: { inst, intensity: 1 } });
    assert.ok(m.left.db > m.tune.db + 0.3 && m.right.db > m.tune.db + 0.3, `${INSTRUMENTS[inst]}: tune ${m.tune.db.toFixed(1)} dB, with its doubling ${m.left.db.toFixed(1)} dB left, ${m.right.db.toFixed(1)} dB right`);
  }
});

test('hearthvale-battle: a quick render: stereo, never silent, under the limiter, at both ends of intensity and at the fastest look', () => {
  for (const [intensity, bpm] of [[0, 152], [1, 172]]) {
    const r = renderPatch(track, { sampleRate: 11025, params: { intensity, bars: 8, bpm } });
    assert.equal(r.channels.length, 2);
    assert.equal(r.badSamples, 0);
    let sq = 0, diff = 0;
    for (let i = 0; i < r.samples.length; i++) { sq += r.samples[i] ** 2; diff += Math.abs(r.channels[0][i] - r.channels[1][i]); }
    assert.ok(Math.sqrt(sq / r.samples.length) > 0.02, `intensity ${intensity} is still music`);
    assert.ok(diff / r.samples.length > 1e-4, 'left and right differ');
    assert.ok(r.rawPeak <= track.gain + 1e-6);
  }
});
