// Batch S21, in two parts.
// 1. Framework additions made with derelict-run: electronic voices and effects for the music kit, in sound/compose.js:
//      tempoEcho   an echo in time with the music (3 steps is a dotted 8th)
//      clap        a hand clap: three bursts of band-passed noise and a tail
//      acidBass    a plucked bass: one pure saw whose filter snaps open on every note
//      sawPad      a wide pad of detuned saw pairs with a slow swell
//      riser       a hiss that climbs through one bar of every few
//    Everything is measured on small pieces built inline, at a low sample rate: nobody here can listen.
// 2. derelict-run ("Station run theme") against its specification row (bundles/specs/kit-roguelite-scifi.md, Music)
//    and the style guide, section 12.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice, renderPatch, validatePatch } from '../../sound/sfx-engine.js';
import { validateMeta } from '../../catalog/schema.js';
import { THEME_PRESETS } from '../../engine/theme.js';
import {
  KitError, INSTRUMENTS, LENGTHS, clock, chords, arrangement, drumRow, noteRow, melody, instruments, bus, assemble, lint,
  tuneFit, sectionAt, layerPlays, measureLayers, measureSections,
  kickDrum, hatDrum, chordTone,
  tempoEcho, clap, acidBass, sawPad, riser,
} from '../../sound/compose.js';
import * as kit from '../../tools/compose/kit.mjs';
import { build, LAYERS, TUNE, CHORDS as TRACK_CHORDS, PARTS } from '../../tools/compose/derelict_run.mjs';

const META = { type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade'], words: ['test', 'tune', 'tiny', 'loop', 'menu', 'synth'], license: 'draft' };
const SR = 8000, BPM = 120, STEP = (SR * 15) / BPM, BAR = STEP * 16;   // samples per 16th and per bar at 120 bpm

/** A small piece around the nodes under test: a clock, four chords, a noise source, and a plain mix of `out`. */
function piece(nodes, out = '0', { validate = false } = {}) {
  const patch = {
    format: 'sfxpatch/0.1', id: 's21-test', name: 'S21 test', category: 'music', description: 'test', meta: META,
    loop: true, wrap: true, normalize: false, gain: 1, duration: '8*4*60/bpm',
    params: [
      { id: 'bpm', label: 'Tempo', min: 100, max: 140, default: BPM },
      { id: 'key', label: 'Key', min: -5, max: 6, default: 0 },
      { id: 'bright', label: 'Brightness', min: 0, max: 1, default: 0.6 },
    ],
    nodes: [...clock(), ...chords('Em C | G F', { tonic: 'E' }), { id: 'nz', type: 'noise' }, ...nodes.flat(Infinity)],
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
const rms = (x, a = 0, b = x.length) => { let sq = 0; for (let i = Math.floor(a); i < Math.floor(b); i++) sq += x[i] * x[i]; return Math.sqrt(sq / Math.max(1, Math.floor(b) - Math.floor(a))); };
const peak = (x, a = 0, b = x.length) => { let p = 0; for (let i = Math.floor(a); i < Math.floor(b); i++) p = Math.max(p, Math.abs(x[i])); return p; };
/** Zero crossings per second between two samples: a rough pitch (twice the frequency of a simple wave). */
const crossings = (x, a, b) => { let n = 0; for (let i = Math.floor(a) + 1; i < Math.floor(b); i++) if ((x[i - 1] < 0) !== (x[i] < 0)) n++; return (n * SR) / (Math.floor(b) - Math.floor(a)); };
const ids = (nodes) => nodes.flat(Infinity).map((n) => n.id);
/** How much edge a sound has: the level of its sample-to-sample changes against its own level. */
const edge = (x, a, b) => { const d = new Float32Array(Math.floor(b) - Math.floor(a) - 1); for (let i = 0; i < d.length; i++) d[i] = x[Math.floor(a) + i + 1] - x[Math.floor(a) + i]; return rms(d) / Math.max(rms(x, a, b), 1e-9); };

test('S21 every new helper is exported by the kit too, and its nodes validate in a patch', () => {
  for (const name of ['tempoEcho', 'clap', 'acidBass', 'sawPad', 'riser']) assert.equal(typeof kit[name], 'function', `kit.mjs passes on ${name}`);
  piece([
    drumRow('cT', '....X.......X...'), clap('cl', 'cT', { noise: 'nz' }),
    drumRow('bT', 'XoxoXoxoXoxoXoxo'), acidBass('b', 'bT', { pitch: 'midi(40 + tr)' }),
    drumRow('pT', 'X...............'), sawPad('p', ['midi(52 + tr)', 'midi(52 + tr + third)', 'midi(52 + tr + fifth)'], { trig: 'pT' }),
    riser('rs', { noise: 'nz' }),
    tempoEcho('e', 'bO'),
  ], 'clO + bO + pL + rsO + eO', { validate: true });
});

test('S21 tempoEcho: the repeats come the given number of 16ths later, each one quieter, at any tempo', () => {
  const nodes = [drumRow('xT', ['X...............', '................', '................', '................']), { id: 'xA', type: 'ad', trig: 'xT', attack: 0.001, decay: 0.02 }, { id: 'xW', type: 'osc', freq: 800 }, { id: 'x', type: 'expr', expr: 'xW*xA' }];
  for (const [bpm, steps] of [[120, 3], [100, 3], [140, 4]]) {
    const step = (SR * 15) / bpm;
    const r = run(piece([nodes, tempoEcho('e', 'x', { steps, feedback: 0.5 })]), ['x', 'eO'], Math.round(step * 16), { bpm });
    const at = (k) => peak(r.eO, k * steps * step - 4, k * steps * step + step * 0.5);
    assert.ok(peak(r.eO, 0, steps * step - 8) < 1e-6, 'nothing before the first repeat: the dry sound is not in it');
    assert.ok(at(1) > 0.5 * peak(r.x), `${bpm} bpm: the first repeat is ${steps} steps after the sound`);
    assert.ok(Math.abs(at(2) / at(1) - 0.5) < 0.08 && Math.abs(at(3) / at(2) - 0.5) < 0.08, `each repeat is half the one before (${at(1).toFixed(2)} ${at(2).toFixed(2)} ${at(3).toFixed(2)})`);
    assert.ok(peak(r.eO, steps * step + step * 0.6, 2 * steps * step - 8) < 0.02, 'silence between the repeats');
  }
  // a tone makes the repeats duller; without one the delay itself is the last node
  assert.deepEqual(ids(tempoEcho('e', 'x')), ['eO']);
  assert.deepEqual(ids(tempoEcho('e', 'x', { tone: 900 })), ['eD', 'eO']);
  assert.equal(tempoEcho('e', 'x', { tone: 900 })[1].mode, 'lp');
  // the buffer is long enough for the slowest tempo a track may have (64 bpm: 32 bars in 120 s)
  for (const steps of [1, 3, 6, 16]) assert.ok(tempoEcho('e', 'x', { steps })[0].max >= (steps * 15) / 64);
  assert.throws(() => tempoEcho('e'), (e) => e instanceof KitError && /input/.test(e.message));
  assert.throws(() => tempoEcho('e', 'x', { steps: 0 }), KitError);
  assert.throws(() => tempoEcho('e', 'x', { feedback: 0.99 }), KitError);
});

test('S21 clap: three bursts and a tail, silent until it is hit, with no pitch of its own', () => {
  const nodes = [drumRow('cT', '....X.......X...'), clap('cl', 'cT', { noise: 'nz', gap: 0.012, decay: 0.15 })];
  const r = run(piece(nodes), ['clO', 'clA'], BAR);
  const hit = STEP * 4;
  assert.equal(peak(r.clO, 0, hit - 1), 0, 'silent before the first clap');
  // the envelope: up at 0, at one gap and at two gaps; down between them
  const env = (sec) => r.clA[Math.round(hit + sec * SR)];
  assert.ok(env(0.0005) > 0.8 && env(0.0125) > 0.8 && env(0.0245) > 0.8, 'three bursts');
  assert.ok(env(0.0095) < 0.35 && env(0.0215) < 0.35, 'with dips between them');
  assert.ok(env(0.05) < env(0.0245) && env(0.05) > 0 && env(0.2) === 0, 'then a tail that dies away');
  assert.ok(rms(r.clO, hit, hit + 0.05 * SR) > 0.05, 'it sounds');
  assert.ok(peak(r.clO, hit + 0.2 * SR, STEP * 12 - 1) === 0, 'and is over before the next');
  assert.equal(clap('cl', 'cT', { noise: 'nz' }).find((n) => n.type === 'filter').mode, 'bp');
  assert.ok(!clap('cl', 'cT').some((n) => n.type === 'osc' || n.type === 'pluck' || n.type === 'modal'), 'noise only: no note that could clash with the chord');
  // with no noise node given it brings its own
  assert.deepEqual(ids(clap('cl', 'cT')), ['clNz', 'clA', 'clN', 'clO']);
  assert.deepEqual(ids(clap('cl', 'cT', { noise: 'nz' })), ['clA', 'clN', 'clO']);
  assert.throws(() => clap('cl'), (e) => e instanceof KitError && /trig/.test(e.message));
});

test('S21 acidBass: one saw on the given pitch whose filter opens on each note, further for a stronger note', () => {
  const make = (over = {}) => piece([drumRow('bT', 'X.o.X.o.X.o.X.o.'), acidBass('b', 'bT', { pitch: 'midi(40 + tr)', floor: 150, open: 2000, ...over })]);
  const r = run(make(), ['bO', 'bW', 'bE', 'bV', 'bA'], BAR * 2);
  assert.ok(Math.abs(crossings(r.bW, 0, BAR) / 2 - 82.4) < 3, 'the saw is on the chord root: E');
  assert.ok(Math.abs(crossings(r.bW, BAR, BAR * 2) / 2 - 65.4) < 3, 'then C');
  const oscs = make().nodes.filter((n) => n.type === 'osc' && n.id.startsWith('b'));
  assert.deepEqual(oscs.map((n) => n.wave), ['saw'], 'one oscillator, a saw');
  assert.ok(r.bE[Math.round(0.003 * SR)] > 0.9 && r.bE[Math.round(STEP * 1.5)] === 0, 'the filter envelope snaps open on the note and shuts again');
  // an accent opens the filter further than a ghost note: more of the saw's edge gets through
  const e = (x, step) => edge(x, STEP * step, STEP * step + 0.04 * SR);
  assert.ok(e(r.bO, 0) > e(r.bO, 2) * 1.15, `accent brighter than ghost (${e(r.bO, 0).toFixed(3)} against ${e(r.bO, 2).toFixed(3)})`);
  // shut (open: 0) it is much duller than open, and still there: about as loud, because the resonance at the floor
  // lifts the low end (a track that wants a shut bass quieter turns it down in its mix)
  const shut = run(make({ open: 0 }), ['bO'], BAR);
  assert.ok(e(shut.bO, 0) < e(r.bO, 0) * 0.6, `with the filter shut it is duller (${e(shut.bO, 0).toFixed(3)} against ${e(r.bO, 0).toFixed(3)})`);
  assert.ok(rms(shut.bO) > 0.1 && Math.abs(20 * Math.log10(rms(shut.bO) / rms(r.bO, 0, BAR))) < 3, 'but still there, within 3 dB of the open bass');
  assert.ok(peak(r.bO) < 2, 'the resonance does not blow up');
  assert.ok(peak(r.bO, STEP * 1.2, STEP * 2 - 1) < 0.02, 'a note is over before the next 16th');
  assert.throws(() => acidBass('b', 'bT'), (err) => err instanceof KitError && /pitch/.test(err.message));
  assert.throws(() => acidBass('b'), (err) => err instanceof KitError && /trig/.test(err.message));
});

test('S21 sawPad: detuned saw pairs, wide, swelling slowly on each trigger and never silent between', () => {
  const notes = ['midi(52 + tr)', 'midi(52 + tr + third)', 'midi(52 + tr + fifth)'];
  const nodes = sawPad('p', notes, { trig: 'pT', detune: 0.006, attack: 0.4, sustain: 0.5 });
  assert.equal(nodes.filter((n) => n.type === 'osc').length, 6, 'two saws for each note');
  assert.ok(nodes.filter((n) => n.type === 'osc').every((n) => n.wave === 'saw'));
  assert.deepEqual(ids(nodes), ['pA', 'pHz1', 'pW1a', 'pW1b', 'pHz2', 'pW2a', 'pW2b', 'pHz3', 'pW3a', 'pW3b', 'pL', 'pR']);
  const r = run(piece([drumRow('pT', 'X...............'), nodes]), ['pL', 'pR', 'pA'], BAR * 2);
  assert.ok(Math.abs(r.pA[2] - 0.5) < 0.02, 'a swell starts from the level it rests at');
  assert.ok(r.pA[Math.round(0.2 * SR)] > 0.7 && r.pA[Math.round(0.2 * SR)] < 0.8, 'half way up after half the attack');
  assert.ok(Math.abs(r.pA[Math.round(0.4 * SR)] - 1) < 0.01, 'full after the attack');
  assert.ok(Math.abs(r.pA[BAR - 2] - 0.5) < 0.02, 'back at rest by the end of the bar');
  assert.ok(rms(r.pL, BAR - STEP, BAR) > 0.02, 'it never goes silent');
  let diff = 0; for (let i = 0; i < BAR; i++) diff += Math.abs(r.pL[i] - r.pR[i]);
  assert.ok(diff / BAR > 0.02, 'left and right are different mixes of the pairs');
  assert.ok(Math.abs(rms(r.pL) / rms(r.pR) - 1) < 0.15, 'and equally loud');
  assert.ok(peak(r.pL) <= 1.2 && rms(r.pL) > 0.05, `the level stays in range (peak ${peak(r.pL).toFixed(2)})`);
  const one = run(piece([drumRow('pT', 'X...............'), sawPad('p', notes.slice(0, 1), { trig: 'pT' })]), ['pL'], BAR);
  assert.ok(peak(one.pL) <= 1.2, 'whatever the number of notes');
  assert.throws(() => sawPad('p', []), KitError);
  assert.throws(() => sawPad('p', 'midi(52)'), KitError);
  assert.throws(() => sawPad('p', notes, { sustain: 1.5 }), KitError);
});

test('S21 riser: silent except in its bar, where it climbs in level and in pitch, then stops dead', () => {
  const nodes = riser('rs', { noise: 'nz', bar: 4, of: 4, low: 300, high: 3000 });
  assert.equal(nodes[0].steps, '...X');
  assert.equal(nodes[0].every, 16);
  const r = run(piece([nodes]), ['rsO', 'rsE'], BAR * 5);
  assert.equal(peak(r.rsO, 0, BAR * 3 - 1), 0, 'silent in bars 1 to 3');
  const q = (k) => rms(r.rsO, BAR * 3 + (BAR * k) / 4, BAR * 3 + (BAR * (k + 1)) / 4);
  assert.ok(q(0) < q(1) && q(1) < q(2) && q(2) < q(3), `louder through the bar: ${[0, 1, 2, 3].map((k) => q(k).toFixed(3)).join(' ')}`);
  const hz = (k) => crossings(r.rsO, BAR * 3 + (BAR * k) / 4, BAR * 3 + (BAR * (k + 1)) / 4);
  assert.ok(hz(3) > hz(1) * 1.5, `and higher: ${hz(1).toFixed(0)} then ${hz(3).toFixed(0)} crossings a second`);
  assert.ok(Math.abs(r.rsE[Math.round(BAR * 3.5)] - 0.5) < 0.01 && r.rsE[BAR * 4 - 2] > 0.99, 'the climb takes exactly the bar');
  assert.ok(peak(r.rsO, BAR * 4 + 0.02 * SR, BAR * 5) < 1e-3, 'gone at the next bar line');
  // by default: the last bar of every eight, with a noise source of its own when none is given
  assert.equal(riser('rs', { noise: 'nz' })[0].steps, '.......X');
  assert.deepEqual(ids(riser('rs')), ['rsNz', 'rsT', 'rsE', 'rsN', 'rsO']);
  assert.throws(() => riser('rs', { noise: 'nz', of: 3 }), (e) => e instanceof KitError && /1, 2, 4 or 8/.test(e.message));
  assert.throws(() => riser('rs', { noise: 'nz', bar: 9 }), KitError);
});

test('S21 a whole piece made with the new voices assembles, lints clean and is stereo', () => {
  const TUNE = ['C5 _ _ _ _ _ D5 _ _ _ _ _ G4 _ _ _', '_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'];
  const p = assemble({
    id: 'tiny-synth', name: 'Tiny synth', description: 'A test piece.', meta: META, tempo: [100, 140, 120],
    defaults: { intensity: 1, bars: 8, inst: 'Synth lead' },
    nodes: [
      clock(), chords('C F | G C', { tonic: 'C' }), arrangement({ beat: { section: 2, intensity: [0.2, 0.3] } }), { id: 'nz', type: 'noise' },
      drumRow('kT', 'X...X...X...X...'), kickDrum('k', 'kT'),
      drumRow('cT', '....X.......X...'), clap('cl', 'cT', { noise: 'nz' }),
      drumRow('hT', '..x...x...x...x.'), hatDrum('h', 'hT', { noise: 'nz' }),
      drumRow('bT', 'XoxoXoxoXoxoXoxo'), acidBass('b', 'bT', { pitch: 'midi(36 + tr)' }),
      drumRow('pT', 'X...............'), sawPad('p', ['midi(48 + tr)', 'midi(48 + tr + third)', 'midi(48 + tr + fifth)'], { trig: 'pT' }),
      riser('rs', { noise: 'nz' }),
      noteRow('arD', '0 1 2 3 1 2 3 4', { every: 2 }), chordTone('arS', 'arD'), { id: 'arW', type: 'osc', wave: 'pulse', width: 0.2, freq: 'midi(48 + tr + arS)' },
      melody('l', TUNE), instruments('l', { noise: 'nz' }), tempoEcho('e', 'lF', { steps: 3 }),
      bus({ centre: '(kO + clO + hO)*0.5*gBeat + bO*0.3', left: 'pL*0.3 + arW*0.05 + lF*0.5 + rsO*0.3', right: 'pR*0.3 + arW*0.05 + lF*0.5 + eO*0.3 + rsO*0.3', duck: 'kA*gBeat' }),
    ],
    presets: { Calm: { intensity: 0.1 }, Walk: { intensity: 0.5 }, Run: { intensity: 1, bpm: 132 } },
  });
  assert.deepEqual(lint(p), []);
  assert.deepEqual(validatePatch(p).errors, []);
  assert.equal(p.out.length, 2);
});

// ---- part 2: derelict-run against its specification row ---------------------------------------------------------

const SOUNDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sounds');
const read = (id) => JSON.parse(fs.readFileSync(path.join(SOUNDS, `${id}.json`), 'utf8'));
const track = build();
const node = (p, id) => p.nodes.find((n) => n.id === id);
const flat = (s) => s.replace(/[|\s]/g, '');
const nums = (s) => { let prev = 0; return s.replace(/\|/g, ' ').trim().split(/\s+/).map((x) => (prev = x === '_' ? prev : Number(x))); };   // "_" holds
const barsOf = (s) => s.split('|').map((b) => b.trim());
const pcs = (list) => list.map((r) => ((r % 12) + 12) % 12);
/** The tune of a patch as the moves between its notes, in semitones (a transposed copy gives the same list). */
const moves = (p, seq = 'lS', gate = 'lG') => { const s2 = nums(node(p, seq).steps), g = flat(node(p, gate).steps); const hit = s2.filter((_, i) => g[i] !== '.'); return hit.slice(1).map((x, i) => x - hit[i]); };

test('derelict-run: the file in sounds/ is what the generator writes, with valid metadata', () => {
  const onDisk = read('derelict-run');
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(track)), 'run: node tools/compose/derelict_run.mjs');
  const m = validateMeta(onDisk.meta, 'music');
  assert.equal(m.ok, true, m.errors.join('; '));
  assert.deepEqual(validatePatch(onDisk).errors, []);
  assert.deepEqual(lint(onDisk), []);
});

test('derelict-run: identity, metadata, nine controls and three styles are the specification row', () => {
  assert.equal(track.id, 'derelict-run');
  assert.equal(track.name, 'Station run theme');
  assert.equal(track.category, 'music');
  assert.deepEqual([track.loop, track.wrap, track.normalize], [true, true, false]);
  assert.deepEqual([track.meta.type, track.meta.role, track.meta.themes[0], track.meta.gameTypes[0], track.meta.license], ['music', 'music/exploration', 'sci-fi', 'roguelike-action', 'draft']);
  assert.ok(track.meta.words.length >= 6 && track.meta.words.length <= 14);
  for (const w of ['derelict', 'music', 'sci-fi', 'roguelite']) assert.ok(!track.meta.words.includes(w), `"${w}" repeats the bundle, type or theme`);
  assert.deepEqual(track.params.map((p) => p.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'bright', 'space', 'lead', 'grit']);
  const by = Object.fromEntries(track.params.map((p) => [p.id, p]));
  assert.deepEqual([by.bpm.min, by.bpm.max, by.bpm.default], [112, 140, 126]);
  assert.deepEqual([by.key.min, by.key.max, by.key.default], [-5, 6, 0]);
  assert.deepEqual([by.bars.min, by.bars.max, by.bars.step, by.bars.default], [8, 32, 8, 16]);
  assert.deepEqual(by.inst.options, INSTRUMENTS);
  assert.equal(by.inst.options[by.inst.default], 'Synth lead');
  assert.deepEqual([by.intensity.default, by.bright.default, by.space.default, by.lead.default], [0.85, 0.6, 0.08, 0.8]);
  assert.deepEqual([by.lead.label, by.grit.label], ['Melody', 'Grit']);
  assert.deepEqual(Object.keys(track.presets), ['Deck one', 'Deep station', 'Overrun']);
  const tempo = (name) => track.presets[name].bpm ?? by.bpm.default, drive = (name) => track.presets[name].intensity;
  assert.ok(drive('Deck one') < drive('Deep station') && drive('Deep station') < drive('Overrun'), 'the styles follow the floor number');
  // a look may speed the music up or slow it down by 5%: no style sits where that is cut off
  for (const name of Object.keys(track.presets)) {
    assert.ok(tempo(name) * 1.05 <= by.bpm.max, `"${name}" has no room to speed up by 5%`);
    assert.ok(tempo(name) * 0.95 >= by.bpm.min, `"${name}" has no room to slow down by 5%`);
  }
});

test('derelict-run: the chords are Em Em C D | Em Em G F, in E, and the pad holds only their notes', () => {
  assert.equal(TRACK_CHORDS, 'Em Em C D | Em Em G F');
  assert.equal(node(track, 'tonic').expr, '4', 'E');
  const root = nums(node(track, 'root').steps), third = nums(node(track, 'third').steps), fifth = nums(node(track, 'fifth').steps);
  assert.deepEqual(pcs(root), [0, 0, 8, 10, 0, 0, 3, 1], 'semitones above E: E E C D E E G F');
  assert.deepEqual(third, [3, 3, 4, 4, 3, 3, 4, 4], 'minor on E, major on C, D, G and F');
  assert.deepEqual(fifth, [7, 7, 7, 7, 7, 7, 7, 7]);
  assert.deepEqual(root, [0, 0, -4, -2, 0, 0, 3, 1], 'the bass drops to C and D under the E, and F sits a semitone over it');
  const rows = ['pLo', 'pMi', 'pHi'].map((id) => nums(node(track, id).steps));
  for (let b = 0; b < 8; b++) {
    const tones = pcs([root[b], root[b] + third[b], root[b] + fifth[b]]);
    const held = pcs(rows.map((r) => r[b]));
    assert.deepEqual([...held].sort(), [...tones].sort(), `bar ${b + 1}: the pad holds the three notes of the chord`);
    if (b > 0) for (const r of rows) assert.ok(Math.abs(r[b] - r[b - 1]) <= 3, `bar ${b + 1}: a pad voice moves by a step, not a leap`);
  }
});

test('derelict-run: the layers are the ones the specification lists', () => {
  // (1) bass: one saw in running 16ths, a filter that opens on each note and with Intensity
  assert.deepEqual(track.nodes.filter((n) => n.type === 'osc' && /^b[A-Z]/.test(n.id)).map((n) => n.wave), ['saw']);
  for (const bar of barsOf(node(track, 'bT').steps)) assert.ok(!bar.includes('.') && bar.length === 16, 'a bass note on every 16th');
  assert.match(node(track, 'bL').freq, /gOpen/);
  assert.match(node(track, 'bL').freq, /bE/);
  assert.match(node(track, 'bW').freq, /^midi\(40 \+ tr \+ bS\)$/, 'on the chord root, E2 for the home chord');
  for (const x of nums(node(track, 'bS').steps)) assert.ok(x === 0 || x === 12, 'root and octave only');
  // (2) kick on every beat, hat on the off-beats, clap on 2 and 4
  for (const bar of barsOf(node(track, 'kT').steps)) assert.equal(bar, 'X...X...X...X...');
  for (const bar of barsOf(node(track, 'hT').steps)) { for (const i of [2, 6, 10, 14]) assert.notEqual(bar[i], '.', 'a hat on every off-beat'); for (const i of [0, 4, 8, 12]) assert.equal(bar[i], '.', 'never on the beat'); }
  for (const bar of barsOf(node(track, 'cT').steps)) { assert.equal(bar[4], 'X'); assert.equal(bar[12], 'X'); assert.equal(bar[0], '.'); assert.equal(bar[8], '.'); }
  assert.ok(!track.nodes.some((n) => /^(h|cl)[A-Z]/.test(n.id) && ['osc', 'pluck', 'modal'].includes(n.type)), 'hat and clap are noise: no pitch of their own');
  assert.match(node(track, 'kW').freq, /tonic \+ tr/, 'the kick lands on the chord root');
  // (3) pad: detuned saws, a slow attack
  const padSaws = track.nodes.filter((n) => /^pW\d[ab]$/.test(n.id));
  assert.equal(padSaws.length, 6);
  assert.ok(padSaws.every((n) => n.wave === 'saw'));
  assert.ok(node(track, 'pA').points[1][0] >= 0.3, 'the pad takes at least 0.3 s to swell');
  // (4) arpeggio: a thin pulse climbing chord tones in 8ths, with an echo
  assert.equal(node(track, 'arW').wave, 'pulse');
  assert.ok(node(track, 'arW').width <= 0.25, 'thin');
  assert.equal(flat(node(track, 'arT').steps).toLowerCase(), 'x.x.x.x.x.x.x.x.');
  assert.equal(node(track, 'arD').every, 2);
  const arp = nums(node(track, 'arD').steps);
  for (let i = 0; i < arp.length; i += 4) assert.ok(arp[i] < arp[i + 1] && arp[i + 1] < arp[i + 2] && arp[i + 2] < arp[i + 3], 'every group of four climbs');
  assert.match(node(track, 'aeD').time, /45\/bpm/, 'the arpeggio echo is three 16ths behind');
  // (5) the melody's echo is a dotted 8th (three 16ths) behind; (6) the riser fills the last bar of every eight
  assert.match(node(track, 'ecD').time, /45\/bpm/);
  assert.equal(node(track, 'ecD').in, 'lF');
  assert.equal(node(track, 'rsT').steps, '.......X');
  // kick, bass, hat and clap are the same on both sides; pad, arpeggio and echoes differ
  const [l, r] = [node(track, 'muL').expr, node(track, 'muR').expr];
  assert.notEqual(l, r);
  for (const id of ['kD', 'dC', 'bD']) { assert.ok(node(track, 'ctr').expr.includes(id)); assert.ok(!l.includes(id) && !r.includes(id), `${id} is in the centre only`); }
});

test('derelict-run: the tune is a three-note figure that falls a step and a third, again a third higher, then one long F', () => {
  assert.equal(TUNE.length, 8);
  const notes = TUNE.map((b) => b.split(/\s+/).filter((x) => x !== '_').map((x) => x.replace(/-+$/, '')));
  assert.deepEqual(notes, [['E5', 'D5', 'B4'], [], ['G5', 'F#5', 'D5'], [], ['E5', 'D5', 'B4'], [], ['G5', 'F#5', 'D5'], ['F5']]);
  const s = nums(node(track, 'lS').steps), g = flat(node(track, 'lG').steps);
  assert.equal(s.length, 128);
  const at = (bar) => [0, 6, 12].map((i) => s[bar * 16 + i]);
  for (const bar of [0, 2, 4, 6]) {
    assert.deepEqual([0, 6, 12].map((i) => g[bar * 16 + i] !== '.'), [true, true, true], 'a note every dotted quarter');
    assert.equal(g.slice(bar * 16, bar * 16 + 16).replace(/\./g, '').length, 3, 'three notes in the bar');
    const [a, b, c] = at(bar);
    assert.deepEqual([b - a, c - b], bar % 4 === 0 ? [-2, -3] : [-1, -4], 'down a step, then down a third');
  }
  assert.deepEqual(at(2).map((x, i) => x - at(0)[i]), [3, 4, 3], 'the second figure is the first a third higher, in the scale');
  for (const bar of [1, 3, 5]) assert.equal(g.slice(bar * 16, bar * 16 + 16), '................', 'the bar after a figure is left to its echo');
  assert.equal(g.slice(7 * 16).replace(/\./g, '').length, 1, 'one note in bar 8');
  assert.equal(pcs([s[7 * 16]])[0], 5, 'it is F: the root of the F chord, a semitone above the E the loop starts on');
  assert.equal(s[7 * 16] - s[0], 1);
  // range and fit
  assert.ok(Math.max(...s) - Math.min(...s) <= 24, 'inside two octaves');
  const fit = tuneFit(track);
  assert.equal(fit.tonic, 4);
  assert.ok(fit.lines[0].chordShare >= 0.8, `chord share ${fit.lines[0].chordShare}`);
  assert.equal(fit.lines[0].scaleShare, 1);
});

test('derelict-run: no other track in the library has its chords, its tune or its rhythms', () => {
  const others = fs.readdirSync(SOUNDS).filter((f) => f.endsWith('.json')).map((f) => read(f.slice(0, -5))).filter((p) => p.category === 'music' && p.id !== 'derelict-run' && node(p, 'lS') && node(p, 'lG'));
  for (const id of ['battle-theme', 'thornwood-overworld']) assert.ok(others.some((p) => p.id === id), `${id} is compared`);
  // the rhythms of the tune: every bar with more than one note (a bar that is one held note belongs to nobody)
  const mine = moves(track), myBars = barsOf(node(track, 'lG').steps).filter((b) => b.replace(/\./g, '').length > 1), myRoots = pcs(nums(node(track, 'root').steps)), myThirds = nums(node(track, 'third').steps);
  const rel = (roots) => roots.map((r) => (r - roots[0] + 12) % 12).join(' ');
  for (const p of others) {
    const theirs = ' ' + moves(p).join(' ') + ' ';
    assert.notEqual(mine.join(' '), moves(p).join(' '), `${p.id}: the same tune`);
    // the whole first phrase (the two figures and the move between them: five moves) appears nowhere in the other tune
    assert.ok(!theirs.includes(' ' + mine.slice(0, 5).join(' ') + ' '), `${p.id}: has the first two phrases, note for note`);
    assert.ok(myBars.length >= 4, 'the figure is played four times');
    const shared = myBars.filter((b) => barsOf(node(p, 'lG').steps).includes(b));
    assert.equal(shared.length, 0, `${p.id}: a bar of the tune has a rhythm it uses too`);
    if (node(p, 'root')) {
      const roots = pcs(nums(node(p, 'root').steps));
      assert.ok(rel(roots) !== rel(myRoots) || JSON.stringify(nums(node(p, 'third').steps)) !== JSON.stringify(myThirds), `${p.id}: the same chord order`);
    }
    assert.notEqual(track.params.find((q) => q.id === 'bpm').default, p.params.find((q) => q.id === 'bpm').default, `${p.id}: the same tempo`);
  }
});

// ---- how intensity and length bring the layers in

const GATES = { beat: 'gBeat', clap: 'gClap', arp: 'gArp', tune: 'gTune', top: 'gTop', rise: 'gRise' };
function gatesAt(params, seconds = 0.2, sr = 8000) {
  const v = createVoice(track, { sampleRate: sr, params });
  for (let i = 0; i < seconds * sr; i++) v.tick();
  return Object.fromEntries(Object.entries({ bed: 'gBed', open: 'gOpen', lift: 'gLift', ...GATES }).map(([k, id]) => [k, v.nodeValues[v.nodeIds.indexOf(id)]]));
}

test('derelict-run: intensity brings the layers in, in the order the specification gives', () => {
  const on = (g) => Object.keys(GATES).filter((k) => g[k] > 0.99).join(' ');
  const off = (g) => Object.keys(GATES).filter((k) => g[k] < 0.01).join(' ');
  // 0 to 0.25: pad and the bass with its filter nearly shut
  for (const i of [0, 0.1, 0.25]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(off(g), 'beat clap arp tune top rise', `intensity ${i}: pad and bass only`); assert.ok(g.bed >= 0.8, 'still music at 0'); assert.ok(g.open <= 0.11, 'the bass filter is nearly shut'); }
  // 0.25 to 0.5: kick and hat; the bass filter opens. The melody is in, held back, by 0.4 (the specification adds it
  // at 0.75; looks set intensity from 0.4 up and must keep the tune)
  { const g = gatesAt({ intensity: 0.3, bars: 8 }); assert.equal(off(g), 'clap arp tune top rise'); assert.ok(g.beat > 0 && g.beat < 1 && g.open > 0.11 && g.open < 0.5); }
  for (const i of [0.4, 0.5]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'beat tune', `intensity ${i}: kick, hat and the melody`); assert.equal(off(g), 'clap arp top rise'); assert.ok(g.lift < 0.7, 'the melody is held back'); }
  assert.ok(gatesAt({ intensity: 0.5, bars: 8 }).open > 0.99, 'the bass filter is open by 0.5');
  // 0.5 to 0.75: clap and arpeggio
  for (const i of [0.7, 0.75]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'beat clap arp tune', `intensity ${i}: clap and arpeggio added`); assert.equal(off(g), 'top rise'); }
  // 0.75 to 1: the melody comes to the front, with its echo and the riser
  for (const i of [0.95, 1]) { const g = gatesAt({ intensity: i, bars: 8 }); assert.equal(on(g), 'beat clap arp tune top rise', `intensity ${i}: everything`); assert.ok(g.lift > 0.99, 'the melody is at the front'); }
  const d = gatesAt({ intensity: 0.85, bars: 8 });
  assert.ok(d.top > 0.5 && d.rise > 0.5 && d.lift > 0.75, 'at the default (0.85) the echo and the riser are well in');
});

test('derelict-run: every look keeps the melody', () => {
  const set = THEME_PRESETS.map((p) => [p.name, p.theme?.music?.intensity]).filter(([, i]) => i !== null && i !== undefined);
  assert.ok(set.length >= 2, 'some looks set the intensity');
  for (const [name, intensity] of [...set, ['the lowest a random look draws', 0.4]]) {
    const g = gatesAt({ intensity, bars: 8 });
    assert.ok(g.tune > 0.99, `"${name}" sets intensity ${intensity}, where the melody is at ${g.tune}`);
  }
});

test('derelict-run: a longer version builds up from the front: pad and bass, then drums, then the arpeggio, then everything', () => {
  const sr = 8000, bpm = 126, barLen = (sr * 240) / bpm;
  const SECTIONED = ['beat', 'clap', 'arp', 'tune', 'top'];
  const want = { 1: '', 2: 'beat clap', 3: 'beat clap arp', 4: 'beat clap arp tune top' };
  for (const bars of LENGTHS) {
    const v = createVoice(track, { sampleRate: sr, params: { bars, bpm, intensity: 1 } });
    let n = 0;
    for (let s = 0; s < bars / 8; s++) {
      const mid = Math.round((s * 8 + 4.5) * barLen);
      while (n < mid) { v.tick(); n++; }
      const section = sectionAt(s * 8 + 4, bars).section;
      const on = SECTIONED.filter((k) => v.nodeValues[v.nodeIds.indexOf(GATES[k])] > 0.99).join(' ');
      assert.equal(on, want[section], `${bars} bars, section ${s + 1}`);
      for (const k of SECTIONED) assert.equal(on.split(' ').includes(k), layerPlays(LAYERS[k], s * 8 + 4, bars));
      assert.ok(v.nodeValues[v.nodeIds.indexOf('gRise')] > 0.99, 'the riser closes every section');
    }
  }
  assert.deepEqual(LENGTHS.map((b) => sectionAt(0, b).section), [4, 3, 2, 1]);
});

test('derelict-run: by measurement, every section is louder than the one before, and the tune leads on every instrument', () => {
  const s = measureSections(track, { sampleRate: 8000 })[32];
  assert.ok(s[1] - s[0] >= 1.5, `section 2 is ${(s[1] - s[0]).toFixed(1)} dB above section 1`);
  assert.ok(s[2] - s[1] >= 0.5 && s[3] - s[2] >= 0.5, `sections keep climbing: ${s.map((d) => d.toFixed(1)).join(' ')}`);
  // 300 to 1200 Hz is where the tune, the pad, the arpeggio and the bass's edge all sit. On the instrument with the
  // least in that band (the Bell) the tune still leads everything pitched under it by 5 dB, at full intensity and at
  // 0.5, the lowest a look sets
  const bell = INSTRUMENTS.indexOf('Bell');
  for (const intensity of [1, 0.5]) {
    const m = measureLayers(track, { tune: PARTS.tune, under: PARTS.under }, { band: [300, 1200], sampleRate: 11025, params: { inst: bell, intensity } });
    assert.ok(m.tune.db - m.under.db >= 5, `intensity ${intensity}: tune ${m.tune.db.toFixed(1)} dB against pad, arpeggio and bass ${m.under.db.toFixed(1)} dB`);
  }
});

test('derelict-run: a quick render: stereo, never silent, under the limiter, at both ends of intensity and at the fastest look', () => {
  for (const [intensity, bpm] of [[0, 126], [1, 147]]) {   // 147: the top tempo and a look's 5%
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
