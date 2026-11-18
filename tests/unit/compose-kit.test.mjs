// The music kit (tools/compose/kit.mjs): the machinery every track shares.
// Everything here is checked by measurement on a tiny piece built inline, so adding tracks never breaks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePatch, createVoice, renderPatch } from '../../sound/sfx-engine.js';
import { lengthControl, instrumentControl, writtenTempo } from '../../quality/sound.js';
import { validateMeta } from '../../catalog/schema.js';
import {
  INSTRUMENTS, LENGTHS, LOOP_STEPS, KitError,
  clock, chords, arrangement, sectionAt, layerPlays, drumRow, noteRow, melody, instruments, bus,
  assemble, lint, writePatch, measureInstruments, matchGains, measureSections,
} from '../../tools/compose/kit.mjs';

const META = { type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade'], words: ['test', 'tune', 'tiny', 'loop', 'menu', 'jolly'], license: 'draft' };
const LAYERS = { drums: { section: 2, intensity: [0.25, 0.35] }, tune: { section: 3, intensity: [0.5, 0.6] }, pad: { section: 4, intensity: [0.75, 0.85] } };
const TUNE = [
  'C5 _ E5 _ G5 _ _ _ E5 _ _ _ C5 _ _ _',
  'F5 _ _ _ A5 _ F5 _ C5 _ _ _ _ _ D5- E5-',
  'D5 _ G5 _ B5 _ _ _ G5 _ _ _ D5 _ _ _',
  'C5 _ _ _ _ _ _ _ G4 _ _ _ C5 _ _ _',
];

/** A whole piece in a few lines: what a composer writes. */
const made = new Map();
function tiny(opts = {}) {
  // assembling validates by rendering every control's ends, so the plain piece is built once
  const key = JSON.stringify(opts);
  if (!made.has(key)) made.set(key, build(opts));
  return structuredClone(made.get(key));
}
function build({ gains, swing = false, extraNodes = [], over = {} } = {}) {
  return assemble({
    id: 'tiny-tune', name: 'Tiny tune', description: 'A four-chord test piece.', meta: META,
    tempo: [100, 140, 120],
    defaults: { intensity: 1, bars: 8, inst: 'Flute' },
    extraParams: swing ? [{ id: 'swing', label: 'Bounce', min: 0, max: 1, default: 0.5 }] : [],
    nodes: [
      clock(swing ? { swing: 'swing' } : {}),
      chords('C F | G C', { tonic: 'C' }),
      arrangement(LAYERS),
      drumRow('kT', ['X...x...X...x...']),
      { id: 'kA', type: 'ad', trig: 'kT', attack: 0.001, decay: 0.15 },
      { id: 'kO', type: 'osc', freq: '45 + kA*120' },
      { id: 'bO', type: 'osc', wave: 'tri', freq: 'midi(36 + tr)' },
      melody('l', TUNE),
      instruments('l', gains ? { gains } : {}),
      { id: 'pO', type: 'osc', wave: 'tri', freq: 'midi(60 + tr + third)' },
      ...extraNodes,
      bus({ centre: 'kO*kA*0.6*gDrums + bO*0.3', left: 'lF*0.7*gTune + pO*0.3*gPad', right: 'lF*0.7*gTune + pO*0.2*gPad', duck: 'kA' }),
    ],
    presets: { Calm: { intensity: 0.2 }, Walk: { intensity: 0.6 }, Run: { intensity: 1, bpm: 136 } },
    ...over,
  });
}
const nodeIndex = (voice, id) => { const i = voice.nodeIds.indexOf(id); assert.ok(i >= 0, `no node "${id}"`); return i; };

// ---- assembling ----------------------------------------------------------------------------

test('a patch assembled from a minimal piece validates and is a music track', () => {
  const p = tiny();
  const v = validatePatch(p);
  assert.deepEqual(v.errors, []);
  assert.equal(p.format, 'sfxpatch/0.1');
  assert.equal(p.category, 'music');
  assert.equal(p.loop, true);
  assert.equal(p.wrap, true);
  assert.equal(p.normalize, false);
  assert.equal(Array.isArray(p.out) && p.out.length, 2, 'stereo');
  assert.equal(validateMeta(p.meta, 'music').ok, true);
  assert.deepEqual(lint(p), [], 'no style-guide complaints');
});

test('a track written by the kit carries valid metadata in the file, so writing it again is always safe', () => {
  // the site build rejects a track with no metadata: the generator itself must write it, every time
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-kit-'));
  try {
    const file = writePatch(tiny(), path.join(dir, 'tiny-tune.json'));
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(onDisk.meta, META);
    const r = validateMeta(onDisk.meta, 'music');
    assert.equal(r.ok, true, r.errors.join('; '));
    writePatch(tiny(), file);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), onDisk, 'writing twice gives the same file');
    assert.deepEqual(validatePatch(onDisk).errors, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the standard controls have the fixed ids, order and choices', () => {
  const p = tiny();
  assert.deepEqual(p.params.map((q) => q.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'bright', 'space']);
  const by = Object.fromEntries(p.params.map((q) => [q.id, q]));
  assert.deepEqual([by.bpm.min, by.bpm.max, by.bpm.default, by.bpm.unit], [100, 140, 120, 'bpm']);
  assert.deepEqual([by.key.min, by.key.max, by.key.default], [-5, 6, 0]);
  assert.deepEqual([by.bars.min, by.bars.max, by.bars.step, by.bars.default], [8, 32, 8, 8]);
  assert.deepEqual(by.inst.options, ['Synth lead', 'Flute', 'Chiptune', 'Bell', 'Plucked string']);
  assert.deepEqual(by.inst.options, INSTRUMENTS);
  assert.equal(by.inst.default, 1, 'the default instrument is given by name');
  assert.deepEqual([by.space.min, by.space.max], [0, 0.5]);
  // what the quality bar looks for (quality/sound.js)
  assert.equal(lengthControl(p).id, 'bars');
  assert.equal(instrumentControl(p).id, 'inst');
  assert.equal(writtenTempo(p), 120);
  assert.match(p.duration, /\bbars\b/);
  assert.match(p.duration, /\bbpm\b/);
});

test('the length control sets the length in bars at the written tempo', () => {
  const p = tiny();
  for (const bars of LENGTHS) {
    const v = createVoice(p, { params: { bars, bpm: 120 } });
    assert.ok(Math.abs(v.duration - bars * 2) < 1e-9, `${bars} bars at 120 bpm is ${bars * 2} s, got ${v.duration}`);
  }
});

test('extra controls come after the standard ones and a track may have at most 10', () => {
  const p = tiny({ swing: true });
  assert.deepEqual(p.params.map((q) => q.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'bright', 'space', 'swing']);
  const four = ['a1', 'b1', 'c1', 'd1'].map((id) => ({ id, label: id, min: 0, max: 1, default: 0.5 }));
  assert.throws(() => tiny({ over: { extraParams: four } }), (e) => e instanceof KitError && /at most 10/.test(e.message));
});

test('assemble refuses a piece with bad metadata, a wrong style or a tempo too slow for 32 bars', () => {
  assert.throws(() => tiny({ over: { meta: { ...META, role: 'music/nowhere' } } }), (e) => e instanceof KitError && /meta/.test(e.message));
  assert.throws(() => tiny({ over: { meta: undefined } }), /meta/);
  assert.throws(() => tiny({ over: { presets: { Calm: { loudness: 1 } } } }), /loudness/);
  assert.throws(() => tiny({ over: { tempo: [40, 80, 60] } }), /120 s/);
  assert.throws(() => tiny({ over: { defaults: { intensity: 1, bars: 8, inst: 'Kazoo' } } }), /Kazoo/);
  assert.throws(() => tiny({ over: { defaults: { intensity: 1, bars: 12, inst: 'Flute' } } }), /bars/);
});

test('lint names what the style guide asks for and the piece lacks', () => {
  const p = tiny({ over: { presets: { Only: { intensity: 0.5 } } } });
  assert.ok(lint(p).some((m) => /three styles/i.test(m)), lint(p).join('\n'));
});

// ---- the bar counter and the section gates -----------------------------------------------------

test('sectionAt gives the right section at each bar for each length', () => {
  // sections are numbered as in the 32-bar version: 1 is the opening, 4 is the full band
  const want = { 8: [4], 16: [3, 4], 24: [2, 3, 4], 32: [1, 2, 3, 4] };
  for (const bars of LENGTHS) {
    for (let bar = 0; bar < bars * 3; bar++) {
      const s = sectionAt(bar, bars);
      assert.equal(s.section, want[bars][Math.floor((bar % bars) / 8)], `bar ${bar} of a ${bars}-bar piece`);
      assert.equal(s.rev, 4 - s.section, 'rev counts the sections still to come');
    }
    assert.equal(sectionAt(bars - 1, bars).section, 4, 'the last section is always the full band');
  }
  assert.throws(() => sectionAt(0, 12), KitError);
});

test('layerPlays: a longer version builds up section by section and never just repeats', () => {
  assert.equal(layerPlays(LAYERS.drums, 0, 32), false);
  assert.equal(layerPlays(LAYERS.drums, 8, 32), true);
  assert.equal(layerPlays(LAYERS.tune, 15, 32), false);
  assert.equal(layerPlays(LAYERS.tune, 16, 32), true);
  assert.equal(layerPlays(LAYERS.pad, 23, 32), false);
  assert.equal(layerPlays(LAYERS.pad, 24, 32), true);
  assert.equal(layerPlays(LAYERS.pad, 0, 8), true, 'the shortest length is the full band');
  assert.equal(layerPlays({}, 0, 32), true, 'a layer with no section plays from the start');
  for (const bars of [16, 24, 32]) {
    const sets = [];
    for (let s = 0; s < bars / 8; s++) sets.push(Object.keys(LAYERS).filter((k) => layerPlays(LAYERS[k], s * 8, bars)).join('+'));
    assert.equal(new Set(sets).size, sets.length, `${bars} bars: every section has a different set of layers (${sets.join(' | ')})`);
  }
});

test('the patch itself opens the same gates as sectionAt, bar by bar, through two passes of every length', () => {
  const p = tiny();
  const sr = 8000, bpm = 120, barLen = (sr * 240) / bpm;
  for (const bars of LENGTHS) {
    const voice = createVoice(p, { sampleRate: sr, params: { bars, bpm, intensity: 1 } });
    const iRev = nodeIndex(voice, 'rev'), iBar = nodeIndex(voice, 'barN');
    const gate = { drums: nodeIndex(voice, 'gDrums'), tune: nodeIndex(voice, 'gTune'), pad: nodeIndex(voice, 'gPad') };
    let n = 0;
    for (let bar = 0; bar < bars * 2; bar++) {
      const mid = Math.round((bar + 0.5) * barLen);
      while (n < mid) { voice.tick(); n++; }
      const want = sectionAt(bar, bars);
      assert.equal(voice.nodeValues[iBar], bar % 96, `bar counter at bar ${bar}`);
      assert.equal(voice.nodeValues[iRev], want.rev, `sections to come at bar ${bar} of ${bars}`);
      for (const k of Object.keys(gate)) {
        const on = layerPlays(LAYERS[k], bar, bars) ? 1 : 0;
        assert.ok(Math.abs(voice.nodeValues[gate[k]] - on) < 1e-3, `${k} at bar ${bar} of ${bars}: want ${on}, got ${voice.nodeValues[gate[k]]}`);
      }
    }
  }
});

test('intensity brings a layer in across its window, and a floor keeps a layer playing at 0', () => {
  const nodes = arrangement({ bed: { intensity: [0, 1], floor: 0.6 }, tune: { section: 3, intensity: [0.5, 0.6] } });
  const g = Object.fromEntries(nodes.map((n) => [n.id, n]));
  assert.match(g.gTune.expr, /smooth\(0\.5, 0\.6, intensity\)/);
  assert.ok(g.aTune, 'a gate for the section');
  assert.equal(g.aBed, undefined, 'no gate for a layer that plays from the start');
  const p = tiny({ extraNodes: [] });
  const at = (intensity, id) => { const v = createVoice(p, { sampleRate: 8000, params: { intensity } }); for (let i = 0; i < 400; i++) v.tick(); return v.nodeValues[nodeIndex(v, id)]; };
  assert.equal(at(0.5, 'gTune'), 0);
  assert.ok(Math.abs(at(0.55, 'gTune') - 0.5) < 1e-6);
  assert.ok(Math.abs(at(0.6, 'gTune') - 1) < 1e-6);
  assert.equal(at(0.2, 'gDrums'), 0);
  assert.throws(() => arrangement({ tune: { section: 5 } }), /section/);
  assert.throws(() => arrangement({ tune: { intensity: [0.6, 0.5] } }), /intensity/);
});

// ---- rows: rhythm, notes, chords, melody ---------------------------------------------------------

test('the kit refuses pattern lengths that do not divide the loop', () => {
  assert.equal(LOOP_STEPS, 128);
  assert.throws(() => drumRow('kT', ['X...x...X...x..']), (e) => e instanceof KitError && /bar 1.*15.*16/.test(e.message));
  assert.throws(() => drumRow('kT', ['X...x...X...x...', 'X...x...X...x...', 'X...x...X...x...']), /3 bars.*divide/);
  assert.throws(() => drumRow('kT', 'X..x..x..x..'), /12 steps.*divide/);
  assert.throws(() => noteRow('bS', '0 _ 12 _ 7'), /5 steps.*divide/);
  assert.throws(() => noteRow('bS', '0 5 7 0 5', { every: 16 }), /divide/);
  assert.throws(() => chords('C F G', { tonic: 'C' }), /3 bars.*divide/);
  assert.throws(() => melody('l', TUNE.slice(0, 3)), /3 bars.*divide/);
  assert.throws(() => melody('l', ['C5 _ E5 _']), /bar 1.*4.*16/);
  // a row written by hand, without the helpers, is refused when the piece is assembled
  assert.throws(() => tiny({ extraNodes: [{ id: 'odd', type: 'pattern', trig: 'c16', steps: 'X..x..x..x..' }] }), (e) => e instanceof KitError && /odd.*12 steps.*divide/.test(e.message));
  assert.throws(() => tiny({ extraNodes: [{ id: 'odd', type: 'seq', trig: 'c16', loop: true, every: 16, steps: '0 5 7' }] }), /odd.*divide/);
  assert.throws(() => tiny({ extraNodes: [{ id: 'odd', type: 'seq', trig: 'c16', steps: '0 5 7 0' }] }), /odd.*loop/);
  // lengths that do divide the loop are fine
  assert.equal(drumRow('kT', 'X...').steps.replace(/[|\s]/g, '').length, 4);
  assert.equal(drumRow('kT', ['X...x...X...x...', 'X...x...X...x.x.']).steps.replace(/[|\s]/g, '').length, 32);
  assert.equal(noteRow('bS', '0 _ 12 _').type, 'seq');
});

test('a drum row is a pattern on the shared clock and refuses unknown marks', () => {
  const n = drumRow('sT', ['....X.......X...', '....X.......X.xo']);
  assert.deepEqual([n.id, n.type, n.trig], ['sT', 'pattern', 'c16']);
  assert.equal(n.steps, '....X.......X...|....X.......X.xo');
  assert.throws(() => drumRow('sT', ['....X..q....X...']), /q/);
});

test('chords: names become a root, a third and a fifth for each bar, relative to the tonic', () => {
  const nodes = chords('G G C D | Em C D D', { tonic: 'G' });
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  assert.equal(by.root.steps, '0 0 5 -5 | -3 5 -5 -5');
  assert.equal(by.third.steps, '4 4 4 4 | 3 4 4 4');
  assert.equal(by.fifth.steps, '7 7 7 7 | 7 7 7 7');
  assert.deepEqual([by.root.trig, by.root.every, by.root.loop], ['c16', 16, true]);
  assert.equal(by.tr.expr, 'round(key) + root');
  assert.deepEqual(nodes.bars.map((b) => b.name), ['G', 'G', 'C', 'D', 'Em', 'C', 'D', 'D']);
  // where the roots sit can be chosen: low is the lowest root allowed, in semitones from the tonic
  assert.equal(Object.fromEntries(chords('G G C D | Em C D D', { tonic: 'G', low: 0 }).map((n) => [n.id, n])).root.steps, '0 0 5 7 | 9 5 7 7');
  // other chord kinds, flats and sharps, and an octave mark
  const m = Object.fromEntries(chords("Am Bdim | F#m Bb, | Csus4 C' | E E", { tonic: 'A' }).map((n) => [n.id, n]));
  assert.equal(m.root.steps, '0 2 -3 -11 | 3 15 -5 -5');
  assert.equal(m.third.steps, '3 3 3 4 | 5 4 4 4');
  assert.equal(m.fifth.steps, '7 6 7 7 | 7 7 7 7');
  assert.throws(() => chords('G H', { tonic: 'G' }), /H/);
});

test('melody: note names become a gate row and a note row of the same length', () => {
  const nodes = melody('l', TUNE);
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  assert.deepEqual(Object.keys(by), ['lG', 'lS', 'lV', 'lP']);
  const gate = by.lG.steps.split('|'), notes = by.lS.steps.split('|').map((b) => b.trim().split(/\s+/).map(Number));
  assert.equal(gate[0], 'X.X.X...X...X...');
  assert.equal(gate[1], 'X...X.X.X.....xx', 'a note marked - is softer');
  assert.deepEqual(notes[0], [12, 12, 16, 16, 19, 19, 19, 19, 16, 16, 16, 16, 12, 12, 12, 12], 'semitones above middle C, holds filled in');
  assert.equal(notes.flat().length, 64);
  assert.equal(by.lS.loop, true);
  assert.match(by.lP.in, /midi\(60 \+ round\(key\) \+ lS\)/);
  assert.throws(() => melody('l', ['C5 _ H5 _ G5 _ _ _ E5 _ _ _ C5 _ _ _']), /H5/);
});

test('melody: a second line can follow the first later and higher (an echo)', () => {
  const a = Object.fromEntries(melody('l', TUNE).map((n) => [n.id, n]));
  const e = Object.fromEntries(melody('e', TUNE, { shift: 4, transpose: 12, vel: false }).map((n) => [n.id, n]));
  const flat = (s) => s.replace(/[|\s]/g, '');
  const nums = (s) => s.replace(/\|/g, ' ').trim().split(/\s+/).map(Number);
  const g0 = flat(a.lG.steps), g1 = flat(e.eG.steps), s0 = nums(a.lS.steps), s1 = nums(e.eS.steps);
  for (let i = 0; i < 64; i++) {
    assert.equal(g1[(i + 4) % 64], g0[i], `gate step ${i} plays 4 steps later`);
    assert.equal(s1[(i + 4) % 64], s0[i] + 12, `note step ${i} is an octave up, 4 steps later`);
  }
  assert.equal(e.eV, undefined);
});

// ---- the clock, the key ------------------------------------------------------------------------

function tickTimes(p, params, seconds, sr = 44100) {
  const v = createVoice(p, { sampleRate: sr, params }), i = nodeIndex(v, 'c16'), out = [];
  for (let n = 0; n < seconds * sr; n++) { v.tick(); if (v.nodeValues[i] > 0) out.push(n); }
  return out;
}

test('the clock ticks 16 times a bar at the written tempo', () => {
  const t = tickTimes(tiny(), { bpm: 120 }, 4.01);
  assert.equal(t.length, 33);
  for (let k = 1; k < t.length; k++) assert.ok(Math.abs(t[k] - k * 5512.5) <= 1, `tick ${k}`);
});

test('swing moves every second 16th later and keeps the bar exactly as long', () => {
  const p = tiny({ swing: true });
  const straight = tickTimes(p, { bpm: 120, swing: 0 }, 4.01), full = tickTimes(p, { bpm: 120, swing: 1 }, 4.01);
  assert.equal(full.length, 33);
  for (let k = 0; k < 33; k += 2) assert.ok(Math.abs(full[k] - straight[k]) <= 1, `8th note ${k / 2} does not move`);
  for (let k = 1; k < 33; k += 2) {
    const late = (full[k] - straight[k]) / 5512.5;
    assert.ok(Math.abs(late - 1 / 3) < 0.01, `16th ${k} is a third of a step late (a triplet shuffle), got ${late.toFixed(3)}`);
  }
  assert.ok(Math.abs(full[16] - 88200) <= 1, 'a bar is still a bar');
  assert.ok(Math.abs(full[32] - 176400) <= 1, 'two bars are still two bars');
});

test('key moves every pitch by whole semitones', () => {
  const p = tiny();
  const hz = (key) => { const v = createVoice(p, { sampleRate: 8000, params: { key } }); for (let i = 0; i < 300; i++) v.tick(); return v.nodeValues[nodeIndex(v, 'lP')]; };
  const base = hz(0);
  assert.ok(Math.abs(base - 523.25) < 0.5, `the first note is C5, got ${base}`);
  assert.ok(Math.abs(hz(2) / base - 2 ** (2 / 12)) < 1e-6);
  assert.ok(Math.abs(hz(-5) / base - 2 ** (-5 / 12)) < 1e-6);
});

// ---- the melody instruments ---------------------------------------------------------------------

test('every instrument option renders sound, and each sounds different', () => {
  const p = tiny();
  const levels = measureInstruments(p, { node: 'lF', sampleRate: 11025 });
  assert.deepEqual(levels.map((l) => l.name), INSTRUMENTS);
  for (const l of levels) assert.ok(l.db > -40 && Number.isFinite(l.db), `${l.name} is silent on the melody bus: ${l.db} dB`);
  const renders = INSTRUMENTS.map((_, inst) => renderPatch(p, { sampleRate: 11025, params: { inst, bpm: 140 } }));
  for (const [i, r] of renders.entries()) {
    assert.equal(r.badSamples, 0);
    let sq = 0; for (const s of r.samples) sq += s * s;
    assert.ok(Math.sqrt(sq / r.samples.length) > 0.01, `${INSTRUMENTS[i]}: the whole mix is silent`);
  }
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
    let d = 0; for (let k = 0; k < renders[i].samples.length; k++) d += Math.abs(renders[i].samples[k] - renders[j].samples[k]);
    assert.ok(d / renders[i].samples.length > 1e-3, `${INSTRUMENTS[i]} and ${INSTRUMENTS[j]} render the same samples`);
  }
});

test('matchGains finds gains that put all five instruments within 1 dB of each other', () => {
  const m = matchGains((gains) => tiny({ gains }), { node: 'lF', sampleRate: 11025, params: { bpm: 140 } });
  assert.equal(m.gains.length, 5);
  assert.equal(m.gains[0], 1, 'the synth lead is the reference');
  const levels = measureInstruments(tiny({ gains: m.gains }), { node: 'lF', sampleRate: 11025, params: { bpm: 140 } });
  const dbs = levels.map((l) => l.db);
  assert.ok(Math.max(...dbs) - Math.min(...dbs) < 1, `spread ${(Math.max(...dbs) - Math.min(...dbs)).toFixed(2)} dB: ${dbs.map((d) => d.toFixed(1)).join(', ')}`);
  assert.throws(() => instruments('l', { gains: [1, 1, 1] }), /five/);
});

test('instruments: the flute borrows the piece\'s noise when it has one, and notes can be made longer', () => {
  assert.ok(instruments('l').some((n) => n.id === 'lNz' && n.type === 'noise'));
  const shared = instruments('l', { noise: 'nz' });
  assert.ok(!shared.some((n) => n.type === 'noise'));
  assert.equal(shared.find((n) => n.id === 'lFlN').in, 'nz');
  const decay = (nodes) => nodes.find((n) => n.id === 'lA').decay;
  assert.ok(Math.abs(Number(decay(instruments('l', { length: 1.5 }))) / Number(decay(instruments('l'))) - 1.5) < 1e-6);
  assert.deepEqual(instruments('m').slice(-2).map((n) => n.id), ['mIn', 'mF'], 'the last node is the melody bus');
});

// ---- the bus --------------------------------------------------------------------------------------

test('the bus keeps the centre identical in both channels, spreads the sides and limits the peak', () => {
  const p = tiny();
  const r = renderPatch(p, { sampleRate: 11025, params: { intensity: 1, bars: 8, bpm: 140 } });
  assert.equal(r.channels.length, 2);
  let diff = 0; for (let i = 0; i < r.samples.length; i++) diff += Math.abs(r.channels[0][i] - r.channels[1][i]);
  assert.ok(diff / r.samples.length > 1e-4, 'left and right differ (the pad is spread)');
  assert.ok(r.rawPeak <= p.gain + 1e-6, `the limiter keeps the peak under ${p.gain}, got ${r.rawPeak}`);
  // with the sides silent, only the centre is left: both channels are the same samples
  const q = tiny({ over: { defaults: { intensity: 0.4, bars: 8, inst: 'Flute' } } });
  const c = renderPatch(q, { sampleRate: 11025, params: { bpm: 140 } });
  for (let i = 0; i < c.samples.length; i += 97) assert.equal(c.channels[0][i], c.channels[1][i]);
  const nodes = bus({ centre: 'a', left: 'b', right: 'c' });
  assert.deepEqual(nodes.map((n) => n.id), ['ctr', 'muL', 'muR', 'rv', 'mL', 'mR']);
  assert.deepEqual(bus({ centre: 'a', left: 'b', right: 'c', duck: 'kA' }).map((n) => n.id), ['duck', 'ctr', 'muL', 'muR', 'rv', 'mL', 'mR']);
});

test('measureSections reports a level for every section of every length, and longer versions build up', () => {
  const s = measureSections(tiny(), { sampleRate: 8000, params: { bpm: 140 } });
  assert.deepEqual(Object.keys(s).map(Number), LENGTHS);
  for (const bars of LENGTHS) assert.equal(s[bars].length, bars / 8);
  const last = (bars) => s[bars][s[bars].length - 1];
  assert.ok(s[32][0] < s[32][1] && s[32][1] < s[32][2] && s[32][2] < s[32][3], `32 bars gets louder section by section: ${s[32].map((d) => d.toFixed(1)).join(' ')}`);
  for (const bars of LENGTHS) assert.ok(Math.abs(last(bars) - last(8)) < 0.5, `the last section of ${bars} bars is the full band`);
});
