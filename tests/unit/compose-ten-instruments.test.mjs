// Ten melody instruments and "Plays along" (docs/style-guide.md, section 12; docs/music-styles.md; decided by the
// owner, 2026-11-22). Everything is measured on a tiny piece built inline (and two old track files kept as fixtures),
// so adding tracks never breaks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice, renderPatch } from '../../sound/sfx-engine.js';
import {
  INSTRUMENTS, INSTRUMENT_RANGES, DEFAULT_GAINS, DEFAULT_ALONG_GAINS, ALONG, ALONG_DB, KitError,
  clock, chords, arrangement, drumRow, melody, instruments, bus, assemble, lint, standardParams,
  measureInstruments, matchGains,
} from '../../tools/compose/kit.mjs';
import { PAIRS } from '../../sound/pairs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const META = { type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade'], words: ['test', 'tune', 'tiny', 'loop', 'menu', 'jolly'], license: 'draft' };
const TUNE = [
  'C5 _ E5 _ G5 _ _ _ E5 _ _ _ C5 _ _ _',
  'F5 _ _ _ A5 _ F5 _ C5 _ _ _ _ _ D5- E5-',
  'D5 _ G5 _ B5 _ _ _ G5 _ _ _ D5 _ _ _',
  'C5 _ _ _ _ _ _ _ G4 _ _ _ C5 _ _ _',
];
const LAYERS = { drums: { section: 2, intensity: [0.25, 0.35] }, tune: { section: 3, intensity: [0.3, 0.4] } };
const made = new Map();
function tiny(gains) {
  const key = JSON.stringify(gains ?? null);
  if (!made.has(key)) made.set(key, assemble({
    id: 'tiny-ten', name: 'Tiny ten', description: 'A four-chord test piece.', meta: META,
    tempo: [100, 140, 120], defaults: { intensity: 1, bars: 8 },
    nodes: [
      clock(), chords('C F | G C', { tonic: 'C' }), arrangement(LAYERS),
      drumRow('kT', ['X...x...X...x...']),
      { id: 'kA', type: 'ad', trig: 'kT', attack: 0.001, decay: 0.15 },
      { id: 'kO', type: 'osc', freq: '45 + kA*120' },
      melody('l', TUNE), instruments('l', gains ? { gains } : {}),
      bus({ centre: 'kO*kA*0.6*gDrums', left: 'lF*0.7*gTune', right: 'lF*0.7*gTune', duck: 'kA' }),
    ],
    presets: { Calm: { intensity: 0.2 }, Walk: { intensity: 0.6 }, Run: { intensity: 1, bpm: 136 } },
  }));
  return structuredClone(made.get(key));
}
const SR = 11025, OPTS = { node: 'lF', sampleRate: SR, params: { bpm: 140 } };
let matched = null;
const matchedGains = () => (matched ??= matchGains((g) => tiny(g), OPTS));
const matchedPatch = () => tiny(matchedGains().gains);
// the level of all ten instruments on the melody bus with one of the six along settings: one pass each, kept
const alongLevels = new Map();
const levelsWith = (along) => { if (!alongLevels.has(along)) alongLevels.set(along, measureInstruments(matchedPatch(), { ...OPTS, together: true, params: { ...OPTS.params, along } })); return alongLevels.get(along); };
const rms = (a) => { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); };
const run = (patch, params, sr = 8000) => { const v = createVoice(patch, { sampleRate: sr, params }); return v; };
/** The values of some nodes over the first `seconds` of a patch at some settings. */
function trace(patch, params, ids, seconds, sr = 8000) {
  const v = run(patch, params, sr), idx = ids.map((id) => { const i = v.nodeIds.indexOf(id); assert.ok(i >= 0, `no node ${id}`); return i; });
  const out = ids.map(() => []);
  for (let s = 0; s < seconds * sr; s++) { v.tick(); idx.forEach((i, j) => out[j].push(v.nodeValues[i])); }
  return out;
}

test('the ten instruments, in order: the old five did not move and five were appended', () => {
  assert.deepEqual(INSTRUMENTS, ['Synth lead', 'Flute', 'Chiptune', 'Bell', 'Plucked string', 'Guitar', 'Piano', 'Violin', 'Trumpet', 'Bass']);
  assert.deepEqual(Object.keys(INSTRUMENT_RANGES), INSTRUMENTS);
  assert.equal(DEFAULT_GAINS.length, 10);
  assert.ok(DEFAULT_GAINS.every((g) => g > 0));
  assert.deepEqual(DEFAULT_ALONG_GAINS.length, 6);
  assert.deepEqual(ALONG, ['None', 'Guitar', 'Piano', 'Violin', 'Trumpet', 'Bass', 'Drums']);
  assert.deepEqual(ALONG.slice(1, 6), INSTRUMENTS.slice(5), 'along offers the appended instruments, then Drums last (a drum cannot carry a tune: not in inst)');
  assert.ok(!INSTRUMENTS.includes('Drums'));
  for (const n of INSTRUMENTS.slice(5)) assert.ok(INSTRUMENT_RANGES[n][0] <= 55 && INSTRUMENT_RANGES[n][1] >= 96, `${n} plays the whole written range C4 to F#6 at every Key setting`);
});

test('the standard controls: inst has ten options and "Plays along" follows it, starting at None', () => {
  const p = tiny();
  assert.deepEqual(p.params.map((q) => q.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'along', 'bright', 'space', 'alongLevel']);
  const by = Object.fromEntries(p.params.map((q) => [q.id, q]));
  assert.deepEqual(by.inst.options, INSTRUMENTS);
  assert.deepEqual([by.inst.min, by.inst.max], [0, 9]);
  assert.equal(by.along.label, 'Plays along');
  assert.deepEqual(by.along.options, ['None', 'Guitar', 'Piano', 'Violin', 'Trumpet', 'Bass', 'Drums']);
  assert.deepEqual([by.along.min, by.along.max, by.along.default], [0, 6, 0]);
  assert.deepEqual(lint(p), []);
  assert.equal(standardParams({ tempo: [100, 140, 120], defaults: { along: 'Piano' } }).find((q) => q.id === 'along').default, 2);
  assert.throws(() => standardParams({ tempo: [100, 140, 120], defaults: { along: 'Tuba' } }), (e) => e instanceof KitError && /along/.test(e.message));
  assert.ok(lint({ ...p, params: p.params.map((q) => (q.id === 'along' ? { ...q, default: 2 } : q)) }).some((m) => /starts at None/.test(m)));
  assert.ok(lint({ ...p, params: p.params.map((q) => (q.id === 'inst' ? { ...q, options: INSTRUMENTS.slice(0, 5) } : q)) }).some((m) => /these ten/.test(m)));
});

test('instruments() takes ten gains (five and fifteen too) and says which number goes where', () => {
  const ten = [1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17, 1.18, 1.19, 1.21];
  const text = JSON.stringify(instruments('l', { gains: ten }));
  for (const g of ten) assert.ok(text.includes(String(g)), `gain ${g} is in the nodes`);
  const fifteen = [...ten, 2.11, 2.12, 2.13, 2.14, 2.15, 2.16];
  const t15 = JSON.stringify(instruments('l', { gains: fifteen }));
  for (const g of fifteen.slice(10)) assert.ok(t15.includes(String(g)), `along gain ${g} is in the nodes`);
  assert.ok(JSON.stringify(instruments('l', { gains: [1, 0.8, 1, 1, 1.5] })).includes(String(DEFAULT_GAINS[5])), 'five gains: the new five start from the defaults');
  for (const bad of [[1, 1, 1], [], [1, 1, 1, 1, 0], Array(12).fill(1)]) assert.throws(() => instruments('l', { gains: bad }), (e) => e instanceof KitError && /ten/.test(e.message));
  assert.throws(() => instruments('l', { alongGains: [1, 1] }), /alongGains/);
});

test('the appended instruments come after everything else, so older nodes keep their place (and their noise)', () => {
  const p = tiny();
  const ids = p.nodes.map((n) => n.id), at = (id) => ids.indexOf(id);
  assert.ok(at('lF') < at('mL'), 'the melody bus keeps its place before the mix');
  assert.equal(ids[ids.length - 1], 'lAl');
  assert.ok(at('lGuP') > at('mR') && at('lBaF') > at('mR'), 'the new voices are after the mix');
  const old = instruments('l').slice(0, 25).map((n) => n.id);
  assert.deepEqual(ids.filter((id) => old.includes(id)), old, 'the original nodes are still in their order');
});

test('the older ways of playing along are unchanged by Drums: menu-folk with Guitar to Bass along renders as it did before', () => {
  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'compose', 'before-drums-menu-folk.json'), 'utf8'));
  const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', 'menu-folk.json'), 'utf8'));
  assert.deepEqual(after.params.find((q) => q.id === 'along').options.slice(0, 6), before.params.find((q) => q.id === 'along').options, 'the old indices did not move');
  assert.ok(after.nodes.length > before.nodes.length);
  for (const along of [0, 1, 2, 3, 4, 5]) {
    const a = renderPatch(before, { sampleRate: 8000, maxSeconds: 4, params: { inst: along === 5 ? 6 : 0, along } }).channels[0];
    const b = renderPatch(after, { sampleRate: 8000, maxSeconds: 4, params: { inst: along === 5 ? 6 : 0, along } }).channels[0];
    let worst = 0; for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    assert.ok(worst < 1e-4, `along ${along}: largest difference ${worst}`);
  }
});

test('with Plays along at None the old tracks sound as they did: the same samples for inst 0 to 4 on two old track files', () => {
  for (const [id, now] of [['menu-folk', 'menu_folk'], ['menu-chip', 'menu_chip']]) {
    const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'compose', `before-ten-${id}.json`), 'utf8'));
    const after = JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', `${id}.json`), 'utf8'));
    assert.ok(after.nodes.length > before.nodes.length && after.params.some((q) => q.id === 'along'), `${id}: regenerated with the new instruments`);
    for (let inst = 0; inst < 5; inst++) {
      const a = renderPatch(before, { sampleRate: 8000, maxSeconds: 4, params: { inst } }).channels[0];
      const b = renderPatch(after, { sampleRate: 8000, maxSeconds: 4, params: { inst, along: 0 } }).channels[0];
      let worst = 0; for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
      assert.ok(worst < 1e-4, `${id} inst ${inst}: largest difference ${worst}`);   // (the gains of the old five were re-matched to 3 figures; see the next assertion for what changed)
    }
  }
});

test('every instrument and every way of playing along renders sound that is not silent, not broken and not too loud', () => {
  const p = matchedPatch();
  for (let inst = 0; inst < 10; inst++) {
    const r = renderPatch(p, { sampleRate: 8000, params: { inst, bpm: 140 } });
    assert.equal(r.badSamples, 0, INSTRUMENTS[inst]);
    assert.ok(rms(r.channels[0]) > 0.02, `${INSTRUMENTS[inst]}: the whole mix is silent`);
    assert.ok(r.rawPeak < 0.95, `${INSTRUMENTS[inst]}: peak ${r.rawPeak}`);
  }
  for (let along = 1; along < 7; along++) for (const inst of [0, 6]) {
    const r = renderPatch(p, { sampleRate: 8000, params: { inst, along, bpm: 140 } });
    assert.equal(r.badSamples, 0, `${ALONG[along]} along ${INSTRUMENTS[inst]}`);
    assert.ok(rms(r.channels[0]) > 0.02 && r.rawPeak < 0.95, `${ALONG[along]} along ${INSTRUMENTS[inst]}: peak ${r.rawPeak}`);
  }
});

test('matchGains levels all ten instruments within 1 dB and sets each that plays along ALONG_DB under the tune', () => {
  const m = matchedGains();
  assert.equal(m.gains.length, 16);
  assert.equal(m.gains[0], 1, 'the synth lead is the reference');
  assert.equal(ALONG_DB, -4);
  const dbs = measureInstruments(matchedPatch(), OPTS).map((l) => l.db);
  assert.equal(dbs.length, 10);
  assert.ok(Math.max(...dbs) - Math.min(...dbs) < 1, `spread ${(Math.max(...dbs) - Math.min(...dbs)).toFixed(2)} dB: ${dbs.map((d) => d.toFixed(1)).join(', ')}`);
  assert.equal(m.along.after.length, 6);
  for (const [i, l] of m.along.after.entries()) assert.ok(Math.abs(l.db - m.along.target) < 1, `${ALONG[i + 1]} plays along at ${l.db.toFixed(1)} dB, wanted ${m.along.target.toFixed(1)}`);
});

test('turning Plays along on makes the melody bus louder than the tune alone by 0.5 to 3.5 dB, never more', () => {
  for (const inst of [0, 4, 6, 9]) {
    const alone = levelsWith(0)[inst].db;
    for (let along = 1; along < 7; along++) {
      if (along + 4 === inst) continue;
      const withAlong = levelsWith(along)[inst].db;
      assert.ok(withAlong - alone > 0.5 && withAlong - alone < 3.5, `${ALONG[along]} along ${INSTRUMENTS[inst]}: ${(withAlong - alone).toFixed(2)} dB over the tune`);
    }
  }
});

test('Plays along volume: 0 is silent, the default is the matched level (4 dB under the tune), 1 is about equal to the tune', () => {
  const p = tiny(), by = Object.fromEntries(p.params.map((q) => [q.id, q]));
  assert.equal(by.alongLevel.label, 'Plays along volume');
  assert.deepEqual([by.alongLevel.min, by.alongLevel.max, by.alongLevel.default], [0, 1, 0.6]);
  assert.equal(p.params.findIndex((q) => q.id === 'alongLevel'), p.params.findIndex((q) => q.id === 'space') + 1, 'a track without its own Melody slider has it after Room');
  const at = (alongLevel, along = 3, inst = 0) => rms(trace(p, { inst, along, alongLevel, bpm: 140, intensity: 1 }, ['lAl'], 6)[0]);
  assert.equal(at(0), 0, 'silent at 0');
  const lead = rms(trace(p, { inst: 0, along: 0, bpm: 140 }, ['lF'], 6)[0]);
  const db = (x) => 20 * Math.log10(x / lead);
  const def = at(0.6), full = at(1);
  assert.ok(Math.abs(def / full - 0.6) < 1e-6, 'it scales the volume in proportion');
  assert.ok(db(def) < -1 && db(def) > -9, `default: ${db(def).toFixed(1)} dB against the tune`);
  assert.ok(Math.abs(db(full)) < 3, `at 1: ${db(full).toFixed(1)} dB against the tune, about equal`);
  assert.ok(Math.abs(rms(trace(p, { inst: 0, along: 0, alongLevel: 1, bpm: 140 }, ['lF'], 6)[0]) / lead - 1) < 1e-9, 'it does nothing while Plays along is None');
  const gu = (l) => rms(trace(p, { inst: 0, along: 0, alongLevel: l, bpm: 140 }, ['lAl'], 2)[0]);
  assert.equal(gu(1), 0);
});

test('Drums along: the steady beat is silent at 0, sparser at low intensity, follows speed and length, and is the one along voice', () => {
  const p = tiny(), D = 6;
  assert.equal(rms(trace(p, { along: D, alongLevel: 0, bpm: 140 }, ['lAl'], 5)[0]), 0, 'silent at 0');
  const lvl = (intensity, alongLevel = 0.6) => rms(trace(p, { along: D, intensity, alongLevel, bpm: 140 }, ['lAl'], 6)[0]);
  assert.ok(lvl(1) > 0.01, 'not silent');
  assert.ok(lvl(0.5) < lvl(1) && lvl(0.1) < lvl(0.5) && lvl(0.1) > 0, 'only the hat at the bottom, kick in the middle, kick, snare and hat at full');
  assert.ok(Math.abs(lvl(1, 1) / lvl(1) - 1 / 0.6) < 1e-6);
  const hits = (id, params, sr = 4000) => { const v = run(p, params, sr), i = v.nodeIds.indexOf(id); let n = 0, first = []; for (let s = 0, m = Math.round(v.duration * sr); s < m; s++) { v.tick(); if (v.nodeValues[i] > 0) { n++; if (first.length < 3) first.push(s / sr); } } return { n, first }; };
  assert.equal(hits('lDrK', { along: D, bars: 16, bpm: 140 }).n, 16 * 2, 'two kicks a bar for the whole length');
  assert.equal(hits('lDrS', { along: D, bars: 8, bpm: 140 }).n, 8 * 2);
  assert.equal(hits('lDrH', { along: D, bars: 8, bpm: 140 }).n, 8 * 8);
  const a = hits('lDrH', { along: D, bpm: 100 }).first[1], b = hits('lDrH', { along: D, bpm: 140 }).first[1];
  assert.ok(Math.abs(a / b - 1.4) < 0.02, 'follows Speed');
  // one along voice at a time: Drums replace a chord or bass along, and the melody instrument may be any
  for (let inst = 0; inst < 10; inst++) {
    const r = renderPatch(p, { sampleRate: 6000, params: { inst, along: D, bpm: 140 } });
    assert.ok(r.badSamples === 0 && rms(r.channels[0]) > 0.02 && r.rawPeak < 0.95, `${INSTRUMENTS[inst]} with drums along`);
  }
  assert.equal(trace(p, { inst: 6, along: D, bpm: 140 }, ['lPiO'], 1)[0].some((x) => x !== 0), true, 'the melody instrument still plays');
});

test('Plays along at None adds nothing at all: its part is exactly zero', () => {
  const [al] = trace(tiny(), { inst: 6, along: 0 }, ['lAl'], 3);
  assert.ok(al.every((x) => x === 0));
});

test('along plays the chords of the track, in its key, at its speed, for its length', () => {
  const p = tiny(), bar = (bpm) => 240 / bpm;
  // Bass plays the chord root: C in bar 1, F in bar 2, G in bar 3 (the track is "C F | G C"), folded into the octave from midi 36
  const hzAt = (key, bpm, barNumber) => { const t = (barNumber - 1 + 1.5 / 16) * bar(bpm), v = run(p, { along: 5, key, bpm }, 4000); for (let s = 0; s < t * 4000; s++) v.tick(); return v.nodeValues[v.nodeIds.indexOf('lBaFq')]; };
  const midiHz = (n) => 440 * 2 ** ((n - 69) / 12);
  assert.ok(Math.abs(hzAt(0, 120, 1) - midiHz(36)) < 0.01, 'C');
  assert.ok(Math.abs(hzAt(0, 120, 2) - midiHz(41)) < 0.01, 'F');
  assert.ok(Math.abs(hzAt(0, 120, 3) - midiHz(43)) < 0.01, 'G');
  assert.ok(Math.abs(hzAt(2, 120, 1) - midiHz(38)) < 0.01, 'the Key control moves it two semitones');
  assert.ok(Math.abs(hzAt(-3, 120, 2) - midiHz(38)) < 0.01, 'and down, by whole semitones (F is 41, 3 lower is 38)');
  assert.ok(Math.abs(hzAt(0, 140, 2) - midiHz(41)) < 0.01, 'the chord still lands in bar 2 at another speed');
  // the chord a guitar picks is the bar's own: bar 1 root, third and fifth are C, E and G
  const pcs = (barNumber) => { const v = run(p, { along: 1, bpm: 120 }, 4000), seen = new Set(), t0 = (barNumber - 1) * bar(120) * 4000, t1 = barNumber * bar(120) * 4000; for (let s = 0; s < t1; s++) { v.tick(); if (s >= t0 && v.nodeValues[v.nodeIds.indexOf('lGuTg')] > 0) seen.add(Math.round(12 * Math.log2(v.nodeValues[v.nodeIds.indexOf('lGuFq')] / 440)) + 9 + 120); } return [...seen].map((n) => n % 12).sort((a, b) => a - b); };
  assert.deepEqual(pcs(1), [0, 4, 7], 'C E G in the C bar');
  assert.deepEqual(pcs(2), [0, 5, 9], 'F A C in the F bar');
  // speed: the gate pulses of the bass come 1.4 times closer at 140 than at 100 bpm; length: they go on for the whole of a longer piece
  const gates = (params) => { const [g] = trace(p, params, ['lAlBaG'], 2.5); const at = []; g.forEach((x, i) => { if (x > 0) at.push(i / 8000); }); return at; };
  const slow = gates({ along: 5, bpm: 100 }), fast = gates({ along: 5, bpm: 140 });
  assert.ok(Math.abs(slow[2] / fast[2] - 1.4) < 0.02, `ratio ${slow[2] / fast[2]}`);
  const v16 = run(p, { along: 5, bars: 16, bpm: 140 }, 2000); let pulses = 0; const gi = v16.nodeIds.indexOf('lAlBaG');
  for (let s = 0, n = Math.round(v16.duration * 2000); s < n; s++) { v16.tick(); if (v16.nodeValues[gi] > 0) pulses++; }
  assert.equal(pulses, 16 * 3, 'three bass notes in each of 16 bars');
});

test('along is quieter at low intensity: 0.55 of its level at 0, all of it at 1', () => {
  const p = tiny(), level = (intensity) => rms(trace(p, { along: 3, intensity, bpm: 140 }, ['lAl'], 6)[0]);
  const full = level(1);
  assert.ok(full > 0.01);
  assert.ok(Math.abs(level(0) / full - 0.55) < 0.03, `at 0: ${level(0) / full}`);
  assert.ok(level(0.5) < level(1) && level(0.5) > level(0));
});

test('along the same as the melody instrument plays nothing (and the melody does not change): one voice cannot play two parts', () => {
  const p = matchedPatch();
  for (let k = 0; k < 5; k++) {
    const inst = 5 + k, along = k + 1;
    const [al] = trace(p, { inst, along, bpm: 140 }, ['lAl'], 3);
    assert.ok(al.every((x) => x === 0), `${INSTRUMENTS[inst]} along ${ALONG[along]}: nothing added`);
    const a = renderPatch(p, { sampleRate: 6000, params: { inst, along, bpm: 140 } }).channels[0], b = renderPatch(p, { sampleRate: 6000, params: { inst, along: 0, bpm: 140 } }).channels[0];
    let worst = 0; for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    assert.equal(worst, 0, `${INSTRUMENTS[inst]} along itself sounds exactly as with None`);
  }
});

test('Bass plays the tune an octave lower than the other instruments', () => {
  const p = tiny();
  const hz = (inst) => trace(p, { inst, bpm: 120 }, [inst === 9 ? 'lBaFq' : 'lP'], 0.2)[0][600];
  assert.ok(Math.abs(hz(9) / hz(0) - 0.5) < 1e-3);
});

test('the six pairs name real choices, and each sounds sensible: levelled, not clipping, and no louder than 3.5 dB over the melody', () => {
  assert.deepEqual(PAIRS.map((q) => q.label), ['Guitar + Bass', 'Piano + Violin', 'Piano + Bass', 'Flute + Guitar', 'Trumpet + Piano', 'Bell + Piano', 'Guitar + Drums', 'Piano + Drums']);
  const p = matchedPatch(), solo = levelsWith(0);
  for (const pair of PAIRS) {
    const inst = INSTRUMENTS.indexOf(pair.inst), along = ALONG.indexOf(pair.along);
    assert.ok(inst >= 0 && along > 0 && inst !== along + 4, pair.label);
    const withAlong = levelsWith(along)[inst];
    assert.ok(withAlong.db - solo[inst].db > 0.5 && withAlong.db - solo[inst].db < 3.5, `${pair.label}: ${(withAlong.db - solo[inst].db).toFixed(2)} dB over the melody alone`);
    const r = renderPatch(p, { sampleRate: SR, params: { inst, along, bpm: 140 } });
    assert.ok(r.badSamples === 0 && r.rawPeak < 0.95 && rms(r.channels[0]) > 0.02, `${pair.label}: peak ${r.rawPeak}`);
    assert.ok(Math.abs(withAlong.dc) < 0.05, `${pair.label}: no DC offset`);
  }
});

test('two of the same instrument (along equal to the melody) leave no click: the melody is as smooth as without it', () => {
  const p = matchedPatch(), step = (a) => { let m = 0; for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1])); return m; };
  for (const k of [0, 1, 4]) {
    const same = renderPatch(p, { sampleRate: SR, params: { inst: 5 + k, along: k + 1, bpm: 140 } }).channels[0];
    const none = renderPatch(p, { sampleRate: SR, params: { inst: 5 + k, along: 0, bpm: 140 } }).channels[0];
    assert.ok(step(same) <= step(none) * 1.0001, `${INSTRUMENTS[5 + k]}`);
  }
});
